#pragma once

#include <cstdint>
#include <memory>
#include <string>

namespace engine::steam {

struct SteamInitConfig {
    std::uint32_t appId{0};
};

class SteamBackend {
public:
    virtual ~SteamBackend() = default;

    virtual bool initialize(const SteamInitConfig& config) = 0;
    virtual void shutdown() = 0;
    virtual void run_callbacks() = 0;

    virtual bool available() const = 0;
    virtual bool overlay_active() const = 0;

    virtual std::string username() const = 0;
    virtual std::uint64_t user_id() const = 0;

    virtual bool unlock_achievement(const std::string& id) = 0;
    virtual bool set_stat_int(const std::string& name, int value) = 0;
    virtual bool set_stat_float(const std::string& name, float value) = 0;
    virtual bool store_stats() = 0;

    virtual bool set_rich_presence(const std::string& key, const std::string& value) = 0;
    virtual void clear_rich_presence() = 0;
};

std::unique_ptr<SteamBackend> create_null_backend();

#if defined(ANGEL_STEAM_COMPILED)
std::unique_ptr<SteamBackend> create_steamworks_backend();
bool steamworks_restart_app_if_necessary(std::uint32_t appId);
#endif

} // namespace engine::steam
