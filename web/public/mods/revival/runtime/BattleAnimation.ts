/** Simulation-owned clip playback. Rendering only reads the resulting pose. */
import { animationFrameIndex, skeletonEventsBetween, LEGACY_ANIMATION_FPS, type SkeletonAnimation, type SkeletonEvent } from "./BattleSkeleton";

// AnimationData.as HitFrames (one-based source frames).
export const LEGACY_HIT_FRAMES = [8, 6, 8, 1, 1, 1, 1, 6] as const;
const PHASE_NAMES = ["idle", "walk", "shoot", "hit", "death"] as const;
const PARTS = ["legs", "body", "arms", "weapon", "shadow"] as const;
type LegacyFrames = { fullAnimationTypeFrames: Array<Array<Array<Record<string, number>>>> };

/** Single source for the shipped clips and missing-asset compatibility fallback.
 * Input is the expanded original table, NOT the start/end range table.
 */
export function createLegacyBattleClip(data: LegacyFrames, type: number, phase: number): SkeletonAnimation {
  const frames = data.fullAnimationTypeFrames[type]?.[phase];
  if (!frames?.length || !PHASE_NAMES[phase]) throw new Error(`Missing original animation ${type}/${phase}`);
  const fps = LEGACY_ANIMATION_FPS;
  const events: SkeletonEvent[] = [];
  // BattleField.as: currFrame % 4 == 2, i.e. visible walk frames 2 and 6.
  if (phase === 1) events.push({ time: 1 / fps, name: "footstep" }, { time: 5 / fps, name: "footstep" });
  if (phase === 2) {
    if (type <= 2) events.push({ time: ((type === 1 ? 3 : 5) - 1) / fps, name: "melee_swoosh" });
    events.push({ time: (LEGACY_HIT_FRAMES[type] - 1) / fps, name: type === 7 ? "throw_release" : "fire" });
  }
  if (phase === 4) events.push({ time: 4 / fps, name: "death_logic" }, { time: 6 / fps, name: "death_fall" });
  const legacyParts: NonNullable<SkeletonAnimation["legacyParts"]> = {};
  for (const part of PARTS) {
    const values = frames.map(frame => frame[part]);
    // Held short tracks need no duplicate terminal keys.
    while (values.length > 1 && values[values.length - 1] === values[values.length - 2]) values.pop();
    legacyParts[part] = { fps, frames: values };
  }
  return { name: PHASE_NAMES[phase] + "_" + type, fps, duration: frames.length / fps,
    loop: phase === 1, tracks: [], events, legacyParts,
    // AS3 tables are one-based (length = source frames + 1). In EF, hit
    // returns to idle at length-1; death decrements that frame before drawing.
    // Keep all source keys for editing, but stop playback before the last key.
    ...((phase === 3 || phase === 4) ? { playbackDuration: Math.max(1, frames.length - 1) / fps } : {}) };
}

// Assets are immutable after loading; reuse fallback/event tracks across actors.
const legacyClipCache = new WeakMap<LegacyFrames, Map<string, SkeletonAnimation>>();
export function legacyBattleClip(data: LegacyFrames, type: number, phase: number): SkeletonAnimation {
  let clips = legacyClipCache.get(data);
  if (!clips) { clips = new Map(); legacyClipCache.set(data, clips); }
  const key = type + "/" + phase;
  let clip = clips.get(key);
  if (!clip) { clip = createLegacyBattleClip(data, type, phase); clips.set(key, clip); }
  return clip;
}
const boundedActionClips = new WeakMap<SkeletonAnimation, SkeletonAnimation>();

export type AnimationCue = { event: SkeletonEvent; cycle: number; frame: number };
export type AnimationPlayback = {
  animation: SkeletonAnimation;
  cycles: number;
  duration: number;
  elapsed: number;
  cycle: number;
  frame: number;
  started: boolean;
  done: boolean;
  events: AnimationCue[];
};

/** Original applyPhaseAndFrame enters frame 1 on the NEXT simulation tick.
 * A frame-1 attack therefore fires once on that tick, never during drawing.
 */
export function createAnimationPlayback(animation: SkeletonAnimation, cycles = 1): AnimationPlayback {
  if (!(animation.fps > 0) || !Number.isFinite(animation.fps) || !(animation.duration > 0) || !Number.isFinite(animation.duration)) throw new Error("Invalid action clip timing");
  const duration = animation.playbackDuration ?? animation.duration;
  if (!Number.isFinite(duration) || duration <= 0 || duration > animation.duration) throw new Error("Invalid clip playback duration");
  // This player owns repetition. Do not let the event sampler loop again at a
  // cycle boundary (custom clips can be authored with loop:true).
  if (animation.loop) {
    let bounded = boundedActionClips.get(animation);
    if (!bounded) { bounded = { ...animation, loop: false }; boundedActionClips.set(animation, bounded); }
    animation = bounded;
  }
  return { animation, duration, cycles: Math.max(1, Math.floor(Number.isFinite(cycles) ? cycles : 1)),
    elapsed: 0, cycle: 0, frame: 1, started: false, done: false, events: [] };
}

/** Includes crossed cycles in chronological order, with no catch-up frame loss.
 * Callers drain events exactly once and discard this object on interruption.
 */
export function advanceAnimationPlayback(playback: AnimationPlayback, dt: number): void {
  if (playback.done || !Number.isFinite(dt) || dt <= 0) return;
  const { animation, cycles, duration } = playback;
  const { fps } = animation;
  const previousTime = playback.elapsed - 1 / fps;
  playback.elapsed += dt;
  const endTime = cycles * duration - (animation.finishOnLastFrame ? 1 / fps : 0);
  const time = Math.min(playback.elapsed - 1 / fps, endTime);
  if (time < -1e-9) return;
  playback.started = true;
  const firstCycle = Math.max(0, animationFrameIndex(previousTime, 1 / duration));
  const lastCycle = Math.min(cycles - 1, animationFrameIndex(time, 1 / duration));
  for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
    const offset = cycle * duration;
    for (const event of skeletonEventsBetween(animation, previousTime - offset, Math.min(duration, time - offset))) {
      playback.events.push({ event, cycle, frame: animationFrameIndex(event.time, fps) + 1 });
    }
  }
  playback.cycle = lastCycle;
  playback.done = time >= endTime - 1e-9;
  playback.frame = playback.done ? animationFrameIndex(duration, fps)
    : Math.min(animationFrameIndex(duration, fps), animationFrameIndex(Math.max(0, time - lastCycle * duration), fps) + 1);
}
