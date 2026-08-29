/**
 * Otwarcie formularza komentarza — czy strona zostaje tam, gdzie była.
 *
 * app.js:1865 ustawia ognisko na #wall-name bez `preventScroll`. `focus()` domyślnie
 * przewija do elementu, a #wall jest sekcją przypiętą — w takim układzie przeglądarka
 * liczy pozycję inaczej, niż widzi ją człowiek. To jest ta sama przyczyna, którą przy
 * czacie opisuje komentarz „strona teleportuje sie do stopki albo do komentarzy".
 *
 *     node tools/cdp.mjs probe tools/probe-c-wall-open.js --w 390 --h 844
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const top = (el) => { let t = 0, n = el; while (n) { t += n.offsetTop; n = n.offsetParent; } return t; };
  const wall = document.querySelector('#wall');
  if (!wall) return { note: 'brak sekcji #wall' };

  /* Ustaw się tak, jak stanąłby czytający: komentarze na środku ekranu. */
  window.scrollTo(0, Math.max(0, top(wall) - 120));
  await sleep(700);

  const button = document.querySelector('[data-wall-open]');
  if (!button) return { note: 'brak przycisku [data-wall-open]' };

  const before = Math.round(window.scrollY);
  button.click();
  await sleep(200);
  const rightAfterClick = Math.round(window.scrollY);
  /* Ognisko idzie z opóźnieniem 260 ms — mierzymy po nim i po rozwinięciu (460 ms). */
  await sleep(500);
  const afterFocus = Math.round(window.scrollY);
  await sleep(700);
  const settled = Math.round(window.scrollY);

  const field = document.querySelector('#wall-name');
  return {
    before,
    rightAfterClick,
    afterFocus,
    settled,
    drift: settled - before,
    focused: document.activeElement?.id || document.activeElement?.tagName,
    fieldOnScreen: field ? (() => { const r = field.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; })() : null,
    wallPanel: wall.dataset.panel,
    documentHeight: document.documentElement.scrollHeight
  };
};
