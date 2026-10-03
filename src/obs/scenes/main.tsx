import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { SponsorStream } from '../SponsorStream';
import { subscribeBroadcast } from '../live-client';
import type { BroadcastState } from '../types';
import { CAMERA, SCENES, SITE_LABEL, VOTE_URL, type SceneId } from './presets';
import { refreshSceneEvent, subscribeSceneEvent, type SceneEventData } from './event-data';
import { ShowSequence } from './ShowSequence';
import { RaceResults } from './RaceResults';
import '../overlay.css';
import './scenes.css';

const messages = {
  it: [ ['IL TUO VOTO CONTA', 'Scansiona il QR e scopri i protagonisti.'], ['DAL TELEFONO AL PODIO', 'Apri la pagina del voto e partecipa.'], ['SCEGLI IL TUO PREFERITO', 'Una strada, tante storie. Fai sentire la tua voce.'] ],
  pl: [ ['TWÓJ GŁOS SIĘ LICZY', 'Zeskanuj QR i poznaj uczestników.'], ['Z TELEFONU NA PODIUM', 'Otwórz stronę głosowania i weź udział.'], ['WYBIERZ FAWORYTA', 'Jedna trasa, wiele historii. Oddaj swój głos.'] ],
};

function BroadcastScene() {
  const raw = document.documentElement.dataset.obsScene || 'break';
  const id: SceneId = Object.hasOwn(SCENES, raw) ? raw as SceneId : 'break';
  const preset = SCENES[id];
  const query = new URLSearchParams(location.search);
  const language = query.get('lang') === 'pl' ? 'pl' : 'it';
  const l = language === 'pl' ? 1 : 0;
  const videoScene = id === 'starting' || id === 'intro';
  const resultsScene = id === 'results';
  const camera = !videoScene && !resultsScene && query.get('camera') !== '0';
  const qr = query.get('qr') !== '0';
  const sponsors = !videoScene && query.get('sponsors') !== '0';
  const solid = !videoScene && query.get('background') === 'solid' && (!resultsScene || query.get('camera') === '0');
  const guides = query.has('guides');
  const reduced = useReducedMotion();
  const [broadcast, setBroadcast] = useState<BroadcastState | null>(null);
  const [event, setEvent] = useState<SceneEventData | null>(null);
  const [message, setMessage] = useState(0);
  const [scale, setScale] = useState(() => Math.min(innerWidth / 1920, innerHeight / 1080));
  const [active, setActive] = useState(() => document.visibilityState === 'visible');

  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => {
    const visibility = () => setActive(document.visibilityState === 'visible');
    const obsVisibility = (event: Event) => {
      const visible = (event as CustomEvent<{ visible?: boolean }>).detail?.visible;
      if (typeof visible === 'boolean') setActive(visible);
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('obsSourceVisibleChanged', obsVisibility);
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('obsSourceVisibleChanged', obsVisibility); };
  }, []);

  useEffect(() => {
    const resize = () => setScale(Math.min(innerWidth / 1920, innerHeight / 1080));
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);
  useEffect(() => sponsors || resultsScene ? subscribeBroadcast(setBroadcast) : undefined, [sponsors, resultsScene]);
  useEffect(() => videoScene ? undefined : subscribeSceneEvent(setEvent, undefined, { voting: id === 'results' || id === 'voting' }), [id, videoScene]);
  useEffect(() => {
    if (resultsScene && broadcast?.run_status === 'FINISHED' && broadcast.last_finished_participant_id) refreshSceneEvent();
  }, [resultsScene, broadcast?.run_status, broadcast?.last_finished_participant_id, broadcast?.last_finished_elapsed_ms, broadcast?.stopped_at]);
  useEffect(() => {
    if (!qr || reduced) return;
    const timer = setInterval(() => setMessage(value => (value + 1) % 3), 12000);
    return () => clearInterval(timer);
  }, [qr, reduced]);
  const closed = event?.phase === 'closed';
  const results = closed ? event.results.slice(0, 3) : [];
  const title = id === 'voting' && closed ? (l ? ['DZIĘKUJEMY', 'ZA GŁOSY!'] : ['GRAZIE', 'PER I VOTI!']) : preset.title[l];
  const description = id === 'voting' && closed ? (l ? 'Głosowanie zostało zakończone. Dziękujemy za każdy oddany głos.' : 'La votazione è conclusa. Grazie per ogni voto e per tutto il vostro entusiasmo.') : preset.description[l];
  const cue = closed ? (results.length ? (l ? ['WYNIKI SĄ GOTOWE', 'Zeskanuj QR i zobacz pełną klasyfikację.'] : ['IL PODIO È PRONTO', 'Scansiona il QR per la classifica completa.']) : (l ? ['GŁOSOWANIE ZAKOŃCZONE', 'Szczegóły wydarzenia znajdziesz po zeskanowaniu QR.'] : ['VOTAZIONE CONCLUSA', 'Scansiona il QR per la pagina della manifestazione.'])) : messages[language][message]!;
  const motionTransition = { duration: reduced ? 0 : .65, ease: [.22, 1, .36, 1] as [number, number, number, number] };

  return <main className={`obs-stage broadcast-scene scene-${preset.theme}${reduced ? ' scene-reduced' : ''}${videoScene ? ' scene-video' : ''}${resultsScene ? ' scene-results-full' : ''}`} data-scene={id}
    style={{ transform: `translate(-50%,-50%) scale(${scale})` }}>
    {solid && <svg className="scene-backdrop" viewBox="0 0 1920 1080" aria-hidden="true"><path fillRule="evenodd" d={`M0 0H1920V1080H0Z${camera ? ` M${CAMERA.x} ${CAMERA.y}V${CAMERA.y + CAMERA.height}H${CAMERA.x + CAMERA.width}V${CAMERA.y}Z` : ''}`} /></svg>}
    {videoScene && <ShowSequence mode={id} language={language} guides={guides} />}
    {resultsScene && <RaceResults participants={event?.raceResults ?? []} active={active} language={language} />}
    {!videoScene && !resultsScene && <motion.section className="scene-poster" initial={{ opacity: 0, y: reduced ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} transition={motionTransition}>
      <div className="scene-orbit" aria-hidden="true"><i /><i /><i /></div>
      <div className="scene-poster-content">
        <div className="scene-kicker"><i aria-hidden="true" />{preset.kicker[l]}</div>
        <h1 className={`scene-title${title.some(line => line.length >= 10) ? ' scene-title-long' : ''}`}>
          {title.map((line, index) => <motion.span key={line} initial={{ y: reduced ? 0 : 22, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...motionTransition, delay: reduced ? 0 : .12 + index * .09 }}>{line}</motion.span>)}
        </h1>
        <p className="scene-description">{description}</p>
        {id === 'voting' && <div className="scene-vote-status" data-vote-phase={event?.phase || 'unknown'}>
          {event?.phase === 'voting' ? (l ? 'GŁOSOWANIE OTWARTE' : 'VOTAZIONE APERTA') : closed ? (l ? 'GŁOSOWANIE ZAKOŃCZONE' : 'VOTAZIONE CONCLUSA') : (l ? 'POZNAJ UCZESTNIKÓW' : 'SCOPRI I PARTECIPANTI')}
        </div>}
        <div className="scene-poster-footer"><span>{preset.footnote[l]}</span><div className="scene-road" aria-hidden="true"><i /><i /><i /></div></div>
      </div>
    </motion.section>}
    {camera && <div className={`scene-camera${guides ? ' scene-camera-guides' : ''}`} data-camera-window
      style={{ left: CAMERA.x, top: CAMERA.y, width: CAMERA.width, height: CAMERA.height }}>
      <i /><i /><i /><i /><span className="scene-camera-label">{guides ? 'CAMERA · X 544 / Y 80 · 1280 × 720' : l ? 'OBRAZ Z TRASY' : 'DAL PERCORSO'}</span>
    </div>}
    {!videoScene && <div className="scene-event-line"><span>{event?.eventLocation || 'Santa Teresa Gallura'}</span><i />{l ? 'EDYCJA' : 'EDIZIONE'} {event?.eventYear || new Date().getFullYear()}</div>}
    {qr && <>
      <section className="scene-vote-cue" aria-live="off">
        <AnimatePresence mode="wait"><motion.div key={cue[0]} initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -12 }} transition={{ duration: reduced ? 0 : .38, ease: [.22, 1, .36, 1] }}>
          <strong>{cue[0]}</strong><p>{cue[1]}</p>
        </motion.div></AnimatePresence>
      </section>
      <div className="scene-qr" data-vote-qr data-target={VOTE_URL}>
        <QRCodeSVG value={VOTE_URL} size={184} level="M" marginSize={4} fgColor="#071a3d" bgColor="#ffffff" title={l ? 'Strona głosowania Carruleddhi Show' : 'Pagina di votazione Carruleddhi Show'} />
        <span className="scene-site-label">{SITE_LABEL}</span>
      </div>
    </>}
    {sponsors && broadcast && <SponsorStream sponsors={broadcast.sponsors} enabled={broadcast.sponsors_enabled} />}
    {guides && <aside className="scene-guides-note">{videoScene ? (l ? 'PODGLĄD WIDEO · Automatyczne przełączenia wymagają OBS i uprawnień Advanced' : 'ANTEPRIMA VIDEO · I cambi automatici richiedono OBS e permessi Advanced') : resultsScene ? (l ? 'RESULTS · Kamera X=0 Y=0 / 1920 × 1080 · Usuń guides=1 przed emisją' : 'RESULTS · Camera X=0 Y=0 / 1920 × 1080 · Rimuovi guides=1 prima della diretta') : (l ? 'PODGLĄD USTAWIENIA KAMERY · Usuń ?guides=1 przed emisją' : 'ANTEPRIMA POSIZIONE CAMERA · Rimuovi ?guides=1 prima della diretta')}</aside>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><BroadcastScene /></StrictMode>);
