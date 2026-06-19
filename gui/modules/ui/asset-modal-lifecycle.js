export function createAssetModalLifecycle(deps) {
  const {
    spriteModal,
    spritePathInput,
    renderSpritePreview,
    fontModal,
    fontPathInput,
    fontNameInput,
    fontCharsetInput,
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
    fontPreviewInput,
    fontPreviewScaleInput,
    setFontSourceMode,
    refreshFontPreview,
  } = deps;

  function buildVisibleAsciiCharset() {
    let out = '';
    for (let code = 32; code <= 126; code += 1) out += String.fromCharCode(code);
    return out;
  }

  function openSpriteModal() {
    if (!spriteModal) return;
    spriteModal.classList.remove('hidden');
    spriteModal.setAttribute('aria-hidden', 'false');
    if (spritePathInput && !spritePathInput.value) spritePathInput.value = 'src/assets/sprites';
    renderSpritePreview();
  }

  function closeSpriteModal() {
    if (!spriteModal) return;
    spriteModal.classList.add('hidden');
    spriteModal.setAttribute('aria-hidden', 'true');
  }

  async function openFontModal() {
    if (!fontModal) return;
    fontModal.classList.remove('hidden');
    fontModal.setAttribute('aria-hidden', 'false');

    if (fontPathInput && !fontPathInput.value) fontPathInput.value = 'src/assets/fonts';
    if (fontCharsetInput && !fontCharsetInput.value) fontCharsetInput.value = buildVisibleAsciiCharset();
    if (fontPreviewInput && !fontPreviewInput.value) fontPreviewInput.value = 'The quick brown fox jumps over the lazy dog.';
    if (fontPreviewScaleInput && !fontPreviewScaleInput.value) fontPreviewScaleInput.value = '1';
    await Promise.resolve(setFontSourceMode?.('file')).catch(() => {});
    refreshFontPreview();
  }

  function closeFontModal() {
    if (!fontModal) return;
    fontModal.classList.add('hidden');
    fontModal.setAttribute('aria-hidden', 'true');
  }

  function syncAudioFormatFields() {
    const format = String(audioFormatInput?.value || 'wav').toLowerCase();
    const isWav = format === 'wav';
    if (audioBitrateRow) audioBitrateRow.classList.toggle('hidden', isWav);
    if (audioSampleRateRow) audioSampleRateRow.classList.remove('hidden');
    if (audioBitDepthRow) audioBitDepthRow.classList.toggle('hidden', !isWav);
  }

  function openAudioModal() {
    if (!audioModal) return;
    audioModal.classList.remove('hidden');
    audioModal.setAttribute('aria-hidden', 'false');
    if (audioPathInput && !audioPathInput.value) audioPathInput.value = 'src/assets/audio';
    if (audioFormatInput && !audioFormatInput.value) audioFormatInput.value = 'wav';
    if (audioBitrateInput && !audioBitrateInput.value) audioBitrateInput.value = '128';
    if (audioSampleRateInput && !audioSampleRateInput.value) audioSampleRateInput.value = '44100';
    if (audioBitDepthInput && !audioBitDepthInput.value) audioBitDepthInput.value = '16';
    syncAudioFormatFields();
  }

  function closeAudioModal() {
    if (!audioModal) return;
    audioModal.classList.add('hidden');
    audioModal.setAttribute('aria-hidden', 'true');
  }

  return {
    openSpriteModal,
    closeSpriteModal,
    openFontModal,
    closeFontModal,
    openAudioModal,
    closeAudioModal,
    syncAudioFormatFields,
  };
}
