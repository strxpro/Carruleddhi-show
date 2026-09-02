async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  const prizes = document.querySelector('#prizes');
  window.scrollTo(0, prizes.getBoundingClientRect().top + window.scrollY);
  await sleep(1200);

  const deck = document.querySelector('[data-prize-deck]');
  const cards = [...document.querySelectorAll('[data-prize-card]')];
  const counter = () => (document.querySelector('[data-deck-current]').textContent || '').trim();
  const front = () => cards.find((c) => c.getAttribute('aria-hidden') === 'false');
  const frontState = () => {
    const f = front();
    if (!f) return { fatal: 'brak wierzchniej karty' };
    const svg = f.querySelector('.prize-card__art svg');
    const cs = getComputedStyle(svg);
    const r = svg.getBoundingClientRect();
    return {
      card: cards.indexOf(f),
      cardVisibility: getComputedStyle(f).visibility,
      artHiddenClass: f.classList.contains('is-art-hidden'),
      artVisibility: cs.visibility,
      artFilter: cs.filter.slice(0, 24),
      artBox: Math.round(r.width) + 'x' + Math.round(r.height)
    };
  };

  const drag = async (dx) => {
    const f = front();
    const r = f.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const fire = (type, cx, extra) => f.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
      clientX: cx, clientY: y, isPrimary: true, ...extra
    }));
    fire('pointerdown', x);
    for (let i = 1; i <= 8; i += 1) { fire('pointermove', x + (dx * i) / 8); await sleep(16); }
    fire('pointerup', x + dx);
    await sleep(900);
  };

  const out = { start: counter(), frontAtStart: frontState() };

  document.querySelector('[data-deck-next]').click();
  await sleep(800);
  out.afterNextButton = counter();
  document.querySelector('[data-deck-prev]').click();
  await sleep(800);
  out.afterPrevButton = counter();

  deck.focus();
  deck.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  await sleep(800);
  out.afterKeyRight = counter();
  deck.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  await sleep(800);
  out.afterKeyLeft = counter();

  await drag(-140);
  out.afterDragLeft = counter();
  out.frontAfterDragLeft = frontState();

  await drag(140);
  out.afterDragRight = counter();
  out.frontAfterDragRight = frontState();

  /* Cofnięcie z karty 01 wchodzi kartą, która była POZA stosem (visibility: hidden) —
     najostrzejszy przypadek dla naprawy pamięci. */
  document.querySelector('[data-deck-prev]').click();
  await sleep(900);
  out.afterWrapBack = counter();
  out.frontAfterWrapBack = frontState();

  /* Żadna karta na wierzchu nie może mieć ukrytego rysunku ani ukrytego korpusu. */
  out.invariants = {
    frontNeverHidden: [out.frontAtStart, out.frontAfterDragLeft, out.frontAfterDragRight, out.frontAfterWrapBack]
      .every((s) => s.cardVisibility === 'visible' && s.artVisibility === 'visible' && !s.artHiddenClass),
    frontHasShadow: out.frontAfterWrapBack.artFilter.startsWith('drop-shadow')
  };
  out.paintedCards = cards.filter((c) => getComputedStyle(c).visibility !== 'hidden').length;
  out.drawnArt = cards.filter((c) => {
    const svg = c.querySelector('.prize-card__art svg');
    return svg && getComputedStyle(svg).visibility !== 'hidden';
  }).length;
  return out;
};
