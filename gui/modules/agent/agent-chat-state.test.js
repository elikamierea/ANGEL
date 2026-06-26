import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentChatStateManager } from './agent-chat-state.js';

test('initial state has canonical/messages per agent and no toolTraceByAgent', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }, { id: 'b' }] });
  assert.deepEqual(Object.keys(mgr.state.canonicalByAgent).sort(), ['a', 'b']);
  assert.deepEqual(mgr.state.canonicalByAgent.a, { turns: [] });
  assert.deepEqual(mgr.state.messagesByAgent.a, []);
  assert.equal(mgr.state.toolTraceByAgent, undefined);
});

test('appendCanonicalTurns normalizes and indexes turns', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  mgr.appendCanonicalTurns('a', [{ role: 'user', text: 'hi' }]);
  const turns = mgr.buildCanonicalTurns('a');
  assert.equal(turns.length, 1);
  assert.equal(turns[0].role, 'user');
  assert.equal(turns[0].text, 'hi');
  assert.equal(turns[0].index, 0);
});

test('appendCanonicalAssistantText merges into a trailing assistant turn', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  mgr.appendCanonicalAssistantText('a', 'Hello');
  mgr.appendCanonicalAssistantText('a', ' world');
  const turns = mgr.buildCanonicalTurns('a');
  assert.equal(turns.length, 1);
  assert.equal(turns[0].role, 'assistant');
  assert.equal(turns[0].text, 'Hello world');
});

test('appendCanonicalAssistantText starts a new turn after a non-assistant turn', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  mgr.appendCanonicalTurns('a', [{ role: 'user', text: 'hi' }]);
  mgr.appendCanonicalAssistantText('a', 'hello');
  const turns = mgr.buildCanonicalTurns('a');
  assert.equal(turns.length, 2);
  assert.equal(turns[1].role, 'assistant');
  assert.equal(turns[1].text, 'hello');
});

test('patchLastCanonicalTurn patches the matching turn searching from the end', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  mgr.appendCanonicalTurns('a', [
    { role: 'user', text: 'hi' },
    { role: 'assistant', text: 'hello' },
  ]);
  const ok = mgr.patchLastCanonicalTurn('a', { providerId: 'openai' }, (item) => item.role === 'assistant');
  assert.equal(ok, true);
  const turns = mgr.buildCanonicalTurns('a');
  assert.equal(turns[1].providerId, 'openai');
  assert.equal(turns[0].providerId, '');
});

test('resetAgents clears canonical/messages state for the new agent set', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  mgr.appendCanonicalTurns('a', [{ role: 'user', text: 'hi' }]);
  mgr.resetAgents([{ id: 'b' }]);
  assert.deepEqual(mgr.state.canonicalByAgent, { b: { turns: [] } });
  assert.deepEqual(mgr.state.messagesByAgent, { b: [] });
  assert.equal(mgr.state.toolTraceByAgent, undefined);
});

test('restoreAgentSession (v2) restores canonical turns and derives ui timeline by dropping tool_output', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  const payload = {
    canonical: {
      turns: [
        { role: 'user', text: 'hi' },
        { role: 'function_call', call_id: 'c1', name: 'read_file', arguments: '{}' },
        { role: 'tool_output', call_id: 'c1', name: 'read_file', output: '{"ok":true}' },
        { role: 'assistant', text: 'done' },
      ],
    },
  };
  const ok = mgr.restoreAgentSession('a', payload);
  assert.equal(ok, true);

  const turns = mgr.buildCanonicalTurns('a');
  assert.equal(turns.length, 4);

  assert.deepEqual(mgr.state.messagesByAgent.a.map((t) => t.role), ['user', 'function_call', 'assistant']);
});

test('canonical turns preserve nested providerMeta (thinking/reasoning) across save+restore', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  const rawContent = [
    { type: 'thinking', thinking: 'reasoning', signature: 'sig-abc' },
    { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'a.txt' } },
  ];
  mgr.appendCanonicalTurns('a', [
    { role: 'function_call', call_id: 'toolu_1', name: 'read_file', arguments: '{"path":"a.txt"}', providerId: 'anthropic', providerMeta: { anthropic: { toolUseId: 'toolu_1', responseId: 'msg_1', assistantContent: rawContent } } },
  ]);

  // "Save": buildCanonicalTurns is what gets serialized into session.json.
  const saved = mgr.buildCanonicalTurns('a');
  assert.deepEqual(saved[0].providerMeta.anthropic.assistantContent, rawContent);
  // It must be a clone, not a shared reference into live state.
  assert.notEqual(saved[0].providerMeta.anthropic.assistantContent, rawContent);

  // "Reopen": round-trip through JSON then restore into a fresh manager.
  const payload = JSON.parse(JSON.stringify({ canonical: { turns: saved } }));
  const fresh = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  fresh.restoreAgentSession('a', payload);
  const restored = fresh.buildCanonicalTurns('a');
  assert.deepEqual(restored[0].providerMeta.anthropic.assistantContent, rawContent);
  assert.equal(restored[0].providerMeta.anthropic.responseId, 'msg_1');
});

test('restoreAgentSession (v2) uses explicit ui.timeline when provided', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  const payload = {
    canonical: { turns: [{ role: 'user', text: 'hi' }] },
    ui: { timeline: [{ role: 'user', text: 'hi (display)' }] },
  };
  mgr.restoreAgentSession('a', payload);
  assert.equal(mgr.state.messagesByAgent.a.length, 1);
  assert.equal(mgr.state.messagesByAgent.a[0].text, 'hi (display)');
});

test('restoreAgentSession (legacy) builds canonical turns from the payload, not stale live state', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });

  // Populate stale in-memory state that must NOT leak into the restored canonical.
  mgr.appendCanonicalTurns('a', [{ role: 'user', text: 'STALE' }]);
  mgr.pushAgentMessage('a', 'user', 'STALE');

  const payload = {
    timeline: [
      { role: 'user', text: 'restored question' },
      { role: 'assistant', text: 'restored answer' },
    ],
    tools: [
      { tool: 'read_file', call_id: 'c1', arguments: '{"path":"a.txt"}', result: { ok: true, result: 'content' } },
    ],
  };
  const ok = mgr.restoreAgentSession('a', payload);
  assert.equal(ok, true);

  const turns = mgr.buildCanonicalTurns('a');
  assert.ok(!turns.some((t) => t.text.includes('STALE')));
  assert.equal(turns.length, 3);
  assert.equal(turns[0].text, 'restored question');
  assert.equal(turns[1].text, 'restored answer');
  assert.equal(turns[2].role, 'tool_output');
  assert.equal(turns[2].call_id, 'c1');
  assert.equal(turns[2].name, 'read_file');

  assert.equal(mgr.state.messagesByAgent.a.length, 2);
  assert.ok(!mgr.state.messagesByAgent.a.some((m) => m.text.includes('STALE')));
});

test('restoreAgentSession returns false for an unknown agent', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  assert.equal(mgr.restoreAgentSession('unknown', { canonical: { turns: [] } }), false);
});

test('getAgentTodos starts empty and setAgentTodos normalizes items', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  assert.deepEqual(mgr.getAgentTodos('a'), []);

  const result = mgr.setAgentTodos('a', [
    { content: 'first', status: 'pending' },
    { content: 'second', status: 'bogus-status' },
    { content: '  ', status: 'completed' },
    { content: 'third', status: 'completed' },
  ]);

  assert.deepEqual(result, [
    { content: 'first', status: 'pending' },
    { content: 'second', status: 'pending' },
    { content: 'third', status: 'completed' },
  ]);
  assert.deepEqual(mgr.getAgentTodos('a'), result);
});

test('setAgentTodos ignores non-array input and unknown agents', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  assert.deepEqual(mgr.setAgentTodos('a', 'not-an-array'), []);
  assert.deepEqual(mgr.getAgentTodos('a'), []);
  assert.deepEqual(mgr.setAgentTodos('unknown', [{ content: 'x', status: 'pending' }]), [{ content: 'x', status: 'pending' }]);
  assert.deepEqual(mgr.getAgentTodos('unknown'), []);
});

test('resetAgents clears todosByAgent for the new agent set', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  mgr.setAgentTodos('a', [{ content: 'x', status: 'pending' }]);
  mgr.resetAgents([{ id: 'b' }]);
  assert.deepEqual(mgr.state.todosByAgent, { b: [] });
});

test('resetAgentCanonical clears turns for the target agent only', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }, { id: 'b' }] });
  mgr.appendCanonicalTurns('a', [{ role: 'user', text: 'hello' }]);
  mgr.appendCanonicalTurns('b', [{ role: 'user', text: 'world' }]);
  mgr.resetAgentCanonical('a');
  assert.deepEqual(mgr.buildCanonicalTurns('a'), []);
  assert.equal(mgr.buildCanonicalTurns('b').length, 1);
});

test('resetAgentCanonical leaves messagesByAgent intact', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  mgr.pushAgentMessage('a', 'user', 'hi');
  mgr.appendCanonicalTurns('a', [{ role: 'user', text: 'hi' }]);
  mgr.resetAgentCanonical('a');
  assert.deepEqual(mgr.buildCanonicalTurns('a'), []);
  assert.equal(mgr.state.messagesByAgent.a.length, 1);
});

test('resetAgentCanonical is a no-op for unknown agents', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  assert.doesNotThrow(() => mgr.resetAgentCanonical('unknown'));
});

test('restoreAgentSession restores todos from the payload', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  const payload = {
    canonical: { turns: [{ role: 'user', text: 'hi' }] },
    todos: [{ content: 'do the thing', status: 'in_progress' }],
  };
  mgr.restoreAgentSession('a', payload);
  assert.deepEqual(mgr.getAgentTodos('a'), [{ content: 'do the thing', status: 'in_progress' }]);
});

test('setAgentTodos preserves blocked status without normalizing to pending', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  const result = mgr.setAgentTodos('a', [
    { content: 'waiting on API key', status: 'blocked' },
    { content: 'do something else', status: 'pending' },
  ]);
  assert.deepEqual(result, [
    { content: 'waiting on API key', status: 'blocked' },
    { content: 'do something else', status: 'pending' },
  ]);
});

test('setAgentTodos still maps unknown statuses to pending after blocked was added', () => {
  const mgr = createAgentChatStateManager({ initialAgents: [{ id: 'a' }] });
  const result = mgr.setAgentTodos('a', [
    { content: 'task A', status: 'stuck' },
    { content: 'task B', status: 'blocked' },
    { content: 'task C', status: 'completed' },
  ]);
  assert.deepEqual(result, [
    { content: 'task A', status: 'pending' },
    { content: 'task B', status: 'blocked' },
    { content: 'task C', status: 'completed' },
  ]);
});
