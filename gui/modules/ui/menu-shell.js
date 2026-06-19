export function createMenuShell(deps) {
  const { menuBar } = deps;

  function closeAllMenus() {
    if (!menuBar) return;
    menuBar.querySelectorAll('.menu-item.open').forEach((el) => el.classList.remove('open'));
  }

  function bind() {
    if (!menuBar) return;

    menuBar.querySelectorAll('.menu-trigger').forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        const item = event.currentTarget.closest('.menu-item');
        const shouldOpen = !item.classList.contains('open');
        closeAllMenus();
        if (shouldOpen) item.classList.add('open');
        event.stopPropagation();
      });
    });

    menuBar.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.addEventListener('click', closeAllMenus);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAllMenus();
    });
  }

  return {
    closeAllMenus,
    bind,
  };
}
