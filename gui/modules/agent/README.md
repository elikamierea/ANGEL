# Agent Loop README

> Scope: `project_folder/code/gui/modules/agent/*`
> 
> Goal: document **current** end-to-end agent loop behavior and implementation details for future refactor/debug work.

---

## 1) High-level loop (what happens on each user request)

1. UI captures user input/images in `agent-chat-ui-shell.js`
2. Message is appended to timeline via `pushAgentMessage(..., 'user', ...)`
3. Runtime entry `requestDefaultModelCompletion(...)` in `agent-runtime.js`
4. Runtime loads prompt layers:
   - system prompt by agent id
   - suffix prompt
   - optional humanize prompt
5. Runtime builds canonical conversation via `buildCanonicalConversation(...)`
6. Provider adapter builds provider payload (`responses` or `chat` style)
7. Model returns text / tool calls
8. Tool loop executes mapped functions (`agent-functions.js`)
9. Tool results are fed back to model until stop condition
10. Final text + traces are pushed to timeline and rendered

---

## 2) Core modules and responsibilities

## `agent-chat-ui-shell.js`
- Owns chat UI interactions (send/save memory/compress/export etc.)
- Uses `pushAgentMessage` wrapper to mutate chat state
- Handles progress/status text and display
- Save Memory button injects a system-style instruction message with role **developer**
- Compaction button triggers `agentContextCompactionManager.run(agentId)`

## `agent-chat-state.js`
- Stores per-agent timeline/messages
- `pushAgentMessage(...)` assigns message metadata (role/text/images/includeInContext/index)
- Source of truth for in-memory conversation state

## `agent-runtime.js`
- Main orchestration layer
- Loads prompt assets (system/suffix/humanize) with cache
- Builds canonical conversation from timeline + new user input
- Runs provider requests + iterative tool loop
- Emits progress/status callbacks
- Handles image attach turns during tool loop continuation

## `agent-provider-adapters.js`
- Converts canonical turns into provider-specific request format
- Normalizes roles for OpenAI-style responses/chat payloads
- Builds final payload shape (`buildOpenAIResponsesPayload`, etc.)
- Supports `developerPrompt` injection (currently mapped as system-side turn)

## `agent-responses-core.js`
- Shared response parsing and output normalization
- Converts provider response to unified text/tool/debug structure

## `agent-functions.js`
- Function map exposed to model/tool loop
- Bridges tool names -> concrete runtime actions (read/write/edit/graph ops/etc.)

## `agent-tool-runtime.js`
- Tool-call execution runtime (call id, round handling, outputs)

## `agent-tool-context.js`
- Shared query/context helpers for tool prompts and handlers

## `agent-memory-preload.js`
- On project open/new project: preload per-agent memory files
- Pushes `MEMORY LOAD ...` synthetic messages into timeline with role **developer**
- Emits read traces and missing-file behavior

## `agent-context-compaction.js`
- Context compaction manager (phase1 chunking -> phase2 summary -> phase3 forgotten)
- Loads prompt files under `code/prompts/context-compaction/`
- Replaces old chunks with `<COMPRESSED MEMORY>` payload
- Current replacement role: **developer**
- Writes forgotten artifacts to agent recycle path

## `agent-model-settings-ui.js`
- UI for provider/model/method settings
- Persists model options used by runtime

## `agent-prompt.js`
- Legacy/simple prompt builder helpers
- Not the sole runtime authority once full runtime/provider path is used

---

## 3) Role semantics (current)

- `user`: real user input text/images from UI
- `assistant` / `agent`: model outputs
- `thinking`: transient progress stream (usually `includeInContext: false`)
- `developer`: synthetic control/context messages injected by system logic
  - memory preload events
  - save-memory injected instruction
  - compaction replacement entries
- `system`: top-level system prompt turn in canonical conversation

Note: In canonical mapping, `developer` timeline entries are currently normalized to system-side behavior in provider adapter.

---

## 4) Prompt layering details

Prompt sources are loaded in runtime:
1. System prompt (agent-specific file)
2. Suffix prompt (agent-specific file)
3. Humanize prompt (optional by settings)

Current behavior:
- suffix + humanize are combined into `developerPrompt`
- `developerPrompt` is injected as a system-side turn before latest user turn
- user raw input remains in `userPrompt` (no longer concatenated with suffix/humanize)

---

## 5) Tool loop details

- Runtime inspects model outputs for function calls
- Executes matching function from `agent-functions.js`
- Captures structured tool trace (arguments/results/errors)
- Feeds tool outputs back to model for subsequent rounds
- Stops when model returns final text or no further calls

Practical implications:
- Missing function name -> `Unknown tool` error payload
- Bad JSON args -> validation error payload
- Tool exceptions -> serialized error in loop, not silent drop

---

## 6) Memory-related flows

## A) Project open / new project preload
- `loadAgentMemoriesForActiveProject(...)` reads configured files
- For each file: trace read result, then inject `MEMORY LOAD` message (developer role)
- Missing files are non-fatal and surfaced as `[file not found]`

## B) Save Memory action
- Button loads prompt from `SAVE_MEMORY_PROMPT_PATH` (fallback inline prompt)
- Injects formatted instruction into timeline as **developer**
- Runs normal completion flow to let model use tools and update memory files

## C) Context compaction
- Phase 1: chunking prompt -> JSON ranges
- Phase 2: summarize selected chunk
- Phase 3: forgotten-details pickup
- Replace compacted chunk with `<COMPRESSED MEMORY>` JSON payload (developer role)

---

## 7) Context inclusion rules

- Timeline messages can mark `includeInContext: false`
- Provider adapter filters them out when building history
- `thinking` updates are generally excluded to reduce token waste
- Reindexing occurs after compaction rewrite

---

## 8) Known sensitive points / refactor risk

1. Role normalization mismatch (timeline role vs provider role)
2. Prompt injection order (system/developer/user ordering affects behavior)
3. Compaction range integrity (index map/range validity)
4. Tool-loop continuation across rounds
5. UI/status spam from progress events
6. Missing-file memory preload observability and noise balance

---

## 9) Fast file map for debugging

- UI trigger path: `agent-chat-ui-shell.js`
- Runtime orchestrator: `agent-runtime.js`
- Payload builder: `agent-provider-adapters.js`
- Response parser: `agent-responses-core.js`
- Tool bindings: `agent-functions.js`
- Compaction: `agent-context-compaction.js`
- Memory preload: `agent-memory-preload.js`
- State store: `agent-chat-state.js`

---

## 10) Suggested next docs (optional)

- `README.compaction.md`: deep-dive on phase1/2/3 contracts and schemas
- `README.roles.md`: exact role mapping table per provider
- `README.tool-loop.md`: round-by-round lifecycle and stop conditions

---

Last updated: 2026-05-06
