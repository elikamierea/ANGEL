# Angel Engine Manual — Platform Layer

## 7. Platform Layer (optional use)

`platform::Window` lives in `platform/window.hpp`. Typical games interact with it indirectly through `Engine`, but if you build tooling/tests you can:

```cpp
platform::Window window(1280, 720, "My Tool");
window.initialize();
window.poll_events();
window.swap_buffers();
bool closed = window.should_close();
```
Context creation, vsync, and framebuffer callbacks are handled automatically. The renderer expects a single window/context owned by this class.
