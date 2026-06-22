#pragma once

#include <cstdint>
#include <string>

namespace platform {
class Window;
}

namespace engine::general {

enum class CursorMode {
    Normal,
    Hidden,
    Disabled,
};

enum class StandardCursor {
    Arrow,
    IBeam,
    Crosshair,
    Hand,
    HResize,
    VResize,
};

void request_game_quit();
bool is_game_running();

void set_target_fps(int fps);
int get_target_fps();

void set_vsync_enabled(bool enabled);
bool is_vsync_enabled();

void set_turbo_enabled(bool enabled);
bool is_turbo_enabled();

void set_record_enabled(bool enabled);
bool is_record_enabled();

void initialize_random_seed();
void set_random_seed(std::uint32_t seed);
std::uint32_t random_seed();

bool key_down(int keycode);
bool key_pressed(int keycode);
bool key_released(int keycode);

bool mouse_down(int button);
bool mouse_pressed(int button);
bool mouse_released(int button);

double mouse_x();
double mouse_y();
void mouse_position(double& outX, double& outY);
double mouse_scroll_x();
double mouse_scroll_y();
void mouse_scroll(double& outScrollX, double& outScrollY);

double delta_time();

int window_width();
int window_height();
void window_size(int& outWidth, int& outHeight);
int framebuffer_width();
int framebuffer_height();
void framebuffer_size(int& outWidth, int& outHeight);

void set_window_position(int x, int y);
void set_window_size(int width, int height);
void set_window_rect(int x, int y, int width, int height);

void set_cursor_mode(CursorMode mode);
CursorMode cursor_mode();
bool set_standard_cursor(StandardCursor cursor);
void clear_cursor();

class Engine {
public:
    explicit Engine(platform::Window& window);
    bool initialize(const std::string& testName = "", const std::string& scenarioPath = "");
    void run();
    void shutdown();

private:
    platform::Window& m_window;
    bool m_initialized{false};
};

} // namespace engine::general
