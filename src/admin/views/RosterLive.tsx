import { useEffect, useRef, useState } from 'react';
import { broadcastAdmin, type BroadcastAdminParticipant, type RosterRow } from '../api';
import type { TranslateKey } from '../i18n';
import { subscribeBroadcast } from '../../obs/live-client';
import type { BroadcastConnection, BroadcastState } from '../../obs/types';
import { BroadcastPortrait } from './BroadcastPortrait';

type Translate = (key: TranslateKey) => string;
type RosterAction = { action: 'on-air'; id: string } | { action: 'hide' | 'clear' } | { action: 'participant-photo'; id: string; image: string };

export function useRosterLive(apiKey: string) {
  const [state, setState] = useState<BroadcastState | null>(null);
  const [participants, setParticipants] = useState<BroadcastAdminParticipant[]>([]);
  const [connection, setConnection] = useState<BroadcastConnection>({ status: 'connecting' });
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
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
    setError(false);
    const unsubscribe = subscribeBroadcast(accept, setConnection);
    void broadcastAdmin(apiKey, { action: 'state' }).then((data) => {
      if (epoch.current !== request) return;
      accept(data.state);
      if (data.state.revision >= metadataRevision.current) {
        metadataRevision.current = data.state.revision;
        setParticipants(data.participants);
      }
    }).catch(() => { if (epoch.current === request) setError(true); }).finally(() => {
      if (epoch.current === request) { locked.current = false; setPending(false); }
    });
    return () => { ++epoch.current; unsubscribe(); };
  }, [apiKey, attempt]);

  async function run(action: RosterAction): Promise<boolean> {
    if (locked.current || error) return false;
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
      }
      return true;
    } catch {
      if (epoch.current === request) setError(true);
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

  return { state, connection, pending, error, portrait, setPortrait, run, participantFor,
    disabled: pending || error || !state,
    refresh: () => { locked.current = true; setPending(true); setAttempt((value) => value + 1); } };
}

type Live = ReturnType<typeof useRosterLive>;
const button = 'rounded-full border border-border px-3 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-40';

export function RosterLiveSummary({ live, t, rows }: { live: Live; t: Translate; rows: RosterRow[] | null }) {
  const current = live.state?.participant;
  const currentRow = current && rows?.find((row) => live.participantFor(row)?.id === current.id);
  const portraitEligible = live.portrait && rows?.some((row) => live.participantFor(row)?.id === live.portrait?.id);
  return <section className="mt-5 rounded-2xl border border-border bg-card p-4" aria-label={t('reg.liveTitle')} data-roster-live data-revision={live.state?.revision}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-bold">{t('reg.liveTitle')}</h3>
      <span role="status" className="text-xs" data-connection={live.connection.status}>
        {t(live.connection.status === 'live' ? 'live.connected' : live.connection.status === 'connecting' ? 'live.connecting' : 'live.disconnected')}
      </span>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">{t('live.current')}</p>
    <p className="mt-1 font-semibold" data-roster-current>{current ? `#${current.startNumber} ${current.firstName} ${current.lastName}` : t('live.noSelection')}</p>
    {current && <p className="mt-1 text-xs font-bold">{t(live.state?.participant_visible ? 'reg.liveOnAir' : 'live.hidden')}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={button} data-roster-hide disabled={live.disabled || !current || !live.state?.participant_visible} onClick={() => void live.run({ action: 'hide' })}>{t('live.hide')}</button>
      <button type="button" className={button} data-roster-show disabled={live.disabled || !currentRow || live.state?.participant_visible} onClick={() => current && void live.run({ action: 'on-air', id: current.id })}>{t('reg.liveShow')}</button>
      <button type="button" className={button} data-roster-clear disabled={live.disabled || !current} onClick={() => void live.run({ action: 'clear' })}>{t('live.clear')}</button>
      <button type="button" className={button} disabled={live.pending} onClick={live.refresh}>{t('live.refresh')}</button>
      <a className={button} href="/obs/overlay" target="_blank" rel="noreferrer">{t('live.preview')}</a>
    </div>
    {live.pending && <p role="status" className="mt-2 text-xs">{t('common.loading')}</p>}
    {live.error && <p role="alert" className="mt-2 text-sm text-destructive">{t('live.failed')} <button type="button" className="underline" disabled={live.pending} onClick={live.refresh}>{t('common.retry')}</button></p>}
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t('reg.liveHelp')}</p>
    <div className="mt-2 flex flex-wrap gap-3 text-xs">
      <a href="/obs/participant" target="_blank" rel="noreferrer" className="underline">{t('live.participantSource')}: /obs/participant</a>
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

export function RosterLiveActions({ live, row, t }: { live: Live; row: RosterRow; t: Translate }) {
  const participant = live.participantFor(row);
  const selected = participant && live.state?.participant?.id === participant.id;
  const onAir = selected && live.state?.participant_visible;
  return <div className="mt-2 min-w-[190px] max-w-[240px]" data-roster-registration={row.id}>
    <div className="flex flex-wrap gap-1.5">
      <button type="button" data-roster-activate className={`${button} bg-primary text-primary-foreground`} disabled={live.disabled || !participant || onAir}
        onClick={() => participant && void live.run({ action: 'on-air', id: participant.id })}>{t(onAir ? 'reg.liveOnAir' : 'live.onAir')}</button>
      {selected && <button type="button" className={button} disabled={live.disabled || !onAir} onClick={() => void live.run({ action: 'hide' })}>{t('live.hide')}</button>}
      <button type="button" className={button} disabled={live.disabled || !participant} onClick={() => participant && live.setPortrait(participant)}>{t('live.photo')}</button>
    </div>
    {!participant && !live.pending && <p className="mt-1 text-[11px] text-muted-foreground">{t(row.status !== 'confirmed' ? 'reg.liveUnconfirmed' : 'reg.liveUnmapped')}</p>}
  </div>;
}
