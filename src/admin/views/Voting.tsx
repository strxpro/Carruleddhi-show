import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, ListPlus, Play, RefreshCw, Square, Trash2, Trophy } from 'lucide-react';
import { cn, formatMoment } from '@/lib/utils';
import { DateTimeField } from './DateTimeField';
import type { TranslateKey } from '../i18n';
import {
  ApiError,
  closeVoting,
  fetchRoster,
  fetchVoting,
  mailWinners,
  openVoting,
  removeParticipant,
  saveParticipant,
  scheduleVoting,
  uploadParticipantPhoto,
  type ParticipantEdit,
  type RosterRow,
  type VotingParticipant,
  type VotingState,
  type VotingWinner
} from '../api';

/**
 * Zdjęcie pojazdu, zmniejszone w przeglądarce.
 *
 * Tak samo jak zdjęcia na tablicy: telefon robi dziś 12 megapikseli, a kafelek ma 72 px
 * szerokości. Wysłanie oryginału to kilka megabajtów przez transmisję komórkową organizatora
 * po to, żeby serwer i tak je pomniejszył. 1600 px po dłuższej krawędzi i JPEG 0.82 mieszczą
 * się w limicie ciała żądania (1,5 MB) z zapasem.
 *
 * JPEG, nie PNG — inaczej niż logo sponsora obok. Logo jest płaskim kolorem, na którym JPEG
 * zostawia obwódkę; to jest fotografia wózka w słońcu, na której PNG jest kilka razy większy
 * bez żadnej różnicy na ekranie.
 */
async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > 1600 ? 1600 / longest : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * `datetime-local` chce czasu lokalnego bez strefy; baza trzyma ISO w UTC.
 *
 * Przeliczane zegarem przeglądarki, podczas gdy `formatMoment` niżej pokazuje czas w
 * Europe/Rome. Dla tego wydarzenia to ta sama godzina — Polska i Włochy są w jednej strefie —
 * więc pole i podgląd obok siebie się zgadzają.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Głosowanie publiczności, strona organizatora.
 *
 * Trzy rzeczy w jednym miejscu, bo w dniu zawodów przełączanie się między zakładkami z
 * telefonu na zboczu to nie jest realny sposób pracy: czas, lista uczestników i wyniki.
 *
 * Faza przychodzi z Workera i nie jest tu wyliczana. Panel pokazujący własną fazę i serwer
 * pilnujący swojej to dwie prawdy, z których jedna wpuszcza głosy, a druga tylko o tym
 * opowiada — i rozjazd między nimi zobaczyłby dopiero ktoś, komu głos się nie zapisał.
 */
export function Voting({ t, apiKey }: { t: (key: TranslateKey) => string; apiKey: string }) {
  const [state, setState] = useState<VotingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [winners, setWinners] = useState<{ sent: VotingWinner[]; unreachable: VotingWinner[] } | null>(null);

  const [startAt, setStartAt] = useState('');
  const [duration, setDuration] = useState(30);
  const [draft, setDraft] = useState({
    startNumber: '',
    category: 'classic',
    firstName: '',
    lastName: '',
    projectName: ''
  });
  const [draftPhoto, setDraftPhoto] = useState<{ imagePath: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /* Lista startowa, wczytywana dopiero przy otwarciu.
     Zgłoszeń bywa kilkaset, a większość wejść w tę zakładkę dotyczy czasu albo wyników —
     pobieranie ich przy każdym otwarciu panelu to transmisja komórkowa organizatora wydana
     na dane, których zwykle nie ogląda. */
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterQuery, setRosterQuery] = useState('');

  /** Tłumaczy kod z Workera na zdanie; nieznany kod zostaje kodem, bo lepszy niż milczenie. */
  const explain = useCallback(
    (problem: unknown): string => {
      const code = problem instanceof ApiError ? problem.code || '' : '';
      const known: Record<string, string> = {
        VOTING_START_NUMBER_TAKEN: t('vote.numberTaken'),
        VOTING_STILL_OPEN: t('vote.winnersStillOpen'),
        VOTING_NO_RESULTS: t('vote.winnersNoResults'),
        WALL_PHOTO_TOO_LARGE: t('vote.photoTooBig'),
        WALL_PHOTO_FORMAT: t('vote.photoTooBig')
      };
      return known[code] || (problem instanceof Error ? problem.message : String(problem));
    },
    [t]
  );

  /**
   * Świeżo dodani uczestnicy, wyróżnieni na kilka sekund.
   *
   * Bez tego dodanie z listy startowej wyglądało tak: lista przeskakuje, bo doszedł jeden
   * wiersz, i trzeba go odnaleźć wzrokiem między kilkudziesięcioma innymi uporządkowanymi
   * numerami startowymi. Wyróżnienie odpowiada na pytanie „czy się zapisał" bez szukania.
   *
   * Liczone z RÓŻNICY zbiorów identyfikatorów, nie z odpowiedzi na zapis: `saveParticipant`
   * oddaje samo `ok`, a poza tym ten sam sposób łapie też uczestnika dopisanego z drugiego
   * urządzenia w trakcie odpytywania.
   */
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const knownIds = useRef<Set<string> | null>(null);
  const freshTimer = useRef(0);

  const absorb = useCallback((next: VotingState) => {
    const incoming = new Set(next.participants.map((row) => row.id));
    if (knownIds.current) {
      const added = [...incoming].filter((id) => !knownIds.current?.has(id));
      if (added.length) {
        setFreshIds(added);
        window.clearTimeout(freshTimer.current);
        freshTimer.current = window.setTimeout(() => setFreshIds([]), 6000);
      }
    }
    knownIds.current = incoming;

    setState(next);
    setStartAt(toLocalInput(next.raceStartsAt));
    setDuration(next.durationMinutes || 30);
  }, []);

  useEffect(() => () => window.clearTimeout(freshTimer.current), []);

  const load = useCallback(async () => {
    if (!apiKey) return;
    setBusy(true);
    setError(null);
    try {
      absorb(await fetchVoting(apiKey));
    } catch (problem) {
      setError(explain(problem));
      setState(null);
    } finally {
      setBusy(false);
    }
  }, [apiKey, absorb, explain]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Odczyt co piętnaście sekund, gdy karta jest z przodu.
     ---------------------------------------------------------------------------
     Nie tylko w fazie `voting`, jak było wcześniej: przed startem dwie osoby przygotowują
     listę na dwóch telefonach — jedna dopisuje uczestników, druga wgrywa im zdjęcia — i bez
     odpytywania druga nie widzi pracy pierwszej, dopóki czegoś sama nie kliknie.

     Po zamknięciu odpytywanie ustaje: liczby już się nie zmieniają, a lista uczestników po
     ogłoszeniu wyniku nie jest edytowana. */
  useEffect(() => {
    if (!apiKey || (state?.phase !== 'voting' && state?.phase !== 'scheduled')) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      fetchVoting(apiKey)
        .then(absorb)
        .catch(() => {
          /* zostaje jak było */
        });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [apiKey, state?.phase, absorb]);

  /** Każde działanie kończy się świeżym stanem z serwera, więc ekran nigdy nie zgaduje. */
  const run = useCallback(
    async (action: () => Promise<unknown>, message?: string) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const result = await action();
        /* Część działań oddaje cały stan, część samo `ok`. Te drugie muszą go doczytać: po
           zapisie uczestnika zmieniają się nie tylko jego pola, ale i średnie obok. */
        if (result && typeof result === 'object' && 'participants' in result) {
          absorb(result as VotingState);
        } else {
          absorb(await fetchVoting(apiKey));
        }
        if (message) setNote(message);
      } catch (problem) {
        setError(explain(problem));
      } finally {
        setBusy(false);
      }
    },
    [apiKey, absorb, explain]
  );

  const loadRoster = useCallback(async () => {
    setRosterBusy(true);
    setError(null);
    try {
      const result = await fetchRoster(apiKey);
      setRoster(result.rows ?? []);
    } catch (problem) {
      setError(explain(problem));
      setRoster([]);
    } finally {
      setRosterBusy(false);
    }
  }, [apiKey, explain]);

  async function pickPhoto(file: File, participantId?: string) {
    setUploading(true);
    setError(null);
    try {
      const photo = await downscale(file);
      const stored = await uploadParticipantPhoto(apiKey, photo);
      if (participantId) {
        // Wgranie i zapis to dwa kroki: nieudane wgranie nie ma prawa wpisać w wiersz
        // ścieżki do pliku, którego tam nie ma.
        await run(() => saveParticipant(apiKey, participantId, { imagePath: stored.imagePath }), t('vote.saved'));
      } else {
        setDraftPhoto(stored);
      }
    } catch (problem) {
      setError(explain(problem));
      // Podgląd zdjęcia w wierszu musi zniknąć, gdy wgranie się nie udało — inaczej organizator
      // widzi zdjęcie, którego nie ma na serwerze, i nie ma powodu próbować ponownie.
      throw problem;
    } finally {
      setUploading(false);
    }
  }

  const phaseLabel = state
    ? {
        scheduled: t('vote.phaseScheduled'),
        voting: t('vote.phaseVoting'),
        closed: t('vote.phaseClosed')
      }[state.phase]
    : t('common.loading');
  const phaseTone =
    state?.phase === 'voting'
      ? 'bg-yellow text-navy-950'
      : state?.phase === 'closed'
        ? 'bg-white/15 text-white'
        : 'bg-blue-600 text-white';

  const field =
    'w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-sm text-white outline-none '
    + 'focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2';
  const chip =
    'rounded-full px-4 py-2 text-xs font-extrabold transition-colors disabled:opacity-45 disabled:cursor-not-allowed';

  /* Klasyfikacja i trzy liczby nad nią.
     ---------------------------------------------------------------------------
     Liczone tu, a nie na serwerze: serwer i tak odsyła każdemu uczestnikowi jego średnią i
     liczbę głosów, więc osobna końcówka na tę samą sumę byłaby drugim źródłem tej samej
     liczby — i pierwszym miejscem, w którym panel pokazałby coś innego niż strona.

     Tylko uczestnicy w głosowaniu: wyłączony wóz nie jest w klasyfikacji, bo nie startuje.

     Kolejność to suma punktów, przy remisie liczba głosów, na końcu średnia — dokładnie ta,
     którą Worker liczy dla podium i dla listów do zwycięzców. Poprzednia wersja sortowała po
     średniej i obiecywała w tym samym komentarzu, że „jedna dziesiątka nie pobije ośmiu
     dziewiątek": pobijała, bo liczba głosów wchodziła dopiero przy remisie średnich, a 10.00
     i 9.00 remisem nie są. */
  const activeParticipants = (state?.participants ?? []).filter((row) => row.active);
  const rated = activeParticipants.filter((row) => row.voteCount > 0);
  const standings = [...rated].sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      b.voteCount - a.voteCount ||
      b.averageScore - a.averageScore ||
      a.startNumber - b.startNumber
  );
  /* Suma prosto z sum punktów, a nie z `średnia × liczba głosów`: średnia przychodzi
     zaokrąglona do dwóch miejsc, więc mnożenie jej z powrotem odtwarzało sumę z błędem. */
  const totalPoints = rated.reduce((sum, row) => sum + row.totalScore, 0);
  const totalRatedVotes = rated.reduce((sum, row) => sum + row.voteCount, 0);
  const overallAverage = totalRatedVotes > 0 ? totalPoints / totalRatedVotes : null;

  /* Zgłoszenia, których nie ma jeszcze wśród uczestników.
     Odsiewane po `registrationId`, a nie po imieniu i nazwisku: dwoje kuzynów o tym samym
     imieniu i nazwisku to na tej stronie normalna sytuacja, pod którą jest osobny indeks
     w bazie (migracja 0023). Odsiewanie po nazwisku ukryłoby jednego z nich. */
  const takenRegistrations = new Set(
    (state?.participants ?? [])
      .map((participant) => participant.registrationId)
      .filter((value): value is string => Boolean(value))
  );
  const rosterNeedle = rosterQuery.trim().toLowerCase();
  const rosterAvailable = (roster ?? [])
    .filter((row) => !takenRegistrations.has(row.id))
    .filter(
      (row) =>
        !rosterNeedle
        || `${row.raceNumber ?? ''} ${row.firstName} ${row.lastName} ${row.cartName} ${row.category}`
          .toLowerCase()
          .includes(rosterNeedle)
    );

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      {/* ------------------------------------------------------------ czas */}
      <section className="rounded-3xl border border-white/10 bg-navy-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-extrabold text-white">{t('vote.timer')}</h2>
            <span
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider',
                phaseTone
              )}
            >
              {phaseLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className={cn(chip, 'inline-flex items-center gap-2 bg-white/10 text-white hover:bg-white/20')}
          >
            <RefreshCw size={13} className={busy ? 'animate-spin' : undefined} /> {t('top.refresh')}
          </button>
        </div>

        {state?.status === 'closed' && state.phase === 'closed' ? (
          <p className="mt-2 text-xs text-white/50">{t('vote.manualClosed')}</p>
        ) : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-white/45">{t('vote.raceStart')}</span>
            <DateTimeField
              value={startAt}
              onChange={setStartAt}
              locale={t('locale.intl')}
              className={field}
              labels={{
                open: t('vote.pickMoment'),
                clear: t('vote.pickClear'),
                today: t('vote.pickToday'),
                hour: t('vote.pickHour'),
                minute: t('vote.pickMinute')
              }}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-white/45">
              {t('vote.duration')} ({t('vote.minutes')})
            </span>
            <input
              type="number"
              min={1}
              max={1440}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className={field}
            />
          </label>
          <div className="grid gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-white/45">{t('vote.endsAt')}</span>
            <p className="py-2 text-sm font-bold tabular-nums text-white">
              {formatMoment(state?.votingEndsAt ?? null, t('locale.intl'))}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={busy || !startAt}
            onClick={() =>
              void run(
                () => scheduleVoting(apiKey, new Date(startAt).toISOString(), duration),
                t('vote.saved')
              )
            }
            className={cn(chip, 'bg-yellow text-navy-950 hover:bg-white')}
          >
            {t('vote.saveSchedule')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => openVoting(apiKey, duration))}
            className={cn(chip, 'inline-flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-500')}
          >
            <Play size={13} /> {t('vote.openNow')}
          </button>
          <button
            type="button"
            disabled={busy || state?.phase === 'closed'}
            onClick={() => {
              // Zamknięcia nie da się cofnąć zegarem, więc pytanie jest tu na miejscu.
              if (window.confirm(t('vote.closeConfirm'))) void run(() => closeVoting(apiKey));
            }}
            className={cn(chip, 'inline-flex items-center gap-2 bg-white/10 text-white hover:bg-white/20')}
          >
            <Square size={13} /> {t('vote.closeNow')}
          </button>
          {!startAt ? <p className="self-center text-xs text-white/40">{t('vote.needStart')}</p> : null}
        </div>
      </section>

      {error ? (
        <p className="rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-white">{error}</p>
      ) : null}
      {note ? (
        <p className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white">{note}</p>
      ) : null}

      {/* --------------------------------------------------------- wyniki */}
      <section className="rounded-3xl border border-white/10 bg-navy-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-white">{t('vote.results')}</h2>
            <p className="mt-1 max-w-lg text-xs leading-relaxed text-white/45">{t('vote.resultsLead')}</p>
          </div>
          <button
            type="button"
            disabled={busy || state?.phase !== 'closed'}
            onClick={() =>
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  setWinners(await mailWinners(apiKey));
                } catch (problem) {
                  setError(explain(problem));
                } finally {
                  setBusy(false);
                }
              })()
            }
            className={cn(chip, 'inline-flex items-center gap-2 bg-yellow text-navy-950 hover:bg-white')}
          >
            <Trophy size={13} /> {t('vote.winnersSend')}
          </button>
        </div>

        {/* Trzy liczby, nie jedna.
            „Oddanych głosów: 0" nie mówi, czy nikt nie zagłosował, czy nie ma jeszcze
            uczestników — a to dwa różne kłopoty i dwie różne czynności. Ocenione pojazdy
            odpowiadają na drugie pytanie, a średnia mówi, czy publiczność w ogóle rozróżnia
            wozy, czy wszystkim stawia dziesiątki. */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { value: state ? String(state.totalVotes ?? 0) : '—', label: t('vote.totalVotes'), strong: true },
            { value: state ? `${rated.length} / ${activeParticipants.length}` : '—', label: t('vote.rated') },
            { value: overallAverage === null ? '—' : overallAverage.toFixed(2), label: t('vote.average') }
          ].map((box) => (
            <div key={box.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div
                className={cn(
                  'text-3xl font-extrabold tabular-nums',
                  box.strong ? 'text-yellow' : 'text-white'
                )}
              >
                {box.value}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-wider text-white/45">{box.label}</div>
            </div>
          ))}
        </div>

        {/* ------------------------------------------------- klasyfikacja
            Średnie były do tej pory rozsypane po liście uczestników uporządkowanej numerami
            startowymi — czyli „kto prowadzi" wymagało przejrzenia kilkudziesięciu wierszy i
            porównania liczb w głowie. To jest jedyne pytanie, które organizator zadaje w
            trakcie głosowania, więc ma własne miejsce i własną kolejność.

            Ta sama reguła co na cokole: średnia, przy remisie liczba głosów. Inaczej jedna
            dziesiątka od jednej osoby biłaby osiem dziewiątek. */}
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-extrabold text-white">{t('vote.standings')}</h3>
            <p className="text-[11px] text-white/40">
              {state?.phase === 'closed' ? t('vote.standingsFinal') : t('vote.standingsLive')}
            </p>
          </div>

          {standings.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm text-white/45">
              {t('vote.standingsEmpty')}
            </p>
          ) : (
            <ol className="mt-3 grid gap-1.5">
              {standings.map((row, index) => {
                const place = index + 1;
                return (
                  <li
                    key={row.id}
                    className={cn(
                      'grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-3 py-2',
                      place === 1
                        ? 'border-yellow/60 bg-yellow/10'
                        : place <= 3
                          ? 'border-white/20 bg-white/[0.05]'
                          : 'border-white/10 bg-transparent'
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-8 w-8 place-items-center rounded-xl text-sm font-extrabold tabular-nums',
                        place === 1 ? 'bg-yellow text-navy-950' : 'bg-white/10 text-white'
                      )}
                    >
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
                    {/* Na żółto wynik, po którym stoi to miejsce — suma punktów. Średnia obok,
                        drobnym drukiem: jest ciekawa, ale nie ona rozstrzyga, a postawiona na
                        pierwszym planie kazałaby czytać klasyfikację jako pomyłkę, bo drugi wiersz
                        bywa wyżej oceniony od pierwszego. */}
                    <span className="flex items-baseline gap-1.5">
                      <b className="text-lg font-extrabold tabular-nums text-yellow">
                        {row.totalScore}
                      </b>
                      <small className="text-[10px] uppercase tracking-wider text-white/45">
                        {t('vote.points')} · {row.voteCount} {t('vote.votes')} · {t('vote.avgShort')}{' '}
                        {row.averageScore.toFixed(2)}
                      </small>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {winners ? (
          <div className="mt-4 grid gap-1.5 text-sm text-white">
            {winners.sent.length > 0 ? (
              <p>
                <span className="text-white/50">{t('vote.winnersSent')}</span>{' '}
                {winners.sent.map((row) => `${row.place}. ${row.participantName}`).join(' · ')}
              </p>
            ) : null}
            {winners.unreachable.length > 0 ? (
              <p className="text-yellow">
                <span className="text-white/50">{t('vote.winnersUnreachable')}</span>{' '}
                {winners.unreachable
                  .map((row) => `${row.place}. ${row.participantName} (#${row.startNumber})`)
                  .join(' · ')}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ---------------------------------------------------- uczestnicy */}
      <section className="rounded-3xl border border-white/10 bg-navy-900 p-6">
        <h2 className="font-extrabold text-white">{t('vote.participants')}</h2>

        {/* ------------------------------------------- wybór z listy startowej
            Kto się zapisał, ten już podał numer, kategorię i nazwę wózka. Przepisywanie tego
            z powrotem w pięć pól to nie tylko praca, ale i literówka w nazwisku, przez którą
            list do zwycięzcy pójdzie w próżnię — zwycięzca bez zgłoszenia trafia na listę
            `unreachable`.

            Wysyłane jest samo `registrationId`, bez pozostałych pól. Worker uzupełnia je
            z bazy WYŁĄCZNIE wtedy, gdy pole jest `undefined` (patrz votingAdminSave) — a
            wysłanie pustego numeru startowego dałoby `VOTING_BAD_START_NUMBER`. */}
        <div className="mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const next = !rosterOpen;
              setRosterOpen(next);
              if (next && roster === null) void loadRoster();
            }}
            className={cn(chip, 'inline-flex items-center gap-2 bg-white/10 text-white hover:bg-white/20')}
          >
            <ListPlus size={13} /> {rosterOpen ? t('vote.rosterHide') : t('vote.fromRoster')}
          </button>

          {rosterOpen ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              {rosterBusy ? (
                <p className="px-1 py-2 text-sm text-white/50">{t('vote.rosterLoading')}</p>
              ) : rosterAvailable.length === 0 ? (
                <p className="px-1 py-2 text-sm text-white/50">
                  {(roster?.length ?? 0) === 0 ? t('vote.rosterEmpty') : t('vote.rosterAllAdded')}
                </p>
              ) : (
                <>
                  <input
                    type="search"
                    placeholder={t('vote.rosterSearch')}
                    value={rosterQuery}
                    onChange={(event) => setRosterQuery(event.target.value)}
                    className={field}
                  />
                  <ul className="mt-2 max-h-72 divide-y divide-white/5 overflow-y-auto">
                    {rosterAvailable.map((row) => (
                      <li key={row.id} className="flex items-center gap-3 py-2">
                        <span className="w-12 shrink-0 text-sm font-extrabold tabular-nums text-yellow">
                          {row.raceNumber || '—'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-white">
                            {row.firstName} {row.lastName}
                          </span>
                          <span className="block truncate text-xs text-white/45">
                            {[row.cartName, row.category].filter(Boolean).join(' · ')}
                            {row.raceNumber ? '' : ` · ${t('vote.rosterNoNumber')}`}
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => saveParticipant(apiKey, null, { registrationId: row.id }),
                              t('vote.saved')
                            )
                          }
                          className={cn(chip, 'shrink-0 bg-yellow text-navy-950 hover:bg-white')}
                        >
                          {t('vote.rosterAdd')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}
        </div>

        <p className="mt-5 text-[11px] uppercase tracking-wider text-white/35">{t('vote.manualAdd')}</p>

        {/* Dodawanie: pięć pól i zdjęcie, bez okna modalnego. Formularz wpisany w stronę
            znaczy, że da się dodać dziesięciu uczestników po kolei, nie zamykając niczego. */}
        <form
          className="mt-4 grid gap-3 sm:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                saveParticipant(apiKey, null, {
                  startNumber: draft.startNumber.trim(),
                  category: draft.category.trim(),
                  firstName: draft.firstName.trim(),
                  lastName: draft.lastName.trim(),
                  projectName: draft.projectName.trim() || undefined,
                  imagePath: draftPhoto?.imagePath
                }),
              t('vote.saved')
            ).then(() => {
              setDraft({
                startNumber: '',
                category: draft.category,
                firstName: '',
                lastName: '',
                projectName: ''
              });
              setDraftPhoto(null);
              if (fileInput.current) fileInput.current.value = '';
            });
          }}
        >
          <input
            required
            inputMode="numeric"
            placeholder={t('vote.startNumber')}
            value={draft.startNumber}
            onChange={(event) => setDraft({ ...draft, startNumber: event.target.value })}
            className={field}
          />
          <input
            required
            placeholder={t('vote.category')}
            value={draft.category}
            onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            className={field}
          />
          <input
            required
            placeholder={t('vote.firstName')}
            value={draft.firstName}
            onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
            className={field}
          />
          <input
            required
            placeholder={t('vote.lastName')}
            value={draft.lastName}
            onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
            className={field}
          />
          <input
            placeholder={t('vote.project')}
            value={draft.projectName}
            onChange={(event) => setDraft({ ...draft, projectName: event.target.value })}
            className={field}
          />
          <div className="flex gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void pickPhoto(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className={cn(
                chip,
                'inline-flex flex-1 items-center justify-center gap-1.5 bg-white/10 text-white hover:bg-white/20'
              )}
            >
              <ImagePlus size={13} /> {uploading ? t('vote.uploading') : draftPhoto ? '✓' : t('vote.photo')}
            </button>
            <button type="submit" disabled={busy} className={cn(chip, 'bg-yellow text-navy-950 hover:bg-white')}>
              +
            </button>
          </div>
        </form>

        {state && state.participants.length === 0 ? (
          <p className="mt-5 text-sm text-white/45">{t('vote.noParticipants')}</p>
        ) : null}

        <ul className="mt-5 grid gap-2.5">
          {state?.participants.map((row) => (
            <ParticipantRow
              key={row.id}
              t={t}
              row={row}
              busy={busy}
              field={field}
              chip={chip}
              onSave={(changes) => void run(() => saveParticipant(apiKey, row.id, changes), t('vote.saved'))}
              onPhoto={(file) => void pickPhoto(file, row.id)}
              onRemove={() => {
                if (window.confirm(t('vote.removeConfirm'))) void run(() => removeParticipant(apiKey, row.id));
              }}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Jeden uczestnik: podgląd, przełącznik udziału i usunięcie.
 *
 * Nazwa pojazdu i numer są edytowalne w miejscu, bo to jedyne dwie rzeczy, które w dniu
 * zawodów naprawdę się poprawia — i wtedy poprawia się je na telefonie, jedną ręką. Imię
 * i nazwisko zostają, bo przy zawodniku z listy startowej pochodzą ze zgłoszenia i cicha
 * zmiana tutaj rozjechałaby je z tym, co jest na podpisanym formularzu.
 */
function ParticipantRow({
  t,
  row,
  busy,
  field,
  chip,
  onSave,
  onPhoto,
  onRemove
}: {
  t: (key: TranslateKey) => string;
  row: VotingParticipant;
  busy: boolean;
  field: string;
  chip: string;
  onSave: (changes: ParticipantEdit) => void;
  onPhoto: (file: File) => void;
  onRemove: () => void;
}) {
  const [startNumber, setStartNumber] = useState(String(row.startNumber));
  const [projectName, setProjectName] = useState(row.projectName);
  const input = useRef<HTMLInputElement>(null);

  // Świeże dane z serwera nadpisują to, co w polach — inaczej po zapisie pole trzymałoby
  // wartość, którą serwer mógł odrzucić albo poprawić.
  useEffect(() => {
    setStartNumber(String(row.startNumber));
  }, [row.startNumber]);
  useEffect(() => {
    setProjectName(row.projectName);
  }, [row.projectName]);

  const dirty = startNumber !== String(row.startNumber) || projectName !== row.projectName;

  return (
    <li
      className={cn(
        'grid gap-3 rounded-2xl border p-3 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center',
        row.active ? 'border-white/10 bg-white/5' : 'border-white/10 bg-transparent opacity-60'
      )}
    >
      {/* Zdjęcie jest przyciskiem, nie ozdobą: w dniu zawodów pojazd wygląda inaczej niż na
          zgłoszeniu i podmienia się je stukając w kafelek, a nie szukając osobnej ikony. */}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="relative aspect-[4/3] w-[72px] overflow-hidden rounded-xl bg-white/10"
        aria-label={t('vote.uploadPhoto')}
      >
        {row.photo ? (
          <img src={row.photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-white/30">
            <ImagePlus size={16} />
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPhoto(file);
        }}
      />

      <div className="grid gap-2 sm:grid-cols-[86px_minmax(0,1fr)_auto] sm:items-center">
        <input
          inputMode="numeric"
          value={startNumber}
          onChange={(event) => setStartNumber(event.target.value)}
          className={field}
          aria-label={t('vote.startNumber')}
        />
        <div className="grid gap-1">
          <input
            value={projectName}
            placeholder={t('vote.project')}
            onChange={(event) => setProjectName(event.target.value)}
            className={field}
            aria-label={t('vote.project')}
          />
          <span className="text-[11px] uppercase tracking-wider text-white/45">
            {row.firstName} {row.lastName} · {row.category}
          </span>
        </div>
        {/* Ta sama para liczb co w klasyfikacji wyżej i w tej samej kolejności: punkty na
            pierwszym planie, reszta drobnym drukiem. Dwa różne porządki na jednym ekranie
            czytałoby się jako dwa różne wyniki. */}
        <p className="flex items-baseline gap-1.5 sm:justify-end">
          <b className="text-lg font-extrabold tabular-nums text-yellow">
            {row.voteCount ? row.totalScore : '—'}
          </b>
          <small className="text-[10px] uppercase tracking-wider text-white/45">
            {row.voteCount
              ? `${t('vote.points')} · ${row.voteCount} ${t('vote.votes')}`
              : t('vote.noVotes')}
          </small>
        </p>
      </div>

      <div className="flex flex-wrap gap-2 sm:justify-end">
        {dirty ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave({ startNumber, projectName })}
            className={cn(chip, 'bg-yellow text-navy-950 hover:bg-white')}
          >
            {t('vote.save')}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ active: !row.active })}
          className={cn(
            chip,
            row.active ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-blue-600 text-white hover:bg-blue-500'
          )}
        >
          {row.active ? t('vote.active') : t('vote.inactive')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className={cn(chip, 'bg-white/5 text-white/60 hover:bg-coral hover:text-white')}
          aria-label={t('vote.remove')}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}
