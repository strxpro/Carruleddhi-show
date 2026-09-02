async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  const prizes = document.querySelector('#prizes');
  window.scrollTo(0, prizes.getBoundingClientRect().top + window.scrollY);
  await sleep(1400);
  const name = (el) => el.tagName.toLowerCase()
    + (el.id ? '#' + el.id : '')
    + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')
    + (el.parentElement ? ' < ' + el.parentElement.className : '');
  const wc = [];
  const flt = [];
  const anim = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (cs.willChange !== 'auto') wc.push({ n: name(el), wc: cs.willChange, w: Math.round(r.width), h: Math.round(r.height) });
    if (cs.filter !== 'none') flt.push({ n: name(el), f: cs.filter.slice(0, 46), w: Math.round(r.width), h: Math.round(r.height) });
  }
  const running = document.getAnimations().filter((a) => a.playState === 'running');
  const byName = {};
  for (const a of running) {
    const key = (a.animationName || a.constructor.name) + '|' + (a.effect?.target?.className || a.effect?.target?.tagName || '?');
    byName[key] = (byName[key] || 0) + 1;
  }
  return {
    stackCards: document.querySelectorAll('.stack-card').length,
    willChange: wc,
    filters: flt,
    runningAnimations: running.length,
    allAnimations: document.getAnimations().length,
    runningByName: byName,
    anim
  };
};
