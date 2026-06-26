export function createTransformSessionController(deps) {
  const {
    nodes,
    edges,
    state,
    takeSnapshot,
    restoreSnapshot,
    setStatus,
    render,
    getSelectionBBoxFromSession,
    recomputeAllContainmentFromGeometry,
    findSpatialConflict,
    validateContainmentLayerOrder,
    pushHistory,
    updateTopbar,
    rebuildSidebar,
    renderRightPanel,
  } = deps;

  function cloneAnchor(anchor) {
    if (!anchor || typeof anchor !== 'object') return null;
    return {
      side: String(anchor.side || 'right'),
      t: Number(anchor.t),
    };
  }

  function anchorsEqual(a, b) {
    const aa = cloneAnchor(a);
    const bb = cloneAnchor(b);
    if (!aa && !bb) return true;
    if (!aa || !bb) return false;
    return aa.side === bb.side && Math.abs((aa.t || 0) - (bb.t || 0)) <= 1e-9;
  }

  function captureTransformSubset(session) {
    const nodesById = new Map();
    const edgeAnchors = new Map();
    const selectedIds = session?.selectedIds || new Set();

    for (const id of selectedIds) {
      const n = nodes.find((x) => x.id === id);
      if (!n) continue;
      nodesById.set(id, { x: n.x, y: n.y, w: n.w, h: n.h, parentId: n.parentId || null });
    }

    for (const e of edges) {
      const item = {};
      let touched = false;
      if (selectedIds.has(e.from)) {
        item.fromAnchor = cloneAnchor(e.fromAnchor);
        touched = true;
      }
      if (selectedIds.has(e.to)) {
        item.toAnchor = cloneAnchor(e.toAnchor);
        touched = true;
      }
      if (touched) edgeAnchors.set(e.id, item);
    }

    return { nodesById, edgeAnchors };
  }

  function buildTransformDelta(beforeSubset, afterSubset) {
    const nodeChanges = [];
    const edgeChanges = [];

    const allNodeIds = new Set([...beforeSubset.nodesById.keys(), ...afterSubset.nodesById.keys()]);
    for (const id of allNodeIds) {
      const before = beforeSubset.nodesById.get(id) || null;
      const after = afterSubset.nodesById.get(id) || null;
      const same = before && after
        && Math.abs(before.x - after.x) <= 1e-9
        && Math.abs(before.y - after.y) <= 1e-9
        && Math.abs(before.w - after.w) <= 1e-9
        && Math.abs(before.h - after.h) <= 1e-9
        && (before.parentId || null) === (after.parentId || null);
      if (!same) nodeChanges.push({ id, before, after });
    }

    const allEdgeIds = new Set([...beforeSubset.edgeAnchors.keys(), ...afterSubset.edgeAnchors.keys()]);
    for (const id of allEdgeIds) {
      const before = beforeSubset.edgeAnchors.get(id) || {};
      const after = afterSubset.edgeAnchors.get(id) || {};

      if (!anchorsEqual(before.fromAnchor, after.fromAnchor)) {
        edgeChanges.push({ id, end: 'from', before: cloneAnchor(before.fromAnchor), after: cloneAnchor(after.fromAnchor) });
      }
      if (!anchorsEqual(before.toAnchor, after.toAnchor)) {
        edgeChanges.push({ id, end: 'to', before: cloneAnchor(before.toAnchor), after: cloneAnchor(after.toAnchor) });
      }
    }

    return { nodeChanges, edgeChanges };
  }

  function applyTransformDelta(delta, dir = 'undo') {
    for (const ch of delta.nodeChanges || []) {
      const node = nodes.find((n) => n.id === ch.id);
      if (!node) continue;
      const payload = dir === 'undo' ? ch.before : ch.after;
      if (!payload) continue;
      node.x = payload.x;
      node.y = payload.y;
      node.w = payload.w;
      node.h = payload.h;
      node.parentId = payload.parentId || null;
    }

    for (const ch of delta.edgeChanges || []) {
      const edge = edges.find((e) => e.id === ch.id);
      if (!edge) continue;
      const payload = dir === 'undo' ? ch.before : ch.after;
      if (ch.end === 'from') edge.fromAnchor = cloneAnchor(payload);
      if (ch.end === 'to') edge.toAnchor = cloneAnchor(payload);
    }
  }

  function resetTransformRuntimeFlags() {
    state.transformStretchDragging = false;
    state.transformStretchHandle = null;
    state.transformStretchBaseBox = null;
    state.transformStretchBaseById = null;
    state.transformBatchDragging = false;
    state.transformBatchStartWorldX = 0;
    state.transformBatchStartWorldY = 0;
    state.transformBatchBaseById = null;
  }

  function beginTransformSession(label, mode = 'generic', selectedNodes = null) {
    if (state.transformSession) cancelTransformSession('Transform replaced');

    const inferred = Array.isArray(selectedNodes)
      ? selectedNodes
      : [...(state.selectedNodeIds || new Set())].map((id) => nodes.find((n) => n.id === id)).filter(Boolean);

    if (!Array.isArray(inferred) || inferred.length < 2) {
      setStatus('Need multiple selected nodes');
      return false;
    }

    const minX = Math.min(...inferred.map((n) => n.x));
    const minY = Math.min(...inferred.map((n) => n.y));
    const maxX = Math.max(...inferred.map((n) => n.x + n.w));
    const maxY = Math.max(...inferred.map((n) => n.y + n.h));

    const startSnapshot = takeSnapshot();
    const selectedIds = new Set(inferred.map((n) => n.id));
    const initialSubset = captureTransformSubset({ selectedIds });

    state.transformSession = {
      label,
      mode,
      snapshot: startSnapshot,
      selectedIds,
      bboxAtStart: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      localUndo: [],
      localRedo: [],
      lastSubset: initialSubset,
    };

    resetTransformRuntimeFlags();
    setStatus(`${label} preview: press Enter to apply, Esc to cancel`);
    return true;
  }

  function cancelTransformSession(reason = 'Transform cancelled') {
    if (!state.transformSession) return;
    const snap = state.transformSession.snapshot;
    state.transformSession = null;
    resetTransformRuntimeFlags();
    restoreSnapshot(snap);
    setStatus(reason);
  }

  function pushTransformPreviewCheckpoint() {
    if (!state.transformSession) return;
    const nextSubset = captureTransformSubset(state.transformSession);
    const prevSubset = state.transformSession.lastSubset || nextSubset;
    const delta = buildTransformDelta(prevSubset, nextSubset);
    const changed = (delta.nodeChanges?.length || 0) > 0 || (delta.edgeChanges?.length || 0) > 0;
    if (!changed) return;

    state.transformSession.localUndo = state.transformSession.localUndo || [];
    state.transformSession.localRedo = [];
    state.transformSession.localUndo.push(delta);
    if (state.transformSession.localUndo.length > 80) state.transformSession.localUndo.shift();
    state.transformSession.lastSubset = nextSubset;
  }

  function undoWithinTransformSessionOrExit() {
    if (!state.transformSession) return false;
    const undoStack = state.transformSession.localUndo || [];
    const redoStack = state.transformSession.localRedo || [];

    if (undoStack.length > 0) {
      const delta = undoStack.pop();
      applyTransformDelta(delta, 'undo');
      redoStack.push(delta);
      state.transformSession.localUndo = undoStack;
      state.transformSession.localRedo = redoStack;
      state.transformSession.lastSubset = captureTransformSubset(state.transformSession);
      state.transformSession.bboxAtStart = getSelectionBBoxFromSession();
      resetTransformRuntimeFlags();
      setStatus(`Transform preview undo (${undoStack.length} step(s) left)`);
      render();
      return true;
    }

    state.transformSession = null;
    resetTransformRuntimeFlags();
    setStatus('Transform preview finished (no more local undo)');
    render();
    return true;
  }

  function redoWithinTransformSession() {
    if (!state.transformSession) return false;
    const redoStack = state.transformSession.localRedo || [];
    const undoStack = state.transformSession.localUndo || [];
    if (redoStack.length === 0) return false;

    const delta = redoStack.pop();
    applyTransformDelta(delta, 'redo');
    undoStack.push(delta);
    state.transformSession.localUndo = undoStack;
    state.transformSession.localRedo = redoStack;
    state.transformSession.lastSubset = captureTransformSubset(state.transformSession);
    state.transformSession.bboxAtStart = getSelectionBBoxFromSession();
    resetTransformRuntimeFlags();
    setStatus(`Transform preview redo (${redoStack.length} redo step(s) left)`);
    render();
    return true;
  }

  function finalizeTransformSession() {
    if (!state.transformSession) return false;
    const snap = state.transformSession.snapshot;

    recomputeAllContainmentFromGeometry();
    const conflict = findSpatialConflict(nodes);
    const layerConflict = validateContainmentLayerOrder();

    if (conflict || layerConflict) {
      const message = conflict
        ? `Transform reverted: illegal overlap (${conflict.a.name} vs ${conflict.b.name})`
        : `Transform reverted: child layer cannot be earlier than parent (${layerConflict.child.name} -> ${layerConflict.parent.name})`;
      state.transformSession = null;
      restoreSnapshot(snap);
      setStatus(message);
      return false;
    }

    pushHistory();
    const touched = [];
    for (const id of state.transformSession.selectedIds) {
      const node = nodes.find((n) => n.id === id);
      if (!node) continue;
      node.dirty = true;
      node.revision += 1;
      touched.push(node.id);
    }

    state.selectedNodeIds = new Set(touched);
    state.selectedNodeId = touched[0] || null;
    state.selectedEdgeId = null;
    state.transformSession = null;
    resetTransformRuntimeFlags();

    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();
    setStatus('Transform applied');
    return true;
  }

  return {
    beginTransformSession,
    cancelTransformSession,
    pushTransformPreviewCheckpoint,
    undoWithinTransformSessionOrExit,
    redoWithinTransformSession,
    finalizeTransformSession,
  };
}
