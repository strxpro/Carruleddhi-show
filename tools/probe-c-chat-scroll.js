/** Czy dziennik czatu zostaje przy ostatniej wiadomosci, gdy pole rosnie. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2600);
  const otworz = document.querySelector('[data-chat-open], [data-chat-toggle], .chat__launcher');
  otworz?.click();
  await sleep(1400);
  const panel = document.querySelector('.chat, [data-chat-panel]');
  const log = panel?.querySelector('[data-chat-log]');
  const input = panel?.querySelector('[data-chat-input]');
  if (!log || !input) return { blad: 'nie znalazlem dziennika albo pola', panel: Boolean(panel) };

  /* Dosypuje wierszy, zeby dziennik mial co przewijac. */
  for (let i = 0; i < 14; i += 1) {
    const p = document.createElement('div');
    p.className = 'chat__row';
    p.textContent = 'Wiersz probny numer ' + (i + 1);
    log.appendChild(p);
  }
  log.scrollTop = log.scrollHeight;
  await sleep(300);
  const odlegloscPrzed = Math.round(log.scrollHeight - log.scrollTop - log.clientHeight);
  const wysokoscPolaPrzed = Math.round(input.getBoundingClientRect().height);

  /* Pisanie: wieloliniowy tekst, ktory realnie powieksza pole. */
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(input, 'Pierwsza linia tekstu\nDruga linia tekstu\nTrzecia linia tekstu\nCzwarta linia tekstu');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(700);

  return {
    odlegloscOdDoluPrzed: odlegloscPrzed,
    odlegloscOdDoluPo: Math.round(log.scrollHeight - log.scrollTop - log.clientHeight),
    wysokoscPolaPrzed,
    wysokoscPolaPo: Math.round(input.getBoundingClientRect().height),
    poleUroslo: Math.round(input.getBoundingClientRect().height) > wysokoscPolaPrzed,
    ZOSTAL_NA_DOLE: Math.round(log.scrollHeight - log.scrollTop - log.clientHeight) < 8
  };
}
