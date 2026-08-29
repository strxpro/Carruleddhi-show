/**
 * Rejestrator przeskoków — włączany ręcznie, na prawdziwym telefonie.
 * ============================================================================
 * PO CO TO ISTNIEJE
 *   Przeskakiwanie przy przewijaniu palcem jest jedyną usterką na tej stronie, której nie da
 *   się zmierzyć z komputera. Powód jest zapisany w `tools/probe-scroll-live.js` i sprawdzony
 *   po raz drugi 29.08: `Input.synthesizeScrollGesture` z gestem dotykowym w headless Chrome
 *   nie robi nic, bo gest idzie przez kompozytor, którego przy `--disable-gpu` nie ma.
 *   `window.scrollTo` ustawia pozycję i kończy — a scroll-snap, kotwiczenie i korekty od
 *   `position: sticky` działają dopiero na wybiegu, który dokłada bezwładność palca.
 *
 *   Sonda przez scrollTo przeszła czysto przez komentarze i kontakt. To nie znaczy, że jest
 *   dobrze; znaczy, że mierzono nie tym, czym trzeba. Więc pomiar przenosi się na urządzenie.
 *
 * JAK UŻYWAĆ
 *   Otwórz stronę z `?jump=1` w adresie, na telefonie, na którym to widać:
 *
 *       https://carruleddhishow.com/?jump=1
 *
 *   Przewijaj normalnie — komentarze, czat, obracanie, klawiatura. Kiedy strona przeskoczy,
 *   ostatnie zdarzenia będą na czarnym pasku u dołu. „Kopiuj" wkleja cały zapis do schowka.
 *
 * CO ZAPISUJE — i dlaczego akurat to
 *   Każdy wiersz to jedna z pięciu rzeczy, które MOGĄ przesunąć stronę pod palcem. Nie
 *   zgaduje przyczyny: notuje fakty z czasem, żeby dało się je zestawić z chwilą przeskoku.
 *
 *     DOK   wysokość dokumentu zmieniła się — treść urosła albo zmalała, a pozycja
 *           przewinięcia liczy się od góry, więc wszystko poniżej pojechało
 *     OKNO  zmieniła się wysokość okna albo widocznego obszaru — pasek adresu, klawiatura,
 *           obrót ekranu. To ta zmiana skraca dokument i przycina przewinięcie
 *     TRYB  sekcja przeszła między `pinned` a `flow` — czyli ze `sticky` na `relative`,
 *           co przestawia ją w układzie razem ze wszystkim pod nią
 *     FOKUS ognisko trafiło w pole, a strona się przy tym przesunęła — to `focus()` bez
 *           `preventScroll` albo przewinięcie do pola przez przeglądarkę
 *     ZWROT przewijanie zawróciło o więcej niż 150 px w mniej niż 150 ms — czyli coś
 *           przewinęło stronę wbrew kierunkowi ruchu
 *
 * CZEGO NIE ROBI
 *   Nie naprawia niczego i nie wchodzi nikomu w drogę: bez `?jump=1` ten plik nie jest nawet
 *   pobierany (import w index.html jest warunkowy). Nie wysyła niczego na serwer.
 */

const MAX_ROWS = 40;
const rows = [];

/* Zwrot uznajemy za podejrzany dopiero powyżej 150 px w 150 ms. Niżej mieści się zwykłe
   „przewinąłem w dół i cofnąłem", a to nie jest usterka, tylko czytanie. */
const REVERSAL_PX = 150;
const REVERSAL_MS = 150;

const now = () => Math.round(performance.now());
const stamp = () => (now() / 1000).toFixed(1).padStart(6, ' ');

function add(kind, text) {
  rows.push(`${stamp()}s  ${kind.padEnd(5)} ${text}`);
  if (rows.length > MAX_ROWS) rows.shift();
  paint();
}

/* ---------------------------------------------------------------- widok na ekranie */
const panel = document.createElement('div');
panel.setAttribute('role', 'status');
panel.style.cssText = [
  'position:fixed', 'z-index:2147483647', 'left:0', 'right:0', 'bottom:0',
  'max-height:42vh', 'overflow:auto', 'padding:8px 10px 10px',
  'background:rgba(0,0,0,.88)', 'color:#9ef', 'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace',
  'white-space:pre', '-webkit-user-select:text', 'user-select:text'
].join(';');

const bar = document.createElement('div');
bar.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;color:#fff';
const title = document.createElement('strong');
title.textContent = 'rejestrator przeskoków';
title.style.cssText = 'flex:1;font:700 11px/1.2 ui-monospace,Menlo,Consolas,monospace';

const makeButton = (label, onClick) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = 'padding:6px 10px;border:1px solid #666;border-radius:8px;background:#222;color:#fff;font:600 11px/1 inherit';
  button.addEventListener('click', onClick);
  return button;
};

const body = document.createElement('div');
let hidden = false;

bar.append(
  title,
  makeButton('kopiuj', async () => {
    const text = rows.join('\n') || '(pusto)';
    try {
      await navigator.clipboard.writeText(text);
      title.textContent = 'skopiowane';
    } catch {
      /* Bez uprawnienia do schowka zostaje zaznaczenie ręczne — lepsze niż cisza. */
      title.textContent = 'zaznacz i skopiuj ręcznie';
    }
    setTimeout(() => { title.textContent = 'rejestrator przeskoków'; }, 1800);
  }),
  makeButton('wyczyść', () => { rows.length = 0; paint(); }),
  makeButton('schowaj', () => {
    hidden = !hidden;
    body.style.display = hidden ? 'none' : '';
    panel.style.maxHeight = hidden ? 'none' : '42vh';
  })
);
panel.append(bar, body);

function paint() {
  body.textContent = rows.slice(-MAX_ROWS).join('\n');
  body.scrollTop = body.scrollHeight;
}

const start = () => {
  document.body.appendChild(panel);
  add('start', `okno ${window.innerHeight}px, dokument ${document.documentElement.scrollHeight}px, y=${Math.round(window.scrollY)}`);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

/* ------------------------------------------------------------------- 1. DOK i ZWROT */
let lastHeight = document.documentElement.scrollHeight;
let lastY = Math.round(window.scrollY);
let lastYAt = now();
let lastDirection = 0;

window.addEventListener('scroll', () => {
  const y = Math.round(window.scrollY);
  const at = now();
  const delta = y - lastY;
  const height = document.documentElement.scrollHeight;

  if (height !== lastHeight) {
    add('DOK', `${lastHeight} -> ${height} px (${height - lastHeight >= 0 ? '+' : ''}${height - lastHeight}), y=${y}`);
    lastHeight = height;
  }

  const direction = Math.sign(delta);
  if (direction !== 0) {
    if (lastDirection !== 0 && direction !== lastDirection
      && Math.abs(delta) > REVERSAL_PX && at - lastYAt < REVERSAL_MS) {
      add('ZWROT', `y ${lastY} -> ${y} (${delta > 0 ? '+' : ''}${delta} px w ${at - lastYAt} ms)`);
    }
    lastDirection = direction;
  }
  lastY = y;
  lastYAt = at;
}, { passive: true });

/* ------------------------------------------------------------------------- 2. OKNO */
let lastInner = window.innerHeight;
let lastVisual = Math.round(window.visualViewport?.height || window.innerHeight);

const reportViewport = (source) => {
  const inner = window.innerHeight;
  const visual = Math.round(window.visualViewport?.height || inner);
  if (inner === lastInner && visual === lastVisual) return;
  add('OKNO', `${source}: okno ${lastInner} -> ${inner}, widok ${lastVisual} -> ${visual}, `
    + `dokument ${document.documentElement.scrollHeight}, y=${Math.round(window.scrollY)}`);
  lastInner = inner;
  lastVisual = visual;
};
window.addEventListener('resize', () => reportViewport('resize'), { passive: true });
window.visualViewport?.addEventListener('resize', () => reportViewport('visualViewport'), { passive: true });
window.addEventListener('orientationchange', () => setTimeout(() => reportViewport('obrót'), 350));

/* ------------------------------------------------------------------------- 3. TRYB */
const sections = [...document.querySelectorAll('#main > section[id]')];
const modes = new Map(sections.map((section) => [section.id, section.dataset.panel]));
const modeObserver = new MutationObserver((records) => {
  for (const record of records) {
    const section = record.target;
    const was = modes.get(section.id);
    const is = section.dataset.panel;
    /* `measure` to stan przejściowy samego pomiaru w setupPanels, nie zmiana werdyktu. */
    if (was === is || is === 'measure' || was === 'measure') continue;
    modes.set(section.id, is);
    add('TRYB', `#${section.id}: ${was} -> ${is}, y=${Math.round(window.scrollY)}, dokument ${document.documentElement.scrollHeight}`);
  }
});
for (const section of sections) {
  modeObserver.observe(section, { attributes: true, attributeFilter: ['data-panel'] });
}

/* ------------------------------------------------------------------------ 4. FOKUS */
document.addEventListener('focusin', (event) => {
  const before = Math.round(window.scrollY);
  const target = event.target;
  const label = target.id || target.name || target.tagName.toLowerCase();
  /* Przewinięcie od ogniska dzieje się w tej samej klatce albo tuż po niej. */
  setTimeout(() => {
    const after = Math.round(window.scrollY);
    if (Math.abs(after - before) > 8) {
      add('FOKUS', `${label}: y ${before} -> ${after} (${after - before >= 0 ? '+' : ''}${after - before})`);
    }
  }, 120);
}, true);
