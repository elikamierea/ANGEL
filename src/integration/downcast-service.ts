import { GraphStore } from "../graph-domain/graph-store";
import { LayerId } from "../shared/types";

export interface DowncastResult {
  applied: boolean;
  from: LayerId;
  to: LayerId;
  sourceRevision: number;
  message: string;
}

const LAYER_ORDER: LayerId[] = ["L0", "L1", "L2", "L3"];

function nextLayer(layer: LayerId): LayerId | null {
  const idx = LAYER_ORDER.indexOf(layer);
  return idx >= 0 && idx < LAYER_ORDER.length - 1 ? LAYER_ORDER[idx + 1] : null;
}

export class DowncastService {
  constructor(private readonly graphStore: GraphStore) {}

  downcast(from: LayerId): DowncastResult {
    const to = nextLayer(from);
    const revision = this.graphStore.getRevision();

    if (!to) {
      return {
        applied: false,
        from,
        to: from,
        sourceRevision: revision,
        message: "No lower layer to downcast into.",
      };
    }

    return {
      applied: true,
      from,
      to,
      sourceRevision: revision,
      message: `Downcasted snapshot from ${from} to ${to}.`,
    };
  }
}
