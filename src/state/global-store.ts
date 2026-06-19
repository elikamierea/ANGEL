// Global app state skeleton + lightweight store (Phase 0)

export interface LayoutState {
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  activeLayer: "L0" | "L1" | "L2" | "L3";
}

export interface GlobalState {
  layout: LayoutState;
}

export const initialGlobalState: GlobalState = {
  layout: {
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    activeLayer: "L0",
  },
};

type Listener = (state: GlobalState) => void;

function cloneState(state: GlobalState): GlobalState {
  return {
    layout: {
      ...state.layout,
    },
  };
}

export class GlobalStore {
  private state: GlobalState;
  private listeners = new Set<Listener>();

  constructor(seed: GlobalState = initialGlobalState) {
    this.state = cloneState(seed);
  }

  getState(): GlobalState {
    return cloneState(this.state);
  }

  hydrate(next: GlobalState): void {
    this.state = cloneState(next);
    this.emit();
  }

  reset(): void {
    this.state = cloneState(initialGlobalState);
    this.emit();
  }

  setLayout(patch: Partial<LayoutState>): void {
    this.state = {
      ...this.state,
      layout: {
        ...this.state.layout,
        ...patch,
      },
    };

    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
