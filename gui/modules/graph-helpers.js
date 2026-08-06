// '@' is reserved as the mirror-name separator: a mirror node is named
// `${sourceName}@${localName}` and no other node name may contain '@'.
export const MIRROR_NAME_SEP = '@';

export function createGraphHelpers({ nodes, edges }) {
  function getUnsavedCount() {
    return nodes.filter((n) => n.dirty).length;
  }

  function isNodeNameAvailable(name, ignoreNodeId = null) {
    const target = (name || '').trim();
    if (!target) return false;
    return !nodes.some((n) => n.id !== ignoreNodeId && (n.name || '').trim() === target);
  }

  // Split a mirror name into its source prefix and local segment on the first
  // '@'. Returns null for non-mirror names (no '@').
  function splitMirrorName(name) {
    const s = String(name || '');
    const i = s.indexOf(MIRROR_NAME_SEP);
    if (i < 0) return null;
    return { source: s.slice(0, i), local: s.slice(i + 1) };
  }

  function buildMirrorName(sourceName, localName) {
    return `${String(sourceName || '').trim()}${MIRROR_NAME_SEP}${String(localName || '').trim()}`;
  }

  // The label to use when this node acts as the geometric parent of a new
  // mirror: a plain node contributes its whole name, a mirror contributes only
  // its local segment so derived names never grow a second '@'.
  function localSegmentOf(name) {
    const parts = splitMirrorName(name);
    return parts ? parts.local : String(name || '');
  }

  // Derive the default full name for a new mirror of `sourceName`, given the
  // geometric parent it was dropped into (or null when top-level).
  //   - inside a parent:  Source@Parent, then Source@Parent2, Source@Parent3…
  //   - no parent:        Source@1, Source@2…
  function deriveDefaultMirrorName(sourceName, parentNode) {
    const base = parentNode ? String(localSegmentOf(parentNode.name) || '').trim() : '';
    if (base) {
      const first = buildMirrorName(sourceName, base);
      if (isNodeNameAvailable(first)) return first;
      let i = 2;
      while (true) {
        const candidate = buildMirrorName(sourceName, `${base}${i}`);
        if (isNodeNameAvailable(candidate)) return candidate;
        i += 1;
      }
    }
    let i = 1;
    while (true) {
      const candidate = buildMirrorName(sourceName, String(i));
      if (isNodeNameAvailable(candidate)) return candidate;
      i += 1;
    }
  }

  function isMirrorNode(node) {
    return Boolean(node?.isMirror && node?.mirrorOfId);
  }

  // Mirror content is fully independent from its source and is never synced.
  // This reconciler does two structural things:
  //   1. GC mirrors whose source has been deleted, plus edges that referenced
  //      the removed mirror. (Deleting a source that still has mirrors is
  //      normally intercepted upstream; this is the defensive fallback for
  //      older/hand-edited projects.)
  //   2. Cascade source renames: a mirror's '@'-prefix always tracks its
  //      current source name, whatever entry point renamed the source.
  function syncMirrorNodes() {
    let changed = false;
    const byId = new Map(nodes.map((n) => [n.id, n]));

    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (!isMirrorNode(n)) continue;
      if (byId.has(n.mirrorOfId)) continue;

      const removedId = n.id;
      nodes.splice(i, 1);
      byId.delete(removedId);
      if (Array.isArray(edges)) {
        for (let j = edges.length - 1; j >= 0; j--) {
          if (edges[j].from === removedId || edges[j].to === removedId) edges.splice(j, 1);
        }
      }
      changed = true;
    }

    for (const n of nodes) {
      if (!isMirrorNode(n)) continue;
      const src = byId.get(n.mirrorOfId);
      if (!src) continue;
      const parts = splitMirrorName(n.name);
      if (!parts) continue;
      const expected = buildMirrorName(src.name, parts.local);
      if (n.name !== expected) {
        n.name = expected;
        n.dirty = true;
        changed = true;
      }
    }

    return changed;
  }

  return {
    getUnsavedCount,
    isNodeNameAvailable,
    splitMirrorName,
    buildMirrorName,
    localSegmentOf,
    deriveDefaultMirrorName,
    isMirrorNode,
    syncMirrorNodes,
  };
}
