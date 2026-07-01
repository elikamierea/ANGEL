export function createInteractionPointerUp(deps) {
  const {
    state,
    canvas,
    history,
    nodes,
    edges,
    CREATE_NODE_CAMERA_WIDTH_RATIO,
    CREATE_NODE_ASPECT_RATIO,
    MIN_NODE_SCREEN_PX,
    MIRROR_DEFAULT_DETAIL,
    pushTransformPreviewCheckpoint,
    pushHistory,
    restoreSnapshot,
    getSelectionRectWorld,
    getNodesInRect,
    nextNodeId,
    nextEdgeId,
    isPlacementLegal,
    findSmallestContainerForRect,
    getActiveLayerIndex,
    getAllLayerIds,
    recomputeAllContainmentFromGeometry,
    validateContainmentLayerOrder,
    setSingleNodeSelection,
    updateTopbar,
    rebuildSidebar,
    renderRightPanel,
    findSpatialConflict,
    getDescendantNodes,
    getCanvasPointer,
    hitTest,
    buildEdgeAnchors,
    getNodeLayerContent,
    nextAvailableMirrorName,
    normalizeColorIndex,
    setStatus,
    render,
  } = deps;

  function buildLayerContentSeed(synopsis, detail, status) {
    return Object.fromEntries(getAllLayerIds().map((lid) => [lid, { synopsis, detail, status, resourceBindings: [] }]));
  }

  function handlePointerUp(e) {
    if (state.transformSession && state.transformBatchDragging && e.button === 0) {
      state.transformBatchDragging = false;
      state.transformBatchStartWorldX = 0;
      state.transformBatchStartWorldY = 0;
      state.transformBatchBaseById = null;
      pushTransformPreviewCheckpoint();
      state.suppressClick = true;
      setStatus('Batch drag preview ready: Enter apply, Esc cancel');
      return;
    }

    if (state.transformSession?.mode === 'stretch_bbox' && state.transformStretchDragging && e.button === 0) {
      state.transformStretchDragging = false;
      state.transformStretchHandle = null;
      state.transformStretchBaseBox = null;
      state.transformStretchBaseById = null;
      pushTransformPreviewCheckpoint();
      state.suppressClick = true;
      setStatus('Stretch preview ready: click outside box to exit stretch mode, Enter apply, Esc cancel');
      return;
    }

    if (!state.dragging) return;
    if (state.activeDragButton !== null && e.button !== state.activeDragButton) return;
    document.body.classList.remove('dragging-select-none');

    if (state.dragMode === 'select-box') {
      const rect = getSelectionRectWorld();
      const hits = getNodesInRect(rect, { includeHidden: true }).map((n) => n.id);
      if (state.selectionMode === 'add') {
        for (const id of hits) {
          if (state.selectedNodeIds.has(id)) state.selectedNodeIds.delete(id);
          else state.selectedNodeIds.add(id);
        }
      } else {
        state.selectedNodeIds = new Set(hits);
      }
      state.selectedNodeId = state.selectedNodeIds.size ? [...state.selectedNodeIds][0] : null;
      state.selectedEdgeId = null;
      setStatus(`Selected ${state.selectedNodeIds.size} node(s)`);
      rebuildSidebar();
      renderRightPanel();
    }

    if (state.dragMode === 'node-create') {
      const moved = state.dragMoved;
      let draftRect;
      if (moved) {
        const x1 = Math.min(state.nodeCreateStartWorldX, state.nodeCreateWorldX);
        const y1 = Math.min(state.nodeCreateStartWorldY, state.nodeCreateWorldY);
        const x2 = Math.max(state.nodeCreateStartWorldX, state.nodeCreateWorldX);
        const y2 = Math.max(state.nodeCreateStartWorldY, state.nodeCreateWorldY);
        draftRect = { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
      } else {
        const cameraWorldWidth = canvas.clientWidth / state.zoom;
        const draftW = cameraWorldWidth * CREATE_NODE_CAMERA_WIDTH_RATIO;
        const draftH = draftW / CREATE_NODE_ASPECT_RATIO;
        draftRect = {
          x: state.nodeCreateStartWorldX - draftW / 2,
          y: state.nodeCreateStartWorldY - draftH / 2,
          w: draftW,
          h: draftH,
        };
      }

      // Enforce the shared minimum node size (32 screen px) on creation.
      const minCreateWorld = MIN_NODE_SCREEN_PX / state.zoom;
      draftRect.w = Math.max(minCreateWorld, draftRect.w);
      draftRect.h = Math.max(minCreateWorld, draftRect.h);

      if (!isPlacementLegal(draftRect)) {
        setStatus('Create cancelled: illegal overlap (must be disjoint or containment)');
      } else {
        const id = nextNodeId();
        const container = findSmallestContainerForRect(draftRect);
        const node = {
          id,
          name: `Node ${id}`,
          synopsis: '',
          detail: '',
          status: 'active',
          createdLayer: state.activeLayer,
          layerContent: buildLayerContentSeed('', '', 'active'),
          tags: [],
          blocked: false,
          dirty: true,
          unbound: true,
          revision: 1,
          colorIndex: container ? normalizeColorIndex(container.colorIndex) : 0,
          x: draftRect.x,
          y: draftRect.y,
          w: draftRect.w,
          h: draftRect.h,
          parentId: container ? container.id : null,
          childCount: 0,
          validation: [{ level: 'info', message: 'New node created by user.' }],
        };
        pushHistory();
        nodes.push(node);
        recomputeAllContainmentFromGeometry();
        const layerOrderConflict = validateContainmentLayerOrder();
        if (layerOrderConflict) {
          if (history.past.length > 0) {
            const prev = history.past.pop();
            restoreSnapshot(prev);
          }
          setStatus(`Create cancelled: child layer cannot be earlier than parent (${layerOrderConflict.child.name} -> ${layerOrderConflict.parent.name})`);
        } else {
          setSingleNodeSelection(id);
          updateTopbar();
          rebuildSidebar();
          renderRightPanel();
          setStatus(`Created node: ${node.name}${container ? ` (parent: ${container.name})` : ''}`);
          state.suppressClick = true;
        }
      }
    }

    if (state.dragMode === 'node' && state.draggedNodeId) {
      const movedRoots = (state.nodeDragSnapshot?.draggedRootIds || [])
        .map((id) => nodes.find((n) => n.id === id))
        .filter(Boolean);

      if (movedRoots.length > 0 && state.dragMoved) {
        const snap = state.nodeDragSnapshot?.byId;
        if (snap) {
          for (const [id, info] of snap.entries()) {
            const cur = nodes.find((n) => n.id === id);
            if (!cur) continue;
            cur.x = info.x + state.nodeDragPreviewDx;
            cur.y = info.y + state.nodeDragPreviewDy;
            cur.parentId = info.parentId;
          }
        }

        let invalidContainment = false;
        for (const root of movedRoots) {
          const subtreeIds = new Set([root.id, ...getDescendantNodes(root.id).map((n) => n.id)]);
          const legalContainer = findSmallestContainerForRect(root, root.id);
          if (legalContainer && subtreeIds.has(legalContainer.id)) {
            invalidContainment = true;
            break;
          }
          root.parentId = legalContainer ? legalContainer.id : null;
        }

        const conflict = invalidContainment ? null : findSpatialConflict(nodes);
        if (invalidContainment || conflict) {
          if (snap) {
            for (const [id, info] of snap.entries()) {
              const cur = nodes.find((n) => n.id === id);
              if (!cur) continue;
              cur.x = info.x;
              cur.y = info.y;
              cur.parentId = info.parentId;
            }
          }
          if (history.past.length > 0) history.past.pop();
          setStatus(invalidContainment
            ? 'Move cancelled: illegal containment target'
            : `Move cancelled: illegal overlap (${conflict.a.name} vs ${conflict.b.name})`);
        } else {
          recomputeAllContainmentFromGeometry();
          const layerOrderConflict = validateContainmentLayerOrder();
          if (layerOrderConflict) {
            if (snap) {
              for (const [id, info] of snap.entries()) {
                const cur = nodes.find((n) => n.id === id);
                if (!cur) continue;
                cur.x = info.x;
                cur.y = info.y;
                cur.parentId = info.parentId;
              }
            }
            if (history.past.length > 0) history.past.pop();
            setStatus(`Move cancelled: child layer cannot be earlier than parent (${layerOrderConflict.child.name} -> ${layerOrderConflict.parent.name})`);
          } else {
            for (const root of movedRoots) root.dirty = true;
            updateTopbar();
            rebuildSidebar();
            setStatus(`Moved ${movedRoots.length} node(s)`);
          }
        }
      } else if (history.past.length > 0) {
        history.past.pop();
      }
    }

    if (state.dragMode === 'resize' && state.draggedNodeId) {
      const resizedNodes = [...state.selectedNodeIds]
        .map((id) => nodes.find((n) => n.id === id))
        .filter(Boolean);

      if (resizedNodes.length > 0 && state.dragMoved) {
        const conflict = findSpatialConflict(nodes);
        if (conflict) {
          if (history.past.length > 0) {
            const prev = history.past.pop();
            restoreSnapshot(prev);
          }
          setStatus(`Resize cancelled: illegal overlap (${conflict.a.name} vs ${conflict.b.name})`);
        } else {
          for (const n of resizedNodes) n.dirty = true;
          updateTopbar();
          rebuildSidebar();
          setStatus(`Resized ${resizedNodes.length} node(s)`);
        }
      } else if (history.past.length > 0) {
        history.past.pop();
      }
    }

    if (state.dragMode === 'edge-endpoint' && state.draggedEdgeId && state.dragMoved) {
      const edge = edges.find((ed) => ed.id === state.draggedEdgeId);
      const nodeId = edge ? (state.draggedEdgeEnd === 'from' ? edge.from : edge.to) : null;
      const node = nodeId ? nodes.find((n) => n.id === nodeId) : null;
      if (node) node.dirty = true;
      updateTopbar();
      rebuildSidebar();
      if (edge) setStatus(`Edge endpoint updated: ${edge.id}`);
    }

    if (state.dragMode === 'edge-create' && state.edgeCreateFromNodeId) {
      const p = getCanvasPointer(e);
      const world = p.world;
      const targetNode = hitTest(world.x, world.y);
      const fromNode = nodes.find((n) => n.id === state.edgeCreateFromNodeId);
      if (fromNode && targetNode && targetNode.id !== fromNode.id) {
        pushHistory();
        const id = nextEdgeId();
        const anchors = buildEdgeAnchors(
          fromNode,
          targetNode,
          { x: state.edgeCreateStartWorldX, y: state.edgeCreateStartWorldY },
          { x: world.x, y: world.y },
        );
        edges.push({
          id,
          from: fromNode.id,
          to: targetNode.id,
          createdLayer: state.activeLayer,
          type: 'edge',
          relationExpr: '',
          label: '',
          description: '',
          pathStyle: 'straight',
          strokeStyle: 'solid',
          arrowFrom: false,
          arrowTo: true,
          ...anchors,
        });
        fromNode.dirty = true;
        targetNode.dirty = true;
        state.selectedEdgeId = id;
        state.selectedNodeIds = new Set();
        state.selectedNodeId = null;
        updateTopbar();
        renderRightPanel();
        setStatus(`Created edge: ${id}`);
        state.suppressClick = true;
      } else {
        setStatus('Edge creation cancelled');
      }
      rebuildSidebar();
    }

    if (state.dragMode === 'mirror-create' && state.mirrorCreateSourceNodeId) {
      const source = nodes.find((n) => n.id === state.mirrorCreateSourceNodeId);
      if (source) {
        const id = nextNodeId();
        const rect = {
          x: state.mirrorCreateWorldX - source.w / 2,
          y: state.mirrorCreateWorldY - source.h / 2,
          w: source.w,
          h: source.h,
        };

        if (!isPlacementLegal(rect)) {
          setStatus('Mirror creation cancelled: illegal overlap');
        } else {
          pushHistory();
          const sourceLayerData = getNodeLayerContent(source);
          const sourceSynopsis = sourceLayerData.synopsis || sourceLayerData.summary || '';
          const mirrorNode = {
            id,
            name: nextAvailableMirrorName(source.name),
            synopsis: sourceSynopsis,
            detail: MIRROR_DEFAULT_DETAIL,
            status: sourceLayerData.status || 'active',
            createdLayer: state.activeLayer,
            layerContent: buildLayerContentSeed(sourceSynopsis, MIRROR_DEFAULT_DETAIL, sourceLayerData.status || 'active'),
            tags: ['mirror'],
            blocked: false,
            dirty: true,
            unbound: true,
            revision: 1,
            colorIndex: normalizeColorIndex(source.colorIndex),
            x: rect.x,
            y: rect.y,
            w: rect.w,
            h: rect.h,
            parentId: null,
            childCount: 0,
            isMirror: true,
            mirrorOfId: source.id,
            validation: [{ level: 'info', message: `Mirror of ${source.name}` }],
          };
          nodes.push(mirrorNode);

          recomputeAllContainmentFromGeometry();
          const layerOrderConflict = validateContainmentLayerOrder();
          if (layerOrderConflict) {
            nodes.pop();
            setStatus(`Mirror creation cancelled: child layer cannot be earlier than parent (${layerOrderConflict.child.name} -> ${layerOrderConflict.parent.name})`);
          } else {
            setSingleNodeSelection(mirrorNode.id);
            setStatus(`Created mirror: ${mirrorNode.name}`);
            updateTopbar();
            rebuildSidebar();
            renderRightPanel();
            state.suppressClick = true;
          }
        }
      }
    }

    state.dragging = false;
    state.activeDragButton = null;
    state.autoPanLastTs = 0;
    state.dragMode = null;
    state.draggedNodeId = null;
    state.draggedEdgeId = null;
    state.draggedEdgeEnd = null;
    state.edgeCreateFromNodeId = null;
    state.edgeCreateStartWorldX = 0;
    state.edgeCreateStartWorldY = 0;
    state.edgeCreateWorldX = 0;
    state.edgeCreateWorldY = 0;
    state.nodeCreateStartWorldX = 0;
    state.nodeCreateStartWorldY = 0;
    state.nodeCreateWorldX = 0;
    state.nodeCreateWorldY = 0;
    state.mirrorCreateSourceNodeId = null;
    state.mirrorCreateWorldX = 0;
    state.mirrorCreateWorldY = 0;
    state.selectionRectStartWorldX = 0;
    state.selectionRectStartWorldY = 0;
    state.selectionRectWorldX = 0;
    state.selectionRectWorldY = 0;
    state.nodeDragSnapshot = null;
    state.nodeDragPreviewDx = 0;
    state.nodeDragPreviewDy = 0;
    state.resizeHandle = null;
    state.resizeStartWorldX = 0;
    state.resizeStartWorldY = 0;
    state.resizeSnapshot = null;
    state.dragOffsetX = 0;
    state.dragOffsetY = 0;
    state.dragStartZoom = 1;
    state.dragStartW = 0;
    state.dragStartH = 0;
    canvas.classList.remove('dragging');
    canvas.style.cursor = 'grab';
    render();
  }

  return { handlePointerUp };
}
