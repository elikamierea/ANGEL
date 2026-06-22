# Angel Engine Manual - Advanced Rendering and Shader Effects

This file covers:
- the surface timeline model
- surface lifecycle and readiness rules
- shader-backed surface composites
- shader creation and uniform rules

## Handle types

```cpp
using SurfaceHandle = std::uint32_t;
constexpr SurfaceHandle kInvalidSurfaceHandle = 0;

using ShaderHandle = std::uint32_t;
constexpr ShaderHandle kInvalidShaderHandle = 0;
```

## Surface API

```cpp
SurfaceHandle surface_create(int width, int height);
void surface_destroy(SurfaceHandle handle);

bool surface_set_target(SurfaceHandle handle);
void surface_reset_target();

void surface_clear(Color color = {});
void surface_clear(float depth, Color color);

void surface_flush(SurfaceHandle handle, float depth = 0.0f);

void surface_draw(SurfaceHandle handle, float x, float y,
                  float depth = 0.0f,
                  float xscale = 1.0f, float yscale = 1.0f,
                  float rotationRad = 0.0f, Color color = {}, float alpha = 1.0f);

void surface_set_texture_filter(SurfaceHandle handle, TextureFilter filter);
```

## Surface model

Important model:
- every surface owns its own render timeline
- the main backbuffer also has a timeline
- draw calls submit nodes during submission
- execution happens later

Ordering inside one timeline is:

```text
(depth, submissionOrder)
```

That means:
- depth is the primary ordering key
- ties are resolved by earlier submission first

## Target switching

`surface_set_target(...)` and `surface_reset_target()` do not perform implicit global submission flushes anymore.

Their job is only:
- choose which surface timeline future submissions go into
- switch back to the main backbuffer timeline

There is still only one active render target at a time.

## Clear nodes

```cpp
void surface_clear(Color color = {});
void surface_clear(float depth, Color color);
```

Semantics:
- `surface_clear(Color)` inserts a clear at the earliest possible depth for the current target
- `surface_clear(depth, color)` inserts a clear node at the exact requested depth

There is no automatic clear on target bind.

## Flush nodes

```cpp
void surface_flush(SurfaceHandle handle, float depth = 0.0f);
```

`surface_flush(...)` is not a "draw now" call.
It is an explicit dependency node in the current timeline.

Meaning:
- it asks the target surface to execute all nodes earlier than the flush node's sort position
- use it before sampling a surface when you need newly submitted content from that surface

Practical rule:
- `surface_flush(...)` makes a surface ready up to a requested point
- `surface_draw(...)` only reads whatever completed contents that surface already has

## Surface reads

```cpp
void surface_draw(SurfaceHandle handle, ...);
```

Semantics:
- reads the surface's current completed contents only
- does not auto-flush the source surface
- if you draw a surface before flushing it far enough, you see its previous completed state instead

This is intentional.
Readiness is explicit, not hidden behind `surface_draw(...)`.

## Surface lifetime

Current contract:
- `surface_create(...)` happens during submission and returns a handle immediately
- the surface can be referenced later in the same frame
- `surface_destroy(...)` is deferred until the current frame finishes execution
- current first-pass behavior still allows already-submitted same-frame later reads after `surface_destroy(...)`
- surface handles are not reused in the current implementation

## Surface safety rules

- a surface cannot be sampled while it is the active target
- surface dependency cycles are invalid
- if flush recursion forms a cycle, the renderer logs an error instead of recursing forever

## Texture filtering for surfaces

```cpp
enum class TextureFilter {
    Linear,
    Nearest,
};

void set_default_texture_filter(TextureFilter filter);
void surface_set_texture_filter(SurfaceHandle handle, TextureFilter filter);
```

Meaning:
- `set_default_texture_filter(...)` affects textures created after the call
- `surface_set_texture_filter(...)` changes one existing surface texture

## Minimal surface flow

```cpp
auto scene = surface_create(512, 512);

surface_set_target(scene);
surface_clear(0.0f, {0, 0, 0, 0});
draw_rectangle(20.0f, 20.0f, 100.0f, 100.0f, 1.0f, {1, 0, 0, 1});
surface_reset_target();

surface_flush(scene, 2.0f);
surface_draw(scene, 200.0f, 120.0f, 3.0f);
surface_destroy(scene);
```

## Shader effects

Shader effect v1 is intentionally narrow:
- custom fragment shader only
- fixed engine-provided vertex shader
- surface-oriented usage
- built-in uniforms for common effect work
- custom uniforms limited to `float`, `vec2`, and `vec4`

Public API:

```cpp
ShaderHandle shader_create_from_fragment(const std::string& fragmentSource);
void shader_destroy(ShaderHandle handle);

void shader_set_uniform_float(ShaderHandle handle, const std::string& name, float value);
void shader_set_uniform_vec2(ShaderHandle handle, const std::string& name, float x, float y);
void shader_set_uniform_vec4(ShaderHandle handle, const std::string& name, float x, float y, float z, float w);

void surface_draw_with_shader(SurfaceHandle handle, ShaderHandle shader, float x, float y,
                              float depth = 0.0f,
                              float xscale = 1.0f, float yscale = 1.0f,
                              float rotationRad = 0.0f, Color color = {}, float alpha = 1.0f);
```

## Shader draw behavior

`surface_draw_with_shader(...)` participates in the same timeline model as `surface_draw(...)`.

Meaning:
- it submits a surface-composite node into the current target timeline
- that node is ordered by `(depth, submissionOrder)`
- it does not force an immediate renderer flush
- it reads the source surface's current completed contents at execution time
- it does not auto-flush the source surface

Practical rule:
- if you need freshly submitted contents from a surface, submit `surface_flush(...)` before `surface_draw_with_shader(...)`

## Shader uniform timing

Custom uniform values are stored on the shader handle and reused on later submissions until changed.

When `surface_draw_with_shader(...)` is submitted:
- the current custom uniform values are snapshotted into that draw node
- later `shader_set_uniform_*` calls affect future submissions only
- already-submitted shader draws keep the values they captured

## Fragment shader interface

Expected fragment interface shape:

```glsl
in vec2 vUV;
in vec4 vColor;
out vec4 FragColor;
```

Useful built-in uniforms:

```glsl
uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uInputSize;
uniform vec2 uInputTexelSize;
uniform vec4 uColor;
```

Recommended baseline:

```glsl
vec4 src = texture(uTexture, vUV) * vColor;
FragColor = src;
```

Notes:
- the engine already handles surface/FBO Y-flip correction
- do not manually invert `vUV.y` unless you intentionally want an upside-down result
- `uInputSize` and `uInputTexelSize` describe the source surface, not the final scaled quad

## Shader failure behavior

- `shader_create_from_fragment(...)` returns `kInvalidShaderHandle` on compile/link failure
- compile/link errors are written to `DEBUG_LOG.txt`
- invalid shader handles or invalid source surface handles are ignored safely by `surface_draw_with_shader(...)`

## GLSL ES compatibility scope

The current implementation provides only a lightweight compatibility pass:
- `#version 300 es` is rewritten to desktop `#version 330 core`
- common `precision ...` qualifiers are stripped

Treat this as a narrow local-effect feature, not a full GLES shader runtime.

## Minimal shader-backed surface flow

```cpp
auto scene = surface_create(640, 360);
auto shader = shader_create_from_fragment(fragmentSource);

if (shader != kInvalidShaderHandle) {
    shader_set_uniform_float(shader, "uScanStrength", 0.25f);

    surface_set_target(scene);
    surface_clear(0.0f, {0, 0, 0, 1});
    // draw normal scene content here
    surface_reset_target();

    surface_flush(scene, 1.0f);
    surface_draw_with_shader(scene, shader, 0.0f, 0.0f, 2.0f);
}
```
