#include "engine/draw/gpu_abstraction.hpp"

namespace engine::draw {

GPUBuffer::~GPUBuffer() {
    destroy();
}

void GPUBuffer::create() {
    if (m_id == 0) {
        glGenBuffers(1, &m_id);
    }
}

void GPUBuffer::destroy() {
    if (m_id != 0) {
        glDeleteBuffers(1, &m_id);
        m_id = 0;
    }
}

void GPUBuffer::bind(GLenum target) const {
    glBindBuffer(target, m_id);
}

void GPUBuffer::set_data(GLenum target, GLsizeiptr size, const void* data, GLenum usage) const {
    glBindBuffer(target, m_id);
    glBufferData(target, size, data, usage);
}

void GPUBuffer::set_sub_data(GLenum target, std::ptrdiff_t offset, GLsizeiptr size, const void* data) const {
    glBindBuffer(target, m_id);
    glBufferSubData(target, offset, size, data);
}

GPUVertexArray::~GPUVertexArray() {
    destroy();
}

void GPUVertexArray::create() {
    if (m_id == 0) {
        glGenVertexArrays(1, &m_id);
    }
}

void GPUVertexArray::destroy() {
    if (m_id != 0) {
        glDeleteVertexArrays(1, &m_id);
        m_id = 0;
    }
}

void GPUVertexArray::bind() const {
    glBindVertexArray(m_id);
}

bool GPUDevice::initialize() {
    m_vertexArray.create();
    m_vertexBuffer.create();
    m_indexBuffer.create();

    m_vertexArray.bind();
    m_vertexBuffer.bind(GL_ARRAY_BUFFER);
    m_indexBuffer.bind(GL_ELEMENT_ARRAY_BUFFER);

    // location 0: position (x, y)
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE_VALUE, sizeof(Vertex), reinterpret_cast<const void*>(0));
    // location 1: uv (u, v)
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE_VALUE, sizeof(Vertex), reinterpret_cast<const void*>(sizeof(float) * 2));
    // location 2: color (r, g, b, a)
    glEnableVertexAttribArray(2);
    glVertexAttribPointer(2, 4, GL_FLOAT, GL_FALSE_VALUE, sizeof(Vertex), reinterpret_cast<const void*>(sizeof(float) * 4));

    return true;
}

void GPUDevice::shutdown() {
    m_indexBuffer.destroy();
    m_vertexBuffer.destroy();
    m_vertexArray.destroy();
    m_indexCount = 0;
}

void GPUDevice::upload(const std::vector<Vertex>& vertices, const std::vector<std::uint32_t>& indices) {
    m_vertexArray.bind();
    m_vertexBuffer.set_data(GL_ARRAY_BUFFER, static_cast<GLsizeiptr>(vertices.size() * sizeof(Vertex)), vertices.data(), GL_DYNAMIC_DRAW);
    m_indexBuffer.set_data(GL_ELEMENT_ARRAY_BUFFER, static_cast<GLsizeiptr>(indices.size() * sizeof(std::uint32_t)), indices.data(), GL_DYNAMIC_DRAW);
    m_indexCount = static_cast<GLsizei>(indices.size());
}

void GPUDevice::draw_indexed(GLsizei indexCount, std::size_t indexOffset) const {
    glDrawElements(GL_TRIANGLES, indexCount, GL_UNSIGNED_INT, reinterpret_cast<const void*>(indexOffset * sizeof(std::uint32_t)));
}

} // namespace engine::draw
