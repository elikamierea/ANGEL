#include "engine/audio/audio_decode.hpp"

#include "engine/debug/debug_tools.hpp"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstring>
#include <vector>

#define STB_VORBIS_HEADER_ONLY
#include "stb_vorbis.c"
#undef STB_VORBIS_HEADER_ONLY

namespace engine::audio {
namespace {

std::string lowercase_extension(const std::string& path) {
    const auto dot = path.find_last_of('.');
    if (dot == std::string::npos) {
        return {};
    }

    std::string ext = path.substr(dot);
    std::transform(ext.begin(), ext.end(), ext.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return ext;
}

bool has_prefix(const std::vector<std::uint8_t>& bytes, const char* text) {
    const std::size_t len = std::strlen(text);
    return bytes.size() >= len && std::memcmp(bytes.data(), text, len) == 0;
}

std::uint16_t read_u16_le(const std::vector<std::uint8_t>& bytes, std::size_t offset) {
    return static_cast<std::uint16_t>(bytes[offset]) |
           (static_cast<std::uint16_t>(bytes[offset + 1]) << 8);
}

std::uint32_t read_u32_le(const std::vector<std::uint8_t>& bytes, std::size_t offset) {
    return static_cast<std::uint32_t>(bytes[offset]) |
           (static_cast<std::uint32_t>(bytes[offset + 1]) << 8) |
           (static_cast<std::uint32_t>(bytes[offset + 2]) << 16) |
           (static_cast<std::uint32_t>(bytes[offset + 3]) << 24);
}

bool decode_wav(const std::vector<std::uint8_t>& bytes, DecodedAudioData& outData) {
    if (bytes.size() < 44) {
        engine::debug::log_error("WAV file too small to contain a valid header");
        return false;
    }
    if (!has_prefix(bytes, "RIFF") || std::memcmp(bytes.data() + 8, "WAVE", 4) != 0) {
        return false;
    }

    std::size_t offset = 12;
    bool foundFmt = false;
    bool foundData = false;
    std::uint16_t audioFormat = 0;
    std::size_t dataOffset = 0;
    std::uint32_t dataSize = 0;

    while (offset + 8 <= bytes.size()) {
        const char* chunkId = reinterpret_cast<const char*>(bytes.data() + offset);
        const std::uint32_t chunkSize = read_u32_le(bytes, offset + 4);
        const std::size_t chunkData = offset + 8;
        if (chunkData + chunkSize > bytes.size()) {
            engine::debug::log_error("WAV chunk exceeds file size");
            return false;
        }

        if (std::memcmp(chunkId, "fmt ", 4) == 0) {
            if (chunkSize < 16) {
                engine::debug::log_error("WAV fmt chunk too small");
                return false;
            }
            audioFormat = read_u16_le(bytes, chunkData + 0);
            outData.channels = static_cast<int>(read_u16_le(bytes, chunkData + 2));
            outData.sampleRate = static_cast<int>(read_u32_le(bytes, chunkData + 4));
            outData.bitsPerSample = static_cast<int>(read_u16_le(bytes, chunkData + 14));
            foundFmt = true;
        } else if (std::memcmp(chunkId, "data", 4) == 0) {
            dataOffset = chunkData;
            dataSize = chunkSize;
            foundData = true;
        }

        offset = chunkData + chunkSize + (chunkSize % 2u);
    }

    if (!foundFmt) {
        engine::debug::log_error("WAV missing fmt chunk");
        return false;
    }
    if (!foundData) {
        engine::debug::log_error("WAV missing data chunk");
        return false;
    }
    if (audioFormat != 1u) {
        engine::debug::log_error("WAV decode currently supports PCM only");
        return false;
    }
    if (outData.channels <= 0 || outData.sampleRate <= 0 || outData.bitsPerSample <= 0) {
        engine::debug::log_error("WAV metadata is invalid");
        return false;
    }

    outData.pcm.assign(bytes.begin() + static_cast<std::ptrdiff_t>(dataOffset),
                       bytes.begin() + static_cast<std::ptrdiff_t>(dataOffset + dataSize));
    return true;
}

bool decode_ogg(const std::vector<std::uint8_t>& bytes, DecodedAudioData& outData) {
    if (!has_prefix(bytes, "OggS")) {
        return false;
    }

    int channels = 0;
    int sampleRate = 0;
    short* decoded = nullptr;
    const int sampleCount = stb_vorbis_decode_memory(bytes.data(), static_cast<int>(bytes.size()), &channels, &sampleRate, &decoded);
    if (sampleCount < 0 || decoded == nullptr) {
        engine::debug::log_error("Failed to decode OGG Vorbis audio data");
        return false;
    }

    outData.channels = channels;
    outData.sampleRate = sampleRate;
    outData.bitsPerSample = 16;

    const std::size_t totalSamples = static_cast<std::size_t>(sampleCount) * static_cast<std::size_t>(channels);
    const std::size_t totalBytes = totalSamples * sizeof(short);
    outData.pcm.resize(totalBytes);
    std::memcpy(outData.pcm.data(), decoded, totalBytes);
    free(decoded);

    return outData.channels > 0 && outData.sampleRate > 0 && !outData.pcm.empty();
}

} // namespace

AudioFormat detect_audio_format(const std::string& path, const std::vector<std::uint8_t>& bytes) {
    if (has_prefix(bytes, "RIFF") && bytes.size() >= 12 && std::memcmp(bytes.data() + 8, "WAVE", 4) == 0) {
        return AudioFormat::Wav;
    }
    if (has_prefix(bytes, "OggS")) {
        return AudioFormat::Ogg;
    }

    const std::string ext = lowercase_extension(path);
    if (ext == ".wav") {
        return AudioFormat::Wav;
    }
    if (ext == ".ogg") {
        return AudioFormat::Ogg;
    }
    return AudioFormat::Unknown;
}

bool decode_audio_bytes(const std::string& path,
                        const std::vector<std::uint8_t>& bytes,
                        DecodedAudioData& outData) {
    outData = {};
    outData.format = detect_audio_format(path, bytes);
    outData.sourceBytes = bytes;

    switch (outData.format) {
    case AudioFormat::Wav:
        if (!decode_wav(bytes, outData)) {
            engine::debug::log_error("Failed to decode WAV audio data: " + path);
            return false;
        }
        return true;
    case AudioFormat::Ogg:
        if (!decode_ogg(bytes, outData)) {
            engine::debug::log_error("Failed to decode OGG audio data: " + path);
            return false;
        }
        return true;
    case AudioFormat::Unknown:
    default:
        engine::debug::log_error("Unsupported audio format: " + path);
        return false;
    }
}

} // namespace engine::audio

#define STB_VORBIS_IMPLEMENTATION
#include "stb_vorbis.c"
