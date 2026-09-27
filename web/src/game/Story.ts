// 剧情引擎：Story 状态 + AS3 with(env) 回调机械转译 + DialogueEnv 白名单方法
import type { DataStore } from "../core/DataStore";
import type { GameData } from "./World";
import { Character, Caravan, makeTransportUnit } from "./World";
import { ACCEPT_QUEST_BODY, COMPLETE_QUEST_BODY, FAIL_QUEST_BODY } from "./questData";
import { MAJOR_EVENT_BODY } from "./eventData";
import { factionRelationsFromPresets } from "./factionRelations";
import { ORIGINAL_DLC_HOOKS } from './originalDlcHooks';

// 把 FFDEC 反编译的 function(param1:*):* {...} 转成可执行的 JS 函数体
// 规则：去头部/参数/env 赋值/arguments.callee；var 类型标注剥离；用 with(env) 模拟 AS3 with 语义
export function transpileAs3Fn(as3: string, extraParams: string[] = []): (env: any, ...args: any[]) => any {
  let s = as3;
  // FFDEC misplaced an early-return guard outside its if and closed with(env)
  // prematurely. Match only the specific false/temp/return pattern (32 conditions).
  s = s.replace(/var (_loc\d+_)\s*:\s*Boolean = false;\s*var _loc\d+_\s*:\*;\s*}\s*return \1;\s*}/g,
    "return false; }");
  s = s.replace(/^\s*function\s*\([^)]*\)\s*:\*\s*/i, "");
  s = s.replace(/var\s+env\s*:\*\s*=\s*param1\s*;?/g, "");
  s = s.replace(/return\s+arguments\.callee\s*;?/g, "");
  s = s.replace(/\bvar\s+([A-Za-z_$][\w$]*)\s*:\s*[*A-Za-z0-9_.<>]+\s*(?==|;)/g, "var $1");
  // AS3 is 运算符 → JS（数字/字符串/数组/对象/类）
  s = s.replace(/([A-Za-z0-9_$\[\].]+)\s+is\s+(Number)\b/g, "(typeof $1 === \"number\")");
  s = s.replace(/([A-Za-z0-9_$\[\].]+)\s+is\s+(String)\b/g, "(typeof $1 === \"string\")");
  s = s.replace(/([A-Za-z0-9_$\[\].]+)\s+is\s+(Array)\b/g, "Array.isArray($1)");
  s = s.replace(/([A-Za-z0-9_$\[\].]+)\s+is\s+(Object)\b/g, "($1 !== null && typeof $1 === \"object\")");
  s = s.replace(/([A-Za-z0-9_$\[\].]+)\s+is\s+([A-Z][A-Za-z0-9_]*)\b/g, "($1 instanceof $2)");
  // FFDEC 拆段修复：跳过会使深度为负的杂散右花括号（体外输出），未闭合左花括号尾部补齐
  s = s.trim();
  {
    let depth = 0, out = "";
    for (const ch of s) {
      if (ch === "{") { depth++; out += ch; }
      else if (ch === "}") { if (depth > 0) { depth--; out += ch; } }
      else out += ch;
    }
    while (depth > 0) { out += "}"; depth--; }
    s = out;
  }
  const fn = new Function("env", ...extraParams, "with (env || {}) { " + s + " }");
  return (env: any, ...args: any[]) => {
    try {
      return fn(env, ...args);
    } catch (e) {
      console.warn("dialogue callback error:", e);
      (globalThis as any).__lastTranspileError = String(e) + " ||| src: " + s.slice(0, 300);
      return undefined;
    }
  };
}

export class Story {
  flags: Record<string, any> = {};
  specificReputations: Record<number, number> = {};
  currentRelationships: Record<number, number> = {};
  factionRelations: number[][] = []; // 三角矩阵（行 i 恰 i 个元素，row0 空）；构造时深拷贝 presets.faction_relations[0]
  acceptedQuests: number[] = [];
  completedQuests: number[] = []; // 原版 Story.completedQuests（Log Missions 页）
  failedQuests: number[] = []; // 原版 Story.failedQuests（Log Missions 页）
  questLog: Record<number, "active" | "done" | "failed"> = {};
  characterRelations: Record<number, number> = {};
  dialogueDefaults: Record<number, number> = {};

  constructor(ds: DataStore) {
    const ms = ds.mainStory;
    this.flags = { ...(ms.defaultDefaults ?? {}) };
    this.dialogueDefaults = {...(ms.defaultDefaults??{})};
    this.flags.additionalVariables = {};
    if(ds.gamedata.originalDlcFeatures?.['industrial-magnate']) {
      this.flags.finishedTheGame=true;
      (this as any).finishedTheGame=true;
    }
    // 剧情布尔标志（MainStory 类的 public var 以 false/0 默认）
    for (let i = 1; i <= 60; i++) {
      if (!(i in this.flags)) this.flags["flag" + i] = false;
    }
    for (let i = 0; i < 10; i++) this.specificReputations[i] = 0;
    // 阵营关系三角矩阵：深拷贝 presets（原版 GameData.as:801 引用赋值原地改；web 长驻必须深拷贝防跨局污染）
    this.factionRelations = factionRelationsFromPresets(ds);
  }

  get(name: string): any {
    if (name in this.flags) return this.flags[name];
    return undefined;
  }
  set(name: string, v: any) { this.flags[name] = v; }
}

// 对话环境：with(env) 里的自由变量/方法（白名单，未实现的方法为 no-op）
export function makeDialogueEnv(gd: GameData, ds: DataStore, storyIn?: Story): any {
  let story: Story;
  if (storyIn) {
    story = storyIn;
    if (!gd.story) gd.story = story;
  } else {
    if (!gd.story) gd.story = new Story(ds);
    story = gd.story as Story;
  }
  const c = () => gd.Caravans[0];
  // 守卫：acceptedQuests 恒为数组（原版代码可能在分支里重置）；
  // 原版代码直接给 Story.xxx 赋值（实例属性）→ 同步写入 flags 字典以便存档
  const guardedStory = new Proxy(story, {
    get(t, k) {
      if (k === "acceptedQuests" && !Array.isArray((t as any)[k])) (t as any)[k] = [];
      // 未知属性（剧情布尔标志等）回退到 flags 字典（事件/回调写入的 Story.xxx 存于此）
      if (typeof k === "string" && !(k in t)) return (t as any).flags[k];
      return (t as any)[k];
    },
    set(t, k, v) {
      if (typeof k === "string" && !["flags", "specificReputations", "currentRelationships", "factionRelations", "acceptedQuests", "questLog", "characterRelations", "dialogueDefaults"].includes(k)) {
        (t as any).flags[k] = v;
      }
      return Reflect.set(t, k, v);
    },
  });
  const env: any = {
    Story: guardedStory,
    GD: gd,
    GameData: gd,
    Texts: { fetch: (id: number) => ds.texts[String(id)]?.[1] ?? "" },
    Rndm: { random: () => Math.random() },
    MathFunctions: { random: (a: number, b: number) => a + Math.random() * (b - a), CalcDistance: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1) },
    Math,
    difficulty: gd.difficulty,
    Caravans: gd.Caravans,
    Towns: gd.Towns,
    // 原版 Item（type=item id, amount, inUse）：转译体 new Item(type,amount) 后调用 addItemToEquipment 等
    Item: class {
      type: number; amount: number; inUse = 0;
      constructor(_type: number, _amount: number) { this.type = _type; this.amount = _amount; }
    },
  };
  Object.defineProperty(env, "Time", { get: () => gd.Time });
  // —— 白名单方法 ——
  // 当前对话角色（DialogueScreen.start 时写入）；关系/默认入口按原版以当前角色为索引
  env.__dialogueChar = 1;
  env.__onLeave = null;
  env.__onWaitEffect = null;
  env.__onRefresh = null;
  env.__onWrongAnswerToMarco = null;
  env.__onOpenLocation = null;
  env.leave = () => {
    if (env.__onLeave) env.__onLeave();
    else if (gd.__onDialogueEnd) gd.__onDialogueEnd();
  };
  env.affectSpecificReputation = (who: number, amount: number) => {
    story.specificReputations[who] = (story.specificReputations[who] ?? 0) + amount;
  };
  env.getSpecificReputation = (who: number) => story.specificReputations[who] ?? 0;
  // 原版签名：affectCurrentRelationship(amount) → Story.characterRelations[当前角色] += amount
  env.affectCurrentRelationship = (amount: number) => {
    const ch = Number(env.__dialogueChar ?? 1);
    story.characterRelations[ch] = (story.characterRelations[ch] ?? 0) + (amount ?? 0);
  };
  // 原版签名：setCurrentDefault(entryId) → Story.dialogueDefaults[当前角色] = entryId
  env.setCurrentDefault = (entryId: number) => {
    const ch = Number(env.__dialogueChar ?? 1);
    if (entryId !== undefined && entryId !== null) story.dialogueDefaults[ch] = Number(entryId);
  };
  // 原版签名：getCurrentRelationship() → Story.characterRelations[当前角色]
  env.getCurrentRelationship = () => story.characterRelations[Number(env.__dialogueChar ?? 1)] ?? 0;
  env.waitEffect = (entry?: number) => { if (env.__onWaitEffect) env.__onWaitEffect(entry); };
  env.refresh = () => { if (env.__onRefresh) env.__onRefresh(); };
  env.wrongAnswerToMarco = (entry: number) => { if (env.__onWrongAnswerToMarco) env.__onWrongAnswerToMarco(entry); };
  // 原版签名：affectFactionRelations(amount, faction, who)；成对语义委托给 GameData（基线+增量）
  env.affectFactionRelations = (amount: number, faction: number, who = 0) => {
    gd.affectFactionRelations(amount, faction, who);
  };
  env.getFactionRelations = (faction: number, who = 0) => gd.getFactionRelations(faction, who);
  env.setFactionRelations = (faction: number, who: number, val: number) => { gd.setFactionRelations(faction, who, val); };
  env.addCargo = (item: number, amount: number) => { c().addCargo(item, amount); };
  env.reduceCargo = (item: number, amount: number) => { c().removeCargo(item, amount); };
  // 原版 findCargo 返回 Item 对象（.type/.amount/.inUse）或 false；数字返回值会让回调里的 .amount/.inUse 变 undefined
  env.findCargo = (item: number) => {
    const amt = c().cargoAmount(item);
    return amt > 0 ? { type: item, amount: amt, inUse: c().inUseOf(item) } : false;
  };
  env.addMoney = (amount: number) => { c().money += amount; };
  env.reduceMoney = (amount: number) => { c().money = Math.max(0, c().money - amount); };
  env.openLocation = (town: number, loc: number, entryId?: number) => {
    if (env.__onOpenLocation) { env.__onOpenLocation(town, loc, entryId); return; }
    // openLocation 是临时打开设施，不是解锁设施。没有对话宿主时不改变 visible。
    console.warn("[Dialogue] openLocation has no active host", town, loc);
  };
  const acceptFn = transpileAs3Fn(ACCEPT_QUEST_BODY, ["param1"]);
  const completeFn = transpileAs3Fn(COMPLETE_QUEST_BODY, ["param1"]);
  const failFn = transpileAs3Fn(FAIL_QUEST_BODY, ["param1"]);
  // FFDEC 丢了 executeMajorEvent 的参数映射（switch(_loc1_) 且 _loc1_ 未赋值）→ 修复：_loc1_ = param1
  const eventBody = "var _loc1_ = param1;\n" + MAJOR_EVENT_BODY.replace("switch(_loc1_)", "switch(param1)");
  const majorEventFn = transpileAs3Fn(eventBody, ["param1", "param2"]);
  env.acceptQuest = (q: number) => {
    story.questLog[q] = "active";
    acceptFn(env, q);
    if (!story.acceptedQuests.includes(q)) story.acceptedQuests.push(q);
  };
  env.completeQuest = (q: number) => {
    story.questLog[q] = "done";
    completeFn(env, q);
  };
  env.failQuest = (q: number) => {
    story.questLog[q] = "failed";
    failFn(env, q);
  };
  // 回调直接调 GD.xxx（原版 DialogueScreen with(env) 里 GD=GameData 实例方法）→ 注入钩子
  gd.__acceptQuest = env.acceptQuest;
  gd.__completeQuest = env.completeQuest;
  gd.__failQuest = env.failQuest;
  gd.cameFromMode = gd.cameFromMode ?? 1;
  Object.defineProperty(env,"cameFromMode",{get:()=>gd.cameFromMode,set:(value:number)=>{gd.cameFromMode=value;},enumerable:true});
  // Character.as 567–718: story-created people use original random combat stats.
  // Keep the general Web constructor/save restoration separate from new-person generation.
  env.Character = class extends Character {
    constructor(init:any={}) {
      const integer=(lo:number,hi:number)=>lo+Math.floor(Math.random()*(hi-lo+1));
      const gender=init.gender??(Math.random()<0.3?2:1), age=init.age??integer(16,54);
      const level=init.levelModifier??1, experience=init.experienceModifier??age/30;
      const stats:any={category:2,gender,age};
      stats.basePhysical=init.physical??init.basePhysical??Math.min(Math.round((integer(4,7)-Math.abs(age-20)/15)*level*(gender===1?1.2:0.8)),10);
      stats.baseAgility=init.agility??init.baseAgility??Math.min(Math.round((integer(4,7)-Math.abs(age-18)/15)*level*(gender===1?0.8:1.2)),10);
      stats.baseAccuracy=init.accuracy??init.baseAccuracy??Math.min(Math.round((integer(4,7)-Math.abs(age-25)/20)*level),10);
      stats.baseIntelligence=init.intelligence??init.baseIntelligence??Math.min(Math.round((integer(4,7)+Math.min((age-15)/15,1.7))*level),10);
      for(const skill of Character.skillsList)stats[skill.experience]=init[skill.experience]??Math.round(100*Math.random()*experience);
      stats.generalBattleExperience=init.generalBattleExperience??Math.round(500*Math.random()*experience);
      super({...stats,...init});
      if(init.height==null&&init.Height==null)this.Height=150+this.physical*3+this.physical*Math.random()*4;
      if(init.idealWeight==null)this.idealWeight=this.Height-100-(this.Height-150)/(gender===1?4:2);
      if(init.weight==null&&init._weight==null)this.weight=this.idealWeight*(0.7+Math.random()*0.4);
      if(init.morale==null&&init._morale==null)this.morale=this.category===4?integer(5,30):integer(30,70);
      if(init.HP==null&&init._HP==null)this.HP=this.maxHP;
    }
  };
  env.Caravan = class extends Caravan {
    type:number; faction:number; name:string;
    constructor(type:number,_symbols?:any) {
      super();this.type=type;
      const preset=ds.presets?.caravan_types?.[0]?.[type]??{};
      this.category=preset.category??0;this.faction=preset.faction??0;
      this.name=typeof preset.name==='number'?env.Texts.fetch(preset.name):preset.name??'';
    }
    get Transport(){return this.transports;}
  };
  env.TransportUnit = function(type:number){return makeTransportUnit(type,ds);};
  env.Presets = {...ds.presets,Towns:ds.presets.Towns??ds.presets.town_presets?.[0]??[]};
  env.mapMode = {
    openDialogue: (charId: number, ..._args: any[]) => { if (gd.__onEventDialogue) gd.__onEventDialogue(charId); },
    enterTown: (townId: number) => { if (gd.__onEventEnterTown) gd.__onEventEnterTown(townId); },
    mapSymbols: {},
  };
  env.MathFunctions = {
    random: (a: number, b: number) => a + Math.random() * (b - a),
    CalcDistance: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1),
    CalcAngle: (x1: number, y1: number, x2: number, y2: number) => (Math.atan2(x2-x1,y2-y1)+Math.PI*2)%(Math.PI*2),
    CalcRevYAngle: (x1:number,y1:number,x2:number,y2:number)=>(Math.atan2(x2-x1,y1-y2)+Math.PI*2)%(Math.PI*2),
    halfPI:Math.PI/2,
    dblPI: Math.PI * 2,
    Rad2Deg: 180 / Math.PI,
  };
  for (const method of ["distributeWeapons", "distributeAmmo", "distributeArmor", "distributeTransport"]) {
    env[method] = (owner:any = gd.Caravans[0], ...args:any[]) => owner?.[method]?.(...args);
  }
  env.equipRandomCaravan = (owner:any,count?:number) => {
    if(!owner)return;
    const squad=gd.equipRandomCaravan(owner.type??0,count);
    owner.originalSquad=squad;
    owner.People=[];owner.cargo=new Map();owner.inUse={};
    for(const item of squad.cargoLoot??[])owner.addCargo(item.item,item.amount);
    for(const spec of squad.people){
      const {maxHP: _derivedHP, ...initial}=spec;
      const p=new Character({...initial,category:2,...(spec.skillExperience??{}),generalBattleExperience:spec.generalBattleExperience??0});
      const wid=spec.weaponItem,sub=ds.items.Items[wid]?.subCategory??0;
      p.weapons=[sub,0];p.equipment=[];
      if(wid){
        if(!spec.cargoEquipment?.includes(wid))owner.addCargo(wid,1);
        p.addItemToEquipment({type:wid,amount:1},false);owner.inUse[wid]=(owner.inUse[wid]??0)+1;
      }
      if(spec.armorItem){const id=spec.armorItem,sub=ds.items.Items[id]?.subCategory??0;
        if(ds.items.Armor?.[sub]?.type===2)p.Headgear=sub;else p.Jacket=sub;
        p.addItemToEquipment({type:id,amount:1},false);owner.inUse[id]=(owner.inUse[id]??0)+1;
      }
      owner.addPerson(p);
    }
    for(const p of squad.slavePeople??[])owner.addPerson(p);
    owner.transports=squad.transports??[];
    owner.distributeAmmo();owner.distributeTransport();
  };
  env.directCaravanToNearestTown = () => {};
  env.eliminateAllRandomGroups = (type:number) => {
    // Original clears this type's map spawn probabilities, not existing caravans.
    const disabled:number[]=Array.isArray(story.flags.suppressedRandomGroups)?story.flags.suppressedRandomGroups:[];
    if(!disabled.includes(type))disabled.push(type);
    story.flags.suppressedRandomGroups=disabled;
  };
  env.directCaravanToTown = () => {};
  env.setLocationsVisibility = () => {};
  env.executeMajorEvent = (n: number, flag?: any) => { majorEventFn(env, n, flag); };
  gd.__executeMajorEvent = env.executeMajorEvent;
  gd.mapMode = env.mapMode;
  (globalThis as any).__majorEventFn = majorEventFn;
  env.setMode = (m: number, ...args: any[]) => { gd.setMode(m, ...args); };
  env.giveItem = (item: number, amount: number) => c().addCargo(item, amount);
  env.takeItem = (item: number, amount: number) => c().removeCargo(item, amount);
  if(ds.gamedata.originalDlcFeatures?.['special-story']) {
    const bridge=new Proxy(gd as any,{get(target,key){
      if(key==='Story')return guardedStory;
      if(key==='equipRandomCaravan')return env.equipRandomCaravan;
      if(key==='directCaravanToTown')return (owner:any,town:number)=>{owner.dlcDestination=town;};
      if(key==='mapMode')return {...env.mapMode,openDialogue:(_id:number,owner:any,settings:any,obstacles:any)=>env.__dlcEncounter?.(owner,settings,obstacles)};
      const value=target[key];return typeof value==='function'?value.bind(target):value;
    }});
    const root={GD:bridge,createCaravan:(type:number)=>new env.Caravan(type),createCharacter:(init:any)=>new env.Character(init)};
    const run=(name:keyof typeof ORIGINAL_DLC_HOOKS,...args:any[])=>transpileAs3Fn(ORIGINAL_DLC_HOOKS[name],name==='onOverTown'?['town']:name==='onMissionCaravanEntersTown'?['caravan']:[])({gameRoot:root},...args);
    env.__dlcOverTown=(town:number)=>run('onOverTown',town);
    (gd as any).parent={...((gd as any).parent??{}),executeDLCFunction:(id:number,name:string)=>{
      if(id!==2||name!=='releaseDrekarSquad')return;
      run('releaseDrekarSquad');
      const owner=gd.Caravans.at(-1) as any;
      // Store the marching mission in the existing persisted NPC system.
      const npc=gd.newMapNpcCaravan(2,owner.x,owner.y,{squad:owner.originalSquad});
      npc.category=4;(npc as any).dlcDestination=83;(npc as any).specialPurpose=23;
      npc.aggressive=false;gd.npcCaravans.push(npc);
      npc.cargo=owner.cargo;npc.money=owner.money;
      gd.Caravans.pop();
    }};
  }
  return env;
}

export function openOriginalDlcTown(gd:GameData,ds:DataStore,town:number,encounter:(owner:any,settings:any,obstacles:any)=>void):boolean {
  if(!ds.gamedata.originalDlcFeatures?.['special-story']||town!==83)return false;
  const env=makeDialogueEnv(gd,ds);env.__dlcEncounter=encounter;
  return !!env.__dlcOverTown?.(town);
}
