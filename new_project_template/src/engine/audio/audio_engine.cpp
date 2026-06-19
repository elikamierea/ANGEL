#include "engine/audio/audio_engine.hpp"

#include "engine/audio/audio_backend.hpp"
#include "engine/audio/audio_decode.hpp"
#include "engine/debug/debug_tools.hpp"
#include "engine/utils/asset_io.hpp"

#include <algorithm>
#include <fstream>
#include <mutex>
#include <string>
#include <vector>

namespace engine::audio {
namespace {
std::mutex g_audioMutex;
bool g_initialized = false;

float g_masterVolume = 1.0f;
float g_sfxVolume = 1.0f;
float g_musicVolume = 1.0f;

float clamp01(float value) {
    return std::clamp(value, 0.0f, 1.0f);
}

bool read_audio_asset_bytes(const std::string& path, std::vector<std::uint8_t>& outBytes) {
    const auto looksLogical = path.rfind("assets/", 0) == 0 && path.find(':') == std::string::npos;
    if (looksLogical) {
        if (!engine::utils::asset_read_binary(path, outBytes)) {
            engine::debug::log_error("Failed to read audio asset: " + path);
            return false;
        }
        return true;
    }

    std::ifstream in(path, std::ios::binary);
    if (!in) {
        engine::debug::log_error("Failed to open audio file: " + path);
        return false;
    }

    outBytes.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
    return true;
}

bool prepare_backend_audio_asset(const std::string& path, BackendAudioAsset& outAsset) {
    std::vector<std::uint8_t> bytes;
    if (!read_audio_asset_bytes(path, bytes)) {
        return false;
    }

    DecodedAudioData data;
    if (!decode_audio_bytes(path, bytes, data)) {
        return false;
    }

    outAsset.logicalPath = path;
    outAsset.data = std::move(data);
    return true;
}
}

bool initialize() {
    std::scoped_lock lock(g_audioMutex);
    if (g_initialized) {
        return true;
    }

    if (!audio_backend().initialize()) {
        return false;
    }

    g_initialized = true;
    return true;
}

void shutdown() {
    std::scoped_lock lock(g_audioMutex);
    if (!g_initialized) {
        return;
    }

    audio_backend().shutdown();
    g_initialized = false;
}

Sound load_sound(const std::string& path) {
    BackendAudioAsset asset;
    if (!prepare_backend_audio_asset(path, asset)) {
        return Sound{path, {}};
    }
    return Sound{asset.logicalPath, std::move(asset.data)};
}

int play_sound(const Sound& sound, float volume) {
    if (sound.path.empty()) {
        return 0;
    }

    std::scoped_lock lock(g_audioMutex);
    if (!g_initialized) {
        return 0;
    }

    BackendAudioAsset asset{sound.path, sound.data};
    return audio_backend().play_sound(asset, g_masterVolume, g_sfxVolume, volume);
}

void stop_sound(int handle) {
    audio_backend().stop_sound(handle);
}

bool play_music(const std::string& path, bool loop) {
    BackendAudioAsset asset;
    if (!prepare_backend_audio_asset(path, asset)) {
        return false;
    }

    std::scoped_lock lock(g_audioMutex);
    if (!g_initialized) {
        return false;
    }

    return audio_backend().play_music(asset, loop, g_masterVolume, g_musicVolume);
}

void stop_music() {
    audio_backend().stop_music();
}

void set_master_volume(float volume) {
    std::scoped_lock lock(g_audioMutex);
    g_masterVolume = clamp01(volume);
    audio_backend().on_master_volume_changed(g_masterVolume, g_musicVolume);
}

float get_master_volume() {
    std::scoped_lock lock(g_audioMutex);
    return g_masterVolume;
}

void set_sfx_volume(float volume) {
    std::scoped_lock lock(g_audioMutex);
    g_sfxVolume = clamp01(volume);
}

float get_sfx_volume() {
    std::scoped_lock lock(g_audioMutex);
    return g_sfxVolume;
}

void set_music_volume(float volume) {
    std::scoped_lock lock(g_audioMutex);
    g_musicVolume = clamp01(volume);
    audio_backend().on_music_volume_changed(g_masterVolume, g_musicVolume);
}

float get_music_volume() {
    std::scoped_lock lock(g_audioMutex);
    return g_musicVolume;
}

} // namespace engine::audio
