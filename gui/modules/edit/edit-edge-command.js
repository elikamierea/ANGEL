export function createEditEdgeCommand(deps) {
  const {
    state,
    nodes,
    edges,
    pushHistory,
    updateTopbar,
    rebuildSidebar,
    renderRightPanel,
    render,
    normalizeLayerId,
    parseLayerIndex,
    nextEdgeId,
    clamp01,
    findNodeByNameForRequestedLayers,
    buildEdgeAnchors,
  } = deps;

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
      : buildEdgeAnchors(fromNode, toNode, fromCenter, toCenter);

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
      arrowTo: Object.prototype.hasOwnProperty.call(params, 'arrowTo') ? Boolean(params.arrowTo) : true,
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

  return { normalizeEdgeAnchorInput, createEdgeByParams };
}
