# Example workflow

> This page gives a minimal example flow for trying ANGEL GUI from scratch. The goal is not to make the graph very complex immediately, but to let you go through one complete experience first: create a project → build a design graph → ask the agent to implement it → compile and run.

## Goal

We are going to make a very small sample project:

- The player appears at the center of the scene
- The player can move and turn
- Coins and enemies will spawn in the scene
- The player gains score by collecting coins
- Enemies make the player disappear when they touch the player
- After the player disappears, enemies leave the screen, and then the player is spawned again

## Step 1: Create a new `Default` project

First use:

- **File → New Project**

Create a new project and choose:

- `Default`

This avoids introducing too much extra structure at the beginning, which makes it better for a first trial.

## Step 2: Create the main node `Scene`

After entering the Graph, create a node and name it:

- `Scene`

Fill it with the following content:

```text
The window size is 960*540. At the beginning, the player is in the center of the screen.

Coins spawn in the scene, and the player can collect them to increase the score.

Enemies spawn in the scene, and touching the player ends the game.

Check once per second. If there are no coins, spawn one coin at a random position on the screen. If the coin count is below 3, there is a 20% chance to spawn one coin.

For every 3 coins the player collects, spawn one enemy at a random position outside the screen. Spawn rule: start from the center, choose a random angle uniformly between 0 and 360 degrees, then choose the nearest point on that direction's outward line that is at least 100 pixels away from the window boundary.

When an enemy touches the player, the player disappears. After the player disappears, enemies try to leave the screen. Once all enemies have left the screen, spawn the player again.
```

This node can be understood as the master scene rule set for the entire gameplay sample.

## Step 3: Create 3 child nodes inside it

Next, create three nodes inside the `Scene` node:

- `Player`
- `Coin`
- `Enemy`

### Node: Player

Fill it with:

```text
Draw a white isosceles triangle to represent the player. The base is 24 pixels wide and the height is 32 pixels.

The player rotates with the A/D keys at 180 degrees per second. Hold W to move forward at 300 pixels per second. Hold S to move backward at 100 pixels per second.
```

### Node: Coin

Fill it with:

```text
Visual: a yellow circle with radius 8 pixels
```

### Node: Enemy

Fill it with:

```text
Visual: a red rectangle

Speed is between 100 and 200 per second, moving toward the player. If the player does not exist, move off-screen toward the nearest boundary.

Width and height are between 16 and 40 pixels.

These three values are randomized when spawned and stay fixed afterward.
```

## Step 4: Create edge relationships

After the nodes are created, add two relationship edges.

### Edge: Enemy → Player

Set the relation to:

- `destroys`

Fill it with:

```text
When an enemy touches the player, the player disappears.
```

### Edge: Player → Coin

Set the relation to:

- `collects`

Fill it with:

```text
When the player touches a coin, the coin is collected.
```

At this point, you already have a minimal but complete design structure:

- A master scene rule set
- Object nodes
- Relationships between those objects

That is already enough to use as an agent implementation test.

## Step 5: Ask the programmer agent to implement it

Once the nodes and edges above are all ready, switch to **programmer** and say:

```text
Hello, I am trying out this software. I provided a sample project. Please implement it.
```

The purpose of this step is to let the programmer agent try to turn the Graph structure you just created into code.

## Step 6: Wait for the result

After sending the message, wait for the programmer agent to respond.

This step may not finish instantly, because it may need to:

- Read the current Graph structure
- Understand the rules expressed by the nodes and edges
- Organize where code should land
- Write into project files step by step

So the key point here is:

- Let it finish one implementation pass first
- Observe whether it can correctly understand the design structure you gave it

## Step 7: Compile and run through Execute

After the programmer agent finishes, use the top menu:

- **Execute**

First run:

- **Compile Project**

If compilation succeeds, continue with:

- **Run Project**

At that point, you have completed one full trial:

- Use Graph to write the design
- Use the agent to read and implement that design
- Use Execute to compile and run the result

That is the end point of this tutorial.

## What this example is meant to verify

If the whole flow works, it usually means:

- You now know how to create a basic project
- You now know how to express design with nodes and edges
- The programmer agent can read and use that design structure
- The local compile and run pipeline is basically working

In other words, if you can complete this example smoothly, you have already gone through a full first experience of ANGEL GUI's core workflow.

- Back to directory: (Back to Home)[home.md]
