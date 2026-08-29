/**
 * Pole daty: własne na myszy, systemowe pod palcem — sprawdzane w obu wariantach.
 *
 *   node tools/cdp.mjs probe tools/probe-voting-picker.js --w 1280 --h 900 \
 *        --url /admin.html --inject tools/inject-voting-roster.js      (mysz)
 *   node tools/cdp.mjs probe tools/probe-voting-picker.js --w 390 --h 844 \
 *        --url /admin.html --inject tools/inject-voting-roster.js      (palec)
 *
 * PO CO OBA
 *   Cała wartość tej zmiany leży w tym, że NA TELEFONIE nic się nie zmienia. Sonda mierząca
 *   tylko wariant myszy przeszłaby także wtedy, gdyby warunek `pointer: coarse` był wpisany
 *   odwrotnie albo w ogóle nie działał — a wtedy organizator dostałby w dniu zawodów własny
 *   kalendarz z polami 32 px zamiast systemowych bębnów. To jest dokładnie ten rodzaj usterki,
 *   której nie widać na komputerze, na którym się ją pisze.
 *
 *   `cdp.mjs` włącza emulację dotyku dla szerokości poniżej 700 px, więc szerokość okna
 *   decyduje tu o tym, co raportuje `matchMedia('(pointer: coarse)')`.
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { steps: [], fail: [] };
  const ok = (label, pass, extra = '') => {
    out.steps.push(`${pass ? 'ok  ' : 'FAIL'} ${label}${extra && !pass ? ` -> ${extra}` : ''}`);
    if (!pass) out.fail.push(label);
  };

  await sleep(1400);

  out.coarse = window.matchMedia('(pointer: coarse)').matches;
  out.viewport = `${window.innerWidth}x${window.innerHeight}`;

  const native = document.querySelector('input[type="datetime-local"]');
  const trigger = [...document.querySelectorAll('button[aria-haspopup="dialog"]')][0];

  if (out.coarse) {
    ok('pod palcem zostaje pole systemowe', Boolean(native));
    ok('pod palcem NIE ma wlasnego przycisku', !trigger);
    return out;
  }

  ok('na myszy nie ma juz pola systemowego', !native);
  ok('na myszy jest wlasny przycisk wyboru', Boolean(trigger));
  if (!trigger) return out;

  /* Zamkniety na starcie: kalendarz otwarty od razu zaslanialby pola obok. */
  ok('kalendarz jest zamkniety zanim ktos kliknie', !document.querySelector('[role="dialog"]'));

  trigger.click();
  await sleep(400);
  const dialog = document.querySelector('[role="dialog"]');
  ok('klikniecie otwiera kalendarz', Boolean(dialog));
  if (!dialog) return out;

  /* Nazwy dni maja isc za jezykiem PANELU, a nie przegladarki — to polowa naprawianej
     usterki. Panel jest tu polski, wiec naglowki tygodnia musza byc polskie. */
  const heads = [...dialog.querySelectorAll('span')]
    .map((el) => el.textContent.trim())
    .filter((t) => t.length > 0 && t.length <= 4);
  out.weekdayHeads = heads.slice(0, 7);
  ok('naglowki dni sa z jezyka panelu', /pon|wt|śr|czw|pt|sob|niedz|nie/i.test(heads.join(' ')),
    heads.slice(0, 7).join(','));

  /* Wybor dnia ma ustawic wartosc, a nie tylko podswietlic kratke. */
  const days = [...dialog.querySelectorAll('button')].filter((b) => /^\d{1,2}$/.test(b.textContent.trim()));
  out.dayButtons = days.length;
  ok('siatka ma 42 kratki', days.length === 42, String(days.length));

  const fifteenth = days.find((b) => b.textContent.trim() === '15');
  fifteenth.click();
  await sleep(350);
  out.afterPick = trigger.textContent.trim();
  ok('po wybraniu dnia przycisk pokazuje date', /15/.test(out.afterPick), out.afterPick);

  /* Escape zamyka — bez tego jedynym wyjsciem byloby klikniecie obok, a to na klawiaturze
     nie istnieje. */
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(300);
  ok('Escape zamyka kalendarz', !document.querySelector('[role="dialog"]'));

  return out;
};
