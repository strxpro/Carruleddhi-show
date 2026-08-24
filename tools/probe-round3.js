async (doc, win) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  doc.documentElement.style.scrollBehavior = 'auto';
  const out = { viewport: { w: win.innerWidth, h: win.innerHeight } };
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };

  /* ------------------------------------------------- no sideways scroll at all */
  const widest = [];
  for (const stop of [0, 0.25, 0.5, 0.75, 1]) {
    win.scrollTo(0, (doc.documentElement.scrollHeight - win.innerHeight) * stop);
    await wait(380);
    widest.push(doc.documentElement.scrollWidth);
  }
  out.horizontal = {
    clientWidth: doc.documentElement.clientWidth,
    scrollWidths: widest,
    maxScrollWidth: Math.max(...widest),
    canScrollSideways: Math.max(...widest) > doc.documentElement.clientWidth + 1,
    htmlOverflowX: win.getComputedStyle(doc.documentElement).overflowX
  };

  /* ------------------------------------------------------------- snap targets */
  out.snap = {
    type: win.getComputedStyle(doc.documentElement).scrollSnapType,
    targets: [...doc.querySelectorAll('#main > section')]
      .map((s) => ({ id: s.id, panel: s.dataset.panel, align: win.getComputedStyle(s).scrollSnapAlign,
        stop: win.getComputedStyle(s).scrollSnapStop }))
  };
  out.snap.tallSectionsAreTargets = out.snap.targets
    .filter((t) => t.panel === 'flow' && t.align !== 'none').map((t) => t.id);

  /* --------------------------------------------------------------- bottom dock */
  win.scrollTo(0, 60);
  await wait(500);
  const dock = doc.querySelector('[data-quick-actions]');
  out.dock = { atTop: { mini: dock.classList.contains('is-mini'), ...box(dock) } };
  win.scrollTo(0, 2400);
  await wait(700);
  out.dock.afterScroll = { mini: dock.classList.contains('is-mini'), ...box(dock) };
  out.dock.shrinks = out.dock.afterScroll.w < out.dock.atTop.w;
  const dockRect = dock.getBoundingClientRect();
  out.dock.centredWhenMini = Math.abs(dockRect.left - (win.innerWidth - dockRect.right)) <= 2;
  // First tap must open it, not fire a button.
  const attend = doc.querySelector('[data-quick-attend]');
  const pressedBefore = attend.getAttribute('aria-pressed');
  attend.click();
  await wait(500);
  out.dock.afterFirstTap = {
    mini: dock.classList.contains('is-mini'),
    pressedChanged: attend.getAttribute('aria-pressed') !== pressedBefore,
    w: box(dock).w
  };
  out.dock.tapExpandsWithoutActing =
    !out.dock.afterFirstTap.mini && !out.dock.afterFirstTap.pressedChanged;

  /* -------------------------------------------------------- language flip words */
  win.scrollTo(0, 0);
  await wait(600);
  // changeLanguage() returns early when the target equals the current language, and
  // headless Chrome starts in Polish, so the first switch has to be to something else.
  doc.querySelector('[data-language-option="en"]').click();
  await wait(1500);
  doc.querySelector('[data-language-option="pl"]').click();
  await wait(140);
  out.flip = {
    letters: doc.querySelectorAll('.flip-letter').length,
    words: doc.querySelectorAll('.flip-word').length,
    // No button or dock label may have been split apart.
    insideControls: doc.querySelectorAll('.quick-action .flip-letter, .btn .flip-letter, .menu-panel .flip-letter').length,
    wordsUnbreakable: [...doc.querySelectorAll('.flip-word')].every((w) => win.getComputedStyle(w).whiteSpace === 'nowrap')
  };
  await wait(1400);
  out.flip.after = doc.querySelectorAll('.flip-letter').length;
  out.flip.quickLabel = (doc.querySelector('[data-attendance-quick-label]').textContent || '').trim();
  out.flip.signupLabel = (doc.querySelector('.quick-action--signup span[data-i18n]').textContent || '').trim();

  /* --------------------------------------------------------------- postal code */
  const postal = doc.querySelector('[name="postalCode"]');
  out.postal = postal ? {
    exists: true,
    label: (doc.querySelector('label[for="postal-code"]').textContent || '').trim(),
    autocomplete: postal.getAttribute('autocomplete'),
    taxCodeGone: !doc.querySelector('[name="taxCode"]')
  } : { exists: false };

  /* ---------------------------------------------------------------- the wall */
  const wall = doc.querySelector('#wall');
  out.wall = wall ? {
    inDom: true,
    hidden: wall.hidden,
    state: wall.dataset.wallState || '(active)',
    title: (doc.querySelector('#wall-title').textContent || '').trim(),
    formFields: [...wall.querySelectorAll('[data-wall-form] [name]')].map((f) => f.name),
    duplicateCtaHidden: win.getComputedStyle(doc.querySelector('[data-duplicate-cta]')).display === 'none'
  } : { inDom: false };

  /* ---------------------------------------------------------- footer breathing */
  win.scrollTo(0, doc.documentElement.scrollHeight);
  await wait(900);
  const cols = [...doc.querySelectorAll('.footer-glow__col')];
  out.footer = {
    columns: cols.length,
    animations: [...new Set(cols.map((c) => win.getComputedStyle(c).animationName))],
    durations: [...new Set(cols.map((c) => win.getComputedStyle(c).animationDuration))].slice(0, 4),
    blur: (() => {
      const f = doc.querySelector('#footer-glow-blur feGaussianBlur');
      return f ? f.getAttribute('stdDeviation') : null;
    })(),
    rounded: doc.querySelector('.footer-glow__col rect')?.getAttribute('rx')
  };

  /* --------------------------------------------------------------- scroll bar */
  out.scrollbar = {
    firefoxColor: win.getComputedStyle(doc.documentElement).scrollbarColor,
    width: win.getComputedStyle(doc.documentElement).scrollbarWidth
  };
  return out;
};
