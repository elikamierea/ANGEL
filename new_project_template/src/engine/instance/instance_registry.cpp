#include "engine/instance/instance_registry.hpp"

#include <algorithm>

namespace engine::instance {

using engine::base::ObjectGrandBase;

namespace {
bool is_already_in_destroy_queue(const ObjectGrandBase* instance) {
    const auto& queue = ObjectGrandBase::__DestroyQueue__;
    return std::find(queue.begin(), queue.end(), instance) != queue.end();
}
}

void register_instance(ObjectGrandBase* instance) {
    if (instance == nullptr) {
        return;
    }

    ObjectGrandBase::__IndexRegistry__[instance->__GetTypeIndex__()].insert(instance);
}

void unregister_instance(ObjectGrandBase* instance) {
    if (instance == nullptr) {
        return;
    }

    auto& registry = ObjectGrandBase::__IndexRegistry__;
    for (auto it = registry.begin(); it != registry.end();) {
        it->second.erase(instance);
        if (it->second.empty()) {
            it = registry.erase(it);
        } else {
            ++it;
        }
    }
}

void queue_destroy_instance(ObjectGrandBase* instance) {
    if (instance == nullptr) {
        return;
    }

    auto& queue = ObjectGrandBase::__DestroyQueue__;
    if (!is_already_in_destroy_queue(instance)) {
        instance->__Destroy__();
        queue.push_back(instance);
    }
}

void destroy_instance(ObjectGrandBase* instance) {
    queue_destroy_instance(instance);
}

void flush_destroy_queue() {
    auto& queue = ObjectGrandBase::__DestroyQueue__;
    for (auto* instance : queue) {
        instance->__CleanUp__();
        delete instance;
    }
    queue.clear();
}

} // namespace engine::instance
