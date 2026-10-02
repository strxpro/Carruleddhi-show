import { EffectEngine, STAGE } from './engine';
import type { PaperParticle } from './engine';

function drawStar(context: CanvasRenderingContext2D, p: PaperParticle): void {
  const points = p.index % 3 === 0 ? 4 : 5;
  context.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = i * Math.PI / points - Math.PI / 2;
    const radius = p.size * (i % 2 === 0 ? 1 : 0.48);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.lineJoin = 'round';
  context.lineWidth = 3;
  context.strokeStyle = '#071a3d';
  context.stroke();
  context.fill();
  // One matte inset facet, never a pulsing highlight or additive glow.
  context.globalAlpha *= 0.42;
  context.fillStyle = '#fff6e7';
  context.beginPath();
  context.moveTo(0, -p.size * 0.69);
  context.lineTo(p.size * 0.2, -p.size * 0.08);
  context.lineTo(-p.size * 0.15, -p.size * 0.19);
  context.closePath();
  context.fill();
}

function ribbonX(p: PaperParticle, fraction: number): number {
  return Math.sin(fraction * Math.PI * 2.1 - p.age * 1.25 + p.phase) * 32 * p.scale
    + Math.sin(fraction * Math.PI + p.phase) * 20;
}

function drawRibbon(context: CanvasRenderingContext2D, p: PaperParticle): void {
  // A closed paper strip with 24 fixed segments, not hundreds of DOM nodes or trails.
  const segments = 24;
  context.beginPath();
  for (let edge = 0; edge < 2; edge++) {
    for (let step = 0; step <= segments; step++) {
      const fraction = (edge === 0 ? step : segments - step) / segments;
      const width = p.size * (0.65 + Math.cos(fraction * Math.PI * 2 - p.age) * 0.22);
      const x = ribbonX(p, fraction) + (edge === 0 ? -width / 2 : width / 2);
      const y = -fraction * p.length;
      if (edge === 0 && step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
  }
  context.closePath();
  context.strokeStyle = '#071a3d';
  context.lineWidth = 1.5;
  context.stroke();
  context.fill();
  context.globalAlpha *= 0.38;
  context.strokeStyle = '#fff6e7';
  context.lineWidth = 2;
  context.beginPath();
  for (let step = 4; step <= 13; step++) {
    const fraction = step / segments;
    const x = ribbonX(p, fraction) - p.size * 0.2;
    if (step === 4) context.moveTo(x, -fraction * p.length);
    else context.lineTo(x, -fraction * p.length);
  }
  context.stroke();
}

export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private scale = 1;

  constructor(readonly canvas: HTMLCanvasElement, readonly engine: EffectEngine) {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('OBS effects require Canvas 2D');
    this.context = context;
  }

  resize(width: number, height: number, pixelRatio = 1): void {
    const fit = Math.max(0.01, Math.min(width / STAGE.width, height / STAGE.height));
    const cssWidth = STAGE.width * fit;
    const cssHeight = STAGE.height * fit;
    // OBS rarely benefits from backing stores larger than its 1080p composition.
    this.scale = Math.min(1, fit * Math.min(2, Math.max(1, pixelRatio)));
    this.canvas.width = Math.max(1, Math.round(STAGE.width * this.scale));
    this.canvas.height = Math.max(1, Math.round(STAGE.height * this.scale));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.render();
  }

  clear(): void {
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.dataset.frameParticles = '0';
  }

  render(): void {
    this.clear();
    const { context, engine } = this;
    this.canvas.dataset.completed = String(engine.completed);
    this.canvas.dataset.phase = engine.phase;
    this.canvas.dataset.cycle = String(engine.cycle);
    this.canvas.dataset.frameParticles = String(engine.frameParticles);
    this.canvas.dataset.reducedMotion = String(engine.reducedMotion);
    if (engine.phase !== 'active') return;
    context.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    for (const p of engine.particles) {
      if (p.alpha <= 0) continue;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.angle);
      context.globalAlpha = p.alpha;
      context.fillStyle = p.color;
      if (engine.name === 'confetti') {
        context.scale(p.scale, 1);
        context.fillRect(-p.size / 2, -p.length / 2, p.size, p.length);
        context.globalAlpha *= 0.24;
        context.fillStyle = '#fff6e7';
        context.fillRect(-p.size / 2, -p.length / 2, p.size * 0.28, p.length);
      } else if (engine.name === 'ribbons') {
        drawRibbon(context, p);
      } else {
        context.scale(p.scale, p.scale);
        if (p.index % 4 === 3) {
          context.fillRect(-p.size * 0.2, -p.size * 0.55, p.size * 0.4, p.size * 1.1);
        } else drawStar(context, p);
      }
      context.restore();
    }
  }
}
