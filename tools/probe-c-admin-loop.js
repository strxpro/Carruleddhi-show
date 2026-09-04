/**
 * Gdzie jest petla renderowania w panelu: przy wczytaniu, po wejsciu w zakladke,
 * czy dopiero po zapisie. Liczy ostrzezenia Reacta w trzech chwilach.
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hits = [];
  const realError = console.error.bind(console);
  console.error = (...args) => {
    const text = args.map((a) => (typeof a === 'string' ? a : (a && a.message) || '')).join(' ');
    if (/Maximum update depth/i.test(text)) hits.push(text.slice(0, 400));
    realError(...args);
  };
  const count = () => hits.length;

  await sleep(2600);
  const poWczytaniu = count();

  const tab = [...document.querySelectorAll('button, a')].find((b) => /transmisj|stream|diretta/i.test(b.textContent || ''));
  tab?.click();
  await sleep(2000);
  const poZakladce = count();

  const setValue = (el, value) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const link = document.querySelector('input');
  if (link) setValue(link, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await sleep(500);
  const poWpisaniu = count();

  [...document.querySelectorAll('button')].find((b) => /zapisz|salva/i.test(b.textContent || '') && !b.disabled)?.click();
  await sleep(2500);

  return {
    poWczytaniu,
    poZakladce,
    poWpisaniu,
    poZapisie: count(),
    pierwszy: hits[0] || '(brak)',
    /* Slad komponentow, jesli React go dolozyl — po nim widac, ktory to plik. */
    slad: (hits.find((h) => /at \w/.test(h)) || '').slice(0, 300)
  };
}
