import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ParticipantCard } from './ParticipantCard';
import { SponsorStream } from './SponsorStream';
import { subscribeBroadcast } from './live-client';
import { PreviewStatus } from './PreviewStatus';
import { replayParticipant } from './replay-state';
import type { BroadcastConnection, BroadcastState } from './types';
import './overlay.css';

function Overlay() {
  const [state, setState] = useState<BroadcastState | null>(null);
  const [connection, setConnection] = useState<BroadcastConnection>({ status: 'connecting' });
  const [scale, setScale] = useState(() => Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
  const diagnostics = new URLSearchParams(window.location.search).has('diagnostics');
  const preview = new URLSearchParams(window.location.search).has('preview');
  const module = document.documentElement.dataset.obsModule;
  const person = state ? (module === 'replay' ? replayParticipant(state) : state.participant) : null;
  useEffect(() => subscribeBroadcast(setState, setConnection), []);
  useEffect(() => {
    const resize = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return <>
    {preview && <div className="obs-preview-backdrop" aria-hidden="true" />}
    <main className="obs-stage" style={{ transform: `translate(-50%,-50%) scale(${scale})` }} data-connection={connection.status} data-revision={state?.revision ?? -1}>
    {state && <>
      {module !== 'sponsors' && <ParticipantCard participant={person} visible={module === 'replay' ? !!person : state.participant_visible} mode={module === 'replay' ? 'replay' : 'live'} />}
      {module !== 'participant' && module !== 'replay' && <SponsorStream sponsors={state.sponsors} enabled={state.sponsors_enabled} />}
    </>}
    {diagnostics && <aside className="obs-diagnostics"><strong>{connection.status.toUpperCase()}</strong><span>1920 × 1080 · revision {state?.revision ?? '—'}</span><p>{connection.message || 'Safe area: 96px / 54px. No top logo; transparent camera area.'}</p></aside>}
    </main>
    {preview && <PreviewStatus state={state} connection={connection} module={module} />}
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Overlay /></StrictMode>);
