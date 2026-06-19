#pragma once

#include "engine/base/object_grand_base.hpp"
#include "engine/draw/draw_api.hpp"
#include "engine/draw/sprite.hpp"

namespace engine::base {

class ObjectBase : public ObjectGrandBase {
public:
    ObjectBase() = default;

    std::type_index __GetTypeIndex__() const override {
        return typeid(ObjectBase);
    }

    void __Draw__() override {
        __DrawDefault__();
    }

    virtual void __DrawDefault__() {
        if (sprite == nullptr || sprite->frameCount <= 0) {
            return;
        }

        engine::draw::draw_sprite(x, y, *sprite, frame, depth, xscale, yscale, angle, alpha);
    }

public:
    float x{0.0f};
    float y{0.0f};

    const engine::draw::Sprite* sprite{nullptr};
    int frame{0};

    float xscale{1.0f};
    float yscale{1.0f};
    float angle{0.0f};
    float alpha{1.0f};
};

} // namespace engine::base
