#include "engine/utils/resource_manager.hpp"

#include "engine/draw/draw_api.hpp"

namespace engine::utils {

namespace {
std::string make_sprite_cache_key(const std::string& base_path, int texture_group_id) {
    return base_path + "\n" + std::to_string(texture_group_id);
}
}

ResourceManager& ResourceManager::instance() {
    static ResourceManager g_instance;
    return g_instance;
}

const engine::draw::Sprite& ResourceManager::load_sprite(const std::string& base_path, int texture_group_id) {
    const auto cacheKey = make_sprite_cache_key(base_path, texture_group_id);

    auto it = m_spriteCache.find(cacheKey);
    if (it != m_spriteCache.end()) {
        return it->second;
    }

    auto sprite = engine::draw::load_sprite(base_path, texture_group_id);
    auto [insertedIt, _] = m_spriteCache.emplace(cacheKey, std::move(sprite));
    return insertedIt->second;
}

} // namespace engine::utils
