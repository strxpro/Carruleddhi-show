/** Udaje trwajaca transmisje + zgoda + przewiniecie do sceny — na potrzeby zrzutu. */
(() => {
  try {
    localStorage.setItem('carruleddhi.cookies', JSON.stringify({ version: 1, necessary: true, analytics: false, savedAt: new Date().toISOString() }));
  } catch (_) {}
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes('/api/carruleddhi/stream') && !url.includes('stream-admin')) {
      return new Response(JSON.stringify({
        ok: true, live: true, hearts: 128, viewers: 37, title: '', provider: 'youtube',
        embed: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1',
        startedAt: new Date().toISOString()
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return real(input, init);
  };
  const szukaj = setInterval(() => {
    const s = document.querySelector('[data-stream-stage]');
    if (s && !document.querySelector('[data-stream-section]')?.hasAttribute('hidden')) {
      s.scrollIntoView({ block: 'center', behavior: 'instant' });
      clearInterval(szukaj);
    }
  }, 400);
  setTimeout(() => clearInterval(szukaj), 12000);
})();
