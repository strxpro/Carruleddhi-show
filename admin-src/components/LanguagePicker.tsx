import { LANGUAGE_NAMES, LOCALES } from '@/i18n';
import { useLocale } from '@/hooks';
import { cn } from '@/lib/utils';

/**
 * Two buttons, not a dropdown.
 *
 * With exactly two choices a select box costs a click to discover what the alternative
 * even is. Both labels are visible and the current one is obvious.
 */
export function LanguagePicker({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();

  return (
    <div
      className={cn('inline-flex rounded-full bg-white/5 border border-white/10 p-0.5', className)}
      role="group"
      aria-label={LANGUAGE_NAMES[locale]}
    >
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider transition-colors',
            locale === code ? 'bg-yellow text-navy-950' : 'text-white/60 hover:text-white'
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
