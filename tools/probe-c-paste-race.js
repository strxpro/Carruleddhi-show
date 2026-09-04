/** Czy wklejony adres przezyje pozna odpowiedz serwera z wejscia w zakladke. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(900);
  /* Wejscie w zakladke Transmisja. */
  const tab = [...document.querySelectorAll('button, a')].find((el) => /transmisj/i.test(el.textContent || ''));
  tab?.click();
  await sleep(600);

  const pole = [...document.querySelectorAll('input')].find((el) => /youtube|identyfikator/i.test(el.placeholder || ''));
  if (!pole) return { blad: 'nie znalazlem pola adresu' };

  /* Wklejenie — tak jak robi to czlowiek, przez zdarzenie input Reacta. */
  const ADRES = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(pole, ADRES);
  pole.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(120);
  const tuzPoWklejeniu = pole.value;

  /* Czekamy, az wroci opozniona odpowiedz z wejscia w zakladke (2,5 s). */
  await sleep(3200);
  const poOdpowiedziSerwera = pole.value;

  const zapisz = [...document.querySelectorAll('button')].find((el) => /zapisz źródło|zapisz zrodlo/i.test(el.textContent || ''));
  return {
    tuzPoWklejeniu,
    poOdpowiedziSerwera,
    adresPrzezyl: poOdpowiedziSerwera === ADRES,
    przyciskZapiszAktywny: zapisz ? !zapisz.disabled : '(brak przycisku)',
    zadania: window.__zadania
  };
}
