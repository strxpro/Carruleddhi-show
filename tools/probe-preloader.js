(async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const pre = $('[data-preloader]');
  const word = $('.preloader__word');
  const inner = $('.preloader__inner');
  if (!word) return { fatal: 'no preloader word' };

  pre.style.setProperty('display', 'grid', 'important');
  pre.style.setProperty('opacity', '1', 'important');
  pre.classList.remove('is-done', 'is-hidden');
  await document.fonts.ready;
  await new Promise((done) => setTimeout(done, 350));

  /* Wrapping is detected from the horizontal order, not the vertical position.
     The letters bounce on independent delays, so their `top` values always differ
     by a few pixels and any "how many distinct tops" test reports nonsense. A real
     line break is the only thing that makes a letter start to the LEFT of the one
     before it. */
  const wrapped = () => {
    const lefts = $$('.preloader__word span').map((s) => s.getBoundingClientRect().left);
    return lefts.some((left, i) => i > 0 && left < lefts[i - 1] - 1);
  };

  const measure = () => ({
    fontSize: Math.round(parseFloat(getComputedStyle(word).fontSize) * 10) / 10,
    inner: Math.round(inner.getBoundingClientRect().width),
    word: Math.round(word.getBoundingClientRect().width),
    wrapped: wrapped()
  });

  const out = {
    realViewport: innerWidth + 'x' + innerHeight,
    flexWrap: getComputedStyle(word).flexWrap,
    font: getComputedStyle(word).fontFamily.split(',')[0],
    now: measure()
  };

  // The ratio the CSS has to respect: eleven glyphs are this many em wide.
  const probe = document.createElement('span');
  probe.textContent = 'CARRULEDDHI';
  const cs = getComputedStyle(word);
  probe.style.cssText = 'position:absolute;left:-9999px;white-space:nowrap;font-size:100px;'
    + `font-family:${cs.fontFamily};letter-spacing:${cs.letterSpacing};font-weight:${cs.fontWeight};`;
  document.body.appendChild(probe);
  const ratio = probe.getBoundingClientRect().width / 100;
  probe.remove();
  out.emRatio = ratio.toFixed(3);

  /* Sweep the sizes the CSS actually switches on. The preloader is fixed to the
     viewport, so resizing the element is not enough — the font depends on vw and
     vh. Instead the two inputs are simulated directly: for each candidate size,
     work out what the CSS would produce and whether it would fit. */
  const rows = [];
  for (const [vw, vh] of [[390, 844], [768, 1024], [1000, 530], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]]) {
    // Mirrors the live rule: clamp(26px, min(12.4cqw, 9vh), 72px), where cqw is
    // one percent of .preloader__inner, itself min(560px, 86vw).
    const container = Math.min(560, 0.86 * vw);
    const cssFont = Math.min(Math.max(26, Math.min(0.124 * container, 0.09 * vh)), 72);
    const needed = cssFont * ratio;
    rows.push({
      viewport: `${vw}x${vh}`,
      font: Math.round(cssFont * 10) / 10,
      container: Math.round(container),
      wordNeeds: Math.round(needed),
      fits: needed <= container,
      headroomPx: Math.round(container - needed)
    });
  }
  out.sweep = rows;
  out.failing = rows.filter((r) => !r.fits).map((r) => r.viewport);
  return out;
})
