const OPENAI_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

export function createAgentModelSettingsController(deps) {
  const {
    electronAPI,
    storage,
    settingsStorageKey,
    catalog,
    getDefaultSettings,
    normalizeSettings,
    getReasoningOptions = () => [],
    dom,
    setStatus,
    resolveCliAuthTarget = () => null,
    onSettingsSaved = () => {},
    onCliBackendSwitched = () => {},
    t = (key) => key,
  } = deps;

  let settingsCache = getDefaultSettings();

  // Live model lists fetched from each provider, merged on top of the static
  // catalog. Keyed by `${providerId}:${methodId}`; a populated entry short-circuits
  // further fetches (and prevents the render -> fetch -> render loop). inFlight
  // dedupes concurrent fetches; the seq guard drops responses for a provider the
  // user has already switched away from.
  const dynamicModelsCache = new Map();
  const inFlightModelFetches = new Set();
  let dynamicFetchSeq = 0;

  function methodKey(method) {
    return method === 'oauth' ? 'oauth' : 'api_key';
  }

  function getProviderCatalog(providerId) {
    return catalog.find((item) => item.providerId === providerId) || catalog[0];
  }

  function getStaticMethodModelList(providerId, method) {
    const provider = getProviderCatalog(providerId);
    const methodId = methodKey(method);
    const byMethod = provider?.methodModels?.[methodId];
    if (Array.isArray(byMethod) && byMethod.length > 0) return byMethod;
    if (Array.isArray(provider?.models) && provider.models.length > 0) return provider.models;
    return [];
  }

  // Static catalog first (keeps the curated ordering / recommended models on top),
  // then any provider-reported models not already listed, deduped.
  function getMethodModelList(providerId, method) {
    const staticModels = getStaticMethodModelList(providerId, method);
    const dynamicModels = dynamicModelsCache.get(`${providerId}:${methodKey(method)}`) || [];
    const seen = new Set();
    const merged = [];
    for (const model of [...staticModels, ...dynamicModels]) {
      const id = String(model || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(id);
    }
    return merged;
  }

  function getProviderApiKey(providerId) {
    const fromInput = String(dom.agentModelOpenAIKey?.value || '').trim();
    if (fromInput) return fromInput;
    return String(loadSettings()?.providers?.[providerId]?.apiKey || '').trim();
  }

  // Fetches the provider's live model list (via main, to dodge CORS) and merges it
  // into the dropdown. No-ops when there's no key, no IPC bridge, or the list is
  // already cached. On failure the static catalog stays as-is (silent fallback).
  async function refreshDynamicModels(providerId, method, selectedModel) {
    if (!electronAPI?.listProviderModels) return;
    const methodId = methodKey(method);
    const cacheKey = `${providerId}:${methodId}`;
    if (dynamicModelsCache.has(cacheKey) || inFlightModelFetches.has(cacheKey)) return;

    const apiKey = getProviderApiKey(providerId);
    if (!apiKey) return;

    inFlightModelFetches.add(cacheKey);
    const seq = ++dynamicFetchSeq;
    try {
      const result = await electronAPI.listProviderModels({ providerId, method: methodId, apiKey });
      const models = Array.isArray(result?.models)
        ? result.models.map((m) => String(m || '').trim()).filter(Boolean)
        : [];
      if (!result?.ok || models.length === 0) return;
      dynamicModelsCache.set(cacheKey, models);

      // Only re-render if the dialog is still showing this provider+method and no
      // newer fetch has superseded this one.
      const stillCurrent = seq === dynamicFetchSeq
        && dom.agentModelProvider?.value === providerId
        && methodKey(dom.agentModelMethod?.value) === methodId;
      if (stillCurrent) {
        renderModelOptions(providerId, method, dom.agentModelName?.value || selectedModel);
      }
    } catch (_) {
      // Keep the static fallback silently.
    } finally {
      inFlightModelFetches.delete(cacheKey);
    }
  }

  // Only OpenAI (api_key) exposes the built-in image-generation tool, so the
  // "Image Generation Model" setting applies there alone. Every other provider /
  // method returns an empty list, which hides the field (see renderModelOptions).
  function getImageGenerationModelList(providerId, method) {
    if (providerId === 'openai' && method !== 'oauth') {
      return ['gpt-image-2', 'gpt-image-1'];
    }
    return [];
  }

  async function hydrateSettings() {
    try {
      if (electronAPI?.loadAgentModelSettings) {
        const fromSystem = await electronAPI.loadAgentModelSettings();
        if (fromSystem) {
          settingsCache = normalizeSettings(fromSystem);
          return;
        }
      }

      const raw = storage.getItem(settingsStorageKey);
      if (!raw) {
        settingsCache = getDefaultSettings();
        return;
      }
      settingsCache = normalizeSettings(JSON.parse(raw));
    } catch {
      settingsCache = getDefaultSettings();
    }
  }

  function loadSettings() {
    return normalizeSettings(settingsCache);
  }

  async function saveSettings(next) {
    const normalized = normalizeSettings(next);
    settingsCache = normalized;

    if (electronAPI?.saveAgentModelSettings) {
      await electronAPI.saveAgentModelSettings(normalized);
      try { onSettingsSaved(normalized); } catch (_) {}
      return;
    }

    storage.setItem(settingsStorageKey, JSON.stringify(normalized));
    try { onSettingsSaved(normalized); } catch (_) {}
  }

  function renderProviderOptions(selectedProviderId) {
    if (!dom.agentModelProvider) return;
    dom.agentModelProvider.innerHTML = '';
    for (const item of catalog) {
      const option = document.createElement('option');
      option.value = item.providerId;
      option.textContent = item.providerLabel;
      option.selected = item.providerId === selectedProviderId;
      dom.agentModelProvider.appendChild(option);
    }
  }

  function renderMethodOptions(providerId, selectedMethod) {
    if (!dom.agentModelMethod) return;
    const methods = providerId === 'openai'
      ? [
        { value: 'api_key', label: t('modal.agentModel.method.apiKey') },
        { value: 'oauth', label: t('modal.agentModel.method.oauth') },
      ]
      : [
        { value: 'api_key', label: t('modal.agentModel.method.apiKey') },
      ];

    dom.agentModelMethod.innerHTML = '';
    for (const method of methods) {
      const option = document.createElement('option');
      option.value = method.value;
      option.textContent = method.label;
      option.selected = method.value === selectedMethod;
      dom.agentModelMethod.appendChild(option);
    }

    if (!methods.some((item) => item.value === selectedMethod)) {
      dom.agentModelMethod.value = methods[0]?.value || 'api_key';
    }
  }

  function renderModelOptions(providerId, method, selectedModel) {
    if (!dom.agentModelName) return;
    const models = getMethodModelList(providerId, method);
    dom.agentModelName.innerHTML = '';

    for (const model of models) {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      option.selected = model === selectedModel;
      dom.agentModelName.appendChild(option);
    }

    if (!models.includes(selectedModel) && models.length > 0) {
      dom.agentModelName.value = models[0];
    }

    if (dom.agentModelImageName) {
      const selectedImageModel = String(loadSettings()?.imageGenerationModel || '');
      const imageModels = getImageGenerationModelList(providerId, method);
      if (dom.agentModelImageRow) dom.agentModelImageRow.classList.toggle('hidden', imageModels.length === 0);
      dom.agentModelImageName.innerHTML = '';
      const autoOption = document.createElement('option');
      autoOption.value = '';
      autoOption.textContent = t('modal.agentModel.imageModelAuto');
      autoOption.selected = selectedImageModel === '';
      dom.agentModelImageName.appendChild(autoOption);
      for (const model of imageModels) {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        option.selected = model === selectedImageModel;
        dom.agentModelImageName.appendChild(option);
      }
      if (!imageModels.includes(selectedImageModel)) {
        dom.agentModelImageName.value = '';
      }
    }

    // Kick off the live-model fetch in the background. Cached results short-circuit
    // inside refreshDynamicModels, so this won't loop when it re-renders.
    void refreshDynamicModels(providerId, method, selectedModel);
  }

  function fragmentKey(fragment) {
    return JSON.stringify(fragment ?? null);
  }

  // Renders the reasoning dropdown for the currently selected model. Options are
  // provider/model specific and each carries a provider-native payload fragment;
  // the stored selection is keyed by model id, so each model keeps its own choice.
  function renderReasoningOptions(providerId, model) {
    if (!dom.agentModelReasoning) return;
    const options = getReasoningOptions(providerId, model) || [];
    if (!options.length) {
      dom.agentModelReasoning.innerHTML = '';
      if (dom.agentModelReasoningRow) dom.agentModelReasoningRow.classList.add('hidden');
      return;
    }

    if (dom.agentModelReasoningRow) dom.agentModelReasoningRow.classList.remove('hidden');
    const storedFragment = loadSettings()?.reasoning?.[model] ?? null;
    const storedKey = fragmentKey(storedFragment);

    dom.agentModelReasoning.innerHTML = '';
    let matched = false;
    for (const opt of options) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      option.selected = fragmentKey(opt.fragment) === storedKey;
      if (option.selected) matched = true;
      dom.agentModelReasoning.appendChild(option);
    }
    if (!matched) dom.agentModelReasoning.value = options[0].value;
  }

  // Max output tokens currently only feeds the Anthropic request path (where the
  // value was previously hardcoded), so the row is shown for Anthropic only.
  function refreshMaxTokensRow(providerId) {
    if (!dom.agentModelMaxTokens) return;
    const applies = providerId === 'anthropic';
    if (dom.agentModelMaxTokensRow) dom.agentModelMaxTokensRow.classList.toggle('hidden', !applies);
    if (applies) {
      const stored = Number(loadSettings()?.maxOutputTokens) || 0;
      dom.agentModelMaxTokens.value = stored > 0 ? String(stored) : '';
    }
  }

  function refreshAgentModelKeyRows(providerId, method) {
    if (!dom.agentModelOpenAIKey) return;

    const openAISelected = providerId === 'openai';
    const methodId = method === 'oauth' ? 'oauth' : 'api_key';
    const oauthSelected = openAISelected && methodId === 'oauth';

    if (dom.agentModelOpenAIKeyRow) dom.agentModelOpenAIKeyRow.classList.toggle('hidden', oauthSelected);
    if (dom.agentModelOpenAIOAuthRow) dom.agentModelOpenAIOAuthRow.classList.toggle('hidden', !oauthSelected);
    if (dom.agentModelOpenAIOAuthActions) dom.agentModelOpenAIOAuthActions.classList.toggle('hidden', !oauthSelected);

    dom.agentModelOpenAIKey.disabled = oauthSelected;
    if (dom.agentModelOpenAIOAuthToken) {
      dom.agentModelOpenAIOAuthToken.disabled = !oauthSelected;
    }
  }

  // --- Backend selector (three levels) ----------------------------------------
  // Level 1 (agentModelBackend) picks a *family*: '' = the API-key (HTTP) line, or
  // a CLI driver id ('claude-code' / 'codex'). Level 2 (agentModelCliProfile) picks
  // which profile inside a multi-profile family (e.g. Claude Code -> subscription /
  // Kimi / GLM / DeepSeek); it's hidden for HTTP and for single-profile families,
  // which auto-select their one profile. Level 3 (agentModelCliModelName) is the
  // selected profile's model override — the headless twin of the CLI's /model.
  // The effective backend id (what gets saved as activeCliProfileId) is derived
  // by getSelectedBackendId().

  // Model choices per built-in profile. Values are what the CLI's --model/-m
  // accepts (Claude: version-stable aliases, mirroring its /model picker; the
  // 1M-context variant uses the documented `sonnet[1m]` alias form); labels keep
  // the human name + version. '' (the first option) = the CLI's own default. A
  // saved custom id not in this list is preserved as an extra option, so ids
  // hand-edited into the settings file survive the dialog round-trip.
  // (claude-sub refreshed 2026-07 against Claude Code's /model; GLM/Kimi/DeepSeek
  // refreshed 2026-08 — old kimi-k2 series retired 2026-05-25, GLM-5.x added,
  // z.ai's 1M-context variant uses the `glm-5.2[1m]` alias form, and DeepSeek's
  // deepseek-chat/deepseek-reasoner retired 2026-07-24 → deepseek-v4-pro/flash.)
  const CLI_MODEL_SUGGESTIONS = {
    'claude-sub': [
      { value: 'sonnet', label: 'Sonnet 4.6' },
      { value: 'sonnet[1m]', label: 'Sonnet 4.6 (1M context)' },
      { value: 'fable', label: 'Fable 5' },
      { value: 'opus', label: 'Opus 4.8' },
      { value: 'haiku', label: 'Haiku 4.5' },
    ],
    'kimi-k2': ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5'],
    glm: ['glm-5.2', 'glm-5.2[1m]', 'glm-5.1', 'glm-5', 'glm-4.7', 'glm-4.6', 'glm-4.5-air'],
    deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash'],
    // (Refreshed 2026-07-18 against codex-cli 0.142.1's bundled models.json —
    // the gpt-5.1-codex-* generation only survives there as migration aliases.
    // gpt-5.3-codex removed: ChatGPT-subscription accounts get HTTP 400 "model
    // is not supported when using Codex with a ChatGPT account" — verified live.)
    'codex-sub': [
      { value: 'gpt-5.5', label: 'GPT-5.5' },
      { value: 'gpt-5.4', label: 'GPT-5.4' },
      { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    ],
  };

  // Per-driver install guidance (link-based, mirroring the C++ build-tools modal).
  const CLI_INSTALL_INFO = {
    'claude-code': { name: 'Claude Code', url: 'https://claude.com/claude-code' },
    codex: { name: 'Codex', url: 'https://developers.openai.com/codex/cli' },
  };

  function cliProfilesList(settings) {
    const s = settings || loadSettings();
    return Array.isArray(s.cliProfiles) ? s.cliProfiles.filter((p) => p && p.id) : [];
  }
  function cliProfilesOfDriver(driverId, settings) {
    return cliProfilesList(settings).filter((p) => String(p.driver || 'claude-code') === driverId);
  }
  function driverOfProfile(profileId, settings) {
    const p = cliProfilesList(settings).find((x) => x.id === profileId);
    return p ? String(p.driver || 'claude-code') : '';
  }
  function familyDisplayName(driverId) {
    if (driverId === 'claude-code') return t('modal.agentModel.familyClaude') || 'Claude Code';
    if (driverId === 'codex') return t('modal.agentModel.familyCodex') || 'Codex';
    return CLI_INSTALL_INFO[driverId]?.name || driverId;
  }

  // Ordered, de-duped list of CLI driver families present in the saved profiles.
  function cliFamilies(settings) {
    const seen = new Set();
    const fams = [];
    for (const p of cliProfilesList(settings)) {
      const d = String(p.driver || 'claude-code');
      if (seen.has(d)) continue;
      seen.add(d);
      fams.push(d);
    }
    return fams;
  }

  function renderBackendOptions(settings) {
    if (!dom.agentModelBackend) return;
    const active = String(settings.activeCliProfileId || '');
    const activeFamily = active ? driverOfProfile(active, settings) : '';
    dom.agentModelBackend.innerHTML = '';
    const apiOption = document.createElement('option');
    apiOption.value = '';
    apiOption.textContent = t('modal.agentModel.familyHttp') || 'API provider (HTTP)';
    apiOption.selected = active === '';
    dom.agentModelBackend.appendChild(apiOption);
    for (const driverId of cliFamilies(settings)) {
      const option = document.createElement('option');
      option.value = driverId;
      option.textContent = familyDisplayName(driverId);
      option.selected = driverId === activeFamily;
      dom.agentModelBackend.appendChild(option);
    }
    renderCliProfileOptions(settings, active);
  }

  // Level-2 profile select: populated from the selected family's profiles. Hidden
  // when no CLI family is selected or the family has a single profile.
  function renderCliProfileOptions(settings, activeProfileId) {
    const sel = dom.agentModelCliProfile;
    const row = dom.agentModelCliProfileRow;
    if (!sel) return;
    const family = dom.agentModelBackend?.value || '';
    const profiles = family ? cliProfilesOfDriver(family, settings) : [];
    sel.innerHTML = '';
    for (const p of profiles) {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = String(p.label || p.id);
      option.selected = p.id === activeProfileId;
      sel.appendChild(option);
    }
    const showLevel2 = profiles.length > 1;
    if (row) row.classList.toggle('hidden', !showLevel2);
    if (showLevel2 && !profiles.some((p) => p.id === activeProfileId)) {
      sel.value = profiles[0].id; // default to the first when active isn't in this family
    }
  }

  // Effective backend id from the two selects: '' (HTTP), the single profile of a
  // one-profile family, or the level-2 selection.
  function getSelectedBackendId() {
    const family = dom.agentModelBackend?.value || '';
    if (!family) return '';
    const profiles = cliProfilesOfDriver(family, loadSettings());
    if (profiles.length <= 1) return profiles[0]?.id || '';
    return dom.agentModelCliProfile?.value || profiles[0]?.id || '';
  }

  // Level-3 model select for the selected profile. Shown whenever a CLI profile
  // is active (even single-profile families like Codex). First option '' = the
  // CLI's own default model.
  function renderCliModelName(settings) {
    const sel = dom.agentModelCliModelName;
    if (!sel) return;
    const id = getSelectedBackendId();
    const profile = id ? cliProfilesList(settings).find((p) => p.id === id) : null;
    if (dom.agentModelCliModelRow) dom.agentModelCliModelRow.classList.toggle('hidden', !profile);
    if (!profile) return;
    const saved = String(profile.model || '');
    sel.innerHTML = '';
    const addOption = (value, label) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === saved;
      sel.appendChild(option);
    };
    addOption('', t('modal.agentModel.cliModelDefault'));
    const entries = (CLI_MODEL_SUGGESTIONS[id] || [])
      .map((m) => (typeof m === 'string' ? { value: m, label: m } : m));
    for (const m of entries) addOption(m.value, m.label);
    if (saved && !entries.some((m) => m.value === saved)) addOption(saved, saved);
  }

  function refreshCliTokenRow() {
    const family = dom.agentModelBackend?.value || '';
    const settings = loadSettings();
    renderCliProfileOptions(settings, getSelectedBackendId());
    renderCliModelName(settings);
    const id = getSelectedBackendId();
    const cliActive = Boolean(family);

    // The API-key (HTTP) provider/model/key/loop fields are irrelevant when a CLI
    // backend is selected — hide the whole block. (dangerouslySkipPermissions sits
    // outside it and stays visible since the CLI line uses it too.)
    if (dom.agentModelHttpFields) dom.agentModelHttpFields.classList.toggle('hidden', cliActive);

    const profile = (settings.cliProfiles || []).find((p) => p && p.id === id) || null;
    const needsToken = Boolean(profile?.env && Object.prototype.hasOwnProperty.call(profile.env, 'ANTHROPIC_AUTH_TOKEN'));
    if (dom.agentModelCliTokenRow) {
      dom.agentModelCliTokenRow.classList.toggle('hidden', !needsToken);
      if (needsToken && dom.agentModelCliToken) dom.agentModelCliToken.value = String(profile.env.ANTHROPIC_AUTH_TOKEN || '');
    }

    // OAuth sign-in block: subscription CLI profiles (no token override) whose
    // driver advertises auth subcommands. Domestic token-based profiles use the
    // token field above instead. Both are gated behind a CLI-presence check so we
    // don't run auth against a missing binary (which surfaced a raw ENOENT).
    if (dom.agentModelCliAuthLog) dom.agentModelCliAuthLog.classList.add('hidden');
    if (!cliActive) {
      if (dom.agentModelCliAuth) dom.agentModelCliAuth.classList.add('hidden');
      if (dom.agentModelCliInstallHint) dom.agentModelCliInstallHint.classList.add('hidden');
      return;
    }
    updateCliPresence(family, id, needsToken);
  }

  // Detect whether the family's CLI is installed. If not, show an install hint
  // (with a "how to install" button) and suppress the sign-in block; if it is,
  // reveal the sign-in block (for subscription profiles) and run auth status.
  let cliPresenceSeq = 0;
  async function updateCliPresence(family, id, needsToken) {
    const seq = ++cliPresenceSeq;
    const authTarget = (!needsToken) ? resolveCliAuthTarget(id) : null;
    const bin = resolveCliAuthTarget(id)?.bin || '';

    const showInstall = (missing) => {
      if (dom.agentModelCliInstallHint) dom.agentModelCliInstallHint.classList.toggle('hidden', !missing);
      if (missing && dom.agentModelCliInstallMsg) {
        dom.agentModelCliInstallMsg.textContent = t('modal.agentModel.cliNotDetected', { name: familyDisplayName(family) });
      }
      if (dom.agentModelCliInstallOpen) dom.agentModelCliInstallOpen.dataset.driver = family;
      // While missing, hide the sign-in block; the CLI can't authenticate.
      if (missing && dom.agentModelCliAuth) dom.agentModelCliAuth.classList.add('hidden');
    };

    // No detect capability (e.g. non-desktop) → assume present, keep old behaviour.
    if (!electronAPI?.cliAgent?.detect) {
      showInstall(false);
      if (dom.agentModelCliAuth) dom.agentModelCliAuth.classList.toggle('hidden', !authTarget);
      if (authTarget) refreshCliAuthStatus(authTarget);
      return;
    }

    if (dom.agentModelCliAuthStatus) dom.agentModelCliAuthStatus.textContent = t('modal.agentModel.cliChecking') || 'Checking…';
    let ok = false;
    try {
      const res = await electronAPI.cliAgent.detect({ bin });
      ok = Boolean(res?.ok);
    } catch (_) { ok = false; }
    if (seq !== cliPresenceSeq) return; // superseded by a newer selection

    showInstall(!ok);
    if (!ok) return;
    if (dom.agentModelCliAuth) dom.agentModelCliAuth.classList.toggle('hidden', !authTarget);
    if (authTarget) refreshCliAuthStatus(authTarget);
  }

  function formatAuthStatus(text, ok) {
    const raw = String(text || '').trim();
    try {
      const j = JSON.parse(raw); // claude auth status emits JSON
      if (typeof j.loggedIn === 'boolean') {
        if (!j.loggedIn) return 'Not signed in';
        const bits = ['Signed in'];
        if (j.email) bits.push(String(j.email));
        if (j.subscriptionType) bits.push(`(${j.subscriptionType})`);
        return bits.join(' · ');
      }
    } catch (_) { /* not JSON (e.g. codex's plain "Logged in using ChatGPT") */ }
    return raw || (ok ? 'OK' : 'Unknown');
  }

  async function refreshCliAuthStatus(target) {
    if (!dom.agentModelCliAuthStatus || !target) return;
    if (!electronAPI?.cliAgent?.authStatus) { dom.agentModelCliAuthStatus.textContent = 'CLI auth is only available in the desktop app.'; return; }
    dom.agentModelCliAuthStatus.textContent = 'Checking…';
    try {
      const res = await electronAPI.cliAgent.authStatus({ bin: target.bin, args: target.auth.status });
      dom.agentModelCliAuthStatus.textContent = formatAuthStatus(res?.text || '', res?.ok);
    } catch (e) {
      dom.agentModelCliAuthStatus.textContent = `Status check failed: ${e?.message || e}`;
    }
  }

  function currentCliAuthTarget() {
    const id = getSelectedBackendId();
    return id ? resolveCliAuthTarget(id) : null;
  }

  // --- CLI install guidance modal (link-based, mirrors the C++ build-tools modal) ---
  let cliInstallModalBound = false;
  let cliInstallDriver = '';
  function closeCliInstallModal() {
    if (!dom.cliInstallModal) return;
    dom.cliInstallModal.classList.add('hidden');
    dom.cliInstallModal.setAttribute('aria-hidden', 'true');
  }
  function bindCliInstallModalOnce() {
    if (cliInstallModalBound) return;
    cliInstallModalBound = true;
    dom.cliInstallClose?.addEventListener('click', () => closeCliInstallModal());
    dom.cliInstallModal?.addEventListener('click', (evt) => {
      const target = evt?.target;
      if (target && target.dataset && target.dataset.closeCliInstall) closeCliInstallModal();
    });
    dom.cliInstallRecheck?.addEventListener('click', async () => {
      const info = CLI_INSTALL_INFO[cliInstallDriver];
      const bin = cliInstallDriver === 'codex' ? 'codex' : 'claude';
      if (!electronAPI?.cliAgent?.detect) { closeCliInstallModal(); return; }
      const res = await electronAPI.cliAgent.detect({ bin }).catch(() => null);
      const name = info?.name || cliInstallDriver;
      if (res?.ok) {
        closeCliInstallModal();
        setStatus(t('modal.cliInstall.detected', { name }));
        refreshCliTokenRow();
      } else {
        setStatus(t('modal.cliInstall.stillMissing', { name }));
      }
    });
  }
  function openCliInstallModal(driverId) {
    cliInstallDriver = driverId;
    const info = CLI_INSTALL_INFO[driverId] || { name: driverId, url: '' };
    if (dom.cliInstallTitle) dom.cliInstallTitle.textContent = t('modal.cliInstall.title', { name: info.name });
    if (dom.cliInstallIntro) dom.cliInstallIntro.textContent = t('modal.cliInstall.intro', { name: info.name });
    if (dom.cliInstallUrl) dom.cliInstallUrl.textContent = info.url;
    if (!dom.cliInstallModal) {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(`${info.name}: ${info.url}`);
      return;
    }
    bindCliInstallModalOnce();
    dom.cliInstallModal.classList.remove('hidden');
    dom.cliInstallModal.setAttribute('aria-hidden', 'false');
  }

  function openModal() {
    if (!dom.agentModelModal) return;
    const settings = loadSettings();
    const providerId = settings.defaultProviderId || 'openai';
    const method = settings.providers?.[providerId]?.method || settings.defaultMethod || 'api_key';

    renderBackendOptions(settings);
    refreshCliTokenRow();
    renderProviderOptions(providerId);
    renderMethodOptions(providerId, method);
    renderModelOptions(providerId, method, settings.defaultModel);
    renderReasoningOptions(providerId, dom.agentModelName?.value || settings.defaultModel);
    refreshMaxTokensRow(providerId);
    if (dom.agentModelMaxLoopRounds) {
      dom.agentModelMaxLoopRounds.value = String(Math.max(1, Math.floor(Number(settings.maxLoopRounds)) || 50));
    }
    if (dom.agentModelTodoLoopRounds) {
      dom.agentModelTodoLoopRounds.value = String(Math.max(1, Math.floor(Number(settings.todoLoopMaxRounds)) || 100));
    }
    if (dom.agentModelImageName) {
      dom.agentModelImageName.value = String(settings.imageGenerationModel || '');
    }
    dom.agentModelOpenAIKey.value = settings.providers?.[providerId]?.apiKey || '';
    if (dom.agentModelOpenAIOAuthToken) {
      dom.agentModelOpenAIOAuthToken.value = settings.providers?.openai?.oauthAccessToken || '';
    }
    if (dom.agentHumanizeToggle) {
      dom.agentHumanizeToggle.checked = Boolean(settings.humanizeEnabled);
    }
    if (dom.agentDangerSkipPermsToggle) {
      dom.agentDangerSkipPermsToggle.checked = Boolean(settings.dangerouslySkipPermissions);
    }
    refreshAgentModelKeyRows(providerId, method);

    dom.agentModelModal.classList.remove('hidden');
    dom.agentModelModal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    if (!dom.agentModelModal) return;
    dom.agentModelModal.classList.add('hidden');
    dom.agentModelModal.setAttribute('aria-hidden', 'true');
  }

  async function runOpenAIOAuthAuthorization() {
    if (!electronAPI?.openAIOAuthAuthorize) {
      throw new Error('OpenAI OAuth authorization is only available in desktop mode.');
    }

    const result = await electronAPI.openAIOAuthAuthorize({});
    if (!result?.ok) {
      throw new Error(result?.error || 'OpenAI OAuth authorization failed.');
    }

    if (dom.agentModelOpenAIOAuthToken) {
      dom.agentModelOpenAIOAuthToken.value = String(result.accessToken || '');
    }

    setStatus('OpenAI OAuth connected');
    return result;
  }

  async function runOpenAIOAuthRefresh() {
    if (!electronAPI?.refreshOpenAIOAuthToken) {
      throw new Error('OpenAI OAuth refresh is only available in desktop mode.');
    }

    const refreshToken = String(loadSettings()?.providers?.openai?.oauthRefreshToken || '').trim();
    if (!refreshToken) {
      throw new Error('Refresh requires oauth refresh token in saved settings.');
    }

    const result = await electronAPI.refreshOpenAIOAuthToken({ refreshToken });
    if (!result?.ok) {
      throw new Error(result?.error || 'OpenAI OAuth refresh failed.');
    }

    if (dom.agentModelOpenAIOAuthToken) {
      dom.agentModelOpenAIOAuthToken.value = String(result.accessToken || '');
    }

    setStatus('OpenAI OAuth token refreshed');
    return result;
  }

  async function ensureOpenAITokenReady(settings) {
    const normalized = normalizeSettings(settings || loadSettings());
    const openAI = normalized.providers?.openai || {};
    if (openAI.method !== 'oauth') return normalized;

    const expiresAt = Number(openAI.oauthExpiresAt || 0) || 0;
    const now = Date.now();
    const earlyRefreshWindowMs = 60_000;
    const needsRefresh = expiresAt > 0 && (expiresAt - now) <= earlyRefreshWindowMs;
    if (!needsRefresh) return normalized;

    if (!electronAPI?.refreshOpenAIOAuthToken) return normalized;

    const refreshToken = String(openAI.oauthRefreshToken || '').trim();
    if (!refreshToken) return normalized;

    const refreshed = await electronAPI.refreshOpenAIOAuthToken({ refreshToken });
    if (!refreshed?.ok) return normalized;

    const next = normalizeSettings({
      ...normalized,
      providers: {
        ...normalized.providers,
        openai: {
          ...openAI,
          oauthAccessToken: String(refreshed.accessToken || openAI.oauthAccessToken || ''),
          oauthRefreshToken: String(refreshed.refreshToken || openAI.oauthRefreshToken || ''),
          oauthExpiresAt: Number(refreshed.expiresAt || openAI.oauthExpiresAt || 0) || 0,
        },
      },
    });

    await saveSettings(next);
    return next;
  }

  function bindEvents() {
    if (dom.agentModelBackend) {
      dom.agentModelBackend.addEventListener('change', () => refreshCliTokenRow());
    }
    if (dom.agentModelCliProfile) {
      dom.agentModelCliProfile.addEventListener('change', () => refreshCliTokenRow());
    }
    if (dom.agentModelCliInstallOpen) {
      dom.agentModelCliInstallOpen.addEventListener('click', () => {
        const driverId = dom.agentModelCliInstallOpen.dataset.driver || dom.agentModelBackend?.value || 'claude-code';
        openCliInstallModal(driverId);
      });
    }

    if (dom.agentModelCliLogin) {
      dom.agentModelCliLogin.addEventListener('click', async () => {
        const target = currentCliAuthTarget();
        if (!target || !electronAPI?.cliAgent?.authLogin) return;
        const runId = (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || `login_${Date.now()}`;
        if (dom.agentModelCliAuthLog) { dom.agentModelCliAuthLog.textContent = ''; dom.agentModelCliAuthLog.classList.remove('hidden'); }
        if (dom.agentModelCliAuthStatus) dom.agentModelCliAuthStatus.textContent = 'Signing in… a browser window should open — finish there.';
        dom.agentModelCliLogin.disabled = true;
        const append = (line) => { if (dom.agentModelCliAuthLog) dom.agentModelCliAuthLog.textContent += `${line}\n`; };
        let unsub = null;
        const done = () => { if (typeof unsub === 'function') { try { unsub(); } catch (_) {} } if (dom.agentModelCliLogin) dom.agentModelCliLogin.disabled = false; refreshCliAuthStatus(target); };
        unsub = electronAPI.cliAgent.onEvent((data) => {
          if (!data || data.runId !== runId) return;
          if (data.kind === 'line') append(data.line);
          else if (data.kind === 'spawnError') { append(`error: ${data.message}`); done(); }
          else if (data.kind === 'close') done();
        });
        try {
          await electronAPI.cliAgent.authLogin({ bin: target.bin, args: target.auth.login, runId });
        } catch (e) {
          append(`failed to launch: ${e?.message || e}`);
          done();
        }
      });
    }

    if (dom.agentModelCliLogout) {
      dom.agentModelCliLogout.addEventListener('click', async () => {
        const target = currentCliAuthTarget();
        if (!target || !electronAPI?.cliAgent?.authLogout) return;
        dom.agentModelCliLogout.disabled = true;
        try { await electronAPI.cliAgent.authLogout({ bin: target.bin, args: target.auth.logout }); } catch (_) {}
        dom.agentModelCliLogout.disabled = false;
        refreshCliAuthStatus(target);
      });
    }

    if (dom.agentModelProvider) {
      dom.agentModelProvider.addEventListener('change', () => {
        const providerId = dom.agentModelProvider.value;
        const providerDefaultMethod = 'api_key';
        renderMethodOptions(providerId, providerDefaultMethod);
        const method = dom.agentModelMethod?.value || providerDefaultMethod;
        const defaultModel = getMethodModelList(providerId, method)[0] || '';
        renderModelOptions(providerId, method, defaultModel);
        renderReasoningOptions(providerId, dom.agentModelName?.value || defaultModel);
        refreshMaxTokensRow(providerId);
        const current = loadSettings();
        if (dom.agentModelOpenAIKey) {
          dom.agentModelOpenAIKey.value = String(current?.providers?.[providerId]?.apiKey || '');
        }
        if (dom.agentModelOpenAIOAuthToken) {
          dom.agentModelOpenAIOAuthToken.value = String(current?.providers?.openai?.oauthAccessToken || '');
        }
        refreshAgentModelKeyRows(providerId, method);
      });
    }

    if (dom.agentModelMethod) {
      dom.agentModelMethod.addEventListener('change', () => {
        const providerId = dom.agentModelProvider?.value || 'openai';
        const method = dom.agentModelMethod.value;
        const selectedModel = dom.agentModelName?.value || '';
        renderModelOptions(providerId, method, selectedModel);
        renderReasoningOptions(providerId, dom.agentModelName?.value || selectedModel);
        refreshAgentModelKeyRows(providerId, method);
      });
    }

    if (dom.agentModelName) {
      dom.agentModelName.addEventListener('change', () => {
        const providerId = dom.agentModelProvider?.value || 'openai';
        renderReasoningOptions(providerId, dom.agentModelName.value);
      });
    }

    // Entering/changing the API key lets us pull the live model list now (the cache
    // is keyed per provider+method, so drop the stale "no key" miss and re-render).
    if (dom.agentModelOpenAIKey) {
      dom.agentModelOpenAIKey.addEventListener('change', () => {
        const providerId = dom.agentModelProvider?.value || 'openai';
        const method = dom.agentModelMethod?.value || 'api_key';
        dynamicModelsCache.delete(`${providerId}:${methodKey(method)}`);
        renderModelOptions(providerId, method, dom.agentModelName?.value || '');
      });
    }

    if (dom.agentModelOpenAIOAuthConnect) {
      dom.agentModelOpenAIOAuthConnect.addEventListener('click', async () => {
        try {
          const auth = await runOpenAIOAuthAuthorization();
          const current = loadSettings();
          await saveSettings({
            ...current,
            providers: {
              ...current.providers,
              openai: {
                ...current.providers?.openai,
                method: 'oauth',
                oauthClientId: OPENAI_OAUTH_CLIENT_ID,
                oauthAccessToken: String(auth?.accessToken || ''),
                oauthRefreshToken: String(auth?.refreshToken || ''),
                oauthExpiresAt: Number(auth?.expiresAt || 0) || 0,
              },
            },
          });
          setStatus('OpenAI OAuth connected and saved');
        } catch (error) {
          setStatus(`OpenAI OAuth connect failed: ${error?.message || 'unknown error'}`);
        }
      });
    }

    if (dom.agentModelOpenAIOAuthRefresh) {
      dom.agentModelOpenAIOAuthRefresh.addEventListener('click', async () => {
        try {
          const refreshed = await runOpenAIOAuthRefresh();
          const current = loadSettings();
          await saveSettings({
            ...current,
            providers: {
              ...current.providers,
              openai: {
                ...current.providers?.openai,
                oauthAccessToken: String(refreshed?.accessToken || ''),
                oauthRefreshToken: String(refreshed?.refreshToken || current.providers?.openai?.oauthRefreshToken || ''),
                oauthExpiresAt: Number(refreshed?.expiresAt || 0) || 0,
              },
            },
          });
          setStatus('OpenAI OAuth token refreshed and saved');
        } catch (error) {
          setStatus(`OpenAI OAuth refresh failed: ${error?.message || 'unknown error'}`);
        }
      });
    }

    if (dom.agentModelSave) {
      dom.agentModelSave.addEventListener('click', async () => {
        const providerId = dom.agentModelProvider.value;
        const method = (dom.agentModelMethod?.value === 'oauth') ? 'oauth' : 'api_key';
        const model = dom.agentModelName.value;
        const current = loadSettings();
        const nextProviders = {
          ...(current.providers || {}),
          [providerId]: {
            ...(current.providers?.[providerId] || {}),
            method: providerId === 'openai' ? method : 'api_key',
            apiKey: (dom.agentModelOpenAIKey.value || '').trim(),
          },
        };

        if (providerId === 'openai') {
          nextProviders.openai = {
            ...(current.providers?.openai || {}),
            method,
            oauthClientId: OPENAI_OAUTH_CLIENT_ID,
            oauthAccessToken: (dom.agentModelOpenAIOAuthToken?.value || '').trim(),
            oauthRefreshToken: current.providers?.openai?.oauthRefreshToken || '',
            oauthExpiresAt: current.providers?.openai?.oauthExpiresAt || 0,
          };
        }

        const reasoningOptions = getReasoningOptions(providerId, model) || [];
        const nextReasoning = { ...(current.reasoning || {}) };
        if (reasoningOptions.length) {
          const picked = reasoningOptions.find((opt) => opt.value === (dom.agentModelReasoning?.value || ''));
          const fragment = picked?.fragment ?? null;
          if (fragment && Object.keys(fragment).length > 0) {
            nextReasoning[model] = fragment;
          } else {
            delete nextReasoning[model];
          }
        }

        const maxOutputTokens = Math.max(0, Math.floor(Number(dom.agentModelMaxTokens?.value) || 0));
        const maxLoopRounds = dom.agentModelMaxLoopRounds
          ? Math.max(1, Math.floor(Number(dom.agentModelMaxLoopRounds.value)) || Number(current.maxLoopRounds) || 50)
          : Math.max(1, Number(current.maxLoopRounds) || 50);
        const todoLoopMaxRounds = dom.agentModelTodoLoopRounds
          ? Math.max(1, Math.floor(Number(dom.agentModelTodoLoopRounds.value)) || Number(current.todoLoopMaxRounds) || 100)
          : Math.max(1, Number(current.todoLoopMaxRounds) || 100);

        const next = {
          ...current,
          defaultProviderId: providerId,
          defaultMethod: providerId === 'openai' ? method : 'api_key',
          defaultModel: model,
          imageGenerationModel: String(dom.agentModelImageName?.value || ''),
          humanizeEnabled: Boolean(dom.agentHumanizeToggle?.checked),
          dangerouslySkipPermissions: dom.agentDangerSkipPermsToggle
            ? Boolean(dom.agentDangerSkipPermsToggle.checked)
            : Boolean(current.dangerouslySkipPermissions),
          reasoning: nextReasoning,
          maxOutputTokens,
          maxLoopRounds,
          todoLoopMaxRounds,
          providers: nextProviders,
        };

        // Active backend line ('' = HTTP provider above; an id = a CLI profile),
        // and the auth token for the selected domestic CLI profile.
        const backendId = dom.agentModelBackend ? getSelectedBackendId() : String(current.activeCliProfileId || '');
        next.activeCliProfileId = backendId;
        const cliModelVal = String(dom.agentModelCliModelName?.value || '').trim();
        if (backendId) {
          const tokenVal = String(dom.agentModelCliToken?.value || '').trim();
          next.cliProfiles = (current.cliProfiles || []).map((p) => {
            if (!p || p.id !== backendId) return p;
            // Selected profile: persist its model override ('' = CLI default) and,
            // for domestic token-based profiles, the auth token.
            const patched = { ...p, model: cliModelVal };
            if (p.env && Object.prototype.hasOwnProperty.call(p.env, 'ANTHROPIC_AUTH_TOKEN')) {
              patched.env = { ...p.env, ANTHROPIC_AUTH_TOKEN: tokenVal };
            }
            return patched;
          });
        }

        try {
          const prevBackendId = String(current.activeCliProfileId || '');
          await saveSettings(next);
          closeModal();
          const backendLabel = backendId
            ? `CLI:${backendId}${cliModelVal ? ` @ ${cliModelVal}` : ''}`
            : `${providerId} / ${method} / ${model}`;
          setStatus(`Agent model saved: ${backendLabel}`);
          // Switched to a different CLI source → announce + offer to copy memory.
          if (backendId && backendId !== prevBackendId) {
            try { await onCliBackendSwitched(prevBackendId, backendId); } catch (_) {}
          }
        } catch {
          setStatus('Failed to save Agent model settings');
        }
      });
    }

    [dom.agentModelClose, dom.agentModelCancel].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        closeModal();
        setStatus('Agent model settings closed');
      });
    });

    if (dom.agentModelModal) {
      dom.agentModelModal.addEventListener('click', (evt) => {
        const target = evt.target;
        if (target && target.dataset && target.dataset.closeAgentModel) {
          closeModal();
          setStatus('Agent model settings closed');
        }
      });
    }
  }

  return {
    hydrateSettings,
    loadSettings,
    saveSettings,
    ensureOpenAITokenReady,
    openModal,
    closeModal,
    bindEvents,
  };
}
