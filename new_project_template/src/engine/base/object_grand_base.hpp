#pragma once

#include "engine/base/engine_common.hpp"

namespace engine::base {

class ObjectGrandBase {
public:
    static std::set<ObjectGrandBase*> __IndexAll__;
    static std::unordered_map<std::type_index, std::set<ObjectGrandBase*>> __IndexRegistry__;
    static std::vector<ObjectGrandBase*> __DestroyQueue__;

public:
    ObjectGrandBase();
    virtual ~ObjectGrandBase();

    ObjectGrandBase(const ObjectGrandBase&) = delete;
    ObjectGrandBase& operator=(const ObjectGrandBase&) = delete;

public:
    virtual std::type_index __GetTypeIndex__() const = 0;
    virtual void __Create__() {}
    virtual void __Destroy__() {}
    virtual void __CleanUp__() {}
    virtual void __Step__() {}
    virtual void __Draw__() {}

public:
    float depth{0.0f};
};

} // namespace engine::base
