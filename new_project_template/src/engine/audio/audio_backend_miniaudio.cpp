#include "miniaudio.h"

#include "engine/audio/audio_backend.hpp"
#include "engine/debug/debug_tools.hpp"

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <string>
#include <unordered_map>

namespace engine::audio {
namespace {

float clamp01(float value) {
    return std::clamp(value, 0.0f, 1.0f);
}

struct ActiveSound {
    ma_sound sound{};
    ma_audio_buffer* buffer = nullptr;
    bool started = false;
};

class MiniaudioBackend final : public IAudioBackend {
public:
    bool initialize() override {
        std::scoped_lock lock(m_mutex);
        if (m_initialized) {
            return true;
        }

        ma_result result = ma_engine_init(nullptr, &m_engine);
        if (result != MA_SUCCESS) {
            engine::debug::log_error("Failed to initialize miniaudio engine");
            return false;
        }

        m_initialized = true;
        sync_music_volume_locked();
        engine::debug::log_info("Audio initialized (miniaudio backend)");
        return true;
    }

    void shutdown() override {
        std::scoped_lock lock(m_mutex);
        if (!m_initialized) {
            return;
        }

        stop_all_sounds_locked();
        if (m_music.started) {
            destroy_sound_locked(m_music);
        }

        ma_engine_uninit(&m_engine);
        m_initialized = false;
    }

    int play_sound(const BackendAudioAsset& asset, float masterVolume, float sfxVolume, float volume) override {
        std::scoped_lock lock(m_mutex);
        if (!m_initialized) {
            return 0;
        }
        if (!has_pcm(asset)) {
            engine::debug::log_error("Miniaudio backend requires decoded PCM sound data: " + asset.logicalPath);
            return 0;
        }

        ma_audio_buffer* buffer = nullptr;
        if (!create_buffer(asset, &buffer)) {
            engine::debug::log_error("Failed to allocate miniaudio buffer for sound: " + asset.logicalPath);
            return 0;
        }

        const int handle = m_nextHandle.fetch_add(1);
        auto [it, inserted] = m_sounds.try_emplace(handle);
        if (!inserted) {
            ma_audio_buffer_uninit_and_free(buffer);
            engine::debug::log_error("Failed to reserve sound slot: " + asset.logicalPath);
            return 0;
        }

        ActiveSound& active = it->second;
        active.buffer = buffer;

        if (ma_sound_init_from_data_source(&m_engine, active.buffer, MA_SOUND_FLAG_DECODE, nullptr, &active.sound) != MA_SUCCESS) {
            destroy_sound_locked(active);
            m_sounds.erase(it);
            engine::debug::log_error("Failed to create miniaudio sound from PCM buffer: " + asset.logicalPath);
            return 0;
        }

        ma_sound_set_volume(&active.sound, clamp01(masterVolume * sfxVolume * volume));
        if (ma_sound_start(&active.sound) != MA_SUCCESS) {
            destroy_sound_locked(active);
            m_sounds.erase(it);
            engine::debug::log_error("Failed to start miniaudio sound: " + asset.logicalPath);
            return 0;
        }

        active.started = true;
        cleanup_finished_sounds_locked();
        return handle;
    }

    void stop_sound(int handle) override {
        std::scoped_lock lock(m_mutex);
        auto it = m_sounds.find(handle);
        if (it == m_sounds.end()) {
            return;
        }
        destroy_sound_locked(it->second);
        m_sounds.erase(it);
    }

    bool play_music(const BackendAudioAsset& asset, bool loop, float masterVolume, float musicVolume) override {
        std::scoped_lock lock(m_mutex);
        if (!m_initialized) {
            return false;
        }
        if (!has_pcm(asset)) {
            engine::debug::log_error("Miniaudio backend requires decoded PCM music data: " + asset.logicalPath);
            return false;
        }

        if (m_music.started) {
            destroy_sound_locked(m_music);
        }

        ma_audio_buffer* buffer = nullptr;
        if (!create_buffer(asset, &buffer)) {
            engine::debug::log_error("Failed to allocate miniaudio buffer for music: " + asset.logicalPath);
            return false;
        }

        m_music.buffer = buffer;
        if (ma_sound_init_from_data_source(&m_engine, m_music.buffer, MA_SOUND_FLAG_DECODE, nullptr, &m_music.sound) != MA_SUCCESS) {
            destroy_sound_locked(m_music);
            engine::debug::log_error("Failed to create miniaudio music sound from PCM buffer: " + asset.logicalPath);
            return false;
        }

        ma_sound_set_looping(&m_music.sound, loop ? MA_TRUE : MA_FALSE);
        ma_sound_set_volume(&m_music.sound, clamp01(masterVolume * musicVolume));
        if (ma_sound_start(&m_music.sound) != MA_SUCCESS) {
            destroy_sound_locked(m_music);
            engine::debug::log_error("Failed to start miniaudio music: " + asset.logicalPath);
            return false;
        }

        m_music.started = true;
        m_masterVolume = clamp01(masterVolume);
        m_musicVolume = clamp01(musicVolume);
        return true;
    }

    void stop_music() override {
        std::scoped_lock lock(m_mutex);
        if (!m_music.started) {
            return;
        }
        destroy_sound_locked(m_music);
    }

    void on_master_volume_changed(float masterVolume, float musicVolume) override {
        std::scoped_lock lock(m_mutex);
        m_masterVolume = clamp01(masterVolume);
        m_musicVolume = clamp01(musicVolume);
        sync_music_volume_locked();
    }

    void on_music_volume_changed(float masterVolume, float musicVolume) override {
        on_master_volume_changed(masterVolume, musicVolume);
    }

private:
    static ma_format ma_format_from_bits(int bitsPerSample) {
        switch (bitsPerSample) {
        case 8: return ma_format_u8;
        case 16: return ma_format_s16;
        case 24: return ma_format_s24;
        case 32: return ma_format_s32;
        default: return ma_format_unknown;
        }
    }

    static bool has_pcm(const BackendAudioAsset& asset) {
        return asset.data.channels > 0 && asset.data.sampleRate > 0 && asset.data.bitsPerSample > 0 && !asset.data.pcm.empty();
    }

    static ma_uint64 frame_count(const DecodedAudioData& data) {
        const std::size_t bytesPerFrame = static_cast<std::size_t>(data.channels) * static_cast<std::size_t>(data.bitsPerSample / 8);
        return bytesPerFrame == 0 ? 0 : static_cast<ma_uint64>(data.pcm.size() / bytesPerFrame);
    }

    static bool create_buffer(const BackendAudioAsset& asset, ma_audio_buffer** outBuffer) {
        const ma_format format = ma_format_from_bits(asset.data.bitsPerSample);
        if (format == ma_format_unknown) {
            return false;
        }

        ma_audio_buffer_config bufferConfig = ma_audio_buffer_config_init(
            format,
            static_cast<ma_uint32>(asset.data.channels),
            frame_count(asset.data),
            asset.data.pcm.data(),
            nullptr);
        return ma_audio_buffer_alloc_and_init(&bufferConfig, outBuffer) == MA_SUCCESS && *outBuffer != nullptr;
    }

    void sync_music_volume_locked() {
        if (m_music.started) {
            ma_sound_set_volume(&m_music.sound, clamp01(m_masterVolume * m_musicVolume));
        }
    }

    void cleanup_finished_sounds_locked() {
        for (auto it = m_sounds.begin(); it != m_sounds.end();) {
            if (!ma_sound_is_playing(&it->second.sound)) {
                destroy_sound_locked(it->second);
                it = m_sounds.erase(it);
            } else {
                ++it;
            }
        }
    }

    void stop_all_sounds_locked() {
        for (auto& [handle, sound] : m_sounds) {
            (void)handle;
            destroy_sound_locked(sound);
        }
        m_sounds.clear();
    }

    static void destroy_sound_locked(ActiveSound& active) {
        ma_sound_uninit(&active.sound);
        if (active.buffer != nullptr) {
            ma_audio_buffer_uninit_and_free(active.buffer);
            active.buffer = nullptr;
        }
        active = {};
    }

private:
    std::atomic<int> m_nextHandle{1};
    std::mutex m_mutex;
    ma_engine m_engine{};
    bool m_initialized = false;
    float m_masterVolume = 1.0f;
    float m_musicVolume = 1.0f;
    std::unordered_map<int, ActiveSound> m_sounds;
    ActiveSound m_music{};
};

} // namespace

IAudioBackend& audio_backend() {
    static MiniaudioBackend g_backend;
    return g_backend;
}

} // namespace engine::audio
