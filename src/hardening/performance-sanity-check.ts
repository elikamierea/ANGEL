import { GraphStore } from "../graph-domain/graph-store";
import { GraphAuditService } from "../graph-domain/graph-audit-service";
import { GraphOperationService } from "../graph-domain/graph-operation-service";

export function runPerformanceSanityCheck(nodeCount = 500): void {
  const store = new GraphStore();
  const audit = new GraphAuditService();
  const ops = new GraphOperationService(store, audit);

  const operations = Array.from({ length: nodeCount }).map((_, i) => ({
    type: "createNode" as const,
    node: {
      id: `n-${i}`,
      layer: "L2" as const,
      name: `Node ${i}`,
      rect: { x: i * 2, y: i * 2, w: 10, h: 10 },
    },
  }));

  const t0 = Date.now();
  const result = ops.runTransaction({
    actor: "perf",
    expectedRevision: 0,
    operations,
  });
  const dt = Date.now() - t0;

  if (!result.applied) {
    throw new Error("PerformanceSanityCheck failed: transaction did not apply");
  }

  if (dt > 1500) {
    throw new Error(`PerformanceSanityCheck failed: too slow (${dt}ms)`);
  }
}
