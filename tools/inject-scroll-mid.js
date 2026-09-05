/** Zgoda + przewiniecie w miejsce, gdzie dok ma byc widoczny (sekcja bez wlasnych przyciskow). */
(() => {
  try {
    localStorage.setItem('carruleddhi.cookies', JSON.stringify({ version: 1, necessary: true, analytics: false, savedAt: new Date().toISOString() }));
  } catch (_) {}
  setTimeout(() => window.scrollTo({ top: 3200, behavior: 'instant' }), 3400);
})();
