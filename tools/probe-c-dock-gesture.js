/** Czy dok da sie jeszcze pchnac palcem i czy rozwija sie jako calosc. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3000);
  window.scrollTo({ top: 3600, behavior: 'instant' });
  await sleep(1500);
  const dock = document.querySelector('[data-quick-actions]');
  const przed = dock.getBoundingClientRect();

  /* Proba przeciagniecia w dol, tak jak zrobilby to palec. */
  const x = Math.round(przed.left + przed.width / 2);
  const y = Math.round(przed.top + przed.height / 2);
  const opcje = (ty) => ({ bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: x, clientY: ty });
  dock.dispatchEvent(new PointerEvent('pointerdown', opcje(y)));
  for (const dy of [20, 50, 90]) {
    dock.dispatchEvent(new PointerEvent('pointermove', opcje(y + dy)));
    await sleep(90);
  }
  const wTrakcie = dock.getBoundingClientRect();
  dock.dispatchEvent(new PointerEvent('pointerup', opcje(y + 90)));
  await sleep(500);
  const po = dock.getBoundingClientRect();

  const przyciski = [...dock.querySelectorAll('.quick-action')].filter((el) => el.getClientRects().length);
  return {
    przesunalSieGdyCiagne: Math.round(wTrakcie.top - przed.top),
    wrocilNaMiejsce: Math.round(po.top - przed.top),
    klasaTrzymania: dock.classList.contains('is-held'),
    przejsciaDoku: getComputedStyle(dock).transitionProperty,
    przejsciaPrzycisku: przyciski[0] ? getComputedStyle(przyciski[0]).transitionProperty : '(brak)',
    NIE_DA_SIE_PCHNAC: Math.abs(Math.round(wTrakcie.top - przed.top)) < 1
  };
}
