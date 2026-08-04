# 项目守则（对所有 coding agent 生效）

本项目基于 ANGEL 引擎模板：引擎文档都在 `reference/engine/` 下——`reference/engine/README.md` 是总览，各 `reference/engine/MANUAL_*.md` 是对应模块的**权威使用文档**。

- **Manual-first**：写代码前查对应 MANUAL，按其说明与示例直接实现。不要为了"确认 API 行为"去翻 `src/engine` 源码。
- 仅当下列情况之一成立时才读 `src/engine`，且只读与问题直接相关的最小范围：
  1. MANUAL 完全没有覆盖所需功能；
  2. 严格按 MANUAL 写出的代码，实际行为与文档描述不符；
  3. 追查深入引擎内部的崩溃或未定义行为。
- 因 MANUAL 缺漏而翻过源码后，把结论补记进你的记忆文件，避免重复翻阅。
- 除非明确知道自己在做什么，不要修改 `src/engine`；游戏代码写在 `src/game`，资源放在 `src/assets`。
