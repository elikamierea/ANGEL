import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGraphLocalHelpers } from './graph-local-helpers.js';

function makeHelpers(nodes) {
  return createGraphLocalHelpers({
    state: { selectedNodeIds: new Set() },
    nodes,
    edges: [],
    normalizeSelectedNodeIds: () => {},
    projectToNodeEdge: () => ({}),
    projectToNodeEdgeByRay: () => ({}),
  });
}

test('refreshHierarchyMeta childCount matches a brute-force per-node count', () => {
  const nodes = [
    { id: 'a', parentId: null },
    { id: 'b', parentId: 'a' },
    { id: 'c', parentId: 'a' },
    { id: 'd', parentId: 'b' },
    { id: 'e', parentId: null },
  ];
  const helpers = makeHelpers(nodes);
  helpers.refreshHierarchyMeta();

  const expected = {};
  for (const n of nodes) expected[n.id] = nodes.filter((x) => x.parentId === n.id).length;
  const actual = {};
  for (const n of nodes) actual[n.id] = n.childCount;

  assert.deepEqual(actual, expected);
  assert.equal(actual.a, 2);
  assert.equal(actual.b, 1);
  assert.equal(actual.e, 0);
});

test('refreshHierarchyMeta assigns depth from the parent chain', () => {
  const nodes = [
    { id: 'root', parentId: null },
    { id: 'mid', parentId: 'root' },
    { id: 'leaf', parentId: 'mid' },
  ];
  const helpers = makeHelpers(nodes);
  const depthMap = helpers.refreshHierarchyMeta();

  assert.equal(depthMap.get('root'), 0);
  assert.equal(depthMap.get('mid'), 1);
  assert.equal(depthMap.get('leaf'), 2);
  assert.equal(nodes[2].depth, 2);
});

test('refreshHierarchyMeta: dangling parentId does not inflate any childCount', () => {
  const nodes = [
    { id: 'a', parentId: null },
    { id: 'b', parentId: 'ghost' }, // parent does not exist
  ];
  const helpers = makeHelpers(nodes);
  helpers.refreshHierarchyMeta();
  assert.equal(nodes[0].childCount, 0);
  assert.equal(nodes[1].childCount, 0);
});
