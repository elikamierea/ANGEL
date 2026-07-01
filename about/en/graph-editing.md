# Node and edge editing (complete list of basic operations)

> This page acts as the main entry document for the Graph section, and also includes related notes about LOD, Auto Layout, box selection, dragging, and batch transforms.

## Before you start: what kind of system are you working with?

The Graph in ANGEL GUI is not just a whiteboard where you casually draw boxes and lines.

It is closer to a **structured system for long-term design storage**, used to gradually preserve ideas, relationships, implementation direction, and external resource references inside a project.

You can think of it roughly in the following layers:

### 1. Nodes

Nodes are mainly used to record a design unit or information unit.

For example, a node may represent:

- A gameplay idea
- A system module
- A character or object
- A task step
- A feature block that still needs to be implemented

A node itself can carry text information such as:

- `name`
- `synopsis`
- `detail`
- `status`

So a node is not just a graphic block. It is a carrier for project design information.

### 2. Edges

Edges are mainly used to express relationships between nodes.

For example, an edge may represent:

- A dependency relationship
- A calling relationship
- A process sequence
- A conceptual association
- A source of information or an influence path

So edges are not decorative lines. They are the main carrier of relationship semantics in the Graph.

### 3. `resourceBindings`

The Graph also supports linking nodes to external files through `resourceBindings`.

You can think of this as:

- Which piece of code corresponds to this node
- Which resource file is associated with this design item
- Where this concept ultimately lands in external implementation

This lets the design information inside the graph gradually connect to real project files, instead of staying only inside the diagram.

### 4. Why it works this way

The goal of this system is not just to help you understand things right now. It is also meant to:

- Preserve design information over time
- Visualize relationships inside complex projects
- Leave useful context for your future self
- Make it easier for agents to understand the current project state and continue collaborating

So from a usage point of view, the Graph is closer to:

- A **design information storage layer**
- A **relationship expression layer**
- An **intermediate layer for communicating with agents and carrying context forward**

## 1. View and navigation

- **MMB drag** or **RMB drag**: pan the view
- **Mouse wheel**: zoom around the mouse position
- **Reset View button**: return to the default view

## 2. Selection

### 1) Single-click selection

- **Left-click a node**: select a single node
- **Left-click an edge or an edge endpoint**: select an edge
- **Ctrl + Left-click a node**: add or remove the node from the current multi-selection (toggle)
- **Click empty space**: clear the selection

### 2) Box selection

- **Shift + Left-drag**: box-select and replace the current selection
- **Ctrl + Left-drag**: additive box selection, with hit nodes toggled
- **Ctrl + Shift + Left-drag**: currently behaves the same as additive selection, following the Ctrl path

Note: box selection already supports including **LOD hidden** nodes, to avoid missing them during batch operations on large graphs.

## 3. Creating nodes and edges

- **N + Left-drag**: create a node, with drag deciding the initial size
- **N + Left-click**: create a default-size node centered on the click position
- **C + Left-drag (starting from a node)**: create an edge
- **M + Left-drag (starting from a node)**: create a mirror node

## 4. Editing and transforms

- **Drag a node**: move the node, with multi-selected root nodes moving together
- **Drag a node edge or corner handle**: resize the node
- **Right-click while already multi-selected and hitting a selected node**: open the batch transform menu
  - Stretch
  - Rotate 90
  - Flip Horizontal
  - Layout (preview layout within the current selection set)
- **Transform preview session**:
  - `Enter` applies
  - `Esc` cancels

If the project graph is already getting large, it is worth learning box selection and batch transforms early. They make a very noticeable difference in efficiency.

## 5. LOD and visibility

The system decides how much detail to display based on the on-screen area of each node.

You can think of it simply like this:

- If a node is too small, it may enter `hidden`
- Slightly larger nodes show only simplified information
- Only after zooming in further do names and more details gradually appear

The purpose is not to hide information. It is to keep large graphs readable when zoomed out, instead of turning every line of text into visual noise at once.

So if nodes display different levels of detail at different zoom levels, that is usually normal behavior.

## 6. Auto Layout (ELK)

Auto Layout uses ELK to automatically organize node placement.

It is useful when:

- The graph is becoming too complex to lay out comfortably by hand
- You want to quickly organize the relationship graph into a cleaner structure
- You want a readable initial layout before doing manual fine-tuning

A common recommendation is:

- Try it on a local selection first
- Once the result looks acceptable, consider using it on a larger area

Automatic layout is usually good for organizing structure first, but it will not always match the final visual arrangement you want.

## 7. Keyboard shortcuts

- `Ctrl+Z` / `Ctrl+Y`: Undo / Redo
- `Ctrl+Shift+Z`: Redo (alternate path)
- `Ctrl+S`: Save
- `Ctrl+N`: New Project
- `Ctrl+1..4`: Switch Layer (`L0..L3`)
- `Ctrl+A`: Select all nodes
- `Ctrl+C` / `Ctrl+X` / `Ctrl+V`: Copy / Cut / Paste preview
- Release `V` while in paste preview mode: confirm paste
- `Delete` or `D`: delete the currently selected node or edge

## 8. Common Inspector fields

### Common node fields

- `name`
- `synopsis`
- `detail`
- `status`
- `color index`

### Common edge fields

- `relation`
- `label`
- `description`
- `path style`
- `stroke style`
- `arrow`

### Resource references

- Add or remove `resourceBindings` in the right-side panel

This is important, because it determines whether design items in the graph are actually linked to external files in a traceable way.

- Back to directory: (Back to Home)[home.md]
