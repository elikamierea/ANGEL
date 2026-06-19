# image-tools

Use hidden image tools with schema-style JSON definitions.

## crop_image

```json
{
  "name": "crop_image",
  "description": "Crop a rectangular region from a project image and save as PNG.",
  "parameters": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Source image path relative to project root." },
      "x": { "type": "number", "description": "Crop origin x in pixels." },
      "y": { "type": "number", "description": "Crop origin y in pixels." },
      "width": { "type": "number", "description": "Crop width in pixels." },
      "height": { "type": "number", "description": "Crop height in pixels." },
      "outPath": { "type": "string", "description": "Output PNG path relative to project root. Default: src/assets/crop_<timestamp>.png" }
    },
    "required": ["path", "x", "y", "width", "height"],
    "additionalProperties": false
  }
}
```

## create_sprite

```json
{
  "name": "create_sprite",
  "description": "Compose multiple project images into one sprite atlas PNG and one metadata TXT using the same core pipeline as topbar Create Sprite.",
  "parameters": {
    "type": "object",
    "properties": {
      "images": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Image paths relative to project root; each image becomes one frame in order."
      },
      "pivotX": { "type": "number", "description": "Per-frame pivot x in pixels. Default: 0" },
      "pivotY": { "type": "number", "description": "Per-frame pivot y in pixels. Default: 0" },
      "outPath": { "type": "string", "description": "Output atlas PNG path relative to project root. A sibling TXT metadata file is also written. Default: src/assets/sprite_<timestamp>.png" },
      "overwrite": { "type": "boolean", "description": "Whether to overwrite an existing sprite (.png/.txt) at the same path/name. Default: true. When false and the sprite already exists, nothing is written and the call returns { ok: false, reason: \"exists\" }." }
    },
    "required": ["images"],
    "additionalProperties": false
  }
}
```

Notes:
- Requires an opened project.
- `create_sprite` writes two files: `<name>.png` and `<name>.txt`.
- By default an existing sprite at the same path/name is overwritten. Pass `overwrite: false` to refuse instead; the call then returns `{ ok: false, reason: "exists" }` and leaves the existing files untouched.
- Do not use grid/padding parameters; behavior is intentionally aligned with topbar Create Sprite.
