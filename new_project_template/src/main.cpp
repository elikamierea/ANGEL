#include "engine/general/engine_control.hpp"
#include "engine/debug/debug_tools.hpp"
#include "platform/window.hpp"

#include <string>

int main(int argc, char** argv) {
    std::string testName;
    std::string scenarioPath;
    bool debugEnabled = false;
    bool turboEnabled = false;
    bool recordEnabled = false;

    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--debug") {
            debugEnabled = true;
            continue;
        }

        if (arg == "--turbo") {
            turboEnabled = true;
            continue;
        }

        if (arg == "--record") {
            recordEnabled = true;
            continue;
        }

        if (arg == "--scenario") {
            if (i + 1 >= argc) {
                engine::debug::set_enabled(true);
                engine::debug::log_error("Missing scenario path after --scenario");
                return -1;
            }
            scenarioPath = argv[++i];
            continue;
        }

        if (arg == "--test") {
            if (i + 1 >= argc) {
                engine::debug::set_enabled(true);
                engine::debug::log_error("Missing test name after --test");
                return -1;
            }
            testName = argv[++i];
        }
    }

    engine::debug::set_enabled(debugEnabled);
    engine::general::set_turbo_enabled(turboEnabled);
    engine::general::set_record_enabled(recordEnabled);
    engine::general::initialize_random_seed();

    platform::Window window(1280, 720, "Angel Engine");
    if (!window.initialize()) {
        return -1;
    }

    engine::general::Engine engine(window);
    if (!engine.initialize(testName, scenarioPath)) {
        window.shutdown();
        return -1;
    }

    engine.run();

    engine.shutdown();
    window.shutdown();
    return 0;
}
