# Angel Engine Manual — Renderer / Draw API

## 4. Renderer / Draw API

Declared in `engine/draw/draw_api.hpp`:

```cpp
namespace engine::draw {
    struct Color { float r=1, g=1, b=1, a=1; };
    struct Vec2 { float x=0, y=0; };

    enum class TextureFilter {
        Linear,
        Nearest,
    };

    using SurfaceHandle = std::uint32_t;
    constexpr SurfaceHandle kInvalidSurfaceHandle = 0;

    void set_default_texture_filter(TextureFilter filter);

    SurfaceHandle surface_create(int width, int height);
    void surface_set_texture_filter(SurfaceHandle handle, TextureFilter filter);
    void surface_destroy(SurfaceHandle handle);
    bool surface_set_target(SurfaceHandle handle);
    void surface_reset_target();
    void surface_clear(Color color = {});
    void surface_draw(SurfaceHandle handle, float x, float y,
                      float depth = 0.0f,
                      float xscale = 1.0f, float yscale = 1.0f,
                      float rotationRad = 0.0f, Color color = {}, float alpha = 1.0f);

    Sprite load_sprite(const std::string& file_location, int texture_group_id);
    void sprite_atlas_set_texture_filter(const Sprite& sprite, TextureFilter filter);

    void draw_sprite(float x, float y,const Sprite& sprite,int frame,float depth = 0.0f);
    void draw_sprite(float x, float y, const Sprite& sprite, int frame, float depth,float xscale = 1.0f, float yscale = 1.0f,float rotationRad = 0.0f, float alpha = 1.0f);

    void draw_line(float x1, float y1, float x2, float y2,float depth,float thickness = 1.0f,Color color = {});
    void draw_triangle(Vec2 p0, Vec2 p1, Vec2 p2,float depth,Color color = {});
    void draw_rectangle(float x, float y, float width, float height,float depth,Color color = {});
    void draw_convex_polygon(const std::vector<Vec2>& points,float depth,Color color = {});
    void draw_regular_polygon(float centerX, float centerY,float radius, int sides,float depth,Color color = {},float rotationRad = 0.0f);
}
```

- `set_default_texture_filter(...)` changes the default filter used by textures created after the call. Existing textures are not retroactively updated.
- `surface_set_texture_filter(...)` immediately changes one existing surface texture.
- `sprite_atlas_set_texture_filter(...)` immediately changes the atlas texture backing that sprite. Because sprites share atlases, this can also affect other sprites stored in the same atlas.
- `load_sprite` performs a raw load (no caching). Typically you should use the `ResourceManager` wrapper, but direct calls are available when you want manual ownership.
- Preferred `draw_sprite` parameter order is `x`, `y`, `sprite`, `frame`, `depth`, then optional transform/alpha values.

## Draw transform semantics
- `xscale` / `yscale`
  - default `1.0f`
  - negative value flips the sprite (`xscale < 0` = horizontal flip, `yscale < 0` = vertical flip)
- `rotationRad`
  - rotation in **radians** around the sprite pivot (after scaling)
- `alpha`
  - multiplied with texture alpha, clamped internally to `[0, 1]`
  - `1.0f` fully opaque, `0.0f` fully transparent

Out-of-range frame indices are ignored safely.

## Color multiply behavior
- Geometry and sprite color both use multiply blending at shader input:
  - `finalColor = textureSample * vertexColor`
- For sprites, default vertex color is white, so existing sprite visuals remain unchanged.
- For pure geometry, renderer uses an internal 1x1 white texture so shapes run through the same batching path.

## Surface (off-screen render target) MVP
- Surface format is fixed to RGBA8 in this version.
- One active render target at a time (either backbuffer or one surface).
- `surface_set_target(...)` and `surface_reset_target()` flush pending batches automatically.
- `surface_clear(...)` is explicit/manual (no auto-clear on bind).
- Safety rule: a surface cannot be sampled while it is the current target (self read/write is blocked).
- Current implementation limit: up to 64 live surfaces.

Minimal flow:
```cpp
using namespace engine::draw;

auto s = surface_create(512, 512);
surface_set_target(s);
surface_clear({0, 0, 0, 0});
draw_rectangle(20, 20, 100, 100, 0.0f, {1, 0, 0, 1});
surface_reset_target();

surface_draw(s, 200, 120, 0.0f);
surface_destroy(s);
```

## Shader effects live in a separate manual

Lightweight custom fragment shader effects are documented in:

- `MANUAL_shaders.md`

That shader path is intentionally narrower than the main draw API:
- primarily surface-oriented
- fixed engine vertex shader
- custom fragment shader only
- small built-in/custom uniform scope

## Font / Text API

Declared in `engine/draw/text_api.hpp`:

```cpp
namespace engine::draw {
    struct AsciiFont { /* ... */ };
    struct BitmapGlyph { /* page + rect + metrics */ };
    struct BitmapPage { /* fileName + texture info */ };
    struct BitmapFont { /* global metrics + pages + glyph map */ };

    AsciiFont load_ascii_font(const std::string& base_path, int texture_group_id, int first_char = 32, int glyph_count = 95, float spacing = 0.0f);
    BitmapFont load_bitmap_font(const std::string& base_path, int texture_group_id);
    bool write_bitmap_font_metadata(const BitmapFont& font);

    float text_width(const AsciiFont& font, const std::string& text, float xscale = 1.0f, float letterSpacing = 0.0f);
    float text_height(const AsciiFont& font, const std::string& text, float yscale = 1.0f);
    float text_width(const BitmapFont& font, const std::string& utf8_text, float xscale = 1.0f, float letterSpacing = 0.0f);
    float text_height(const BitmapFont& font, const std::string& utf8_text, float yscale = 1.0f);

    void draw_text(const AsciiFont& font, const std::string& text, float x, float y, float depth = 0.0f, float xscale = 1.0f, float yscale = 1.0f, float rotationRad = 0.0f, Color color = {}, float alpha = 1.0f, float letterSpacing = 0.0f);
    void draw_text(const BitmapFont& font, const std::string& utf8_text, float x, float y, float depth = 0.0f, float xscale = 1.0f, float yscale = 1.0f, float rotationRad = 0.0f, Color color = {}, float alpha = 1.0f, float letterSpacing = 0.0f);
}
```

### Measurement helpers
- `text_width(...)` returns the width of the widest line.
- `text_height(...)` returns total multiline height.
- Both helpers mirror the spacing/advance behavior of `draw_text(...)`, including `\n`, `\t`, font spacing, fallback glyph advance, and optional `letterSpacing` / scale inputs.

Example:
```cpp
float w = engine::draw::text_width(font, label, 1.0f, 0.0f);
float h = engine::draw::text_height(font, label, 1.0f);
engine::draw::draw_text(font, label, x - w * 0.5f, y - h * 0.5f);
```

### ASCII usage (legacy/simple)
- Files required: `<base>.png` + `<base>.txt`
- Characters map continuously from `first_char`.

### Paged bitmap usage (`ANGEL_FONT 2`, recommended)
For base path `<base>` (e.g. `assets/font/cn_ui_32`), provide:
- `<base>.font.txt` (single metadata file)
- `<base>_fontpage1.png`
- `<base>_fontpage2.png`
- ...

`<base>.font.txt` minimum example:
```txt
ANGEL_FONT 2
pages 2
lineHeight 40
defaultAdvance 40
spacing 0
fallback U+FFFD

page 1 cn_ui_32_fontpage1.png
page 2 cn_ui_32_fontpage2.png

glyph U+4F60 1 0 0 40 40 40 0 0
glyph U+597D 1 40 0 40 40 40 0 0
```

Minimal usage:
```cpp
auto font = engine::draw::load_bitmap_font("assets/font/cn_ui_32", 0);
engine::draw::draw_text(font, "你好，Angel", 100.0f, 120.0f, 0.0f);
```

The renderer exposes lifecycle hooks as well, though they are already managed for you by `Engine`:

```cpp
bool renderer_initialize(platform::Window& window);
void renderer_shutdown();
void renderer_begin_frame();
void renderer_end_frame();
void renderer_present();
```
(Only call these manually if you build tooling outside the provided engine loop.)

## Sprite Structure (for reference)

```cpp
struct Frame {
    float u0, v0, u1, v1;
    float pivotX, pivotY;
    int width, height;
};

struct Sprite {
    int textureGroupID;
    int atlasIndex;
    int frameCount;
    GLuint textureHandle;
    std::vector<Frame> frames;
};
```
You generally treat `Sprite` as read-only data consumed by `draw_sprite`.
