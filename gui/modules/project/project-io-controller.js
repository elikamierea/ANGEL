export function createProjectIOController(deps) {
  const {
    state,
    nodes,
    edges,
    containmentRelations,
    mirrorRelations,
    deepClone,
    replaceArray,
    normalizeGraphSchema,
    layerSelect,
    syncSidebarCollapsedState,
    rebuildSidebar,
    renderRightPanel,
    renderConflicts,
    render,
    updateTopbar,
    setStatus,
    getUnsavedCount,
    resetProjectFolderAssociation,
    getFileNameFromPath,
    refreshProjectFileTree,
    loadAgentMemoriesForActiveProject,
    isCliBackendActive,
    applyBackendProject,
    supportsDirectoryPicker,
    electronAPI,
    projectFileInput,
    collapsedFileTreePaths,
    rightPanel,
    applyAppGridColumns,
    topbarRight,
    requestRunTestName,
    requestRunTestOptions,
    executeFailModal,
    executeFailClose,
    executeFailMessage,
    executeFailDetail,
    buildToolsModal,
    buildToolsClose,
    buildToolsRecheck,
    onProjectTemplateApplied,
  } = deps;

  let templateManifestPromise = null;

  // File System Access pickers remember a last-used directory per `id`. Tagging
  // the project folder picker keeps its lineage separate from the resource
  // (sprite/font/audio) `<input type="file">` pickers, which the browser
  // remembers independently.
  const PROJECT_DIR_PICKER_ID = 'angel-project-folder';

  // Each value maps directly to a prompt folder under ../prompts/agents/<profile>.
  const KNOWN_PROMPT_PROFILES = new Set(['full', 'minimized', 'full-image', 'minimized-image']);

  const DEFAULT_PROJECT_TEMPLATE = {
    id: 'default-2layer-v1',
    version: 1,
    layers: ['L0', 'L1'],
    defaultActiveLayer: 'L0',
    agents: ['programmer'],
    promptProfile: 'minimized',
  };

  function toSerializableNode(node) {
    return {
      ...deepClone(node),
      selected: undefined,
    };
  }

  function getProjectPayload() {
    return {
      format: 'angel.project',
      version: 1,
      savedAt: new Date().toISOString(),
      project: {
        name: state.projectName || 'untitled',
        template: state.projectTemplate,
      },
      graph: {
        nodes: nodes.map(toSerializableNode),
        edges: deepClone(edges),
        containmentRelations: deepClone(containmentRelations),
        mirrorRelations: deepClone(mirrorRelations),
      },
      ui: {
        activeLayer: state.activeLayer,
        zoom: state.zoom,
        panX: state.panX,
        panY: state.panY,
        rightPanelWidth: state.rightPanelWidth,
        rightPanelCollapsed: Boolean(state.rightPanelCollapsed),
        sidebarCollapsed: state.sidebarCollapsed,
        leftPanelWidth: state.leftPanelWidth,
      },
      runtime: {
        revision: state.revision,
      },
    };
  }

  function saveBlobAsFile(text, fileName) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function sanitizeFileName(input) {
    const normalized = (input || 'untitled').trim().replace(/[<>:"/\\|?*]+/g, '_');
    return normalized || 'untitled';
  }

  function sanitizeFolderName(input) {
    const normalized = (input || '').trim().replace(/[<>:"/\\|?*]+/g, '_');
    return normalized || 'project';
  }

  function base64ToUint8(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async function loadTemplateManifest() {
    if (!templateManifestPromise) {
      templateManifestPromise = fetch('./new_project_template_manifest.json')
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Template manifest fetch failed (${response.status})`);
          }
          return response.json();
        })
        .catch((error) => {
          templateManifestPromise = null;
          throw error;
        });
    }
    return templateManifestPromise;
  }

  async function writeFileToDirectory(dirHandle, relativePath, bufferSource) {
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length === 0) {
      throw new Error('Invalid template path');
    }

    const fileName = parts.pop();
    let currentDir = dirHandle;
    for (const segment of parts) {
      currentDir = await currentDir.getDirectoryHandle(segment, { create: true });
    }

    const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(bufferSource);
    await writable.close();
  }

  async function copyTemplateToDirectory(targetDirHandle) {
    const manifest = await loadTemplateManifest();
    if (!manifest || !Array.isArray(manifest.files)) {
      throw new Error('Template manifest is invalid.');
    }

    for (const entry of manifest.files) {
      const bytes = base64ToUint8(entry.content);
      await writeFileToDirectory(targetDirHandle, entry.path, bytes);
    }
  }

  function buildBlankProjectPayload(projectName) {
    const template = deepClone(DEFAULT_PROJECT_TEMPLATE);

    return {
      format: 'angel.project',
      version: 1,
      savedAt: new Date().toISOString(),
      project: {
        name: projectName || 'untitled',
        template,
      },
      graph: {
        nodes: [],
        edges: [],
        containmentRelations: [],
        mirrorRelations: [],
      },
      ui: {
        activeLayer: template.defaultActiveLayer,
        zoom: 1,
        panX: 0,
        panY: 0,
        rightPanelWidth: 340,
        rightPanelCollapsed: false,
        sidebarCollapsed: false,
        leftPanelWidth: 280,
      },
      runtime: {
        revision: 1,
      },
    };
  }

  async function directoryHasEntries(dirHandle) {
    if (!dirHandle || typeof dirHandle.values !== 'function') return false;
    for await (const _entry of dirHandle.values()) {
      return true;
    }
    return false;
  }

  async function runSaveAs() {
    if (!electronAPI?.saveProjectAs) {
      setStatus('Save As is only available in the desktop app.');
      return;
    }

    // sourceRoot is empty when no project folder is open; the backend then
    // scaffolds a fresh project from the template so the current in-memory
    // graph is still saved to disk instead of being lost.
    const hasOpenProject = Boolean(state.projectRootPath);
    const serialized = JSON.stringify(getProjectPayload(), null, 2);
    setStatus(hasOpenProject ? 'Saving project copy...' : 'Saving project to new folder...');

    try {
      const result = await electronAPI.saveProjectAs({
        sourceRoot: state.projectRootPath || '',
        angelContent: serialized,
      });
      // Switch the editor over to the freshly written copy and mark it clean.
      await applyBackendProject(result);
      // applyProjectData reads the name from the serialized payload, which still
      // carries the old folder name. Overwrite it with the actual new folder name.
      const newFolderName = getFileNameFromPath(result.rootPath);
      if (newFolderName) state.projectName = newFolderName;
      for (const n of nodes) n.dirty = false;
      updateTopbar();

      const gitInit = result?.gitInit;
      const gitNote = gitInit?.ok
        ? ' (Git initialized)'
        : gitInit?.reason === 'git-unavailable'
          ? ' (Git not found; repo init skipped)'
          : gitInit?.attempted
            ? ' (Git init failed; copy still created)'
            : '';
      const savedVerb = hasOpenProject ? 'Saved copy to folder' : 'Saved project to folder';
      setStatus(`${savedVerb}: ${result.rootPath}${gitNote}`);
    } catch (error) {
      const message = error?.message || 'unknown error';
      if (message === 'USER_CANCEL') {
        setStatus('Save As cancelled');
      } else if (/TARGET_NOT_EMPTY/.test(message)) {
        setStatus('Save As failed: target folder is not empty. Pick or create an empty folder.');
      } else if (/TARGET_INSIDE_SOURCE/.test(message)) {
        setStatus('Save As failed: cannot save inside the current project folder. Choose a folder outside it.');
      } else {
        console.error('Save As failed', error);
        setStatus(`Save As failed: ${message}`);
      }
    }
  }

  async function runSave(options = {}) {
    const saveAs = Boolean(options.saveAs);
    if (saveAs) {
      await runSaveAs();
      return;
    }

    const payload = getProjectPayload();
    const serialized = JSON.stringify(payload, null, 2);

    if (electronAPI && state.angelFilePath) {
      try {
        await electronAPI.saveProject({ angelPath: state.angelFilePath, content: serialized });
        state.revision += 1;
        for (const n of nodes) n.dirty = false;
        updateTopbar();
        rebuildSidebar();
        renderRightPanel();
        render();
        setStatus(`Saved: ${getFileNameFromPath(state.angelFilePath)}`);
        return;
      } catch (error) {
        console.error('Save failed via Electron backend', error);
        setStatus(`Save failed: ${error?.message || 'unknown error'}`);
        return;
      }
    }

    if (state.currentProjectFileHandle && typeof state.currentProjectFileHandle.createWritable === 'function') {
      try {
        const writable = await state.currentProjectFileHandle.createWritable();
        await writable.write(serialized);
        await writable.close();
        state.revision += 1;
        for (const n of nodes) n.dirty = false;
        updateTopbar();
        rebuildSidebar();
        renderRightPanel();
        render();
        setStatus(`Saved to ${state.lastSaveFileName || state.projectName}`);
        return;
      } catch (error) {
        console.error('Save failed via file handle:', error);
        setStatus(`Save failed: ${error.message || 'unknown error'}`);
        return;
      }
    }

    const fileName = 'angel.json';
    saveBlobAsFile(serialized, fileName);

    state.projectName = state.projectName || 'untitled';
    state.lastSaveFileName = fileName;
    state.revision += 1;
    for (const n of nodes) n.dirty = false;
    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();
    setStatus(`Saved: ${fileName}`);
  }

  function applyProjectData(payload, sourceName = 'project') {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid project JSON object.');
    }

    if (payload.format !== 'angel.project') {
      throw new Error('Unsupported format. Expected format="angel.project".');
    }

    if (payload.version !== 1) {
      throw new Error(`Unsupported project version: ${payload.version}`);
    }

    const graph = payload.graph || {};
    const nextNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const nextEdges = Array.isArray(graph.edges) ? graph.edges : [];

    replaceArray(nodes, deepClone(nextNodes));
    replaceArray(edges, deepClone(nextEdges));
    replaceArray(containmentRelations, Array.isArray(graph.containmentRelations) ? deepClone(graph.containmentRelations) : []);
    replaceArray(mirrorRelations, Array.isArray(graph.mirrorRelations) ? deepClone(graph.mirrorRelations) : []);

    normalizeGraphSchema();

    state.selectedNodeId = null;
    state.selectedNodeIds = new Set();
    state.selectedEdgeId = null;

    const templateFromPayload = payload.project?.template;
    if (!templateFromPayload || typeof templateFromPayload !== 'object') {
      throw new Error('Invalid project: missing project.template');
    }

    const allowedLayers = Array.isArray(templateFromPayload.layers)
      ? templateFromPayload.layers.map((v) => String(v)).filter(Boolean)
      : [];
    if (allowedLayers.length === 0) {
      throw new Error('Invalid project.template.layers: expected non-empty array');
    }

    const agents = Array.isArray(templateFromPayload.agents)
      ? templateFromPayload.agents.map((v) => String(v)).filter(Boolean)
      : [];
    if (agents.length === 0) {
      throw new Error('Invalid project.template.agents: expected non-empty array');
    }

    const defaultActiveLayer = String(templateFromPayload.defaultActiveLayer || '');
    if (!allowedLayers.includes(defaultActiveLayer)) {
      throw new Error('Invalid project.template.defaultActiveLayer: must exist in template.layers');
    }

    const promptProfile = String(templateFromPayload.promptProfile || '').trim().toLowerCase();
    state.projectTemplate = {
      id: String(templateFromPayload.id || '').trim() || 'template',
      version: Number.isFinite(Number(templateFromPayload.version)) ? Number(templateFromPayload.version) : 1,
      layers: allowedLayers,
      defaultActiveLayer,
      agents,
      ...(KNOWN_PROMPT_PROFILES.has(promptProfile) ? { promptProfile } : {}),
    };
    if (typeof onProjectTemplateApplied === 'function') {
      onProjectTemplateApplied(state.projectTemplate);
    }

    const ui = payload.ui || {};
    state.activeLayer = allowedLayers.includes(ui.activeLayer) ? ui.activeLayer : defaultActiveLayer;
    layerSelect.value = state.activeLayer;
    state.zoom = Number.isFinite(ui.zoom) ? ui.zoom : 1;
    state.panX = Number.isFinite(ui.panX) ? ui.panX : 0;
    state.panY = Number.isFinite(ui.panY) ? ui.panY : 0;
    state.rightPanelWidth = Number.isFinite(ui.rightPanelWidth) ? ui.rightPanelWidth : 340;
    state.rightPanelCollapsed = Boolean(ui.rightPanelCollapsed);
    state.leftPanelWidth = Number.isFinite(ui.leftPanelWidth) ? ui.leftPanelWidth : state.leftPanelWidth;
    state.sidebarCollapsed = Boolean(ui.sidebarCollapsed);

    state.projectName = payload.project?.name || sourceName.replace(/\.angel\.json$/i, '') || 'untitled';
    state.lastSaveFileName = sourceName;
    state.revision = Number.isFinite(payload.runtime?.revision) ? payload.runtime.revision : 1;

    syncSidebarCollapsedState();
    rebuildSidebar();
    renderRightPanel();
    renderConflicts();
    render();
    updateTopbar();
  }

  async function runNewProject(options = {}) {
    const skipUnsavedConfirm = Boolean(options?.skipUnsavedConfirm);
    if (electronAPI?.createProject) {
      try {
        const templateId = String(options?.templateId || 'default').trim() || 'default';
        const targetDir = String(options?.targetDir || '').trim();
        if (!targetDir) {
          setStatus('New Project cancelled (no folder selected)');
          return;
        }
        const result = await electronAPI.createProject({ templateId, targetDir });
        await applyBackendProject(result);
        const gitInit = result?.gitInit;
        if (gitInit?.ok) {
          setStatus(`New project initialized in folder: ${result.rootPath} (Git initialized)`);
        } else if (gitInit?.reason === 'git-unavailable') {
          setStatus(`New project initialized in folder: ${result.rootPath} (Git not found; repo init skipped)`);
        } else if (gitInit?.attempted) {
          setStatus(`New project initialized in folder: ${result.rootPath} (Git init failed; project still created)`);
        } else {
          setStatus(`New project initialized in folder: ${result.rootPath}`);
        }
      } catch (error) {
        if (error?.message === 'USER_CANCEL') {
          setStatus('New Project cancelled');
        } else {
          console.error('Failed to create project via Electron backend', error);
          setStatus(`New Project failed: ${error?.message || 'unknown error'}`);
        }
      }
      return;
    }

    if (!supportsDirectoryPicker) {
      setStatus('New Project requires a Chromium browser with File System Access API.');
      return;
    }

    if (!skipUnsavedConfirm && getUnsavedCount() > 0 && !confirm('Discard unsaved changes and create a new project?')) {
      setStatus('New Project cancelled');
      return;
    }

    let projectDirHandle;
    try {
      projectDirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: PROJECT_DIR_PICKER_ID });
    } catch (_error) {
      setStatus('New Project cancelled (no folder selected)');
      return;
    }

    const requestedName = projectDirHandle.name || 'MyProject';
    const sanitized = sanitizeFolderName(requestedName);
    setStatus('Preparing project folder...');

    try {
      const hasExisting = await directoryHasEntries(projectDirHandle);
      if (hasExisting && !confirm('Selected folder is not empty. Overwrite template files?')) {
        setStatus('New Project cancelled');
        return;
      }

      await copyTemplateToDirectory(projectDirHandle);
    } catch (error) {
      console.error('Failed to prepare new project directory', error);
      setStatus(`New Project failed: ${error.message || 'unknown error'}`);
      return;
    }

    const payload = buildBlankProjectPayload(requestedName.trim());
    const fileName = 'angel.json';

    try {
      const fileHandle = await projectDirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(payload, null, 2));
      await writable.close();

      applyProjectData(payload, fileName);
      for (const n of nodes) n.dirty = false;

      state.projectName = requestedName.trim();
      state.lastSaveFileName = fileName;
      state.currentProjectFileHandle = fileHandle;
      state.currentProjectDirHandle = projectDirHandle;
      state.revision = 1;

      collapsedFileTreePaths.clear();
      await refreshProjectFileTree(false);
      if (!isCliBackendActive()) await loadAgentMemoriesForActiveProject({ reason: 'new-project' });

      setStatus(`New project initialized in folder: ${projectDirHandle.name || sanitized}`);
    } catch (error) {
      console.error('Failed to write initial project file', error);
      setStatus(`New Project failed when writing angel.json: ${error.message || 'unknown error'}`);
    }
  }

  async function runOpenProject(options = {}) {
    const skipUnsavedConfirm = Boolean(options?.skipUnsavedConfirm);
    if (!skipUnsavedConfirm && getUnsavedCount() > 0 && !confirm('You have unsaved changes. Continue opening another project?')) {
      setStatus('Open cancelled');
      return;
    }

    if (electronAPI?.openProjectFolder) {
      try {
        const result = await electronAPI.openProjectFolder(state.projectRootPath || '');
        await applyBackendProject(result);
      } catch (error) {
        if (error?.message === 'USER_CANCEL') {
          setStatus('Open cancelled');
        } else {
          console.error('Open failed via Electron backend', error);
          setStatus(`Open failed: ${error?.message || 'unknown error'}`);
        }
      }
      return;
    }

    if (supportsDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: PROJECT_DIR_PICKER_ID });
        if (!dirHandle) {
          setStatus('Open cancelled');
          return;
        }

        const loaded = await loadProjectFromDirectory(dirHandle);
        if (!loaded) {
          resetProjectFolderAssociation('Selected folder is missing angel.json.');
        }
        return;
      } catch (error) {
        if (error?.name === 'AbortError') {
          setStatus('Open cancelled');
        } else {
          console.error('Open failed', error);
          setStatus(`Open failed: ${error.message || 'unknown error'}`);
        }
        return;
      }
    }

    projectFileInput.value = '';
    projectFileInput.click();
  }

  async function loadProjectFile(fileHandleOrFile) {
    let fileHandle = null;
    let file;
    if (fileHandleOrFile && typeof fileHandleOrFile.getFile === 'function') {
      fileHandle = fileHandleOrFile;
      file = await fileHandle.getFile();
    } else {
      file = fileHandleOrFile;
    }

    const text = await file.text();
    const payload = JSON.parse(text);
    applyProjectData(payload, file.name || 'angel.json');
    for (const n of nodes) n.dirty = false;

    state.currentProjectFileHandle = fileHandle;
    state.lastSaveFileName = file.name || state.lastSaveFileName;
    state.projectName = payload.project?.name || state.projectName;
    state.angelFilePath = '';
    state.projectRootPath = '';

    if (!isCliBackendActive()) await loadAgentMemoriesForActiveProject({ reason: 'open-file' });

    setStatus(`Opened project: ${file.name || 'angel.json'}`);
  }

  async function loadProjectFromDirectory(dirHandle) {
    let angelHandle = null;
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name === 'angel.json') {
        angelHandle = entry;
        break;
      }
    }

    if (!angelHandle) {
      return false;
    }

    await loadProjectFile(angelHandle);
    state.currentProjectDirHandle = dirHandle;
    collapsedFileTreePaths.clear();
    await refreshProjectFileTree(false);
    if (!isCliBackendActive()) await loadAgentMemoriesForActiveProject({ reason: 'open-directory' });

    setStatus(`Opened folder: ${dirHandle.name}`);
    return true;
  }

  function setActiveLayerByIndex(index) {
    const order = state.projectTemplate.layers.map((v) => String(v));
    const target = order[index];
    if (!target) return;
    state.activeLayer = target;
    layerSelect.value = target;
    rebuildSidebar();
    renderRightPanel();
    render();
    setStatus(`Layer: ${target}`);
  }

  let executionFailureModalBound = false;

  function closeExecutionFailureDialog() {
    if (!executeFailModal) return;
    executeFailModal.classList.add('hidden');
    executeFailModal.setAttribute('aria-hidden', 'true');
  }

  function bindExecutionFailureDialogOnce() {
    if (executionFailureModalBound) return;
    executionFailureModalBound = true;

    [executeFailClose].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => closeExecutionFailureDialog());
    });

    executeFailModal?.addEventListener('click', (evt) => {
      const target = evt?.target;
      if (target && target.dataset && target.dataset.closeExecuteFail) {
        closeExecutionFailureDialog();
      }
    });
  }

  function showExecutionFailureDialog(title, detail, options = {}) {
    const safeTitle = String(title || 'Execute failed').trim();
    const safeDetail = String(detail || '').trim();
    const compact = Boolean(options.compact);

    if (executeFailModal && executeFailMessage && executeFailDetail) {
      bindExecutionFailureDialogOnce();
      executeFailMessage.textContent = safeTitle || 'Execute failed';
      if (compact || !safeDetail) {
        executeFailDetail.textContent = '';
        executeFailDetail.classList.add('hidden');
      } else {
        executeFailDetail.textContent = safeDetail;
        executeFailDetail.classList.remove('hidden');
      }
      executeFailModal.classList.remove('hidden');
      executeFailModal.setAttribute('aria-hidden', 'false');
      return;
    }

    const message = safeDetail ? `${safeTitle}\n\n${safeDetail}` : safeTitle;
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message);
    }
  }

  // Official download page for the C++ build toolchain. CMake/Ninja ship with the app, so this is
  // the one dependency a user may still need to install themselves before compiling. The modal
  // shows this URL as plain text; this constant is only the fallback-alert copy.
  const BUILD_TOOLS_URL = 'https://visualstudio.microsoft.com/downloads/';
  let buildToolsModalBound = false;

  function closeBuildToolsModal() {
    if (!buildToolsModal) return;
    buildToolsModal.classList.add('hidden');
    buildToolsModal.setAttribute('aria-hidden', 'true');
  }

  function bindBuildToolsModalOnce() {
    if (buildToolsModalBound) return;
    buildToolsModalBound = true;

    buildToolsClose?.addEventListener('click', () => closeBuildToolsModal());

    buildToolsModal?.addEventListener('click', (evt) => {
      const target = evt?.target;
      if (target && target.dataset && target.dataset.closeBuildTools) {
        closeBuildToolsModal();
      }
    });

    buildToolsRecheck?.addEventListener('click', async () => {
      if (!electronAPI?.checkBuildTools) return;
      const prereq = await electronAPI.checkBuildTools().catch(() => null);
      if (prereq?.msvc?.ok) {
        closeBuildToolsModal();
        setStatus('Build tools detected — click Compile to continue.');
      } else {
        setStatus('Build tools still not detected. Finish installation, then re-check.');
      }
    });
  }

  function showBuildToolsModal() {
    if (buildToolsModal) {
      bindBuildToolsModalOnce();
      buildToolsModal.classList.remove('hidden');
      buildToolsModal.setAttribute('aria-hidden', 'false');
      return;
    }
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`Build Tools for Visual Studio 2026 (Desktop development with C++) is required to compile.\nDownload: ${BUILD_TOOLS_URL}`);
    }
  }

  function isLikelyMissingExecutableFailure(mode, code, stderrText, stdoutText) {
    if (!String(mode || '').startsWith('run')) return false;
    const text = `${stderrText || ''}\n${stdoutText || ''}`;
    if (/GAME_EXE_NOT_FOUND/i.test(text)) return true;
    const hasMissingToken = /(enoent|not found|cannot find|can't find|could not find|not recognized as an internal|系统找不到|找不到|无法找到)/i.test(text);
    const hasExeToken = /(\.exe\b|game\.exe\b|executable)/i.test(text);
    return Number(code) === 9009 || (hasMissingToken && hasExeToken);
  }

  async function runExecution(mode) {
    if (state.buildRunning) return;
    if (!electronAPI?.executeProject) {
      setStatus('Execute is only available in desktop app mode.');
      return;
    }
    if (!state.projectRootPath) {
      setStatus('Please create/open a project folder first.');
      return;
    }

    // Gate builds on the MSVC C++ toolchain (the only externally-installed dependency): if it's
    // missing, show the guidance modal instead of letting the build run and fail with a raw error.
    // Only compile/export actually invoke cmake+cl; run* modes just launch an already-built exe.
    if ((mode === 'compile' || mode === 'export-release') && electronAPI?.checkBuildTools) {
      const prereq = await electronAPI.checkBuildTools().catch(() => null);
      if (prereq?.msvc && !prereq.msvc.ok) {
        showBuildToolsModal();
        return;
      }
    }

    const labelMap = {
      compile: 'Compile Project',
      'export-release': 'Export Release',
      run: 'Run Project',
      'run-debug': 'Run Project (Debug)',
      'run-test': 'Run Test',
    };

    let testName = '';
    let effectiveMode = mode;
    let record = false;
    if (mode === 'run-test') {
      const picked = typeof requestRunTestOptions === 'function'
        ? await requestRunTestOptions()
        : { testName: await requestRunTestName(), debug: false };
      testName = String(picked?.testName || '').trim();
      if (!testName) {
        setStatus('Run Test cancelled');
        return;
      }
      if (picked?.debug) effectiveMode = 'run-debug-test';
      record = Boolean(picked?.record);
    }
    const label = labelMap[effectiveMode] || (effectiveMode === 'run-debug-test' ? 'Run Test (Debug)' : 'Execute');

    state.buildRunning = true;
    updateTopbar();
    setStatus(`${label}...`);

    try {
      const result = await electronAPI.executeProject({
        rootPath: state.projectRootPath,
        mode: effectiveMode,
        testName,
        ...(record ? { record: true } : {}),
      });

      const out = String(result?.stdout || '').trim();
      const err = String(result?.stderr || '').trim();
      const tail = (err || out).split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
      const wasCanceled = Boolean(result?.canceled);

      if (wasCanceled) {
        setStatus(`${label} cancelled`);
      } else if (result?.ok) {
        setStatus(tail ? `${label} done: ${tail}` : `${label} done`);
      } else {
        const missingExecutable = isLikelyMissingExecutableFailure(mode, result?.code, err, out);
        if (missingExecutable) {
          const concise = 'Executable not found. Please compile first.';
          setStatus(`${label} failed: ${concise}`);
          showExecutionFailureDialog(concise, '', { compact: true });
        } else {
          const failText = tail ? `${label} failed: ${tail}` : `${label} failed (code ${result?.code ?? -1})`;
          setStatus(failText);
          const detail = [
            `Mode: ${mode}`,
            `Code: ${result?.code ?? -1}`,
            err ? `stderr:\n${err}` : '',
            out ? `stdout:\n${out}` : '',
          ].filter(Boolean).join('\n\n');
          showExecutionFailureDialog(failText, detail);
        }
      }
    } catch (error) {
      const detail = error?.message || 'unknown error';
      if (isLikelyMissingExecutableFailure(mode, -1, detail, '')) {
        const concise = 'Executable not found. Please compile first.';
        setStatus(`${label} failed: ${concise}`);
        showExecutionFailureDialog(concise, '', { compact: true });
      } else {
        setStatus(`${label} failed: ${detail}`);
        showExecutionFailureDialog(`${label} failed`, String(detail));
      }
    } finally {
      state.buildRunning = false;
      updateTopbar();
    }
  }

  function toggleRightPanel() {
    state.rightPanelCollapsed = !state.rightPanelCollapsed;
    rightPanel.classList.toggle('open', !state.rightPanelCollapsed);
    applyAppGridColumns();
    setStatus(state.rightPanelCollapsed ? 'Right panel closed' : 'Right panel opened');
  }

  function toggleProjectBrowser() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    syncSidebarCollapsedState();
    setStatus(state.sidebarCollapsed ? 'File browser hidden' : 'File browser shown');
  }

  function toggleAgentBar() {
    topbarRight.classList.toggle('hidden');
    setStatus(topbarRight.classList.contains('hidden') ? 'Agent Bar hidden' : 'Agent Bar shown');
  }

  return {
    runSave,
    applyProjectData,
    runNewProject,
    runOpenProject,
    loadProjectFile,
    loadProjectFromDirectory,
    setActiveLayerByIndex,
    runExecution,
    toggleRightPanel,
    toggleProjectBrowser,
    toggleAgentBar,
  };
}
