#pragma once

#include "engine/base/object_grand_base.hpp"

#include <utility>

namespace engine::instance {

struct InstanceHandle {
    static constexpr std::uint32_t InvalidSlot = static_cast<std::uint32_t>(-1);

    std::uint32_t slot{InvalidSlot};
    std::uint32_t generation{0};
};

void destroy_instance(engine::base::ObjectGrandBase* instance);
void destroy_nonpersistent_instances();
void flush_destroy_queue();
InstanceHandle get_handle(const engine::base::ObjectGrandBase* instance);
bool instance_exists(InstanceHandle handle);
engine::base::ObjectGrandBase* get_instance(InstanceHandle handle);
void register_instance(engine::base::ObjectGrandBase* instance);
void unregister_instance(engine::base::ObjectGrandBase* instance);

template <typename T, typename... Args>
T* create_instance(Args&&... args) {
    auto* instance = new T(std::forward<Args>(args)...);
    register_instance(instance);
    instance->__Create__();
    return instance;
}

template <typename T>
T* get_instance(InstanceHandle handle) {
    auto* baseInstance = engine::instance::get_instance(handle);
    return dynamic_cast<T*>(baseInstance);
}

} // namespace engine::instance
