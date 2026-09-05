/** Zgoda + przewiniecie po tym, jak strona sie ustabilizuje (preloader blokuje przewijanie). */
(() => {
  try {
    localStorage.setItem('carruleddhi.cookies', JSON.stringify({ version: 1, necessary: true, analytics: false, savedAt: new Date().toISOString() }));
  } catch (_) {}
  setTimeout(() => window.scrollTo({ top: 1800, behavior: 'instant' }), 3400);
})();
