# Angel Engine

Angel Engine is a C++17 2D game template.

For normal gameplay code:
- put startup code in `src/game/game_entry.cpp`
- include `#include "game/ANGEL.h"`
- create objects by deriving from `ObjectGrandBase`

The goal of this README is to get you started quickly, WITHOUT reading the source code.

If you need more than the basics in this README:
- normal gameplay lifecycle, objects, instance queries, handles, and frame timing -> `MANUAL_gameplay_core.md`
- keyboard, mouse, window, and cursor APIs -> `MANUAL_input_window.md`
- sprites, primitive drawing, text, and resource-path rules -> `MANUAL_draw_basics.md`
- surfaces, render ordering, and shader-backed surface effects -> `MANUAL_render_advanced.md`
- sound playback, music playback, and audio volume controls -> `MANUAL_audio.md`
- `__GameTest__(...)`, ScenarioRunner, screenshots, `--scenario`, `--record`, and `--turbo` -> `MANUAL_testing_debug.md`

## Minimal Game Example

This is the smallest normal gameplay shape:
- define one object
- create it in `__GameStart__()`
- move it with `delta_time()`

```cpp
#include "game/ANGEL.h"

class MovingBox final : public ObjectGrandBase {
public:
    std::type_index __GetTypeIndex__() const override {
        return typeid(MovingBox);
    }

    void __Step__() override {
        x += speed * static_cast<float>(delta_time());
    }

    void __Draw__() override {
        draw_rectangle(x, y, 32.0f, 32.0f, 0.0f, {1.0f, 0.3f, 0.3f, 1.0f});
    }

private:
    float x{40.0f};
    float y{60.0f};
    float speed{120.0f};
};

void __GameStart__() {
    set_vsync_enabled(true);
    set_target_fps(60);
    create_instance<MovingBox>();
}
```

What this shows:
- `__GameStart__()` is your normal startup hook
- `T* create_instance<T>()` creates a live gameplay object, calls its `__Create__()` and returns its pointer.
- `__Step__()` runs once per frame for logic
- `__Draw__()` runs once per frame for rendering
- `delta_time()` returns elapsed seconds since the previous frame

## Minimal Sprite Example

For sprite-based drawing, the recommended default path is the cached `ResourceManager`.

```cpp
#include "game/ANGEL.h"

class PlayerSprite final : public ObjectGrandBase {
public:
    std::type_index __GetTypeIndex__() const override {
        return typeid(PlayerSprite);
    }

    void __Create__() override {
        sprite = &engine::utils::ResourceManager::instance().load_sprite("assets/image/player", 0);
    }

    void __Draw__() override {
        if (sprite != nullptr) {
            draw_sprite(120.0f, 80.0f, *sprite, 0, 0.0f);
        }
    }

private:
    const Sprite* sprite{nullptr};
};

void __GameStart__() {
    create_instance<PlayerSprite>();
}
```

For `load_sprite("assets/image/player", 0)`, the runtime expects:
- `assets/image/player.png`
- `assets/image/player.txt`

Use logical `assets/...` paths. NEVER pass absolute paths.

The .txt metadata also contains its center point, compatible with scaling/rotating, no need to manually calculate the displacement.

You can always trust the sprites given by the user before first use, as they are given a sprite editor that gurantee correctness on saving. 

## Common API

These are the main APIs most gameplay code reaches for first.

### Include

```cpp
#include "game/ANGEL.h"
```

### Game Startup

```cpp
void __GameStart__();
```

- called once after engine initialization
- put your initial `create_instance<...>()` calls here

### Objects

```cpp
class MyObject : public ObjectGrandBase {
public:
    std::type_index __GetTypeIndex__() const override;
    void __Create__() override;
    void __Destroy__() override;
    void __Step__() override;
    void __Draw__() override;
};
```

```cpp
template <typename T, typename... Args>
T* create_instance(Args&&... args);

void destroy_instance(ObjectGrandBase* instance);
void request_game_quit();
```

### Timing and Window

```cpp
double delta_time();

void set_vsync_enabled(bool enabled);
void set_target_fps(int fps);

int window_width();
int window_height();
void set_window_size(int width, int height);
```

### Keyboard and Mouse

```cpp
bool key_down(int keycode);
bool key_pressed(int keycode);
bool key_released(int keycode);

bool mouse_down(int button);
bool mouse_pressed(int button);
bool mouse_released(int button);

double mouse_x();
double mouse_y();
```

Useful key/button macros are re-exported by `ANGEL.h`, for example:
- `KEYBOARD_LEFT`
- `KEYBOARD_RIGHT`
- `KEYBOARD_SPACE`
- `KEYBOARD_ESCAPE`
- `MOUSE_BUTTON_LEFT`
- `MOUSE_BUTTON_RIGHT`

### Basic Drawing

```cpp
void draw_sprite(float x, float y, const Sprite& sprite, int frame,
                 float depth,
                 float xscale, float yscale,
                 float rotationRad, float alpha);

void draw_sprite(float x, float y, const Sprite& sprite, int frame,
                 float depth,
                 float xscale, float yscale,
                 float rotationRad, float alpha, Color color);
```

**Keep in mind that frame index starts from 0, and that smaller depth means earlier execution.**

Text drawing is also available through `ANGEL.h`:

```cpp
void draw_text(const AsciiFont& font, const std::string& text,
               float x, float y, float depth = 0.0f, ...);

void draw_text(const BitmapFont& font, const std::string& utf8_text,
               float x, float y, float depth = 0.0f, ...);
```

### Sprites and Resources

Recommended cached load path:

```cpp
auto& sprite = engine::utils::ResourceManager::instance().load_sprite("assets/image/player", 0);
```

Direct load path:

```cpp
Sprite sprite = load_sprite("assets/image/player", 0);
```

Notes:
- always use logical `assets/...` paths
- sprite paths are specified without the `.png` / `.txt` suffix
- `texture_group_id` is an integer grouping key; `0` is a fine default for simple projects
