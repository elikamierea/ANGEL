// Integration tests for createCodexSnapshotTracker with a real git repo.
// Each test creates an isolated temp directory, initialises git, commits a file,
// then runs the tracker — no mocks for git or the filesystem.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createCodexSnapshotTracker } from './cli-agent-runtime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'angel-snap-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  git('init');
  git('config', 'user.email', 'test@test.com');
  git('config', 'user.name', 'Test');
  return { dir, git };
}

function commitFile(dir, relPath, content) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  execFileSync('git', ['add', relPath], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'test commit'], { cwd: dir });
}

// runProjectCommand as the real app wires it: runs `cmd.exe /d /s /c <command>`
// in the project root. On Windows this matches production exactly.
// On non-Windows CI fallback to sh.
function makeRunProjectCommand(rootPath) {
  return async (command) => {
    try {
      const isWin = process.platform === 'win32';
      const stdout = isWin
        ? execSync(`cmd.exe /d /s /c ${command}`, { cwd: rootPath, timeout: 8000, encoding: 'buffer' })
        : execSync(command, { cwd: rootPath, timeout: 8000, encoding: 'buffer' });
      return { ok: true, code: 0, stdout: stdout.toString('utf8'), stderr: '' };
    } catch (e) {
      const code = e.status ?? -1;
      return { ok: false, code, stdout: (e.stdout ?? '').toString('utf8'), stderr: (e.stderr ?? '').toString('utf8') };
    }
  };
}

function makeToolRead(rootPath) {
  return async ({ path, offset = 1, limit = 2000 }) => {
    const abs = join(rootPath, path.replace(/\//g, '\\'));
    try {
      const content = readFileSync(abs, 'utf8');
      const lines = content.split('\n');
      const start = offset - 1;
      const slice = lines.slice(start, start + limit);
      const truncated = start + limit < lines.length;
      return { content: slice.join('\n'), truncated, nextOffset: truncated ? start + limit + 1 : null };
    } catch {
      throw new Error(`ENOENT: ${abs}`);
    }
  };
}

function makeTracker(dir) {
  return createCodexSnapshotTracker({
    toolReadByParams: makeToolRead(dir),
    runProjectCommand: makeRunProjectCommand(dir),
    getProjectRoot: () => dir,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('integration: update — shows diff between committed and current', async () => {
  const { dir } = makeRepo();
  try {
    commitFile(dir, 'src/main.cpp', 'int main() {}\n');
    // Modify file without committing (simulates what Codex does).
    writeFileSync(join(dir, 'src/main.cpp'), 'int main() { return 0; }\n', 'utf8');

    const tracker = makeTracker(dir);
    const diff = await tracker.onCompleted(join(dir, 'src/main.cpp'), 'update');

    assert.ok(diff !== null, 'diff should not be null for a committed file');
    assert.equal(diff.relPath, 'src/main.cpp');
    assert.equal(diff.oldText, 'int main() {}\n');
    assert.equal(diff.newText, 'int main() { return 0; }\n');
    assert.notEqual(diff.oldText, diff.newText, 'before and after should differ');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('integration: create — empty before, full file after', async () => {
  const { dir } = makeRepo();
  try {
    // Commit something so HEAD exists.
    commitFile(dir, 'placeholder.txt', 'x\n');
    // New file added by Codex, not committed.
    writeFileSync(join(dir, 'new_file.cpp'), 'class Foo {};\n', 'utf8');

    const tracker = makeTracker(dir);
    const diff = await tracker.onCompleted(join(dir, 'new_file.cpp'), 'create');

    assert.ok(diff !== null);
    assert.equal(diff.oldText, '');
    assert.equal(diff.newText, 'class Foo {};\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('integration: project not a git repo → null (graceful fallback)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'angel-snap-nogit-'));
  try {
    writeFileSync(join(dir, 'file.cpp'), 'content\n', 'utf8');

    const tracker = makeTracker(dir);
    const diff = await tracker.onCompleted(join(dir, 'file.cpp'), 'update');

    // "not a git repository" in stderr → gitShowFile returns null → tracker
    // returns null → UI falls back to plain tool_call bubble.
    assert.equal(diff, null, 'non-git project should produce null, not an all-green diff');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('integration: file not committed, no pre-snapshot → null (graceful degrade)', async () => {
  const { dir } = makeRepo();
  try {
    commitFile(dir, 'placeholder.txt', 'x\n');
    // Write file but don't git add/commit — Codex edits it, no item.started snapshot.
    writeFileSync(join(dir, 'untracked.cpp'), 'untracked content\n', 'utf8');

    const tracker = makeTracker(dir);
    // kind is 'update', file not in HEAD, no pre-snapshot → degrade gracefully
    const diff = await tracker.onCompleted(join(dir, 'untracked.cpp'), 'update');

    assert.equal(diff, null, 'uncommitted file with no pre-snapshot should produce null, not all-plus');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('integration: untracked update with pre-snapshot → real before/after diff', async () => {
  const { dir } = makeRepo();
  try {
    commitFile(dir, 'placeholder.txt', 'x\n');
    // Write the original file (not committed to git) — this is the "before" state.
    writeFileSync(join(dir, 'script.js'), 'const a = 1;\n', 'utf8');

    const tracker = makeTracker(dir);
    // Simulate item.started: snapshot before Codex writes.
    await tracker.onStarted('item1', [join(dir, 'script.js')]);
    // Simulate Codex writing the file.
    writeFileSync(join(dir, 'script.js'), 'const a = 2;\n', 'utf8');
    // Simulate item.completed.
    const diff = await tracker.onCompleted(join(dir, 'script.js'), 'update', 'item1');

    assert.ok(diff !== null, 'should produce a real diff via pre-snapshot');
    assert.equal(diff.oldText, 'const a = 1;\n', 'before should be the pre-snapshot content');
    assert.equal(diff.newText, 'const a = 2;\n', 'after should be the written content');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('integration: preloadUntrackedFiles → real diff for untracked file', async () => {
  const { dir } = makeRepo();
  try {
    commitFile(dir, 'placeholder.txt', 'x\n');
    // Write untracked file (the "before" state, not in git).
    writeFileSync(join(dir, 'game.cpp'), 'void init() {}\n', 'utf8');

    const tracker = makeTracker(dir);
    // Simulate run-start: preload all untracked files.
    await tracker.preloadUntrackedFiles();
    // Simulate Codex writing the file.
    writeFileSync(join(dir, 'game.cpp'), 'void init() { setup(); }\n', 'utf8');
    // Simulate item.completed (no id — preload lookup is by relPath).
    const diff = await tracker.onCompleted(join(dir, 'game.cpp'), 'update');

    assert.ok(diff !== null, 'preload should enable diff for untracked files');
    assert.equal(diff.oldText, 'void init() {}\n');
    assert.equal(diff.newText, 'void init() { setup(); }\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
