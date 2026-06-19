#pragma once

#include <cstdint>
#include <string>
#include <vector>

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

AudioFormat detect_audio_format(const std::string& path, const std::vector<std::uint8_t>& bytes);
bool decode_audio_bytes(const std::string& path,
                        const std::vector<std::uint8_t>& bytes,
                        DecodedAudioData& outData);

} // namespace engine::audio
