import { Id } from "../shared/types";

export interface SelectionState {
  selectedIds: Id[];
  source: "canvas" | "sidebar" | "system";
}

export class SelectionStore {
  private state: SelectionState = {
    selectedIds: [],
    source: "system",
  };

  getState(): SelectionState {
    return {
      selectedIds: [...this.state.selectedIds],
      source: this.state.source,
    };
  }

  setSelection(ids: Id[], source: SelectionState["source"]): void {
    this.state = {
      selectedIds: [...ids],
      source,
    };
  }

  clear(source: SelectionState["source"] = "system"): void {
    this.state = {
      selectedIds: [],
      source,
    };
  }
}
