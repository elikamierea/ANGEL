#pragma once

#include <string>

namespace engine::debug {

enum class LogLevel {
    Info,
    Warning,
    Error
};

void set_enabled(bool enabled);
bool is_enabled();

void log(LogLevel level, const std::string& message);
void log_info(const std::string& message);
void log_warning(const std::string& message);
void log_error(const std::string& message);

bool capture_screenshot(const std::string& relativePath);
bool capture_screenshot_auto();

} // namespace engine::debug
