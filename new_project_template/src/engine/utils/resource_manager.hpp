#pragma once

#include "engine/draw/sprite.hpp"

#include <string>
#include <unordered_map>

namespace engine::utils {

class ResourceManager {
public:
    static ResourceManager& instance();

    const engine::draw::Sprite& load_sprite(const std::string& base_path, int texture_group_id);

private:
    ResourceManager() = default;

private:
    std::unordered_map<std::string, engine::draw::Sprite> m_spriteCache;
};

} // namespace engine::utils
