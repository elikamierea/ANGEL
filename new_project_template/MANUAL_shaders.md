# Angel Engine Manual — Shader Effects

## 5. Shader Effects

Angel Engine currently exposes a **lightweight shader effect path** for small, local visual effects.
This is intentionally narrower than a full material system.

Current design goals:
- support a few custom visual effects such as scanlines, color shifts, vignette, flicker, or mild UV distortion
- keep the main renderer/batching path simple
- avoid turning every draw call into a shader/material object
- stay focused on fragment-stage effects rather than general programmable rendering

## Scope of v1

Shader effect v1 is deliberately limited:
- custom **fragment shader** only
- fixed engine-provided vertex shader
- surface-oriented usage first (`surface_draw_with_shader(...)`)
- built-in uniforms for common effect work
- custom uniforms limited to `float`, `vec2`, and `vec4`

Not supported in v1:
- custom vertex shaders
- custom vertex layout
- custom sampler bindings beyond the main input texture
- matrix / array / struct custom uniforms
- full material system
- broad per-draw shader assignment across the renderer
- full GLSL ES feature-complete runtime compatibility

## Public API

Declared in `engine/draw/draw_api.hpp`:

```cpp
namespace engine::draw {
    using ShaderHandle = std::uint32_t;
    constexpr ShaderHandle kInvalidShaderHandle = 0;

    ShaderHandle shader_create_from_fragment(const std::string& fragmentSource);
    void shader_destroy(ShaderHandle handle);

    void shader_set_uniform_float(ShaderHandle handle, const std::string& name, float value);
    void shader_set_uniform_vec2(ShaderHandle handle, const std::string& name, float x, float y);
    void shader_set_uniform_vec4(ShaderHandle handle, const std::string& name, float x, float y, float z, float w);

    void surface_draw_with_shader(SurfaceHandle handle, ShaderHandle shader, float x, float y,
                                  float depth = 0.0f,
                                  float xscale = 1.0f, float yscale = 1.0f,
                                  float rotationRad = 0.0f, Color color = {}, float alpha = 1.0f);
}
```

### Lifetime rules
- `shader_create_from_fragment(...)` returns `kInvalidShaderHandle` on failure.
- `shader_destroy(...)` releases the GL program.
- Custom uniform values are stored per shader handle and reused on later draws until changed.

## Built-in uniforms

Effect shaders may use these engine-provided uniforms:

```glsl
uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uInputSize;
uniform vec2 uInputTexelSize;
uniform vec4 uColor;
```

Semantics:
- `uTexture`
  - the input surface texture being drawn
- `uTime`
  - engine-managed running time (currently a lightweight renderer-side accumulated time value)
- `uInputSize`
  - input texture size in pixels `(width, height)`
- `uInputTexelSize`
  - reciprocal size `(1/width, 1/height)`
- `uColor`
  - draw color after engine-side sanitization and alpha multiplication

## Custom uniforms

v1 custom uniforms are intentionally small in scope:
- `float`
- `vec2`
- `vec4`

Typical use cases:
- scanline strength
- flicker speed
- warp amount
- tint / threshold / gain controls

Example:

```cpp
auto shader = shader_create_from_fragment(fragmentSource);
shader_set_uniform_float(shader, "uScanStrength", 0.2f);
shader_set_uniform_vec2(shader, "uWarp", 0.01f, 0.0f);
shader_set_uniform_vec4(shader, "uTint", 1.0f, 0.95f, 0.95f, 1.0f);
```

## GLSL ES compatibility scope

The current implementation performs only a **lightweight fragment-source compatibility pass**.
It is meant to help with simple GLSL ES-style fragment shader sources, not to provide a full GLES shader runtime.

Current lightweight handling includes:
- `#version 300 es` → rewritten to desktop `#version 330 core`
- common `precision ...` qualifiers are stripped

That means this path is best treated as:
- **GLSL ES–style fragment effect compatibility**, not full GLSL ES compatibility

## Recommended usage pattern

The intended workflow is:
1. render your scene into a surface
2. reset the target
3. draw that surface back through a custom effect shader

Minimal example:

```cpp
auto scene = surface_create(640, 360);
auto shader = shader_create_from_fragment(R"GLSL(
#version 300 es
precision mediump float;

in vec2 vUV;
in vec4 vColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uInputSize;
uniform vec2 uInputTexelSize;
uniform vec4 uColor;
uniform float uScanStrength;

out vec4 FragColor;

void main() {
    vec4 src = texture(uTexture, vUV) * vColor;
    float scan = 1.0 - uScanStrength * 0.5 * (0.5 + 0.5 * sin(vUV.y * uInputSize.y * 1.5 + uTime * 8.0));
    FragColor = vec4(src.rgb * scan, src.a);
}
)GLSL");

shader_set_uniform_float(shader, "uScanStrength", 0.25f);

surface_set_target(scene);
surface_clear({0, 0, 0, 1});
// draw normal scene content here
surface_reset_target();

surface_draw_with_shader(scene, shader, 0.0f, 0.0f);
```

## Design notes

This system is intentionally separate from the broader renderer command path.
That is a tradeoff made to keep the engine light:
- surface effects are easy to add
- the main draw batching model stays simple
- engine complexity stays much lower than a full shader/material framework

If future needs grow beyond a few local effects, the next likely expansion areas would be:
- richer uniform management
- multiple effect passes
- optional sprite-level shader hooks
- stronger shader source validation/reporting
