/** Dzwiek i liczby na transmisji. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3200);
  const section = document.querySelector('[data-stream-section]');
  if (!section || section.hasAttribute('hidden')) return { blad: 'transmisja nie trwa' };
  document.querySelector('[data-stream-stage]')?.scrollIntoView({ block: 'center', behavior: 'instant' });
  await sleep(2000);

  const stats = document.querySelector('[data-stream-stats]');
  const guzik = document.querySelector('[data-stream-sound]');
  const frame = document.querySelector('[data-stream-frame]');
  const widoczny = (el) => Boolean(el) && el.getClientRects().length > 0 && getComputedStyle(el).opacity !== '0';

  const przedKlikiem = {
    liczbyWidoczne: widoczny(stats),
    widzowie: document.querySelector('[data-stream-viewers]')?.textContent.trim(),
    oklaski: document.querySelector('[data-stream-count]')?.textContent.trim(),
    napisGuzika: guzik?.querySelector('[data-stream-sound-label]')?.textContent.trim(),
    wcisniety: guzik?.getAttribute('aria-pressed'),
    srcMaJsapi: (frame?.getAttribute('src') || '').includes('enablejsapi=1'),
    srcMaMute: (frame?.getAttribute('src') || '').includes('mute=1')
  };

  guzik?.click();
  await sleep(600);

  return {
    przedKlikiem,
    poKliknieciu: {
      napisGuzika: guzik?.querySelector('[data-stream-sound-label]')?.textContent.trim(),
      wcisniety: guzik?.getAttribute('aria-pressed'),
      ikonaGlosnaWidoczna: !guzik?.querySelector('[data-sound-on]')?.hasAttribute('hidden')
    }
  };
}
