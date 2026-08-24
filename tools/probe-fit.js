async (doc, win) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  doc.documentElement.style.scrollBehavior = 'auto';

  /**
   * The honest test of "text sticking out of its box": scrollWidth against
   * clientWidth on the element that owns the box. Measuring the widest word against
   * getBoundingClientRect gives false positives for inline elements, whose rect is a
   * line box rather than a container.
   */
  const out = { viewport: win.innerWidth, containers: {}, overflowing: [] };

  const hero = doc.querySelector('.hero__title');
  const heroWrap = hero?.parentElement;
  out.containers.heroWrap = heroWrap
    ? {
      tag: heroWrap.tagName.toLowerCase() + '.' + String(heroWrap.className).split(' ')[0],
      containerType: win.getComputedStyle(heroWrap).containerType,
      containerName: win.getComputedStyle(heroWrap).containerName,
      width: Math.round(heroWrap.getBoundingClientRect().width)
    }
    : 'no wrapper';
  out.containers.heroTitleFont = hero ? win.getComputedStyle(hero).fontSize : null;

  win.scrollTo(0, doc.querySelector('#prizes').offsetTop);
  await wait(700);
  const card = doc.querySelector('.prize-card');
  out.containers.prizeCard = {
    containerType: win.getComputedStyle(card).containerType,
    containerName: win.getComputedStyle(card).containerName,
    width: Math.round(card.getBoundingClientRect().width),
    h3Font: win.getComputedStyle(card.querySelector('h3')).fontSize
  };

  /* Sweep the whole page at several scroll depths and record real overflow. */
  const seen = new Map();
  const sweep = () => {
    for (const el of doc.querySelectorAll('#main h1, #main h2, #main h3, #main p, #main .eyebrow, .site-footer h3, .footer__brand')) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 4) continue;
      const over = el.scrollWidth - el.clientWidth;
      if (over <= 1) continue;
      const key = el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]
        + '|' + (el.textContent || '').trim().slice(0, 22);
      if (!seen.has(key) || seen.get(key) < over) seen.set(key, over);
    }
  };
  for (const stop of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    win.scrollTo(0, (doc.documentElement.scrollHeight - win.innerHeight) * stop);
    await wait(420);
    sweep();
  }
  out.overflowing = [...seen.entries()].map(([k, v]) => ({ el: k, overBy: v })).sort((a, b) => b.overBy - a.overBy);
  out.overflowCount = out.overflowing.length;

  /* And the visible symptom the operator complained about: a hyphen at a line end. */
  out.hyphenatedHeadings = [...doc.querySelectorAll('#main h1, #main h2, #main h3')]
    .filter((el) => win.getComputedStyle(el).hyphens === 'auto')
    .map((el) => (el.textContent || '').trim().slice(0, 24));
  return out;
};
