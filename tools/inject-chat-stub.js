/**
 * Odpowiada za Workera na /api/carruleddhi/chat i liczy, ile razy strona zapytała.
 *
 * Po co: „wysyła się podwójne zapytanie" da się sprawdzić tylko licząc żądania, a lokalnie
 * nie ma Workera — bez atrapy każda wysyłka kończy się błędem sieci i nie widać niczego.
 * Licznik siedzi w window.__chatCalls, żeby sonda mogła go odczytać.
 */
(() => {
  const real = window.fetch.bind(window);
  window.__chatCalls = [];
  let n = 0;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes('/api/carruleddhi/chat')) {
      let body = {};
      try { body = JSON.parse(init?.body || '{}'); } catch { /* nieważne */ }
      window.__chatCalls.push({ action: body.action || '?', message: body.message || '', at: Date.now() });
      n += 1;
      const now = new Date().toISOString();
      if (body.action === 'open') {
        return new Response(JSON.stringify({ ok: true, token: 'probe-token', mode: 'ai', messages: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (body.action === 'poll') {
        return new Response(JSON.stringify({ ok: true, mode: 'ai', messages: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        ok: true, mode: 'ai',
        messageId: 'm' + n, messageAt: now,
        reply: 'Odpowiedź atrapy numer ' + n, replyId: 'r' + n, replyAt: now
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return real(input, init);
  };
})();
