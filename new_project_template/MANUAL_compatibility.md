# Angel Engine Manual — Compatibility Notes

## 8. Compatibility Notes

- If older game code implicitly relied on cross-group sprite cache reuse, update it to pass the intended `texture_group_id` explicitly at each load site.
- For instance lookups, prefer `instances_of_type<T>()` for most gameplay logic unless you specifically need direct access to the raw registry set.
- Shader effect v1 currently provides only a lightweight fragment-source GLSL ES–style compatibility pass (`#version 300 es` rewrite + common precision qualifier stripping). Treat it as a narrow local-effect feature, not a full GLES shader runtime compatibility layer.
