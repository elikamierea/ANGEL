import { GraphStore } from "../graph-domain/graph-store";
import { GraphAuditService } from "../graph-domain/graph-audit-service";
import { GraphOperationService } from "../graph-domain/graph-operation-service";

export function runRecoverySafetyCheck(): void {
  const store = new GraphStore();
  const audit = new GraphAuditService();
  const ops = new GraphOperationService(store, audit);

  ops.runTransaction({
    actor: "hardening",
    expectedRevision: 0,
    operations: [
      {
        type: "createNode",
        node: { id: "n-safe", layer: "L1", name: "Safe", rect: { x: 0, y: 0, w: 10, h: 10 } },
      },
    ],
  });

  const snapshot = store.exportSnapshot();

  // Simulate accidental conflicting operation
  const conflict = ops.runTransaction({
    actor: "hardening",
    expectedRevision: 0,
    operations: [],
  });

  if (conflict.applied) {
    throw new Error("RecoverySafetyCheck failed: expected conflict");
  }

  // Roll back to known-good snapshot
  store.importSnapshot(snapshot, snapshot.revision);
}
