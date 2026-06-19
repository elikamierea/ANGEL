#include "platform/window.hpp"

#include "engine/debug/debug_tools.hpp"

#ifndef GLFW_INCLUDE_NONE
#define GLFW_INCLUDE_NONE
#endif
#include <GLFW/glfw3.h>

namespace platform {
namespace {
int g_glfwRefCount = 0;

int to_glfw_cursor_mode(CursorMode mode) {
    switch (mode) {
    case CursorMode::Normal:
        return GLFW_CURSOR_NORMAL;
    case CursorMode::Hidden:
        return GLFW_CURSOR_HIDDEN;
    case CursorMode::Disabled:
        return GLFW_CURSOR_DISABLED;
    }
    return GLFW_CURSOR_NORMAL;
}

int to_glfw_standard_cursor(StandardCursor cursor) {
    switch (cursor) {
    case StandardCursor::Arrow:
        return GLFW_ARROW_CURSOR;
    case StandardCursor::IBeam:
        return GLFW_IBEAM_CURSOR;
    case StandardCursor::Crosshair:
        return GLFW_CROSSHAIR_CURSOR;
    case StandardCursor::Hand:
        return GLFW_HAND_CURSOR;
    case StandardCursor::HResize:
        return GLFW_HRESIZE_CURSOR;
    case StandardCursor::VResize:
        return GLFW_VRESIZE_CURSOR;
    }
    return GLFW_ARROW_CURSOR;
}
}

Window::Window(int width, int height, std::string title)
    : m_width(width), m_height(height), m_title(std::move(title)) {}

Window::~Window() {
    shutdown();
}

bool Window::initialize() {
    if (m_handle != nullptr) {
        return true;
    }

    if (g_glfwRefCount == 0) {
        if (!glfwInit()) {
            engine::debug::log_error("Failed to initialize GLFW");
            return false;
        }
    }
    ++g_glfwRefCount;

    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);

    m_handle = glfwCreateWindow(m_width, m_height, m_title.c_str(), nullptr, nullptr);
    if (!m_handle) {
        engine::debug::log_error("Failed to create GLFW window");
        shutdown();
        return false;
    }

    glfwMakeContextCurrent(m_handle);
    set_vsync_enabled(true);
    glfwSetWindowUserPointer(m_handle, this);
    glfwSetFramebufferSizeCallback(m_handle, framebuffer_callback);
    glfwSetScrollCallback(m_handle, scroll_callback);
    glfwGetFramebufferSize(m_handle, &m_framebufferWidth, &m_framebufferHeight);
    set_cursor_mode(CursorMode::Normal);

    engine::debug::log_info("Window initialized: " + m_title);
    return true;
}

void Window::shutdown() {
    if (m_handle != nullptr) {
        clear_cursor();
        glfwDestroyWindow(m_handle);
        m_handle = nullptr;
    }

    if (g_glfwRefCount > 0) {
        --g_glfwRefCount;
        if (g_glfwRefCount == 0) {
            glfwTerminate();
        }
    }
}

void Window::poll_events() {
    clear_mouse_scroll();
    glfwPollEvents();
}

bool Window::is_key_down(int keycode) const {
    if (m_handle == nullptr) {
        return false;
    }

    const int state = glfwGetKey(m_handle, keycode);
    return state == GLFW_PRESS || state == GLFW_REPEAT;
}

bool Window::is_mouse_down(int button) const {
    if (m_handle == nullptr) {
        return false;
    }

    const int state = glfwGetMouseButton(m_handle, button);
    return state == GLFW_PRESS;
}

double Window::mouse_x() const {
    double x = 0.0;
    double y = 0.0;
    mouse_position(x, y);
    return x;
}

double Window::mouse_y() const {
    double x = 0.0;
    double y = 0.0;
    mouse_position(x, y);
    return y;
}

void Window::mouse_position(double& outX, double& outY) const {
    if (m_handle == nullptr) {
        outX = 0.0;
        outY = 0.0;
        return;
    }

    glfwGetCursorPos(m_handle, &outX, &outY);
}

double Window::mouse_scroll_x() const {
    return m_scrollX;
}

double Window::mouse_scroll_y() const {
    return m_scrollY;
}

void Window::mouse_scroll(double& outScrollX, double& outScrollY) const {
    outScrollX = m_scrollX;
    outScrollY = m_scrollY;
}

void Window::clear_mouse_scroll() {
    m_scrollX = 0.0;
    m_scrollY = 0.0;
}

void Window::window_size(int& outWidth, int& outHeight) const {
    if (m_handle == nullptr) {
        outWidth = 0;
        outHeight = 0;
        return;
    }

    glfwGetWindowSize(m_handle, &outWidth, &outHeight);
}

int Window::window_width() const {
    int w = 0;
    int h = 0;
    window_size(w, h);
    return w;
}

int Window::window_height() const {
    int w = 0;
    int h = 0;
    window_size(w, h);
    return h;
}

void Window::set_window_position(int x, int y) {
    if (m_handle != nullptr) {
        glfwSetWindowPos(m_handle, x, y);
    }
}

void Window::set_window_size(int width, int height) {
    if (m_handle != nullptr) {
        glfwSetWindowSize(m_handle, width, height);
    }
}

void Window::set_window_rect(int x, int y, int width, int height) {
    set_window_position(x, y);
    set_window_size(width, height);
}

void Window::swap_buffers() {
    if (m_handle != nullptr) {
        glfwSwapBuffers(m_handle);
    }
}

bool Window::should_close() const {
    return m_handle == nullptr ? true : glfwWindowShouldClose(m_handle) == GLFW_TRUE;
}

void Window::request_close() {
    if (m_handle != nullptr) {
        glfwSetWindowShouldClose(m_handle, GLFW_TRUE);
    }
}

void Window::set_vsync_enabled(bool enabled) {
    m_vsyncEnabled = enabled;
    if (m_handle != nullptr) {
        glfwMakeContextCurrent(m_handle);
        glfwSwapInterval(enabled ? 1 : 0);
    }
}

int Window::current_refresh_rate() const {
    GLFWmonitor* monitor = nullptr;
    if (m_handle != nullptr) {
        monitor = glfwGetWindowMonitor(m_handle);
    }
    if (monitor == nullptr) {
        monitor = glfwGetPrimaryMonitor();
    }
    if (monitor == nullptr) {
        return 0;
    }

    const GLFWvidmode* mode = glfwGetVideoMode(monitor);
    if (mode == nullptr) {
        return 0;
    }

    return mode->refreshRate;
}

void Window::set_cursor_mode(CursorMode mode) {
    m_cursorMode = mode;
    if (m_handle != nullptr) {
        glfwSetInputMode(m_handle, GLFW_CURSOR, to_glfw_cursor_mode(mode));
    }
}

bool Window::set_standard_cursor(StandardCursor cursor) {
    if (m_handle == nullptr) {
        return false;
    }

    GLFWcursor* newCursor = glfwCreateStandardCursor(to_glfw_standard_cursor(cursor));
    if (newCursor == nullptr) {
        return false;
    }

    if (m_standardCursorHandle != nullptr) {
        glfwDestroyCursor(m_standardCursorHandle);
    }

    m_standardCursorHandle = newCursor;
    glfwSetCursor(m_handle, m_standardCursorHandle);
    return true;
}

void Window::clear_cursor() {
    if (m_handle != nullptr) {
        glfwSetCursor(m_handle, nullptr);
    }

    if (m_standardCursorHandle != nullptr) {
        glfwDestroyCursor(m_standardCursorHandle);
        m_standardCursorHandle = nullptr;
    }
}

void Window::framebuffer_size(int& outWidth, int& outHeight) const {
    outWidth = m_framebufferWidth;
    outHeight = m_framebufferHeight;
}

void Window::framebuffer_callback(GLFWwindow* window, int width, int height) {
    if (auto* self = static_cast<Window*>(glfwGetWindowUserPointer(window))) {
        self->update_framebuffer(width, height);
    }
}

void Window::scroll_callback(GLFWwindow* window, double xoffset, double yoffset) {
    if (auto* self = static_cast<Window*>(glfwGetWindowUserPointer(window))) {
        self->accumulate_scroll(xoffset, yoffset);
    }
}

void Window::update_framebuffer(int width, int height) {
    m_framebufferWidth = width;
    m_framebufferHeight = height;
}

void Window::accumulate_scroll(double xoffset, double yoffset) {
    m_scrollX += xoffset;
    m_scrollY += yoffset;
}

} // namespace platform
