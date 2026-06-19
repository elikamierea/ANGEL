import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLoopReminderText,
  shouldTriggerAutoCompact,
  MAX_AGENT_LOOP_ROUNDS,
  AUTO_COMPACT_THRESHOLD,
  MIN_ROUNDS_BETWEEN_COMPACTS,
  TODO_REMINDER_STALE_ROUNDS,
  TODO_REMINDER_APPROACHING_ROUNDS,
} from './agent-runtime.js';

test('buildLoopReminderText returns "" when nothing is due', () => {
  assert.equal(buildLoopReminderText([], 0, 1), '');
  assert.equal(buildLoopReminderText([{ content: 'x', status: 'pending' }], 0, 1), '');
});

test('buildLoopReminderText reminds about a stale non-empty todo list', () => {
  const pending = [{ content: 'do thing', status: 'in_progress' }];
  const text = buildLoopReminderText(pending, TODO_REMINDER_STALE_ROUNDS, 1);
  assert.ok(text.includes('do thing'));
  assert.ok(text.includes(String(TODO_REMINDER_STALE_ROUNDS)));
});

test('buildLoopReminderText does not remind about an empty todo list even if stale', () => {
  assert.equal(buildLoopReminderText([], TODO_REMINDER_STALE_ROUNDS, 1), '');
});

test('buildLoopReminderText reminds when approaching the round limit', () => {
  const text = buildLoopReminderText([], 0, TODO_REMINDER_APPROACHING_ROUNDS);
  assert.ok(text.includes(String(MAX_AGENT_LOOP_ROUNDS)));
});

test('buildLoopReminderText combines both reminders when both conditions are due', () => {
  const pending = [{ content: 'finish report', status: 'pending' }];
  const text = buildLoopReminderText(pending, TODO_REMINDER_STALE_ROUNDS, TODO_REMINDER_APPROACHING_ROUNDS);
  assert.ok(text.includes('finish report'));
  assert.ok(text.includes(String(MAX_AGENT_LOOP_ROUNDS)));
  assert.ok(text.includes('\n\n'));
});

test('shouldTriggerAutoCompact triggers at exactly the threshold', () => {
  const atThreshold = { used: Math.round(AUTO_COMPACT_THRESHOLD * 1000), max: 1000 };
  assert.equal(shouldTriggerAutoCompact(atThreshold, MIN_ROUNDS_BETWEEN_COMPACTS, 0), true);
});

test('shouldTriggerAutoCompact does not trigger below threshold', () => {
  const below = { used: Math.floor(AUTO_COMPACT_THRESHOLD * 1000) - 1, max: 1000 };
  assert.equal(shouldTriggerAutoCompact(below, MIN_ROUNDS_BETWEEN_COMPACTS, 0), false);
});

test('shouldTriggerAutoCompact does not trigger when used is 0', () => {
  assert.equal(shouldTriggerAutoCompact({ used: 0, max: 1000 }, MIN_ROUNDS_BETWEEN_COMPACTS, 0), false);
});

test('shouldTriggerAutoCompact respects the MIN_ROUNDS_BETWEEN_COMPACTS guard', () => {
  const over = { used: 1000, max: 1000 };
  // Last compact was 1 round ago — too soon.
  assert.equal(shouldTriggerAutoCompact(over, MIN_ROUNDS_BETWEEN_COMPACTS, MIN_ROUNDS_BETWEEN_COMPACTS - 1), false);
  // Last compact was exactly MIN_ROUNDS_BETWEEN_COMPACTS rounds ago — allowed.
  assert.equal(shouldTriggerAutoCompact(over, MIN_ROUNDS_BETWEEN_COMPACTS * 2, MIN_ROUNDS_BETWEEN_COMPACTS), true);
});
