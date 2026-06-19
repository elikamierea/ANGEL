# Angel Engine (Spec v0.1 Implementation)

A modular C++17 2D engine with a GLFW platform layer, OpenGL 3.3 renderer, deferred-destroy instance model, PCM-driven audio playback, and agent-friendly test/debug hooks.

## Directory Layout

```text
workplace/
├── CMakeLists.txt
├── README.md
├── MANUAL.md                      # index into the split manuals
├── MANUAL_lifecycle.md
├── MANUAL_debug_helpers.md
├── MANUAL_object_instances.md
├── MANUAL_resources_sprites.md
├── MANUAL_renderer_draw_api.md
├── MANUAL_shaders.md
├── MANUAL_game_entry.md
├── MANUAL_audio.md
├── MANUAL_platform.md
├── MANUAL_compatibility.md
├── src/
│   ├── engine/
│   │   ├── base/
│   │   ├── clock/
│   │   ├── debug/
│   │   ├── draw/
│   │   ├── general/
│   │   ├── instance/
│   │   └── utils/
│   ├── game/
│   ├── platform/
│   └── main.cpp
├── vendor/
└── build/
```

## Object System

Angel Engine uses a lightweight runtime object model built around `ObjectGrandBase`:

- live objects usually derive from `engine::base::ObjectGrandBase` (or the convenience subclass `engine::base::ObjectBase`) and participate in one step pass and one draw pass per frame, typically by overriding a shape like:
  ```cpp
  class Player : public engine::base::ObjectGrandBase {
  public:
      std::type_index __GetTypeIndex__() const override { return typeid(Player); }
      void __Step__() override { /* per-frame logic */ }
      void __Draw__() override { /* optional rendering */ }
  };
  ```
- instances are tracked by runtime type
- gameplay-managed objects should normally be created with `create_instance<T>(...)` and destroyed with `destroy_instance(...)`
- destruction is deferred through a destroy queue instead of immediate deletion
- typed gameplay queries are available (`instances_of_type<T>()`, etc.)

This is the core gameplay model of the engine, so read this first if you are working on game logic:

- object model / lifetime / queries → `MANUAL_object_instances.md`

## Build

In `project/`:

```powershell
cmake --preset ninja-release
cmake --build --preset build-ninja-release
```

Output binary:

- `build-ninja/game.exe`

## Runtime Summary

- Single GLFW window + OpenGL 3.3 context
- Per-frame step/draw loop via `engine::clock::FrameRunner`
- Deferred destruction after the step pass
- Lightweight surface-oriented fragment shader effects are available for small local visual effects
- Runtime asset lookup order:
  1. `assets.pak`
  2. `assets/` directory

See:
- lifecycle → `MANUAL_lifecycle.md`
- resources/sprites → `MANUAL_resources_sprites.md`
- renderer/draw API → `MANUAL_renderer_draw_api.md`
- shader effects → `MANUAL_shaders.md`

## Testing / Automation

- `--test <name>` routes startup into `src/game/game_test.cpp` via `__GameTest__(name)`.
- `--turbo` keeps the normal window/context path but uses synthetic timing for automation runs.
- `--record` records the startup random seed, keyboard transitions, mouse-button transitions, per-frame mouse position, and non-zero scroll deltas, then writes `record.txt` into the executable working directory when the program exits.
- `--debug` enables debug logging only. It does **not** disable screenshots, ScenarioRunner automation, or `--turbo` when omitted.

Scenario details, file format, and recording compatibility live in:
- `MANUAL_game_entry.md`
- `MANUAL_debug_helpers.md`

## Topic Index

Use the split manuals for targeted lookup:

- Lifecycle / timing / input / cursor / random seed → `MANUAL_lifecycle.md`
- Screenshots and debug logging behavior → `MANUAL_debug_helpers.md`
- ResourceManager and sprite path contract → `MANUAL_resources_sprites.md`
- Draw API / surfaces / text / sprite structures → `MANUAL_renderer_draw_api.md`
- Lightweight fragment shader effects → `MANUAL_shaders.md`
- `__GameStart__`, `__GameTest__`, ScenarioRunner, scenario files, recording → `MANUAL_game_entry.md`
- Audio → `MANUAL_audio.md`
- Direct `platform::Window` use → `MANUAL_platform.md`
- Compatibility notes → `MANUAL_compatibility.md`

## Notes

- Gameplay source files under `src/game/*.cpp` are auto-discovered.
- The template is intended to stay clean: put game startup in `src/game/game_entry.cpp` and tests/scenarios in `src/game/game_test.cpp`.
- For behavior details that used to be duplicated here, prefer the topic-specific manuals.
