import { VIEW_SETTINGS } from './config/view-settings.js';
import { createGraphHelpers } from './modules/graph-helpers.js';
import { createStateHelpers } from './modules/state-helpers.js';
import { AGENT_FUNCTION_TOOL_SCHEMAS, getToolSchemasByAgent } from '../prompts/agent-tool-schemas/agent-tool-schemas.js';
import { createAgentFunctions } from './modules/agent/agent-functions.js';
import { createAgentToolRuntime } from './modules/agent/agent-tool-runtime.js';
import { createAgentMemoryPreload, buildRecentCanonicalTurns } from './modules/agent/agent-memory-preload.js';
import { createAgentToolContext } from './modules/agent/agent-tool-context.js';
import { createAutoLayoutTool } from './modules/layout/auto-layout-tool.js';
import { createElkPreviewLayout } from './modules/layout/elk-preview-layout.js';
import { createTransformSessionController } from './modules/transform/transform-session.js';
import { createAgentRuntime, AUTO_COMPACT_THRESHOLD } from './modules/agent/agent-runtime.js';
import { createAgentChatStateManager } from './modules/agent/agent-chat-state.js';
import { createAgentContextCompactionManager } from './modules/agent/agent-context-compaction.js';
import { createAgentModelSettingsController } from './modules/agent/agent-model-settings-ui.js';
import {
  createGraphPalette,
  createThemeSettingsController,
  mixHexColors,
  normalizeColorIndex,
  palettePick,
} from './modules/ui/theme-tools.js';
import { createFileTreeUI } from './modules/ui/file-tree-ui.js';
import { createInspectorUI } from './modules/ui/inspector-ui.js';
import { createAgentChatUIShell } from './modules/agent/agent-chat-ui-shell.js';
import { createCliAgentRuntime, normalizeSessionRecord } from './modules/agent/cli-agent-runtime.js';
import { getCliAgentDriver, listCliAgentDrivers } from './modules/agent/cli-agent-drivers.js';
import { createProjectIOController } from './modules/project/project-io-controller.js';
import { createMenuShell } from './modules/ui/menu-shell.js';
import { createAssetModalBindings } from './modules/ui/asset-modal-bindings.js';
import { createAssetModalLifecycle } from './modules/ui/asset-modal-lifecycle.js';
import { createAssetGeneration } from './modules/ui/asset-generation.js';
import { createRunTestModalController } from './modules/ui/run-test-modal-controller.js';
import { createCliMemorySeedModalController } from './modules/ui/cli-memory-seed-modal-controller.js';
import { createAppShellUI } from './modules/ui/app-shell-ui.js';
import { createGraphDomain } from './modules/graph/graph-domain.js';
import { createGraphGeometry } from './modules/graph/graph-geometry.js';
import { createGraphLocalHelpers } from './modules/graph/graph-local-helpers.js';
import { createCanvasRendererPrimitives } from './modules/graph/canvas-renderer-primitives.js';
import { createCanvasRendererOverlays } from './modules/graph/canvas-renderer-overlays.js';
import { createCanvasRendererScene } from './modules/graph/canvas-renderer-scene.js';
import { createCanvasRendererCore } from './modules/graph/canvas-renderer-core.js';
import { createNodeIndex } from './modules/graph/node-index.js';
import { createEdgeRenderHelpers } from './modules/graph/edge-render-helpers.js';
import { createCanvasCoordinates } from './modules/graph/canvas-coordinates.js';
import { createEditClipboardCommands } from './modules/edit/edit-clipboard-commands.js';
import { createEditNodeCreateCommand } from './modules/edit/edit-node-create-command.js';
import { createEditEdgeCommand } from './modules/edit/edit-edge-command.js';
import { createEditMirrorUpdateCommands } from './modules/edit/edit-mirror-update-commands.js';
import { createEditArrangeCommands } from './modules/edit/edit-arrange-commands.js';
import { createEditTransformCommands } from './modules/edit/edit-transform-commands.js';
import { createInteractionHitTesting } from './modules/interaction/interaction-hit-testing.js';
import { createInteractionAutoPan } from './modules/interaction/interaction-auto-pan.js';
import { createInteractionPointerMove } from './modules/interaction/interaction-pointer-move.js';
import { createInteractionPointerDown } from './modules/interaction/interaction-pointer-down.js';
import { createInteractionPointerUp } from './modules/interaction/interaction-pointer-up.js';
import { createInteractionClickWheel } from './modules/interaction/interaction-click-wheel.js';
import { createInteractionKeyboard } from './modules/interaction/interaction-keyboard.js';
import { createInteractionEventBindings } from './modules/interaction/interaction-event-bindings.js';
import { createInteractionTransformContextMenuBridge } from './modules/interaction/interaction-transform-context-menu-bridge.js';
import { applyTranslations, getSavedLocale, initI18n, saveLocale, t } from './modules/i18n/i18n.js';

const nodes = [];

const edges = [];

const containmentRelations = [];
const mirrorRelations = [];

const conflicts = [];

// Fast id -> node lookup; rebuilt once per render frame (see node-index.js).
const nodeIndex = createNodeIndex({ nodes });

const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('reset-view');
const canvasContextMenu = document.getElementById('canvas-context-menu');
const ctxTransformScaleBtn = document.getElementById('ctx-transform-scale');
const ctxTransformRotate90Btn = document.getElementById('ctx-transform-rotate90');
const ctxTransformFlipHBtn = document.getElementById('ctx-transform-flip-h');
const ctxTransformLayoutBtn = document.getElementById('ctx-transform-layout');

const leftSidebar = document.getElementById('left-sidebar');
const fileBrowserTabs = document.getElementById('file-browser-tabs');
const sidebarControls = document.getElementById('sidebar-controls');
const sidebarResize = document.getElementById('sidebar-resize');
const fileBrowser = document.getElementById('file-browser');
const fileBrowserEmpty = document.getElementById('file-browser-empty');
const fileBrowserInfo = document.getElementById('file-browser-info');
const fileRefreshBtn = document.getElementById('file-refresh');

const layerSelect = document.getElementById('layer-select');
const menuBar = document.getElementById('menu-bar');
const menuNewProject = document.getElementById('menu-new-project');
const menuOpen = document.getElementById('menu-open');
const menuSave = document.getElementById('menu-save');
const menuSaveAs = document.getElementById('menu-save-as');
const menuUndo = document.getElementById('menu-undo');
const menuRedo = document.getElementById('menu-redo');
const menuCut = document.getElementById('menu-cut');
const menuCopy = document.getElementById('menu-copy');
const menuPaste = document.getElementById('menu-paste');
const layerQuickSwitch = document.getElementById('layer-quick-switch');
const menuInspector = document.getElementById('menu-inspector');
const menuProjectBrowser = document.getElementById('menu-project-browser');
const menuTheme = document.getElementById('menu-theme');
const menuAgentModel = document.getElementById('menu-agent-model');
const menuLanguage = document.getElementById('menu-language');
const themeModal = document.getElementById('theme-modal');
const themeClose = document.getElementById('theme-close');
const themeCancel = document.getElementById('theme-cancel');
const themeSave = document.getElementById('theme-save');
const themePresetSelect = document.getElementById('theme-preset-select');
const themeBgBody = document.getElementById('theme-bg-body');
const themeTextMain = document.getElementById('theme-text-main');
const themeTopbarBg = document.getElementById('theme-topbar-bg');
const themeToolbarBg = document.getElementById('theme-toolbar-bg');
const themeMutedText = document.getElementById('theme-muted-text');
const themeMenuHoverBg = document.getElementById('theme-menu-hover-bg');
const themeMenuHoverBorder = document.getElementById('theme-menu-hover-border');
const themeBorderMain = document.getElementById('theme-border-main');
const themeSidebarBg = document.getElementById('theme-sidebar-bg');
const themeSidebarItemBorder = document.getElementById('theme-sidebar-item-border');
const themeSidebarItemActiveBorder = document.getElementById('theme-sidebar-item-active-border');
const themeSidebarItemActiveBg = document.getElementById('theme-sidebar-item-active-bg');
const themeSidebarMetaText = document.getElementById('theme-sidebar-meta-text');
const themeRightPanelBg = document.getElementById('theme-right-panel-bg');
const themePanelCardBg = document.getElementById('theme-panel-card-bg');
const themePanelCardBorder = document.getElementById('theme-panel-card-border');
const themePanelItemBorder = document.getElementById('theme-panel-item-border');
const themeInputBg = document.getElementById('theme-input-bg');
const themeInputText = document.getElementById('theme-input-text');
const themeInputBorder = document.getElementById('theme-input-border');
const themeChipBg = document.getElementById('theme-chip-bg');
const themeChipText = document.getElementById('theme-chip-text');
const themeChipBorder = document.getElementById('theme-chip-border');
const themeChipProtectedBorder = document.getElementById('theme-chip-protected-border');
const themeChipProtectedText = document.getElementById('theme-chip-protected-text');
const themeGraphGrid = document.getElementById('theme-graph-grid');
const themeGraphEdgeSelected = document.getElementById('theme-graph-edge-selected');
const themeNodeText = document.getElementById('theme-node-text');
const themeNodeFillSelected = document.getElementById('theme-node-fill-selected');
const themeNodeStrokeSelected = document.getElementById('theme-node-stroke-selected');
const themeHandleFill = document.getElementById('theme-handle-fill');
const themeHandleStroke = document.getElementById('theme-handle-stroke');
const themeMenuSeparator = document.getElementById('theme-menu-separator');
const themeAgentChatResizeHandle = document.getElementById('theme-agent-chat-resize-handle');
const themeModalHeadBorder = document.getElementById('theme-modal-head-border');
const themeModalBtnBorder = document.getElementById('theme-modal-btn-border');
const themeModalBtnBg = document.getElementById('theme-modal-btn-bg');
const themeModalBtnText = document.getElementById('theme-modal-btn-text');
const themeModalNoteText = document.getElementById('theme-modal-note-text');
const themeThemeSwatchBorder = document.getElementById('theme-theme-swatch-border');
const themeThemePaletteCardBorder = document.getElementById('theme-theme-palette-card-border');
const themePreviewBorder = document.getElementById('theme-preview-border');
const themePreviewBg = document.getElementById('theme-preview-bg');
const themeHelpLinkText = document.getElementById('theme-help-link-text');
const themeSpritePreviewBg = document.getElementById('theme-sprite-preview-bg');
const themeSpritePreviewText = document.getElementById('theme-sprite-preview-text');
const themeSpritePreviewBorder = document.getElementById('theme-sprite-preview-border');
const themeSpritePreviewError = document.getElementById('theme-sprite-preview-error');
const themeFontPreviewBg = document.getElementById('theme-font-preview-bg');
const themeFontPreviewText = document.getElementById('theme-font-preview-text');
const themeFontGlyphFill = document.getElementById('theme-font-glyph-fill');
const themeFileTreeHoverBg = document.getElementById('theme-file-tree-hover-bg');
const themeModalBackdropBg = document.getElementById('theme-modal-backdrop-bg');
const themeGraphDragPreviewStroke = document.getElementById('theme-graph-drag-preview-stroke');
const themeGraphSelectFill = document.getElementById('theme-graph-select-fill');
const themeGraphSelectFillAlt = document.getElementById('theme-graph-select-fill-alt');
const themeGraphMirrorPreviewStroke = document.getElementById('theme-graph-mirror-preview-stroke');
const themeGridOpacity = document.getElementById('theme-grid-opacity');
const themeNodeBaseOpacity = document.getElementById('theme-node-base-opacity');
const themeAgentChatBg = document.getElementById('theme-agent-chat-bg');
const themeAgentChatBorder = document.getElementById('theme-agent-chat-border');
const themeAgentChatTitleBg = document.getElementById('theme-agent-chat-title-bg');
const themeAgentChatTitleBorder = document.getElementById('theme-agent-chat-title-border');
const themeAgentChatSidebarBg = document.getElementById('theme-agent-chat-sidebar-bg');
const themeAgentChatBtnBg = document.getElementById('theme-agent-chat-btn-bg');
const themeAgentChatBtnBorder = document.getElementById('theme-agent-chat-btn-border');
const themeAgentChatBtnText = document.getElementById('theme-agent-chat-btn-text');
const themeAgentChatInputBg = document.getElementById('theme-agent-chat-input-bg');
const themeAgentChatInputBorder = document.getElementById('theme-agent-chat-input-border');
const themeAgentChatInputText = document.getElementById('theme-agent-chat-input-text');
const themeAgentChatBubbleAgentBg = document.getElementById('theme-agent-chat-bubble-agent-bg');
const themeAgentChatBubbleAgentBorder = document.getElementById('theme-agent-chat-bubble-agent-border');
const themeAgentChatBubbleUserBg = document.getElementById('theme-agent-chat-bubble-user-bg');
const themeAgentChatBubbleUserBorder = document.getElementById('theme-agent-chat-bubble-user-border');
const themeAgentChatBubbleSystemBg = document.getElementById('theme-agent-chat-bubble-system-bg');
const themeAgentChatBubbleSystemBorder = document.getElementById('theme-agent-chat-bubble-system-border');
const themeAgentChatBubbleSystemText = document.getElementById('theme-agent-chat-bubble-system-text');
const themePaletteGrid = document.getElementById('theme-palette-grid');
const themeBgImageEnabled = document.getElementById('theme-bg-image-enabled');
const themeBgImageOptions = document.getElementById('theme-bg-image-options');
const themeBgImageFile = document.getElementById('theme-bg-image-file');
const themeBgImageClear = document.getElementById('theme-bg-image-clear');
const themeBgImagePreviewWrap = document.getElementById('theme-bg-image-preview-wrap');
const themeBgImagePreview = document.getElementById('theme-bg-image-preview');
const themeBgImageOpacity = document.getElementById('theme-bg-image-opacity');
const menuCompile = document.getElementById('menu-compile');
const menuExportRelease = document.getElementById('menu-export-release');
const menuCreateSprite = document.getElementById('menu-create-sprite');
const menuCreateFont = document.getElementById('menu-create-font');
const menuCreateAudio = document.getElementById('menu-create-audio');

const agentModelModal = document.getElementById('agent-model-modal');
const languageModal = document.getElementById('language-modal');
const languageSelect = document.getElementById('language-select');
const languageFontSelect = document.getElementById('language-font-select');
const languageClose = document.getElementById('language-close');
const languageCancel = document.getElementById('language-cancel');
const languageSave = document.getElementById('language-save');
const agentModelBackend = document.getElementById('agent-model-backend');
const agentModelCliProfile = document.getElementById('agent-model-cli-profile');
const agentModelCliProfileRow = document.getElementById('agent-model-cli-profile-row');
const agentModelCliModelName = document.getElementById('agent-model-cli-model-name');
const agentModelCliModelRow = document.getElementById('agent-model-cli-model-row');
const agentModelCliInstallHint = document.getElementById('agent-model-cli-install-hint');
const agentModelCliInstallMsg = document.getElementById('agent-model-cli-install-msg');
const agentModelCliInstallOpen = document.getElementById('agent-model-cli-install-open');
const cliInstallModal = document.getElementById('cli-install-modal');
const cliInstallTitle = document.getElementById('cli-install-title');
const cliInstallIntro = document.getElementById('cli-install-intro');
const cliInstallUrl = document.getElementById('cli-install-url');
const cliInstallClose = document.getElementById('cli-install-close');
const cliInstallRecheck = document.getElementById('cli-install-recheck');
const agentModelHttpFields = document.getElementById('agent-model-http-fields');
const agentModelCliTokenRow = document.getElementById('agent-model-cli-token-row');
const agentModelCliToken = document.getElementById('agent-model-cli-token');
const agentModelCliAuth = document.getElementById('agent-model-cli-auth');
const agentModelCliAuthStatus = document.getElementById('agent-model-cli-auth-status');
const agentModelCliLogin = document.getElementById('agent-model-cli-login');
const agentModelCliLogout = document.getElementById('agent-model-cli-logout');
const agentModelCliAuthLog = document.getElementById('agent-model-cli-auth-log');
const agentModelProvider = document.getElementById('agent-model-provider');
const agentModelMethod = document.getElementById('agent-model-method');
const agentModelName = document.getElementById('agent-model-name');
const agentModelReasoningRow = document.getElementById('agent-model-reasoning-row');
const agentModelReasoning = document.getElementById('agent-model-reasoning');
const agentModelMaxTokensRow = document.getElementById('agent-model-max-tokens-row');
const agentModelMaxTokens = document.getElementById('agent-model-max-tokens');
const agentModelMaxLoopRounds = document.getElementById('agent-model-max-loop-rounds');
const agentModelTodoLoopRounds = document.getElementById('agent-model-todo-loop-rounds');
const agentModelImageRow = document.getElementById('agent-model-image-row');
const agentModelImageName = document.getElementById('agent-model-image-name');
const agentModelOpenAIKeyRow = document.getElementById('agent-model-openai-key-row');
const agentModelOpenAIKey = document.getElementById('agent-model-openai-key');
const agentModelOpenAIOAuthRow = document.getElementById('agent-model-openai-oauth-row');
const agentModelOpenAIOAuthToken = document.getElementById('agent-model-openai-oauth-token');
const agentModelOpenAIOAuthActions = document.getElementById('agent-model-openai-oauth-actions');
const agentModelOpenAIOAuthConnect = document.getElementById('agent-model-openai-oauth-connect');
const agentModelOpenAIOAuthRefresh = document.getElementById('agent-model-openai-oauth-refresh');
const agentHumanizeToggle = document.getElementById('agent-humanize-toggle');
const agentDangerSkipPermsToggle = document.getElementById('agent-danger-skip-perms-toggle');
const agentModelClose = document.getElementById('agent-model-close');
const agentModelCancel = document.getElementById('agent-model-cancel');
const agentModelSave = document.getElementById('agent-model-save');
const menuRun = document.getElementById('menu-run');
const menuRunTest = document.getElementById('menu-run-test');
const menuAbout = document.getElementById('menu-about');
const helpModal = document.getElementById('help-modal');
const helpClose = document.getElementById('help-close');
const helpMarkdown = document.getElementById('help-markdown');
const spriteModal = document.getElementById('sprite-modal');
const spriteClose = document.getElementById('sprite-close');
const spriteCancel = document.getElementById('sprite-cancel');
const spriteCreate = document.getElementById('sprite-create');
const spriteFilesInput = document.getElementById('sprite-files');
const spritePathInput = document.getElementById('sprite-path');
const spriteNameInput = document.getElementById('sprite-name');
const spritePivotXInput = document.getElementById('sprite-pivot-x');
const spritePivotYInput = document.getElementById('sprite-pivot-y');
const spritePrevFrameBtn = document.getElementById('sprite-prev-frame');
const spriteNextFrameBtn = document.getElementById('sprite-next-frame');
const spriteFrameLabel = document.getElementById('sprite-frame-label');
const spritePreviewCanvas = document.getElementById('sprite-preview-canvas');
const spriteNote = document.getElementById('sprite-note');
const fontModal = document.getElementById('font-modal');
const fontClose = document.getElementById('font-close');
const fontCancel = document.getElementById('font-cancel');
const fontCreate = document.getElementById('font-create');
const audioModal = document.getElementById('audio-modal');
const audioClose = document.getElementById('audio-close');
const audioCancel = document.getElementById('audio-cancel');
const audioCreate = document.getElementById('audio-create');
const audioFileInput = document.getElementById('audio-file');
const audioPathInput = document.getElementById('audio-path');
const audioNameInput = document.getElementById('audio-name');
const audioFormatInput = document.getElementById('audio-format');
const audioBitrateRow = document.getElementById('audio-row-bitrate');
const audioBitrateInput = document.getElementById('audio-bitrate');
const audioSampleRateRow = document.getElementById('audio-row-sample-rate');
const audioSampleRateInput = document.getElementById('audio-sample-rate');
const audioBitDepthRow = document.getElementById('audio-row-bit-depth');
const audioBitDepthInput = document.getElementById('audio-bit-depth');
const audioNote = document.getElementById('audio-note');
const fontSourceSystemRadio = document.getElementById('font-source-system');
const fontSourceFileRadio = document.getElementById('font-source-file');
const fontSourceSystemRow = document.getElementById('font-source-system-row');
const fontSourceFileRow = document.getElementById('font-source-file-row');
const fontFileInput = document.getElementById('font-file');
const fontSystemSelect = document.getElementById('font-system-select');
const fontPathInput = document.getElementById('font-path');
const fontNameInput = document.getElementById('font-name');
const fontSizeInput = document.getElementById('font-size');
const fontHintingInput = document.getElementById('font-hinting');
const fontAntialiasInput = document.getElementById('font-antialias');
const fontCharsetInput = document.getElementById('font-charset');
const fontCharsetFilesInput = document.getElementById('font-charset-files');
const fontPreviewInput = document.getElementById('font-preview-input');
const fontPreviewScaleInput = document.getElementById('font-preview-scale');
const fontPreviewCanvas = document.getElementById('font-preview-canvas');
const fontNote = document.getElementById('font-note');
const newProjectModal = document.getElementById('new-project-modal');
const newProjectClose = document.getElementById('new-project-close');
const newProjectCancel = document.getElementById('new-project-cancel');
const newProjectConfirm = document.getElementById('new-project-confirm');
const newProjectTemplate = document.getElementById('new-project-template');
const newProjectLocation = document.getElementById('new-project-location');
const newProjectChooseFolder = document.getElementById('new-project-choose-folder');
const runTestModal = document.getElementById('run-test-modal');
const runTestClose = document.getElementById('run-test-close');
const runTestCancel = document.getElementById('run-test-cancel');
const runTestConfirm = document.getElementById('run-test-confirm');
const runTestInput = document.getElementById('run-test-input');
const runTestHistory = document.getElementById('run-test-history');
const runTestDebug = document.getElementById('run-test-debug');
const runTestRecord = document.getElementById('run-test-record');
const runTestNote = document.getElementById('run-test-note');
const executeFailModal = document.getElementById('execute-fail-modal');
const executeFailClose = document.getElementById('execute-fail-close');
const executeFailMessage = document.getElementById('execute-fail-message');
const executeFailDetail = document.getElementById('execute-fail-detail');
const buildToolsModal = document.getElementById('build-tools-modal');
const buildToolsClose = document.getElementById('build-tools-close');
const buildToolsRecheck = document.getElementById('build-tools-recheck');
const saveChangesModal = document.getElementById('save-changes-modal');
const saveChangesClose = document.getElementById('save-changes-close');
const saveChangesMessage = document.getElementById('save-changes-message');
const saveChangesCancel = document.getElementById('save-changes-cancel');
const saveChangesNo = document.getElementById('save-changes-no');
const saveChangesYes = document.getElementById('save-changes-yes');
const projectFileInput = document.getElementById('project-file-input');
const chipRevision = document.getElementById('chip-revision');
const chipUnsaved = document.getElementById('chip-unsaved');
const chipConflicts = document.getElementById('chip-conflicts');
const topbarRight = document.getElementById('topbar-right');
const chipAgent = document.getElementById('chip-agent');

const rightPanel = document.getElementById('right-panel');
const rightPanelResize = document.getElementById('right-panel-resize');
const emptySelection = document.getElementById('empty-selection');
const editorForm = document.getElementById('editor-form');
const multiEditorForm = document.getElementById('multi-editor-form');
const multiFieldColorIndex = document.getElementById('multi-field-color-index');
const multiColorIndexSwatch = document.getElementById('multi-color-index-swatch');
const fieldName = document.getElementById('field-name');
const fieldSummary = document.getElementById('field-summary');
const fieldDetail = document.getElementById('field-detail');
const fieldStatus = document.getElementById('field-status');
const fieldColorIndex = document.getElementById('field-color-index');
const colorIndexSwatch = document.getElementById('color-index-swatch');
const fieldExpectedRevision = document.getElementById('field-expected-revision');
const saveSelectionBtn = document.getElementById('save-selection');
const lockMessage = document.getElementById('lock-message');
const reloadBtn = document.getElementById('btn-reload');
const reapplyBtn = document.getElementById('btn-reapply');
const edgeEditor = document.getElementById('edge-editor');
const edgeIdField = document.getElementById('edge-id');
const edgeRelationField = document.getElementById('edge-relation');
const edgeLabelField = document.getElementById('edge-label');
const edgePathStyleField = document.getElementById('edge-path-style');
const edgeStrokeStyleField = document.getElementById('edge-stroke-style');
const edgeArrowFromField = document.getElementById('edge-arrow-from');
const edgeArrowToField = document.getElementById('edge-arrow-to');
const edgeVisualControls = document.getElementById('edge-visual-controls');
const saveEdgeBtn = document.getElementById('save-edge');
const edgeDescriptionField = document.getElementById('edge-description');
const blockBindingPanel = document.getElementById('block-binding-panel');
const blockBinding = document.getElementById('block-binding');
const includeGuard = document.getElementById('include-guard');
const bindingAddBtn = document.getElementById('binding-add');
const edgeList = document.getElementById('edge-list');
const validationList = document.getElementById('validation-list');
const conflictList = document.getElementById('conflict-list');

const agentChatWindow = document.getElementById('agent-chat-window');
const agentChatTitlebar = document.getElementById('agent-chat-titlebar');
const agentChatToggle = document.getElementById('agent-chat-toggle');
const agentChatBody = document.getElementById('agent-chat-body');
const agentChatResize = document.getElementById('agent-chat-resize');
const agentChatSidebar = document.getElementById('agent-chat-sidebar');
const agentChatSidebarResize = document.getElementById('agent-chat-sidebar-resize');
const agentChatTimeline = document.getElementById('agent-chat-timeline');
const agentChatTodos = document.getElementById('agent-chat-todos');
const agentChatPanelResize = document.getElementById('agent-chat-panel-resize');
const agentTokenStats = document.getElementById('agent-token-stats');
const agentRunUntilDone = document.getElementById('agent-run-until-done');
const agentChatComposerResize = document.getElementById('agent-chat-composer-resize');
const agentChatComposer = document.getElementById('agent-chat-composer');
const agentChatImagePreview = document.getElementById('agent-chat-image-preview');
const agentChatImageLightbox = document.getElementById('agent-chat-image-lightbox');
const agentChatImageLightboxImg = document.getElementById('agent-chat-image-lightbox-img');
const agentChatInput = document.getElementById('agent-chat-input');
const agentChatSend = document.getElementById('agent-chat-send');
const agentChatSaveMemory = document.getElementById('agent-chat-save-memory');
const agentChatCompressMemory = document.getElementById('agent-chat-compress-memory');
const agentChatStatus = document.getElementById('agent-chat-status');

const electronAPI = window.electronAPI ?? null;
const supportsDirectoryPicker = typeof window.showDirectoryPicker === 'function';
const collapsedFileTreePaths = new Set();

const CREATE_NODE_CAMERA_WIDTH_RATIO = 0.15;
const CREATE_NODE_ASPECT_RATIO = 180 / 80;
// Single source of truth for the node minimum size: a screen-space floor of
// 32px. Create clamps to it; resize/stretch can shrink down to it, but a node
// already smaller than 32px in some axis can't be shrunk further in that axis.
const MIN_NODE_SCREEN_PX = 32;
const MIRROR_DEFAULT_DETAIL = 'This is a mirror of another node. Visit via the mirror relationship for more information.';

const AGENT_MODEL_SETTINGS_KEY = 'angel.agent-model-settings.v1';
const OPENAI_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AGENT_DEFAULT_CONTEXT_MAX_TOKENS = 128000;
const AGENT_MODEL_CONTEXT_MAX_WINDOWS = {
  // GPT-5.x
  'gpt-5.4': 1050000,
  'gpt-5.4-pro': 1050000,
  'gpt-5.4-mini': 400000,
  'gpt-5.4-nano': 400000,
  'gpt-5': 400000,
  'gpt-5-mini': 400000,
  'gpt-5-nano': 400000,
  'gpt-5.1': 400000,

  // Codex / ChatGPT OAuth
  'gpt-5.5': 1050000,
  'gpt-5.3-codex-spark': 128000,

  // GPT-4.x
  'gpt-4.1': 1047576,
  'gpt-4.1-mini': 1047576,
  'gpt-4.1-nano': 1047576,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4': 8192,

  // o-series
  'o3': 200000,
  'o3-mini': 200000,
  'o3-deep-research': 200000,
  'o4-mini': 200000,
  'o4-mini-deep-research': 200000,

  // Other providers currently in catalog
  'claude-opus-4-8': 1000000,
  'claude-opus-4-7': 1000000,
  'claude-sonnet-4-6': 1000000,
  'claude-haiku-4-5-20251001': 200000,
  'gemini-3.1-pro': 1000000,
  'gemini-3.1-pro-preview': 1000000,
  'gemini-3-pro-preview': 1000000,
  'gemini-3.5-flash': 1000000,
  'gemini-3-flash-preview': 1000000,
  'gemini-3.1-flash-lite': 1000000,
  'gemini-3.1-flash-lite-preview': 1000000,
  'grok-4.3': 1000000,
  'grok-build-0.1': 256000,
  'grok-3': 128000,
  'grok-3-mini': 128000,
  'deepseek-v4-flash': 1000000,
  'deepseek-v4-pro': 1000000,
  'qwen3.7-max': 1000000,
  'qwen3.7-plus': 1000000,
  'qwen3.6-max-preview': 128000,
  'qwen3-max': 128000,
  'qwen3-max-preview': 128000,
  'qwen-max': 128000,
  'qwen-max-latest': 128000,
  'qwen3.6-plus': 128000,
  'qwen3.5-plus': 128000,
  'qwen-plus': 128000,
  'qwen-plus-latest': 128000,
  'qwen3.6-flash': 128000,
  'qwen3.5-flash': 128000,
  'qwen-flash': 128000,
  'qwen-turbo': 128000,
  'qwen-turbo-latest': 128000,
  'qwen3-coder-plus': 128000,
  'qwen3-coder-flash': 128000,
  'qwen-coder-plus': 128000,
  'qwen-coder-plus-latest': 128000,
  'qwen-coder-turbo': 128000,
  'qwen-coder-turbo-latest': 128000,
  'qwen-long': 1000000,
  'qwen-long-latest': 1000000,
  'qwq-plus': 128000,
  'qwq-plus-latest': 128000,
  'qwen-math-plus': 128000,
  'qwen-math-plus-latest': 128000,
  'qwen-math-turbo': 128000,
  'qwen-math-turbo-latest': 128000,
  'qwen3.6-35b-a3b': 128000,
  'qwen3.5-397b-a17b': 128000,
  'qwen3.5-122b-a10b': 128000,
  'qwen3.5-27b': 128000,
  'qwen3.5-35b-a3b': 128000,
  'qwen3-next-80b-a3b-thinking': 128000,
  'qwen3-next-80b-a3b-instruct': 128000,
  'qwen3-235b-a22b-thinking-2507': 128000,
  'qwen3-235b-a22b-instruct-2507': 128000,
  'qwen3-30b-a3b-thinking-2507': 128000,
  'qwen3-30b-a3b-instruct-2507': 128000,
  'qwen3-235b-a22b': 128000,
  'qwen3-32b': 128000,
  'qwen3-30b-a3b': 128000,
  'qwen3-14b': 128000,
  'qwen3-8b': 128000,
  'qwen3-4b': 128000,
  'qwen3-1.7b': 128000,
  'qwen3-0.6b': 128000,
  'qwq-32b': 128000,
  'qwq-32b-preview': 128000,
  'qwen2.5-14b-instruct-1m': 1000000,
  'qwen2.5-7b-instruct-1m': 1000000,
  'qwen2.5-72b-instruct': 128000,
  'qwen2.5-32b-instruct': 128000,
  'qwen2.5-14b-instruct': 128000,
  'qwen2.5-7b-instruct': 128000,
  'qwen2.5-math-72b-instruct': 128000,
  'qwen2.5-math-7b-instruct': 128000,
  'qwen2.5-coder-32b-instruct': 128000,
  'qwen2.5-coder-14b-instruct': 128000,
  'qwen2.5-coder-7b-instruct': 128000,
  'codeqwen1.5-7b-chat': 128000,
  'doubao-seed-2-0-pro-260215': 128000,
  'doubao-seed-2-0-lite-260215': 128000,
  'doubao-seed-2-0-mini-260215': 128000,
  'doubao-seed-2-0-code-preview-260215': 128000,
  'doubao-seed-1-8-251228': 128000,
  'doubao-seed-code-preview-251028': 128000,
  'kimi-k2.7-code': 256000,
  'kimi-k2.7-code-highspeed': 256000,
  'kimi-k2.6': 256000,
  'kimi-k2.5': 256000,
  'moonshot-v1-8k': 8000,
  'moonshot-v1-32k': 32000,
  'moonshot-v1-128k': 128000,
  'moonshot-v1-8k-vision-preview': 8000,
  'moonshot-v1-32k-vision-preview': 32000,
  'moonshot-v1-128k-vision-preview': 128000,
  'glm-4.6': 200000,
  'glm-4.5': 128000,
  'glm-4.5-air': 128000,
  'glm-4.5-flash': 128000,
};

const AGENT_MODEL_CONTEXT_SUGGESTED_LIMITS = Object.fromEntries(
  Object.entries(AGENT_MODEL_CONTEXT_MAX_WINDOWS).map(([modelName, maxWindow]) => {
    const max = Number.isFinite(Number(maxWindow)) ? Math.max(1, Math.trunc(Number(maxWindow))) : AGENT_DEFAULT_CONTEXT_MAX_TOKENS;
    return [modelName, max];
  })
);

const AGENT_MODEL_CATALOG = [
  {
    providerId: 'openai',
    providerLabel: 'OpenAI',
    models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'gpt-4'],
    methodModels: {
      api_key: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'gpt-4'],
      oauth: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex-spark'],
    },
  },
  {
    providerId: 'anthropic',
    providerLabel: 'Anthropic',
    models: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    methodModels: { api_key: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  },
  {
    providerId: 'google',
    providerLabel: 'Google',
    models: ['gemini-3.1-pro', 'gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview'],
    methodModels: { api_key: ['gemini-3.1-pro', 'gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview'] },
  },
  { providerId: 'xai', providerLabel: 'xAI (Grok)', models: ['grok-4.3', 'grok-build-0.1', 'grok-3', 'grok-3-mini'], methodModels: { api_key: ['grok-4.3', 'grok-build-0.1', 'grok-3', 'grok-3-mini'] } },
  {
    providerId: 'deepseek',
    providerLabel: 'DeepSeek',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    methodModels: { api_key: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
  },
  {
    providerId: 'qwen',
    providerLabel: 'Qwen (Alibaba)',
    models: [
      'qwen3.7-max',
      'qwen3.7-plus',
      'qwen3.6-max-preview',
      'qwen3-max',
      'qwen3-max-preview',
      'qwen-max',
      'qwen-max-latest',
      'qwen3.6-plus',
      'qwen3.5-plus',
      'qwen-plus',
      'qwen-plus-latest',
      'qwen3.6-flash',
      'qwen3.5-flash',
      'qwen-flash',
      'qwen-turbo',
      'qwen-turbo-latest',
      'qwen3-coder-plus',
      'qwen3-coder-flash',
      'qwen-coder-plus',
      'qwen-coder-plus-latest',
      'qwen-coder-turbo',
      'qwen-coder-turbo-latest',
      'qwen-long',
      'qwen-long-latest',
      'qwq-plus',
      'qwq-plus-latest',
      'qwen-math-plus',
      'qwen-math-plus-latest',
      'qwen-math-turbo',
      'qwen-math-turbo-latest',
      'qwen3.6-35b-a3b',
      'qwen3.5-397b-a17b',
      'qwen3.5-122b-a10b',
      'qwen3.5-27b',
      'qwen3.5-35b-a3b',
      'qwen3-next-80b-a3b-thinking',
      'qwen3-next-80b-a3b-instruct',
      'qwen3-235b-a22b-thinking-2507',
      'qwen3-235b-a22b-instruct-2507',
      'qwen3-30b-a3b-thinking-2507',
      'qwen3-30b-a3b-instruct-2507',
      'qwen3-235b-a22b',
      'qwen3-32b',
      'qwen3-30b-a3b',
      'qwen3-14b',
      'qwen3-8b',
      'qwen3-4b',
      'qwen3-1.7b',
      'qwen3-0.6b',
      'qwq-32b',
      'qwq-32b-preview',
      'qwen2.5-14b-instruct-1m',
      'qwen2.5-7b-instruct-1m',
      'qwen2.5-72b-instruct',
      'qwen2.5-32b-instruct',
      'qwen2.5-14b-instruct',
      'qwen2.5-7b-instruct',
      'qwen2.5-math-72b-instruct',
      'qwen2.5-math-7b-instruct',
      'qwen2.5-coder-32b-instruct',
      'qwen2.5-coder-14b-instruct',
      'qwen2.5-coder-7b-instruct',
      'codeqwen1.5-7b-chat',
    ],
    methodModels: {
      api_key: [
        'qwen3.7-max',
        'qwen3.7-plus',
        'qwen3.6-max-preview',
        'qwen3-max',
        'qwen3-max-preview',
        'qwen-max',
        'qwen-max-latest',
        'qwen3.6-plus',
        'qwen3.5-plus',
        'qwen-plus',
        'qwen-plus-latest',
        'qwen3.6-flash',
        'qwen3.5-flash',
        'qwen-flash',
        'qwen-turbo',
        'qwen-turbo-latest',
        'qwen3-coder-plus',
        'qwen3-coder-flash',
        'qwen-coder-plus',
        'qwen-coder-plus-latest',
        'qwen-coder-turbo',
        'qwen-coder-turbo-latest',
        'qwen-long',
        'qwen-long-latest',
        'qwq-plus',
        'qwq-plus-latest',
        'qwen-math-plus',
        'qwen-math-plus-latest',
        'qwen-math-turbo',
        'qwen-math-turbo-latest',
        'qwen3.6-35b-a3b',
        'qwen3.5-397b-a17b',
        'qwen3.5-122b-a10b',
        'qwen3.5-27b',
        'qwen3.5-35b-a3b',
        'qwen3-next-80b-a3b-thinking',
        'qwen3-next-80b-a3b-instruct',
        'qwen3-235b-a22b-thinking-2507',
        'qwen3-235b-a22b-instruct-2507',
        'qwen3-30b-a3b-thinking-2507',
        'qwen3-30b-a3b-instruct-2507',
        'qwen3-235b-a22b',
        'qwen3-32b',
        'qwen3-30b-a3b',
        'qwen3-14b',
        'qwen3-8b',
        'qwen3-4b',
        'qwen3-1.7b',
        'qwen3-0.6b',
        'qwq-32b',
        'qwq-32b-preview',
        'qwen2.5-14b-instruct-1m',
        'qwen2.5-7b-instruct-1m',
        'qwen2.5-72b-instruct',
        'qwen2.5-32b-instruct',
        'qwen2.5-14b-instruct',
        'qwen2.5-7b-instruct',
        'qwen2.5-math-72b-instruct',
        'qwen2.5-math-7b-instruct',
        'qwen2.5-coder-32b-instruct',
        'qwen2.5-coder-14b-instruct',
        'qwen2.5-coder-7b-instruct',
        'codeqwen1.5-7b-chat',
      ],
    },
  },
  {
    providerId: 'doubao',
    providerLabel: 'Doubao (ByteDance)',
    models: [
      'doubao-seed-2-0-pro-260215',
      'doubao-seed-2-0-lite-260215',
      'doubao-seed-2-0-mini-260215',
      'doubao-seed-2-0-code-preview-260215',
      'doubao-seed-1-8-251228',
      'doubao-seed-code-preview-251028',
    ],
    methodModels: {
      api_key: [
        'doubao-seed-2-0-pro-260215',
        'doubao-seed-2-0-lite-260215',
        'doubao-seed-2-0-mini-260215',
        'doubao-seed-2-0-code-preview-260215',
        'doubao-seed-1-8-251228',
        'doubao-seed-code-preview-251028',
      ],
    },
  },
  {
    providerId: 'moonshot',
    providerLabel: 'Moonshot (Kimi)',
    models: [
      'kimi-k2.7-code',
      'kimi-k2.7-code-highspeed',
      'kimi-k2.6',
      'kimi-k2.5',
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
      'moonshot-v1-8k-vision-preview',
      'moonshot-v1-32k-vision-preview',
      'moonshot-v1-128k-vision-preview',
    ],
    methodModels: {
      api_key: [
        'kimi-k2.7-code',
        'kimi-k2.7-code-highspeed',
        'kimi-k2.6',
        'kimi-k2.5',
        'moonshot-v1-8k',
        'moonshot-v1-32k',
        'moonshot-v1-128k',
        'moonshot-v1-8k-vision-preview',
        'moonshot-v1-32k-vision-preview',
        'moonshot-v1-128k-vision-preview',
      ],
    },
  },
  {
    providerId: 'zai',
    providerLabel: 'Z.ai (GLM)',
    models: ['glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.5-flash'],
    methodModels: {
      api_key: ['glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.5-flash'],
    },
  },
];

function normalizeAgentId(agentId) {
  const id = String(agentId || '').trim();
  if (!id) return '';
  return id === 'resource' ? 'resource-provider' : id;
}

const AGENT_MEMORY_FOLDER_BY_ID = {
  designer: 'designer',
  orchestrator: 'orchestrator',
  programmer: 'programmer',
  'resource-provider': 'resource-provider',
};
const AGENT_MEMORY_FILES = [
  { name: 'memory_root.md', label: 'Long-term memory' },
  { name: 'memory_recent.md', label: 'Recent memory' },
];
const AGENT_MEMORY_READ_LIMIT = 2000;

const viewSettings = VIEW_SETTINGS;

const state = {
  zoom: 1,
  panX: 0,
  panY: 0,
  dragging: false,
  activeDragButton: null,
  pointerClientX: 0,
  pointerClientY: 0,
  autoPanRaf: null,
  autoPanLastTs: 0,
  dragMode: null, // 'pan' | 'node' | 'resize' | 'edge-endpoint' | 'edge-create' | 'select-box' | 'node-create' | 'mirror-create' | null
  draggedNodeId: null,
  draggedEdgeId: null,
  draggedEdgeEnd: null, // 'from' | 'to' | null
  edgeCreateFromNodeId: null,
  edgeCreateStartWorldX: 0,
  edgeCreateStartWorldY: 0,
  edgeCreateWorldX: 0,
  edgeCreateWorldY: 0,
  nodeCreateStartWorldX: 0,
  nodeCreateStartWorldY: 0,
  nodeCreateWorldX: 0,
  nodeCreateWorldY: 0,
  mirrorCreateSourceNodeId: null,
  mirrorCreateWorldX: 0,
  mirrorCreateWorldY: 0,
  nodeDragSnapshot: null,
  nodeDragPreviewDx: 0,
  nodeDragPreviewDy: 0,
  resizeHandle: null,
  resizeStartWorldX: 0,
  resizeStartWorldY: 0,
  resizeSnapshot: null,
  dragOffsetX: 0,
  dragOffsetY: 0,
  dragStartZoom: 1,
  dragStartW: 0,
  dragStartH: 0,
  dragMoved: false,
  suppressClick: false,
  pendingClickNodeId: null,
  pendingClickAction: null, // 'select' | 'deselect' | null
  nPressed: false,
  cPressed: false,
  mPressed: false,
  lastX: 0,
  lastY: 0,
  selectedNodeId: null,
  selectedNodeIds: new Set(),
  selectedEdgeId: null,
  selectionRectStartWorldX: 0,
  selectionRectStartWorldY: 0,
  selectionRectWorldX: 0,
  selectionRectWorldY: 0,
  selectionMode: 'replace', // 'replace' | 'add'
  collapsed: new Set(),
  sidebarCollapsed: false,
  leftPanelWidth: 280,

  activeLayer: 'L0',
  revision: 1,
  buildRunning: false,
  agentBusy: false,
  rightPanelWidth: 340,
  rightPanelCollapsed: false,

  projectFileTree: [],
  fileTreeLoading: false,
  fileTreeError: null,
  fileBrowserTab: 'all',

  pointerWorldX: null,
  pointerWorldY: null,
  pastePreviewActive: false,
  pastePreviewNodes: [],

  projectName: 'untitled',
  projectTemplate: {
    id: 'default-2layer-v1',
    version: 1,
    layers: ['L0', 'L1'],
    defaultActiveLayer: 'L0',
    agents: ['programmer'],
    promptProfile: 'minimized',
  },
  lastSaveFileName: null,
  currentProjectFileHandle: null,
  currentProjectDirHandle: null,
  projectRootPath: '',
  angelFilePath: '',

  transformSession: null,
  transformStretchDragging: false,
  transformStretchHandle: null,
  transformStretchBaseBox: null,
  transformStretchBaseById: null,
  transformBatchDragging: false,
  transformBatchStartWorldX: 0,
  transformBatchStartWorldY: 0,
  transformBatchBaseById: null,
};

const history = {
  past: [],
  future: [],
  max: 100,
};

const clipboard = {
  kind: null, // 'nodes' | null
  mode: null, // 'copy' | 'cut' | null
  nodes: [],
  edges: [],
  sourceSelectionIds: [],
  ts: 0,
};

const spriteBuildState = {
  frames: [],
  frameIndex: 0,
  previewRect: null,
};

const RESIZE_HANDLE_SIZE_PX = 8;

const fontBuildState = {
  fontFile: null,
  fontFamily: null,
  fontUrl: null,
  sourceKind: null,
};

let _seedCollapsedFileTreeImpl = () => {};
let _resetProjectFolderAssociationImpl = () => {};
let _getFileNameFromPathImpl = () => 'angel.json';
let _renderFileTreeImpl = () => {};
let _rebuildSidebarImpl = () => {};
let _refreshProjectFileTreeImpl = async () => {};
let _focusNodeImpl = () => {};
let _renderRightPanelImpl = () => {};
let _setEditorLockedImpl = () => {};
let _applyEdgeEditorChangesImpl = () => {};
let _addResourceBindingFromInspectorImpl = () => {};
let _applySelectedNodeChangesImpl = () => {};
let _applyMultiNodeColorChangeImpl = () => {};
let _renderAgentStatusBarImpl = () => {};
let _renderAgentSidebarImpl = () => {};
let _renderAgentTimelineImpl = () => {};
let _renderAgentTodoPanelImpl = () => {};
let _renderAgentCtxBarImpl = () => {};
let _syncContextLimitFromModelImpl = () => {};
let _syncAgentSendButtonImpl = () => {};
let _pushAgentMessageImpl = () => {};
let _formatSystemEventTextImpl = (text) => String(text || '');
let _initAgentChatWindowImpl = () => {};
let _resetAgentChatSessionsForNewProjectImpl = () => {};
let _persistAllAgentSessionSnapshotsImpl = async () => [];
let _closeAllMenusImpl = () => {};
let _runSaveImpl = async () => {};
let _applyProjectDataImpl = () => {};
let _runNewProjectImpl = async () => {};
let _runOpenProjectImpl = async () => {};
let _loadProjectFileImpl = async () => {};
let _loadProjectFromDirectoryImpl = async () => false;
let _setActiveLayerByIndexImpl = () => {};
let _runExecutionImpl = async () => {};
let _toggleRightPanelImpl = () => {};
let _toggleProjectBrowserImpl = () => {};
let _toggleAgentBarImpl = () => {};
let _openSpriteModalImpl = () => {};
let _closeSpriteModalImpl = () => {};
let _openFontModalImpl = () => {};
let _closeFontModalImpl = () => {};
let _closeRunTestModalImpl = () => {};
let _resolveRunTestModalImpl = () => {};
let _requestRunTestNameImpl = () => Promise.resolve(null);
let _requestRunTestOptionsImpl = () => Promise.resolve(null);
let _parseLayerIndexImpl = () => 0;
let _getActiveLayerIndexImpl = () => 0;
let _getCreatedLayerImpl = () => 0;
let _isNodeVisibleInLayerImpl = () => true;
let _isNodeVisibleInActiveLayerImpl = () => true;
let _isEdgeVisibleInLayerImpl = () => true;
let _isEdgeVisibleInActiveLayerImpl = () => true;
let _ensureNodeLayerFieldsImpl = () => {};
let _getNodeLayerContentImpl = () => ({});
let _validateContainmentLayerOrderImpl = () => null;
let _normalizeGraphSchemaImpl = () => {};
let _getNodesInRectImpl = () => [];
let _syncContainmentRelationsFromHierarchyImpl = () => {};
let _syncMirrorRelationsFromNodesImpl = () => {};
let _getRelationByIdImpl = () => null;
let _getSelectedEdgeImpl = () => null;
let _getNodeRelationsImpl = () => [];
let _getEdgeRelationExprImpl = () => 'A depends on B';
let _hasConflictImpl = () => false;
let _rectContainsRectImpl = () => false;
let _rectsIntersectImpl = () => false;
let _rectEqualsImpl = () => false;
let _rectStrictlyContainsRectImpl = () => false;
let _findSmallestContainerForRectImpl = () => null;
let _findSmallestStrictContainerForRectImpl = () => null;
let _recomputeAllContainmentFromGeometryImpl = () => {};
let _findIntersectionNodesImpl = () => [];
let _nodeIntersectsAnyImpl = () => false;
let _areSpatiallyCompatibleImpl = () => true;
let _findSpatialConflictImpl = () => null;
let _isPlacementLegalImpl = () => true;
let _getNodesBoundingRectImpl = () => null;
let _getSelectionBBoxFromSessionImpl = () => null;
let _applySelectionTransformByBoxesImpl = () => {};
let _getRectResizeHandlesImpl = () => [];
let _getRectResizeHandleAtImpl = () => null;
let _isPointInRectImpl = () => false;
let _deleteSelectedElementImpl = () => {};
let _deleteNodeByParamsImpl = () => ({ deleted: false });
let _deleteEdgeByParamsImpl = () => ({ deleted: false });
let _collectSelectedSubgraphImpl = () => null;
let _makeDuplicateIdImpl = () => '';
let _makeDuplicateNameImpl = () => '';
let _copySelectionToClipboardImpl = () => false;
let _cutSelectionToClipboardImpl = () => {};
let _getPasteAnchorWorldImpl = () => ({ x: 0, y: 0 });
let _buildClipboardDraftAtImpl = () => ({ pastedNodes: [], pastedEdges: [] });
let _updatePastePreviewImpl = () => {};
let _beginPastePreviewImpl = () => {};
let _finalizePasteFromPreviewImpl = () => {};
let _normalizeRectFromLrtbImpl = () => ({ x: 0, y: 0, w: 0, h: 0 });
let _normalizeResourceBindingsImpl = () => [];
let _createNodeAtPositionByParamsImpl = () => ({ created: false });
let _normalizeEdgeAnchorInputImpl = () => null;
let _createEdgeByParamsImpl = () => ({ created: false });
let _updateEdgeByParamsImpl = () => ({ updated: false });
let _normalizeMirrorTopLeftImpl = () => ({ left: 0, top: 0 });
let _createMirrorByParamsImpl = () => ({ created: false });
let _isPlacementLegalForNodeImpl = () => false;
let _updateNodeByParamsImpl = () => ({ updated: false });
let _getNodeByNameStrictImpl = () => null;
let _hasIllegalOverlapInRectSetImpl = () => null;
let _arrangeNodesGridByParamsImpl = () => ({ arranged: false });
let _scaleSelectionUniformImpl = () => {};
let _rotateOrFlipSelectionImpl = () => {};
let _getNodeScreenAreaPx2Impl = () => 0;
let _getNodeLodLevelImpl = () => 'detail';
let _drawEdgeImpl = () => {};
let _drawNodeImpl = () => {};
let _renderCanvasOverlaysImpl = () => {};
let _renderGraphSceneItemsImpl = () => {};
let _renderImpl = () => {};
let _resizeCanvasToDisplayImpl = () => {};
let _getAnchorWorldImpl = () => ({ x: 0, y: 0 });
let _projectToNodeEdgeImpl = () => ({ side: 'right', t: 0.5 });
let _projectToNodeEdgeByRayImpl = () => ({ side: 'right', t: 0.5 });
let _getEdgeStrokeDashImpl = () => [];
let _bezierPointImpl = () => ({ x: 0, y: 0 });
let _getAnchorDirectionImpl = () => ({ x: 1, y: 0 });
let _getEdgePolylineWorldImpl = () => [];
let _getPointerWorldFromClientImpl = () => ({ sx: 0, sy: 0, world: { x: 0, y: 0 } });
let _getCanvasPointerImpl = () => ({ sx: 0, sy: 0, world: { x: 0, y: 0 } });
let _getResizeHandleAtImpl = () => null;
let _getResizeHitImpl = () => null;
let _getCursorForHandleImpl = () => 'grab';
let _getEdgeEndpointHitImpl = () => null;
let _getEdgeBodyHitImpl = () => null;
let _pickTopNodeAtPointImpl = () => null;
let _hitTestImpl = () => null;
let _getAutoPanVelocityImpl = () => ({ vx: 0, vy: 0 });
let _shouldAutoPanNowImpl = () => false;
let _ensureAutoPanLoopImpl = () => {};
let _handlePointerMoveImpl = () => {};
let _handlePointerDownImpl = () => {};
let _handlePointerUpImpl = () => {};
let _handleCanvasClickImpl = () => {};
let _handleCanvasDoubleClickImpl = () => {};
let _handleCanvasWheelImpl = () => {};
let _handleKeyDownImpl = () => {};
let _handleKeyUpImpl = () => {};
let _handleWindowBlurImpl = () => {};

function seedCollapsedFileTree(...args) { return _seedCollapsedFileTreeImpl(...args); }
function resetProjectFolderAssociation(...args) { return _resetProjectFolderAssociationImpl(...args); }
function getFileNameFromPath(...args) { return _getFileNameFromPathImpl(...args); }
function renderFileTree(...args) { return _renderFileTreeImpl(...args); }
function rebuildSidebar(...args) { return _rebuildSidebarImpl(...args); }
function refreshProjectFileTree(...args) { return _refreshProjectFileTreeImpl(...args); }
function focusNode(...args) { return _focusNodeImpl(...args); }
function renderRightPanel(...args) { return _renderRightPanelImpl(...args); }
function setEditorLocked(...args) { return _setEditorLockedImpl(...args); }
function applyEdgeEditorChanges(...args) { return _applyEdgeEditorChangesImpl(...args); }
function addResourceBindingFromInspector(...args) { return _addResourceBindingFromInspectorImpl(...args); }
function applySelectedNodeChanges(...args) { return _applySelectedNodeChangesImpl(...args); }
function applyMultiNodeColorChange(...args) { return _applyMultiNodeColorChangeImpl(...args); }
function renderAgentStatusBar(...args) { return _renderAgentStatusBarImpl(...args); }
function renderAgentSidebar(...args) { return _renderAgentSidebarImpl(...args); }
function renderAgentTimeline(...args) { return _renderAgentTimelineImpl(...args); }
function renderAgentTodoPanel(...args) { return _renderAgentTodoPanelImpl(...args); }
function renderAgentCtxBar(...args) { return _renderAgentCtxBarImpl(...args); }
function syncAgentSendButton(...args) { return _syncAgentSendButtonImpl(...args); }
function pushAgentMessage(...args) {
  const result = _pushAgentMessageImpl(...args);
  const role = String(args?.[1] || '').trim();
  const options = args?.[3] && typeof args[3] === 'object' ? args[3] : null;
  const isRecoveryInjected = Boolean(options?.recoveryInjected) || String(options?.messageKind || '').trim() === 'recovery';
  if (role && role !== 'thinking' && !(role === 'developer' && isRecoveryInjected)) {
    setAgentSessionDirty(true);
  }
  return result;
}
function formatSystemEventText(...args) { return _formatSystemEventTextImpl(...args); }
function initAgentChatWindow(...args) { return _initAgentChatWindowImpl(...args); }
function resetAgentChatSessionsForNewProject(...args) { return _resetAgentChatSessionsForNewProjectImpl(...args); }
function persistAllAgentSessionSnapshots(...args) { return _persistAllAgentSessionSnapshotsImpl(...args); }
function closeAllMenus(...args) { return _closeAllMenusImpl(...args); }
async function runSave(...args) {
  const result = await _runSaveImpl(...args);
  await persistAllAgentSessionSnapshots();
  if (getUnsavedCount() === 0) setAgentSessionDirty(false);
  return result;
}
function applyProjectData(...args) { return _applyProjectDataImpl(...args); }
function runNewProject(...args) { return _runNewProjectImpl(...args); }
function runOpenProject(...args) { return _runOpenProjectImpl(...args); }
function loadProjectFile(...args) { return _loadProjectFileImpl(...args); }
function loadProjectFromDirectory(...args) { return _loadProjectFromDirectoryImpl(...args); }
function setActiveLayerByIndex(...args) { return _setActiveLayerByIndexImpl(...args); }
function runExecution(...args) { return _runExecutionImpl(...args); }
function toggleRightPanel(...args) { return _toggleRightPanelImpl(...args); }
function toggleProjectBrowser(...args) { return _toggleProjectBrowserImpl(...args); }
function toggleAgentBar(...args) { return _toggleAgentBarImpl(...args); }
function openSpriteModal(...args) { return _openSpriteModalImpl(...args); }
function closeSpriteModal(...args) { return _closeSpriteModalImpl(...args); }
function openFontModal(...args) { return _openFontModalImpl(...args); }
function closeFontModal(...args) { return _closeFontModalImpl(...args); }
function closeRunTestModal(...args) { return _closeRunTestModalImpl(...args); }
function resolveRunTestModal(...args) { return _resolveRunTestModalImpl(...args); }
function requestRunTestName(...args) { return _requestRunTestNameImpl(...args); }
function requestRunTestOptions(...args) { return _requestRunTestOptionsImpl(...args); }
function parseLayerIndex(...args) { return _parseLayerIndexImpl(...args); }
function getActiveLayerIndex(...args) { return _getActiveLayerIndexImpl(...args); }
function getCreatedLayer(...args) { return _getCreatedLayerImpl(...args); }
function isNodeVisibleInLayer(...args) { return _isNodeVisibleInLayerImpl(...args); }
function isNodeVisibleInActiveLayer(...args) { return _isNodeVisibleInActiveLayerImpl(...args); }
function isEdgeVisibleInLayer(...args) { return _isEdgeVisibleInLayerImpl(...args); }
function isEdgeVisibleInActiveLayer(...args) { return _isEdgeVisibleInActiveLayerImpl(...args); }
function ensureNodeLayerFields(...args) { return _ensureNodeLayerFieldsImpl(...args); }
function getNodeLayerContent(...args) { return _getNodeLayerContentImpl(...args); }
function validateContainmentLayerOrder(...args) { return _validateContainmentLayerOrderImpl(...args); }
function normalizeGraphSchema(...args) { return _normalizeGraphSchemaImpl(...args); }
function getNodesInRect(...args) { return _getNodesInRectImpl(...args); }
function syncContainmentRelationsFromHierarchy(...args) { return _syncContainmentRelationsFromHierarchyImpl(...args); }
function syncMirrorRelationsFromNodes(...args) { return _syncMirrorRelationsFromNodesImpl(...args); }
function getRelationById(...args) { return _getRelationByIdImpl(...args); }
function getSelectedEdge(...args) { return _getSelectedEdgeImpl(...args); }
function getNodeRelations(...args) { return _getNodeRelationsImpl(...args); }
function getEdgeRelationExpr(...args) { return _getEdgeRelationExprImpl(...args); }
function hasConflict(...args) { return _hasConflictImpl(...args); }
function rectContainsRect(...args) { return _rectContainsRectImpl(...args); }
function rectsIntersect(...args) { return _rectsIntersectImpl(...args); }
function rectEquals(...args) { return _rectEqualsImpl(...args); }
function rectStrictlyContainsRect(...args) { return _rectStrictlyContainsRectImpl(...args); }
function findSmallestContainerForRect(...args) { return _findSmallestContainerForRectImpl(...args); }
function findSmallestStrictContainerForRect(...args) { return _findSmallestStrictContainerForRectImpl(...args); }
function recomputeAllContainmentFromGeometry(...args) { return _recomputeAllContainmentFromGeometryImpl(...args); }
function findIntersectionNodes(...args) { return _findIntersectionNodesImpl(...args); }
function nodeIntersectsAny(...args) { return _nodeIntersectsAnyImpl(...args); }
function areSpatiallyCompatible(...args) { return _areSpatiallyCompatibleImpl(...args); }
function findSpatialConflict(...args) { return _findSpatialConflictImpl(...args); }
function isPlacementLegal(...args) { return _isPlacementLegalImpl(...args); }
function getNodesBoundingRect(...args) { return _getNodesBoundingRectImpl(...args); }
function getSelectionBBoxFromSession(...args) { return _getSelectionBBoxFromSessionImpl(...args); }
function applySelectionTransformByBoxes(...args) { return _applySelectionTransformByBoxesImpl(...args); }
function getRectResizeHandles(...args) { return _getRectResizeHandlesImpl(...args); }
function getRectResizeHandleAt(...args) { return _getRectResizeHandleAtImpl(...args); }
function isPointInRect(...args) { return _isPointInRectImpl(...args); }
function deleteSelectedElement(...args) { return _deleteSelectedElementImpl(...args); }
function deleteNodeByParams(...args) { return _deleteNodeByParamsImpl(...args); }
function deleteEdgeByParams(...args) { return _deleteEdgeByParamsImpl(...args); }
function collectSelectedSubgraph(...args) { return _collectSelectedSubgraphImpl(...args); }
function makeDuplicateId(...args) { return _makeDuplicateIdImpl(...args); }
function makeDuplicateName(...args) { return _makeDuplicateNameImpl(...args); }
function copySelectionToClipboard(...args) { return _copySelectionToClipboardImpl(...args); }
function cutSelectionToClipboard(...args) { return _cutSelectionToClipboardImpl(...args); }
function getPasteAnchorWorld(...args) { return _getPasteAnchorWorldImpl(...args); }
function buildClipboardDraftAt(...args) { return _buildClipboardDraftAtImpl(...args); }
function updatePastePreview(...args) { return _updatePastePreviewImpl(...args); }
function beginPastePreview(...args) { return _beginPastePreviewImpl(...args); }
function finalizePasteFromPreview(...args) { return _finalizePasteFromPreviewImpl(...args); }
function normalizeRectFromLrtb(...args) { return _normalizeRectFromLrtbImpl(...args); }
function normalizeResourceBindings(...args) { return _normalizeResourceBindingsImpl(...args); }
function createNodeAtPositionByParams(...args) { return _createNodeAtPositionByParamsImpl(...args); }
function normalizeEdgeAnchorInput(...args) { return _normalizeEdgeAnchorInputImpl(...args); }
function createEdgeByParams(...args) { return _createEdgeByParamsImpl(...args); }
function updateEdgeByParams(...args) { return _updateEdgeByParamsImpl(...args); }
function normalizeMirrorTopLeft(...args) { return _normalizeMirrorTopLeftImpl(...args); }
function createMirrorByParams(...args) { return _createMirrorByParamsImpl(...args); }
function isPlacementLegalForNode(...args) { return _isPlacementLegalForNodeImpl(...args); }
function updateNodeByParams(...args) { return _updateNodeByParamsImpl(...args); }
function getNodeByNameStrict(...args) { return _getNodeByNameStrictImpl(...args); }
function hasIllegalOverlapInRectSet(...args) { return _hasIllegalOverlapInRectSetImpl(...args); }
function arrangeNodesGridByParams(...args) { return _arrangeNodesGridByParamsImpl(...args); }
function scaleSelectionUniform(...args) { return _scaleSelectionUniformImpl(...args); }
function rotateOrFlipSelection(...args) { return _rotateOrFlipSelectionImpl(...args); }
function getNodeScreenAreaPx2(...args) { return _getNodeScreenAreaPx2Impl(...args); }
function getNodeLodLevel(...args) { return _getNodeLodLevelImpl(...args); }
function drawEdge(...args) { return _drawEdgeImpl(...args); }
function drawNode(...args) { return _drawNodeImpl(...args); }
function renderCanvasOverlays(...args) { return _renderCanvasOverlaysImpl(...args); }
function renderGraphSceneItems(...args) { return _renderGraphSceneItemsImpl(...args); }
function render(...args) { return _renderImpl(...args); }
// Coalesce burst-y interaction redraws (high-frequency pointer move / wheel)
// into a single draw per animation frame. State logic is unaffected — only the
// draw is deferred — so this is safe for any caller that doesn't read canvas
// pixels synchronously right after.
let _renderRafScheduled = false;
function scheduleRender() {
  if (_renderRafScheduled) return;
  _renderRafScheduled = true;
  requestAnimationFrame(() => {
    _renderRafScheduled = false;
    render();
  });
}
function resizeCanvasToDisplay(...args) { return _resizeCanvasToDisplayImpl(...args); }
function getAnchorWorld(...args) { return _getAnchorWorldImpl(...args); }
function projectToNodeEdge(...args) { return _projectToNodeEdgeImpl(...args); }
function projectToNodeEdgeByRay(...args) { return _projectToNodeEdgeByRayImpl(...args); }
function getEdgeStrokeDash(...args) { return _getEdgeStrokeDashImpl(...args); }
function bezierPoint(...args) { return _bezierPointImpl(...args); }
function getAnchorDirection(...args) { return _getAnchorDirectionImpl(...args); }
function getEdgePolylineWorld(...args) { return _getEdgePolylineWorldImpl(...args); }
function getPointerWorldFromClient(...args) { return _getPointerWorldFromClientImpl(...args); }
function getCanvasPointer(...args) { return _getCanvasPointerImpl(...args); }
function getResizeHandleAt(...args) { return _getResizeHandleAtImpl(...args); }
function getResizeHit(...args) { return _getResizeHitImpl(...args); }
function getCursorForHandle(...args) { return _getCursorForHandleImpl(...args); }
function getEdgeEndpointHit(...args) { return _getEdgeEndpointHitImpl(...args); }
function getEdgeBodyHit(...args) { return _getEdgeBodyHitImpl(...args); }
function pickTopNodeAtPoint(...args) { return _pickTopNodeAtPointImpl(...args); }
function hitTest(...args) { return _hitTestImpl(...args); }
function getAutoPanVelocity(...args) { return _getAutoPanVelocityImpl(...args); }
function shouldAutoPanNow(...args) { return _shouldAutoPanNowImpl(...args); }
function ensureAutoPanLoop(...args) { return _ensureAutoPanLoopImpl(...args); }
function handlePointerMove(...args) { return _handlePointerMoveImpl(...args); }
function handlePointerDown(...args) { return _handlePointerDownImpl(...args); }
function handlePointerUp(...args) { return _handlePointerUpImpl(...args); }
function handleCanvasClick(...args) { return _handleCanvasClickImpl(...args); }
function handleCanvasDoubleClick(...args) { return _handleCanvasDoubleClickImpl(...args); }
function handleCanvasWheel(...args) { return _handleCanvasWheelImpl(...args); }
function handleKeyDown(...args) { return _handleKeyDownImpl(...args); }
function handleKeyUp(...args) { return _handleKeyUpImpl(...args); }
function handleWindowBlur(...args) { return _handleWindowBlurImpl(...args); }

const appShellUI = createAppShellUI({
  window,
  document,
  state,
  nodes,
  conflicts,
  spriteBuildState,
  spritePreviewCanvas,
  spriteFrameLabel,
  spritePivotXInput,
  spritePivotYInput,
  chipRevision,
  chipUnsaved,
  chipConflicts,
  chipAgent,
  menuSave,
  menuCompile,
  menuRun,
  menuRunTest,
  menuExportRelease,
  conflictList,
  leftSidebar,
  sidebarControls,
  fileBrowserTabs,
  getUnsavedCount: () => getUnsavedCount(),
  getConflictCount: () => getConflictCount(),
  isNodeVisibleInActiveLayer,
  getNodeLodLevel,
  cssVar,
  MIN_NODE_SCREEN_PX,
  t,
});

const {
  getUnsavedCount,
  isNodeNameAvailable,
  nextAvailableMirrorName,
  isMirrorNode,
  syncMirrorNodes,
} = createGraphHelpers({ nodes });

const {
  deepClone,
  replaceArray,
  takeSnapshot,
  restoreSnapshot,
  pushHistory,
  undo,
  redo,
  getConflictCount,
  getSelectedNode,
  normalizeSelectedNodeIds,
  setSingleNodeSelection: baseSetSingleNodeSelection,
  getSelectionRectWorld,
} = createStateHelpers({
  nodes,
  edges,
  conflicts,
  state,
  history,
  layerSelect,
  refreshHierarchyMeta,
  updateTopbar,
  rebuildSidebar,
  renderConflicts,
  render,
  renderRightPanel,
  setStatus,
  rebuildNodeIndex: nodeIndex.rebuild,
});

function flushInspectorPendingEdits() {
  if (state.selectedNodeId) {
    applySelectedNodeChanges();
  } else if (state.selectedEdgeId) {
    applyEdgeEditorChanges();
  }
}

function setSingleNodeSelection(nodeId) {
  const nextNodeId = nodeId || null;
  if (state.selectedNodeId !== nextNodeId || state.selectedEdgeId) {
    flushInspectorPendingEdits();
  }
  baseSetSingleNodeSelection(nextNodeId);
}

function setSingleEdgeSelection(edgeId) {
  const nextEdgeId = edgeId || null;
  if (state.selectedEdgeId !== nextEdgeId || state.selectedNodeId || state.selectedNodeIds.size > 0) {
    flushInspectorPendingEdits();
  }
  state.selectedEdgeId = nextEdgeId;
  state.selectedNodeIds = new Set();
  state.selectedNodeId = null;
}

function makeContainmentRelationId(fromId, toId) {
  return `c_${fromId}_${toId}`;
}

function makeMirrorRelationId(fromId, toId) {
  return `m_${fromId}_${toId}`;
}

let graphLocalHelpers = null;

function getSelectedNodesOrdered() {
  return graphLocalHelpers.getSelectedNodesOrdered();
}

function inferLayoutDirectionFromSelection() {
  return graphLocalHelpers.inferLayoutDirectionFromSelection();
}

let previewElkLayoutInSelection = async () => {};

const graphGeometry = createGraphGeometry({
  state,
  nodes,
  RESIZE_HANDLE_SIZE_PX,
});
_rectContainsRectImpl = graphGeometry.rectContainsRect;
_rectsIntersectImpl = graphGeometry.rectsIntersect;
_rectEqualsImpl = graphGeometry.rectEquals;
_rectStrictlyContainsRectImpl = graphGeometry.rectStrictlyContainsRect;
_findSmallestContainerForRectImpl = graphGeometry.findSmallestContainerForRect;
_findSmallestStrictContainerForRectImpl = graphGeometry.findSmallestStrictContainerForRect;
_recomputeAllContainmentFromGeometryImpl = graphGeometry.recomputeAllContainmentFromGeometry;
_findIntersectionNodesImpl = graphGeometry.findIntersectionNodes;
_nodeIntersectsAnyImpl = graphGeometry.nodeIntersectsAny;
_areSpatiallyCompatibleImpl = graphGeometry.areSpatiallyCompatible;
_findSpatialConflictImpl = graphGeometry.findSpatialConflict;
_isPlacementLegalImpl = graphGeometry.isPlacementLegal;
_getNodesBoundingRectImpl = graphGeometry.getNodesBoundingRect;
_getSelectionBBoxFromSessionImpl = graphGeometry.getSelectionBBoxFromSession;
_applySelectionTransformByBoxesImpl = graphGeometry.applySelectionTransformByBoxes;
_getRectResizeHandlesImpl = graphGeometry.getRectResizeHandles;
_getRectResizeHandleAtImpl = graphGeometry.getRectResizeHandleAt;
_isPointInRectImpl = graphGeometry.isPointInRect;

const graphDomain = createGraphDomain({
  state,
  nodes,
  edges,
  containmentRelations,
  mirrorRelations,
  conflicts,
  isMirrorNode,
  getNodeLodLevel,
  rectContainsRect,
  getNodeById: nodeIndex.getNodeById,
});
_parseLayerIndexImpl = graphDomain.parseLayerIndex;
_getActiveLayerIndexImpl = graphDomain.getActiveLayerIndex;
_getCreatedLayerImpl = graphDomain.getCreatedLayer;
_isNodeVisibleInLayerImpl = graphDomain.isNodeVisibleInLayer;
_isNodeVisibleInActiveLayerImpl = graphDomain.isNodeVisibleInActiveLayer;
_isEdgeVisibleInLayerImpl = graphDomain.isEdgeVisibleInLayer;
_isEdgeVisibleInActiveLayerImpl = graphDomain.isEdgeVisibleInActiveLayer;
_ensureNodeLayerFieldsImpl = graphDomain.ensureNodeLayerFields;
_getNodeLayerContentImpl = graphDomain.getNodeLayerContent;
_validateContainmentLayerOrderImpl = graphDomain.validateContainmentLayerOrder;
_normalizeGraphSchemaImpl = graphDomain.normalizeGraphSchema;
_getNodesInRectImpl = graphDomain.getNodesInRect;
_syncContainmentRelationsFromHierarchyImpl = graphDomain.syncContainmentRelationsFromHierarchy;
_syncMirrorRelationsFromNodesImpl = graphDomain.syncMirrorRelationsFromNodes;
_getRelationByIdImpl = graphDomain.getRelationById;
_getSelectedEdgeImpl = graphDomain.getSelectedEdge;
_getNodeRelationsImpl = graphDomain.getNodeRelations;
_getEdgeRelationExprImpl = graphDomain.getEdgeRelationExpr;
_hasConflictImpl = graphDomain.hasConflict;

const { worldToScreen, screenToWorld } = createCanvasCoordinates(state);

const editClipboardCommands = createEditClipboardCommands({
  state,
  history,
  clipboard,
  nodes,
  edges,
  conflicts,
  canvas,
  normalizeSelectedNodeIds,
  getSelectedNode,
  getSelectedEdge,
  pushHistory,
  recomputeAllContainmentFromGeometry,
  validateContainmentLayerOrder,
  getDescendantNodes,
  deepClone,
  getActiveLayerIndex,
  ensureNodeLayerFields,
  isPlacementLegal,
  restoreSnapshot,
  updateTopbar,
  rebuildSidebar,
  refreshHierarchyMeta,
  render,
  renderRightPanel,
  screenToWorld,
  setStatus,
});
_deleteSelectedElementImpl = editClipboardCommands.deleteSelectedElement;
_deleteNodeByParamsImpl = editClipboardCommands.deleteNodeByParams;
_deleteEdgeByParamsImpl = editClipboardCommands.deleteEdgeByParams;
_collectSelectedSubgraphImpl = editClipboardCommands.collectSelectedSubgraph;
_makeDuplicateIdImpl = editClipboardCommands.makeDuplicateId;
_makeDuplicateNameImpl = editClipboardCommands.makeDuplicateName;
_copySelectionToClipboardImpl = editClipboardCommands.copySelectionToClipboard;
_cutSelectionToClipboardImpl = editClipboardCommands.cutSelectionToClipboard;
_getPasteAnchorWorldImpl = editClipboardCommands.getPasteAnchorWorld;
_buildClipboardDraftAtImpl = editClipboardCommands.buildClipboardDraftAt;
_updatePastePreviewImpl = editClipboardCommands.updatePastePreview;
_beginPastePreviewImpl = editClipboardCommands.beginPastePreview;
_finalizePasteFromPreviewImpl = editClipboardCommands.finalizePasteFromPreview;

const editNodeCreateCommand = createEditNodeCreateCommand({
  state,
  history,
  nodes,
  pushHistory,
  restoreSnapshot,
  setSingleNodeSelection,
  updateTopbar,
  rebuildSidebar,
  renderRightPanel,
  render,
  normalizeLayerId,
  parseLayerIndex,
  normalizeColorIndex,
  nextNodeId,
  isNodeNameAvailable,
  findSmallestContainerForRect,
  isPlacementLegal,
  validateContainmentLayerOrder,
  recomputeAllContainmentFromGeometry,
  getAllLayerIds: () => state.projectTemplate.layers,
});
_normalizeRectFromLrtbImpl = editNodeCreateCommand.normalizeRectFromLrtb;
_normalizeResourceBindingsImpl = editNodeCreateCommand.normalizeResourceBindings;
_createNodeAtPositionByParamsImpl = editNodeCreateCommand.createNodeAtPositionByParams;

const editEdgeCommand = createEditEdgeCommand({
  state,
  nodes,
  edges,
  pushHistory,
  updateTopbar,
  rebuildSidebar,
  renderRightPanel,
  render,
  normalizeLayerId,
  parseLayerIndex,
  nextEdgeId,
  clamp01,
  findNodeByNameForRequestedLayers,
  buildEdgeAnchors,
});
_normalizeEdgeAnchorInputImpl = editEdgeCommand.normalizeEdgeAnchorInput;
_createEdgeByParamsImpl = editEdgeCommand.createEdgeByParams;

const editMirrorUpdateCommands = createEditMirrorUpdateCommands({
  state,
  history,
  nodes,
  pushHistory,
  restoreSnapshot,
  setSingleNodeSelection,
  updateTopbar,
  rebuildSidebar,
  renderRightPanel,
  render,
  normalizeLayerId,
  parseLayerIndex,
  normalizeColorIndex,
  nextNodeId,
  isNodeNameAvailable,
  nextAvailableMirrorName,
  isPlacementLegal,
  validateContainmentLayerOrder,
  recomputeAllContainmentFromGeometry,
  getNodeLayerContent,
  MIRROR_DEFAULT_DETAIL,
  normalizeResourceBindings,
  normalizeRectFromLrtb,
  findNodeByNameForRequestedLayers,
  getActiveLayerIndex,
  isNodeVisibleInLayer,
  rectEquals,
  rectsIntersect,
  rectContainsRect,
  getAllLayerIds: () => state.projectTemplate.layers,
});
_normalizeMirrorTopLeftImpl = editMirrorUpdateCommands.normalizeMirrorTopLeft;
_createMirrorByParamsImpl = editMirrorUpdateCommands.createMirrorByParams;
_isPlacementLegalForNodeImpl = editMirrorUpdateCommands.isPlacementLegalForNode;
_updateNodeByParamsImpl = editMirrorUpdateCommands.updateNodeByParams;
_getNodeByNameStrictImpl = editMirrorUpdateCommands.getNodeByNameStrict;

const editArrangeCommands = createEditArrangeCommands({
  state,
  history,
  nodes,
  pushHistory,
  restoreSnapshot,
  updateTopbar,
  rebuildSidebar,
  renderRightPanel,
  render,
  normalizeRectFromLrtb,
  getNodeByNameStrict,
  buildNodeLrtb,
  rectsIntersect,
  rectContainsRect,
  recomputeAllContainmentFromGeometry,
  validateContainmentLayerOrder,
});
_hasIllegalOverlapInRectSetImpl = editArrangeCommands.hasIllegalOverlapInRectSet;
_arrangeNodesGridByParamsImpl = editArrangeCommands.arrangeNodesGridByParams;

const editTransformCommands = createEditTransformCommands({
  edges,
  getSelectedNodesOrdered,
  getNodesBoundingRect,
  getAnchorWorld,
  projectToNodeEdge,
  render,
});
_scaleSelectionUniformImpl = editTransformCommands.scaleSelectionUniform;
_rotateOrFlipSelectionImpl = editTransformCommands.rotateOrFlipSelection;

const transformSessionController = createTransformSessionController({
  nodes,
  edges,
  state,
  takeSnapshot,
  restoreSnapshot,
  setStatus,
  render,
  getSelectionBBoxFromSession,
  recomputeAllContainmentFromGeometry,
  findSpatialConflict,
  validateContainmentLayerOrder,
  pushHistory,
  updateTopbar,
  rebuildSidebar,
  renderRightPanel,
});

const {
  beginTransformSession,
  cancelTransformSession,
  pushTransformPreviewCheckpoint,
  undoWithinTransformSessionOrExit,
  redoWithinTransformSession,
  finalizeTransformSession,
} = transformSessionController;

function getDescendantNodes(parentId) {
  return graphLocalHelpers.getDescendantNodes(parentId);
}

function computeNodeDepthMap() {
  return graphLocalHelpers.computeNodeDepthMap();
}

function refreshHierarchyMeta() {
  return graphLocalHelpers.refreshHierarchyMeta();
}

function nextNodeId() {
  const max = nodes.reduce((m, n) => Math.max(m, Number(String(n.id).replace(/^n/, '')) || 0), 0);
  return `n${max + 1}`;
}

function nextEdgeId() {
  const max = edges.reduce((m, e) => Math.max(m, Number(String(e.id).replace(/^e/, '')) || 0), 0);
  return `e${max + 1}`;
}

function buildEdgeAnchors(fromNode, toNode, startWorld, endWorld) {
  return graphLocalHelpers.buildEdgeAnchors(fromNode, toNode, startWorld, endWorld);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function getSavedAppFont(locale) {
  const key = locale ? `app-font-family:${locale}` : 'app-font-family';
  try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
}
function saveAppFont(locale, family) {
  const key = locale ? `app-font-family:${locale}` : 'app-font-family';
  try { localStorage.setItem(key, String(family || '')); } catch (_) {}
}
function applyAppFont(family) {
  const f = String(family || '').trim();
  // Set on documentElement (not body) so canvas code can read it via cssVar,
  // which resolves against document.documentElement. The DOM still inherits it.
  if (f) document.documentElement.style.setProperty('--app-font-family', `'${f}', sans-serif`);
  else document.documentElement.style.removeProperty('--app-font-family');
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
    normalized.push({ family, fullName: String(entry?.fullName || family).trim() || family });
  }
  normalized.sort((a, b) => a.family.localeCompare(b.family));
  return normalized;
}

async function refreshLanguageFontOptions(locale) {
  if (!languageFontSelect) return;
  const targetLocale = locale || String(languageSelect?.value || getSavedLocale());
  let fonts = [];
  try { fonts = await listSystemFonts(); } catch (_) {}
  const saved = getSavedAppFont(targetLocale);
  const prev = String(saved);
  languageFontSelect.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = t('modal.language.fontDefault');
  languageFontSelect.appendChild(defaultOpt);
  for (const font of fonts) {
    const opt = document.createElement('option');
    opt.value = font.family;
    opt.textContent = font.fullName && font.fullName !== font.family
      ? `${font.family} — ${font.fullName}`
      : font.family;
    languageFontSelect.appendChild(opt);
  }
  if (prev && Array.from(languageFontSelect.options).some((o) => o.value === prev)) {
    languageFontSelect.value = prev;
  } else {
    languageFontSelect.value = '';
  }
}

async function applyLocale(locale) {
  await initI18n(locale);
  applyTranslations(document);
  if (languageSelect) languageSelect.value = locale;
  applyAppFont(getSavedAppFont(locale));
  appShellUI.updateTopbar();
  renderAgentStatusBar();
  renderAgentSidebar();
  renderAgentCtxBar();
  renderAgentTodoPanel();
  syncAgentSendButton();
  rebuildSidebar();
  renderRightPanel();
}

function openLanguageModal() {
  if (!languageModal) return;
  if (languageSelect) languageSelect.value = getSavedLocale();
  languageModal.classList.remove('hidden');
  languageModal.setAttribute('aria-hidden', 'false');
  refreshLanguageFontOptions(getSavedLocale());
}

if (languageSelect) {
  languageSelect.addEventListener('change', () => {
    refreshLanguageFontOptions(languageSelect.value);
  });
}

function closeLanguageModal() {
  if (!languageModal) return;
  languageModal.classList.add('hidden');
  languageModal.setAttribute('aria-hidden', 'true');
}

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Per-model reasoning options. Each option carries a provider-native payload
// fragment that is deep-merged into the outgoing request as-is (no runtime
// mapping layer). `fragment: null` means "send nothing / follow model default".
// Selections are stored keyed by model id (see normalizeAgentModelSettings), so
// switching model naturally surfaces that model's own saved choice. Resolvers are
// model-aware so per-model exceptions (which models support which knobs) live
// here, in the catalog, not in the request-assembly code.
const AGENT_REASONING_OPTIONS = {
  // Z.ai / GLM (chat kind): top-level thinking + reasoning_effort.
  zai() {
    return [
      { value: '', label: 'Default (follow model)', fragment: null },
      { value: 'off', label: 'Thinking off', fragment: { thinking: { type: 'disabled' } } },
      { value: 'max', label: 'Max reasoning', fragment: { reasoning_effort: 'max' } },
    ];
  },

  // OpenAI (Responses kind): reasoning.effort. Only the GPT-5 family reasoning
  // models accept it; GPT-4* (gpt-4.1/gpt-4o/gpt-4) do not -> no options.
  openai(model) {
    if (!/^gpt-5/.test(String(model || ''))) return [];
    const effort = (v, label) => ({ value: v, label, fragment: { reasoning: { effort: v } } });
    return [
      { value: '', label: 'Default (medium)', fragment: null },
      effort('minimal', 'Minimal'),
      effort('low', 'Low'),
      effort('medium', 'Medium'),
      effort('high', 'High'),
    ];
  },

  // Anthropic (Messages kind): adaptive thinking is OFF by default and supported
  // on Opus 4.7/4.8 and Sonnet 4.6. Haiku 4.5 uses a different enabled+budget
  // shape coupled to max_tokens, so it's deferred (no options for now).
  anthropic(model) {
    const m = String(model || '');
    const supportsAdaptive = m.startsWith('claude-opus-4-7')
      || m.startsWith('claude-opus-4-8')
      || m.startsWith('claude-sonnet-4-6');
    if (!supportsAdaptive) return [];
    return [
      { value: '', label: 'Default (off)', fragment: null },
      { value: 'adaptive', label: 'Adaptive thinking', fragment: { thinking: { type: 'adaptive' } } },
    ];
  },

  // Google Gemini 3 (generateContent kind): generationConfig.thinkingConfig.
  // thinkingLevel. Pro models cannot disable thinking (no minimal); Flash and
  // Flash-Lite can go minimal.
  google(model) {
    const m = String(model || '');
    const level = (v, label) => ({
      value: v,
      label,
      fragment: { generationConfig: { thinkingConfig: { thinkingLevel: v } } },
    });
    const base = [{ value: '', label: 'Default (follow model)', fragment: null }];
    if (m.includes('-pro')) {
      return [...base, level('low', 'Low'), level('medium', 'Medium'), level('high', 'High')];
    }
    return [...base, level('minimal', 'Minimal'), level('low', 'Low'), level('medium', 'Medium'), level('high', 'High')];
  },
};

function getReasoningOptionsForModel(providerId, model) {
  const resolver = AGENT_REASONING_OPTIONS[String(providerId || '')];
  return (typeof resolver === 'function' ? resolver(model) : []) || [];
}

// Per-turn tool-call round cap (the "normal" agent loop limit).
const DEFAULT_AGENT_MAX_LOOP_ROUNDS = 50;
// Cumulative tool-call round budget for the whole "run until todos done" loop.
const DEFAULT_AGENT_TODO_LOOP_MAX_ROUNDS = 100;

// Built-in CLI sub-agent profiles (the second model-interaction line). The
// subscription profile passes no env; domestic Claude-compatible providers are
// reached purely by env override (base URL + token the user fills in). Base URLs
// are best-known presets and are user-editable. `activeCliProfileId === ''` means
// the API-key (HTTP) line is active; a non-empty id selects a CLI profile.
const BUILTIN_CLI_PROFILES = [
  { id: 'claude-sub', driver: 'claude-code', label: 'Claude Code (subscription)', model: '', env: {} },
  { id: 'kimi-k2', driver: 'claude-code', label: 'Kimi K2', model: '', env: { ANTHROPIC_BASE_URL: 'https://api.moonshot.ai/anthropic', ANTHROPIC_AUTH_TOKEN: '' } },
  { id: 'glm', driver: 'claude-code', label: 'GLM (z.ai)', model: '', env: { ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic', ANTHROPIC_AUTH_TOKEN: '' } },
  { id: 'deepseek', driver: 'claude-code', label: 'DeepSeek', model: '', env: { ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic', ANTHROPIC_AUTH_TOKEN: '' } },
  // Codex uses the ChatGPT subscription (codex login); no env override.
  { id: 'codex-sub', driver: 'codex', label: 'Codex (ChatGPT)', model: '', env: {} },
];

function normalizeCliProfile(p) {
  return {
    id: String(p.id || ''),
    driver: String(p.driver || 'claude-code'),
    label: String(p.label || p.id || ''),
    model: String(p.model || ''),
    env: (p.env && typeof p.env === 'object') ? { ...p.env } : {},
    ...(Array.isArray(p.extraArgs) ? { extraArgs: p.extraArgs.map(String) } : {}),
  };
}

// Keep the user's saved profiles (their edited tokens) AND append any built-in
// preset they don't have yet — so newly-shipped presets (e.g. Codex) appear for
// users with existing saved settings instead of being shadowed by the old list.
function cloneCliProfiles(list) {
  const provided = (Array.isArray(list) ? list : [])
    .filter((p) => p && typeof p === 'object')
    .map(normalizeCliProfile)
    .filter((p) => p.id);
  const have = new Set(provided.map((p) => p.id));
  for (const builtin of BUILTIN_CLI_PROFILES) {
    if (!have.has(builtin.id)) provided.push(normalizeCliProfile(builtin));
  }
  return provided.length ? provided : BUILTIN_CLI_PROFILES.map(normalizeCliProfile);
}

function getDefaultAgentModelSettings() {
  const providers = {};
  AGENT_MODEL_CATALOG.forEach((item) => {
    const id = String(item?.providerId || '').trim();
    if (!id) return;
    providers[id] = {
      method: 'api_key',
      apiKey: '',
      oauthClientId: id === 'openai' ? OPENAI_OAUTH_CLIENT_ID : '',
      oauthAccessToken: '',
      oauthRefreshToken: '',
      oauthExpiresAt: 0,
    };
  });

  return {
    defaultProviderId: 'openai',
    defaultMethod: 'api_key',
    defaultModel: 'gpt-4o',
    imageGenerationModel: '',
    humanizeEnabled: false,
    dangerouslySkipPermissions: false,
    reasoning: {},
    maxOutputTokens: 0,
    maxLoopRounds: DEFAULT_AGENT_MAX_LOOP_ROUNDS,
    todoLoopMaxRounds: DEFAULT_AGENT_TODO_LOOP_MAX_ROUNDS,
    providers,
    cliProfiles: cloneCliProfiles(BUILTIN_CLI_PROFILES),
    activeCliProfileId: '',
  };
}

function normalizeAgentModelSettings(parsed) {
  const defaults = getDefaultAgentModelSettings();
  const inputProviders = parsed?.providers && typeof parsed.providers === 'object' ? parsed.providers : {};

  const providers = {};
  AGENT_MODEL_CATALOG.forEach((item) => {
    const id = String(item?.providerId || '').trim();
    if (!id) return;
    const raw = inputProviders[id] || {};
    const method = id === 'openai'
      ? ((raw?.method || parsed?.defaultMethod) === 'oauth' ? 'oauth' : 'api_key')
      : 'api_key';

    providers[id] = {
      method,
      apiKey: String(raw?.apiKey || ''),
      oauthClientId: id === 'openai' ? OPENAI_OAUTH_CLIENT_ID : '',
      oauthAccessToken: String(raw?.oauthAccessToken || ''),
      oauthRefreshToken: String(raw?.oauthRefreshToken || ''),
      oauthExpiresAt: Number(raw?.oauthExpiresAt || 0) || 0,
    };
  });

  const defaultProviderId = providers[parsed?.defaultProviderId] ? parsed.defaultProviderId : defaults.defaultProviderId;
  const defaultMethod = defaultProviderId === 'openai'
    ? (providers.openai?.method === 'oauth' ? 'oauth' : 'api_key')
    : 'api_key';

  return {
    defaultProviderId,
    defaultMethod,
    defaultModel: parsed?.defaultModel || defaults.defaultModel,
    imageGenerationModel: String(parsed?.imageGenerationModel || parsed?.imageModel || ''),
    humanizeEnabled: Boolean(parsed?.humanizeEnabled),
    // Default OFF: absent (legacy) settings keep the command guard enabled (i.e. not skipped).
    dangerouslySkipPermissions: Boolean(parsed?.dangerouslySkipPermissions),
    reasoning: (parsed?.reasoning && typeof parsed.reasoning === 'object' && !Array.isArray(parsed.reasoning))
      ? { ...parsed.reasoning }
      : {},
    maxOutputTokens: Math.max(0, Math.floor(Number(parsed?.maxOutputTokens) || 0)),
    maxLoopRounds: Math.max(1, Math.floor(Number(parsed?.maxLoopRounds)) || DEFAULT_AGENT_MAX_LOOP_ROUNDS),
    todoLoopMaxRounds: Math.max(1, Math.floor(Number(parsed?.todoLoopMaxRounds)) || DEFAULT_AGENT_TODO_LOOP_MAX_ROUNDS),
    providers,
    cliProfiles: cloneCliProfiles(parsed?.cliProfiles),
    activeCliProfileId: String(parsed?.activeCliProfileId || ''),
  };
}

const agentModelSettingsController = createAgentModelSettingsController({
  electronAPI,
  storage: localStorage,
  settingsStorageKey: AGENT_MODEL_SETTINGS_KEY,
  catalog: AGENT_MODEL_CATALOG,
  getDefaultSettings: getDefaultAgentModelSettings,
  normalizeSettings: normalizeAgentModelSettings,
  getReasoningOptions: getReasoningOptionsForModel,
  t,
  dom: {
    agentModelModal,
    agentModelBackend,
    agentModelCliProfile,
    agentModelCliProfileRow,
    agentModelCliModelName,
    agentModelCliModelRow,
    agentModelCliInstallHint,
    agentModelCliInstallMsg,
    agentModelCliInstallOpen,
    cliInstallModal,
    cliInstallTitle,
    cliInstallIntro,
    cliInstallUrl,
    cliInstallClose,
    cliInstallRecheck,
    agentModelHttpFields,
    agentModelCliTokenRow,
    agentModelCliToken,
    agentModelCliAuth,
    agentModelCliAuthStatus,
    agentModelCliLogin,
    agentModelCliLogout,
    agentModelCliAuthLog,
    agentModelProvider,
    agentModelMethod,
    agentModelName,
    agentModelReasoningRow,
    agentModelReasoning,
    agentModelMaxTokensRow,
    agentModelMaxTokens,
    agentModelMaxLoopRounds,
    agentModelTodoLoopRounds,
    agentModelImageRow,
    agentModelImageName,
    agentModelOpenAIKeyRow,
    agentModelOpenAIKey,
    agentModelOpenAIOAuthRow,
    agentModelOpenAIOAuthToken,
    agentModelOpenAIOAuthActions,
    agentModelOpenAIOAuthConnect,
    agentModelOpenAIOAuthRefresh,
    agentHumanizeToggle,
    agentDangerSkipPermsToggle,
    agentModelClose,
    agentModelCancel,
    agentModelSave,
  },
  setStatus,
  resolveCliAuthTarget,
  onSettingsSaved: () => { try { _syncContextLimitFromModelImpl(); } catch (_) {} },
  onCliBackendSwitched,
});

const hydrateAgentModelSettings = () => agentModelSettingsController.hydrateSettings();
const loadAgentModelSettings = () => agentModelSettingsController.loadSettings();
const saveAgentModelSettings = async (next) => agentModelSettingsController.saveSettings(next);
const ensureOpenAITokenReady = async (settings) => agentModelSettingsController.ensureOpenAITokenReady(settings);
const openAgentModelSettingsModal = () => agentModelSettingsController.openModal();
const closeAgentModelSettingsModal = () => agentModelSettingsController.closeModal();

// Agent-side read/query context used by tool functions (layer-aware lookups).
const agentToolContext = createAgentToolContext({
  nodes,
  edges,
  containmentRelations,
  mirrorRelations,
  parseLayerIndex,
  isNodeVisibleInLayer,
  isEdgeVisibleInLayer,
  getNodeLayerContent,
  syncContainmentRelationsFromHierarchy,
  syncMirrorRelationsFromNodes,
  getCreatedLayer,
  getAllLayerIds: () => state.projectTemplate.layers,
});

function normalizeLayerId(value) {
  return agentToolContext.normalizeLayerId(value);
}

function resolveRequestedLayers(layerId) {
  return agentToolContext.resolveRequestedLayers(layerId);
}

function getVisibleNodesForLayer(layerId) {
  return agentToolContext.getVisibleNodesForLayer(layerId);
}

function buildNodeLrtb(node) {
  return agentToolContext.buildNodeLrtb(node);
}

function getVisibleNodesDfsSummaryByLayer(layerId) {
  return agentToolContext.getVisibleNodesDfsSummaryByLayer(layerId);
}

function getNodeDetailAndConnectedEdgesByLayerAndName(layerId, name) {
  return agentToolContext.getNodeDetailAndConnectedEdgesByLayerAndName(layerId, name);
}

function getLayerDfsSummariesForRequestedLayers(layer, root) {
  return agentToolContext.getLayerDfsSummariesForRequestedLayers(layer, root);
}

function getEmptyDetailNodeSummariesForRequestedLayers(layer, root) {
  return agentToolContext.getEmptyDetailNodeSummariesForRequestedLayers(layer, root);
}

function getNodeDetailWithEdgesForRequestedLayers(layer, name) {
  return agentToolContext.getNodeDetailWithEdgesForRequestedLayers(layer, name);
}

function findNodeByNameForRequestedLayers(layer, name) {
  return agentToolContext.findNodeByNameForRequestedLayers(layer, name);
}

function grepNodesByParams(params = {}) {
  return agentToolContext.grepVisibleNodes(params);
}

const autoLayoutByParams = createAutoLayoutTool({
  nodes,
  edges,
  normalizeRectFromLrtb,
  pushHistory,
  recomputeAllContainmentFromGeometry,
  validateContainmentLayerOrder,
  updateTopbar,
  rebuildSidebar,
  renderRightPanel,
  projectToNodeEdgeByRay,
  render,
  state,
});

window.AGENT_FUNCTION_TOOL_SCHEMAS = AGENT_FUNCTION_TOOL_SCHEMAS;
window.getToolSchemasByAgent = getToolSchemasByAgent;

const AGENT_FUNCTIONS = createAgentFunctions({
  getLayerDfsSummariesForRequestedLayers,
  getEmptyDetailNodeSummariesForRequestedLayers,
  getNodeDetailWithEdgesForRequestedLayers,
  createNodeAtPositionByParams,
  createEdgeByParams,
  createMirrorByParams,
  toolReadByParams,
  toolWriteByParams,
  toolEditByParams,
  grepFilesByParams,
  grepNodesByParams,
  readImageByParams,
  readDocxByParams,
  runCommandByParams,
  compileProjectByParams,
  runProjectByParams,
  webFetchByParams,
  readSkillByName,
  listSkills,
  cropImageByParams,
    composeSpriteByParams,
    updateNodeByParams,
    updateEdgeByParams,
    deleteNodeByParams,
    deleteEdgeByParams,
    arrangeNodesGridByParams,
  autoLayoutByParams,
  todoWriteByParams,
  screenshotCanvasByParams,
  getViewportByParams,
  setViewportByParams,
});
window.AGENT_FUNCTIONS = AGENT_FUNCTIONS;

// === Mindmap MCP dispatch (Phase 4b) =======================================
// Main relays a CLI sub-agent's graph tool call here (via the localhost bridge);
// we run it against the LIVE graph and reply. This renderer is the single source
// of truth for both the exposed tool schemas and their execution. Only the curated
// graph/canvas tools are reachable — never the CLI's native file/bash tools.
const MCP_GRAPH_TOOLS = new Set([
  'list_node', 'list_empty_node', 'get_node_detail', 'grep_node',
  'create_node', 'create_edge', 'create_mirror',
  'update_node', 'update_edge', 'delete_node', 'delete_edge',
  'arrange', 'auto_layout',
]);
// NOTE: get_mindmap (a whole-graph dump) is intentionally NOT exposed as an MCP
// tool. The graph-reading design is overview-first-then-detail to avoid context
// bloat: agents use list_node (compact per-layer hierarchy + synopsis) → grep_node
// → get_node_detail, the SAME incremental pattern the HTTP line uses. The live
// overview builder (buildLiveMindmapOverview) is kept only for the deferred Codex
// non-bypass prompt-injection idea, not as a callable tool.
// Per-agent task list, exposed so CLI agents (whose native TodoWrite is absent in
// headless mode) can still keep a visible, ANGEL-owned todo list. todo_write comes
// from the shared agent schemas; todo_read is MCP-only (defined inline). Both route
// to the calling agent via the per-call agentId threaded through the bridge.
const MCP_TODO_TOOLS = new Set(['todo_write', 'todo_read']);
// Project build/run, exposed so CLI agents can compile/run the project through
// ANGEL's own desktop Execute chain (the topbar Compile/Run pipeline) and get the
// result back. NOT run_command — the CLI has native shell for generic commands;
// these are the project-specific toolchain the CLI can't invoke on its own.
const MCP_BUILD_TOOLS = new Set(['compile_project', 'run_project']);
const MCP_TODO_READ_SCHEMA = {
  name: 'todo_read',
  description: 'Read your current task-tracking todo list (the items you last set with todo_write). Returns the full list, each with content and status. Call it to recall your plan and progress — especially at the start of a run or after resuming, since the list persists across turns.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
};

// Live whole-graph overview (mirrors the 4a disk projection, but from live state).
// No longer exposed as the get_mindmap MCP tool (removed to keep graph reading
// overview-first-then-detail). Retained only for the deferred Codex non-bypass
// prompt-injection idea; harmless if unused.
function buildLiveMindmapOverview() {
  const layers = Array.isArray(state?.projectTemplate?.layers) ? state.projectTemplate.layers.map(String) : [];
  const projectOne = (n) => {
    const perLayer = {};
    const lc = (n && n.layerContent && typeof n.layerContent === 'object') ? n.layerContent : {};
    for (const lid of layers) {
      const item = lc[lid] || {};
      perLayer[lid] = {
        synopsis: String(item.synopsis || item.summary || ''),
        detail: String(item.detail || ''),
        status: String(item.status || n?.status || 'active'),
      };
    }
    return { id: String(n?.id || ''), name: String(n?.name || ''), x: Number(n?.x) || 0, y: Number(n?.y) || 0, parentId: n?.parentId ? String(n.parentId) : null, perLayer };
  };
  return {
    project: state.projectName || 'untitled',
    layers,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes: nodes.map(projectOne),
    edges: edges.map((e) => ({ from: String(e?.from || ''), to: String(e?.to || ''), kind: String(e?.kind || '') })),
    containmentRelations,
    mirrorRelations,
  };
}

if (electronAPI?.angelMcp?.onInvoke) {
  electronAPI.angelMcp.onInvoke(async (payload) => {
    const op = String(payload?.op || '');
    if (op === 'list') {
      const schemas = getToolSchemasByAgent('designer') || [];
      const tools = [MCP_TODO_READ_SCHEMA];
      for (const s of schemas) {
        const fn = (s && s.function) ? s.function : s;
        if (fn && (MCP_GRAPH_TOOLS.has(fn.name) || MCP_TODO_TOOLS.has(fn.name) || MCP_BUILD_TOOLS.has(fn.name))) {
          tools.push({
            name: fn.name,
            description: String(fn.description || ''),
            inputSchema: fn.parameters || { type: 'object', properties: {} },
          });
        }
      }
      return tools;
    }
    if (op === 'call') {
      const tool = String(payload?.tool || '');
      const args = payload?.args || {};
      // Route per-agent tools (todo) to the CALLING agent, not whichever agent the
      // UI is focused on — agentId is threaded from the run through the bridge.
      const agentId = String(payload?.agentId || '') || agentChatState.activeAgentId;
      if (tool === 'todo_read') {
        const todos = agentChatStateManager.getAgentTodos(agentId) || [];
        return { todos };
      }
      if (!MCP_GRAPH_TOOLS.has(tool) && !MCP_TODO_TOOLS.has(tool) && !MCP_BUILD_TOOLS.has(tool)) throw new Error(`Tool not allowed via MCP: ${tool}`);
      const fn = AGENT_FUNCTIONS[tool];
      if (typeof fn !== 'function') throw new Error(`Unknown tool: ${tool}`);
      const result = await fn(args, { agentId });
      // Normalize to a plain, structured-clone-safe value for the IPC reply.
      try { return JSON.parse(JSON.stringify(result ?? null)); } catch (_) { return String(result ?? ''); }
    }
    throw new Error(`Unknown MCP op: ${op}`);
  });
}

// Each value maps directly to a prompt folder under ../prompts/agents/<profile>.
const KNOWN_PROMPT_PROFILES = new Set(['full', 'minimized', 'full-image', 'minimized-image']);

function resolveProjectPromptProfile() {
  const explicitProfile = String(state?.projectTemplate?.promptProfile || '').trim().toLowerCase();
  if (KNOWN_PROMPT_PROFILES.has(explicitProfile)) return explicitProfile;

  const templateId = String(state?.projectTemplate?.id || '').trim().toLowerCase();
  if (templateId) {
    if (templateId.includes('full') || templateId.includes('4layer') || templateId.includes('4-layer')) return 'full';
    if (templateId.includes('minimal') || templateId.includes('minimized') || templateId.includes('2layer') || templateId.includes('2-layer')) return 'minimized';
  }

  const layers = Array.isArray(state?.projectTemplate?.layers) ? state.projectTemplate.layers : [];
  const layerCount = layers.length;
  if (layerCount === 4) return 'full';
  if (layerCount === 2) return 'minimized';
  return null;
}

function getAgentPromptFileById() {
  const profile = resolveProjectPromptProfile();
  const base = profile ? `../prompts/agents/${profile}` : '../prompts/agents';
  return {
    designer: `${base}/designer.prompt.md`,
    orchestrator: `${base}/orchestrator.prompt.md`,
    programmer: `${base}/programmer.prompt.md`,
    'resource-provider': `${base}/resource-provider.prompt.md`,
  };
}

const AGENT_SUFFIX_FILE_BY_ID = {
  designer: '../prompts/agents_suffix/designer.prompt.md',
  orchestrator: '../prompts/agents_suffix/orchestrator.prompt.md',
  programmer: '../prompts/agents_suffix/programmer.prompt.md',
  'resource-provider': '../prompts/agents_suffix/resource-provider.prompt.md',
};

const AGENT_HUMANIZE_FILE_BY_ID = {
  designer: '../prompts/humanize/designer.prompt.md',
  orchestrator: '../prompts/humanize/orchestrator.prompt.md',
  programmer: '../prompts/humanize/programmer.prompt.md',
  'resource-provider': '../prompts/humanize/resource-provider.prompt.md',
};

const SAVE_MEMORY_PROMPT_PATH = '../prompts/memory/save-memory.prompt.md';
const SAVE_RECENT_MEMORY_PROMPT_PATH = '../prompts/memory/save-recent-memory.prompt.md';

// When a project folder is open, the agent system prompt is sourced from a
// runtime-editable, per-project file: <projectRoot>/agents/<agent>/prompt.md
// (seeded from the hardcoded prompts at project creation). Returns '' when no
// project is open or the file is missing, so the runtime falls back to the
// hardcoded prompt fetched via getAgentPromptFileById.
async function loadProjectAgentPrompt(agentId) {
  const hasOpenProject = Boolean((electronAPI && state.projectRootPath) || state.currentProjectDirHandle);
  if (!hasOpenProject) return '';

  const canonicalId = normalizeAgentId(agentId);
  const folderName = AGENT_MEMORY_FOLDER_BY_ID[canonicalId] || canonicalId;
  if (!folderName) return '';

  const relPath = `agents/${folderName}/prompt.md`;
  try {
    const parts = [];
    let offset = 1;
    for (let i = 0; i < 50; i += 1) {
      const result = await toolReadByParams({ path: relPath, offset, limit: AGENT_MEMORY_READ_LIMIT });
      parts.push(typeof result?.content === 'string' ? result.content : '');
      if (!result?.truncated || !result?.nextOffset) break;
      offset = result.nextOffset;
    }
    return parts.join('\n');
  } catch (_) {
    // File absent (or unreadable) -> fall back to the hardcoded prompt.
    return '';
  }
}

const agentRuntime = createAgentRuntime({
  promptFileById: getAgentPromptFileById,
  loadProjectAgentPrompt,
  suffixFileById: AGENT_SUFFIX_FILE_BY_ID,
  humanizeFileById: AGENT_HUMANIZE_FILE_BY_ID,
  getAgentToolSchemas: (agentId) => getToolSchemasByAgent(normalizeAgentId(agentId)),
  getAgentFunctions: () => AGENT_FUNCTIONS,
  getAgentModelSettings: () => loadAgentModelSettings(),
  getContextLimitByModel: (modelName) => getContextLimitByModel(modelName),
  getTimelineByAgent: (agentId) => (agentChatState && agentId && agentChatState.messagesByAgent?.[agentId])
    ? agentChatState.messagesByAgent[agentId]
    : null,
  getCanonicalTurnsByAgent: (agentId) => (agentChatStateManager && agentId && typeof agentChatStateManager.buildCanonicalTurns === 'function')
    ? agentChatStateManager.buildCanonicalTurns(agentId)
    : null,
  getAgentTodos: (agentId) => agentChatStateManager.getAgentTodos(agentId),
  ensureOpenAITokenReady: async (settings) => ensureOpenAITokenReady(settings),
});

const requestDefaultModelCompletion = agentRuntime.requestDefaultModelCompletion;

// === CLI sub-agent line wiring ============================================
// Second model-interaction line. `requestAgentCompletion` dispatches each
// request to either the CLI runtime (when a CLI profile is active) or the
// existing HTTP runtime (the API-key fallback line). The two share the same
// params/callback/reply contract, so the chat UI is agnostic to which ran.
function getCliProfiles() {
  const list = loadAgentModelSettings()?.cliProfiles;
  return Array.isArray(list) && list.length ? list : BUILTIN_CLI_PROFILES;
}
function getActiveCliProfileId() {
  return String(loadAgentModelSettings()?.activeCliProfileId || '');
}
function isCliBackendActive() {
  return Boolean(getActiveCliProfileId());
}
function resolveActiveCliProfile() {
  const id = getActiveCliProfileId();
  if (!id) return null;
  return getCliProfiles().find((p) => p && p.id === id) || null;
}

// Context for the subscription-usage gauge (5h/weekly). Only the genuine Anthropic
// subscription (claude-code driver with NO custom ANTHROPIC_BASE_URL) and Codex
// expose a usable endpoint → `supported:true`. Domestic Claude-compatible presets
// (custom base URL) and the HTTP line are NOT supported → the UI falls back to the
// raw token-usage rows instead of the window gauge.
function getCliUsageContext() {
  const profile = resolveActiveCliProfile();
  if (!profile) return { supported: false };
  const env = profile.env && typeof profile.env === 'object' ? profile.env : {};
  const hasBaseUrlOverride = Boolean(String(env.ANTHROPIC_BASE_URL || '').trim());
  const driver = String(profile.driver || '');
  const supported = driver === 'codex' || (driver === 'claude-code' && !hasBaseUrlOverride);
  return { supported, driver, hasBaseUrlOverride };
}
async function fetchCliUsageWindows() {
  const ctx = getCliUsageContext();
  if (!ctx.supported || !electronAPI?.cliAgent?.usageWindows) return { ok: false };
  try {
    return await electronAPI.cliAgent.usageWindows({ driver: ctx.driver, hasBaseUrlOverride: ctx.hasBaseUrlOverride });
  } catch (_) {
    return { ok: false };
  }
}

// For the settings auth buttons: a profile's driver bin + its auth subcommands,
// or null when the driver has no OAuth login (e.g. token-based domestic profiles).
function resolveCliAuthTarget(profileId) {
  const profile = getCliProfiles().find((p) => p && p.id === profileId);
  if (!profile) return null;
  const driver = getCliAgentDriver(profile.driver);
  if (!driver || !driver.bin || !driver.auth) return null;
  return { bin: driver.bin, auth: driver.auth };
}

function cliSessionRelPath(agentId) {
  const id = normalizeAgentId(agentId);
  const folder = AGENT_MEMORY_FOLDER_BY_ID[id] || id;
  return `agents/${folder}/cli-session.json`;
}

// Per-agent working dir (absolute): each parallel agent runs here so it gets an
// isolated CLI session + per-agent native memory (cwd file = private, project-root
// file = shared, both auto-loaded). The project is reachable via --add-dir.
function getAgentWorkdir(agentId) {
  const root = String(state.projectRootPath || '');
  if (!root) return '';
  const id = normalizeAgentId(agentId);
  const folder = AGENT_MEMORY_FOLDER_BY_ID[id] || id;
  return `${root}/agents/${folder}`;
}
async function loadCliSession(agentId) {
  if (!agentId) return null;
  try {
    const r = await toolReadByParams({ path: cliSessionRelPath(agentId), limit: AGENT_MEMORY_READ_LIMIT });
    const obj = JSON.parse(String(r?.content || ''));
    return obj && typeof obj === 'object' ? obj : null;
  } catch (_) {
    return null;
  }
}
// Per-profile read-modify-write: keep other profiles' pointers, update this one,
// and mark it the most-recently-used (for the switch note).
async function saveCliSession(agentId, profileId, entry) {
  if (!agentId || !profileId || !entry) return;
  try {
    const record = normalizeSessionRecord(await loadCliSession(agentId));
    record.byProfile[profileId] = entry;
    record.lastProfileId = profileId;
    await toolWriteByParams({ path: cliSessionRelPath(agentId), content: JSON.stringify(record, null, 2) });
  } catch (_) {
    // Display-projection metadata; a write failure must not break the run.
  }
}

function formatSeedBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  return `${(v / 1024).toFixed(1)} KB`;
}
function formatSeedMtime(ms) {
  const v = Number(ms) || 0;
  if (!v) return '';
  try { return new Date(v).toLocaleString(); } catch (_) { return ''; }
}

// Fired from the model-settings save when the active CLI profile changes. Always
// shows ONE dialog announcing the switch and offering to copy existing memory into
// the new source's native files across ALL agents + the shared root, or continue
// (keep current). A candidate source is offered when its content DIFFERS from the
// target (target empty = fresh seed; target non-empty = the user can pick which
// version → copying replaces it). Identical files are skipped. Returns
// { action: 'none'|'empty'|'copy', fromLabel? }.
async function resolveMemorySeedForSwitch(toProfileId, fromProfileId) {
  try {
    const toProfile = getCliProfiles().find((p) => p && p.id === toProfileId);
    if (!toProfile) return { action: 'none' }; // not a CLI backend → no dialog
    const targetFile = getCliAgentDriver(toProfile.driver)?.memoryFile || 'CLAUDE.md';
    const sourceFiles = [...new Set(listCliAgentDrivers()
      .map((driverKey) => getCliAgentDriver(driverKey)?.memoryFile)
      .filter(Boolean))].filter((f) => f !== targetFile);

    // Every agent's private dir + the shared project root.
    const levels = [...Object.values(AGENT_MEMORY_FOLDER_BY_ID).map((f) => `agents/${f}/`), ''];

    const readMeta = async (rel) => {
      try {
        const r = await toolReadByParams({ path: rel, limit: AGENT_MEMORY_READ_LIMIT });
        return { content: String(r?.content || ''), size: Number(r?.size || 0), mtimeMs: Number(r?.mtimeMs || 0) };
      } catch (_) { return { content: '', size: 0, mtimeMs: 0 }; }
    };

    const candidates = [];
    for (const srcFile of sourceFiles) {
      const copies = [];
      let size = 0;
      let mtimeMs = 0;
      let replaces = 0;
      for (const dir of levels) {
        const source = await readMeta(`${dir}${srcFile}`);
        if (!source.content.trim()) continue;                          // nothing to copy from
        const target = await readMeta(`${dir}${targetFile}`);
        if (source.content.trim() === target.content.trim()) continue; // already identical → skip
        if (target.content.trim()) replaces += 1;                      // differs from existing → would replace
        copies.push({ toRel: `${dir}${targetFile}`, content: source.content });
        size += source.size;
        mtimeMs = Math.max(mtimeMs, source.mtimeMs);
      }
      if (copies.length) {
        const meta = [`${copies.length}×`, replaces ? `replace ${replaces}` : '', formatSeedBytes(size), formatSeedMtime(mtimeMs)]
          .filter(Boolean).join(' · ');
        candidates.push({ srcFile, label: `${srcFile} · ${meta}`, copies });
      }
    }

    // Always show the dialog on a switch — even with no candidates — so the user is
    // told the new source's sessions start fresh.
    const choice = await cliMemorySeedModalController.requestMemorySeedChoice({
      targetLabel: targetFile,
      fromLabel: String(fromProfileId || ''),
      candidates,
    });
    if (choice?.action === 'copy' && choice.candidate?.copies?.length) {
      for (const c of choice.candidate.copies) {
        try { await toolWriteByParams({ path: c.toRel, content: c.content }); } catch (_) {}
      }
      return { action: 'copy', seeded: true, fromLabel: choice.candidate.srcFile };
    }
    return { action: 'empty' };
  } catch (_) {
    return { action: 'empty' };
  }
}

// Settings-save hook: the global active CLI profile changed from→to.
async function onCliBackendSwitched(fromId, toId) {
  if (!toId) return; // switched to an HTTP provider → no CLI switch dialog
  try {
    const result = await resolveMemorySeedForSwitch(toId, fromId);
    if (result?.action === 'copy') {
      try { setStatus(t('agentChat.notice.cliMemorySeeded', { from: String(result.fromLabel || '') })); } catch (_) {}
    }
  } catch (_) { /* best effort */ }
}

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'png';
}
async function writeCliImageAttachment(agentId, image) {
  const dataUrl = String(image?.dataUrl || '');
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) return '';
  if (!(electronAPI?.toolWriteBinary && state.projectRootPath)) return '';
  const ext = extFromMime(image?.mimeType || m[1]);
  const uid = globalThis.crypto?.randomUUID?.() || `img_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const rel = `.angel/attachments/${uid}.${ext}`;
  await electronAPI.toolWriteBinary({ rootPath: state.projectRootPath, path: rel, base64: m[2] });
  return rel;
}

const cliAgentRuntime = createCliAgentRuntime({
  electronAPI,
  getProjectRoot: () => state.projectRootPath || '',
  resolveActiveCliProfile: () => resolveActiveCliProfile(),
  getDangerouslySkipPermissions: () => {
    try { return loadAgentModelSettings()?.dangerouslySkipPermissions === true; } catch (_) { return false; }
  },
  loadAppendSystemPrompt: async (agentId) => {
    try { return await loadProjectAgentPrompt(agentId); } catch (_) { return ''; }
  },
  loadCliSession,
  saveCliSession,
  writeImageAttachment: writeCliImageAttachment,
  getAgentWorkdir,
  // Mirror a CLI agent's native todo/plan into ANGEL's per-agent todo panel.
  // Called lazily (agentChatStateManager is defined later); per-agent so parallel
  // agents each update their own list.
  applyAgentTodos: (agentId, items) => {
    try {
      agentChatStateManager.setAgentTodos(agentId, items);
      renderAgentTodoPanel();
    } catch (_) { /* best effort */ }
  },
  // Surface a CLI agent's proposed plan (Claude ExitPlanMode) as a persistent,
  // display-only note in its timeline. Plans are not replayed to the model.
  showAgentPlan: (agentId, planText) => {
    try {
      const body = String(planText || '').trim();
      if (!body) return;
      pushAgentMessage(agentId, 'developer', `${t('agentChat.plan.header')}\n\n${body}`, { includeInContext: false });
      renderAgentTimeline({ forceScrollBottom: true });
    } catch (_) { /* best effort */ }
  },
  // Push a persistent, translated system note into an agent's timeline (e.g. source
  // switched, session expired) so the UI doesn't imply continuity the new run won't have.
  notifyAgent: (agentId, i18nKey, params = {}) => {
    try {
      pushAgentMessage(agentId, 'developer', formatSystemEventText(t(i18nKey, params)), { includeInContext: false });
      renderAgentTimeline({ forceScrollBottom: true });
    } catch (_) { /* best effort */ }
  },
  t,
});

async function requestAgentCompletion(params) {
  return isCliBackendActive()
    ? cliAgentRuntime.requestCliAgentCompletion(params)
    : requestDefaultModelCompletion(params);
}

async function loadPromptTextByPath(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load prompt: ${path} (${response.status})`);
  }
  return response.text();
}

async function listSkills() {
  try {
    const response = await fetch('../prompts/skills/index.json', { cache: 'no-cache' });
    if (!response.ok) return { skills: [] };
    const json = await response.json();
    const skills = Array.isArray(json?.skills)
      ? json.skills.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    return { skills };
  } catch (_) {
    return { skills: [] };
  }
}

async function loadProjectImageAsDataUrl(relativePath) {
  const rootPath = String(state.projectRootPath || '').trim();
  if (!rootPath) throw new Error('project is not open');
  if (!electronAPI?.readBinaryAsDataUrl) throw new Error('readBinaryAsDataUrl is unavailable');
  const res = await electronAPI.readBinaryAsDataUrl({ rootPath, path: String(relativePath || '') });
  if (!res?.ok || !res?.dataUrl) throw new Error(`failed to read image: ${relativePath}`);
  return String(res.dataUrl);
}

async function cropImageByParams(params = {}) {
  const srcPath = String(params.path || '').trim();
  if (!srcPath) throw new Error('path is required');
  const x = Math.max(0, Math.trunc(Number(params.x)));
  const y = Math.max(0, Math.trunc(Number(params.y)));
  const w = Math.trunc(Number(params.width));
  const h = Math.trunc(Number(params.height));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error('width/height must be positive');
  const outPath = String(params.outPath || `src/assets/crop_${Date.now()}.png`).trim();

  const dataUrl = await loadProjectImageAsDataUrl(srcPath);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('failed to decode source image'));
    el.src = dataUrl;
  });

  const cw = Math.min(w, Math.max(1, img.width - x));
  const ch = Math.min(h, Math.max(1, img.height - y));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx2 = canvas.getContext('2d');
  ctx2.drawImage(img, x, y, cw, ch, 0, 0, cw, ch);
  const outDataUrl = canvas.toDataURL('image/png');
  const base64 = outDataUrl.split(',')[1] || '';
  await writeBinaryFileByRelativePath(outPath, await (await fetch(outDataUrl)).blob());
  return { ok: true, path: outPath, width: cw, height: ch, base64Length: base64.length };
}

let buildSpriteAtlasAndMetadataFromFrames = null;

async function composeSpriteByParams(params = {}) {
  if (typeof buildSpriteAtlasAndMetadataFromFrames !== 'function') {
    throw new Error('sprite generator is unavailable');
  }
  const images = Array.isArray(params.images) ? params.images.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (images.length === 0) throw new Error('images is required');

  const outPath = String(params.outPath || `src/assets/sprite_${Date.now()}.png`).trim().replace(/\\/g, '/');
  const clean = outPath.replace(/^\/+/, '');
  const slash = clean.lastIndexOf('/');
  const pathPart = slash >= 0 ? clean.slice(0, slash) : 'src/assets';
  const filePart = slash >= 0 ? clean.slice(slash + 1) : clean;
  const name = filePart.toLowerCase().endsWith('.png') ? filePart.slice(0, -4) : filePart;
  const spriteDir = pathPart || 'src/assets';
  const spriteName = name || `sprite_${Date.now()}`;

  // overwrite defaults to true; when false, refuse to clobber an existing sprite.
  const overwrite = params.overwrite !== false;
  if (!overwrite) {
    const dir = spriteDir.toLowerCase().startsWith('src/') ? spriteDir : `src/${spriteDir}`;
    const pngRelPath = `${normalizeToolRelativePath(dir)}/${spriteName}.png`;
    let exists = false;
    try {
      await loadProjectImageAsDataUrl(pngRelPath);
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) {
      return {
        ok: false,
        reason: 'exists',
        pngRelPath,
        message: `A sprite already exists at ${pngRelPath}. Set overwrite=true to replace it, or pick a different outPath/name.`,
      };
    }
  }

  const frames = [];
  for (let i = 0; i < images.length; i += 1) {
    const path = images[i];
    const dataUrl = await loadProjectImageAsDataUrl(path);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`failed to decode image: ${path}`));
      el.src = dataUrl;
    });
    const fileName = path.split('/').pop() || `frame_${i + 1}.png`;
    frames.push({ fileName, image: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
  }

  const result = await buildSpriteAtlasAndMetadataFromFrames(frames, {
    path: spriteDir,
    name: spriteName,
    pivotX: Math.trunc(Number(params.pivotX || 0)),
    pivotY: Math.trunc(Number(params.pivotY || 0)),
  });

  return { ok: true, pngRelPath: result.pngRelPath, txtRelPath: result.txtRelPath, frameCount: result.frameCount };
}

async function readSkillByName(name) {
  const raw = String(name || '').trim();
  if (!raw) throw new Error('name is required');
  if (raw.includes('..')) throw new Error('invalid skill name');
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const safe = normalized.replace(/[^a-zA-Z0-9_\-/]/g, '');
  if (!safe) throw new Error('invalid skill name');
  const path = `../prompts/skills/${safe}.md`;
  const content = await loadPromptTextByPath(path);
  return { name: safe, path: `code/prompts/skills/${safe}.md`, content };
}

const agentContextCompactionManager = createAgentContextCompactionManager({
  loadPromptText: (path) => loadPromptTextByPath(path),
  requestCompletion: async ({ agentId, prompt, progressLabel }) => {
    const reply = await requestDefaultModelCompletion({
      prompt,
      agentId,
      onProgress: (statusText, usageInfo) => {
        const text = String(statusText || progressLabel || 'Compacting...');
        setAgentStatus(agentId, text);
        pushAgentMessage(agentId, 'thinking', text, { includeInContext: false });
        if (usageInfo) setAgentContextUsage(agentId, usageInfo.used, usageInfo.max);
      },
    });
    if (reply && typeof reply === 'object') return String(reply.text || '');
    return String(reply || '');
  },
  writeFile: async (path, content) => toolWriteByParams({ path, content }),
  getMessagesByAgent: (agentId) => agentChatState.messagesByAgent?.[agentId] || [],
  setMessagesByAgent: (agentId, messages) => {
    if (!agentChatState.messagesByAgent?.[agentId]) return;
    agentChatState.messagesByAgent[agentId] = Array.isArray(messages) ? messages : [];
    renderAgentTimeline({ forceScrollBottom: true });
  },
  getAgentRecycleFolder: (agentId) => {
    const canonicalAgentId = normalizeAgentId(agentId);
    const folderName = AGENT_MEMORY_FOLDER_BY_ID[canonicalAgentId] || canonicalAgentId;
    return `agents/${folderName}`;
  },
  onStatus: (text) => {
    setStatus(text);
  },
});

const graphPalette = createGraphPalette({ viewSettings, cssVar });

const themeSettingsController = createThemeSettingsController({
  storage: localStorage,
  cssVar,
  graphPalette,
  graphCanvas: canvas,
  dom: {
    menuTheme,
    themeModal,
    themeClose,
    themeCancel,
    themeSave,
    themePresetSelect,
    themeBgBody,
    themeTextMain,
    themeTopbarBg,
    themeToolbarBg,
    themeMutedText,
    themeMenuHoverBg,
    themeMenuHoverBorder,
    themeBorderMain,
    themeSidebarBg,
    themeSidebarItemBorder,
    themeSidebarItemActiveBorder,
    themeSidebarItemActiveBg,
    themeSidebarMetaText,
    themeRightPanelBg,
    themePanelCardBg,
    themePanelCardBorder,
    themePanelItemBorder,
    themeInputBg,
    themeInputText,
    themeInputBorder,
    themeChipBg,
    themeChipText,
    themeChipBorder,
    themeChipProtectedBorder,
    themeChipProtectedText,
    themeGraphGrid,
    themeGraphEdgeSelected,
    themeNodeText,
    themeNodeFillSelected,
    themeNodeStrokeSelected,
    themeHandleFill,
    themeHandleStroke,
    themeMenuSeparator,
    themeAgentChatResizeHandle,
    themeModalHeadBorder,
    themeModalBtnBorder,
    themeModalBtnBg,
    themeModalBtnText,
    themeModalNoteText,
    themeThemeSwatchBorder,
    themeThemePaletteCardBorder,
    themePreviewBorder,
    themePreviewBg,
    themeHelpLinkText,
    themeSpritePreviewBg,
    themeSpritePreviewText,
    themeSpritePreviewBorder,
    themeSpritePreviewError,
    themeFontPreviewBg,
    themeFontPreviewText,
    themeFontGlyphFill,
    themeFileTreeHoverBg,
    themeModalBackdropBg,
    themeGraphDragPreviewStroke,
    themeGraphSelectFill,
    themeGraphSelectFillAlt,
    themeGraphMirrorPreviewStroke,
    themeGridOpacity,
    themeNodeBaseOpacity,
    themeAgentChatBg,
    themeAgentChatBorder,
    themeAgentChatTitleBg,
    themeAgentChatTitleBorder,
    themeAgentChatSidebarBg,
    themeAgentChatBtnBg,
    themeAgentChatBtnBorder,
    themeAgentChatBtnText,
    themeAgentChatInputBg,
    themeAgentChatInputBorder,
    themeAgentChatInputText,
    themeAgentChatBubbleAgentBg,
    themeAgentChatBubbleAgentBorder,
    themeAgentChatBubbleUserBg,
    themeAgentChatBubbleUserBorder,
    themeAgentChatBubbleSystemBg,
    themeAgentChatBubbleSystemBorder,
    themeAgentChatBubbleSystemText,
    themePaletteGrid,
    themeBgImageEnabled,
    themeBgImageOptions,
    themeBgImageFile,
    themeBgImageClear,
    themeBgImagePreviewWrap,
    themeBgImagePreview,
    themeBgImageOpacity,
  },
  setStatus,
  closeAllMenus,
  onThemeApplied: () => {
    render();
  },
});

function updateTopbar() {
  return appShellUI.updateTopbar();
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function distancePointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.hypot(px - ax, py - ay);
  let t = (apx * abx + apy * aby) / ab2;
  t = clamp01(t);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}


function getNodeResizeHandles(node) {
  const x1 = node.x;
  const y1 = node.y;
  const x2 = node.x + node.w;
  const y2 = node.y + node.h;
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;

  return [
    { key: 'nw', x: x1, y: y1 },
    { key: 'n', x: cx, y: y1 },
    { key: 'ne', x: x2, y: y1 },
    { key: 'e', x: x2, y: cy },
    { key: 'se', x: x2, y: y2 },
    { key: 's', x: cx, y: y2 },
    { key: 'sw', x: x1, y: y2 },
    { key: 'w', x: x1, y: cy },
  ];
}

const edgeRenderHelpers = createEdgeRenderHelpers({ state });
_getAnchorWorldImpl = edgeRenderHelpers.getAnchorWorld;
_projectToNodeEdgeImpl = edgeRenderHelpers.projectToNodeEdge;
_projectToNodeEdgeByRayImpl = edgeRenderHelpers.projectToNodeEdgeByRay;
_getEdgeStrokeDashImpl = edgeRenderHelpers.getEdgeStrokeDash;
_bezierPointImpl = edgeRenderHelpers.bezierPoint;
_getAnchorDirectionImpl = edgeRenderHelpers.getAnchorDirection;
_getEdgePolylineWorldImpl = edgeRenderHelpers.getEdgePolylineWorld;

graphLocalHelpers = createGraphLocalHelpers({
  state,
  nodes,
  edges,
  normalizeSelectedNodeIds,
  projectToNodeEdge,
  projectToNodeEdgeByRay,
});

const elkPreviewLayout = createElkPreviewLayout({
  nodes,
  edges,
  getSelectedNodesOrdered,
  getNodesBoundingRect,
  projectToNodeEdgeByRay,
  render,
});
previewElkLayoutInSelection = elkPreviewLayout.previewElkLayoutInSelection;

const interactionHitTesting = createInteractionHitTesting({
  state,
  nodes,
  edges,
  canvas,
  screenToWorld,
  getNodeLodLevel,
  isNodeVisibleInActiveLayer,
  isEdgeVisibleInActiveLayer,
  getAnchorWorld,
  getEdgePolylineWorld,
  distancePointToSegment,
});
_getPointerWorldFromClientImpl = interactionHitTesting.getPointerWorldFromClient;
_getCanvasPointerImpl = interactionHitTesting.getCanvasPointer;
_getResizeHandleAtImpl = interactionHitTesting.getResizeHandleAt;
_getResizeHitImpl = interactionHitTesting.getResizeHit;
_getCursorForHandleImpl = interactionHitTesting.getCursorForHandle;
_getEdgeEndpointHitImpl = interactionHitTesting.getEdgeEndpointHit;
_getEdgeBodyHitImpl = interactionHitTesting.getEdgeBodyHit;
_pickTopNodeAtPointImpl = interactionHitTesting.pickTopNodeAtPoint;
_hitTestImpl = interactionHitTesting.hitTest;

const interactionAutoPan = createInteractionAutoPan({
  state,
  canvas,
  viewSettings,
  clamp01,
  getPointerWorldFromClient,
  render,
});
_getAutoPanVelocityImpl = interactionAutoPan.getAutoPanVelocity;
_shouldAutoPanNowImpl = interactionAutoPan.shouldAutoPanNow;
_ensureAutoPanLoopImpl = interactionAutoPan.ensureAutoPanLoop;

const interactionPointerMove = createInteractionPointerMove({
  state,
  nodes,
  edges,
  canvas,
  MIN_NODE_SCREEN_PX,
  getCanvasPointer,
  getSelectionBBoxFromSession,
  getRectResizeHandleAt,
  isPointInRect,
  getEdgeEndpointHit,
  getResizeHit,
  getEdgeBodyHit,
  hitTest,
  getCursorForHandle,
  ensureAutoPanLoop,
  projectToNodeEdge,
  render: scheduleRender,
  renderRightPanel,
  applySelectionTransformByBoxes,
  updatePastePreview,
  setStatus,
});
_handlePointerMoveImpl = interactionPointerMove.handlePointerMove;

const interactionPointerDown = createInteractionPointerDown({
  state,
  nodes,
  canvas,
  document,
  isTypingTarget,
  setStatus,
  render,
  getCanvasPointer,
  getSelectionBBoxFromSession,
  getRectResizeHandleAt,
  isPointInRect,
  ensureAutoPanLoop,
  getEdgeEndpointHit,
  hitTest,
  getResizeHit,
  setSingleNodeSelection,
  setSingleEdgeSelection,
  pushHistory,
  rebuildSidebar,
  renderRightPanel,
});
_handlePointerDownImpl = interactionPointerDown.handlePointerDown;

const interactionPointerUp = createInteractionPointerUp({
  state,
  canvas,
  history,
  nodes,
  edges,
  CREATE_NODE_CAMERA_WIDTH_RATIO,
  CREATE_NODE_ASPECT_RATIO,
  MIN_NODE_SCREEN_PX,
  MIRROR_DEFAULT_DETAIL,
  pushTransformPreviewCheckpoint,
  pushHistory,
  restoreSnapshot,
  getSelectionRectWorld,
  getNodesInRect,
  nextNodeId,
  nextEdgeId,
  isPlacementLegal,
  findSmallestContainerForRect,
  getActiveLayerIndex,
  getAllLayerIds: () => state.projectTemplate.layers,
  recomputeAllContainmentFromGeometry,
  validateContainmentLayerOrder,
  setSingleNodeSelection,
  updateTopbar,
  rebuildSidebar,
  renderRightPanel,
  findSpatialConflict,
  getDescendantNodes,
  getCanvasPointer,
  hitTest,
  buildEdgeAnchors,
  getNodeLayerContent,
  nextAvailableMirrorName,
  normalizeColorIndex,
  setStatus,
  render,
});
_handlePointerUpImpl = interactionPointerUp.handlePointerUp;

const interactionClickWheel = createInteractionClickWheel({
  state,
  nodes,
  edges,
  getDescendantNodes,
  getCanvasPointer,
  getSelectionBBoxFromSession,
  getRectResizeHandleAt,
  isPointInRect,
  getEdgeEndpointHit,
  getEdgeBodyHit,
  hitTest,
  flushInspectorPendingEdits,
  setSingleEdgeSelection,
  setSingleNodeSelection,
  setStatus,
  rebuildSidebar,
  render: scheduleRender,
  renderRightPanel,
  finalizeTransformSession,
  screenToWorld,
});
_handleCanvasClickImpl = interactionClickWheel.handleCanvasClick;
_handleCanvasDoubleClickImpl = interactionClickWheel.handleCanvasDoubleClick;
_handleCanvasWheelImpl = interactionClickWheel.handleCanvasWheel;

const interactionKeyboard = createInteractionKeyboard({
  state,
  nodes,
  document,
  isTypingTarget,
  hasActiveTextSelection,
  finalizeTransformSession,
  cancelTransformSession,
  undoWithinTransformSessionOrExit,
  redoWithinTransformSession,
  undo,
  redo,
  runSave,
  runNewProject,
  setActiveLayerByIndex,
  copySelectionToClipboard,
  cutSelectionToClipboard,
  beginPastePreview,
  finalizePasteFromPreview,
  deleteSelectedElement,
  rebuildSidebar,
  renderRightPanel,
  render,
  setStatus,
});
_handleKeyDownImpl = interactionKeyboard.handleKeyDown;
_handleKeyUpImpl = interactionKeyboard.handleKeyUp;
_handleWindowBlurImpl = interactionKeyboard.handleBlur;

const canvasRendererPrimitives = createCanvasRendererPrimitives({
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
});
_getNodeScreenAreaPx2Impl = canvasRendererPrimitives.getNodeScreenAreaPx2;
_getNodeLodLevelImpl = canvasRendererPrimitives.getNodeLodLevel;
_drawEdgeImpl = canvasRendererPrimitives.drawEdge;
_drawNodeImpl = canvasRendererPrimitives.drawNode;

const canvasRendererOverlays = createCanvasRendererOverlays({
  state,
  nodes,
  ctx,
  RESIZE_HANDLE_SIZE_PX,
  cssVar,
  worldToScreen,
  getNodeLodLevel,
  getNodeStrokeColor: canvasRendererPrimitives.getNodeStrokeColor,
  getSelectionBBoxFromSession,
  getRectResizeHandles,
  getSelectionRectWorld,
});
_renderCanvasOverlaysImpl = canvasRendererOverlays.renderCanvasOverlays;

const canvasRendererScene = createCanvasRendererScene({
  nodes,
  edges,
  refreshHierarchyMeta,
  isNodeVisibleInActiveLayer,
  isEdgeVisibleInActiveLayer,
  getNodeLodLevel,
  drawAdaptiveGrid: canvasRendererPrimitives.drawAdaptiveGrid,
  drawNode,
  drawEdge,
  getNodeById: nodeIndex.getNodeById,
});
_renderGraphSceneItemsImpl = canvasRendererScene.renderGraphSceneItems;

const canvasRendererCore = createCanvasRendererCore({
  state,
  canvas,
  ctx,
  syncMirrorNodes,
  normalizeSelectedNodeIds,
  renderGraphSceneItems,
  renderCanvasOverlays,
  rebuildNodeIndex: nodeIndex.rebuild,
});
_renderImpl = canvasRendererCore.render;
_resizeCanvasToDisplayImpl = canvasRendererCore.resizeCanvasToDisplay;

function normalizeToolRelativePath(inputPath) {
  return appShellUI.normalizeToolRelativePath(inputPath);
}

function splitLinesKeepSimple(text) {
  return appShellUI.splitLinesKeepSimple(text);
}

// Agent tool runtime (I/O execution surface) delegated from app shell.
const agentToolRuntime = createAgentToolRuntime({
  state,
  electronAPI,
  normalizeToolRelativePath,
  splitLinesKeepSimple,
  refreshProjectFileTree,
  getCommandGuardEnabled: () => {
    // Guard is active unless the user has explicitly opted into skipping permissions.
    try { return loadAgentModelSettings()?.dangerouslySkipPermissions !== true; } catch (_) { return true; }
  },
});

async function toolReadByParams(params = {}) {
  return agentToolRuntime.toolReadByParams(params);
}

async function toolWriteByParams(params = {}) {
  return agentToolRuntime.toolWriteByParams(params);
}

async function toolEditByParams(params = {}) {
  return agentToolRuntime.toolEditByParams(params);
}

async function grepFilesByParams(params = {}) {
  return agentToolRuntime.grepFilesByParams(params);
}

async function readImageByParams(params = {}) {
  return agentToolRuntime.readImageByParams(params);
}

async function readDocxByParams(params = {}) {
  return agentToolRuntime.readDocxByParams(params);
}

async function runCommandByParams(params = {}) {
  return agentToolRuntime.runCommandByParams(params);
}

async function compileProjectByParams(params = {}) {
  return agentToolRuntime.compileProjectByParams(params);
}

async function runProjectByParams(params = {}) {
  return agentToolRuntime.runProjectByParams(params);
}

async function webFetchByParams(params = {}) {
  return agentToolRuntime.webFetchByParams(params);
}

async function screenshotCanvasByParams() {
  return agentToolRuntime.screenshotCanvasByParams();
}

function getViewportByParams() {
  return agentToolRuntime.getViewportByParams();
}

function setViewportByParams(params = {}) {
  const nextZoom = Number(params.zoom);
  if (Number.isFinite(nextZoom) && nextZoom > 0) state.zoom = nextZoom;
  const z = Math.max(0.0001, Number(state.zoom) || 1);
  const left = Number(params.left);
  const top = Number(params.top);
  if (Number.isFinite(left)) state.panX = -left * z;
  if (Number.isFinite(top)) state.panY = -top * z;
  render();
  return agentToolRuntime.getViewportByParams();
}

function todoWriteByParams(params = {}, ctx = {}) {
  const agentId = ctx?.agentId || agentChatState.activeAgentId;
  const todos = agentChatStateManager.setAgentTodos(agentId, params?.items);
  renderAgentTodoPanel(agentId);
  return { todos };
}

async function writeBinaryFileByRelativePath(relativePath, blob) {
  return agentToolRuntime.writeBinaryFileByRelativePath(relativePath, blob);
}

async function deleteFileByRelativePath(relativePath) {
  return agentToolRuntime.deleteFileByRelativePath(relativePath);
}

function updateSpriteFrameLabel() {
  return appShellUI.updateSpriteFrameLabel();
}

function renderSpritePreview() {
  return appShellUI.renderSpritePreview();
}

// File-tree module owns sidebar tree render + refresh lifecycle.
const fileTreeUI = createFileTreeUI({
  state,
  collapsedFileTreePaths,
  fileBrowser,
  fileBrowserEmpty,
  fileBrowserInfo,
  fileBrowserTabs,
  electronAPI,
  rebuildSidebarHook: () => rebuildSidebar(),
  setStatus,
  t,
});
_seedCollapsedFileTreeImpl = fileTreeUI.seedCollapsedFileTree;
_resetProjectFolderAssociationImpl = fileTreeUI.resetProjectFolderAssociation;
_getFileNameFromPathImpl = fileTreeUI.getFileNameFromPath;
_renderFileTreeImpl = fileTreeUI.renderFileTree;
_rebuildSidebarImpl = fileTreeUI.rebuildSidebar;
_refreshProjectFileTreeImpl = fileTreeUI.refreshProjectFileTree;
_focusNodeImpl = (node) => fileTreeUI.focusNode(node, canvas, state);

const inspectorUI = createInspectorUI({
  nodes,
  conflicts,
  state,
  dom: {
    emptySelection,
    editorForm,
    multiEditorForm,
    multiFieldColorIndex,
    multiColorIndexSwatch,
    edgeEditor,
    blockBindingPanel,
    edgeList,
    validationList,
    edgeIdField,
    edgeRelationField,
    edgeLabelField,
    edgePathStyleField,
    edgeStrokeStyleField,
    edgeArrowFromField,
    edgeArrowToField,
    edgeDescriptionField,
    edgeVisualControls,
    fieldName,
    fieldSummary,
    fieldDetail,
    fieldStatus,
    fieldColorIndex,
    colorIndexSwatch,
    fieldExpectedRevision,
    blockBinding,
    includeGuard,
    lockMessage,
    saveSelectionBtn,
  },
  graphPalette,
  normalizeSelectedNodeIds,
  getSelectedNode,
  getSelectedNodesOrdered,
  getSelectedEdge,
  getNodeLayerContent,
  hasConflict,
  isMirrorNode,
  getEdgeRelationExpr,
  setSingleNodeSelection,
  setSingleEdgeSelection,
  focusNode,
  pushHistory,
  updateTopbar,
  rebuildSidebar,
  render,
  setStatus,
  normalizeColorIndex,
  isNodeNameAvailable,
  getNodeRelations,
  getEdgeById: (edgeId) => edges.find((e) => e.id === edgeId) || null,
  t,
});
_renderRightPanelImpl = inspectorUI.renderRightPanel;
_setEditorLockedImpl = inspectorUI.setEditorLocked;
_applyEdgeEditorChangesImpl = inspectorUI.applyEdgeEditorChanges;
_updateEdgeByParamsImpl = inspectorUI.updateEdgeByParams;
_addResourceBindingFromInspectorImpl = inspectorUI.addResourceBindingFromInspector;
_applySelectedNodeChangesImpl = inspectorUI.applySelectedNodeChanges;
_applyMultiNodeColorChangeImpl = inspectorUI.applyMultiNodeColorChange;

async function applyBackendProject(result) {
  if (!result) return;
  try {
    const payload = JSON.parse(result.angelContent);
    const fileLabel = getFileNameFromPath(result.angelPath);
    applyProjectData(payload, fileLabel);
    state.projectRootPath = result.rootPath;
    setAgentSessionDirty(false);
    state.angelFilePath = result.angelPath;
    state.currentProjectDirHandle = null;
    state.currentProjectFileHandle = null;
    state.lastSaveFileName = fileLabel;
    state.projectFileTree = Array.isArray(result.fileTree) ? result.fileTree : [];
    collapsedFileTreePaths.clear();
    if (state.projectFileTree.length > 0) {
      seedCollapsedFileTree(state.projectFileTree);
    }
    rebuildSidebar();
    try {
      await loadAgentMemoriesForActiveProject({ reason: 'backend-project' });
    } catch (memoryError) {
      console.error('Agent memory preload failed', memoryError);
      setStatus(`Project loaded, but agent memories failed: ${memoryError?.message || 'unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to apply backend project', error);
    setStatus(`Failed to load project: ${error.message || 'invalid data'}`);
  }
}

const menuShell = createMenuShell({ menuBar });
_closeAllMenusImpl = menuShell.closeAllMenus;
menuShell.bind();

const projectIOController = createProjectIOController({
  state,
  nodes,
  edges,
  containmentRelations,
  mirrorRelations,
  deepClone,
  replaceArray,
  normalizeGraphSchema,
  layerSelect,
  syncSidebarCollapsedState,
  rebuildSidebar,
  renderRightPanel,
  renderConflicts,
  render,
  updateTopbar,
  setStatus,
  getUnsavedCount,
  resetProjectFolderAssociation,
  getFileNameFromPath,
  refreshProjectFileTree,
  loadAgentMemoriesForActiveProject,
  applyBackendProject,
  supportsDirectoryPicker,
  electronAPI,
  projectFileInput,
  collapsedFileTreePaths,
  rightPanel,
  applyAppGridColumns,
  topbarRight,
  requestRunTestName,
  requestRunTestOptions,
  executeFailModal,
  executeFailClose,
  executeFailMessage,
  executeFailDetail,
  buildToolsModal,
  buildToolsClose,
  buildToolsRecheck,
  onProjectTemplateApplied: (projectTemplate) => {
    agentChatStateManager.resetAgents(projectTemplate?.agents || []);
    renderAgentSidebar();
    renderAgentTimeline();
    renderAgentStatusBar();
    renderLayerQuickSwitch();
  },
});
_runSaveImpl = projectIOController.runSave;
_applyProjectDataImpl = projectIOController.applyProjectData;
_runNewProjectImpl = projectIOController.runNewProject;
_runOpenProjectImpl = projectIOController.runOpenProject;
_loadProjectFileImpl = projectIOController.loadProjectFile;
_loadProjectFromDirectoryImpl = projectIOController.loadProjectFromDirectory;
_setActiveLayerByIndexImpl = (...args) => {
  const result = projectIOController.setActiveLayerByIndex(...args);
  renderLayerQuickSwitch();
  return result;
};
_runExecutionImpl = projectIOController.runExecution;
_toggleRightPanelImpl = projectIOController.toggleRightPanel;
_toggleProjectBrowserImpl = projectIOController.toggleProjectBrowser;
_toggleAgentBarImpl = projectIOController.toggleAgentBar;

function getNodesAtPoint(worldX, worldY) {
  return appShellUI.getNodesAtPoint(worldX, worldY);
}

function applyResize(node, handle, worldX, worldY) {
  return appShellUI.applyResize(node, handle, worldX, worldY);
}

function renderConflicts() {
  return appShellUI.renderConflicts();
}

function isTypingTarget(target) {
  return appShellUI.isTypingTarget(target);
}

function hasActiveTextSelection() {
  return appShellUI.hasActiveTextSelection();
}

const interactionTransformContextMenuBridge = createInteractionTransformContextMenuBridge({
  canvas,
  canvasContextMenu,
  ctxTransformScaleBtn,
  ctxTransformRotate90Btn,
  ctxTransformFlipHBtn,
  ctxTransformLayoutBtn,
  getCanvasPointer,
  hitTest,
  state,
  beginTransformSession,
  rotateOrFlipSelection,
  pushTransformPreviewCheckpoint,
  inferLayoutDirectionFromSelection,
  previewElkLayoutInSelection,
  cancelTransformSession,
  setStatus,
  render,
});

const { hideCanvasContextMenu } = interactionTransformContextMenuBridge;
interactionTransformContextMenuBridge.bind();

const interactionEventBindings = createInteractionEventBindings({
  canvas,
  window,
  hideCanvasContextMenu,
  handlePointerDown,
  handlePointerUp,
  handlePointerMove,
  handleCanvasClick,
  handleCanvasDoubleClick,
  handleCanvasWheel,
});
interactionEventBindings.bind();

window.addEventListener('keydown', (e) => {
  handleKeyDown(e);
});

window.addEventListener('keyup', (e) => {
  handleKeyUp(e);
});

window.addEventListener('blur', () => {
  handleWindowBlur();
});

resetBtn.addEventListener('click', () => {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  setStatus('View reset');
  render();
});

if (fileRefreshBtn) {
  fileRefreshBtn.addEventListener('click', async () => {
    if (!state.currentProjectDirHandle && !(electronAPI && state.projectRootPath)) {
      setStatus('No project folder to refresh');
      return;
    }
    await refreshProjectFileTree();
  });
}

if (sidebarResize) {
  sidebarResize.addEventListener('pointerdown', (e) => {
    if (state.sidebarCollapsed) return;
    e.preventDefault();
    sidebarResize.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-left-panel');
    const startX = e.clientX;
    const startWidth = state.leftPanelWidth;

    const onMove = (evt) => {
      const delta = evt.clientX - startX;
      state.leftPanelWidth = Math.max(200, Math.min(560, startWidth + delta));
      applyAppGridColumns();
    };

    const onUp = (evt) => {
      sidebarResize.releasePointerCapture(evt.pointerId);
      sidebarResize.removeEventListener('pointermove', onMove);
      sidebarResize.removeEventListener('pointerup', onUp);
      sidebarResize.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('resizing-left-panel');
    };

    sidebarResize.addEventListener('pointermove', onMove);
    sidebarResize.addEventListener('pointerup', onUp);
    sidebarResize.addEventListener('pointercancel', onUp);
  });
}

function applyAppGridColumns() {
  rightPanel?.classList.toggle('open', !state.rightPanelCollapsed);
  return appShellUI.applyAppGridColumns();
}

function syncSidebarCollapsedState() {
  const result = appShellUI.syncSidebarCollapsedState();
  if (sidebarResize) {
    sidebarResize.classList.toggle('disabled', state.sidebarCollapsed);
    sidebarResize.classList.toggle('hidden', state.sidebarCollapsed);
  }
  rebuildSidebar();
  return result;
}

layerSelect.addEventListener('change', () => {
  state.activeLayer = layerSelect.value;

  const selectedNode = getSelectedNode();
  const selectedEdge = getSelectedEdge();
  if (selectedNode && !isNodeVisibleInActiveLayer(selectedNode)) {
    state.selectedNodeId = null;
    state.selectedNodeIds = new Set();
  }
  if (selectedEdge && !isEdgeVisibleInActiveLayer(selectedEdge)) {
    state.selectedEdgeId = null;
  }

  rebuildSidebar();
  renderRightPanel();
  render();
  renderLayerQuickSwitch();
  setStatus(`Layer: ${state.activeLayer}`);
});

if (rightPanelResize) {
  rightPanelResize.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    rightPanelResize.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-right-panel');

    const RIGHT_PANEL_MIN = 260;
    const RIGHT_PANEL_COLLAPSE_THRESHOLD = 160;
    const startX = e.clientX;
    const startWidth = state.rightPanelCollapsed ? 0 : state.rightPanelWidth;

    const onMove = (ev) => {
      const desired = startWidth + (startX - ev.clientX);
      if (desired < RIGHT_PANEL_COLLAPSE_THRESHOLD) {
        state.rightPanelCollapsed = true;
      } else {
        state.rightPanelCollapsed = false;
        state.rightPanelWidth = Math.min(760, Math.max(RIGHT_PANEL_MIN, desired));
      }
      applyAppGridColumns();
    };

    const onUp = (ev) => {
      rightPanelResize.releasePointerCapture(ev.pointerId);
      rightPanelResize.removeEventListener('pointermove', onMove);
      rightPanelResize.removeEventListener('pointerup', onUp);
      rightPanelResize.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('resizing-right-panel');
      if (!state.rightPanelCollapsed) setStatus(`Inspector width: ${Math.round(state.rightPanelWidth)}px`);
    };

    rightPanelResize.addEventListener('pointermove', onMove);
    rightPanelResize.addEventListener('pointerup', onUp);
    rightPanelResize.addEventListener('pointercancel', onUp);
  });
}

let pendingNewProjectDir = '';
let agentSessionDirty = false;
let pendingSaveChangesAction = null;

function setAgentSessionDirty(value) {
  agentSessionDirty = Boolean(value);
}

function hasUnsavedProjectOrSessionChanges() {
  return getUnsavedCount() > 0 || agentSessionDirty;
}

async function maybeGuardUnsavedExit(action) {
  if (!hasUnsavedProjectOrSessionChanges()) {
    await action();
    return true;
  }
  closeAllMenus();
  pendingSaveChangesAction = typeof action === 'function' ? action : null;
  const parts = [];
  if (getUnsavedCount() > 0) parts.push('project');
  if (agentSessionDirty) parts.push('agent session');
  if (saveChangesMessage) saveChangesMessage.textContent = `You have unsaved ${(parts.join(' + ') || 'project')} changes.`;
  if (saveChangesModal) {
    saveChangesModal.classList.remove('hidden');
    saveChangesModal.setAttribute('aria-hidden', 'false');
  }
  return false;
}

function closeSaveChangesModal() {
  if (saveChangesModal) {
    saveChangesModal.classList.add('hidden');
    saveChangesModal.setAttribute('aria-hidden', 'true');
  }
  pendingSaveChangesAction = null;
}

function refreshNewProjectConfirmEnabled() {
  if (newProjectConfirm) newProjectConfirm.disabled = !pendingNewProjectDir;
}

function openNewProjectModal() {
  if (!newProjectModal) return;
  pendingNewProjectDir = '';
  if (newProjectLocation) newProjectLocation.value = '';
  refreshNewProjectConfirmEnabled();
  newProjectModal.classList.remove('hidden');
  newProjectModal.setAttribute('aria-hidden', 'false');
}

function closeNewProjectModal() {
  if (!newProjectModal) return;
  newProjectModal.classList.add('hidden');
  newProjectModal.setAttribute('aria-hidden', 'true');
}

menuNewProject.addEventListener('click', async () => {
  if (electronAPI?.createProject) {
    await maybeGuardUnsavedExit(async () => openNewProjectModal());
    return;
  }
  await maybeGuardUnsavedExit(async () => runNewProject({ skipUnsavedConfirm: true }));
});

[newProjectClose, newProjectCancel].forEach((btn) => {
  btn?.addEventListener('click', () => closeNewProjectModal());
});

newProjectModal?.addEventListener('click', (evt) => {
  const target = evt?.target;
  if (target && target.dataset && target.dataset.closeNewProject) {
    closeNewProjectModal();
  }
});

newProjectChooseFolder?.addEventListener('click', async () => {
  if (!electronAPI?.chooseProjectFolder) return;
  try {
    const result = await electronAPI.chooseProjectFolder();
    pendingNewProjectDir = String(result?.targetDir || '');
    if (newProjectLocation) newProjectLocation.value = pendingNewProjectDir;
    refreshNewProjectConfirmEnabled();
  } catch (error) {
    if (error?.message !== 'USER_CANCEL') setStatus(`Choose folder failed: ${error?.message || 'unknown error'}`);
  }
});

newProjectConfirm?.addEventListener('click', async () => {
  const templateId = String(newProjectTemplate?.value || 'default');
  if (!pendingNewProjectDir) {
    setStatus('Please choose a folder first.');
    return;
  }
  await runNewProject({ templateId, targetDir: pendingNewProjectDir });
  closeNewProjectModal();
});

function renderLayerQuickSwitch() {
  if (!layerQuickSwitch) return;
  const layers = Array.isArray(state.projectTemplate?.layers) ? state.projectTemplate.layers : [];
  layerQuickSwitch.innerHTML = '';
  for (let i = 0; i < layers.length; i += 1) {
    const lid = String(layers[i]);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = lid;
    if (state.activeLayer === lid) btn.classList.add('active');
    btn.addEventListener('click', () => {
      setActiveLayerByIndex(i);
      renderLayerQuickSwitch();
    });
    layerQuickSwitch.appendChild(btn);
  }
}

menuOpen.addEventListener('click', async () => { await maybeGuardUnsavedExit(async () => runOpenProject({ skipUnsavedConfirm: true })); });
menuSave.addEventListener('click', async () => { await runSave({ saveAs: false }); closeAllMenus(); });
menuSaveAs.addEventListener('click', async () => { await runSave({ saveAs: true }); closeAllMenus(); });

[saveChangesClose, saveChangesCancel].forEach((btn) => btn?.addEventListener('click', () => closeSaveChangesModal()));

saveChangesNo?.addEventListener('click', async () => {
  const action = pendingSaveChangesAction;
  closeSaveChangesModal();
  if (typeof action === 'function') await action();
});

saveChangesYes?.addEventListener('click', async () => {
  const action = pendingSaveChangesAction;
  try {
    await runSave({ saveAs: false });
    closeSaveChangesModal();
    if (typeof action === 'function') await action();
  } catch (error) {
    console.error('Save before continue failed', error);
    setStatus(`Save failed: ${error?.message || 'unknown error'}`);
  }
});

window.addEventListener('beforeunload', (event) => {
  if (!hasUnsavedProjectOrSessionChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

menuUndo.addEventListener('click', () => { undo(); closeAllMenus(); });
menuRedo.addEventListener('click', () => { redo(); closeAllMenus(); });
menuCut.addEventListener('click', () => { setStatus('Cut placeholder'); closeAllMenus(); });
menuCopy.addEventListener('click', () => { setStatus('Copy placeholder'); closeAllMenus(); });
menuPaste.addEventListener('click', () => { setStatus('Paste placeholder'); closeAllMenus(); });

menuInspector.addEventListener('click', () => { toggleRightPanel(); closeAllMenus(); });
menuProjectBrowser.addEventListener('click', () => { toggleProjectBrowser(); closeAllMenus(); });

themeSettingsController.bind();
const assetGeneration = createAssetGeneration({
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
});

const {
  loadSpriteFramesFromInput,
  createSpriteAtlasAndMetadata,
  buildSpriteAtlasAndMetadataFromFrames: buildSpriteAtlasAndMetadataFromFramesFn,
  refreshFontPreview,
  loadSelectedFontFile,
  refreshSystemFontOptions,
  useSystemFontFamily,
  setFontSourceMode,
  appendCharsetFromFiles,
  createBitmapFontAssets,
  createAudioAsset,
} = assetGeneration;
buildSpriteAtlasAndMetadataFromFrames = buildSpriteAtlasAndMetadataFromFramesFn;

const assetModalLifecycle = createAssetModalLifecycle({
  spriteModal,
  spritePathInput,
  renderSpritePreview,
  fontModal,
  fontPathInput,
  fontNameInput,
  fontCharsetInput,
  fontPreviewInput,
  fontPreviewScaleInput,
  setFontSourceMode,
  refreshFontPreview,
  audioModal,
  audioPathInput,
  audioNameInput,
  audioFormatInput,
  audioBitrateRow,
  audioBitrateInput,
  audioSampleRateRow,
  audioSampleRateInput,
  audioBitDepthRow,
  audioBitDepthInput,
});
_openSpriteModalImpl = assetModalLifecycle.openSpriteModal;
_closeSpriteModalImpl = assetModalLifecycle.closeSpriteModal;
_openFontModalImpl = assetModalLifecycle.openFontModal;
_closeFontModalImpl = assetModalLifecycle.closeFontModal;
const openAudioModal = assetModalLifecycle.openAudioModal;
const closeAudioModal = assetModalLifecycle.closeAudioModal;
const syncAudioFormatFields = assetModalLifecycle.syncAudioFormatFields;

const runTestModalController = createRunTestModalController({
  runTestModal,
  runTestInput,
  runTestHistory,
  runTestDebug,
  runTestRecord,
  runTestNote,
});
_closeRunTestModalImpl = runTestModalController.closeRunTestModal;
_resolveRunTestModalImpl = runTestModalController.resolveRunTestModal;
_requestRunTestNameImpl = runTestModalController.requestRunTestName;
_requestRunTestOptionsImpl = runTestModalController.requestRunTestOptions;

const cliMemorySeedModalController = createCliMemorySeedModalController({
  modal: document.getElementById('cli-memory-seed-modal'),
  optionsContainer: document.getElementById('cli-memory-seed-options'),
  messageEl: document.getElementById('cli-memory-seed-message'),
  emptyBtn: document.getElementById('cli-memory-seed-empty'),
  closeBtn: document.getElementById('cli-memory-seed-close'),
  t,
});

menuAgentModel.addEventListener('click', () => {
  openAgentModelSettingsModal();
  closeAllMenus();
  setStatus('Opened Agent Model settings');
});
if (menuLanguage) {
  menuLanguage.addEventListener('click', () => {
    openLanguageModal();
    closeAllMenus();
    setStatus(t('modal.language.opened'));
  });
}
if (languageClose) {
  languageClose.addEventListener('click', () => {
    closeLanguageModal();
    setStatus(t('modal.language.closed'));
  });
}
if (languageCancel) {
  languageCancel.addEventListener('click', () => {
    closeLanguageModal();
    setStatus(t('modal.language.closed'));
  });
}
if (languageSave) {
  languageSave.addEventListener('click', async () => {
    const nextLocale = String(languageSelect?.value || 'en');
    const nextFont = String(languageFontSelect?.value || '');
    saveLocale(nextLocale);
    saveAppFont(nextLocale, nextFont);
    applyAppFont(nextFont);
    await applyLocale(nextLocale);
    closeLanguageModal();
    setStatus(t('modal.language.updated'));
  });
}
if (languageModal) {
  languageModal.addEventListener('click', (evt) => {
    const target = evt.target;
    if (target && target.dataset && target.dataset.closeLanguage) {
      closeLanguageModal();
      setStatus(t('modal.language.closed'));
    }
  });
}
menuCreateSprite.addEventListener('click', () => {
  openSpriteModal();
  closeAllMenus();
  setStatus(t('modal.sprite.status.opened'));
});
menuCreateFont.addEventListener('click', () => {
  openFontModal();
  closeAllMenus();
  setStatus('Opened Create Font');
});
menuCreateAudio?.addEventListener('click', () => {
  openAudioModal();
  closeAllMenus();
  setStatus(t('modal.audio.status.opened'));
});

agentModelSettingsController.bindEvents();

const assetModalBindings = createAssetModalBindings({
  t,
  dom: {
    spriteFilesInput,
    spriteNameInput,
    spriteNote,
    spritePivotXInput,
    spritePivotYInput,
    spritePreviewCanvas,
    spritePrevFrameBtn,
    spriteNextFrameBtn,
    spriteClose,
    spriteCancel,
    spriteCreate,
    spriteModal,
    fontSourceSystemRadio,
    fontSourceFileRadio,
    fontFileInput,
    fontNameInput,
    fontSystemSelect,
    fontNote,
    fontCharsetFilesInput,
    fontPreviewInput,
    fontPreviewScaleInput,
    fontSizeInput,
    fontHintingInput,
    fontAntialiasInput,
    fontClose,
    fontCancel,
    fontCreate,
    fontModal,
    audioClose,
    audioCancel,
    audioCreate,
    audioFileInput,
    audioNameInput,
    audioFormatInput,
    audioBitrateRow,
    audioNote,
    audioModal,
    audioSampleRateRow,
    audioBitDepthRow,
    runTestInput,
    runTestDebug,
    runTestRecord,
    runTestClose,
    runTestCancel,
    runTestConfirm,
    runTestModal,
  },
  spriteBuildState,
  loadSpriteFramesFromInput,
  renderSpritePreview,
  createSpriteAtlasAndMetadata,
  closeSpriteModal,
  loadSelectedFontFile,
  refreshSystemFontOptions,
  useSystemFontFamily,
  setFontSourceMode,
  appendCharsetFromFiles,
  refreshFontPreview,
  closeFontModal,
  createBitmapFontAssets,
  createAudioAsset,
  closeAudioModal,
  syncAudioFormatFields,
  resolveRunTestModal,
  setStatus,
  t,
});
assetModalBindings.bind();

function escapeHtmlForMarkdown(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderBasicMarkdownToHtml(raw) {
  const normalized = String(raw || '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const out = [];

  let inUl = false;
  let inOl = false;
  let inCode = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push(`<p>${formatInlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeLists = () => {
    if (inUl) out.push('</ul>');
    if (inOl) out.push('</ol>');
    inUl = false;
    inOl = false;
  };

  function formatInlineMarkdown(source) {
    let s = escapeHtmlForMarkdown(source);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\(([^)]+)\)\[([A-Za-z0-9._\-/]+\.md)\]/g, '<a href="#" data-help-doc="$2">$1</a>');
    s = s.replace(/\[([^\]]+)\]\(([A-Za-z0-9._\-/]+\.md)\)/g, '<a href="#" data-help-doc="$2">$1</a>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return s;
  }

  for (const lineRaw of lines) {
    const line = lineRaw.trimEnd();

    if (line.trimStart().startsWith('```')) {
      flushParagraph();
      closeLists();
      if (!inCode) {
        out.push('<pre><code>');
        inCode = true;
      } else {
        out.push('</code></pre>');
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      out.push(`${escapeHtmlForMarkdown(lineRaw)}\n`);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeLists();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeLists();
      const level = heading[1].length;
      out.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(line)) {
      flushParagraph();
      closeLists();
      out.push('<hr />');
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      flushParagraph();
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${formatInlineMarkdown(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      flushParagraph();
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${formatInlineMarkdown(ol[1])}</li>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  closeLists();
  if (inCode) out.push('</code></pre>');
  return out.join('');
}

function normalizeHelpDocPath(inputPath) {
  const raw = String(inputPath || 'home.md').trim().replace(/\\/g, '/');
  const safe = raw.replace(/^\/+/, '').replace(/\.\.+\//g, '');
  if (!safe || !safe.toLowerCase().endsWith('.md')) return 'home.md';
  return safe;
}

function getCurrentHelpLocaleFolder() {
  const locale = String(languageSelect?.value || getSavedLocale?.() || 'en').trim() || 'en';
  return locale.replace(/[^A-Za-z0-9_-]/g, '') || 'en';
}

async function openHelpModal(docPath = 'home.md') {
  if (!helpModal || !helpMarkdown) return;

  const safePath = normalizeHelpDocPath(docPath);
  const localeFolder = getCurrentHelpLocaleFolder();

  // Try the current locale first; if that doc is missing (untranslated), fall
  // back to the English version so Help shows content instead of an error.
  const candidates = [];
  candidates.push(`../about/${localeFolder}/${safePath}`);
  if (localeFolder !== 'en') candidates.push(`../about/en/${safePath}`);

  let md = '';
  let lastError = '';
  for (const fetchPath of candidates) {
    try {
      const res = await fetch(fetchPath, { cache: 'no-store' });
      if (res.ok) { md = await res.text(); break; }
      lastError = `Failed to load \`${fetchPath.replace('../', '')}\` (HTTP ${res.status}).`;
    } catch (error) {
      lastError = `Failed to load \`${fetchPath.replace('../', '')}\`.\n\n- Error: ${error?.message || 'unknown error'}`;
    }
  }
  if (!md) md = `# Help\n\n${lastError || 'No help content found.'}`;

  helpMarkdown.innerHTML = renderBasicMarkdownToHtml(md);
  helpModal.classList.remove('hidden');
  helpModal.setAttribute('aria-hidden', 'false');
}

function closeHelpModal() {
  if (!helpModal) return;
  helpModal.classList.add('hidden');
  helpModal.setAttribute('aria-hidden', 'true');
}

menuCompile.addEventListener('click', async () => { await runExecution('compile'); closeAllMenus(); });
menuExportRelease.addEventListener('click', async () => { await runExecution('export-release'); closeAllMenus(); });
menuRun.addEventListener('click', async () => { await runExecution('run'); closeAllMenus(); });
menuRunTest.addEventListener('click', async () => { await runExecution('run-test'); closeAllMenus(); });

menuAbout.addEventListener('click', async () => {
  await openHelpModal();
  setStatus('Opened Help');
  closeAllMenus();
});

if (helpClose) {
  helpClose.addEventListener('click', () => {
    closeHelpModal();
    setStatus('Help closed');
  });
}

if (helpModal) {
  helpModal.addEventListener('click', (evt) => {
    const target = evt.target;
    if (target && target.dataset && target.dataset.closeHelp) {
      closeHelpModal();
      setStatus('Help closed');
    }
  });
}

if (helpMarkdown) {
  helpMarkdown.addEventListener('click', async (evt) => {
    const el = evt.target?.closest?.('a[data-help-doc]');
    if (!el) return;
    evt.preventDefault();
    const nextDoc = el.getAttribute('data-help-doc') || 'home.md';
    await openHelpModal(nextDoc);
    setStatus(`Opened Help: ${normalizeHelpDocPath(nextDoc)}`);
  });
}

projectFileInput.addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    await loadProjectFile(file);
    resetProjectFolderAssociation();
  } catch (error) {
    console.error('Open failed via file input', error);
    setStatus(`Open failed: ${error.message || 'invalid file'}`);
  }
});

if (chipConflicts) chipConflicts.addEventListener('click', toggleRightPanel);

bindingAddBtn.addEventListener('click', addResourceBindingFromInspector);

// Auto-save on actual field commit (change/blur), no debounce timer.
edgeDescriptionField.addEventListener('change', applyEdgeEditorChanges);
edgeDescriptionField.addEventListener('blur', applyEdgeEditorChanges);
edgePathStyleField.addEventListener('change', applyEdgeEditorChanges);
edgeStrokeStyleField.addEventListener('change', applyEdgeEditorChanges);
edgeArrowFromField.addEventListener('change', applyEdgeEditorChanges);
edgeArrowToField.addEventListener('change', applyEdgeEditorChanges);

fieldName.addEventListener('change', applySelectedNodeChanges);
fieldSummary.addEventListener('change', applySelectedNodeChanges);
fieldDetail.addEventListener('change', applySelectedNodeChanges);
fieldName.addEventListener('blur', applySelectedNodeChanges);
fieldSummary.addEventListener('blur', applySelectedNodeChanges);
fieldDetail.addEventListener('blur', applySelectedNodeChanges);
if (fieldStatus) fieldStatus.addEventListener('change', applySelectedNodeChanges);
if (fieldColorIndex) {
  fieldColorIndex.addEventListener('change', applySelectedNodeChanges);
  fieldColorIndex.addEventListener('blur', applySelectedNodeChanges);
}
if (multiFieldColorIndex) {
  multiFieldColorIndex.addEventListener('change', applyMultiNodeColorChange);
}

const agentChatStateManager = createAgentChatStateManager({
  defaultContextMaxTokens: AGENT_DEFAULT_CONTEXT_MAX_TOKENS,
  modelContextLimits: AGENT_MODEL_CONTEXT_SUGGESTED_LIMITS,
  initialAgents: state.projectTemplate?.agents,
});
const agentChatState = agentChatStateManager.state;

// Rebuilds in-memory canonical turns from disk after an auto-compact.
// Mirrors the session-restart reconstruction: memory files + 12k recent history.
// Called only from compactAndRebuildCanonical in ui-shell (never at init time).
async function rebuildCanonicalAfterCompact(agentId) {
  const MAX_COMPACT_READ_ITERATIONS = 50;
  const MAX_COMPACT_HISTORY_CHARS = 12000;
  const folderName = AGENT_MEMORY_FOLDER_BY_ID[agentId] || agentId;

  async function readFileText(relPath) {
    const parts = [];
    let offset = 1;
    for (let i = 0; i < MAX_COMPACT_READ_ITERATIONS; i += 1) {
      const result = await toolReadByParams({ path: relPath, offset, limit: AGENT_MEMORY_READ_LIMIT });
      parts.push(typeof result?.content === 'string' ? result.content : '');
      if (!result?.truncated || !result?.nextOffset) break;
      offset = result.nextOffset;
    }
    return parts.join('\n');
  }

  // Build recent canonical turns from the latest.json snapshot (saved at compact start).
  let recentTurns = [];
  try {
    const raw = await readFileText(`agents/${folderName}/history/latest.json`);
    recentTurns = buildRecentCanonicalTurns(raw, MAX_COMPACT_HISTORY_CHARS);
  } catch (_) {}

  // Load memory files in the same order/format as session-restart reconstruction.
  const memoryTurns = [];
  for (const fileDef of AGENT_MEMORY_FILES) {
    const relPath = `agents/${folderName}/${fileDef.name}`;
    try {
      const result = await toolReadByParams({ path: relPath, limit: AGENT_MEMORY_READ_LIMIT });
      const text = String(result?.content || '').trim();
      if (text) {
        const heading = fileDef.name === 'memory_recent.md' ? '以下是对近期会话的汇总：' : '以下是对于项目的长期记忆：';
        memoryTurns.push({
          role: 'developer',
          text: `<SYSTEM EVENT>:\n${heading}\n${text}`,
          includeInContext: true,
          recoveryInjected: true,
          messageKind: 'recovery',
        });
      }
    } catch (_) {}
  }

  agentChatStateManager.resetAgentCanonical(agentId);
  if (memoryTurns.length > 0 || recentTurns.length > 0) {
    agentChatStateManager.appendCanonicalTurns(agentId, [...memoryTurns, ...recentTurns]);
  }
}

const agentChatUIShell = createAgentChatUIShell({
  agentChatStateManager,
  agentChatState,
  dom: {
    agentChatWindow,
    agentChatTitlebar,
    agentChatToggle,
    agentChatResize,
    agentChatBody,
    agentChatInput,
    agentChatSend,
    agentChatSaveMemory,
    agentChatCompressMemory,
    agentChatStatus,
    agentChatSidebar,
    agentChatSidebarResize,
    agentChatTimeline,
    agentChatTodos,
    agentChatPanelResize,
    agentTokenStats,
    agentRunUntilDone,
    agentChatComposerResize,
    agentChatComposer,
    agentChatImagePreview,
    agentChatImageLightbox,
    agentChatImageLightboxImg,
    electronAPI,
  },
  // Route the agent conversation through the dispatcher so a request runs on the
  // CLI line or the HTTP line per the active profile. (Same name → no shell edits;
  // context-compaction in app.js keeps calling requestDefaultModelCompletion, i.e.
  // the HTTP line only, since compaction is the CLI's own job.)
  requestDefaultModelCompletion: requestAgentCompletion,
  loadAgentModelSettings,
  setStatus,
  getContextLimitByModel,
  autoCompactThreshold: AUTO_COMPACT_THRESHOLD,
  agentContextCompactionManager,
  rebuildCanonicalAfterCompact,
  loadPromptTextByPath,
  SAVE_MEMORY_PROMPT_PATH,
  SAVE_RECENT_MEMORY_PROMPT_PATH,
  loadAgentMemoriesForActiveProject: (options = {}) => loadAgentMemoriesForActiveProject(options),
  AGENT_DEFAULT_CONTEXT_MAX_TOKENS,
  projectRootPathGetter: () => state.projectRootPath || '',
  getCliUsageContext,
  fetchCliUsageWindows,
  isCliBackendActive,
  t,
  renderMarkdown: renderBasicMarkdownToHtml,
});
const getAgentDisplayName = agentChatUIShell.getAgentDisplayName;
const setAgentStatus = agentChatUIShell.setAgentStatus;
const setAgentContextUsage = agentChatUIShell.setAgentContextUsage;
_renderAgentStatusBarImpl = agentChatUIShell.renderAgentStatusBar;
_renderAgentSidebarImpl = agentChatUIShell.renderAgentSidebar;
_renderAgentTimelineImpl = agentChatUIShell.renderAgentTimeline;
_renderAgentTodoPanelImpl = agentChatUIShell.renderAgentTodoPanel;
_renderAgentCtxBarImpl = agentChatUIShell.renderAgentCtxBar;
_syncContextLimitFromModelImpl = agentChatUIShell.syncContextLimitFromModel;
_syncAgentSendButtonImpl = agentChatUIShell.syncAgentSendButton;
_pushAgentMessageImpl = agentChatUIShell.pushAgentMessage;
_formatSystemEventTextImpl = agentChatUIShell.formatSystemEventText;
_initAgentChatWindowImpl = agentChatUIShell.initAgentChatWindow;
_resetAgentChatSessionsForNewProjectImpl = agentChatUIShell.resetAgentChatSessionsForNewProject;
_persistAllAgentSessionSnapshotsImpl = agentChatUIShell.persistAllAgentSessionSnapshots;

function getContextLimitByModel(modelName) {
  return agentChatStateManager.getContextLimitByModel(modelName);
}

function isMissingFileSystemError(error) {
  if (!error) return false;
  if (error.code === 'ENOENT') return true;
  const name = String(error.name || '').toLowerCase();
  if (name.includes('notfounderror')) return true;
  const message = String(error.message || error).toLowerCase();
  return message.includes('enoent') || message.includes('not found');
}

const agentMemoryPreload = createAgentMemoryPreload({
  state,
  agentChatState,
  resetAgentChatSessionsForNewProject,
  renderAgentTimeline,
  renderAgentStatusBar,
  renderAgentTodoPanel,
  AGENT_MEMORY_FOLDER_BY_ID,
  AGENT_MEMORY_FILES,
  AGENT_MEMORY_READ_LIMIT,
  toolReadByParams,
  pushAgentMessage,
  recordDeveloperText: agentChatUIShell.recordDeveloperText,
  appendCanonicalTurns: agentChatStateManager.appendCanonicalTurns,
  restoreAgentSession: agentChatStateManager.restoreAgentSession,
  setAgentTodos: agentChatStateManager.setAgentTodos,
  formatSystemEventText,
  isMissingFileSystemError,
  setStatus,
});

async function loadAgentMemoriesForActiveProject(options = {}) {
  return agentMemoryPreload.loadAgentMemoriesForActiveProject(options);
}

window.addEventListener('resize', resizeCanvasToDisplay);
window.addEventListener('keydown', (evt) => {
  if (evt.key === 'Escape' && agentModelModal && !agentModelModal.classList.contains('hidden')) {
    closeAgentModelSettingsModal();
    setStatus('Agent model settings closed');
  }
  if (evt.key === 'Escape' && themeModal && !themeModal.classList.contains('hidden')) {
    themeSettingsController.close();
    setStatus('Theme settings closed');
  }
  if (evt.key === 'Escape' && spriteModal && !spriteModal.classList.contains('hidden')) {
    closeSpriteModal();
    setStatus('Create Sprite closed');
  }
  if (evt.key === 'Escape' && fontModal && !fontModal.classList.contains('hidden')) {
    closeFontModal();
    setStatus('Create Font closed');
  }
  if (evt.key === 'Escape' && audioModal && !audioModal.classList.contains('hidden')) {
    closeAudioModal();
    setStatus(t('modal.audio.status.closed'));
  }
  if (evt.key === 'Escape' && runTestModal && !runTestModal.classList.contains('hidden')) {
    resolveRunTestModal(null);
    setStatus('Run Test cancelled');
  }
});
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => resizeCanvasToDisplay());
  ro.observe(canvas);
}

renderLayerQuickSwitch();

async function initializeApp() {
  await hydrateAgentModelSettings();
  const _startLocale = getSavedLocale();
  applyAppFont(getSavedAppFont(_startLocale));
  await applyLocale(_startLocale);
  await themeSettingsController.hydrate();

  normalizeGraphSchema();
  updateTopbar();
  renderConflicts();
  applyAppGridColumns();
  resizeCanvasToDisplay();
  render();
  rebuildSidebar();
  renderRightPanel();
  initAgentChatWindow();
}

initializeApp();




