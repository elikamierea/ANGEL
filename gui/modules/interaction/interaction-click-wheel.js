export function createInteractionClickWheel(deps) {
  const {
    state,
    getCanvasPointer,
    getSelectionBBoxFromSession,
    getRectResizeHandleAt,
    getEdgeEndpointHit,
    getEdgeBodyHit,
    hitTest,
    flushInspectorPendingEdits,
    setSingleEdgeSelection,
    setSingleNodeSelection,
    setStatus,
    rebuildSidebar,
    render,
    renderRightPanel,
    finalizeTransformSession,
    screenToWorld,
  } = deps;

  function handleCanvasClick(e) {
    if (state.suppressClick) {
      state.suppressClick = false;
      return;
    }

    if (state.transformSession) {
      const p = getCanvasPointer(e);
      const hit = hitTest(p.world.x, p.world.y);
      const clickedUnselectedNode = Boolean(hit) && !state.transformSession.selectedIds.has(hit.id);
      if (e.button === 0 && (!hit || clickedUnselectedNode)) {
        finalizeTransformSession?.();
        return;
      }

      if (state.transformSession.mode === 'stretch_bbox') {
        const bbox = getSelectionBBoxFromSession();
        const handle = bbox ? getRectResizeHandleAt(bbox, p.world.x, p.world.y) : null;
        const insideSelectedGeometry = Boolean(hit) && state.transformSession.selectedIds.has(hit.id);
        if (!handle && !insideSelectedGeometry) {
          state.transformSession.mode = 'generic';
          setStatus('Stretch mode exited (preview kept). Enter apply, Esc cancel');
          render();
        }
      }
      return;
    }
    if (state.suppressClick) {
      state.suppressClick = false;
      return;
    }

    const p = getCanvasPointer(e);
    const endpointHit = getEdgeEndpointHit(p.world.x, p.world.y);
    const edgeHit = getEdgeBodyHit(p.world.x, p.world.y);
    const hit = hitTest(p.world.x, p.world.y);

    flushInspectorPendingEdits();

    if (endpointHit || edgeHit) {
      const edge = endpointHit ? endpointHit.edge : edgeHit;
      setSingleEdgeSelection(edge.id);
      setStatus(`Selected edge: ${edge.id}`);
    } else if (hit) {
      if (e.ctrlKey) {
        if (state.selectedNodeIds.has(hit.id)) {
          state.selectedNodeIds.delete(hit.id);
          state.selectedNodeId = state.selectedNodeIds.size ? [...state.selectedNodeIds][0] : null;
          state.selectedEdgeId = null;
          setStatus(`Removed from selection: ${hit.name}`);
        } else {
          state.selectedNodeIds.add(hit.id);
          state.selectedNodeId = hit.id;
          state.selectedEdgeId = null;
          setStatus(`Added to selection: ${hit.name}`);
        }
      } else if (state.pendingClickNodeId === hit.id && state.pendingClickAction === 'deselect') {
        setSingleNodeSelection(null);
        setStatus(`Deselected: ${hit.name}`);
      } else {
        setSingleNodeSelection(hit.id);
        setStatus(`Selected: ${hit.name}`);
      }
      state.pendingClickNodeId = null;
      state.pendingClickAction = null;
    } else {
      setSingleNodeSelection(null);
      setStatus('Selection cleared');
      state.pendingClickNodeId = null;
      state.pendingClickAction = null;
    }

    rebuildSidebar();
    render();
    renderRightPanel();
  }

  function handleCanvasWheel(e) {
    e.preventDefault();

    const p = getCanvasPointer(e);
    const worldBefore = screenToWorld(p.sx, p.sy);

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextZoom = Math.max(0.0001, state.zoom * factor);
    state.zoom = nextZoom;

    state.panX = p.sx - worldBefore.x * state.zoom;
    state.panY = p.sy - worldBefore.y * state.zoom;

    setStatus(`Zoom: ${state.zoom.toFixed(4)}x`);
    render();
  }

  return {
    handleCanvasClick,
    handleCanvasWheel,
  };
}
