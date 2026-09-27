// ItemIcon.ts — 原版 Item.picture 图标管线（Item.as L2536-2771 翻译）
// 规则：cat1 货物=itemIcon{pictureFrom|subCategory}.png（特殊 subCategory 用行业符号/叠加）；
// cat2 武器=weaponIcon{sub|icon}.png；cat3 弹药=ammoIcon{type}.png + 名称/variation 文本；
// cat4 附件=attachmentIcon{sub}.png；cat5 护甲=armorIcon{sub}.png（特殊范围用基础模板+染色）；其余=transportIcon{sub}.png；全缺=文本占位。
import { Sprite, BitmapObject } from "../core/Display";
import { EngineText } from "../core/EngineText";
import type { DataStore } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import { getItemData, itemName } from "./Economy";

// 原版特殊 subCategory（行业符号/动物图标）：16,17,18,19,20,21,28,30,33,51,52,53,57,59,82
const ANIMAL_SUBS = new Set([16, 17, 18, 19, 20, 21, 28, 30, 33, 51, 52, 53, 57, 59, 82]);
const MILK_SUBS = new Set([22, 29, 31, 34, 56, 58]);
// 原版护甲基础模板（特殊范围 → armorIcon1/10/15/19 + ColorMatrix 染色）
const ARMOR_RANGES: Array<{ lo: number; hi: number; base: number }> = [
  { lo: 0, hi: 7, base: 1 },      // <7 → armorIcon1
  { lo: 8, hi: 14, base: 10 },
  { lo: 15, hi: 19, base: 15 },
  { lo: 19, hi: 22, base: 19 },
];

export interface ItemIconOpts {
  size?: number;        // 目标宽度（默认 250 原图尺寸）
  center?: boolean;     // 图标在 size×size 中居中（默认 true）
  tint?: { r: number; g: number; b: number } | null;
}

// ---- 原版动物产品符号（FFDEC 从 decompiled/all/sprites DefineSprite_* 抽出的 PNG，已拷入 web/public/assets/images）----
// 原版 Item.as picture：肉组 sub16-20 用 IndustrySymbol{动物}Breeding scale 0.7；21/57/59/82 用 filtericon* scale 1.75；
// 奶组 sub22/29/31/34/56/58 用对应符号；51/52/53（奶酪）用 {动物}CheeseProduction 符号。
// 符号叠加在 250 画布 (125,50)/(125,140)，MovieClip 注册点=中心（FFDEC 内容检查确认对称分布）。
const BREEDING_SYMBOL: Record<number, { img: string; scale: number }> = {
  16: { img: "IndustrySymbolLizardBreeding.png", scale: 0.7 },
  17: { img: "IndustrySymbolLizardBreeding.png", scale: 0.7 },
  18: { img: "IndustrySymbolSnakeBreeding.png", scale: 0.7 },
  19: { img: "IndustrySymbolSnakeBreeding.png", scale: 0.7 },
  20: { img: "IndustrySymbolJerboaBreeding.png", scale: 0.7 },
  21: { img: "filtericonanimals.png", scale: 1.75 },
  22: { img: "filtericonanimals.png", scale: 1.75 },
  28: { img: "IndustrySymbolGoatBreeding.png", scale: 0.7 },
  29: { img: "IndustrySymbolGoatBreeding.png", scale: 0.7 },
  30: { img: "IndustrySymbolSheepBreeding.png", scale: 0.7 },
  31: { img: "IndustrySymbolSheepBreeding.png", scale: 0.7 },
  33: { img: "IndustrySymbolCattleBreeding.png", scale: 0.7 },
  34: { img: "IndustrySymbolCattleBreeding.png", scale: 0.7 },
  51: { img: "IndustrySymbolGoatCheeseProduction.png", scale: 0.7 },
  52: { img: "IndustrySymbolSheepCheeseProduction.png", scale: 0.7 },
  53: { img: "IndustrySymbolCowCheeseProduction.png", scale: 0.7 },
  56: { img: "filtericonhorse.png", scale: 1.75 },
  57: { img: "filtericonhorse.png", scale: 1.75 },
  58: { img: "filtericoncamel.png", scale: 1.75 },
  59: { img: "filtericoncamel.png", scale: 1.75 },
  82: { img: "filtericonperson.png", scale: 1.75 },
};

/** 物品图标：同步路径立即挂载已加载图；未加载的异步 ensure 补挂。返回 target 便于链式。 */
export function attachItemIcon(
  assets: AssetStore, ds: DataStore, target: Sprite, itemId: number,
  opts: ItemIconOpts = {}
): Sprite {
  const size = opts.size ?? 250;
  const center = opts.center !== false;
  const it = ds.items.Items[itemId];
  target.removeAll();
  if (!it) return target;
  const cat = it.category, sub = it.subCategory;
  const def = getItemData(ds, itemId);

  // 图片候选列表：name + 可选 tint（colorTransform 乘积因子）
  const cands: Array<{ name: string; tint?: { r: number; g: number; b: number } | null }> = [];
  if (cat === 1) {
    const pf = def && (def as any).pictureFrom;
    if (pf !== undefined && sub !== 17) cands.push({ name: "itemIcon" + pf + ".png" });
    if (ANIMAL_SUBS.has(sub)) {
      cands.push({ name: "itemIcon" + sub + ".png" });
      cands.push({ name: sub === 17 || sub === 19 ? "itemIcon17.png" : (sub >= 51 && sub <= 53 ? "itemIcon51.png" : "meat.png") });
    } else if (MILK_SUBS.has(sub)) {
      cands.push({ name: "itemIcon" + sub + ".png" });
      cands.push({ name: "milk.png" });
    } else if (sub === 106 || sub === 107) {
      cands.push({ name: "itemIcon106.png" });
    } else {
      cands.push({ name: "itemIcon" + sub + ".png" });
    }
  } else if (cat === 2) {
    const wid = (def && (def as any).icon) || sub;
    cands.push({ name: "weaponIcon" + wid + ".png" });
  } else if (cat === 3) {
    const type = def && (def as any).type;
    if (type) cands.push({ name: "ammoIcon" + type + ".png" });
  } else if (cat === 4) {
    cands.push({ name: "attachmentIcon" + sub + ".png" });
  } else if (cat === 5) {
    let base = -1;
    for (const rng of ARMOR_RANGES) if (sub >= rng.lo && sub < rng.hi) { base = rng.base; break; }
    if (base >= 0) {
      const color = def && (def as any).color;
      let tint: { r: number; g: number; b: number } | null = null;
      if (color) {
        const bc = color.bc ?? 1;
        tint = { r: Math.min(1, (color.r / 255) * bc), g: Math.min(1, (color.g / 255) * bc), b: Math.min(1, (color.b / 255) * bc) };
      }
      cands.push({ name: "armorIcon" + base + ".png", tint });
    } else {
      cands.push({ name: "armorIcon" + sub + ".png" });
    }
  } else {
    cands.push({ name: "transportIcon" + sub + ".png" });
  }

  // 同步挂载已加载图
  let mounted = 0;
  for (const c of cands) {
    const im = assets.getImage(c.name);
    if (im) {
      const b = new BitmapObject(im);
      b.mouseEnabled = false;
      if (c.tint) b.colorTransform = c.tint;
      scaleFit(b, size);
      if (center) { b.x = (size - b.width * b.scaleX) / 2; b.y = (size - b.height * b.scaleY) / 2; }
      target.addChild(b);
      maybeAttachBreeding(target, sub, c.name, assets, b);
      mounted++;
      break;
    }
  }
  if (mounted === 0) {
    for (const c of cands) {
      void assets.ensure(c.name).then((im) => {
        if (!im) return;
        if (target.children.some((ch) => ch instanceof BitmapObject)) return;
        const b = new BitmapObject(im);
        b.mouseEnabled = false;
        if (c.tint) b.colorTransform = c.tint;
        scaleFit(b, size);
        if (center) { b.x = (size - b.width * b.scaleX) / 2; b.y = (size - b.height * b.scaleY) / 2; }
        target.addChild(b);
        maybeAttachBreeding(target, sub, c.name, assets, b);
      });
    }
    const anyDefined = cands.some((c) => {
      return Object.keys(ds.manifest.images).some((k) => k.toLowerCase() === c.name.toLowerCase());
    });
    if (!anyDefined) {
      const t = new EngineText(itemName(ds, itemId).toUpperCase(), 16777215, 13, "center", 0, size / 2 - 10, size, 24);
      t.mouseEnabled = false;
      target.addChild(t);
    }
  }

  // 原版 cat3 弹药：ammoIcon{type}.png + 名称顶（2630688 36px center 13,13,224,40）
  // + variation 底（2630688 36px left 15,197,230,30），Texts.fetch(...).toUpperCase()
  // 文本尺寸/位置按目标 size 缩放（size=250 时与原版一致；56px 交易槽等比缩小）
  if (cat === 3 && def) {
    const cal = ds.weapons?.Calibers ? ds.weapons.Calibers[def.type] : null;
    const lang = ds.language;
    const calName = cal && cal.name ? (ds.texts[String(cal.name)]?.[lang] ?? ds.texts[String(cal.name)]?.[1] ?? "") : "";
    const varName = def.variation ? (ds.texts[String(def.variation)]?.[lang] ?? ds.texts[String(def.variation)]?.[1] ?? "") : "";
    const k = size / 250;
    if (calName) {
      const top = new EngineText(calName.toUpperCase(), 2630688, Math.max(6, Math.round(36 * k)), "center", 13 * k, 13 * k, 224 * k, 40 * k);
      top.mouseEnabled = false;
      target.addChild(top);
    }
    if (varName) {
      const bot = new EngineText(varName.toUpperCase(), 2630688, Math.max(6, Math.round(36 * k)), "left", 15 * k, 197 * k, 230 * k, 30 * k);
      bot.mouseEnabled = false;
      target.addChild(bot);
    }
  }
  return target;
}

// ---- 动物产品图标的"养殖符号"叠加（原版 Item.as picture L2556-2658）----
const ANIMAL_MEAT_SUBS = new Set([16, 17, 18, 19, 20, 21, 28, 30, 33, 51, 52, 53, 57, 59, 82]);
const ANIMAL_MILK_SUBS = new Set([22, 29, 31, 34, 56, 58]);

/** 在 attachItemIcon 选中的底图候选上叠加动物符号（原版 IndustrySymbol 覆盖层） */
function maybeAttachBreeding(target: Sprite, sub: number, baseName: string, assets: AssetStore, baseBmp?: BitmapObject) {
  const milkGroup = ANIMAL_MILK_SUBS.has(sub);
  const meatGroup = ANIMAL_MEAT_SUBS.has(sub);
  if (!milkGroup && !meatGroup) return;
  const isMilkBase = baseName === "milk.png";
  const isMeatBase = baseName === "meat.png" || baseName === "itemIcon17.png" || baseName === "itemIcon51.png";
  if (milkGroup && !isMilkBase) return;
  if (meatGroup && !isMeatBase) return;
  const sym = BREEDING_SYMBOL[sub];
  if (!sym) return;
  // baseBmp.scaleX = 目标 size/250（scaleFit）；符号按同一比例缩放/定位
  const s = baseBmp ? (baseBmp.scaleX || 1) : 1;
  // 原版：MovieClip 符号放在 250 画布 (125,50)/(125,140)，注册点=中心 → 直接以 (cx,cy) 为符号中心。
  // 符号 PNG 的自然尺寸即内容包围盒（FFDEC 已裁到内容），scale 沿用原版 0.7/1.75 再 × size/250。
  const scale = sym.scale * s;
  const cx = 125 * s;
  const cy = (milkGroup ? 140 : 50) * s;
  const apply = (im: HTMLImageElement | null) => {
    if (!im) return;
    if (target.children.some((ch) => (ch as any).__breedingOverlay)) return;
    const b = new BitmapObject(im);
    b.mouseEnabled = false;
    if (milkGroup) {
      // 琥珀色着色（原版 ColorTransform(0,0,0,1,20,15,0,0)）：乘 0 + 加 20/15（近黑琥珀，dr/dg/db 为 0..255 加法量）
      b.colorTransform = { r: 0, g: 0, b: 0, dr: 20, dg: 15, db: 0 };
    } else {
      b.colorTransform = { r: 0, g: 0, b: 0, dr: 255, dg: 255, db: 255 };
    }
    b.scaleX = b.scaleY = scale;
    b.x = cx - (b.width * scale) / 2;
    b.y = cy - (b.height * scale) / 2;
    b.alpha = milkGroup ? 0.9 : 0.5;
    (b as any).__breedingOverlay = true;
    target.addChild(b);
  };
  const im = assets.getImage(sym.img);
  if (im) apply(im);
  else void assets.ensure(sym.img).then(apply);
}

function scaleFit(b: BitmapObject, size: number) {
  const w = b.width, h = b.height;
  if (w <= 0 || h <= 0) return;
  const s = Math.min(size / w, size / h);
  b.scaleX = s; b.scaleY = s;
}

/** 便捷：新建 Sprite 并挂图标。 */
export function makeItemIcon(assets: AssetStore, ds: DataStore, itemId: number, opts: ItemIconOpts = {}): Sprite {
  const s = new Sprite();
  return attachItemIcon(assets, ds, s, itemId, opts);
}
