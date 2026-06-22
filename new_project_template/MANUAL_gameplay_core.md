# Angel Engine Manual - Gameplay Core

This file covers:
- where normal game code starts
- how gameplay objects live and die
- frame timing
- instance queries

It does not cover:
- keyboard / mouse input
- window / cursor control
- surfaces
- shader effects
- test automation / ScenarioRunner

## Normal starting point

Recommended include for gameplay code:

```cpp
#include "game/ANGEL.h"
```

Normal startup hook:

```cpp
void __GameStart__();
```

The engine calls `__GameStart__()` once after initialization.
Put initial setup here:
- create your first gameplay objects
- set FPS / VSync defaults
- optionally size or position the window

For test-only startup through `__GameTest__(...)`, read `MANUAL_testing_debug.md`.

## Gameplay objects

All gameplay objects derive from `ObjectGrandBase` directly or indirectly.

```cpp
class Player : public ObjectGrandBase {
public:
    std::type_index __GetTypeIndex__() const override {
        return typeid(Player);
    }

    void __Create__() override {}
    void __Destroy__() override {}
    void __CleanUp__() override {}
    void __Step__() override {}
    void __Draw__() override {}
};
```

Hook meanings:
- `__Create__()` runs after `create_instance<T>(...)` constructs and registers the object
- `__Destroy__()` runs once when the object is first scheduled for deferred destruction
- `__CleanUp__()` runs immediately before final delete
- `__Step__()` runs once per frame for logic
- `__Draw__()` runs once per frame for rendering

`ObjectGrandBase` also exposes:

```cpp
float depth{0.0f};
```

Smaller depth values render earlier.

## `ObjectBase`

`ObjectBase` is a convenience subclass for sprite-based objects.

It adds public fields:
- `x`, `y`
- `sprite`
- `frame`
- `xscale`, `yscale`
- `angle`
- `alpha`

Its default draw path is equivalent to:

```cpp
draw_sprite(x, y, *sprite, frame, depth, xscale, yscale, angle, alpha);
```

If `sprite == nullptr`, the default draw does nothing.

## Creating and destroying instances

Public helpers:

```cpp
template <typename T, typename... Args>
T* create_instance(Args&&... args);

void destroy_instance(ObjectGrandBase* instance);
```

What `create_instance<T>(...)` does:
1. `new T(...)`
2. register the object in the type registry
3. call `instance->__Create__()`
4. return the pointer

What `destroy_instance(...)` does:
1. if not already queued, call `instance->__Destroy__()`
2. place the object into the deferred destroy queue
3. later, during the frame destroy flush, call `instance->__CleanUp__()` and delete it

Practical rule:
- use `create_instance<T>(...)` for gameplay-managed objects
- use `destroy_instance(...)` instead of raw `delete`

## Instance queries

Public query helpers:

```cpp
std::vector<T*> instances_of_type<T>();
std::vector<T*> collect_instances_of_type<T>();
```

Notes:
- `instances_of_type<T>()` is the normal query helper
- `collect_instances_of_type<T>()` is currently a compatibility alias
- objects created through raw `new` bypass the normal type-registration lifecycle

## Frame timing and game control

Core control helpers:

```cpp
void request_game_quit();
bool is_game_running();

double delta_time();

void set_target_fps(int fps);
int get_target_fps();

void set_vsync_enabled(bool enabled);
bool is_vsync_enabled();
```

Notes:
- `delta_time()` returns elapsed seconds since the previous frame
- `fps <= 0` means no software frame cap
- VSync and target FPS can both affect frame pacing

Recommended simple default:

```cpp
set_vsync_enabled(true);
set_target_fps(60);
```

## Random seed helpers

```cpp
void initialize_random_seed();
void set_random_seed(std::uint32_t seed);
std::uint32_t random_seed();
```
