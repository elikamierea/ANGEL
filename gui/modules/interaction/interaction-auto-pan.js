export function createInteractionAutoPan(deps) {
  const {
    state,
    canvas,
    viewSettings,
    clamp01,
    getPointerWorldFromClient,
    render,
  } = deps;

  function getAutoPanVelocity(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const edge = viewSettings.auto_pan_edge_px;
    const maxSpeed = viewSettings.auto_pan_max_speed_px_per_sec;

    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    let vx = 0;
    let vy = 0;

    if (relX < edge) {
      const t = clamp01((edge - relX) / edge);
      vx += maxSpeed * t;
    } else if (relX > rect.width - edge) {
      const t = clamp01((relX - (rect.width - edge)) / edge);
      vx -= maxSpeed * t;
    }

    if (relY < edge) {
      const t = clamp01((edge - relY) / edge);
      vy += maxSpeed * t;
    } else if (relY > rect.height - edge) {
      const t = clamp01((relY - (rect.height - edge)) / edge);
      vy -= maxSpeed * t;
    }

    return { vx, vy };
  }

  function shouldAutoPanNow() {
    if (!state.dragging) return false;
    if (state.activeDragButton !== 0) return false;
    return state.dragMode === 'node'
      || state.dragMode === 'resize'
      || state.dragMode === 'edge-create'
      || state.dragMode === 'node-create'
      || state.dragMode === 'select-box';
  }

  function ensureAutoPanLoop() {
    if (state.autoPanRaf) return;
    const tick = (ts) => {
      if (!shouldAutoPanNow()) {
        state.autoPanRaf = null;
        state.autoPanLastTs = 0;
        return;
      }

      const dt = state.autoPanLastTs ? Math.min(0.05, (ts - state.autoPanLastTs) / 1000) : 0;
      state.autoPanLastTs = ts;

      const { vx, vy } = getAutoPanVelocity(state.pointerClientX, state.pointerClientY);
      if (dt > 0 && (vx !== 0 || vy !== 0)) {
        state.panX += vx * dt;
        state.panY += vy * dt;

        const p = getPointerWorldFromClient(state.pointerClientX, state.pointerClientY);
        if (state.dragMode === 'edge-create' && state.edgeCreateFromNodeId) {
          state.edgeCreateWorldX = p.world.x;
          state.edgeCreateWorldY = p.world.y;
        } else if (state.dragMode === 'node-create') {
          state.nodeCreateWorldX = p.world.x;
          state.nodeCreateWorldY = p.world.y;
        } else if (state.dragMode === 'mirror-create') {
          state.mirrorCreateWorldX = p.world.x;
          state.mirrorCreateWorldY = p.world.y;
        } else if (state.dragMode === 'select-box') {
          state.selectionRectWorldX = p.world.x;
          state.selectionRectWorldY = p.world.y;
        } else if (state.dragMode === 'node' && state.draggedNodeId) {
          const anchorStart = state.nodeDragSnapshot?.byId?.get(state.draggedNodeId);
          if (anchorStart) {
            const nextX = p.world.x - state.dragOffsetX;
            const nextY = p.world.y - state.dragOffsetY;
            state.nodeDragPreviewDx = nextX - anchorStart.x;
            state.nodeDragPreviewDy = nextY - anchorStart.y;
          }
        }

        render();
      }

      state.autoPanRaf = requestAnimationFrame(tick);
    };

    state.autoPanRaf = requestAnimationFrame(tick);
  }

  return {
    getAutoPanVelocity,
    shouldAutoPanNow,
    ensureAutoPanLoop,
  };
}
