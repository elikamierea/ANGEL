#include "engine/debug/debug_tools.hpp"

#include "engine/draw/gl_loader.hpp"
#include "engine/general/engine_control.hpp"

#include "lodepng.h"

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

namespace engine::debug {
namespace {

bool g_enabled = false;
std::ofstream g_logFile;
std::uint64_t g_autoScreenshotCounter = 0;

std::string level_to_string(LogLevel level) {
    switch (level) {
    case LogLevel::Info:
        return "INFO";
    case LogLevel::Warning:
        return "WARN";
    case LogLevel::Error:
        return "ERROR";
    }
    return "LOG";
}

std::string timestamp() {
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    std::tm tm{};
#if defined(_WIN32)
    localtime_s(&tm, &time);
#else
    localtime_r(&time, &tm);
#endif
    std::ostringstream oss;
    oss << std::put_time(&tm, "%H:%M:%S");
    return oss.str();
}

std::filesystem::path runtime_root() {
    return std::filesystem::current_path();
}

std::filesystem::path resolve_output_path(const std::string& relativePath) {
    return runtime_root() / relativePath;
}

void flip_rgba_rows(std::vector<unsigned char>& pixels, unsigned width, unsigned height) {
    if (width == 0 || height <= 1) {
        return;
    }

    const std::size_t rowBytes = static_cast<std::size_t>(width) * 4u;
    std::vector<unsigned char> scratch(rowBytes);
    for (unsigned y = 0; y < height / 2; ++y) {
        auto* top = pixels.data() + static_cast<std::size_t>(y) * rowBytes;
        auto* bottom = pixels.data() + static_cast<std::size_t>(height - 1 - y) * rowBytes;
        std::copy(top, top + rowBytes, scratch.begin());
        std::copy(bottom, bottom + rowBytes, top);
        std::copy(scratch.begin(), scratch.end(), bottom);
    }
}

std::string make_auto_screenshot_relative_path() {
    std::ostringstream oss;
    oss << "debug/screenshots/auto_" << std::setfill('0') << std::setw(6) << g_autoScreenshotCounter++ << ".png";
    return oss.str();
}

} // namespace

void set_enabled(bool enabled) {
    g_enabled = enabled;

    if (!g_enabled) {
        if (g_logFile.is_open()) {
            g_logFile.close();
        }
        return;
    }

    const auto logPath = std::filesystem::current_path() / "DEBUG_LOG.txt";
    g_logFile.open(logPath, std::ios::out | std::ios::trunc);
}

bool is_enabled() {
    return g_enabled;
}

void log(LogLevel level, const std::string& message) {
    if (!g_enabled || !g_logFile.is_open()) {
        return;
    }

    g_logFile << "[" << timestamp() << "] " << level_to_string(level) << ": " << message << std::endl;
    g_logFile.flush();
}

void log_info(const std::string& message) {
    log(LogLevel::Info, message);
}

void log_warning(const std::string& message) {
    log(LogLevel::Warning, message);
}

void log_error(const std::string& message) {
    log(LogLevel::Error, message);
}

bool capture_screenshot(const std::string& relativePath) {
    if (relativePath.empty()) {
        log_error("capture_screenshot(): relativePath is empty");
        return false;
    }

    const int width = engine::general::framebuffer_width();
    const int height = engine::general::framebuffer_height();
    if (width <= 0 || height <= 0) {
        log_error("capture_screenshot(): framebuffer size unavailable");
        return false;
    }

    if (glReadPixels == nullptr) {
        log_error("capture_screenshot(): glReadPixels unavailable");
        return false;
    }

    std::vector<unsigned char> pixels(static_cast<std::size_t>(width) * static_cast<std::size_t>(height) * 4u);
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());
    flip_rgba_rows(pixels, static_cast<unsigned>(width), static_cast<unsigned>(height));

    const auto outputPath = resolve_output_path(relativePath);
    std::error_code ec;
    std::filesystem::create_directories(outputPath.parent_path(), ec);
    if (ec) {
        log_error("capture_screenshot(): failed to create directories for " + outputPath.string());
        return false;
    }

    const unsigned error = lodepng::encode(outputPath.string(), pixels, static_cast<unsigned>(width), static_cast<unsigned>(height));
    if (error != 0) {
        log_error("capture_screenshot(): encode failed for " + outputPath.string() + ": " + lodepng_error_text(error));
        return false;
    }

    log_info("Screenshot saved: " + relativePath + " (" + std::to_string(width) + "x" + std::to_string(height) + ")");
    return true;
}

bool capture_screenshot_auto() {
    return capture_screenshot(make_auto_screenshot_relative_path());
}

} // namespace engine::debug
