/** Pasek przy powiekszonej czcionce i w kazdym jezyku — czyli w warunkach z prawdziwego telefonu. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3200);
  const header = document.querySelector('.site-header');

  const zmierz = () => {
    const wszystkie = [...header.querySelectorAll('*')].filter((el) => {
      if (!el.getClientRects().length || el.closest('svg')) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 2 && r.height >= 2;
    });
    const lisc = wszystkie.filter((el) => !wszystkie.some((i) => i !== el && el.contains(i)));
    const pary = [];
    for (let i = 0; i < lisc.length; i += 1) {
      for (let j = i + 1; j < lisc.length; j += 1) {
        const a = lisc[i].getBoundingClientRect(); const b = lisc[j].getBoundingClientRect();
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) {
          const o = (el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '');
          pary.push(o(lisc[i]) + ' × ' + o(lisc[j]));
        }
      }
    }
    const poza = lisc.filter((el) => {
      const r = el.getBoundingClientRect();
      return Math.round(r.right) > window.innerWidth + 1 || Math.round(r.left) < -1;
    }).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
    return { nachodzace: pary, poza, wysokosc: Math.round(header.getBoundingClientRect().height) };
  };

  const wyniki = {};
  /* 1. powiekszona czcionka systemowa — na Androidzie to zwykle 112%, 125% albo 140% */
  for (const skala of [100, 115, 130]) {
    document.documentElement.style.fontSize = skala + '%';
    await sleep(500);
    wyniki['czcionka' + skala] = zmierz();
  }
  document.documentElement.style.fontSize = '';
  await sleep(400);

  /* 2. jezyki — niemiecki i hiszpanski maja najdluzsze napisy */
  for (const jezyk of ['pl', 'de', 'es']) {
    document.querySelector(`[data-language-option="${jezyk}"]`)?.click();
    await sleep(900);
    wyniki['jezyk_' + jezyk] = zmierz();
  }
  return wyniki;
}
