export function createGraphDomain(deps) {
  const {
    state,
    nodes,
    edges,
    containmentRelations,
    mirrorRelations,
    conflicts,
    isMirrorNode,
    getNodeLodLevel,
    rectContainsRect,
  } = deps;

  function getAllLayerIds() {
    const layers = Array.isArray(state.projectTemplate?.layers)
      ? state.projectTemplate.layers.map((v) => String(v || '').trim().toUpperCase()).filter(Boolean)
      : [];
    if (layers.length === 0) throw new Error('project template layers are required');
    return layers;
  }

  function parseLayerIndex(layerValue) {
    const all = getAllLayerIds();
    const fallback = String(state.projectTemplate?.defaultActiveLayer || all[0] || 'L0').toUpperCase();

    if (typeof layerValue === 'number' && Number.isFinite(layerValue)) {
      const idx = Math.trunc(layerValue);
      return Math.max(0, Math.min(all.length - 1, idx));
    }

    const raw = String(layerValue || fallback).toUpperCase();
    const idx = all.indexOf(raw);
    return idx >= 0 ? idx : Math.max(0, all.indexOf(fallback));
  }

  function getActiveLayerIndex() {
    return parseLayerIndex(state.activeLayer);
  }

  function getCreatedLayer(value) {
    return parseLayerIndex(value);
  }

  function isNodeVisibleInLayer(node, layerIndex) {
    return getCreatedLayer(node.createdLayer) <= layerIndex;
  }

  function isNodeVisibleInActiveLayer(node) {
    return isNodeVisibleInLayer(node, getActiveLayerIndex());
  }

  function isEdgeVisibleInLayer(edge, layerIndex) {
    if (getCreatedLayer(edge.createdLayer) > layerIndex) return false;
    const fromNode = nodes.find((n) => n.id === edge.from);
    const toNode = nodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) return false;
    return isNodeVisibleInLayer(fromNode, layerIndex) && isNodeVisibleInLayer(toNode, layerIndex);
  }

  function isEdgeVisibleInActiveLayer(edge) {
    return isEdgeVisibleInLayer(edge, getActiveLayerIndex());
  }

  function ensureNodeLayerFields(node) {
    if (!node.layerContent || typeof node.layerContent !== 'object') node.layerContent = {};
    for (const lid of getAllLayerIds()) {
      if (!node.layerContent[lid] || typeof node.layerContent[lid] !== 'object') node.layerContent[lid] = {};
      const item = node.layerContent[lid];
      if (item.synopsis == null && item.summary != null) item.synopsis = item.summary;
      item.synopsis = String(item.synopsis || '');
      item.detail = String(item.detail || '');
      item.status = String(item.status || node.status || 'active');
    }
  }

  function getNodeLayerContent(node, layerId = state.activeLayer) {
    ensureNodeLayerFields(node);
    return node.layerContent[layerId];
  }

  function validateContainmentLayerOrder() {
    for (const n of nodes) {
      if (!n.parentId) continue;
      const p = nodes.find((x) => x.id === n.parentId);
      if (!p) continue;
      if (getCreatedLayer(n.createdLayer) < getCreatedLayer(p.createdLayer)) {
        return { child: n, parent: p };
      }
    }
    return null;
  }

  function normalizeGraphSchema() {
    for (const n of nodes) {
      n.createdLayer = getCreatedLayer(n.createdLayer);
      ensureNodeLayerFields(n);
      n.synopsis = String(n.synopsis || n.summary || n.layerContent?.[state.activeLayer]?.synopsis || '');

      if (!Array.isArray(n.resourceBindings)) {
        const legacy = n.blockBinding || {};
        const legacyPath = typeof legacy.blockId === 'string' ? legacy.blockId.split('#')[0] : '';
        const legacyBlock = typeof legacy.name === 'string' ? legacy.name : '';
        n.resourceBindings = legacyPath || legacyBlock
          ? [{ path: legacyPath, description: legacyBlock }]
          : [];
      }

      n.resourceBindings = n.resourceBindings
        .filter((entry) => entry && typeof entry.path === 'string')
        .map((entry) => ({ path: entry.path.trim(), description: typeof entry.description === 'string' ? entry.description.trim() : (typeof entry.block === 'string' ? entry.block.trim() : '') }))
        .filter((entry) => entry.path.length > 0);
    }
    for (const e of edges) {
      e.createdLayer = getCreatedLayer(e.createdLayer);
    }
  }

  function getNodesInRect(rect, options = {}) {
    const includeHidden = Boolean(options?.includeHidden);
    return nodes.filter((n) => {
      if (!isNodeVisibleInActiveLayer(n)) return false;
      if (!includeHidden && getNodeLodLevel(n) === 'hidden') return false;
      return rectContainsRect(rect, n);
    });
  }

  function makeContainmentRelationId(fromId, toId) {
    return `c_${fromId}_${toId}`;
  }

  function makeMirrorRelationId(fromId, toId) {
    return `m_${fromId}_${toId}`;
  }

  function syncContainmentRelationsFromHierarchy() {
    const prevById = new Map(containmentRelations.map((r) => [r.id, r]));
    containmentRelations.length = 0;

    for (const child of nodes) {
      if (!child.parentId) continue;
      const id = makeContainmentRelationId(child.parentId, child.id);
      const prev = prevById.get(id);

      containmentRelations.push({
        id,
        from: child.parentId,
        to: child.id,
        type: 'containment',
        relationExpr: prev?.relationExpr || 'A contains B',
        label: prev?.label || 'contains',
        description: prev?.description || '',
        pathStyle: prev?.pathStyle || 'straight',
        strokeStyle: prev?.strokeStyle || 'solid',
        arrowFrom: Boolean(prev?.arrowFrom),
        arrowTo: Boolean(prev?.arrowTo),
      });
    }
  }

  function syncMirrorRelationsFromNodes() {
    const prevById = new Map(mirrorRelations.map((r) => [r.id, r]));
    mirrorRelations.length = 0;

    for (const n of nodes) {
      if (!isMirrorNode(n)) continue;
      const id = makeMirrorRelationId(n.id, n.mirrorOfId);
      const prev = prevById.get(id);
      mirrorRelations.push({
        id,
        from: n.id,
        to: n.mirrorOfId,
        type: 'mirror',
        relationExpr: prev?.relationExpr || 'A is a mirror of B',
        label: prev?.label || 'mirror',
        description: prev?.description || '',
      });
    }
  }

  function getRelationById(relationId) {
    if (!relationId) return null;
    return edges.find((e) => e.id === relationId)
      || containmentRelations.find((r) => r.id === relationId)
      || mirrorRelations.find((r) => r.id === relationId)
      || null;
  }

  function getSelectedEdge() {
    syncContainmentRelationsFromHierarchy();
    syncMirrorRelationsFromNodes();
    return getRelationById(state.selectedEdgeId);
  }

  function getNodeRelations(nodeId) {
    syncContainmentRelationsFromHierarchy();
    syncMirrorRelationsFromNodes();
    const activeLayer = getActiveLayerIndex();
    return [...edges, ...containmentRelations, ...mirrorRelations]
      .filter((r) => r.from === nodeId || r.to === nodeId)
      .filter((r) => {
        if (r.type === 'containment' || r.type === 'mirror') {
          const fromNode = nodes.find((n) => n.id === r.from);
          const toNode = nodes.find((n) => n.id === r.to);
          return Boolean(fromNode && toNode && isNodeVisibleInLayer(fromNode, activeLayer) && isNodeVisibleInLayer(toNode, activeLayer));
        }
        return isEdgeVisibleInLayer(r, activeLayer);
      });
  }

  function getEdgeRelationExpr(edge) {
    return (edge?.relationExpr || 'A depends on B').trim() || 'A depends on B';
  }

  function hasConflict(nodeId) {
    return conflicts.some((c) => c.targetNodeId === nodeId);
  }

  return {
    parseLayerIndex,
    getActiveLayerIndex,
    getCreatedLayer,
    isNodeVisibleInLayer,
    isNodeVisibleInActiveLayer,
    isEdgeVisibleInLayer,
    isEdgeVisibleInActiveLayer,
    ensureNodeLayerFields,
    getNodeLayerContent,
    validateContainmentLayerOrder,
    normalizeGraphSchema,
    getNodesInRect,
    makeContainmentRelationId,
    makeMirrorRelationId,
    syncContainmentRelationsFromHierarchy,
    syncMirrorRelationsFromNodes,
    getRelationById,
    getSelectedEdge,
    getNodeRelations,
    getEdgeRelationExpr,
    hasConflict,
  };
}
