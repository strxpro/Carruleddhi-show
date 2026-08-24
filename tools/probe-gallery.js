async (doc, win) => {
  doc.documentElement.style.scrollBehavior = 'auto';
  const out = {};
  const section = doc.querySelector('[data-gallery3d]');
  const stage = doc.querySelector('[data-gallery3d-stage]');
  const ring = doc.querySelector('[data-gallery3d-ring]');
  const frame = doc.querySelector('[data-gallery3d-frame]');
  const heading = doc.querySelector('[data-gallery3d-heading]');
  if (!section || !stage || !ring) return { section: !!section, stage: !!stage, ring: !!ring };

  win.scrollTo(0, section.getBoundingClientRect().top + win.scrollY + 300);
  await new Promise((r) => setTimeout(r, 1400));

  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const cards = [...ring.querySelectorAll('.g3d__card')];
  out.cards = cards.length;
  out.dots = doc.querySelectorAll('.g3d__dot').length;
  out.isStatic = section.classList.contains('is-static');
  out.frame = box(frame);
  out.ring = box(ring);
  out.card = box(cards[0]);
  out.radius = win.getComputedStyle(cards[0].querySelector('.g3d__media')).borderTopLeftRadius;

  /* Nothing may clip: an ancestor with overflow hidden shorter than the card is
     exactly what sliced the tops and bottoms off before. */
  out.frameOverflow = win.getComputedStyle(frame).overflow;
  out.cardFitsFrame = out.card.h <= out.frame.h && out.card.w <= out.frame.w;
  out.cardTopVsFrameTop = out.card.y - out.frame.y;
  out.cardBottomVsFrameBottom = out.frame.y + out.frame.h - (out.card.y + out.card.h);

  /* The heading must clear the fixed header pill. */
  const header = doc.querySelector('.site-header');
  out.header = header ? box(header) : null;
  out.heading = box(heading);
  out.headingClearsHeader = out.header ? out.heading.y >= out.header.y + out.header.h - 2 : null;

  /* Caption and dots sit below the photos, not on top of them. */
  const cap = doc.querySelector('.g3d__caption');
  const dots = doc.querySelector('.g3d__dots');
  out.captionBelowFrame = box(cap).y >= out.frame.y + out.frame.h - 2;
  out.dotsBelowFrame = box(dots).y >= out.frame.y + out.frame.h - 2;

  const stageCentre = () => {
    const r = stage.getBoundingClientRect();
    return r.left + r.width / 2;
  };
  const nearest = () => {
    const c = stageCentre();
    return cards
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        return { i, d: Math.abs(r.left + r.width / 2 - c) };
      })
      .sort((a, b) => a.d - b.d)[0];
  };

  const first = nearest();
  out.frontIndex = first.i;
  out.frontDriftPx = Math.round(first.d);
  out.noFilter = cards.every((el) => win.getComputedStyle(el).filter === 'none');
  out.visibleCards = cards.filter((el) => Number(win.getComputedStyle(el).opacity) > 0.12).length;
  out.opacities = cards.map((el) => Number(win.getComputedStyle(el).opacity).toFixed(2));

  /* Size must not change while scrolling through the pinned section — that scrub
     was the reason the photos ballooned. */
  const sizeBefore = `${out.frame.w}x${out.frame.h}`;
  win.scrollBy(0, 700);
  await new Promise((r) => setTimeout(r, 700));
  const mid = box(frame);
  win.scrollBy(0, 700);
  await new Promise((r) => setTimeout(r, 700));
  const late = box(frame);
  out.frameSizeStable = {
    before: sizeBefore,
    mid: `${mid.w}x${mid.h}`,
    late: `${late.w}x${late.h}`,
    stable: sizeBefore === `${mid.w}x${mid.h}` && sizeBefore === `${late.w}x${late.h}`
  };

  doc.querySelector('[data-gallery3d-next]')?.click();
  await new Promise((r) => setTimeout(r, 1300));
  const second = nearest();
  out.afterNext = { index: second.i, drift: Math.round(second.d), moved: second.i !== first.i };
  out.caption = (doc.querySelector('[data-gallery3d-caption]').textContent || '').trim().slice(0, 40);
  out.brokenImages = [...ring.querySelectorAll('img')].filter((i) => !(i.complete && i.naturalWidth > 0)).length;
  out.pinSpacer = Boolean(doc.querySelector('.pin-spacer'));
  return out;
};
