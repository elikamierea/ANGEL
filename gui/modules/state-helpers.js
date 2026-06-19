export function createStateHelpers(deps) {
  const {
    nodes,
    edges,
    conflicts,
    state,
    history,
    layerSelect,
    refreshHierarchyMeta,
    updateTopbar,
    rebuildSidebar,
    renderConflicts,
    render,
    renderRightPanel,
    setStatus,
  } = deps;

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function replaceArray(target, source) {
    target.length = 0;
    target.push(...source);
  }

  function takeSnapshot() {
    return {
      nodes: deepClone(nodes),
      edges: deepClone(edges),
      conflicts: deepClone(conflicts),
      selectedNodeId: state.selectedNodeId,
      selectedNodeIds: [...state.selectedNodeIds],
      selectedEdgeId: state.selectedEdgeId,
      collapsed: [...state.collapsed],
      activeLayer: state.activeLayer,
      revision: state.revision,
    };
  }

  function restoreSnapshot(snapshot) {
    replaceArray(nodes, deepClone(snapshot.nodes || []));
    replaceArray(edges, deepClone(snapshot.edges || []));
    replaceArray(conflicts, deepClone(snapshot.conflicts || []));

    state.selectedNodeId = snapshot.selectedNodeId || null;
    state.selectedNodeIds = new Set(snapshot.selectedNodeIds || (snapshot.selectedNodeId ? [snapshot.selectedNodeId] : []));
    state.selectedEdgeId = snapshot.selectedEdgeId || null;
    state.collapsed = new Set(snapshot.collapsed || []);
    const templateLayers = Array.isArray(state.projectTemplate?.layers) ? state.projectTemplate.layers.map((v) => String(v)) : [];
    const fallbackLayer = String(state.projectTemplate?.defaultActiveLayer || templateLayers[0] || 'L1');
    const snapshotLayer = String(snapshot.activeLayer || '');
    state.activeLayer = templateLayers.length > 0
      ? (templateLayers.includes(snapshotLayer) ? snapshotLayer : fallbackLayer)
      : (snapshotLayer || fallbackLayer);
    state.revision = Number(snapshot.revision) || 1;

    layerSelect.value = state.activeLayer;
    refreshHierarchyMeta();
    updateTopbar();
    rebuildSidebar();
    renderConflicts();
    render();
    renderRightPanel();
  }

  function pushHistory() {
    history.past.push(takeSnapshot());
    if (history.past.length > history.max) history.past.shift();
    history.future.length = 0;
  }

  function undo() {
    if (history.past.length === 0) {
      setStatus('Nothing to undo');
      return;
    }

    history.future.push(takeSnapshot());
    const prev = history.past.pop();
    restoreSnapshot(prev);
    setStatus('Undo');
  }

  function redo() {
    if (history.future.length === 0) {
      setStatus('Nothing to redo');
      return;
    }

    history.past.push(takeSnapshot());
    const next = history.future.pop();
    restoreSnapshot(next);
    setStatus('Redo');
  }

  function getConflictCount() {
    return conflicts.length;
  }

  function getSelectedNode() {
    return nodes.find((n) => n.id === state.selectedNodeId) || null;
  }

  function normalizeSelectedNodeIds() {
    if (!(state.selectedNodeIds instanceof Set)) state.selectedNodeIds = new Set();
    if (state.selectedNodeId) state.selectedNodeIds.add(state.selectedNodeId);
    const existing = new Set(nodes.map((n) => n.id));
    for (const id of [...state.selectedNodeIds]) {
      if (!existing.has(id)) state.selectedNodeIds.delete(id);
    }
    if (state.selectedNodeIds.size === 0) {
      state.selectedNodeId = null;
    } else if (!state.selectedNodeId || !state.selectedNodeIds.has(state.selectedNodeId)) {
      state.selectedNodeId = [...state.selectedNodeIds][0];
    }
  }

  function setSingleNodeSelection(nodeId) {
    state.selectedNodeId = nodeId || null;
    state.selectedNodeIds = nodeId ? new Set([nodeId]) : new Set();
    state.selectedEdgeId = null;
  }

  function getSelectionRectWorld() {
    const x1 = Math.min(state.selectionRectStartWorldX, state.selectionRectWorldX);
    const y1 = Math.min(state.selectionRectStartWorldY, state.selectionRectWorldY);
    const x2 = Math.max(state.selectionRectStartWorldX, state.selectionRectWorldX);
    const y2 = Math.max(state.selectionRectStartWorldY, state.selectionRectWorldY);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  return {
    deepClone,
    replaceArray,
    takeSnapshot,
    restoreSnapshot,
    pushHistory,
    undo,
    redo,
    getConflictCount,
    getSelectedNode,
    normalizeSelectedNodeIds,
    setSingleNodeSelection,
    getSelectionRectWorld,
  };
}
