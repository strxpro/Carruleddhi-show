import { useCallback, useEffect, useState } from 'react';
import { verifyKey, ApiError } from './api';

/**
 * Holds the passphrase for as long as the panel is open.
 *
 * WHERE IT IS KEPT, AND WHY THAT IS A CHOICE
 *   sessionStorage by default: the key is gone when the tab closes, which is the right
 *   default for something that lists participants' phone numbers and is opened on a
 *   phone that gets handed around at a race.
 *
 *   localStorage only if the person ticks "stay signed in", because that is a decision
 *   about their own device and they are better placed to make it than I am. Both are
 *   readable by any script on this origin, so neither is a vault — the passphrase is a
 *   shared secret for a small event, not a password to a bank. What matters more is that
 *   it never reaches Supabase: the function holds the service key and swaps this for it.
 *
 * The key is verified against the server before the panel renders, so a stale entry from
 * a rotated ROSTER_KEY shows a login screen rather than six tabs of failed requests.
 */

const STORAGE_KEY = 'carruleddhi.admin.key';

export type SessionState =
  | { status: 'checking' }
  | { status: 'locked'; error?: string }
  | { status: 'open'; key: string };

function readStored() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    // Private mode with storage disabled. The panel still works, it just asks every time.
    return '';
  }
}

function store(key: string, remember: boolean) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, key);
    if (remember) window.localStorage.setItem(STORAGE_KEY, key);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do; the key stays in memory for this page */
  }
}

function forget() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Turns an API failure into something worth showing a person. */
function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'gate.wrong';
    if (error.code === 'ROSTER_DISABLED') return 'gate.disabled';
    if (error.code === 'WALL_DISABLED') return 'gate.disabled';
  }
  return 'gate.offline';
}

export function useSession() {
  const [state, setState] = useState<SessionState>({ status: 'checking' });

  // A stored key is a claim, not a fact. It is checked once on load.
  useEffect(() => {
    const stored = readStored();
    if (!stored) {
      setState({ status: 'locked' });
      return;
    }
    let cancelled = false;
    verifyKey(stored)
      .then(() => {
        if (!cancelled) setState({ status: 'open', key: stored });
      })
      .catch(() => {
        if (cancelled) return;
        forget();
        setState({ status: 'locked' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unlock = useCallback(async (key: string, remember: boolean) => {
    setState({ status: 'checking' });
    try {
      await verifyKey(key);
      store(key, remember);
      setState({ status: 'open', key });
      return true;
    } catch (error) {
      setState({ status: 'locked', error: describe(error) });
      return false;
    }
  }, []);

  const lock = useCallback(() => {
    forget();
    setState({ status: 'locked' });
  }, []);

  return { state, unlock, lock };
}
