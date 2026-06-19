# Angel Engine Manual — Resources and Sprites

## 3. Resources & Sprites

### `engine::utils::ResourceManager`
Caches sprites by path and texture group:

```cpp
auto& sprite = engine::utils::ResourceManager::instance()
                  .load_sprite("assets/image/hero", /*texture group*/ 0);
```

Path contract (important):
- Always use logical paths that start with `assets/`.
- Do not pass absolute paths.
- Do not depend on project-root-relative paths.

Sprite files required for `base_path = "assets/image/hero"`:
- `assets/image/hero.png`
- `assets/image/hero.txt`

`hero.txt` format:
- `pivotX pivotY frameCount frameWidth frameHeight`

Runtime lookup order:
1. `assets.pak` (if mounted/present)
2. `assets/` directory

Build output behavior:
- Build copies `src/assets` -> `<exe_dir>/assets`
- Build also generates `<exe_dir>/assets.pak`

### Sprite atlas size

Sprites are packed into atlas textures managed by the renderer.

Current behavior:
- default atlas size starts at `2048 x 2048`
- the size is configurable through:

```cpp
engine::draw::set_default_sprite_atlas_size(int size);
int current = engine::draw::default_sprite_atlas_size();
```

- this affects atlases created **after** the call
- it does not resize or rebuild atlases that already exist

Practical consequence:
- a single source sprite PNG must fit inside one atlas allocation
- with the default settings, that means both source image width and height must be `<= 2048`
- if you increase the default atlas size before loading sprites, larger source PNGs can fit, up to the atlas size you selected

Tradeoff note:
- larger atlases allow larger source images and reduce atlas churn
- larger atlases also increase texture memory cost significantly

You can also bypass the cache and call the renderer directly (see `MANUAL_renderer_draw_api.md`).
