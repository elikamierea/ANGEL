import { MIRROR_NAME_SEP } from '../graph-helpers.js';

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
    deriveDefaultMirrorName,
    buildMirrorName,
    splitMirrorName,
    isPlacementLegal,
    validateContainmentLayerOrder,
    recomputeAllContainmentFromGeometry,
    getNodeLayerContent,
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

  function buildLayerContentSeed(progress, detail, status) {
    return Object.fromEntries(getAllLayerIds().map((lid) => [lid, { progress, detail, status, resourceBindings: [] }]));
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

  // Single construction point for mirror nodes, shared by the agent/MCP tool
  // and the pointer-drag UI. A mirror is an ordinary node with three extras:
  //   - isMirror + mirrorOfId : the (rename-robust) link to its source
  //   - name `${source.name}@${local}` : source-bound prefix + local segment
  //   - fully independent content (describes its local role, never synced)
  // Throws on illegal placement / duplicate name / layer-order conflict, rolling
  // back the pushed history entry so callers never see a partial node.
  function createMirrorNode({ source, rect, layerId, localName = '', content = {} }) {
    if (!source) throw new Error('source is required');
    if (!isPlacementLegal(rect)) {
      throw new Error('illegal overlap (must be disjoint or containment)');
    }

    const requested = String(localName || '').trim();
    if (requested.includes(MIRROR_NAME_SEP)) {
      throw new Error(`mirror local name cannot contain '${MIRROR_NAME_SEP}'`);
    }

    const progress = String(content.progress || '').trim();
    const detail = String(content.detail || '').trim();
    const status = String(content.status || '').trim() || 'active';
    const colorIndex = normalizeColorIndex(
      content.colorIndex != null ? content.colorIndex : source.colorIndex,
    );
    const resourceBindings = normalizeResourceBindings(content.resourceBindings);

    const rollback = () => { if (history.past.length > 0) restoreSnapshot(history.past.pop()); };

    const id = nextNodeId();
    pushHistory();
    const mirrorNode = {
      id,
      name: `${MIRROR_NAME_SEP}mirror-pending-${id}`, // placeholder, replaced after containment
      progress,
      detail,
      status,
      createdLayer: layerId,
      layerContent: buildLayerContentSeed(progress, detail, status),
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
      validation: [{ level: 'info', message: `Mirror of ${source.name}` }],
    };
    // Bindings are per-layer; attach them to the layer the mirror is created in.
    mirrorNode.layerContent[layerId].resourceBindings = resourceBindings;

    nodes.push(mirrorNode);
    recomputeAllContainmentFromGeometry();

    // The default local name depends on the geometric parent, which is only
    // known after containment recompute.
    const parentNode = mirrorNode.parentId ? nodes.find((n) => n.id === mirrorNode.parentId) : null;
    if (requested) {
      const explicit = buildMirrorName(source.name, requested);
      if (!isNodeNameAvailable(explicit, mirrorNode.id)) {
        rollback();
        throw new Error(`duplicate node name: ${explicit}`);
      }
      mirrorNode.name = explicit;
    } else {
      mirrorNode.name = deriveDefaultMirrorName(source.name, parentNode);
    }

    const layerOrderConflict = validateContainmentLayerOrder();
    if (layerOrderConflict) {
      rollback();
      throw new Error(`child layer cannot be earlier than parent (${layerOrderConflict.child.name} -> ${layerOrderConflict.parent.name})`);
    }

    return mirrorNode;
  }

  // Resolve an incoming mirror name param (bare local segment, or a full
  // `${source.name}@${local}` whose prefix must match) down to its local segment.
  function resolveMirrorLocalName(rawName, source) {
    if (rawName == null) return '';
    const raw = String(rawName).trim();
    const parts = splitMirrorName(raw);
    if (!parts) return raw;
    if (parts.source !== source.name) {
      throw new Error(`mirror name prefix must equal source name "${source.name}"`);
    }
    return parts.local;
  }

  function createMirrorByParams(params = {}) {
    const sourceName = String(params.source || '').trim();
    if (!sourceName) throw new Error('source is required');

    const source = findNodeByNameForRequestedLayers(params.layer, sourceName);
    if (!source) throw new Error(`source node not found: ${sourceName}`);

    const { left, top } = normalizeMirrorTopLeft(params);
    const rect = { x: left, y: top, w: source.w, h: source.h };
    const layerId = params.layer ? normalizeLayerId(params.layer) : state.activeLayer;

    const has = (k) => Object.prototype.hasOwnProperty.call(params, k);
    const content = {};
    if (has('progress')) content.progress = params.progress;
    if (has('detail')) content.detail = params.detail;
    if (has('status')) content.status = params.status;
    if (has('colorIndex') || has('color')) content.colorIndex = params.colorIndex != null ? params.colorIndex : params.color;
    if (has('resourceBindings')) content.resourceBindings = params.resourceBindings;

    const localName = resolveMirrorLocalName(params.name, source);
    const mirrorNode = createMirrorNode({ source, rect, layerId, localName, content });

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

    let nextName = params.name != null ? String(params.name || '').trim() : String(node.name || '');
    if (!nextName) throw new Error('name cannot be empty');
    // A mirror's source-bound prefix is locked: renames may only touch the local
    // segment after '@'. Accept either a bare local segment or a full name whose
    // prefix still matches the source.
    if (node.isMirror && node.mirrorOfId && params.name != null) {
      const source = nodes.find((n) => n.id === node.mirrorOfId);
      const srcName = String(source?.name || '');
      const parts = splitMirrorName(nextName);
      if (parts) {
        if (parts.source !== srcName) {
          throw new Error(`cannot change mirror source prefix (name must stay "${srcName}${MIRROR_NAME_SEP}…")`);
        }
      } else {
        nextName = buildMirrorName(srcName, nextName);
      }
    } else if (nextName.includes(MIRROR_NAME_SEP)) {
      throw new Error(`'${MIRROR_NAME_SEP}' is reserved for mirror names`);
    }
    if (!isNodeNameAvailable(nextName, node.id)) throw new Error(`duplicate node name: ${nextName}`);

    const nextRect = params.lrtb ? normalizeRectFromLrtb(params.lrtb) : { x: node.x, y: node.y, w: node.w, h: node.h };
    if (!isPlacementLegalForNode(nextRect, node.id)) {
      const conflicting = nodes.find((n) => {
        if (n.id === node.id) return false;
        if (!isNodeVisibleInLayer(n, getActiveLayerIndex())) return false;
        if (rectEquals(n, nextRect)) return false;
        if (!rectsIntersect(n, nextRect)) return false;
        return !rectContainsRect(n, nextRect) && !rectContainsRect(nextRect, n);
      });
      const who = conflicting ? ` with "${String(conflicting.name || conflicting.id)}"` : '';
      throw new Error(`illegal overlap${who} after move/resize (must be disjoint or containment)`);
    }

    const layerId = params.layer ? normalizeLayerId(params.layer) : state.activeLayer;
    const layerData = getNodeLayerContent(node, layerId);
    const progress = Object.prototype.hasOwnProperty.call(params, 'progress')
      ? String(params.progress || '').trim()
      : String(layerData.progress || '');
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
      : (Array.isArray(layerData.resourceBindings) ? layerData.resourceBindings : []);

    pushHistory();

    node.name = nextName;
    node.x = nextRect.x;
    node.y = nextRect.y;
    node.w = nextRect.w;
    node.h = nextRect.h;
    node.colorIndex = colorIndex;
    // Bindings are per-layer: write to the requested/active layer only.
    if (shouldUpdateBindings) layerData.resourceBindings = resourceBindings;

    layerData.progress = progress;
    layerData.detail = detail;
    layerData.status = status;
    node.progress = progress;
    node.detail = detail;
    node.status = status;
    node.dirty = true;
    node.revision += 1;

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
    createMirrorNode,
    createMirrorByParams,
    isPlacementLegalForNode,
    updateNodeByParams,
    getNodeByNameStrict,
  };
}
