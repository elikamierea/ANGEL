export function createGraphDomain(deps) {
  const {
    state,
    nodes,
    edges,
    conflicts,
    getNodeLodLevel,
    rectContainsRect,
    getNodeById,
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
    const fromNode = getNodeById(edge.from);
    const toNode = getNodeById(edge.to);
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
      if (item.progress == null && item.synopsis != null) item.progress = item.synopsis;
      if (item.progress == null && item.summary != null) item.progress = item.summary;
      item.progress = String(item.progress || '');
      item.detail = String(item.detail || '');
      item.status = String(item.status || node.status || 'active');
      if (!Array.isArray(item.resourceBindings)) item.resourceBindings = [];
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
      n.progress = String(n.progress || n.synopsis || n.summary || n.layerContent?.[state.activeLayer]?.progress || '');

      // Legacy cleanup: the per-node audit trail was write-only (never surfaced
      // in the UI) and is removed. Drop it from any older project that still has it
      // so it stops round-tripping into newly saved angel.json files.
      if ('audit' in n) delete n.audit;

      // Legacy migration: bindings used to live node-global (n.resourceBindings,
      // or even older n.blockBinding). Bindings are now per-layer, so move any
      // legacy bindings into the layer the node was created in. Runs once: the
      // node-global fields are deleted afterwards so re-runs are no-ops.
      if (Array.isArray(n.resourceBindings) || n.blockBinding) {
        let legacyBindings = [];
        if (Array.isArray(n.resourceBindings)) {
          legacyBindings = n.resourceBindings;
        } else {
          const legacy = n.blockBinding || {};
          const legacyPath = typeof legacy.blockId === 'string' ? legacy.blockId.split('#')[0] : '';
          const legacyBlock = typeof legacy.name === 'string' ? legacy.name : '';
          legacyBindings = (legacyPath || legacyBlock) ? [{ path: legacyPath, description: legacyBlock }] : [];
        }
        const allLayerIds = getAllLayerIds();
        const createdLid = allLayerIds[getCreatedLayer(n.createdLayer)] || allLayerIds[0] || state.activeLayer;
        const target = n.layerContent[createdLid];
        if (target) {
          target.resourceBindings = [
            ...(Array.isArray(target.resourceBindings) ? target.resourceBindings : []),
            ...legacyBindings,
          ];
        }
        delete n.resourceBindings;
        delete n.blockBinding;
      }

      // Normalize per-layer bindings.
      for (const lid of getAllLayerIds()) {
        const item = n.layerContent[lid];
        item.resourceBindings = (Array.isArray(item.resourceBindings) ? item.resourceBindings : [])
          .filter((entry) => entry && typeof entry.path === 'string')
          .map((entry) => ({ path: entry.path.trim(), description: typeof entry.description === 'string' ? entry.description.trim() : (typeof entry.block === 'string' ? entry.block.trim() : '') }))
          .filter((entry) => entry.path.length > 0);
      }
    }

    // Legacy migration: mirror names used to be `${source}_Mirror${i}`. The scheme
    // is now `${source}@${local}`, with the '@' prefix bound to the source. Rebuild
    // any mirror whose name lacks the '@' separator (older projects); names that
    // already use '@' are left to the live prefix-cascade in syncMirrorNodes.
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const takenNames = new Set(nodes.map((n) => String(n.name || '')));
    for (const n of nodes) {
      if (!(n.isMirror && n.mirrorOfId)) continue;
      if (String(n.name || '').includes('@')) continue;
      const source = nodeById.get(n.mirrorOfId);
      const srcName = String(source?.name || 'Node');
      const legacy = /_Mirror(\d+)$/.exec(String(n.name || ''));
      let k = legacy ? Number(legacy[1]) || 1 : 1;
      let candidate = `${srcName}@${k}`;
      while (takenNames.has(candidate)) {
        k += 1;
        candidate = `${srcName}@${k}`;
      }
      takenNames.delete(String(n.name || ''));
      n.name = candidate;
      n.dirty = true;
      takenNames.add(candidate);
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

  function getRelationById(relationId) {
    if (!relationId) return null;
    return edges.find((e) => e.id === relationId) || null;
  }

  function getSelectedEdge() {
    return getRelationById(state.selectedEdgeId);
  }

  function getNodeRelations(nodeId) {
    const activeLayer = getActiveLayerIndex();
    // Containment (parent/child) and mirror links are surfaced separately
    // (contains/containedBy and source/mirrors jump lists), not as relations here.
    return edges
      .filter((r) => r.from === nodeId || r.to === nodeId)
      .filter((r) => isEdgeVisibleInLayer(r, activeLayer));
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
    getRelationById,
    getSelectedEdge,
    getNodeRelations,
    getEdgeRelationExpr,
    hasConflict,
  };
}
