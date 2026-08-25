/**
 * Everything the panel asks the server for.
 *
 * One file, because every call shares the same three properties: it is a POST to
 * /api/carruleddhi/<type>, it carries the passphrase in a header, and a 401 means the
 * passphrase is wrong rather than that the request was malformed. Spreading that across
 * components is how one of them ends up forgetting the header.
 *
 * The passphrase is ROSTER_KEY, checked in the Vercel function. It never reaches
 * Supabase — the function holds the service key and the browser never sees it.
 */

const ROSTER_HEADER = 'X-Carruleddhi-Roster-Key';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

async function call<T>(path: string, key: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/carruleddhi/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [ROSTER_HEADER]: key },
    body: JSON.stringify(body),
    credentials: 'omit'
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const code = typeof payload.code === 'string' ? payload.code : undefined;
    throw new ApiError(
      code ?? `HTTP ${response.status}`,
      response.status,
      code
    );
  }
  return payload as T;
}

/* ------------------------------------------------------------------ types */

export interface InboxCounts {
  registrations: number;
  contacts: number;
  reminders: number;
  newsletter: number;
  wall: number;
  chats: number;
}

export interface Inbox {
  ok: true;
  since: string;
  counts: InboxCounts;
  total: number;
}

export interface RosterRow {
  raceNumber?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  cartName?: string;
  category?: string;
  teamName?: string;
  locale?: string;
  status?: string;
  isMinor?: boolean | string;
  guardianName?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface WallComment {
  id: string;
  createdAt: string;
  name: string;
  place: string;
  message: string;
  locale: string;
  rating: number | null;
  approved: boolean;
  photo: string;
}

export interface ChatThread {
  id: string;
  createdAt: string;
  lastAt: string;
  name: string;
  email: string;
  locale: string;
  mode: 'ai' | 'human' | 'closed';
  unread: number;
}

export interface ChatMessage {
  id: string;
  at: string;
  author: 'visitor' | 'ai' | 'organiser';
  body: string;
}

/* ------------------------------------------------------------------ calls */

/**
 * Checks a passphrase.
 *
 * Uses the inbox counts because it is the cheapest protected call there is — one
 * indexed count per table and no rows come back. A dedicated "verify" endpoint would be
 * a second thing to keep in step for no gain.
 */
export const verifyKey = (key: string) => call<Inbox>('inbox', key, { action: 'counts' });

export const fetchInbox = (key: string) => call<Inbox>('inbox', key, { action: 'counts' });
export const markInboxSeen = (key: string) => call<{ ok: true }>('inbox', key, { action: 'seen' });

export const fetchRoster = (key: string, limit = 500) =>
  call<{ ok: true; rows?: RosterRow[] }>('roster', key, { limit });

export const fetchWall = (key: string, limit = 60) =>
  call<{ ok: true; comments: WallComment[] }>('wall', key, { type: 'wall-admin', action: 'list', limit });

export const moderateWall = (key: string, id: string, action: 'approve' | 'hide' | 'delete') =>
  call<{ ok: true }>('wall', key, { type: 'wall-admin', action, id });

export const fetchThreads = (key: string, limit = 60) =>
  call<{ ok: true; threads: ChatThread[] }>('chat-admin', key, { action: 'list', limit });

export const fetchThreadMessages = (key: string, threadId: string) =>
  call<{ ok: true; messages: ChatMessage[] }>('chat-admin', key, { action: 'messages', threadId });

export const replyToThread = (key: string, threadId: string, message: string) =>
  call<{ ok: true }>('chat-admin', key, { action: 'reply', threadId, message });

export const setThreadMode = (key: string, threadId: string, mode: ChatThread['mode']) =>
  call<{ ok: true; mode: string }>('chat-admin', key, { action: 'mode', threadId, mode });
