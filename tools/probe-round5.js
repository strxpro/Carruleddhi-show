async (doc, win) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  doc.documentElement.style.scrollBehavior = 'auto';
  const out = { viewport: { w: win.innerWidth, h: win.innerHeight } };
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };

  /* ------------------------------------------------- no zoom, no side scroll */
  out.touchAction = win.getComputedStyle(doc.documentElement).touchAction;
  out.canScrollSideways = doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1;

  /* ------------------------------------------------------- flag in a circle */
  const trigger = doc.querySelector('[data-language-trigger]');
  const flag = doc.querySelector('[data-language-flag]');
  out.flag = {
    trigger: box(trigger),
    radius: win.getComputedStyle(trigger).borderTopLeftRadius,
    isCircle: box(trigger).w === box(trigger).h,
    flagBox: box(flag),
    flagHasSvg: Boolean(flag.querySelector('svg')),
    codeHidden: win.getComputedStyle(doc.querySelector('[data-language-code]')).display === 'none'
  };
  trigger.click();
  await wait(400);
  const options = [...doc.querySelectorAll('[data-language-option]')];
  out.flag.menuOpens = options.some((o) => box(o).h > 4);
  out.flag.optionCircles = options.filter((o) => {
    const first = o.firstElementChild;
    return first && win.getComputedStyle(first).borderRadius.startsWith('50%');
  }).length;
  trigger.click();
  await wait(250);

  /* --------------------------------------------------------- section loader */
  const before = Math.round(win.scrollY);
  const wipe = doc.querySelector('[data-page-wipe]');
  doc.querySelector('a[href="#route"]')?.click();
  await wait(180);
  const bars = [...doc.querySelectorAll('.page-wipe__bars i')];
  out.loader = {
    exists: Boolean(wipe),
    covering: wipe.classList.contains('is-covering'),
    barCount: bars.length,
    // Mid-cover the bars should be on their way in, none of them parked halfway
    // and abandoned.
    transformsMid: bars.map((b) => win.getComputedStyle(b).transform.slice(0, 24))
  };
  await wait(430);
  out.loader.clearingAt610 = wipe.classList.contains('is-clearing');
  out.loader.scrolledWhileCovered = Math.round(win.scrollY) !== before;
  await wait(600);
  out.loader.classesCleared = !wipe.classList.contains('is-covering') && !wipe.classList.contains('is-clearing');
  out.loader.visibility = win.getComputedStyle(wipe).visibility;
  out.loader.landedOnRoute = Math.abs(win.scrollY - (doc.querySelector('#route').offsetTop)) < 60;

  /* -------------------------------------------------------------- the dock */
  win.scrollTo(0, 300);
  await wait(300);
  const dock = doc.querySelector('[data-quick-actions]');
  out.dock = { wideAtTop: box(dock).w };
  // Continuous downward scrolling for longer than the 420 ms threshold.
  for (let i = 0; i < 8; i += 1) { win.scrollBy(0, 90); await wait(90); }
  await wait(500);
  out.dock.miniAfterScrollDown = dock.classList.contains('is-mini');
  out.dock.narrow = box(dock).w;
  // Scrolling back up must bring it and the header back.
  for (let i = 0; i < 4; i += 1) { win.scrollBy(0, -110); await wait(90); }
  await wait(400);
  out.dock.wideAfterScrollUp = !dock.classList.contains('is-mini');
  out.header = {
    peekedAfterScrollUp: doc.querySelector('.site-header').classList.contains('is-peeked'),
    width: box(doc.querySelector('.site-header')).w,
    languageVisible: box(doc.querySelector('.site-header .language-picker')).w > 10
  };
  out.dock.nudgeVars = [
    win.getComputedStyle(dock).getPropertyValue('--dock-nudge-x').trim(),
    win.getComputedStyle(dock).getPropertyValue('--dock-nudge-y').trim()
  ];
  out.dock.transform = win.getComputedStyle(dock).transform.slice(0, 30);

  /* --------------------------------------- modal clear of the header + toast */
  win.scrollTo(0, doc.querySelector('#attendance').offsetTop);
  await wait(500);
  const press = doc.querySelector('[data-attendance-button]');
  out.attendance = { doneBefore: press.classList.contains('is-done') };
  press.click();
  await wait(700);
  const modal = doc.querySelector('.modal.is-open');
  out.modal = { open: Boolean(modal) };
  if (modal) {
    const dialog = box(modal.querySelector('.modal__dialog'));
    const header = doc.querySelector('.site-header');
    out.modal.dialogTop = dialog.y;
    out.modal.headerHidden = win.getComputedStyle(header).opacity === '0';
    out.modal.clearsHeader = dialog.y >= 70;
    modal.classList.remove('is-open');
    doc.body.classList.remove('is-modal-open');
  }
  const toast = doc.querySelector('[data-toast], .toast');
  out.toast = toast ? { text: (toast.textContent || '').trim().slice(0, 48), visible: toast.classList.contains('is-visible') } : 'missing';

  /* --------------------------------------------------- prize deck on a phone */
  win.scrollTo(0, doc.querySelector('#prizes').offsetTop);
  await wait(600);
  const card = doc.querySelector('[data-prize-card]');
  const deck = doc.querySelector('[data-prize-deck]');
  const controls = doc.querySelector('.deck-controls');
  out.deck = {
    card: box(card),
    deck: box(deck),
    controls: box(controls),
    touchAction: win.getComputedStyle(deck).touchAction,
    cardFitsWidth: box(card).x >= 0 && box(card).x + box(card).w <= win.innerWidth,
    controlsBelowDeck: box(controls).y >= box(deck).y + box(deck).h - 4
      || box(controls).y + box(controls).h <= box(deck).y + 4
  };
  return out;
};
