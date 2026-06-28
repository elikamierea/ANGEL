const { app, BrowserWindow, dialog, ipcMain, shell, clipboard } = require('electron');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TEMPLATE_DIR = path.join(__dirname, 'new_project_template');

// CMake is shipped inside the app bundle (no-asar, so __dirname is the repo root in dev and
// resources/app when packaged). buildToolEnv() prepends its bin/ to PATH for build child
// processes so bare `cmake` calls resolve to the bundled copy; if the bundle is absent we fall
// back to whatever cmake is on the user's PATH, leaving the prior behavior unchanged.
const BUNDLED_CMAKE_BIN = path.join(__dirname, 'tools', 'cmake', 'bin');

function buildToolEnv() {
  const env = { ...process.env };
  if (fsSync.existsSync(BUNDLED_CMAKE_BIN)) {
    // Windows env var names are case-insensitive and usually stored as "Path". Mutate the existing
    // key in place (whatever its casing) instead of adding a second "PATH" key, which would leave
    // two conflicting entries in the child's environment block.
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
    env[pathKey] = `${BUNDLED_CMAKE_BIN}${path.delimiter}${env[pathKey] || ''}`;
  }
  return env;
}
const AGENT_SETTINGS_FILE = 'agent-model-settings.json';
const OPEN_DIALOG_STATE_FILE = 'open-dialog-state.json';

const OPENAI_OAUTH_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const OPENAI_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const OPENAI_OAUTH_SCOPE = 'openid profile email offline_access';
const OPENAI_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_OAUTH_REDIRECT_HOST = 'localhost';
const OPENAI_OAUTH_REDIRECT_PORT = 1455;
const OPENAI_OAUTH_REDIRECT_PATH = '/auth/callback';
const PROJECT_TEMPLATE_CATALOG_PATH = path.join(__dirname, 'shared', 'project-template-catalog.json');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'favicon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Leave', 'Stay'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved Changes',
      message: 'You have unsaved changes. Leave this page?',
      detail: 'Your recent project or agent-session changes may not be saved.',
      noLink: true,
    });

    if (choice === 0) {
      event.preventDefault();
    }
  });

  win.loadFile(path.join(__dirname, 'gui', 'index.html'));
}

function sanitizeProjectName(input) {
  return (input || 'NewProject').trim().replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '-');
}

const DEFAULT_PROJECT_TEMPLATE = {
  id: 'default-2layer-v1',
  version: 1,
  layers: ['L0', 'L1'],
  defaultActiveLayer: 'L0',
  agents: ['programmer'],
  promptProfile: 'minimized',
};

const FALLBACK_TEMPLATE_CATALOG = {
  default: DEFAULT_PROJECT_TEMPLATE,
  'default-image': {
    id: 'default-image-2layer-v1',
    version: 1,
    layers: ['L0', 'L1'],
    defaultActiveLayer: 'L0',
    agents: ['programmer', 'resource-provider'],
    promptProfile: 'minimized-image',
  },
  extended: {
    id: 'extended-4layer-v1',
    version: 1,
    layers: ['L0', 'L1', 'L2', 'L3'],
    defaultActiveLayer: 'L1',
    agents: ['designer', 'orchestrator', 'programmer'],
    promptProfile: 'full',
  },
  'extended-image': {
    id: 'extended-image-4layer-v1',
    version: 1,
    layers: ['L0', 'L1', 'L2', 'L3'],
    defaultActiveLayer: 'L1',
    agents: ['designer', 'orchestrator', 'programmer', 'resource-provider'],
    promptProfile: 'full-image',
  },
};

function normalizeProjectTemplateOrThrow(template) {
  const source = template && typeof template === 'object' ? template : DEFAULT_PROJECT_TEMPLATE;
  const layers = Array.isArray(source.layers) ? source.layers.map((v) => String(v)).filter(Boolean) : [];
  const agents = Array.isArray(source.agents) ? source.agents.map((v) => String(v)).filter(Boolean) : [];
  const defaultActiveLayer = String(source.defaultActiveLayer || '');
  if (layers.length === 0) throw new Error('Invalid template.layers: expected non-empty array');
  if (agents.length === 0) throw new Error('Invalid template.agents: expected non-empty array');
  if (!layers.includes(defaultActiveLayer)) throw new Error('Invalid template.defaultActiveLayer: must be in template.layers');
  const promptProfile = String(source.promptProfile || '').trim();
  return {
    id: String(source.id || '').trim() || DEFAULT_PROJECT_TEMPLATE.id,
    version: Number.isFinite(Number(source.version)) ? Number(source.version) : DEFAULT_PROJECT_TEMPLATE.version,
    layers,
    defaultActiveLayer,
    agents,
    ...(promptProfile ? { promptProfile } : {}),
  };
}

async function loadProjectTemplateCatalog() {
  try {
    const raw = await fs.readFile(PROJECT_TEMPLATE_CATALOG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const templates = parsed && typeof parsed === 'object' ? parsed.templates : null;
    if (!templates || typeof templates !== 'object') throw new Error('templates object missing');
    const normalized = {};
    for (const [templateId, template] of Object.entries(templates)) {
      normalized[String(templateId)] = normalizeProjectTemplateOrThrow(template);
    }
    return normalized;
  } catch (error) {
    console.warn('[project:create] template catalog load failed, using fallback catalog:', error?.message || error);
    return FALLBACK_TEMPLATE_CATALOG;
  }
}

function buildBlankProjectPayload(projectName, template = null) {
  const normalizedTemplate = normalizeProjectTemplateOrThrow(template);

  return {
    format: 'angel.project',
    version: 1,
    savedAt: new Date().toISOString(),
    project: { name: projectName || 'untitled', template: normalizedTemplate },
    graph: {
      nodes: [],
      edges: [],
      containmentRelations: [],
      mirrorRelations: [],
    },
    ui: {
      activeLayer: normalizedTemplate.defaultActiveLayer || 'L0',
      zoom: 1,
      panX: 0,
      panY: 0,
      rightPanelWidth: 340,
      sidebarCollapsed: false,
      leftPanelWidth: 280,
    },
    runtime: {
      revision: 1,
    },
  };
}

async function copyTemplateDirectory(targetDir) {
  await fs.cp(TEMPLATE_DIR, targetDir, { recursive: true });
}

async function tryInitGitRepository(targetDir) {
  const gitCheck = await runChildProcess('git', ['--version'], targetDir);
  if (!gitCheck?.ok) {
    return {
      attempted: true,
      ok: false,
      skipped: true,
      reason: 'git-unavailable',
      stdout: String(gitCheck?.stdout || ''),
      stderr: String(gitCheck?.stderr || ''),
      code: Number.isFinite(gitCheck?.code) ? gitCheck.code : -1,
    };
  }

  const initResult = await runChildProcess('git', ['init'], targetDir);
  if (!initResult?.ok) {
    return {
      attempted: true,
      ok: false,
      skipped: false,
      reason: 'git-init-failed',
      stdout: String(initResult?.stdout || ''),
      stderr: String(initResult?.stderr || ''),
      code: Number.isFinite(initResult?.code) ? initResult.code : -1,
    };
  }

  const branchResult = await runChildProcess('git', ['branch', '-M', 'main'], targetDir);
  return {
    attempted: true,
    ok: Boolean(branchResult?.ok),
    skipped: false,
    reason: branchResult?.ok ? 'git-initialized' : 'git-branch-failed',
    stdout: [String(initResult?.stdout || ''), String(branchResult?.stdout || '')].filter(Boolean).join('\n'),
    stderr: [String(initResult?.stderr || ''), String(branchResult?.stderr || '')].filter(Boolean).join('\n'),
    code: Number.isFinite(branchResult?.code) ? branchResult.code : 0,
  };
}

async function ensureDirectoryEmpty(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    if (files.length > 0) {
      throw new Error('TARGET_NOT_EMPTY');
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dirPath, { recursive: true });
      return;
    }
    if (error.message === 'TARGET_NOT_EMPTY') throw error;
    // Directory exists but readdir failed for other reasons
    throw error;
  }
}

async function createAngelFile(dirPath, projectName) {
  const angelPath = path.join(dirPath, 'angel.json');
  const content = JSON.stringify(buildBlankProjectPayload(projectName), null, 2);
  await fs.writeFile(angelPath, content, 'utf-8');
  return { angelPath, angelContent: content };
}

async function findAngelFile(dirPath) {
  const entries = await fs.readdir(dirPath);
  const candidates = entries.filter((name) => name === 'angel.json');
  if (candidates.length === 0) {
    throw new Error('NO_ANGEL_FILE');
  }
  const angelPath = path.join(dirPath, 'angel.json');
  const angelContent = await fs.readFile(angelPath, 'utf-8');
  return { angelPath, angelContent };
}

async function buildFileTree(dirPath, rootPath = dirPath) {
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });
  dirents.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) {
      return a.isDirectory() ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const entries = [];
  for (const dirent of dirents) {
    const fullPath = path.join(dirPath, dirent.name);
    const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/') || dirent.name;
    if (dirent.isDirectory()) {
      entries.push({
        type: 'directory',
        name: dirent.name,
        path: relativePath,
        fullPath,
        children: await buildFileTree(fullPath, rootPath),
      });
    } else {
      entries.push({
        type: 'file',
        name: dirent.name,
        path: relativePath,
        fullPath,
      });
    }
  }
  return entries;
}

function getRoamingSettingsPath(fileName = AGENT_SETTINGS_FILE) {
  const roamingRoot = app.getPath('appData');
  const appFolder = path.join(roamingRoot, 'ANGEL');
  return {
    dir: appFolder,
    file: path.join(appFolder, fileName),
  };
}

async function loadOpenDialogState() {
  const target = getRoamingSettingsPath(OPEN_DIALOG_STATE_FILE);
  try {
    const raw = await fs.readFile(target.file, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    return null;
  }
}

async function saveOpenDialogState(payload) {
  const target = getRoamingSettingsPath(OPEN_DIALOG_STATE_FILE);
  await fs.mkdir(target.dir, { recursive: true });
  await fs.writeFile(target.file, JSON.stringify(payload ?? {}, null, 2), 'utf-8');
}

function base64Url(inputBuffer) {
  return Buffer.from(inputBuffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makePkcePair() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function startOAuthCallbackServer(expectedState, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    let done = false;
    let timer = null;
    let codeResolve;
    let codeReject;
    const waitForCode = new Promise((res, rej) => {
      codeResolve = res;
      codeReject = rej;
    });

    const finishCode = (ok, payload) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { server.close(); } catch (_) {}
      if (ok) codeResolve(payload);
      else codeReject(payload);
    };

    server.on('request', (req, res) => {
      try {
        const url = new URL(req.url, `http://${OPENAI_OAUTH_REDIRECT_HOST}:${OPENAI_OAUTH_REDIRECT_PORT}`);
        const normalizedPath = String(url.pathname || '').replace(/\/+$/g, '') || '/';
        const expectedPath = String(OPENAI_OAUTH_REDIRECT_PATH || '').replace(/\/+$/g, '') || '/';

        console.log('[oauth-callback] incoming', {
          method: req.method,
          pathname: url.pathname,
          normalizedPath,
          expectedPath,
          hasCode: Boolean(url.searchParams.get('code')),
          statePreview: String(url.searchParams.get('state') || '').slice(0, 8),
          expectedStatePreview: String(expectedState || '').slice(0, 8),
        });

        if (normalizedPath !== expectedPath) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }

        const code = url.searchParams.get('code') || '';
        const state = url.searchParams.get('state') || '';
        if (!code || state !== expectedState) {
          res.statusCode = 400;
          res.end(`Invalid OAuth callback. code=${Boolean(code)} stateMatch=${state === expectedState}. You can close this window.`);
          finishCode(false, new Error(`OAuth callback validation failed (code=${Boolean(code)}, stateMatch=${state === expectedState})`));
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<html><body><h3>OpenAI OAuth connected.</h3><p>You can close this window and return to ANGEL.</p></body></html>');
        finishCode(true, { code });
      } catch (error) {
        finishCode(false, error);
      }
    });

    server.on('error', (error) => {
      if (!done) {
        reject(error);
      } else {
        finishCode(false, error);
      }
    });

    server.listen(OPENAI_OAUTH_REDIRECT_PORT, OPENAI_OAUTH_REDIRECT_HOST, () => {
      timer = setTimeout(() => {
        finishCode(false, new Error('OAuth authorization timed out.'));
      }, timeoutMs);

      resolve({
        redirectUri: `http://${OPENAI_OAUTH_REDIRECT_HOST}:${OPENAI_OAUTH_REDIRECT_PORT}${OPENAI_OAUTH_REDIRECT_PATH}`,
        waitForCode,
      });
    });
  });
}

function resolveOpenAIOAuthClientId(payloadClientId) {
  const fromPayload = String(payloadClientId || '').trim();
  if (fromPayload) return fromPayload;
  if (OPENAI_OAUTH_CLIENT_ID) return OPENAI_OAUTH_CLIENT_ID;
  throw new Error('OPENAI_OAUTH_CLIENT_ID is not configured on host.');
}

async function exchangeOpenAIToken(params) {
  const body = new URLSearchParams(params);
  const response = await fetch(OPENAI_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const raw = await response.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    throw new Error(`OAuth token exchange failed (${response.status}): ${JSON.stringify(data)}`);
  }

  const expiresIn = Number(data?.expires_in || 0) || 0;
  return {
    accessToken: String(data?.access_token || ''),
    refreshToken: String(data?.refresh_token || ''),
    expiresIn,
    expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0,
    raw: data,
  };
}

ipcMain.handle('settings:loadAgentModel', async () => {
  const target = getRoamingSettingsPath();
  try {
    const raw = await fs.readFile(target.file, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
});

ipcMain.handle('settings:saveAgentModel', async (_event, payload) => {
  const target = getRoamingSettingsPath();
  await fs.mkdir(target.dir, { recursive: true });
  await fs.writeFile(target.file, JSON.stringify(payload ?? {}, null, 2), 'utf-8');
  return { ok: true, path: target.file };
});

ipcMain.handle('settings:openAIOAuthAuthorize', async (_event, payload) => {
  const clientId = resolveOpenAIOAuthClientId(payload?.clientId);

  const state = base64Url(crypto.randomBytes(16));
  const { verifier, challenge } = makePkcePair();
  const callback = await startOAuthCallbackServer(state);

  const authUrl = new URL(OPENAI_OAUTH_AUTHORIZE_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callback.redirectUri);
  authUrl.searchParams.set('scope', OPENAI_OAUTH_SCOPE);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('codex_cli_simplified_flow', 'true');
  authUrl.searchParams.set('originator', 'pi');

  console.log('[oauth-authorize] opening', {
    redirectUri: callback.redirectUri,
    scope: OPENAI_OAUTH_SCOPE,
    statePreview: String(state).slice(0, 8),
  });
  await shell.openExternal(authUrl.toString());

  const codeResult = await callback.waitForCode;
  const token = await exchangeOpenAIToken({
    grant_type: 'authorization_code',
    code: codeResult.code,
    client_id: clientId,
    redirect_uri: callback.redirectUri,
    code_verifier: verifier,
  });

  return {
    ok: true,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    expiresIn: token.expiresIn,
  };
});

ipcMain.handle('settings:refreshOpenAIOAuthToken', async (_event, payload) => {
  const clientId = resolveOpenAIOAuthClientId(payload?.clientId);
  const refreshToken = String(payload?.refreshToken || '').trim();
  if (!refreshToken) throw new Error('MISSING_REFRESH_TOKEN');

  const token = await exchangeOpenAIToken({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  });

  return {
    ok: true,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken || refreshToken,
    expiresAt: token.expiresAt,
    expiresIn: token.expiresIn,
  };
});

// "List models" endpoints per provider. OpenAI-compatible providers (and xAI)
// expose GET /models returning { data: [{ id }] }; Anthropic uses the same shape
// behind x-api-key; Gemini uses GET /v1beta/models?key=... returning
// { models: [{ name: "models/..." }] }.
const PROVIDER_MODEL_LIST_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/models',
  xai: 'https://api.x.ai/v1/models',
  deepseek: 'https://api.deepseek.com/models',
  moonshot: 'https://api.moonshot.ai/v1/models',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3/models',
  zai: 'https://api.z.ai/api/paas/v4/models',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
};

// Substrings that mark a model id as non-conversational (embeddings, audio,
// image/video gen, moderation, legacy completion engines, etc). Denylist rather
// than allowlist so unknown future chat models still pass through. Multimodal
// chat models ("vision", "search") are intentionally NOT blocked.
const NON_CHAT_MODEL_MARKERS = [
  'embed', 'rerank',
  'tts', 'whisper', 'transcribe', 'audio', 'realtime', 'speech', 'voice', 'asr',
  'paraformer', 'cosyvoice', 'sambert',
  'image', 'dall-e', 'dalle', 'imagen', 'cogview', 'stable-diffusion', 'flux', 'wanx',
  'video', 'cogvideo', 'veo', 'sora',
  'moderation', 'guard', 'ocr', 'aqa',
  'davinci', 'babbage', 'curie', '-instruct-davinci',
];

function isConversationalModelId(id) {
  const lower = String(id || '').toLowerCase();
  if (!lower) return false;
  return !NON_CHAT_MODEL_MARKERS.some((marker) => lower.includes(marker));
}

function parseProviderModelIds(data) {
  let ids = [];
  if (data && typeof data === 'object') {
    // Gemini: { models: [{ name: "models/gemini-..." }] }
    if (Array.isArray(data.models)) {
      ids = data.models.map((m) => String(m?.name || m?.id || '').replace(/^models\//, '').trim());
    } else if (Array.isArray(data.data)) {
      // OpenAI-compatible / Anthropic: { data: [{ id }] }
      ids = data.data.map((m) => String(m?.id || '').trim());
    }
  }
  return ids.filter(Boolean).filter(isConversationalModelId);
}

// Fetches the live model list for a provider so the Agent Model dialog can merge
// it on top of the static catalog. Runs in main to avoid renderer CORS. Any
// failure returns { ok:false } so the renderer silently keeps the static list.
ipcMain.handle('settings:listProviderModels', async (_event, payload) => {
  const providerId = String(payload?.providerId || '').trim();
  const apiKey = String(payload?.apiKey || '').trim();
  const endpoint = PROVIDER_MODEL_LIST_ENDPOINTS[providerId];
  if (!endpoint) return { ok: false, error: `UNSUPPORTED_PROVIDER:${providerId}` };
  if (!apiKey) return { ok: false, error: 'MISSING_API_KEY' };

  try {
    let url = endpoint;
    const headers = { 'Content-Type': 'application/json' };
    if (providerId === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (providerId === 'google') {
      url = `${endpoint}?key=${encodeURIComponent(apiKey)}&pageSize=1000`;
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { method: 'GET', headers });
    const raw = await response.text();
    if (!response.ok) {
      return { ok: false, error: `HTTP_${response.status}`, detail: String(raw).slice(0, 500) };
    }
    let data = null;
    try { data = JSON.parse(raw); } catch { data = null; }
    return { ok: true, models: parseProviderModelIds(data) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('project:openFolder', async (_event, hintPath) => {
  const opts = {
    properties: ['openDirectory'],
  };

  if (typeof hintPath === 'string' && hintPath.trim()) {
    const normalized = path.resolve(hintPath.trim());
    opts.defaultPath = path.dirname(normalized);
  } else {
    const persisted = await loadOpenDialogState();
    if (persisted?.defaultPath && typeof persisted.defaultPath === 'string') {
      opts.defaultPath = persisted.defaultPath;
    }
  }

  const result = await dialog.showOpenDialog(opts);
  if (result.canceled || result.filePaths.length === 0) {
    throw new Error('USER_CANCEL');
  }

  const rootPath = result.filePaths[0];
  await saveOpenDialogState({ defaultPath: path.dirname(rootPath) });

  const angel = await findAngelFile(rootPath);
  const fileTree = await buildFileTree(rootPath, rootPath);
  return {
    rootPath,
    angelPath: angel.angelPath,
    angelContent: angel.angelContent,
    fileTree,
  };
});

ipcMain.handle('project:chooseFolder', async () => {
  // Share the "open project" default path so project create/open form one
  // file-lineage that is kept separate from the resource (sprite/font/audio)
  // file pickers, which the OS/renderer remember independently.
  const opts = {
    properties: ['openDirectory', 'createDirectory'],
    message: 'Select project folder for the new project',
  };

  const persisted = await loadOpenDialogState();
  if (persisted?.defaultPath && typeof persisted.defaultPath === 'string') {
    opts.defaultPath = persisted.defaultPath;
  }

  const targetDialog = await dialog.showOpenDialog(opts);

  if (targetDialog.canceled || targetDialog.filePaths.length === 0) {
    throw new Error('USER_CANCEL');
  }

  const targetDir = targetDialog.filePaths[0];
  await saveOpenDialogState({ defaultPath: path.dirname(targetDir) });
  return { targetDir };
});

ipcMain.handle('project:create', async (_event, payload) => {
  const templateCatalog = await loadProjectTemplateCatalog();

  const targetDir = String(payload?.targetDir || '').trim();
  if (!targetDir) throw new Error('MISSING_TARGET_DIR');
  const requestedName = typeof payload?.projectName === 'string' ? payload.projectName.trim() : '';
  const templateId = String(payload?.templateId || 'default').trim();
  const selectedTemplate = templateCatalog[templateId];
  if (!selectedTemplate) throw new Error(`UNKNOWN_TEMPLATE: ${templateId}`);

  const projectName = sanitizeProjectName(requestedName || path.basename(targetDir));

  try {
    await ensureDirectoryEmpty(targetDir);
  } catch (error) {
    if (error.message === 'TARGET_NOT_EMPTY') {
      throw new Error('TARGET_NOT_EMPTY');
    }
    throw error;
  }

  await copyTemplateDirectory(targetDir);
  const angelPath = path.join(targetDir, 'angel.json');
  const angelContent = JSON.stringify(buildBlankProjectPayload(projectName, selectedTemplate), null, 2);
  await fs.writeFile(angelPath, angelContent, 'utf-8');
  const gitInit = await tryInitGitRepository(targetDir);
  const fileTree = await buildFileTree(targetDir, targetDir);

  return {
    rootPath: targetDir,
    angelPath,
    angelContent,
    fileTree,
    gitInit,
  };
});

ipcMain.handle('project:save', async (_event, payload) => {
  if (!payload || !payload.angelPath) {
    throw new Error('MISSING_PATH');
  }
  await fs.writeFile(payload.angelPath, payload.content, 'utf-8');
  return true;
});

// Derived / VCS directories that must NOT ride along into a "Save As" copy:
// build-ninja/build carry CMake cache + ninja files with hard-coded absolute
// source/build paths; runtime/dist/out are generated outputs; .git carries the
// source project's history/remotes. All of these regenerate cleanly in the new
// location, so the copy stays portable and gets its own fresh git repo.
const SAVE_AS_EXCLUDED_DIRS = new Set([
  '.git', '.angel', 'build', 'build-ninja', 'runtime', 'dist', 'out', 'node_modules',
]);

function isExcludedFromSaveAs(sourceRoot, entryPath) {
  const rel = path.relative(sourceRoot, entryPath);
  if (!rel || rel.startsWith('..')) return false;
  return rel.split(path.sep).some((segment) => SAVE_AS_EXCLUDED_DIRS.has(segment));
}

ipcMain.handle('project:saveAs', async (_event, payload) => {
  // sourceRoot is optional: when a project folder is open we clone its tree,
  // otherwise (no project open) we scaffold a fresh project from the template
  // so the in-memory graph can still be persisted somewhere on disk.
  const sourceRoot = String(payload?.sourceRoot || '').trim();
  const angelContent = typeof payload?.angelContent === 'string' ? payload.angelContent : '';
  if (!angelContent) throw new Error('MISSING_CONTENT');

  // Pick the destination folder, sharing the project open/create file lineage.
  const opts = {
    properties: ['openDirectory', 'createDirectory'],
    message: 'Select an empty folder for the project copy',
  };
  const persisted = await loadOpenDialogState();
  if (persisted?.defaultPath && typeof persisted.defaultPath === 'string') {
    opts.defaultPath = persisted.defaultPath;
  }
  const targetDialog = await dialog.showOpenDialog(opts);
  if (targetDialog.canceled || targetDialog.filePaths.length === 0) {
    throw new Error('USER_CANCEL');
  }
  const targetDir = targetDialog.filePaths[0];
  await saveOpenDialogState({ defaultPath: path.dirname(targetDir) });

  const targetResolved = path.resolve(targetDir);
  const sourceResolved = sourceRoot ? path.resolve(sourceRoot) : '';
  if (sourceResolved && (targetResolved === sourceResolved || targetResolved.startsWith(sourceResolved + path.sep))) {
    throw new Error('TARGET_INSIDE_SOURCE');
  }

  await ensureDirectoryEmpty(targetResolved);

  if (sourceResolved) {
    // Clone the open project tree, dropping the derived/VCS dirs above.
    await fs.cp(sourceResolved, targetResolved, {
      recursive: true,
      filter: (src) => !isExcludedFromSaveAs(sourceResolved, src),
    });
  } else {
    // No project open: lay down a fresh template tree, matching New Project.
    await copyTemplateDirectory(targetResolved);
  }

  // Write the current (possibly unsaved) graph as the copy's angel.json.
  const angelPath = path.join(targetResolved, 'angel.json');
  await fs.writeFile(angelPath, angelContent, 'utf-8');

  // Fresh repo for the copy, matching New Project behavior.
  const gitInit = await tryInitGitRepository(targetResolved);
  const fileTree = await buildFileTree(targetResolved, targetResolved);

  return { rootPath: targetResolved, angelPath, angelContent, fileTree, gitInit };
});

ipcMain.handle('project:listFiles', async (_event, rootPath) => {
  if (!rootPath) {
    throw new Error('MISSING_ROOT');
  }
  return buildFileTree(rootPath, rootPath);
});

ipcMain.handle('project:openFile', async (_event, filePath) => {
  if (!filePath) return false;
  await shell.openPath(filePath);
  return true;
});

ipcMain.handle('project:openFolderExternally', async (_event, folderPath) => {
  if (!folderPath) return false;
  await shell.openPath(folderPath);
  return true;
});

ipcMain.handle('clipboard:writeText', async (_event, text) => {
  clipboard.writeText(String(text == null ? '' : text));
  return true;
});

ipcMain.handle('project:renamePath', async (_event, payload) => {
  const rootPath = payload?.rootPath;
  const relativePath = payload?.path;
  const nextName = String(payload?.nextName || '').trim();
  if (!nextName) throw new Error('MISSING_NAME');
  if (/[\\/:*?"<>|]/.test(nextName) || nextName === '.' || nextName === '..') {
    throw new Error('INVALID_NAME');
  }
  const { normalized, fullPath } = resolveProjectToolPath(rootPath, relativePath);
  const nextFullPath = path.join(path.dirname(fullPath), nextName);
  const nextRelativePath = path.relative(path.resolve(rootPath), nextFullPath).replace(/\\/g, '/');
  if (!nextRelativePath || nextRelativePath.startsWith('..') || path.isAbsolute(nextRelativePath)) {
    throw new Error('PATH_OUTSIDE_ROOT');
  }
  await fs.rename(fullPath, nextFullPath);
  return { ok: true, path: normalized, nextPath: nextRelativePath, nextName };
});

ipcMain.handle('project:deletePath', async (_event, payload) => {
  const rootPath = payload?.rootPath;
  const relativePath = payload?.path;
  const { normalized, fullPath } = resolveProjectToolPath(rootPath, relativePath);
  await fs.rm(fullPath, { recursive: true, force: true });
  return { ok: true, path: normalized };
});

ipcMain.handle('project:saveChatExport', async (_event, payload) => {
  const defaultFileNameRaw = typeof payload?.defaultFileName === 'string' ? payload.defaultFileName.trim() : 'agent-chat-export.json';
  const defaultFileName = defaultFileNameRaw || 'agent-chat-export.json';
  const content = typeof payload?.content === 'string' ? payload.content : '';
  if (!content) {
    throw new Error('MISSING_CONTENT');
  }

  const saveDialog = await dialog.showSaveDialog({
    title: 'Save Agent Chat Export',
    defaultPath: defaultFileName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (saveDialog.canceled || !saveDialog.filePath) {
    throw new Error('USER_CANCEL');
  }

  await fs.writeFile(saveDialog.filePath, content, 'utf-8');
  return { filePath: saveDialog.filePath };
});

function resolveProjectToolPath(rootPath, relativePath) {
  if (!rootPath || !relativePath) {
    throw new Error('INVALID_INPUT');
  }

  const rel = String(relativePath).replace(/\\/g, '/').trim();
  if (!rel || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) {
    throw new Error('INVALID_PATH');
  }

  const normalized = path.posix.normalize(rel);
  if (normalized.startsWith('..') || normalized.includes('/../') || normalized === '..') {
    throw new Error('PATH_OUTSIDE_ROOT');
  }

  const fullPath = path.resolve(rootPath, normalized);
  const rootResolved = path.resolve(rootPath);
  const relToRoot = path.relative(rootResolved, fullPath);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    throw new Error('PATH_OUTSIDE_ROOT');
  }

  return { normalized, fullPath };
}

const DANGEROUS_COMMAND_PATTERNS = [
  { regex: /\brm\s+-r(f|)\b/i, reason: 'rm -rf style delete' },
  { regex: /\brmdir\s+\/s\b/i, reason: 'rmdir /s delete' },
  { regex: /\brd\s+\/s\b/i, reason: 'rd /s delete' },
  { regex: /\bdel\b[^\n]*\/s/i, reason: 'del /s delete' },
  { regex: /\bremove-item\b[^\n]*-recurse/i, reason: 'PowerShell Remove-Item -Recurse' },
  { regex: /\bgit\s+clean\b/i, reason: 'git clean' },
  { regex: /\bgit\s+reset\b[^\n]*--hard/i, reason: 'git reset --hard' },
  { regex: /\bformat\b/i, reason: 'format command' },
];

function getDangerousCommandReason(command) {
  if (!command) return null;
  for (const entry of DANGEROUS_COMMAND_PATTERNS) {
    if (entry.regex.test(command)) {
      return entry.reason;
    }
  }
  return null;
}

ipcMain.handle('project:toolRead', async (_event, payload) => {
  const rootPath = payload?.rootPath;
  const relativePath = payload?.path;
  const offset = Number(payload?.offset || 1);
  const limit = Math.max(1, Math.min(2000, Number(payload?.limit || 200)));

  const { normalized, fullPath } = resolveProjectToolPath(rootPath, relativePath);
  const raw = await fs.readFile(fullPath, 'utf-8');
  const lines = raw.split(/\r?\n/);

  const start = Number.isFinite(offset) ? Math.max(1, Math.trunc(offset)) : 1;
  const beginIdx = start - 1;
  const slice = lines.slice(beginIdx, beginIdx + limit);
  const truncated = beginIdx + limit < lines.length;

  return {
    path: normalized,
    content: slice.join('\n'),
    offset: start,
    limit,
    truncated,
    nextOffset: truncated ? start + limit : null,
    totalLines: lines.length,
  };
});

const GREP_IGNORE_DIRS = new Set([
  'node_modules', '.git', '.angel', 'dist', 'build', 'build-ninja', 'runtime', 'out', '.vs', '.idea', '__pycache__', '.cache',
]);
const GREP_BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tif', '.tiff', '.psd',
  '.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.mp4', '.mov', '.avi', '.webm', '.mkv',
  '.ttf', '.otf', '.woff', '.woff2', '.eot', '.zip', '.rar', '.7z', '.gz', '.tar', '.bz2',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.pdf', '.docx', '.xlsx', '.pptx', '.class', '.jar', '.wasm',
]);
const GREP_MAX_FILE_BYTES = 2_000_000;
// "auto" output mode aims to keep the returned payload near this many characters: it shows full
// matching lines when the complete set fits, otherwise falls back to a budget-trimmed file list.
const GREP_AUTO_CHAR_BUDGET = 500;

function grepGlobToRegExp(glob) {
  const s = String(glob || '');
  let re = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '*') {
      if (s[i + 1] === '*') {
        re += '.*';
        i += 1;
        if (s[i + 1] === '/') i += 1;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

async function grepWalkDir(baseDir, rootResolved, opts, acc) {
  let dirents;
  try {
    dirents = await fs.readdir(baseDir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const dirent of dirents) {
    const full = path.join(baseDir, dirent.name);
    if (dirent.isDirectory()) {
      if (GREP_IGNORE_DIRS.has(dirent.name)) continue;
      await grepWalkDir(full, rootResolved, opts, acc);
      continue;
    }
    if (!dirent.isFile()) continue;
    const ext = path.extname(dirent.name).toLowerCase();
    if (GREP_BINARY_EXTS.has(ext)) continue;
    const rel = path.relative(rootResolved, full).replace(/\\/g, '/');
    if (opts.globRe && !opts.globRe.test(rel)) continue;
    let raw;
    try {
      const stat = await fs.stat(full);
      if (stat.size > GREP_MAX_FILE_BYTES) continue;
      raw = await fs.readFile(full, 'utf-8');
    } catch (_) {
      continue;
    }
    if (raw.includes(' ')) continue;

    const lines = raw.split(/\r?\n/);
    let fileCount = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!opts.re.test(line)) continue;
      fileCount += 1;
      acc.totalMatches += 1;
      const collectsContent = opts.outputMode === 'content' || opts.outputMode === 'auto';
      if (collectsContent && acc.matches.length < opts.headLimit) {
        const text = line.length > 300 ? `${line.slice(0, 300)}…` : line;
        acc.matches.push({ path: rel, line: i + 1, text: text.trim() });
      }
      if (collectsContent && fileCount >= opts.perFileLimit) break;
    }
    if (fileCount > 0) acc.files.set(rel, fileCount);
  }
}

// Shape an "auto" grep result toward GREP_AUTO_CHAR_BUDGET: prefer the complete set of matching
// lines when it fits, otherwise return a budget-trimmed file overview. `representation` tells the
// caller which form it got. Best-effort: a single oversized item is still returned.
function shapeGrepAuto(pattern, files, acc, headLimit) {
  const matchesComplete = acc.totalMatches === acc.matches.length;
  if (matchesComplete && acc.matches.length > 0
      && JSON.stringify(acc.matches).length <= GREP_AUTO_CHAR_BUDGET) {
    return {
      pattern,
      outputMode: 'auto',
      representation: 'content',
      totalMatches: acc.totalMatches,
      returned: acc.matches.length,
      truncated: false,
      matches: acc.matches,
    };
  }

  const picked = [];
  let used = 0;
  for (const f of files) {
    if (picked.length >= headLimit) break;
    const cost = JSON.stringify(f).length + 1;
    if (picked.length > 0 && used + cost > GREP_AUTO_CHAR_BUDGET) break;
    picked.push(f);
    used += cost;
  }
  const truncated = files.length > picked.length;
  return {
    pattern,
    outputMode: 'auto',
    representation: 'files_with_matches',
    totalFiles: files.length,
    totalMatches: acc.totalMatches,
    returned: picked.length,
    truncated,
    ...(truncated
      ? { hint: 'Auto-trimmed to ~500 chars. For more detail re-run with output_mode:"content" (matching lines) or "files_with_matches" (all files), and/or narrow path/glob/pattern.' }
      : {}),
    files: picked,
  };
}

ipcMain.handle('project:toolGrep', async (_event, payload) => {
  const rootPath = payload?.rootPath;
  if (!rootPath) throw new Error('MISSING_ROOT');
  const pattern = String(payload?.pattern ?? '');
  if (!pattern) throw new Error('MISSING_PATTERN');

  const outputMode = ['auto', 'files_with_matches', 'content', 'count'].includes(payload?.outputMode)
    ? payload.outputMode
    : 'auto';
  const headLimit = Math.max(1, Math.min(500, Number(payload?.headLimit) || 50));

  const hasUpper = /[A-Z]/.test(pattern);
  const ci = payload?.caseInsensitive;
  const insensitive = ci === true ? true : (ci === false ? false : !hasUpper);
  let re;
  try {
    re = new RegExp(pattern, insensitive ? 'i' : '');
  } catch (error) {
    throw new Error(`INVALID_REGEX: ${error?.message || 'parse error'}`);
  }

  const rootResolved = path.resolve(rootPath);
  let baseDir = rootResolved;
  if (payload?.path) {
    const { fullPath } = resolveProjectToolPath(rootPath, payload.path);
    baseDir = fullPath;
  }

  const opts = {
    re,
    globRe: payload?.glob ? grepGlobToRegExp(payload.glob) : null,
    outputMode,
    headLimit,
    perFileLimit: 20,
  };
  const acc = { files: new Map(), matches: [], totalMatches: 0 };
  await grepWalkDir(baseDir, rootResolved, opts, acc);

  if (outputMode === 'content') {
    const truncated = acc.totalMatches > acc.matches.length;
    return {
      pattern,
      outputMode,
      totalMatches: acc.totalMatches,
      returned: acc.matches.length,
      truncated,
      ...(truncated ? { hint: 'Too many matches; narrow with path/glob or a more specific pattern.' } : {}),
      matches: acc.matches,
    };
  }

  const files = [...acc.files.entries()]
    .map(([p, count]) => ({ path: p, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

  if (outputMode === 'auto') {
    return shapeGrepAuto(pattern, files, acc, headLimit);
  }

  const returned = files.slice(0, headLimit);
  const truncated = files.length > returned.length;
  return {
    pattern,
    outputMode,
    totalFiles: files.length,
    totalMatches: acc.totalMatches,
    returned: returned.length,
    truncated,
    ...(truncated ? { hint: 'Too many files; narrow with path/glob or a more specific pattern.' } : {}),
    files: returned,
  };
});

ipcMain.handle('project:toolWrite', async (_event, payload) => {
  const rootPath = payload?.rootPath;
  const relativePath = payload?.path;
  const content = String(payload?.content ?? '');

  const { normalized, fullPath } = resolveProjectToolPath(rootPath, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');

  return {
    path: normalized,
    bytesWritten: Buffer.byteLength(content, 'utf-8'),
  };
});

ipcMain.handle('project:toolWriteBinary', async (_event, payload) => {
  const rootPath = payload?.rootPath;
  const relativePath = payload?.path;
  const base64 = String(payload?.base64 ?? '');

  if (!base64) {
    throw new Error('MISSING_CONTENT');
  }

  const { normalized, fullPath } = resolveProjectToolPath(rootPath, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const buffer = Buffer.from(base64, 'base64');
  await fs.writeFile(fullPath, buffer);

  return {
    path: normalized,
    bytesWritten: buffer.byteLength,
  };
});

ipcMain.handle('project:toolDelete', async (_event, payload) => {
  const rootPath = payload?.rootPath;
  const relativePath = payload?.path;
  const { normalized, fullPath } = resolveProjectToolPath(rootPath, relativePath);
  await fs.rm(fullPath, { force: true });
  return { ok: true, path: normalized };
});

ipcMain.handle('project:readBinaryAsDataUrl', async (_event, payload) => {
  const rootPath = payload?.rootPath;
  const relativePath = payload?.path;
  const { normalized, fullPath } = resolveProjectToolPath(rootPath, relativePath);
  const buffer = await fs.readFile(fullPath);
  const ext = String(path.extname(normalized || '').toLowerCase());
  const mimeByExt = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
  };
  const mimeType = mimeByExt[ext] || 'application/octet-stream';
  return {
    ok: true,
    path: normalized,
    mimeType,
    dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
    bytes: buffer.byteLength,
  };
});

ipcMain.handle('project:toolReadDocx', async (_event, payload) => {
  const rootPath = payload?.rootPath;
  const relativePath = payload?.path;
  const maxChars = Math.max(1000, Math.min(500000, Number(payload?.maxChars || 120000)));

  const { normalized, fullPath } = resolveProjectToolPath(rootPath, relativePath);
  const buffer = await fs.readFile(fullPath);
  const tmpBase = path.join(app.getPath('temp'), `angel-docx-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const zipPath = `${tmpBase}.zip`;
  const extractDir = `${tmpBase}-dir`;
  await fs.writeFile(zipPath, buffer);
  await fs.mkdir(extractDir, { recursive: true });
  try {
    await new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`], { windowsHide: true });
      let err = '';
      ps.stderr.on('data', (d) => { err += String(d || ''); });
      ps.on('error', reject);
      ps.on('close', (code) => code === 0 ? resolve() : reject(new Error(err || `Expand-Archive failed (${code})`)));
    });

    let xml = await fs.readFile(path.join(extractDir, 'word', 'document.xml'), 'utf-8');
    xml = xml
      .replace(/<w:tab\b[^>]*\/?>/g, '\t')
      .replace(/<w:br\b[^>]*\/?>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const text = xml.slice(0, maxChars);
    return {
      path: normalized,
      text,
      truncated: xml.length > text.length,
      totalChars: xml.length,
    };
  } finally {
    await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(zipPath, { force: true }).catch(() => {});
  }
});

ipcMain.handle('project:toolEdit', async (_event, payload) => {
  const rootPath = payload?.rootPath;
  const relativePath = payload?.path;
  const oldText = String(payload?.oldText ?? '');
  const newText = String(payload?.newText ?? '');

  if (!oldText) {
    throw new Error('INVALID_INPUT');
  }

  const { normalized, fullPath } = resolveProjectToolPath(rootPath, relativePath);
  const original = await fs.readFile(fullPath, 'utf-8');

  const parts = original.split(oldText);
  const replacedCount = parts.length - 1;
  if (replacedCount <= 0) {
    throw new Error('OLD_TEXT_NOT_FOUND');
  }

  const updated = parts.join(newText);
  await fs.writeFile(fullPath, updated, 'utf-8');

  return {
    path: normalized,
    replacedCount,
    bytesWritten: Buffer.byteLength(updated, 'utf-8'),
  };
});

ipcMain.handle('project:runCommand', async (_event, payload) => {
  const rootPath = String(payload?.rootPath || '').trim();
  const command = String(payload?.command || '').trim();
  const timeoutMs = Number(payload?.timeoutMs);

  if (!rootPath) throw new Error('MISSING_ROOT');
  if (!command) throw new Error('MISSING_COMMAND');

  const blockedReason = getDangerousCommandReason(command);
  if (blockedReason) {
    throw new Error(`COMMAND_BLOCKED: ${blockedReason}`);
  }

  const options = { windowsVerbatimArguments: true, env: buildToolEnv() };
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    options.timeoutMs = Math.min(600000, Math.max(1000, Math.trunc(timeoutMs)));
  }

  return runChildProcess('cmd.exe', ['/d', '/s', '/c', command], rootPath, options);
});

function runChildProcess(command, args, cwd, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      windowsVerbatimArguments: Boolean(options.windowsVerbatimArguments),
      ...(options.env ? { env: options.env } : {}),
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timeoutHandle = null;

    if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        try {
          child.kill();
        } catch (error) {
          // ignore
        }
      }, options.timeoutMs);
    }

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      resolve(payload);
    };

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      finish({ ok: false, code: -1, stdout, stderr: `${stderr}${error?.message || String(error)}`, timedOut });
    });

    child.on('close', (code) => {
      finish({ ok: !timedOut && code === 0, code: Number.isFinite(code) ? code : -1, stdout, stderr, timedOut });
    });
  });
}

async function pathExists(target) {
  if (!target) return false;
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveBuildDirectory(rootPath) {
  const candidates = [path.join(rootPath, 'project'), rootPath];
  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, 'CMakeLists.txt'))) {
      return candidate;
    }
  }
  throw new Error('CMAKE_LISTS_NOT_FOUND');
}

// Microsoft's official locator (ships at a fixed path with any VS 2017+ install). It finds any
// edition/version that actually has the C++ toolset component, so it's more reliable than the
// fixed-path scan below — which only knows the four VS 2022 editions.
async function detectVcvarsViaVswhere() {
  const base = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles;
  if (!base) return null;
  const vswhere = path.join(base, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (!(await pathExists(vswhere))) return null;
  const res = await runChildProcess(vswhere, [
    '-latest', '-products', '*',
    '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '-property', 'installationPath',
  ], base);
  if (!res?.ok) return null;
  const installPath = String(res.stdout || '').trim().split(/\r?\n/)[0].trim();
  if (!installPath) return null;
  const vcvars = path.join(installPath, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
  return (await pathExists(vcvars)) ? vcvars : null;
}

async function findVcvarsScript() {
  const viaVswhere = await detectVcvarsViaVswhere();
  if (viaVswhere) return viaVswhere;

  // Fallback: scan the well-known VS install locations directly (2026 first, then 2022).
  const editions = ['BuildTools', 'Community', 'Professional', 'Enterprise'];
  const years = ['2026', '2022'];
  const bases = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean);
  const candidates = [];

  for (const base of bases) {
    for (const year of years) {
      for (const edition of editions) {
        candidates.push(
          path.join(base, 'Microsoft Visual Studio', year, edition, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat'),
        );
      }
    }
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

async function ensureCmakeAvailable(buildDir) {
  const versionCheck = await runChildProcess('cmake', ['--version'], buildDir, { env: buildToolEnv() });
  if (!versionCheck.ok) {
    throw new Error('cmake.exe not found in PATH. Please install CMake ≥ 3.20 and add it to PATH.');
  }
}

async function compileWithNinja(buildDir) {
  await ensureCmakeAvailable(buildDir);
  const vcvars = await findVcvarsScript();
  if (!vcvars) {
    throw new Error('vcvarsall.bat not found. Please install Visual Studio 2022 Build Tools (Desktop C++).');
  }
  const script = `call "${vcvars}" amd64 && cmake --preset ninja-release && cmake --build --preset build-ninja-release`;
  return runChildProcess('cmd.exe', ['/d', '/s', '/c', script], buildDir, { windowsVerbatimArguments: true, env: buildToolEnv() });
}

async function findBuiltGameExe(buildDir) {
  const exeCandidates = [
    path.join(buildDir, 'build-ninja', 'game.exe'),
    path.join(buildDir, 'build', 'Release', 'game.exe'),
  ];
  for (const candidate of exeCandidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return '';
}

// Prepare <project>/runtime/ as the game's working directory so runtime output
// (record.txt, DEBUG_LOG.txt, saves) lands under the project root instead of scattering
// inside build-ninja. Assets are made reachable via a synced `assets.pak`, which the CMake
// POST_BUILD pack step produces on every build that has src/assets. Returns the runtime dir path.
async function ensureGameRuntimeDir(rootPath, exePath) {
  const runtimeDir = path.join(rootPath, 'runtime');
  const exeDir = path.dirname(exePath);
  await fs.mkdir(runtimeDir, { recursive: true });

  // Remove any loose assets/ left by an older junction-based prep: the engine resolves
  // assets through assets.pak now, and a stale junction here would only add confusion.
  try {
    await fs.rm(path.join(runtimeDir, 'assets'), { recursive: true, force: true });
  } catch {
    // ignore
  }

  // assets.pak: produced by the CMake POST_BUILD pack step on every (re-linked) build that
  // has src/assets, so it's normally present next to the exe (not just packaged builds). It is
  // the engine's sole asset source here — keep it synced, or removed when the current build
  // produced none (no src/assets, or the pack step was skipped/failed).
  const pakSrc = path.join(exeDir, 'assets.pak');
  const pakDst = path.join(runtimeDir, 'assets.pak');
  if (await pathExists(pakSrc)) {
    let needCopy = true;
    try {
      const [s, d] = await Promise.all([fs.stat(pakSrc), fs.stat(pakDst)]);
      needCopy = s.mtimeMs > d.mtimeMs || s.size !== d.size;
    } catch {
      needCopy = true;
    }
    if (needCopy) await fs.copyFile(pakSrc, pakDst);
  } else {
    try {
      await fs.rm(pakDst, { force: true });
    } catch {
      // ignore
    }
  }

  return runtimeDir;
}

async function exportProjectRelease(rootPath) {
  const buildDir = await resolveBuildDirectory(rootPath);
  const defaultName = `${path.basename(rootPath) || 'game'}-release.zip`;
  const saveDialog = await dialog.showSaveDialog({
    title: 'Export Release',
    defaultPath: path.join(rootPath, defaultName),
    filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
  });
  if (saveDialog.canceled || !saveDialog.filePath) return { ok: false, canceled: true, stdout: '', stderr: '', code: 0 };

  const zipPath = saveDialog.filePath;
  const compileResult = await compileWithNinja(buildDir);
  if (!compileResult?.ok) return compileResult;

  const exePath = await findBuiltGameExe(buildDir);
  if (!exePath) throw new Error('GAME_EXE_NOT_FOUND');

  const assetsPakPath = path.join(path.dirname(exePath), 'assets.pak');
  if (!(await pathExists(assetsPakPath))) throw new Error('ASSETS_PAK_NOT_FOUND');

  try { await fs.unlink(zipPath); } catch (_) {}
  const script = `Compress-Archive -LiteralPath @('${exePath.replace(/'/g, "''")}', '${assetsPakPath.replace(/'/g, "''")}') -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`;
  const zipResult = await runChildProcess('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], buildDir);
  if (!zipResult?.ok) return zipResult;
  return { ok: true, stdout: zipPath, stderr: '', code: 0, filePath: zipPath };
}

ipcMain.handle('project:execute', async (_event, payload) => {
  const rootPath = String(payload?.rootPath || '').trim();
  const mode = String(payload?.mode || '').trim();
  const testName = String(payload?.testName || '').trim();
  const timeoutMsRaw = Number(payload?.timeoutMs);
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
    ? Math.min(600000, Math.max(1000, Math.trunc(timeoutMsRaw)))
    : undefined;

  if (!rootPath) throw new Error('MISSING_ROOT');
  if (!mode) throw new Error('MISSING_MODE');

  const buildDir = await resolveBuildDirectory(rootPath);

  if (mode === 'compile') {
    return compileWithNinja(buildDir);
  }

  if (mode === 'export-release') {
    return exportProjectRelease(rootPath);
  }

  const exePath = await findBuiltGameExe(buildDir);
  if (!exePath) throw new Error('GAME_EXE_NOT_FOUND');

  let args = [];
  if (mode === 'run-debug') args = ['--debug'];
  if (mode === 'run-test') {
    if (!testName) throw new Error('MISSING_TEST_NAME');
    args = ['--test', testName];
  }
  if (mode === 'run-debug-test') {
    if (!testName) throw new Error('MISSING_TEST_NAME');
    args = ['--debug', '--test', testName];
  }
  // Optional run modifiers (apply to any run* mode):
  //   --turbo            : synthetic timing for automation (agent-only)
  //   --record           : capture seed/input transitions to record.txt (user-facing)
  //   --scenario <path>  : replay a recorded/authored scenario (agent-only)
  if (payload?.turbo) args.push('--turbo');
  if (payload?.record) args.push('--record');
  const scenarioRaw = String(payload?.scenario || '').trim();
  if (scenarioRaw) {
    const scenarioPath = path.isAbsolute(scenarioRaw) ? scenarioRaw : path.resolve(rootPath, scenarioRaw);
    try {
      await fs.stat(scenarioPath);
    } catch {
      throw new Error('SCENARIO_NOT_FOUND');
    }
    args.push('--scenario', scenarioPath);
  }
  // Run with cwd = <project>/runtime/ (not the exe dir) so the game's cwd-relative output
  // lands under the project root and build-ninja stays clean. Assets are linked/synced there.
  const runtimeDir = await ensureGameRuntimeDir(rootPath, exePath);
  return runChildProcess(exePath, args, runtimeDir, timeoutMs ? { timeoutMs } : {});
});

// Pre-compile gate: report whether the MSVC C++ build toolchain (vcvarsall.bat) is present.
// The renderer calls this right before compile/export and shows a guidance modal when it's
// missing, instead of letting the build run and fail with a raw error. CMake/Ninja are bundled
// with the app, so MSVC is the only externally-installed dependency worth gating on here.
ipcMain.handle('project:checkBuildTools', async () => {
  const vcvars = await findVcvarsScript();
  if (vcvars) {
    return { msvc: { ok: true, vcvars } };
  }
  return { msvc: { ok: false, reason: 'vcvarsall.bat not found' } };
});

app.whenReady().then(() => {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'local-fonts');
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
