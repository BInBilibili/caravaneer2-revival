/** BattleField.as 4824–4897: fixed directional rocket images / centered bolt lines.
 * Visuals belong to a projectile, not to a render call. No simulation state is advanced here.
 */
import { BitmapObject, Graphics, Sprite } from '../../../../src/core/Display';

export interface ProjectileVisual {
  body: Sprite;
  shadow: Sprite;
  angle: number;
  type: number;
  rocket?: BitmapObject;
  rocketShadow?: BitmapObject;
}
export function createProjectileVisual(): ProjectileVisual {
  const body = new Sprite(), shadow = new Sprite();
  body.mouseEnabled = shadow.mouseEnabled = false;
  return { body, shadow, angle: NaN, type: NaN };
}
/** Screen-space vector excludes camera/viewport translation. */
export function updateProjectileVisual(visual: ProjectileVisual, type: number, angle: number,
  dx: number, dy: number, rocketImage: HTMLImageElement | null | undefined, shadowImage: HTMLImageElement | null | undefined) {
  const changed = visual.type !== type || visual.angle !== angle;
  if (visual.type !== type) {
    visual.body.removeAll(); visual.shadow.removeAll();
    visual.body.graphics = new Graphics(); visual.shadow.graphics = new Graphics();
    visual.rocket = visual.rocketShadow = undefined;
  }
  if (type === 4) {
    if (changed) {
      // AS3 draws into a positive local rectangle, then offsets by half its size.
      // Equivalent centered endpoints, retaining the Web vector-line renderer.
      for (const [sprite, alpha] of [[visual.body, 1], [visual.shadow, .5]] as const) {
        const g = sprite.graphics!; g.clear(); g.lineStyle(1, 0, alpha);
        g.moveTo(-dx / 2, -dy / 2); g.lineTo(dx / 2, dy / 2);
      }
    }
  } else {
    // Direction, not time, selects one of the original sixteen 15×15 images.
    const row = ((Math.round((Math.PI - angle) / (Math.PI / 8)) % 16) + 16) % 16;
    for (const [key, parent, image] of [['rocket', visual.body, rocketImage], ['rocketShadow', visual.shadow, shadowImage]] as const) {
      let bitmap = visual[key];
      if (!image) { if (bitmap) bitmap.visible = false; continue; }
      if (!bitmap) {
        bitmap = new BitmapObject(image); bitmap.mouseEnabled = false;
        bitmap.x = bitmap.y = -7.5; parent.addChild(bitmap); visual[key] = bitmap;
      }
      bitmap.visible = true; bitmap.image = image;
      if (!bitmap.srcRect || bitmap.srcRect.y !== row * 15) bitmap.srcRect = { x: 0, y: row * 15, w: 15, h: 15 };
    }
  }
  visual.type = type; visual.angle = angle;
}
