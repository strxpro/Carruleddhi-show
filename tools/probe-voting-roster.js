/**
 * Wybieranie uczestników z listy startowej — sprawdzane klikaniem, nie czytaniem kodu.
 *
 *   npm run build && npx vite preview --port 5199
 *   node tools/cdp.mjs probe tools/probe-voting-roster.js --w 1280 --h 900 \
 *        --url /admin.html --inject tools/inject-voting-roster.js
 *
 * CO JEST MIERZONE I DLACZEGO AKURAT TO
 *   Nie „czy lista się pokazuje" — to widać na zrzucie. Mierzone jest ŻĄDANIE wychodzące po
 *   kliknięciu, bo tam siedzi jedyny nieoczywisty warunek tej zmiany: worker uzupełnia numer
 *   startowy, kategorię i nazwę wózka z bazy WYŁĄCZNIE wtedy, gdy pole jest `undefined`
 *   (`votingAdminSave` w worker/index.js). Dołożenie do żądania `startNumber: ''` — rzecz
 *   zupełnie niewidoczna w interfejsie — zamienia dodanie zawodnika w błąd
 *   `VOTING_BAD_START_NUMBER`, a przy pustym numerze w zgłoszeniu w cichy zapis bez numeru.
 *
 *   Druga rzecz: odsiewanie już dodanych. Zaślepka ma trzech zapisanych, z czego jeden jest
 *   już uczestnikiem — więc do wyboru mają zostać dwaj, nie trzej.
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { steps: [], fail: [] };
  const ok = (label, pass, extra = '') => {
    out.steps.push(`${pass ? 'ok  ' : 'FAIL'} ${label}${extra && !pass ? ` -> ${extra}` : ''}`);
    if (!pass) out.fail.push(label);
  };

  await sleep(1400);

  const byText = (selector, needle) =>
    [...document.querySelectorAll(selector)].find((el) => el.textContent.trim().includes(needle));

  out.tab = document.body.textContent.includes('Partecipanti')
    || document.body.textContent.includes('Uczestnicy');
  ok('zakladka glosowania jest otwarta', out.tab, document.body.textContent.slice(0, 120));
  if (!out.tab) return out;

  /* 1. Przycisk otwierajacy liste startowa. */
  const openButton = byText('button', 'lista di partenza') || byText('button', 'listy startowej');
  ok('jest przycisk „dodaj z listy startowej"', Boolean(openButton));
  if (!openButton) return out;

  openButton.click();
  await sleep(900);

  /* 2. Lista wczytana i ODSIANA: trzech zapisanych minus jeden juz dodany = dwaj. */
  const rows = [...document.querySelectorAll('li')].filter((li) =>
    /Aggiungi|Dodaj/.test(li.textContent) && /\d{3}|—/.test(li.textContent));
  out.rowsFound = rows.length;
  out.rowNames = rows.map((li) => li.textContent.replace(/\s+/g, ' ').trim().slice(0, 60));
  ok('juz dodany zawodnik jest odsiany (2 z 3)', rows.length === 2, `zobaczono ${rows.length}`);
  ok('Sary nie ma na liscie do dodania', !out.rowNames.some((n) => n.includes('Bianchi')));

  /* 3. Zapisany bez numeru startowego ma byc widoczny z adnotacja, a nie ukryty. */
  const noNumber = out.rowNames.find((n) => n.includes('Verdi'));
  ok('zapisany bez numeru jest na liscie', Boolean(noNumber), String(noNumber));
  ok('i jest oznaczony jako bez numeru', /senza numero|bez numeru/.test(noNumber || ''));

  /* 4. KLIKNIECIE — i sprawdzenie, co naprawde poleci. */
  const before = window.__sent.length;
  const marco = rows.find((li) => li.textContent.includes('Rossi'));
  ok('jest wiersz Marco Rossi', Boolean(marco));
  if (!marco) return out;
  marco.querySelector('button').click();
  await sleep(900);

  const sent = window.__sent.slice(before).filter((r) => r.path.includes('voting-admin'));
  const record = sent.find((r) => r.body && r.body.action === 'save');
  /* `record` to {path, body}; asercje MUSZĄ czytać `record.body`. Pierwsza wersja pytała
     wprost `record.startNumber` — czego tam nie ma nigdy, więc pięć sprawdzeń świeciło na
     zielono niezależnie od tego, co strona wysyłała. Sonda, która przechodzi także przy
     zepsutym kodzie, jest gorsza od jej braku. */
  const save = record ? record.body : null;
  out.savePayload = save;
  ok('kliknięcie wyslalo zapis uczestnika', Boolean(save), JSON.stringify(sent.map((s) => s.body)));
  if (!save) return out;

  ok('poszlo registrationId zawodnika',
    save.registrationId === '11111111-1111-4111-8111-111111111111', JSON.stringify(save));

  /* Sedno pomiaru: pol, ktore ma uzupelnic worker, NIE MA w zadaniu. */
  for (const forbidden of ['startNumber', 'firstName', 'lastName', 'projectName', 'category']) {
    ok(`nie wyslano „${forbidden}" (worker ma je dociagnac z bazy)`,
      !(forbidden in save), `${forbidden}=${JSON.stringify(save[forbidden])}`);
  }

  return out;
};
