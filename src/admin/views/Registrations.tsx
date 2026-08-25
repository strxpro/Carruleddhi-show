import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, Search, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PanelLocale, TranslateKey } from '../i18n';
import { fetchRoster, type RosterRow } from '../api';

/** Reads a field under any of the names it has gone by. */
function pick(row: RosterRow, ...names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
  }
  return '';
}

const isTrue = (value: unknown) =>
  value === true || value === 'yes' || value === 'true' || value === 'TRUE' || value === 1;

export function Registrations({
  t,
  locale,
  apiKey
}: {
  t: (key: TranslateKey) => string;
  locale: PanelLocale;
  apiKey: string;
}) {
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setError(false);
    fetchRoster(apiKey)
      .then((data) => setRows(Array.isArray(data.rows) ? data.rows : []))
      .catch(() => setError(true));
  }, [apiKey]);

  useEffect(load, [load]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        pick(row, 'raceNumber', 'race_number'),
        pick(row, 'fullName'),
        pick(row, 'firstName', 'first_name'),
        pick(row, 'lastName', 'last_name'),
        pick(row, 'cartName', 'cart_name'),
        pick(row, 'email'),
        pick(row, 'phone'),
        pick(row, 'teamName', 'team_name')
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, query]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">{t('reg.title')}</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">{t('reg.lead')}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/75 hover:border-white/50 hover:text-white"
        >
          <Printer className="size-3.5" />
          {t('reg.print')}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('reg.search')}
            className="w-full rounded-xl border border-white/15 bg-white/6 py-2.5 pl-10 pr-3.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-yellow/60"
          />
        </label>
        <span className="text-xs text-white/40">
          {visible.length} {t('reg.count')}
        </span>
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-white/80">
          {t('common.error')}
          <button type="button" onClick={load} className="ml-auto underline">
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-white/6 text-left text-[11px] uppercase tracking-wider text-white/45">
              <th className="px-4 py-3 font-bold">{t('reg.number')}</th>
              <th className="px-4 py-3 font-bold">{t('reg.rider')}</th>
              <th className="px-4 py-3 font-bold">{t('reg.cart')}</th>
              <th className="px-4 py-3 font-bold">{t('reg.category')}</th>
              <th className="px-4 py-3 font-bold">{t('reg.contact')}</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-white/40">
                  {t('common.loading')}
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-white/40">
                  {t('reg.empty')}
                </td>
              </tr>
            ) : (
              visible.map((row, index) => {
                const minor = isTrue(row.isMinor ?? row.is_minor);
                const name =
                  pick(row, 'fullName') ||
                  `${pick(row, 'firstName', 'first_name')} ${pick(row, 'lastName', 'last_name')}`.trim();
                return (
                  <tr
                    key={pick(row, 'raceNumber', 'race_number') || String(index)}
                    className="border-t border-white/8 align-top"
                  >
                    <td className="px-4 py-3 font-mono text-base font-bold text-yellow">
                      {pick(row, 'raceNumber', 'race_number') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{name || '—'}</div>
                      {minor ? (
                        <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-coral/20 px-2 py-0.5 text-[11px] font-bold text-coral">
                          <ShieldAlert className="size-3" />
                          {t('reg.minor')}
                        </div>
                      ) : null}
                      {minor && pick(row, 'guardianName', 'guardian_name') ? (
                        <div className="mt-1 text-[11px] text-white/45">
                          {t('reg.guardian')}: {pick(row, 'guardianName', 'guardian_name')}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-white/80">
                      {pick(row, 'cartName', 'cart_name') || '—'}
                      {pick(row, 'teamName', 'team_name') ? (
                        <div className="text-[11px] text-white/40">
                          {pick(row, 'teamName', 'team_name')}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-bold uppercase',
                          pick(row, 'category') === 'art'
                            ? 'bg-coral/20 text-coral'
                            : 'bg-yellow/20 text-yellow'
                        )}
                      >
                        {pick(row, 'category') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-white/60">
                      <div className="break-all">{pick(row, 'email') || '—'}</div>
                      <div>{pick(row, 'phone')}</div>
                      <div className="text-white/35">{pick(row, 'locale').toUpperCase()}</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-white/30">
        {locale === 'pl'
          ? 'Numery startowe pochodzą z sekwencji w bazie. Nie są nadawane ponownie po rezygnacji — numer wydrukowany na formularzu nie może trafić do dwóch osób.'
          : 'I numeri di partenza vengono da una sequenza nel database. Non vengono riassegnati dopo un ritiro: un numero già stampato su un modulo non può finire a due persone.'}
      </p>
    </div>
  );
}
