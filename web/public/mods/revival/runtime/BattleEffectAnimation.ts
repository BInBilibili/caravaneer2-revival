/** Original BattleField.as EF sprite timelines. No rendering clocks or new assets. */
import { advanceAnimationPlayback, createAnimationPlayback, type AnimationPlayback } from './BattleAnimation';
import { LEGACY_ANIMATION_FPS, type SkeletonAnimation } from './BattleSkeleton';

export type BattleEffectKind = 'ShotSmoke' | 'Explosion' | 'BodyBurn' | 'FlamethrowerFlame' | 'Grenade';
export const ORIGINAL_EFFECTS = {
  Grenade: { frames: 16, width: 10, height: 10, x: -5, y: -5 },
  FlamethrowerFlame: { frames: 45, width: 100, height: 100, x: -50, y: -90 },
  ShotSmoke: { frames: 12, width: 20, height: 20, x: -10, y: -40 },
  Explosion: { frames: 24, width: 300, height: 250, x: -150, y: -200 },
  BodyBurn: { frames: 40, width: 100, height: 100, x: 0, y: -40 },
} as const;
function clip(name: BattleEffectKind): SkeletonAnimation {
  return { name, fps: LEGACY_ANIMATION_FPS, duration: (name === 'FlamethrowerFlame' ? 47 : ORIGINAL_EFFECTS[name].frames) / LEGACY_ANIMATION_FPS, tracks: [] };
}
const clips = { Grenade: clip('Grenade'), FlamethrowerFlame: clip('FlamethrowerFlame'), ShotSmoke: clip('ShotSmoke'), Explosion: clip('Explosion'), BodyBurn: clip('BodyBurn') };

/** First tick shows frame 1. Finite FX retain their last frame for one full tick:
 * smoke 1..12 then gone; explosion (created at AS3 frame 0) 1..24 then gone.
 * BodyBurn retains its own phase when temporarily extinguished, as Character.burnFrame did.
 */
export function createEffectPlayback(kind: BattleEffectKind): AnimationPlayback {
  return createAnimationPlayback(clips[kind], kind === 'BodyBurn' || kind === 'Grenade' ? Number.MAX_SAFE_INTEGER : 1);
}
/** Attack creates a grenade at frame 1 before EF's first flying tick advances to 2.
 * Optional initial frame supports in-memory fixtures using the old frame field.
 */
export function createGrenadePlayback(initialFrame = 1): AnimationPlayback {
  const playback = createEffectPlayback('Grenade');
  const frame = Number.isInteger(initialFrame) && initialFrame >= 1 && initialFrame <= 16 ? initialFrame : 1;
  advanceAnimationPlayback(playback, frame / LEGACY_ANIMATION_FPS);
  return playback;
}
export function effectFrame(playback?: AnimationPlayback): number {
  return playback?.started && !playback.done ? playback.frame : 0;
}
export interface EffectCrop { x: number; y: number; width: number; height: number; }
/** AnimationData.getSprite crops transparent borders before original positioning.
 * Fire is centered using the CROPPED dimensions; smoke/explosion keep atlas registration.
 */
export function effectSpritePlacement(kind: BattleEffectKind, frame: number, crop?: EffectCrop) {
  const spec = ORIGINAL_EFFECTS[kind];
  if (!Number.isInteger(frame) || frame < 1 || frame > spec.frames) return null;
  const c = crop ?? { x: 0, y: 0, width: spec.width, height: spec.height };
  return { srcRect: { x: c.x, y: (frame - 1) * spec.height + c.y, w: c.width, h: c.height },
    x: kind === 'BodyBurn' ? -Math.round(c.width / 2) : spec.x + c.x,
    y: kind === 'BodyBurn' ? spec.y - Math.round(c.height / 2) : spec.y + c.y };
}
