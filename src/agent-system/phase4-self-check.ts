import { AgentRequestGateway, AgentExecutor } from "./agent-request-gateway";
import { AgentSessionManager } from "./agent-session-manager";
import { ContextPackBuilder } from "./context-pack-builder";
import { StructuredResponseRenderer } from "./structured-response-renderer";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Phase4SelfCheck failed: ${message}`);
  }
}

class FakeExecutor implements AgentExecutor {
  async execute(_input: {
    agentId: "Designer" | "Orchestrator" | "Programmer" | "ResourceProvider";
    prompt: string;
    contextPack: import("./agent-types").ContextPackPreview;
    modelContextText: string;
  }): Promise<{
    summary: string;
    actions: string[];
    affectedTargets: string[];
    result: "ok";
    risks: string[];
    nextStep: string;
  }> {
    return {
      summary: "Planned next implementation step.",
      actions: ["Split task", "Prepare code blocks"],
      affectedTargets: ["src/game/player.cpp#MOVE_IMPL"],
      result: "ok",
      risks: ["None critical"],
      nextStep: "Apply to code blocks",
    };
  }
}

export async function runPhase4SelfCheck(): Promise<void> {
  const sessionManager = new AgentSessionManager();
  const builder = new ContextPackBuilder();
  const renderer = new StructuredResponseRenderer();

  const session = sessionManager.createSession("Orchestrator", "M3 Smoke");
  sessionManager.setDraft(session.id, "Draft prompt...");

  const preview = builder.buildPreview({
    sessionId: session.id,
    activeLayer: "L2",
    selectedNodeIds: ["node-1", "node-2"],
    constraints: ["Write only src/game/**", "Use block APIs only"],
    fileSnippets: [{ path: "src/game/player.cpp", snippet: "// snippet" }],
  });

  assert(preview.estimatedChars > 0, "context preview should estimate size");

  const gateway = new AgentRequestGateway(sessionManager, new FakeExecutor());
  const response = await gateway.send({
    sessionId: session.id,
    prompt: "Generate implementation plan",
    contextPack: preview,
  });

  const rendered = renderer.render(response);
  assert(rendered.includes("Summary:"), "structured renderer should output summary");

  const latest = sessionManager.getSession(session.id);
  assert(!!latest, "session should still exist");
  assert((latest?.messages.length ?? 0) >= 3, "message timeline should include user + pending + result");

  const exported = sessionManager.exportState();
  const clonedManager = new AgentSessionManager();
  clonedManager.importState(exported);
  assert(clonedManager.listSessions().length === 1, "session history should survive import/export");
}
