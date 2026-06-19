export function createEditMirrorUpdateCommands(deps) {
  const {
    state,
    history,
    nodes,
    pushHistory,
    restoreSnapshot,
    setSingleNodeSelection,
    updateTopbar,
    rebuildSidebar,
    renderRightPanel,
    render,
    normalizeLayerId,
    parseLayerIndex,
    normalizeColorIndex,
    nextNodeId,
    isNodeNameAvailable,
    nextAvailableMirrorName,
    isPlacementLegal,
    validateContainmentLayerOrder,
    recomputeAllContainmentFromGeometry,
    getNodeLayerContent,
    MIRROR_DEFAULT_DETAIL,
    normalizeResourceBindings,
    normalizeRectFromLrtb,
    findNodeByNameForRequestedLayers,
    getActiveLayerIndex,
    isNodeVisibleInLayer,
    rectEquals,
    rectsIntersect,
    rectContainsRect,
    getAllLayerIds,
  } = deps;

  function buildLayerContentSeed(synopsis, detail, status) {
    return Object.fromEntries(getAllLayerIds().map((lid) => [lid, { synopsis, detail, status }]));
  }

  function normalizeMirrorTopLeft(params = {}) {
    const carrier = params.lr || params.lt || params.lrtb || params;
    const left = Number(carrier?.left);
    const top = Number(carrier?.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      throw new Error('mirror position requires finite left/top (supports lr.left+lr.top)');
    }
    return { left, top };
  }

  function createMirrorByParams(params = {}) {
    const sourceName = String(params.source || '').trim();
    if (!sourceName) throw new Error('source is required');

    const source = findNodeByNameForRequestedLayers(params.layer, sourceName);
    if (!source) throw new Error(`source node not found: ${sourceName}`);

    const { left, top } = normalizeMirrorTopLeft(params);
    const rect = { x: left, y: top, w: source.w, h: source.h };

    if (!isPlacementLegal(rect)) {
      throw new Error('illegal overlap (must be disjoint or containment)');
    }

    const layerId = params.layer ? normalizeLayerId(params.layer) : state.activeLayer;

    const defaultName = nextAvailableMirrorName(source.name);
    const name = String(params.name || defaultName).trim();
    if (!name) throw new Error('name cannot be empty');
    if (!isNodeNameAvailable(name)) throw new Error(`duplicate node name: ${name}`);

    const sourceLayerData = getNodeLayerContent(source, layerId);
    const synopsis = Object.prototype.hasOwnProperty.call(params, 'synopsis')
      ? String(params.synopsis || '').trim()
      : String(sourceLayerData.synopsis || sourceLayerData.summary || '');
    const detail = Object.prototype.hasOwnProperty.call(params, 'detail')
      ? String(params.detail || '').trim()
      : MIRROR_DEFAULT_DETAIL;
    const status = Object.prototype.hasOwnProperty.call(params, 'status')
      ? (String(params.status || '').trim() || 'active')
      : String(sourceLayerData.status || 'active');
    const colorIndexInput = (Object.prototype.hasOwnProperty.call(params, 'colorIndex') || Object.prototype.hasOwnProperty.call(params, 'color'))
      ? (params.colorIndex != null ? params.colorIndex : params.color)
      : source.colorIndex;
    const colorIndex = normalizeColorIndex(colorIndexInput);
    const resourceBindings = normalizeResourceBindings(params.resourceBindings);

    const id = nextNodeId();

    pushHistory();
    const mirrorNode = {
      id,
      name,
      synopsis,
      detail,
      status,
      createdLayer: layerId,
      layerContent: buildLayerContentSeed(synopsis, detail, status),
      tags: ['mirror'],
      blocked: false,
      dirty: true,
      unbound: true,
      revision: 1,
      colorIndex,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      parentId: null,
      childCount: 0,
      isMirror: true,
      mirrorOfId: source.id,
      resourceBindings,
      validation: [{ level: 'info', message: `Mirror of ${source.name}` }],
      audit: [{ actor: 'agent', time: new Date().toISOString(), tool: 'create_mirror', target: `node:${id}` }],
    };

    nodes.push(mirrorNode);
    recomputeAllContainmentFromGeometry();
    const layerOrderConflict = validateContainmentLayerOrder();
    if (layerOrderConflict) {
      if (history.past.length > 0) {
        const prev = history.past.pop();
        restoreSnapshot(prev);
      }
      throw new Error(`child layer cannot be earlier than parent (${layerOrderConflict.child.name} -> ${layerOrderConflict.parent.name})`);
    }

    setSingleNodeSelection(mirrorNode.id);
    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();

    return {
      created: true,
      nodeId: mirrorNode.id,
      name: mirrorNode.name,
      mirrorOfName: source.name,
    };
  }

  function isPlacementLegalForNode(rect, ignoreNodeId) {
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.w) || !Number.isFinite(rect.h)) return false;
    if (rect.w <= 0 || rect.h <= 0) return false;

    for (const n of nodes) {
      if (n.id === ignoreNodeId) continue;
      if (!isNodeVisibleInLayer(n, getActiveLayerIndex())) continue;
      if (rectEquals(n, rect)) continue;

      const overlap = rectsIntersect(n, rect);
      if (!overlap) continue;

      const aContainsB = rectContainsRect(n, rect);
      const bContainsA = rectContainsRect(rect, n);
      if (!aContainsB && !bContainsA) return false;
    }
    return true;
  }

  function updateNodeByParams(params = {}) {
    const targetName = String(params.targetName || '').trim();
    if (!targetName) throw new Error('targetName is required');

    const exact = nodes.find((n) => String(n.name || '') === targetName);
    const fallback = nodes.find((n) => String(n.name || '').toLowerCase() === targetName.toLowerCase());
    const node = exact || fallback;
    if (!node) throw new Error(`node not found: ${targetName}`);

    const nextName = params.name != null ? String(params.name || '').trim() : String(node.name || '');
    if (!nextName) throw new Error('name cannot be empty');
    if (!isNodeNameAvailable(nextName, node.id)) throw new Error(`duplicate node name: ${nextName}`);

    const nextRect = params.lrtb ? normalizeRectFromLrtb(params.lrtb) : { x: node.x, y: node.y, w: node.w, h: node.h };
    if (!isPlacementLegalForNode(nextRect, node.id)) {
      throw new Error('illegal overlap after move/resize (must be disjoint or containment)');
    }

    const layerId = params.layer ? normalizeLayerId(params.layer) : state.activeLayer;
    const layerData = getNodeLayerContent(node, layerId);
    const synopsis = Object.prototype.hasOwnProperty.call(params, 'synopsis')
      ? String(params.synopsis || '').trim()
      : String(layerData.synopsis || '');
    const detail = Object.prototype.hasOwnProperty.call(params, 'detail')
      ? String(params.detail || '').trim()
      : String(layerData.detail || '');
    const status = Object.prototype.hasOwnProperty.call(params, 'status')
      ? (String(params.status || '').trim() || 'active')
      : String(layerData.status || 'active');
    const colorIndexInput = (Object.prototype.hasOwnProperty.call(params, 'colorIndex') || Object.prototype.hasOwnProperty.call(params, 'color'))
      ? (params.colorIndex != null ? params.colorIndex : params.color)
      : node.colorIndex;
    const colorIndex = normalizeColorIndex(colorIndexInput);

    const shouldUpdateBindings = Object.prototype.hasOwnProperty.call(params, 'resourceBindings');
    const resourceBindings = shouldUpdateBindings
      ? normalizeResourceBindings(params.resourceBindings)
      : node.resourceBindings;

    pushHistory();

    node.name = nextName;
    node.x = nextRect.x;
    node.y = nextRect.y;
    node.w = nextRect.w;
    node.h = nextRect.h;
    node.colorIndex = colorIndex;
    if (shouldUpdateBindings) node.resourceBindings = resourceBindings;

    layerData.synopsis = synopsis;
    layerData.detail = detail;
    layerData.status = status;
    node.synopsis = synopsis;
    node.detail = detail;
    node.status = status;
    node.dirty = true;
    node.revision += 1;
    node.audit.unshift({ actor: 'agent', time: new Date().toISOString(), tool: 'update_node', target: `node:${node.id}` });

    recomputeAllContainmentFromGeometry();
    const layerOrderConflict = validateContainmentLayerOrder();
    if (layerOrderConflict) {
      if (history.past.length > 0) {
        const prev = history.past.pop();
        restoreSnapshot(prev);
      }
      throw new Error(`child layer cannot be earlier than parent (${layerOrderConflict.child.name} -> ${layerOrderConflict.parent.name})`);
    }

    setSingleNodeSelection(node.id);
    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();

    const directContainerNodeName = node.parentId
      ? String((nodes.find((n) => n.id === node.parentId)?.name) || '')
      : null;

    return {
      updated: true,
      parentNodeName: directContainerNodeName,
    };
  }

  function getNodeByNameStrict(name) {
    const needle = String(name || '').trim();
    if (!needle) return null;
    const exact = nodes.find((n) => String(n.name || '') === needle);
    if (exact) return exact;
    return nodes.find((n) => String(n.name || '').toLowerCase() === needle.toLowerCase()) || null;
  }

  return {
    normalizeMirrorTopLeft,
    createMirrorByParams,
    isPlacementLegalForNode,
    updateNodeByParams,
    getNodeByNameStrict,
  };
}
