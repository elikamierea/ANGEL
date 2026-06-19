// Agent tool runtime adapters.
//
// Purpose:
// - keep all tool I/O implementation details (Electron IPC + File System Access fallback)
//   out of app.js
// - expose a stable tool API surface consumed by agent-functions/runtime wiring
export function createAgentToolRuntime(deps) {
  const {
    state,
    electronAPI,
    normalizeToolRelativePath,
    splitLinesKeepSimple,
    refreshProjectFileTree,
  } = deps;

  async function getDirectoryHandleForRelativePath(rootDirHandle, relativePath, create = false) {
    const parts = normalizeToolRelativePath(relativePath).split('/');
    const fileName = parts.pop();
    let dir = rootDirHandle;
    for (const seg of parts) {
      dir = await dir.getDirectoryHandle(seg, { create });
    }
    return { dir, fileName };
  }

  // Read text file content with line-window pagination.
  // Prefer Electron IPC; fallback to File System Access when available.
  async function toolReadByParams(params = {}) {
    const relPath = normalizeToolRelativePath(params.path);
    const offset = Number.isFinite(Number(params.offset)) ? Math.max(1, Math.trunc(Number(params.offset))) : 1;
    const limit = Number.isFinite(Number(params.limit)) ? Math.max(1, Math.min(2000, Math.trunc(Number(params.limit)))) : 1000;

    if (electronAPI && state.projectRootPath) {
      const res = await electronAPI.toolRead({ rootPath: state.projectRootPath, path: relPath, offset, limit });
      return { ok: true, ...res };
    }

    if (state.currentProjectDirHandle) {
      const { dir, fileName } = await getDirectoryHandleForRelativePath(state.currentProjectDirHandle, relPath, false);
      const fileHandle = await dir.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const raw = await file.text();
      const lines = splitLinesKeepSimple(raw);
      const startIdx = offset - 1;
      const slice = lines.slice(startIdx, startIdx + limit);
      const truncated = startIdx + limit < lines.length;

      return {
        ok: true,
        path: relPath,
        content: slice.join('\n'),
        offset,
        limit,
        truncated,
        nextOffset: truncated ? offset + limit : null,
        totalLines: lines.length,
      };
    }

    throw new Error('No opened project folder. Open a project first.');
  }

  // Overwrite/create text file and refresh file tree so sidebar state stays in sync.
  async function toolWriteByParams(params = {}) {
    const relPath = normalizeToolRelativePath(params.path);
    const content = String(params.content ?? '');

    if (electronAPI && state.projectRootPath) {
      const res = await electronAPI.toolWrite({ rootPath: state.projectRootPath, path: relPath, content });
      await refreshProjectFileTree(false);
      return { ok: true, ...res };
    }

    if (state.currentProjectDirHandle) {
      const { dir, fileName } = await getDirectoryHandleForRelativePath(state.currentProjectDirHandle, relPath, true);
      const fileHandle = await dir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      await refreshProjectFileTree(false);
      return { ok: true, path: relPath, bytesWritten: new TextEncoder().encode(content).byteLength };
    }

    throw new Error('No opened project folder. Open a project first.');
  }

  // Exact-text replace edit (all occurrences), with explicit failure when oldText not found.
  async function readImageByParams(params = {}) {
    const relPath = normalizeToolRelativePath(params.path);
    if (!relPath) throw new Error('path is required');

    if (electronAPI && state.projectRootPath && electronAPI.readBinaryAsDataUrl) {
      const loaded = await electronAPI.readBinaryAsDataUrl({ rootPath: state.projectRootPath, path: relPath });
      if (!loaded?.ok || !loaded?.dataUrl) throw new Error(`failed to read image: ${relPath}`);
      return {
        ok: true,
        _attachImages: [{
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: relPath.split('/').pop() || 'image',
          mimeType: String(loaded.mimeType || 'image/png'),
          dataUrl: String(loaded.dataUrl),
        }],
      };
    }

    throw new Error('read_image is only available in desktop mode (Electron).');
  }

  async function readDocxByParams(params = {}) {
    const relPath = normalizeToolRelativePath(params.path);
    const maxChars = Number.isFinite(Number(params.maxChars))
      ? Math.max(1000, Math.min(500000, Math.trunc(Number(params.maxChars))))
      : 120000;

    if (electronAPI && state.projectRootPath && electronAPI.toolReadDocx) {
      const res = await electronAPI.toolReadDocx({ rootPath: state.projectRootPath, path: relPath, maxChars });
      return { ok: true, ...res };
    }

    throw new Error('read_docx is only available in desktop mode (Electron).');
  }

  async function toolEditByParams(params = {}) {
    const relPath = normalizeToolRelativePath(params.path);
    const oldText = String(params.oldText ?? '');
    const newText = String(params.newText ?? '');
    if (!oldText) throw new Error('oldText is required');

    if (electronAPI && state.projectRootPath) {
      const res = await electronAPI.toolEdit({ rootPath: state.projectRootPath, path: relPath, oldText, newText });
      await refreshProjectFileTree(false);
      return { ok: true, ...res };
    }

    if (state.currentProjectDirHandle) {
      const { dir, fileName } = await getDirectoryHandleForRelativePath(state.currentProjectDirHandle, relPath, false);
      const fileHandle = await dir.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const original = await file.text();
      const parts = original.split(oldText);
      const replacedCount = parts.length - 1;
      if (replacedCount <= 0) throw new Error('oldText not found');
      const updated = parts.join(newText);
      const writable = await fileHandle.createWritable();
      await writable.write(updated);
      await writable.close();
      await refreshProjectFileTree(false);
      return { ok: true, path: relPath, replacedCount, bytesWritten: new TextEncoder().encode(updated).byteLength };
    }

    throw new Error('No opened project folder. Open a project first.');
  }

  // Regex content search over project files. Prefer Electron IPC (fast fs walk);
  // fall back to a File System Access handle walk so browser mode keeps parity.
  const GREP_IGNORE_DIRS = new Set([
    'node_modules', '.git', '.angel', 'dist', 'build', 'out', '.vs', '.idea', '__pycache__', '.cache',
  ]);
  const GREP_BINARY_EXTS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tif', '.tiff', '.psd',
    '.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.mp4', '.mov', '.avi', '.webm', '.mkv',
    '.ttf', '.otf', '.woff', '.woff2', '.eot', '.zip', '.rar', '.7z', '.gz', '.tar', '.bz2',
    '.exe', '.dll', '.so', '.dylib', '.bin', '.pdf', '.docx', '.xlsx', '.pptx', '.class', '.jar', '.wasm',
  ]);
  const GREP_MAX_FILE_BYTES = 2_000_000;

  function extOf(name) {
    const idx = String(name).lastIndexOf('.');
    return idx <= 0 ? '' : String(name).slice(idx).toLowerCase();
  }

  function globToRegExp(glob) {
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

  function buildGrepRegExp(pattern, caseInsensitive) {
    const hasUpper = /[A-Z]/.test(pattern);
    const insensitive = caseInsensitive === true
      ? true
      : (caseInsensitive === false ? false : !hasUpper);
    return new RegExp(pattern, insensitive ? 'i' : '');
  }

  function scanGrepContent(relPath, raw, opts, acc) {
    if (raw.includes(' ')) return;
    const lines = raw.split(/\r?\n/);
    let fileCount = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!opts.re.test(line)) continue;
      fileCount += 1;
      acc.totalMatches += 1;
      if (opts.outputMode === 'content' && acc.matches.length < opts.headLimit) {
        const text = line.length > 300 ? `${line.slice(0, 300)}…` : line;
        acc.matches.push({ path: relPath, line: i + 1, text: text.trim() });
      }
      if (opts.outputMode === 'content' && fileCount >= opts.perFileLimit) break;
    }
    if (fileCount > 0) acc.files.set(relPath, fileCount);
  }

  async function grepWalkDirectoryHandle(dirHandle, basePath, opts, acc) {
    for await (const entry of dirHandle.values()) {
      const rel = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        if (GREP_IGNORE_DIRS.has(entry.name)) continue;
        await grepWalkDirectoryHandle(entry, rel, opts, acc);
        continue;
      }
      if (GREP_BINARY_EXTS.has(extOf(entry.name))) continue;
      if (opts.globRe && !opts.globRe.test(rel)) continue;
      try {
        const file = await entry.getFile();
        if (file.size > GREP_MAX_FILE_BYTES) continue;
        const raw = await file.text();
        scanGrepContent(rel, raw, opts, acc);
      } catch (_) {
        // skip unreadable entry
      }
    }
  }

  function shapeGrepResult(pattern, outputMode, headLimit, acc) {
    if (outputMode === 'content') {
      const truncated = acc.totalMatches > acc.matches.length;
      return {
        ok: true,
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
    const returned = files.slice(0, headLimit);
    const truncated = files.length > returned.length;
    return {
      ok: true,
      pattern,
      outputMode,
      totalFiles: files.length,
      totalMatches: acc.totalMatches,
      returned: returned.length,
      truncated,
      ...(truncated ? { hint: 'Too many files; narrow with path/glob or a more specific pattern.' } : {}),
      files: returned,
    };
  }

  async function grepFilesByParams(params = {}) {
    const pattern = String(params.pattern ?? '');
    if (!pattern) throw new Error('pattern is required');
    const outputMode = ['files_with_matches', 'content', 'count'].includes(params.output_mode)
      ? params.output_mode
      : 'files_with_matches';
    const headLimit = Number.isFinite(Number(params.head_limit))
      ? Math.max(1, Math.min(500, Math.trunc(Number(params.head_limit))))
      : 50;
    const subPath = params.path ? normalizeToolRelativePath(params.path) : '';
    const glob = String(params.glob || '');

    if (electronAPI && state.projectRootPath) {
      const res = await electronAPI.toolGrep({
        rootPath: state.projectRootPath,
        pattern,
        path: subPath,
        glob,
        caseInsensitive: params['-i'],
        outputMode,
        headLimit,
      });
      return { ok: true, ...res };
    }

    if (state.currentProjectDirHandle) {
      let re;
      try {
        re = buildGrepRegExp(pattern, params['-i']);
      } catch (error) {
        throw new Error(`invalid regex pattern: ${error?.message || 'parse error'}`);
      }
      let baseHandle = state.currentProjectDirHandle;
      let basePath = '';
      if (subPath) {
        for (const seg of subPath.split('/')) {
          baseHandle = await baseHandle.getDirectoryHandle(seg, { create: false });
        }
        basePath = subPath;
      }
      const opts = {
        re,
        globRe: glob ? globToRegExp(glob) : null,
        outputMode,
        headLimit,
        perFileLimit: 20,
      };
      const acc = { files: new Map(), matches: [], totalMatches: 0 };
      await grepWalkDirectoryHandle(baseHandle, basePath, opts, acc);
      return shapeGrepResult(pattern, outputMode, headLimit, acc);
    }

    throw new Error('No opened project folder. Open a project first.');
  }

  // Project command execution is intentionally desktop-only (Electron host path).
  async function runCommandByParams(params = {}) {
    const command = String(params.command || '').trim();
    if (!command) throw new Error('command is required');
    const timeoutSeconds = Number(params.timeoutSeconds);
    const timeoutMs = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
      ? Math.min(600, Math.max(1, Math.trunc(timeoutSeconds))) * 1000
      : undefined;

    if (electronAPI && state.projectRootPath) {
      const res = await electronAPI.runProjectCommand({
        rootPath: state.projectRootPath,
        command,
        timeoutMs,
      });
      const ok = typeof res?.ok === 'boolean' ? res.ok : res?.code === 0;
      return {
        ok,
        command,
        cwd: String(state.projectRootPath || ''),
        code: Number.isFinite(res?.code) ? res.code : ok ? 0 : -1,
        stdout: String(res?.stdout || ''),
        stderr: String(res?.stderr || ''),
        timedOut: Boolean(res?.timedOut),
      };
    }

    throw new Error('Command execution is only available in desktop mode with an opened project folder.');
  }

  async function executeProjectMode(mode, testName = '', options = {}) {
    if (electronAPI && state.projectRootPath && electronAPI.executeProject) {
      const timeoutMsRaw = Number(options.timeoutMs);
      const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
        ? Math.min(600000, Math.max(1000, Math.trunc(timeoutMsRaw)))
        : undefined;
      const res = await electronAPI.executeProject({
        rootPath: state.projectRootPath,
        mode,
        testName,
        timeoutMs,
      });
      const ok = typeof res?.ok === 'boolean' ? res.ok : res?.code === 0;
      return {
        ok,
        mode,
        testName: (mode === 'run-test' || mode === 'run-debug-test') ? testName : '',
        cwd: String(state.projectRootPath || ''),
        code: Number.isFinite(res?.code) ? res.code : ok ? 0 : -1,
        stdout: String(res?.stdout || ''),
        stderr: String(res?.stderr || ''),
        canceled: Boolean(res?.canceled),
        timedOut: Boolean(res?.timedOut),
        timeoutMs: timeoutMs ?? null,
      };
    }

    throw new Error('Project execute is only available in desktop mode with an opened project folder.');
  }

  async function compileProjectByParams() {
    return executeProjectMode('compile', '');
  }

  async function runProjectByParams(params = {}) {
    const debug = Boolean(params.debug);
    const testName = String(params.testName || '').trim();
    const timeoutMsRaw = Number(params.timeoutMs);
    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.min(600000, Math.max(1000, Math.trunc(timeoutMsRaw)))
      : 30000;
    const mode = testName ? (debug ? 'run-debug-test' : 'run-test') : (debug ? 'run-debug' : 'run');
    return executeProjectMode(mode, testName, { timeoutMs });
  }

  // Lightweight fetch with retry-on-transient-status and simple HTML text/link extraction.
  async function webFetchByParams(params = {}) {
    const url = String(params.url || '').trim();
    const maxChars = Number.isFinite(Number(params.maxChars))
      ? Math.max(200, Math.min(200000, Math.trunc(Number(params.maxChars))))
      : 12000;

    const decodeHtml = (input) => String(input || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");

    const extractTextAndLinks = (rawHtml, baseUrl) => {
      const html = String(rawHtml || '');
      const links = [];
      const seen = new Set();

      const anchorRe = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = anchorRe.exec(html)) !== null) {
        const hrefRaw = decodeHtml(m[1] || m[2] || m[3] || '').trim();
        if (!hrefRaw || hrefRaw.startsWith('#') || /^javascript:/i.test(hrefRaw)) continue;

        let absolute = hrefRaw;
        try { absolute = new URL(hrefRaw, baseUrl).toString(); } catch (_) {}
        if (seen.has(absolute)) continue;
        seen.add(absolute);

        const text = decodeHtml(String(m[4] || '')
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim());

        links.push({ url: absolute, text });
      }

      const visibleText = decodeHtml(html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim());

      return { visibleText, links };
    };

    if (!url) {
      return { ok: false, url: '', error: 'url is required', attempts: 0, status: null, content: '', text: '', links: [] };
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return { ok: false, url, error: 'url must be a valid absolute URL', attempts: 0, status: null, content: '', text: '', links: [] };
    }

    const protocol = String(parsed.protocol || '').toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return { ok: false, url: parsed.toString(), error: 'url protocol must be http or https', attempts: 0, status: null, content: '', text: '', links: [] };
    }

    const targetUrl = parsed.toString();
    const timeoutMs = 10000;
    const maxAttempts = 2;
    const retryDelayMs = 3000;

    let lastError = 'unknown error';
    let lastStatus = null;
    let lastContentType = '';
    let lastContent = '';
    let lastText = '';
    let lastLinks = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const resp = await fetch(targetUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const raw = await resp.text();
        const content = raw.slice(0, maxChars);
        const { visibleText, links } = extractTextAndLinks(raw, targetUrl);
        const text = visibleText.slice(0, maxChars);

        lastStatus = resp.status;
        lastContentType = String(resp.headers.get('content-type') || '');
        lastContent = content;
        lastText = text;
        lastLinks = links;

        if (resp.ok) {
          return {
            ok: true,
            url: targetUrl,
            status: resp.status,
            contentType: lastContentType,
            content,
            text,
            links,
            truncated: raw.length > content.length,
            textTruncated: visibleText.length > text.length,
            totalChars: raw.length,
            totalTextChars: visibleText.length,
            attempts: attempt,
          };
        }

        lastError = `web fetch failed (${resp.status})`;
        const retryableStatus = resp.status === 429 || resp.status === 503 || resp.status === 504;
        if (attempt < maxAttempts && retryableStatus) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
        break;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error?.name === 'AbortError') {
          lastError = `web fetch timeout after ${timeoutMs}ms`;
        } else {
          lastError = error instanceof Error ? error.message : String(error || 'fetch error');
        }

        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
      }
    }

    return {
      ok: false,
      url: targetUrl,
      status: lastStatus,
      contentType: lastContentType,
      error: lastError,
      content: lastContent,
      text: lastText,
      links: lastLinks,
      truncated: false,
      totalChars: lastContent.length,
      totalTextChars: lastText.length,
      attempts: maxAttempts,
    };
  }

  async function writeBinaryFileByRelativePath(relativePath, blob) {
    const relPath = normalizeToolRelativePath(relativePath);

    if (electronAPI && state.projectRootPath) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);
      await electronAPI.toolWriteBinary({ rootPath: state.projectRootPath, path: relPath, base64 });
      return;
    }

    if (state.currentProjectDirHandle) {
      const { dir, fileName } = await getDirectoryHandleForRelativePath(state.currentProjectDirHandle, relPath, true);
      const fileHandle = await dir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }

    throw new Error('No opened project folder. Open a project first.');
  }

  async function deleteFileByRelativePath(relativePath) {
    const relPath = normalizeToolRelativePath(relativePath);

    if (electronAPI && state.projectRootPath) {
      await electronAPI.toolDelete({ rootPath: state.projectRootPath, path: relPath });
      return;
    }

    if (state.currentProjectDirHandle) {
      const { dir, fileName } = await getDirectoryHandleForRelativePath(state.currentProjectDirHandle, relPath, false);
      await dir.removeEntry(fileName);
      return;
    }

    throw new Error('No opened project folder. Open a project first.');
  }

  async function screenshotCanvasByParams() {
    const graphCanvas = document.getElementById('graph-canvas');
    if (!graphCanvas) throw new Error('graph-canvas element not found');
    const w = Math.max(1, Math.round(graphCanvas.width / 2));
    const h = Math.max(1, Math.round(graphCanvas.height / 2));
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    tmp.getContext('2d').drawImage(graphCanvas, 0, 0, w, h);
    const dataUrl = tmp.toDataURL('image/png');
    return {
      ok: true,
      _attachImages: [{
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: 'canvas-screenshot.png',
        mimeType: 'image/png',
        dataUrl,
      }],
    };
  }

  function getViewportByParams() {
    const graphCanvas = document.getElementById('graph-canvas');
    const zoom = Math.max(0.0001, Number(state.zoom) || 1);
    const panX = Number(state.panX) || 0;
    const panY = Number(state.panY) || 0;
    const clientW = graphCanvas ? graphCanvas.clientWidth : 0;
    const clientH = graphCanvas ? graphCanvas.clientHeight : 0;
    const round5 = (v) => Number(Number(v).toPrecision(5));
    return {
      ok: true,
      zoom: round5(zoom),
      left: round5(-panX / zoom),
      top: round5(-panY / zoom),
      right: round5((clientW - panX) / zoom),
      bottom: round5((clientH - panY) / zoom),
    };
  }

  return {
    toolReadByParams,
    toolWriteByParams,
    toolEditByParams,
    grepFilesByParams,
    readImageByParams,
    readDocxByParams,
    runCommandByParams,
    compileProjectByParams,
    runProjectByParams,
    webFetchByParams,
    writeBinaryFileByRelativePath,
    deleteFileByRelativePath,
    screenshotCanvasByParams,
    getViewportByParams,
  };
}
