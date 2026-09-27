/** Original BattleField EF (25 Hz): one fuel unit every two ticks, 47 physical frames. */
import { advanceAnimationPlayback, type AnimationPlayback } from './BattleAnimation';
import { createEffectPlayback, effectFrame } from './BattleEffectAnimation';
import { LEGACY_ANIMATION_FPS } from './BattleSkeleton';

export interface FlamePoint { x: number; y: number; }
export interface FlameParticle<T> extends FlamePoint {
  readonly playback: AnimationPlayback;
  readonly frame: number; speed: number; direction: number; firedBy: T;
}
export interface FlameHooks<T> {
  /** Consume one unit. Return remaining fuel, or -1 when no shot can be emitted. */
  emit(source: T): number;
  trace(from: FlamePoint, to: FlamePoint, source: T): FlamePoint | null;
  touch(flame: FlameParticle<T>): void;
  endTick(): void;
}
export class BattleFlames<T extends FlamePoint> {
  readonly particles: FlameParticle<T>[] = [];
  private source: T | null = null;
  private counter = 0;
  private direction = 0;
  private acc = 0;
  get busy(): boolean { return this.source !== null || this.particles.length > 0; }
  start(source: T, direction: number, burst: number): boolean {
    if (this.busy) return false;
    this.source = source; this.direction = direction;
    this.counter = Math.max(2, Math.floor(burst)) - 1; this.acc = 0;
    return true;
  }
  update(dt: number, hooks: FlameHooks<T>) {
    if (!this.busy) { this.acc = 0; return; }
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Fixed physical substeps are necessary for collisions/heat, not a second animation clock.
    this.acc += dt * LEGACY_ANIMATION_FPS;
    while (this.acc >= 1 - 1e-9 && this.busy) {
      this.acc = Math.max(0, this.acc - 1);
      if (this.source) {
        this.counter--;
        if (this.counter % 2 === 0) {
          const remaining = hooks.emit(this.source);
          if (remaining >= 0) this.particles.push({
            x: this.source.x, y: this.source.y, speed: 2,
            playback: createEffectPlayback('FlamethrowerFlame'),
            get frame() { return effectFrame(this.playback); },
            direction: this.direction, firedBy: this.source,
          });
          if (remaining <= 0) this.counter = 0;
        }
        if (this.counter <= 0) this.source = null;
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const f = this.particles[i];
        advanceAnimationPlayback(f.playback, 1 / LEGACY_ANIMATION_FPS);
        // AS3: 45 visible frames, but frames 46/47 still move and inflict heat.
        if (f.playback.done) { this.particles.splice(i, 1); continue; }
        const to = { x: f.x + Math.sin(f.direction) * f.speed, y: f.y + Math.cos(f.direction) * f.speed };
        const hit = f.speed > 0 ? hooks.trace(f, to, f.firedBy) : null;
        f.x = (hit ?? to).x; f.y = (hit ?? to).y;
        if (hit) f.speed = 0;
        hooks.touch(f);
        f.speed *= f.frame < 20 ? 1.1 : 0.9;
      }
      hooks.endTick();
    }
    if (!this.busy) this.acc = 0;
  }
}

/** Earliest intersection with a convex body or obstacle footprint. */
export function flameSegmentHit(from: FlamePoint, to: FlamePoint, polygon: FlamePoint[]): number | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  let best: number | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const ex = b.x - a.x, ey = b.y - a.y, det = dx * ey - dy * ex;
    if (Math.abs(det) < 1e-9) continue;
    const ax = a.x - from.x, ay = a.y - from.y;
    const t = (ax * ey - ay * ex) / det, u = (ax * dy - ay * dx) / det;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}
