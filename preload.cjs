const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openProjectFolder: (hintPath) => ipcRenderer.invoke('project:openFolder', hintPath),
  createProject: (payload) => ipcRenderer.invoke('project:create', payload),
  chooseProjectFolder: () => ipcRenderer.invoke('project:chooseFolder'),
  saveProject: (payload) => ipcRenderer.invoke('project:save', payload),
  saveProjectAs: (payload) => ipcRenderer.invoke('project:saveAs', payload),
  listFiles: (rootPath) => ipcRenderer.invoke('project:listFiles', rootPath),
  openFileExternally: (filePath) => ipcRenderer.invoke('project:openFile', filePath),
  openFolderExternally: (folderPath) => ipcRenderer.invoke('project:openFolderExternally', folderPath),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  renameProjectPath: (payload) => ipcRenderer.invoke('project:renamePath', payload),
  deleteProjectPath: (payload) => ipcRenderer.invoke('project:deletePath', payload),
  saveChatExport: (payload) => ipcRenderer.invoke('project:saveChatExport', payload),
  toolRead: (payload) => ipcRenderer.invoke('project:toolRead', payload),
  toolGrep: (payload) => ipcRenderer.invoke('project:toolGrep', payload),
  toolWrite: (payload) => ipcRenderer.invoke('project:toolWrite', payload),
  toolWriteBinary: (payload) => ipcRenderer.invoke('project:toolWriteBinary', payload),
  toolDelete: (payload) => ipcRenderer.invoke('project:toolDelete', payload),
  readBinaryAsDataUrl: (payload) => ipcRenderer.invoke('project:readBinaryAsDataUrl', payload),
  toolReadDocx: (payload) => ipcRenderer.invoke('project:toolReadDocx', payload),
  toolEdit: (payload) => ipcRenderer.invoke('project:toolEdit', payload),
  runProjectCommand: (payload) => ipcRenderer.invoke('project:runCommand', payload),
  executeProject: (payload) => ipcRenderer.invoke('project:execute', payload),
  checkBuildTools: () => ipcRenderer.invoke('project:checkBuildTools'),
  loadAgentModelSettings: () => ipcRenderer.invoke('settings:loadAgentModel'),
  saveAgentModelSettings: (payload) => ipcRenderer.invoke('settings:saveAgentModel', payload),
  openAIOAuthAuthorize: (payload) => ipcRenderer.invoke('settings:openAIOAuthAuthorize', payload),
  refreshOpenAIOAuthToken: (payload) => ipcRenderer.invoke('settings:refreshOpenAIOAuthToken', payload),
  listProviderModels: (payload) => ipcRenderer.invoke('settings:listProviderModels', payload),
  // CLI sub-agent line. start/cancel/detect are request/response; onEvent is the
  // first PUSH channel (main streams one message per stdout line during a run).
  cliAgent: {
    start: (payload) => ipcRenderer.invoke('cliAgent:start', payload),
    cancel: (payload) => ipcRenderer.invoke('cliAgent:cancel', payload),
    detect: (payload) => ipcRenderer.invoke('cliAgent:detect', payload),
    // CLI auth (sign in / status / sign out). Login streams over onEvent by runId.
    authStatus: (payload) => ipcRenderer.invoke('cliAgent:authStatus', payload),
    authLogin: (payload) => ipcRenderer.invoke('cliAgent:authLogin', payload),
    authLogout: (payload) => ipcRenderer.invoke('cliAgent:authLogout', payload),
    // Subscription 5h/weekly usage windows for the active CLI line (Claude OAuth /
    // Codex ChatGPT). Reads the local cred file + GETs the provider's private usage
    // endpoint; resolves { ok:false } when unavailable (degrade gracefully).
    usageWindows: (payload) => ipcRenderer.invoke('cliAgent:usageWindows', payload),
    // Returns an unsubscribe function. Caller filters by event.runId.
    onEvent: (callback) => {
      const listener = (_event, data) => { try { callback(data); } catch (_) { /* swallow */ } };
      ipcRenderer.on('cliAgent:event', listener);
      return () => ipcRenderer.removeListener('cliAgent:event', listener);
    },
  },
  // Mindmap MCP bridge (Phase 4b): main relays a sub-agent's graph tool call here;
  // the renderer runs it and we reply. First renderer→main *reply* channel.
  angelMcp: {
    onInvoke: (handler) => {
      const listener = async (_event, payload) => {
        const reqId = payload?.reqId;
        try {
          const result = await handler(payload);
          ipcRenderer.send('angelMcp:result', { reqId, ok: true, result });
        } catch (e) {
          ipcRenderer.send('angelMcp:result', { reqId, ok: false, error: e?.message || String(e) });
        }
      };
      ipcRenderer.on('angelMcp:invoke', listener);
      return () => ipcRenderer.removeListener('angelMcp:invoke', listener);
    },
  },
});
