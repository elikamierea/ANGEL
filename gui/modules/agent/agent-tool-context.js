// Read-only graph context helpers used by agent tools.
//
// Keep layer resolution / node lookup / edge-context queries together so tool
// prompts and handlers read from one consistent query surface.
export function createAgentToolContext(deps) {
  const {
    nodes,
    edges,
    containmentRelations,
    mirrorRelations,
    parseLayerIndex,
    isNodeVisibleInLayer,
    isEdgeVisibleInLayer,
    getNodeLayerContent,
    syncContainmentRelationsFromHierarchy,
    syncMirrorRelationsFromNodes,
    getCreatedLayer,
    getAllLayerIds,
  } = deps;

  function getResolvedLayerIds() {
    const fromTemplate = typeof getAllLayerIds === 'function' ? getAllLayerIds() : null;
    const normalized = Array.isArray(fromTemplate)
      ? fromTemplate.map((v) => String(v || '').trim().toUpperCase()).filter(Boolean)
      : [];
    if (normalized.length === 0) throw new Error('project template layers are required');
    return normalized;
  }

  function normalizeLayerId(value) {
    const raw = String(value || '').trim().toUpperCase();
    const allLayerIds = getResolvedLayerIds();
    if (allLayerIds.includes(raw)) return raw;
    throw new Error(`Invalid layer: ${value}`);
  }

  function resolveRequestedLayers(layerId) {
    const allLayerIds = getResolvedLayerIds();
    if (layerId == null || String(layerId).trim() === '') return [...allLayerIds];
    return [normalizeLayerId(layerId)];
  }

  function getVisibleNodesForLayer(layerId) {
    const layerIndex = parseLayerIndex(layerId);
    return nodes.filter((n) => isNodeVisibleInLayer(n, layerIndex));
  }

  function buildNodeLrtb(node) {
    if (!node) return null;
    const round5 = (value) => Number(Number(value || 0).toPrecision(5));
    const left = Number(node.x) || 0;
    const top = Number(node.y) || 0;
    const width = Number(node.w) || 0;
    const height = Number(node.h) || 0;
    return {
      left: round5(left),
      right: round5(left + width),
      top: round5(top),
      bottom: round5(top + height),
    };
  }

  function findVisibleNodeByName(layerId, name) {
    const lid = normalizeLayerId(layerId);
    const needle = String(name || '').trim();
    if (!needle) return null;
    const visible = getVisibleNodesForLayer(lid);
    const exact = visible.find((n) => String(n.name || '') === needle);
    if (exact) return exact;
    return visible.find((n) => String(n.name || '').toLowerCase() === needle.toLowerCase()) || null;
  }

  function createVisibleTreeWalker(layerId, rootName, visitNode) {
    const lid = normalizeLayerId(layerId);
    const visible = getVisibleNodesForLayer(lid);
    const visibleIdSet = new Set(visible.map((n) => n.id));

    const childrenByParent = new Map();
    for (const node of visible) {
      const key = visibleIdSet.has(node.parentId) ? node.parentId : '__ROOT__';
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key).push(node);
    }

    const walk = (node, depth) => {
      visitNode(node, depth, lid);
      const children = childrenByParent.get(node.id) || [];
      for (const child of children) walk(child, depth + 1);
    };

    const normalizedRootName = String(rootName || '').trim();
    if (normalizedRootName) {
      const rootNode = findVisibleNodeByName(lid, normalizedRootName);
      if (!rootNode) {
        return {
          layer: lid,
          root: normalizedRootName,
          found: false,
        };
      }
      walk(rootNode, 0);
      return {
        layer: lid,
        root: normalizedRootName,
        found: true,
      };
    }

    const roots = childrenByParent.get('__ROOT__') || [];
    for (const root of roots) walk(root, 0);
    return { layer: lid };
  }

  function getVisibleNodesDfsSummaryByLayer(layerId, rootName) {
    const out = [];
    const meta = createVisibleTreeWalker(layerId, rootName, (node, depth, lid) => {
      const content = getNodeLayerContent(node, lid);
      const synopsis = String(content?.synopsis || content?.summary || node.synopsis || node.summary || '').trim();
      out.push({
        name: String(node.name || ''),
        depth,
        ...(synopsis ? { synopsis } : {}),
      });
    });

    if (Object.prototype.hasOwnProperty.call(meta, 'found') && meta.found === false) {
      return {
        layer: meta.layer,
        root: meta.root,
        found: false,
        total: 0,
        nodes: [],
      };
    }

    return {
      layer: meta.layer,
      ...(meta.root ? { root: meta.root, found: true } : {}),
      total: out.length,
      nodes: out,
    };
  }

  function getVisibleEmptyDetailNodesDfsSummaryByLayer(layerId, rootName) {
    const out = [];
    const meta = createVisibleTreeWalker(layerId, rootName, (node, depth, lid) => {
      const content = getNodeLayerContent(node, lid);
      const detail = String(content?.detail || node.detail || '').trim();
      if (detail) return;
      const synopsis = String(content?.synopsis || content?.summary || node.synopsis || node.summary || '').trim();
      out.push({
        name: String(node.name || ''),
        depth,
        ...(synopsis ? { synopsis } : {}),
      });
    });

    if (Object.prototype.hasOwnProperty.call(meta, 'found') && meta.found === false) {
      return {
        layer: meta.layer,
        root: meta.root,
        found: false,
        total: 0,
        nodes: [],
      };
    }

    return {
      layer: meta.layer,
      ...(meta.root ? { root: meta.root, found: true } : {}),
      total: out.length,
      nodes: out,
    };
  }

  function getNodeDetailAndConnectedEdgesByLayerAndName(layerId, name) {
    const lid = normalizeLayerId(layerId);
    const needle = String(name || '').trim();
    if (!needle) throw new Error('name is required');

    const visible = getVisibleNodesForLayer(lid);
    const exact = visible.find((n) => String(n.name || '') === needle);
    const fallback = visible.find((n) => String(n.name || '').toLowerCase() === needle.toLowerCase());
    const node = exact || fallback;
    if (!node) {
      return {
        layer: lid,
        found: false,
        node: null,
        connectedEdges: [],
      };
    }

    syncContainmentRelationsFromHierarchy();
    syncMirrorRelationsFromNodes();

    const layerIndex = parseLayerIndex(lid);
    const visibleIdSet = new Set(visible.map((n) => n.id));
    const extraRelations = [...containmentRelations, ...mirrorRelations].filter((r) => (
      visibleIdSet.has(r.from) && visibleIdSet.has(r.to)
    ));
    const visibleEdges = edges.filter((e) => isEdgeVisibleInLayer(e, layerIndex));
    const allRelations = [...visibleEdges, ...extraRelations];

    const nodeById = new Map(visible.map((n) => [n.id, n]));
    const connectedEdges = allRelations
      .filter((e) => e.from === node.id || e.to === node.id)
      .map((e) => {
        const relatedNodeId = e.from === node.id ? e.to : e.from;
        const relatedNode = nodeById.get(relatedNodeId) || null;
        const relatedLayer = relatedNode ? getNodeLayerContent(relatedNode, lid) : null;
        const rawType = String(e.type || '').trim().toLowerCase();
        const normalizedType = rawType === 'containment' || rawType === 'mirror' ? rawType : 'edge';
        const includeVisualStyle = normalizedType === 'edge';
        const endpointRole = e.from === node.id ? 'to' : 'from';
        const endpointKey = endpointRole === 'to' ? 'toNode' : 'fromNode';
        return {
          id: String(e.id || ''),
          type: normalizedType,
          description: String(e.description || ''),
          ...(includeVisualStyle ? {
            pathStyle: e.pathStyle || null,
            strokeStyle: e.strokeStyle || null,
            arrowFrom: Boolean(e.arrowFrom),
            arrowTo: Boolean(e.arrowTo),
          } : {}),
          [endpointKey]: relatedNode ? {
            name: String(relatedNode.name || ''),
            synopsis: String(relatedLayer?.synopsis || relatedLayer?.summary || relatedNode.synopsis || relatedNode.summary || ''),
          } : null,
        };
      });

    const content = getNodeLayerContent(node, lid);
    return {
      layer: lid,
      found: true,
      node: {
        name: String(node.name || ''),
        createdLayer: `L${getCreatedLayer(node.createdLayer)}`,
        synopsis: String(content?.synopsis || content?.summary || node.synopsis || node.summary || ''),
        detail: String(content?.detail || node.detail || ''),
        status: String(content?.status || node.status || 'active'),
        lrtb: buildNodeLrtb(node),
        resourceBindings: Array.isArray(node.resourceBindings) ? node.resourceBindings : [],
      },
      connectedEdges,
    };
  }

  function getLayerDfsSummariesForRequestedLayers(layer, root) {
    const layers = resolveRequestedLayers(layer);
    const results = layers.map((lid) => getVisibleNodesDfsSummaryByLayer(lid, root));
    if (results.length === 1) return results[0];
    return {
      layerScope: 'ALL',
      ...(String(root || '').trim() ? { root: String(root || '').trim() } : {}),
      totalLayers: results.length,
      totalNodes: results.reduce((acc, item) => acc + (Number(item.total) || 0), 0),
      layers: results,
    };
  }

  function getEmptyDetailNodeSummariesForRequestedLayers(layer, root) {
    const layers = resolveRequestedLayers(layer);
    const results = layers.map((lid) => getVisibleEmptyDetailNodesDfsSummaryByLayer(lid, root));
    if (results.length === 1) return results[0];
    return {
      layerScope: 'ALL',
      ...(String(root || '').trim() ? { root: String(root || '').trim() } : {}),
      totalLayers: results.length,
      totalNodes: results.reduce((acc, item) => acc + (Number(item.total) || 0), 0),
      layers: results,
    };
  }

  function getNodeDetailWithEdgesForRequestedLayers(layer, name) {
    const needle = String(name || '').trim();
    if (!needle) throw new Error('name is required');

    const layers = resolveRequestedLayers(layer);
    const results = layers.map((lid) => getNodeDetailAndConnectedEdgesByLayerAndName(lid, needle));

    if (results.length === 1) return results[0];

    const found = results.filter((item) => item.found);
    return {
      layerScope: 'ALL',
      query: { name: needle },
      found: found.length > 0,
      matchCount: found.length,
      matches: found,
    };
  }

  // Build a compact, single-line snippet around the first regex match in a field
  // value so grep results stay readable without dumping whole detail blocks.
  function buildGrepSnippet(value, re, radius = 60, maxLen = 220) {
    const text = String(value || '');
    const m = text.match(re);
    if (!m) {
      const clipped = text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
      return clipped.replace(/\s+/g, ' ').trim();
    }
    const idx = m.index || 0;
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + m[0].length + radius);
    let snippet = text.slice(start, end);
    if (start > 0) snippet = `…${snippet}`;
    if (end < text.length) snippet = `${snippet}…`;
    return snippet.replace(/\s+/g, ' ').trim();
  }

  // Regex search over visible nodes within one layer, optionally scoped to a
  // compound node subtree (root). Searches name/synopsis/detail/status using
  // smart-case (case-insensitive unless the pattern contains an uppercase
  // letter; the `-i` flag overrides). Returns capped, snippet-bearing matches.
  function grepVisibleNodes(params = {}) {
    const layerId = String(params.layer || '').trim();
    if (!layerId) throw new Error('layer is required');
    const lid = normalizeLayerId(layerId);

    const pattern = String(params.pattern ?? '');
    if (!pattern) throw new Error('pattern is required');

    const rootName = String(params.root || '').trim();
    const headLimit = Number.isFinite(Number(params.headLimit))
      ? Math.max(1, Math.min(500, Math.trunc(Number(params.headLimit))))
      : 50;

    const hasUpper = /[A-Z]/.test(pattern);
    const insensitive = params['-i'] === true
      ? true
      : (params['-i'] === false ? false : !hasUpper);
    let re;
    try {
      re = new RegExp(pattern, insensitive ? 'i' : '');
    } catch (error) {
      throw new Error(`invalid regex pattern: ${error?.message || 'parse error'}`);
    }

    const FIELDS = ['name', 'synopsis', 'detail', 'status'];
    const matches = [];
    let total = 0;

    const meta = createVisibleTreeWalker(lid, rootName, (node, depth) => {
      const content = getNodeLayerContent(node, lid);
      const values = {
        name: String(node.name || ''),
        synopsis: String(content?.synopsis || content?.summary || node.synopsis || node.summary || ''),
        detail: String(content?.detail || node.detail || ''),
        status: String(content?.status || node.status || ''),
      };

      const matchedFields = [];
      for (const field of FIELDS) {
        const value = values[field];
        if (value && re.test(value)) {
          matchedFields.push({ field, snippet: buildGrepSnippet(value, re) });
        }
      }
      if (matchedFields.length === 0) return;

      total += 1;
      if (matches.length < headLimit) {
        matches.push({ name: values.name, depth, matchedFields });
      }
    });

    if (Object.prototype.hasOwnProperty.call(meta, 'found') && meta.found === false) {
      return {
        layer: meta.layer,
        root: meta.root,
        found: false,
        pattern,
        total: 0,
        returned: 0,
        truncated: false,
        matches: [],
      };
    }

    const truncated = total > matches.length;
    return {
      layer: lid,
      ...(rootName ? { root: rootName, found: true } : {}),
      pattern,
      total,
      returned: matches.length,
      truncated,
      ...(truncated ? { hint: 'Too many matches; refine the pattern or scope with root.' } : {}),
      matches,
    };
  }

  function findNodeByNameForRequestedLayers(layer, name) {
    const needle = String(name || '').trim();
    if (!needle) throw new Error('name is required');

    const layers = resolveRequestedLayers(layer);

    for (const lid of layers) {
      const exact = nodes.find((n) => isNodeVisibleInLayer(n, parseLayerIndex(lid)) && String(n.name || '') === needle);
      if (exact) return exact;

      const fallback = nodes.find((n) => isNodeVisibleInLayer(n, parseLayerIndex(lid)) && String(n.name || '').toLowerCase() === needle.toLowerCase());
      if (fallback) return fallback;
    }

    return null;
  }

  return {
    normalizeLayerId,
    resolveRequestedLayers,
    getVisibleNodesForLayer,
    buildNodeLrtb,
    findVisibleNodeByName,
    createVisibleTreeWalker,
    getVisibleNodesDfsSummaryByLayer,
    getVisibleEmptyDetailNodesDfsSummaryByLayer,
    getNodeDetailAndConnectedEdgesByLayerAndName,
    getLayerDfsSummariesForRequestedLayers,
    getEmptyDetailNodeSummariesForRequestedLayers,
    getNodeDetailWithEdgesForRequestedLayers,
    grepVisibleNodes,
    findNodeByNameForRequestedLayers,
  };
}
