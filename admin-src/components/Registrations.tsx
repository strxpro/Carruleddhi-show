import { useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, Search } from 'lucide-react';
import { fetchRoster, type RosterRow } from '@/api';
import { useLocale } from '@/hooks';
import { cn } from '@/lib/utils';

const isMinor = (row: RosterRow) => row.isMinor === true || row.isMinor === 'yes';

/**
 * The entry list.
 *
 * Real data or nothing: no placeholder rows, no demo mode. If the passphrase is missing
 * it says so and asks for it, which is a state worth showing plainly — the alternative
 * is an empty table that looks like "nobody has signed up".
 */
export function Registrations({
  dataKey,
  setDataKey
}: {
  dataKey: string;
  setDataKey: (next: string) => void;
}) {
  const { t } = useLocale();
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  async function load() {
    if (!dataKey) return;
    setBusy(true);
    setError(null);
    try {
      setRows(await fetchRoster(dataKey));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      setRows(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (dataKey) void load();
    // Deliberately only on the key: reloading on every keystroke of the search box would
    // hammer the API for filtering that happens in the browser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.raceNumber, row.firstName, row.lastName, row.fullName, row.cartName, row.email, row.teamName]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [rows, query]);

  if (!dataKey) {
    return (
      <div className="max-w-lg rounded-3xl bg-navy-900 border border-white/10 p-7">
        <div className="flex items-center gap-3 mb-2">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-yellow text-navy-950">
            <KeyRound size={18} />
          </span>
          <h2 className="font-extrabold">{t('common.key')}</h2>
        </div>
        <p className="text-sm text-white/55 leading-relaxed">{t('common.keyHint')}</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const field = new FormData(event.currentTarget).get('key');
            setDataKey(String(field ?? '').trim());
          }}
        >
          <input
            name="key"
            type="password"
            autoComplete="off"
            className="flex-1 rounded-xl bg-white/5 border border-white/15 px-4 py-3 outline-none
                       focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2"
          />
          <button
            type="submit"
            className="rounded-full bg-yellow text-navy-950 font-extrabold text-sm px-5 hover:bg-white transition-colors"
          >
            OK
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('common.search')}
            className="w-full rounded-full bg-white/5 border border-white/10 pl-10 pr-4 py-2.5 text-sm
                       outline-none focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2"
          />
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-white/8 border border-white/12
                     px-4 py-2.5 text-sm font-bold hover:bg-white/14 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={15} className={busy ? 'animate-spin' : undefined} />
          {busy ? t('common.loading') : t('common.refresh')}
        </button>

        {rows && (
          <span className="text-sm text-white/45 tabular-nums">
            {visible.length} {t('common.of')} {rows.length} {t('reg.count')}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-[#f6494f]/40 bg-[#f6494f]/10 p-4">
          <p className="text-sm text-[#ffc9c9]">{t('common.error')}</p>
          <p className="text-xs text-white/40 mt-1 font-mono break-all">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-full bg-white/10 px-4 py-2 text-xs font-bold hover:bg-white/20"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {rows && visible.length === 0 && !error && (
        <p className="text-sm text-white/45 py-8 text-center">{t('common.empty')}</p>
      )}

      {visible.length > 0 && (
        <div className="rounded-3xl border border-white/10 bg-navy-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-white/40">
                  <th className="py-3 px-4 font-bold">{t('reg.number')}</th>
                  <th className="py-3 px-4 font-bold">{t('reg.rider')}</th>
                  <th className="py-3 px-4 font-bold">{t('reg.cart')}</th>
                  <th className="py-3 px-4 font-bold">{t('reg.category')}</th>
                  <th className="py-3 px-4 font-bold">{t('reg.contact')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <tr
                    key={`${row.raceNumber ?? index}-${row.email ?? index}`}
                    className="border-t border-white/6 hover:bg-white/4"
                  >
                    <td className="py-3 px-4 font-mono font-extrabold text-yellow tabular-nums">
                      {row.raceNumber || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold">
                        {row.fullName || `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || '—'}
                      </div>
                      {isMinor(row) && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-coral/20 text-[#ffb3b3] text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5">
                            {t('reg.minor')} {row.riderAge ? `· ${row.riderAge}` : ''}
                          </span>
                          {row.guardianName && (
                            <span className="text-xs text-white/45">
                              {t('reg.guardian')}: {row.guardianName}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div>{row.cartName || '—'}</div>
                      {row.teamName && <div className="text-xs text-white/40">{row.teamName}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          'rounded-full text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1',
                          row.category === 'art' ? 'bg-coral/20 text-[#ffb3b3]' : 'bg-yellow/20 text-yellow'
                        )}
                      >
                        {row.category || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {row.email && (
                        <a href={`mailto:${row.email}`} className="text-blue-200 hover:text-yellow break-all">
                          {row.email}
                        </a>
                      )}
                      {row.phone && <div className="text-xs text-white/40 mt-0.5">{row.phone}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
