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
    onSettingsSaved = () => {},
    t = (key) => key,
  } = deps;

  let settingsCache = getDefaultSettings();

  function getProviderCatalog(providerId) {
    return catalog.find((item) => item.providerId === providerId) || catalog[0];
  }

  function getMethodModelList(providerId, method) {
    const provider = getProviderCatalog(providerId);
    const methodId = method === 'oauth' ? 'oauth' : 'api_key';
    const byMethod = provider?.methodModels?.[methodId];
    if (Array.isArray(byMethod) && byMethod.length > 0) return byMethod;
    if (Array.isArray(provider?.models) && provider.models.length > 0) return provider.models;
    return [];
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

  function refreshAgentModelNote(providerId, method) {
    if (!dom.agentModelNote || !dom.agentModelOpenAIKey) return;

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

    if (providerId === 'openai') {
      dom.agentModelNote.textContent = oauthSelected
        ? t('modal.agentModel.note.openaiOauth')
        : t('modal.agentModel.note.openaiApiKey');
      return;
    }

    dom.agentModelNote.textContent = t('modal.agentModel.note.providerApiKey', { providerId });
  }

  function openModal() {
    if (!dom.agentModelModal) return;
    const settings = loadSettings();
    const providerId = settings.defaultProviderId || 'openai';
    const method = settings.providers?.[providerId]?.method || settings.defaultMethod || 'api_key';

    renderProviderOptions(providerId);
    renderMethodOptions(providerId, method);
    renderModelOptions(providerId, method, settings.defaultModel);
    renderReasoningOptions(providerId, dom.agentModelName?.value || settings.defaultModel);
    refreshMaxTokensRow(providerId);
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
    refreshAgentModelNote(providerId, method);

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
        refreshAgentModelNote(providerId, method);
      });
    }

    if (dom.agentModelMethod) {
      dom.agentModelMethod.addEventListener('change', () => {
        const providerId = dom.agentModelProvider?.value || 'openai';
        const method = dom.agentModelMethod.value;
        const selectedModel = dom.agentModelName?.value || '';
        renderModelOptions(providerId, method, selectedModel);
        renderReasoningOptions(providerId, dom.agentModelName?.value || selectedModel);
        refreshAgentModelNote(providerId, method);
      });
    }

    if (dom.agentModelName) {
      dom.agentModelName.addEventListener('change', () => {
        const providerId = dom.agentModelProvider?.value || 'openai';
        renderReasoningOptions(providerId, dom.agentModelName.value);
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

        const next = {
          ...current,
          defaultProviderId: providerId,
          defaultMethod: providerId === 'openai' ? method : 'api_key',
          defaultModel: model,
          imageGenerationModel: String(dom.agentModelImageName?.value || ''),
          humanizeEnabled: Boolean(dom.agentHumanizeToggle?.checked),
          reasoning: nextReasoning,
          maxOutputTokens,
          providers: nextProviders,
        };

        try {
          await saveSettings(next);
          closeModal();
          setStatus(`Agent model saved: ${providerId} / ${method} / ${model}`);
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
