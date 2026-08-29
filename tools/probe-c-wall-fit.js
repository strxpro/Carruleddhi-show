/**
 * Czy komentarze mieszczą się w swojej sekcji, czy chowają się pod następną.
 *
 * Sekcje na tej stronie to przypięte panele, które nachodzą na siebie w kolejności
 * dokumentu. Jeśli #wall ma wysokość jednego ekranu, a lista komentarzy jest dłuższa,
 * to wszystko poniżej pierwszego ekranu przykrywa #contact — czyli przewijasz
 * komentarze i wjeżdża w nie formularz. Dokładnie to zgłoszenie.
 *
 * Uruchamiać z ?demo=1, żeby lista w ogóle miała treść:
 *     node tools/cdp.mjs probe tools/probe-c-wall-fit.js --w 390 --h 844 --url "/?demo=1"
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const top = (el) => { let t = 0, n = el; while (n) { t += n.offsetTop; n = n.offsetParent; } return t; };
  const wall = document.querySelector('#wall');
  window.scrollTo(0, Math.max(0, top(wall) - 200));
  await sleep(900);

  const cs = getComputedStyle(wall);
  const container = wall.querySelector('.container');
  const list = wall.querySelector('[data-wall-list], .wall-list, .wall__list');
  const cards = wall.querySelectorAll('.wall-card, .wall-note, [data-wall-item]');

  /* Ostatni widoczny kafelek i to, czy jego dół mieści się w pudełku sekcji. */
  const last = cards[cards.length - 1];
  const wallTop = top(wall);
  const wallBottom = wallTop + wall.offsetHeight;
  const lastBottom = last ? top(last) + last.offsetHeight : null;

  return {
    wall: {
      panel: wall.dataset.panel,
      offsetHeight: wall.offsetHeight,
      scrollHeight: wall.scrollHeight,
      position: cs.position,
      overflow: cs.overflow,
      minHeight: cs.minHeight
    },
    container: container ? { position: getComputedStyle(container).position, height: container.offsetHeight } : null,
    list: list ? { cls: list.className, height: list.offsetHeight } : null,
    cardCount: cards.length,
    /* Dodatnie „poza sekcją" znaczy: tyle pikseli komentarzy leży poza pudełkiem #wall. */
    outsideSection: lastBottom === null ? null : Math.round(lastBottom - wallBottom),
    nextSectionTop: top(document.querySelector('#contact')),
    /* I najważniejsze: ile z tego jest pod następnym panelem. */
    hiddenUnderNext: lastBottom === null ? null : Math.round(lastBottom - top(document.querySelector('#contact')))
  };
};
