#pragma once

#include <cstdint>
#include <string>

namespace engine::steam {

bool steam_enabled_in_build();
std::uint32_t steam_configured_app_id();
bool steam_restart_app_if_necessary();

bool initialize();
void shutdown();
void run_callbacks();

bool steam_available();
bool steam_overlay_active();
std::string steam_username();
std::uint64_t steam_user_id();

bool steam_unlock_achievement(const std::string& id);
bool steam_set_stat_int(const std::string& name, int value);
bool steam_set_stat_float(const std::string& name, float value);
bool steam_store_stats();

bool steam_set_rich_presence(const std::string& key, const std::string& value);
void steam_clear_rich_presence();

} // namespace engine::steam
