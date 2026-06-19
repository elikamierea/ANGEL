import { AppPersistence } from "../infra/app-persistence";
import { AgentConsoleHostState } from "./console-host-types";

export class ConsoleHostPersistence {
  constructor(private readonly persistence: AppPersistence) {}

  load(): AgentConsoleHostState | null {
    return this.persistence.load<AgentConsoleHostState>();
  }

  save(state: AgentConsoleHostState): void {
    this.persistence.save(state);
  }

  clear(): void {
    this.persistence.clear();
  }
}
