export function createCanvasRendererPrimitives(deps) {
  const {
    state,
    ctx,
    viewSettings,
    graphPalette,
    RESIZE_HANDLE_SIZE_PX,
    worldToScreen,
    getAnchorWorld,
    getEdgePolylineWorld,
    getEdgeStrokeDash,
    getAnchorDirection,
    getNodeResizeHandles,
    normalizeColorIndex,
    palettePick,
    mixHexColors,
    clamp01,
    cssVar,
    getNodeLayerContent,
  } = deps;

  function getNodeScreenAreaPx2(node) {
    return (node.w * state.zoom) * (node.h * state.zoom);
  }

  function getNodeLodLevel(node) {
    const area = getNodeScreenAreaPx2(node);
    if (area < viewSettings.lod_simplified_min_area_px2) return 'hidden';
    if (area < viewSettings.lod_name_min_area_px2) return 'simplified';
    if (area < viewSettings.lod_detail_min_area_px2) return 'name';
    return 'detail';
  }

  function drawAdaptiveGrid() {
    const zoom = Math.max(0.0001, Number(state.zoom) || 1);
    const minSpacingPx = 56;
    const maxSpacingPx = 192;
    let spacingWorld = 32;

    while (spacingWorld * zoom < minSpacingPx) spacingWorld *= 2;
    while (spacingWorld * zoom > maxSpacingPx && spacingWorld > 0.25) spacingWorld /= 2;

    const canvasWidth = Math.max(1, ctx.canvas?.clientWidth || ctx.canvas?.width || 1);
    const canvasHeight = Math.max(1, ctx.canvas?.clientHeight || ctx.canvas?.height || 1);
    const gridColor = palettePick(graphPalette.grid, 0, '#5f6b7a');

    const baseAlpha = clamp01(Number(cssVar('--graph-grid-opacity', '0.08')) || 0.08);
    const minAlphaFactor = 0.7;

    const drawGridAtSpacing = (worldSpacing, alphaScale) => {
      if (worldSpacing <= 0 || alphaScale <= 0) return;

      const minWorldX = (-state.panX) / zoom;
      const maxWorldX = (canvasWidth - state.panX) / zoom;
      const minWorldY = (-state.panY) / zoom;
      const maxWorldY = (canvasHeight - state.panY) / zoom;

      const startX = Math.floor(minWorldX / worldSpacing) * worldSpacing;
      const endX = Math.ceil(maxWorldX / worldSpacing) * worldSpacing;
      const startY = Math.floor(minWorldY / worldSpacing) * worldSpacing;
      const endY = Math.ceil(maxWorldY / worldSpacing) * worldSpacing;

      for (let x = startX; x <= endX + worldSpacing * 0.5; x += worldSpacing) {
        const sx = x * zoom + state.panX;
        const nx = Math.abs((sx / canvasWidth) - 0.5) * 2;
        const alphaFactor = minAlphaFactor + (1 - nx) * (1 - minAlphaFactor);
        ctx.globalAlpha = clamp01(baseAlpha * alphaScale * alphaFactor);
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, canvasHeight);
        ctx.stroke();
      }

      for (let y = startY; y <= endY + worldSpacing * 0.5; y += worldSpacing) {
        const sy = y * zoom + state.panY;
        const ny = Math.abs((sy / canvasHeight) - 0.5) * 2;
        const alphaFactor = minAlphaFactor + (1 - ny) * (1 - minAlphaFactor);
        ctx.globalAlpha = clamp01(baseAlpha * alphaScale * alphaFactor);
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(canvasWidth, sy);
        ctx.stroke();
      }
    };

    const spacingPx = spacingWorld * zoom;

    // Cross-fade around LOD switches to avoid hard pop-in/pop-out of finer grid levels.
    const fadeInFiner = clamp01((spacingPx - maxSpacingPx * 0.72) / (maxSpacingPx * 0.28));
    const fadeInCoarser = clamp01(((minSpacingPx * 1.28) - spacingPx) / (minSpacingPx * 0.28));

    const primaryAlphaScale = 1 - Math.max(fadeInFiner, fadeInCoarser) * 0.35;

    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1.5;

    drawGridAtSpacing(spacingWorld, primaryAlphaScale);
    drawGridAtSpacing(spacingWorld / 2, 0.55 * fadeInFiner);
    drawGridAtSpacing(spacingWorld * 2, 0.55 * fadeInCoarser);

    ctx.restore();
  }

  function drawArrowHead(point, direction, color) {
    const len = Math.hypot(direction.x, direction.y);
    if (len < 0.0001) return;
    const ux = direction.x / len;
    const uy = direction.y / len;
    const size = 10.5;
    const spread = 5.25;

    const bx = point.x - ux * size;
    const by = point.y - uy * size;
    const px = -uy;
    const py = ux;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(bx + px * spread, by + py * spread);
    ctx.lineTo(bx - px * spread, by - py * spread);
    ctx.closePath();
    ctx.fill();
  }

  function getNodeStrokeColor(node) {
    const colorIndex = normalizeColorIndex(node?.colorIndex);
    return palettePick(graphPalette.nodeStroke, colorIndex, '#4b5b72');
  }

  function drawEdge(a, b, edge) {
    const fromW = getAnchorWorld(a, edge.fromAnchor);
    const toW = getAnchorWorld(b, edge.toAnchor);
    const from = worldToScreen(fromW.x, fromW.y);
    const to = worldToScreen(toW.x, toW.y);

    const selected = state.selectedEdgeId === edge.id;
    // Tint each edge with the mean of its two endpoint nodes' border colors so
    // the connection visually inherits from both ends without per-frame gradient
    // allocation. Selected edges keep the dedicated highlight color.
    const strokeColor = selected
      ? palettePick(graphPalette.edgeSelected, 0, '#8dc8ff')
      : mixHexColors(getNodeStrokeColor(a), getNodeStrokeColor(b), 0.5, clamp01);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = selected ? 3 : 2;

    const dash = getEdgeStrokeDash(edge.strokeStyle || 'solid');
    ctx.setLineDash(dash);

    const pathStyle = edge.pathStyle || 'straight';
    let startDir = { x: to.x - from.x, y: to.y - from.y };
    let endDir = { x: to.x - from.x, y: to.y - from.y };

    ctx.beginPath();

    if (pathStyle === 'curve') {
      const fromDir = getAnchorDirection(edge.fromAnchor?.side || 'right');
      const toDir = getAnchorDirection(edge.toAnchor?.side || 'left');
      const span = Math.hypot(toW.x - fromW.x, toW.y - fromW.y);
      const cpOffsetWorld = Math.max(24 / state.zoom, span * 0.35);
      const cp1W = { x: fromW.x + fromDir.x * cpOffsetWorld, y: fromW.y + fromDir.y * cpOffsetWorld };
      const cp2W = { x: toW.x + toDir.x * cpOffsetWorld, y: toW.y + toDir.y * cpOffsetWorld };
      const cp1 = worldToScreen(cp1W.x, cp1W.y);
      const cp2 = worldToScreen(cp2W.x, cp2W.y);

      ctx.moveTo(from.x, from.y);
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y);

      startDir = { x: cp1.x - from.x, y: cp1.y - from.y };
      endDir = { x: to.x - cp2.x, y: to.y - cp2.y };
    } else {
      const ptsWorld = getEdgePolylineWorld(edge, fromW, toW, edge.fromAnchor, edge.toAnchor);
      const pts = ptsWorld.map((p) => worldToScreen(p.x, p.y));
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);

      if (pts.length >= 2) {
        startDir = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
        endDir = { x: pts[pts.length - 1].x - pts[pts.length - 2].x, y: pts[pts.length - 1].y - pts[pts.length - 2].y };
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const r = 2.5;
    ctx.fillStyle = strokeColor;
    if (!edge.arrowFrom) {
      ctx.beginPath();
      ctx.arc(from.x, from.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!edge.arrowTo) {
      ctx.beginPath();
      ctx.arc(to.x, to.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (edge.arrowTo) drawArrowHead(to, endDir, strokeColor);
    if (edge.arrowFrom) drawArrowHead(from, { x: -startDir.x, y: -startDir.y }, strokeColor);
  }

  function getLargeNodeFadeAlpha(node) {
    const area = getNodeScreenAreaPx2(node);
    const startArea = 960 * 540;
    const endArea = 1920 * 1080;
    const minAlpha = 0.25;

    if (area <= startArea) return 1;
    if (area >= endArea) return minAlpha;

    const t = (area - startArea) / (endArea - startArea);
    return 1 - (1 - minAlpha) * t;
  }

  function drawNode(node) {
    const lod = getNodeLodLevel(node);
    if (lod === 'hidden') return;

    const p = worldToScreen(node.x, node.y);
    const w = node.w * state.zoom;
    const h = node.h * state.zoom;
    const selected = state.selectedNodeIds.has(node.id);

    const colorIndex = normalizeColorIndex(node.colorIndex);
    const paletteFill = palettePick(graphPalette.nodeFill, colorIndex, '#1d2734');
    const paletteStroke = palettePick(graphPalette.nodeStroke, colorIndex, '#4b5b72');

    const baseFill = selected
      ? mixHexColors(palettePick(graphPalette.nodeFillSelected, 0, '#2f5d95'), paletteFill, 0.45, clamp01)
      : paletteFill;
    const baseStroke = selected
      ? mixHexColors(palettePick(graphPalette.nodeStrokeSelected, 0, '#8cc2ff'), paletteStroke, 0.55, clamp01)
      : paletteStroke;

    const depth = Math.max(0, Number(node.depth) || 0);
    const k = Math.pow(0.9, depth);
    const mixedFill = mixHexColors(baseFill, baseStroke, k, clamp01);

    const previewSelected = Boolean(state.transformSession) && selected;
    const largeNodeAlpha = getLargeNodeFadeAlpha(node);
    const baseOpacity = clamp01(Number(cssVar('--graph-node-base-opacity', '1')) || 1);
    const previewAlpha = previewSelected ? 0.6 : 1;
    const nodeAlpha = clamp01(baseOpacity * largeNodeAlpha * previewAlpha);

    ctx.save();
    ctx.globalAlpha = nodeAlpha;

    ctx.fillStyle = mixedFill;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.fillRect(p.x, p.y, w, h);

    // Keep node body opacity effect, but do not fade node text with theme opacity.
    ctx.globalAlpha = 1;

    if (lod === 'name' || lod === 'detail') {
      ctx.fillStyle = palettePick(graphPalette.nodeText, 0, '#e8eef7');
      ctx.font = `${viewSettings.node_font_px + 1}px ${cssVar('--app-font-family', 'Arial, sans-serif')}`;
      ctx.fillText(node.name, p.x + 10, p.y + 18);
    }

    if (lod === 'detail') {
      ctx.fillStyle = palettePick(graphPalette.nodeText, 0, '#e8eef7');
      ctx.font = `${Math.max(10, viewSettings.node_font_px - 1)}px ${cssVar('--app-font-family', 'Arial, sans-serif')}`;
      const layerContent = getNodeLayerContent ? getNodeLayerContent(node) : null;
      const progress = (layerContent?.progress || node.progress || node.synopsis || node.summary || '').trim();
      if (progress) {
        const maxW = Math.max(0, w - 20);
        const words = progress.split(/\s+/).filter(Boolean);
        let line = '';
        let y = p.y + 38;
        let lines = 0;
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width <= maxW) {
            line = test;
            continue;
          }
          if (line) {
            ctx.fillText(line, p.x + 10, y);
            y += 14;
            lines += 1;
            if (lines >= 2) break;
          }
          line = word;
        }
        if (lines < 2 && line) ctx.fillText(line, p.x + 10, y);
      }
    }

    ctx.globalAlpha = 1;
    ctx.strokeStyle = baseStroke;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeRect(p.x, p.y, w, h);

    if (selected && !state.transformSession) {
      const half = RESIZE_HANDLE_SIZE_PX / 2;
      ctx.fillStyle = cssVar('--graph-handle-fill', '#d8ecff');
      ctx.strokeStyle = cssVar('--graph-handle-stroke', '#2e6fa7');
      ctx.lineWidth = 1;
      for (const hnd of getNodeResizeHandles(node)) {
        const sp = worldToScreen(hnd.x, hnd.y);
        ctx.fillRect(sp.x - half, sp.y - half, RESIZE_HANDLE_SIZE_PX, RESIZE_HANDLE_SIZE_PX);
        ctx.strokeRect(sp.x - half, sp.y - half, RESIZE_HANDLE_SIZE_PX, RESIZE_HANDLE_SIZE_PX);
      }
    }

    ctx.restore();
  }

  return {
    getNodeScreenAreaPx2,
    getNodeLodLevel,
    getNodeStrokeColor,
    drawAdaptiveGrid,
    drawEdge,
    drawNode,
  };
}
