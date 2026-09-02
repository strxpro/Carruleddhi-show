/**
 * Udaje goscia, ktory PODAL JUZ ADRES gdzie indziej, i Workera dla czatu.
 *
 * Dwie rzeczy naraz, bo bez obu nie da sie zmierzyc ani jednej: bez zapamietanego adresu
 * nie ma czego potwierdzac, a bez atrapy Workera rozmowa konczy sie bledem sieci przy
 * pierwszym zdaniu.
 *
 * `selfService: 'sponsor'` wraca na zdanie o sponsorze — tak samo, jak robi to prawdziwy
 * Worker po rozpoznaniu sprawy.
 */
(() => {
  try {
    localStorage.setItem('carruleddhi.person.email', 'anna.kowalska@example.com');
    if (!new URLSearchParams(location.search).has('noname')) {
      localStorage.setItem('carruleddhi.person.name', 'Anna');
    }
    localStorage.removeItem('carruleddhi.chat.name');
    localStorage.removeItem('carruleddhi.chat.email');
  } catch { /* prywatne okno — sonda i tak to zglosi */ }

  const real = window.fetch.bind(window);
  window.__chatCalls = [];
  let n = 0;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes('/api/carruleddhi/chat')) {
      let body = {};
      try { body = JSON.parse(init?.body || '{}'); } catch { /* nieważne */ }
      window.__chatCalls.push({ action: body.action || '?', message: body.message || '' });
      n += 1;
      const now = new Date().toISOString();
      if (body.action === 'open') {
        return new Response(JSON.stringify({ ok: true, token: 'probe', mode: 'ai', messages: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (body.action === 'poll') {
        return new Response(JSON.stringify({ ok: true, mode: 'ai', messages: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const sponsor = /sponsor|sponsorem/i.test(body.message || '');
      return new Response(JSON.stringify({
        ok: true, mode: 'ai',
        messageId: 'm' + n, messageAt: now,
        reply: sponsor ? '' : 'Odpowiedź atrapy ' + n,
        replyId: 'r' + n, replyAt: now,
        ...(sponsor ? { selfService: 'sponsor' } : {})
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return real(input, init);
  };
})();
