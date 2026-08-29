/**
 * Wszystkie elementy, ktore na telefonie maja wlasne przewijanie.
 *
 * Palec przewija to, co jest pod nim. Kiedy wewnetrzna lista dojedzie do konca,
 * przegladarka przenosi ruch na strone — i jednym machnieciem mija cala sekcje.
 * To jest kandydat na „przewijam komentarze i wyrzuca mnie do formularza".
 * `overscroll-behavior` decyduje, czy to sie dzieje.
 *
 *     node tools/cdp.mjs probe tools/probe-c-scrollers.js --w 390 --h 844
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  /* Przelot przez strone, zeby reveal/IntersectionObserver odslonily sekcje —
     element ukryty nie ma przewijania, bo nie ma wysokosci. */
  const max = document.documentElement.scrollHeight - window.innerHeight;
  for (let i = 0; i <= 14; i += 1) { window.scrollTo(0, (max / 14) * i); await sleep(150); }
  await sleep(400);

  const found = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const scrollableY = /(auto|scroll)/.test(cs.overflowY);
    const scrollableX = /(auto|scroll)/.test(cs.overflowX);
    if (!scrollableY && !scrollableX) continue;
    const canY = el.scrollHeight - el.clientHeight > 4;
    const canX = el.scrollWidth - el.clientWidth > 4;
    if (!canY && !canX) continue;
    found.push({
      sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
      section: el.closest('section')?.id || el.closest('dialog,nav,header,footer')?.tagName.toLowerCase() || '',
      axis: [canY ? 'y' : '', canX ? 'x' : ''].filter(Boolean).join('+'),
      client: `${el.clientWidth}x${el.clientHeight}`,
      scroll: `${el.scrollWidth}x${el.scrollHeight}`,
      overscroll: cs.overscrollBehaviorY + ' / ' + cs.overscrollBehaviorX,
      touchAction: cs.touchAction
    });
  }
  return { count: found.length, found };
};
