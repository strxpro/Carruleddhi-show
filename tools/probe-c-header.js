/**
 * TOR C / C2 — naglowek: wysrodkowanie nazwy sekcji, stan „Bede tam" w kazdym
 * ze stanow paska, i wybor jezyka po rozwinieciu.
 *
 *     node tools/cdp.mjs probe tools/probe-c-header.js --w 1440 --h 900
 *     node tools/cdp.mjs probe tools/probe-c-header.js --w 700  --h 900
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const header = document.querySelector('.site-header');
  const shell = document.querySelector('.nav-shell');
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }; };

  const read = (label) => {
    const s = box(shell);
    const parts = {};
    for (const [key, sel] of [['current', '.nav-current'], ['attend', '.nav-attend'], ['lang', '.language-picker'], ['menu', '.menu-toggle'], ['brand', '.brand']]) {
      const el = document.querySelector(sel);
      const cs = getComputedStyle(el);
      const b = box(el);
      parts[key] = {
        ...b,
        display: cs.display,
        opacity: cs.opacity,
        visibility: cs.visibility,
        /* Widoczny naprawde, a nie tylko „ma opacity 1": zerowa szerokosc albo
           visibility: hidden znaczy, ze rozwiniety pasek jest pusty w tym miejscu. */
        reallyVisible: cs.display !== 'none' && cs.visibility === 'visible' && +cs.opacity > 0.05 && b.w > 4
      };
    }
    const c = parts.current;
    return {
      label,
      classes: header.className,
      shellX: s.x,
      shellW: s.w,
      /* Ile brakuje nazwie sekcji do srodka paska. Zero znaczy wysrodkowana. */
      currentOffCentre: c.display === 'none' ? 'ukryta' : Math.round((c.x + c.w / 2) - (s.x + s.w / 2)),
      parts
    };
  };

  const out = { width: window.innerWidth, states: [] };
  out.states.push(read('gora strony'));

  window.scrollTo(0, 900);
  await sleep(900);
  out.states.push(read('zwiniety (scrollY 900)'));

  header.classList.add('is-peeked');
  await sleep(700);
  out.states.push(read('zwiniety + is-peeked'));
  header.classList.remove('is-peeked');
  await sleep(700);

  document.querySelector('[data-menu-toggle]')?.click();
  await sleep(900);
  out.states.push(read('zwiniety + menu otwarte'));
  document.querySelector('[data-menu-toggle]')?.click();
  await sleep(700);

  /* Wybor jezyka w rozwinietym menu: czy w panelu w ogole jest czym przelaczyc jezyk. */
  out.languageInsideMenu = document.querySelectorAll('#site-menu [data-language-option]').length;
  return out;
};
