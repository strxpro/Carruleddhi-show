/**
 * Pola ponizej 16 px — kazde z nich powieksza strone na iOS przy dotknieciu.
 *
 * iOS Safari skaluje CALA strone, gdy ognisko klawiatury trafia w pole o wyliczonym
 * `font-size` mniejszym niz 16 px. Powiekszenie zmienia widoczny obszar, wiec strona
 * natychmiast po nim wyglada na przeskoczona w losowe miejsce — to jest zglaszane jako
 * „pisze na czacie i przerzuca mnie do komentarzy".
 *
 * Wersja na cdp.mjs, zeby dalo sie mierzyc serwer deweloperski bez budowania paczki.
 *
 *     node tools/cdp.mjs probe tools/probe-c-fields.js --w 390 --h 844
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  /* Przelot przez strone: sekcje odslaniane przez IntersectionObserver nie maja
     wyliczonego stylu, dopoki nie zostana pokazane. */
  const max = document.documentElement.scrollHeight - window.innerHeight;
  for (let i = 0; i <= 12; i += 1) { window.scrollTo(0, (max / 12) * i); await sleep(140); }
  window.scrollTo(0, 0);
  await sleep(300);

  const where = (el) => {
    const owner = el.closest('section[id], dialog, .modal, nav, header');
    return owner ? (owner.id || owner.className.split(' ')[0] || owner.tagName.toLowerCase()) : '?';
  };
  const skip = ['hidden', 'checkbox', 'radio', 'range', 'file', 'submit', 'button'];
  const fields = [...document.querySelectorAll('input, textarea, select')]
    .filter((el) => !skip.includes(el.type));

  const small = [];
  for (const el of fields) {
    const size = Number.parseFloat(getComputedStyle(el).fontSize);
    if (Number.isFinite(size) && size < 16) {
      small.push({
        size: Math.round(size * 10) / 10,
        tag: el.tagName.toLowerCase(),
        id: el.id || el.name || el.getAttribute('data-chat-input') !== null ? (el.id || el.name || 'data-chat-input') : '',
        section: where(el)
      });
    }
  }
  return { total: fields.length, smallCount: small.length, small };
};
