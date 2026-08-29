/**
 * TOR C / C2 — czy wybor jezyka w rozwinietym menu naprawde zmienia jezyk.
 *
 * Nie sprawdza, czy przycisk istnieje — sprawdza SKUTEK: tekst na stronie, atrybut
 * lang, zapis w localStorage i to, czy flaga w pasku poszla za nim.
 *
 *     node tools/cdp.mjs probe tools/probe-c-menu-lang.js --w 1440 --h 900
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { steps: [] };

  document.querySelector('[data-menu-toggle]').click();
  await sleep(900);

  const row = document.querySelector('[data-menu-langs]');
  out.buttons = row ? [...row.querySelectorAll('[data-menu-language]')].map((b) => b.dataset.menuLanguage) : [];
  out.menuVisible = row ? row.getBoundingClientRect().width > 0 && getComputedStyle(row).visibility === 'visible' : false;

  const snapshot = (label) => ({
    label,
    htmlLang: document.documentElement.lang,
    heroTagline: document.querySelector('.hero__tagline')?.textContent.trim().slice(0, 40),
    navRace: document.querySelector('[data-section-link="story"] span:nth-child(2)')?.textContent.trim(),
    barCode: document.querySelector('[data-language-code]')?.textContent.trim(),
    stored: window.localStorage.getItem('carruleddhi.lang'),
    pressed: row ? [...row.querySelectorAll('[data-menu-language]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.menuLanguage) : []
  });

  out.steps.push(snapshot('przed'));

  row?.querySelector('[data-menu-language="pl"]')?.click();
  await sleep(1400);
  out.steps.push(snapshot('po klikniecu PL'));

  row?.querySelector('[data-menu-language="de"]')?.click();
  await sleep(1400);
  out.steps.push(snapshot('po klikniecu DE'));

  return out;
};
