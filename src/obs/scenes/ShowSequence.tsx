import { useEffect, useRef, useState } from 'react';
import { countdownDisplay, parseShowOptions, ShowSequenceController } from './show-sequence';
import type { SequenceSnapshot, ShowMode, ShowSequenceWindow } from './show-sequence';
import './show-sequence.css';

export interface ShowSequenceProps {
  mode: ShowMode;
  language: 'it' | 'pl';
  guides?: boolean;
  startingVideo?: string;
  introVideo?: string;
}

export function ShowSequence({ mode, language, guides = false,
  startingVideo = '/assets/images/intro.webm', introVideo = '/assets/images/wejscie.webm',
}: ShowSequenceProps) {
  const [options] = useState(() => parseShowOptions(window.location.search, window.location.origin));
  const [state, setState] = useState<SequenceSnapshot>({ active: false, remaining: options.countdown, introTime: 0, transitioned: false, status: 'waiting' });
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const source = mode === 'starting' ? startingVideo : introVideo;

  useEffect(() => {
    const video = videoRef.current;
    const music = musicRef.current;
    const bridge = (window as ShowSequenceWindow).obsstudio;
    let storage: Storage | undefined;
    try { storage = window.sessionStorage; } catch { /* Storage is optional. */ }
    let active = false;
    let entry = Infinity;
    let playbackEpoch = 0;
    let restored = false;
    let disposed = false;
    let audioFailed = false;
    const media = [...(video ? [video] : []), ...(music ? [music] : [])];
    const stop = () => { playbackEpoch++; media.forEach(item => { item.pause(); item.muted = true; item.volume = 0; }); };
    const restorePosition = () => {
      if (!active || !video || restored || mode !== 'intro' || !Number.isFinite(video.duration) || video.duration <= 0) return;
      restored = true;
      const offset = controller.snapshot.introTime;
      if (offset > 0 && !controller.snapshot.transitioned) video.currentTime = Math.min(offset, Math.max(0, video.duration - 0.1));
    };
    const play = () => {
      const epoch = ++playbackEpoch;
      entry = Infinity; audioFailed = false; restorePosition();
      media.forEach(item => {
        item.muted = true; item.volume = 0;
        void item.play().then(() => {
          if (!disposed && active && epoch === playbackEpoch && item === (options.music ? music : video)) entry = performance.now();
        }).catch(() => {
          if (!disposed && active && epoch === playbackEpoch && item === video) {
            setError('playback'); controller.mediaError();
          } else if (!disposed && active && epoch === playbackEpoch && item === music) {
            audioFailed = true; setError('music');
          }
        });
      });
    };
    const controller = new ShowSequenceController(mode, options, {
      bridge, events: window, storage: bridge ? storage : undefined,
      monotonic: () => performance.now(), wall: () => Date.now(),
      storageKey: `obs-show:v1:${window.location.pathname}:${mode}:${options.startingScene}:${options.introScene}:${options.liveScene}:${options.countdown}:${source}`,
    }, snapshot => {
      setState(snapshot);
      if (snapshot.active !== active) {
        active = snapshot.active;
        if (active && !snapshot.transitioned) { setError(''); play(); } else stop();
      }
      if (video && !active && snapshot.introTime === 0 && mode === 'intro') {
        restored = false;
        if (video.readyState > 0) video.currentTime = 0;
      }
    });
    const ended = () => { if (video?.ended && !video.error) controller.ended(); };
    const failed = () => { setError('video'); controller.mediaError(); stop(); };
    const musicFailed = () => { audioFailed = true; setError('music'); if (music) { music.pause(); music.muted = true; } };
    video?.addEventListener('loadedmetadata', restorePosition);
    video?.addEventListener('ended', ended);
    video?.addEventListener('error', failed);
    music?.addEventListener('error', musicFailed);
    controller.start();
    if (video?.error) failed();
    let frame = 0;
    const animate = () => {
      if (disposed) return;
      if (active) {
        if (video && mode === 'intro' && restored) controller.setIntroTime(video.currentTime);
        controller.tick();
        const remaining = mode === 'starting' ? controller.snapshot.remaining
          : video && Number.isFinite(video.duration) ? Math.max(0, video.duration - video.currentTime) : Infinity;
        const fade = Math.min(1, (performance.now() - entry) / 1200, remaining);
        media.forEach(item => {
          item.volume = Math.max(0, fade) * options.volume;
          item.muted = !bridge || !options.sound || !active || controller.snapshot.status === 'media-error' || (item === video && !!options.music) || (item === music && audioFailed);
        });
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true; controller.dispose(); stop(); cancelAnimationFrame(frame);
      video?.removeEventListener('loadedmetadata', restorePosition);
      video?.removeEventListener('ended', ended); video?.removeEventListener('error', failed);
      music?.removeEventListener('error', musicFailed);
    };
  }, [mode, options, source]);

  const display = countdownDisplay(state.remaining, options.countdown);
  const label = language === 'pl' ? 'ZACZYNAMY ZA' : 'INIZIAMO TRA';
  const mediaCue = language === 'pl' ? 'WIDEO NIEDOSTEPNE' : 'VIDEO NON DISPONIBILE';
  return <section className={`show-sequence show-sequence--${mode}`} data-active={state.active} data-sequence-status={state.status} aria-label={mode === 'starting' ? label : 'INTRO'}>
    {options.media && <video key={source} ref={videoRef} className="show-sequence-video" src={source} loop={mode === 'starting'} muted playsInline preload="metadata" disablePictureInPicture />}
    {options.media && options.music && options.sound && (window as ShowSequenceWindow).obsstudio && <audio ref={musicRef} src={options.music} loop muted preload="none" />}
    {mode === 'starting' && <div className={`show-countdown${display.urgent ? ' show-countdown--urgent' : ''}`}>
      <svg className="show-countdown-ring" viewBox="0 0 300 300" aria-hidden="true">
        <circle className="show-countdown-track" cx="150" cy="150" r="143" />
        <circle className="show-countdown-progress" cx="150" cy="150" r="143" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - display.progress} />
      </svg>
      <span className="show-countdown-label">{label}</span>
      <strong className="show-countdown-number" style={{ transform: `scale(${display.scale})` }} aria-label={`${display.seconds} ${language === 'pl' ? 'sekund' : 'secondi'}`}>{display.text}</strong>
      <span className="show-countdown-caption">CARRULEDDHI SHOW</span>
    </div>}
    {(error === 'video' || error === 'playback') && <span className="show-sequence-cue">{mediaCue}</span>}
    {guides && <aside className="show-sequence-guides">
      <strong>{mode.toUpperCase()} / {state.status}</strong>
      <span>{options.auto ? 'AUTO (OBS Advanced)' : 'AUTO OFF'} / {options.sound ? 'Audio: OBS only' : 'Muted'}</span>
      <span>{options.media ? source : 'HTML MEDIA OFF'}{error ? ` / MEDIA ERROR: ${error}` : ''}</span>
      <span>{mode === 'starting' ? `Countdown: ${options.countdown}s` : 'LIVE: native video ended only'}</span>
    </aside>}
  </section>;
}
