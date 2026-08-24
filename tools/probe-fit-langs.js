async (doc, win) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  doc.documentElement.style.scrollBehavior = 'auto';
  const out = { viewport: win.innerWidth, perLocale: {} };

  const sweep = async () => {
    const seen = new Map();
    for (const stop of [0, 0.25, 0.5, 0.75, 1]) {
      win.scrollTo(0, (doc.documentElement.scrollHeight - win.innerHeight) * stop);
      await wait(520);
      for (const el of doc.querySelectorAll('#main h1, #main h2, #main h3, #main .eyebrow, .footer__brand')) {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 4) continue;
        const over = el.scrollWidth - el.clientWidth;
        if (over <= 1) continue;
        const key = (el.textContent || '').trim().slice(0, 26);
        if (!seen.has(key) || seen.get(key) < over) seen.set(key, over);
      }
    }
    return [...seen.entries()].map(([k, v]) => `${k} +${v}`);
  };

  for (const locale of ['it', 'pl', 'en', 'de', 'es', 'fr']) {
    const option = doc.querySelector(`[data-language-option="${locale}"]`);
    if (option) {
      option.click();
      await wait(1400);
    }
    const bad = await sweep();
    out.perLocale[locale] = { overflowing: bad.length, samples: bad.slice(0, 4) };
  }

  out.worst = Math.max(...Object.values(out.perLocale).map((v) => v.overflowing));
  return out;
};
