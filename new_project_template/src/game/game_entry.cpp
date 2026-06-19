#include "game/game_entry.hpp"

#include "engine/debug/debug_tools.hpp"
#include "engine/general/engine_control.hpp"

void __GameStart__() {
    engine::general::set_vsync_enabled(true);
    engine::general::set_target_fps(60);

    engine::debug::log_info("__GameStart__ invoked - add your game initialization here.");
}
