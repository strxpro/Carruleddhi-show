/** Dokladne liczby: gdzie konczy sie dok wzgledem ekranu. */
async (document, window) => {
  await new Promise((r) => setTimeout(r, 3000));
  const dock = document.querySelector('[data-quick-actions]');
  const r = dock.getBoundingClientRect();
  return {
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
    poziomyPrzewijak: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    transform: getComputedStyle(dock).transform
  };
}
