import { AgentSessionManager } from "./agent-session-manager";
import { AgentId, AgentStructuredResponse, ContextPackPreview } from "./agent-types";

export interface GatewaySendInput {
  sessionId: string;
  prompt: string;
  contextPack: ContextPackPreview;
}

export interface AgentExecutor {
  execute(input: {
    agentId: AgentId;
    prompt: string;
    contextPack: ContextPackPreview;
    modelContextText: string;
  }): Promise<AgentStructuredResponse>;
}

function toContextLine(role: "user" | "assistant" | "system", text: string): string {
  return `[${role}] ${text.replace(/\s+/g, " ").trim()}`;
}

function buildModelContextText(input: {
  contextSummary: string;
  messages: Array<{ role: "user" | "assistant" | "system"; text: string }>;
  maxChars?: number;
}): string {
  const lines = [`[context] ${input.contextSummary}`];
  for (const message of input.messages) {
    lines.push(toContextLine(message.role, message.text));
  }

  const maxChars = input.maxChars ?? 8_000;
  let joined = lines.join("\n");
  if (joined.length <= maxChars) return joined;

  const trimmedLines: string[] = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const extra = line.length + (trimmedLines.length > 0 ? 1 : 0);
    if (used + extra > maxChars) break;
    trimmedLines.unshift(line);
    used += extra;
  }

  return trimmedLines.join("\n");
}

export class AgentRequestGateway {
  constructor(
    private readonly sessions: AgentSessionManager,
    private readonly executor: AgentExecutor
  ) {}

  async send(input: GatewaySendInput): Promise<AgentStructuredResponse> {
    const session = this.sessions.getSession(input.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    this.sessions.appendMessage(input.sessionId, "user", input.prompt, "done", {
      contextSummary: input.contextPack.summary,
    });

    const pending = this.sessions.appendMessage(input.sessionId, "assistant", "Processing...", "pending");

    try {
      this.sessions.updateMessageStatus(input.sessionId, pending.id, "streaming");

      const latestSession = this.sessions.getSession(input.sessionId);
      const modelContextText = buildModelContextText({
        contextSummary: input.contextPack.summary,
        messages: (latestSession?.messages ?? []).map((m) => ({ role: m.role, text: m.text })),
      });

      const response = await this.executor.execute({
        agentId: session.agentId,
        prompt: input.prompt,
        contextPack: input.contextPack,
        modelContextText,
      });

      this.sessions.updateMessageStatus(input.sessionId, pending.id, "done");
      this.sessions.appendMessage(input.sessionId, "assistant", response.summary, "done", {
        structured: response,
      });

      return response;
    } catch (error) {
      this.sessions.updateMessageStatus(input.sessionId, pending.id, "error");
      this.sessions.appendMessage(input.sessionId, "assistant", "Request failed", "error", {
        error: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  }
}
