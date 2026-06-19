import { AgentSessionManager } from "../agent-system/agent-session-manager";
import { InMemoryPersistence } from "../infra/app-persistence";
import { ConsoleHostController } from "./console-host-controller";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Phase6SelfCheck failed: ${message}`);
  }
}

export function runPhase6SelfCheck(): void {
  const sessions = new AgentSessionManager();
  const persistence = new InMemoryPersistence();

  const host1 = new ConsoleHostController(sessions, persistence);
  host1.mount();

  const sessionId = host1.createSession("Programmer", "M5 Session");
  sessions.appendMessage(sessionId, "user", "hello", "done");

  host1.switchMode("floating");
  host1.moveFloating(260, 180);
  host1.resizeFloating(1024, 640);
  host1.switchMode("chat");
  host1.switchMode("docked");
  host1.unmount();

  const host2 = new ConsoleHostController(sessions, persistence);
  host2.mount();

  const state = host2.store.getState();
  assert(state.mode === "docked", "latest mode should be restored");
  assert(state.floating.width === 1024 && state.floating.height === 640, "floating size should persist");
  assert(state.floating.x === 260 && state.floating.y === 180, "floating position should persist");
  assert(state.activeSessionId === sessionId, "active session should persist");

  const restoredSession = sessions.getSession(sessionId);
  assert(!!restoredSession, "session should still exist");
  assert((restoredSession?.messages.length ?? 0) >= 1, "message timeline should survive mode switches");
}
