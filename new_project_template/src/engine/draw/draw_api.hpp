#pragma once

#include "engine/draw/sprite.hpp"

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace platform {
class Window;
}

namespace engine::draw {

struct Color {
    float r{1.0f};
    float g{1.0f};
    float b{1.0f};
    float a{1.0f};
};

struct Vec2 {
    float x{0.0f};
    float y{0.0f};
};

enum class BlendMode {
    Alpha,
    Additive,
};

enum class TextureFilter {
    Linear,
    Nearest,
};

using SurfaceHandle = std::uint32_t;
constexpr SurfaceHandle kInvalidSurfaceHandle = 0;
using ShaderHandle = std::uint32_t;
constexpr ShaderHandle kInvalidShaderHandle = 0;

struct ShaderUniformValue {
    enum class Type {
        Float,
        Vec2,
        Vec4,
    };

    Type type{Type::Float};
    float x{0.0f};
    float y{0.0f};
    float z{0.0f};
    float w{0.0f};
};

using ShaderUniformMap = std::unordered_map<std::string, ShaderUniformValue>;

bool renderer_initialize(platform::Window& window);
void renderer_shutdown();
void renderer_begin_frame();
void renderer_end_frame();
void renderer_present();

void draw_set_blend_mode(BlendMode mode);
void set_default_texture_filter(TextureFilter filter);
void set_default_sprite_atlas_size(int size);
int default_sprite_atlas_size();

ShaderHandle shader_create_from_fragment(const std::string& fragmentSource);
void shader_destroy(ShaderHandle handle);
void shader_set_uniform_float(ShaderHandle handle, const std::string& name, float value);
void shader_set_uniform_vec2(ShaderHandle handle, const std::string& name, float x, float y);
void shader_set_uniform_vec4(ShaderHandle handle, const std::string& name, float x, float y, float z, float w);

SurfaceHandle surface_create(int width, int height);
void surface_set_texture_filter(SurfaceHandle handle, TextureFilter filter);
void surface_destroy(SurfaceHandle handle);
void surface_flush(SurfaceHandle handle, float depth = 0.0f);
bool surface_set_target(SurfaceHandle handle);
void surface_reset_target();
void surface_clear(Color color = {});
void surface_clear(float depth, Color color);
void surface_draw(SurfaceHandle handle, float x, float y,
                  float depth = 0.0f,
                  float xscale = 1.0f, float yscale = 1.0f,
                  float rotationRad = 0.0f, Color color = {}, float alpha = 1.0f);
void surface_draw_with_shader(SurfaceHandle handle, ShaderHandle shader, float x, float y,
                              float depth = 0.0f,
                              float xscale = 1.0f, float yscale = 1.0f,
                              float rotationRad = 0.0f, Color color = {}, float alpha = 1.0f);

Sprite load_sprite(const std::string& file_location, int texture_group_id);
void sprite_atlas_set_texture_filter(const Sprite& sprite, TextureFilter filter);

// Legacy order
void draw_sprite(float x, float y, const Sprite& sprite, int frame, float depth = 0.0f);

// Extended overload (keeps x/y first, consistent with legacy order)
void draw_sprite(float x, float y, const Sprite& sprite, int frame,
                 float depth,
                 float xscale = 1.0f, float yscale = 1.0f,
                 float rotationRad = 0.0f, float alpha = 1.0f);

void draw_sprite(float x, float y, const Sprite& sprite, int frame,
                 float depth,
                 float xscale, float yscale,
                 float rotationRad, Color color, float alpha = 1.0f);

void draw_line(float x1, float y1,
               float x2, float y2,
               float depth,
               float thickness = 1.0f,
               Color color = {});

void draw_triangle(Vec2 p0, Vec2 p1, Vec2 p2,
                   float depth,
                   Color color = {});

void draw_rectangle(float x, float y,
                    float width, float height,
                    float depth,
                    Color color = {});

void draw_convex_polygon(const std::vector<Vec2>& points,
                         float depth,
                         Color color = {});

void draw_regular_polygon(float centerX, float centerY,
                          float radius,
                          int sides,
                          float depth,
                          Color color = {},
                          float rotationRad = 0.0f);

} // namespace engine::draw
