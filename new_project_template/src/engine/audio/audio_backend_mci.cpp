#include "engine/audio/audio_backend.hpp"

#include "engine/debug/debug_tools.hpp"

#include <windows.h>
#include <mmsystem.h>

#include <algorithm>
#include <atomic>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>

namespace engine::audio {
namespace {

float backend_clamp01(float value) {
    return std::clamp(value, 0.0f, 1.0f);
}

int to_mci_volume(float value) {
    return static_cast<int>(backend_clamp01(value) * 1000.0f);
}

std::string quote_arg(const std::string& value) {
    std::string escaped;
    escaped.reserve(value.size() + 2);
    escaped.push_back('"');
    for (char c : value) {
        if (c == '"') {
            escaped += "\\\"";
        } else {
            escaped.push_back(c);
        }
    }
    escaped.push_back('"');
    return escaped;
}

bool mci_command(const std::string& command) {
    return mciSendStringA(command.c_str(), nullptr, 0, nullptr) == 0;
}

class MciAudioBackend final : public IAudioBackend {
public:
    bool initialize() override {
        std::scoped_lock lock(m_mutex);
        if (m_initialized) {
            return true;
        }

        m_initialized = true;
        engine::debug::log_info("Audio initialized (winmm/mci backend)");
        return true;
    }

    void shutdown() override {
        std::scoped_lock lock(m_mutex);
        if (!m_initialized) {
            return;
        }

        for (const auto& [handle, alias] : m_sfxAliases) {
            (void)handle;
            close_alias(alias);
        }
        m_sfxAliases.clear();

        if (!m_musicAlias.empty()) {
            close_alias(m_musicAlias);
            m_musicAlias.clear();
        }

        m_initialized = false;
    }

    int play_sound(const BackendAudioAsset& asset, float masterVolume, float sfxVolume, float volume) override {
        if (asset.legacyResolvedPath.empty()) {
            engine::debug::log_error("MCI backend requires a legacy resolved path for sound playback: " + asset.logicalPath);
            return 0;
        }

        std::scoped_lock lock(m_mutex);
        if (!m_initialized) {
            return 0;
        }

        const int handle = m_nextHandle.fetch_add(1);
        const std::string alias = "angel_sfx_" + std::to_string(handle);

        if (!mci_command("open " + quote_arg(asset.legacyResolvedPath) + " alias " + alias)) {
            engine::debug::log_error("Failed to open sound: " + asset.logicalPath);
            return 0;
        }

        const int vol = to_mci_volume(masterVolume * sfxVolume * volume);
        (void)mci_command("setaudio " + alias + " volume to " + std::to_string(vol));

        if (!mci_command("play " + alias + " from 0")) {
            close_alias(alias);
            engine::debug::log_error("Failed to play sound: " + asset.logicalPath);
            return 0;
        }

        m_sfxAliases[handle] = alias;
        cleanup_sfx_when_finished(handle, alias);
        return handle;
    }

    void stop_sound(int handle) override {
        std::scoped_lock lock(m_mutex);
        auto it = m_sfxAliases.find(handle);
        if (it == m_sfxAliases.end()) {
            return;
        }

        close_alias(it->second);
        m_sfxAliases.erase(it);
    }

    bool play_music(const BackendAudioAsset& asset, bool loop, float masterVolume, float musicVolume) override {
        if (asset.legacyResolvedPath.empty()) {
            engine::debug::log_error("MCI backend requires a legacy resolved path for music playback: " + asset.logicalPath);
            return false;
        }

        std::scoped_lock lock(m_mutex);
        if (!m_initialized) {
            return false;
        }

        if (!m_musicAlias.empty()) {
            close_alias(m_musicAlias);
            m_musicAlias.clear();
        }

        m_musicAlias = "angel_bgm";
        if (!mci_command("open " + quote_arg(asset.legacyResolvedPath) + " alias " + m_musicAlias)) {
            m_musicAlias.clear();
            engine::debug::log_error("Failed to open music: " + asset.logicalPath);
            return false;
        }

        const int vol = to_mci_volume(masterVolume * musicVolume);
        (void)mci_command("setaudio " + m_musicAlias + " volume to " + std::to_string(vol));

        const std::string playCmd = loop ? ("play " + m_musicAlias + " repeat") : ("play " + m_musicAlias + " from 0");
        if (!mci_command(playCmd)) {
            close_alias(m_musicAlias);
            m_musicAlias.clear();
            engine::debug::log_error("Failed to play music: " + asset.logicalPath);
            return false;
        }

        return true;
    }

    void stop_music() override {
        std::scoped_lock lock(m_mutex);
        if (m_musicAlias.empty()) {
            return;
        }
        close_alias(m_musicAlias);
        m_musicAlias.clear();
    }

    void on_master_volume_changed(float masterVolume, float musicVolume) override {
        std::scoped_lock lock(m_mutex);
        if (!m_musicAlias.empty()) {
            const int vol = to_mci_volume(masterVolume * musicVolume);
            (void)mci_command("setaudio " + m_musicAlias + " volume to " + std::to_string(vol));
        }
    }

    void on_music_volume_changed(float masterVolume, float musicVolume) override {
        on_master_volume_changed(masterVolume, musicVolume);
    }

private:
    void close_alias(const std::string& alias) {
        (void)mci_command("stop " + alias);
        (void)mci_command("close " + alias);
    }

    void cleanup_sfx_when_finished(int handle, std::string alias) {
        std::thread([this, handle, alias = std::move(alias)]() {
            char mode[64]{};
            while (true) {
                const auto err = mciSendStringA(("status " + alias + " mode").c_str(), mode, sizeof(mode), nullptr);
                if (err != 0 || std::string(mode) == "stopped") {
                    break;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(50));
            }

            std::scoped_lock lock(m_mutex);
            close_alias(alias);
            m_sfxAliases.erase(handle);
        }).detach();
    }

private:
    std::atomic<int> m_nextHandle{1};
    std::mutex m_mutex;
    std::unordered_map<int, std::string> m_sfxAliases;
    std::string m_musicAlias;
    bool m_initialized = false;
};

} // namespace

IAudioBackend& audio_backend() {
    static MciAudioBackend g_backend;
    return g_backend;
}

} // namespace engine::audio
