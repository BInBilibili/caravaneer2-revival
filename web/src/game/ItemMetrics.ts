import type { DataStore } from "../core/DataStore";

/** Item.weightPerUnit: ammunition includes its case/propellant, in kilograms. */
export function itemWeightKg(ds: DataStore | undefined, id: number): number {
  const it = ds?.items?.Items?.[id];
  if (!it || !ds) return 0;
  let weight: number;
  switch (it.category) {
    case 1: weight = ds.items.Goods?.[it.subCategory]?.weight; break;
    case 2: weight = ds.weapons.Weapons?.[it.subCategory]?.weight; break;
    case 3: {
      const ammo = ds.weapons.Ammo?.[it.subCategory];
      const caliber = ds.weapons.Calibers?.[ammo?.type];
      weight = ammo?.projectileMass != null && caliber?.caseAndPropellantWeight != null
        ? (Number(ammo.projectileMass) + Number(caliber.caseAndPropellantWeight)) / 1000
        : ammo?.weight;
      break;
    }
    case 4: weight = ds.weapons.Attachments?.[it.subCategory]?.weight; break;
    case 5: weight = ds.items.Armor?.[it.subCategory]?.weight; break;
    default: return 0;
  }
  return Number.isFinite(weight) ? Math.max(0, weight) : 0;
}

/** Resolve category before subCategory: armor and goods reuse the same sub-indexes. */
export function itemDefinition(ds: DataStore, id: number): Record<string, any> | null {
  const item=ds.items.Items[id]; if(!item)return null;
  switch(item.category){
    case 1:return ds.items.Goods[item.subCategory]??null;
    case 2:return ds.weapons.Weapons[item.subCategory]??null;
    case 3:return ds.weapons.Ammo[item.subCategory]??null;
    case 4:return ds.weapons.Attachments[item.subCategory]??null;
    case 5:return ds.items.Armor[item.subCategory]??null;
    default:return null;
  }
}
