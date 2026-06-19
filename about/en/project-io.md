# Creating and opening projects (Project I/O)

## New Project

When creating a new project, you pick a starting template. Templates differ by how much **scope** (structure and agents) is set up.

### Default

`Default` is the smallest starting point — a 2-layer setup with a single coding agent. It is better suited to workflows like these:

- You already have a basic design
- You do not want to build out a lot of upfront structure first
- You want to start writing game-layer code right away
- You care more about getting a minimal runnable loop working first

In other words, `Default` is oriented toward a workflow of **having a design, then moving directly into code**.

It is also a good choice for first-time local environment verification, because the path is shorter and has less overhead.

### Extended

`Extended` is a larger starting point — a 4-layer structure with design, orchestration, and coding agents. It is better suited to workflows like these:

- You already have an initial design
- You want to keep refining that design
- You want to plan the code structure and implementation steps first
- Then gradually move into actual coding

In other words, `Extended` is oriented toward a workflow of **organizing design and structure first, then moving into implementation**.

## What the project folder roughly looks like

After a new project is created, what you get is essentially a project directory. You can think of its structure roughly like this:

### 1. Graph-related information

Project data from the graph editor — such as nodes, edges, layers, and UI state — is stored in the project configuration file.

The current project format is organized as a **project directory + project configuration file**, and opening a project means selecting the project directory directly, then letting the GUI identify the project configuration inside it.

You can think of this part as:

- Graph structure data
- Editor state data
- GUI save data related to the current project

### 2. Code-related structure

The main code project lives in a standard project layout. The core parts usually include:

- `src/game/`: game-layer code, the main area for actual implementation
- `src/engine/`: lower-level engine code
- `src/platform/`: platform layer
- `vendor/`: third-party dependencies or libraries shipped with the template
- `tools/`: helper scripts or built-in tools shipped with the project

If you are just continuing day-to-day feature work, the directory you will usually touch most often is:

- `src/game/`

### 3. Where resource files live

Project resources currently live mainly under:

- `src/assets/sprites/`
- `src/assets/fonts/`
- `src/assets/audio/`
- `src/assets/other/`

So the simple mental model is:

- Sprite resources go in `sprites`
- Font resources go in `fonts`
- Audio resources go in `audio`
- Miscellaneous resources go in `other`

That is also why resource-related tools such as Create Sprite and Create Font usually end up writing back into these directories.

### 4. Agent-related information

If the project uses agent-side project memory / context files, they are usually organized in separate directories by agent.

You can think of this part as:

- Memory files for different agents
- Context materials used for session initialization

This is not ordinary game content, and it is not lower-level engine code either. It is closer to an auxiliary information layer used by agents inside the project.

## Open / Save / Save As

### Open

- **Open**: open an existing project
- The current workflow is to choose the project directory directly, rather than selecting one loose file

### Save

- **Save**: save the current project state
- This usually includes project data from the graph editor, as well as other saved data bound to the current project

### Save As

- **Save As**: save the current project to another location

## A practical way to think about it

If you just want a quick mental model for New Project / Open / Save, remember it like this:

- `Default`: better for **having a design and starting code immediately**
- `Extended`: better for **designing / refining / planning first, then implementing**
- Graph data is stored in the project configuration
- Code mainly lives under `src/`
- Resources mainly live under `src/assets/`
- Agent-related context is organized with the project, but belongs to a separate information layer

- Back to directory: (Back to Home)[home.md]
