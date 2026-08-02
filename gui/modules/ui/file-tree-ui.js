// Left sidebar file-tree UI + refresh pipeline.
//
// Owns rendering and project-tree refresh for both Electron root-path mode and
// File System Access handle mode.
export function createFileTreeUI(deps) {
  const {
    state,
    collapsedFileTreePaths,
    fileBrowser,
    fileBrowserEmpty,
    fileBrowserInfo,
    fileBrowserTabs,
    electronAPI,
    rebuildSidebarHook,
    setStatus,
    t,
    findReferencesByPaths,
    applyReferencePathUpdates,
  } = deps;

  let activeContextMenu = null;
  // All directory paths seen in the previous tree, so a refresh can tell genuinely
  // new folders (collapse them) apart from ones the user deliberately expanded.
  const knownDirPaths = new Set();

  // Multi-select state
  const selectedPaths = new Set();
  let lastClickedPath = null;
  let renderedRows = [];

  // Drag-select state (rubber-band from empty space)
  let dragStartY = null;
  let dragStartSelection = null;
  let isDragging = false;

  // Clipboard state for copy/cut/paste
  let clipboard = null; // { paths: string[], mode: 'copy' | 'cut' }

  // Drag-move state (dragging selected rows onto a folder)
  let dragMoveStart = null; // { x, y } where drag began
  let isDragMoving = false;
  let dragMoveTargetPath = null;
  let dragGhostEl = null;

  // Set after a rubber-band drag completes, to prevent the trailing click event
  // (which fires if mousedown+mouseup land on the same row) from re-processing selection.
  let suppressNextRowClick = false;

  const TAB_CONFIG = {
    all: { labelKey: 'sidebar.tab.all' },
    sprites: { labelKey: 'sidebar.tab.sprites', roots: ['src/assets/sprites', 'src/assets/sprite'], grouped: true, groupKind: 'sprite' },
    fonts: { labelKey: 'sidebar.tab.fonts', roots: ['src/assets/fonts', 'src/assets/font'], grouped: true, groupKind: 'font' },
    audio: { labelKey: 'sidebar.tab.audio', roots: ['src/assets/audio'], grouped: false },
    other: { labelKey: 'sidebar.tab.other', roots: ['src/assets/other'], grouped: false },
  };

  const TAB_KEY_ALIASES = {
    sprite: 'sprites',
    font: 'fonts',
  };
  const TAB_ORDER = ['all', 'sprites', 'fonts', 'audio', 'other'];

  function normalizeTabKey(rawTab) {
    const tab = TAB_KEY_ALIASES[rawTab] || rawTab;
    if (TAB_CONFIG[tab]) return tab;
    return 'all';
  }

  function setCurrentTab(tabKey) {
    const normalized = normalizeTabKey(tabKey);
    if (state.fileBrowserTab === normalized) return false;
    state.fileBrowserTab = normalized;
    selectedPaths.clear();
    lastClickedPath = null;
    return true;
  }

  function shiftTab(step) {
    const current = normalizeTabKey(state.fileBrowserTab);
    const currentIdx = Math.max(0, TAB_ORDER.indexOf(current));
    const nextIdx = (currentIdx + step + TAB_ORDER.length) % TAB_ORDER.length;
    return setCurrentTab(TAB_ORDER[nextIdx]);
  }

  function clearSelection() {
    for (const { el } of renderedRows) el.classList.remove('selected');
    selectedPaths.clear();
  }

  function selectRange(fromPath, toPath) {
    const fromIdx = renderedRows.findIndex((r) => r.path === fromPath);
    const toIdx = renderedRows.findIndex((r) => r.path === toPath);
    if (fromIdx === -1 || toIdx === -1) return;
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    clearSelection();
    for (let i = lo; i <= hi; i++) {
      selectedPaths.add(renderedRows[i].path);
      renderedRows[i].el.classList.add('selected');
    }
    lastClickedPath = toPath;
  }

  function seedCollapsedFileTree(entries) {
    for (const entry of entries) {
      if (entry.type !== 'directory') continue;
      collapsedFileTreePaths.add(entry.path);
      knownDirPaths.add(entry.path);
      if (entry.children && entry.children.length > 0) {
        seedCollapsedFileTree(entry.children);
      }
    }
  }

  // ── Clipboard helpers ────────────────────────────────────────────────────────

  function applyCutStyle(paths, active) {
    for (const { path, el } of renderedRows) {
      if (paths.includes(path)) {
        if (active) el.classList.add('cut-pending');
        else el.classList.remove('cut-pending');
      }
    }
  }

  function clearClipboard() {
    if (clipboard?.mode === 'cut') applyCutStyle(clipboard.paths, false);
    clipboard = null;
  }

  function handleCopy() {
    if (!selectedPaths.size) return;
    if (clipboard?.mode === 'cut') applyCutStyle(clipboard.paths, false);
    clipboard = { paths: [...selectedPaths], mode: 'copy' };
    setStatus(`Copied ${clipboard.paths.length} item${clipboard.paths.length !== 1 ? 's' : ''} — Ctrl+V to paste`);
  }

  function handleCut() {
    if (!selectedPaths.size) return;
    if (clipboard?.mode === 'cut') applyCutStyle(clipboard.paths, false);
    clipboard = { paths: [...selectedPaths], mode: 'cut' };
    applyCutStyle(clipboard.paths, true);
    setStatus(`Cut ${clipboard.paths.length} item${clipboard.paths.length !== 1 ? 's' : ''} — Ctrl+V to paste`);
  }

  function getPasteTargetFolder() {
    if (selectedPaths.size === 1) {
      const only = [...selectedPaths][0];
      const li = renderedRows.find((r) => r.path === only)?.el?.closest('.file-tree-item');
      if (li?.classList.contains('directory')) return only.replace(/\\/g, '/');
    }
    if (lastClickedPath) {
      const p = lastClickedPath.replace(/\\/g, '/');
      const li = renderedRows.find((r) => r.path === lastClickedPath)?.el?.closest('.file-tree-item');
      if (li?.classList.contains('directory')) return p;
      const slash = p.lastIndexOf('/');
      if (slash > 0) return p.slice(0, slash);
    }
    return getTabDefaultRoot();
  }

  async function handlePaste(targetFolder) {
    if (!clipboard?.paths?.length || !state.projectRootPath) return;
    const { paths, mode } = clipboard;
    const api = mode === 'cut' ? electronAPI?.moveProjectPaths : electronAPI?.copyProjectPaths;
    if (!api) { setStatus('Paste requires desktop app mode.'); return; }
    const normTarget = (targetFolder || '').replace(/\\/g, '/').replace(/\/$/, '');
    if (mode === 'cut') {
      for (const p of paths) {
        const normP = p.replace(/\\/g, '/');
        if (normTarget === normP || normTarget.startsWith(normP + '/')) {
          setStatus('Cannot move a folder into itself.'); return;
        }
      }
      const hits = findReferencesByPaths ? findReferencesByPaths(paths) : [];
      if (hits.length > 0) {
        const result = await showRefModal(hits, {
          title: t('sidebar.refModal.title'),
          message: t('sidebar.refModal.moveMessage'),
          primaryLabel: t('sidebar.refModal.updateAndMove'),
          secondaryLabel: t('sidebar.refModal.moveOnly'),
        });
        if (result === 'cancel') return;
        const pathMap = (result === 'primary' && applyReferencePathUpdates)
          ? new Map(paths.map((p) => {
            const normP = p.replace(/\\/g, '/');
            const base = normP.split('/').pop() || normP;
            return [normP, normTarget ? `${normTarget}/${base}` : base];
          }))
          : null;
        try {
          await api({ rootPath: state.projectRootPath, paths, targetFolder: normTarget });
          clearClipboard();
          await refreshProjectFileTree(false);
          if (pathMap) {
            applyReferencePathUpdates(pathMap);
            setStatus(`Moved ${paths.length} item${paths.length !== 1 ? 's' : ''} → ${normTarget || 'project root'} (${t('sidebar.refModal.refsUpdated')})`);
          } else {
            setStatus(`Moved ${paths.length} item${paths.length !== 1 ? 's' : ''} → ${normTarget || 'project root'}`);
          }
        } catch (error) {
          console.error('Paste failed', error);
          setStatus(`Paste failed: ${error?.message || 'unknown error'}`);
        }
        return;
      }
    }
    try {
      await api({ rootPath: state.projectRootPath, paths, targetFolder: normTarget });
      clearClipboard();
      await refreshProjectFileTree(false);
      setStatus(`${mode === 'cut' ? 'Moved' : 'Copied'} ${paths.length} item${paths.length !== 1 ? 's' : ''} → ${normTarget || 'project root'}`);
    } catch (error) {
      console.error('Paste failed', error);
      setStatus(`Paste failed: ${error?.message || 'unknown error'}`);
    }
  }

  // ── Drag-move helpers ────────────────────────────────────────────────────────

  function setDropTarget(targetPath) {
    for (const { path, el } of renderedRows) {
      if (path === targetPath) el.classList.add('drop-target');
      else el.classList.remove('drop-target');
    }
    dragMoveTargetPath = targetPath;
  }

  function getDragFolderAtPoint(clientX, clientY) {
    for (const { path, el } of renderedRows) {
      const li = el.closest('.file-tree-item');
      if (!li?.classList.contains('directory')) continue;
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return path.replace(/\\/g, '/');
      }
    }
    return null;
  }

  async function executeDragMove(targetFolder) {
    const paths = [...selectedPaths];
    if (!paths.length || !state.projectRootPath || !electronAPI?.moveProjectPaths) return;
    const normTarget = targetFolder.replace(/\\/g, '/');
    for (const p of paths) {
      const normP = p.replace(/\\/g, '/');
      if (normTarget === normP || normTarget.startsWith(normP + '/')) {
        setStatus('Cannot move a folder into itself.'); return;
      }
      const parentOfP = normP.includes('/') ? normP.slice(0, normP.lastIndexOf('/')) : '';
      if (parentOfP === normTarget) {
        setStatus('Item is already in that folder.'); return;
      }
    }
    const hits = findReferencesByPaths ? findReferencesByPaths(paths) : [];
    if (hits.length > 0) {
      const result = await showRefModal(hits, {
        title: t('sidebar.refModal.title'),
        message: t('sidebar.refModal.moveMessage'),
        primaryLabel: t('sidebar.refModal.updateAndMove'),
        secondaryLabel: t('sidebar.refModal.moveOnly'),
      });
      if (result === 'cancel') return;
      const pathMap = (result === 'primary' && applyReferencePathUpdates)
        ? new Map(paths.map((p) => {
          const normP = p.replace(/\\/g, '/');
          const base = normP.split('/').pop() || normP;
          return [normP, `${normTarget}/${base}`];
        }))
        : null;
      try {
        await electronAPI.moveProjectPaths({ rootPath: state.projectRootPath, paths, targetFolder: normTarget });
        await refreshProjectFileTree(false);
        if (pathMap) {
          applyReferencePathUpdates(pathMap);
          setStatus(`Moved ${paths.length} item${paths.length !== 1 ? 's' : ''} → ${normTarget} (${t('sidebar.refModal.refsUpdated')})`);
        } else {
          setStatus(`Moved ${paths.length} item${paths.length !== 1 ? 's' : ''} → ${normTarget}`);
        }
      } catch (error) {
        console.error('Drag-move failed', error);
        setStatus(`Move failed: ${error?.message || 'unknown error'}`);
        await refreshProjectFileTree(false);
      }
      return;
    }
    try {
      await electronAPI.moveProjectPaths({ rootPath: state.projectRootPath, paths, targetFolder: normTarget });
      await refreshProjectFileTree(false);
      setStatus(`Moved ${paths.length} item${paths.length !== 1 ? 's' : ''} → ${normTarget}`);
    } catch (error) {
      console.error('Drag-move failed', error);
      setStatus(`Move failed: ${error?.message || 'unknown error'}`);
      await refreshProjectFileTree(false);
    }
  }

  // On refresh, collapse only directories we have not seen before so freshly
  // created resources/folders appear collapsed, while preserving the user's
  // expand/collapse choices for folders that already existed.
  function collapseNewDirectories(entries) {
    const currentDirs = new Set();
    const walk = (list) => {
      for (const entry of list) {
        if (entry.type !== 'directory') continue;
        currentDirs.add(entry.path);
        if (!knownDirPaths.has(entry.path)) collapsedFileTreePaths.add(entry.path);
        if (entry.children && entry.children.length > 0) walk(entry.children);
      }
    };
    walk(entries);
    // Forget folders that no longer exist (and drop their stale collapsed flag)
    // so a folder recreated at the same path collapses again next time.
    for (const path of [...collapsedFileTreePaths]) {
      if (!currentDirs.has(path)) collapsedFileTreePaths.delete(path);
    }
    knownDirPaths.clear();
    for (const path of currentDirs) knownDirPaths.add(path);
  }

  function resetProjectFolderAssociation(message) {
    state.currentProjectDirHandle = null;
    state.currentProjectFileHandle = null;
    state.projectRootPath = '';
    state.angelFilePath = '';
    state.projectFileTree = [];
    state.fileTreeError = null;
    collapsedFileTreePaths.clear();
    knownDirPaths.clear();
    if (message) setStatus(message);
    rebuildSidebarHook();
  }

  function getFileNameFromPath(input) {
    if (!input) return 'angel.json';
    const normalized = String(input).replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts.pop() || 'angel.json';
  }

  function getFileStem(name) {
    const idx = String(name).lastIndexOf('.');
    if (idx <= 0) return String(name);
    return String(name).slice(0, idx);
  }

  function getResourceGroupStem(name, groupKind) {
    const fileName = String(name || '');
    if (groupKind === 'font') {
      if (fileName.endsWith('.font.txt')) {
        return fileName.slice(0, -'.font.txt'.length);
      }
      const pageMatch = fileName.match(/^(.*)_fontpage\d+\.png$/i);
      if (pageMatch && pageMatch[1]) {
        return pageMatch[1];
      }
      return getFileStem(fileName);
    }
    return getFileStem(fileName);
  }

  function getExt(name) {
    const idx = String(name).lastIndexOf('.');
    if (idx <= 0) return '';
    return String(name).slice(idx).toLowerCase();
  }

  function chooseResourceOpenTarget(resourceFiles = [], groupKind = 'generic') {
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    // A sprite resource should open its image; other kinds favour their metadata.
    const preferredExtOrder = groupKind === 'sprite'
      ? [...imageExts, '.txt', '.json', '.yaml', '.yml', '.wav', '.mp3', '.ogg']
      : ['.txt', '.json', '.yaml', '.yml', ...imageExts, '.wav', '.mp3', '.ogg'];
    const sorted = [...resourceFiles].sort((a, b) => {
      const ia = preferredExtOrder.indexOf(getExt(a.name));
      const ib = preferredExtOrder.indexOf(getExt(b.name));
      const ra = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
      const rb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
      if (ra !== rb) return ra - rb;
      return String(a.name).localeCompare(String(b.name));
    });
    return sorted[0] || resourceFiles[0] || null;
  }

  function mergeResourceEntries(entries, rootPrefix = '', groupKind = 'generic') {
    const dirs = [];
    const files = [];

    for (const entry of entries || []) {
      if (entry.type === 'directory') {
        dirs.push({
          ...entry,
          children: mergeResourceEntries(entry.children || [], rootPrefix, groupKind),
        });
      } else {
        files.push(entry);
      }
    }

    const groups = new Map();
    for (const fileEntry of files) {
      const stem = getResourceGroupStem(fileEntry.name, groupKind);
      if (!groups.has(stem)) groups.set(stem, []);
      groups.get(stem).push(fileEntry);
    }

    const resources = [];
    for (const [stem, groupedFiles] of groups.entries()) {
      const openTarget = chooseResourceOpenTarget(groupedFiles, groupKind);
      resources.push({
        type: 'resource',
        name: stem,
        path: openTarget?.path || `${rootPrefix}/${stem}`,
        fullPath: openTarget?.fullPath,
        groupKind,
        openTarget,
        files: groupedFiles,
      });
    }

    dirs.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    resources.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return [...dirs, ...resources];
  }

  function resolveTabTree(allEntries, tabKey) {
    if (tabKey === 'all') return allEntries;
    const config = TAB_CONFIG[tabKey];
    if (!config?.roots?.length) return [];

    const resolveRootEntries = (rootPath) => {
      const targetParts = rootPath.split('/').filter(Boolean);
      let currentEntries = allEntries;
      let current = null;

      for (const part of targetParts) {
        current = (currentEntries || []).find((entry) => entry.type === 'directory' && entry.name === part);
        if (!current) return null;
        currentEntries = current.children || [];
      }
      return current?.children || [];
    };

    let scoped = [];
    let matchedRoot = config.roots[0];
    for (const rootPath of config.roots) {
      const found = resolveRootEntries(rootPath);
      if (found) {
        scoped = found;
        matchedRoot = rootPath;
        break;
      }
    }

    if (!config.grouped) return scoped;
    return mergeResourceEntries(scoped, matchedRoot, config.groupKind || 'generic');
  }

  async function openEntry(entry, evt) {
    evt?.stopPropagation?.();

    // A font resource is one metadata file plus several texture pages, so the
    // most intuitive view is its containing folder rather than a single file.
    if (entry?.type === 'resource' && entry.groupKind === 'font' && electronAPI && entry.fullPath) {
      await handleOpenContainingFolder(entry);
      return;
    }

    const target = entry?.type === 'resource' ? entry.openTarget : entry;
    if (!target) return;

    if (electronAPI && target.fullPath) {
      try {
        await electronAPI.openFileExternally(target.fullPath);
      } catch (error) {
        console.error('Failed to open file externally', error);
        setStatus(`Unable to open file: ${target.name || entry.name}`);
      }
      return;
    }

    if (!target.handle || typeof target.handle.getFile !== 'function') return;
    try {
      const file = await target.handle.getFile();
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error('Failed to open file', error);
      setStatus(`Unable to open file: ${target.name || entry.name}`);
    }
  }

  function startInlineRename(rowEl, currentName, onCommit) {
    const labelEl = rowEl?.querySelector('.tree-label');
    if (!labelEl || rowEl.querySelector('.tree-label-edit')) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'tree-label-edit';
    labelEl.style.display = 'none';
    labelEl.insertAdjacentElement('afterend', input);
    input.select();
    input.focus();

    let done = false;
    function commit() {
      if (done) return;
      done = true;
      input.remove();
      labelEl.style.display = '';
      const newName = input.value.trim();
      if (newName && newName !== currentName) onCommit(newName);
    }
    function cancel() {
      if (done) return;
      done = true;
      input.remove();
      labelEl.style.display = '';
    }

    input.addEventListener('keydown', (evt) => {
      evt.stopPropagation();
      if (evt.key === 'Enter') { evt.preventDefault(); commit(); }
      if (evt.key === 'Escape') { evt.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => commit());
  }

  function getTabDefaultRoot() {
    const tabConfig = TAB_CONFIG[normalizeTabKey(state.fileBrowserTab)];
    return tabConfig?.roots?.[0] || '';
  }

  function getParentFolderFromY(clientY) {
    let best = null;
    for (const { path, el } of renderedRows) {
      const rect = el.getBoundingClientRect();
      if (rect.top <= clientY) best = { path, el };
    }
    if (!best) return getTabDefaultRoot();
    const li = best.el.closest('.file-tree-item');
    const p = best.path.replace(/\\/g, '/');
    if (li?.classList.contains('directory')) return p;
    const slash = p.lastIndexOf('/');
    return slash > 0 ? p.slice(0, slash) : getTabDefaultRoot();
  }

  function generateUniqueFolderName(parentPath) {
    const prefix = parentPath ? parentPath.replace(/\\/g, '/') + '/' : '';
    const siblings = new Set(
      renderedRows
        .map((r) => r.path.replace(/\\/g, '/'))
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length).split('/')[0]),
    );
    let name = 'New Folder';
    let i = 2;
    while (siblings.has(name) && i <= 99) name = `New Folder ${i++}`;
    return name;
  }

  function showRefModal(hits, { title, message, primaryLabel, secondaryLabel }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.zIndex = '10001';

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.addEventListener('click', () => { modal.remove(); resolve('cancel'); });

      const panel = document.createElement('div');
      panel.className = 'modal-panel';
      panel.style.width = 'min(460px, calc(100vw - 24px))';

      const head = document.createElement('div');
      head.className = 'modal-head';
      const h3 = document.createElement('h3');
      h3.textContent = title;
      head.appendChild(h3);

      const body = document.createElement('div');
      body.className = 'modal-body';
      body.style.flexDirection = 'column';

      const msg = document.createElement('p');
      msg.style.cssText = 'margin: 0 0 8px 0; font-size: 13px;';
      msg.textContent = message;
      body.appendChild(msg);

      const list = document.createElement('ul');
      list.style.cssText = 'margin: 0; padding: 0 0 0 16px; font-size: 12px; max-height: 120px; overflow-y: auto;';
      const MAX_SHOW = 6;
      for (const hit of hits.slice(0, MAX_SHOW)) {
        const li = document.createElement('li');
        li.textContent = `"${hit.nodeName}" ← ${hit.oldPath}`;
        list.appendChild(li);
      }
      if (hits.length > MAX_SHOW) {
        const li = document.createElement('li');
        li.style.opacity = '0.6';
        li.textContent = t('sidebar.refModal.andMore', { count: hits.length - MAX_SHOW });
        list.appendChild(li);
      }
      body.appendChild(list);

      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      function close(result) { modal.remove(); resolve(result); }

      if (primaryLabel) {
        const primaryBtn = document.createElement('button');
        primaryBtn.textContent = primaryLabel;
        primaryBtn.style.fontWeight = '600';
        primaryBtn.addEventListener('click', () => close('primary'));
        actions.appendChild(primaryBtn);
      }
      const secondaryBtn = document.createElement('button');
      secondaryBtn.textContent = secondaryLabel;
      secondaryBtn.addEventListener('click', () => close('secondary'));
      actions.appendChild(secondaryBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = t('modal.common.cancel');
      cancelBtn.addEventListener('click', () => close('cancel'));
      actions.appendChild(cancelBtn);

      panel.appendChild(head);
      panel.appendChild(body);
      panel.appendChild(actions);
      modal.appendChild(backdrop);
      modal.appendChild(panel);
      document.body.appendChild(modal);
    });
  }

  function closeContextMenu() {
    if (activeContextMenu?.parentNode) {
      activeContextMenu.parentNode.removeChild(activeContextMenu);
    }
    activeContextMenu = null;
  }

  function createContextMenuButton(label, onClick, options = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    if (options.disabled) btn.disabled = true;
    btn.addEventListener('click', async (evt) => {
      evt.stopPropagation();
      closeContextMenu();
      if (options.disabled) return;
      await onClick?.();
    });
    return btn;
  }

  function computeRenamedFileName(oldName, oldStem, newStem, groupKind) {
    if (groupKind === 'font') {
      if (oldName.endsWith('.font.txt')) return newStem + '.font.txt';
      const pageMatch = oldName.match(/^(.*)(_fontpage\d+\.png)$/i);
      if (pageMatch) return newStem + pageMatch[2];
    }
    return newStem + getExt(oldName);
  }

  function handleRenameEntry(entry) {
    if (!electronAPI?.renameProjectPath || !state.projectRootPath) {
      setStatus('Rename is only available in desktop app mode.');
      return;
    }
    const rowRecord = renderedRows.find((r) => r.path === entry?.path);
    if (!rowRecord) return;

    if (entry?.type === 'resource') {
      const oldStem = String(entry.name || '').trim();
      startInlineRename(rowRecord.el, oldStem, async (newStem) => {
        try {
          const oldPaths = (entry.files || []).map((f) => f.path.replace(/\\/g, '/')).filter(Boolean);
          const hits = findReferencesByPaths ? findReferencesByPaths(oldPaths) : [];
          let updateRefs = false;
          if (hits.length > 0) {
            const result = await showRefModal(hits, {
              title: t('sidebar.refModal.title'),
              message: t('sidebar.refModal.renameMessage'),
              primaryLabel: t('sidebar.refModal.updateAndRename'),
              secondaryLabel: t('sidebar.refModal.renameOnly'),
            });
            if (result === 'cancel') return;
            updateRefs = result === 'primary';
          }
          const pathMap = updateRefs ? new Map() : null;
          for (const file of entry.files || []) {
            const newFileName = computeRenamedFileName(file.name, oldStem, newStem, entry.groupKind);
            if (pathMap) {
              const normOld = file.path.replace(/\\/g, '/');
              const slash = normOld.lastIndexOf('/');
              const dir = slash > 0 ? normOld.slice(0, slash) : '';
              pathMap.set(normOld, dir ? `${dir}/${newFileName}` : newFileName);
            }
            await electronAPI.renameProjectPath({ rootPath: state.projectRootPath, path: file.path, nextName: newFileName });
          }
          await refreshProjectFileTree(false);
          if (pathMap && applyReferencePathUpdates) {
            applyReferencePathUpdates(pathMap);
            setStatus(`Renamed: ${oldStem} → ${newStem} (${t('sidebar.refModal.refsUpdated')})`);
          } else {
            setStatus(`Renamed: ${oldStem} → ${newStem}`);
          }
        } catch (error) {
          console.error('Rename failed', error);
          setStatus(`Rename failed: ${error?.message || 'unknown error'}`);
        }
      });
      return;
    }

    if (!entry?.path) return;
    const currentName = String(entry.name || '').trim();
    startInlineRename(rowRecord.el, currentName, async (newName) => {
      try {
        const oldPath = entry.path.replace(/\\/g, '/');
        const hits = findReferencesByPaths ? findReferencesByPaths([oldPath]) : [];
        let updateRefs = false;
        if (hits.length > 0) {
          const result = await showRefModal(hits, {
            title: t('sidebar.refModal.title'),
            message: t('sidebar.refModal.renameMessage'),
            primaryLabel: t('sidebar.refModal.updateAndRename'),
            secondaryLabel: t('sidebar.refModal.renameOnly'),
          });
          if (result === 'cancel') return;
          updateRefs = result === 'primary';
        }
        await electronAPI.renameProjectPath({ rootPath: state.projectRootPath, path: entry.path, nextName: newName });
        await refreshProjectFileTree(false);
        if (updateRefs && applyReferencePathUpdates) {
          const slash = oldPath.lastIndexOf('/');
          const dir = slash > 0 ? oldPath.slice(0, slash) : '';
          const newPath = dir ? `${dir}/${newName}` : newName;
          applyReferencePathUpdates(new Map([[oldPath, newPath]]));
          setStatus(`Renamed: ${currentName} → ${newName} (${t('sidebar.refModal.refsUpdated')})`);
        } else {
          setStatus(`Renamed: ${currentName} → ${newName}`);
        }
      } catch (error) {
        console.error('Rename failed', error);
        setStatus(`Rename failed: ${error?.message || 'unknown error'}`);
      }
    });
  }

  async function handleDeleteEntry(entry) {
    if (!electronAPI?.deleteProjectPath || !state.projectRootPath) {
      setStatus('Delete is only available in desktop app mode.');
      return;
    }

    // A resource groups several files (image + metadata, or font metadata +
    // texture pages) under one row, so deleting it must remove every file.
    const isResource = entry?.type === 'resource';
    const targets = isResource
      ? [...new Set((entry.files || []).map((file) => file.path).filter(Boolean))]
      : (entry?.path ? [entry.path] : []);
    if (!targets.length) {
      setStatus('Delete is only available in desktop app mode.');
      return;
    }

    const kindLabel = isResource
      ? `resource "${entry.name}" (${targets.length} files)`
      : `${entry.type === 'directory' ? 'folder' : 'file'} "${entry.name}"`;

    const hits = findReferencesByPaths ? findReferencesByPaths(targets) : [];
    if (hits.length > 0) {
      const result = await showRefModal(hits, {
        title: t('sidebar.refModal.title'),
        message: t('sidebar.refModal.deleteMessage'),
        primaryLabel: null,
        secondaryLabel: t('sidebar.refModal.deleteAnyway'),
      });
      if (result === 'cancel') return;
    } else {
      const ok = window.confirm(`Delete ${kindLabel}?`);
      if (!ok) return;
    }
    try {
      for (const path of targets) {
        await electronAPI.deleteProjectPath({
          rootPath: state.projectRootPath,
          path,
        });
      }
      await refreshProjectFileTree(false);
      setStatus(`Deleted: ${entry.name}`);
    } catch (error) {
      console.error('Delete failed', error);
      setStatus(`Delete failed: ${error?.message || 'unknown error'}`);
    }
  }

  async function handleDeleteSelected() {
    if (!electronAPI?.deleteProjectPath || !state.projectRootPath) {
      setStatus('Delete is only available in desktop app mode.');
      return;
    }
    const paths = [...selectedPaths];
    if (!paths.length) return;

    const hits = findReferencesByPaths ? findReferencesByPaths(paths) : [];
    if (hits.length > 0) {
      const result = await showRefModal(hits, {
        title: t('sidebar.refModal.title'),
        message: t('sidebar.refModal.deleteMessage'),
        primaryLabel: null,
        secondaryLabel: t('sidebar.refModal.deleteAnyway'),
      });
      if (result === 'cancel') return;
    } else {
      const ok = window.confirm(`Delete ${paths.length} selected item${paths.length !== 1 ? 's' : ''}?`);
      if (!ok) return;
    }
    try {
      for (const relPath of paths) {
        await electronAPI.deleteProjectPath({ rootPath: state.projectRootPath, path: relPath });
      }
      selectedPaths.clear();
      lastClickedPath = null;
      await refreshProjectFileTree(false);
      setStatus(`Deleted ${paths.length} item${paths.length !== 1 ? 's' : ''}.`);
    } catch (error) {
      console.error('Multi-delete failed', error);
      setStatus(`Delete failed: ${error?.message || 'unknown error'}`);
      await refreshProjectFileTree(false);
    }
  }

  async function handleCreateFolder(parentPath) {
    if (!electronAPI?.createProjectFolder || !state.projectRootPath) {
      setStatus('Create folder is only available in desktop app mode.');
      return;
    }
    const parent = String(parentPath || getTabDefaultRoot()).replace(/\\/g, '/').replace(/\/$/, '');
    const folderName = generateUniqueFolderName(parent);
    const folderPath = parent ? `${parent}/${folderName}` : folderName;
    try {
      await electronAPI.createProjectFolder({ rootPath: state.projectRootPath, path: folderPath });
      await refreshProjectFileTree(false);
      const row = renderedRows.find((r) => r.path.replace(/\\/g, '/') === folderPath);
      if (row) {
        startInlineRename(row.el, folderName, async (newName) => {
          try {
            await electronAPI.renameProjectPath({ rootPath: state.projectRootPath, path: folderPath, nextName: newName });
            await refreshProjectFileTree(false);
            setStatus(`Created folder: ${newName}`);
          } catch (error) {
            console.error('Rename after create failed', error);
            setStatus(`Rename failed: ${error?.message || 'unknown error'}`);
          }
        });
      } else {
        setStatus(`Created folder: ${folderName}`);
      }
    } catch (error) {
      console.error('Create folder failed', error);
      setStatus(`Create folder failed: ${error?.message || 'unknown error'}`);
    }
  }

  async function handleCopyRelativePath(entry) {
    const relPath = String(entry?.path || '').replace(/\\/g, '/').trim();
    if (!relPath) {
      setStatus('No relative path available for this item.');
      return;
    }
    try {
      // Prefer Electron's native clipboard: the renderer's async Clipboard API
      // is often denied ("Write permission denied") in non-focused/insecure contexts.
      if (electronAPI?.writeClipboardText) {
        await electronAPI.writeClipboardText(relPath);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(relPath);
      } else {
        // Fallback for non-secure contexts where the async Clipboard API is unavailable.
        const textarea = document.createElement('textarea');
        textarea.value = relPath;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setStatus(`Copied path: ${relPath}`);
    } catch (error) {
      console.error('Copy relative path failed', error);
      setStatus(`Copy path failed: ${error?.message || 'unknown error'}`);
    }
  }

  async function handleOpenContainingFolder(entry) {
    const target = entry?.type === 'directory'
      ? entry.fullPath
      : (entry?.fullPath ? entry.fullPath.replace(/[\\/][^\\/]+$/, '') : '');
    if (!electronAPI?.openFolderExternally || !target) {
      setStatus('Open containing folder is only available in desktop app mode.');
      return;
    }
    try {
      await electronAPI.openFolderExternally(target);
    } catch (error) {
      console.error('Open containing folder failed', error);
      setStatus(`Open folder failed: ${error?.message || 'unknown error'}`);
    }
  }

  function positionMenu(menu, clientX, clientY) {
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
      const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
      menu.style.left = `${Math.min(clientX, maxLeft)}px`;
      menu.style.top = `${Math.min(clientY, maxTop)}px`;
    });
  }

  function showContextMenu(entry, evt) {
    evt.preventDefault();
    evt.stopPropagation();
    closeContextMenu();

    const isMultiContext = selectedPaths.has(entry.path) && selectedPaths.size > 1;
    if (!isMultiContext) {
      clearSelection();
      selectedPaths.add(entry.path);
      lastClickedPath = entry.path;
      const found = renderedRows.find((r) => r.path === entry.path);
      if (found) found.el.classList.add('selected');
    }

    const menu = document.createElement('div');
    menu.className = 'canvas-context-menu';

    const noApi = !electronAPI || !state.projectRootPath;
    const n = selectedPaths.size;
    if (isMultiContext) {
      menu.appendChild(createContextMenuButton(t('sidebar.menu.copyN', { count: n }), () => handleCopy(), {}));
      menu.appendChild(createContextMenuButton(t('sidebar.menu.cutN', { count: n }), () => handleCut(), { disabled: noApi }));
      menu.appendChild(createContextMenuButton(t('sidebar.menu.deleteN', { count: n }), () => handleDeleteSelected(), { disabled: noApi }));
    } else {
      menu.appendChild(createContextMenuButton(t('sidebar.menu.rename'), () => handleRenameEntry(entry), { disabled: !electronAPI || !entry?.path }));
      menu.appendChild(createContextMenuButton(t('sidebar.menu.copy'), () => handleCopy(), {}));
      menu.appendChild(createContextMenuButton(t('sidebar.menu.cut'), () => handleCut(), { disabled: noApi }));
      menu.appendChild(createContextMenuButton(t('sidebar.menu.delete'), () => handleDeleteEntry(entry), { disabled: !electronAPI || !entry?.path }));
      if (entry.type === 'directory') {
        const dirPath = String(entry.path || '').replace(/\\/g, '/');
        menu.appendChild(createContextMenuButton(t('sidebar.menu.newFolder'), () => handleCreateFolder(dirPath), { disabled: noApi }));
        menu.appendChild(createContextMenuButton(t('sidebar.menu.paste'), () => handlePaste(dirPath), { disabled: !clipboard?.paths?.length || noApi }));
      }
      menu.appendChild(createContextMenuButton(t('sidebar.menu.copyRelativePath'), () => handleCopyRelativePath(entry), { disabled: !entry?.path }));
      menu.appendChild(createContextMenuButton(t('sidebar.menu.openContainingFolder'), () => handleOpenContainingFolder(entry), { disabled: !electronAPI || !entry?.fullPath }));
    }

    document.body.appendChild(menu);
    activeContextMenu = menu;
    positionMenu(menu, evt.clientX, evt.clientY);
  }

  function showEmptySpaceMenu(evt) {
    closeContextMenu();
    const parentPath = getParentFolderFromY(evt.clientY);
    const noApi = !electronAPI || !state.projectRootPath;
    const menu = document.createElement('div');
    menu.className = 'canvas-context-menu';
    menu.appendChild(createContextMenuButton(t('sidebar.menu.newFolder'), () => handleCreateFolder(parentPath), { disabled: noApi }));
    menu.appendChild(createContextMenuButton(t('sidebar.menu.paste'), () => handlePaste(parentPath), { disabled: !clipboard?.paths?.length || noApi }));
    document.body.appendChild(menu);
    activeContextMenu = menu;
    positionMenu(menu, evt.clientX, evt.clientY);
  }

  function renderFileTree(container, entries, depth = 0) {
    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = `file-tree-item ${entry.type}`;
      const row = document.createElement('div');
      row.className = 'file-tree-row';
      if (selectedPaths.has(entry.path)) row.classList.add('selected');

      row.addEventListener('contextmenu', (evt) => showContextMenu(entry, evt));
      row.addEventListener('click', (evt) => {
        if (suppressNextRowClick) { suppressNextRowClick = false; return; }
        if (evt.target.closest('.tree-toggle')) return;
        if (evt.ctrlKey || evt.metaKey) {
          if (selectedPaths.has(entry.path)) {
            selectedPaths.delete(entry.path);
            row.classList.remove('selected');
          } else {
            selectedPaths.add(entry.path);
            row.classList.add('selected');
            lastClickedPath = entry.path;
          }
        } else if (evt.shiftKey && lastClickedPath) {
          selectRange(lastClickedPath, entry.path);
        } else {
          clearSelection();
          selectedPaths.add(entry.path);
          row.classList.add('selected');
          lastClickedPath = entry.path;
        }
      });
      renderedRows.push({ path: entry.path, el: row });
      if (clipboard?.mode === 'cut' && clipboard.paths.includes(entry.path)) {
        row.classList.add('cut-pending');
      }

      row.addEventListener('mousedown', (evt) => {
        if (evt.button !== 0) return;
        if (document.querySelector('.tree-label-edit')) return;
        if (selectedPaths.has(entry.path)) {
          // Already selected — arm potential drag-move.
          dragMoveStart = { x: evt.clientX, y: evt.clientY };
          isDragMoving = false;
        } else {
          // Not selected — arm rubber-band starting from this row's Y.
          dragStartY = evt.clientY;
          dragStartSelection = new Set(selectedPaths);
          isDragging = false;
        }
      });

      if (entry.type === 'directory') {
        const isCollapsed = collapsedFileTreePaths.has(entry.path);
        const toggle = document.createElement('button');
        toggle.className = `tree-toggle ${isCollapsed ? 'collapsed' : 'expanded'}`;
        toggle.addEventListener('click', (evt) => {
          evt.stopPropagation();
          if (isCollapsed) {
            collapsedFileTreePaths.delete(entry.path);
          } else {
            collapsedFileTreePaths.add(entry.path);
          }
          rebuildSidebarHook();
        });
        row.appendChild(toggle);

        const label = document.createElement('span');
        label.className = 'tree-label';
        label.textContent = entry.name;
        row.appendChild(label);
        li.appendChild(row);

        if (!isCollapsed) {
          const childList = document.createElement('ul');
          childList.className = 'file-tree';
          renderFileTree(childList, entry.children, depth + 1);
          li.appendChild(childList);
        }
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'tree-toggle tree-placeholder';
        spacer.textContent = '';
        row.appendChild(spacer);

        const label = document.createElement('span');
        label.className = 'tree-label';
        label.textContent = entry.name;
        row.appendChild(label);

        row.ondblclick = (evt) => openEntry(entry, evt);
        li.appendChild(row);
      }

      container.appendChild(li);
    }
  }

  function rebuildSidebar() {
    renderedRows = [];
    if (!fileBrowser || !fileBrowserEmpty) return;

    const hasFolder = Boolean(state.currentProjectDirHandle) || Boolean(state.projectRootPath);
    const folderLabel = state.projectRootPath
      ? getFileNameFromPath(state.projectRootPath)
      : (state.currentProjectDirHandle?.name || t('sidebar.info.noFolder'));

    const tabKey = normalizeTabKey(state.fileBrowserTab);
    state.fileBrowserTab = tabKey;

    if (fileBrowserTabs) {
      const currentLabel = fileBrowserTabs.querySelector('[data-file-tab-current]');
      if (currentLabel) {
        currentLabel.textContent = TAB_CONFIG[tabKey]?.labelKey ? t(TAB_CONFIG[tabKey].labelKey) : tabKey;
      }
    }

    if (fileBrowserInfo) {
      const tabSuffix = TAB_CONFIG[tabKey]?.labelKey ? ` / ${t(TAB_CONFIG[tabKey].labelKey)}` : '';
      fileBrowserInfo.textContent = hasFolder ? `${folderLabel}${tabSuffix}` : t('sidebar.info.noFolder');
    }

    if (state.sidebarCollapsed) {
      fileBrowser.classList.add('hidden');
      fileBrowserEmpty.classList.add('hidden');
      return;
    }

    if (state.fileTreeLoading) {
      fileBrowser.classList.add('hidden');
      fileBrowserEmpty.classList.remove('hidden');
      fileBrowserEmpty.innerHTML = `<p>${t('sidebar.empty.loading')}</p>`;
      return;
    }

    if (!hasFolder) {
      fileBrowser.classList.add('hidden');
      fileBrowserEmpty.classList.remove('hidden');
      fileBrowserEmpty.innerHTML = `<p>${t('sidebar.empty.noProject')}</p><p>${t('sidebar.empty.enableHint')}</p>`;
      return;
    }

    if (state.fileTreeError) {
      fileBrowser.classList.add('hidden');
      fileBrowserEmpty.classList.remove('hidden');
      fileBrowserEmpty.innerHTML = `<p>${t('sidebar.empty.readError')}</p><p>${state.fileTreeError.message || state.fileTreeError}</p>`;
      return;
    }

    const displayTree = resolveTabTree(state.projectFileTree, tabKey);
    if (!displayTree.length) {
      fileBrowser.classList.add('hidden');
      fileBrowserEmpty.classList.remove('hidden');
      fileBrowserEmpty.innerHTML = `<p>${t('sidebar.empty.folderEmpty')}</p>`;
      return;
    }

    fileBrowser.classList.remove('hidden');
    fileBrowserEmpty.classList.add('hidden');
    fileBrowser.innerHTML = '';
    renderFileTree(fileBrowser, displayTree, 0);
  }

  async function readDirectoryTree(dirHandle, basePath = '') {
    const entries = [];
    for await (const entry of dirHandle.values()) {
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        entries.push({
          type: 'directory',
          name: entry.name,
          path: relPath,
          handle: entry,
          children: await readDirectoryTree(entry, relPath),
        });
      } else {
        entries.push({ type: 'file', name: entry.name, path: relPath, handle: entry });
      }
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  }

  // Refresh project file tree for both host-path mode (Electron) and handle mode (browser FS API).
  // Always updates loading/error flags so sidebar rendering stays deterministic.
  async function refreshProjectFileTree(showStatus = true) {
    if (electronAPI && state.projectRootPath) {
      state.fileTreeLoading = true;
      if (showStatus) setStatus(t('sidebar.status.loading'));
      rebuildSidebarHook();

      try {
        const tree = await electronAPI.listFiles(state.projectRootPath);
        const entries = Array.isArray(tree) ? tree : [];
        state.projectFileTree = entries;
        state.fileTreeError = null;
        collapseNewDirectories(entries);
        if (showStatus) setStatus(t('sidebar.status.refreshed'));
      } catch (error) {
        console.error('Failed to read project folder', error);
        state.projectFileTree = [];
        state.fileTreeError = error;
        if (showStatus) setStatus(`${t('sidebar.status.errorPrefix')}: ${error.message || t('common.unknownError')}`);
      } finally {
        state.fileTreeLoading = false;
        rebuildSidebarHook();
      }
      return;
    }

    if (!state.currentProjectDirHandle) {
      state.projectFileTree = [];
      state.fileTreeError = null;
      rebuildSidebarHook();
      return;
    }

    state.fileTreeLoading = true;
    if (showStatus) setStatus(t('sidebar.status.loading'));
    rebuildSidebarHook();

    try {
      const tree = await readDirectoryTree(state.currentProjectDirHandle);
      collapseNewDirectories(tree);
      state.projectFileTree = tree;
      state.fileTreeError = null;
      if (showStatus) setStatus(t('sidebar.status.refreshed'));
    } catch (error) {
      console.error('Failed to read project folder', error);
      state.projectFileTree = [];
      state.fileTreeError = error;
      if (showStatus) setStatus(`${t('sidebar.status.errorPrefix')}: ${error.message || t('common.unknownError')}`);
    } finally {
      state.fileTreeLoading = false;
      rebuildSidebarHook();
    }
  }

  function bindTabEvents() {
    if (!fileBrowserTabs) return;
    fileBrowserTabs.addEventListener('click', (evt) => {
      const prevBtn = evt.target?.closest?.('[data-file-tab-prev]');
      if (prevBtn) {
        if (shiftTab(-1)) rebuildSidebarHook();
        return;
      }

      const nextBtn = evt.target?.closest?.('[data-file-tab-next]');
      if (nextBtn) {
        if (shiftTab(1)) rebuildSidebarHook();
      }
    });
  }

  function bindContextMenuDismiss() {
    document.addEventListener('click', () => closeContextMenu());
    document.addEventListener('contextmenu', (evt) => {
      if (evt.target?.closest?.('.canvas-context-menu')) return;
      // The sidebar handles its own contextmenu (row menus + empty-space menu).
      const sidebar = fileBrowser?.closest?.('aside') || fileBrowser?.parentElement;
      if (sidebar?.contains(evt.target)) return;
      closeContextMenu();
    });
    window.addEventListener('blur', () => closeContextMenu());
    window.addEventListener('resize', () => closeContextMenu());
    // Clicking anywhere outside the sidebar (canvas, toolbar, etc.) cancels the
    // file-tree selection, so a subsequent Delete only affects the canvas.
    // Capture phase so a canvas handler's stopPropagation can't block it.
    document.addEventListener('mousedown', (evt) => {
      if (evt.button !== 0) return;
      const sidebar = fileBrowser?.closest?.('aside') || fileBrowser?.parentElement;
      if (sidebar && sidebar.contains(evt.target)) return;
      if (selectedPaths.size > 0) clearSelection();
    }, true);
    document.addEventListener('keydown', (evt) => {
      if (evt.key === 'Escape') {
        closeContextMenu();
        if (clipboard) clearClipboard();
        if (selectedPaths.size > 0) clearSelection();
        return;
      }
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      if (isInput) return;
      if ((evt.key === 'Delete' || evt.key === 'Backspace') && selectedPaths.size > 0 && !activeContextMenu) {
        evt.preventDefault();
        handleDeleteSelected();
        return;
      }
      if ((evt.ctrlKey || evt.metaKey) && evt.key === 'c' && selectedPaths.size > 0) {
        handleCopy();
        return;
      }
      if ((evt.ctrlKey || evt.metaKey) && evt.key === 'x' && selectedPaths.size > 0) {
        handleCut();
        return;
      }
      if ((evt.ctrlKey || evt.metaKey) && evt.key === 'v' && clipboard?.paths?.length) {
        handlePaste(getPasteTargetFolder());
      }
    });
  }

  function bindFileBrowserEvents() {
    if (!fileBrowser) return;
    // Use the sidebar <aside> so all three behaviours cover the full sidebar area,
    // not just the <ul> which only extends as far as its items.
    const sidebar = fileBrowser.closest('aside') || fileBrowser.parentElement;
    if (!sidebar) return;

    // Right-click anywhere in the sidebar that isn't a row/tabs/controls → New Folder.
    sidebar.addEventListener('contextmenu', (evt) => {
      if (evt.target.closest?.('.canvas-context-menu')) return;
      if (evt.target.closest?.('.file-tree-row')) return; // row shows its own menu
      if (evt.target.closest?.('.file-browser-tabs, .sidebar-controls, #sidebar-resize')) {
        closeContextMenu();
        return;
      }
      evt.preventDefault();
      evt.stopPropagation();
      showEmptySpaceMenu(evt);
    });

    // Mousedown anywhere in the sidebar: suppress text selection immediately so
    // dragging from a file label doesn't highlight page text.
    sidebar.addEventListener('mousedown', (evt) => {
      if (evt.button !== 0) return;
      if (evt.target.closest?.('.file-browser-tabs, .sidebar-controls, #sidebar-resize')) return;
      document.body.style.userSelect = 'none';
      if (evt.target.closest?.('.file-tree-row')) return;
      if (!evt.ctrlKey && !evt.metaKey) {
        clearSelection();
        lastClickedPath = null;
      }
      dragStartY = evt.clientY;
      dragStartSelection = new Set(selectedPaths);
      isDragging = false;
    });

    document.addEventListener('mousemove', (evt) => {
      // Drag-move: dragging already-selected rows onto a folder
      if (dragMoveStart !== null) {
        const dx = evt.clientX - dragMoveStart.x;
        const dy = evt.clientY - dragMoveStart.y;
        if (!isDragMoving && Math.sqrt(dx * dx + dy * dy) > 6) {
          isDragMoving = true;
          // Create ghost label
          const paths = [...selectedPaths];
          const names = paths.slice(0, 2).map((p) => p.replace(/\\/g, '/').split('/').pop() || p);
          const extra = paths.length > 2 ? ` +${paths.length - 2}` : '';
          dragGhostEl = document.createElement('div');
          dragGhostEl.className = 'drag-ghost';
          dragGhostEl.textContent = names.join(', ') + extra;
          document.body.appendChild(dragGhostEl);
        }
        if (isDragMoving) {
          if (dragGhostEl) {
            dragGhostEl.style.left = `${evt.clientX + 14}px`;
            dragGhostEl.style.top = `${evt.clientY + 10}px`;
          }
          const target = getDragFolderAtPoint(evt.clientX, evt.clientY);
          if (target !== dragMoveTargetPath) setDropTarget(target);
        }
        return; // don't run rubber-band while drag-moving
      }

      // Rubber-band drag-select from empty space
      if (dragStartY === null) return;
      if (!isDragging && Math.abs(evt.clientY - dragStartY) > 4) isDragging = true;
      if (!isDragging) return;

      const lo = Math.min(dragStartY, evt.clientY);
      const hi = Math.max(dragStartY, evt.clientY);
      const next = (evt.ctrlKey || evt.metaKey) ? new Set(dragStartSelection) : new Set();
      for (const { path, el } of renderedRows) {
        const rect = el.getBoundingClientRect();
        const cy = rect.top + rect.height / 2;
        if (cy >= lo && cy <= hi) next.add(path);
      }
      for (const { path, el } of renderedRows) {
        const sel = next.has(path);
        if (sel !== selectedPaths.has(path)) {
          if (sel) el.classList.add('selected');
          else el.classList.remove('selected');
        }
      }
      selectedPaths.clear();
      for (const p of next) selectedPaths.add(p);
    });

    document.addEventListener('mouseup', (evt) => {
      if (evt.button !== 0) return;
      document.body.style.userSelect = '';

      // Handle drag-move drop
      if (dragMoveStart !== null) {
        const wasMoving = isDragMoving;
        const target = dragMoveTargetPath;
        if (dragGhostEl) { dragGhostEl.remove(); dragGhostEl = null; }
        setDropTarget(null);
        dragMoveStart = null;
        isDragMoving = false;
        if (wasMoving && target) executeDragMove(target);
        return;
      }

      if (dragStartY === null) return;
      const wasDragging = isDragging;
      dragStartY = null;
      dragStartSelection = null;
      isDragging = false;
      // Prevent the trailing click event from overwriting rubber-band selection.
      if (wasDragging) suppressNextRowClick = true;
    });
  }

  function focusNode(node, canvas, graphState) {
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    graphState.panX = canvas.clientWidth * 0.5 - cx * graphState.zoom;
    graphState.panY = canvas.clientHeight * 0.5 - cy * graphState.zoom;
  }

  bindTabEvents();
  bindContextMenuDismiss();
  bindFileBrowserEvents();

  return {
    seedCollapsedFileTree,
    resetProjectFolderAssociation,
    getFileNameFromPath,
    renderFileTree,
    rebuildSidebar,
    readDirectoryTree,
    refreshProjectFileTree,
    focusNode,
  };
}
