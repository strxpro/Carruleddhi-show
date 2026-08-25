import { Megaphone } from 'lucide-react';
import type { TranslateKey } from '../i18n';

/**
 * Reminders and the newsletter.
 *
 * Honest about what it cannot do yet. There is no API for reading either list — the rows
 * are in Supabase and the endpoints are not written — so this says so instead of showing
 * an empty table that looks like "nobody signed up". A panel that lies about zero is
 * worse than one that admits a gap.
 */
export function Subscribers({
  t,
  kind
}: {
  t: (key: TranslateKey) => string;
  kind: 'reminders' | 'newsletter';
}) {
  const newsletter = kind === 'newsletter';
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-2xl font-bold tracking-tight text-white">
        {t(newsletter ? 'news.title' : 'rem.title')}
      </h2>
      <p className="mt-1.5 text-sm text-white/55">{t(newsletter ? 'news.lead' : 'rem.lead')}</p>

      <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/3 p-6">
        <p className="text-sm leading-relaxed text-white/60">
          {t('common.loading') === 'Wczytuję…'
            ? 'Lista jest w Supabase, w tabeli ' +
              (newsletter ? 'newsletter_subscribers' : 'reminder_subscribers') +
              '. Endpoint do jej odczytu jeszcze nie istnieje, więc na razie zaglądasz tam przez Table Editor. Licznik nowych zapisów na pulpicie już działa.'
            : 'L’elenco è in Supabase, nella tabella ' +
              (newsletter ? 'newsletter_subscribers' : 'reminder_subscribers') +
              '. L’endpoint per leggerlo non esiste ancora, quindi per ora lo guardi dal Table Editor. Il contatore dei nuovi iscritti nel riepilogo funziona già.'}
        </p>

        {newsletter ? (
          <button
            type="button"
            disabled
            title={t('news.announceSoon')}
            className="mt-5 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white/40"
          >
            <Megaphone className="size-4" />
            {t('news.announce')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
