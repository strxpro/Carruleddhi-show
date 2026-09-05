/** Gdzie naprawde jest dok i co go chowa. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3000);
  window.scrollTo({ top: 1600, behavior: 'instant' });
  await sleep(1400);
  const dock = document.querySelector('[data-quick-actions]');
  if (!dock) return { blad: 'brak doku w dokumencie' };
  const r = dock.getBoundingClientRect();
  const s = getComputedStyle(dock);
  return {
    ekran: { w: window.innerWidth, h: window.innerHeight },
    prostokat: { l: Math.round(r.left), g: Math.round(r.top), p: Math.round(r.right), d: Math.round(r.bottom), szer: Math.round(r.width) },
    css: { position: s.position, display: s.display, left: s.left, right: s.right, bottom: s.bottom, opacity: s.opacity, visibility: s.visibility, transform: s.transform.slice(0, 30) },
    klasy: dock.className,
    klasyBody: document.body.className,
    przyciski: [...dock.querySelectorAll('.quick-action')].map((el) => ({
      klasa: el.className.split(' ').slice(0, 2).join('.'),
      ukryty: el.hasAttribute('hidden'),
      widoczny: el.getClientRects().length > 0,
      napis: el.textContent.trim().slice(0, 14)
    }))
  };
}
