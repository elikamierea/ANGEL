#pragma once

#include "engine/draw/command_buffer.hpp"
#include "engine/draw/draw_api.hpp"
#include "engine/draw/gpu_abstraction.hpp"
#include "engine/draw/texture_group.hpp"

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace platform {
class Window;
}

namespace engine::draw {

class Renderer {
public:
    static Renderer& instance();

    bool initialize(platform::Window& window);
    void shutdown();

    void begin_frame();
    void end_frame();
    void present();

    void set_blend_mode(BlendMode mode);
    void set_default_texture_filter(TextureFilter filter);
    TextureFilter default_texture_filter() const;
    void set_default_sprite_atlas_size(int size);
    int default_sprite_atlas_size() const;

    ShaderHandle shader_create_from_fragment(const std::string& fragmentSource);
    void shader_destroy(ShaderHandle handle);
    void shader_set_uniform_float(ShaderHandle handle, const std::string& name, float value);
    void shader_set_uniform_vec2(ShaderHandle handle, const std::string& name, float x, float y);
    void shader_set_uniform_vec4(ShaderHandle handle, const std::string& name, float x, float y, float z, float w);

    SurfaceHandle surface_create(int width, int height);
    void surface_set_texture_filter(SurfaceHandle handle, TextureFilter filter);
    void surface_destroy(SurfaceHandle handle);
    bool surface_set_target(SurfaceHandle handle);
    void surface_reset_target();
    void surface_clear(Color color);
    void surface_draw(SurfaceHandle handle, float x, float y,
                      float depth,
                      float xscale, float yscale,
                      float rotationRad, Color color, float alpha);
    void surface_draw_with_shader(SurfaceHandle handle, ShaderHandle shader, float x, float y,
                                  float depth,
                                  float xscale, float yscale,
                                  float rotationRad, Color color, float alpha);

    Sprite load_sprite(const std::string& file_location, int texture_group_id);
    void sprite_atlas_set_texture_filter(const Sprite& sprite, TextureFilter filter);
    void apply_texture_filter(GLuint texture, TextureFilter filter) const;
    void submit_sprite(float x, float y, const Sprite& sprite, int frame,
                       float depth,
                       float xscale = 1.0f, float yscale = 1.0f,
                       float rotationRad = 0.0f, Color color = {}, float alpha = 1.0f);

    void submit_line(float x1, float y1,
                     float x2, float y2,
                     float depth,
                     float thickness,
                     Color color);

    void submit_triangle(Vec2 p0, Vec2 p1, Vec2 p2,
                         float depth,
                         Color color);

    void submit_rectangle(float x, float y,
                          float width, float height,
                          float depth,
                          Color color);

    void submit_convex_polygon(const std::vector<Vec2>& points,
                               float depth,
                               Color color);

    void submit_regular_polygon(float centerX, float centerY,
                                float radius,
                                int sides,
                                float depth,
                                Color color,
                                float rotationRad);

private:
    struct SurfaceResource {
        GLuint framebuffer{0};
        GLuint texture{0};
        int width{0};
        int height{0};
    };

    struct ShaderResource {
        GLuint program{0};
        GLint viewProjLocation{-1};
        GLint textureLocation{-1};
        GLint timeLocation{-1};
        GLint inputSizeLocation{-1};
        GLint inputTexelSizeLocation{-1};
        GLint colorLocation{-1};
        std::unordered_map<std::string, GLint> customLocations;
        ShaderUniformMap customUniforms;
    };

    Renderer() = default;

    bool load_gl_symbols(platform::Window& window);
    bool create_shader_program();
    bool create_effect_shader_program(const std::string& fragmentSource, ShaderResource& outResource);
    GLuint compile_shader(GLenum type, const char* source);
    void destroy_shader_program();
    void upload_batches();
    void update_view_projection();
    void bind_view_projection(GLint location) const;
    Color sanitize_color(Color color) const;
    void apply_blend_mode();
    std::string build_effect_fragment_source(const std::string& fragmentSource) const;
    void apply_shader_uniforms(ShaderResource& shader, const SurfaceResource& surface, Color color);
    void ensure_custom_uniform_location(ShaderResource& shader, const std::string& name);

private:
    bool m_initialized{false};
    platform::Window* m_window{nullptr};
    CommandBuffer m_commandBuffer;
    TextureGroupManager m_textureManager;
    GPUDevice m_device;

    GLuint m_shaderProgram{0};
    GLuint m_whiteTexture{0};
    GLint m_viewProjLocation{-1};
    int m_viewWidth{0};
    int m_viewHeight{0};
    BlendMode m_blendMode{BlendMode::Alpha};
    TextureFilter m_defaultTextureFilter{TextureFilter::Linear};

    std::unordered_map<SurfaceHandle, SurfaceResource> m_surfaces;
    std::unordered_map<ShaderHandle, ShaderResource> m_shaders;
    SurfaceHandle m_nextSurfaceHandle{1};
    ShaderHandle m_nextShaderHandle{1};
    SurfaceHandle m_activeSurface{kInvalidSurfaceHandle};
    float m_elapsedTime{0.0f};
};

} // namespace engine::draw
