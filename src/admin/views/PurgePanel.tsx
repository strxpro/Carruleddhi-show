import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { purgeData, type PurgeScope } from '../api';
import type { TranslateKey } from '../i18n';

/**
 * Wiping the test data.
 *
 * Every number on this site is meant to be real, so a fortnight of test entries has to
 * go before it opens. Doing that in the Supabase table editor means six tables, deleting
 * by hand, and trying to remember which ones you have already done.
 *
 * THREE THINGS STAND BETWEEN A PRESS AND A DELETION
 *   The scope has to be chosen, the word has to be typed, and the server checks a string
 *   that names the scope. That is more friction than a confirm dialog on purpose: this is
 *   the only screen in the panel whose effect cannot be undone, and the row it deletes is
 *   somebody's entry in a race.
 *
 *   The typed word is not security — the passphrase is. It is there so the action cannot
 *   be completed by momentum.
 */

const SCOPES: { scope: PurgeScope; label: TranslateKey }[] = [
  { scope: 'registrations', label: 'set.purgeRegistrations' },
  { scope: 'attendance', label: 'set.purgeAttendance' },
  { scope: 'subscribers', label: 'set.purgeSubscribers' },
  { scope: 'messages', label: 'set.purgeMessages' },
  { scope: 'chat', label: 'set.purgeChat' },
  { scope: 'wall', label: 'set.purgeWall' },
  { scope: 'everything', label: 'set.purgeEverything' }
];

export function PurgePanel({ t, apiKey }: { t: (key: TranslateKey) => string; apiKey: string }) {
  const [asking, setAsking] = useState<PurgeScope | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ scope: string; numbers: boolean } | null>(null);
  const [failed, setFailed] = useState(false);

  const ask = (scope: PurgeScope) => {
    setAsking(scope);
    setTyped('');
    setDone(null);
    setFailed(false);
  };

  const run = async () => {
    if (!asking) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await purgeData(apiKey, asking);
      setDone({ scope: asking, numbers: response.sequenceReset });
      setAsking(null);
      setTyped('');
    } catch (_) {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-coral/30 bg-coral/6 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-coral/15 text-coral">
          <AlertTriangle className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">{t('set.purge')}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-white/60">{t('set.purgeLead')}</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/40">{t('set.purgeWarn')}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SCOPES.map(({ scope, label }) => (
          <button
            key={scope}
            type="button"
            onClick={() => ask(scope)}
            className={[
              'flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-[13px] font-medium transition',
              scope === 'everything'
                ? 'border-coral/50 bg-coral/10 text-coral hover:bg-coral hover:text-white'
                : 'border-white/12 bg-navy-900/60 text-white/85 hover:border-coral/50 hover:text-white'
            ].join(' ')}
          >
            {t(label)}
            <Trash2 className="size-3.5 shrink-0 opacity-60" />
          </button>
        ))}
      </div>

      {asking ? (
        <div className="mt-4 rounded-xl border border-coral/40 bg-navy-950/70 p-4">
          <p className="text-[13px] font-semibold text-white">
            {t(SCOPES.find((entry) => entry.scope === asking)!.label)}
          </p>
          <label className="mt-3 block text-[12px] text-white/55" htmlFor="purge-confirm">
            {t('set.purgeAsk')}
          </label>
          <input
            id="purge-confirm"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="USUN"
            className="mt-1.5 w-full max-w-48 rounded-lg border border-white/20 bg-white/5 px-3 py-2 font-mono text-sm tracking-widest text-white placeholder:text-white/25 focus:border-coral focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              // Compared case-insensitively and trimmed: this is a confirmation, not a
              // password, and failing somebody for a trailing space teaches nothing.
              disabled={typed.trim().toUpperCase() !== 'USUN' || busy}
              onClick={run}
              className="rounded-full bg-coral px-4 py-2 text-xs font-bold text-white disabled:opacity-35"
            >
              {busy ? t('set.saving') : t('set.purgeGo')}
            </button>
            <button
              type="button"
              onClick={() => setAsking(null)}
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 hover:border-white/50 hover:text-white"
            >
              {t('set.purgeCancel')}
            </button>
          </div>
        </div>
      ) : null}

      {done ? (
        <p className="mt-3 text-[12px] text-emerald-300">
          {t('set.purgeDone')}
          {done.numbers ? ` ${t('set.purgeNumbersReset')}` : ''}
        </p>
      ) : null}
      {failed ? <p className="mt-3 text-[12px] text-coral">{t('set.purgeFailed')}</p> : null}
    </section>
  );
}
