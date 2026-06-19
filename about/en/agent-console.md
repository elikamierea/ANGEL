# Agent Console and tool calls

The Agent Console is the place where you collaborate directly with the built-in agent.

From a practical point of view, you do not need to understand the entire internal orchestration of the agent system before using it. What matters more is:

- How to talk to it
- What to ask it to do
- How to judge whether it can handle the task well right now
- How to understand its capability boundaries

## What to treat it as first

The most practical mental model is usually this:

- It is not just a chat box
- It is not a magic button where one sentence always finishes the whole task perfectly
- It is better understood as a **collaborative assistant that can read project context, understand the current design, and try to use tools to carry out tasks**

So what suits it best is not a huge vague wish, but instead:

- A clear goal
- A clear scope
- A clear first step you want it to prioritize

## How users should interact with the agent

### 1. Make the task as concrete as possible

Compared with saying:

- "Make this project good"

A more suitable request is usually something like:

- "Help me refine the detail field of this node first, and add one relationship edge to the combat system"
- "Read the related code under `src/game` and tell me where this design item currently lands"
- "Do not write code yet. Just summarize which nodes are still missing in this graph"

In other words, **the clearer the task boundary, the more stable the result usually becomes**.

### 2. Break larger tasks into steps

If the task is not small, it is usually better to split it into multiple steps yourself.

For example, instead of saying:

- "Finish this gameplay feature from design to code to resources"

A more stable approach is:

1. First analyze what is missing in the current graph
2. Then add the missing nodes and edges
3. Then locate which code files are likely involved
4. Only after that start writing the implementation itself

The benefit is:

- It is easier for you to check whether each step is drifting off course
- It is harder for the agent to confuse its own target during a long task

### 3. Explicitly say what it should do first, and what it should not do yet

This is often extremely helpful.

For example:

- "Analyze first. Do not modify files yet"
- "Only modify the Graph first. Do not touch the code"
- "Read the current implementation first, then give me a modification plan"
- "List which files you would change first. Wait for confirmation before editing"

This makes the interaction more controllable and is much better for project-style work.

## What you can reasonably expect it to do

At the moment, the agent is best suited to things roughly like these:

### 1. Understanding and organizing design information

For example:

- Explaining what a design block in the current graph means
- Helping you refine node details
- Suggesting missing nodes, relationships, or structures
- Summarizing the current design state from the existing graph

### 2. Querying and modifying the Graph

For example:

- Finding nodes, edges, and their relationships
- Adding, deleting, or updating nodes and edges
- Adjusting part of the graph structure
- Filling in design information through Inspector-related fields

### 3. Reading and modifying project files

For example:

- Checking which files already contain a given implementation
- Making localized modifications to existing code
- Adding game-layer content based on the design
- Helping land design information from the graph into project files step by step

### 4. Using some tool capabilities

For example:

- Reading files or images inside the project
- Doing structured processing through tools
- Triggering some layout, resource, or execution-related capabilities

So its value is not just answering questions. Its value is also **doing real work inside project context**.

## What you should not expect too much from

The agent can do a lot, but it should not be understood as a fully automatic project completer.

If expectations are too high in the following areas, disappointment becomes much more likely.

### 1. Do not assume it will finish a large task perfectly in one shot

Especially for things involving:

- A large amount of context
- Multi-file changes
- Simultaneous coordination across graph, code, and resources
- Tasks that require aesthetic or product judgment from you

A more realistic expectation is usually:

- It can move the work forward
- It can complete a substantial amount of mechanical and structured work
- But it still needs your correction and direction

### 2. Do not assume it fully understands your unstated intent

If you already have a detailed idea in your head but never actually say it, the agent may not guess it correctly.

The following things are especially worth stating explicitly:

- Which style you want to prioritize
- Whether this step is more design-oriented or implementation-oriented
- Whether you want conservative modification or bold restructuring
- Which areas should not be touched for now

### 3. Do not assume it can cross every capability boundary at no cost

For example:

- Its understanding of the current session context is not unlimited
- Its tolerance for provider switching or model behavior differences is limited
- Some complex results are still influenced by model stability itself
- Some tasks are better split smaller instead of being pushed in all at once

## One very important boundary: it is good at collaborative progress, not at replacing all of your judgment

The agent is relatively good at:

- Helping you structure things
- Helping you execute things
- Helping you search for things
- Helping push structured work forward

But it is not naturally good at making all higher-level decisions for you, such as:

- Final product tradeoffs
- Whether direction A or B is the right one
- Which expression best matches your long-term aesthetic
- Which complex change is worth doing right now

Those are usually still decisions that need you to make the final call.

## A stable way to use it

If you want the Agent Console to feel smoother and more reliable, a stable workflow is usually:

1. State the current goal first
2. Then restrict the scope of this round
3. Ask it to analyze first, or list a plan first
4. Once you confirm the direction is not drifting, let it execute the modification
5. After one chunk is done, move on to the next step

This is usually much more stable than throwing in one very long instruction and hoping the whole thing comes out right.

## What to do if the result is not ideal

If the result feels wrong, the usual priorities are:

- Shrink the task scope
- State exactly what this step should do
- Add missing context
- Point out what does not match expectations
- Ask it to continue repairing the current result instead of restarting from scratch

Compared with simply saying "this is wrong," more effective phrasing is usually:

- "This direction drifted. I want a more conservative change"
- "Do not write code yet. Just list which files you are going to touch"
- "Only handle the Graph part. Leave the code alone for now"
- "Keep the current structure. Only add the missing nodes and edges"

## A practical conclusion

The healthiest expectation for the Agent Console is usually:

- It can be a collaborator that understands project context
- It can help you complete a lot of structured work
- It can bridge design, Graph, files, and tools
- But it still needs you to provide direction, make judgments, and do final review

If you treat it as **a collaborative assistant that can do work**, it is usually much more useful than treating it as a fully automatic black box.

- Back to directory: (Back to Home)[home.md]
