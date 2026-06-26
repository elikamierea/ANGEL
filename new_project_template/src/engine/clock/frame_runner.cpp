#include "engine/clock/frame_runner.hpp"

#include "engine/base/object_grand_base.hpp"
#include "engine/draw/draw_api.hpp"
#include "engine/instance/instance_registry.hpp"

namespace engine::clock {

void FrameRunner::RunFrame() {
    using engine::base::ObjectGrandBase;

    const std::vector<ObjectGrandBase*> stepSnapshot(ObjectGrandBase::__IndexAll__.begin(), ObjectGrandBase::__IndexAll__.end());
    for (auto* instance : stepSnapshot) {
        instance->__Step__();
    }

    engine::instance::flush_destroy_queue();

    engine::draw::renderer_begin_frame();
    std::vector<ObjectGrandBase*> drawSnapshot(ObjectGrandBase::__IndexAll__.begin(), ObjectGrandBase::__IndexAll__.end());
    std::stable_sort(drawSnapshot.begin(), drawSnapshot.end(), [](const ObjectGrandBase* lhs, const ObjectGrandBase* rhs) {
        return lhs->depth < rhs->depth;
    });
    for (auto* instance : drawSnapshot) {
        instance->__Draw__();
    }
    engine::draw::renderer_end_frame();
    engine::draw::renderer_present();
    
    
    engine::instance::flush_destroy_queue();
}

} // namespace engine::clock
