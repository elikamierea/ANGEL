export function createAppShellUI(deps) {
  const {
    window,
    document,
    state,
    nodes,
    conflicts,
    spriteBuildState,
    spritePreviewCanvas,
    spriteFrameLabel,
    spritePivotXInput,
    spritePivotYInput,
    chipRevision,
    chipUnsaved,
    chipConflicts,
    chipAgent,
    menuSave,
    menuCompile,
    menuRun,
    menuRunTest,
    menuExportRelease,
    conflictList,
    leftSidebar,
    sidebarControls,
    fileBrowserTabs,
    getUnsavedCount,
    getConflictCount,
    isNodeVisibleInActiveLayer,
    getNodeLodLevel,
    cssVar,
    MIN_NODE_W,
    MIN_NODE_H,
    t = (key) => key,
  } = deps;

  function updateTopbar() {
    if (chipRevision) chipRevision.textContent = t('topbar.status.rev', { value: state.revision });
    if (chipUnsaved) chipUnsaved.textContent = t('topbar.status.unsaved', { value: getUnsavedCount() });
    if (chipConflicts) chipConflicts.textContent = t('topbar.status.conflicts', { value: getConflictCount() });
    if (chipAgent) chipAgent.textContent = t('topbar.status.agent', {
      value: state.agentBusy ? t('topbar.status.agentBusy') : t('topbar.status.agentIdle'),
    });

    const baseTitle = 'ANGEL Game Engine';
    const projectName = String(state.projectName || '').trim();
    const dirtyMark = getUnsavedCount() > 0 ? '*' : '';
    document.title = projectName ? `${projectName}${dirtyMark} - ${baseTitle}` : baseTitle;

    menuSave.disabled = getUnsavedCount() === 0;
    menuCompile.disabled = state.buildRunning;
    menuRun.disabled = state.buildRunning;
    menuRunTest.disabled = state.buildRunning;
    if (menuExportRelease) menuExportRelease.disabled = state.buildRunning;
  }

  function normalizeToolRelativePath(inputPath) {
    const raw = String(inputPath || '').replace(/\\/g, '/').trim();
    if (!raw) throw new Error('path is required');
    if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) throw new Error('path must be relative to project root');

    const parts = raw.split('/').filter(Boolean);
    if (parts.length === 0) throw new Error('path is required');
    if (parts.some((p) => p === '.' || p === '..')) throw new Error('path must stay inside project root');
    return parts.join('/');
  }

  function splitLinesKeepSimple(text) {
    return String(text || '').split(/\r?\n/);
  }

  function updateSpriteFrameLabel() {
    if (!spriteFrameLabel) return;
    const total = spriteBuildState.frames.length;
    const idx = total > 0 ? spriteBuildState.frameIndex + 1 : 0;
    spriteFrameLabel.textContent = t('modal.sprite.frameLabel', { current: idx, total });
  }

  function renderSpritePreview() {
    if (!spritePreviewCanvas) return;
    const ctx2d = spritePreviewCanvas.getContext('2d');
    if (!ctx2d) return;

    const ratio = window.devicePixelRatio || 1;
    const displayW = Math.max(1, Math.floor(spritePreviewCanvas.clientWidth || spritePreviewCanvas.width));
    const displayH = Math.max(1, Math.floor(spritePreviewCanvas.clientHeight || spritePreviewCanvas.height));
    const targetW = Math.floor(displayW * ratio);
    const targetH = Math.floor(displayH * ratio);
    if (spritePreviewCanvas.width !== targetW || spritePreviewCanvas.height !== targetH) {
      spritePreviewCanvas.width = targetW;
      spritePreviewCanvas.height = targetH;
    }
    ctx2d.setTransform(ratio, 0, 0, ratio, 0, 0);

    const cw = displayW;
    const ch = displayH;
    ctx2d.clearRect(0, 0, cw, ch);
    ctx2d.fillStyle = cssVar('--sprite-preview-bg', '#0f151f');
    ctx2d.fillRect(0, 0, cw, ch);

    const frame = spriteBuildState.frames[spriteBuildState.frameIndex] || null;
    if (!frame) {
      spriteBuildState.previewRect = null;
      ctx2d.fillStyle = cssVar('--sprite-preview-text', '#9fb0c2');
      ctx2d.font = `14px ${cssVar('--app-font-family', 'Arial, sans-serif')}`;
      ctx2d.fillText(t('modal.sprite.status.noFrameSelected'), 12, 24);
      updateSpriteFrameLabel();
      return;
    }

    const scale = Math.min((cw - 20) / frame.width, (ch - 20) / frame.height, 1);
    const dw = frame.width * scale;
    const dh = frame.height * scale;
    const ox = (cw - dw) * 0.5;
    const oy = (ch - dh) * 0.5;
    spriteBuildState.previewRect = { ox, oy, dw, dh, scale, frameWidth: frame.width, frameHeight: frame.height };

    ctx2d.drawImage(frame.image, ox, oy, dw, dh);
    ctx2d.strokeStyle = cssVar('--sprite-preview-border', '#3a4c66');
    ctx2d.strokeRect(ox, oy, dw, dh);

    const pivotX = Number(spritePivotXInput?.value || 0);
    const pivotY = Number(spritePivotYInput?.value || 0);
    const px = ox + pivotX * scale;
    const py = oy + pivotY * scale;

    ctx2d.strokeStyle = cssVar('--sprite-preview-error', '#ff5a5a');
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(px - 8, py);
    ctx2d.lineTo(px + 8, py);
    ctx2d.moveTo(px, py - 8);
    ctx2d.lineTo(px, py + 8);
    ctx2d.stroke();

    updateSpriteFrameLabel();
  }

  function getNodesAtPoint(worldX, worldY) {
    return nodes.filter((n) => (
      isNodeVisibleInActiveLayer(n)
      && getNodeLodLevel(n) !== 'hidden'
      && worldX >= n.x
      && worldX <= n.x + n.w
      && worldY >= n.y
      && worldY <= n.y + n.h
    ));
  }

  function applyResize(node, handle, worldX, worldY) {
    const minWByScreen = 64 / state.dragStartZoom;
    const minHByScreen = 64 / state.dragStartZoom;
    const minW = Math.max(1, Math.min(minWByScreen, state.dragStartW || MIN_NODE_W));
    const minH = Math.max(1, Math.min(minHByScreen, state.dragStartH || MIN_NODE_H));

    let left = node.x;
    let top = node.y;
    let right = node.x + node.w;
    let bottom = node.y + node.h;

    if (handle.includes('w')) left = Math.min(worldX, right - minW);
    if (handle.includes('e')) right = Math.max(worldX, left + minW);
    if (handle.includes('n')) top = Math.min(worldY, bottom - minH);
    if (handle.includes('s')) bottom = Math.max(worldY, top + minH);

    node.x = left;
    node.y = top;
    node.w = right - left;
    node.h = bottom - top;
  }

  function renderConflicts() {
    conflictList.innerHTML = '';
    if (conflicts.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No conflicts.';
      conflictList.appendChild(li);
      return;
    }

    for (const c of conflicts) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${c.id}</strong><br/>${c.message}<br/><em>${c.remediation}</em>`;
      conflictList.appendChild(li);
    }
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  function hasActiveTextSelection() {
    const selection = window.getSelection?.();
    return Boolean(selection && String(selection).length > 0);
  }

  function applyAppGridColumns() {
    const appGrid = document.querySelector('.app');
    if (!appGrid) return;
    const leftWidth = state.sidebarCollapsed ? 0 : state.leftPanelWidth;
    const rightWidth = state.rightPanelCollapsed ? 0 : state.rightPanelWidth;
    appGrid.style.gridTemplateColumns = `${leftWidth}px 1fr ${rightWidth}px`;
  }

  function syncSidebarCollapsedState() {
    leftSidebar?.classList.toggle('collapsed', Boolean(state.sidebarCollapsed));
    sidebarControls?.classList.toggle('hidden', Boolean(state.sidebarCollapsed));
    fileBrowserTabs?.classList.toggle('hidden', Boolean(state.sidebarCollapsed));
    applyAppGridColumns();
  }

  return {
    updateTopbar,
    normalizeToolRelativePath,
    splitLinesKeepSimple,
    updateSpriteFrameLabel,
    renderSpritePreview,
    getNodesAtPoint,
    applyResize,
    renderConflicts,
    isTypingTarget,
    hasActiveTextSelection,
    applyAppGridColumns,
    syncSidebarCollapsedState,
  };
}
