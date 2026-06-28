export function createCanvasRendererScene(deps) {
  const {
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

  function renderGraphSceneItems() {
    drawAdaptiveGrid();

    const depthMap = refreshHierarchyMeta();
    const orderedNodes = nodes
      .filter((n) => isNodeVisibleInActiveLayer(n))
      .sort((a, b) => (depthMap.get(a.id) || 0) - (depthMap.get(b.id) || 0));

    const edgeWithDepth = edges
      .filter((edge) => isEdgeVisibleInActiveLayer(edge))
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
