import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecentCanonicalTurns, createAgentMemoryPreload } from './agent-memory-preload.js';

function snapshot(turns) {
  return JSON.stringify({ canonical: { turns } });
}

test('returns [] for falsy/empty input', () => {
  assert.deepEqual(buildRecentCanonicalTurns('', 1000), []);
  assert.deepEqual(buildRecentCanonicalTurns(null, 1000), []);
  assert.deepEqual(buildRecentCanonicalTurns(snapshot([]), 1000), []);
});

test('returns [] for invalid JSON or missing canonical.turns', () => {
  assert.deepEqual(buildRecentCanonicalTurns('not json', 1000), []);
  assert.deepEqual(buildRecentCanonicalTurns(JSON.stringify({}), 1000), []);
});

test('drops turns previously injected as memory recovery', () => {
  const raw = snapshot([
    { role: 'developer', text: 'long-term memory', recoveryInjected: true, messageKind: 'recovery' },
    { role: 'developer', text: 'recent memory', messageKind: 'recovery' },
    { role: 'user', text: 'hello' },
    { role: 'assistant', text: 'hi there' },
  ]);
  const turns = buildRecentCanonicalTurns(raw, 1000);
  assert.deepEqual(turns.map((t) => t.role), ['user', 'assistant']);
  assert.equal(turns[0].text, 'hello');
  assert.equal(turns[1].text, 'hi there');
});

test('groups turns into rounds by user-turn boundaries and keeps tool_call/tool_output pairs together', () => {
  const raw = snapshot([
    { role: 'user', text: 'do it' },
    { role: 'function_call', call_id: 'c1', name: 'read_file', arguments: '{"path":"a.txt"}' },
    { role: 'tool_output', call_id: 'c1', name: 'read_file', output: '{"ok":true}' },
    { role: 'assistant', text: 'done' },
    { role: 'user', text: 'thanks' },
    { role: 'assistant', text: 'np' },
  ]);
  const turns = buildRecentCanonicalTurns(raw, 1000);
  assert.deepEqual(turns.map((t) => `${t.role}:${t.text || t.output || ''}`), [
    'user:do it',
    'function_call:',
    'tool_output:{"ok":true}',
    'assistant:done',
    'user:thanks',
    'assistant:np',
  ]);
});

test('keeps only the most recent rounds within maxChars', () => {
  const raw = snapshot([
    { role: 'user', text: 'a'.repeat(50) },
    { role: 'assistant', text: 'b'.repeat(50) },
    { role: 'user', text: 'c'.repeat(50) },
    { role: 'assistant', text: 'd'.repeat(50) },
  ]);
  const turns = buildRecentCanonicalTurns(raw, 110);
  assert.deepEqual(turns.map((t) => t.text), ['c'.repeat(50), 'd'.repeat(50)]);
});

test('always keeps the most recent round even if it alone exceeds maxChars', () => {
  const raw = snapshot([
    { role: 'user', text: 'a'.repeat(50) },
    { role: 'user', text: 'b'.repeat(200) },
    { role: 'assistant', text: 'c'.repeat(200) },
  ]);
  const turns = buildRecentCanonicalTurns(raw, 100);
  assert.deepEqual(turns.map((t) => t.text), ['b'.repeat(200), 'c'.repeat(200)]);
});

test('a leading run of non-user turns forms its own round', () => {
  const raw = snapshot([
    { role: 'assistant', text: 'leftover' },
    { role: 'user', text: 'hi' },
  ]);
  const turns = buildRecentCanonicalTurns(raw, 1000);
  assert.deepEqual(turns.map((t) => t.text), ['leftover', 'hi']);
});

test('loadAgentMemoriesForActiveProject reconstructs recent turns from a latest.json spanning multiple read pages', async () => {
  const turns = [
    { role: 'user', text: 'hello there' },
    { role: 'assistant', text: 'hi, how can I help' },
  ];
  const snapshotJson = JSON.stringify({ canonical: { turns } }, null, 2);
  const lines = snapshotJson.split('\n');
  const mid = Math.ceil(lines.length / 2);
  const page1 = lines.slice(0, mid).join('\n');
  const page2 = lines.slice(mid).join('\n');

  const reads = [];
  async function toolReadByParams({ path, offset }) {
    reads.push({ path, offset });
    if (path.endsWith('latest.json')) {
      if (offset === 1) return { content: page1, truncated: true, nextOffset: mid + 1 };
      return { content: page2, truncated: false, nextOffset: null };
    }
    const err = new Error('not found');
    err.code = 'ENOENT';
    throw err;
  }

  const appendedTurns = [];
  const uiMessages = [];

  const preload = createAgentMemoryPreload({
    state: { projectRootPath: '/project' },
    agentChatState: { agents: [{ id: 'designer' }] },
    resetAgentChatSessionsForNewProject: () => {},
    renderAgentTimeline: () => {},
    renderAgentStatusBar: () => {},
    AGENT_MEMORY_FOLDER_BY_ID: { designer: 'designer' },
    AGENT_MEMORY_FILES: [],
    AGENT_MEMORY_READ_LIMIT: 2000,
    toolReadByParams,
    pushAgentMessage: (agentId, role, text, options) => {
      uiMessages.push({ agentId, role, text, options });
    },
    recordDeveloperText: null,
    appendCanonicalTurns: (agentId, items) => {
      appendedTurns.push(...items);
    },
    restoreAgentSession: () => false,
    formatSystemEventText: (text) => text,
    isMissingFileSystemError: (error) => error?.code === 'ENOENT',
    setStatus: () => {},
  });

  await preload.loadAgentMemoriesForActiveProject({ preferSessionRestore: false, quiet: true });

  const latestReads = reads.filter((r) => r.path.endsWith('latest.json'));
  assert.equal(latestReads.length, 2);
  assert.equal(latestReads[0].offset, 1);
  assert.equal(latestReads[1].offset, mid + 1);

  assert.deepEqual(appendedTurns.map((t) => t.text), ['hello there', 'hi, how can I help']);
  assert.ok(appendedTurns.every((t) => t.recoveryInjected === true && t.messageKind === 'recovery'));

  const reconstructedUi = uiMessages.filter((m) => m.role === 'user' || m.role === 'assistant');
  assert.deepEqual(reconstructedUi.map((m) => m.text), ['hello there', 'hi, how can I help']);
});
