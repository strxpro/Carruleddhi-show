/** Pasek: czy cokolwiek na siebie nachodzi i czy wszystko miesci sie w szerokosci.
    Liczy TAKZE odliczanie, ktorego wczesniejsza sonda nie brala pod uwage — a to wlasnie
    ono robilo tlok na zrzucie od zglaszajacego. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3200);
  const header = document.querySelector('.site-header');
  const sel = '.nav-current, .language-picker, .nav-attend, .nav-toggle, .nav-live, .nav-vote, .site-header__brand, .nav-brand';
  const widoczne = [...header.querySelectorAll(sel)].filter((el) => el.getClientRects().length > 0);
  const pary = [];
  for (let i = 0; i < widoczne.length; i += 1) {
    for (let j = i + 1; j < widoczne.length; j += 1) {
      const a = widoczne[i].getBoundingClientRect();
      const b = widoczne[j].getBoundingClientRect();
      /* Pomijam pary rodzic-dziecko: zawieranie sie nie jest nachodzeniem. */
      if (widoczne[i].contains(widoczne[j]) || widoczne[j].contains(widoczne[i])) continue;
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) {
        pary.push(widoczne[i].className.split(' ')[0] + ' × ' + widoczne[j].className.split(' ')[0]);
      }
    }
  }
  const h = header.getBoundingClientRect();
  return {
    szerokoscEkranu: window.innerWidth,
    wysokoscPaska: Math.round(h.height),
    elementow: widoczne.map((el) => el.className.split(' ')[0]),
    nachodzacePary: pary,
    cokolwiekWystaje: widoczne.some((el) => {
      const r = el.getBoundingClientRect();
      return Math.round(r.right) > window.innerWidth + 1 || Math.round(r.left) < -1;
    })
  };
}
