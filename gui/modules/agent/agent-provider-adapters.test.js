import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCanonicalConversation,
  buildOpenAIResponsesPayload,
  buildAnthropicMessagesPayload,
  buildGeminiGenerateContentPayload,
  buildCodexResponsesPayload,
  createProviderCanonicalAdapter,
  normalizeCallIds,
} from './agent-provider-adapters.js';

// --- buildCanonicalConversation ------------------------------------------

test('buildCanonicalConversation maps timeline roles and appends developer prompt', () => {
  const turns = buildCanonicalConversation({
    systemPrompt: 'You are helpful.',
    developerPrompt: 'Follow house style.',
    timeline: [
      { role: 'user', text: 'hi' },
      { role: 'agent', text: 'hello' },
      { role: 'developer', text: 'note' },
      { role: 'function_call', call_id: 'c1', name: 'read_file', arguments: '{}' },
      { role: 'tool_output', call_id: 'c1', name: 'read_file', output: '{"ok":true}' },
    ],
  });

  assert.deepEqual(turns.map((t) => t.role), [
    'system', 'user', 'assistant', 'system', 'function_call', 'tool_output', 'system',
  ]);
  assert.equal(turns[0].text, 'You are helpful.');
  assert.equal(turns[2].text, 'hello'); // 'agent' role normalized to 'assistant'
  assert.equal(turns[turns.length - 1].text, 'Follow house style.');
});

test('buildCanonicalConversation moves excluded tool_output turns to the end and respects historyLimit', () => {
  const turns = buildCanonicalConversation({
    historyLimit: 1,
    timeline: [
      { role: 'user', text: 'first' },
      { role: 'tool_output', call_id: 'c0', name: 'noop', output: '{}', includeInContext: false },
      { role: 'user', text: 'second' },
    ],
  });

  // historyLimit keeps only the last in-context item ('second'); the excluded
  // tool_output is appended afterwards regardless of the limit.
  assert.deepEqual(turns.map((t) => t.text || t.role), ['second', 'tool_output']);
  assert.equal(turns[1].includeInContext, false);
});

// --- normalizeCallIds -------------------------------------------------------

test('normalizeCallIds leaves non-empty call_ids and unrelated turns untouched', () => {
  const turns = [
    { role: 'user', text: 'hi' },
    { role: 'function_call', call_id: 'call_1', name: 'read_file', arguments: '{}', index: 1 },
    { role: 'tool_output', call_id: 'call_1', output: '{"ok":true}', index: 2 },
  ];
  const normalized = normalizeCallIds(turns);
  assert.deepEqual(normalized, turns);
});

test('normalizeCallIds synthesizes matching ids for empty-call_id function_call/tool_output pairs, paired by order', () => {
  const turns = [
    { role: 'user', text: 'do two things' },
    { role: 'function_call', call_id: '', name: 'search', arguments: '{"q":"a"}', index: 1 },
    { role: 'function_call', call_id: '', name: 'search', arguments: '{"q":"b"}', index: 2 },
    { role: 'tool_output', call_id: '', name: 'search', output: '{"ok":true,"q":"a"}', index: 3 },
    { role: 'tool_output', call_id: '', name: 'search', output: '{"ok":true,"q":"b"}', index: 4 },
  ];
  const normalized = normalizeCallIds(turns);

  const [, callA, callB, outA, outB] = normalized;
  assert.ok(callA.call_id);
  assert.ok(callB.call_id);
  assert.notEqual(callA.call_id, callB.call_id);
  assert.equal(outA.call_id, callA.call_id);
  assert.equal(outB.call_id, callB.call_id);

  // original turns are not mutated
  assert.equal(turns[1].call_id, '');
});

// --- buildOpenAIResponsesPayload ------------------------------------------

test('buildOpenAIResponsesPayload maps system/user/assistant turns and previousResponseId', () => {
  const payload = buildOpenAIResponsesPayload({
    model: 'gpt-test',
    tools: [],
    turns: [
      { role: 'system', text: 'sys' },
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ],
    previousResponseId: 'resp_123',
  });

  assert.equal(payload.model, 'gpt-test');
  assert.equal(payload.previous_response_id, 'resp_123');
  assert.deepEqual(payload.input[0], { role: 'developer', content: [{ type: 'input_text', text: 'sys' }] });
  assert.deepEqual(payload.input[1], { role: 'user', content: [{ type: 'input_text', text: 'hi' }] });
  assert.deepEqual(payload.input[2], { role: 'assistant', content: [{ type: 'output_text', text: 'hello' }] });
});

test('buildOpenAIResponsesPayload maps user images and function_call/tool_output turns', () => {
  const payload = buildOpenAIResponsesPayload({
    model: 'gpt-test',
    tools: [],
    turns: [
      { role: 'user', text: 'look', images: [{ dataUrl: 'data:image/png;base64,AAAA' }] },
      { role: 'function_call', call_id: 'c1', name: 'read_file', arguments: '{"path":"a.txt"}' },
      { role: 'tool_output', call_id: 'c1', output: '{"ok":true}' },
    ],
  });

  assert.deepEqual(payload.input[0].content, [
    { type: 'input_text', text: 'look' },
    { type: 'input_image', image_url: 'data:image/png;base64,AAAA' },
  ]);
  assert.deepEqual(payload.input[1], { type: 'function_call', call_id: 'c1', name: 'read_file', arguments: '{"path":"a.txt"}' });
  assert.deepEqual(payload.input[2], { type: 'function_call_output', call_id: 'c1', output: '{"ok":true}' });
  assert.equal(payload.previous_response_id, undefined);
});

// --- buildAnthropicMessagesPayload ----------------------------------------

test('buildAnthropicMessagesPayload concatenates system turns and normalizes tools', () => {
  const payload = buildAnthropicMessagesPayload({
    model: 'claude-test',
    tools: [
      { type: 'function', function: { name: 'read_file', description: 'reads a file', parameters: { type: 'object', properties: {} } } },
      { type: 'not_a_function' },
    ],
    turns: [
      { role: 'system', text: 'first line' },
      { role: 'system', text: 'second line' },
      { role: 'user', text: 'hi' },
    ],
  });

  assert.equal(payload.system, 'first line\n\nsecond line');
  assert.equal(payload.max_tokens, 4096);
  assert.deepEqual(payload.messages[0], { role: 'user', content: [{ type: 'text', text: 'hi' }] });
  assert.equal(payload.tools.length, 1);
  assert.equal(payload.tools[0].name, 'read_file');
});

test('buildAnthropicMessagesPayload maps images, function_call and tool_output turns', () => {
  const payload = buildAnthropicMessagesPayload({
    model: 'claude-test',
    tools: [],
    turns: [
      { role: 'user', text: 'look', images: [{ dataUrl: 'data:image/png;base64,AAAA' }] },
      { role: 'assistant', text: 'ok' },
      { role: 'function_call', call_id: 'toolu_1', name: 'read_file', arguments: '{"path":"a.txt"}' },
      { role: 'tool_output', call_id: 'toolu_1', output: '{"ok":true}' },
    ],
  });

  assert.deepEqual(payload.messages[0].content, [
    { type: 'text', text: 'look' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
  ]);
  assert.deepEqual(payload.messages[1], { role: 'assistant', content: [{ type: 'text', text: 'ok' }] });
  assert.deepEqual(payload.messages[2], {
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'a.txt' } }],
  });
  assert.deepEqual(payload.messages[3], {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"ok":true}' }],
  });
});

// --- buildGeminiGenerateContentPayload ------------------------------------

test('buildGeminiGenerateContentPayload joins system texts and maps a plain user turn', () => {
  const payload = buildGeminiGenerateContentPayload({
    tools: [],
    turns: [
      { role: 'system', text: 'sys one' },
      { role: 'system', text: 'sys two' },
      { role: 'user', text: 'hi' },
    ],
  });

  assert.deepEqual(payload.systemInstruction, { parts: [{ text: 'sys one\n\nsys two' }] });
  assert.deepEqual(payload.contents, [{ role: 'user', parts: [{ text: 'hi' }] }]);
});

test('buildGeminiGenerateContentPayload replays providerMeta.gemini.rawContent verbatim only when the turn came from this same provider', () => {
  const rawAssistant = { role: 'model', parts: [{ text: 'hello' }], extra: 'kept' };
  const rawCall = { role: 'model', parts: [{ functionCall: { name: 'read_file', args: {}, id: 'fc1' }, thoughtSignature: 'sig123' }] };

  const payload = buildGeminiGenerateContentPayload({
    tools: [],
    providerId: 'google',
    turns: [
      { role: 'assistant', text: 'hello', providerId: 'google', providerMeta: { gemini: { rawContent: rawAssistant } } },
      { role: 'function_call', call_id: 'fc1', name: 'read_file', arguments: '{}', providerId: 'google', providerMeta: { gemini: { rawContent: rawCall } } },
    ],
  });

  assert.deepEqual(payload.contents[0], rawAssistant);
  assert.deepEqual(payload.contents[1], rawCall);
  // verbatim replay must be a clone, not the same reference
  assert.notEqual(payload.contents[0], rawAssistant);
});

test('buildGeminiGenerateContentPayload falls back to generic reconstruction for rawContent from a different provider', () => {
  const rawCall = { role: 'model', parts: [{ functionCall: { name: 'read_file', args: {}, id: 'fc1' }, thoughtSignature: 'sig123' }] };

  const payload = buildGeminiGenerateContentPayload({
    tools: [],
    providerId: 'google',
    turns: [
      // This turn was produced by a different provider; even though it somehow
      // carries a providerMeta.gemini bucket, it must not be replayed verbatim.
      { role: 'function_call', call_id: 'fc1', name: 'read_file', arguments: '{"path":"a.txt"}', providerId: 'openai', providerMeta: { gemini: { rawContent: rawCall } } },
    ],
  });

  assert.equal(payload.contents[0].role, 'model');
  assert.deepEqual(payload.contents[0].parts[0].functionCall, { name: 'read_file', args: { path: 'a.txt' }, id: 'fc1' });
});

test('buildGeminiGenerateContentPayload generically reconstructs assistant/function_call turns without rawContent', () => {
  const payload = buildGeminiGenerateContentPayload({
    tools: [],
    turns: [
      { role: 'assistant', text: 'hello' },
      { role: 'function_call', call_id: 'fc1', name: 'read_file', arguments: '{"path":"a.txt"}' },
    ],
  });

  assert.deepEqual(payload.contents[0], { role: 'model', parts: [{ text: 'hello' }] });
  assert.equal(payload.contents[1].role, 'model');
  assert.deepEqual(payload.contents[1].parts[0].functionCall, { name: 'read_file', args: { path: 'a.txt' }, id: 'fc1' });
});

test('buildGeminiGenerateContentPayload fills in a placeholder thought_signature when a functionCall part has none', () => {
  const payload = buildGeminiGenerateContentPayload({
    tools: [],
    providerId: 'google',
    turns: [
      // No call_id / no providerMeta -> generic reconstruction, no signature.
      { role: 'function_call', call_id: 'fc1', name: 'read_file', arguments: '{}' },
      // Replayed rawContent that already carries a real signature must be preserved.
      { role: 'function_call', call_id: 'fc2', name: 'search', arguments: '{}', providerId: 'google', providerMeta: { gemini: { rawContent: { role: 'model', parts: [{ functionCall: { name: 'search', args: {}, id: 'fc2' }, thoughtSignature: 'real-signature' }] } } } },
    ],
  });

  assert.equal(payload.contents[0].parts[0].thoughtSignature, 'context_engineering_is_the_way_to_go');
  assert.equal(payload.contents[1].parts[0].thoughtSignature, 'real-signature');
});

test('buildGeminiGenerateContentPayload maps user turn images to inlineData parts', () => {
  const payload = buildGeminiGenerateContentPayload({
    tools: [],
    turns: [
      { role: 'user', text: 'look at this', images: [{ dataUrl: 'data:image/png;base64,AAAA' }] },
    ],
  });

  assert.deepEqual(payload.contents[0], {
    role: 'user',
    parts: [
      { text: 'look at this' },
      { inlineData: { mimeType: 'image/png', data: 'AAAA' } },
    ],
  });
});

test('buildGeminiGenerateContentPayload maps tool_output turns, parsing JSON output when possible', () => {
  const payload = buildGeminiGenerateContentPayload({
    tools: [],
    turns: [
      { role: 'tool_output', call_id: 'fc1', name: 'read_file', output: '{"ok":true,"content":"hi"}' },
      { role: 'tool_output', call_id: 'fc2', name: 'noop', output: 'plain text' },
    ],
  });

  assert.deepEqual(payload.contents[0], {
    role: 'user',
    parts: [{ functionResponse: { name: 'read_file', response: { result: { ok: true, content: 'hi' } }, id: 'fc1' } }],
  });
  assert.deepEqual(payload.contents[1], {
    role: 'user',
    parts: [{ functionResponse: { name: 'noop', response: { result: { output: 'plain text' } }, id: 'fc2' } }],
  });
});

test('buildGeminiGenerateContentPayload normalizes tools and strips additionalProperties', () => {
  const payload = buildGeminiGenerateContentPayload({
    tools: [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'reads a file',
          parameters: { type: 'object', properties: { path: { type: 'string' } }, additionalProperties: false },
        },
      },
      { type: 'not_a_function' },
    ],
    turns: [],
  });

  assert.equal(payload.tools[0].functionDeclarations.length, 1);
  const fn = payload.tools[0].functionDeclarations[0];
  assert.equal(fn.name, 'read_file');
  assert.equal(fn.parameters.additionalProperties, undefined);
  assert.deepEqual(fn.parameters.properties, { path: { type: 'string' } });
});

// --- buildCodexResponsesPayload -------------------------------------------

test('buildCodexResponsesPayload extracts instructions and drops the developer message from input', () => {
  const payload = buildCodexResponsesPayload({
    model: 'codex-test',
    tools: [],
    turns: [
      { role: 'system', text: 'be concise' },
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
      { role: 'function_call', call_id: 'c1', name: 'read_file', arguments: '{}' },
      { role: 'tool_output', call_id: 'c1', output: '{"ok":true}' },
    ],
    previousResponseId: 'resp_1',
  });

  assert.equal(payload.instructions, 'be concise');
  assert.deepEqual(payload.input.map((i) => i.type), ['message', 'message', 'function_call', 'function_call_output']);
  assert.equal(payload.input[0].role, 'user');
  assert.equal(payload.input[1].role, 'assistant');
  assert.equal(payload.previous_response_id, 'resp_1');
  assert.equal(payload.store, false);
  assert.equal(payload.parallel_tool_calls, false);
});

test('buildCodexResponsesPayload defaults instructions when no system/developer turn is present', () => {
  const payload = buildCodexResponsesPayload({
    model: 'codex-test',
    tools: [],
    turns: [{ role: 'user', text: 'hi' }],
  });

  assert.equal(payload.instructions, 'You are Codex.');
});

// --- createProviderCanonicalAdapter ----------------------------------------

test('createProviderCanonicalAdapter (gemini): metaFromResponse and turn builders', () => {
  const adapter = createProviderCanonicalAdapter({ providerId: 'gemini', providerKind: 'gemini', method: '', model: 'gemini-test' });

  const meta = adapter.metaFromResponse({
    candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] }, finishReason: 'STOP' }],
    usageMetadata: { totalTokens: 5 },
    promptFeedback: { blockReason: null },
  });
  assert.deepEqual(meta.gemini.rawContent, { role: 'model', parts: [{ text: 'hi' }] });
  assert.equal(meta.gemini.finishReason, 'STOP');

  // Gemini function calls often arrive without an id.
  const callTurn = adapter.functionCallTurn({ id: '', name: 'search', argumentsText: '{"q":"x"}' }, 'thinking');
  assert.equal(callTurn.call_id, '');
  assert.equal(callTurn.providerId, 'gemini');
  assert.deepEqual(callTurn.providerMeta.gemini.functionCall, { id: '', name: 'search', args: { q: 'x' } });

  const outputTurn = adapter.toolOutputTurn({ id: 'fc1', name: 'search' }, { ok: true, result: 'hits' });
  assert.equal(outputTurn.output, JSON.stringify({ ok: true, result: 'hits' }));
  assert.deepEqual(outputTurn.providerMeta.gemini.functionResponse, { id: 'fc1', name: 'search' });
});

test('createProviderCanonicalAdapter (anthropic): metaFromResponse and turn builders', () => {
  const adapter = createProviderCanonicalAdapter({ providerId: 'anthropic', providerKind: 'anthropic', method: '', model: 'claude-test' });

  const meta = adapter.metaFromResponse({
    id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'hi' }],
    usage: { input_tokens: 1 }, stop_reason: 'end_turn', stop_sequence: null,
  });
  assert.equal(meta.anthropic.id, 'msg_1');
  assert.equal(meta.anthropic.stopReason, 'end_turn');
  assert.equal(meta.anthropic.stopSequence, '');

  const callTurn = adapter.functionCallTurn({ id: 'toolu_1', name: 'read_file', argumentsText: '{"path":"a.txt"}' });
  assert.deepEqual(callTurn.providerMeta.anthropic, { toolUseId: 'toolu_1', toolName: 'read_file', input: { path: 'a.txt' } });

  const outputTurn = adapter.toolOutputTurn({ id: 'toolu_1', name: 'read_file' }, { ok: true, result: { _attachImages: [{ id: 'img1' }], text: 'done' } });
  const parsedOutput = JSON.parse(outputTurn.output);
  assert.equal(parsedOutput.result._attachImages, '[attached]');
  assert.equal(parsedOutput.result.text, 'done');
  assert.equal(outputTurn.providerMeta.anthropic.toolUseId, 'toolu_1');
});

test('createProviderCanonicalAdapter (openai api_key vs codex oauth): providerMeta buckets differ', () => {
  const openaiAdapter = createProviderCanonicalAdapter({ providerId: 'openai', providerKind: 'responses', method: 'api_key', model: 'gpt-test' });
  const codexAdapter = createProviderCanonicalAdapter({ providerId: 'openai', providerKind: 'responses', method: 'oauth', model: 'gpt-test' });

  const openaiMeta = openaiAdapter.metaFromResponse({ id: 'resp_1', output_text: 'hi', status: 'completed' });
  assert.equal(openaiMeta.openai.responseId, 'resp_1');
  assert.equal(openaiMeta.openai.status, 'completed');

  const codexMeta = codexAdapter.metaFromResponse({ id: 'resp_2', output_text: 'hi' });
  assert.equal(codexMeta.codex.responseId, 'resp_2');
  assert.equal(codexMeta.openai, undefined);

  const openaiCallTurn = openaiAdapter.functionCallTurn({ id: 'call_1', name: 'read_file', argumentsText: '{}' });
  assert.ok(openaiCallTurn.providerMeta.openai);

  const codexCallTurn = codexAdapter.functionCallTurn({ id: 'call_2', name: 'read_file', argumentsText: '{}' });
  assert.ok(codexCallTurn.providerMeta.codex);
});

test('createProviderCanonicalAdapter (xai and chat-kind): metaFromResponse and providerMeta buckets', () => {
  const xaiAdapter = createProviderCanonicalAdapter({ providerId: 'xai', providerKind: 'responses', method: 'api_key', model: 'grok-test' });
  const xaiMeta = xaiAdapter.metaFromResponse({ id: 'resp_3', output_text: 'hi' });
  assert.equal(xaiMeta.xai.responseId, 'resp_3');

  const chatAdapter = createProviderCanonicalAdapter({ providerId: 'moonshot', providerKind: 'chat', method: '', model: 'moonshot-test' });
  const chatMeta = chatAdapter.metaFromResponse({ id: 'chatcmpl_1', object: 'chat.completion', created: 123, choices: [{ message: { role: 'assistant', content: 'hi' } }] });
  assert.equal(chatMeta.moonshot.id, 'chatcmpl_1');
  assert.deepEqual(chatMeta.moonshot.choice, { message: { role: 'assistant', content: 'hi' } });

  const chatCallTurn = chatAdapter.functionCallTurn({ id: 'call_1', name: 'read_file', argumentsText: '{}' }, 'reasoning text');
  assert.equal(chatCallTurn.reasoningText, 'reasoning text');
  assert.ok(chatCallTurn.providerMeta.moonshot);
});
