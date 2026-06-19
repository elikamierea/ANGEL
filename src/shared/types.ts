// Shared domain types (M1)

export type Id = string;
export type LayerId = "L0" | "L1" | "L2" | "L3";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GraphNode {
  id: Id;
  layer: LayerId;
  name: string;
  summary?: string;
  detail?: string;
  rect: Rect;
  parentId?: Id | null;
  revision: number;
}

export interface GraphEdge {
  id: Id;
  from: Id;
  to: Id;
  kind: string;
  detail?: string;
  revision: number;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  revision: number;
}

export type GraphErrorCode =
  | "REVISION_CONFLICT"
  | "NODE_NOT_FOUND"
  | "EDGE_NOT_FOUND"
  | "EDGE_ENDPOINT_NOT_FOUND"
  | "NODE_ALREADY_EXISTS"
  | "EDGE_ALREADY_EXISTS"
  | "INVALID_OPERATION";

export interface GraphError {
  code: GraphErrorCode;
  message: string;
}

export type GraphOperation =
  | { type: "createNode"; node: Omit<GraphNode, "revision"> }
  | { type: "updateNode"; nodeId: Id; patch: Partial<Omit<GraphNode, "id" | "revision">> }
  | { type: "deleteNode"; nodeId: Id }
  | { type: "createEdge"; edge: Omit<GraphEdge, "revision"> }
  | { type: "updateEdge"; edgeId: Id; patch: Partial<Omit<GraphEdge, "id" | "revision">> }
  | { type: "deleteEdge"; edgeId: Id };

export interface TransactionResult {
  applied: boolean;
  newRevision: number;
  errors?: GraphError[];
}

export interface AuditRecord {
  timestamp: string;
  actor: string;
  operation: string;
  expectedRevision: number;
  applied: boolean;
  targetLayer?: LayerId;
  beforeDiff?: unknown;
  afterDiff?: unknown;
  result: "ok" | "error";
  errors?: GraphError[];
}
