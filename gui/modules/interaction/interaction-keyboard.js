export function createInteractionKeyboard(deps) {
  const {
    state,
    nodes,
    document,
    isTypingTarget,
    hasActiveTextSelection,
    finalizeTransformSession,
    cancelTransformSession,
    undoWithinTransformSessionOrExit,
    redoWithinTransformSession,
    undo,
    redo,
    runSave,
    runNewProject,
    setActiveLayerByIndex,
    copySelectionToClipboard,
    cutSelectionToClipboard,
    beginPastePreview,
    finalizePasteFromPreview,
    deleteSelectedElement,
    rebuildSidebar,
    renderRightPanel,
    render,
    setStatus,
  } = deps;

  function handleKeyDown(e) {
    if (state.transformSession && e.key === 'Enter') {
      e.preventDefault();
      finalizeTransformSession();
      return;
    }
    if (state.transformSession && e.key === 'Escape') {
      e.preventDefault();
      cancelTransformSession('Transform cancelled');
      return;
    }

    const cmdOrCtrl = e.ctrlKey || e.metaKey;
    if (isTypingTarget(e.target)) return;
    if (cmdOrCtrl && hasActiveTextSelection()) return;

    if (state.transformSession && cmdOrCtrl && e.code === 'KeyZ' && !e.shiftKey) {
      e.preventDefault();
      if (e.repeat) return;
      undoWithinTransformSessionOrExit();
      return;
    }

    if (state.transformSession && cmdOrCtrl && e.code === 'KeyZ' && e.shiftKey) {
      e.preventDefault();
      if (e.repeat) return;
      if (!redoWithinTransformSession()) setStatus('No local redo in transform preview');
      return;
    }

    if (state.transformSession && cmdOrCtrl && e.code === 'KeyY') {
      e.preventDefault();
      if (e.repeat) return;
      if (!redoWithinTransformSession()) setStatus('No local redo in transform preview');
      return;
    }

    if (cmdOrCtrl && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.repeat) return;
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (cmdOrCtrl && e.code === 'KeyY') {
      e.preventDefault();
      if (e.repeat) return;
      redo();
      return;
    }
    if (cmdOrCtrl && e.code === 'KeyS') {
      e.preventDefault();
      if (e.repeat) return;
      runSave();
      return;
    }
    if (cmdOrCtrl && e.code === 'KeyN') {
      e.preventDefault();
      if (e.repeat) return;
      runNewProject().catch((error) => {
        console.error('New Project failed from shortcut', error);
        setStatus(`New Project failed: ${error?.message || 'unknown error'}`);
      });
      return;
    }
    if (cmdOrCtrl && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
      e.preventDefault();
      if (e.repeat) return;
      const idx = Number(e.code.slice(-1)) - 1;
      setActiveLayerByIndex(idx);
      return;
    }
    if (cmdOrCtrl && e.code === 'KeyA') {
      e.preventDefault();
      if (e.repeat) return;
      state.selectedNodeIds = new Set(nodes.map((n) => n.id));
      state.selectedNodeId = nodes[0]?.id || null;
      state.selectedEdgeId = null;
      rebuildSidebar();
      renderRightPanel();
      render();
      setStatus(`Selected all nodes (${state.selectedNodeIds.size})`);
      return;
    }

    if (cmdOrCtrl && e.code === 'KeyC') {
      e.preventDefault();
      if (e.repeat) return;
      copySelectionToClipboard('copy');
      return;
    }

    if (cmdOrCtrl && e.code === 'KeyX') {
      e.preventDefault();
      if (e.repeat) return;
      cutSelectionToClipboard();
      return;
    }

    if (cmdOrCtrl && e.code === 'KeyV') {
      e.preventDefault();
      if (e.repeat) return;
      beginPastePreview();
      return;
    }

    if (e.code === 'KeyN') state.nPressed = true;
    if (e.code === 'KeyC') state.cPressed = true;
    if (e.code === 'KeyM') state.mPressed = true;

    if (e.code === 'Delete' || e.code === 'KeyD') {
      e.preventDefault();
      if (e.repeat) return;
      const hadTransformPreview = Boolean(state.transformSession);
      deleteSelectedElement();
      if (hadTransformPreview && state.transformSession) {
        finalizeTransformSession();
      }
    }
  }

  function handleKeyUp(e) {
    if (e.code === 'KeyN') state.nPressed = false;
    if (e.code === 'KeyC') state.cPressed = false;
    if (e.code === 'KeyM') state.mPressed = false;
    if (e.code === 'KeyV' && state.pastePreviewActive) {
      finalizePasteFromPreview();
    }
  }

  function handleBlur() {
    state.nPressed = false;
    state.cPressed = false;
    state.mPressed = false;
    state.pastePreviewActive = false;
    state.pastePreviewNodes = [];
    state.activeDragButton = null;
    state.autoPanLastTs = 0;
    if (state.autoPanRaf) {
      cancelAnimationFrame(state.autoPanRaf);
      state.autoPanRaf = null;
    }
    document.body.classList.remove('dragging-select-none');
  }

  return { handleKeyDown, handleKeyUp, handleBlur };
}
