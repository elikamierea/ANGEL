// Fast id -> node lookup backing the render/visibility hot paths.
//
// The graph `nodes` array is mutated in place from many scattered sites
// (create/paste/delete, mirror sync, project load, undo/redo), so instead of
// hooking every mutation we rebuild the index once per render frame. At our
// scale (typ. ~100, max ~5000 nodes) an O(N) rebuild is sub-millisecond and
// always correct, while turning the per-edge `nodes.find` scans from O(E*N)
// into O(E). A length-based check also keeps ad-hoc lookups between frames
// fresh for the common push/splice cases.
export function createNodeIndex({ nodes }) {
  const map = new Map();
  let lastLength = -1;

  function rebuild() {
    map.clear();
    for (const node of nodes) map.set(node.id, node);
    lastLength = nodes.length;
  }

  function getNodeById(id) {
    // Cheap staleness guard for callers outside the per-frame rebuild.
    if (nodes.length !== lastLength) rebuild();
    return map.get(id);
  }

  return { rebuild, getNodeById };
}
