/**
 * TOR C / C1 — sponsorzy pod sekcja story, zaproszenie i przycisk otwierajacy czat.
 *
 *     node tools/cdp.mjs probe tools/probe-c-sponsors.js --w 1440 --h 900 --url "/?demo=1"
 *
 * Sprawdza SKUTEK, nie obecnosc znacznika: w ktorej sekcji siedzi pas, ktory jezyk
 * zaproszenia jest naprawde widoczny, i czy po nacisnieciu przycisku w polu czatu
 * lezy pytanie.
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const out = {};
  const band = document.querySelector('[data-sponsor-band]');
  out.band = {
    count: document.querySelectorAll('[data-sponsor-band]').length,
    section: band?.closest('section')?.id,
    hidden: band?.hasAttribute('hidden'),
    logos: document.querySelectorAll('.sponsor-logo').length,
    classes: band?.className
  };

  const pitch = document.querySelector('.sponsor-pitch');
  pitch?.scrollIntoView({ block: 'center' });
  await sleep(500);
  const visibleText = () => [...document.querySelectorAll('.sponsor-pitch [lang]')]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => `${el.lang}: ${el.textContent.trim()}`);

  out.pitch = {
    section: pitch?.closest('section')?.id,
    onScreen: pitch ? pitch.getBoundingClientRect().height > 0 : false,
    htmlLang: document.documentElement.lang,
    visible: visibleText()
  };

  /* Ten sam blok po przelaczeniu jezyka — jedna wersja ma zniknac, druga pojawic. */
  document.querySelector('[data-language-menu] [data-language-option="pl"]')?.click();
  await sleep(1200);
  out.pitchAfterPl = { htmlLang: document.documentElement.lang, visible: visibleText() };

  /* Przycisk: klik, potem zawartosc pola czatu. */
  document.querySelector('[data-sponsor-ask]')?.click();
  await sleep(1600);
  const input = document.querySelector('[data-chat-input]');
  out.chat = {
    hash: window.location.hash,
    inputValue: input?.value,
    inputVisible: input ? input.getClientRects().length > 0 : false,
    gateVisible: (document.querySelector('[data-chat-gate]')?.getClientRects().length || 0) > 0,
    focused: document.activeElement?.id || document.activeElement?.tagName
  };
  return out;
};
