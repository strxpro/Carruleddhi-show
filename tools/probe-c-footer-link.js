/** Wnetrze jednego odsylacza w stopce. */
async (document) => {
  await new Promise((r) => setTimeout(r, 3400));
  const a = document.querySelector('.site-footer .footer__links a');
  if (!a) return { blad: 'brak odsylacza' };
  const opisz = (el, glebokosc) => ({
    tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').join('.') : ''),
    tekst: el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el.textContent.trim() : '',
    display: getComputedStyle(el).display,
    pozycja: getComputedStyle(el).position,
    przezroczystosc: getComputedStyle(el).opacity,
    prostokat: (() => { const r = el.getBoundingClientRect(); return Math.round(r.top) + '/' + Math.round(r.height); })(),
    dzieci: glebokosc > 0 ? [...el.children].map((c) => opisz(c, glebokosc - 1)) : []
  });
  return {
    html: a.outerHTML.slice(0, 400),
    drzewo: opisz(a, 2),
    ileOdsylaczy: document.querySelectorAll('.site-footer .footer__links a').length
  };
}
