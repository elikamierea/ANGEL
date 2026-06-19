#pragma once

#include "engine/draw/gl_loader.hpp"

#include <string>
#include <vector>

namespace engine::draw {

struct Frame {
    float u0;
    float v0;
    float u1;
    float v1;
    float pivotX;
    float pivotY;
    int width;
    int height;
};

struct Sprite {
    int textureGroupID{0};
    int atlasIndex{0};
    int frameCount{0};
    GLuint textureHandle{0};
    std::vector<Frame> frames;
};

} // namespace engine::draw
