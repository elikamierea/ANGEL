export interface TopBarStatus {
  unsaved: boolean;
  hasConflicts: boolean;
  agentBusy: boolean;
  buildRunning: boolean;
}

export class TopBarStatusService {
  private state: TopBarStatus = {
    unsaved: false,
    hasConflicts: false,
    agentBusy: false,
    buildRunning: false,
  };

  get(): TopBarStatus {
    return { ...this.state };
  }

  patch(patch: Partial<TopBarStatus>): TopBarStatus {
    this.state = { ...this.state, ...patch };
    return this.get();
  }
}
