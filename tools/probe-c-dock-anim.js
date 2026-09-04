/** Dok na telefonie: animacje wejscia, dopasowanie do ekranu, brak nachodzenia.
    Najpierw odrzuca opcjonalne cookies — dopoki okno zgody stoi, dok jest schowany
    (`body.is-modal-open`), a kazdy pomiar dotyczy wtedy elementu ukrytego. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2600);
  const tylkoNiezbedne = [...document.querySelectorAll('button, a')]
    .find((el) => /niezb|essential|necessari/i.test(el.textContent || ''));
  if (tylkoNiezbedne) tylkoNiezbedne.click();
  await sleep(1800);

  const dock = document.querySelector('[data-quick-actions]');
  const buttons = [...dock.querySelectorAll('.quick-action')].filter((el) => el.getClientRects().length);
  const r = dock.getBoundingClientRect();
  const s = getComputedStyle(dock);
  return {
    animacjaDoku: s.animationName,
    lewa: Math.round(r.left), prawa: Math.round(r.right), szerokosc: Math.round(r.width),
    ekran: window.innerWidth,
    miesciSie: Math.round(r.left) >= 0 && Math.round(r.right) <= window.innerWidth,
    przyciski: buttons.map((el) => {
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return {
        napis: el.textContent.trim().slice(0, 16),
        animacja: cs.animationName, opoznienie: cs.animationDelay,
        wysokosc: Math.round(b.height), szerokosc: Math.round(b.width)
      };
    }),
    poziomyPrzewijak: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
}
