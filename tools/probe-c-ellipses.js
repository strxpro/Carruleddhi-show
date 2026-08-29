/**
 * TOR C / C4 — znajdz kola, ktore nie sa kolami.
 *
 * Skanuje cala strone: kazdy element z border-radius 50% (albo 999px na
 * kwadratowej ramce) i porownuje szerokosc z wysokoscia. Zamiast zgadywac,
 * o ktore "kolko" chodzi, mierzy wszystkie.
 *
 *     node tools/cdp.mjs probe tools/probe-c-ellipses.js --w 1440 --h 900
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';

  /* Przewin cala strone, zeby reveal/IntersectionObserver zdazyl odsloniac sekcje —
     element ukryty ma zerowe wymiary i wypadlby z pomiaru jako falszywe kolo. */
  const stepCount = 12;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  for (let i = 0; i <= stepCount; i += 1) {
    window.scrollTo(0, (max / stepCount) * i);
    await sleep(180);
  }
  await sleep(400);

  const found = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const radius = cs.borderTopLeftRadius;
    if (!radius.includes('%') && !radius.startsWith('999')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const ratio = r.width / r.height;
    if (ratio > 0.97 && ratio < 1.03) continue;
    /* Pastylki (999px na prostokacie) sa celowe — interesuja nas te, ktore
       deklaruja 50% i mimo to wychodza elipsa. */
    if (!radius.includes('%')) continue;
    found.push({
      sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
      section: el.closest('section')?.id || el.closest('header,nav,footer')?.tagName.toLowerCase() || '',
      w: Math.round(r.width),
      h: Math.round(r.height),
      ratio: +ratio.toFixed(3),
      radius,
      text: (el.textContent || '').trim().slice(0, 24)
    });
  }
  return { width: window.innerWidth, count: found.length, found };
};
