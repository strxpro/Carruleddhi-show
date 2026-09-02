import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Pencil, Printer, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { Highlighter } from './Highlighter';
import { cn, formatMoment } from '@/lib/utils';
import type { PanelLocale, TranslateKey } from '../i18n';
import {
  deleteRegistration,
  fetchFormsBundle,
  fetchRoster,
  updateRegistration,
  type RosterEdit,
  type RosterRow
} from '../api';
import { StartCards } from './StartCards';

/* The `pick()` helper and the snake_case fallbacks that used to be at the top of this file
   are gone. They existed because nothing on the server answered `roster` — the request went
   to the Make webhook, came back with no rows at all, and nobody could say what shape the
   rows would have had. The endpoint exists now and returns one documented shape, so the
   component reads fields by name. */

const STATUSES = ['new', 'confirmed', 'withdrawn'] as const;

export function Registrations({
  t,
  locale,
  apiKey,
  onChanged,
  highlightQuery
}: {
  t: (key: TranslateKey) => string;
  locale: PanelLocale;
  apiKey: string;
  onChanged: () => void;
  highlightQuery?: string;
}) {
  const pl = locale === 'pl';
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState<string>('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<RosterRow | null>(null);

  const load = useCallback(() => {
    setError('');
    fetchRoster(apiKey)
      .then((data) => setRows(Array.isArray(data.rows) ? data.rows : []))
      .catch(() => setError('load'));
  }, [apiKey]);

  useEffect(load, [load]);

  /* Newest first on screen.
     The server sends the roster oldest first on purpose — that is the order the numbers were
     given out and the order a start list reads in — and `StartCards` below still prints in
     exactly that order. But the screen answers a different question: "who just signed up".
     Sorting a copy rather than `rows` is what keeps those two apart; sorting in place would
     silently reshuffle the stack of cards carried to the start line. */
  const visible = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLowerCase();
    const found = !needle
      ? rows
      : rows.filter((row) =>
          [row.raceNumber, row.firstName, row.lastName, row.cartName, row.email, row.phone, row.teamName]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(needle)
        );
    return [...found].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rows, query]);

  /** Replaces one row with what the server says it now holds. */
  const applyRow = (row: RosterRow) =>
    setRows((current) => (current ? current.map((one) => (one.id === row.id ? row : one)) : current));

  const remove = async (row: RosterRow) => {
    const question = pl
      ? `Usunąć zgłoszenie ${row.firstName} ${row.lastName} na zawsze? Do rezygnacji użyj statusu „withdrawn" — wtedy numer wraca do puli, a wiersz zostaje.`
      : `Eliminare per sempre l’iscrizione di ${row.firstName} ${row.lastName}? Per un ritiro usa lo stato «withdrawn»: il numero torna disponibile e la riga resta.`;
    if (!window.confirm(question)) return;
    try {
      await deleteRegistration(apiKey, row.id);
      setRows((current) => (current ? current.filter((one) => one.id !== row.id) : current));
      onChanged();
    } catch {
      setError('write');
    }
  };

  /**
   * Pobranie wypelnionych formularzy.
   *
   * `ids` puste znaczy „wszyscy" — tak wola przycisk nad tabela. Jeden identyfikator to
   * strzalka przy jednej osobie. W obu przypadkach wraca JEDEN plik: przy kilkunastu
   * zawodnikach osobne pliki znaczylyby kilkanascie okien drukowania zamiast jednego.
   *
   * `busyId` trzyma to, co sie wlasnie pobiera ('all' albo identyfikator), zeby zakrecic
   * mozna bylo tylko ten jeden przycisk — reszta tabeli zostaje klikalna.
   */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);

  const downloadForms = useCallback(async (ids: string[], marker: string) => {
    setBusyId(marker);
    setBundleError(null);
    try {
      const blob = await fetchFormsBundle(apiKey, ids);
      /* Adres obiektu zyje tylko do momentu, w ktorym przegladarka zapisze plik. Bez
         `revokeObjectURL` kazde pobranie zostawialoby w pamieci karty caly PDF. */
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = ids.length === 1 ? 'carruleddhi-formularz.pdf' : 'carruleddhi-formularze.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (problem) {
      setBundleError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusyId(null);
    }
  }, [apiKey]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('reg.title')}</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{t('reg.lead')}</p>
        </div>
        {/* Dwa przyciski, jeden rzad, ta sama wysokosc i ten sam ksztalt — jak w Ustawieniach.
            Wczesniej stal tu sam „Drukuj karty" i wygladal na doczepiony do naglowka.

            Kolejnosc jest kolejnoscia uzycia: najpierw sciaga sie formularze (to jest plik,
            ktory idzie na drukarke i wraca podpisany), potem drukuje sie sama liste startowa.
            Oba wylaczone, dopoki zgloszenia nie doszly: wydruk listy, ktorej nie ma, to
            kartka z samym naglowkiem, a to widac dopiero przy drukarce. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!rows || rows.length === 0 || busyId !== null}
            onClick={() => void downloadForms([], 'all')}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {busyId === 'all'
              ? <Loader2 className="size-3.5 animate-spin" />
              : <Download className="size-3.5" />}
            {t('reg.downloadAll')}
          </button>
          <button
            type="button"
            disabled={!rows || rows.length === 0}
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-40"
          >
            <Printer className="size-3.5" />
            {t('reg.print')}
          </button>
        </div>
      </div>

      {bundleError ? (
        <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
          {t('reg.downloadFailed')} <span className="font-mono opacity-70">{bundleError}</span>
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('reg.search')}
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </label>
        <span className="text-xs text-muted-foreground">
          {visible.length} {t('reg.count')}
        </span>
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground">
          {t('common.error')}
          <button type="button" onClick={load} className="ml-auto underline">
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-bold">{t('reg.number')}</th>
              <th className="px-4 py-3 font-bold">{t('reg.rider')}</th>
              <th className="px-4 py-3 font-bold">{t('reg.cart')}</th>
              <th className="px-4 py-3 font-bold">{t('reg.category')}</th>
              <th className="px-4 py-3 font-bold">{t('reg.contact')}</th>
              <th className="px-4 py-3 text-right font-bold">{pl ? 'Akcje' : 'Azioni'}</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              /* Six skeleton rows inside the real table, rather than a "loading" line in one
                 merged cell. The table keeps its column widths, so when the entries land the
                 header does not shift and nothing moves under the cursor. */
              Array.from({ length: 6 }).map((_, row) => (
                <tr key={`skeleton-${row}`} className="border-t border-border/70">
                  {['w-10', 'w-32', 'w-24', 'w-16', 'w-36', 'w-14'].map((width, cell) => (
                    <td key={cell} className="px-4 py-4">
                      <span className={`block ${width} h-4 animate-skeleton rounded bg-muted`} />
                    </td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t('reg.empty')}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-t border-border/70 align-top',
                    // Withdrawn entries stay on the list and step back. They are the answer to
                    // "why is number 005 free" and deleting them would lose that.
                    row.status === 'withdrawn' && 'opacity-45'
                  )}
                >
                  <td className="px-4 py-3 font-mono text-base font-bold text-primary">
                    {row.raceNumber || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">
                      {`${row.firstName} ${row.lastName}`.trim() || '—'}
                    </div>
                    {row.isMinor ? (
                      <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-destructive/20 px-2 py-0.5 text-[11px] font-bold text-destructive">
                        <ShieldAlert className="size-3" />
                        {t('reg.minor')}
                        {row.riderAge ? ` · ${row.riderAge}` : ''}
                      </div>
                    ) : null}
                    {row.guardian?.name ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {t('reg.guardian')}: {row.guardian.name}
                        {row.guardian.phone ? ` · ${row.guardian.phone}` : ''}
                      </div>
                    ) : null}
                    {/* Set when the rider corrected something themselves through the site.
                        Worth a line: it tells "they fixed this" apart from "somebody
                        mistyped it", which is the difference between calling them and not. */}
                    {row.selfUpdatedAt ? (
                      <div className="mt-1 text-[11px] text-primary/80">
                        {pl ? 'Poprawione samodzielnie' : 'Corretto dal partecipante'}:{' '}
                        {formatMoment(row.selfUpdatedAt, locale)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-foreground/80">
                    {row.cartName || '—'}
                    {row.teamName ? (
                      <div className="text-[11px] text-muted-foreground">{row.teamName}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-bold uppercase',
                        row.category === 'art'
                          ? 'bg-destructive/20 text-destructive'
                          : 'bg-primary/20 text-primary'
                      )}
                    >
                      {row.category || '—'}
                    </span>
                    <div className="mt-1 text-[11px] uppercase text-muted-foreground">{row.status}</div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">
                    <div className="break-all">{row.email || '—'}</div>
                    {/* More than one rider on this address. Worth a badge: three entries from
                        one inbox are a family, not three strangers who happen to be adjacent
                        in the list — and it changes who you ring when one of them has a
                        question about another. */}
                    {row.emailGroupSize > 1 ? (
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        {pl
                          ? `${row.emailGroupSize} osoby z tego adresu`
                          : `${row.emailGroupSize} iscritti da questo indirizzo`}
                      </div>
                    ) : null}
                    <div>{row.phone}</div>
                    <div className="uppercase opacity-70">{row.locale}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {/* Strzalka pierwsza, bo to jest czynnosc wykonywana najczesciej: przed
                          zawodami kazdy formularz trzeba wydrukowac. Edycja i usuwanie sa
                          rzadsze i stoja dalej od palca.

                          Podswietlona, gdy zawodnik poprosil o wydruk — wtedy ta strzalka nie
                          jest juz mozliwoscia, tylko rzecza do zrobienia. */}
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void downloadForms([row.id], row.id)}
                        title={row.wantsPrint
                          ? (pl ? 'Prosi o wydruk — pobierz formularz' : 'Chiede la stampa — scarica il modulo')
                          : (pl ? 'Pobierz wypełniony formularz' : 'Scarica il modulo compilato')}
                        className={cn(
                          'grid size-8 place-items-center rounded-md transition-colors disabled:opacity-40',
                          row.wantsPrint
                            ? 'bg-primary/15 text-primary hover:bg-primary/25'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        {busyId === row.id
                          ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
                          : <Download className="size-4" strokeWidth={1.5} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        title={pl ? 'Edytuj' : 'Modifica'}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="size-4" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row)}
                        title={pl ? 'Usuń na zawsze' : 'Elimina per sempre'}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                      >
                        <Trash2 className="size-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {pl
          ? 'Numer startowy to najniższy wolny. Rezygnacja („withdrawn") zwalnia go i następna osoba go dostaje — dlatego rezygnację robi się zmianą statusu, a nie usunięciem wiersza. Adresu e-mail nie da się tu zmienić: jest tożsamością zgłoszenia i tam poszło potwierdzenie z PDF-em. Zły adres to nowe zgłoszenie plus rezygnacja starego.'
          : 'Il numero di partenza è il più basso libero. Un ritiro («withdrawn») lo libera e lo prende il prossimo iscritto: per questo un ritiro è un cambio di stato e non la cancellazione della riga. L’indirizzo e-mail non si cambia qui: è l’identità dell’iscrizione ed è dove è arrivata la conferma con il PDF. Un indirizzo sbagliato significa una nuova iscrizione più il ritiro di quella vecchia.'}
      </p>

      {/* One card per rider, invisible on screen and the only thing on the page when the print
          dialog opens — `@media print` in admin.css does the swap. Fed the whole list rather
          than `visible`, so a search box left with something typed in it cannot silently reduce
          the stack of cards taken to the start line. */}
      {rows ? <StartCards rows={rows} locale={locale} /> : null}

      {editing ? (
        <EditDialog
          row={editing}
          pl={pl}
          onClose={() => setEditing(null)}
          onSave={async (changes) => {
            const result = await updateRegistration(apiKey, editing.id, changes);
            if (result.row) applyRow(result.row);
            else load();
            onChanged();
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Editing one entry.
 *
 * Every field starts filled with what is stored, so leaving one alone leaves the data alone —
 * an empty dialog would be a dialog that blanks whatever nobody re-typed.
 *
 * `email` is not here, and that is the one omission worth explaining twice: it is the row's
 * unique key, and it is where the confirmation and the signed PDF went. Swapping it would
 * quietly detach the entry from the person holding that paper. A wrong address means a new
 * entry plus a withdrawal of the old one, which is two visible acts instead of one invisible.
 */
function EditDialog({
  row,
  pl,
  onClose,
  onSave
}: {
  row: RosterRow;
  pl: boolean;
  onClose: () => void;
  onSave: (changes: RosterEdit) => Promise<void>;
}) {
  const [form, setForm] = useState<RosterEdit>({
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate,
    postalCode: row.postalCode,
    phone: row.phone,
    address: row.address,
    cartName: row.cartName,
    teamName: row.teamName,
    cartNotes: row.cartNotes,
    category: row.category,
    raceNumber: row.raceNumber ? String(Number(row.raceNumber)) : '',
    status: row.status
  });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');

  const set = (key: keyof RosterEdit) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = async () => {
    setBusy(true);
    setFailed('');
    try {
      await onSave(form);
    } catch (error) {
      /* The two failures worth telling apart: a number or address somebody else already has
         (409), and everything else. "Try again" is useless advice for the first one. */
      const code = (error as { code?: string }).code || '';
      setFailed(
        code === 'ROSTER_DUPLICATE'
          ? pl ? 'Ten numer startowy jest już zajęty.' : 'Questo numero di partenza è già preso.'
          : code === 'ROSTER_NAME_REQUIRED'
            ? pl ? 'Imię i nazwisko nie mogą być puste.' : 'Nome e cognome non possono essere vuoti.'
            : pl ? 'Nie udało się zapisać.' : 'Salvataggio non riuscito.'
      );
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, key: keyof RosterEdit, type = 'text') => (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type={type}
        value={(form[key] as string) ?? ''}
        onChange={set(key)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
      />
    </label>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-background/80 p-4 backdrop-blur-sm sm:place-items-center"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-foreground">
              {pl ? 'Edytuj zgłoszenie' : 'Modifica l’iscrizione'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{row.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {field(pl ? 'Imię' : 'Nome', 'firstName')}
          {field(pl ? 'Nazwisko' : 'Cognome', 'lastName')}
          {field(pl ? 'Data urodzenia' : 'Data di nascita', 'birthDate', 'date')}
          {field(pl ? 'Kod pocztowy' : 'CAP', 'postalCode')}
          {field(pl ? 'Telefon' : 'Telefono', 'phone')}
          {field(pl ? 'Numer startowy' : 'Numero di partenza', 'raceNumber')}
          {field(pl ? 'Adres' : 'Indirizzo', 'address')}
          {field(pl ? 'Nazwa wózka' : 'Nome del carruleddhu', 'cartName')}
          {field(pl ? 'Ekipa' : 'Squadra', 'teamName')}

          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {pl ? 'Kategoria' : 'Categoria'}
            </span>
            <select
              value={form.category ?? 'classic'}
              onChange={set('category')}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="classic">classic</option>
              <option value="art">art</option>
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {pl ? 'Status' : 'Stato'}
            </span>
            <select
              value={form.status ?? 'new'}
              onChange={set('status')}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 sm:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {pl ? 'Uwagi o wózku' : 'Note sul mezzo'}
            </span>
            <textarea
              rows={2}
              value={form.cartNotes ?? ''}
              onChange={set('cartNotes')}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {pl
            ? 'Ustawienie statusu na „withdrawn" zwalnia numer startowy — robi to trigger w bazie, więc dzieje się też przy zmianie ręcznej w Supabase. Adresu e-mail nie da się zmienić: to tożsamość zgłoszenia.'
            : 'Impostare lo stato su «withdrawn» libera il numero di partenza: lo fa un trigger nel database, quindi vale anche per una modifica manuale in Supabase. L’indirizzo e-mail non si può cambiare: è l’identità dell’iscrizione.'}
        </p>

        {failed ? (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
            {failed}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            {pl ? 'Anuluj' : 'Annulla'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? (pl ? 'Zapisuję…' : 'Salvo…') : pl ? 'Zapisz' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}
