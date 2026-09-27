#!/usr/bin/env node
// ============================================================================
// roundtrip_test.mjs — 《Caravaneer 2》HTML5 移植 存档导入/导出往返自动化测试
// 用法：cd web && node scripts/roundtrip_test.mjs
// 依赖：node 内置模块 + 本地 node_modules/typescript（把 SolImporter/SolExporter
//       临时编译为 ESM 后动态 import；编译产物输出到 web/.roundtrip_tmp 并在结束清理）
//
// 测试项：
//   T1  导入 public/test_original_save.sol（真实文件）→ 关键字段快照
//       （money / cargo / 时间 / 城镇 / 液体），断言与生成脚本预期一致
//   T2  内存构造带 liquidsContainers 的原版格式存档 → buildSolFile → 导入 → 快照断言
//   T3  【S1 复现】liquidsContainers 液体数量：期望 75L，导入后当前实现为 0L → FAIL（预期，
//       t6 修复后应转绿）
//   T4  导出（saveDataToOriginal→buildSolFile）→ 再导入 → 关键字段一致（无损往返）
//   T5  zlib 压缩导出（buildSolFileCompressed，TCSO 标志 0x0100）→ 导入 → 无损往返 + 压缩率
//
// 退出码：0 = 全部通过（或仅 S1 按预期失败）；1 = 其他测试失败；2 = 编译/环境失败
// ============================================================================
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url)); // web/scripts
const webRoot = resolve(here, "..");

// ---------- 0. 编译 SolImporter / SolExporter（本地 tsc） ----------
const tscBin = join(webRoot, "node_modules", "typescript", "bin", "tsc");
const tmpDir = join(webRoot, ".roundtrip_tmp");
if (!existsSync(tscBin)) {
  console.error("FATAL: 未找到 node_modules/typescript（npm install 未执行？）");
  process.exit(2);
}
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
let compileOut = "";
try {
  compileOut = execFileSync(process.execPath, [
    tscBin,
    "src/core/SolImporter.ts", "src/core/SolExporter.ts",
    "--outDir", tmpDir, "--noEmit", "false", "--module", "esnext", "--target", "es2022",
    "--moduleResolution", "bundler", "--skipLibCheck",
  ], { cwd: webRoot, stdio: "pipe" }).toString();
} catch (e) {
  // tsc 在有类型错误时退出码非 0，但只要 JS 已产出即可继续（类型错误不影响本次运行）
  compileOut = String(e.stdout || "") + String(e.stderr || "");
}
const compiledImp = join(tmpDir, "core", "SolImporter.js");
const compiledExp = join(tmpDir, "core", "SolExporter.js");
if (!existsSync(compiledImp) || !existsSync(compiledExp)) {
  console.error("FATAL: tsc 未产出编译产物（" + compiledImp + " / " + compiledExp + "）");
  console.error(compileOut || "tsc 未返回输出；请检查子进程权限或 TypeScript 配置。");
  process.exit(2);
}

let imp, exp;
try {
  imp = await import(pathToFileURL(join(tmpDir, "core", "SolImporter.js")).href);
  exp = await import(pathToFileURL(join(tmpDir, "core", "SolExporter.js")).href);
} catch (e) {
  console.error("FATAL: 动态导入编译产物失败:", e.message);
  process.exit(2);
}
const { parseSolFile, solToSaves } = imp;
const { buildSolFile, buildSolFileCompressed, saveDataToOriginal } = exp;

// ---------- 1. 工具 ----------
const results = []; // { id, name, ok, detail }
const record = (id, name, ok, detail) => {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} | ${id} | ${name} | ${detail}`);
};

function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
async function importSolBytes(bytes) {
  const parsed = await parseSolFile(toArrayBuffer(bytes));
  return solToSaves(parsed);
}
async function importSolBlob(blob) {
  const ab = await blob.arrayBuffer();
  const parsed = await parseSolFile(ab);
  return solToSaves(parsed);
}
const sortCargo = (arr) => [...arr].sort((a, b) => a.item - b.item);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 关键字段快照（排除 savedAt / name 等非稳定字段）
function snapshot(sd) {
  return {
    time: sd.time,
    day: sd.day,
    difficulty: sd.difficulty,
    storyMode: sd.storyMode,
    gameSpeed: sd.gameSpeed,
    producedToday: { ...(sd.producedToday ?? {}) },
    money: sd.caravan.money,
    x: sd.caravan.x,
    y: sd.caravan.y,
    moving: sd.caravan.moving,
    cargo: sortCargo(sd.caravan.cargo ?? []),
    people: (sd.caravan.people ?? []).map((p) => ({
      name: p.name, gender: p.gender, age: p.age, _HP: p._HP, category: p.category,
    })),
    transports: (sd.caravan.transports ?? []).map((t) => ({
      type: t.type, health: t.health, maxHealth: t.maxHealth,
    })),
    towns: (sd.towns ?? []).map((t) => (t ? {
      id: t.id, population: t.population, discovered: !!t.discovered,
      GDPperCapita: t.GDPperCapita ?? null, playersStorageSpace: t.playersStorageSpace ?? 0,
      unemployed: t.unemployed ?? 0, electricityPrice: t.electricityPrice ?? 1,
      prices: t.prices ?? {}, stock: sortCargo(t.stock ?? []),
      industries: (t.industries ?? []).map((i) => ({ type: i.type, volume: i.volume, forSale: !!i.forSale, employees: i.employees })),
      playersIndustries: (t.playersIndustries ?? []).map((i) => ({ type: i.type, volume: i.volume, employees: i.employees })),
    } : null)),
    discoveredTowns: [...(sd.discoveredTowns ?? [])],
    story: {
      flags: sd.story?.flags ?? {},
      specificReputations: sd.story?.specificReputations ?? {},
      factionRelations: sd.story?.factionRelations ?? {},
      acceptedQuests: sd.story?.acceptedQuests ?? [],
    },
  };
}

// 统计 liquidsContainers 中的液体总量（原版存档对象）
function liquidsTotal(lc) {
  if (!lc || typeof lc !== "object") return 0;
  let sum = 0;
  for (const k of Object.keys(lc)) {
    const bucket = lc[k];
    if (Array.isArray(bucket)) for (const e of bucket) sum += Number(e.amount ?? 0);
  }
  return sum;
}

// ---------- 2. 测试夹具 ----------
// 原版格式存档快照（与 gen_test_sol.cjs 同构，但 16 个城镇稠密 + 车队带 liquidsContainers）
function makeFixture() {
  const towns = Array.from({ length: 16 }, (_, i) => ({
    type: i,
    population: 100 + i * 7,
    unemployed: i % 3,
    electricityPrice: 0.3 + i * 0.02,
    discovered: i < 8,
    tax: 0.1 + i * 0.01,
    GDPperCapita: 200 + i * 10,
    playersStorageSpace: 40 + i,
    prices: { 1: 1.5, 45: 24, 62: 9 + i },
    industries: [{ type: 2, employees: 20, forSale: false, maxSize: 30 }],
    playersIndustries: [{ type: 5, employees: 8, maxSize: 10 }],
    locations: [{
      category: 1,
      stock: [
        { type: 1, amount: 500 - i * 10 },
        { type: 45, amount: 120 },
        { type: 62, amount: 300 },
      ],
    }],
  }));
  const save = {
    GameData: {
      Time: 2509600000,
      difficulty: 1,
      storyMode: true,
      gameSpeed: 1,
      producedToday: { 0: 3, 1: 0 },
      factionRelations: { 1: 20, 2: -10 },
      Caravans: [{
        x: -10000, y: -900, direction: 1.2, moving: true, money: 45200,
        Cargo: [
          { type: 1, amount: 12.5 },   // 水（散货，Cargo 内）
          { type: 45, amount: 30 },    // 饲料
          { type: 62, amount: 80 },    // 食物
          { type: 112, amount: 3 },    // 容器：中型金属油罐（volume 10）
        ],
        // 原版液体分组存储：-1=散装，0=默认组，112=具体容器组
        liquidsContainers: {
          "-1": [{ type: 64, amount: 10 }],                    // 散装燃料 10L
          "0": [{ type: 1, amount: 40 }, { type: 64, amount: 5 }], // 水 40L + 燃料 5L
          "112": [{ type: 1, amount: 20 }],                    // 油罐里的水 20L
        },
        People: [{
          name: "TestHero", gender: 1, age: 32, physical: 14, agility: 12,
          accuracy: 11, intelligence: 13, HP: 190, salary: 0, weapons: [18], category: 1,
        }],
        Transport: [{ type: 1, _health: 1200, _maxHealth: 1500, gender: 2, age: 800, weight: 160 }],
      }],
      Towns: towns,
    },
    Story: {
      mainMissionAccepted: true,
      firstZoneResolved: false,
      specificReputations: { 0: 5, 1: -3 },
      acceptedQuests: [2, 7],
    },
  };
  return save;
}

console.log("=== 存档导入导出往返测试 ===\n");
console.log("[0] 编译 SolImporter/SolExporter 完成（tsc 5.9.3）");

// ---------- T1：导入真实文件 test_original_save.sol ----------
console.log("\n--- T1 导入 public/test_original_save.sol ---");
{
  const solPath = join(webRoot, "public", "test_original_save.sol");
  if (!existsSync(solPath)) {
    record("T1", "导入真实 .sol 文件", false, "文件不存在: " + solPath);
  } else {
    try {
      const bytes = readFileSync(solPath);
      const saves = await importSolBytes(bytes);
      const ok1 = saves.length === 1;
      const sd = ok1 ? saves[0].save : null;
      let checks = [];
      if (sd) {
        checks.push(["money=45200", sd.caravan.money === 45200]);
        checks.push(["time=2509600000", sd.time === 2509600000]);
        checks.push(["cargo=[{1,12.5},{45,30},{62,80}]",
          eq(sortCargo(sd.caravan.cargo), [{ item: 1, amount: 12.5 }, { item: 45, amount: 30 }, { item: 62, amount: 80 }])]);
        checks.push(["towns=[0,15]", (sd.towns ?? []).map((t) => t && t.id).join(",") === "0,15"]);
        checks.push(["town0.population=253", (sd.towns ?? [])[0]?.population === 253]);
        checks.push(["town15.population=30", (sd.towns ?? [])[1]?.population === 30]);
        checks.push(["story.mainMissionAccepted", sd.story?.flags?.mainMissionAccepted === true]);
        checks.push(["discoveredTowns=[0,15]", eq(sd.discoveredTowns, [0, 15])]);
        // 液体：该测试存档未含 liquidsContainers（生成脚本不含该字段）→ 0
        const lc = (sd.caravan ?? {}).liquidsContainers;
        checks.push(["liquidsContainers 字段", lc === undefined || liquidsTotal(lc) === 0]);
      }
      const failed = checks.filter(([, v]) => !v).map(([n]) => n);
      const ok = ok1 && failed.length === 0;
      const detail = ok
        ? `1 槽位；money=${sd.caravan.money} time=${sd.time} cargo=${JSON.stringify(sortCargo(sd.caravan.cargo))} towns=[${(sd.towns ?? []).map((t) => t && t.id).join(",")}] 液体=0（存档未含 liquidsContainers）`
        : `槽位数=${saves.length} 断言失败: ${failed.join(", ")}`;
      record("T1", "导入真实 .sol 文件", ok, detail);
      if (ok) console.log("    快照:", JSON.stringify(snapshot(sd)).slice(0, 400) + "...");
    } catch (e) {
      record("T1", "导入真实 .sol 文件", false, "异常: " + e.message);
    }
  }
}

// ---------- T2：构造存档（含 liquidsContainers）→ 导出 .sol → 导入 ----------
console.log("\n--- T2 构造存档（含 liquidsContainers 75L）→ 导出 → 导入 ---");
let fixture, sd1, lcExpected = 0;
{
  fixture = makeFixture();
  lcExpected = liquidsTotal(fixture.GameData.Caravans[0].liquidsContainers);
  try {
    const blob = buildSolFile([{ name: "Fixture", time: new Date("2024-01-15T10:30:00Z"), save: fixture }]);
    const saves = await importSolBlob(blob);
    const ok1 = saves.length === 1;
    sd1 = ok1 ? saves[0].save : null;
    let checks = [];
    if (sd1) {
      checks.push(["money=45200", sd1.caravan.money === 45200]);
      checks.push(["time=2509600000", sd1.time === 2509600000]);
      checks.push(["storyMode=true", sd1.storyMode === true]);
      checks.push(["cargo 4 项", sortCargo(sd1.caravan.cargo).length === 4]);
      checks.push(["cargo 含水 12.5", (sd1.caravan.cargo.find((c) => c.item === 1)?.amount ?? 0) === 12.5]);
      checks.push(["cargo 含容器 112×3", (sd1.caravan.cargo.find((c) => c.item === 112)?.amount ?? 0) === 3]);
      checks.push(["towns 16 座", (sd1.towns ?? []).length === 16]);
      checks.push(["town#15.id=15", (sd1.towns ?? [])[15]?.id === 15]);
      checks.push(["town#8.discovered=false", (sd1.towns ?? [])[8]?.discovered === false]);
      checks.push(["town#3.discovered=true", (sd1.towns ?? [])[3]?.discovered === true]);
      checks.push(["town#0.stock 3 项", (sd1.towns ?? [])[0]?.stock?.length === 3]);
      checks.push(["town#0.unemployed=0", (sd1.towns ?? [])[0]?.unemployed === 0]);
      checks.push(["town#0.electricityPrice=0.3", Math.abs((sd1.towns ?? [])[0]?.electricityPrice - 0.3) < 1e-9]);
      checks.push(["town#0.playersIndustries 雇员=8", (sd1.towns ?? [])[0]?.playersIndustries?.[0]?.employees === 8]);
      checks.push(["people 1 人 _HP=190", (sd1.caravan.people ?? [])[0]?._HP === 190]);
      checks.push(["transports 1 辆 health=1200", (sd1.caravan.transports ?? [])[0]?.health === 1200]);
      checks.push(["story.flags.mainMissionAccepted", sd1.story?.flags?.mainMissionAccepted === true]);
      checks.push(["producedToday={0:3,1:0}", eq(sd1.producedToday ?? {}, { 0: 3, 1: 0 })]);
      checks.push(["factionRelations={1:20,2:-10}", eq(sd1.story?.factionRelations ?? {}, { 1: 20, 2: -10 })]);
    }
    const failed = checks.filter(([, v]) => !v).map(([n]) => n);
    const ok = ok1 && failed.length === 0;
    record("T2", "构造存档导入", ok, ok
      ? `money=${sd1.caravan.money} cargo=${sd1.caravan.cargo.length} 项 towns=${(sd1.towns ?? []).length} 座`
      : `断言失败: ${failed.join(", ")}`);
  } catch (e) {
    record("T2", "构造存档导入", false, "异常: " + e.message);
  }
}

// ---------- T3：【S1 复现】liquidsContainers 液体数量 ----------
console.log("\n--- T3 S1 复现：liquidsContainers 液体数量 ---");
{
  const importedLc = (sd1?.caravan ?? {}).liquidsContainers;
  const importedLiquid = importedLc ? liquidsTotal(importedLc) : 0; // 当前实现：无该字段 → 0
  const cargoLiquid = (sd1?.caravan.cargo ?? [])
    .filter((c) => c.item === 1 || c.item === 64) // 水(1)/燃料(64)
    .reduce((s, c) => s + c.amount, 0);
  const ok = importedLiquid === lcExpected && lcExpected > 0;
  record("T3", "liquidsContainers 液体数量", ok,
    `期望 ${lcExpected}L（${Object.keys(fixture.GameData.Caravans[0].liquidsContainers).length} 组），导入后 ${importedLiquid}L（cargo 内液体仅 ${cargoLiquid}L）`);
  if (!ok) console.log("    >>> S1 复现：液体丢失（liquidsContainers 未导入，t6 修复后应转绿）");
}

// ---------- T4：无损往返（导出 → 再导入） ----------
console.log("\n--- T4 无损往返：saveDataToOriginal → buildSolFile → 导入 ---");
{
  try {
    const original2 = saveDataToOriginal(sd1);
    const blob = buildSolFile([{ name: "Roundtrip", time: new Date(), save: original2 }]);
    const saves = await importSolBlob(blob);
    const sd2 = saves[0]?.save;
    const s1 = snapshot(sd1);
    const s2 = snapshot(sd2);
    const ok = !!sd2 && eq(s1, s2);
    if (!ok && sd2) {
      // 定位第一个差异
      const keys = new Set([...Object.keys(s1), ...Object.keys(s2)]);
      for (const k of keys) {
        if (!eq(s1[k], s2[k])) {
          console.log("    差异字段:", k, "| 前:", JSON.stringify(s1[k]).slice(0, 200), "| 后:", JSON.stringify(s2[k]).slice(0, 200));
          break;
        }
      }
    }
    record("T4", "无损往返", ok, ok
      ? `money=${s2.money} cargo=${s2.cargo.length} 项 towns=${s2.towns.filter(Boolean).length} 座 time=${s2.time}`
      : "关键字段不一致（见差异字段）");
  } catch (e) {
    record("T4", "无损往返", false, "异常: " + e.message);
  }
}

// ---------- T5：zlib 压缩导出（TCSO 标志 0x0100）→ 导入 → 无损往返 ----------
console.log("\n--- T5 zlib 压缩导出往返 ---");
{
  try {
    const blob = await buildSolFileCompressed([{ name: "Fixture", time: new Date("2024-01-15T10:30:00Z"), save: fixture }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // 校验 TCSO 头压缩标志 = 0x01（zlib）
    const flagOk = bytes[0] === 0x54 && bytes[1] === 0x43 && bytes[2] === 0x53 && bytes[3] === 0x4f && bytes[4] === 0x01 && bytes[5] === 0x00;
    // 体长字段（nameLen 之后 4 字节）
    const nameLen = (bytes[11] << 8) | bytes[12];
    const bodyLenOff = 13 + nameLen;
    const bodyLen = ((bytes[bodyLenOff] << 24) | (bytes[bodyLenOff + 1] << 16) | (bytes[bodyLenOff + 2] << 8) | bytes[bodyLenOff + 3]) >>> 0;
    const compressedBody = bytes.slice(bodyLenOff + 4, bodyLenOff + 4 + bodyLen);
    // 与未压缩体比较（压缩率验证）
    const rawBlob = buildSolFile([{ name: "Fixture", time: new Date("2024-01-15T10:30:00Z"), save: fixture }]);
    const rawBytes = new Uint8Array(await rawBlob.arrayBuffer());
    const rawLenOff = 13 + ((rawBytes[11] << 8) | rawBytes[12]);
    const rawBodyLen = ((rawBytes[rawLenOff] << 24) | (rawBytes[rawLenOff + 1] << 16) | (rawBytes[rawLenOff + 2] << 8) | rawBytes[rawLenOff + 3]) >>> 0;
    const ratio = (bodyLen / rawBodyLen).toFixed(3);
    // 导入压缩文件
    const saves = await importSolBlob(blob);
    const sd = saves[0]?.save;
    const sComp = snapshot(sd);
    const sOrig = snapshot(sd1);
    const ok = flagOk && saves.length === 1 && eq(sComp, sOrig);
    record("T5", "zlib 压缩导出往返", ok,
      `压缩标志=0x01 ${flagOk ? "" : "(FAIL)"}；体 ${rawBodyLen}→${bodyLen} 字节（${ratio}×）；导入后快照与未压缩路径一致`);
  } catch (e) {
    record("T5", "zlib 压缩导出往返", false, "异常: " + e.message);
  }
}

// ---------- T6：LZMA 压缩存档导入（TCSO 标志 0x0200，t16） ----------
// 夹具 web/public/test_lzma_save.sol 由 scripts/gen_lzma_sol.mjs 生成：
//   从 test_original_save.sol 取出 AMF0 body → Java(LZMA.jar SevenZip.LzmaAlone) LZMA-alone 压缩
//   → 包装 TCSO 头 format=0x0200。两夹具 body 解压后必须逐字节相等（同一数据源）。
console.log("\n--- T6 LZMA 压缩存档导入（0x0200）---");
{
  const lzPath = join(webRoot, "public", "test_lzma_save.sol");
  if (!existsSync(lzPath)) {
    record("T6", "LZMA(0x0200) 存档导入", false, "夹具缺失: " + lzPath + "（先运行 node scripts/gen_lzma_sol.mjs）");
  } else {
    try {
      const lzBytes = readFileSync(lzPath);
      const flagOk = lzBytes[0] === 0x54 && lzBytes[1] === 0x43 && lzBytes[2] === 0x53 && lzBytes[3] === 0x4f
        && lzBytes[4] === 0x02 && lzBytes[5] === 0x00;
      const lzNameLen = (lzBytes[11] << 8) | lzBytes[12];
      const lzBodyOff = 13 + lzNameLen;
      const lzBodyLen = ((lzBytes[lzBodyOff] << 24) | (lzBytes[lzBodyOff + 1] << 16) | (lzBytes[lzBodyOff + 2] << 8) | lzBytes[lzBodyOff + 3]) >>> 0;
      const lzBody = new Uint8Array(lzBytes.subarray(lzBodyOff + 4, lzBodyOff + 4 + lzBodyLen));
      // 字节级往返：LZMA 解压 == test_original_save.sol 的未压缩 body（同一数据源，须逐字节相等）
      const rawRef = readFileSync(join(webRoot, "public", "test_original_save.sol"));
      const rNameLen = (rawRef[11] << 8) | rawRef[12];
      const rBodyOff = 13 + rNameLen;
      const rBodyLen = ((rawRef[rBodyOff] << 24) | (rawRef[rBodyOff + 1] << 16) | (rawRef[rBodyOff + 2] << 8) | rawRef[rBodyOff + 3]) >>> 0;
      const rawBody = new Uint8Array(rawRef.subarray(rBodyOff + 4, rBodyOff + 4 + rBodyLen));
      const dec = imp.lzmaDecompress(lzBody);
      const byteExact = dec.length === rawBody.length && dec.every((b, i) => b === rawBody[i]);
      const ratio = (lzBodyLen / rawBody.length).toFixed(3);
      // 端到端导入：快照须与 test_original_save.sol（未压缩路径，同一数据源）一致
      const saves = await importSolBytes(lzBytes);
      const sd = saves[0]?.save;
      const sLz = snapshot(sd);
      const refSaves = await importSolBytes(rawRef);
      const sRef = snapshot(refSaves[0]?.save);
      const importOk = saves.length === 1 && !!sRef && eq(sLz, sRef);
      const ok = flagOk && byteExact && importOk && lzBodyLen < rawBody.length;
      record("T6", "LZMA(0x0200) 存档导入（t16）", ok,
        `压缩标志=0x0200 ${flagOk ? "" : "(FAIL)"}；LZMA 解压 ${dec.length}/${rawBody.length} 字节逐字节相等=${byteExact}；体 ${rawBody.length}→${lzBodyLen}（${ratio}×）；导入快照与未压缩路径一致=${importOk}`);
    } catch (e) {
      record("T6", "LZMA(0x0200) 存档导入", false, "异常: " + e.message);
    }
  }
}

// ---------- 3. 汇总 ----------
console.log("\n=== 汇总 ===");
const failures = results.filter((r) => !r.ok);
const s1Failed = results.find((r) => r.id === "T3" && !r.ok);
const otherFailures = failures.filter((r) => r.id !== "T3"); // T5 属真实断言，失败则 exit 1
console.log("ID   | 结果 | 测试项");
for (const r of results) console.log(`${r.id.padEnd(4)} | ${r.ok ? "PASS" : "FAIL"} | ${r.name}`);
if (s1Failed) console.log("\nS1 复现：液体丢失（预期失败，t6 修复后应转绿）");
const exitOk = otherFailures.length === 0;
console.log(exitOk
  ? (s1Failed ? "\n结果：除 S1（预期）外全部通过 → exit 0" : "\n结果：全部通过 → exit 0")
  : "\n结果：存在失败 → exit 1");
rmSync(tmpDir, { recursive: true, force: true });
process.exit(exitOk ? 0 : 1);
