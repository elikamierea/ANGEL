export function createEditNodeCreateCommand(deps) {
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
    findSmallestContainerForRect,
    isPlacementLegal,
    validateContainmentLayerOrder,
    recomputeAllContainmentFromGeometry,
    getAllLayerIds,
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

  function buildLayerContentSeed(synopsis, detail, status) {
    return Object.fromEntries(getAllLayerIds().map((lid) => [lid, { synopsis, detail, status }]));
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

  return {
    normalizeRectFromLrtb,
    normalizeResourceBindings,
    createNodeAtPositionByParams,
  };
}
