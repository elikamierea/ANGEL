import { GraphAuditService } from "../graph-domain/graph-audit-service";
import { GraphOperationService } from "../graph-domain/graph-operation-service";
import { GraphStore } from "../graph-domain/graph-store";
import { BlockRegistry } from "../code-block/block-registry";
import { BlockToolAdapter } from "../code-block/block-tool-adapter";
import { ApplyResultService } from "./apply-result-service";
import { InspectorConflictStore } from "./inspector-conflict-store";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Phase5SelfCheck failed: ${message}`);
  }
}

export function runPhase5SelfCheck(): void {
  const graphStore = new GraphStore();
  const graphAudit = new GraphAuditService();
  const graphOps = new GraphOperationService(graphStore, graphAudit);

  const registry = new BlockRegistry();
  registry.seedFile("src/game/player.cpp", "//{MOVE_IMPL}_BEGIN\nvoid Player::move() {}\n//{MOVE_IMPL}_END", 0);
  const adapter = new BlockToolAdapter(registry);

  const apply = new ApplyResultService(graphOps, graphAudit, adapter);
  const conflicts = new InspectorConflictStore();

  const graphOk = apply.apply({
    actor: "Programmer",
    target: "graph",
    expectedRevision: 0,
    payload: {
      operations: [
        {
          type: "createNode",
          node: { id: "n1", layer: "L2", name: "Task", rect: { x: 0, y: 0, w: 80, h: 40 } },
        },
      ],
    },
  });
  assert(graphOk.applied, "graph apply should succeed");

  const graphConflict = apply.apply({
    actor: "Programmer",
    target: "graph",
    expectedRevision: 0,
    payload: { operations: [] },
  });
  assert(!graphConflict.applied, "graph stale revision should conflict");
  conflicts.add("graph", graphConflict.conflicts[0].message, graphConflict.conflicts[0].remediation);

  const codeConflict = apply.apply({
    actor: "Programmer",
    target: "code",
    expectedRevision: 3,
    payload: {
      blockId: "src/game/player.cpp#MOVE_IMPL",
      newContent: "void Player::move(){ /* v2 */ }",
    },
  });
  assert(!codeConflict.applied, "code stale revision should conflict");
  conflicts.add("code", codeConflict.conflicts[0].message, codeConflict.conflicts[0].remediation);

  const codeRetry = apply.retryWithLatest({
    actor: "Programmer",
    target: "code",
    expectedRevision: 3,
    payload: {
      blockId: "src/game/player.cpp#MOVE_IMPL",
      newContent: "void Player::move(){ /* retried */ }",
    },
  });
  assert(codeRetry.applied, "retry with latest should recover code apply");

  const activeConflicts = conflicts.list();
  assert(activeConflicts.length === 2, "conflicts should be visible in inspector store");

  conflicts.resolve(activeConflicts[0].id);
  assert(conflicts.list().length === 1, "resolved conflict should be hidden by default");
}
