import { useEffect, useMemo, useState } from 'react';
import { fetchRoster } from '../api';
import type { TranslateKey } from '../i18n';

/**
 * Registrations per day, last thirty days.
 *
 * WHY THIS IS NOT THE CHART LIBRARY THAT WAS ASKED FOR
 *   The suggestion was a Chart.js bundle hosted on framer.com, loaded at runtime. That
 *   would put a third-party script inside the admin panel — the one page that holds the
 *   roster passphrase in memory and can read every participant's name, address and phone
 *   number. Whoever controls that URL would be able to read all of it, and the URL is not
 *   ours. It is also a network request between opening the tab and seeing a chart, on a
 *   phone, in a street.
 *
 *   So: plain SVG, about eighty lines, no dependency and no request. It draws bars, a
 *   baseline and two numbers, which is the whole of what the chart was for. If this ever
 *   needs stacked areas or zooming, `npm i chart.js` is the honest way to get there —
 *   installed, versioned and served from the same origin as the panel.
 *
 * WHERE THE DATA COMES FROM
 *   The roster, which the panel already reads for the Registrations tab. Bucketing it by
 *   day in the browser avoids a second endpoint, a second query and a second thing that
 *   can disagree with the table. Thirty days of a few hundred rows is nothing to count.
 */

const DAYS = 30;
const HEIGHT = 132;

interface Bucket {
  key: string;
  label: string;
  count: number;
}

export function SignupsChart({
  t,
  apiKey,
  intl
}: {
  t: (key: TranslateKey) => string;
  apiKey: string;
  intl: string;
}) {
  const [dates, setDates] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchRoster(apiKey, 1000)
      .then((response) => {
        if (!alive) return;
        setDates((response.rows || []).map((row) => String(row.createdAt || '')).filter(Boolean));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [apiKey]);

  const buckets = useMemo<Bucket[]>(() => {
    // Every day in the window, including the empty ones. A chart that skips quiet days
    // makes a slow fortnight look like a busy one.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit' });

    const out: Bucket[] = [];
    for (let back = DAYS - 1; back >= 0; back -= 1) {
      const date = new Date(today);
      date.setDate(date.getDate() - back);
      out.push({ key: date.toISOString().slice(0, 10), label: day.format(date), count: 0 });
    }

    const index = new Map(out.map((bucket, position) => [bucket.key, position]));
    for (const raw of dates || []) {
      const position = index.get(raw.slice(0, 10));
      if (position !== undefined) out[position]!.count += 1;
    }
    return out;
  }, [dates, intl]);

  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const peak = Math.max(...buckets.map((bucket) => bucket.count), 0);
  const best = buckets.find((bucket) => bucket.count === peak && peak > 0);

  if (failed) return null;

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div>
          <h3 className="text-sm font-bold text-white">{t('dash.chart')}</h3>
          <p className="mt-1 text-[12px] text-white/45">{t('dash.chartLead')}</p>
        </div>
        {total > 0 ? (
          <dl className="flex gap-5 text-[12px]">
            <div>
              <dt className="text-white/40">{t('dash.chartTotal')}</dt>
              <dd className="text-base font-bold tabular-nums text-white">{total}</dd>
            </div>
            <div>
              <dt className="text-white/40">{t('dash.chartBest')}</dt>
              <dd className="text-base font-bold tabular-nums text-yellow">
                {best?.label} · {peak}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      {dates === null ? (
        <div className="mt-5 h-[132px] animate-pulse rounded-xl bg-white/5" />
      ) : total === 0 ? (
        <p className="mt-4 text-[13px] text-white/40">{t('dash.chartEmpty')}</p>
      ) : (
        <>
          {/* One <svg> that scales with the card. preserveAspectRatio="none" is
              deliberate: the bars are a comparison of heights, and stretching them
              sideways to fill a wide card does not distort that. */}
          <svg
            viewBox={`0 0 ${DAYS * 10} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={t('dash.chart')}
            className="mt-5 block h-[132px] w-full"
          >
            {buckets.map((bucket, index) => {
              // A day with one entry still has to be visible, so an empty bar is 0 and
              // any non-zero count gets at least three pixels.
              const height = bucket.count === 0 ? 0 : Math.max(3, (bucket.count / peak) * (HEIGHT - 8));
              return (
                <rect
                  key={bucket.key}
                  x={index * 10 + 1.5}
                  y={HEIGHT - height}
                  width={7}
                  height={height}
                  rx={2}
                  className={bucket.count === peak ? 'fill-yellow' : 'fill-white/25'}
                >
                  <title>
                    {bucket.label} — {bucket.count}
                  </title>
                </rect>
              );
            })}
          </svg>

          {/* Three labels, not thirty. Thirty dates across a phone is a grey smear. */}
          <div className="mt-2 flex justify-between text-[11px] tabular-nums text-white/35">
            <span>{buckets[0]?.label}</span>
            <span>{buckets[Math.floor(DAYS / 2)]?.label}</span>
            <span>{buckets[DAYS - 1]?.label}</span>
          </div>
        </>
      )}
    </section>
  );
}
