async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  const prizes = document.querySelector('#prizes');
  window.scrollTo(0, prizes.getBoundingClientRect().top + window.scrollY);
  await sleep(1500);
  const deck = document.querySelector('[data-prize-deck]');
  const cards = [...document.querySelectorAll('[data-prize-card]')];
  // pointer-events is 'none' on non-front cards, so elementFromPoint would skip them.
  // Force it on for the hit test only, then put it back.
  const saved = cards.map((c) => c.style.pointerEvents);
  cards.forEach((c) => { c.style.pointerEvents = 'auto'; });
  document.querySelectorAll('.prize-card__art, .prize-card__art svg').forEach((el) => { el.style.pointerEvents = 'auto'; });
  await sleep(120);
  const r = deck.getBoundingClientRect();
  const topmostArt = new Map();
  const topmostCard = new Map();
  let samples = 0;
  for (let y = Math.max(0, r.top); y < Math.min(window.innerHeight, r.bottom); y += 3) {
    for (let x = Math.max(0, r.left); x < Math.min(window.innerWidth, r.right); x += 3) {
      const el = document.elementFromPoint(Math.round(x), Math.round(y));
      if (!el) continue;
      samples += 1;
      const card = el.closest('[data-prize-card]');
      if (card) {
        const i = cards.indexOf(card);
        topmostCard.set(i, (topmostCard.get(i) || 0) + 1);
        if (el.closest('.prize-card__art')) topmostArt.set(i, (topmostArt.get(i) || 0) + 1);
      }
    }
  }
  cards.forEach((c, i) => { c.style.pointerEvents = saved[i] || ''; });
  const running = document.getAnimations().filter((a) => a.playState === 'running');
  const byName = {};
  for (const a of running) byName[a.animationName || '?'] = (byName[a.animationName || '?'] || 0) + 1;
  return {
    samples,
    deckIndex: document.querySelector('[data-deck-current]')?.textContent,
    /* Ile punktów siatki 3x3 px trafia w KAŻDĄ z kart jako element najwyższy. Zero znaczy:
       ta karta jest w całości zasłonięta i nic z niej nie widać. */
    visiblePixelsPerCard: [...topmostCard.entries()].sort((a, b) => a[0] - b[0]),
    visibleArtPixelsPerCard: [...topmostArt.entries()].sort((a, b) => a[0] - b[0]),
    runningAnimations: running.length,
    runningByName: byName
  };
};
