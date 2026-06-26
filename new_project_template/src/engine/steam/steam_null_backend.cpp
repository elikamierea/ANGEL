#include "engine/steam/steam_backend.hpp"

namespace engine::steam {
namespace {

class NullSteamBackend final : public SteamBackend {
public:
    bool initialize(const SteamInitConfig&) override {
        return false;
    }

    void shutdown() override {}
    void run_callbacks() override {}

    bool available() const override {
        return false;
    }

    bool overlay_active() const override {
        return false;
    }

    std::string username() const override {
        return {};
    }

    std::uint64_t user_id() const override {
        return 0;
    }

    bool unlock_achievement(const std::string&) override {
        return false;
    }

    bool set_stat_int(const std::string&, int) override {
        return false;
    }

    bool set_stat_float(const std::string&, float) override {
        return false;
    }

    bool store_stats() override {
        return false;
    }

    bool set_rich_presence(const std::string&, const std::string&) override {
        return false;
    }

    void clear_rich_presence() override {}
};

} // namespace

std::unique_ptr<SteamBackend> create_null_backend() {
    return std::make_unique<NullSteamBackend>();
}

} // namespace engine::steam
