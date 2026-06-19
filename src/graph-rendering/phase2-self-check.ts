import { GraphRenderer } from "./graph-renderer";
import { InteractionController } from "./interaction-controller";
import { ViewportController } from "./viewport-controller";
import { SelectionStore } from "../state/selection-store";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Phase2SelfCheck failed: ${message}`);
  }
}

export function runPhase2SelfCheck(): void {
  const viewport = new ViewportController();
  viewport.zoomBy(0.5);
  assert(viewport.getState().zoom > 1, "zoom should increase");

  const renderer = new GraphRenderer();
  const render = renderer.render({
    zoom: 1,
    nodes: [
      {
        id: "n-visible",
        layer: "L1",
        name: "Visible",
        rect: { x: 0, y: 0, w: 100, h: 100 },
        revision: 1,
      },
      {
        id: "n-hidden",
        layer: "L1",
        name: "Hidden",
        rect: { x: 0, y: 0, w: 4, h: 4 },
        revision: 1,
      },
    ],
    edges: [
      { id: "e1", from: "n-visible", to: "n-hidden", kind: "link", revision: 1 },
    ],
  });

  assert(render.visibleNodes.length === 1, "one node should be visible at default LOD");
  assert(render.visibleEdges.length === 0, "edge with hidden endpoint should be filtered out");

  const selection = new SelectionStore();
  const interactions = new InteractionController(selection);
  interactions.selectNodeFromCanvas("n-visible");
  assert(selection.getState().selectedIds[0] === "n-visible", "canvas selection should sync");
  interactions.selectNodeFromSidebar("n-hidden");
  assert(selection.getState().source === "sidebar", "sidebar selection source should be recorded");
}
