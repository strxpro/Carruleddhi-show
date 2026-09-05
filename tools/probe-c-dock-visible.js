/** Czy dok pokazuje sie tam, gdzie nie ma wlasnych przyciskow, i chowa tam, gdzie sa. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3200);
  const dock = document.querySelector('[data-quick-actions]');
  const widoczny = () => {
    const s = getComputedStyle(dock);
    return { opacity: s.opacity, visibility: s.visibility, klasy: dock.className.replace('quick-actions', '').trim() || '(czysto)' };
  };
  const wyniki = {};
  wyniki.naGorze = widoczny();

  /* Hero ma wlasne „zapisz sie" i „bede tam" — dok ma tam byc schowany. */
  for (const [nazwa, y] of [['srodek', 3200], ['nizej', 6000], ['dol', 11000]]) {
    window.scrollTo({ top: y, behavior: 'instant' });
    await sleep(1100);
    wyniki[nazwa] = widoczny();
  }

  const ikona = document.querySelector('.quick-action__icon');
  const svg = ikona?.querySelector('svg');
  return {
    ...wyniki,
    ikona: ikona ? {
      kolko: Math.round(ikona.getBoundingClientRect().width),
      rysunek: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
      stosunek: svg ? Math.round((svg.getBoundingClientRect().width / ikona.getBoundingClientRect().width) * 100) + '%' : '-'
    } : '(brak)',
    dockLift: getComputedStyle(document.documentElement).getPropertyValue('--dock-lift').trim() || '(nieustawione)'
  };
}
