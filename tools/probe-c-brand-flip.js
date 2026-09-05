/** Data pod nazwa: czy na gorze widac date, a po przewinieciu odliczanie. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3000);
  const header = document.querySelector('.site-header');
  const flip = document.querySelector('[data-brand-flip]');
  const zegarSrodkowy = document.querySelector('.nav-clock');
  if (!flip) return { blad: 'brak elementu obrotu' };

  const stan = () => ({
    zadokowany: header.hasAttribute('data-clock-docked'),
    obrot: getComputedStyle(flip).transform.slice(0, 42),
    dataWidoczna: (() => { const r = document.querySelector('[data-header-date]').getBoundingClientRect(); return r.width > 0 && r.height > 0; })(),
    liczbyWypelnione: [...flip.querySelectorAll('b')].map((b) => b.textContent.trim()).join(':')
  });

  const naGorze = stan();
  window.scrollTo({ top: 1800, behavior: 'instant' });
  await sleep(1600);
  const poPrzewinieciu = stan();

  return {
    naGorze,
    poPrzewinieciu,
    obrotSieZmienil: naGorze.obrot !== poPrzewinieciu.obrot,
    zegarNaSrodkuUkryty: zegarSrodkowy ? getComputedStyle(zegarSrodkowy).display === 'none' : '(brak)',
    wysokoscPaska: Math.round(header.getBoundingClientRect().height)
  };
}
