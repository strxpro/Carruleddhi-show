import { useEffect, useRef, useState } from 'react';
import { broadcastAdmin, saveParticipant, type BroadcastAction, type BroadcastAdminParticipant, type RosterRow } from '../api';
import { RaceTimeEditor } from './RaceTimeEditor';
import type { TranslateKey } from '../i18n';
import { subscribeBroadcast } from '../../obs/live-client';
import type { BroadcastConnection, BroadcastState } from '../../obs/types';
import { BroadcastPortrait } from './BroadcastPortrait';
import { RunControl, type RunClockSample } from './RunControl';

type Translate = (key: TranslateKey) => string;

export function useRosterLive(apiKey: string) {
  const [state, setState] = useState<BroadcastState | null>(null);
  const [participants, setParticipants] = useState<BroadcastAdminParticipant[]>([]);
  const [timingReady, setTimingReady] = useState(false);
  const [runReady, setRunReady] = useState(false);
  const [sample, setSample] = useState<RunClockSample>({});
  const [connection, setConnection] = useState<BroadcastConnection>({ status: 'connecting' });
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [portrait, setPortrait] = useState<BroadcastAdminParticipant | null>(null);
  const epoch = useRef(0);
  const locked = useRef(true);
  const metadataRevision = useRef(-1);
  const accept = (next: BroadcastState) => setState((current) =>
    !current || next.revision > current.revision ? next : current);

  useEffect(() => {
    const request = ++epoch.current;
    locked.current = true;
    setPending(true);
    setError('');
    const unsubscribe = subscribeBroadcast(accept, setConnection);
    void broadcastAdmin(apiKey, { action: 'state' }).then((data) => {
      if (epoch.current !== request) return;
      accept(data.state);
      if (data.state.revision >= metadataRevision.current) {
        metadataRevision.current = data.state.revision;
        setParticipants(data.participants);
        setTimingReady(data.timingReady === true);
        setRunReady(data.runReady === true);
        setSample(data);
      }
    }).catch((problem: unknown) => { if (epoch.current === request) setError(problem instanceof Error ? problem.message : String(problem)); }).finally(() => {
      if (epoch.current === request) { locked.current = false; setPending(false); }
    });
    return () => { ++epoch.current; unsubscribe(); };
  }, [apiKey, attempt]);

  useEffect(() => {
    if (!state || state.revision <= metadataRevision.current || pending) return;
    let cancelled = false;
    void broadcastAdmin(apiKey, { action: 'state' }).then((data) => {
      if (cancelled || data.state.revision < metadataRevision.current) return;
      metadataRevision.current = data.state.revision;
      setParticipants(data.participants);
      setTimingReady(data.timingReady === true);
      setRunReady(data.runReady === true);
      setSample(data);
      accept(data.state);
    }).catch((problem: unknown) => { if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem)); });
    return () => { cancelled = true; };
  }, [apiKey, state?.revision, pending]);

  async function run(action: BroadcastAction): Promise<boolean> {
    if (locked.current || error
      || (['start', 'stop', 'on-air'].includes(action.action) && !runReady)
      || (['start', 'on-air', 'clear'].includes(action.action) && state?.run_status === 'RUNNING')) return false;
    locked.current = true;
    setPending(true);
    const request = epoch.current;
    try {
      const data = await broadcastAdmin(apiKey, action);
      if (epoch.current !== request) return false;
      accept(data.state);
      if (data.state.revision >= metadataRevision.current) {
        metadataRevision.current = data.state.revision;
        setParticipants(data.participants);
        setTimingReady(data.timingReady === true);
        setRunReady(data.runReady === true);
        setSample(data);
      }
      return true;
    } catch (problem) {
      if (epoch.current === request) setError(problem instanceof Error ? problem.message : String(problem));
      return false;
    } finally {
      if (epoch.current === request) { locked.current = false; setPending(false); }
    }
  }

  function participantFor(row: RosterRow) {
    if (row.status !== 'confirmed') return undefined;
    const matches = participants.filter((one) => one.registrationId === row.id);
    return matches.length === 1 ? matches[0] : undefined;
  }

  async function saveTime(id: string, raceTimeMs: number | null) {
    if (locked.current || error || !timingReady || (state?.run_status === 'RUNNING' && state.current_participant_id === id)) return false;
    locked.current = true; setPending(true);
    const request = epoch.current;
    try {
      await saveParticipant(apiKey, id, { raceTimeMs });
      const data = await broadcastAdmin(apiKey, { action: 'state' });
      if (epoch.current !== request) return false;
      if (data.state.revision >= metadataRevision.current) {
        metadataRevision.current = data.state.revision;
        setParticipants(data.participants);
        setTimingReady(data.timingReady === true);
        setRunReady(data.runReady === true);
        setSample(data);
      }
      accept(data.state);
      return true;
    } finally {
      if (epoch.current === request) { locked.current = false; setPending(false); }
    }
  }

  return { state, connection, pending, error, portrait, setPortrait, run, participantFor, timingReady, runReady, sample, saveTime,
    disabled: pending || !!error || !state,
    refresh: () => { locked.current = true; setPending(true); setAttempt((value) => value + 1); } };
}

type Live = ReturnType<typeof useRosterLive>;
const button = 'min-h-[44px] rounded-full border border-border px-3 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-40';

export function RosterLiveSummary({ live, t, rows }: { live: Live; t: Translate; rows: RosterRow[] | null }) {
  const portraitEligible = live.portrait && rows?.some((row) => live.participantFor(row)?.id === live.portrait?.id);
  return <section className="mt-5 rounded-2xl border border-border bg-card p-4" aria-label={t('reg.liveTitle')} data-roster-live data-revision={live.state?.revision}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-bold">{t('reg.liveTitle')}</h3>
      <span role="status" className="text-xs" data-connection={live.connection.status}>
        {t(live.connection.status === 'live' ? 'live.connected' : live.connection.status === 'connecting' ? 'live.connecting' : 'live.disconnected')}
      </span>
    </div>
    {live.connection.code === 'REALTIME_NOT_CONFIGURED' && <p role="alert" className="mt-3 rounded-xl border border-yellow/30 bg-yellow/10 p-3 text-xs leading-relaxed">{t('live.realtimeMissing')} {t('live.realtimeSetup')}</p>}
    {live.state && <RunControl state={live.state} sample={live.sample} ready={live.runReady} disabled={live.disabled} t={t} run={live.run} />}
    {!live.pending && !live.timingReady && <p className="mt-2 text-xs">{t('vote.timingUnavailable')}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={button} disabled={live.pending} onClick={live.refresh}>{t('live.refresh')}</button>
      <a className={button} href={`/obs/overlay?preview=1&lang=${t('locale.intl').startsWith('pl') ? 'pl' : 'it'}`} target="_blank" rel="noreferrer">{t('live.preview')}</a>
    </div>
    {live.pending && <p role="status" className="mt-2 text-xs">{t('common.loading')}</p>}
    {live.error && <p role="alert" className="mt-2 text-sm text-destructive">{t(/RUN_/.test(live.error) ? 'run.failed' : 'live.failed')} <code>{live.error}</code> <button type="button" className={button} disabled={live.pending} onClick={live.refresh}>{t('common.retry')}</button></p>}
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t('reg.liveHelp')}</p>
    <div className="mt-2 flex flex-wrap gap-3 text-xs">
      <a href="/obs/participant" target="_blank" rel="noreferrer" className="underline">{t('live.participantSource')}: /obs/participant</a>
      <a href="/obs/replay" target="_blank" rel="noreferrer" className="underline">{t('live.replay')}: /obs/replay</a>
      <a href="/obs/sponsors" target="_blank" rel="noreferrer" className="underline">{t('live.sponsorsSource')}: /obs/sponsors</a>
    </div>
    <details className="mt-3 rounded-xl border border-border p-3 text-xs leading-relaxed">
      <summary className="cursor-pointer font-semibold">{t('reg.liveSetupTitle')}</summary>
      <ol className="mt-2 list-decimal space-y-2 pl-5">
        <li>{t('reg.liveSetupTest')}</li>
        <li>{t('reg.liveSetupObs')}</li>
        <li>{t('reg.liveSetupKey')}</li>
        <li>{t('reg.liveSetupUlanzi')}</li>
      </ol>
      <p className="mt-2 font-semibold">{t('reg.liveSetupWarning')}</p>
    </details>
    {live.portrait && <BroadcastPortrait participant={live.portrait} t={t} busy={live.disabled || !portraitEligible}
      onClose={() => live.setPortrait(null)} onSave={(image) => portraitEligible && live.portrait ? live.run({ action: 'participant-photo', id: live.portrait.id, image }) : Promise.resolve(false)} />}
  </section>;
}

export function RosterLiveActions({ live, row, t, onConfirm, confirming = false }: { live: Live; row: RosterRow; t: Translate; onConfirm?: () => void; confirming?: boolean }) {
  const participant = live.participantFor(row);
  const selected = participant && live.state?.participant?.id === participant.id;
  const running = live.state?.run_status === 'RUNNING';
  return <div className="mt-2 min-w-[190px] max-w-[240px]" data-roster-registration={row.id}>
    {row.status === 'new' && onConfirm && <button type="button" data-roster-confirm className={`${button} mb-2 border-primary/40 bg-primary/15 text-primary`} disabled={confirming || live.pending} onClick={onConfirm}>{t(confirming ? 'set.saving' : 'reg.confirmEntry')}</button>}
    <div className="flex flex-wrap gap-1.5">
      <button type="button" data-roster-activate className={`${button} bg-primary text-primary-foreground`} disabled={live.disabled || !participant || !live.runReady || running}
        onClick={() => participant && void live.run({ action: 'start', id: participant.id })}>{t(selected && running ? 'run.running' : 'live.onAir')}</button>
      {selected && <button type="button" className={button} disabled={live.disabled || !live.state?.participant_visible} onClick={() => void live.run({ action: 'hide' })}>{t('live.hide')}</button>}
      <button type="button" className={button} disabled={live.disabled || !participant} onClick={() => participant && live.setPortrait(participant)}>{t('live.photo')}</button>
    </div>
    {selected && running && <p className="mt-2 text-xs">{t('run.manualLocked')}</p>}
    {participant && <RaceTimeEditor key={participant.id} value={participant.raceTimeMs} timingReady={live.timingReady} disabled={live.disabled || (selected && running)} t={t}
      onSave={(raceTimeMs) => live.saveTime(participant.id, raceTimeMs)} />}
    {!participant && !live.pending && <p className="mt-1 text-[11px] text-muted-foreground">{t(row.status !== 'confirmed' ? 'reg.liveUnconfirmed' : 'reg.liveUnmapped')}</p>}
  </div>;
}
