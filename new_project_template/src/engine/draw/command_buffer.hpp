#pragma once

#include "engine/draw/gl_loader.hpp"
#include "engine/draw/vertex.hpp"

#include <cstdint>
#include <vector>

namespace engine::draw {

struct DrawCommand {
    GLuint glTextureID{0};
    float depth{0.0f};
    std::vector<Vertex> vertices;
    std::vector<std::uint32_t> indices;
};

class CommandBuffer {
public:
    void clear();
    void push(const DrawCommand& command);
    std::vector<DrawCommand>& commands();
    const std::vector<DrawCommand>& commands() const;

private:
    std::vector<DrawCommand> m_commands;
};

} // namespace engine::draw
