#pragma once

#include <cmath>

namespace engine::draw {

// 2x3 affine transform, row-major with an implicit [0 0 1] bottom row:
//
//   [ a  b  tx ]   [ px ]
//   [ c  d  ty ] * [ py ]
//   [ 0  0  1  ]   [ 1  ]
//
// This is the single place the engine turns decomposed transform parameters
// (position / scale / rotation / skew) into a concrete matrix. Every quad draw
// path builds one of these and applies it to its corners, instead of open-coding
// the same cos/sin math per call site.
struct Affine2D {
    float a{1.0f};
    float b{0.0f};
    float c{0.0f};
    float d{1.0f};
    float tx{0.0f};
    float ty{0.0f};

    static Affine2D identity() { return {}; }

    static Affine2D translate(float x, float y) {
        return {1.0f, 0.0f, 0.0f, 1.0f, x, y};
    }

    static Affine2D scale(float sx, float sy) {
        return {sx, 0.0f, 0.0f, sy, 0.0f, 0.0f};
    }

    static Affine2D rotate(float rad) {
        const float co = std::cos(rad);
        const float si = std::sin(rad);
        return {co, -si, si, co, 0.0f, 0.0f};
    }

    // skewXRad / skewYRad are shear angles in radians:
    //   [ 1        tan(skewX) ]
    //   [ tan(skewY)   1      ]
    static Affine2D shear(float skewXRad, float skewYRad) {
        return {1.0f, std::tan(skewXRad), std::tan(skewYRad), 1.0f, 0.0f, 0.0f};
    }

    // Matrix product: (*this) * rhs, treated as full 3x3 with implicit last row.
    // Semantics: rhs is applied to the point first, then *this.
    Affine2D operator*(const Affine2D& r) const {
        return {
            a * r.a + b * r.c,
            a * r.b + b * r.d,
            c * r.a + d * r.c,
            c * r.b + d * r.d,
            a * r.tx + b * r.ty + tx,
            c * r.tx + d * r.ty + ty,
        };
    }

    void apply(float px, float py, float& outX, float& outY) const {
        outX = a * px + b * py + tx;
        outY = c * px + d * py + ty;
    }

    // Canonical sprite/quad transform: T(x,y) * R(rotation) * Shear(skew) * S(scale).
    //
    // Points fed to the resulting matrix are expected to already be expressed in
    // local space with the pivot at the origin (i.e. corner - pivot), so the
    // matrix only carries the linear part plus the world translation.
    //
    // Compose order rationale: scale first, then skew, then rotate, then move.
    // This matches the "free transform" mental model in animation tools, where
    // skew shears the already-scaled shape and rotation then spins the whole
    // sheared result as a rigid body.
    static Affine2D sprite_transform(float x, float y,
                                     float xscale, float yscale,
                                     float rotationRad,
                                     float skewXRad = 0.0f,
                                     float skewYRad = 0.0f) {
        return translate(x, y) *
               rotate(rotationRad) *
               shear(skewXRad, skewYRad) *
               scale(xscale, yscale);
    }
};

} // namespace engine::draw
