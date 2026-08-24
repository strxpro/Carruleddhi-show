async (doc, win) => {
  doc.documentElement.style.scrollBehavior = 'auto';
  doc.documentElement.style.scrollSnapType = 'none';
  const out = { pageHeight: doc.body.scrollHeight, locked: doc.body.className };
  out.sections = [...doc.querySelectorAll('#main > section')].map((s) => {
    const r = s.getBoundingClientRect();
    const cs = win.getComputedStyle(s);
    return {
      id: s.id || '(none)',
      top: Math.round(r.top + win.scrollY),
      h: Math.round(r.height),
      panel: s.dataset.panel || '',
      pos: cs.position,
      radius: cs.borderTopLeftRadius,
      overflow: cs.overflow
    };
  });
  const fonts = [...doc.fonts].map((f) => `${f.family}/${f.weight}/${f.status}`);
  out.fonts = fonts;
  out.displayFont = win.getComputedStyle(doc.querySelector('.hero__title')).fontFamily.split(',')[0].replace(/"/g, '');
  out.bodyFont = win.getComputedStyle(doc.body).fontFamily.split(',')[0].replace(/"/g, '');
  out.heroTitleWidth = Math.round(doc.querySelector('.hero__title').getBoundingClientRect().width);
  out.heroTitleScrollW = doc.querySelector('.hero__title').scrollWidth;

  // Anything wider than its own box is text spilling out of a card.
  const overflowing = [];
  for (const el of doc.querySelectorAll('#main h1, #main h2, #main h3, #main p, #main .btn, #main .card-tag, #main .eyebrow, #main time')) {
    if (el.scrollWidth - el.clientWidth > 2 && el.clientWidth > 0) {
      overflowing.push({
        sel: el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0],
        text: (el.textContent || '').trim().slice(0, 42),
        over: el.scrollWidth - el.clientWidth
      });
    }
  }
  out.overflowing = overflowing.slice(0, 20);
  out.overflowingCount = overflowing.length;
  return out;
};
