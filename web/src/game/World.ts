// 世界对象：Character / Caravan / Town / GameData（结构对齐 AS3，数据来自 JSON 预设）
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import { calculateProductionFlow } from "./ProductionFlow";
import { settleTownEconomy } from "./TownEconomy";
import { Economy } from "./Economy";
import { workshopRecipes } from "./workshopRecipes";
import { factionRelationsFromPresets } from "./factionRelations";
import { hsv2rgb } from "./Portrait";
import { setSoundFX, isSoundFXOn, setMusicOn, isMusicOn } from "../core/Sound";
import { itemWeightKg, itemDefinition } from "./ItemMetrics";
import { itemAmount } from "./ItemQuantity";
import { liquidStorage, assignedCapacity, type ContainerAssignments } from "./LiquidStorage";

// 统一取实体价格（Character.price() 为方法；TransportUnit.price() 为方法；旧对象兜底字段）
function unitPrice(u: any): number {
  if (!u) return 0;
  if (typeof u.price === "function") return u.price() ?? 0;
  return Number(u.price) || 0;
}

export class Character {
  // ============ 身份 / 基础（对齐原版 Character.variablesToSave） ============
  name = "";
  passengerIn: any = null;
  gender = 1; // 1=男 2=女
  age = 30;
  category = 0; // 1志愿 2佣兵 3囚犯 4奴隶 5+特殊
  faction = 0; // 阵营编号
  oldFaction = 0; // 旧阵营（存档对齐）
  specialPurpose = 0; // 剧情角色标记（1Thum 2Lois 3Spencer 9Eliahs 等）
  neverPanic = false;
  dontRemoveFromTown = false;
  autoPay = false;
  wasInPlayersCaravan = false;
  dead = false;
  salary = 0;
  minSalary = 0;
  salaryCoefficient = 1;
  cycleCounter = 0; // 人物周期（每 360 游戏秒）
  payDay = 0;
  studyTime = 0; // 学校（P2）
  startedStudying = 0;
  enslavedAt: number | null = null; // 被奴役时间戳（freeASlave 判定）

  // ============ 基础属性（getter physical/agility/accuracy/intelligence 在其上加减损耗） ============
  basePhysical = 10;
  baseAgility = 10;
  baseAccuracy = 10;
  baseIntelligence = 10;

  // ============ 身体（原版命名：Height 大写 / _weight / _morale） ============
  Height = 175; // 原版 Height（getter BMR/GDA 用）
  _weight = 80; // getter weight 返回（含理想体重下限）
  idealWeight = 80;
  _HP = 100; // 实际血量（getter HP clamp 到 maxHP）
  _morale = 50; // 实际士气（getter morale；setter clamp 1-100）
  _battleMorale = 50; // 战斗士气（getter battleMorale，neverPanic 下限 9）
  hunger = 0;
  thirst = 0;

  // ============ 装备（阶段 A：双武器槽 + 附件 + 护甲 + 物品池，原版语义） ============
  weapons: number[] = [0, 0]; // 双武器槽（存 Weapons.subCategory；0=空）
  attachments: Array<Array<number | null>> = [[null, null], [null, null]]; // 双武器各 2 附件槽（Attachments.subCategory；空=null）
  grenadeAmounts: number[] = [0, 0]; // 手雷数量（每武器槽）
  loadedAmmo: Array<{ type: number; amount: number; inUse: number } | null> = [null, null]; // 战斗内已装填弹药
  selectedAmmo: Array<{ type: number; amount: number; inUse: number } | null> = [null, null]; // 缺省弹药选择
  currModes: number[] = [0, 0]; // 当前武器模式
  Jacket = 0; // 外套护甲（Armor type1 subCategory）
  Headgear = 0; // 头盔护甲（Armor type2 subCategory）
  equipment: Array<{ type: number; amount: number; inUse: number }> = []; // 物品池（type=item id；弹药/急救包/附件备用）

  // ============ 伤势 / 战斗（battleModeVariables 常量部分） ============
  eyeDamage = 0; // 0/1（原版 bool）
  armDamage = 0;
  legDamage = 0;
  bleeding = 0; // 流血量
  burning = 0; // 燃烧量
  AP = 0; squareX = 0; squareY = 0; x = 0; y = 0; band = 0; direction = 0;

  // ============ 经验（原版 skillsList 27 字段：现有 6 个保留 + 补齐武器/战斗） ============
  rangedWeaponsExperience = 0;
  crossbowExperience = 0;
  pistolExperience = 0;
  rifleExperience = 0;
  machinegunExperience = 0;
  smgExperience = 0;
  shotgunExperience = 0;
  rocketLauncherExperience = 0;
  flamethrowerExperience = 0;
  throwExperience = 0;
  unarmedExperience = 0;
  dodgeExperience = 0;
  closeBattleExperience = 0;
  knivesExperience = 0;
  clubsExperience = 0;
  choppingExperience = 0;
  swordsExperience = 0;
  painExperience = 0;
  generalBattleExperience = 0;
  doctorExperience = 0;
  firstAidExperience = 0;
  veterinaryExperience = 0;
  mechanicExperience = 0;
  huntingExperience = 0;
  collectingExperience = 0;
  travelExperience = 0;
  smugglingExperience = 0;

  // ============ 外观/肖像（仅存档透传；渲染由 CharacterSetupScreen DOM 独立实现） ============
  // portraitShoulders/Head/Hair/Mouth/Nose/Eyebrows/Eyes/Ears/Beard/Moustache/Whiskers/Shirt/Necklace/Wrinkles/EyeSockets
  // skinColor/hairColor/shirtColor/pantsColor/shoesColor/lipsColor/beardColor/eyebrowsColor/eyesColor/eyeSocketsColor/bristleColor/braceletColor
  // sleevesType/hasRightBracelet/hasLeftBracelet/LegsType/originalBodyType/originalHead/originalBeardType/originalBackHairType/race
  // （无默认值，透传原版/旧档值）

  // 原版 Character.skillsList（26 项：name 文本 id / skill getter / experience 字段；人员页技能滚动区用）
  static skillsList: Array<{ name: number; skill: string; experience: string }> = [
    { name: 932, skill: "doctorSkill", experience: "doctorExperience" },
    { name: 933, skill: "veterinarySkill", experience: "veterinaryExperience" },
    { name: 934, skill: "mechanicSkill", experience: "mechanicExperience" },
    { name: 967, skill: "rangedWeaponsSkill", experience: "rangedWeaponsExperience" },
    { name: 968, skill: "meleeSkill", experience: "closeBattleExperience" },
    { name: 969, skill: "unarmedSkill", experience: "unarmedExperience" },
    { name: 970, skill: "throwSkill", experience: "throwExperience" },
    { name: 971, skill: "crossbowSkill", experience: "crossbowExperience" },
    { name: 972, skill: "pistolSkill", experience: "pistolExperience" },
    { name: 973, skill: "rifleSkill", experience: "rifleExperience" },
    { name: 974, skill: "machinegunSkill", experience: "machinegunExperience" },
    { name: 975, skill: "smgSkill", experience: "smgExperience" },
    { name: 986, skill: "shotgunSkill", experience: "shotgunExperience" },
    { name: 976, skill: "rocketLauncherSkill", experience: "rocketLauncherExperience" },
    { name: 977, skill: "flamethrowerSkill", experience: "flamethrowerExperience" },
    { name: 978, skill: "knivesSkill", experience: "knivesExperience" },
    { name: 979, skill: "clubsSkill", experience: "clubsExperience" },
    { name: 980, skill: "choppingSkill", experience: "choppingExperience" },
    { name: 981, skill: "swordsSkill", experience: "swordsExperience" },
    { name: 983, skill: "closeBattleDodge", experience: "dodgeExperience" },
    { name: 982, skill: "painThreshold", experience: "painExperience" },
    { name: 197, skill: "firstAidSkill", experience: "firstAidExperience" },
    { name: 935, skill: "huntingSkill", experience: "huntingExperience" },
    { name: 936, skill: "collectingSkill", experience: "collectingExperience" },
    { name: 938, skill: "smugglingSkill", experience: "smugglingExperience" },
    { name: 937, skill: "sight", experience: "travelExperience" },
  ];

  /** 读取原版 skillsList 对应的技能值；兼容 Web 中尚以方法实现的五项生活技能。 */
  skillValue(skill: string): number {
    const member = (this as any)[skill];
    return Number(typeof member === "function" ? member.call(this) : member);
  }

  // ---------- 数据访问（避免循环依赖：走运行时注入的 __c2GetItemData / __c2.ds） ----------
  private static ds(): any { return (globalThis as any).__c2?.ds; }
  private static itemData(id: number): any {
    const getter = (globalThis as any).__c2GetItemData as ((id: number) => any) | undefined;
    const d = getter ? getter(id) : null;
    if (d) return d;
    const ds = Character.ds();
    const it = ds?.items?.Items?.[id];
    if (!it) return null;
    switch (it.category) {
      case 1: return ds.items.Goods?.[it.subCategory] ?? null;
      case 2: return ds.weapons.Weapons?.[it.subCategory] ?? null;
      case 3: return ds.weapons.Ammo?.[it.subCategory] ?? null;
      case 4: return ds.weapons.Attachments?.[it.subCategory] ?? null;
      case 5: return ds.items.Armor?.[it.subCategory] ?? null;
      default: return null;
    }
  }

  // weapons[slot]（subCategory）→ item id（Items 数组索引）；0=无（原版 itemNumFromCatSubCat(2, sub)）
  static weaponItemId(ch: any, slot = 0): number {
    const sub = Array.isArray(ch?.weapons) ? ch.weapons[slot] : 0;
    if (!sub) return 0;
    const items = Character.ds()?.items?.Items;
    if (!items) return 0;
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      if (it && it.category === 2 && it.subCategory === sub) return i;
    }
    return 0;
  }
  // Jacket(0)/Headgear(1) subCategory → item id（category 5 Armor 表；原版 Item.itemNumFromCatSubCat(5, sub)）
  static armorItemId(ch: any, slot: 0 | 1 = 0): number {
    const sub = slot === 0 ? ch?.Jacket : ch?.Headgear;
    if (!sub) return 0;
    const items = Character.ds()?.items?.Items;
    if (!items) return 0;
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      if (it && it.category === 5 && it.subCategory === sub) return i;
    }
    return 0;
  }

  // ---------- 属性 getter（原版损耗公式，Character.as L2806-2958） ----------
  get physical(): number {
    let v = this.basePhysical ?? 10;
    const r = this._weight / Math.max(this.idealWeight, 1);
    if (r < 0.5) v -= 4; else if (r < 0.6) v -= 3; else if (r < 0.7) v -= 2; else if (r < 0.8) v--;
    return Math.max(v, 1);
  }
  set physical(v: number) { this.basePhysical = v; } // 旧档/转译构造兼容

  get agility(): number {
    let v = this.baseAgility ?? 10;
    const hp = this.HP;
    const maxHp = this.maxHP;
    if (hp < maxHp * 0.25) v--;
    if (hp < maxHp * 0.15) v--;
    const r = this._weight / Math.max(this.idealWeight, 1);
    if (r > 3.6) v -= 9; else if (r > 3.4) v -= 8; else if (r > 3.1) v -= 7; else if (r > 2.8) v -= 6;
    else if (r > 2.5) v -= 5; else if (r > 2.2) v -= 4; else if (r > 1.9) v -= 3; else if (r > 1.6) v -= 2; else if (r > 1.3) v--;
    return Math.max(v, 1);
  }
  set agility(v: number) { this.baseAgility = v; }

  get accuracy(): number {
    let v = this.baseAccuracy ?? 10;
    const hp = this.HP;
    const maxHp = this.maxHP;
    if (hp < maxHp * 0.2) v--;
    if (hp < maxHp * 0.1) v--;
    if (this.eyeDamage) v -= 2;
    return Math.max(v, 0);
  }
  set accuracy(v: number) { this.baseAccuracy = v; }

  get intelligence(): number {
    let v = this.baseIntelligence ?? 10;
    const r = this.HP / Math.max(this.maxHP, 1);
    if (r < 0.1) v -= 2; else if (r < 0.2) v--;
    return Math.max(v, 0);
  }
  set intelligence(v: number) { this.baseIntelligence = v; }

  // ---------- 身体 getter（原版命名与公式） ----------
  get height(): number { return this.Height; }
  set height(v: number) { this.Height = v; }

  get weight(): number { return this._weight > this.idealWeight / 3 ? this._weight : this.idealWeight / 3; }
  set weight(v: number) { this._weight = v; }

  get morale(): number { return this._morale > 0 ? this._morale : 1; }
  set morale(v: number) { this._morale = Math.max(Math.min(v, 100), 1); }

  get battleMorale(): number { return this.neverPanic && this._battleMorale < 9 ? 9 : this._battleMorale; }
  set battleMorale(v: number) { this._battleMorale = v; }

  get maxHP(): number { return Math.max(this.physical * 20, 1); }
  get HP(): number { return this._HP > this.maxHP ? this.maxHP : this._HP; }
  set HP(v: number) { this._HP = v; }

  // ---------- 装备 getter（原版 Character.as L2735-3172） ----------
  get equipmentWeight(): number {
    let w = 0;
    for (const e of this.equipment) {
      if (!e) continue;
      const ds = Character.ds();
      const weight = ds ? itemWeightKg(ds,e.type) : (Character.itemData(e.type)?.weight ?? 0);
      w += weight * (e.amount ?? 0);
    }
    return w;
  }
  get capacity(): number {
    let v = this.physical * 8 + Math.pow(this.travelExperience ?? 0, 0.3);
    const hp = this.HP, maxHp = this.maxHP;
    if (hp < maxHp * 0.05) v *= 0.05;
    else if (hp < maxHp * 0.1) v *= 0.1;
    else if (hp < maxHp * 0.15) v *= 0.2;
    else if (hp < maxHp * 0.2) v *= 0.4;
    else if (hp < maxHp * 0.25) v *= 0.8;
    return v;
  }
  get availableCapacity(): number { return this.capacity - this.equipmentWeight; }
  get maxAP(): number {
    let v = 5 + Math.round(this.agility * 1.5 + Math.pow(this.generalBattleExperience ?? 0, 0.5) / 40);
    const bm = this.battleMorale;
    if (bm < 20) v--;
    if (bm < 10) v--;
    if (bm > 80) v++;
    if (bm > 90) v++;
    if (bm > 99) v++;
    const r = this.equipmentWeight / Math.max(this.capacity, 1);
    if (r > 1) v--;
    if (r > 1.2) v--;
    if (r <= 0.5) v++;
    return Math.max(v, 2);
  }
  get armor(): number { return (this.Jacket > 0 ? (Character.ds()?.items?.Armor?.[this.Jacket]?.armor ?? 0) : 0) + this.headArmor; }
  get headArmor(): number { return this.Headgear > 0 ? (Character.ds()?.items?.Armor?.[this.Headgear]?.armor ?? 0) : 0; }
  get fireResistance(): number {
    const A = Character.ds()?.items?.Armor ?? [];
    return (this.Jacket > 0 ? (A[this.Jacket]?.fireResistance ?? 0) : 0) + (this.Headgear > 0 ? (A[this.Headgear]?.fireResistance ?? 0) : 0);
  }
  get explosionResistance(): number {
    const A = Character.ds()?.items?.Armor ?? [];
    return (this.Jacket > 0 ? (A[this.Jacket]?.explosionResistance ?? 0) : 0) + (this.Headgear > 0 ? (A[this.Headgear]?.explosionResistance ?? 0) : 0);
  }

  // ---------- 战斗技能 getter（原版 Character.as L3174-3432；供阶段 B 战斗模块） ----------
  get learningCapacity(): number { return this.intelligence * 10; }
  get rangedWeaponsSkill(): number { return this.intelligence * 10; }
  get crossbowSkill(): number { return Math.round(this.rangedWeaponsSkill * 0.5 + Math.pow(this.crossbowExperience ?? 0, 0.5) * 0.5); }
  get rocketLauncherSkill(): number { return Math.round(this.rangedWeaponsSkill * 0.5 + Math.pow(this.rocketLauncherExperience ?? 0, 0.5) * 0.5); }
  get pistolSkill(): number { return Math.round(this.rangedWeaponsSkill * 0.7 + Math.pow(this.pistolExperience ?? 0, 0.5) * 0.3); }
  get rifleSkill(): number { return Math.round(this.rangedWeaponsSkill * 0.6 + Math.pow(this.rifleExperience ?? 0, 0.5) * 0.4); }
  get machinegunSkill(): number { return Math.round(this.rangedWeaponsSkill * 0.5 + Math.pow(this.machinegunExperience ?? 0, 0.5) * 0.5); }
  get smgSkill(): number { return Math.round(this.rangedWeaponsSkill * 0.5 + Math.pow(this.smgExperience ?? 0, 0.5) * 0.5); }
  get shotgunSkill(): number { return Math.round(this.rangedWeaponsSkill * 0.6 + Math.pow(this.shotgunExperience ?? 0, 0.5) * 0.4); }
  get flamethrowerSkill(): number { return Math.round(this.rangedWeaponsSkill * 0.2 + Math.pow(this.flamethrowerExperience ?? 0, 0.5) * 0.8); }
  get throwSkill(): number { return Math.round(this.physical * 7 + Math.pow(this.throwExperience ?? 0, 0.5)); }
  get throwingAccuracy(): number { return Math.max(this.accuracy * 4, 1) + Math.pow(this.throwExperience ?? 0, 0.5) / 2; }
  get painThreshold(): number { return 1 / Math.pow(Math.max(this.painExperience * this.physical / 10, 1), 0.1); }
  get firstAidSkill(): number { return this.doctorSkill() * 0.8 + Math.pow(this.firstAidExperience ?? 0, 0.5); }
  get sight(): number { return Math.pow(this.accuracy * 10 + Math.pow(this.travelExperience ?? 0, 0.5), 0.5) * 8; }
  get smugglingSkill(): number { return this.agility * 4 + this.accuracy * 2 + this.intelligence * 3 + Math.pow(this.smugglingExperience ?? 0, 0.5); }
  get unarmedSkill(): number { return this.physical * 1.5 + this.accuracy * 0.4 + Math.pow(this.unarmedExperience ?? 0, 0.5); }
  get meleeSkill(): number { return this.physical * 1.8 + this.accuracy * 0.7 + Math.pow(this.closeBattleExperience ?? 0, 0.5); }
  get knivesSkill(): number { return this.physical * 1.8 + this.accuracy * 0.7 + Math.pow(this.knivesExperience ?? 0, 0.5); }
  get clubsSkill(): number { return this.physical * 1.8 + this.accuracy * 0.7 + Math.pow(this.clubsExperience ?? 0, 0.5); }
  get choppingSkill(): number { return this.physical * 1.8 + this.accuracy * 0.7 + Math.pow(this.choppingExperience ?? 0, 0.5); }
  get swordsSkill(): number { return this.physical * 1.8 + this.accuracy * 0.7 + Math.pow(this.swordsExperience ?? 0, 0.5); }
  get unarmedDamage(): number { return (this.physical * 1.5 + this.accuracy * 0.4 + Math.pow(this.closeBattleExperience ?? 0, 0.5) / 20 + Math.pow(this.unarmedExperience ?? 0, 0.5) / 5) * 0.5; }
  get unarmedHitChance(): number { return this.agility * 7 + this.accuracy * 9 + Math.pow(this.unarmedExperience ?? 0, 0.5) / 3 + Math.pow(this.closeBattleExperience ?? 0, 0.5) / 6; }
  get closeBattleDodge(): number { return this.agility * 2 + Math.pow(this.closeBattleExperience ?? 0, 0.5) / 10 + Math.pow(this.dodgeExperience ?? 0, 0.5) / 5; }
  // 原版：按武器 subCategory 的技能名（detectWeaponSkill）
  static detectWeaponSkill(ds: any, weaponSub: number): string {
    const w = ds?.weapons?.Weapons?.[weaponSub];
    const wt = w && ds.weapons.WeaponTypes?.[w.type];
    if (!wt) return "unarmed";
    if (wt.category === 0 || w.type === 24) return "unarmed";
    if (wt.category === 1) {
      switch (w.type) { case 1: return "knives"; case 2: return "clubs"; case 19: return "chopping"; case 20: return "swords"; }
    }
    if (wt.category === 3) { switch (wt.subCategory) { case 1: return "crossbow"; case 2: return "rocketLauncher"; } }
    if (wt.category === 2) {
      switch (wt.subCategory) { case 1: return "pistol"; case 2: return "rifle"; case 3: return "machinegun"; case 4: return "smg"; case 5: return "shotgun"; }
    }
    if (wt.category === 4) return "flamethrower";
    if (wt.category === 5) return "throw";
    return "unarmed";
  }
  meleeDamage(sub: number): number {
    const skill = Character.detectWeaponSkill(Character.ds(), sub);
    return this.physical * 1.8 + this.accuracy * 0.7 + Math.pow(this.closeBattleExperience ?? 0, 0.5) / 20 + Math.pow((this as any)[skill + "Experience"] ?? 0, 0.5) / 10;
  }
  meleeHitChance(sub: number): number {
    const skill = Character.detectWeaponSkill(Character.ds(), sub);
    return this.agility * 7 + this.accuracy * 9 + Math.pow((this as any)[skill + "Experience"] ?? 0, 0.5) / 3 + Math.pow(this.closeBattleExperience ?? 0, 0.5) / 6;
  }

  // ---------- 现有技能方法（保留原公式，调用点不变） ----------
  // 原版 Character.as:3239-3252：医生 = 智力×10 + √医生经验；本人失血过重时扣减（HP/maxHP<0.1 → -30，≤0.2 → -10），下限 0
  doctorSkill(): number {
    let v = (this.intelligence ?? 10) * 10 + Math.sqrt(Math.max(this.doctorExperience ?? 0, 0));
    const hpRatio = this.HP / this.maxHP; // maxHP = max(physical*20,1) ≥ 1，不会 NaN
    if (hpRatio < 0.1) v -= 30;
    else if (hpRatio <= 0.2) v -= 10;
    return Math.max(v, 0);
  }
  veterinarySkill(): number { return (this.intelligence ?? 10) * 6 + Math.sqrt(this.veterinaryExperience ?? 0) * 2; }
  huntingSkill(): number { return (this.agility ?? 10) * 3 + (this.accuracy ?? 10) * 4 + (this.intelligence ?? 10) + Math.sqrt(this.huntingExperience ?? 0); }
  collectingSkill(): number { return 20 + (this.agility ?? 10) * 5 + Math.sqrt(this.collectingExperience ?? 0); }
  mechanicSkill(): number { return (this.intelligence ?? 10) * 3 + (this.agility ?? 10) * 2 + Math.sqrt(this.mechanicExperience ?? 0) * 3; }

  // 原版 Character.wounded：0=健康 1-4=轻/中/重/危（maxHP-HP < 0.5 视为健康）
  get wounded(): number {
    const mx = this.maxHP, hp = this.HP;
    if (mx - hp < 0.5) return 0;
    if (hp > mx * 0.8) return 1;
    if (hp > mx * 0.4) return 2;
    if (hp > mx * 0.1) return 3;
    return 4;
  }
  // 原版 Character.GDA（每日热量需求 kcal，基于理想体重）
  get BMR(): number { return (66 + 13.7 * this.weight + 5 * this.Height - 6.8 * this.age) * 1.2; }
  get GDA(): number { return (66 + 13.7 * this.idealWeight + 5 * this.Height - 6.8 * this.age) * 1.2; }
  // 原版 Character.waterConsumption（每日饮水 L）
  get waterConsumption(): number { return this.weight * 0.035; }
  // 原版 Character.speed（步速：3+敏捷/2，受伤减速，断腿 /1.5）
  get speed(): number {
    let s = 3 + this.agility / 2;
    const w = this.wounded;
    if (w === 2) s *= 0.9;
    else if (w === 3) s *= 0.8;
    else if (w === 4) s *= this.HP / Math.max(this.maxHP, 1) * 3;
    s = Math.max(s, 1);
    if (this.legDamage) s /= 1.5;
    return s;
  }
  // 原版 Character.totalExperience：Σ skillsList experience 字段
  get totalExperience(): number {
    let t = 0;
    for (const s of Character.skillsList) t += (this as any)[s.experience] ?? 0;
    return t;
  }
  // The supplied SWF AND backup contain pushbyte 0/nop here (verified pcode),
  // not salaryCoefficient. Preserve that zero-minimum-wage patch, including negotiated salary.
  recalculateSalary(relation: number | null = null) {
    this.minSalary = Math.round((Math.pow(this.basePhysical+this.baseAgility+this.baseAccuracy+this.baseIntelligence,2)+Math.sqrt(this.totalExperience)*8)/10)*20*0;
    if (typeof relation === "number") this.minSalary *= Math.max(1-relation/1000,.4);
    if (0 < this.minSalary) this.salary = this.minSalary;
  }
  // 原版 Character.meatAmount（屠宰出肉量）
  get meatAmount(): number { return this.weight * 0.3; }

  // ---------- 装备方法（原版 Character.as L2508-2733） ----------
  // addItemToEquipment(item, markInUse)：item 可为 {type,amount,inUse} 或 item id；同 type 合并
  addItemToEquipment(item: any, markInUse = false) {
    const type = typeof item === "number" ? item : item?.type;
    const amount = typeof item === "number" ? 1 : (item?.amount ?? 1);
    if (!type || type <= 0) return;
    const e = this.equipment.find((x) => x.type === type);
    if (e) {
      e.amount += amount;
      if (markInUse) e.inUse += amount;
    } else {
      this.equipment.push({ type, amount, inUse: markInUse ? amount : 0 });
    }
  }
  // 原版 reduceItemFromEquipment(type, amount, fromInUse=false, fromCargo=false)
  reduceItemFromEquipment(type: number, amount: number, fromInUse = false, fromCargo = false) {
    const idx = this.equipment.findIndex((x) => x.type === type);
    if (idx < 0) return;
    const e = this.equipment[idx];
    if (fromInUse) e.inUse = Math.max(0, (e.inUse ?? 0) - amount);
    e.amount -= amount;
    if (e.amount < 0.5) this.equipment.splice(idx, 1);
    if (fromCargo) {
      const c = (globalThis as any).__c2?.shell?.gd?.Caravans?.[0];
      if (c && c.inUse && typeof c.inUse[type] === "number") c.inUse[type] = Math.max(0, c.inUse[type] - amount);
    }
  }
  // 便捷：从物品池扣减（Battle 急救/弹药消耗等旧调用点）
  removeItemFromEquipment(id: number, amount = 1) {
    this.reduceItemFromEquipment(id, amount);
  }
  // Character.as:2233, adapted to the Web equipment-record representation.
  updateSelectedAmmo(slot = 0) {
    const ds=Character.ds(), weapon=ds?.weapons?.Weapons?.[this.weapons[slot]];
    if(!weapon || ![2,3,4].includes(ds.weapons.WeaponTypes[weapon.type]?.category)){
      this.selectedAmmo[slot]=null;return;
    }
    if(weapon.ammo===17){this.selectedAmmo[slot]={type:231,amount:1,inUse:0};return;}
    const suitable=(e:any)=>{const item=ds.items.Items[e.type];return item?.category===3 && ds.weapons.Ammo[item.subCategory]?.type===weapon.ammo && e.amount-(e.inUse??0)>0;};
    this.selectedAmmo[slot]=this.equipment.find(e=>e.type===this.selectedAmmo[slot]?.type && suitable(e))??this.equipment.find(suitable)??null;
  }
  // Character.as:2608; dialogue sales must detach equipment before removing cargo.
  unequip(id: number, amount: number) {
    if(id<=0 || amount<=0)return;
    const ds=Character.ds(), item=ds?.items?.Items?.[id];
    if(!item)return;
    this.reduceItemFromEquipment(id,amount,false,true);
    let remaining=amount;
    if(item.category===2){
      const weapon=ds.weapons.Weapons[item.subCategory];
      for(let slot=0;slot<this.weapons.length && remaining>0;slot++){
        if(this.weapons[slot]!==item.subCategory)continue;
        if(ds.weapons.WeaponTypes[weapon?.type]?.category===5){
          const removed=Math.min(remaining,this.grenadeAmounts[slot]);
          this.grenadeAmounts[slot]-=removed;remaining-=removed;
          if(this.grenadeAmounts[slot]<=0)this.weapons[slot]=0;
        }else{this.weapons[slot]=0;remaining--;}
      }
      this.checkAttachmentsCompatibility();
    }else if(item.category===3){
      for(let slot=0;slot<this.weapons.length;slot++)this.updateSelectedAmmo(slot);
    }else if(item.category===4){
      for(const slots of this.attachments)for(let i=0;i<slots.length && remaining>0;i++){
        if(slots[i]===item.subCategory){slots[i]=null;remaining--;}
      }
    }else if(item.category===5){
      const type=ds.items.Armor[item.subCategory]?.type;
      if(type===1)this.Jacket=0;
      if(type===2)this.Headgear=0;
    }
  }
  // 附件兼容性（原版 checkAttachmentsCompatibility：不适用即卸下回物品池）
  checkAttachmentsCompatibility() {
    const ds = Character.ds();
    for (let ws = 0; ws < 2; ws++) {
      const skill = this.weapons[ws] > 0 ? Character.detectWeaponSkill(ds, this.weapons[ws]) : null;
      for (let a = 0; a < 2; a++) {
        const sub = this.attachments[ws]?.[a];
        if (sub && sub > 0) {
          const att = ds?.weapons?.Attachments?.[sub];
          const ok = !!att && Array.isArray(att.applicable) && skill !== null && att.applicable.includes(skill);
          if (!ok) {
            const itemId = Character.attachmentItemId(ds, sub);
            if (itemId) this.reduceItemFromEquipment(itemId, 1, false, true);
            this.attachments[ws][a] = null;
          }
        }
      }
    }
  }
  static attachmentItemId(ds: any, sub: number): number {
    const items = ds?.items?.Items;
    if (!items) return 0;
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      if (it && it.category === 4 && it.subCategory === sub) return i;
    }
    return 0;
  }
  // 附件效果（原版 attachmentsEffects：累加 affectAccuracy/affectAP/affectSpread）
  attachmentsEffects(slot = -1): { accuracy: number; ap: number; spread: number } {
    const out = { accuracy: 0, ap: 0, spread: 0 };
    const ds = Character.ds();
    const battery = this.attachmentsBatteryStatus();
    const slots = slot >= 0 && slot < 2 ? [slot] : [0, 1];
    for (const ws of slots) {
      const wt = ds?.weapons?.Weapons?.[this.weapons[ws]];
      const modes = wt && ds.weapons.WeaponTypes?.[wt.type]?.modes;
      const mode = modes?.[this.currModes?.[ws] ?? 0];
      for (let a = 0; a < 2; a++) {
        const sub = this.attachments[ws]?.[a];
        if (!sub || sub <= 0 || !battery?.[ws]?.[a]) continue;
        const att = ds?.weapons?.Attachments?.[sub];
        if (!att) continue;
        let active = true;
        if (att.scope && !(mode?.headShot || mode?.aimed)) active = false;
        if (att.laser && (mode?.headShot || mode?.aimed)) active = false;
        if (active) {
          out.accuracy += att.affectAccuracy ?? 0;
          out.ap += att.affectAP ?? 0;
          out.spread += att.affectSpread ?? 0;
        }
      }
    }
    return out;
  }
  // 附件电池状态（原版 attachmentsBatteryStatus：返回 2x2 布尔）
  attachmentsBatteryStatus(): boolean[][] {
    const status = [[true, true], [true, true]];
    const ds = Character.ds();
    let batteries = 0;
    for (const e of this.equipment) if (e && e.type === 219) { batteries += e.amount; break; }
    for (let ws = 0; ws < 2; ws++) {
      for (let a = 0; a < 2; a++) {
        const sub = this.attachments[ws]?.[a];
        if (!sub || sub <= 0) continue;
        const att = ds?.weapons?.Attachments?.[sub];
        const need = att?.batteries ?? 0;
        if (need > batteries) status[ws][a] = false;
        else if (need > 0) batteries -= need;
      }
    }
    return status;
  }

  // ---------- 原版 Character.price（L3645）：以四维属性+总经验定价，性别/年龄修正（奴隶价格基线） ----------
  price(): number {
    const sum = (this.physical ?? 10) + (this.agility ?? 10) + (this.accuracy ?? 10) + (this.intelligence ?? 10);
    const expFields = ["travelExperience", "doctorExperience", "veterinaryExperience", "mechanicExperience", "collectingExperience", "huntingExperience", "unarmedExperience", "weaponsExperience", "accuracyExperience", "dodgingExperience"];
    let exp = 0;
    for (const f of expFields) exp += (this as any)[f] ?? 0;
    let v = Math.round((Math.pow(sum, 2) + Math.pow(exp, 0.5) * 8) / 10) * 150;
    if (this.gender === 2) {
      if (this.age < 25) v *= 2;
      else if (this.age < 30) v *= 1.5;
      else if (this.age < 35) v *= 1.2;
      else if (this.age > 40) v *= 0.7;
    } else if (this.age > 40) v *= 0.8;
    return Math.max(1, Math.round(v));
  }

  // ---------- 兼容兜底（旧档/原版档迁移，TEAM-CHARACTER-SPEC §4.5） ----------
  static fixup(ch: Character, ds?: any): Character {
    const dsx = ds ?? (globalThis as any).__c2?.ds;
    // 双武器槽（旧单数组/旧武器字段迁移）
    if (!Array.isArray(ch.weapons) || ch.weapons.length < 2) {
      const w0 = Array.isArray(ch.weapons) ? ch.weapons[0] : 0;
      ch.weapons = [w0 ?? 0, Array.isArray(ch.weapons) ? (ch.weapons[1] ?? 0) : 0];
    }
    if ((ch as any).weaponItem && !ch.weapons[0] && dsx) {
      const it = dsx.items?.Items?.[(ch as any).weaponItem];
      if (it && it.category === 2) ch.weapons[0] = it.subCategory;
    }
    delete (ch as any).weaponItem;
    // 附件 2x2
    if (!Array.isArray(ch.attachments)) ch.attachments = [[null, null], [null, null]];
    for (let i = 0; i < 2; i++) {
      if (!Array.isArray(ch.attachments[i])) ch.attachments[i] = [null, null];
      while (ch.attachments[i].length < 2) ch.attachments[i].push(null);
    }
    // 手雷/模式/弹药槽
    if (!Array.isArray(ch.grenadeAmounts) || ch.grenadeAmounts.length < 2) ch.grenadeAmounts = [ch.grenadeAmounts?.[0] ?? 0, ch.grenadeAmounts?.[1] ?? 0];
    if (!Array.isArray(ch.currModes) || ch.currModes.length < 2) ch.currModes = [0, 0];
    if (!Array.isArray(ch.loadedAmmo) || ch.loadedAmmo.length < 2) ch.loadedAmmo = [ch.loadedAmmo?.[0] ?? null, ch.loadedAmmo?.[1] ?? null];
    if (!Array.isArray(ch.selectedAmmo) || ch.selectedAmmo.length < 2) ch.selectedAmmo = [ch.selectedAmmo?.[0] ?? null, ch.selectedAmmo?.[1] ?? null];
    // 护甲（旧 armorItem item id → Jacket subCategory）
    if ((ch as any).armorItem && !ch.Jacket && dsx) {
      const it = dsx.items?.Items?.[(ch as any).armorItem];
      if (it && it.category === 5) ch.Jacket = it.subCategory;
    }
    delete (ch as any).armorItem;
    // equipment：旧 number[] → {type,amount,inUse}[]；老对象补 inUse
    if (Array.isArray(ch.equipment) && ch.equipment.length && typeof (ch.equipment[0] as any) === "number") {
      ch.equipment = (ch.equipment as any).map((id: number) => ({ type: id, amount: 1, inUse: 0 }));
    }
    for (const e of ch.equipment) { if (e && typeof e === "object") { if (typeof e.inUse !== "number") e.inUse = 0; if (typeof e.amount !== "number") e.amount = 1; } }
    // 命名对齐兜底（Object.assign 已经 setter 处理，双保险）
    if (ch.Height === undefined && (ch as any).height !== undefined) { ch.Height = (ch as any).height; delete (ch as any).height; }
    if (ch._weight === undefined && (ch as any).weight !== undefined) { ch._weight = (ch as any).weight; delete (ch as any).weight; }
    if (ch._morale === undefined && (ch as any).morale !== undefined) { ch._morale = (ch as any).morale; delete (ch as any).morale; }
    if (ch.basePhysical === undefined && (ch as any).physical !== undefined) { ch.basePhysical = (ch as any).physical; delete (ch as any).physical; }
    if (ch.baseAgility === undefined && (ch as any).agility !== undefined) { ch.baseAgility = (ch as any).agility; delete (ch as any).agility; }
    if (ch.baseAccuracy === undefined && (ch as any).accuracy !== undefined) { ch.baseAccuracy = (ch as any).accuracy; delete (ch as any).accuracy; }
    if (ch.baseIntelligence === undefined && (ch as any).intelligence !== undefined) { ch.baseIntelligence = (ch as any).intelligence; delete (ch as any).intelligence; }
    // 伤势 bool 语义归一（原版 bool → 本项目 0/1）
    ch.eyeDamage = ch.eyeDamage ? 1 : 0;
    ch.armDamage = ch.armDamage ? 1 : 0;
    ch.legDamage = ch.legDamage ? 1 : 0;
    return ch;
  }

  constructor(init?: Record<string, any>) {
    if (init) {
      // maxHP is a derived getter in the original Character class. EnemyPersonSpec
      // carries a cached maxHP for battle setup, so assigning the whole spec would
      // try to write a getter-only property and abort friendly-caravan trading.
      const { maxHP: _derivedMaxHP, ...writableInit } = init;
      Object.assign(this, writableInit);
      Character.fixup(this);
      if (init.minSalary === undefined) this.recalculateSalary();
    }
  }
}

// ---------- 运输单位工厂（⑦a：equipRandomCaravan transport 分支 / Caravan.newTransport 共用） ----------
// 对齐原版 TransportUnit 构造：随机性别/年龄/理想体重/寿命；age 由调用方覆写（车队按 maxAge×30% 老化）
// Fresh characters only: original Character.as constructor (Town/MapMode slave stock).
// Never use this factory when restoring saved characters.
export function makeRandomCharacter(ds: DataStore, init: Record<string, any> = {}): Character {
  const integer = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const gender = init.gender ?? (Math.random() < .3 ? 2 : 1), age = init.age ?? integer(16, 54);
  const level = init.levelModifier ?? 1, experience = init.experienceModifier ?? age / 30;
  const stats: Record<string, any> = { category: 2, gender, age };
  stats.basePhysical = init.physical ?? init.basePhysical ?? Math.min(Math.round((integer(4, 7) - Math.abs(age - 20) / 15) * level * (gender === 1 ? 1.2 : .8)), 10);
  stats.baseAgility = init.agility ?? init.baseAgility ?? Math.min(Math.round((integer(4, 7) - Math.abs(age - 18) / 15) * level * (gender === 1 ? .8 : 1.2)), 10);
  stats.baseAccuracy = init.accuracy ?? init.baseAccuracy ?? Math.min(Math.round((integer(4, 7) - Math.abs(age - 25) / 20) * level), 10);
  stats.baseIntelligence = init.intelligence ?? init.baseIntelligence ?? Math.min(Math.round((integer(4, 7) + Math.min((age - 15) / 15, 1.7)) * level), 10);
  for (const skill of Character.skillsList) stats[skill.experience] = init[skill.experience] ?? Math.round(100 * Math.random() * experience);
  stats.generalBattleExperience = init.generalBattleExperience ?? Math.round(500 * Math.random() * experience);
  const p = new Character({ ...stats, ...init });
  const names: string[] = ds.namePhonetics?.[gender === 2 ? 'EnglishFemaleNames' : 'EnglishMaleNames'] ?? [];
  p.name = init.name?.__call__ === 'Texts.fetch' ? getText(ds, init.name.args[0])
    : String(init.name ?? names[integer(0, Math.max(0, names.length - 1))] ?? 'Mercenary');
  if (init.height == null && init.Height == null) p.Height = 150 + p.physical * 3 + p.physical * Math.random() * 4;
  if (init.idealWeight == null) p.idealWeight = p.Height - 100 - (p.Height - 150) / (gender === 1 ? 4 : 2);
  if (init.weight == null && init._weight == null) p.weight = p.idealWeight * (.7 + Math.random() * .4);
  if (init.morale == null && init._morale == null) p.morale = integer(30, 70);
  if (init.HP == null && init._HP == null) p.HP = p.maxHP;
  return p;
}

export function makeTransportUnit(type: number, ds: any, nameCounter = 0): any {
  const t = ds?.transports?.Types?.[type] ?? {};
  const cat = t.category ?? 1;
  const gender = Math.random() < 0.5 ? 1 : 2; // Rndm.integer(1,2)
  const maxAge = (t.lifespan ?? 360) * 30 * (0.8 + Math.random() * 0.4);
  const age = Math.round(maxAge * Math.random());
  let ideal = (t.weight ?? 100) * (0.8 + Math.random() * 0.4);
  if (cat !== 1) ideal = t.weight ?? 100;
  const baseHealth = Math.round((t.maxHealth ?? 1000) * ideal / Math.max(t.weight ?? 100,1));
  if (cat === 1) ideal *= gender === 1 ? 1.05 : .95;
  const maxHealth = baseHealth;
  const agePeriod = () => {
    if (cat !== 1) return 4;
    if (unit.age < (t.lactation ?? 0)) return 1;
    if (unit.age < (t.maturity ?? 720)) return 2;
    if (unit.age < maxAge * 0.8) return 3;
    return 4;
  };
  const idealWeight = () => (agePeriod() < 3 ? Math.max(Math.round(ideal / 10), Math.round(ideal * unit.age / (t.maturity ?? 720))) : ideal);
  const maxHealthG = () => (agePeriod() < 3 ? maxHealth * Math.max(unit.age / (t.maturity ?? 720), 0.1) : maxHealth);
  const capacity = () => {
    if (cat === 1) {
      if (agePeriod() === 1) return 0;
      let v = (t.capacity ?? 0) * maxHealthG() / Math.max(t.maxHealth ?? 1000, 1);
      v *= (unit && unit.weight !== undefined ? unit.weight : ideal) / Math.max(idealWeight(), 1);
      if (agePeriod() > 3) v *= 1 - (unit.age - unit.maxAge * 0.8) / (maxAge * 0.2);
      return v;
    }
    let v = t.capacity ?? 0;
    if (cat === 2 || cat === 3) {
      const hp = (unit && unit.health !== undefined ? unit.health : maxHealth) / Math.max(maxHealthG(), 1);
      if (hp < 0.3) v *= hp * 3;
    }
    return v;
  };
  const milkConsumption = () => (agePeriod() > 1 ? 0 : (t.milkConsumption ?? 0) * idealWeight() / Math.max(t.weight ?? 100, 1));
  const forageConsumption = () => (agePeriod() === 1 ? 0 : (t.forageConsumption ?? 0) * idealWeight() / Math.max(t.weight ?? 100, 1));
  const waterConsumption = () => (agePeriod() === 1 ? 0 : (t.waterConsumption ?? 0) * idealWeight() / Math.max(t.weight ?? 100, 1));
  const produces = () => {
    const arr: Array<{ item: number; amount: number }> = [];
    for (const p of (t.produces ?? [])) arr.push({ item: p.item, amount: p.amount });
    if (gender === 2 && t.milk && agePeriod() > 2) {
      let m = 1;
      if ((unit && unit.remainingLactation) > 0) m = 2;
      if (unit && unit.pregnant) m *= 1 + 0.3 * (1 - ((unit && unit.remainingPregnancy) ?? 0) / Math.max(t.gestation ?? 360, 1));
      m *= (unit && unit.weight !== undefined ? unit.weight : ideal) / Math.max(t.weight ?? 100, 1);
      if (unit && unit.age > unit.maxAge * 0.7) m *= Math.max(1 - ((unit.age - unit.maxAge * 0.7) / unit.maxAge) * 5, 0);
      if (unit && unit.hunger > 0) m *= 1 - Math.min(unit && unit.hunger / 50, 1);
      if (unit && unit.thirst > 0) m *= 1 - Math.min(unit && unit.thirst / 30, 1);
      if (m > 0.01) arr.push({ item: t.milk.item, amount: (t.milk.amount ?? 0) * m });
    }
    return arr;
  };
  const unit: any = {
    type, health: maxHealth, _maxHealth: maxHealth,
    hunger: 0, thirst: 0,
    gender, age, maxAge,
    _idealWeight: ideal, weight: ideal,
    pregnant: false, remainingPregnancy: 0, pregnantWith: 0,
    remainingLactation: 0, mother: null, cycleCounter: 0,
    lubricantLevel: cat === 1 ? 0 : t.maxLubricant ?? 0, waterLevel: cat === 1 ? 0 : t.maxWater ?? 0,

    get agePeriod() { return agePeriod(); },
    get idealWeight() { return idealWeight(); },
    get maxHealth() { return maxHealthG(); },
    get capacity() { return capacity(); },
    get maxPassengers() { return t.passengers ?? 0; },
    get speed() { return t.speed ?? 0; },
    get windPowered() { return !!t.windPowered; },
    get category() { return cat; },
    get milkConsumption() { return milkConsumption(); },
    get forageConsumption() { return forageConsumption(); },
    get waterConsumption() { return waterConsumption(); },
    get production() { return produces(); },
    get multiplication() { return t.multiplication ?? 1; },
    get fuelConsumption() { return t.fuelConsumption ?? 0; },
    get fuelTank() { return t.fuelTank ?? 0; },
    // 原版 TransportUnit.price getter：category==1（动物）时按体重比/性别/年龄修正
    price() {
      let v = (t.price ?? 1000);
      if ((t.category ?? 1) === 1) {
        v *= unit.weight / (t.weight ?? 100);
        v *= gender === 1 ? 0.9 : 1.1;
        if (unit.age > unit.maxAge * 0.7) v *= 1 - (unit.age - unit.maxAge * 0.7) / (maxAge - maxAge * 0.7);
        if (unit.agePeriod === 1) v *= unit.age / t.lactation;
        if (unit.agePeriod === 2) v *= 1 + (t.maturity - unit.age) / (t.maturity - t.lactation) * .5;
      }
      v -= (maxHealthG() - (unit && unit.health !== undefined ? unit.health : maxHealth)) * (cat === 1 ? 20 : cat === 2 ? 25 : 70);
      // TransportUnit.as:1126: animals retain the value of their meat and hide.
      if (cat === 1) {
        const item = ds.items?.Items?.[t.meat];
        const meat = item?.category === 1 ? ds.items?.Goods?.[item.subCategory] : null;
        const skinAmount = (t.skinAmount ?? 0) * unit.idealWeight / t.weight;
        v = Math.max(v, (meat?.price ?? 0) * unit.weight * .35 + skinAmount * (ds.items?.Goods?.[23]?.price ?? 0));
      }
      return Math.max(0, Math.round(v));
    },
    // 座位/车架关系（原版 TransportUnit：Passengers/passengerIn/cart/attachedTo；存档以 {k,i} 索引桩序列化）
    Passengers: [], passengerIn: null, cart: null, attachedTo: null,
  };
  unit.weight = cat === 1 ? idealWeight() : ideal;
  unit.health = maxHealthG() * (.5 + Math.random() * .5);
  return unit;
}

// ---------- 外观默认色（⑦h：原版 Character 构造的默认随机色，EquipRandomCaravan 每人补全） ----------
function hsvColor(h: number, s: number, v: number, bc: number): { r: number; g: number; b: number; bc: number } {
  const c = hsv2rgb(h, s, v);
  return { r: c.r, g: c.g, b: c.b, bc };
}
// 原版 Character.as:841-864 hairColor（race/age 五分支）
export function randomHairColor(age: number): { r: number; g: number; b: number; bc: number } {
  const race = Math.random();
  let h = 0, s = 0, v = 0, bc = 1;
  if (age > 40 && Math.random() < age / 100 - race / 3) { // 白发
    h = 0; s = 0; v = 60 + Math.random() * 40; bc = 1;
  } else if (race < 0.1 || Math.random() < 0.5 - race / 2) { // 黑
    h = 10 + Math.random() * 10; s = 50 + Math.random() * 30; v = 5 + Math.random() * 20; bc = 0.8 + Math.random() * 0.2;
  } else if (race > 0.9 || Math.random() < race / 4) {       // 浅金
    h = 30 + Math.random() * 10; s = 15 + Math.random() * 7; v = 80 + Math.random() * 10; bc = 1 + Math.random() * 0.2;
  } else if (Math.random() < 0.2 + race / 10) {              // 棕
    h = 5 + Math.random() * 30; s = 60 + Math.random() * 20; v = 40 + Math.random() * 20; bc = 1;
  } else if (Math.random() < race / 10 + 0.1) {              // 深棕
    h = 40 + Math.random() * 10; s = 15 + Math.random() * 10; v = 55 + Math.random() * 20; bc = 1 + Math.random() * 0.1;
  } else {                                                   // 灰棕渐变
    const vv = 20 + Math.random() * 80;
    h = 40 - vv / 5; s = 100 - vv; v = vv; bc = 0.8 + Math.random() * 0.4;
  }
  return hsvColor(h, s, v, bc);
}
// 原版 Character.as:1008-1019 pantsColor：hsv(0-359, 0-30, 0-70)，bc=1+rand*0.5
export function randomPantsColor(): { r: number; g: number; b: number; bc: number } {
  return hsvColor(Math.floor(Math.random() * 360), Math.floor(Math.random() * 31), Math.floor(Math.random() * 71), 1 + Math.random() * 0.5);
}
// 原版 Character.as:1036-1044 shirtColor：hsv(0-360, 0-20×(150-v)/150, 10-100)，bc=0.8+rand*0.2
export function randomShirtColor(): { r: number; g: number; b: number; bc: number } {
  const h = Math.floor(Math.random() * 361);
  const v = 10 + Math.floor(Math.random() * 91);
  const s = Math.round(Math.floor(Math.random() * 21) * ((150 - v) / 150));
  return hsvColor(h, s, v, 0.8 + Math.random() * 0.2);
}

// 原版 MathFunctions.probabilityRandom(数组) 语义：按权重抽下标（"泊松式逐次判定"的数组形态）
export function weightedIndex(weights: number[]): number {
  let r = Math.random();
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] ?? 0;
    if (r <= acc) return i;
  }
  return weights.length - 1;
}

export class Caravan {
  x = 0; y = 0;
  direction = 0; // 弧度
  moving = false;
  category = 0;
  slavers = false; // 原版 Caravan.slavers（奴隶商车队：可买卖人口）
  cannibal = false; // 原版 Caravan.cannibal（食人族车队：可吃人肉 174）
  money = 0;
  People: Character[] = [];
  cargo = new Map<number, number>();
  squareX = 0; squareY = 0;
  overTown: number | null = null; // 附近城镇标记（原版：每帧按 <25px 重算，仅点击时进镇）
  recentlyInteractedTowns: number[] = []; // 最近交互城镇（原版 recentlyInteractedTowns：出镇保护，离开半径后清空）
  nearbyTowns: number[] = [];
  mapSymbol: any = null;
  // 运输单位（原版 TransportUnit 完整字段：健康/饥渴/体重/年龄/怀孕/哺乳…）
  transports: Array<any> = [];
  // 采集/狩猎（原版 collectForage/hunt 开关 + 区域资源枯竭度）
  collectForage = false;
  hunt = false;
  zoneForageDevastation = 0;
  zonePreyDevastation = 0;
  // 车辆自动维护（原版 autoFillLubricant / autoFillWater）
  autoFillLubricant = false;
  autoFillWater = false;
  milk = true;
  shear = true;
  // 电池充电队列（原版 chargingBatteries：每元素 = 充电进度 0-1440）
  chargingBatteries: number[] = [];
  // 电力网状态（每周期 devicesCycle 结算）
  electricOverload = false;
  electricityProduction = 0;
  electricityConsumption = 0;
  // 原版 Caravan.actualWarPower（Caravan.as:1286-1321）。转译后的对话动作会读它：
  // Data/Dialogues.as:14158 / :16960 → responses[924]/[1213] 用 (actualWarPower/100 + rep6/10)/compareNum
  // 在本镇人口<85 时选 entry 542 还是 538。
  get actualWarPower(): number {
    return peopleWarPower(this.People ?? [], (globalThis as any).__c2?.ds, true);
  }
  // 液体容量（原版 maxLiquidAmount：Σ 容器体积×数量 + 燃料时车辆 fuelTank）
  // 原版 Caravan.maxLiquidAmount：返回该液体还可装载的余量
  // （Σ 可装此液体的容器体积 × 数量 + 燃油时车辆 fuelTank − 当前已载该液体量；无容器 → 0）
  maxLiquidAmount(liquid: number): number {
    // Negative headroom is required by the trade/loot overflow warning.
    return this.syncLiquidContainers(true, liquid).headroom;
  }

  // Original production/consumption ledger and container assignments.
  // cargo is authoritative for quantities; liquidsContainers below is legacy Web metadata.
  historicalData: import("./ConsProdGraph").HistoricalPoint[] = [];
  private recordingHistory = false;
  private historyPoint: import("./ConsProdGraph").HistoricalPoint | null = null;
  beginHistory(time: number) {
    let point=this.historicalData.find(p=>p.time===time);
    if(!point){
      point={time,production:[],consumption:[],playersProduction:[],playersConsumption:[]};
      this.historicalData.push(point);this.historicalData.sort((a,b)=>b.time-a.time);
    }
    this.historyPoint=point;this.recordingHistory=true;
  }
  endHistory() { this.recordingHistory=false; this.historyPoint=null; }
  withoutHistory<T>(operation:()=>T):T {
    const previous=this.recordingHistory;this.recordingHistory=false;
    try{return operation();}finally{this.recordingHistory=previous;}
  }
  recordHistoryFlow(item:number,amount:number,production=false) {
    if(!Number.isFinite(amount)||amount<=0)return;
    const point=this.historyPoint??this.historicalData[0];if(!point)return;
    const rows=point[production?"production":"consumption"],entry=rows.find(e=>e.item===item);
    if(entry)entry.amount+=amount;else rows.push({item,amount});
  }
  private recordCargoChange(item:number,amount:number,production:boolean) {
    if(this.recordingHistory)this.recordHistoryFlow(item,amount,production);
  }

  liquidContainerAssignments: ContainerAssignments = {};
  syncLiquidContainers(distribute = true, target?: number) {
    const ds=(globalThis as any).__c2?.ds;
    const result=liquidStorage(ds,this.cargo,this.transports,target,this.liquidContainerAssignments,distribute);
    this.liquidContainerAssignments=result.assignments;
    this.liquidsContainers=result.buckets;
    for(const [id] of this.cargo){const it=ds?.items?.Items?.[id];if(it?.category===1&&ds.items.Goods[it.subCategory]?.liquidsContainer)this.inUse[id]=0;}
    for(const [key,entries] of Object.entries(result.assignments))if(Number(key)>0)for(const e of entries)this.inUse[e.type]=(this.inUse[e.type]??0)+e.amount;
    return result;
  }
  assignedLiquidCapacity(id: number) { return assignedCapacity((globalThis as any).__c2?.ds,this.liquidContainerAssignments,this.transports,id); }
  liquidsContainers: Record<number, Array<{ type: number; amount: number }>> = {};

  isLiquidItem(id: number): boolean {
    const ds = (globalThis as any).__c2?.ds;
    const it = ds?.items?.Items?.[id];
    if (!it || it.category !== 1) return false;
    const g = ds.items.Goods[it.subCategory];
    return !!(g && g.liquid);
  }

  // 原版 addLiquidsContainer(type, amount, container)：container 缺省 → -1 散装
  addLiquidsContainer(type: number, amount: number, container: number | null = null): number {
    if (amount <= 0) return -1;
    const key = container === null || container === undefined ? -1 : Number(container);
    const bucket = this.liquidsContainers[key] ?? (this.liquidsContainers[key] = []);
    const e = bucket.find((x) => x.type === type);
    if (e) e.amount += amount; else bucket.push({ type, amount });
    return key;
  }

  // 原版 reduceLiquidsContainers(type, amount)：按 [-1 散装, 0 默认, 具体容器] 优先级扣减，返回未扣完的余量
  reduceLiquidsContainers(type: number, amount: number): number {
    let remaining = amount;
    const keys = Object.keys(this.liquidsContainers).map(Number).sort((a, b) => a - b);
    for (const key of keys) {
      const bucket = this.liquidsContainers[key];
      if (!Array.isArray(bucket)) continue;
      const e = bucket.find((x) => x.type === type);
      if (!e || e.amount <= 0) continue;
      const take = Math.min(e.amount, remaining);
      e.amount -= take;
      remaining -= take;
      if (remaining <= 0) break;
    }
    for (const k of Object.keys(this.liquidsContainers)) {
      const nk = Number(k);
      const b = (this.liquidsContainers[nk] ?? []).filter((x) => x.amount > 0);
      if (b.length) this.liquidsContainers[nk] = b; else delete this.liquidsContainers[nk];
    }
    return remaining;
  }

  // 统一取液体：分组优先扣减，cargo 总量同步扣（保持 真值=总量 不变式）
  takeLiquid(type: number, amount: number): number {
    const available = this.cargoAmount(type);
    const take = Math.min(amount, available);
    if (take <= 0) return 0;
    this.reduceLiquidsContainers(type, take);
    this.removeCargo(type, take);
    return take;
  }

  // 统一加液体：cargo 总量 + 分组（container 缺省 → 散装 -1）
  // 原版 Caravan.addCargo(param4=false)：液体进货被 maxLiquidAmount 钳制（trade/拾取都不可超容器容量）
  // → 无容器时最多装 0，杜绝交易 takeAll/计算器"无限买液体"
  addLiquid(type: number, amount: number, container: number | null = null): number {
    if (amount <= 0) return 0;
    const can = this.maxLiquidAmount(type);
    const put = Math.min(amount, can);
    if (put <= 0) return 0;
    this.addCargo(type, put);
    this.addLiquidsContainer(type, put, container);
    return put;
  }

  // 从 cargo 重建分组（导入/旧档兜底：容器优先分配，余量进散装）
  rebuildLiquidsContainers() {
    this.liquidsContainers = this.syncLiquidContainers().buckets;
  }

  // 设备在用量（原版 Item.inUse；未记录 = 全部在用）
  inUse: Record<number, number> = {};
  // 买入加权均价（原版 Cargo[].averagePrice；6806 "Price you paid" 用）
  averagePrice: Record<number, number> = {};
  // 原版 Caravan.smugglingSkill：按成员走私技能加权（黑市/走私检测）
  smugglingSkill(): number {
    const skills = this.People
      .filter((p) => p.category === 1 || p.category === 2 || p.category === 5)
      .map((p) => (typeof (p as any).smugglingSkill === "number" ? (p as any).smugglingSkill : (p as any).agility * 4 + (p as any).accuracy * 2 + (p as any).intelligence * 3 + Math.sqrt((p as any).smugglingExperience ?? 0)))
      .sort((a, b) => b - a);
    let s = 0;
    for (let i = 0; i < skills.length; i++) s += skills[i] / (i + 1);
    return s;
  }
  inUseOf(itemId: number): number {
    const v = this.inUse[itemId];
    return v !== undefined ? v : this.cargoAmount(itemId);
  }
  // 配给（原版 groupSettings：6 组——1 志愿 2 佣兵 3 囚犯 4 奴隶 5 临时 6 护送；foodRations/waterRations 0-200%，食物偏好比例，药品剂量，sameAsAnother 复制）
  groupSettings: any = null; // 兼容字段（指向组 1；旧存档单组）
  groupSettingsAll: Array<any> | null = null; // 6 组（1-based）
  private get groups(): Array<any> { return this.groupSettingsAll ?? []; }

  initGroupSettings(ds: any) {
    // 原版 Caravan.as L250-306 默认：组1 独立（anotherGroup=2）；组2/3/5/6 → 组1；组4 → 组3
    const mkGroup = (sameAsAnother: number, anotherGroup: number) => ({
      foodRations: 100, waterRations: 100, medicineUse: [0, 0, 1, 2, 3], foodstuffs: {}, sameAsAnother, anotherGroup,
    });
    const groups: Array<any> = [null];
    const defs: Array<[number, number]> = [[0, 2], [1, 1], [1, 1], [1, 3], [1, 1], [1, 1]];
    for (let g = 1; g <= 6; g++) {
      const gs: any = mkGroup(defs[g - 1][0], defs[g - 1][1]);
      // 用 subCategory 索引（Goods 数组索引）：全部食物默认比例 10（原版）
      for (let i = 0; i < (ds?.items?.Goods ?? []).length; i++) {
        const gd = ds.items.Goods[i];
        if (gd && gd.food) gs.foodstuffs[i] = 10;
      }
      groups[g] = gs;
    }
    this.groupSettingsAll = groups;
    this.groupSettings = groups[1]; // 兼容字段指向组 1
  }

  // 某人的配给组（原版 getSettingsGroup：按 category 取组 1..6，再沿 sameAsAnother/anotherGroup 链跟随源组）
  getSettingsGroup(cat: number): any {
    if (!this.groupSettingsAll) this.initGroupSettings((globalThis as any).__c2?.ds);
    const all = this.groupSettingsAll as any[];
    // category → 组：cat 1-4 → 1-4；cat 5（临时）→ 5；cat 6-10（护送等）→ 6
    const g = cat <= 4 ? cat : cat === 5 ? 5 : 6;
    let gi = g;
    for (let guard = 0; guard < 10; guard++) {
      const gs = all[gi];
      if (!gs) break;
      if (gs.sameAsAnother > 0 && gs.anotherGroup >= 1 && gs.anotherGroup <= 6 && gs.anotherGroup !== gi) {
        gi = gs.anotherGroup;
      } else break;
    }
    return all[gi] ?? all[1];
  }

  // 原版 getPeopleByGroup(g)：按 category（数字或数组）取人
  getPeopleByGroup(g: number | number[]): Character[] {
    const want = Array.isArray(g) ? g : [g];
    return this.People.filter((p) => want.includes(p.category ?? 0));
  }

  // 原版 totalFoodConsumption(catFilter)：Σ GDA × 组配给比例（人按 category 过滤）
  totalFoodConsumptionFiltered(catFilter: number | number[] | null = null): number {
    let total = 0;
    for (const p of this.People) {
      if (!this.matchCat(catFilter, p.category ?? 0)) continue;
      const gs = this.getSettingsGroup(p.category ?? 1);
      total += p.GDA * (gs.foodRations ?? 100) / 100;
    }
    return total;
  }
  // 原版 totalWaterConsumption(catFilter)：Σ waterConsumption × 组配给比例
  totalWaterConsumptionFiltered(catFilter: number | number[] | null = null): number {
    let total = 0;
    for (const p of this.People) {
      if (!this.matchCat(catFilter, p.category ?? 0)) continue;
      const gs = this.getSettingsGroup(p.category ?? 1);
      total += p.waterConsumption * (gs.waterRations ?? 100) / 100;
    }
    return total;
  }
  private matchCat(filter: number | number[] | null, cat: number): boolean {
    if (filter === null) return true;
    return Array.isArray(filter) ? filter.includes(cat) : filter === cat;
  }

  // 原版 Caravan.getConsumedFoodstuffs：先按偏好分配；短缺热量在其余食物间均分。
  // 只计算库存中可交付的日粮，不消耗货物；释放成员与目录预览共用。
  getConsumedFoodstuffs(person: Character | number | null = null, days = 1): Array<{ item: number; itemType: number; amount: number }> {
    const ds = (globalThis as any).__c2?.ds;
    const pool = new Map<number, { item: number; itemType: number; amount: number; calories: number; need: number; take: number; divisible: boolean }>();
    const people = person instanceof Character ? [person] : this.People.filter(p => person == null || p.category === person);
    for (const p of people) {
      const gs = this.getSettingsGroup(p.category);
      const foods: Array<{ id: number; sub: number; available: number; cal: number; rel: number; divisible: boolean }> = [];
      for (const id of this.cargo.keys()) {
        const available = this.availableCargo(id);
        const it = ds?.items.Items[id], data = it?.category === 1 ? ds.items.Goods[it.subCategory] : null;
        const rel = Number(gs.foodstuffs?.[it?.subCategory] ?? 0);
        if (available > 0 && data && (data.food || id === 174 && this.cannibal) && data.calories > 0 && rel > 0) foods.push({id, sub:it.subCategory, available, cal:data.calories, rel, divisible:!!data.divisible});
      }
      const parts = foods.reduce((sum, f) => sum + f.rel, 0);
      for (const f of foods) {
        const row = pool.get(f.id) ?? {item:f.sub, itemType:f.id, amount:f.available, calories:f.cal, need:0, take:0, divisible:f.divisible};
        row.need += Math.max(0, p.GDA * (gs.foodRations ?? 100) / 100 * days) * f.rel / parts;
        pool.set(f.id, row);
      }
    }
    const rows = [...pool.values()];
    let missing = 0;
    for (const row of rows) { row.take = Math.min(row.amount, row.need / row.calories); missing += row.need - row.take * row.calories; }
    while (missing > 1e-6) {
      const spare = rows.filter(row => row.amount - row.take > 1e-9);
      if (!spare.length) break;
      const share = Math.min(missing / spare.length, ...spare.map(row => (row.amount - row.take) * row.calories));
      if (share <= 0) break;
      for (const row of spare) row.take += share / row.calories;
      missing -= share * spare.length;
    }
    return rows.map(row => ({item:row.item, itemType:row.itemType, amount:Math.min(row.amount, row.divisible ? row.take : Math.round(row.take))}));
  }

  // 原版用品页 consumed 列显示全队实际可消费日粮（不含缺货项）。
  foodConsumptionBreakdown(): { items: Map<number, number>; totalKcalPerDay: number; totalWaterPerDay: number } {
    const ds = (globalThis as any).__c2?.ds;
    const items = new Map<number, number>();
    let totalKcalPerDay = 0, totalWaterPerDay = 0;
    for (const e of this.getConsumedFoodstuffs()) {
      const data = ds?.items.Goods[e.item];
      items.set(e.item, e.amount);
      totalKcalPerDay += e.amount * (data?.calories ?? 0);
      totalWaterPerDay += e.amount * (data?.waterPercentage ?? 0) * (data?.weight ?? 1);
    }
    return {items, totalKcalPerDay, totalWaterPerDay};
  }

  // 构造一只新运输单位（⑦a：委托模块级工厂 makeTransportUnit，EquipRandomCaravan 与其共用）
  newTransport(type: number, ds: any): any {
    return makeTransportUnit(type, ds, this.transports.length);
  }

  // 老存档字段补齐（原版 variablesToSave 之外的新字段给默认值）
  fixTransport(tr: any): any {
    if (tr.gender === undefined) {
      const ds = (globalThis as any).__c2?.ds;
      const t = ds?.transports?.Types?.[tr.type] ?? {};
      tr.gender = Math.random() < 0.5 ? 1 : 2;
      tr.maxAge = (t.lifespan ?? 360) * 30 * (0.8 + Math.random() * 0.4);
      tr.age = Math.round(tr.maxAge * Math.random());
      let ideal = (t.weight ?? 100) * (0.8 + Math.random() * 0.4);
      if (tr.gender === 1) ideal *= 1.05; else ideal *= 0.95;
      tr._idealWeight = ideal;
      tr.maxHealth = Math.round((t.maxHealth ?? 1000) * (ideal / (t.weight ?? 100)));
      tr.weight = ideal;
      tr.hunger = 0; tr.thirst = 0;
      tr.pregnant = false; tr.remainingPregnancy = 0; tr.pregnantWith = 0;
      tr.remainingLactation = 0; tr.mother = null; tr.cycleCounter = 0;
    }
    if (tr.lubricantLevel === undefined) tr.lubricantLevel = 0;
    if (tr.waterLevel === undefined) tr.waterLevel = 0;
    if (tr.health === undefined) tr.health = tr.maxHealth ?? 1000;
    // 旧版曾自动生成 "类型名 #数字" 编号（原版 TransportUnit 不生成 givenName）——迁移时清理；
    // 命名只来自玩家重命名；未命名显示一律回退本地化类型名。
    if (typeof tr.givenName === "string") {
      const t = (globalThis as any).__c2?.ds?.transports?.Types?.[tr.type] ?? {};
      const nm = getText((globalThis as any).__c2?.ds, t.name ?? 890, (globalThis as any).__c2?.ds?.language);
      const m = /^(.*) #([0-9]+)$/.exec(tr.givenName);
      if (nm && m && m[1] === nm) delete tr.givenName;
    }
    if (!Array.isArray(tr.Passengers)) tr.Passengers = [];
    if (tr.passengerIn === undefined) tr.passengerIn = null;
    if (tr.cart === undefined) tr.cart = null;
    if (tr.attachedTo === undefined) tr.attachedTo = null;
    // 属性 getter 兜底（旧档/外部构造的运输单位可能缺 getter；世界类与 TradeWindow 共用）
    if (!Object.getOwnPropertyDescriptor(tr, "agePeriod")?.get) {
      const T = (globalThis as any).__c2?.ds?.transports?.Types ?? [];
      const tt = T[tr.type] ?? {};
      const maxAge = tr.maxAge || (tt.lifespan ?? 360) * 30;
      const idealW = tr._idealWeight || tr.weight || tt.weight || 100;
      const juvenile = tt.category === 1 && (tr.age ?? Infinity) < (tt.maturity ?? 0);
      const baseMH = tr._maxHealth ?? ((tr.maxHealth ?? tt.maxHealth ?? 1000) / (juvenile ? Math.max(tr.age / tt.maturity, .1) : 1));
      tr._maxHealth = baseMH;
      const ageP = () => {
        if (tt.category !== 1) return 4;
        if (tr.age < (tt.lactation ?? 0)) return 1;
        if (tr.age < (tt.maturity ?? 720)) return 2;
        if (tr.age < maxAge * 0.8) return 3;
        return 4;
      };
      const idealWg = () => (ageP() < 3 ? Math.max(Math.round(idealW / 10), Math.round(idealW * (tr.age ?? 0) / (tt.maturity ?? 720))) : idealW);
      const mhG = () => (ageP() < 3 ? baseMH * Math.max((tr.age ?? 0) / (tt.maturity ?? 720), 0.1) : baseMH);
      const capG = () => {
        if ((tt.category ?? 1) === 1) {
          if (ageP() === 1) return 0;
          let v = (tt.capacity ?? 0) * mhG() / Math.max(tt.maxHealth ?? 1000, 1);
          v *= (tr.weight ?? idealW) / Math.max(idealWg(), 1);
          if (ageP() > 3) v *= 1 - (tr.age - maxAge * 0.8) / (maxAge * 0.2);
          return v;
        }
        let v = tt.capacity ?? 0;
        if ((tt.category === 2 || tt.category === 3) && tr.health !== undefined) {
          const hp = tr.health / Math.max(mhG(), 1);
          if (hp < 0.3) v *= hp * 3;
        }
        return v;
      };
      const prodG = () => {
        const arr: Array<{ item: number; amount: number }> = [];
        for (const p of (tt.produces ?? [])) arr.push({ item: p.item, amount: p.amount });
        if (tr.gender === 2 && tt.milk && ageP() > 2) {
          let m = 1;
          if (tr.remainingLactation > 0) m = 2;
          if (tr.pregnant) m *= 1 + 0.3 * (1 - (tr.remainingPregnancy ?? 0) / Math.max(tt.gestation ?? 360, 1));
          m *= (tr.weight ?? idealW) / Math.max(tt.weight ?? 100, 1);
          if (tr.age > maxAge * 0.7) m *= Math.max(1 - ((tr.age - maxAge * 0.7) / maxAge) * 5, 0);
          if (tr.hunger > 0) m *= 1 - Math.min(tr.hunger / 50, 1);
          if (tr.thirst > 0) m *= 1 - Math.min(tr.thirst / 30, 1);
          if (m > 0.01) arr.push({ item: tt.milk.item, amount: (tt.milk.amount ?? 0) * m });
        }
        return arr;
      };
      Object.defineProperties(tr, {
        agePeriod: { get: ageP, configurable: true },
        idealWeight: { get: idealWg, configurable: true },
        maxHealth: { get: mhG, configurable: true },
        capacity: { get: capG, configurable: true },
        maxPassengers: { get: () => tt.passengers ?? 0, configurable: true },
        speed: { get: () => tt.speed ?? 0, configurable: true },
        windPowered: { get: () => !!tt.windPowered, configurable: true },
        category: { get: () => tt.category ?? 1, configurable: true },
        milkConsumption: { get: () => (ageP() > 1 ? 0 : (tt.milkConsumption ?? 0) * idealWg() / Math.max(tt.weight ?? 100, 1)), configurable: true },
        forageConsumption: { get: () => (ageP() === 1 ? 0 : (tt.forageConsumption ?? 0) * idealWg() / Math.max(tt.weight ?? 100, 1)), configurable: true },
        waterConsumption: { get: () => (ageP() === 1 ? 0 : (tt.waterConsumption ?? 0) * idealWg() / Math.max(tt.weight ?? 100, 1)), configurable: true },
        production: { get: prodG, configurable: true },
        multiplication: { get: () => tt.multiplication ?? 1, configurable: true },
        fuelConsumption: { get: () => tt.fuelConsumption ?? 0, configurable: true },
        fuelTank: { get: () => tt.fuelTank ?? 0, configurable: true },
      });
    }
    return tr;
  }

  addTransport(tr: any) {
    this.transports.push(tr);
    this.updateSpeed();
  }

  buyTransport(type: number, ds: any) {
    const t = ds.transports?.Types?.[type];
    if (!t) return false;
    this.transports.push(this.newTransport(type, ds));
    this.updateSpeed();
    return true;
  }

  // ---------- 乘客/车架管理（原版 TransportUnit：Passengers/passengerIn/cart/attachedTo） ----------
  transportType(tr: any): any {
    const ttypes = (globalThis as any).__c2?.ds?.transports?.Types ?? [];
    return ttypes[tr.type] ?? {};
  }
  // TransportUnit.as:1162–1267: 拖车替换座位上限；空间与重量分别校验。
  seatCapacity(tr: any): number { return Number((tr?.cart ?? tr)?.maxPassengers ?? this.transportType(tr?.cart ?? tr).passengers ?? 0); }
  transportCapacity(tr: any): number { return Number(tr?.capacity ?? this.transportType(tr).capacity ?? 0); }
  capacityWithCart(tr: any, cart = tr?.cart): number {
    if (this.transportType(tr).category === 2) return 0;
    return cart ? Math.min(this.transportCapacity(tr) * this.cartMultiplication(cart) - (cart.weight ?? 0), this.transportCapacity(cart)) : this.transportCapacity(tr);
  }
  cartMultiplication(tr: any): number {
    const ratio = (tr.health ?? 0) / Math.max(tr.maxHealth ?? 1, 1);
    return (this.transportType(tr).multiplication ?? 1) * (ratio < .2 ? ratio + .8 : 1);
  }
  passengerSpaces(p: any): number {
    if (this.People.includes(p) || p instanceof Character) return 1;
    const t = this.transportType(p);
    return t.category === 1 ? Math.max(Math.round((t.passengerSpaces ?? 1) * (p.weight ?? t.weight) / Math.max(t.weight, 1)), 1) : (t.passengerSpaces ?? 1);
  }
  passengersOf(tr: any): any[] { return Array.isArray(tr?.Passengers) ? tr.Passengers : []; }
  occupiedSpaces(tr: any): number { return this.passengersOf(tr).reduce((n,p) => n + this.passengerSpaces(p), 0); }
  passengersWeight(tr: any): number { return this.passengersOf(tr).reduce((n,p) => n + (p.weight ?? 0), 0); }
  canSeat(passenger: any, transport: any): string {
    if (!transport || !passenger || passenger === transport) return this.textOf(1189);
    if (transport.passengerIn || this.transportType(transport).category === 2 || passenger.cart || passenger.attachedTo || passenger.passengerIn) return this.textOf(1189);
    if (this.passengerSpaces(passenger) > this.seatCapacity(transport) - this.occupiedSpaces(transport)) return this.textOf(1188);
    if ((passenger.weight ?? 0) > this.capacityWithCart(transport) - this.passengersWeight(transport)) return this.textOf(1020);
    return "";
  }
  private textOf(id: number): string {
    const ds = (globalThis as any).__c2?.ds;
    return ds ? getText(ds, id, ds.language) : String(id);
  }
  seatPassenger(passenger: any, transport: any, skipUpdate = false): boolean {
    if (this.canSeat(passenger, transport) !== "") return false;
    for (const p of [...this.passengersOf(passenger)]) this.unseatPassenger(p);
    passenger.passengerIn = transport;
    (transport.Passengers ??= []).push(passenger);
    if (!skipUpdate) this.updateSpeed();
    return true;
  }
  unseatPassenger(passenger: any) {
    const t = passenger?.passengerIn;
    const i = this.passengersOf(t).indexOf(passenger);
    if (i >= 0) t.Passengers.splice(i, 1);
    if (passenger) passenger.passengerIn = null;
  }
  normalizePassengers(tr: any) {
    while (this.passengersOf(tr).length && (this.passengersWeight(tr) > this.capacityWithCart(tr) || this.occupiedSpaces(tr) > this.seatCapacity(tr))) {
      this.unseatPassenger(this.passengersOf(tr).at(-1));
    }
  }
  canAttachCart(animal: any, cart: any): boolean {
    return !!animal && !!cart && animal !== cart && !!this.transportType(animal).canDragCarts && !animal.passengerIn && !animal.attachedTo && this.transportType(cart).category === 2 && !cart.attachedTo && !cart.passengerIn && this.capacityWithCart(animal, cart) > 0;
  }
  attachCart(animal: any, cart: any): boolean {
    if (!this.canAttachCart(animal, cart)) return false;
    if (animal.cart) animal.cart.attachedTo = null;
    animal.cart = cart; cart.attachedTo = animal;
    this.normalizePassengers(animal);
    this.updateSpeed();
    return true;
  }
  detachCart(animal: any) {
    if (!animal) return;
    if (animal.cart) animal.cart.attachedTo = null;
    animal.cart = null;
    this.normalizePassengers(animal);
    this.updateSpeed();
  }
  fillLubricant(tr: any) { this.fillTransportLiquid(tr, 79, "lubricantLevel", "maxLubricant"); }
  fillWater(tr: any) { this.fillTransportLiquid(tr, 1, "waterLevel", "maxWater"); }
  private fillTransportLiquid(tr: any, item: number, field: string, max: string) {
    if (!tr) return;
    const amount = Math.max(0, Math.min((this.transportType(tr)[max] ?? 0) - (tr[field] ?? 0), this.cargoAmount(item)));
    tr[field] = (tr[field] ?? 0) + this.takeLiquid(item, amount);
  }
  removeTransport(tr: any) {
    if (!tr) return;
    this.unseatPassenger(tr);
    for (const p of [...this.passengersOf(tr)]) this.unseatPassenger(p);
    if (tr.cart) this.detachCart(tr);
    if (tr.attachedTo?.cart === tr) this.detachCart(tr.attachedTo);
    tr.attachedTo = null;
    const i = this.transports.indexOf(tr);
    if (i >= 0) this.transports.splice(i, 1);
    this.updateSpeed();
  }
  // 存档索引桩（防循环引用）：unit → {k:'p'|'t', i:索引}
  seatRefOf(unit: any): { k: string; i: number } | null {
    if (!unit) return null;
    const pi = this.People.indexOf(unit);
    if (pi >= 0) return { k: "p", i: pi };
    const ti = this.transports.indexOf(unit);
    if (ti >= 0) return { k: "t", i: ti };
    return null;
  }

  // 速度由原版 speed getter 动态计算（最慢成员 + 帆动力公式）；保留方法供调用点兼容
  updateSpeed() {}

  // 角度差（归一化到 [0, π]）
  private static angleDiff(a: number, b: number): number {
    let d = (a - b) % (Math.PI * 2);
    if (d < 0) d += Math.PI * 2;
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d;
  }

  // 原版 Caravan.speed（km/h）：
  // 无帆 = 最慢的非乘客成员（人 3+agility/2，受伤减速；运输 Types.speed）＋玩家超载减速；
  // 有帆 = min(无帆速度, 风公式×minWindPoweredSpeed)；全帆 = 风公式×minWindPoweredSpeed
  get speedKmh(): number {
    const ds = (globalThis as any).__c2?.ds;
    const T = ds?.transports?.Types ?? [];
    const walkers = this.People.filter(p => !p.passengerIn);
    const activeTransport = this.transports.filter(tr => !tr.passengerIn);
    let s = Math.min(Infinity,...walkers.map(p => p.speed),...activeTransport.filter(tr => !T[tr.type]?.windPowered).map(tr => T[tr.type]?.speed == null ? Infinity : (tr.speed ?? T[tr.type].speed)));
    if (s === Infinity) s = 0;
    // 玩家车队超载减速（原版 category==0：>100% 线性减速，>120% 停车）
    if (this.category === 0) {
      const passengers = activeTransport.reduce((n,tr) => n+this.passengersWeight(tr),0);
      const ratio = (this.totalCargo+passengers) / Math.max(this.maxCargo+passengers, .001);
      if (ratio > 1.2) { s = 0; this.moving = false; }
      else if (ratio > 1) s *= 1 - (ratio - 1) / 0.2;
    }
    // 帆动力（windPowered 运输，如 Wind Cart）
    const windUnits = activeTransport.filter((tr) => T[tr.type]?.windPowered);
    if (windUnits.length > 0) {
      const gd = (globalThis as any).__c2?.shell?.gd;
      const windDir = gd ? gd.windDir : 0;
      const windStr = gd ? gd.windSpeed : 20;
      const a1 = Caravan.angleDiff(this.direction, windDir);
      let w = windStr * (4 - Math.abs(1.5 - a1)) / 3;
      w *= 0.7 + Math.abs(a1 - 1.507) * 0.3;
      if (a1 > 2.3) w = 0;
      else if (a1 > 2) w *= 1 / ((a1 - 1.8) * 5);
      if (a1 > 1.5) w *= 1 / ((a1 + 0.5) / 2);
      let minWind = Infinity;
      for (const tr of windUnits) if ((T[tr.type].speed ?? 0) < minWind) minWind = T[tr.type].speed;
      if (minWind === Infinity) minWind = 0;
      const windSpeed = w * minWind;
      if (!walkers.length && windUnits.length === activeTransport.length) s = windSpeed; // 全帆
      else s = Math.min(s, windSpeed);
    }
    return s;
  }

  // 设备工作数（原版 devicesWorking：overload 或缺原料 → 0，否则 inUse=数量）
  devicesWorking(itemId: number): number {
    const ds = (globalThis as any).__c2?.ds;
    const it = ds?.items?.Items?.[itemId];
    const g = it?.category === 1 ? ds.items.Goods[it.subCategory] : null;
    if (!g || (g.electricityConsumption > 0 && this.electricOverload)) return 0;
    for (const cns of g.consumption ?? []) {
      if (this.cargoAmount(cns.item) <= 0) return 0;
    }
    return this.inUseOf(itemId);
  }

  // 载客容量：Σ Types[].passengers（原版 maxPassengers 语义）
  passengerCapacity(): number {
    const ds = (globalThis as any).__c2?.ds;
    let cap = 0;
    if (ds?.transports) for (const tr of this.transports) cap += (ds.transports.Types[tr.type]?.passengers ?? 0);
    return cap;
  }

  // 兽医/医生技能：People 中（category 1/2/5）对应技能降序加权平均（原版 commonRecoverSkillEquation 简化）
  veterinarySkill(): number {
    const skills = this.People
      .filter((p) => p.category === 1 || p.category === 2 || p.category === 5)
      .map((p) => (p.intelligence ?? 10) * 6 + Math.sqrt((p as any).veterinaryExperience ?? 0) * 2)
      .sort((a, b) => b - a);
    let s = 0;
    for (let i = 0; i < skills.length; i++) s += skills[i] / (i + 1);
    return s;
  }
  doctorSkill(): number {
    const skills = this.People
      .filter((p) => p.category === 1 || p.category === 2 || p.category === 5)
      .map((p) => p.doctorSkill())
      .sort((a, b) => b - a);
    let s = 0;
    for (let i = 0; i < skills.length; i++) s += skills[i] / (i + 1);
    return s;
  }
  huntingSkill(): number {
    const skills = this.People
      .filter((p) => p.category === 1 || p.category === 2 || p.category === 5)
      .map((p) => p.huntingSkill())
      .sort((a, b) => b - a);
    let s = 0;
    for (let i = 0; i < skills.length; i++) s += skills[i] / (i + 1);
    return s;
  }
  collectingSkill(): number {
    const skills = this.People
      .filter((p) => p.category === 1 || p.category === 2 || p.category === 5)
      .map((p) => p.collectingSkill())
      .sort((a, b) => b - a);
    let s = 0;
    for (let i = 0; i < skills.length; i++) s += skills[i] / (i + 1);
    return s;
  }
  mechanicSkill(): number {
    const skills = this.People
      .filter((p) => p.category === 1 || p.category === 2 || p.category === 5)
      .map((p) => p.mechanicSkill())
      .sort((a, b) => b - a);
    let s = 0;
    for (let i = 0; i < skills.length; i++) s += skills[i] / (i + 1);
    return s;
  }
  // 可用货物量 = 总量 − 在用量（原版 Cargo[k].amount - Cargo[k].inUse；工作房原料按此判定）
  availableCargo(item: number): number {
    return Math.max(0, this.cargoAmount(item) - (this.inUse[item] ?? 0));
  }

  /** Item.amount is rounded before subtracting assigned equipment; raw cargo stays precise. */
  tradableCargo(item: number): number {
    const ds = (globalThis as any).__c2?.ds;
    const it = ds?.items?.Items?.[item];
    const weaponCategory = it?.category === 2
      ? ds.weapons?.WeaponTypes?.[ds.weapons.Weapons?.[it.subCategory]?.type]?.category : undefined;
    const equipment = this.People.reduce((sum, p) => {
      const carried = p.equipment.reduce((n, e) => n + (e.type === item ? e.amount : 0), 0);
      // Older imported saves can have weapon slots but incomplete equipment/inUse.
      // Slots and equipment describe the same objects, so never add them together.
      const slotted = it?.category === 2 ? p.weapons.reduce((n, sub, slot) =>
        n + (sub !== 0 && sub === it.subCategory ? (weaponCategory === 5 ? p.grenadeAmounts[slot] : 1) : 0), 0) : 0;
      return sum + Math.max(carried, slotted);
    }, 0);
    const divisible = it?.category === 1 && !!ds.items.Goods[it.subCategory]?.divisible;
    const total = divisible ? itemAmount(this.cargoAmount(item), true) : this.cargoAmount(item);
    const free = Math.max(0, total - Math.max(this.inUse[item] ?? 0, equipment));
    return divisible ? Math.round(free * 10) / 10 : Math.floor(free + 1e-9);
  }
  // 工作房技能查询（原版 GD.Caravans[0][skill + "Skill"]）
  workshopSkill(skill: string): number {
    switch (skill) {
      case "doctor": return this.doctorSkill();
      case "veterinary": return this.veterinarySkill();
      case "mechanic": return this.mechanicSkill();
      case "hunting": return this.huntingSkill();
      case "collecting": return this.collectingSkill();
      case "smuggling": return this.smugglingSkill();
      default: return 0;
    }
  }

  // 经验分配（原版 distributeExperience：技能高者优先，按排名 1/(i+1)×learningCapacity）
  distributeExperience(skillGetter: string, expField: string, amount: number) {
    const list = this.People
      .filter((p) => p.category !== 4)
      .map((p) => ({ person: p, skill: (p as any)[skillGetter]?.() ?? 0 }))
      .sort((a, b) => b.skill - a.skill);
    for (let i = 0; i < list.length; i++) {
      const p = list[i].person as any;
      const lc = (typeof p.learningCapacity === "function" ? p.learningCapacity() : p.learningCapacity) ?? 100;
      const mult = p.category === 3 ? 0.2 : 1;
      p[expField] = (p[expField] ?? 0) + amount / (i + 1) * lc * mult;
    }
  }

  addPerson(p: Character | Record<string, any>): number {
    const ch = p instanceof Character ? p : new Character(p);
    this.People.push(ch);
    return this.People.length - 1; // 原版返回索引
  }
  removePerson(person: number | Character) {
    const i = typeof person === "number" ? person : this.People.indexOf(person);
    if (i >= 0 && i < this.People.length) {
      const p = this.People[i];
      this.removeEquipment(p);
      if ((p as any).passengerIn) this.unseatPassenger(p); // 入座状态随人移出解除
      this.People.splice(i, 1);
    }
  }

  // 自动装备：把货物里的武器/护甲分发给没装备的人（原版语义：weapons[0]=Weapons.subCategory、Jacket=Armor subCategory）
  distributeWeapons() {
    const ds=(globalThis as any).__c2?.ds;if(!ds)return;
    const items=ds.items.Items,W=ds.weapons.Weapons,WT=ds.weapons.WeaponTypes,A=ds.weapons.Ammo,AT=ds.weapons.Attachments;
    const people=this.People.filter(p=>p.category<3);
    const release=(p:Character,id:number,n:number)=>{this.inUse[id]=Math.max(0,(this.inUse[id]??0)-n);p.reduceItemFromEquipment(id,n,false,false);};
    for(const p of people){
      for(let slot=0;slot<2;slot++){const id=Character.weaponItemId(p,slot);if(id)release(p,id,WT[W[p.weapons[slot]]?.type]?.category===5?p.grenadeAmounts[slot]:1);}
      p.weapons=[0,0];p.grenadeAmounts=[0,0];p.attachments=[[],[]];
      for(const e of [...p.equipment])if(items[e.type]?.category===4)release(p,e.type,e.amount);
    }
    const candidates:Array<{id:number;sub:number;wd:any;wt:any;price:number;minWeight:number;pretenders:Array<{p:Character;score:number}>}>=[];
    const reserved=new Map<Character,number>();
    for(const [id,amount] of this.cargo){const it=items[id];if(it?.category!==2)continue;
      const wd=W[it.subCategory],wt=WT[wd?.type];if(!wd||!wt)continue;
      let count=Math.max(0,Math.floor(amount-(this.inUse[id]??0))),minimum=0,ammoWeight=0,coefficient=2;
      if(wt.category>=2&&wt.category<=5){
        minimum=wt.category===4?30:wt.category===3?(wt.subCategory===1?5:3):wt.category===2?(wt.subCategory===1?5:wt.subCategory===2?(wd.type===15?5:3):wt.subCategory===3?30:wt.subCategory===4?10:3):3;
        let rounds=0,weight=0;
        if(wt.category===5){rounds=count;weight=count*(wd.weight??0);}
        else for(const [aid,qty] of this.cargo){const ai=items[aid],ad=A[ai?.subCategory];if(ai?.category!==3||ad?.type!==wd.ammo)continue;
          const held=this.People.filter(p=>p.category>2).reduce((n,p)=>n+p.equipment.filter(e=>e.type===aid).reduce((n,e)=>n+e.amount,0),0);
          const available=Math.max(0,qty-held);rounds+=available;weight+=available*itemWeightKg(ds,aid);
        }
        if(wd.ammo===17){count=this.money>0?count:0;coefficient=2;}
        else {
          ammoWeight=rounds>0?weight/rounds:0;
          count=Math.min(count,Math.floor(rounds/minimum));
          if(!count&&rounds>=minimum/3&&amount>(this.inUse[id]??0))count=1;
          coefficient=count?Math.min(rounds/count/minimum,2):0;
          if(count===1&&rounds<minimum)minimum=rounds;
          if(wt.category===5)coefficient*=7;
        }
      }
      const minWeight=(wd.weight??0)+ammoWeight*minimum;
      for(let n=0;n<count;n++)candidates.push({id,sub:it.subCategory,wd,wt,price:(wd.price??0)*coefficient,minWeight,
        pretenders:people.filter(p=>(p.category===1||p.category===2)&&p.availableCapacity>=minWeight).map(p=>{
          const skill=wt.category===1?p.meleeDamage(it.subCategory)*p.meleeHitChance(it.subCategory):(p as any)[Character.detectWeaponSkill(ds,it.subCategory)+'Skill']??0;
          return {p,score:skill*p.maxAP+p.maxHP};
        })});
    }
    candidates.sort((a,b)=>b.price-a.price);
    const equip=(c:typeof candidates[number],p:Character,slot:number)=>{p.addItemToEquipment({type:c.id,amount:1},false);p.weapons[slot]=c.sub;
      p.grenadeAmounts[slot]=c.wt.category===5?1:0;this.inUse[c.id]=(this.inUse[c.id]??0)+1;};
    const remaining:typeof candidates=[];
    for(const c of candidates){const best=c.pretenders.filter(v=>!v.p.weapons[0]&&v.p.availableCapacity>=c.minWeight).sort((a,b)=>b.score-a.score)[0];
      if(best){equip(c,best.p,0);reserved.set(best.p,c.minWeight-(c.wd.weight??0));}else remaining.push(c);
    }
    const kind=(wd:any)=>{const wt=WT[wd?.type];return wt?.category===3?(wt.subCategory===1?2:3):wt?.category===5?3:wt?.category;};
    for(const c of remaining){const ranked=c.pretenders.map(v=>{const first=W[v.p.weapons[0]];let score=v.score;
        if(kind(first)!==kind(c.wd))score+=100;
        else if(WT[first?.type]?.category===1&&c.wt.category===1){score-=100;if(first.type===c.wd.type)score=-Infinity;}
        if(Math.abs((first?.weight??0)+(reserved.get(v.p)??0)-c.minWeight)>5)score+=50;
        if(v.p.weapons[0]===c.sub)score=-Infinity;return {...v,score};
      }).filter(v=>!v.p.weapons[1]&&v.score>-Infinity&&v.p.availableCapacity>=c.minWeight+(reserved.get(v.p)??0)).sort((a,b)=>b.score-a.score);
      if(ranked[0])equip(c,ranked[0].p,1);
    }
    // Original attachment pass: highest skill/AP first, no duplicate attachment type across slots.
    let level=0;
    for(const [id,qty] of this.cargo){const it=items[id];if(it?.category!==4)continue;const data=AT[it.subCategory];if(!data)continue;
      const choices=this.People.flatMap(p=>p.weapons.flatMap((sub,slot)=>{const skill=Character.detectWeaponSkill(ds,sub);
        return sub&&(data.applicable??[]).includes(skill)?[{p,slot,score:((p as any)[skill+'Skill']??0)*p.maxAP}]:[];})).sort((a,b)=>b.score-a.score);
      for(const {p,slot} of choices){if(qty<=(this.inUse[id]??0))break;
        if(p.attachments[slot].length!==level||p.attachments.flat().some(sub=>sub!=null&&AT[sub]?.type===data.type)||(data.weight??0)>p.availableCapacity)continue;
        p.attachments[slot].push(it.subCategory);p.addItemToEquipment({type:id,amount:1},false);this.inUse[id]=(this.inUse[id]??0)+1;
      }
      level=Math.min(...this.People.flatMap(p=>p.attachments.map(a=>a.length)));if(level>=2)break;
    }
  }
  distributeArmor() {
    const ds=(globalThis as any).__c2?.ds;if(!ds)return;
    const items=ds.items.Items, armor=ds.items.Armor;
    const fighters=this.People.filter(p=>(p.category??0)<=2);
    for(const ch of fighters){
      ch.Jacket=0;ch.Headgear=0;
      for(const e of [...ch.equipment])if(items[e.type]?.category===5){
        this.inUse[e.type]=Math.max(0,(this.inUse[e.type]??0)-e.amount);
        ch.reduceItemFromEquipment(e.type,e.amount,false,false);
      }
    }
    const pool:Array<{id:number;data:any}>=[];
    for(const [id,amount] of this.cargo){const it=items[id];if(it?.category!==5)continue;
      const data=armor?.[it.subCategory];if(!data)continue;
      for(let n=0;n<Math.floor(amount-(this.inUse[id]??0));n++)pool.push({id,data});
    }
    pool.sort((a,b)=>b.data.armor-a.data.armor);
    const people=fighters.filter(p=>p.category===1||p.category===2).map(person=>({person,
      need:person.AP*Math.sqrt(person.generalBattleExperience)/Math.max(person.HP,1)/100}));
    people.sort((a,b)=>b.need-a.need);
    const equip=(entry:typeof people[number],item:typeof pool[number])=>{
      if((item.data.weight??0)>entry.person.availableCapacity)return false;
      entry.person.addItemToEquipment({type:item.id,amount:1},false);
      if(item.data.type===1)entry.person.Jacket=items[item.id].subCategory;
      else entry.person.Headgear=items[item.id].subCategory;
      this.inUse[item.id]=(this.inUse[item.id]??0)+1;return true;
    };
    // Caravan.as 2488–2554: one strongest piece each, then complementary armor.
    for(const entry of people){if(!pool.length)break;if(equip(entry,pool[0]))entry.need-=pool.shift()!.data.armor;}
    people.sort((a,b)=>b.need-a.need);
    for(const entry of people){const ch=entry.person;
      const i=pool.findIndex(v=>!ch.Jacket&&!ch.Headgear||v.data.type===(ch.Jacket?2:1));
      if(i>=0){const item=pool.splice(i,1)[0];equip(entry,item);}
    }
  }
  // 自动分发弹药：货物里的弹药（category 4）均分给志愿者/佣兵（cat<3）物品池，并从货物移除
  distributeAmmo() {
    // t100：原版 Caravan.as distributeAmmo（L2132-2397）移植：
    // 按已装备武器需求比例把货舱弹药逐发分给志愿者/佣兵（cat<3），
    // 货舱数量不减少、仅 inUse 记账（卸下后物品池恢复显示——此前 removeCargo 真删 → “卸下后消失”）
    const ds = (globalThis as any).__c2?.ds;
    if (!ds) return;
    const gd = (globalThis as any).__c2?.shell?.gd;
    const c = this;
    const items = ds.items.Items;
    const W = ds.weapons?.Weapons ?? {};
    const WT = ds.weapons?.WeaponTypes ?? {};
    const Ammo = ds.weapons?.Ammo ?? {};
    const people = this.People
      .filter((p) => (p.category ?? 0) < 3)
      .map((p) => (p instanceof Character ? p : new Character(p)));
    // 1) 先卸载全员现有弹药（原版开头 unequip 所有 cat3；fromCargo=true 只减货舱 inUse，不删货）
    for (const ch of people) {
      for (const e of [...ch.equipment]) {
        if (items[e.type]?.category === 3) {
          c.inUse[e.type]=Math.max(0,(c.inUse[e.type]??0)-e.amount);
          ch.reduceItemFromEquipment(e.type,e.amount,false,false);
        }
      }
    }
    // 2) 按已装备武器聚合需求（原版 _loc3_ 普通弹按 ammo type；_loc10_ 手雷按武器 sub）
    const need: Record<number, number> = {};
    const gneed: Record<number, number> = {};
    const entries: Array<{ ch: Character; ammo: number; grenade: boolean; weapon: number; slot: number; rel: number; got: number; desired: number }> = [];
    for (const ch of people) {
      for (let s = 0; s < 2; s++) {
        const sub = ch.weapons[s];
        if (!sub || sub <= 0) continue;
        const wd = W[sub];
        if (!wd) continue;
        const wt = WT[wd.type];
        if (!wt) continue;
        const cat = wt.category;
        if (cat < 2 || cat > 5) continue;
        // 原版 relPart：类别/子类 → 3/5/10/30，乘 maxAP
        let rel = 3;
        if (cat === 3) rel = wt.subCategory === 1 ? 5 : 3;
        else if (cat === 4) rel = 30;
        else if (cat === 2) {
          rel = wt.subCategory === 1 ? 5
            : wt.subCategory === 2 ? (wd.type === 15 ? 5 : 3)
            : wt.subCategory === 3 ? 30
            : wt.subCategory === 4 ? 10 : 3;
        }
        rel *= ch.maxAP;
        const grenade = cat === 5;
        if (grenade) gneed[sub] = (gneed[sub] ?? 0) + rel;
        else need[wd.ammo] = (need[wd.ammo] ?? 0) + rel;
        entries.push({ ch, ammo: wd.ammo, grenade, weapon: sub, slot: s, rel, got: 0, desired: 0 });
      }
    }
    if (!entries.length) { this.distributeAttachmentBatteries(); return; }
    // 3) 货舱可用弹药池（可用 = amount − inUse；普通弹按 Ammo[sub].type 归并，手雷按武器 sub）
    const poolA: Record<number, number> = {};
    const poolG: Record<number, number> = {};
    const ammoItems: Record<number, number[]> = {};
    const grenadeItems: Record<number, number[]> = {};
    for (const id of this.cargo.keys()) {
      const it = items[id];
      if (!it) continue;
      const avail = Math.max(0, (this.cargoAmount(id) ?? 0) - (c.inUse[id] ?? 0));
      if (avail <= 0) continue;
      if (it.category === 3) {
        const amt = Ammo[it.subCategory]?.type ?? it.subCategory ?? 0;
        poolA[amt] = (poolA[amt] ?? 0) + avail;
        (ammoItems[amt] ??= []).push(id);
      } else if (it.category === 2) {
        const wg = W[it.subCategory];
        if (wg && WT[wg.type]?.category === 5) {
          poolG[it.subCategory] = (poolG[it.subCategory] ?? 0) + avail;
          (grenadeItems[it.subCategory] ??= []).push(id);
        }
      }
    }
    // 4) desiredAmount = relPart * (可用/总需求)（原版 _loc7_/_loc4_ 比例）
    for (const en of entries) {
      const avail = en.grenade ? (poolG[en.weapon] ?? 0) : (poolA[en.ammo] ?? 0);
      const tot = en.grenade ? (gneed[en.weapon] ?? 0) : (need[en.ammo] ?? 0);
      en.desired = tot > 0 ? en.rel * (avail / tot) : 0;
    }
    // 5) 逐发发放（原版 while 循环：每轮给 ammoReceived<desired 的武器一发，池空即停；
    //    每人 addItemToEquipment 单发 + 货舱 inUse++，重量超剩余容量则跳过该发）
    // Keep item identity: compatible cartridges can have different weights and damage.
    const active = [...entries];
    while (active.length) {
      const surplus = active.every(en => en.got >= en.desired);
      for (let i = 0; i < active.length; i++) {
        const en = active[i];
        const ids = en.grenade ? grenadeItems[en.weapon] : ammoItems[en.ammo];
        if (!ids?.some(id => (c.cargoAmount(id) - (c.inUse[id] ?? 0)) >= 1)) {
          active.splice(i--, 1); continue;
        }
        if (!surplus && en.got >= en.desired) continue;
        const id = ids.find(id => c.cargoAmount(id) - (c.inUse[id] ?? 0) >= 1 && itemWeightKg(ds,id) <= en.ch.availableCapacity);
        if (id === undefined) { active.splice(i--, 1); continue; }
        en.ch.addItemToEquipment({ type: id, amount: 1 }, false);
        c.inUse[id] = (c.inUse[id] ?? 0) + 1;
        if (en.grenade) en.ch.grenadeAmounts[en.slot] = (en.ch.grenadeAmounts[en.slot] ?? 0) + 1;
        en.got++;
      }
    }
    this.distributeAttachmentBatteries();
  }

  // Caravan.as 2373–2428: whole battery sets, highest-value member first.
  private distributeAttachmentBatteries() {
    const ctx=(globalThis as any).__c2, ds=ctx?.ds;
    if (!ds || ctx?.shell?.gd?.distributeBatteries === false) return;
    const entries: Array<{person:Character;amount:number;score:number;index:number}> = [];
    for (const person of this.People) {
      for (const e of [...person.equipment]) if (e.type === 219) {
        this.inUse[219] = Math.max(0,(this.inUse[219]??0)-e.amount);
        person.reduceItemFromEquipment(219,e.amount,false,false);
      }
      person.attachments.forEach((slots,weapon)=>slots.forEach((sub,index)=>{
        const amount=sub ? Number(ds.weapons?.Attachments?.[sub]?.batteries??0) : 0;
        if(amount>0) entries.push({person,amount,score:unitPrice(person),index:weapon*2+index});
      }));
    }
    entries.sort((a,b)=>b.score-a.score || a.index-b.index);
    for(const e of entries) if(this.availableCargo(219)>=e.amount) {
      e.person.addItemToEquipment({type:219,amount:e.amount},false);
      this.inUse[219]=(this.inUse[219]??0)+e.amount;
    }
  }

  // Caravan.as 2571–2615: optional reset, strongest eligible animals, lexicographic cart ranking.
  distributeTransport(reset = true, skipUpdate = false) {
    if (reset) for (const tr of this.transports) { tr.cart = null; tr.attachedTo = null; }
    const available = (tr: any) => !tr.cart && !tr.attachedTo && !tr.passengerIn;
    const animals = this.transports.filter(tr => this.transportType(tr).category === 1 && this.transportType(tr).canDragCarts && available(tr))
      .sort((a,b) => this.transportCapacity(b) - this.transportCapacity(a));
    const carts = this.transports.filter(tr => this.transportType(tr).category === 2 && available(tr))
      .sort((a,b) => this.transportCapacity(b) - this.transportCapacity(a) || this.cartMultiplication(b) - this.cartMultiplication(a) || b.weight - a.weight);
    for (const cart of carts) {
      const animal = animals[0];
      if (animal && this.canAttachCart(animal, cart)) {
        animals.shift(); animal.cart = cart; cart.attachedTo = animal;
      }
    }
    // Keep Web's capacity invariant when a smaller cart replaces occupied seats.
    for (const tr of this.transports) this.normalizePassengers(tr);
    if (!skipUpdate) this.updateSpeed();
  }
  // Original passenger priority: slower/weaker/wounded units first, not roster order.
  private passengerScore(p: any): number {
    return 1000 / Math.max(p.speed ?? 0, .001) - (p.capacity ?? 0) - this.passengerSpaces(p) * 10 - (p.weight ?? 0)
      + (this.People.includes(p) ? (p.wounded ?? 0) * 10 : 0);
  }
  // Caravan.as 3314–3400: motor vehicles require a human driver before general allocation.
  distributeDrivers(skipUpdate = false): boolean {
    const vehicles = this.transports.filter(tr => this.transportType(tr).category === 3 && !tr.passengerIn && !this.passengersOf(tr).some(p => this.People.includes(p)));
    const seated = this.People.filter(p => p.passengerIn).sort((a,b) => 1000 / b.weight - 1000 / a.weight);
    const walking = this.People.filter(p => !p.passengerIn).sort((a,b) => this.passengerScore(b)-this.passengerScore(a));
    const candidates = [...seated,...walking];
    for (const tr of vehicles) {
      if (!candidates.length) { if (!skipUpdate) this.updateSpeed(); return false; }
      const fit = candidates.findIndex(p => p.weight <= this.capacityWithCart(tr)-this.passengersWeight(tr) && this.passengerSpaces(p) <= this.seatCapacity(tr)-this.occupiedSpaces(tr));
      const p = candidates.splice(fit < 0 ? 0 : fit,1)[0]; this.unseatPassenger(p);
      if (fit >= 0) (tr.Passengers ??= []).push(p);
      else (tr.Passengers ??= []).unshift(p);
      p.passengerIn = tr;
      if (fit < 0) this.normalizePassengers(tr);
    }
    if (!skipUpdate) this.updateSpeed();
    return vehicles.every(tr => this.passengersOf(tr).some(p => this.People.includes(p)));
  }
  // Caravan.as 3071–3237. The arguments reset allocation / defer refresh, not the global switch.
  distributePassengers(reset = true, skipUpdate = false) {
    const includeTransport = !!(globalThis as any).__c2?.shell?.gd?.transportAsPassengers;
    if (reset) this.removeAllPassengers();
    this.distributeDrivers(true);
    const vehicles = this.transports.filter(tr => this.transportType(tr).category !== 2)
      .sort((a,b) => (this.transportCapacity(b)-this.passengersWeight(b)+(this.seatCapacity(b)-this.occupiedSpaces(b))*100+(b.speed??0))
        - (this.transportCapacity(a)-this.passengersWeight(a)+(this.seatCapacity(a)-this.occupiedSpaces(a))*100+(a.speed??0)));
    const candidates: any[] = this.People.filter(p => !p.passengerIn);
    // Do not create impossible towing/passenger chains even when the Flash auto-pass allows them.
    if (includeTransport) candidates.push(...this.transports.filter(tr => this.transportType(tr).category !== 2 && !tr.passengerIn && !tr.cart));
    candidates.sort((a,b) => this.passengerScore(b)-this.passengerScore(a));
    if (includeTransport) {
      const towers = this.transports.filter(tr => this.transportType(tr).canDragCarts && !tr.passengerIn).length;
      const carts = this.transports.filter(tr => this.transportType(tr).category === 2 && !tr.passengerIn)
        .sort((a,b) => (this.cartMultiplication(b)*100-b.weight)-(this.cartMultiplication(a)*100-a.weight));
      if (towers < carts.length) {
        for (let i=carts.length-1;i>=0;i--) {
          if(carts[i].attachedTo) continue;
          candidates.unshift(carts[i]);
          if(towers===0) break;
        }
      }
    }
    for (const tr of vehicles) {
      if (tr.passengerIn) continue;
      for (let i=0; i<candidates.length; i++) {
        const p = candidates[i];
        if ((p.speed !== undefined && p.speed >= tr.speed) || this.canSeat(p,tr)) continue;
        const displaced = [...this.passengersOf(p)];
        if (!this.seatPassenger(p,tr,true)) continue;
        candidates.splice(i--,1);
        if (displaced.length) { candidates.push(...displaced); candidates.sort((a,b) => this.passengerScore(b)-this.passengerScore(a)); i=-1; }
      }
    }
    if (!skipUpdate) this.updateSpeed();
  }
  // 全员下车（原版 removeAllPassengers：人/载具 passengerIn=null，载具 Passengers 清空）
  removeAllPassengers() {
    for (const p of this.People) this.unseatPassenger(p);
    for (const tr of this.transports) {
      for (const p of [...this.passengersOf(tr)]) this.unseatPassenger(p);
      tr.passengerIn = null;
    }
  }
  // 原版 totalMedicineConsumption：Σ medsDosage[group.medicineUse[wounded]]（wounded 1-4；dosage [0,5,10,20,50]）
  totalMedicineConsumption(catFilter: number | number[] | null = null): number {
    const medsDosage = [0, 5, 10, 20, 50];
    let total = 0;
    for (const p of this.People) {
      if (catFilter !== null) {
        if (Array.isArray(catFilter)) { if (!catFilter.includes(p.category ?? 0)) continue; }
        else if (catFilter !== (p.category ?? 0)) continue;
      }
      const gs = this.getSettingsGroup(p.category ?? 1);
      const maxHPp = ((p as any).physical ?? (p as any).basePhysical ?? 10) * 20;
      const hp = p._HP ?? 100;
      let wounded = 0;
      if (maxHPp-hp < .5) continue;
      if (hp > maxHPp * 0.8) wounded = 1;
      else if (hp > maxHPp * 0.4) wounded = 2;
      else if (hp > maxHPp * 0.1) wounded = 3;
      else wounded = 4;
      const useIdx = gs.medicineUse?.[wounded] ?? 0;
      total += medsDosage[useIdx] ?? 0;
    }
    return total;
  }
  addCargo(item: number, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.cargo.set(item, (this.cargo.get(item) ?? 0) + amount);
    this.recordCargoChange(item, amount, true);
  }
  // 原版 Caravan.Cargo（数组，元素 {type, amount}）——转译回调里 for(i in .Cargo)/.Cargo[i].type 用
  get Cargo(): Array<{ type: number; amount: number }> {
    return [...this.cargo.entries()].filter(([, a]) => a > 0).map(([type, amount]) => ({ type, amount }));
  }
  removeCargo(item: number, amount: number) {
    const cur = this.cargo.get(item) ?? 0;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const nv = Math.max(0, cur - amount);
    this.recordCargoChange(item, cur - nv, false);
    if (nv === 0) this.cargo.delete(item); else this.cargo.set(item, nv);
  }
  cargoAmount(item: number): number { return this.cargo.get(item) ?? 0; }
  get totalCargo(): number {
    let s = 0;
    const ds = (globalThis as any).__c2?.ds;
    for (const [id, amount] of this.cargo) s += itemWeightKg(ds, id) * amount;
    return s;
  }
  // ---------- 补给 getter（原版 Caravan；概观页/导航屏用） ----------
  get water(): number { return this.cargoAmount(1); }
  get forage(): number { return this.cargoAmount(62); }
  get meds(): number { return this.cargoAmount(63); }
  get fuel(): number { return this.cargoAmount(64); }
  // 原版 Caravan.food：食物总量 kcal（Goods[subCategory].food；cannibal 时含 174）
  get food(): number {
    const ds = (globalThis as any).__c2?.ds;
    const items = ds?.items?.Items ?? [];
    const goods = ds?.items?.Goods ?? [];
    let kcal = 0;
    for (const [id, amt] of this.cargo) {
      if (amt <= 0) continue;
      const it = items[id];
      const g = it?.category === 1 ? goods[it.subCategory] : null;
      if (g && g.food) kcal += (g.calories ?? 0) * amt;
      else if (id === 174 && this.cannibal && g) kcal += (g.calories ?? 0) * amt;
    }
    return kcal;
  }
  // Caravan.as:1226–1251：成员最高视野 × 可工作的望远设备倍率 / 100。
  get sight(): number {
    const ds = (globalThis as any).__c2?.ds as DataStore | undefined;
    let amplifier = 1;
    if (ds) for (const [id, amount] of this.cargo) {
      const data = itemDefinition(ds, id);
      if (amount > 0 && data?.sightAmplifier && data.amplification > amplifier && (!data.device || this.devicesWorking(id) > 0)) amplifier = data.amplification;
    }
    return Math.max(0, ...this.People.map(p => p.sight)) * amplifier / 100;
  }
  // 原版 Caravan.noticeability：(100 + totalCargo + Σ人 + Σ载具)^0.33 × 20；静止减半
  get noticeability(): number {
    const ds = (globalThis as any).__c2?.ds;
    let n = 100 + this.totalCargo;
    for (const p of this.People) {
      const phys = (p as any).physical ?? (p as any).basePhysical ?? 10;
      const agi = (p as any).agility ?? (p as any).baseAgility ?? 10;
      const exp = (p as any).travelExperience ?? 0;
      n += Math.max(phys * 10 - agi * 5, 1) / Math.max(Math.pow(exp, 0.1), 1);
    }
    if (ds?.transports?.Types) for (const tr of this.transports) n += ds.transports.Types[tr.type]?.noticeability ?? 0;
    n = Math.pow(n, 0.33) * 20;
    if (!this.moving) n /= 2;
    return n;
  }
  // 原版 Caravan.morale：志愿者+佣兵平均士气
  get morale(): number {
    let s = 0, cnt = 0;
    for (const p of this.People) {
      if (p.category === 1 || p.category === 2) { s += (p as any).morale ?? 0; cnt++; }
    }
    return cnt > 0 ? s / cnt : 0;
  }
  foodKcal(): number {
    const ds = (globalThis as any).__c2?.ds;
    const items = ds?.items?.Items;
    const goods = ds?.items?.Goods;
    let kcal = 0;
    for (const [id, amt] of this.cargo) {
      const it = items?.[id];
      const g = it?.category === 1 ? goods?.[it.subCategory] : null;
      if (g && g.food) kcal += (g.calories ?? 0) * amt;
    }
    return kcal;
  }

  // 原版 Caravan.getConsumptionProduction()：每日需求汇总（水/食物 kcal/饲料/燃料/药 + 设备产消 + fuelPer100Km）
  getConsumptionProduction(): {
    consumption: Array<{ item: number; amount: number }>;
    production: Array<{ item: number; amount: number }>;
    foodConsumption: number;
    foodProduction: number;
    fuelPer100Km: number;
    electricityProduction: number;
    electricityConsumption: number;
    waterInFood: number;
  } {
    const ds = (globalThis as any).__c2?.ds;
    const items = ds?.items?.Items ?? [];
    const goods = ds?.items?.Goods ?? [];
    const consumption: Array<{ item: number; amount: number }> = [];
    const production: Array<{ item: number; amount: number }> = [];
    const addTo = (arr: Array<{ item: number; amount: number }>, item: number, amount: number) => {
      if (amount <= 0) return;
      const e = arr.find((x) => x.item === item);
      if (e) e.amount += amount; else arr.push({ item, amount });
    };
    // 设备（inUse 工作；产/耗电汇总，原版 electricityProduction/electricityConsumption）
    let eP = 0, eC = 0;
    const running: Array<{data:any; count:number}> = [];
    for (const [id, amt] of this.cargo) {
      if (amt <= 0) continue;
      const it = items[id];
      const g = it?.category === 1 ? goods[it.subCategory] : null;
      if (!g) continue;
      const inUse = Math.min(amt, this.inUseOf(id));
      if (inUse <= 0) continue;
      const hasFlow = (g.consumption?.length) || (g.production?.length) || g.electricityProduction > 0 || g.electricityConsumption > 0;
      if (!hasFlow) continue;
      let rate = 1;
      for (const cns of g.consumption ?? []) {
        if (this.availableCargo(cns.item) <= 0) { rate = 0; break; }
      }
      if (rate <= 0) continue;
      if (g.electricityProduction > 0) eP += g.electricityProduction * inUse;
      if (g.electricityConsumption > 0) eC += g.electricityConsumption * inUse;
      running.push({data:g, count:inUse});
    }
    for (const {data:g,count} of running) {
      if (eC > eP && g.electricityConsumption > 0) continue;
      for (const p of g.production ?? []) addTo(production, p.item, p.amount * count);
      for (const c of g.consumption ?? []) addTo(consumption, c.item, c.amount * count);
    }
    // 运输 getter 已是每日需求；不再乘四，也不把 Items 子编号当作食品。
    const ttypes = ds?.transports?.Types ?? [];
    let foodConsumption = 0;
    let fuelPer100Km = 0;
    for (const tr of this.transports) {
      const t = ttypes[tr.type];
      if (!t) continue;
      const needs = [
        {item:62,amount:tr.forageConsumption ?? 0},
        {item:1,amount:tr.waterConsumption ?? 0},
        {item:t.milk?.item ?? 0,amount:tr.milkConsumption ?? 0},
      ];
      for (const c of needs) {
        let amt = c.amount;
        if (!this.milk && c.item === t.milk?.item && this.transports.includes(tr.mother)) {
          amt = Math.max(0,amt-(tr.mother.production?.find((p:any)=>p.item===c.item)?.amount ?? 0));
        }
        if (amt <= 0 || c.item <= 0) continue;
        const it=items[c.item],def=it?.category===1?goods[it.subCategory]:null;
        if (def?.food) foodConsumption += (def.calories ?? 0) * amt;
        addTo(consumption, c.item, amt);
      }
      for (const p of tr.production ?? []) {
        if ((!this.milk && p.item === t.milk?.item) || (!this.shear && p.item === 87)) continue;
        addTo(production,p.item,p.amount);
      }
      if (t.category === 3 && !tr.passengerIn) fuelPer100Km += tr.fuelConsumption ?? t.fuelConsumption ?? 0;
    }
    // 人物：GDA×配给（kcal/日）+ 水（weight×0.035×配给）
    let waterNeed = 0;
    for (const p of this.People) {
      const gs = this.getSettingsGroup(p.category ?? 1);
      foodConsumption += p.GDA * (gs.foodRations ?? 100) / 100;
      waterNeed += p.waterConsumption * (gs.waterRations ?? 100) / 100;
    }
    if (waterNeed > 0) addTo(consumption, 1, waterNeed);
    // 药品消耗（原版 Caravan.as L1045-1053：totalMedicineConsumption → item 63）
    const medUse = this.totalMedicineConsumption();
    if (medUse > 0) addTo(consumption, 63, medUse);
    let foodProduction = 0;
    let waterInFood = 0;
    for (const p of production) {
      const def = (globalThis as any).__c2GetItemData ? (globalThis as any).__c2GetItemData(p.item) : null;
      if (def && def.food) {
        foodProduction += (def.calories ?? 0) * p.amount;
        waterInFood += p.amount * (def.waterPercentage ?? 0) * (def.weight ?? 1);
      }
    }
    return { consumption, production, foodConsumption, foodProduction, fuelPer100Km, electricityProduction: eP, electricityConsumption: eC, waterInFood };
  }
  get maxCargo(): number {
    let cap = 0;
    for (const p of this.People) if (!p.passengerIn && p.category < 6 && p.category !== 3) cap += p.capacity;
    for (const tr of this.transports) if (this.transportType(tr).category !== 2 && !tr.passengerIn) cap += this.capacityWithCart(tr) - this.passengersWeight(tr);
    return cap;
  }
  // 原版语义：返回货物条目对象 {item, amount} 或 undefined
  findCargo(item: number): { item: number; amount: number } | undefined {
    const amt = this.cargo.get(item);
    return amt !== undefined ? { item, amount: amt } : undefined;
  }
  reduceCargo(item: number, amount: number) { this.removeCargo(item, amount); }
  // 原版 Caravan.removeEquipment：装备属于车队货物，只解除占用，不重复加货。
  removeEquipment(p: Character) {
    for (const e of p.equipment ?? []) this.inUse[e.type] = Math.max(0, (this.inUse[e.type] ?? 0) - e.amount);
    p.equipment = [];
    p.weapons = [0, 0]; p.grenadeAmounts = [0, 0];
    p.Jacket = p.Headgear = 0; p.attachments = [[null, null], [null, null]];
    p.selectedAmmo = [null, null]; p.loadedAmmo = [null, null]; p.currModes = [0, 0];
  }
  update() {}
  get totalWeight(): number {
    let w = 0;
    for (const p of this.People) w += p.weight;
    for (const tr of this.transports) w += tr.weight ?? 0;
    for (const [id, amt] of this.cargo) w += amt * itemWeightKg((globalThis as any).__c2?.ds,id);
    return w;
  }
  private goodsWeight(item: number): number | null {
    const getter = (globalThis as any).__c2GetItemData as ((id: number) => any) | undefined;
    const d = getter ? getter(item) : null;
    return d && typeof d.weight === "number" ? d.weight : null;
  }
}

export class Town {
  altName?: string;
  id: number;
  x: number; y: number;
  name: string;
  population: number;
  preset: Record<string, any>;
  locations: any[] = [];
  people?: Character[]; // 城镇可雇佣成员；undefined 表示尚未初始化
  /** 原版 Town.playersStorage：玩家私有存储（你的房间 subCat5 交易对象；{type,amount} 条目数组） */
  playersStorage: Array<{ type: number; amount: number }> = [];
  incompleteProduction: Array<{item:number;amount:number}> = [];
  playersIncompleteProduction: Array<{item:number;amount:number}> = [];
  stock = new Map<number, number>();
  /** 原版 Town.cycleCounter：城镇经济周期计数（随机 0-719 起步，每周期 720 单位 = 43200 游戏秒） */
  cycleCounter = Math.floor(Math.random() * 720);
  prices: Record<number, number> = {};
  get noticeability(): number { return Number(this.preset.noticeability) || 0; }
  discovered = false;
  active = true; // Town.as:56; inactive route destinations are skipped.
  industries: Array<{ type: number; volume: number; forSale: boolean; employees: number }> = [];
  playersIndustries: Array<{ type: number; volume: number; employees: number }> = [];
  playersStorageSpace = 0;
  unemployed = 0; // 城镇失业人口（原版 Town.unemployed；构造时按 人口×0.85−产业雇员 计算，Expand/Downsize 增减）
  electricityPrice = 1; // 电价（原版 Town.electricityPrice；构造时从 preset 读取，用于 totalExpenses）
  money = 0; // 城镇资金（原版 Town.money；构造时从 preset 初始化，供贸易购货）
  playersMoney = 0; // 玩家产业经营资金（原版 playersMoney）
  bannedGoods: number[] = []; // 走私品（原版 Town.bannedGoods）
  illegalActions: Array<{ action: number; amount: number; smugglingSkill: number }> = []; // 走私记录（原版 partner.illegalActions）
  cpCache: { productsList: Array<{ item: number; production: number; consumption: number }>; categoryProducts: any } | null = null;
  // 历史数据（原版 Town.historicalData）：每周期 unshift 一条 {time, production, consumption, playersProduction, playersConsumption}，新→旧
  historicalData: Array<{
    time: number;
    production: Array<{ item: number; amount: number }>;
    consumption: Array<{ item: number; amount: number }>;
    playersProduction: Array<{ item: number; amount: number }>;
    playersConsumption: Array<{ item: number; amount: number }>;
  }> = [];

  // —— 人口消耗（对齐 Town.as）——
  get totalFoodConsumption(): number { return this.population * (1500 + 200 * Math.pow(this.wealthFactor, 0.5)); }
  get totalWaterConsumption(): number { return this.population * 2; }
  get upperBodyClothingConsumption(): number {
    return this.id >= 17 && this.id <= 20 ? this.population * 0.02 * this.wealthFactor : this.population * 0.05 * this.wealthFactor;
  }
  get lowerBodyClothingConsumption(): number { return this.population * 0.03 * this.wealthFactor; }
  get shoesConsumption(): number { return this.population * 0.007 * this.wealthFactor; }
  get hatConsumption(): number { return this.population * 0.002 * Math.pow(this.wealthFactor, 2); }

  // 人口逐物品消耗（对齐 generatePopulationConsumption）
  generatePopulationConsumption(): Array<{ item: number; amount: number }> {
    const out: Array<{ item: number; amount: number }> = [];
    const pop = this.population, wf = this.wealthFactor;
    let meds = pop * 0.2 * wf;
    if (wf < 0.6) meds *= (0.7 - wf) * 10;
    if (meds > 0) out.push({ item: 63, amount: meds });
    if (this.id === 69) out.push({ item: 104, amount: pop * wf * 0.8 });
    else if (wf > 0.2 && pop > 0) out.push({ item: 104, amount: pop * wf * 0.2 });
    if (this.id === 44) out.push({ item: 165, amount: pop * wf * 0.1 });
    else out.push({ item: 165, amount: pop * wf * 0.007 });
    out.push({ item: 64, amount: pop * wf * 0.25 });
    out.push({ item: 79, amount: pop * wf * 0.025 });
    out.push({ item: 184, amount: pop * Math.pow(wf, 1.5) * 0.016 });
    out.push({ item: 185, amount: pop * Math.pow(wf, 2) * 0.001 });
    out.push({ item: 187, amount: pop * wf * 0.1 });
    out.push({ item: 188, amount: pop * Math.pow(wf, 2) * 0.0025 });
    out.push({ item: 190, amount: Math.pow(pop, 2) * wf * 0.00001 });
    out.push({ item: 197, amount: pop * wf * 0.06 });
    if (pop > 500 && wf > 1) out.push({ item: 205, amount: pop * 0.04 * wf });
    return out;
  }

  // 消耗+生产（对齐 getConsumptionProduction，industry 配方 × 雇员数）
  getConsumptionProduction(ds: DataStore, excluded: readonly any[] = []): { productsList: Array<{ item: number; production: number; consumption: number }>; categoryProducts: any } {
    const types: any[] = ds.industries?.Types ?? [];
    const products: Array<{ item: number; production: number; consumption: number }> = [];
    const catProducts: any = {};
    const addProd = (item: number, amount: number) => {
      const e = products.find((p) => p.item === item);
      if (e) e.production += amount; else products.push({ item, production: amount, consumption: 0 });
    };
    const addCons = (item: number, amount: number) => {
      const e = products.find((p) => p.item === item);
      if (e) e.consumption += amount; else products.push({ item, production: 0, consumption: amount });
    };
    const categories: string[] = ds.gamedata?.itemCategories ?? [];
    const allInd = [...this.industries, ...this.playersIndustries].filter(ind=>!excluded.includes(ind));
    const produced = new Map<number, number>();
    // Aggregate first: multiple producers must not each subtract the same industrial food use.
    for (const ind of allInd) {
      const t = types[ind.type]; if (!t) continue;
      for (const c of t.consumption ?? []) addCons(c.item, c.amount * ind.employees);
      for (const p of t.production ?? []) produced.set(p.item, (produced.get(p.item) ?? 0) + p.amount * ind.employees);
    }
    for (const [id,total] of produced) {
      const data = itemDefinition(ds,id);
      const category = categories.find(cat => data?.[cat]);
      let amount = total;
      if (data?.food) {
        const used = Math.min(amount, products.find(p => p.item === id)?.consumption ?? 0);
        // The original chart keeps industrial food input/output in item units, and
        // shows only the remaining food in the calorie category. Do not duplicate it.
        if (used > 0) { addProd(id,used); amount -= used; }
      }
      if (category) {
        const entry = catProducts[category] ??= { production:0, consumption:0 };
        entry.production += category === "food" ? amount * (data?.calories ?? 0) : amount;
      } else if (amount !== 0) addProd(id,amount);
    }
    // 分类人口消耗
    const catAmounts: Array<[string, number]> = [
      ["food", this.totalFoodConsumption],
      ["upperBodyClothing", this.upperBodyClothingConsumption],
      ["lowerBodyClothing", this.lowerBodyClothingConsumption],
      ["shoes", this.shoesConsumption],
      ["hat", this.hatConsumption],
    ];
    for (const [cat, amt] of catAmounts) {
      if (amt > 0) {
        if (catProducts[cat]) catProducts[cat].consumption += amt;
        else catProducts[cat] = { consumption: amt, production: 0 };
      }
    }
    // 人口逐物品消耗
    for (const pc of this.generatePopulationConsumption()) addCons(pc.item, pc.amount);
    // 水
    addCons(1, this.totalWaterConsumption);
    const result = { productsList: products, categoryProducts: catProducts };
    if (!excluded.length) this.cpCache = result;
    return result;
  }

  // MapMode.as: half-day stock-limited production, separate player warehouse and actual ledgers.
  tickCycle(ds: DataStore, time=0) { return settleTownEconomy(this,ds,time); }

  difficulty = 1;
  GDPperCapita: number | null = null;
  tax = 0;
  storagePrice = 100;
  allowsSlaves = false; // 原版 Town.allowsSlaves（是否允许奴隶交易）
  constructor(id: number, preset: Record<string, any>, ds: DataStore) {
    this.id = id;
    this.preset = preset;
    this.x = preset.x ?? 0;
    this.y = preset.y ?? 0;
    this.population = preset.population ?? 0;
    this.name = getText(ds, preset.name ?? 0, ds.language);
    this.allowsSlaves = preset.allowsSlaves === true;
    // 地点：preset 原样 + 初始化商店数据（原版 Town.as L110-202）：
    //  - assortment（货物清单）→ loc.stock（Map：物品→数量，量=assortment×(0.8+rand×0.4)）
    //  - transportAssortment（载具清单）→ loc.transport（TransportUnit 数组）
    //  - slavesAmount（奴隶数）→ loc.slaves（Character 数组，随机生成 category=4）
    //  - loc.money = random(1000,10000) + Σ(物品基础价+载具价+奴隶价)
    const itemDataFn = (globalThis as any).__c2GetItemData as ((id: number) => any) | undefined;
    this.locations = (preset.locations ?? []).map((loc: any) => {
      const copy = { ...loc };
      copy.stock = new Map<number, number>();
      copy.transport = [];
      copy.slaves = [];
      copy.money = 1000 + Math.floor(Math.random() * 9000);
      // assortment → 初始库存
      for (const a of loc.assortment ?? []) {
        const base = itemDataFn ? (itemDataFn(a.item)?.price ?? 0) : 0;
        copy.money += base;
        let qty = a.amount * (0.8 + Math.random() * 0.4);
        if (itemDataFn && !(itemDataFn(a.item)?.divisible)) qty = Math.round(qty);
        if (qty > 0) copy.stock.set(a.item, (copy.stock.get(a.item) ?? 0) + qty);
      }
      // transportAssortment → 初始载具
      for (const t of loc.transportAssortment ?? []) {
        const n = Math.round(t.amount);
        for (let k = 0; k < n; k++) {
          const unit = makeTransportUnit(t.type, ds);
          copy.transport.push(unit);
          copy.money += unitPrice(unit);
        }
      }
      // slavesAmount → 初始奴隶
      const sa = loc.slavesAmount !== undefined ? loc.slavesAmount : 0;
      const slaveN = Math.round(sa * Math.random());
      for (let i = 0; i < slaveN; i++) {
        const s = makeRandomCharacter(ds, { category: 4 });
        copy.slaves.push(s);
        copy.money += unitPrice(s);
      }
      copy.margin = loc.margin ?? 0;
      copy.relPrice = loc.relPrice ?? 1;
      return copy;
    });
    this.tax = preset.tax ?? 0;
    this.storagePrice = preset.storagePrice ?? 100;
    // 玩家存储容量（原版 Town.as L105-108：defaultStorage>0 时使用）
    this.playersStorageSpace = (preset.defaultStorage ?? 0) > 0 ? preset.defaultStorage : 0;
    // 城镇资金初始化（原版 Town.as L104：money = round(population × random × 10000)）
    this.money = preset.money ?? Math.round((preset.population ?? 100) * Math.random() * 10000);
    this.bannedGoods = Array.isArray(preset.bannedGoods) ? [...preset.bannedGoods] : [];
    this.GDPperCapita = preset.GDPperCapita ?? null;
    this.electricityPrice = preset.electricityPrice ?? 1;
    for (const ind of preset.industries ?? []) {
      this.industries.push({ type: ind.type, volume: ind.volume ?? 0, forSale: !!ind.forSale, employees: ind.volume ?? 0 });
    }
    // 原版 Town.as L203-230：产业初始库存（生产 + 消耗都入 stock，量 = round(amount×random)；
    // item 97（货币）不进货而是折现入 town.money —— 原版 L216-219 与 MapMode L4848-4851 同语义）
    const indTypes: any[] = ds.industries?.Types ?? [];
    for (const ind of this.industries) {
      const t = indTypes[ind.type];
      if (!t) continue;
      for (const p of t.production ?? []) {
        const amt = Math.round(p.amount * Math.random());
        if (p.item === 97) this.money += amt;
        else if (amt > 0) this.addToStock(p.item, amt);
      }
      for (const c2 of t.consumption ?? []) {
        const amt = Math.round(c2.amount * Math.random());
        if (amt > 0) this.addToStock(c2.item, amt);
      }
    }
    // 原版 GameData.startNewGame L783-809：剧情/特殊城镇初始库存（碉堡镇15 等）
    // 注意 addToStock 第三参 target：玩家存储走 playersStorage，其余走城镇全局 stock
    if (this.id === 15) {
      this.stock = new Map<number, number>();
      this.addToStock(1, 250);
      this.addToStock(66, 3);
      this.addToStock(67, 2);
      this.addToStock(68, 1);
      this.addToPlayersStorage(2, 1);
      this.addToPlayersStorage(42, 1);
      this.addToPlayersStorage(229, 1);
    }
    if (this.id === 21) {
      this.addToPlayersStorage(105, 1);
      this.addToPlayersStorage(106, 1);
      this.addToPlayersStorage(29, 45);
      this.addToPlayersStorage(80, 1);
      this.addToPlayersStorage(65, 10);
      this.addToPlayersStorage(1, 8);
      this.addToPlayersStorage(71, 1.3);
      this.addToPlayersStorage(73, 0.8);
      this.addToPlayersStorage(75, 3);
    }
    if (this.id === 19) {
      this.addToStock(99, 30);
      this.addToStock(100, 30);
      this.addToStock(101, 30);
      this.addToStock(102, 30);
      this.addToStock(95, 200);
      this.addToStock(95, 100);
    }
    if (this.id === 18) {
      this.addToStock(87, 300);
    }
    // 失业人口（原版 Town.as L231：unemployed = max(round(population×0.85 − 产业雇员), 0)）
    let industryEmployees = 0;
    for (const ind of this.industries) if (!ds.industries.Types[ind.type]?.replaceEmployeesBySize) industryEmployees += ind.employees ?? 0;
    this.unemployed = Math.max(Math.round(this.population * 0.85 - industryEmployees), 0);
    this.ensureHirePeople(ds);
  }
  // Town.as:231–275. Generate once; a saved empty list must remain empty.
  ensureHirePeople(ds: DataStore) {
    if (this.people !== undefined) {
      this.people = this.people.map(p => p instanceof Character ? p : new Character(p));
      return;
    }
    this.people = [];
    if (this.preset.noPeopleToHire) return;
    const integer = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
    const makePerson = (init: Record<string, any>) => makeRandomCharacter(ds, init);
    const obligatory: Record<string, any>[] = this.preset.obligatoryPeople ?? [];
    const count = Math.max(Math.round(this.unemployed / 2), obligatory.length);
    for (const init of obligatory) {
      const p = makePerson({ ...init, faction: init.faction ?? this.preset.faction ?? 0 });
      p.dontRemoveFromTown = true;
      this.people.push(p);
    }
    for (let i = obligatory.length; i < count; i++) {
      const init: Record<string, any> = {};
      if (this.id === 52) init.swordsExperience = 1000 + Math.random() * 9000;
      if (this.preset.salaryCoefficient != null) init.salaryCoefficient = this.preset.salaryCoefficient * (.6 + Math.random() * .8);
      if (this.preset.maxAttributes != null) init.levelModifier = .8 + Math.random() * (this.preset.maxAttributes - .8);
      if (this.preset.maxExperience != null) init.experienceModifier = .8 + Math.random() * (this.preset.maxExperience - .8);
      init.faction = this.preset.faction != null && Math.random() < .7 ? this.preset.faction
        : integer(1, Math.max(1, (ds.presets.faction_relations?.[0]?.length ?? 2) - 1));
      this.people.push(makePerson(init));
    }
  }

  // 原版 Town.addToStock(param1,param2,param3=null)：第三参 target（默认城镇全局 stock；商店 loc.stock 传 Map）
  addToStock(item: number, amount: number, target?: Map<number, number> | Array<{type:number;amount:number}>) {
    const m = target ?? this.stock;
    if (Array.isArray(m)) {
      const entry=m.find(e=>e.type===item);
      if(entry)entry.amount=Math.max(0,entry.amount+amount);
      else if(amount>0)m.push({type:item,amount});
    } else m.set(item, Math.max(0, (m.get(item) ?? 0) + amount));
  }
  // 原版 Town.removeFromStock(param1,param2,param3=null)：第三参 target（默认城镇全局 stock）
  removeFromStock(item: number, amount: number, target?: Map<number, number> | Array<{type:number;amount:number}>) {
    const m = target ?? this.stock;
    if(Array.isArray(m)){const i=m.findIndex(e=>e.type===item);if(i>=0){m[i].amount=Math.max(0,m[i].amount-amount);if(m[i].amount<=1e-9)m.splice(i,1);}return;}
    const cur = m.get(item) ?? 0;
    const nv = Math.max(0, cur - amount);
    if (nv <= 1e-9) m.delete(item); else m.set(item, nv);
  }
  // 玩家存储：{type,amount} 数组（原版 playersStorage 为 Item[]）
  addToPlayersStorage(item: number, amount: number) {
    const e = this.playersStorage.find((x) => x.type === item);
    if (e) e.amount += amount; else this.playersStorage.push({ type: item, amount });
  }
  removeFromPlayersStorage(item: number, amount: number) {
    const i = this.playersStorage.findIndex((x) => x.type === item);
    if (i < 0) return;
    this.playersStorage[i].amount -= amount;
    if (this.playersStorage[i].amount <= 1e-9) this.playersStorage.splice(i, 1);
  }
  // 原版 Town.slavePrices getter（Town.as L827-834：preset.slavePrices ?? 1）
  get slavePrices(): number {
    const v = (this.preset as any)?.slavePrices;
    return typeof v === "number" ? v : 1;
  }
  // 商店结算资金（原版 subCategory==1 → town.money，否则 loc.money）
  shopMoney(loc: any): number {
    return (loc && loc.subCategory === 1) ? this.money : (loc?.money ?? 0);
  }
  get wealthFactor(): number {
    return Math.min(Math.max((this.GDPperCapita ?? 0) / 300, 0.5), 2.5);
  }
  // 玩家在城镇仓储中已占用的空间（原版 Town.occupiedPlayersStorageSpace：playersStorage 物品总重；仓储功能未接入时返回 0）
  get occupiedPlayersStorageSpace(): number {
    const ds=(globalThis as any).__c2?.ds;
    return this.playersStorage.reduce((weight,e)=>weight+itemWeightKg(ds,e.type)*e.amount,0);
  }

  // —— 产业经济（对齐 Industry.as §2.4：pricePerUnit / price / employeeSalary / totalExpenses） ——
  // pricePerUnit = Types.price × (0.8 + wealthFactor×0.2) × 难度系数（故事=0.5）
  industryPricePerUnit(type: number, ds: DataStore, difficulty: number): number {
    const t = ds.industries?.Types?.[type];
    if (!t || !t.price) return 0;
    return t.price * (0.8 + this.wealthFactor * 0.2) * (difficulty === 1 ? 0.5 : 1);
  }
  // 买产业总价 = pricePerUnit × employees × essential(3)
  industryTotalPrice(type: number, employees: number, ds: DataStore, difficulty: number): number {
    const t = ds.industries?.Types?.[type];
    const mult = t && t.essential ? 3 : 1;
    return this.industryPricePerUnit(type, ds, difficulty) * employees * mult;
  }
  industryEmployeeSalary(type: number, ds: DataStore): number {
    const t = ds.industries?.Types?.[type];
    if (!t || !t.averageSalary) return 0;
    return t.averageSalary * (0.8 + this.wealthFactor * 0.2);
  }
  // 总开支 = (电耗×电价 + 工资) × 雇员 + 固定开支
  industryTotalExpenses(type: number, employees: number, ds: DataStore): number {
    const t = ds.industries?.Types?.[type];
    if (!t) return 0;
    const sal = this.industryEmployeeSalary(type, ds);
    return ((t.electricityConsumption ?? 0) * this.electricityPrice + sal) * employees + (t.fixedExpenses ?? 0);
  }
  getItemBasePrice(itemId: number, ds: DataStore): number {
    if (this.prices[itemId] !== undefined) return this.prices[itemId];
    // 由 Economy.getItemData 提供（运行时注入避免循环依赖）
    const getter = (globalThis as any).__c2GetItemData as ((id: number) => any) | undefined;
    return getter ? (getter(itemId)?.price ?? 1) : 1;
  }
}


export interface NpcRoutePoint {
  town: number;
  buy?: Array<{ item: number | string; amount: number }>;
  sell?: Array<{ item: number | string; amount: number }>;
}

// —— t64 ③：NPC 速度/视野/战力按原版公式物化（SPEC §④） ——

// 车队速度 = 最慢步行者（原版 Caravan.speedWithoutWindPowered 的人侧：每人 3+agility/2）。
// 地图 NPC 不物化受伤状态/载具（ct.transport 消费留 README 遗留），故只取人速。
function npcSpeedKmhFromPeople(people: Array<{ baseAgility?: number; agility?: number }>): number {
  if (!people || !people.length) return 8;
  let s = Infinity;
  for (const p of people) {
    const ag = Number(p?.baseAgility ?? p?.agility ?? 5);
    const ps = 3 + ag / 2;
    if (ps < s) s = ps;
  }
  return s === Infinity ? 8 : s;
}
// 单体视野（原版 Character.sight = sqrt(accuracy*10 + sqrt(travelExperience))*8）；车队取最大
function npcSightFromPeople(people: Array<{ baseAccuracy?: number; accuracy?: number; generalBattleExperience?: number }>): number {
  if (!people || !people.length) return 80;
  let m = 0;
  for (const p of people) {
    const acc = Number(p?.baseAccuracy ?? p?.accuracy ?? 5);
    const sight = Math.sqrt(acc * 10 + Math.sqrt(p?.generalBattleExperience ?? 0)) * 8;
    if (sight > m) m = sight;
  }
  return Math.max(m, 1);
}
// 车队可见性（原版 noticeability = pow(100+totalCargo+ΣpersonNoticeability, 0.33)*20；
// personNoticeability = max(physical*10-agility*5,1)/pow(travelExperience,0.1)）。
// 地图 NPC 货物是金额批次未折算成重量，这里仅以人数近似计入 cargo 项（幅度远小于货物项，偏差可接受）。
function npcNoticeabilityFromPeople(people: Array<any>): number {
  let sum = 0;
  for (const p of people ?? []) {
    const phys = Number(p?.basePhysical ?? p?.physical ?? 5);
    const agi = Number(p?.baseAgility ?? p?.agility ?? 5);
    const expm = Math.max(Number(p?.experienceModifier ?? p?.travelExperience ?? 1), 0.01);
    sum += Math.max(phys * 10 - agi * 5, 1) / Math.pow(expm, 0.1);
  }
  return Math.pow(Math.max(100 + sum, 1), 0.33) * 20;
}
// 追击判定半径：原版可见性 betweenCaravans<=noticeability*sight（平方距离语义）
// ⇒ 实际追距 = sqrt(noticeability*sight)；保底 80px（低于接触距离 16px 无意义）
function npcChaseRangeFromPeople(people: Array<any>): number {
  return Math.max(80, Math.sqrt(npcNoticeabilityFromPeople(people) * npcSightFromPeople(people)));
}
// 车队战力（原版 visualWarPower）：Σ(100 + sqrt(weapon.price×(cat5?5:1)/(slot+1)))，fighter=cat<3||cat==5
export function npcVisualWarPower(people: Array<any>, ds: any): number {
  let sum = 0;
  for (const p of people ?? []) {
    const category = p.category ?? 1;
    if (!(category < 3 || category === 5)) continue;
    sum += 100;
    const ids = p.weapons ?? [ds?.items?.Items?.[p.weaponItem]?.subCategory ?? 0];
    ids.forEach((id: number, slot: number) => {
      const w = ds?.weapons?.Weapons?.[id];
      if (!id || !w) return;
      // Caravan.as:1269-1277: multiplier is the WEAPON category, not person's category.
      const multiplier = ds.weapons?.WeaponTypes?.[w.type]?.category === 5 ? 5 : 1;
      sum += Math.sqrt(Math.max(0, w.price * multiplier / (slot + 1)));
    });
  }
  return sum;
}
// 原版 Caravan.visualWarPower(Caravan.as:1254-1281) / actualWarPower(1286-1321)：
// visual = Σ 战斗人员(cat<3||cat==5) 的 100 + Σ√(武器价×mult/(slot+1))；
// actual = visual 再为每名战斗人员叠加 100 + physical + accuracy + maxAP + √generalBattleExperience + 武器项
// （原版确实把「100 + 武器项」计了两遍，此处照抄不改）。toCharacter 用于把持久化的战斗记录规格转成 Character。
export function peopleWarPower(people: Array<any>, ds: any, actual = false, toCharacter?: (p: any) => any): number {
  let sum = npcVisualWarPower(people, ds);
  if (!actual) return sum;
  const conv = toCharacter ?? ((p: any) => p);
  for (const p of people ?? []) {
    const category = p?.category ?? 1;
    if (!(category < 3 || category === 5)) continue;
    const ch = conv(p) ?? {};
    sum += 100 + (ch.physical ?? 0) + (ch.accuracy ?? 0) + (ch.maxAP ?? 0) + Math.sqrt(Math.max(ch.generalBattleExperience ?? 0, 0));
    const ids = p?.weapons ?? [ds?.items?.Items?.[p?.weaponItem]?.subCategory ?? 0];
    ids.forEach((id: number, slot: number) => {
      const w = ds?.weapons?.Weapons?.[id];
      if (!id || !w) return;
      const multiplier = ds?.weapons?.WeaponTypes?.[w.type]?.category === 5 ? 5 : 1;
      sum += Math.sqrt(Math.max(0, w.price * multiplier / (slot + 1)));
    });
  }
  return sum;
}
function playerVisualWarPower(gd: any): number {
  return Math.max(npcVisualWarPower(gd?.Caravans?.[0]?.People ?? [], gd?.ds ?? (globalThis as any).__c2?.ds), 1);
}

export class NpcCaravan {
  specialPurpose?: number;
  dlcDestination?: number;
  id: number;
  routePoints: number[] = [];
  pointIdx = 0;
  x = 0; y = 0;
  // t64 ③：原版车队速度=最慢步行者（3+agility/2）；spawn 时按 caravan_types 批次物化并随存档持久化，
  // 8+rand*8 仅是兜底默认（旧版臆造量级，多数情况下远快于原版 3.5-8 km/h）
  speedKmh = 8 + Math.random() * 8;
  /** t64 ③：视野/追击距离 px（原版 betweenCaravans<=noticeability*sight ⇔ 追击半径≈sqrt(notice*sight)） */
  sightRange = 160;
  /** 方案③ 模拟深度：原版 Caravan.category（0=玩家/1=遭遇/2,3=自由民/5=路线商队永久）；旧档恢复时按 routePoints 推断 */
  category = 1;
  /** 方案② 识别迷雾：车队可见性（原版 noticeability=pow(100+cargo+ΣpersonNoticeability,0.33)*20；150=兜底默认） */
  noticeability = 150;
  /** 方案② 识别迷雾：是否已识别（真名）；距离拉近后永久保持（原版仅 >400px 回收时重置） */
  identified = false;
  /** 方案② 识别迷雾：人数信息等级 0=未知/1=粗略(很多/一些/少数)/2=区间/3=精确 */
  menCountPhase = 0;
  /** 原版 Caravan.morale 基数（checkBehavior 强度比 ratio 的 morale/50；地图 NPC 士气未物化，取默认 50） */
  morale = 50;
  /** t64 ③：正在追玩家（chase 中）；脱离视野后清除 direction 回到路线寻路 */
  chasing = false;
  money = 300 + Math.floor(Math.random() * 2500);
  cargo = new Map<number, number>();
  inUse: Record<number,number> = {};
  defenders = 2 + Math.floor(Math.random() * 4);
  name = "";
  moving = true;
  direction: number | null = null; // 原版 direction 语义（0=北、顺时针）；null=走路线寻路
  route: number = 0;
  routePoint: number = 0;
  lastConsumption: number | null = null;
  points: NpcRoutePoint[] = [];
  type = 0; // caravan_types 索引（原版 Caravan.type；40=路线商队、6=Rovers…）
  faction = 0;
  aggressive = false;
  slavers = false; // 原版 Caravan.slavers（奴隶商车队）
  slavesHeld = 0; // 车上押送的奴隶数（category=4，战后可俘获）
  fearless = false; // 原版 Caravan.fearless：地图不可攻击（路线商队）
  squad: EnemySquad | null = null; // 物化后的遭遇车队人员（equipRandomCaravan 产物；null=战斗时再生成）
  /** ⑦a 敌方载具/驮畜（equipRandomCaravan transport 分支；战后存活即缴获进玩家车队） */
  transports: Array<any> = [];
  /** ⑦g 自由民车队等携带的真实成员（leave 释放的奴隶；仅地图展示/存档用） */
  people: Character[] = [];
  constructor(id: number, routePoints: number[], name: string) {
    this.id = id;
    this.routePoints = routePoints;
    this.name = name;
  }
  /** 与玩家(阵营 0)的成对关系。 */
  private relationToPlayer(): number {
    const gd = (globalThis as any).__c2?.shell?.gd;
    const rel = gd?.getFactionRelations ? gd.getFactionRelations(this.faction, 0) : 0;
    return typeof rel === "number" ? rel : 0;
  }
  /**
   * 是否敌对（用于显示 Attack 按钮 / 战斗立场判定）。
   * 注意：敌对 ≠ 会主动伏击（见 willAmbush），也 ≠ 不能交易（见 canTrade）——
   * 原版这三件事阈值各不相同，早期实现把它们合成一个 isHostile 是保真缺陷。
   */
  isHostile(): boolean {
    if (this.aggressive) return true;
    return this.relationToPlayer() < 0;
  }
  /**
   * 是否会主动伏击玩家。原版 MapMode.as:7881-7915 checkBehavior 是三重门控：
   *   :7889 `if(_loc6_ > -3) return 0`          ⇒ 关系 > -3 一律不攻击
   *   :7906 `if(param1.aggressive && ...)`      ⇒ 主动方必须带 aggressive 标志
   *   :7910 `if(param2.aggressive && ...)`      ⇒ 另一条路径要求「玩家侧 aggressive」，对 NPC→玩家不适用
   * 早期实现是 `aggressive || rel < 0`，缺 -3 阈值也缺 aggressive 门控，后果：
   *   ① type25(faction19)/type32(faction21) 基线 -50 但 aggressive=false，原版永不主动袭击，web 会伏击；
   *   ② 关系 -1/-2 就触发伏击，原版要 ≤ -3。
   * t64 ③ 升级为原版连续威胁度公式（SPEC §④ checkBehavior :7899-7912）：
   *   ratio = power1/power2 * morale/50（fearless ⇒ power1=∞）
   *   :7910 追玩家条件 = aggressive && ratio>0.5 && rel*ratio<-10
   * 替换旧的"aggressive && rel<=-3"布尔判定（缺强弱比，弱队也会无差别袭击）。
   */
  willAmbush(): boolean {
    if (!this.aggressive) return false;
    const rel = this.relationToPlayer();
    if (rel > -3) return false;
    const power1 = this.fearless ? Infinity : this.visualWarPower();
    const power2 = playerVisualWarPower((globalThis as any).__c2?.shell?.gd);
    const ratio = (power1 / Math.max(power2, 1)) * ((this.morale ?? 50) / 50);
    return ratio > 0.5 && rel * ratio < -10;
  }
  /** 本车队战力（原版 visualWarPower：Σ 100+sqrt(weapon.price×(cat5?5:1)/(slot+1))，fighter=cat<3||cat==5） */
  visualWarPower(): number {
    return npcVisualWarPower(this.squad ? (this.squad.people ?? []) : this.people, (globalThis as any).__c2?.ds);
  }
  /**
   * 是否可与玩家交易。原版 MapMode.as:7308 用 `getFactionRelations(0, faction) >= -2`，
   * 阈值与开战阈值(-3)不同：关系在 [-2, 0) 区间仍可做生意。
   * 早期实现用 `!isHostile()` 当交易门槛，等价于要求 >= 0，切断了「小冲突后修关系再交易」的回路。
   */
  canTrade(): boolean {
    return this.relationToPlayer() >= -2;
  }
}

// 遭遇/敌方车队人员规格（equipRandomCaravan 产物 → Battle.makeEnemyFromSpec）
export interface EnemyPersonSpec {
  name: string;
  faction: number;  // 阵营编号（0..23；= caravan_types[type].faction）
  weaponItem: number; // Items 数组索引（category 2）
  armorItem: number;  // Items 数组索引（category 5）
  /** Equipment represented both on this person and in squad cargo (legacy handoff). */
  cargoEquipment?: number[];
  basePhysical: number;
  baseAgility: number;
  baseAccuracy: number;
  baseIntelligence: number;
  _HP: number;
  maxHP: number;
  levelModifier: number;
  experienceModifier: number;
  age: number;      // 原版 Character.as:596 缺省 Rndm.integer(16,54)；参与四属性年龄惩罚，故必须落档
  gender?: number;
  portraitShirt?: number;
  portraitHair?: number;
  shirtColor?: { r: number; g: number; b: number; bc: number };
  pantsColor?: { r: number; g: number; b: number; bc: number };
  lipsColor?: { r: number; g: number; b: number; bc: number };
  eyesColor?: { r: number; g: number; b: number; bc: number };
  skinColor?: { r: number; g: number; b: number; bc: number };
  sleevesType?: number;
  // type33/34/36 专属发色（GameData.as:1955/:1976/:2009）。已生成，渲染层尚未消费。
  hairColor?: { r: number; g: number; b: number; bc: number };
  // type16 专属技能经验（GameData.as:1835-1836，各 5000+Rndm.random()*5000）。
  swordsExperience?: number;
  crossbowExperience?: number;
  // 全部 26 项技能经验 + generalBattleExperience（原版 Character.as:654-665，skillsList 26 条）：
  // 每项 = round(100 * Rndm.random() * experienceModifier)，general = round(500 * ... )。
  // 显式给定的（如 type16 的 swords/crossbow）经 Character.as:656 的 != null 分支覆盖随机值。
  // 战斗层命中率/伤害经 skillExp()/closeExp() 消费，故必须落档：不落档则敌人命中率退化为常量。
  skillExperience?: Record<string, number>;
  generalBattleExperience?: number;
}
export interface EnemySquad {
  type: number;
  faction: number;
  name: string; // 车队类型名（Texts.fetch(caravan_types[type].name)）
  people: EnemyPersonSpec[];
  money: number;
  slaves: number;
  /** ⑦a 敌方载具/驮畜（equipRandomCaravan ct.transport 分支产物；战后存活即缴获） */
  transports?: Array<any>;
  /** ⑦a 奴隶马车队随身奴隶（ct.transportSlaves 分支：category=4 真身；战后入俘获弹窗） */
  slavePeople?: Character[];
  /** ⑦b 敌方货物（ct.equipment 全部条目按 amount×(0.8+rand×0.4)×人数 聚合；战后 100% 进 loot） */
  cargoLoot?: Array<{ item: number; amount: number }>;
}

// 存档反序列化用的 squad 净化：把旧档（t6~t11 之间生成，属性上限修复前）的越界值收敛回原版不变量。
// 原版 Character.as:628-652 四属性只有 Math.min(...,10) 上限、无下限（年龄惩罚可压到 0/负数，照搬不加 Math.max）；
// Character.as:2958-2960 get maxHP() { return Math.max(physical * 20, 1); } ⇒ maxHP 由 physical 派生，天然 ≤200。
// 旧档 basePhysical 由已删除的 `8 + Math.random() * 6` 产生（8..14），maxHP 可达 280，且 _HP 与 maxHP 各自独立 roll。
export function sanitizeEnemyPersonSpec(p: EnemyPersonSpec): EnemyPersonSpec {
  const basePhysical = Math.min(Math.round(p.basePhysical ?? 0), 10);
  const maxHP = Math.max(basePhysical * 20, 1);
  return {
    ...p,
    basePhysical,
    baseAgility: Math.min(Math.round(p.baseAgility ?? 0), 10),
    baseAccuracy: Math.min(Math.round(p.baseAccuracy ?? 0), 10),
    baseIntelligence: Math.min(Math.round(p.baseIntelligence ?? 0), 10),
    maxHP,
    _HP: Math.max(Math.min(p._HP ?? maxHP, maxHP), 0),
  };
}
export function sanitizeEnemySquad(s: EnemySquad): EnemySquad {
  return { ...s, people: (s.people ?? []).map(sanitizeEnemyPersonSpec) };
}

export interface GameStartOptions {
  storyMode: boolean;
  difficulty: number;
  character: Record<string, any> | null;
}

export class GameData {
  static squareSize = 500;
  Time = 2509568400; // 游戏秒
  gameSpeed = 1;
  transportAsPassengers = false;
  pauseOnExitTown = false;
  interactWithFriendlyCaravans = true;
  distributeBatteries = true;
  advancedTrading = false;
  warnedAboutAdvancedTrading = false;
  get soundFXControl() { return isSoundFXOn(); }
  set soundFXControl(v: boolean) { setSoundFX(v); }
  get musicControl() { return isMusicOn(); }
  set musicControl(v: boolean) { setMusicOn(v); }
  doubleSpeed = 2;
  tripleSpeed = 4;
  mapCenterX = 0; mapCenterY = 0;
  mapScale = 1;
  sextantExperience = 0;
  lastSextantPos: number[] = [];
  lastSextantOffset = 0;
  lastSextantMeasurement = 0;
  Caravans: Caravan[] = [];
  Towns: Town[] = [];
  npcCaravans: NpcCaravan[] = [];
  Squares: any[] = [];
  difficulty = 1;
  storyMode = false;
  showTutorial = true;
  displayedTutorials: number[] = [];
  // 商队选单最后打开的标签页（原版 GameData.as L538 lastCaravanMenuCategory=2 → 默认人员页）；CaravanMenu.setCategory 切页时写回
  lastCaravanMenuCategory = 2;
  canBreakEconomy = false;
  onSetMode: ((mode: number, ...args: any[]) => void) | null = null;
  onNotify: ((text: string) => void) | null = null;
  autoSave = false;
  windSpeed = 5 + Math.random() * 20; // km/h
  windDir = Math.random() * Math.PI * 2;
  caravanMovedToday = false;
  transportCycleAcc = 0; // 动物周期累计（每 360 游戏秒=6 游戏小时一周期，对齐原版 cycleCounter）
  townCycleAcc = 0; // 城镇经济周期累计（每 360 游戏秒结算一次生产/消耗净额，对齐原版 town cycle）
  peopleCycleAcc = 0; // 玩家人物消耗周期累计（每 360 游戏秒：水/食物/饥渴/HP/体重/士气）
  // 战斗设置（对齐原版 GameData：autoCenter/showGrid/walkAnimationSpeed；soundFXControl 走 Sound 模块）
  autoCenter = true;        // 镜头跟随活动角色（本移植无滚动镜头，保留设置值）
  showGrid = true;          // 显示战斗网格
  walkAnimationSpeed = 1;   // 角色动画速度（1=正常 2=快速）

  // 风更新（对齐原版 MapMode.enterFrame：每帧 0.002 概率重掷 @25fps → 0.05*dt/秒）
  updateWind(dt?: number) {
    const p = dt !== undefined ? 0.05 * dt : 0.002;
    if (Math.random() < p) {
      this.windDir = Math.random() * Math.PI * 2;
      const shift = Math.sqrt(Math.random());
      if (Math.random() < 0.75) this.windSpeed = 20 - shift * 20;   // 弱风 0-20
      else this.windSpeed = 20 + shift * 40;                        // 强风 20-60
    }
  }
  __onDialogueEnd: (() => void) | null = null;
  __dialogueChar: number | null = null;
  __onEventDialogue: ((charId: number) => void) | null = null;
  __onEventEnterTown: ((townId: number) => void) | null = null;
  story: any = null; // 剧情状态（Shell 启动时注入 Story 实例）

  // —— 转译回调直接调 GD.xxx 的薄封装（原版 GameData 方法；实现由 Story 环境注入钩子）——
  cameFromMode = 1;
  adultContent = false;
  mapMode: any = {};
  __acceptQuest: ((q: number) => void) | null = null;
  __completeQuest: ((q: number) => void) | null = null;
  __failQuest: ((q: number) => void) | null = null;
  __executeMajorEvent: ((n: number) => void) | null = null;
  acceptQuest(q: number) { this.__acceptQuest?.(q); }
  completeQuest(q: number) { this.__completeQuest?.(q); }
  failQuest(q: number) { this.__failQuest?.(q); }
  executeMajorEvent(n: number) { this.__executeMajorEvent?.(n); }
  // —— 阵营关系（原版 get/set/affectFactionRelations 成对三角矩阵语义）——
  // 矩阵 = presets.faction_relations[0] 深拷贝（Story 构造时生成，此后原地改）。行 i 恰 i 个元素（row0 空）。
  // 原版 GameData.as:1507-1522 getFactionRelations(param1,param2=0,param3=false)：!param3 先 checkRevealedFactions；
  //   a==b/undefined → 0；a>b → m[a][b]，否则 m[b][a]。
  // 原版 GameData.as:1539-1576 affectFactionRelations：checkRevealedFactions → set(get+amount) → 传播循环
  //   （第三方阵营按旧关系比例联动，doNotAffectRelations 豁免）。
  private factionMatrix(): number[][] {
    const s = this.story as any;
    if (s && Array.isArray(s.factionRelations)) return s.factionRelations;
    const fresh = factionRelationsFromPresets(this.ds);
    if (s) s.factionRelations = fresh;
    return fresh;
  }
  getFactionRelations(a: number, b = 0, skipReveal = false): number {
    if (!skipReveal) this.checkRevealedFactions(a, b);
    if (a === b || a === undefined || b === undefined || a === null || b === null) return 0;
    const hi = a > b ? a : b, lo = a > b ? b : a;
    const row = this.factionMatrix()[hi];
    return typeof row?.[lo] === "number" ? row[lo] : 0;
  }
  affectSpecificReputation(who: number, amount: number) {
    if (this.story) this.story.specificReputations[who] = (this.story.specificReputations[who] ?? 0) + amount;
  }
  setFactionRelations(a: number, b: number, val: number) {
    if (a === b || a === undefined || b === undefined || a === null || b === null) return;
    const hi = a > b ? a : b, lo = a > b ? b : a;
    const m = this.factionMatrix();
    if (!m[hi]) m[hi] = [];
    m[hi][lo] = val;
  }
  affectFactionRelations(amount: number, a: number, b = 0) {
    if (a === b || a === undefined || a === null) return;
    this.checkRevealedFactions(a, b);
    this.setFactionRelations(a, b, this.getFactionRelations(a, b, true) + (amount ?? 0));
    // 传播循环（原版 GameData.as:1548-1575）：第三方阵营 k 按旧关系比例联动（doNotAffectRelations 豁免）
    const m = this.factionMatrix();
    const dnr = (this.ds?.presets?.do_not_affect_relations?.[0] ?? []) as Array<{ from: number; to: number }>;
    for (let k = 0; k < m.length; k++) {
      if (k === a || k === b) continue;
      let exempt = false;
      for (const r of dnr) {
        if (k === r.to && (a === r.from || b === r.from)) { exempt = true; break; }
      }
      if (exempt) continue;
      const ra = this.getFactionRelations(a, k, true);
      const rb = this.getFactionRelations(b, k, true);
      if (ra !== 0) this.setFactionRelations(b, k, rb + (amount ?? 0) * ra / 100);
      if (rb !== 0) this.setFactionRelations(a, k, ra + (amount ?? 0) * rb / 100);
    }
  }
  checkRevealedFactions(a: number, b: number) {
    if (a === 0 && b > 0) this.revealFaction(b);
    else if (b === 0 && a > 0) this.revealFaction(a);
  }
  // 已发现阵营（原版 GD.revealedFactions；Log Reputation 页只列已发现阵营）
  revealedFactions: number[] = [];
  // 导航路线（原版 GD.routeStart/routeEnd；NavigationScreen 用，地图上划线）
  routeStart: { x: number; y: number } | null = null;
  routeEnd: { x: number; y: number } | null = null;
  // 工作房每日已产量（原版 GD.producedToday；按配方下标索引，跨天重置）
  producedToday: Record<number, number> = {};
  resetProducedToday() {
    this.producedToday = {};
    for (let i = 0; i < workshopRecipes(this.ds).length; i++) this.producedToday[i] = 0;
  }
  revealFaction(faction: number) {
    if (faction > 0 && !this.revealedFactions.includes(faction)) this.revealedFactions.push(faction);
  }

  // —— equipRandomCaravan（原版 GameData.as:1701-2151 的 web 移植）——
  // 按 caravan_types[type] 生成一支遭遇车队的人员/武器/护甲/资金/奴隶。
  //  - 随机用 Math.random()（captain 架构决定：不移植 Rndm 像素流种子，见 TEAM-CARAVANTYPES-SPEC §3.4/§4）；
  //  - peopleLevel/peopleExperience 缺失默认 1（?? 1 非 ?? 0）；difficulty==1 各 ×0.8；difficulty==2 人数 ×1.3；
  //  - 武器抽取 probabilityRandom(weapons,"probability")：amount-only 条目 isNaN 永不中选（保留原版行为）；
  //  - 装备物化留 TODO（本方法每次调用即物化一支车队；spawnNpcCaravans 身份字段 + 读档守卫保证不重复生成）；
  equipRandomCaravan(type: number, fixedPeopleNum?: number): EnemySquad {
    const cts: any[] = this.ds?.presets?.caravan_types?.[0] ?? [];
    const ct = cts[type];
    const empty: EnemySquad = { type, faction: ct?.faction ?? 0, name: "", people: [], money: 0, slaves: 0 };
    if (!ct) return empty;
    const diffMult = this.difficulty === 2 ? 1.3 : 1; // _loc6_
    const count = (fixedPeopleNum != null && fixedPeopleNum > 0)
      ? Math.max(1, Math.round(fixedPeopleNum))
      : Math.max(1, Math.round((ct.averagePeopleNum ?? 1) * (0.5 + Math.random()) * diffMult));
    let levelMult = ct.peopleLevel === undefined ? 1 : ct.peopleLevel;
    let expMult = ct.peopleExperience === undefined ? 1 : ct.peopleExperience;
    if (this.difficulty === 1) { levelMult *= 0.8; expMult *= 0.8; }

    // 武器：round(totalWeaponsPercentage×count) 次加权抽取
    const weaponIds: number[] = [];
    const wpick = Math.round((ct.totalWeaponsPercentage ?? 0) * count);
    const weaponsArr: any[] = ct.weapons ?? [];
    for (let i = 0; i < wpick; i++) {
      const w = this.weightedPickWeapon(weaponsArr);
      if (w != null) weaponIds.push(w);
    }
    const separatelyGeneratedWeapons = weaponIds.length;
    // 护甲/装备（⑦b 原版 GameData.as:2028-2035）：ct.equipment **每一项**都
    // addCargo(item, round(amount×(0.8+rand×0.4)×peopleCount)) —— 衣物/附件/弹药同样进 Cargo；
    // 同时 category 2（武器）并入 weaponIds、category 5（护甲）并入 armorIds 供战斗分发。
    const items = this.ds?.items?.Items;
    const armorIds: number[] = [];
    const cargoLoot: Array<{ item: number; amount: number }> = [];
    for (const eq of ct.equipment ?? []) {
      const id = eq?.item;
      if (id == null || !items?.[id]) continue;
      const cat = items[id].category;
      const amt = Math.round((eq.amount ?? 0) * (0.8 + Math.random() * 0.4) * count);
      if (amt > 0) {
        const e = cargoLoot.find((c) => c.item === id);
        if (e) e.amount += amt; else cargoLoot.push({ item: id, amount: amt });
      }
      const target = cat === 2 ? weaponIds : cat === 5 ? armorIds : null;
      if (target) for (let i = 0; i < amt; i++) target.push(id);
    }
    // 原版 L2036-2048 清洗：Cargo 中 category==3（弹药）若没有任何武器匹配 .ammo==本弹药 type 则剔除。
    // 武器（People 分发后的 weaponIds）决定可用弹药口径 type 集合。
    {
      const ammoSubs = new Set<number>();
      for (const wid of weaponIds) {
        const it = items[wid];
        const wdef = it && this.ds?.weapons?.Weapons?.[it.subCategory];
        if (wdef && typeof wdef.ammo === "number") ammoSubs.add(wdef.ammo);
      }
      for (let i = cargoLoot.length - 1; i >= 0; i--) {
        const it = items[cargoLoot[i].item];
        if (it && it.category === 3 && !ammoSubs.has(this.ds?.weapons?.Ammo?.[it.subCategory]?.type)) cargoLoot.splice(i, 1);
      }
    }

    const typeName = this.textOf(ct.name) || "Raider"; // 车队类型名（替换硬编码 "(Raider)"）
    const faction = ct.faction ?? 0;
    const people: EnemyPersonSpec[] = [];
    for (let i = 0; i < count; i++) {
      // 属性推导：原版 Character.as:596-652（构造 Character 时 physical/agility/... 均未显式给值的分支）。
      // gender 先定（faction 2/7 强制 gender=1，见下方外观分支；此处必须与之一致，故先算出来复用）。
      const gender: number = (faction === 2 || faction === 7) ? 1 : (Math.random() < 0.5 ? 1 : 2);
      // age 缺省 Rndm.integer(16,54)（Character.as:596）
      const age = 16 + Math.floor(Math.random() * 39);
      // experienceModifier：必须用 expMult（缺省 1、difficulty 1 时 ×0.8），不是 age/30。
      // Character.as:604-611 确实有 `else _loc16_ = age / 30`，但那条分支从 equipRandomCaravan
      // 不可达：GameData.as:1746-1752 保证 _loc18_ 永远已定义（缺省 1），:2063 又无条件
      // `_loc4_.experienceModifier = _loc18_` ⇒ Character.as:604 的 != null 恒真。
      // 缺 peopleExperience 的 8 个 type {0,1,2,3,5,7,8,40} 原版取 1（difficulty 1 取 0.8）。
      const expModifier = expMult;
      // gender 系数（Character.as:612-621）：男 physical×1.2 / agility×0.8，女反之。
      const gP = gender === 1 ? 1.2 : 0.8;
      const gA = gender === 1 ? 0.8 : 1.2;
      const r47 = () => 4 + Math.floor(Math.random() * 4); // Rndm.integer(4,7) 闭区间均匀
      // type 专属显式属性（原版 GameData.as:1813-2061 的 15 处 type 分支里给 _loc4_.physical 等赋值）。
      // 关键语义（Character.as:622-652）：显式给值时走 `if(param1.physical != null) basePhysical = param1.physical;`
      // ⇒ **既不乘 levelModifier、也不乘 gender 系数、也不套 Math.min(...,10)**；未给的属性才走随机推导。
      // 故这里先算显式值，随机推导只在对应属性缺席时执行。
      const explicit = this.typeExplicitStats(type);
      const basePhysical = explicit.physical !== undefined
        ? explicit.physical
        : Math.min(Math.round((r47() - Math.abs(age - 20) / 15) * levelMult * gP), 10);
      const baseAgility = explicit.agility !== undefined
        ? explicit.agility
        : Math.min(Math.round((r47() - Math.abs(age - 18) / 15) * levelMult * gA), 10);
      // type16 的 accuracy/intelligence 由 agility+physical 余量派生（原版 :1832-1834），故在此之后算。
      const derived = explicit.deriveFrom24 ? Math.round(24 - baseAgility - basePhysical) : undefined;
      const baseAccuracy = explicit.accuracy !== undefined
        ? explicit.accuracy
        : derived !== undefined
          ? Math.round(derived * 0.7)
          : Math.min(Math.round((r47() - Math.abs(age - 25) / 20) * levelMult), 10);
      const baseIntelligence = explicit.intelligence !== undefined
        ? explicit.intelligence
        : derived !== undefined
          ? Math.max(Math.round(derived * 0.3), 2)
          : Math.min(Math.round((r47() + Math.min((age - 15) / 15, 1.7)) * levelMult), 10);
      // maxHP = physical×20（Character.as:2958-2960 get maxHP）；显式 physical 时同样按最终值算。
      const maxHP = Math.max(basePhysical * 20, 1);
      // 原版 Character.as:654-664：遍历 skillsList，每项技能经验 = round(100 * Rndm.random() * experienceModifier)；
      // :656 的 `param1[...] != null` 分支让显式给定值（type16 的 swords/crossbow）覆盖随机值。
      // :665 generalBattleExperience = round(500 * Rndm.random() * experienceModifier)（系数 500 而非 100）。
      // 每项独立 roll —— 不可共用一个随机数，否则同一敌人所有技能等比例相关。
      const skillExperience: Record<string, number> = {};
      for (const s of Character.skillsList) {
        skillExperience[s.experience] = Math.round(100 * Math.random() * expModifier);
      }
      // 显式技能经验覆盖（Character.as:656 的 != null 分支）
      for (const [k, v] of Object.entries(explicit.skills ?? {})) {
        skillExperience[k] = v;
      }
      const generalBattleExperience = Math.round(500 * Math.random() * expModifier);
      const pers: any = {
        skillExperience,
        generalBattleExperience,
        name: typeName,
        faction,
        weaponItem: 0, armorItem: 0,
        basePhysical,
        baseAgility,
        baseAccuracy,
        baseIntelligence,
        _HP: maxHP, maxHP,
        age,
        levelModifier: levelMult, experienceModifier: expModifier,
        ...(explicit.skills ?? {}),
        // GameData.as:1763-2061：type/faction 专属肖像和服装。
        ...(type === 6 ? { portraitShirt: 0 } : {}),
        ...(faction === 2 ? {
          ...(Math.random() < 0.5 ? { portraitShirt: 0 } : {}),
          ...(Math.random() < 0.4 ? { portraitHair: 17 } : {}),
          gender: 1,
        } : {}),
        ...(faction === 7 ? (() => {
          const pants = Math.round(100 + Math.random() * 100);
          return {
            gender: 1,
            shirtColor: { r: 200, g: 200, b: 200, bc: 1 },
            pantsColor: { r: pants, g: pants, b: pants, bc: 1 },
            sleevesType: 3,
          };
        })() : {}),
        ...(faction === 8 ? {
          shirtColor: { r: 0, g: 0, b: 0, bc: 1 },
          pantsColor: { r: 0, g: 0, b: 0, bc: 1 },
          portraitShirt: 1,
        } : {}),
        ...this.typeAppearance(type),
      };
      // ⑦h 渲染层消费：原版 Character 构造为每人生成默认 hairColor/pantsColor/shirtColor
      // （缺省未给时；faction/type 专属色的分支值保留）。skinColor 由肖像层 race 兜底。
      if (pers.shirtColor === undefined) pers.shirtColor = randomShirtColor();
      if (pers.pantsColor === undefined) pers.pantsColor = randomPantsColor();
      if (pers.hairColor === undefined) pers.hairColor = randomHairColor(age);
      // ⑦h 战场纸娃娃 skinColor（原版 Character 构造按 race 生成；此处以同式 race 兜底）
      if (pers.skinColor === undefined) {
        const race = Math.random();
        let h = 25 - Math.abs(race - 0.5) * 20, s = 20 + Math.random() * 15, v = Math.min(90 - Math.random() * 45, 100);
        pers.skinColor = hsvColor(h, s, v, 1);
      }
      people.push(pers);
    }
    // 分发（对齐 distributeWeapons/distributeArmor：按人员顺序 FIFO，每人至多 1 把武器/1 件护甲）
    for (let i = 0; i < weaponIds.length && i < people.length; i++) people[i].weaponItem = weaponIds[i];
    for (let i = 0; i < armorIds.length && i < people.length; i++) people[i].armorItem = armorIds[i];
    for (const [i, person] of people.entries()) {
      person.cargoEquipment = [];
      if (i >= separatelyGeneratedWeapons && person.weaponItem) person.cargoEquipment.push(person.weaponItem);
      if (person.armorItem) person.cargoEquipment.push(person.armorItem);
    }

    // ⑦a 载具/驮畜（原版 GameData.as:2094-2116）：ct.transport 每 entry
    // amount×(exactPerPerson?peopleCount : 0.8+rand×0.4) 轮取整生成 TransportUnit，age=maxAge×(0.3+rand×0.3)。
    const transports: Array<any> = [];
    if (Array.isArray(ct.transport)) {
      for (const entry of ct.transport) {
        let n = entry?.exactPerPerson
          ? Math.round((entry.amount ?? 0) * count)
          : Math.round((entry.amount ?? 0) * (0.8 + Math.random() * 0.4));
        for (let i = 0; i < n; i++) {
          const tr = makeTransportUnit(entry.type, this.ds, transports.length);
          tr.age = Math.round(tr.maxAge * (0.3 + Math.random() * 0.3));
          transports.push(tr);
        }
      }
    }
    // ⑦a/⑦f 奴隶马车队随身奴隶（原版 L2117-2120）：round(rand×transportSlaves×2) 名 category=4 真身；
    // 战后 onWin 归入俘获弹窗（faction 覆写为车队 faction、oldFaction 随人存档）。
    const slavePeople: Character[] = [];
    if (ct.transportSlaves > 0) {
      const n = Math.round(Math.random() * ct.transportSlaves * 2);
      for (let i = 0; i < n; i++) {
        const s = makeRandomCharacter(this.ds, { category: 4, faction });
        slavePeople.push(s);
      }
    }

    const money = ct.money === undefined ? 0 : Math.round(ct.money * (0.8 + Math.random() * 0.4));
    const slaves = ct.transportSlaves > 0 ? Math.round(Math.random() * ct.transportSlaves * 2) : 0;
    return { type, faction, name: typeName, people, money, slaves, transports, slavePeople, cargoLoot };
  }

  /**
   * 原版 GameData.as:2153-2216 randomBrightColor()：单次 Rndm.random() 按 7 段阈值返回固定色。
   * 注意是**一次** roll 决定整个颜色，不是三通道各 roll。
   */
  private randomBrightColor(): { r: number; g: number; b: number; bc: number } {
    const v = Math.random();
    if (v > 0.85) return { r: 180, g: 40, b: 40, bc: 1 };
    if (v > 0.7) return { r: 128, g: 180, b: 60, bc: 1 };
    if (v > 0.55) return { r: 40, g: 120, b: 120, bc: 1 };
    if (v > 0.4) return { r: 40, g: 40, b: 120, bc: 1 };
    if (v > 0.25) return { r: 120, g: 40, b: 120, bc: 1 };
    if (v > 0.1) return { r: 180, g: 180, b: 40, bc: 1 };
    return { r: 128, g: 96, b: 40, bc: 1 };
  }

  /**
   * type 专属**显式属性**（原版 GameData.as 的 type 分支里给 _loc4_.physical/agility/accuracy 赋值）。
   * 显式值绕过 levelModifier / gender 系数 / Math.min(...,10)（Character.as:622-652 的 != null 分支）。
   *
   * 两种 Rndm 写法分布不同，**原版就混用，逐处照抄不可统一**：
   *   · `Rndm.integer(0,2)`（Rndm.as = Math.floor(float(a,b+1))）⇒ {0,1,2} 各 1/3   → type 29/30
   *   · `Math.round(Rndm.random()*2)`                            ⇒ 0.25/0.5/0.25   → type 16/36/37/38/39
   */
  private typeExplicitStats(type: number): {
    physical?: number; agility?: number; accuracy?: number; intelligence?: number;
    deriveFrom24?: boolean; skills?: Record<string, number>;
  } {
    const int02 = () => Math.floor(Math.random() * 3);      // Rndm.integer(0,2)
    const rnd02 = () => Math.round(Math.random() * 2);      // Math.round(Rndm.random()*2)
    switch (type) {
      // :1813-1836 type16：显式给全四属性（accuracy/intelligence 由 24 余量派生）+ 两条技能经验
      case 16: return {
        agility: 8 + rnd02(),
        physical: 4 + Math.round(Math.random() * 3),        // 注意是 ×3 不是 ×2
        deriveFrom24: true,
        skills: {
          swordsExperience: 5000 + Math.random() * 5000,
          crossbowExperience: 5000 + Math.random() * 5000,
        },
      };
      case 29: return { physical: 8 + int02() };            // :1919
      case 30: return { physical: 8 + int02() };            // :1937
      case 34: return { physical: 10 };                     // :1982（常量）
      case 36: return { accuracy: 8 + rnd02() };            // :2015
      case 37: return { physical: 8 + rnd02() };            // :2024
      case 38: return { physical: 8 + rnd02() };            // :2042
      case 39: return { physical: 8 + rnd02() };            // :2060
      default: return {};
    }
  }

  /**
   * type 专属**外观**（原版 GameData.as:1838-2060 的纯外观分支 + 改战力分支里附带的外观字段）。
   * 渲染消费情况：shirtColor/portraitHair/portraitShirt 被 web/src/game/Portrait.ts:106/:115/:124 消费；
   * **pantsColor / sleevesType / hairColor 已生成但渲染层尚未消费**（显式记录，非静默丢弃）。
   */
  private typeAppearance(type: number): Record<string, any> {
    const solid = (r: number, g: number, b: number) => ({ r, g, b, bc: 1 });
    switch (type) {
      case 16: return { // :1815-1829
        shirtColor: solid(0, 0, 0), pantsColor: solid(0, 0, 0),
        gender: 1, portraitShirt: 1, sleevesType: 5,
      };
      case 18: return { portraitShirt: 1, shirtColor: solid(255, 255, 255), pantsColor: solid(255, 255, 255) }; // :1838
      case 19: return { shirtColor: solid(90, 90, 90), pantsColor: solid(90, 90, 90), portraitShirt: 1, sleevesType: 5 };   // :1854-1869
      case 20: return { shirtColor: solid(80, 60, 20), pantsColor: solid(80, 60, 20), portraitShirt: 1, sleevesType: 5 };  // :1871-1886
      case 21: return { shirtColor: solid(15, 15, 15), pantsColor: solid(15, 15, 15), portraitShirt: 1, sleevesType: 5 };  // :1888-1903
      case 29: return { shirtColor: solid(150, 140, 130), pantsColor: solid(150, 140, 130), portraitShirt: 1, sleevesType: 5 }; // :1905-1921
      case 30: return { shirtColor: solid(20, 30, 64), pantsColor: solid(20, 30, 64), portraitShirt: 1, sleevesType: 5 }; // :1925-1939
      case 33: return { shirtColor: solid(20, 80, 30), pantsColor: solid(20, 80, 30), hairColor: solid(20, 80, 30) };     // :1943-1960
      case 34: return { shirtColor: solid(255, 255, 255), pantsColor: solid(20, 20, 20), hairColor: solid(0, 0, 0) };     // :1964-1981
      case 35: return { portraitHair: Math.random() < 0.5 ? 17 : 19 };                                         // :1986-1993
      case 36: return { shirtColor: solid(255, 255, 255), pantsColor: solid(60, 60, 60), hairColor: solid(0, 0, 0) };     // :1997-2014
      case 37: {                                                                                               // :2019-2023
        const shirt = this.randomBrightColor();
        const pants = this.randomBrightColor();
        return {
          shirtColor: shirt,
          // 原版把 pantsColor 三通道各除 2 后取整（:2021-2023）
          pantsColor: { r: Math.round(pants.r / 2), g: Math.round(pants.g / 2), b: Math.round(pants.b / 2), bc: 1 },
        };
      }
      case 38: return { shirtColor: solid(80, 60, 30), pantsColor: solid(80, 60, 30), portraitShirt: 1, sleevesType: 5 }; // :2028-2041
      case 39: return { shirtColor: solid(120, 120, 120), pantsColor: solid(120, 120, 120), portraitShirt: 1, sleevesType: 5 }; // :2046-2059
      default: return {};
    }
  }

  // 小写 probabilityRandom（加权抽 1 件）：weight=arr[i].probability，!isNaN 才累加；累加>=r 返回 item，否则 null
  private weightedPickWeapon(arr: any[]): number | null {
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < arr.length; i++) {
      const w = arr[i]?.probability;
      if (typeof w === "number" && !isNaN(w)) {
        acc += w;
        if (acc >= r) return arr[i]?.item ?? null;
      }
    }
    return null;
  }

  get Story() { return this.story; }

  // —— 已知价格记录（原版 GD.knownPrices + addKnownPrice；Log 页价格表数据源）——
  knownPrices: Array<{ item: number; town: number; location?: number; buyTime: number; sellTime: number; buyPrice: number; sellPrice: number }> = [];
  addKnownPrice(type: number, partner: any, shop: any, price: number, isPartnerSide: boolean) {
    const t = partner instanceof Town ? partner.id : -1;
    const location = partner instanceof Town ? partner.locations.indexOf(shop) : -1;
    let e = this.knownPrices.find((k) => k.item === type && k.town === t && (k.location ?? -1) === location);
    if (!e) { e = { item: type, town: t, location, buyTime: -1, sellTime: -1, buyPrice: 0, sellPrice: 0 }; this.knownPrices.push(e); }
    if (isPartnerSide) { e.buyTime = this.Time; e.buyPrice = price; } else { e.sellTime = this.Time; e.sellPrice = price; }
  }
  // 原版 GD.globalItemPrice：物品全局均价（车队伙伴定价兜底）
  globalItemPrice(type: number): number {
    const getter = (globalThis as any).__c2GetItemData as ((id: number) => any) | undefined;
    return getter ? (getter(type)?.price ?? 1) : 1;
  }

  // —— 奴隶机制（原版 GameData.enslaveAPerson L13384 / freeASlave L13400）——
  static averageSlavePrice = 5000;
  enslaveAPerson(person: any = null) {
    // 名声 7（奴隶主名声）：原版 <0 置 5，否则 +5
    const s = this.story;
    if (s) {
      s.specificReputations = s.specificReputations ?? {};
      if ((s.specificReputations[7] ?? 0) < 0) s.specificReputations[7] = 5;
      else s.specificReputations[7] = (s.specificReputations[7] ?? 0) + 5;
    }
    if (person) person.enslavedAt = this.Time;
  }
  freeASlave(person: any) {
    const s = this.story;
    if (s) {
      s.specificReputations = s.specificReputations ?? {};
      const quickFree = person && person.enslavedAt !== undefined && this.Time - person.enslavedAt < 10800;
      s.specificReputations[7] = (s.specificReputations[7] ?? 0) + (quickFree ? -7 : -1);
      if ((s.specificReputations[7] ?? 0) <= 0) {
        const stillSlaves = this.Caravans[0]?.People?.some((p: any) => p !== person && p.category === 4);
        if (stillSlaves) s.specificReputations[7] = 1;
      }
    }
  }

  constructor(public ds: DataStore, opts: GameStartOptions) {
    ds.runtime?.events.emit("world:construct", { opts, ds, world: this });
    this.difficulty = opts.difficulty;
    this.storyMode = opts.storyMode;
    // 玩家车队
    const start = ds.presets.start_positions?.[0] ?? { x: -10000, y: -900, direction: 0, moving: true };
    const c = new Caravan();
    c.x = start.x; c.y = start.y;
    c.direction = start.direction ?? 0;
    c.moving = start.moving ?? false;
    if (opts.character) c.addPerson(opts.character);
    else c.addPerson({ age: 30, gender: 1, eyeSockets: 1 });
    c.People[0].category = 1;
    c.People[0].neverPanic = true;
    c.People[0].weight = c.People[0].idealWeight;
    c.category = 0;
    this.Caravans[0] = c;
    // 城镇
    const tp = ds.presets.town_presets?.[0] ?? [];
    for (let i = 0; i < tp.length; i++) {
      // Independently enabled DLCs may leave gaps in the original numeric IDs.
      const preset = tp[i] ?? { name: 0, x: 0, y: 0, locations: [], population: 0 };
      const t = new Town(i, preset, ds);
      this.Towns[i] = t;
      t.difficulty = this.difficulty;
      // GameData.as:771 / setLocationsVisibility: difficulty and mode are world rules.
      if (this.difficulty === 1) for (const person of t.people ?? []) person.salaryCoefficient *= .7;
      if (!this.storyMode) {
        if (preset.storyOnly) t.active = false;
        for (const loc of t.locations) if (loc.category === 3) loc.visible = false;
      }
      if (!tp[i]) { t.active = false; continue; }
      if (i === 34 || i === 68) t.active = false;
      this.setSquareValue(Math.floor(t.x / GameData.squareSize), Math.floor(t.y / GameData.squareSize), "town", i);
    }
    // AdvancedWeaponry.onGameInit: augment live assortment only, after initial stock.
    // Town instances are rebuilt on load, so this never stacks onto saved assortment.
    for (const addition of ds.gamedata.modTownAssortments ?? []) {
      const location = this.Towns[addition.town]?.locations[addition.location];
      if (location) (location.assortment ??= []).push({...addition.entry});
    }
    // Original DLC onGameInit: constructor-only grants. Save loading subsequently
    // restores playersStorage, so revisiting a location never grants these again.
    for(const entries of Object.values(ds.gamedata.originalDlcStock??{}) as any[][]) {
      for(const entry of entries){const town=this.Towns[entry.town];if(town)town.addToStock(entry.item,entry.amount,town.playersStorage);}
    }
    this.canBreakEconomy=!!ds.gamedata.originalDlcFeatures?.['industrial-magnate'];
    this.mapCenterX = c.x;
    this.mapCenterY = c.y;
    // 初始货物（对齐 startNewGame）
    c.addCargo(65, 2);
    c.addCargo(1, 2);
    if (!this.storyMode) {
      // Caravaneer2.as:947-992: survival start, facilities and exclusive shop assortments.
      c.x = -12600; c.y = 3700;
      this.mapCenterX = c.x; this.mapCenterY = c.y;
      const extra = [[23,2,166,.3],[23,2,229,.5],[27,1,166,.5],[27,1,229,.5],[36,3,206,.5],[40,2,206,.3],[5,3,207,.4]];
      for (const [townId, locId, item, amount] of extra) {
        const loc = this.Towns[townId]?.locations[locId];
        if (loc) loc.assortment = [...(loc.assortment ?? []), {item, amount}];
      }
      const market = this.Towns[19]?.locations[0];
      if (market) market.visible = true;
      // 佣兵模式（原版 startNewGame mode 2）
      c.money = 150000;
      c.addCargo(136, 1);
      c.addCargo(128, 1);
      c.addCargo(130, 42);
    }
    // Caravaneer2.startNewGame: auto-equip the initial loadout in both modes.
    c.distributeWeapons(); c.distributeAmmo(); c.distributeArmor(); c.distributeTransport();
    // Story quest 1 rewards remain in acceptQuest(1), never pre-granted here.

  }

  setSquareValue(x: number, y: number, kind: string, val: any) {
    if (!this.Squares[x]) this.Squares[x] = [];
    if (!this.Squares[x][y]) this.Squares[x][y] = {};
    const sq = this.Squares[x][y];
    if (!sq[kind]) sq[kind] = [];
    if (!sq[kind].includes(val)) sq[kind].push(val);
  }

  getSquareTowns(x: number, y: number): number[] {
    return Array.isArray(this.Squares[x]?.[y]?.town) ? this.Squares[x][y].town : [];
  }

  setMode(mode: number, ...args: any[]) { this.ds.runtime?.events.emit("world:mode", { world: this, mode, args }); this.onSetMode?.(mode, ...args); }

  // GameData.as 13533–13578: materialise the route roster, mounts, carts and initial equipment.
  spawnNpcCaravans(ds: any) {
    if (this.npcCaravans.length > 0) return;
    const routes: any[] = ds.presets?.caravan_routes?.[0] ?? [];
    for (const [i, route] of routes.entries()) {
      if (route.onInit === false || !route.points?.length) continue;
      const points: number[] = route.points.map((p: any) => p.town), town = this.Towns[points[0]];
      if (!town) continue;
      const npc = new NpcCaravan(i, points, this.textOf(6792) || "Caravan");
      this.applyCaravanIdentity(npc, 40);
      npc.category = 5; npc.fearless = true; npc.route = i;
      npc.points = JSON.parse(JSON.stringify(route.points));
      npc.x = town.x; npc.y = town.y;
      const size = Math.max(0, Math.floor(route.size ?? 0));
      npc.money = size * 100000;
      this.materializeNpcRoute(npc,route);
      this.npcCaravans.push(npc);
      this.npcTradeAtTown(npc,ds,{Economy});
      this.advanceNpcRoute(npc);
    }
  }

  materializeNpcRoute(npc: NpcCaravan, route: any, preserveCargo = false) {
    const ds=this.ds, size=Math.max(0,Math.floor(route.size??0));
    const view = new Caravan(); view.category = 5; view.moving = true; view.money = npc.money;
    for (let j = 0; j < size; j++) {
      // Route people use Character({experienceModifier:3}), independent of difficulty.
      const age = 16 + Math.floor(Math.random() * 39), gender = Math.random() < .3 ? 2 : 1;
      const roll = () => 4 + Math.floor(Math.random() * 4);
      const physical = Math.min(Math.round((roll() - Math.abs(age - 20) / 15) * (gender === 1 ? 1.2 : .8)), 10);
      const Height = 150 + Math.max(physical,1) * (3 + Math.random() * 4);
      const idealWeight = Height - 100 - (Height - 150) / (gender === 1 ? 4 : 2);
      const person = new Character({name:npc.name, category:2, age, gender, basePhysical:physical,
        baseAgility:Math.min(Math.round((roll() - Math.abs(age - 18) / 15) * (gender === 1 ? .8 : 1.2)),10),
        baseAccuracy:Math.min(Math.round(roll() - Math.abs(age - 25) / 20),10),
        baseIntelligence:Math.min(Math.round(roll() + Math.min((age - 15) / 15,1.7)),10),
        Height, idealWeight, _weight:idealWeight * (.7 + Math.random() * .4),
        generalBattleExperience:Math.round(1500 * Math.random())});
      for (const skill of Character.skillsList) (person as any)[skill.experience] = Math.round(300 * Math.random());
      person._HP = person.maxHP; person.recalculateSalary();
      view.People.push(person);
      view.transports.push(makeTransportUnit(9,ds,j*2),makeTransportUnit(10,ds,j*2+1));
    }
    if(preserveCargo)view.cargo=new Map(npc.cargo);
    const addInitial=(id:number,amount:number)=>view.addCargo(id,Math.max(0,amount-(preserveCargo?view.cargoAmount(id):0)));
    for (const [id,amount] of [[200,size],[120,size],[121,size*40],[168,4],[169,Math.round(size/4)]]) addInitial(id,amount);
    for (const e of route.extraEquipment ?? []) addInitial(e.type,e.amount);
    view.distributeWeapons(); view.distributeArmor(); view.distributeAmmo(); view.distributeTransport();
    npc.people = view.People; npc.transports = view.transports; npc.cargo = view.cargo; npc.inUse = view.inUse;
    npc.defenders = npc.people.length; npc.speedKmh = view.speedKmh; npc.noticeability = view.noticeability;
  }

  private advanceNpcRoute(npc: NpcCaravan) {
    const count = npc.routePoints.length;
    for (let offset = 1; offset < count; offset++) {
      const next = (npc.pointIdx + offset) % count, town = this.Towns[npc.routePoints[next]];
      if (town && town.active) {
        npc.pointIdx = npc.routePoint = next;
        // 原版 GameData.directCaravanToTown：0=北、顺时针，路线切换目标时立即更新方向。
        npc.direction = Math.atan2(town.x - npc.x, -(town.y - npc.y));
        npc.moving = true;
        return;
      }
    }
    // No other active destination: park instead of repeatedly trading at the same town.
    npc.moving = false;
  }

  moveNpcRoute(npc: NpcCaravan, dt: number, econ: any) {
    if (!npc.moving || this.gameSpeed <= 0 || dt <= 0) return;
    const step = Math.max(0,npc.speedKmh / 12 * 4 * 25 * this.gameSpeed * dt);
    const town = this.Towns[npc.routePoints[npc.pointIdx]];
    if (!town) { this.advanceNpcRoute(npc); return; }
    if (!town.active) { this.advanceNpcRoute(npc); return; }
    const dx = town.x-npc.x, dy = town.y-npc.y, distance = Math.hypot(dx,dy);
    // 对应原版 directCaravanToTown 的 CalcRevYAngle。direction 是显示和朝向数据，
    // 不能再被用作“脱离路线直行”的哨兵，否则读档后的路线商队会永远错过站点。
    if (distance > 0) npc.direction = Math.atan2(dx,-dy);
    if (distance > Math.max(step,12)) {
      npc.x += dx/distance*step; npc.y += dy/distance*step; return;
    }
    npc.x = town.x; npc.y = town.y;
    this.npcTradeAtTown(npc,this.ds,econ);
    this.advanceNpcRoute(npc);
  }

  // 主线固定刷新（原版 GameData.as L3529-3539）：第一次离开碉堡(镇15)回地图时，
  // 在 碉堡(-10000,-1000)→希罗斯镇(-9950,-1300) 之间生成 1 队 Rovers 流浪者
  // （caravan_types[6]：aggressive、2 人、faction 6、direction=π 正南），仅一次
  spawnRovers() {
    const s = this.story;
    if (!s) return;
    const exited = typeof s.get === "function" ? !!s.get("exitedBunker") : !!(s as any).exitedBunker;
    if (exited) return;
    if (typeof s.set === "function") s.set("exitedBunker", true);
    else (s as any).exitedBunker = true;
    const t15 = this.Towns[15];
    if (!t15) return;
    let maxId = 0;
    for (const n of this.npcCaravans) if (n.id > maxId) maxId = n.id;
    // ⑦c 身份从 caravan_types[6] 派生（aggressive/faction/name/战力），固定 2 人（原版 equipRandomCaravan(caravan,2)）
    const rovers = this.newMapNpcCaravan(6, t15.x, t15.y - 300, { defenders: 2, direction: Math.PI });
    rovers.id = maxId + 1;
    rovers.money = 5;            // 原版 Rovers money=5
    this.npcCaravans.push(rovers);
  }

  // ---------- ⑦c 车队身份从 caravan_types[type] 派生（原版 Caravan.as 构造 L224-430） ----------
  // aggressive/name(Texts.fetch)/slavers/faction 直接取 Presets.CaravanTypes[type]。
  caravanTypeOf(type: number): any {
    const cts: any[] = this.ds?.presets?.caravan_types?.[0] ?? [];
    return cts[type] ?? null;
  }
  applyCaravanIdentity(npc: any, type: number): any {
    const ct = this.caravanTypeOf(type);
    const cts: any[] = this.ds?.presets?.caravan_types?.[0] ?? [];
    npc.type = type;
    if (ct) {
      npc.faction = ct.faction ?? 0;
      npc.aggressive = !!ct.aggressive;
      npc.slavers = !!ct.slavers;
      npc.fearless = !!ct.fearless;
      if (ct.name != null) npc.name = this.textOf(ct.name) || npc.name;
      if (ct.slavers) {
        // 车上押送的奴隶数（= transportSlaves 派生；equipRandomCaravan 的 slavePeople 有真实名单）
        npc.slavesHeld = ct.transportSlaves > 0 ? Math.round(Math.random() * ct.transportSlaves * 2) : 0;
      } else {
        npc.slavesHeld = 0;
      }
      void cts;
    }
    return npc;
  }
  // t64 ③：按 caravan_types[type] 的 People 批次物化速度（min over 3+agility/2 = 最慢步行者）。
  // 与 equipRandomCaravan 同一套年龄/性别/level 随机推导（只 roll agility），同分布下的大样本近似。
  npcSpeedKmhForType(type: number, count: number): number {
    const ct = this.caravanTypeOf(type);
    if (!ct || count <= 0) return 8;
    const faction = ct.faction ?? 0;
    const levelMult = ct.peopleLevel === undefined ? 1 : ct.peopleLevel;
    const explicit = this.typeExplicitStats(type);
    let s = Infinity;
    for (let i = 0; i < count; i++) {
      const gender: number = (faction === 2 || faction === 7) ? 1 : (Math.random() < 0.5 ? 1 : 2);
      const age = 16 + Math.floor(Math.random() * 39);
      const gA = gender === 1 ? 0.8 : 1.2;
      const ag = explicit.agility !== undefined
        ? explicit.agility
        : Math.min(Math.round(((4 + Math.floor(Math.random() * 4)) - Math.abs(age - 18) / 15) * levelMult * gA), 10);
      const ps = 3 + ag / 2;
      if (ps < s) s = ps;
    }
    return s === Infinity ? 8 : s;
  }
  // 方案② 识别迷雾：按 caravan_types[type] 的 People 批次近似物化可见性（与 npcSpeedKmhForType 同套 roll，
  // 大样本近似）。原版 noticeability = pow(100 + totalCargo + ΣpersonNoticeability, 0.33) * 20；
  // personNoticeability = max(physical*10 - agility*5, 1) / pow(exp, 0.1)；此处无 cargo 重量，仅人数项，偏差可接受。
  npcNoticeabilityForType(type: number, count: number): number {
    const ct = this.caravanTypeOf(type);
    if (!ct || count <= 0) return 150;
    const faction = ct.faction ?? 0;
    const levelMult = ct.peopleLevel === undefined ? 1 : ct.peopleLevel;
    const expm = Math.max(ct.peopleExperience === undefined ? 1 : ct.peopleExperience, 0.01);
    const explicit = this.typeExplicitStats(type);
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const gender: number = (faction === 2 || faction === 7) ? 1 : (Math.random() < 0.5 ? 1 : 2);
      const age = 16 + Math.floor(Math.random() * 39);
      const gA = gender === 1 ? 0.8 : 1.2;
      const phys = explicit.physical !== undefined
        ? explicit.physical
        : Math.min(Math.round((5 + Math.floor(Math.random() * 5) - Math.abs(age - 18) / 30) * levelMult * gA), 10);
      const agi = explicit.agility !== undefined
        ? explicit.agility
        : Math.min(Math.round(((4 + Math.floor(Math.random() * 4)) - Math.abs(age - 18) / 15) * levelMult * gA), 10);
      sum += Math.max(phys * 10 - agi * 5, 1) / Math.pow(expm, 0.1);
    }
    return Math.pow(Math.max(100 + sum, 1), 0.33) * 20;
  }
  // 地图新车队（遭遇刷怪/剧情共用）：身份 + 物化 squad（含 ⑦a 载具/奴隶 + ⑦b 货物）
  newMapNpcCaravan(type: number, x: number, y: number, opts: { defenders?: number; direction?: number | null; moving?: boolean; squad?: EnemySquad | null } = {}): NpcCaravan {
    let maxId = 0;
    for (const n of this.npcCaravans) if (n.id > maxId) maxId = n.id;
    const ct = this.caravanTypeOf(type);
    const npc = new NpcCaravan(maxId + 1, [], ct?.name != null ? (this.textOf(ct.name) || "Caravan") : "Caravan");
    this.applyCaravanIdentity(npc, type);
    npc.x = x; npc.y = y;
    npc.direction = opts.direction !== undefined ? opts.direction : null;
    npc.moving = opts.moving ?? true;
    const squad = opts.squad ?? this.equipRandomCaravan(type, opts.defenders);
    npc.squad = squad;
    npc.defenders = squad.people.length;
    // money：equipRandomCaravan 已按 ct.money×(0.8+rand×0.4) 生成；Rovers 等剧情再覆写
    if ((npc.money === 0) && typeof squad.money === "number") npc.money = squad.money;
    if (squad.transports) npc.transports = squad.transports;
    if (squad.cargoLoot) {
      for (const c of squad.cargoLoot) npc.cargo.set(c.item, (npc.cargo.get(c.item) ?? 0) + c.amount);
    }
    // t64 ③：速度/视野按物化 squad 推导——速度=最慢步行者(3+agility/2)、追击半径=sqrt(notice*sight)
    if (squad && squad.people && squad.people.length) {
      npc.speedKmh = npcSpeedKmhFromPeople(squad.people);
      npc.sightRange = npcChaseRangeFromPeople(squad.people);
      npc.noticeability = npcNoticeabilityFromPeople(squad.people); // 方案② 识别迷雾：真物化可见性
    }
    return npc;
  }

  // ---------- ⑦e 随机遭遇刷车队（原版 MapMode.as L6079-6109 的 web 侧：刷到地图上而非直开战） ----------
  spawnEncounterCaravan(type: number, player: any): NpcCaravan {
    const enc = this.newMapNpcCaravan(type, 0, 0);
    const p = player ?? this.Caravans[0];
    // 刷点偏向玩家行进前方（原版四侧权重：sidesDir 0=北 1=东 2=南 3=西；inclination=player.speed/enc.speed）
    let d: number;
    if (p.moving) {
      const inclination = (p.speedKmh ?? 0) / Math.max(enc.speedKmh ?? 1, 0.001);
      const sin = Math.abs(Math.sin(p.direction));
      const cos = Math.abs(Math.cos(p.direction));
      const sidesDir: number[] = [0, 0, 0, 0];
      if (p.direction > 0 && p.direction <= Math.PI) { sidesDir[1] = sin; sidesDir[3] = 0; }
      else { sidesDir[1] = 0; sidesDir[3] = sin; }
      if (p.direction > Math.PI / 2 && p.direction <= Math.PI * 1.5) { sidesDir[2] = cos; sidesDir[0] = 0; }
      else { sidesDir[2] = 0; sidesDir[0] = cos; }
      let total = 0;
      for (let i = 0; i < 4; i++) {
        sidesDir[i] = Math.max(1 - inclination, 0) + sidesDir[i] * inclination;
        total += sidesDir[i];
      }
      for (let i = 0; i < 4; i++) sidesDir[i] /= total || 1;
      d = weightedIndex(sidesDir);
    } else {
      d = Math.floor(Math.random() * 4);
    }
    switch (d) {
      case 0: enc.x = p.x - 325 + Math.random() * 670; enc.y = p.y - 257; break;     // 北
      case 1: enc.x = p.x + 340; enc.y = p.y - 248 + Math.random() * 495; break;     // 东
      case 2: enc.x = p.x - 325 + Math.random() * 670; enc.y = p.y + 257; break;     // 南
      default: enc.x = p.x - 340; enc.y = p.y - 248 + Math.random() * 495; break;    // 西
    }
    if (type === 41) {
      // 迁徙车队：放到附近镇旁并直达（原版 t==41 分支）
      let best: any = null, bd = Infinity;
      for (const t of this.Towns) {
        const dd = Math.hypot(t.x - enc.x, t.y - enc.y);
        if (dd < bd) { bd = dd; best = t; }
      }
      if (best) {
        enc.x = best.x + (Math.random() < 0.5 ? -200 : 200);
        enc.y = best.y + (Math.random() < 0.5 ? -200 : 200);
        this.directCaravanToTown(enc, best.id);
      }
    } else {
      // 原版：direction = player.direction - halfPI + rand×π（归一化 [0,2π)）
      enc.direction = (p.direction - Math.PI / 2 + Math.random() * Math.PI + Math.PI * 2) % (Math.PI * 2);
    }
    (enc as any).stateless = true; // 兼容旧档标记（落档不需要）；方案③起以 category 表述
    enc.category = 1; // 方案③：遭遇车队=原版 category 1（>400px 随气泡回收）
    this.npcCaravans.push(enc);
    return enc;
  }

  // ---------- ⑦g directCaravanToNearestTown / directCaravanToTown（原版 GameData.as:5033/5070） ----------
  directCaravanToNearestTown(npc: any) {
    let bestId: number | null = null;
    let best = Infinity;
    for (const t of this.Towns) {
      const d = Math.hypot(t.x - npc.x, t.y - npc.y);
      if (d < best) { best = d; bestId = t.id; }
    }
    if (bestId != null) this.directCaravanToTown(npc, bestId);
  }
  directCaravanToTown(npc: any, townId: number) {
    const t = this.Towns[townId];
    if (!t) return;
    npc.direction = Math.atan2(t.x - npc.x, npc.y - t.y); // CalcRevYAngle（0=北、顺时针）
    npc.moving = true;
    if (Array.isArray(npc.routePoints)) { npc.routePoints = [townId]; npc.pointIdx = 0; }
  }

  // ---------- ⑦g 离开战斗时释放奴隶 → 地图自由民车队（原版 BattleMode.leave L979-997 new Caravan(5)） ----------
  spawnFreeCaravan(slaves: Character[]): NpcCaravan | null {
    if (!slaves.length) return null;
    const p = this.Caravans[0];
    const ct = this.caravanTypeOf(5); // type5=「旅行团」1286
    const free = new NpcCaravan(this.nextNpcId(), [], ct?.name != null ? (this.textOf(ct.name) || "Travelers") : "Travelers");
    this.applyCaravanIdentity(free, 5);
    free.x = p.x; free.y = p.y;
    free.moving = true;
    for (const s of slaves) {
      s.category = 1; // 自由民
      this.freeASlave(s);
      free.people.push(s);
    }
    free.defenders = free.people.length;
    this.directCaravanToNearestTown(free);
    // 双向 recentlyInteractedCaravans（防连触发）
    this.recentlyInteractedCaravans.push(free);
    this.recentlyInteractedCaravans.push(p);
    free.category = 2; // 方案③：自由民=原版 category 2（到镇并入人口后解散）
    this.npcCaravans.push(free);
    return free;
  }
  // 原版 CaravanMenu.createGroupFromPerson / leavePersonWithSupplies。
  releaseCrewMember(person: Character, withSupplies: boolean): NpcCaravan | null {
    const c = this.Caravans[0];
    if (!c.People.includes(person)) return null;
    const supplies = withSupplies ? c.getConsumedFoodstuffs(person) : [];
    const water = withSupplies ? Math.min(c.cargoAmount(1), person.waterConsumption) : 0;
    const free = new NpcCaravan(this.nextNpcId(), [], person.name);
    this.applyCaravanIdentity(free, person.oldFaction ?? 5);
    free.name = person.name; free.x = c.x; free.y = c.y; free.money = 0; free.category = 2;
    if (person.category === 4) this.freeASlave(person);
    this.affectSpecificReputation(5, withSupplies ? 2 : -1);
    person.category = 1;
    c.removePerson(person); // 归还原车队装备并解除乘坐，再转移真实人物引用。
    free.people.push(person); free.defenders = 1;
    free.speedKmh = person.speed; free.morale = person.morale;
    for (const e of supplies) {
      const amount = Math.min(c.cargoAmount(e.itemType), e.amount);
      if (amount > 0) { c.removeCargo(e.itemType, amount); free.cargo.set(e.itemType, amount); }
    }
    if (water > 0) { c.removeCargo(1, water); free.cargo.set(1, (free.cargo.get(1) ?? 0) + water); }
    c.rebuildLiquidsContainers();
    this.directCaravanToNearestTown(free);
    this.markCaravanInteracted(free);
    this.npcCaravans.push(free);
    return free;
  }

  nextNpcId(): number {
    let maxId = 0;
    for (const n of this.npcCaravans) if (n.id > maxId) maxId = n.id;
    return maxId + 1;
  }

  // ---------- ⑦g 最近交互冷却（原版 Caravan.recentlyInteractedCaravans：防同一车队连触发） ----------
  recentlyInteractedCaravans: Array<any> = [];
  isCaravanRecentlyInteracted(npc: any): boolean {
    return this.recentlyInteractedCaravans.some((c) => c === npc);
  }
  markCaravanInteracted(npc: any) {
    if (!this.isCaravanRecentlyInteracted(npc)) this.recentlyInteractedCaravans.push(npc);
  }
  // 冷却清理：离开 600px 半径后解除（每帧由 MapMode 调用）
  // MapMode.as L3251-3257: remove the recent-contact lock as soon as the
  // caravans are no longer within the 16px encounter radius. Using 600px
  // prevented a caravan from being encountered again after a normal departure.
  clearDistantCaravanInteractions(minDist = 16) {
    const p = this.Caravans[0];
    this.recentlyInteractedCaravans = this.recentlyInteractedCaravans.filter((c) => {
      if (!c || typeof c.x !== "number") return false;
      return Math.hypot(c.x - p.x, c.y - p.y) < minDist;
    });
  }

  private textOf(id: number | string): string {
    // 按当前语言取文本（原版 Texts.fetch 语义：缺列回退 18↔19 简繁互备，再退英文列）
    // 旧实现硬编码取英文列 [1]，导致中文语言下车队名仍显示英文
    const ds = (globalThis as any).__c2?.ds;
    const arr = ds?.texts?.[String(id)];
    if (!arr) return "Caravan";
    const lang = ds.language ?? 1;
    let v = arr[lang];
    if (!v || !v.length) {
      const fallback: Record<number, number> = { 3: 4, 4: 3, 6: 7, 7: 6, 15: 32, 18: 19, 19: 18, 30: 19, 32: 15, 42: 3, 43: 3 };
      const alt = fallback[lang];
      v = (alt !== undefined && arr[alt] && arr[alt].length > 0) ? arr[alt] : (arr[1] ?? "");
    }
    return v || "Caravan";
  }

  // GameData.as 13581–13863: route sales are percentages, purchases are weight quotas.
  npcTradeAtTown(npc: NpcCaravan, ds: DataStore, econ: any) {
    const pt=npc.points[npc.pointIdx]??{town:npc.routePoints[npc.pointIdx]},town=this.Towns[pt.town];
    if(!town)return;
    npc.routePoint=npc.pointIdx;
    const view=new Caravan();
    view.category=npc.category;view.moving=npc.moving;view.cargo=npc.cargo;view.transports=npc.transports;view.inUse=npc.inUse;
    const roster=npc.people.length?npc.people:(npc.squad?.people??[]);
    view.People=roster.map(p=>p instanceof Character?p:new Character(p));
    const matches=(id:number,selector:number|string)=>typeof selector==='number'?id===selector:!!itemDefinition(ds,id)?.[selector];
    const transfer=(id:number,amount:number,buy:boolean)=>{
      const source=buy?town.stock:npc.cargo;
      const available=Math.max(0,(source.get(id)??0)-(buy?0:(npc.inUse[id]??0)));
      amount=Math.max(0,Math.min(amount,available));if(amount<=0)return;
      const price=econ.Economy.price(ds,town,id,amount,buy);
      if(buy){town.addToStock(id,-amount);view.addCargo(id,amount);npc.money-=price;town.money+=price;}
      else{view.removeCargo(id,amount);town.addToStock(id,amount);npc.money+=price;town.money-=price;}
    };
    for(const sale of pt.sell??[])for(const [id,have] of [...npc.cargo])if(matches(id,sale.item)&&have>0&&sale.amount>0){
      let amount=have*sale.amount/100;
      if(!itemDefinition(ds,id)?.divisible)amount=Math.max(1,Math.round(amount));
      transfer(id,amount,false);
    }
    // Route caravans settle travel provisions once at arrival, not once per rendered frame.
    if(npc.lastConsumption!=null){
      const days=Math.max(0,this.Time-npc.lastConsumption)/86400,needs=view.getConsumptionProduction();
      for(const e of needs.consumption)view.removeCargo(e.item,e.amount*days);
      let calories=needs.foodConsumption*days;
      for(const [id,have] of [...npc.cargo]){
        const food=itemDefinition(ds,id);if(!food?.food||!(food.calories>0)||calories<=0)continue;
        let amount=Math.min(have,calories/food.calories);if(!food.divisible)amount=Math.min(have,Math.ceil(amount));
        view.removeCargo(id,amount);calories-=amount*food.calories;
      }
    }
    npc.lastConsumption=this.Time;
    const refill=(selector:number|string,target:number)=>{
      const units=(id:number)=>selector==='food'?Number(itemDefinition(ds,id)?.calories??0):1;
      let missing=target-[...npc.cargo].reduce((n,[id,amount])=>n+(matches(id,selector)?amount*units(id):0),0);
      for(const [id,stock] of [...town.stock]){
        if(missing<=0)break;if(!matches(id,selector)||units(id)<=0)continue;
        let amount=Math.min(stock,missing/units(id));if(!itemDefinition(ds,id)?.divisible)amount=Math.ceil(amount);
        amount=Math.min(stock,amount);transfer(id,amount,true);missing-=amount*units(id);
      }
    };
    refill(1,50*view.People.length);refill(62,20*view.People.length);refill('food',20000*view.People.length);
    const buys=pt.buy??[],total=buys.reduce((n,b)=>n+Math.max(b.amount,0),0);
    const space=Math.max(0,view.maxCargo-view.totalCargo),reserved=new Map<number,number>();
    if(total>0)for(const buy of buys){
      let quota=space*Math.max(buy.amount,0)/total;
      for(const [id,stock] of town.stock){
        if(!matches(id,buy.item))continue;
        const weight=itemWeightKg(ds,id),available=Math.max(0,stock-(reserved.get(id)??0));
        const amount=weight>0?Math.min(available,Math.floor(Math.max(0,quota)/weight)):available;
        if(amount<=0)continue;reserved.set(id,(reserved.get(id)??0)+amount);quota-=amount*weight;
      }
    }
    for(const [id,desired] of reserved){
      const amount=itemDefinition(ds,id)?.liquid?Math.min(desired,Math.max(0,view.maxLiquidAmount(id))):desired;
      transfer(id,amount,true);
    }
    // The local original adds a route-caravan cash contribution to the town here.
    if(npc.money>0)town.money+=npc.money/10;
  }

  // Fuel is charged by actual distance in moveCaravan, never once more at midnight.
  dailyConsumption(): string[] { this.caravanMovedToday=false; return []; }

  // MapMode.as 3479–3492: a daily sextant + almanac reading, not precise GPS.
  measureSextant() {
    this.lastSextantPos=[];
    const c=this.Caravans[0];if(!(c.findCargo(172)&&c.findCargo(191)))return;
    this.sextantExperience++;
    const intelligence=c.People.reduce((m,p)=>Math.max(m,p.intelligence),0);
    this.lastSextantOffset=10000/(intelligence+Math.sqrt(this.sextantExperience));
    const angle=Math.random()*Math.PI*2,dist=this.lastSextantOffset*Math.random();
    this.lastSextantPos=[c.x+dist*Math.sin(angle),c.y+dist*Math.cos(angle)];this.lastSextantMeasurement=this.Time;
  }

  // MapMode.as 3855–3908, 6723: weekly mercenary payday, not a daily tax on all members.
  onSalaryDue: ((person:Character, approve:()=>void, refuse:()=>void)=>void) | null = null;
  private salaryPrompt: Character | null = null;
  payMercenary(person: Character) {
    const c=this.Caravans[0];
    if(!c.People.includes(person)||person.category!==2||person.payDay>this.Time||c.money<person.minSalary)return;
    // Corrupt/uninitialised legacy Web dates must not create millions of arrears.
    person.payDay = (person.payDay>0?person.payDay:this.Time) + 604800;
    const paid=Math.max(0,Math.min(person.salary,c.money)); c.money-=paid;
    if(paid>person.minSalary)person.morale+=Math.sqrt(paid-person.minSalary);
  }
  dismissMercenary(person: Character) {
    const c=this.Caravans[0];if(!c.People.includes(person))return;
    // MapMode.as 7242: refusal keeps equipment while escorting; removal in town returns it.
    person.salary=person.minSalary;
    const town=c.overTown!=null?this.Towns[c.overTown]:null;
    if(town){(town.people??=[]).push(person);c.removePerson(person);}
    else person.category=7; // escort to town, rather than disappearing in the desert
  }
  paySalaries(): string[] {
    const c=this.Caravans[0], leavers:string[]=[];
    for(const p of [...c.People]) {
      if(p.category!==2||p.payDay>this.Time)continue;
      if(c.money<p.minSalary){leavers.push(p.name);this.dismissMercenary(p);continue;}
      if(p.autoPay){this.payMercenary(p);continue;}
      if(this.salaryPrompt||!this.onSalaryDue)continue;
      this.salaryPrompt=p;
      const resolve=(pay:boolean)=>{if(this.salaryPrompt!==p)return;this.salaryPrompt=null;if(pay)this.payMercenary(p);else this.dismissMercenary(p);};
      this.onSalaryDue(p,()=>resolve(true),()=>resolve(false));
      break;
    }
    return leavers;
  }

  get day() { return Math.floor(this.Time / 86400); }
  makeDate(t?: number): { day: number; hh: number; mm: number; Year: number; Month: number; Day: number; Hour: number; Minute: number; Day2d: string | number; MonthName: string; ShortMonthName: string; Year2d: string | number; Hour2d: string | number; Minute2d: string | number; AmPm: string } {
    // 对齐原版 GameData.staticMakeDate：闰年/月天数表
    const v = Math.max(0, t ?? this.Time);
    let rem = Math.floor(v);
    let Year = 1;
    let yearLen = 31622400;
    while (rem >= yearLen) { rem -= yearLen; Year++; yearLen = Year % 4 === 0 ? 31622400 : 31536000; }
    const mdays = [undefined, 31, Year % 4 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let Month = 1;
    while (Month <= 12 && rem >= (mdays[Month] ?? 31) * 86400) { rem -= (mdays[Month] ?? 31) * 86400; Month++; }
    let Day = 1;
    while (rem >= 86400) { rem -= 86400; Day++; }
    let Hour = 0;
    while (rem >= 3600) { rem -= 3600; Hour++; }
    let Minute = 0;
    while (rem >= 60) { rem -= 60; Minute++; }
    const p2 = (x: number) => (x >= 10 ? x : "0" + x);
    // 原版 GameData.staticMakeDate：MonthName = Texts.fetch(36 + Month)；ShortMonthName = MonthName.substr(0,3).toUpperCase()
    // → web 用本地化月名（texts 37-48 一月~十二月），ShortMonthName 取前 3 字符大写（zh 全角词则取全词）
    const ds2 = (globalThis as any).__c2?.ds;
    const monthName = Month >= 1 && Month <= 12
      ? getText(ds2, 36 + Month, ds2?.language)
      : (["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Month] ?? "Jan");
    const shortMonth = /^[A-Za-z]+$/.test(monthName) ? monthName.substr(0, 3).toUpperCase() : monthName;
    return {
      day: Math.floor(v / 86400), hh: Hour, mm: Minute,
      Year, Month, Day, Hour, Minute,
      Day2d: p2(Day),
      MonthName: monthName,
      ShortMonthName: shortMonth,
      Year2d: Year >= 10 ? Year % 100 : p2(Year),
      Hour2d: p2(Hour),
      Minute2d: p2(Minute),
      AmPm: Hour < 12 ? "AM" : "PM",
    };
  }

  // 移动一帧：返回是否发生了移动
  // ---------- 城镇经济周期（对齐原版 MapMode.enterFrame 的 Town cycleCounter 逻辑） ----------
  // 原版 MapMode L4792-4797：cycleCounter += gameSpeed*4（每帧）；GD.Time += 60*gameSpeed*4（每帧）
  // → cycleCounter 单位 = 60 游戏秒；城镇周期 720 单位 = 43200 游戏秒 = 12 游戏小时
  updateTowns(dt: number) {
    if (this.gameSpeed <= 0) return;
    this.townCycleAcc += dt * 6000 * this.gameSpeed; // 240 游戏秒/帧 × 25fps：墙钟流速对齐原版
    while (this.townCycleAcc >= 43200) { // 原版周期：720 单位 × 60 游戏秒 = 12 游戏小时
      this.townCycleAcc -= 43200;
      for (const t of this.Towns) {
        t.cycleCounter += 720;
        t.money += t.population * 2; // 原版 MapMode L4799：每周期城镇资金 += 人口×2
        t.tickCycle(this.ds,this.Time-this.townCycleAcc);
        this.refreshTownShops(t);
      }
    }
  }

  // ---------- 商店刷新（原版 MapMode L5258-5496：每城镇周期对 category==1 && subCategory<5 商店） ----------
  // 汇总 assortment/transportAssortment/slavesAmount → assortmentToStock；市民买（maxSell）+ 补货（maxBuy）
  refreshTownShops(t: Town) {
    const presets = (this.ds.presets as any)?.town_presets?.[0] ?? [];
    const tp = presets[t.id];
    if (!tp?.locations) return;
    for (const loc of tp.locations) {
      if (!(loc.category === 1 && loc.subCategory < 5)) continue;
      const shopLoc = t.locations.find((l: any) => l.name === loc.name);
      if (!shopLoc || !shopLoc.stock) continue;
      const stockMap: Map<number, number> = shopLoc.stock;
      const transports: any[] = shopLoc.transport ?? [];
      const slaves: any[] = shopLoc.slaves ?? [];
      // 汇总 assortmentToStock
      type ATS = { category: number; item: number; assortment: number; stock: number };
      const ats: ATS[] = [];
      for (const a of shopLoc.assortment ?? loc.assortment ?? []) {
        ats.push({ category: 1, item: a.item, assortment: a.amount, stock: stockMap.get(a.item) ?? 0 });
      }
      for (const ta of loc.transportAssortment ?? []) {
        const owned = transports.filter((tr) => tr.type === ta.type).length;
        ats.push({ category: 2, item: ta.type, assortment: ta.amount, stock: owned });
      }
      if ((loc.slavesAmount ?? 0) > 0 || slaves.length > 0) {
        ats.push({ category: 3, item: 0, assortment: loc.slavesAmount ?? 0, stock: slaves.length });
      }
      // subCategory != 1：合并 loc.stock 中不在 assortment 的项
      if (loc.subCategory !== 1) {
        for (const [item, amt] of stockMap) {
          if (!ats.some((x) => x.category === 1 && x.item === item)) {
            ats.push({ category: 1, item, assortment: 0, stock: amt });
          }
        }
      }
      const itemDataFn = (globalThis as any).__c2GetItemData as ((id: number) => any) | undefined;
      // 市民买（原版 L5336-5426）
      for (const a of ats) {
        const maxSell = (a.assortment === 0 ? Math.max(a.stock, 0.5) : Math.max(a.assortment, 0.5)) * (720 / 1440) / 2;
        const sellRest = maxSell - Math.floor(maxSell);
        let sellAmount = Math.round(Math.random() * maxSell);
        if (Math.random() < sellRest) sellAmount += 1;
        sellAmount = Math.min(sellAmount, a.stock);
        if (sellAmount <= 0) continue;
        let price = 0;
        if (a.category === 1) {
          this.removeFromStockSafe(stockMap, a.item, sellAmount);
          const base = itemDataFn ? (itemDataFn(a.item)?.price ?? 0) : 0;
          price = base * sellAmount;
        } else if (a.category === 2) {
          // 随机移除一辆该类型载具
          const idx = transports.findIndex((tr) => tr.type === a.item);
          if (idx >= 0) {
            const tr = transports.splice(idx, 1)[0];
            price += unitPrice(tr);
          }
        } else if (a.category === 3) {
          if (slaves.length > 0) {
            const s = slaves.splice(Math.floor(Math.random() * slaves.length), 1)[0];
            price += unitPrice(s) * t.slavePrices;
          }
        }
        if (price > 0) {
          if (loc.subCategory === 1) t.money += price * (1 + (loc.margin ?? 0));
          else shopLoc.money += price * (1 + (loc.margin ?? 0));
          t.money += price * (t.tax ?? 0);
        }
      }
      // 补货（原版 L5427-5490）
      for (const a of ats) {
        const canBuy = a.assortment - a.stock;
        const maxBuy = Math.min((canBuy + a.assortment * 0.1) * (720 / 1440), a.assortment * (720 / 1440) / 2);
        if (maxBuy <= 0) continue;
        const buyRest = maxBuy - Math.floor(maxBuy);
        let buyAmount = Math.round(Math.random() * maxBuy);
        if (Math.random() < buyRest) buyAmount += 1;
        if (buyAmount <= 0) continue;
        let price = 0;
        if (a.category === 1) {
          this.addToStockSafe(stockMap, a.item, buyAmount);
          const base = itemDataFn ? (itemDataFn(a.item)?.price ?? 0) : 0;
          price = base * buyAmount;
        } else if (a.category === 2) {
          for (let k = 0; k < buyAmount; k++) {
            const unit = makeTransportUnit(a.item, this.ds);
            transports.push(unit);
            price += unitPrice(unit);
          }
        } else if (a.category === 3) {
          for (let k = 0; k < buyAmount; k++) {
            const s = makeRandomCharacter(this.ds, { category: 4 });
            slaves.push(s);
            price += unitPrice(s) * t.slavePrices;
          }
        }
        if (price > 0) {
          const factor = 1 / (1 + (loc.margin ?? 0));
          if (loc.subCategory === 1) t.money -= price * factor;
          else shopLoc.money -= price * factor;
          t.money += price * factor * (t.tax ?? 0);
        }
      }
      // 店铺资金不出现负数（原版 L5491）
      if ((shopLoc.money ?? 0) < 0) shopLoc.money = 0;
    }
  }

  private removeFromStockSafe(m: Map<number, number>, item: number, amount: number) {
    const cur = m.get(item) ?? 0;
    const nv = Math.max(0, cur - amount);
    if (nv <= 1e-9) m.delete(item); else m.set(item, nv);
  }
  private addToStockSafe(m: Map<number, number>, item: number, amount: number) {
    m.set(item, Math.max(0, (m.get(item) ?? 0) + amount));
  }

  // 城镇历史点（对齐原版 GameData.newHistoricalPoint：unshift 新快照，保留最近 60 条）
  newHistoricalPoint(t: Town, time?: number) {
    t.historicalData.unshift({time:time??this.Time,production:[],consumption:[],playersProduction:[],playersConsumption:[]});
    while (t.historicalData.length > 60) t.historicalData.pop();
  }

  // ---------- 玩家人物消耗周期（对齐原版 People cycleCounter：每 360 游戏秒） ----------
  updatePeople(dt: number) {
    if (this.gameSpeed <= 0) return;
    this.peopleCycleAcc += dt * 6000 * this.gameSpeed; // 240 游戏秒/帧 × 25fps：墙钟流速对齐原版
    while (this.peopleCycleAcc >= 21600) { // 原版周期：360 游戏分钟 = 6 游戏小时 = 21600 游戏秒
      this.peopleCycleAcc -= 21600;
      const c = this.Caravans[0];
      c.beginHistory(this.Time - this.peopleCycleAcc);
      try { this.peopleCycleStep(); } finally { c.endHistory(); }
    }
  }

  // 原版狩猎战利品表（GameData.huntingItems / huntingEggs）
  private static readonly HUNTING_ITEMS: Array<{ item: number; amount: number }> = [
    { item: 45, amount: 0.15 }, { item: 71, amount: 0.25 }, { item: 73, amount: 0.25 }, { item: 75, amount: 0.35 },
  ];
  private static readonly HUNTING_EGGS: Array<{ item: number; amount: number }> = [
    { item: 72, amount: 0.5 }, { item: 74, amount: 0.5 },
  ];

  private itemWeightKg(item: number): number {
    return itemWeightKg(this.ds, item);
  }

  // 采集/狩猎（对齐原版 MapMode：每周期一次，区域资源枯竭度 zoneForage/PreyDevastation）
  private forageHuntStep() {
    const c = this.Caravans[0];
    const ds = this.ds;
    const CYC = 360 / 1440;
    if (c.collectForage) {
      const cs = c.collectingSkill();
      let prob = cs * 360 * 0.5 / 1440 / Math.max(c.zoneForageDevastation, 1);
      if (c.moving) prob /= Math.max(c.speedKmh, 1);
      let count = this.probabilityRandom(prob);
      while (count > 0) {
        const amount = cs * 360 / 1440 * 0.1 / Math.max(c.zoneForageDevastation, 1) * Math.random();
        c.addCargo(62, amount);
        c.zoneForageDevastation += amount;
        count--;
      }
      c.distributeExperience("collectingSkill", "collectingExperience", 1);
    }
    if (c.hunt && c.overTown == null) {
      const hs = c.huntingSkill();
      const cs = c.collectingSkill();
      let prob = hs * 360 * 0.5 / 1440 / Math.max(c.zonePreyDevastation, 1);
      if (c.moving) prob /= Math.max(c.speedKmh, 1);
      let count = Math.min(this.probabilityRandom(prob), 5);
      while (count > 0) {
        let spread = Math.random();
        for (const h of GameData.HUNTING_ITEMS) {
          if (spread < h.amount) {
            const amount = Math.min(Math.pow(0.05 * hs * 360 / 1440 / Math.max(c.zonePreyDevastation, 1) * Math.random(), 0.5), 3 / this.itemWeightKg(h.item) * 360 / 1440) * Math.random();
            c.addCargo(h.item, amount);
            c.zonePreyDevastation += amount / 2;
            break;
          }
          spread -= h.amount;
        }
        count--;
      }
      // 蛋
      prob = 0.0005 * hs * cs * 360 / 1440 / Math.max(c.zonePreyDevastation, 1);
      if (c.moving) prob /= Math.max(c.speedKmh, 1);
      count = Math.min(this.probabilityRandom(prob), 2);
      while (count > 0) {
        let spread = Math.random();
        for (const h of GameData.HUNTING_EGGS) {
          if (spread < h.amount) {
            let amount = Math.min(Math.pow(0.1 * hs + cs * 0.1 * 360 / 1440 / Math.max(c.zonePreyDevastation, 1) * Math.random(), 0.3), 1.5);
            amount = Math.round(amount * Math.random());
            if (amount > 0) { c.addCargo(h.item, amount); c.zonePreyDevastation += amount; }
            break;
          }
          spread -= h.amount;
        }
        count--;
      }
      c.distributeExperience("huntingSkill", "huntingExperience", 1);
    }
    void ds;
  }

  // 设备系统（原版 getConsumptionProduction + devicesWorking）：
  // 汇总电力（eP/eC × inUse），设备 consumption 原料结算（不足降速），overload = eC > eP
  devicesCycle() {
    const c=this.Caravans[0], goods=this.ds.items.Goods;
    const producers=[...c.cargo].flatMap(([id,amount])=>{
      const it=this.ds.items.Items[id],g=it?.category===1?goods[it.subCategory]:null;
      return g&&amount>0&&c.inUseOf(id)>0?[{...g,count:Math.min(amount,c.inUseOf(id))}]:[];
    });
    const flow=calculateProductionFlow(producers,c.cargo,.25);
    c.electricityProduction=flow.electricityProduction;c.electricityConsumption=flow.electricityConsumption;
    c.electricOverload=flow.poweredTime<1;
    for(const e of flow.consumption)c.removeCargo(e.item,e.amount);
    for(const e of flow.production)c.addCargo(e.item,e.amount);
  }

  // 电池充电（原版：chargers 物品 batteryCharge×工作数 → 充电队列每周期 +360，满 1440 → 218→219）
  private batteryChargeStep() {
    const c = this.Caravans[0];
    const ds = this.ds;
    let batteriesToCharge = 0;
    for (const [id, amt] of c.cargo) {
      const it = ds.items.Items[id];
      const g = it?.category === 1 ? ds.items.Goods[it.subCategory] : null;
      if (g && g.batteryCharge > 0 && amt > 0) batteriesToCharge += g.batteryCharge * c.devicesWorking(id);
    }
    const batteriesNum = c.cargoAmount(218);
    if (c.chargingBatteries.length > batteriesNum) c.chargingBatteries = c.chargingBatteries.slice(0, batteriesNum);
    while (c.chargingBatteries.length < batteriesNum) c.chargingBatteries.push(0);
    let n = Math.min(batteriesToCharge, c.chargingBatteries.length);
    for (let j = 0; j < n; j++) {
      c.chargingBatteries[j] += 360;
      if (c.chargingBatteries[j] >= 1440) {
        c.removeCargo(218, 1);
        c.addCargo(219, 1);
        c.chargingBatteries.splice(j, 1);
        j--;
        n--;
      }
    }
  }

  private peopleCycleStep() {
    const c = this.Caravans[0];
    this.devicesCycle(); // 电力/设备结算（先于电池充电）
    c.withoutHistory(()=>this.batteryChargeStep()); // original charging is a conversion, not a ledger branch
    if (c.People.length === 0) { this.forageHuntStep(); return; }
    this.forageHuntStep();
    const ds = this.ds;
    const items = ds.items.Items;
    const goods = ds.items.Goods;
    const CYC = 360 / 1440; // 每周期 = 0.25 天
    for (const p of c.People) {
      const weight = p.weight ?? 80;
      const ideal = p.idealWeight ?? 80;
      const gs = c.getSettingsGroup(p.category ?? 1);
      const waterRations = gs.waterRations ?? 100;
      const bmr = p.BMR * CYC, gdaBase = p.GDA * CYC;
      let totalCal = 0, waterRecv = 0;
      // One shared allocation algorithm for preview, release supplies and actual meals.
      // Item.category must be Goods (1); equal subCategory IDs across armor/food are unrelated.
      for (const meal of c.getConsumedFoodstuffs(p, CYC)) {
        const food = goods[meal.item];
        const amount = Math.min(meal.amount, c.availableCargo(meal.itemType));
        if (!food || amount <= 0) continue;
        c.removeCargo(meal.itemType, amount);
        totalCal += amount * food.calories;
        waterRecv += amount * (food.waterPercentage ?? 0) * (food.weight ?? 0);
        p.morale += (food.taste ?? 0) * .01 * amount * food.calories / Math.max(gdaBase,1);
      }
      // 饥饿（对齐原版：与全量 GDA 比较——配给不足也会挨饿）
      if (totalCal < gdaBase) p.hunger += gdaBase - totalCal;
      else if (p.hunger > 0) { p.hunger -= totalCal - gdaBase + 10; p.hunger /= 2; }
      p.hunger *= 0.975;
      if (p.hunger < 0) p.hunger = 0;
      // 体重
      p.weight += (totalCal - bmr) / (totalCal < bmr && p.weight < ideal ? (this.difficulty === 1 ? 3000 : 1500) : (this.difficulty === 1 ? 500 : 1000));
      // HP：饥饿 + 严重低体重（difficulty 1 除数）
      if (p.hunger > 0) p._HP -= p.hunger / (this.difficulty === 1 ? 30000 : 15000);
      if (p.weight < ideal * 0.6) p._HP -= (ideal * 0.6 - p.weight) / (this.difficulty === 1 ? 400 : 200);
      // 水（食物含水先抵扣；原版 waterConsumption = weight×0.035 L/天 × 配给比例）
      const waterNeed = Math.max(0, weight * 0.035 * CYC * waterRations / 100 - waterRecv);
      const haveWater = c.cargoAmount(1);
      const takeWater = Math.min(waterNeed, haveWater);
      c.takeLiquid(1, takeWater);
      if (waterNeed > takeWater) p.thirst += (waterNeed - takeWater) * 100;
      else if (p.thirst > 0) { p.thirst -= 10 + (takeWater - waterNeed) * 100; if (p.thirst < 0) p.thirst = 0; p.thirst *= 0.5; }
      p.thirst *= 0.975;
      if (p.thirst < 0) p.thirst = 0;
      if (p.thirst > 0) p._HP -= p.thirst / (this.difficulty === 1 ? 140 : 70);
      // 士气
      p.morale = p.morale ?? 50;
      if (totalCal > bmr) p.morale += Math.pow(Math.abs(totalCal - bmr), 0.5) / 100;
      else p.morale -= Math.pow(Math.abs(totalCal - bmr), 0.5) / 100;
      p.morale -= p.hunger / 10000;
      p.morale -= (p.morale - 50) / 100;
      if (p.morale < 0) p.morale = 0;
      // 伤口治疗（对齐原版 wounded 周期：分级 HP 效果 + 药品用量 + 医生治疗）
      const maxHPp = (p.physical ?? 10) * 20;
      let wounded = 0;
      if (maxHPp - (p._HP ?? 100) >= 0.5) {
        if ((p._HP ?? 100) > maxHPp * 0.8) wounded = 1;
        else if ((p._HP ?? 100) > maxHPp * 0.4) wounded = 2;
        else if ((p._HP ?? 100) > maxHPp * 0.1) wounded = 3;
        else wounded = 4;
      }
      if (wounded > 0) {
        if (wounded === 1) p._HP += maxHPp / 1000 + 0.01;
        else if (wounded === 3) p._HP -= 0.1;
        else if (wounded === 4) p._HP -= 0.2;
        const medsDosage = [0, 5, 10, 20, 50];
        const useIdx = gs.medicineUse?.[wounded] ?? (wounded > 1 ? wounded - 1 : 0);
        let useMeds = (medsDosage[useIdx] ?? 0) * CYC; // ×360/1440
        const meds = c.cargoAmount(63);
        useMeds = Math.min(useMeds, meds);
        if (useMeds > 0) {
          c.removeCargo(63, useMeds);
          p._HP += useMeds / 40;
        }
        p._HP += c.doctorSkill() / 2000 * wounded;
      }
      // 医生经验（原版 distributeExperience("doctorSkill","doctorExperience",totalHealed)）
      const totalHealed = wounded > 0 ? wounded * 2 * CYC : 0;
      if (totalHealed > 0) c.distributeExperience("doctorSkill", "doctorExperience", totalHealed);
      // 经验
      p.travelExperience = (p.travelExperience ?? 0) + 0.1;
      // HP 上限（原版 maxHP = physical×20）
      const maxHP = (p.physical ?? 10) * 20;
      if (p._HP > maxHP) p._HP = maxHP;
      if (p._HP < 0) p._HP = 0;
    }
    // 饿死/渴死（原版 HP<=0 移除）
    const dead: any[] = c.People.filter((p) => (p._HP ?? 100) <= 0);
    for (const d of dead) {
      c.People = c.People.filter((p) => p !== d);
      this.onNotify?.((d.name || "Member") + " died of hunger/thirst");
    }
  }

  // ---------- 运输周期（对齐原版 MapMode.enterFrame 的 Transport cycleCounter 逻辑） ----------
  updateTransports(dt: number) {
    if (this.gameSpeed <= 0) return;
    this.transportCycleAcc += dt * 6000 * this.gameSpeed; // 240 游戏秒/帧 × 25fps：墙钟流速对齐原版
    while (this.transportCycleAcc >= 21600) { // 原版周期：360 游戏分钟 = 6 游戏小时 = 21600 游戏秒
      this.transportCycleAcc -= 21600;
      const c=this.Caravans[0];
      c.beginHistory(this.Time-this.transportCycleAcc);
      try { c.withoutHistory(()=>this.transportCycleStep()); } finally { c.endHistory(); }
    }
  }

  private transportAgePeriod(tr: any, t: any): number {
    if (tr.age < (t.lactation ?? 0)) return 1;      // 幼崽
    if (tr.age < (t.maturity ?? 720)) return 2;     // 未成年
    if (tr.age < tr.maxAge * 0.8) return 3;         // 成年
    return 4;                                       // 老年
  }
  private transportIdealWeight(tr: any, t: any): number {
    if (this.transportAgePeriod(tr, t) < 3) return Math.max(Math.round(tr._idealWeight / 10), Math.round(tr._idealWeight * tr.age / (t.maturity ?? 720)));
    return tr._idealWeight;
  }
  private transportConsumption(tr: any, t: any): Array<{ item: number; amount: number }> {
    const arr: Array<{ item: number; amount: number }> = [];
    const period = this.transportAgePeriod(tr, t);
    if (period !== 1 && (t.forageConsumption ?? 0) > 0) arr.push({ item: 62, amount: (t.forageConsumption ?? 0) * this.transportIdealWeight(tr, t) / Math.max(t.weight ?? 100, 0.1) });
    if (period > 1 || (t.milkConsumption ?? 0) <= 0) { /* 幼崽才喝奶 */ }
    else if (t.milk) arr.push({ item: t.milk.item, amount: (t.milkConsumption ?? 0) * this.transportIdealWeight(tr, t) / Math.max(t.weight ?? 100, 0.1) });
    if (period !== 1 && (t.waterConsumption ?? 0) > 0) arr.push({ item: 1, amount: (t.waterConsumption ?? 0) * this.transportIdealWeight(tr, t) / Math.max(t.weight ?? 100, 0.1) });
    return arr;
  }
  private transportProduces(tr: any, t: any): Array<{ item: number; amount: number }> {
    const arr: Array<{ item: number; amount: number }> = [];
    for (const p of (t.produces ?? [])) arr.push({ item: p.item, amount: p.amount });
    if (tr.gender === 2 && t.milk && this.transportAgePeriod(tr, t) > 2) {
      let m = 1;
      if (tr.remainingLactation > 0) m = 2;
      if (tr.pregnant) m *= 1 + 0.3 * (1 - tr.remainingPregnancy / (t.gestation ?? 360));
      m *= tr.weight / (t.weight ?? 100);
      if (tr.age > tr.maxAge * 0.7) m *= Math.max(1 - ((tr.age - tr.maxAge * 0.7) / tr.maxAge) * 5, 0);
      if (tr.hunger > 0) m *= 1 - Math.min(tr.hunger / 50, 1);
      if (tr.thirst > 0) m *= 1 - Math.min(tr.thirst / 30, 1);
      if (m > 0.01) arr.push({ item: t.milk.item, amount: (t.milk.amount ?? 0) * m });
    }
    return arr;
  }
  // 原版 MathFunctions.ProbabilityRandom：返回期望为 p 的非负整数（泊松式逐次判定）
  private probabilityRandom(p: number): number {
    let count = 0;
    let rest = p;
    while (rest > 0) {
      const r = Math.random();
      if (r > rest) return count;
      count++;
      rest -= r;
    }
    return count;
  }
  // 原版 MapMode.enterFrame Transport cycleCounter：动物生产/消耗/老化/繁殖/死亡（对齐第 32 轮实现）
  private transportCycleStep() {
    const r = this.Caravans[0], n = this.ds, e = n.transports?.Types ?? [], t: any[] = [];
    for (const a of r.transports) {
      const o = e[a.type]; if (!o) continue;
      if (o.category !== 1) {
        if (o.category === 2 || o.category === 3) {
          let d = 0;
          if (a.health < a.maxHealth && (a.health += r.mechanicSkill() / 1e3, a.health += r.mechanicSkill() / 1e3, d = 1, a.health > a.maxHealth && (a.health = a.maxHealth)),
            r.autoFillLubricant && (a.lubricantLevel ?? 0) < (o.maxLubricant ?? 0)) {
            const c = (o.maxLubricant ?? 0) - (a.lubricantLevel ?? 0), u = r.cargoAmount(79), g = Math.min(c, u);
            a.lubricantLevel = (a.lubricantLevel ?? 0) + g; r.takeLiquid(79, g); r.recordHistoryFlow(79,g);
          }
          if (o.category === 3 && r.autoFillWater && (a.waterLevel ?? 0) < (o.maxWater ?? 0)) {
            const c = (o.maxWater ?? 0) - (a.waterLevel ?? 0), u = r.cargoAmount(1), g = Math.min(c, u);
            a.waterLevel = (a.waterLevel ?? 0) + g; r.takeLiquid(1, g); r.recordHistoryFlow(1,g);
          }
          Math.random() < 0.001 && (a.health -= a.maxHealth * 0.05 * Math.random());
          d > 0 && r.distributeExperience("mechanicSkill", "mechanicExperience", d * 0.2 * 360 / 1440);
        }
        continue;
      }
      for (const d of this.transportProduces(a, o)) {
        if ((!r.milk && d.item===o.milk?.item) || (!r.shear && d.item===87))continue;
        r.addCargo(d.item,d.amount*.25);
        r.recordHistoryFlow(d.item,d.amount,true); // original animal ledger stores the daily production rate
      }
      for (const d of this.transportConsumption(a, o)) {
        let c = d.amount * .25;
        if(d.item===o.milk?.item && !r.milk && a.mother && r.transports.includes(a.mother)) {
          const motherType=e[a.mother.type];
          c=Math.max(0,c-(this.transportProduces(a.mother,motherType).find(p=>p.item===d.item)?.amount??0));
        }
        if(c<=0)continue;
        const g=Math.min(c,r.availableCargo(d.item));
        r.removeCargo(d.item,g);r.recordHistoryFlow(d.item,g);
        let fed=g;
        // Milk from a different species can cover the caloric deficit (MapMode.as 4260–4307).
        if(g<c && d.item===o.milk?.item){
          const milkItem=n.items.Items[d.item],milk=n.items.Goods[milkItem.subCategory];
          let deficit=(c-g)*(milk.calories??0);
          for(const [id] of r.cargo){
            const it=n.items.Items[id],other=it?.category===1?n.items.Goods[it.subCategory]:null;
            if(id===d.item||!other?.milk||!(other.calories>0))continue;
            const take=Math.min(r.availableCargo(id),deficit/other.calories);
            r.removeCargo(id,take);r.recordHistoryFlow(id,take);deficit-=take*other.calories;
            if(deficit<=1e-9)break;
          }
          fed=c-deficit/Math.max(milk.calories,1);
        }
        if (fed < c) {
          const _ = fed / c;
          d.item === 62 ? a.hunger += (1 - _) * 3 : d.item === 1 ? a.thirst += (1 - _) * 3 : o.milk && d.item === o.milk.item && (a.hunger += (1 - _) * 2, a.thirst += (1 - _) * 2 / (o.droughtTolerance || 1));
        } else {
          d.item === 62 && a.hunger > 0 && (a.hunger -= a.hunger / 4 + 10);
          d.item === 1 && a.thirst > 0 && (a.thirst -= a.thirst / 4 + 10);
          o.milk && d.item === o.milk.item && a.hunger > 0 && (a.hunger -= a.hunger / 4 + 10);
        }
        a.hunger < 0 && (a.hunger = 0); a.thirst < 0 && (a.thirst = 0);
      }
      a.hunger *= 0.985; a.thirst *= 0.995;
      const s = this.transportIdealWeight(a, o);
      a.hunger > 0 && (a.health -= Math.pow(a.hunger, 2) / 1e3);
      a.weight < s * 0.7 && (a.health -= s * 0.1 / Math.max(a.weight, 0.1) * 2);
      a.thirst > 0 && (a.health -= Math.pow(a.thirst, 2) / 100 / (o.droughtTolerance || 1));
      a.weight += (s - a.weight) * 360 / 1440 / 300;
      a.hunger > 0 && (a.weight -= a.hunger / 100);
      let i = 0;
      a.health < a.maxHealth && (a.health += r.veterinarySkill() / 1500, i = 1);
      a.health > a.maxHealth && (a.health = a.maxHealth);
      i > 0 && r.distributeExperience("veterinarySkill", "veterinaryExperience", i * 1 * 360 / 1440);
      const h = a.weight / Math.max(s, 0.1);
      a.age += 360 / 1440;
      a.weight = s * h;
      a.age >= a.maxAge && (a.health = 0);
      const l = this.transportAgePeriod(a, o);
      if (a.gender === 2 && l === 3 && !a.pregnant && a.remainingLactation <= (o.lactation ?? 0) * 0.9 && r.transports.some(c => c.type === a.type && c.gender === 1 && this.transportAgePeriod(c, e[c.type] ?? {}) === 3)) {
        const c = 0.25 / ((o.lifespan ?? 360) * 30 / 1e3);
        this.probabilityRandom(c) > 0 && (a.pregnant = true, a.remainingPregnancy = (o.gestation ?? 360) * (0.9 + Math.random() * 0.2), a.pregnantWith = Math.max(1, Math.round((o.averageKids ?? 1) * (0.5 + Math.random()))));
      }
      if (a.pregnant && (a.remainingPregnancy -= 360 / 1440, a.remainingPregnancy <= 0)) {
        a.pregnant = false;
        a.remainingLactation = (o.lactation ?? 120) * (0.9 + Math.random() * 0.2);
        const d = a.pregnantWith > 0 ? a.pregnantWith : Math.round(o.averageKids ?? 1);
        for (let g = 0; g < d; g++) {
          const _ = r.newTransport(a.type, n);
          _.age = 0;
          _.weight = Math.max(_._idealWeight / 10, 1) * (0.8 + Math.random() * 0.4);
          _.mother = a;
          r.addTransport(_);
        }
        const c = a.givenName || this.transportTypeName(o);
        const u = d === 1
          ? (this.textOf(1260) || "A new animal has been born").replace("@animal@", c)
          : (this.textOf(3508) || "@animalname@ has given birth to @number@ kids").replace("@animalname@", c).replace("@number@", String(d));
        this.onNotify?.(u);
      }
      a.remainingLactation > 0 && (a.remainingLactation -= 360 / 1440, a.remainingLactation < 0 && (a.remainingLactation = 0));
      (a.health <= 0 || a.age >= a.maxAge) && t.push(a);
    }
    for (const a of t) {
      const o = r.transports.indexOf(a);
      o >= 0 && r.transports.splice(o, 1);
      this.onNotify?.((a.givenName || this.transportTypeName(a) || "Animal") + " died");
      r.updateSpeed();
    }
  }

  private transportTypeName(r: any): string {
    const ds2 = (globalThis as any).__c2?.ds;
    const nameId = typeof r?.name === "number" ? r.name : ((ds2?.transports?.Types?.[r?.type])?.name ?? 890);
    return getText(ds2, nameId, ds2?.language);
  }

  // 原版移动映射：mapSpeed = speed/12×4 px/帧（25fps），更新世界坐标/方块/地图中心
  advanceCaravan(r: any, n: number): boolean {
    if (!r.moving) return false;
    const speed=r.speedKmh;
    const t = speed / 12 * 4 * 25 * n * this.gameSpeed;
    if(t<=0)return false;
    const distance=speed * (n*6000*this.gameSpeed)/3600;
    if(!r.historicalData.length){r.beginHistory(this.Time);r.endHistory();}
    for(const tr of r.transports){
      const type=this.ds.transports.Types[tr.type];
      if(tr.passengerIn || ![2,3].includes(type?.category))continue;
      if(type.category===3){
        const fuel=Math.min(r.fuel,distance*(type.fuelConsumption??0)/100);
        r.takeLiquid(64,fuel);r.recordHistoryFlow(64,fuel);
      }
      const wear=(tr.maxHealth/Math.max(tr.health,1))*.00002;
      tr.lubricantLevel=Math.max(0,(tr.lubricantLevel??0)-(type.maxLubricant??0)*wear*(Math.random()*n*100*this.gameSpeed+Math.random()*distance));
      if(!type.windPowered)tr.waterLevel=Math.max(0,(tr.waterLevel??0)-(type.maxWater??0)*wear*(Math.random()*n*100*this.gameSpeed+Math.random()*distance));
      let damage=distance*.01;
      if(tr.lubricantLevel<(type.maxLubricant??0)*.1)damage*=1.5;
      if(tr.lubricantLevel<=0)damage*=2;
      if(!type.windPowered&&tr.waterLevel<=0)damage*=2;
      tr.health=Math.max(0,tr.health-damage);
    }
    // 原版移动公式（MapMode.as L947-950）：x += sin(dir)*s; y -= cos(dir)*s（0=北，顺时针）
    r.x += Math.sin(r.direction) * t;
    r.y -= Math.cos(r.direction) * t;
    r.squareX = Math.floor(r.x / GameData.squareSize);
    r.squareY = Math.floor(r.y / GameData.squareSize);
    this.mapCenterX = r.x;
    this.mapCenterY = r.y;
    this.caravanMovedToday = true;
    return true;
  }
}
