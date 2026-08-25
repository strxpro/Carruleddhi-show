import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { formatMoment } from '@/lib/utils';
import type { PanelLocale, TranslateKey } from '../i18n';
import type { Inbox } from '../api';

/**
 * What changed since you last looked.
 *
 * Counts, not lists. The question this screen answers is "is there anything for me right
 * now", and a list of forty registrations answers a different one — which is what the
 * Registrations tab is for. Every tile is a button, because a number nobody can act on is
 * decoration.
 */
export function Dashboard({
  t,
  locale,
  inbox,
  onGo
}: {
  t: (key: TranslateKey) => string;
  locale: PanelLocale;
  inbox: Inbox | null;
  onGo: (tab: 'registrations' | 'chat' | 'wall' | 'reminders' | 'newsletter') => void;
}) {
  const tiles = [
    { key: 'registrations', label: t('dash.registrations'), value: inbox?.counts.registrations ?? 0, go: 'registrations' },
    { key: 'chats', label: t('dash.chats'), value: inbox?.counts.chats ?? 0, go: 'chat', urgent: true },
    { key: 'contacts', label: t('dash.contacts'), value: inbox?.counts.contacts ?? 0, go: 'chat' },
    { key: 'wall', label: t('dash.wall'), value: inbox?.counts.wall ?? 0, go: 'wall' },
    { key: 'reminders', label: t('dash.reminders'), value: inbox?.counts.reminders ?? 0, go: 'reminders' },
    { key: 'newsletter', label: t('dash.newsletter'), value: inbox?.counts.newsletter ?? 0, go: 'newsletter' }
  ] as const;

  const quiet = (inbox?.total ?? 0) === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="text-2xl font-bold tracking-tight text-white">{t('dash.title')}</h2>
      <p className="mt-1.5 text-sm text-white/55">{t('dash.lead')}</p>

      {inbox ? (
        <p className="mt-1 text-xs text-white/35">
          {t('dash.since')} {formatMoment(inbox.since, t('locale.intl'))}
        </p>
      ) : null}

      {quiet ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-green/25 bg-green/8 px-5 py-4 text-sm text-white/80">
          <CheckCircle2 className="size-5 shrink-0 text-green" />
          {t('dash.nothing')}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => {
          const hot = tile.value > 0;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => onGo(tile.go)}
              className={[
                'group flex flex-col items-start rounded-2xl border p-5 text-left transition',
                hot
                  ? 'border-yellow/35 bg-yellow/8 hover:border-yellow/60'
                  : 'border-white/10 bg-white/4 hover:border-white/25'
              ].join(' ')}
            >
              <span
                className={[
                  'font-black leading-none tabular-nums',
                  hot ? 'text-4xl text-yellow' : 'text-4xl text-white/30'
                ].join(' ')}
              >
                {tile.value}
              </span>
              <span className="mt-2.5 text-sm font-semibold text-white/85">{tile.label}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-xs text-white/40 transition group-hover:text-white/70">
                {t('top.new')}
                <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-white/30">
        {locale === 'pl'
          ? 'Licznik odświeża się sam co 10 sekund. Dzwonek u góry zeruje go i zapamiętuje moment.'
          : 'Il contatore si aggiorna da solo ogni 10 secondi. La campanella in alto lo azzera e ricorda il momento.'}
      </p>
    </div>
  );
}
