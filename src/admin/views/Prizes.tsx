import { useCallback, useEffect, useState } from 'react';
import { Award, RefreshCw, Trash2 } from 'lucide-react';
import type { TranslateKey } from '../i18n';
import {
  clearPrize,
  fetchPrizes,
  fetchVoting,
  setPrize,
  type VotingParticipant
} from '../api';
import {
  PRIZE_CATEGORIES,
  PRIZE_COUNT,
  normalisePrizes,
  participantLabel,
  prizeCountByStartNumber,
  prizeHasWinner,
  prizeWinnerLabel,
  type PrizeRow
} from '../lib/awards';
import { ActionButton } from './ActionButton';

/**
 * Ręczne przypisanie zwycięzców dwunastu nagród jury.
 * ============================================================================
 * DLACZEGO RĘCZNIE, A NIE Z GŁOSOWANIA
 *   Nagroda publiczności wynika z oddanych głosów i rozstrzyga się sama — liczy ją Worker i
 *   pokazuje klasyfikacja w zakładce „Głosowanie". Dwanaście nagród niżej to decyzje JURY:
 *   najszybszy w kategorii, najzabawniejszy wóz, najmłodszy kierowca. Żadnej z nich nie da się
 *   wyliczyć z danych, które ta strona zbiera, więc jedyne uczciwe rozwiązanie to wpisanie ich
 *   z ręki — i to jest ten ekran.
 *
 * DLACZEGO OSOBNA ZAKŁADKA
 *   Świadomie NIE w „Głosowaniu". Tam stoją przyciski czyszczące wszystkie głosy i wysyłające
 *   listy do zwycięzców, czyli działania bez cofnięcia. Wpisywanie dwunastu nazwisk to praca
 *   na kilkanaście minut, przy stoliku, często we dwoje — i przewijanie w trakcie obok
 *   „Wyczyść wszystkie głosy" jest zaproszeniem do pomyłki, której nikt nie odkręci.
 *
 * DLACZEGO WIERSZE SĄ ZAWSZE CZTERY RAZY TRZY
 *   Kategorii jest dwanaście i lista jest zamknięta (patrz `lib/awards.ts`). Ekran rysuje je
 *   wszystkie, także puste, bo pytanie „której nagrody jeszcze nie przypisaliśmy" jest
 *   zadawane co chwilę, a lista pokazująca tylko przypisane odpowiada na nie przez
 *   wyliczanie w głowie, czego brakuje.
 *
 * GDY KOŃCÓWKA NIE ODPOWIADA
 *   Worker do `prizes` i `prize-set` powstaje równolegle z tym ekranem, więc panel wdrożony
 *   wcześniej MUSI to znieść: `normalisePrizes` oddaje wtedy `null`, ekran pokazuje zdanie
 *   „nie udało się odczytać" i guzik ponowienia, a zapisy są zablokowane z tym samym powodem
 *   wypisanym obok. Nie biały ekran i nie dwanaście pustych wierszy — puste wiersze czyta się
 *   jako „nikomu nic nie przypisano" i zapraszają do zrobienia tego drugi raz.
 */

/** Wersja robocza jednego wiersza. Te trzy pola to dokładnie to, co przyjmuje `prize-set`. */
interface Draft {
  participantId: string;
  winnerLabel: string;
  note: string;
}

const EMPTY_DRAFT: Draft = { participantId: '', winnerLabel: '', note: '' };

/** Wersja robocza z zapisanego wiersza. Jedno miejsce, bo używane przy odczycie i po zapisie. */
function draftFromRow(row: PrizeRow): Draft {
  return { participantId: row.participantId, winnerLabel: row.winnerLabel, note: row.note };
}

export function Prizes({ t, apiKey }: { t: (key: TranslateKey) => string; apiKey: string }) {
  /* `null` znaczy „nie wiem" — patrz „GDY KOŃCÓWKA NIE ODPOWIADA". Pusta tablica nie jest tu
     możliwa: `normalisePrizes` zawsze dopełnia do dwunastu wierszy albo oddaje `null`. */
  const [rows, setRows] = useState<PrizeRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [participants, setParticipants] = useState<VotingParticipant[] | null>(null);
  const [loading, setLoading] = useState(true);
  /** Klucz nagrody, której zapis właśnie leci. Nie jedna flaga: dwanaście wierszy, jeden zapis. */
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setNote(null);
    try {
      /* Dwa odczyty równolegle, ale wynik każdego oceniany osobno: lista startowa i lista
         nagród psują się z różnych powodów i osobno się o nich mówi. Wspólne `catch` na oba
         znaczyłoby, że brak jednego uczestnika ukrywa przypisane nagrody. */
      const [prizeResponse, votingResponse] = await Promise.allSettled([
        fetchPrizes(apiKey),
        fetchVoting(apiKey)
      ]);

      const parsed =
        prizeResponse.status === 'fulfilled' ? normalisePrizes(prizeResponse.value.prizes) : null;
      setRows(parsed);
      setFailed(parsed === null);
      /* Wersje robocze przepisywane z odczytu ZA KAŻDYM razem. Trzymanie starych po odświeżeniu
         pokazywałoby wpisy, których na serwerze nie ma — a to jest ekran, na którym dwie osoby
         wpisują nagrody z dwóch telefonów. */
      setDrafts(
        Object.fromEntries((parsed ?? []).map((row) => [row.prizeKey, draftFromRow(row)]))
      );

      setParticipants(
        votingResponse.status === 'fulfilled' ? votingResponse.value.participants : null
      );
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Lista startowa uporządkowana numerami startowymi, bo tak jest wołana przez mikrofon i tak
     leży na kartce przy stoliku jury. Wyłączeni uczestnicy zostają: nagrodę jury da się przyznać
     wozowi, który nie wystartował w głosowaniu publiczności — to dwie różne rzeczy. */
  const roster = [...(participants ?? [])].sort((a, b) => a.startNumber - b.startNumber);
  const assignedCount = (rows ?? []).filter(prizeHasWinner).length;
  const prizeCounts = prizeCountByStartNumber(rows ?? []);

  /** Zapis jednego wiersza; po nim pełny odczyt, bo liczba „przypisano N z 12" musi się zgadzać. */
  const save = async (prizeKey: string, draft: Draft) => {
    setRowBusy(prizeKey);
    setNote(null);
    try {
      await setPrize(apiKey, prizeKey, {
        participantId: draft.participantId,
        winnerLabel: draft.winnerLabel.trim(),
        note: draft.note.trim()
      });
      await load();
      setNote(t('award.saved'));
    } catch (_) {
      /* Bez rozbierania kodu odmowy: ta końcówka ma jeden powód niepowodzenia, który da się
         opisać z panelu — nie zapisała. Zdanie mówi wprost, że nic się nie zmieniło, bo
         najgorsza wersja tego komunikatu to taka, po której nie wiadomo, czy powtórzyć. */
      setNote(t('award.failed'));
    } finally {
      setRowBusy(null);
    }
  };

  const clear = async (prizeKey: string) => {
    if (!window.confirm(t('award.clearConfirm'))) return;
    setRowBusy(prizeKey);
    setNote(null);
    try {
      await clearPrize(apiKey, prizeKey);
      await load();
      setNote(t('award.cleared'));
    } catch (_) {
      setNote(t('award.failed'));
    } finally {
      setRowBusy(null);
    }
  };

  const field =
    'w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none '
    + 'placeholder:text-white/30 focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2';

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <section className="rounded-3xl border border-white/10 bg-navy-900 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-extrabold text-white">
              <Award size={16} className="text-yellow" />
              {t('award.title')}
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/45">{t('award.lead')}</p>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-white/35">
              {t('award.audienceNote')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wider text-white/45">
              {t('award.progress')}{' '}
              <b className="text-sm tabular-nums text-yellow">
                {assignedCount} {t('award.progressOf')} {PRIZE_COUNT}
              </b>
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-extrabold text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-white/50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
              {t('award.reload')}
            </button>
          </div>
        </div>

        {failed ? (
          <p className="mt-4 rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm leading-relaxed text-white">
            {t('award.loadFailed')}
          </p>
        ) : null}
        {participants === null && !loading ? (
          <p className="mt-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-[13px] leading-relaxed text-white/60">
            {t('award.noParticipants')}
          </p>
        ) : null}
        {note ? (
          <p role="status" className="mt-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white">
            {note}
          </p>
        ) : null}
      </section>

      {PRIZE_CATEGORIES.map((category) => {
        /* Wiersz z serwera i wersja robocza czytane przez `??`, bo `Record` przy włączonym
           `noUncheckedIndexedAccess` oddaje `| undefined`. To nie jest formalność: przy
           nieudanym odczycie `drafts` jest pusty, a ekran ma się i tak narysować. */
        const row = (rows ?? []).find((entry) => entry.prizeKey === category.prizeKey) ?? null;
        const draft = drafts[category.prizeKey] ?? EMPTY_DRAFT;
        const savedWinner = row === null ? '' : prizeWinnerLabel(row);
        const hasWinner = row !== null && prizeHasWinner(row);
        const busyHere = rowBusy === category.prizeKey;
        const dirty =
          row === null
          || draft.participantId !== row.participantId
          || draft.winnerLabel.trim() !== row.winnerLabel.trim()
          || draft.note.trim() !== row.note.trim();

        /* Ile nagród ma już ten uczestnik. Nie blokada — jeden wóz może wziąć kilka nagród —
           tylko liczba przy nazwisku, żeby jury widziało, że właśnie daje trzecią temu samemu. */
        const alsoHas = row !== null && row.startNumber > 0
          ? (prizeCounts.get(row.startNumber) ?? 0)
          : 0;

        const saveReason = failed
          ? t('award.loadFailed')
          : busyHere
            ? t('award.saveBusy')
            : !draft.participantId && draft.winnerLabel.trim() === ''
              ? t('award.pickOrManual')
              : !dirty
                ? t('award.unchanged')
                : '';
        const clearReason = failed
          ? t('award.loadFailed')
          : busyHere
            ? t('award.saveBusy')
            : hasWinner
              ? ''
              : t('award.clearNothing');

        return (
          <section
            key={category.prizeKey}
            className="rounded-3xl border border-white/10 bg-navy-900 p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="flex items-baseline gap-2 text-sm font-extrabold text-white">
                <span className="grid size-7 place-items-center rounded-lg bg-yellow text-[11px] font-extrabold tabular-nums text-navy-950">
                  {category.number}
                </span>
                {t(category.label)}
              </h3>
              <p className="text-[11px] text-white/45">
                {t('award.winner')}:{' '}
                {savedWinner ? (
                  <b className="text-white">{savedWinner}</b>
                ) : (
                  <span className="text-white/35">{t('award.empty')}</span>
                )}
                {!row?.participantId && savedWinner ? (
                  <span className="ml-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
                    {t('award.manualBadge')}
                  </span>
                ) : null}
                {alsoHas > 1 ? (
                  <span className="ml-1.5 text-yellow">
                    {alsoHas} {t('award.alsoHas')}
                  </span>
                ) : null}
              </p>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[11px] uppercase tracking-wider text-white/45">
                  {t('award.pick')}
                </span>
                <select
                  value={draft.participantId}
                  onChange={(event) => {
                    const participantId = event.target.value;
                    setDrafts((current) => ({
                      ...current,
                      [category.prizeKey]: {
                        ...(current[category.prizeKey] ?? EMPTY_DRAFT),
                        participantId,
                        /* Wybór z listy czyści wpis z ręki. Dwa źródła zwycięzcy w jednym
                           wierszu to pytanie „które z nich jest prawdziwe", na które kontrakt
                           końcówki nie odpowiada — a odpowiedź zapadłaby po cichu w Workerze. */
                        winnerLabel: participantId ? '' : (current[category.prizeKey]?.winnerLabel ?? '')
                      }
                    }));
                  }}
                  className={field}
                >
                  <option value="" className="bg-navy-950">
                    {t('award.pickNobody')}
                  </option>
                  {roster.map((participant) => (
                    <option key={participant.id} value={participant.id} className="bg-navy-950">
                      {participantLabel(participant)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-[11px] uppercase tracking-wider text-white/45">
                  {t('award.manual')}
                </span>
                <input
                  value={draft.winnerLabel}
                  maxLength={120}
                  placeholder={t('award.manualPlaceholder')}
                  onChange={(event) => {
                    const winnerLabel = event.target.value;
                    setDrafts((current) => ({
                      ...current,
                      [category.prizeKey]: {
                        ...(current[category.prizeKey] ?? EMPTY_DRAFT),
                        winnerLabel,
                        // Wpis z ręki zdejmuje wybór z listy — patrz komentarz w liście wyżej.
                        participantId: winnerLabel.trim()
                          ? ''
                          : (current[category.prizeKey]?.participantId ?? '')
                      }
                    }));
                  }}
                  className={field}
                />
              </label>

              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-white/45">
                  {t('award.note')}
                </span>
                <input
                  value={draft.note}
                  maxLength={200}
                  placeholder={t('award.notePlaceholder')}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDrafts((current) => ({
                      ...current,
                      [category.prizeKey]: {
                        ...(current[category.prizeKey] ?? EMPTY_DRAFT),
                        note: value
                      }
                    }));
                  }}
                  className={field}
                />
              </label>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-white/35">{t('award.manualHint')}</p>

            <div className="mt-3 flex flex-wrap items-start gap-2.5">
              <ActionButton
                label={busyHere ? t('award.saving') : t('award.assign')}
                reason={saveReason}
                tone="bg-yellow text-navy-950 hover:bg-white"
                onPress={() => void save(category.prizeKey, draft)}
              />
              <ActionButton
                label={t('award.clear')}
                reason={clearReason}
                tone="border border-coral/40 text-coral hover:bg-coral hover:text-white"
                icon={<Trash2 size={13} />}
                onPress={() => void clear(category.prizeKey)}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
