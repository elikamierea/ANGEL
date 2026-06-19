#include "engine/debug/debug_tools.hpp"
#include "engine/general/engine_control.hpp"
#include <string>

void __GameTest__(const std::string& testName) {
	engine::general::set_vsync_enabled(true);
	engine::general::set_target_fps(60);

    engine::debug::log_info("Running game test: " + testName);

    // Register and dispatch test cases here.
    // Keep this as the centralized entry for command-line test mode.
}
