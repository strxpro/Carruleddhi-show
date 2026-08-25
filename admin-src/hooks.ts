import { createContext, useContext, useEffect, useState } from 'react';
import { DICTIONARIES, LOCALES, type Dict, type Locale } from '@/i18n';

/* ============================================================================
   Language
   ============================================================================ */

const LOCALE_KEY = 'carruleddhi.admin.locale';

export const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: keyof Dict) => string;
}>({
  locale: 'pl',
  setLocale: () => {},
  t: (key) => String(key)
});

export const useLocale = () => useContext(LocaleContext);

/** Remembers the choice, and starts from the browser's language on a first visit. */
export function useLocaleState() {
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
    return navigator.language.toLowerCase().startsWith('it') ? 'it' : 'pl';
  });

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const t = (key: keyof Dict) => DICTIONARIES[locale][key] ?? DICTIONARIES.pl[key] ?? String(key);
  return { locale, setLocale, t };
}

/* ============================================================================
   Getting in
   ============================================================================
   Two separate passwords, on purpose, and the difference matters.

   VITE_ADMIN_PASSWORD unlocks the panel's interface. It is compiled into the
   JavaScript, so anybody who reads the bundle can find it — which is why it guards
   nothing but the layout. It exists so a stranger who reaches /admin sees a login box
   instead of a dashboard.

   ROSTER_KEY is the one that matters. It lives only in Vercel's environment, is checked
   by the function on every request, and without it no participant data is returned no
   matter what the browser claims. It is typed into the panel and kept in sessionStorage
   for the tab's lifetime, never written to disk.

   Putting the real key in VITE_ anything would publish it in a file served to the
   internet. That is the whole reason for the split.
   ============================================================================ */

const SESSION_KEY = 'carruleddhi.admin.unlocked';
const DATA_KEY = 'carruleddhi.admin.rosterKey';

export function useAuth() {
  const expected = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined;
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1');

  function attempt(password: string) {
    if (!expected) return 'missing' as const;
    if (password !== expected) return 'wrong' as const;
    sessionStorage.setItem(SESSION_KEY, '1');
    setUnlocked(true);
    return 'ok' as const;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(DATA_KEY);
    setUnlocked(false);
  }

  return { unlocked, attempt, logout, configured: Boolean(expected) };
}

/** The passphrase the API checks. Session-scoped: closing the tab forgets it. */
export function useDataKey() {
  const [key, setKey] = useState(() => sessionStorage.getItem(DATA_KEY) ?? '');
  useEffect(() => {
    if (key) sessionStorage.setItem(DATA_KEY, key);
    else sessionStorage.removeItem(DATA_KEY);
  }, [key]);
  return { key, setKey };
}
