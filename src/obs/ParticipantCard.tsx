import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Participant } from './types';
import './portrait-mask.css';
import { formatRaceTime } from '../../assets/js/race-time.js';

export function ParticipantCard({ participant, visible, mode = 'live' }: { participant: Participant | null; visible: boolean; mode?: 'live' | 'replay' }) {
  const [ready, setReady] = useState<Participant | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    let cancelled = false;
    if (!participant || !visible) { setReady(null); return; }
    const image = new Image();
    const complete = () => { if (!cancelled) setReady(participant); };
    const timeout = setTimeout(complete, 1800);
    if (participant.photo) {
      image.onload = complete;
      image.onerror = complete;
      image.src = participant.photo;
    } else complete();
    return () => { cancelled = true; clearTimeout(timeout); image.onload = null; image.onerror = null; };
  }, [participant, visible]);

  return <div className="obs-participant-anchor">
    <AnimatePresence mode="wait">
      {ready && <motion.article key={ready.id} className={`obs-participant${mode === 'replay' ? ' obs-participant-replay' : ''}`} aria-label={`${ready.startNumber}. ${ready.firstName} ${ready.lastName}`}
        initial={{ opacity: 0, x: reduced ? 0 : 38, clipPath: reduced ? 'inset(0 0 0 0)' : 'inset(0 0 0 100%)' }}
        animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0% 0 0)' }}
        exit={{ opacity: 0, x: reduced ? 0 : 24, clipPath: reduced ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)' }}
        transition={{ duration: reduced ? 0 : mode === 'replay' ? .48 : .42, ease: [.22, 1, .36, 1] }}>
        <div className="obs-card-back" />
        <div className="obs-photo-frame"><Portrait participant={ready} /></div>
        <div className="obs-eyebrow"><span className="obs-on-track">{mode === 'replay' ? 'REPLAY' : 'IN PISTA'}</span>{ready.category && <span>{ready.category}</span>}</div>
        <motion.div className="obs-race-number" initial={{ y: reduced ? 0 : 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }} transition={{ duration: reduced ? 0 : .3, delay: reduced ? 0 : .1, ease: [.22, 1, .36, 1] }}>
          <span>N°</span><strong style={{ fontSize: String(ready.startNumber).length > 3 ? 20 : String(ready.startNumber).length > 2 ? 27 : undefined }}>{ready.startNumber}</strong>
        </motion.div>
        <motion.div className="obs-participant-copy" initial={{ opacity: 0, y: reduced ? 0 : 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : .32, delay: reduced ? 0 : .15 }}>
          <div className="obs-first-name">{ready.lastName ? ready.firstName : ''}</div>
          <ParticipantName name={ready.lastName || ready.firstName} />
          <div className="obs-participant-meta">
            {ready.city && <span className="obs-city"><svg viewBox="0 0 18 20" aria-hidden="true"><path d="M9 19S2 12 2 7a7 7 0 0 1 14 0c0 5-7 12-7 12Z" /><circle cx="9" cy="7" r="2.2" /></svg>{ready.city}</span>}
            {ready.projectName && <span className="obs-project">{ready.projectName}</span>}
          </div>
        </motion.div>
        {mode === 'replay' && formatRaceTime(ready.raceTimeMs) && <div className="obs-race-time"><span>TEMPO<br />FINALE</span><strong style={{ fontSize: formatRaceTime(ready.raceTimeMs).length > 10 ? 24 : undefined }}>{formatRaceTime(ready.raceTimeMs)}</strong></div>}
      </motion.article>}
    </AnimatePresence>
  </div>;
}

function ParticipantName({ name }: { name: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    let cancelled = false;
    const fit = () => {
      const node = heading.current;
      if (!node || cancelled) return;
      let size = 32;
      node.style.maxHeight = '';
      node.style.fontSize = `${size}px`;
      while (size > 18 && (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)) {
        node.style.fontSize = `${--size}px`;
      }
      if (node.scrollHeight > node.clientHeight + 1) node.style.maxHeight = 'none';
    };
    fit();
    void document.fonts.ready.then(fit);
    return () => { cancelled = true; };
  }, [name]);
  return <h1 ref={heading}>{name}</h1>;
}

function Portrait({ participant }: { participant: Participant }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [participant.photo]);
  return participant.photo && !failed
    ? <img className="obs-portrait broadcast-photo-mask" src={participant.photo} alt="" onError={() => setFailed(true)} draggable={false} />
    : <div className="obs-portrait-fallback broadcast-photo-mask"><svg viewBox="0 0 160 180" aria-hidden="true"><circle cx="80" cy="57" r="31" /><path d="M19 176v-29a61 61 0 0 1 122 0v29" /></svg></div>;
}
