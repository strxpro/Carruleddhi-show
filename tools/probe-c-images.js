/**
 * Czy wszystkie zdjecia strony glownej sie wczytuja i ile wazy talia nagrod.
 *   node tools/cdp.mjs probe tools/probe-c-images.js --w 390 --h 844
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';
  const max = document.documentElement.scrollHeight - window.innerHeight;
  for (let i = 0; i <= 16; i += 1) { window.scrollTo(0, (max / 16) * i); await sleep(260); }
  await sleep(2500);

  const imgs = [...document.querySelectorAll('img')];
  const bad = imgs.filter((i) => i.currentSrc && (!i.complete || i.naturalWidth === 0))
    .map((i) => i.currentSrc.split('/').pop());
  const nieproszone = imgs.filter((i) => !i.currentSrc).length;

  const zasoby = performance.getEntriesByType('resource')
    .filter((r) => /\.(png|jpe?g|webp|svg)(\?|$)/i.test(r.name));
  const suma = zasoby.reduce((s, r) => s + (r.encodedBodySize || 0), 0);
  const nagrody = zasoby.filter((r) => /prize-\d\d\./.test(r.name));
  return {
    obrazkow: imgs.length,
    niewczytane: bad,
    bezZrodla: nieproszone,
    pobranychPlikow: zasoby.length,
    razemKB: Math.round(suma / 1024),
    nagrodyPlikow: nagrody.length,
    nagrodyKB: Math.round(nagrody.reduce((s, r) => s + (r.encodedBodySize || 0), 0) / 1024),
    najciezsze: zasoby.sort((a, b) => b.encodedBodySize - a.encodedBodySize).slice(0, 5)
      .map((r) => `${r.name.split('/').pop()} ${Math.round(r.encodedBodySize / 1024)} kB`)
  };
}
