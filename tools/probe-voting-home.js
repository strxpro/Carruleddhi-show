/**
 * Strona główna w trzech fazach: zaproszenie, chowanie dwóch przycisków, podium, zapisy.
 *
 * Uruchamiana przez tools/probe-voting.mjs, wykonywana przez tools/cdp.mjs w prawdziwej
 * przeglądarce i w prawdziwym czasie. Ocenianie jest na podstronie — patrz probe-voting-page.js.
 */
async (document, window) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  for (let i = 0; i < 60 && !$('[data-voting-demo]'); i += 1) await wait(150);

  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);

  const shown = (el) => Boolean(el) && !el.hidden
    && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;

  const snapshot = () => ({
    podiumShown: shown($('[data-podium]')),
    ctaShown: $$('[data-vote-cta]').map(shown),
    ctaHref: $('.hero__actions [data-vote-cta]')?.getAttribute('href') || '',
    heroButtons: Array.from($('.hero__actions')?.children || []).filter(shown)
      .map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
    raceHideShown: $$('[data-race-hide]').filter(shown).length,
    podiumCards: $$('.podium-card').length,
    svgBlocks: $$('.podium__block').length,
    signupLocked: shown($('[data-signup-locked]')),
    submitDisabled: Boolean($('[data-registration-form] button[type="submit"]')?.disabled),
    signupLinks: $$('a[href="#signup"], a[data-feature-link="registration"]')
      .filter((a) => a.dataset.voteCta === undefined)
      .map((a) => a.getAttribute('aria-disabled') === 'true'),
    demoBarFixed: (() => {
      const bar = $('[data-voting-demo]');
      return bar ? getComputedStyle(bar).position : '';
    })(),
    skipShown: shown($('[data-demo-skip]'))
  });

  const openBar = () => {
    const bar = $('[data-voting-demo]');
    if (bar && !bar.classList.contains('is-open')) bar.querySelector('[data-demo-toggle]').click();
  };
  const pickPhase = (phase) => {
    openBar();
    $$('[data-demo-phase]').find((b) => b.dataset.demoPhase === phase)?.click();
  };

  const out = {};
  out.demoBarPresent = Boolean($('[data-voting-demo]'));
  /* Sekcja ocen i okno oceny NIE mogą tu być — przeniosły się na podstronę. Zostawione przez
     pomyłkę dawałyby dwa miejsca do głosowania i dwie prawdy o tym samym głosie. */
  out.votingSectionGone = !$('#voting') && !$('[data-voting-grid]');
  out.voteDialogGone = !$('[data-vote-dialog]');

  openBar();
  out.scheduled = snapshot();

  /* „Zakończ odliczanie": przejście ma się odbyć tą samą drogą co w dniu zawodów — przez
     watchStart, na oczach patrzącego — a nie skokiem stanu. Start ustawiany dwie sekundy w
     przód, więc czekamy dłużej niż te dwie sekundy. */
  $('[data-demo-skip]')?.click();
  await wait(3800);
  out.afterSkip = snapshot();

  pickPhase('voting');
  await wait(700);
  out.voting = snapshot();

  /* Klik w „Zapisz się" w trakcie wyścigu nie może zaprowadzić do formularza. */
  $$('a[href="#signup"]').find((a) => a.dataset.voteCta === undefined)?.click();
  await wait(450);
  out.signupClick = {
    toast: $('[data-toast-text]')?.textContent.trim() || '',
    tone: $('[data-toast]')?.dataset.toastTone || '',
    visible: $('[data-toast]')?.classList.contains('is-visible') || false,
    offCentreBy: (() => {
      const el = $('[data-toast]');
      if (!el) return null;
      const box = el.getBoundingClientRect();
      /* Odniesieniem jest szerokość UKŁADU, a nie `clientWidth` ani `innerWidth`.
         ---------------------------------------------------------------------------
         ZMIERZONE 1280×1000: `clientWidth` mówi 1280, a pudełko `<html>` ma 1270 px, bo
         miejsce na pasek przewijania zostaje zajęte w układzie także wtedy, gdy sonda uruchamia
         Chrome z `--hide-scrollbars`. `left: 50%` na pasku komunikatów rozwiązuje się do 635 px,
         czyli dokładnie w środku tych 1270 — więc pasek JEST wyśrodkowany, a porównanie z 1280
         dawało 5 px odchylenia i fałszywy błąd. */
      const layout = document.documentElement.getBoundingClientRect().width;
      return Math.round((box.left + box.right) / 2 - layout / 2);
    })()
  };

  pickPhase('closed');
  await wait(1100);
  out.closed = snapshot();
  out.closed.podiumPlaces = $$('.podium-card')
    .map((c) => `${c.dataset.podiumPlace}:${c.querySelector('strong')?.textContent.trim() || ''}`);
  out.closed.podiumArtDrawn = Boolean($('[data-podium-art]')?.classList.contains('is-drawn'));

  return out;
}
