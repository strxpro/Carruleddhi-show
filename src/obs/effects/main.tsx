/// <reference types="vite/client" />
import { CanvasRenderer } from './CanvasRenderer';
import { EFFECTS, EffectEngine, isEffectName } from './engine';
import './effects.css';

const name = document.documentElement.dataset.obsEffect;
const root = document.getElementById('root');

if (root && isEffectName(name)) {
  const query = new URLSearchParams(window.location.search);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const engine = new EffectEngine(name, {
    once: query.get('once') === '1',
    intensity: query.get('intensity'),
    reducedMotion: motion.matches,
    seed: Math.floor(Math.random() * 4294967296),
  });
  const canvas = document.createElement('canvas');
  canvas.className = 'obs-effect-stage';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.obsEffect = name;
  canvas.dataset.effect = name;
  canvas.dataset.completed = 'false';
  canvas.dataset.frameParticles = '0';
  canvas.dataset.duration = String(EFFECTS[name].duration);
  canvas.dataset.period = String(engine.period);
  canvas.dataset.once = String(engine.once);
  canvas.dataset.intensity = String(engine.intensity);
  root.append(canvas);
  const renderer = new CanvasRenderer(canvas, engine);
  let frame: number | undefined;
  let previous: number | undefined;
  let disposed = false;
  let pageHidden = false;
  let obsVisible = true;
  const hidden = () => document.hidden || pageHidden || !obsVisible;

  function stop(): void {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    previous = undefined;
    canvas.dataset.running = 'false';
  }

  function tick(now: number): void {
    frame = undefined;
    if (disposed || hidden()) return;
    engine.advance(previous === undefined ? 0 : (now - previous) / 1000);
    previous = now;
    renderer.render();
    if (!engine.completed) frame = requestAnimationFrame(tick);
    else stop();
  }

  function resume(): void {
    if (disposed || hidden() || engine.completed || frame !== undefined) return;
    previous = undefined;
    canvas.dataset.running = 'true';
    frame = requestAnimationFrame(tick);
  }

  function visibility(): void {
    if (hidden()) {
      stop();
      renderer.clear();
      canvas.dataset.phase = 'suspended';
    } else {
      renderer.render();
      resume();
    }
  }

  function resize(): void {
    renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
    if (hidden()) {
      renderer.clear();
      canvas.dataset.phase = 'suspended';
    }
  }

  function reducedMotion(): void {
    engine.reducedMotion = motion.matches;
    engine.advance(0);
    visibility();
  }

  function obsVisibility(event: Event): void {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (detail && typeof detail === 'object' && 'visible' in detail && typeof detail.visible === 'boolean') {
      obsVisible = detail.visible;
      visibility();
    }
  }

  function pageHide(event: PageTransitionEvent): void {
    pageHidden = true;
    if (event.persisted) visibility();
    else dispose();
  }

  function pageShow(): void {
    pageHidden = false;
    visibility();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    stop();
    renderer.clear();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pagehide', pageHide);
    window.removeEventListener('pageshow', pageShow);
    window.removeEventListener('obsSourceVisibleChanged', obsVisibility);
    document.removeEventListener('visibilitychange', visibility);
    motion.removeEventListener('change', reducedMotion);
    canvas.remove();
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pagehide', pageHide);
  window.addEventListener('pageshow', pageShow);
  window.addEventListener('obsSourceVisibleChanged', obsVisibility);
  document.addEventListener('visibilitychange', visibility);
  motion.addEventListener('change', reducedMotion);
  resize();
  visibility();
  import.meta.hot?.dispose(dispose);
}
