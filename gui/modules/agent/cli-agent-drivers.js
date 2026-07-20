// CLI sub-agent drivers (pure, side-effect-free, unit-tested).
//
// This is the second model-interaction line (see the "two-line" architecture):
// instead of calling a provider HTTP API, ANGEL spawns a coding-agent CLI
// (Claude Code, and later Codex / domestic Claude-compatible CLIs) as an
// autonomous sub-agent and the CLI owns the session/loop/tools. This module is
// the provider-agnostic boundary, mirroring agent-provider-adapters.js:
//   - buildLaunch(): turns a request + profile into a concrete { bin, args, env }
//   - parseEvent():  normalizes one already-parsed stream-json object into a
//                    small canonical event the renderer maps to its UI callbacks
// Everything here is pure so it can be tested without spawning a process.

// --- helpers ---------------------------------------------------------------

function asString(value) {
  return value == null ? '' : String(value);
}

// Normalize a CLI's native todo items to ANGEL's { content, status } shape so the
// todo panel renders them uniformly. Claude TodoWrite: { content, status,
// activeForm }. Codex todo_list: { text, completed }.
function normalizeTodoList(items, source) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => (source === 'codex'
      ? { content: asString(it?.text), status: it?.completed ? 'completed' : 'pending' }
      : { content: asString(it?.content), status: asString(it?.status) || 'pending' }))
    .filter((t) => t.content);
}

// Claude Code's headless --output-format stream-json emits one JSON object per
// stdout line. Field shapes captured live against claude 2.1.195 (see
// scratchpad/claude-stream-schema.md). The relevant top-level discriminator is
// `type`; assistant/user payloads ride inside `message` as Anthropic blocks.
function parseClaudeEvent(obj) {
  if (!obj || typeof obj !== 'object') return { kind: 'ignore' };
  const type = asString(obj.type);

  if (type === 'system' && asString(obj.subtype) === 'init') {
    return { kind: 'session', sessionId: asString(obj.session_id), model: asString(obj.model) };
  }

  if (type === 'assistant' && obj.message && typeof obj.message === 'object') {
    const events = [];
    const content = Array.isArray(obj.message.content) ? obj.message.content : [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const btype = asString(block.type);
      if (btype === 'text') {
        const text = asString(block.text);
        if (text) events.push({ kind: 'text', text });
      } else if (btype === 'tool_use') {
        const name = asString(block.name);
        // Claude's TodoWrite is surfaced separately so the renderer can mirror it
        // into ANGEL's todo UI (display-only) instead of as a generic tool call.
        if (name === 'TodoWrite') {
          events.push({ kind: 'todo', items: normalizeTodoList(block.input?.todos, 'claude') });
        } else if (name === 'ExitPlanMode' || name === 'exit_plan_mode') {
          // The agent's proposed plan (markdown). Surface it as a display-only plan
          // note instead of a generic tool call (we don't gate on approval here).
          const plan = asString(block.input?.plan);
          if (plan) events.push({ kind: 'plan', text: plan });
        } else {
          events.push({
            kind: 'tool_call',
            id: asString(block.id),
            name,
            args: block.input && typeof block.input === 'object' ? block.input : {},
          });
        }
      }
    }
    if (obj.message.usage && typeof obj.message.usage === 'object') {
      events.push({ kind: 'usage', usage: obj.message.usage });
    }
    return events.length === 1 ? events[0] : { kind: 'batch', events };
  }

  if (type === 'user' && obj.message && typeof obj.message === 'object') {
    const content = Array.isArray(obj.message.content) ? obj.message.content : [];
    const events = [];
    for (const block of content) {
      if (!block || typeof block !== 'object' || asString(block.type) !== 'tool_result') continue;
      events.push({
        kind: 'tool_result',
        toolUseId: asString(block.tool_use_id),
        output: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
        isError: Boolean(block.is_error),
      });
    }
    if (events.length === 0) return { kind: 'ignore' };
    return events.length === 1 ? events[0] : { kind: 'batch', events };
  }

  if (type === 'result') {
    const isError = Boolean(obj.is_error) || asString(obj.subtype).startsWith('error');
    return {
      kind: 'final',
      text: asString(obj.result),
      isError,
      subtype: asString(obj.subtype),
      usage: obj.usage && typeof obj.usage === 'object' ? obj.usage : null,
      cost: Number.isFinite(Number(obj.total_cost_usd)) ? Number(obj.total_cost_usd) : null,
      numTurns: Number.isFinite(Number(obj.num_turns)) ? Number(obj.num_turns) : null,
      sessionId: asString(obj.session_id),
    };
  }

  // rate_limit_event, stream partials, and anything else are not surfaced yet.
  return { kind: 'ignore' };
}

// Compose the task text the CLI receives. Pasted images can only enter a headless
// run as filesystem path references in the prompt (the documented mechanism), so
// they are appended here. Paths must already be inside the project (cwd) so the
// CLI's sandbox can read them.
function composeClaudeTask(task, imagePaths) {
  const base = asString(task);
  const paths = Array.isArray(imagePaths) ? imagePaths.filter(Boolean) : [];
  if (paths.length === 0) return base;
  const refs = paths.map((p) => `- ${p}`).join('\n');
  return `${base}\n\nAttached image file(s) (read them as needed):\n${refs}`;
}

const claudeCodeDriver = {
  id: 'claude-code',
  bin: 'claude',
  // Native memory file the CLI auto-loads each session (Claude family). Codex
  // will use 'AGENTS.md'. Memory converges on this file (read = native auto-load,
  // write = the agent self-maintains it).
  memoryFile: 'CLAUDE.md',
  // Subcommands for the in-app sign in / status / sign out buttons.
  auth: { login: ['auth', 'login'], status: ['auth', 'status'], logout: ['auth', 'logout'] },

  // params: { task, profile?, sessionId?, imagePaths?, appendSystemPrompt?,
  //           dangerouslySkipPermissions? }
  // Returns { bin, args, env, stdin }. The task (the only arbitrary, possibly
  // multi-line/quoted text) is delivered via stdin, NOT argv, so there is zero
  // command-line quoting risk on Windows; argv carries only fixed/known flags.
  buildLaunch(params = {}) {
    const profile = params.profile && typeof params.profile === 'object' ? params.profile : {};
    const stdin = composeClaudeTask(params.task, params.imagePaths);

    const args = ['-p', '--output-format', 'stream-json', '--verbose'];

    // Per-agent cwd: the project root is added so the agent can edit project files
    // from its private working dir.
    if (asString(params.projectRoot)) {
      args.push('--add-dir', String(params.projectRoot));
    }
    if (asString(params.sessionId)) {
      args.push('--resume', asString(params.sessionId));
    }
    const appendSystemPrompt = asString(params.appendSystemPrompt).trim();
    if (appendSystemPrompt) {
      args.push('--append-system-prompt', appendSystemPrompt);
    }
    // Autonomy gate. Honor ANGEL's existing dangerouslySkipPermissions setting;
    // otherwise auto-accept edits but keep other gates (acceptEdits).
    if (params.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    } else {
      args.push('--permission-mode', 'acceptEdits');
    }
    // Per-profile model override (the headless twin of /model). Accepts aliases
    // (opus/sonnet/haiku) or full ids; empty = the CLI's own default. Passed on
    // EVERY launch — headless runs don't remember the previous run's flag.
    const model = asString(profile.model).trim();
    if (model) args.push('--model', model);

    // Per-profile extra args (domestic presets generally need none).
    if (Array.isArray(profile.extraArgs)) {
      for (const a of profile.extraArgs) if (asString(a)) args.push(String(a));
    }

    // Domestic Claude-compatible providers (Kimi/GLM/Qwen/DeepSeek) are reached
    // purely by env override; the subscription profile passes no env.
    const env = profile.env && typeof profile.env === 'object' ? { ...profile.env } : {};

    return { bin: this.bin, args, env, stdin };
  },

  parseEvent: parseClaudeEvent,
};

// --- Codex driver ----------------------------------------------------------
// Codex's `exec --json` emits JSONL events (shapes captured live against
// codex-cli 0.142.1). Differences from Claude: prompt via stdin (`-`); native
// images via `-i`; no --append-system-prompt (persona folds into the prompt);
// resume is a subcommand; native memory file is AGENTS.md.

// Turn a completed Codex action item into a human tool name + structured args +
// a meaningful result string, so the timeline shows WHAT the agent did (a named,
// clickable card) instead of the generic item type. Field access is defensive:
// unknown shapes degrade to the item type rather than throwing.
// Codex spawns the model's command through an interpreter wrapper and its exec
// stream reports the FULL spawn line — on Windows every card led with
// `"C:\WINDOWS\...\powershell.exe" -Command "<cmd>"` instead of the command
// itself. Strip a recognized leading interpreter (powershell/pwsh/cmd/bash/sh/
// zsh, bare or full-path, quoted or not) down to the inner command for display;
// anything unrecognized passes through untouched. Pure → unit-tested.
export function stripShellWrapper(command) {
  const raw = asString(command).trim();
  if (!raw) return raw;
  const head = raw.match(/^(?:"([^"]+)"|'([^']+)'|(\S+))\s+/);
  if (!head) return raw;
  const exe = (head[1] || head[2] || head[3] || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
  let rest = raw.slice(head[0].length).trim();
  const unquote = (s) => {
    const t = s.trim();
    return (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))))
      ? t.slice(1, -1)
      : t;
  };

  if (exe === 'powershell' || exe === 'powershell.exe' || exe === 'pwsh' || exe === 'pwsh.exe') {
    // Skip common switches until -Command / -EncodedCommand.
    let m;
    while ((m = rest.match(/^-(?:nologo|noprofile|noninteractive|noexit|mta|sta|windowstyle\s+\S+|executionpolicy\s+\S+)\s+/i))) {
      rest = rest.slice(m[0].length);
    }
    const enc = rest.match(/^-(?:encodedcommand|ec|e)\s+(\S+)\s*$/i);
    if (enc) {
      // Base64(UTF-16LE) → text, best-effort (renderer has atob, tests have Buffer).
      try {
        if (typeof Buffer !== 'undefined') return Buffer.from(enc[1], 'base64').toString('utf16le') || raw;
        const bin = atob(enc[1]);
        let out = '';
        for (let i = 0; i + 1 < bin.length; i += 2) out += String.fromCharCode(bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8));
        return out || raw;
      } catch (_) { return raw; }
    }
    const c = rest.match(/^-(?:command|c)\s+/i);
    return c ? (unquote(rest.slice(c[0].length)) || raw) : raw;
  }

  if (exe === 'cmd' || exe === 'cmd.exe') {
    let m;
    while ((m = rest.match(/^\/(?:d|s|q|v:\S+|e:\S+)\s+/i))) rest = rest.slice(m[0].length);
    const c = rest.match(/^\/c\s+/i);
    return c ? (unquote(rest.slice(c[0].length)) || raw) : raw;
  }

  if (exe === 'bash' || exe === 'sh' || exe === 'zsh') {
    let m;
    while ((m = rest.match(/^-(?:l|i|li|il|lc|lic|c)\s+/))) {
      const flag = m[0].trim();
      rest = rest.slice(m[0].length);
      if (flag.includes('c')) return unquote(rest) || raw;
    }
    return raw;
  }

  return raw;
}

function describeCodexAction(item, itemType) {
  const status = asString(item.status);
  if (itemType === 'command_execution') {
    const cmd = stripShellWrapper(item.command);
    const firstLine = cmd.split('\n')[0].trim();
    const name = firstLine ? `$ ${firstLine.slice(0, 80)}` : 'shell';
    const out = asString(item.aggregated_output)
      || (item.exit_code != null ? `exit ${item.exit_code}` : '')
      || status || 'completed';
    return { name, args: { command: cmd, exit_code: item.exit_code, status }, output: out };
  }
  if (itemType === 'file_change') {
    const raw = item.changes;
    const changes = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' ? Object.entries(raw).map(([path, kind]) => ({ path, kind })) : []);
    const paths = changes.map((c) => asString(c?.path)).filter(Boolean);
    // Codex's exec stream gives only { path, kind } per file — no diff content
    // (verified live against 0.142.1; unified_diff exists only in its internal
    // patch_apply protocol). Show what IS there: "kind path" per file, so the
    // card/modal reads "update src/x.cpp / add note.md" instead of changes=[N].
    const basename = (p) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
    const fileLines = changes
      .map((c) => `${asString(c?.kind) || 'edit'} ${asString(c?.path)}`.trim())
      .filter((s) => s && s !== 'edit');
    const name = paths.length === 1 ? `edit ${basename(paths[0])}`
      : paths.length > 1 ? `edit ${paths.length} files`
      : 'file change';
    return {
      name,
      args: { files: fileLines.join('\n') || undefined, status },
      output: fileLines.join('\n') || status || 'completed',
    };
  }
  if (itemType === 'mcp_tool_call') {
    const server = asString(item.server);
    const tool = asString(item.tool);
    const name = tool ? (server ? `${server}.${tool}` : tool) : 'mcp tool';
    const rawArgs = item.arguments != null ? item.arguments : item.args;
    let parsedArgs = {};
    if (rawArgs && typeof rawArgs === 'object') parsedArgs = rawArgs;
    else if (typeof rawArgs === 'string') { try { parsedArgs = JSON.parse(rawArgs); } catch (_) { parsedArgs = { arguments: rawArgs }; } }
    const result = item.result != null ? item.result : item.output;
    const out = result == null ? (status || 'completed')
      : (typeof result === 'string' ? result : JSON.stringify(result));
    return { name, args: parsedArgs, output: out };
  }
  if (itemType === 'web_search') {
    const q = asString(item.query);
    return { name: q ? `search: ${q}` : 'web search', args: { query: q }, output: q || status || 'completed' };
  }
  return { name: itemType, args: item, output: status || 'completed' };
}

// Codex's fatal error/turn.failed events carry a message that is often ITSELF a
// serialized JSON blob (`{"type":"error","status":400,"error":{"message":"The
// 'x' model is not supported…"}}`, observed live on 0.142.1 with an unsupported
// -m). Extract the innermost human-readable message so the failure bubble shows
// the reason instead of raw JSON. Pure → unit-tested.
export function extractCodexErrorMessage(raw) {
  const text = asString(raw).trim();
  if (!text) return '';
  try {
    const obj = JSON.parse(text);
    const inner = (obj && typeof obj === 'object') ? (obj.error?.message ?? obj.message) : null;
    if (inner) return asString(inner);
  } catch (_) { /* not JSON — use as-is */ }
  return text;
}

function parseCodexEvent(obj) {
  if (!obj || typeof obj !== 'object') return { kind: 'ignore' };
  const type = asString(obj.type);

  if (type === 'thread.started') {
    return { kind: 'session', sessionId: asString(obj.thread_id) };
  }

  // Codex streams its plan/todo list across item.started → item.updated(*) →
  // item.completed, each carrying the FULL items (a full replace). Mirror every
  // phase so ANGEL's todo panel tracks progress live instead of only blipping in
  // the final state at the very end of the run.
  if ((type === 'item.started' || type === 'item.updated' || type === 'item.completed')
      && obj.item && typeof obj.item === 'object' && asString(obj.item.type) === 'todo_list') {
    return { kind: 'todo', items: normalizeTodoList(obj.item.items, 'codex') };
  }

  if (type === 'item.completed' && obj.item && typeof obj.item === 'object') {
    const item = obj.item;
    const itemType = asString(item.type);
    if (itemType === 'agent_message') {
      const text = asString(item.text);
      return text ? { kind: 'text', text } : { kind: 'ignore' };
    }
    // Completed actions (file edits, shell, MCP calls, web search) → show as a
    // named tool call + result pair in the timeline (describeCodexAction extracts
    // the real command/path/tool so it isn't a generic "mcp_tool_call" card).
    if (itemType === 'file_change' || itemType === 'command_execution' || itemType === 'mcp_tool_call' || itemType === 'web_search') {
      const id = asString(item.id) || `codex_${itemType}`;
      const desc = describeCodexAction(item, itemType);
      const isError = itemType === 'command_execution'
        ? Number(item.exit_code) > 0
        : asString(item.status) === 'failed';
      return {
        kind: 'batch',
        events: [
          { kind: 'tool_call', id, name: desc.name, args: desc.args },
          { kind: 'tool_result', toolUseId: id, output: desc.output, isError },
        ],
      };
    }
    return { kind: 'ignore' };
  }

  if (type === 'turn.completed') {
    const usage = obj.usage && typeof obj.usage === 'object' ? obj.usage : null;
    // Normalize the cached-token key so the runtime's usage reader (which expects
    // Claude's cache_read_input_tokens) works unchanged.
    const normUsage = usage
      ? { ...usage, cache_read_input_tokens: Number(usage.cached_input_tokens) || 0 }
      : null;
    return { kind: 'final', text: '', usage: normUsage, isError: false };
  }

  if (type === 'error') {
    return { kind: 'error', message: extractCodexErrorMessage(obj.message) || 'codex error' };
  }

  if (type === 'turn.failed') {
    return { kind: 'error', message: extractCodexErrorMessage(obj.error?.message) || 'codex turn failed' };
  }

  // turn.started, item.started, reasoning, etc. are not surfaced.
  return { kind: 'ignore' };
}

const codexDriver = {
  id: 'codex',
  bin: 'codex',
  memoryFile: 'AGENTS.md',
  auth: { login: ['login'], status: ['login', 'status'], logout: ['logout'] },

  buildLaunch(params = {}) {
    const profile = params.profile && typeof params.profile === 'object' ? params.profile : {};

    // Codex has no --append-system-prompt; fold persona + memory directive into
    // the prompt. Images ride as -i args, not in the text, so don't append them.
    const appended = asString(params.appendSystemPrompt).trim();
    const task = asString(params.task);
    const stdin = appended ? `${appended}\n\n${task}` : task;

    const args = ['exec', '--json', '--skip-git-repo-check'];

    // Autonomy gate (mirrors the Claude driver). Non-interactive writes/MCP need
    // full bypass; otherwise allow workspace writes within the sandbox.
    if (params.dangerouslySkipPermissions) {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    } else {
      args.push('-s', 'workspace-write');
    }

    // Per-agent cwd: allow editing the project from the agent's private workdir.
    if (asString(params.projectRoot)) {
      args.push('--add-dir', String(params.projectRoot));
    }

    if (Array.isArray(profile.extraArgs)) {
      for (const a of profile.extraArgs) if (asString(a)) args.push(String(a));
    }

    // The `resume` subcommand must come AFTER every exec-level option: it only
    // accepts its own option subset, and `-s` / `--add-dir` placed after `resume`
    // are hard clap errors (exit 2) — which killed every resume instantly and got
    // misread upstream as an expired session. Exec-level options BEFORE the
    // subcommand are accepted (verified live against codex-cli 0.142.1).
    if (asString(params.sessionId)) {
      args.push('resume', asString(params.sessionId));
    }

    // -i / -m exist in both exec's and resume's option sets, so after the
    // subcommand they're valid on both paths.
    const imagePaths = Array.isArray(params.imagePaths) ? params.imagePaths.filter(Boolean) : [];
    for (const p of imagePaths) args.push('-i', String(p));

    const model = asString(profile.model).trim();
    if (model) args.push('-m', model);

    // Trailing '-' = read the prompt from stdin.
    args.push('-');

    const env = profile.env && typeof profile.env === 'object' ? { ...profile.env } : {};
    return { bin: this.bin, args, env, stdin };
  },

  parseEvent: parseCodexEvent,
};

const CLI_AGENT_DRIVERS = {
  [claudeCodeDriver.id]: claudeCodeDriver,
  [codexDriver.id]: codexDriver,
};

export function getCliAgentDriver(driverId) {
  return CLI_AGENT_DRIVERS[asString(driverId)] || null;
}

export function listCliAgentDrivers() {
  return Object.keys(CLI_AGENT_DRIVERS);
}

// Exported for direct unit testing.
export { parseClaudeEvent, composeClaudeTask, claudeCodeDriver, parseCodexEvent, describeCodexAction, codexDriver, CLI_AGENT_DRIVERS };
