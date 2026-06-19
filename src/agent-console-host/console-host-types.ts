export type ConsoleHostMode = "docked" | "floating" | "chat";

export interface FloatingWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AgentConsoleHostState {
  mode: ConsoleHostMode;
  floating: FloatingWindowState;
  activeSessionId: string | null;
}
