/**
 * Otwarta faza głosowania BEZ trybu demo — czyli tą samą drogą, którą chodzi telefon na placu.
 * ===========================================================================
 *
 * Wstrzykiwane przez `cdp.mjs --inject`, więc PRZED skryptami strony: `voting-core.js` czyta
 * `window.fetch` przy pierwszym odczycie stanu i podmiana po starcie byłaby już spóźniona.
 *
 * DLACZEGO NIE `?demo=1`
 *   `demo=1` zawraca `readState` na `demoVotingState` i ustawia `demoDriven`, a to zmienia
 *   PÓŹNIEJSZE zachowanie strony: nie ma odpytywania co trzydzieści sekund, wysyłka głosu nie
 *   idzie przez sieć, a zmiana głosu zapisuje się lokalnie. Usterki „na telefonie nie da się
 *   zagłosować" nie da się w tym trybie zobaczyć, bo połowa ścieżki nie jest w nim wykonywana.
 *   Tutaj strona nie wie, że jest badana: dostaje zwykłą odpowiedź spod
 *   `/api/carruleddhi/voting`, w kształcie, w którym wysyła ją Worker.
 *
 * ODPOWIEDŹ ROŚNIE MIĘDZY ODCZYTAMI
 *   Liczba głosów przy każdym uczestniku idzie w górę z każdym odczytem, dokładnie tak jak
 *   w dniu zjazdu, kiedy głosuje kilkuset ludzi naraz. To nie ozdoba: `paintGrid` porównuje
 *   ODCISK kafelka (wynik, plakietka, mój głos) i przy każdej zmianie buduje kafelek OD NOWA.
 *   Bez rosnących liczb sonda nigdy nie zobaczyłaby kafelka przebudowanego pod palcem.
 */
(() => {
  const PHOTOS = [
    '/assets/images/gallery-start.svg',
    '/assets/images/gallery-race.svg',
    '/assets/images/gallery-craft.svg',
    '/assets/images/gallery-crowd.svg',
    '/assets/images/gallery-finish.svg'
  ];
  const NAMES = [
    ['Marco', 'Rossi', 'Fulmine di Gallura', 'classic'],
    ['Chiara', 'Satta', 'Rena Bianca', 'art'],
    ['Antonio', 'Piras', 'Tonno Volante', 'classic'],
    ['Valentina', 'Sechi', 'Luna di Capo Testa', 'art'],
    ['Giovanni', 'Addis', 'Maestrale', 'classic'],
    ['Sara', 'Demuru', 'Ginepro Blu', 'art'],
    ['Salvatore', 'Mannu', 'Tuono', 'classic'],
    ['Salvatore', 'Pinna', 'Punta Falcone', 'classic'],
    ['Giulia', 'Deiana', 'Stella', 'art'],
    ['Giulia', 'Demuru', 'Barca a Rotelle', 'art'],
    ['Luca', 'Verdi', 'Scirocco', 'classic'],
    ['Nino', 'Careddu', 'Bombarda', 'art'],
    ['Elena', 'Sanna', 'Vento', 'classic'],
    ['Paolo', 'Casu', 'Girandola', 'art']
  ];

  /** Ile razy strona już odpytała. Głosy rosną z każdym odczytem — patrz nagłówek pliku. */
  let reads = 0;
  /** Głos oddany z tej przeglądarki, tak jak trzyma go baza: jeden na urządzenie. */
  let myVote = null;

  const participants = () => NAMES.map(([firstName, lastName, projectName, category], index) => ({
    id: `p-${String(index + 1).padStart(2, '0')}`,
    category,
    startNumber: 7 + index * 3,
    firstName,
    lastName,
    projectName,
    /* Dwa wozy bez zdjęcia, tak jak w prawdziwej stawce: kafelek dostaje wtedy rysowany awatar
       i musi zachowywać się dokładnie tak samo pod palcem. */
    photo: index === 6 || index === 9 ? '' : PHOTOS[index % PHOTOS.length],
    voteCount: 4 + index + reads * 2,
    averageScore: 7 + ((index * 7) % 30) / 10,
    totalScore: (4 + index + reads * 2) * 8,
    active: true
  }));

  const state = () => ({
    ok: true,
    /* BEZ `demo: true`. Ta jedna właściwość przestawia stronę na tryb pokazowy i wyłącza
       odpytywanie oraz prawdziwą wysyłkę — czyli dokładnie to, co ma tu być mierzone. */
    phase: 'voting',
    raceStartsAt: new Date(Date.now() - 5 * 60000).toISOString(),
    votingEndsAt: new Date(Date.now() + 18 * 60000).toISOString(),
    durationMinutes: 20,
    scoreMin: 3,
    scoreMax: 10,
    categories: ['classic', 'art'],
    participants: participants(),
    podium: [],
    myVotes: myVote ? [myVote] : []
  });

  window.__sent = [];
  const realFetch = window.fetch.bind(window);

  window.fetch = async (url, options = {}) => {
    const path = String(url && url.url ? url.url : url);
    if (!path.includes('/api/carruleddhi/voting')) return realFetch(url, options);

    let body = {};
    try { body = JSON.parse(options.body || '{}'); } catch (_) { /* nieważne dla zaślepki */ }
    window.__sent.push({ action: body.action, participantId: body.participantId, score: body.score });

    const reply = (data) => new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

    if (body.action === 'state') {
      reads += 1;
      return reply(state());
    }
    if (body.action === 'vote' || body.action === 'edit') {
      /* Serwer oddaje głos razem z prawem do JEDNEJ zmiany — `canChange` zależy od tego, czy
         głos jest podpisany adresem (patrz `votingEdit` w worker/index.js). Zaślepka musi to
         zwracać, bo od tego zależy, czy kafelki dalej mają w co dotknąć. */
      const identified = Boolean(body.email) || body.action === 'edit';
      myVote = {
        participantId: body.participantId,
        score: Number(body.score),
        identified,
        editsLeft: body.action === 'edit' ? 0 : 1,
        canChange: body.action === 'edit' ? false : identified
      };
      return reply({ ok: true, anonymous: !identified, mailed: identified });
    }
    return reply({ ok: true });
  };
})();
