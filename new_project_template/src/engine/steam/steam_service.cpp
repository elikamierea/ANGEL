#include "engine/steam/steam_service.hpp"

#include "engine/debug/debug_tools.hpp"
#include "engine/steam/steam_backend.hpp"

#include <memory>
#include <utility>

namespace engine::steam {
namespace {

std::unique_ptr<SteamBackend> g_backend;

SteamBackend* active_backend() {
    if (!g_backend) {
        g_backend = create_null_backend();
    }
    return g_backend.get();
}

} // namespace

bool steam_enabled_in_build() {
#if defined(ANGEL_STEAM_COMPILED)
    return true;
#else
    return false;
#endif
}

std::uint32_t steam_configured_app_id() {
#if defined(ANGEL_STEAM_APP_ID)
    return static_cast<std::uint32_t>(ANGEL_STEAM_APP_ID);
#else
    return 0;
#endif
}

bool steam_restart_app_if_necessary() {
#if defined(ANGEL_STEAM_COMPILED)
    return steamworks_restart_app_if_necessary(steam_configured_app_id());
#else
    return false;
#endif
}

bool initialize() {
    shutdown();

#if defined(ANGEL_STEAM_COMPILED)
    auto steamBackend = create_steamworks_backend();
    if (steamBackend && steamBackend->initialize({steam_configured_app_id()})) {
        g_backend = std::move(steamBackend);
        return true;
    }

    engine::debug::log_warning("Steamworks initialization failed; continuing with the null Steam backend.");
#endif

    g_backend = create_null_backend();
    g_backend->initialize({steam_configured_app_id()});
    return false;
}

void shutdown() {
    if (g_backend) {
        g_backend->shutdown();
        g_backend.reset();
    }
}

void run_callbacks() {
    active_backend()->run_callbacks();
}

bool steam_available() {
    return active_backend()->available();
}

bool steam_overlay_active() {
    return active_backend()->overlay_active();
}

std::string steam_username() {
    return active_backend()->username();
}

std::uint64_t steam_user_id() {
    return active_backend()->user_id();
}

bool steam_unlock_achievement(const std::string& id) {
    return active_backend()->unlock_achievement(id);
}

bool steam_set_stat_int(const std::string& name, int value) {
    return active_backend()->set_stat_int(name, value);
}

bool steam_set_stat_float(const std::string& name, float value) {
    return active_backend()->set_stat_float(name, value);
}

bool steam_store_stats() {
    return active_backend()->store_stats();
}

bool steam_set_rich_presence(const std::string& key, const std::string& value) {
    return active_backend()->set_rich_presence(key, value);
}

void steam_clear_rich_presence() {
    active_backend()->clear_rich_presence();
}

} // namespace engine::steam
