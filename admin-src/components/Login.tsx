import { useState } from 'react';
import { motion } from 'motion/react';
import { LockKeyhole } from 'lucide-react';
import { useAuth, useLocale } from '@/hooks';
import { LanguagePicker } from '@/components/LanguagePicker';

/**
 * The way in.
 *
 * Deliberately says nothing about what is behind it. A login screen that lists the
 * sections it is protecting is an invitation, and this page is reachable by anyone who
 * types /admin.
 */
export function Login({ onUnlocked }: { onUnlocked: () => void }) {
  const { t } = useLocale();
  const { attempt } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<'wrong' | 'missing' | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = attempt(password);
    if (result === 'ok') {
      onUnlocked();
      return;
    }
    setError(result);
    setPassword('');
  }

  return (
    <div className="min-h-full grid place-items-center p-6 bg-navy-950">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md rounded-3xl bg-navy-900 border border-white/10 p-8 shadow-2xl"
      >
        {/* Confetti tape, same as the wall on the public site. */}
        <div
          className="h-[7px] rounded-full mb-6"
          style={{
            background:
              'repeating-linear-gradient(135deg,#ffc928 0 14px,#f6494f 14px 28px,#2469d8 28px 42px,#2fbf71 42px 56px)'
          }}
        />

        <div className="flex items-center gap-3 mb-1">
          <span className="grid place-items-center w-10 h-10 rounded-2xl bg-yellow text-navy-950">
            <LockKeyhole size={20} />
          </span>
          <div>
            <div className="text-[11px] tracking-[0.2em] uppercase font-extrabold text-yellow">
              {t('app.subtitle')}
            </div>
            <h1 className="text-xl font-extrabold tracking-tight">{t('login.title')}</h1>
          </div>
        </div>

        <p className="text-sm text-white/60 mt-3 leading-relaxed">{t('login.lead')}</p>

        <form onSubmit={submit} className="mt-6 grid gap-3">
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-wider text-white/50">
              {t('login.password')}
            </span>
            <input
              type="password"
              value={password}
              autoFocus
              autoComplete="current-password"
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-white
                         outline-none focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2"
            />
          </label>

          <button
            type="submit"
            className="rounded-full bg-yellow text-navy-950 font-extrabold uppercase tracking-wider
                       text-sm py-3 hover:bg-white transition-colors"
          >
            {t('login.submit')}
          </button>

          {error && (
            <p role="alert" className="text-sm text-[#ffb3b3] mt-1">
              {t(error === 'missing' ? 'login.missing' : 'login.wrong')}
            </p>
          )}
        </form>

        <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-between">
          <span className="text-xs text-white/40">{t('lang.label')}</span>
          <LanguagePicker />
        </div>
      </motion.div>
    </div>
  );
}
