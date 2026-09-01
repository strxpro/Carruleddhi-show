import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TranslateKey } from '../i18n';
import { ApiError, fetchStats, type SiteStats, type StatsBucket } from '../api';

/**
 * Statystyki odwiedzin.
 * ============================================================================
 * PYTANIE, NA KTÓRE TEN EKRAN ODPOWIADA
 *   „Wydam pieniądze na reklamę — skąd faktycznie przychodzą ludzie i ilu z nich zostaje?"
 *   Wszystko tutaj jest ustawione pod nie: kanały nad wykresem czasu, a zapisy według kanału
 *   na końcu, bo to one są wynikiem, a nie same wejścia.
 *
 * WYKRESY PISANE RĘCZNIE, BEZ BIBLIOTEKI
 *   Recharts albo Chart.js to ~100 kB spakowane, w panelu, który cały waży dziś 110 kB —
 *   za cztery kształty: obszar, słupek, pierścień i pasek. Kształty są w SVG niżej i mają
 *   po kilkanaście linii każdy. Przy okazji wyglądają jak reszta panelu, a nie jak wklejony
 *   widżet z cudzą typografią i cudzą paletą.
 *
 * CO SIĘ ODŚWIEŻA SAMO
 *   Cały ekran co trzydzieści sekund, ale wyłącznie gdy karta jest z przodu. Licznik „teraz
 *   na stronie" bez tego byłby liczbą sprzed godziny udającą chwilę obecną.
 */

/** Paleta kanałów. Znane kanały mają swój kolor, reszta dostaje kolejny z listy. */
const SOURCE_COLOURS: Record<string, string> = {
  direct: '#8fa6c8',
  google: '#4285f4',
  facebook: '#1877f2',
  instagram: '#e1306c',
  tiktok: '#25f4ee',
  youtube: '#ff0033',
  whatsapp: '#25d366',
  messenger: '#a334fa',
  telegram: '#2aabee',
  email: '#ffca28',
  bing: '#00809d',
  x: '#e7e9ea',
  linkedin: '#0a66c2',
  other: '#6b7c9c',
  nieznane: '#4a5a78'
};
const SPARE_COLOURS = ['#ff6f9f', '#8f71ff', '#37d3a0', '#ffb020', '#00c2d1'];

function colourFor(name: string, index: number) {
  return SOURCE_COLOURS[name] || SPARE_COLOURS[index % SPARE_COLOURS.length];
}

/** Etykiety kanałów, których nazwa techniczna nic nie mówi. Reszta jak przyszła. */
function sourceLabel(name: string, t: (key: TranslateKey) => string) {
  if (name === 'direct') return t('st.source.direct');
  if (name === 'other') return t('st.source.other');
  if (name === 'nieznane') return t('st.source.unknown');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const nf = (locale: string) => new Intl.NumberFormat(locale);

/* ------------------------------------------------------------------ wykresy */

/**
 * Przebieg w czasie: wypełniony obszar z linią i punktem pod kursorem.
 *
 * `viewBox` w jednostkach 0–1000 × 0–260 i `preserveAspectRatio="none"`: wykres skaluje się
 * do szerokości kolumny bez przeliczania czegokolwiek w JavaScripcie przy każdej zmianie
 * okna. Grubości kresek są kompensowane osobno, żeby rozciągnięcie ich nie pogrubiło.
 */
function AreaChart({
  data, locale, step, labels
}: {
  data: StatsBucket[];
  locale: string;
  step: 'hour' | 'day';
  labels: { views: string; visitors: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 260;
  const top = Math.max(1, ...data.map((d) => d.views));

  const x = (i: number) => (data.length < 2 ? W / 2 : (i / (data.length - 1)) * W);
  const y = (v: number) => H - (v / top) * (H - 24) - 8;

  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.views).toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const visitorLine = data
    .map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.visitors).toFixed(1)}`)
    .join(' ');

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, step === 'hour'
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short' }).format(new Date(iso));

  const point = hover === null ? null : (data[hover] ?? null);
  const first = data[0];
  const last = data[data.length - 1];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-56 w-full overflow-visible"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / (box.width || 1);
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1)))));
        }}
      >
        <defs>
          <linearGradient id="stats-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffca28" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#ffca28" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Trzy linie odniesienia. Bez nich wykres jest ładny i nie da się z niego odczytać
            żadnej liczby; z siatką co ćwiartkę już się da, a nadal nie zagłusza kształtu. */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill="url(#stats-area)" />
        <path d={line} fill="none" stroke="#ffca28" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <path d={visitorLine} fill="none" stroke="#8f71ff" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        {hover !== null && point ? (
          <>
            <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="rgba(255,255,255,.28)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <circle cx={x(hover)} cy={y(point.views)} r="4" fill="#ffca28" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>

      {/* Podpis pod kursorem w HTML-u, nie w SVG: `preserveAspectRatio="none"` rozciąga
          wszystko w środku, więc tekst w SVG byłby zniekształcony razem z wykresem. */}
      {point ? (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-xl border border-white/15 bg-navy-950/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: `${((hover ?? 0) / Math.max(1, data.length - 1)) * 100}%` }}
        >
          <div className="font-extrabold text-white">{when(point.at)}</div>
          <div className="mt-1 text-yellow">{nf(locale).format(point.views)} {labels.views.toLowerCase()}</div>
          <div className="text-[#b9a7ff]">{nf(locale).format(point.visitors)} {labels.visitors.toLowerCase()}</div>
        </div>
      ) : null}

      <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-white/35">
        <span>{first ? when(first.at) : ''}</span>
        <span>{last ? when(last.at) : ''}</span>
      </div>
    </div>
  );
}

/** Pierścień: udział kanałów. Rysowany obwodem kreski, więc bez trygonometrii i bez łuków. */
function Donut({ slices, size = 132 }: { slices: { label: string; value: number; colour?: string }[]; size?: number }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  const r = 54;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg viewBox="0 0 140 140" width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="16" />
      {slices.map((slice) => {
        const length = (slice.value / total) * circumference;
        const dash = `${length} ${circumference - length}`;
        const element = (
          <circle
            key={slice.label}
            cx="70" cy="70" r={r} fill="none"
            stroke={slice.colour || '#6b7c9c'} strokeWidth="16"
            strokeDasharray={dash} strokeDashoffset={-offset}
            /* Bez zaokrąglenia końców: przy wąskim wycinku „round" nachodzi na sąsiada
               i dwa procenty wyglądają jak pięć. */
            strokeLinecap="butt"
          />
        );
        offset += length;
        return element;
      })}
    </svg>
  );
}

/** Lista z paskiem w tle. Używana wszędzie, gdzie odpowiedzią jest ranking, a nie kształt. */
function BarList({
  rows, locale, colour
}: {
  rows: { label: string; value: number; hint?: string; colour?: string }[];
  locale: string;
  colour?: string;
}) {
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-1.5">
      {rows.map((row) => (
        <li key={row.label} className="relative overflow-hidden rounded-lg">
          {/* Pasek jako TŁO wiersza, nie osobna kolumna: przy dwudziestu znakach etykiety
              kolumna na słupek zjada połowę szerokości i nic z niej nie widać. */}
          <div
            className="absolute inset-y-0 left-0 rounded-lg opacity-25"
            style={{ width: `${(row.value / top) * 100}%`, background: row.colour || colour || '#ffca28' }}
          />
          <div className="relative flex items-center justify-between gap-3 px-2.5 py-1.5">
            <span className="truncate text-[13px] text-white/90">{row.label}</span>
            <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-white">
              {nf(locale).format(row.value)}
              {row.hint ? <span className="ml-1.5 font-normal text-white/40">{row.hint}</span> : null}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Jedna duża liczba ze zmianą względem poprzedniego okresu. */
function Metric({
  label, value, previous, locale, accent, note
}: {
  label: string; value: number; previous?: number; locale: string; accent?: boolean; note?: string;
}) {
  /* Zmiana z niczego na coś nie jest „wzrostem o nieskończoność" — to jest pierwszy pomiar
     i uczciwie jest nie pokazać przy nim strzałki. */
  const change = previous === undefined || previous === 0
    ? null
    : Math.round(((value - previous) / previous) * 100);
  const Icon = change === null ? Minus : change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;

  return (
    <div className={cn(
      'rounded-2xl border p-4',
      accent ? 'border-yellow/30 bg-yellow/[0.07]' : 'border-white/10 bg-white/[0.03]'
    )}>
      <div className="text-[11px] uppercase tracking-wider text-white/45">{label}</div>
      <div className={cn('mt-1 text-3xl font-extrabold tabular-nums', accent ? 'text-yellow' : 'text-white')}>
        {nf(locale).format(value)}
      </div>
      {change !== null ? (
        <div className={cn(
          'mt-1 inline-flex items-center gap-1 text-[11px] font-bold',
          change > 0 ? 'text-emerald-400' : change < 0 ? 'text-coral' : 'text-white/40'
        )}>
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

/* -------------------------------------------------------------------- ekran */

const RANGES: { hours: number; key: TranslateKey }[] = [
  { hours: 24, key: 'st.range24' },
  { hours: 168, key: 'st.range7' },
  { hours: 720, key: 'st.range30' },
  { hours: 2160, key: 'st.range90' }
];

/* Bez `locale` w propsach, mimo że pozostałe ekrany je biorą: format liczb i dat idzie tu
   z `locale.intl` ze słownika, czyli z tego samego miejsca, co reszta napisów. Drugi kanał
   na tę samą informację byłby drugim miejscem, w którym panel może pokazać polskie słowa
   z włoskim formatem daty. */
export function Stats({ t, apiKey }: {
  t: (key: TranslateKey) => string;
  apiKey: string;
}) {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [hours, setHours] = useState(168);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intl = t('locale.intl');
  const first = useRef(true);

  const load = useCallback(async (quiet = false) => {
    if (!apiKey) return;
    if (!quiet) setBusy(true);
    try {
      const result = await fetchStats(apiKey, hours);
      setStats(result.stats);
      setError(null);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.code || problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }, [apiKey, hours]);

  useEffect(() => { void load(!first.current); first.current = false; }, [load]);

  /* Samo odświeżanie tylko przy karcie z przodu. „Teraz na stronie" bez tego byłoby liczbą
     sprzed godziny udającą chwilę obecną, a odpytywanie w tle kosztuje bazę tyle samo. */
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const sources = useMemo(
    () => (stats?.sources ?? []).map((row, index) => ({
      label: sourceLabel(row.source, t),
      value: row.views,
      hint: `· ${nf(intl).format(row.visitors)}`,
      colour: colourFor(row.source, index)
    })),
    [stats, t, intl]
  );

  const empty = !stats || stats.totals.views === 0;

  /* Zapisy na sto osób. To jest liczba, po której poznaje się, czy kampania sprowadza
     WŁAŚCIWYCH ludzi — sam ruch da się kupić, zapisów nie. */
  const conversion = stats && stats.totals.visitors > 0
    ? (stats.signupTotal / stats.totals.visitors) * 100
    : null;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">{t('st.title')}</h1>
          <p className="mt-1 text-sm text-white/50">{t('st.lead')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((range) => (
            <button
              key={range.hours}
              type="button"
              onClick={() => setHours(range.hours)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-extrabold transition-colors',
                hours === range.hours ? 'bg-yellow text-navy-950' : 'bg-white/10 text-white hover:bg-white/20'
              )}
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

      {/* --------------------------------------------------------- liczby */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-emerald-300/80">
            {/* Kropka pulsuje tylko wtedy, gdy naprawdę ktoś jest — migający wskaźnik przy
                zerze to najgorszy rodzaj interfejsu: wygląda na żywy i kłamie. */}
            <span className={cn('h-1.5 w-1.5 rounded-full bg-emerald-400', (stats?.live ?? 0) > 0 && 'animate-pulse')} />
            {t('st.live')}
          </div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums text-emerald-300">
            {nf(intl).format(stats?.live ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-white/35">{t('st.liveNote')}</div>
        </div>

        <Metric label={t('st.visitors')} value={stats?.totals.visitors ?? 0} previous={stats?.previous.visitors} locale={intl} accent />
        <Metric label={t('st.views')} value={stats?.totals.views ?? 0} previous={stats?.previous.views} locale={intl} />
        <Metric label={t('st.sessions')} value={stats?.totals.sessions ?? 0} locale={intl} />
        <Metric
          label={t('st.signups')}
          value={stats?.signupTotal ?? 0}
          locale={intl}
          note={conversion === null ? undefined : `${conversion.toFixed(1)} / 100 · ${t('st.conversion')}`}
        />
      </div>

      {empty ? (
        <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-14 text-center">
          <Activity size={26} className="mx-auto text-white/25" />
          <p className="mt-3 font-extrabold text-white">{t('st.noData')}</p>
          <p className="mt-1 text-sm text-white/45">{t('st.noDataHint')}</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={t('st.overTime')} wide>
            <AreaChart
              data={stats.series}
              locale={intl}
              step={stats.seriesStep}
              labels={{ views: t('st.views'), visitors: t('st.visitors') }}
            />
            <div className="mt-2 flex gap-4 text-[11px] text-white/45">
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-yellow" />{t('st.views')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#8f71ff]" />{t('st.visitors')}</span>
            </div>
          </Card>

          <Card title={t('st.sources')}>
            <div className="flex items-center gap-5">
              <Donut slices={sources.map((s) => ({ label: s.label, value: s.value, colour: s.colour }))} />
              <div className="min-w-0 flex-1">
                <BarList rows={sources.slice(0, 7)} locale={intl} />
              </div>
            </div>
          </Card>

          <Card title={t('st.signupsBySource')}>
            {stats.signups.length ? (
              <BarList
                rows={stats.signups.map((row, index) => ({
                  label: sourceLabel(row.source, t),
                  value: row.count,
                  colour: colourFor(row.source, index)
                }))}
                locale={intl}
              />
            ) : (
              <p className="text-sm text-white/40">{t('st.noData')}</p>
            )}
          </Card>

          {stats.campaigns.length ? (
            <Card title={t('st.campaigns')} wide>
              <BarList
                rows={stats.campaigns.map((row, index) => ({
                  label: `${row.campaign} · ${sourceLabel(row.source, t)}${row.medium ? ` · ${row.medium}` : ''}`,
                  value: row.views,
                  hint: `· ${nf(intl).format(row.visitors)}`,
                  colour: colourFor(row.source, index)
                }))}
                locale={intl}
              />
            </Card>
          ) : null}

          <Card title={t('st.pages')}>
            <BarList rows={stats.pages.map((p) => ({ label: p.path, value: p.views }))} locale={intl} colour="#8f71ff" />
          </Card>

          <Card title={t('st.countries')}>
            <BarList
              rows={stats.countries.map((c) => ({
                label: c.country === '??' ? t('st.source.unknown') : c.country,
                value: c.views
              }))}
              locale={intl}
              colour="#37d3a0"
            />
          </Card>

          <Card title={t('st.devices')} wide>
            <div className="flex flex-wrap items-center gap-5">
              <Donut
                size={104}
                slices={stats.devices.map((d, i) => ({
                  label: d.device,
                  value: d.views,
                  colour: ['#ffca28', '#8f71ff', '#37d3a0'][i % 3]
                }))}
              />
              <div className="min-w-0 flex-1">
                <BarList
                  rows={stats.devices.map((d, i) => ({
                    label: d.device === 'mobile' ? t('st.device.mobile')
                      : d.device === 'tablet' ? t('st.device.tablet') : t('st.device.desktop'),
                    value: d.views,
                    colour: ['#ffca28', '#8f71ff', '#37d3a0'][i % 3]
                  }))}
                  locale={intl}
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Zdanie, bez którego te liczby byłyby nieuczciwe. Nie w stopce małym drukiem: kto
          patrzy na wykres, ma wiedzieć, czego ten wykres NIE pokazuje. */}
      <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-white/40">
        {t('st.consentNote')} · {t('st.auto')}
      </p>
    </div>
  );
}
