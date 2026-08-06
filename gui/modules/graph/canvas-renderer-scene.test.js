import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasRendererScene } from './canvas-renderer-scene.js';

// Build a scene renderer over stub deps that record which nodes/edges get drawn,
// so we can assert viewport culling behaviour without a real canvas.
function makeScene({ nodes, edges = [], zoom = 1, panX = 0, panY = 0, w = 800, h = 600 }) {
  const drawnNodeIds = [];
  const drawnEdgeIds = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const scene = createCanvasRendererScene({
    state: { zoom, panX, panY },
    canvas: { clientWidth: w, clientHeight: h },
    nodes,
    edges,
    // Depth is irrelevant to culling; return a trivial map and set no meta.
    refreshHierarchyMeta: () => new Map(nodes.map((n) => [n.id, 0])),
    isNodeVisibleInActiveLayer: () => true,
    isEdgeVisibleInActiveLayer: () => true,
    getNodeLodLevel: () => 'detail',
    drawAdaptiveGrid: () => {},
    drawNode: (n) => drawnNodeIds.push(n.id),
    drawEdge: (a, b, edge) => drawnEdgeIds.push(edge.id),
    getNodeById: (id) => byId.get(id) || null,
  });

  scene.renderGraphSceneItems();
  return { drawnNodeIds, drawnEdgeIds };
}

const node = (id, x, y, w, h, parentId = null) => ({ id, name: id, x, y, w, h, parentId });

test('culls nodes fully outside the viewport, keeps on-screen ones', () => {
  // Viewport in world coords at zoom 1, pan 0 is roughly [0..800] x [0..600]
  // (plus a 64px margin).
  const nodes = [
    node('onscreen', 100, 100, 50, 50),
    node('far', 5000, 5000, 50, 50),      // way off-screen
    node('edge-left', -200, 100, 50, 50), // outside even with margin
  ];
  const { drawnNodeIds } = makeScene({ nodes });
  assert.deepEqual(drawnNodeIds.sort(), ['onscreen']);
});

test('keeps a container that fully encloses the viewport', () => {
  const nodes = [
    node('huge', -1000, -1000, 5000, 5000), // viewport sits inside it
    node('inside', 200, 200, 40, 40),
  ];
  const { drawnNodeIds } = makeScene({ nodes });
  assert.deepEqual(drawnNodeIds.sort(), ['huge', 'inside']);
});

test('draws a partially visible node straddling the viewport edge', () => {
  const nodes = [node('straddle', 780, 100, 100, 50)]; // right edge crosses x=800
  const { drawnNodeIds } = makeScene({ nodes });
  assert.deepEqual(drawnNodeIds, ['straddle']);
});

test('respects pan/zoom when computing the viewport', () => {
  // Pan so that world origin moves; a node near world (2000,2000) becomes visible.
  const nodes = [
    node('shifted', 2000, 2000, 50, 50),
    node('origin', 0, 0, 50, 50),
  ];
  // zoom 1, pan so that world 2000 maps to screen ~0.
  const { drawnNodeIds } = makeScene({ nodes, panX: -1990, panY: -1990 });
  assert.ok(drawnNodeIds.includes('shifted'));
  assert.ok(!drawnNodeIds.includes('origin'));
});

test('culls an edge whose endpoints are both off-screen on the same side', () => {
  const nodes = [
    node('a', 3000, 3000, 40, 40),
    node('b', 3200, 3000, 40, 40),
  ];
  const edges = [{ id: 'e1', from: 'a', to: 'b' }];
  const { drawnEdgeIds } = makeScene({ nodes, edges });
  assert.deepEqual(drawnEdgeIds, []);
});

test('keeps an edge crossing the viewport even if both endpoints are off-screen', () => {
  const nodes = [
    node('left', -500, 300, 40, 40),  // off-screen left
    node('right', 1200, 300, 40, 40), // off-screen right
  ];
  const edges = [{ id: 'e1', from: 'left', to: 'right' }]; // segment spans the screen
  const { drawnEdgeIds } = makeScene({ nodes, edges });
  assert.deepEqual(drawnEdgeIds, ['e1']);
});

test('keeps an edge with one endpoint on-screen', () => {
  const nodes = [
    node('a', 100, 100, 40, 40),      // on-screen
    node('b', 5000, 5000, 40, 40),    // off-screen
  ];
  const edges = [{ id: 'e1', from: 'a', to: 'b' }];
  const { drawnEdgeIds } = makeScene({ nodes, edges });
  assert.deepEqual(drawnEdgeIds, ['e1']);
});
