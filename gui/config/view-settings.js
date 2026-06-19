/**
 * Centralized GUI view/runtime settings.
 *
 * LOD rules are based on node screen area (px^2):
 * - hidden:      area < lod_simplified_min_area_px2
 * - simplified:  area < lod_name_min_area_px2
 * - name:        area < lod_detail_min_area_px2
 * - detail:      otherwise
 */
export const VIEW_SETTINGS = Object.freeze({
  // Minimum visible occupied screen area for a node.
  // Updated per product decision: 4 px^2.
  lod_simplified_min_area_px2: 4,

  // LOD transitions.
  lod_name_min_area_px2: 2048,
  lod_detail_min_area_px2: 16384,

  // Rendering.
  node_font_px: 12,

  // Node palette (index 0-15): fill + border.
  // index 0 keeps the current default style, 1-15 are hue-shifted variants.
  node_fill_palette_hex: [
    '#1d2734', '#242930', '#222634', '#2a272f', '#2c222e', '#2e2628',
    '#322824', '#302c26', '#323022', '#2c3026', '#243224', '#26302c',
    '#223034', '#262a30', '#242832', '#282a2e',
  ],
  node_stroke_palette_hex: [
    '#4b5b72', '#5a626e', '#5c6076', '#64606e', '#705a6a', '#6e5e62',
    '#7a645e', '#766860', '#787258', '#686e60', '#5c7862', '#606e68',
    '#5c7078', '#626872', '#606274', '#686a6e',
  ],

  // Auto-pan while dragging.
  auto_pan_edge_px: 128,
  auto_pan_max_speed_px_per_sec: 1040,
});
