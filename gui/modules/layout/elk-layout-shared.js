export const ELK_LAYOUT_TUNING = {
  LAYERED_NODE_SPACING: 30,
  PORT_PORT_SPACING: 8,
  NON_LAYERED_DESIRED_EDGE_LENGTH: 60,
  NON_LAYERED_PADDING: 40,
  BASE_NODE_SIZE_JITTER: 1e-6,
};

export function nodeIdFromEndpointRef(ref) {
  return String(ref || '').split(':')[0];
}

export function toElkDirectedEdge(edge, idx, idPrefix = 'e_') {
  const arrowFrom = Boolean(edge.arrowFrom);
  const arrowTo = Boolean(edge.arrowTo);
  const forward = !(arrowFrom && !arrowTo);
  const source = forward ? edge.from : edge.to;
  const target = forward ? edge.to : edge.from;
  const edgeId = `${idPrefix}${idx + 1}`;
  return {
    id: edgeId,
    sources: [`${source}:out:${edgeId}`],
    targets: [`${target}:in:${edgeId}`],
    sourceNodeId: source,
    targetNodeId: target,
    strokeStyle: String(edge.strokeStyle || 'solid'),
  };
}

function makeTopAncestorResolver(nodeById, nodeIdSet) {
  const memo = new Map();
  return function topAncestor(id) {
    if (memo.has(id)) return memo.get(id);
    let cur = id;
    let guard = 0;
    while (guard < 128) {
      guard += 1;
      const parentId = nodeById.get(cur)?.parentId;
      if (!parentId || !nodeIdSet.has(parentId)) break;
      cur = parentId;
    }
    memo.set(id, cur);
    return cur;
  };
}

function edgeWeight(edge) {
  const style = String(edge.strokeStyle || 'solid').toLowerCase();
  if (style === 'dashed') return 0.5;
  if (style === 'dotted') return 0.25;
  return 1;
}

function isDag(nodeSet, edgeList) {
  const inDeg = new Map();
  const out = new Map();
  for (const id of nodeSet) {
    inDeg.set(id, 0);
    out.set(id, []);
  }
  for (const e of edgeList) {
    const s = nodeIdFromEndpointRef(e.sources[0]);
    const t = nodeIdFromEndpointRef(e.targets[0]);
    if (!nodeSet.has(s) || !nodeSet.has(t)) continue;
    out.get(s).push(t);
    inDeg.set(t, (inDeg.get(t) || 0) + 1);
  }
  const q = [];
  for (const [id, deg] of inDeg.entries()) if (deg === 0) q.push(id);
  let visited = 0;
  while (q.length > 0) {
    const cur = q.shift();
    visited += 1;
    for (const nx of out.get(cur) || []) {
      const nextDeg = (inDeg.get(nx) || 0) - 1;
      inDeg.set(nx, nextDeg);
      if (nextDeg === 0) q.push(nx);
    }
  }
  return visited === nodeSet.size;
}

export function inferLayoutForNodeIds(nodeIds, directedEdges, nodeById, preferredDirection = null) {
  const nodeIdSet = new Set(nodeIds);
  const topAncestor = makeTopAncestorResolver(nodeById, nodeIdSet);
  const localEdges = directedEdges.filter((e) => {
    const s = nodeIdFromEndpointRef(e.sources[0]);
    const t = nodeIdFromEndpointRef(e.targets[0]);
    if (!nodeIdSet.has(s) || !nodeIdSet.has(t)) return false;
    return topAncestor(s) !== topAncestor(t);
  });

  const vectors = [];
  let weightSum = 0;
  for (const e of localEdges) {
    const from = nodeById.get(nodeIdFromEndpointRef(e.sources[0]));
    const to = nodeById.get(nodeIdFromEndpointRef(e.targets[0]));
    if (!from || !to) continue;
    const vx = (to.x + to.w / 2) - (from.x + from.w / 2);
    const vy = (to.y + to.h / 2) - (from.y + from.h / 2);
    const len2 = vx * vx + vy * vy;
    if (len2 <= 1e-6) continue;
    const w = edgeWeight(e);
    vectors.push({ x: (vx / len2) * w, y: (vy / len2) * w, w });
    weightSum += w;
  }

  if (vectors.length === 0 || weightSum <= 1e-9) {
    const fallbackDirection = ['RIGHT', 'LEFT', 'DOWN', 'UP'].includes(String(preferredDirection || '').toUpperCase())
      ? String(preferredDirection).toUpperCase()
      : 'RIGHT';
    return { algorithm: 'layered', direction: fallbackDirection, meanNorm: 0, stddev: 0 };
  }

  const meanX = vectors.reduce((s, v) => s + v.x, 0) / weightSum;
  const meanY = vectors.reduce((s, v) => s + v.y, 0) / weightSum;
  const meanNorm = Math.hypot(meanX, meanY);
  const variance = vectors.reduce((s, v) => {
    const dx = v.x - meanX;
    const dy = v.y - meanY;
    return s + v.w * (dx * dx + dy * dy);
  }, 0) / weightSum;
  const stddev = Math.sqrt(Math.max(0, variance));

  const direction = Math.abs(meanX) >= Math.abs(meanY)
    ? (meanX >= 0 ? 'RIGHT' : 'LEFT')
    : (meanY >= 0 ? 'DOWN' : 'UP');

  return { algorithm: 'layered', direction, meanNorm, stddev };
}

export function buildLayoutOptions(layout, tuning = ELK_LAYOUT_TUNING) {
  return {
    'elk.algorithm': layout.algorithm,
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.portConstraints': 'FIXED_ORDER',
    'elk.layered.mergeEdges': 'false',
    'elk.edgeRouting.edgeEdgeSpacing': String(tuning.EDGE_EDGE_SPACING),
    'elk.spacing.portPort': String(tuning.PORT_PORT_SPACING),
    ...(layout.algorithm === 'layered'
      ? {
          'elk.direction': layout.direction,
          'elk.spacing.nodeNode': String(tuning.LAYERED_NODE_SPACING),
        }
      : {}),
    ...(layout.algorithm === 'stress'
      ? {
          'elk.spacing.nodeNode': String(tuning.LAYERED_NODE_SPACING),
          'elk.stress.desiredEdgeLength': String(tuning.NON_LAYERED_DESIRED_EDGE_LENGTH),
          'elk.padding': `[top=${tuning.NON_LAYERED_PADDING},left=${tuning.NON_LAYERED_PADDING},bottom=${tuning.NON_LAYERED_PADDING},right=${tuning.NON_LAYERED_PADDING}]`,
        }
      : {}),
  };
}

export function buildElkHierarchy(selectedNodes, directedEdges, preferredDirection = null, tuning = ELK_LAYOUT_TUNING) {
  const selectedIdSet = new Set(selectedNodes.map((n) => n.id));
  const nodeById = new Map(selectedNodes.map((n) => [n.id, n]));

  const portsByNodeId = new Map();
  for (const node of selectedNodes) portsByNodeId.set(node.id, []);
  for (const e of directedEdges) {
    const sourceRef = String(e.sources?.[0] || '');
    const targetRef = String(e.targets?.[0] || '');
    const sourceNodeId = sourceRef.split(':')[0];
    const targetNodeId = targetRef.split(':')[0];
    if (portsByNodeId.has(sourceNodeId)) {
      portsByNodeId.get(sourceNodeId).push({ id: sourceRef, properties: { side: 'EAST' } });
    }
    if (portsByNodeId.has(targetNodeId)) {
      portsByNodeId.get(targetNodeId).push({ id: targetRef, properties: { side: 'WEST' } });
    }
  }

  const childIdsByParent = new Map();
  for (const node of selectedNodes) {
    const parentId = selectedIdSet.has(node.parentId) ? node.parentId : null;
    if (!childIdsByParent.has(parentId)) childIdsByParent.set(parentId, []);
    childIdsByParent.get(parentId).push(node.id);
  }

  function buildElkNode(nodeId) {
    const node = nodeById.get(nodeId);
    const directChildren = childIdsByParent.get(nodeId) || [];
    const isCompound = directChildren.length > 0;
    const jitterX = (Math.random() * 2 - 1) * tuning.BASE_NODE_SIZE_JITTER;
    const jitterY = (Math.random() * 2 - 1) * tuning.BASE_NODE_SIZE_JITTER;
    const elkNode = {
      id: node.id,
      width: isCompound ? node.w : (30 + jitterX),
      height: isCompound ? node.h : (30 + jitterY),
      ports: portsByNodeId.get(node.id) || [],
    };
    if (isCompound) {
      const localLayout = inferLayoutForNodeIds(directChildren, directedEdges, nodeById);
      elkNode.layoutOptions = buildLayoutOptions(localLayout, tuning);
      elkNode.children = directChildren.map((childId) => buildElkNode(childId));
    }
    return elkNode;
  }

  const rootChildren = (childIdsByParent.get(null) || []).map((id) => buildElkNode(id));
  const rootLayout = inferLayoutForNodeIds(rootChildren.map((n) => n.id), directedEdges, nodeById, preferredDirection);
  return { rootChildren, rootLayout };
}

export function flattenElkNodesAbsolute(list, out, ox = 0, oy = 0) {
  for (const item of list || []) {
    const ax = ox + (Number(item.x) || 0);
    const ay = oy + (Number(item.y) || 0);
    out.push({
      ...item,
      _absX: ax,
      _absY: ay,
    });
    if (Array.isArray(item.children) && item.children.length > 0) {
      flattenElkNodesAbsolute(item.children, out, ax, ay);
    }
  }
}

export function collectElkEdgeEndpoints(rootGraph) {
  const byId = new Map();

  function walkGraph(graph, ox = 0, oy = 0) {
    if (!graph || typeof graph !== 'object') return;
    const gx = ox + (Number(graph.x) || 0);
    const gy = oy + (Number(graph.y) || 0);

    for (const edge of graph.edges || []) {
      const section = Array.isArray(edge.sections) ? edge.sections[0] : null;
      if (!section?.startPoint || !section?.endPoint) continue;
      byId.set(String(edge.id || ''), {
        start: {
          x: gx + (Number(section.startPoint.x) || 0),
          y: gy + (Number(section.startPoint.y) || 0),
        },
        end: {
          x: gx + (Number(section.endPoint.x) || 0),
          y: gy + (Number(section.endPoint.y) || 0),
        },
        outgoingShape: String(section.outgoingShape || ''),
        incomingShape: String(section.incomingShape || ''),
      });
    }

    for (const child of graph.children || []) walkGraph(child, gx, gy);
  }

  walkGraph(rootGraph, 0, 0);
  return byId;
}

function anchorPointOnNode(node, anchor, fallbackPoint) {
  if (!anchor || !node) return fallbackPoint;
  const t = clamp01(anchor.t ?? 0.5);
  switch (String(anchor.side || 'right')) {
    case 'left': return { x: node.x, y: node.y + node.h * t };
    case 'right': return { x: node.x + node.w, y: node.y + node.h * t };
    case 'top': return { x: node.x + node.w * t, y: node.y };
    case 'bottom': return { x: node.x + node.w * t, y: node.y + node.h };
    default: return fallbackPoint;
  }
}

function reconcileRawPointToElkAbs(nodeId, rawPoint, elkNodeById, selectedNodeById, projectToNodeEdgeByRay) {
  const node = elkNodeById.get(nodeId);
  if (!node || !rawPoint || typeof projectToNodeEdgeByRay !== 'function') return rawPoint;

  const candidates = [{ x: rawPoint.x, y: rawPoint.y }];
  let accX = 0;
  let accY = 0;
  let cur = selectedNodeById.get(nodeId);
  let guard = 0;
  while (cur?.parentId && guard < 32) {
    guard += 1;
    const parentNode = elkNodeById.get(String(cur.parentId));
    if (!parentNode) break;
    accX += Number(parentNode.x) || 0;
    accY += Number(parentNode.y) || 0;
    candidates.push({ x: rawPoint.x + accX, y: rawPoint.y + accY });
    cur = selectedNodeById.get(String(cur.parentId));
  }

  let best = candidates[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const anchor = projectToNodeEdgeByRay(node, c.x, c.y);
    const snapped = anchorPointOnNode(node, anchor, c);
    const dist = Math.hypot((snapped?.x || 0) - c.x, (snapped?.y || 0) - c.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

export function computeCanonicalEdgeAnchors({
  directedEdges,
  edgeEndpointsById,
  elkNodeById,
  selectedNodes,
  adjustedElkAnchorsByEdgeId,
  projectToNodeEdgeByRay,
}) {
  const canonicalByEdgeId = new Map();
  const selectedNodeById = new Map((selectedNodes || []).map((n) => [String(n.id), n]));

  for (const d of directedEdges || []) {
    const sourceNodeId = nodeIdFromEndpointRef(d.sources?.[0]);
    const targetNodeId = nodeIdFromEndpointRef(d.targets?.[0]);
    const sourceNode = elkNodeById.get(sourceNodeId);
    const targetNode = elkNodeById.get(targetNodeId);
    if (!sourceNode || !targetNode) continue;

    const raw = edgeEndpointsById.get(d.id);
    if (!(raw?.start && raw?.end)) continue;

    const startRawAbs = reconcileRawPointToElkAbs(sourceNodeId, raw.start, elkNodeById, selectedNodeById, projectToNodeEdgeByRay);
    const endRawAbs = reconcileRawPointToElkAbs(targetNodeId, raw.end, elkNodeById, selectedNodeById, projectToNodeEdgeByRay);

    const adjusted = adjustedElkAnchorsByEdgeId?.get(d.id);
    const fromAnchor = adjusted?.fromAnchor || projectToNodeEdgeByRay(sourceNode, startRawAbs.x, startRawAbs.y);
    const toAnchor = adjusted?.toAnchor || projectToNodeEdgeByRay(targetNode, endRawAbs.x, endRawAbs.y);

    const start = anchorPointOnNode(sourceNode, fromAnchor, startRawAbs);
    const end = anchorPointOnNode(targetNode, toAnchor, endRawAbs);

    canonicalByEdgeId.set(d.id, {
      edgeId: d.id,
      sourceNodeId,
      targetNodeId,
      from: { nodeId: sourceNodeId, side: fromAnchor?.side || 'right', t: clamp01(fromAnchor?.t ?? 0.5), space: 'elk-abs' },
      to: { nodeId: targetNodeId, side: toAnchor?.side || 'left', t: clamp01(toAnchor?.t ?? 0.5), space: 'elk-abs' },
      start,
      end,
      source: adjusted ? 'relax' : 'elk',
    });
  }

  return canonicalByEdgeId;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function sideLength(node, side) {
  if (!node) return 1;
  return (side === 'left' || side === 'right') ? Math.max(1e-6, Number(node.h) || 1) : Math.max(1e-6, Number(node.w) || 1);
}

export function relaxStressMultiEdgeAnchors({
  edges,
  nodes,
  selectedIdSet,
  spacingPx,
  alpha = 0.05,
  iterations = 1000,
  epsilon = 1e-4,
}) {
  if (!Array.isArray(edges) || !Array.isArray(nodes)) {
    return { moved: 0, groups: 0, heavyEdgeCount: 0, pairCount: 0, localEdgeCount: 0 };
  }
  const activeIdSet = selectedIdSet instanceof Set ? selectedIdSet : new Set();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const localEdges = edges.filter((e) => activeIdSet.has(e.from) && activeIdSet.has(e.to));
  if (localEdges.length === 0) {
    return { moved: 0, groups: 0, heavyEdgeCount: 0, pairCount: 0, localEdgeCount: 0 };
  }

  const bundleMap = new Map();
  for (const e of localEdges) {
    const a = String(e.from || '');
    const b = String(e.to || '');
    const key = a < b ? `${a}::${b}` : `${b}::${a}`;
    if (!bundleMap.has(key)) bundleMap.set(key, []);
    bundleMap.get(key).push(e);
  }
  const heavyEdgeIds = new Set();
  for (const list of bundleMap.values()) {
    if (list.length > 1) for (const e of list) heavyEdgeIds.add(e.id);
  }
  if (heavyEdgeIds.size === 0) {
    return {
      moved: 0,
      groups: 0,
      heavyEdgeCount: 0,
      pairCount: bundleMap.size,
      localEdgeCount: localEdges.length,
    };
  }

  const edgeOffset = new Map();
  const offsetStep = 0.015;
  const centeredOffsets = (n) => {
    const c = (n - 1) / 2;
    const arr = [];
    for (let i = 0; i < n; i += 1) arr.push((i - c) * offsetStep);
    return arr;
  };

  for (const [pairKey, list] of bundleMap.entries()) {
    if (list.length <= 1) continue;
    const [a, b] = pairKey.split('::');

    const ab = list
      .filter((e) => String(e.from || '') === a && String(e.to || '') === b)
      .sort((x, y) => String(x.id).localeCompare(String(y.id)));
    const ba = list
      .filter((e) => String(e.from || '') === b && String(e.to || '') === a)
      .sort((x, y) => String(x.id).localeCompare(String(y.id)));

    const abOffsets = centeredOffsets(ab.length);
    const baOffsets = centeredOffsets(ba.length);

    for (let i = 0; i < ab.length; i += 1) edgeOffset.set(ab[i].id, abOffsets[i]);
    // Mirror reverse-direction offsets so opposite-direction bundles keep consistent non-crossing lane order.
    for (let i = 0; i < ba.length; i += 1) edgeOffset.set(ba[i].id, -baOffsets[i]);

    // Fallback for unexpected/self-loop cases inside the same unordered pair bucket.
    for (const e of list) {
      if (!edgeOffset.has(e.id)) edgeOffset.set(e.id, 0);
    }
  }

  const groups = new Map();
  function pushEntry(nodeId, side, edge, end) {
    const key = `${nodeId}|${side}`;
    if (!groups.has(key)) groups.set(key, []);
    const off = edgeOffset.get(edge.id) || 0;
    const signed = end === 'from' ? off : -off;
    const tBase = clamp01((edge?.[`${end}Anchor`]?.t ?? 0.5) + signed);
    groups.get(key).push({ edge, end, t0: tBase, t: tBase, movable: heavyEdgeIds.has(edge.id) });
  }

  for (const e of localEdges) {
    const fa = e.fromAnchor;
    const ta = e.toAnchor;
    if (fa?.side) pushEntry(e.from, String(fa.side), e, 'from');
    if (ta?.side) pushEntry(e.to, String(ta.side), e, 'to');
  }

  let moved = 0;
  let groupCount = 0;

  for (const [key, entries] of groups.entries()) {
    const [nodeId, side] = key.split('|');
    const node = nodeById.get(nodeId);
    const target = Math.max(0, Number(spacingPx) || 0) / sideLength(node, side);
    if (!(target > 0)) continue;

    entries.push({ fixedBoundary: true, movable: false, t: 0, t0: 0 });
    entries.push({ fixedBoundary: true, movable: false, t: 1, t0: 1 });

    const hasMovable = entries.some((x) => x.movable);
    if (!hasMovable) continue;
    groupCount += 1;

    const projectOrdered = () => {
      entries.sort((a, b) => a.t - b.t);
      let left = 0;
      for (const x of entries) {
        if (!x.movable) {
          left = x.t;
          continue;
        }
        x.t = Math.max(clamp01(x.t), left + epsilon);
        left = x.t;
      }
      let right = 1;
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const x = entries[i];
        if (!x.movable) {
          right = x.t;
          continue;
        }
        x.t = Math.min(clamp01(x.t), right - epsilon);
        right = x.t;
      }
    };

    const objective = () => {
      let loss = 0;
      for (const x of entries) {
        if (!x.movable) continue;
        const d0 = x.t - x.t0;
        loss += alpha * d0 * d0;
      }
      for (let i = 0; i < entries.length - 1; i += 1) {
        const a = entries[i];
        const b = entries[i + 1];
        const miss = target - (b.t - a.t);
        if (miss > 0) loss += miss * miss;
      }
      return loss;
    };

    const solveTridiagonal = (diag, lower, upper, rhs) => {
      const n = diag.length;
      if (n === 0) return [];
      const c = upper.slice();
      const d = rhs.slice();
      const b = diag.slice();
      for (let i = 1; i < n; i += 1) {
        const m = (lower[i] || 0) / (b[i - 1] || 1e-9);
        b[i] -= m * (c[i - 1] || 0);
        d[i] -= m * d[i - 1];
      }
      const x = new Array(n).fill(0);
      x[n - 1] = d[n - 1] / (b[n - 1] || 1e-9);
      for (let i = n - 2; i >= 0; i -= 1) {
        x[i] = (d[i] - (c[i] || 0) * x[i + 1]) / (b[i] || 1e-9);
      }
      return x;
    };

    for (let iter = 0; iter < iterations; iter += 1) {
      entries.sort((a, b) => a.t - b.t);
      const movables = entries.filter((x) => x.movable);
      if (movables.length === 0) break;
      const idx = new Map(movables.map((x, i) => [x, i]));

      const n = movables.length;
      const grad = new Array(n).fill(0);
      const diag = new Array(n).fill(2 * alpha + 1e-3);
      const lower = new Array(n).fill(0);
      const upper = new Array(n).fill(0);

      for (let i = 0; i < n; i += 1) {
        grad[i] += 2 * alpha * (movables[i].t - movables[i].t0);
      }

      for (let i = 0; i < entries.length - 1; i += 1) {
        const a = entries[i];
        const b = entries[i + 1];
        const miss = target - (b.t - a.t);
        if (miss <= 0) continue;

        const ia = idx.get(a);
        const ib = idx.get(b);
        if (ia != null) grad[ia] += 2 * miss;
        if (ib != null) grad[ib] -= 2 * miss;

        if (ia != null) diag[ia] += 2;
        if (ib != null) diag[ib] += 2;
        if (ia != null && ib != null && ib === ia + 1) {
          upper[ia] += -2;
          lower[ib] += -2;
        }
      }

      const step = solveTridiagonal(diag, lower, upper, grad);
      const prev = movables.map((x) => x.t);
      const baseLoss = objective();
      let accepted = false;

      for (let ls = 0; ls < 6; ls += 1) {
        const rate = 1 / Math.pow(2, ls);
        for (let i = 0; i < n; i += 1) {
          movables[i].t = prev[i] - rate * (step[i] || 0);
        }
        projectOrdered();
        const nextLoss = objective();
        if (nextLoss <= baseLoss + 1e-9) {
          accepted = true;
          break;
        }
      }

      if (!accepted) {
        for (let i = 0; i < n; i += 1) movables[i].t = prev[i];
        projectOrdered();
      }
    }

    for (const x of entries) {
      if (!x.movable || x.fixedBoundary) continue;
      const prev = x.edge?.[`${x.end}Anchor`];
      if (!prev) continue;
      if (Math.abs((prev.t ?? 0) - x.t) > 1e-9) moved += 1;
      x.edge[`${x.end}Anchor`] = { ...prev, t: clamp01(x.t) };
    }
  }

  return {
    moved,
    groups: groupCount,
    heavyEdgeCount: heavyEdgeIds.size,
    pairCount: bundleMap.size,
    localEdgeCount: localEdges.length,
  };
}
