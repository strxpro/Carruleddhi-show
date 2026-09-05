/** Zgoda + przewiniecie + nacisniecie „bede tam" w doku, zeby zlapac dymek na zrzucie. */
(() => {
  try {
    localStorage.setItem('carruleddhi.cookies', JSON.stringify({ version: 1, necessary: true, analytics: false, savedAt: new Date().toISOString() }));
  } catch (_) {}
  const czekaj = setInterval(() => {
    const b = document.querySelector('[data-quick-attend]');
    const dok = document.querySelector('[data-quick-actions]');
    if (!b || !dok) return;
    if (getComputedStyle(dok).opacity !== '1') { window.scrollTo({ top: 3600, behavior: 'instant' }); return; }
    clearInterval(czekaj);
    setTimeout(() => b.click(), 300);
  }, 400);
  setTimeout(() => clearInterval(czekaj), 14000);
})();
