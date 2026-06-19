#pragma once

#include "engine/draw/draw_api.hpp"
#include "engine/draw/gl_loader.hpp"
#include "engine/draw/sprite.hpp"

#include <string>
#include <unordered_map>
#include <vector>

namespace engine::draw {

class TextureGroupManager {
public:
    TextureGroupManager() = default;
    ~TextureGroupManager();

    Sprite load_sprite(const std::string& file_location, int textureGroupID);
    void shutdown();
    void set_default_texture_filter(TextureFilter filter);
    void set_default_atlas_size(int size);
    int default_atlas_size() const;
    void sprite_atlas_set_texture_filter(const Sprite& sprite, TextureFilter filter) const;

private:
    struct AtlasTexture {
        GLuint glTextureID{0};
        int width{0};
        int height{0};
        int nextFreeX{0};
        int nextFreeY{0};
        int rowHeight{0};
    };

    struct TextureGroup {
        int groupID{0};
        std::vector<AtlasTexture> atlases;
    };

    struct Allocation {
        AtlasTexture* atlas{nullptr};
        int atlasIndex{0};
        int x{0};
        int y{0};
    };

private:
    TextureGroup& acquire_group(int textureGroupID);
    AtlasTexture create_atlas() const;
    bool try_allocate_region(AtlasTexture& atlas, int width, int height, Allocation& out);
    Allocation allocate_region(TextureGroup& group, int width, int height);

    Sprite upload_sprite(TextureGroup& group,
                         const Allocation& allocation,
                         const std::vector<unsigned char>& pixels,
                         int imageWidth,
                         int imageHeight,
                         float pivotX,
                         float pivotY,
                         int frameCount,
                         int frameWidth,
                         int frameHeight);
    void apply_texture_filter(GLuint texture, TextureFilter filter) const;

private:
    std::unordered_map<int, TextureGroup> m_groups;
    int m_defaultAtlasSize{2048};
    TextureFilter m_defaultTextureFilter{TextureFilter::Linear};
};

} // namespace engine::draw
