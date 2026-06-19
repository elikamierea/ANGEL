# Angel Engine Manual — Audio

## 6. Audio (MVP)

Audio API is provided by `engine/audio/audio_engine.hpp` and re-exported by `ANGEL.h`.

```cpp
namespace engine::audio {
    enum class AudioFormat {
        Unknown,
        Wav,
        Ogg,
    };

    struct DecodedAudioData {
        AudioFormat format{AudioFormat::Unknown};
        int channels{0};
        int sampleRate{0};
        int bitsPerSample{0};
        std::vector<std::uint8_t> pcm;
        std::vector<std::uint8_t> sourceBytes;
    };

    struct Sound {
        std::string path;
        DecodedAudioData data;
    };

    Sound load_sound(const std::string& path);
    int play_sound(const Sound& sound, float volume = 1.0f);
    void stop_sound(int handle);

    bool play_music(const std::string& path, bool loop = true);
    void stop_music();

    void set_master_volume(float volume);
    float get_master_volume();
    void set_sfx_volume(float volume);
    float get_sfx_volume();
    void set_music_volume(float volume);
    float get_music_volume();
}
```

Notes:
- Audio runtime is split into a platform-neutral front-end (`audio_engine.*`) plus a backend implementation layer. The primary backend is now PCM-driven `miniaudio`.
- Audio paths may use the same logical `assets/...` convention as other resources. When a logical asset is used, the engine reads it through `asset_io` (including `assets.pak`).
- `load_sound(...)` performs a decode stage: it reads bytes, classifies `wav` / `ogg`, and stores decoded audio data on the returned `Sound` object.
- Current decode support produces PCM-backed `DecodedAudioData`: PCM WAV data is extracted from the `data` chunk, and OGG Vorbis is decoded to 16-bit PCM.
- Backend-facing audio assets are now organized around decoded audio data only. The main playback path no longer depends on a materialized file-path fallback.
- `play_sound` supports overlapping SFX and returns a handle for optional manual stop.
- Music playback is single-channel (starting a new music track replaces the previous one).
