/** Ktory przodek robi z siebie blok zawierajacy dla position:fixed. */
async (document, window) => {
  await new Promise((r) => setTimeout(r, 3000));
  const dock = document.querySelector('[data-quick-actions]');
  const chain = [];
  let el = dock.parentElement;
  while (el && el !== document.documentElement) {
    const s = getComputedStyle(el);
    const winowajca = s.transform !== 'none' || s.filter !== 'none' || s.backdropFilter !== 'none'
      || s.perspective !== 'none' || s.willChange.includes('transform') || s.contain.includes('paint')
      || s.containerType !== 'normal';
    chain.push({
      tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').slice(0, 2).join('.') : ''),
      transform: s.transform === 'none' ? '-' : s.transform.slice(0, 30),
      filter: s.filter === 'none' ? '-' : s.filter.slice(0, 20),
      willChange: s.willChange,
      contain: s.contain,
      containerType: s.containerType,
      WINOWAJCA: winowajca
    });
    el = el.parentElement;
  }
  return { rodzicow: chain.length, chain };
}
