async (doc, win) => {
  const out = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  doc.documentElement.style.scrollBehavior = 'auto';

  /* ----------------------------------------- gallery fits one viewport exactly */
  const gallerySection = doc.querySelector('#gallery');
  out.galleryPanel = gallerySection.dataset.panel;
  win.scrollTo(0, gallerySection.getBoundingClientRect().top + win.scrollY);
  await wait(1600);
  const g = doc.querySelector('[data-gallery3d]');
  const parts = {
    head: box(doc.querySelector('#gallery .gallery__head')),
    frame: box(doc.querySelector('.g3d__frame')),
    caption: box(doc.querySelector('.g3d__caption')),
    dots: box(doc.querySelector('.g3d__dots'))
  };
  out.gallery = {
    sectionHeight: box(gallerySection).h,
    viewport: win.innerHeight,
    oneViewport: box(gallerySection).h <= win.innerHeight + 2,
    parts,
    topMost: Math.min(...Object.values(parts).map((p) => p.y)),
    bottomMost: Math.max(...Object.values(parts).map((p) => p.y + p.h)),
    pinSpacer: Boolean(doc.querySelector('.pin-spacer'))
  };
  out.gallery.allOnScreen = out.gallery.topMost >= 0 && out.gallery.bottomMost <= win.innerHeight;
  const cards = [...doc.querySelectorAll('.g3d__card')];
  out.gallery.cardTransforms = cards.slice(0, 3).map((c) => win.getComputedStyle(c).transform.slice(0, 30));
  out.gallery.has3dTurn = cards.some((c) => win.getComputedStyle(c).transform.startsWith('matrix3d'));
  out.gallery.perspective = win.getComputedStyle(g).perspective;

  /* -------------------------------------------------------------- route markers */
  win.scrollTo(0, doc.querySelector('#route').getBoundingClientRect().top + win.scrollY);
  await wait(3200);
  out.route = {
    runnerInDom: Boolean(doc.querySelector('[data-route-runner]')),
    pins: [...doc.querySelectorAll('[data-route-frame] .route__pin')].map((p) => ({
      t: (p.textContent || '').trim(), w: box(p).w, h: box(p).h, font: win.getComputedStyle(p).fontSize
    })),
    node: box(doc.querySelector('.route__node')),
    dashWidth: win.getComputedStyle(doc.querySelector('[data-route-dash]')).strokeWidth,
    ribbonOpacity: win.getComputedStyle(doc.querySelector('[data-route-ribbon-fill]')).fillOpacity
  };

  /* ------------------------------------------------------- prize deck behaviour */
  const prizes = doc.querySelector('#prizes');
  win.scrollTo(0, prizes.getBoundingClientRect().top + win.scrollY);
  await wait(900);
  const deck = doc.querySelector('[data-prize-deck]');
  const deckCards = [...doc.querySelectorAll('[data-prize-card]')];
  out.deck = {
    perspective: win.getComputedStyle(deck).perspective,
    touchAction: win.getComputedStyle(deck).touchAction,
    filtersOnStack: deckCards.slice(0, 5).map((c) => win.getComputedStyle(c).filter),
    prevButton: Boolean(doc.querySelector('[data-deck-prev]')),
    indexStart: (doc.querySelector('[data-deck-current]').textContent || '').trim()
  };
  doc.querySelector('[data-deck-next]').click();
  await wait(700);
  out.deck.afterNext = (doc.querySelector('[data-deck-current]').textContent || '').trim();
  doc.querySelector('[data-deck-prev]').click();
  await wait(700);
  out.deck.afterPrev = (doc.querySelector('[data-deck-current]').textContent || '').trim();
  out.deck.canGoBothWays = out.deck.afterNext !== out.deck.indexStart && out.deck.afterPrev === out.deck.indexStart;

  /* ----------------------------------------------- attendance press then unpress */
  win.scrollTo(0, doc.querySelector('#attendance').getBoundingClientRect().top + win.scrollY);
  await wait(600);
  const press = doc.querySelector('[data-attendance-button]');
  const readCount = () => (doc.querySelector('[data-attendee-count]').textContent || '').replace(/\D/g, '');
  out.attendance = { countBefore: readCount(), doneBefore: press.classList.contains('is-done') };
  press.click();
  await wait(1300);
  out.attendance.doneAfterFirst = press.classList.contains('is-done');
  out.attendance.countAfterFirst = readCount();
  doc.querySelector('.modal.is-open')?.classList.remove('is-open');
  doc.body.classList.remove('is-locked');
  await wait(300);
  press.click();
  await wait(1300);
  out.attendance.doneAfterSecond = press.classList.contains('is-done');
  out.attendance.countAfterSecond = readCount();
  out.attendance.togglesOff = out.attendance.doneAfterFirst && !out.attendance.doneAfterSecond
    && out.attendance.countAfterSecond === out.attendance.countBefore;

  /* --------------------------------------------------- footer glow + scrollability */
  win.scrollTo(0, doc.documentElement.scrollHeight);
  await wait(1000);
  const glow = doc.querySelector('[data-footer-glow]');
  const footer = doc.querySelector('.site-footer');
  out.footer = {
    snapAlign: win.getComputedStyle(footer).scrollSnapAlign,
    maxScroll: doc.documentElement.scrollHeight - win.innerHeight,
    reached: Math.round(win.scrollY),
    glowInDom: Boolean(glow),
    glowPosition: glow ? win.getComputedStyle(glow).position : null,
    glowHeight: glow ? glow.offsetHeight : null,
    glowProgressAtBottom: glow ? glow.style.getPropertyValue('--footer-glow-progress') : null,
    footerBottomVisible: Math.round(footer.getBoundingClientRect().bottom) <= win.innerHeight + 2
  };
  out.footer.canReachBottom = Math.abs(out.footer.reached - out.footer.maxScroll) < 4;
  win.scrollTo(0, out.footer.maxScroll - out.footer.glowHeight * 1.4);
  await wait(700);
  out.footer.glowProgressEarlier = glow.style.getPropertyValue('--footer-glow-progress');
  out.footer.glowGrows = Number(out.footer.glowProgressAtBottom) > Number(out.footer.glowProgressEarlier);

  /* ------------------------------------------- language switch, letter by letter */
  win.scrollTo(0, 0);
  await wait(700);
  doc.querySelector('[data-language-option="en"]').click();
  await wait(90);
  out.letters = {
    spansMidFlip: doc.querySelectorAll('.flip-letter').length,
    sampleAnimation: (() => {
      const s = doc.querySelector('.flip-letter');
      return s ? win.getComputedStyle(s).animationName : null;
    })()
  };
  await wait(1600);
  out.letters.spansAfter = doc.querySelectorAll('.flip-letter').length;
  out.letters.taglineText = (doc.querySelector('.hero__tagline').textContent || '').trim();
  out.letters.htmlLang = doc.documentElement.lang;
  return out;
};
