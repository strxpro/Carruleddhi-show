/**
 * TOR C — pomiar stanu wyjsciowego: licznik obecnosci, przycisk "Ci saro",
 * pasek sponsorow i naglowek w stanie zwinietym.
 *
 *     node tools/cdp.mjs probe tools/probe-c-baseline.js --w 1440 --h 900
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const out = {};

  /* --- licznik i przycisk obecnosci --- */
  const counter = document.querySelector('.attendance__counter');
  const press = document.querySelector('.attendance__press');
  const rest = document.querySelector('.avatar--rest');
  out.attendance = {
    counterNow: counter && counter.textContent.trim(),
    heroAttendee: document.querySelector('.hero-stat__number[data-attendee-count]')?.textContent.trim(),
    heroPilots: document.querySelector('.hero-stat__number[data-pilots-count]')?.textContent.trim(),
    restNow: rest && rest.textContent.trim(),
    press: box(press),
    pressRatio: press ? +(press.getBoundingClientRect().width / press.getBoundingClientRect().height).toFixed(3) : null,
    pressRadius: press && getComputedStyle(press).borderRadius,
    avatars: [...document.querySelectorAll('.avatar')].map((a) => box(a))
  };

  /* --- pasek sponsorow --- */
  const band = document.querySelector('[data-sponsor-band]');
  out.sponsors = {
    hidden: band ? band.hasAttribute('hidden') : 'brak elementu',
    parentSection: band ? band.closest('section')?.id : null,
    logos: document.querySelectorAll('.sponsor-logo').length,
    cta: Boolean(document.querySelector('[data-sponsor-ask]'))
  };

  /* --- naglowek: pelny --- */
  const header = document.querySelector('.site-header');
  const shell = document.querySelector('.nav-shell');
  const current = document.querySelector('.nav-current');
  const attend = document.querySelector('.nav-attend');
  const lang = document.querySelector('.language-picker');
  const readHeader = (label) => {
    const s = box(shell);
    const c = box(current);
    return {
      label,
      classes: header.className,
      shell: s,
      current: c,
      currentCentreOffset: s && c ? Math.round((c.x + c.w / 2) - (s.x + s.w / 2)) : null,
      attend: { ...box(attend), ...(attend ? { opacity: getComputedStyle(attend).opacity, visibility: getComputedStyle(attend).visibility, maxWidth: getComputedStyle(attend).maxWidth } : {}) },
      lang: { ...box(lang), ...(lang ? { opacity: getComputedStyle(lang).opacity, visibility: getComputedStyle(lang).visibility } : {}) }
    };
  };
  out.headerTop = readHeader('scrollY=0');

  document.documentElement.style.scrollBehavior = 'auto';
  window.scrollTo(0, 900);
  await sleep(900);
  out.headerCompact = readHeader('scrollY=900');

  /* mikroruch w gore — to jest gest, ktory dodaje is-peeked */
  window.scrollTo(0, 880);
  await sleep(120);
  out.headerAfterTinyScrollUp = readHeader('scrollY=880 (o 20px w gore)');

  return out;
};
