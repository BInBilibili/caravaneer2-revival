import { Caravan, Character, GameData, Town } from "../../../../src/game/World";

export const PROFESSION_NAMES = [
  "农夫", "牧民", "猎人", "矿工", "工匠", "机械师", "医生", "商人", "流浪汉", "斥候", "商贩",
  "冒险者", "护卫", "佣兵", "警察", "土匪", "奴隶贩子", "叛军", "神职人员", "政治家", "科学家",
] as const;

export type ProfessionId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21;
export const DEFAULT_PROFESSION: ProfessionId = 9;
export const PROFESSION_ASSET_PREFIX = "Profession";
export const PROFESSION_FALLBACK_ASSET = "ProfessionFallback.png";

const validProfession = (value: unknown): value is ProfessionId => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 21;
const profession = (value: unknown, fallback: ProfessionId = DEFAULT_PROFESSION): ProfessionId => validProfession(value) ? value : fallback;

/** 产业类型到职业的归类。一个城镇的招募人员使用雇员最多的产业；没有产业时回退为流浪汉。 */
const INDUSTRY_PROFESSION: Record<number, ProfessionId> = {
  1: 2, 2: 2, 3: 5, 4: 2, 5: 2, 6: 5, 7: 5, 8: 5, 9: 4, 10: 1,
  11: 5, 12: 5, 13: 5, 14: 5, 15: 5, 16: 5, 17: 4, 18: 6, 19: 5, 20: 7,
  21: 5, 22: 16, 23: 1, 24: 1, 25: 1, 26: 1, 27: 1, 28: 5, 29: 5, 30: 5,
  31: 5, 32: 5, 33: 2, 34: 2, 35: 2, 36: 1, 37: 5, 38: 4, 39: 5, 40: 5,
  41: 5, 42: 5, 43: 5, 44: 4, 45: 5, 46: 5,
};

/** 地图 caravan_types 的职业归类；未知类型仍然有稳定的默认标签。 */
const CARAVAN_PROFESSION: Record<number, ProfessionId> = {
  1: 10, 2: 16, 3: 12, 4: 13, 5: 9, 6: 16, 7: 13, 8: 13, 9: 16, 10: 16, 11: 16,
  12: 15, 13: 18, 14: 16, 15: 16, 16: 16, 17: 9, 18: 17, 19: 15, 20: 13, 21: 18,
  22: 13, 23: 14, 24: 17, 25: 16, 26: 16, 27: 16, 28: 16, 29: 13, 30: 13, 31: 16,
  32: 16, 33: 16, 34: 16, 35: 16, 36: 16, 37: 13, 38: 15, 39: 15, 40: 11, 41: 12,
};

const STORY_PROFESSION: Record<number, ProfessionId> = {
  1: 13, // Thum / 护卫
  2: 18, // Lois / 叛军
  3: 21, // Spencer / 科学家
  4: 13, // Lintu defense group / 护卫
  5: 16, // Drekar group / 土匪
  6: 17, // Calvin's slaver group / 奴隶贩子
  7: 19, // Kukul / 神职人员
  8: 20, // Apis / 政治家
  9: 1,  // Eliah / 农夫
  10: 16, // Fafnir / 土匪
  11: 18, // revolutionary group / 叛军
  12: 13, // town defense / 护卫
  13: 18, // revolutionary group / 叛军
  14: 20, // political mission / 政治家
  15: 20, // Chairman Brass / 政治家
  16: 18, // Kevin's organization / 叛军
  17: 18, // Kevin's organization / 叛军
  18: 12, // expedition / 冒险者
  19: 8,  // merchant contact / 商人
  20: 20, // politician contact / 政治家
  21: 21, // research contact / 科学家
  22: 18, // rebel contact / 叛军
  23: 17, // slave convoy / 奴隶贩子
};

export function setProfession(target: any, id: number, overwrite = false): void {
  if (!target || typeof target !== "object") return;
  if (overwrite || !validProfession(target.profession)) target.profession = profession(id);
}

export function townProfession(town: any): ProfessionId {
  const industries = Array.isArray(town?.industries) ? town.industries : [];
  let best: any = null;
  for (const ind of industries) {
    if (!validProfession(INDUSTRY_PROFESSION[Number(ind?.type)])) continue;
    if (!best || Number(ind?.employees ?? ind?.volume ?? 0) > Number(best?.employees ?? best?.volume ?? 0)) best = ind;
  }
  return best ? INDUSTRY_PROFESSION[Number(best.type)] : DEFAULT_PROFESSION;
}

export function caravanProfession(type: number): ProfessionId {
  return CARAVAN_PROFESSION[type] ?? DEFAULT_PROFESSION;
}

function classifyTown(town: any, forceNew = false): void {
  const role = townProfession(town);
  for (const person of town?.people ?? []) setProfession(person, role, forceNew);
  for (const loc of town?.locations ?? []) {
    for (const person of loc?.slaves ?? []) {
      // Old saves may contain no field; generated slaves start with the default fallback.
      setProfession(person, role, !validProfession(person?.profession) || person?.profession === DEFAULT_PROFESSION);
    }
  }
}

export function classifyWorld(world: any): void {
  if (!world) return;
  const player = world.Caravans?.[0]?.People?.[0];
  if (player && world.storyMode) setProfession(player, 10, true);
  for (const town of world.Towns ?? []) classifyTown(town, false);
  for (const caravan of world.Caravans ?? []) for (const person of caravan?.People ?? []) {
    if (person?.specialPurpose != null && STORY_PROFESSION[Number(person.specialPurpose)]) {
      setProfession(person, STORY_PROFESSION[Number(person.specialPurpose)], true);
    } else setProfession(person, DEFAULT_PROFESSION);
  }
  for (const npc of world.npcCaravans ?? []) {
    const role = npc.type === 40 ? 11 : caravanProfession(Number(npc.type));
    for (const person of npc.squad?.people ?? []) setProfession(person, role);
    for (const person of npc.people ?? []) setProfession(person, role);
  }
}

function patchFixup(): void {
  const C = Character as any;
  if (C.__revivalProfessionFixup) return;
  const original = C.fixup;
  if (typeof original !== "function") return;
  C.fixup = function (ch: any, ds?: any) {
    const result = original.call(this, ch, ds);
    setProfession(result, DEFAULT_PROFESSION);
    return result;
  };
  C.__revivalProfessionFixup = true;
}

function patchTown(): void {
  const P = (Town as any).prototype;
  if (!P || P.__revivalProfessionTown) return;
  const original = P.ensureHirePeople;
  if (typeof original !== "function") return;
  P.ensureHirePeople = function (this: any, ...args: any[]) {
    const isNew = this.people === undefined;
    const result = original.apply(this, args);
    classifyTown(this, isNew);
    return result;
  };
  P.__revivalProfessionTown = true;
}

function patchCaravan(): void {
  const P = (Caravan as any).prototype;
  if (!P || P.__revivalProfessionCaravan) return;
  const original = P.addPerson;
  if (typeof original !== "function") return;
  P.addPerson = function (this: any, person: any) {
    const index = original.call(this, person);
    setProfession(this.People?.[index], DEFAULT_PROFESSION);
    return index;
  };
  P.__revivalProfessionCaravan = true;
}

function patchGameData(): void {
  const P = (GameData as any).prototype;
  if (!P || P.__revivalProfessionGameData) return;
  const equip = P.equipRandomCaravan;
  if (typeof equip === "function") {
    P.equipRandomCaravan = function (this: any, type: number, ...args: any[]) {
      const squad = equip.call(this, type, ...args);
      const role = caravanProfession(Number(type));
      for (const person of squad?.people ?? []) setProfession(person, role, true);
      for (const person of squad?.slavePeople ?? []) setProfession(person, 17, true);
      return squad;
    };
  }
  const route = P.materializeNpcRoute;
  if (typeof route === "function") {
    P.materializeNpcRoute = function (this: any, npc: any, ...args: any[]) {
      const result = route.call(this, npc, ...args);
      for (const person of npc?.people ?? []) setProfession(person, 11, true);
      return result;
    };
  }
  const refresh = P.refreshTownShops;
  if (typeof refresh === "function") {
    P.refreshTownShops = function (this: any, town: any, ...args: any[]) {
      const result = refresh.call(this, town, ...args);
      classifyTown(town, false);
      return result;
    };
  }
  const mode = P.setMode;
  if (typeof mode === "function") {
    P.setMode = function (this: any, ...args: any[]) {
      const result = mode.apply(this, args);
      classifyWorld(this);
      return result;
    };
  }
  const event = P.executeMajorEvent;
  if (typeof event === "function") {
    P.executeMajorEvent = function (this: any, ...args: any[]) {
      const result = event.apply(this, args);
      classifyWorld(this);
      return result;
    };
  }
  P.__revivalProfessionGameData = true;
}

export function patchProfessions(): void {
  patchFixup();
  patchTown();
  patchCaravan();
  patchGameData();
}
