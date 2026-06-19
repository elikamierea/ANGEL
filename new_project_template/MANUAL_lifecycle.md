# Angel Engine Manual — Lifecycle

## 1. Engine Lifecycle

### Frame Rate / Tick Pace
- The engine currently uses a per-frame loop (no fixed-timestep simulation yet).
- Frame pace is controlled by two switches:
  - **VSync** via `set_vsync_enabled(bool)`
  - **Sleep-based cap** via `set_target_fps(int)`
- An optional CLI testing mode `--turbo` keeps window/context creation but changes frame timing behavior for automation:
  - `delta_time()` is no longer measured from real wall-clock frame spacing
  - if `target_fps > 0`, turbo uses `1.0 / target_fps`
  - otherwise it falls back to monitor refresh rate when available, then `1.0 / 60.0`
  - sleep-based frame limiting is skipped, so test runs advance as fast as possible
- Defaults:
  - VSync enabled
  - target FPS = `0` (uncapped by software cap)
- Practical meaning:
  - with VSync on, FPS usually follows monitor refresh (e.g., ~60/120/144)
  - with VSync off, FPS is limited only if `set_target_fps(...)` is set to a positive value
- Gameplay step phases and rendering are both executed once per frame.
- Recommended baseline for gameplay projects (until fixed timestep is introduced):
  - `set_vsync_enabled(true)`
  - `set_target_fps(60)`
  This avoids high-refresh monitors making frame-based gameplay run too fast.

```cpp
namespace engine::general {
    enum class CursorMode {
        Normal,
        Hidden,
        Disabled,
    };

    enum class StandardCursor {
        Arrow,
        IBeam,
        Crosshair,
        Hand,
        HResize,
        VResize,
    };

    void request_game_quit();
    bool is_game_running();

    void set_target_fps(int fps);
    int get_target_fps();

    void set_vsync_enabled(bool enabled);
    bool is_vsync_enabled();

    void set_turbo_enabled(bool enabled);
    bool is_turbo_enabled();

    void set_record_enabled(bool enabled);
    bool is_record_enabled();

    void initialize_random_seed();
    void set_random_seed(std::uint32_t seed);
    std::uint32_t random_seed();

    bool key_down(int keycode);
    bool key_pressed(int keycode);
    bool key_released(int keycode);

    bool mouse_down(int button);
    bool mouse_pressed(int button);
    bool mouse_released(int button);

    double mouse_x();
    double mouse_y();
    void mouse_position(double& outX, double& outY);
    double mouse_scroll_x();
    double mouse_scroll_y();
    void mouse_scroll(double& outScrollX, double& outScrollY);

    double delta_time();

    int window_width();
    int window_height();
    void window_size(int& outWidth, int& outHeight);

    int framebuffer_width();
    int framebuffer_height();
    void framebuffer_size(int& outWidth, int& outHeight);

    void set_window_position(int x, int y);
    void set_window_size(int width, int height);
    void set_window_rect(int x, int y, int width, int height);

    void set_cursor_mode(CursorMode mode);
    CursorMode cursor_mode();
    bool set_standard_cursor(StandardCursor cursor);
    void clear_cursor();
}
```
- `request_game_quit()` – signal the main loop to exit after the current frame.
- `is_game_running()` – returns the state polled by `Engine::run()`; normally you only read this when building custom loops or tools.
- `set_target_fps(fps)` – sets frame cap. `fps <= 0` means uncapped.
- `set_turbo_enabled(...)` / `is_turbo_enabled()` – enable or query turbo timing mode. This is mainly intended for test/automation flows; the `main.cpp` CLI flag `--turbo` toggles it before engine startup.
- `set_record_enabled(...)` / `is_record_enabled()` – enable or query input recording mode. The `main.cpp` CLI flag `--record` toggles it before engine startup.
- `initialize_random_seed()` – generates a startup seed (currently time-based) and applies it to the standard-library C RNG via `std::srand(...)`.
- `set_random_seed(...)` / `random_seed()` – explicitly set or inspect the engine-managed startup seed used for standard-library random workflows.
- `key_down/pressed/released(keycode)` – keyboard polling helpers; `pressed/released` are edge-triggered per frame.
- `mouse_down/pressed/released(button)` – mouse-button polling helpers; `pressed/released` are edge-triggered per frame.
- `mouse_x/mouse_y/mouse_position(...)` – current cursor position in window client coordinates.
- `mouse_scroll_x/mouse_scroll_y/mouse_scroll(...)` – current-frame scroll delta in window input space. These values are reset each frame and represent wheel movement accumulated during that frame only.
- `set_cursor_mode(...)` / `cursor_mode()` – control whether the cursor is normal, hidden, or disabled (captured) through the GLFW window layer.
- `set_standard_cursor(...)` / `clear_cursor()` – swap to a GLFW standard cursor shape or restore the default cursor.
- `delta_time()` – elapsed seconds since previous frame.
- `framebuffer_width/framebuffer_height/framebuffer_size(...)` – current OpenGL framebuffer size. Prefer these over window size when writing screenshot/debug tooling because framebuffer pixels can differ from logical window size.

`Engine` itself is wired in `main.cpp` already; you only need to edit `__GameStart__()` (see `MANUAL_game_entry.md`).
