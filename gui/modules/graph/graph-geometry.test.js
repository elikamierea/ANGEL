import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGraphGeometry } from './graph-geometry.js';

// Build a geometry instance over a shared, mutable nodes array (mirrors how
// app.js wires it: one stable array reference passed by deps).
function makeGeometry(nodes) {
  return createGraphGeometry({ state: { zoom: 1 }, nodes, RESIZE_HANDLE_SIZE_PX: 8 });
}

function rect(id, x, y, w, h) {
  return { id, name: id, x, y, w, h, parentId: null };
}

// Snapshot the parentId assignment as a plain map for comparison.
function parentMap(nodes) {
  const m = {};
  for (const n of nodes) m[n.id] = n.parentId || null;
  return m;
}

// The core invariant of the incremental pass: after applying geometry changes
// and calling recomputeContainmentForNodes(changed), every node's parentId must
// equal what a full recomputeAllContainmentFromGeometry() would produce from the
// same final geometry.
function assertMatchesFullRecompute(nodes, geo, changed) {
  geo.recomputeContainmentForNodes(changed);
  const incremental = parentMap(nodes);
  geo.recomputeAllContainmentFromGeometry();
  const full = parentMap(nodes);
  assert.deepEqual(incremental, full);
}

test('incremental create inside a container matches full recompute', () => {
  const nodes = [
    rect('outer', 0, 0, 100, 100),
    rect('inner', 10, 10, 30, 30),
  ];
  const geo = makeGeometry(nodes);
  geo.recomputeAllContainmentFromGeometry(); // baseline

  const created = rect('leaf', 12, 12, 10, 10); // lands inside inner
  nodes.push(created);
  assertMatchesFullRecompute(nodes, geo, [created]);
  assert.equal(created.parentId, 'inner');
});

test('incremental move out of a container reparents to null', () => {
  const nodes = [
    rect('box', 0, 0, 100, 100),
    rect('child', 10, 10, 20, 20),
  ];
  const geo = makeGeometry(nodes);
  geo.recomputeAllContainmentFromGeometry();
  assert.equal(nodes[1].parentId, 'box');

  const child = nodes[1];
  child.x = 500; child.y = 500; // move far away
  assertMatchesFullRecompute(nodes, geo, [child]);
  assert.equal(child.parentId, null);
});

test('incremental move of a container drags membership correctly', () => {
  const nodes = [
    rect('A', 0, 0, 100, 100),
    rect('B', 300, 0, 100, 100),
    rect('leaf', 320, 20, 20, 20), // starts inside B
  ];
  const geo = makeGeometry(nodes);
  geo.recomputeAllContainmentFromGeometry();
  assert.equal(nodes[2].parentId, 'B');

  // Move A so it now wraps leaf (leaf did not move).
  const A = nodes[0];
  A.x = 300; A.y = 0; A.w = 50; A.h = 50; // A now: 300..350 x 0..50, contains leaf, smaller than B
  assertMatchesFullRecompute(nodes, geo, [A]);
});

test('recomputeContainmentForNodes: pasting a nested cluster at once', () => {
  // Mirrors the paste path: several new nodes (a sub-container plus its own
  // child) are pushed together and handed to the incremental recompute.
  const nodes = [rect('canvas', 0, 0, 200, 200)];
  const geo = makeGeometry(nodes);
  geo.recomputeAllContainmentFromGeometry();

  const mid = rect('mid', 20, 20, 80, 80);   // inside canvas
  const leaf = rect('leaf', 30, 30, 20, 20); // inside mid (a pasted-vs-pasted nesting)
  nodes.push(mid, leaf);
  assertMatchesFullRecompute(nodes, geo, [mid, leaf]);
  assert.equal(mid.parentId, 'canvas');
  assert.equal(leaf.parentId, 'mid');
});

test('recomputeContainmentForNodes: repositioning a subset (auto-layout shape)', () => {
  // Mirrors auto-layout: a subset is moved AND resized in one pass; the rest of
  // the graph is untouched.
  const nodes = [
    rect('frame', 0, 0, 300, 300),
    rect('a', 10, 10, 40, 40),
    rect('b', 60, 60, 40, 40),
    rect('outsider', 400, 400, 50, 50),
  ];
  const geo = makeGeometry(nodes);
  geo.recomputeAllContainmentFromGeometry();

  const a = nodes[1];
  const b = nodes[2];
  a.x = 20; a.y = 20; a.w = 200; a.h = 200; // a grows to wrap b
  b.x = 40; b.y = 40; b.w = 30; b.h = 30;   // b now sits inside a
  assertMatchesFullRecompute(nodes, geo, [a, b]);
  assert.equal(b.parentId, 'a');
});

test('findSpatialConflictForNodes: empty subset and disjoint graph return null', () => {
  const nodes = [rect('a', 0, 0, 10, 10), rect('b', 20, 20, 10, 10)];
  const geo = makeGeometry(nodes);
  assert.equal(geo.findSpatialConflictForNodes([]), null);
  assert.equal(geo.findSpatialConflictForNodes(nodes), null);
});

test('findSpatialConflictForNodes: containment is not a conflict', () => {
  const nodes = [rect('outer', 0, 0, 100, 100), rect('inner', 10, 10, 10, 10)];
  const geo = makeGeometry(nodes);
  assert.equal(geo.findSpatialConflictForNodes([nodes[1]]), null);
});

test('findSpatialConflictForNodes: detects a partial overlap involving the subset', () => {
  const nodes = [rect('a', 0, 0, 10, 10), rect('b', 5, 5, 10, 10)]; // partial overlap
  const geo = makeGeometry(nodes);
  const c = geo.findSpatialConflictForNodes([nodes[0]]);
  assert.ok(c);
  assert.equal(c.a.id, 'a');
  assert.equal(geo.areSpatiallyCompatible(c.a, c.b), false);
});

test('randomized: findSpatialConflictForNodes matches a brute-force subset scan', () => {
  let seed = 987654;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ri = (n) => Math.floor(rnd() * n);

  for (let iter = 0; iter < 300; iter++) {
    const n = 4 + ri(8);
    const nodes = [];
    for (let i = 0; i < n; i++) nodes.push(rect(`n${i}`, ri(60), ri(60), 5 + ri(40), 5 + ri(40)));
    const geo = makeGeometry(nodes);

    const subset = nodes.filter(() => rnd() < 0.4);
    const result = geo.findSpatialConflictForNodes(subset);

    // Brute force: a conflict exists iff some subset node is incompatible with
    // any other node.
    let expected = null;
    for (const a of subset) {
      for (const b of nodes) {
        if (a.id === b.id) continue;
        if (!geo.areSpatiallyCompatible(a, b)) { expected = { a, b }; break; }
      }
      if (expected) break;
    }

    assert.equal(result === null, expected === null, `presence mismatch iter ${iter}`);
    if (result) {
      assert.ok(subset.includes(result.a), 'reported a must be in subset');
      assert.equal(geo.areSpatiallyCompatible(result.a, result.b), false, 'reported pair must be incompatible');
    }
  }
});

test('randomized: incremental always matches full recompute', () => {
  // Deterministic PRNG so failures reproduce.
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const ri = (n) => Math.floor(rnd() * n);

  for (let iter = 0; iter < 300; iter++) {
    const n = 6 + ri(10);
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const w = 10 + ri(120);
      const h = 10 + ri(120);
      nodes.push(rect(`n${i}`, ri(200), ri(200), w, h));
    }
    const geo = makeGeometry(nodes);
    geo.recomputeAllContainmentFromGeometry(); // consistent baseline

    // Mutate a random subset (move and/or resize), then compare.
    const k = 1 + ri(3);
    const changed = [];
    const picked = new Set();
    for (let j = 0; j < k; j++) {
      const idx = ri(nodes.length);
      if (picked.has(idx)) continue;
      picked.add(idx);
      const node = nodes[idx];
      node.x = ri(200);
      node.y = ri(200);
      if (rnd() < 0.5) { node.w = 10 + ri(120); node.h = 10 + ri(120); }
      changed.push(node);
    }

    geo.recomputeContainmentForNodes(changed);
    const incremental = parentMap(nodes);
    geo.recomputeAllContainmentFromGeometry();
    const full = parentMap(nodes);
    assert.deepEqual(incremental, full, `mismatch at iter ${iter}`);
  }
});
