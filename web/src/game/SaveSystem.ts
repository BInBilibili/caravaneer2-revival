import { discoverVisibleTowns } from "./TownVisibility";
// 存档系统：版本化 JSON 格式（对齐原版 generateSave 的语义子集）
// savedData.data.saves: [{ name, date, data: SaveData }]
import type { GameData, EnemySquad } from "./World";
import { Caravan, Character, NpcCaravan, sanitizeEnemySquad } from "./World";
import { SharedObjectLike } from "../core/SaveStore";
import { migrateFlatFactionRelations } from "./factionRelations";

export interface SaveData {
  version: 1;
  /** DLC/Mod identity lock for deterministic saves. */
  mods?: Array<{ id: string; version: string }>;
  name: string;
  day: number;
  time: number;
  storyMode: boolean;
  difficulty: number;
  gameSpeed: number;
  showTutorial?: boolean;
  displayedTutorials?: number[];
  navigation?: {scale:number;centerX:number;centerY:number;routeStart:GameData["routeStart"];routeEnd:GameData["routeEnd"];lastSextantPos:number[];lastSextantOffset:number;lastSextantMeasurement:number;sextantExperience?:number};
  producedToday?: Record<number, number>;
  knownPrices?: GameData["knownPrices"];
  transportAsPassengers?: boolean;
  settings?: Partial<Pick<GameData, "pauseOnExitTown" | "interactWithFriendlyCaravans" | "distributeBatteries" | "advancedTrading" | "warnedAboutAdvancedTrading" | "autoSave">>;
  caravan: {
    x: number; y: number; direction: number; moving: boolean; money: number;
    cargo: Array<{ item: number; amount: number }>;
    /** New saves include liquids in cargo; absent flag identifies legacy Web split-liquid saves. */
    cargoIncludesLiquids?: boolean;
    liquidContainerAssignments?: import("./LiquidStorage").ContainerAssignments;
    historicalData?: import("./ConsProdGraph").HistoricalPoint[];
    liquidsContainers?: Record<number, Array<{ type: number; amount: number }>>;
    people: Array<Record<string, any>>;
    transports?: Array<{ type: number; health: number; maxHealth: number; Passengers?: Array<{ k: string; i: number } | null>; passengerIn?: { k: string; i: number } | null; cart?: { k: string; i: number } | null; attachedTo?: { k: string; i: number } | null }>;
    groupSettings?: any;
    groupSettingsAll?: Array<any>;
    collectForage?: boolean;
    hunt?: boolean;
    milk?: boolean;
    shear?: boolean;
    zoneForageDevastation?: number;
    zonePreyDevastation?: number;
    autoFillLubricant?: boolean;
    autoFillWater?: boolean;
    chargingBatteries?: number[];
    inUse?: Record<number, number>;
    /** ⑦i 买入加权均价（原版 Cargo[].averagePrice；6806 "Price you paid" 显示用） */
    averagePrice?: Record<number, number>;
      slavers?: boolean; // 奴隶商车队标记（t5）
  };
  story?: {
    flags: Record<string, any>;
    specificReputations: Record<number, number>;
    currentRelationships: Record<number, number>;
    factionRelations: number[][]; // 三角矩阵（行 i 恰 i 个元素，row0 空）
    acceptedQuests: number[];
    completedQuests?: number[];
    failedQuests?: number[];
    questLog: Record<number, string>;
    characterRelations: Record<number, number>;
    dialogueDefaults: Record<number, number>;
  };
  revealedFactions?: number[];
  /** 商队选单最后打开的标签页（原版 lastCaravanMenuCategory）；老档缺省 → 2（人员页） */
  lastCaravanMenuCategory?: number;
  /** NPC 车队（地图上移动的路线商队/Rovers 等；原版 GD.Caravans 全量存档子集——身份字段 + 物化 squad）。
   *  缺段（老档）= undefined → applySave 重置为空数组，spawnNpcCaravans 走 type 驱动重生成。 */
  npcCaravans?: Array<{
    id: number;
    type: number;
    faction: number;
    aggressive: boolean;
    slavers: boolean;
    slavesHeld: number;
    money: number;
    defenders: number; // 人数（原版 size 或 equipRandomCaravan 的 fixedPeopleNum）
    name: string;
    fearless: boolean;
    x: number;
    y: number;
    direction: number | null;
    moving: boolean;
    speedKmh: number;
    sightRange?: number;
    morale?: number;
    /** 模拟深度：原版 category（1=遭遇 / 2=自由民 / 5=路线商队）；旧档缺省按 routePoints/stateless 推断 */
    category?: number;
    /** 识别迷雾：车队可见性（缺省 150） */
    noticeability?: number;
    route: number;
    routePoint: number;
    pointIdx: number;
    lastConsumption?: number | null;
    routePoints: number[];
    points?: NpcCaravan["points"];
    inUse?: Record<number,number>;
    cargo: Array<{ item: number; amount: number }>;
    /** ⑦a 敌方载具/驮畜（equipRandomCaravan transport 分支；战后缴获 → 玩家车队） */
    transports?: Array<any>;
    /** ⑦g 自由民车队真实成员（leave 释放的奴隶 category=1） */
    people?: Array<Record<string, any>>;
    /** 物化后的遭遇车队（equipRandomCaravan 产物）；null=战斗时再生成（路线商队 fearless 无 squad） */
    squad: {
      type: number; faction: number; name: string; people: Array<Record<string, any>>; money: number; slaves: number;
      transports?: Array<any>;
      slavePeople?: Array<Record<string, any>>;
      cargoLoot?: Array<{ item: number; amount: number }>;
    } | null;
  }>;
  towns?: Array<{
    altName?: string;
    id: number;
    population: number;
    money?: number;
    playersMoney?: number;
    discovered: boolean;
    active?: boolean;
    tax?: number;
    GDPperCapita?: number | null;
    playersStorageSpace?: number;
    playersStorage?: Array<{type:number;amount:number}>;
    incompleteProduction?: Array<{item:number;amount:number}>;
    playersIncompleteProduction?: Array<{item:number;amount:number}>;
    unemployed?: number;
    electricityPrice?: number;
    prices?: Record<number, number>;
    stock?: Array<{ item: number; amount: number }>;
    industries?: Array<{ type: number; volume: number; forSale: boolean; employees: number }>;
    playersIndustries?: Array<{ type: number; volume: number; employees: number }>;
    /** Runtime facility visibility (story/DLC locations can be unlocked). */
    locationVisibility?: boolean[];
    people?: Array<Record<string, any>>; // 城镇可雇佣/已解雇成员
    school?: Array<Record<string, any>>; // 学校在读学员（原版 facility.people；从车队移出，需随存档保存）
    historicalData?: Array<{
      time: number;
      production: Array<{ item: number; amount: number }>;
      consumption: Array<{ item: number; amount: number }>;
      playersProduction: Array<{ item: number; amount: number }>;
      playersConsumption: Array<{ item: number; amount: number }>;
    }>;
  }>;
  discoveredTowns: number[];
  savedAt: string;
}

export const SAVE_SLOTS = 6;

export function makeSave(gd: GameData): SaveData {
  const c = gd.Caravans[0];
  const d = gd.makeDate();
  const name = (c.People[0]?.name || "Player");
  c.rebuildLiquidsContainers();
  const npcRef = (n:NpcCaravan,u:any) => {
    if (!u) return null;
    const person=n.people.indexOf(u);if(person>=0)return {k:"p",i:person};
    const transport=n.transports.indexOf(u);return transport>=0?{k:"t",i:transport}:null;
  };
  return {
    version: 1,
    mods: gd.ds.runtime?.activeModList(),
    name,
    day: d.day,
    time: gd.Time,
    storyMode: gd.storyMode,
    difficulty: gd.difficulty,
    gameSpeed: gd.gameSpeed,
    showTutorial: gd.showTutorial,
    displayedTutorials: [...gd.displayedTutorials],
    navigation: {sextantExperience:gd.sextantExperience,scale:gd.mapScale,centerX:gd.mapCenterX,centerY:gd.mapCenterY,routeStart:gd.routeStart?{...gd.routeStart}:null,routeEnd:gd.routeEnd?{...gd.routeEnd}:null,lastSextantPos:[...gd.lastSextantPos],lastSextantOffset:gd.lastSextantOffset,lastSextantMeasurement:gd.lastSextantMeasurement},
    producedToday: { ...(gd.producedToday ?? {}) },
    knownPrices: gd.knownPrices.map(p => ({...p})),
    transportAsPassengers: gd.transportAsPassengers,
    settings: {pauseOnExitTown: gd.pauseOnExitTown, interactWithFriendlyCaravans: gd.interactWithFriendlyCaravans, distributeBatteries: gd.distributeBatteries, advancedTrading: gd.advancedTrading, warnedAboutAdvancedTrading: gd.warnedAboutAdvancedTrading, autoSave: gd.autoSave},
    caravan: {
      x: c.x, y: c.y, direction: c.direction, moving: c.moving, money: c.money,
      // Original Cargo includes liquids; keep assignments separate from liquid quantities.
      cargo: [...c.cargo.entries()].map(([item, amount]) => ({ item, amount })),
      cargoIncludesLiquids: true,
      liquidContainerAssignments: JSON.parse(JSON.stringify(c.liquidContainerAssignments)),
      historicalData: JSON.parse(JSON.stringify(c.historicalData)),
      liquidsContainers: c.liquidsContainers && Object.keys(c.liquidsContainers).length
        ? JSON.parse(JSON.stringify(c.liquidsContainers)) : undefined,
      // 全字段深拷贝（属性/装备/伤势/生存状态；weapons/attachments/equipment 为嵌套结构，浅展开会共享引用）
      // 乘客关系（person.passengerIn）→ {k,i} 索引桩，防循环引用
      people: c.People.map((p) => JSON.parse(JSON.stringify({ ...p, passengerIn: c.seatRefOf((p as any).passengerIn) }))),
      transports: c.transports.map((tr) => ({
        ...tr,
        Passengers: (tr.Passengers ?? []).map((u: any) => c.seatRefOf(u)),
        passengerIn: c.seatRefOf(tr.passengerIn),
        cart: c.seatRefOf(tr.cart),
        attachedTo: c.seatRefOf(tr.attachedTo),
      })),
      groupSettings: c.groupSettings ? JSON.parse(JSON.stringify(c.groupSettings)) : undefined,
      groupSettingsAll: c.groupSettingsAll ? JSON.parse(JSON.stringify(c.groupSettingsAll)) : undefined,
      collectForage: c.collectForage,
      hunt: c.hunt,
      milk: c.milk,
      shear: c.shear,
      zoneForageDevastation: c.zoneForageDevastation,
      zonePreyDevastation: c.zonePreyDevastation,
      autoFillLubricant: c.autoFillLubricant,
      autoFillWater: c.autoFillWater,
      chargingBatteries: [...c.chargingBatteries],
      inUse: { ...c.inUse },
      averagePrice: { ...c.averagePrice },
      slavers: !!c.slavers,
    },
    savedAt: new Date().toISOString(),
    story: gd.story ? {
      flags: { ...gd.story.flags },
      specificReputations: { ...gd.story.specificReputations },
      currentRelationships: { ...gd.story.currentRelationships },
      factionRelations: Array.isArray(gd.story.factionRelations) ? gd.story.factionRelations.map((r: number[]) => [...r]) : [],
      acceptedQuests: [...gd.story.acceptedQuests],
      completedQuests: [...(gd.story.completedQuests ?? [])],
      failedQuests: [...(gd.story.failedQuests ?? [])],
      questLog: { ...gd.story.questLog },
      characterRelations: { ...gd.story.characterRelations },
      dialogueDefaults: { ...gd.story.dialogueDefaults },
    } : undefined,
    discoveredTowns: gd.Towns.filter((t) => t.discovered).map((t) => t.id),
    revealedFactions: [...(gd.revealedFactions ?? [])],
    lastCaravanMenuCategory: gd.lastCaravanMenuCategory,

    npcCaravans: gd.npcCaravans.map((n) => ({
      id: n.id,
      type: n.type,
      faction: n.faction,
      aggressive: n.aggressive,
      slavers: n.slavers,
      slavesHeld: n.slavesHeld,
      money: n.money,
      defenders: n.defenders,
      name: n.name,
      fearless: n.fearless,
      x: n.x, y: n.y,
      direction: n.direction,
      specialPurpose:n.specialPurpose,
      dlcDestination:n.dlcDestination,
      moving: n.moving,
      speedKmh: n.speedKmh,
      sightRange: n.sightRange,
      morale: n.morale,
      category: n.category,
      noticeability: n.noticeability,
      route: n.route,
      routePoint: n.routePoint,
      pointIdx: n.pointIdx,
      lastConsumption: n.lastConsumption,
      routePoints: [...n.routePoints],
      points: JSON.parse(JSON.stringify(n.points)),
      inUse: {...n.inUse},
      cargo: [...n.cargo.entries()].map(([item, amount]) => ({ item, amount })),
      // Route caravans also have real towing/passenger cycles: persist index references, not objects.
      transports: n.transports.map((tr:any)=>({...tr,Passengers:(tr.Passengers??[]).map((u:any)=>npcRef(n,u)),
        passengerIn:npcRef(n,tr.passengerIn),cart:npcRef(n,tr.cart),attachedTo:npcRef(n,tr.attachedTo)})),
      people: n.people.map(p=>JSON.parse(JSON.stringify({...p,passengerIn:npcRef(n,p.passengerIn)}))),
      squad: n.squad ? {
        type: n.squad.type,
        faction: n.squad.faction,
        name: n.squad.name,
        // skillExperience 是嵌套对象：浅拷贝只复制引用，会让存档快照与活体 squad 共享同一对象 ⇒ 深拷贝
        people: n.squad.people.map((p) => ({ ...p, ...(p.skillExperience ? { skillExperience: { ...p.skillExperience } } : {}) })),
        money: n.squad.money,
        slaves: n.squad.slaves,
        transports: (n.squad.transports ?? []).map((tr: any) => ({ ...tr, Passengers: [] })),
        // ⑦f 奴隶真身（深拷贝）
        slavePeople: (n.squad.slavePeople ?? []).map((p: any) => JSON.parse(JSON.stringify(p))),
        // ⑦b 敌方货物
        cargoLoot: (n.squad.cargoLoot ?? []).map((e: any) => ({ item: e.item, amount: e.amount })),
      } : null,
    })),
    towns: gd.Towns.map((t) => ({
      id: t.id,
      altName:t.altName,
      population: t.population,
      money: t.money,
      playersMoney: t.playersMoney,
      discovered: t.discovered,
      active: t.active,
      tax: t.tax,
      GDPperCapita: t.GDPperCapita,
      playersStorageSpace: t.playersStorageSpace,
      playersStorage: t.playersStorage.map(e=>({...e})),
      incompleteProduction: t.incompleteProduction.map(e=>({...e})),
      playersIncompleteProduction: t.playersIncompleteProduction.map(e=>({...e})),
      unemployed: t.unemployed,
      electricityPrice: t.electricityPrice,
      prices: { ...t.prices },
      stock: [...t.stock.entries()].map(([item, amount]) => ({ item, amount })),
      industries: t.industries.map((ind) => ({ ...ind })),
      playersIndustries: t.playersIndustries.map((ind) => ({ ...ind })),
      locationVisibility: t.locations.map((loc) => loc.visible !== false),
      people: t.people?.map(p => JSON.parse(JSON.stringify({ ...p, passengerIn: null }))),
      school: (t.locations ?? []).filter((l) => l.category === 4).flatMap((l) => (l.people ?? []).map((p: any) => JSON.parse(JSON.stringify({ ...p, passengerIn: null })))),
      historicalData: t.historicalData.map((h) => ({
        time: h.time,
        production: h.production.map((e) => ({ ...e })),
        consumption: h.consumption.map((e) => ({ ...e })),
        playersProduction: h.playersProduction.map((e) => ({ ...e })),
        playersConsumption: h.playersConsumption.map((e) => ({ ...e })),
      })),
    })),
  };
}

export function applySave(gd: GameData, s: SaveData) {
  // 原版 IndustrialMagnate.onGameInit 每次游戏初始化都会同时设置这两个运行时开关。
  // 主菜单切换 DLC 后复用既有 GameData 再读档时，也必须重新应用，不能沿用切换前的 false。
  if (gd.ds.gamedata.originalDlcFeatures?.['industrial-magnate']) gd.canBreakEconomy = true;
  gd.Time = s.time;
  gd.storyMode = s.storyMode;
  gd.difficulty = s.difficulty;
  for (const town of gd.Towns) town.difficulty = gd.difficulty;
  gd.showTutorial = s.showTutorial ?? true;
  gd.displayedTutorials = [...(s.displayedTutorials ?? [])];
  // 商队选单默认标签（老档缺段 → 2 人员页，对齐原版 GameData.as L538）
  gd.lastCaravanMenuCategory = typeof s.lastCaravanMenuCategory === "number" ? s.lastCaravanMenuCategory : 2;

  gd.gameSpeed = 0; // Loading restores the route, but never resumes world simulation automatically.
  gd.knownPrices = (s.knownPrices ?? []).map(p => ({...p}));
  gd.transportAsPassengers = !!s.transportAsPassengers;
  for (const key of ["pauseOnExitTown","interactWithFriendlyCaravans","distributeBatteries","advancedTrading","warnedAboutAdvancedTrading","autoSave"] as const) {
    if (typeof s.settings?.[key] === "boolean") gd[key] = s.settings[key]!;
  }
  if (s.producedToday && typeof s.producedToday === "object") gd.producedToday = { ...s.producedToday };
  else gd.resetProducedToday();
  const c = gd.Caravans[0];
  c.x = s.caravan.x; c.y = s.caravan.y;
  c.direction = s.caravan.direction; c.moving = s.caravan.moving;
  c.money = s.caravan.money;
  c.cargo = new Map(s.caravan.cargo.map((e) => [e.item, e.amount]));
  c.liquidContainerAssignments = JSON.parse(JSON.stringify(s.caravan.liquidContainerAssignments ?? {}));
  c.historicalData = JSON.parse(JSON.stringify(s.caravan.historicalData ?? []));
  // Legacy Web saves omitted liquids from cargo. Fold that metadata only once.
  if (!s.caravan.cargoIncludesLiquids && s.caravan.liquidsContainers && typeof s.caravan.liquidsContainers === "object") {
    c.liquidsContainers = JSON.parse(JSON.stringify(s.caravan.liquidsContainers));
    for (const k of Object.keys(s.caravan.liquidsContainers)) {
      const bucket = (s.caravan.liquidsContainers as any)[k];
      if (!Array.isArray(bucket)) continue;
      for (const e of bucket) {
        const t = Number(e.type), amt = Number(e.amount);
        if (t > 0 && amt > 0) c.cargo.set(t, (c.cargo.get(t) ?? 0) + amt);
      }
    }
  } else {
    // 旧档兜底：液体在 cargo 里 → 重建分组元数据（容器优先）
    c.liquidsContainers = {};
  }
  if (Array.isArray(s.caravan.transports)) c.transports = s.caravan.transports.map((tr) => c.fixTransport({ ...tr }));
  if (typeof s.caravan.slavers === "boolean") c.slavers = s.caravan.slavers;
  if (s.caravan.groupSettings && typeof s.caravan.groupSettings === "object") c.groupSettings = JSON.parse(JSON.stringify(s.caravan.groupSettings));
  if (Array.isArray(s.caravan.groupSettingsAll)) {
    c.groupSettingsAll = JSON.parse(JSON.stringify(s.caravan.groupSettingsAll));
    c.groupSettings = ((c.groupSettingsAll as any[])[1] ?? (c.groupSettingsAll as any[]).find(Boolean)) as any;
  }
  if (typeof s.caravan.collectForage === "boolean") c.collectForage = s.caravan.collectForage;
  if (typeof s.caravan.hunt === "boolean") c.hunt = s.caravan.hunt;
  if (typeof s.caravan.milk === "boolean") c.milk = s.caravan.milk;
  if (typeof s.caravan.shear === "boolean") c.shear = s.caravan.shear;
  if (typeof s.caravan.zoneForageDevastation === "number") c.zoneForageDevastation = s.caravan.zoneForageDevastation;
  if (typeof s.caravan.zonePreyDevastation === "number") c.zonePreyDevastation = s.caravan.zonePreyDevastation;
  if (typeof s.caravan.autoFillLubricant === "boolean") c.autoFillLubricant = s.caravan.autoFillLubricant;
  if (typeof s.caravan.autoFillWater === "boolean") c.autoFillWater = s.caravan.autoFillWater;
  if (Array.isArray(s.caravan.chargingBatteries)) c.chargingBatteries = [...s.caravan.chargingBatteries];
  c.inUse = { ...(s.caravan.inUse ?? {}) };
  c.rebuildLiquidsContainers();
  // ⑦i 买入加权均价恢复（原版 Cargo.averagePrice）
  if (s.caravan.averagePrice && typeof s.caravan.averagePrice === "object") c.averagePrice = { ...s.caravan.averagePrice };
  if (s.caravan.people.length) {
    c.People = s.caravan.people.map((p) => {
      const ch = new Character();
      Object.assign(ch, p);
      // 旧档/原版档兜底迁移（TEAM-CHARACTER-SPEC §4.5）：weapons 双槽/attachments/equipment 结构/Height·_weight·_morale 命名
      Character.fixup(ch, gd.ds);
      return ch;
    });
  }
  // 乘客/车架关系恢复（{k,i} 索引桩 → 对象引用；People/transports 已重建）
  {
    const savedTrs = s.caravan.transports ?? [];
    const byRef = (ref: any): any => {
      if (!ref || typeof ref !== "object" || typeof ref.i !== "number") return null;
      return ref.k === "p" ? (c.People[ref.i] ?? null) : ref.k === "t" ? (c.transports[ref.i] ?? null) : null;
    };
    for (let idx = 0; idx < c.People.length; idx++) c.People[idx].passengerIn = byRef(s.caravan.people[idx]?.passengerIn);
    for (let idx = 0; idx < savedTrs.length; idx++) {
      const st = savedTrs[idx];
      const o = c.transports[idx];
      if (!o) continue;
      if (Array.isArray(st.Passengers)) o.Passengers = st.Passengers.map(byRef).filter((x: any) => !!x);
      else o.Passengers = [];
      o.passengerIn = byRef(st.passengerIn) ?? null;
      o.cart = byRef(st.cart) ?? null;
      o.attachedTo = byRef(st.attachedTo) ?? null;
      // 人侧 passengerIn 恢复（applySave 早期 people 还原时 passengerIn 是桩）
      if (Array.isArray(st.Passengers)) {
        for (const p of o.Passengers) if (p.passengerIn === null || p.passengerIn === undefined) p.passengerIn = o;
      }
    }
    // Reconcile both ends, including older saves that only recorded one end.
    const seated = new Set<any>();
    for (const tr of c.transports) {
      tr.Passengers = c.passengersOf(tr).filter(p => {
        if (p === tr || seated.has(p)) return false;
        seated.add(p); p.passengerIn = tr; return true;
      });
    }
    for (const p of [...c.People, ...c.transports]) {
      if (!seated.has(p) && p.passengerIn && p.passengerIn !== p) {
        (p.passengerIn.Passengers ??= []).push(p); seated.add(p);
      } else if (p.passengerIn === p) p.passengerIn = null;
    }
  }
  gd.mapCenterX = s.navigation?.centerX ?? c.x; gd.mapCenterY = s.navigation?.centerY ?? c.y;
  gd.mapScale = Math.max(.1,Math.min(10,s.navigation?.scale || 1));
  gd.routeStart=s.navigation?.routeStart?{...s.navigation.routeStart}:null;gd.routeEnd=s.navigation?.routeEnd?{...s.navigation.routeEnd}:null;
  gd.sextantExperience=s.navigation?.sextantExperience??0;
  gd.lastSextantPos=[...(s.navigation?.lastSextantPos??[])];gd.lastSextantOffset=s.navigation?.lastSextantOffset??0;gd.lastSextantMeasurement=s.navigation?.lastSextantMeasurement??0;
  // 剧情状态恢复
  if (s.story) {
    const StoryCls = (globalThis as any).__c2Story as any;
    if (StoryCls) {
      const story = new StoryCls(gd.ds);
      Object.assign(story.flags, s.story.flags);
      Object.assign(story.specificReputations, s.story.specificReputations ?? {});
      Object.assign(story.currentRelationships, s.story.currentRelationships ?? {});
      if (Array.isArray(s.story.factionRelations)) {
        // 矩阵存档：深拷贝恢复（避免与后续原地修改共享引用）
        story.factionRelations = s.story.factionRelations.map((r: any) => (Array.isArray(r) ? r.slice() : []));
      } else if (s.story.factionRelations && typeof s.story.factionRelations === "object") {
        // 老档扁平 Record<number,number>（faction→value，即 (faction,玩家0) 关系）→ 三角矩阵（其余格 presets 补齐）
        story.factionRelations = migrateFlatFactionRelations(s.story.factionRelations as any, gd.ds);
      }
      story.acceptedQuests = [...(s.story.acceptedQuests ?? [])];
      story.completedQuests = [...(s.story.completedQuests ?? [])];
      story.failedQuests = [...(s.story.failedQuests ?? [])];
      story.questLog = { ...(s.story.questLog ?? {}) };
      Object.assign(story.characterRelations, s.story.characterRelations ?? {});
      Object.assign(story.dialogueDefaults, s.story.dialogueDefaults ?? {});
      gd.story = story;
    }
  }
  if (gd.ds.gamedata.originalDlcFeatures?.['industrial-magnate'] && gd.story) {
    (gd.story as any).finishedTheGame = true;
    if ((gd.story as any).flags) (gd.story as any).flags.finishedTheGame = true;
  }
  // 只合并当前存档的两种记录，不能继承加载前另一局的发现状态。
  const discovered = new Set(s.discoveredTowns ?? []);
  for (const town of gd.Towns) town.discovered = discovered.has(town.id);
  if (Array.isArray(s.revealedFactions)) gd.revealedFactions = [...s.revealedFactions];
  // NPC 车队恢复：有段则按物化身份+squad 重建；老档缺段 → 重置为空，spawnNpcCaravans 走 type 驱动重生成
  if (Array.isArray(s.npcCaravans) && s.npcCaravans.length > 0) {
    gd.npcCaravans = s.npcCaravans.map((sn) => {
      const npc = new NpcCaravan(sn.id, Array.isArray(sn.routePoints) ? sn.routePoints : [], sn.name || "");
      npc.type = sn.type ?? 0;
      npc.faction = sn.faction ?? 0;
      npc.aggressive = !!sn.aggressive;
      npc.slavers = !!sn.slavers;
      npc.slavesHeld = sn.slavesHeld ?? 0;
      npc.money = sn.money ?? 0;
      npc.defenders = sn.defenders ?? 0;
      npc.fearless = !!sn.fearless;
      npc.x = sn.x ?? 0; npc.y = sn.y ?? 0;
      npc.direction = sn.direction ?? null;
      npc.specialPurpose=(sn as any).specialPurpose;
      npc.dlcDestination=(sn as any).dlcDestination;
      npc.moving = !!sn.moving;
      npc.speedKmh = sn.speedKmh ?? (8 + Math.random() * 8);
      npc.sightRange = typeof sn.sightRange === "number" ? sn.sightRange : 160;
      npc.morale = typeof sn.morale === "number" ? sn.morale : 50;
      // 模拟深度：新档直取；旧档推断——stateless=遭遇(1)；多路线点=路线商队(5)；单点/未知=遭遇(1)
      npc.category = typeof sn.category === "number" ? sn.category : (((sn as any).stateless === true || !Array.isArray(sn.routePoints) || sn.routePoints.length <= 1) ? 1 : 5);
      npc.noticeability = typeof sn.noticeability === "number" ? sn.noticeability : 150;
      npc.route = sn.route ?? 0;
      npc.routePoint = sn.routePoint ?? 0;
      npc.pointIdx = sn.pointIdx ?? sn.routePoint ?? 0;
      npc.lastConsumption = sn.lastConsumption ?? null;
      npc.cargo = new Map((sn.cargo ?? []).map((e) => [e.item, e.amount]));
      npc.inUse = {...sn.inUse};
      const routes = gd.ds.presets?.caravan_routes?.[0] ?? [];
      if(npc.category===5 && !sn.points?.length){
        const matched=routes.findIndex((r:any)=>r.points?.length===npc.routePoints.length&&r.points.every((p:any,i:number)=>p.town===npc.routePoints[i]));
        if(matched>=0)npc.route=matched;
      }
      npc.points=JSON.parse(JSON.stringify(sn.points?.length?sn.points:(npc.category===5?routes[npc.route]?.points??[]:[])));
      // ⑦a 敌方载具恢复（fixTransport 补默认字段；敌方载具无乘客引用桩）
      if (Array.isArray(sn.transports)) {
        npc.transports = sn.transports.map((tr: any) => gd.Caravans[0].fixTransport({ ...tr }));
      }
      // ⑦g 自由民车队真实成员恢复
      if (Array.isArray(sn.people) && sn.people.length) {
        npc.people = sn.people.map((p) => {
          const ch = new Character();
          Object.assign(ch, p);
          Character.fixup(ch, gd.ds);
          return ch;
        });
      }
      const byRef=(ref:any):any=>ref?.k==="p"?npc.people[ref.i]??null:ref?.k==="t"?npc.transports[ref.i]??null:null;
      for(const [i,p] of npc.people.entries())p.passengerIn=byRef(sn.people?.[i]?.passengerIn);
      for(const [i,tr] of npc.transports.entries()){const saved=sn.transports?.[i];
        tr.Passengers=(saved?.Passengers??[]).map(byRef).filter(Boolean);tr.passengerIn=byRef(saved?.passengerIn);
        tr.cart=byRef(saved?.cart);tr.attachedTo=byRef(saved?.attachedTo);
      }
      // Older Web route caravans had only a map marker. Fill missing units once,
      // retaining cash, goods, current destination and without replaying arrival trades.
      if(npc.category===5&&!npc.people.length&&routes[npc.route])gd.materializeNpcRoute(npc,routes[npc.route],true);
      // squad 经 sanitizeEnemySquad 净化：t6~t11 之间存的旧档带越界属性（basePhysical 可达 14、maxHP 280，
      // _HP 与 maxHP 曾各自独立 roll 导致约 50% 概率 _HP > maxHP），原样直传会把已修掉的 bug 从存档带回。
      npc.squad = sn.squad ? sanitizeEnemySquad({
        type: sn.squad.type,
        faction: sn.squad.faction,
        name: sn.squad.name,
        people: (sn.squad.people ?? []).map((p) => ({ ...p, ...(p.skillExperience ? { skillExperience: { ...p.skillExperience } } : {}) })),
        money: sn.squad.money,
        slaves: sn.squad.slaves,
        transports: (sn.squad.transports ?? []).map((tr: any) => ({ ...tr, Passengers: [] })),
        slavePeople: (sn.squad.slavePeople ?? []).map((p) => {
          const ch = new Character();
          Object.assign(ch, p);
          Character.fixup(ch, gd.ds);
          return ch;
        }),
        cargoLoot: (sn.squad.cargoLoot ?? []).map((e: any) => ({ item: e.item, amount: e.amount })),
      } as EnemySquad) : null;
      return npc;
    });
  } else {
    gd.npcCaravans = []; // 老档：读档后 enterGdMode(1) 会 spawnNpcCaravans 重生成（type 驱动，非臆造）
  }
  // 城镇经济快照恢复（原版存档导入或本存档导出）
  if (Array.isArray(s.towns)) {
    for (const st of s.towns) {
      const t = gd.Towns[st.id];
      if (!t) continue;
      if(typeof st.altName==='string'){t.altName=st.altName;t.name=st.altName;}
      if (typeof st.population === "number") t.population = st.population;
      // 旧档可能只有顶层 discoveredTowns，缺失／旧 false 不得覆盖已恢复的 true。
      t.discovered = t.discovered || !!st.discovered;
      t.active = st.active !== false;
      if (typeof st.tax === "number") t.tax = st.tax;
      if (st.GDPperCapita !== undefined) t.GDPperCapita = st.GDPperCapita;
      if (typeof st.playersStorageSpace === "number") t.playersStorageSpace = st.playersStorageSpace;
      if(Array.isArray(st.playersStorage))t.playersStorage=st.playersStorage.map(e=>({...e}));
      if(Array.isArray(st.incompleteProduction))t.incompleteProduction=st.incompleteProduction.map(e=>({...e}));
      if(Array.isArray(st.playersIncompleteProduction))t.playersIncompleteProduction=st.playersIncompleteProduction.map(e=>({...e}));
      if (typeof st.unemployed === "number") t.unemployed = st.unemployed;
      if (typeof st.electricityPrice === "number") t.electricityPrice = st.electricityPrice;
      if (typeof st.money === "number") t.money = st.money;
      if (typeof st.playersMoney === "number") t.playersMoney = st.playersMoney;
      if (st.prices && typeof st.prices === "object") t.prices = { ...st.prices };
      // 缺省旧档保留初始库存；显式空库存必须保持为空，不能凭空补货。
      if (Array.isArray(st.stock)) t.stock = new Map(st.stock.map((e) => [e.item, e.amount]));
      if (Array.isArray(st.industries)) t.industries = st.industries.map((ind) => ({ type: ind.type, volume: ind.volume ?? 0, forSale: !!ind.forSale, employees: ind.employees ?? 0 }));
      if (Array.isArray(st.playersIndustries)) t.playersIndustries = st.playersIndustries.map((ind) => ({ type: ind.type, volume: ind.volume ?? 0, employees: ind.employees ?? 0 }));
      if (Array.isArray(st.locationVisibility)) {
        for (let i = 0; i < Math.min(st.locationVisibility.length, t.locations.length); i++)
          t.locations[i].visible = !!st.locationVisibility[i];
      }
      if (Array.isArray(st.people)) t.people = st.people.map(p => {
        const ch = new Character(p); ch.passengerIn = null; Character.fixup(ch, gd.ds); return ch;
      });
      else t.people = undefined;
      // 学校在读学员恢复（原版 facility.people；学员不在车队 People 中）
      if (Array.isArray(st.school)) {
        const schoolLoc = (t.locations ?? []).find((l) => l.category === 4);
        if (schoolLoc) {
          schoolLoc.people = st.school.map((p: any) => {
            const ch = new Character();
            Object.assign(ch, p);
            Character.fixup(ch, gd.ds);
            return ch;
          });
        }
      }
      if (Array.isArray(st.historicalData)) {
        t.historicalData = st.historicalData
          .filter((h) => h && typeof h.time === "number")
          .map((h) => ({
            time: h.time,
            production: Array.isArray(h.production) ? h.production.map((e) => ({ item: e.item, amount: e.amount })) : [],
            consumption: Array.isArray(h.consumption) ? h.consumption.map((e) => ({ item: e.item, amount: e.amount })) : [],
            playersProduction: Array.isArray(h.playersProduction) ? h.playersProduction.map((e) => ({ item: e.item, amount: e.amount })) : [],
            playersConsumption: Array.isArray(h.playersConsumption) ? h.playersConsumption.map((e) => ({ item: e.item, amount: e.amount })) : [],
          }));
      }
    }
  }
  // 只修复有明确剧情证据或目前真正可见的城镇，不凭空揭开整张地图。
  const flags = gd.story?.flags ?? {};
  // Migration for saves made before facility visibility was serialized.
  // SpecialStory responses 3380/3445 set both this flag and Town 17 slot 5.
  if (flags.additionalVariables?.knowWhereFinnIs && gd.Towns[17]?.locations[5])
    gd.Towns[17].locations[5].visible = true;
  if ((flags.enteredBunkerForTheFirstTime || flags.exitedBunker) && gd.Towns[15]) gd.Towns[15].discovered = true;
  if ((flags.askedKukulAboutTribes || flags.askedKukulToTalkWithDrekar || flags.agreedToFindAnAllyForLintu) && gd.Towns[17]) gd.Towns[17].discovered = true;
  discoverVisibleTowns(gd);
}

export class SaveSlots {
  constructor(private store: SharedObjectLike) {}

  list(): Array<{ index: number; name: string; date: string; day: number; money: number } | null> {
    const saves: any[] = this.store.data.saves ?? [];
    const out = [];
    for (let i = 0; i < Math.max(SAVE_SLOTS, saves.length); i++) {
      const s = saves[i];
      if (s && s.data) {
        out.push({ index: i, name: s.name, date: s.date, day: s.data.day, money: s.data.caravan?.money ?? 0 });
      } else out.push(null);
    }
    return out;
  }

  /** LoadSaveDialogue.as: new manual saves start at 1. Slot 0 belongs to autosave. */
  nextManualSlot(): number {
    const saves = this.store.data.saves ?? [];
    for (let i = 1; i < saves.length; i++) if (!saves[i]) return i;
    return Math.max(1, saves.length);
  }

  private commit(saves: any[]) {
    const previous = this.store.data.saves;
    this.store.data.saves = saves;
    try {
      if (!this.store.flush()) throw new Error('Save storage write failed');
    } catch (error) {
      this.store.data.saves = previous;
      throw error;
    }
  }

  save(gd: GameData, slot: number, name?: string): SaveData {
    const data = makeSave(gd);
    this.writeManual(data, slot, name);
    return data;
  }

  private writeManual(data: SaveData, slot: number, name?: string) {
    if (!Number.isInteger(slot) || slot < 1) slot = this.nextManualSlot();
    const saves = [...(this.store.data.saves ?? [])];
    saves[slot] = { name: name === undefined ? data.name + " — Day " + data.day : name.slice(0, 40), date: data.savedAt, data };
    this.commit(saves);
  }

  saveAutomatic(gd: GameData, name: string) {
    const data = makeSave(gd), saves = [...(this.store.data.saves ?? [])];
    // Preserve a manual save written into slot 0 by older Web versions.
    if (saves[0]?.data && saves[0].auto !== true) saves[this.nextManualSlot()] = saves[0];
    saves[0] = {name, date: data.savedAt, data, auto: true};
    this.commit(saves);
  }

  load(slot: number): SaveData | null {
    const s = this.store.data.saves?.[slot];
    return s && s.data ? (s.data as SaveData) : null;
  }

  importSave(data: SaveData, slot: number) { this.writeManual(data, slot); }

  deleteSlot(slot: number) {
    const saves = [...(this.store.data.saves ?? [])];
    saves[slot] = null;
    this.commit(saves);
  }

  count(): number {
    return this.list().filter(Boolean).length;
  }
}
