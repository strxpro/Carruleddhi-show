/**
 * TOR C / C3 — kiedy zaczyna sie zoom zdjecia trasy.
 *
 * Przy jakim scrollY sekcja jest w calosci widoczna i ile wynosi wtedy
 * --route-progress. Jesli progress rosnie, zanim sekcja w ogole wejdzie w kadr,
 * to jest dokladnie ta usterka.
 *
 *     node tools/cdp.mjs probe tools/probe-c-route.js --w 1440 --h 900
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /* Bez tego przewijanie skacze po punktach zaczepienia i polowa probek laduje
     w tym samym miejscu co poprzednia. */
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';
  document.body.style.scrollSnapType = 'none';

  const section = document.querySelector('#route');
  const frame = document.querySelector('[data-route-frame]');
  const grid = document.querySelector('#route .route__grid');
  const figure = document.querySelector('.route__map');
  const read = (el, prop) => parseFloat(getComputedStyle(el).getPropertyValue(prop));

  const documentTop = (el) => { let t = 0, n = el; while (n) { t += n.offsetTop; n = n.offsetParent; } return t; };
  const top = documentTop(section);
  const height = section.offsetHeight;
  const viewport = window.innerHeight;

  const out = {
    viewport,
    sectionTop: top,
    sectionHeight: height,
    panelAttr: section.getAttribute('data-panel'),
    sectionMinHeight: getComputedStyle(section).minHeight,
    gridPosition: grid && getComputedStyle(grid).position,
    samples: []
  };

  for (let frac = -1.3; frac <= 1.05; frac += 0.15) {
    const y = Math.max(0, Math.round(top + viewport * frac));
    window.scrollTo(0, y);
    await sleep(200);
    const r = section.getBoundingClientRect();
    const f = figure.getBoundingClientRect();
    out.samples.push({
      y,
      secTop: Math.round(r.top),
      secBottom: Math.round(r.bottom),
      figTop: Math.round(f.top),
      figBottom: Math.round(f.bottom),
      figFullyVisible: f.top >= -1 && f.bottom <= viewport + 1,
      raw: read(frame, '--route-progress'),
      zoom: read(frame, '--route-zoom'),
      scale: +(getComputedStyle(frame).transform.split('(')[1] || '0').split(',')[0]
    });
  }
  return out;
};
