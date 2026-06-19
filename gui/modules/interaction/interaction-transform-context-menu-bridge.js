import { createTransformContextMenuUI } from '../ui/transform-context-menu-ui.js';

export function createInteractionTransformContextMenuBridge(deps) {
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
    beginTransformSession,
    rotateOrFlipSelection,
    pushTransformPreviewCheckpoint,
    inferLayoutDirectionFromSelection,
    previewElkLayoutInSelection,
    cancelTransformSession,
    setStatus,
    render,
  } = deps;

  const transformContextMenuUI = createTransformContextMenuUI({
    canvas,
    canvasContextMenu,
    ctxTransformScaleBtn,
    ctxTransformRotate90Btn,
    ctxTransformFlipHBtn,
    ctxTransformLayoutBtn,
    getCanvasPointer,
    hitTest,
    state,
    onStretch: () => {
      if (!state.transformSession) {
        if (!beginTransformSession('Stretch', 'stretch_bbox')) return;
      } else {
        state.transformSession.label = 'Stretch';
        state.transformSession.mode = 'stretch_bbox';
        state.transformStretchDragging = false;
        state.transformStretchHandle = null;
        state.transformStretchBaseBox = null;
        state.transformStretchBaseById = null;
      }
      setStatus('Stretch mode: drag outer box handles (Shift+corner = uniform). Click outside box to exit mode. Enter apply, Esc cancel');
      render();
    },
    onRotate90: () => {
      if (!state.transformSession) {
        if (!beginTransformSession('Rotate 90')) return;
      }
      rotateOrFlipSelection('rotate_cw');
      pushTransformPreviewCheckpoint();
      setStatus('Rotate preview ready: Enter apply, Esc cancel');
    },
    onFlipHorizontal: () => {
      if (!state.transformSession) {
        if (!beginTransformSession('Flip Horizontal')) return;
      }
      rotateOrFlipSelection('flip_h');
      pushTransformPreviewCheckpoint();
      setStatus('Flip preview ready: Enter apply, Esc cancel');
    },
    onLayout: async () => {
      if (!state.transformSession) {
        if (!beginTransformSession('Layout')) return;
      } else {
        state.transformSession.label = 'Layout';
        state.transformSession.mode = 'generic';
      }

      try {
        const autoDirection = inferLayoutDirectionFromSelection();
        await previewElkLayoutInSelection(autoDirection);
        pushTransformPreviewCheckpoint();
        setStatus(`Layout preview (${autoDirection}) ready: Enter apply, Esc cancel`);
      } catch (err) {
        cancelTransformSession(`Layout cancelled: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  return {
    bind: () => transformContextMenuUI.bind(),
    hideCanvasContextMenu: (...args) => transformContextMenuUI.hideCanvasContextMenu(...args),
  };
}
