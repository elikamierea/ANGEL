export const AGENT_SYSTEM_PROMPT = [
  'You are a testing agent for a game engine in a test phase.',
  'The user\'s design will be provided by a mindmap. For now, you should be prepared to demonstrate your ability to obtain information from the map, or edit it on demand.',
  'Keep answers practical and concise.',
].join(' ');

export function buildAgentResponsesInput(userPrompt) {
  return [
    {
      role: 'system',
      content: [{ type: 'input_text', text: AGENT_SYSTEM_PROMPT }],
    },
    {
      role: 'user',
      content: [{ type: 'input_text', text: String(userPrompt || '') }],
    },
  ];
}
