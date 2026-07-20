import { test } from 'node:test';
import assert from 'node:assert/strict';
import { persistCliSessionPointer } from './cli-agent-runtime.js';

test('persistCliSessionPointer writes the per-profile session entry', async () => {
  const calls = [];
  const saveCliSession = async (...args) => { calls.push(args); };
  await persistCliSessionPointer(
    saveCliSession,
    'programmer',
    { id: 'codex-sub', driver: 'codex' },
    'F:/proj/agents/programmer',
    'th_123'
  );
  assert.deepEqual(calls, [[
    'programmer',
    'codex-sub',
    {
      profileId: 'codex-sub',
      driver: 'codex',
      cwd: 'F:/proj/agents/programmer',
      sessionId: 'th_123',
    },
  ]]);
});

test('persistCliSessionPointer is a no-op when required fields are missing', async () => {
  let called = false;
  const saveCliSession = async () => { called = true; };
  await persistCliSessionPointer(saveCliSession, '', { id: 'x', driver: 'codex' }, 'F:/proj', 'th_1');
  await persistCliSessionPointer(saveCliSession, 'a', null, 'F:/proj', 'th_1');
  await persistCliSessionPointer(saveCliSession, 'a', { id: 'x', driver: 'codex' }, '', 'th_1');
  await persistCliSessionPointer(saveCliSession, 'a', { id: 'x', driver: 'codex' }, 'F:/proj', '');
  assert.equal(called, false);
});
