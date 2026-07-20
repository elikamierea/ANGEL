import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCliUsageSourceKey,
  getCliUsageWindowsForContext,
} from './agent-chat-ui-shell.js';

test('getCliUsageSourceKey keys cache by driver and base-url override flag', () => {
  assert.equal(getCliUsageSourceKey({ driver: 'codex', hasBaseUrlOverride: false }), 'codex|0');
  assert.equal(getCliUsageSourceKey({ driver: 'claude-code', hasBaseUrlOverride: true }), 'claude-code|1');
});

test('getCliUsageWindowsForContext returns cached windows only for the active source', () => {
  const windows = { ok: true, weekly: { percent: 35, resetAt: 123 } };
  const ctx = { supported: true, driver: 'codex', hasBaseUrlOverride: false };

  assert.equal(getCliUsageWindowsForContext(ctx, windows, 'codex|0'), windows);
  assert.equal(getCliUsageWindowsForContext(ctx, windows, 'claude-code|0'), null);
  assert.equal(getCliUsageWindowsForContext({ supported: false, driver: 'codex' }, windows, 'codex|0'), null);
});
