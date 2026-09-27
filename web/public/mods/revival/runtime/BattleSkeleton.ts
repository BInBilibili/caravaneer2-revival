/**
 * Data-driven 2D skeleton primitives for battle animation.
 *
 * This module deliberately has no renderer dependency. It can be adopted by a
 * doll renderer incrementally while legacy frame animation remains the fallback.
 */
import type { PackedPartAtlas } from "./BattleAtlas";
/** Canvas-compatible affine matrix. Keep shear; never decompose for rendering. */
export type AffineTransform = { a: number; b: number; c: number; d: number; tx: number; ty: number };
export type BoneTransform = { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number; pivotX?: number; pivotY?: number; alpha?: number };
export type BoneKeyframe = { time: number; transform: BoneTransform; interpolation?: "linear" | "step" };
export type BoneTrack = { bone: string; keys: BoneKeyframe[] };
export type SkeletonBone = BoneTransform & { name: string; parent?: string };
export type SkeletonSlotDirection = BoneTransform & { z?: number };
/** Native-size image or a fixed frame of an existing, appearance-tinted part atlas.
 * x/y override the crop's original registration position (image defaults to 0/0).
 * A missing frame follows the original part track. No new image is required.
 */
export type SkeletonAttachment = { image?: string; part?: string; frame?: number; x?: number; y?: number; muzzle?: { x: number; y: number } };
export type SkeletonSlot = SkeletonSlotDirection & { name: string; bone: string; part: string; z: number; attachment?: string | null; visible?: boolean; directions?: Record<string, SkeletonSlotDirection> };
export type SlotKeyframe = { time: number; attachment?: string | null; visible?: boolean; z?: number };
export type SlotTrack = { slot: string; keys: SlotKeyframe[] };
export type SkeletonDefinition = { packedParts?: Record<string, PackedPartAtlas>; bones: SkeletonBone[]; slots: SkeletonSlot[]; attachments?: Record<string, SkeletonAttachment>; drawOrder?: "legacy" | "slots" };
export type LegacyPartTrack = { frames: number[]; fps: number };
/** playbackDuration may end before the last source key (AS3 hit/death EF rules).
 * duration remains the full editable source timeline used by pose sampling.
 * finishOnLastFrame settles on arrival at the final pose (AS3 transport corpses);
 * the default settles after holding that pose for one frame. */
export type SkeletonAnimation = { name: string; fps: number; duration: number; playbackDuration?: number; finishOnLastFrame?: boolean; loop?: boolean; tracks: BoneTrack[]; slotTracks?: SlotTrack[]; events?: SkeletonEvent[]; legacyParts?: Record<string, LegacyPartTrack> };
export type SkeletonEvent = { time: number; name: string; value?: unknown };
/** TRS fields are diagnostic only. matrix is the authoritative world transform. */
export type SampledBone = { name: string; parent?: string; x: number; y: number; rotation: number; scaleX: number; scaleY: number; alpha: number; matrix: AffineTransform };
export type SampledSkeleton = { time: number; bones: Record<string, SampledBone>; slots: SkeletonSlot[]; attachments: Record<string, SkeletonAttachment>; drawOrder: "legacy" | "slots"; events: SkeletonEvent[]; legacyParts: Record<string, number> };

/** Original AnimationData.as timing: walk phase is frames 2..9 at 25 Hz. */
export const LEGACY_ANIMATION_FPS = 25;
export const LEGACY_WALK_FRAMES = 8;
export const LEGACY_ATTACK_FRAMES_BY_TYPE = [13, 12, 14, 3, 3, 3, 4, 11] as const;
export function legacyPhaseDuration(phase: number, animationType = 0): number {
  if (phase === 1) return LEGACY_WALK_FRAMES / LEGACY_ANIMATION_FPS;
  if (phase === 2) return (LEGACY_ATTACK_FRAMES_BY_TYPE[animationType] ?? LEGACY_ATTACK_FRAMES_BY_TYPE[0]) / LEGACY_ANIMATION_FPS;
  return 0;
}

/** Snap only floating-point noise at an exact frame boundary. */
export function animationFrameIndex(time: number, fps = LEGACY_ANIMATION_FPS): number {
  const frame = Math.max(0, Number.isFinite(time) ? time : 0) * fps;
  const nearest = Math.round(frame);
  return Math.floor(Math.abs(frame - nearest) < 1e-9 ? nearest : frame);
}

/** Animation assets are immutable after loading; replacements get fresh cache entries. */
const animationCache = new WeakMap<SkeletonAnimation, { tracks: Map<string, BoneTrack>; slotTracks: Map<string, SlotTrack>; events: SkeletonEvent[] }>();
const definitionCache = new WeakMap<SkeletonDefinition, { bones: SkeletonBone[]; slots: SkeletonSlot[] }>();
function compileDefinition(definition: SkeletonDefinition) {
  const cached = definitionCache.get(definition);
  if (cached) return cached;
  const byName = new Map<string, SkeletonBone>();
  for (const bone of definition.bones) {
    if (byName.has(bone.name)) throw new Error("Duplicate skeleton bone: " + bone.name);
    byName.set(bone.name, bone);
  }
  const bones: SkeletonBone[] = [], visiting = new Set<string>(), visited = new Set<string>();
  const visit = (bone: SkeletonBone) => {
    if (visited.has(bone.name)) return;
    if (visiting.has(bone.name)) throw new Error("Skeleton parent cycle: " + bone.name);
    visiting.add(bone.name);
    if (bone.parent) {
      const parent = byName.get(bone.parent);
      if (!parent) throw new Error("Missing skeleton parent: " + bone.parent);
      visit(parent);
    }
    visiting.delete(bone.name); visited.add(bone.name); bones.push(bone);
  };
  definition.bones.forEach(visit);
  const slotNames = new Set<string>();
  for (const slot of definition.slots) {
    if (slotNames.has(slot.name)) throw new Error("Duplicate skeleton slot: " + slot.name);
    if (!byName.has(slot.bone)) throw new Error("Missing slot bone: " + slot.bone);
    if (slot.attachment != null && !definition.attachments?.[slot.attachment]) throw new Error("Missing skeleton attachment: " + slot.attachment);
    slotNames.add(slot.name);
  }
  const compiled = { bones, slots: [...definition.slots].sort((a, b) => a.z - b.z) };
  definitionCache.set(definition, compiled);
  return compiled;
}
function compileAnimation(animation: SkeletonAnimation) {
  let compiled = animationCache.get(animation);
  if (!compiled) {
    compiled = {
      tracks: new Map(animation.tracks.map(track => [track.bone, { ...track, keys: [...track.keys].sort((a, b) => a.time - b.time) }])),
      slotTracks: new Map((animation.slotTracks ?? []).map(track => [track.slot, { ...track, keys: [...track.keys].sort((a, b) => a.time - b.time) }])),
      events: [...(animation.events ?? [])].sort((a, b) => a.time - b.time),
    };
    animationCache.set(animation, compiled);
  }
  return compiled;
}

export function skeletonSampleTime(animation: SkeletonAnimation | undefined, time: number): number {
  const duration = Math.max(0, animation?.duration ?? 0);
  if (!Number.isFinite(time)) return 0;
  if (!animation?.loop || duration <= 0) return Math.max(0, Math.min(duration, time));
  // A second modulo for positive time changes exact 25 Hz boundaries (e.g. .04).
  let t = time % duration;
  if (t < 0) t += duration;
  if (Math.abs(t) < 1e-10 || Math.abs(t - duration) < 1e-10) return 0;
  return t;
}

/** Events belong to the simulation's absolute (previousTime, time] interval.
 * Rendering the same pose, seeking backwards or clamping a finished clip emits none.
 * A caller may pass previousTime < 0 once to include an event on the first frame.
 */
export function skeletonEventsBetween(animation: SkeletonAnimation | undefined, previousTime: number, time: number): SkeletonEvent[] {
  if (!animation || !Number.isFinite(time) || !Number.isFinite(previousTime) || time <= previousTime) return [];
  const events = compileAnimation(animation).events;
  const epsilon = 1e-9;
  if (!animation.loop || animation.duration <= 0) return events.filter(e => e.time > previousTime + epsilon && e.time <= time + epsilon);
  const duration = animation.duration;
  const hits: { event: SkeletonEvent; at: number; cycle: number }[] = [];
  // Include the previous cycle because its event at duration shares the next start.
  const first = Math.max(0, Math.floor(previousTime / duration) - 1);
  const last = animationFrameIndex(Math.max(0, time), 1 / duration);
  for (let cycle = first; cycle <= last; cycle++) {
    for (const event of events) {
      if (event.time < 0 || event.time > duration) continue;
      const at = cycle * duration + event.time;
      if (at > previousTime + epsilon && at <= time + epsilon) hits.push({ event, at, cycle });
    }
  }
  hits.sort((a, b) => a.at - b.at || a.cycle - b.cycle);
  return hits.map(hit => hit.event);
}

let nextAssetId = 1;
const assetIds = new WeakMap<object, number>();
function assetId(asset: object): number {
  let id = assetIds.get(asset);
  if (!id) { id = nextAssetId++; assetIds.set(asset, id); }
  return id;
}

/** Repeated cycles/finished poses reuse the same key; asset replacements do not. */
export function skeletonPoseKey(definition: SkeletonDefinition, animation: SkeletonAnimation, time: number): string {
  return assetId(definition) + ":" + assetId(animation) + ":" + animationFrameIndex(skeletonSampleTime(animation, time), animation.fps || LEGACY_ANIMATION_FPS);
}
const poseCache = new WeakMap<SkeletonDefinition, WeakMap<SkeletonAnimation, Map<number, SampledSkeleton>>>();
/** Read-only render poses shared across units, body and shadow. No event dispatch. */
export function sampleSkeletonPose(definition: SkeletonDefinition, animation: SkeletonAnimation, time: number): SampledSkeleton {
  let animations = poseCache.get(definition);
  if (!animations) { animations = new WeakMap(); poseCache.set(definition, animations); }
  let poses = animations.get(animation);
  if (!poses) { poses = new Map(); animations.set(animation, poses); }
  const fps = animation.fps || LEGACY_ANIMATION_FPS;
  const frame = animationFrameIndex(skeletonSampleTime(animation, time), fps);
  let pose = poses.get(frame);
  if (!pose) {
    pose = sampleSkeleton(definition, animation, frame / fps);
    poses.set(frame, pose);
    if (poses.size > 128) poses.delete(poses.keys().next().value!);
  }
  return pose;
}

const n = (v: number | undefined, fallback: number) => Number.isFinite(v) ? v! : fallback;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Index of the last key at or before time; duplicate times use the last key. */
function keyIndex(keys: { time: number }[], time: number): number {
  let lo = 0, hi = keys.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (keys[mid].time <= time + 1e-10) lo = mid + 1; else hi = mid; }
  return lo - 1;
}
function sampleTrack(track: BoneTrack, time: number): BoneTransform {
  const keys = track.keys;
  if (!keys.length) return {};
  const i = keyIndex(keys, time);
  if (i < 0) return keys[0].transform;
  const a = keys[i], b = keys[i + 1];
  if (!b || a.interpolation === "step") return a.transform;
  const t = Math.max(0, (time - a.time) / (b.time - a.time));
  const av = a.transform, bv = b.transform, out: BoneTransform = {};
  for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'pivotX', 'pivotY', 'alpha'] as const) {
    const x = av[key], y = bv[key], fallback = key === 'scaleX' || key === 'scaleY' || key === 'alpha' ? 1 : 0;
    if (x !== undefined || y !== undefined) out[key] = lerp(n(x, fallback), n(y, n(x, fallback)), t);
  }
  return out;
}

/** T(position) * R(rotation radians) * S(scale) * T(-pivot). */
export function transformMatrix(tr: BoneTransform): AffineTransform {
  const c = Math.cos(n(tr.rotation, 0)), s = Math.sin(n(tr.rotation, 0));
  const a = c * n(tr.scaleX, 1), b = s * n(tr.scaleX, 1), cc = -s * n(tr.scaleY, 1), d = c * n(tr.scaleY, 1);
  const px = n(tr.pivotX, 0), py = n(tr.pivotY, 0);
  return { a, b, c: cc, d, tx: n(tr.x, 0) - a * px - cc * py, ty: n(tr.y, 0) - b * px - d * py };
}
export function multiplyAffine(p: AffineTransform, q: AffineTransform): AffineTransform {
  return { a: p.a*q.a+p.c*q.b, b: p.b*q.a+p.d*q.b, c: p.a*q.c+p.c*q.d, d: p.b*q.c+p.d*q.d,
    tx: p.a*q.tx+p.c*q.ty+p.tx, ty: p.b*q.tx+p.d*q.ty+p.ty };
}
export function transformPoint(m: AffineTransform, x: number, y: number): { x: number; y: number } {
  return { x: m.a*x+m.c*y+m.tx, y: m.b*x+m.d*y+m.ty };
}
export function slotTransform(slot: SkeletonSlot, direction: number): SkeletonSlotDirection {
  return { ...slot, ...slot.directions?.[String(((direction % 4) + 4) % 4)] };
}
export function slotMatrix(sample: SampledSkeleton, slot: SkeletonSlot, direction: number): AffineTransform {
  return multiplyAffine(sample.bones[slot.bone].matrix, transformMatrix(slotTransform(slot, direction)));
}
const slotOrderCache = new WeakMap<SampledSkeleton, Map<number, SkeletonSlot[]>>();
/** Explicit rig ordering only. Legacy order remains Character.as's per-direction/per-phase order. */
export function orderedSkeletonSlots(sample: SampledSkeleton, direction: number, legacyOrder: string[]): SkeletonSlot[] {
  if (sample.drawOrder === "legacy") return legacyOrder.flatMap(part => sample.slots.filter(slot => slot.part === part));
  const dir = ((direction % 4) + 4) % 4;
  let cache = slotOrderCache.get(sample);
  if (!cache) { cache = new Map(); slotOrderCache.set(sample, cache); }
  let slots = cache.get(dir);
  if (!slots) {
    slots = [...sample.slots].sort((a, b) => n(slotTransform(a, dir).z, a.z) - n(slotTransform(b, dir).z, b.z));
    cache.set(dir, slots);
  }
  return slots;
}

/** Sample additive local tracks and compose full parent matrices, including shear. */
export function sampleSkeleton(definition: SkeletonDefinition, animation: SkeletonAnimation | undefined, time: number, previousTime = time): SampledSkeleton {
  const t = skeletonSampleTime(animation, time), compiled = compileDefinition(definition);
  const anim = animation ? compileAnimation(animation) : undefined;
  const bones: Record<string, SampledBone> = Object.create(null);
  for (const bone of compiled.bones) {
    const track = anim?.tracks.get(bone.name), tr = track ? sampleTrack(track, t) : {};
    const local = { x: n(bone.x, 0)+n(tr.x, 0), y: n(bone.y, 0)+n(tr.y, 0), rotation: n(bone.rotation, 0)+n(tr.rotation, 0),
      scaleX: n(bone.scaleX, 1)*n(tr.scaleX, 1), scaleY: n(bone.scaleY, 1)*n(tr.scaleY, 1),
      pivotX: n(bone.pivotX, 0)+n(tr.pivotX, 0), pivotY: n(bone.pivotY, 0)+n(tr.pivotY, 0) };
    const parent = bone.parent ? bones[bone.parent] : undefined, matrix = transformMatrix(local);
    const world = parent ? multiplyAffine(parent.matrix, matrix) : matrix;
    bones[bone.name] = { name: bone.name, parent: bone.parent, x: world.tx, y: world.ty,
      rotation: (parent?.rotation ?? 0)+local.rotation, scaleX: (parent?.scaleX ?? 1)*local.scaleX, scaleY: (parent?.scaleY ?? 1)*local.scaleY,
      alpha: (parent?.alpha ?? 1)*Math.max(0, Math.min(1, n(bone.alpha, 1)*n(tr.alpha, 1))), matrix: world };
  }
  const legacyParts: Record<string, number> = {};
  for (const [part, track] of Object.entries(animation?.legacyParts ?? {})) {
    const frames = track.frames ?? [];
    if (frames.length) legacyParts[part] = frames[Math.min(frames.length - 1, animationFrameIndex(t, track.fps || LEGACY_ANIMATION_FPS))];
  }
  const slots = !anim?.slotTracks.size ? compiled.slots : compiled.slots.map(slot => {
    const keys = anim.slotTracks.get(slot.name)?.keys;
    if (!keys?.length) return slot;
    // Discrete channels are independent: a visibility key must not reset attachment.
    const value = { ...slot };
    for (let i = 0, end = keyIndex(keys, t); i <= end; i++) {
      const key = keys[i];
      if (key.attachment !== undefined) value.attachment = key.attachment;
      if (key.visible !== undefined) value.visible = key.visible;
      if (key.z !== undefined) value.z = key.z;
    }
    if (value.attachment != null && !definition.attachments?.[value.attachment]) throw new Error("Missing skeleton attachment: " + value.attachment);
    return value;
  });
  return { time: t, bones, slots, attachments: definition.attachments ?? {}, drawOrder: definition.drawOrder ?? "legacy",
    events: skeletonEventsBetween(animation, previousTime, time), legacyParts };
}
