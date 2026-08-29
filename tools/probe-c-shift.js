/**
 * Co przesuwa się pod palcem — pomiar przez PerformanceObserver('layout-shift').
 *
 * „Przeskakuje" ma dwie możliwe przyczyny i trzeba je rozróżnić, bo naprawia się je
 * inaczej:
 *   1. przewinięcie skacze — pozycja się zmienia, treść stoi;
 *   2. treść skacze — pozycja stoi, a to, co pod nią, przesuwa się w dół albo w górę.
 *
 * Sonda przez scrollTo nie znalazła (1). Ta szuka (2): zapisuje każde przesunięcie
 * układu razem z elementami, które je spowodowały, więc od razu widać, czy to obrazki
 * w komentarzach, wiadomości czatu, czy coś jeszcze.
 *
 *     node tools/cdp.mjs probe tools/probe-c-shift.js --w 390 --h 844
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const shifts = [];
  const name = (node) => {
    if (!node || !node.tagName) return '?';
    const tag = node.tagName.toLowerCase();
    const cls = typeof node.className === 'string' && node.className ? '.' + node.className.trim().split(/\s+/)[0] : '';
    const section = node.closest?.('section[id]')?.id || '';
    return `${tag}${cls}${section ? ' @' + section : ''}`;
  };
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      shifts.push({
        at: Math.round(entry.startTime),
        value: +entry.value.toFixed(4),
        y: Math.round(window.scrollY),
        sources: (entry.sources || []).slice(0, 3).map((s) => ({
          el: name(s.node),
          from: `${Math.round(s.previousRect.y)}`,
          to: `${Math.round(s.currentRect.y)}`,
          moved: Math.round(s.currentRect.y - s.previousRect.y)
        }))
      });
    }
  });
  observer.observe({ type: 'layout-shift', buffered: true });

  /* Wolne przewijanie przez całą stronę, po 120 px, żeby leniwe obrazki i dociągane
     komentarze zdążyły dojść w trakcie — dokładnie tak, jak dochodzą pod palcem. */
  const max = document.documentElement.scrollHeight - window.innerHeight;
  for (let y = 0; y <= max; y += 120) {
    window.scrollTo(0, y);
    await sleep(90);
  }
  await sleep(1200);
  observer.disconnect();

  const total = shifts.reduce((sum, s) => sum + s.value, 0);
  return {
    documentHeight: document.documentElement.scrollHeight,
    shiftCount: shifts.length,
    cls: +total.toFixed(4),
    worst: shifts.sort((a, b) => b.value - a.value).slice(0, 12)
  };
};
