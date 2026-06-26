#pragma once

#include "engine/base/object_grand_base.hpp"
#include "engine/base/object_base.hpp"
#include "engine/instance/instance_query.hpp"
#include "engine/instance/instance_registry.hpp"
#include "engine/utils/resource_manager.hpp"
#include "engine/draw/draw_api.hpp"
#include "engine/draw/sprite.hpp"
#include "engine/draw/text_api.hpp"
#include "engine/audio/audio_engine.hpp"
#include "engine/debug/scenario_runner.hpp"
#include "engine/general/engine_control.hpp"
#include "engine/steam/steam_service.hpp"

#ifndef KEYBOARD_SPACE
#define KEYBOARD_SPACE 32
#endif
#ifndef KEYBOARD_APOSTROPHE
#define KEYBOARD_APOSTROPHE 39
#endif
#ifndef KEYBOARD_COMMA
#define KEYBOARD_COMMA 44
#endif
#ifndef KEYBOARD_MINUS
#define KEYBOARD_MINUS 45
#endif
#ifndef KEYBOARD_PERIOD
#define KEYBOARD_PERIOD 46
#endif
#ifndef KEYBOARD_SLASH
#define KEYBOARD_SLASH 47
#endif
#ifndef KEYBOARD_0
#define KEYBOARD_0 48
#endif
#ifndef KEYBOARD_1
#define KEYBOARD_1 49
#endif
#ifndef KEYBOARD_2
#define KEYBOARD_2 50
#endif
#ifndef KEYBOARD_3
#define KEYBOARD_3 51
#endif
#ifndef KEYBOARD_4
#define KEYBOARD_4 52
#endif
#ifndef KEYBOARD_5
#define KEYBOARD_5 53
#endif
#ifndef KEYBOARD_6
#define KEYBOARD_6 54
#endif
#ifndef KEYBOARD_7
#define KEYBOARD_7 55
#endif
#ifndef KEYBOARD_8
#define KEYBOARD_8 56
#endif
#ifndef KEYBOARD_9
#define KEYBOARD_9 57
#endif
#ifndef KEYBOARD_SEMICOLON
#define KEYBOARD_SEMICOLON 59
#endif
#ifndef KEYBOARD_EQUAL
#define KEYBOARD_EQUAL 61
#endif
#ifndef KEYBOARD_A
#define KEYBOARD_A 65
#endif
#ifndef KEYBOARD_B
#define KEYBOARD_B 66
#endif
#ifndef KEYBOARD_C
#define KEYBOARD_C 67
#endif
#ifndef KEYBOARD_D
#define KEYBOARD_D 68
#endif
#ifndef KEYBOARD_E
#define KEYBOARD_E 69
#endif
#ifndef KEYBOARD_F
#define KEYBOARD_F 70
#endif
#ifndef KEYBOARD_G
#define KEYBOARD_G 71
#endif
#ifndef KEYBOARD_H
#define KEYBOARD_H 72
#endif
#ifndef KEYBOARD_I
#define KEYBOARD_I 73
#endif
#ifndef KEYBOARD_J
#define KEYBOARD_J 74
#endif
#ifndef KEYBOARD_K
#define KEYBOARD_K 75
#endif
#ifndef KEYBOARD_L
#define KEYBOARD_L 76
#endif
#ifndef KEYBOARD_M
#define KEYBOARD_M 77
#endif
#ifndef KEYBOARD_N
#define KEYBOARD_N 78
#endif
#ifndef KEYBOARD_O
#define KEYBOARD_O 79
#endif
#ifndef KEYBOARD_P
#define KEYBOARD_P 80
#endif
#ifndef KEYBOARD_Q
#define KEYBOARD_Q 81
#endif
#ifndef KEYBOARD_R
#define KEYBOARD_R 82
#endif
#ifndef KEYBOARD_S
#define KEYBOARD_S 83
#endif
#ifndef KEYBOARD_T
#define KEYBOARD_T 84
#endif
#ifndef KEYBOARD_U
#define KEYBOARD_U 85
#endif
#ifndef KEYBOARD_V
#define KEYBOARD_V 86
#endif
#ifndef KEYBOARD_W
#define KEYBOARD_W 87
#endif
#ifndef KEYBOARD_X
#define KEYBOARD_X 88
#endif
#ifndef KEYBOARD_Y
#define KEYBOARD_Y 89
#endif
#ifndef KEYBOARD_Z
#define KEYBOARD_Z 90
#endif
#ifndef KEYBOARD_LEFT_BRACKET
#define KEYBOARD_LEFT_BRACKET 91
#endif
#ifndef KEYBOARD_BACKSLASH
#define KEYBOARD_BACKSLASH 92
#endif
#ifndef KEYBOARD_RIGHT_BRACKET
#define KEYBOARD_RIGHT_BRACKET 93
#endif
#ifndef KEYBOARD_GRAVE_ACCENT
#define KEYBOARD_GRAVE_ACCENT 96
#endif
#ifndef KEYBOARD_ESCAPE
#define KEYBOARD_ESCAPE 256
#endif
#ifndef KEYBOARD_ENTER
#define KEYBOARD_ENTER 257
#endif
#ifndef KEYBOARD_TAB
#define KEYBOARD_TAB 258
#endif
#ifndef KEYBOARD_BACKSPACE
#define KEYBOARD_BACKSPACE 259
#endif
#ifndef KEYBOARD_INSERT
#define KEYBOARD_INSERT 260
#endif
#ifndef KEYBOARD_DELETE
#define KEYBOARD_DELETE 261
#endif
#ifndef KEYBOARD_RIGHT
#define KEYBOARD_RIGHT 262
#endif
#ifndef KEYBOARD_LEFT
#define KEYBOARD_LEFT 263
#endif
#ifndef KEYBOARD_DOWN
#define KEYBOARD_DOWN 264
#endif
#ifndef KEYBOARD_UP
#define KEYBOARD_UP 265
#endif
#ifndef KEYBOARD_PAGE_UP
#define KEYBOARD_PAGE_UP 266
#endif
#ifndef KEYBOARD_PAGE_DOWN
#define KEYBOARD_PAGE_DOWN 267
#endif
#ifndef KEYBOARD_HOME
#define KEYBOARD_HOME 268
#endif
#ifndef KEYBOARD_END
#define KEYBOARD_END 269
#endif
#ifndef KEYBOARD_CAPS_LOCK
#define KEYBOARD_CAPS_LOCK 280
#endif
#ifndef KEYBOARD_SCROLL_LOCK
#define KEYBOARD_SCROLL_LOCK 281
#endif
#ifndef KEYBOARD_NUM_LOCK
#define KEYBOARD_NUM_LOCK 282
#endif
#ifndef KEYBOARD_PRINT_SCREEN
#define KEYBOARD_PRINT_SCREEN 283
#endif
#ifndef KEYBOARD_PAUSE
#define KEYBOARD_PAUSE 284
#endif
#ifndef KEYBOARD_F1
#define KEYBOARD_F1 290
#endif
#ifndef KEYBOARD_F2
#define KEYBOARD_F2 291
#endif
#ifndef KEYBOARD_F3
#define KEYBOARD_F3 292
#endif
#ifndef KEYBOARD_F4
#define KEYBOARD_F4 293
#endif
#ifndef KEYBOARD_F5
#define KEYBOARD_F5 294
#endif
#ifndef KEYBOARD_F6
#define KEYBOARD_F6 295
#endif
#ifndef KEYBOARD_F7
#define KEYBOARD_F7 296
#endif
#ifndef KEYBOARD_F8
#define KEYBOARD_F8 297
#endif
#ifndef KEYBOARD_F9
#define KEYBOARD_F9 298
#endif
#ifndef KEYBOARD_F10
#define KEYBOARD_F10 299
#endif
#ifndef KEYBOARD_F11
#define KEYBOARD_F11 300
#endif
#ifndef KEYBOARD_F12
#define KEYBOARD_F12 301
#endif
#ifndef KEYBOARD_LEFT_SHIFT
#define KEYBOARD_LEFT_SHIFT 340
#endif
#ifndef KEYBOARD_LEFT_CONTROL
#define KEYBOARD_LEFT_CONTROL 341
#endif
#ifndef KEYBOARD_LEFT_ALT
#define KEYBOARD_LEFT_ALT 342
#endif
#ifndef KEYBOARD_RIGHT_SHIFT
#define KEYBOARD_RIGHT_SHIFT 344
#endif
#ifndef KEYBOARD_RIGHT_CONTROL
#define KEYBOARD_RIGHT_CONTROL 345
#endif
#ifndef KEYBOARD_RIGHT_ALT
#define KEYBOARD_RIGHT_ALT 346
#endif

#ifndef MOUSE_BUTTON_LEFT
#define MOUSE_BUTTON_LEFT 0
#endif
#ifndef MOUSE_BUTTON_RIGHT
#define MOUSE_BUTTON_RIGHT 1
#endif
#ifndef MOUSE_BUTTON_MIDDLE
#define MOUSE_BUTTON_MIDDLE 2
#endif
#ifndef MOUSE_BUTTON_4
#define MOUSE_BUTTON_4 3
#endif
#ifndef MOUSE_BUTTON_5
#define MOUSE_BUTTON_5 4
#endif
#ifndef MOUSE_BUTTON_6
#define MOUSE_BUTTON_6 5
#endif
#ifndef MOUSE_BUTTON_7
#define MOUSE_BUTTON_7 6
#endif
#ifndef MOUSE_BUTTON_8
#define MOUSE_BUTTON_8 7
#endif

namespace angel_functions {

using ObjectGrandBase = engine::base::ObjectGrandBase;
using ObjectBase = engine::base::ObjectBase;
using InstanceHandle = engine::instance::InstanceHandle;
using Sprite = engine::draw::Sprite;
using AsciiFont = engine::draw::AsciiFont;
using BitmapFont = engine::draw::BitmapFont;
using BitmapGlyph = engine::draw::BitmapGlyph;
using Color = engine::draw::Color;
using Vec2 = engine::draw::Vec2;
using TextureFilter = engine::draw::TextureFilter;
using Sound = engine::audio::Sound;
using SurfaceHandle = engine::draw::SurfaceHandle;
using ShaderHandle = engine::draw::ShaderHandle;
inline constexpr SurfaceHandle kInvalidSurfaceHandle = engine::draw::kInvalidSurfaceHandle;
inline constexpr ShaderHandle kInvalidShaderHandle = engine::draw::kInvalidShaderHandle;

using engine::draw::set_default_texture_filter;
using engine::draw::set_default_sprite_atlas_size;
using engine::draw::default_sprite_atlas_size;
using engine::draw::shader_create_from_fragment;
using engine::draw::shader_destroy;
using engine::draw::shader_set_uniform_float;
using engine::draw::shader_set_uniform_vec2;
using engine::draw::shader_set_uniform_vec4;
using engine::draw::surface_create;
using engine::draw::surface_destroy;
using engine::draw::surface_flush;
using engine::draw::surface_set_target;
using engine::draw::surface_reset_target;
using engine::draw::surface_clear;
using engine::draw::surface_draw;
using engine::draw::surface_set_texture_filter;
using engine::draw::sprite_atlas_set_texture_filter;
using engine::draw::surface_draw_with_shader;
using engine::draw::draw_sprite;
using engine::draw::draw_line;
using engine::draw::draw_triangle;
using engine::draw::draw_rectangle;
using engine::draw::draw_convex_polygon;
using engine::draw::draw_regular_polygon;
using engine::draw::draw_text;
using engine::draw::text_width;
using engine::draw::text_height;
using engine::draw::load_sprite;
using engine::draw::load_ascii_font;
using engine::draw::load_bitmap_font;
using engine::draw::write_bitmap_font_metadata;

using engine::audio::initialize;
using engine::audio::shutdown;
using engine::audio::load_sound;
using engine::audio::play_sound;
using engine::audio::stop_sound;
using engine::audio::play_music;
using engine::audio::stop_music;
using engine::audio::set_master_volume;
using engine::audio::get_master_volume;
using engine::audio::set_sfx_volume;
using engine::audio::get_sfx_volume;
using engine::audio::set_music_volume;
using engine::audio::get_music_volume;

using engine::instance::destroy_instance;
using engine::instance::destroy_nonpersistent_instances;
using engine::instance::create_instance;
using engine::instance::instances_of_type;
using engine::instance::collect_instances_of_type;
using engine::instance::get_handle;
using engine::instance::instance_exists;
using engine::instance::get_instance;

using ResourceManager = engine::utils::ResourceManager;

inline ResourceManager& resources() {
    return ResourceManager::instance();
}

using engine::general::request_game_quit;
using engine::general::is_game_running;
using engine::general::set_target_fps;
using engine::general::get_target_fps;
using engine::general::set_vsync_enabled;
using engine::general::is_vsync_enabled;
using engine::general::CursorMode;
using engine::general::StandardCursor;

using engine::debug::ScenarioAction;
using engine::debug::ScenarioActionType;
using engine::debug::ScenarioRunner;
using engine::debug::scenario;

using engine::general::key_down;
using engine::general::key_pressed;
using engine::general::key_released;

using engine::general::mouse_down;
using engine::general::mouse_pressed;
using engine::general::mouse_released;
using engine::general::mouse_x;
using engine::general::mouse_y;
using engine::general::mouse_position;
using engine::general::mouse_scroll_x;
using engine::general::mouse_scroll_y;
using engine::general::mouse_scroll;

using engine::general::delta_time;

using engine::general::window_width;
using engine::general::window_height;
using engine::general::window_size;
using engine::general::set_window_position;
using engine::general::set_cursor_mode;
using engine::general::cursor_mode;
using engine::general::set_standard_cursor;
using engine::general::clear_cursor;
using engine::general::set_window_size;
using engine::general::set_window_rect;

using engine::steam::steam_enabled_in_build;
using engine::steam::steam_available;
using engine::steam::steam_overlay_active;
using engine::steam::steam_username;
using engine::steam::steam_user_id;
using engine::steam::steam_unlock_achievement;
using engine::steam::steam_set_stat_int;
using engine::steam::steam_set_stat_float;
using engine::steam::steam_store_stats;
using engine::steam::steam_set_rich_presence;
using engine::steam::steam_clear_rich_presence;

} // namespace angel_functions

using namespace angel_functions;
