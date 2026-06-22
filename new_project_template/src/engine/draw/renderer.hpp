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
    void surface_flush(SurfaceHandle handle, float depth);
    bool surface_set_target(SurfaceHandle handle);
    void surface_reset_target();
    void surface_clear(Color color);
    void surface_clear(float depth, Color color);
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

    enum class RenderNodeType {
        DrawBatch,
        Clear,
        Flush,
        SurfaceComposite,
        SurfaceCompositeShader,
    };

    struct RenderNode {
        RenderNodeType type{RenderNodeType::DrawBatch};
        float depth{0.0f};
        std::uint64_t submissionOrder{0};
        CommandBuffer batch;
        Color clearColor{};
        SurfaceHandle surfaceHandle{kInvalidSurfaceHandle};
        ShaderHandle shaderHandle{kInvalidShaderHandle};
        ShaderUniformMap shaderUniforms;
        float x{0.0f};
        float y{0.0f};
        float xscale{1.0f};
        float yscale{1.0f};
        float rotationRad{0.0f};
        Color color{};
        float alpha{1.0f};
    };

    struct SurfaceTimeline {
        SurfaceHandle handle{kInvalidSurfaceHandle};
        bool isMainSurface{false};
        bool sorted{true};
        std::vector<RenderNode> nodes;
        std::size_t executedCount{0};
        bool inExecution{false};
    };

    Renderer() = default;

    bool load_gl_symbols(platform::Window& window);
    bool create_shader_program();
    bool create_effect_shader_program(const std::string& fragmentSource, ShaderResource& outResource);
    GLuint compile_shader(GLenum type, const char* source);
    void destroy_shader_program();
    void upload_batches(CommandBuffer& buffer);
    void update_view_projection();
    void bind_view_projection(GLint location) const;
    Color sanitize_color(Color color) const;
    void apply_blend_mode();
    std::string build_effect_fragment_source(const std::string& fragmentSource) const;
    void apply_shader_uniforms(ShaderResource& shader, const SurfaceResource& surface, Color color);
    void ensure_custom_uniform_location(ShaderResource& shader, const std::string& name);
    SurfaceTimeline& active_timeline();
    SurfaceTimeline& timeline_for(SurfaceHandle handle);
    void reset_frame_timelines();
    RenderNode& emplace_node(SurfaceTimeline& timeline, RenderNodeType type, float depth);
    void sort_timeline_if_needed(SurfaceTimeline& timeline);
    void execute_timeline_until(SurfaceTimeline& timeline, float depth, std::uint64_t submissionOrder, bool inclusive);
    void execute_node(const RenderNode& node, SurfaceTimeline& timeline);
    void bind_surface_target(SurfaceHandle handle);
    void execute_surface_composite_node(const RenderNode& node, bool useShader);

private:
    bool m_initialized{false};
    platform::Window* m_window{nullptr};
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
    std::unordered_map<SurfaceHandle, SurfaceTimeline> m_timelines;
    std::vector<SurfaceHandle> m_pendingDestroySurfaces;
    std::vector<ShaderHandle> m_pendingDestroyShaders;
    SurfaceHandle m_nextSurfaceHandle{1};
    ShaderHandle m_nextShaderHandle{1};
    SurfaceHandle m_activeSurface{kInvalidSurfaceHandle};
    SurfaceHandle m_submissionTarget{kInvalidSurfaceHandle};
    float m_elapsedTime{0.0f};
    std::uint64_t m_nextSubmissionOrder{1};
};

} // namespace engine::draw
