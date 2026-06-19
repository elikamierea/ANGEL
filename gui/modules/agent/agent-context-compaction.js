function extractFirstJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try { return JSON.parse(raw); } catch (_) {}
  }

  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = raw.slice(start, i + 1);
        try { return JSON.parse(candidate); } catch (_) { return null; }
      }
    }
  }
  return null;
}

function normalizeChunkRanges(payload) {
  const chunks = Array.isArray(payload?.chunks) ? payload.chunks : [];
  return chunks
    .map((item) => {
      const startRaw = Number(item?.startIndex ?? item?.start);
      const endRaw = Number(item?.endIndex ?? item?.end);
      if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw)) return null;
      const start = Math.trunc(startRaw);
      const end = Math.trunc(endRaw);
      if (start > end) return null;
      return { start, end };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function formatEventsForPrompt(events) {
  return events
    .map((item) => {
      const idx = Number.isFinite(Number(item?.index)) ? Math.trunc(Number(item.index)) : 0;
      const role = String(item?.role || 'assistant');
      const text = String(item?.text || '');
      return `[${idx}] ${role}\n${text}`;
    })
    .join('\n\n');
}

function buildIndexMap(messages) {
  const map = new Map();
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    const idx = Number.isFinite(Number(msg?.index)) ? Math.trunc(Number(msg.index)) : i;
    if (!map.has(idx)) map.set(idx, i);
  }
  return map;
}

function reindexMessages(messages) {
  return messages.map((item, i) => ({ ...item, index: i }));
}

// NOTE (2026-05-07): currently unused in client UX.
// The UI "Compact Memory" button has been removed, so this manager is not
// reachable from normal user flows for now. Keep code for potential future
// reuse/refactor experiments.
export function createAgentContextCompactionManager(deps) {
  const {
    loadPromptText,
    requestCompletion,
    writeFile,
    getMessagesByAgent,
    setMessagesByAgent,
    getAgentRecycleFolder,
    onStatus,
    onProgress,
  } = deps;

  async function run(agentId) {
    const allMessages = Array.isArray(getMessagesByAgent(agentId)) ? getMessagesByAgent(agentId) : [];
    const contextMessages = allMessages.filter((item) => item && item.includeInContext !== false);
    if (contextMessages.length < 4) {
      if (typeof onStatus === 'function') onStatus('Compaction skipped: not enough context messages');
      return { ok: true, skipped: 'too-few-messages' };
    }

    const chunkingPrompt = await loadPromptText('../prompts/context-compaction/chunking.prompt.md');
    const summarizePrompt = await loadPromptText('../prompts/context-compaction/summarize.prompt.md');
    const forgottenPrompt = await loadPromptText('../prompts/context-compaction/forgotten.prompt.md');

    const phase1Input = `${chunkingPrompt}\n\nConversation events:\n${formatEventsForPrompt(contextMessages)}`;
    if (typeof onStatus === 'function') onStatus('Compaction phase 1: chunking...');
    const phase1Reply = await requestCompletion({
      agentId,
      prompt: phase1Input,
      progressLabel: 'Compaction phase 1...',
    });

    const phase1Json = extractFirstJsonObject(phase1Reply);
    const ranges = normalizeChunkRanges(phase1Json);
    if (ranges.length < 2) {
      throw new Error('Compaction phase 1 failed: chunk ranges invalid or less than 2 chunks.');
    }

    const indexToPos = buildIndexMap(contextMessages);
    const segments = [];
    for (const range of ranges) {
      const startPos = indexToPos.get(range.start);
      const endPos = indexToPos.get(range.end);
      if (!Number.isInteger(startPos) || !Number.isInteger(endPos) || endPos < startPos) {
        throw new Error(`Compaction phase 1 produced invalid range: ${range.start}-${range.end}`);
      }
      segments.push({
        start: range.start,
        end: range.end,
        messages: contextMessages.slice(startPos, endPos + 1),
      });
    }

    const recycleFolder = getAgentRecycleFolder(agentId);

    for (let i = segments.length - 2; i >= 0; i -= 1) {
      const segment = segments[i];
      const segmentText = formatEventsForPrompt(segment.messages);

      if (typeof onStatus === 'function') onStatus(`Compaction phase 2: summarize chunk ${i + 1}/${segments.length - 1}...`);
      const phase2Input = `${summarizePrompt}\n\nSegment to compress:\n${segmentText}`;
      const summaryText = await requestCompletion({
        agentId,
        prompt: phase2Input,
        progressLabel: 'Compaction phase 2...',
      });

      if (typeof onStatus === 'function') onStatus(`Compaction phase 3: pickup forgotten details for chunk ${i + 1}...`);
      const phase3Input = `${forgottenPrompt}\n\nPhase 2 summary:\n${summaryText}\n\nOriginal segment:\n${segmentText}`;
      const forgottenText = await requestCompletion({
        agentId,
        prompt: phase3Input,
        progressLabel: 'Compaction phase 3...',
      });

      const recyclePath = `${recycleFolder}/${Date.now()}-${i}.md`;
      const forgottenPayload = String(forgottenText || '').trim() || '[empty-forgotten]';
      await writeFile(recyclePath, forgottenPayload);

      const replacementPayload = {
        summary: { text: String(summaryText || '').trim() },
        forgotten: recyclePath,
      };

      segment.messages = [{
        role: 'developer',
        text: `<COMPRESSED MEMORY>:\n${JSON.stringify(replacementPayload)}`,
        includeInContext: true,
      }];

      if (typeof onProgress === 'function') {
        onProgress({ type: 'chunk-compacted', chunk: i, recyclePath });
      }
    }

    const compactedContext = segments.flatMap((item) => item.messages);
    setMessagesByAgent(agentId, reindexMessages(compactedContext));

    if (typeof onStatus === 'function') onStatus('Compaction complete');
    return {
      ok: true,
      chunkCount: segments.length,
      compactedChunks: Math.max(0, segments.length - 1),
    };
  }

  return { run };
}
