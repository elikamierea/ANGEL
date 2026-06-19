# Execute and run (Execute)

The Execute menu is mainly responsible for compiling, running, and testing the current project.

## How these project outputs are produced

The game produced by the current project is not created from scratch as a completely new engineering setup every time.

A more accurate way to think about it is that it works on top of a **fixed C++ project template**:

- There is already a prebuilt engineering structure underneath
- That includes the engine layer, platform layer, resource directories, build configuration, and basic entry points
- During actual project development, the **coding agent** mainly keeps adding and modifying content inside this template based on the existing design

You can think of it like this:

- The template provides the stable skeleton
- The design decides what should be built
- The coding agent gradually lands that design into the skeleton

So in day-to-day use, `Compile / Run / Test` is not just about compiling a pile of handwritten code. It is more like verifying:

- Whether the current design has been successfully turned into code
- Whether the content written by the agent is compatible with the template structure
- Whether the local build environment is healthy

## What the Execute menu contains

- **Compile Project**: compile the project
- **Run Project**: run the project
- **Run Project (Debug)**: run in debug mode
- **Run Test**: run a specific test

The recommended order is usually:

1. **Compile** first
2. Then **Run**
3. If you have a specific validation target, use **Test** after that

This makes it easier to separate build failures from runtime failures.

## What Compile is verifying

A successful compile usually means at least the following:

- The current project code structure is basically complete
- The template project itself has not been broken
- The local compile pipeline is available
- The agent's recent code changes did not immediately break the build

So when you first open a new project, or right after a larger round of agent edits, `Compile` is often the most important first step.

## Common compile failures and how to start checking them

A compile failure does not necessarily mean the whole project is broken. In many cases, only one layer has a problem. Below are some of the more common categories.

### 1. The code produced by the Provider / Agent has problems

For example:

- The generated code has incomplete syntax
- Function names, type names, or header references do not match
- Different edits are not aligned with each other

This kind of issue usually looks like:

- The compiler reports direct C++ syntax errors
- A symbol / type / include cannot be found
- Errors start suddenly after one recent agent change

You can try:

- Reviewing what the agent changed in the most recent round
- Starting from the very first compile error instead of getting distracted by later cascading errors
- Fixing the earliest and most fundamental problem first

### 2. The project structure or file placement is wrong

For example:

- A file was written into the wrong place
- Newly added code does not line up with the template's existing structure
- Resource paths, header paths, or source organization do not match the project layout

This kind of issue usually looks like:

- Broken include paths
- Missing source files or resource files
- Something was clearly written, but the build pipeline is not picking it up correctly

You can try:

- Checking whether the relevant files are in the expected directories
- Checking whether path references match the project structure
- Checking whether the changes landed in the correct project layer instead of drifting into the wrong area

### 3. The local build environment has problems

For example:

- CMake or the compiler environment is incomplete
- Build tools are unavailable
- Local dependencies or toolchain state is broken

This kind of issue usually looks like:

- The configure stage fails before real compilation even starts
- Toolchain errors appear before the actual build begins
- Multiple projects fail to compile, rather than one single project being special

You can try:

- First separating whether this is a project code problem or an environment problem
- If even a minimal project fails to compile, suspect the environment first
- Going back through the minimal verification flow in Quick Start

## Run and debug

### Run Project

`Run Project` is used to directly launch the current project.

It is useful in situations like:

- Compilation just succeeded and you want to see the current result immediately
- You want to quickly confirm that the program can start normally
- You want to check whether the latest design or code changes caused obvious behavior changes

### Run Project (Debug)

`Run Project (Debug)` is better when you are investigating runtime issues, such as:

- The project compiles, but the startup behavior is wrong
- You want to inspect logs, state, or execution flow more closely
- You want to distinguish between "compile-time is fine" and "runtime logic is wrong"

### Run Test

`Run Test` is useful when you already know which test target you want to validate.

Compared with running the entire project directly, it is more focused and is better for:

- Verifying a single test name
- Reproducing a specific problem
- Narrowly checking one module or scenario

## A practical suggestion

If you just finished one round of changes, the safest order is usually:

1. **Compile** first
2. If compile succeeds, **Run** next
3. If runtime behavior is wrong, then consider **Debug / Test**

If `Compile` does not pass yet, do not rush to look at runtime behavior first. Solving the earliest build errors first is usually much more efficient.

- Back to directory: (Back to Home)[home.md]
