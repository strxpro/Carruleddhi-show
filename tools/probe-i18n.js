async (doc, win) => {
  doc.documentElement.style.scrollBehavior = 'auto';
  doc.documentElement.style.scrollSnapType = 'none';
  const dict = win.CARRULEDDHI_I18N;
  const out = { perLocale: {} };

  /* Flags must be inline SVG, not emoji: Windows has no colour flag glyphs and
     renders U+1F1F5 U+1F1F1 as the letters "PL", which is where "PL PL" came from. */
  const trigger = doc.querySelector('[data-language-flag]');
  out.triggerHasSvg = Boolean(trigger && trigger.querySelector('svg'));
  out.optionFlags = [...doc.querySelectorAll('[data-language-option]')].map((o) => ({
    loc: o.dataset.languageOption,
    svg: Boolean(o.querySelector('svg')),
    emoji: /[\u{1F1E6}-\u{1F1FF}]/u.test(o.textContent || '')
  }));

  for (const loc of Object.keys(dict)) {
    const opt = doc.querySelector(`[data-language-option="${loc}"]`);
    if (!opt) { out.perLocale[loc] = { error: 'option missing' }; continue; }
    opt.click();
    await new Promise((r) => setTimeout(r, 420));

    let empty = 0;
    const over = [];
    for (const el of doc.querySelectorAll('#main [data-i18n], .site-header [data-i18n], .site-footer [data-i18n]')) {
      const text = (el.textContent || '').trim();
      if (!text) empty += 1;
      const r = el.getBoundingClientRect();
      const visible = r.width > 4 && r.height > 4 && win.getComputedStyle(el).visibility !== 'hidden';
      if (visible && el.scrollWidth - el.clientWidth > 2) {
        over.push(`${el.getAttribute('data-i18n')} +${el.scrollWidth - el.clientWidth}`);
      }
    }

    /* Does any headline break out of the section it lives in? */
    let spill = 0;
    for (const s of doc.querySelectorAll('#main > section')) {
      const sr = s.getBoundingClientRect();
      for (const el of s.querySelectorAll('h1, h2, h3, .btn, .eyebrow, time')) {
        const r = el.getBoundingClientRect();
        if (r.width < 4) continue;
        if (r.left < sr.left - 1 || r.right > sr.right + 1) spill += 1;
      }
    }

    out.perLocale[loc] = {
      htmlLang: doc.documentElement.lang,
      empty,
      overflow: over.length,
      samples: over.slice(0, 5),
      spillOutsideSection: spill,
      headline: (doc.querySelector('.hero__tagline') || {}).textContent?.trim().slice(0, 44)
    };
  }

  /* French no-break spaces survived the trip into the DOM. */
  const frTexts = [...doc.querySelectorAll('#main [data-i18n]')].map((e) => e.textContent || '').join(' ');
  out.frNnbspInDom = (frTexts.match(/\u202f/g) || []).length;
  return out;
};
