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
bool persistent{false};
float depth{0.0f};
```

Smaller depth values render earlier.
The frame runner sorts gameplay objects by `depth` before calling `__Draw__()`.
If multiple objects share the same depth, do not rely on their relative `__Draw__()` order.
`persistent = true` excludes the object from `destroy_nonpersistent_instances()`.

## `ObjectBase`

`ObjectBase` is a convenience subclass for sprite-based objects.

Its constructor also accepts an optional persistence flag:

```cpp
ObjectBase(bool persistent = false);
```

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
That means `ObjectBase::depth` affects both object-level `__Draw__()` order and the submitted sprite draw depth.
If you override `__Draw__()` and call draw APIs manually, pass the intended depth explicitly.

## Creating and destroying instances

Public helpers:

```cpp
template <typename T, typename... Args>
T* create_instance(Args&&... args);

void destroy_instance(ObjectGrandBase* instance);
void destroy_nonpersistent_instances();
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

What `destroy_nonpersistent_instances(...)` does:
1. snapshot the currently registered gameplay-managed instances
2. call `destroy_instance(...)` for every instance whose `persistent == false`
3. keep the same deferred-destruction behavior as normal instance destruction

Practical rule:
- use `create_instance<T>(...)` for gameplay-managed objects
- use `destroy_instance(...)` instead of raw `delete`
- use `destroy_nonpersistent_instances()` for scene-style cleanup when manager objects should survive
- other objects holding a raw pointer are not notified automatically
- after `destroy_instance(...)`, treat the raw pointer as unsafe to reuse or cache

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

## Instance handles

For long-lived references, prefer handles over raw pointers:

```cpp
InstanceHandle get_handle(const ObjectGrandBase* instance);
bool instance_exists(InstanceHandle handle);
ObjectGrandBase* get_instance(InstanceHandle handle);

template <typename T>
T* get_instance(InstanceHandle handle);
```

Notes:
- `get_handle(...)` creates a weak handle for an existing gameplay-managed object
- `instance_exists(handle)` returns `false` if the object was destroyed or scheduled for destruction
- `get_instance(handle)` returns `nullptr` when the handle no longer resolves
- `get_instance<T>(handle)` also returns `nullptr` on type mismatch
- handle validity is based on internal slot + generation tracking, so a deleted object's old handle will not resolve to a later object that happens to reuse the same memory address

Example:

Instance A created instance B, which would be destroyed at some point, and interacts with it.
A should keep a handle of B instead of a pointer to prevent dangling pointer.

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
