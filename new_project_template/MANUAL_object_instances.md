# Angel Engine Manual — Object Instances

## 2. Object Instances

### `engine::base::ObjectGrandBase`
All gameplay objects inherit from `ObjectGrandBase` (directly or indirectly) to participate in the per-frame step pass and draw pass.

```cpp
class Foo : public engine::base::ObjectGrandBase {
public:
    std::type_index __GetTypeIndex__() const override {
        return typeid(Foo);
    }

    void __Create__() override {
        // called after create_instance<T>(...) finishes construction and registration
    }

    void __Destroy__() override {
        // called when destroy_instance(...) / queue_destroy_instance(...) first queues this object
    }

    void __CleanUp__() override {
        // called immediately before final delete inside flush_destroy_queue()
    }

    void __Step__() override {
        // per-frame update
    }

    void __Draw__() override {
        // optional draw
    }
};
```
- Override `__Create__()` for post-construction setup that should run after the object is fully constructed and registered.
- Override `__Destroy__()` for one-time teardown intent when the object is first queued for deferred destruction.
- Override `__CleanUp__()` for final cleanup work immediately before deletion.
- Override `__Step__()` for per-frame logic.
- Override `__Draw__()` when the object should render something.
- Base defaults are no-op for all lifecycle hooks.
- `depth` (float) controls draw order; smaller values are rendered first (behind).

### `engine::base::ObjectBase` (recommended for most gameplay objects)
`ObjectBase` provides ready-to-use public fields:
- position: `x`, `y`
- sprite state: `sprite` (pointer to `engine::draw::Sprite`), `frame`
- transform state: `xscale`, `yscale`, `angle`
- visual state: `alpha`
And it ships with a default draw implementation that calls:
```cpp
engine::draw::draw_sprite(x, y, *sprite, frame, depth, xscale, yscale, angle, alpha);
```

If `sprite == nullptr` (or sprite has no frames), the default draw does nothing safely.

### Instance Lifetime Helpers

```cpp
namespace engine::instance {
    template <typename T, typename... Args>
    T* create_instance(Args&&... args);

    void destroy_instance(engine::base::ObjectGrandBase* instance);
    void queue_destroy_instance(engine::base::ObjectGrandBase* instance); // synonym
    void flush_destroy_queue(); // automatically called each frame
}
```

Recommended usage:
- Create gameplay-managed instances with `create_instance<T>(...)`.
- Destroy gameplay-managed instances with `destroy_instance(...)` (or `queue_destroy_instance(...)` if you prefer the explicit deferred-destroy wording).
- Destruction is deferred and flushed after the frame step pass.

What `create_instance<T>(...)` does:
1. `new T(...)`
2. register the fully constructed object into the type registry
3. call `instance->__Create__()`
4. return the instance pointer

What `destroy_instance(...)` / `queue_destroy_instance(...)` does:
1. if not already queued, call `instance->__Destroy__()`
2. place the instance into the deferred destroy queue
3. later, during `flush_destroy_queue()`, call `instance->__CleanUp__()` and then `delete instance`

### Construction / Destruction Model (important)

Current `ObjectGrandBase` behavior is split across two indexes:
- `ObjectGrandBase::ObjectGrandBase()` inserts `this` into `__IndexAll__` during base construction.
- `create_instance<T>(...)` performs the explicit “finished registration” step for `__IndexRegistry__` after the most-derived object has fully constructed.
- `ObjectGrandBase::~ObjectGrandBase()` removes `this` from both the live-object set and the type registry during base destruction.
- Writing a derived constructor or destructor does **not** suppress the base constructor/destructor; normal C++ construction order still applies.

Practical risks / rules:
- Avoid assuming an object is already in a fully stable “ready for every global query/system” state during its constructor. `__IndexAll__` registration happens before the derived constructor body has finished its own initialization.
- Prefer `__Create__()` over constructor-side global gameplay registration work when you need the object to be fully constructed and type-registered first.
- Avoid doing complex global instance interactions from destructors when possible.
- Prefer `destroy_instance(...)` / `queue_destroy_instance(...)` over direct `delete` for gameplay-managed objects so object removal stays aligned with the engine’s deferred-destroy model.
- `__Destroy__()` is the right hook for “this object has been scheduled to die”; `__CleanUp__()` is the right hook for “we are about to actually delete it”.

### Instance Queries

Header-only helpers in `engine/instance/instance_query.hpp`:

```cpp
auto* set = engine::instance::try_get_instance_set_of_type<Player>();
auto players = engine::instance::instances_of_type<Player>();
```
- `try_get_instance_set_of_type<T>()` returns the raw registry set (`std::set<ObjectGrandBase*>`) for the type or `nullptr` if none exist.
- `instances_of_type<T>()` returns a `std::vector<T*>` of live instances (safe, filtered, and cast for you).
- `collect_instances_of_type<T>()` is kept as a compatibility alias for now.

**Type query guarantee**
- Type queries are intended to track each live object's actual gameplay type as registered through `create_instance<T>(...)`.
- In practice: if an object was created through `create_instance<Player>(...)`, querying `Player` will find it consistently while it is alive.
- If user code bypasses the wrapped creation path and uses raw `new`, the object may still appear in `__IndexAll__`, but it will not receive the full type-registry lifecycle behavior described above.
