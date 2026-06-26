#include "engine/base/object_grand_base.hpp"

#include "engine/instance/instance_registry.hpp"

namespace engine::base {

std::set<ObjectGrandBase*> ObjectGrandBase::__IndexAll__;
std::unordered_map<std::type_index, std::set<ObjectGrandBase*>> ObjectGrandBase::__IndexRegistry__;
std::vector<ObjectGrandBase*> ObjectGrandBase::__DestroyQueue__;

ObjectGrandBase::ObjectGrandBase(bool persistent_) : persistent(persistent_) {
    __IndexAll__.insert(this);
}

ObjectGrandBase::~ObjectGrandBase() {
    engine::instance::unregister_instance(this);
    __IndexAll__.erase(this);
}

} // namespace engine::base
