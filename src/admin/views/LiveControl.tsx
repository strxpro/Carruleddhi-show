import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { broadcastAdmin, uploadSponsorLogo, type BroadcastAction, type BroadcastAdminResponse, type BroadcastSponsorEdit } from '../api';
import type { TranslateKey } from '../i18n';
import { subscribeBroadcast } from '../../obs/live-client';
import type { BroadcastConnection, BroadcastState, Participant } from '../../obs/types';
import { ActionButton } from './ActionButton';
import { BroadcastPortrait } from './BroadcastPortrait';
import { downscaleSponsorLogo } from './SettingsView';
import { formatRaceTime } from '../../lib/race-time';
import { RunControl } from './RunControl';

type SponsorDraft = Omit<BroadcastSponsorEdit, 'id'> & {
  id?: string;
  expectedSponsor?: Omit<BroadcastSponsorEdit, 'logoUrl'>;
};

export function LiveControl({ t, apiKey }: { t: (key: TranslateKey) => string; apiKey: string }) {
  const [state, setState] = useState<BroadcastState | null>(null);
  const [admin, setAdmin] = useState<BroadcastAdminResponse | null>(null);
  const [connection, setConnection] = useState<BroadcastConnection>({ status: 'connecting' });
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState<TranslateKey | null>(null);
  const [search, setSearch] = useState('');
  const [portrait, setPortrait] = useState<Participant | null>(null);
  const [draft, setDraft] = useState<SponsorDraft | null>(null);
  const [preview, setPreview] = useState(false);
  const [copyNote, setCopyNote] = useState<TranslateKey | null>(null);
  const alive = useRef(true);
  const overlaySources = [
    { path: '/obs/participant', label: t('live.participantSource') },
    { path: '/obs/replay', label: t('live.replay') },
    { path: '/obs/sponsors', label: t('live.sponsorsSource') },
  ];

  const accept = useCallback((next: BroadcastState) => {
    setState((current) => !current || next.revision >= current.revision ? next : current);
  }, []);
  const absorb = useCallback((next: BroadcastAdminResponse) => {
    accept(next.state);
    setAdmin((current) => !current || next.state.revision >= current.state.revision ? next : current);
  }, [accept]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNote(null);
    broadcastAdmin(apiKey, { action: 'state' }).then((next) => {
      if (cancelled) return;
      absorb(next); setError(''); setUncertain(false);
    }).catch((problem: unknown) => {
      if (cancelled) return;
      setError(problem instanceof Error ? problem.message : String(problem));
      setUncertain(true);
    }).finally(() => { if (!cancelled) setLoading(false); });
    const unsubscribe = subscribeBroadcast(accept, setConnection);
    return () => { cancelled = true; unsubscribe(); };
  }, [apiKey, reload, absorb, accept]);

  // Public realtime never supplies editable storage paths. Reconcile the protected DTO
  // only when a new revision arrives, preserving any sponsor draft being typed.
  useEffect(() => {
    if (!state || !admin || state.revision <= admin.state.revision || pending || loading) return;
    let cancelled = false;
    broadcastAdmin(apiKey, { action: 'state' }).then((next) => {
      if (!cancelled) absorb(next);
    }).catch((problem: unknown) => {
      if (cancelled) return;
      setError(problem instanceof Error ? problem.message : String(problem));
      setUncertain(true);
    });
    return () => { cancelled = true; };
  }, [state?.revision, admin?.state.revision, apiKey, absorb, pending, loading]);

  async function run(action: BroadcastAction, message: TranslateKey = 'live.saved'): Promise<boolean> {
    if (locked.current || loading || !admin || uncertain
      || (['start', 'stop', 'on-air'].includes(action.action) && !admin.runReady)
      || (['start', 'on-air', 'clear'].includes(action.action) && state?.run_status === 'RUNNING')) return false;
    locked.current = true;
    setPending(true); setError(''); setNote(null);
    try {
      const next = await broadcastAdmin(apiKey, action);
      if (alive.current) { absorb(next); setNote(message); }
      return true;
    } catch (problem) {
      if (alive.current) {
        setError(problem instanceof Error ? problem.message : String(problem));
        setUncertain(true);
      }
      return false;
    } finally {
      locked.current = false;
      if (alive.current) setPending(false);
    }
  }

  async function logo(file?: File) {
    if (!file || !draft || locked.current) return;
    locked.current = true;
    setPending(true); setError(''); setNote(null);
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
        throw new Error('BROADCAST_BAD_IMAGE');
      }
      const uploaded = await uploadSponsorLogo(apiKey, await downscaleSponsorLogo(file));
      if (!uploaded.ok || !uploaded.logo || !uploaded.url) throw new Error('BROADCAST_INVALID_RESPONSE');
      if (alive.current) {
        setDraft((current) => current ? { ...current, logo: uploaded.logo, logoUrl: uploaded.url } : current);
        setNote('live.logoReady');
      }
    } catch (problem) {
      if (alive.current) setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      locked.current = false;
      if (alive.current) setPending(false);
    }
  }

  const busy = loading || pending || !admin || uncertain;
  const reason = pending ? t('vote.whyBusy') : loading ? t('common.loading') : !admin || uncertain ? t('live.failed') : '';
  const current = state?.participant;
  const participants = admin?.participants ?? [];
  const needle = search.trim().toLocaleLowerCase();
  const filtered = participants.filter((one) =>
    `${one.startNumber} ${one.firstName} ${one.lastName} ${one.projectName} ${one.city}`.toLocaleLowerCase().includes(needle));
  const sponsors = [...(admin?.sponsors ?? [])].sort((a, b) => a.order - b.order);
  const realtimeMissing = admin?.realtime.ready === false;
  const errorKey: TranslateKey = /RUN_/.test(error) ? 'run.failed' : /CONFLICT/.test(error) ? 'live.sponsorConflict' : /MIGRATION|SCHEMA|ROW_MISSING|NOT_CONFIGURED|INVALID_RESPONSE/.test(error)
    ? 'live.migration' : /IMAGE|PHOTO/.test(error) ? 'set.uploadFailed' : 'live.failed';
  const validUrl = !draft?.url.trim() || /^https?:\/\/[^\s]+$/i.test(draft.url.trim());

  function moveSponsor(index: number, direction: number) {
    const ids = sponsors.map((one) => one.id);
    const moving = ids[index];
    const other = ids[index + direction];
    if (!moving || !other) return;
    ids[index] = other; ids[index + direction] = moving;
    void run({ action: 'sponsor-order', ids });
  }

  return <div className="admin-live">
    <header className="live-heading">
      <div><h2>{t('live.title')}</h2><p className="live-help">{t('live.lead')}</p></div>
      <button type="button" className="live-button" disabled={loading || pending} onClick={() => setReload((n) => n + 1)}>
        <RefreshCw size={16} aria-hidden="true" />{t('live.refresh')}
      </button>
    </header>

    <div className="live-connection" role="status">
      <span className={connection.status === 'live' && !realtimeMissing ? 'live-connected' : ''}>
        {t(connection.status === 'live' && !realtimeMissing ? 'live.connected' : connection.status === 'connecting' ? 'live.connecting' : 'live.disconnected')}
      </span>
      {state && <span>{t('live.revision')}: {state.revision} / {new Date(state.updated_at).toLocaleString(t('locale.intl'))}</span>}
    </div>
    {realtimeMissing && <p className="live-warning" role="alert">{t('live.realtimeMissing')} {t('live.realtimeSetup')}</p>}
    {admin && admin.timingReady !== true && <p className="live-warning">{t('vote.timingUnavailable')}</p>}
    {!!admin?.assetWarnings?.length && <div className="live-warning" role="alert">
      <p>{t('live.assetWarning')}</p>
      <ul>{admin.assetWarnings.map((warning) => <li key={warning.id}>{sponsors.find((one) => one.id === warning.id)?.name || warning.id} <code>{warning.code}</code></li>)}</ul>
    </div>}
    {connection.message && connection.status !== 'live' && <p className="live-help">{connection.message}</p>}
    {error && <p className="live-error" role="alert">{t(errorKey)} <code>{error}</code></p>}
    {note && <p className="live-success" role="status">{t(note)}</p>}
    {pending && <p className="live-help" role="status">{t('set.saving')}</p>}
    {loading && <p className="live-help" role="status">{t('common.loading')}</p>}

    {admin && state && <>
      <RunControl state={state} sample={admin} ready={admin.runReady === true} disabled={busy} t={t} run={run} />

      <section className="live-panel" aria-labelledby="live-participants-title">
        <h3 id="live-participants-title">{t('live.participants')} ({participants.length})</h3>
        <p className="live-help">{t('live.eligibleHint')}</p>
        <label className="live-field"><span>{t('live.search')}</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <ul className="live-list">
          {filtered.map((one) => <li key={one.id} className="live-list-row">
            <div className="live-rider live-rider-small">
              {one.photo && <img src={one.photo} className="live-rider-photo" alt="" loading="lazy" />}
              <span className="live-number">#{one.startNumber}</span>
              <div className="live-rider-details"><strong>{one.firstName} {one.lastName}</strong><span>{one.projectName}</span><span className="live-help">{[one.city, one.category].filter(Boolean).join(' / ')}</span>
                {!(state.run_status === 'RUNNING' && current?.id === one.id) && formatRaceTime(one.raceTimeMs) && <span>{t('vote.raceTime')}: {formatRaceTime(one.raceTimeMs)}</span>}
              </div>
            </div>
            <div className="live-actions">
              <button type="button" className="live-button" disabled={busy} aria-label={`${t('live.photo')}: ${one.firstName} ${one.lastName}`} onClick={() => setPortrait(one)}>{t('live.photo')}</button>
              <button type="button" className="live-button live-button-primary" data-live-start={one.id} disabled={busy || !admin.runReady || state.run_status === 'RUNNING'}
                aria-label={`${t('live.onAir')}: #${one.startNumber} ${one.firstName} ${one.lastName}`} aria-pressed={current?.id === one.id && state.run_status === 'RUNNING'}
                onClick={() => void run({ action: 'start', id: one.id })}>{t(current?.id === one.id && state.run_status === 'RUNNING' ? 'run.running' : 'live.onAir')}</button>
            </div>
          </li>)}
        </ul>
        {!filtered.length && <p className="live-help">{t(participants.length ? 'live.noResults' : 'live.empty')}</p>}
      </section>

      {portrait && <BroadcastPortrait key={portrait.id} participant={portrait} t={t} busy={busy}
        onSave={(image) => run({ action: 'participant-photo', id: portrait.id, image }, 'live.photoSaved')} onClose={() => setPortrait(null)} />}

      <section className="live-panel" aria-labelledby="live-sponsors-title">
        <div className="live-heading"><h3 id="live-sponsors-title">{t('set.sponsors')} ({sponsors.length})</h3>
          <button type="button" className={`live-button ${state.sponsors_enabled ? 'live-button-primary' : ''}`} role="switch" aria-checked={state.sponsors_enabled}
            aria-label={t('set.sponsors')} disabled={busy} onClick={() => void run({ action: 'sponsors-toggle', enabled: !state.sponsors_enabled })}>
            {t(state.sponsors_enabled ? 'live.sponsorsOn' : 'live.sponsorsOff')}
          </button>
        </div>
        <p className="live-help">{t('live.sponsorsToggleHint')}</p><p className="live-help">{t('live.sponsorsHint')}</p>
        {(!sponsors.some(s => s.active) || !state.sponsors_enabled) && <p className="live-warning" role="status" data-sponsor-empty-guide>{t(!sponsors.length ? 'live.sponsorSetupEmpty' : !sponsors.some(s => s.active) ? 'live.sponsorSetupInactive' : 'live.sponsorSetupOff')}</p>}
        <ul className="live-list">
          {sponsors.map((one, index) => <li key={one.id} className="live-list-row">
            <div className="live-sponsor-identity">
              {one.logoUrl ? <img src={one.logoUrl} alt="" className="live-logo" /> : <span className="live-logo live-placeholder">{t('set.sponsorNoLogo')}</span>}
              <div><strong>{one.name}</strong><p className="live-help">{one.tier} / {t('live.active')}: {t(one.active ? 'common.yes' : 'common.no')} / #{index + 1}</p></div>
            </div>
            <div className="live-actions">
              <button type="button" className="live-button" disabled={busy || !!draft} aria-label={`${t('live.edit')}: ${one.name}`} onClick={() => {
                const { logoUrl: _preview, ...expectedSponsor } = one;
                setDraft({ ...one, expectedSponsor }); setNote(null);
              }}>{t('live.edit')}</button>
              <button type="button" className="live-button live-icon-button" disabled={busy || index === 0} aria-label={`${t('set.sponsorUp')}: ${one.name}`} onClick={() => moveSponsor(index, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
              <button type="button" className="live-button live-icon-button" disabled={busy || index === sponsors.length - 1} aria-label={`${t('set.sponsorDown')}: ${one.name}`} onClick={() => moveSponsor(index, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
              <ActionButton label={`${t('set.sponsorRemove')}: ${one.name}`} reason={reason || (draft?.id === one.id ? t('set.dirty') : '')}
                tone="bg-destructive/15 text-destructive hover:bg-destructive/25" confirmLabel={t('live.deleteConfirm')}
                onPress={() => void run({ action: 'sponsor-delete', id: one.id })} />
            </div>
          </li>)}
        </ul>
        {!sponsors.length && <p className="live-help">{t('set.sponsorsEmpty')}</p>}
        {!draft && <button type="button" className="live-button" disabled={busy || sponsors.length >= 30} onClick={() => {
          setDraft({ name: '', logo: '', logoUrl: '', url: '', active: true, order: sponsors.length, tier: 'partner' }); setNote(null);
        }}>{t('set.sponsorAdd')}</button>}
        {sponsors.length >= 30 && <p className="live-help">{t('set.leadListFull')}</p>}

        {draft && <form className="live-editor" onSubmit={async (event) => {
          event.preventDefault();
          if (!validUrl || !draft.name.trim()) return;
          // Order controls own ordering. Do not restore an old position when saving text.
          const order = sponsors.find((one) => one.id === draft.id)?.order ?? sponsors.length;
          if (await run({ action: 'sponsor-save', ...(draft.expectedSponsor ? { expectedSponsor: draft.expectedSponsor } : {}), sponsor: {
            ...(draft.id ? { id: draft.id } : {}), name: draft.name.trim(), url: draft.url.trim(),
            logo: draft.logo, active: draft.active, tier: draft.tier.trim(), order,
          } })) setDraft(null);
        }}>
          <h4>{t(draft.id ? 'live.edit' : 'set.sponsorAdd')}</h4>
          <fieldset disabled={busy}>
            <div className="live-form-grid">
              <label className="live-field"><span>{t('set.sponsorName')}</span><input autoFocus required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <label className="live-field"><span>{t('set.sponsorUrl')}</span><input type="url" maxLength={2048} placeholder="https://" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></label>
              <label className="live-field"><span>{t('live.tier')}</span><input required maxLength={40} value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value })} /></label>
              <label className="live-checkbox"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /><span>{t('live.active')}</span></label>
              <label className="live-field"><span>{t('set.sponsorLogo')} (JPG, PNG, WebP; max. 10 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { void logo(e.target.files?.[0]); e.target.value = ''; }} /></label>
              {draft.logoUrl && <img src={draft.logoUrl} alt={draft.name || t('set.sponsorLogo')} className="live-logo" />}
            </div>
            {!validUrl && <p className="live-error">{t('live.invalidUrl')}</p>}
            <p className="live-help">{t('set.dirty')}</p>
          </fieldset>
          <div className="live-actions"><button type="submit" className="live-button live-button-primary" disabled={busy || !draft.name.trim() || !draft.tier.trim() || !validUrl}>{t('set.save')}</button>
            <button type="button" className="live-button" disabled={pending} onClick={() => setDraft(null)}>{t('live.cancel')}</button></div>
        </form>}
      </section>
    </>}

    <section className="live-panel" aria-labelledby="live-overlay-title">
      <h3 id="live-overlay-title">{t('live.overlay')}</h3><p className="live-help">{t('live.overlayHint')}</p>
      {overlaySources.map((source) => <div key={source.path}>
        <label className="live-field"><span>{source.label} / 1920 x 1080</span><input readOnly value={`${window.location.origin}${source.path}`} onFocus={(e) => e.target.select()} /></label>
        <div className="live-actions">
          <button type="button" className="live-button" aria-label={`${t('live.copy')}: ${source.label}`} onClick={async () => {
            try { await navigator.clipboard.writeText(`${window.location.origin}${source.path}`); setCopyNote('live.copied'); }
            catch { setCopyNote('live.copyFailed'); }
          }}><Copy size={16} aria-hidden="true" />{t('live.copy')}</button>
          <a className="live-button" href={`${source.path}?preview=1&lang=${t('locale.intl').startsWith('pl') ? 'pl' : 'it'}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />{t('live.preview')}</a>
        </div>
      </div>)}
      <p className="live-help">{t('live.obsVisibilityHint')}</p>
      <div className="live-actions">
        <button type="button" className="live-button" aria-expanded={preview} aria-controls="live-overlay-preview" onClick={() => setPreview(!preview)}>{t(preview ? 'live.previewHide' : 'live.previewShow')}</button>
      </div>
      {copyNote && <p className="live-help" role="status">{t(copyNote)}</p>}
      <p className="live-help">{t('live.previewHint')}</p>
      {preview && <div id="live-overlay-preview" className="live-preview"><iframe src={`/obs/overlay?preview=1&lang=${t('locale.intl').startsWith('pl') ? 'pl' : 'it'}`} title={t('live.preview')} /></div>}
    </section>
  </div>;
}
