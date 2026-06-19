import {
  AuditRecord,
  GraphEdge,
  GraphError,
  GraphNode,
  GraphOperation,
  GraphSnapshot,
  Id,
  TransactionResult,
} from "../shared/types";
import { GraphAuditService } from "./graph-audit-service";
import { GraphStore } from "./graph-store";

interface WorkingGraph {
  nodes: Map<Id, GraphNode>;
  edges: Map<Id, GraphEdge>;
}

function indexSnapshot(snapshot: GraphSnapshot): WorkingGraph {
  return {
    nodes: new Map(snapshot.nodes.map((n) => [n.id, { ...n, rect: { ...n.rect } }])),
    edges: new Map(snapshot.edges.map((e) => [e.id, { ...e }])),
  };
}

function materializeSnapshot(working: WorkingGraph, revision: number): GraphSnapshot {
  return {
    revision,
    nodes: [...working.nodes.values()].map((n) => ({ ...n, rect: { ...n.rect } })),
    edges: [...working.edges.values()].map((e) => ({ ...e })),
  };
}

function makeError(code: GraphError["code"], message: string): GraphError {
  return { code, message };
}

export class GraphOperationService {
  constructor(
    private readonly store: GraphStore,
    private readonly auditService: GraphAuditService
  ) {}

  runTransaction(params: {
    actor: string;
    expectedRevision: number;
    operations: GraphOperation[];
  }): TransactionResult {
    const { actor, expectedRevision, operations } = params;
    const startRevision = this.store.getRevision();

    if (startRevision !== expectedRevision) {
      const error = makeError("REVISION_CONFLICT", "Revision mismatch while starting transaction.");
      this.recordAudit({
        actor,
        expectedRevision,
        operationCount: operations.length,
        applied: false,
        result: "error",
        errors: [error],
      });

      return {
        applied: false,
        newRevision: startRevision,
        errors: [error],
      };
    }

    const before = this.store.exportSnapshot();
    const working = indexSnapshot(before);

    const errors: GraphError[] = [];

    for (const operation of operations) {
      const opError = this.applyOperation(working, operation);
      if (opError) {
        errors.push(opError);
        break;
      }
    }

    if (errors.length > 0) {
      this.recordAudit({
        actor,
        expectedRevision,
        operationCount: operations.length,
        applied: false,
        result: "error",
        before,
        errors,
      });

      return {
        applied: false,
        newRevision: this.store.getRevision(),
        errors,
      };
    }

    const newRevision = startRevision + 1;
    const after = materializeSnapshot(working, newRevision);
    this.store.importSnapshot(after, newRevision);

    this.recordAudit({
      actor,
      expectedRevision,
      operationCount: operations.length,
      applied: true,
      result: "ok",
      before,
      after,
    });

    return {
      applied: true,
      newRevision,
    };
  }

  private applyOperation(working: WorkingGraph, operation: GraphOperation): GraphError | null {
    switch (operation.type) {
      case "createNode": {
        if (working.nodes.has(operation.node.id)) {
          return makeError("NODE_ALREADY_EXISTS", `Node already exists: ${operation.node.id}`);
        }

        working.nodes.set(operation.node.id, {
          ...operation.node,
          rect: { ...operation.node.rect },
          revision: 1,
        });
        return null;
      }

      case "updateNode": {
        const node = working.nodes.get(operation.nodeId);
        if (!node) {
          return makeError("NODE_NOT_FOUND", `Node not found: ${operation.nodeId}`);
        }

        const updated: GraphNode = {
          ...node,
          ...operation.patch,
          rect: operation.patch.rect ? { ...operation.patch.rect } : { ...node.rect },
          revision: node.revision + 1,
        };

        working.nodes.set(operation.nodeId, updated);
        return null;
      }

      case "deleteNode": {
        const exists = working.nodes.has(operation.nodeId);
        if (!exists) {
          return makeError("NODE_NOT_FOUND", `Node not found: ${operation.nodeId}`);
        }

        working.nodes.delete(operation.nodeId);
        for (const [edgeId, edge] of working.edges.entries()) {
          if (edge.from === operation.nodeId || edge.to === operation.nodeId) {
            working.edges.delete(edgeId);
          }
        }
        return null;
      }

      case "createEdge": {
        if (working.edges.has(operation.edge.id)) {
          return makeError("EDGE_ALREADY_EXISTS", `Edge already exists: ${operation.edge.id}`);
        }

        if (!working.nodes.has(operation.edge.from) || !working.nodes.has(operation.edge.to)) {
          return makeError(
            "EDGE_ENDPOINT_NOT_FOUND",
            `Edge endpoints must exist: ${operation.edge.from} -> ${operation.edge.to}`
          );
        }

        working.edges.set(operation.edge.id, {
          ...operation.edge,
          revision: 1,
        });
        return null;
      }

      case "updateEdge": {
        const edge = working.edges.get(operation.edgeId);
        if (!edge) {
          return makeError("EDGE_NOT_FOUND", `Edge not found: ${operation.edgeId}`);
        }

        const nextFrom = operation.patch.from ?? edge.from;
        const nextTo = operation.patch.to ?? edge.to;

        if (!working.nodes.has(nextFrom) || !working.nodes.has(nextTo)) {
          return makeError("EDGE_ENDPOINT_NOT_FOUND", `Edge endpoints must exist: ${nextFrom} -> ${nextTo}`);
        }

        working.edges.set(operation.edgeId, {
          ...edge,
          ...operation.patch,
          revision: edge.revision + 1,
        });
        return null;
      }

      case "deleteEdge": {
        if (!working.edges.has(operation.edgeId)) {
          return makeError("EDGE_NOT_FOUND", `Edge not found: ${operation.edgeId}`);
        }

        working.edges.delete(operation.edgeId);
        return null;
      }

      default:
        return makeError("INVALID_OPERATION", "Unknown operation type.");
    }
  }

  private recordAudit(args: {
    actor: string;
    expectedRevision: number;
    operationCount: number;
    applied: boolean;
    result: AuditRecord["result"];
    before?: GraphSnapshot;
    after?: GraphSnapshot;
    errors?: GraphError[];
  }): void {
    this.auditService.append({
      timestamp: new Date().toISOString(),
      actor: args.actor,
      operation: `graph.transaction(${args.operationCount} ops)`,
      expectedRevision: args.expectedRevision,
      applied: args.applied,
      beforeDiff: args.before,
      afterDiff: args.after,
      result: args.result,
      errors: args.errors,
    });
  }
}
