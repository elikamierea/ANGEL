export async function requestOpenAIResponses(payload, apiKey, options = {}) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${raw.slice(0, 280)}`);
  }

  return response.json();
}

export async function requestAnthropicMessages(payload, apiKey, options = {}) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}): ${raw.slice(0, 280)}`);
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new Error(`Anthropic response was not valid JSON: ${raw.slice(0, 120)}`);
  }
}

export async function requestGeminiGenerateContent(payload, model, apiKey, options = {}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(String(model || ''))}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${raw.slice(0, 280)}`);
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new Error(`Gemini response was not valid JSON: ${raw.slice(0, 120)}`);
  }
}

export async function requestXAIResponses(payload, apiKey, options = {}) {
  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`xAI request failed (${response.status}): ${raw.slice(0, 280)}`);
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new Error(`xAI response was not valid JSON: ${raw.slice(0, 120)}`);
  }
}

function canonicalTurnToChatMessage(turn) {
  if (!turn) return null;
  if (turn.role === 'system') return { role: 'system', content: String(turn.text || '') };
  if (turn.role === 'user') {
    const text = String(turn.text || '');
    const images = Array.isArray(turn.images) ? turn.images : [];
    if (!images.length) return { role: 'user', content: text };
    const content = [];
    if (text) content.push({ type: 'text', text });
    for (const img of images) {
      const imageUrl = String(img?.dataUrl || '').trim();
      if (!imageUrl) continue;
      content.push({ type: 'image_url', image_url: { url: imageUrl } });
    }
    return { role: 'user', content };
  }
  if (turn.role === 'assistant') {
    const message = { role: 'assistant', content: String(turn.text || '') };
    const reasoningText = String(turn.reasoningText || '').trim();
    if (reasoningText) message.reasoning_content = reasoningText;
    return message;
  }
  if (turn.role === 'function_call') {
    const message = {
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: String(turn.call_id || ''),
        type: 'function',
        function: {
          name: String(turn.name || ''),
          arguments: String(turn.arguments || '{}'),
        },
      }],
    };
    const reasoningText = String(turn.reasoningText || '').trim();
    if (reasoningText) message.reasoning_content = reasoningText;
    return message;
  }
  if (turn.role === 'tool_output') {
    return {
      role: 'tool',
      tool_call_id: String(turn.call_id || ''),
      content: String(turn.output || ''),
    };
  }
  return null;
}

// Chat APIs require that text content and tool_calls from the same assistant
// turn appear in a single message. Because canonical state stores them as
// separate turns (assistant text + N function_call turns), we merge any run of
// consecutive assistant-role messages into one before sending.
function mergeConsecutiveChatAssistantMessages(messages) {
  const result = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.role !== 'assistant') { result.push(msg); i++; continue; }
    const group = [msg];
    while (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
      i++;
      group.push(messages[i]);
    }
    if (group.length === 1) { result.push(msg); i++; continue; }
    const content = group.find((m) => typeof m.content === 'string' && m.content)?.content ?? '';
    const toolCalls = group.flatMap((m) => (Array.isArray(m.tool_calls) ? m.tool_calls : []));
    const reasoningContent = group.find((m) => m.reasoning_content)?.reasoning_content;
    const merged = { role: 'assistant', content };
    if (toolCalls.length > 0) merged.tool_calls = toolCalls;
    if (reasoningContent) merged.reasoning_content = reasoningContent;
    result.push(merged);
    i++;
  }
  return result;
}

function normalizeChatCompletionTool(tool) {
  if (!tool || tool.type !== 'function') return null;

  const fn = tool.function && typeof tool.function === 'object'
    ? tool.function
    : tool;

  const name = String(fn?.name || '').trim();
  if (!name) return null;

  return {
    type: 'function',
    function: {
      name,
      description: String(fn?.description || ''),
      parameters: fn?.parameters && typeof fn.parameters === 'object'
        ? fn.parameters
        : { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  };
}

export async function requestOpenAICompatibleChatCompletions({ endpoint, model, turns, tools, extraBody = null }, apiKey, extraHeaders = {}, options = {}) {
  const messages = mergeConsecutiveChatAssistantMessages(
    (Array.isArray(turns) ? turns : [])
      .map(canonicalTurnToChatMessage)
      .filter(Boolean)
  );

  const payload = {
    model,
    messages,
    ...(extraBody && typeof extraBody === 'object' ? extraBody : {}),
  };

  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools
      .map(normalizeChatCompletionTool)
      .filter(Boolean);
    if (payload.tools.length > 0) {
      payload.tool_choice = 'auto';
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...extraHeaders,
  };

  const response = await fetch(String(endpoint || ''), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Provider request failed (${response.status}): ${raw.slice(0, 280)}`);
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new Error(`Provider response was not valid JSON: ${raw.slice(0, 120)}`);
  }
}

function parseSseJsonEvents(rawText) {
  const events = [];
  const chunks = String(rawText || '').split(/\r?\n\r?\n/);
  for (const chunk of chunks) {
    const lines = String(chunk || '').split(/\r?\n/);
    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .filter((line) => line !== '[DONE]');

    if (dataLines.length === 0) continue;
    const dataText = dataLines.join('\n');
    try {
      events.push(JSON.parse(dataText));
    } catch (_) {
      // ignore non-json lines
    }
  }
  return events;
}

function collectCodexDeltaText(events) {
  const parts = [];

  const push = (value) => {
    const text = typeof value === 'string' ? value : '';
    if (text) parts.push(text);
  };

  for (const evt of events) {
    const type = String(evt?.type || '').toLowerCase();
    if (type.includes('output_text.delta')) {
      push(evt?.delta);
      push(evt?.text);
      continue;
    }
    if (type.includes('content_part.added') && String(evt?.part?.type || '').toLowerCase().includes('text')) {
      push(evt?.part?.text);
      continue;
    }
    if (evt?.output_text && typeof evt.output_text === 'string') {
      push(evt.output_text);
    }
  }

  return parts.join('');
}

function collectCodexDeltaImageCalls(events) {
  const byId = new Map();

  const ensure = (id) => {
    const key = String(id || '').trim();
    if (!key) return null;
    if (!byId.has(key)) {
      byId.set(key, { type: 'image_generation_call', id: key, result: '' });
    }
    return byId.get(key);
  };

  for (const evt of events) {
    const type = String(evt?.type || '').toLowerCase();

    const item = evt?.item && typeof evt.item === 'object' ? evt.item : null;
    if (item && String(item.type || '').toLowerCase() === 'image_generation_call') {
      const entry = ensure(item.id || item.call_id || evt?.id || evt?.item_id);
      if (!entry) continue;
      const result = typeof item.result === 'string' ? item.result : '';
      if (result) entry.result = result;
      continue;
    }

    if (type.includes('image_generation_call')) {
      const entry = ensure(evt?.id || evt?.item_id || evt?.call_id);
      if (!entry) continue;
      const result = typeof evt?.result === 'string'
        ? evt.result
        : (typeof evt?.image_base64 === 'string' ? evt.image_base64 : (typeof evt?.partial_image_b64 === 'string' ? evt.partial_image_b64 : ''));
      if (result) entry.result = result;
    }
  }

  return Array.from(byId.values()).filter((item) => typeof item.result === 'string' && item.result.trim());
}

function collectCodexDeltaToolCalls(events) {
  const byId = new Map();

  const ensure = (id) => {
    const key = String(id || '').trim();
    if (!key) return null;
    if (!byId.has(key)) {
      byId.set(key, { type: 'function_call', call_id: key, id: key, name: '', arguments: '' });
    }
    return byId.get(key);
  };

  for (const evt of events) {
    const type = String(evt?.type || '').toLowerCase();

    const item = evt?.item && typeof evt.item === 'object' ? evt.item : null;
    if (item && String(item.type || '').toLowerCase() === 'function_call') {
      const entry = ensure(item.call_id || item.id);
      if (!entry) continue;
      if (item.name) entry.name = String(item.name);
      if (typeof item.arguments === 'string') entry.arguments = item.arguments;
      continue;
    }

    if (type.includes('function_call_arguments.delta') || type.includes('arguments.delta')) {
      const entry = ensure(evt?.call_id || evt?.item_id || evt?.id);
      if (!entry) continue;
      if (evt?.name && !entry.name) entry.name = String(evt.name);
      const delta = typeof evt?.delta === 'string' ? evt.delta : (typeof evt?.arguments_delta === 'string' ? evt.arguments_delta : '');
      if (delta) entry.arguments += delta;
      continue;
    }

    if (type.includes('function_call') && evt?.name) {
      const entry = ensure(evt?.call_id || evt?.id || evt?.item_id);
      if (!entry) continue;
      entry.name = String(evt.name);
      if (typeof evt?.arguments === 'string') entry.arguments = evt.arguments;
    }
  }

  return Array.from(byId.values()).filter((item) => item.name);
}

function extractResponseFromCodexSse(rawText) {
  const events = parseSseJsonEvents(rawText);
  const streamedText = collectCodexDeltaText(events).trim();
  const streamedToolCalls = collectCodexDeltaToolCalls(events);
  const streamedImageCalls = collectCodexDeltaImageCalls(events);

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const evt = events[i];
    if (!evt?.response || typeof evt.response !== 'object') continue;

    const response = { ...evt.response };
    const hasOutputArray = Array.isArray(response.output) && response.output.length > 0;
    const hasOutputText = typeof response.output_text === 'string' && response.output_text.trim();

    if (!hasOutputArray && (streamedToolCalls.length > 0 || streamedImageCalls.length > 0)) {
      response.output = [...streamedToolCalls, ...streamedImageCalls];
    }

    if (!hasOutputArray && !hasOutputText && streamedText) {
      response.output_text = streamedText;
    }

    return response;
  }

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const evt = events[i];
    if (evt && typeof evt === 'object' && (evt.output || evt.output_text || evt.usage)) {
      const patched = { ...evt };
      if ((!Array.isArray(patched.output) || patched.output.length === 0) && (streamedToolCalls.length > 0 || streamedImageCalls.length > 0)) {
        patched.output = [...streamedToolCalls, ...streamedImageCalls];
      }
      if (!patched.output_text && streamedText) {
        patched.output_text = streamedText;
      }
      return patched;
    }
  }

  if (streamedText || streamedToolCalls.length > 0 || streamedImageCalls.length > 0) {
    return { output_text: streamedText, output: [...streamedToolCalls, ...streamedImageCalls] };
  }

  throw new Error('Codex stream did not contain a JSON response object.');
}

export async function requestOpenAICodexResponses(payload, accessToken, options = {}) {
  const response = await fetch('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      Accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI Codex request failed (${response.status}): ${raw.slice(0, 280)}`);
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/event-stream') || String(raw).trimStart().startsWith('event:')) {
    return extractResponseFromCodexSse(raw);
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new Error(`OpenAI Codex response was not valid JSON: ${raw.slice(0, 120)}`);
  }
}

export function extractReasoningTextFromModelResponse(resp) {
  const extracted = [];

  const pushText = (value) => {
    const text = String(value || '').trim();
    if (text) extracted.push(text);
  };

  const outputList = Array.isArray(resp?.output) ? resp.output : [];
  for (const item of outputList) {
    pushText(item?.reasoning_content);
    const contentList = Array.isArray(item?.content) ? item.content : [];
    for (const part of contentList) {
      pushText(part?.reasoning_content);
    }
  }

  const choiceList = Array.isArray(resp?.choices) ? resp.choices : [];
  for (const choice of choiceList) {
    pushText(choice?.message?.reasoning_content);
    pushText(choice?.delta?.reasoning_content);
  }

  return extracted;
}

export function extractAnthropicToolCallsFromModelResponse(resp) {
  const toolCalls = [];
  const content = Array.isArray(resp?.content) ? resp.content : [];
  for (const block of content) {
    if (String(block?.type || '') !== 'tool_use' || !block?.name) continue;
    toolCalls.push({
      id: block.id || `call_${toolCalls.length + 1}`,
      name: String(block.name),
      argumentsText: JSON.stringify(block.input || {}),
    });
  }
  return toolCalls;
}

export function extractGeminiToolCallsFromModelResponse(resp) {
  const toolCalls = [];
  const candidates = Array.isArray(resp?.candidates) ? resp.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const fc = part?.functionCall;
      if (!fc?.name) continue;
      toolCalls.push({
        id: fc.id || `call_${toolCalls.length + 1}`,
        name: String(fc.name),
        argumentsText: JSON.stringify(fc.args || {}),
      });
    }
  }
  return toolCalls;
}

export function extractTextFromModelResponse(resp) {
  const extracted = [];

  const pushText = (value) => {
    const text = String(value || '').trim();
    if (text) extracted.push(text);
  };

  const topLevelText = typeof resp?.output_text === 'string' ? resp.output_text.trim() : '';
  if (topLevelText) extracted.push(topLevelText);

  const outputList = Array.isArray(resp?.output) ? resp.output : [];
  for (const item of outputList) {
    const itemType = String(item?.type || '').toLowerCase();

    if (itemType === 'output_text' || itemType === 'text') {
      pushText(item?.text);
    }

    const contentList = Array.isArray(item?.content) ? item.content : [];
    for (const part of contentList) {
      const partType = String(part?.type || '').toLowerCase();
      if (partType === 'output_text' || partType === 'text') {
        pushText(part?.text);
      }
    }
  }

  const choiceList = Array.isArray(resp?.choices) ? resp.choices : [];
  for (const choice of choiceList) {
    const messageContent = choice?.message?.content;
    if (typeof messageContent === 'string') {
      pushText(messageContent);
      continue;
    }
    if (Array.isArray(messageContent)) {
      for (const part of messageContent) {
        if (typeof part === 'string') {
          pushText(part);
          continue;
        }
        pushText(part?.text);
      }
      continue;
    }
    pushText(choice?.message?.text);
  }

  const anthropicContent = Array.isArray(resp?.content) ? resp.content : [];
  for (const block of anthropicContent) {
    if (String(block?.type || '') === 'text') {
      pushText(block?.text);
    }
  }

  const geminiCandidates = Array.isArray(resp?.candidates) ? resp.candidates : [];
  for (const candidate of geminiCandidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      pushText(part?.text);
    }
  }

  return extracted;
}

export function extractImageGenerationResults(resp) {
  const images = [];
  const pushB64 = (value, id = '', mimeType = 'image/png') => {
    const b64 = typeof value === 'string' ? value.trim() : '';
    if (!b64) return;
    images.push({ base64: b64, mimeType: String(mimeType || 'image/png'), id: String(id || '') });
  };

  // OpenAI / xAI Responses shapes.
  const outputList = Array.isArray(resp?.output) ? resp.output : [];
  for (const item of outputList) {
    const itemType = String(item?.type || '').toLowerCase();
    if (itemType === 'image_generation_call') {
      pushB64(item?.result, item?.id || item?.call_id || '');
      continue;
    }

    const contentList = Array.isArray(item?.content) ? item.content : [];
    for (const part of contentList) {
      const partType = String(part?.type || '').toLowerCase();
      if (partType === 'output_image' || partType === 'image' || partType === 'image_generation') {
        pushB64(part?.image_base64 || part?.b64_json || part?.result, part?.id || item?.id || '');
      }
    }
  }

  // OpenAI image endpoint shape.
  const dataList = Array.isArray(resp?.data) ? resp.data : [];
  for (const item of dataList) {
    pushB64(item?.b64_json || item?.image_base64 || item?.result, item?.id || '');
  }

  // Gemini generateContent shape: candidates[].content.parts[].inlineData carries
  // base64 image data with its own mimeType (REST returns camelCase; tolerate the
  // snake_case variant too). Skip non-image inline parts (e.g. audio).
  const candidateList = Array.isArray(resp?.candidates) ? resp.candidates : [];
  for (const candidate of candidateList) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      if (!inline) continue;
      const mimeType = String(inline?.mimeType || inline?.mime_type || '').trim();
      if (mimeType && !mimeType.toLowerCase().startsWith('image/')) continue;
      pushB64(inline?.data, '', mimeType || 'image/png');
    }
  }

  return images;
}

export function extractToolCallsFromModelResponse(resp) {
  const toolCalls = [];

  const outputList = Array.isArray(resp?.output) ? resp.output : [];
  for (const item of outputList) {
    if (item?.type === 'function_call' && item?.name) {
      toolCalls.push({
        id: item.call_id || item.id || `call_${toolCalls.length + 1}`,
        name: String(item.name),
        argumentsText: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments || {}),
      });
    }
  }

  const choiceList = Array.isArray(resp?.choices) ? resp.choices : [];
  for (const choice of choiceList) {
    const msgToolCalls = Array.isArray(choice?.message?.tool_calls) ? choice.message.tool_calls : [];
    for (const tc of msgToolCalls) {
      const fn = tc?.function || {};
      if (!fn?.name) continue;
      toolCalls.push({
        id: tc.id || `call_${toolCalls.length + 1}`,
        name: String(fn.name),
        argumentsText: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || {}),
      });
    }
  }

  return toolCalls;
}
