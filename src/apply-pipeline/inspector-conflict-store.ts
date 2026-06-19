import { ConflictPanelItem } from "./apply-types";

function now(): string {
  return new Date().toISOString();
}

function makeId(): string {
  return `conflict-${Math.random().toString(36).slice(2, 10)}`;
}

export class InspectorConflictStore {
  private items: ConflictPanelItem[] = [];

  add(target: ConflictPanelItem["target"], message: string, remediation: string): ConflictPanelItem {
    const item: ConflictPanelItem = {
      id: makeId(),
      target,
      message,
      remediation,
      createdAt: now(),
      resolved: false,
    };

    this.items.unshift(item);
    return { ...item };
  }

  list(includeResolved = false): ConflictPanelItem[] {
    return this.items.filter((it) => includeResolved || !it.resolved).map((it) => ({ ...it }));
  }

  resolve(conflictId: string): void {
    const target = this.items.find((it) => it.id === conflictId);
    if (!target) {
      throw new Error(`Conflict not found: ${conflictId}`);
    }

    target.resolved = true;
  }

  clearResolved(): void {
    this.items = this.items.filter((it) => !it.resolved);
  }
}
