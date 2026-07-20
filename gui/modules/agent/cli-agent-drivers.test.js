import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCliAgentDriver,
  listCliAgentDrivers,
  parseClaudeEvent,
  composeClaudeTask,
  claudeCodeDriver,
  parseCodexEvent,
  codexDriver,
  stripShellWrapper,
} from './cli-agent-drivers.js';

// --- shell-wrapper stripping (Windows powershell paths in codex commands) ---

test('stripShellWrapper: quoted powershell full path + -Command quoted', () => {
  assert.equal(
    stripShellWrapper('"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -Raw angel.json"'),
    'Get-Content -Raw angel.json'
  );
});

test('stripShellWrapper: pwsh with switches before -Command', () => {
  assert.equal(
    stripShellWrapper('pwsh -NoProfile -ExecutionPolicy Bypass -Command Get-ChildItem -Force'),
    'Get-ChildItem -Force'
  );
});

test('stripShellWrapper: cmd.exe /d /s /c', () => {
  assert.equal(stripShellWrapper('cmd.exe /d /s /c "dir /b src"'), 'dir /b src');
});

test('stripShellWrapper: bash -lc', () => {
  assert.equal(stripShellWrapper("bash -lc 'ls -la'"), 'ls -la');
  assert.equal(stripShellWrapper('bash -l -c "npm test"'), 'npm test');
});

test('stripShellWrapper: powershell -EncodedCommand decodes base64 utf16le', () => {
  const encoded = Buffer.from('echo hi', 'utf16le').toString('base64');
  assert.equal(stripShellWrapper(`powershell.exe -EncodedCommand ${encoded}`), 'echo hi');
});

test('stripShellWrapper: bare commands and unknown interpreters pass through', () => {
  assert.equal(stripShellWrapper('git status'), 'git status');
  assert.equal(stripShellWrapper('Get-Content -Raw angel.json'), 'Get-Content -Raw angel.json');
  assert.equal(stripShellWrapper('powershell script.ps1'), 'powershell script.ps1');
  assert.equal(stripShellWrapper(''), '');
});

test('codex parseEvent: command_execution strips the powershell wrapper in name and args', () => {
  const ev = parseCodexEvent({
    type: 'item.completed',
    item: { id: 'c9', type: 'command_execution', command: '"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem -Force"', aggregated_output: 'ok', exit_code: 0, status: 'completed' },
  });
  assert.equal(ev.kind, 'batch');
  assert.equal(ev.events[0].name, '$ Get-ChildItem -Force');
  assert.equal(ev.events[0].args.command, 'Get-ChildItem -Force');
});

// --- registry --------------------------------------------------------------

test('registry exposes the claude-code and codex drivers', () => {
  assert.deepEqual(listCliAgentDrivers(), ['claude-code', 'codex']);
  assert.equal(getCliAgentDriver('claude-code'), claudeCodeDriver);
  assert.equal(getCliAgentDriver('codex'), codexDriver);
  assert.equal(getCliAgentDriver('nope'), null);
});

// --- buildLaunch -----------------------------------------------------------

test('buildLaunch builds a base stream-json invocation with task on stdin', () => {
  const { bin, args, env, stdin } = claudeCodeDriver.buildLaunch({ task: 'do a thing' });
  assert.equal(bin, 'claude');
  // task is NOT in argv (delivered via stdin to avoid quoting); argv is fixed flags
  assert.deepEqual(args.slice(0, 4), ['-p', '--output-format', 'stream-json', '--verbose']);
  assert.ok(!args.includes('do a thing'));
  assert.equal(stdin, 'do a thing');
  // default autonomy gate = acceptEdits (not skip-permissions)
  assert.ok(args.includes('--permission-mode'));
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'acceptEdits');
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.deepEqual(env, {});
});

test('buildLaunch adds --resume when a sessionId is supplied', () => {
  const { args } = claudeCodeDriver.buildLaunch({ task: 't', sessionId: 'abc-123' });
  assert.equal(args[args.indexOf('--resume') + 1], 'abc-123');
});

test('buildLaunch honors dangerouslySkipPermissions', () => {
  const { args } = claudeCodeDriver.buildLaunch({ task: 't', dangerouslySkipPermissions: true });
  assert.ok(args.includes('--dangerously-skip-permissions'));
  assert.ok(!args.includes('--permission-mode'));
});

test('buildLaunch puts pasted image references on stdin, not argv', () => {
  const { args, stdin } = claudeCodeDriver.buildLaunch({ task: 'describe', imagePaths: ['.angel/attachments/a.png'] });
  assert.ok(stdin.includes('.angel/attachments/a.png'));
  assert.ok(!args.some((a) => a.includes('.angel/attachments/a.png')));
});

test('buildLaunch injects profile env (domestic provider override) and extraArgs', () => {
  const { args, env } = claudeCodeDriver.buildLaunch({
    task: 't',
    profile: {
      env: { ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic', ANTHROPIC_AUTH_TOKEN: 'tok' },
      extraArgs: ['--model', 'glm-4.6'],
    },
  });
  assert.equal(env.ANTHROPIC_BASE_URL, 'https://api.z.ai/api/anthropic');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'tok');
  assert.ok(args.includes('--model') && args.includes('glm-4.6'));
});

test('buildLaunch passes the profile model override as --model', () => {
  const { args } = claudeCodeDriver.buildLaunch({ task: 't', profile: { model: 'opus' } });
  assert.equal(args[args.indexOf('--model') + 1], 'opus');
});

test('buildLaunch omits --model when the profile has no model override', () => {
  const { args } = claudeCodeDriver.buildLaunch({ task: 't', profile: { model: '' } });
  assert.ok(!args.includes('--model'));
});

test('buildLaunch appends an appended system prompt', () => {
  const { args } = claudeCodeDriver.buildLaunch({ task: 't', appendSystemPrompt: 'You are the designer.' });
  assert.equal(args[args.indexOf('--append-system-prompt') + 1], 'You are the designer.');
});

test('composeClaudeTask references pasted image paths in the prompt', () => {
  const out = composeClaudeTask('describe this', ['.angel/attachments/a.png', '.angel/attachments/b.png']);
  assert.ok(out.startsWith('describe this'));
  assert.ok(out.includes('.angel/attachments/a.png'));
  assert.ok(out.includes('.angel/attachments/b.png'));
  // no images -> unchanged
  assert.equal(composeClaudeTask('plain', []), 'plain');
});

// --- parseEvent (fixtures mirror live claude 2.1.195 shapes) ---------------

test('parseEvent maps the init event to a session', () => {
  const e = parseClaudeEvent({ type: 'system', subtype: 'init', session_id: 'b88c0a35', model: 'claude-opus-4-8' });
  assert.deepEqual(e, { kind: 'session', sessionId: 'b88c0a35', model: 'claude-opus-4-8' });
});

test('parseEvent maps assistant text', () => {
  const e = parseClaudeEvent({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hi there' }] } });
  assert.deepEqual(e, { kind: 'text', text: 'hi there' });
});

test('parseEvent maps a tool_use to a tool_call with object args', () => {
  const e = parseClaudeEvent({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Write', input: { file_path: 'hello.txt', content: 'hi' } }] },
  });
  assert.equal(e.kind, 'tool_call');
  assert.equal(e.id, 'toolu_1');
  assert.equal(e.name, 'Write');
  assert.deepEqual(e.args, { file_path: 'hello.txt', content: 'hi' });
});

test('parseEvent surfaces TodoWrite as a todo event', () => {
  const todos = [{ content: 'step 1', status: 'pending' }];
  const e = parseClaudeEvent({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'TodoWrite', input: { todos } }] },
  });
  assert.deepEqual(e, { kind: 'todo', items: todos });
});

test('parseEvent maps a tool_result', () => {
  const e = parseClaudeEvent({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'File created', is_error: false }] },
  });
  assert.deepEqual(e, { kind: 'tool_result', toolUseId: 'toolu_1', output: 'File created', isError: false });
});

test('parseEvent batches multiple blocks in one message', () => {
  const e = parseClaudeEvent({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'doing it' }, { type: 'tool_use', id: 'x', name: 'Read', input: {} }],
      usage: { input_tokens: 10, output_tokens: 2 },
    },
  });
  assert.equal(e.kind, 'batch');
  assert.deepEqual(e.events.map((x) => x.kind), ['text', 'tool_call', 'usage']);
});

test('parseEvent maps the final result', () => {
  const e = parseClaudeEvent({
    type: 'result', subtype: 'success', is_error: false, result: 'Done.',
    total_cost_usd: 0.077, num_turns: 2, session_id: 'b88c0a35',
    usage: { input_tokens: 2409, output_tokens: 5 },
  });
  assert.equal(e.kind, 'final');
  assert.equal(e.text, 'Done.');
  assert.equal(e.isError, false);
  assert.equal(e.cost, 0.077);
  assert.equal(e.numTurns, 2);
  assert.equal(e.sessionId, 'b88c0a35');
});

test('parseEvent flags an error result', () => {
  const e = parseClaudeEvent({ type: 'result', subtype: 'error_during_execution', is_error: true, result: '' });
  assert.equal(e.kind, 'final');
  assert.equal(e.isError, true);
});

test('parseEvent ignores rate_limit_event and unknown shapes', () => {
  assert.deepEqual(parseClaudeEvent({ type: 'rate_limit_event' }), { kind: 'ignore' });
  assert.deepEqual(parseClaudeEvent(null), { kind: 'ignore' });
  assert.deepEqual(parseClaudeEvent({ type: 'whatever' }), { kind: 'ignore' });
});

// === Codex driver ==========================================================

test('codex memoryFile is AGENTS.md', () => {
  assert.equal(codexDriver.memoryFile, 'AGENTS.md');
  assert.equal(codexDriver.bin, 'codex');
});

test('codex buildLaunch: base exec, task+persona on stdin, prompt from -', () => {
  const { bin, args, stdin } = codexDriver.buildLaunch({ task: 'do it', appendSystemPrompt: 'You are P.' });
  assert.equal(bin, 'codex');
  assert.equal(args[0], 'exec');
  assert.ok(args.includes('--json') && args.includes('--skip-git-repo-check'));
  assert.equal(args[args.length - 1], '-'); // prompt from stdin
  assert.ok(!args.includes('do it'));
  assert.equal(stdin, 'You are P.\n\ndo it'); // persona folded into the prompt
  // default sandbox = workspace-write (not full bypass)
  assert.equal(args[args.indexOf('-s') + 1], 'workspace-write');
  assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
});

test('both drivers add --add-dir for the project root (per-agent cwd)', () => {
  const c = claudeCodeDriver.buildLaunch({ task: 't', projectRoot: 'F:/proj' });
  assert.equal(c.args[c.args.indexOf('--add-dir') + 1], 'F:/proj');
  const x = codexDriver.buildLaunch({ task: 't', projectRoot: 'F:/proj' });
  assert.equal(x.args[x.args.indexOf('--add-dir') + 1], 'F:/proj');
  // omitted when no projectRoot
  assert.ok(!claudeCodeDriver.buildLaunch({ task: 't' }).args.includes('--add-dir'));
});

test('codex buildLaunch: resume is a subcommand placed after every exec-level option', () => {
  const { args } = codexDriver.buildLaunch({ task: 't', sessionId: 'th-9', projectRoot: 'F:/proj' });
  assert.equal(args[0], 'exec');
  const at = args.indexOf('resume');
  assert.equal(args[at + 1], 'th-9');
  // `exec resume` rejects exec-only options (`-s`, `--add-dir`) with a clap
  // error, so they must all precede the subcommand.
  assert.ok(args.indexOf('-s') < at);
  assert.ok(args.indexOf('--add-dir') < at);
  assert.ok(args.indexOf('--json') < at);
  assert.ok(args.indexOf('--skip-git-repo-check') < at);
  assert.equal(args[args.length - 1], '-');
});

test('codex buildLaunch: skip-permissions => full bypass; images => -i; model => -m', () => {
  const { args } = codexDriver.buildLaunch({
    task: 't',
    dangerouslySkipPermissions: true,
    imagePaths: ['.angel/attachments/a.png', '.angel/attachments/b.png'],
    profile: { model: 'gpt-5-codex' },
  });
  assert.ok(args.includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.ok(!args.includes('-s'));
  assert.equal(args.filter((a) => a === '-i').length, 2);
  assert.ok(args.includes('.angel/attachments/a.png'));
  assert.equal(args[args.indexOf('-m') + 1], 'gpt-5-codex');
});

test('codex parseEvent: thread.started -> session', () => {
  assert.deepEqual(parseCodexEvent({ type: 'thread.started', thread_id: 'abc' }), { kind: 'session', sessionId: 'abc' });
});

test('codex parseEvent: agent_message -> text', () => {
  assert.deepEqual(
    parseCodexEvent({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'hello' } }),
    { kind: 'text', text: 'hello' },
  );
});

test('codex parseEvent: file_change -> named tool_call + tool_result batch', () => {
  const e = parseCodexEvent({ type: 'item.completed', item: { id: 'item_1', type: 'file_change', status: 'completed', changes: [{ path: 'x', kind: 'add' }] } });
  assert.equal(e.kind, 'batch');
  assert.deepEqual(e.events.map((x) => x.kind), ['tool_call', 'tool_result']);
  assert.equal(e.events[0].name, 'edit x'); // real path, not the generic item type
  assert.equal(e.events[0].args.files, 'add x'); // kind+path detail for the card/modal
  assert.equal(e.events[1].toolUseId, 'item_1');
});

test('codex parseEvent: multi-file file_change -> basename-free count name + per-file kind list', () => {
  const e = parseCodexEvent({
    type: 'item.completed',
    item: {
      id: 'item_2',
      type: 'file_change',
      status: 'completed',
      changes: [
        { path: 'F:\\proj\\src\\game\\a.cpp', kind: 'update' },
        { path: 'F:\\proj\\note.md', kind: 'add' },
        { path: 'F:\\proj\\old.txt', kind: 'delete' },
      ],
    },
  });
  assert.equal(e.events[0].name, 'edit 3 files');
  assert.equal(
    e.events[0].args.files,
    'update F:\\proj\\src\\game\\a.cpp\nadd F:\\proj\\note.md\ndelete F:\\proj\\old.txt'
  );
  assert.equal(e.events[1].output, e.events[0].args.files); // result mirrors the list
});

test('codex parseEvent: single-file file_change name uses the basename (full path stays in args)', () => {
  const e = parseCodexEvent({
    type: 'item.completed',
    item: { id: 'item_3', type: 'file_change', status: 'completed', changes: [{ path: 'F:\\proj\\src\\game\\player.cpp', kind: 'update' }] },
  });
  assert.equal(e.events[0].name, 'edit player.cpp');
  assert.equal(e.events[0].args.files, 'update F:\\proj\\src\\game\\player.cpp');
});

test('codex parseEvent: mcp_tool_call -> server.tool name + parsed args + result output', () => {
  const e = parseCodexEvent({
    type: 'item.completed',
    item: { id: 'm1', type: 'mcp_tool_call', server: 'angel', tool: 'get_mindmap', status: 'completed', arguments: '{"depth":2}', result: { nodes: 3 } },
  });
  assert.equal(e.events[0].name, 'angel.get_mindmap');
  assert.deepEqual(e.events[0].args, { depth: 2 });
  assert.equal(e.events[1].output, JSON.stringify({ nodes: 3 }));
  assert.equal(e.events[1].isError, false);
});

test('codex parseEvent: command_execution -> $ command name, aggregated output, exit-code error', () => {
  const e = parseCodexEvent({
    type: 'item.completed',
    item: { id: 'c1', type: 'command_execution', command: 'npm test\n--silent', aggregated_output: 'FAILED', exit_code: 1, status: 'completed' },
  });
  assert.equal(e.events[0].name, '$ npm test');
  assert.equal(e.events[1].output, 'FAILED');
  assert.equal(e.events[1].isError, true); // non-zero exit
});

test('codex parseEvent: web_search -> query name', () => {
  const e = parseCodexEvent({ type: 'item.completed', item: { id: 'w1', type: 'web_search', query: 'electron ipc', status: 'completed' } });
  assert.equal(e.events[0].name, 'search: electron ipc');
});

test('claude parseEvent: ExitPlanMode -> plan', () => {
  const e = parseClaudeEvent({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'p', name: 'ExitPlanMode', input: { plan: '## Steps\n1. do' } }] },
  });
  assert.equal(e.kind, 'plan');
  assert.equal(e.text, '## Steps\n1. do');
});

test('codex parseEvent: todo_list -> todo with {content,status}', () => {
  const e = parseCodexEvent({
    type: 'item.completed',
    item: { id: 'i', type: 'todo_list', items: [{ text: 'Read files', completed: true }, { text: 'Write code', completed: false }] },
  });
  assert.equal(e.kind, 'todo');
  assert.deepEqual(e.items, [
    { content: 'Read files', status: 'completed' },
    { content: 'Write code', status: 'pending' },
  ]);
});

test('codex parseEvent: todo_list mirrors on started/updated (live), not only completed', () => {
  for (const type of ['item.started', 'item.updated', 'item.completed']) {
    const e = parseCodexEvent({ type, item: { id: 'i', type: 'todo_list', items: [{ text: 'A', completed: false }] } });
    assert.equal(e.kind, 'todo', `${type} should mirror todos`);
    assert.deepEqual(e.items, [{ content: 'A', status: 'pending' }]);
  }
});

test('claude parseEvent: TodoWrite -> todo with {content,status} (activeForm dropped)', () => {
  const e = parseClaudeEvent({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'TodoWrite', input: { todos: [{ content: 'Step 1', status: 'in_progress', activeForm: 'Doing step 1' }] } }] },
  });
  assert.equal(e.kind, 'todo');
  assert.deepEqual(e.items, [{ content: 'Step 1', status: 'in_progress' }]);
});

test('codex parseEvent: turn.completed -> final with usage aliased', () => {
  const e = parseCodexEvent({ type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 5 } });
  assert.equal(e.kind, 'final');
  assert.equal(e.text, '');
  assert.equal(e.usage.cache_read_input_tokens, 80); // aliased for the runtime reader
  assert.equal(e.usage.input_tokens, 100);
});

// Fatal codex errors (captured live on 0.142.1 with an unsupported -m: the
// account-rejected model produced error + turn.failed whose message is itself a
// serialized JSON blob). The inner human message must surface, or the UI shows
// a bare "CLI agent exited (code 1)." with no reason.
test('codex parseEvent: error / turn.failed -> error with inner message extracted', () => {
  const nested = '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-5.3-codex\' model is not supported when using Codex with a ChatGPT account."}}';
  const e1 = parseCodexEvent({ type: 'error', message: nested });
  assert.equal(e1.kind, 'error');
  assert.match(e1.message, /model is not supported/);
  assert.doesNotMatch(e1.message, /invalid_request_error/); // inner text, not raw JSON
  const e2 = parseCodexEvent({ type: 'turn.failed', error: { message: nested } });
  assert.equal(e2.kind, 'error');
  assert.match(e2.message, /model is not supported/);
});

test('codex parseEvent: plain-text error message passes through', () => {
  assert.deepEqual(parseCodexEvent({ type: 'error', message: 'stream disconnected' }), { kind: 'error', message: 'stream disconnected' });
  assert.deepEqual(parseCodexEvent({ type: 'turn.failed' }), { kind: 'error', message: 'codex turn failed' });
});

test('codex parseEvent: ignores turn.started / item.started / unknown', () => {
  assert.deepEqual(parseCodexEvent({ type: 'turn.started' }), { kind: 'ignore' });
  assert.deepEqual(parseCodexEvent({ type: 'item.started', item: { type: 'file_change' } }), { kind: 'ignore' });
  assert.deepEqual(parseCodexEvent(null), { kind: 'ignore' });
});
