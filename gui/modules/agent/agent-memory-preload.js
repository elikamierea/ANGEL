// Agent memory preload orchestration.
//
// This module loads per-agent memory files into the chat timeline and emits
// read traces so preload behavior is visible/debuggable.

// Extracts the most recent "rounds" of canonical turns from a persisted
// history snapshot (see buildHistorySnapshot in agent-chat-ui-shell.js), for
// reconstruction into the next session's canonical state.
//
// Turns previously injected as memory recovery (recoveryInjected === true or
// messageKind === 'recovery') are dropped first, so prior recovery blocks
// (long-term memory, recent memory, earlier reconstructions) never get
// re-nested into the new reconstruction.
//
// Remaining turns are grouped into "rounds" starting at each role === 'user'
// turn (a leading run of non-user turns, if any, forms its own round). Rounds
// are kept from the most recent backwards while the combined size of
// text/reasoningText/arguments/output stays within maxChars; the most recent
// round is always kept even if it alone exceeds maxChars.
//
// Pure function of (raw, maxChars) so it can be unit-tested directly.
export function buildRecentCanonicalTurns(raw, maxChars) {
  if (!raw) return [];
  let canonicalTurns;
  try {
    const parsed = JSON.parse(raw);
    canonicalTurns = Array.isArray(parsed?.canonical?.turns) ? parsed.canonical.turns : [];
  } catch (_) {
    return [];
  }
  if (canonicalTurns.length === 0) return [];

  const filtered = canonicalTurns.filter((turn) => {
    if (!turn) return false;
    if (turn.recoveryInjected === true) return false;
    if (String(turn.messageKind || '').trim() === 'recovery') return false;
    return true;
  });
  if (filtered.length === 0) return [];

  const rounds = [];
  let current = null;
  for (const turn of filtered) {
    if (!current || String(turn?.role || '') === 'user') {
      current = [];
      rounds.push(current);
    }
    current.push(turn);
  }

  const turnSize = (turn) => String(turn?.text || '').length
    + String(turn?.reasoningText || '').length
    + String(turn?.arguments || '').length
    + String(turn?.output || '').length;
  const roundSize = (round) => round.reduce((sum, turn) => sum + turnSize(turn), 0);

  const kept = [];
  let total = 0;
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    const size = roundSize(rounds[i]);
    if (kept.length > 0 && total + size > maxChars) break;
    kept.unshift(rounds[i]);
    total += size;
  }

  return kept.flat();
}

export function createAgentMemoryPreload(deps) {
  const {
    state,
    agentChatState,
    resetAgentChatSessionsForNewProject,
    renderAgentTimeline,
    renderAgentStatusBar,
    renderAgentTodoPanel,
    AGENT_MEMORY_FOLDER_BY_ID,
    AGENT_MEMORY_FILES,
    AGENT_MEMORY_READ_LIMIT,
    toolReadByParams,
    pushAgentMessage,
    recordDeveloperText,
    appendCanonicalTurns,
    restoreAgentSession,
    setAgentTodos,
    formatSystemEventText,
    isMissingFileSystemError,
    setStatus,
  } = deps;

  const MAX_FULL_READ_ITERATIONS = 50;

  // toolReadByParams caps `limit` at 2000 lines per call. session.json/latest.json
  // are pretty-printed JSON snapshots that can easily exceed that, so read them in
  // successive pages and concatenate before JSON.parse.
  async function readFullTextFile(relPath) {
    const parts = [];
    let offset = 1;
    for (let i = 0; i < MAX_FULL_READ_ITERATIONS; i += 1) {
      const result = await toolReadByParams({ path: relPath, offset, limit: AGENT_MEMORY_READ_LIMIT });
      parts.push(typeof result?.content === 'string' ? result.content : '');
      if (!result?.truncated || !result?.nextOffset) break;
      offset = result.nextOffset;
    }
    return parts.join('\n');
  }

  function pushSystemRecoveryMessage(agentId, text) {
    const payload = {
      includeInContext: true,
      recoveryInjected: true,
      messageKind: 'recovery',
    };
    if (typeof recordDeveloperText === 'function') {
      recordDeveloperText(agentId, formatSystemEventText(text), payload);
      return;
    }
    pushAgentMessage(agentId, 'developer', formatSystemEventText(text), payload);
  }

  function buildMissingFileNotice(relPath) {
    return `[${relPath} not found]`;
  }

  // Load per-agent memory files into timeline as synthetic system/user entries.
  // Non-fatal missing files are reported in trace and UI summary, then skipped.
  async function loadAgentMemoriesForActiveProject(options = {}) {
    if (!agentChatState?.agents || agentChatState.agents.length === 0) {
      return { loadedFiles: 0, totalFiles: 0 };
    }

    resetAgentChatSessionsForNewProject();

    if (!state.projectRootPath && !state.currentProjectDirHandle) {
      renderAgentTimeline({ forceScrollBottom: true });
      renderAgentStatusBar();
      if (typeof renderAgentTodoPanel === 'function') renderAgentTodoPanel();
      return { loadedFiles: 0, totalFiles: 0, skipped: 'no-project-root' };
    }

    let loadedFiles = 0;
    let missingFiles = 0;
    let totalFiles = 0;
    const preferSessionRestore = options?.preferSessionRestore !== false;
    const sessionOnly = Boolean(options?.sessionOnly);

    const MAX_HISTORY_CHARS = 12000;

    for (const agent of agentChatState.agents) {
      const agentId = agent.id;
      const canonicalAgentId = agentId === 'resource' ? 'resource-provider' : agentId;
      const folderName = AGENT_MEMORY_FOLDER_BY_ID[canonicalAgentId] || canonicalAgentId;

      if (preferSessionRestore) {
        const sessionPath = `agents/${folderName}/history/session.json`;
        try {
          const raw = (await readFullTextFile(sessionPath)).trim();
          if (raw) {
            const parsed = JSON.parse(raw);
            const restored = restoreAgentSession(agentId, parsed);
            if (restored) {
              loadedFiles += 1;
              totalFiles += 1;
              continue;
            }
          }
        } catch (_) {
          totalFiles += 1;
        }
        // CLI agents (sessionOnly) use native session resume — if session.json
        // restore failed there is no fallback memory to inject, so skip the
        // full preload block (memory files + history reconstruction + separator).
        if (sessionOnly) continue;
      }

      if (!sessionOnly) {
        for (const fileDef of AGENT_MEMORY_FILES) {
          totalFiles += 1;
          const relPath = `agents/${folderName}/${fileDef.name}`;
          const toolArgs = { path: relPath, offset: 1, limit: AGENT_MEMORY_READ_LIMIT };

          try {
            const result = await toolReadByParams(toolArgs);
            const text = typeof result?.content === 'string' ? result.content.trim() : '';

            if (!text) {
              pushSystemRecoveryMessage(agentId, `${fileDef.label}:\n${buildMissingFileNotice(relPath)}`);
              continue;
            }

            const heading = fileDef.name === 'memory_recent.md'
              ? '以下是对近期会话的汇总：'
              : '以下是对于项目的长期记忆：';
            pushSystemRecoveryMessage(agentId, `${heading}\n${text}`);
            loadedFiles += 1;
          } catch (error) {
            const missing = isMissingFileSystemError(error);
            const detail = error instanceof Error ? error.message : String(error || 'unknown error');

            if (missing) {
              missingFiles += 1;
              pushSystemRecoveryMessage(agentId, `${fileDef.label}:\n${buildMissingFileNotice(relPath)}`);
              continue;
            }

            console.error(`Failed to load agent memory file: ${relPath}`, error);
          }
        }
      }

      const historyPath = `agents/${folderName}/history/latest.json`;
      try {
        const raw = await readFullTextFile(historyPath);
        if (typeof setAgentTodos === 'function') {
          try {
            const parsed = JSON.parse(raw);
            setAgentTodos(agentId, parsed?.todos);
          } catch (_) {}
        }
        const recentTurns = buildRecentCanonicalTurns(raw, MAX_HISTORY_CHARS);
        if (recentTurns.length > 0) {
          pushSystemRecoveryMessage(agentId, `以下是最近会话的重建（保留不超过${MAX_HISTORY_CHARS}字符的完整对话回合）：`);
          const markedTurns = recentTurns.map((turn) => ({ ...turn, recoveryInjected: true, messageKind: 'recovery' }));
          appendCanonicalTurns(agentId, markedTurns);
          for (const turn of markedTurns) {
            const role = String(turn?.role || '');
            if (role === 'function_call' || role === 'tool_output') continue;
            pushAgentMessage(agentId, role, String(turn?.text || ''), {
              includeInContext: turn.includeInContext,
              imageUrl: turn.imageUrl,
              imagePath: turn.imagePath,
              images: turn.images,
              reasoningText: turn.reasoningText,
              providerId: turn.providerId,
              providerModel: turn.providerModel,
              providerMeta: turn.providerMeta,
              recoveryInjected: true,
              messageKind: 'recovery',
            });
          }
          loadedFiles += 1;
          totalFiles += 1;
        }
      } catch (_) {
        totalFiles += 1;
      }

      pushSystemRecoveryMessage(agentId, '以上为恢复的记忆。接下来将会是用户的message');
    }

    renderAgentTimeline({ forceScrollBottom: true });
    renderAgentStatusBar();
    if (typeof renderAgentTodoPanel === 'function') renderAgentTodoPanel();

    if (!options?.quiet) {
      setStatus(`Agent memories loaded (${loadedFiles}/${totalFiles}), missing (${missingFiles})`);
    }

    return { loadedFiles, totalFiles, missingFiles };
  }

  return { loadAgentMemoriesForActiveProject };
}
