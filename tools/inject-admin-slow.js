/**
 * Udaje wolne lacze: odpowiedz na `stream-admin` przychodzi po 2,5 s.
 *
 * Po to, zeby odtworzyc wyscig, ktory u zglaszajacego kasowal wklejony adres, a u mnie
 * nigdy sie nie zdarzyl — bo lokalnie serwer odpowiada w kilkanascie milisekund i odczyt
 * z wejscia w zakladke zawsze konczyl sie PRZED wklejeniem.
 */
(() => {
  const KEY = 'X-Carruleddhi-Roster-Key';
  try { localStorage.setItem('carruleddhi.admin.key', 'test-key'); } catch (_) {}
  const zadania = [];
  window.__zadania = zadania;
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/api/carruleddhi/')) return real(input, init);
    let body = {};
    try { body = JSON.parse((init && init.body) || '{}'); } catch (_) {}
    const route = url.split('/api/carruleddhi/')[1];
    zadania.push(route + (body.action ? ':' + body.action : ''));
    const odpowiedz = (data, ms) => new Promise((r) => setTimeout(
      () => r(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })), ms
    ));
    if (route === 'roster') return odpowiedz({ ok: true, entries: [], stats: {} }, 20);
    if (route === 'inbox') return odpowiedz({ ok: true, counts: {} }, 20);
    if (route === 'stream-admin' && body.action === 'audience') {
      return odpowiedz({ ok: true, recipients: [], pending: 0 }, 300);
    }
    if (route === 'stream-admin' && body.action === 'state') {
      /* TU JEST CALA RZECZ: odpowiedz na wejscie w zakladke wraca PO wklejeniu. */
      return odpowiedz({ ok: true, provider: 'youtube', videoId: '', title: '', live: false, hearts: 0 }, 2500);
    }
    if (route === 'stream-admin' && body.action === 'save') {
      return odpowiedz({ ok: true, provider: 'youtube', videoId: 'dQw4w9WgXcQ', title: '', live: false, hearts: 0 }, 200);
    }
    return odpowiedz({ ok: true }, 20);
  };
  void KEY;
})();
