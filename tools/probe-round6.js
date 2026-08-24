async (doc, win) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const out = { viewport: { w: win.innerWidth, h: win.innerHeight } };

  /* ------------------------------------------------------------- preloader */
  // Re-show it: it removes itself on load, and its layout is the thing under test.
  const pre = doc.querySelector('[data-preloader]');
  pre.hidden = false;
  pre.classList.remove('is-done');
  await wait(300);
  const inner = pre.querySelector('.preloader__inner');
  const word = pre.querySelector('.preloader__word');
  const preBox = box(pre);
  const innerBox = box(inner);
  const wordBox = box(word);
  out.preloader = {
    display: win.getComputedStyle(pre).display,
    placeItems: win.getComputedStyle(pre).placeItems,
    innerCentredH: Math.abs((innerBox.x + innerBox.w / 2) - (preBox.x + preBox.w / 2)) <= 1,
    innerCentredV: Math.abs((innerBox.y + innerBox.h / 2) - (preBox.y + preBox.h / 2)) <= 2,
    wordCentred: Math.abs((wordBox.x + wordBox.w / 2) - (preBox.x + preBox.w / 2)) <= 1,
    letters: pre.querySelectorAll('.preloader__word span').length,
    letterAnimation: win.getComputedStyle(pre.querySelector('.preloader__word span')).animationName,
    confettiBands: pre.querySelectorAll('.preloader__confetti i').length,
    confettiAnimation: win.getComputedStyle(pre.querySelector('.preloader__confetti i')).animationName,
    wheels: pre.querySelectorAll('.preloader__wheels i').length,
    barAnimation: win.getComputedStyle(pre.querySelector('.preloader__bar')).animationName,
    wordFitsInside: wordBox.w <= innerBox.w + 1
  };
  pre.hidden = true;
  await wait(200);

  /* ----------------------------------------------------------- prize deck */
  doc.documentElement.style.scrollBehavior = 'auto';
  win.scrollTo(0, doc.querySelector('#prizes').offsetTop);
  await wait(800);
  const card = doc.querySelector('[data-prize-card]');
  const art = card.querySelector('.prize-card__art svg');
  out.deck = {
    artAnimation: win.getComputedStyle(art).animationName,
    cursor: win.getComputedStyle(card).cursor
  };
  // Nothing may move while the pointer merely rests on the card.
  const before = box(card);
  card.dispatchEvent(new win.PointerEvent('pointerover', { bubbles: true }));
  card.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
  await wait(500);
  const after = box(card);
  out.deck.movedOnHover = before.x !== after.x || before.y !== after.y
    || before.w !== after.w || before.h !== after.h;

  /* ------------------------------------------------- thank-you screen */
  win.scrollTo(0, doc.querySelector('#signup').offsetTop);
  await wait(400);
  const success = doc.querySelector('[data-form-success]');
  const form = doc.querySelector('[data-registration-form]');
  // Drive the view directly; the submit path needs a live endpoint.
  form.hidden = true;
  success.classList.add('is-active');
  await wait(400);
  out.success = {
    planRows: success.querySelectorAll('.success-plan li').length,
    planText: [...success.querySelectorAll('.success-plan li')].map((li) => (li.textContent || '').trim().slice(0, 40)),
    countdownPresent: Boolean(success.querySelector('[data-success-countdown]')),
    raceNumber: (success.querySelector('[data-race-number]').textContent || '').trim(),
    buttons: [...success.querySelectorAll('button')].map((b) => (b.textContent || '').trim().slice(0, 24)),
    fitsViewport: box(success).h <= win.innerHeight + 40
  };
  success.classList.remove('is-active');
  form.hidden = false;

  /* -------------------------------------------------- nothing overflows */
  const bad = [];
  for (const stop of [0, 0.3, 0.6, 1]) {
    win.scrollTo(0, (doc.documentElement.scrollHeight - win.innerHeight) * stop);
    await wait(450);
    for (const el of doc.querySelectorAll('#main h1, #main h2, #main h3, #main .eyebrow')) {
      const r = el.getBoundingClientRect();
      if (r.width < 8) continue;
      if (el.scrollWidth - el.clientWidth > 1) bad.push((el.textContent || '').trim().slice(0, 22));
    }
  }
  out.stillOverflowing = [...new Set(bad)];
  return out;
};
