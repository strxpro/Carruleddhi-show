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

/* ------------------------------------------------------------------- voting */

export type VotingPhase = 'scheduled' | 'voting' | 'closed';

export interface VotingParticipant {
  id: string;
  registrationId: string | null;
  category: string;
  startNumber: number;
  firstName: string;
  lastName: string;
  projectName: string;
  /** Signed URL, good for an hour. Empty when there is no photo. */
  photo: string;
  /** The path in the private bucket. This is what gets saved, not the URL above. */
  imagePath: string;
  active: boolean;
  voteCount: number;
  averageScore: number;
}

export interface VotingState {
  ok: boolean;
  /** Worked out from the clock by the Worker. The panel never computes this itself. */
  phase: VotingPhase;
  /** What the organiser declared. Differs from `phase` when it was closed by hand. */
  status: string;
  raceStartsAt: string | null;
  votingEndsAt: string | null;
  durationMinutes: number;
  scoreMin: number;
  scoreMax: number;
  participants: VotingParticipant[];
  totalVotes: number;
}

export interface ParticipantDraft {
  id?: string;
  registrationId?: string;
  category?: string;
  startNumber?: number;
  firstName?: string;
  lastName?: string;
  projectName?: string;
  imagePath?: string;
  active?: boolean;
}

export const fetchVoting = (key: string) =>
  ask<VotingState>('voting-admin', key, { action: 'state' });

export const saveParticipant = (key: string, draft: ParticipantDraft) =>
  ask<{ participant?: unknown }>('voting-admin', key, { action: 'save', ...draft });

export const removeParticipant = (key: string, id: string) =>
  ask<{ removed?: string }>('voting-admin', key, { action: 'remove', id });

/** Upload first, save second. A failed upload must leave the row exactly as it was. */
export const uploadParticipantPhoto = (key: string, photo: string) =>
  ask<{ imagePath: string; url: string }>('voting-admin', key, { action: 'photo', photo });

export const scheduleVoting = (key: string, raceStartsAt: string, durationMinutes: number) =>
  ask<VotingState>('voting-admin', key, { action: 'schedule', raceStartsAt, durationMinutes });

export const openVotingNow = (key: string, durationMinutes: number) =>
  ask<VotingState>('voting-admin', key, { action: 'open', durationMinutes });

export const closeVotingNow = (key: string) =>
  ask<VotingState>('voting-admin', key, { action: 'close' });

export interface WinnerLetter {
  place: number;
  category: string;
  startNumber: number;
  projectName: string;
  participantName: string;
  averageScore: number;
  voteCount: number;
}

export const mailWinners = (key: string) =>
  ask<{ sent: WinnerLetter[]; unreachable: WinnerLetter[] }>('voting-admin', key, { action: 'winners' });
