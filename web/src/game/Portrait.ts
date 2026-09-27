// 肖像合成：原版 Character.generatePortrait 的 3 色 ColorMatrix 管线（公共模块）
// 创建角色页 / 人员页 / 对话页共用：buildPortraitFromCharacter(assets, character, scale)
// 3 色矩阵：R' = base.r·R + hi.r·G + main.r·B（归一化，逐像素）；17 层 LAYER_ORDER + 部件位偏移
import { Sprite, BitmapObject } from "../core/Display";
import type { AssetStore } from "../core/Assets";

// 原版 generatePortrait 图层顺序（后面=上层）
export const LAYER_ORDER = ["BackHair", "Shoulders", "Shirt", "Necklace", "BackBeard", "Head", "EyeSockets", "Ears", "Wrinkles", "Eyes", "Eyebrows", "Nose", "Mouth", "Whiskers", "Beard", "Moustache", "Hair"];
// 原版 portraitBackHair：这些发型没有后层
const BACK_HAIR_EXCLUDED = new Set([1, 14, 18, 20, 21, 23, 24, 29, 31]);
// 原版 portraitBackBeard：只有这些胡型有后层
const BACK_BEARD_INCLUDED = new Set([3, 4, 11, 13, 17, 18]);

export type RGB = { r: number; g: number; b: number };

export function rgb2hsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: mx === 0 ? 0 : (d / mx) * 100, v: mx * 100 };
}
export function hsv2rgb(h: number, s: number, v: number): RGB {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

const DEFAULT_COLORS: Record<string, RGB> = {
  skin: { r: 200, g: 160, b: 140 },
  hair: { r: 30, g: 20, b: 5 },
  lips: { r: 150, g: 60, b: 40 },
  eyes: { r: 30, g: 25, b: 10 },
  eyeSockets: { r: 60, g: 45, b: 30 },
  eyebrows: { r: 30, g: 20, b: 5 },
  beard: { r: 30, g: 20, b: 5 },
  shirt: { r: 70, g: 62, b: 56 },
};

// ---------- 3 色矩阵（逐像素，模块级缓存） ----------
const tintCache = new Map<string, HTMLCanvasElement>();
export function tintLayer(img: HTMLImageElement, base: RGB, hi: RGB, main: RGB): HTMLCanvasElement {
  const key = (img as any).src + "|" + [base.r, base.g, base.b, hi.r, hi.g, hi.b, main.r, main.g, main.b].join(",");
  const hit = tintCache.get(key);
  if (hit) return hit;
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  const br = base.r / 255, bg = base.g / 255, bb = base.b / 255;
  const hr = hi.r / 255, hg = hi.g / 255, hb = hi.b / 255;
  const mr = main.r / 255, mg = main.g / 255, mb = main.b / 255;
  for (let i = 0; i < px.length; i += 4) {
    const R = px[i] / 255, G = px[i + 1] / 255, B = px[i + 2] / 255;
    px[i] = Math.min(255, Math.round((br * R + hr * G + mr * B) * 255));
    px[i + 1] = Math.min(255, Math.round((bg * R + hg * G + mg * B) * 255));
    px[i + 2] = Math.min(255, Math.round((bb * R + hb * G + mb * B) * 255));
  }
  ctx.putImageData(d, 0, 0);
  tintCache.set(key, cv);
  return cv;
}

// ---------- Character 外观归一化（兼容两套结构） ----------
// 创建页 theCharacter: { colors:{skin,hair,...}, parts:{head,hair,...}, bristleGrade }
// 原版/存档 Character: { skinColor,hairColor,..., portraitHead,portraitHair,..., race }
export interface PortraitSpec {
  colors: Record<string, RGB>;
  parts: Record<string, number>;
  bristleGrade: number;
  gender: number;
  age: number;
}

export function normalizePortraitCharacter(ch: any): PortraitSpec {
  const c = ch ?? {};
  const col = c.colors ?? {};
  const pickColor = (setupKey: string, origKey: string, def: RGB): RGB =>
    col[setupKey] ?? c[origKey] ?? def;
  const colors: Record<string, RGB> = {
    skin: pickColor("skin", "skinColor", DEFAULT_COLORS.skin),
    hair: pickColor("hair", "hairColor", DEFAULT_COLORS.hair),
    lips: pickColor("lips", "lipsColor", DEFAULT_COLORS.lips),
    eyes: pickColor("eyes", "eyesColor", DEFAULT_COLORS.eyes),
    eyeSockets: pickColor("eyeSockets", "eyeSocketsColor", DEFAULT_COLORS.eyeSockets),
    eyebrows: pickColor("eyebrows", "eyebrowsColor", DEFAULT_COLORS.eyebrows),
    beard: pickColor("beard", "beardColor", DEFAULT_COLORS.beard),
    shirt: pickColor("shirt", "shirtColor", DEFAULT_COLORS.shirt),
  };
  const pt = c.parts ?? {};
  const pickPart = (setupKey: string, origKey: string, def: number): number => {
    const v = pt[setupKey] ?? c[origKey];
    return v === undefined || v === null ? def : Number(v);
  };
  const parts: Record<string, number> = {
    head: pickPart("head", "portraitHead", 1),
    hair: pickPart("hair", "portraitHair", 0),
    mouth: pickPart("mouth", "portraitMouth", 1),
    nose: pickPart("nose", "portraitNose", 1),
    eyebrows: pickPart("eyebrows", "portraitEyebrows", 0),
    eyes: pickPart("eyes", "portraitEyes", 1),
    ears: pickPart("ears", "portraitEars", 1),
    beard: pickPart("beard", "portraitBeard", 0),
    moustache: pickPart("moustache", "portraitMoustache", 0),
    whiskers: pickPart("whiskers", "portraitWhiskers", 0),
    shirt: pickPart("shirt", "portraitShirt", 0),
    necklace: pickPart("necklace", "portraitNecklace", 0),
    wrinkles: pickPart("wrinkles", "portraitWrinkles", 0),
    eyeSockets: pickPart("eyeSockets", "portraitEyeSockets", 0),
    shoulders: pickPart("shoulders", "portraitShoulders", 1),
  };
  return {
    colors,
    parts,
    bristleGrade: Number(c.bristleGrade ?? c.bristle ?? 0),
    gender: Number(c.gender ?? 1),
    age: Number(c.age ?? 25),
  };
}

// ---------- 原版 race 肤色/发色派生（确定性：seed → rand 序列） ----------
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
// 原版 Character 构造：skin 按 race 公式；hair 按 race/age 五分支；lips/eyebrows/eyes 派生
export function raceColors(seed: number, gender = 1, age = 25): Record<string, RGB> {
  const rand = seededRand(seed);
  const race = rand();
  let r6 = rand();
  if (race < 0.3 && r6 < 0.5) r6 = 0.5;
  if (race > 0.7 && r6 < 0.3) r6 = 0.3;
  if (race > 0.7 && r6 > 0.7) r6 = 0.7;
  const h = 25 - Math.abs(race - 0.5) * 20;
  const s = 20 + r6 * 15;
  const v = Math.min(90 - r6 * 45, 100);
  const skin = hsv2rgb(h, s, v);
  // lips：由 skin HSV 微调（性别差异）
  const lh = rgb2hsv(skin.r, skin.g, skin.b);
  const lips = hsv2rgb(
    Math.max(0, lh.h - (gender === 1 ? rand() * 6 + 1 : rand() * 10 + 5)),
    Math.min(100, lh.s + (gender === 1 ? rand() * 7 + 1 : rand() * 10 + 5)),
    Math.max(0, lh.v - rand() * 3),
  );
  // hair：原版 race/age 五分支（age>40 白发 / race<0.1 黑 / race>0.9 浅 / 棕 / 灰）
  let hair: RGB;
  if (age > 40 && rand() < age / 100 - race / 3) {
    hair = hsv2rgb(0, 0, 60 + rand() * 40);
  } else if (race < 0.1 || rand() < 0.5 - race / 2) {
    hair = hsv2rgb(10 + rand() * 10, 50 + rand() * 30, 5 + rand() * 20);
  } else if (race > 0.9 || rand() < race / 4) {
    hair = hsv2rgb(30 + rand() * 10, 15 + rand() * 7, 80 + rand() * 10);
  } else if (rand() < 0.2 + race / 10) {
    hair = hsv2rgb(5 + rand() * 30, 60 + rand() * 20, 40 + rand() * 20);
  } else if (rand() < race / 10 + 0.1) {
    hair = hsv2rgb(40 + rand() * 10, 15 + rand() * 10, 55 + rand() * 20);
  } else {
    const hv = 20 + rand() * 80;
    hair = hsv2rgb(40 - hv / 5, 100 - hv, hv);
  }
  // eyebrows：hair 加深
  const eh = rgb2hsv(hair.r, hair.g, hair.b);
  const eyebrows = hsv2rgb(eh.h, Math.min(100, eh.s + 5 + rand() * 10), Math.max(0, eh.v - 10 - rand() * 20));
  // eyes：race 相关（浅色/棕色/深色）
  let eyes: RGB;
  if (rand() < race) eyes = hsv2rgb(120 + rand() * 130, 5 + rand() * 30, 20 + rand() * 50);
  else eyes = hsv2rgb(20 + rand() * 30, 30 + rand() * 30, 10 + rand() * 20);
  // beard/moustache 用 hair；eyeSockets 用 skin；shirt 灰棕
  return {
    skin, lips, hair,
    eyes,
    eyebrows,
    beard: hair,
    eyeSockets: skin,
    shirt: hsv2rgb(rand() * 40, 10 + rand() * 20, 40 + rand() * 30),
  };
}

// ---------- 部件种子（无外观数据时确定性生成；头发等按性别/年龄可用集） ----------
function seededParts(seed: number, gender: number, age: number): Record<string, number> {
  const rand = seededRand(seed);
  const pick = (opts: number[]): number => opts.length ? opts[Math.floor(rand() * opts.length)] : 0;
  const hairMale = gender === 1
    ? (age < 30 ? [0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 17, 19, 20, 21, 23, 24, 25, 26, 27, 28]
      : age < 45 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]
      : [0, 1, 6, 7, 8, 9, 12, 13, 15, 16, 18, 19, 20, 21, 22, 24, 29])
    : [0, 1, 2, 3, 4, 5, 6, 10, 12, 14, 30, 31];
  return {
    head: pick(gender === 1 ? (age < 25 ? [1, 2, 3, 6, 9] : age < 40 ? [1, 2, 3, 4, 6, 8, 9] : [1, 3, 4, 5, 6, 7, 8, 9]) : [1, 2, 9]),
    hair: pick(hairMale),
    mouth: pick(gender === 1 ? [2, 3, 4, 5, 6, 7, 9, 11] : [1, 8, 9, 10, 11, 12]),
    nose: pick(gender === 1 ? [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16] : [2, 6, 11, 13, 14, 15, 16]),
    eyebrows: pick(gender === 1 ? [1, 3, 4, 6, 7, 8, 9, 10, 11] : [2, 5, 7]),
    eyes: pick(gender === 1 ? [1, 2, 4, 5, 6, 7, 8, 9, 10, 11] : [1, 3, 10, 11, 12, 13]),
    ears: pick([1, 2, 3, 4, 5, 6, 7]),
    beard: gender === 1 && age >= 22 ? pick([0, 1, 2, 4, 7, 8, 9, 10, 11, 12, 13, 15, 16, 19]) : 0,
    moustache: gender === 1 && age >= 22 ? pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) : 0,
    whiskers: gender === 1 && age >= 22 ? pick([0, 1, 2, 3, 4]) : 0,
    shirt: pick([0, 1, 2, 3, 4]),
    necklace: rand() < 0.4 ? 1 : 0,
    wrinkles: age >= 40 ? pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) : 0,
    eyeSockets: 1,
    shoulders: 1,
  };
}

// ---------- 按 Character 生成（3 色矩阵 17 层） ----------

function buildInto(sp: Sprite, assets: AssetStore, spec: PortraitSpec, loadMissing = true) {
  const built = new Sprite();
  const { colors, parts, bristleGrade } = spec;
  const skin = colors.skin, hair = colors.hair, beard = colors.beard, lips = colors.lips;
  const eyes = colors.eyes, eyeSoc = colors.eyeSockets, brows = colors.eyebrows, shirt = colors.shirt;
  const skinHsv = rgb2hsv(skin.r, skin.g, skin.b);
  const adj = hsv2rgb(Math.max(skinHsv.h - 10, 0), Math.min(skinHsv.s + 10, 100), skinHsv.v);
  const bristleCol = spec.gender === 2 ? skin : hsv2rgb(skinHsv.h, Math.max(skinHsv.s - bristleGrade * 10, 0), Math.max(skinHsv.v - bristleGrade * 10, 0));
  const white = { r: 240, g: 225, b: 210 };
  const white2 = { r: 250, g: 240, b: 230 };
  const black: RGB = { r: 0, g: 0, b: 0 };

  const layerTint = (key: string): { base: RGB; hi: RGB; main: RGB } => {
    switch (key) {
      case "Shoulders": case "Ears": case "Wrinkles": case "Nose": return { base: skin, hi: adj, main: black };
      case "Head": return { base: skin, hi: adj, main: bristleCol };
      case "Eyes": return { base: eyeSoc, hi: white, main: eyes };
      case "Mouth": return { base: skin, hi: white2, main: lips };
      case "Hair": case "Whiskers": case "BackHair": return { base: skin, hi: black, main: hair };
      case "Beard": case "BackBeard": case "Moustache": return { base: skin, hi: black, main: beard };
      case "Eyebrows": return { base: skin, hi: black, main: brows };
      case "EyeSockets": return { base: eyeSoc, hi: black, main: black };
      case "Shirt": return { base: black, hi: black, main: shirt };
      default: return { base: black, hi: black, main: black };
    }
  };

  const backHair = BACK_HAIR_EXCLUDED.has(parts.hair ?? 1) ? 0 : (parts.hair ?? 1);
  const backBeard = BACK_BEARD_INCLUDED.has(parts.beard ?? 0) ? (parts.beard ?? 0) : 0;
  const headIdx = parts.head ?? 1;
  const beardIdx = parts.beard ?? 0;
  const mouthIdx = parts.mouth ?? 1;

  const missing: string[] = [];
  const putLayer = (key: string, idx: number, raw = false) => {
    if (idx <= 0) return;
    const name = "CP" + key + idx + ".png";
    const img = assets.getImage(name);
    if (!img) { missing.push(name); return; }
    const t = layerTint(key);
    const canvas = raw ? (img as any) : tintLayer(img, t.base, t.hi, t.main);
    const b = new BitmapObject(canvas as any);
    let dx = 0, dy = 0;
    if ((key === "Beard" || key === "BackBeard") && beardIdx !== 9 && beardIdx !== 4 && beardIdx !== 19) {
      if (headIdx === 4) dx = -1;
      else if (headIdx === 7) { dx = -7; dy = 2; }
    }
    if (key === "Moustache" || (key === "Beard" && beardIdx === 9)) {
      if (mouthIdx === 5) dy = -3;
      else if (mouthIdx === 2) dx = -2;
      else if (mouthIdx === 6) { dx = -3; dy = -3; }
    }
    b.x = -1 + dx; b.y = -1 + dy;
    built.addChild(b);
  };

  for (const layer of LAYER_ORDER) {
    switch (layer) {
      case "BackHair": putLayer("BackHair", backHair); break;
      case "Shoulders": putLayer("Shoulders", parts.shoulders ?? 1); break;
      case "Shirt": putLayer("Shirt", parts.shirt ?? 0); break;
      case "Necklace": putLayer("Necklace", parts.necklace ?? 0, true); break;
      case "BackBeard": putLayer("BackBeard", backBeard); break;
      case "Head": putLayer("Head", headIdx); break;
      case "EyeSockets": putLayer("EyeSockets", parts.eyeSockets ?? 0); break;
      case "Ears": putLayer("Ears", parts.ears ?? 0); break;
      case "Wrinkles": putLayer("Wrinkles", parts.wrinkles ?? 0); break;
      case "Eyes": putLayer("Eyes", parts.eyes ?? 0); break;
      case "Eyebrows": putLayer("Eyebrows", parts.eyebrows ?? 0); break;
      case "Nose": putLayer("Nose", parts.nose ?? 0); break;
      case "Mouth": putLayer("Mouth", parts.mouth ?? 0); break;
      case "Whiskers": putLayer("Whiskers", parts.whiskers ?? 0); break;
      case "Beard": putLayer("Beard", beardIdx); break;
      case "Moustache": putLayer("Moustache", parts.moustache ?? 0); break;
      case "Hair": putLayer("Hair", parts.hair ?? 0); break;
    }
  }
  // Every portrait subscribes to the shared requests. A global attempted flag left
  // the second portrait blank when its layers were already loading for the first.
  sp.removeAll();
  for (const child of built.children.slice()) sp.addChild(child);
  if (loadMissing && missing.length) {
    void Promise.all(missing.map(n => assets.ensure(n).catch(() => null)))
      .then(() => buildInto(sp, assets, spec, false))
      .catch(() => undefined); // Failed optional layers must not cause an endless retry.
  }
}

/** 无外观数据的 Character（NPC/雇工等）：按 name/age seed 生成 race 肤色 + 部件 */
function seedFor(character: any): number {
  const c = character ?? {};
  const name = typeof c.name === "string" ? c.name : String(c.charId ?? c.id ?? 0);
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) + (Number(c.age ?? 25) * 7919) + (Number(c.gender ?? 1) * 131);
}

// t93：逐层位图"内容包围盒"缓存（读取 alpha>8 的像素范围）。
// 关键：合层的画布是 250x250 全幅（透明边距），子节点矩形永远 = 全幅；
// 必须按图像素 alpha 才能得到真实人物范围（否则 fit 永远 f=1 不生效）。
const contentRectCache = new Map<any, { x: number; y: number; w: number; h: number }>();
function contentRectOf(src: any): { x: number; y: number; w: number; h: number } {
  const hit = contentRectCache.get(src);
  if (hit) return hit;
  let cv: HTMLCanvasElement;
  if (typeof src?.getContext === "function") cv = src;
  else {
    cv = document.createElement("canvas");
    cv.width = src?.naturalWidth ?? src?.width ?? 0;
    cv.height = src?.naturalHeight ?? src?.height ?? 0;
    if (cv.width > 0 && cv.height > 0) cv.getContext("2d")!.drawImage(src, 0, 0);
  }
  const w = cv.width, h = cv.height;
  let r: { x: number; y: number; w: number; h: number };
  if (w <= 0 || h <= 0) r = { x: 0, y: 0, w: 1, h: 1 };
  else {
    const d = cv.getContext("2d")!.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (d[row + x * 4 + 3] > 8) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    r = minX > maxX ? { x: 0, y: 0, w: 1, h: 1 } : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  contentRectCache.set(src, r);
  return r;
}

/**
 * t93：把合成肖像按"实际可见内容"等比放大铺满 target 见方区域（只放大不缩小）。
 * 原版 generatePortrait 用 250x250 满幅画布，人物画像是内容本身铺满卡片；
 * 这里按 alpha 内容求并集 bbox，消除头像下方/四周露出深底卡面的"黑框"空隙。
 * 返回 { offX, offY }（内容左上角相对 sprite 原点的偏移，父级定位时减去即可把它对齐到目标区左上角）。
 */
export function fitPortraitToBox(sp: Sprite, target: number): { offX: number; offY: number } | null {
  let minX = 0, minY = 0, maxX = 0, maxY = 0, has = false;
  const span = (x: number, y: number, w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    if (!has) { minX = x; minY = y; maxX = x + w; maxY = y + h; has = true; }
    else {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w; if (y + h > maxY) maxY = y + h;
    }
  };
  for (const ch of sp.children as any[]) {
    const img = (ch as any).image;
    if (!img) continue;
    const r = contentRectOf(img);
    span((Number(ch.x) || 0) + r.x, (Number(ch.y) || 0) + r.y, r.w, r.h);
  }
  if (!has) return null;
  const cw = maxX - minX, ch2 = maxY - minY;
  if (cw <= 0 || ch2 <= 0) return null;
  const cur = sp.scaleX ?? 1;
  const f = target / Math.max(cw * cur, ch2 * cur);
  if (f <= 1.001) return null; // 已铺满：不缩小（原版画像本身也可能贴边/被裁）
  sp.scaleX = cur * f;
  sp.scaleY = (sp.scaleY ?? 1) * f;
  return { offX: minX * sp.scaleX, offY: minY * sp.scaleY };
}

/** 统一入口：按 Character 实际 colors/parts 生成；缺失时用 race 公式种子生成 */
export function buildPortraitFromCharacter(assets: AssetStore, character: any, scale = 0.3): Sprite {
  const c = character ?? {};
  const hasAppearance = !!(c.colors || c.skinColor || c.parts || c.portraitHead);
  const sp = new Sprite();
  sp.scaleX = scale;
  sp.scaleY = scale;
  let spec: PortraitSpec;
  if (hasAppearance) {
    spec = normalizePortraitCharacter(c);
  } else {
    const seed = seedFor(c);
    const gender = Number(c.gender ?? (seed % 2 === 0 ? 1 : 2));
    const age = Number(c.age ?? 25);
    spec = {
      colors: raceColors(seed, gender, age),
      parts: seededParts(seed + 7, gender, age),
      bristleGrade: 0,
      gender,
      age,
    };
  }
  buildInto(sp, assets, spec);
  return sp;
}

// ---------- 旧接口兼容（简单乘子版本，已弃用；保留导出避免破坏旧引用） ----------
export function seededPortrait(seed: number): { parts: Record<string, number>; colors: Record<string, RGB>; gender: number } {
  const gender = seed % 2 === 0 ? 1 : 2;
  const colors = raceColors(seed, gender, 25);
  const parts = seededParts(seed + 7, gender, 25);
  return { parts, colors, gender };
}
