/**
 * Czy strona rośnie sama, kiedy się na niej stoi.
 *
 * Czat odpytuje serwer co kilka sekund, a komentarze dociągają się po wczytaniu.
 * Sekcja #contact jest jednoekranowa i puszczona w przewijanie, więc każda nowa
 * wiadomość zmienia jej wysokość — a `overflow-anchor` jest wszędzie wyłączony, więc
 * przeglądarka NIE skoryguje pozycji. Efekt: stoisz na czacie i treść jedzie pod palcem.
 *
 * Sonda stoi w miejscu i tylko patrzy: wysokość dokumentu, wysokość obu sekcji
 * i pozycja przewinięcia, co pół sekundy przez 20 sekund.
 *
 *     node tools/cdp.mjs probe tools/probe-c-idle-growth.js --w 390 --h 844 --wait 3000
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const top = (el) => { let t = 0, n = el; while (n) { t += n.offsetTop; n = n.offsetParent; } return t; };
  const contact = document.querySelector('#contact');
  const wall = document.querySelector('#wall');
  window.scrollTo(0, Math.max(0, top(contact) - 60));
  await sleep(900);

  const start = {
    y: Math.round(window.scrollY),
    doc: document.documentElement.scrollHeight,
    contactH: contact.offsetHeight,
    wallH: wall.offsetHeight,
    contactTop: top(contact)
  };

  const samples = [];
  for (let i = 0; i < 40; i += 1) {
    await sleep(500);
    const now = {
      t: (i + 1) * 0.5,
      y: Math.round(window.scrollY),
      doc: document.documentElement.scrollHeight,
      contactH: contact.offsetHeight,
      wallH: wall.offsetHeight,
      contactTop: top(contact)
    };
    if (now.doc !== start.doc || now.contactH !== start.contactH
      || now.wallH !== start.wallH || now.contactTop !== start.contactTop || now.y !== start.y) {
      samples.push(now);
    }
  }
  return {
    start,
    /* Puste `changes` znaczy: przez dwadzieścia sekund stania w miejscu nic nie drgnęło. */
    changeCount: samples.length,
    changes: samples.slice(0, 12)
  };
};
