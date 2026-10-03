import { useEffect, useRef, useState } from 'react';
import { formatRaceTime } from '../../../assets/js/race-time.js';
import {
  advanceRaceScroll, createRaceScrollClock, rankRaceResults, RACE_CATEGORIES, RACE_ROW_HEIGHT,
  type RaceCategory, type RaceResult,
} from './race-results';
import './race-results.css';

interface RaceResultsProps {
  participants: readonly RaceResult[];
  active: boolean;
  language?: 'it' | 'pl';
}

export function RaceResults({ participants, active, language = 'it' }: RaceResultsProps) {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [category, setCategory] = useState<RaceCategory | null>('art');
  const groups = rankRaceResults(participants);
  const categories = RACE_CATEGORIES.filter(key => groups[key].length > 0);
  const current = category && categories.includes(category) ? category : categories[0] ?? null;
  const rows = current ? groups[current] : [];
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLOListElement>(null);
  const clock = useRef(createRaceScrollClock());
  const latest = useRef({ categories, current });
  const pl = language === 'pl';

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => { latest.current = { categories, current }; });
  useEffect(() => {
    if (!active) return;
    let request = 0;
    let last = 0;
    const tick = (now: number) => {
      const { categories, current } = latest.current;
      const height = viewport.current?.clientHeight ?? 0;
      const maxOffset = Math.max(0, (track.current?.scrollHeight ?? 0) - height);
      const previous = clock.current;
      const next = advanceRaceScroll(previous, last ? Math.min(100, now - last) : 0, {
        categories, maxOffset, pageSize: Math.floor(height / RACE_ROW_HEIGHT) * RACE_ROW_HEIGHT,
        reducedMotion: reduced,
      });
      last = now;
      clock.current = next;
      if (track.current) {
        track.current.style.transform = `translate3d(0,${-next.offset}px,0)`;
        track.current.dataset.scrollPhase = next.phase;
      }
      if (next.category !== current) setCategory(next.category);
      request = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(request);
      last = 0;
      if (!document.hidden) request = requestAnimationFrame(tick);
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(request);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [active, reduced]);

  const row = (participant: RaceResult, index: number) => <li className="race-results__row"
    data-race-id={participant.id} data-race-time={participant.raceTimeMs ?? 'untimed'} key={participant.id}>
    <span className={`race-results__rank${index < 3 && participant.raceTimeMs !== null ? ' race-results__medal' : ''}`}
      data-place={index + 1} aria-label={`${pl ? 'Pozycja' : 'Posizione'} ${index + 1}`}>
      {index < 3 && participant.raceTimeMs !== null && <svg viewBox="0 0 32 36" aria-hidden="true"><path d="M8 1h7l1 10 1-10h7l-4 15H12Z" /><circle cx="16" cy="23" r="12" /></svg>}
      <b>{participant.raceTimeMs === null ? '\u2013' : index + 1}</b>
    </span>
    <div className="race-results__identity">
      <strong className={`${participant.firstName} ${participant.lastName}`.length > 36 ? 'race-results__long-name' : undefined}>
        {`${participant.firstName} ${participant.lastName}`.trim() || participant.projectName || `#${participant.startNumber}`}
      </strong>
      <span><b>#{participant.startNumber}</b>{participant.projectName && <span>{participant.projectName}</span>}</span>
    </div>
    <span className={`race-results__time${participant.raceTimeMs === null ? ' race-results__untimed' : participant.raceTimeMs >= 6_000_000 ? ' race-results__long-time' : ''}`}>
      {participant.raceTimeMs === null ? (pl ? 'Bez czasu' : 'Senza tempo') : formatRaceTime(participant.raceTimeMs)}
    </span>
  </li>;

  return <section className="race-results" data-race-results data-category={current ?? 'none'}
    data-reduced-motion={reduced} hidden={!active} aria-label={pl ? 'Wyniki przejazdów' : 'Classifica tempi'} aria-live="off">
    <header className="race-results__header">
      <span className="race-results__eyebrow">{pl ? 'WYNIKI PRZEJAZDÓW' : 'TEMPI DI DISCESA'}</span>
      <div><h1>{current?.toUpperCase() ?? (pl ? 'WYNIKI' : 'RISULTATI')}</h1><span className="race-results__category-count">{rows.length ? `${rows.length} ${pl ? 'ZAŁÓG' : 'EQUIPAGGI'}` : ''}</span></div>
      <p>{pl ? 'Od najszybszego czasu' : 'Dal tempo più veloce'}</p>
    </header>
    {rows.length ? <>
      <div className="race-results__top-label"><span>TOP 3</span><span>{pl ? 'CZAS' : 'TEMPO'}</span></div>
      <ol className="race-results__top" aria-label="Top 3">{rows.slice(0, 3).map(row)}</ol>
      {rows.length > 3 && <div className="race-results__rest-label">{pl ? 'PEŁNA KLASYFIKACJA' : 'TUTTI I TEMPI'}<span>04 / {String(rows.length).padStart(2, '0')}</span></div>}
      <div className="race-results__viewport" ref={viewport}>
        <ol className="race-results__track" ref={track} start={4}>{rows.slice(3).map((participant, index) => row(participant, index + 3))}</ol>
      </div>
    </> : <div className="race-results__empty"><span aria-hidden="true">--:--.---</span><strong>{pl ? 'Czekamy na uczestników' : 'In attesa dei partecipanti'}</strong><p>{pl ? 'Opublikowane czasy pojawią się tutaj.' : 'I tempi pubblicati appariranno qui.'}</p></div>}
    <footer className="race-results__footer"><i aria-hidden="true" />{pl ? 'CZASY PRZEJAZDÓW / NIE GŁOSY PUBLICZNOŚCI' : 'TEMPI DI GARA / NON VOTI DEL PUBBLICO'}</footer>
  </section>;
}
