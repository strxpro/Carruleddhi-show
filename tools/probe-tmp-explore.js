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
  const mid = (el) => {
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  };

  for (let i = 0; i < 80 && !$('[data-vote-grid] .vote-card:not(.vote-card--skeleton)'); i += 1) await wait(150);
  await wait(400);
  out.coarse = window.matchMedia('(pointer: coarse)').matches;
  out.hoverNone = window.matchMedia('(hover: none)').matches;
  out.scrollWidth = document.documentElement.scrollWidth;
  out.innerWidth = window.innerWidth;

  const card = $$('[data-vote-grid] .vote-card')[0];
  card.scrollIntoView({ block: 'center' });
  await wait(300);
  const hit = $('.vote-card__hit', card);
  const p = mid(hit);
  out.log.push(`w punkcie ${p.x},${p.y} lezy ${describe(document.elementFromPoint(p.x, p.y))}`);
  try {
    await window.__tap(p.x, p.y);
    out.log.push('__tap zwrocil');
  } catch (e) {
    out.log.push('__tap rzucil: ' + e.message);
  }
  await wait(400);
  out.log.push(`po tap: is-armed=${card.classList.contains('is-armed')} is-picking=${card.classList.contains('is-picking')}`);
  return out;
}
