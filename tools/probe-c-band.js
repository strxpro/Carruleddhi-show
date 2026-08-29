/**
 * TOR C / C1 — dlaczego pas sponsorow jest pusty.
 * Mierzy wysokosci pasa, sciezki i pojedynczego logo oraz to, czy obrazek sie wczytal.
 *
 *     node tools/cdp.mjs probe tools/probe-c-band.js --w 1440 --h 900 --url "/?demo=1"
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';
  document.querySelector('.sponsor-zone')?.scrollIntoView({ block: 'center' });
  await sleep(800);

  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  const band = document.querySelector('[data-sponsor-band]');
  const track = document.querySelector('[data-sponsor-track]');
  const logos = [...document.querySelectorAll('.sponsor-logo')];

  return {
    zone: box(document.querySelector('.sponsor-zone')),
    band: { ...box(band), css: { height: getComputedStyle(band).height, minHeight: getComputedStyle(band).minHeight, overflow: getComputedStyle(band).overflow, bandH: getComputedStyle(band).getPropertyValue('--sponsor-band-h') } },
    track: { ...box(track), css: { height: getComputedStyle(track).height, filter: getComputedStyle(track).filter, opacity: getComputedStyle(track).opacity } },
    logoCount: logos.length,
    firstLogos: logos.slice(0, 3).map((logo) => {
      const img = logo.querySelector('img');
      const name = logo.querySelector('.sponsor-logo__name');
      return {
        ...box(logo),
        kind: img ? 'img' : (name ? 'tekst' : 'puste'),
        src: img ? String(img.currentSrc || img.src).slice(0, 70) : (name ? name.textContent.trim() : ''),
        loaded: img ? img.complete && img.naturalWidth > 0 : null,
        imgBox: box(img || name),
        imgFilter: img ? getComputedStyle(img).filter : null
      };
    })
  };
};
