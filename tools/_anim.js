async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';
  let prizes = null;
  for (let i = 0; i < 40 && !prizes; i += 1) { prizes = document.querySelector('#prizes'); if (!prizes) await sleep(200); }

  const sample = (label) => {
    const groups = new Map();
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running') continue;
      const t = a.effect && a.effect.target;
      if (!t || !t.getBoundingClientRect) continue;
      const r = t.getBoundingClientRect();
      const timing = a.effect.getTiming();
      const owner = t.closest('section, header, footer, dialog');
      const key = [
        a.animationName || 'js',
        t.tagName.toLowerCase() + (typeof t.className === 'string' && t.className ? '.' + t.className.trim().split(/\s+/)[0] : ''),
        timing.iterations === Infinity ? 'inf' : 'fin',
        owner ? (owner.id || owner.tagName.toLowerCase()) : 'none'
      ].join('|');
      const g = groups.get(key) || { key, n: 0, area: 0, inView: 0 };
      g.n += 1;
      g.area += Math.round(r.width * r.height);
      if (r.bottom > 0 && r.top < window.innerHeight) g.inView += 1;
      groups.set(key, g);
    }
    const list = [...groups.values()].sort((a, b) => b.n - a.n);
    return {
      label,
      total: list.reduce((s, g) => s + g.n, 0),
      infinite: list.filter((g) => g.key.includes('|inf|')).reduce((s, g) => s + g.n, 0),
      offscreen: list.reduce((s, g) => s + (g.n - g.inView), 0),
      offscreenAreaPx: list.reduce((s, g) => s + (g.inView ? 0 : g.area), 0),
      top: list.slice(0, 8).map((g) => `${g.key} n=${g.n} area=${g.area} inView=${g.inView}`)
    };
  };

  const out = { y: 0, samples: [] };
  window.scrollTo(0, prizes.getBoundingClientRect().top + window.scrollY);
  out.y = Math.round(window.scrollY);
  await sleep(1400);
  out.samples.push(sample('t+1.4s'));
  await sleep(1600);
  out.samples.push(sample('t+3s'));
  await sleep(3000);
  out.samples.push(sample('t+6s'));
  return out;
};
