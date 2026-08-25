import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import type { Dict, PanelLocale, TranslateKey } from './i18n';

/**
 * The login screen.
 *
 * The panel is behind this and nothing loads until it passes — no roster fetch, no chat
 * poll — so a stranger who finds /admin sees one input and learns nothing about what is
 * behind it. The passphrase is checked on the server, not here.
 */
export function Gate({
  t,
  locale,
  setLocale,
  onUnlock,
  busy,
  error
}: {
  t: (key: TranslateKey) => string;
  locale: PanelLocale;
  setLocale: (locale: PanelLocale) => void;
  onUnlock: (key: string, remember: boolean) => void;
  busy: boolean;
  error?: keyof Dict;
}) {
  const [value, setValue] = useState('');
  const [remember, setRemember] = useState(false);

  return (
    <div className="grid min-h-dvh place-items-center bg-navy-950 px-5">
      <div className="w-full max-w-sm">
        {/* Confetti tape, same as the site's wall. This is a back office, not a
            different company. */}
        <div
          className="h-[7px] rounded-full"
          style={{
            background:
              'repeating-linear-gradient(135deg,#ffc928 0 14px,#f6494f 14px 28px,#2469d8 28px 42px,#2fbf71 42px 56px)'
          }}
        />

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim()) onUnlock(value.trim(), remember);
          }}
          className="mt-4 rounded-3xl border border-white/10 bg-navy-900 p-7 shadow-2xl"
        >
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-yellow">
            <KeyRound className="size-3.5" />
            Carruleddhi Show 2026
          </div>

          <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-white">
            {t('gate.title')}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/55">{t('gate.lead')}</p>

          <input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('gate.password')}
            aria-label={t('gate.password')}
            autoComplete="current-password"
            autoFocus
            required
            className="mt-5 w-full rounded-2xl border border-white/15 bg-white/6 px-4 py-3.5 text-white outline-none placeholder:text-white/35 focus:border-yellow/70 focus:ring-2 focus:ring-yellow/25"
          />

          <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[13px] text-white/55">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="size-4 accent-yellow"
            />
            {t('gate.remember')}
          </label>

          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-yellow py-3.5 text-sm font-bold uppercase tracking-wider text-navy-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? t('gate.checking') : t('gate.enter')}
          </button>

          {error ? (
            <p role="alert" className="mt-3 text-center text-[13px] text-coral">
              {t(error)}
            </p>
          ) : null}

          {/* Language is offered before signing in, because the wrong-password message
              is the first thing somebody might need to read. */}
          <div className="mt-6 flex justify-center gap-1 border-t border-white/10 pt-5">
            {(['pl', 'it'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                aria-pressed={locale === code}
                className={
                  locale === code
                    ? 'rounded-full bg-white/12 px-3.5 py-1.5 text-xs font-bold text-white'
                    : 'rounded-full px-3.5 py-1.5 text-xs font-semibold text-white/45 hover:text-white'
                }
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
