/** Ktory element paska wychodzi poza ekran przy trwajacej transmisji. */
async (document, window) => {
  await new Promise((r) => setTimeout(r, 3600));
  const header = document.querySelector('.site-header');
  const inner = header.querySelector(':scope > *') || header;
  const dzieci = [...header.querySelectorAll('.nav-current, .language-picker, .nav-attend, .nav-live, .nav-vote, .nav-toggle, [class*=brand], [class*=burger], [class*=toggle]')]
    .filter((el) => el.getClientRects().length > 0);
  return {
    ekran: window.innerWidth,
    pasek: (() => { const r = header.getBoundingClientRect(); return { l: Math.round(r.left), p: Math.round(r.right), szer: Math.round(r.width) }; })(),
    elementy: dzieci.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        klasa: el.className.split(' ').slice(0, 2).join('.'),
        l: Math.round(r.left), p: Math.round(r.right), szer: Math.round(r.width),
        POZA: Math.round(r.right) > window.innerWidth + 1
      };
    })
  };
}
