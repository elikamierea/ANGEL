#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace engine::utils {

bool asset_exists(const std::string& logicalPath);
bool asset_read_binary(const std::string& logicalPath, std::vector<std::uint8_t>& out);
bool asset_read_text(const std::string& logicalPath, std::string& out);

void asset_set_root(const std::string& path);
void asset_set_pak_path(const std::string& path);

} // namespace engine::utils
