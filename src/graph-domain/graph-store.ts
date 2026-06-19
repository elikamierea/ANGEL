import { GraphEdge, GraphNode, GraphSnapshot, Id } from "../shared/types";

function cloneNode(node: GraphNode): GraphNode {
  return {
    ...node,
    rect: { ...node.rect },
  };
}

function cloneEdge(edge: GraphEdge): GraphEdge {
  return { ...edge };
}

/**
 * In-memory graph store with snapshot export/import.
 *
 * Mutations should normally go through GraphOperationService to preserve
 * transaction semantics and auditability.
 */
export class GraphStore {
  private nodes = new Map<Id, GraphNode>();
  private edges = new Map<Id, GraphEdge>();
  private revision = 0;

  getRevision(): number {
    return this.revision;
  }

  getNode(nodeId: Id): GraphNode | undefined {
    const node = this.nodes.get(nodeId);
    return node ? cloneNode(node) : undefined;
  }

  getEdge(edgeId: Id): GraphEdge | undefined {
    const edge = this.edges.get(edgeId);
    return edge ? cloneEdge(edge) : undefined;
  }

  listNodes(): GraphNode[] {
    return [...this.nodes.values()].map(cloneNode);
  }

  listEdges(): GraphEdge[] {
    return [...this.edges.values()].map(cloneEdge);
  }

  exportSnapshot(): GraphSnapshot {
    return {
      nodes: this.listNodes(),
      edges: this.listEdges(),
      revision: this.revision,
    };
  }

  importSnapshot(snapshot: GraphSnapshot, nextRevision?: number): void {
    this.nodes.clear();
    this.edges.clear();

    for (const node of snapshot.nodes) {
      this.nodes.set(node.id, cloneNode(node));
    }

    for (const edge of snapshot.edges) {
      this.edges.set(edge.id, cloneEdge(edge));
    }

    this.revision = nextRevision ?? snapshot.revision;
  }
}
