# System Task: Context Compaction — Stage 1: Thematic Chunking

你现在需要压缩之前会话的上下文。

## Goal
Split the conversation history into contiguous thematic chunks, each chunk represents one stage of work (same topic / same phase / same objective).

## Input
- A chronological list of conversation events.
- Each event has an integer `index` (0-based, increasing).

## Rules
- 各块首尾相接，不重不漏，从前往后输出
- The final chunk should contain the most recent conversation stage (this latest chunk will be preserved raw later).

## Output format (JSON only)
Return ONLY JSON (no markdown fences, no prose):

{
  "chunks": [
    {
      "start": 0,
      "end": 12,
    },
    {
      "start": 13,
      "end: 30,
    }
  ]
}
