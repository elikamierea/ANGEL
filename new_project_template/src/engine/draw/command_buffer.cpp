#include "engine/draw/command_buffer.hpp"

namespace engine::draw {

void CommandBuffer::clear() {
    m_commands.clear();
}

void CommandBuffer::push(const DrawCommand& command) {
    m_commands.push_back(command);
}

std::vector<DrawCommand>& CommandBuffer::commands() {
    return m_commands;
}

const std::vector<DrawCommand>& CommandBuffer::commands() const {
    return m_commands;
}

} // namespace engine::draw
