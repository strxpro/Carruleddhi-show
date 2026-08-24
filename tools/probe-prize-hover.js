(async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  const card = $('[data-prize-card]');
  if (!card) return { fatal: 'no prize card' };
  // The harness has already dispatched the mouse move, so :hover is live now.
  await sleep(600);

  const out = {
    hovered: card.matches(':hover'),
    transform: getComputedStyle(card).transform.slice(0, 60),
    transitionProperty: getComputedStyle(card).transitionProperty
  };

  // Position, sampled repeatedly while hovered. A card that jumps or trembles gives
  // different numbers; a still one gives the same numbers.
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    const r = card.getBoundingClientRect();
    samples.push(`${Math.round(r.left)},${Math.round(r.top)}`);
    await sleep(120);
  }
  out.samplesWhileHovered = samples.join(' | ');
  out.stillWhileHovered = new Set(samples).size === 1;

  // Does the generic lift rule still reach this card?
  out.matchesOldLiftRule = [...document.styleSheets]
    .flatMap((sheet) => {
      try { return [...sheet.cssRules]; } catch (_) { return []; }
    })
    .filter((rule) => rule.selectorText
      && rule.selectorText.includes('.prize-card:hover')
      && !rule.selectorText.includes('prize-deck'))
    .map((rule) => rule.selectorText);

  // The artwork is what should be moving instead.
  const art = $('.prize-card__art', card);
  out.artTransform = art ? getComputedStyle(art).transform.slice(0, 60) : 'none';

  return out;
})
