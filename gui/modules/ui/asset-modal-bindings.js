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
    refreshTextPreview,
    createTextAsset,
    closeTextModal,
    createReferenceFile,
    closeReferenceModal,
    resolveRunTestModal,
    setStatus,
    t = (key) => key,
    normalizeToolRelativePath = null,
    fileExistsAtRelPath = null,
  } = deps;

  const {
    spriteFilesInput,
    spritePathInput,
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
    fontPathInput,
    fontNameInput,
    fontSystemSelect,
    fontNote,
    fontCharsetFilesInput,
    fontPreviewInput,
    fontPreviewScaleInput,
    fontSizeInput,
    fontHintingInput,
    fontAntialiasInput,
    fontAaThresholdRow,
    fontAaThresholdInput,
    fontSubpixelXInput,
    fontSubpixelYInput,
    fontClose,
    fontCancel,
    fontCreate,
    fontModal,
    audioClose,
    audioCancel,
    audioCreate,
    audioFileInput,
    audioPathInput,
    audioNameInput,
    audioFormatInput,
    audioNote,
    audioModal,
    spritePathWarning,
    fontPathWarning,
    audioPathWarning,
    textPathWarning,
    textModal,
    textClose,
    textCancel,
    textCreate,
    textFileInput,
    textPathInput,
    textNameInput,
    textSourceEncodingInput,
    textOutputEncodingInput,
    textNote,
    referenceModal,
    referenceClose,
    referenceCancel,
    referenceCreate,
    referenceFileInput,
    referencePathInput,
    referenceNameInput,
    referenceNote,
    runTestInput,
    runTestDebug,
    runTestRecord,
    runTestClose,
    runTestCancel,
    runTestConfirm,
    runTestModal,
  } = dom;

  function normalizeSrcPath(rawPath) {
    if (!normalizeToolRelativePath || !rawPath) return null;
    try {
      const p = rawPath.replace(/^\/+/, '').replace(/\\/g, '/');
      const src = p.toLowerCase().startsWith('src/') ? p : `src/${p}`;
      return normalizeToolRelativePath(src);
    } catch {
      return null;
    }
  }

  // Assets are bundled into the game .pak only from src/assets. Flag any path that
  // would land outside it so the user notices before generating a stray file.
  function isOutsideAssets(rawPath) {
    const p = String(rawPath || '').replace(/^\/+/, '').replace(/\\/g, '/').trim().toLowerCase();
    if (!p) return false;
    const src = p.startsWith('src/') ? p : `src/${p}`;
    return !(src === 'src/assets' || src.startsWith('src/assets/'));
  }

  function bindPathWarning(input, warningEl) {
    if (!input || !warningEl) return;
    const update = () => warningEl.classList.toggle('hidden', !isOutsideAssets(input.value));
    input.addEventListener('input', update);
    input.addEventListener('change', update);
    update();
  }

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
      // Pivot editing: a press must land inside the drawn image (or within SNAP px of
      // its border) to grab — clicks further out on the empty canvas are ignored, which
      // matters most for tiny sprites. Once grabbed, dragging updates the pivot live and
      // clamps to the image edges so Pivot X/Y track the cursor.
      const SPRITE_PIVOT_SNAP_PX = 32;
      let pivotDragging = false;

      const applyPivotFromEvent = (evt, requireNear) => {
        const frame = spriteBuildState.frames[spriteBuildState.frameIndex];
        const rect = spriteBuildState.previewRect;
        if (!frame || !rect) return false;

        const bounds = spritePreviewCanvas.getBoundingClientRect();
        const x = evt.clientX - bounds.left;
        const y = evt.clientY - bounds.top;

        if (requireNear) {
          const dx = Math.max(rect.ox - x, 0, x - (rect.ox + rect.dw));
          const dy = Math.max(rect.oy - y, 0, y - (rect.oy + rect.dh));
          if (Math.hypot(dx, dy) > SPRITE_PIVOT_SNAP_PX) return false;
        }

        const clampedX = Math.min(Math.max(x, rect.ox), rect.ox + rect.dw);
        const clampedY = Math.min(Math.max(y, rect.oy), rect.oy + rect.dh);
        const localX = (clampedX - rect.ox) / rect.scale;
        const localY = (clampedY - rect.oy) / rect.scale;

        const pivotX = Math.round(Math.max(0, Math.min(frame.width, localX)));
        const pivotY = Math.round(Math.max(0, Math.min(frame.height, localY)));
        if (spritePivotXInput) spritePivotXInput.value = String(pivotX);
        if (spritePivotYInput) spritePivotYInput.value = String(pivotY);
        renderSpritePreview();
        return true;
      };

      // Pressing anywhere in the preview (while a frame is loaded) enters drag mode. The
      // pivot only actually moves once the cursor is within snap range — so a press that
      // starts far out just "waits" held down, then snaps the moment you drag into range.
      spritePreviewCanvas.addEventListener('mousedown', (evt) => {
        if (!spriteBuildState.previewRect) return;
        pivotDragging = true;
        applyPivotFromEvent(evt, true);
        evt.preventDefault();
      });
      window.addEventListener('mousemove', (evt) => {
        if (!pivotDragging) return;
        applyPivotFromEvent(evt, true);
      });
      window.addEventListener('mouseup', () => { pivotDragging = false; });
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
          const name = String(spriteNameInput?.value || '').trim();
          const normalizedPath = normalizeSrcPath(String(spritePathInput?.value || '').trim());
          const checkPath = normalizedPath && name ? `${normalizedPath}/${name}.txt` : null;
          let isReplace = false;
          if (checkPath && fileExistsAtRelPath) {
            if (await fileExistsAtRelPath(checkPath)) {
              if (!window.confirm(`"${name}" already exists. Replace it?`)) return;
              isReplace = true;
            }
          }
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

    // Alpha-threshold row is only meaningful with antialias off.
    const syncFontAaThresholdVisibility = () => {
      if (!fontAaThresholdRow) return;
      const off = String(fontAntialiasInput?.value || 'on') === 'off';
      fontAaThresholdRow.classList.toggle('hidden', !off);
    };
    if (fontAntialiasInput) fontAntialiasInput.addEventListener('change', syncFontAaThresholdVisibility);
    syncFontAaThresholdVisibility();

    [fontPreviewInput, fontPreviewScaleInput, fontSizeInput, fontHintingInput, fontAntialiasInput,
      fontAaThresholdInput, fontSubpixelXInput, fontSubpixelYInput].forEach((input) => {
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
          const name = String(fontNameInput?.value || '').trim();
          const normalizedPath = normalizeSrcPath(String(fontPathInput?.value || '').trim());
          const checkPath = normalizedPath && name ? `${normalizedPath}/${name}.font.txt` : null;
          let isReplace = false;
          if (checkPath && fileExistsAtRelPath) {
            if (await fileExistsAtRelPath(checkPath)) {
              if (!window.confirm(`"${name}" already exists. Replace it?`)) return;
              isReplace = true;
            }
          }
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
          const rawName = String(audioNameInput?.value || '').trim();
          const name = rawName.replace(/\.(wav|ogg)$/i, '').trim();
          const format = String(audioFormatInput?.value || 'wav').trim().toLowerCase();
          const normalizedPath = normalizeSrcPath(String(audioPathInput?.value || '').trim());
          const checkPath = normalizedPath && name ? `${normalizedPath}/${name}.${format}` : null;
          let isReplace = false;
          if (checkPath && fileExistsAtRelPath) {
            if (await fileExistsAtRelPath(checkPath)) {
              if (!window.confirm(`"${name}.${format}" already exists. Replace it?`)) return;
              isReplace = true;
            }
          }
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

    bindPathWarning(spritePathInput, spritePathWarning);
    bindPathWarning(fontPathInput, fontPathWarning);
    bindPathWarning(audioPathInput, audioPathWarning);
    bindPathWarning(textPathInput, textPathWarning);

    if (textFileInput) {
      textFileInput.addEventListener('change', async () => {
        const file = textFileInput.files?.[0] || null;
        // Text/reference names keep the full original filename (extension included),
        // so only auto-fill when the field is still empty — never clobber user input.
        if (file && textNameInput && !String(textNameInput.value || '').trim()) {
          textNameInput.value = String(file.name || '').trim();
        }
        try {
          await refreshTextPreview?.();
          if (textNote) textNote.textContent = file ? t('modal.text.status.loadedFile', { name: file.name }) : t('modal.text.note');
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error || 'Failed to read file');
          if (textNote) textNote.textContent = msg;
        }
      });
    }

    if (textSourceEncodingInput) {
      textSourceEncodingInput.addEventListener('change', async () => {
        try {
          await refreshTextPreview?.();
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error || 'Failed to decode file');
          if (textNote) textNote.textContent = msg;
        }
      });
    }

    [textClose, textCancel].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        closeTextModal();
        setStatus(t('modal.text.status.closed'));
      });
    });

    if (textCreate) {
      textCreate.addEventListener('click', async () => {
        const file = textFileInput?.files?.[0] || null;
        if (!file) {
          if (textNote) textNote.textContent = t('modal.text.status.noFileSelected');
          setStatus(t('modal.text.status.noFileSelected'));
          return;
        }
        try {
          textCreate.disabled = true;
          const result = await createTextAsset();
          closeTextModal();
          if (textNameInput) textNameInput.value = '';
          setStatus(t('modal.text.status.created', { path: result.path }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || 'unknown error');
          if (textNote) textNote.textContent = message;
          setStatus(t('modal.text.status.createFailed', { message }));
        } finally {
          textCreate.disabled = false;
        }
      });
    }

    if (textModal) {
      textModal.addEventListener('click', (evt) => {
        const target = evt.target;
        if (target && target.dataset && target.dataset.closeText) {
          closeTextModal();
          setStatus(t('modal.text.status.closed'));
        }
      });
    }

    if (referenceFileInput) {
      referenceFileInput.addEventListener('change', () => {
        const file = referenceFileInput.files?.[0] || null;
        // Reference files keep their full original name (extension included).
        if (file && referenceNameInput && !String(referenceNameInput.value || '').trim()) {
          referenceNameInput.value = String(file.name || '').trim();
        }
        if (referenceNote) {
          referenceNote.textContent = file ? t('modal.reference.status.loadedFile', { name: file.name }) : t('modal.reference.note');
        }
      });
    }

    [referenceClose, referenceCancel].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        closeReferenceModal();
        setStatus(t('modal.reference.status.closed'));
      });
    });

    if (referenceCreate) {
      referenceCreate.addEventListener('click', async () => {
        const file = referenceFileInput?.files?.[0] || null;
        if (!file) {
          if (referenceNote) referenceNote.textContent = t('modal.reference.status.noFileSelected');
          setStatus(t('modal.reference.status.noFileSelected'));
          return;
        }
        try {
          referenceCreate.disabled = true;
          const result = await createReferenceFile();
          closeReferenceModal();
          if (referenceNameInput) referenceNameInput.value = '';
          setStatus(t('modal.reference.status.created', { path: result.path }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || 'unknown error');
          if (referenceNote) referenceNote.textContent = message;
          setStatus(t('modal.reference.status.createFailed', { message }));
        } finally {
          referenceCreate.disabled = false;
        }
      });
    }

    if (referenceModal) {
      referenceModal.addEventListener('click', (evt) => {
        const target = evt.target;
        if (target && target.dataset && target.dataset.closeReference) {
          closeReferenceModal();
          setStatus(t('modal.reference.status.closed'));
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
