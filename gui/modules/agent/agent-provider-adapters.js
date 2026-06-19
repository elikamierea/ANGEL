export function buildCanonicalConversation({
  systemPrompt = '',
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

export function buildOpenAIResponsesPayload({ model, tools, turns, previousResponseId = null }) {
  const input = [];
  for (const turn of (Array.isArray(turns) ? turns : [])) {
    if (!turn) continue;
    const mapped = canonicalTurnToOpenAIInput(turn);
    if (Array.isArray(mapped)) input.push(...mapped.filter(Boolean));
    else if (mapped) input.push(mapped);
  }

  const payload = { model, tools, input };
  if (previousResponseId) payload.previous_response_id = previousResponseId;
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

export function buildAnthropicMessagesPayload({ model, tools, turns, maxTokens = 4096 }) {
  const sourceTurns = Array.isArray(turns) ? turns : [];
  let system = '';
  const messages = [];

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
      messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: String(turn.text || '') }],
      });
      continue;
    }

    if (turn.role === 'function_call') {
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
  if (system) payload.system = system;

  const normalizedTools = (Array.isArray(tools) ? tools : [])
    .map(normalizeAnthropicTool)
    .filter(Boolean);
  if (normalizedTools.length > 0) payload.tools = normalizedTools;

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

export function buildCodexResponsesPayload({ model, tools, turns, previousResponseId = null }) {
  const base = buildOpenAIResponsesPayload({ model, tools, turns, previousResponseId });
  const openAIInput = Array.isArray(base.input) ? base.input : [];
  const systemBlock = openAIInput.find((item) => item?.role === 'developer' || item?.role === 'system');
  const instructions = extractInputText(systemBlock);

  const codexInput = (Array.isArray(turns) ? turns : [])
    .map(canonicalTurnToCodexInput)
    .filter(Boolean)
    .filter((item) => item.type !== 'message' || item.role !== 'developer');

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

  function functionCallTurn(call, reasoningText = '') {
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
          return {
            anthropic: {
              toolUseId: call?.id || '',
              toolName: call?.name || '',
              input: (() => {
                try { return JSON.parse(call?.argumentsText || '{}'); } catch (_) { return {}; }
              })(),
            },
          };
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
        return {
          [bucket]: {
            callId: call?.id || '',
            toolName: call?.name || '',
            arguments: call?.argumentsText || '{}',
          },
        };
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
