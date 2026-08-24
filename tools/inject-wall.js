/**
 * Runs before page script. Points the wall at a fake endpoint and answers it here,
 * so the section can be measured without a live Supabase project.
 *
 * The photos are 1x1 pixel data URLs: the point is to prove the layout reserves the
 * right box and that the lightbox opens, not to look at a picture.
 */
(() => {
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  /**
   * The endpoint is NOT overridden here.
   *
   * index.html sets window.CARRULEDDHI_CONFIG inline, after this script runs, so
   * anything assigned here is thrown away a moment later. The interception happens at
   * fetch instead, which is where the request actually is regardless of how the config
   * arrived — and it also proves the real configured path is the one being called.
   */
  const WALL_PATH = '/api/carruleddhi/wall';

  const comments = [
    { id: 'a1', createdAt: new Date(Date.now() - 4 * 60000).toISOString(), name: 'Giulia', place: 'Lecce', message: 'Un ricordo bellissimo, torniamo anche quest anno con il carruleddhu rosso.', locale: 'it', rating: 5, photo: PIXEL, photoWidth: 1600, photoHeight: 1200 },
    { id: 'a2', createdAt: new Date(Date.now() - 90 * 60000).toISOString(), name: 'Marek', place: 'Krakow', message: 'Najlepsza impreza jaka widzialem na poludniu Wloch, wracamy cala ekipa.', locale: 'pl', rating: 4, photo: '', photoWidth: null, photoHeight: null },
    { id: 'a3', createdAt: new Date(Date.now() - 26 * 3600000).toISOString(), name: 'Hans', place: 'Bremen', message: 'Wir kommen mit vier Leuten und einem selbst gebauten Wagen. Bis bald!', locale: 'de', rating: 3, photo: PIXEL, photoWidth: 1200, photoHeight: 1600 },
    { id: 'a4', createdAt: new Date(Date.now() - 52 * 3600000).toISOString(), name: 'Ana', place: 'Sevilla', message: 'Que ganas, el ano pasado fue una locura absoluta y muy divertido.', locale: 'es', rating: 5, photo: '', photoWidth: null, photoHeight: null }
  ];

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url || '');
    if (!url.includes(WALL_PATH)) return realFetch(input, init);

    const body = JSON.parse((init && init.body) || '{}');
    let answer;
    if (body.type === 'wall-translate') {
      answer = { ok: true, text: '[' + body.to + '] ' + body.text, provider: 'stub' };
    } else if (body.type === 'wall-post') {
      window.__lastWallPost = {
        rating: body.rating,
        hasPhoto: Boolean(body.photo),
        photoBytes: body.photo ? body.photo.length : 0,
        photoWidth: body.photoWidth,
        photoHeight: body.photoHeight,
        photoType: body.photo ? body.photo.slice(0, 24) : ''
      };
      answer = { ok: true, pending: true };
    } else {
      answer = {
        ok: true,
        comments,
        rating: { votes: 47, average: 4.3 },
        hasMore: true
      };
    }
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
})();
