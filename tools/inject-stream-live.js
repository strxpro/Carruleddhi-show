/**
 * Udaje trwajaca transmisje, nie dotykajac bazy.
 *
 * Odpowiada za koncowke /api/carruleddhi/stream tak, jak odpowiedzialby Worker przy
 * wlaczonej transmisji. Dzieki temu da sie sprawdzic, czy sekcja i przyciski naprawde
 * sie odslaniaja, BEZ pokazywania czegokolwiek prawdziwym odwiedzajacym.
 */
(() => {
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes('/api/carruleddhi/stream') && !url.includes('stream-admin')) {
      return new Response(JSON.stringify({
        ok: true, live: true, hearts: 7, title: 'Zjazd na zywo', provider: 'youtube',
        embed: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1',
        startedAt: new Date().toISOString()
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return real(input, init);
  };
})();
