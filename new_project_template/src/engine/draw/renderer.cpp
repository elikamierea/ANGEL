#include "engine/draw/renderer.hpp"

#include "engine/debug/debug_tools.hpp"
#include "platform/window.hpp"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <vector>

#define GLFW_INCLUDE_NONE
#include <GLFW/glfw3.h>

namespace engine::draw {
namespace {

struct Mat4 {
    float data[16]{};
};

Mat4 make_ortho(float left, float right, float bottom, float top) {
    const float rl = right - left;
    const float tb = top - bottom;
    const float fn = 2.0f; // far - near with near=-1, far=1

    Mat4 m{};
    m.data[0] = 2.0f / rl;
    m.data[5] = 2.0f / tb;
    m.data[10] = -2.0f / fn;
    m.data[15] = 1.0f;
    m.data[12] = -(right + left) / rl;
    m.data[13] = -(top + bottom) / tb;
    return m;
}

constexpr const char* kVertexShader = R"GLSL(#version 330 core
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aColor;

uniform mat4 uViewProj;

out vec2 vUV;
out vec4 vColor;

void main() {
    vUV    = aUV;
    vColor = aColor;
    gl_Position = uViewProj * vec4(aPosition.xy, 0.0, 1.0);
}
)GLSL";

constexpr const char* kFragmentShader = R"GLSL(#version 330 core
in vec2 vUV;
in vec4 vColor;

uniform sampler2D uTexture;

out vec4 FragColor;

void main() {
    vec4 color = texture(uTexture, vUV) * vColor;
    FragColor = color;
}
)GLSL";

constexpr const char* kEffectVertexShader = R"GLSL(#version 330 core
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aColor;

uniform mat4 uViewProj;

out vec2 vUV;
out vec4 vColor;

void main() {
    vUV = aUV;
    vColor = aColor;
    gl_Position = uViewProj * vec4(aPosition.xy, 0.0, 1.0);
}
)GLSL";

struct DrawRange {
    GLuint texture{0};
    GLsizei indexCount{0};
    std::size_t indexOffset{0};
};

} // namespace

Renderer& Renderer::instance() {
    static Renderer renderer;
    return renderer;
}

bool Renderer::initialize(platform::Window& window) {
    if (m_initialized) {
        return true;
    }

    m_window = &window;

    if (!load_gl_symbols(window)) {
        engine::debug::log_error("Failed to load OpenGL symbols");
        return false;
    }

    if (!m_device.initialize()) {
        engine::debug::log_error("Failed to initialize GPU device");
        return false;
    }

    if (!create_shader_program()) {
        engine::debug::log_error("Failed to create renderer shader program");
        return false;
    }

    glGenTextures(1, &m_whiteTexture);
    glBindTexture(GL_TEXTURE_2D, m_whiteTexture);
    unsigned char whitePixel[4] = {255, 255, 255, 255};
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, whitePixel);
    apply_texture_filter(m_whiteTexture, m_defaultTextureFilter);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glBindTexture(GL_TEXTURE_2D, 0);

    glEnable(GL_BLEND);
    apply_blend_mode();

    m_initialized = true;
    engine::debug::log_info("Renderer initialized (OpenGL 3.3 Core)");
    return true;
}

void Renderer::shutdown() {
    if (!m_initialized) {
        return;
    }

    for (auto& [_, surface] : m_surfaces) {
        if (surface.framebuffer != 0) {
            glDeleteFramebuffers(1, &surface.framebuffer);
        }
        if (surface.texture != 0) {
            glDeleteTextures(1, &surface.texture);
        }
    }
    m_surfaces.clear();
    for (auto& [_, shader] : m_shaders) {
        if (shader.program != 0) {
            glDeleteProgram(shader.program);
        }
    }
    m_shaders.clear();
    m_activeSurface = kInvalidSurfaceHandle;

    m_textureManager.shutdown();
    m_device.shutdown();
    destroy_shader_program();
    if (m_whiteTexture != 0) {
        glDeleteTextures(1, &m_whiteTexture);
        m_whiteTexture = 0;
    }
    m_window = nullptr;
    m_initialized = false;
}

bool Renderer::load_gl_symbols(platform::Window& window) {
    auto* handle = window.native_handle();
    if (handle == nullptr) {
        return false;
    }

    if (!load_gl_functions(reinterpret_cast<GLLoadProc>(glfwGetProcAddress))) {
        return false;
    }
    return true;
}

void Renderer::begin_frame() {
    if (!m_initialized || m_window == nullptr) {
        return;
    }

    m_activeSurface = kInvalidSurfaceHandle;
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    m_window->framebuffer_size(m_viewWidth, m_viewHeight);
    glViewport(0, 0, m_viewWidth, m_viewHeight);
    glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);
    m_commandBuffer.clear();
    m_elapsedTime += 1.0f / 60.0f;
    glUseProgram(m_shaderProgram);
    update_view_projection();
}

void Renderer::end_frame() {
    if (!m_initialized) {
        return;
    }
    upload_batches();
}

void Renderer::present() {
    if (!m_initialized || m_window == nullptr) {
        return;
    }
    m_window->swap_buffers();
}

void Renderer::set_blend_mode(BlendMode mode) {
    m_blendMode = mode;
    if (!m_initialized) {
        return;
    }
    apply_blend_mode();
}

void Renderer::set_default_texture_filter(TextureFilter filter) {
    m_defaultTextureFilter = filter;
    m_textureManager.set_default_texture_filter(filter);
}

TextureFilter Renderer::default_texture_filter() const {
    return m_defaultTextureFilter;
}

void Renderer::set_default_sprite_atlas_size(int size) {
    m_textureManager.set_default_atlas_size(size);
}

int Renderer::default_sprite_atlas_size() const {
    return m_textureManager.default_atlas_size();
}

ShaderHandle Renderer::shader_create_from_fragment(const std::string& fragmentSource) {
    if (!m_initialized || fragmentSource.empty()) {
        return kInvalidShaderHandle;
    }

    ShaderResource resource{};
    if (!create_effect_shader_program(fragmentSource, resource)) {
        return kInvalidShaderHandle;
    }

    const ShaderHandle handle = m_nextShaderHandle++;
    m_shaders.emplace(handle, std::move(resource));
    return handle;
}

void Renderer::shader_destroy(ShaderHandle handle) {
    if (handle == kInvalidShaderHandle) {
        return;
    }

    auto it = m_shaders.find(handle);
    if (it == m_shaders.end()) {
        return;
    }

    if (it->second.program != 0) {
        glDeleteProgram(it->second.program);
    }
    m_shaders.erase(it);
}

void Renderer::shader_set_uniform_float(ShaderHandle handle, const std::string& name, float value) {
    auto it = m_shaders.find(handle);
    if (it == m_shaders.end() || name.empty()) {
        return;
    }

    it->second.customUniforms[name] = ShaderUniformValue{ShaderUniformValue::Type::Float, value, 0.0f, 0.0f, 0.0f};
    ensure_custom_uniform_location(it->second, name);
}

void Renderer::shader_set_uniform_vec2(ShaderHandle handle, const std::string& name, float x, float y) {
    auto it = m_shaders.find(handle);
    if (it == m_shaders.end() || name.empty()) {
        return;
    }

    it->second.customUniforms[name] = ShaderUniformValue{ShaderUniformValue::Type::Vec2, x, y, 0.0f, 0.0f};
    ensure_custom_uniform_location(it->second, name);
}

void Renderer::shader_set_uniform_vec4(ShaderHandle handle, const std::string& name, float x, float y, float z, float w) {
    auto it = m_shaders.find(handle);
    if (it == m_shaders.end() || name.empty()) {
        return;
    }

    it->second.customUniforms[name] = ShaderUniformValue{ShaderUniformValue::Type::Vec4, x, y, z, w};
    ensure_custom_uniform_location(it->second, name);
}

SurfaceHandle Renderer::surface_create(int width, int height) {
    if (!m_initialized || width <= 0 || height <= 0 || m_surfaces.size() >= 64) {
        return kInvalidSurfaceHandle;
    }

    SurfaceResource resource{};
    glGenTextures(1, &resource.texture);
    glBindTexture(GL_TEXTURE_2D, resource.texture);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    apply_texture_filter(resource.texture, m_defaultTextureFilter);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

    glGenFramebuffers(1, &resource.framebuffer);
    glBindFramebuffer(GL_FRAMEBUFFER, resource.framebuffer);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, resource.texture, 0);

    if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) {
        if (resource.framebuffer != 0) glDeleteFramebuffers(1, &resource.framebuffer);
        if (resource.texture != 0) glDeleteTextures(1, &resource.texture);
        glBindFramebuffer(GL_FRAMEBUFFER, 0);
        glBindTexture(GL_TEXTURE_2D, 0);
        return kInvalidSurfaceHandle;
    }

    resource.width = width;
    resource.height = height;
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glBindTexture(GL_TEXTURE_2D, 0);

    const SurfaceHandle handle = m_nextSurfaceHandle++;
    m_surfaces.emplace(handle, resource);
    return handle;
}

void Renderer::surface_set_texture_filter(SurfaceHandle handle, TextureFilter filter) {
    auto it = m_surfaces.find(handle);
    if (it == m_surfaces.end() || it->second.texture == 0) {
        return;
    }
    apply_texture_filter(it->second.texture, filter);
}

void Renderer::surface_destroy(SurfaceHandle handle) {
    if (handle == kInvalidSurfaceHandle) return;
    auto it = m_surfaces.find(handle);
    if (it == m_surfaces.end()) return;
    if (m_activeSurface == handle) {
        surface_reset_target();
    }
    if (it->second.framebuffer != 0) glDeleteFramebuffers(1, &it->second.framebuffer);
    if (it->second.texture != 0) glDeleteTextures(1, &it->second.texture);
    m_surfaces.erase(it);
}

bool Renderer::surface_set_target(SurfaceHandle handle) {
    auto it = m_surfaces.find(handle);
    if (it == m_surfaces.end()) return false;
    upload_batches();
    m_commandBuffer.clear();
    m_activeSurface = handle;
    glBindFramebuffer(GL_FRAMEBUFFER, it->second.framebuffer);
    glViewport(0, 0, it->second.width, it->second.height);
    update_view_projection();
    return true;
}

void Renderer::surface_reset_target() {
    upload_batches();
    m_commandBuffer.clear();
    m_activeSurface = kInvalidSurfaceHandle;
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(0, 0, m_viewWidth, m_viewHeight);
    update_view_projection();
}

void Renderer::surface_clear(Color color) {
    color = sanitize_color(color);
    glClearColor(color.r, color.g, color.b, color.a);
    glClear(GL_COLOR_BUFFER_BIT);
}

void Renderer::surface_draw(SurfaceHandle handle, float x, float y,
                            float depth,
                            float xscale, float yscale,
                            float rotationRad, Color color, float alpha) {
    auto it = m_surfaces.find(handle);
    if (it == m_surfaces.end() || handle == m_activeSurface) return;

    Sprite sprite{};
    sprite.textureHandle = it->second.texture;
    sprite.frameCount = 1;
    sprite.frames.push_back(Frame{0.0f, 0.0f, 1.0f, 1.0f, 0.0f, 0.0f, it->second.width, it->second.height});
    submit_sprite(x, y, sprite, 0, depth, xscale, yscale, rotationRad, color, alpha);
}

void Renderer::surface_draw_with_shader(SurfaceHandle handle, ShaderHandle shaderHandle, float x, float y,
                                        float depth,
                                        float xscale, float yscale,
                                        float rotationRad, Color color, float alpha) {
    auto surfaceIt = m_surfaces.find(handle);
    auto shaderIt = m_shaders.find(shaderHandle);
    if (surfaceIt == m_surfaces.end() || shaderIt == m_shaders.end() || handle == m_activeSurface) {
        return;
    }

    upload_batches();
    m_commandBuffer.clear();

    const float w = static_cast<float>(surfaceIt->second.width);
    const float h = static_cast<float>(surfaceIt->second.height);
    float lx[4] = {0.0f, w, w, 0.0f};
    float ly[4] = {0.0f, 0.0f, h, h};
    const float c = std::cos(rotationRad);
    const float s = std::sin(rotationRad);
    color = sanitize_color(color);
    color.a = std::clamp(color.a * alpha, 0.0f, 1.0f);

    for (int i = 0; i < 4; ++i) {
        float sx = lx[i] * xscale;
        float sy = ly[i] * yscale;
        float rx = sx * c - sy * s;
        float ry = sx * s + sy * c;
        lx[i] = x + rx;
        ly[i] = y + ry;
    }

    std::vector<Vertex> vertices;
    vertices.reserve(4);
    vertices.push_back({lx[0], ly[0], 0.0f, 0.0f, color.r, color.g, color.b, color.a});
    vertices.push_back({lx[1], ly[1], 1.0f, 0.0f, color.r, color.g, color.b, color.a});
    vertices.push_back({lx[2], ly[2], 1.0f, 1.0f, color.r, color.g, color.b, color.a});
    vertices.push_back({lx[3], ly[3], 0.0f, 1.0f, color.r, color.g, color.b, color.a});
    const std::vector<std::uint32_t> indices = {0, 1, 2, 0, 2, 3};

    glUseProgram(shaderIt->second.program);
    bind_view_projection(shaderIt->second.viewProjLocation);
    apply_shader_uniforms(shaderIt->second, surfaceIt->second, color);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, surfaceIt->second.texture);
    m_device.upload(vertices, indices);
    m_device.draw_indexed(static_cast<GLsizei>(indices.size()), 0);
    glBindTexture(GL_TEXTURE_2D, 0);
    glUseProgram(m_shaderProgram);
    update_view_projection();
}

Sprite Renderer::load_sprite(const std::string& file_location, int texture_group_id) {
    return m_textureManager.load_sprite(file_location, texture_group_id);
}

void Renderer::sprite_atlas_set_texture_filter(const Sprite& sprite, TextureFilter filter) {
    m_textureManager.sprite_atlas_set_texture_filter(sprite, filter);
}

Color Renderer::sanitize_color(Color color) const {
    color.r = std::clamp(color.r, 0.0f, 1.0f);
    color.g = std::clamp(color.g, 0.0f, 1.0f);
    color.b = std::clamp(color.b, 0.0f, 1.0f);
    color.a = std::clamp(color.a, 0.0f, 1.0f);
    return color;
}

void Renderer::apply_texture_filter(GLuint texture, TextureFilter filter) const {
    if (texture == 0) {
        return;
    }

    const GLint glFilter = (filter == TextureFilter::Nearest) ? GL_NEAREST : GL_LINEAR;
    glBindTexture(GL_TEXTURE_2D, texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, glFilter);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, glFilter);
    glBindTexture(GL_TEXTURE_2D, 0);
}

void Renderer::apply_blend_mode() {
    switch (m_blendMode) {
        case BlendMode::Alpha:
            glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
            break;
        case BlendMode::Additive:
            glBlendFunc(GL_SRC_ALPHA, GL_ONE);
            break;
        default:
            glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
            break;
    }
}

void Renderer::submit_sprite(float x, float y, const Sprite& sprite, int frame,
                             float depth,
                             float xscale, float yscale,
                             float rotationRad, Color color, float alpha) {
    if (!m_initialized) {
        return;
    }
    if (sprite.frames.empty() || frame < 0 || frame >= sprite.frameCount) {
        return;
    }

    const auto& frameData = sprite.frames[static_cast<std::size_t>(frame)];
    DrawCommand command{};
    command.glTextureID = sprite.textureHandle;
    command.depth = depth;
    command.vertices.reserve(4);
    command.indices = {0, 1, 2, 0, 2, 3};

    const float w = static_cast<float>(frameData.width);
    const float h = static_cast<float>(frameData.height);

    float lx[4] = {
        -frameData.pivotX,
        w - frameData.pivotX,
        w - frameData.pivotX,
        -frameData.pivotX,
    };
    float ly[4] = {
        -frameData.pivotY,
        -frameData.pivotY,
        h - frameData.pivotY,
        h - frameData.pivotY,
    };

    const float c = std::cos(rotationRad);
    const float s = std::sin(rotationRad);
    color = sanitize_color(color);
    color.a = std::clamp(color.a * alpha, 0.0f, 1.0f);

    for (int i = 0; i < 4; ++i) {
        float sx = lx[i] * xscale;
        float sy = ly[i] * yscale;

        float rx = sx * c - sy * s;
        float ry = sx * s + sy * c;

        lx[i] = x + rx;
        ly[i] = y + ry;
    }

    command.vertices.push_back({lx[0], ly[0], frameData.u0, frameData.v0, color.r, color.g, color.b, color.a});
    command.vertices.push_back({lx[1], ly[1], frameData.u1, frameData.v0, color.r, color.g, color.b, color.a});
    command.vertices.push_back({lx[2], ly[2], frameData.u1, frameData.v1, color.r, color.g, color.b, color.a});
    command.vertices.push_back({lx[3], ly[3], frameData.u0, frameData.v1, color.r, color.g, color.b, color.a});

    m_commandBuffer.push(command);
}

void Renderer::submit_line(float x1, float y1,
                           float x2, float y2,
                           float depth,
                           float thickness,
                           Color color) {
    if (!m_initialized) {
        return;
    }

    const float dx = x2 - x1;
    const float dy = y2 - y1;
    const float length = std::sqrt(dx * dx + dy * dy);
    if (length <= std::numeric_limits<float>::epsilon()) {
        return;
    }

    const float half = std::max(0.5f, thickness * 0.5f);
    const float nx = -dy / length;
    const float ny = dx / length;
    color = sanitize_color(color);

    DrawCommand command{};
    command.glTextureID = m_whiteTexture;
    command.depth = depth;
    command.vertices = {
        {x1 + nx * half, y1 + ny * half, 0.0f, 0.0f, color.r, color.g, color.b, color.a},
        {x2 + nx * half, y2 + ny * half, 1.0f, 0.0f, color.r, color.g, color.b, color.a},
        {x2 - nx * half, y2 - ny * half, 1.0f, 1.0f, color.r, color.g, color.b, color.a},
        {x1 - nx * half, y1 - ny * half, 0.0f, 1.0f, color.r, color.g, color.b, color.a},
    };
    command.indices = {0, 1, 2, 0, 2, 3};

    m_commandBuffer.push(command);
}

void Renderer::submit_triangle(Vec2 p0, Vec2 p1, Vec2 p2,
                               float depth,
                               Color color) {
    if (!m_initialized) {
        return;
    }

    color = sanitize_color(color);

    DrawCommand command{};
    command.glTextureID = m_whiteTexture;
    command.depth = depth;
    command.vertices = {
        {p0.x, p0.y, 0.0f, 0.0f, color.r, color.g, color.b, color.a},
        {p1.x, p1.y, 1.0f, 0.0f, color.r, color.g, color.b, color.a},
        {p2.x, p2.y, 0.5f, 1.0f, color.r, color.g, color.b, color.a},
    };
    command.indices = {0, 1, 2};

    m_commandBuffer.push(command);
}

void Renderer::submit_rectangle(float x, float y,
                                float width, float height,
                                float depth,
                                Color color) {
    if (!m_initialized || width == 0.0f || height == 0.0f) {
        return;
    }

    color = sanitize_color(color);

    DrawCommand command{};
    command.glTextureID = m_whiteTexture;
    command.depth = depth;
    command.vertices = {
        {x, y, 0.0f, 0.0f, color.r, color.g, color.b, color.a},
        {x + width, y, 1.0f, 0.0f, color.r, color.g, color.b, color.a},
        {x + width, y + height, 1.0f, 1.0f, color.r, color.g, color.b, color.a},
        {x, y + height, 0.0f, 1.0f, color.r, color.g, color.b, color.a},
    };
    command.indices = {0, 1, 2, 0, 2, 3};

    m_commandBuffer.push(command);
}

void Renderer::submit_convex_polygon(const std::vector<Vec2>& points,
                                     float depth,
                                     Color color) {
    if (!m_initialized || points.size() < 3) {
        return;
    }

    color = sanitize_color(color);

    DrawCommand command{};
    command.glTextureID = m_whiteTexture;
    command.depth = depth;
    command.vertices.reserve(points.size());
    command.indices.reserve((points.size() - 2) * 3);

    for (const auto& p : points) {
        command.vertices.push_back({p.x, p.y, 0.0f, 0.0f, color.r, color.g, color.b, color.a});
    }

    for (std::uint32_t i = 1; i + 1 < static_cast<std::uint32_t>(points.size()); ++i) {
        command.indices.push_back(0);
        command.indices.push_back(i);
        command.indices.push_back(i + 1);
    }

    m_commandBuffer.push(command);
}

void Renderer::submit_regular_polygon(float centerX, float centerY,
                                      float radius,
                                      int sides,
                                      float depth,
                                      Color color,
                                      float rotationRad) {
    if (!m_initialized || radius <= 0.0f || sides < 3) {
        return;
    }

    std::vector<Vec2> points;
    points.reserve(static_cast<std::size_t>(sides));

    const float step = 2.0f * 3.14159265358979323846f / static_cast<float>(sides);
    for (int i = 0; i < sides; ++i) {
        const float a = rotationRad + step * static_cast<float>(i);
        points.push_back({
            centerX + std::cos(a) * radius,
            centerY + std::sin(a) * radius,
        });
    }

    submit_convex_polygon(points, depth, color);
}

GLuint Renderer::compile_shader(GLenum type, const char* source) {
    GLuint shader = glCreateShader(type);
    glShaderSource(shader, 1, &source, nullptr);
    glCompileShader(shader);

    GLint status = 0;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &status);
    if (status == GL_FALSE_VALUE) {
        GLint length = 0;
        glGetShaderiv(shader, GL_INFO_LOG_LENGTH, &length);
        std::string log(static_cast<std::size_t>(length), '\0');
        glGetShaderInfoLog(shader, length, nullptr, log.data());
        glDeleteShader(shader);
        throw std::runtime_error("Shader compilation failed: " + log);
    }
    return shader;
}

bool Renderer::create_shader_program() {
    GLuint vertex = 0;
    GLuint fragment = 0;

    try {
        vertex = compile_shader(GL_VERTEX_SHADER, kVertexShader);
        fragment = compile_shader(GL_FRAGMENT_SHADER, kFragmentShader);
    } catch (const std::exception& ex) {
        engine::debug::log_error(ex.what());
        if (vertex) {
            glDeleteShader(vertex);
        }
        if (fragment) {
            glDeleteShader(fragment);
        }
        return false;
    }

    m_shaderProgram = glCreateProgram();
    glAttachShader(m_shaderProgram, vertex);
    glAttachShader(m_shaderProgram, fragment);
    glLinkProgram(m_shaderProgram);

    glDeleteShader(vertex);
    glDeleteShader(fragment);

    GLint status = 0;
    glGetProgramiv(m_shaderProgram, GL_LINK_STATUS, &status);
    if (status == GL_FALSE_VALUE) {
        GLint length = 0;
        glGetProgramiv(m_shaderProgram, GL_INFO_LOG_LENGTH, &length);
        std::string log(static_cast<std::size_t>(length), '\0');
        glGetProgramInfoLog(m_shaderProgram, length, nullptr, log.data());
        engine::debug::log_error("Program link failed: " + log);
        glDeleteProgram(m_shaderProgram);
        m_shaderProgram = 0;
        return false;
    }

    glUseProgram(m_shaderProgram);
    GLint textureLocation = glGetUniformLocation(m_shaderProgram, "uTexture");
    glUniform1i(textureLocation, 0);
    m_viewProjLocation = glGetUniformLocation(m_shaderProgram, "uViewProj");
    return true;
}

bool Renderer::create_effect_shader_program(const std::string& fragmentSource, ShaderResource& outResource) {
    GLuint vertex = 0;
    GLuint fragment = 0;

    try {
        const std::string finalFragmentSource = build_effect_fragment_source(fragmentSource);
        vertex = compile_shader(GL_VERTEX_SHADER, kEffectVertexShader);
        fragment = compile_shader(GL_FRAGMENT_SHADER, finalFragmentSource.c_str());
    } catch (const std::exception& ex) {
        engine::debug::log_error(ex.what());
        if (vertex) glDeleteShader(vertex);
        if (fragment) glDeleteShader(fragment);
        return false;
    }

    outResource.program = glCreateProgram();
    glAttachShader(outResource.program, vertex);
    glAttachShader(outResource.program, fragment);
    glLinkProgram(outResource.program);
    glDeleteShader(vertex);
    glDeleteShader(fragment);

    GLint status = 0;
    glGetProgramiv(outResource.program, GL_LINK_STATUS, &status);
    if (status == GL_FALSE_VALUE) {
        GLint length = 0;
        glGetProgramiv(outResource.program, GL_INFO_LOG_LENGTH, &length);
        std::string log(static_cast<std::size_t>(length), '\0');
        glGetProgramInfoLog(outResource.program, length, nullptr, log.data());
        engine::debug::log_error("Effect program link failed: " + log);
        glDeleteProgram(outResource.program);
        outResource.program = 0;
        return false;
    }

    glUseProgram(outResource.program);
    outResource.textureLocation = glGetUniformLocation(outResource.program, "uTexture");
    if (outResource.textureLocation >= 0) {
        glUniform1i(outResource.textureLocation, 0);
    }
    outResource.viewProjLocation = glGetUniformLocation(outResource.program, "uViewProj");
    outResource.timeLocation = glGetUniformLocation(outResource.program, "uTime");
    outResource.inputSizeLocation = glGetUniformLocation(outResource.program, "uInputSize");
    outResource.inputTexelSizeLocation = glGetUniformLocation(outResource.program, "uInputTexelSize");
    outResource.colorLocation = glGetUniformLocation(outResource.program, "uColor");
    glUseProgram(m_shaderProgram);
    return true;
}

void Renderer::destroy_shader_program() {
    if (m_shaderProgram != 0) {
        glDeleteProgram(m_shaderProgram);
        m_shaderProgram = 0;
    }
}

void Renderer::update_view_projection() {
    int vpW = m_viewWidth;
    int vpH = m_viewHeight;
    if (m_activeSurface != kInvalidSurfaceHandle) {
        auto it = m_surfaces.find(m_activeSurface);
        if (it != m_surfaces.end()) {
            vpW = it->second.width;
            vpH = it->second.height;
        }
    }

    float left = 0.0f;
    float right = static_cast<float>(std::max(1, vpW));
    float top = 0.0f;
    float bottom = static_cast<float>(std::max(1, vpH));
    Mat4 matrix = make_ortho(left, right, bottom, top);
    glUniformMatrix4fv(m_viewProjLocation, 1, GL_FALSE_VALUE, matrix.data);
}

void Renderer::bind_view_projection(GLint location) const {
    if (location < 0) {
        return;
    }

    int vpW = m_viewWidth;
    int vpH = m_viewHeight;
    if (m_activeSurface != kInvalidSurfaceHandle) {
        auto it = m_surfaces.find(m_activeSurface);
        if (it != m_surfaces.end()) {
            vpW = it->second.width;
            vpH = it->second.height;
        }
    }

    const float left = 0.0f;
    const float right = static_cast<float>(std::max(1, vpW));
    const float top = 0.0f;
    const float bottom = static_cast<float>(std::max(1, vpH));
    Mat4 matrix = make_ortho(left, right, bottom, top);
    glUniformMatrix4fv(location, 1, GL_FALSE_VALUE, matrix.data);
}

std::string Renderer::build_effect_fragment_source(const std::string& fragmentSource) const {
    std::string source = fragmentSource;
    const std::string versionEs = "#version 300 es";
    const std::string versionCore = "#version 330 core";
    if (source.find(versionEs) != std::string::npos) {
        source.replace(source.find(versionEs), versionEs.size(), versionCore);
    } else if (source.find("#version") == std::string::npos) {
        source = versionCore + "\n" + source;
    }

    const char* precisions[] = {
        "precision lowp float;", "precision mediump float;", "precision highp float;",
        "precision lowp int;", "precision mediump int;", "precision highp int;"
    };
    for (const char* precision : precisions) {
        const std::string token = precision;
        std::size_t pos = std::string::npos;
        while ((pos = source.find(token)) != std::string::npos) {
            source.erase(pos, token.size());
        }
    }
    return source;
}

void Renderer::ensure_custom_uniform_location(ShaderResource& shader, const std::string& name) {
    if (shader.customLocations.find(name) != shader.customLocations.end()) {
        return;
    }

    shader.customLocations[name] = glGetUniformLocation(shader.program, name.c_str());
}

void Renderer::apply_shader_uniforms(ShaderResource& shader, const SurfaceResource& surface, Color color) {
    if (shader.timeLocation >= 0) {
        glUniform1f(shader.timeLocation, m_elapsedTime);
    }
    if (shader.inputSizeLocation >= 0) {
        glUniform2f(shader.inputSizeLocation, static_cast<float>(surface.width), static_cast<float>(surface.height));
    }
    if (shader.inputTexelSizeLocation >= 0) {
        glUniform2f(shader.inputTexelSizeLocation,
                    1.0f / static_cast<float>(std::max(1, surface.width)),
                    1.0f / static_cast<float>(std::max(1, surface.height)));
    }
    if (shader.colorLocation >= 0) {
        glUniform4f(shader.colorLocation, color.r, color.g, color.b, color.a);
    }

    for (auto& [name, value] : shader.customUniforms) {
        ensure_custom_uniform_location(shader, name);
        const GLint location = shader.customLocations[name];
        if (location < 0) {
            continue;
        }

        switch (value.type) {
            case ShaderUniformValue::Type::Float:
                glUniform1f(location, value.x);
                break;
            case ShaderUniformValue::Type::Vec2:
                glUniform2f(location, value.x, value.y);
                break;
            case ShaderUniformValue::Type::Vec4:
                glUniform4f(location, value.x, value.y, value.z, value.w);
                break;
        }
    }
}

void Renderer::upload_batches() {
    auto& commands = m_commandBuffer.commands();
    if (commands.empty()) {
        return;
    }

    std::stable_sort(commands.begin(), commands.end(), [](const DrawCommand& a, const DrawCommand& b) {
        if (std::fabs(a.depth - b.depth) > std::numeric_limits<float>::epsilon()) {
            return a.depth < b.depth;
        }
        return a.glTextureID < b.glTextureID;
    });

    std::vector<Vertex> vertices;
    std::vector<std::uint32_t> indices;
    std::vector<DrawRange> ranges;
    ranges.reserve(commands.size());

    DrawRange current{};
    bool haveRange = false;
    std::size_t indexCursor = 0;

    for (const auto& command : commands) {
        if (command.vertices.empty() || command.indices.empty() || command.glTextureID == 0) {
            continue;
        }

        if (!haveRange) {
            current.texture = command.glTextureID;
            current.indexOffset = 0;
            current.indexCount = 0;
            haveRange = true;
        }

        if (command.glTextureID != current.texture) {
            ranges.push_back(current);
            current.texture = command.glTextureID;
            current.indexOffset = indexCursor;
            current.indexCount = 0;
        }

        const std::uint32_t baseVertex = static_cast<std::uint32_t>(vertices.size());
        vertices.insert(vertices.end(), command.vertices.begin(), command.vertices.end());

        for (std::uint32_t idx : command.indices) {
            indices.push_back(baseVertex + idx);
        }

        current.indexCount += static_cast<GLsizei>(command.indices.size());
        indexCursor += command.indices.size();
    }

    if (haveRange) {
        ranges.push_back(current);
    }

    if (vertices.empty() || indices.empty() || ranges.empty()) {
        return;
    }

    m_device.upload(vertices, indices);

    for (const auto& range : ranges) {
        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D, range.texture);
        m_device.draw_indexed(range.indexCount, range.indexOffset);
    }

    glBindTexture(GL_TEXTURE_2D, 0);
}

} // namespace engine::draw
