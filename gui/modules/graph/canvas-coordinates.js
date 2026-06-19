export function createCanvasCoordinates(state) {
  function worldToScreen(x, y) {
    return { x: x * state.zoom + state.panX, y: y * state.zoom + state.panY };
  }

  function screenToWorld(x, y) {
    return { x: (x - state.panX) / state.zoom, y: (y - state.panY) / state.zoom };
  }

  return {
    worldToScreen,
    screenToWorld,
  };
}
