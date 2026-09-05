/** Zgoda „tylko niezbedne" + przewiniecie do sekcji transmisji po jej odsloni�ciu. */
(() => {
  try {
    localStorage.setItem('carruleddhi.cookies', JSON.stringify({
      version: 1, necessary: true, analytics: false, savedAt: new Date().toISOString()
    }));
  } catch (_) { /* tryb prywatny */ }
  const szukaj = setInterval(() => {
    const s = document.querySelector('[data-stream-section]');
    if (s && !s.hasAttribute('hidden')) {
      s.scrollIntoView({ block: 'center', behavior: 'instant' });
      clearInterval(szukaj);
    }
  }, 400);
  setTimeout(() => clearInterval(szukaj), 12000);
})();
