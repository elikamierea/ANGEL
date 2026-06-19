#include "engine/debug/scenario_runner.hpp"

#include "engine/debug/debug_tools.hpp"
#include "engine/general/engine_control.hpp"
#include "engine/utils/asset_io.hpp"

#include <algorithm>
#include <cctype>
#include <fstream>
#include <sstream>
#include <filesystem>
#include <sstream>
#include <utility>

namespace engine::debug {
namespace {

constexpr int kTrackedKeyCount = 512;
constexpr int kTrackedMouseButtonCount = 8;

const char* action_type_name(ScenarioActionType type) {
    switch (type) {
    case ScenarioActionType::Log:
        return "Log";
    case ScenarioActionType::Screenshot:
        return "Screenshot";
    case ScenarioActionType::ScreenshotAuto:
        return "ScreenshotAuto";
    case ScenarioActionType::Quit:
        return "Quit";
    case ScenarioActionType::SetKeyDown:
        return "SetKeyDown";
    case ScenarioActionType::SetMouseButtonDown:
        return "SetMouseButtonDown";
    case ScenarioActionType::SetMousePosition:
        return "SetMousePosition";
    case ScenarioActionType::AddMouseScroll:
        return "AddMouseScroll";
    case ScenarioActionType::Callback:
        return "Callback";
    }
    return "Unknown";
}

std::string trim(std::string s) {
    const auto notSpace = [](unsigned char ch) { return !std::isspace(ch); };
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), notSpace));
    s.erase(std::find_if(s.rbegin(), s.rend(), notSpace).base(), s.end());
    return s;
}

bool parse_bool_token(const std::string& token, bool& out) {
    if (token == "true" || token == "1") {
        out = true;
        return true;
    }
    if (token == "false" || token == "0") {
        out = false;
        return true;
    }
    return false;
}

bool split_command_and_payload(const std::string& line, std::string& outCommand, std::string& outPayload) {
    std::istringstream iss(line);
    if (!(iss >> outCommand)) {
        return false;
    }

    std::string rest;
    std::getline(iss, rest);
    outPayload = trim(rest);
    return true;
}

bool parse_action_line(const std::string& line, ScenarioAction& outAction) {
    std::string command;
    std::string payload;
    if (!split_command_and_payload(line, command, payload)) {
        return false;
    }

    if (command == "log") {
        std::istringstream payloadStream(payload);
        if (!(payloadStream >> outAction.frame)) {
            return false;
        }
        std::string text;
        std::getline(payloadStream, text);
        outAction.type = ScenarioActionType::Log;
        outAction.text = trim(text);
        return true;
    }

    if (command == "screenshot") {
        std::istringstream payloadStream(payload);
        if (!(payloadStream >> outAction.frame)) {
            return false;
        }
        std::string text;
        std::getline(payloadStream, text);
        outAction.type = ScenarioActionType::Screenshot;
        outAction.text = trim(text);
        return !outAction.text.empty();
    }

    if (command == "screenshot_auto") {
        std::istringstream payloadStream(payload);
        if (!(payloadStream >> outAction.frame)) {
            return false;
        }
        outAction.type = ScenarioActionType::ScreenshotAuto;
        return true;
    }

    if (command == "quit") {
        std::istringstream payloadStream(payload);
        if (!(payloadStream >> outAction.frame)) {
            return false;
        }
        outAction.type = ScenarioActionType::Quit;
        return true;
    }

    if (command == "key") {
        std::istringstream payloadStream(payload);
        std::string pressedToken;
        if (!(payloadStream >> outAction.frame >> outAction.keycode >> pressedToken)) {
            return false;
        }
        outAction.type = ScenarioActionType::SetKeyDown;
        return parse_bool_token(pressedToken, outAction.pressed);
    }

    if (command == "mouse_button") {
        std::istringstream payloadStream(payload);
        std::string pressedToken;
        if (!(payloadStream >> outAction.frame >> outAction.mouseButton >> pressedToken)) {
            return false;
        }
        outAction.type = ScenarioActionType::SetMouseButtonDown;
        return parse_bool_token(pressedToken, outAction.pressed);
    }

    if (command == "mouse_pos") {
        std::istringstream payloadStream(payload);
        if (!(payloadStream >> outAction.frame >> outAction.mouseX >> outAction.mouseY)) {
            return false;
        }
        outAction.type = ScenarioActionType::SetMousePosition;
        return true;
    }

    if (command == "mouse_scroll") {
        std::istringstream payloadStream(payload);
        if (!(payloadStream >> outAction.frame >> outAction.scrollX >> outAction.scrollY)) {
            return false;
        }
        outAction.type = ScenarioActionType::AddMouseScroll;
        return true;
    }

    return false;
}

bool parse_seed_line(const std::string& line, std::uint32_t& outSeed) {
    std::string command;
    std::string payload;
    if (!split_command_and_payload(line, command, payload)) {
        return false;
    }

    if (command != "seed") {
        return false;
    }

    std::istringstream payloadStream(payload);
    return static_cast<bool>(payloadStream >> outSeed);
}

bool read_text_file(const std::string& path, std::string& outText) {
    outText.clear();

    if (path.rfind("assets/", 0) == 0) {
        return engine::utils::asset_read_text(path, outText);
    }

    std::ifstream in(std::filesystem::path(path), std::ios::binary);
    if (!in) {
        return false;
    }

    std::ostringstream oss;
    oss << in.rdbuf();
    outText = oss.str();
    return static_cast<bool>(in) || in.eof();
}

} // namespace

void ScenarioRunner::clear() {
    m_active = false;
    m_frameIndex = 0;
    m_actions.clear();
    m_nextBeforeIndex = 0;
    m_nextAfterIndex = 0;
    m_keyOverrides.assign(kTrackedKeyCount, false);
    m_keyOverrideMask.assign(kTrackedKeyCount, false);
    m_mouseButtonOverrides.assign(kTrackedMouseButtonCount, false);
    m_mouseButtonOverrideMask.assign(kTrackedMouseButtonCount, false);
    m_mousePositionOverrideEnabled = false;
    m_mouseOverrideX = 0.0;
    m_mouseOverrideY = 0.0;
    m_mouseScrollDeltaX = 0.0;
    m_mouseScrollDeltaY = 0.0;
}

void ScenarioRunner::add_action(const ScenarioAction& action) {
    m_actions.push_back(action);
}

bool ScenarioRunner::load_scenario_from_file(const std::string& path) {
    clear();

    std::string text;
    if (!read_text_file(path, text)) {
        log_error("Scenario load failed: unable to read file: " + path);
        return false;
    }

    std::istringstream input(text);
    std::string rawLine;
    int lineNumber = 0;
    while (std::getline(input, rawLine)) {
        ++lineNumber;
        const std::string line = trim(rawLine);
        if (line.empty() || line[0] == '#') {
            continue;
        }

        std::uint32_t parsedSeed = 0;
        if (parse_seed_line(line, parsedSeed)) {
            engine::general::set_random_seed(parsedSeed);
            log_info("Scenario seed set from file: " + std::to_string(parsedSeed));
            continue;
        }

        ScenarioAction action{};
        if (!parse_action_line(line, action)) {
            clear();
            log_error("Scenario parse failed at line " + std::to_string(lineNumber) + ": " + line);
            return false;
        }

        add_action(action);
    }

    log_info("Scenario loaded from file: " + path + " actionCount=" + std::to_string(m_actions.size()));
    return true;
}

void ScenarioRunner::begin() {
    std::stable_sort(m_actions.begin(), m_actions.end(), [](const ScenarioAction& lhs, const ScenarioAction& rhs) {
        return lhs.frame < rhs.frame;
    });

    m_active = true;
    m_frameIndex = 0;
    m_nextBeforeIndex = 0;
    m_nextAfterIndex = 0;
    m_keyOverrides.assign(kTrackedKeyCount, false);
    m_keyOverrideMask.assign(kTrackedKeyCount, false);
    m_mouseButtonOverrides.assign(kTrackedMouseButtonCount, false);
    m_mouseButtonOverrideMask.assign(kTrackedMouseButtonCount, false);
    m_mousePositionOverrideEnabled = false;
    m_mouseOverrideX = 0.0;
    m_mouseOverrideY = 0.0;
    m_mouseScrollDeltaX = 0.0;
    m_mouseScrollDeltaY = 0.0;

    log_info("Scenario begin: actionCount=" + std::to_string(m_actions.size()));
}

void ScenarioRunner::reset_runtime_state() {
    m_active = false;
    m_frameIndex = 0;
    m_nextBeforeIndex = 0;
    m_nextAfterIndex = 0;
    m_keyOverrides.assign(kTrackedKeyCount, false);
    m_keyOverrideMask.assign(kTrackedKeyCount, false);
    m_mouseButtonOverrides.assign(kTrackedMouseButtonCount, false);
    m_mouseButtonOverrideMask.assign(kTrackedMouseButtonCount, false);
    m_mousePositionOverrideEnabled = false;
    m_mouseOverrideX = 0.0;
    m_mouseOverrideY = 0.0;
    m_mouseScrollDeltaX = 0.0;
    m_mouseScrollDeltaY = 0.0;
}

void ScenarioRunner::before_frame(int currentFrame) {
    if (!m_active) {
        return;
    }

    m_frameIndex = currentFrame;
    m_mouseScrollDeltaX = 0.0;
    m_mouseScrollDeltaY = 0.0;
    run_phase_actions(currentFrame, false);
}

void ScenarioRunner::after_frame(int currentFrame) {
    if (!m_active) {
        return;
    }

    m_frameIndex = currentFrame;
    run_phase_actions(currentFrame, true);

    if (m_nextBeforeIndex >= m_actions.size() && m_nextAfterIndex >= m_actions.size()) {
        m_active = false;
        log_info("Scenario complete at frame " + std::to_string(currentFrame));
    }
}

void ScenarioRunner::apply_key_overrides(std::vector<bool>& keyStates) const {
    if (!m_active) {
        return;
    }

    const std::size_t limit = std::min(keyStates.size(), m_keyOverrideMask.size());
    for (std::size_t i = 0; i < limit; ++i) {
        if (m_keyOverrideMask[i]) {
            keyStates[i] = m_keyOverrides[i];
        }
    }
}

void ScenarioRunner::apply_mouse_button_overrides(std::vector<bool>& buttonStates) const {
    if (!m_active) {
        return;
    }

    const std::size_t limit = std::min(buttonStates.size(), m_mouseButtonOverrideMask.size());
    for (std::size_t i = 0; i < limit; ++i) {
        if (m_mouseButtonOverrideMask[i]) {
            buttonStates[i] = m_mouseButtonOverrides[i];
        }
    }
}

void ScenarioRunner::apply_mouse_position_override(double& mouseX, double& mouseY) const {
    if (!m_active || !m_mousePositionOverrideEnabled) {
        return;
    }

    mouseX = m_mouseOverrideX;
    mouseY = m_mouseOverrideY;
}

void ScenarioRunner::apply_mouse_scroll_override(double& scrollX, double& scrollY) const {
    if (!m_active) {
        return;
    }

    scrollX += m_mouseScrollDeltaX;
    scrollY += m_mouseScrollDeltaY;
}

bool ScenarioRunner::has_actions() const {
    return !m_actions.empty();
}

bool ScenarioRunner::active() const {
    return m_active;
}

int ScenarioRunner::frame_index() const {
    return m_frameIndex;
}

void ScenarioRunner::run_phase_actions(int currentFrame, bool afterFramePhase) {
    std::size_t& nextIndex = afterFramePhase ? m_nextAfterIndex : m_nextBeforeIndex;
    while (nextIndex < m_actions.size()) {
        const ScenarioAction& action = m_actions[nextIndex];
        if (action.frame > currentFrame) {
            break;
        }

        if (is_after_frame_action(action.type) != afterFramePhase) {
            ++nextIndex;
            continue;
        }

        log_action_execution(action, currentFrame);
        execute_action(action, afterFramePhase);
        ++nextIndex;
    }
}

void ScenarioRunner::execute_action(const ScenarioAction& action, bool afterFramePhase) {
    switch (action.type) {
    case ScenarioActionType::Log:
        log_info("Scenario log: " + action.text);
        break;
    case ScenarioActionType::Screenshot:
        capture_screenshot(action.text);
        break;
    case ScenarioActionType::ScreenshotAuto:
        capture_screenshot_auto();
        break;
    case ScenarioActionType::Quit:
        engine::general::request_game_quit();
        break;
    case ScenarioActionType::SetKeyDown:
        if (!afterFramePhase && action.keycode >= 0 && action.keycode < kTrackedKeyCount) {
            const auto index = static_cast<std::size_t>(action.keycode);
            m_keyOverrideMask[index] = true;
            m_keyOverrides[index] = action.pressed;
        }
        break;
    case ScenarioActionType::SetMouseButtonDown:
        if (!afterFramePhase && action.mouseButton >= 0 && action.mouseButton < kTrackedMouseButtonCount) {
            const auto index = static_cast<std::size_t>(action.mouseButton);
            m_mouseButtonOverrideMask[index] = true;
            m_mouseButtonOverrides[index] = action.pressed;
        }
        break;
    case ScenarioActionType::SetMousePosition:
        if (!afterFramePhase) {
            m_mousePositionOverrideEnabled = true;
            m_mouseOverrideX = action.mouseX;
            m_mouseOverrideY = action.mouseY;
        }
        break;
    case ScenarioActionType::AddMouseScroll:
        if (!afterFramePhase) {
            m_mouseScrollDeltaX += action.scrollX;
            m_mouseScrollDeltaY += action.scrollY;
        }
        break;
    case ScenarioActionType::Callback:
        if (!afterFramePhase && action.callback) {
            action.callback();
        }
        break;
    }
}

void ScenarioRunner::log_action_execution(const ScenarioAction& action, int currentFrame) const {
    std::ostringstream oss;
    oss << "Scenario action @frame " << currentFrame << ": " << action_type_name(action.type);
    if (!action.text.empty()) {
        oss << " text=\"" << action.text << "\"";
    }
    if (action.type == ScenarioActionType::SetKeyDown) {
        oss << " key=" << action.keycode << " pressed=" << (action.pressed ? "true" : "false");
    }
    if (action.type == ScenarioActionType::SetMouseButtonDown) {
        oss << " button=" << action.mouseButton << " pressed=" << (action.pressed ? "true" : "false");
    }
    if (action.type == ScenarioActionType::SetMousePosition) {
        oss << " x=" << action.mouseX << " y=" << action.mouseY;
    }
    if (action.type == ScenarioActionType::AddMouseScroll) {
        oss << " scrollX=" << action.scrollX << " scrollY=" << action.scrollY;
    }
    log_info(oss.str());
}

bool ScenarioRunner::is_after_frame_action(ScenarioActionType type) const {
    switch (type) {
    case ScenarioActionType::Screenshot:
    case ScenarioActionType::ScreenshotAuto:
    case ScenarioActionType::Quit:
        return true;
    case ScenarioActionType::Log:
    case ScenarioActionType::SetKeyDown:
    case ScenarioActionType::SetMouseButtonDown:
    case ScenarioActionType::SetMousePosition:
    case ScenarioActionType::AddMouseScroll:
    case ScenarioActionType::Callback:
        return false;
    }
    return false;
}

ScenarioRunner& scenario() {
    static ScenarioRunner runner;
    return runner;
}

} // namespace engine::debug
