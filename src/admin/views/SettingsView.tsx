import { ExternalLink, LogOut } from 'lucide-react';
import type { PanelLocale, TranslateKey } from '../i18n';

export function SettingsView({
  t,
  locale,
  setLocale,
  onForget
}: {
  t: (key: TranslateKey) => string;
  locale: PanelLocale;
  setLocale: (locale: PanelLocale) => void;
  onForget: () => void;
}) {
  const pl = locale === 'pl';

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-2xl font-bold tracking-tight text-white">{t('set.title')}</h2>
      <p className="mt-1.5 text-sm text-white/55">{t('set.lead')}</p>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/4 p-5">
        <h3 className="text-sm font-bold text-white">{t('set.language')}</h3>
        <div className="mt-3 flex gap-2">
          {(['pl', 'it'] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={
                locale === code
                  ? 'rounded-full bg-yellow px-4 py-2 text-xs font-bold text-navy-950'
                  : 'rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 hover:border-white/50 hover:text-white'
              }
            >
              {code === 'pl' ? 'Polski' : 'Italiano'}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-5">
        <h3 className="text-sm font-bold text-white">{t('set.session')}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-white/55">
          {pl
            ? 'Hasło jest sprawdzane po stronie serwera i nigdy nie trafia do Supabase — funkcja trzyma klucz bazy i wymienia je na niego. Jeśli oddajesz to urządzenie komuś, wyloguj się.'
            : 'La password è verificata sul server e non arriva mai a Supabase: la funzione tiene la chiave del database e la scambia con questa. Se passi il dispositivo a qualcuno, esci.'}
        </p>
        <button
          type="button"
          onClick={onForget}
          className="mt-4 flex items-center gap-2 rounded-full border border-coral/40 px-4 py-2 text-xs font-semibold text-coral hover:bg-coral hover:text-white"
        >
          <LogOut className="size-3.5" />
          {t('set.forget')}
        </button>
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-5">
        <h3 className="text-sm font-bold text-white">
          {pl ? 'Gdzie co zmienić' : 'Dove si cambia cosa'}
        </h3>
        <dl className="mt-3 grid gap-2.5 text-[13px]">
          {[
            [pl ? 'Hasła i klucze' : 'Password e chiavi', 'Vercel → Settings → Environment Variables'],
            [pl ? 'Dane zgłoszeń' : 'Dati delle iscrizioni', 'Supabase → Table Editor'],
            [pl ? 'Treść maili' : 'Testo delle e-mail', 'emails/copy.json'],
            [pl ? 'Wysyłka maili' : 'Invio delle e-mail', 'Make → scenariusz 1'],
            [pl ? 'Przypomnienia' : 'Promemoria', 'Make → scenariusz 2']
          ].map(([label, where]) => (
            <div key={label} className="flex flex-wrap gap-x-2 border-b border-white/8 pb-2">
              <dt className="text-white/50">{label}</dt>
              <dd className="ml-auto font-mono text-[12px] text-white/80">{where}</dd>
            </div>
          ))}
        </dl>

        <a
          href="/"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-yellow hover:underline"
        >
          {pl ? 'Otwórz stronę' : 'Apri il sito'}
          <ExternalLink className="size-3.5" />
        </a>
      </section>
    </div>
  );
}
