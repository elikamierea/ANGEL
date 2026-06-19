// Local graph helpers extracted from app.js.
//
// These are still app-composition helpers (selection/hierarchy/anchor defaults),
// but moving them here keeps app.js as wiring-first.
export function createGraphLocalHelpers(deps) {
  const {
    state,
    nodes,
    edges,
    normalizeSelectedNodeIds,
    projectToNodeEdge,
    projectToNodeEdgeByRay,
  } = deps;

  function getSelectedNodesOrdered() {
    normalizeSelectedNodeIds();
    return [...state.selectedNodeIds]
      .map((id) => nodes.find((n) => n.id === id))
      .filter(Boolean);
  }

  function inferLayoutDirectionFromSelection() {
    const selected = getSelectedNodesOrdered();
    const selectedIdSet = new Set(selected.map((n) => n.id));
    const subEdges = edges.filter((e) => selectedIdSet.has(e.from) && selectedIdSet.has(e.to));
    if (subEdges.length === 0) return 'RIGHT';

    let sumX = 0;
    let sumY = 0;
    for (const e of subEdges) {
      const from = nodes.find((n) => n.id === e.from);
      const to = nodes.find((n) => n.id === e.to);
      if (!from || !to) continue;
      const vx = (to.x + to.w / 2) - (from.x + from.w / 2);
      const vy = (to.y + to.h / 2) - (from.y + from.h / 2);
      const len2 = vx * vx + vy * vy;
      if (len2 <= 1e-6) continue;
      sumX += vx / len2;
      sumY += vy / len2;
    }

    if (Math.abs(sumX) >= Math.abs(sumY)) return sumX >= 0 ? 'RIGHT' : 'LEFT';
    return sumY >= 0 ? 'DOWN' : 'UP';
  }

  function getDescendantNodes(parentId) {
    const out = [];
    const walk = (pid) => {
      const direct = nodes.filter((n) => n.parentId === pid);
      for (const d of direct) {
        out.push(d);
        walk(d.id);
      }
    };
    walk(parentId);
    return out;
  }

  function computeNodeDepthMap() {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const memo = new Map();

    const depthOf = (id, seen = new Set()) => {
      if (memo.has(id)) return memo.get(id);
      const n = byId.get(id);
      if (!n) return 0;
      if (!n.parentId || !byId.has(n.parentId)) {
        memo.set(id, 0);
        return 0;
      }
      if (seen.has(id)) {
        memo.set(id, 0);
        return 0;
      }
      seen.add(id);
      const d = depthOf(n.parentId, seen) + 1;
      memo.set(id, d);
      return d;
    };

    for (const n of nodes) depthOf(n.id);
    return memo;
  }

  function refreshHierarchyMeta() {
    const depthMap = computeNodeDepthMap();
    for (const n of nodes) {
      n.depth = depthMap.get(n.id) || 0;
      n.childCount = nodes.filter((x) => x.parentId === n.id).length;
    }
    return depthMap;
  }

  // Compute endpoint anchors with stable center-line fallback when explicit pointer points are absent.
  function buildEdgeAnchors(fromNode, toNode, startWorld, endWorld) {
    const fallbackFrom = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h / 2 };
    const fallbackTo = { x: toNode.x + toNode.w / 2, y: toNode.y + toNode.h / 2 };

    const fromPt = startWorld || fallbackFrom;
    const toPt = endWorld || fallbackTo;

    const useCenterLineDefault =
      !startWorld
      || !endWorld
      || (
        Math.abs(Number(fromPt?.x) - (fromNode.x + fromNode.w / 2)) < 1e-9
        && Math.abs(Number(fromPt?.y) - (fromNode.y + fromNode.h / 2)) < 1e-9
        && Math.abs(Number(toPt?.x) - (toNode.x + toNode.w / 2)) < 1e-9
        && Math.abs(Number(toPt?.y) - (toNode.y + toNode.h / 2)) < 1e-9
      );

    return {
      fromAnchor: useCenterLineDefault
        ? projectToNodeEdgeByRay(fromNode, fallbackTo.x, fallbackTo.y)
        : projectToNodeEdge(fromNode, fromPt.x, fromPt.y),
      toAnchor: useCenterLineDefault
        ? projectToNodeEdgeByRay(toNode, fallbackFrom.x, fallbackFrom.y)
        : projectToNodeEdge(toNode, toPt.x, toPt.y),
    };
  }

  return {
    getSelectedNodesOrdered,
    inferLayoutDirectionFromSelection,
    getDescendantNodes,
    computeNodeDepthMap,
    refreshHierarchyMeta,
    buildEdgeAnchors,
  };
}
