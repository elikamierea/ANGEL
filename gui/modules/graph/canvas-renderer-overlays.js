export function createCanvasRendererOverlays(deps) {
  const {
    state,
    nodes,
    ctx,
    RESIZE_HANDLE_SIZE_PX,
    cssVar,
    worldToScreen,
    getNodeLodLevel,
    getNodeStrokeColor,
    getSelectionBBoxFromSession,
    getRectResizeHandles,
    getSelectionRectWorld,
  } = deps;

  function renderCanvasOverlays() {
    if (state.dragMode === 'edge-create' && state.edgeCreateFromNodeId) {
      const src = nodes.find((n) => n.id === state.edgeCreateFromNodeId);
      if (src) {
        // Preview is just the raw press point -> current cursor line; the actual
        // border anchoring is resolved on drop in buildEdgeAnchors.
        const s = worldToScreen(state.edgeCreateStartWorldX, state.edgeCreateStartWorldY);
        const t = worldToScreen(state.edgeCreateWorldX, state.edgeCreateWorldY);
        // Preview line takes the source node's border color so the in-progress
        // edge reads as originating from that node.
        ctx.strokeStyle = getNodeStrokeColor(src);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (state.dragMode === 'node' && state.nodeDragSnapshot?.byId) {
      ctx.strokeStyle = cssVar('--graph-drag-preview-stroke', 'rgba(141, 200, 255, 0.95)');
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      for (const [id, info] of state.nodeDragSnapshot.byId.entries()) {
        const node = nodes.find((n) => n.id === id);
        if (!node || getNodeLodLevel(node) === 'hidden') continue;
        const p = worldToScreen(info.x + state.nodeDragPreviewDx, info.y + state.nodeDragPreviewDy);
        const w = node.w * state.zoom;
        const h = node.h * state.zoom;
        ctx.strokeRect(p.x, p.y, w, h);
      }
      ctx.setLineDash([]);
    }

    if (state.dragMode === 'node-create') {
      const x1 = Math.min(state.nodeCreateStartWorldX, state.nodeCreateWorldX);
      const y1 = Math.min(state.nodeCreateStartWorldY, state.nodeCreateWorldY);
      const x2 = Math.max(state.nodeCreateStartWorldX, state.nodeCreateWorldX);
      const y2 = Math.max(state.nodeCreateStartWorldY, state.nodeCreateWorldY);
      const p = worldToScreen(x1, y1);
      const w = (x2 - x1) * state.zoom;
      const h = (y2 - y1) * state.zoom;
      ctx.fillStyle = cssVar('--graph-select-fill', 'rgba(96, 166, 255, 0.12)');
      ctx.strokeStyle = cssVar('--graph-drag-preview-stroke', 'rgba(141, 200, 255, 0.95)');
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.fillRect(p.x, p.y, w, h);
      ctx.strokeRect(p.x, p.y, w, h);
      ctx.setLineDash([]);
    }

    if (state.dragMode === 'mirror-create' && state.mirrorCreateSourceNodeId) {
      const src = nodes.find((n) => n.id === state.mirrorCreateSourceNodeId);
      if (src) {
        const x = state.mirrorCreateWorldX - src.w / 2;
        const y = state.mirrorCreateWorldY - src.h / 2;
        const p = worldToScreen(x, y);
        const w = src.w * state.zoom;
        const h = src.h * state.zoom;
        ctx.strokeStyle = cssVar('--graph-mirror-preview-stroke', 'rgba(255, 215, 120, 0.95)');
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(p.x, p.y, w, h);
        ctx.setLineDash([]);
      }
    }

    if (state.transformSession?.mode === 'stretch_bbox') {
      const rect = getSelectionBBoxFromSession();
      if (rect) {
        const p = worldToScreen(rect.x, rect.y);
        const w = rect.w * state.zoom;
        const h = rect.h * state.zoom;
        ctx.strokeStyle = cssVar('--graph-drag-preview-stroke', 'rgba(141, 200, 255, 0.95)');
        ctx.fillStyle = cssVar('--graph-select-fill', 'rgba(96, 166, 255, 0.16)');
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.fillRect(p.x, p.y, w, h);
        ctx.strokeRect(p.x, p.y, w, h);
        ctx.setLineDash([]);

        const half = RESIZE_HANDLE_SIZE_PX / 2;
        for (const hnd of getRectResizeHandles(rect)) {
          const hp = worldToScreen(hnd.x, hnd.y);
          ctx.fillStyle = '#d8ecff';
          ctx.strokeStyle = '#2e6fa7';
          ctx.fillRect(hp.x - half, hp.y - half, RESIZE_HANDLE_SIZE_PX, RESIZE_HANDLE_SIZE_PX);
          ctx.strokeRect(hp.x - half, hp.y - half, RESIZE_HANDLE_SIZE_PX, RESIZE_HANDLE_SIZE_PX);
        }
      }
    }

    if (state.dragMode === 'select-box') {
      const rect = getSelectionRectWorld();
      const p = worldToScreen(rect.x, rect.y);
      const w = rect.w * state.zoom;
      const h = rect.h * state.zoom;
      ctx.fillStyle = cssVar('--graph-select-fill-alt', 'rgba(96, 166, 255, 0.16)');
      ctx.strokeStyle = cssVar('--graph-drag-preview-stroke', 'rgba(141, 200, 255, 0.95)');
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.fillRect(p.x, p.y, w, h);
      ctx.strokeRect(p.x, p.y, w, h);
      ctx.setLineDash([]);
    }

    if (state.pastePreviewActive && Array.isArray(state.pastePreviewNodes) && state.pastePreviewNodes.length > 0) {
      ctx.strokeStyle = cssVar('--graph-drag-preview-stroke', 'rgba(141, 200, 255, 0.95)');
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      for (const n of state.pastePreviewNodes) {
        const p = worldToScreen(n.x, n.y);
        const w = n.w * state.zoom;
        const h = n.h * state.zoom;
        ctx.strokeRect(p.x, p.y, w, h);
      }
      ctx.setLineDash([]);
    }
  }

  return { renderCanvasOverlays };
}
