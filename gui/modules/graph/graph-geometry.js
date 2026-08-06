export function createGraphGeometry(deps) {
  const { state, nodes, RESIZE_HANDLE_SIZE_PX } = deps;

  function rectContainsRect(outer, inner) {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.w <= outer.x + outer.w &&
      inner.y + inner.h <= outer.y + outer.h
    );
  }

  function rectsIntersect(a, b) {
    return !(
      a.x + a.w <= b.x ||
      b.x + b.w <= a.x ||
      a.y + a.h <= b.y ||
      b.y + b.h <= a.y
    );
  }

  function rectEquals(a, b) {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  }

  function rectStrictlyContainsRect(outer, inner) {
    return rectContainsRect(outer, inner) && !rectEquals(outer, inner);
  }

  function findSmallestContainerForRect(rect, ignoreNodeId = null) {
    const candidates = nodes
      .filter((n) => n.id !== ignoreNodeId)
      .filter((n) => rectContainsRect(n, rect));

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (a.w * a.h) - (b.w * b.h));
    return candidates[0];
  }

  function findSmallestStrictContainerForRect(rect, ignoreNodeId = null) {
    const candidates = nodes
      .filter((n) => n.id !== ignoreNodeId)
      .filter((n) => rectStrictlyContainsRect(n, rect));

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (a.w * a.h) - (b.w * b.h));
    return candidates[0];
  }

  function recomputeAllContainmentFromGeometry() {
    const nextParent = new Map();
    for (const n of nodes) {
      const container = findSmallestStrictContainerForRect(n, n.id);
      nextParent.set(n.id, container ? container.id : null);
    }
    for (const n of nodes) n.parentId = nextParent.get(n.id) || null;
  }

  function findIntersectionNodes(rect, ignoreNodeId = null) {
    return nodes.filter((n) => n.id !== ignoreNodeId && rectsIntersect(n, rect));
  }

  function nodeIntersectsAny(node, ignoreNodeId = null) {
    return findIntersectionNodes(node, ignoreNodeId).length > 0;
  }

  function areSpatiallyCompatible(a, b) {
    return !rectsIntersect(a, b) || rectContainsRect(a, b) || rectContainsRect(b, a);
  }

  function findSpatialConflict(candidateNodes = nodes) {
    for (let i = 0; i < candidateNodes.length; i++) {
      for (let j = i + 1; j < candidateNodes.length; j++) {
        const a = candidateNodes[i];
        const b = candidateNodes[j];
        if (!areSpatiallyCompatible(a, b)) return { a, b };
      }
    }
    return null;
  }

  // Conflict check limited to a changed subset. A new overlap after an edit must
  // involve at least one changed node (every stationary pair was already legal),
  // so we test each changed node against the rest — O(|subset|·n) instead of the
  // all-pairs O(n²) of findSpatialConflict. Symmetric subset pairs may be tested
  // twice; harmless. Returns the same { a, b } shape.
  function findSpatialConflictForNodes(subset) {
    const list = Array.isArray(subset) ? subset.filter(Boolean) : [];
    for (const a of list) {
      for (const b of nodes) {
        if (a.id === b.id) continue;
        if (!areSpatiallyCompatible(a, b)) return { a, b };
      }
    }
    return null;
  }

  // Incremental containment: recompute parentId only for the nodes whose geometry
  // changed (create/move) plus the nodes those changes can affect, instead of
  // rediscovering the whole tree (recomputeAllContainmentFromGeometry, O(n²)).
  //
  // A changed node C can only alter the parent of:
  //   - itself (its own smallest strict container may differ),
  //   - nodes that currently point at C as their parent (C may have moved away),
  //   - nodes that C's new rect now strictly contains (C may have become their
  //     new smallest container).
  // Every other node keeps its parent: its geometry and its smallest container
  // are both unchanged. All changed rects must already be applied to `nodes`.
  function recomputeContainmentForNodes(changedNodes) {
    const changed = Array.isArray(changedNodes) ? changedNodes.filter(Boolean) : [];
    if (changed.length === 0) return;
    const changedIds = new Set(changed.map((n) => n.id));

    const affected = new Map(); // id -> node, de-duplicated
    for (const c of changed) affected.set(c.id, c);
    for (const n of nodes) {
      if (affected.has(n.id)) continue;
      if (changedIds.has(n.parentId)) {
        affected.set(n.id, n); // its container moved/changed
        continue;
      }
      for (const c of changed) {
        if (c.id !== n.id && rectStrictlyContainsRect(c, n)) {
          affected.set(n.id, n); // a changed node now wraps it
          break;
        }
      }
    }

    const nextParent = new Map();
    for (const n of affected.values()) {
      const container = findSmallestStrictContainerForRect(n, n.id);
      nextParent.set(n.id, container ? container.id : null);
    }
    for (const n of affected.values()) n.parentId = nextParent.get(n.id) || null;
  }

  function isPlacementLegal(candidateRect, ignoreNodeIds = new Set()) {
    for (const n of nodes) {
      if (ignoreNodeIds.has(n.id)) continue;
      if (!areSpatiallyCompatible(candidateRect, n)) return false;
    }
    return true;
  }

  function getNodesBoundingRect(nodeList) {
    if (!Array.isArray(nodeList) || nodeList.length === 0) return null;
    const minX = Math.min(...nodeList.map((n) => n.x));
    const minY = Math.min(...nodeList.map((n) => n.y));
    const maxX = Math.max(...nodeList.map((n) => n.x + n.w));
    const maxY = Math.max(...nodeList.map((n) => n.y + n.h));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function getSelectionBBoxFromSession() {
    if (!state.transformSession) return null;
    const selected = [...state.transformSession.selectedIds]
      .map((id) => nodes.find((n) => n.id === id))
      .filter(Boolean);
    return getNodesBoundingRect(selected);
  }

  function applySelectionTransformByBoxes(baseBox, targetBox, baseById, keepAspect = false) {
    if (!baseBox || !targetBox || !baseById) return;
    let sx = targetBox.w / Math.max(1e-6, baseBox.w);
    let sy = targetBox.h / Math.max(1e-6, baseBox.h);

    if (keepAspect) {
      const s = Math.max(1e-6, Math.min(sx, sy));
      sx = s;
      sy = s;
      targetBox = {
        x: targetBox.x,
        y: targetBox.y,
        w: baseBox.w * s,
        h: baseBox.h * s,
      };
    }

    for (const [id, base] of baseById.entries()) {
      const node = nodes.find((n) => n.id === id);
      if (!node) continue;
      const rx = (base.x - baseBox.x) / Math.max(1e-6, baseBox.w);
      const ry = (base.y - baseBox.y) / Math.max(1e-6, baseBox.h);
      const rw = base.w / Math.max(1e-6, baseBox.w);
      const rh = base.h / Math.max(1e-6, baseBox.h);

      node.x = targetBox.x + rx * targetBox.w;
      node.y = targetBox.y + ry * targetBox.h;
      // Real minimum is enforced at the drag boundary (screen-space floor);
      // this only guards against degenerate/zero sizes.
      node.w = Math.max(1, rw * targetBox.w);
      node.h = Math.max(1, rh * targetBox.h);
    }
  }

  function getRectResizeHandles(rect) {
    const x1 = rect.x;
    const y1 = rect.y;
    const x2 = rect.x + rect.w;
    const y2 = rect.y + rect.h;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return [
      { key: 'nw', x: x1, y: y1 },
      { key: 'n', x: cx, y: y1 },
      { key: 'ne', x: x2, y: y1 },
      { key: 'e', x: x2, y: cy },
      { key: 'se', x: x2, y: y2 },
      { key: 's', x: cx, y: y2 },
      { key: 'sw', x: x1, y: y2 },
      { key: 'w', x: x1, y: cy },
    ];
  }

  function getRectResizeHandleAt(rect, worldX, worldY) {
    const half = (RESIZE_HANDLE_SIZE_PX / Math.max(state.zoom, 0.0001)) * 0.7;
    for (const h of getRectResizeHandles(rect)) {
      if (Math.abs(worldX - h.x) <= half && Math.abs(worldY - h.y) <= half) return h.key;
    }
    return null;
  }

  function isPointInRect(worldX, worldY, rect) {
    return worldX >= rect.x && worldX <= rect.x + rect.w && worldY >= rect.y && worldY <= rect.y + rect.h;
  }

  return {
    rectContainsRect,
    rectsIntersect,
    rectEquals,
    rectStrictlyContainsRect,
    findSmallestContainerForRect,
    findSmallestStrictContainerForRect,
    recomputeAllContainmentFromGeometry,
    recomputeContainmentForNodes,
    findIntersectionNodes,
    nodeIntersectsAny,
    areSpatiallyCompatible,
    findSpatialConflict,
    findSpatialConflictForNodes,
    isPlacementLegal,
    getNodesBoundingRect,
    getSelectionBBoxFromSession,
    applySelectionTransformByBoxes,
    getRectResizeHandles,
    getRectResizeHandleAt,
    isPointInRect,
  };
}
