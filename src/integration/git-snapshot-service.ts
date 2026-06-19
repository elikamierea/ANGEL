export interface SnapshotRecord {
  id: string;
  tag: string;
  createdAt: string;
  note?: string;
}

function makeId(): string {
  return `snap-${Math.random().toString(36).slice(2, 10)}`;
}

function tsSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export class GitSnapshotService {
  private records: SnapshotRecord[] = [];

  createDowncastSnapshot(from: string, to: string, note?: string): SnapshotRecord {
    const createdAt = new Date().toISOString();
    const tag = `downcast/${from}-to-${to}/${tsSlug()}`;
    const record: SnapshotRecord = {
      id: makeId(),
      tag,
      createdAt,
      note,
    };
    this.records.unshift(record);
    return { ...record };
  }

  list(): SnapshotRecord[] {
    return this.records.map((it) => ({ ...it }));
  }
}
