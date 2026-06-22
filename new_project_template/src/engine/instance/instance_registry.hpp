#pragma once

#include "engine/base/object_grand_base.hpp"

#include <utility>

namespace engine::instance {

void destroy_instance(engine::base::ObjectGrandBase* instance);
void flush_destroy_queue();
void register_instance(engine::base::ObjectGrandBase* instance);
void unregister_instance(engine::base::ObjectGrandBase* instance);

template <typename T, typename... Args>
T* create_instance(Args&&... args) {
    auto* instance = new T(std::forward<Args>(args)...);
    register_instance(instance);
    instance->__Create__();
    return instance;
}

} // namespace engine::instance
