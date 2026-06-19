export function createEdgeRenderHelpers(deps) {
  const { state } = deps;

  function getAnchorWorld(node, anchor) {
    if (!anchor || !anchor.side) {
      return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
    }

    const t = clamp01(anchor.t ?? 0.5);
    switch (anchor.side) {
      case 'left': return { x: node.x, y: node.y + node.h * t };
      case 'right': return { x: node.x + node.w, y: node.y + node.h * t };
      case 'top': return { x: node.x + node.w * t, y: node.y };
      case 'bottom': return { x: node.x + node.w * t, y: node.y + node.h };
      default: return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
    }
  }

  function projectToNodeEdge(node, worldX, worldY) {
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    const dx = worldX - cx;
    const dy = worldY - cy;

    if (Math.abs(dx) * node.h > Math.abs(dy) * node.w) {
      const side = dx >= 0 ? 'right' : 'left';
      const t = clamp01((worldY - node.y) / node.h);
      return { side, t };
    }
    const side = dy >= 0 ? 'bottom' : 'top';
    const t = clamp01((worldX - node.x) / node.w);
    return { side, t };
  }

  function projectToNodeEdgeByRay(node, targetX, targetY) {
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    const dx = targetX - cx;
    const dy = targetY - cy;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { side: 'right', t: 0.5 };

    const wx = Math.abs(dx) / Math.max(node.w / 2, 1e-6);
    const wy = Math.abs(dy) / Math.max(node.h / 2, 1e-6);
    const s = 1 / Math.max(wx, wy, 1e-6);
    const px = cx + dx * s;
    const py = cy + dy * s;
    return projectToNodeEdge(node, px, py);
  }

  function getEdgeStrokeDash(strokeStyle) {
    if (strokeStyle === 'dashed') return [10, 6];
    if (strokeStyle === 'dotted') return [2, 6];
    return [];
  }

  function bezierPoint(t, p0, p1, p2, p3) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;
    return {
      x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
      y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
    };
  }

  function getAnchorDirection(side) {
    if (side === 'left') return { x: -1, y: 0 };
    if (side === 'right') return { x: 1, y: 0 };
    if (side === 'top') return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  }

  function getEdgePolylineWorld(edge, from, to, fromAnchor, toAnchor) {
    const pathStyle = edge.pathStyle || 'straight';

    const fromDir = getAnchorDirection(fromAnchor?.side || 'right');
    const toDir = getAnchorDirection(toAnchor?.side || 'left');

    if (pathStyle === 'orthogonal') {
      const stub = Math.max(16 / state.zoom, 0);
      const p1 = { x: from.x + fromDir.x * stub, y: from.y + fromDir.y * stub };
      const p2 = { x: to.x + toDir.x * stub, y: to.y + toDir.y * stub };

      const horizontalFirst = Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y);
      const bend = horizontalFirst
        ? { x: p2.x, y: p1.y }
        : { x: p1.x, y: p2.y };

      return [from, p1, bend, p2, to];
    }

    if (pathStyle === 'curve') {
      const span = Math.hypot(to.x - from.x, to.y - from.y);
      const cpOffset = Math.max(24 / state.zoom, span * 0.35);
      const cp1 = { x: from.x + fromDir.x * cpOffset, y: from.y + fromDir.y * cpOffset };
      const cp2 = { x: to.x + toDir.x * cpOffset, y: to.y + toDir.y * cpOffset };
      const pts = [];
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        pts.push(bezierPoint(i / steps, from, cp1, cp2, to));
      }
      return pts;
    }

    return [from, to];
  }

  return {
    getAnchorWorld,
    projectToNodeEdge,
    projectToNodeEdgeByRay,
    getEdgeStrokeDash,
    bezierPoint,
    getAnchorDirection,
    getEdgePolylineWorld,
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
