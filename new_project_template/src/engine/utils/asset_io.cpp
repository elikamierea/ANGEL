#include "engine/utils/asset_io.hpp"

#include "engine/debug/debug_tools.hpp"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <string_view>
#include <unordered_map>

namespace engine::utils {
namespace {

struct PakEntry {
    std::uint64_t offset{0};
    std::uint64_t size{0};
};

struct AssetState {
    std::filesystem::path root{"."};
    std::filesystem::path pakPath;
    bool pakMounted{false};
    std::unordered_map<std::string, PakEntry> pakIndex;
};

AssetState g_state;
std::mutex g_mutex;

constexpr std::uint32_t kPakMagic = 0x314B4150; // "PAK1"
constexpr std::uint32_t kPakVersion = 1;

std::string normalize_slashes(std::string s) {
    std::replace(s.begin(), s.end(), '\\', '/');
    return s;
}

bool is_valid_logical_path(const std::string& path) {
    if (path.empty()) {
        return false;
    }
    if (path.rfind("assets/", 0) != 0) {
        return false;
    }
    if (path.find("..") != std::string::npos) {
        return false;
    }
    if (path.find(":") != std::string::npos) {
        return false;
    }
    return true;
}

std::string normalize_logical_path(const std::string& logicalPath) {
    auto p = normalize_slashes(logicalPath);
    while (!p.empty() && p.front() == '/') {
        p.erase(p.begin());
    }
    return p;
}

template <typename T>
bool read_pod(std::ifstream& in, T& out) {
    in.read(reinterpret_cast<char*>(&out), sizeof(T));
    return static_cast<bool>(in);
}

bool mount_pak_locked(const std::filesystem::path& pakPath) {
    g_state.pakIndex.clear();
    g_state.pakMounted = false;

    std::ifstream in(pakPath, std::ios::binary);
    if (!in) {
        engine::debug::log_warning("asset_io: pak not found: " + pakPath.string());
        return false;
    }

    std::uint32_t magic = 0;
    std::uint32_t version = 0;
    std::uint32_t fileCount = 0;

    if (!read_pod(in, magic) || !read_pod(in, version) || !read_pod(in, fileCount)) {
        engine::debug::log_error("asset_io: failed reading pak header: " + pakPath.string());
        return false;
    }

    if (magic != kPakMagic || version != kPakVersion) {
        engine::debug::log_error("asset_io: invalid pak format: " + pakPath.string());
        return false;
    }

    for (std::uint32_t i = 0; i < fileCount; ++i) {
        std::uint32_t pathLen = 0;
        if (!read_pod(in, pathLen) || pathLen == 0 || pathLen > 4096) {
            engine::debug::log_error("asset_io: invalid pak entry path length");
            return false;
        }

        std::string path(pathLen, '\0');
        in.read(path.data(), static_cast<std::streamsize>(pathLen));
        if (!in) {
            engine::debug::log_error("asset_io: failed reading pak entry path");
            return false;
        }

        PakEntry entry{};
        if (!read_pod(in, entry.offset) || !read_pod(in, entry.size)) {
            engine::debug::log_error("asset_io: failed reading pak entry");
            return false;
        }

        path = normalize_logical_path(path);
        g_state.pakIndex[path] = entry;
    }

    g_state.pakMounted = true;
    g_state.pakPath = pakPath;
    engine::debug::log_info("asset_io: mounted pak with " + std::to_string(g_state.pakIndex.size()) + " entries");
    return true;
}

bool try_read_from_pak_locked(const std::string& logicalPath, std::vector<std::uint8_t>& out) {
    if (!g_state.pakMounted) {
        return false;
    }

    auto it = g_state.pakIndex.find(logicalPath);
    if (it == g_state.pakIndex.end()) {
        return false;
    }

    std::ifstream in(g_state.pakPath, std::ios::binary);
    if (!in) {
        engine::debug::log_error("asset_io: failed opening mounted pak: " + g_state.pakPath.string());
        return false;
    }

    const auto& entry = it->second;
    out.resize(static_cast<std::size_t>(entry.size));
    in.seekg(static_cast<std::streamoff>(entry.offset), std::ios::beg);
    in.read(reinterpret_cast<char*>(out.data()), static_cast<std::streamsize>(entry.size));
    if (!in) {
        out.clear();
        engine::debug::log_error("asset_io: failed reading pak entry: " + logicalPath);
        return false;
    }

    return true;
}

bool try_read_from_disk_locked(const std::string& logicalPath, std::vector<std::uint8_t>& out) {
    const auto fullPath = (g_state.root / std::filesystem::path(logicalPath)).lexically_normal();
    std::ifstream in(fullPath, std::ios::binary);
    if (!in) {
        return false;
    }

    in.seekg(0, std::ios::end);
    const auto size = in.tellg();
    in.seekg(0, std::ios::beg);
    if (size < 0) {
        return false;
    }

    out.resize(static_cast<std::size_t>(size));
    in.read(reinterpret_cast<char*>(out.data()), size);
    if (!in) {
        out.clear();
        return false;
    }

    return true;
}

} // namespace

bool asset_exists(const std::string& logicalPath) {
    std::vector<std::uint8_t> tmp;
    return asset_read_binary(logicalPath, tmp);
}

bool asset_read_binary(const std::string& logicalPath, std::vector<std::uint8_t>& out) {
    out.clear();

    const auto normalized = normalize_logical_path(logicalPath);
    if (!is_valid_logical_path(normalized)) {
        engine::debug::log_warning("asset_io: invalid logical path: " + logicalPath);
        return false;
    }

    std::scoped_lock lock(g_mutex);

    if (try_read_from_pak_locked(normalized, out)) {
        return true;
    }

    if (try_read_from_disk_locked(normalized, out)) {
        return true;
    }

    engine::debug::log_warning("asset_io: missing asset: " + normalized +
                               " (pakMounted=" + std::string(g_state.pakMounted ? "true" : "false") +
                               ", root=" + g_state.root.string() + ")");
    return false;
}

bool asset_read_text(const std::string& logicalPath, std::string& out) {
    out.clear();

    std::vector<std::uint8_t> bytes;
    if (!asset_read_binary(logicalPath, bytes)) {
        return false;
    }

    out.assign(reinterpret_cast<const char*>(bytes.data()), bytes.size());
    return true;
}

void asset_set_root(const std::string& path) {
    std::scoped_lock lock(g_mutex);
    g_state.root = std::filesystem::path(path);
    engine::debug::log_info("asset_io: root set to " + g_state.root.string());
}

void asset_set_pak_path(const std::string& path) {
    std::scoped_lock lock(g_mutex);
    if (path.empty()) {
        g_state.pakMounted = false;
        g_state.pakPath.clear();
        g_state.pakIndex.clear();
        engine::debug::log_info("asset_io: pak unmounted");
        return;
    }

    (void)mount_pak_locked(std::filesystem::path(path));
}

} // namespace engine::utils
