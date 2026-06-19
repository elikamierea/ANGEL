export function createEditTransformCommands(deps) {
  const {
    edges,
    getSelectedNodesOrdered,
    getNodesBoundingRect,
    getAnchorWorld,
    projectToNodeEdge,
    render,
  } = deps;

  function scaleSelectionUniform(scale) {
    const selected = getSelectedNodesOrdered();
    const bbox = getNodesBoundingRect(selected);
    if (!bbox || !(scale > 0)) return;
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;

    for (const node of selected) {
      const nodeCx = node.x + node.w / 2;
      const nodeCy = node.y + node.h / 2;
      const nextW = Math.max(20, node.w * scale);
      const nextH = Math.max(20, node.h * scale);
      const nextCx = cx + (nodeCx - cx) * scale;
      const nextCy = cy + (nodeCy - cy) * scale;
      node.w = nextW;
      node.h = nextH;
      node.x = nextCx - nextW / 2;
      node.y = nextCy - nextH / 2;
    }

    render();
  }

  function transformPointByModeAroundCenter(x, y, mode, cx, cy) {
    let relX = x - cx;
    let relY = y - cy;
    if (mode === 'rotate_cw') {
      [relX, relY] = [relY, -relX];
    } else if (mode === 'rotate_ccw') {
      [relX, relY] = [-relY, relX];
    } else if (mode === 'flip_h') {
      relX = -relX;
    } else if (mode === 'flip_v') {
      relY = -relY;
    }
    return { x: cx + relX, y: cy + relY };
  }

  function rotateOrFlipSelection(mode) {
    const selected = getSelectedNodesOrdered();
    const bbox = getNodesBoundingRect(selected);
    if (!bbox) return;
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const selectedIdSet = new Set(selected.map((n) => n.id));
    const beforeById = new Map(selected.map((n) => [n.id, { x: n.x, y: n.y, w: n.w, h: n.h }]));

    for (const node of selected) {
      let w = node.w;
      let h = node.h;
      const nodeCx = node.x + w / 2;
      const nodeCy = node.y + h / 2;
      let relX = nodeCx - cx;
      let relY = nodeCy - cy;

      if (mode === 'rotate_cw') {
        [relX, relY] = [relY, -relX];
        [w, h] = [h, w];
      } else if (mode === 'rotate_ccw') {
        [relX, relY] = [-relY, relX];
        [w, h] = [h, w];
      } else if (mode === 'flip_h') {
        relX = -relX;
      } else if (mode === 'flip_v') {
        relY = -relY;
      }

      const nextCx = cx + relX;
      const nextCy = cy + relY;
      node.w = w;
      node.h = h;
      node.x = nextCx - w / 2;
      node.y = nextCy - h / 2;
    }

    for (const edge of edges) {
      if (selectedIdSet.has(edge.from) && edge.fromAnchor) {
        const fromBefore = beforeById.get(edge.from);
        const fromAfter = selected.find((n) => n.id === edge.from);
        if (fromBefore && fromAfter) {
          const anchorWorld = getAnchorWorld(fromBefore, edge.fromAnchor);
          const moved = transformPointByModeAroundCenter(anchorWorld.x, anchorWorld.y, mode, cx, cy);
          edge.fromAnchor = projectToNodeEdge(fromAfter, moved.x, moved.y);
        }
      }
      if (selectedIdSet.has(edge.to) && edge.toAnchor) {
        const toBefore = beforeById.get(edge.to);
        const toAfter = selected.find((n) => n.id === edge.to);
        if (toBefore && toAfter) {
          const anchorWorld = getAnchorWorld(toBefore, edge.toAnchor);
          const moved = transformPointByModeAroundCenter(anchorWorld.x, anchorWorld.y, mode, cx, cy);
          edge.toAnchor = projectToNodeEdge(toAfter, moved.x, moved.y);
        }
      }
    }

    render();
  }

  return {
    scaleSelectionUniform,
    rotateOrFlipSelection,
  };
}
