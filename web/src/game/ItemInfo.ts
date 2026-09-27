// ItemInfo：物品信息公共数据源 + 装备页悬停挂载（t102 重构：以交易界面 t101 cursorInfo 浅黄面板为准）
// - itemDetailRows：物品属性行解析（原版 updateEquipmentItem L5571-5904；选中详情栏与悬停共用）
// - itemInfoPairs：原版 Item.getInfoPairs（从 TradeWindow.infoPairs 搬移公共化，this.text→getText；装备页/交易窗口共用）
// - itemCursorRows：装备页悬停行组装（交易窗口同一数据源：名称14 + 重量 + 属性对）
// - attachItemCursorInfo：事件式悬停挂载（pointerover→show / pointermove→update / pointerout→hide，面板共享实例）
import { Sprite } from "../core/Display";
import { EngineText } from "../core/EngineText";
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import { getItemData, itemName } from "./Economy";
import { Input } from "../core/Input";
import type { CursorInfoPanel, CursorRow } from "../core/CursorInfoPanel";

// —— 属性行解析（与 CaravanMenu.eqItemDetail 完全同源：cat1 治疗 / cat2 武器口径/精度/弹药/模式 /
//    cat3 软伤弹道公式(ke=v²·m/2000, v=arrow?50:muzzle×0.7, dmg=…公式…) / cat4 附件适用技能/影响 / cat5 护甲三防） ——
export function itemDetailRows(ds: DataStore, id: number): { ess1: string; ess2: string; rows: any[] } | null {
  const it = ds.items.Items[id];
  if (!it) return null;
  const def = getItemData(ds, id);
  if (!def) return null;
  const t = (n: number) => getText(ds, n, ds.language).toUpperCase();
  const rows: any[] = [];
  rows.push({ name: t(996), value: String(Math.round((def.weight ?? 0) * 1000) / 1000) });
  rows.push({ skip: true });
  let ess1 = "", ess2 = "";
  const cat = it.category;
  if (cat === 1) {
    if (def.firstAidKit || def.heal > 0) { rows.push({ name: t(1018), value: String(def.heal) }); ess1 = t(197); }
  } else if (cat === 2) {
    const wt = ds.weapons.WeaponTypes?.[def.type];
    if (wt && (wt.category === 2 || wt.category === 3 || wt.category === 4)) {
      ess1 = t(298) + ":";
      ess2 = (getText(ds, ds.weapons.Calibers?.[def.ammo]?.name ?? 0, ds.language) || "").toUpperCase();
      rows.push({ oneLine: getText(ds, wt.name, ds.language).toUpperCase() });
      rows.push({ skip: true });
      rows.push({ name: t(299), value: String(def.ammoCapacity ?? "") });
      if (def.accuracy != null) rows.push({ name: t(300), value: String(def.accuracy) });
    } else {
      ess1 = getText(ds, wt?.name ?? def.name ?? 0, ds.language).toUpperCase();
    }
    if (wt?.category === 2) rows.push({ name: t(301), value: String(Math.round(((def.muzzleVelocityChange ?? 0) + 1) * 100)) });
    if (wt?.category === 3) rows.push({ name: t(302), value: String(def.arrowSpeed ?? "") });
    if (wt?.category === 1) {
      rows.push({ name: t(303), value: String(def.baseDamage ?? "") });
      rows.push({ name: t(304), value: String(def.armorNeutralization ?? "") });
      rows.push({ name: t(305), value: String(Math.round((def.openWoundCoeficient ?? 0) * 1000)) });
    }
    if (wt?.category === 5) {
      rows.push({ name: t(306), value: String(def.explosiveness ?? "") });
      rows.push({ name: t(307), value: String(def.antiPersonnel ?? "") });
    }
    rows.push({ skip: true });
    rows.push({ oneLine: t(1005) + ":" });
    rows.push({ skip: true });
    for (const m of (wt?.modes ?? [])) rows.push({ name: getText(ds, m.name, ds.language).toUpperCase(), value: m.AP + " " + t(1095) });
    if (wt && (wt.category === 2 || wt.category === 3 || wt.category === 4)) rows.push({ name: t(195), value: wt.reloadAP + " " + t(1095) });
  } else if (cat === 3) {
    ess1 = t(298);
    const cal = ds.weapons.Calibers?.[def.type];
    if (!def.flamethrower && !def.explosive) {
      const v = cal?.arrow ? 50 : (def.muzzleVelocity ?? 0) * 0.7;
      const ke = (def.projectileMass ?? 0) * Math.pow(v, 2) / 2000;
      let dmg = (1 - 1 / (1 + Math.exp(0.03 * ke - 3))) * Math.pow(ke, 0.125) * (0.5 + ke / 2000 * Math.exp(-ke / 2000) / 2) * (def.bulletDiameter ?? cal?.bulletDiameter ?? 0) * (def.softTargetDamage ?? 0) * 2;
      if ((def.pallets ?? 0) > 0) dmg *= def.pallets;
      rows.push({ name: t(1012), value: String(Math.round(dmg)) });
      rows.push({ skip: true });
    }
    if ((def.explosiveness ?? 0) > 0) rows.push({ name: t(306), value: String(def.explosiveness) });
    if ((def.projectileMass ?? 0) > 0) rows.push({ name: t(1006), value: String(def.projectileMass) });
    if ((def.muzzleVelocity ?? 0) > 0) rows.push({ name: t(301), value: String(def.muzzleVelocity) });
    if (def.armorPiercing != null) rows.push({ name: t(1007), value: String(def.armorPiercing) });
    if (def.softTargetDamage != null) rows.push({ name: t(1008), value: String(def.softTargetDamage) });
    if ((def.FF ?? 0) > 0) rows.push({ name: t(1011), value: String(def.FF) });
    if (def.pallets != null) rows.push({ name: t(1009), value: String(def.pallets) });
    if (def.bulletDiameter != null) rows.push({ name: t(1010), value: String(def.bulletDiameter) });
    else if (cal?.bulletDiameter != null) rows.push({ name: t(1013), value: String(cal.bulletDiameter) });
  } else if (cat === 4) {
    ess1 = t(1001);
    const skillIds: Record<string, number> = { rifle: 973, crossbow: 971, pistol: 972, machinegun: 974, smg: 975, shotgun: 986, rocketLauncher: 976, flamethrower: 977 };
    ess2 = (def.applicable ?? []).map((s: string) => getText(ds, skillIds[s] ?? 0, ds.language).toUpperCase()).join(", ");
    if (def.affectAccuracy != null) rows.push({ name: t(1016), value: String(def.affectAccuracy) });
    if (def.affectAP != null) rows.push({ name: t(1017), value: String(0 - def.affectAP) });
    if ((def.batteries ?? 0) > 0) rows.push({ name: t(6823), value: String(def.batteries) });
  } else if (cat === 5) {
    if (def.type === 1) ess1 = t(1002);
    else if (def.type === 2) ess1 = t(1003);
    rows.push({ name: t(1004), value: String(def.armor ?? "") });
    rows.push({ name: t(1014), value: String(def.fireResistance ?? "") });
    rows.push({ name: t(1015), value: String(def.explosionResistance ?? "") });
  }
  return { ess1, ess2, rows };
}

// —— 物品属性对（原版 Item.getInfoPairs；itemInfoPairs(ds, c, id)，c=Caravans[0] 用于 inUseOf 设备消耗） ——
export function itemInfoPairs(ds: DataStore, c: any, id: number): Array<{ name: string; value?: string; multiline?: boolean }> {
  const t = (n: number) => getText(ds, n, ds.language);
  const it = ds.items.Items[id];
    const def: any = getItemData(ds, id);
    const cat = it ? it.category : 0;
    const W = ds.weapons;
    const out: Array<{ name: string; value?: string; multiline?: boolean }> = [];
    const push = (name: string, value?: string, multiline = false) => out.push({ name, value, multiline });
    push(itemName(ds, id).toUpperCase());
    if (cat === 1) {
      const g = def;
      if (g?.firstAidKit) {
        push(t(197).toUpperCase());
        if (g.heal !== undefined) push(t(1018).toUpperCase(), String(g.heal));
      }
      if (g?.food) {
        push(t(15).toUpperCase());
        push(t(1196).toUpperCase(), String(Math.round((g.calories ?? 0) / 10)));
        push(t(1247).toUpperCase(), String(Math.round((g.waterPercentage ?? 0) * 100)) + "%");
        if (g.taste !== undefined) push(t(3769).toUpperCase(), (g.taste > 0 ? "+" : "") + g.taste);
      }
      if (g?.liquidsContainer) {
        push(t(1198).toUpperCase());
        push(t(1219).toUpperCase(), Math.round((g.volume ?? 0) * 1000) / 1000 + t(11));
      }
      if (g?.device) {
        push(t(1199).toUpperCase());
        const inUse = c.inUseOf(id);
        if ((g.consumption?.length) || (g.electricityConsumption ?? 0) > 0) {
          push(t(1242).toUpperCase());
          push("(" + t(1240).toUpperCase() + ")");
          for (const cns of g.consumption ?? []) {
            const per = Math.round(cns.amount * inUse * 1000) / 1000 + "/";
            push(itemName(ds, cns.item).toUpperCase(), per + Math.round(cns.amount * 1000) / 1000);
          }
          if ((g.electricityConsumption ?? 0) > 0) {
            push(t(19).toUpperCase(), (g.electricityConsumption * inUse) + "/" + g.electricityConsumption + t(940));
          }
        }
        if ((g.production?.length) || (g.electricityProduction ?? 0) > 0) {
          push(t(1241).toUpperCase());
          push("(" + t(1240).toUpperCase() + ")");
          for (const p of g.production ?? []) {
            const per = Math.round(p.amount * inUse * 1000) / 1000 + "/";
            push(itemName(ds, p.item).toUpperCase(), per + Math.round(p.amount * 1000) / 1000);
          }
          if ((g.electricityProduction ?? 0) > 0) {
            push(t(19).toUpperCase(), (g.electricityProduction * inUse) + "/" + g.electricityProduction + t(940));
          }
        }
      }
      if (g?.sightAmplifier) push(t(937).toUpperCase(), Math.round((g.amplification ?? 0) * 100) + " %");
    } else if (cat === 2) {
      const wt = W?.WeaponTypes?.[def?.type];
      const wtc = wt?.category;
      push(wt?.name ? t(wt.name).toUpperCase() : t(194).toUpperCase());
      if (wtc === 2 || wtc === 3 || wtc === 4) {
        const cal = W?.Calibers?.[def?.ammo];
        push(t(298).toUpperCase(), cal?.name ? t(cal.name).toUpperCase() : "");
        push(t(299).toUpperCase(), String(def?.ammoCapacity ?? 0));
        push(t(300).toUpperCase(), String(def?.accuracy ?? 0));
      }
      if (wtc === 2) push(t(301).toUpperCase(), String(Math.round(((def?.muzzleVelocityChange ?? 0) + 1) * 100)));
      if (wtc === 3) push(t(302).toUpperCase(), String(def?.arrowSpeed ?? 0));
      if (wtc === 1) {
        push(t(303).toUpperCase(), String(def?.baseDamage ?? 0));
        push(t(304).toUpperCase(), String(def?.armorNeutralization ?? 0));
        push(t(305).toUpperCase(), String(Math.round((def?.openWoundCoeficient ?? 0) * 1000)));
      }
      if (wtc === 5) {
        push(t(306).toUpperCase(), String(def?.explosiveness ?? 0));
        push(t(307).toUpperCase(), String(def?.antiPersonnel ?? 0));
      }
      if (wt?.modes?.length) {
        push(t(1005).toUpperCase() + ":");
        for (const m of wt.modes) {
          const mn = m.name ? t(m.name).toUpperCase() : "?";
          push(mn, (m.AP ?? 0) + " " + t(1095).toUpperCase());
        }
      }
      if ((wt?.reloadAP ?? 0) > 0) push(t(195).toUpperCase(), wt.reloadAP + " " + t(1095).toUpperCase());
    } else if (cat === 3) {
      push(t(298).toUpperCase());
      const cal = W?.Calibers?.[def?.type];
      const bulletD = cal?.bulletDiameter;
      const isArrow = cal?.arrow;
      if (!def?.flamethrower && !def?.explosive) {
        let ke = 0;
        if (isArrow) ke = (def?.projectileMass ?? 0) * Math.pow(50, 2) / 2000;
        else ke = (def?.projectileMass ?? 0) * Math.pow((def?.muzzleVelocity ?? 0) * 0.7, 2) / 2000;
        let dmg = (1 - 1 / (1 + Math.exp(0.03 * ke - 3))) * Math.pow(ke, 0.125) * (0.5 + ke / 2000 * Math.exp(-ke / 2000) / 2) * (bulletD ?? 1) * (def?.softTargetDamage ?? 1) * 2;
        if ((def?.pallets ?? 0) > 0) dmg *= def.pallets;
        push(t(1012).toUpperCase(), String(Math.round(dmg)));
      }
      if ((def?.explosiveness ?? 0) > 0) push(t(306).toUpperCase(), String(def.explosiveness));
      if ((def?.antiPersonnel ?? 0) > 0) push(t(307).toUpperCase(), String(def.antiPersonnel));
      if ((def?.projectileMass ?? 0) > 0) push(t(1006).toUpperCase(), String(def.projectileMass));
      if ((def?.muzzleVelocity ?? 0) > 0) push(t(301).toUpperCase(), String(def.muzzleVelocity));
      if (def?.armorPiercing !== undefined) push(t(1007).toUpperCase(), String(def.armorPiercing));
      if (def?.softTargetDamage !== undefined) push(t(1008).toUpperCase(), String(def.softTargetDamage));
      if ((def?.FF ?? 0) > 0) push(t(1011).toUpperCase(), String(def.FF));
      if (def?.pallets !== undefined) push(t(1009).toUpperCase(), String(def.pallets));
      if (def?.bulletDiameter !== undefined) push(t(1010).toUpperCase(), String(def.bulletDiameter));
      else if (bulletD !== undefined) push(t(1013).toUpperCase(), String(bulletD));
    } else if (cat === 4) {
      push(t(1072).toUpperCase());
      let valid = "";
      const amap: Record<string, number> = { rifle: 973, crossbow: 971, pistol: 972, machinegun: 974, smg: 975, shotgun: 986, rocketLauncher: 976, flamethrower: 977 };
      const apps = def?.applicable ?? [];
      for (let i = 0; i < apps.length; i++) {
        valid += (amap[apps[i]] ? t(amap[apps[i]]).toUpperCase() : String(apps[i]));
        if (i < apps.length - 1) valid += ", ";
      }
      if (valid) push(t(1001).toUpperCase(), valid);
      if (def?.affectAccuracy !== undefined) push(t(1016).toUpperCase(), String(def.affectAccuracy));
      if (def?.affectAP !== undefined) push(t(1017).toUpperCase(), String(0 - def.affectAP));
    } else if (cat === 5) {
      push((def?.type === 1 ? t(1002) : t(1003)).toUpperCase());
      push(t(1004).toUpperCase(), String(def?.armor ?? 0));
      push(t(1014).toUpperCase(), String(def?.fireResistance ?? 0));
      push(t(1015).toUpperCase(), String(def?.explosionResistance ?? 0));
    }
    if (cat === 1 || cat === 2) {
      const imp = [def?.doctorImprove, def?.veterinaryImprove, def?.mechanicImprove, def?.huntingImprove, def?.collectingImprove];
      if (imp.some((v) => typeof v === "number")) push(t(4241).toUpperCase() + ":");
      if (typeof def?.doctorImprove === "number") push(t(932).toUpperCase(), String(Math.round(def.doctorImprove * 100)));
      if (typeof def?.veterinaryImprove === "number") push(t(933).toUpperCase(), String(Math.round(def.veterinaryImprove * 100)));
      if (typeof def?.mechanicImprove === "number") push(t(934).toUpperCase(), String(Math.round(def.mechanicImprove * 100)));
      if (typeof def?.huntingImprove === "number") push(t(935).toUpperCase(), String(Math.round(def.huntingImprove * 100)));
      if (typeof def?.collectingImprove === "number") push(t(936).toUpperCase(), String(Math.round(def.collectingImprove * 100)));
    }
    if ((def?.batteries ?? 0) > 0) push(t(6823).toUpperCase(), String(def.batteries));
    if (typeof def?.description === "number") push(t(def.description), undefined, true);
  return out;
}

// —— 装备页悬停行组装（与交易窗口 updateCursorInfo 同源：名称14center + 重量 + getInfoPairs 属性对） ——
export function itemCursorRows(ds: DataStore, c: any, id: number): CursorRow[] | null {
  const it = ds.items.Items[id];
  if (!it) return null;
  const def: any = getItemData(ds, id);
  if (!def) return null;
  const rows: CursorRow[] = [];
  rows.push({ text: itemName(ds, id).toUpperCase(), center: true, font: 14, dy: 20 });
  rows.push({ text: getText(ds, 1190, ds.language).toUpperCase() + ": " + (Math.round((def.weight ?? 0) * 1000) / 1000) + " " + getText(ds, 12, ds.language), center: true, dy: 25 });
  const pairs = itemInfoPairs(ds, c, id);
  for (let pi = 0; pi < pairs.length; pi++) {
    const p = pairs[pi];
    if (pi === 0) continue; // 第一项恒为 itemName（标题行已显示）
    const k = p.name.toLowerCase();
    if (k === "name") continue;
    if (["weight", "type", "blank"].includes(k)) continue;
    if (p.value !== undefined) rows.push({ text: p.name, value: p.value });
    else if (p.multiline) rows.push({ text: p.name, multiline: true });
    else rows.push({ text: p.name, center: true });
  }
  return rows;
}

// —— 事件式悬停挂载：host 上 pointerover/move/out 驱动共享面板（装备页槽位/背囊格/物品池格用） ——
export function attachItemCursorInfo(ds: DataStore, c: any, host: Sprite, itemId: number | (() => number | null), panel: CursorInfoPanel): void {
  if (!host || !panel) return;
  const idOf = () => (typeof itemId === "function" ? itemId() : itemId);
  host.addEventListener("pointerover", (e: any) => {
    const id = idOf();
    if (!id) return;
    const rows = itemCursorRows(ds, c, id);
    if (rows) panel.show(e?.x ?? Input.mouseX, e?.y ?? Input.mouseY, rows);
  });
  host.addEventListener("pointermove", (e: any) => {
    const id = idOf();
    if (!id) return;
    const rows = itemCursorRows(ds, c, id);
    if (rows) panel.update(e?.x ?? Input.mouseX, e?.y ?? Input.mouseY, rows);
  });
  host.addEventListener("pointerout", () => panel.hide());
}