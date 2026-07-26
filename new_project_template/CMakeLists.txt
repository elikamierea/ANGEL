cmake_minimum_required(VERSION 3.20)
project(AngelEngine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(ANGEL_ENABLE_UNITY_BUILD "Enable CMake unity build for faster incremental compiles" ON)
option(ANGEL_ENABLE_PCH "Enable precompiled headers for engine targets" ON)
option(ANGEL_ENABLE_SCCACHE "Use sccache compiler launcher when available" ON)
option(ANGEL_USE_SYSTEM_GLFW "Use an externally installed GLFW instead of the vendored copy" OFF)
option(ANGEL_ENABLE_STEAM "Enable optional Steamworks integration" OFF)
set(STEAMWORKS_SDK_ROOT "" CACHE PATH "Path to a local Steamworks SDK root")
set(ANGEL_STEAM_APP_ID "" CACHE STRING "Steam App ID used for RestartAppIfNecessary and optional local tooling")

if(MSVC)
    add_compile_options(/W4 /permissive- /Zc:__cplusplus /MP)
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

if(ANGEL_ENABLE_UNITY_BUILD)
    set(CMAKE_UNITY_BUILD ON)
    set(CMAKE_UNITY_BUILD_BATCH_SIZE 16)
endif()

if(ANGEL_ENABLE_SCCACHE)
    find_program(SCCACHE_PROGRAM sccache)
    if(SCCACHE_PROGRAM)
        set(CMAKE_C_COMPILER_LAUNCHER "${SCCACHE_PROGRAM}")
        set(CMAKE_CXX_COMPILER_LAUNCHER "${SCCACHE_PROGRAM}")
        message(STATUS "sccache enabled: ${SCCACHE_PROGRAM}")
    else()
        message(STATUS "sccache not found; continuing without compiler cache")
    endif()
endif()

find_package(OpenGL REQUIRED)

set(STEAMWORKS_INCLUDE_DIR "")
set(STEAMWORKS_LIB "")
set(STEAMWORKS_DLL "")

if(ANGEL_ENABLE_STEAM)
    if(STEAMWORKS_SDK_ROOT STREQUAL "")
        set(STEAMWORKS_SDK_ROOT "${CMAKE_SOURCE_DIR}/local/steamworks/sdk")
    endif()

    if(NOT WIN32)
        message(FATAL_ERROR "ANGEL_ENABLE_STEAM currently supports Windows only.")
    endif()

    if(NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
        message(FATAL_ERROR "ANGEL_ENABLE_STEAM currently supports Windows x64 only.")
    endif()

    set(STEAMWORKS_INCLUDE_DIR "${STEAMWORKS_SDK_ROOT}/public")
    set(STEAMWORKS_HEADER "${STEAMWORKS_INCLUDE_DIR}/steam/steam_api.h")
    set(STEAMWORKS_LIB "${STEAMWORKS_SDK_ROOT}/redistributable_bin/win64/steam_api64.lib")
    set(STEAMWORKS_DLL "${STEAMWORKS_SDK_ROOT}/redistributable_bin/win64/steam_api64.dll")

    set(STEAMWORKS_MISSING_PATHS "")
    foreach(path IN ITEMS "${STEAMWORKS_HEADER}" "${STEAMWORKS_LIB}" "${STEAMWORKS_DLL}")
        if(NOT EXISTS "${path}")
            list(APPEND STEAMWORKS_MISSING_PATHS "${path}")
        endif()
    endforeach()

    if(STEAMWORKS_MISSING_PATHS)
        string(JOIN "\n  " STEAMWORKS_MISSING_TEXT ${STEAMWORKS_MISSING_PATHS})
        message(FATAL_ERROR
            "ANGEL_ENABLE_STEAM=ON but the Steamworks SDK is incomplete at:\n"
            "  ${STEAMWORKS_SDK_ROOT}\n"
            "Missing required files:\n"
            "  ${STEAMWORKS_MISSING_TEXT}")
    endif()
endif()

set(GLFW_LIB_TARGET "")

if(ANGEL_USE_SYSTEM_GLFW)
    find_package(glfw3 3.3 CONFIG QUIET)
    if(glfw3_FOUND)
        if(TARGET glfw)
            set(GLFW_LIB_TARGET glfw)
        elseif(TARGET glfw3::glfw)
            set(GLFW_LIB_TARGET glfw3::glfw)
        endif()
    endif()
endif()

if(NOT GLFW_LIB_TARGET)
    if(NOT EXISTS "${CMAKE_SOURCE_DIR}/vendor/glfw/CMakeLists.txt")
        message(FATAL_ERROR
            "Vendored GLFW was not found at vendor/glfw. "
            "Either restore vendor/glfw or configure with -DANGEL_USE_SYSTEM_GLFW=ON.")
    endif()

    set(GLFW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(GLFW_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(GLFW_BUILD_DOCS OFF CACHE BOOL "" FORCE)
    set(GLFW_INSTALL OFF CACHE BOOL "" FORCE)
    add_subdirectory(vendor/glfw EXCLUDE_FROM_ALL)
    set(GLFW_LIB_TARGET glfw)
endif()

add_library(lodepng STATIC
    vendor/lodepng.cpp
)
target_include_directories(lodepng PUBLIC vendor)

function(angel_enable_fast_build target_name)
    if(MSVC)
        target_compile_options(${target_name} PRIVATE /utf-8)
    endif()
    if(ANGEL_ENABLE_PCH)
        target_precompile_headers(${target_name} PRIVATE "$<$<COMPILE_LANGUAGE:CXX>:${CMAKE_SOURCE_DIR}/src/pch.hpp>")
    endif()
endfunction()

set(ENGINE_CORE_SOURCES
    src/engine/base/object_grand_base.cpp
    src/engine/instance/instance_registry.cpp
    src/engine/clock/frame_runner.cpp
    src/engine/general/engine_control.cpp
    src/engine/steam/steam_service.cpp
    src/engine/steam/steam_null_backend.cpp
    src/engine/audio/audio_engine.cpp
    src/engine/audio/audio_decode.cpp
    src/engine/audio/audio_backend_miniaudio.cpp
    vendor/miniaudio_impl.cpp
    src/engine/utils/resource_manager.cpp
    src/engine/utils/asset_io.cpp
    src/engine/debug/debug_tools.cpp
    src/engine/debug/scenario_runner.cpp
)

if(ANGEL_ENABLE_STEAM)
    list(APPEND ENGINE_CORE_SOURCES
        src/engine/steam/steam_steamworks_backend.cpp
    )
endif()

add_library(engine_core STATIC ${ENGINE_CORE_SOURCES})
target_include_directories(engine_core PUBLIC src vendor)
target_link_libraries(engine_core PUBLIC winmm)
if(ANGEL_ENABLE_STEAM)
    target_include_directories(engine_core PRIVATE "${STEAMWORKS_INCLUDE_DIR}")
    target_compile_definitions(engine_core PRIVATE ANGEL_STEAM_COMPILED=1)
    if(NOT ANGEL_STEAM_APP_ID STREQUAL "")
        target_compile_definitions(engine_core PRIVATE ANGEL_STEAM_APP_ID=${ANGEL_STEAM_APP_ID})
    endif()
endif()
if(ANGEL_ENABLE_UNITY_BUILD)
    # stb_vorbis implementation and audio backend source should not be unity-merged.
    set_target_properties(engine_core PROPERTIES UNITY_BUILD OFF)
endif()
angel_enable_fast_build(engine_core)

set(PLATFORM_SOURCES
    src/platform/window.cpp
)
add_library(platform STATIC ${PLATFORM_SOURCES})
target_include_directories(platform PUBLIC src)
target_link_libraries(platform PUBLIC ${GLFW_LIB_TARGET} engine_core)
angel_enable_fast_build(platform)

set(ENGINE_RENDER_SOURCES
    src/engine/draw/draw_api.cpp
    src/engine/draw/text_api.cpp
    src/engine/draw/renderer.cpp
    src/engine/draw/texture_group.cpp
    src/engine/draw/command_buffer.cpp
    src/engine/draw/gpu_abstraction.cpp
    src/engine/draw/gl_loader.cpp
)

add_library(engine_render STATIC ${ENGINE_RENDER_SOURCES})
target_include_directories(engine_render PUBLIC src vendor)
if(ANGEL_ENABLE_UNITY_BUILD)
    # text_api.cpp and texture_group.cpp currently collide in unity mode.
    set_target_properties(engine_render PROPERTIES UNITY_BUILD OFF)
endif()
angel_enable_fast_build(engine_render)
target_link_libraries(engine_render
    PUBLIC
        engine_core
        platform
        lodepng
        ${GLFW_LIB_TARGET}
        OpenGL::GL
)

file(GLOB GAME_SOURCES CONFIGURE_DEPENDS "${CMAKE_SOURCE_DIR}/src/game/*.cpp")
add_library(game STATIC ${GAME_SOURCES})
target_include_directories(game PUBLIC src)
target_link_libraries(game PUBLIC engine_core)
angel_enable_fast_build(game)

if(WIN32)
    add_executable(angel_engine WIN32 src/main.cpp)
else()
    add_executable(angel_engine src/main.cpp)
endif()

if(WIN32 AND MSVC)
    target_link_options(angel_engine PRIVATE /ENTRY:mainCRTStartup)
endif()

angel_enable_fast_build(angel_engine)

target_link_libraries(angel_engine
    PRIVATE
        engine_core
        engine_render
        platform
        game
        lodepng
)

if(ANGEL_ENABLE_STEAM)
    target_link_libraries(angel_engine PRIVATE "${STEAMWORKS_LIB}")
endif()

set_target_properties(angel_engine PROPERTIES OUTPUT_NAME game)

if(EXISTS "${CMAKE_SOURCE_DIR}/src/assets")
    file(GLOB_RECURSE ASSET_FILES
        CONFIGURE_DEPENDS "${CMAKE_SOURCE_DIR}/src/assets/*")

    # Use a stamp file so ninja re-runs the pack whenever any asset is newer than
    # the stamp — regardless of whether angel_engine itself was recompiled.
    # (POST_BUILD only fires when the target re-links, which misses asset-only changes.)
    set(_ASSETS_STAMP "${CMAKE_CURRENT_BINARY_DIR}/assets.pak.stamp")

    add_custom_command(
        OUTPUT "${_ASSETS_STAMP}"
        COMMAND ${CMAKE_COMMAND} -E copy_directory
                "${CMAKE_SOURCE_DIR}/src/assets"
                "$<TARGET_FILE_DIR:angel_engine>/assets"
        COMMAND powershell -NoProfile -ExecutionPolicy Bypass
                -File "${CMAKE_SOURCE_DIR}/tools/build_assets_pak.ps1"
                -SourceDir "${CMAKE_SOURCE_DIR}/src/assets"
                -OutPak "$<TARGET_FILE_DIR:angel_engine>/assets.pak"
        COMMAND ${CMAKE_COMMAND} -E touch "${_ASSETS_STAMP}"
        DEPENDS ${ASSET_FILES}
        COMMENT "Copying assets and packing assets.pak")

    add_custom_target(pack_assets DEPENDS "${_ASSETS_STAMP}")
    add_dependencies(angel_engine pack_assets)
endif()

if(ANGEL_ENABLE_STEAM)
    add_custom_command(TARGET angel_engine POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${STEAMWORKS_DLL}"
                "$<TARGET_FILE_DIR:angel_engine>/steam_api64.dll"
        COMMENT "Copying steam_api64.dll to runtime output directory")
endif()
