async (doc, win) => {
  const out = {};
  const stack = doc.querySelector('[data-card-stack]');
  const cards = [...doc.querySelectorAll('.stack-card')];
  out.cards = cards.length;
  if (!stack || !cards.length) return { error: 'no stack' };

  // Any ancestor that is a scroll container silently kills position:sticky.
  const blockers = [];
  for (let el = stack; el && el !== doc.documentElement; el = el.parentElement) {
    const cs = win.getComputedStyle(el);
    const ov = cs.overflow + ' ' + cs.overflowX + ' ' + cs.overflowY;
    if (/hidden|auto|scroll|clip/.test(ov)) {
      blockers.push({
        el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '.' + (el.className || '').toString().split(' ')[0]),
        overflow: cs.overflow, x: cs.overflowX, y: cs.overflowY
      });
    }
    const t = cs.transform, f = cs.filter, p = cs.perspective, ct = cs.contain;
    if (t !== 'none' || f !== 'none' || p !== 'none' || /paint|layout|content|strict/.test(ct)) {
      blockers.push({ el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''), transform: t, filter: f, perspective: p, contain: ct });
    }
  }
  out.stickyBlockers = blockers;

  out.perCard = cards.map((c) => {
    const cs = win.getComputedStyle(c);
    const r = c.getBoundingClientRect();
    return {
      pos: cs.position,
      top: cs.top,
      h: Math.round(r.height),
      mb: cs.marginBottom,
      mt: cs.marginTop,
      radius: cs.borderTopLeftRadius
    };
  });
  out.stackHeight = Math.round(stack.getBoundingClientRect().height);
  out.stackVsCards = out.stackHeight - out.perCard.reduce((s, c) => s + c.h, 0);

  // Scroll so card 2 should be covering card 1 and read the real rects.
  const smooth = doc.documentElement.style;
  smooth.scrollBehavior = 'auto';
  smooth.scrollSnapType = 'none';
  const stackTop = stack.getBoundingClientRect().top + win.scrollY;
  win.scrollTo(0, stackTop + out.perCard[0].h + 40);
  await new Promise((r) => setTimeout(r, 250));
  out.afterScroll = cards.map((c) => {
    const r = c.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
  });
  out.overlapPx = Math.round(
    Math.min(out.afterScroll[0].bottom, out.afterScroll[1].bottom) -
      Math.max(out.afterScroll[0].top, out.afterScroll[1].top)
  );

  const heading = cards[0].querySelector('h3');
  out.displayFont = win.getComputedStyle(heading).fontFamily.split(',')[0].replace(/"/g, '');
  out.bodyFont = win.getComputedStyle(doc.body).fontFamily.split(',')[0].replace(/"/g, '');
  out.fontsLoaded = [...doc.fonts].map((f) => f.family + ' ' + f.weight + ' ' + f.status);
  return out;
};
