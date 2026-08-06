export function createEditClipboardCommands(deps) {
  const {
    state,
    history,
    clipboard,
    nodes,
    edges,
    conflicts,
    canvas,
    normalizeSelectedNodeIds,
    getSelectedNode,
    getSelectedEdge,
    pushHistory,
    recomputeAllContainmentFromGeometry,
    recomputeContainmentForNodes,
    validateContainmentLayerOrder,
    getDescendantNodes,
    deepClone,
    getActiveLayerIndex,
    ensureNodeLayerFields,
    isPlacementLegal,
    restoreSnapshot,
    updateTopbar,
    rebuildSidebar,
    refreshHierarchyMeta,
    render,
    renderRightPanel,
    screenToWorld,
    setStatus,
  } = deps;

  function deleteSelectedElement() {
    normalizeSelectedNodeIds();
    const selectedNodeIds = [...state.selectedNodeIds];
    const selectedNode = getSelectedNode();
    const selectedRelation = getSelectedEdge();

    // Deleting a source that still has mirrors elsewhere cascades: confirm, then
    // delete those mirrors (and their edges) together with the source.
    const removeIds = new Set(selectedNodeIds);
    if (selectedNodeIds.length > 0) {
      const cascadeMirrors = nodes.filter((n) => n.isMirror && n.mirrorOfId
        && removeIds.has(n.mirrorOfId) && !removeIds.has(n.id));
      if (cascadeMirrors.length > 0) {
        const ok = window.confirm(`This node has ${cascadeMirrors.length} mirror(s). Deleting it will also delete them. Continue?`);
        if (!ok) {
          setStatus('Delete cancelled');
          return;
        }
        for (const m of cascadeMirrors) removeIds.add(m.id);
      }
    }

    if (selectedNodeIds.length > 0 || selectedRelation) pushHistory();

    if (selectedNodeIds.length > 0) {
      const oldParentById = new Map(nodes.map((n) => [n.id, n.parentId || null]));

      for (let i = edges.length - 1; i >= 0; i--) {
        const e = edges[i];
        if (removeIds.has(e.from) || removeIds.has(e.to)) edges.splice(i, 1);
      }

      for (let i = conflicts.length - 1; i >= 0; i--) {
        if (removeIds.has(conflicts[i].targetNodeId)) conflicts.splice(i, 1);
      }

      for (let i = nodes.length - 1; i >= 0; i--) {
        if (removeIds.has(nodes[i].id)) nodes.splice(i, 1);
      }

      recomputeAllContainmentFromGeometry();
      for (const n of nodes) {
        const oldParent = oldParentById.get(n.id) || null;
        if (n.parentId !== oldParent) {
          n.dirty = true;
        }
      }

      for (const id of removeIds) state.collapsed.delete(id);

      state.selectedNodeIds = new Set();
      state.selectedNodeId = null;
      state.selectedEdgeId = null;
      setStatus(`Deleted ${removeIds.size} selected node(s)`);
    } else if (selectedRelation) {
      const edgeIndex = edges.findIndex((e) => e.id === selectedRelation.id);
      if (edgeIndex >= 0) {
        edges.splice(edgeIndex, 1);
        state.selectedEdgeId = null;
        setStatus(`Deleted edge: ${selectedRelation.id}`);
      }
    } else {
      setStatus('Nothing selected to delete');
    }

    rebuildSidebar();
    refreshHierarchyMeta();
    render();
    renderRightPanel();
  }

  function deleteNodeByParams(params = {}) {
    const targetName = String(params.targetName || params.name || '').trim();
    if (!targetName) throw new Error('targetName is required');

    const exact = nodes.find((n) => String(n.name || '') === targetName);
    const fallback = nodes.find((n) => String(n.name || '').toLowerCase() === targetName.toLowerCase());
    const node = exact || fallback;
    if (!node) throw new Error(`node not found: ${targetName}`);

    // Deleting a source that still has mirrors requires explicit cascade so the
    // caller acknowledges the mirrors (and their edges) are removed too.
    const mirrors = nodes.filter((n) => n.isMirror && n.mirrorOfId === node.id);
    if (mirrors.length > 0 && !(params.cascade === true || params.force === true)) {
      throw new Error(`node "${node.name}" has ${mirrors.length} mirror(s); pass cascade:true to delete it together with its mirrors`);
    }

    state.selectedNodeIds = new Set([node.id, ...mirrors.map((m) => m.id)]);
    state.selectedNodeId = node.id;
    state.selectedEdgeId = null;
    deleteSelectedElement();
    return { deleted: true, targetName: String(node.name || ''), deletedMirrors: mirrors.length };
  }

  function deleteEdgeByParams(params = {}) {
    const edgeId = String(params.edgeId || '').trim();
    let edge = edgeId ? edges.find((item) => String(item.id || '') === edgeId) : null;

    if (!edge) {
      const fromName = String(params.fromName || params.from || '').trim();
      const toName = String(params.toName || params.to || '').trim();
      if (!fromName || !toName) throw new Error('edgeId or fromName/toName is required');

      const fromNode = nodes.find((n) => String(n.name || '') === fromName)
        || nodes.find((n) => String(n.name || '').toLowerCase() === fromName.toLowerCase());
      const toNode = nodes.find((n) => String(n.name || '') === toName)
        || nodes.find((n) => String(n.name || '').toLowerCase() === toName.toLowerCase());
      if (!fromNode) throw new Error(`from node not found: ${fromName}`);
      if (!toNode) throw new Error(`to node not found: ${toName}`);

      const matches = edges.filter((item) => item.from === fromNode.id && item.to === toNode.id);
      if (matches.length === 0) throw new Error(`edge not found: ${fromName} -> ${toName}`);
      if (matches.length > 1) throw new Error(`multiple edges found: ${fromName} -> ${toName}; use edgeId`);
      [edge] = matches;
    }

    state.selectedNodeIds = new Set();
    state.selectedNodeId = null;
    state.selectedEdgeId = edge.id;
    deleteSelectedElement();
    return { deleted: true, edgeId: String(edge.id || '') };
  }

  function collectSelectedSubgraph() {
    normalizeSelectedNodeIds();
    if (state.selectedNodeIds.size === 0) return null;

    const selectedIds = [...state.selectedNodeIds];
    const includeIds = new Set(selectedIds);
    for (const id of selectedIds) {
      for (const d of getDescendantNodes(id)) includeIds.add(d.id);
    }

    const subNodes = deepClone(nodes.filter((n) => includeIds.has(n.id)));
    const subEdges = deepClone(edges.filter((e) => includeIds.has(e.from) && includeIds.has(e.to)));

    return {
      selectedIds,
      nodeIds: includeIds,
      nodes: subNodes,
      edges: subEdges,
    };
  }

  function makeDuplicateId(baseId, existingIds) {
    let i = 0;
    while (true) {
      const candidate = `${baseId}_Duplicate${i}`;
      if (!existingIds.has(candidate)) {
        existingIds.add(candidate);
        return candidate;
      }
      i += 1;
    }
  }

  function makeDuplicateName(baseName, existingNames) {
    const normalizedBase = String(baseName || 'Node').trim() || 'Node';
    if (!existingNames.has(normalizedBase)) {
      existingNames.add(normalizedBase);
      return normalizedBase;
    }

    let i = 0;
    while (true) {
      const candidate = `${normalizedBase}_Duplicate${i}`;
      if (!existingNames.has(candidate)) {
        existingNames.add(candidate);
        return candidate;
      }
      i += 1;
    }
  }

  function copySelectionToClipboard(mode = 'copy') {
    const sub = collectSelectedSubgraph();
    if (!sub) {
      setStatus('Nothing selected to copy');
      return false;
    }

    clipboard.kind = 'nodes';
    clipboard.mode = mode;
    clipboard.nodes = sub.nodes;
    clipboard.edges = sub.edges;
    clipboard.sourceSelectionIds = sub.selectedIds;
    clipboard.ts = Date.now();

    setStatus(`${mode === 'cut' ? 'Cut' : 'Copied'} ${sub.nodes.length} node(s), ${sub.edges.length} edge(s)`);
    return true;
  }

  function cutSelectionToClipboard() {
    const ok = copySelectionToClipboard('cut');
    if (!ok) return;
    deleteSelectedElement();
  }

  function getPasteAnchorWorld() {
    if (Number.isFinite(state.pointerWorldX) && Number.isFinite(state.pointerWorldY)) {
      return { x: state.pointerWorldX, y: state.pointerWorldY };
    }
    return screenToWorld(canvas.clientWidth * 0.5, canvas.clientHeight * 0.5);
  }

  function buildClipboardDraftAt(targetWorldX, targetWorldY) {
    const sourceNodes = deepClone(clipboard.nodes);
    const sourceEdges = deepClone(clipboard.edges || []);
    const minX = Math.min(...sourceNodes.map((n) => n.x));
    const minY = Math.min(...sourceNodes.map((n) => n.y));
    const dx = targetWorldX - minX;
    const dy = targetWorldY - minY;

    const existingNodeIds = new Set(nodes.map((n) => n.id));
    const existingEdgeIds = new Set(edges.map((e) => e.id));
    const existingNames = new Set(nodes.map((n) => String(n.name || '').trim()).filter(Boolean));
    const idMap = new Map();

    for (const n of sourceNodes) {
      idMap.set(n.id, makeDuplicateId(n.id, existingNodeIds));
    }

    const pastedNodes = sourceNodes.map((n) => {
      const next = deepClone(n);
      next.id = idMap.get(n.id);
      next.name = makeDuplicateName(n.name, existingNames);
      next.x += dx;
      next.y += dy;
      next.parentId = n.parentId && idMap.has(n.parentId) ? idMap.get(n.parentId) : null;
      next.createdLayer = getActiveLayerIndex();
      ensureNodeLayerFields(next);
      next.dirty = true;
      next.revision = 1;
      return next;
    });

    const pastedEdges = sourceEdges.map((e) => {
      const next = deepClone(e);
      next.id = makeDuplicateId(e.id, existingEdgeIds);
      next.from = idMap.get(e.from);
      next.to = idMap.get(e.to);
      next.createdLayer = getActiveLayerIndex();
      return next;
    }).filter((e) => e.from && e.to);

    return { pastedNodes, pastedEdges };
  }

  function updatePastePreview() {
    if (!state.pastePreviewActive || clipboard.kind !== 'nodes' || !clipboard.nodes.length) return;
    const anchor = getPasteAnchorWorld();
    const draft = buildClipboardDraftAt(anchor.x, anchor.y);
    state.pastePreviewNodes = draft.pastedNodes;
  }

  function beginPastePreview() {
    if (clipboard.kind !== 'nodes' || !Array.isArray(clipboard.nodes) || clipboard.nodes.length === 0) {
      setStatus('Clipboard is empty');
      return;
    }
    state.pastePreviewActive = true;
    updatePastePreview();
    setStatus('Paste preview: release Ctrl/Cmd+V to confirm');
    render();
  }

  function finalizePasteFromPreview() {
    if (!state.pastePreviewActive) return;
    state.pastePreviewActive = false;

    const anchor = getPasteAnchorWorld();
    const { pastedNodes, pastedEdges } = buildClipboardDraftAt(anchor.x, anchor.y);

    for (const n of pastedNodes) {
      if (!isPlacementLegal(n)) {
        state.pastePreviewNodes = [];
        render();
        setStatus(`Paste failed: spatial conflict for ${n.id}`);
        return;
      }
    }

    pushHistory();
    nodes.push(...pastedNodes);
    edges.push(...pastedEdges);
    // Only the freshly pasted nodes changed geometry; incremental recompute
    // avoids the O(n²) full rediscovery over the whole graph.
    recomputeContainmentForNodes(pastedNodes);

    const layerOrderConflict = validateContainmentLayerOrder();
    if (layerOrderConflict) {
      if (history.past.length > 0) {
        const prev = history.past.pop();
        restoreSnapshot(prev);
      }
      state.pastePreviewNodes = [];
      render();
      setStatus(`Paste failed: child layer (${layerOrderConflict.child.name}) cannot be earlier than parent (${layerOrderConflict.parent.name})`);
      return;
    }

    state.selectedNodeIds = new Set(pastedNodes.map((n) => n.id));
    state.selectedNodeId = pastedNodes[0]?.id || null;
    state.selectedEdgeId = null;
    state.pastePreviewNodes = [];

    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();
    setStatus(`Pasted ${pastedNodes.length} node(s), ${pastedEdges.length} edge(s)`);
  }

  return {
    deleteSelectedElement,
    deleteNodeByParams,
    deleteEdgeByParams,
    collectSelectedSubgraph,
    makeDuplicateId,
    makeDuplicateName,
    copySelectionToClipboard,
    cutSelectionToClipboard,
    getPasteAnchorWorld,
    buildClipboardDraftAt,
    updatePastePreview,
    beginPastePreview,
    finalizePasteFromPreview,
  };
}
