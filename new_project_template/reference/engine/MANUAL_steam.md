# Angel Engine Manual - Steam

Read this file only when you want to enable Steam support for a project built on this template.

If you are not shipping on Steam yet, you can ignore this file.

This file covers:
- when Steam support matters
- where to place the local Steamworks SDK
- which CMake options to use
- what the current Steam integration exposes

It does not cover:
- Steam networking
- Workshop / UGC
- Steam Inventory / microtransactions
- Steam Input

## When to read this

Read this file when at least one of these is true:
- you want to build a Steam-enabled version of your game
- you want to test Steam achievements / stats / rich presence locally
- you need to understand why Steam is disabled in the current build

If you are only working on normal gameplay, rendering, input, or audio, you do not need this file.

## Current Steam boundary

Angel Engine supports optional Steam integration.

Important rules:
- the template does not ship with the Steamworks SDK
- Steam support is disabled by default
- projects without a local SDK still compile and run normally
- when Steam is disabled, the engine uses a safe no-op backend

## Local SDK location

Recommended default location:

```txt
local/steamworks/sdk/
```

This directory is ignored by `.gitignore`.

Minimum expected files for Windows x64:

```txt
local/steamworks/sdk/
  public/steam/steam_api.h
  redistributable_bin/win64/steam_api64.lib
  redistributable_bin/win64/steam_api64.dll
```

You can also point CMake at another SDK location with `STEAMWORKS_SDK_ROOT`.

## CMake options

Steam support is controlled by:

```txt
ANGEL_ENABLE_STEAM
STEAMWORKS_SDK_ROOT
ANGEL_STEAM_APP_ID
```

Recommended template workflow:
- edit the default values in `CMakeLists.txt` for the project that needs Steam
- keep using the same normal build commands

### Default build

Normal build without Steam:

```txt
ANGEL_ENABLE_STEAM=OFF
```

Behavior:
- no Steam headers are included
- no Steam libraries are linked
- Steam helper functions stay available but do nothing
- this is still the default until you change the project defaults in `CMakeLists.txt`

### Steam-enabled build

Steam build:

```txt
ANGEL_ENABLE_STEAM=ON
STEAMWORKS_SDK_ROOT=<path-to-sdk>
ANGEL_STEAM_APP_ID=<your-app-id>
```

Behavior:
- CMake validates the SDK location
- the engine links `steam_api64.lib`
- `steam_api64.dll` is copied next to the built executable

If Steam is enabled and the SDK is incomplete, configuration fails with a direct error.

## Project-side defaults

If a project built from this template wants Steam by default, edit the values near the top of `CMakeLists.txt`.

Recommended setup:

1. Change `ANGEL_ENABLE_STEAM` from `OFF` to `ON`
2. Set `STEAMWORKS_SDK_ROOT` to your real SDK path
3. Set `ANGEL_STEAM_APP_ID` to your Steam App ID
4. Build as usual

Recommended values:

```cmake
option(ANGEL_ENABLE_STEAM "Enable optional Steamworks integration" ON)
set(STEAMWORKS_SDK_ROOT "F:/SDKs/steamworks/sdk" CACHE PATH "Path to a local Steamworks SDK root")
set(ANGEL_STEAM_APP_ID "123456" CACHE STRING "Steam App ID used for RestartAppIfNecessary and optional local tooling")
```

This keeps the build commands unchanged and moves the Steam choice into the project configuration itself.

## Runtime behavior

When Steam support is compiled in:
- the process may call `SteamAPI_RestartAppIfNecessary(...)` before normal startup
- the engine initializes Steam during engine startup
- the engine runs Steam callbacks once per frame
- the engine shuts Steam down during engine shutdown

If Steam initialization fails at runtime:
- the engine logs a warning
- the game continues without Steam features

## Development `steam_appid.txt`

`steam_appid.txt` is for local development only.

Rules:
- do not commit it
- do not ship it in a release build
- use it only when testing Steam locally outside a normal Steam launch path

The repository ignores `steam_appid.txt`.

## Current gameplay-facing Steam helpers

The current public helpers are exposed through `#include "game/ANGEL.h"`.

Available helpers:
- `steam_enabled_in_build()`
- `steam_available()`
- `steam_overlay_active()`
- `steam_username()`
- `steam_user_id()`
- `steam_unlock_achievement(...)`
- `steam_set_stat_int(...)`
- `steam_set_stat_float(...)`
- `steam_store_stats()`
- `steam_set_rich_presence(...)`
- `steam_clear_rich_presence()`

Recommended usage:

```cpp
if (steam_available()) {
    steam_unlock_achievement("FIRST_CLEAR");
}
```

Do not call raw `SteamAPI_*` functions directly from gameplay code.

## Current scope

The current Steam layer is intentionally small.

Supported:
- availability
- username
- Steam user ID
- achievements
- stats
- rich presence
- overlay activation state

Not yet covered:
- networking
- lobbies
- Workshop
- cloud save conflict handling
- inventory
- commerce
