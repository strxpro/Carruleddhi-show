/**
 * "Klikam Zapisz i robi sie niebieski ekran" — odtworzenie w panelu.
 *
 *   node tools/cdp.mjs probe tools/probe-c-admin-stream.js --w 1280 --h 900 \
 *     --url /admin.html --inject tools/inject-admin-stub.js
 *
 * Niebieski ekran to tlo admin.html widoczne, gdy Reactowi wywali sie drzewo. Sonda
 * sprawdza wiec DWIE rzeczy: czy po kliknieciu cokolwiek jeszcze stoi na ekranie,
 * i co powiedziala konsola.
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { bledy: [] };
  window.addEventListener('error', (e) => out.bledy.push('error: ' + e.message));
  window.addEventListener('unhandledrejection', (e) => out.bledy.push('rejection: ' + (e.reason?.message || e.reason)));
  await sleep(2500);

  const root = document.querySelector('#root') || document.body;
  const zywy = () => root.textContent.trim().length;
  out.poWczytaniu = { znakow: zywy(), bramka: /Panel organizatora|hasł|password/i.test(root.textContent) };

  /* Wejdz w zakladke transmisji. */
  const tab = [...document.querySelectorAll('button, a')]
    .find((b) => /transmisj|diretta|stream/i.test(b.textContent || ''));
  out.zakladkaZnaleziona = Boolean(tab);
  tab?.click();
  await sleep(1200);

  const pola = [...document.querySelectorAll('input')];
  out.polaWidoczne = pola.length;
  const link = pola[0];
  if (!link) return { ...out, note: 'brak pola adresu — nie ma czego klikac' };

  /* Wybor dostawcy pastylka, jesli sonda o niego prosi. */
  const chce = new URLSearchParams(location.search).get('dostawca');
  if (chce) {
    const guzik = [...document.querySelectorAll('button')]
      .find((b) => (b.textContent || '').trim().toLowerCase() === chce);
    out.dostawcaZnaleziony = Boolean(guzik);
    guzik?.click();
    await sleep(400);
  }

  const setValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setValue(link, new URLSearchParams(location.search).get('link') || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await sleep(400);

  const zapisz = [...document.querySelectorAll('button')]
    .find((b) => /zapisz|salva/i.test(b.textContent || '') && !b.disabled);
  out.przyciskZapisz = zapisz ? zapisz.textContent.trim() : '(brak albo wylaczony)';
  zapisz?.click();
  await sleep(2000);

  out.poKlikniciu = {
    znakow: zywy(),
    /* Zero znakow = pusty root = niebieski ekran. */
    niebieskiEkran: zywy() === 0,
    wartoscPola: document.querySelector('input')?.value || '(brak pola)',
    zadania: (window.__adminCalls || []).map((c) => `${c.kind}:${c.action}`)
  };
  return out;
}
