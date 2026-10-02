import { useEffect, useState } from 'react';
import type { BroadcastAction, BroadcastAdminResponse } from '../api';
import type { TranslateKey } from '../i18n';
import type { BroadcastState } from '../../obs/types';
import { formatRaceTime } from '../../lib/race-time';

export type RunClockSample = Pick<BroadcastAdminResponse, 'serverNow' | 'receivedAt'>;

/** Rendering only: STOP never receives a duration calculated in this browser. */
function useRunElapsed(state: BroadcastState, sample: RunClockSample) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (state.run_status !== 'RUNNING') return;
    const timer = window.setInterval(() => setNow(performance.now()), 50);
    return () => window.clearInterval(timer);
  }, [state.run_status]);
  if (state.run_status === 'FINISHED') return state.elapsed_ms ?? null;
  if (state.run_status === 'IDLE') return 0;
  if (state.run_status !== 'RUNNING' || !sample.serverNow || sample.receivedAt === undefined || !state.started_at) return null;
  const elapsed = Date.parse(sample.serverNow) - Date.parse(state.started_at)
    + Math.max(0, now - sample.receivedAt);
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(2147483647, Math.floor(elapsed))) : null;
}

export function RunControl({ state, sample, ready, disabled, t, run }: {
  state: BroadcastState;
  sample: RunClockSample;
  ready: boolean;
  disabled: boolean;
  t: (key: TranslateKey) => string;
  run: (action: BroadcastAction) => Promise<boolean>;
}) {
  const elapsed = useRunElapsed(state, sample);
  const current = state.participant;
  const last = state.last_finished_participant;
  const running = state.run_status === 'RUNNING';
  const identity = (person: NonNullable<typeof current>) => `#${person.startNumber} ${person.firstName} ${person.lastName}`;
  return <section className="admin-run-control" aria-label={t('run.title')} data-run-control data-run-status={state.run_status ?? 'UNAVAILABLE'}>
    {!ready && <p className="live-warning" role="alert" data-run-unavailable>{t('run.unavailable')} <code>RUN_MIGRATION_REQUIRED</code></p>}
    <div className="admin-run-grid">
      <div className="admin-run-current">
        <div className="live-heading"><h3>{t('live.current')}</h3>
          <span className={`live-badge ${running ? 'live-on-air' : ''}`}>{t(running ? 'run.running' : state.run_status === 'FINISHED' ? 'run.finished' : 'run.idle')}</span>
        </div>
        <p className="admin-run-identity" data-run-current>{current ? identity(current) : t('live.noSelection')}</p>
        {current && <p className="live-help">{current.projectName}</p>}
        <p className="admin-run-clock" data-run-elapsed aria-label={t('run.elapsed')}>{ready && elapsed !== null ? formatRaceTime(elapsed) : '--:--.---'}</p>
        <div className="admin-run-primary-actions">
          <button type="button" className="live-button live-button-primary" data-run-start disabled={disabled || !ready || !current || running}
            onClick={() => current && void run({ action: 'start', id: current.id })}>{t('live.onAir')}</button>
          <button type="button" className="live-button admin-run-stop" data-run-stop disabled={disabled || !ready || !running || !state.run_id}
            onClick={() => state.run_id && void run({ action: 'stop', runId: state.run_id })}>{t('run.stop')}</button>
        </div>
        <div className="live-actions">
          <button type="button" className="live-button" data-run-show disabled={disabled || !current || state.participant_visible}
            onClick={() => void run({ action: 'show' })}>{t('reg.liveShow')}</button>
          <button type="button" className="live-button" data-run-hide disabled={disabled || !current || !state.participant_visible}
            onClick={() => void run({ action: 'hide' })}>{t('live.hide')}</button>
          <span className="live-badge">{t(state.participant_visible ? 'reg.liveOnAir' : 'live.hidden')}</span>
        </div>
      </div>
      <div className="admin-run-last" data-run-last>
        <h3>{t('run.lastFinished')}</h3>
        <p className="admin-run-identity">{last ? identity(last) : t('run.noFinished')}</p>
        {last && <p className="live-help">{last.projectName}</p>}
        <p className="admin-run-clock" data-run-final>{last && state.last_finished_elapsed_ms != null ? formatRaceTime(state.last_finished_elapsed_ms) : '--:--.---'}</p>
        <p className="live-help">{t('run.frozenHint')}</p>
        {last && <a className="live-button" data-run-replay href={`/obs/replay?preview=1&lang=${t('locale.intl').startsWith('pl') ? 'pl' : 'it'}`} target="_blank" rel="noopener noreferrer">{t('live.replay')}</a>}
      </div>
    </div>
    <p className="live-help admin-run-hint">{t('live.controlsHint')}</p>
  </section>;
}
