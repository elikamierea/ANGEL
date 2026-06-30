import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideResume, normalizeSessionRecord } from './cli-agent-runtime.js';

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
