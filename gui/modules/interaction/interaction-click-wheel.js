export function createInteractionClickWheel(deps) {
  const {
    state,
    nodes,
    edges,
    getDescendantNodes,
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

    // The second click of a double-click would otherwise toggle/collapse the
    // selection right before handleCanvasDoubleClick runs. Ignore it; the
    // double-click handler owns selection growth.
    if (e.detail > 1) return;

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
      } else if (state.selectedNodeIds.has(hit.id) && state.selectedNodeIds.size > 1) {
        // Clicking a member of a multi-selection keeps the whole group intact
        // (just makes it the primary node), so the batch stays selected for
        // dragging or for double-click expansion.
        state.selectedNodeId = hit.id;
        state.selectedEdgeId = null;
        setStatus(`Selected ${state.selectedNodeIds.size} node(s)`);
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

  // Grow a selection set by ONE category, returning a new Set. Categories are
  // tried in priority order and the FIRST non-empty one is consumed whole:
  //   1. containment  -> the entire subtree(s) of the current selection
  //   2. solid edges  -> every node reachable through solid edges + contents
  //   3. dashed edges -> every node reachable through dashed edges + contents
  //   4. dotted edges -> every node reachable through dotted edges + contents
  // Edge categories expand transitively, so a whole connected group comes in at
  // once; a looser style is only considered after the tighter ones are
  // exhausted at the boundary. Empty categories are skipped.
  function expandSelectionOnce(baseIds) {
    const result = new Set(baseIds);

    // Category 1: containment — pull in the entire subtree(s).
    const contained = [];
    for (const id of baseIds) {
      for (const d of getDescendantNodes(id)) {
        if (!result.has(d.id)) contained.push(d.id);
      }
    }
    if (contained.length) {
      for (const id of contained) result.add(id);
      return result;
    }

    // Categories 2-4: edge connectivity, one style at a time, transitively.
    // Each added node also pulls everything it contains; those contents may in
    // turn expose more same-style edges, so we loop until the set stabilises.
    for (const style of ['solid', 'dashed', 'dotted']) {
      let addedAny = false;
      for (;;) {
        const newcomers = [];
        for (const edge of edges) {
          if (String(edge.strokeStyle || 'solid') !== style) continue;
          const fromIn = result.has(edge.from);
          const toIn = result.has(edge.to);
          if (fromIn === toIn) continue; // edge does not cross the selection boundary
          const neighborId = fromIn ? edge.to : edge.from;
          if (result.has(neighborId)) continue;
          newcomers.push(neighborId);
          for (const d of getDescendantNodes(neighborId)) newcomers.push(d.id);
        }
        if (!newcomers.length) break;
        for (const id of newcomers) result.add(id);
        addedAny = true;
      }
      if (addedAny) return result;
    }

    return result; // fully expanded: nothing left to add
  }

  // Double-clicking grows the CURRENT selection (the whole batch) by one
  // category. No per-anchor counter is needed: because clicking a member of a
  // multi-selection no longer collapses it, the grown selection persists, so a
  // run of double-clicks naturally cascades one category at a time. The
  // double-clicked node is always included, so a fresh double-click starts a
  // group from it.
  function handleCanvasDoubleClick(e) {
    if (state.transformSession) return;

    const p = getCanvasPointer(e);
    const hit = hitTest(p.world.x, p.world.y);
    if (!hit) return;

    flushInspectorPendingEdits();

    const base = new Set(state.selectedNodeIds);
    base.add(hit.id);
    const grown = expandSelectionOnce(base);

    state.selectedNodeIds = grown;
    state.selectedNodeId = hit.id;
    state.selectedEdgeId = null;
    state.pendingClickNodeId = null;
    state.pendingClickAction = null;

    setStatus(`Selection group: ${grown.size} node(s)`);
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
    handleCanvasDoubleClick,
    handleCanvasWheel,
  };
}
