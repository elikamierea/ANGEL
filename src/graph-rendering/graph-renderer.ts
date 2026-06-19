import { GraphEdge, GraphNode } from "../shared/types";

export interface RenderInput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  zoom: number;
}

export interface RenderOutput {
  visibleNodes: GraphNode[];
  visibleEdges: GraphEdge[];
  hiddenNodes: GraphNode[];
}

export interface LodThresholds {
  detailMinPx: number;
  nameMinPx: number;
  hideMinPx: number;
}

const defaultThresholds: LodThresholds = {
  detailMinPx: 256,
  nameMinPx: 64,
  hideMinPx: 16,
};

export class GraphRenderer {
  constructor(private readonly thresholds: LodThresholds = defaultThresholds) {}

  render(input: RenderInput): RenderOutput {
    const visibleNodes: GraphNode[] = [];
    const hiddenNodes: GraphNode[] = [];

    for (const node of input.nodes) {
      const screenMin = Math.min(node.rect.w, node.rect.h) * input.zoom;
      if (screenMin < this.thresholds.hideMinPx) {
        hiddenNodes.push(node);
      } else {
        visibleNodes.push(node);
      }
    }

    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = input.edges.filter(
      (edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
    );

    return {
      visibleNodes,
      visibleEdges,
      hiddenNodes,
    };
  }
}
