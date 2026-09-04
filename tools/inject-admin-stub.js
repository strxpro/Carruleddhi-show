/**
 * Panel organizatora bez Workera: klucz w schowku sesji i atrapy odpowiedzi.
 *
 * Po co: "klikam Zapisz i robi sie niebieski ekran" da sie zobaczyc tylko w dzialajacym
 * panelu, a lokalnie nie ma ani Workera, ani bazy. Niebieski ekran to tlo admin.html
 * (#071a3d) widoczne wtedy, gdy Reactowi wywali sie drzewo — wiec sonda musi doprowadzic
 * do tego samego kliku i zlapac wyjatek.
 */
(() => {
  try { window.sessionStorage.setItem('carruleddhi.admin.key', 'probe-key'); } catch { /* nieważne */ }

  const real = window.fetch.bind(window);
  window.__adminCalls = [];
  /* Stan trzymany tu, zeby zapis naprawde cos zmienial — panel po zapisie czyta odpowiedz. */
  let stream = { ok: true, live: false, provider: 'youtube', videoId: '', title: '', hearts: 0, startedAt: null };

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/api/carruleddhi/')) return real(input, init);
    let body = {};
    try { body = JSON.parse(init?.body || '{}'); } catch { /* nieważne */ }
    const kind = url.split('/api/carruleddhi/')[1].split('?')[0];
    window.__adminCalls.push({ kind, action: body.action || '', url: body.url || '' });
    const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

    if (kind === 'inbox') {
      return ok({ ok: true, counts: { registrations: 0, contacts: 0, reminders: 0, newsletter: 0, wall: 0, chats: 0 }, items: [] });
    }
    if (kind === 'stream-admin') {
      if (body.action === 'save') {
        /* Atrapa Workera: przyjmuje tylko to, co przyjalby prawdziwy — zeby sonda mierzyla
           panel, a nie wlasna uprzejmosc. */
        const raw = String(body.url || '');
        const provider = body.provider;
        let id = '';
        if (provider === 'facebook') id = /^https?:\/\/(www\.|m\.|web\.)?(facebook\.com|fb\.watch)\//.test(raw) ? raw : '';
        else if (provider === 'twitch') id = (raw.match(/twitch\.tv\/([A-Za-z0-9_]{4,25})/) || [])[1] || (/^[A-Za-z0-9_]{4,25}$/.test(raw) ? raw : '');
        else id = (raw.match(/[?&]v=([A-Za-z0-9_-]{11})/) || raw.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) || raw.match(/\/(?:live|embed)\/([A-Za-z0-9_-]{11})/) || [])[1] || (/^[A-Za-z0-9_-]{11}$/.test(raw) ? raw : '');
        if (!id) return new Response(JSON.stringify({ ok: false, code: 'STREAM_BAD_URL' }), { status: 422, headers: { 'Content-Type': 'application/json' } });
        stream = { ...stream, provider, videoId: id, title: String(body.title || '') };
        return ok(stream);
      }
      if (body.action === 'open') { stream = { ...stream, live: true, startedAt: new Date().toISOString() }; return ok(stream); }
      if (body.action === 'close') { stream = { ...stream, live: false }; return ok(stream); }
      if (body.action === 'reset-hearts') { stream = { ...stream, hearts: 0 }; return ok(stream); }
      return ok(stream);
    }
    /* Reszta zakladek: pusto, ale bez bledu — panel ma sie zbudowac. */
    return ok({ ok: true, items: [], rows: [], counts: {} });
  };
})();
