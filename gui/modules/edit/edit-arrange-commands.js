export function createEditArrangeCommands(deps) {
  const {
    state,
    history,
    nodes,
    pushHistory,
    restoreSnapshot,
    updateTopbar,
    rebuildSidebar,
    renderRightPanel,
    render,
    normalizeRectFromLrtb,
    getNodeByNameStrict,
    buildNodeLrtb,
    rectsIntersect,
    rectContainsRect,
    recomputeAllContainmentFromGeometry,
    validateContainmentLayerOrder,
  } = deps;

  function hasIllegalOverlapInRectSet(rectByNodeId) {
    const projected = nodes.map((n) => {
      const next = rectByNodeId.get(n.id);
      if (!next) return { ...n };
      return { ...n, x: next.x, y: next.y, w: next.w, h: next.h };
    });

    for (let i = 0; i < projected.length; i += 1) {
      for (let j = i + 1; j < projected.length; j += 1) {
        const a = projected[i];
        const b = projected[j];
        if (!rectsIntersect(a, b)) continue;
        const aContainsB = rectContainsRect(a, b);
        const bContainsA = rectContainsRect(b, a);
        if (!aContainsB && !bContainsA) return { a, b };
      }
    }

    return null;
  }

  function arrangeNodesGridByParams(params = {}) {
    const carrier = params.targetLrtb || params.lrtb;
    const targetRect = normalizeRectFromLrtb(carrier);

    const m = Math.trunc(Number(params.m));
    const n = Math.trunc(Number(params.n));
    if (!Number.isFinite(m) || !Number.isFinite(n) || m <= 0 || n <= 0) {
      throw new Error('m and n must be positive integers');
    }

    const axisRaw = String(params.axis || 'x').trim().toLowerCase();
    const axis = axisRaw === 'y' ? 'y' : 'x';

    const nodeNames = Array.isArray(params.nodeNames)
      ? params.nodeNames.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    if (nodeNames.length === 0) throw new Error('nodeNames is required');
    if (nodeNames.length > m * n) {
      throw new Error(`nodeNames length (${nodeNames.length}) exceeds grid capacity (${m * n})`);
    }

    const uniqueNameCheck = new Set();
    for (const name of nodeNames) {
      const key = name.toLowerCase();
      if (uniqueNameCheck.has(key)) throw new Error(`duplicate node name in request: ${name}`);
      uniqueNameCheck.add(key);
    }

    const nodesToArrange = nodeNames.map((name) => {
      const found = getNodeByNameStrict(name);
      if (!found) throw new Error(`node not found: ${name}`);
      return found;
    });

    const arrangedRootIdSet = new Set(nodesToArrange.map((n) => n.id));

    const totalWidth = targetRect.w;
    const totalHeight = targetRect.h;
    const colUnit = totalWidth / (3 * n + 1);
    const rowUnit = totalHeight / (3 * m + 1);

    if (!(colUnit > 0) || !(rowUnit > 0)) {
      throw new Error('target lrtb must have positive width and height');
    }

    const plannedRects = new Map();
    const placements = [];

    for (let idx = 0; idx < nodesToArrange.length; idx += 1) {
      const row = axis === 'x' ? Math.floor(idx / n) + 1 : (idx % m) + 1;
      const col = axis === 'x' ? (idx % n) + 1 : Math.floor(idx / m) + 1;

      const left = targetRect.x + (3 * col - 2) * colUnit;
      const right = targetRect.x + (3 * col) * colUnit;
      const top = targetRect.y + (3 * row - 2) * rowUnit;
      const bottom = targetRect.y + (3 * row) * rowUnit;

      const node = nodesToArrange[idx];
      const nextRect = {
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
      };

      plannedRects.set(node.id, nextRect);
      placements.push({
        name: node.name,
        from: buildNodeLrtb(node),
        to: {
          left,
          right,
          top,
          bottom,
        },
        row,
        col,
        via: 'grid',
      });
    }

    const childrenByParentId = new Map();
    for (const node of nodes) {
      const key = node.parentId || null;
      if (!childrenByParentId.has(key)) childrenByParentId.set(key, []);
      childrenByParentId.get(key).push(node);
    }

    const applyDescendantLayout = (parentNode) => {
      const children = childrenByParentId.get(parentNode.id) || [];
      const oldParent = { x: parentNode.x, y: parentNode.y, w: parentNode.w, h: parentNode.h };
      const newParent = plannedRects.get(parentNode.id) || oldParent;

      const parentWidth = Number(oldParent.w) || 0;
      const parentHeight = Number(oldParent.h) || 0;

      for (const child of children) {
        if (!arrangedRootIdSet.has(child.id)) {
          const oldChild = { x: child.x, y: child.y, w: child.w, h: child.h };
          const relLeft = parentWidth > 0 ? (oldChild.x - oldParent.x) / parentWidth : 0;
          const relTop = parentHeight > 0 ? (oldChild.y - oldParent.y) / parentHeight : 0;
          const relWidth = parentWidth > 0 ? oldChild.w / parentWidth : 1;
          const relHeight = parentHeight > 0 ? oldChild.h / parentHeight : 1;

          const nextChild = {
            x: newParent.x + relLeft * newParent.w,
            y: newParent.y + relTop * newParent.h,
            w: relWidth * newParent.w,
            h: relHeight * newParent.h,
          };

          plannedRects.set(child.id, nextChild);
          placements.push({
            name: child.name,
            from: buildNodeLrtb(child),
            to: {
              left: nextChild.x,
              right: nextChild.x + nextChild.w,
              top: nextChild.y,
              bottom: nextChild.y + nextChild.h,
            },
            via: 'inherit-parent-ratio',
            parentNodeName: parentNode.name,
          });
        }

        applyDescendantLayout(child);
      }
    };

    for (const root of nodesToArrange) {
      applyDescendantLayout(root);
    }

    const conflict = hasIllegalOverlapInRectSet(plannedRects);
    if (conflict) {
      throw new Error(`arrange conflict: illegal overlap (${conflict.a.name} vs ${conflict.b.name})`);
    }

    pushHistory();
    const touchedIds = [];

    for (const node of nodes) {
      const next = plannedRects.get(node.id);
      if (!next) continue;
      node.x = next.x;
      node.y = next.y;
      node.w = next.w;
      node.h = next.h;
      node.dirty = true;
      node.revision += 1;
      touchedIds.push(node.id);
    }

    recomputeAllContainmentFromGeometry();
    const layerOrderConflict = validateContainmentLayerOrder();
    if (layerOrderConflict) {
      if (history.past.length > 0) {
        const prev = history.past.pop();
        restoreSnapshot(prev);
      }
      throw new Error(`arrange cancelled: child layer cannot be earlier than parent (${layerOrderConflict.child.name} -> ${layerOrderConflict.parent.name})`);
    }

    if (touchedIds.length > 0) {
      state.selectedNodeIds = new Set(touchedIds);
      state.selectedNodeId = touchedIds[0] || null;
      state.selectedEdgeId = null;
    }

    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();

    return {
      arranged: true,
      axis,
      rows: m,
      cols: n,
      arrangedCount: placements.filter((item) => item.via === 'grid').length,
      propagatedCount: placements.filter((item) => item.via === 'inherit-parent-ratio').length,
      placements,
    };
  }

  return {
    hasIllegalOverlapInRectSet,
    arrangeNodesGridByParams,
  };
}
