#include "engine/general/engine_control.hpp"

#include "engine/clock/frame_runner.hpp"
#include "engine/audio/audio_engine.hpp"
#include "engine/debug/debug_tools.hpp"
#include "engine/debug/scenario_runner.hpp"
#include "engine/draw/draw_api.hpp"
#include "engine/utils/asset_io.hpp"
#include "platform/window.hpp"

#include <array>
#include <chrono>
#include <cstdlib>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <string>
#include <thread>
#include <vector>

extern void __GameStart__();
extern void __GameTest__(const std::string& testName);

namespace engine::general {
namespace {
constexpr int kTrackedKeyCount = 512;
constexpr int kTrackedMouseButtonCount = 8;

bool g_gameRunning = true;
int g_targetFps = 0;
bool g_vsyncEnabled = true;
bool g_turboEnabled = false;
bool g_recordEnabled = false;
std::uint32_t g_randomSeed = 0;
double g_deltaTime = 0.0;
double g_mouseX = 0.0;
double g_mouseY = 0.0;
double g_mouseScrollX = 0.0;
double g_mouseScrollY = 0.0;
platform::Window* g_activeWindow = nullptr;
std::array<bool, kTrackedKeyCount> g_prevKeyDown{};
std::array<bool, kTrackedKeyCount> g_currKeyDown{};
std::array<bool, kTrackedMouseButtonCount> g_prevMouseDown{};
std::array<bool, kTrackedMouseButtonCount> g_currMouseDown{};
std::vector<std::string> g_recordLines;

void record_append_line(const std::string& line) {
    if (g_recordEnabled) {
        g_recordLines.push_back(line);
    }
}

void record_frame_inputs(int frameIndex) {
    if (!g_recordEnabled) {
        return;
    }

    if (g_recordLines.empty()) {
        record_append_line("seed " + std::to_string(g_randomSeed));
    }

    record_append_line("mouse_pos " + std::to_string(frameIndex) + " " + std::to_string(g_mouseX) + " " + std::to_string(g_mouseY));

    if (g_mouseScrollX != 0.0 || g_mouseScrollY != 0.0) {
        record_append_line("mouse_scroll " + std::to_string(frameIndex) + " " + std::to_string(g_mouseScrollX) + " " + std::to_string(g_mouseScrollY));
    }

    for (int key = 0; key < kTrackedKeyCount; ++key) {
        const auto idx = static_cast<std::size_t>(key);
        if (g_currKeyDown[idx] != g_prevKeyDown[idx]) {
            record_append_line("key " + std::to_string(frameIndex) + " " + std::to_string(key) + " " + (g_currKeyDown[idx] ? "true" : "false"));
        }
    }

    for (int button = 0; button < kTrackedMouseButtonCount; ++button) {
        const auto idx = static_cast<std::size_t>(button);
        if (g_currMouseDown[idx] != g_prevMouseDown[idx]) {
            record_append_line("mouse_button " + std::to_string(frameIndex) + " " + std::to_string(button) + " " + (g_currMouseDown[idx] ? "true" : "false"));
        }
    }
}

void flush_record_file() {
    if (!g_recordEnabled) {
        return;
    }

    std::ofstream out(std::filesystem::current_path() / "record.txt", std::ios::out | std::ios::trunc);
    if (!out) {
        engine::debug::log_error("record: failed to open record.txt for writing");
        return;
    }

    for (const auto& line : g_recordLines) {
        out << line << '\n';
    }
    out.flush();
    engine::debug::log_info("record: wrote record.txt with " + std::to_string(g_recordLines.size()) + " lines");
}

void refresh_input_state() {
    g_prevKeyDown = g_currKeyDown;
    g_prevMouseDown = g_currMouseDown;

    if (g_activeWindow == nullptr) {
        g_currKeyDown.fill(false);
        g_currMouseDown.fill(false);
        g_mouseX = 0.0;
        g_mouseY = 0.0;
        g_mouseScrollX = 0.0;
        g_mouseScrollY = 0.0;
        return;
    }

    for (int key = 0; key < kTrackedKeyCount; ++key) {
        g_currKeyDown[static_cast<std::size_t>(key)] = g_activeWindow->is_key_down(key);
    }

    std::vector<bool> scenarioKeyStates(g_currKeyDown.begin(), g_currKeyDown.end());
    engine::debug::scenario().apply_key_overrides(scenarioKeyStates);
    for (int key = 0; key < kTrackedKeyCount; ++key) {
        g_currKeyDown[static_cast<std::size_t>(key)] = scenarioKeyStates[static_cast<std::size_t>(key)];
    }

    for (int button = 0; button < kTrackedMouseButtonCount; ++button) {
        g_currMouseDown[static_cast<std::size_t>(button)] = g_activeWindow->is_mouse_down(button);
    }

    std::vector<bool> scenarioMouseButtons(g_currMouseDown.begin(), g_currMouseDown.end());
    engine::debug::scenario().apply_mouse_button_overrides(scenarioMouseButtons);
    for (int button = 0; button < kTrackedMouseButtonCount; ++button) {
        g_currMouseDown[static_cast<std::size_t>(button)] = scenarioMouseButtons[static_cast<std::size_t>(button)];
    }

    g_activeWindow->mouse_position(g_mouseX, g_mouseY);
    engine::debug::scenario().apply_mouse_position_override(g_mouseX, g_mouseY);
    g_activeWindow->mouse_scroll(g_mouseScrollX, g_mouseScrollY);
    engine::debug::scenario().apply_mouse_scroll_override(g_mouseScrollX, g_mouseScrollY);
}

bool keycode_in_range(int keycode) {
    return keycode >= 0 && keycode < kTrackedKeyCount;
}

bool mouse_button_in_range(int button) {
    return button >= 0 && button < kTrackedMouseButtonCount;
}

platform::CursorMode to_platform_cursor_mode(CursorMode mode) {
    switch (mode) {
    case CursorMode::Normal:
        return platform::CursorMode::Normal;
    case CursorMode::Hidden:
        return platform::CursorMode::Hidden;
    case CursorMode::Disabled:
        return platform::CursorMode::Disabled;
    }
    return platform::CursorMode::Normal;
}

CursorMode from_platform_cursor_mode(platform::CursorMode mode) {
    switch (mode) {
    case platform::CursorMode::Normal:
        return CursorMode::Normal;
    case platform::CursorMode::Hidden:
        return CursorMode::Hidden;
    case platform::CursorMode::Disabled:
        return CursorMode::Disabled;
    }
    return CursorMode::Normal;
}

platform::StandardCursor to_platform_standard_cursor(StandardCursor cursor) {
    switch (cursor) {
    case StandardCursor::Arrow:
        return platform::StandardCursor::Arrow;
    case StandardCursor::IBeam:
        return platform::StandardCursor::IBeam;
    case StandardCursor::Crosshair:
        return platform::StandardCursor::Crosshair;
    case StandardCursor::Hand:
        return platform::StandardCursor::Hand;
    case StandardCursor::HResize:
        return platform::StandardCursor::HResize;
    case StandardCursor::VResize:
        return platform::StandardCursor::VResize;
    }
    return platform::StandardCursor::Arrow;
}

double compute_turbo_delta_time() {
    const int targetFps = get_target_fps();
    if (targetFps > 0) {
        return 1.0 / static_cast<double>(targetFps);
    }

    if (g_activeWindow != nullptr) {
        const int refreshRate = g_activeWindow->current_refresh_rate();
        if (refreshRate > 0) {
            return 1.0 / static_cast<double>(refreshRate);
        }
    }

    return 1.0 / 60.0;
}
}

Engine::Engine(platform::Window& window) : m_window(window) {}

bool Engine::initialize(const std::string& testName, const std::string& scenarioPath) {
    if (m_initialized) {
        return true;
    }

    const auto runtimeRoot = std::filesystem::current_path();
    engine::utils::asset_set_root(runtimeRoot.string());

    const auto pakPath = runtimeRoot / "assets.pak";
    if (std::filesystem::exists(pakPath)) {
        engine::utils::asset_set_pak_path(pakPath.string());
    } else {
        engine::utils::asset_set_pak_path("");
    }

    if (!engine::draw::renderer_initialize(m_window)) {
        return false;
    }

    if (!engine::audio::initialize()) {
        return false;
    }

    g_activeWindow = &m_window;
    m_window.set_vsync_enabled(g_vsyncEnabled);
    g_prevKeyDown.fill(false);
    g_currKeyDown.fill(false);
    g_prevMouseDown.fill(false);
    g_currMouseDown.fill(false);
    g_mouseX = 0.0;
    g_mouseY = 0.0;
    g_mouseScrollX = 0.0;
    g_mouseScrollY = 0.0;
    g_deltaTime = 0.0;

    g_gameRunning = true;
    engine::debug::scenario().reset_runtime_state();
    g_recordLines.clear();

    if (!scenarioPath.empty()) {
        if (!engine::debug::scenario().load_scenario_from_file(scenarioPath)) {
            engine::debug::log_error("Engine scenario mode initialization failed: " + scenarioPath);
            return false;
        }
        engine::debug::scenario().begin();
        engine::debug::log_info("Engine scenario mode initialized: " + scenarioPath);
    }

    if (!testName.empty()) {
        ::__GameTest__(testName);
        if (engine::debug::scenario().has_actions()) {
            engine::debug::scenario().begin();
        }
        engine::debug::log_info("Engine test mode initialized: " + testName);
    } else {
        ::__GameStart__();
    }

    m_initialized = true;
    engine::debug::log_info("Engine lifecycle initialized");
    return true;
}

void Engine::run() {
    if (!m_initialized) {
        return;
    }

    using clock = std::chrono::steady_clock;

    auto lastFrameStart = clock::now();
    int frameIndex = 0;

    while (is_game_running() && !m_window.should_close()) {
        const auto frameStart = clock::now();
        if (g_turboEnabled || g_recordEnabled || engine::debug::scenario().active()) {
            g_deltaTime = compute_turbo_delta_time();
        } else {
            g_deltaTime = std::chrono::duration<double>(frameStart - lastFrameStart).count();
        }
        lastFrameStart = frameStart;

        m_window.poll_events();
        engine::debug::scenario().before_frame(frameIndex);
        refresh_input_state();
        record_frame_inputs(frameIndex);
        engine::clock::FrameRunner::RunFrame();
        engine::debug::scenario().after_frame(frameIndex);
        ++frameIndex;

        const int targetFps = get_target_fps();
        bool shouldApplyLimiter = targetFps > 0;
        if (shouldApplyLimiter && is_vsync_enabled()) {
            const int refreshRate = m_window.current_refresh_rate();
            if (refreshRate > 0 && targetFps >= refreshRate) {
                shouldApplyLimiter = false;
            }
        }

        if (!g_turboEnabled && shouldApplyLimiter) {
            const auto targetFrameDuration = std::chrono::duration<double>(1.0 / static_cast<double>(targetFps));
            const auto frameElapsed = clock::now() - frameStart;
            if (frameElapsed < targetFrameDuration) {
                std::this_thread::sleep_for(targetFrameDuration - frameElapsed);
            }
        }
    }
}

void Engine::shutdown() {
    if (!m_initialized) {
        return;
    }

    engine::audio::shutdown();
    engine::draw::renderer_shutdown();
    engine::debug::scenario().reset_runtime_state();
    flush_record_file();
    g_activeWindow = nullptr;
    m_initialized = false;
}

void request_game_quit() {
    g_gameRunning = false;
}

bool is_game_running() {
    return g_gameRunning;
}

void set_target_fps(int fps) {
    g_targetFps = fps > 0 ? fps : 0;
}

int get_target_fps() {
    return g_targetFps;
}

void set_vsync_enabled(bool enabled) {
    g_vsyncEnabled = enabled;
    if (g_activeWindow != nullptr) {
        g_activeWindow->set_vsync_enabled(enabled);
    }
}

bool is_vsync_enabled() {
    return g_vsyncEnabled;
}

void set_turbo_enabled(bool enabled) {
    g_turboEnabled = enabled;
}

bool is_turbo_enabled() {
    return g_turboEnabled;
}

void set_record_enabled(bool enabled) {
    g_recordEnabled = enabled;
}

bool is_record_enabled() {
    return g_recordEnabled;
}

void initialize_random_seed() {
    const auto now = std::chrono::system_clock::now().time_since_epoch().count();
    set_random_seed(static_cast<std::uint32_t>(now));
}

void set_random_seed(std::uint32_t seed) {
    g_randomSeed = seed;
    std::srand(static_cast<unsigned int>(seed));
}

std::uint32_t random_seed() {
    return g_randomSeed;
}

bool key_down(int keycode) {
    if (!keycode_in_range(keycode)) {
        return false;
    }
    return g_currKeyDown[static_cast<std::size_t>(keycode)];
}

bool key_pressed(int keycode) {
    if (!keycode_in_range(keycode)) {
        return false;
    }

    const auto idx = static_cast<std::size_t>(keycode);
    return g_currKeyDown[idx] && !g_prevKeyDown[idx];
}

bool key_released(int keycode) {
    if (!keycode_in_range(keycode)) {
        return false;
    }

    const auto idx = static_cast<std::size_t>(keycode);
    return !g_currKeyDown[idx] && g_prevKeyDown[idx];
}

bool mouse_down(int button) {
    if (!mouse_button_in_range(button)) {
        return false;
    }
    return g_currMouseDown[static_cast<std::size_t>(button)];
}

bool mouse_pressed(int button) {
    if (!mouse_button_in_range(button)) {
        return false;
    }

    const auto idx = static_cast<std::size_t>(button);
    return g_currMouseDown[idx] && !g_prevMouseDown[idx];
}

bool mouse_released(int button) {
    if (!mouse_button_in_range(button)) {
        return false;
    }

    const auto idx = static_cast<std::size_t>(button);
    return !g_currMouseDown[idx] && g_prevMouseDown[idx];
}

double mouse_x() {
    return g_mouseX;
}

double mouse_y() {
    return g_mouseY;
}

void mouse_position(double& outX, double& outY) {
    outX = g_mouseX;
    outY = g_mouseY;
}

double mouse_scroll_x() {
    return g_mouseScrollX;
}

double mouse_scroll_y() {
    return g_mouseScrollY;
}

void mouse_scroll(double& outScrollX, double& outScrollY) {
    outScrollX = g_mouseScrollX;
    outScrollY = g_mouseScrollY;
}

double delta_time() {
    return g_deltaTime;
}

int window_width() {
    if (g_activeWindow == nullptr) {
        return 0;
    }
    return g_activeWindow->window_width();
}

int window_height() {
    if (g_activeWindow == nullptr) {
        return 0;
    }
    return g_activeWindow->window_height();
}

void window_size(int& outWidth, int& outHeight) {
    if (g_activeWindow == nullptr) {
        outWidth = 0;
        outHeight = 0;
        return;
    }
    g_activeWindow->window_size(outWidth, outHeight);
}

int framebuffer_width() {
    if (g_activeWindow == nullptr) {
        return 0;
    }
    int width = 0;
    int height = 0;
    g_activeWindow->framebuffer_size(width, height);
    return width;
}

int framebuffer_height() {
    if (g_activeWindow == nullptr) {
        return 0;
    }
    int width = 0;
    int height = 0;
    g_activeWindow->framebuffer_size(width, height);
    return height;
}

void framebuffer_size(int& outWidth, int& outHeight) {
    if (g_activeWindow == nullptr) {
        outWidth = 0;
        outHeight = 0;
        return;
    }
    g_activeWindow->framebuffer_size(outWidth, outHeight);
}

void set_window_position(int x, int y) {
    if (g_activeWindow != nullptr) {
        g_activeWindow->set_window_position(x, y);
    }
}

void set_window_size(int width, int height) {
    if (g_activeWindow != nullptr) {
        g_activeWindow->set_window_size(width, height);
    }
}

void set_window_rect(int x, int y, int width, int height) {
    if (g_activeWindow != nullptr) {
        g_activeWindow->set_window_rect(x, y, width, height);
    }
}

void set_cursor_mode(CursorMode mode) {
    if (g_activeWindow != nullptr) {
        g_activeWindow->set_cursor_mode(to_platform_cursor_mode(mode));
    }
}

CursorMode cursor_mode() {
    if (g_activeWindow == nullptr) {
        return CursorMode::Normal;
    }
    return from_platform_cursor_mode(g_activeWindow->cursor_mode());
}

bool set_standard_cursor(StandardCursor cursor) {
    if (g_activeWindow == nullptr) {
        return false;
    }
    return g_activeWindow->set_standard_cursor(to_platform_standard_cursor(cursor));
}

void clear_cursor() {
    if (g_activeWindow != nullptr) {
        g_activeWindow->clear_cursor();
    }
}

} // namespace engine::general
