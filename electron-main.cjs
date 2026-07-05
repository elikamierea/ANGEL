const { app, BrowserWindow, dialog, ipcMain, shell, clipboard } = require('electron');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TEMPLATE_DIR = path.join(__dirname, 'new_project_template');

// Source-of-truth (hardcoded) agent system prompts live here, optionally split into
// per-profile subfolders. At project creation we copy the resolved prompt into the
// project tree (agents/<agent>/prompt.md) so it becomes a runtime-editable, per-project file.
const PROMPTS_AGENTS_DIR = path.join(__dirname, 'prompts', 'agents');
const KNOWN_PROMPT_PROFILES = new Set(['full', 'minimized', 'full-image', 'minimized-image']);
const RESERVED_AGENT_IDS = ['designer', 'orchestrator', 'programmer', 'resource-provider'];

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

let mainWindow = null;

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
  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
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

// Mirror of the renderer's resolveProjectPromptProfile: pick the prompt folder
// (full/minimized/...) from the template, falling back to layer count, then null
// (the flat prompts/agents/ folder).
function resolvePromptProfile(template) {
  const explicit = String(template?.promptProfile || '').trim().toLowerCase();
  if (KNOWN_PROMPT_PROFILES.has(explicit)) return explicit;

  const id = String(template?.id || '').trim().toLowerCase();
  if (id) {
    if (id.includes('full') || id.includes('4layer') || id.includes('4-layer')) return 'full';
    if (id.includes('minimal') || id.includes('minimized') || id.includes('2layer') || id.includes('2-layer')) return 'minimized';
  }

  const layers = Array.isArray(template?.layers) ? template.layers : [];
  if (layers.length === 4) return 'full';
  if (layers.length === 2) return 'minimized';
  return null;
}

// Read the hardcoded prompt for an agent, preferring the profile subfolder and
// falling back to the flat prompts/agents/ folder. Returns null if neither exists.
async function readHardcodedAgentPrompt(agentId, profile) {
  const candidates = [];
  if (profile) candidates.push(path.join(PROMPTS_AGENTS_DIR, profile, `${agentId}.prompt.md`));
  candidates.push(path.join(PROMPTS_AGENTS_DIR, `${agentId}.prompt.md`));
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf-8');
    } catch (_) {
      // try next candidate
    }
  }
  return null;
}

// Seed per-project, runtime-editable prompt files at creation time:
//   <projectRoot>/agents/<agent>/prompt.md
// Only the agents referenced by the template are seeded. Missing source prompts
// are skipped silently so project creation never hard-fails on a prompt gap.
async function scaffoldAgentPrompts(targetDir, template) {
  const profile = resolvePromptProfile(template);
  const agents = Array.isArray(template?.agents) && template.agents.length > 0
    ? template.agents.map((v) => String(v)).filter(Boolean)
    : RESERVED_AGENT_IDS;

  for (const agentId of agents) {
    if (!RESERVED_AGENT_IDS.includes(agentId)) continue;
    const text = await readHardcodedAgentPrompt(agentId, profile);
    if (text == null) continue;
    const promptPath = path.join(targetDir, 'agents', agentId, 'prompt.md');
    await fs.mkdir(path.dirname(promptPath), { recursive: true });
    await fs.writeFile(promptPath, text, 'utf-8');
  }
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
  await scaffoldAgentPrompts(targetDir, selectedTemplate);
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
    // Seed runtime-editable agent prompts using the template embedded in the graph.
    try {
      const template = JSON.parse(angelContent)?.project?.template;
      if (template) await scaffoldAgentPrompts(targetResolved, template);
    } catch (_) {
      // A malformed angelContent should not abort the Save As; prompts just stay unseeded.
    }
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

  // File metadata (used by e.g. the memory-seed dialog to label candidates).
  let mtimeMs = 0;
  let size = 0;
  try { const st = await fs.stat(fullPath); mtimeMs = st.mtimeMs; size = st.size; } catch (_) {}

  return {
    path: normalized,
    content: slice.join('\n'),
    offset: start,
    limit,
    truncated,
    nextOffset: truncated ? start + limit : null,
    totalLines: lines.length,
    mtimeMs,
    size,
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
      shell: Boolean(options.shell),
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

// === CLI sub-agent line (second model-interaction path) =====================
// Spawns a coding-agent CLI (Claude Code now; Codex/domestic later) as an
// autonomous sub-agent and STREAMS its stdout — newline-delimited JSON — to the
// renderer, which parses each line via cli-agent-drivers.js. Unlike
// project:runCommand (buffered request/response), this is a PUSH channel:
// renderer subscribes to 'cliAgent:event' and we send one message per line.
// The prompt arrives on the child's stdin (never argv) so arbitrary multi-line
// user text needs no command-line quoting. Bins are allowlisted so the renderer
// can't ask us to exec something arbitrary.
const CLI_AGENT_ALLOWED_BINS = new Set(['claude', 'codex']);
const activeCliAgentRuns = new Map(); // runId -> ChildProcess

// Resolve a CLI launcher on Windows: a native `.exe` (e.g. claude) is spawned
// directly with shell:false so Node escapes argv for us; an npm `.cmd`/`.bat`
// shim (e.g. codex) can't be spawned without a shell, so we fall back to
// shell:true. Our argv tokens are space-free (flags / uuids / relative paths /
// model ids) and the prompt rides on stdin, so shell:true carries no quoting
// risk. Cached per bin.
const cliLauncherCache = new Map();
function resolveCliLauncher(bin) {
  if (cliLauncherCache.has(bin)) return cliLauncherCache.get(bin);
  let resolved = { command: bin, useShell: false };
  let confirmed = process.platform !== 'win32'; // non-win: trust PATH/spawn directly
  if (process.platform === 'win32') {
    try {
      const out = require('child_process').execFileSync('where', [bin], { encoding: 'utf-8' });
      const matches = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const exe = matches.find((m) => /\.exe$/i.test(m));
      const cmd = matches.find((m) => /\.(cmd|bat)$/i.test(m));
      if (exe) { resolved = { command: exe, useShell: false }; confirmed = true; }
      else if (cmd) { resolved = { command: cmd, useShell: true }; confirmed = true; }
    } catch (_) { /* not found via `where`; fall back to bare bin (do NOT cache) */ }
  }
  // Only cache a CONFIRMED resolution. A negative (bare-bin fallback) must not be
  // cached, or a later install + re-detect would keep reading the stale miss.
  if (confirmed) cliLauncherCache.set(bin, resolved);
  return resolved;
}

// === Mindmap MCP bridge (Phase 4b) =========================================
// The stdio MCP server (a child of the CLI) reaches the LIVE graph through this
// private localhost HTTP bridge, which relays each tool call to the renderer over
// IPC. Bound to 127.0.0.1 + a per-session bearer token so only our server can
// drive graph mutations.
let mcpBridge = null; // { server, port, tokens } — set once the singleton server is listening
let mcpBridgePromise = null; // cached so CONCURRENT run launches share one server (no listen race)
const pendingBridgeReqs = new Map(); // reqId -> { resolve, reject, timer }

// Build/run route through ANGEL's Execute chain and legitimately run for many
// minutes; a fixed relay timeout would return an error to the agent while the
// build keeps going (and drop the eventual result). So these get NO timeout.
const BRIDGE_NO_TIMEOUT_TOOLS = new Set(['compile_project', 'run_project']);

// main → renderer request/response: push the op and await the matching result.
function relayToRenderer(op, tool, args, agentId) {
  return new Promise((resolve, reject) => {
    const wc = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null;
    if (!wc) { reject(new Error('renderer unavailable')); return; }
    const reqId = crypto.randomUUID();
    let timer = null;
    if (!(op === 'call' && BRIDGE_NO_TIMEOUT_TOOLS.has(String(tool || '')))) {
      timer = setTimeout(() => {
        pendingBridgeReqs.delete(reqId);
        reject(new Error('renderer relay timeout'));
      }, 60000);
    }
    pendingBridgeReqs.set(reqId, { resolve, reject, timer });
    wc.send('angelMcp:invoke', { reqId, op, tool, args, agentId: String(agentId || '') });
  });
}

ipcMain.on('angelMcp:result', (_event, payload) => {
  const reqId = String(payload?.reqId || '');
  const pending = pendingBridgeReqs.get(reqId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingBridgeReqs.delete(reqId);
  if (payload?.ok) pending.resolve(payload.result);
  else pending.reject(new Error(String(payload?.error || 'tool failed')));
});

function readRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => resolve(body));
  });
}

async function handleBridgeRequest(req, res, bridge) {
  const sendJson = (obj, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };
  // Each CLI run gets its OWN bearer token, registered at launch and bound to that
  // run's agentId (electron-main is the source of truth — it knows the agent when it
  // spawns the run). So the bridge resolves "which agent" AUTHORITATIVELY from the
  // token, not from a self-reported request field: a run can only present its own
  // token → its own agentId, and can't spoof another agent. Any per-agent tool gets
  // the right agentId for free.
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !bridge.tokens.has(token)) { res.statusCode = 401; res.end('unauthorized'); return; }
  const agentId = bridge.tokens.get(token) || '';
  try {
    if (req.method === 'GET' && req.url === '/tools') {
      const tools = await relayToRenderer('list');
      sendJson({ tools: Array.isArray(tools) ? tools : [] });
    } else if (req.method === 'POST' && req.url === '/invoke') {
      const body = await readRequestBody(req);
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch (_) { parsed = {}; }
      // agentId comes from the TOKEN, never the body.
      const result = await relayToRenderer('call', String(parsed.tool || ''), parsed.args || {}, agentId);
      sendJson({ ok: true, result });
    } else {
      res.statusCode = 404;
      res.end('not found');
    }
  } catch (e) {
    // 200 + {ok:false} so the stdio server surfaces the message as a tool error
    // (an HTTP error would instead read as "bridge call failed").
    sendJson({ ok: false, error: String(e?.message || e) });
  }
}

function ensureMcpBridge() {
  // Cache the PROMISE, not the resolved bridge: concurrent launches (several
  // agents starting at once) must share one server, or each would spin up its
  // own — and run-close would then unregister tokens from the wrong instance.
  if (mcpBridgePromise) return mcpBridgePromise;
  mcpBridgePromise = new Promise((resolve, reject) => {
    // Singleton server/port for the app; per-run tokens live in `tokens` (token →
    // agentId). The server closes over the bridge object so it sees registrations.
    const bridge = { server: null, port: 0, tokens: new Map() };
    const server = http.createServer((req, res) => { handleBridgeRequest(req, res, bridge); });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      bridge.server = server;
      bridge.port = server.address().port;
      mcpBridge = bridge;
      resolve(mcpBridge);
    });
  });
  // A failed listen must not poison every later run — clear the cache so the
  // next launch retries.
  mcpBridgePromise.catch(() => { mcpBridgePromise = null; });
  return mcpBridgePromise;
}

// Per-run MCP config files normally die with their run ('close'/'error' above),
// but an app crash strands them (they embed a bridge token — dead once the app
// exits, but still litter). Sweep old ones at startup; the >24h age guard keeps
// us from touching files owned by another ANGEL instance that is still running.
function sweepStaleMcpConfigs() {
  const maxAgeMs = 24 * 60 * 60 * 1000;
  const sweep = (dir, namePattern) => {
    let names;
    try { names = fsSync.readdirSync(dir); } catch (_) { return; }
    for (const name of names) {
      if (!namePattern.test(name)) continue;
      const full = path.join(dir, name);
      try {
        const st = fsSync.statSync(full);
        if (Date.now() - st.mtimeMs > maxAgeMs) fsSync.unlinkSync(full);
      } catch (_) { /* best effort */ }
    }
  };
  sweep(os.tmpdir(), /^angel-mcp-[0-9a-f-]+\.json$/i);
  sweep(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), /^angel-mcp-[0-9a-f-]+\.config\.toml$/i);
}

// Mint a per-run bearer token bound to the run's agentId (call at launch); drop it
// when the run ends so it can't be reused.
function registerBridgeRun(bridge, agentId) {
  const token = crypto.randomBytes(24).toString('hex');
  bridge.tokens.set(token, String(agentId || ''));
  return token;
}
function unregisterBridgeRun(bridge, token) {
  if (bridge && bridge.tokens && token) bridge.tokens.delete(token);
}

ipcMain.handle('cliAgent:detect', async (_event, payload) => {
  const bin = String(payload?.bin || '').trim();
  if (!CLI_AGENT_ALLOWED_BINS.has(bin)) return { ok: false, reason: 'unsupported-bin', bin };
  const launcher = resolveCliLauncher(bin);
  const res = await runChildProcess(launcher.command, ['--version'], process.cwd(), { timeoutMs: 10000, shell: launcher.useShell });
  return { ok: Boolean(res?.ok), version: String(res?.stdout || '').trim(), bin };
});

// --- CLI auth (sign in / status / sign out from the settings UI) ------------
// The renderer (ANGEL's own code) supplies the bin + the driver's fixed auth
// subcommand args; the allowlist keeps this from execing anything arbitrary.
function buffered(bin, args, timeoutMs) {
  const launcher = resolveCliLauncher(bin);
  return runChildProcess(launcher.command, args, process.cwd(), { timeoutMs, shell: launcher.useShell });
}

ipcMain.handle('cliAgent:authStatus', async (_event, payload) => {
  const bin = String(payload?.bin || '').trim();
  if (!CLI_AGENT_ALLOWED_BINS.has(bin)) return { ok: false, reason: 'unsupported-bin' };
  const args = Array.isArray(payload?.args) ? payload.args.map((a) => String(a)) : [];
  const res = await buffered(bin, args, 15000);
  return { ok: Boolean(res?.ok), text: `${String(res?.stdout || '')}${String(res?.stderr || '')}`.trim() };
});

ipcMain.handle('cliAgent:authLogout', async (_event, payload) => {
  const bin = String(payload?.bin || '').trim();
  if (!CLI_AGENT_ALLOWED_BINS.has(bin)) return { ok: false, reason: 'unsupported-bin' };
  const args = Array.isArray(payload?.args) ? payload.args.map((a) => String(a)) : [];
  const res = await buffered(bin, args, 15000);
  return { ok: Boolean(res?.ok), text: `${String(res?.stdout || '')}${String(res?.stderr || '')}`.trim() };
});

// Login is interactive OAuth (opens the browser + a localhost callback), so we
// spawn and STREAM its output to the renderer over the shared cliAgent:event
// channel (tagged with a fresh runId) until the process exits.
ipcMain.handle('cliAgent:authLogin', async (event, payload) => {
  const bin = String(payload?.bin || '').trim();
  if (!CLI_AGENT_ALLOWED_BINS.has(bin)) throw new Error('CLI_BIN_NOT_ALLOWED');
  const args = Array.isArray(payload?.args) ? payload.args.map((a) => String(a)) : [];
  const runId = String(payload?.runId || '') || crypto.randomUUID();
  const launcher = resolveCliLauncher(bin);

  const wc = event.sender;
  const send = (msg) => { try { if (!wc.isDestroyed()) wc.send('cliAgent:event', { runId, ...msg }); } catch (_) {} };

  const child = spawn(launcher.command, args, {
    cwd: process.cwd(),
    windowsHide: true,
    shell: launcher.useShell,
    env: buildToolEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeCliAgentRuns.set(runId, child);

  const onData = (chunk) => {
    String(chunk).split(/\r?\n/).forEach((line) => { if (line.trim()) send({ kind: 'line', line }); });
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', (err) => { activeCliAgentRuns.delete(runId); send({ kind: 'spawnError', message: err?.message || String(err) }); });
  child.on('close', (code) => { activeCliAgentRuns.delete(runId); send({ kind: 'close', code: Number.isFinite(code) ? code : -1 }); });

  return { ok: true, runId };
});

// --- Subscription usage windows (5h + weekly) for the active CLI line ----------
// Reads the local credential file + GETs the provider's PRIVATE usage endpoint
// (verified live 2026-06-30). Anthropic OAuth subscription → /api/oauth/usage;
// Codex ChatGPT → /backend-api/codex/usage (needs OpenAI-Beta: responses=experimental
// or Cloudflare 403s the call). Domestic Claude-compatible presets (custom
// ANTHROPIC_BASE_URL + their own token) are NOT Anthropic-subscription → no endpoint.
// Everything degrades to { ok:false } so the UI simply hides the gauge. The request
// is read-only and uses the user's own already-stored token (the same call the CLI
// makes for /usage); these endpoints are private/undocumented and may change.
function cliUsageHttpGetJson(urlStr, headers, timeoutMs = 6000) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(urlStr); } catch (_) { resolve({ ok: false, status: 0 }); return; }
    let req;
    try {
      req = https.request(url, { method: 'GET', headers }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; if (body.length > 1_000_000) { try { req.destroy(); } catch (_) {} } });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch (_) {}
          resolve({ ok: res.statusCode === 200 && json != null, status: res.statusCode || 0, json });
        });
      });
    } catch (_) { resolve({ ok: false, status: 0 }); return; }
    req.on('error', () => resolve({ ok: false, status: 0 }));
    req.setTimeout(timeoutMs, () => { try { req.destroy(); } catch (_) {} resolve({ ok: false, status: 0 }); });
    req.end();
  });
}

function cliReadJsonFileSafe(p) {
  try { return JSON.parse(fsSync.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

async function fetchAnthropicUsageWindows() {
  const cred = cliReadJsonFileSafe(path.join(os.homedir(), '.claude', '.credentials.json'));
  const token = cred?.claudeAiOauth?.accessToken;
  if (!token) return { ok: false, reason: 'no-token' };
  const r = await cliUsageHttpGetJson('https://api.anthropic.com/api/oauth/usage', {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'anthropic-beta': 'oauth-2025-04-20',
    'anthropic-version': '2023-06-01',
  });
  if (!r.ok) return { ok: false, status: r.status };
  const j = r.json || {};
  const win = (w) => (w && typeof w === 'object'
    ? { percent: Math.round(Number(w.utilization) || 0), resetAt: Date.parse(w.resets_at) || 0 }
    : null);
  return { ok: true, source: 'claude', fiveHour: win(j.five_hour), weekly: win(j.seven_day) };
}

async function fetchCodexUsageWindows() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const auth = cliReadJsonFileSafe(path.join(home, 'auth.json'));
  const token = auth?.tokens?.access_token;
  const accountId = auth?.tokens?.account_id;
  if (!token || !accountId) return { ok: false, reason: 'no-token' };
  const r = await cliUsageHttpGetJson('https://chatgpt.com/backend-api/codex/usage', {
    Authorization: `Bearer ${token}`,
    'chatgpt-account-id': accountId,
    'User-Agent': 'codex_cli_rs',
    originator: 'codex_cli_rs',
    Accept: 'application/json',
    'OpenAI-Beta': 'responses=experimental',
  });
  if (!r.ok) return { ok: false, status: r.status };
  const rl = r.json?.rate_limit;
  if (!rl || typeof rl !== 'object') return { ok: false, status: r.status };
  const win = (w) => (w && typeof w === 'object'
    ? { percent: Math.round(Number(w.used_percent) || 0), resetAt: (Number(w.reset_at) || 0) * 1000 }
    : null);
  return { ok: true, source: 'codex', fiveHour: win(rl.primary_window), weekly: win(rl.secondary_window) };
}

ipcMain.handle('cliAgent:usageWindows', async (_event, payload) => {
  try {
    const driver = String(payload?.driver || '').trim();
    if (driver === 'codex') return await fetchCodexUsageWindows();
    if (driver === 'claude-code') {
      // Only the genuine Anthropic subscription exposes /api/oauth/usage; domestic
      // Claude-compatible presets (custom base URL + own token) do not.
      if (payload?.hasBaseUrlOverride) return { ok: false, reason: 'unsupported-backend' };
      return await fetchAnthropicUsageWindows();
    }
    return { ok: false, reason: 'unsupported-backend' };
  } catch (_) {
    return { ok: false };
  }
});

// Stop a CLI run. On Windows the child may be a cmd.exe shell wrapper (the codex
// npm `.cmd` shim runs under shell:true), whose real worker (node → codex.exe) is
// a GRANDCHILD — child.kill() would only kill the wrapper and leave codex.exe
// running, so the UI "stop" silently does nothing. taskkill /T kills the whole
// process tree, /F forces it. Claude (a real .exe, shell:false) is fine either way
// but tree-killing is harmless there too (also reaps any tool subprocesses).
function killCliRun(child) {
  if (!child) return;
  const pid = child.pid;
  if (process.platform === 'win32' && pid) {
    try { spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }); } catch (_) { /* fall through to kill() */ }
  }
  try { child.kill(); } catch (_) { /* already gone */ }
}

ipcMain.handle('cliAgent:cancel', async (_event, payload) => {
  const runId = String(payload?.runId || '');
  const child = activeCliAgentRuns.get(runId);
  if (!child) return { ok: false, reason: 'not-found' };
  killCliRun(child);
  return { ok: true };
});

ipcMain.handle('cliAgent:start', async (event, payload) => {
  const bin = String(payload?.bin || '').trim();
  if (!CLI_AGENT_ALLOWED_BINS.has(bin)) throw new Error('CLI_BIN_NOT_ALLOWED');
  const cwd = String(payload?.cwd || '').trim();
  if (!cwd) throw new Error('MISSING_CWD');
  // The agent's cwd may be a per-agent subdir; the mindmap MCP must still be
  // scoped to the real project root. Falls back to cwd for older callers.
  const projectRoot = String(payload?.projectRoot || cwd).trim();
  // Ensure the (possibly per-agent) working dir exists before spawning.
  try { fsSync.mkdirSync(cwd, { recursive: true }); } catch (_) { /* spawn will surface a real failure */ }

  const args = Array.isArray(payload?.args) ? payload.args.map((a) => String(a)) : [];
  const extraEnv = payload?.env && typeof payload.env === 'object' ? payload.env : {};
  const stdinInput = typeof payload?.stdin === 'string' ? payload.stdin : '';
  const runId = String(payload?.runId || '') || crypto.randomUUID();

  // Mindmap MCP (Phase 4a): point the CLI (an MCP client) at ANGEL's read-only
  // stdio server so the sub-agent can see the graph. The server runs under
  // Electron's bundled Node (ELECTRON_RUN_AS_NODE) → no external `node` needed.
  // We don't pass --strict-mcp-config, so the user's own .mcp.json still loads.
  let mcpConfigPath = '';
  let mcpRunToken = ''; // per-run bridge token (bound to this run's agentId); freed on close
  if (payload?.attachMindmapMcp && bin === 'claude') {
    try {
      // Bring up the localhost bridge so the server runs in LIVE (bridge) mode —
      // tools route to the renderer's real graph functions (Phase 4b). If this
      // throws, the catch below leaves the run without the mindmap MCP.
      const bridge = await ensureMcpBridge();
      mcpRunToken = registerBridgeRun(bridge, payload?.agentId);
      const serverPath = path.join(__dirname, 'mcp', 'angel-mcp-server.cjs');
      const cfg = {
        mcpServers: {
          angel: {
            command: process.execPath,
            args: [serverPath],
            env: {
              ELECTRON_RUN_AS_NODE: '1',
              ANGEL_PROJECT_ROOT: projectRoot,
              ANGEL_BRIDGE_URL: `http://127.0.0.1:${bridge.port}`,
              // Per-run token → the bridge resolves this run's agentId from it.
              ANGEL_BRIDGE_TOKEN: mcpRunToken,
            },
          },
        },
      };
      mcpConfigPath = path.join(os.tmpdir(), `angel-mcp-${crypto.randomUUID()}.json`);
      fsSync.writeFileSync(mcpConfigPath, JSON.stringify(cfg), 'utf-8');
      // Server-level allow auto-approves every angel tool (works with acceptEdits).
      args.push('--mcp-config', mcpConfigPath, '--allowedTools', 'mcp__angel');
    } catch (_) {
      // If the config can't be written, run without the mindmap rather than fail.
      mcpConfigPath = '';
    }
  } else if (payload?.attachMindmapMcp && bin === 'codex' && args.includes('--dangerously-bypass-approvals-and-sandbox')) {
    // Codex injects MCP via a profile config file (its `-c` TOML overrides would
    // be mangled by the .cmd shell on Windows). The profile lives in the real
    // CODEX_HOME so auth stays intact; paths are forward-slashed to dodge TOML
    // backslash escapes. Same bridge + server as Claude → full read+write mindmap.
    // Gated on the bypass flag: under workspace-write, non-interactive MCP tool
    // calls would be blocked, so we skip the mindmap rather than half-wire it.
    try {
      const bridge = await ensureMcpBridge();
      mcpRunToken = registerBridgeRun(bridge, payload?.agentId);
      const serverPath = path.join(__dirname, 'mcp', 'angel-mcp-server.cjs');
      const fwd = (p) => String(p).replace(/\\/g, '/');
      const profileName = `angel-mcp-${crypto.randomUUID()}`;
      const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
      const toml = [
        '[mcp_servers.angel]',
        `command = "${fwd(process.execPath)}"`,
        `args = ["${fwd(serverPath)}"]`,
        '',
        '[mcp_servers.angel.env]',
        'ELECTRON_RUN_AS_NODE = "1"',
        `ANGEL_PROJECT_ROOT = "${fwd(projectRoot)}"`,
        `ANGEL_BRIDGE_URL = "http://127.0.0.1:${bridge.port}"`,
        // Per-run token → the bridge resolves this run's agentId from it.
        `ANGEL_BRIDGE_TOKEN = "${mcpRunToken}"`,
        '',
      ].join('\n');
      mcpConfigPath = path.join(codexHome, `${profileName}.config.toml`);
      fsSync.mkdirSync(codexHome, { recursive: true });
      fsSync.writeFileSync(mcpConfigPath, toml, 'utf-8');
      // codex options must precede the trailing stdin-prompt positional ('-').
      if (args[args.length - 1] === '-') args.splice(args.length - 1, 0, '--profile', profileName);
      else args.push('--profile', profileName);
    } catch (_) {
      mcpConfigPath = '';
    }
  }

  const wc = event.sender;
  const send = (msg) => {
    try { if (!wc.isDestroyed()) wc.send('cliAgent:event', { runId, ...msg }); } catch (_) { /* window gone */ }
  };

  // Native .exe → shell:false (Node escapes argv); npm .cmd shim (codex) → shell:true.
  const launcher = resolveCliLauncher(bin);
  const child = spawn(launcher.command, args, {
    cwd,
    windowsHide: true,
    shell: launcher.useShell,
    env: { ...buildToolEnv(), ...extraEnv },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  activeCliAgentRuns.set(runId, child);

  try { if (stdinInput) child.stdin.write(stdinInput); } catch (_) { /* race with early exit */ }
  try { child.stdin.end(); } catch (_) { /* already closed */ }

  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += String(chunk);
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line.trim()) send({ kind: 'line', line });
    }
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });

  child.on('error', (err) => {
    activeCliAgentRuns.delete(runId);
    // 'close' may never fire after a spawn failure, so clean up here too (the
    // config file embeds this run's bridge token). Double-unlink is harmless.
    if (mcpConfigPath) { try { fsSync.unlinkSync(mcpConfigPath); } catch (_) { /* best effort */ } }
    if (mcpRunToken) unregisterBridgeRun(mcpBridge, mcpRunToken);
    send({ kind: 'spawnError', message: err?.message || String(err) });
  });

  child.on('close', (code) => {
    activeCliAgentRuns.delete(runId);
    if (mcpConfigPath) { try { fsSync.unlinkSync(mcpConfigPath); } catch (_) { /* best effort */ } }
    if (mcpRunToken) unregisterBridgeRun(mcpBridge, mcpRunToken); // free this run's bridge token
    const tail = buf.trim();
    if (tail) send({ kind: 'line', line: tail }); // flush any trailing partial line
    send({ kind: 'close', code: Number.isFinite(code) ? code : -1, stderr: stderr.slice(-4000) });
  });

  return { ok: true, runId };
});

app.whenReady().then(() => {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'local-fonts');
  });

  createWindow();
  sweepStaleMcpConfigs();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
