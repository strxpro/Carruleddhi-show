import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellOff, BellRing, Search, Trash2 } from 'lucide-react';
import { cn, formatMoment } from '@/lib/utils';
import type { PanelLocale, TranslateKey } from '../i18n';
import { fetchSubscribers, setSubscriberStatus, type Subscriber } from '../api';

/**
 * Reminders and the newsletter.
 *
 * This screen used to say "there is no endpoint for reading this list yet" and send the
 * organiser to the Supabase table editor. The endpoint exists now (`subscribers` in
 * worker/index.js), so it shows the list.
 *
 * One component for both lists rather than two: the same three columns, the same two
 * actions, and the only difference is which extra column comes back — `lastReminder` on the
 * reminder list, `source` on the newsletter. Two components would be two places to fix the
 * same layout bug.
 */
export function Subscribers({
  t,
  locale,
  apiKey,
  kind,
  onChanged
}: {
  t: (key: TranslateKey) => string;
  locale: PanelLocale;
  apiKey: string;
  kind: 'reminders' | 'newsletter';
  onChanged: () => void;
}) {
  const newsletter = kind === 'newsletter';
  const pl = locale === 'pl';

  const [rows, setRows] = useState<Subscriber[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    setRows(null);
    fetchSubscribers(apiKey, kind)
      .then((data) => setRows(data.rows))
      .catch(() => setError(true));
  }, [apiKey, kind]);

  // `kind` is in the dependency list, so switching between the two tabs reloads rather than
  // showing the previous list under the new heading.
  useEffect(load, [load]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.email.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle)
    );
  }, [rows, query]);

  const active = useMemo(() => rows?.filter((row) => row.status === 'active').length ?? 0, [rows]);

  /**
   * Acts, then patches the row in place rather than refetching.
   *
   * Same reasoning as the wall: a refetch reorders the list under the cursor, and the next
   * row somebody meant to press has moved.
   */
  const act = async (id: string, action: 'unsubscribe' | 'resubscribe' | 'delete') => {
    if (action === 'delete' && !window.confirm(pl ? 'Usunąć ten adres z listy?' : 'Rimuovere questo indirizzo?')) {
      return;
    }
    setBusy(id);
    try {
      await setSubscriberStatus(apiKey, kind, id, action);
      setRows((current) => {
        if (!current) return current;
        if (action === 'delete') return current.filter((row) => row.id !== id);
        return current.map((row) =>
          row.id === id
            ? { ...row, status: action === 'unsubscribe' ? 'unsubscribed' : 'active' }
            : row
        );
      });
      onChanged();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {t(newsletter ? 'news.title' : 'rem.title')}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t(newsletter ? 'news.lead' : 'rem.lead')}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {rows
            ? `${active} / ${rows.length} ${pl ? 'aktywnych' : 'attivi'}`
            : t('common.loading')}
        </p>
      </div>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={pl ? 'Szukaj adresu albo imienia…' : 'Cerca indirizzo o nome…'}
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
          {t('common.error')}{' '}
          <button type="button" onClick={load} className="font-semibold underline">
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {rows === null && !error ? (
        <p className="mt-6 text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}

      {rows && rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          {pl ? 'Nikt jeszcze się nie zapisał.' : 'Ancora nessun iscritto.'}
        </div>
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{pl ? 'Kto' : 'Chi'}</th>
                <th className="px-4 py-3 font-semibold">{pl ? 'Zapisany' : 'Iscritto'}</th>
                <th className="px-4 py-3 font-semibold">
                  {newsletter ? (pl ? 'Skąd' : 'Da dove') : (pl ? 'Ostatnie' : 'Ultimo')}
                </th>
                <th className="px-4 py-3 text-right font-semibold">{pl ? 'Akcje' : 'Azioni'}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-t border-border/70',
                    // Unsubscribed rows stay visible but step back: they are the answer to
                    // "why did this person stop getting letters", which is a question that
                    // gets asked.
                    row.status !== 'active' && 'opacity-45'
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{row.name || '—'}</div>
                    <div className="text-xs text-muted-foreground">{row.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatMoment(row.createdAt, locale)}
                    <div className="uppercase">{row.locale}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {newsletter ? row.source || '—' : row.lastReminder || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => act(row.id, row.status === 'active' ? 'unsubscribe' : 'resubscribe')}
                        title={
                          row.status === 'active'
                            ? pl ? 'Wyłącz powiadomienia' : 'Disattiva gli avvisi'
                            : pl ? 'Włącz ponownie' : 'Riattiva'
                        }
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                      >
                        {row.status === 'active' ? (
                          <BellOff className="size-4" strokeWidth={1.5} />
                        ) : (
                          <BellRing className="size-4" strokeWidth={1.5} />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => act(row.id, 'delete')}
                        title={pl ? 'Usuń z listy' : 'Rimuovi dalla lista'}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive disabled:opacity-40"
                      >
                        <Trash2 className="size-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Why "unsubscribe" and "delete" are two different buttons, said once where it
          matters: one keeps the row so a second signup does not look like a first, the other
          removes it entirely and is for test data. */}
      {rows && rows.length > 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {pl
            ? 'Wyłączenie zostawia wiersz — widać wtedy, że ktoś sam zrezygnował, a ponowny zapis nie wygląda na pierwszy. Usunięcie kasuje go z bazy i jest do danych testowych.'
            : 'Disattivare mantiene la riga: si vede che qualcuno si è cancellato, e una nuova iscrizione non sembra la prima. Eliminare la cancella dal database ed è per i dati di test.'}
        </p>
      ) : null}
    </div>
  );
}
