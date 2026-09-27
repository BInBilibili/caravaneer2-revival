/** Procedural blood is particle motion, not a sprite timeline. No new textures.
 * BattleField.as generateBloodDrop: one dark red pixel, byte-quantized opacity.
 */
import { DisplayObject } from '../../../../src/core/Display';
import type { BloodDrop, BleedingBody } from './BattleBlood';
const XREL = Math.sin(Math.PI / 4), YREL = Math.cos(Math.PI / 4) * .574;
/** Original Interlacing test uses map2Screen coordinates (no camera/viewport offset). */
export function bloodBehindOwner(drop: BloodDrop, owner: BleedingBody): boolean {
  const x = owner.__doll?.walk ? owner.__doll.dispX : owner.x;
  const y = owner.__doll?.walk ? owner.__doll.dispY : owner.y;
  return XREL * (drop.x - drop.y) + YREL * (drop.x + drop.y) - drop.z < x + y;
}
/** One retained draw object per owner/depth side. Reuses the particle array; no
 * Graphics command/fill objects or worldToScreen point allocated for each drop.
 * Camera translation belongs to this display object, not to particle physics.
 */
export class BloodRenderBatch extends DisplayObject {
  readonly drops: BloodDrop[] = [];
  constructor() { super(); this.mouseEnabled = false; }
  renderSelf(ctx: CanvasRenderingContext2D) {
    const alpha = ctx.globalAlpha, fill = ctx.fillStyle;
    ctx.fillStyle = '#600000';
    for (const d of this.drops) {
      ctx.globalAlpha = alpha * d.alpha;
      ctx.fillRect(XREL * (d.x - d.y), YREL * (d.x + d.y) - d.z, 1, 1);
    }
    ctx.globalAlpha = alpha; ctx.fillStyle = fill;
  }
}
