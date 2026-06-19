import {
  ELK_LAYOUT_TUNING,
  buildElkHierarchy,
  buildLayoutOptions,
  flattenElkNodesAbsolute,
  collectElkEdgeEndpoints,
  nodeIdFromEndpointRef,
  relaxStressMultiEdgeAnchors,
  computeCanonicalEdgeAnchors,
} from './elk-layout-shared.js';

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

function rectContainsRect(outer, inner) {
  return (
    inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w
    && inner.y + inner.h <= outer.y + outer.h
  );
}

function rectsIntersect(a, b) {
  return !(
    a.x + a.w <= b.x
    || b.x + b.w <= a.x
    || a.y + a.h <= b.y
    || b.y + b.h <= a.y
  );
}

function areSpatiallyCompatible(a, b) {
  return !rectsIntersect(a, b) || rectContainsRect(a, b) || rectContainsRect(b, a);
}

function normalizeDirection(input) {
  const value = String(input || '').trim().toUpperCase();
  if (!['RIGHT', 'LEFT', 'DOWN', 'UP'].includes(value)) {
    throw new Error('direction must be one of RIGHT/LEFT/DOWN/UP');
  }
  return value;
}

function getNodeByNameStrict(nodes, name) {
  const needle = String(name || '').trim();
  if (!needle) return null;
  const exact = nodes.find((n) => String(n.name || '') === needle);
  if (exact) return exact;
  return nodes.find((n) => String(n.name || '').toLowerCase() === needle.toLowerCase()) || null;
}

function findSmallestStrictContainerForRect(nodes, rect, ignoreNodeId = null) {
  const candidates = nodes
    .filter((n) => n.id !== ignoreNodeId)
    .filter((n) => rectContainsRect(n, rect))
    .filter((n) => !(n.x === rect.x && n.y === rect.y && n.w === rect.w && n.h === rect.h));

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.w * a.h) - (b.w * b.h));
  return candidates[0];
}

export function createAutoLayoutTool(deps) {
  const {
    nodes,
    edges,
    normalizeRectFromLrtb,
    pushHistory,
    recomputeAllContainmentFromGeometry,
    validateContainmentLayerOrder,
    updateTopbar,
    rebuildSidebar,
    renderRightPanel,
    projectToNodeEdgeByRay,
    render,
    state,
  } = deps;

  const ELKClass = globalThis?.ELK;
  if (typeof ELKClass !== 'function') {
    throw new Error('ELK runtime is unavailable. Ensure elk.bundled.js is loaded before app.js.');
  }
  const elk = new ELKClass();

  return async function autoLayoutByParams(params = {}) {
    const nodeNames = Array.isArray(params.nodeNames)
      ? params.nodeNames.map((n) => String(n || '').trim()).filter(Boolean)
      : [];
    if (nodeNames.length === 0) throw new Error('nodeNames is required');

    const uniqueNames = new Set();
    for (const name of nodeNames) {
      const key = name.toLowerCase();
      if (uniqueNames.has(key)) throw new Error(`duplicate node name in request: ${name}`);
      uniqueNames.add(key);
    }

    const selectedNodes = nodeNames.map((name) => {
      const found = getNodeByNameStrict(nodes, name);
      if (!found) throw new Error(`node not found: ${name}`);
      return found;
    });

    const selectedIdSet = new Set(selectedNodes.map((n) => n.id));

    const inputEdges = Array.isArray(params.edges) ? params.edges : [];
    if (inputEdges.length === 0) throw new Error('edges is required');

    const edgePairs = inputEdges.map((item, idx) => {
      const fromName = String(item?.fromName || '').trim();
      const toName = String(item?.toName || '').trim();
      if (!fromName || !toName) {
        throw new Error(`edges[${idx}] must include fromName and toName`);
      }
      const fromNode = getNodeByNameStrict(nodes, fromName);
      const toNode = getNodeByNameStrict(nodes, toName);
      if (!fromNode || !toNode) {
        throw new Error(`edges[${idx}] references missing node (${fromName} -> ${toName})`);
      }
      if (!selectedIdSet.has(fromNode.id) || !selectedIdSet.has(toNode.id)) {
        throw new Error(`edges[${idx}] must stay inside selected nodeNames (${fromName} -> ${toName})`);
      }
      const edgeId = `e_${idx + 1}`;
      const matchedEdge = edges.find((e) => e.from === fromNode.id && e.to === toNode.id);
      return {
        id: edgeId,
        sources: [`${fromNode.id}:out:${edgeId}`],
        targets: [`${toNode.id}:in:${edgeId}`],
        sourceNodeId: fromNode.id,
        targetNodeId: toNode.id,
        strokeStyle: String(matchedEdge?.strokeStyle || 'solid'),
      };
    });

    const targetRect = normalizeRectFromLrtb(params.targetLrtb);
    const warnings = [];

    const directionInput = String(params.direction || '').trim();
    const preferredDirection = directionInput ? normalizeDirection(directionInput) : null;

    const { rootChildren, rootLayout } = buildElkHierarchy(
      selectedNodes,
      edgePairs,
      preferredDirection,
      ELK_LAYOUT_TUNING,
    );
    const direction = rootLayout.direction || 'RIGHT';

    const elkInput = {
      id: 'root',
      layoutOptions: buildLayoutOptions(rootLayout, ELK_LAYOUT_TUNING),
      children: rootChildren,
      edges: edgePairs,
    };

    let elkOutput;
    try {
      elkOutput = await elk.layout(elkInput);
    } catch (err) {
      throw new Error(`ELK layout failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const edgeEndpointsById = collectElkEdgeEndpoints(elkOutput);
    const elkNodes = [];
    flattenElkNodesAbsolute(elkOutput.children || [], elkNodes, Number(elkOutput?.x) || 0, Number(elkOutput?.y) || 0);
    if (elkNodes.length === 0) throw new Error('ELK returned no nodes');

    const elkNodeById = new Map(elkNodes.map((n) => [String(n.id), {
      id: String(n.id),
      x: Number(n._absX) || 0,
      y: Number(n._absY) || 0,
      w: Number(n.width) || DEFAULT_NODE_WIDTH,
      h: Number(n.height) || DEFAULT_NODE_HEIGHT,
    }]));

    const adjustedElkAnchorsByEdgeId = new Map();
    const postElkPointsByEdgeId = new Map();
    if (rootLayout.algorithm === 'stress') {
      const tempEdges = [];
      for (const d of edgePairs) {
        const fromId = nodeIdFromEndpointRef(d.sources[0]);
        const toId = nodeIdFromEndpointRef(d.targets[0]);
        const fromNode = elkNodeById.get(fromId);
        const toNode = elkNodeById.get(toId);
        if (!fromNode || !toNode) continue;
        const endpoints = edgeEndpointsById.get(d.id);
        const start = endpoints?.start || { x: toNode.x + toNode.w / 2, y: toNode.y + toNode.h / 2 };
        const end = endpoints?.end || { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h / 2 };
        tempEdges.push({
          id: d.id,
          from: fromId,
          to: toId,
          fromAnchor: projectToNodeEdgeByRay(fromNode, start.x, start.y),
          toAnchor: projectToNodeEdgeByRay(toNode, end.x, end.y),
        });
      }
      const stressDiag = relaxStressMultiEdgeAnchors({
        edges: tempEdges,
        nodes: [...elkNodeById.values()],
        selectedIdSet,
        spacingPx: ELK_LAYOUT_TUNING.PORT_PORT_SPACING,
      });
      warnings.push(`stress diag: localEdges=${stressDiag.localEdgeCount}, pairs=${stressDiag.pairCount}, heavyEdges=${stressDiag.heavyEdgeCount}, groups=${stressDiag.groups}, moved=${stressDiag.moved}`);
      if ((stressDiag.heavyEdgeCount || 0) > 0 && (stressDiag.moved || 0) > 0) {
        for (const e of tempEdges) adjustedElkAnchorsByEdgeId.set(e.id, { fromAnchor: e.fromAnchor, toAnchor: e.toAnchor });
      }
    }

    const canonicalByEdgeId = computeCanonicalEdgeAnchors({
      directedEdges: edgePairs,
      edgeEndpointsById,
      elkNodeById,
      selectedNodes,
      adjustedElkAnchorsByEdgeId,
      projectToNodeEdgeByRay,
    });

    for (const d of edgePairs) {
      const sourceNodeId = nodeIdFromEndpointRef(d.sources[0]);
      const targetNodeId = nodeIdFromEndpointRef(d.targets[0]);
      const raw = edgeEndpointsById.get(d.id);
      const canonical = canonicalByEdgeId.get(d.id);
      if (!(raw?.start && raw?.end && canonical?.start && canonical?.end)) {
        warnings.push(`edge stage ${d.id} ${sourceNodeId}->${targetNodeId} missing canonical/raw endpoint`);
        continue;
      }
      postElkPointsByEdgeId.set(d.id, { start: canonical.start, end: canonical.end });
      warnings.push(`edge stage ${d.id} ${sourceNodeId}->${targetNodeId} rawStart=(${raw.start.x.toFixed(3)},${raw.start.y.toFixed(3)}) rawEnd=(${raw.end.x.toFixed(3)},${raw.end.y.toFixed(3)}) postStart=(${canonical.start.x.toFixed(3)},${canonical.start.y.toFixed(3)}) postEnd=(${canonical.end.x.toFixed(3)},${canonical.end.y.toFixed(3)}) source=${canonical.source}`);
    }

    const minX = Math.min(...elkNodes.map((n) => Number(n._absX) || 0));
    const minY = Math.min(...elkNodes.map((n) => Number(n._absY) || 0));
    const maxX = Math.max(...elkNodes.map((n) => (Number(n._absX) || 0) + (Number(n.width) || DEFAULT_NODE_WIDTH)));
    const maxY = Math.max(...elkNodes.map((n) => (Number(n._absY) || 0) + (Number(n.height) || DEFAULT_NODE_HEIGHT)));

    const srcW = maxX - minX;
    const srcH = maxY - minY;
    if (!(srcW > 0) || !(srcH > 0)) throw new Error('ELK returned invalid bounding box');

    const scaleX = targetRect.w / srcW;
    const scaleY = targetRect.h / srcH;
    warnings.push(`remap basis: selectedCount=${selectedNodes.length}, elkNodeCount=${elkNodes.length}, minX=${minX.toFixed(3)}, minY=${minY.toFixed(3)}, maxX=${maxX.toFixed(3)}, maxY=${maxY.toFixed(3)}, srcW=${srcW.toFixed(3)}, srcH=${srcH.toFixed(3)}, targetX=${targetRect.x.toFixed(3)}, targetY=${targetRect.y.toFixed(3)}, targetW=${targetRect.w.toFixed(3)}, targetH=${targetRect.h.toFixed(3)}, scaleX=${scaleX.toFixed(6)}, scaleY=${scaleY.toFixed(6)}`);

    const nextById = new Map();
    for (const n of elkNodes) {
      const id = String(n.id || '');
      if (!selectedIdSet.has(id)) continue;
      const x = targetRect.x + ((Number(n._absX) || 0) - minX) * scaleX;
      const y = targetRect.y + ((Number(n._absY) || 0) - minY) * scaleY;
      const w = (Number(n.width) || DEFAULT_NODE_WIDTH) * scaleX;
      const h = (Number(n.height) || DEFAULT_NODE_HEIGHT) * scaleY;
      nextById.set(id, { x, y, w, h });
    }

    for (const node of selectedNodes) {
      if (!nextById.has(node.id)) {
        throw new Error(`ELK output missing selected node: ${node.name}`);
      }
    }

    for (const node of nodes) {
      const candidate = nextById.get(node.id);
      const rectA = candidate || { x: node.x, y: node.y, w: node.w, h: node.h };

      for (const other of nodes) {
        if (other.id === node.id) continue;
        const rectB = nextById.get(other.id) || { x: other.x, y: other.y, w: other.w, h: other.h };

        const touchesSelection = selectedIdSet.has(node.id) || selectedIdSet.has(other.id);
        if (!touchesSelection) continue;

        if (!areSpatiallyCompatible(rectA, rectB)) {
          throw new Error(`auto_layout conflict: illegal overlap (${node.name} vs ${other.name})`);
        }
      }
    }

    const beforeParentById = new Map(nodes.map((n) => [n.id, n.parentId || null]));

    pushHistory();

    for (const node of selectedNodes) {
      const next = nextById.get(node.id);
      node.x = next.x;
      node.y = next.y;
      node.w = next.w;
      node.h = next.h;
      node.dirty = true;
      node.revision += 1;
      node.audit.unshift({ actor: 'agent', time: new Date().toISOString(), tool: 'auto_layout', target: `node:${node.id}` });
    }

    const directedById = new Map(edgePairs.map((e) => [e.id, e]));
    const mapByDirectedPair = new Map();
    for (const e of edgePairs) {
      const s = nodeIdFromEndpointRef(e.sources[0]);
      const t = nodeIdFromEndpointRef(e.targets[0]);
      const key = `${s}->${t}`;
      if (!mapByDirectedPair.has(key)) mapByDirectedPair.set(key, []);
      mapByDirectedPair.get(key).push(e.id);
    }

    let endpointApplied = 0;
    let endpointFallback = 0;
    for (const edge of edges) {
      if (!selectedIdSet.has(edge.from) || !selectedIdSet.has(edge.to)) continue;
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) continue;

      const forwardKey = `${edge.from}->${edge.to}`;
      const reverseKey = `${edge.to}->${edge.from}`;
      const forwardList = mapByDirectedPair.get(forwardKey) || [];
      const reverseList = mapByDirectedPair.get(reverseKey) || [];
      const directedId = (forwardList.length > 0 ? forwardList.shift() : null)
        || (reverseList.length > 0 ? reverseList.shift() : null);
      const directed = directedId ? directedById.get(directedId) : null;
      const endpoints = directed ? edgeEndpointsById.get(directed.id) : null;
      const adjusted = directed ? adjustedElkAnchorsByEdgeId.get(directed.id) : null;

      if (directed && (adjusted || (endpoints?.start && endpoints?.end))) {
        const sourceNodeId = nodeIdFromEndpointRef(directed.sources[0]);

        const anchorPoint = (nodeId, anchor, fallbackPoint) => {
          if (!anchor) return fallbackPoint;
          const n = elkNodeById.get(nodeId);
          if (!n) return fallbackPoint;
          const t = Math.max(0, Math.min(1, Number(anchor.t) || 0));
          switch (String(anchor.side || 'right')) {
            case 'left': return { x: n.x, y: n.y + n.h * t };
            case 'right': return { x: n.x + n.w, y: n.y + n.h * t };
            case 'top': return { x: n.x + n.w * t, y: n.y };
            case 'bottom': return { x: n.x + n.w * t, y: n.y + n.h };
            default: return fallbackPoint;
          }
        };

        const staged = postElkPointsByEdgeId.get(directed.id);
        const startElk = staged?.start || (sourceNodeId === edge.from
          ? anchorPoint(edge.from, adjusted?.fromAnchor, endpoints?.start)
          : anchorPoint(edge.to, adjusted?.toAnchor, endpoints?.start));
        const endElk = staged?.end || (sourceNodeId === edge.from
          ? anchorPoint(edge.to, adjusted?.toAnchor, endpoints?.end)
          : anchorPoint(edge.from, adjusted?.fromAnchor, endpoints?.end));
        if (!startElk || !endElk) continue;

        const startPt = {
          x: targetRect.x + (startElk.x - minX) * scaleX,
          y: targetRect.y + (startElk.y - minY) * scaleY,
        };
        const endPt = {
          x: targetRect.x + (endElk.x - minX) * scaleX,
          y: targetRect.y + (endElk.y - minY) * scaleY,
        };

        if (sourceNodeId === edge.from) {
          edge.fromAnchor = projectToNodeEdgeByRay(fromNode, startPt.x, startPt.y);
          edge.toAnchor = projectToNodeEdgeByRay(toNode, endPt.x, endPt.y);
        } else {
          edge.fromAnchor = projectToNodeEdgeByRay(fromNode, endPt.x, endPt.y);
          edge.toAnchor = projectToNodeEdgeByRay(toNode, startPt.x, startPt.y);
        }
        const fromAnchorForLog = sourceNodeId === edge.from ? edge.fromAnchor : edge.toAnchor;
        const toAnchorForLog = sourceNodeId === edge.from ? edge.toAnchor : edge.fromAnchor;
        warnings.push(`edge downstream ${directed.id} ${sourceNodeId}->${nodeIdFromEndpointRef(directed.targets[0])} postStart=(${startElk.x.toFixed(3)},${startElk.y.toFixed(3)}) postEnd=(${endElk.x.toFixed(3)},${endElk.y.toFixed(3)}) mappedStart=(${startPt.x.toFixed(3)},${startPt.y.toFixed(3)}) mappedEnd=(${endPt.x.toFixed(3)},${endPt.y.toFixed(3)}) rayFrom=${fromAnchorForLog?.side || '-'}@${Number(fromAnchorForLog?.t ?? NaN).toFixed(3)} rayTo=${toAnchorForLog?.side || '-'}@${Number(toAnchorForLog?.t ?? NaN).toFixed(3)}`);
        endpointApplied += 1;
      } else {
        const toCx = toNode.x + toNode.w / 2;
        const toCy = toNode.y + toNode.h / 2;
        const fromCx = fromNode.x + fromNode.w / 2;
        const fromCy = fromNode.y + fromNode.h / 2;
        edge.fromAnchor = projectToNodeEdgeByRay(fromNode, toCx, toCy);
        edge.toAnchor = projectToNodeEdgeByRay(toNode, fromCx, fromCy);
        endpointFallback += 1;
      }
    }

    recomputeAllContainmentFromGeometry();

    const layerOrderConflict = validateContainmentLayerOrder();
    if (layerOrderConflict) {
      throw new Error(`auto_layout cancelled: child layer cannot be earlier than parent (${layerOrderConflict.child.name} -> ${layerOrderConflict.parent.name})`);
    }

    if (endpointFallback > 0) {
      warnings.push(`edge endpoint fallback used for ${endpointFallback} edge(s); applied ELK endpoints for ${endpointApplied} edge(s)`);
    }

    const compressionDelta = Math.abs(Math.log(scaleX / scaleY));
    if (compressionDelta >= 0.5) {
      warnings.push(`compression warning: |ln(scaleX/scaleY)|=${compressionDelta.toFixed(3)} >= 0.5`);
    }

    const movedIntoOtherCompound = [];
    for (const node of selectedNodes) {
      const oldParent = beforeParentById.get(node.id) || null;
      const newContainer = findSmallestStrictContainerForRect(nodes, node, node.id);
      const newParent = newContainer ? newContainer.id : null;
      if (oldParent !== newParent && newParent != null) {
        movedIntoOtherCompound.push(`${node.name} -> ${newContainer.name}`);
      }
    }

    if (movedIntoOtherCompound.length > 0) {
      warnings.push(`WARNING: nodes moved into different compound(s): ${movedIntoOtherCompound.join(', ')}`);
    }

    state.selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    state.selectedNodeId = selectedNodes[0]?.id || null;
    state.selectedEdgeId = null;

    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();

    return {
      arranged: true,
      algorithm: 'elk.layered',
      direction,
      nodeCount: selectedNodes.length,
      edgeCount: edgePairs.length,
      targetLrtb: {
        left: targetRect.x,
        right: targetRect.x + targetRect.w,
        top: targetRect.y,
        bottom: targetRect.y + targetRect.h,
      },
      scale: { x: scaleX, y: scaleY },
      warnings,
      placements: selectedNodes.map((node) => ({
        name: node.name,
        lrtb: {
          left: node.x,
          right: node.x + node.w,
          top: node.y,
          bottom: node.y + node.h,
        },
      })),
    };
  };
}
