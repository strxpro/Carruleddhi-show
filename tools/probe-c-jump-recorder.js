/**
 * Czy rejestrator przeskoków w ogóle działa — i czy bez ?jump=1 go nie ma.
 *
 *     node tools/cdp.mjs probe tools/probe-c-jump-recorder.js --w 390 --h 844 --url "/?jump=1"
 *     node tools/cdp.mjs probe tools/probe-c-jump-recorder.js --w 390 --h 844 --url "/"
 *
 * Narzędzie diagnostyczne, które samo nie działa, jest gorsze niż jego brak: wygląda na
 * dowód. Więc sprawdzane jest to samo, co przy każdej innej zmianie — skutek.
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1200);

  const panel = [...document.querySelectorAll('div[role="status"]')]
    .find((el) => el.textContent.includes('rejestrator przeskoków'));
  const out = {
    flag: new URLSearchParams(location.search).has('jump'),
    panelPresent: Boolean(panel),
    /* Bez znacznika plik nie ma prawa się pobrać. */
    fetched: performance.getEntriesByType('resource').some((r) => r.name.includes('jump-recorder'))
  };
  if (!panel) return out;

  const text = () => panel.textContent;
  out.startLine = /start.*$/m.exec(text())?.[0]?.trim();

  /* ZWROT: przewinięcie w dół, potem gwałtownie w górę w tej samej chwili. */
  document.documentElement.style.scrollBehavior = 'auto';
  window.scrollTo(0, 3000);
  await sleep(120);
  window.scrollTo(0, 2400);
  await sleep(400);
  out.sawReversal = /ZWROT/.test(text());

  /* FOKUS: sprawdzany jest CZUJNIK, nie strona.
     Zwykłe `focus()` na polu poza kadrem nie przewinęło tu strony ani o piksel — Chrome
     przewinął zamiast tego kontener z `overflow: hidden`, w którym pole siedzi. Czyli
     objawu nie ma czym wywołać, a czujnik bez próby to czujnik nieznanego stanu. Więc
     przewinięcie jest tu robione ręcznie, w oknie, w którym czujnik patrzy: jeśli wiersz
     FOKUS się pojawi, wiadomo, że na telefonie też się pojawi. */
  window.scrollTo(0, 0);
  await sleep(300);
  const far = [...document.querySelectorAll('input:not([type=hidden]), textarea')]
    .find((el) => el.getClientRects().length > 0);
  out.focusTarget = far ? (far.id || far.name || far.tagName.toLowerCase()) : '(nie znalazłem pola)';
  far?.focus({ preventScroll: true });
  window.scrollTo(0, 300);
  await sleep(600);
  out.sawFocus = /FOKUS/.test(text());

  /* DOK: dokument rośnie pod stroną. Kartka na 2000 px dopięta na końcu to dokładnie to,
     co robi doładowany komentarz albo nowa wiadomość w czacie — tyle że na żądanie. */
  const filler = document.createElement('div');
  filler.style.cssText = 'height:2000px';
  document.body.appendChild(filler);
  window.scrollTo(0, 320);
  await sleep(400);
  out.sawDocumentGrowth = /DOK/.test(text());
  filler.remove();
  window.scrollTo(0, 300);
  await sleep(400);
  out.sawDocumentShrink = (text().match(/DOK/g) || []).length >= 2;

  out.rows = text().split('\n').filter((line) => /\d+\.\ds/.test(line)).length;
  out.tail = text().split('\n').slice(-4);
  return out;
};
