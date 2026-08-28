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

/** One thing that happened, for the bell's list. `kind` matches a key of InboxCounts. */
export interface InboxItem {
  kind: keyof InboxCounts;
  id: string;
  at: string;
  title: string;
  detail: string;
}

export interface Inbox {
  ok: true;
  since: string;
  counts: InboxCounts;
  total: number;
  /** Only present when the bell asked for it — the ten-second poll does not. */
  items?: InboxItem[];
}

/** A guardian block travels with a minor's entry and is null on an adult one. */
export interface RosterGuardian {
  childKind: string;
  relation: string;
  name: string;
  email: string;
  phone: string;
  motherName: string;
  fatherName: string;
  consent: boolean;
}

export interface RosterRow {
  id: string;
  createdAt: string;
  raceNumber: string | null;
  firstName: string;
  lastName: string;
  birthDate: string;
  postalCode: string;
  email: string;
  phone: string;
  address: string;
  cartName: string;
  category: string;
  teamName: string;
  cartNotes: string;
  locale: string;
  status: string;
  emailStatus: string;
  printedAt: string | null;
  /** Non-null when the rider corrected something themselves through the site. */
  selfUpdatedAt: string | null;
  isMinor: boolean;
  riderAge: number | null;
  guardian: RosterGuardian | null;
}

/** The fields the organiser may change. Deliberately not `email` — see ROSTER_EDITABLE. */
export interface RosterEdit {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  postalCode?: string;
  phone?: string;
  address?: string;
  cartName?: string;
  teamName?: string;
  cartNotes?: string;
  category?: string;
  raceNumber?: string;
  status?: string;
}

export interface Subscriber {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  locale: string;
  status: string;
  lastReminder: string | null;
  source: string | null;
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

/** Counts plus the twenty most recent things themselves. Asked for when the bell is opened. */
export const fetchInboxItems = (key: string) => call<Inbox>('inbox', key, { action: 'list' });

/* --------------------------------------------------------------- the roster
   `roster` had no handler on the server until now: the request cleared the passphrase check
   and went to the Make webhook, which answers "Accepted" and no rows — so this screen has
   always drawn "nobody has signed up yet". The action is sent explicitly from here, because
   the endpoint now does four different things. */
export const fetchRoster = (key: string, limit = 500) =>
  call<{ ok: true; rows?: RosterRow[] }>('roster', key, { action: 'list', limit });

export const updateRegistration = (key: string, id: string, changes: RosterEdit) =>
  call<{ ok: true; row: RosterRow | null }>('roster', key, { action: 'update', id, ...changes });

export const deleteRegistration = (key: string, id: string) =>
  call<{ ok: true; deleted: true }>('roster', key, { action: 'delete', id });

/* ------------------------------------------------------- subscription lists */

export const fetchSubscribers = (key: string, list: 'reminders' | 'newsletter', limit = 300) =>
  call<{ ok: true; list: string; rows: Subscriber[] }>('subscribers', key, { action: 'list', list, limit });

export const setSubscriberStatus = (
  key: string,
  list: 'reminders' | 'newsletter',
  id: string,
  action: 'unsubscribe' | 'resubscribe' | 'delete'
) => call<{ ok: true }>('subscribers', key, { action, list, id });

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

/**
 * Tells the visitor somebody is writing.
 *
 * Fire and forget: the caller does not await it and does not care if it fails. A lost
 * keystroke ping costs one cycle of dots not appearing, and an error path for that would be
 * more code than the feature.
 */
export const pingTyping = (key: string, threadId: string) =>
  call<{ ok: true }>('chat-admin', key, { action: 'typing', threadId }).catch(() => {});

export const setThreadMode = (key: string, threadId: string, mode: ChatThread['mode']) =>
  call<{ ok: true; mode: string }>('chat-admin', key, { action: 'mode', threadId, mode });

/* ---------------------------------------------------------------- settings */

export interface Sponsor {
  name: string;
  url: string;
  /** A path in the bucket when saving, a signed URL when reading. See the function. */
  logo: string;
}

export interface SiteSettings {
  siteLocked: boolean;
  sponsors: Sponsor[];
  showGallery: boolean;
  showWall: boolean;
  showPrizes: boolean;
  showCounters: boolean;
}

export const fetchSettings = (key: string) =>
  call<{ ok: true; settings: SiteSettings }>('settings-admin', key, {});

/**
 * Saves part of the settings.
 *
 * Partial on purpose: the server merges onto what is stored, so flipping one switch
 * sends one switch. Sending the whole object back would mean every save rewrites values
 * the panel may have read minutes ago.
 */
export const saveSettings = (key: string, settings: Partial<SiteSettings>) =>
  call<{ ok: true; settings: SiteSettings }>('settings-admin', key, { settings });

/** Uploads a logo and returns its bucket path plus a signed URL to preview it with. */
export const uploadSponsorLogo = (key: string, photo: string) =>
  call<{ ok: true; logo: string; url: string }>('settings-admin', key, { action: 'logo', photo });

/* ------------------------------------------------------------------- purge */

export type PurgeScope =
  | 'registrations'
  | 'attendance'
  | 'subscribers'
  | 'messages'
  | 'chat'
  | 'wall'
  | 'everything';

/**
 * Deletes test data. There is no undo.
 *
 * The `confirm` string is built here rather than typed by the user twice: the guard it
 * provides is against a stray retry or a mis-wired button reaching the server, not
 * against a person who has already typed the scope into a confirmation box. The panel
 * asks for that separately, in words, before calling this.
 */
export const purgeData = (key: string, scope: PurgeScope) =>
  call<{ ok: true; scope: string; cleared: string[]; sequenceReset: boolean }>('purge', key, {
    scope,
    confirm: `USUN ${scope}`
  });
