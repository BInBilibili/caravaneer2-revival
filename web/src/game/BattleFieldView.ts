// 鎴樺満绛夎窛娓叉煋锛堝師鐗?BattleField.as 绉绘锛夛細
// - 绛夎窛鎶曞奖 map2Screen锛歺Rel=sin45掳锛寉Rel=cos45掳脳0.574锛坴erticalCompression锛?// - Ground1 骞抽摵锛堝睆骞曠┖闂达紝闈欐€侊級+ UnderGrid1-5 瑁呴グ锛堥殢鐩告満绉诲姩锛? 鑿卞舰缃戞牸绾?// - Obstacle{type}.png + ObstacleShadow{type}.png锛坰hift 鏉ヨ嚜 ds.obstacles锛?// - 鍗曚綅锛氱▼搴忓寲灏忎汉锛堣偆鑹?琛ｈ壊/瑁よ壊/琚栧瀷锛夛紝鏂瑰悜+璧拌矾鎽囨憜+闃村奖
// - 璺緞鏄熷舰鏍囪 / 閫変腑鍏竟褰?/ 楂樹寒绠ご / 鍏夋爣 / 琛€娓?/ 寮归亾涓庣垎鐐哥壒鏁堬紙涓栫晫鍧愭爣鈫掑睆骞曪級
import { Sprite, Graphics, BitmapObject } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { Input } from "../core/Input";
import { BattleBlood } from "./BattleBlood";
import { blocksMovement } from "./BattleObstacles";
import { screenSort } from "./BattleDepth";
import { newTransportAnimation, advanceTransportAnimation } from "./BattleTransportAnimation";
import { playSound } from "../core/Sound";
import { dollAppearanceFrom, appearanceKey, newDollAnim, cachedDollFrame, weaponAnimType, renderDroppedWeapon } from "./BattleDoll";
import type { AssetStore } from "../core/Assets";
import type { DataStore } from "../core/DataStore";
import type { Battle, BattleUnit } from "./Battle";

export const XREL = Math.sin(Math.PI / 4);            // 0.7071067811865476
export const YREL = Math.cos(Math.PI / 4) * 0.574;    // 0.405916092鈥︼紙verticalCompression 0.574锛?
export const SCREEN_W = 640;   // 鍘熺増 BattleField screenWidth
export const SCREEN_H = 445;
export const ANCHOR_X = SCREEN_W / 2;
export const ANCHOR_Y = SCREEN_H / 2;
const CELL = 32;
const MARKS = 0xffffff; // marksColor 榛樿鐧斤紙鍘熺増 groundMarksShapes 鐧芥槦锛?
/** 涓栫晫鍍忕礌鍧愭爣 鈫?灞忓箷閿氱偣绯伙紙鐩告満浣嶄簬 ANCHOR锛?*/
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
/** 鐩稿閿氱偣绯荤殑灞忓箷鍧愭爣 鈫?涓栫晫鍍忕礌鍧愭爣 */
export function screenToWorld(sx: number, sy: number, camX: number, camY: number) {
  const mx = sx - ANCHOR_X + XREL * (camX - camY);
  const my = sy - ANCHOR_Y + YREL * (camX + camY);
  const wy = my / (2 * YREL) - mx / (2 * XREL);
  const wx = mx / XREL + wy;
  return { x: wx, y: wy };
}

// ===== 鍘熺増 groundMarksShapes 閫愬瓧杩樺師锛圔attleField.as:296,601-624锛?====
// 0..5 = 鍏鏂瑰悜绠ご锛堝崟浣嶆牸鍐呯粯鍒讹細澶栨 [0,0][1,0][1,1][0,1] 闂悎 + 绠ご澶氳竟褰級锛?
// 6 = 浜旇鏄燂紙缁堢偣鍙珯鏍硷級锛? = 鍏竟褰紙褰撳墠琛屽姩鍗曚綅閫変腑锛?
const MARK_R = 0.5; // 绠ご/閫変腑鐧借壊濉厖 alpha锛堝師鐗?beginFill(marksColor,0.5)锛?
const STAR_R = 0.55; // web 鍘熷疄鐜颁簲瑙掓槦濉厖 alpha锛堟埅鍥惧熀璋冿級
const GROUND_MARK_SHAPES: Array<Array<[number, number]>> = [
  // 0 鈫掞紙鍚戜笂/绂昏嚜宸辨柟鍚戯級锛氬皷瑙掍綅浜庢牸椤?
  [[0,0],[1,0],[1,1],[0,1],[0,0],[0.2,0.5],[0.5,0.2],[0.8,0.5],[0.6,0.5],[0.6,0.8],[0.4,0.8],[0.4,0.5],[0.2,0.5]],
  // 1 鈫掞紙鍙充笂锛?
  [[0,0],[1,0],[1,1],[0,1],[0,0],[0.2,0.4],[0.5,0.4],[0.5,0.2],[0.8,0.5],[0.5,0.8],[0.5,0.6],[0.2,0.6],[0.2,0.4]],
  // 2 鈫掞紙鍙充笅锛?
  [[0,0],[1,0],[1,1],[0,1],[0,0],[0.4,0.2],[0.6,0.2],[0.6,0.5],[0.8,0.5],[0.5,0.8],[0.2,0.5],[0.4,0.5],[0.4,0.2]],
  // 3 鈫掞紙宸︿笅锛?
  [[0,0],[1,0],[1,1],[0,1],[0,0],[0.2,0.5],[0.5,0.2],[0.5,0.4],[0.8,0.4],[0.8,0.6],[0.5,0.6],[0.5,0.8],[0.2,0.5]],
  // 4 = AP 棰勭畻杈圭晫鏍硷紙鍘熺増 convertAStoPath direction=4锛涙牸鍐呭皬鑿卞舰锛?
  [[0,0],[1,0],[1,1],[0,1],[0,0],[0.3,0.3],[0.7,0.3],[0.7,0.7],[0.3,0.7],[0.3,0.3]],
  // 5 = 瓒呴绠楋紙璧颁笉鍒帮級鏍硷紙鍘熺増 direction=5锛涜彵褰㈠唴 X锛?
  [[0.2,0.3],[0.3,0.2],[0.5,0.4],[0.7,0.2],[0.8,0.3],[0.6,0.5],[0.8,0.7],[0.7,0.8],[0.5,0.6],[0.3,0.8],[0.2,0.7],[0.4,0.5]],
];
function starShape(): Array<[number, number]> {
  // 鍘熺増 groundMarksShapes[6] 鏋勯€狅紙BattleField.as Init 601-616锛夛細5 缁?澶栧皷0.4/鍐呭皷0.2 + 澶栨 + 鍥炲埌鏈€鍚庝竴涓唴灏?
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
  // 鍘熺増 groundMarksShapes[7]锛圔attleField.as Init 617-624锛夛細r=0.5 鍏竟褰紙璧风偣鍦ㄩ《锛?
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
  // 鍒嗗眰锛堝搴斿師鐗?Floor / UnderGrid / GroundMarks / Grid / Shadows / OverGrid / Interlacing / TopMarks锛?
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
  readonly droppedLayer = new Sprite();
  private bloodTiles = new Map<string, { ctx: CanvasRenderingContext2D; data: ImageData; bitmap: BitmapObject; dirty: boolean; minX: number; minY: number; maxX: number; maxY: number }>();
  private dropSprites = new Map<object, BitmapObject>();
  get blood() { return this.bloodPhysics.drops; }
  private underDeco: Array<{ spr: Sprite; wx: number; wy: number }> = [];
  private floorBuildId = 0;
  private wallHits=new Map<object,{spr:BitmapObject|null;x:number;y:number;outer:boolean;start:number}>();
  wallHit(owner:object,x:number,y:number,outer:boolean) {
    const old=this.wallHits.get(owner);old?.spr?.parent?.removeChild(old.spr);
    this.wallHits.set(owner,{spr:null,x,y,outer,start:this.b.animTime});
  }
  private positionWallHits() {
    for(const [owner,h] of this.wallHits){
      const frame=Math.floor((this.b.animTime-h.start)*25+1e-7);
      if(frame>=12){h.spr?.parent?.removeChild(h.spr);this.wallHits.delete(owner);continue;}
      const o=owner as {gx:number;gy:number;type:number};
      const wall=this.obstacleSprites.find(s=>s.gx===o.gx&&s.gy===o.gy&&s.type===o.type);if(!wall)continue;
      const img=this.assets.getImage('ShotSmoke.png');if(!img)continue;
      if(!h.spr){h.spr=new BitmapObject(img);h.spr.mouseEnabled=false;this.unitLayer.addChild(h.spr);}
      const p=worldToScreen(h.x,h.y,this.b.camX,this.b.camY);
      h.spr.srcRect={x:0,y:frame*20,w:20,h:20};h.spr.x=p.x-10;h.spr.y=p.y-40;
      const existing=this.unitLayer.children.indexOf(h.spr);if(existing>=0)this.unitLayer.children.splice(existing,1);
      const index=this.unitLayer.children.indexOf(wall.spr);this.unitLayer.children.splice(index+(h.outer?1:0),0,h.spr);
    }
  }
  private obstacleSprites: Array<{ spr: Sprite; sh: Sprite; gx: number; gy: number; type: number;
    wx: number; wy: number; solid: boolean; body: BitmapObject | null; mask: ImageData | null }> = [];
  private obstacleOffsets = new WeakMap<object, { x: number; y: number }>();
  private obstacleMasks = new Map<HTMLImageElement, ImageData>();
  private unitSprites: Array<{ spr: Sprite; u: BattleUnit; flame: Sprite | null }> = [];
  private dolls = new Map<BattleUnit, { spr: Sprite; app: any; appKey: string; anim: any; lastKey: string; cv: HTMLCanvasElement | null; shadowObj: BitmapObject | null }>();
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
    root.addChild(this.overLayer);
    root.addChild(this.fxLayer);
    root.addChild(this.cursorLayer);
  }

  get size() { return this.b.fieldPx; }

  /** 闈欐€佸唴瀹癸細鍦伴潰璐村浘 + 缃戞牸绾?+ UnderGrid 瑁呴グ绮剧‘瀹氫綅锛堝師鐗?Init锛?*/
  buildStatic() {
    // 鍦伴潰锛氫笘鐣岀郴 450x260 鏃犵紳骞抽摵锛堣鐩栨暣鍦?+ 鐩告満鍗婂睆杈硅窛锛夛紝鏁村眰闅忕浉鏈哄彇妯″钩绉?
    this.floorLayer.removeAll();
    const size = this.size;
    const img = this.assets.getImage("Ground1.png");
    if (img) this.buildFloorTiles(img, size);
    else void this.assets.ensure("Ground1.png").then((loaded) => {
      if (loaded) this.buildFloorTiles(loaded, this.size);
    });
    this.buildGrid();
    // UnderGrid 瑁呴グ锛歳andom(gridW*H/40, gridW*H/20) 涓紝闅忔満涓栫晫鍧愭爣锛屽浘鐗囧眳涓?
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

  /** Ground1 涓嶆槸鏃犵紳绾圭悊锛涚敤闀滃儚閲嶅鐢熸垚 2x2 鍥炬锛屾秷闄ゅぇ鍧楀崄瀛楁帴缂濄€?*/
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
      // 涓栫晫绯昏彵褰㈢綉鏍硷紙cam=0 鍩哄噯锛涙暣灞傜敱 syncLayers 闅忕浉鏈哄钩绉伙級
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

  /** 涓栫晫绯诲浘褰㈠眰鏁翠綋浣嶇Щ锛堝師鐗?MobilePart 骞崇Щ锛夛細floor/under/grid/blood 鐢ㄥ悓涓€鍋忕Щ淇濇寔涓?marks/obstacles/units 瀵归綈 */
  syncLayers() {
    const cam = { x: this.b.camX, y: this.b.camY };
    const o = worldToScreen(0, 0, cam.x, cam.y);
    const dx = o.x - ANCHOR_X;
    const dy = o.y - ANCHOR_Y;
    this.floorLayer.x = dx; this.floorLayer.y = dy;
    // underLayer 瀛愰」锛圲nderGrid 瑁呴グ/琛€娓嶅嵃璁帮級鐢?positionUnder/renderBlood 閫愬抚缁濆瀹氫綅锛屼笉鍐嶆暣浣撳钩绉?
    // 锛堝惁鍒欎笌 positionUnder 鐨?worldToScreen 鍙犲姞 = 鍙屽€嶄綅绉?鈫?姹℃笉/纰庣煶鍍忛鍦ㄥぉ涓婁笉鍚屽眰锛?
    this.underLayer.x = 0; this.underLayer.y = 0;
    this.gridLayer.x = dx;  this.gridLayer.y = dy;
    this.bloodLayer.x = dx; this.bloodLayer.y = dy;
  }

  /** 闅滅鐗╋細閲嶅缓锛堢浉鏈?闅滅闆嗗悎鍙樺寲鏃讹級 */
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
      e = { spr, app, appKey, anim, lastKey: "", cv: null, shadowObj: null };
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
    for (let i = advanceTransportAnimation(animation, dt); i > 0; i--) playSound("SFXAnimalDie.mp3");
    const frame = u.transportKind === "animal" ? animation.frame : 1;
    const dir = u.facing ?? 0;
    const image = this.assets.getImage("Transport" + type + ".png");
    const shadow = this.assets.getImage("TransportShadow" + type + ".png");
    const key = [type, dir, frame, !!image, !!shadow].join("|");
    if (e.lastKey !== key) {
      for (const [part, img, prop] of [["Transport", image, "body"], ["TransportShadow", shadow, "shadow"]] as const) {
        if (!img) continue;
        let bitmap = e[prop];
        if (!bitmap) {
          bitmap = new BitmapObject(img); bitmap.mouseEnabled = false;
          e[prop] = bitmap;
          if (prop === "shadow") e.shadowContainer.addChild(bitmap); else e.spr.addChildAt(bitmap,0);
        }
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
    if (e.flame) e.flame.visible = u.burning > 0 && !u.dead;
  }

  /** 鍘熺増闃村奖甯э細Shadows1 鍥鹃泦 shadow 甯?*/
  private updateShadowFrame(u: BattleUnit, e: any, anim: any) {
    if (!e.shadowObj) {
      const img0 = this.assets.getImage("Shadows1.png");
      if (!img0) return;
      const shp = new Sprite();
      const sbo = new BitmapObject(img0);
      sbo.srcRect = { x: 0, y: 0, w: 1, h: 1 };
      sbo.mouseEnabled = false;
      shp.addChild(sbo);
      (shp as any).__dollShadow = true;
      this.shadowLayer.addChild(shp);
      e.shadowObj = sbo;
    }
    const data = this.ds.battleDoll as any;
    const img = this.assets.getImage("Shadows1.png");
    if (!data || !img || !e.shadowObj) return;
    const frames = data.fullAnimationTypeFrames?.[anim.animType]?.[anim.phase];
    if (!frames) return;
    const fm = frames[Math.max(0, Math.min(Math.floor(anim.frame) - 1, frames.length - 1))];
    const sf = fm?.shadow ?? 1;
    const bnd = data.spriteBoundaries?.["Shadows"]?.["1"]?.[String(anim.dir)]?.[String(sf)];
    if (!bnd) return;
    const dim = data.spriteDimensions?.["Shadows"]?.["1"];
    if (!dim) return;
    const over = (sf - 1) >= 80;
    const col = over ? anim.dir + 4 : anim.dir;
    const row = over ? sf - 81 : sf - 1;
    e.shadowObj.image = img;
    e.shadowObj.srcRect = { x: col * dim.width + bnd.x, y: row * dim.height + bnd.y, w: bnd.width, h: bnd.height };
    e.shadowObj.x = -50 + bnd.x; e.shadowObj.y = -70 + bnd.y;
  }

  /** 姣忓抚鍒锋柊绾稿▋濞冿紙Battle 椹卞姩 state锛涜繖閲屼粎閲嶅缓浣嶅浘缂撳瓨 + 瀹氫綅锛?*/
  updateDoll(u: BattleUnit, dt: number, animTime: number) {
    const e = this.dolls.get(u);
    if (!e) return;
    const anim = (u as any).__doll as any;
    if (!anim || !this.ds.battleDoll) return;
    const wd = this.ds.weapons ?? null;
    const at = weaponAnimType(wd, typeof u.weaponSub === "number" ? u.weaponSub : 0);
    if (anim.phase === 0 || anim.phase === 1) { anim.animType = at; anim.weaponSub = u.weaponSub ?? 0; }
    if (u.dead && anim.phase !== 4 && !anim.hidden) { anim.phase = 4; anim.acc = 0; anim.frame = 1; anim.done = false; }
    const frame = Math.max(1, Math.floor(anim.frame) || 1);
    const opts: any = { assets: this.assets, data: this.ds.battleDoll, appearance: e.app, animType: anim.animType, phase: anim.phase, frame, dir: anim.dir, weaponSub: anim.weaponSub };
    const key = e.appKey + "|" + anim.animType + "|" + anim.phase + "|" + frame + "|" + anim.dir + "|" + opts.weaponSub;
    if (e.lastKey !== key) {
      const cv = cachedDollFrame(opts as any, e.appKey);
      if (cv) {
        const ch = (e.spr.children as any[]).filter((c: any) => c.__dollLayer);
        for (const c of ch) e.spr.removeChild(c);
        const bo = new BitmapObject(cv as any);
        bo.srcRect = { x: 0, y: 0, w: cv.width, h: cv.height };
        bo.mouseEnabled = false;
        (bo as any).__dollLayer = true;
        bo.x = -50; bo.y = -70;
        e.spr.addChildAt(bo, 1);
        e.cv = cv;
        e.lastKey = key; // 绱犳潗鏈氨缁椂 cv 涓?null 鈫?淇濇寔 lastKey锛屼笅涓€甯ч噸璇?
      }
    }
    this.updateShadowFrame(u, e, anim);
    const wx = anim.walk ? anim.dispX : u.x;
    const wy = anim.walk ? anim.dispY : u.y;
    const cam = { x: this.b.camX, y: this.b.camY };
    const p2 = worldToScreen(wx, wy, cam.x, cam.y);
    const moving = !!anim.walk;
    const bob = 0; // Original paper-doll frames already contain the walk bob.
    e.spr.x = p2.x;
    e.spr.y = p2.y + bob;
    e.spr.visible = !anim.hidden;
    const shadow = e.shadowObj?.parent;
    if (shadow) { shadow.x=e.spr.x; shadow.y=e.spr.y; shadow.visible=e.spr.visible; }
    const flame = this.unitSprites.find((x) => x.u === u)?.flame ?? null;
    if (flame) flame.visible = u.burning > 0 && !u.dead;
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
        const count = Math.max(1, Math.floor((flame.image.naturalHeight || 100) / 100));
        const frame = Math.floor(animTime * 25) % count;
        const bounds = this.ds.battleDoll?.spriteBoundaries?.BodyBurn?.[0]?.[0]?.[frame + 1];
        const x = bounds?.x ?? 0, y = bounds?.y ?? 0, w = bounds?.width ?? 100, h = bounds?.height ?? 100;
        flame.srcRect = { x, y: frame * 100 + y, w, h };
        flame.x = -Math.round(w / 2); flame.y = -40 - Math.round(h / 2);
        flame.scaleX = flame.scaleY = 1;
        // Flames must remain in front of newly recreated body frames.
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

  /** 鍘熺増鍏堝瑙掕壊 Bitmap 鍋氬儚绱犵骇 hitTest锛屽啀鍥為€€鍒拌鑹叉墍鍦ㄦ牸銆?*/
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

  /** 璺緞鏍囪锛氬師鐗?groundMarksShapes 閫愭牸鏍囪锛堟柟鍚戠澶?棰勭畻杈圭晫/瓒呴绠?缁堢偣鏄燂級+ 褰撳墠鍗曚綅鍏竟褰?*/
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

  /** groundMarksShapes 鐨勨€滅鍙封€濆瓙璺緞锛堝幓鎺夊妗?[0,0][1,0][1,1][0,1][0,0]锛夛細
   *  0..3 绠ご澶淬€? 棰勭畻鑿卞舰銆? 瓒呴绠?X锛堟棤澶栨鏁存锛夈€? 浜旇鏄熷墠 10 鐐?*/
  private glyphOf(poly: Array<[number, number]>, d: number): Array<[number, number]> {
    if (d === 6) return poly.slice(0, 10);
    if (d === 5) return poly; // X 鏈韩鍗崇鍙凤紙鏃犲妗嗭級
    // 0..4锛氬妗?5 鐐瑰悗鏄鍙疯疆寤擄紙闂悎鐐归噸澶嶄竴娆★紝鍘绘帀鏈熬閲嶅锛?
    const g = poly.slice(5);
    if (g.length > 1 && g[g.length - 1][0] === g[0][0] && g[g.length - 1][1] === g[0][1]) g.pop();
    return g;
  }
  /** 璺緞鏍囪锛氭贰鐧芥暣鏍?+ 鐧借壊绌哄績绗﹀彿绾跨锛堝師鐗堣瑙夛細鏍煎唴鏈夋柟鍚戠澶?棰勭畻/缁堢偣鏄熺殑杞粨锛?   *  涓嶆槸绾櫧瀹炲績鏍硷級 */
  private addMark(poly: Array<[number, number]>, gx: number, gy: number, cam: { x: number; y: number }, color: number, alpha: number, d = 6, selected = false) {
    const g = new Graphics();
    const c8 = "#" + (color >>> 0).toString(16).padStart(6, "0");
    // 1) 鏁存牸娣＄櫧濉厖锛堝師鐗?beginFill(marksColor,0.5) 鐨勫急鍖栫増锛氬お瀹炰細鐩栦綇绗﹀彿锛?.5 鏁堟灉鐢辩鍙疯ˉ瓒筹級
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
        // 鍘熺増 direction=5 鍙湁濉厖 X 褰㈢姸锛屾病鏈夋暣鏍艰儗鏅€?
        g.polySub(gpts, { c: c8, a: 0.5 }, null);
      } else if (gpts.length >= 2) {
        g.polyCompound([fpts, gpts], { c: c8, a: 0.5 }, null);
      } else {
        g.polySub(fpts, { c: c8, a: 0.5 }, null);
      }
    }
    // 2) 绌哄績绗﹀彿绾跨锛堢櫧鎻忚竟锛岀澶?鑿卞舰/X/浜旇鏄燂級
    const legacyGlyph = selected ? [] : this.glyphOf(poly, d);
    if (false && legacyGlyph.length >= 2) {
      const gpts: Array<{ x: number; y: number }> = [];
      for (const [u, v] of legacyGlyph) { const p2 = worldToScreen((gx + u) * CELL, (gy + v) * CELL, cam.x, cam.y); gpts.push({ x: p2.x, y: p2.y }); }
      // 鍘熺増 GroundMarks 鏄疄蹇冨浘褰紱绠ご銆佹槦鏍囧拰 AP 杈圭晫涓嶈兘鍙敾杞粨銆?
      g.polySub(gpts, null, { w: 1.6, c: c8, a: 0.95 });
    }
    const s = new Sprite();
    s.graphics = g;
    s.mouseEnabled = false;
    this.marksLayer.addChild(s);
    this.markSprites.push(s);
    void alpha;
  }
  /** 楂樹寒绠ご锛氬綋鍓嶈鍔ㄥ崟浣嶅ご椤讹紙鍘熺増 Float锛?*/
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

  /** 鍘熺増鍏夋爣浣嶅浘锛坉ecompiled sprites DefineSprite_96x/1.png 鐧芥弿杈规父鏍囷級锛涙棤鍥惧洖钀?Graphics 鍚戦噺杩戜技 */
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
      // 鍘熺増娉ㄥ唽鐐癸細Feet/Hand 灏栫鏈濆乏涓娿€乀arget/Heal 涓績銆乁navailable 涓績
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

  /** 鎮仠鏍煎浘鏍囨ā寮忓垽瀹氾紙渚?updateCursor / HUD 澶嶇敤锛?*/
  hoverModeAt(gx: number, gy: number, pointedUnit: BattleUnit | null = null): string {
    const b = this.b;
    if (!b.inControl()) return "native";
    const cur = b.order[b.turnIdx];
    if (cur && b.phase === "player" && !b.gameOver && !cur.dead && cur.side === 0) {
      const groundOnly = b.shiftPressed;
      const grenadeTarget = b.weaponCategory(cur) === 5 && !groundOnly && !b.healingMode;
      // 璐村浘鍍忕礌鍛戒腑浼樺厛浜庢牸瀛愬洖閫€锛氬懡涓弸鍐涙椂缁濅笉鑳界┛閫忓埌鍏跺悗鏂圭殑鏁屼汉鏍笺€?
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

  /** 鍏夋爣锛氬師鐗?CursorHand/Target/Feet/Unavailable/Heal/GroundTarget锛堜綅鍥句紭鍏堬紝缂哄け鍥炶惤杩戜技锛?*/
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

  /** 褰技鍘熺増 CursorHand锛堝钩绉伙級鈥斺€斿皬鎵嬫帉杩戜技 */
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

  bloodSplat(wx: number, wy: number, damage = 5, sourceX = wx, sourceY = wy) {
    this.bloodPhysics.hit(wx, wy, damage, sourceX, sourceY);
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

  renderBlood(dt: number) {
    this.bloodPhysics.update(dt, this.b.units);
    for (const tile of this.bloodTiles.values()) if (tile.dirty) {
      tile.ctx.putImageData(tile.data, 0, 0, tile.minX, tile.minY, tile.maxX - tile.minX + 1, tile.maxY - tile.minY + 1);
      tile.dirty = false; tile.minX = tile.minY = 1000; tile.maxX = tile.maxY = 0;
    }
    const g = new Graphics();
    for (const d of this.bloodPhysics.drops) {
      const p = worldToScreen(d.x, d.y, this.b.camX, this.b.camY);
      g.beginFill(0x600000, d.alpha); g.drawRect(p.x, p.y - d.z, 1, 1);
    }
    this.bloodAirLayer.graphics = g;
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
          const cv = renderDroppedWeapon(this.assets, this.ds.battleDoll, this.ds.weapons, entry.sub);
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

  /** 鐩告満绉诲姩 鈫?缃戞牸/闅滅/淇グ/鏍囪鍏ㄩ儴閲嶇畻 */
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
    this.bloodTiles.clear(); this.bloodPhysics.drops.length = 0;
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
    this.dolls.clear();
    this.transportSprites.clear();
    this.unitSprites = [];
  }
}



