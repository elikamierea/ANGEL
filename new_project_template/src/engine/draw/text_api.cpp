#include "engine/draw/text_api.hpp"

#include "engine/debug/debug_tools.hpp"
#include "engine/draw/draw_api.hpp"
#include "engine/draw/gl_loader.hpp"
#include "engine/draw/renderer.hpp"
#include "engine/utils/asset_io.hpp"
#include "engine/utils/resource_manager.hpp"

#include "lodepng.h"

#include <algorithm>
#include <charconv>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string_view>
#include <vector>
#include <cstdlib>

namespace engine::draw {

namespace {

constexpr std::uint32_t kReplacementChar = 0xFFFD;

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

std::string font_meta_path(const std::string& basePath) {
    return normalize_base_path(basePath) + ".font.txt";
}

std::string base_directory(const std::string& basePath) {
    const auto normalized = normalize_base_path(basePath);
    const auto pos = normalized.find_last_of('/');
    if (pos == std::string::npos) {
        return {};
    }
    return normalized.substr(0, pos + 1);
}

std::string trim(std::string s) {
    const auto b = s.find_first_not_of(" \t\r\n");
    if (b == std::string::npos) {
        return {};
    }
    const auto e = s.find_last_not_of(" \t\r\n");
    return s.substr(b, e - b + 1);
}

bool parse_codepoint_token(const std::string& token, std::uint32_t& out) {
    if (token.empty()) {
        return false;
    }

    int base = 10;
    std::string_view view(token);
    if (view.rfind("U+", 0) == 0 || view.rfind("u+", 0) == 0) {
        view.remove_prefix(2);
        base = 16;
    } else if (view.rfind("0x", 0) == 0 || view.rfind("0X", 0) == 0) {
        view.remove_prefix(2);
        base = 16;
    }

    unsigned value = 0;
    const auto* begin = view.data();
    const auto* end = view.data() + view.size();
    const auto result = std::from_chars(begin, end, value, base);
    if (result.ec != std::errc{} || result.ptr != end) {
        return false;
    }

    out = static_cast<std::uint32_t>(value);
    return true;
}

float glyph_advance(const Sprite& sprite, int frame, float xscale) {
    if (frame >= 0 && frame < static_cast<int>(sprite.frames.size())) {
        return static_cast<float>(sprite.frames[static_cast<std::size_t>(frame)].width) * xscale;
    }
    if (!sprite.frames.empty()) {
        return static_cast<float>(sprite.frames.front().width) * xscale;
    }
    return 0.0f;
}

std::vector<std::uint32_t> decode_utf8(const std::string& text) {
    std::vector<std::uint32_t> out;
    out.reserve(text.size());

    const auto* bytes = reinterpret_cast<const unsigned char*>(text.data());
    std::size_t i = 0;
    while (i < text.size()) {
        const unsigned char b0 = bytes[i];
        if ((b0 & 0x80u) == 0) {
            out.push_back(b0);
            ++i;
            continue;
        }

        auto push_repl_and_advance = [&]() {
            out.push_back(kReplacementChar);
            ++i;
        };

        if ((b0 & 0xE0u) == 0xC0u) {
            if (i + 1 >= text.size()) {
                push_repl_and_advance();
                continue;
            }
            const unsigned char b1 = bytes[i + 1];
            if ((b1 & 0xC0u) != 0x80u) {
                push_repl_and_advance();
                continue;
            }
            std::uint32_t cp = ((b0 & 0x1Fu) << 6) | (b1 & 0x3Fu);
            if (cp < 0x80) {
                cp = kReplacementChar;
            }
            out.push_back(cp);
            i += 2;
            continue;
        }

        if ((b0 & 0xF0u) == 0xE0u) {
            if (i + 2 >= text.size()) {
                push_repl_and_advance();
                continue;
            }
            const unsigned char b1 = bytes[i + 1];
            const unsigned char b2 = bytes[i + 2];
            if ((b1 & 0xC0u) != 0x80u || (b2 & 0xC0u) != 0x80u) {
                push_repl_and_advance();
                continue;
            }
            std::uint32_t cp = ((b0 & 0x0Fu) << 12) | ((b1 & 0x3Fu) << 6) | (b2 & 0x3Fu);
            if (cp < 0x800 || (cp >= 0xD800 && cp <= 0xDFFF)) {
                cp = kReplacementChar;
            }
            out.push_back(cp);
            i += 3;
            continue;
        }

        if ((b0 & 0xF8u) == 0xF0u) {
            if (i + 3 >= text.size()) {
                push_repl_and_advance();
                continue;
            }
            const unsigned char b1 = bytes[i + 1];
            const unsigned char b2 = bytes[i + 2];
            const unsigned char b3 = bytes[i + 3];
            if ((b1 & 0xC0u) != 0x80u || (b2 & 0xC0u) != 0x80u || (b3 & 0xC0u) != 0x80u) {
                push_repl_and_advance();
                continue;
            }
            std::uint32_t cp = ((b0 & 0x07u) << 18) | ((b1 & 0x3Fu) << 12) | ((b2 & 0x3Fu) << 6) | (b3 & 0x3Fu);
            if (cp < 0x10000 || cp > 0x10FFFF) {
                cp = kReplacementChar;
            }
            out.push_back(cp);
            i += 4;
            continue;
        }

        push_repl_and_advance();
    }

    return out;
}

bool load_page_texture(const std::string& logicalPath, BitmapPage& outPage) {
    std::vector<std::uint8_t> bytes;
    if (!engine::utils::asset_read_binary(logicalPath, bytes)) {
        engine::debug::log_error("Failed to read font page PNG: " + logicalPath);
        return false;
    }

    unsigned char* buffer = nullptr;
    unsigned width = 0;
    unsigned height = 0;

    const unsigned error = lodepng_decode32(&buffer, &width, &height, bytes.data(), bytes.size());
    if (error != 0) {
        engine::debug::log_error("Failed to decode font page PNG " + logicalPath + ": " + lodepng_error_text(error));
        return false;
    }

    GLuint tex = 0;
    glGenTextures(1, &tex);
    glBindTexture(GL_TEXTURE_2D, tex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, static_cast<int>(width), static_cast<int>(height), 0, GL_RGBA, GL_UNSIGNED_BYTE, buffer);
    Renderer::instance().apply_texture_filter(tex, Renderer::instance().default_texture_filter());
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glBindTexture(GL_TEXTURE_2D, 0);

    std::free(buffer);

    outPage.width = static_cast<int>(width);
    outPage.height = static_cast<int>(height);
    outPage.textureHandle = tex;
    return true;
}

} // namespace

AsciiFont load_ascii_font(const std::string& base_path,
                          int texture_group_id,
                          int first_char,
                          int glyph_count,
                          float spacing) {
    AsciiFont font{};
    font.basePath = base_path;
    font.textureGroupId = texture_group_id;
    font.firstChar = first_char;
    font.glyphCount = glyph_count;
    font.spacing = spacing;

    (void)engine::utils::ResourceManager::instance().load_sprite(base_path, texture_group_id);
    return font;
}

BitmapFont load_bitmap_font(const std::string& base_path,
                            int texture_group_id) {
    BitmapFont font{};
    font.basePath = base_path;
    font.textureGroupId = texture_group_id;

    const auto metaPath = font_meta_path(base_path);

    std::string metaText;
    if (!engine::utils::asset_read_text(metaPath, metaText)) {
        engine::debug::log_warning("Bitmap font metadata not found: " + metaPath);
        return font;
    }

    std::istringstream in(metaText);

    int declaredPages = 0;
    std::vector<std::string> pageFiles;

    bool headerSeen = false;
    std::string line;
    int lineNo = 0;
    while (std::getline(in, line)) {
        ++lineNo;
        auto hash = line.find('#');
        if (hash != std::string::npos) {
            line = line.substr(0, hash);
        }
        line = trim(line);
        if (line.empty()) {
            continue;
        }

        std::istringstream iss(line);
        std::string key;
        iss >> key;

        if (key == "ANGEL_FONT") {
            int version = 0;
            iss >> version;
            headerSeen = (iss && version == 2);
            if (!headerSeen) {
                engine::debug::log_warning("Expected ANGEL_FONT 2 in " + metaPath);
            }
            continue;
        }

        if (key == "pages") {
            iss >> declaredPages;
            continue;
        }

        if (key == "lineHeight") {
            iss >> font.lineHeight;
            continue;
        }

        if (key == "defaultAdvance") {
            iss >> font.defaultAdvance;
            continue;
        }

        if (key == "spacing") {
            iss >> font.spacing;
            continue;
        }

        if (key == "fallback") {
            std::string token;
            iss >> token;
            std::uint32_t cp = 0;
            if (parse_codepoint_token(token, cp)) {
                font.fallbackCodepoint = cp;
            }
            continue;
        }

        if (key == "page") {
            int pageIndex = 0;
            std::string fileName;
            iss >> pageIndex >> fileName;
            if (!iss || pageIndex <= 0) {
                engine::debug::log_warning("Invalid page line at " + std::to_string(lineNo));
                continue;
            }
            if (static_cast<int>(pageFiles.size()) < pageIndex) {
                pageFiles.resize(static_cast<std::size_t>(pageIndex));
            }
            pageFiles[static_cast<std::size_t>(pageIndex - 1)] = fileName;
            continue;
        }

        if (key == "glyph") {
            std::string cpToken;
            BitmapGlyph glyph{};
            iss >> cpToken >> glyph.page >> glyph.x >> glyph.y >> glyph.width >> glyph.height
                >> glyph.advance >> glyph.offsetX >> glyph.offsetY;
            if (!iss) {
                engine::debug::log_warning("Invalid glyph line at " + std::to_string(lineNo));
                continue;
            }

            std::uint32_t cp = 0;
            if (!parse_codepoint_token(cpToken, cp)) {
                engine::debug::log_warning("Invalid glyph codepoint at line " + std::to_string(lineNo));
                continue;
            }
            font.glyphs[cp] = glyph;
            continue;
        }
    }

    if (!headerSeen) {
        return BitmapFont{};
    }

    if (declaredPages <= 0) {
        declaredPages = static_cast<int>(pageFiles.size());
    }
    if (declaredPages <= 0) {
        engine::debug::log_warning("Bitmap font has no pages declared: " + metaPath);
        return font;
    }

    if (static_cast<int>(pageFiles.size()) < declaredPages) {
        pageFiles.resize(static_cast<std::size_t>(declaredPages));
    }

    const auto normalizedBase = normalize_base_path(base_path);
    const auto dir = base_directory(normalizedBase);
    const auto stemPos = normalizedBase.find_last_of('/');
    const std::string stem = (stemPos == std::string::npos) ? normalizedBase : normalizedBase.substr(stemPos + 1);

    font.pages.resize(static_cast<std::size_t>(declaredPages));
    for (int i = 1; i <= declaredPages; ++i) {
        auto& page = font.pages[static_cast<std::size_t>(i - 1)];
        std::string file = pageFiles[static_cast<std::size_t>(i - 1)];
        if (file.empty()) {
            file = stem + "_fontpage" + std::to_string(i) + ".png";
        }
        page.fileName = file;

        const bool looksLogical = file.rfind("assets/", 0) == 0;
        const std::string logicalPagePath = looksLogical ? normalize_slashes(file) : (dir + normalize_slashes(file));

        if (!load_page_texture(logicalPagePath, page)) {
            engine::debug::log_warning("Skipping font page load failure: " + logicalPagePath);
        }
    }

    return font;
}

bool write_bitmap_font_metadata(const BitmapFont& font) {
    if (font.basePath.empty()) {
        return false;
    }

    std::ofstream out(font_meta_path(font.basePath), std::ios::trunc);
    if (!out) {
        return false;
    }

    out << "ANGEL_FONT 2\n";
    out << "pages " << font.pages.size() << "\n";
    out << "lineHeight " << font.lineHeight << "\n";
    out << "defaultAdvance " << font.defaultAdvance << "\n";
    out << "spacing " << font.spacing << "\n";
    out << "fallback U+" << std::hex << std::uppercase << font.fallbackCodepoint << std::dec << "\n\n";

    for (std::size_t i = 0; i < font.pages.size(); ++i) {
        const auto& p = font.pages[i];
        out << "page " << (i + 1) << ' ' << p.fileName << "\n";
    }

    if (!font.pages.empty()) {
        out << "\n";
    }

    std::vector<std::pair<std::uint32_t, BitmapGlyph>> ordered(font.glyphs.begin(), font.glyphs.end());
    std::sort(ordered.begin(), ordered.end(), [](const auto& a, const auto& b) {
        return a.first < b.first;
    });

    for (const auto& [cp, g] : ordered) {
        out << "glyph U+" << std::hex << std::uppercase << cp << std::dec
            << ' ' << g.page
            << ' ' << g.x
            << ' ' << g.y
            << ' ' << g.width
            << ' ' << g.height
            << ' ' << g.advance
            << ' ' << g.offsetX
            << ' ' << g.offsetY
            << "\n";
    }

    return true;
}

float text_width(const AsciiFont& font,
                 const std::string& text,
                 float xscale,
                 float letterSpacing) {
    if (text.empty() || font.glyphCount <= 0) {
        return 0.0f;
    }

    const auto& sprite = engine::utils::ResourceManager::instance().load_sprite(font.basePath, font.textureGroupId);
    if (sprite.frameCount <= 0 || sprite.frames.empty()) {
        return 0.0f;
    }

    const int maxGlyphs = std::min(font.glyphCount, sprite.frameCount);
    const int maxChar = font.firstChar + maxGlyphs - 1;

    float cursorX = 0.0f;
    float maxWidth = 0.0f;

    for (unsigned char ch : text) {
        if (ch == '\n') {
            maxWidth = std::max(maxWidth, cursorX);
            cursorX = 0.0f;
            continue;
        }

        if (ch == '\t') {
            const int spaceFrame = std::clamp(' ' - font.firstChar, 0, maxGlyphs - 1);
            const float tabAdvance = (glyph_advance(sprite, spaceFrame, xscale) + letterSpacing + font.spacing) * 4.0f;
            cursorX += tabAdvance;
            continue;
        }

        if (ch < font.firstChar || ch > maxChar) {
            continue;
        }

        const int frame = static_cast<int>(ch) - font.firstChar;
        cursorX += glyph_advance(sprite, frame, xscale) + letterSpacing + font.spacing;
    }

    return std::max(maxWidth, cursorX);
}

float text_height(const AsciiFont& font,
                  const std::string& text,
                  float yscale) {
    if (text.empty() || font.glyphCount <= 0) {
        return 0.0f;
    }

    const auto& sprite = engine::utils::ResourceManager::instance().load_sprite(font.basePath, font.textureGroupId);
    if (sprite.frameCount <= 0 || sprite.frames.empty()) {
        return 0.0f;
    }

    const float lineAdvance = static_cast<float>(sprite.frames.front().height) * yscale;
    int lineCount = 1;
    for (unsigned char ch : text) {
        if (ch == '\n') {
            ++lineCount;
        }
    }

    return lineAdvance * static_cast<float>(lineCount);
}

float text_width(const BitmapFont& font,
                 const std::string& utf8_text,
                 float xscale,
                 float letterSpacing) {
    if (utf8_text.empty()) {
        return 0.0f;
    }

    const float defaultAdvance = (font.defaultAdvance > 0.0f ? font.defaultAdvance : 16.0f) * xscale;

    float cursorX = 0.0f;
    float maxWidth = 0.0f;

    const auto cps = decode_utf8(utf8_text);
    for (std::uint32_t cp : cps) {
        if (cp == '\n') {
            maxWidth = std::max(maxWidth, cursorX);
            cursorX = 0.0f;
            continue;
        }

        if (cp == '\t') {
            cursorX += (defaultAdvance + letterSpacing + font.spacing) * 4.0f;
            continue;
        }

        auto it = font.glyphs.find(cp);
        if (it == font.glyphs.end()) {
            it = font.glyphs.find(font.fallbackCodepoint);
            if (it == font.glyphs.end()) {
                cursorX += defaultAdvance + letterSpacing + font.spacing;
                continue;
            }
        }

        const auto& g = it->second;
        const float adv = (g.advance > 0.0f ? g.advance * xscale : defaultAdvance);
        cursorX += adv + letterSpacing + font.spacing;
    }

    return std::max(maxWidth, cursorX);
}

float text_height(const BitmapFont& font,
                  const std::string& utf8_text,
                  float yscale) {
    if (utf8_text.empty()) {
        return 0.0f;
    }

    const float lineAdvance = (font.lineHeight > 0.0f ? font.lineHeight : 16.0f) * yscale;
    int lineCount = 1;
    const auto cps = decode_utf8(utf8_text);
    for (std::uint32_t cp : cps) {
        if (cp == '\n') {
            ++lineCount;
        }
    }

    return lineAdvance * static_cast<float>(lineCount);
}

void draw_text(const AsciiFont& font,
               const std::string& text,
               float x,
               float y,
               float depth,
               float xscale,
               float yscale,
               float rotationRad,
               Color color,
               float alpha,
               float letterSpacing) {
    if (text.empty() || font.glyphCount <= 0) {
        return;
    }

    const auto& sprite = engine::utils::ResourceManager::instance().load_sprite(font.basePath, font.textureGroupId);
    if (sprite.frameCount <= 0 || sprite.frames.empty()) {
        return;
    }

    const int maxGlyphs = std::min(font.glyphCount, sprite.frameCount);
    const int maxChar = font.firstChar + maxGlyphs - 1;

    const float lineAdvance = static_cast<float>(sprite.frames.front().height) * yscale;

    float cursorX = x;
    float cursorY = y;

    for (unsigned char ch : text) {
        if (ch == '\n') {
            cursorX = x;
            cursorY += lineAdvance;
            continue;
        }

        if (ch == '\t') {
            const int spaceFrame = std::clamp(' ' - font.firstChar, 0, maxGlyphs - 1);
            const float tabAdvance = (glyph_advance(sprite, spaceFrame, xscale) + letterSpacing + font.spacing) * 4.0f;
            cursorX += tabAdvance;
            continue;
        }

        if (ch < font.firstChar || ch > maxChar) {
            continue;
        }

        const int frame = static_cast<int>(ch) - font.firstChar;
        draw_sprite(cursorX, cursorY, sprite, frame, depth, xscale, yscale, rotationRad, color, alpha);

        cursorX += glyph_advance(sprite, frame, xscale) + letterSpacing + font.spacing;
    }
}

void draw_text(const BitmapFont& font,
               const std::string& utf8_text,
               float x,
               float y,
               float depth,
               float xscale,
               float yscale,
               float rotationRad,
               Color color,
               float alpha,
               float letterSpacing) {
    if (utf8_text.empty() || font.pages.empty()) {
        return;
    }

    const float lineAdvance = (font.lineHeight > 0.0f ? font.lineHeight : 16.0f) * yscale;
    const float defaultAdvance = (font.defaultAdvance > 0.0f ? font.defaultAdvance : 16.0f) * xscale;

    float cursorX = x;
    float cursorY = y;

    const auto cps = decode_utf8(utf8_text);
    for (std::uint32_t cp : cps) {
        if (cp == '\n') {
            cursorX = x;
            cursorY += lineAdvance;
            continue;
        }

        if (cp == '\t') {
            cursorX += (defaultAdvance + letterSpacing + font.spacing) * 4.0f;
            continue;
        }

        auto it = font.glyphs.find(cp);
        if (it == font.glyphs.end()) {
            it = font.glyphs.find(font.fallbackCodepoint);
            if (it == font.glyphs.end()) {
                cursorX += defaultAdvance + letterSpacing + font.spacing;
                continue;
            }
        }

        const auto& g = it->second;
        if (g.page <= 0 || g.page > static_cast<int>(font.pages.size())) {
            cursorX += defaultAdvance + letterSpacing + font.spacing;
            continue;
        }

        const auto& page = font.pages[static_cast<std::size_t>(g.page - 1)];
        if (page.textureHandle == 0 || page.width <= 0 || page.height <= 0 || g.width <= 0.0f || g.height <= 0.0f) {
            cursorX += defaultAdvance + letterSpacing + font.spacing;
            continue;
        }

        Frame frame{};
        frame.u0 = g.x / static_cast<float>(page.width);
        frame.v0 = g.y / static_cast<float>(page.height);
        frame.u1 = (g.x + g.width) / static_cast<float>(page.width);
        frame.v1 = (g.y + g.height) / static_cast<float>(page.height);
        frame.pivotX = 0.0f;
        frame.pivotY = 0.0f;
        frame.width = static_cast<int>(g.width);
        frame.height = static_cast<int>(g.height);

        Sprite glyphSprite{};
        glyphSprite.textureHandle = page.textureHandle;
        glyphSprite.frameCount = 1;
        glyphSprite.frames.push_back(frame);

        draw_sprite(cursorX + g.offsetX * xscale,
                    cursorY + g.offsetY * yscale,
                    glyphSprite,
                    0,
                    depth,
                    xscale,
                    yscale,
                    rotationRad,
                    color,
                    alpha);

        const float adv = (g.advance > 0.0f ? g.advance * xscale : defaultAdvance);
        cursorX += adv + letterSpacing + font.spacing;
    }
}

} // namespace engine::draw
