export function createEditGraphCommands(deps) {
  const {
    state,
    history,
    nodes,
    edges,
    pushHistory,
    restoreSnapshot,
    setSingleNodeSelection,
    updateTopbar,
    rebuildSidebar,
    renderRightPanel,
    render,
    parseLayerIndex,
    normalizeLayerId,
    normalizeColorIndex,
    nextNodeId,
    nextEdgeId,
    isNodeNameAvailable,
    nextAvailableMirrorName,
    findSmallestContainerForRect,
    isPlacementLegal,
    validateContainmentLayerOrder,
    recomputeAllContainmentFromGeometry,
    ensureNodeLayerFields,
    getActiveLayerIndex,
    getNodeLayerContent,
    isNodeVisibleInLayer,
    clamp01,
    buildEdgeAnchors,
    MIRROR_DEFAULT_DETAIL,
    buildNodeLrtb,
    rectsIntersect,
    rectContainsRect,
    rectEquals,
  } = deps;

  function normalizeRectFromLrtb(lrtb) {
    const left = Number(lrtb?.left);
    const right = Number(lrtb?.right);
    const top = Number(lrtb?.top);
    const bottom = Number(lrtb?.bottom);

    if (![left, right, top, bottom].every(Number.isFinite)) {
      throw new Error('lrtb must include finite left/right/top/bottom');
    }
    if (!(right > left && bottom > top)) {
      throw new Error('lrtb requires right > left and bottom > top');
    }

    return {
      x: left,
      y: top,
      w: right - left,
      h: bottom - top,
    };
  }

  function normalizeResourceBindings(input) {
    return Array.isArray(input)
      ? input
        .filter((entry) => entry && typeof entry.path === 'string')
        .map((entry) => ({
          path: String(entry.path || '').trim(),
          description: typeof entry.description === 'string' ? entry.description.trim() : (typeof entry.block === 'string' ? entry.block.trim() : ''),
        }))
        .filter((entry) => entry.path.length > 0)
      : [];
  }

  function createNodeAtPositionByParams(params = {}) {
    const name = String(params.name || '').trim();
    if (!name) throw new Error('name is required');
    if (!isNodeNameAvailable(name)) throw new Error(`duplicate node name: ${name}`);

    const rect = normalizeRectFromLrtb(params.lrtb);
    if (!isPlacementLegal(rect)) {
      throw new Error('illegal overlap (must be disjoint or containment). Hint: use the arrange tool on existing nodes for extra space');
    }

    const layerId = params.layer ? normalizeLayerId(params.layer) : state.activeLayer;
    const synopsis = String(params.synopsis || '').trim();
    const detail = String(params.detail || '').trim();
    const status = String(params.status || 'active').trim() || 'active';
    const colorIndexInput = params.colorIndex != null ? params.colorIndex : params.color;
    const colorIndex = normalizeColorIndex(colorIndexInput);
    const resourceBindings = normalizeResourceBindings(params.resourceBindings);

    const id = nextNodeId();
    const container = findSmallestContainerForRect(rect);

    const node = {
      id,
      name,
      synopsis,
      detail,
      status,
      createdLayer: layerId,
      layerContent: buildLayerContentSeed(synopsis, detail, status),
      tags: [],
      blocked: false,
      dirty: true,
      unbound: true,
      revision: 1,
      colorIndex,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      parentId: container ? container.id : null,
      childCount: 0,
      resourceBindings,
      validation: [{ level: 'info', message: 'New node created by agent tool.' }],
      audit: [{ actor: 'agent', time: new Date().toISOString(), tool: 'create_node', target: `node:${id}` }],
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
      throw new Error(`child layer cannot be earlier than parent (${layerOrderConflict.child.name} -> ${layerOrderConflict.parent.name})`);
    }

    setSingleNodeSelection(node.id);
    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();

    const directContainerNodeName = node.parentId
      ? String((nodes.find((n) => n.id === node.parentId)?.name) || '')
      : '';

    const createdInside = directContainerNodeName || '[none: top-level / uncontained]';

    return {
      created: true,
      createdInside,
    };
  }

  function getAllLayerIds() {
    const layers = Array.isArray(state.projectTemplate?.layers)
      ? state.projectTemplate.layers.map((v) => String(v || '').trim().toUpperCase()).filter(Boolean)
      : [];
    if (layers.length === 0) throw new Error('project template layers are required');
    return layers;
  }

  function buildLayerContentSeed(synopsis, detail, status) {
    return Object.fromEntries(getAllLayerIds().map((lid) => [lid, { synopsis, detail, status }]));
  }

  function findNodeByNameForRequestedLayers(layer, name) {
    const needle = String(name || '').trim();
    if (!needle) throw new Error('name is required');

    const layers = layer == null || String(layer || '').trim().toUpperCase() === 'ALL'
      ? getAllLayerIds()
      : [normalizeLayerId(layer)];

    for (const lid of layers) {
      const exact = nodes.find((n) => isNodeVisibleInLayer(n, parseLayerIndex(lid)) && String(n.name || '') === needle);
      if (exact) return exact;

      const fallback = nodes.find((n) => isNodeVisibleInLayer(n, parseLayerIndex(lid)) && String(n.name || '').toLowerCase() === needle.toLowerCase());
      if (fallback) return fallback;
    }

    return null;
  }

  function normalizeEdgeAnchorInput(anchor, keyName) {
    if (!anchor || typeof anchor !== 'object') return null;
    const side = String(anchor.side || '').trim().toLowerCase();
    if (!['left', 'right', 'top', 'bottom'].includes(side)) {
      throw new Error(`${keyName}.side must be one of left/right/top/bottom`);
    }
    const tRaw = Number(anchor.t);
    if (!Number.isFinite(tRaw)) {
      throw new Error(`${keyName}.t must be a finite number`);
    }
    return { side, t: clamp01(tRaw) };
  }

  function createEdgeByParams(params = {}) {
    const fromName = String(params.fromName || params.from || '').trim();
    const toName = String(params.toName || params.to || '').trim();
    if (!fromName) throw new Error('fromName is required');
    if (!toName) throw new Error('toName is required');

    const fromNode = findNodeByNameForRequestedLayers(params.layer, fromName);
    if (!fromNode) throw new Error(`from node not found: ${fromName}`);

    const toNode = findNodeByNameForRequestedLayers(params.layer, toName);
    if (!toNode) throw new Error(`to node not found: ${toName}`);

    if (fromNode.id === toNode.id) throw new Error('from and to cannot be the same node');

    const fromCenter = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h / 2 };
    const toCenter = { x: toNode.x + toNode.w / 2, y: toNode.y + toNode.h / 2 };

    const explicitFromAnchor = normalizeEdgeAnchorInput(params.fromAnchor, 'fromAnchor');
    const explicitToAnchor = normalizeEdgeAnchorInput(params.toAnchor, 'toAnchor');
    if ((explicitFromAnchor && !explicitToAnchor) || (!explicitFromAnchor && explicitToAnchor)) {
      throw new Error('fromAnchor and toAnchor must be provided together');
    }

    const anchors = (explicitFromAnchor && explicitToAnchor)
      ? { fromAnchor: explicitFromAnchor, toAnchor: explicitToAnchor }
      : buildEdgeAnchors(
        fromNode,
        toNode,
        fromCenter,
        toCenter,
      );

    const edgeId = String(params.edgeId || '').trim() || nextEdgeId();
    if (edges.some((e) => String(e.id) === edgeId)) {
      throw new Error(`duplicate edge id: ${edgeId}`);
    }

    const layerId = params.layer ? normalizeLayerId(params.layer) : state.activeLayer;

    pushHistory();
    edges.push({
      id: edgeId,
      from: fromNode.id,
      to: toNode.id,
      createdLayer: layerId,
      type: 'edge',
      relationExpr: '',
      label: '',
      description: String(params.description || ''),
      pathStyle: String(params.pathStyle || 'straight'),
      strokeStyle: String(params.strokeStyle || 'solid'),
      arrowFrom: Boolean(params.arrowFrom),
      arrowTo: Object.prototype.hasOwnProperty.call(params, 'arrowTo') ? Boolean(params.arrowTo) : false,
      ...anchors,
    });

    fromNode.dirty = true;
    toNode.dirty = true;

    state.selectedEdgeId = edgeId;
    state.selectedNodeIds = new Set();
    state.selectedNodeId = null;

    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();

    return {
      created: true,
      edgeId,
      fromNodeName: fromNode.name,
      toNodeName: toNode.name,
    };
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

  function hasIllegalOverlapInRectSet(rectByNodeId) {
    const projected = nodes.map((n) => {
      const next = rectByNodeId.get(n.id);
      if (!next) return { ...n };
      return { ...n, x: next.x, y: next.y, w: next.w, h: next.h };
    });

    for (let i = 0; i < projected.length; i += 1) {
      for (let j = i + 1; j < projected.length; j += 1) {
        const a = projected[i];
        const b = projected[j];
        if (!rectsIntersect(a, b)) continue;
        const aContainsB = rectContainsRect(a, b);
        const bContainsA = rectContainsRect(b, a);
        if (!aContainsB && !bContainsA) return { a, b };
      }
    }

    return null;
  }

  function arrangeNodesGridByParams(params = {}) {
    const carrier = params.targetLrtb || params.lrtb;
    const targetRect = normalizeRectFromLrtb(carrier);

    const m = Math.trunc(Number(params.m));
    const n = Math.trunc(Number(params.n));
    if (!Number.isFinite(m) || !Number.isFinite(n) || m <= 0 || n <= 0) {
      throw new Error('m and n must be positive integers');
    }

    const axisRaw = String(params.axis || 'x').trim().toLowerCase();
    const axis = axisRaw === 'y' ? 'y' : 'x';

    const nodeNames = Array.isArray(params.nodeNames)
      ? params.nodeNames.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    if (nodeNames.length === 0) throw new Error('nodeNames is required');
    if (nodeNames.length > m * n) {
      throw new Error(`nodeNames length (${nodeNames.length}) exceeds grid capacity (${m * n})`);
    }

    const uniqueNameCheck = new Set();
    for (const name of nodeNames) {
      const key = name.toLowerCase();
      if (uniqueNameCheck.has(key)) throw new Error(`duplicate node name in request: ${name}`);
      uniqueNameCheck.add(key);
    }

    const nodesToArrange = nodeNames.map((name) => {
      const found = getNodeByNameStrict(name);
      if (!found) throw new Error(`node not found: ${name}`);
      return found;
    });

    const arrangedRootIdSet = new Set(nodesToArrange.map((n) => n.id));

    const totalWidth = targetRect.w;
    const totalHeight = targetRect.h;
    const colUnit = totalWidth / (3 * n + 1);
    const rowUnit = totalHeight / (3 * m + 1);

    if (!(colUnit > 0) || !(rowUnit > 0)) {
      throw new Error('target lrtb must have positive width and height');
    }

    const plannedRects = new Map();
    const placements = [];

    for (let idx = 0; idx < nodesToArrange.length; idx += 1) {
      const row = axis === 'x' ? Math.floor(idx / n) + 1 : (idx % m) + 1;
      const col = axis === 'x' ? (idx % n) + 1 : Math.floor(idx / m) + 1;

      const left = targetRect.x + (3 * col - 2) * colUnit;
      const right = targetRect.x + (3 * col) * colUnit;
      const top = targetRect.y + (3 * row - 2) * rowUnit;
      const bottom = targetRect.y + (3 * row) * rowUnit;

      const node = nodesToArrange[idx];
      const nextRect = {
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
      };

      plannedRects.set(node.id, nextRect);
      placements.push({
        name: node.name,
        from: buildNodeLrtb(node),
        to: {
          left,
          right,
          top,
          bottom,
        },
      });
    }

    for (const node of nodesToArrange) {
      const next = plannedRects.get(node.id);
      if (!isPlacementLegal(next, new Set(arrangedRootIdSet))) {
        throw new Error(`arrange would create illegal overlap at node: ${node.name}`);
      }
    }

    const descendantsByRoot = new Map();
    for (const root of nodesToArrange) {
      const queue = [root.id];
      const children = [];
      while (queue.length > 0) {
        const cur = queue.shift();
        for (const child of nodes.filter((n) => n.parentId === cur)) {
          if (arrangedRootIdSet.has(child.id)) continue;
          children.push(child);
          queue.push(child.id);
        }
      }
      descendantsByRoot.set(root.id, children);
    }

    const projected = new Map();
    for (const root of nodesToArrange) {
      const old = { x: root.x, y: root.y, w: root.w, h: root.h };
      const next = plannedRects.get(root.id);
      projected.set(root.id, next);

      const sx = next.w / Math.max(1e-6, old.w);
      const sy = next.h / Math.max(1e-6, old.h);

      const descendants = descendantsByRoot.get(root.id) || [];
      for (const child of descendants) {
        const relX = (child.x - old.x) / Math.max(1e-6, old.w);
        const relY = (child.y - old.y) / Math.max(1e-6, old.h);
        const relW = child.w / Math.max(1e-6, old.w);
        const relH = child.h / Math.max(1e-6, old.h);
        projected.set(child.id, {
          x: next.x + relX * next.w,
          y: next.y + relY * next.h,
          w: Math.max(20, relW * next.w),
          h: Math.max(20, relH * next.h),
        });
      }
    }

    const overlap = hasIllegalOverlapInRectSet(projected);
    if (overlap) {
      throw new Error(`arrange would create illegal overlap between ${overlap.a.name} and ${overlap.b.name}`);
    }

    pushHistory();
    for (const [id, rect] of projected.entries()) {
      const node = nodes.find((n) => n.id === id);
      if (!node) continue;
      node.x = rect.x;
      node.y = rect.y;
      node.w = rect.w;
      node.h = rect.h;
      node.dirty = true;
      node.revision += 1;
    }

    recomputeAllContainmentFromGeometry();
    const layerOrderConflict = validateContainmentLayerOrder();
    if (layerOrderConflict) {
      if (history.past.length > 0) {
        const prev = history.past.pop();
        restoreSnapshot(prev);
      }
      throw new Error(`child layer cannot be earlier than parent (${layerOrderConflict.child.name} -> ${layerOrderConflict.parent.name})`);
    }

    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();

    return {
      arranged: true,
      rows: m,
      cols: n,
      axis,
      count: nodesToArrange.length,
      placements,
    };
  }

  return {
    normalizeRectFromLrtb,
    createNodeAtPositionByParams,
    normalizeEdgeAnchorInput,
    createEdgeByParams,
    normalizeMirrorTopLeft,
    createMirrorByParams,
    isPlacementLegalForNode,
    updateNodeByParams,
    getNodeByNameStrict,
    hasIllegalOverlapInRectSet,
    arrangeNodesGridByParams,
  };
}
