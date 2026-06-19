import test from 'node:test';
import assert from 'node:assert/strict';

import { extractImageGenerationResults } from './agent-responses-core.js';

test('extracts OpenAI image_generation_call output (still PNG default)', () => {
  const images = extractImageGenerationResults({
    output: [{ type: 'image_generation_call', id: 'ig_1', result: 'AAAA' }],
  });
  assert.deepEqual(images, [{ base64: 'AAAA', mimeType: 'image/png', id: 'ig_1' }]);
});

test('extracts OpenAI content image parts', () => {
  const images = extractImageGenerationResults({
    output: [{ id: 'msg_1', content: [{ type: 'output_image', b64_json: 'BBBB' }] }],
  });
  assert.equal(images.length, 1);
  assert.equal(images[0].base64, 'BBBB');
  assert.equal(images[0].mimeType, 'image/png');
});

test('extracts OpenAI images endpoint data[]', () => {
  const images = extractImageGenerationResults({ data: [{ b64_json: 'CCCC' }] });
  assert.equal(images.length, 1);
  assert.equal(images[0].base64, 'CCCC');
});

test('extracts Gemini inlineData image with its real mimeType (camelCase)', () => {
  const images = extractImageGenerationResults({
    candidates: [{
      content: {
        role: 'model',
        parts: [
          { text: 'Here is the image.' },
          { inlineData: { mimeType: 'image/jpeg', data: 'DDDD' } },
        ],
      },
    }],
  });
  assert.deepEqual(images, [{ base64: 'DDDD', mimeType: 'image/jpeg', id: '' }]);
});

test('extracts Gemini inline_data snake_case variant and defaults missing mime to png', () => {
  const images = extractImageGenerationResults({
    candidates: [{ content: { parts: [{ inline_data: { data: 'EEEE' } }] } }],
  });
  assert.deepEqual(images, [{ base64: 'EEEE', mimeType: 'image/png', id: '' }]);
});

test('skips non-image Gemini inline parts (e.g. audio)', () => {
  const images = extractImageGenerationResults({
    candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: 'FFFF' } }] } }],
  });
  assert.deepEqual(images, []);
});

test('handles multiple Gemini candidates / parts', () => {
  const images = extractImageGenerationResults({
    candidates: [
      { content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'G1' } }] } },
      { content: { parts: [{ inlineData: { mimeType: 'image/webp', data: 'G2' } }] } },
    ],
  });
  assert.equal(images.length, 2);
  assert.equal(images[0].base64, 'G1');
  assert.equal(images[1].mimeType, 'image/webp');
});

test('returns empty array for an empty / unrelated response', () => {
  assert.deepEqual(extractImageGenerationResults({}), []);
  assert.deepEqual(extractImageGenerationResults({ choices: [{ message: { content: 'hi' } }] }), []);
});
