#pragma once

#include "engine/audio/audio_decode.hpp"

#include <string>

namespace engine::audio {

struct Sound {
    std::string path;
    DecodedAudioData data;
};

bool initialize();
void shutdown();

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

} // namespace engine::audio
