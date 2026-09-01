async (document, window) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const out = { log: [] };

  const describe = (el) => {
    if (!el) return 'nic';
    const cls = String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
  };
  const box = (el) => {
    if (!el) return 'brak';
    const b = el.getBoundingClientRect();
    return `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}`;
  };
  const mid = (el) => {
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  };
  const tap = async (x, y) => { if (window.__tap) await window.__tap(x, y); };

  for (let i = 0; i < 80 && !$('[data-vote-grid] .vote-card:not(.vote-card--skeleton)'); i += 1) await wait(150);
  await wait(400);

  const cards = () => $$('[data-vote-grid] .vote-card:not(.vote-card--skeleton)');
  document.documentElement.style.scrollBehavior = 'auto';

  out.chrome = `header ${box($('.site-header'))} | timer ${box($('[data-vote-timer]'))}`;

  const card = cards()[0];
  const wanted = 40;
  window.scrollTo(0, window.scrollY + (card.getBoundingClientRect().top - wanted));
  await wait(400);
  out.log.push(`kafelek po przewinieciu: ${box(card)}`);

  const hit = $('.vote-card__hit', card);
  const hb = hit.getBoundingClientRect();
  /* Dotkniecie w WIDOCZNA czesc zdjecia — tak jak palec, ktory nie potrafi trafic pod pasek. */
  const point = { x: Math.round(hb.left + hb.width / 2), y: Math.round(Math.max(hb.top, 150) + 20) };
  out.log.push(`przed tap1: ${point.x},${point.y} -> ${describe(document.elementFromPoint(point.x, point.y))}`);
  await tap(point.x, point.y);
  await wait(350);

  const cta = $('.vote-veil__cta', card);
  out.log.push(`po tap1: is-armed=${card.classList.contains('is-armed')} hitHidden=${hit.hidden}`);
  out.log.push(`cta ${box(cta)}; scrollY=${Math.round(window.scrollY)}`);
  const cp = mid(cta);
  out.log.push(`przed tap2: ${cp.x},${cp.y} -> ${describe(document.elementFromPoint(cp.x, cp.y))}`);
  await tap(cp.x, cp.y);
  await wait(400);
  out.log.push(`po tap2: is-picking=${card.classList.contains('is-picking')} pickerHidden=${$('.vote-veil__pick', card)?.hidden}`);

  return out;
}
