export interface SceneEventData {
  eventName: string;
  eventYear: string;
  eventLocation: string;
  phase: 'scheduled' | 'voting' | 'closed' | 'unknown';
  results: Array<{
    id: string;
    firstName: string;
    lastName: string;
    startNumber: number;
    projectName: string;
    photo: string;
    totalScore: number;
    raceTimeMs: number | null;
    position?: number;
  }>;
  totalVotes?: number;
}

export interface SceneEventStatus {
  status: 'loading' | 'ready' | 'error';
  message?: string;
}

type Metadata = Pick<SceneEventData, 'eventName' | 'eventYear' | 'eventLocation'>;
type Voting = Pick<SceneEventData, 'phase' | 'results' | 'totalVotes'> & { editionYear: string };
type Subscriber = {
  onData: (data: SceneEventData) => void;
  onStatus?: (status: SceneEventStatus) => void;
  voting: boolean;
};
type Endpoint = 'settings' | 'voting';
type PendingRequest = { abort: AbortController; endpoint: Endpoint; timeout?: ReturnType<typeof setTimeout> };

const POLL_MS = 30_000;
const subscribers = new Set<Subscriber>();
let metadata: Metadata = { eventName: '', eventYear: '', eventLocation: '' };
let settingsReady = false;
let voting: Voting = { phase: 'unknown', results: [], editionYear: '' };
let votingReady = false;
const due: Record<Endpoint, number> = { settings: 0, voting: 0 };
const failures: Record<Endpoint, number> = { settings: 0, voting: 0 };
const errors: Record<Endpoint, string> = { settings: '', voting: '' };
let timer: ReturnType<typeof setTimeout> | undefined;
let request: PendingRequest | undefined;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid public response');
  return value as Record<string, unknown>;
}

function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid public text');
  return value.trim();
}

function integer(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw new Error('Invalid public number');
  return value;
}

function year(value: unknown): string {
  return (typeof value === 'string' || typeof value === 'number') && /^[1-9]\d{3}$/.test(String(value)) ? String(value) : '';
}

function dateYear(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return '';
  const day = value.slice(0, 10);
  const calendarDate = new Date(`${day}T00:00:00Z`);
  const parsed = new Date(value);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== day || !Number.isFinite(parsed.getTime())) return '';
  // Match settingsShape/eventYearLabel and the edition key's Europe/Rome year.
  return year(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric' }).format(parsed));
}

function photo(value: unknown): string {
  const url = text(value, 8192);
  if (!url || /[\s\\]/.test(url)) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? url : '';
  } catch { return ''; }
}

function parseSettings(body: Record<string, unknown>): Metadata {
  const settings = record(body.settings);
  return {
    eventName: text(settings.eventName),
    eventLocation: text(settings.eventLocation),
    eventYear: dateYear(settings.eventDate) || year(settings.eventYear),
  };
}

function parseVoting(body: Record<string, unknown>): Voting {
  const phase = body.phase;
  if (phase !== 'scheduled' && phase !== 'voting' && phase !== 'closed') throw new Error('Invalid public phase');
  if (body.isArchive !== undefined && typeof body.isArchive !== 'boolean') throw new Error('Invalid edition flag');
  let editionYear = '';
  if (body.selectedEdition != null) {
    const edition = record(body.selectedEdition);
    if (edition.status !== 'active') throw new Error('Not the current edition');
    editionYear = year(edition.key) || dateYear(edition.date);
    if (!editionYear) throw new Error('Invalid current edition');
  }
  if (body.isArchive === true || (metadata.eventYear && editionYear && metadata.eventYear !== editionYear)) throw new Error('Not the current edition');
  // Deny scores, ranks and counts before closure, even if an API accidentally supplies them.
  if (phase !== 'closed') return { phase, results: [], editionYear };
  // The worker's participants array is category/start-number ordered, not a ranking.
  // Its podium is authoritative, including tie-break order. Never re-sort or invent positions.
  const rows = body.podium !== undefined ? body.podium : body.results;
  if (!Array.isArray(rows) || rows.length > 400) throw new Error('Missing public ranking');
  const ids = new Set<string>();
  const results = rows.map((value): SceneEventData['results'][number] => {
    const row = record(value);
    const id = text(row.id);
    if (!id || ids.has(id)) throw new Error('Invalid public participant ID');
    ids.add(id);
    const result: SceneEventData['results'][number] = {
      id,
      firstName: text(row.firstName),
      lastName: text(row.lastName),
      startNumber: integer(row.startNumber, 1),
      projectName: text(row.projectName, 500),
      photo: photo(row.photo),
      totalScore: integer(row.totalScore),
      raceTimeMs: row.raceTimeMs == null ? null : integer(row.raceTimeMs),
    };
    if (row.position !== undefined) result.position = integer(row.position, 1);
    return result;
  });
  return { phase, results, editionYear, ...(body.totalVotes === undefined ? {} : { totalVotes: integer(body.totalVotes) }) };
}

function wantsVoting(): boolean {
  return [...subscribers].some(subscriber => subscriber.voting);
}

function active(): boolean {
  return subscribers.size > 0 && !document.hidden && navigator.onLine !== false;
}

function publish(subscriber?: Subscriber): void {
  for (const target of subscriber ? [subscriber] : subscribers) {
    const mismatch = !!(metadata.eventYear && voting.editionYear && metadata.eventYear !== voting.editionYear);
    const showVoting = target.voting && !mismatch && (voting.phase !== 'closed' || settingsReady);
    const data: SceneEventData = {
      ...metadata,
      phase: showVoting ? voting.phase : 'unknown',
      results: showVoting ? voting.results.map(row => ({ ...row })) : [],
      ...(showVoting && voting.totalVotes !== undefined ? { totalVotes: voting.totalVotes } : {}),
    };
    target.onData(data);
    const message = errors.settings || (target.voting ? errors.voting || (mismatch ? 'Public results belong to a different edition.' : '') : '');
    target.onStatus?.(message ? { status: 'error', message } : {
      status: settingsReady && (!target.voting || votingReady) ? 'ready' : 'loading',
    });
  }
}

function clearTimer(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

function schedule(): void {
  clearTimer();
  if (!active() || request) return;
  const next = Math.min(settingsReady ? Infinity : due.settings, wantsVoting() ? due.voting : Infinity);
  if (Number.isFinite(next)) timer = setTimeout(() => { timer = undefined; void refresh(); }, Math.max(0, next - Date.now()));
}

async function refresh(): Promise<void> {
  if (!active() || request) return;
  const now = Date.now();
  const endpoint = !settingsReady && due.settings <= now ? 'settings' : wantsVoting() && due.voting <= now ? 'voting' : null;
  if (!endpoint) { schedule(); return; }
  const current: PendingRequest = { abort: new AbortController(), endpoint };
  request = current;
  current.timeout = setTimeout(() => current.abort.abort(), 15_000);
  try {
    const response = await fetch(`/api/carruleddhi/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(endpoint === 'voting' ? { action: 'state' } : {}),
      credentials: 'omit', cache: 'no-store', signal: current.abort.signal,
    });
    if (!response.ok) throw new Error('Public endpoint unavailable');
    const body = record(await response.json());
    if (request !== current || current.abort.signal.aborted) return;
    if (body.ok !== true) throw new Error('Public endpoint failed');
    if (endpoint === 'settings') {
      metadata = parseSettings(body);
      settingsReady = true;
    } else {
      voting = parseVoting(body);
      votingReady = true;
    }
    failures[endpoint] = 0;
    errors[endpoint] = '';
    due[endpoint] = Date.now() + POLL_MS;
    publish();
  } catch {
    if (request !== current) return;
    failures[endpoint]++;
    due[endpoint] = Date.now() + Math.min(300_000, POLL_MS * 2 ** Math.min(failures[endpoint] - 1, 4));
    errors[endpoint] = endpoint === 'settings'
      ? 'Public event details unavailable. Keeping the last confirmed details; retrying when visible.'
      : 'Public voting unavailable. Keeping the last confirmed results; retrying when visible.';
    publish();
  } finally {
    clearTimeout(current.timeout);
    if (request === current) { request = undefined; schedule(); }
  }
}

function pause(): void {
  clearTimer();
  const previous = request;
  request = undefined;
  if (previous) clearTimeout(previous.timeout);
  previous?.abort.abort();
}

function resume(): void {
  if (!active()) { pause(); return; }
  // A successful settings read is page-cached; reconnect only retries an unsuccessful one.
  if (!settingsReady) due.settings = 0;
  if (wantsVoting()) due.voting = 0;
  clearTimer();
  void refresh();
}

/** One page-local transport shared across mounts. Only VOTING/RESULTS opt into polling. */
export function subscribeSceneEvent(
  onData: (data: SceneEventData) => void,
  onStatus?: (status: SceneEventStatus) => void,
  options: { voting?: boolean } = {},
): () => void {
  const first = subscribers.size === 0;
  const hadVoting = wantsVoting();
  const subscriber: Subscriber = { onData, onStatus, voting: options.voting === true };
  subscribers.add(subscriber);
  publish(subscriber);
  if (first) {
    window.addEventListener('online', resume);
    window.addEventListener('offline', pause);
    document.addEventListener('visibilitychange', resume);
  }
  if (!hadVoting && subscriber.voting) due.voting = 0;
  void refresh();
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    subscribers.delete(subscriber);
    if (!subscribers.size) {
      pause();
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', pause);
      document.removeEventListener('visibilitychange', resume);
    } else {
      if (!wantsVoting() && request?.endpoint === 'voting') pause();
      schedule();
    }
  };
}
