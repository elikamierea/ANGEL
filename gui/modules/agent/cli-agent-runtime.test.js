import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideResume,
  normalizeSessionRecord,
  toolCallProgressText,
  estimateCliContextTokens,
  resolveCliContextUsage,
  createCodexSnapshotTracker,
} from './cli-agent-runtime.js';

const profile = { id: 'claude-sub', driver: 'claude-code' };
const dir = 'F:/proj/agents/designer';

test('decideResume: same profile + cwd → resumes', () => {
  assert.equal(decideResume({ profileId: 'claude-sub', cwd: dir, sessionId: 's1' }, profile, dir), 's1');
});

test('decideResume: same driver, DIFFERENT profile (Claude↔Kimi) → fresh', () => {
  assert.equal(decideResume({ profileId: 'kimi-k2', driver: 'claude-code', cwd: dir, sessionId: 's1' }, profile, dir), '');
});

test('decideResume: different cwd (per-agent / moved) → fresh', () => {
  assert.equal(decideResume({ profileId: 'claude-sub', cwd: 'F:/proj/agents/programmer', sessionId: 's1' }, profile, dir), '');
});

test('decideResume: legacy session without profileId → fresh', () => {
  assert.equal(decideResume({ driver: 'claude-code', cwd: dir, sessionId: 's1' }, profile, dir), '');
});

test('decideResume: no prior / no profile → ""', () => {
  assert.equal(decideResume(null, profile, dir), '');
  assert.equal(decideResume({ profileId: 'claude-sub', cwd: dir, sessionId: 's1' }, null, dir), '');
});

test('normalizeSessionRecord: legacy single-object → byProfile map', () => {
  const r = normalizeSessionRecord({ profileId: 'claude-sub', driver: 'claude-code', cwd: dir, sessionId: 's1' });
  assert.equal(r.lastProfileId, 'claude-sub');
  assert.deepEqual(r.byProfile['claude-sub'], { profileId: 'claude-sub', driver: 'claude-code', cwd: dir, sessionId: 's1' });
});

test('normalizeSessionRecord: already a map → passthrough', () => {
  const raw = { lastProfileId: 'codex-sub', byProfile: { 'codex-sub': { profileId: 'codex-sub', driver: 'codex', cwd: dir, sessionId: 't1' } } };
  const r = normalizeSessionRecord(raw);
  assert.equal(r.lastProfileId, 'codex-sub');
  assert.equal(r.byProfile['codex-sub'].sessionId, 't1');
});

test('normalizeSessionRecord: null / empty → empty record', () => {
  assert.deepEqual(normalizeSessionRecord(null), { lastProfileId: '', byProfile: {} });
  assert.deepEqual(normalizeSessionRecord({}), { lastProfileId: '', byProfile: {} });
});

test('normalizeSessionRecord: legacy without profileId → keyed by driver', () => {
  const r = normalizeSessionRecord({ driver: 'claude-code', cwd: dir, sessionId: 's1' });
  assert.equal(r.lastProfileId, 'claude-code');
  assert.ok(r.byProfile['claude-code']);
});

// The tool-progress text must match the HTTP line byte-for-byte: the chat UI
// only renders the clickable/collapsible tool bubble when the thinking message
// starts with "[tool] " (agent-chat-ui-shell isToolProgressThinkingMessage).
test('toolCallProgressText: HTTP-line format, [tool] name(args)', () => {
  assert.equal(
    toolCallProgressText({ name: 'Bash', args: { command: 'ls -la' } }),
    '[tool] Bash(command=ls -la)'
  );
});

test('toolCallProgressText: no args → name()', () => {
  assert.equal(toolCallProgressText({ name: 'Read', args: {} }), '[tool] Read()');
  assert.equal(toolCallProgressText({ name: 'Read' }), '[tool] Read()');
});

test('toolCallProgressText: first two keys, arrays/objects summarized', () => {
  assert.equal(
    toolCallProgressText({ name: 'edit 2 files', args: { changes: [1, 2], status: 'completed', extra: 'x' } }),
    '[tool] edit 2 files(changes=[2], status=completed)'
  );
});

test('toolCallProgressText: missing name → tool', () => {
  assert.equal(toolCallProgressText({ args: {} }), '[tool] tool()');
});

// --- createCodexSnapshotTracker -------------------------------------------
// Codex only emits { path, kind } on file_change — no diff content.
// We use git show HEAD:<path> for before, toolReadByParams for after.

function makeGitShow(responses) {
  // responses: { path → content } — simulates `git show HEAD:<path>`
  return async (cmd) => {
    const m = cmd.match(/git show HEAD:(.+)$/);
    const p = m?.[1];
    if (p && p in responses) return { ok: true, code: 0, stdout: responses[p], stderr: '' };
    return { ok: false, code: 128, stdout: '', stderr: `fatal: path '${p}' not found` };
  };
}

function makeToolRead(responses) {
  // responses: { path → content }
  return async ({ path }) => {
    if (path in responses) return { content: responses[path], truncated: false };
    throw new Error(`ENOENT: ${path}`);
  };
}

test('snapshot tracker: update — git before + disk after', async () => {
  const tracker = createCodexSnapshotTracker({
    toolReadByParams: makeToolRead({ 'src/foo.cpp': 'int main() { return 0; }' }),
    runProjectCommand: makeGitShow({ 'src/foo.cpp': 'int main() {}' }),
    getProjectRoot: () => '',
  });
  const diff = await tracker.onCompleted('src/foo.cpp', 'update');
  assert.equal(diff?.relPath, 'src/foo.cpp');
  assert.equal(diff?.oldText, 'int main() {}');
  assert.equal(diff?.newText, 'int main() { return 0; }');
});

test('snapshot tracker: create — empty before, disk after', async () => {
  const tracker = createCodexSnapshotTracker({
    toolReadByParams: makeToolRead({ 'src/new.cpp': 'new file' }),
    runProjectCommand: makeGitShow({}),
    getProjectRoot: () => '',
  });
  const diff = await tracker.onCompleted('src/new.cpp', 'create');
  assert.equal(diff?.oldText, '');
  assert.equal(diff?.newText, 'new file');
});

test('snapshot tracker: delete — git before, empty after', async () => {
  const tracker = createCodexSnapshotTracker({
    toolReadByParams: makeToolRead({}),
    runProjectCommand: makeGitShow({ 'src/gone.cpp': 'deleted content' }),
    getProjectRoot: () => '',
  });
  const diff = await tracker.onCompleted('src/gone.cpp', 'delete');
  assert.equal(diff?.oldText, 'deleted content');
  assert.equal(diff?.newText, '');
});

test('snapshot tracker: update — file not in git, no pre-snapshot → null (graceful degrade)', async () => {
  const tracker = createCodexSnapshotTracker({
    toolReadByParams: makeToolRead({ 'src/untracked.cpp': 'content' }),
    runProjectCommand: makeGitShow({}), // 128 for unknown path
    getProjectRoot: () => '',
  });
  const diff = await tracker.onCompleted('src/untracked.cpp', 'update');
  // git exit 128 = not in HEAD; no pre-snapshot → degrade gracefully (no all-plus)
  assert.equal(diff, null);
});

test('snapshot tracker: onStarted + onCompleted → real diff for uncommitted file', async () => {
  let diskContent = 'const a = 1;';
  const tracker = createCodexSnapshotTracker({
    toolReadByParams: async ({ path }) => {
      if (path === 'src/script.js') return { content: diskContent, truncated: false };
      throw new Error(`ENOENT: ${path}`);
    },
    runProjectCommand: makeGitShow({}), // file not in git
    getProjectRoot: () => '',
  });
  // Snapshot before Codex writes (item.started).
  await tracker.onStarted('item42', ['src/script.js']);
  // Codex writes the file.
  diskContent = 'const a = 2;';
  // item.completed.
  const diff = await tracker.onCompleted('src/script.js', 'update', 'item42');
  assert.ok(diff !== null, 'pre-snapshot enables real diff');
  assert.equal(diff?.oldText, 'const a = 1;');
  assert.equal(diff?.newText, 'const a = 2;');
});

test('snapshot tracker: preloadUntrackedFiles → diff for untracked file', async () => {
  let diskContent = 'before content';
  const untrackedPaths = ['src/untracked.cpp'];
  const tracker = createCodexSnapshotTracker({
    toolReadByParams: async ({ path }) => {
      if (untrackedPaths.includes(path)) return { content: diskContent, truncated: false };
      throw new Error(`ENOENT: ${path}`);
    },
    runProjectCommand: async (cmd) => {
      if (cmd.includes('ls-files')) return { ok: true, code: 0, stdout: 'src/untracked.cpp\n', stderr: '' };
      return { ok: false, code: 128, stdout: '', stderr: 'not in HEAD' };
    },
    getProjectRoot: () => '',
  });
  await tracker.preloadUntrackedFiles();
  // Codex writes the file after preload.
  diskContent = 'after content';
  const diff = await tracker.onCompleted('src/untracked.cpp', 'update');
  assert.ok(diff !== null, 'preload should enable diff');
  assert.equal(diff?.oldText, 'before content');
  assert.equal(diff?.newText, 'after content');
});

test('snapshot tracker: absolute path stripped to relative', async () => {
  const tracker = createCodexSnapshotTracker({
    toolReadByParams: makeToolRead({ 'src/main.cpp': 'v2' }),
    runProjectCommand: makeGitShow({ 'src/main.cpp': 'v1' }),
    getProjectRoot: () => 'C:/Users/dev/project',
  });
  const diff = await tracker.onCompleted('C:\\Users\\dev\\project\\src\\main.cpp', 'update');
  assert.equal(diff?.relPath, 'src/main.cpp');
  assert.equal(diff?.oldText, 'v1');
  assert.equal(diff?.newText, 'v2');
});

test('snapshot tracker: no deps → null', async () => {
  const tracker = createCodexSnapshotTracker({});
  const diff = await tracker.onCompleted('src/x.cpp', 'update');
  assert.equal(diff, null);
});

test('snapshot tracker: toolRead throws → null', async () => {
  const tracker = createCodexSnapshotTracker({
    toolReadByParams: async () => { throw new Error('ENOENT'); },
    runProjectCommand: makeGitShow({ 'src/x.cpp': 'before' }),
    getProjectRoot: () => '',
  });
  const diff = await tracker.onCompleted('src/x.cpp', 'update');
  assert.equal(diff, null);
});

test('snapshot tracker: git command fails (not exit 128) → null', async () => {
  const tracker = createCodexSnapshotTracker({
    toolReadByParams: makeToolRead({ 'src/x.cpp': 'after' }),
    runProjectCommand: async () => ({ ok: false, code: 1, stdout: '', stderr: 'not a git repo' }),
    getProjectRoot: () => '',
  });
  const diff = await tracker.onCompleted('src/x.cpp', 'update');
  assert.equal(diff, null);
});
