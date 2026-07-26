export function createAssetGeneration(deps) {
  const {
    document,
    URL,
    Image,
    FontFace,
    spriteBuildState,
    fontBuildState,
    spritePathInput,
    spriteNameInput,
    spritePivotXInput,
    spritePivotYInput,
    fontPathInput,
    fontNameInput,
    fontSourceSystemRadio,
    fontSourceFileRadio,
    fontSourceSystemRow,
    fontSourceFileRow,
    fontSystemSelect,
    fontSizeInput,
    fontHintingInput,
    fontAntialiasInput,
    fontCharsetInput,
    fontPreviewInput,
    fontPreviewScaleInput,
    fontPreviewCanvas,
    audioFileInput,
    audioPathInput,
    audioNameInput,
    audioFormatInput,
    audioBitrateInput,
    audioSampleRateInput,
    audioBitDepthInput,
    runCommandByParams,
    renderSpritePreview,
    cssVar,
    normalizeToolRelativePath,
    writeBinaryFileByRelativePath,
    deleteFileByRelativePath,
    toolWriteByParams,
    refreshProjectFileTree,
  } = deps;

  async function loadSpriteFramesFromInput(fileList) {
    const files = Array.from(fileList || []);
    const frames = [];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      try {
        const image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Invalid image: ${file.name}`));
          img.src = url;
        });
        frames.push({ fileName: file.name, image, width: image.naturalWidth, height: image.naturalHeight });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    spriteBuildState.frames = frames;
    spriteBuildState.frameIndex = 0;
    renderSpritePreview();
  }

  async function buildSpriteAtlasAndMetadataFromFrames(frames, options = {}) {
    if (!Array.isArray(frames) || frames.length === 0) throw new Error('Please select at least one image frame.');

    const rawPath = String(options.path || '').trim();
    const name = String(options.name || '').trim();
    if (!rawPath) throw new Error('Path is required.');
    const path = rawPath.replace(/^\/+/, '').replace(/\\/g, '/');
    const srcPath = path.toLowerCase().startsWith('src/') ? path : `src/${path}`;
    if (!name) throw new Error('Name is required.');

    const pivotX = Math.trunc(Number(options.pivotX || 0));
    const pivotY = Math.trunc(Number(options.pivotY || 0));
    if (!Number.isFinite(pivotX) || !Number.isFinite(pivotY)) {
      throw new Error('Pivot must be finite numbers.');
    }

    // The engine slices the atlas as a single horizontal row with a uniform frame size
    // (texture_group.cpp upload_sprite: frameOffsetX = frameIndex * frameWidth, frameOffsetY
    // is constant). So every frame must share the same dimensions, and frames are laid out
    // left-to-right — NOT stacked vertically.
    const frameWidth = Math.max(1, Math.trunc(Number(frames[0]?.width || 1)));
    const frameHeight = Math.max(1, Math.trunc(Number(frames[0]?.height || 1)));
    for (let i = 0; i < frames.length; i += 1) {
      const fw = Math.trunc(Number(frames[i]?.width || 0));
      const fh = Math.trunc(Number(frames[i]?.height || 0));
      if (fw !== frameWidth || fh !== frameHeight) {
        throw new Error(
          `All sprite frames must share the same size. Frame ${i + 1} is ${fw}×${fh}, ` +
          `but the first frame is ${frameWidth}×${frameHeight}. Resize the frames to match.`,
        );
      }
    }

    const atlasWidth = frameWidth * frames.length;
    const atlasHeight = frameHeight;
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = atlasWidth;
    atlasCanvas.height = atlasHeight;
    const atlasCtx = atlasCanvas.getContext('2d');
    atlasCtx.clearRect(0, 0, atlasWidth, atlasHeight);

    let x = 0;
    for (const frame of frames) {
      atlasCtx.drawImage(frame.image, x, 0, frameWidth, frameHeight);
      x += frameWidth;
    }

    const pngBlob = await new Promise((resolve) => atlasCanvas.toBlob(resolve, 'image/png'));
    if (!pngBlob) throw new Error('Failed to encode atlas PNG.');

    const normalizedPath = normalizeToolRelativePath(srcPath);
    const pngRelPath = `${normalizedPath}/${name}.png`;
    const txtRelPath = `${normalizedPath}/${name}.txt`;
    const metadataText = `${pivotX} ${pivotY} ${frames.length} ${frameWidth} ${frameHeight}`;

    await writeBinaryFileByRelativePath(pngRelPath, pngBlob);
    await toolWriteByParams({ path: txtRelPath, content: metadataText });
    await refreshProjectFileTree(false);

    return { pngRelPath, txtRelPath, frameCount: frames.length };
  }

  async function createSpriteAtlasAndMetadata() {
    const frames = spriteBuildState.frames;
    const rawPath = String(spritePathInput?.value || '').trim();
    const name = String(spriteNameInput?.value || '').trim();
    const pivotX = Math.trunc(Number(spritePivotXInput?.value || 0));
    const pivotY = Math.trunc(Number(spritePivotYInput?.value || 0));
    if (spritePathInput) {
      const path = rawPath.replace(/^\/+/, '').replace(/\\/g, '/');
      spritePathInput.value = path.toLowerCase().startsWith('src/') ? path : `src/${path}`;
    }
    return buildSpriteAtlasAndMetadataFromFrames(frames, { path: rawPath, name, pivotX, pivotY });
  }

  function uniqueCharsFromText(text) {
    const ordered = [];
    const seen = new Set();
    for (const ch of String(text || '')) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      ordered.push(ch);
    }
    return ordered;
  }

  function toUnicodeCodepointLiteral(ch) {
    const cp = ch.codePointAt(0) || 0;
    const hex = cp.toString(16).toUpperCase().padStart(4, '0');
    return `U+${hex}`;
  }

  function applyAlphaThresholdToCanvas(ctx, width, height, threshold = 128) {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a >= threshold) {
        data[i + 3] = 255;
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function refreshFontPreview() {
    if (!fontPreviewCanvas) return;
    const text = String(fontPreviewInput?.value || '');
    const size = Math.max(4, Math.trunc(Number(fontSizeInput?.value || 32)));
    const aa = String(fontAntialiasInput?.value || 'on');
    const hinting = String(fontHintingInput?.value || 'normal');
    const previewScale = Math.max(1, Math.trunc(Number(fontPreviewScaleInput?.value || 1)));
    if (fontPreviewScaleInput) fontPreviewScaleInput.value = String(previewScale);

    const lines = (text || '(empty preview)').split(/\r?\n/);
    const fontFamily = fontBuildState.fontFamily ? `'${fontBuildState.fontFamily}', sans-serif` : 'sans-serif';
    const padding = 8;
    const fontKerning = hinting === 'none' ? 'none' : 'normal';

    // Measure ascent/descent using alphabetic baseline — same approach as the export —
    // so the preview baseline position matches where glyphs actually sit in the atlas.
    const metricCanvas = document.createElement('canvas');
    metricCanvas.width = 16;
    metricCanvas.height = 16;
    const metricCtx = metricCanvas.getContext('2d');
    metricCtx.font = `${size}px ${fontFamily}`;
    metricCtx.textBaseline = 'alphabetic';
    metricCtx.fontKerning = fontKerning;
    let maxAscent = 0;
    let maxDescent = 0;
    for (const line of lines) {
      if (!line) continue;
      const m = metricCtx.measureText(line);
      maxAscent = Math.max(maxAscent, Math.ceil(m.actualBoundingBoxAscent || size * 0.8));
      maxDescent = Math.max(maxDescent, Math.ceil(m.actualBoundingBoxDescent || size * 0.25));
    }
    maxAscent = Math.max(1, maxAscent);
    maxDescent = Math.max(1, maxDescent);
    // Match export's lineHeight = Math.max(size, maxAscent + maxDescent)
    const lineH = Math.max(size, maxAscent + maxDescent);

    const baseCanvas = document.createElement('canvas');
    const baseCtx = baseCanvas.getContext('2d');
    if (!baseCtx) return;

    baseCtx.font = `${size}px ${fontFamily}`;
    baseCtx.textBaseline = 'alphabetic';
    baseCtx.fontKerning = fontKerning;

    let maxLineWidth = 0;
    for (const line of lines) {
      const w = Math.ceil(baseCtx.measureText(line).width);
      if (w > maxLineWidth) maxLineWidth = w;
    }

    const baseW = Math.max(1, maxLineWidth + padding * 2);
    const baseH = Math.max(1, lines.length * lineH + padding * 2);
    baseCanvas.width = baseW;
    baseCanvas.height = baseH;

    baseCtx.clearRect(0, 0, baseW, baseH);
    if (aa !== 'off') {
      baseCtx.fillStyle = cssVar('--font-preview-bg', '#0f151f');
      baseCtx.fillRect(0, 0, baseW, baseH);
    }
    baseCtx.font = `${size}px ${fontFamily}`;
    baseCtx.textBaseline = 'alphabetic';
    baseCtx.fontKerning = fontKerning;
    baseCtx.fillStyle = cssVar('--font-preview-text', '#e8eef7');

    for (let i = 0; i < lines.length; i += 1) {
      // Baseline at padding + i*lineH + maxAscent, mirroring padY+maxAscent in the export.
      baseCtx.fillText(lines[i], padding, padding + i * lineH + maxAscent);
    }
    if (aa === 'off') {
      applyAlphaThresholdToCanvas(baseCtx, baseW, baseH, 200);
    }

    const outCtx = fontPreviewCanvas.getContext('2d');
    if (!outCtx) return;
    const outW = baseW * previewScale;
    const outH = baseH * previewScale;
    if (fontPreviewCanvas.width !== outW) fontPreviewCanvas.width = outW;
    if (fontPreviewCanvas.height !== outH) fontPreviewCanvas.height = outH;
    fontPreviewCanvas.style.width = `${outW}px`;
    fontPreviewCanvas.style.height = `${outH}px`;

    outCtx.clearRect(0, 0, outW, outH);
    outCtx.fillStyle = cssVar('--font-preview-bg', '#0f151f');
    outCtx.fillRect(0, 0, outW, outH);
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(baseCanvas, 0, 0, outW, outH);
  }

  async function loadSelectedFontFile(file) {
    if (!file) {
      fontBuildState.fontFile = null;
      fontBuildState.fontFamily = null;
      if (fontBuildState.fontUrl) URL.revokeObjectURL(fontBuildState.fontUrl);
      fontBuildState.fontUrl = null;
      fontBuildState.sourceKind = null;
      refreshFontPreview();
      return;
    }

    if (fontBuildState.fontUrl) URL.revokeObjectURL(fontBuildState.fontUrl);
    fontBuildState.fontFile = file;
    fontBuildState.fontUrl = URL.createObjectURL(file);
    fontBuildState.fontFamily = `ANGEL_Font_${Date.now()}`;
    fontBuildState.sourceKind = 'file';

    const face = new FontFace(fontBuildState.fontFamily, `url(${fontBuildState.fontUrl})`);
    await face.load();
    document.fonts.add(face);
    refreshFontPreview();
  }

  async function listSystemFonts() {
    const queryLocalFonts = globalThis?.queryLocalFonts;
    if (typeof queryLocalFonts !== 'function') return [];

    const fonts = await queryLocalFonts();
    const seen = new Set();
    const normalized = [];
    for (const entry of Array.isArray(fonts) ? fonts : []) {
      const family = String(entry?.family || '').trim();
      if (!family) continue;
      const key = family.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({
        family,
        fullName: String(entry?.fullName || family).trim() || family,
        postscriptName: String(entry?.postscriptName || '').trim(),
      });
    }
    normalized.sort((a, b) => a.family.localeCompare(b.family));
    return normalized;
  }

  function populateSystemFontOptions(fonts) {
    if (!fontSystemSelect) return 0;
    const previous = String(fontSystemSelect.value || '');
    fontSystemSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a system font…';
    fontSystemSelect.appendChild(placeholder);

    for (const font of Array.isArray(fonts) ? fonts : []) {
      const option = document.createElement('option');
      option.value = font.family;
      option.textContent = font.fullName && font.fullName !== font.family
        ? `${font.family} — ${font.fullName}`
        : font.family;
      fontSystemSelect.appendChild(option);
    }

    if (previous && Array.from(fontSystemSelect.options).some((opt) => opt.value === previous)) {
      fontSystemSelect.value = previous;
    }
    return Array.isArray(fonts) ? fonts.length : 0;
  }

  async function refreshSystemFontOptions() {
    const fonts = await listSystemFonts();
    populateSystemFontOptions(fonts);
    if (!String(fontSystemSelect?.value || '').trim() && Array.isArray(fonts) && fonts[0]?.family) {
      fontSystemSelect.value = fonts[0].family;
    }
    return fonts;
  }

  async function useSystemFontFamily(fontFamily) {
    const family = String(fontFamily || '').trim();
    if (!family) throw new Error('Please choose a system font first.');

    if (fontBuildState.fontUrl) URL.revokeObjectURL(fontBuildState.fontUrl);
    fontBuildState.fontUrl = null;
    fontBuildState.fontFile = null;
    fontBuildState.fontFamily = family;
    fontBuildState.sourceKind = 'system';
    refreshFontPreview();
  }

  async function setFontSourceMode(mode) {
    const nextMode = String(mode || '').trim() === 'system' ? 'system' : 'file';
    if (fontSourceSystemRadio) fontSourceSystemRadio.checked = nextMode === 'system';
    if (fontSourceFileRadio) fontSourceFileRadio.checked = nextMode === 'file';
    if (fontSourceSystemRow) fontSourceSystemRow.classList.toggle('hidden', nextMode !== 'system');
    if (fontSourceFileRow) fontSourceFileRow.classList.toggle('hidden', nextMode !== 'file');

    if (nextMode === 'system') {
      const fonts = await refreshSystemFontOptions();
      const selected = String(fontSystemSelect?.value || '').trim() || String(fonts?.[0]?.family || '').trim();
      if (selected) await useSystemFontFamily(selected);
      return fonts;
    }

    if (fontBuildState.sourceKind === 'system') {
      fontBuildState.fontFamily = null;
      refreshFontPreview();
    }
    return [];
  }

  async function appendCharsetFromFiles(fileList) {
    const files = Array.from(fileList || []);
    const scanned = [];
    for (const file of files) {
      const text = await file.text();
      scanned.push(text);
    }
    const current = String(fontCharsetInput?.value || '');
    const merged = uniqueCharsFromText(current + scanned.join(''));
    if (fontCharsetInput) fontCharsetInput.value = merged.join('');
  }

  async function createAudioAsset() {
    const sourceFile = audioFileInput?.files?.[0] || null;
    if (!sourceFile) throw new Error('Please select an audio file first.');

    const rawPath = String(audioPathInput?.value || '').trim();
    const rawName = String(audioNameInput?.value || '').trim();
    const format = String(audioFormatInput?.value || 'wav').trim().toLowerCase();
    if (!rawPath) throw new Error('Path is required.');
    if (!rawName) throw new Error('Name is required.');
    if (format !== 'wav' && format !== 'ogg') throw new Error('Unsupported output format.');

    const path = rawPath.replace(/^\/+/, '').replace(/\\/g, '/');
    const srcPath = path.toLowerCase().startsWith('src/') ? path : `src/${path}`;
    if (audioPathInput) audioPathInput.value = srcPath;

    const safeName = rawName.replace(/\.(wav|ogg)$/i, '').trim();
    if (!safeName) throw new Error('Name is required.');
    if (audioNameInput) audioNameInput.value = safeName;

    const normalizedPath = normalizeToolRelativePath(srcPath);
    const outputRelPath = `${normalizedPath}/${safeName}.${format}`;
    const tempInputRelPath = `${normalizedPath}/.${safeName}.source${Date.now()}${guessExtensionFromFileName(sourceFile.name)}`;

    await writeBinaryFileByRelativePath(tempInputRelPath, sourceFile);

    const ffmpegArgs = ['-y', '-i', quoteForCmd(tempInputRelPath)];
    const sampleRate = String(audioSampleRateInput?.value || '').trim();
    if (sampleRate) ffmpegArgs.push('-ar', quoteForCmd(sampleRate));

    if (format === 'wav') {
      const bitDepth = String(audioBitDepthInput?.value || '16').trim();
      const codecByBitDepth = {
        '16': 'pcm_s16le',
        '24': 'pcm_s24le',
        '32': 'pcm_f32le',
      };
      const codec = codecByBitDepth[bitDepth];
      if (!codec) throw new Error('Unsupported WAV bit depth.');
      ffmpegArgs.push('-c:a', quoteForCmd(codec));
    } else if (format === 'ogg') {
      const bitrate = String(audioBitrateInput?.value || '128').trim();
      if (!bitrate) throw new Error('Bitrate is required for ogg.');
      ffmpegArgs.push('-c:a', 'libvorbis', '-b:a', quoteForCmd(`${bitrate}k`));
    }

    ffmpegArgs.push(quoteForCmd(outputRelPath));
    const command = `ffmpeg ${ffmpegArgs.join(' ')}`;

    try {
      const result = await runCommandByParams({ command, timeoutSeconds: 180 });
      if (!result?.ok) {
        throw new Error(String(result?.stderr || result?.stdout || 'ffmpeg conversion failed'));
      }
    } finally {
      try {
        await deleteFileByRelativePath(tempInputRelPath);
      } catch (_) {}
    }

    await refreshProjectFileTree(false);
    return {
      path: outputRelPath,
      format,
      sampleRate: sampleRate || null,
      bitDepth: format === 'wav' ? String(audioBitDepthInput?.value || '16').trim() : null,
      bitrate: format === 'ogg' ? String(audioBitrateInput?.value || '128').trim() : null,
    };
  }

  function guessExtensionFromFileName(name) {
    const match = String(name || '').match(/(\.[A-Za-z0-9_-]+)$/);
    return match ? match[1] : '.bin';
  }

  function quoteForCmd(value) {
    return `"${String(value || '').replace(/"/g, '""')}"`;
  }

  async function createBitmapFontAssets() {
    if (!fontBuildState.fontFamily) throw new Error('Please select a font source first.');

    const rawPath = String(fontPathInput?.value || '').trim();
    const name = String(fontNameInput?.value || '').trim();
    if (!rawPath) throw new Error('Path is required.');
    if (!name) throw new Error('Name is required.');

    const size = Math.max(4, Math.trunc(Number(fontSizeInput?.value || 32)));
    const hinting = String(fontHintingInput?.value || 'normal');
    const antialias = String(fontAntialiasInput?.value || 'on');
    const chars = uniqueCharsFromText(String(fontCharsetInput?.value || ''));
    if (chars.length === 0) throw new Error('Charset is empty.');

    const path = rawPath.replace(/^\/+/, '').replace(/\\/g, '/');
    const srcPath = path.toLowerCase().startsWith('src/') ? path : `src/${path}`;
    if (fontPathInput) fontPathInput.value = srcPath;

    const normalizedPath = normalizeToolRelativePath(srcPath);

    const maxPageWidth = 2048;
    const maxPageHeight = 2048;
    // Base transparent margin around every glyph.
    const basePad = Math.max(1, Math.round(size * 0.125));
    const padY = basePad;

    // Render each glyph to a private scan canvas and read actual ink pixel bounds.
    // measureText's bounding box can disagree with real rendered pixels (AA fringe,
    // hinting, canvas-size-dependent rasterisation paths), which would cause glyph ink
    // to bleed across atlas cell boundaries. We scan with the same alpha threshold that
    // applyAlphaThresholdToCanvas will use on the final atlas so the bounds reflect
    // exactly the set of pixels that will survive into the output.
    const scanFontStr = `${size}px '${fontBuildState.fontFamily}'`;
    const scanFontKerning = hinting === 'none' ? 'none' : 'normal';
    // Give the pen enough margin inside the scan canvas to catch any overhang.
    const scanPenX = Math.max(Math.ceil(size), 16);
    const scanPenY = Math.max(Math.ceil(size * 1.5), 24);
    const scanW = scanPenX + Math.max(Math.ceil(size * 2.5), 48);
    const scanH = scanPenY + Math.max(Math.ceil(size), 16);
    const scanCanvas = document.createElement('canvas');
    scanCanvas.width = scanW;
    scanCanvas.height = scanH;
    const scanCtx = scanCanvas.getContext('2d');
    scanCtx.font = scanFontStr;
    scanCtx.textBaseline = 'alphabetic';
    scanCtx.fontKerning = scanFontKerning;
    scanCtx.fillStyle = '#FFFFFF';
    // AA=off: raise to 200 so Chromium's grayscale-AA "bridge" pixels between
    // thin strokes (alpha ~120-160) are discarded; only solid-core pixels (200+) survive.
    // AA=on: 1 captures the full ink extent for bounds measurement (no binarisation applied).
    const scanThreshold = antialias === 'off' ? 200 : 1;

    const metricsList = chars.map((ch) => {
      scanCtx.clearRect(0, 0, scanW, scanH);
      scanCtx.fillText(ch, scanPenX, scanPenY);
      const m = scanCtx.measureText(ch);
      const advance = Math.max(0, Math.ceil(m.width || 0));

      const imageData = scanCtx.getImageData(0, 0, scanW, scanH);
      const data = imageData.data;
      let minX = scanW, maxX = -1, minY = scanH, maxY = -1;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] >= scanThreshold) {
          const px = (i >> 2) % scanW;
          const py = (i >> 2) / scanW | 0;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }

      const hasInk = maxX >= minX;
      const ascent = hasInk ? Math.max(0, scanPenY - minY) : 0;
      // +1: the pen row (baseline) itself occupies a pixel row that neither ascent
      // nor descent otherwise claims, so ink at maxY=scanPenY would give descent=0
      // but still needs 1 row allocated — include the baseline row in descent.
      const descent = hasInk ? Math.max(0, maxY - scanPenY + 1) : 0;
      // leftOverhang: ink pixels left of the pen origin (e.g. italic leading serifs).
      // rightOverhang: ink pixels past the advance-width right edge.
      const leftOverhang = hasInk ? Math.max(0, scanPenX - minX) : 0;
      const rightOverhang = hasInk ? Math.max(0, maxX - (scanPenX + advance - 1)) : 0;
      return { ch, advance, ascent, descent, overhang: Math.max(leftOverhang, rightOverhang) };
    });

    // padX grows to guarantee at least 1px transparent gap beyond the widest real ink
    // boundary, so the engine cannot accidentally sample a neighbour's glyph.
    const maxOverhang = Math.max(0, ...metricsList.map((m) => m.overhang));
    const padX = Math.max(basePad, maxOverhang + 1);

    const maxAscent = Math.max(1, ...metricsList.map((m) => m.ascent));
    const maxDescent = Math.max(1, ...metricsList.map((m) => m.descent));
    const lineHeight = Math.max(size, maxAscent + maxDescent);

    const glyphDrafts = metricsList.map((item) => {
      const boxW = Math.max(1, item.advance + padX * 2);
      const boxH = Math.max(1, maxAscent + maxDescent + padY * 2);
      return {
        ch: item.ch,
        codepoint: toUnicodeCodepointLiteral(item.ch),
        advance: item.advance,
        ascent: item.ascent,
        descent: item.descent,
        w: boxW,
        h: boxH,
        page: 1,
        x: 0,
        y: 0,
        offsetX: 0,
        offsetY: 0,
      };
    });

    const pages = [];
    let page = 1;
    let x = 0;
    let y = 0;
    let rowH = 0;

    const ensurePage = (pageNumber) => {
      if (!pages.find((p) => p.page === pageNumber)) {
        pages.push({ page: pageNumber, width: 0, height: 0, fileName: `${name}_fontpage${pageNumber}.png` });
      }
      return pages.find((p) => p.page === pageNumber);
    };

    ensurePage(page);

    for (const glyph of glyphDrafts) {
      if (glyph.w > maxPageWidth || glyph.h > maxPageHeight) {
        throw new Error(`Glyph ${glyph.codepoint} exceeds max page size 2048.`);
      }

      if (x + glyph.w > maxPageWidth) {
        x = 0;
        y += rowH;
        rowH = 0;
      }

      if (y + glyph.h > maxPageHeight) {
        page += 1;
        x = 0;
        y = 0;
        rowH = 0;
        ensurePage(page);
      }

      glyph.page = page;
      glyph.x = x;
      glyph.y = y;

      const p = ensurePage(page);
      p.width = Math.max(p.width, glyph.x + glyph.w);
      p.height = Math.max(p.height, glyph.y + glyph.h);

      x += glyph.w;
      rowH = Math.max(rowH, glyph.h);
    }

    const pageCanvases = new Map();
    for (const p of pages) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, p.width);
      canvas.height = Math.max(1, p.height);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      pageCanvases.set(p.page, { canvas, ctx });
    }

    const baselineY = padY + maxAscent;
    // Render every glyph at the fixed (scanPenX, scanPenY) on the scan canvas and
    // drawImage-copy the cell region into the atlas.  Re-using the same absolute render
    // position for every glyph is critical: different absolute coordinates on a large
    // canvas shift the glyph by a sub-pixel (the rasteriser's grid-fit phase depends on
    // the fractional part of the pen position in device pixels), which changes which edge
    // pixels survive the alpha threshold and causes glyphs to bleed into neighbours when
    // compared against the bounds that were measured at scanPenX/scanPenY in pass 1.
    const cellSrcX = scanPenX - padX;        // left edge of the cell inside scan canvas
    const cellSrcY = scanPenY - baselineY;   // top  edge of the cell inside scan canvas
    for (const glyph of glyphDrafts) {
      if (glyph.ch === ' ') continue;
      const holder = pageCanvases.get(glyph.page);
      if (!holder) continue;
      scanCtx.clearRect(0, 0, scanW, scanH);
      scanCtx.fillText(glyph.ch, scanPenX, scanPenY);
      // drawImage clips source coordinates to [0, scanW/H] automatically, so negative
      // cellSrcY (when scanPenY < baselineY, i.e. maxAscent fills the whole headroom)
      // just produces transparent rows at the glyph-cell top — exactly the padY zone.
      holder.ctx.drawImage(scanCanvas, cellSrcX, cellSrcY, glyph.w, glyph.h, glyph.x, glyph.y, glyph.w, glyph.h);
    }

    if (antialias === 'off') {
      for (const holder of pageCanvases.values()) {
        applyAlphaThresholdToCanvas(holder.ctx, holder.canvas.width, holder.canvas.height, 200);
      }
    }

    const writtenPages = [];
    for (const p of pages) {
      const holder = pageCanvases.get(p.page);
      const blob = await new Promise((resolve) => holder.canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error(`Failed to encode page ${p.page}.`);
      const relPath = `${normalizedPath}/${p.fileName}`;
      await writeBinaryFileByRelativePath(relPath, blob);
      writtenPages.push(relPath);
    }

    const fallbackChar = chars.includes('?') ? '?' : (chars[0] || '?');
    const fontLines = [
      'ANGEL_FONT 2',
      `pages ${pages.length}`,
      `lineHeight ${lineHeight}`,
      `defaultAdvance ${lineHeight}`,
      'spacing 0',
      `fallback ${toUnicodeCodepointLiteral(fallbackChar)}`,
    ];

    for (const p of pages) {
      fontLines.push(`page ${p.page} ${p.fileName}`);
    }

    for (const glyph of glyphDrafts) {
      fontLines.push(`glyph ${glyph.codepoint} ${glyph.page} ${glyph.x} ${glyph.y} ${glyph.w} ${glyph.h} ${glyph.advance} ${glyph.offsetX} ${glyph.offsetY}`);
    }

    fontLines.push(`# hinting ${hinting}`);
    fontLines.push(`# antialias ${antialias}`);

    const fontTxtRelPath = `${normalizedPath}/${name}.font.txt`;
    await toolWriteByParams({ path: fontTxtRelPath, content: fontLines.join('\n') });
    await refreshProjectFileTree(false);

    return { pagePaths: writtenPages, fontTxtRelPath, glyphCount: chars.length, pageCount: pages.length };
  }

  return {
    loadSpriteFramesFromInput,
    createSpriteAtlasAndMetadata,
    buildSpriteAtlasAndMetadataFromFrames,
    refreshFontPreview,
    loadSelectedFontFile,
    refreshSystemFontOptions,
    useSystemFontFamily,
    setFontSourceMode,
    appendCharsetFromFiles,
    createBitmapFontAssets,
    createAudioAsset,
  };
}
