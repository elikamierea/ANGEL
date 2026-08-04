# Angel Engine Manual - Testing and Debug

This file is about testing and tooling, not normal gameplay startup.

## Test entry point

Normal gameplay startup uses:

```cpp
void __GameStart__();
```

Test startup uses:

```cpp
void __GameTest__(const std::string& testName);
```

When the executable is launched with:

```text
--test <name>
```

the engine calls `__GameTest__(name)` instead of `__GameStart__()`.

## Scenario playback

Launch format:

```text
--scenario <path>
```

Meaning:
- load a line-based scenario file
- begin playback automatically at startup

This is separate from `--test`.
Use `__GameTest__(...)` when you want custom C++ setup before a test run.

## ScenarioRunner

`ScenarioRunner` is re-exported by `ANGEL.h`.

Public pieces:

```cpp
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

struct ScenarioAction { ... };

class ScenarioRunner {
public:
    void clear();
    void add_action(const ScenarioAction& action);
    bool load_scenario_from_file(const std::string& path);
    void begin();
    void reset_runtime_state();

    bool has_actions() const;
    bool active() const;
    int frame_index() const;
};

ScenarioRunner& scenario();
```

Design intent:
- agent-authored or developer-authored deterministic test flow
- frame-based scripted inputs and outputs
- not a player-facing runtime feature

If `__GameTest__(...)` registers at least one action, the engine automatically begins the scenario after the test hook returns.

## Minimal ScenarioRunner usage

```cpp
scenario().clear();
scenario().add_action({1, ScenarioActionType::Log, "begin"});
scenario().add_action({10, ScenarioActionType::ScreenshotAuto});
scenario().add_action({20, ScenarioActionType::Quit});
```

## Scenario file loading

```cpp
bool load_scenario_from_file(const std::string& path);
```

Path rules:
- if `path` starts with `assets/`, it is loaded through the normal asset pipeline
- otherwise it is treated as a direct filesystem path

Blank lines and lines starting with `#` are ignored.

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

## Scenario action timing

Current phase split:
- `before_frame(...)` handles:
  - `Log`
  - `SetKeyDown`
  - `SetMouseButtonDown`
  - `SetMousePosition`
  - `AddMouseScroll`
  - `Callback`
- `after_frame(...)` handles:
  - `Screenshot`
  - `ScreenshotAuto`
  - `Quit`

This lets gameplay see injected input during the frame, while screenshots happen after draw.

## Input override behavior

Scenario input overrides are applied during input refresh.

That means:
- `key_down(...)`, `key_pressed(...)`, and `key_released(...)` all observe the same injected key state
- mouse button and mouse position queries observe the same injected state
- scroll injection is additive for the frame

## Recording and deterministic timing

CLI flags:
- `--record`
- `--turbo`

Public helpers:

```cpp
void set_turbo_enabled(bool enabled);
bool is_turbo_enabled();

void set_record_enabled(bool enabled);
bool is_record_enabled();
```

Current timing behavior:
- `--turbo` uses synthetic `delta_time()` instead of real wall-clock timing
- `--record` also uses the same synthetic timing path
- active scenario playback also uses the same synthetic timing path

This makes record/playback and scenario tests more stable.

## Recording output

When launched with `--record`:
- keyboard transitions are recorded
- mouse-button transitions are recorded
- per-frame mouse position is recorded
- non-zero per-frame scroll deltas are recorded

On shutdown, the engine writes:

```text
record.txt
```

into the executable working directory.

The current output is compatible with scenario playback.

## Debug logging

Debug helpers live in:

```cpp
#include "engine/debug/debug_tools.hpp"
```

Public helpers:

```cpp
void set_enabled(bool enabled);
bool is_enabled();

void log(LogLevel level, const std::string& message);
void log_info(const std::string& message);
void log_warning(const std::string& message);
void log_error(const std::string& message);
```

`--debug` enables debug logging.
It does not disable screenshots, ScenarioRunner automation, or turbo timing.

## Screenshots

Also from `engine/debug/debug_tools.hpp`:

```cpp
bool capture_screenshot(const std::string& relativePath);
bool capture_screenshot_auto();
```

Meaning:
- `capture_screenshot(...)` writes a PNG to a caller-supplied relative path
- `capture_screenshot_auto()` writes under `debug/screenshots/`

When debug logging is enabled, screenshot success/failure is logged to `DEBUG_LOG.txt`.

## Working directory matters

These testing/debug features depend on the runtime working directory:
- `record.txt`
- scenario file loading
- screenshot output
- `assets.pak`
- fallback `assets/`

If the working directory is wrong, test behavior can look broken even when the code is correct.
