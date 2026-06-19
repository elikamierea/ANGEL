# Angel Engine Manual — Debug Helpers

## 1.1 Debug Helpers

Declared in `engine/debug/debug_tools.hpp`:

```cpp
namespace engine::debug {
    bool capture_screenshot(const std::string& relativePath);
    bool capture_screenshot_auto();
}
```

- `capture_screenshot(relativePath)` captures the current backbuffer/framebuffer and writes a PNG relative to the runtime working directory.
- `capture_screenshot_auto()` writes to an auto-numbered path under `debug/screenshots/` (for example `debug/screenshots/auto_000000.png`). This is intended for repeated trigger points where the caller does not want to manage unique names manually.
- When debug logging is enabled, successful and failed screenshot writes are recorded to `DEBUG_LOG.txt`.
- Important: `--debug` only controls debug logging. It does **not** automatically disable screenshots, ScenarioRunner actions, turbo timing, or other automation-oriented helpers when omitted.
