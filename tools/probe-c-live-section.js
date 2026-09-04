/** Czy przy trwajacej transmisji sekcja i przyciski wychodza z ukrycia. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3500);
  const section = document.querySelector('[data-stream-section]');
  const frame = document.querySelector('[data-stream-frame]');
  const ctas = [...document.querySelectorAll('[data-stream-cta]')];
  const widoczny = (el) => Boolean(el) && !el.hasAttribute('hidden') && el.getClientRects().length > 0;
  section?.scrollIntoView({ block: 'center' });
  await sleep(900);
  return {
    sekcjaUkryta: section ? section.hasAttribute('hidden') : '(brak sekcji)',
    sekcjaWidoczna: widoczny(section),
    ramkaSrc: frame?.getAttribute('src') || '(pusty)',
    nazwa: document.querySelector('[data-stream-name]')?.textContent.trim(),
    przyciskow: ctas.length,
    przyciskiWidoczne: ctas.filter(widoczny).length,
    serca: document.querySelector('[data-stream-hearts]')?.textContent.trim() || '(brak licznika)'
  };
}
