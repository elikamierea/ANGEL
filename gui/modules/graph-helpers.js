export function createGraphHelpers({ nodes }) {
  function getUnsavedCount() {
    return nodes.filter((n) => n.dirty).length;
  }

  function isNodeNameAvailable(name, ignoreNodeId = null) {
    const target = (name || '').trim();
    if (!target) return false;
    return !nodes.some((n) => n.id !== ignoreNodeId && (n.name || '').trim() === target);
  }

  function nextAvailableMirrorName(sourceName) {
    const base = `${(sourceName || 'Node').trim()}_Mirror`;
    let i = 0;
    while (true) {
      const candidate = `${base}${i}`;
      if (isNodeNameAvailable(candidate)) return candidate;
      i += 1;
    }
  }

  function isMirrorNode(node) {
    return Boolean(node?.isMirror && node?.mirrorOfId);
  }

  function syncMirrorNodes() {
    let changed = false;
    const byId = new Map(nodes.map((n) => [n.id, n]));

    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (!isMirrorNode(n)) continue;
      if (!byId.has(n.mirrorOfId)) {
        nodes.splice(i, 1);
        changed = true;
      }
    }

    const byId2 = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      if (!isMirrorNode(n)) continue;
      const src = byId2.get(n.mirrorOfId);
      if (!src) continue;
      if ((n.progress || '') !== (src.progress || '')) {
        n.progress = src.progress || '';
        changed = true;
      }
    }

    return changed;
  }

  return {
    getUnsavedCount,
    isNodeNameAvailable,
    nextAvailableMirrorName,
    isMirrorNode,
    syncMirrorNodes,
  };
}
