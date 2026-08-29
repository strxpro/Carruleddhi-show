/**
 * TOR C / C3 — plynnosc zoomu: dlugosc klatek podczas przewijania przez sekcje trasy.
 *
 * Przewija po 18px na klatke przez okno, w ktorym zmienia sie --route-progress,
 * i zapisuje odstepy miedzy klatkami. Mierzy tez, o ile skacze sama wartosc
 * progresu miedzy klatkami — duze skoki widac jako szarpanie niezaleznie od FPS.
 *
 *     node tools/cdp.mjs probe tools/probe-c-route-smooth.js --w 1440 --h 900
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const section = document.querySelector('#route');
  const frame = document.querySelector('[data-route-frame]');
  const documentTop = (el) => { let t = 0, n = el; while (n) { t += n.offsetTop; n = n.offsetParent; } return t; };
  const top = documentTop(section);
  const viewport = window.innerHeight;

  const startY = Math.max(0, top - viewport * 1.15);
  window.scrollTo(0, startY);
  await sleep(700);

  const gaps = [];
  const scales = [];
  await new Promise((done) => {
    let last = performance.now();
    let y = startY;
    let n = 0;
    const step = (now) => {
      gaps.push(+(now - last).toFixed(1));
      last = now;
      /* Odczyt stylu tylko co dziesiata klatke: getComputedStyle wymusza
         przeliczenie stylu i ukladu, wiec czytanie go w kazdej klatce mierzyloby
         wlasna sonde, nie strone. */
      if (n % 10 === 0) {
        const m = getComputedStyle(frame).transform.match(/matrix\(([-\d.]+)/);
        scales.push(m ? +(+m[1]).toFixed(4) : 0);
      }
      y += 18;
      n += 1;
      window.scrollTo(0, y);
      if (n < 110) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });

  const body = gaps.slice(4).sort((a, b) => a - b);
  const jumps = [];
  for (let i = 1; i < scales.length; i += 1) jumps.push(Math.abs(scales[i] - scales[i - 1]));
  const movingJumps = jumps.filter((j) => j > 0).sort((a, b) => a - b);

  return {
    frameMs: {
      samples: body.length,
      median: body[Math.floor(body.length / 2)],
      p90: body[Math.floor(body.length * 0.9)],
      worst: body[body.length - 1],
      over32ms: body.filter((f) => f > 32).length
    },
    scaleStep: {
      framesThatMoved: movingJumps.length,
      median: movingJumps.length ? +movingJumps[Math.floor(movingJumps.length / 2)].toFixed(5) : 0,
      worst: movingJumps.length ? +movingJumps[movingJumps.length - 1].toFixed(5) : 0
    },
    scaleFirst: scales[0],
    scaleLast: scales[scales.length - 1]
  };
};
