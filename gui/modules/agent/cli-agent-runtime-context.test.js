import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateCliContextTokens,
  resolveCliContextUsage,
} from './cli-agent-runtime.js';

test('estimateCliContextTokens sums cached, cache-write, input, and output tokens', () => {
  assert.equal(estimateCliContextTokens({
    cache_read_input_tokens: 1000,
    cache_creation_input_tokens: 200,
    input_tokens: 300,
    output_tokens: 40,
  }), 1540);
  assert.equal(estimateCliContextTokens(null), 0);
});

test('resolveCliContextUsage prefers latest turn usage over final cumulative usage', () => {
  const latest = { input_tokens: 60000 };
  const final = { input_tokens: 500000 };
  assert.equal(resolveCliContextUsage(latest, final), latest);
  assert.equal(resolveCliContextUsage(null, final), final);
  assert.equal(resolveCliContextUsage(null, null), null);
});
