/** Czy obie sciany pod nazwa stoja w tym samym miejscu (bez tego obrot wyglada krzywo). */
async (document) => {
  await new Promise((r) => setTimeout(r, 3000));
  const flip = document.querySelector('[data-brand-flip]');
  const data = flip.querySelector('[data-header-date]');
  const zegar = flip.querySelector('.brand__face--clock');
  const f = flip.getBoundingClientRect();
  const d = data.getBoundingClientRect();
  const cs = getComputedStyle(data);
  return {
    pudelko: { g: Math.round(f.top), wys: Math.round(f.height) },
    data: { g: Math.round(d.top), wys: Math.round(d.height), marginesGory: cs.marginTop, rozmiar: cs.fontSize },
    zegarRozmiar: getComputedStyle(zegar).fontSize,
    przesuniecieDaty: Math.round(d.top - f.top),
    ROWNO: Math.abs(Math.round(d.top - f.top)) <= 1
  };
}
