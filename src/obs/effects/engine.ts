export type EffectName = 'confetti' | 'ribbons' | 'sparkles';

export const STAGE = Object.freeze({ width: 1920, height: 1080 });
export const PALETTE = Object.freeze(['#ffc928', '#f6494f', '#2469d8', '#fff6e7', '#071a3d', '#28b67a']);
export const EFFECTS = Object.freeze({
  confetti: Object.freeze({ duration: 7, quiet: 20, count: 150 }),
  ribbons: Object.freeze({ duration: 8, quiet: 22, count: 14 }),
  sparkles: Object.freeze({ duration: 6, quiet: 20, count: 26 }),
});
export const MAX_FRAME_DELTA = 0.05;

export function isEffectName(value: string | undefined): value is EffectName {
  return value === 'confetti' || value === 'ribbons' || value === 'sparkles';
}

export function clampIntensity(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : 1;
  return Number.isFinite(number) ? Math.min(1.5, Math.max(0.5, number)) : 1;
}

function smooth(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

export interface PaperParticle {
  index: number;
  color: string;
  originX: number;
  originY: number;
  x: number;
  y: number;
  angle: number;
  phase: number;
  alpha: number;
  scale: number;
  size: number;
  length: number;
  delay: number;
  life: number;
  speed: number;
  drift: number;
  age: number;
}

/** A fixed particle pool and a visible-time clock; no DOM, timers, or per-frame allocations. */
export class EffectEngine {
  readonly name: EffectName;
  readonly once: boolean;
  readonly intensity: number;
  readonly particles: PaperParticle[];
  reducedMotion: boolean;
  elapsed = 0;
  cycle = 0;
  frameParticles = 0;
  completed = false;
  private seed: number;

  constructor(name: EffectName, options: { once?: boolean; intensity?: unknown; reducedMotion?: boolean; seed?: number } = {}) {
    this.name = name;
    this.once = options.once === true;
    this.intensity = clampIntensity(options.intensity);
    this.reducedMotion = options.reducedMotion === true;
    this.seed = (options.seed ?? 0xca77) >>> 0;
    this.particles = Array.from({ length: Math.round(EFFECTS[name].count * this.intensity) }, (_, index) => ({
      index, color: PALETTE[0]!, originX: 0, originY: 0, x: 0, y: 0, angle: 0,
      phase: 0, alpha: 0, scale: 0, size: 0, length: 0, delay: 0, life: 0, speed: 0, drift: 0, age: 0,
    }));
    this.resetParticles();
  }

  get period(): number { return EFFECTS[this.name].duration + EFFECTS[this.name].quiet; }
  get phase(): 'active' | 'quiet' | 'completed' {
    return this.completed ? 'completed' : this.elapsed + 1e-9 < EFFECTS[this.name].duration ? 'active' : 'quiet';
  }
  get particleLimit(): number {
    return Math.max(1, Math.round(this.particles.length * (this.reducedMotion ? 0.45 : 1)));
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private resetParticles(): void {
    for (const p of this.particles) {
      const side = p.index % 2 === 0 ? 1 : -1;
      // Green is a secondary accent, not an equal share of the palette.
      const colorIndex = p.index % 13 === 12 ? 5 : p.index % 5;
      p.color = PALETTE[colorIndex]!;
      p.phase = this.random() * Math.PI * 2;
      p.delay = this.random() * (this.name === 'ribbons' ? 1.1 : 0.9);
      p.life = this.name === 'confetti' ? 4.7 + this.random() * 1.1
        : this.name === 'ribbons' ? 5.4 + this.random() * 1.2 : 3.7 + this.random() * 1.1;
      p.size = this.name === 'confetti' ? 9 + this.random() * 9
        : this.name === 'ribbons' ? 10 + this.random() * 8 : 19 + this.random() * 22;
      p.length = this.name === 'confetti' ? p.size * (1.3 + this.random()) : 210 + this.random() * 160;
      p.originX = this.name === 'confetti' ? 160 + this.random() * 1600
        : side > 0 ? 80 + this.random() * 240 : 1600 + this.random() * 240;
      p.originY = this.name === 'sparkles' ? 100 + this.random() * 880 : -100 - this.random() * 120;
      if (this.name === 'sparkles' && p.index % 3 === 0) {
        p.originX = 400 + this.random() * 1120;
        p.originY = p.index % 2 === 0 ? 90 + this.random() * 70 : 920 + this.random() * 70;
      }
      p.speed = 100 + this.random() * 70;
      p.drift = side * (20 + this.random() * 50);
      p.alpha = 0;
      p.scale = 0;
      p.x = p.originX;
      p.y = p.originY;
      p.angle = p.phase;
      p.age = 0;
    }
  }

  advance(deltaSeconds: number): void {
    if (this.completed) return;
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(MAX_FRAME_DELTA, deltaSeconds)) : 0;
    this.elapsed += delta;
    if (this.once && this.elapsed + 1e-9 >= EFFECTS[this.name].duration) {
      this.elapsed = EFFECTS[this.name].duration;
      this.completed = true;
    } else if (!this.once && this.elapsed + 1e-9 >= this.period) {
      this.elapsed = Math.max(0, this.elapsed - this.period);
      this.cycle++;
      this.resetParticles();
    }
    this.frameParticles = 0;
    for (const p of this.particles) {
      const t = this.elapsed - p.delay;
      p.alpha = 0;
      if (this.phase !== 'active' || p.index >= this.particleLimit || t <= 0 || t >= p.life) continue;
      p.age = t;
      p.alpha = smooth(t / (this.name === 'sparkles' ? 0.7 : 0.35)) * smooth((p.life - t) / 1.05);
      const motion = this.reducedMotion ? 0.4 : 1;
      if (this.name === 'confetti') {
        p.x = p.originX + p.drift * t * motion + Math.sin(t * 1.8 + p.phase) * 28 * motion;
        p.y = p.originY + p.speed * t + 23 * t * t;
        p.angle = p.phase + t * 1.6 * motion;
        p.scale = 0.35 + Math.abs(Math.cos(t * 2 * motion + p.phase)) * 0.65;
      } else if (this.name === 'ribbons') {
        p.x = p.originX + Math.sin(t * 0.85 + p.phase) * 75 * motion;
        p.y = -p.length + (STAGE.height + p.length * 2) * (t / p.life);
        p.angle = Math.sin(t * 0.7 + p.phase) * 0.16 * motion;
        p.scale = motion;
      } else {
        p.x = p.originX + Math.sin(t * 0.55 + p.phase) * 14 * motion;
        p.y = p.originY - 14 * t * motion;
        p.angle = Math.sin(p.phase) * 0.2 + t * 0.12 * motion;
        p.scale = (0.7 + 0.3 * smooth(t / 0.9)) * smooth((p.life - t) / 0.9);
      }
      if (p.alpha > 0) this.frameParticles++;
    }
  }
}
