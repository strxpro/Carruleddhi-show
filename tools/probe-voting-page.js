/**
 * Podstrona głosowania: dwanaście nagród, dwie kolumny, porcje, trzy kroki, okno z adresem.
 *
 * Uruchamiana przez tools/probe-voting.mjs, wykonywana przez tools/cdp.mjs w prawdziwej
 * przeglądarce i w prawdziwym czasie.
 */
async (document, window) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  for (let i = 0; i < 60 && !$('[data-award-tab]'); i += 1) await wait(150);

  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);

  const shown = (el) => Boolean(el) && !el.hidden
    && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
  const cards = () => $$('[data-vote-grid] > *');
  const firstRow = () => {
    const all = cards();
    if (!all.length) return 0;
    const top = Math.round(all[0].getBoundingClientRect().top);
    return all.filter((el) => Math.round(el.getBoundingClientRect().top) === top).length;
  };

  const out = {};

  out.head = {
    lang: document.documentElement.lang,
    title: document.title,
    awardTabs: $$('[data-award-tab]').length,
    awardLabels: $$('[data-award-tab] strong').map((el) => el.textContent.trim()),
    progress: $('[data-vote-progress]')?.textContent.trim() || '',
    languageButtons: $$('[data-vote-lang]').length,
    /* Trzy rzeczy, których na tej stronie NIE ma być. Zgłoszone wprost: „wyłączone jest to, że
       pokazuje się czas, te guziki zapisz się albo że będę tam — jest tylko zagłosuj". */
    clock: Boolean($('[data-voting-clock]')),
    signupLinks: $$('a[href="#signup"]').length,
    attendButtons: $$('[data-open-reminder]').length,
    /* Zdjęcie nie jest przyciskiem — czynność ma własny przycisk pod spodem. */
    photoIsButton: Boolean($('.vote-card__photo button') || $('button .vote-card__photo'))
  };

  out.batch = {
    first: cards().length,
    columns: firstRow(),
    gridWidth: Math.round($('[data-vote-grid]')?.getBoundingClientRect().width || 0),
    moreShown: shown($('[data-vote-more]')),
    moreLabel: $('[data-vote-more-label]')?.textContent.trim() || ''
  };
  $('[data-vote-more]')?.click();
  await wait(500);
  out.batch.after = cards().length;
  out.batch.moreShownAfter = shown($('[data-vote-more]'));

  /* Krok pierwszy: „Zagłosuj" na kafelku odsłania oceny i chowa sam siebie. */
  const start = $('[data-vote-start]');
  const card = start?.closest('.vote-card');
  start?.click();
  await wait(350);
  const picker = card?.querySelector('.vote-picker');
  /* Zakres zawężony do otwartego wyboru: `[data-vote-score]` w całym dokumencie to osiemnaście
     kafelków po osiem przycisków, z których siedemnaście jest ukrytych i ma wysokość zero —
     minimum z takiego zbioru zawsze wyszłoby zerem i nie mierzyłoby niczego. */
  const scores = Array.from(picker?.querySelectorAll('[data-vote-score]') || []);
  out.step1 = {
    startHidden: Boolean(start?.hidden),
    pickerShown: shown(picker),
    /* Jeden otwarty wybór na całą stronę: dwa otwarte rzędy ocen to pytanie „którą z nich
       właśnie wysyłam", zadane w chwili wysyłania. */
    openPickers: $$('.vote-picker').filter(shown).length,
    labels: scores.map((b) => b.textContent.trim()).join(','),
    smallestTarget: scores.length
      ? Math.min(...scores.map((b) => Math.round(b.getBoundingClientRect().height)))
      : null,
    rows: new Set(scores.map((b) => Math.round(b.getBoundingClientRect().top))).size,
    confirmDisabled: Boolean(picker?.querySelector('.vote-picker__confirm')?.disabled)
  };

  scores.find((b) => b.textContent.trim() === '8')?.click();
  await wait(200);
  out.step2 = {
    confirmDisabled: Boolean(picker?.querySelector('.vote-picker__confirm')?.disabled),
    picked: $$('[data-vote-score].is-picked').map((b) => b.textContent.trim()).join(',')
  };

  picker?.querySelector('.vote-picker__confirm')?.click();
  await wait(450);
  const dialog = $('[data-vote-dialog]');
  out.step3 = {
    open: Boolean(dialog?.open),
    bodyLocked: document.body.classList.contains('is-locked'),
    award: $('[data-vote-dialog-award]')?.textContent.trim() || '',
    who: $('[data-vote-dialog-who]')?.textContent.trim() || '',
    score: $('[data-vote-dialog-score]')?.textContent.trim() || '',
    knownShown: shown($('[data-vote-known]')),
    formShown: shown($('[data-vote-form]'))
  };

  /* Puste pola muszą zatrzymać wysyłkę — ten sam warunek co w formularzu zapisów. */
  $('[data-vote-form] button[type="submit"]')?.click();
  await wait(350);
  out.step3.blockedWhenEmpty = Boolean(dialog?.open);

  const form = $('[data-vote-form]');
  const fill = (name, value) => {
    const field = form?.elements.namedItem(name);
    if (field) {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  fill('name', 'Marco');
  fill('email', 'marco@example.com');
  form?.querySelector('button[type="submit"]')?.click();
  await wait(900);
  out.afterVote = {
    dialogClosed: !dialog?.open,
    bodyUnlocked: !document.body.classList.contains('is-locked'),
    bodyClasses: document.body.className,
    progress: $('[data-vote-progress]')?.textContent.trim() || '',
    doneTabs: $$('[data-award-tab].is-done').length,
    votedCards: $$('.vote-card.is-voted').length,
    yourScore: $('.vote-card__yours')?.textContent.trim() || '',
    usedOnOthers: $$('.vote-card__used').length,
    startButtonsLeft: $$('[data-vote-start]').length,
    toast: $('[data-toast-text]')?.textContent.trim() || '',
    toastTone: $('[data-toast]')?.dataset.toastTone || ''
  };

  /* Druga nagroda musi być znowu wolna: dwanaście nagród to dwanaście osobnych głosów. */
  $$('[data-award-tab]')[1]?.click();
  await wait(550);
  out.secondAward = {
    activeLabel: $('[data-award-tab].is-active strong')?.textContent.trim() || '',
    startButtons: $$('[data-vote-start]').length,
    usedNotes: $$('.vote-card__used').length
  };

  /* Zapamiętany adres jest PROPOZYCJĄ, nie domysłem: z jednego telefonu głosuje cała rodzina,
     więc „użyj innego" waży tyle samo co „zagłosuj tym". */
  $('[data-vote-start]')?.click();
  await wait(300);
  $$('[data-vote-score]').filter(shown).find((b) => b.textContent.trim() === '9')?.click();
  await wait(200);
  $$('.vote-picker').filter(shown)[0]?.querySelector('.vote-picker__confirm')?.click();
  await wait(450);
  out.remembered = {
    open: Boolean($('[data-vote-dialog]')?.open),
    knownShown: shown($('[data-vote-known]')),
    email: $('[data-vote-known-email]')?.textContent.trim() || '',
    formShown: shown($('[data-vote-form]'))
  };
  $('[data-vote-known-other]')?.click();
  await wait(300);
  out.remembered.afterOtherFormShown = shown($('[data-vote-form]'));
  out.remembered.afterOtherKnownShown = shown($('[data-vote-known]'));
  $('[data-vote-close]')?.click();
  await wait(300);

  /* Faza trzecia: ta sama siatka jest rankingiem TEJ nagrody. */
  const bar = $('[data-voting-demo]');
  if (bar && !bar.classList.contains('is-open')) bar.querySelector('[data-demo-toggle]').click();
  $$('[data-demo-phase]').find((b) => b.dataset.demoPhase === 'closed')?.click();
  await wait(1000);
  out.closed = {
    cards: cards().length,
    stats: $$('.vote-card__stats').length,
    ranks: $$('.vote-card__rank').length,
    startButtons: $$('[data-vote-start]').length,
    firstRank: $('.vote-card__rank')?.textContent.trim() || '',
    averages: $$('.vote-card__stats b').slice(0, 3).map((el) => el.textContent.trim())
  };
  /* Każda nagroda ma własny ranking — inaczej dwanaście nagród jest jedną nagrodą pokazaną
     dwanaście razy. */
  const firstOrder = $$('.vote-card__body > strong').map((el) => el.textContent.trim()).join('|');
  $$('[data-award-tab]')[6]?.click();
  await wait(700);
  out.closed.otherOrder = $$('.vote-card__body > strong').map((el) => el.textContent.trim()).join('|');
  out.closed.ordersDiffer = out.closed.otherOrder !== firstOrder;

  return out;
}
