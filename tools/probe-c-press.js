/**
 * TOR C / C4 — czy przycisk "Ci saro" zostaje kolem we wszystkich jezykach.
 *
 *     node tools/cdp.mjs probe tools/probe-c-press.js --w 1440 --h 900
 *     node tools/cdp.mjs probe tools/probe-c-press.js --w 390  --h 844
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { width: window.innerWidth, height: window.innerHeight, langs: [] };

  document.documentElement.style.scrollBehavior = 'auto';
  const press = document.querySelector('.attendance__press');
  press.scrollIntoView({ block: 'center' });
  await sleep(500);

  for (const lang of ['it', 'pl', 'en', 'de', 'es', 'fr']) {
    document.querySelector(`[data-language-option="${lang}"]`)?.click();
    await sleep(700);
    const r = press.getBoundingClientRect();
    const label = press.querySelector('span');
    const lr = label.getBoundingClientRect();
    out.langs.push({
      lang,
      text: label.textContent.trim(),
      w: Math.round(r.width),
      h: Math.round(r.height),
      ratio: +(r.width / r.height).toFixed(3),
      labelW: Math.round(lr.width),
      labelH: Math.round(lr.height),
      overflowsSide: Math.round(lr.width) > Math.round(r.width) - 2 * parseFloat(getComputedStyle(press).borderTopWidth)
    });
  }
  return out;
};
