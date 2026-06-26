export function buildCanonicalConversation({
  systemPrompt = '',
  postSystemPrompt = '',
  developerPrompt = '',
  userPrompt = '',
  userImages = [],
  timeline = [],
  historyLimit = null,
} = {}) {
  const turns = [];

  if (String(systemPrompt || '').trim()) {
    turns.push({ role: 'system', text: String(systemPrompt || '').trim() });
  }

  // Stable, recency-insensitive guidance (e.g. humanize) belongs right after the
  // system prompt — injected once at the top, not re-appended at the tail each round.
  const injectedPostSystemPrompt = String(postSystemPrompt || '').trim();
  if (injectedPostSystemPrompt) {
    turns.push({ role: 'system', text: injectedPostSystemPrompt, images: [] });
  }

  const contextHistory = Array.isArray(timeline)
    ? timeline.filter((item) => item && item.includeInContext !== false)
    : [];

  const excludedToolOutputs = Array.isArray(timeline)
    ? timeline.filter((item) => item && item.role === 'tool_output' && item.includeInContext === false)
    : [];

  const hasFiniteHistoryLimit = Number.isFinite(Number(historyLimit)) && Number(historyLimit) >= 0;
  const historyTail = hasFiniteHistoryLimit
    ? contextHistory.slice(-Math.trunc(Number(historyLimit)))
    : contextHistory;

  for (const item of historyTail) {
    let role = 'assistant';
    if (item?.role === 'user') role = 'user';
    if (item?.role === 'system' || item?.role === 'developer') role = 'system';
    if (item?.role === 'assistant' || item?.role === 'agent') role = 'assistant';
    if (item?.role === 'function_call') role = 'function_call';
    if (item?.role === 'tool_output') role = 'tool_output';
    const normalizedImages = Array.isArray(item?.images)
      ? item.images
        .map((img) => ({ mimeType: String(img?.mimeType || img?.type || ''), dataUrl: String(img?.dataUrl || '') }))
        .filter((img) => img.dataUrl)
      : [];
    turns.push({
      role,
      text: String(item?.text || ''),
      images: normalizedImages,
      reasoningText: String(item?.reasoningText || ''),
      providerId: String(item?.providerId || ''),
      providerModel: String(item?.providerModel || ''),
      providerMeta: item?.providerMeta && typeof item.providerMeta === 'object'
        ? JSON.parse(JSON.stringify(item.providerMeta))
        : null,
      call_id: String(item?.call_id || ''),
      name: String(item?.name || ''),
      arguments: String(item?.arguments || ''),
      output: String(item?.output || ''),
    });
  }

  for (const item of excludedToolOutputs) {
    turns.push({
      role: 'tool_output',
      text: String(item?.text || ''),
      images: [],
      reasoningText: String(item?.reasoningText || ''),
      providerId: String(item?.providerId || ''),
      providerModel: String(item?.providerModel || ''),
      providerMeta: item?.providerMeta && typeof item.providerMeta === 'object'
        ? JSON.parse(JSON.stringify(item.providerMeta))
        : null,
      call_id: String(item?.call_id || ''),
      name: String(item?.name || ''),
      arguments: String(item?.arguments || ''),
      output: String(item?.output || ''),
      includeInContext: false,
    });
  }

  const injectedDeveloperPrompt = String(developerPrompt || '').trim();
  if (injectedDeveloperPrompt) {
    turns.push({ role: 'system', text: injectedDeveloperPrompt, images: [] });
  }

  return turns;
}

// Ensures function_call/tool_output turns have a non-empty call_id, synthesizing
// stable ids for turns whose origin provider didn't assign one (e.g. Gemini
// function calls, which often arrive with id === ''). function_call/tool_output
// pairs are paired by order, since a round always emits its function_call turns
// followed by their tool_output turns in the same order.
export function normalizeCallIds(turns) {
  if (!Array.isArray(turns)) return turns;
  const pendingSyntheticIds = [];
  return turns.map((turn, idx) => {
    if (!turn || (turn.role !== 'function_call' && turn.role !== 'tool_output')) return turn;
    if (String(turn.call_id || '').trim()) return turn;
    const fallbackId = `gen_${Number.isFinite(turn.index) ? turn.index : idx}`;
    if (turn.role === 'function_call') {
      pendingSyntheticIds.push(fallbackId);
      return { ...turn, call_id: fallbackId };
    }
    return { ...turn, call_id: pendingSyntheticIds.shift() || fallbackId };
  });
}

// Converts a captured Responses `output` array back into valid `input` items for
// replay. Keeps reasoning (only when it carries encrypted_content — required with
// store:false; stale items from before encryption was requested are dropped),
// assistant messages, and function_call items; ignores everything else.
function openAIOutputToInputItems(output) {
  if (!Array.isArray(output)) return [];
  const items = [];
  for (const item of output) {
    const type = String(item?.type || '');
    if (type === 'reasoning') {
      if (!item?.encrypted_content) continue;
      items.push(cloneJson(item));
    } else if (type === 'message' || type === 'function_call') {
      items.push(cloneJson(item));
    }
  }
  return items;
}

function canonicalTurnToOpenAIInput(turn) {
  if (!turn) return null;
  if (turn.role === 'function_call') {
    return {
      type: 'function_call',
      call_id: String(turn.call_id || ''),
      name: String(turn.name || ''),
      arguments: String(turn.arguments || '{}'),
    };
  }
  if (turn.role === 'tool_output') {
    return {
      type: 'function_call_output',
      call_id: String(turn.call_id || ''),
      output: String(turn.output || ''),
    };
  }

  const role = (turn.role === 'system' || turn.role === 'developer')
    ? 'developer'
    : (turn.role === 'user' ? 'user' : 'assistant');
  const contentType = role === 'assistant' ? 'output_text' : 'input_text';
  const text = String(turn.text || '');
  const content = [];
  if (text || role !== 'user') {
    content.push({ type: contentType, text });
  }
  if (role === 'user' && Array.isArray(turn.images)) {
    for (const img of turn.images) {
      const imageUrl = String(img?.dataUrl || '').trim();
      if (!imageUrl) continue;
      content.push({ type: 'input_image', image_url: imageUrl });
    }
  }
  return {
    role,
    content,
  };
}

export function buildOpenAIResponsesPayload({ model, tools, turns, previousResponseId = null, promptCacheKey = null, providerId = '' }) {
  // Only the OpenAI Responses path replays encrypted reasoning. xAI shares this
  // builder but rejects store/include and has different reasoning semantics, so it
  // keeps the generic mapping (no regression).
  const replayReasoning = providerId === 'openai';
  const emittedResponseIds = new Set();
  const input = [];
  for (const turn of (Array.isArray(turns) ? turns : [])) {
    if (!turn) continue;

    if (replayReasoning && turn.providerId === 'openai'
        && (turn.role === 'assistant' || turn.role === 'function_call')) {
      const bucket = turn.providerMeta?.openai;
      const responseId = String(bucket?.responseId || '');
      // Already replayed as part of an earlier turn from the same response.
      if (responseId && emittedResponseIds.has(responseId)) continue;
      const rawOutput = turn.role === 'assistant' ? bucket?.output : bucket?.assistantOutput;
      const items = openAIOutputToInputItems(rawOutput);
      if (items.length > 0) {
        input.push(...items);
        if (responseId) emittedResponseIds.add(responseId);
        continue;
      }
      // No raw output captured (e.g. legacy session) -> fall through to generic.
    }

    const mapped = canonicalTurnToOpenAIInput(turn);
    if (Array.isArray(mapped)) input.push(...mapped.filter(Boolean));
    else if (mapped) input.push(mapped);
  }

  const payload = { model, tools, input };
  if (replayReasoning) {
    // Stateless replay: don't rely on server-side response state, and ask for the
    // encrypted reasoning so it can be passed back on the next round.
    payload.store = false;
    payload.include = ['reasoning.encrypted_content'];
  }
  if (previousResponseId) payload.previous_response_id = previousResponseId;
  // Pin OpenAI's (best-effort, per-backend-node) prompt cache to a stable key so
  // identical prefixes across rounds keep landing on the same cache shard instead
  // of intermittently routing to a cold node (the "cached_tokens suddenly drops to
  // 0 then recovers" symptom). Only set when provided.
  const cacheKey = String(promptCacheKey || '').trim();
  if (cacheKey) payload.prompt_cache_key = cacheKey;
  return payload;
}

function normalizeAnthropicTool(tool) {
  if (!tool || tool.type !== 'function') return null;
  const fn = tool.function && typeof tool.function === 'object' ? tool.function : tool;
  const name = String(fn?.name || '').trim();
  if (!name) return null;
  return {
    name,
    description: String(fn?.description || ''),
    input_schema: fn?.parameters && typeof fn.parameters === 'object'
      ? fn.parameters
      : { type: 'object', properties: {}, required: [], additionalProperties: false },
  };
}

function canonicalTurnToAnthropicUserContent(turn) {
  const blocks = [];
  const text = String(turn?.text || '').trim();
  if (text) blocks.push({ type: 'text', text });
  const images = Array.isArray(turn?.images) ? turn.images : [];
  for (const img of images) {
    const dataUrl = String(img?.dataUrl || '').trim();
    const mimeType = String(img?.mimeType || img?.type || '').trim() || 'image/png';
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) continue;
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: match[1] || mimeType,
        data: match[2] || '',
      },
    });
  }
  return blocks;
}

export function buildAnthropicMessagesPayload({ model, tools, turns, maxTokens = 4096, enablePromptCaching = false }) {
  const sourceTurns = Array.isArray(turns) ? turns : [];
  let system = '';
  const messages = [];

  // Anthropic REQUIRES the original signed thinking blocks to be replayed in the
  // assistant turn that carries tool_use whenever extended/adaptive thinking is
  // enabled — stripping them returns a 400. The verbatim assistant content
  // (thinking + text + tool_use blocks) is captured in providerMeta.anthropic at
  // response time; replay it once per response, then skip the per-turn fallback for
  // the assistant text / function_call turns that belong to the same response.
  const emittedAnthropicResponses = new Set();
  const tryEmitAnthropicRawContent = (rawContent, responseId) => {
    if (!Array.isArray(rawContent) || rawContent.length === 0) return false;
    if (responseId && emittedAnthropicResponses.has(responseId)) return true;
    messages.push({ role: 'assistant', content: cloneJson(rawContent) });
    if (responseId) emittedAnthropicResponses.add(responseId);
    return true;
  };

  for (const turn of sourceTurns) {
    if (!turn) continue;
    if (turn.role === 'system') {
      const text = String(turn.text || '').trim();
      if (text) system = system ? `${system}\n\n${text}` : text;
      continue;
    }

    if (turn.role === 'user') {
      const content = canonicalTurnToAnthropicUserContent(turn);
      if (content.length > 0) messages.push({ role: 'user', content });
      continue;
    }

    if (turn.role === 'assistant') {
      const meta = turn.providerId === 'anthropic' ? turn.providerMeta?.anthropic : null;
      if (tryEmitAnthropicRawContent(meta?.content, String(meta?.id || ''))) continue;
      messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: String(turn.text || '') }],
      });
      continue;
    }

    if (turn.role === 'function_call') {
      const meta = turn.providerId === 'anthropic' ? turn.providerMeta?.anthropic : null;
      const responseId = String(meta?.responseId || '');
      // Covered by raw content already emitted for this response (e.g. the
      // assistant text turn, or an earlier tool_use from the same round).
      if (responseId && emittedAnthropicResponses.has(responseId)) continue;
      // Tool-only round: the raw assistant content (thinking + tool_use) rides on
      // the first function_call turn.
      if (tryEmitAnthropicRawContent(meta?.assistantContent, responseId)) continue;
      // Fallback: foreign-provider turn, or a session saved before raw content was
      // captured. Reconstruct a bare tool_use block (no thinking to replay).
      messages.push({
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: String(turn.call_id || ''),
          name: String(turn.name || ''),
          input: (() => {
            try {
              return turn.arguments ? JSON.parse(String(turn.arguments || '{}')) : {};
            } catch (_) {
              return {};
            }
          })(),
        }],
      });
      continue;
    }

    if (turn.role === 'tool_output') {
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: String(turn.call_id || ''),
          content: String(turn.output || ''),
        }],
      });
    }
  }

  const payload = {
    model,
    max_tokens: maxTokens,
    messages,
  };

  // Anthropic only writes/reads its prompt cache where an explicit cache_control
  // breakpoint is present — with none, every request is a full cache miss
  // (cache_creation/cache_read both 0). Place ephemeral breakpoints on the big
  // static prefix (tools -> system, in Anthropic's cache hierarchy order) and on
  // the tail of the conversation so the growing history is cached incrementally.
  // Anthropic auto-matches the longest previously-written breakpoint (~20 back),
  // so moving the tail breakpoint each round still reuses prior writes. Max 4
  // breakpoints; we use at most 3.
  const ephemeral = { type: 'ephemeral' };

  if (system) {
    payload.system = enablePromptCaching
      ? [{ type: 'text', text: system, cache_control: ephemeral }]
      : system;
  }

  const normalizedTools = (Array.isArray(tools) ? tools : [])
    .map(normalizeAnthropicTool)
    .filter(Boolean);
  if (normalizedTools.length > 0) {
    if (enablePromptCaching) {
      const lastTool = normalizedTools[normalizedTools.length - 1];
      normalizedTools[normalizedTools.length - 1] = { ...lastTool, cache_control: ephemeral };
    }
    payload.tools = normalizedTools;
  }

  if (enablePromptCaching && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (Array.isArray(lastMessage.content) && lastMessage.content.length > 0) {
      const lastBlock = lastMessage.content[lastMessage.content.length - 1];
      const blockType = String(lastBlock?.type || '');
      // cache_control is rejected on thinking blocks, so never attach it there.
      if (lastBlock && typeof lastBlock === 'object'
          && blockType !== 'thinking' && blockType !== 'redacted_thinking') {
        lastBlock.cache_control = ephemeral;
      }
    }
  }

  return payload;
}

function stripAdditionalPropertiesDeep(value) {
  if (Array.isArray(value)) {
    return value.map(stripAdditionalPropertiesDeep);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'additionalProperties') continue;
    out[key] = stripAdditionalPropertiesDeep(child);
  }
  return out;
}

function normalizeGeminiTool(tool) {
  if (!tool || tool.type !== 'function') return null;
  const fn = tool.function && typeof tool.function === 'object' ? tool.function : tool;
  const name = String(fn?.name || '').trim();
  if (!name) return null;
  return {
    name,
    description: String(fn?.description || ''),
    parameters: stripAdditionalPropertiesDeep(
      fn?.parameters && typeof fn.parameters === 'object'
        ? fn.parameters
        : { type: 'object', properties: {}, required: [] }
    ),
  };
}

// Placeholder thought_signature for Gemini 3 function-calling validation, used
// when a functionCall part has no signature of its own (e.g. it was reconstructed
// from a turn that wasn't generated by Gemini). Documented escape hatch:
// https://ai.google.dev/gemini-api/docs/thought-signatures
const GEMINI_THOUGHT_SIGNATURE_PLACEHOLDER = 'context_engineering_is_the_way_to_go';

// Gemini 3 requires the first functionCall part of each step in the "current
// turn" to carry a thought_signature, or the request fails with a 400. Fill in
// the documented placeholder for any functionCall part missing one.
function ensureGeminiThoughtSignatures(contents) {
  for (const content of contents) {
    if (!content || content.role !== 'model' || !Array.isArray(content.parts)) continue;
    for (const part of content.parts) {
      if (!part || !part.functionCall) continue;
      if (!String(part.thoughtSignature || '').trim()) {
        part.thoughtSignature = GEMINI_THOUGHT_SIGNATURE_PLACEHOLDER;
      }
    }
  }
  return contents;
}

function canonicalImagesToGeminiParts(images) {
  const parts = [];
  for (const img of (Array.isArray(images) ? images : [])) {
    const dataUrl = String(img?.dataUrl || '').trim();
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) continue;
    const mimeType = match[1] || String(img?.mimeType || img?.type || '').trim() || 'image/png';
    parts.push({ inlineData: { mimeType, data: match[2] || '' } });
  }
  return parts;
}

export function buildGeminiGenerateContentPayload({ tools, turns, providerId = '' }) {
  const sourceTurns = Array.isArray(turns) ? turns : [];
  const systemTexts = [];
  const contents = [];

  for (const turn of sourceTurns) {
    if (!turn) continue;
    if (turn.role === 'system') {
      const text = String(turn.text || '').trim();
      if (text) systemTexts.push(text);
      continue;
    }

    if (turn.role === 'user') {
      const text = String(turn.text || '');
      const parts = [];
      if (text) parts.push({ text });
      parts.push(...canonicalImagesToGeminiParts(turn.images));
      if (parts.length > 0) contents.push({ role: 'user', parts });
      continue;
    }

    if (turn.role === 'assistant') {
      const rawGeminiContent = turn?.providerMeta?.gemini?.rawContent;
      if (turn.providerId === providerId && rawGeminiContent && typeof rawGeminiContent === 'object') {
        contents.push(JSON.parse(JSON.stringify(rawGeminiContent)));
      } else {
        contents.push({ role: 'model', parts: [{ text: String(turn.text || '') }] });
      }
      continue;
    }

    if (turn.role === 'function_call') {
      const rawGeminiContent = turn?.providerMeta?.gemini?.rawContent;
      if (turn.providerId === providerId && rawGeminiContent && typeof rawGeminiContent === 'object') {
        contents.push(JSON.parse(JSON.stringify(rawGeminiContent)));
      } else {
        let args = {};
        try {
          args = turn.arguments ? JSON.parse(String(turn.arguments || '{}')) : {};
        } catch (_) {
          args = {};
        }
        contents.push({
          role: 'model',
          parts: [{
            functionCall: {
              name: String(turn.name || ''),
              args,
              id: String(turn.call_id || ''),
            },
          }],
        });
      }
      continue;
    }

    if (turn.role === 'tool_output') {
      let response = {};
      try {
        response = turn.output ? JSON.parse(String(turn.output || '{}')) : {};
      } catch (_) {
        response = { output: String(turn.output || '') };
      }
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: String(turn.name || ''),
            response: { result: response },
            id: String(turn.call_id || ''),
          },
        }],
      });
    }
  }

  const payload = { contents: ensureGeminiThoughtSignatures(contents) };
  if (systemTexts.length > 0) {
    payload.systemInstruction = {
      parts: [{ text: systemTexts.join('\n\n') }],
    };
  }

  const normalizedTools = (Array.isArray(tools) ? tools : [])
    .map(normalizeGeminiTool)
    .filter(Boolean);
  if (normalizedTools.length > 0) {
    payload.tools = [{ functionDeclarations: normalizedTools }];
  }

  return payload;
}

function extractInputText(block) {
  const parts = Array.isArray(block?.content) ? block.content : [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
}

function canonicalTurnToCodexInput(turn) {
  if (!turn) return null;
  if (turn.role === 'tool_output') {
    return {
      type: 'function_call_output',
      call_id: String(turn.call_id || ''),
      output: String(turn.output || ''),
    };
  }

  if (turn.role === 'function_call') {
    return {
      type: 'function_call',
      call_id: String(turn.call_id || ''),
      name: String(turn.name || ''),
      arguments: String(turn.arguments || '{}'),
    };
  }

  const role = (turn.role === 'system' || turn.role === 'developer')
    ? 'developer'
    : (turn.role === 'assistant' ? 'assistant' : 'user');

  const contentType = role === 'assistant' ? 'output_text' : 'input_text';
  return {
    type: 'message',
    role,
    content: [{ type: contentType, text: String(turn.text || '') }],
  };
}

export function buildCodexResponsesPayload({ model, tools, turns, previousResponseId = null, promptCacheKey = null }) {
  const base = buildOpenAIResponsesPayload({ model, tools, turns, previousResponseId, promptCacheKey });
  const openAIInput = Array.isArray(base.input) ? base.input : [];
  const systemBlock = openAIInput.find((item) => item?.role === 'developer' || item?.role === 'system');
  const instructions = extractInputText(systemBlock);

  // Replay captured reasoning (encrypted_content) + message/function_call items
  // verbatim, deduped per response, so Codex keeps its chain-of-thought across
  // tool calls. Falls back to the generic 1:1 mapping for turns without raw output.
  const emittedResponseIds = new Set();
  const codexInput = [];
  for (const turn of (Array.isArray(turns) ? turns : [])) {
    if (!turn) continue;
    if (turn.providerId === 'openai' && (turn.role === 'assistant' || turn.role === 'function_call')) {
      const bucket = turn.providerMeta?.codex;
      const responseId = String(bucket?.responseId || '');
      if (responseId && emittedResponseIds.has(responseId)) continue;
      const rawOutput = turn.role === 'assistant' ? bucket?.output : bucket?.assistantOutput;
      const items = openAIOutputToInputItems(rawOutput);
      if (items.length > 0) {
        codexInput.push(...items);
        if (responseId) emittedResponseIds.add(responseId);
        continue;
      }
    }
    const mapped = canonicalTurnToCodexInput(turn);
    if (mapped && (mapped.type !== 'message' || mapped.role !== 'developer')) codexInput.push(mapped);
  }

  const payload = {
    model,
    instructions: instructions || 'You are Codex.',
    input: codexInput,
    tools: Array.isArray(tools) ? tools : [],
    tool_choice: 'auto',
    parallel_tool_calls: false,
    reasoning: { summary: 'auto' },
    include: ['reasoning.encrypted_content'],
    store: false,
    stream: true,
  };

  if (previousResponseId) payload.previous_response_id = previousResponseId;
  const cacheKey = String(promptCacheKey || '').trim();
  if (cacheKey) payload.prompt_cache_key = cacheKey;

  return payload;
}

function cloneJson(value) {
  if (!value || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return null;
  }
}

// Provider-agnostic boundary between raw provider responses/tool calls and the
// canonical turn/metadata shapes stored in canonicalByAgent. Parameterized purely
// by provider identity (no request-scoped state), so it can be reused for new
// providers and for future canonical-level compaction code.
export function createProviderCanonicalAdapter({ providerId, providerKind, method, model }) {
  function metaFromResponse(resp) {
    const usage = cloneJson(resp?.usage);
    if (providerKind === 'gemini') {
      const candidate = cloneJson(resp?.candidates?.[0]);
      const rawContent = cloneJson(resp?.candidates?.[0]?.content);
      const meta = {
        gemini: {
          candidate,
          rawContent,
          usageMetadata: usage,
        },
      };
      if (typeof resp?.promptFeedback === 'object' && resp.promptFeedback) meta.gemini.promptFeedback = cloneJson(resp.promptFeedback);
      if (typeof resp?.candidates?.[0]?.finishReason === 'string') meta.gemini.finishReason = String(resp.candidates[0].finishReason);
      return meta;
    }
    if (providerKind === 'anthropic') {
      return {
        anthropic: {
          id: typeof resp?.id === 'string' ? resp.id : '',
          type: typeof resp?.type === 'string' ? resp.type : '',
          role: typeof resp?.role === 'string' ? resp.role : '',
          content: cloneJson(resp?.content),
          usage,
          stopReason: typeof resp?.stop_reason === 'string' ? resp.stop_reason : '',
          stopSequence: typeof resp?.stop_sequence === 'string' ? resp.stop_sequence : '',
        },
      };
    }
    if (providerId === 'openai' && method === 'oauth') {
      return {
        codex: {
          responseId: typeof resp?.id === 'string' ? resp.id : '',
          output: cloneJson(resp?.output),
          outputText: typeof resp?.output_text === 'string' ? resp.output_text : '',
          usage,
          reasoning: cloneJson(resp?.reasoning),
        },
      };
    }
    if (providerId === 'openai') {
      return {
        openai: {
          responseId: typeof resp?.id === 'string' ? resp.id : '',
          output: cloneJson(resp?.output),
          outputText: typeof resp?.output_text === 'string' ? resp.output_text : '',
          usage,
          reasoning: cloneJson(resp?.reasoning),
          incompleteDetails: cloneJson(resp?.incomplete_details),
          status: typeof resp?.status === 'string' ? resp.status : '',
        },
      };
    }
    if (providerId === 'xai') {
      return {
        xai: {
          responseId: typeof resp?.id === 'string' ? resp.id : '',
          output: cloneJson(resp?.output),
          outputText: typeof resp?.output_text === 'string' ? resp.output_text : '',
          usage,
          reasoning: cloneJson(resp?.reasoning),
        },
      };
    }
    if (providerKind === 'chat') {
      const choice = cloneJson(resp?.choices?.[0]);
      return {
        [providerId]: {
          id: typeof resp?.id === 'string' ? resp.id : '',
          object: typeof resp?.object === 'string' ? resp.object : '',
          created: Number.isFinite(Number(resp?.created)) ? Number(resp.created) : null,
          choice,
          usage,
        },
      };
    }
    return usage ? { [providerId]: { usage } } : null;
  }

  // responseMeta is metaFromResponse() for the round that produced this call.
  // When embedRawContent is true (tool-only round, first call) the verbatim
  // assistant content/output — including thinking/reasoning blocks — is stored so
  // the payload builder can replay it. The response id is always recorded (when
  // present) so the builder can dedupe content shared across the round's turns.
  function functionCallTurn(call, reasoningText = '', responseMeta = null, embedRawContent = false) {
    return {
      role: 'function_call',
      call_id: call?.id || '',
      name: call?.name || '',
      arguments: call?.argumentsText || '{}',
      reasoningText,
      providerId,
      providerModel: model,
      providerMeta: (() => {
        if (providerKind === 'anthropic') {
          const anthropic = {
            toolUseId: call?.id || '',
            toolName: call?.name || '',
            input: (() => {
              try { return JSON.parse(call?.argumentsText || '{}'); } catch (_) { return {}; }
            })(),
          };
          const responseId = String(responseMeta?.anthropic?.id || '');
          if (responseId) anthropic.responseId = responseId;
          if (embedRawContent && Array.isArray(responseMeta?.anthropic?.content)) {
            anthropic.assistantContent = cloneJson(responseMeta.anthropic.content);
          }
          return { anthropic };
        }
        if (providerKind === 'gemini') {
          return {
            gemini: {
              functionCall: {
                id: call?.id || '',
                name: call?.name || '',
                args: (() => {
                  try { return JSON.parse(call?.argumentsText || '{}'); } catch (_) { return {}; }
                })(),
              },
            },
          };
        }
        const bucket = providerId === 'openai' && method === 'oauth' ? 'codex' : providerId;
        const bucketMeta = responseMeta && typeof responseMeta === 'object' ? responseMeta[bucket] : null;
        const entry = {
          callId: call?.id || '',
          toolName: call?.name || '',
          arguments: call?.argumentsText || '{}',
        };
        const responseId = String(bucketMeta?.responseId || '');
        if (responseId) entry.responseId = responseId;
        if (embedRawContent && Array.isArray(bucketMeta?.output)) {
          entry.assistantOutput = cloneJson(bucketMeta.output);
        }
        return { [bucket]: entry };
      })(),
    };
  }

  function toolOutputTurn(call, run) {
    const safeRun = (run && run.result && Array.isArray(run.result._attachImages))
      ? { ...run, result: { ...run.result, _attachImages: '[attached]' } }
      : run;
    const providerToolMeta = (() => {
      if (providerKind === 'gemini') {
        return { gemini: { functionResponse: { id: call?.id || '', name: call?.name || '' } } };
      }
      if (providerKind === 'anthropic') {
        return { anthropic: { toolUseId: call?.id || '', toolName: call?.name || '', toolResult: cloneJson(safeRun) } };
      }
      if (providerId === 'openai' && method === 'oauth') {
        return { codex: { callId: call?.id || '', toolName: call?.name || '', arguments: call?.argumentsText || '{}', toolResult: cloneJson(safeRun) } };
      }
      if (providerId === 'openai') {
        return { openai: { callId: call?.id || '', toolName: call?.name || '', arguments: call?.argumentsText || '{}', toolResult: cloneJson(safeRun) } };
      }
      if (providerId === 'xai') {
        return { xai: { callId: call?.id || '', toolName: call?.name || '', arguments: call?.argumentsText || '{}', toolResult: cloneJson(safeRun) } };
      }
      if (providerKind === 'chat') {
        return { [providerId]: { callId: call?.id || '', toolName: call?.name || '', arguments: call?.argumentsText || '{}', toolResult: cloneJson(safeRun) } };
      }
      return null;
    })();
    return {
      role: 'tool_output',
      call_id: call?.id || '',
      name: call?.name || '',
      arguments: call?.argumentsText || '{}',
      output: JSON.stringify(safeRun),
      providerId,
      providerModel: model,
      providerMeta: providerToolMeta,
      includeInContext: false,
    };
  }

  return { metaFromResponse, functionCallTurn, toolOutputTurn };
}
