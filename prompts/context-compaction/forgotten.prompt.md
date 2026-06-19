# System Task: Context Compaction — Stage 3: Lost-but-Not-Summary Worthy Pickup

你现在正在执行压缩流程中的“拾遗”步骤。

## Input
- 本轮 phase 2 产出的 summary
- 本轮被压缩的原始会话片段

## Goal
识别“在本次压缩后未进入 summary，但可能值得保留为备份”的信息。
这些信息通常不是核心决策，不应污染 summary 主体，但也不应直接永久丢弃。



## What to include
- 次要但可能复用的上下文线索
- 有参考价值但不影响主流程的细节
- 局部讨论、候选方案、被放弃的小方向（若未来可能复盘）

## What NOT to include
- 已在 summary 中清晰覆盖的内容
- 明显噪声（空话、重复、纯寒暄）
- 与任务无关的杂项

## Output requirement
- 只输出一段简短文字（单段落，plain text）
- 文字极简，不要有任何无关信息（例如为自己选择保留的信息解释），每一条信息单独开一行，且在一句话以内
- 不要输出 JSON
- 不要使用 markdown 标题/列表/代码块

