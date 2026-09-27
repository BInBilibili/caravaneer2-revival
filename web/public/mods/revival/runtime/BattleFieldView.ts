// 战场等距渲染（原�?BattleField.as 移植）：
// - 等距投影 map2Screen：xRel=sin45°，yRel=cos45°×0.574（verticalCompression�?// - Ground1 平铺（屏幕空间，静态）+ UnderGrid1-5 装饰（随相机移动�? 菱形网格�?// - Obstacle{type}.png + ObstacleShadow{type}.png（shift 来自 ds.obstacles�?// - 单位：程序化小人（肤�?衣色/裤色/袖型），方向+走路摇摆+阴影
// - 路径星形标记 / 选中六边�?/ 高亮箭头 / 光标 / 血�?/ 弹道与爆炸特效（世界坐标→屏幕）
import { Sprite, Graphics, BitmapObject } from "../../../../src/core/Display";
import { EngineText } from "../../../../src/core/EngineText";
import { Input } from "../../../../src/core/Input";
import { createEffectPlayback, effectFrame, effectSpritePlacement } from './BattleEffectAnimation';
import { BattleBlood, type BleedingBody } from "./BattleBlood";
import { BloodRenderBatch, bloodBehindOwner } from "./BattleBloodVisual";
import { blocksMovement } from "../../../../src/game/BattleObstacles";
import { screenSort } from "../../../../src/game/BattleDepth";
import { newTransportAnimation, transportPoseFrames } from "./BattleTransportAnimation";
import { playSound } from "../../../../src/core/Sound";
import { dollAppearanceFrom, appearanceKey, newDollAnim, cachedDollFrame, weaponAnimType, renderDroppedWeapon, type DollRenderOpts } from "./BattleDoll";
import type { AssetStore } from "../../../../src/core/Assets";
import type { RevivalDataStore as DataStore } from "./Data";
import type { Battle, BattleUnit } from "./Battle";
import { sampleSkeletonPose, skeletonPoseKey, slotMatrix, slotTransform } from "./BattleSkeleton";

export const XREL = Math.sin(Math.PI / 4);            // 0.7071067811865476
export const YREL = Math.cos(Math.PI / 4) * 0.574;    // 0.405916092…（verticalCompression 0.574�?
export const SCREEN_W = 640;   // 原版 BattleField screenWidth
export const SCREEN_H = 445;
export const ANCHOR_X = SCREEN_W / 2;
export const ANCHOR_Y = SCREEN_H / 2;
const CELL = 32;
const MARKS = 0xffffff; // marksColor 默认白（原版 groundMarksShapes 白星�?
/** 世界像素坐标 �?屏幕锚点系（相机位于 ANCHOR�?*/
export function worldToScreen(wx: number, wy: number, camX: number, camY: number) {
  return {
    x: XREL * (wx - camX) - XREL * (wy - camY) + ANCHOR_X,
    y: YREL * (wx - camX) + YREL * (wy - camY) + ANCHOR_Y,
  };
}
export function worldToCell(wx: number, wy: number) {
  return { gx: Math.floor(wx / CELL), gy: Math.floor(wy / CELL) };
}
export function cellCenter(gx: number, gy: number) {
  return { x: (gx + 0.5) * CELL, y: (gy + 0.5) * CELL };
}
/** 相对锚点系的屏幕坐标 �?世界像素坐标 */
export function screenToWorld(sx: number, sy: number, camX: number, camY: number) {
  const mx = sx - ANCHOR_X + XREL * (camX - camY);
  const my = sy - ANCHOR_Y + YREL * (camX + camY);
  const wy = my / (2 * YREL) - mx / (2 * XREL);
  const wx = mx / XREL + wy;
  return { x: wx, y: wy };
}

// ===== 原版 groundMarksShapes 逐字还原（BattleField.as:296,601-624�?====
// 0..5 = 六种方向箭头（单位格内绘制：外框 [0,0][1,0][1,1][0,1] 闭合 + 箭头多边形）�?
// 6 = 五角星（终点可站格）�? = 六边形（当前行动单位选中�?
const MARK_R = 0.5; // 箭头/选中白色填充 alpha（原�?beginFill(marksColor,0.5)�?
const STAR_R = 0.55; // web 原实现五角星填充 alpha（截图基调）
const GROUND_MARK_SHAPES: Array<Array<[number, number]>> = [
  // 0 →（向上/离自己方向）：尖角位于格�?
  [[0,0],[1,0],[1,1],[0,1],[0,0],[0.2,0.5],[0.5,0.2],[0.8,0.5],[0.6,0.5],[0.6,0.8],[0.4,0.8],[0.4,0.5],[0.2,0.5]],
  // 1 →（右上�?
  [[0,0],[1,0],[1,1],[0,1],[0,0],[0.2,0.4],[0.5,0.4],[0.5,0.2],[0.8,0.5],[0.5,0.8],[0.5,0.6],[0.2,0.6],[0.2,0.4]],
  // 2 →（右下�?
  [[0,0],[1,0],[1,1],[0,1],[0,0],[0.4,0.2],[0.6,0.2],[0.6,0.5],[0.8,0.5],[0.5,0.8],[0.2,0.5],[0.4,0.5],[0.4,0.2]],
  // 3 →（左下�?
  [[0,0],[1,0],[1,1],[0,1],[0,0],[0.2,0.5],[0.5,0.2],[0.5,0.4],[0.8,0.4],[0.8,0.6],[0.5,0.6],[0.5,0.8],[0.2,0.5]],
  // 4 = AP 预算边界格（原版 convertAStoPath direction=4；格内小菱形�?
  [[0,0],[1,0],[1,1],[0,1],[0,0],[0.3,0.3],[0.7,0.3],[0.7,0.7],[0.3,0.7],[0.3,0.3]],
  // 5 = 超预算（走不到）格（原版 direction=5；菱形内 X�?
  [[0.2,0.3],[0.3,0.2],[0.5,0.4],[0.7,0.2],[0.8,0.3],[0.6,0.5],[0.8,0.7],[0.7,0.8],[0.5,0.6],[0.3,0.8],[0.2,0.7],[0.4,0.5]],
];
function starShape(): Array<[number, number]> {
  // 原版 groundMarksShapes[6] 构造（BattleField.as Init 601-616）：5 �?外尖0.4/内尖0.2 + 外框 + 回到最后一个内�?
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 5; i++) {
    const a1 = i * Math.PI / 2.5;
    pts.push([0.5 + Math.sin(a1) * 0.4, 0.5 - Math.cos(a1) * 0.4]);
    const a2 = (i + 0.5) * Math.PI / 2.5;
    pts.push([0.5 + Math.sin(a2) * 0.2, 0.5 - Math.cos(a2) * 0.2]);
  }
  pts.push([0,0],[1,0],[1,1],[0,1],[0,0]);
  pts.push([pts[9][0], pts[9][1]]);
  return pts;
}
function hexShape(): Array<[number, number]> {
  // 原版 groundMarksShapes[7]（BattleField.as Init 617-624）：r=0.5 六边形（起点在顶�?
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    pts.push([0.5 + Math.sin(a) * 0.5, 0.5 - Math.cos(a) * 0.5]);
  }
  return pts;
}

export class BattleFieldView {
  b: Battle;
  assets: AssetStore;
  ds: DataStore;
  // 分层（对应原�?Floor / UnderGrid / GroundMarks / Grid / Shadows / OverGrid / Interlacing / TopMarks�?
  floorLayer = new Sprite();
  underLayer = new Sprite();
  bloodLayer = new Sprite();
  gridLayer = new Sprite();
  marksLayer = new Sprite();
  shadowLayer = new Sprite();
  projectileShadowLayer = new Sprite();
  obstacleLayer = new Sprite();
  unitLayer = new Sprite();
  overLayer = new Sprite();
  fxLayer = new Sprite();
  cursorLayer = new Sprite();
  markSprites: Sprite[] = [];
  cursorObj: Sprite | null = null;
  readonly bloodPhysics = new BattleBlood((x, y) => this.stampBlood(x, y));
  readonly bloodAirLayer = new Sprite();
  private readonly unownedBlood = new BloodRenderBatch();
  private readonly bloodBatches = new Map<BleedingBody, { spr: Sprite; back: BloodRenderBatch; front: BloodRenderBatch; visible: boolean }>();
  private readonly bloodBySprite = new Map<Sprite, { back: BloodRenderBatch; front: BloodRenderBatch }>();
  readonly droppedLayer = new Sprite();
  private bloodTiles = new Map<string, { ctx: CanvasRenderingContext2D; data: ImageData; bitmap: BitmapObject; dirty: boolean; minX: number; minY: number; maxX: number; maxY: number }>();
  private dropSprites = new Map<object, BitmapObject>();
  get blood() { return this.bloodPhysics.drops; }
  private underDeco: Array<{ spr: Sprite; wx: number; wy: number }> = [];
  private floorBuildId = 0;
  private wallHits = new Map<object, BitmapObject>();
  wallHit(owner: object, x: number, y: number, outer: boolean) {
    this.b.wallHitAnimations.set(owner, { x, y, outer, playback: createEffectPlayback('ShotSmoke') });
  }
  /** AS3 Visible selection: off-screen attached FX retain their frame until seen again. */
  isEffectOwnerVisible(owner: object, character: boolean): boolean {
    if (character) {
      const u = owner as BattleUnit, a = (u as any).__doll;
      const p = worldToScreen(a?.walk ? a.dispX : u.x, a?.walk ? a.dispY : u.y, this.b.camX, this.b.camY);
      return p.x > -50 && p.x < SCREEN_W + 50 && p.y > -30 && p.y < SCREEN_H + 70;
    }
    const o = owner as { gx: number; gy: number; type: number };
    const wall = this.obstacleSprites.find(s => s.gx === o.gx && s.gy === o.gy && s.type === o.type);
    if (!wall?.body) return false;
    const def = this.ds.obstacles.obstacles[o.type - 1];
    const p = worldToScreen(wall.wx, wall.wy, this.b.camX, this.b.camY);
    const x = p.x + def.shiftX + wall.body.x, y = p.y + def.shiftY + wall.body.y;
    return x + wall.body.width > 0 && y + wall.body.height > 0 && x <= SCREEN_W && y <= SCREEN_H;
  }
  private positionWallHits() {
    for (const [owner, sprite] of this.wallHits) {
      if (!this.b.wallHitAnimations.has(owner)) {
        sprite.parent?.removeChild(sprite); this.wallHits.delete(owner);
      }
    }
    for (const [owner, h] of this.b.wallHitAnimations) {
      const frame = effectFrame(h.playback);
      if (!frame || !this.isEffectOwnerVisible(owner, false)) continue;
      const o = owner as { gx: number; gy: number; type: number };
      const wall = this.obstacleSprites.find(s => s.gx === o.gx && s.gy === o.gy && s.type === o.type);
      if (!wall) continue;
      const img = this.assets.getImage('ShotSmoke.png'); if (!img) continue;
      let sprite = this.wallHits.get(owner);
      if (!sprite) { sprite = new BitmapObject(img); sprite.mouseEnabled = false; this.unitLayer.addChild(sprite); this.wallHits.set(owner, sprite); }
      const p = worldToScreen(h.x, h.y, this.b.camX, this.b.camY);
      const pose = effectSpritePlacement('ShotSmoke', frame, this.ds.battleDoll?.spriteBoundaries?.ShotSmoke?.[0]?.[0]?.[frame])!;
      sprite.srcRect = pose.srcRect; sprite.x = p.x + pose.x; sprite.y = p.y + pose.y;
      const existing = this.unitLayer.children.indexOf(sprite); if (existing >= 0) this.unitLayer.children.splice(existing, 1);
      const index = this.unitLayer.children.indexOf(wall.spr); this.unitLayer.children.splice(index + (h.outer ? 1 : 0), 0, sprite);
    }
  }
  private obstacleSprites: Array<{ spr: Sprite; sh: Sprite; gx: number; gy: number; type: number;
    wx: number; wy: number; solid: boolean; body: BitmapObject | null; mask: ImageData | null }> = [];
  private obstacleOffsets = new WeakMap<object, { x: number; y: number }>();
  private obstacleMasks = new Map<HTMLImageElement, ImageData>();
  private unitSprites: Array<{ spr: Sprite; u: BattleUnit; flame: Sprite | null }> = [];
  private dolls = new Map<BattleUnit, { spr: Sprite; app: any; appKey: string; anim: any; flame: Sprite; lastKey: string; cv: HTMLCanvasElement | null; bodyObj: BitmapObject | null; shadowObj: BitmapObject | null; poseKey?: string }>();
  private transportSprites = new Map<BattleUnit, { spr: Sprite; shadowContainer: Sprite; body: BitmapObject | null; shadow: BitmapObject | null; flame: Sprite | null; lastKey: string }>();

  constructor(b: Battle, assets: AssetStore, ds: DataStore, root: Sprite) {
    this.b = b;
    this.assets = assets;
    this.ds = ds;
    root.addChild(this.floorLayer);
    root.addChild(this.underLayer);
    root.addChild(this.bloodLayer);
    root.addChild(this.droppedLayer);
    root.addChild(this.gridLayer);
    root.addChild(this.marksLayer);
    this.shadowLayer.alpha = 0.5; // Original Shadows container opacity, shared by all elevated objects.
    root.addChild(this.shadowLayer);
    root.addChild(this.projectileShadowLayer);
    root.addChild(this.obstacleLayer); // Original OverGrid: walkable decorations above shadows.
    root.addChild(this.unitLayer); // Obstacles and living bodies share the original depth order.
    root.addChild(this.bloodAirLayer);
    this.bloodAirLayer.addChild(this.unownedBlood);
    root.addChild(this.overLayer);
    root.addChild(this.fxLayer);
    root.addChild(this.cursorLayer);
  }

  get size() { return this.b.fieldPx; }

  /** 静态内容：地面贴图 + 网格�?+ UnderGrid 装饰精确定位（原�?Init�?*/
  buildStatic() {
    // 地面：世界系 450x260 无缝平铺（覆盖整�?+ 相机半屏边距），整层随相机取模平�?
    this.floorLayer.removeAll();
    const size = this.size;
    const img = this.assets.getImage("Ground1.png");
    if (img) this.buildFloorTiles(img, size);
    else void this.assets.ensure("Ground1.png").then((loaded) => {
      if (loaded) this.buildFloorTiles(loaded, this.size);
    });
    this.buildGrid();
    // UnderGrid 装饰：random(gridW*H/40, gridW*H/20) 个，随机世界坐标，图片居�?
    this.underLayer.removeAll();
    this.underDeco = [];
    const field = this.b.fieldSize;
    const n = Math.round(field * field / 40 + Math.random() * ((field * field / 20) - (field * field / 40)));
    for (let i = 0; i < n; i++) {
      const type = 1 + Math.floor(Math.random() * 5);
      const img = this.assets.getImage("UnderGrid" + type + ".png");
      if (!img) continue;
      const spr = new Sprite();
      const bo = new BitmapObject(img);
      bo.mouseEnabled = false;
      spr.addChild(bo);
      const wx = Math.random() * this.size;
      const wy = Math.random() * this.size;
      spr.x = 0; spr.y = 0;
      const off = { spr, wx, wy };
      this.underDeco.push(off);
      this.underLayer.addChild(spr);
    }
    this.positionUnder();
    this.syncLayers();
  }

  /** Ground1 不是无缝纹理；用镜像重复生成 2x2 图案，消除大块十字接缝�?*/
  private buildFloorTiles(img: HTMLImageElement, size: number) {
    const id = ++this.floorBuildId;
    const w = img.naturalWidth || 450;
    const h = img.naturalHeight || 260;
    const cv = document.createElement("canvas");
    cv.width = w * 2; cv.height = h * 2;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        ctx.save();
        ctx.translate(col ? w * 2 : 0, row ? h * 2 : 0);
        ctx.scale(col ? -1 : 1, row ? -1 : 1);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
      }
    }
    const seamless = new Image();
    seamless.onload = () => {
      if (id !== this.floorBuildId) return;
      this.floorLayer.removeAll();
      for (let x0 = -w * 2; x0 <= size + w * 2; x0 += w * 2) {
        for (let y0 = -h * 2; y0 <= size + h * 2; y0 += h * 2) {
          const t = new BitmapObject(seamless);
          t.x = x0; t.y = y0; t.mouseEnabled = false;
          this.floorLayer.addChild(t);
        }
      }
    };
    seamless.src = cv.toDataURL("image/png");
  }

  buildGrid() {
    this.gridLayer.removeAll();
    const g = new Graphics();
    g.lineStyle(1, 0, 0.1);
    const n = this.b.fieldSize;
    for (let i = 0; i <= n; i++) {
      // 世界系菱形网格（cam=0 基准；整层由 syncLayers 随相机平移）
      const a = worldToScreen(i * CELL, 0, 0, 0);
      const c = worldToScreen(i * CELL, n * CELL, 0, 0);
      g.moveTo(a.x, a.y); g.lineTo(c.x, c.y);
      const d = worldToScreen(0, i * CELL, 0, 0);
      const e = worldToScreen(n * CELL, i * CELL, 0, 0);
      g.moveTo(d.x, d.y); g.lineTo(e.x, e.y);
    }
    const spr = new Sprite();
    spr.graphics = g;
    spr.mouseEnabled = false;
    this.gridLayer.addChild(spr);
  }
  positionUnder() {
    const cam = { x: this.b.camX, y: this.b.camY };
    for (const d of this.underDeco) {
      const p2 = worldToScreen(d.wx, d.wy, cam.x, cam.y);
      d.spr.x = p2.x;
      d.spr.y = p2.y;
    }
  }

  /** 世界系图形层整体位移（原�?MobilePart 平移）：floor/under/grid/blood 用同一偏移保持�?marks/obstacles/units 对齐 */
  syncLayers() {
    const cam = { x: this.b.camX, y: this.b.camY };
    const o = worldToScreen(0, 0, cam.x, cam.y);
    const dx = o.x - ANCHOR_X;
    const dy = o.y - ANCHOR_Y;
    this.floorLayer.x = dx; this.floorLayer.y = dy;
    // underLayer 子项（UnderGrid 装饰/血渍印记）�?positionUnder/renderBlood 逐帧绝对定位，不再整体平�?
    // （否则与 positionUnder �?worldToScreen 叠加 = 双倍位�?�?污渍/碎石像飘在天上不同层�?
    this.underLayer.x = 0; this.underLayer.y = 0;
    this.gridLayer.x = dx;  this.gridLayer.y = dy;
    this.bloodLayer.x = dx; this.bloodLayer.y = dy;
  }

  /** 障碍物：重建（相�?障碍集合变化时） */
  rebuildObstacles() {
    for (const o of this.obstacleSprites) {
      o.spr.parent?.removeChild(o.spr);
      o.sh.parent?.removeChild(o.sh);
    }
    this.obstacleSprites = [];
    for (const o of this.b.obstacles) {
      const def = this.ds.obstacles?.obstacles?.[o.type - 1];
      if (!def) continue;
      const img = this.assets.getImage("Obstacle" + o.type + ".png");
      const shadow = this.assets.getImage("ObstacleShadow" + o.type + ".png");
      const bounds = this.ds.battleDoll?.spriteBoundaries;
      if (!bounds?.ObstacleShadow?.[o.type]) continue;
      const solid = blocksMovement(def);
      let offset = this.obstacleOffsets.get(o);
      if (!offset) {
        offset = solid ? { x: 0.5, y: 0.5 } : { x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6 };
        this.obstacleOffsets.set(o, offset);
      }
      const spr = new Sprite(), sh = new Sprite();
      spr.mouseEnabled = sh.mouseEnabled = false;
      const bitmap = (image: HTMLImageElement | null, part: string, parent: Sprite) => {
        if (!image) return null;
        const b = new BitmapObject(image), r = bounds?.[part]?.[o.type]?.[0]?.[1];
        if (r) {
          // Extracted PNGs are full frames; crop and offset together, exactly like getSprite.
          b.srcRect = { x: r.x, y: r.y, w: r.width, h: r.height };
          b.x = r.x; b.y = r.y;
        }
        b.mouseEnabled = false;
        parent.addChild(b);
        return b;
      };
      const body = bitmap(img, "Obstacle", spr);
      bitmap(shadow, "ObstacleShadow", sh);
      let mask: ImageData | null = null;
      if (solid && img && body) {
        mask = this.obstacleMasks.get(img) ?? null;
        if (!mask) {
          const cv = document.createElement("canvas");
          cv.width = body.width; cv.height = body.height;
          const ctx = cv.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            const r = body.srcRect;
            if (r) ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
            else ctx.drawImage(img, 0, 0);
            mask = ctx.getImageData(0, 0, cv.width, cv.height);
            this.obstacleMasks.set(img, mask);
          }
        }
      }
      if (solid) {
        this.shadowLayer.addChild(sh);
        this.unitLayer.addChild(spr);
      } else {
        sh.alpha = 0.5;
        this.obstacleLayer.addChild(sh);
        this.obstacleLayer.addChild(spr);
      }
      this.obstacleSprites.push({ spr, sh, gx: o.gx, gy: o.gy, type: o.type,
        wx: (o.gx + offset.x) * CELL, wy: (o.gy + offset.y) * CELL, solid, body, mask });
    }
    this.positionObstacles();
  }

  positionObstacles() {
    for (const o of this.obstacleSprites) {
      const def = this.ds.obstacles.obstacles[o.type - 1];
      const p = worldToScreen(o.wx, o.wy, this.b.camX, this.b.camY);
      o.spr.x = o.sh.x = p.x + def.shiftX;
      o.spr.y = o.sh.y = p.y + def.shiftY;
    }
  }

  /** Original BitmapData.hitTest threshold 2: transparent pixels and shadows do not trigger fading. */
  updateObstacleHover(mx: number, my: number) {
    for (const o of this.obstacleSprites) {
      if (!o.solid || !o.body || !o.mask) continue;
      const x = Math.floor(mx - o.spr.x - o.body.x), y = Math.floor(my - o.spr.y - o.body.y);
      const hit = mx >= 0 && my >= 0 && x >= 0 && y >= 0 && x < o.mask.width && y < o.mask.height
        && o.mask.data[(y * o.mask.width + x) * 4 + 3] >= 2;
      o.spr.alpha = hit ? 0.7 : 1;
    }
  }

  private ensureDollSprite(u: BattleUnit): Sprite {
    let e = this.dolls.get(u);
    if (!e) {
      const chLike: any = u.character ?? (u as any).appearance ?? u;
      const app = dollAppearanceFrom(chLike);
      const anim = newDollAnim(weaponAnimType(this.ds.weapons, u.weaponSub ?? 0), u.weaponSub ?? 0, u.facing ?? 1);
      const appKey = appearanceKey(app);
      const spr = new Sprite();
      const flame = new Sprite();
      const fimg = this.assets.getImage("BodyBurn.png");
      if (fimg) {
        const fb = new BitmapObject(fimg);
        fb.srcRect = { x: 0, y: 0, w: 100, h: 100 };
        fb.scaleX = 0.71; fb.scaleY = 0.71; fb.x = -35; fb.y = -70;
        fb.mouseEnabled = false;
        flame.addChild(fb);
      } else {
        const fg = new Graphics();
        fg.beginFill(0xff5020, 0.5);
        fg.drawCircle(0, -10, 10);
        flame.graphics = fg;
      }
      flame.visible = false;
      flame.mouseEnabled = false;
      spr.addChild(flame);
      this.unitLayer.addChild(spr);
      e = { spr, app, appKey, anim, flame, lastKey: "", cv: null, bodyObj: null, shadowObj: null };
      this.dolls.set(u, e);
      this.unitSprites.push({ spr, u, flame });
      (u as any).__doll = anim;
      (u as any).__dollApp = app;
      return spr;
    }
    return e.spr;
  }

  private ensureTransportSprite(u: BattleUnit): Sprite {
    let e = this.transportSprites.get(u);
    if (e) return e.spr;
    const spr = new Sprite();
    const shadow = new Sprite();
    const flame = new Sprite();
    const flameImg = this.assets.getImage("BodyBurn.png");
    if (flameImg) {
      const fb = new BitmapObject(flameImg);
      fb.srcRect = { x: 0, y: 0, w: 100, h: 100 };
      fb.scaleX = fb.scaleY = 0.65;
      fb.x = -32; fb.y = -60;
      fb.mouseEnabled = false;
      flame.addChild(fb);
    }
    flame.visible = false;
    flame.mouseEnabled = false;
    this.shadowLayer.addChild(shadow);
    spr.addChild(flame);
    this.unitLayer.addChild(spr);
    e = { spr, shadowContainer: shadow, body: null, shadow: null, flame, lastKey: "" };
    this.transportSprites.set(u, e);
    this.unitSprites.push({ spr, u, flame });
    return spr;
  }

  private updateTransport(u: BattleUnit, dt: number, _animTime: number) {
    const e = this.transportSprites.get(u);
    if (!e) return;
    const type = u.transportType ?? 1;
    const def: any = this.ds.transports?.Types?.[type] ?? {};
    const frameW = Number(def.imageWidth ?? 100), frameH = Number(def.imageHeight ?? 100);
    const animation = u.transportAnimation ??= newTransportAnimation(u.transportKind === "animal" && !!u.transportRef?.cart);
    // Transport timing and sounds are also owned by Battle.updateFrame.
    const frames = u.transportKind === "animal" ? transportPoseFrames(animation, this.ds.battleSkeleton?.transport) : { body: 1, shadow: 1 };
    const dir = u.facing ?? 0;
    const image = this.assets.getImage("Transport" + type + ".png");
    const shadow = this.assets.getImage("TransportShadow" + type + ".png");
    const key = [type, dir, frames.body, frames.shadow, !!image, !!shadow].join("|");
    if (e.lastKey !== key) {
      for (const [part, img, prop] of [["Transport", image, "body"], ["TransportShadow", shadow, "shadow"]] as const) {
        if (!img) continue;
        let bitmap = e[prop];
        if (!bitmap) {
          bitmap = new BitmapObject(img); bitmap.mouseEnabled = false;
          e[prop] = bitmap;
          if (prop === "shadow") e.shadowContainer.addChild(bitmap); else e.spr.addChildAt(bitmap,0);
        }
        const frame = frames[prop];
        const bounds = (this.ds.battleDoll as any)?.spriteBoundaries?.[part]?.[type]?.[dir]?.[frame];
        const x = bounds?.x ?? 0, y = bounds?.y ?? 0;
        bitmap.image = img;
        bitmap.srcRect = { x: dir * frameW + x, y: (frame - 1) * frameH + y, w: bounds?.width ?? frameW, h: bounds?.height ?? frameH };
        bitmap.scaleX = bitmap.scaleY = 1;
        bitmap.x = -frameW / 2 + x;
        bitmap.y = -frameH / 2 - 20 + Number(def.yCorrection ?? 0) + y;
      }
      if (e.body) e.spr.graphics = null;
      e.lastKey = key;
    }
    // Deployment stores the bottom-right footprint cell, as in BattleField.placeTransport.
    const { width, height } = u.transportFootprint ?? { width: 1, height: 1 };
    const gx = dir === 1 ? u.squareX : dir === 3 ? u.squareX - width + 1 : Math.ceil(u.squareX - width / 2);
    const gy = dir === 2 ? u.squareY : dir === 0 ? u.squareY - height + 1 : Math.ceil(u.squareY - height / 2);
    const p = worldToScreen((gx + 0.5) * CELL, (gy + 0.5) * CELL, this.b.camX, this.b.camY);
    e.spr.x = p.x; e.spr.y = p.y; e.spr.alpha = 1;
    e.spr.visible = !(u as any).__hidden;
    e.shadowContainer.x=p.x; e.shadowContainer.y=p.y; e.shadowContainer.visible=e.spr.visible;
    if (e.flame) e.flame.visible = false; // AS3 BodyBurn is Character-only.
  }

  /** 原版阴影帧：Shadows1 图集 shadow �?*/
  private updateShadowFrame(u: BattleUnit, e: any, anim: any, legacyShadowFrame?: number, opts?: DollRenderOpts, poseKey?: string): boolean {
    const sample = opts?.skeleton?.sample;
    const slot = sample?.slots.find(s => s.part === "Shadows");
    const matrix = sample && slot ? slotMatrix(sample, slot, anim.dir) : null;
    const rigged = sample?.drawOrder === "slots" || (sample && slot && matrix && (
      slot.attachment !== undefined || slot.visible === false || sample.bones[slot.bone].alpha !== 1 ||
      (slotTransform(slot, anim.dir).alpha ?? 1) !== 1 || matrix.a !== 1 || matrix.b !== 0 ||
      matrix.c !== 0 || matrix.d !== 1 || matrix.tx !== 0 || matrix.ty !== 0));
    if (!e.shadowObj) {
      const image = rigged && opts ? cachedDollFrame({ ...opts, renderLayer: "shadow" }, e.appKey) : this.assets.getImage("Shadows1.png");
      if (!image) return false;
      const shp = new Sprite(), sbo = new BitmapObject(image as any);
      sbo.srcRect = { x: 0, y: 0, w: 1, h: 1 };
      sbo.mouseEnabled = false; shp.addChild(sbo);
      (shp as any).__dollShadow = true;
      this.shadowLayer.addChild(shp); e.shadowObj = sbo;
    }
    if (rigged && opts) {
      const key = poseKey ?? skeletonPoseKey(opts.skeleton!.definition, opts.skeleton!.animation, opts.skeleton!.time) + ":" + anim.dir + ":" + anim.animType + ":" + anim.phase + ":" + anim.frame;
      if (e.shadowRigKey !== key) {
        const cv = cachedDollFrame({ ...opts, renderLayer: "shadow" }, e.appKey);
        if (!cv) return false;
        e.shadowObj.image = cv;
        e.shadowObj.srcRect = { x: 0, y: 0, w: cv.width, h: cv.height };
        e.shadowObj.x = -50; e.shadowObj.y = -70;
        e.shadowRigKey = key;
      }
      return true;
    }
    e.shadowRigKey = undefined;
    const data = this.ds.battleDoll;
    const img = this.assets.getImage("Shadows1.png");
    if (!data || !img) return false;
    const frames = data.fullAnimationTypeFrames?.[anim.animType]?.[anim.phase];
    if (!frames) return false;
    const fm = frames[Math.max(0, Math.min(Math.floor(anim.frame) - 1, frames.length - 1))];
    const sf = legacyShadowFrame ?? fm?.shadow ?? 1;
    const bnd = data.spriteBoundaries?.["Shadows"]?.["1"]?.[String(anim.dir)]?.[String(sf)];
    if (!bnd) return false;
    const dim = data.spriteDimensions?.["Shadows"]?.["1"];
    if (!dim) return false;
    const over = (sf - 1) >= 80;
    const col = over ? anim.dir + 4 : anim.dir;
    const row = over ? sf - 81 : sf - 1;
    e.shadowObj.image = img;
    e.shadowObj.srcRect = { x: col * dim.width + bnd.x, y: row * dim.height + bnd.y, w: bnd.width, h: bnd.height };
    e.shadowObj.x = -50 + bnd.x; e.shadowObj.y = -70 + bnd.y;
    return true;
  }

  /** 每帧刷新纸娃娃（Battle 驱动 state；这里仅重建位图缓存 + 定位�?*/
  updateDoll(u: BattleUnit, dt: number, animTime: number) {
    const e = this.dolls.get(u);
    if (!e) return;
    const state = (u as any).__doll;
    if (!state || !this.ds.battleDoll) return;
    // Rendering never advances the simulation, even when called repeatedly at dt=0.
    const anim = state.phase === 0 || state.phase === 1
      ? { ...state, animType: weaponAnimType(this.ds.weapons, u.weaponSub ?? 0), weaponSub: u.weaponSub ?? 0 }
      : state;
    const frame = Math.max(1, Math.floor(anim.frame) || 1);
    const baseName = ["idle", "walk", "shoot", "hit", "death"][anim.phase];
    const clips = this.ds.battleSkeleton?.animations;
    const clip = (anim.phase !== 0 ? anim.playback?.animation : undefined) ?? clips?.[baseName + "_" + anim.animType] ?? clips?.[baseName];
    // Use the driver's authoritative original frame, including walk speed and
    // short part tracks held at their final pose. No second animation clock.
    const time = (frame - 1) / (clip?.fps || 25);
    const rig = clip && this.ds.battleSkeleton ? this.ds.battleSkeleton.definition : undefined;
    const key = e.appKey + "|" + anim.animType + "|" + anim.phase + "|" + frame + "|" + anim.dir + "|" + anim.weaponSub
      + (rig && clip ? "|sk:" + skeletonPoseKey(rig, clip, time) : "");
    // Original pose selection only changes on a 25 FPS animation frame. Camera,
    // visibility and attached effects still update on every display refresh.
    // Do not mark a pose ready until BOTH body and shadow assets are available.
    const custom = this.b.opts.unitVisual?.(u, anim, animTime);
    if (custom) {
      if (!e.bodyObj) {e.bodyObj=new BitmapObject(custom as any);e.bodyObj.mouseEnabled=false;(e.bodyObj as any).__dollLayer=true;e.bodyObj.x=-50;e.bodyObj.y=-70;e.spr.addChildAt(e.bodyObj,0);}
      e.bodyObj.image=custom as any;e.bodyObj.srcRect={x:0,y:0,w:custom.width,h:custom.height};e.cv=custom;
      // Custom frame owns its shadow. Keep normal actors on the original two-layer path.
      if(e.shadowObj)e.shadowObj.visible=false;
      e.poseKey=undefined;e.lastKey='';
    } else if (e.poseKey !== key) {
      // A partial update may replace only one layer. Never reuse old readiness
      // if the driver returns to its previous pose while assets are pending.
      e.poseKey = undefined;
      const skeleton = rig && clip ? {
        definition: rig, animation: clip, time, sample: sampleSkeletonPose(rig, clip, time),
      } : undefined;
      const opts = { assets: this.assets, data: this.ds.battleDoll, appearance: e.app,
        animType: anim.animType, phase: anim.phase, frame, dir: anim.dir, weaponSub: anim.weaponSub, skeleton };
      if (e.lastKey !== key) {
        const cv = cachedDollFrame(opts as any, e.appKey);
        if (cv) {
          // BattleField.as 2830-2853 registration; retained Web display object.
          let bo = e.bodyObj;
          if (!bo) {
            bo = new BitmapObject(cv as any); bo.mouseEnabled = false;
            (bo as any).__dollLayer = true;
            bo.x = -50; bo.y = -70;
            bo.srcRect = { x: 0, y: 0, w: cv.width, h: cv.height };
            e.bodyObj = bo;
            e.spr.addChildAt(bo, 0);
          } else {
            bo.image = cv as any;
            bo.srcRect!.w = cv.width; bo.srcRect!.h = cv.height;
          }
          e.cv = cv; e.lastKey = key;
        }
      }
      if(e.shadowObj)e.shadowObj.visible=true;
      const shadowReady = this.updateShadowFrame(u, e, anim, skeleton?.sample.legacyParts.shadow, opts, key);
      if (e.lastKey === key && shadowReady) e.poseKey = key;
    }
    const wx = anim.walk ? anim.dispX : u.x;
    const wy = anim.walk ? anim.dispY : u.y;
    const cam = { x: this.b.camX, y: this.b.camY };
    const p2 = worldToScreen(wx, wy, cam.x, cam.y);
    // Battle owns gameplay/sound events. Original weapon sprites already carry
    // their firing frames; do not add a render-rate-dependent flash overlay.
    const moving = !!anim.walk;
    const bob = 0; // Original paper-doll frames already contain the walk bob.
    e.spr.x = p2.x;
    e.spr.y = p2.y + bob;
    e.spr.visible = !anim.hidden;
    const shadow = e.shadowObj?.parent;
    if (shadow) { shadow.x=e.spr.x; shadow.y=e.spr.y; shadow.visible=e.spr.visible; }
    const flame = e.flame;
    flame.visible = u.burning > 0 && !u.dead && !u.dying && anim.phase !== 4 && this.isEffectOwnerVisible(u, true) && !!effectFrame(u.burnPlayback);
    void dt; void animTime;
  }

  createUnit(u: BattleUnit): Sprite {
    return u.isTransport ? this.ensureTransportSprite(u) : this.ensureDollSprite(u);
  }

  positionUnits(dt: number, animTime: number) {
    for (const e of this.unitSprites) {
      if (e.u.isTransport) this.updateTransport(e.u, dt, animTime);
      else this.updateDoll(e.u, dt, animTime);
      let flame = e.flame?.children.find(c => c instanceof BitmapObject) as BitmapObject | undefined;
      if (!flame && e.flame) {
        const img = this.assets.getImage("BodyBurn.png");
        if (img) {
          flame = new BitmapObject(img); flame.mouseEnabled = false;
          flame.srcRect = { x: 0, y: 0, w: 100, h: 100 };
          e.flame.graphics = null; e.flame.addChild(flame);
        }
      }
      if (flame && e.flame?.visible) {
        const frame = effectFrame(e.u.burnPlayback);
        const pose = effectSpritePlacement('BodyBurn', frame, this.ds.battleDoll?.spriteBoundaries?.BodyBurn?.[0]?.[0]?.[frame])!;
        flame.srcRect = pose.srcRect;
        flame.x = pose.x; flame.y = pose.y;
        flame.scaleX = flame.scaleY = 1;
        // Flames must remain in front of the retained body bitmap.
        if (e.spr.children[e.spr.children.length - 1] !== e.flame) {
          e.spr.removeChild(e.flame!); e.spr.addChild(e.flame!);
        }
      }
    }
    const corpses = this.unitSprites.filter(e => e.u.dead && !e.u.isTransport);
    const objects = this.unitSprites.filter(e => !e.u.dead || e.u.isTransport).map(e => ({
      spr: e.spr, x: (e.u as any).__doll?.walk ? (e.u as any).__doll.dispX : e.u.x, y: (e.u as any).__doll?.walk ? (e.u as any).__doll.dispY : e.u.y,
      width: e.u.transportFootprint?.width ?? 1, height: e.u.transportFootprint?.height ?? 1,
    }));
    for (const o of this.obstacleSprites) {
      if (!o.solid) continue;
      const def = this.ds.obstacles?.obstacles?.[o.type - 1];
      objects.push({ spr: o.spr, x: o.wx, y: o.wy, width: def?.width ?? 1, height: def?.height ?? 1 });
    }
    this.unitLayer.children = [...corpses.map(e => e.spr), ...screenSort(objects).map(e => e.spr)];
    this.positionWallHits();
    const order = new Map(this.unitLayer.children.map((s, i) => [s, i]));
    this.unitSprites.sort((a, b) => order.get(a.spr)! - order.get(b.spr)!);
  }

  /** 原版先对角色 Bitmap 做像素级 hitTest，再回退到角色所在格�?*/
  unitAtScreen(mx: number, my: number): BattleUnit | null {
    for (let i = this.unitSprites.length - 1; i >= 0; i--) {
      const entry = this.unitSprites[i];
      if (!entry.spr.visible || entry.u.dead) continue;
      if (entry.u.isTransport) {
        const t = this.transportSprites.get(entry.u);
        const body = t?.body;
        if (body?.srcRect) {
          const lx = mx - entry.spr.x - body.x, ly = my - entry.spr.y - body.y;
          if (lx >= 0 && ly >= 0 && lx < body.srcRect.w && ly < body.srcRect.h) return entry.u;
        } else if (Math.abs(mx - entry.spr.x) < 20 && Math.abs(my - entry.spr.y) < 15) return entry.u;
        continue;
      }
      const doll = this.dolls.get(entry.u);
      const cv = doll?.cv;
      const lx = Math.floor(mx - entry.spr.x + 50);
      const ly = Math.floor(my - entry.spr.y + 70);
      if (!cv || lx < 0 || ly < 0 || lx >= cv.width || ly >= cv.height) continue;
      try {
        if ((cv.getContext("2d")?.getImageData(lx, ly, 1, 1).data[3] ?? 0) > 2) return entry.u;
      } catch {
        if (lx >= 25 && lx <= 75 && ly >= 10 && ly <= 100) return entry.u;
      }
    }
    return null;
  }

  /** 路径标记：原�?groundMarksShapes 逐格标记（方向箭�?预算边界/超预�?终点星）+ 当前单位六边�?*/
  setPathMarks(cells: Array<{ x: number; y: number; direction?: number }>, sel: { x: number; y: number } | null) {
    this.marksLayer.removeAll();
    this.markSprites = [];
    const cam = { x: this.b.camX, y: this.b.camY };
    if (sel) this.addMark(hexShape(), sel.x, sel.y, cam, MARKS, MARK_R, 7, true);
    for (const c of cells) {
      const d = c.direction ?? 6;
      const poly = d >= 0 && d < GROUND_MARK_SHAPES.length ? GROUND_MARK_SHAPES[d] : starShape();
      this.addMark(poly, c.x, c.y, cam, MARKS, d >= 4 ? 0.6 : MARK_R, d);
    }
  }

  /** groundMarksShapes 的“符号”子路径（去掉外�?[0,0][1,0][1,1][0,1][0,0]）：
   *  0..3 箭头头�? 预算菱形�? 超预�?X（无外框整段）�? 五角星前 10 �?*/
  private glyphOf(poly: Array<[number, number]>, d: number): Array<[number, number]> {
    if (d === 6) return poly.slice(0, 10);
    if (d === 5) return poly; // X 本身即符号（无外框）
    // 0..4：外�?5 点后是符号轮廓（闭合点重复一次，去掉末尾重复�?
    const g = poly.slice(5);
    if (g.length > 1 && g[g.length - 1][0] === g[0][0] && g[g.length - 1][1] === g[0][1]) g.pop();
    return g;
  }
  /** 路径标记：淡白整�?+ 白色空心符号线稿（原版视觉：格内有方向箭�?预算/终点星的轮廓�?   *  不是纯白实心格） */
  private addMark(poly: Array<[number, number]>, gx: number, gy: number, cam: { x: number; y: number }, color: number, alpha: number, d = 6, selected = false) {
    const g = new Graphics();
    const c8 = "#" + (color >>> 0).toString(16).padStart(6, "0");
    // 1) 整格淡白填充（原�?beginFill(marksColor,0.5) 的弱化版：太实会盖住符号�?.5 效果由符号补足）
    const frame = [[0,0],[1,0],[1,1],[0,1],[0,0]];
    const fpts: Array<{ x: number; y: number }> = [];
    for (const [u, v] of frame) { const p2 = worldToScreen((gx + u) * CELL, (gy + v) * CELL, cam.x, cam.y); fpts.push({ x: p2.x, y: p2.y }); }
    if (selected) {
      const hpts = poly.map(([u, v]) => { const p2 = worldToScreen((gx + u) * CELL, (gy + v) * CELL, cam.x, cam.y); return { x: p2.x, y: p2.y }; });
      g.polySub(hpts, { c: c8, a: 0.5 }, null);
    } else {
      const glyph = this.glyphOf(poly, d);
      const gpts: Array<{ x: number; y: number }> = [];
      for (const [u, v] of glyph) { const p2 = worldToScreen((gx + u) * CELL, (gy + v) * CELL, cam.x, cam.y); gpts.push({ x: p2.x, y: p2.y }); }
      if (d === 5) {
        // 原版 direction=5 只有填充 X 形状，没有整格背景�?
        g.polySub(gpts, { c: c8, a: 0.5 }, null);
      } else if (gpts.length >= 2) {
        g.polyCompound([fpts, gpts], { c: c8, a: 0.5 }, null);
      } else {
        g.polySub(fpts, { c: c8, a: 0.5 }, null);
      }
    }
    // 2) 空心符号线稿（白描边，箭�?菱形/X/五角星）
    const legacyGlyph = selected ? [] : this.glyphOf(poly, d);
    if (false && legacyGlyph.length >= 2) {
      const gpts: Array<{ x: number; y: number }> = [];
      for (const [u, v] of legacyGlyph) { const p2 = worldToScreen((gx + u) * CELL, (gy + v) * CELL, cam.x, cam.y); gpts.push({ x: p2.x, y: p2.y }); }
      // 原版 GroundMarks 是实心图形；箭头、星标和 AP 边界不能只画轮廓�?
      g.polySub(gpts, null, { w: 1.6, c: c8, a: 0.95 });
    }
    const s = new Sprite();
    s.graphics = g;
    s.mouseEnabled = false;
    this.marksLayer.addChild(s);
    this.markSprites.push(s);
    void alpha;
  }
  /** 高亮箭头：当前行动单位头顶（原版 Float�?*/
  positionFloat(dt: number, animTime: number) {
    this.overLayer.removeAll();
    const hover = this.b.hoverPreview;
    if (hover.active && this.b.inControl()) {
      const label = hover.cost + " " + this.b.text(1095).toUpperCase() +
        (hover.reachable ? "" : " (" + this.b.text(63) + ")");
      // BattleField.as:695,3949-4007: 12px, black on 80% white, +14/+8 padding.
      const text = new EngineText(label, 0x000000, 12, "center");
      text.verticalAlign = "middle";
      const boxW = text.textWidth + 14, boxH = text.textHeight + 8;
      const x = Input.mouseX + 30 + boxW <= 640
        ? Input.mouseX + 30 : Input.mouseX - text.textWidth - 24;
      const y = Input.mouseY - text.textHeight / 2 + 7;
      const bg = new Graphics();
      bg.beginFill(0xffffff, 0.8);
      bg.lineStyle(1, 0x000000, 1);
      bg.drawRect(x, y, boxW, boxH);
      bg.mouseEnabled = false;
      this.overLayer.addChild(bg);
      // Flash's text inset is replaced by explicit symmetric Canvas padding.
      text.x = x + 7;
      text.y = y + 4;
      text.mouseEnabled = false;
      this.overLayer.addChild(text);
    }
    void dt;
  }

  /** 原版光标位图（decompiled sprites DefineSprite_96x/1.png 白描边游标）；无图回�?Graphics 向量近似 */
  private cursorBitmap(name: string, dx: number, dy: number, scale = 1): Sprite | null {
    const img = this.assets.getImage(name + ".png");
    if (!img) return null;
    const b = new BitmapObject(img);
    b.mouseEnabled = false;
    b.scaleX = b.scaleY = scale;
    b.x = dx; b.y = dy;
    const s = new Sprite();
    s.addChild(b);
    s.mouseEnabled = false;
    return s;
  }
  private cursorFrom(part: Sprite, mode: string): Sprite {
    const modeNames: Record<string, string> = { ground: "CursorGroundTarget", feet: "CursorFeet", target: "CursorTarget", heal: "CursorHeal", hand: "CursorHand", unavailable: "CursorUnavailable" };
    const nm = modeNames[mode];
    if (!nm) return part;
    const anchors: Record<string, [number, number]> = {
      // 原版注册点：Feet/Hand 尖端朝左上、Target/Heal 中心、Unavailable 中心
      CursorGroundTarget: [8, 8], CursorFeet: [1, 1], CursorTarget: [9, 9], CursorHeal: [11, 11],
      CursorHand: [10, 7], CursorUnavailable: [8.5, 8.5],
    };
    const [ax, ay] = anchors[nm];
    const bmp = this.cursorBitmap(nm, -ax, -ay, 1);
    if (bmp) {
      bmp.x = part.x;
      bmp.y = part.y;
      return bmp;
    }
    return part;
  }

  /** 悬停格图标模式判定（�?updateCursor / HUD 复用�?*/
  hoverModeAt(gx: number, gy: number, pointedUnit: BattleUnit | null = null): string {
    const b = this.b;
    if (!b.inControl()) return "native";
    const cur = b.order[b.turnIdx];
    if (cur && b.phase === "player" && !b.gameOver && !cur.dead && cur.side === 0) {
      const groundOnly = b.shiftPressed;
      const grenadeTarget = b.weaponCategory(cur) === 5 && !groundOnly && !b.healingMode;
      // 贴图像素命中优先于格子回退：命中友军时绝不能穿透到其后方的敌人格�?
      const foe = !grenadeTarget && !groundOnly && pointedUnit
        ? (pointedUnit.side !== cur.side ? pointedUnit : null)
        : !grenadeTarget && !groundOnly
          ? b.units.find((u) => !u.dead && u.side !== cur.side && u.squareX === gx && u.squareY === gy)
          : null;
      const ally = pointedUnit?.side === cur.side
        ? pointedUnit
        : b.units.find((u) => !u.dead && u.side === cur.side && u.squareX === gx && u.squareY === gy);
      if (foe) return "target";
      if (pointedUnit === cur) return "native";
      if (b.healingMode && !groundOnly) return ally && ally.bleeding >= 0.5 ? "heal" : "unavailable";
      if (ally) return "native";
      if (cur.squareX === gx && cur.squareY === gy) return "native";
      if (b.map[gy * b.fieldSize + gx]) return "unavailable";
      if (b.ctrlPressed) return "unavailable";
      if (grenadeTarget) return "ground";
      return "feet";
    }
    return "native";
  }

  /** 光标：原�?CursorHand/Target/Feet/Unavailable/Heal/GroundTarget（位图优先，缺失回落近似�?*/
  updateCursor(mx: number, my: number) {
    const nativeCursor = (globalThis as any);
    if (mx < 0 || my < 0 || mx >= 640 || my >= 445) {
      nativeCursor.__c2HideNativeCursor = false;
      this.cursorLayer.removeAll();
      return;
    }
    const b = this.b;
    if (!b.inControl()) {
      nativeCursor.__c2HideNativeCursor = false;
      this.cursorLayer.removeAll();
      return;
    }
    const cam = { x: b.camX, y: b.camY };
    const w = screenToWorld(mx, my, cam.x, cam.y);
    const gx = Math.floor(w.x / CELL), gy = Math.floor(w.y / CELL);
    const mode = this.hoverModeAt(gx, gy, b.shiftPressed ? null : this.unitAtScreen(mx, my));
    nativeCursor.__c2HideNativeCursor = mode !== "native";
    this.cursorLayer.removeAll();
    let g: Graphics | null = new Graphics();
    if (mode === "ground") {
      g.lineStyle(1.5, 16777215, 0.9);
      g.drawCircle(0, 0, 9);
      g.moveTo(-4, 0); g.lineTo(4, 0);
      g.moveTo(0, -4); g.lineTo(0, 4);
    } else if (mode === "target") {
      g.lineStyle(1.5, 0xff4040, 0.95);
      g.drawCircle(0, 0, 9);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        g.moveTo(Math.cos(a) * 6 - 3, Math.sin(a) * 6);
        g.lineTo(Math.cos(a) * 6 + 3, Math.sin(a) * 6);
      }
    } else if (mode === "feet") {
      g.beginFill(0xffffff, 0.85);
      g.moveTo(0, 0); g.lineTo(5, 0); g.lineTo(0, 5); g.lineTo(0, 0);
      g.drawCircle(6, 10, 3); g.drawCircle(14, 8, 3);
    } else if (mode === "unavailable") {
      g.lineStyle(2.5, 0xd03030, 0.95);
      g.moveTo(-6, -6); g.lineTo(6, 6);
      g.moveTo(6, -6); g.lineTo(-6, 6);
      g.lineStyle(1, 0x000000, 0.3);
      g.drawCircle(0, 0, 10);
    } else if (mode === "heal") {
      g.lineStyle(2, 0x40ff60, 0.95);
      g.moveTo(0, -7); g.lineTo(0, 7);
      g.moveTo(-7, 0); g.lineTo(7, 0);
      g.lineStyle(1, 0x000000, 0.25);
      g.drawCircle(0, 0, 8);
    } else { g = null; }
    const s = new Sprite();
    if (g) s.graphics = g;
    s.x = mx; s.y = my;
    s.mouseEnabled = false;
    this.cursorLayer.addChild(this.cursorFrom(s, mode));
  }

  clearCursor() {
    this.cursorLayer.removeAll();
  }

  /** 形似原版 CursorHand（平移）——小手掌近似 */
  setHandCursor(mx: number, my: number) {
    this.cursorLayer.removeAll();
    const g = new Graphics();
    g.beginFill(0xffffff, 0.9);
    g.drawCircle(0, 0, 3);
    g.drawRect(-2, 0, 4, 8);
    g.drawRect(1, 3, 6, 3);
    const s = new Sprite();
    s.graphics = g;
    s.x = mx; s.y = my;
    s.mouseEnabled = false;
    this.cursorLayer.addChild(this.cursorFrom(s, "hand"));
  }

  bloodSplat(wx: number, wy: number, damage = 5, sourceX = wx, sourceY = wy, owner?: BleedingBody) {
    this.bloodPhysics.hit(wx, wy, damage, sourceX, sourceY, owner);
  }

  /** Original BloodBitmaps: persistent 1000px tiles with additive 3x3 alpha stamps. */
  private stampBlood(wx: number, wy: number) {
    const p = worldToScreen(wx, wy, 0, 0);
    const px = Math.floor(p.x), py = Math.floor(p.y);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = px + dx, y = py + dy;
      const tx = Math.floor(x / 1000), ty = Math.floor(y / 1000), key = tx + "," + ty;
      let tile = this.bloodTiles.get(key);
      if (!tile) {
        const cv = document.createElement("canvas"); cv.width = cv.height = 1000;
        const ctx = cv.getContext("2d")!;
        const bitmap = new BitmapObject(cv as any); bitmap.x = tx * 1000; bitmap.y = ty * 1000; bitmap.mouseEnabled = false;
        this.bloodLayer.addChild(bitmap);
        tile = { ctx, data: ctx.createImageData(1000, 1000), bitmap, dirty: false, minX: 1000, minY: 1000, maxX: 0, maxY: 0 };
        this.bloodTiles.set(key, tile);
      }
      const lx = x - tx * 1000, ly = y - ty * 1000, i = (ly * 1000 + lx) * 4;
      const alpha = Math.abs(dx) + Math.abs(dy) === 2 ? 5 : dx || dy ? 10 : 20;
      const data = tile.data.data;
      data[i] = 102; data[i + 1] = data[i + 2] = 0; data[i + 3] = Math.min(255, data[i + 3] + alpha);
      tile.dirty = true;
      tile.minX = Math.min(tile.minX, lx); tile.minY = Math.min(tile.minY, ly);
      tile.maxX = Math.max(tile.maxX, lx); tile.maxY = Math.max(tile.maxY, ly);
    }
  }

  /** Simulated by Battle's fixed-step update, never by a drawing call. */
  updateBlood(dt: number) { this.bloodPhysics.update(dt, this.b.units); }

  /** Read-only presentation. The optional legacy dt is intentionally ignored. */
  renderBlood(_dt = 0) {
    for (const tile of this.bloodTiles.values()) if (tile.dirty) {
      tile.ctx.putImageData(tile.data, 0, 0, tile.minX, tile.minY, tile.maxX - tile.minX + 1, tile.maxY - tile.minY + 1);
      tile.dirty = false; tile.minX = tile.minY = 1000; tile.maxX = tile.maxY = 0;
    }
    const cx = ANCHOR_X - XREL * (this.b.camX - this.b.camY);
    const cy = ANCHOR_Y - YREL * (this.b.camX + this.b.camY);
    this.unownedBlood.drops.length = 0;
    this.unownedBlood.x = cx; this.unownedBlood.y = cy;
    for (const [owner, pair] of this.bloodBatches) {
      // positionUnits rebuilds the base depth list; also support consecutive redraws.
      pair.back.parent?.removeChild(pair.back); pair.front.parent?.removeChild(pair.front);
      pair.back.drops.length = pair.front.drops.length = 0;
      pair.back.x = pair.front.x = cx; pair.back.y = pair.front.y = cy;
      pair.visible = this.isEffectOwnerVisible(owner, true);
    }
    for (const d of this.bloodPhysics.drops) {
      if (!d.owner) { this.unownedBlood.drops.push(d); continue; }
      let pair = this.bloodBatches.get(d.owner);
      if (!pair) {
        const entry = this.unitSprites.find(e => e.u === d.owner);
        if (!entry) continue;
        pair = { spr: entry.spr, back: new BloodRenderBatch(), front: new BloodRenderBatch(), visible: this.isEffectOwnerVisible(d.owner, true) };
        pair.back.x = pair.front.x = cx; pair.back.y = pair.front.y = cy;
        this.bloodBatches.set(d.owner, pair); this.bloodBySprite.set(entry.spr, pair);
      }
      // Original only inserts visible owners' drops; their offscreen physics still runs.
      if (pair.visible) (bloodBehindOwner(d, d.owner) ? pair.back : pair.front).drops.push(d);
    }
    if (this.bloodBatches.size) {
      // Interleave whole batches without allocating a display object per blood pixel.
      const base = this.unitLayer.children;
      const ordered: typeof base = [];
      for (const child of base) {
        const pair = this.bloodBySprite.get(child as Sprite);
        if (pair?.back.drops.length) { pair.back.parent = this.unitLayer; ordered.push(pair.back); }
        ordered.push(child);
        if (pair?.front.drops.length) { pair.front.parent = this.unitLayer; ordered.push(pair.front); }
      }
      this.unitLayer.children = ordered;
    }
    this.bloodAirLayer.mouseEnabled = false;
  }

  syncDropped() {
    const seen = new Set<object>();
    for (const [key, drops] of this.b.droppedWeapons ?? []) {
      const [gx, gy] = key.split(",").map(Number);
      for (const entry of drops) {
        if (entry.corpse) continue; // The original keeps this weapon in the corpse's last pose until picked up.
        seen.add(entry);
        let bitmap = this.dropSprites.get(entry);
        if (!bitmap) {
          const cv = renderDroppedWeapon(this.assets, this.ds.battleDoll, this.ds.weapons, entry.sub, this.ds.battleSkeleton?.definition);
          if (!cv) continue; // retry after async asset preload, never cache a blank image
          bitmap = new BitmapObject(cv as any); bitmap.mouseEnabled = false;
          this.dropSprites.set(entry, bitmap); this.droppedLayer.addChild(bitmap);
        }
        const p = worldToScreen((gx + 0.5) * CELL, (gy + 0.5) * CELL, this.b.camX, this.b.camY);
        bitmap.x = p.x - 25; bitmap.y = p.y - 25;
      }
    }
    for (const [entry, bitmap] of this.dropSprites) if (!seen.has(entry)) {
      this.droppedLayer.removeChild(bitmap); this.dropSprites.delete(entry);
    }
  }

  updateWorld() {
    this.syncLayers();
    this.positionUnder();
    this.positionObstacles();
    this.syncDropped();
    const cells = this.b.pathCells ?? [];
    const cur = this.b.order[this.b.turnIdx];
    this.setPathMarks(cells, cur && !cur.dead ? { x: cur.squareX, y: cur.squareY } : null);
  }

  /** 相机移动 �?网格/障碍/修饰/标记全部重算 */
  redraw() {
    this.rebuildObstacles();
    this.positionUnder();
    this.syncLayers();
    this.buildGrid();
    const cells = this.b.pathCells ?? [];
    const cur = this.b.order[this.b.turnIdx];
    this.setPathMarks(cells, cur && !cur.dead ? { x: cur.squareX, y: cur.squareY } : null);
    void this;
  }

  dispose() {
    this.floorLayer.removeAll();
    this.underLayer.removeAll();
    this.bloodLayer.removeAll();
    this.bloodTiles.clear(); this.bloodPhysics.clear();
    this.bloodBatches.clear(); this.bloodBySprite.clear(); this.unownedBlood.drops.length = 0;
    this.bloodAirLayer.removeAll(); this.bloodAirLayer.graphics = null;
    this.droppedLayer.removeAll(); this.dropSprites.clear();
    this.gridLayer.removeAll();
    this.marksLayer.removeAll();
    this.shadowLayer.removeAll();
    this.projectileShadowLayer.removeAll();
    this.obstacleLayer.removeAll();
    this.obstacleSprites = [];
    this.obstacleMasks.clear();
    this.obstacleOffsets = new WeakMap();
    this.unitLayer.removeAll();
    this.overLayer.removeAll();
    this.fxLayer.removeAll();

    this.cursorLayer.removeAll();
    this.wallHits.clear();
    this.dolls.clear();
    this.transportSprites.clear();
    this.unitSprites = [];
  }
}



