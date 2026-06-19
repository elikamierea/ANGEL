#pragma once

#include <string>

struct GLFWwindow;
struct GLFWcursor;

namespace platform {

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

class Window {
public:
    Window(int width, int height, std::string title);
    ~Window();

    bool initialize();
    void shutdown();

    void poll_events();
    void swap_buffers();
    bool should_close() const;
    void request_close();

    void set_vsync_enabled(bool enabled);
    bool is_vsync_enabled() const { return m_vsyncEnabled; }
    int current_refresh_rate() const;

    void set_cursor_mode(CursorMode mode);
    CursorMode cursor_mode() const { return m_cursorMode; }
    bool set_standard_cursor(StandardCursor cursor);
    void clear_cursor();

    bool is_key_down(int keycode) const;
    bool is_mouse_down(int button) const;

    double mouse_x() const;
    double mouse_y() const;
    void mouse_position(double& outX, double& outY) const;
    double mouse_scroll_x() const;
    double mouse_scroll_y() const;
    void mouse_scroll(double& outScrollX, double& outScrollY) const;
    void clear_mouse_scroll();

    void window_size(int& outWidth, int& outHeight) const;
    int window_width() const;
    int window_height() const;

    void set_window_position(int x, int y);
    void set_window_size(int width, int height);
    void set_window_rect(int x, int y, int width, int height);

    GLFWwindow* native_handle() const { return m_handle; }

    void framebuffer_size(int& outWidth, int& outHeight) const;

private:
    static void framebuffer_callback(GLFWwindow* window, int width, int height);
    static void scroll_callback(GLFWwindow* window, double xoffset, double yoffset);
    void update_framebuffer(int width, int height);
    void accumulate_scroll(double xoffset, double yoffset);

private:
    GLFWwindow* m_handle{nullptr};
    int m_width{0};
    int m_height{0};
    int m_framebufferWidth{0};
    int m_framebufferHeight{0};
    double m_scrollX{0.0};
    double m_scrollY{0.0};
    std::string m_title;
    bool m_vsyncEnabled{true};
    CursorMode m_cursorMode{CursorMode::Normal};
    GLFWcursor* m_standardCursorHandle{nullptr};
};

} // namespace platform
