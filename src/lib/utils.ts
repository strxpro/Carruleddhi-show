import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names and lets a later one win over an earlier one.
 *
 * `clsx` handles the conditionals; `twMerge` resolves the conflicts. Without the
 * second half, `cn('p-2', 'p-4')` produces both and the winner is whichever CSS rule
 * happens to come later in the bundle — which is how a component prop that is supposed
 * to override a default silently does nothing.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** dd.mm.yyyy hh:mm in the event's timezone, from an ISO timestamp. */
export function formatMoment(value: string | null | undefined, locale = 'pl-PL') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/**
 * "3 min", "2 godz.", "wczoraj" — for a chat list, where the exact second is noise.
 *
 * Uses Intl.RelativeTimeFormat so the wording is correct in both panel languages
 * without a table of plural forms per language.
 */
export function formatAgo(value: string | null | undefined, locale = 'pl') {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((then - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4],
    ['month', 12]
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  let value_ = seconds;
  for (const [unit, size] of units) {
    if (Math.abs(value_) < size) return format.format(Math.round(value_), unit);
    value_ /= size;
  }
  return format.format(Math.round(value_), 'year');
}
