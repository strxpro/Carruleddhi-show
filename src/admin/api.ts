/**
 * Everything the panel asks the server for.
 *
 * One file, because every call shares the same three properties: it is a POST to
 * /api/carruleddhi/<type>, it carries the passphrase in a header, and a 401 means the
 * passphrase is wrong rather than that the request was malformed. Spreading that across
 * components is how one of them ends up forgetting the header.
 *
 * The passphrase is ROSTER_KEY, checked in the Vercel function. It never reaches
 * Supabase — the function holds the service key and the browser never sees it.
 */

const ROSTER_HEADER = 'X-Carruleddhi-Roster-Key';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

async function call<T>(path: string, key: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/carruleddhi/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [ROSTER_HEADER]: key },
    body: JSON.stringify(body),
    credentials: 'omit'
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const code = typeof payload.code === 'string' ? payload.code : undefined;
    throw new ApiError(
      code ?? `HTTP ${response.status}`,
      response.status,
      code
    );
  }
  return payload as T;
}

/* ------------------------------------------------------------------ types */

export interface InboxCounts {
  registrations: number;
  contacts: number;
  reminders: number;
  newsletter: number;
  wall: number;
  chats: number;
  /**
   * Zgłoszenia sponsorów czekające na decyzję. OPCJONALNE, i to jest cała treść tego pola.
   *
   * Końcówka `inbox` liczy dziś sześć rzeczy i o sponsorach nie wie — sprawdzone w
   * `worker/index.js`. Dopisanie siódmego licznika jest zmianą W WORKERZE, a ten ekran jej nie
   * robi. Pole jest tu, żeby plakietka w nawigacji zapaliła się sama w dniu, w którym Worker
   * zacznie tę liczbę oddawać, bez ani jednej poprawki w panelu.
   *
   * Dlatego opcjonalne, a nie `number` z zerem: zero znaczyłoby „sprawdziliśmy, nikt nie
   * czeka", a prawdą jest „nie pytaliśmy". Plakietka rysuje się tylko dla wartości prawdziwej
   * (`item.badge ? …` w `dashboard-sidebar.tsx`), więc `undefined` to po prostu brak plakietki.
   */
  sponsors?: number;
}

/** One thing that happened, for the bell's list. `kind` matches a key of InboxCounts. */
export interface InboxItem {
  kind: keyof InboxCounts;
  id: string;
  at: string;
  title: string;
  detail: string;
}

/** Whether the chat's model is wired up. Never carries the key itself. */
export interface AiStatus {
  configured: boolean;
  url: string;
  model: string;
  keyFrom: string;
}

export interface Inbox {
  ok: true;
  since: string;
  counts: InboxCounts;
  total: number;
  /** Only present when the bell asked for it — the ten-second poll does not. */
  items?: InboxItem[];
  ai?: AiStatus;
}

/** A guardian block travels with a minor's entry and is null on an adult one. */
export interface RosterGuardian {
  childKind: string;
  relation: string;
  name: string;
  email: string;
  phone: string;
  motherName: string;
  fatherName: string;
  consent: boolean;
}

export interface RosterRow {
  id: string;
  createdAt: string;
  raceNumber: string | null;
  firstName: string;
  lastName: string;
  birthDate: string;
  postalCode: string;
  email: string;
  phone: string;
  address: string;
  cartName: string;
  category: string;
  teamName: string;
  cartNotes: string;
  locale: string;
  status: string;
  emailStatus: string;
  printedAt: string | null;
  /** Non-null when the rider corrected something themselves through the site. */
  selfUpdatedAt: string | null;
  /** Riders sharing this e-mail address. More than one means a family entry. */
  emailGroupSize: number;
  isMinor: boolean;
  riderAge: number | null;
  guardian: RosterGuardian | null;
}

/** The fields the organiser may change. Deliberately not `email` — see ROSTER_EDITABLE. */
export interface RosterEdit {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  postalCode?: string;
  phone?: string;
  address?: string;
  cartName?: string;
  teamName?: string;
  cartNotes?: string;
  category?: string;
  raceNumber?: string;
  status?: string;
}

export interface Subscriber {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  locale: string;
  status: string;
  lastReminder: string | null;
  source: string | null;
}

export interface WallComment {
  id: string;
  createdAt: string;
  name: string;
  place: string;
  message: string;
  locale: string;
  rating: number | null;
  approved: boolean;
  photo: string;
}

export interface ChatThread {
  id: string;
  createdAt: string;
  lastAt: string;
  name: string;
  email: string;
  locale: string;
  mode: 'ai' | 'human' | 'closed';
  unread: number;
}

export interface ChatMessage {
  id: string;
  at: string;
  author: 'visitor' | 'ai' | 'organiser';
  body: string;
}

/* ------------------------------------------------------------------ calls */

/**
 * Checks a passphrase.
 *
 * Uses the inbox counts because it is the cheapest protected call there is — one
 * indexed count per table and no rows come back. A dedicated "verify" endpoint would be
 * a second thing to keep in step for no gain.
 */
/* ------------------------------------------------------------- statystyki
   Jedno wywolanie na caly ekran. Ksztalt odpowiada funkcji `site_stats` w bazie
   (migracja 0033) — osiem agregatow policzonych jednym zapytaniem, zeby wykresy pod soba
   nie mogly pochodzic z roznych okien czasowych. */
export interface StatsBucket { at: string; views: number; visitors: number }
export interface StatsSource { source: string; views: number; visitors: number }
export interface StatsCampaign {
  campaign: string; source: string; medium: string | null; views: number; visitors: number;
}
export interface SiteStats {
  windowHours: number;
  generatedAt: string;
  live: number;
  liveMinutes: number;
  totals: { views: number; visitors: number; sessions: number };
  previous: { views: number; visitors: number };
  sources: StatsSource[];
  campaigns: StatsCampaign[];
  pages: { path: string; views: number }[];
  countries: { country: string; views: number }[];
  devices: { device: string; views: number }[];
  series: StatsBucket[];
  seriesStep: 'hour' | 'day';
  signups: { source: string; count: number }[];
  signupTotal: number;
}

/**
 * Wypelnione formularze jako JEDEN plik PDF, gotowy do druku.
 * ---------------------------------------------------------------------------
 * Nie przez `call()` i nie przez `/api/carruleddhi/...`: tamta droga wraca JSON-em przez
 * runtime Edge, a tu wraca kilkaset kilobajtow pliku sklejanego przez pdf-lib — dlatego
 * osobna funkcja `api/forms-bundle.js` na Node. Naglowek z haslem jest ten sam.
 *
 * Pusta lista `ids` znaczy „wszyscy zapisani": tak dziala przycisk nad tabela.
 */
export async function fetchFormsBundle(key: string, ids: string[]): Promise<Blob> {
  const response = await fetch('/api/forms-bundle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [ROSTER_HEADER]: key },
    body: JSON.stringify(ids.length ? { ids } : { all: true })
  });
  if (!response.ok) {
    let code = `HTTP ${response.status}`;
    try { code = (await response.json())?.code || code; } catch { /* nie JSON, zostaje status */ }
    throw new Error(code);
  }
  return response.blob();
}

export const fetchStats = (key: string, hours: number) =>
  call<{ ok: true; stats: SiteStats }>('stats', key, { hours });

export const verifyKey = (key: string) => call<Inbox>('inbox', key, { action: 'counts' });

export const fetchInbox = (key: string) => call<Inbox>('inbox', key, { action: 'counts' });
export const markInboxSeen = (key: string) => call<{ ok: true }>('inbox', key, { action: 'seen' });

/** Counts plus the twenty most recent things themselves. Asked for when the bell is opened. */
export const fetchInboxItems = (key: string) => call<Inbox>('inbox', key, { action: 'list' });

/* --------------------------------------------------------------- the roster
   `roster` had no handler on the server until now: the request cleared the passphrase check
   and went to the Make webhook, which answers "Accepted" and no rows — so this screen has
   always drawn "nobody has signed up yet". The action is sent explicitly from here, because
   the endpoint now does four different things. */
export const fetchRoster = (key: string, limit = 500) =>
  call<{ ok: true; rows?: RosterRow[] }>('roster', key, { action: 'list', limit });

export const updateRegistration = (key: string, id: string, changes: RosterEdit) =>
  call<{ ok: true; row: RosterRow | null }>('roster', key, { action: 'update', id, ...changes });

export const deleteRegistration = (key: string, id: string) =>
  call<{ ok: true; deleted: true }>('roster', key, { action: 'delete', id });

/* ------------------------------------------------------- subscription lists */

export const fetchSubscribers = (key: string, list: 'reminders' | 'newsletter', limit = 300) =>
  call<{ ok: true; list: string; rows: Subscriber[] }>('subscribers', key, { action: 'list', list, limit });

export const setSubscriberStatus = (
  key: string,
  list: 'reminders' | 'newsletter',
  id: string,
  action: 'unsubscribe' | 'resubscribe' | 'delete'
) => call<{ ok: true }>('subscribers', key, { action, list, id });

export const fetchWall = (key: string, limit = 60) =>
  call<{ ok: true; comments: WallComment[] }>('wall', key, { type: 'wall-admin', action: 'list', limit });

export const moderateWall = (key: string, id: string, action: 'approve' | 'hide' | 'delete') =>
  call<{ ok: true }>('wall', key, { type: 'wall-admin', action, id });

export const fetchThreads = (key: string, limit = 60) =>
  call<{ ok: true; threads: ChatThread[] }>('chat-admin', key, { action: 'list', limit });

export const fetchThreadMessages = (key: string, threadId: string) =>
  call<{ ok: true; messages: ChatMessage[] }>('chat-admin', key, { action: 'messages', threadId });

export const replyToThread = (key: string, threadId: string, message: string) =>
  call<{ ok: true }>('chat-admin', key, { action: 'reply', threadId, message });

/**
 * Tells the visitor somebody is writing.
 *
 * Fire and forget: the caller does not await it and does not care if it fails. A lost
 * keystroke ping costs one cycle of dots not appearing, and an error path for that would be
 * more code than the feature.
 */
export const pingTyping = (key: string, threadId: string) =>
  call<{ ok: true }>('chat-admin', key, { action: 'typing', threadId }).catch(() => {});

export const setThreadMode = (key: string, threadId: string, mode: ChatThread['mode']) =>
  call<{ ok: true; mode: string }>('chat-admin', key, { action: 'mode', threadId, mode });

/* ---------------------------------------------------------------- settings */

export interface Sponsor {
  name: string;
  url: string;
  /** A path in the bucket when saving, a signed URL when reading. See the function. */
  logo: string;
}

export interface SiteSettings {
  siteLocked: boolean;
  sponsors: Sponsor[];
  showGallery: boolean;
  showWall: boolean;
  showPrizes: boolean;
  showCounters: boolean;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  /** Stable local or bucket paths saved in site_settings. */
  galleryImages: string[];
  galleryCaptions: string[];
  /** Fresh signed URLs used only by the admin preview; never saved back. */
  galleryPreviewUrls: string[];
  announcementEventDate: string;
}

export const fetchSettings = (key: string) =>
  call<{ ok: true; settings: SiteSettings }>('settings-admin', key, {});

/**
 * Saves part of the settings.
 *
 * Partial on purpose: the server merges onto what is stored, so flipping one switch
 * sends one switch. Sending the whole object back would mean every save rewrites values
 * the panel may have read minutes ago.
 */
export const saveSettings = (key: string, settings: Partial<SiteSettings>) =>
  call<{ ok: true; settings: SiteSettings }>('settings-admin', key, { settings });

/** Uploads a logo and returns its bucket path plus a signed URL to preview it with. */
export const uploadSponsorLogo = (key: string, photo: string) =>
  call<{ ok: true; logo: string; url: string }>('settings-admin', key, { action: 'logo', photo });

export const uploadGalleryImage = (key: string, photo: string) =>
  call<{ ok: true; imagePath: string; url: string }>('settings-admin', key, { action: 'gallery', photo });

/* ------------------------------------------- zgłoszenia sponsorów z czatu

   TRZY AKCJE `settings-admin`, NAZWY PRZECZYTANE Z WORKERA
     `sponsor-leads` (odczyt listy), `sponsor-approve` i `sponsor-reject` — dokładnie te napisy
     rozpoznaje `settingsAdmin` w `worker/index.js`; każdy inny wraca jako
     `400 SETTINGS_UNKNOWN_ACTION`. Zgłoszenia leżą w tabeli `sponsor_submissions` (migracja
     0035) ze stanem `pending | approved | rejected`.

   ZATWIERDZENIE ZAPISUJE SPONSORA PO STRONIE WORKERA — I DLATEGO PANEL TEGO NIE ROBI
     `sponsorLeadApprove` czyta ustawienia, dopisuje wpis do `site_settings.sponsors`,
     przepuszcza CAŁĄ listę przez `cleanSettings` i tylko wtedy stawia status `approved`.
     W odpowiedzi oddaje nowe ustawienia w kształcie panelowym. Dopisanie sponsora także tutaj,
     przez `saveSettings`, dałoby DWA kafelki tej samej firmy na stronie — raz od Workera, raz
     od panelu. Zamiast tego widok wchłania `settings` z odpowiedzi, więc lista sponsorów
     odrysowuje się bez klikania „Zapisz" i bez drugiego żądania.

   DLACZEGO `submissions` I `counts` SĄ `unknown`
     Ten sam powód, co przy dwunastu nagrodach wyżej: to jest kształt Z DRUTU, a wdrożona
     funkcja może być starsza od tego panelu. Typ obiecujący tablicę zamienia taki rozjazd
     w `undefined.map(...)`, czyli biały ekran w zakładce, w której stoi też kłódka całej
     strony i termin zawodów. Kształt sprawdzają `normaliseSponsorLeads` i
     `normalisePendingCount` w `lib/sponsorLeads.ts`.

   CZEGO TU NIE MA
     Żadnej akcji „cofnij odrzucenie". Odrzucenie jest w tym kontrakcie nieodwracalne (Worker
     zna tylko trzy stany i nie ma drogi z `rejected` z powrotem), a widok pyta o potwierdzenie
     właśnie dlatego. Funkcja, która by je cofała, kazałaby traktować odrzucenie jak stan
     przełącznika, a to jest decyzja przekazana firmie mailem. */

/**
 * Zgłoszenia czekające na decyzję.
 *
 * `status` jedzie jawnie, choć to jedyna wartość, o jaką ta karta kiedykolwiek pyta: bez tego
 * pola Worker odpowiada `all`, czyli razem z archiwum — a wtedy karta „do zatwierdzenia"
 * pokazałaby zgłoszenia już odrzucone, z żywym guzikiem „Zatwierdź" obok. Filtr jest też
 * powtórzony w panelu, patrz `normaliseSponsorLeads`.
 */
export const fetchSponsorLeads = (key: string, limit = 50) =>
  call<{ ok: true; submissions?: unknown; counts?: unknown }>('settings-admin', key, {
    action: 'sponsor-leads',
    status: 'pending',
    limit
  });

/**
 * Zatwierdza zgłoszenie: sponsor wchodzi na listę, zgłoszenie dostaje `approved`.
 *
 * `settings` w odpowiedzi to CAŁE ustawienia po zmianie, w kształcie panelowym — panel je
 * wchłania, zamiast doczytywać osobnym żądaniem, żeby lista sponsorów na ekranie nie mogła
 * się rozjechać z tym, co naprawdę leży w bazie.
 *
 * `added: false` znaczy „ten sponsor już tam był" — Worker rozpoznaje powtórkę po ścieżce logo
 * albo po parze nazwa+adres i wtedy tylko przestawia status. To jest normalna odpowiedź na
 * drugie kliknięcie, nie awaria, i widok mówi o tym osobnym zdaniem.
 *
 * Oba pola opcjonalne, bo to kształt z drutu — patrz komentarz nad sekcją.
 */
export const approveSponsorLead = (key: string, id: string) =>
  call<{ ok: true; settings?: SiteSettings; added?: boolean }>('settings-admin', key, {
    action: 'sponsor-approve',
    id
  });

/**
 * Odrzuca zgłoszenie. Zmienia wyłącznie status — wiersz i logo zostają w bazie.
 *
 * Nieodwracalne z panelu, dlatego widok pyta „czy na pewno". Wiersz zostaje po to, żeby dało
 * się odpowiedzieć na „czy oni się już zgłaszali", które pada przy każdym telefonie od firmy
 * piszącej po pół roku.
 */
export const rejectSponsorLead = (key: string, id: string) =>
  call<{ ok: true }>('settings-admin', key, { action: 'sponsor-reject', id });

/** Archives the previous voting edition, prepares the saved date and arms its mailing. Safe to press twice. */
export const announceEdition = (key: string) =>
  call<{
    ok: true;
    queued: boolean;
    eventDate: string;
    edition: {
      rolledOver?: boolean;
      alreadyApplied?: boolean;
      archivedEditionKey?: string;
      activeEditionKey?: string;
      participantCount?: number;
      voteCount?: number;
    };
  }>('settings-admin', key, { action: 'announce' });

/* ------------------------------------------------------------------ voting

   The endpoint is `voting-admin`, behind the same passphrase as the roster. Note the two
   status-shaped fields it answers with: `phase` is worked out from the clock, `status` is
   what the organiser last declared. They disagree on purpose — see the view. */

export type VotingPhase = 'scheduled' | 'voting' | 'closed';

export interface VotingParticipant {
  id: string;
  category: string;
  startNumber: number;
  firstName: string;
  lastName: string;
  projectName: string;
  /** A signed URL, good for one read; empty when the participant has no picture. */
  photo: string;
  voteCount: number;
  averageScore: number;
  /** Suma punktów od publiczności. To ona ustawia klasyfikację i podium, nie średnia. */
  totalScore: number;
  /** Set when this participant was picked from the start list rather than typed in. */
  registrationId: string | null;
  /** The bucket path. What `save` wants back; `photo` above is only for showing. */
  imagePath: string;
  active: boolean;
}

export interface VotingState {
  ok: true;
  phase: VotingPhase;
  status: VotingPhase;
  raceStartsAt: string | null;
  votingEndsAt: string | null;
  durationMinutes: number;
  scoreMin: number;
  scoreMax: number;
  participants: VotingParticipant[];
  totalVotes: number;
}

/** What may be sent for one participant. Every field optional: an edit sends what changed. */
export interface ParticipantEdit {
  registrationId?: string;
  category?: string;
  startNumber?: string;
  firstName?: string;
  lastName?: string;
  projectName?: string;
  imagePath?: string;
  active?: boolean;
}

export interface VotingWinner {
  place: number;
  category: string;
  startNumber: number;
  projectName: string;
  participantName: string;
  averageScore: number;
  voteCount: number;
}

export const fetchVoting = (key: string) => call<VotingState>('voting-admin', key, { action: 'state' });

/**
 * Adds a participant, or edits one when `id` is given.
 *
 * Answers with the stored row in the database's own spelling — `start_number`, not
 * `startNumber` — unlike every other call here, which is why nothing reads it. The view
 * re-fetches the state instead, which also picks up the recalculated averages.
 */
export const saveParticipant = (key: string, id: string | null, changes: ParticipantEdit) =>
  call<{ ok: true }>('voting-admin', key, { action: 'save', ...(id ? { id } : {}), ...changes });

export const removeParticipant = (key: string, id: string) =>
  call<{ ok: true; removed: string }>('voting-admin', key, { action: 'remove', id });

/** Uploads the picture and hands back its bucket path. Saving the participant is separate. */
export const uploadParticipantPhoto = (key: string, photo: string) =>
  call<{ ok: true; imagePath: string; url: string }>('voting-admin', key, { action: 'photo', photo });

/* The four below all answer with the whole state, because each one changes the phase and the
   countdown along with it. One round trip rather than a write followed by a read. */

export const scheduleVoting = (key: string, raceStartsAt: string, durationMinutes: number) =>
  call<VotingState>('voting-admin', key, { action: 'schedule', raceStartsAt, durationMinutes });

export const openVoting = (key: string, durationMinutes: number) =>
  call<VotingState>('voting-admin', key, { action: 'open', durationMinutes });

export const closeVoting = (key: string) => call<VotingState>('voting-admin', key, { action: 'close' });

/**
 * Back to the countdown, using the saved event date as the single source of truth.
 *
 * After testing the schedule usually holds a rehearsal time or a manual close, and the
 * countdown in the hero then disagrees with the event date shown everywhere else. This
 * rewrites the start from `site_settings.eventDate` and clears the manual close.
 */
export const showCountdown = (key: string) =>
  call<VotingState>('voting-admin', key, { action: 'countdown' });

/** Removes votes only; candidates, photos and the schedule stay intact. */
export const clearVoting = (key: string) => call<VotingState>('voting-admin', key, { action: 'clear' });

/** Only answers once voting is closed; 409 VOTING_STILL_OPEN before that. */
export const mailWinners = (key: string) =>
  call<{
    ok: true;
    sent: VotingWinner[];
    unreachable: VotingWinner[];
    podium: number;
    notifiedVoters: number;
    failedVoterNotifications: number;
  }>(
    'voting-admin',
    key,
    { action: 'winners' }
  );

/* ------------------------------------------------ dwanaście nagród jury

   DLACZEGO OSOBNA PARA WYWOŁAŃ, A NIE POLE W `state`
     `voting-admin` z `{ action: 'state' }` oddaje ŻYWE tabele głosowania: fazę, uczestników
     i sumę głosów. Nagrody jury to inna decyzja i inny moment — zapada po zawodach, przy
     stoliku, i zmienia się pojedynczo. Dopisanie dwunastu przypisań do odpowiedzi `state`
     znaczyłoby, że odpytywanie co piętnaście sekund w trakcie głosowania ciągnie także je,
     a każde przypisanie nagrody wymagałoby przeliczenia całej klasyfikacji.

   KONTRAKT
     odczyt: `{ action: 'prizes' }`  → dwanaście pozycji, także te bez zwycięzcy (puste pola);
     zapis:  `{ action: 'prize-set', prizeKey, participantId?, winnerLabel?, note? }`,
             gdzie puste `participantId` RAZEM z pustym `winnerLabel` znaczy „wyczyść".

   Końcówka jest pisana równolegle w Workerze, więc `prizes` jest tu `unknown`, a nie
   `PrizeAssignment[]`. To nie jest ostrożność na wyrost: gdyby typ obiecywał tablicę,
   pierwsze wdrożenie panelu przed Workerem skończyłoby się `undefined.map(...)` i białym
   ekranem w dniu wręczania nagród. Kształt sprawdza `normalisePrizes` w `lib/awards.ts` i
   dopiero on oddaje dane albo `null` znaczące „nie udało się odczytać". */

/** Jedna z dwunastu nagród. Pozycja bez zwycięzcy ma puste napisy i `startNumber` równe 0. */
export interface PrizeAssignment {
  /** `prize-1` … `prize-12`. Ten sam klucz, który przyjmuje `prize-set`. */
  prizeKey: string;
  /** Identyfikator uczestnika z listy startowej albo pusto, gdy zwycięzca wpisany z ręki. */
  participantId: string;
  /** Nazwa zwycięzcy wpisana z ręki albo pusto, gdy wybrany z listy startowej. */
  winnerLabel: string;
  /** Wynik albo uwaga jury. Zawsze wolna, także przy zwycięzcy z listy. */
  note: string;
  startNumber: number;
  projectName: string;
  riderName: string;
}

/** Surowa odpowiedź odczytu. `prizes` nieznanego kształtu — patrz komentarz nad sekcją. */
export interface PrizeListResponse {
  ok: true;
  prizes?: unknown;
}

export const fetchPrizes = (key: string) =>
  call<PrizeListResponse>('voting-admin', key, { action: 'prizes' });

/**
 * Co wolno zmienić w jednej nagrodzie. Każde pole osobno opcjonalne, bo komentarz da się
 * poprawić bez ruszania zwycięzcy — a wysłanie przy tym pustego `participantId` byłoby
 * wyczyszczeniem przypisania, którego nikt nie prosił.
 */
export interface PrizeChange {
  participantId?: string;
  winnerLabel?: string;
  note?: string;
}

export const setPrize = (key: string, prizeKey: string, change: PrizeChange) =>
  call<{ ok: true }>('voting-admin', key, { action: 'prize-set', prizeKey, ...change });

/**
 * Zdjęcie nagrody.
 *
 * Wysyła oba pola zwycięzcy pustymi JAWNIE, a nie pomija ich: pominięte pole znaczy w tym
 * kontrakcie „nie zmieniaj", więc `setPrize(key, prizeKey, {})` nie wyczyściłoby niczego.
 * Osobna funkcja zamiast komentarza przy wywołaniu, bo to jedyne miejsce, w którym ta
 * różnica ma znaczenie, i jedyne, w którym da się ją przeoczyć.
 */
export const clearPrize = (key: string, prizeKey: string) =>
  setPrize(key, prizeKey, { participantId: '', winnerLabel: '', note: '' });

/* ------------------------------------------------- roczniki i podsumowanie

   DLACZEGO TO SIĘGA DO DWÓCH KOŃCÓWEK, A NIE DO JEDNEJ
     `voting-admin` (action `state`) NIE ODDAJE listy roczników. Sprawdzone w Workerze:
     votingAdminState() zwraca fazę, uczestników i sumę głosów z ŻYWYCH tabel i ani słowem
     nie wspomina o `voting_editions`. Roczniki i zamrożone wyniki oddaje tylko publiczna
     końcówka `voting` (votingState), która przyjmuje `edition` i po tym kluczu wchodzi do
     archiwum. Panel musi więc pytać obie: publiczną o LISTĘ i o ARCHIWUM, panelową o
     liczby TRWAJĄCEJ edycji.

     Odwrotnie się nie da i to jest sedno: publiczny odczyt świadomie ukrywa oceny, dopóki
     głosowanie jest otwarte (`const ranking = closed ? … : []` w Workerze), żeby nikt nie
     dopisywał się do prowadzącego. Podsumowanie na żywo zbudowane z tamtej odpowiedzi
     pokazywałoby w dniu zawodów zero głosów i puste podium — czyli kłamałoby.

   CZEGO TU NIE MA I DLACZEGO NIE DODAJEMY
     Nie ma odczytu odwiedzin ani zgłoszeń „za rocznik 2026". `site_stats` liczy okno
     kończące się TERAZ (window_hours, sufit 8760), a `public_counts` to dwa liczniki
     bieżące bez kolumny z rokiem. Do rozbicia tego na roczniki brakuje końcówki, a jej
     dodanie należy do Workera, nie do panelu — patrz raport. */

/**
 * Jeden rocznik z `voting_editions`.
 *
 * `participantCount` i `voteCount` są opcjonalne, bo przychodzą tylko w LIŚCIE roczników.
 * Odpowiedź archiwalna składa `selectedEdition` z sześciu pól i tych dwóch w niej nie ma —
 * wpisanie ich tu jako wymaganych znaczyłoby, że TypeScript obiecuje liczbę, której w tej
 * gałęzi nikt nie przysłał, a widok pokazałby `undefined` sformatowane jako „NaN".
 */
export interface VotingEdition {
  id: string;
  /** Rok, cztery cyfry. To jest klucz archiwum — patrz migracja 0030. */
  key: string;
  name: string;
  /** ISO. Data wydarzenia tego rocznika. */
  date: string;
  location: string;
  /** Baza pilnuje tego więzem CHECK (migracja 0030), więc te dwie wartości to całość. */
  status: 'active' | 'archived';
  participantCount?: number;
  voteCount?: number;
}

/**
 * Wiersz wyniku: albo policzony na żywo, albo odczytany ze zamrożonego `results`.
 *
 * Osobny typ, a nie `VotingParticipant`, bo archiwum nie ma `registrationId`, `imagePath`
 * ani `active` — snapshot zapisuje wynik, nie stan edycji. Wspólny typ z polami wymaganymi
 * kazałby je tu dorabiać z powietrza.
 */
export interface EditionResultRow {
  id: string;
  category: string;
  startNumber: number;
  firstName: string;
  lastName: string;
  projectName: string;
  photo: string;
  voteCount: number;
  averageScore: number;
  totalScore: number;
}

/**
 * Publiczny odczyt głosowania — tu używany wyłącznie po roczniki i archiwum.
 *
 * Prawie wszystko opcjonalne, bo to jest kształt Z DRUTU, a nie z tego repozytorium:
 * `editions`, `selectedEdition`, `isArchive` i `podium` doszły w migracji 0030 i wdrożona
 * funkcja może być starsza od tego panelu. Pola wymagane w typie zamieniłyby taki rozjazd
 * w `Cannot read properties of undefined (reading 'map')` na białym ekranie; opcjonalne
 * zmuszają widok do napisania, co pokazać, gdy ich nie ma.
 */
export interface EditionsState {
  ok: true;
  phase: VotingPhase;
  isArchive?: boolean;
  editions?: VotingEdition[];
  selectedEdition?: VotingEdition | null;
  raceStartsAt?: string | null;
  votingEndsAt?: string | null;
  participants?: EditionResultRow[];
  podium?: EditionResultRow[];
}

/**
 * Roczniki, a przy podanym kluczu — zamrożony wynik tego rocznika.
 *
 * Bez `edition` odpowiada stanem trwającej edycji razem z listą roczników. Z `edition`
 * równym zarchiwizowanemu rokowi odpowiada snapshotem i `isArchive: true`. Klucz inny niż
 * cztery cyfry Worker ignoruje, więc filtrujemy go już tutaj — inaczej „2026x" wracałoby
 * jako stan bieżący udający archiwum.
 *
 * Hasło leci w nagłówku jak wszędzie, choć ta końcówka go nie wymaga: `call` dokłada go
 * bezwarunkowo, a wyjątek od tej reguły byłby pierwszym miejscem, w którym ktoś zapomni.
 */
export const fetchEditions = (key: string, edition = '') =>
  call<EditionsState>('voting', key, {
    action: 'state',
    ...(/^\d{4}$/.test(edition) ? { edition } : {})
  });

/**
 * Dwa liczniki bieżące: kliknięcia „będę tam" i zgłoszenia zawodników.
 *
 * Widok `public_counts` (migracja 0013) i nic poza nim — same sumy, ani jednego nazwiska.
 * `initials` odpuszczone w typie: podsumowanie sezonu liczy ludzi, a nie rysuje awatarów,
 * a pole, którego nikt nie czyta, jest tylko obietnicą do utrzymywania.
 */
export interface PublicCounts {
  ok: true;
  /** Kliknięcia „będę tam”. Jeden wiersz na urządzenie, nie licznik — patrz migracja 0002. */
  attendees: number;
  /** Zgłoszenia zawodników bez wycofanych. */
  pilots: number;
}

export const fetchCounts = (key: string) => call<PublicCounts>('counts', key, {});

/* ------------------------------------------------------------------- purge */

/** `voting` clears the candidate list and the votes cast on it; the schedule stays. */
export type PurgeScope =
  | 'registrations'
  | 'attendance'
  | 'subscribers'
  | 'messages'
  | 'chat'
  | 'wall'
  | 'voting'
  | 'everything';

/**
 * Deletes test data. There is no undo.
 *
 * The `confirm` string is built here rather than typed by the user twice: the guard it
 * provides is against a stray retry or a mis-wired button reaching the server, not
 * against a person who has already typed the scope into a confirmation box. The panel
 * asks for that separately, in words, before calling this.
 */
export const purgeData = (key: string, scope: PurgeScope) =>
  call<{ ok: true; scope: string; cleared: string[]; sequenceReset: boolean }>('purge', key, {
    scope,
    confirm: `USUN ${scope}`
  });
