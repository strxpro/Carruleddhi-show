import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, Copy, Download, Minus, QrCode, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import type { TranslateKey } from '../i18n';
import { ApiError, fetchQrStats, type QrCount, type QrStats } from '../api';

/**
 * Skany kodu QR ze spotu TV / Scansioni del QR dello spot TV.
 * ============================================================================
 * PYTANIE, NA KTÓRE TEN EKRAN ODPOWIADA
 *   „Spot poszedł w telewizji — ile osób zeskanowało kod, kiedy i skąd?"
 *
 * SKĄD SĄ DANE
 *   Kod na spocie prowadzi na /api/carruleddhi/qr. Worker zapisuje jeden anonimowy wiersz
 *   w `qr_scans` i od razu przekierowuje na post na Facebooku (migracja 0052, funkcja
 *   `qrRedirect` w worker/index.js). Ten ekran tylko czyta — jednym zapytaniem `qr-stats`.
 *
 * Wykresy w SVG, ręcznie, z tego samego powodu co w Stats.tsx: cztery kształty nie są
 * warte biblioteki, a tak wyglądają jak reszta panelu. Komponenty pomocnicze są tutaj, a nie
 * wyciągnięte ze Stats.tsx, żeby nowa zakładka nie mogła niczego zmienić w istniejącej.
 */

const nf = (locale: string) => new Intl.NumberFormat(locale);
const PALETTE = ['#ffca28', '#8f71ff', '#37d3a0', '#ff6f9f', '#00c2d1', '#ffb020', '#4285f4'];

/** „IT" → 🇮🇹. Dwie litery na symbole regionalne; wszystko inne bez flagi. */
function flag(code: string | null | undefined) {
  const cc = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function countryName(code: string | null | undefined, locale: string) {
  const cc = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(cc) || cc;
  } catch {
    return cc;
  }
}

/* ------------------------------------------------------------------ kawałki */

function Metric({ label, value, previous, locale, accent, note }: {
  label: string; value: number; previous?: number; locale: string; accent?: boolean; note?: string;
}) {
  const change = previous === undefined || previous === 0 ? null : Math.round(((value - previous) / previous) * 100);
  const Icon = change === null ? Minus : change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  return (
    <div className={cn('rounded-2xl border p-4', accent ? 'border-yellow/30 bg-yellow/[0.07]' : 'border-white/10 bg-white/[0.03]')}>
      <div className="text-[11px] uppercase tracking-wider text-white/45">{label}</div>
      <div className={cn('mt-1 text-3xl font-extrabold tabular-nums', accent ? 'text-yellow' : 'text-white')}>
        {nf(locale).format(value)}
      </div>
      {change !== null ? (
        <div className={cn('mt-1 inline-flex items-center gap-1 text-[11px] font-bold',
          change > 0 ? 'text-emerald-400' : change < 0 ? 'text-coral' : 'text-white/40')}>
          <Icon size={12} />{change > 0 ? '+' : ''}{change}%
        </div>
      ) : null}
      {note ? <div className="mt-1 text-[11px] text-white/35">{note}</div> : null}
    </div>
  );
}

function Card({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={cn('rounded-3xl border border-white/10 bg-navy-900 p-5', wide && 'lg:col-span-2')}>
      <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-wider text-white/60">{title}</h2>
      {children}
    </section>
  );
}

function BarList({ rows, locale, colour, empty }: {
  rows: { label: string; value: number; colour?: string }[];
  locale: string;
  colour?: string;
  empty: string;
}) {
  if (!rows.length) return <p className="text-sm text-white/40">{empty}</p>;
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-1.5">
      {rows.map((row, index) => (
        <li key={`${row.label}-${index}`} className="relative overflow-hidden rounded-lg">
          <div
            className="absolute inset-y-0 left-0 rounded-lg opacity-25"
            style={{ width: `${(row.value / top) * 100}%`, background: row.colour || colour || '#ffca28' }}
          />
          <div className="relative flex items-center justify-between gap-3 px-2.5 py-1.5">
            <span className="truncate text-[13px] text-white/90">{row.label}</span>
            <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-white">{nf(locale).format(row.value)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Słupki w SVG z podpisem pod kursorem. Używane dla przebiegu w czasie i dla godzin doby. */
function Bars({ data, colour, label }: {
  data: { key: string; value: number; tip: string }[];
  colour: string;
  label: (index: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 220;
  const top = Math.max(1, ...data.map((d) => d.value));
  const step = W / Math.max(1, data.length);
  const gap = Math.min(6, step * 0.25);
  const point = hover === null ? null : data[hover] ?? null;
  const ticks = data.length <= 1 ? [0] : [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-48 w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / (box.width || 1);
          setHover(Math.max(0, Math.min(data.length - 1, Math.floor(ratio * data.length))));
        }}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => {
          const h = (d.value / top) * (H - 12);
          return (
            <rect
              key={d.key}
              x={i * step + gap / 2}
              y={H - h}
              width={Math.max(1, step - gap)}
              height={Math.max(d.value > 0 ? 2 : 0, h)}
              rx="2"
              fill={colour}
              opacity={hover === null || hover === i ? 0.9 : 0.45}
            />
          );
        })}
      </svg>
      {point && hover !== null ? (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-xl border border-white/15 bg-navy-950/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: `${((hover + 0.5) / Math.max(1, data.length)) * 100}%` }}
        >
          <div className="font-extrabold text-white">{point.tip}</div>
          <div className="mt-1 text-yellow tabular-nums">{point.value}</div>
        </div>
      ) : null}
      <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-white/35">
        {ticks.map((i) => <span key={i}>{data.length ? label(i) : ''}</span>)}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- ekran */

const RANGES: { hours: number; key: TranslateKey }[] = [
  { hours: 24, key: 'st.range24' },
  { hours: 168, key: 'st.range7' },
  { hours: 720, key: 'st.range30' },
  { hours: 2160, key: 'st.range90' },
  { hours: 8760, key: 'qr.rangeYear' }
];

/* Ten sam adres, który jest w kodzie na spocie. Liczony z adresu panelu, więc działa też
   na adresie podglądu Vercela — tam skany trafiają do tej samej bazy. */
const QR_PATH = '/api/carruleddhi/qr';
const QR_TARGET = 'https://www.facebook.com/photo?fbid=1502097991950819&set=pcb.1502098041950814';

export function QrScans({ t, apiKey }: {
  t: (key: TranslateKey) => string;
  apiKey: string;
}) {
  const [stats, setStats] = useState<QrStats | null>(null);
  const [hours, setHours] = useState(168);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const intl = t('locale.intl');
  const first = useRef(true);
  const qrBox = useRef<HTMLDivElement>(null);
  const link = `${location.origin}${QR_PATH}`;

  const load = useCallback(async (quiet = false) => {
    if (!apiKey) return;
    if (!quiet) setBusy(true);
    try {
      const result = await fetchQrStats(apiKey, hours);
      setStats(result.stats);
      setError(null);
    } catch (problem) {
      const code = problem instanceof ApiError ? problem.code || problem.message : String(problem);
      setError(code === 'QR_NOT_MIGRATED' ? t('qr.notMigrated') : code);
    } finally {
      setBusy(false);
    }
  }, [apiKey, hours, t]);

  useEffect(() => { void load(!first.current); first.current = false; }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const deviceLabel = useCallback((name: string) => (
    name === 'mobile' ? t('qr.device.mobile') : name === 'tablet' ? t('qr.device.tablet') : name === 'desktop' ? t('qr.device.desktop') : name
  ), [t]);
  const plain = useCallback((name: string) => (name === 'other' ? t('qr.other') : name === '??' ? t('qr.unknown') : name), [t]);

  const rows = useCallback((list: QrCount[] | undefined, label: (row: QrCount) => string, coloured = false) =>
    (list ?? []).map((row, index) => ({ label: label(row), value: row.scans, colour: coloured ? PALETTE[index % PALETTE.length] : undefined })),
  []);

  const series = useMemo(() => (stats?.series ?? []).map((point) => {
    const date = new Date(point.at);
    const tip = new Intl.DateTimeFormat(intl, stats?.seriesStep === 'hour'
      ? { weekday: 'short', hour: '2-digit', minute: '2-digit' }
      : { weekday: 'short', day: '2-digit', month: 'short' }).format(date);
    return { key: point.at, value: point.scans, tip };
  }), [stats, intl]);

  const byHour = useMemo(() => (stats?.hours ?? []).map((h) => ({
    key: String(h.hour), value: h.scans, tip: `${String(h.hour).padStart(2, '0')}:00–${String(h.hour).padStart(2, '0')}:59`
  })), [stats]);

  const when = (iso: string) => new Intl.DateTimeFormat(intl, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Rome'
  }).format(new Date(iso));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* bez schowka (http, stara przeglądarka) — adres i tak jest na ekranie */ }
  };

  const download = () => {
    const svg = qrBox.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'qr-spot-tv.svg';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const empty = !stats || stats.allTime === 0;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-white"><QrCode size={22} className="text-yellow" />{t('qr.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/50">{t('qr.lead')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((range) => (
            <button
              key={range.hours}
              type="button"
              onClick={() => setHours(range.hours)}
              className={cn('rounded-full px-3.5 py-1.5 text-xs font-extrabold transition-colors',
                hours === range.hours ? 'bg-yellow text-navy-950' : 'bg-white/10 text-white hover:bg-white/20')}
            >
              {t(range.key)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-extrabold text-white transition-colors hover:bg-white/20 disabled:opacity-45"
          >
            <RefreshCw size={13} className={busy ? 'animate-spin' : undefined} /> {t('st.refresh')}
          </button>
        </div>
      </header>

      {error ? (
        <p className="rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-white">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={t('qr.total')} value={stats?.total ?? 0} previous={stats?.previous} locale={intl} accent note={t('qr.vsPrevious')} />
        <Metric label={t('qr.today')} value={stats?.today ?? 0} locale={intl} />
        <Metric label={t('qr.lastHour')} value={stats?.lastHour ?? 0} locale={intl} />
        <Metric label={t('qr.allTime')} value={stats?.allTime ?? 0} locale={intl}
          note={stats?.lastAt ? `${t('qr.lastScan')}: ${when(stats.lastAt)}` : undefined} />
      </div>

      {empty ? (
        <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center">
          <QrCode size={26} className="mx-auto text-white/25" />
          <p className="mt-3 font-extrabold text-white">{t('qr.noData')}</p>
          <p className="mt-1 text-sm text-white/45">{t('qr.noDataHint')}</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={t('qr.overTime')} wide>
            <Bars data={series} colour="#ffca28" label={(i) => series[i]?.tip ?? ''} />
          </Card>

          <Card title={t('qr.byHour')} wide>
            <Bars data={byHour} colour="#8f71ff" label={(i) => `${String(stats.hours[i]?.hour ?? 0).padStart(2, '0')}:00`} />
          </Card>

          <Card title={t('qr.countries')}>
            <BarList
              rows={rows(stats.countries, (r) => (r.name === '??' ? t('qr.unknown') : `${flag(r.name)} ${countryName(r.name, intl)}`.trim()))}
              locale={intl} colour="#37d3a0" empty={t('qr.noData')}
            />
          </Card>

          <Card title={t('qr.cities')}>
            <BarList
              rows={rows(stats.cities, (r) => `${flag(r.country)} ${r.name}`.trim())}
              locale={intl} colour="#ffca28" empty={t('qr.unknown')}
            />
          </Card>

          <Card title={t('qr.regions')}>
            <BarList
              rows={rows(stats.regions, (r) => `${flag(r.country)} ${r.name}`.trim())}
              locale={intl} colour="#00c2d1" empty={t('qr.unknown')}
            />
          </Card>

          <Card title={t('qr.devices')}>
            <BarList rows={rows(stats.devices, (r) => deviceLabel(r.name), true)} locale={intl} empty={t('qr.noData')} />
          </Card>

          <Card title={t('qr.os')}>
            <BarList rows={rows(stats.os, (r) => plain(r.name), true)} locale={intl} empty={t('qr.noData')} />
          </Card>

          <Card title={t('qr.browsers')}>
            <BarList rows={rows(stats.browsers, (r) => plain(r.name), true)} locale={intl} empty={t('qr.noData')} />
          </Card>

          <Card title={t('qr.langs')}>
            <BarList rows={rows(stats.langs, (r) => plain(r.name).toUpperCase())} locale={intl} colour="#ff6f9f" empty={t('qr.noData')} />
          </Card>

          <Card title={t('qr.campaigns')}>
            <BarList rows={rows(stats.campaigns, (r) => r.name)} locale={intl} colour="#ffb020" empty={t('qr.noData')} />
          </Card>

          <Card title={t('qr.recent')} wide>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="py-1.5 pr-3 font-bold">{t('qr.when')}</th>
                    <th className="py-1.5 pr-3 font-bold">{t('qr.where')}</th>
                    <th className="py-1.5 pr-3 font-bold">{t('qr.what')}</th>
                    <th className="py-1.5 font-bold">{t('qr.code')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((scan, index) => (
                    <tr key={`${scan.at}-${index}`} className="border-t border-white/[0.06] text-white/85">
                      <td className="py-1.5 pr-3 tabular-nums">{when(scan.at)}</td>
                      <td className="py-1.5 pr-3">
                        {flag(scan.country)}{' '}
                        {[scan.city, scan.region, countryName(scan.country, intl)].filter(Boolean).join(', ') || t('qr.unknown')}
                      </td>
                      <td className="py-1.5 pr-3">
                        {[deviceLabel(scan.device), scan.os && plain(scan.os), scan.browser && plain(scan.browser)].filter(Boolean).join(' · ')}
                      </td>
                      <td className="py-1.5 text-white/60">{scan.campaign}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Adres w kodzie i sam kod — żeby dało się sprawdzić telefonem bez szukania spotu. */}
      <section className="grid gap-4 rounded-3xl border border-white/10 bg-navy-900 p-5 md:grid-cols-[auto_1fr] md:items-center">
        <div ref={qrBox} className="w-fit rounded-2xl bg-white p-2">
          <QRCodeSVG value={link} size={148} level="M" marginSize={2} fgColor="#071a3d" bgColor="#ffffff" title={t('qr.link')} />
        </div>
        <div className="min-w-0">
          <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-white/60">{t('qr.link')}</h2>
          <p className="mt-2 break-all rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[13px] text-white">{link}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/45">{t('qr.linkHint')}</p>
          <p className="mt-1 break-all text-[12px] text-white/45">{t('qr.target')}: <span className="text-white/70">{QR_TARGET}</span></p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy()}
              className="inline-flex items-center gap-2 rounded-full bg-yellow px-3.5 py-1.5 text-xs font-extrabold text-navy-950 transition-colors hover:bg-white">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? t('qr.copied') : t('qr.copy')}
            </button>
            <button type="button" onClick={download}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-extrabold text-white transition-colors hover:bg-white/20">
              <Download size={13} /> {t('qr.download')}
            </button>
          </div>
        </div>
      </section>

      <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-white/40">
        {t('qr.privacy')} · {t('qr.auto')}
      </p>
    </div>
  );
}
