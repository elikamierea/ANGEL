export function createInteractionHitTesting(deps) {
  const {
    state,
    nodes,
    edges,
    canvas,
    screenToWorld,
    getNodeLodLevel,
    isNodeVisibleInActiveLayer,
    isEdgeVisibleInActiveLayer,
    getAnchorWorld,
    getEdgePolylineWorld,
    distancePointToSegment,
  } = deps;

  function getPointerWorldFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return { sx, sy, world: screenToWorld(sx, sy) };
  }

  function getCanvasPointer(e) {
    return getPointerWorldFromClient(e.clientX, e.clientY);
  }

  function getResizeHandleAt(node, worldX, worldY) {
    const tol = 8 / state.zoom;
    const withinX = worldX >= node.x - tol && worldX <= node.x + node.w + tol;
    const withinY = worldY >= node.y - tol && worldY <= node.y + node.h + tol;
    if (!withinX || !withinY) return null;

    const nearLeft = Math.abs(worldX - node.x) <= tol;
    const nearRight = Math.abs(worldX - (node.x + node.w)) <= tol;
    const nearTop = Math.abs(worldY - node.y) <= tol;
    const nearBottom = Math.abs(worldY - (node.y + node.h)) <= tol;

    const v = nearTop ? 'n' : (nearBottom ? 's' : '');
    const h = nearLeft ? 'w' : (nearRight ? 'e' : '');
    const handle = `${v}${h}`;
    return handle || null;
  }

  function getResizeHit(worldX, worldY) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (!isNodeVisibleInActiveLayer(node)) continue;
      if (getNodeLodLevel(node) === 'hidden') continue;
      const handle = getResizeHandleAt(node, worldX, worldY);
      if (handle) return { node, handle };
    }
    return null;
  }

  function getCursorForHandle(handle) {
    if (handle === 'n' || handle === 's') return 'ns-resize';
    if (handle === 'e' || handle === 'w') return 'ew-resize';
    if (handle === 'nw' || handle === 'se') return 'nwse-resize';
    if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
    return 'grab';
  }

  function getEdgeEndpointHit(worldX, worldY) {
    const tol = 10 / state.zoom;
    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i];
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) continue;
      if (!isEdgeVisibleInActiveLayer(edge)) continue;
      if (getNodeLodLevel(fromNode) === 'hidden' || getNodeLodLevel(toNode) === 'hidden') continue;

      const from = getAnchorWorld(fromNode, edge.fromAnchor);
      const to = getAnchorWorld(toNode, edge.toAnchor);

      const dFrom = Math.hypot(worldX - from.x, worldY - from.y);
      if (dFrom <= tol) return { edge, end: 'from' };

      const dTo = Math.hypot(worldX - to.x, worldY - to.y);
      if (dTo <= tol) return { edge, end: 'to' };
    }
    return null;
  }

  function getEdgeBodyHit(worldX, worldY) {
    const tol = 8 / state.zoom;
    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i];
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) continue;
      if (!isEdgeVisibleInActiveLayer(edge)) continue;
      if (getNodeLodLevel(fromNode) === 'hidden' || getNodeLodLevel(toNode) === 'hidden') continue;

      const from = getAnchorWorld(fromNode, edge.fromAnchor);
      const to = getAnchorWorld(toNode, edge.toAnchor);
      const pts = getEdgePolylineWorld(edge, from, to, edge.fromAnchor, edge.toAnchor);
      for (let p = 0; p < pts.length - 1; p++) {
        const a = pts[p];
        const b = pts[p + 1];
        const d = distancePointToSegment(worldX, worldY, a.x, a.y, b.x, b.y);
        if (d <= tol) return edge;
      }
    }
    return null;
  }

  function pickTopNodeAtPoint(worldX, worldY) {
    const hits = nodes.filter((n) =>
      isNodeVisibleInActiveLayer(n)
      && getNodeLodLevel(n) !== 'hidden'
      && worldX >= n.x && worldX <= n.x + n.w
      && worldY >= n.y && worldY <= n.y + n.h,
    );
    if (hits.length === 0) return null;
    hits.sort((a, b) => {
      const da = Number(a.depth) || 0;
      const db = Number(b.depth) || 0;
      if (da !== db) return db - da;
      return nodes.indexOf(b) - nodes.indexOf(a);
    });
    return hits[0];
  }

  function hitTest(worldX, worldY) {
    return pickTopNodeAtPoint(worldX, worldY);
  }

  return {
    getPointerWorldFromClient,
    getCanvasPointer,
    getResizeHandleAt,
    getResizeHit,
    getCursorForHandle,
    getEdgeEndpointHit,
    getEdgeBodyHit,
    pickTopNodeAtPoint,
    hitTest,
  };
}
