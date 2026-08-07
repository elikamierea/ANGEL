# Angel Engine Manual - Drawing Basics

This file covers the normal drawing path only.
For surfaces and shader effects, read `MANUAL_render_advanced.md`.

## Basic drawing types

The main drawing types are:

```cpp
struct Color { float r, g, b, a; };
struct Vec2 { float x, y; };
struct Sprite;
struct AsciiFont;
struct BitmapFont;
```

`Color{}` defaults to white.

## Sprite resources

Recommended cached sprite load path:

```cpp
auto& sprite = resources().load_sprite("assets/image/hero", 0);
```

Equivalent explicit form:

```cpp
auto& sprite = ResourceManager::instance().load_sprite("assets/image/hero", 0);
```

Direct uncached load path:

```cpp
Sprite sprite = load_sprite("assets/image/hero", 0);
```

Path contract:
- always use logical paths starting with `assets/`
- do not pass absolute paths
- omit the `.png` / `.txt` suffix from the base path

For `base_path = "assets/image/hero"`, the runtime expects:
- `assets/image/hero.png`
- `assets/image/hero.txt`

`hero.txt` format:

```txt
pivotX pivotY frameCount frameWidth frameHeight
```

Runtime lookup order:
1. `assets.pak`
2. `assets/`

## Sprite atlas settings

Atlas size helpers:

```cpp
void set_default_sprite_atlas_size(int size);
int default_sprite_atlas_size();
```

Notes:
- the default starts at `2048`
- this affects atlases created after the call
- already-created atlases are not rebuilt
- a source sprite image must fit inside one atlas allocation

## Texture filtering

Public helpers:

```cpp
enum class TextureFilter {
    Linear,
    Nearest,
};

void set_default_texture_filter(TextureFilter filter);
void sprite_atlas_set_texture_filter(const Sprite& sprite, TextureFilter filter);
```

Notes:
- `set_default_texture_filter(...)` affects textures created after the call. The initial default is Linear.
- `sprite_atlas_set_texture_filter(...)` changes the existing atlas texture for that sprite
- because sprites share atlases, changing one sprite's atlas filter can affect other sprites packed into the same atlas

If the visual effect of Linear filter is too blurry, try Nearest.

## Sprite drawing

Available overloads:

```cpp
void draw_sprite(float x, float y, const Sprite& sprite, int frame, float depth = 0.0f);

void draw_sprite(float x, float y, const Sprite& sprite, int frame,
                 float depth,
                 float xscale, float yscale,
                 float rotationRad, float alpha);

void draw_sprite(float x, float y, const Sprite& sprite, int frame,
                 float depth,
                 float xscale, float yscale,
                 float rotationRad, float alpha, Color color,
                 float skewX = 0.0f, float skewY = 0.0f);
```

Preferred mental model:
- `x`, `y` come first
- `frame` selects the sprite frame
- `depth` controls draw order
- optional transform/color parameters come after that

Transform semantics:
- `xscale` / `yscale`
  - default `1.0f`
  - negative values flip the sprite
- `rotationRad`
  - rotation in radians
- `alpha`
  - multiplied with sprite alpha
- `skewX` / `skewY`
  - shear angles in radians, default `0.0f`
  - only available on the `Color` overload
  - `skewX` shears horizontally (x offset grows with local y),
    `skewY` shears vertically

All transforms are applied around the sprite's pivot. The compose order is:

```text
T(x, y) * R(rotationRad) * Shear(skewX, skewY) * S(xscale, yscale)
```

That is: scale first, then skew the scaled shape, then rotate the sheared
result as a rigid body, then translate to `(x, y)`. Rotation and skew therefore
combine the way a "free transform" tool behaves, not as two independent axes.

Frame index starts from 0.

Out-of-range frame indices are ignored safely.

## Primitive drawing

Public helpers:

```cpp
void draw_line(float x1, float y1, float x2, float y2,
               float depth, float thickness = 1.0f, Color color = {});

void draw_triangle(Vec2 p0, Vec2 p1, Vec2 p2,
                   float depth, Color color = {});

void draw_rectangle(float x, float y,
                    float width, float height,
                    float depth, Color color = {});

void draw_convex_polygon(const std::vector<Vec2>& points,
                         float depth, Color color = {});

void draw_regular_polygon(float centerX, float centerY,
                          float radius, int sides,
                          float depth, Color color = {},
                          float rotationRad = 0.0f);
```

Color behavior:
- sprites and geometry both use multiply tinting
- geometry internally uses a white texture so it can share the normal draw path

## Fonts and text

Public types:
- `AsciiFont`
- `BitmapFont`
- `BitmapGlyph`

Loading:

```cpp
AsciiFont load_ascii_font(const std::string& base_path,
                          int texture_group_id,
                          int first_char = 32,
                          int glyph_count = 95,
                          float spacing = 0.0f);

BitmapFont load_bitmap_font(const std::string& base_path,
                            int texture_group_id);

bool write_bitmap_font_metadata(const BitmapFont& font);
```

Measurement:

```cpp
float text_width(const AsciiFont& font, const std::string& text,
                 float xscale = 1.0f, float letterSpacing = 0.0f);

float text_height(const AsciiFont& font, const std::string& text,
                  float yscale = 1.0f);

float text_width(const BitmapFont& font, const std::string& utf8_text,
                 float xscale = 1.0f, float letterSpacing = 0.0f);

float text_height(const BitmapFont& font, const std::string& utf8_text,
                  float yscale = 1.0f);
```

Drawing:

```cpp
void draw_text(const AsciiFont& font, const std::string& text,
               float x, float y, float depth = 0.0f,
               float xscale = 1.0f, float yscale = 1.0f,
               float rotationRad = 0.0f, Color color = {},
               float alpha = 1.0f, float letterSpacing = 0.0f);

void draw_text(const BitmapFont& font, const std::string& utf8_text,
               float x, float y, float depth = 0.0f,
               float xscale = 1.0f, float yscale = 1.0f,
               float rotationRad = 0.0f, Color color = {},
               float alpha = 1.0f, float letterSpacing = 0.0f);
```

Measurement helpers mirror the draw path:
- multiline layout
- scale
- font spacing
- optional letter spacing

## ASCII font files

For ASCII fonts, the runtime expects:
- `<base>.png`
- `<base>.txt`

Characters map continuously from `first_char`.

## Bitmap font files

Recommended bitmap font format uses `ANGEL_FONT 2`.

For base path `<base>`, provide:
- `<base>.font.txt`
- `<base>_fontpage1.png`
- `<base>_fontpage2.png`
- ...

Minimum metadata example:

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
