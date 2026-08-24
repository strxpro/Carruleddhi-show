/**
 * Answers the moderation requests locally so the panel can be measured without a
 * deployed Worker. Also proves the request shape: the probe asserts on what the
 * panel actually sent, including the passphrase header.
 */
(() => {
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  window.__wallCalls = [];

  let rows = [
    { id: '11111111-1111-4111-8111-111111111111', createdAt: '2026-08-20T10:04:00Z', name: 'Giulia', place: 'Lecce', message: 'Un ricordo bellissimo, torniamo anche questo anno.', locale: 'it', rating: 5, approved: false, photo: PIXEL },
    { id: '22222222-2222-4222-8222-222222222222', createdAt: '2026-08-20T09:12:00Z', name: 'Marek', place: 'Krakow', message: 'Najlepsza impreza jaka widzialem, wracamy cala ekipa.', locale: 'pl', rating: 4, approved: false, photo: '' },
    { id: '33333333-3333-4333-8333-333333333333', createdAt: '2026-08-19T18:40:00Z', name: 'Hans', place: 'Bremen', message: 'Wir kommen mit vier Leuten und einem selbst gebauten Wagen.', locale: 'de', rating: 3, approved: true, photo: PIXEL },
    { id: '44444444-4444-4444-8444-444444444444', createdAt: '2026-08-18T08:00:00Z', name: 'Ana', place: 'Sevilla', message: 'Que ganas, el ano pasado fue una locura absoluta.', locale: 'es', rating: null, approved: true, photo: '' }
  ];

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url || '');
    if (!url.includes('/api/carruleddhi/wall')) return realFetch(input, init);

    const headers = (init && init.headers) || {};
    const body = JSON.parse((init && init.body) || '{}');
    window.__wallCalls.push({
      type: body.type,
      action: body.action,
      id: body.id,
      key: headers['X-Carruleddhi-Roster-Key'] || ''
    });

    let answer = { ok: true };
    if (body.action === 'list') {
      answer = { ok: true, comments: rows.map((row) => ({ ...row })) };
    } else if (body.action === 'approve' || body.action === 'hide') {
      const row = rows.find((entry) => entry.id === body.id);
      if (row) row.approved = body.action === 'approve';
      answer = { ok: true, id: body.id, approved: body.action === 'approve' };
    } else if (body.action === 'delete') {
      rows = rows.filter((entry) => entry.id !== body.id);
      answer = { ok: true, id: body.id, deleted: true };
    }
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  // Deleting asks for confirmation; auto-accept it so the probe can exercise it.
  window.confirm = () => true;
})();
