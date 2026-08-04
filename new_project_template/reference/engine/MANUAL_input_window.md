# Angel Engine Manual - Input, Window, and Cursor

This file covers:
- keyboard input
- mouse input
- window size and position helpers
- framebuffer size helpers
- cursor mode and standard cursor helpers

For object lifecycle and frame timing, read `MANUAL_gameplay_core.md`.

## Keyboard input

```cpp
bool key_down(int keycode);
bool key_pressed(int keycode);
bool key_released(int keycode);
```

`ANGEL.h` re-exports key macros such as:
- `KEYBOARD_LEFT`
- `KEYBOARD_RIGHT`
- `KEYBOARD_UP`
- `KEYBOARD_DOWN`
- `KEYBOARD_SPACE`
- `KEYBOARD_ESCAPE`

Meaning:
- `key_down(...)` = currently held
- `key_pressed(...)` = went down this frame
- `key_released(...)` = went up this frame

## Mouse input

```cpp
bool mouse_down(int button);
bool mouse_pressed(int button);
bool mouse_released(int button);

double mouse_x();
double mouse_y();
void mouse_position(double& outX, double& outY);

double mouse_scroll_x();
double mouse_scroll_y();
void mouse_scroll(double& outScrollX, double& outScrollY);
```

`ANGEL.h` re-exports button macros such as:
- `MOUSE_BUTTON_LEFT`
- `MOUSE_BUTTON_RIGHT`
- `MOUSE_BUTTON_MIDDLE`

Notes:
- mouse position is in window client coordinates
- scroll values are per-frame deltas

## Window helpers

```cpp
int window_width();
int window_height();
void window_size(int& outWidth, int& outHeight);

int framebuffer_width();
int framebuffer_height();
void framebuffer_size(int& outWidth, int& outHeight);

void set_window_position(int x, int y);
void set_window_size(int width, int height);
void set_window_rect(int x, int y, int width, int height);
```

Use framebuffer size when you care about real render pixels rather than logical window size.

## Cursor helpers

```cpp
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

void set_cursor_mode(CursorMode mode);
CursorMode cursor_mode();
bool set_standard_cursor(StandardCursor cursor);
void clear_cursor();
```
