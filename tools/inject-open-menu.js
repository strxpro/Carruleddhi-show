/**
 * Otwiera menu po wczytaniu strony, zeby dalo sie je sfotografowac.
 * cdp.mjs shot nie umie klikac; to jest jedyny sposob, zeby zdjecie pokazalo
 * panel w stanie otwartym.
 */
window.addEventListener('load', () => {
  setTimeout(() => document.querySelector('[data-menu-toggle]')?.click(), 1400);
});
