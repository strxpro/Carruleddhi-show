/**
 * Everything the panel asks the server for.
 *
 * One file, because every call shares the same three properties: it is a POST to
 * /api/carruleddhi/<type>, it carries the passphrase in a header, and a failure is
 * something the operator needs to read rather than a console entry. Spreading that
 * across components is how three slightly different error messages appear for one
 * cause.
 */

const ROSTER_HEADER = 'X-Carruleddhi-Roster-Key';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function ask<T>(type: string, key: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/api/carruleddhi/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [ROSTER_HEADER]: key },
    body: JSON.stringify({ type, ...body }),
    // The passphrase is in a header, not a cookie, so there is nothing for the browser
    // to attach and nothing gained by letting it try.
    credentials: 'omit'
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const code = String(payload.code ?? `HTTP_${response.status}`);
    // Translated at the call site; this message is for the log.
    throw new ApiError(`${type} failed: ${code}`, code, response.status);
  }
  return payload as T;
}

/* ------------------------------------------------------------- registrations */

export interface RosterRow {
  raceNumber?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  cartName?: string;
  category?: string;
  teamName?: string;
  birthDate?: string;
  status?: string;
  isMinor?: string | boolean;
  guardianName?: string;
  guardianEmail?: string;
  riderAge?: string;
  createdAt?: string;
}

export const fetchRoster = (key: string, limit = 500) =>
  ask<{ rows?: RosterRow[] }>('roster', key, { limit }).then((r) => r.rows ?? []);

/* ------------------------------------------------------------------ the bell */

export interface InboxCounts {
  registrations: number;
  contacts: number;
  reminders: number;
  newsletter: number;
  wall: number;
  chats: number;
}

export const fetchInbox = (key: string) =>
  ask<{ counts?: InboxCounts; total?: number }>('inbox', key, { action: 'counts' });

export const markInboxSeen = (key: string) => ask<unknown>('inbox', key, { action: 'seen' });

/* -------------------------------------------------------------------- public */

export const fetchCounts = () =>
  fetch('/api/carruleddhi/counts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'counts' }),
    credentials: 'omit'
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null) as Promise<{ attendees?: number; pilots?: number } | null>;
