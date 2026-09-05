/** Czy pozycje stopki wypisuja sie raz i czy pole dotyku ma 44 px. */
async (document) => {
  await new Promise((r) => setTimeout(r, 3400));
  const linki = [...document.querySelectorAll('.site-footer .footer__links a')].slice(0, 4);
  return {
    pozycje: linki.map((a) => {
      const s = getComputedStyle(a);
      const stack = a.querySelector('.fx-roll__stack');
      const sizer = a.querySelector('.fx-roll__sizer');
      const r = a.getBoundingClientRect();
      return {
        napis: a.getAttribute('data-text-original'),
        display: s.display,
        przyciecie: s.overflow,
        wysokoscPola: Math.round(r.height),
        wysokoscStosu: stack ? Math.round(stack.getBoundingClientRect().height) : 0,
        miarkaWidoczna: sizer ? getComputedStyle(sizer).visibility : '(brak)',
        STOS_PRZYCIETY: stack ? Math.round(stack.getBoundingClientRect().height) > Math.round(r.height) : false
      };
    }),
    wysokoscStopki: Math.round(document.querySelector('.site-footer').getBoundingClientRect().height)
  };
}
