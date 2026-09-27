/** Original BattleField.as EF: draw transport BEFORE incrementing its frame.
 * Reuses the battle clock, attachment sampler and once-only event queue.
 */
import { createAnimationPlayback, advanceAnimationPlayback, type AnimationPlayback } from "./BattleAnimation";
import { sampleSkeletonPose, LEGACY_ANIMATION_FPS, type SkeletonAnimation, type SkeletonDefinition } from "./BattleSkeleton";

export type TransportRig = { definition: SkeletonDefinition; animations: Record<string, SkeletonAnimation> };
export type TransportPhase = "idle" | "hit" | "death";
export interface TransportAnimation {
  frame: number; phase: TransportPhase; towing: boolean; done: boolean;
  playback?: AnimationPlayback;
}
export function transportClipName(phase: TransportPhase, towing: boolean): string {
  return phase + (towing ? "_towing" : "_free");
}
/** Shared by the generator and the missing-data fallback; no new image assets. */
export function createOriginalTransportRig(): TransportRig {
  const definition: SkeletonDefinition = { bones: [{ name: "root" }],
    slots: [{ name: "body", bone: "root", part: "Transport", z: 1 },
      { name: "shadow", bone: "root", part: "TransportShadow", z: 0 }], attachments: {} };
  const animations: Record<string, SkeletonAnimation> = {};
  for (const towing of [false, true]) for (const phase of ["idle", "hit", "death"] as const) {
    const start = (phase === "idle" ? 1 : phase === "hit" ? 2 : 10) + (towing ? 29 : 0);
    const count = phase === "idle" ? 1 : phase === "hit" ? 7 : 20;
    const frames = Array.from({ length: count }, (_, i) => start + i);
    const fps = LEGACY_ANIMATION_FPS, name = transportClipName(phase, towing);
    animations[name] = { name, fps, duration: count / fps, tracks: [],
      ...(phase === "death" ? { finishOnLastFrame: true } : {}),
      // EF checks the incremented frame, after drawing: 21->22 / 51->52.
      events: phase === "death" ? [{ time: (towing ? 12 : 11) / fps, name: "animal_fall" }] : [],
      legacyParts: { body: { fps, frames }, shadow: { fps, frames } },
      slotTracks: definition.slots.map(slot => ({ slot: slot.name, keys: frames.map((frame, i) => {
        const attachment = "original:" + slot.part + ":" + frame;
        definition.attachments![attachment] = { part: slot.part, frame };
        return { time: i / fps, attachment };
      }) })) };
  }
  return { definition, animations };
}
export const originalTransportRig = createOriginalTransportRig();
export function newTransportAnimation(towing = false): TransportAnimation {
  return { frame: towing ? 30 : 1, phase: "idle", towing, done: true };
}
export function startTransportAnimation(a: TransportAnimation, death: boolean, rig = originalTransportRig) {
  // A corpse cannot recoil or restart its fall sound from a late damage callback.
  if (a.phase === "death") return;
  a.phase = death ? "death" : "hit";
  const key = transportClipName(a.phase, a.towing);
  a.playback = createAnimationPlayback(rig.animations[key] ?? originalTransportRig.animations[key]);
  a.done = false;
  // Preserve the currently displayed pose until the next simulation tick.
}
export function advanceTransportAnimation(a: TransportAnimation, dt: number): number {
  const playback = a.playback;
  if (a.done || !playback) return 0;
  advanceAnimationPlayback(playback, dt);
  let sounds = 0;
  for (const cue of playback.events) if (cue.event.name === "animal_fall") sounds++;
  playback.events.length = 0;
  if (!playback.started) return sounds;
  a.frame = (a.phase === "death" ? 10 : 2) + (a.towing ? 29 : 0) + playback.frame - 1;
  a.done = playback.done;
  if (a.done && a.phase === "hit") {
    a.phase = "idle"; a.frame = a.towing ? 30 : 1; a.playback = undefined;
  }
  return sounds;
}
/** Pure render query. Explicit attachments win; old part tracks remain usable. */
export function transportPoseFrames(a: TransportAnimation, rig = originalTransportRig): { body: number; shadow: number } {
  const playback = a.playback;
  // Do not expose the queued reaction before the simulation enters it.
  if (playback && !playback.started) return { body: a.frame, shadow: a.frame };
  const key = transportClipName(a.phase, a.towing);
  const clip = playback?.animation ?? rig.animations[key] ?? originalTransportRig.animations[key];
  const time = playback ? (playback.frame - 1) / clip.fps : 0;
  const pose = sampleSkeletonPose(rig.definition, clip, time);
  const result = { body: a.frame, shadow: a.frame };
  for (const part of ["body", "shadow"] as const) {
    const slot = pose.slots.find(slot => slot.name === part);
    const attachment = slot?.attachment ? pose.attachments[slot.attachment] : undefined;
    result[part] = attachment?.frame ?? pose.legacyParts[part] ?? a.frame;
  }
  return result;
}
