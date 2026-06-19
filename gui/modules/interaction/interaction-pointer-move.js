export function createInteractionPointerMove(deps) {
  const {
    state,
    nodes,
    edges,
    canvas,
    MIN_NODE_W,
    MIN_NODE_H,
    getCanvasPointer,
    getSelectionBBoxFromSession,
    getRectResizeHandleAt,
    isPointInRect,
    getEdgeEndpointHit,
    getResizeHit,
    getEdgeBodyHit,
    hitTest,
    getCursorForHandle,
    ensureAutoPanLoop,
    projectToNodeEdge,
    render,
    renderRightPanel,
    applySelectionTransformByBoxes,
    updatePastePreview,
    setStatus,
  } = deps;

  function handlePointerMove(e) {
    const p0 = getCanvasPointer(e);
    state.pointerWorldX = p0.world.x;
    state.pointerWorldY = p0.world.y;

    if (state.transformSession && state.transformBatchDragging && state.transformBatchBaseById) {
      const dx = p0.world.x - state.transformBatchStartWorldX;
      const dy = p0.world.y - state.transformBatchStartWorldY;
      for (const [id, base] of state.transformBatchBaseById.entries()) {
        const node = nodes.find((n) => n.id === id);
        if (!node) continue;
        node.x = base.x + dx;
        node.y = base.y + dy;
      }
      setStatus('Batch dragging preview... Enter apply / Esc cancel');
      render();
      return;
    }

    if (state.transformSession?.mode === 'stretch_bbox' && state.transformStretchDragging) {
      const baseBox = state.transformStretchBaseBox;
      const baseById = state.transformStretchBaseById;
      const handle = state.transformStretchHandle;
      if (baseBox && baseById && handle) {
        const minW = 20;
        const minH = 20;
        let left = baseBox.x;
        let top = baseBox.y;
        let right = baseBox.x + baseBox.w;
        let bottom = baseBox.y + baseBox.h;

        if (handle.includes('w')) left = Math.min(p0.world.x, right - minW);
        if (handle.includes('e')) right = Math.max(p0.world.x, left + minW);
        if (handle.includes('n')) top = Math.min(p0.world.y, bottom - minH);
        if (handle.includes('s')) bottom = Math.max(p0.world.y, top + minH);

        const targetBox = { x: left, y: top, w: right - left, h: bottom - top };
        const keepAspect = handle.length === 2 && e.shiftKey;
        applySelectionTransformByBoxes(baseBox, targetBox, baseById, keepAspect);
        setStatus('Stretch preview (Shift=keep ratio). Enter apply / Esc cancel');
        render();
      }
      return;
    }

    if (state.pastePreviewActive) {
      updatePastePreview();
      render();
    }

    if (!state.dragging) {
      const p = p0;

      if (state.transformSession?.mode === 'stretch_bbox') {
        const bbox = getSelectionBBoxFromSession();
        const handle = bbox ? getRectResizeHandleAt(bbox, p.world.x, p.world.y) : null;
        if (handle) {
          canvas.style.cursor = getCursorForHandle(handle);
        } else if (bbox && isPointInRect(p.world.x, p.world.y, bbox)) {
          canvas.style.cursor = 'move';
        } else {
          canvas.style.cursor = 'crosshair';
        }
        return;
      }

      const endpointHit = getEdgeEndpointHit(p.world.x, p.world.y);
      const resizeHit = getResizeHit(p.world.x, p.world.y);
      const edgeHit = getEdgeBodyHit(p.world.x, p.world.y);
      const hit = hitTest(p.world.x, p.world.y);

      if (state.cPressed) {
        const sourceNode = hit || (resizeHit ? resizeHit.node : null);
        canvas.style.cursor = sourceNode ? 'crosshair' : 'not-allowed';
        return;
      }
      if (state.mPressed) {
        canvas.style.cursor = hit ? 'copy' : 'not-allowed';
        return;
      }

      if (endpointHit || edgeHit) {
        canvas.style.cursor = 'pointer';
      } else {
        canvas.style.cursor = resizeHit ? getCursorForHandle(resizeHit.handle) : 'grab';
      }
      return;
    }

    state.pointerClientX = e.clientX;
    state.pointerClientY = e.clientY;

    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 1) {
      state.dragMoved = true;
      state.suppressClick = true;
    }

    state.lastX = e.clientX;
    state.lastY = e.clientY;

    if (state.dragMode === 'pan') {
      state.panX += dx;
      state.panY += dy;
      setStatus(`Pan (${Math.round(state.panX)}, ${Math.round(state.panY)})`);
      render();
      return;
    }

    ensureAutoPanLoop();

    if (state.dragMode === 'select-box') {
      const p = getCanvasPointer(e);
      state.selectionRectWorldX = p.world.x;
      state.selectionRectWorldY = p.world.y;
      render();
      return;
    }

    if (state.dragMode === 'edge-create' && state.edgeCreateFromNodeId) {
      const p = getCanvasPointer(e);
      state.edgeCreateWorldX = p.world.x;
      state.edgeCreateWorldY = p.world.y;
      render();
      return;
    }

    if (state.dragMode === 'node-create') {
      const p = getCanvasPointer(e);
      state.nodeCreateWorldX = p.world.x;
      state.nodeCreateWorldY = p.world.y;
      render();
      return;
    }

    if (state.dragMode === 'mirror-create') {
      const p = getCanvasPointer(e);
      state.mirrorCreateWorldX = p.world.x;
      state.mirrorCreateWorldY = p.world.y;
      render();
      return;
    }

    if (state.dragMode === 'edge-endpoint' && state.draggedEdgeId && state.draggedEdgeEnd) {
      const edge = edges.find((ed) => ed.id === state.draggedEdgeId);
      if (!edge) return;

      const nodeId = state.draggedEdgeEnd === 'from' ? edge.from : edge.to;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const p = getCanvasPointer(e);
      const nextAnchor = projectToNodeEdge(node, p.world.x, p.world.y);
      if (state.draggedEdgeEnd === 'from') edge.fromAnchor = nextAnchor;
      else edge.toAnchor = nextAnchor;

      setStatus(`Edge ${edge.id} ${state.draggedEdgeEnd} anchor: ${nextAnchor.side}@${nextAnchor.t.toFixed(2)}`);
      render();
      renderRightPanel();
      return;
    }

    if (state.dragMode === 'node' && state.draggedNodeId) {
      const p = getCanvasPointer(e);
      const anchorStart = state.nodeDragSnapshot?.byId?.get(state.draggedNodeId);
      if (!anchorStart) return;

      const nextX = p.world.x - state.dragOffsetX;
      const nextY = p.world.y - state.dragOffsetY;
      state.nodeDragPreviewDx = nextX - anchorStart.x;
      state.nodeDragPreviewDy = nextY - anchorStart.y;

      render();
      return;
    }

    if (state.dragMode === 'resize' && state.draggedNodeId && state.resizeHandle) {
      const p = getCanvasPointer(e);
      const rdx = p.world.x - state.resizeStartWorldX;
      const rdy = p.world.y - state.resizeStartWorldY;
      const minWByScreen = 64 / state.dragStartZoom;
      const minHByScreen = 64 / state.dragStartZoom;

      for (const [id, base] of state.resizeSnapshot?.entries() || []) {
        const node = nodes.find((n) => n.id === id);
        if (!node) continue;

        const minW = Math.max(1, Math.min(minWByScreen, base.w || MIN_NODE_W));
        const minH = Math.max(1, Math.min(minHByScreen, base.h || MIN_NODE_H));

        let left = base.x;
        let top = base.y;
        let right = base.x + base.w;
        let bottom = base.y + base.h;

        if (state.resizeHandle.includes('w')) left = Math.min(base.x + rdx, right - minW);
        if (state.resizeHandle.includes('e')) right = Math.max(base.x + base.w + rdx, left + minW);
        if (state.resizeHandle.includes('n')) top = Math.min(base.y + rdy, bottom - minH);
        if (state.resizeHandle.includes('s')) bottom = Math.max(base.y + base.h + rdy, top + minH);

        node.x = left;
        node.y = top;
        node.w = right - left;
        node.h = bottom - top;
      }

      render();
    }
  }

  return { handlePointerMove };
}
