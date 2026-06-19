# Angel Engine Manual — Game Entry and Testing

## 5. Game Entry Point

Recommended include for gameplay code:

```cpp
#include "game/ANGEL.h"
```

`ANGEL.h` re-exports the most commonly used engine-side APIs for game code (object base class, instance queries, resources, draw helpers, and engine control helpers such as FPS/VSync/input/window settings), so it is the preferred default include in game logic files.

For keyboard polling helpers (`key_down`, `key_pressed`, `key_released`), prefer `ANGEL.h` key macros such as `KEYBOARD_A`, `KEYBOARD_SPACE`, `KEYBOARD_LEFT`, `KEYBOARD_ESCAPE`.
For mouse polling helpers (`mouse_down`, `mouse_pressed`, `mouse_released`), prefer `ANGEL.h` button macros such as `MOUSE_BUTTON_LEFT`, `MOUSE_BUTTON_RIGHT`, `MOUSE_BUTTON_MIDDLE`.
These are aligned with GLFW key/button values so gameplay code no longer needs to include `GLFW/glfw3.h` directly.

`src/game/game_entry.cpp` defines the function the engine calls once after initialization:

```cpp
void __GameStart__();
```
Place startup logic here (create instances, preload assets, schedule timers, etc.). `engine::draw::renderer_initialize` is already done before this function is called.

### Command-line test entry

`src/game/game_test.cpp` provides a dedicated test hook:

```cpp
void __GameTest__(const std::string& testName);
```

Launch format:

```bash
angel_engine --test <test_name>
```
- In this mode, `Engine::initialize` calls `__GameTest__(testName)` **instead of** normal game startup (`__GameStart__`).

### ScenarioRunner (agent-authored deterministic test flow)

Declared in `engine/debug/scenario_runner.hpp` and re-exported by `ANGEL.h`:

```cpp
namespace engine::debug {
    enum class ScenarioActionType {
        Log,
        Screenshot,
        ScreenshotAuto,
        Quit,
        SetKeyDown,
        SetMouseButtonDown,
        SetMousePosition,
        AddMouseScroll,
        Callback
    };

    struct ScenarioAction {
        int frame = 0;
        ScenarioActionType type = ScenarioActionType::Log;
        std::string text;
        int keycode = 0;
        bool pressed = false;
        int mouseButton = 0;
        double mouseX = 0.0;
        double mouseY = 0.0;
        double scrollX = 0.0;
        double scrollY = 0.0;
        std::function<void()> callback;
    };

    class ScenarioRunner {
    public:
        void clear();
        void add_action(const ScenarioAction& action);
        bool load_scenario_from_file(const std::string& path);
        void begin();
        void reset_runtime_state();
        void before_frame(int currentFrame);
        void after_frame(int currentFrame);
        bool has_actions() const;
        bool active() const;
        int frame_index() const;
    };

    ScenarioRunner& scenario();
}
```

Design intent:
- `ScenarioRunner` is meant for **agent-authored** test sequences inside `__GameTest__(...)`, not for player-facing tooling.
- The model is deterministic and frame-based: register actions, then let the engine execute them at specific frame numbers.
- If `__GameTest__(...)` registered at least one action, `Engine::initialize(...)` automatically calls `scenario().begin()` after the test hook returns.

External file loading:
- `load_scenario_from_file(path)` clears the current scenario and loads actions from a text file.
- If `path` starts with `assets/`, it is read through the normal asset pipeline (`assets.pak` / `assets/` fallback).
- Otherwise it is read as a direct filesystem path.
- File loading currently supports a minimal line-based format; blank lines and lines starting with `#` are ignored.

Current line format:

```txt
seed <unsigned_int>
log <frame> <text...>
screenshot <frame> <relative_path>
screenshot_auto <frame>
quit <frame>
key <frame> <keycode> <true|false>
mouse_button <frame> <button> <true|false>
mouse_pos <frame> <x> <y>
mouse_scroll <frame> <scrollX> <scrollY>
```

- If a scenario file contains `seed <value>`, that seed is applied before scenario playback continues.

Execution phases:
- `before_frame(frame)` currently executes `Log`, `SetKeyDown`, `SetMouseButtonDown`, `SetMousePosition`, `AddMouseScroll`, and `Callback`.
- `after_frame(frame)` currently executes `Screenshot`, `ScreenshotAuto`, and `Quit`.
- This split is intentional so gameplay sees scenario-injected input during the frame update, while screenshots still occur after draw/present for that frame.

Action semantics:
- `Log` – append a scenario marker to `DEBUG_LOG.txt`.
- `Screenshot` – call `capture_screenshot(text)` where `text` is used as the relative output path.
- `ScreenshotAuto` – call `capture_screenshot_auto()`.
- `Quit` – call `request_game_quit()`.
- `SetKeyDown` – inject a keyboard state override for the specified keycode.
- `SetMouseButtonDown` – inject a mouse-button state override for the specified button index (`MOUSE_BUTTON_LEFT`, etc.).
- `SetMousePosition` – inject a mouse position override using the same window-client coordinate space returned by `mouse_x()` / `mouse_y()`.
- `AddMouseScroll` – add scroll delta for the current frame. This uses the same per-frame delta semantics as `mouse_scroll_x()` / `mouse_scroll_y()` and is intended for wheel/trackpad gesture simulation.
- `Callback` – execute a caller-supplied C++ lambda/function object.

Input override behavior:
- Key overrides are applied during input refresh, not only at `key_down(...)` query time.
- This means `key_down(...)`, `key_pressed(...)`, and `key_released(...)` all observe the same scenario-injected state consistently.
- Mouse overrides are also applied during input refresh, so `mouse_down(...)`, `mouse_pressed(...)`, `mouse_released(...)`, `mouse_x()`, and `mouse_y()` observe the same injected state consistently.
- Scroll overrides are additive per frame: the scenario can add wheel delta on top of any real input that GLFW delivered during that same frame.

Minimal usage pattern inside `__GameTest__(...)`:

```cpp
scenario().clear();
scenario().add_action({1, ScenarioActionType::Log, "begin"});
scenario().add_action({10, ScenarioActionType::ScreenshotAuto});
scenario().add_action({20, ScenarioActionType::Quit});
```

Recording:
- Launching with `--record` records keyboard transitions, mouse-button transitions, per-frame mouse position, and per-frame scroll deltas when non-zero.
- On shutdown, the engine writes `record.txt` into the executable working directory.
- The current output starts with `seed <value>` and is compatible with the line-based scenario file format for `key`, `mouse_button`, `mouse_pos`, and `mouse_scroll` commands.
