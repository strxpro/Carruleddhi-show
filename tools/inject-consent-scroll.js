/** Zgoda „tylko niezbedne" + przewiniecie w dol, zeby dok byl na ekranie przy zrzucie. */
(() => {
  try {
    localStorage.setItem('carruleddhi.cookies', JSON.stringify({
      version: 1, necessary: true, analytics: false, savedAt: new Date().toISOString()
    }));
  } catch (_) { /* tryb prywatny */ }
  window.addEventListener('load', () => {
    setTimeout(() => window.scrollTo({ top: 1400, behavior: 'instant' }), 1200);
  });
})();
