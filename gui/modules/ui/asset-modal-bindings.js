export function createAssetModalBindings(deps) {
  const {
    dom,
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
    syncAudioFormatFields = () => {},
    resolveRunTestModal,
    setStatus,
    t = (key) => key,
  } = deps;

  const {
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
    audioNote,
    audioModal,
    runTestInput,
    runTestDebug,
    runTestRecord,
    runTestClose,
    runTestCancel,
    runTestConfirm,
    runTestModal,
  } = dom;

  function deriveAssetBaseName(file) {
    const name = String(file?.name || '').trim();
    if (!name) return '';
    return name.replace(/\.[^.]+$/, '').trim();
  }

  function autoFillAssetName(input, file) {
    if (!input) return;
    if (String(input.value || '').trim()) return;
    const derived = deriveAssetBaseName(file);
    if (derived) input.value = derived;
  }

  function bind() {
    if (spriteFilesInput) {
      spriteFilesInput.addEventListener('change', async () => {
        try {
          autoFillAssetName(spriteNameInput, spriteFilesInput.files?.[0] || null);
          await loadSpriteFramesFromInput(spriteFilesInput.files);
          if (spriteNote) spriteNote.textContent = t('modal.sprite.status.loadedFrames', { count: spriteBuildState.frames.length });
        } catch (error) {
          if (spriteNote) spriteNote.textContent = error?.message || t('modal.sprite.status.loadFramesFailed');
        }
      });
    }

    [spritePivotXInput, spritePivotYInput].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', () => renderSpritePreview());
    });

    if (spritePreviewCanvas) {
      spritePreviewCanvas.addEventListener('click', (evt) => {
        const frame = spriteBuildState.frames[spriteBuildState.frameIndex];
        const rect = spriteBuildState.previewRect;
        if (!frame || !rect) return;

        const bounds = spritePreviewCanvas.getBoundingClientRect();
        const x = evt.clientX - bounds.left;
        const y = evt.clientY - bounds.top;
        const localX = (x - rect.ox) / rect.scale;
        const localY = (y - rect.oy) / rect.scale;

        const pivotX = Math.round(Math.max(0, Math.min(frame.width, localX)));
        const pivotY = Math.round(Math.max(0, Math.min(frame.height, localY)));
        if (spritePivotXInput) spritePivotXInput.value = String(pivotX);
        if (spritePivotYInput) spritePivotYInput.value = String(pivotY);
        renderSpritePreview();
      });
    }

    if (spritePrevFrameBtn) {
      spritePrevFrameBtn.addEventListener('click', () => {
        const total = spriteBuildState.frames.length;
        if (!total) return;
        spriteBuildState.frameIndex = (spriteBuildState.frameIndex - 1 + total) % total;
        renderSpritePreview();
      });
    }

    if (spriteNextFrameBtn) {
      spriteNextFrameBtn.addEventListener('click', () => {
        const total = spriteBuildState.frames.length;
        if (!total) return;
        spriteBuildState.frameIndex = (spriteBuildState.frameIndex + 1) % total;
        renderSpritePreview();
      });
    }

    [spriteClose, spriteCancel].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        closeSpriteModal();
        setStatus(t('modal.sprite.status.closed'));
      });
    });

    if (spriteCreate) {
      spriteCreate.addEventListener('click', async () => {
        try {
          spriteCreate.disabled = true;
          const result = await createSpriteAtlasAndMetadata();
          closeSpriteModal();
          if (spriteNameInput) spriteNameInput.value = '';
          setStatus(t('modal.sprite.status.created', {
            pngRelPath: result.pngRelPath,
            txtRelPath: result.txtRelPath,
            frameCount: result.frameCount,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || 'unknown error');
          if (spriteNote) spriteNote.textContent = message;
          setStatus(t('modal.sprite.status.createFailed', { message }));
        } finally {
          spriteCreate.disabled = false;
        }
      });
    }

    if (spriteModal) {
      spriteModal.addEventListener('click', (evt) => {
        const target = evt.target;
        if (target && target.dataset && target.dataset.closeSprite) {
          closeSpriteModal();
          setStatus(t('modal.sprite.status.closed'));
        }
      });
    }

    if (fontFileInput) {
      fontFileInput.addEventListener('change', async () => {
        try {
          const file = fontFileInput.files?.[0] || null;
          autoFillAssetName(fontNameInput, file);
          await loadSelectedFontFile(file);
          if (fontNote) fontNote.textContent = file ? `Loaded font: ${file.name}` : 'No font selected';
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error || 'Failed to load font');
          if (fontNote) fontNote.textContent = msg;
          setStatus(`Load font failed: ${msg}`);
        }
      });
    }

    if (fontSourceSystemRadio) {
      fontSourceSystemRadio.addEventListener('change', async () => {
        if (!fontSourceSystemRadio.checked) return;
        try {
          const fonts = await setFontSourceMode('system');
          if (fontNote) fontNote.textContent = fonts.length > 0 ? `Using system font: ${String(fontSystemSelect?.value || '').trim()}` : 'No system fonts available.';
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error || 'Failed to switch to system font');
          if (fontNote) fontNote.textContent = msg;
          setStatus(`Use system font failed: ${msg}`);
        }
      });
    }

    if (fontSourceFileRadio) {
      fontSourceFileRadio.addEventListener('change', async () => {
        if (!fontSourceFileRadio.checked) return;
        try {
          await setFontSourceMode('file');
          if (fontNote) fontNote.textContent = 'Select a font file.';
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error || 'Failed to switch to file font');
          if (fontNote) fontNote.textContent = msg;
          setStatus(`Use file font failed: ${msg}`);
        }
      });
    }

    if (fontSystemSelect) {
      fontSystemSelect.addEventListener('change', async () => {
        if (!fontSourceSystemRadio?.checked) return;
        try {
          await useSystemFontFamily(fontSystemSelect.value || '');
          if (fontNote) fontNote.textContent = `Using system font: ${String(fontSystemSelect.value || '').trim()}`;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error || 'Failed to use system font');
          if (fontNote) fontNote.textContent = msg;
          setStatus(`Use system font failed: ${msg}`);
        }
      });
    }

    if (fontCharsetFilesInput) {
      fontCharsetFilesInput.addEventListener('change', async () => {
        try {
          await appendCharsetFromFiles(fontCharsetFilesInput.files);
          if (fontNote) fontNote.textContent = 'Charset appended from selected files.';
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error || 'Failed to scan charset files');
          if (fontNote) fontNote.textContent = msg;
        }
      });
    }

    [fontPreviewInput, fontPreviewScaleInput, fontSizeInput, fontHintingInput, fontAntialiasInput].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', refreshFontPreview);
      input.addEventListener('change', refreshFontPreview);
    });

    [fontClose, fontCancel].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        closeFontModal();
        setStatus('Create Font closed');
      });
    });

    if (fontCreate) {
      fontCreate.addEventListener('click', async () => {
        try {
          fontCreate.disabled = true;
          const result = await createBitmapFontAssets();
          closeFontModal();
          if (fontNameInput) fontNameInput.value = '';
          setStatus(`Font assets created: ${result.pageCount} page(s), ${result.fontTxtRelPath} (${result.glyphCount} glyphs)`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error || 'unknown error');
          if (fontNote) fontNote.textContent = msg;
          setStatus(`Create Font failed: ${msg}`);
        } finally {
          fontCreate.disabled = false;
        }
      });
    }

    if (fontModal) {
      fontModal.addEventListener('click', (evt) => {
        const target = evt.target;
        if (target && target.dataset && target.dataset.closeFont) {
          closeFontModal();
          setStatus('Create Font closed');
        }
      });
    }

    if (audioFormatInput) {
      audioFormatInput.addEventListener('change', () => {
        syncAudioFormatFields();
      });
    }

    if (audioFileInput) {
      audioFileInput.addEventListener('change', () => {
        const file = audioFileInput.files?.[0] || null;
        autoFillAssetName(audioNameInput, file);
        if (audioNote) {
          audioNote.textContent = file
            ? t('modal.audio.status.loadedFile', { name: file.name })
            : t('modal.audio.status.noFileSelected');
        }
      });
    }

    [audioClose, audioCancel].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        closeAudioModal();
        setStatus(t('modal.audio.status.closed'));
      });
    });

    if (audioCreate) {
      audioCreate.addEventListener('click', async () => {
        const file = audioFileInput?.files?.[0] || null;
        if (!file) {
          if (audioNote) audioNote.textContent = t('modal.audio.status.noFileSelected');
          setStatus(t('modal.audio.status.noFileSelected'));
          return;
        }
        try {
          audioCreate.disabled = true;
          if (audioNote) audioNote.textContent = t('modal.audio.status.converting');
          setStatus(t('modal.audio.status.converting'));
          const result = await createAudioAsset();
          closeAudioModal();
          if (audioNameInput) audioNameInput.value = '';
          if (audioNote) audioNote.textContent = t('modal.audio.status.created', { path: result.path });
          setStatus(t('modal.audio.status.created', { path: result.path }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || 'unknown error');
          if (audioNote) audioNote.textContent = message;
          setStatus(t('modal.audio.status.createFailed', { message }));
        } finally {
          audioCreate.disabled = false;
        }
      });
    }

    if (audioModal) {
      audioModal.addEventListener('click', (evt) => {
        const target = evt.target;
        if (target && target.dataset && target.dataset.closeAudio) {
          closeAudioModal();
          setStatus(t('modal.audio.status.closed'));
        }
      });
    }

    if (runTestInput) {
      runTestInput.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') {
          evt.preventDefault();
          const value = String(runTestInput.value || '').trim();
          resolveRunTestModal({ testName: value || '', debug: Boolean(runTestDebug?.checked), record: Boolean(runTestRecord?.checked) });
        }
      });
    }

    [runTestClose, runTestCancel].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        resolveRunTestModal(null);
        setStatus('Run Test cancelled');
      });
    });

    if (runTestConfirm) {
      runTestConfirm.addEventListener('click', () => {
        const value = String(runTestInput?.value || '').trim();
        resolveRunTestModal({ testName: value || '', debug: Boolean(runTestDebug?.checked), record: Boolean(runTestRecord?.checked) });
      });
    }

    if (runTestModal) {
      runTestModal.addEventListener('click', (evt) => {
        const target = evt.target;
        if (target && target.dataset && target.dataset.closeRunTest) {
          resolveRunTestModal(null);
          setStatus('Run Test cancelled');
        }
      });
    }
  }

  return { bind };
}
