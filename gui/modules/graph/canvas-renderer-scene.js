export function createCanvasRendererScene(deps) {
  const {
    state,
    canvas,
    nodes,
    edges,
    refreshHierarchyMeta,
    isNodeVisibleInActiveLayer,
    isEdgeVisibleInActiveLayer,
    getNodeLodLevel,
    drawAdaptiveGrid,
    drawNode,
    drawEdge,
    getNodeById,
  } = deps;

  // Visible world rectangle for the current pan/zoom, padded by a screen-space
  // margin so nodes straddling the edge (and slightly-overhanging edge curves)
  // are not popped. Same projection as drawAdaptiveGrid.
  function getViewportWorldRect() {
    const zoom = Math.max(0.0001, Number(state.zoom) || 1);
    const cw = Math.max(1, canvas?.clientWidth || canvas?.width || 1);
    const ch = Math.max(1, canvas?.clientHeight || canvas?.height || 1);
    const margin = 64 / zoom;
    return {
      minX: (-state.panX) / zoom - margin,
      minY: (-state.panY) / zoom - margin,
      maxX: (cw - state.panX) / zoom + margin,
      maxY: (ch - state.panY) / zoom + margin,
    };
  }

  function renderGraphSceneItems() {
    drawAdaptiveGrid();

    // Viewport culling: only sort and draw items overlapping the screen, so
    // render cost scales with on-screen node count, not total graph size. A node
    // that fully contains the viewport still overlaps it, so containers stay
    // drawn; a node whose whole subtree is off-screen is safely skipped (children
    // lie inside their parent's rect).
    const view = getViewportWorldRect();
    const rectInView = (x, y, w, h) => !(x > view.maxX || x + w < view.minX || y > view.maxY || y + h < view.minY);

    const depthMap = refreshHierarchyMeta();
    const orderedNodes = nodes
      .filter((n) => isNodeVisibleInActiveLayer(n) && rectInView(n.x, n.y, n.w, n.h))
      .sort((a, b) => (depthMap.get(a.id) || 0) - (depthMap.get(b.id) || 0));

    const edgeWithDepth = edges
      .filter((edge) => isEdgeVisibleInActiveLayer(edge))
      .filter((edge) => {
        // Cull by the bounding box of the two endpoints: it fully contains a
        // straight segment, so if the box misses the viewport the edge cannot
        // cross it.
        const a = getNodeById(edge.from);
        const b = getNodeById(edge.to);
        if (!a || !b) return false;
        const minX = Math.min(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxX = Math.max(a.x + a.w, b.x + b.w);
        const maxY = Math.max(a.y + a.h, b.y + b.h);
        return rectInView(minX, minY, maxX - minX, maxY - minY);
      })
      .map((edge) => {
        const dFrom = depthMap.get(edge.from) || 0;
        const dTo = depthMap.get(edge.to) || 0;
        return { edge, depth: Math.max(dFrom, dTo) };
      });

    const renderItems = [
      ...orderedNodes.map((node) => ({ kind: 'node', depth: depthMap.get(node.id) || 0, node })),
      ...edgeWithDepth.map((item) => ({ kind: 'edge', depth: item.depth, edge: item.edge })),
    ].sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      if (a.kind === b.kind) return 0;
      return a.kind === 'node' ? -1 : 1;
    });

    for (const item of renderItems) {
      if (item.kind === 'node') {
        drawNode(item.node);
        continue;
      }
      const edge = item.edge;
      const a = getNodeById(edge.from);
      const b = getNodeById(edge.to);
      if (!a || !b) continue;
      if (getNodeLodLevel(a) === 'hidden' || getNodeLodLevel(b) === 'hidden') continue;
      drawEdge(a, b, edge);
    }
  }

  return { renderGraphSceneItems };
}
