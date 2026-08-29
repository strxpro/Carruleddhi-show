/**
 * TOR C / C4 — czy licznik pokazuje liczbe, ktora przyszla z serwera, i czy
 * kolko w zwinietym doku jest kolem.
 *
 *     node tools/cdp.mjs probe tools/probe-c-counts.js --w 390 --h 844 \
 *       --inject tools/inject-counts.js
 *
 * inject-counts.js odpowiada na /api/carruleddhi/counts: attendees 1234, pilots 57.
 * Jesli na ekranie jest cokolwiek innego, licznik nie pokazuje prawdziwej liczby.
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const out = {};
  document.querySelector('#attendance')?.scrollIntoView({ block: 'center' });
  await sleep(1200);

  out.counts = {
    attendanceSection: document.querySelector('.attendance__counter')?.textContent.trim(),
    heroAttendees: document.querySelector('.hero-stat__number[data-attendee-count]')?.textContent.trim(),
    heroPilots: document.querySelector('.hero-stat__number[data-pilots-count]')?.textContent.trim(),
    avatars: [...document.querySelectorAll('.avatar')].map((a) => (a.hidden ? '(ukryty)' : a.textContent.trim()))
  };

  /* Zwiniety dok: klasa jest dodawana przez app.js po chwili czytania, wiec zamiast
     czekac na nia w ciemno, wymuszam ja i mierze ksztalt. */
  const dock = document.querySelector('.quick-actions');
  const measure = (label) => {
    const r = document.querySelector('.quick-action--attend').getBoundingClientRect();
    return { label, w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(3), radius: getComputedStyle(document.querySelector('.quick-action--attend')).borderTopLeftRadius };
  };
  out.dockExpanded = measure('dok rozwiniety');
  dock.classList.add('is-mini');
  await sleep(600);
  out.dockMini = measure('dok zwiniety');

  return out;
};
