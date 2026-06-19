#include "engine/draw/texture_group.hpp"

#include "engine/utils/asset_io.hpp"

#include "lodepng.h"

#include <algorithm>
#include <cstdint>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include <cstdlib>

namespace engine::draw {
namespace {

std::string normalize_slashes(std::string s) {
    std::replace(s.begin(), s.end(), '\\', '/');
    return s;
}

std::string normalize_base_path(const std::string& basePath) {
    auto p = normalize_slashes(basePath);
    while (!p.empty() && p.front() == '/') {
        p.erase(p.begin());
    }
    return p;
}

struct SpriteMetadata {
    float pivotX{0.0f};
    float pivotY{0.0f};
    int frameCount{0};
    int frameWidth{0};
    int frameHeight{0};
};

struct ImageData {
    int width{0};
    int height{0};
    std::vector<unsigned char> pixels;
};

SpriteMetadata read_metadata(const std::string& logicalPath) {
    std::string text;
    if (!engine::utils::asset_read_text(logicalPath, text)) {
        throw std::runtime_error("Failed to open sprite metadata: " + logicalPath);
    }

    std::istringstream stream(text);

    SpriteMetadata meta{};
    stream >> meta.pivotX >> meta.pivotY >> meta.frameCount >> meta.frameWidth >> meta.frameHeight;
    if (!stream) {
        throw std::runtime_error("Invalid sprite metadata format in: " + logicalPath);
    }

    if (meta.frameCount <= 0 || meta.frameWidth <= 0 || meta.frameHeight <= 0) {
        throw std::runtime_error("Sprite metadata contains non-positive values: " + logicalPath);
    }
    return meta;
}

ImageData load_image_rgba(const std::string& logicalPath) {
    std::vector<std::uint8_t> bytes;
    if (!engine::utils::asset_read_binary(logicalPath, bytes)) {
        throw std::runtime_error("Failed to load PNG: " + logicalPath);
    }

    unsigned char* buffer = nullptr;
    unsigned width = 0;
    unsigned height = 0;
    unsigned error = lodepng_decode32(&buffer, &width, &height, bytes.data(), bytes.size());
    if (error != 0) {
        throw std::runtime_error("Failed to decode PNG " + logicalPath + ": " + lodepng_error_text(error));
    }

    ImageData data;
    data.width = static_cast<int>(width);
    data.height = static_cast<int>(height);
    data.pixels.assign(buffer, buffer + (width * height * 4));
    std::free(buffer);
    return data;
}

} // namespace

void TextureGroupManager::apply_texture_filter(GLuint texture, TextureFilter filter) const {
    if (texture == 0) {
        return;
    }

    const GLint glFilter = (filter == TextureFilter::Nearest) ? GL_NEAREST : GL_LINEAR;
    glBindTexture(GL_TEXTURE_2D, texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, glFilter);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, glFilter);
    glBindTexture(GL_TEXTURE_2D, 0);
}

TextureGroupManager::~TextureGroupManager() {
    shutdown();
}

void TextureGroupManager::shutdown() {
    for (auto& [id, group] : m_groups) {
        for (auto& atlas : group.atlases) {
            if (atlas.glTextureID != 0) {
                glDeleteTextures(1, &atlas.glTextureID);
                atlas.glTextureID = 0;
            }
        }
        group.atlases.clear();
    }
    m_groups.clear();
}

void TextureGroupManager::set_default_texture_filter(TextureFilter filter) {
    m_defaultTextureFilter = filter;
}

void TextureGroupManager::set_default_atlas_size(int size) {
    if (size <= 0) {
        return;
    }
    m_defaultAtlasSize = size;
}

int TextureGroupManager::default_atlas_size() const {
    return m_defaultAtlasSize;
}

void TextureGroupManager::sprite_atlas_set_texture_filter(const Sprite& sprite, TextureFilter filter) const {
    apply_texture_filter(sprite.textureHandle, filter);
}

TextureGroupManager::TextureGroup& TextureGroupManager::acquire_group(int textureGroupID) {
    auto [it, inserted] = m_groups.try_emplace(textureGroupID);
    if (inserted) {
        it->second.groupID = textureGroupID;
    }
    return it->second;
}

TextureGroupManager::AtlasTexture TextureGroupManager::create_atlas() const {
    AtlasTexture atlas;
    atlas.width = m_defaultAtlasSize;
    atlas.height = m_defaultAtlasSize;

    glGenTextures(1, &atlas.glTextureID);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, atlas.glTextureID);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, atlas.width, atlas.height, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    apply_texture_filter(atlas.glTextureID, m_defaultTextureFilter);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glBindTexture(GL_TEXTURE_2D, 0);

    atlas.nextFreeX = 0;
    atlas.nextFreeY = 0;
    atlas.rowHeight = 0;
    return atlas;
}

bool TextureGroupManager::try_allocate_region(TextureGroupManager::AtlasTexture& atlas, int width, int height, TextureGroupManager::Allocation& out) {
    if (width > atlas.width || height > atlas.height) {
        return false;
    }

    if (atlas.nextFreeX + width > atlas.width) {
        atlas.nextFreeX = 0;
        atlas.nextFreeY += atlas.rowHeight;
        atlas.rowHeight = 0;
    }

    if (atlas.nextFreeY + height > atlas.height) {
        return false;
    }

    out.atlas = &atlas;
    out.x = atlas.nextFreeX;
    out.y = atlas.nextFreeY;
    atlas.nextFreeX += width;
    atlas.rowHeight = std::max(atlas.rowHeight, height);
    return true;
}

TextureGroupManager::Allocation TextureGroupManager::allocate_region(TextureGroupManager::TextureGroup& group, int width, int height) {
    TextureGroupManager::Allocation allocation{};
    for (std::size_t i = 0; i < group.atlases.size(); ++i) {
        if (try_allocate_region(group.atlases[i], width, height, allocation)) {
            allocation.atlasIndex = static_cast<int>(i);
            return allocation;
        }
    }

    group.atlases.push_back(create_atlas());
    auto& atlas = group.atlases.back();
    if (!try_allocate_region(atlas, width, height, allocation)) {
        throw std::runtime_error("Failed to allocate sprite region inside atlas");
    }
    allocation.atlasIndex = static_cast<int>(group.atlases.size() - 1);
    return allocation;
}

Sprite TextureGroupManager::upload_sprite(TextureGroupManager::TextureGroup& group,
                                          const TextureGroupManager::Allocation& allocation,
                                          const std::vector<unsigned char>& pixels,
                                          int imageWidth,
                                          int imageHeight,
                                          float pivotX,
                                          float pivotY,
                                          int frameCount,
                                          int frameWidth,
                                          int frameHeight) {
    auto* atlas = allocation.atlas;
    if (atlas == nullptr) {
        throw std::runtime_error("Invalid atlas allocation");
    }

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, atlas->glTextureID);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexSubImage2D(GL_TEXTURE_2D, 0, allocation.x, allocation.y, imageWidth, imageHeight, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());
    glBindTexture(GL_TEXTURE_2D, 0);

    Sprite sprite;
    sprite.textureGroupID = group.groupID;
    sprite.atlasIndex = allocation.atlasIndex;
    sprite.frameCount = frameCount;
    sprite.textureHandle = atlas->glTextureID;
    sprite.frames.reserve(static_cast<std::size_t>(frameCount));

    for (int frameIndex = 0; frameIndex < frameCount; ++frameIndex) {
        int frameOffsetX = allocation.x + frameIndex * frameWidth;
        int frameOffsetY = allocation.y;

        Frame frame{};
        frame.u0 = static_cast<float>(frameOffsetX) / static_cast<float>(atlas->width);
        frame.v0 = static_cast<float>(frameOffsetY) / static_cast<float>(atlas->height);
        frame.u1 = static_cast<float>(frameOffsetX + frameWidth) / static_cast<float>(atlas->width);
        frame.v1 = static_cast<float>(frameOffsetY + frameHeight) / static_cast<float>(atlas->height);
        frame.pivotX = pivotX;
        frame.pivotY = pivotY;
        frame.width = frameWidth;
        frame.height = frameHeight;

        sprite.frames.push_back(frame);
    }

    return sprite;
}

Sprite TextureGroupManager::load_sprite(const std::string& file_location, int textureGroupID) {
    const auto basePath = normalize_base_path(file_location);
    const auto pngPath = basePath + ".png";
    const auto txtPath = basePath + ".txt";

    SpriteMetadata meta = read_metadata(txtPath);
    ImageData image = load_image_rgba(pngPath);

    if (meta.frameCount * meta.frameWidth > image.width || meta.frameHeight > image.height) {
        throw std::runtime_error("Sprite metadata exceeds image bounds: " + pngPath);
    }

    auto& group = acquire_group(textureGroupID);
    Allocation allocation = allocate_region(group, image.width, image.height);
    return upload_sprite(group,
                         allocation,
                         image.pixels,
                         image.width,
                         image.height,
                         meta.pivotX,
                         meta.pivotY,
                         meta.frameCount,
                         meta.frameWidth,
                         meta.frameHeight);
}

} // namespace engine::draw
