/** Sekcja transmisji: poswiata, autostart przy przewinieciu, dwa liczniki, pasek. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(3000);
  const section = document.querySelector('[data-stream-section]');
  if (!section || section.hasAttribute('hidden')) return { blad: 'sekcja ukryta — transmisja nie trwa' };
  const stage = document.querySelector('[data-stream-stage]');
  const frame = document.querySelector('[data-stream-frame]');
  const glow = document.querySelector('.live__glow');

  const przedPrzewinieciem = {
    srcRamki: frame?.getAttribute('src') || '(pusty — dobrze, jeszcze nie przewinieto)',
    scenaGra: stage?.classList.contains('is-playing') || false
  };

  stage?.scrollIntoView({ block: 'center', behavior: 'instant' });
  await sleep(2200);

  const g = glow ? getComputedStyle(glow) : null;
  return {
    przedPrzewinieciem,
    poPrzewinieciu: {
      srcRamki: (frame?.getAttribute('src') || '').slice(0, 78),
      maWyciszenie: (frame?.getAttribute('src') || '').includes('mute=1'),
      scenaGra: stage?.classList.contains('is-playing') || false
    },
    poswiata: g ? { jest: true, przezroczystosc: g.opacity, animacja: g.animationName, rozmycie: g.filter.slice(0, 20) } : { jest: false },
    liczniki: {
      widzowie: document.querySelector('[data-stream-viewers]')?.textContent.trim() ?? '(brak)',
      oklaski: document.querySelector('[data-stream-count]')?.textContent.trim() ?? '(brak)'
    },
    naglowek: {
      ogladajWidoczny: !document.querySelector('.nav-live')?.hasAttribute('hidden'),
      bedeTamWidoczny: (() => {
        const el = document.querySelector('.site-header .nav-attend');
        return el ? getComputedStyle(el).display !== 'none' : false;
      })()
    }
  };
}
