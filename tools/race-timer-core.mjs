export const controlActions = ['start', 'stop', 'show-participant', 'hide-participant', 'show-sponsors', 'hide-sponsors'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function serverSnapshot(data) {
  const state = data?.state;
  if (data?.ok !== true || data.runReady !== true || !state || !['IDLE', 'RUNNING', 'FINISHED'].includes(state.run_status)
    || !Number.isSafeInteger(state.elapsed_ms) || state.elapsed_ms < 0
    || (state.run_status !== 'IDLE' && (!uuid.test(state.run_id) || !uuid.test(state.current_participant_id)))) {
    throw new Error('BROADCAST_STATE_INVALID: wymagany centralny backend czasu.');
  }
  return { state, serverNow: data.serverNow ?? null };
}

// No clock, persisted measurement, mutation queue or automatic retry lives here.
export class RaceTimer {
  constructor({ api }) { this.api = api; }

  async command(action, options = {}) {
    if (action !== 'status' && !controlActions.includes(action)) throw new Error('Nieznana komenda kontrolera.');
    if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => key !== 'runId')
      || (options.runId !== undefined && (action !== 'stop' || !uuid.test(options.runId)))) {
      throw new Error('Nieprawidlowe opcje kontrolera.');
    }
    const snapshot = serverSnapshot(await this.api('state'));
    if (action === 'status') return snapshot;
    const state = snapshot.state;
    let body = {};
    if (action === 'start') {
      // Admin ON AIR already starts this same DB run. Never restart it locally.
      if (state.run_status === 'RUNNING') return snapshot;
      const participantId = state.participant?.id;
      if (!uuid.test(participantId)) throw new Error('Najpierw wybierz zawodnika w panelu.');
      body = { participantId };
    } else if (action === 'stop') {
      const runId = options.runId ?? state.run_id;
      if (!uuid.test(runId)) throw new Error('RUN_NOT_RUNNING');
      if (runId !== state.run_id) throw new Error(`RUN_ID_MISMATCH: nie zatrzymano nowego przejazdu; runId=${runId}`);
      body = { runId };
    }
    try {
      return serverSnapshot(await this.api(action, body));
    } catch (error) {
      // The request may have committed despite a lost response. Do not claim STOP.
      throw new Error(`Brak potwierdzenia backendu (${error.message}). Stan nieznany; sprawdz status.${body.runId ? ` Ponow tylko dla runId=${body.runId}.` : ''}`, { cause: error });
    }
  }
}

export function createBroadcastApi({ origin, token, rosterKey, fetchImpl = fetch, timeout = 15000 }) {
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))) {
    throw new Error('Nieprawidlowy origin backendu (wymagany HTTPS).');
  }
  if (!token && !rosterKey) throw new Error('Brak BROADCAST_CONTROL_TOKEN lub ROSTER_KEY.');
  const auth = token ? { Authorization: `Bearer ${token}` } : { 'X-Carruleddhi-Roster-Key': rosterKey };
  return async (action, body) => {
    if (action !== 'state' && !controlActions.includes(action)) throw new Error('Niedozwolona trasa kontrolera.');
    let response;
    try {
      response = await fetchImpl(`${url.origin}/api/broadcast/${action}`, {
        method: action === 'state' ? 'GET' : 'POST',
        headers: { ...auth, ...(action === 'state' ? {} : { 'Content-Type': 'application/json' }) },
        ...(action === 'state' ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeout), redirect: 'error', cache: 'no-store',
      });
    } catch { throw new Error('BROADCAST_CONNECTION_FAILED'); }
    let data;
    try { data = await response.json(); } catch { throw new Error('BROADCAST_RESPONSE_INVALID'); }
    if (!response.ok || data?.ok !== true) {
      // Never copy response bodies (which may contain credentials) into local logs.
      const code = /^[A-Z][A-Z0-9_]{1,79}$/.test(data?.code) ? data.code : `HTTP_${response.status}`;
      throw new Error(code);
    }
    return data;
  };
}
