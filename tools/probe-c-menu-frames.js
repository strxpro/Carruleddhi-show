/** Czy podwojenie pojawia sie przelotnie, w trakcie otwierania menu. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3000);
  const menu = document.querySelector('[data-mobile-menu]');
  const klatki = [];
  document.querySelector('[data-menu-toggle]')?.click();
  for (const t of [80, 200, 400, 700, 1100]) {
    await sleep(t === 80 ? 80 : 0);
    if (t > 80) await sleep(t - klatki[klatki.length - 1].ms);
    const linki = [...menu.querySelectorAll('a')].map((a) => a.textContent.replace(/\s+/g, ' ').trim());
    const licznik = {};
    linki.forEach((x) => { licznik[x] = (licznik[x] || 0) + 1; });
    klatki.push({
      ms: t,
      odsylaczy: linki.length,
      podwojonych: Object.values(licznik).filter((n) => n > 1).length,
      flipLetters: menu.querySelectorAll('.flip-letter').length,
      klasyBody: document.body.className.replace(/\s+/g, ' ').trim().slice(0, 60)
    });
  }
  return { klatki };
}
