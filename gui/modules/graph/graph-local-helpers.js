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

  function rectContains(outer, inner) {
    return outer.x <= inner.x
      && outer.y <= inner.y
      && outer.x + outer.w >= inner.x + inner.w
      && outer.y + outer.h >= inner.y + inner.h;
  }

  // Parametric range [tmin, tmax] where the infinite line `base + s*dir` overlaps
  // the node's rectangle (slab method). Returns null when the line misses it.
  function lineBoxRange(node, base, dir) {
    let tmin = -Infinity;
    let tmax = Infinity;
    const left = node.x;
    const right = node.x + node.w;
    const top = node.y;
    const bottom = node.y + node.h;

    if (Math.abs(dir.x) < 1e-9) {
      if (base.x < left || base.x > right) return null;
    } else {
      let t1 = (left - base.x) / dir.x;
      let t2 = (right - base.x) / dir.x;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }

    if (Math.abs(dir.y) < 1e-9) {
      if (base.y < top || base.y > bottom) return null;
    } else {
      let t1 = (top - base.y) / dir.y;
      let t2 = (bottom - base.y) / dir.y;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }

    if (tmax < tmin) return null;
    return { tmin, tmax };
  }

  // Anchor where the drag line (base + s*dir) crosses the node's border.
  // sign > 0 takes the far (+dir) crossing, sign < 0 the near (-dir) crossing.
  // Falls back to a center ray toward `fallbackTarget` if the line misses.
  function lineEdgeAnchor(node, base, dir, sign, fallbackTarget) {
    const range = lineBoxRange(node, base, dir);
    if (!range) {
      return projectToNodeEdgeByRay(node, fallbackTarget.x, fallbackTarget.y);
    }
    const s = sign >= 0 ? range.tmax : range.tmin;
    return projectToNodeEdge(node, base.x + dir.x * s, base.y + dir.y * s);
  }

  // Endpoint anchors are the crossings of the press->release line with each
  // node's border. When the two pointer points coincide (e.g. programmatic
  // center-to-center edges) we fall back to the stable center-line ray.
  function buildEdgeAnchors(fromNode, toNode, startWorld, endWorld) {
    const fromCenter = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h / 2 };
    const toCenter = { x: toNode.x + toNode.w / 2, y: toNode.y + toNode.h / 2 };

    const start = startWorld || fromCenter;
    const end = endWorld || toCenter;
    const dir = { x: end.x - start.x, y: end.y - start.y };

    if (Math.abs(dir.x) < 1e-9 && Math.abs(dir.y) < 1e-9) {
      return {
        fromAnchor: projectToNodeEdgeByRay(fromNode, toCenter.x, toCenter.y),
        toAnchor: projectToNodeEdgeByRay(toNode, fromCenter.x, fromCenter.y),
      };
    }

    // Normally each node's anchor faces the other node: fromNode exits toward
    // +dir, toNode toward -dir. But if one node fully contains the other, the
    // line never leaves the outer node between the points, so its crossing
    // toward the inner node is meaningless -- use the reverse extension (the
    // opposite border) for the container instead.
    const fromSign = rectContains(fromNode, toNode) ? -1 : 1;
    const toSign = rectContains(toNode, fromNode) ? 1 : -1;

    return {
      fromAnchor: lineEdgeAnchor(fromNode, start, dir, fromSign, toCenter),
      toAnchor: lineEdgeAnchor(toNode, start, dir, toSign, fromCenter),
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
