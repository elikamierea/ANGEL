export function createInteractionEventBindings(deps) {
  const {
    canvas,
    window,
    hideCanvasContextMenu,
    handlePointerDown,
    handlePointerUp,
    handlePointerMove,
    handleCanvasClick,
    handleCanvasWheel,
  } = deps;

  function bind() {
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
  }

  function onMouseDown(e) {
    hideCanvasContextMenu();
    handlePointerDown(e);
  }

  function onMouseUp(e) {
    handlePointerUp(e);
  }

  function onMouseMove(e) {
    handlePointerMove(e);
  }

  function onClick(e) {
    handleCanvasClick(e);
  }

  function onWheel(e) {
    handleCanvasWheel(e);
  }

  return { bind };
}
