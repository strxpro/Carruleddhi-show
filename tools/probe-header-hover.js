async (doc, win) => {
  const header = doc.querySelector('.site-header');
  const shell = doc.querySelector('.site-header .nav-shell');
  const lang = doc.querySelector('.site-header .language-picker');
  const attend = doc.querySelector('.site-header .nav-attend');
  const label = doc.querySelector('.site-header .menu-toggle__label');
  const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null);

  return {
    scrollY: Math.round(win.scrollY),
    compact: header.classList.contains('is-compact'),
    headerWidth: w(header),
    shellWidth: w(shell),
    languagePickerWidth: w(lang),
    attendWidth: w(attend),
    menuLabelDisplay: label ? win.getComputedStyle(label).display : null,
    // Hover has to bring the collapsed pill back to the full bar. Anything near
    // 292 means the rule did not apply.
    looksExpanded: w(header) > 700
  };
};
