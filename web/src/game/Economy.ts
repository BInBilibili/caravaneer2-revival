import { getText } from "../core/DataStore";
// 经济系统：忠实移植 GameData.priceEquation / oneIntegral / commonPriceFunction（城镇分支）
// 消耗/生产来自城镇经济汇总；分类均价按完整物品类别查询。
import type { DataStore } from "../core/DataStore";
import { Town } from "./World";

export interface ItemDef {
  price?: number; weight?: number; name?: number;
  calories?: number; food?: boolean; upperBodyClothing?: boolean; lowerBodyClothing?: boolean;
  shoes?: boolean; hat?: boolean; [k: string]: any;
}

// 物品定义查询：Items[category] → Goods/Weapons/Armor/Ammo/Attachments 表
export function getItemData(ds: DataStore, itemId: number): ItemDef | null {
  const it = ds.items.Items[itemId];
  if (!it) return null;
  switch (it.category) {
    case 1: return ds.items.Goods[it.subCategory] ?? null;
    case 2: return ds.weapons.Weapons[it.subCategory] ?? null;
    case 3: return ds.weapons.Ammo[it.subCategory] ?? null;
    case 4: return ds.weapons.Attachments[it.subCategory] ?? null;
    case 5: return ds.items.Armor[it.subCategory] ?? null;
    default: return null;
  }
}

// t70 反馈5：物品类别→筛选组（数据/原版 List.as 编号：2武器/3弹药/4附件/5护甲；cat1 按 Goods 标记细分）
export function itemGroupOf(ds: DataStore, id: number): string {
  const it = ds.items.Items[id];
  if (!it) return "miscellaneous";
  if (it.category === 2) return "weapons";
  if (it.category === 3) return "ammo";
  if (it.category === 4) return "attachments";
  if (it.category === 5) return "armor";
  if (it.category === 1) {
    const g = ds.items.Goods[it.subCategory];
    if (!g) return "miscellaneous";
    if (g.firstAidKit) return "firstaid";
    if (g.food) return "food";
    if (g.liquid) return "liquids";
    if (g.liquidsContainer) return "liquidscontainers";
    if (g.device) return "devices";
    if (g.tool) return "tools";
    if (g.market) return "market";
    return "miscellaneous";
  }
  return "miscellaneous";
}

export function itemName(ds: DataStore, itemId: number): string {
  const it = ds.items.Items[itemId];
  if (!it) return "Item " + itemId;
  // 弹药（category 3）：原版 Item.as name getter → Calibers[type].name + " " + variation
  if (it.category === 3) {
    const def = getItemData(ds, itemId);
    const cal = def && ds.weapons.Calibers ? ds.weapons.Calibers[def.type] : null;
    const calName = cal ? getText(ds, cal.name) : "";
    const varName = def ? getText(ds, def.variation) : "";
    if (calName || varName) return (calName + " " + varName).trim();
  }
  const def = getItemData(ds, itemId);
  const t = getText(ds, def?.name ?? 0);
  if (t && def && def.additionalNameText > 0) return t + " - " + getText(ds, def.additionalNameText);
  return t || "Item " + itemId;
}

let avgCache: Record<string, number> | null = null;
export function categoryAverages(ds: DataStore): Record<string, number> {
  if (avgCache) return avgCache;
  const cats: string[] = ds.gamedata?.itemCategories ?? [];
  const out: Record<string, number> = {};
  for (const cat of cats) {
    let sum = 0, n = 0;
    for (let id=1;id<ds.items.Items.length;id++) {
      const g=getItemData(ds,id);
      if (!g || typeof g !== "object") continue;
      if (!g[cat]) continue;
      sum += g.price ?? 0;
      n += cat === "food" ? (g.calories ?? 0) : 1;
    }
    out[cat] = n ? sum / n : 1;
  }
  avgCache = out;
  return out;
}
export function resetCategoryAverages() { avgCache = null; }

export class Economy {
  // GameData.oneIntegral 原式
  static oneIntegral(x: number, base: number, cons: number, prod: number, factor: number): number {
    return (
      0.8 * base * x +
      (1 * base * factor * (x + 10 * cons * x)) /
        ((1 + 10 * cons) * Math.sqrt((x + 10 * cons * x) / (2 + 20 * prod)))
    );
  }

  // GameData.priceEquation 原式（自动交换端点）
  static priceEquation(s0: number, s1: number, base: number, cons: number, prod: number, factor = 1): number {
    if (s0 > s1) { const t = s0; s0 = s1; s1 = t; }
    return Economy.oneIntegral(s1, base, cons, prod, factor) - Economy.oneIntegral(s0, base, cons, prod, factor);
  }

  // 价格：对齐 commonPriceFunction（param6 商店情形）
  // playerBuying=true：库存 S→S-amount；false：S→S+amount（卖出乘子仅作用于卖出侧）
  // shop 传入时（realShop）：库存来源用 shop.stock（原版 commonPriceFunction param6.stock；shopType==1 储藏库则仍用 town.stock）
  static price(ds: DataStore, town: Town, itemId: number, amount: number, playerBuying: boolean, shop?: any): number {
    const custom = ds.runtime?.rules.get("economy.price") as ((ctx: any) => number) | undefined;
    if (typeof custom === "function") {
      try { const v = custom({ ds, town, itemId, amount, playerBuying, shop, base: () => Economy.basePrice(ds, town, itemId, amount, playerBuying, shop) }); if (typeof v === "number" && Number.isFinite(v)) return v; } catch (e) { console.warn("mod economy.price error", e); }
    }
    return Economy.basePrice(ds, town, itemId, amount, playerBuying, shop);
  }

  private static basePrice(ds: DataStore, town: Town, itemId: number, amount: number, playerBuying: boolean, shop?: any): number {
    const def = getItemData(ds, itemId);
    if (!def) return 1;
    const base = town.getItemBasePrice(itemId, ds);
    const item = ds.items.Items[itemId];
    const goods = item?.category === 1 ? ds.items.Goods[item.subCategory] : null;
    // 库存：同类合并（食物按卡路里归一）；realShop（shop 且非储藏库 shopType!=1）用 shop.stock
    const stockSrc: Map<number, number> = shop && shop.stock ? shop.stock : town.stock;
    let stock = 0;
    for (const [tid, amt] of stockSrc) {
      if (tid === itemId) { stock += amt; continue; }
      const other = ds.items.Items[tid];
      if (!other || other.category !== 1) continue;
      const og = ds.items.Goods[other.subCategory];
      if (!og) continue;
      if (goods && goods.food && og.food) {
        stock += amt * ((og.calories ?? 1) / Math.max(1, goods.calories ?? 1));
      }
    }
    const s0 = Math.max(stock, 1e-13);
    const s1 = Math.max(playerBuying ? stock - amount : stock + amount, 1e-13);
    // 生产/消耗（来自城镇日结算缓存；食物按卡路里归一）
    let cons = 0, prod = 0;
    const cp = town.cpCache;
    if (cp) {
      const e = cp.productsList.find((x) => x.item === itemId);
      if (e) { prod = e.production; cons = e.consumption; }
    }
    if (goods?.food) {
      prod /= Math.max(1, goods.calories ?? 1);
      cons /= Math.max(1, goods.calories ?? 1);
    }
    // 类别系数（_loc10_）
    let factor = 1;
    if (itemId === 1) factor = 8;
    const cats: string[] = ds.gamedata?.itemCategories ?? [];
    const avgs = categoryAverages(ds);
    for (const cat of cats) {
      if (def[cat]) {
        let a = avgs[cat] ?? 1;
        if (goods?.food && cat === "food") a *= Math.max(1, goods.calories ?? 1);
        let t = (base / a) * town.wealthFactor - 1;
        if (t > 0) t *= 5;
        if (t >= 0) t += 1;
        else t = 1 / -t;
        factor /= Math.max(1, t);
        break;
      }
    }
    let total = Economy.priceEquation(s0, s1, base, cons, prod, factor);
    if (!playerBuying) {
      const cat = item?.category ?? 0;
      total *= cat >= 2 && cat <= 5 ? 1.2 : 0.6;
      // GameData.commonPriceFunction:4789-4820, shop resale penalty and cap.
      if (shop) total *= town.difficulty === 1 ? .2 : .05;
      total = Math.min(total, base * 1.5 * amount);
    }
    const perUnit = total / amount;
    return Math.max(perUnit, base * 0.01);
  }

  // ===== 易货定价（原版 TradeWindow.applyTaxes / GD.calculatePrice，TEAM-TRADE-SPEC §4） =====

  // 原版 applyTaxes：shop.margin / town.tax / Caravan ×2·×0.5（free 直通）
  static applyTaxes(price: number, isPartnerSide: boolean, ctx: { free?: boolean; shop?: any; town?: any; caravan?: any }): number {
    if (ctx.free) return price;
    let p = price;
    if (ctx.shop) {
      const m = ctx.shop.margin ?? 0;
      p *= isPartnerSide ? 1 + m : 1 / (1 + m);
    }
    if (ctx.town) {
      const t = ctx.town.tax ?? 0;
      p *= isPartnerSide ? 1 + t : 1 / (1 + t);
    }
    if (ctx.caravan) {
      p *= isPartnerSide ? 2 : 0.5; // NPC 车队黑市价
    }
    return p;
  }

  // 交易区条目总价（原版 GD.calculatePrice 语义；partner 为 Town 或 caravan-like 对象）
  // isPartnerSide=true：玩家从对方买入（库存 S→S-amount）；false：玩家卖出
  static tradePrice(
    ds: DataStore, partner: any, type: number, amount: number,
    isPartnerSide: boolean, shop: any = null, free = false,
  ): number {
    if (amount <= 0) return 0;
    if (partner instanceof Town) {
      const perUnit = Economy.price(ds, partner, type, amount, isPartnerSide, shop);
      return Economy.applyTaxes(perUnit * amount, isPartnerSide, { free, shop, town: partner });
    }
    // Caravan 伙伴：最近城镇基价 + 车队库存积分 + ×2/×0.5（无税）
    const gd = (globalThis as any).__c2?.shell?.gd;
    const towns: Town[] = gd?.Towns ?? [];
    let town: Town | null = null, best = Infinity;
    for (const t of towns) {
      const d = Math.hypot(t.x - (partner.x ?? 0), t.y - (partner.y ?? 0));
      if (d < best) { best = d; town = t; }
    }
    const def = getItemData(ds, type);
    const base = town ? town.getItemBasePrice(type, ds) : (def?.price ?? 1);
    const stock = typeof partner.cargo?.get === "function" ? (partner.cargo.get(type) ?? 0) : 0;
    const s0 = Math.max(stock, 1e-13);
    const s1 = Math.max(isPartnerSide ? stock - amount : stock + amount, 1e-13);
    const factor = type === 1 ? 8 : 1;
    let total = Economy.priceEquation(s0, s1, base, 0, 0, factor);
    if (!isPartnerSide) {
      const it = ds.items.Items[type];
      const cat = it?.category ?? 0;
      total *= cat >= 2 && cat <= 5 ? 1.2 : 0.6;
    }
    return Economy.applyTaxes(total, isPartnerSide, { free, caravan: partner });
  }

  // 给定预算 → 可买最大数量（原版 itemAmountFromPrice 反向定价：二分逼近）
  static amountAffordable(
    ds: DataStore, partner: any, type: number, money: number,
    isPartnerSide: boolean, shop: any = null, free = false,
  ): number {
    if (money <= 0) return 0;
    let hi = 1;
    while (Economy.tradePrice(ds, partner, type, hi, isPartnerSide, shop, free) <= money && hi < 1e9) hi *= 2;
    let lo = 0;
    for (let i = 0; i < 45; i++) {
      const mid = (lo + hi) / 2;
      if (Economy.tradePrice(ds, partner, type, mid, isPartnerSide, shop, free) <= money) lo = mid; else hi = mid;
    }
    return lo;
  }
}
