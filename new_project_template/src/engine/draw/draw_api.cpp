#include "engine/draw/draw_api.hpp"

#include "engine/draw/renderer.hpp"

namespace engine::draw {

bool renderer_initialize(platform::Window& window) {
    return Renderer::instance().initialize(window);
}

void renderer_shutdown() {
    Renderer::instance().shutdown();
}

void renderer_begin_frame() {
    Renderer::instance().begin_frame();
}

void renderer_end_frame() {
    Renderer::instance().end_frame();
}

void renderer_present() {
    Renderer::instance().present();
}

void draw_set_blend_mode(BlendMode mode) {
    Renderer::instance().set_blend_mode(mode);
}

void set_default_texture_filter(TextureFilter filter) {
    Renderer::instance().set_default_texture_filter(filter);
}

void set_default_sprite_atlas_size(int size) {
    Renderer::instance().set_default_sprite_atlas_size(size);
}

int default_sprite_atlas_size() {
    return Renderer::instance().default_sprite_atlas_size();
}

ShaderHandle shader_create_from_fragment(const std::string& fragmentSource) {
    return Renderer::instance().shader_create_from_fragment(fragmentSource);
}

void shader_destroy(ShaderHandle handle) {
    Renderer::instance().shader_destroy(handle);
}

void shader_set_uniform_float(ShaderHandle handle, const std::string& name, float value) {
    Renderer::instance().shader_set_uniform_float(handle, name, value);
}

void shader_set_uniform_vec2(ShaderHandle handle, const std::string& name, float x, float y) {
    Renderer::instance().shader_set_uniform_vec2(handle, name, x, y);
}

void shader_set_uniform_vec4(ShaderHandle handle, const std::string& name, float x, float y, float z, float w) {
    Renderer::instance().shader_set_uniform_vec4(handle, name, x, y, z, w);
}

SurfaceHandle surface_create(int width, int height) {
    return Renderer::instance().surface_create(width, height);
}

void surface_set_texture_filter(SurfaceHandle handle, TextureFilter filter) {
    Renderer::instance().surface_set_texture_filter(handle, filter);
}

void surface_destroy(SurfaceHandle handle) {
    Renderer::instance().surface_destroy(handle);
}

void surface_flush(SurfaceHandle handle, float depth) {
    Renderer::instance().surface_flush(handle, depth);
}

bool surface_set_target(SurfaceHandle handle) {
    return Renderer::instance().surface_set_target(handle);
}

void surface_reset_target() {
    Renderer::instance().surface_reset_target();
}

void surface_clear(Color color) {
    Renderer::instance().surface_clear(color);
}

void surface_clear(float depth, Color color) {
    Renderer::instance().surface_clear(depth, color);
}

void surface_draw(SurfaceHandle handle, float x, float y,
                  float depth,
                  float xscale, float yscale,
                  float rotationRad, Color color, float alpha) {
    Renderer::instance().surface_draw(handle, x, y, depth, xscale, yscale, rotationRad, color, alpha);
}

void surface_draw_with_shader(SurfaceHandle handle, ShaderHandle shader, float x, float y,
                              float depth,
                              float xscale, float yscale,
                              float rotationRad, Color color, float alpha) {
    Renderer::instance().surface_draw_with_shader(handle, shader, x, y, depth, xscale, yscale, rotationRad, color, alpha);
}

Sprite load_sprite(const std::string& file_location, int texture_group_id) {
    return Renderer::instance().load_sprite(file_location, texture_group_id);
}

void sprite_atlas_set_texture_filter(const Sprite& sprite, TextureFilter filter) {
    Renderer::instance().sprite_atlas_set_texture_filter(sprite, filter);
}

void draw_sprite(float x, float y, const Sprite& sprite, int frame, float depth) {
    Renderer::instance().submit_sprite(x, y, sprite, frame, depth, 1.0f, 1.0f, 0.0f, Color{}, 1.0f);
}

void draw_sprite(float x, float y,const Sprite& sprite, int frame, float depth,
                 float xscale, float yscale,
                 float rotationRad, float alpha) {
    Renderer::instance().submit_sprite(x, y, sprite, frame, depth, xscale, yscale, rotationRad, Color{}, alpha);
}

void draw_sprite(float x, float y, const Sprite& sprite, int frame,
                 float depth,
                 float xscale, float yscale,
                 float rotationRad, Color color, float alpha) {
    Renderer::instance().submit_sprite(x, y, sprite, frame, depth, xscale, yscale, rotationRad, color, alpha);
}

void draw_line(float x1, float y1,
               float x2, float y2,
               float depth,
               float thickness,
               Color color) {
    Renderer::instance().submit_line(x1, y1, x2, y2, depth, thickness, color);
}

void draw_triangle(Vec2 p0, Vec2 p1, Vec2 p2,
                   float depth,
                   Color color) {
    Renderer::instance().submit_triangle(p0, p1, p2, depth, color);
}

void draw_rectangle(float x, float y,
                    float width, float height,
                    float depth,
                    Color color) {
    Renderer::instance().submit_rectangle(x, y, width, height, depth, color);
}

void draw_convex_polygon(const std::vector<Vec2>& points,
                         float depth,
                         Color color) {
    Renderer::instance().submit_convex_polygon(points, depth, color);
}

void draw_regular_polygon(float centerX, float centerY,
                          float radius,
                          int sides,
                          float depth,
                          Color color,
                          float rotationRad) {
    Renderer::instance().submit_regular_polygon(centerX, centerY, radius, sides, depth, color, rotationRad);
}

} // namespace engine::draw
