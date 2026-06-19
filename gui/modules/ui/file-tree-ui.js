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
  } = deps;

  let activeContextMenu = null;

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
    return true;
  }

  function shiftTab(step) {
    const current = normalizeTabKey(state.fileBrowserTab);
    const currentIdx = Math.max(0, TAB_ORDER.indexOf(current));
    const nextIdx = (currentIdx + step + TAB_ORDER.length) % TAB_ORDER.length;
    return setCurrentTab(TAB_ORDER[nextIdx]);
  }

  function seedCollapsedFileTree(entries) {
    for (const entry of entries) {
      if (entry.type !== 'directory') continue;
      collapsedFileTreePaths.add(entry.path);
      if (entry.children && entry.children.length > 0) {
        seedCollapsedFileTree(entry.children);
      }
    }
  }

  function resetProjectFolderAssociation(message) {
    state.currentProjectDirHandle = null;
    state.currentProjectFileHandle = null;
    state.projectRootPath = '';
    state.angelFilePath = '';
    state.projectFileTree = [];
    state.fileTreeError = null;
    collapsedFileTreePaths.clear();
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

  async function handleRenameEntry(entry) {
    if (!electronAPI?.renameProjectPath || !state.projectRootPath || !entry?.path) {
      setStatus('Rename is only available in desktop app mode.');
      return;
    }
    const currentName = String(entry.name || '').trim();
    const nextName = window.prompt('Rename to:', currentName);
    if (nextName == null) return;
    const trimmed = String(nextName).trim();
    if (!trimmed || trimmed === currentName) return;
    try {
      await electronAPI.renameProjectPath({
        rootPath: state.projectRootPath,
        path: entry.path,
        nextName: trimmed,
      });
      await refreshProjectFileTree(false);
      setStatus(`Renamed: ${currentName} → ${trimmed}`);
    } catch (error) {
      console.error('Rename failed', error);
      setStatus(`Rename failed: ${error?.message || 'unknown error'}`);
    }
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
    const ok = window.confirm(`Delete ${kindLabel}?`);
    if (!ok) return;
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

  function showContextMenu(entry, evt) {
    evt.preventDefault();
    evt.stopPropagation();
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'canvas-context-menu';
    menu.style.left = `${evt.clientX}px`;
    menu.style.top = `${evt.clientY}px`;
    menu.appendChild(createContextMenuButton('Rename', () => handleRenameEntry(entry), { disabled: !electronAPI || !entry?.path || entry?.type === 'resource' }));
    menu.appendChild(createContextMenuButton('Delete', () => handleDeleteEntry(entry), { disabled: !electronAPI || !entry?.path }));
    menu.appendChild(createContextMenuButton('Open Containing Folder', () => handleOpenContainingFolder(entry), { disabled: !electronAPI || !entry?.fullPath }));

    document.body.appendChild(menu);
    activeContextMenu = menu;

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
      const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
      menu.style.left = `${Math.min(evt.clientX, maxLeft)}px`;
      menu.style.top = `${Math.min(evt.clientY, maxTop)}px`;
    });
  }

  function renderFileTree(container, entries, depth = 0) {
    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = `file-tree-item ${entry.type}`;
      const row = document.createElement('div');
      row.className = 'file-tree-row';

      row.addEventListener('contextmenu', (evt) => showContextMenu(entry, evt));

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
        if (collapsedFileTreePaths.size === 0) {
          seedCollapsedFileTree(entries);
        }
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
      if (collapsedFileTreePaths.size === 0) {
        seedCollapsedFileTree(tree);
      }
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
      if (!evt.target?.closest?.('.canvas-context-menu') && !evt.target?.closest?.('.file-tree-row')) {
        closeContextMenu();
      }
    });
    window.addEventListener('blur', () => closeContextMenu());
    window.addEventListener('resize', () => closeContextMenu());
    document.addEventListener('keydown', (evt) => {
      if (evt.key === 'Escape') closeContextMenu();
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
