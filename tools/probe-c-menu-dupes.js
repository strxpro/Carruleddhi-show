/** Czy w menu naprawde sa duplikaty, czy to prześwit spod spodu. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3000);
  document.querySelector('[data-menu-toggle]')?.click();
  await sleep(1200);

  const menu = document.querySelector('[data-mobile-menu]');
  const linki = [...menu.querySelectorAll('a')].map((a) => a.textContent.replace(/\s+/g, ' ').trim());
  const licznik = {};
  linki.forEach((t) => { licznik[t] = (licznik[t] || 0) + 1; });
  const podwojone = Object.entries(licznik).filter(([, n]) => n > 1);

  const s = getComputedStyle(menu);
  /* Co widac POD menu w punkcie, gdzie stoi lista — jesli to nie menu, tlo przeswituje. */
  const r = menu.getBoundingClientRect();
  const podSpodem = document.elementFromPoint(Math.round(r.width * 0.3), Math.round(r.height * 0.4));

  return {
    odsylaczyWMenu: linki.length,
    podwojoneWDOM: podwojone,
    tloMenu: s.background.slice(0, 60),
    przezroczystoscMenu: s.opacity,
    elementNaWierzchu: podSpodem ? (podSpodem.closest('[data-mobile-menu]') ? 'menu (dobrze)' : podSpodem.tagName + '.' + String(podSpodem.className).split(' ')[0]) : '(nic)',
    stopkaWidoczna: (() => {
      const f = document.querySelector('.site-footer');
      if (!f) return '(brak stopki)';
      const fr = f.getBoundingClientRect();
      return fr.top < window.innerHeight && fr.bottom > 0;
    })()
  };
}
