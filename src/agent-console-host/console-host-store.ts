import { AgentConsoleHostState, ConsoleHostMode, FloatingWindowState } from "./console-host-types";

const DEFAULT_FLOATING: FloatingWindowState = {
  x: 120,
  y: 120,
  width: 760,
  height: 520,
};

export const initialConsoleHostState: AgentConsoleHostState = {
  mode: "docked",
  floating: { ...DEFAULT_FLOATING },
  activeSessionId: null,
};

type Listener = (state: AgentConsoleHostState) => void;

function clone(state: AgentConsoleHostState): AgentConsoleHostState {
  return {
    mode: state.mode,
    activeSessionId: state.activeSessionId,
    floating: { ...state.floating },
  };
}

export class ConsoleHostStore {
  private state: AgentConsoleHostState;
  private listeners = new Set<Listener>();

  constructor(seed: AgentConsoleHostState = initialConsoleHostState) {
    this.state = clone(seed);
  }

  getState(): AgentConsoleHostState {
    return clone(this.state);
  }

  setMode(mode: ConsoleHostMode): void {
    this.state = { ...this.state, mode };
    this.emit();
  }

  setFloatingRect(patch: Partial<FloatingWindowState>): void {
    this.state = {
      ...this.state,
      floating: {
        ...this.state.floating,
        ...patch,
      },
    };
    this.emit();
  }

  setActiveSession(sessionId: string | null): void {
    this.state = {
      ...this.state,
      activeSessionId: sessionId,
    };
    this.emit();
  }

  hydrate(state: AgentConsoleHostState): void {
    this.state = clone(state);
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
