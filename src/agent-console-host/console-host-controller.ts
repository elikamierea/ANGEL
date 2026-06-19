import { AgentSessionManager } from "../agent-system/agent-session-manager";
import { AppPersistence, InMemoryPersistence } from "../infra/app-persistence";
import { ConsoleHostPersistence } from "./console-host-persistence";
import { ConsoleHostStore, initialConsoleHostState } from "./console-host-store";
import { ConsoleHostMode } from "./console-host-types";

const PERSIST_KEY = "angel.console-host.v1";

export class ConsoleHostController {
  readonly store: ConsoleHostStore;
  private readonly persistence: ConsoleHostPersistence;
  private unsubscribe: (() => void) | null = null;

  constructor(
    readonly sessions: AgentSessionManager,
    persistence?: AppPersistence
  ) {
    const backend = persistence ?? new InMemoryPersistence();
    this.persistence = new ConsoleHostPersistence(backend);
    this.store = new ConsoleHostStore(initialConsoleHostState);
  }

  mount(): void {
    const restored = this.persistence.load();
    if (restored) {
      this.store.hydrate(restored);
    }

    this.unsubscribe = this.store.subscribe((state) => {
      this.persistence.save(state);
    });
  }

  unmount(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  switchMode(mode: ConsoleHostMode): void {
    this.store.setMode(mode);
  }

  resizeFloating(width: number, height: number): void {
    this.store.setFloatingRect({ width, height });
  }

  moveFloating(x: number, y: number): void {
    this.store.setFloatingRect({ x, y });
  }

  activateSession(sessionId: string): void {
    this.store.setActiveSession(sessionId);
  }

  createSession(agent: "Designer" | "Orchestrator" | "Programmer" | "ResourceProvider", title?: string): string {
    const session = this.sessions.createSession(agent, title);
    this.store.setActiveSession(session.id);
    return session.id;
  }

  getPersistKey(): string {
    return PERSIST_KEY;
  }
}
