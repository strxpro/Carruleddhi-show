import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { SponsorQueue } from './sponsor-queue';
import { sponsorRoster } from './sponsor-roster';
import type { Sponsor } from './types';

const TRACK_WIDTH = 944;

export function SponsorStream({ sponsors, enabled }: { sponsors: Sponsor[]; enabled: boolean }) {
  const engine = useRef(new SponsorQueue(TRACK_WIDTH, 236, 48));
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const warmed = useRef(new Set<string>());
  const [, redraw] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    const roster = sponsorRoster(sponsors);
    const disposers: (() => void)[] = [];
    const urls = [...new Set(roster.filter((s) => s.logo && !warmed.current.has(s.logo)).map((s) => s.logo))];
    const loading = urls.map((url) => new Promise<void>((resolve) => {
      const image = new Image();
      const finish = () => {
        clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        warmed.current.add(url);
        resolve();
      };
      const timeout = setTimeout(finish, 1800);
      image.onload = finish;
      image.onerror = finish;
      image.src = url;
      disposers.push(() => { clearTimeout(timeout); image.onload = null; image.onerror = null; });
    }));
    void Promise.all(loading).then(() => {
      if (cancelled) return;
      engine.current.update(roster);
      redraw((v) => v + 1);
    });
    return () => { cancelled = true; disposers.forEach((dispose) => dispose()); };
  }, [sponsors]);

  useEffect(() => {
    let frame = 0;
    let previous = 0;
    const tick = (now: number) => {
      // Continuous logo rotation is essential content; reduced motion only removes reveals.
      if (enabled && previous) {
        const changed = engine.current.advance((now - previous) / 1000);
        for (const slot of engine.current.slots) {
          const node = nodes.current.get(slot.key);
          if (node) node.style.transform = `translate3d(${slot.x}px,0,0)`;
        }
        if (changed) redraw((v) => v + 1);
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);

  const visible = enabled && engine.current.slots.length > 0;
  return <motion.section className="obs-sponsors" aria-label="Partner della manifestazione"
    initial={false} animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 24 }}
    transition={{ duration: reduced ? 0 : .32, ease: [.22, 1, .36, 1] }} aria-hidden={!visible}>
    <div className="obs-sponsor-label"><span>PARTNER</span><strong>DELL'EVENTO</strong></div>
    <div className="obs-sponsor-track">
      {engine.current.slots.map((slot) => <div className="obs-sponsor-slot" key={slot.key}
        ref={(node) => { if (node) nodes.current.set(slot.key, node); else nodes.current.delete(slot.key); }}
        style={{ transform: `translate3d(${slot.x}px,0,0)` }}>
        <SponsorMark sponsor={slot.sponsor} />
      </div>)}
    </div>
  </motion.section>;
}

function SponsorMark({ sponsor }: { sponsor: Sponsor }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [sponsor.logo]);
  if (sponsor.id.startsWith('house:')) return <div className={`obs-house obs-house-${sponsor.id.split(':')[1]}`} data-sponsor-id={sponsor.id}>
    <div>{sponsor.id === 'house:brand' ? <><strong>Carruleddhi</strong><span>SHOW</span></>
      : sponsor.id === 'house:town' ? <><strong>Santa Teresa</strong><span>GALLURA</span></>
        : <><strong>Partner</strong><span>DELL'EVENTO</span></>}</div>
    <span className="obs-sponsor-divider" aria-hidden="true" />
  </div>;
  return <div className="obs-sponsor-mark" data-sponsor-id={sponsor.id}>
    {sponsor.logo && !failed
      ? <img src={sponsor.logo} alt={sponsor.name} onError={() => setFailed(true)} draggable={false} />
      : <span className="obs-sponsor-fallback">{sponsor.name}</span>}
    {sponsor.tier && sponsor.tier !== 'partner' && <small>{sponsor.tier}</small>}
    <span className="obs-sponsor-divider" aria-hidden="true" />
  </div>;
}
