import { GraphAuditService } from "./graph-audit-service";
import { GraphOperationService } from "./graph-operation-service";
import { GraphStore } from "./graph-store";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Phase1SelfCheck failed: ${message}`);
  }
}

/**
 * Lightweight, framework-free checks for Phase 1 behavior.
 *
 * Call this from a local dev harness or temporary script while wiring test infra.
 */
export function runPhase1SelfCheck(): void {
  const store = new GraphStore();
  const audit = new GraphAuditService();
  const ops = new GraphOperationService(store, audit);

  const tx1 = ops.runTransaction({
    actor: "self-check",
    expectedRevision: 0,
    operations: [
      {
        type: "createNode",
        node: {
          id: "n1",
          layer: "L1",
          name: "Node 1",
          rect: { x: 0, y: 0, w: 100, h: 60 },
        },
      },
      {
        type: "createNode",
        node: {
          id: "n2",
          layer: "L1",
          name: "Node 2",
          rect: { x: 300, y: 200, w: 120, h: 80 },
        },
      },
    ],
  });
  assert(tx1.applied, "createNode transaction should apply");
  assert(tx1.newRevision === 1, "revision should increment on success");

  const txConflict = ops.runTransaction({
    actor: "self-check",
    expectedRevision: 0,
    operations: [],
  });
  assert(!txConflict.applied, "stale expectedRevision should fail");
  assert(txConflict.errors?.[0]?.code === "REVISION_CONFLICT", "conflict code mismatch");

  const txInvalidEdge = ops.runTransaction({
    actor: "self-check",
    expectedRevision: 1,
    operations: [
      {
        type: "createEdge",
        edge: {
          id: "e1",
          from: "n1",
          to: "missing",
          kind: "depends",
        },
      },
    ],
  });

  assert(!txInvalidEdge.applied, "invalid edge endpoints should fail");
  assert(store.listEdges().length === 0, "failed tx must not leave partial writes");
  assert(audit.list().length >= 3, "audit records should be generated for each transaction");
}
