import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, EyeOff, Trash2 } from 'lucide-react';
import { cn, formatMoment } from '@/lib/utils';
import type { PanelLocale, TranslateKey } from '../i18n';
import { fetchWall, moderateWall, type WallComment } from '../api';

type Filter = 'pending' | 'approved' | 'all';

export function Wall({
  t,
  locale,
  apiKey,
  onChanged
}: {
  t: (key: TranslateKey) => string;
  locale: PanelLocale;
  apiKey: string;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<WallComment[] | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    fetchWall(apiKey)
      .then((data) => setRows(data.comments))
      .catch(() => setError(true));
  }, [apiKey]);

  useEffect(load, [load]);

  const counts = useMemo(
    () => ({
      pending: rows?.filter((row) => !row.approved).length ?? 0,
      approved: rows?.filter((row) => row.approved).length ?? 0,
      all: rows?.length ?? 0
    }),
    [rows]
  );

  const visible = useMemo(() => {
    if (!rows) return [];
    if (filter === 'pending') return rows.filter((row) => !row.approved);
    if (filter === 'approved') return rows.filter((row) => row.approved);
    return rows;
  }, [rows, filter]);

  /**
   * Acts, then patches the row locally rather than refetching.
   *
   * A refetch would reorder the list under the cursor while somebody is working through
   * twenty pending messages, and the next one they meant to press would have moved.
   */
  const act = async (id: string, action: 'approve' | 'hide' | 'delete') => {
    if (action === 'delete' && !window.confirm(t('wall.confirmDelete'))) return;
    setBusy(id);
    try {
      await moderateWall(apiKey, id, action);
      setRows((current) => {
        if (!current) return current;
        if (action === 'delete') return current.filter((row) => row.id !== id);
        return current.map((row) => (row.id === id ? { ...row, approved: action === 'approve' } : row));
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
      <h2 className="text-2xl font-bold tracking-tight text-white">{t('wall.title')}</h2>
      <p className="mt-1.5 text-sm text-white/55">{t('wall.lead')}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {(['pending', 'approved', 'all'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
              filter === value
                ? 'bg-yellow text-navy-950'
                : 'border border-white/20 text-white/65 hover:border-white/45 hover:text-white'
            )}
          >
            {t(`wall.${value}` as TranslateKey)}
            <span className="tabular-nums opacity-70">{counts[value]}</span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-white/80">
          {t('common.error')}
          <button type="button" onClick={load} className="ml-auto underline">
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      <ul className="mt-4 flex flex-col gap-3">
        {rows === null ? (
          <li className="rounded-2xl border border-white/10 px-5 py-8 text-center text-sm text-white/40">
            {t('common.loading')}
          </li>
        ) : visible.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-white/15 px-5 py-8 text-center text-sm text-white/40">
            {t('wall.empty')}
          </li>
        ) : (
          visible.map((row) => (
            <li
              key={row.id}
              className={cn(
                'rounded-2xl border p-4 transition',
                row.approved ? 'border-green/25 bg-green/6' : 'border-white/12 bg-white/4',
                busy === row.id && 'opacity-50'
              )}
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
                <strong className="text-sm text-white">{row.name || '—'}</strong>
                {row.place ? <span>{row.place}</span> : null}
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono">
                  {row.locale.toUpperCase()}
                </span>
                {row.rating ? (
                  <span className="text-yellow" aria-label={`${row.rating}/5`}>
                    {'★'.repeat(row.rating)}
                    <span className="text-white/20">{'★'.repeat(5 - row.rating)}</span>
                  </span>
                ) : null}
                <time className="ml-auto">{formatMoment(row.createdAt, t('locale.intl'))}</time>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 font-bold',
                    row.approved ? 'bg-green/20 text-green' : 'bg-yellow/20 text-yellow'
                  )}
                >
                  {row.approved ? t('wall.onSite') : t('wall.waiting')}
                </span>
              </div>

              <p className="mt-2.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white/85">
                {row.message}
              </p>

              {row.photo ? (
                <a href={row.photo} target="_blank" rel="noopener noreferrer" className="mt-3 block">
                  <img
                    src={row.photo}
                    alt=""
                    loading="lazy"
                    className="max-h-52 rounded-xl border border-white/10 object-cover"
                  />
                </a>
              ) : null}

              <div className="mt-3.5 flex flex-wrap gap-2">
                {row.approved ? (
                  <button
                    type="button"
                    onClick={() => act(row.id, 'hide')}
                    className="flex items-center gap-1.5 rounded-full border border-white/20 px-3.5 py-1.5 text-xs font-semibold text-white/75 hover:border-white/50 hover:text-white"
                  >
                    <EyeOff className="size-3.5" />
                    {t('wall.hide')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => act(row.id, 'approve')}
                    className="flex items-center gap-1.5 rounded-full bg-yellow px-3.5 py-1.5 text-xs font-bold text-navy-950 hover:bg-white"
                  >
                    <Check className="size-3.5" />
                    {t('wall.approve')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => act(row.id, 'delete')}
                  className="flex items-center gap-1.5 rounded-full border border-coral/40 px-3.5 py-1.5 text-xs font-semibold text-coral hover:bg-coral hover:text-white"
                >
                  <Trash2 className="size-3.5" />
                  {t('wall.delete')}
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

      <p className="mt-4 text-xs text-white/30">
        {locale === 'pl'
          ? 'Usunięcie zabiera też zdjęcie z bucketa i jest nieodwracalne. „Ukryj” tylko zdejmuje wpis ze strony — zostaje w bazie i można go zatwierdzić ponownie.'
          : 'Eliminare rimuove anche la foto dal bucket e non si può annullare. “Nascondi” toglie solo il messaggio dal sito: resta nel database e si può riapprovare.'}
      </p>
    </div>
  );
}
