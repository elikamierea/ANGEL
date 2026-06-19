#pragma once

#include <functional>
#include <string>
#include <vector>

namespace engine::debug {

enum class ScenarioActionType {
    Log,
    Screenshot,
    ScreenshotAuto,
    Quit,
    SetKeyDown,
    SetMouseButtonDown,
    SetMousePosition,
    AddMouseScroll,
    Callback
};

struct ScenarioAction {
    int frame = 0;
    ScenarioActionType type = ScenarioActionType::Log;
    std::string text;
    int keycode = 0;
    bool pressed = false;
    int mouseButton = 0;
    double mouseX = 0.0;
    double mouseY = 0.0;
    double scrollX = 0.0;
    double scrollY = 0.0;
    std::function<void()> callback;
};

class ScenarioRunner {
public:
    void clear();
    void add_action(const ScenarioAction& action);
    bool load_scenario_from_file(const std::string& path);
    void begin();
    void reset_runtime_state();

    void before_frame(int currentFrame);
    void after_frame(int currentFrame);
    void apply_key_overrides(std::vector<bool>& keyStates) const;
    void apply_mouse_button_overrides(std::vector<bool>& buttonStates) const;
    void apply_mouse_position_override(double& mouseX, double& mouseY) const;
    void apply_mouse_scroll_override(double& scrollX, double& scrollY) const;

    bool has_actions() const;
    bool active() const;
    int frame_index() const;

private:
    void run_phase_actions(int currentFrame, bool afterFramePhase);
    void execute_action(const ScenarioAction& action, bool afterFramePhase);
    void log_action_execution(const ScenarioAction& action, int currentFrame) const;
    bool is_after_frame_action(ScenarioActionType type) const;

private:
    bool m_active{false};
    int m_frameIndex{0};
    std::vector<ScenarioAction> m_actions;
    std::size_t m_nextBeforeIndex{0};
    std::size_t m_nextAfterIndex{0};
    std::vector<bool> m_keyOverrides;
    std::vector<bool> m_keyOverrideMask;
    std::vector<bool> m_mouseButtonOverrides;
    std::vector<bool> m_mouseButtonOverrideMask;
    bool m_mousePositionOverrideEnabled{false};
    double m_mouseOverrideX{0.0};
    double m_mouseOverrideY{0.0};
    double m_mouseScrollDeltaX{0.0};
    double m_mouseScrollDeltaY{0.0};
};

ScenarioRunner& scenario();

} // namespace engine::debug
