import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCliAgentRuntime } from './cli-agent-runtime.js';

// Drives a full requestCliAgentCompletion run against a fake cliAgent bridge so we
// can exercise the user-stop path. The regression under test: stopping a FIRST turn
// (persistSessionOnAbort=false) must still persist the CLI session when the turn
// already produced output — otherwise the next message resumes nothing and the UI's
// kept-on-screen partial turn desyncs from the model ("stopping loses all chat").

function makeHarness() {
  let eventCb = null;
  let capturedRunId = '';
  const savedSessions = [];

  const electronAPI = {
    cliAgent: {
      onEvent(cb) { eventCb = cb; return () => { eventCb = null; }; },
      async start({ runId }) { capturedRunId = runId; },
      cancel() {},
    },
  };

  const runtime = createCliAgentRuntime({
    electronAPI,
    getProjectRoot: () => 'F:/proj',
    resolveActiveCliProfile: () => ({ id: 'claude-sub', driver: 'claude-code', model: 'claude-x' }),
    getDangerouslySkipPermissions: () => false,
    loadAppendSystemPrompt: async () => '',
    loadCliSession: async () => null,
    saveCliSession: async (...args) => { savedSessions.push(args); },
    getAgentWorkdir: () => 'F:/proj/agents/a',
    applyAgentTodos: () => {},
    showAgentPlan: () => {},
    notifyAgent: () => {},
    toolReadByParams: async () => ({ content: '' }),
    runProjectCommand: async () => ({ ok: false, code: 1, stdout: '', stderr: '' }),
    t: (k) => k,
  });

  const emit = async (data) => { if (eventCb) await eventCb({ runId: capturedRunId, ...data }); };
  const line = (obj) => emit({ kind: 'line', line: JSON.stringify(obj) });
  const waitForStart = async () => {
    for (let i = 0; i < 50 && !capturedRunId; i++) await new Promise((r) => setTimeout(r, 0));
  };

  return { runtime, savedSessions, emit, line, waitForStart };
}

test('first-turn user-stop persists the session when the turn produced output', async () => {
  const h = makeHarness();
  const controller = new AbortController();
  const runPromise = h.runtime.requestCliAgentCompletion({
    prompt: 'hi',
    agentId: 'a',
    signal: controller.signal,
    persistSessionOnAbort: false, // first turn
  });

  await h.waitForStart();
  await h.line({ type: 'system', subtype: 'init', session_id: 'sess_1', model: 'claude-x' });
  await h.line({ type: 'assistant', message: { content: [{ type: 'text', text: 'working...' }] } });
  controller.abort();
  await h.emit({ kind: 'close', code: 1, stderr: '' });

  await assert.rejects(runPromise, (err) => err?.name === 'AbortError');
  assert.equal(h.savedSessions.length, 1, 'session should persist because output was produced');
  assert.equal(h.savedSessions[0][2].sessionId, 'sess_1');
});

test('first-turn user-stop does NOT persist when nothing was produced', async () => {
  const h = makeHarness();
  const controller = new AbortController();
  const runPromise = h.runtime.requestCliAgentCompletion({
    prompt: 'hi',
    agentId: 'a',
    signal: controller.signal,
    persistSessionOnAbort: false, // first turn
  });

  await h.waitForStart();
  // Session id is captured (Claude emits init immediately) but no text/tool output.
  await h.line({ type: 'system', subtype: 'init', session_id: 'sess_1', model: 'claude-x' });
  controller.abort();
  await h.emit({ kind: 'close', code: 1, stderr: '' });

  await assert.rejects(runPromise, (err) => err?.name === 'AbortError');
  assert.equal(h.savedSessions.length, 0, 'no output → treated as never-sent → no session persisted');
});

test('continuation-turn user-stop persists even without output (caller opted in)', async () => {
  const h = makeHarness();
  const controller = new AbortController();
  const runPromise = h.runtime.requestCliAgentCompletion({
    prompt: 'continue',
    agentId: 'a',
    signal: controller.signal,
    persistSessionOnAbort: true, // continuation
  });

  await h.waitForStart();
  await h.line({ type: 'system', subtype: 'init', session_id: 'sess_1', model: 'claude-x' });
  controller.abort();
  await h.emit({ kind: 'close', code: 1, stderr: '' });

  await assert.rejects(runPromise, (err) => err?.name === 'AbortError');
  assert.equal(h.savedSessions.length, 1, 'continuation turns always persist on abort');
});
