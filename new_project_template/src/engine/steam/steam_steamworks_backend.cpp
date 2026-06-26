#include "engine/steam/steam_backend.hpp"

#include <steam/steam_api.h>

#include <memory>

namespace engine::steam {
namespace {

class SteamworksBackend final : public SteamBackend {
public:
    SteamworksBackend() : m_overlayCallback(this, &SteamworksBackend::on_overlay_activated) {}

    bool initialize(const SteamInitConfig&) override {
        if (!SteamAPI_Init()) {
            return false;
        }

        m_initialized = true;
        m_overlayActive = false;
        return true;
    }

    void shutdown() override {
        if (!m_initialized) {
            return;
        }

        SteamAPI_Shutdown();
        m_initialized = false;
        m_overlayActive = false;
    }

    void run_callbacks() override {
        if (m_initialized) {
            SteamAPI_RunCallbacks();
        }
    }

    bool available() const override {
        return m_initialized;
    }

    bool overlay_active() const override {
        return m_overlayActive;
    }

    std::string username() const override {
        if (!m_initialized || SteamFriends() == nullptr) {
            return {};
        }

        const char* personaName = SteamFriends()->GetPersonaName();
        return personaName != nullptr ? personaName : "";
    }

    std::uint64_t user_id() const override {
        if (!m_initialized || SteamUser() == nullptr) {
            return 0;
        }

        return SteamUser()->GetSteamID().ConvertToUint64();
    }

    bool unlock_achievement(const std::string& id) override {
        return m_initialized && SteamUserStats() != nullptr &&
               SteamUserStats()->SetAchievement(id.c_str());
    }

    bool set_stat_int(const std::string& name, int value) override {
        return m_initialized && SteamUserStats() != nullptr &&
               SteamUserStats()->SetStat(name.c_str(), value);
    }

    bool set_stat_float(const std::string& name, float value) override {
        return m_initialized && SteamUserStats() != nullptr &&
               SteamUserStats()->SetStat(name.c_str(), value);
    }

    bool store_stats() override {
        return m_initialized && SteamUserStats() != nullptr &&
               SteamUserStats()->StoreStats();
    }

    bool set_rich_presence(const std::string& key, const std::string& value) override {
        return m_initialized && SteamFriends() != nullptr &&
               SteamFriends()->SetRichPresence(key.c_str(), value.c_str());
    }

    void clear_rich_presence() override {
        if (m_initialized && SteamFriends() != nullptr) {
            SteamFriends()->ClearRichPresence();
        }
    }

private:
    void on_overlay_activated(GameOverlayActivated_t* eventData) {
        m_overlayActive = eventData != nullptr && eventData->m_bActive != 0;
    }

private:
    bool m_initialized{false};
    bool m_overlayActive{false};
    STEAM_CALLBACK(SteamworksBackend, on_overlay_activated, GameOverlayActivated_t, m_overlayCallback);
};

} // namespace

std::unique_ptr<SteamBackend> create_steamworks_backend() {
    return std::make_unique<SteamworksBackend>();
}

bool steamworks_restart_app_if_necessary(std::uint32_t appId) {
    return appId != 0 && SteamAPI_RestartAppIfNecessary(appId);
}

} // namespace engine::steam
