import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BroadcastConnection, BroadcastState } from './types';

interface SnapshotResponse {
  ok: boolean;
  state?: BroadcastState;
  realtime?: { url: string; anonKey: string | null; code?: string };
  error?: string;
  code?: string;
}

/** Subscribe first, then reconcile: the second snapshot closes the initial HTTP/WS gap. */
export function subscribeBroadcast(
  onState: (state: BroadcastState) => void,
  onConnection: (connection: BroadcastConnection) => void = () => {},
): () => void {
  let disposed = false;
  let revision = -1;
  let client: SupabaseClient | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let connected = false;
  let inFlight: Promise<void> | undefined;
  let reconcilePending = false;
  const abort = new AbortController();

  const status = (value: BroadcastConnection) => { if (!disposed) onConnection(value); };
  const accept = (state: BroadcastState) => {
    if (disposed || state.id !== 'main' || !Number.isSafeInteger(state.revision) || state.revision <= revision) return;
    if (!Array.isArray(state.sponsors)) return;
    revision = state.revision;
    onState(state);
  };
  const scheduleRetry = () => {
    if (disposed || retry) return;
    // Backoff is only for failed transport/bootstrap, never a healthy-state data poll.
    retry = setTimeout(() => { retry = undefined; void reconcile(); }, Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)));
  };

  async function reconcile(): Promise<void> {
    if (disposed) return;
    if (inFlight) { reconcilePending = true; return inFlight; }
    inFlight = (async () => {
      try {
        const response = await fetch('/api/carruleddhi/broadcast', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'state' }), cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
        });
        const data = await response.json() as SnapshotResponse;
        if (!response.ok || !data.ok || !data.state) throw new Error(data.error || data.code || `Broadcast unavailable (${response.status})`);
        if (disposed) return;
        accept(data.state);
        if (!client) {
          if (!data.realtime?.url || !data.realtime.anonKey) throw Object.assign(new Error('Supabase Realtime is not configured. Set the public anon/publishable key on the server.'), { code: 'REALTIME_NOT_CONFIGURED' });
          client = createClient(data.realtime.url, data.realtime.anonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          });
          client.channel('carruleddhi-broadcast', { config: { postgres_changes_options: { wait: true } } })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcast_state', filter: 'id=eq.main' }, (payload) => {
              if (payload.eventType === 'DELETE') { void reconcile(); return; }
              accept(payload.new as BroadcastState);
            })
            .subscribe((channelStatus) => {
              if (disposed) return;
              if (channelStatus === 'SUBSCRIBED') {
                connected = true;
                attempts = 0;
                status({ status: 'live' });
                void reconcile();
              } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(channelStatus)) {
                connected = false;
                status({ status: 'reconnecting', message: 'Connection interrupted. Keeping the last confirmed frame.' });
              }
            });
        }
        attempts = 0;
        if (retry) { clearTimeout(retry); retry = undefined; }
        if (connected) status({ status: 'live' });
      } catch (error) {
        if (disposed) return;
        status({ status: revision < 0 ? 'error' : 'reconnecting', message: error instanceof Error ? error.message : 'Broadcast connection failed', code: error instanceof Error && 'code' in error ? String(error.code) : undefined });
        scheduleRetry();
      }
    })().finally(() => {
      inFlight = undefined;
      if (reconcilePending && !disposed) { reconcilePending = false; void reconcile(); }
    });
    return inFlight;
  }

  const resume = () => {
    if (disposed) return;
    if (retry) { clearTimeout(retry); retry = undefined; }
    client?.realtime.connect();
    void reconcile();
  };
  const visibility = () => { if (document.visibilityState === 'visible') resume(); };
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', visibility);
  status({ status: 'connecting' });
  void reconcile();
  return () => {
    disposed = true;
    abort.abort();
    if (retry) clearTimeout(retry);
    window.removeEventListener('online', resume);
    document.removeEventListener('visibilitychange', visibility);
    if (client) { void client.removeAllChannels(); client.realtime.disconnect(); }
  };
}
