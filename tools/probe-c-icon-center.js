/** Czy ikona stoi dokladnie na srodku kolka w stanie zwinietym, i czy licznik jest plaski. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3000);
  window.scrollTo({ top: 3600, behavior: 'instant' });
  await sleep(1600);
  const dock = document.querySelector('[data-quick-actions]');
  dock?.classList.add('is-mini');
  await sleep(700);

  const wyniki = [...dock.querySelectorAll('.quick-action')]
    .filter((el) => el.getClientRects().length)
    .map((el) => {
      const b = el.getBoundingClientRect();
      const ikona = el.querySelector('.quick-action__icon');
      const i = ikona.getBoundingClientRect();
      return {
        przycisk: Math.round(b.width) + 'x' + Math.round(b.height),
        odchylkaX: Math.round(((i.left + i.right) / 2) - ((b.left + b.right) / 2)),
        odchylkaY: Math.round(((i.top + i.bottom) / 2) - ((b.top + b.bottom) / 2)),
        odstepFlexa: getComputedStyle(el).gap
      };
    });

  const flip = document.querySelector('[data-brand-flip]');
  return {
    ikony: wyniki,
    WYSRODKOWANE: wyniki.every((w) => Math.abs(w.odchylkaX) <= 1 && Math.abs(w.odchylkaY) <= 1),
    perspektywa: flip ? getComputedStyle(flip).perspective : '(brak)'
  };
}
