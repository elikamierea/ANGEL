// Renderer runtime for the CLI sub-agent line.
//
// requestCliAgentCompletion() is a drop-in alternative to
// requestDefaultModelCompletion() (agent-runtime.js): it accepts the SAME
// params/callbacks and returns the SAME `reply` shape, so the chat UI, timeline,
// and canonical-turn projection render a CLI run with no UI changes. The
// difference is the transport — it spawns a coding-agent CLI via the streaming
// IPC channel and translates the CLI's stream-json events into those callbacks.
//
// Ground-truth model: the CLI owns the session. We persist a display projection
// (the canonical turns the callbacks append) plus the session_id, and continue a
// conversation by RESUMING that session — never by replaying our projection.

import { getCliAgentDriver } from './cli-agent-drivers.js';
import { summarizeToolCall } from './agent-runtime.js';

// Resume a stored CLI session only for the SAME profile (id) AND the same per-agent
// cwd — CLIs key sessions by cwd, and a different profile means a different model/
// endpoint whose session must not be replayed. Returns the session id or ''.
// (Old sessions without profileId never match → start fresh, a one-time reset.)
export function decideResume(prior, profile, agentDir) {
  if (!prior || !profile) return '';
  const sameProfile = String(prior.profileId || '') === String(profile.id || '');
  const sameCwd = String(prior.cwd || '') === String(agentDir || '');
  return (sameProfile && sameCwd) ? String(prior.sessionId || '') : '';
}

// Per-(agent, profile) session pointers. Stored shape:
//   { lastProfileId, byProfile: { <profileId>: { profileId, driver, cwd, sessionId } } }
// Migrates the legacy single-object shape so switching BACK to a source resumes its
// OWN last session instead of an overwritten/orphaned one. Pure → unit-testable.
export function normalizeSessionRecord(raw) {
  const empty = { lastProfileId: '', byProfile: {} };
  if (!raw || typeof raw !== 'object') return empty;
  if (raw.byProfile && typeof raw.byProfile === 'object') {
    return { lastProfileId: String(raw.lastProfileId || ''), byProfile: { ...raw.byProfile } };
  }
  if (raw.sessionId) {
    const pid = String(raw.profileId || raw.driver || 'legacy');
    return {
      lastProfileId: pid,
      byProfile: { [pid]: { profileId: pid, driver: String(raw.driver || ''), cwd: String(raw.cwd || ''), sessionId: String(raw.sessionId || '') } },
    };
  }
  return empty;
}

// Format a CLI tool_call event with the SAME text the HTTP line emits for its
// tool calls ("[tool] name(k=v, …)", summarizeToolCall). The chat UI keys the
// tool-progress render path off the "[tool] " prefix: clickable → detail modal,
// auto-collapse when long, and the status bar swaps it for a generic
// "Replying..." instead of leaking the raw command line. Pure → unit-testable.
export function toolCallProgressText(ev) {
  let argumentsText = '{}';
  try { argumentsText = JSON.stringify(ev?.args || {}); } catch (_) { /* keep '{}' */ }
  return summarizeToolCall({ name: String(ev?.name || 'tool'), argumentsText });
}

function newRunId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_) { /* fall through */ }
  return `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createCliAgentRuntime(deps = {}) {
  const {
    electronAPI,
    getProjectRoot,                 // () => absolute project root path ('' if none)
    resolveActiveCliProfile,        // (agentId) => { id, driver, model?, env?, extraArgs? } | null
    getDangerouslySkipPermissions,  // () => boolean
    loadAppendSystemPrompt,         // async (agentId) => string (per-project prompt.md)
    loadCliSession,                 // async (agentId) => { driver, cwd, sessionId } | null
    saveCliSession,                 // async (agentId, { driver, cwd, sessionId }) => void
    writeImageAttachment,           // async (agentId, image) => relativePath
    getAgentWorkdir,                // (agentId) => absolute <projectRoot>/agents/<folder> (per-agent cwd)
    applyAgentTodos,                // (agentId, items) => void — mirror native todos into the panel
    showAgentPlan,                  // (agentId, planText) => void — surface a proposed plan (display-only)
    notifyAgent,                    // (agentId, i18nKey, params?) => void — push a translated system note
    t = (key) => key,               // (key, params?) => string — i18n translator
  } = deps;

  // Map a Claude tool_use into ANGEL's canonical function_call turn shape (same
  // fields the HTTP path's adapter emits, minus provider replay metadata which is
  // irrelevant here — we resume, not replay).
  function functionCallTurn(driverId, model, ev) {
    return {
      role: 'function_call',
      call_id: String(ev.id || ''),
      name: String(ev.name || ''),
      arguments: JSON.stringify(ev.args || {}),
      reasoningText: '',
      providerId: `cli:${driverId}`,
      providerModel: model,
      providerMeta: null,
    };
  }

  function toolOutputTurn(driverId, model, ev) {
    return {
      role: 'tool_output',
      call_id: String(ev.toolUseId || ''),
      name: '',
      arguments: '{}',
      output: String(ev.output || ''),
      providerId: `cli:${driverId}`,
      providerModel: model,
      providerMeta: null,
      includeInContext: false,
    };
  }

  async function requestCliAgentCompletion(params = {}) {
    const agentId = params?.agentId;
    const projectRoot = String(getProjectRoot?.() || '').trim();
    if (!projectRoot) throw new Error('Open a project folder before using a CLI agent.');
    if (!electronAPI?.cliAgent?.start) throw new Error('CLI agent bridge unavailable (desktop app only).');

    const profile = resolveActiveCliProfile?.(agentId) || null;
    const driver = getCliAgentDriver(profile?.driver);
    if (!profile || !driver) throw new Error('No active CLI agent profile selected.');

    // Each agent runs in its own working dir (<projectRoot>/agents/<folder>) so
    // parallel agents get isolated sessions + per-agent native memory. The project
    // itself is reachable via --add-dir (the driver adds it). The mindmap is served
    // LIVE through the bridge, so no save-before-run is needed (and avoiding it
    // removes the concurrent-runSave race when several agents start at once).
    const agentDir = String(getAgentWorkdir?.(agentId) || projectRoot).trim() || projectRoot;

    // Pasted images can only enter a headless run as filesystem paths, so persist
    // them under the project and reference the paths in the prompt.
    const imagePaths = [];
    const images = Array.isArray(params?.images) ? params.images : [];
    for (const image of images) {
      try {
        const rel = await writeImageAttachment?.(agentId, image);
        if (rel) imagePaths.push(rel);
      } catch (_) { /* skip an image that fails to persist */ }
    }

    let appendSystemPrompt = await (loadAppendSystemPrompt?.(agentId) ?? '');

    // Memory convergence (native, layered): the CLI auto-loads its native memory
    // file up the directory tree. Running in agents/<folder> means the agent's
    // OWN file (in cwd) is private memory and the project-root file is shared
    // memory — both loaded natively. We just direct the agent to self-maintain its
    // private file. Provider-aware via driver.memoryFile.
    const memoryFile = driver.memoryFile || 'CLAUDE.md';
    const memoryDirective = `你的私有长期记忆是**当前工作目录下的 ${memoryFile}**（每次会话自动加载，无需手动读取）。项目根目录的 ${memoryFile} 是所有 agent 共享的项目级记忆，也会自动加载。请在工作过程中自行维护你自己的那份 ${memoryFile}：记录你负责部分的结构、关键决策、重要信息的所在位置；保持简洁、最新；务必保留其中已有的内容。`;
    const directives = [memoryDirective];
    // Both CLI families are shell/file-first by instinct and WILL read the on-disk
    // angel.json if left to their own devices (observed live: codex Get-Content'd
    // it twice) — but that file is a stale manual-save snapshot; the LIVE graph is
    // only served through the angel MCP bridge. Say so explicitly. Codex only gets
    // the angel MCP under skip-permissions (electron-main gates it on the bypass
    // flag), so without it we only warn about staleness instead of mandating tools
    // it doesn't have.
    // CLI coding agents are exploration-happy by default (their base prompts say
    // "understand the codebase first") and burn turns reading src/engine even
    // though the MANUALs are authoritative. State the manual-first rule per run —
    // it also covers existing projects whose seeded prompt.md predates the rule.
    directives.push('写代码时以项目根目录的 README.md 与 MANUAL_*.md 为权威依据，查到对应说明后**直接实现**。**非必要不要翻阅 src/engine 框架源码**——“必要”仅限：MANUAL 未覆盖该功能 / 严格按 MANUAL 实现仍与实际行为不符 / 追查深入引擎内部的 bug。确需翻阅时只读最小相关范围，并把结论补记进记忆文件避免重复。');
    const codexWithoutMcp = driver.id === 'codex' && !getDangerouslySkipPermissions?.();
    if (codexWithoutMcp) {
      directives.push('**不要把磁盘上的 angel.json 当作当前设计来读写**：它只是上次手动保存的过期快照，实时设计图不经文件系统提供。');
    } else {
      directives.push('思维导图（设计图）的读取与修改**必须**通过 angel MCP 工具完成（list_node / grep_node / get_node_detail / create_node / update_node / arrange 等）。**绝对不要用文件或 shell 方式直接读写 angel.json**：磁盘上的该文件只是上次手动保存的过期快照，实时图仅经 MCP 工具提供。');
    }
    // The Claude family has NO native TodoWrite in headless mode, so steer it to
    // ANGEL's MCP todo tools to keep a user-visible task list. Codex has its own
    // native todo_list (mirrored live), so don't double it up there.
    if (driver.id !== 'codex') {
      directives.push('多步骤任务请用 `todo_write` 工具（ANGEL 的任务清单，经 MCP 提供，完整名 `mcp__angel__todo_write`）跟踪进度：每次传**完整**列表整表替换，状态用 pending/in_progress/completed/blocked；开始工作或恢复会话时先用 `todo_read`（`mcp__angel__todo_read`）读回当前清单。你的计划与进度会因此显示在用户的待办面板里。');
    }
    appendSystemPrompt = [appendSystemPrompt, ...directives]
      .filter((s) => String(s || '').trim())
      .join('\n\n');

    const model = profile.model || '';

    // Per-profile session pointer: resume THIS profile's own last session if any
    // (so switching back to a source continues it, not a fresh one). All source-
    // switch messaging + memory seeding lives in the settings-save dialog now, so
    // the run stays silent about switches (only cliSessionExpired below remains).
    const record = normalizeSessionRecord(await (loadCliSession?.(agentId) ?? null));
    const prior = record.byProfile[profile.id] || null;
    const resumeId = decideResume(prior, profile, agentDir);

    // One spawn attempt. ALWAYS resolves an outcome (never rejects); the
    // orchestrator below decides on retry. A successful resume always re-emits a
    // session event (Claude re-emits init; Codex re-emits thread.started with the
    // same thread id — verified live on 0.142.1) and produces a `final` event, so
    // a resume with neither ⇒ the stored session was gone → start fresh.
    const runAttempt = (attemptResumeId) => new Promise((resolveOutcome) => {
      const launch = driver.buildLaunch({
        task: String(params?.prompt || ''),
        profile,
        sessionId: attemptResumeId,
        imagePaths,
        appendSystemPrompt,
        projectRoot, // becomes --add-dir so the agent can edit the project from its private cwd
        dangerouslySkipPermissions: Boolean(getDangerouslySkipPermissions?.()),
      });
      const runId = newRunId();
      let settled = false;
      let unsubscribe = null;
      let onAbort = null;
      let emittedText = false;
      // Seed with the resume id so a successful resume still saves its session even
      // if the CLI's re-emitted session event were ever missed; a fresh attempt
      // starts empty and captures one.
      let capturedSessionId = attemptResumeId || '';
      let capturedModel = model;
      let finalEvent = null;
      let sessionEverCaptured = false; // a real session event (Claude init / Codex thread.started)

      const cleanup = () => {
        if (typeof unsubscribe === 'function') { try { unsubscribe(); } catch (_) {} }
        if (params?.signal && onAbort) { try { params.signal.removeEventListener('abort', onAbort); } catch (_) {} }
      };

      const settleOnce = (outcome) => { if (settled) return; settled = true; cleanup(); resolveOutcome(outcome); };

      const finishReply = async () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (capturedSessionId) {
          try {
            await saveCliSession?.(agentId, profile.id, { profileId: profile.id, driver: profile.driver, cwd: agentDir, sessionId: capturedSessionId });
          } catch (_) { /* projection-only; non-fatal */ }
        }
        const usage = finalEvent?.usage;
        if (usage && typeof params?.onUsageDelta === 'function') {
          try {
            params.onUsageDelta({
              cachedInput: Number(usage.cache_read_input_tokens) || 0,
              input: Number(usage.input_tokens) || 0,
              output: Number(usage.output_tokens) || 0,
            });
          } catch (_) {}
        }
        // Estimated current context length: the whole prompt the model just processed
        // (cached + freshly-cached + new input) plus its output ≈ the live context
        // size. The CLI owns context + native compaction, so this self-corrects each
        // turn (it drops after a compaction). Routed through onProgress's usageInfo
        // channel (same one the HTTP line uses); the ctx bar shows it without a limit.
        if (usage) {
          const ctxTokens = (Number(usage.cache_read_input_tokens) || 0)
            + (Number(usage.cache_creation_input_tokens) || 0)
            + (Number(usage.input_tokens) || 0)
            + (Number(usage.output_tokens) || 0);
          try { params?.onProgress?.('', { used: ctxTokens, max: 0 }); } catch (_) {}
        }
        // When we streamed text live (suppressAggregatedFinalText), don't re-emit
        // the aggregated final text or it double-renders — mirror the HTTP path.
        const finalText = (params?.suppressAggregatedFinalText && emittedText)
          ? ''
          : String(finalEvent?.text || '');
        resolveOutcome({ reply: {
          text: finalText,
          reasoningText: '',
          providerId: `cli:${profile.driver}`,
          providerModel: capturedModel,
          providerMeta: null,
        } });
      };

      const applyEvent = (ev) => {
        if (!ev) return;
        if (ev.kind === 'batch') { for (const e of ev.events) applyEvent(e); return; }
        switch (ev.kind) {
          case 'session':
            sessionEverCaptured = true;
            if (ev.sessionId) capturedSessionId = ev.sessionId;
            if (ev.model) capturedModel = ev.model;
            break;
          case 'text':
            emittedText = true;
            try { params?.onModelText?.(ev.text); } catch (_) {}
            break;
          case 'tool_call':
            try { params?.onToolCall?.(functionCallTurn(profile.driver, capturedModel, ev)); } catch (_) {}
            try { params?.onProgress?.(toolCallProgressText(ev), null); } catch (_) {}
            break;
          case 'tool_result':
            try { params?.onToolOutput?.(toolOutputTurn(profile.driver, capturedModel, ev)); } catch (_) {}
            break;
          case 'todo':
            // Mirror the CLI's native todo/plan into ANGEL's per-agent todo panel.
            try { applyAgentTodos?.(agentId, Array.isArray(ev.items) ? ev.items : []); } catch (_) {}
            break;
          case 'plan':
            // The agent's proposed plan (Claude ExitPlanMode) → display-only note.
            try { showAgentPlan?.(agentId, String(ev.text || '')); } catch (_) {}
            break;
          case 'final':
            finalEvent = ev;
            if (!capturedSessionId && ev.sessionId) capturedSessionId = ev.sessionId;
            break;
          default:
            break;
        }
      };

      const onEventMessage = (data) => {
        if (!data || data.runId !== runId) return;
        if (data.kind === 'line') {
          let obj = null;
          try { obj = JSON.parse(data.line); } catch (_) { return; }
          try { applyEvent(driver.parseEvent(obj)); } catch (_) {}
        } else if (data.kind === 'close') {
          // User-initiated stop: we killed the process, so its non-zero exit is NOT
          // a failure — surface it as an abort (silent "stopped"), never an error
          // bubble. Checked first so the killed-process exit code can't be misread.
          if (params?.signal?.aborted) {
            settleOnce({ aborted: true });
            return;
          }
          // A resume that never established a session and produced no usable result
          // ⇒ the stored session was gone (a missing-session resume exits non-zero
          // with only a stderr message, no JSON events). A successful resume always
          // re-emits its session event, so this won't false-trigger.
          if (attemptResumeId && !sessionEverCaptured && (!finalEvent || finalEvent.isError)) {
            settleOnce({ resumeFailed: true });
          } else if (data.code !== 0 && !finalEvent) {
            settleOnce({ error: `CLI agent exited (code ${data.code}). ${String(data.stderr || '').trim().slice(-500)}`.trim() });
          } else {
            finishReply();
          }
        } else if (data.kind === 'spawnError') {
          settleOnce({ error: t('agentChat.cli.launchFailed', { bin: launch.bin, message: String(data.message || '') }) });
        }
      };

      if (params?.signal) {
        onAbort = () => { try { electronAPI.cliAgent.cancel({ runId }); } catch (_) {} };
        if (params.signal.aborted) { onAbort(); }
        else params.signal.addEventListener('abort', onAbort);
      }

      unsubscribe = electronAPI.cliAgent.onEvent(onEventMessage);

      electronAPI.cliAgent
        .start({ runId, bin: launch.bin, args: launch.args, env: launch.env, cwd: agentDir, projectRoot, stdin: launch.stdin, attachMindmapMcp: true, agentId })
        .catch((err) => settleOnce({ error: err?.message || String(err) }));
    });

    // Orchestrate: resume; if the stored session was gone, tell the user and retry fresh.
    let outcome = await runAttempt(resumeId);
    if (outcome.resumeFailed && resumeId && !(params?.signal?.aborted)) {
      try { notifyAgent?.(agentId, 'agentChat.notice.cliSessionExpired'); } catch (_) {}
      outcome = await runAttempt('');
    }
    // A user-initiated stop is surfaced as an AbortError so the chat UI treats it
    // as a silent "stopped" (matching the HTTP line) instead of a failure bubble.
    if (outcome.aborted || params?.signal?.aborted) {
      const abortErr = new Error('Request aborted by user');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    if (outcome.error) throw new Error(outcome.error);
    if (outcome.resumeFailed) {
      // Resume failed and we didn't retry (e.g. aborted) — return an empty reply.
      return { text: '', reasoningText: '', providerId: `cli:${profile.driver}`, providerModel: model, providerMeta: null };
    }
    return outcome.reply;
  }

  return { requestCliAgentCompletion };
}
