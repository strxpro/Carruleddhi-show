/**
 * Przeskakiwanie na telefonie — pomiar, nie zgadywanie.
 *
 * Przewija po malym kroku przez komentarze i kontakt/czat i po kazdym kroku
 * porownuje pozycje ZADANA z pozycja RZECZYWISTA. Zapisuje przy tym wysokosc
 * dokumentu, wysokosc obu sekcji i ich tryb (`data-panel`), zeby od razu bylo
 * widac, czy stronę przewinelo cos, czy tylko urosla nad kursorem.
 *
 *     node tools/cdp.mjs probe tools/probe-c-jump.js --w 390 --h 844
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';

  const top = (el) => { let t = 0, n = el; while (n) { t += n.offsetTop; n = n.offsetParent; } return t; };
  const wall = document.querySelector('#wall');
  const contact = document.querySelector('#contact');

  const out = {
    viewport: window.innerHeight,
    snap: getComputedStyle(document.documentElement).scrollSnapType,
    anchor: getComputedStyle(document.documentElement).overflowAnchor,
    sections: {},
    jumps: []
  };
  for (const [name, el] of [['wall', wall], ['contact', contact]]) {
    out.sections[name] = { top: top(el), height: el.offsetHeight, panel: el.getAttribute('data-panel') };
  }

  /* Od kawalka przed komentarzami do konca kontaktu, krokiem 60 px. */
  const from = Math.max(0, top(wall) - window.innerHeight);
  const to = top(contact) + contact.offsetHeight;
  let previousHeight = document.documentElement.scrollHeight;

  for (let want = from; want <= to; want += 60) {
    window.scrollTo(0, want);
    await sleep(130);
    const got = Math.round(window.scrollY);
    const height = document.documentElement.scrollHeight;
    /* Roznica 1 px to zaokraglenie, nie przeskok. Konca dokumentu nie liczymy —
       tam przegladarka ma prawo nie dojechac. */
    const atEnd = want > height - window.innerHeight - 2;
    if (!atEnd && Math.abs(got - want) > 2) {
      out.jumps.push({
        want,
        got,
        drift: got - want,
        heightBefore: previousHeight,
        heightAfter: height,
        wallH: wall.offsetHeight,
        contactH: contact.offsetHeight,
        wallPanel: wall.getAttribute('data-panel'),
        contactPanel: contact.getAttribute('data-panel')
      });
    }
    previousHeight = height;
  }
  out.steps = Math.round((to - from) / 60) + 1;
  out.heightEnd = document.documentElement.scrollHeight;
  return out;
};
