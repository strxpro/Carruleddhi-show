/**
 * Zaślepka Workera dla wyników: zamknięte głosowanie, dwanaście nagród jury, trzy roczniki.
 * ===========================================================================
 *
 * Wstrzykiwana przez `cdp.mjs --inject`, czyli PRZED skryptami strony. Później byłoby za późno:
 * `voting.js` wysyła odczyt stanu zaraz po `DOMContentLoaded`, a `app.js` odpytuje ustawienia
 * jeszcze wcześniej — podmieniony po wczytaniu `fetch` zdążyłby tylko na odpytywanie co
 * trzydzieści sekund.
 *
 * DLACZEGO NIE `?demo=1`
 *   Wbudowane demo (`assets/js/demo-content.js`) oddaje stan bez `awards`, bez `editions` i bez
 *   `selectedEdition` — czyli dokładnie ten kształt, który udaje starszą wdrożoną funkcję. Jest
 *   przydatny i jest osobnym przebiegiem tej sondy („starsza funkcja" niżej), ale nie da się na
 *   nim zmierzyć ani dwunastu nagród, ani archiwum, bo tych pól tam po prostu nie ma. Ta
 *   zaślepka podstawia PEŁNY kontrakt serwera, ten z opisu w worker/index.js.
 *
 * PODMIENIANY JEST `fetch`, NIE STAN W MODULE
 *   Mierzone ma być to, co strona zrobi z odpowiedzią SERWERA, razem z drogą przez
 *   `postJSON` → `readState` → `absorb`. Wpisanie danych prosto do `state` ominęłoby całą tę
 *   drogę i sonda byłaby zielona także wtedy, gdyby `awards` nigdy nie zostało odczytane.
 *
 * TRZY ROCZNIKI, BO TRZY RÓŻNE PRZYPADKI
 *   2026  bieżący, aktywny — nie wolno mu się pokazać na liście „wcześniejszych";
 *   2025  archiwalny Z `attendeeCount` — podsumowanie mówi „było nas wtedy tyle osób";
 *   2024  archiwalny BEZ `attendeeCount` — czyli rocznik zamknięty przed dołożeniem tego pola.
 *         Podsumowanie ma wtedy pokazać liczbę uczestników i podpisać ją uczestnikami, a nie
 *         podstawić ją pod etykietę widowni. To jest jedyny sposób, żeby to sprawdzić.
 */

/** Rysunek wozu w adresie danych: bez plików w repozytorium i bez ani jednego żądania więcej. */
function cart(number, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">`
    + `<rect width="400" height="300" fill="hsl(${hue} 42% 88%)"/>`
    + `<path d="M64 210h272l-26-58H90z" fill="hsl(${hue} 68% 52%)"/>`
    + `<circle cx="118" cy="222" r="30" fill="hsl(${hue} 72% 32%)"/>`
    + `<circle cx="290" cy="222" r="30" fill="hsl(${hue} 72% 32%)"/>`
    + `<text x="200" y="196" fill="#fff" font-family="sans-serif" font-size="42"`
    + ` font-weight="800" text-anchor="middle">${String(number).padStart(3, '0')}</text>`
    + `<text x="376" y="286" fill="hsl(${hue} 72% 32%)" font-family="sans-serif" font-size="19"`
    + ` font-weight="800" text-anchor="end" opacity=".75">SONDA</text>`
    + `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* Stawka z głosami. Sześć wozów, żeby pod cokołem została tabela (od czwartego miejsca w dół),
   i żeby dało się sprawdzić, że cokół bierze trzy pierwsze, a nie wszystkie. */
const RAW = [
  { n: 12, first: 'Giulia', last: 'Deiana', project: 'Rena Bianca', hue: 200, votes: 41, avg: 9.12, photo: true },
  { n: 7, first: 'Salvatore', last: 'Mannu', project: 'Fulmine di Gallura', hue: 20, votes: 34, avg: 8.94, photo: true },
  { n: 23, first: 'Elena', last: 'Corda', project: 'Tonno Volante', hue: 320, votes: 38, avg: 9.47, photo: true },
  { n: 31, first: 'Nicolò', last: 'Pinna', project: 'Nuraghe Express', hue: 120, votes: 27, avg: 8.11, photo: true },
  { n: 44, first: 'Marta', last: 'Bua', project: 'Sirena a Pedali', hue: 260, votes: 19, avg: 8.63, photo: false },
  { n: 18, first: 'Piero', last: 'Sanna', project: '', hue: 60, votes: 12, avg: 7.25, photo: false }
];

const participants = RAW.map((row, index) => ({
  id: `probe-participant-${index}`,
  category: index % 2 ? 'art' : 'classic',
  startNumber: row.n,
  firstName: row.first,
  lastName: row.last,
  projectName: row.project,
  photo: row.photo ? cart(row.n, row.hue) : '',
  voteCount: row.votes,
  averageScore: row.avg,
  totalScore: Math.round(row.votes * row.avg)
}));

const podium = [...participants]
  .sort((a, b) => b.totalScore - a.totalScore || b.voteCount - a.voteCount
    || b.averageScore - a.averageScore || a.startNumber - b.startNumber)
  .slice(0, 3);

/**
 * Dziesięć nagród rozstrzygniętych, DWIE nie.
 *
 * Nie dwanaście: stan „ogłoszono część" jest tym, który wieczorem trwa najdłużej, i jedynym,
 * w którym da się w ogóle zmierzyć, że kategoria bez zwycięzcy nie znika z listy i nie wygląda
 * tak samo jak rozstrzygnięta. Brakuje `prize-11` i `prize-12`, czyli dwóch OSTATNICH —
 * gdyby lista gubiła nieprzypisane, brak byłoby widoczny jako dziesięć kart zamiast dwunastu.
 */
const awards = [
  { key: 'prize-1', at: 1, note: '0:41.20' },
  { key: 'prize-2', at: 2, note: '0:43.55' },
  { key: 'prize-3', at: 3, note: '' },
  { key: 'prize-4', at: 4, note: '2,4 m' },
  { key: 'prize-5', at: 5, note: '' },
  { key: 'prize-6', at: 0, note: '' },
  { key: 'prize-7', at: 1, note: '0:45.10' },
  { key: 'prize-8', at: 5, note: '9 lat' },
  { key: 'prize-9', at: 2, note: '74 lata' },
  { key: 'prize-10', at: 3, note: '' }
].map((entry) => {
  const row = participants[entry.at];
  return {
    awardKey: entry.key,
    startNumber: row.startNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    projectName: row.projectName,
    photo: row.photo,
    note: entry.note
  };
});

const editions = [
  {
    id: 'edition-2026', key: '2026', name: 'Carruleddhi Show 2026',
    date: '2026-10-17T09:00:00Z', location: 'Santa Teresa Gallura', status: 'active',
    participantCount: participants.length, voteCount: 171, attendeeCount: 1480
  },
  {
    id: 'edition-2025', key: '2025', name: 'Carruleddhi Show 2025',
    date: '2025-10-18T09:00:00Z', location: 'Santa Teresa Gallura', status: 'archived',
    participantCount: 18, voteCount: 224
  },
  {
    id: 'edition-2024', key: '2024', name: 'Carruleddhi Show 2024',
    date: '2024-10-19T09:00:00Z', location: 'Santa Teresa Gallura', status: 'archived',
    participantCount: 12, voteCount: 138
  }
];

/* Liczba widowni dopisana TYLKO do rocznika 2025. 2024 jej nie ma z rozmysłu — patrz nagłówek. */
const ARCHIVE_ATTENDEES = { 2025: 1240 };

function currentState() {
  return {
    ok: true,
    phase: 'closed',
    isArchive: false,
    editions,
    selectedEdition: editions[0],
    raceStartsAt: '2026-10-17T09:00:00Z',
    votingEndsAt: '2026-10-17T10:00:00Z',
    durationMinutes: 30,
    scoreMin: 3,
    scoreMax: 10,
    categories: ['classic', 'art'],
    participants,
    podium,
    awards,
    myVotes: []
  };
}

function archiveState(key) {
  const edition = editions.find((row) => row.key === key);
  if (!edition || edition.status !== 'archived') return currentState();
  const attendees = ARCHIVE_ATTENDEES[key];
  return {
    ok: true,
    phase: 'closed',
    isArchive: true,
    editions,
    selectedEdition: {
      id: edition.id,
      key: edition.key,
      name: edition.name,
      date: edition.date,
      location: edition.location,
      status: edition.status,
      participantCount: edition.participantCount,
      ...(attendees ? { attendeeCount: attendees } : {})
    },
    raceStartsAt: edition.date,
    votingEndsAt: edition.date,
    durationMinutes: 0,
    scoreMin: 3,
    scoreMax: 10,
    categories: ['classic', 'art'],
    participants,
    podium,
    /* Rocznik 2024 udaje archiwum zamknięte przed dołożeniem nagród jury: bez `awards` strona
       ma powiedzieć, że nie zostały zapisane, a nie pokazać dwunastu „jeszcze nieogłoszonych". */
    ...(key === '2024' ? {} : { awards }),
    myVotes: []
  };
}

/**
 * Język przypięty przez `?probelang=de`.
 *
 * Strona główna NIE czyta `?lang=` — ten parametr obsługują podstrona głosowania i dokumenty
 * prawne (patrz `pickLocale` w voting-boot.js). `app.js` bierze język z zapamiętanego wyboru
 * albo z przeglądarki, więc sonda uruchomiona na polskim systemie mierzy polskie napisy i nie
 * ma jak sprawdzić, czy dwanaście nazw kategorii mieści się w karcie po niemiecku — a to one
 * są najdłuższe. Zapisanie tego samego klucza, którego używa strona, jest jedyną drogą, która
 * nie wymaga zmiany w `app.js`.
 */
const askedLocale = new URLSearchParams(location.search).get('probelang');
if (askedLocale && /^(it|pl|en|de|es|fr)$/.test(askedLocale)) {
  try { window.localStorage.setItem('carruleddhi.lang', askedLocale); } catch (_) { /* pamięć zablokowana */ }
}

/** Każde żądanie zapisane, żeby dało się sprawdzić, CO poleciało po wybraniu rocznika. */
window.__sent = [];

const nativeFetch = window.fetch.bind(window);

window.fetch = async (url, options = {}) => {
  const path = String(url);
  let body = {};
  try { body = JSON.parse(options.body || '{}'); } catch (_) { /* nieważne dla zaślepki */ }
  window.__sent.push({ path, body });

  const reply = (data) =>
    new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

  if (path.includes('/voting')) {
    const edition = String(body?.edition || '');
    return reply(edition ? archiveState(edition) : currentState());
  }
  /* Reszta końcówek strony (ustawienia, liczniki, ściana) dostaje puste „ok". Bez tego każda z
     nich odbiłaby się od podglądowego serwera 404-ką i w konsoli byłoby kilka ostrzeżeń, przez
     które nie widać tych prawdziwych. */
  if (path.includes('/api/')) return reply({ ok: true });
  return nativeFetch(url, options);
};
