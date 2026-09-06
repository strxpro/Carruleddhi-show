/** Kazdy widoczny element paska kontra kazdy inny, na gorze strony i po przewinieciu. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3200);
  const header = document.querySelector('.site-header');

  const zbierz = () => {
    /* Lisce: elementy bez dzieci-elementow albo takie, ktore same rysuja tlo/tekst. */
    const wszystkie = [...header.querySelectorAll('*')].filter((el) => {
      if (!el.getClientRects().length) return false;
      /* Wnetrza ikon pomijamy: ksztalty w jednym rysunku nakladaja sie z natury i nie ma
         w tym zadnej usterki. Interesuja nas kontrolki paska, nie sciezki w SVG. */
      if (el.closest('svg')) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      return true;
    });
    /* Tylko te, ktore nie zawieraja innego zebranego elementu — zeby nie liczyc rodzicow. */
    return wszystkie.filter((el) => !wszystkie.some((inny) => inny !== el && el.contains(inny)));
  };

  const zmierz = () => {
    const lisc = zbierz();
    const pary = [];
    for (let i = 0; i < lisc.length; i += 1) {
      for (let j = i + 1; j < lisc.length; j += 1) {
        const a = lisc[i].getBoundingClientRect();
        const b = lisc[j].getBoundingClientRect();
        const zachodzi = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (!zachodzi) continue;
        const opis = (el) => (el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
        pary.push(opis(lisc[i]) + ' × ' + opis(lisc[j]));
      }
    }
    const poza = lisc.filter((el) => {
      const r = el.getBoundingClientRect();
      return Math.round(r.right) > window.innerWidth + 1 || Math.round(r.left) < -1;
    }).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
    return { liscie: lisc.length, nachodzace: pary, pozaEkranem: poza, wysokoscPaska: Math.round(header.getBoundingClientRect().height) };
  };

  const naGorze = zmierz();
  window.scrollTo({ top: 2200, behavior: 'instant' });
  await sleep(1500);
  const poPrzewinieciu = zmierz();
  return { ekran: window.innerWidth, naGorze, poPrzewinieciu };
}
