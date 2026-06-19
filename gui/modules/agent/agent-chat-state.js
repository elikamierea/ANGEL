export function createAgentChatStateManager({
  defaultContextMaxTokens = 128000,
  modelContextLimits = {},
  initialAgents = null,
} = {}) {
  const DEFAULT_AGENTS = [
    { id: 'designer', name: 'Designer' },
    { id: 'orchestrator', name: 'Orchestrator' },
    { id: 'programmer', name: 'Programmer' },
    { id: 'resource-provider', name: 'ResourceProvider' },
  ];

  function normalizeAgents(inputAgents) {
    const source = Array.isArray(inputAgents) && inputAgents.length > 0 ? inputAgents : DEFAULT_AGENTS;
    const seen = new Set();
    const normalized = [];
    for (const raw of source) {
      const id = typeof raw === 'string' ? String(raw).trim() : String(raw?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const defaultName = id
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      const name = typeof raw === 'string'
        ? defaultName
        : String(raw?.name || defaultName).trim() || defaultName;
      normalized.push({ id, name });
    }
    return normalized.length > 0 ? normalized : DEFAULT_AGENTS;
  }

  const agents = normalizeAgents(initialAgents);
  const state = {
    minimized: false,
    prevWidth: null,
    prevHeight: null,
    activeAgentId: agents[0]?.id || 'designer',
    statusByAgent: Object.fromEntries(agents.map((a) => [a.id, 'Idle'])),
    contextUsageByAgent: Object.fromEntries(agents.map((a) => [a.id, { used: 0, max: defaultContextMaxTokens }])),
    tokenUsageByAgent: Object.fromEntries(agents.map((a) => [a.id, { cachedInput: 0, input: 0, output: 0 }])),
    agents,
    canonicalByAgent: Object.fromEntries(agents.map((a) => [a.id, { turns: [] }])),
    messagesByAgent: Object.fromEntries(agents.map((a) => [a.id, []])),
    todosByAgent: Object.fromEntries(agents.map((a) => [a.id, []])),
  };

  function getAgentDisplayName(agentId) {
    const found = state.agents.find((item) => item.id === agentId);
    return found?.name || agentId || 'Agent';
  }

  const normalizedModelContextLimits = Object.entries(modelContextLimits || {})
    .filter(([k, v]) => String(k || '').trim().length > 0 && Number.isFinite(Number(v)) && Number(v) > 0)
    .reduce((acc, [k, v]) => {
      acc[String(k).toLowerCase()] = Math.max(1, Math.trunc(Number(v)));
      return acc;
    }, {});

  function getContextLimitByModel(modelName) {
    const name = String(modelName || '').trim().toLowerCase();
    if (!name) return defaultContextMaxTokens;

    if (Object.prototype.hasOwnProperty.call(normalizedModelContextLimits, name)) {
      return normalizedModelContextLimits[name];
    }

    for (const [pattern, limit] of Object.entries(normalizedModelContextLimits)) {
      if (name.includes(pattern)) return limit;
    }

    return defaultContextMaxTokens;
  }

  function setAgentStatus(agentId, statusText) {
    if (!agentId) return;
    state.statusByAgent[agentId] = String(statusText || 'Idle');
  }

  function setAgentContextUsage(agentId, usedTokens, maxTokens) {
    if (!agentId) return;
    const used = Number.isFinite(Number(usedTokens)) ? Math.max(0, Math.trunc(Number(usedTokens))) : 0;
    const max = Number.isFinite(Number(maxTokens)) ? Math.max(1, Math.trunc(Number(maxTokens))) : defaultContextMaxTokens;
    state.contextUsageByAgent[agentId] = { used, max };
  }

  function accumulateAgentTokenUsage(agentId, delta) {
    if (!agentId) return;
    if (!state.tokenUsageByAgent[agentId]) {
      state.tokenUsageByAgent[agentId] = { cachedInput: 0, input: 0, output: 0 };
    }
    const cur = state.tokenUsageByAgent[agentId];
    cur.cachedInput += Math.max(0, Number(delta?.cachedInput) || 0);
    cur.input += Math.max(0, Number(delta?.input) || 0);
    cur.output += Math.max(0, Number(delta?.output) || 0);
  }

  function getAgentTokenUsage(agentId) {
    return state.tokenUsageByAgent?.[agentId] || { cachedInput: 0, input: 0, output: 0 };
  }

  function resetAgentCanonical(agentId) {
    if (state.canonicalByAgent[agentId]) {
      state.canonicalByAgent[agentId] = { turns: [] };
    }
  }

  function pushAgentMessage(agentId, role, text, options = {}) {
    // UI-only message insertion. Canonical transcript writes must go through
    // explicit canonical/event APIs instead of this helper.
    if (!state.messagesByAgent[agentId]) return;

    const normalizedRole = String(role || 'agent');
    const includeInContext = Object.prototype.hasOwnProperty.call(options, 'includeInContext')
      ? Boolean(options.includeInContext)
      : normalizedRole !== 'thinking';
    const replaceLastThinking = Boolean(options.replaceLastThinking);

    const list = state.messagesByAgent[agentId];

    const normalizedImages = Array.isArray(options?.images)
      ? options.images
        .map((img) => ({
          id: String(img?.id || ''),
          name: String(img?.name || ''),
          mimeType: String(img?.mimeType || img?.type || ''),
          size: Number(img?.size || 0),
          dataUrl: String(img?.dataUrl || ''),
        }))
        .filter((img) => img.dataUrl)
      : [];

    const nextMessage = {
      role: normalizedRole,
      text: String(text || ''),
      index: list.length,
      includeInContext,
      imageUrl: typeof options?.imageUrl === 'string' ? options.imageUrl : '',
      imagePath: typeof options?.imagePath === 'string' ? options.imagePath : '',
      images: normalizedImages,
      reasoningText: typeof options?.reasoningText === 'string' ? options.reasoningText : '',
      providerId: typeof options?.providerId === 'string' ? options.providerId : '',
      providerModel: typeof options?.providerModel === 'string' ? options.providerModel : '',
      recoveryInjected: Boolean(options?.recoveryInjected),
      messageKind: typeof options?.messageKind === 'string' ? options.messageKind : '',
      providerMeta: options?.providerMeta && typeof options.providerMeta === 'object'
        ? JSON.parse(JSON.stringify(options.providerMeta))
        : null,
    };

    if (replaceLastThinking && normalizedRole === 'thinking' && list.length > 0) {
      const lastIdx = list.length - 1;
      if (list[lastIdx]?.role === 'thinking') {
        nextMessage.index = Number.isFinite(Number(list[lastIdx]?.index)) ? Number(list[lastIdx].index) : lastIdx;
        list[lastIdx] = nextMessage;
        return;
      }
    }

    list.push(nextMessage);
  }

  function resetAgents(nextAgents) {
    const normalized = normalizeAgents(nextAgents);
    state.agents = normalized;
    state.activeAgentId = normalized.some((a) => a.id === state.activeAgentId)
      ? state.activeAgentId
      : (normalized[0]?.id || 'designer');
    state.statusByAgent = Object.fromEntries(normalized.map((a) => [a.id, 'Idle']));
    state.contextUsageByAgent = Object.fromEntries(normalized.map((a) => [a.id, { used: 0, max: defaultContextMaxTokens }]));
    state.tokenUsageByAgent = Object.fromEntries(normalized.map((a) => [a.id, { cachedInput: 0, input: 0, output: 0 }]));
    state.canonicalByAgent = Object.fromEntries(normalized.map((a) => [a.id, { turns: [] }]));
    state.messagesByAgent = Object.fromEntries(normalized.map((a) => [a.id, []]));
    state.todosByAgent = Object.fromEntries(normalized.map((a) => [a.id, []]));
  }

  const TODO_STATUSES = ['pending', 'in_progress', 'completed', 'blocked'];

  function normalizeTodoItems(items) {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        const content = String(item?.content || '').trim();
        if (!content) return null;
        const status = TODO_STATUSES.includes(item?.status) ? item.status : 'pending';
        return { content, status };
      })
      .filter(Boolean);
  }

  function getAgentTodos(agentId) {
    return Array.isArray(state.todosByAgent[agentId]) ? state.todosByAgent[agentId] : [];
  }

  function setAgentTodos(agentId, items) {
    const normalized = normalizeTodoItems(items);
    if (Object.prototype.hasOwnProperty.call(state.todosByAgent, agentId)) {
      state.todosByAgent[agentId] = normalized;
    }
    return normalized;
  }

  function appendCanonicalTurns(agentId, turns) {
    if (!state.canonicalByAgent[agentId]) return;
    if (!Array.isArray(turns) || turns.length === 0) return;
    const list = state.canonicalByAgent[agentId]?.turns || [];
    for (const item of turns) {
      list.push(normalizeCanonicalTurn(item, list.length));
    }
    state.canonicalByAgent[agentId] = { turns: list };
  }

  function patchLastCanonicalTurn(agentId, patch = {}, predicate = null) {
    const list = Array.isArray(state.canonicalByAgent[agentId]?.turns) ? state.canonicalByAgent[agentId].turns : null;
    if (!list || list.length === 0) return false;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const current = list[i];
      if (typeof predicate === 'function' && !predicate(current, i)) continue;
      list[i] = normalizeCanonicalTurn({ ...current, ...patch }, i);
      state.canonicalByAgent[agentId] = { turns: list };
      return true;
    }
    return false;
  }

  function appendCanonicalAssistantText(agentId, text, options = {}) {
    if (!state.canonicalByAgent[agentId]) return false;
    const chunk = String(text || '');
    if (!chunk.trim()) return false;
    const list = state.canonicalByAgent[agentId]?.turns || [];
    const last = list.length > 0 ? list[list.length - 1] : null;
    const patch = {
      text: `${String(last?.text || '')}${chunk}`,
      reasoningText: typeof options?.reasoningText === 'string' ? options.reasoningText : String(last?.reasoningText || ''),
      providerId: typeof options?.providerId === 'string' ? options.providerId : String(last?.providerId || ''),
      providerModel: typeof options?.providerModel === 'string' ? options.providerModel : String(last?.providerModel || ''),
      providerMeta: options?.providerMeta && typeof options.providerMeta === 'object' ? cloneJson(options.providerMeta) : (last?.providerMeta || null),
    };
    if (last && last.role === 'assistant') {
      list[list.length - 1] = normalizeCanonicalTurn({ ...last, ...patch }, list.length - 1);
      state.canonicalByAgent[agentId] = { turns: list };
      return true;
    }
    list.push(normalizeCanonicalTurn({
      role: 'assistant',
      text: chunk,
      reasoningText: typeof options?.reasoningText === 'string' ? options.reasoningText : '',
      providerId: typeof options?.providerId === 'string' ? options.providerId : '',
      providerModel: typeof options?.providerModel === 'string' ? options.providerModel : '',
      providerMeta: options?.providerMeta && typeof options.providerMeta === 'object' ? cloneJson(options.providerMeta) : null,
    }, list.length));
    state.canonicalByAgent[agentId] = { turns: list };
    return true;
  }

  // Builds canonical turns from a pre-v2 session/history payload (separate
  // `timeline` + `tools` arrays, no `canonical.turns`).
  function canonicalTurnsFromLegacyPayload(timeline, tools) {
    const turns = [];
    for (const item of timeline) {
      if (!item || item.role === 'thinking') continue;
      turns.push(normalizeCanonicalTurn(item, turns.length));
    }
    for (const item of tools) {
      turns.push(normalizeCanonicalTurn({
        role: 'tool_output',
        text: '',
        call_id: typeof item?.call_id === 'string' ? item.call_id : '',
        name: typeof item?.tool === 'string' ? item.tool : String(item?.name || ''),
        arguments: typeof item?.arguments === 'string' ? item.arguments : JSON.stringify(item?.arguments || {}),
        output: (() => {
          try { return JSON.stringify(item?.result); } catch (_) { return String(item?.result || ''); }
        })(),
        providerId: typeof item?.providerId === 'string' ? item.providerId : '',
        providerModel: typeof item?.providerModel === 'string' ? item.providerModel : '',
        providerMeta: item?.providerMeta && typeof item.providerMeta === 'object' ? item.providerMeta : null,
        includeInContext: false,
      }, turns.length));
    }
    return turns;
  }

  function cloneJson(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return null;
    }
  }

  function normalizeCanonicalTurn(item, idx) {
    return {
      role: (() => {
        const rawRole = String(item?.role || 'assistant');
        return rawRole === 'agent' ? 'assistant' : rawRole;
      })(),
      text: String(item?.text || ''),
      index: idx,
      includeInContext: Object.prototype.hasOwnProperty.call(item || {}, 'includeInContext') ? Boolean(item.includeInContext) : String(item?.role || '') !== 'thinking',
      imageUrl: typeof item?.imageUrl === 'string' ? item.imageUrl : '',
      imagePath: typeof item?.imagePath === 'string' ? item.imagePath : '',
      images: Array.isArray(item?.images) ? item.images.map((img) => ({
        id: String(img?.id || ''),
        name: String(img?.name || ''),
        mimeType: String(img?.mimeType || img?.type || ''),
        size: Number(img?.size || 0),
        dataUrl: String(img?.dataUrl || ''),
      })).filter((img) => img.dataUrl) : [],
      reasoningText: typeof item?.reasoningText === 'string' ? item.reasoningText : '',
      providerId: typeof item?.providerId === 'string' ? item.providerId : '',
      providerModel: typeof item?.providerModel === 'string' ? item.providerModel : '',
      recoveryInjected: Boolean(item?.recoveryInjected),
      messageKind: typeof item?.messageKind === 'string' ? item.messageKind : '',
      providerMeta: item?.providerMeta && typeof item.providerMeta === 'object' ? cloneJson(item.providerMeta) : null,
      call_id: typeof item?.call_id === 'string' ? item.call_id : '',
      name: typeof item?.name === 'string' ? item.name : '',
      arguments: typeof item?.arguments === 'string' ? item.arguments : '',
      output: typeof item?.output === 'string' ? item.output : '',
    };
  }

  function buildCanonicalTurns(agentId) {
    const turns = Array.isArray(state.canonicalByAgent[agentId]?.turns)
      ? state.canonicalByAgent[agentId].turns
      : [];
    return turns.map((item, idx) => normalizeCanonicalTurn(item, idx));
  }

  function restoreAgentSession(agentId, payload = {}) {
    if (!state.messagesByAgent[agentId] || !state.canonicalByAgent[agentId]) return false;

    const hasCanonical = Array.isArray(payload?.canonical?.turns);

    let canonicalTurns;
    let uiTimeline;
    if (hasCanonical) {
      canonicalTurns = payload.canonical.turns.map((item, idx) => normalizeCanonicalTurn(item, idx));
      uiTimeline = Array.isArray(payload?.ui?.timeline) ? payload.ui.timeline : canonicalTurns.filter((item) => item.role !== 'tool_output');
    } else {
      const timeline = Array.isArray(payload?.timeline) ? payload.timeline : [];
      const tools = Array.isArray(payload?.tools) ? payload.tools : [];
      canonicalTurns = canonicalTurnsFromLegacyPayload(timeline, tools);
      uiTimeline = timeline;
    }

    state.canonicalByAgent[agentId] = { turns: canonicalTurns };
    state.messagesByAgent[agentId] = uiTimeline.map((item, idx) => normalizeCanonicalTurn(item, idx));
    state.todosByAgent[agentId] = normalizeTodoItems(payload?.todos);
    state.statusByAgent[agentId] = 'Idle';
    return true;
  }

  return {
    state,
    getAgentDisplayName,
    getContextLimitByModel,
    setAgentStatus,
    setAgentContextUsage,
    pushAgentMessage,
    appendCanonicalTurns,
    appendCanonicalAssistantText,
    patchLastCanonicalTurn,
    buildCanonicalTurns,
    restoreAgentSession,
    resetAgents,
    getAgentTodos,
    setAgentTodos,
    resetAgentCanonical,
    accumulateAgentTokenUsage,
    getAgentTokenUsage,
  };
}
