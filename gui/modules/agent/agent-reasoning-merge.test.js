import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepMergeInto } from './agent-runtime.js';

// deepMergeInto is how a per-model, provider-native reasoning fragment is spliced
// into an outgoing payload at request time (no abstract->native mapping layer).

test('deepMergeInto adds a top-level reasoning field (GLM / chat kind)', () => {
  const extra = {};
  const out = deepMergeInto(extra, { reasoning_effort: 'max' });
  assert.equal(out, extra);
  assert.deepEqual(extra, { reasoning_effort: 'max' });
});

test('deepMergeInto adds a top-level thinking field (Anthropic)', () => {
  const payload = { model: 'claude-opus-4-8', max_tokens: 4096 };
  deepMergeInto(payload, { thinking: { type: 'adaptive' } });
  assert.deepEqual(payload, {
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
  });
});

test('deepMergeInto nests into existing generationConfig without clobbering siblings (Gemini)', () => {
  const payload = { generationConfig: { temperature: 0.7 } };
  deepMergeInto(payload, { generationConfig: { thinkingConfig: { thinkingBudget: 8192 } } });
  assert.deepEqual(payload, {
    generationConfig: { temperature: 0.7, thinkingConfig: { thinkingBudget: 8192 } },
  });
});

test('deepMergeInto creates generationConfig when missing (Gemini)', () => {
  const payload = { contents: [] };
  deepMergeInto(payload, { generationConfig: { thinkingConfig: { thinkingBudget: 0 } } });
  assert.deepEqual(payload.generationConfig, { thinkingConfig: { thinkingBudget: 0 } });
});

test('deepMergeInto is a no-op for null / non-object fragments', () => {
  const payload = { a: 1 };
  deepMergeInto(payload, null);
  deepMergeInto(payload, undefined);
  deepMergeInto(payload, 'nope');
  deepMergeInto(payload, [1, 2]);
  assert.deepEqual(payload, { a: 1 });
});

test('deepMergeInto overwrites arrays and scalars rather than merging them', () => {
  const payload = { stop: ['a'], depth: 1 };
  deepMergeInto(payload, { stop: ['b', 'c'], depth: 2 });
  assert.deepEqual(payload, { stop: ['b', 'c'], depth: 2 });
});
