import { MemoryPersistenceFactory } from "../infra/persistence-factory";
import { BootstrapApp } from "./bootstrap-app";
import { createCompositionRoot } from "./composition-root";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Phase9BootstrapSelfCheck failed: ${message}`);
  }
}

export async function runPhase9BootstrapSelfCheck(): Promise<void> {
  const persistenceFactory = new MemoryPersistenceFactory();

  const root1 = createCompositionRoot({ persistenceFactory });
  const app1 = new BootstrapApp({ services: root1 });
  app1.mount();

  const sid = root1.consoleHost.createSession("Programmer", "Bootstrap smoke");

  const preview = root1.contextBuilder.buildPreview({
    sessionId: sid,
    activeLayer: "L2",
    selectedNodeIds: ["n-boot"],
    constraints: ["src/game/** only"],
    fileSnippets: [{ path: "src/game/main.cpp", snippet: "// demo" }],
  });

  await root1.requestGateway.send({
    sessionId: sid,
    prompt: "hello bootstrap",
    contextPack: preview,
  });

  root1.topbarStatus.patch({ agentBusy: true, unsaved: true });
  const status = root1.topbarStatus.get();
  assert(status.agentBusy && status.unsaved, "topbar status should be patchable");

  app1.unmount();

  const root2 = createCompositionRoot({ persistenceFactory });
  const app2 = new BootstrapApp({ services: root2 });
  app2.mount();

  assert(root2.sessions.listSessions().length >= 1, "session state should restore after remount");
  assert(root2.consoleHost.store.getState().activeSessionId !== null, "active session should restore in console host");

  app2.unmount();
}

runPhase9BootstrapSelfCheck()
  .then(() => {
    console.log("[phase9-bootstrap-self-check] ok");
  })
  .catch((error) => {
    console.error("[phase9-bootstrap-self-check] failed", error);
    process.exitCode = 1;
  });
