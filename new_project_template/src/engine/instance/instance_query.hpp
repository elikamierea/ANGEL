#pragma once

#include "engine/base/object_grand_base.hpp"
#include "engine/instance/instance_registry.hpp"

#include <typeindex>

namespace engine::instance {

namespace detail {

template <typename T>
std::set<engine::base::ObjectGrandBase*>* try_get_instance_set_of_type() {
    auto typeIdx = std::type_index(typeid(T));
    auto it = engine::base::ObjectGrandBase::__IndexRegistry__.find(typeIdx);
    if (it == engine::base::ObjectGrandBase::__IndexRegistry__.end()) {
        return nullptr;
    }
    return &it->second;
}

} // namespace detail

template <typename T>
std::vector<T*> instances_of_type() {
    std::vector<T*> out;
    auto* setPtr = detail::try_get_instance_set_of_type<T>();
    if (setPtr == nullptr) {
        return out;
    }

    out.reserve(setPtr->size());
    for (auto* basePtr : *setPtr) {
        if (auto* casted = dynamic_cast<T*>(basePtr)) {
            out.push_back(casted);
        }
    }
    return out;
}

template <typename T>
std::vector<T*> collect_instances_of_type() {
    return instances_of_type<T>();
}

} // namespace engine::instance
