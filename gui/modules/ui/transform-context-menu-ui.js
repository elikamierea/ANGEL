export function createTransformContextMenuUI(deps) {
  const {
    canvas,
    canvasContextMenu,
    ctxTransformScaleBtn,
    ctxTransformRotate90Btn,
    ctxTransformFlipHBtn,
    ctxTransformLayoutBtn,
    getCanvasPointer,
    hitTest,
    state,
    onStretch,
    onRotate90,
    onFlipHorizontal,
    onLayout,
  } = deps;

  function hideCanvasContextMenu() {
    if (!canvasContextMenu) return;
    canvasContextMenu.classList.add('hidden');
    canvasContextMenu.setAttribute('aria-hidden', 'true');
  }

  function showCanvasContextMenu(clientX, clientY) {
    if (!canvasContextMenu) return;
    canvasContextMenu.style.left = `${clientX}px`;
    canvasContextMenu.style.top = `${clientY}px`;
    canvasContextMenu.classList.remove('hidden');
    canvasContextMenu.setAttribute('aria-hidden', 'false');
  }

  function bind() {
    if (canvas) {
      canvas.addEventListener('contextmenu', (e) => {
        if (state.dragMoved) { e.preventDefault(); return; }
        const p = getCanvasPointer(e);
        const hit = hitTest(p.world.x, p.world.y);
        if (!hit || !state.selectedNodeIds.has(hit.id) || state.selectedNodeIds.size < 2) {
          hideCanvasContextMenu();
          return;
        }
        e.preventDefault();
        showCanvasContextMenu(e.clientX, e.clientY);
      });
    }

    if (ctxTransformScaleBtn) {
      ctxTransformScaleBtn.addEventListener('click', () => {
        hideCanvasContextMenu();
        onStretch?.();
      });
    }

    if (ctxTransformRotate90Btn) {
      ctxTransformRotate90Btn.addEventListener('click', () => {
        hideCanvasContextMenu();
        onRotate90?.();
      });
    }

    if (ctxTransformFlipHBtn) {
      ctxTransformFlipHBtn.addEventListener('click', () => {
        hideCanvasContextMenu();
        onFlipHorizontal?.();
      });
    }

    if (ctxTransformLayoutBtn) {
      ctxTransformLayoutBtn.addEventListener('click', () => {
        hideCanvasContextMenu();
        onLayout?.();
      });
    }

    document.addEventListener('pointerdown', (evt) => {
      if (!canvasContextMenu || canvasContextMenu.classList.contains('hidden')) return;
      if (canvasContextMenu.contains(evt.target)) return;
      hideCanvasContextMenu();
    });
  }

  return {
    bind,
    hideCanvasContextMenu,
    showCanvasContextMenu,
  };
}
