import { GraphNode, Id } from "../shared/types";
import { SelectionStore } from "../state/selection-store";

export class InteractionController {
  constructor(private readonly selectionStore: SelectionStore) {}

  selectNodeFromCanvas(nodeId: Id): void {
    this.selectionStore.setSelection([nodeId], "canvas");
  }

  selectNodeFromSidebar(nodeId: Id): void {
    this.selectionStore.setSelection([nodeId], "sidebar");
  }

  multiSelectFromCanvas(nodeIds: Id[]): void {
    this.selectionStore.setSelection(nodeIds, "canvas");
  }

  dragNode(node: GraphNode, dx: number, dy: number): GraphNode {
    return {
      ...node,
      rect: {
        ...node.rect,
        x: node.rect.x + dx,
        y: node.rect.y + dy,
      },
    };
  }
}
