/**
 * Placeholder sponsors and comments, for looking at the design before the real ones exist.
 *
 * HOW IT IS TURNED ON
 *   `?demo=1` in the address. Nothing else — no database row, no build flag, no switch that
 *   somebody could leave on. Close the tab and it is gone.
 *
 * WHY IT IS A URL AND NOT A SETTING
 *   The standing instruction on this project is that every number on the page is real: no
 *   inflated counters, no seeded lists. A persisted "show demo content" switch is one
 *   forgotten click away from a live site showing invented reviews of a race that has not
 *   happened, and nobody would notice, because invented reviews look exactly like real
 *   ones. A query parameter cannot be forgotten, because it is not stored.
 *
 * AND IT SAYS SO ON SCREEN
 *   Demo mode paints a fixed banner across the top and marks every tile it produced. Not
 *   politeness — it is the difference between a preview and a lie. If a screenshot of this
 *   ever leaves your machine, the word DEMO is in it.
 *
 * The sponsor logos are the four SVGs already in public/assets/images/sponsors/, so this
 * file adds no assets and nothing to download.
 */

export const DEMO_SPONSORS = [
  { name: 'Cantina Gallura', url: 'https://example.com', image: '/assets/images/sponsors/demo-1.svg' },
  { name: 'Rena Bianca Café', url: 'https://example.com', image: '/assets/images/sponsors/demo-2.svg' },
  { name: 'Officina Sarda', url: '', image: '/assets/images/sponsors/demo-3.svg' },
  { name: 'Hotel Capo Testa', url: 'https://example.com', image: '/assets/images/sponsors/demo-4.svg' }
];

/**
 * Nine comments, chosen to exercise the layout rather than to flatter it.
 *
 * A one-line message next to a five-line one, a name with no place, a five-star and a
 * three-star, three languages, and one message long enough to wrap four times. A demo made
 * of nine identical two-line entries proves the tile renders and nothing else — the useful
 * question is what the column looks like when the contents are uneven, because that is what
 * real ones are like.
 *
 * `createdAt` is generated relative to now, so the "2 days ago" line is always sensible and
 * the newest/oldest sort has something to sort.
 */
const RAW_COMMENTS = [
  { name: 'Marco', place: 'Santa Teresa Gallura', rating: 5, locale: 'it', hoursAgo: 3,
    message: 'Che discesa. Mio nonno costruiva carruleddhi negli anni sessanta e non pensavo di rivederli scendere per la Rena Bianca. Grazie a chi ha rimesso in piedi tutto questo.' },
  { name: 'Ania', place: 'Kraków', rating: 5, locale: 'pl', hoursAgo: 9,
    message: 'Przyjechaliśmy przypadkiem i został nam cały dzień w pamięci. Dzieciaki do dziś rysują wózki.' },
  { name: 'Giulia', place: '', rating: 4, locale: 'it', hoursAgo: 22,
    message: 'Il nostro carretto si chiama Fulmine. Non vinceremo, ma arriveremo in fondo.' },
  { name: 'Hans', place: 'München', rating: 5, locale: 'de', hoursAgo: 30,
    message: 'Wir kommen wieder. Bringt Helme mit, sie prüfen das wirklich.' },
  { name: 'Salvatore', place: 'Olbia', rating: 5, locale: 'it', hoursAgo: 48,
    message: 'Tre generazioni sulla stessa strada. Mio padre spingeva, io frenavo, adesso guarda mio figlio.' },
  { name: 'Claire', place: 'Lyon', rating: 4, locale: 'fr', hoursAgo: 55,
    message: 'Ambiance incroyable, et tout le village dans la rue.' },
  { name: 'Piotr', place: 'Gdańsk', rating: 3, locale: 'pl', hoursAgo: 72,
    message: 'Świetna impreza, ale przy starcie było ciasno i nie wszystko było słychać. Może więcej głośników po zakręcie?' },
  { name: 'Elena', place: 'Sassari', rating: 5, locale: 'it', hoursAgo: 96,
    message: 'La categoria artistica è la mia preferita. Un carretto vestito da tonno, giuro.' },
  { name: 'Tom', place: 'Bristol', rating: 5, locale: 'en', hoursAgo: 120,
    message: 'No engines, no sponsors on the carts, no entry fee. Somehow the best race I have seen.' }
];

export function demoComments() {
  const now = Date.now();
  return RAW_COMMENTS.map((comment, index) => ({
    id: `demo-${index}`,
    createdAt: new Date(now - comment.hoursAgo * 3600000).toISOString(),
    name: comment.name,
    place: comment.place,
    message: comment.message,
    locale: comment.locale,
    rating: comment.rating,
    approved: true,
    // No photos. A demo photo would have to come from somewhere, and a stock beach picture
    // pretending to be somebody's carruleddhu is the one kind of placeholder that misleads
    // rather than illustrates.
    photo: '',
    demo: true
  }));
}

/** The average and the count, computed rather than written down, so they always agree. */
export function demoRating() {
  const comments = RAW_COMMENTS.filter((comment) => comment.rating);
  const sum = comments.reduce((total, comment) => total + comment.rating, 0);
  return { average: sum / comments.length, votes: comments.length };
}

/* ===========================================================================
   Głosowanie publiczności
   ===========================================================================
   Ta sekcja jest niewidoczna przez jedenaście miesięcy w roku i widoczna w jednym dniu, w
   trzech różnych postaciach: odliczanie, otwarte głosowanie, podium. To najgorszy możliwy
   układ do przeglądania projektu graficznego — nie da się zobaczyć żadnej z tych trzech
   postaci bez wgranej bazy, ustawionej godziny i oddanych głosów, a ostatniej nie da się
   zobaczyć wcale, dopóki ktoś nie zagłosuje.

   W trybie demo faza jest przełączana z ekranu. Nie jest to obejście serwera: kiedy Worker
   odpowiada, faza pochodzi wyłącznie od niego i przełącznika nie ma. Patrz voting.js.

   ZDJĘCIA SĄ RYSOWANE TUTAJ, PO JEDNYM NA WÓZ
     Reguła z góry tego pliku obowiązuje: żadnych zdjęć z banku, bo plaża udająca czyjś
     carruleddhu wprowadza w błąd, zamiast ilustrować.

     Wcześniej osiemnaście kafelków dzieliło między siebie PIĘĆ plików z galerii. Zmierzone:
     16 wczytanych obrazków, `distinctSources: 5`. Wszystko działało, a lista wyglądała jak
     jeden wóz powtórzony kilka razy — czyli nie dawała obejrzeć tego, po co się na nią patrzy.

     Teraz każdy wóz ma własny rysunek składany w `cartArt()`: inny kolor, inna buda, numer
     startowy na burcie. Rysunek, nie zdjęcie — nikt nie weźmie tego za fotografię, a
     osiemnaście kafelków wygląda jak osiemnaście różnych pojazdów.
   =========================================================================== */

/**
 * Rysunek jednego carruleddhu, składany z numeru startowego.
 * ---------------------------------------------------------------------------
 * Data URI, nie plik: osiemnaście plików w repozytorium po to, żeby obejrzeć siatkę, to
 * osiemnaście plików do utrzymania i osiemnaście żądań przy wejściu na stronę. SVG w adresie
 * jest częścią odpowiedzi, którą i tak trzeba wysłać.
 *
 * Kolor liczony z numeru startowego, nie losowany: ten sam wóz ma zawsze ten sam rysunek, więc
 * po przerysowaniu listy nic nie zmienia barwy, a zrzut ekranu da się porównać z poprzednim.
 * Krok 47 stopni na numer — liczba pierwsza względem 360, więc kolejne wozy nie wpadają w te
 * same odcienie.
 *
 * Napis DEMO na burcie jest częścią rysunku. Nie polega na tym, że stronę otwarto z `?demo=1`:
 * gdyby ten obrazek kiedykolwiek trafił do zrzutu ekranu w oderwaniu od strony, nadal mówi,
 * czym jest.
 */
function cartArt(startNumber, index) {
  const hue = (index * 47 + 18) % 360;
  const body = `hsl(${hue} 68% 52%)`;
  const dark = `hsl(${hue} 72% 32%)`;
  const sky = `hsl(${(hue + 186) % 360} 42% 88%)`;
  const number = String(startNumber).padStart(3, '0');

  /* Bez apostrofów i bez `#` w środku: pierwsze psują atrybut, drugie ucina adres na
     kotwicy. Kolory są zapisane przez hsl(), więc `#` nie występuje wcale. */
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
    <rect width="400" height="300" fill="${sky}"/>
    <path d="M0 232h400v68H0z" fill="${dark}" opacity=".18"/>
    <path d="M64 210h272l-26-58H90z" fill="${body}"/>
    <path d="M120 152h96l-10-40h-76z" fill="${dark}"/>
    <rect x="150" y="120" width="36" height="24" rx="4" fill="${sky}" opacity=".85"/>
    <circle cx="118" cy="222" r="30" fill="${dark}"/>
    <circle cx="118" cy="222" r="12" fill="${sky}"/>
    <circle cx="290" cy="222" r="30" fill="${dark}"/>
    <circle cx="290" cy="222" r="12" fill="${sky}"/>
    <text x="200" y="196" fill="#ffffff" font-family="system-ui, sans-serif" font-size="42"
          font-weight="800" text-anchor="middle">${number}</text>
    <text x="376" y="286" fill="${dark}" font-family="system-ui, sans-serif" font-size="19"
          font-weight="800" letter-spacing="3" text-anchor="end" opacity=".75">DEMO</text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

/**
 * Dwudziestu uczestników, nie sześciu.
 * ---------------------------------------------------------------------------
 * Sześciu wystarczało, dopóki siatka mieściła się na jednym ekranie. Podstrona głosowania
 * dokłada dwie rzeczy, których na sześciu kafelkach nie da się ani zobaczyć, ani zmierzyć:
 * układ dwukolumnowy i doczytywanie porcjami. Przy sześciu pierwsza porcja jest całą listą,
 * więc „doczytuje kolejne" wyglądałoby na działające także wtedy, gdyby nie działało.
 *
 * Pierwszych szóstka zostaje bez zmian — na niej opierają się pomiary podium i remisu.
 */
const RAW_PARTICIPANTS = [
  { startNumber: 7, category: 'classic', firstName: 'Salvatore', lastName: 'Mannu',
    projectName: 'Fulmine di Gallura', photo: '/assets/images/gallery-race.svg', votes: 34, average: 8.94 },
  { startNumber: 12, category: 'classic', firstName: 'Giulia', lastName: 'Deiana',
    projectName: 'Rena Bianca', photo: '/assets/images/gallery-start.svg', votes: 41, average: 9.12 },
  { startNumber: 18, category: 'classic', firstName: 'Piero', lastName: 'Sanna',
    projectName: '', photo: '', votes: 12, average: 7.25 },
  { startNumber: 23, category: 'art', firstName: 'Elena', lastName: 'Corda',
    projectName: 'Tonno Volante', photo: '/assets/images/gallery-craft.svg', votes: 38, average: 9.47 },
  { startNumber: 31, category: 'art', firstName: 'Nicolò', lastName: 'Pinna',
    projectName: 'Nuraghe Express', photo: '/assets/images/gallery-finish.svg', votes: 27, average: 8.11 },
  { startNumber: 44, category: 'art', firstName: 'Marta', lastName: 'Bua',
    projectName: 'Sirena a Pedali', photo: '/assets/images/gallery-crowd.svg', votes: 19, average: 8.63 },
  { startNumber: 51, category: 'classic', firstName: 'Antonio', lastName: 'Muzzu',
    projectName: 'Vento di Levante', photo: '/assets/images/gallery-race.svg', votes: 22, average: 8.05 },
  { startNumber: 58, category: 'classic', firstName: 'Chiara', lastName: 'Ledda',
    projectName: 'Lampo Rosso', photo: '/assets/images/gallery-start.svg', votes: 31, average: 8.77 },
  { startNumber: 63, category: 'art', firstName: 'Gavino', lastName: 'Serra',
    projectName: 'Mirto in Corsa', photo: '/assets/images/gallery-craft.svg', votes: 17, average: 7.88 },
  { startNumber: 69, category: 'art', firstName: 'Ilaria', lastName: 'Pes',
    projectName: 'Stella di Gallura', photo: '/assets/images/gallery-crowd.svg', votes: 26, average: 9.04 },
  { startNumber: 74, category: 'classic', firstName: 'Bachisio', lastName: 'Ruiu',
    projectName: 'Sughero Volante', photo: '/assets/images/gallery-finish.svg', votes: 14, average: 7.42 },
  { startNumber: 80, category: 'art', firstName: 'Federica', lastName: 'Casu',
    projectName: '', photo: '/assets/images/gallery-race.svg', votes: 20, average: 8.31 },
  { startNumber: 86, category: 'classic', firstName: 'Michele', lastName: 'Fadda',
    projectName: 'Tramontana', photo: '', votes: 24, average: 8.19 },
  { startNumber: 91, category: 'art', firstName: 'Rosanna', lastName: 'Tola',
    projectName: 'Coralla', photo: '/assets/images/gallery-start.svg', votes: 29, average: 8.92 },
  { startNumber: 95, category: 'classic', firstName: 'Efisio', lastName: 'Loi',
    projectName: 'Bandiera Gialla', photo: '/assets/images/gallery-crowd.svg', votes: 15, average: 7.63 },
  { startNumber: 102, category: 'art', firstName: 'Valentina', lastName: 'Sechi',
    projectName: 'Luna di Capo Testa', photo: '/assets/images/gallery-craft.svg', votes: 33, average: 9.21 },
  { startNumber: 108, category: 'classic', firstName: 'Giovanni', lastName: 'Addis',
    projectName: 'Maestrale', photo: '/assets/images/gallery-finish.svg', votes: 18, average: 7.96 },
  { startNumber: 113, category: 'art', firstName: 'Sara', lastName: 'Demuru',
    projectName: 'Ginepro Blu', photo: '/assets/images/gallery-race.svg', votes: 21, average: 8.48 },
  /* Dwie pary z tym samym imieniem — bez nich nie da sie zobaczyc plakietki, ktora dokłada
     nazwisko (nameBadges w voting-page.js), a to jest przypadek normalny w wiosce, gdzie
     polowa startujacych to kuzyni.

     Salvatore Mannu (007) i Salvatore Pinna: pierwsze litery nazwisk sa rozne, wiec wystarcza
     jedna — „Salvatore M." i „Salvatore P.".
     Giulia Deiana (012) i Giulia Demuru: „D" i „De" sa wspolne, wiec przedrostek musi urosnac
     do trzech liter — „Giulia Dei." i „Giulia Dem.". To ten drugi przypadek jest powodem, dla
     ktorego przedrostek nie moze byc na sztywno jednoliterowy. */
  { startNumber: 121, category: 'classic', firstName: 'Salvatore', lastName: 'Pinna',
    projectName: 'Punta Falcone', photo: '', votes: 11, average: 7.1 },
  { startNumber: 128, category: 'art', firstName: 'Giulia', lastName: 'Demuru',
    projectName: 'Barca a Rotelle', photo: '', votes: 13, average: 7.4 }
];

/**
 * Sześciu uczestników w dwóch kategoriach, dobranych po to, żeby zmęczyć układ, a nie mu
 * pochlebić: jeden bez zdjęcia, jeden bez nazwy pojazdu, nazwisko z akcentem, liczba głosów
 * od dwunastu do czterdziestu jeden i dwie średnie różniące się o setne.
 *
 * Po przejściu na sumę punktów ta sama lista sprawdza dwie rzeczy naraz. Najwyższa średnia
 * (Tonno Volante, 9.47 z 38 głosów) NIE wygrywa — bierze ją Rena Bianca, 9.12 z 41 głosów, czyli
 * 374 punkty przeciw 360. A dwa wozy schodzą się na 304 punktach co do jednego (34 × 8.94 i
 * 33 × 9.21), więc remis rozstrzyga liczba głosów i widać, że dogrywka w ogóle działa.
 */
export function demoParticipants(withScores) {
  return RAW_PARTICIPANTS.map((row, index) => ({
    id: `demo-participant-${index}`,
    category: row.category,
    startNumber: row.startNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    projectName: row.projectName,
    /* Własny rysunek na każdy wóz — patrz cartArt wyżej. Pole `photo` w tablicy powyżej jest
       od teraz TYLKO znacznikiem „ten wóz ma zdjęcie": dwa wozy mają je puste z rozmysłu, żeby
       kafelek bez zdjęcia też był widoczny w siatce i żeby dało się sprawdzić, że nie rozjeżdża
       układu. Ścieżka, która tam stoi, nie jest już nigdzie wczytywana. */
    photo: row.photo ? cartArt(row.startNumber, index) : '',
    // Przed zamknięciem średnie nie wychodzą publicznie — tak samo jak z prawdziwego Workera.
    voteCount: withScores ? row.votes : 0,
    averageScore: withScores ? row.average : 0,
    /* Suma, tak jak liczy ją widok w bazie: tam to `sum(score)` po całkowitych ocenach, więc i
       tu musi być liczbą całkowitą. Bez zaokrąglenia 34 × 8.94 dałoby 303.96, a 33 × 9.21
       303.93 — remis, który miał pokazać dogrywkę, rozjechałby się o trzy setne. */
    totalScore: withScores ? Math.round(row.votes * row.average) : 0,
    demo: true
  }));
}

/**
 * Odpowiedź, którą dałby Worker w danej fazie.
 *
 * Ten sam kształt, te same nazwy pól i ta sama reguła: podium wychodzi wyłącznie po
 * zamknięciu, a kolejność jest po sumie punktów, przy remisie po liczbie głosów, na końcu po
 * średniej. Kształt inny niż prawdziwy dawałby przegląd projektu, który wygląda dobrze i nie
 * odpowiada niczemu.
 */
/**
 * Dwunastu zwycięzców kategorii jury — z trzema kategoriami PUSTYMI z rozmysłu.
 * ===========================================================================
 *
 * Puste są 07, 10 i 12. Nie dlatego, że brakuje danych: bez nich nie da się zobaczyć drugiego
 * z dwóch stanów wiersza, a to on jest tu treścią. Kategoria bez zwycięzcy NIE ZNIKA — dostaje
 * przerywaną obwódkę i zdanie „jeszcze nie ogłoszono". Znikająca kategoria mówiłaby „tej
 * nagrody nie ma", a strona główna obiecuje dwanaście.
 *
 * KSZTAŁT `prizes`, NIE `awards`, I TO JEST CELOWE
 *   Publiczny odczyt niesie to pole pod dwiema nazwami, zależnie od tego, jak stara jest
 *   wdrożona funkcja (powód w całości przy `normalizeAwards` w voting-core.js). Demo podaje tę
 *   nazwę, której strona NIE używa u siebie wewnętrznie — więc każde uruchomienie z `?demo=1`
 *   sprawdza po drodze, że tłumaczenie jednego kształtu na drugi naprawdę działa. Demo
 *   podające wygodny kształt potwierdzałoby tylko samo siebie.
 *
 * `note` to wynik kategorii: czas przejazdu, wymiar, wiek. Trzy różne rodzaje z rozmysłu —
 * kolumna z wynikiem musi zmieścić i „31.44 s", i „2,10 m", i „9 lat".
 */
const DEMO_PRIZES = [
  { prizeKey: 'prize-1', startNumber: 7, projectName: 'Rena Bianca', riderName: 'Salvatore Mannu', note: '31.44 s' },
  { prizeKey: 'prize-2', startNumber: 102, projectName: 'Luna di Capo Testa', riderName: 'Valentina Sechi', note: '33.02 s' },
  { prizeKey: 'prize-3', startNumber: 41, projectName: 'Tonno Volante', riderName: 'Marta Cossu', note: '' },
  { prizeKey: 'prize-4', startNumber: 12, projectName: 'Bomboniera', riderName: 'Giulia Deiana', note: '2,10 m' },
  { prizeKey: 'prize-5', startNumber: 128, projectName: 'Barca a Rotelle', riderName: 'Giulia Demuru', note: '' },
  { prizeKey: 'prize-6', startNumber: 113, projectName: 'Ginepro Blu', riderName: 'Sara Demuru', note: '' },
  { prizeKey: 'prize-8', startNumber: 121, projectName: 'Punta Falcone', riderName: 'Salvatore Pinna', note: '9 lat' },
  { prizeKey: 'prize-9', startNumber: 108, projectName: 'Maestrale', riderName: 'Giovanni Addis', note: '71 lat' },
  { prizeKey: 'prize-11', startNumber: 55, projectName: 'Lentissimo', riderName: 'Antonio Serra', note: '1:12.90' }
];

/**
 * Roczniki: bieżący i dwa zarchiwizowane, różniące się TYM, CO O NICH WIEMY.
 *
 * 2025 ma `attendeeCount`, więc podsumowanie mówi „Było nas wtedy 1840 osób na zjeździe".
 * 2024 nie ma go wcale — i to jest przypadek, dla którego ten wiersz tu stoi: rocznik bez
 * zapisanej liczby widowni NIE MOŻE pokazać zera. Zero znaczy „nikt nie przyszedł", a prawda
 * jest inna: nikt nie policzył. Wtedy zdanie zmienia się razem z liczbą i mówi, ile było
 * zapisanych wozów, bo to jedyna liczba, którą naprawdę mamy.
 */
const DEMO_EDITIONS = [
  { key: '2026', name: 'Carruleddhi Show 2026', date: '2026-10-17', location: 'Santa Teresa Gallura', status: 'open', participantCount: 8, voteCount: 0 },
  { key: '2025', name: 'Carruleddhi Show 2025', date: '2025-10-18', location: 'Santa Teresa Gallura', status: 'archived', participantCount: 22, voteCount: 1640, attendeeCount: 1840 },
  { key: '2024', name: 'Carruleddhi Show 2024', date: '2024-10-19', location: 'Santa Teresa Gallura', status: 'archived', participantCount: 17, voteCount: 980 }
];

/**
 * ODPOWIEDŹ BEZ POLA `prizes` — czyli „wdrożony Worker jest starszy od strony".
 * ===========================================================================
 *
 * Statyczne pliki i funkcja Workera idą na produkcję OSOBNO, więc przez kilka minut po każdym
 * wypchnięciu strona rozmawia z wersją, która o dwunastu nagrodach jeszcze nie wie. Wymaganie
 * jest wtedy jasne: cała lista ma się po prostu nie pokazać, bez ani jednego błędu w konsoli.
 *
 * DLACZEGO PARAMETR W ADRESIE, A NIE „TO SIĘ NIE STANIE"
 *   To jest jedyny stan tej sekcji, którego nie da się zobaczyć ani wywołać z ekranu — a
 *   jednocześnie jedyny, w którym poprawka bywa cicha: brak pola i pole puste dawały do tej
 *   pory ten sam wynik na ekranie. Bez tego przełącznika ani człowiek, ani sonda nie miały jak
 *   sprawdzić, że rozróżnienie naprawdę działa; sprawdzało się je czytaniem kodu, który się
 *   właśnie zmienia.
 *
 *   Dostępne wyłącznie razem z `?demo=1`, czyli tam, gdzie i tak nic nie jest prawdziwe.
 */
function noPrizeField() {
  return new URLSearchParams(window.location.search).get('noPrizes') === '1';
}

export function demoVotingState(phase = 'scheduled', edition = '') {
  const closed = phase === 'closed';
  const participants = demoParticipants(closed);
  const now = Date.now();

  /* WEJŚCIE W ROCZNIK ARCHIWALNY. Odpowiedź ma inny kształt niż bieżąca edycja i tak samo
     zachowuje się prawdziwy Worker: podium i stawka są ZAPISANE, więc przychodzą niezależnie od
     fazy, a `isArchive` mówi stronie, że patrzy na zapis, nie na wynik na żywo.

     Rocznik 2024 dostaje `prizes: []` — nagrody jury nie zostały wtedy zapisane. To nie to samo
     co brak zwycięzcy w jednej kategorii: tam nic nie ma, więc dwanaście wierszy „jeszcze nie
     ogłoszono" byłoby nieprawdą o wyniku, który dawno ogłoszono. Strona pokazuje wtedy jedno
     zdanie — i bez tego wiersza w demo nie dałoby się tego zobaczyć. */
  const archived = DEMO_EDITIONS.find((row) => row.key === edition && row.status === 'archived');
  if (archived) {
    const scored = demoParticipants(true);
    return {
      ok: true,
      demo: true,
      phase: 'closed',
      isArchive: true,
      selectedEdition: archived,
      editions: DEMO_EDITIONS,
      participants: scored,
      podium: [...scored]
        .sort((a, b) =>
          b.totalScore - a.totalScore ||
          b.voteCount - a.voteCount ||
          b.averageScore - a.averageScore)
        .slice(0, 3),
      ...(noPrizeField() ? {} : { prizes: archived.key === '2024' ? [] : DEMO_PRIZES }),
      myVotes: []
    };
  }

  return {
    ok: true,
    demo: true,
    phase,
    // Odliczanie ma coś odliczać: minuta do startu w fazie pierwszej.
    raceStartsAt: new Date(phase === 'scheduled' ? now + 60000 : now - 300000).toISOString(),
    votingEndsAt: new Date(closed ? now - 60000 : now + 15 * 60000).toISOString(),
    durationMinutes: 20,
    scoreMin: 3,
    scoreMax: 10,
    /* Kategorie POJAZDÓW, nie kategorie głosowania: głos jest jeden, w nagrodzie publiczności.
       Służą do odsiania listy i do opisania wozu na kafelku. */
    categories: [...new Set(participants.map((row) => row.category))],
    participants,
    podium: closed
      ? [...participants]
        .sort((a, b) =>
          b.totalScore - a.totalScore ||
          b.voteCount - a.voteCount ||
          b.averageScore - a.averageScore)
        .slice(0, 3)
      : [],
    /* Zwycięzcy kategorii jury wychodzą razem z podium — dopiero po zamknięciu. Przed nim
       lista dwunastu nagród nie ma się pokazać wcale, bo nie ma czego ogłaszać.

       `?demo=1&noPrizes=1` OMIJA TO POLE CAŁKOWICIE — patrz `noPrizeField` wyżej. */
    ...(noPrizeField() ? {} : { prizes: closed ? DEMO_PRIZES : [] }),
    /* Lista roczników jest niezależna od fazy: poprzednie edycje są zamknięte także wtedy, gdy
       bieżące głosowanie dopiero czeka na start. */
    editions: DEMO_EDITIONS,
    selectedEdition: DEMO_EDITIONS[0],
    // Nikt nie zagłosował z tej przeglądarki, więc kafelki są klikalne i da się oddać głos.
    myVotes: []
  };
}
