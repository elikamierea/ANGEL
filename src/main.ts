import { BootstrapApp } from "./bootstrap/bootstrap-app";
import { createCompositionRoot } from "./bootstrap/composition-root";

async function main(): Promise<void> {
  const root = createCompositionRoot();
  const app = new BootstrapApp({ services: root });

  app.mount();

  const sessionId = root.consoleHost.createSession("Orchestrator", "Minimal Runtime Session");
  const preview = root.contextBuilder.buildPreview({
    sessionId,
    activeLayer: "L1",
    selectedNodeIds: [],
    constraints: ["src/game/** only", "block APIs only"],
    fileSnippets: [],
  });

  await root.requestGateway.send({
    sessionId,
    prompt: "Bootstrap runtime is up.",
    contextPack: preview,
  });

  const session = root.sessions.getSession(sessionId);
  console.log("[main] app mounted");
  console.log("[main] active session:", sessionId);
  console.log("[main] message count:", session?.messages.length ?? 0);
  console.log("[main] topbar status:", root.topbarStatus.get());

  // Minimal runnable target: startup + assembly + one request loop.
  app.unmount();
  console.log("[main] app unmounted");
}

main().catch((error) => {
  console.error("[main] fatal", error);
  process.exitCode = 1;
});
