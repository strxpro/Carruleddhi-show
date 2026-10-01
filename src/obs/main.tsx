import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ParticipantCard } from './ParticipantCard';
import { SponsorStream } from './SponsorStream';
import { subscribeBroadcast } from './live-client';
import type { BroadcastConnection, BroadcastState } from './types';
import './overlay.css';

function Overlay() {
  const [state, setState] = useState<BroadcastState | null>(null);
  const [connection, setConnection] = useState<BroadcastConnection>({ status: 'connecting' });
  const [scale, setScale] = useState(() => Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
  const diagnostics = new URLSearchParams(window.location.search).has('diagnostics');
  const module = document.documentElement.dataset.obsModule;
  useEffect(() => subscribeBroadcast(setState, setConnection), []);
  useEffect(() => {
    const resize = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return <main className="obs-stage" style={{ transform: `translate(-50%,-50%) scale(${scale})` }} data-connection={connection.status} data-revision={state?.revision ?? -1}>
    {state && <>
      {module !== 'sponsors' && <ParticipantCard participant={state.participant} visible={state.participant_visible} mode={module === 'replay' ? 'replay' : module === 'participant' ? 'live' : state.participant_mode} />}
      {module !== 'participant' && module !== 'replay' && <SponsorStream sponsors={state.sponsors} enabled={state.sponsors_enabled} />}
    </>}
    {diagnostics && <aside className="obs-diagnostics"><strong>{connection.status.toUpperCase()}</strong><span>1920 × 1080 · revision {state?.revision ?? '—'}</span><p>{connection.message || 'Safe area: 96px / 54px. No top logo; transparent camera area.'}</p></aside>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Overlay /></StrictMode>);
