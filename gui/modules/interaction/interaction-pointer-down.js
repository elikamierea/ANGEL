export function createInteractionPointerDown(deps) {
  const {
    state,
    nodes,
    canvas,
    document,
    isTypingTarget,
    setStatus,
    render,
    getCanvasPointer,
    getSelectionBBoxFromSession,
    getRectResizeHandleAt,
    ensureAutoPanLoop,
    getEdgeEndpointHit,
    hitTest,
    getResizeHit,
    setSingleNodeSelection,
    setSingleEdgeSelection,
    pushHistory,
    rebuildSidebar,
    renderRightPanel,
  } = deps;

  function handlePointerDown(e) {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    e.preventDefault();

    if (e.button === 0) {
      const active = document.activeElement;
      if (isTypingTarget(active)) active.blur?.();
    }

    if (state.transformSession) {
      if (e.button === 1 || e.button === 2) {
        state.dragging = true;
        state.activeDragButton = e.button;
        state.dragMode = 'pan';
        state.lastX = e.clientX;
        state.lastY = e.clientY;
        canvas.classList.add('dragging');
        setStatus('Panning view...');
        return;
      }

      if (e.button !== 0) return;

      const p = getCanvasPointer(e);
      const bbox = getSelectionBBoxFromSession();
      if (!bbox) return;

      const selectedHit = hitTest(p.world.x, p.world.y);
      const insideSelectedGeometry = Boolean(selectedHit) && state.transformSession.selectedIds.has(selectedHit.id);

      if (state.transformSession.mode === 'stretch_bbox') {
        const handle = getRectResizeHandleAt(bbox, p.world.x, p.world.y);
        if (handle) {
          state.transformStretchDragging = true;
          state.transformStretchHandle = handle;
          state.transformStretchBaseBox = { ...bbox };
          state.transformStretchBaseById = new Map(
            [...state.transformSession.selectedIds]
              .map((id) => {
                const n = nodes.find((x) => x.id === id);
                return n ? [id, { x: n.x, y: n.y, w: n.w, h: n.h }] : null;
              })
              .filter(Boolean),
          );
          setStatus('Stretch preview dragging... release mouse, Enter apply, Esc cancel');
          return;
        }
        if (!insideSelectedGeometry) {
          state.transformSession.mode = 'generic';
          setStatus('Stretch mode exited (preview kept). Enter apply, Esc cancel');
          render();
          return;
        }
      }

      if (insideSelectedGeometry) {
        state.transformBatchDragging = true;
        state.transformBatchStartWorldX = p.world.x;
        state.transformBatchStartWorldY = p.world.y;
        state.transformBatchBaseById = new Map(
          [...state.transformSession.selectedIds]
            .map((id) => {
              const n = nodes.find((x) => x.id === id);
              return n ? [id, { x: n.x, y: n.y }] : null;
            })
            .filter(Boolean),
        );
        setStatus('Batch dragging preview... release mouse, Enter apply, Esc cancel');
      }
      return;
    }

    state.dragging = true;
    state.activeDragButton = e.button;
    state.pointerClientX = e.clientX;
    state.pointerClientY = e.clientY;
    document.body.classList.add('dragging-select-none');
    ensureAutoPanLoop();
    state.dragMoved = false;
    state.pendingClickNodeId = null;
    state.pendingClickAction = null;
    state.lastX = e.clientX;
    state.lastY = e.clientY;

    const p = getCanvasPointer(e);
    const endpointHit = getEdgeEndpointHit(p.world.x, p.world.y);
    const hit = hitTest(p.world.x, p.world.y);
    const resizeHit = getResizeHit(p.world.x, p.world.y);

    if (e.button === 0 && state.nPressed) {
      state.dragMode = 'node-create';
      state.nodeCreateStartWorldX = p.world.x;
      state.nodeCreateStartWorldY = p.world.y;
      state.nodeCreateWorldX = p.world.x;
      state.nodeCreateWorldY = p.world.y;
      setStatus('Creating node... drag to size, release to confirm');
      render();
      return;
    }

    if (e.button === 0 && state.mPressed) {
      if (!hit) {
        state.dragging = false;
        state.dragMode = null;
        setStatus('M-drag requires starting on a source node');
        return;
      }

      state.dragMode = 'mirror-create';
      state.mirrorCreateSourceNodeId = hit.id;
      state.mirrorCreateWorldX = p.world.x;
      state.mirrorCreateWorldY = p.world.y;
      setStatus(`Creating mirror from: ${hit.name}`);
      render();
      return;
    }

    if (e.button === 0 && state.cPressed) {
      const sourceNode = hit || (resizeHit ? resizeHit.node : null);
      if (sourceNode) {
        state.dragMode = 'edge-create';
        state.edgeCreateFromNodeId = sourceNode.id;
        state.edgeCreateStartWorldX = p.world.x;
        state.edgeCreateStartWorldY = p.world.y;
        state.edgeCreateWorldX = p.world.x;
        state.edgeCreateWorldY = p.world.y;
        setSingleNodeSelection(null);
        setStatus(`Creating edge from: ${sourceNode.name}`);
        render();
        return;
      }

      state.dragging = false;
      state.dragMode = null;
      setStatus('C-drag requires starting on a node');
      return;
    }

    const shiftSelect = e.shiftKey && e.button === 0;
    const ctrlSelect = e.ctrlKey && e.button === 0;
    if (shiftSelect || ctrlSelect) {
      state.dragMode = 'select-box';
      state.selectionMode = ctrlSelect ? 'add' : 'replace';
      state.selectionRectStartWorldX = p.world.x;
      state.selectionRectStartWorldY = p.world.y;
      state.selectionRectWorldX = p.world.x;
      state.selectionRectWorldY = p.world.y;
      setStatus(state.selectionMode === 'add' ? 'Additive box select...' : 'Box select...');
      render();
      return;
    }

    const startPan = e.button === 1 || e.button === 2;

    if (endpointHit) {
      setSingleEdgeSelection(endpointHit.edge.id);
      pushHistory();
      state.dragMode = 'edge-endpoint';
      state.draggedEdgeId = endpointHit.edge.id;
      state.draggedEdgeEnd = endpointHit.end;
      setStatus(`Moving edge endpoint: ${endpointHit.edge.id} (${endpointHit.end})`);
      rebuildSidebar();
      renderRightPanel();
      render();
      return;
    }

    if (resizeHit) {
      if (!state.selectedNodeIds.has(resizeHit.node.id)) setSingleNodeSelection(resizeHit.node.id);
      pushHistory();
      state.dragMode = 'resize';
      state.draggedNodeId = resizeHit.node.id;
      state.resizeHandle = resizeHit.handle;
      state.resizeStartWorldX = p.world.x;
      state.resizeStartWorldY = p.world.y;
      state.dragStartZoom = state.zoom;
      state.dragStartW = resizeHit.node.w;
      state.dragStartH = resizeHit.node.h;
      state.resizeSnapshot = new Map();
      for (const id of state.selectedNodeIds) {
        const n = nodes.find((x) => x.id === id);
        if (!n) continue;
        state.resizeSnapshot.set(id, { x: n.x, y: n.y, w: n.w, h: n.h });
      }
      setStatus(`Resizing ${state.selectedNodeIds.size} node(s) (${resizeHit.handle})`);
      rebuildSidebar();
      renderRightPanel();
      render();
      return;
    }

    if (startPan) {
      state.dragMode = 'pan';
      canvas.classList.add('dragging');
      setStatus('Panning view...');
      return;
    }

    if (!hit) {
      state.dragging = false;
      state.dragMode = null;
      return;
    }

    const isSingleSelectedHit = state.selectedNodeId === hit.id && state.selectedNodeIds.size === 1 && !state.selectedEdgeId;
    state.pendingClickNodeId = hit.id;
    state.pendingClickAction = isSingleSelectedHit ? 'deselect' : 'select';

    if (!state.selectedNodeIds.has(hit.id)) setSingleNodeSelection(hit.id);

    pushHistory();
    const dragRoots = [...state.selectedNodeIds].map((id) => nodes.find((n) => n.id === id)).filter(Boolean);
    // Only the explicitly selected nodes move. Contained nodes no longer follow
    // automatically -- double-click a node to grow the selection (see handleCanvasDoubleClick).
    const draggedIds = new Set(dragRoots.map((n) => n.id));
    const snapshotById = new Map();
    for (const n of nodes) {
      if (!draggedIds.has(n.id)) continue;
      snapshotById.set(n.id, { x: n.x, y: n.y, parentId: n.parentId });
    }
    state.nodeDragSnapshot = { draggedRootId: hit.id, draggedRootIds: dragRoots.map((n) => n.id), byId: snapshotById };
    state.nodeDragPreviewDx = 0;
    state.nodeDragPreviewDy = 0;

    state.dragMode = 'node';
    state.draggedNodeId = hit.id;
    state.dragOffsetX = p.world.x - hit.x;
    state.dragOffsetY = p.world.y - hit.y;
    state.selectedEdgeId = null;
    setStatus(`Dragging node: ${hit.name}`);
    rebuildSidebar();
    renderRightPanel();
    render();
  }

  return { handlePointerDown };
}
