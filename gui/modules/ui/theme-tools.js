const THEME_SETTINGS_KEY = 'angel.theme-settings.v1';

const THEME_COLOR_KEYS = [
  '--bg-body',
  '--text-main',
  '--topbar-bg',
  '--toolbar-bg',
  '--border-main',
  '--sidebar-bg',
  '--sidebar-item-border',
  '--sidebar-item-active-border',
  '--sidebar-item-active-bg',
  '--sidebar-meta-text',
  '--right-panel-bg',
  '--panel-card-bg',
  '--panel-card-border',
  '--panel-item-border',
  '--input-bg',
  '--input-text',
  '--input-border',
  '--chip-bg',
  '--chip-text',
  '--chip-border',
  '--chip-protected-border',
  '--chip-protected-text',
  '--graph-grid',
  '--graph-edge-selected',
  '--graph-node-text',
  '--graph-node-fill-selected',
  '--graph-node-stroke-selected',
  '--graph-handle-fill',
  '--graph-handle-stroke',
  '--muted-text',
  '--menu-hover-bg',
  '--menu-hover-border',
  '--agent-chat-bg',
  '--agent-chat-border',
  '--agent-chat-title-bg',
  '--agent-chat-title-border',
  '--agent-chat-sidebar-bg',
  '--agent-chat-btn-bg',
  '--agent-chat-btn-border',
  '--agent-chat-btn-text',
  '--agent-chat-input-bg',
  '--agent-chat-input-border',
  '--agent-chat-input-text',
  '--agent-chat-bubble-agent-bg',
  '--agent-chat-bubble-agent-border',
  '--agent-chat-bubble-user-bg',
  '--agent-chat-bubble-user-border',
  '--agent-chat-bubble-system-bg',
  '--agent-chat-bubble-system-border',
  '--agent-chat-bubble-system-text',
  '--menu-separator',
  '--file-tree-hover-bg',
  '--agent-chat-resize-handle',
  '--modal-backdrop-bg',
  '--modal-head-border',
  '--modal-btn-border',
  '--modal-btn-bg',
  '--modal-btn-text',
  '--modal-note-text',
  '--theme-swatch-border',
  '--theme-palette-card-border',
  '--preview-border',
  '--preview-bg',
  '--help-link-text',
  '--sprite-preview-bg',
  '--sprite-preview-text',
  '--sprite-preview-border',
  '--sprite-preview-error',
  '--font-preview-bg',
  '--font-preview-text',
  '--font-glyph-fill',
];

const RGBA_COLOR_KEYS = [
  '--file-tree-hover-bg',
  '--modal-backdrop-bg',
  '--graph-drag-preview-stroke',
  '--graph-select-fill',
  '--graph-select-fill-alt',
  '--graph-mirror-preview-stroke',
];

const GRID_OPACITY_KEY = '--graph-grid-opacity';
const NODE_BASE_OPACITY_KEY = '--graph-node-base-opacity';

const COLOR_INPUT_BINDINGS = [
  ['themeBgBody', '--bg-body', '#111111'],
  ['themeTextMain', '--text-main', '#eeeeee'],
  ['themeTopbarBg', '--topbar-bg', '#121212'],
  ['themeToolbarBg', '--toolbar-bg', '#181818'],
  ['themeMutedText', '--muted-text', '#9fb0c2'],
  ['themeMenuHoverBg', '--menu-hover-bg', '#253140'],
  ['themeMenuHoverBorder', '--menu-hover-border', '#4c5f77'],
  ['themeBorderMain', '--border-main', '#2a2a2a'],

  ['themeSidebarBg', '--sidebar-bg', '#161616'],
  ['themeSidebarItemBorder', '--sidebar-item-border', '#333333'],
  ['themeSidebarItemActiveBorder', '--sidebar-item-active-border', '#6ea8fe'],
  ['themeSidebarItemActiveBg', '--sidebar-item-active-bg', '#1d2a3d'],
  ['themeSidebarMetaText', '--sidebar-meta-text', '#9fb0c2'],

  ['themeRightPanelBg', '--right-panel-bg', '#141414'],
  ['themePanelCardBg', '--panel-card-bg', '#171b22'],
  ['themePanelCardBorder', '--panel-card-border', '#30353f'],
  ['themePanelItemBorder', '--panel-item-border', '#3a3a3a'],
  ['themeInputBg', '--input-bg', '#101318'],
  ['themeInputText', '--input-text', '#e7edf7'],
  ['themeInputBorder', '--input-border', '#3a4453'],

  ['themeChipBg', '--chip-bg', '#1b1b1b'],
  ['themeChipText', '--chip-text', '#dddddd'],
  ['themeChipBorder', '--chip-border', '#3a3a3a'],
  ['themeChipProtectedBorder', '--chip-protected-border', '#e8b563'],
  ['themeChipProtectedText', '--chip-protected-text', '#ffd899'],

  ['themeGraphGrid', '--graph-grid', '#5f6b7a'],
  ['themeGraphEdgeSelected', '--graph-edge-selected', '#8dc8ff'],
  ['themeNodeText', '--graph-node-text', '#e8eef7'],
  ['themeNodeFillSelected', '--graph-node-fill-selected', '#2f5d95'],
  ['themeNodeStrokeSelected', '--graph-node-stroke-selected', '#8cc2ff'],
  ['themeHandleFill', '--graph-handle-fill', '#d8ecff'],
  ['themeHandleStroke', '--graph-handle-stroke', '#2e6fa7'],

  ['themeAgentChatBg', '--agent-chat-bg', '#131a24'],
  ['themeAgentChatBorder', '--agent-chat-border', '#30353f'],
  ['themeAgentChatTitleBg', '--agent-chat-title-bg', '#172233'],
  ['themeAgentChatTitleBorder', '--agent-chat-title-border', '#253041'],
  ['themeAgentChatSidebarBg', '--agent-chat-sidebar-bg', '#121a27'],
  ['themeAgentChatBtnBg', '--agent-chat-btn-bg', '#1f2f46'],
  ['themeAgentChatBtnBorder', '--agent-chat-btn-border', '#3a4c66'],
  ['themeAgentChatBtnText', '--agent-chat-btn-text', '#d9e7ff'],
  ['themeAgentChatInputBg', '--agent-chat-input-bg', '#0f151f'],
  ['themeAgentChatInputBorder', '--agent-chat-input-border', '#33425b'],
  ['themeAgentChatInputText', '--agent-chat-input-text', '#e6f0ff'],
  ['themeAgentChatBubbleAgentBg', '--agent-chat-bubble-agent-bg', '#20324b'],
  ['themeAgentChatBubbleAgentBorder', '--agent-chat-bubble-agent-border', '#33527a'],
  ['themeAgentChatBubbleUserBg', '--agent-chat-bubble-user-bg', '#2a3e25'],
  ['themeAgentChatBubbleUserBorder', '--agent-chat-bubble-user-border', '#496d3f'],
  ['themeAgentChatBubbleSystemBg', '--agent-chat-bubble-system-bg', '#3a2a18'],
  ['themeAgentChatBubbleSystemBorder', '--agent-chat-bubble-system-border', '#8b6637'],
  ['themeAgentChatBubbleSystemText', '--agent-chat-bubble-system-text', '#ffe5b8'],
  ['themeMenuSeparator', '--menu-separator', '#333b47'],
  ['themeAgentChatResizeHandle', '--agent-chat-resize-handle', '#4f6587'],
  ['themeModalHeadBorder', '--modal-head-border', '#2f3b4d'],
  ['themeModalBtnBorder', '--modal-btn-border', '#3f4e65'],
  ['themeModalBtnBg', '--modal-btn-bg', '#1f2b3b'],
  ['themeModalBtnText', '--modal-btn-text', '#e8eef7'],
  ['themeModalNoteText', '--modal-note-text', '#b8c5d8'],
  ['themeThemeSwatchBorder', '--theme-swatch-border', '#4a5568'],
  ['themeThemePaletteCardBorder', '--theme-palette-card-border', '#2f3b4d'],
  ['themePreviewBorder', '--preview-border', '#33425b'],
  ['themePreviewBg', '--preview-bg', '#0f151f'],
  ['themeHelpLinkText', '--help-link-text', '#8dc8ff'],
  ['themeSpritePreviewBg', '--sprite-preview-bg', '#0f151f'],
  ['themeSpritePreviewText', '--sprite-preview-text', '#9fb0c2'],
  ['themeSpritePreviewBorder', '--sprite-preview-border', '#3a4c66'],
  ['themeSpritePreviewError', '--sprite-preview-error', '#ff5a5a'],
  ['themeFontPreviewBg', '--font-preview-bg', '#0f151f'],
  ['themeFontPreviewText', '--font-preview-text', '#e8eef7'],
  ['themeFontGlyphFill', '--font-glyph-fill', '#ffffff'],
];

const ALPHA_COLOR_BINDINGS = [
  ['themeFileTreeHoverBg', '--file-tree-hover-bg', '#ffffff', 0.08],
  ['themeModalBackdropBg', '--modal-backdrop-bg', '#000000', 0.55],
  ['themeGraphDragPreviewStroke', '--graph-drag-preview-stroke', '#8dc8ff', 0.95],
  ['themeGraphSelectFill', '--graph-select-fill', '#60a6ff', 0.12],
  ['themeGraphSelectFillAlt', '--graph-select-fill-alt', '#60a6ff', 0.16],
  ['themeGraphMirrorPreviewStroke', '--graph-mirror-preview-stroke', '#ffd778', 0.95],
];

export function createGraphPalette({ viewSettings, cssVar }) {
  return {
    nodeFill: viewSettings.node_fill_palette_hex || [cssVar('--graph-node-fill', '#1d2734')],
    nodeFillSelected: [cssVar('--graph-node-fill-selected', '#2f5d95')],
    nodeStroke: viewSettings.node_stroke_palette_hex || [cssVar('--graph-node-stroke', '#4b5b72')],
    nodeStrokeSelected: [cssVar('--graph-node-stroke-selected', '#8cc2ff')],
    nodeText: [cssVar('--graph-node-text', '#e8eef7')],
    grid: [cssVar('--graph-grid', '#5f6b7a')],
    edgeSelected: [cssVar('--graph-edge-selected', '#8dc8ff')],
  };
}

export function palettePick(arr, index = 0, fallback = '#fff') {
  return arr[index] || arr[0] || fallback;
}

export function normalizeColorIndex(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(15, Math.trunc(n)));
}

function parseHexColor(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const s = hex.trim();
  if (!s.startsWith('#')) return null;
  if (s.length === 4) {
    const r = Number.parseInt(s[1] + s[1], 16);
    const g = Number.parseInt(s[2] + s[2], 16);
    const b = Number.parseInt(s[3] + s[3], 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  if (s.length === 7) {
    const r = Number.parseInt(s.slice(1, 3), 16);
    const g = Number.parseInt(s.slice(3, 5), 16);
    const b = Number.parseInt(s.slice(5, 7), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  return null;
}

function normalizeHex(hex, fallback = '#000000') {
  const safeFallback = parseHexColor(fallback) ? fallback : '#000000';
  const parsed = parseHexColor(hex);
  if (!parsed) return safeFallback;
  const h = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${h(parsed.r)}${h(parsed.g)}${h(parsed.b)}`;
}

function hexToRgba(hex, alpha, fallback = '#111111') {
  const parsed = parseHexColor(hex) || parseHexColor(fallback);
  if (!parsed) return `rgba(17,17,17,${alpha})`;
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${a})`;
}

function extractHexFromCssColor(input, fallback = '#000000') {
  const s = String(input || '').trim();
  const asHex = parseHexColor(s);
  if (asHex) return normalizeHex(s, fallback);

  const m = s.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return normalizeHex(`#${Number(m[1]).toString(16).padStart(2, '0')}${Number(m[2]).toString(16).padStart(2, '0')}${Number(m[3]).toString(16).padStart(2, '0')}`, fallback);
  }
  return normalizeHex(fallback, '#000000');
}

function toHexColor({ r, g, b }) {
  const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function mixHexColors(primaryHex, secondaryHex, primaryWeight, clamp01) {
  const a = parseHexColor(primaryHex);
  const b = parseHexColor(secondaryHex);
  if (!a || !b) return primaryHex;
  const w = clamp01(primaryWeight);
  const iw = 1 - w;
  return toHexColor({
    r: a.r * w + b.r * iw,
    g: a.g * w + b.g * iw,
    b: a.b * w + b.b * iw,
  });
}

function ensurePaletteLength(list, fallback, len = 16) {
  const out = [];
  for (let i = 0; i < len; i += 1) {
    out.push(normalizeHex(list?.[i], normalizeHex(fallback?.[i] || fallback?.[0] || '#222222')));
  }
  return out;
}

function getDefaultThemeSettings({ cssVar, graphPalette }) {
  const cssVars = {};
  for (const key of THEME_COLOR_KEYS) cssVars[key] = cssVar(key, '');
  for (const key of RGBA_COLOR_KEYS) cssVars[key] = cssVar(key, '');

  const fillDefault = Array.isArray(graphPalette?.nodeFill) ? graphPalette.nodeFill : ['#1d2734'];
  const strokeDefault = Array.isArray(graphPalette?.nodeStroke) ? graphPalette.nodeStroke : ['#4b5b72'];

  return {
    presetId: 'default',
    cssVars,
    nodeFillPalette: ensurePaletteLength(fillDefault, fillDefault, 16),
    nodeStrokePalette: ensurePaletteLength(strokeDefault, strokeDefault, 16),
    backgroundImageEnabled: false,
    backgroundImageDataUrl: '',
    backgroundImageOpacity: 1,
    gridOpacity: 0.08,
    nodeBaseOpacity: 1,
  };
}

function normalizeThemeSettings(raw, defaults) {
  const cssVars = { ...(defaults.cssVars || {}) };
  for (const key of Object.keys(cssVars)) {
    const next = raw?.cssVars?.[key];
    if (!(typeof next === 'string' && next.trim())) continue;
    if (RGBA_COLOR_KEYS.includes(key)) {
      cssVars[key] = next.trim();
    } else {
      cssVars[key] = normalizeHex(next.trim(), cssVars[key]);
    }
  }

  const gridOpacityRaw = raw?.gridOpacity ?? raw?.cssVars?.[GRID_OPACITY_KEY] ?? defaults?.gridOpacity ?? 0.08;
  const gridOpacity = Math.max(0, Math.min(0.3, Number(gridOpacityRaw) || 0.08));
  cssVars[GRID_OPACITY_KEY] = String(gridOpacity);
  const nodeBaseOpacityRaw = raw?.nodeBaseOpacity ?? raw?.cssVars?.[NODE_BASE_OPACITY_KEY] ?? defaults?.nodeBaseOpacity ?? 1;
  const nodeBaseOpacity = Math.max(0.1, Math.min(1, Number(nodeBaseOpacityRaw) || 1));
  cssVars[NODE_BASE_OPACITY_KEY] = String(nodeBaseOpacity);

  return {
    presetId: String(raw?.presetId || 'default'),
    cssVars,
    nodeFillPalette: ensurePaletteLength(raw?.nodeFillPalette, defaults.nodeFillPalette, 16),
    nodeStrokePalette: ensurePaletteLength(raw?.nodeStrokePalette, defaults.nodeStrokePalette, 16),
    backgroundImageEnabled: Boolean(raw?.backgroundImageEnabled),
    backgroundImageDataUrl: String(raw?.backgroundImageDataUrl || ''),
    backgroundImageOpacity: Math.max(0, Math.min(1, Number(raw?.backgroundImageOpacity ?? 1) || 1)),
    gridOpacity,
    nodeBaseOpacity,
  };
}

export function createThemeSettingsController({
  storage,
  cssVar,
  graphPalette,
  graphCanvas,
  dom,
  setStatus,
  closeAllMenus,
  onThemeApplied,
  presetConfigUrl = './config/themes/index.json',
}) {
  let cache = null;
  let pendingBackgroundImageDataUrl = '';
  let presets = null;
  let presetLabels = { default: 'Monochrome', dark: 'Dark', light: 'Light Blue', manhattanhenge: 'Sunset' };
  let externalPresetLoadPromise = null;

  function mergeExternalPresets(rawPayload) {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const list = Array.isArray(payload.presets) ? payload.presets : [];
    if (!list.length) return;

    const base = getPresets();
    const defaults = base.default;
    const nextLabels = { ...presetLabels };

    for (const item of list) {
      const id = String(item?.id || '').trim();
      if (!id) continue;
      if (typeof item?.label === 'string' && item.label.trim()) nextLabels[id] = item.label.trim();

      const seed = base[id] ? cloneSettings(base[id]) : cloneSettings(defaults);
      const merged = normalizeThemeSettings({
        presetId: id,
        cssVars: item?.cssVars,
        nodeFillPalette: item?.nodeFillPalette,
        nodeStrokePalette: item?.nodeStrokePalette,
        backgroundImageEnabled: item?.backgroundImageEnabled,
        backgroundImageDataUrl: item?.backgroundImageDataUrl,
        backgroundImageOpacity: item?.backgroundImageOpacity,
        gridOpacity: item?.gridOpacity,
        nodeBaseOpacity: item?.nodeBaseOpacity,
      }, defaults);

      base[id] = {
        ...seed,
        ...merged,
        presetId: id,
      };
    }

    presets = base;
    presetLabels = nextLabels;
  }

  async function ensureExternalPresetsLoaded() {
    if (externalPresetLoadPromise) return externalPresetLoadPromise;
    externalPresetLoadPromise = (async () => {
      if (!presetConfigUrl) return;
      try {
        const response = await fetch(presetConfigUrl, { cache: 'no-cache' });
        if (!response.ok) return;
        const payload = await response.json();

        // mode A: single config with inline presets
        if (Array.isArray(payload?.presets)) {
          mergeExternalPresets(payload);
          return;
        }

        // mode B: folder index with preset files
        const files = Array.isArray(payload?.files) ? payload.files : [];
        if (!files.length) return;

        const baseUrl = new URL(presetConfigUrl, window.location.href);
        const presets = [];
        for (const file of files) {
          const rel = String(file || '').trim();
          if (!rel) continue;
          try {
            const itemUrl = new URL(rel, baseUrl).toString();
            const itemResp = await fetch(itemUrl, { cache: 'no-cache' });
            if (!itemResp.ok) continue;
            const item = await itemResp.json();
            if (item && typeof item === 'object') presets.push(item);
          } catch {
            // skip broken preset files
          }
        }
        if (presets.length) mergeExternalPresets({ presets });
      } catch {
        // ignore optional external preset load failures
      }
    })();
    return externalPresetLoadPromise;
  }

  function getPresets() {
    if (presets) return presets;
    const defaults = getDefaultThemeSettings({ cssVar, graphPalette });
    presets = {
      default: defaults,
    };
    return presets;
  }

  function cloneSettings(s) {
    return JSON.parse(JSON.stringify(s));
  }

  function load() {
    const presetDefaults = getPresets().default;
    try {
      const raw = storage.getItem(THEME_SETTINGS_KEY);
      if (!raw) {
        cache = cloneSettings(presetDefaults);
        pendingBackgroundImageDataUrl = String(cache.backgroundImageDataUrl || '');
        return cache;
      }
      cache = normalizeThemeSettings(JSON.parse(raw), presetDefaults);
      pendingBackgroundImageDataUrl = String(cache.backgroundImageDataUrl || '');
      return cache;
    } catch {
      cache = cloneSettings(presetDefaults);
      pendingBackgroundImageDataUrl = String(cache.backgroundImageDataUrl || '');
      return cache;
    }
  }

  function save(next) {
    cache = next;
    try {
      storage.setItem(THEME_SETTINGS_KEY, JSON.stringify(next));
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function renderPaletteGrid(settings) {
    if (!dom.themePaletteGrid) return;
    dom.themePaletteGrid.innerHTML = '';
    for (let i = 0; i < 16; i += 1) {
      const card = document.createElement('div');
      card.className = 'theme-palette-pair';
      card.innerHTML = `
        <div class="theme-palette-title">Index ${i}</div>
        <div class="pair-row pair-row-inline">
          <label class="pair-chip">Fill <input type="color" data-theme-fill-index="${i}" value="${settings.nodeFillPalette[i]}" /></label>
          <label class="pair-chip">Stroke <input type="color" data-theme-stroke-index="${i}" value="${settings.nodeStrokePalette[i]}" /></label>
        </div>
      `;
      dom.themePaletteGrid.appendChild(card);
    }
  }

  function readPaletteFromGrid(current) {
    const fill = [...current.nodeFillPalette];
    const stroke = [...current.nodeStrokePalette];
    const fillInputs = dom.themePaletteGrid?.querySelectorAll('input[data-theme-fill-index]') || [];
    const strokeInputs = dom.themePaletteGrid?.querySelectorAll('input[data-theme-stroke-index]') || [];

    fillInputs.forEach((input) => {
      const i = Number(input.getAttribute('data-theme-fill-index'));
      if (!Number.isNaN(i)) fill[i] = normalizeHex(input.value, fill[i]);
    });
    strokeInputs.forEach((input) => {
      const i = Number(input.getAttribute('data-theme-stroke-index'));
      if (!Number.isNaN(i)) stroke[i] = normalizeHex(input.value, stroke[i]);
    });

    return {
      fill: ensurePaletteLength(fill, current.nodeFillPalette, 16),
      stroke: ensurePaletteLength(stroke, current.nodeStrokePalette, 16),
    };
  }

  function applyBackgroundImage(settings) {
    if (!graphCanvas) return;

    if (settings.backgroundImageEnabled && settings.backgroundImageDataUrl) {
      const escapedUrl = String(settings.backgroundImageDataUrl || '').replace(/["\\\n\r]/g, '\\$&');
      const opacity = Math.max(0, Math.min(1, Number(settings.backgroundImageOpacity ?? 1) || 1));
      const overlay = Math.max(0, Math.min(1, 1 - opacity));
      const appBg = settings?.cssVars?.['--bg-body'] || '#111111';
      const overlayColor = hexToRgba(appBg, overlay, '#111111');
      graphCanvas.style.backgroundImage = `linear-gradient(${overlayColor}, ${overlayColor}), url("${escapedUrl}")`;
      graphCanvas.style.backgroundSize = '100% 100%, cover';
      graphCanvas.style.backgroundPosition = 'center center, center center';
      graphCanvas.style.backgroundRepeat = 'no-repeat, no-repeat';
      graphCanvas.style.backgroundColor = 'transparent';
    } else {
      graphCanvas.style.backgroundImage = '';
      graphCanvas.style.backgroundSize = '';
      graphCanvas.style.backgroundPosition = '';
      graphCanvas.style.backgroundRepeat = '';
      graphCanvas.style.backgroundColor = 'transparent';
    }
  }

  function apply(settings) {
    const rootStyle = document.documentElement.style;
    for (const [key, value] of Object.entries(settings.cssVars || {})) {
      if (!value) continue;
      rootStyle.setProperty(key, value);
    }

    graphPalette.nodeFill = [...settings.nodeFillPalette];
    graphPalette.nodeStroke = [...settings.nodeStrokePalette];
    if (settings.cssVars['--graph-node-text']) graphPalette.nodeText = [settings.cssVars['--graph-node-text']];
    if (settings.cssVars['--graph-grid']) graphPalette.grid = [settings.cssVars['--graph-grid']];
    if (settings.cssVars['--graph-edge-selected']) graphPalette.edgeSelected = [settings.cssVars['--graph-edge-selected']];

    applyBackgroundImage(settings);
    if (typeof onThemeApplied === 'function') onThemeApplied(settings);
  }

  function renderPresetOptions(selected = 'default') {
    if (!dom.themePresetSelect) return;
    const presetMap = getPresets();
    dom.themePresetSelect.innerHTML = '';
    Object.keys(presetMap).forEach((id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = presetLabels[id] || id;
      opt.selected = id === selected;
      dom.themePresetSelect.appendChild(opt);
    });
  }

  function updateBackgroundImageOptionsVisibility() {
    const visible = Boolean(dom.themeBgImageEnabled?.checked);
    dom.themeBgImageOptions?.classList.toggle('hidden', !visible);
  }

  async function open() {
    await ensureExternalPresetsLoaded();
    const settings = cache || load();
    if (!dom.themeModal) return;

    renderPresetOptions(settings.presetId || 'default');
    COLOR_INPUT_BINDINGS.forEach(([domKey, cssKey, fallback]) => {
      if (!dom[domKey]) return;
      dom[domKey].value = normalizeHex(settings.cssVars[cssKey], fallback);
    });
    ALPHA_COLOR_BINDINGS.forEach(([domKey, cssKey, fallbackHex]) => {
      if (!dom[domKey]) return;
      dom[domKey].value = extractHexFromCssColor(settings.cssVars[cssKey], fallbackHex);
    });
    renderPaletteGrid(settings);

    const gridOpacity = Math.max(0, Math.min(0.3, Number(settings.gridOpacity ?? settings.cssVars?.[GRID_OPACITY_KEY] ?? 0.08) || 0.08));
    if (dom.themeGridOpacity) dom.themeGridOpacity.value = String(gridOpacity);
    const nodeBaseOpacity = Math.max(0.1, Math.min(1, Number(settings.nodeBaseOpacity ?? settings.cssVars?.[NODE_BASE_OPACITY_KEY] ?? 1) || 1));
    if (dom.themeNodeBaseOpacity) dom.themeNodeBaseOpacity.value = String(nodeBaseOpacity);

    dom.themeBgImageEnabled.checked = Boolean(settings.backgroundImageEnabled && settings.backgroundImageDataUrl);
    updateBackgroundImageOptionsVisibility();
    dom.themeBgImageOpacity.value = String(settings.backgroundImageOpacity ?? 1);
    pendingBackgroundImageDataUrl = String(settings.backgroundImageDataUrl || '');
    dom.themeBgImagePreview.src = pendingBackgroundImageDataUrl || '';
    dom.themeBgImagePreview.style.opacity = String(Math.max(0, Math.min(1, Number(settings.backgroundImageOpacity ?? 1) || 1)));
    dom.themeBgImagePreviewWrap?.classList.toggle('hidden', !pendingBackgroundImageDataUrl);

    dom.themeModal.classList.remove('hidden');
    dom.themeModal.setAttribute('aria-hidden', 'false');
  }

  function close() {
    if (!dom.themeModal) return;
    dom.themeModal.classList.add('hidden');
    dom.themeModal.setAttribute('aria-hidden', 'true');
  }

  function bind() {
    if (dom.menuTheme) {
      dom.menuTheme.addEventListener('click', async () => {
        await open();
        closeAllMenus();
        setStatus('Opened Theme settings');
      });
    }

    if (dom.themePresetSelect) {
      dom.themePresetSelect.addEventListener('change', async () => {
        await ensureExternalPresetsLoaded();
        const presetId = dom.themePresetSelect.value || 'default';
        const preset = cloneSettings(getPresets()[presetId] || getPresets().default);
        // Apply preset as editable working copy (does not mutate preset source)
        cache = { ...preset, presetId };
        pendingBackgroundImageDataUrl = String(cache.backgroundImageDataUrl || '');
        await open();
        setStatus(`Loaded preset: ${presetId}`);
      });
    }

    if (dom.themeClose) {
      dom.themeClose.addEventListener('click', () => {
        close();
        setStatus('Theme settings closed');
      });
    }
    if (dom.themeCancel) {
      dom.themeCancel.addEventListener('click', () => {
        close();
        setStatus('Theme settings closed');
      });
    }

    if (dom.themeModal) {
      dom.themeModal.addEventListener('click', (evt) => {
        const target = evt.target;
        if (target && target.dataset && target.dataset.closeTheme) {
          close();
          setStatus('Theme settings closed');
        }
      });
    }

    if (dom.themeBgImageFile) {
      dom.themeBgImageFile.addEventListener('change', () => {
        const file = dom.themeBgImageFile.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          pendingBackgroundImageDataUrl = dataUrl;
          dom.themeBgImagePreview.src = dataUrl;
          dom.themeBgImagePreview.style.opacity = String(Math.max(0, Math.min(1, Number(dom.themeBgImageOpacity?.value || 1) || 1)));
          dom.themeBgImagePreviewWrap?.classList.toggle('hidden', !dataUrl);
        };
        reader.readAsDataURL(file);
      });
    }

    if (dom.themeBgImageEnabled) {
      dom.themeBgImageEnabled.addEventListener('change', () => {
        updateBackgroundImageOptionsVisibility();
      });
    }

    if (dom.themeBgImageOpacity) {
      dom.themeBgImageOpacity.addEventListener('input', () => {
        const value = Math.max(0, Math.min(1, Number(dom.themeBgImageOpacity.value || 1) || 1));
        if (dom.themeBgImagePreview) dom.themeBgImagePreview.style.opacity = String(value);
      });
    }

    if (dom.themeBgImageClear) {
      dom.themeBgImageClear.addEventListener('click', () => {
        if (dom.themeBgImageFile) dom.themeBgImageFile.value = '';
        pendingBackgroundImageDataUrl = '';
        dom.themeBgImagePreview.src = '';
        dom.themeBgImagePreview.style.opacity = '1';
        dom.themeBgImagePreviewWrap?.classList.add('hidden');
        dom.themeBgImageEnabled.checked = false;
        updateBackgroundImageOptionsVisibility();
      });
    }

    if (dom.themeSave) {
      dom.themeSave.addEventListener('click', () => {
        const current = cache || load();
        const palette = readPaletteFromGrid(current);
        const next = {
          ...current,
          presetId: String(dom.themePresetSelect?.value || current.presetId || 'default'),
          cssVars: (() => {
            const nextCss = { ...current.cssVars };
            COLOR_INPUT_BINDINGS.forEach(([domKey, cssKey, fallback]) => {
              if (!dom[domKey]) return;
              nextCss[cssKey] = normalizeHex(dom[domKey].value, nextCss[cssKey] || fallback);
            });
            ALPHA_COLOR_BINDINGS.forEach(([domKey, cssKey, fallbackHex, alpha]) => {
              if (!dom[domKey]) return;
              const hex = normalizeHex(dom[domKey].value, fallbackHex);
              nextCss[cssKey] = hexToRgba(hex, alpha, fallbackHex);
            });
            const gridOpacity = Math.max(0, Math.min(0.3, Number(dom.themeGridOpacity?.value ?? current.gridOpacity ?? 0.08) || 0.08));
            nextCss[GRID_OPACITY_KEY] = String(gridOpacity);
            const nodeBaseOpacity = Math.max(0.1, Math.min(1, Number(dom.themeNodeBaseOpacity?.value ?? current.nodeBaseOpacity ?? 1) || 1));
            nextCss[NODE_BASE_OPACITY_KEY] = String(nodeBaseOpacity);
            return nextCss;
          })(),
          nodeFillPalette: palette.fill,
          nodeStrokePalette: palette.stroke,
          backgroundImageEnabled: Boolean(dom.themeBgImageEnabled.checked) && Boolean(pendingBackgroundImageDataUrl),
          backgroundImageDataUrl: String(pendingBackgroundImageDataUrl || ''),
          backgroundImageOpacity: Math.max(0, Math.min(1, Number(dom.themeBgImageOpacity?.value || 1) || 1)),
          gridOpacity: Math.max(0, Math.min(0.3, Number(dom.themeGridOpacity?.value ?? current.gridOpacity ?? 0.08) || 0.08)),
          nodeBaseOpacity: Math.max(0.1, Math.min(1, Number(dom.themeNodeBaseOpacity?.value ?? current.nodeBaseOpacity ?? 1) || 1)),
        };

        const saveResult = save(next);
        apply(next);
        close();
        if (!saveResult.ok) setStatus('Theme applied (not persisted: storage limit, image may be too large)');
        else setStatus('Theme saved');
      });
    }
  }

  async function hydrate() {
    // Load external presets first so the built-in `default` slot reflects the
    // shipped default theme (Monochrome) rather than the CSS :root fallback.
    await ensureExternalPresetsLoaded();
    const settings = load();
    apply(settings);
  }

  return { bind, open, close, hydrate };
}
