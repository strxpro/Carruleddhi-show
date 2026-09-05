/** Czy odsylacze w stopce sie dubluja. */
async (document) => {
  await new Promise((r) => setTimeout(r, 3400));
  const stopka = document.querySelector('.site-footer');
  if (!stopka) return { blad: 'brak stopki' };
  const linki = [...stopka.querySelectorAll('a, button')]
    .filter((el) => el.getClientRects().length)
    .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const licznik = {};
  linki.forEach((t) => { licznik[t] = (licznik[t] || 0) + 1; });
  return {
    razem: linki.length,
    podwojone: Object.entries(licznik).filter(([, n]) => n > 1),
    listy: [...stopka.querySelectorAll('ul, nav')].map((l) => ({
      tag: l.tagName.toLowerCase() + '.' + String(l.className).split(' ')[0],
      pozycji: l.querySelectorAll('a, button').length
    }))
  };
}
