import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names and resolves Tailwind conflicts.
 *
 * The convention every pasted shadcn component expects. `clsx` handles the
 * conditionals; `twMerge` makes the last conflicting utility win, so a component's
 * default `px-4` can be overridden by a caller's `px-2` instead of both landing in the
 * class list and the outcome depending on stylesheet order.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
