#pragma once

#include "engine/audio/audio_decode.hpp"

#include <string>

namespace engine::audio {

struct BackendAudioAsset {
    std::string logicalPath;
    DecodedAudioData data;
};

class IAudioBackend {
public:
    virtual ~IAudioBackend() = default;

    virtual bool initialize() = 0;
    virtual void shutdown() = 0;

    virtual int play_sound(const BackendAudioAsset& asset, float masterVolume, float sfxVolume, float volume) = 0;
    virtual void stop_sound(int handle) = 0;

    virtual bool play_music(const BackendAudioAsset& asset, bool loop, float masterVolume, float musicVolume) = 0;
    virtual void stop_music() = 0;

    virtual void on_master_volume_changed(float masterVolume, float musicVolume) = 0;
    virtual void on_music_volume_changed(float masterVolume, float musicVolume) = 0;
};

IAudioBackend& audio_backend();

} // namespace engine::audio
