/**
 * Podstrona głosowania: nagroda publiczności, dwie kolumny, porcje, trzy kroki, okno z adresem.
 *
 * Uruchamiana przez tools/probe-voting.mjs, wykonywana przez tools/cdp.mjs w prawdziwej
 * przeglądarce i w prawdziwym czasie.
 *
 * UWAGA: CZĘŚĆ TEJ SONDY JEST NIEAKTUALNA I WYWALA SIĘ Z PREMEDYTACJĄ.
 * ===========================================================================
 * Opisuje POPRZEDNI układ kafelka: przycisk „Zagłosuj" POD zdjęciem, osobny krok „zagłosować
 * na ten wóz?" i oceny jako siatka 4×2. Wszystkie trzy zostały zastąpione nakładką na zdjęciu
 * — kafelek jest czysty, dotknięcie odsłania jedno zaproszenie, a ono przeistacza się w suwak.
 * Zniknęła też plakietka z regułą (`[data-vote-rule]`), przeniesiona do akapitu nagłówka.
 *
 * Skutek: sekcje „trzy kroki przy pojeździe", „okno z adresem" i „po oddaniu głosu" nie mają
 * czego znaleźć i przewracają się kaskadowo. To NIE są błędy w kodzie strony.
 *
 * Aktualny przepływ mierzy tools/probe-vote-veil.mjs — i tam wszystko przechodzi. Sekcje
 * nagłówka, filtra kategorii i doczytywania porcjami nadal są tu prawdziwe i nadal przechodzą,
 * więc plik zostaje do przepisania, a nie do wyrzucenia.
 */
async (document, window) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  for (let i = 0; i < 60 && !$('[data-vote-start]'); i += 1) await wait(150);

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
    h1: $('.vote-head h1')?.textContent.trim() || '',
    kicker: $('[data-vote-kicker]')?.textContent.trim() || '',
    ruleShown: shown($('[data-vote-rule]')),
    rule: $('[data-vote-rule]')?.textContent.replace(/\s+/g, ' ').trim() || '',
    languageButtons: $$('[data-vote-lang]').length,
    /* Nie ma juz zakladek nagrod: publicznosc przyznaje JEDNA nagrode. */
    awardTabs: $$('[data-award-tab]').length,
    /* Trzy rzeczy, ktorych na tej stronie NIE ma byc. Zgloszone wprost: „wylaczone jest to, ze
       pokazuje sie czas, te guziki zapisz sie albo ze bede tam — jest tylko zaglosuj". */
    clock: Boolean($('[data-voting-clock]')),
    signupLinks: $$('a[href="#signup"]').length,
    attendButtons: $$('[data-open-reminder]').length,
    /* Zdjecie nie jest przyciskiem — czynnosc ma wlasny przycisk pod spodem. */
    photoIsButton: Boolean($('.vote-card__photo button') || $('button .vote-card__photo')),
    mineShown: shown($('[data-vote-mine]'))
  };

  out.filters = {
    shown: shown($('[data-vote-filters]')),
    labels: $$('[data-vote-filter]').map((b) => b.textContent.trim()),
    activeFirst: $$('[data-vote-filter]')[0]?.classList.contains('is-active') || false,
    smallestTarget: $$('[data-vote-filter]').length
      ? Math.min(...$$('[data-vote-filter]').map((b) => Math.round(b.getBoundingClientRect().height)))
      : null
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

  /* Filtr kategorii POJAZDU zawęża listę. To nie są kategorie głosowania — głos jest jeden. */
  const second = $$('[data-vote-filter]')[1];
  if (second) {
    second.click();
    await wait(450);
    out.filters.afterPick = {
      label: second.textContent.trim(),
      cards: cards().length,
      allSameCategory: (() => {
        const wanted = second.textContent.trim().toLowerCase();
        return cards().every((card) => (card.querySelector('.vote-card__rider')?.textContent || '')
          .toLowerCase().includes(wanted));
      })()
    };
    $$('[data-vote-filter]')[0].click();
    await wait(450);
    out.filters.afterReset = cards().length;
  }

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
    who: $('[data-vote-dialog-who]')?.textContent.trim() || '',
    rider: $('[data-vote-dialog-rider]')?.textContent.trim() || '',
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
    /* Panel „Twój głos" nad listą — to jest odpowiedź na „czy ja już głosowałem", której nie
       trzeba szukać w siatce. */
    mineShown: shown($('[data-vote-mine]')),
    mineCart: $('[data-vote-mine-cart]')?.textContent.trim() || '',
    mineScore: $('[data-vote-mine-score]')?.textContent.trim() || '',
    mineNoteShown: shown($('[data-vote-mine-note]')),
    votedCards: $$('.vote-card.is-voted').length,
    mineBadges: $$('.vote-card__mine').length,
    yourScore: $('.vote-card__yours')?.textContent.trim() || '',
    usedOnOthers: $$('.vote-card__used').length,
    /* Jeden glos na cala strone, wiec po oddaniu nie ma juz na co kliknac NIGDZIE. */
    startButtonsLeft: $$('[data-vote-start]').length,
    toast: $('[data-toast-text]')?.textContent.trim() || '',
    toastTone: $('[data-toast]')?.dataset.toastTone || ''
  };

  /* Faza trzecia: ta sama siatka jest rankingiem nagrody publiczności. */
  const bar = $('[data-voting-demo]');
  if (bar && !bar.classList.contains('is-open')) bar.querySelector('[data-demo-toggle]').click();
  $$('[data-demo-phase]').find((b) => b.dataset.demoPhase === 'closed')?.click();
  await wait(1000);
  out.closed = {
    cards: cards().length,
    stats: $$('.vote-card__stats').length,
    ranks: $$('.vote-card__rank').length,
    startButtons: $$('[data-vote-start]').length,
    ruleShown: shown($('[data-vote-rule]')),
    firstRank: $('.vote-card__rank')?.textContent.trim() || '',
    firstPlaceMarked: Boolean($('.vote-card.is-place-1')),
    kicker: $('[data-vote-kicker]')?.textContent.trim() || '',
    averages: $$('.vote-card__stats b').slice(0, 3).map((el) => el.textContent.trim())
  };
  /* Kolejność ma być wynikiem: średnie nierosnąco. */
  out.closed.sorted = out.closed.averages
    .map(Number)
    .every((value, index, list) => index === 0 || list[index - 1] >= value);

  return out;
}
