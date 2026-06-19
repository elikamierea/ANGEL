#pragma once

#include "engine/draw/draw_api.hpp"
#include "engine/draw/sprite.hpp"

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace engine::draw {

struct AsciiFont {
    std::string basePath;
    int textureGroupId{0};
    int firstChar{32};
    int glyphCount{95};
    float spacing{0.0f};
};

struct BitmapGlyph {
    int page{1};          // 1-based page index
    float x{0.0f};
    float y{0.0f};
    float width{0.0f};
    float height{0.0f};
    float advance{0.0f};
    float offsetX{0.0f};
    float offsetY{0.0f};
};

struct BitmapPage {
    std::string fileName;
    int width{0};
    int height{0};
    GLuint textureHandle{0};
};

struct BitmapFont {
    std::string basePath;
    int textureGroupId{0};

    float lineHeight{0.0f};
    float defaultAdvance{0.0f};
    float spacing{0.0f};
    std::uint32_t fallbackCodepoint{0xFFFD};

    std::vector<BitmapPage> pages;
    std::unordered_map<std::uint32_t, BitmapGlyph> glyphs;
};

AsciiFont load_ascii_font(const std::string& base_path,
                          int texture_group_id,
                          int first_char = 32,
                          int glyph_count = 95,
                          float spacing = 0.0f);

BitmapFont load_bitmap_font(const std::string& base_path,
                            int texture_group_id);

bool write_bitmap_font_metadata(const BitmapFont& font);

float text_width(const AsciiFont& font,
                 const std::string& text,
                 float xscale = 1.0f,
                 float letterSpacing = 0.0f);

float text_height(const AsciiFont& font,
                  const std::string& text,
                  float yscale = 1.0f);

float text_width(const BitmapFont& font,
                 const std::string& utf8_text,
                 float xscale = 1.0f,
                 float letterSpacing = 0.0f);

float text_height(const BitmapFont& font,
                  const std::string& utf8_text,
                  float yscale = 1.0f);

void draw_text(const AsciiFont& font,
               const std::string& text,
               float x,
               float y,
               float depth = 0.0f,
               float xscale = 1.0f,
               float yscale = 1.0f,
               float rotationRad = 0.0f,
               Color color = {},
               float alpha = 1.0f,
               float letterSpacing = 0.0f);

void draw_text(const BitmapFont& font,
               const std::string& utf8_text,
               float x,
               float y,
               float depth = 0.0f,
               float xscale = 1.0f,
               float yscale = 1.0f,
               float rotationRad = 0.0f,
               Color color = {},
               float alpha = 1.0f,
               float letterSpacing = 0.0f);

} // namespace engine::draw
