/** Dymek: pojawia sie po nacisnieciu „bede tam" w doku, chowa sie na dotkniecie poza nim. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3000);
  window.scrollTo({ top: 3600, behavior: 'instant' });
  await sleep(1500);

  const dymek = document.querySelector('[data-dock-bubble]');
  if (!dymek) return { blad: 'brak dymka w dokumencie' };
  const przycisk = document.querySelector('[data-quick-attend]');
  if (!przycisk) return { blad: 'brak przycisku w doku' };

  const stan = () => ({
    ukryty: dymek.hidden,
    pokazany: dymek.classList.contains('is-shown'),
    przezroczystosc: getComputedStyle(dymek).opacity,
    napis: dymek.textContent.replace(/\s+/g, ' ').trim()
  });

  const przed = stan();
  przycisk.click();
  await sleep(700);
  const poNacisnieciu = stan();

  /* Dotkniecie gdzie indziej ma go schowac. */
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
  await sleep(600);
  const poDotknieciuPoza = stan();

  const r = dymek.getBoundingClientRect();
  const dok = document.querySelector('[data-quick-actions]').getBoundingClientRect();
  return {
    przed, poNacisnieciu, poDotknieciuPoza,
    nadDokiem: Math.round(r.bottom) <= Math.round(dok.top) + 2,
    odstepOdDoku: Math.round(dok.top - r.bottom)
  };
}
