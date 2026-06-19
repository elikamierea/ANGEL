# Layer system

Layers are used to express levels of information expansion.

They are not just simple visibility toggles. They are closer to a way of controlling, within the same graph structure:

- How much detail you are currently looking at
- Which level of information you are currently editing
- Which abstraction level certain design content should live on

## How Layers roughly work

A common way to understand them is:

- Lower layers are more abstract and more skeletal
- Higher layers are more expanded and more specific

In practice, the currently active layer usually affects:

- Visible scope
- Editable scope
- The level of detail currently shown for some nodes

## Not every project necessarily uses exactly the same layer depth

There is one point here that deserves special emphasis:

**Not every project needs to use exactly the same Layer complexity.**

A rough practical model is:

### 1. Four-layer mode

Some projects use the more complete four-layer structure, usually:

- `L0`
- `L1`
- `L2`
- `L3`

This mode is more suitable when:

- The graph structure is more complex
- The design needs more stages of expansion
- You want finer separation between levels of information

### 2. Simplified mode

Other projects may use Layers in a more simplified, two-level way.

This mode is more suitable when:

- The project itself is smaller in scope
- The design does not need to be split into many layers
- You want to move into direct implementation quickly instead of maintaining a lot of abstraction

So in real projects, the **existence** of Layers is consistent, but **how finely you use them** can differ.

## Usage suggestions

If this is your first time using Layers, the most practical way to understand them is usually:

- Treat them as levels of information expansion first
- Do not get stuck trying to define every layer too theoretically at the beginning
- Decide whether to use all four layers or a more simplified style based on the complexity of the project

If your project is large and has many design relationships, four layers can help a lot. If the project is more direct and faster-moving, a simplified usage style is often completely fine too.

## Quick switching

Common shortcut:

- `Ctrl+1..4`: switch Layer (`L0..L3`)

- Back to directory: (Back to Home)[home.md]
