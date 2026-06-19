import { AgentSession } from "../agent-system/agent-types";
import { AppPersistence } from "../infra/app-persistence";
import { AppServices, createCompositionRoot } from "./composition-root";

interface BootstrapOptions {
  services?: AppServices;
  sessionsPersistence?: AppPersistence;
}

const SESSIONS_KEY = "angel.agent-sessions.v1";

export class BootstrapApp {
  readonly services: AppServices;
  private sessionsPersistence: AppPersistence;
  private unsubSessions: (() => void) | null = null;

  constructor(options: BootstrapOptions = {}) {
    this.services = options.services ?? createCompositionRoot();
    this.sessionsPersistence = options.sessionsPersistence ?? this.services.persistenceFactory.create(SESSIONS_KEY);
  }

  mount(): void {
    this.services.appShell.mount();

    const restoredSessions = this.sessionsPersistence.load<AgentSession[]>();
    if (restoredSessions && restoredSessions.length > 0) {
      this.services.sessions.importState(restoredSessions);
    }

    this.unsubSessions = this.services.sessions.subscribe((snapshot) => {
      this.sessionsPersistence.save(snapshot);
    });

    this.services.consoleHost.mount();
  }

  unmount(): void {
    if (this.unsubSessions) {
      this.unsubSessions();
      this.unsubSessions = null;
    }

    this.sessionsPersistence.save(this.services.sessions.exportState());
    this.services.consoleHost.unmount();
    this.services.appShell.unmount();
  }
}
