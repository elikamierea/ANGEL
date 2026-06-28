export function createCanvasRendererCore(deps) {
  const {
    state,
    canvas,
    ctx,
    syncMirrorNodes,
    normalizeSelectedNodeIds,
    renderGraphSceneItems,
    renderCanvasOverlays,
    rebuildNodeIndex,
  } = deps;

  function render() {
    syncMirrorNodes();
    normalizeSelectedNodeIds();
    // Refresh the id -> node index once per frame so scene rendering and
    // edge-visibility checks can do O(1) lookups instead of O(N) scans.
    rebuildNodeIndex();
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    renderGraphSceneItems();
    renderCanvasOverlays();
  }

  function resizeCanvasToDisplay() {
    const ratio = window.devicePixelRatio || 1;
    const displayWidth = Math.max(1, Math.floor(canvas.clientWidth));
    const displayHeight = Math.max(1, Math.floor(canvas.clientHeight));
    const nextWidth = Math.floor(displayWidth * ratio);
    const nextHeight = Math.floor(displayHeight * ratio);

    if (canvas.width === nextWidth && canvas.height === nextHeight) return;

    canvas.width = nextWidth;
    canvas.height = nextHeight;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    render();
  }

  return {
    render,
    resizeCanvasToDisplay,
  };
}
