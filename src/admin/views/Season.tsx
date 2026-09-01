import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Medal, MapPin, RefreshCw } from 'lucide-react';
import { cn, formatMoment } from '@/lib/utils';
import type { TranslateKey } from '../i18n';
import {
  ApiError,
  fetchCounts,
  fetchEditions,
  fetchStats,
  fetchVoting,
  type EditionResultRow,
  type EditionsState,
  type PublicCounts,
  type SiteStats,
  type VotingEdition,
  type VotingState
} from '../api';

/**
 * PODSUMOWANIE SEZONU
 * ============================================================================
 * PYTANIE, NA KTÓRE TEN EKRAN ODPOWIADA
 *   „Jak wypadł ten rok — i jak wypadł rok 2026, gdy jest już 2027?" Jedna strona na
 *   rocznik: ilu ludzi było, ilu się zapisało, kto wygrał, kiedy i gdzie.
 *
 * DLACZEGO OSOBNY EKRAN, A NIE KARTA W „GŁOSOWANIU"
 *   Trzy powody, każdy z nich sam by wystarczył.
 *
 *   1. To jest ekran, na który się WCHODZI, a nie konsola, przy której się stoi. Zakładka
 *      „Głosowanie" jest pulpitem dnia zawodów: otwiera głosowanie, zamyka je, czyści głosy,
 *      wysyła listy do zwycięzców. Przeglądarka archiwum obok przycisku „Wyczyść głosy" to
 *      zaproszenie do pomyłki, która nie ma cofnięcia — a to jedyne miejsce w panelu, w które
 *      wchodzi się z ciekawości, po roku, bez planu klikania czegokolwiek.
 *
 *   2. Zakres danych jest inny. „Głosowanie" ma jedno źródło (żywe tabele bieżącej edycji).
 *      Tutaj schodzą się cztery odczyty z trzech końcówek, w tym snapshot innego rocznika —
 *      czyli stan, w którym „Zamknij teraz" i „Wyślij do zwycięzców" nie znaczą nic i musiałyby
 *      być wygaszane w zależności od wybranego roku. Ekran bez przycisków nie ma tego problemu.
 *
 *   3. Voting.tsx ma już ponad tysiąc linii. Doklejenie tu kolejnych trzystu znaczyłoby, że
 *      obsługa zawodów i archiwum psują się razem.
 *
 *   W nawigacji stoi obok „Statystyk", nad grupami — z tego samego powodu, dla którego tam
 *   stoją statystyki: to nie są dane wydarzenia, które się prowadzi, tylko odczyt o nim.
 *   Bez plakietki: rocznik nie ma stanu „nowe od ostatniego razu".
 *
 * SKĄD SIĘ BIERZE KAŻDA LICZBA
 *   Zgłoszenia zawodników i „będę tam"  → `counts` (widok `public_counts`, migracja 0013)
 *   Odsłony, osoby, zapisy              → `stats` (funkcja `site_stats`, migracja 0033)
 *   Pojazdy i głosy TRWAJĄCEJ edycji    → `voting-admin` action `state`
 *   Roczniki i wynik ZARCHIWIZOWANY     → `voting` action `state` z `edition` (migracja 0030)
 *
 * DLACZEGO ROCZNIK ZARCHIWIZOWANY NIE CZYTA ŻYWYCH TABEL
 *   Bo `rollover_voting_edition` usuwa głosy i uczestników przy przejściu na nowy rok. Wynik
 *   z 2026 istnieje wtedy już tylko w `voting_editions.results` — zamrożony, razem z liczbami
 *   `participant_count` i `vote_count`. Gdyby ten ekran liczył podium z tabeli `participants`,
 *   w 2027 pokazałby przy roku 2026 podium roku 2027. Snapshot jest dokładnie po to.
 */

/** Godzina w milisekundach. Nazwana, bo `3_600_000` w trzech miejscach to trzy okazje na literówkę. */
const HOUR_MS = 3_600_000;

/**
 * Sufit okna `site_stats`, przepisany z Workera (`Math.min(…, 8760)`).
 *
 * Wpisany tu jawnie, bo od tego zależy TREŚĆ pod liczbami: powyżej roku serwer po cichu
 * obcina okno i „osoby w tym sezonie" zaczynają znaczyć „osoby z ostatniego roku". Panel,
 * który tego nie wie, pokazuje wtedy liczbę pod fałszywą etykietą.
 */
const STATS_MAX_HOURS = 8760;

/**
 * Kolejność wyników — ta sama w czterech miejscach i to nie jest przypadek.
 *
 * Suma punktów, przy remisie liczba głosów, potem średnia, na końcu numer startowy. Dokładnie
 * to samo liczy `rollover_voting_edition` w SQL-u (kolumna `place`), Worker przy podium i widok
 * „Głosowanie". Każde odstępstwo znaczyłoby, że panel pokazuje inne podium niż to, które
 * pojechało w listach do zwycięzców — i nikt by nie wiedział, które jest prawdziwe.
 */
const byResult = (a: EditionResultRow, b: EditionResultRow) =>
  b.totalScore - a.totalScore
  || b.voteCount - a.voteCount
  || b.averageScore - a.averageScore
  || a.startNumber - b.startNumber;

/**
 * Okno czasu, w którym mierzymy ruch dla TRWAJĄCEGO rocznika.
 *
 * `site_stats` przyjmuje wyłącznie „ostatnie N godzin" liczone do teraz — nie ma w niej ani
 * daty od, ani daty do. Sezon zaczyna się więc tam, gdzie skończył się poprzedni: bierzemy
 * datę najbliższej WCZEŚNIEJSZEJ edycji, a gdy takiej nie ma (pierwszy rocznik w bazie) —
 * 1 stycznia roku tego rocznika.
 *
 * Dwa przypadki brzegowe mają tu treść, nie wyjątek:
 *   • rocznik zaplanowany w przyszłości i brak poprzednika — początek sezonu wypada wtedy
 *     przed nami, okno wyszłoby ujemne, a po przycięciu do jedynki „osoby w tym sezonie"
 *     znaczyłoby „osoby z ostatniej godziny". Bierzemy najdłuższe okno, jakie serwer umie.
 *   • sezon dłuższy niż rok — serwer i tak obetnie. Oba przypadki wracają jako `clipped`,
 *     żeby ekran mógł o tym napisać zdanie zamiast udawać, że liczba pasuje do etykiety.
 */
function seasonWindow(edition: VotingEdition | null, editions: VotingEdition[]) {
  const own = edition ? new Date(edition.date).getTime() : Number.NaN;

  const earlier = editions
    .map((row) => new Date(row.date).getTime())
    .filter((time) => Number.isFinite(time) && time < own)
    .sort((a, b) => b - a);
  const previous = earlier[0];

  const year = edition ? Number.parseInt(edition.key, 10) : Number.NaN;
  const fromYear = Number.isFinite(year) ? Date.UTC(year, 0, 1) : Number.NaN;

  const startedAt = previous ?? fromYear;
  const raw = Number.isFinite(startedAt) ? Math.ceil((Date.now() - startedAt) / HOUR_MS) : Number.NaN;

  const usable = Number.isFinite(raw) && raw >= 1;
  const hours = usable ? Math.min(raw, STATS_MAX_HOURS) : STATS_MAX_HOURS;
  return {
    hours,
    clipped: !usable || raw > STATS_MAX_HOURS,
    /* Data policzona Z PRZYCIĘTEGO okna, nie z zamiaru: pod liczbami ma stać moment, od
       którego te liczby naprawdę są liczone. */
    from: new Date(Date.now() - hours * HOUR_MS).toISOString()
  };
}

const nf = (locale: string) => new Intl.NumberFormat(locale);

/**
 * Jedna liczba w kafelku.
 *
 * `value === null` to BRAK DANYCH, `value === 0` to zero — i te dwie rzeczy nie mają prawa
 * wyglądać tak samo. Zero znaczy „sprawdziliśmy, nikogo nie było"; myślnik znaczy „tego nie
 * wiemy" i wtedy pod nim musi stać powód. Pokazanie braku danych jako „0" to najgorszy
 * rodzaj pomyłki w takim zestawieniu: wygląda na wynik i nikt go nie kwestionuje.
 */
function Tile({
  label, value, note, accent, locale
}: {
  label: string;
  value: number | null;
  note?: string;
  accent?: boolean;
  locale: string;
}) {
  return (
    <div className={cn(
      'rounded-2xl border p-4',
      accent ? 'border-yellow/30 bg-yellow/[0.07]' : 'border-white/10 bg-white/[0.03]'
    )}>
      <div className="text-[11px] uppercase tracking-wider text-white/45">{label}</div>
      <div className={cn(
        'mt-1 text-3xl font-extrabold tabular-nums',
        value === null ? 'text-white/25' : accent ? 'text-yellow' : 'text-white'
      )}>
        {value === null ? '—' : nf(locale).format(value)}
      </div>
      {note ? <div className="mt-1 text-[11px] leading-snug text-white/35">{note}</div> : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-navy-900 p-6">
      <h2 className="mb-4 text-[13px] font-extrabold uppercase tracking-wider text-white/60">{title}</h2>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------- ekran */

export function Season({ t, apiKey }: { t: (key: TranslateKey) => string; apiKey: string }) {
  /* Format liczb i dat idzie ze słownika, nie z propsa — tak samo jak w „Statystykach".
     Drugi kanał na tę samą informację byłby drugim miejscem, w którym panel może pokazać
     polskie słowa z włoskim formatem daty. */
  const intl = t('locale.intl');

  const [editions, setEditions] = useState<VotingEdition[]>([]);
  const [chosen, setChosen] = useState('');
  const [activeKey, setActiveKey] = useState('');
  /** Liczby trwającej edycji: `voting-admin`. Ranking dostajemy stąd zawsze, także w trakcie. */
  const [live, setLive] = useState<VotingState | null>(null);
  /** Zamrożony wynik wybranego rocznika. `null`, gdy patrzymy na edycję trwającą. */
  const [snapshot, setSnapshot] = useState<EditionsState | null>(null);
  /** Rocznik wybrany, ale w bazie nie ma jego snapshotu — patrz komentarz przy odczycie. */
  const [snapshotMissing, setSnapshotMissing] = useState(false);
  const [counts, setCounts] = useState<PublicCounts | null>(null);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [traffic, setTraffic] = useState<{ from: string; clipped: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Kod z Workera na zdanie. Nieznany kod zostaje kodem — lepszy niż milczenie. */
  const explain = useCallback(
    (problem: unknown): string => {
      const code = problem instanceof ApiError ? problem.code || '' : '';
      const known: Record<string, string> = {
        CAPTCHA_FAILED: t('season.errCaptcha'),
        VOTING_READ_FAILED: t('season.errLoad'),
        STATS_DISABLED: t('season.errLoad'),
        STATS_FAILED: t('season.errLoad'),
        COUNTS_FAILED: t('season.errLoad')
      };
      return known[code] || (problem instanceof Error ? problem.message : String(problem));
    },
    [t]
  );

  const load = useCallback(
    async (wanted: string) => {
      if (!apiKey) return;
      setBusy(true);
      setError(null);
      try {
        /* Krok pierwszy zawsze ten sam: lista roczników. Ona jest jedynym miejscem, z którego
           wiadomo, KTÓRY rocznik jest trwający — a od tego zależy, gdzie szukać liczb. */
        const list = await fetchEditions(apiKey);
        const rows = list.editions ?? [];
        /* `selectedEdition` jest pierwszym źródłem, `status` z listy zapasem. Nie nadmiarowo:
           bez zapasu odpowiedź bez `selectedEdition` (starsza funkcja) dawałaby pusty klucz
           edycji trwającej, przez co ekran wziąłby bieżący rok za archiwalny i napisał „ta
           edycja nie ma zapisanego podium" o roczniku, który właśnie trwa. Baza pilnuje
           jednego wiersza `active` indeksem, więc ten zapas jest jednoznaczny. */
        const active = list.selectedEdition?.key ?? rows.find((row) => row.status === 'active')?.key ?? '';
        setEditions(rows);
        setActiveKey(active);

        /* Wybór z listy, nie z pamięci ekranu: rocznik, którego w bazie nie ma (bo ktoś
           przełączył się przed odświeżeniem, albo archiwum wyczyszczono) schodzi na trwający,
           a nie zostaje jako martwy klucz, po którym każdy odczyt wraca pusty. */
        const fallback = active || rows[0]?.key || '';
        const key = rows.some((row) => row.key === wanted) ? wanted : fallback;
        setChosen(key);

        if (!key) {
          setLive(null);
          setSnapshot(null);
          setSnapshotMissing(false);
          setCounts(null);
          setStats(null);
          setTraffic(null);
          return;
        }

        if (key === active) {
          const edition = rows.find((row) => row.key === key) ?? list.selectedEdition ?? null;
          const window = seasonWindow(edition, rows);
          setTraffic({ from: window.from, clipped: window.clipped });

          /* `allSettled`, nie `all`: to są trzy NIEZALEŻNE pytania i przewrócenie jednego nie
             ma prawa wygasić dwóch pozostałych. Statystyki bywają wyłączone na serwerze
             (STATS_DISABLED), a wtedy podium i głosy nadal są prawdą, którą warto pokazać.
             Każde nieudane źródło schodzi na `null`, czyli na myślnik z powodem. */
          const [voting, counted, measured] = await Promise.allSettled([
            fetchVoting(apiKey),
            fetchCounts(apiKey),
            fetchStats(apiKey, window.hours)
          ]);

          setSnapshot(null);
          setSnapshotMissing(false);
          setLive(voting.status === 'fulfilled' ? voting.value : null);
          setCounts(counted.status === 'fulfilled' ? counted.value : null);
          setStats(measured.status === 'fulfilled' ? measured.value.stats : null);
          /* Na pasku błędu ląduje tylko przewrócone głosowanie — ono jest treścią tego ekranu.
             Brak odwiedzin albo liczników mówi za siebie myślnikiem w kafelku. */
          if (voting.status === 'rejected') setError(explain(voting.reason));
          return;
        }

        const archive = await fetchEditions(apiKey, key);
        /* PUŁAPKA, KTÓRA MUSI BYĆ ZŁAPANA TUTAJ.
           Gdy w `voting_editions` nie ma zarchiwizowanego wiersza o tym kluczu, Worker NIE
           odpowiada błędem — przechodzi dalej i oddaje stan ŻYWEJ edycji z `isArchive: false`.
           Wzięcie tego za snapshot znaczyłoby wypisanie dzisiejszego podium pod cudzym rokiem,
           czyli dokładnie ten błąd, przed którym snapshot ma chronić. Stąd flaga i osobna
           treść: „ta edycja nie ma zapisanego podium". */
        const missing = archive.isArchive !== true;
        setSnapshot(missing ? null : archive);
        setSnapshotMissing(missing);
        setLive(null);
        /* Świadomie NIE pobieramy odwiedzin ani liczników dla rocznika zamkniętego: jedne
           liczą okno kończące się teraz, drugie są bieżącymi sumami bez podziału na lata.
           Podstawienie ich pod rok 2026 dałoby liczby wyglądające na archiwalne i nieprawdziwe. */
        setCounts(null);
        setStats(null);
        setTraffic(null);
      } catch (problem) {
        setError(explain(problem));
      } finally {
        setBusy(false);
      }
    },
    [apiKey, explain]
  );

  useEffect(() => {
    void load('');
    // Jednorazowo przy wejściu. Ten ekran nie odpytuje w tle: liczby sezonu zmieniają się w
    // tempie, przy którym samo odświeżanie co 30 s byłoby ruchem bez odbiorcy.
  }, [load]);

  /* ------------------------------------------------------------- co wyszło */

  const isArchive = chosen !== '' && chosen !== activeKey;
  const edition = editions.find((row) => row.key === chosen) ?? snapshot?.selectedEdition ?? null;

  /* Podium. Dla rocznika zamkniętego wprost ze snapshotu; `podium` z Workera, a gdy go w
     odpowiedzi nie ma (wdrożona funkcja starsza od panelu) — z tych samych wierszy, tą samą
     kolejnością. Dla trwającego liczone z uczestników, bo tam podium jeszcze nie istnieje. */
  const snapshotRows = snapshot?.participants ?? [];
  const archivePodium = snapshot?.podium
    ?? [...snapshotRows].filter((row) => row.voteCount > 0).sort(byResult).slice(0, 3);
  const livePodium = [...(live?.participants ?? [])]
    .filter((row) => row.active && row.voteCount > 0)
    .sort(byResult)
    .slice(0, 3);
  const podium: EditionResultRow[] = isArchive ? archivePodium : livePodium;

  /* Pojazdy i głosy.
     Archiwum bierze zamrożone liczniki z wiersza edycji, nie długość tablicy `results`:
     `participant_count` policzono w chwili zamknięcia, a w `results` siedzą tylko uczestnicy
     aktywni. Suma z wierszy jest zapasem na wypadek wiersza bez liczników. */
  const snapshotVotes = snapshotRows.reduce((sum, row) => sum + row.voteCount, 0);
  const participants = isArchive
    ? (snapshotMissing ? null : edition?.participantCount ?? snapshotRows.length)
    : (live ? live.participants.filter((row) => row.active).length : null);
  const votes = isArchive
    ? (snapshotMissing ? null : edition?.voteCount ?? snapshotVotes)
    : (live ? live.totalVotes : null);

  /** Powód pod myślnikiem. Rocznik zamknięty: „liczone tylko dla trwającej edycji". */
  const liveOnly = isArchive ? t('season.liveOnly') : undefined;

  /**
   * Który brak podium to który.
   *
   * Cztery różne sytuacje i cztery różne zdania, bo prowadzą do czterech różnych czynności:
   * poczekać na wyścig, poczekać na głosy, przyjąć że tego roku wyniku nie zapisano, albo
   * sprawdzić czemu odczyt się nie udał. Jedno „brak danych" na wszystko cztery kazałoby
   * zgadywać.
   */
  const podiumEmpty = (): TranslateKey => {
    if (isArchive) return snapshotMissing || !snapshot ? 'season.noSnapshot' : 'season.archivedNoVotes';
    if (!live) return 'season.unknown';
    if (live.phase === 'scheduled') return 'season.notStarted';
    return 'season.noVotes';
  };

  const chip =
    'rounded-full px-3.5 py-1.5 text-xs font-extrabold transition-colors disabled:opacity-45';

  return (
    <div className="mx-auto grid max-w-5xl gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">{t('season.title')}</h1>
          <p className="mt-1 text-sm text-white/50">{t('season.lead')}</p>
        </div>
        <button
          type="button"
          onClick={() => void load(chosen)}
          disabled={busy}
          className={cn(chip, 'inline-flex items-center gap-2 bg-white/10 text-white hover:bg-white/20')}
        >
          <RefreshCw size={13} className={busy ? 'animate-spin' : undefined} /> {t('top.refresh')}
        </button>
      </header>

      {error ? (
        <p className="rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-white">{error}</p>
      ) : null}

      {editions.length === 0 ? (
        /* Brak roczników to nie awaria: tak wygląda baza przed pierwszym ogłoszeniem edycji.
           Stąd zdanie i wskazówka, gdzie się to zaczyna, a nie komunikat o błędzie. */
        <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-14 text-center">
          <Medal size={26} className="mx-auto text-white/25" />
          <p className="mt-3 font-extrabold text-white">{t('season.noEditions')}</p>
          <p className="mt-1 text-sm text-white/45">{t('season.noEditionsHint')}</p>
        </div>
      ) : (
        <>
          {/* ------------------------------------------------------ rocznik */}
          <section className="rounded-3xl border border-white/10 bg-navy-900 p-6">
            <div className="text-[11px] uppercase tracking-wider text-white/45">{t('season.pick')}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {editions.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  disabled={busy}
                  onClick={() => void load(row.key)}
                  className={cn(
                    chip,
                    'tabular-nums',
                    row.key === chosen ? 'bg-yellow text-navy-950' : 'bg-white/10 text-white hover:bg-white/20'
                  )}
                >
                  {row.key}
                  <span className="ml-2 font-bold opacity-60">
                    {row.status === 'active' ? t('season.badgeLive') : t('season.badgeArchived')}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-2.5">
                <CalendarDays size={16} className="mt-0.5 shrink-0 text-white/35" />
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-white/45">{t('season.when')}</div>
                  {/* Data przez Intl.DateTimeFormat w strefie Europe/Rome — patrz formatMoment.
                      Zegar przeglądarki organizatora nie ma tu nic do rzeczy: wyścig odbywa
                      się we Włoszech i godzina ma się zgadzać z tym, co widzi publiczność. */}
                  <div className="text-sm font-bold text-white">
                    {formatMoment(edition?.date ?? null, intl)}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin size={16} className="mt-0.5 shrink-0 text-white/35" />
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-white/45">{t('season.where')}</div>
                  <div className="truncate text-sm font-bold text-white">
                    {edition?.location || t('season.unknownPlace')}
                  </div>
                  {edition?.name ? (
                    <div className="truncate text-[11px] text-white/40">{edition.name}</div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------- liczby */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label={t('season.registrations')}
              value={isArchive ? null : counts?.pilots ?? null}
              note={liveOnly ?? (counts ? t('season.registrationsNote') : t('season.unavailable'))}
              locale={intl}
              accent
            />
            <Tile
              label={t('season.attendance')}
              value={isArchive ? null : counts?.attendees ?? null}
              note={liveOnly ?? (counts ? t('season.attendanceNote') : t('season.unavailable'))}
              locale={intl}
            />
            <Tile
              label={t('season.visitors')}
              value={isArchive ? null : stats?.totals.visitors ?? null}
              note={
                liveOnly
                ?? (stats && traffic
                  ? `${t('season.window')} ${formatMoment(traffic.from, intl)}`
                  : t('season.statsOff'))
              }
              locale={intl}
            />
            <Tile
              label={t('season.views')}
              value={isArchive ? null : stats?.totals.views ?? null}
              note={liveOnly ?? (stats ? undefined : t('season.statsOff'))}
              locale={intl}
            />
            <Tile
              label={t('season.signups')}
              value={isArchive ? null : stats?.signupTotal ?? null}
              note={liveOnly ?? (stats ? t('season.signupsNote') : t('season.statsOff'))}
              locale={intl}
            />
            <Tile
              label={t('season.participants')}
              value={participants}
              note={participants === null ? t('season.unavailable') : undefined}
              locale={intl}
            />
            <Tile
              label={t('season.votes')}
              value={votes}
              note={votes === null ? t('season.unavailable') : undefined}
              locale={intl}
              accent
            />
            <Tile
              label={t('season.sessions')}
              value={isArchive ? null : stats?.totals.sessions ?? null}
              note={liveOnly ?? (stats ? undefined : t('season.statsOff'))}
              locale={intl}
            />
          </div>

          {traffic?.clipped && !isArchive ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-white/40">
              {t('season.windowClipped')}
            </p>
          ) : null}

          {/* ------------------------------------------------------- podium */}
          <Card title={t('season.podium')}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs text-white/45">
                {isArchive ? t('season.podiumFrozen') : t('season.podiumLive')}
              </p>
              {!isArchive && live ? (
                <p className="text-[11px] text-white/35">
                  {live.phase === 'closed' ? t('vote.standingsFinal') : t('vote.standingsLive')}
                </p>
              ) : null}
            </div>

            {podium.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm text-white/45">
                {t(podiumEmpty())}
              </p>
            ) : (
              <ol className="grid gap-1.5">
                {podium.map((row, index) => {
                  const place = index + 1;
                  return (
                    <li
                      key={row.id}
                      className={cn(
                        'grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-3 py-2',
                        place === 1 ? 'border-yellow/60 bg-yellow/10' : 'border-white/20 bg-white/[0.05]'
                      )}
                    >
                      <span className={cn(
                        'grid h-8 w-8 place-items-center rounded-xl text-sm font-extrabold tabular-nums',
                        place === 1 ? 'bg-yellow text-navy-950' : 'bg-white/10 text-white'
                      )}>
                        {place}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-white">
                          {row.projectName || `${row.firstName} ${row.lastName}`.trim()}
                        </span>
                        <span className="block truncate text-[11px] uppercase tracking-wider text-white/45">
                          {String(row.startNumber).padStart(3, '0')} · {row.firstName} {row.lastName} · {row.category}
                        </span>
                      </span>
                      {/* Ta sama hierarchia co w „Głosowaniu": na żółto suma punktów, bo ona
                          ustawia miejsce, średnia drobnym drukiem obok. Średnia na pierwszym
                          planie kazałaby czytać podium jako pomyłkę, bo drugi wiersz bywa
                          wyżej oceniony od pierwszego. */}
                      <span className="flex items-baseline gap-1.5">
                        <b className="text-lg font-extrabold tabular-nums text-yellow">
                          {nf(intl).format(row.totalScore)}
                        </b>
                        <small className="text-[10px] uppercase tracking-wider text-white/45">
                          {t('vote.points')} · {nf(intl).format(row.voteCount)} {t('vote.votes')}
                          {' · '}{t('vote.avgShort')} {row.averageScore.toFixed(2)}
                        </small>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          {/* Zdanie, bez którego te liczby byłyby nieuczciwe. Nie małym drukiem w stopce: kto
              czyta podsumowanie rocznika, ma wiedzieć, które liczby są za rocznik, a które są
              bieżącymi sumami całej strony. */}
          <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-white/40">
            {t('season.scopeNote')} · {t('st.consentNote')}
          </p>
        </>
      )}
    </div>
  );
}
