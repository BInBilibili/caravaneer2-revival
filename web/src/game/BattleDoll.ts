// 原版战场人物纸娃娃渲染（Character.as renderAnimation + AnimationData 忠实移植）
//
// 机理（与 Portrait.ts 同源的 3 色 ColorMatrix 管线，这里是“分部位图集帧”版本）：
//  - 素材 = 灰度模板图集 {part}{type}.png（如 Body1.png / LeftTopArm1.png），
//    每部件 * 方向0..3 * 帧在 spriteBoundaries 中有 {x,y,w,h} 裁框；
//  - 运行时按“方向×动画帧”把每层裁出，以 3 色矩阵
//    R' = base.r·R + hi.r·G + main.r·B（RGB 通道分别对应 base/hi/main 通道掩码）染色；
//  - 层序/帧号/相位/类型推导均照抄原版 Character.as：renderAnimation 的分方向层数组、
//    switch 的 _loc3_/_loc15_/_loc16_ 颜色映射、BodyType/HeadType 等 getter、slotAnimationType。
//
// 本模块不依赖 DOM 之外的库：离屏 canvas 按需建，结果缓存在 Map。
// 导出无 DOM 依赖的纯数据/颜色函数 + DOM 渲染函数，测试与浏览器共用。

import { BitmapObject, Sprite } from "../core/Display";
import type { AssetStore } from "../core/Assets";

export type RGB = { r: number; g: number; b: number; bc?: number };
export type DollData = {
  fullAnimationTypeFrames: any[][][]; // [animType][phase][frame1..N]{legs,body,arms,weapon,shadow}
  spriteDimensions: Record<string, Record<string, { width: number; height: number }>>;
  spriteBoundaries: Record<string, Record<string, Record<string, Record<string, { x: number; y: number; width: number; height: number }>>>>;
};
export type DollAppearance = {
  gender: number;
  age?: number;
  skinColor?: RGB;
  hairColor?: RGB;
  shirtColor?: RGB;
  pantsColor?: RGB;
  shoesColor?: RGB;
  beardColor?: RGB;
  jacketColor?: RGB;
  headgearColor?: RGB;
  braceletColor?: RGB;
  sleevesType?: number;
  hasRightBracelet?: boolean;
  hasLeftBracelet?: boolean;
  Jacket?: number;
  Headgear?: number;
  originalBodyType?: number;
  LegsType?: number;
  originalHead?: number;
  originalBackHairType?: number;
  originalBeardType?: number;
  BodyType?: number;
  HeadType?: number;
  LeftTopArmType?: number;
  RightTopArmType?: number;
  LeftForearmType?: number;
  RightForearmType?: number;
  BackHairType?: number;
  BeardType?: number;
  ShoulderPlatesType?: number;
  portraitShirt?: number;
  portraitHair?: number;
  portraitBeardType?: number;
  portraitMoustache?: number;
  preserve?: Record<string, any>;
};

export const ANIM_TYPES = [0,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,4,3,3,3,5,6,4,4,0,4,4,5,5];
export const HIT_FRAMES = [8,6,8,1,1,1,1,6];

// 原版 renderAnimation 的分方向层序（后面=上层）
const LAYER_ORDER: Record<number, string[]> = {
  0: ["LeftTopArm","LeftForearm","Beard","Legs","Weapon","Body","RightForearm","RightTopArm","BigGunBackpack","ShoulderPlates","BackHair","Head"],
  1: ["BackHair","BigGunBackpack","LeftTopArm","Legs","Body","LeftForearm","RightTopArm","ShoulderPlates","Head","Beard","Weapon","RightForearm"],
  2: ["BackHair","BigGunBackpack","RightTopArm","RightForearm","Legs","Body","Weapon","LeftTopArm","ShoulderPlates","Head","Beard","LeftForearm"],
  3: ["RightForearm","RightTopArm","Beard","Weapon","Legs","LeftForearm","Body","LeftTopArm","BigGunBackpack","ShoulderPlates","BackHair","Head"],
};
const DEATH_ORDER: Record<number, string[]> = {
  0: ["BigGunBackpack","BackHair","LeftTopArm","LeftForearm","Legs","Weapon","Body","RightForearm","RightTopArm","ShoulderPlates","Head","Beard"],
  1: ["BackHair","BigGunBackpack","LeftTopArm","Head","Beard","ShoulderPlates","Body","Beard","LeftForearm","Legs","Weapon","RightTopArm","RightForearm"],
  2: ["BackHair","BigGunBackpack","RightTopArm","Weapon","Head","Body","Beard","ShoulderPlates","RightForearm","Legs","LeftTopArm","LeftForearm"],
  3: ["BackHair","BigGunBackpack","RightForearm","RightTopArm","Weapon","Legs","LeftForearm","Body","ShoulderPlates","Head","Beard","LeftTopArm"],
};

export const PART_CATEGORY: Record<string, "legs"|"body"|"arms"|"weapon"|"shadow"> = {
  LeftTopArm:"arms", LeftForearm:"arms", RightTopArm:"arms", RightForearm:"arms",
  Head:"body", Body:"body", Beard:"body", BackHair:"body", ShoulderPlates:"body",
  Legs:"legs", Weapon:"weapon", BigGunBackpack:"weapon", Shadows:"shadow",
};

export const DEF_RED: RGB = { r: 255, g: 0, b: 0, bc: 1 };
export const DEF_GREEN: RGB = { r: 0, g: 255, b: 0, bc: 1 };
export const DEF_BLUE: RGB = { r: 0, g: 0, b: 255, bc: 1 };
export const DEF_BLACK: RGB = { r: 0, g: 0, b: 0, bc: 1 };

export function normRGB(c: RGB | number | undefined | null, def: RGB): RGB {
  if (typeof c === "number") return { r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255, bc: 1 };
  if (c && typeof c === "object" && typeof c.r === "number") {
    return { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b), bc: typeof c.bc === "number" ? c.bc : 1 };
  }
  return def;
}

/** 从任意 web Character / EnemyPersonSpec / BattleUnit 外观对象构造纸娃娃外观（无损，缺省按原版公式） */
export function dollAppearanceFrom(ch: any): DollAppearance {
  const c = ch ?? {};
  // 兼容新角色结构（CharacterSetup colors/parts）→ 映射到原版 portrait* 字段
  if (c && typeof c === "object" && (c.colors || c.parts) && (c.portraitHair === undefined && c.portraitShirt === undefined)) {
    const col = c.colors ?? {};
    const pt = c.parts ?? {};
    const pick = (k: string, d: number) => { const v = pt[k]; return v === undefined || v === null ? d : Number(v); };
    const map = {
      portraitHair: pick("hair", 0), portraitHead: pick("head", 1), portraitBeardType: pick("beard", 0),
      portraitMoustache: pick("moustache", 0), portraitShirt: pick("shirt", 0),
    };
    if (map.portraitHair) c.portraitHair = map.portraitHair;
    if (map.portraitHead) c.portraitHead = map.portraitHead;
    if (map.portraitBeardType) c.portraitBeardType = map.portraitBeardType;
    if (map.portraitMoustache) c.portraitMoustache = map.portraitMoustache;
    if (map.portraitShirt) c.portraitShirt = map.portraitShirt;
    for (const k of ["skin","hair","shirt"]) { if (col[k]) { const target = k === "skin" ? "skinColor" : k === "hair" ? "hairColor" : "shirtColor"; if (!c[target]) c[target] = { r: col[k].r, g: col[k].g, b: col[k].b, bc: 1 }; } }
  }
  const hair = c.hairColor ? normRGB(c.hairColor, { r: 60, g: 45, b: 30 }) : { r: 60, g: 45, b: 30 };
  const shirt = normRGB(c.shirtColor, { r: 120, g: 110, b: 100 });
  const armorList = (globalThis as any).__c2?.ds?.items?.Armor ?? [];
  const jacketDef = armorList[Number(c.Jacket ?? 0)] ?? null;
  const headgearDef = armorList[Number(c.Headgear ?? 0)] ?? null;
  const jacketFallback = jacketDef?.color ? normRGB(jacketDef.color, DEF_BLACK) : (c.Jacket ? DEF_BLACK : shirt);
  const headgearFallback = headgearDef?.color ? normRGB(headgearDef.color, DEF_BLACK) : (c.Headgear ? DEF_BLACK : hair);
  const preserve = { ...(c.preserve ?? {}) };
  if (jacketDef) {
    for (const k of ["changeTopArm", "changeForearm", "changeLegs", "preserveBodyColor", "preserveLegsColor", "preserveTopArmColor", "preserveForearmColor", "preserveShoulderPlatesColor"]) {
      if (jacketDef[k] !== undefined && preserve[k] === undefined) preserve[k] = jacketDef[k];
    }
  }
  const a: DollAppearance = {
    gender: Number(c.gender ?? 1),
    age: Number(c.age ?? 25),
    skinColor: normRGB(c.skinColor, { r: 200, g: 160, b: 140 }),
    hairColor: hair,
    shirtColor: shirt,
    pantsColor: normRGB(c.pantsColor, { r: 90, g: 90, b: 110 }),
    shoesColor: normRGB(c.shoesColor, { r: 60, g: 55, b: 50 }),
    beardColor: normRGB(c.beardColor, hair),
    // 无外套/头盔时，原始蒙版仍需要可见颜色；黑色只用于真正装备了黑色部件的情况。
    jacketColor: normRGB(c.jacketColor, jacketFallback),
    headgearColor: normRGB(c.headgearColor, headgearFallback),
    braceletColor: normRGB(c.braceletColor, shirt),
    sleevesType: Number(c.sleevesType ?? 0),
    hasRightBracelet: !!c.hasRightBracelet,
    hasLeftBracelet: !!c.hasLeftBracelet,
    Jacket: Number(c.Jacket ?? 0),
    Headgear: Number(c.Headgear ?? 0),
    originalBodyType: c.originalBodyType !== undefined ? Number(c.originalBodyType) : undefined,
    LegsType: c.LegsType !== undefined ? Number(c.LegsType) : undefined,
    originalHead: c.originalHead !== undefined ? Number(c.originalHead) : undefined,
    originalBackHairType: c.originalBackHairType !== undefined ? Number(c.originalBackHairType) : undefined,
    originalBeardType: c.originalBeardType !== undefined ? Number(c.originalBeardType) : undefined,
    portraitShirt: c.portraitShirt !== undefined ? Number(c.portraitShirt) : undefined,
    portraitHair: c.portraitHair !== undefined ? Number(c.portraitHair) : undefined,
    portraitBeardType: c.portraitBeardType !== undefined ? Number(c.portraitBeardType) : undefined,
    portraitMoustache: c.portraitMoustache !== undefined ? Number(c.portraitMoustache) : undefined,
    preserve: Object.keys(preserve).length ? preserve : undefined,
  };
  // 女性缺省长裤腿型（原版 Character.as:1324-1331：gender2 → LegsType=2）
  if (a.LegsType === undefined && Number(c.gender ?? 1) === 2) a.LegsType = 2;
  return a;
}

function fixLegsType(gender: number, legsType?: number): number {
  let lt = legsType ?? 1;
  if (gender === 2 && lt === 1) lt = 2;
  if (gender === 1 && lt === 2) lt = 1;
  return lt;
}

export function deriveBodyForGender(gender: number, ps?: number): number {
  if (gender === 2) return 5;
  if (ps === undefined || ps === 0 || ps === 1 || ps === 3) return 1;
  return 2;
}

function bodyTypeOf(a: DollAppearance): number {
  return a.BodyType || a.originalBodyType || deriveBodyForGender(a.gender, a.portraitShirt);
}
function headTypeOf(a: DollAppearance): number {
  return a.HeadType || a.originalHead || 1;
}
function backHairTypeOf(a: DollAppearance): number {
  if ((a.Headgear ?? 0) > 0 && a.preserve?.changeBackHair !== undefined) return Number(a.preserve.changeBackHair);
  return a.BackHairType || a.originalBackHairType || 0;
}
function beardTypeOf(a: DollAppearance): number {
  return a.BeardType || a.originalBeardType || 0;
}
function topArmTypeOf(a: DollAppearance, _side: string): number {
  if (a.preserve?.changeTopArm) return Number(a.preserve.changeTopArm);
  const s = a.sleevesType ?? 0;
  return (s === 0 || s === 1 || s === 2 || s === 3 || s === 5) ? 1 : 2;
}
function forearmTypeOf(a: DollAppearance, side: "L"|"R"): number {
  if (a.preserve?.changeForearm) return Number(a.preserve.changeForearm);
  const s = a.sleevesType ?? 0;
  if (s === 5) return 3;
  const has = side === "L" ? a.hasLeftBracelet : a.hasRightBracelet;
  return has ? 2 : 1;
}
function shouldersTypeOf(a: DollAppearance): number {
  return a.preserve?.changeShoulderPlates || a.ShoulderPlatesType || 0;
}

/** 解析一层部件的最终素材类型（含 Jacket/Weapon/BigGunBackpack 替换） */
export function partTypeOf(a: DollAppearance, name: string, weaponsData?: any, weaponSub?: number): number {
  switch (name) {
    case "Weapon": {
      if (!weaponsData || !weaponSub) return 0;
      const w = weaponsData.Weapons?.[weaponSub];
      return w ? (w.animatedWeapon ?? 0) : 0;
    }
    case "BigGunBackpack": {
      if (!weaponsData || !weaponSub) return 0;
      const w = weaponsData.Weapons?.[weaponSub];
      return w ? (w.bigGunBackpack ?? 0) : 0;
    }
    case "Legs": {
      // Some jackets ship a dedicated leg sprite. It takes precedence over
      // the gender default in the original Character.renderAnimation path.
      const changed = Number(a.preserve?.changeLegs ?? 0);
      return changed > 0 ? changed : fixLegsType(a.gender, a.LegsType);
    }
    case "Body": return bodyTypeOf(a);
    case "Head": return headTypeOf(a);
    case "BackHair": return backHairTypeOf(a);
    case "Beard": return beardTypeOf(a);
    case "LeftTopArm": case "RightTopArm": return topArmTypeOf(a, name);
    case "LeftForearm": case "RightForearm": return forearmTypeOf(a, name === "LeftForearm" ? "L" : "R");
    case "ShoulderPlates": return shouldersTypeOf(a);
    case "Shadows": return 1;
    default: return 0;
  }
}

/** 原版 slotAnimationType：Weapons[sub].animatedWeapon==0 && type==10 → 7；否则 AnimationTypes[animatedWeapon] */
export function weaponAnimType(weaponsData: any, weaponSub: number): number {
  if (!weaponsData) return 0;
  const w = weaponsData.Weapons?.[weaponSub];
  if (!w) return 0;
  const aw = w.animatedWeapon ?? 0;
  if (aw === 0 && w.type === 10) return 7;
  const t = (weaponsData.AnimationTypes ?? ANIM_TYPES)[aw];
  return typeof t === "number" ? t : 0;
}

/** 每一层的染色参数（原版 renderAnimation switch 1696-1813） */
export function layerColors(a: DollAppearance, part: string, type: number): { base: RGB; hi: RGB; main: RGB } {
  const skin = a.skinColor ?? DEF_RED, shirt = a.shirtColor ?? DEF_GREEN, hair = a.hairColor ?? DEF_BLUE;
  const pants = a.pantsColor ?? DEF_BLUE, shoes = a.shoesColor ?? DEF_BLACK, beard = a.beardColor ?? DEF_BLUE;
  const jacket = a.jacketColor ?? DEF_BLACK, headgear = a.headgearColor ?? DEF_BLACK, bracelet = a.braceletColor ?? DEF_BLACK;
  const ph = a.portraitHair ?? 0;
  switch (part) {
    case "Head": {
      const hi = (ph === 0 || ph === 18) ? skin : hair;
      return { base: skin, hi, main: headgear };
    }
    case "BackHair": return { base: DEF_BLACK, hi: hair, main: DEF_BLACK };
    case "Body": {
      const bt = bodyTypeOf(a);
      let base = skin, hi = shirt, main = jacket;
      if (bt === 5 || bt === 6) { base = (a.portraitShirt ?? 0) > 0 ? shirt : skin; hi = shirt; }
      else if ((a.portraitShirt ?? 0) === 0) hi = skin;
      return { base, hi, main };
    }
    case "Beard": return { base: DEF_BLACK, hi: beard, main: DEF_BLACK };
    case "LeftTopArm": case "RightTopArm": {
      if ((a.Jacket ?? 0) >= 14 && (a.Jacket ?? 0) <= 18) return { base: jacket, hi: jacket, main: jacket };
      const st = a.sleevesType ?? 0;
      let base = skin, hi = shirt, main = jacket;
      if (type === 1) {
        if (st === 0) hi = skin;
        if (st === 2 || st === 3 || st === 5) base = shirt;
      }
      return { base, hi, main };
    }
    case "LeftForearm": case "RightForearm": {
      if ((a.Jacket ?? 0) >= 14 && (a.Jacket ?? 0) <= 18) return { base: skin, hi: jacket, main: DEF_BLACK };
      const st = a.sleevesType ?? 0;
      let base = skin, hi = shirt, main = jacket;
      if (type === 1 || type === 2) {
        if (st < 3 || st === 4) hi = skin;
        main = bracelet;
      }
      return { base, hi, main };
    }
    // 原版 Character.renderAnimation 的腿部矩阵顺序是
    // R=skin、G=shoes、B=pants（_loc16_=shoes, _loc15_=pants）。
    // 这里若把 pants/shoes 反过来，腿部遮罩会把黑色鞋色应用到整条腿。
    case "Legs": return { base: skin, hi: shoes, main: pants };
    default: return { base: DEF_RED, hi: DEF_GREEN, main: DEF_BLUE };
  }
}

export function partPreserveColor(a: DollAppearance, part: string): boolean {
  const p = a.preserve;
  if (!p) return false;
  return !!((part === "Body" && p.preserveBodyColor) ||
    (part === "Legs" && p.preserveLegsColor) ||
    ((part === "RightTopArm" || part === "LeftTopArm") && p.preserveTopArmColor) ||
    ((part === "RightForearm" || part === "LeftForearm") && p.preserveForearmColor) ||
    (part === "ShoulderPlates" && p.preserveShoulderPlatesColor));
}

// ---- 渲染核心（离屏 canvas；浏览器内运行） ----
let dollData: DollData | null = null;
export function setDollData(d: DollData | null) { dollData = d; }
export function getDollData(): DollData | null { return dollData; }

const frameCache = new Map<string, HTMLCanvasElement>();
const MAX_FRAME_CACHE = 4000;
function cutFrame(img: HTMLImageElement, cellW: number, cellH: number, dir: number, frame: number, b: { x:number; y:number; width:number; height:number }): HTMLCanvasElement | null {
  // 资源未解码（首帧竞态）时不缓存空帧：null 会让 renderDollFrame 返回 null 跳过缓存，图片就绪后重试
  if (!img || !img.complete || !img.naturalWidth) return null;
  const over = (frame - 1) >= 80;
  const fkey = over ? frame - 81 : frame - 1;
  const col = over ? dir + 4 : dir;
  const sx = col * cellW + b.x;
  const sy = fkey * cellH + b.y;
  const src = (img as any).src || "";
  const key = src + "|" + sx + "," + sy + "," + b.width + "," + b.height;
  const hit = frameCache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = b.width; cv.height = b.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, sx, sy, b.width, b.height, 0, 0, b.width, b.height);
  if (frameCache.size >= MAX_FRAME_CACHE) frameCache.clear();
  frameCache.set(key, cv);
  return cv;
}

const tintCache = new Map<string, HTMLCanvasElement>();
const MAX_TINT_CACHE = 3000;
const tintSourceIds = new WeakMap<object, number>();
let nextTintSourceId = 1;
function tintSourceKey(src: HTMLCanvasElement | HTMLImageElement): string {
  const url = (src as any).src;
  if (typeof url === "string" && url) return url;
  const obj = src as unknown as object;
  let id = tintSourceIds.get(obj);
  if (!id) {
    id = nextTintSourceId++;
    tintSourceIds.set(obj, id);
  }
  return "canvas#" + id;
}
export function tintCanvas(src: HTMLCanvasElement | HTMLImageElement, base: RGB, hi: RGB, main: RGB, bc = 1): HTMLCanvasElement {
  const w = (src as any).naturalWidth ?? (src as any).width ?? 0;
  const h = (src as any).naturalHeight ?? (src as any).height ?? 0;
  if (!w || !h) return src as HTMLCanvasElement;
  // Raw frame canvases all have the same dimensions and no .src. Include the
  // actual source identity so different body/arm/leg frames never share tint.
  const srcKey = tintSourceKey(src) + "|" + (src as HTMLCanvasElement).width + "x" + (src as HTMLCanvasElement).height;
  const key = srcKey + "|" + [base.r,base.g,base.b,base.bc ?? bc,hi.r,hi.g,hi.b,hi.bc ?? bc,main.r,main.g,main.b,main.bc ?? bc].join(",");
  const hit = tintCache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(src as CanvasImageSource, 0, 0);
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  const baseBc = base.bc ?? bc, hiBc = hi.bc ?? bc, mainBc = main.bc ?? bc;
  const br = base.r / 255 * baseBc, bg = base.g / 255 * baseBc, bb = base.b / 255 * baseBc;
  const hr = hi.r / 255 * hiBc, hg = hi.g / 255 * hiBc, hb = hi.b / 255 * hiBc;
  const mr = main.r / 255 * mainBc, mg = main.g / 255 * mainBc, mb = main.b / 255 * mainBc;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i+3] === 0) continue;
    const R = px[i] / 255, G = px[i+1] / 255, B = px[i+2] / 255;
    px[i]   = Math.min(255, Math.round((br * R + hr * G + mr * B) * 255));
    px[i+1] = Math.min(255, Math.round((bg * R + hg * G + mg * B) * 255));
    px[i+2] = Math.min(255, Math.round((bb * R + hb * G + mb * B) * 255));
  }
  ctx.putImageData(d, 0, 0);
  if (tintCache.size >= MAX_TINT_CACHE) tintCache.clear();
  tintCache.set(key, cv);
  return cv;
}

export interface DollRenderOpts {
  animType?: number;
  phase?: number;
  frame?: number;
  dir?: number;
  weaponSub?: number;
  assets: AssetStore;
  data: DollData;
  appearance: DollAppearance;
  onMissing?: (name: string) => void;
}

/** 合成一帧 100x100 人物画布（原版 renderAnimation 返回的 BitmapData） */
export function renderDollFrame(o: DollRenderOpts): HTMLCanvasElement | null {
  const { assets, data, appearance } = o;
  const dir = (o.dir ?? 0) % 4;
  const phase = o.phase ?? 0;
  const frame = o.frame ?? 1;
  const animType = o.animType ?? 0;
  const weaponSub = o.weaponSub ?? 0;
  let order: string[] = LAYER_ORDER[dir] ?? LAYER_ORDER[0];
  if (phase === 4) {
    if (dir === 0 && frame > 7) order = DEATH_ORDER[0];
    else if (dir === 1 && frame > 3) order = DEATH_ORDER[1];
    else if (dir === 2 && frame > 3) order = DEATH_ORDER[2];
    else if (dir === 3 && frame > 7) order = DEATH_ORDER[3];
  } else if (dir === 1) {
    const st = weaponAnimType((globalThis as any).__c2?.ds?.weapons, weaponSub);
    if (st === 1 && (frame < 4 || frame >= 14)) order = ["BackHair","BigGunBackpack","LeftTopArm","Legs","Body","LeftForearm","RightTopArm","ShoulderPlates","Head","Beard","RightForearm","Weapon"];
    else if (st === 3) order = ["BackHair","BigGunBackpack","LeftTopArm","Legs","Body","LeftForearm","ShoulderPlates","RightTopArm","Head","Beard","Weapon","RightForearm"];
    else if (st === 2 && (frame === 1 || (frame >= 16 && frame <= 18))) order = ["BackHair","BigGunBackpack","LeftTopArm","Legs","Body","RightTopArm","ShoulderPlates","Head","Beard","RightForearm","Weapon","LeftForearm"];
    else if (st === 0) {
      if (frame > 4 && frame < 14) order = ["BackHair","BigGunBackpack","LeftForearm","LeftTopArm","Legs","Body","RightTopArm","ShoulderPlates","Head","Beard","RightForearm","Weapon"];
      else order = ["BackHair","BigGunBackpack","LeftTopArm","Legs","Body","ShoulderPlates","Head","Beard","LeftForearm","RightTopArm","RightForearm","Weapon"];
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = 100; canvas.height = 100;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 100, 100);
  const wd = (globalThis as any).__c2?.ds?.weapons ?? null;
  const frames = data.fullAnimationTypeFrames?.[animType]?.[phase];
  if (!frames || !frames.length) return canvas;
  const frameMap = frames[Math.max(0, Math.min(frame - 1, frames.length - 1))] ?? frames[0];
  const missing: string[] = [];
  for (const part of order) {
    const cat = PART_CATEGORY[part] ?? "body";
    const fNum = cat === "shadow" ? (frameMap.shadow ?? 1) : cat === "weapon" ? (frameMap.weapon ?? 1) : cat === "arms" ? (frameMap.arms ?? 1) : cat === "legs" ? (frameMap.legs ?? 1) : (frameMap.body ?? 1);
    const type = partTypeOf(appearance, part, wd, weaponSub);
    if (!type) continue;
    const dim = data.spriteDimensions?.[part]?.[String(type)];
    if (!dim) continue;
    const bMap = data.spriteBoundaries?.[part]?.[String(type)]?.[String(dir)];
    const b = bMap?.[String(fNum)];
    if (!b) continue;
    const img = assets.getImage(part + type + ".png");
    if (!img || !img.complete || !img.naturalWidth) { missing.push(part + type + ".png"); continue; }
    const preserve = part === "Weapon" || part === "BigGunBackpack" || partPreserveColor(appearance, part);
    const raw = cutFrame(img, dim.width, dim.height, dir, fNum, b);
    if (!raw) { missing.push(part + type + ".png"); continue; }
    let layer: HTMLCanvasElement;
    if (preserve) layer = raw;
    else {
      const col = layerColors(appearance, part, type);
      layer = tintCanvas(raw, col.base, col.hi, col.main, col.base.bc ?? 1);
    }
    ctx.drawImage(layer, b.x, b.y + walkBobY(phase, frame, cat));
  }
  if (missing.length) {
    if (o.onMissing) o.onMissing(missing.join(","));
    return null; // 素材未就绪 → 不返回残帧（调用方不缓存，下帧重试）
  }
  return canvas;
}

function walkBobY(phase: number, frame: number, cat: string): number {
  if (phase !== 1 || cat === "legs") return 0;
  if (frame === 1 || frame === 5) return -2;
  if (frame === 2 || frame === 4 || frame === 6 || frame === 8) return -1;
  return 0;
}

export { frameCache, tintCache, renderCache, LAYER_ORDER };


// ---------------- 动画状态机（原版 BattleField EF 帧循环的轻量移植） ----------------
// 原版：每帧 currFrame+1（walk 时 +walkAnimationSpeed），动画帧 8/13/3/16（phase1-4）@25fps；
// 移动每 4 帧走 1 格（x += dir*squareWidth/4）。本移植的伤害/回合是即时结算的，
// 动画只是视觉回放：logic x/y 立即到位，显示层用 DollAnim.dispX/dispY 插值播放。

export interface DollWalkStep { x: number; y: number; dir: number }
export interface DollAnim {
  phase: number;      // 0闲置 1走 2攻击 3受击 4死亡
  frame: number;      // 1-based（phase 内部帧）
  acc: number;        // 秒累计
  dir: number;        // 0..3
  animType: number;
  weaponSub: number;
  dispX: number; dispY: number;   // 显示用世界坐标（步行插值；静止=逻辑坐标）
  walk: {
    steps: DollWalkStep[]; idx: number; stepT: number; stepDur: number;
    fromX: number; fromY: number; toX: number; toY: number;
  } | null;
  hidden: boolean;    // 立即隐藏（收押/放走）
  done: boolean;      // phase 播放完成（death 后保持末帧；attack/hit 后回 idle）
}
export const DOLL_FPS = 25;
export const STEP_DUR = 0.16; // 每格秒（原版 4 帧 @25fps）

export function newDollAnim(animType = 0, weaponSub = 0, dir = 1): DollAnim {
  return { phase: 0, frame: 1, acc: 0, dir, animType, weaponSub, dispX: 0, dispY: 0, walk: null, hidden: false, done: false };
}

/** 方向：原版 startAttack —— |dx|>|dy| 横向，否则纵向；return 0上 1右 2下 3左 */
export function dirFromDelta(dx: number, dy: number): number {
  // 保留 startAttack 的调用语义：Battle 传入 attacker - target 反向向量。
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 3 : 1;
  return dy > 0 ? 0 : 2;
}
export function dirBetween(ax: number, ay: number, bx: number, by: number): number {
  return dirFromDelta((bx - ax) * 32, (by - ay) * 32);
}

/** 开始步行（cells = 剩余格子，不包含起点；调用方已扣 AP/更新逻辑坐标） */
export function startWalk(a: DollAnim, fromX: number, fromY: number, cells: Array<{ x: number; y: number }>): void {
  if (!cells.length) return;
  const steps: DollWalkStep[] = [];
  let px = Math.round(fromX / 32) - 0.5, py = Math.round(fromY / 32) - 0.5; // 起点格
  const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
  // Normalize the center point to its containing grid cell before deriving directions.
  px = Math.floor(fromX / 32) - 0.5;
  py = Math.floor(fromY / 32) - 0.5;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const dx = c.x - (px + 0.5), dy = c.y - (py + 0.5);
    let d = 1;
    for (let k = 0; k < 4; k++) if (dirs[k][0] === dx && dirs[k][1] === dy) { d = k; break; }
    steps.push({ x: c.x, y: c.y, dir: d });
    px = c.x - 0.5; py = c.y - 0.5;
  }
  // 终点格保留真实行进方向（否则单格/末格方向会被 4 覆盖成默认右向 = 永远朝右）
  a.phase = 1; a.frame = 1; a.acc = 0; a.done = false;
  a.walk = { steps, idx: 0, stepT: 0, stepDur: STEP_DUR, fromX, fromY, toX: 0, toY: 0 };
  const s0 = steps[0];
  a.dir = s0.dir < 4 ? s0.dir : 1;
  a.walk.toX = (s0.x + 0.5) * 32;
  a.walk.toY = (s0.y + 0.5) * 32;
  a.dispX = fromX; a.dispY = fromY;
}

/** 推进一帧（dt 秒）。phase 完成时 done=true（攻击/受击/移动回 idle，死亡保持末帧） */
export function advanceDoll(a: DollAnim, dt: number, data: DollData): number {
  let advanced = 0;
  a.acc += dt;
  const len = (phase: number) => data.fullAnimationTypeFrames?.[a.animType]?.[phase]?.length ?? 1;
  if (a.phase === 1 && a.walk) {
    const w = a.walk;
    w.stepT += dt;
    const stepDur = w.stepDur;
    while (w.stepT >= stepDur - 1e-9) {
      w.stepT = Math.max(0, w.stepT - stepDur);
      w.idx++;
      advanced++;
      w.fromX = w.toX; w.fromY = w.toY;
      if (w.idx >= w.steps.length) {
        a.dispX = w.toX; a.dispY = w.toY;
        a.phase = 0; a.frame = 1; a.acc = 0; a.walk = null; a.done = true;
        return advanced;
      }
      const s = w.steps[w.idx];
      if (s.dir < 4) a.dir = s.dir;
      w.toX = (s.x + 0.5) * 32; w.toY = (s.y + 0.5) * 32;
    }
    const k = Math.min(w.stepT / stepDur, 1);
    a.dispX = w.fromX + (w.toX - w.fromX) * k;
    a.dispY = w.fromY + (w.toY - w.fromY) * k;
    a.frame = ((w.idx * 4 + Math.floor(w.stepT / stepDur * 4)) % 8) + 1; // 每步 4 帧，8 帧循环
    return advanced;
  }
  if (a.phase === 0) { a.frame = 1; return advanced; }
  const L = len(a.phase);
  const fps = a.phase === 4 ? 25 : 25;
  a.frame = Math.floor(a.acc * fps) + 1;
  if (a.frame > L) {
    if (a.phase === 4) { a.frame = L; a.done = true; }
    else if (a.phase === 2) { a.phase = 0; a.frame = 1; a.acc = 0; a.done = true; }
    else if (a.phase === 3) { a.phase = 0; a.frame = 1; a.acc = 0; a.done = true; }
  }
  return advanced;
}

export function startPhase(a: DollAnim, phase: number, animType: number, weaponSub: number, dir: number): void {
  a.phase = phase; a.acc = 0; a.frame = 1; a.animType = animType; a.weaponSub = weaponSub; a.dir = dir; a.done = false; a.walk = null;
  a.dispX = a.dispX; a.dispY = a.dispY;
}

// ---- 外观指纹 + 帧缓存 ----
export function appearanceKey(a: DollAppearance): string {
  const p = (v: any, d = 0) => v === undefined || v === null ? d : Math.round(Number(v) * 100) / 100;
  const c = (x?: RGB) => x ? (x.r | 0) + "," + (x.g | 0) + "," + (x.b | 0) + ":" + p(x.bc, 1) : "n";
  return [
    p(a.gender), p(a.age, 25), p(a.sleevesType), p(a.Jacket), p(a.Headgear),
    p(a.originalBodyType), p(a.originalHead), p(a.originalBackHairType), p(a.originalBeardType),
    p(a.LegsType), p(a.portraitShirt), p(a.portraitHair),
    c(a.skinColor), c(a.hairColor), c(a.shirtColor), c(a.pantsColor), c(a.shoesColor), c(a.beardColor),
    c(a.jacketColor), c(a.headgearColor), c(a.braceletColor),
    a.hasLeftBracelet ? 1 : 0, a.hasRightBracelet ? 1 : 0,
    a.BodyType ?? 0, a.HeadType ?? 0, a.BackHairType ?? 0, a.BeardType ?? 0,
    a.LeftTopArmType ?? 0, a.RightTopArmType ?? 0, a.LeftForearmType ?? 0, a.RightForearmType ?? 0, a.ShoulderPlatesType ?? 0,
    a.preserve ? JSON.stringify(a.preserve) : "",
  ].join("|");
}
const renderCache = new Map<string, HTMLCanvasElement>();
const MAX_RENDER_CACHE = 700;
export function clearRenderCache() { renderCache.clear(); }
export function cachedDollFrame(o: DollRenderOpts, appKey: string): HTMLCanvasElement | null {
  const key = appKey + "|" + (o.animType ?? 0) + "|" + (o.phase ?? 0) + "|" + (o.frame ?? 1) + "|" + (o.dir ?? 0) + "|" + (o.weaponSub ?? 0);
  const hit = renderCache.get(key);
  if (hit) return hit;
  const cv = renderDollFrame(o);
  if (!cv) return null; // 素材未就绪/缺层 → 不缓存，调用方保持 lastKey 以便重试
  if (renderCache.size >= MAX_RENDER_CACHE) renderCache.clear();
  renderCache.set(key, cv);
  return cv;
}


/** BattleField.dropWeapon: 50x50 ground bitmap, never the inventory weaponIcon. */
export function renderDroppedWeapon(assets: AssetStore, data: DollData, weapons: any, sub: number): HTMLCanvasElement | null {
  const def = weapons.Weapons?.[sub];
  if (!def || !data) return null;
  const cv = document.createElement("canvas"); cv.width = cv.height = 50;
  const ctx = cv.getContext("2d")!;
  let ready = true;
  const part = (name: string, type: number, dir: number) => {
    const bounds = data.spriteBoundaries?.[name]?.[type]?.[dir];
    const frame = Math.max(...Object.keys(bounds ?? {}).map(Number));
    const b = bounds?.[frame];
    const dim = data.spriteDimensions?.[name]?.[type];
    const img = assets.getImage(name + type + ".png");
    if (!img || !b || !dim) { ready = false; return; }
    const cut = cutFrame(img, dim.width, dim.height, dir, frame, b);
    if (!cut) { ready = false; return; }
    ctx.drawImage(cut, 25 - Math.round(b.width / 2), 25 - Math.round(b.height / 2));
  };
  if (weapons.WeaponTypes?.[def.type]?.category === 5) {
    const img = assets.getImage("Grenade.png");
    if (!img) return null;
    ctx.drawImage(img, 0, 0, 10, 10, 20, 20, 10, 10);
  } else {
    if (def.bigGunBackpack > 0) part("BigGunBackpack", def.bigGunBackpack, 1);
    if (def.animatedWeapon > 0) part("Weapon", def.animatedWeapon, 0);
  }
  return ready ? cv : null;
}
