export function createRunTestModalController(deps) {
  const { runTestModal, runTestInput, runTestHistory, runTestDebug, runTestNote } = deps;

  let pendingRunTestResolver = null;
  const recentTestNames = [];
  const RECENT_TEST_LIMIT = 8;

  function renderRecentTestHistory() {
    if (!runTestHistory) return;
    runTestHistory.innerHTML = '';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = recentTestNames.length > 0 ? 'Choose a recent test' : '(none)';
    runTestHistory.appendChild(placeholderOption);
    for (const name of recentTestNames) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      runTestHistory.appendChild(option);
    }
    runTestHistory.value = '';
  }

  function rememberRecentTestName(name) {
    const normalized = String(name || '').trim();
    if (!normalized) return;
    const existingIdx = recentTestNames.findIndex((item) => item === normalized);
    if (existingIdx >= 0) recentTestNames.splice(existingIdx, 1);
    recentTestNames.unshift(normalized);
    if (recentTestNames.length > RECENT_TEST_LIMIT) recentTestNames.length = RECENT_TEST_LIMIT;
    renderRecentTestHistory();
  }

  function closeRunTestModal() {
    if (!runTestModal) return;
    runTestModal.classList.add('hidden');
    runTestModal.setAttribute('aria-hidden', 'true');
  }

  function resolveRunTestModal(value) {
    const testName = String(value?.testName || '').trim();
    if (testName) rememberRecentTestName(testName);
    if (typeof pendingRunTestResolver === 'function') {
      const resolver = pendingRunTestResolver;
      pendingRunTestResolver = null;
      resolver(value);
    }
    closeRunTestModal();
  }

  function requestRunTestOptions() {
    if (!runTestModal || !runTestInput) {
      const fallback = String(prompt('Test name:', 'smoke') || '').trim();
      return Promise.resolve(fallback ? { testName: fallback, debug: false } : null);
    }

    if (runTestInput.value.trim() === '') runTestInput.value = recentTestNames[0] || 'smoke';
    if (runTestDebug) runTestDebug.checked = false;
    if (runTestNote) runTestNote.textContent = 'Enter test case name';
    renderRecentTestHistory();

    runTestModal.classList.remove('hidden');
    runTestModal.setAttribute('aria-hidden', 'false');

    setTimeout(() => {
      runTestInput.focus();
      runTestInput.select();
    }, 0);

    if (pendingRunTestResolver) {
      pendingRunTestResolver(null);
      pendingRunTestResolver = null;
    }

    return new Promise((resolve) => {
      pendingRunTestResolver = resolve;
    });
  }

  if (runTestHistory && runTestInput) {
    runTestHistory.addEventListener('change', () => {
      const picked = String(runTestHistory.value || '').trim();
      if (!picked) return;
      runTestInput.value = picked;
      runTestInput.focus();
      runTestInput.select();
      runTestHistory.value = '';
    });
  }

  function requestRunTestName() {
    return requestRunTestOptions().then((result) => result?.testName || null);
  }

  return {
    closeRunTestModal,
    resolveRunTestModal,
    requestRunTestName,
    requestRunTestOptions,
  };
}
