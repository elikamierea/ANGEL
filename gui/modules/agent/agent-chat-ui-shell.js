// Maps an image mimeType to the file extension used when persisting generated
// images. Anything unlisted falls back to 'png' at the call site.
const IMAGE_MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function createAgentChatUIShell(deps) {
  const {
    agentChatStateManager,
    agentChatState,
    dom,
    requestDefaultModelCompletion,
    loadAgentModelSettings,
    setStatus,
    getContextLimitByModel,
    autoCompactThreshold = 0.8,
    agentContextCompactionManager,
    rebuildCanonicalAfterCompact,
    loadPromptTextByPath,
    SAVE_MEMORY_PROMPT_PATH,
    SAVE_RECENT_MEMORY_PROMPT_PATH,
    AGENT_DEFAULT_CONTEXT_MAX_TOKENS,
    getCliUsageContext = () => ({ active: false }),
    fetchCliUsageWindows = async () => ({ ok: false }),
    isCliBackendActive = () => false,
    t,
    renderMarkdown,
  } = deps;

  const {
    agentChatWindow,
    agentChatTitlebar,
    agentChatToggle,
    agentChatResize,
    agentChatBody,
    agentChatInput,
    agentChatSend,
    agentChatSaveMemory,
    agentChatCompressMemory,
    agentChatStatus,
    agentChatSidebar,
    agentChatSidebarResize,
    agentChatTimeline,
    agentChatTodos,
    agentChatPanelResize,
    agentTokenStats,
    agentChatComposerResize,
    agentChatComposer,
    agentChatImagePreview,
    agentChatImageLightbox,
    agentChatImageLightboxImg,
    agentRunUntilDone,
    electronAPI,
  } = dom;

  const inFlightRequestByAgent = new Map();
  const unreadAgentIds = new Set();
  const frozenElapsedByAgent = new Map();
  const justFinishedTimers = new Map();
  let spinnerFrame = 0;
  let statusTickerHandle = null;
  const TOOL_PROGRESS_COLLAPSE_MAX_CHARS = 100;
  const TOOL_PROGRESS_COLLAPSE_MAX_LINES = 1;
  const TOOL_PROGRESS_COLLAPSED_WIDTH_PX = 280;

  const toolPreviewModal = document.createElement('div');
  toolPreviewModal.className = 'modal hidden';
  toolPreviewModal.setAttribute('aria-hidden', 'true');
  toolPreviewModal.innerHTML = `
    <div class="modal-backdrop" data-close-tool-preview="1"></div>
    <div class="modal-panel">
      <div class="modal-head">
        <h3>Tool Progress</h3>
        <button type="button" data-close-tool-preview="1">X</button>
      </div>
      <div class="modal-body">
        <pre class="execute-fail-detail tool-preview-detail"></pre>
      </div>
    </div>
  `;
  document.body.appendChild(toolPreviewModal);
  const toolPreviewDetail = toolPreviewModal.querySelector('.tool-preview-detail');

  function isAgentRequestInFlight(agentId) {
    return Boolean(agentId && inFlightRequestByAgent.get(agentId));
  }

  function openToolPreviewModal(text) {
    if (toolPreviewDetail) toolPreviewDetail.textContent = String(text || '');
    toolPreviewModal.classList.remove('hidden');
    toolPreviewModal.setAttribute('aria-hidden', 'false');
  }

  function closeToolPreviewModal() {
    toolPreviewModal.classList.add('hidden');
    toolPreviewModal.setAttribute('aria-hidden', 'true');
  }

  function syncAgentSendButton() {
    if (!agentChatSend) return;
    const agentId = agentChatState.activeAgentId;
    const isRunning = isAgentRequestInFlight(agentId);
    agentChatSend.textContent = isRunning ? t('agentChat.action.stop') : t('agentChat.action.send');
    agentChatSend.title = isRunning ? t('agentChat.action.stopTitle') : '';
  }

  function syncRunUntilDoneButton() {
    if (!agentRunUntilDone) return;
    // The "run until done" loop is an HTTP-harness feature (ANGEL drives the loop).
    // CLI agents own their own loop/agency, so hide it entirely on the CLI line.
    let cliActive = false;
    try { cliActive = Boolean(isCliBackendActive()); } catch (_) {}
    agentRunUntilDone.hidden = cliActive;
    if (cliActive) return;
    const agentId = agentChatState.activeAgentId;
    const todos = typeof agentChatStateManager.getAgentTodos === 'function'
      ? agentChatStateManager.getAgentTodos(agentId) : [];
    // Disable while a request is running, or when there are no todos to run toward
    // (an empty list gives the loop nothing to do).
    const hasTodos = Array.isArray(todos) && todos.length > 0;
    agentRunUntilDone.disabled = isAgentRequestInFlight(agentId) || !hasTodos;
  }

  function beginAgentRequest(agentId) {
    if (!agentId) return null;
    const existing = inFlightRequestByAgent.get(agentId);
    if (existing?.controller) return existing.controller;
    if (justFinishedTimers.has(agentId)) {
      clearTimeout(justFinishedTimers.get(agentId));
      justFinishedTimers.delete(agentId);
    }
    frozenElapsedByAgent.delete(agentId);
    const controller = new AbortController();
    inFlightRequestByAgent.set(agentId, { controller, startedAt: Date.now() });
    syncAgentSendButton();
    syncRunUntilDoneButton();
    ensureStatusTicker();
    return controller;
  }

  function endAgentRequest(agentId, controller = null) {
    if (!agentId) return;
    const active = inFlightRequestByAgent.get(agentId);
    if (!active) return;
    if (controller && active.controller !== controller) return;
    if (active.startedAt) frozenElapsedByAgent.set(agentId, Date.now() - active.startedAt);
    inFlightRequestByAgent.delete(agentId);
    if (agentId === agentChatState.activeAgentId) {
      const handle = setTimeout(() => {
        frozenElapsedByAgent.delete(agentId);
        justFinishedTimers.delete(agentId);
        renderAgentSidebar();
      }, 5000);
      justFinishedTimers.set(agentId, handle);
    }
    syncAgentSendButton();
    syncRunUntilDoneButton();
    ensureStatusTicker();
    renderAgentSidebar();
  }

  function cancelAgentRequest(agentId) {
    const meta = agentId ? inFlightRequestByAgent.get(agentId) : null;
    if (!meta?.controller) return false;
    meta.controller.abort(new DOMException('Request aborted by user', 'AbortError'));
    return true;
  }

  function getAgentDisplayName(agentId) {
    return agentChatStateManager.getAgentDisplayName(agentId);
  }

  function resolveVisibleAgentStatus(statusText, fallbackText) {
    const raw = String(statusText || '').trim();
    if (raw.startsWith('[tool] ')) return String(fallbackText || 'Thinking...');
    return raw || String(fallbackText || 'Thinking...');
  }

  function formatElapsedMs(elapsedMs) {
    const totalSeconds = Math.max(0, Math.floor(Number(elapsedMs || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0
      ? `${minutes}:${String(seconds).padStart(2, '0')}`
      : `0:${String(seconds).padStart(2, '0')}`;
  }

  function ensureStatusTicker() {
    const hasRunning = Array.from(inFlightRequestByAgent.values()).some(Boolean);
    if (hasRunning) {
      if (statusTickerHandle == null) {
        statusTickerHandle = window.setInterval(() => {
          spinnerFrame++;
          renderAgentStatusBar();
          renderAgentSidebar();
        }, 250);
      }
      return;
    }
    if (statusTickerHandle != null) {
      window.clearInterval(statusTickerHandle);
      statusTickerHandle = null;
    }
  }

  function renderAgentStatusBar() {
    if (agentChatStatus) agentChatStatus.textContent = t('agentChat.window.ariaLabel');
  }

  const SPINNER_CHARS = ['-', '\\', '|', '/'];

  function renderAgentSidebar() {
    if (!agentChatSidebar) return;
    agentChatSidebar.innerHTML = '';

    for (const agent of agentChatState.agents) {
      const isActive = agentChatState.activeAgentId === agent.id;
      const isRunning = isAgentRequestInFlight(agent.id);
      const isUnread = !isActive && unreadAgentIds.has(agent.id);

      let statusChar = '';
      if (isRunning) {
        const startedAt = inFlightRequestByAgent.get(agent.id)?.startedAt;
        const elapsed = startedAt ? formatElapsedMs(Date.now() - startedAt) : '';
        statusChar = ' ' + SPINNER_CHARS[spinnerFrame % 4] + (elapsed ? ' (' + elapsed + ')' : '');
      } else if (isUnread || (isActive && frozenElapsedByAgent.has(agent.id))) {
        const elapsed = frozenElapsedByAgent.has(agent.id) ? formatElapsedMs(frozenElapsedByAgent.get(agent.id)) : '';
        statusChar = ' *' + (elapsed ? ' (' + elapsed + ')' : '');
      }

      const messages = agentChatState.messagesByAgent[agent.id] || [];
      const lastMsg = [...messages].reverse().find((m) => m.role === 'agent' || m.role === 'assistant');
      const preview = lastMsg ? String(lastMsg.text || '').replace(/\s+/g, ' ').trim() : t('agentChat.sidebar.noHistory');

      const entry = document.createElement('div');
      entry.className = `agent-entry${isActive ? ' active' : ''}`;
      entry.addEventListener('click', () => {
        agentChatState.activeAgentId = agent.id;
        unreadAgentIds.delete(agent.id);
        frozenElapsedByAgent.delete(agent.id);
        if (justFinishedTimers.has(agent.id)) {
          clearTimeout(justFinishedTimers.get(agent.id));
          justFinishedTimers.delete(agent.id);
        }
        renderAgentSidebar();
        renderAgentTimeline();
        renderAgentStatusBar();
        renderAgentTodoPanel();
        renderAgentTokenStats();
        renderAgentCtxBar();
        syncAgentSendButton();
        syncRunUntilDoneButton();
      });

      const nameRow = document.createElement('div');
      nameRow.className = 'agent-entry-namerow';
      nameRow.textContent = agent.name + statusChar;

      const previewRow = document.createElement('div');
      previewRow.className = `agent-entry-preview${!lastMsg ? ' agent-entry-preview--empty' : ''}`;
      previewRow.textContent = preview;

      entry.appendChild(nameRow);
      entry.appendChild(previewRow);
      agentChatSidebar.appendChild(entry);
    }
  }

  const agentCtxDisplay = document.getElementById('agent-ctx-display');

  function renderAgentCtxBar() {
    if (!agentCtxDisplay) return;
    const agentId = agentChatState.activeAgentId;
    const usage = agentChatState.contextUsageByAgent[agentId] || { used: 0, max: AGENT_DEFAULT_CONTEXT_MAX_TOKENS };
    // CLI line: the CLI owns the context + its native compaction, so ANGEL knows
    // neither the true size nor the limit. Show ONLY an estimated current context
    // length (from the last turn's usage) — no limit, no percentage.
    let cliActive = false;
    try { cliActive = Boolean(isCliBackendActive()); } catch (_) {}
    if (cliActive) {
      const shown = usage.used > 0 ? `~${fmtTokens(usage.used)}` : '—';
      agentCtxDisplay.textContent = t('agentChat.ctxBarEstimate', { used: shown });
      return;
    }
    // Display the auto-compact line (model limit × threshold) as the effective
    // ceiling, since reaching it triggers compaction. The stored `usage.max`
    // remains the raw model limit so the compaction trigger logic is unchanged.
    const ratio = Number(autoCompactThreshold) > 0 ? Number(autoCompactThreshold) : 1;
    const limit = Math.max(1, Math.floor(usage.max * ratio));
    const pct = Math.round(usage.used / limit * 100);
    agentCtxDisplay.textContent = t('agentChat.ctxBar', { used: usage.used, max: limit, pct });
  }

  function syncContextLimitFromModel() {
    let model = '';
    try {
      model = loadAgentModelSettings()?.defaultModel || '';
    } catch (_) {}
    const max = getContextLimitByModel(model);
    for (const agent of agentChatState.agents || []) {
      const agentId = agent.id;
      const usage = agentChatState.contextUsageByAgent[agentId] || { used: 0, max };
      usage.max = max;
      agentChatState.contextUsageByAgent[agentId] = usage;
    }
    renderAgentCtxBar();
  }

  function renderAgentTodoPanel() {
    if (!agentChatTodos) return;
    const agentId = agentChatState.activeAgentId;
    const todos = typeof agentChatStateManager.getAgentTodos === 'function'
      ? agentChatStateManager.getAgentTodos(agentId)
      : [];
    agentChatTodos.innerHTML = '';
    agentChatTodos.classList.remove('hidden');
    syncRunUntilDoneButton();
    if (!Array.isArray(todos) || todos.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agent-chat-todos-empty';
      empty.textContent = t('agentChat.todos.empty');
      agentChatTodos.appendChild(empty);
      return;
    }
    for (const item of todos) {
      const row = document.createElement('div');
      row.className = `agent-chat-todo-item agent-chat-todo-${item.status}`;
      const marker = document.createElement('span');
      marker.className = 'agent-chat-todo-marker';
      marker.textContent = item.status === 'completed' ? '✓' : (item.status === 'in_progress' ? '…' : (item.status === 'blocked' ? '✗' : '○'));
      const text = document.createElement('span');
      text.className = 'agent-chat-todo-text';
      text.textContent = item.content;
      row.appendChild(marker);
      row.appendChild(text);
      agentChatTodos.appendChild(row);
    }
  }

  function isToolProgressThinkingMessage(item) {
    return item?.role === 'thinking' && String(item?.text || '').startsWith('[tool] ');
  }

  function shouldCollapseToolProgressBubble(item, renderedText) {
    const raw = String(renderedText || '');
    if (!isToolProgressThinkingMessage(item)) return false;
    if (raw.length > TOOL_PROGRESS_COLLAPSE_MAX_CHARS) return true;
    const lineCount = raw.split(/\r?\n/).length;
    return lineCount > TOOL_PROGRESS_COLLAPSE_MAX_LINES;
  }

  function renderToolProgressBubble(item, bubble, renderedText) {
    bubble.classList.add('tool-progress-bubble');

    const textEl = document.createElement('div');
    textEl.className = 'chat-bubble-text';
    textEl.textContent = renderedText;
    bubble.appendChild(textEl);

    const shouldCollapse = shouldCollapseToolProgressBubble(item, renderedText);
    bubble.classList.toggle('collapsed', shouldCollapse);
    bubble.style.width = shouldCollapse ? `${TOOL_PROGRESS_COLLAPSED_WIDTH_PX}px` : '';
    bubble.style.maxWidth = shouldCollapse ? `${TOOL_PROGRESS_COLLAPSED_WIDTH_PX}px` : '';
    bubble.title = shouldCollapse ? '点击查看全文' : '';
    bubble.addEventListener('click', () => {
      openToolPreviewModal(renderedText);
    });
  }

  function renderAgentTimeline(options = {}) {
    if (!agentChatTimeline) return;
    const forceScrollBottom = Boolean(options.forceScrollBottom);
    const nearBottomBeforeRender =
      agentChatTimeline.scrollHeight - (agentChatTimeline.scrollTop + agentChatTimeline.clientHeight) < 24;

    const list = agentChatState.messagesByAgent[agentChatState.activeAgentId] ?? [];
    agentChatTimeline.innerHTML = '';
    if (list.length === 0) {
      return;
    }
    for (const item of list) {
      const bubbleRole = item.role === 'user'
        ? 'user'
        : (item.role === 'system' || item.role === 'developer' || item.role === 'thinking' ? 'system' : 'agent');
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${bubbleRole}`;
      const renderedText = item.role === 'thinking' ? `[${t('agentChat.message.thinkingLabel')}] ${item.text}` : item.text;
      if (isToolProgressThinkingMessage(item)) {
        renderToolProgressBubble(item, bubble, renderedText);
      } else if (bubbleRole === 'agent' && typeof renderMarkdown === 'function') {
        bubble.innerHTML = renderMarkdown(renderedText);
      } else {
        bubble.textContent = renderedText;
      }
      const inlineImages = Array.isArray(item.images) ? item.images : [];
      for (const inline of inlineImages) {
        const img = document.createElement('img');
        img.src = inline.dataUrl;
        img.alt = inline.name || t('agentChat.imagePreview.uploadedImageAlt');
        img.style.display = 'block';
        img.style.marginTop = bubble.childElementCount > 0 ? '8px' : '0';
        img.style.width = '256px';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.borderRadius = '8px';
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => {
          if (!agentChatImageLightbox || !agentChatImageLightboxImg) return;
          agentChatImageLightboxImg.src = inline.dataUrl;
          agentChatImageLightbox.classList.remove('hidden');
          agentChatImageLightbox.setAttribute('aria-hidden', 'false');
        });
        bubble.appendChild(img);
      }

      if (item.imageUrl) {
        const img = document.createElement('img');
        img.src = item.imageUrl;
        img.alt = item.imagePath || t('agentChat.imagePreview.generatedImageAlt');
        img.style.display = 'block';
        img.style.marginTop = item.text ? '8px' : '0';
        img.style.width = '512px';
        img.style.maxWidth = 'none';
        img.style.height = 'auto';
        img.style.borderRadius = '8px';
        img.style.cursor = 'zoom-in';
        img.addEventListener('dblclick', async () => {
          try {
            const rootPath = (typeof deps?.projectRootPathGetter === 'function') ? deps.projectRootPathGetter() : '';
            if (!rootPath || !item.imagePath || !electronAPI?.openFileExternally) return;
            const relative = String(item.imagePath).replace(/\//g, '\\');
            const fullPath = `${String(rootPath).replace(/[\\/]+$/, '')}\\${relative}`;
            await electronAPI.openFileExternally(fullPath);
          } catch (_) {}
        });
        bubble.appendChild(img);
      }
      agentChatTimeline.appendChild(bubble);
    }

    if (forceScrollBottom || nearBottomBeforeRender) {
      agentChatTimeline.scrollTop = agentChatTimeline.scrollHeight;
    }
  }

  function pushAgentMessage(agentId, role, text, options = {}) {
    agentChatStateManager.pushAgentMessage(agentId, role, text, options);
    if (agentId === agentChatState.activeAgentId) {
      renderAgentTimeline();
    } else if (role === 'agent' || role === 'assistant') {
      unreadAgentIds.add(agentId);
    }
  }

  const MULTI_MESSAGE_DELIMITER = '<|m|>';

  function normalizeMessageChunk(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n');
    return normalized
      .replace(/^\s*\n+/, '')
      .replace(/\n+\s*$/, '')
      .trim();
  }

  function pushDelimitedAgentMessages(agentId, text, options = {}) {
    const raw = normalizeMessageChunk(text);
    if (!raw) return;

    const parts = raw.includes(MULTI_MESSAGE_DELIMITER)
      ? raw.split(MULTI_MESSAGE_DELIMITER)
      : [raw];

    for (const part of parts) {
      const chunk = normalizeMessageChunk(part);
      if (!chunk) continue;
      pushAgentMessage(agentId, 'agent', chunk, options);
    }
  }

  function formatSystemEventText(text) {
    const body = String(text || '').trim();
    return `<SYSTEM EVENT>:\n${body}`;
  }

  function appendCanonicalTurns(agentId, turns) {
    if (typeof agentChatStateManager.appendCanonicalTurns === 'function') {
      agentChatStateManager.appendCanonicalTurns(agentId, turns);
    }
  }

  function appendCanonicalAssistantText(agentId, text, options = {}) {
    if (typeof agentChatStateManager.appendCanonicalAssistantText === 'function') {
      return agentChatStateManager.appendCanonicalAssistantText(agentId, text, options);
    }
    return false;
  }

  function recordTextEvent(agentId, {
    canonicalRole = '',
    uiRole = '',
    text = '',
    uiOptions = {},
    canonicalOptions = {},
    hiddenInUi = false,
    appendToAssistant = false,
  } = {}) {
    // Canonical write entry for non-streaming text events.
    // Use this layer (or the more specific helpers below) instead of pushAgentMessage
    // whenever a text event should become part of the persisted canonical transcript.
    const body = String(text || '');
    if (!hiddenInUi && uiRole) {
      pushAgentMessage(agentId, uiRole, body, { ...uiOptions, skipCanonical: true });
    }
    if (!canonicalRole) return;
    if (appendToAssistant && canonicalRole === 'assistant') {
      appendCanonicalAssistantText(agentId, body, canonicalOptions);
      return;
    }
    appendCanonicalTurns(agentId, [{ role: canonicalRole, text: body, ...canonicalOptions }]);
  }

  function recordUserText(agentId, text, options = {}) {
    recordTextEvent(agentId, {
      canonicalRole: 'user',
      uiRole: 'user',
      text,
      uiOptions: options,
      canonicalOptions: options,
    });
  }

  function recordDeveloperText(agentId, text, options = {}) {
    recordTextEvent(agentId, {
      canonicalRole: 'developer',
      uiRole: 'developer',
      text,
      uiOptions: options,
      canonicalOptions: options,
    });
  }

  function recordAssistantTextChunk(agentId, text, options = {}) {
    // Display-only chunk (e.g. provider reasoning surfaced as output): render it as
    // a normal agent bubble, but keep it out of the canonical transcript and out of
    // model context. The reasoning is already replayed to the model as
    // reasoning_content on its own turn, so re-adding it here would duplicate it.
    if (options && options.displayOnly) {
      pushDelimitedAgentMessages(agentId, text, { ...options, skipCanonical: true, includeInContext: false });
      return;
    }
    // Canonical-first assistant text path: append raw model text to canonical before
    // any UI bubble splitting/delimiter rendering happens.
    appendCanonicalAssistantText(agentId, text, options);
    pushDelimitedAgentMessages(agentId, text, { ...options, skipCanonical: true });
  }

  function recordImageEvent(agentId, uiRole, options = {}) {
    const imageOptions = {
      imageUrl: typeof options?.imageUrl === 'string' ? options.imageUrl : '',
      imagePath: typeof options?.imagePath === 'string' ? options.imagePath : '',
      images: Array.isArray(options?.images) ? options.images : [],
      includeInContext: Object.prototype.hasOwnProperty.call(options, 'includeInContext') ? options.includeInContext : true,
    };
    pushAgentMessage(agentId, uiRole, '', { ...imageOptions, skipCanonical: true });
    const canonicalRole = uiRole === 'user' ? 'user' : (uiRole === 'developer' ? 'developer' : 'assistant');
    appendCanonicalTurns(agentId, [{ role: canonicalRole, text: '', ...imageOptions }]);
  }

  // Records a model-generated image (saved by persistGeneratedImages) into both
  // the UI timeline and the model context. The image turn itself carries imagePath
  // for the UI only — every provider adapter drops imagePath when replaying turns
  // to the model — so we additionally inject the on-disk location as a system-event
  // note. Without this, the agent has no way to reference an image it just
  // generated (e.g. to feed its path into crop_image / create_sprite). The note is
  // an English literal to match the existing system-event convention and stay
  // model-stable regardless of UI locale.
  function recordGeneratedImage(agentId, saved) {
    const relPath = String(saved?.relPath || '').trim();
    recordImageEvent(agentId, 'agent', { imageUrl: saved?.imageUrl || '', imagePath: relPath });
    if (relPath) {
      recordDeveloperText(agentId, formatSystemEventText(`A generated image was saved to the project at: ${relPath}\nUse this path when you need to reference the image (for example as an input to crop_image or create_sprite).`));
    }
  }

  function patchLastCanonicalTurn(agentId, patch, predicate = null) {
    if (typeof agentChatStateManager.patchLastCanonicalTurn === 'function') {
      return agentChatStateManager.patchLastCanonicalTurn(agentId, patch, predicate);
    }
    return false;
  }

  function buildHistorySnapshot(agentId) {
    const timeline = Array.isArray(agentChatState.messagesByAgent[agentId]) ? agentChatState.messagesByAgent[agentId] : [];
    const canonicalTurns = typeof agentChatStateManager.buildCanonicalTurns === 'function'
      ? agentChatStateManager.buildCanonicalTurns(agentId)
      : [];
    const todos = typeof agentChatStateManager.getAgentTodos === 'function'
      ? agentChatStateManager.getAgentTodos(agentId)
      : [];
    return {
      format: 'angel.agent-chat.history',
      version: 2,
      exportedAt: new Date().toISOString(),
      agentId,
      canonical: {
        turns: canonicalTurns,
      },
      ui: {
        timeline,
      },
      todos,
    };
  }

  async function persistHistorySnapshot(agentId) {
    const folderName = String(agentId || 'agent');
    const stamp = Date.now();
    const content = JSON.stringify(buildHistorySnapshot(agentId), null, 2);
    const relPath = `agents/${folderName}/history/${stamp}.json`;
    const latestPath = `agents/${folderName}/history/latest.json`;
    const rootPath = typeof deps?.projectRootPathGetter === 'function' ? deps.projectRootPathGetter() : '';
    if (electronAPI?.toolWrite && rootPath) {
      await electronAPI.toolWrite({ rootPath, path: relPath, content });
      await electronAPI.toolWrite({ rootPath, path: latestPath, content });
    }
    return { relPath, latestPath };
  }

  async function persistSessionSnapshot(agentId) {
    const folderName = String(agentId || 'agent');
    const content = JSON.stringify(buildHistorySnapshot(agentId), null, 2);
    const sessionPath = `agents/${folderName}/history/session.json`;
    const rootPath = typeof deps?.projectRootPathGetter === 'function' ? deps.projectRootPathGetter() : '';
    if (electronAPI?.toolWrite && rootPath) {
      await electronAPI.toolWrite({ rootPath, path: sessionPath, content });
    }
    return { sessionPath };
  }

  async function persistAllAgentSessionSnapshots() {
    const agents = Array.isArray(agentChatState?.agents) ? agentChatState.agents : [];
    const saved = [];
    for (const agent of agents) {
      const agentId = String(agent?.id || '').trim();
      if (!agentId) continue;
      saved.push(await persistSessionSnapshot(agentId));
    }
    return saved;
  }

  async function persistGeneratedImages(reply) {
    const images = Array.isArray(reply?.images) ? reply.images : [];
    if (!images.length) return [];
    const saved = [];
    const canPersist = electronAPI?.toolWriteBinary && typeof deps?.projectRootPathGetter === 'function' && deps.projectRootPathGetter();
    for (let i = 0; i < images.length; i += 1) {
      const img = images[i] || {};
      const base64 = String(img.base64 || '').trim();
      if (!base64) continue;
      // Keep the on-disk extension and blob type aligned with the image's actual
      // mimeType. OpenAI always returns PNG, but Gemini's inlineData can carry
      // jpeg/webp; defaulting to PNG keeps prior behavior when mimeType is absent.
      const mimeType = String(img.mimeType || '').trim().toLowerCase() || 'image/png';
      const ext = IMAGE_MIME_EXTENSIONS[mimeType] || 'png';
      const fileName = `img_${Date.now()}_${i + 1}.${ext}`;
      const relPath = `assets/generated/images/${fileName}`;
      let imageUrl = '';
      try {
        if (canPersist) {
          const rootPath = deps.projectRootPathGetter();
          await electronAPI.toolWriteBinary({ rootPath, path: relPath, base64 });
          if (electronAPI?.readBinaryAsDataUrl) {
            const loaded = await electronAPI.readBinaryAsDataUrl({ rootPath, path: relPath });
            if (loaded?.ok && typeof loaded.dataUrl === 'string') imageUrl = loaded.dataUrl;
          }
        }
      } catch (_) {}
      if (!imageUrl) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j += 1) bytes[j] = binary.charCodeAt(j);
        imageUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      }
      saved.push({ relPath, imageUrl });
    }
    return saved;
  }

  function setAgentStatus(agentId, statusText) {
    agentChatStateManager.setAgentStatus(agentId, statusText);
    renderAgentStatusBar();
  }

  function setAgentContextUsage(agentId, usedTokens, maxTokens) {
    agentChatStateManager.setAgentContextUsage(agentId, usedTokens, maxTokens);
    renderAgentStatusBar();
    renderAgentCtxBar();
  }

  function fmtTokens(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n));
  }

  // Subscription-usage gauge cache (CLI line only). Fetched lazily from main and
  // throttled so frequent re-renders (token deltas) don't hammer the endpoint.
  let cliUsageWindows = null;        // last result { ok, source, fiveHour, weekly } | null
  let cliUsageSourceKey = '';        // driver|baseUrlOverride the cache belongs to
  let cliUsageFetchedAt = 0;
  let cliUsageFetching = false;
  const CLI_USAGE_TTL_MS = 60000;

  function maybeRefreshCliUsage(ctx) {
    const key = `${ctx.driver}|${ctx.hasBaseUrlOverride ? 1 : 0}`;
    const stale = Date.now() - cliUsageFetchedAt > CLI_USAGE_TTL_MS;
    if (cliUsageFetching) return;
    if (key === cliUsageSourceKey && cliUsageWindows && !stale) return;
    if (key !== cliUsageSourceKey) cliUsageWindows = null; // source changed → drop stale value
    cliUsageFetching = true;
    Promise.resolve(fetchCliUsageWindows())
      .then((res) => { cliUsageWindows = res || { ok: false }; })
      .catch(() => { cliUsageWindows = { ok: false }; })
      .finally(() => {
        cliUsageSourceKey = key;
        cliUsageFetchedAt = Date.now();
        cliUsageFetching = false;
        renderAgentTokenStats(); // re-render with the fetched value (now non-stale → no loop)
      });
  }

  function fmtUsageReset(ms) {
    const n = Number(ms) || 0;
    if (n <= 0) return '';
    const d = new Date(n);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
  }

  // One subscription window rendered as a spacious two-line block:
  //   <label>           used X%
  //                     HH:MM reset
  function usageWindowBlock(label, w) {
    if (!w || typeof w.percent !== 'number') {
      return `<div class="usage-window"><div class="usage-window-head"><span class="usage-window-label">${label}</span><span class="usage-window-percent">—</span></div></div>`;
    }
    const warn = w.percent >= 80 ? ' token-stat-warn' : '';
    const used = t('agentChat.usage.used', { percent: w.percent });
    const reset = fmtUsageReset(w.resetAt);
    const resetLine = reset
      ? `<div class="usage-window-reset">${t('agentChat.usage.reset', { time: reset })}</div>`
      : '';
    return `<div class="usage-window">`
      + `<div class="usage-window-head"><span class="usage-window-label">${label}</span>`
      + `<span class="usage-window-percent${warn}">${used}</span></div>`
      + resetLine
      + `</div>`;
  }

  function usageNotice(text) {
    return `<div class="usage-window"><div class="usage-window-head">`
      + `<span class="usage-window-label">${t('agentChat.usage.label')}</span>`
      + `<span class="usage-window-percent">${text}</span></div></div>`;
  }

  function renderCliUsageWindows(ctx) {
    const u = cliUsageWindows;
    if (!u) {
      agentTokenStats.innerHTML = usageNotice('…');
    } else if (u.ok !== true) {
      agentTokenStats.innerHTML = usageNotice(t('agentChat.usage.unavailable'));
    } else {
      // Only render windows the plan actually has (Codex plans dropped the 5h
      // window mid-2026 → weekly only; Claude subscriptions still expose both).
      const blocks = [];
      if (u.fiveHour) blocks.push(usageWindowBlock(t('agentChat.usage.fiveHour'), u.fiveHour));
      if (u.weekly) blocks.push(usageWindowBlock(t('agentChat.usage.weekly'), u.weekly));
      agentTokenStats.innerHTML = blocks.length > 0
        ? blocks.join('')
        : usageNotice(t('agentChat.usage.unavailable'));
    }
    maybeRefreshCliUsage(ctx);
  }

  function renderAgentTokenStats() {
    if (!agentTokenStats) return;
    // On a usage-window-capable CLI line (Claude OAuth subscription / Codex), raw
    // token counts aren't meaningful → show the 5h/weekly windows. Domestic CLI
    // presets and the HTTP line keep the raw token rows.
    let ctx = { supported: false };
    try { ctx = getCliUsageContext() || ctx; } catch (_) {}
    if (ctx.supported) { renderCliUsageWindows(ctx); return; }

    const agentId = agentChatState.activeAgentId;
    const u = typeof agentChatStateManager.getAgentTokenUsage === 'function'
      ? agentChatStateManager.getAgentTokenUsage(agentId)
      : { cachedInput: 0, input: 0, output: 0 };
    agentTokenStats.innerHTML = `
      <div class="token-stat-row">
        <span class="token-stat-label">Cached input</span>
        <span class="token-stat-value">${fmtTokens(u.cachedInput)}</span>
      </div>
      <div class="token-stat-row">
        <span class="token-stat-label">Input</span>
        <span class="token-stat-value">${fmtTokens(u.input)}</span>
      </div>
      <div class="token-stat-row">
        <span class="token-stat-label">Output</span>
        <span class="token-stat-value">${fmtTokens(u.output)}</span>
      </div>
    `;
  }

  async function runSaveMemoryForAgent(agentId) {
    const targetAgentId = String(agentId || '').trim();
    if (!targetAgentId) return { ok: false, skipped: 'missing-agent' };

    let saveRecentMemoryPrompt = 'Save recent memory now.';
    let saveMemoryPrompt = 'Perform memory organization now. Follow your existing prompt instructions for memory consolidation and write the updates to the memory files.';
    try {
      const loadedRecentPrompt = await loadPromptTextByPath(SAVE_RECENT_MEMORY_PROMPT_PATH);
      if (String(loadedRecentPrompt || '').trim()) saveRecentMemoryPrompt = String(loadedRecentPrompt).trim();
    } catch (_) {}
    try {
      const loadedPrompt = await loadPromptTextByPath(SAVE_MEMORY_PROMPT_PATH);
      if (String(loadedPrompt || '').trim()) saveMemoryPrompt = String(loadedPrompt).trim();
    } catch (_) {}

    await persistHistorySnapshot(targetAgentId);

    const currentModel = loadAgentModelSettings().defaultModel || 'gpt-4o';
    setAgentContextUsage(targetAgentId, 0, getContextLimitByModel(currentModel));
    setAgentStatus(targetAgentId, 'Organizing memory...');

    const runMemoryPass = async (instructionText) => {
      // CLI line: the agent's task comes from `prompt` (the resumed session has the
      // conversation context), so send the save instruction there. HTTP line keeps
      // its developer-turn + empty-prompt shape (no regression).
      const cliActive = Boolean((typeof loadAgentModelSettings === 'function' ? loadAgentModelSettings() : null)?.activeCliProfileId);
      if (!cliActive) {
        recordDeveloperText(targetAgentId, formatSystemEventText(instructionText));
      }
      const reply = await requestDefaultModelCompletion({
        prompt: cliActive ? instructionText : '',
        agentId: targetAgentId,
        suppressAggregatedFinalText: true,
        onProgress: (statusText, usageInfo) => {
          const thinkingText = String(statusText || 'Organizing memory...');
          if (String(statusText || '').trim()) {
            setAgentStatus(targetAgentId, resolveVisibleAgentStatus(thinkingText, 'Organizing memory...'));
            pushAgentMessage(targetAgentId, 'thinking', thinkingText, { includeInContext: false });
          }
          if (usageInfo) setAgentContextUsage(targetAgentId, usageInfo.used, usageInfo.max);
        },
        onModelText: (modelText, modelMeta = null) => {
          const messageOptions = modelMeta && typeof modelMeta === 'object' ? modelMeta : {};
          recordAssistantTextChunk(targetAgentId, modelText, messageOptions);
        },
        onToolCall: (turn) => {
          appendCanonicalTurns(targetAgentId, [turn]);
        },
        onToolOutput: (turn) => {
          appendCanonicalTurns(targetAgentId, [turn]);
        },
        onImagesAttached: (turns) => {
          appendCanonicalTurns(targetAgentId, turns);
        },
        onUsageDelta: (delta) => {
          if (typeof agentChatStateManager.accumulateAgentTokenUsage === 'function') {
            agentChatStateManager.accumulateAgentTokenUsage(targetAgentId, delta);
          }
          renderAgentTokenStats();
        },
      });

        if (reply && typeof reply === 'object') {
          const replyMessageOptions = {
            reasoningText: typeof reply.reasoningText === 'string' ? reply.reasoningText : '',
            providerId: typeof reply.providerId === 'string' ? reply.providerId : '',
            providerModel: typeof reply.providerModel === 'string' ? reply.providerModel : '',
            providerMeta: reply.providerMeta && typeof reply.providerMeta === 'object' ? reply.providerMeta : null,
          };
          if (String(reply.text || '').trim()) pushDelimitedAgentMessages(targetAgentId, String(reply.text || ''), replyMessageOptions);
          if (reply.providerMeta || reply.providerId || reply.providerModel || reply.reasoningText) {
            patchLastCanonicalTurn(targetAgentId, replyMessageOptions, (item) => item?.role === 'agent' || item?.role === 'assistant');
          }
          const savedImages = await persistGeneratedImages(reply);
        for (const saved of savedImages) recordGeneratedImage(targetAgentId, saved);
      } else if (String(reply || '').trim()) {
        pushDelimitedAgentMessages(targetAgentId, String(reply || ''));
      }
    };

    // CLI line stores memory in its native file (CLAUDE.md / AGENTS.md), so a
    // single consolidation pass suffices; the HTTP line keeps its two-file
    // (recent + root) flow.
    const cliActiveForSave = Boolean((typeof loadAgentModelSettings === 'function' ? loadAgentModelSettings() : null)?.activeCliProfileId);
    if (cliActiveForSave) {
      const nativeSaveInstruction = '请把本次会话中需要长期保留的信息整理进你的项目记忆文件（CLAUDE.md；如果你运行在 Codex 环境则为 AGENTS.md），保留其中已有的内容，确保下一次会话能够无缝接续。至少记录：项目计划、已完成与进行中的工作、当前状态、下一步、关键决策与约束、需谨慎的事项、以及重要信息的所在位置。完成后只回复 SAVED。';
      await runMemoryPass(nativeSaveInstruction);
    } else {
      await runMemoryPass(saveRecentMemoryPrompt);
      await runMemoryPass(saveMemoryPrompt);
    }
    setAgentStatus(targetAgentId, 'Idle');
    return { ok: true };
  }

  async function compactAndRebuildCanonical(agentId) {
    try {
      await saveAgentRecentMemory(agentId);
      if (typeof rebuildCanonicalAfterCompact === 'function') {
        await rebuildCanonicalAfterCompact(agentId);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error || 'unknown error');
      pushAgentMessage(agentId, 'agent', `[Auto-compact failed: ${detail}]`);
    }
  }

  async function runUntilTodosDone(agentId) {
    if (isAgentRequestInFlight(agentId)) return;
    const requestController = beginAgentRequest(agentId);

    // Caps come from Agent Model settings: per-turn round cap (innerMax) and the
    // cumulative round budget for the whole loop (totalRoundsCap). The loop is now
    // bounded by total rounds consumed, not by a fixed number of re-prompts.
    const settings = (typeof loadAgentModelSettings === 'function' ? loadAgentModelSettings() : null) || {};
    const innerMax = Math.max(1, Math.floor(Number(settings.maxLoopRounds)) || 50);
    const totalRoundsCap = Math.max(1, Math.floor(Number(settings.todoLoopMaxRounds)) || 100);

    let totalRounds = 0;
    try {
      while (totalRounds < totalRoundsCap) {
        const todos = typeof agentChatStateManager.getAgentTodos === 'function'
          ? agentChatStateManager.getAgentTodos(agentId) : [];

        // "Pending" = anything still actionable. Blocked items are intentionally
        // skipped: the loop keeps going on unaffected work and only stops once
        // every item is either completed or blocked.
        const pending = todos.filter((i) => i.status !== 'completed' && i.status !== 'blocked');
        const blockedItems = todos.filter((i) => i.status === 'blocked');
        const allSettled = todos.length > 0 && pending.length === 0;

        if (allSettled) {
          if (blockedItems.length > 0) {
            const names = blockedItems.map((i) => `"${i.content}"`).join(', ');
            pushAgentMessage(agentId, 'agent', t('agentChat.runLoop.completedWithBlocked', { items: names }));
          } else {
            pushAgentMessage(agentId, 'agent', t('agentChat.runLoop.completed'));
          }
          break;
        }
        if (todos.length === 0 || pending.length === 0) break;

        const continuationText = [
          'Continue the task. Resume where you left off.',
          'If a task is blocked by an obstacle, mark it and any tasks it blocks as "blocked" via todo_write, then keep working on the other unaffected tasks.',
          `Remaining todos:\n${pending.map((i) => `- [${i.status}] ${i.content}`).join('\n')}`,
        ].join('\n');

        const roundsBudget = Math.max(1, Math.min(innerMax, totalRoundsCap - totalRounds));
        const roundsBefore = totalRounds;

        setStatus(t('agentChat.notice.requestInProgress'));
        setAgentStatus(agentId, t('agentChat.runLoop.runningStatus', { round: totalRounds, total: totalRoundsCap }));
        recordUserText(agentId, continuationText);

        const reply = await requestDefaultModelCompletion({
          prompt: continuationText,
          agentId,
          signal: requestController.signal,
          suppressAggregatedFinalText: true,
          maxLoopRounds: roundsBudget,
          onRoundComplete: () => {
            totalRounds += 1;
            setAgentStatus(agentId, t('agentChat.runLoop.runningStatus', { round: totalRounds, total: totalRoundsCap }));
          },
          onProgress: (statusText, usageInfo) => {
            if (String(statusText || '').trim()) {
              setAgentStatus(agentId, resolveVisibleAgentStatus(statusText, 'Replying...'));
              pushAgentMessage(agentId, 'thinking', statusText, { includeInContext: false });
            }
            if (usageInfo) setAgentContextUsage(agentId, usageInfo.used, usageInfo.max);
          },
          onModelText: (modelText, modelMeta = null) => {
            const messageOptions = modelMeta && typeof modelMeta === 'object' ? modelMeta : {};
            recordAssistantTextChunk(agentId, modelText, messageOptions);
          },
          onToolCall: (turn) => { appendCanonicalTurns(agentId, [turn]); },
          onToolOutput: (turn) => { appendCanonicalTurns(agentId, [turn]); },
          onImagesAttached: (turns) => { appendCanonicalTurns(agentId, turns); },
          onAutoCompact: (id) => compactAndRebuildCanonical(id),
          onUsageDelta: (delta) => {
            if (typeof agentChatStateManager.accumulateAgentTokenUsage === 'function') {
              agentChatStateManager.accumulateAgentTokenUsage(agentId, delta);
            }
            renderAgentTokenStats();
          },
        });

        if (reply && typeof reply === 'object') {
          const replyMessageOptions = {
            reasoningText: typeof reply.reasoningText === 'string' ? reply.reasoningText : '',
            providerId: typeof reply.providerId === 'string' ? reply.providerId : '',
            providerModel: typeof reply.providerModel === 'string' ? reply.providerModel : '',
            providerMeta: reply.providerMeta && typeof reply.providerMeta === 'object' ? reply.providerMeta : null,
          };
          if (String(reply.text || '').trim()) {
            pushDelimitedAgentMessages(agentId, String(reply.text || ''), replyMessageOptions);
          }
          if (reply.providerMeta || reply.providerId || reply.providerModel || reply.reasoningText) {
            patchLastCanonicalTurn(agentId, replyMessageOptions, (item) => item?.role === 'agent' || item?.role === 'assistant');
          }
          const savedImages = await persistGeneratedImages(reply);
          for (const saved of savedImages) {
            recordGeneratedImage(agentId, saved);
          }
        } else if (String(reply || '').trim()) {
          pushDelimitedAgentMessages(agentId, String(reply || ''));
        }

        // Stall guard: the turn ended without executing a single tool round, so the
        // model produced a final answer rather than continuing the work. Re-prompting
        // would just spin without ever consuming the round budget, so stop here.
        if (totalRounds === roundsBefore) {
          pushAgentMessage(agentId, 'agent', t('agentChat.runLoop.stalled'));
          break;
        }
      }

      if (totalRounds >= totalRoundsCap) {
        pushAgentMessage(agentId, 'agent', t('agentChat.runLoop.limitReached', { limit: totalRoundsCap }));
      }

      setStatus(t('agentChat.notice.responseReceived'));
      setAgentStatus(agentId, 'Idle');
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus(t('agentChat.notice.requestStopped'));
        setAgentStatus(agentId, 'Idle');
        return;
      }
      const detail = error instanceof Error ? error.message : String(error || t('common.unknownError'));
      pushAgentMessage(agentId, 'agent', `[${t('agentChat.runLoop.failed')}: ${detail}]`);
      setStatus(t('agentChat.notice.requestFailed'));
      setAgentStatus(agentId, 'Error');
    } finally {
      endAgentRequest(agentId, requestController);
    }
  }

  function initAgentChatWindow() {
    if (!agentChatWindow) return;

    toolPreviewModal.addEventListener('click', (evt) => {
      const target = evt.target;
      if (target && target.dataset && target.dataset.closeToolPreview) closeToolPreviewModal();
    });

    let dragging = false;
    let resizing = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let startLeft = 0;
    let startTop = 0;
    let startX = 0;
    let startY = 0;

    const ensureAbsolutePlacement = () => {
      const rect = agentChatWindow.getBoundingClientRect();
      if (!agentChatWindow.style.left) {
        agentChatWindow.style.left = `${rect.left}px`;
        agentChatWindow.style.top = `${rect.top}px`;
        agentChatWindow.style.right = 'auto';
        agentChatWindow.style.bottom = 'auto';
        agentChatWindow.style.transform = 'none';
      }
    };

    agentChatTitlebar.addEventListener('pointerdown', (evt) => {
      if (evt.target === agentChatToggle) return;
      ensureAbsolutePlacement();
      const rect = agentChatWindow.getBoundingClientRect();
      dragging = true;
      dragOffsetX = evt.clientX - rect.left;
      dragOffsetY = evt.clientY - rect.top;
      agentChatTitlebar.setPointerCapture(evt.pointerId);
      document.body.classList.add('dragging-agent-chat');
    });

    agentChatTitlebar.addEventListener('pointermove', (evt) => {
      if (!dragging) return;
      // Only the titlebar (the draggable top strip) must stay within the app
      // window — the rest of the panel may hang off the bottom edge.
      const titlebarHeight = agentChatTitlebar.offsetHeight || 34;
      const maxX = window.innerWidth - agentChatWindow.offsetWidth;
      const maxY = window.innerHeight - titlebarHeight;
      const nextLeft = Math.max(0, Math.min(maxX, evt.clientX - dragOffsetX));
      const nextTop = Math.max(34, Math.min(maxY, evt.clientY - dragOffsetY));
      agentChatWindow.style.left = `${nextLeft}px`;
      agentChatWindow.style.top = `${nextTop}px`;
    });

    const endDrag = (evt) => {
      if (!dragging) return;
      dragging = false;
      if (evt && evt.pointerId != null) {
        try { agentChatTitlebar.releasePointerCapture(evt.pointerId); } catch (_) {}
      }
      document.body.classList.remove('dragging-agent-chat');
    };

    agentChatTitlebar.addEventListener('pointerup', endDrag);
    agentChatTitlebar.addEventListener('pointercancel', endDrag);

    agentChatResize.addEventListener('pointerdown', (evt) => {
      if (agentChatState.minimized) return;
      ensureAbsolutePlacement();
      const rect = agentChatWindow.getBoundingClientRect();
      resizing = true;
      startX = evt.clientX;
      startY = evt.clientY;
      startWidth = agentChatWindow.offsetWidth;
      startHeight = agentChatWindow.offsetHeight;
      startLeft = rect.left;
      startTop = rect.top;
      agentChatResize.setPointerCapture(evt.pointerId);
      document.body.classList.add('resizing-agent-chat');
      evt.stopPropagation();
    });

    agentChatResize.addEventListener('pointermove', (evt) => {
      if (!resizing) return;
      const maxWidth = Math.max(520, window.innerWidth - startLeft);
      const maxHeight = Math.max(220, window.innerHeight - startTop);
      const nextWidth = Math.max(520, Math.min(maxWidth, startWidth + (evt.clientX - startX)));
      const nextHeight = Math.max(220, Math.min(maxHeight, startHeight + (evt.clientY - startY)));
      agentChatWindow.style.left = `${startLeft}px`;
      agentChatWindow.style.top = `${startTop}px`;
      agentChatWindow.style.width = `${nextWidth}px`;
      agentChatWindow.style.height = `${nextHeight}px`;
    });

    const endResize = (evt) => {
      if (!resizing) return;
      resizing = false;
      if (evt && evt.pointerId != null) {
        try { agentChatResize.releasePointerCapture(evt.pointerId); } catch (_) {}
      }
      document.body.classList.remove('resizing-agent-chat');
    };

    agentChatResize.addEventListener('pointerup', endResize);
    agentChatResize.addEventListener('pointercancel', endResize);

    window.addEventListener('pointerup', (evt) => {
      endDrag(evt);
      endResize(evt);
    });
    window.addEventListener('pointercancel', (evt) => {
      endDrag(evt);
      endResize(evt);
    });

    let resizingComposer = false;
    let composerStartY = 0;
    let composerStartInputHeight = 0;

    if (agentChatComposerResize && agentChatInput) {
      const agentChatMain = agentChatInput.closest('.agent-chat-main');
      const toolbar = agentChatMain?.querySelector('.agent-chat-toolbar') || null;
      const composer = agentChatMain?.querySelector('.agent-chat-composer') || null;
      const minInputHeight = 34;
      const minTimelineHeight = 80;

      agentChatComposerResize.addEventListener('pointerdown', (evt) => {
        if (agentChatState.minimized) return;
        resizingComposer = true;
        composerStartY = evt.clientY;
        composerStartInputHeight = agentChatInput.getBoundingClientRect().height;
        agentChatComposerResize.setPointerCapture(evt.pointerId);
        document.body.classList.add('resizing-agent-composer');
        evt.preventDefault();
        evt.stopPropagation();
      });

      agentChatComposerResize.addEventListener('pointermove', (evt) => {
        if (!resizingComposer) return;
        const dy = evt.clientY - composerStartY;
        const desiredHeight = composerStartInputHeight - dy;

        const mainHeight = Math.max(0, Number(agentChatMain?.clientHeight) || 0);
        const toolbarHeight = Math.max(0, Number(toolbar?.offsetHeight) || 0);
        const splitterHeight = Math.max(0, Number(agentChatComposerResize?.offsetHeight) || 0);
        const composerPaddingY = Math.max(0, Number(composer ? (composer.offsetHeight - agentChatInput.offsetHeight) : 16));
        const maxInputHeight = Math.max(minInputHeight, mainHeight - toolbarHeight - splitterHeight - composerPaddingY - minTimelineHeight);

        const nextHeight = Math.max(minInputHeight, Math.min(maxInputHeight, desiredHeight));
        agentChatInput.style.height = `${Math.round(nextHeight)}px`;
      });

      const endComposerResize = (evt) => {
        if (!resizingComposer) return;
        resizingComposer = false;
        if (evt && evt.pointerId != null) {
          try { agentChatComposerResize.releasePointerCapture(evt.pointerId); } catch (_) {}
        }
        document.body.classList.remove('resizing-agent-composer');
      };

      agentChatComposerResize.addEventListener('pointerup', endComposerResize);
      agentChatComposerResize.addEventListener('pointercancel', endComposerResize);
      window.addEventListener('pointerup', endComposerResize);
      window.addEventListener('pointercancel', endComposerResize);
    }

    let resizingTodoPanel = false;
    let todoPanelStartX = 0;
    let todoPanelStartWidth = 0;

    if (agentChatPanelResize && agentChatTodos) {
      const todoPanelEl = agentChatTodos.closest('.agent-chat-todo-panel');
      const agentChatMain = agentChatTodos.closest('.agent-chat-main');
      const PANEL_COLLAPSED = 4;
      const PANEL_THRESHOLD = 130;
      const PANEL_SNAP_MARGIN = 15;
      const minChatWidth = 200;

      agentChatPanelResize.addEventListener('pointerdown', (evt) => {
        if (agentChatState.minimized) return;
        resizingTodoPanel = true;
        todoPanelStartX = evt.clientX;
        todoPanelStartWidth = todoPanelEl?.getBoundingClientRect().width ?? 200;
        agentChatPanelResize.setPointerCapture(evt.pointerId);
        document.body.classList.add('resizing-agent-todo-panel');
        evt.preventDefault();
        evt.stopPropagation();
      });

      agentChatPanelResize.addEventListener('pointermove', (evt) => {
        if (!resizingTodoPanel) return;
        const dx = evt.clientX - todoPanelStartX;
        const desiredWidth = todoPanelStartWidth - dx;
        const mainWidth = Math.max(0, Number(agentChatMain?.clientWidth) || 0);
        const maxPanelWidth = Math.max(PANEL_THRESHOLD, mainWidth - minChatWidth);
        let nextWidth;
        if (desiredWidth >= PANEL_THRESHOLD) {
          nextWidth = Math.min(maxPanelWidth, desiredWidth);
        } else if (desiredWidth >= PANEL_THRESHOLD - PANEL_SNAP_MARGIN) {
          nextWidth = PANEL_THRESHOLD;
        } else {
          nextWidth = PANEL_COLLAPSED;
        }
        if (todoPanelEl) {
          todoPanelEl.style.width = `${Math.round(nextWidth)}px`;
          todoPanelEl.classList.toggle('collapsed', nextWidth === PANEL_COLLAPSED);
        }
      });

      const endTodoPanelResize = (evt) => {
        if (!resizingTodoPanel) return;
        resizingTodoPanel = false;
        if (evt && evt.pointerId != null) {
          try { agentChatPanelResize.releasePointerCapture(evt.pointerId); } catch (_) {}
        }
        document.body.classList.remove('resizing-agent-todo-panel');
      };

      agentChatPanelResize.addEventListener('pointerup', endTodoPanelResize);
      agentChatPanelResize.addEventListener('pointercancel', endTodoPanelResize);
      window.addEventListener('pointerup', endTodoPanelResize);
      window.addEventListener('pointercancel', endTodoPanelResize);
    }

    let resizingSidebar = false;
    let sidebarStartX = 0;
    let sidebarStartWidth = 0;

    if (agentChatSidebarResize && agentChatSidebar) {
      const SIDEBAR_COLLAPSED = 4;
      const SIDEBAR_THRESHOLD = 64;
      const SIDEBAR_SNAP_MARGIN = 15;
      const minChatWidth = 200;

      agentChatSidebarResize.addEventListener('pointerdown', (evt) => {
        if (agentChatState.minimized) return;
        resizingSidebar = true;
        sidebarStartX = evt.clientX;
        sidebarStartWidth = agentChatSidebar.getBoundingClientRect().width;
        agentChatSidebarResize.setPointerCapture(evt.pointerId);
        document.body.classList.add('resizing-agent-sidebar');
        evt.preventDefault();
        evt.stopPropagation();
      });

      agentChatSidebarResize.addEventListener('pointermove', (evt) => {
        if (!resizingSidebar) return;
        const dx = evt.clientX - sidebarStartX;
        const desiredWidth = sidebarStartWidth + dx;
        const bodyWidth = Math.max(0, Number(agentChatSidebar.closest('.agent-chat-body')?.clientWidth) || 0);
        const maxSidebarWidth = Math.max(SIDEBAR_THRESHOLD, bodyWidth - minChatWidth);
        let nextWidth;
        if (desiredWidth >= SIDEBAR_THRESHOLD) {
          nextWidth = Math.min(maxSidebarWidth, desiredWidth);
        } else if (desiredWidth >= SIDEBAR_THRESHOLD - SIDEBAR_SNAP_MARGIN) {
          nextWidth = SIDEBAR_THRESHOLD;
        } else {
          nextWidth = SIDEBAR_COLLAPSED;
        }
        agentChatSidebar.style.width = `${Math.round(nextWidth)}px`;
        agentChatSidebar.classList.toggle('collapsed', nextWidth === SIDEBAR_COLLAPSED);
      });

      const endSidebarResize = (evt) => {
        if (!resizingSidebar) return;
        resizingSidebar = false;
        if (evt && evt.pointerId != null) {
          try { agentChatSidebarResize.releasePointerCapture(evt.pointerId); } catch (_) {}
        }
        document.body.classList.remove('resizing-agent-sidebar');
      };

      agentChatSidebarResize.addEventListener('pointerup', endSidebarResize);
      agentChatSidebarResize.addEventListener('pointercancel', endSidebarResize);
      window.addEventListener('pointerup', endSidebarResize);
      window.addEventListener('pointercancel', endSidebarResize);
    }


    agentChatToggle.addEventListener('click', () => {
      if (!agentChatState.minimized) {
        agentChatState.prevWidth = agentChatWindow.style.width || `${agentChatWindow.offsetWidth}px`;
        agentChatState.prevHeight = agentChatWindow.style.height || `${agentChatWindow.offsetHeight}px`;
        agentChatState.minimized = true;
        agentChatWindow.classList.add('minimized');
        agentChatWindow.style.width = '256px';
        agentChatWindow.style.height = '36px';
      } else {
        agentChatState.minimized = false;
        agentChatWindow.classList.remove('minimized');
        if (agentChatState.prevWidth) agentChatWindow.style.width = agentChatState.prevWidth;
        if (agentChatState.prevHeight) agentChatWindow.style.height = agentChatState.prevHeight;
      }
      if (agentChatBody) agentChatBody.classList.toggle('hidden', agentChatState.minimized);
      agentChatToggle.textContent = agentChatState.minimized ? '+' : '-';
    });

    const pendingImages = [];
    const MAX_PENDING_IMAGE_TOTAL_BYTES = 24 * 1024 * 1024;

    function renderPendingImagePreview() {
      if (!agentChatImagePreview) return;
      agentChatImagePreview.innerHTML = '';
      if (!pendingImages.length) {
        agentChatImagePreview.classList.add('hidden');
        return;
      }
      agentChatImagePreview.classList.remove('hidden');
      pendingImages.forEach((item, index) => {
        const wrap = document.createElement('div');
        wrap.className = 'agent-chat-image-item';

        const img = document.createElement('img');
        img.src = item.dataUrl;
        img.alt = item.name || `image-${index + 1}`;
        img.addEventListener('click', () => {
          if (!agentChatImageLightbox || !agentChatImageLightboxImg) return;
          agentChatImageLightboxImg.src = item.dataUrl;
          agentChatImageLightbox.classList.remove('hidden');
          agentChatImageLightbox.setAttribute('aria-hidden', 'false');
        });
        wrap.appendChild(img);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'agent-chat-image-remove';
        removeBtn.textContent = '×';
        removeBtn.title = t('agentChat.imagePreview.removeImageTitle');
        removeBtn.addEventListener('click', () => {
          pendingImages.splice(index, 1);
          renderPendingImagePreview();
        });
        wrap.appendChild(removeBtn);

        agentChatImagePreview.appendChild(wrap);
      });
    }

    async function addImageFiles(fileList) {
      const files = Array.from(fileList || []).filter((file) => String(file?.type || '').startsWith('image/'));
      let currentTotal = pendingImages.reduce((sum, item) => sum + Number(item?.size || 0), 0);
      for (const file of files) {
        const fileSize = Number(file?.size || 0);
        if ((currentTotal + fileSize) > MAX_PENDING_IMAGE_TOTAL_BYTES) {
          setStatus(t('agentChat.notice.imagesTooLarge', { mb: Math.round(MAX_PENDING_IMAGE_TOTAL_BYTES / 1024 / 1024) }));
          break;
        }
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
        if (!dataUrl) continue;
        pendingImages.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: file.name || 'image', mimeType: file.type || 'image/*', size: fileSize, dataUrl });
        currentTotal += fileSize;
      }
      renderPendingImagePreview();
    }

    function setComposerDragState(isActive) {
      if (!agentChatComposer) return;
      agentChatComposer.classList.toggle('dragover', Boolean(isActive));
    }

    if (agentChatImageLightbox) {
      agentChatImageLightbox.addEventListener('click', () => {
        agentChatImageLightbox.classList.add('hidden');
        agentChatImageLightbox.setAttribute('aria-hidden', 'true');
        if (agentChatImageLightboxImg) agentChatImageLightboxImg.src = '';
      });
    }

    if (agentChatComposer) {
      agentChatComposer.addEventListener('dragover', (evt) => {
        evt.preventDefault();
        setComposerDragState(true);
      });
      agentChatComposer.addEventListener('dragleave', () => setComposerDragState(false));
      agentChatComposer.addEventListener('drop', async (evt) => {
        evt.preventDefault();
        setComposerDragState(false);
        if (evt.dataTransfer?.files?.length) {
          await addImageFiles(evt.dataTransfer.files);
        }
      });
    }

    agentChatInput.addEventListener('paste', async (evt) => {
      const items = Array.from(evt.clipboardData?.items || []);
      const imageFiles = items
        .filter((item) => item && item.kind === 'file' && String(item.type || '').startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (!imageFiles.length) return;
      evt.preventDefault();
      await addImageFiles(imageFiles);
    });

    agentChatSend.addEventListener('click', async () => {
      const activeAgentId = agentChatState.activeAgentId;
      if (isAgentRequestInFlight(activeAgentId)) {
        if (cancelAgentRequest(activeAgentId)) {
          setStatus(t('agentChat.notice.requestStopping'));
        }
        return;
      }

      const text = (agentChatInput.value || '').trim();
      if (!text && pendingImages.length === 0) return;

      const targetAgentId = activeAgentId;
      const requestController = beginAgentRequest(targetAgentId);
      const outgoingImages = pendingImages.map((item) => ({ ...item }));
      // First-turn detection + snapshot for a possible full retract on user-stop.
      // "First turn" = no prior context (canonical empty); a user-initiated stop of
      // it should be as-if-never-sent on BOTH lines: the CLI line never persists a
      // first aborted turn, so we mirror that on the HTTP line by truncating the
      // canonical user turn (+ any partial assistant) we're about to add, and revert
      // the UI bubbles + composer. Continuation turns are left intact (they stay in
      // context by design).
      const canonLenBefore = Array.isArray(agentChatState.canonicalByAgent[targetAgentId]?.turns)
        ? agentChatState.canonicalByAgent[targetAgentId].turns.length : 0;
      const uiLenBefore = Array.isArray(agentChatState.messagesByAgent[targetAgentId])
        ? agentChatState.messagesByAgent[targetAgentId].length : 0;
      const wasFirstTurn = canonLenBefore === 0;
      recordUserText(targetAgentId, text || '', { images: outgoingImages });
      pendingImages.splice(0, pendingImages.length);
      renderPendingImagePreview();
      agentChatInput.value = '';
      setStatus(t('agentChat.notice.requestInProgress'));
      setAgentStatus(targetAgentId, 'Replying...');

      try {
        const reply = await requestDefaultModelCompletion({
          prompt: text,
          images: outgoingImages,
          agentId: targetAgentId,
          signal: requestController?.signal,
          suppressAggregatedFinalText: true,
          onProgress: (statusText, usageInfo) => {
            const thinkingText = String(statusText || 'Replying...');
            if (String(statusText || '').trim()) {
              setAgentStatus(targetAgentId, resolveVisibleAgentStatus(thinkingText, 'Replying...'));
              pushAgentMessage(targetAgentId, 'thinking', thinkingText, { includeInContext: false });
            }
            if (usageInfo) setAgentContextUsage(targetAgentId, usageInfo.used, usageInfo.max);
          },
          onModelText: (modelText, modelMeta = null) => {
            const messageOptions = modelMeta && typeof modelMeta === 'object' ? modelMeta : {};
            recordAssistantTextChunk(targetAgentId, modelText, messageOptions);
          },
          onToolCall: (turn) => {
            appendCanonicalTurns(targetAgentId, [turn]);
          },
          onToolOutput: (turn) => {
            appendCanonicalTurns(targetAgentId, [turn]);
          },
          onImagesAttached: (turns) => {
            appendCanonicalTurns(targetAgentId, turns);
          },
          onAutoCompact: (agentId) => compactAndRebuildCanonical(agentId),
          onUsageDelta: (delta) => {
            if (typeof agentChatStateManager.accumulateAgentTokenUsage === 'function') {
              agentChatStateManager.accumulateAgentTokenUsage(targetAgentId, delta);
            }
            renderAgentTokenStats();
          },
        });

        if (reply && typeof reply === 'object') {
          const replyMessageOptions = {
            reasoningText: typeof reply.reasoningText === 'string' ? reply.reasoningText : '',
            providerId: typeof reply.providerId === 'string' ? reply.providerId : '',
            providerModel: typeof reply.providerModel === 'string' ? reply.providerModel : '',
            providerMeta: reply.providerMeta && typeof reply.providerMeta === 'object' ? reply.providerMeta : null,
          };
          if (String(reply.text || '').trim()) {
            pushDelimitedAgentMessages(targetAgentId, String(reply.text || ''), replyMessageOptions);
          }
          if (reply.providerMeta || reply.providerId || reply.providerModel || reply.reasoningText) {
            patchLastCanonicalTurn(targetAgentId, replyMessageOptions, (item) => item?.role === 'agent' || item?.role === 'assistant');
          }
          const savedImages = await persistGeneratedImages(reply);
          for (const saved of savedImages) {
            recordGeneratedImage(targetAgentId, saved);
          }
        } else if (String(reply || '').trim()) {
          pushDelimitedAgentMessages(targetAgentId, String(reply || ''));
        }

        setStatus(t('agentChat.notice.responseReceived'));
        setAgentStatus(targetAgentId, 'Idle');
      } catch (error) {
        if (error?.name === 'AbortError') {
          // Full retract of a first turn: drop the just-added UI bubbles + canonical
          // turns and return the draft to the composer, so it's truly "never sent"
          // (consistent across the CLI and HTTP lines). Continuation turns stay.
          if (wasFirstTurn) {
            if (typeof agentChatStateManager.truncateAgentTurns === 'function') {
              agentChatStateManager.truncateAgentTurns(targetAgentId, uiLenBefore, canonLenBefore);
            }
            if (!String(agentChatInput.value || '').trim()) {
              agentChatInput.value = text || '';
              for (const img of outgoingImages) pendingImages.push(img);
              renderPendingImagePreview();
            }
            renderAgentTimeline();
          }
          setStatus(t('agentChat.notice.requestStopped'));
          setAgentStatus(targetAgentId, 'Idle');
          return;
        }
        const detail = error instanceof Error ? error.message : String(error || t('common.unknownError'));
        pushAgentMessage(targetAgentId, 'agent', `${t('agentChat.message.requestFailed')}\n${detail}`);
        setStatus(t('agentChat.notice.requestFailed'));
        setAgentStatus(targetAgentId, 'Error');
      } finally {
        endAgentRequest(targetAgentId, requestController);
      }
    });

    if (agentChatSaveMemory) {
      agentChatSaveMemory.addEventListener('click', async () => {
        const targetAgentId = agentChatState.activeAgentId;

        let saveRecentMemoryPrompt = 'Save recent memory now.';
        let saveMemoryPrompt = 'Perform memory organization now. Follow your existing prompt instructions for memory consolidation and write the updates to the memory files.';
        try {
          const loadedRecentPrompt = await loadPromptTextByPath(SAVE_RECENT_MEMORY_PROMPT_PATH);
          if (String(loadedRecentPrompt || '').trim()) saveRecentMemoryPrompt = String(loadedRecentPrompt).trim();
        } catch (_) {}
        try {
          const loadedPrompt = await loadPromptTextByPath(SAVE_MEMORY_PROMPT_PATH);
          if (String(loadedPrompt || '').trim()) saveMemoryPrompt = String(loadedPrompt).trim();
        } catch (_) {
          // keep fallback inline prompt if external file is unavailable
        }

        setStatus(t('agentChat.notice.memoryOrganizationRequestInProgress'));
        setAgentStatus(targetAgentId, 'Organizing memory...');

        if (agentChatSaveMemory) agentChatSaveMemory.disabled = true;
        try {
          await runSaveMemoryForAgent(targetAgentId);

          // The reset + reload below re-injects the HTTP line's just-rewritten
          // memory_root/recent files into the timeline. The CLI line keeps its
          // memory in CLAUDE.md/AGENTS.md (loaded natively next run), so for it
          // that reload only adds "[memory not found]" noise and a needless session
          // reset — skip it and leave the live conversation as-is.
          const cliActiveAfterSave = Boolean((typeof loadAgentModelSettings === 'function' ? loadAgentModelSettings() : null)?.activeCliProfileId);
          if (!cliActiveAfterSave) {
            resetAgentChatSessionsForNewProject();
            if (typeof deps?.loadAgentMemoriesForActiveProject === 'function') {
              await deps.loadAgentMemoriesForActiveProject({
                reason: 'save-memory-reload',
                quiet: true,
                preferSessionRestore: false,
              });
            }
          }

          // Sync session.json to the post-compaction state so a restart before the
          // next Ctrl+S restores the compacted memory instead of the stale pre-compaction session.
          await persistSessionSnapshot(targetAgentId);

          renderAgentTodoPanel();
          setStatus(t('agentChat.notice.memoryOrganizationResponseReceived'));
          setAgentStatus(targetAgentId, 'Idle');
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error || t('common.unknownError'));
          pushAgentMessage(targetAgentId, 'agent', `${t('agentChat.message.memoryOrganizationRequestFailed')}\n${detail}`);
          setStatus(t('agentChat.notice.memoryOrganizationRequestFailed'));
          setAgentStatus(targetAgentId, 'Error');
        } finally {
          if (agentChatSaveMemory) agentChatSaveMemory.disabled = false;
        }
      });
    }

    if (agentRunUntilDone) {
      agentRunUntilDone.addEventListener('click', async () => {
        const agentId = agentChatState.activeAgentId;
        if (isAgentRequestInFlight(agentId)) return;
        await runUntilTodosDone(agentId);
      });
    }

    // NOTE (2026-05-07): legacy/unused flow.
    // The "Compact Memory" button has been removed from UI, so this handler
    // is currently dormant unless the DOM element is reintroduced.
    if (agentChatCompressMemory) {
      agentChatCompressMemory.addEventListener('click', async () => {
        const targetAgentId = agentChatState.activeAgentId;

        if (agentChatCompressMemory) agentChatCompressMemory.disabled = true;
        if (agentChatSaveMemory) agentChatSaveMemory.disabled = true;
        try {
          setAgentStatus(targetAgentId, 'Compacting context...');
          setStatus(t('agentChat.notice.compactionInProgress'));
          const result = await agentContextCompactionManager.run(targetAgentId);
          renderAgentTimeline({ forceScrollBottom: true });
          renderAgentStatusBar();
          setAgentStatus(targetAgentId, 'Idle');
          if (result?.skipped) {
            setStatus(t('agentChat.notice.compactionSkipped', { reason: result.skipped }));
          } else {
            setStatus(t('agentChat.notice.compactionComplete', { count: result?.compactedChunks || 0 }));
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error || t('common.unknownError'));
          pushAgentMessage(targetAgentId, 'agent', `${t('agentChat.message.contextCompactionFailed')}\n${detail}`);
          setAgentStatus(targetAgentId, 'Error');
          setStatus(t('agentChat.notice.compactionFailed'));
        } finally {
          if (agentChatCompressMemory) agentChatCompressMemory.disabled = false;
          if (agentChatSaveMemory) agentChatSaveMemory.disabled = false;
        }
      });
    }

    agentChatInput.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' && !evt.shiftKey) {
        evt.preventDefault();
        agentChatSend.click();
      }
    });

    window.AGENT_CHAT_API = {
      pushAgentMessage(agentId, text) {
        pushAgentMessage(agentId, 'agent', text);
      },
      getActiveAgentId() {
        return agentChatState.activeAgentId;
      },
      setActiveAgent(agentId) {
        if (!agentChatState.messagesByAgent[agentId]) return;
        agentChatState.activeAgentId = agentId;
        renderAgentSidebar();
        renderAgentTimeline();
        renderAgentStatusBar();
        renderAgentTodoPanel();
        renderAgentTokenStats();
        renderAgentCtxBar();
        syncAgentSendButton();
        syncRunUntilDoneButton();
      },
    };

    renderAgentSidebar();
    renderAgentTimeline();
    renderAgentStatusBar();
    renderAgentTodoPanel();
    renderAgentTokenStats();
    syncContextLimitFromModel();
    syncAgentSendButton();
    syncRunUntilDoneButton();
  }

  function resetAgentChatSessionsForNewProject() {
    if (!agentChatState?.agents || agentChatState.agents.length === 0) return;
    for (const agent of agentChatState.agents) {
      const agentId = agent.id;
      agentChatState.messagesByAgent[agentId] = [];
      agentChatState.canonicalByAgent[agentId] = { turns: [] };
      agentChatState.todosByAgent[agentId] = [];
      agentChatState.statusByAgent[agentId] = 'Idle';
      const usage = agentChatState.contextUsageByAgent[agentId] || { used: 0, max: AGENT_DEFAULT_CONTEXT_MAX_TOKENS };
      usage.used = 0;
      if (!Number.isFinite(usage.max) || usage.max <= 0) {
        usage.max = AGENT_DEFAULT_CONTEXT_MAX_TOKENS;
      }
      agentChatState.contextUsageByAgent[agentId] = usage;
    }
  }

  return {
    getAgentDisplayName,
    setAgentStatus,
    setAgentContextUsage,
    renderAgentStatusBar,
    renderAgentSidebar,
    renderAgentTimeline,
    renderAgentTodoPanel,
    renderAgentCtxBar,
    syncContextLimitFromModel,
    syncAgentSendButton,
    pushAgentMessage,
    formatSystemEventText,
    recordDeveloperText,
    recordImageEvent,
    initAgentChatWindow,
    resetAgentChatSessionsForNewProject,
    runSaveMemoryForAgent,
    persistSessionSnapshot,
    persistAllAgentSessionSnapshots,
  };
}
