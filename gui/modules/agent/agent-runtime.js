import {
  requestOpenAIResponses,
  requestOpenAICodexResponses,
  requestOpenAICompatibleChatCompletions,
  requestAnthropicMessages,
  requestGeminiGenerateContent,
  requestXAIResponses,
  extractReasoningTextFromModelResponse,
  extractTextFromModelResponse,
  extractToolCallsFromModelResponse,
  extractAnthropicToolCallsFromModelResponse,
  extractGeminiToolCallsFromModelResponse,
  extractImageGenerationResults,
} from './agent-responses-core.js';
import {
  buildCanonicalConversation,
  buildOpenAIResponsesPayload,
  buildCodexResponsesPayload,
  buildAnthropicMessagesPayload,
  buildGeminiGenerateContentPayload,
  createProviderCanonicalAdapter,
  normalizeCallIds,
} from './agent-provider-adapters.js';

// ---------------------------------------------------------------------------
// Provider configuration
//
// NOTE (2026-06-14): provider-native continuity data differs materially across
// vendors (e.g. OpenAI Responses items, Moonshot reasoning_content, Gemini
// thought_signature/raw content, Claude content blocks). Switching providers
// mid-session no longer resets the canonical conversation: every payload builder
// in agent-provider-adapters.js generically reconstructs function_call/tool_output
// turns from a "foreign" provider (normalizeCallIds() guarantees non-empty
// call_ids, and Gemini's builder gates raw-content replay on turn.providerId and
// fills in a thought_signature placeholder for foreign function_call parts).
// Provider-native metadata (providerMeta) is only used to preserve full fidelity
// within the same provider's loop; for other providers it's ignored in favor of
// this generic reconstruction.
//
// Every follow-up round rebuilds its input turns from the canonical conversation
// (buildLatestAgentCanonicalConversation) rather than chaining via
// previous_response_id. The `previousResponseId` parameter of sendRequest() below
// is currently always null/unused.
// ---------------------------------------------------------------------------
// Hard cap on tool-execution rounds within a single agent turn, guarding
// against runaway tool-call loops (stuck models, perpetually-failing tools).
export const MAX_AGENT_LOOP_ROUNDS = 50;
export const AUTO_COMPACT_THRESHOLD = 0.80;
export const MIN_ROUNDS_BETWEEN_COMPACTS = 3;

// If the todo list is non-empty and hasn't been touched (via todo_write) for
// this many rounds, remind the model to revisit it.
export const TODO_REMINDER_STALE_ROUNDS = 10;

// Once the upcoming round is this close to MAX_AGENT_LOOP_ROUNDS, remind the
// model that the loop is about to be cut off.
export const TODO_REMINDER_APPROACHING_ROUNDS = MAX_AGENT_LOOP_ROUNDS - 5;

// Returns true when the auto-compact callback should be invoked this round.
// Pure function of counters so it can be unit-tested directly.
export function shouldTriggerAutoCompact(usageInfo, round, lastAutoCompactRound) {
  const used = Number(usageInfo?.used) || 0;
  const max = Number(usageInfo?.max) || 1;
  return (
    used > 0 &&
    used / max >= AUTO_COMPACT_THRESHOLD &&
    round - lastAutoCompactRound >= MIN_ROUNDS_BETWEEN_COMPACTS
  );
}

// Builds an ephemeral reminder turn's text (or '' if no reminder is due) from
// the current pending todos and loop counters. Pure function so it can be
// unit-tested directly.
export function buildLoopReminderText(pendingTodos, roundsSinceTodoTouch, nextRound, maxLoopRounds = MAX_AGENT_LOOP_ROUNDS) {
  const parts = [];
  if (Array.isArray(pendingTodos) && pendingTodos.length > 0 && roundsSinceTodoTouch >= TODO_REMINDER_STALE_ROUNDS) {
    const list = pendingTodos.map((item) => `- [${item.status}] ${item.content}`).join('\n');
    parts.push(`[Reminder] Your todo list hasn't been updated in ${roundsSinceTodoTouch} rounds and still has unfinished items:\n${list}\nIf they're still relevant, keep working on them or call todo_write to update their status.`);
  }
  // The "approaching the limit" warning fires within the last 5 rounds of whatever
  // the (now configurable) per-turn cap is.
  const approachingThreshold = Math.max(1, maxLoopRounds - 5);
  if (nextRound >= approachingThreshold) {
    const remaining = Math.max(0, maxLoopRounds - nextRound);
    parts.push(`[Reminder] This agent loop stops after ${maxLoopRounds} tool-call rounds (${remaining} round(s) left). Wrap up or summarize progress soon.`);
  }
  return parts.join('\n\n');
}

const PROVIDER_SPECS = {
  openai: { kind: 'openai', label: 'OpenAI' },
  anthropic: { kind: 'anthropic', label: 'Anthropic' },
  google: { kind: 'gemini', label: 'Google' },
  xai: { kind: 'responses', label: 'xAI' },
  deepseek: { kind: 'chat', label: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions' },
  qwen: { kind: 'chat', label: 'Qwen', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
  moonshot: { kind: 'chat', label: 'Moonshot', endpoint: 'https://api.moonshot.ai/v1/chat/completions', supportsReasoningContent: true },
  doubao: { kind: 'chat', label: 'Doubao', endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions' },
  zai: { kind: 'chat', label: 'Z.ai (GLM)', endpoint: 'https://api.z.ai/api/paas/v4/chat/completions' },
};

function resolveProviderRuntimeContext({ providerId, providerConfig, providerSpec }) {
  const method = providerId === 'openai'
    ? (providerConfig.method === 'oauth' ? 'oauth' : 'api_key')
    : 'api_key';
  const bearerToken = (providerId === 'openai' && method === 'oauth')
    ? String(providerConfig.oauthAccessToken || '').trim()
    : String(providerConfig.apiKey || '').trim();
  const requestResponses = (providerId === 'openai')
    ? (method === 'oauth' ? requestOpenAICodexResponses : requestOpenAIResponses)
    : (providerId === 'anthropic'
      ? requestAnthropicMessages
      : (providerId === 'google'
        ? requestGeminiGenerateContent
        : (providerId === 'xai' ? requestXAIResponses : null)));
  const buildProviderPayload = (providerId === 'openai' || providerId === 'xai')
    ? (method === 'oauth' ? buildCodexResponsesPayload : buildOpenAIResponsesPayload)
    : (providerId === 'anthropic'
      ? buildAnthropicMessagesPayload
      : (providerId === 'google' ? buildGeminiGenerateContentPayload : null));
  return { method, bearerToken, requestResponses, buildProviderPayload, providerSpec };
}

// Deep-merges a provider-native reasoning fragment into an outgoing payload in
// place. Plain objects merge recursively (so nested shapes like Gemini's
// generationConfig.thinkingConfig don't clobber siblings); everything else is
// overwritten. Returns the mutated target.
export function deepMergeInto(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return target;
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      deepMergeInto(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

// Exported: the CLI line (cli-agent-runtime.js) reuses this exact format so both
// lines render tool calls identically (the "[tool] " prefix is what the chat UI
// keys the clickable/collapsible tool-progress bubble on).
export function summarizeToolCall(call) {
  const name = String(call?.name || 'tool');
  let args = {};
  try {
    args = call?.argumentsText ? JSON.parse(call.argumentsText) : {};
  } catch (_) {
    args = {};
  }

  const keys = Object.keys(args || {}).slice(0, 2);
  const parts = keys.map((key) => {
    const value = args[key];
    if (value == null) return `${key}=null`;
    if (Array.isArray(value)) return `${key}=[${value.length}]`;
    if (typeof value === 'object') return `${key}={...}`;
    const normalized = String(value).replace(/\s+/g, ' ').trim();
    return `${key}=${normalized}`;
  });

  const summary = parts.length > 0 ? `${name}(${parts.join(', ')})` : `${name}()`;
  return `[tool] ${summary}`;
}

export function createAgentRuntime(deps) {
  const {
    promptFileById,
    // Optional: reads a per-project, runtime-editable prompt from
    // <projectRoot>/agents/<agent>/prompt.md. Returns '' when no project is open
    // or the file is absent, in which case we fall back to the hardcoded prompt.
    loadProjectAgentPrompt,
    suffixFileById,
    humanizeFileById,
    getAgentToolSchemas,
    getAgentFunctions,
    getAgentModelSettings,
    getContextLimitByModel,
    getTimelineByAgent,
    getCanonicalTurnsByAgent,
    getAgentTodos,
    ensureOpenAITokenReady,
  } = deps;

  const agentPromptCache = new Map();
  const agentSuffixCache = new Map();
  const agentHumanizeCache = new Map();

  function resolvePromptFileByIdMap() {
    if (typeof promptFileById === 'function') {
      return promptFileById() || {};
    }
    return promptFileById || {};
  }

  function resolveSuffixFileByIdMap() {
    if (typeof suffixFileById === 'function') {
      return suffixFileById() || {};
    }
    return suffixFileById || {};
  }

  async function loadAgentSystemPrompt(agentId) {
    // Prefer the per-project prompt when a project folder is open. This is read on
    // every request (not cached) so edits to agents/<agent>/prompt.md take effect live.
    // Any failure or absence falls through to the hardcoded prompt below.
    if (typeof loadProjectAgentPrompt === 'function') {
      try {
        const projectPrompt = await loadProjectAgentPrompt(agentId);
        if (String(projectPrompt || '').trim()) return projectPrompt;
      } catch (_) {
        // fall through to hardcoded prompt
      }
    }

    const promptMap = resolvePromptFileByIdMap();
    const target = promptMap[agentId] || promptMap.designer;
    if (!target) throw new Error('Missing agent system prompt path');
    if (agentPromptCache.has(target)) return agentPromptCache.get(target);

    const response = await fetch(target, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Failed to load system prompt: ${target} (${response.status})`);
    }

    const text = await response.text();
    agentPromptCache.set(target, text);
    return text;
  }

  async function loadAgentSuffixPrompt(agentId) {
    const suffixMap = resolveSuffixFileByIdMap();
    const target = (suffixMap && (suffixMap[agentId] || suffixMap.designer)) || null;
    if (!target) return '';
    if (agentSuffixCache.has(target)) return agentSuffixCache.get(target);

    try {
      const response = await fetch(target, { cache: 'no-cache' });
      if (!response.ok) {
        agentSuffixCache.set(target, '');
        return '';
      }
      const text = await response.text();
      const cleaned = String(text || '').trim();
      agentSuffixCache.set(target, cleaned);
      return cleaned;
    } catch (_) {
      agentSuffixCache.set(target, '');
      return '';
    }
  }

  async function loadAgentHumanizePrompt(agentId) {
    const target = (humanizeFileById && (humanizeFileById[agentId] || humanizeFileById.designer)) || null;
    if (!target) return '';
    if (agentHumanizeCache.has(target)) return agentHumanizeCache.get(target);

    try {
      const response = await fetch(target, { cache: 'no-cache' });
      if (!response.ok) {
        agentHumanizeCache.set(target, '');
        return '';
      }
      const text = await response.text();
      const cleaned = String(text || '').trim();
      agentHumanizeCache.set(target, cleaned);
      return cleaned;
    } catch (_) {
      agentHumanizeCache.set(target, '');
      return '';
    }
  }

  // Suffix is recency-sensitive behavior anchoring: it rides at the TAIL of the
  // conversation and is re-injected every loop round so it stays adjacent to the
  // model's next generation.
  function buildInjectedDeveloperPrompt(suffixPrompt) {
    const suffix = String(suffixPrompt || '').trim();
    return suffix ? `[agent-suffix]\n${suffix}` : '';
  }

  // Humanize is stable style guidance: it belongs right after the system prompt
  // (injected once at the top), NOT bundled with the suffix at the tail.
  function buildHumanizeSystemBlock(humanizePrompt) {
    const humanize = String(humanizePrompt || '').trim();
    return humanize ? `[agent-humanize]\n${humanize}` : '';
  }

  async function getAgentResponsesInput(userPrompt, agentId) {
    const systemPrompt = await loadAgentSystemPrompt(agentId);
    const suffixPrompt = await loadAgentSuffixPrompt(agentId);
    const settings = getAgentModelSettings?.() || {};
    const humanizePrompt = settings?.humanizeEnabled ? await loadAgentHumanizePrompt(agentId) : '';
    const developerPrompt = buildInjectedDeveloperPrompt(suffixPrompt);
    const postSystemPrompt = buildHumanizeSystemBlock(humanizePrompt);
    const turns = buildCanonicalConversation({
      systemPrompt,
      postSystemPrompt,
      developerPrompt,
      userPrompt,
      timeline: [],
      historyLimit: 0,
    });
    return buildOpenAIResponsesPayload({ model: 'gpt-4o', tools: [], turns }).input;
  }

  async function runAgentToolCall(call, ctx = {}) {
    const fns = getAgentFunctions();
    const fn = fns?.[call.name];
    if (typeof fn !== 'function') {
      return { ok: false, error: `Unknown tool: ${call.name}` };
    }

    let args = {};
    try {
      args = call.argumentsText ? JSON.parse(call.argumentsText) : {};
    } catch (_) {
      return { ok: false, error: `Invalid tool arguments JSON for ${call.name}` };
    }

    try {
      const result = await fn(args, ctx);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async function buildAgentCanonicalConversation(params) {
    const agentId = params?.agentId;
    const systemPrompt = await loadAgentSystemPrompt(agentId);
    const suffixPrompt = await loadAgentSuffixPrompt(agentId);
    const settings = getAgentModelSettings?.() || {};
    const humanizePrompt = settings?.humanizeEnabled ? await loadAgentHumanizePrompt(agentId) : '';
    const developerPrompt = buildInjectedDeveloperPrompt(suffixPrompt);
    const postSystemPrompt = buildHumanizeSystemBlock(humanizePrompt);
    const canonicalTurns = typeof getCanonicalTurnsByAgent === 'function'
      ? getCanonicalTurnsByAgent(agentId)
      : null;
    if (Array.isArray(canonicalTurns) && canonicalTurns.length > 0) {
      const turns = [];
      if (String(systemPrompt || '').trim()) {
        turns.push({ role: 'system', text: String(systemPrompt || '').trim() });
      }
      if (postSystemPrompt) {
        turns.push({ role: 'system', text: postSystemPrompt, images: [] });
      }
      for (const item of canonicalTurns) {
        if (!item) continue;
        if (item.includeInContext === false && String(item.role || '') !== 'tool_output') continue;
        if (String(item.role || '') === 'thinking') continue;
        turns.push(JSON.parse(JSON.stringify(item)));
      }
      if (String(developerPrompt || '').trim()) {
        turns.push({ role: 'system', text: developerPrompt, images: [] });
      }
      return turns;
    }

    const timeline = getTimelineByAgent(agentId);
    return buildCanonicalConversation({
      systemPrompt,
      postSystemPrompt,
      developerPrompt,
      userPrompt: '',
      userImages: [],
      timeline,
      historyLimit: null,
    });
  }

  async function buildLatestAgentCanonicalConversation(agentId) {
    return buildAgentCanonicalConversation({
      agentId,
      prompt: '',
      images: [],
    });
  }

  async function requestDefaultModelCompletion(params) {
    const requestSignal = params?.signal;
    const agentId = params?.agentId;
    let settings = getAgentModelSettings();
    const providerId = String(settings.defaultProviderId || 'openai');

    const providerSpec = PROVIDER_SPECS[providerId];
    if (!providerSpec) {
      throw new Error(`Provider ${providerId} is not enabled yet.`);
    }

    if (providerId === 'openai' && typeof ensureOpenAITokenReady === 'function') {
      settings = await ensureOpenAITokenReady(settings);
    }

    const providerConfig = settings.providers?.[providerId] || {};
    const { method, bearerToken, requestResponses, buildProviderPayload } = resolveProviderRuntimeContext({
      providerId,
      providerConfig,
      providerSpec,
    });

    if (!bearerToken) {
      if (providerId === 'openai' && method === 'oauth') {
        throw new Error('OpenAI OAuth access token is empty. Please set it in Settings -> Agent Model.');
      }
      throw new Error(`${providerSpec.label} API key is empty. Please set it in Settings -> Agent Model.`);
    }

    const model = settings.defaultModel || 'gpt-4o';
    // Per-turn tool-call round cap. A caller-supplied params.maxLoopRounds wins
    // (the "run until todos done" loop passes its remaining total-round budget so a
    // single turn never overshoots the overall cap); otherwise fall back to the
    // user-configured setting, then the built-in default.
    const settingsMaxLoopRounds = Math.max(1, Math.floor(Number(settings.maxLoopRounds)) || MAX_AGENT_LOOP_ROUNDS);
    const maxLoopRounds = (Number.isFinite(Number(params?.maxLoopRounds)) && Number(params.maxLoopRounds) > 0)
      ? Math.max(1, Math.floor(Number(params.maxLoopRounds)))
      : settingsMaxLoopRounds;
    // Provider-native reasoning fragment for this model, chosen in settings and
    // deep-merged into the request as-is (no runtime mapping). null = send nothing.
    const reasoningFragment = (settings.reasoning && typeof settings.reasoning === 'object')
      ? (settings.reasoning[model] || null)
      : null;
    // Configurable output cap (currently consumed by the Anthropic path, where it
    // was previously hardcoded). 0 / unset => keep the built-in default.
    const configuredMaxTokens = Math.max(0, Math.floor(Number(settings.maxOutputTokens) || 0));
    const anthropicMaxTokens = configuredMaxTokens > 0 ? configuredMaxTokens : 4096;
    const isMoonshotThinkingModel = providerId === 'moonshot'
      && model.startsWith('kimi-k2.');
    // Stable routing hint for OpenAI's prompt cache (Responses + Codex). Keeping it
    // constant per agent+model across rounds pins identical prefixes to the same
    // cache shard. Only OpenAI honors prompt_cache_key; leave null for xAI (shares
    // the Responses payload builder but may reject unknown fields) and others.
    const promptCacheKey = providerId === 'openai'
      ? `angel:${String(agentId || 'agent')}:${model}`
      : null;
    const agentTools = (typeof getAgentToolSchemas === 'function')
      ? getAgentToolSchemas(params?.agentId)
      : [];
    // The built-in image-generation tool is an OpenAI api_key feature. An empty
    // imageGenerationModel means "auto" (let OpenAI pick its default), so we only
    // pin a model when the user explicitly chose one in settings.
    const imageGenerationModel = String(settings.imageGenerationModel || '').trim();
    const imageGenerationTool = imageGenerationModel
      ? { type: 'image_generation', model: imageGenerationModel }
      : { type: 'image_generation' };
    const responseTools = (providerId === 'openai' && method === 'api_key')
      ? [...(Array.isArray(agentTools) ? agentTools : []), imageGenerationTool]
      : agentTools;

    const turnAdapter = createProviderCanonicalAdapter({
      providerId,
      providerKind: providerSpec.kind,
      method,
      model,
    });

    const collectedText = [];
    const toolTrace = [];
    const imageOutputs = [];
    let emittedModelTextCount = 0;
    let latestAssistantMeta = null;

    const notify = (statusText, usageInfo = null) => {
      if (typeof params?.onProgress === 'function') {
        try { params.onProgress(String(statusText || ''), usageInfo); } catch (_) {}
      }
    };

    const extractTokenBreakdown = (resp) => {
      if (providerSpec.kind === 'gemini') {
        const m = resp?.usageMetadata || {};
        const cachedInput = Math.max(0, Number(m.cachedContentTokenCount) || 0);
        const input = Math.max(0, (Number(m.promptTokenCount) || 0) - cachedInput);
        const output = Math.max(0, Number(m.candidatesTokenCount) || 0);
        return { cachedInput, input, output };
      }
      if (providerSpec.kind === 'chat') {
        const u = resp?.usage || {};
        const cachedInput = Math.max(0, Number(u.prompt_tokens_details?.cached_tokens) || 0);
        const input = Math.max(0, (Number(u.prompt_tokens) || 0) - cachedInput);
        const output = Math.max(0, Number(u.completion_tokens) || 0);
        return { cachedInput, input, output };
      }
      if (providerSpec.kind === 'anthropic') {
        const u = resp?.usage || {};
        // Only cache_read is an actual (cheap) cache hit. cache_creation is the
        // input we just WROTE to the cache this request — billed at a premium, not
        // a hit — so it counts as fresh input, not as "cached". input_tokens is the
        // remaining uncached portion. (Anthropic splits the prompt across all three;
        // none of them overlap.)
        const cachedInput = Math.max(0, Number(u.cache_read_input_tokens) || 0);
        const input = Math.max(0, Number(u.input_tokens) || 0)
          + Math.max(0, Number(u.cache_creation_input_tokens) || 0);
        const output = Math.max(0, Number(u.output_tokens) || 0);
        return { cachedInput, input, output };
      }
      // openai responses api (openai, xai)
      const u = resp?.usage || {};
      const cachedInput = Math.max(0, Number(u.input_tokens_details?.cached_tokens) || 0);
      const input = Math.max(0, (Number(u.input_tokens) || 0) - cachedInput);
      const output = Math.max(0, Number(u.output_tokens) || 0);
      return { cachedInput, input, output };
    };

    const makeUsageInfo = (resp) => {
      const breakdown = extractTokenBreakdown(resp);
      // Total prompt size = cached (read) + everything else. Deriving `used` from
      // the breakdown keeps it correct across providers: for Anthropic input_tokens
      // alone excludes the cache fields (so it would under-report once caching kicks
      // in), and Gemini reports promptTokenCount, not usage.input_tokens.
      return {
        used: Math.max(0, breakdown.cachedInput + breakdown.input),
        max: getContextLimitByModel(model),
        ...breakdown,
      };
    };

    const buildChatExtraBody = () => {
      const extra = {};
      if (isMoonshotThinkingModel) {
        extra.thinking = { type: 'enabled', keep: 'all' };
      }
      if (reasoningFragment) deepMergeInto(extra, reasoningFragment);
      return Object.keys(extra).length > 0 ? extra : null;
    };

    // Sends a request for the given canonical turns, dispatching to the right
    // provider transport/payload shape. `previousResponseId` is currently always
    // null (see PROVIDER_SPECS note above).
    const sendRequest = async (rawTurns, { previousResponseId = null } = {}) => {
      const turns = normalizeCallIds(rawTurns);
      if (providerSpec.kind === 'chat') {
        return requestOpenAICompatibleChatCompletions({
          endpoint: providerSpec.endpoint,
          model,
          turns,
          tools: responseTools,
          extraBody: buildChatExtraBody(),
        }, bearerToken, {}, { signal: requestSignal });
      }
      if (providerSpec.kind === 'anthropic') {
        const payload = buildProviderPayload({ model, tools: responseTools, turns, maxTokens: anthropicMaxTokens, enablePromptCaching: true });
        if (reasoningFragment) deepMergeInto(payload, reasoningFragment);
        return requestResponses(payload, bearerToken, { signal: requestSignal });
      }
      if (providerSpec.kind === 'gemini') {
        const payload = buildProviderPayload({ tools: responseTools, turns, providerId });
        if (reasoningFragment) deepMergeInto(payload, reasoningFragment);
        return requestResponses(payload, model, bearerToken, { signal: requestSignal });
      }
      // providerId lets the OpenAI Responses builder scope encrypted-reasoning
      // replay to OpenAI only (the same builder also serves xAI). The Codex builder
      // ignores it (always OpenAI-oauth).
      const payload = buildProviderPayload({ model, tools: responseTools, turns, previousResponseId, promptCacheKey, providerId });
      if (reasoningFragment) deepMergeInto(payload, reasoningFragment);
      return requestResponses(payload, bearerToken, { signal: requestSignal });
    };

    const finalize = (text) => {
      const result = {
        text,
        toolTrace,
        images: imageOutputs,
        providerId,
        providerModel: model,
        reasoningText: latestAssistantMeta?.reasoningText || '',
        providerMeta: latestAssistantMeta?.providerMeta || null,
        canonicalToolCalls: Array.isArray(latestAssistantMeta?.canonicalToolCalls) ? latestAssistantMeta.canonicalToolCalls : [],
      };
      if (toolTrace.length > 0 || imageOutputs.length > 0) return result;
      return text;
    };

    let responseJson = await sendRequest(await buildAgentCanonicalConversation(params), {
      previousResponseId: null,
    });

    let round = 0;
    let roundsSinceTodoTouch = 0;
    let lastAutoCompactRound = -MIN_ROUNDS_BETWEEN_COMPACTS;
    while (true) {
      const reasoningParts = extractReasoningTextFromModelResponse(responseJson);
      const reasoningText = reasoningParts.join('\n\n').trim();
      const responseProviderMeta = turnAdapter.metaFromResponse(responseJson);
      latestAssistantMeta = {
        reasoningText,
        providerMeta: responseProviderMeta,
        canonicalToolCalls: [],
      };

      // Surface provider-native reasoning (Moonshot/Kimi reasoning_content,
      // Anthropic thinking, ...) as ordinary streamed output so tool-only turns
      // aren't silent. Marked displayOnly: the same reasoning is already replayed
      // to the model as reasoning_content on its own turn, so this visible copy
      // must NOT re-enter the model context (the UI keeps it out of the canonical
      // transcript and history). It is not added to collectedText for the same
      // reason, and so the aggregated final answer stays reasoning-free.
      if (reasoningText && typeof params?.onModelText === 'function') {
        try {
          params.onModelText(reasoningText, {
            reasoningText: '',
            providerId,
            providerModel: model,
            providerMeta: responseProviderMeta,
            displayOnly: true,
          });
        } catch (_) {}
      }

      const textParts = extractTextFromModelResponse(responseJson);
      if (textParts.length > 0) {
        collectedText.push(...textParts);
        if (typeof params?.onModelText === 'function') {
          for (const part of textParts) {
            const text = String(part || '').trim();
            if (!text) continue;
            try {
              params.onModelText(text, {
                reasoningText,
                providerId,
                providerModel: model,
                providerMeta: responseProviderMeta,
              });
              emittedModelTextCount += 1;
            } catch (_) {}
          }
        }
      }

      const usageInfo = makeUsageInfo(responseJson);
      notify('', usageInfo);
      if (typeof params?.onUsageDelta === 'function') {
        try { params.onUsageDelta({ cachedInput: usageInfo.cachedInput, input: usageInfo.input, output: usageInfo.output }); } catch (_) {}
      }
      const generatedImages = extractImageGenerationResults(responseJson);
      if (generatedImages.length > 0) imageOutputs.push(...generatedImages);

      const toolCalls = providerSpec.kind === 'anthropic'
        ? extractAnthropicToolCallsFromModelResponse(responseJson)
        : (providerSpec.kind === 'gemini'
          ? extractGeminiToolCallsFromModelResponse(responseJson)
          : extractToolCallsFromModelResponse(responseJson));
      if (toolCalls.length === 0) {
        // Why did the turn end? Chat APIs report this as choices[].finish_reason
        // ('stop' = normal, 'length' = truncated, 'tool_calls' = wants tools);
        // Anthropic uses stop_reason. Nothing else in the loop inspects it, so a
        // truncated or empty turn is otherwise indistinguishable from a clean
        // finish — which is exactly the "it stopped halfway / no final answer"
        // mystery. Surface it as a visible (display-only) note so it isn't silent.
        const firstChoice = Array.isArray(responseJson?.choices) ? responseJson.choices[0] : null;
        const finishReason = (firstChoice && typeof firstChoice.finish_reason === 'string')
          ? firstChoice.finish_reason
          : (typeof responseJson?.stop_reason === 'string' ? responseJson.stop_reason : '');
        const emitNote = (note) => {
          if (typeof params?.onModelText !== 'function') return;
          try {
            params.onModelText(note, {
              reasoningText: '',
              providerId,
              providerModel: model,
              providerMeta: responseProviderMeta,
              displayOnly: true,
            });
          } catch (_) {}
        };

        // Truncation can hit even when some text was produced, leaving a partial
        // answer — flag it regardless of whether there is collected text.
        if (finishReason === 'length' || finishReason === 'max_tokens') {
          emitNote('[⚠ The model response was cut off (finish_reason=length) before it finished — the output/thinking token budget was likely exhausted, so the answer may be incomplete.]');
        }

        if (collectedText.length > 0) {
          if (params?.suppressAggregatedFinalText && emittedModelTextCount > 0) {
            return finalize('');
          }
          return finalize(collectedText.join('\n\n'));
        }

        // No tool call and nothing displayable: the turn produced no answer at all.
        if (finishReason !== 'length' && finishReason !== 'max_tokens') {
          emitNote(`[The model ended the turn without a final answer or tool call${finishReason ? ` (finish_reason=${finishReason})` : ''}.]`);
        }
        return finalize('');
      }

      if (round >= maxLoopRounds) {
        const limitNote = `[Agent loop stopped after reaching the maximum of ${maxLoopRounds} tool-call rounds.]`;
        collectedText.push(limitNote);
        if (typeof params?.onModelText === 'function') {
          try {
            params.onModelText(limitNote, {
              reasoningText,
              providerId,
              providerModel: model,
              providerMeta: responseProviderMeta,
            });
            emittedModelTextCount += 1;
          } catch (_) {}
        }
        if (params?.suppressAggregatedFinalText && emittedModelTextCount > 0) {
          return finalize('');
        }
        return finalize(collectedText.join('\n\n'));
      }

      // The provider's raw assistant content for this round (Anthropic thinking
      // blocks with signatures, OpenAI reasoning items) lives in
      // responseProviderMeta. It is attached to the assistant TEXT turn when the
      // round produced text; for a tool-only round no text turn exists, so embed it
      // on the first function_call turn instead. Every function_call turn carries
      // the response id so the payload builder can dedupe replayed content.
      const hadAssistantText = textParts.length > 0;
      toolCalls.forEach((call, callIdx) => {
        notify(summarizeToolCall(call), usageInfo);
        if (typeof params?.onToolCall === 'function') {
          const embedRawContent = !hadAssistantText && callIdx === 0;
          try { params.onToolCall(turnAdapter.functionCallTurn(call, reasoningText, responseProviderMeta, embedRawContent)); } catch (_) {}
        }
      });
      const toolRuns = [];
      for (const call of toolCalls) {
        const run = await runAgentToolCall(call, { agentId });
        toolRuns.push({ call, run });
        const turn = turnAdapter.toolOutputTurn(call, run);
        if (typeof params?.onToolOutput === 'function') {
          try { params.onToolOutput(turn); } catch (_) {}
        }
      }

      const attachedImages = [];
      for (const item of toolRuns) {
        const imgs = item?.run?.result?._attachImages;
        if (Array.isArray(imgs) && imgs.length > 0) attachedImages.push(...imgs);
      }
      if (attachedImages.length > 0 && typeof params?.onImagesAttached === 'function') {
        try { params.onImagesAttached([{ role: 'user', text: '', images: attachedImages }]); } catch (_) {}
      }

      for (const item of toolRuns) {
        toolTrace.push({
          round,
          tool: item.call?.name || '',
          call_id: item.call?.id || '',
          arguments: item.call?.argumentsText || '{}',
          result: item.run,
        });
      }

      if (toolCalls.some((call) => call?.name === 'todo_write')) {
        roundsSinceTodoTouch = 0;
      } else {
        roundsSinceTodoTouch += 1;
      }

      if (shouldTriggerAutoCompact(usageInfo, round, lastAutoCompactRound) && typeof params?.onAutoCompact === 'function') {
        try { await params.onAutoCompact(agentId); } catch (_) {}
        lastAutoCompactRound = round;
        roundsSinceTodoTouch = 0;
      }

      const followupTurns = await buildLatestAgentCanonicalConversation(agentId);
      const pendingTodos = (typeof getAgentTodos === 'function' ? getAgentTodos(agentId) : [])
        .filter((item) => item?.status !== 'completed' && item?.status !== 'blocked');
      const reminderText = buildLoopReminderText(pendingTodos, roundsSinceTodoTouch, round + 1, maxLoopRounds);
      if (reminderText) {
        followupTurns.push({ role: 'system', text: reminderText, images: [] });
      }

      responseJson = await sendRequest(followupTurns, {
        previousResponseId: null,
      });

      round += 1;
      // Report each completed tool-call round so a higher-level loop (run until
      // todos done) can enforce a cumulative round budget across turns.
      if (typeof params?.onRoundComplete === 'function') {
        try { params.onRoundComplete(round); } catch (_) {}
      }
    }
  }

  return {
    requestDefaultModelCompletion,
    loadAgentSystemPrompt,
    getAgentResponsesInput,
  };
}
