# Angel Engine Manual - Audio

This file covers:
- sound loading
- sound effect playback
- music playback
- master / SFX / music volume controls
- the exposed audio lifecycle hooks

Audio APIs are re-exported by `ANGEL.h`.

## Public types

```cpp
struct Sound {
    std::string path;
    DecodedAudioData data;
};
```

For normal gameplay code, you usually treat `Sound` as an opaque loaded asset and pass it to playback helpers.

## Audio lifecycle

Public helpers:

```cpp
bool initialize();
void shutdown();
```

Normal gameplay code usually does not need to call these directly because the engine manages audio startup and shutdown for you.

These functions are mainly useful if you are building custom tooling around the lower-level engine pieces.

## Loading sounds

```cpp
Sound load_sound(const std::string& path);
```

Path rules:
- use logical `assets/...` paths when loading packaged game assets
- audio uses the same asset pipeline as other resources

Current behavior:
- the engine reads the source bytes
- detects supported formats
- decodes to PCM-backed audio data
- stores the decoded result on the returned `Sound`

Current built-in decode scope:
- WAV PCM
- OGG Vorbis decoded to 16-bit PCM

## Sound effect playback

```cpp
int play_sound(const Sound& sound, float volume = 1.0f);
void stop_sound(int handle);
```

Notes:
- `play_sound(...)` supports overlapping sound effects
- the returned integer handle can be used to stop that playback explicitly
- `volume` here is per-play call volume before the broader SFX/master volume controls apply

## Music playback

```cpp
bool play_music(const std::string& path, bool loop = true);
void stop_music();
```

Notes:
- music is path-based rather than `Sound`-object-based
- current music playback is single-channel
- starting a new music track replaces the previous one
- `loop = true` is the default

## Volume controls

```cpp
void set_master_volume(float volume);
float get_master_volume();

void set_sfx_volume(float volume);
float get_sfx_volume();

void set_music_volume(float volume);
float get_music_volume();
```

Meaning:
- `master` affects the whole audio output
- `sfx` affects sound effects
- `music` affects music playback

## Asset pipeline note

Audio paths can use the same logical asset convention as sprites and fonts:

```cpp
assets/audio/jump.wav
assets/audio/bgm/level01.ogg
```

When a logical asset path is used, the engine resolves it through:
1. `assets.pak`
2. fallback `assets/`
