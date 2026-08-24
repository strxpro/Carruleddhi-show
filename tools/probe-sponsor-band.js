async (doc, win) => {
  const out = {};
  const band = doc.querySelector('[data-sponsor-band]');
  if (!band) return { error: 'no band' };

  out.configSponsors = (win.CARRULEDDHI_CONFIG?.sponsors || []).length;
  out.hidden = band.hidden;
  const logos = [...band.querySelectorAll('.sponsor-logo')];
  out.logoNodes = logos.length;
  out.announcedLogos = logos.filter((l) => l.getAttribute('aria-hidden') !== 'true').length;
  out.duplicatedLogos = logos.filter((l) => l.getAttribute('aria-hidden') === 'true').length;
  out.brokenImages = [...band.querySelectorAll('img')].filter((i) => !(i.complete && i.naturalWidth > 0)).length;

  /* An http:// or javascript: link must be dropped by the config validator. */
  out.links = logos
    .filter((l) => l.tagName === 'A')
    .map((l) => ({ href: l.getAttribute('href'), rel: l.getAttribute('rel'), target: l.getAttribute('target') }));

  const cs = win.getComputedStyle(band);
  out.bandBox = (() => {
    const r = band.getBoundingClientRect();
    return { y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  })();
  const track = band.querySelector('[data-sponsor-track]');
  out.trackAnimation = win.getComputedStyle(track).animationName;
  out.speed = cs.getPropertyValue('--sponsor-speed').trim();

  /* The hero must reserve room for the strip, otherwise the band covers content. */
  const hero = doc.querySelector('.section-card--hero');
  out.heroBottomStrips = win.getComputedStyle(hero).getPropertyValue('--hero-bottom-strips').trim();
  const heroBox = hero.getBoundingClientRect();
  out.bandInsideHero = out.bandBox.y >= heroBox.top && out.bandBox.y + out.bandBox.h <= heroBox.bottom + 2;

  /* Does it overlap the marquee or any hero text? */
  const marquee = doc.querySelector('.hero__marquee, .marquee');
  if (marquee) {
    const m = marquee.getBoundingClientRect();
    out.overlapsMarquee = !(out.bandBox.y >= m.bottom - 1 || out.bandBox.y + out.bandBox.h <= m.top + 1);
  }
  return out;
};
