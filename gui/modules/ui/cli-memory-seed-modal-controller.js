// Memory-seed dialog: when a CLI agent switches to a source whose native memory
// file is empty, ask the user whether to start empty or copy a previous source's
// memory (listing candidates if several). Mirrors run-test-modal-controller's
// pending-resolver pattern so the runtime can `await` the user's choice.
export function createCliMemorySeedModalController(deps = {}) {
  const { modal, optionsContainer, messageEl, emptyBtn, closeBtn, t } = deps;
  const translate = typeof t === 'function' ? t : (k) => k;
  let pendingResolver = null;

  function closeModal() {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (optionsContainer) optionsContainer.innerHTML = '';
  }

  function resolveWith(value) {
    if (typeof pendingResolver === 'function') {
      const resolver = pendingResolver;
      pendingResolver = null;
      resolver(value);
    }
    closeModal();
  }

  // Start empty is the safe default for backdrop / Esc / explicit button.
  const chooseEmpty = () => resolveWith({ action: 'empty' });
  if (emptyBtn) emptyBtn.addEventListener('click', chooseEmpty);
  if (closeBtn) closeBtn.addEventListener('click', chooseEmpty);
  if (modal) {
    const backdrop = modal.querySelector('[data-close-cli-memory-seed]');
    if (backdrop) backdrop.addEventListener('click', chooseEmpty);
  }

  function requestMemorySeedChoice({ targetLabel, fromLabel, candidates } = {}) {
    if (!modal || !optionsContainer) return Promise.resolve({ action: 'empty' });
    const list = Array.isArray(candidates) ? candidates : [];
    if (messageEl) {
      messageEl.textContent = translate('modal.cliMemorySeed.message', {
        from: String(fromLabel || ''),
        target: String(targetLabel || ''),
      });
    }

    optionsContainer.innerHTML = '';
    if (list.length) {
      for (const cand of list) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cli-memory-seed-option';
        btn.textContent = translate('modal.cliMemorySeed.copyFrom', { label: String(cand?.label || '') });
        btn.addEventListener('click', () => resolveWith({ action: 'copy', candidate: cand }));
        optionsContainer.appendChild(btn);
      }
    } else {
      const note = document.createElement('p');
      note.className = 'modal-note';
      note.textContent = translate('modal.cliMemorySeed.noMemory');
      optionsContainer.appendChild(note);
    }

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    // A new request supersedes any pending one (default it to empty).
    if (pendingResolver) { const r = pendingResolver; pendingResolver = null; r({ action: 'empty' }); }
    return new Promise((resolve) => { pendingResolver = resolve; });
  }

  return { requestMemorySeedChoice, closeMemorySeedModal: chooseEmpty };
}
