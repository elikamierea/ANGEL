#include "engine/instance/instance_registry.hpp"

#include <algorithm>

namespace engine::instance {

using engine::base::ObjectGrandBase;

namespace {
struct InstanceSlot {
    ObjectGrandBase* instance{nullptr};
    std::uint32_t generation{1};
    bool pendingDestroy{false};
};

std::vector<InstanceSlot> g_instanceSlots;
std::vector<std::uint32_t> g_freeInstanceSlots;

bool is_valid_slot_index(std::uint32_t slotIndex) {
    return slotIndex != InstanceHandle::InvalidSlot && slotIndex < g_instanceSlots.size();
}

InstanceSlot* try_get_slot(std::uint32_t slotIndex) {
    if (!is_valid_slot_index(slotIndex)) {
        return nullptr;
    }
    return &g_instanceSlots[slotIndex];
}

bool instance_matches_slot(const ObjectGrandBase* instance, const InstanceSlot& slot) {
    return slot.instance == instance && slot.generation == instance->__InstanceGeneration__;
}

bool is_already_in_destroy_queue(const ObjectGrandBase* instance) {
    const auto& queue = ObjectGrandBase::__DestroyQueue__;
    return std::find(queue.begin(), queue.end(), instance) != queue.end();
}

void assign_slot(ObjectGrandBase* instance) {
    if (instance == nullptr) {
        return;
    }

    if (auto* existingSlot = try_get_slot(instance->__InstanceSlot__); existingSlot != nullptr && instance_matches_slot(instance, *existingSlot)) {
        existingSlot->pendingDestroy = false;
        return;
    }

    std::uint32_t slotIndex = InstanceHandle::InvalidSlot;
    if (!g_freeInstanceSlots.empty()) {
        slotIndex = g_freeInstanceSlots.back();
        g_freeInstanceSlots.pop_back();
    } else {
        slotIndex = static_cast<std::uint32_t>(g_instanceSlots.size());
        g_instanceSlots.push_back({});
    }

    InstanceSlot& slot = g_instanceSlots[slotIndex];
    slot.instance = instance;
    slot.pendingDestroy = false;
    if (slot.generation == 0) {
        slot.generation = 1;
    }

    instance->__InstanceSlot__ = slotIndex;
    instance->__InstanceGeneration__ = slot.generation;
}

void release_slot(ObjectGrandBase* instance) {
    if (instance == nullptr) {
        return;
    }

    InstanceSlot* slot = try_get_slot(instance->__InstanceSlot__);
    if (slot == nullptr || !instance_matches_slot(instance, *slot)) {
        instance->__InstanceSlot__ = InstanceHandle::InvalidSlot;
        instance->__InstanceGeneration__ = 0;
        return;
    }

    slot->instance = nullptr;
    slot->pendingDestroy = false;
    ++slot->generation;
    if (slot->generation == 0) {
        slot->generation = 1;
    }
    g_freeInstanceSlots.push_back(instance->__InstanceSlot__);

    instance->__InstanceSlot__ = InstanceHandle::InvalidSlot;
    instance->__InstanceGeneration__ = 0;
}
}

void register_instance(ObjectGrandBase* instance) {
    if (instance == nullptr) {
        return;
    }

    assign_slot(instance);
    ObjectGrandBase::__IndexRegistry__[instance->__GetTypeIndex__()].insert(instance);
}

void unregister_instance(ObjectGrandBase* instance) {
    if (instance == nullptr) {
        return;
    }

    release_slot(instance);

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

InstanceHandle get_handle(const ObjectGrandBase* instance) {
    if (instance == nullptr) {
        return {};
    }

    const InstanceSlot* slot = try_get_slot(instance->__InstanceSlot__);
    if (slot == nullptr || !instance_matches_slot(instance, *slot)) {
        return {};
    }

    return InstanceHandle{instance->__InstanceSlot__, instance->__InstanceGeneration__};
}

bool instance_exists(InstanceHandle handle) {
    const InstanceSlot* slot = try_get_slot(handle.slot);
    if (slot == nullptr) {
        return false;
    }
    if (slot->generation != handle.generation) {
        return false;
    }
    return slot->instance != nullptr && !slot->pendingDestroy;
}

ObjectGrandBase* get_instance(InstanceHandle handle) {
    InstanceSlot* slot = try_get_slot(handle.slot);
    if (slot == nullptr) {
        return nullptr;
    }
    if (slot->generation != handle.generation || slot->pendingDestroy) {
        return nullptr;
    }
    return slot->instance;
}

void destroy_instance(ObjectGrandBase* instance) {
    if (instance == nullptr) {
        return;
    }

    if (InstanceSlot* slot = try_get_slot(instance->__InstanceSlot__); slot != nullptr && instance_matches_slot(instance, *slot)) {
        if (slot->pendingDestroy) {
            return;
        }
        slot->pendingDestroy = true;
    } else if (is_already_in_destroy_queue(instance)) {
        return;
    }

    auto& queue = ObjectGrandBase::__DestroyQueue__;
    instance->__Destroy__();
    queue.push_back(instance);
}

void destroy_nonpersistent_instances() {
    const std::vector<ObjectGrandBase*> snapshot(ObjectGrandBase::__IndexAll__.begin(), ObjectGrandBase::__IndexAll__.end());
    for (auto* instance : snapshot) {
        if (instance == nullptr || instance->persistent) {
            continue;
        }

        destroy_instance(instance);
    }
}

void flush_destroy_queue() {
    auto& queue = ObjectGrandBase::__DestroyQueue__;
    for (auto* instance : queue) {
        instance->__CleanUp__();
        release_slot(instance);
        delete instance;
    }
    queue.clear();
}

} // namespace engine::instance
