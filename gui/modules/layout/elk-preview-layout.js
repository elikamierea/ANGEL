import {
  ELK_LAYOUT_TUNING,
  toElkDirectedEdge,
  buildElkHierarchy,
  buildLayoutOptions,
  flattenElkNodesAbsolute,
  collectElkEdgeEndpoints,
  nodeIdFromEndpointRef,
  relaxStressMultiEdgeAnchors,
  computeCanonicalEdgeAnchors,
} from './elk-layout-shared.js';

// UI preview ELK layout helper (selection-scoped).
//
// Used by transform context-menu actions to preview layered layout in-place,
// mapped back into the current selection bounding box.
export function createElkPreviewLayout(deps) {
  const {
    nodes,
    edges,
    getSelectedNodesOrdered,
    getNodesBoundingRect,
    projectToNodeEdgeByRay,
    render,
  } = deps;

  async function previewElkLayoutInSelection(directionRaw) {
    const ELKClass = globalThis?.ELK;
    if (typeof ELKClass !== 'function') throw new Error('ELK unavailable');

    const selected = getSelectedNodesOrdered();
    if (selected.length < 2) throw new Error('Need at least 2 selected nodes');

    const selectedIdSet = new Set(selected.map((n) => n.id));
    const subEdges = edges.filter((e) => selectedIdSet.has(e.from) && selectedIdSet.has(e.to));

    const directedEdges = subEdges.map((e, idx) => toElkDirectedEdge(e, idx, 'ui_e_'));
    const requestedDirection = String(directionRaw || '').trim().toUpperCase();
    const { rootChildren, rootLayout } = buildElkHierarchy(
      selected,
      directedEdges,
      requestedDirection,
      ELK_LAYOUT_TUNING,
    );

    const elk = new ELKClass();
    const elkInput = {
      id: 'root',
      layoutOptions: buildLayoutOptions(rootLayout, ELK_LAYOUT_TUNING),
      children: rootChildren,
      edges: directedEdges,
    };

    const out = await elk.layout(elkInput);
    const edgeEndpointsById = collectElkEdgeEndpoints(out);
    const outNodes = [];
    flattenElkNodesAbsolute(out?.children || [], outNodes, Number(out?.x) || 0, Number(out?.y) || 0);
    if (outNodes.length === 0) throw new Error('ELK returned no nodes');

    const elkNodeById = new Map(outNodes.map((n) => [String(n.id), {
      id: String(n.id),
      x: Number(n._absX) || 0,
      y: Number(n._absY) || 0,
      w: Number(n.width) || 220,
      h: Number(n.height) || 120,
    }]));

    const adjustedElkAnchorsByEdgeId = new Map();
    const postElkPointsByEdgeId = new Map();
    if (rootLayout.algorithm === 'stress') {
      const tempEdges = [];
      for (const d of directedEdges) {
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
      console.info(`[ELK preview][stress] localEdges=${stressDiag.localEdgeCount}, pairs=${stressDiag.pairCount}, heavyEdges=${stressDiag.heavyEdgeCount}, groups=${stressDiag.groups}, moved=${stressDiag.moved}`);
      if ((stressDiag.heavyEdgeCount || 0) > 0 && (stressDiag.moved || 0) > 0) {
        for (const e of tempEdges) adjustedElkAnchorsByEdgeId.set(e.id, { fromAnchor: e.fromAnchor, toAnchor: e.toAnchor });
      }
    }

    const canonicalByEdgeId = computeCanonicalEdgeAnchors({
      directedEdges,
      edgeEndpointsById,
      elkNodeById,
      selectedNodes: selected,
      adjustedElkAnchorsByEdgeId,
      projectToNodeEdgeByRay,
    });

    for (const d of directedEdges) {
      const sourceNodeId = nodeIdFromEndpointRef(d.sources[0]);
      const targetNodeId = nodeIdFromEndpointRef(d.targets[0]);
      const raw = edgeEndpointsById.get(d.id);
      const canonical = canonicalByEdgeId.get(d.id);
      if (!(raw?.start && raw?.end && canonical?.start && canonical?.end)) {
        console.warn(`[ELK preview][edge stage] ${d.id} ${sourceNodeId}->${targetNodeId} missing canonical/raw endpoint`);
        continue;
      }
      postElkPointsByEdgeId.set(d.id, { start: canonical.start, end: canonical.end });
      console.info(`[ELK preview][edge stage] ${d.id} ${sourceNodeId}->${targetNodeId} rawStart=(${raw.start.x.toFixed(3)},${raw.start.y.toFixed(3)}) rawEnd=(${raw.end.x.toFixed(3)},${raw.end.y.toFixed(3)}) postStart=(${canonical.start.x.toFixed(3)},${canonical.start.y.toFixed(3)}) postEnd=(${canonical.end.x.toFixed(3)},${canonical.end.y.toFixed(3)}) source=${canonical.source}`);
    }

    const minX = Math.min(...outNodes.map((n) => Number(n._absX) || 0));
    const minY = Math.min(...outNodes.map((n) => Number(n._absY) || 0));
    const maxX = Math.max(...outNodes.map((n) => (Number(n._absX) || 0) + (Number(n.width) || 220)));
    const maxY = Math.max(...outNodes.map((n) => (Number(n._absY) || 0) + (Number(n.height) || 120)));
    const srcW = maxX - minX;
    const srcH = maxY - minY;
    if (!(srcW > 0) || !(srcH > 0)) throw new Error('ELK returned invalid bbox');

    const edgeNodeIds = new Set();
    for (const e of subEdges) {
      edgeNodeIds.add(String(e.from));
      edgeNodeIds.add(String(e.to));
    }
    const remapNodes = outNodes.filter((n) => edgeNodeIds.has(String(n.id)));
    const remapSourceNodes = remapNodes.length > 0 ? remapNodes : outNodes;
    const remapTargetNodes = selected.filter((n) => edgeNodeIds.has(String(n.id)));
    const remapTargetRef = remapTargetNodes.length > 0 ? remapTargetNodes : selected;

    const remapMinX = Math.min(...remapSourceNodes.map((n) => Number(n._absX) || 0));
    const remapMinY = Math.min(...remapSourceNodes.map((n) => Number(n._absY) || 0));
    const remapMaxX = Math.max(...remapSourceNodes.map((n) => (Number(n._absX) || 0) + (Number(n.width) || 220)));
    const remapMaxY = Math.max(...remapSourceNodes.map((n) => (Number(n._absY) || 0) + (Number(n.height) || 120)));
    const remapSrcW = remapMaxX - remapMinX;
    const remapSrcH = remapMaxY - remapMinY;
    if (!(remapSrcW > 0) || !(remapSrcH > 0)) throw new Error('ELK returned invalid remap bbox');

    const bbox = getNodesBoundingRect(remapTargetRef);
    const fullSelectedBbox = getNodesBoundingRect(selected);
    const targetArea = fullSelectedBbox.w * fullSelectedBbox.h;
    const scale = Math.min(bbox.w / remapSrcW, bbox.h / remapSrcH);
    const offsetX = bbox.x + (bbox.w - remapSrcW * scale) / 2;
    const offsetY = bbox.y + (bbox.h - remapSrcH * scale) / 2;
    console.info(`[ELK preview][trace L166] remapTargetIds=${remapTargetRef.map((n) => n.id).join(',')} edgeNodeIds=${[...edgeNodeIds].join(',')}`);
    console.info(`[ELK preview][remap basis] selectedCount=${selected.length} outNodeCount=${outNodes.length} remapSourceCount=${remapSourceNodes.length} remapTargetCount=${remapTargetRef.length} minX=${remapMinX.toFixed(3)} minY=${remapMinY.toFixed(3)} maxX=${remapMaxX.toFixed(3)} maxY=${remapMaxY.toFixed(3)} srcW=${remapSrcW.toFixed(3)} srcH=${remapSrcH.toFixed(3)} bboxX=${bbox.x.toFixed(3)} bboxY=${bbox.y.toFixed(3)} bboxW=${bbox.w.toFixed(3)} bboxH=${bbox.h.toFixed(3)} fullBBoxW=${fullSelectedBbox.w.toFixed(3)} fullBBoxH=${fullSelectedBbox.h.toFixed(3)} targetArea=${targetArea.toFixed(3)} scale=${scale.toFixed(6)} offsetX=${offsetX.toFixed(3)} offsetY=${offsetY.toFixed(3)}`);

    for (const item of outNodes) {
      const node = nodes.find((n) => n.id === item.id);
      if (!node) continue;
      const prevX = node.x;
      const prevY = node.y;
      const prevW = node.w;
      const prevH = node.h;
      node.x = offsetX + ((Number(item._absX) || 0) - remapMinX) * scale;
      node.y = offsetY + ((Number(item._absY) || 0) - remapMinY) * scale;
      node.w = (Number(item.width) || 220) * scale;
      node.h = (Number(item.height) || 120) * scale;
      console.info(`[ELK preview][trace L180] node=${node.id} from=(${prevX.toFixed(3)},${prevY.toFixed(3)},${prevW.toFixed(3)},${prevH.toFixed(3)}) to=(${node.x.toFixed(3)},${node.y.toFixed(3)},${node.w.toFixed(3)},${node.h.toFixed(3)}) elkAbs=(${(Number(item._absX)||0).toFixed(3)},${(Number(item._absY)||0).toFixed(3)},${(Number(item.width)||0).toFixed(3)},${(Number(item.height)||0).toFixed(3)})`);
    }

    const laidOutSelected = selected;
    const laidOutBbox = getNodesBoundingRect(laidOutSelected);
    const currentArea = laidOutBbox.w * laidOutBbox.h;

    let areaScale = 1;
    let areaCx = laidOutBbox.x + laidOutBbox.w / 2;
    let areaCy = laidOutBbox.y + laidOutBbox.h / 2;
    if (targetArea > 0 && currentArea > 0) {
      areaScale = Math.sqrt(targetArea / currentArea);
      areaCx = laidOutBbox.x + laidOutBbox.w / 2;
      areaCy = laidOutBbox.y + laidOutBbox.h / 2;
      for (const node of laidOutSelected) {
        const prevX = node.x;
        const prevY = node.y;
        const prevW = node.w;
        const prevH = node.h;
        const nodeCx = node.x + node.w / 2;
        const nodeCy = node.y + node.h / 2;
        const nextW = node.w * areaScale;
        const nextH = node.h * areaScale;
        const nextCx = areaCx + (nodeCx - areaCx) * areaScale;
        const nextCy = areaCy + (nodeCy - areaCy) * areaScale;
        node.x = nextCx - nextW / 2;
        node.y = nextCy - nextH / 2;
        node.w = nextW;
        node.h = nextH;
        console.info(`[ELK preview][trace L205] area node=${node.id} from=(${prevX.toFixed(3)},${prevY.toFixed(3)},${prevW.toFixed(3)},${prevH.toFixed(3)}) to=(${node.x.toFixed(3)},${node.y.toFixed(3)},${node.w.toFixed(3)},${node.h.toFixed(3)}) areaScale=${areaScale.toFixed(6)} center=(${areaCx.toFixed(3)},${areaCy.toFixed(3)})`);
      }
    }
    console.info(`[ELK preview][remap area] laidOutBboxX=${laidOutBbox.x.toFixed(3)} laidOutBboxY=${laidOutBbox.y.toFixed(3)} laidOutBboxW=${laidOutBbox.w.toFixed(3)} laidOutBboxH=${laidOutBbox.h.toFixed(3)} currentArea=${currentArea.toFixed(3)} areaScale=${areaScale.toFixed(6)} areaCx=${areaCx.toFixed(3)} areaCy=${areaCy.toFixed(3)}`);

    function mapElkPointToCanvas(pt) {
      const baseX = offsetX + (pt.x - remapMinX) * scale;
      const baseY = offsetY + (pt.y - remapMinY) * scale;
      return {
        x: areaCx + (baseX - areaCx) * areaScale,
        y: areaCy + (baseY - areaCy) * areaScale,
      };
    }

    let endpointApplied = 0;
    let endpointFallback = 0;
    for (let i = 0; i < subEdges.length; i += 1) {
      const edge = subEdges[i];
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) continue;

      const directed = directedEdges[i] || null;
      const endpoints = directed ? edgeEndpointsById.get(directed.id) : null;
      const adjusted = directed ? adjustedElkAnchorsByEdgeId.get(directed.id) : null;

      if (directed && (adjusted || (endpoints?.start && endpoints?.end))) {
        const sourceNodeId = nodeIdFromEndpointRef(directed.sources[0]);

        const staged = postElkPointsByEdgeId.get(directed.id);
        const startElk = staged?.start || endpoints?.start;
        const endElk = staged?.end || endpoints?.end;
        if (!startElk || !endElk) continue;

        const startPt = mapElkPointToCanvas(startElk);
        const endPt = mapElkPointToCanvas(endElk);

        if (sourceNodeId === edge.from) {
          edge.fromAnchor = projectToNodeEdgeByRay(fromNode, startPt.x, startPt.y);
          edge.toAnchor = projectToNodeEdgeByRay(toNode, endPt.x, endPt.y);
        } else {
          edge.fromAnchor = projectToNodeEdgeByRay(fromNode, endPt.x, endPt.y);
          edge.toAnchor = projectToNodeEdgeByRay(toNode, startPt.x, startPt.y);
        }
        const fromNodeUsed = sourceNodeId === edge.from ? fromNode : toNode;
        const toNodeUsed = sourceNodeId === edge.from ? toNode : fromNode;
        const fromInputPt = sourceNodeId === edge.from ? startPt : endPt;
        const toInputPt = sourceNodeId === edge.from ? endPt : startPt;
        console.info(`[ELK preview][trace L236] ${directed.id} fromNode=${fromNodeUsed.id} toNode=${toNodeUsed.id} fromInput=(${fromInputPt.x.toFixed(3)},${fromInputPt.y.toFixed(3)}) toInput=(${toInputPt.x.toFixed(3)},${toInputPt.y.toFixed(3)}) fromAnchor=${edge.fromAnchor?.side || '-'}@${Number(edge.fromAnchor?.t ?? NaN).toFixed(3)} toAnchor=${edge.toAnchor?.side || '-'}@${Number(edge.toAnchor?.t ?? NaN).toFixed(3)}`);
        const fromAnchorForLog = sourceNodeId === edge.from ? edge.fromAnchor : edge.toAnchor;
        const toAnchorForLog = sourceNodeId === edge.from ? edge.toAnchor : edge.fromAnchor;
        console.info(`[ELK preview][edge downstream] ${directed.id} ${sourceNodeId}->${nodeIdFromEndpointRef(directed.targets[0])} postStart=(${startElk.x.toFixed(3)},${startElk.y.toFixed(3)}) postEnd=(${endElk.x.toFixed(3)},${endElk.y.toFixed(3)}) mappedStart=(${startPt.x.toFixed(3)},${startPt.y.toFixed(3)}) mappedEnd=(${endPt.x.toFixed(3)},${endPt.y.toFixed(3)}) rayFrom=${fromAnchorForLog?.side || '-'}@${Number(fromAnchorForLog?.t ?? NaN).toFixed(3)} rayTo=${toAnchorForLog?.side || '-'}@${Number(toAnchorForLog?.t ?? NaN).toFixed(3)}`);
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

    if (endpointFallback > 0) {
      console.warn(`[ELK preview] edge endpoint fallback used for ${endpointFallback}/${subEdges.length} edges (applied=${endpointApplied})`);
    }

    render();
  }

  return { previewElkLayoutInSelection };
}
