// t4 对话转译引擎冒烟：对 dialogues.json 全部 1440 actions + 544 conditions 跑 transpileAs3Fn 等价管线
// 目的：1) 语法级失败（new Function 抛错）→ 真转译 bug；2) 运行时抛错；3) 回调引用了 makeDialogueEnv 未提供的成员 → 集成缺口
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const d = require("D:/game/Caravaneer 2 deepseek/web/public/data/dialogues.json");

// ---------- 复制 transpileAs3Fn（Story.ts:10-34）----------
function transpile(as3, extraParams = []) {
  let s = as3;
  s = s.replace(/^\s*function\s*\([^)]*\)\s*:\*\s*/i, "");
  s = s.replace(/var\s+env\s*:\*\s*=\s*param1\s*;?/g, "");
  s = s.replace(/return\s+arguments\.callee\s*;?/g, "");
  s = s.replace(/\bvar\s+([A-Za-z_$][\w$]*)\s*:\s*[*A-Za-z0-9_.<>]+\s*(?==|;)/g, "var $1");
  s = s.replace(/([A-Za-z0-9_$\[\].]+)\s+is\s+(Number)\b/g, '(typeof $1 === "number")');
  s = s.replace(/([A-Za-z0-9_$\[\].]+)\s+is\s+(String)\b/g, '(typeof $1 === "string")');
  s = s.replace(/([A-Za-z0-9_$\[\].]+)\s+is\s+(Array)\b/g, "Array.isArray($1)");
  s = s.replace(/([A-Za-z0-9_$\[\].]+)\s+is\s+(Object)\b/g, '($1 !== null && typeof $1 === "object")');
  s = s.replace(/([A-Za-z0-9_$\[\].]+)\s+is\s+([A-Z][A-Za-z0-9_]*)\b/g, "($1 instanceof $2)");
  s = s.trim();
  // 与 Story.ts transpileAs3Fn 同步：跳过会使深度为负的杂散右花括号，未闭合左花括号补齐
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
  return fn;
}

// ---------- makeDialogueEnv 提供的成员白名单（Story.ts 现状）----------
const provided = new Set([
  "Story","GD","GameData","Texts","Rndm","MathFunctions","Math","difficulty","Caravans","Towns","Item","Time",
  "leave","affectSpecificReputation","getSpecificReputation","affectCurrentRelationship","setCurrentDefault","getCurrentRelationship",
  "affectFactionRelations","getFactionRelations","setFactionRelations","addCargo","reduceCargo","findCargo","addMoney","reduceMoney",
  "openLocation","acceptQuest","completeQuest","failQuest","Character","TransportUnit","Presets","mapMode",
  "distributeWeapons","distributeAmmo","distributeArmor","distributeTransport","equipRandomCaravan","directCaravanToNearestTown",
  "eliminateAllRandomGroups","directCaravanToTown","setLocationsVisibility","executeMajorEvent","setMode","waitEffect","refresh",
  "wrongAnswerToMarco","giveItem","takeItem","__dialogueChar","__onLeave","__onWaitEffect","__onRefresh","__onWrongAnswerToMarco","__onOpenLocation",
]);

// ---------- 记录型环境：已知成员给安全桩；未知成员记录访问 ----------
const missing = new Map(); // name -> { count, samples: string[] }
const magic = () => new Proxy(function(){}, {
  get(t, k) {
    if (k === Symbol.toPrimitive) return () => 0;
    if (k === "length" || k === "name") return 0;
    if (k === "indexOf") return () => -1;
    if (k === "push" || k === "splice" || k === "unshift" || k === "concat" || k === "filter" || k === "map" || k === "forEach" || k === "some" || k === "find" || k === "includes" || k === "sort" || k === "reverse" || k === "slice" || k === "join" || k === "pop" || k === "shift") return () => magic();
    return magic();
  },
  apply() { return magic(); },
  set() { return true; },
  has() { return true; },
  getPrototypeOf() { return null; },
});

function makeEnv() {
  const story = new Proxy({}, { get(t, k) { return magic(); }, set() { return true; }, has() { return true; } });
  const townProxy = () => new Proxy({}, { get(t, k) { return magic(); }, set() { return true; }, has() { return true; } });
  const towns = new Proxy([], { get(t, k) { if (k === "length") return 83; const n = Number(k); if (!isNaN(n) && n >= 0) return townProxy(); return Reflect.get(t, k); }, set() { return true; } });
  const cargoEntries = [{ type: 1, amount: 5 }, { type: 45, amount: 3 }];
  const caravanObj = new Proxy({ Cargo: cargoEntries, cargo: cargoEntries }, {
    get(t, k) {
      if (k === "Cargo") return cargoEntries;
      if (k === "findCargo") return (item) => { const e = cargoEntries.find(x => x.type === item); return e ? { type: e.type, amount: e.amount, inUse: 0 } : false; };
      if (k === "inUseOf") return () => 0;
      return magic();
    },
    set() { return true; }, has() { return true; },
  });
  const caravans = [caravanObj];
  const env = {
    Story: story,
    GD: { Caravans: caravans, Towns: towns, affectFactionRelations: () => {}, getFactionRelations: () => 0, setFactionRelations: () => {}, executeMajorEvent: () => {}, acceptQuest: () => {}, completeQuest: () => {}, failQuest: () => {}, setMode: () => {}, cameFromMode: 1, adultContent: false, Story: story, mapMode: { openDialogue: () => {}, enterTown: () => {}, mapSymbols: {} }, difficulty: 1, Time: 0 },
    GameData: { Caravans: caravans, Towns: towns, affectFactionRelations: () => {}, getFactionRelations: () => 0, executeMajorEvent: () => {}, setMode: () => {}, Story: story },
    Caravans: caravans, Towns: towns, Presets: { Towns: towns, CaravanTypes: {} },
    Texts: { fetch: () => "T" }, Rndm: { random: () => 0.5 },
    MathFunctions: { random: () => 0.5, CalcDistance: () => 1, CalcAngle: () => 1, dblPI: Math.PI * 2, Rad2Deg: 180 / Math.PI, CalcRevYAngle: () => 1, NumberFormat: () => "0" },
    Math, Time: 0, difficulty: 1, Item: class {}, Character: class {}, TransportUnit: class {},
    mapMode: { openDialogue: () => {}, enterTown: () => {}, mapSymbols: {} },
  };
  for (const name of provided) {
    if (name in env) continue;
    env[name] = () => {};
  }
  return new Proxy(env, {
    get(t, k) {
      if (typeof k === "string" && !(k in t) && !provided.has(k)) {
        const rec = missing.get(k) || { count: 0, samples: [] };
        rec.count++;
        missing.set(k, rec);
        return magic();
      }
      return t[k];
    },
    has(t, k) { return true; },
  });
}

// ---------- 跑全部 actions + conditions ----------
const syntaxFails = [];
const runtimeFails = [];
let total = 0, ok = 0;
for (const rid of Object.keys(d.responses)) {
  const r = d.responses[rid];
  for (const kind of ["actions", "conditions"]) {
    const src = r[kind] && r[kind].__as3fn;
    if (!src) continue;
    total++;
    let fn;
    try { fn = transpile(src); }
    catch (e) { syntaxFails.push({ rid, kind, err: String(e && e.message || e).slice(0, 140), src: src.slice(0, 160).replace(/\s+/g, " ") }); continue; }
    try { fn(makeEnv()); ok++; }
    catch (e) { runtimeFails.push({ rid, kind, err: String(e && e.message || e).slice(0, 140), src: src.slice(0, 160).replace(/\s+/g, " ") }); }
  }
}
const sortedMissing = [...missing.entries()].sort((a, b) => b[1].count - a[1].count);
console.log("=== 转译冒烟汇总 ===");
console.log("总回调数:", total, "| 运行无抛错:", ok, "| 语法失败:", syntaxFails.length, "| 运行时抛错:", runtimeFails.length);
console.log("\n--- 语法失败（真转译 bug，需修）---");
for (const f of syntaxFails.slice(0, 10)) console.log("resp", f.rid, f.kind, "|", f.err, "|", f.src);
if (!syntaxFails.length) console.log("（无）");
console.log("\n--- 运行时抛错（前 15）---");
for (const f of runtimeFails.slice(0, 15)) console.log("resp", f.rid, f.kind, "|", f.err, "|", f.src);
console.log("\n--- 回调引用但 makeDialogueEnv 未提供的成员（集成缺口，前 25）---");
for (const [name, rec] of sortedMissing.slice(0, 25)) console.log(name, "×", rec.count, "| sample:", (rec.samples[0] || "").slice(0, 90));
