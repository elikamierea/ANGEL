import { AuditRecord } from "../shared/types";

export class GraphAuditService {
  private records: AuditRecord[] = [];

  append(record: AuditRecord): void {
    this.records.push(record);
  }

  list(): AuditRecord[] {
    return [...this.records];
  }

  latest(): AuditRecord | undefined {
    return this.records[this.records.length - 1];
  }

  clear(): void {
    this.records = [];
  }
}
