#pragma once

#include "engine/draw/gl_loader.hpp"
#include "engine/draw/vertex.hpp"

#include <cstddef>
#include <cstdint>
#include <vector>

namespace engine::draw {

class GPUBuffer {
public:
    GPUBuffer() = default;
    ~GPUBuffer();

    void create();
    void destroy();
    void bind(GLenum target) const;
    void set_data(GLenum target, GLsizeiptr size, const void* data, GLenum usage) const;
    void set_sub_data(GLenum target, std::ptrdiff_t offset, GLsizeiptr size, const void* data) const;
    GLuint id() const { return m_id; }

private:
    GLuint m_id{0};
};

class GPUVertexArray {
public:
    GPUVertexArray() = default;
    ~GPUVertexArray();

    void create();
    void destroy();
    void bind() const;
    GLuint id() const { return m_id; }

private:
    GLuint m_id{0};
};

class GPUDevice {
public:
    bool initialize();
    void shutdown();

    void upload(const std::vector<Vertex>& vertices, const std::vector<std::uint32_t>& indices);
    void draw_indexed(GLsizei indexCount, std::size_t indexOffset) const;

private:
    GPUVertexArray m_vertexArray;
    GPUBuffer m_vertexBuffer;
    GPUBuffer m_indexBuffer;
    GLsizei m_indexCount{0};
};

} // namespace engine::draw
