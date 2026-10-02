import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { SponsorStream } from '../SponsorStream';
import { subscribeBroadcast } from '../live-client';
import type { BroadcastState } from '../types';
import { CAMERA, SCENES, VOTE_URL, type SceneId } from './presets';
import { subscribeSceneEvent, type SceneEventData } from './event-data';
import { formatRaceTime } from '../../../assets/js/race-time.js';
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
  const camera = query.get('camera') !== '0';
  const qr = query.get('qr') !== '0';
  const sponsors = query.get('sponsors') !== '0';
  const solid = query.get('background') === 'solid';
  const guides = query.has('guides');
  const reduced = useReducedMotion();
  const [broadcast, setBroadcast] = useState<BroadcastState | null>(null);
  const [event, setEvent] = useState<SceneEventData | null>(null);
  const [message, setMessage] = useState(0);
  const [scale, setScale] = useState(() => Math.min(innerWidth / 1920, innerHeight / 1080));

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  useEffect(() => {
    const resize = () => setScale(Math.min(innerWidth / 1920, innerHeight / 1080));
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);
  useEffect(() => sponsors ? subscribeBroadcast(setBroadcast) : undefined, [sponsors]);
  useEffect(() => subscribeSceneEvent(setEvent, undefined, { voting: id === 'results' || id === 'voting' }), [id]);
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
  const compactResults = results.reduce((sum, result) => sum + result.firstName.length + result.lastName.length, 0) > 120;
  const motionTransition = { duration: reduced ? 0 : .65, ease: [.22, 1, .36, 1] as [number, number, number, number] };

  return <main className={`obs-stage broadcast-scene scene-${preset.theme}${reduced ? ' scene-reduced' : ''}`} data-scene={id}
    style={{ transform: `translate(-50%,-50%) scale(${scale})` }}>
    {solid && <svg className="scene-backdrop" viewBox="0 0 1920 1080" aria-hidden="true"><path fillRule="evenodd" d={`M0 0H1920V1080H0Z${camera ? ` M${CAMERA.x} ${CAMERA.y}V${CAMERA.y + CAMERA.height}H${CAMERA.x + CAMERA.width}V${CAMERA.y}Z` : ''}`} /></svg>}
    <motion.section className={`scene-poster${id === 'results' ? ' scene-poster-results' : ''}${compactResults ? ' scene-poster-compact' : ''}`} initial={{ opacity: 0, y: reduced ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} transition={motionTransition}>
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
        {id === 'results' && <div className="scene-results" data-results-phase={event?.phase || 'unknown'}>
          {results.length ? results.map((result, index) => <div className="scene-result" key={result.id}>
            <span className="scene-result-place">{result.position ?? index + 1}</span>
            <div><strong className={(result.firstName + result.lastName).length > 35 ? 'scene-result-long' : ''}>{result.firstName} {result.lastName}</strong>
              <span className="scene-result-points">{result.totalScore} {l ? 'PKT' : 'PUNTI'}{result.raceTimeMs != null && <small> · {formatRaceTime(result.raceTimeMs)}</small>}</span>
            </div>
          </div>) : <p className="scene-results-wait">{closed ? (l ? 'Brak opublikowanych wyników.' : 'Nessun risultato pubblicato.') : (l ? 'Wyniki pojawią się tutaj po zakończeniu głosowania.' : 'La classifica sarà visibile al termine della votazione.')}</p>}
        </div>}
        <div className="scene-poster-footer"><span>{preset.footnote[l]}</span><div className="scene-road" aria-hidden="true"><i /><i /><i /></div></div>
      </div>
    </motion.section>
    {camera && <div className={`scene-camera${guides ? ' scene-camera-guides' : ''}`} data-camera-window
      style={{ left: CAMERA.x, top: CAMERA.y, width: CAMERA.width, height: CAMERA.height }}>
      <i /><i /><i /><i /><span className="scene-camera-label">{guides ? 'CAMERA · X 544 / Y 80 · 1280 × 720' : l ? 'OBRAZ Z TRASY' : 'DAL PERCORSO'}</span>
    </div>}
    <div className="scene-event-line"><span>{event?.eventLocation || 'Santa Teresa Gallura'}</span><i />{l ? 'EDYCJA' : 'EDIZIONE'} {event?.eventYear || new Date().getFullYear()}</div>
    {qr && <>
      <section className="scene-vote-cue" aria-live="off">
        <AnimatePresence mode="wait"><motion.div key={cue[0]} initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -12 }} transition={{ duration: reduced ? 0 : .38, ease: [.22, 1, .36, 1] }}>
          <strong>{cue[0]}</strong><p>{cue[1]}</p>
        </motion.div></AnimatePresence>
      </section>
      <div className="scene-qr" data-vote-qr data-target={VOTE_URL}>
        <QRCodeSVG value={VOTE_URL} size={184} level="M" marginSize={4} fgColor="#071a3d" bgColor="#ffffff" title={l ? 'Strona głosowania Carruleddhi Show' : 'Pagina di votazione Carruleddhi Show'} />
        <span>{l ? 'ZESKANUJ I WEJDŹ' : 'SCANSIONA E PARTECIPA'}</span>
      </div>
    </>}
    {sponsors && broadcast && <SponsorStream sponsors={broadcast.sponsors} enabled={broadcast.sponsors_enabled} />}
    {guides && <aside className="scene-guides-note">{l ? 'PODGLĄD USTAWIENIA KAMERY · Usuń ?guides=1 przed emisją' : 'ANTEPRIMA POSIZIONE CAMERA · Rimuovi ?guides=1 prima della diretta'}</aside>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><BroadcastScene /></StrictMode>);
