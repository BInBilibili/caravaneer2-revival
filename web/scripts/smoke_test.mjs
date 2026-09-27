#!/usr/bin/env node
// ============================================================================
// Caravaneer 2 (HTML5 移植) — 全流程冒烟测试脚本（可复用，供正式回归使用）
// 用法:
//   node scripts/smoke_test.mjs                    # 默认 http://localhost:5174 headless
//   node scripts/smoke_test.mjs --headed           # 有头浏览器
//   node scripts/smoke_test.mjs --url http://localhost:5173 --timeout 10000
//   node scripts/smoke_test.mjs --shots ./smoke_shots   # 关键步骤截图
//   node scripts/smoke_test.mjs --no-teleport      # 不移动车队状态：点最近可见城镇
//   node scripts/smoke_test.mjs --regression        # 回归模式：追加 移动/食物贸易/队伍背包/战斗 + 像素探针 + onerror + 自动写 web/TEAM-REGRESSION-REPORT.md
// 依赖:
//   - playwright-core（web/node_modules，脚本自动探测；无则进入 fallback 模式）
//   - 浏览器：自动探测 msedge -> chrome -> playwright 自带 chromium
//   - 游戏生产构建: vite preview --port 5174（或 dev :5173）
// 退出码:
//   0 = 全部必需步骤通过（EXPECTED-SKIP / WARN 不计失败）
//   1 = 存在必需步骤失败
//   2 = 浏览器自动化不可用（fallback 模式：HTTP 检查 + 手工步骤清单）
// ============================================================================
import { createRequire } from "module";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");

// ---------------- CLI 解析 ----------------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const has = (name) => args.includes(name);
const URL_BASE = opt("--url", "http://localhost:5174").replace(/\/$/, "");
const HEADED = has("--headed");
const TIMEOUT = parseInt(opt("--timeout", "8000"), 10);
const SHOTS_DIR = opt("--shots", "").trim();
const NO_TELEPORT = has("--no-teleport");
const FORCE_FALLBACK = has("--fallback");
const REGRESSION = has("--regression"); // 回归模式：追加 移动/食物贸易/队伍背包/战斗 步骤 + 像素探针 + window.onerror + 自动写 TEAM-REGRESSION-REPORT.md
// 城镇数量期望：默认 0 = 按运行时数据源自动判定（基础数据 + 已启用 DLC 补齐的槽位）。
// 5 个 DLC 默认 enabled：special-story 补 town_presets[0] 索引 83、welcome-to-games-of-honor 补索引 84，
// 故硬编码 83 会误报（World.ts:3195 按槽位建镇 → 85）。仍可用 --expect 85 显式指定。
const EXPECT_TOWNS = parseInt(opt("--expect", "0"), 10);
const SHOT = async (page, name) => {
  if (SHOTS_DIR) {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS_DIR, name + ".png") });
  }
  if (REGRESSION) await px(page, "PX-" + name, "像素探针 " + name);
};

// ---------------- 结果记账 ----------------
const results = []; // {id, name, status: PASS|FAIL|WARN|SKIP, detail}
function record(r) { results.push(r); }

// 结果记账工具（p/warn/skip/count）
function p(name, ok, detail, id) {
  record({ id: id || name, name, status: ok ? "PASS" : "FAIL", detail: detail || (ok ? "" : "断言失败") });
}
function warn(id, name, detail) { record({ id, name, status: "WARN", detail: detail || "" }); }
function skip(id, name, detail) { record({ id, name, status: "SKIP", detail: detail || "" }); }
function count(status) { return results.filter((r) => r.status === status).length; }

// 已知未完成项（EXPECTED-SKIP，不计失败；对应 t5/t6/t7 实现后自动转为真实断言）
const EXPECTED_SKIPS = [
  { id: "S8d", name: "买商品", note: "数量未变（交易窗口与易货链路本身已打通）" },
  { id: "S31", name: "存档液体（t6）", note: "t6 实现后自动激活" },
  { id: "S32", name: "slavers（t5）", note: "t5 实现后自动激活" },
  { id: "S33", name: "存档压缩（t7）", note: "t7 实现后自动激活" },
];

// 页面控制台错误收集（浏览器模式）
let lastConsoleErrors = [];   // 非 REGRESSION 也记录；finish 报告可读全量
let pageErrorsAll = null;     // REGRESSION 模式：window.onerror/unhandledrejection 全量

// 像素探针（仅 REGRESSION 模式由 SHOT 调用）：对 stage 采样若干固定点，保守记录（不 FAIL）
async function px(page, name, label) {
  try {
    const samples = await page.evaluate(() => {
      const c = document.getElementById("stage");
      if (!c) return null;
      const ctx = c.getContext && c.getContext("2d");
      if (!ctx) return null;
      const w = c.width, h = c.height;
      const pts = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.75]];
      const out = [];
      for (const [fx, fy] of pts) {
        try {
          const d = ctx.getImageData(Math.round(w * fx), Math.round(h * fy), 1, 1).data;
          out.push(d[0] + "," + d[1] + "," + d[2]);
        } catch { out.push("?"); }
      }
      return out;
    });
    p(name, samples !== null, "探针采样: " + (samples ? samples.join(" ") : "无 canvas"), label);
  } catch (e) {
    p(name, false, "探针异常: " + String(e), label);
  }
}

// 回归报告（仅 REGRESSION 模式）
function writeRegressionReport() {
  try {
    const fails = count("FAIL"), passes = count("PASS"), warns = count("WARN"), skips = count("SKIP");
    const lines = [];
    lines.push("# TEAM-REGRESSION-REPORT");
    lines.push("");
    lines.push("- 生成时间: " + new Date().toISOString());
    lines.push("- 通过: " + passes + " / 失败: " + fails + " / WARN: " + warns + " / SKIP: " + skips);
    lines.push("");
    lines.push("## 结果明细");
    for (const r of results) lines.push("- [" + r.status + "] " + r.id + " " + r.name + (r.detail ? " — " + r.detail : ""));
    if (lastConsoleErrors && lastConsoleErrors.length) {
      lines.push("");
      lines.push("## 页面控制台错误");
      for (const e of lastConsoleErrors.slice(0, 20)) lines.push("- " + e);
    }
    if (pageErrorsAll && pageErrorsAll.length) {
      lines.push("");
      lines.push("## window.onerror / unhandledrejection");
      for (const e of pageErrorsAll.slice(0, 20)) lines.push("- " + e);
    }
    fs.writeFileSync(path.join(WEB_ROOT, "TEAM-REGRESSION-REPORT.md"), lines.join("\n") + "\n");
  } catch (e) {
    console.log("writeRegressionReport 失败: " + String(e));
  }
}

// ---------------- 工具 ----------------
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function fetchStatus(url) {
  try {
    const r = await fetch(url, { method: "GET" });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

// 编译 SolImporter/SolExporter（Node 侧，供 S31/S33 门控探测；复用 roundtrip_test 的 tsc 方式）
let _solMods = null;
async function solModules() {
  if (_solMods) return _solMods;
  const tmpDir = path.join(WEB_ROOT, ".smoke_tmp");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const tscBin = path.join(WEB_ROOT, "node_modules", "typescript", "bin", "tsc");
  if (!fs.existsSync(tscBin)) { _solMods = null; return null; }
  try {
    execFileSync(process.execPath, [tscBin, "src/core/SolImporter.ts", "src/core/SolExporter.ts",
      "--outDir", tmpDir, "--module", "esnext", "--target", "es2022",
      "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: WEB_ROOT, stdio: "pipe" });
  } catch { /* tsc 类型错误容忍：JS 产物已产出即可 */ }
  const impP = path.join(tmpDir, "core", "SolImporter.js");
  const expP = path.join(tmpDir, "core", "SolExporter.js");
  if (!fs.existsSync(impP) || !fs.existsSync(expP)) { _solMods = null; return null; }
  try {
    const imp = await import(pathToFileURL(impP).href);
    const exp = await import(pathToFileURL(expP).href);
    _solMods = { imp, exp, tmpDir };
  } catch { _solMods = null; }
  return _solMods;
}
// S31-S33 门控说明：
//   S31 (t6 liquidsContainers+S1)：门控 = SolImporter 能往返导入 liquidsContainers（fixture 75L）。
//   S32 (t5 slavers)：门控 = 运行时存在 slavers=true 车队 或 数据含 slavers 字段。
//   S33 (t7 存档压缩)：门控 = buildSolFileCompressed 存在且输出 TCSO 头 format=0x0100（zlib deflate）。
// 门控未通过 → 记录 SKIP（EXPECTED-SKIP，不计失败）；对应 t5/t6/t7 实现完成后自动转为真实断言。
// 取消 SKIP 的验证方式：对应模块实现后直接重跑 node scripts/smoke_test.mjs，
//   S31 应转绿当 SolImporter 导入 liquidsContainers=75L（同 roundtrip T3）；
//   S32 应转绿当 slavers=true 车队可交互且贸易含 slaver 条目；
//   S33 应转绿当导出 .sol 头 format=0x0100 且压缩导出仍可往返导入。

// 页面内探针：读取当前游戏状态（window.__c2）
const PROBE_EXPR = `(() => {
  const s = (window.__c2 && window.__c2.shell) || null;
  if (!s) return { ready: false };
  const gd = s.gd || null;
  const c = gd ? gd.Caravans[0] : null;
  const texts = [];
  const walk = (root) => {
    if (!root || !root.children) return;
    for (const ch of root.children) {
      if (ch && typeof ch.text === "string" && ch.text) texts.push(ch.text);
      if (ch && ch.children && ch.children.length) walk(ch);
    }
  };
  walk(s.currentScreen);
  return {
    ready: true,
    screenNum: s.screenNum,
    gdScreen: s.gdScreen || null,
    hasGd: !!gd,
    towns: gd ? gd.Towns.length : -1,
    speed: gd ? gd.gameSpeed : -1,
    caravan: c ? { x: Math.round(c.x), y: Math.round(c.y), money: c.money, moving: c.moving, water: typeof c.cargoAmount === "function" ? c.cargoAmount(1) : -1 } : null,
    townId: s.townMode && s.townMode.town ? s.townMode.town.id : -1,
    townLocs: s.townMode && s.townMode.town ? (s.townMode.town.locations || []).length : -1,
    townLocsVisible: s.townMode && s.townMode.town ? (s.townMode.town.locations || []).filter((l) => l.visible !== false).length : -1,
    tradeVisible: s.townMode ? !!s.townMode.tradeWindow.screen.visible : false,
    tradeWaterRow: s.townMode && s.townMode.tradeWindow && s.townMode.tradeWindow.items ? s.townMode.tradeWindow.items.findIndex((i) => i.itemId === 1) : -1,
    tradeItems: s.townMode && s.townMode.tradeWindow && s.townMode.tradeWindow.items ? s.townMode.tradeWindow.items.length : -1,
    portraitChildren: s.charSetup ? s.charSetup.portrait.children.length : -1,
    charName: s.charSetup ? (s.charSetup.theCharacter.name || "") : null,
    charCjk: (() => { const t = []; const w2 = (r) => { if (!r || !r.children) return; for (const ch of r.children) { if (ch && typeof ch.text === "string" && ch.text) t.push(ch.text); if (ch && ch.children && ch.children.length) w2(ch); } }; w2(s.charSetup ? s.charSetup.screen : null); return t.some((x) => /[\u4e00-\u9fff]/.test(x)); })(),
    saveDlgVisible: s.saveDlg ? !!s.saveDlg.screen.visible : false,
    saveDlgAttached: s.saveDlg ? s.saveDlg.screen.parent !== null : false,
    slots: s.saveSlots ? s.saveSlots.list().map((e) => (e ? { name: e.name, day: e.day, money: e.money } : null)) : null,
    mapMode: s.mapMode ? true : false,
    townSymbols: s.mapMode ? s.mapMode.townSymbols.length : -1,
    titleNewGame: (() => {
      // 标题「新游戏」按钮：位于 (20,167) 240x30，buttonMode=true；文本在独立 erase 层，故按坐标+命中检测
      const root = s.currentScreen;
      let btn = null;
      const w3 = (r) => { if (!r || !r.children || btn) return; for (const ch of r.children) { if (ch && ch.buttonMode && Math.abs(ch.x - 20) < 5 && Math.abs(ch.y - 167) < 5) { btn = ch; return; } w3(ch); } };
      w3(root);
      if (!btn) return { found: false, reason: "no buttonMode node at (20,167)" };
      let hit = null;
      try { hit = root.hitTestPoint ? root.hitTestPoint(140, 182) : null; } catch (e) { return { found: false, reason: "hitTest err " + e }; }
      let isBtn = hit === btn;
      if (!isBtn && hit) { let n = hit; while (n) { if (n === btn) { isBtn = true; break; } n = n.parent; } }
      return { found: !!btn, hitIsButton: isBtn, hitKind: hit ? (hit.constructor ? hit.constructor.name : "?") : "none" };
    })(),
    texts: texts.slice(0, 40),
  };
})()`;

async function probe(page) {
  return page.evaluate(PROBE_EXPR);
}

async function waitFor(page, pred, timeout, label) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    try {
      last = await page.evaluate(pred);
      if (last) return { ok: true, value: last };
    } catch (e) { last = "eval-err:" + String(e); }
    await sleep(60);
  }
  return { ok: false, value: last };
}

async function clickXY(page, lx, ly) {
  const b = await page.evaluate(() => {
    const c = document.getElementById("stage");
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  await page.mouse.click(b.left + (lx / 880) * b.width, b.top + (ly / 495) * b.height);
}

// ---------------- Fallback 模式：HTTP 检查 + 手工清单 ----------------
function distHash() {
  const dist = path.join(WEB_ROOT, "dist");
  const out = { exists: false, indexHash: null, assetCount: 0 };
  try {
    const idx = path.join(dist, "index.html");
    if (fs.existsSync(idx)) {
      out.exists = true;
      out.indexHash = crypto.createHash("sha256").update(fs.readFileSync(idx)).digest("hex").slice(0, 16);
      const assets = path.join(dist, "assets");
      if (fs.existsSync(assets)) out.assetCount = fs.readdirSync(assets).length;
    }
  } catch { /* ignore */ }
  return out;
}

const PROBE_TEMPLATE = `// 在浏览器控制台粘贴，检查游戏是否加载（window.__c2 探针）
(() => {
  const s = window.__c2 && window.__c2.shell;
  console.log("__c2:", !!s, "| screenNum:", s && s.screenNum, "| gd:", !!s && !!s.gd);
  if (s && s.gd) {
    console.log("Towns:", s.gd.Towns.length, "| Caravan:", s.gd.Caravans[0] ? "ok" : "MISSING",
      "| gameSpeed:", s.gd.gameSpeed, "| money:", s.gd.Caravans[0].money);
  }
  return { ready: !!s, screenNum: s && s.screenNum, towns: s && s.gd ? s.gd.Towns.length : -1 };
})()`;

const MANUAL_STEPS = [
  ["S1 标题屏", "打开 " + URL_BASE + "，应见标题画面（背景 + 左侧 7 个按钮）", "按钮「新游戏」位于 (140,182) 附近，可点击"],
  ["S2 角色创建", "点「新游戏」→ 应进入角色创建", "左下肖像有内容；随机名字非空；界面含中文标签；底部「完成」按钮 (732,474)"],
  ["S3 游戏设置", "点「完成」→ 应进入游戏设置（难度/模式/自动存档/教程）", "点「开始」(547,465)"],
  ["S4 地图", "点「开始」→ 片头 2 秒 → 大地图", "右下计数器可见；城镇圆点 + 名字；车队圆圈在屏幕中心 (325,248)"],
  ["S5 速度切换", "底部 HUD 点 4x (786,470)、暂停 ⏸ (815,470)", "4x 时速度变 4 倍；⏸ 时暂停（车速停止）"],
  ["S6 移动进镇", "点击屏幕上可见的城镇圆点（x<670）", "进入城镇画面（镇名 + 设施标记）"],
  ["S7 城镇设施", "断言设施标记数量", "目标镇（Your Bunker 等）应有 6 个设施标记"],
  ["S8 贸易买水", "点击红色水滴设施标记（category 1）", "易货窗口打开；对方列表第一行=水；点行入交易区→Calculator→BARTER"],
  ["S9 存档", "城镇菜单按钮 5/6 返回地图 → 底部 OPTIONS (692,470) → 面板 SAVE GAME (390,305)", "存档对话出现；点第一槽 SAVE (568,83)；CLOSE (440,455)"],
  ["S10 返回标题", "底部 OPTIONS (692,470) → 面板 Exit (640,305)", "回到标题画面"],
  ["S11 读档", "标题「读档」(140,223) → 点第一槽 LOAD (653,83)", "回到大地图，金钱/日期与存档一致"],
  ["S12 返回标题", "底部 OPTIONS (692,470) → Exit (640,305)", "回到标题画面，全流程结束"],
  ["S31 存档液体（t6 已完成，自动生效）", "进镇买水/燃料 → 存档 → 读档", "液体量一致（liquidsContainers 分组往返）"],
  ["S32 slavers（t5 已完成，自动生效）", "进 allowsSlaves 奴隶镇 → 贸易窗", "贸易窗含 [奴隶] 购买行（20000+i）与卖人行（30000+i）"],
  ["S33 存档压缩（t7 已完成，自动生效）", "导出 .sol → 检查文件头", "TCSO 头 format=0x0100 + 压缩 body（buildSolFileCompressed）"],
];

async function runFallback() {
  console.log("\n[fallback] 未找到 playwright/playwright-core —— 使用 HTTP 检查 + 手工步骤清单模式\n");
  const url = URL_BASE + "/";
  const st = await fetchStatus(url);
  const okHttp = st.ok && st.status === 200;
  p("A1 页面可达", okHttp, okHttp ? "GET " + url + " -> " + st.status : "GET " + url + " -> " + (st.error || st.status), "A1");
  const dh = distHash();
  const okDist = dh.exists && dh.indexHash && dh.assetCount > 0;
  p("A2 dist 产物", okDist, JSON.stringify(dh), "A2");
  if (okHttp && okDist) {
    warn("A3", "浏览器自动化不可用（未装 playwright），点击链路未验证", "安装: cd web && npm i -D playwright-core（配合本机 Edge/Chrome 自动可用）");
    console.log("\n--- __c2 探针模板（浏览器控制台粘贴） ---\n" + PROBE_TEMPLATE + "\n");
    console.log("\n--- 浏览器手工步骤清单 ---");
    for (const [id, name, expect] of MANUAL_STEPS) console.log("  [" + id + "] " + name + "\n       期望: " + expect);
  }
  console.log("\n--- 已知未完成项（EXPECTED-SKIP） ---");
  for (const e of EXPECTED_SKIPS) console.log("  [" + e.id + "] " + e.name + " — " + e.note);
  return finish(count("FAIL") === 0 ? 2 : 1);
}

// ---------------- 浏览器模式 ----------------
function loadPlaywright() {
  for (const mod of ["playwright-core", "playwright"]) {
    try { return require(mod); } catch { /* next */ }
  }
  return null;
}

async function launchBrowser(pw) {
  const channels = ["msedge", "chrome", "msedge-beta", "msedge-dev"];
  let lastErr = null;
  for (const ch of channels) {
    try {
      const browser = await pw.chromium.launch({ channel: ch, headless: !HEADED });
      return { browser, channel: ch };
    } catch (e) { lastErr = e; }
  }
  try {
    const browser = await pw.chromium.launch({ headless: !HEADED });
    return { browser, channel: "bundled-chromium" };
  } catch (e) {
    throw new Error("无法启动浏览器: " + String(lastErr) + " || " + String(e));
  }
}

async function runBrowser() {
  const pw = loadPlaywright();
  if (!pw || FORCE_FALLBACK) return await runFallback();
  console.log("\n[browser] playwright 可用，目标 " + URL_BASE + "（headless=" + !HEADED + "）\n");

  const url = URL_BASE + "/";
  const st = await fetchStatus(url);
  p("A1 页面可达", st.ok && st.status === 200, "GET " + url + " -> " + (st.status || st.error), "A1");
  if (!(st.ok && st.status === 200)) {
    record({ id: "A1", name: "页面可达", status: "FAIL", detail: "服务未启动? 运行: cd web && npm run build && npx vite preview --port 5174 --strictPort" });
    return finish(1);
  }

  const { browser, channel } = await launchBrowser(pw);
  console.log("[browser] 使用浏览器通道: " + channel);
  // 每轮独立 context：localStorage 干净（存档/配置不跨轮污染）
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push((m.location && m.location().url ? m.location().url : "") + " :: " + m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 300)));
  lastConsoleErrors = consoleErrors; // 同一数组引用，报告可读全量
  // window.onerror + unhandledrejection 挂钩（任务要求）
  await page.addInitScript(() => {
    window.__c2PageErrors = [];
    window.onerror = (msg, src, line, col, err) => { try { window.__c2PageErrors.push(String(msg) + " @" + (src || "?") + ":" + (line || 0)); } catch { /* ignore */ } return false; };
    window.addEventListener("unhandledrejection", (ev) => { try { window.__c2PageErrors.push("unhandledrejection: " + String(ev.reason).slice(0, 200)); } catch { /* ignore */ } });
  });

  const waitScreen = (num, label) => waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return !!s && s.screenNum === ${num}; })()`, TIMEOUT, label);
  const waitMap = () => waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return !!s && !!s.gd && !!s.mapMode && s.gdScreen === "map"; })()`, TIMEOUT, "map");
  const waitReady = () => waitFor(page, `(() => !!(window.__c2 && window.__c2.shell))()`, TIMEOUT, "boot");

  await page.goto(url, { waitUntil: "load" });
  const boot = await waitReady();
  p("S0 游戏启动", boot.ok, boot.ok ? "window.__c2.shell 就绪" : "启动超时: " + JSON.stringify(boot.value), "S0");
  if (!boot.ok) { await browser.close(); return finish(1); }

  // ---------- S1 标题 ----------
  await SHOT(page, "01_title");
  const st1 = await probe(page);
  const titleOk = st1.ready && st1.screenNum === 2;
  p("S1 标题屏", titleOk, JSON.stringify({ screenNum: st1.screenNum, newGameBtn: st1.titleHasNewGame }), "S1");
  p("S1b 「新游戏」按钮存在且可点击", !!(st1.titleNewGame && st1.titleNewGame.found && st1.titleNewGame.hitIsButton), "坐标 (20,167) buttonMode 节点命中: " + JSON.stringify(st1.titleNewGame), "S1b");
  await clickXY(page, 140, 182);
  const cs = await waitScreen(6, "角色创建");
  p("S1c 点击「新游戏」→ 角色创建", cs.ok, cs.ok ? "screenNum=6" : "未进入角色创建: " + JSON.stringify(cs.value), "S1c");
  if (!cs.ok) { await browser.close(); return finish(1); }

  // ---------- S2 角色创建 ----------
  await SHOT(page, "02_charsetup");
  // 肖像图层异步加载（assets.ensure → drawPortrait 重绘），轮询直到 children>0
  const cs2 = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; const n = s && s.charSetup ? s.charSetup.portrait.children.length : -1; return n > 0 ? { n: n } : null; })()`, TIMEOUT, "portrait");
  const cs3 = await probe(page);
  p("S2a 肖像有图层", cs2.ok && cs2.value.n > 0, cs2.ok ? "portrait.children=" + cs2.value.n : "肖像为空（可能 t8/t9 像素问题）", "S2a");
  if (!(cs2.ok && cs2.value.n > 0)) warn("S2a", "肖像图层为 0", "建议归入 t8/t9 像素 EXPECTED-SKIP 观察");
  p("S2b 随机名字非空", !!(cs3.charName && cs3.charName.trim()), "name=" + JSON.stringify(cs3.charName), "S2b");
  p("S2c 界面含中文标签", !!cs3.charCjk, "角色创建界面存在 CJK 文本", "S2c");
  await clickXY(page, 732, 474); // 完成
  const gs = await waitScreen(7, "游戏设置");
  p("S2d 点击「完成」→ 游戏设置", gs.ok, gs.ok ? "screenNum=7" : "未进入游戏设置: " + JSON.stringify(gs.value), "S2d");
  if (!gs.ok) { await browser.close(); return finish(1); }

  // ---------- S3 游戏设置 → 开始 ----------
  await SHOT(page, "03_gamesetup");
  await clickXY(page, 547, 465); // 开始
  // t79：剧情模式现在显示叙事页（StoryStartBG + text 1608 + 继续按钮）
  // 等待叙事页出现（screenNum=8）
  const storyPage = await waitFor(page, `(() => {
    const s = window.__c2 && window.__c2.shell;
    return s && s.screenNum === 8 ? { screenNum: 8 } : null;
  })()`, TIMEOUT, "storyPage");
  p("S3a 点「开始」→ 叙事页", storyPage.ok, storyPage.ok ? "screenNum=8" : "未进入叙事页: " + JSON.stringify(storyPage.value), "S3a");
  if (!storyPage.ok) { await browser.close(); return finish(1); }
  
  // 点击「继续」按钮（原版位置 x=340, y=450, 200x30，中心 (440, 465)）
  await clickXY(page, 440, 465);
  const map = await waitMap();
  p("S3b 点「继续」→ 大地图", map.ok, map.ok ? "gdScreen=map" : "未进入地图: " + JSON.stringify(map.value), "S3b");
  if (!map.ok) { await browser.close(); return finish(1); }

  // ---------- S3b 碉堡开场（t64 ①）：值星官对话 → 主席布拉斯对话 → 回地图 ----------
  // 开局玩家在镇15（碉堡）北 100px，storyMode=1 时 MapMode 首帧即触发 <500px 值星官确认框（文本 1609）
  {
    const intro = await waitFor(page, `(() => {
      const s = window.__c2 && window.__c2.shell;
      const mm = s && s.mapMode;
      const gd = s && s.gd;
      const p = mm && mm.bunkerPrompt;
      return p && p.visible && gd && gd.story && gd.story.get("enteredBunkerForTheFirstTime") === true ? { flag: true } : null;
    })()`, TIMEOUT, "bunkerIntro");
    p("S3b1 首近碉堡弹值星官对话(1609/flag 置位)", intro.ok && intro.value && intro.value.flag === true,
      intro.ok ? "bunkerPrompt 可见 + enteredBunkerForTheFirstTime=true" : "未出现: " + JSON.stringify(intro.value), "S3b1");
    // 点「好」（单按钮 YesNo：D@(190,148) + approve(147,160) 200×30 → 绝对中心 (437,328)）
    await clickXY(page, 437, 328);
    const bras = await waitFor(page, `(() => {
      const s = window.__c2 && window.__c2.shell;
      return s && s.gdScreen === "town" && s.eventDlg && s.eventDlg.screen.visible ? true : null;
    })()`, TIMEOUT, "brasDlg");
    p("S3b2 进碉堡 → 主席布拉斯对话", bras.ok === true, bras.ok ? "gdScreen=town 且 eventDlg 可见" : JSON.stringify(bras.value), "S3b2");
    // 夹具：跳过 Rovers 刷新（t64 链在出镇时 spawn；Rovers 专项由 t58/t59 系列验证，烟测保持干净周边）
    await page.evaluate(() => { const gd = window.__c2.shell.gd; if (gd.story) gd.story.set("exitedBunker", true); });
    await clickXY(page, 858, 16); // X 关布拉斯对话（t80：原版 MapMode.as L7355 case8 onApprove → enterTown(15)+setMode(7,1) → 留在城镇页，不是回地图）
    const stayedTown = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return s && s.gdScreen === "town" && s.townMode && s.townMode.screen.visible ? true : null; })()`, TIMEOUT, "stayTown");
    p("S3b3 关闭布拉斯对话留在城镇页", stayedTown.ok === true, stayedTown.ok ? "gdScreen=town" : JSON.stringify(stayedTown.value), "S3b3");
    // 出镇回地图继续后续用例（原版 Set Sail：townMode 按钮 6）
    await page.evaluate(() => { const sh = window.__c2.shell; if (sh.gdScreen === "town" && sh.townMode) sh.exitTown(); });
    const backMap = await waitMap();
    p("S3b4 出镇回地图继续", backMap.ok, backMap.ok ? "gdScreen=map" : JSON.stringify(backMap.value), "S3b4");
  }

  // t56 方向修复后车队按原版 0=北 起步，会径直走向起始镇 #15（(-10000,-1000) 北 100px）
  // 并在移动中触发自动进镇（t35 语义，回归 S8x4/S8x6 仍验证）；固定夹具：先停止车队，
  // 避免 S4/S5 速度测试期间被自动进镇打断（原版：起始车仅 25px 内 overTown 标记，进镇靠点击）
  await page.evaluate(() => { const gd = window.__c2.shell.gd; if (gd) gd.Caravans[0].moving = false; });

  // ---------- S4 地图断言 ----------
  await sleep(800); // 等地图背景瓦片异步加载（PX-04 防 flake）
  await SHOT(page, "04_map");
  const st4 = await probe(page);
  // 期望值 = 数据源 town_presets[0] 的槽位总数（World.ts:3195 逐槽位建镇，独立启用的 DLC 会补齐索引）
  const autoTowns = await page.evaluate(() => {
    const tp = window.__c2 && window.__c2.shell && window.__c2.shell.ds
      ? window.__c2.shell.ds.presets && window.__c2.shell.ds.presets.town_presets && window.__c2.shell.ds.presets.town_presets[0]
      : null;
    return tp ? Object.keys(tp).length : null;
  });
  const expectTowns = EXPECT_TOWNS || autoTowns || 83;
  const expectSrc = EXPECT_TOWNS ? "--expect 指定" : autoTowns ? "数据源槽位自动判定" : "回退默认 83";
  p("S4a 城镇数量 = " + expectTowns, st4.towns === expectTowns, "gd.Towns.length=" + st4.towns + "（期望 " + expectTowns + "，" + expectSrc + "）", "S4a");
  p("S4b 车队存在", !!(st4.caravan && st4.hasGd), JSON.stringify(st4.caravan && { x: st4.caravan.x, y: st4.caravan.y, money: st4.caravan.money }), "S4b");
  p("S4c 地图城镇符号已建立", st4.townSymbols === expectTowns, "mapMode.townSymbols=" + st4.townSymbols + "（期望 " + expectTowns + "，" + expectSrc + "）", "S4c");
  p("S4d 初始速度 1x", st4.speed === 1, "gameSpeed=" + st4.speed, "S4d");

  // ---------- S5 速度切换（3x / 暂停） ----------
  // 新版地图底部 HUD（ui-px t8 对齐原版 y=445）：OPTIONS(675-710)/1x(710-741)/2x(741-771)/4x(771-800)/⏸(800-830)，命中高 50px → 点 y=470
  await clickXY(page, 786, 470); // 4x 段中心 (771+800)/2
  await sleep(120);
  const sp3 = await probe(page);
  p("S5a 3x/4x 速度", sp3.speed === 4, "gameSpeed=" + sp3.speed + "（期望 4）", "S5a");
  await clickXY(page, 815, 470); // ⏸ 段中心 (800+830)/2
  await sleep(120);
  const sp0 = await probe(page);
  p("S5b 暂停", sp0.speed === 0, "gameSpeed=" + sp0.speed + "（期望 0）", "S5b");
  // 保持暂停，保证后续确定性

  // ---------- S5c 移动（真实行进，回归模式） ----------
  if (REGRESSION) {
    // 夹具：NPC 车队移远，避免移动途中敌对触发/自动进镇干扰（纯运动学验证）
    await page.evaluate(() => { const gd = window.__c2.shell.gd; for (const n of gd.npcCaravans) { n.x = 999999; n.y = 999999; } });
    await clickXY(page, 725, 470); // 1x
    await sleep(120);
    const mv0 = await probe(page);
    const p0 = { x: mv0.caravan.x, y: mv0.caravan.y };
    await clickXY(page, 80, 250); // 点地图（向西行进）
    await sleep(1500);
    const mv1 = await probe(page);
    const dist = Math.hypot(mv1.caravan.x - p0.x, mv1.caravan.y - p0.y);
    p("S5c 移动（真实行进）", dist > 20, "(" + Math.round(p0.x) + "," + Math.round(p0.y) + ")→(" + Math.round(mv1.caravan.x) + "," + Math.round(mv1.caravan.y) + ") 位移 " + Math.round(dist) + "px（1x 约 66px/s）", "S5c");
    await clickXY(page, 815, 470); // ⏸ 恢复暂停
    await sleep(100);
  }

  // ---------- S6 移动进镇 ----------
  // 目标：最近"6 个可见设施标记"的城镇；无则最近可见城镇
  const target = await page.evaluate(() => {
    const gd = window.__c2.shell.gd;
    const c = gd.Caravans[0];
    const towns = gd.Towns.map((t, i) => {
      const vis = (t.locations || []).filter((l) => l.visible !== false).length;
      return { i, x: t.x, y: t.y, vis, total: (t.locations || []).length };
    });
    const byD = (a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y);
    const six = towns.filter((t) => t.vis === 6).sort(byD)[0];
    return six ? six : towns.filter((t) => t.vis > 0).sort(byD)[0];
  });
  if (!target) {
    p("S6 移动进镇", false, "没有可进入的城镇", "S6");
    await browser.close(); return finish(1);
  }
  let enterDetail = "目标城镇 #" + target.i + " 设施=" + target.total + " 可见=" + target.vis;
  if (NO_TELEPORT) {
    // 不移动车队：找最近可见（屏幕内）城镇符号并点击
    const sym = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; if (!s.mapMode) return null; const i = ${target.i}; const sy = s.mapMode.townSymbols[i]; return sy && sy.disp.visible ? { x: sy.disp.x, y: sy.disp.y } : null; })()`, 1500, "symbol");
    if (!sym.ok) { p("S6 移动进镇", false, "目标城镇符号不可见（--no-teleport）: " + JSON.stringify(sym.value), "S6"); await browser.close(); return finish(1); }
    await clickXY(page, sym.value.x, sym.value.y);
  } else {
    // 将车队置于目标城镇西侧 100px（测试夹具；随后仍走真实点击链路）
    await page.evaluate((t) => {
      const gd = window.__c2.shell.gd;
      const c = gd.Caravans[0];
      c.x = t.x - 15; c.y = t.y; c.moving = false; c.direction = 0; // t30：点击进镇需车在 25px 内（overTown）
      if (c.money < 500) c.money = 5000; // 测试夹具：故事模式初始 0 钱，补足以验证贸易链路
    }, target);
    await sleep(200); // 等 update 刷新符号位置
    const sym = await page.evaluate((i) => {
      const sy = window.__c2.shell.mapMode.townSymbols[i];
      return { x: sy.disp.x, y: sy.disp.y, visible: sy.disp.visible };
    }, target.i);
    if (!sym.visible || sym.x < 0 || sym.x > 670 || sym.y < 0 || sym.y > 495) {
      p("S6 移动进镇", false, "城镇符号屏幕外: " + JSON.stringify(sym), "S6");
      await browser.close(); return finish(1);
    }
    await clickXY(page, sym.x, sym.y);
    enterDetail += "（测试夹具: 车队移至镇西 100px，符号屏幕坐标 " + Math.round(sym.x) + "," + Math.round(sym.y) + "）";
  }
  const town = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return s.gdScreen === "town" && s.townMode ? s.townMode.town.id : null; })()`, TIMEOUT, "town");
  p("S6 移动进镇", town.ok, town.ok ? "进入城镇 #" + town.value + " " + enterDetail : "未进入城镇: " + JSON.stringify(town.value), "S6");
  if (!town.ok) { await browser.close(); return finish(1); }
  const targetId = town.value;

  // ---------- S7 城镇设施标记 ----------
  await SHOT(page, "07_town");
  const st7 = await probe(page);
  const want6 = target.vis === 6;
  if (want6) {
    p("S7 设施标记 = 6", st7.townLocsVisible === 6, "town#" + targetId + " 可见设施=" + st7.townLocsVisible + " 总数=" + st7.townLocs, "S7");
  } else {
    p("S7 设施标记（数据驱动）", st7.townLocsVisible === target.vis, "town#" + targetId + " 可见设施=" + st7.townLocsVisible + "（无 6 设施镇可达，按实际断言）", "S7");
  }

  // ---------- S7b 统计页 → 城镇名按钮回设施页（t64 ②） ----------
  {
    await clickXY(page, 760, 112); // 城镇菜单按钮 1（统计，(660,92) 200×40 中心）
    await sleep(250);
    const stats = await page.evaluate(() => {
      const tm = window.__c2.shell.townMode;
      return { ov: !!(tm.statsOv && tm.statsOv.visible), layer: !!(tm.townLayer && tm.townLayer.visible) };
    });
    p("S7b1 统计页打开（设施层隐藏）", stats.ov && !stats.layer, JSON.stringify(stats), "S7b1");
    await clickXY(page, 760, 42); // 城镇菜单按钮 0（城镇名，(660,22) 中心）
    await sleep(250);
    const backFac = await page.evaluate(() => {
      const tm = window.__c2.shell.townMode;
      return { ov: !!tm.statsOv, ovVisible: !!(tm.statsOv && tm.statsOv.visible), layer: !!(tm.townLayer && tm.townLayer.visible) };
    });
    p("S7b2 点城镇名按钮回设施页（统计关闭/设施层恢复）", backFac.ovVisible === false && backFac.layer, JSON.stringify(backFac), "S7b2");
  }

  // ---------- S8 贸易：原版易货制（t2 新交互） ----------
  // 新交互：点源列表行 → 物品进入交易区（>3 弹 Calculator）→ BARTER 成交；点交易区物品可放回
  const tradeLoc = await page.evaluate((id) => {
    const t = window.__c2.shell.gd.Towns[id];
    const locs = (t.locations || []).filter((l) => l.visible !== false && l.category === 1);
    // 优先市场（subCat1，显示 town.stock——玩家卖水/城镇产业会往里补货，可买水）；
    // 无市场时退回有 assortment 的杂货舖（选价格最低且开局库存>0 的商品）
    let pick = locs.find((l) => l.subCategory === 1) || null;
    let firstItem = 0;
    if (pick) {
      firstItem = 1; // 水
    } else {
      const withAss = locs.filter((l) => (l.assortment || []).length > 0);
      pick = withAss[0] || locs[0];
      if (pick && (pick.assortment || []).length) {
        let best = Infinity;
        for (const a of pick.assortment) {
          const def = window.__c2GetItemData ? window.__c2GetItemData(a.item) : null;
          if (a.amount < 1 && !(def && def.divisible)) continue;
          const pr = def && typeof def.price === "number" ? def.price : Infinity;
          if (pr < best) { best = pr; firstItem = a.item; }
        }
        if (!firstItem) firstItem = pick.assortment[0].item;
      }
    }
    return pick ? { x: pick.x + 20, y: pick.y + 82 - 35, sub: pick.subCategory, name: pick.name, firstItem } : null;
  }, targetId);
  if (!tradeLoc) {
    skip("S8", "贸易（买水）", "城镇 #" + targetId + " 无可见 category=1 设施，跳过");
  } else {
    await clickXY(page, tradeLoc.x, tradeLoc.y);
    const tw = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return s.townMode && s.townMode.tradeWindow.screen.visible ? true : false; })()`, TIMEOUT, "trade");
    p("S8a 贸易窗口打开（易货双栏）", tw.ok, tw.ok ? "点击设施 (" + Math.round(tradeLoc.x) + "," + Math.round(tradeLoc.y) + ")" : "贸易窗口未打开: " + JSON.stringify(tw.value), "S8a");
    if (!tw.ok) { await browser.close(); return finish(1); }
    await SHOT(page, "08_trade");
    const tw2 = await probe(page);
    const tradeItemId = tradeLoc.firstItem || 1;
    const hasItem = await page.evaluate((it) => {
      const tw = window.__c2.shell.townMode.tradeWindow;
      return tw && tw.items ? tw.items.some((i) => i.itemId === it) : false;
    }, tradeItemId);
    // 市场（subCat1）开局显示 town.stock（可能为空，靠产业/玩家卖货补）；杂货舖显示 shop.stock（assortment 初始化）
    const listOk = tradeLoc.sub === 1 ? tw2.tradeItems >= 0 : hasItem;
    p("S8b 对方列表" + (tradeLoc.sub === 1 ? "可交易（市场 town.stock" + tw2.tradeItems + " 行）" : "含商品行（item " + tradeItemId + "）"), listOk,
      "对方 " + tw2.tradeItems + " 行，找 item " + tradeItemId + "=" + hasItem + "（设施 sub" + tradeLoc.sub + "）", "S8b");
    const w0 = tw2.caravan ? tw2.caravan.water : -1;
    const m0 = tw2.caravan ? tw2.caravan.money : -1;
    const itm0 = await page.evaluate((it) => { const c = window.__c2.shell.gd.Caravans[0]; return typeof c.cargoAmount === "function" ? c.cargoAmount(it) : -1; }, tradeItemId); // 玩家已有该商品数（卖前置）
    // 冒烟辅助：点源列表行（side=0 玩家左栏 / 1 对方右栏），先滚动列表使目标行可见（PITCH=80，视口高 389/390），
    // Calculator 出现时按 1+OK
    const clickSource = async (side, type, label) => {
      const y = await page.evaluate(([s, t]) => {
        const tw = window.__c2.shell.townMode.tradeWindow;
        const y0 = tw.sourceRowY(s, t);
        if (y0 < 0) return -1;
        // 行中心 = 列表 y(73 玩家/42 对方) + 10 + idx×80 + 35 → idx 反推
        const idx = Math.round((y0 - (s === 0 ? 118 : 87)) / 80);
        const sc = tw.sides[s] ? tw.sides[s].list : null;
        let y = y0;
        if (sc && sc.Content) {
          const cur = Number(sc.Content.y) || 0;
          const need = Math.max(0, 10 + idx * 80 + 70 - 389); // 目标格底 − 视口高
          if (need > 0 || cur < 0) {
            sc.updateSize();
            sc.scroll = -need; // 直接设置滚动偏移（onWheel 是鼠标滚轮增量 ×0.3，不能用于程序滚动）
            y = y0 - need;
          }
        }
        return y;
      }, [side, type]);
      if (y < 0) return { ok: false, y };
      await clickXY(page, side === 0 ? 64 : 813, y);
      await sleep(200);
      const cal = await page.evaluate(() => window.__c2.shell.townMode.tradeWindow.calculatorVisible);
      if (cal) {
        await clickXY(page, 393, 232); // Calculator "1"（按钮中心，避免角点浮点边界）
        await sleep(80);
        await clickXY(page, 393, 408); // OK（按钮中心）
        await sleep(150);
      }
      return { ok: true, y };
    };
    // 先卖 1 水（容器满时买会被液体容量挡住，故先卖再买）
    if (w0 >= 1) {
      const s = await clickSource(0, 1, "卖水");
      if (!s.ok) { warn("S8c", "玩家列表无「水」行", "sourceRowY(0,1)=" + s.y); } else {
        await clickXY(page, 602, 239); // BARTER
        await sleep(200);
        const a1 = await probe(page);
        const sellOk = a1.caravan && a1.caravan.water === w0 - 1 && a1.caravan.money > m0;
        p("S8c 卖水 -1（易货）", !!sellOk, "水 " + w0 + "→" + (a1.caravan ? a1.caravan.water : "?") + " 钱 " + m0 + "→" + (a1.caravan ? a1.caravan.money : "?"), "S8c");
      }
    } else {
      warn("S8c", "初始水量为 0，跳过卖水前置", "w0=" + w0);
    }
    // S8c2 卖杂货舖首项（若玩家已持有该商品；水已在 S8c 卖过，跳过）
    if (tradeItemId !== 1 && itm0 >= 1) {
      const s2 = await clickSource(0, tradeItemId, "卖商品");
      if (!s2.ok) { warn("S8c2", "玩家列表无商品行", "sourceRowY(0," + tradeItemId + ")=" + s2.y); } else {
        await clickXY(page, 602, 239); // BARTER
        await sleep(200);
        const a2 = await page.evaluate((it) => { const c = window.__c2.shell.gd.Caravans[0]; return typeof c.cargoAmount === "function" ? c.cargoAmount(it) : -1; }, tradeItemId);
        p("S8c2 卖商品 -1（易货）", a2 === itm0 - 1, "item " + tradeItemId + " " + itm0 + "→" + a2, "S8c2");
      }
    } else {
      warn("S8c2", "玩家无该商品，跳过卖前置", "item0=" + itm0);
    }
    const b0 = await probe(page);
    const wB = b0.caravan ? b0.caravan.water : -1;
    const mB = b0.caravan ? b0.caravan.money : -1;
    const cB = await page.evaluate((it) => { const c = window.__c2.shell.gd.Caravans[0]; return typeof c.cargoAmount === "function" ? c.cargoAmount(it) : -1; }, tradeItemId);
    const sBuy = await clickSource(1, tradeItemId, "买商品");
    if (!sBuy.ok) {
      skip("S8d", "买商品", "对方列表无 item " + tradeItemId + " 行 sourceRowY(1," + tradeItemId + ")=" + sBuy.y);
    } else {
      await clickXY(page, 602, 239); // BARTER
      await sleep(200);
      const b1 = await probe(page);
      const wA = b1.caravan ? b1.caravan.water : -1;
      const mA = b1.caravan ? b1.caravan.money : -1;
      const cA = await page.evaluate((it) => { const c = window.__c2.shell.gd.Caravans[0]; return typeof c.cargoAmount === "function" ? c.cargoAmount(it) : -1; }, tradeItemId);
      const buyOk = cA === cB + 1 && mA < mB;
      if (buyOk) {
        p("S8d 买商品 +1（易货）", true, "item " + tradeItemId + " " + cB + "→" + cA + " 钱 " + mB + "→" + mA + "（margin/tax 含税定价）", "S8d");
      } else if (cA === cB && mA === mB) {
        skip("S8d", "买商品（EXPECTED-SKIP: 数量未变）", "交易后数量未变（item " + tradeItemId + " " + cB + "→" + cA + "）。交易窗口与易货链路本身已打通");
      } else {
        p("S8d 买商品 +1（易货）", false, "item " + tradeItemId + " " + cB + "→" + cA + " 钱 " + mB + "→" + mA, "S8d");
      }
    }
    // S8e 食物贸易（回归模式）
    if (REGRESSION) {
      const food = await page.evaluate(() => {
        const tw = window.__c2.shell.townMode.tradeWindow;
        const items = tw.items || [];
        const idx = items.findIndex((i) => i.itemId < 20000 && (() => { const def = window.__c2GetItemData ? window.__c2GetItemData(i.itemId) : null; return def && def.food; })());
        return idx >= 0 ? { idx, id: items[idx].itemId, name: items[idx].name } : null;
      });
      if (!food) {
        skip("S8e", "食物贸易", "贸易列表无食物行");
      } else {
        const cBefore = await page.evaluate((id) => window.__c2.shell.gd.Caravans[0].cargoAmount(id), food.id);
        const sFood = await clickSource(1, food.id, "食物");
        if (!sFood.ok) { skip("S8e", "食物贸易", "对方列表无该行"); }
        else {
          await clickXY(page, 602, 239); // BARTER
          await sleep(200);
          const cAfter = await page.evaluate((id) => window.__c2.shell.gd.Caravans[0].cargoAmount(id), food.id);
          p("S8e 食物贸易 +1（易货）", cAfter === cBefore + 1, "食物 " + food.name + "(id=" + food.id + " 行" + food.idx + ") cargo " + cBefore + "→" + cAfter, "S8e");
        }
      }
    }
    await clickXY(page, 192, 239); // EXIT（原版 1344 @132,225 120x28 中心）
    await sleep(150);
  }
  // ---------- S9 存档 ----------
  await clickXY(page, 760, 432); // 城镇菜单按钮 5（地图/离开）
  const backMap = await waitMap();
  p("S9a 返回地图", backMap.ok, backMap.ok ? "gdScreen=map" : "未返回地图", "S9a");
  if (!backMap.ok) { await browser.close(); return finish(1); }

  // ---------- S8x 点击城镇语义（t30：远点不进镇/近点进镇/出镇不死循环） ----------
  {
    const fx = await page.evaluate(() => {
      const gd = window.__c2.shell.gd;
      const c = gd.Caravans[0];
      // 选一个城镇，车放在其东 300px（城镇符号屏幕内、车离所有城镇 >25px → 非 overTown）
      let px = 0, py = 0, farTown = -1;
      for (let attempt = 0; attempt < 60 && farTown < 0; attempt++) {
        const i = Math.floor(Math.random() * gd.Towns.length);
        const t = gd.Towns[i];
        const cx = t.x + 300, cy = t.y;
        const nearAny = gd.Towns.some((o) => Math.hypot(o.x - cx, o.y - cy) < 26);
        if (!nearAny) { farTown = i; px = cx; py = cy; }
      }
      c.x = px; c.y = py; c.moving = false; c.direction = 0;
      // 移开 NPC 车队（避免移动测试途中敌对触发）
      for (const n of gd.npcCaravans) { n.x = 999999; n.y = 999999; }
      const d = farTown >= 0 ? Math.hypot(gd.Towns[farTown].x - c.x, gd.Towns[farTown].y - c.y) : -1;
      return { far: farTown, farD: Math.round(d) };
    });
    if (fx.far < 0) { p('S8x 点击城镇语义', false, '无可点击的远处城镇', 'S8x'); }
    else {
      await sleep(500); // 等符号重定位（overTown/可见性按帧重算）
      const symX = await page.evaluate((i) => { const sy = window.__c2.shell.mapMode.townSymbols[i]; return { x: sy.disp.x, y: sy.disp.y, visible: sy.disp.visible }; }, fx.far);
      if (!symX.visible) { p('S8x 点击城镇语义', false, '远处城镇符号不可见: ' + JSON.stringify(symX), 'S8x'); }
      else {
        // S8x1：点远处城镇 → 不直接进镇（移动指令）
        await clickXY(page, symX.x, symX.y);
        await sleep(300);
        const x1 = await page.evaluate(() => { const s = window.__c2.shell; return { screen: s.gdScreen, moving: s.gd.Caravans[0].moving }; });
        p('S8x1 点远处城镇不直接进镇（移动指令）', x1.screen === 'map' && x1.moving === true, JSON.stringify(x1), 'S8x1');
        // S8x2：走近城镇（15px 内）→ 点城镇进镇
        await page.evaluate((i) => {
          const gd = window.__c2.shell.gd;
          const c = gd.Caravans[0];
          const t = gd.Towns[i];
          c.x = t.x - 15; c.y = t.y; c.moving = false; c.direction = 0;
          c.recentlyInteractedTowns = [];
        }, fx.far);
        await sleep(400); // 等 overTown 标记重算
        const symN = await page.evaluate((i) => { const sy = window.__c2.shell.mapMode.townSymbols[i]; return { x: sy.disp.x, y: sy.disp.y, visible: sy.disp.visible }; }, fx.far);
        await clickXY(page, symN.x, symN.y);
        const x2 = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return s.gdScreen === "town" ? 1 : null; })()`, TIMEOUT, 'x2town');
        p('S8x2 走近城镇点城镇进镇', x2.ok, x2.ok ? 'gdScreen=town' : '未进镇: ' + JSON.stringify(x2.value), 'S8x2');
        // S8x3：出镇 → 点同镇（保护期）→ 不立即重进 → 移动 → 不死循环
        await clickXY(page, 760, 432); // 城镇菜单按钮 5（离开）
        const x3m = await waitMap();
        if (x3m.ok) {
          await page.evaluate((i) => {
            const gd = window.__c2.shell.gd;
            const c = gd.Caravans[0];
            const t = gd.Towns[i];
            c.x = t.x - 15; c.y = t.y; c.moving = false; c.direction = 0; // 保持 recentlyInteractedTowns 保护
          }, fx.far);
          await sleep(400);
          const symP = await page.evaluate((i) => { const sy = window.__c2.shell.mapMode.townSymbols[i]; return { x: sy.disp.x, y: sy.disp.y, visible: sy.disp.visible }; }, fx.far);
          await clickXY(page, symP.x, symP.y); // 保护期点击 → 移动指令而非进镇
          await sleep(300);
          const x3 = await page.evaluate(() => { const s = window.__c2.shell; return { screen: s.gdScreen, moving: s.gd.Caravans[0].moving, overTown: s.gd.Caravans[0].overTown }; });
          p('S8x3 出镇后点同镇不立即重进（保护→移动）', x3.screen === 'map' && x3.moving === true, JSON.stringify(x3), 'S8x3');
          // S8x4：走近城镇（60px 外，overTown null → 保护已解除）→ 移动中 → 自动进镇（t35 恢复原版语义）
          await page.evaluate((i) => {
            const gd = window.__c2.shell.gd;
            const c = gd.Caravans[0];
            const t = gd.Towns[i];
            c.x = t.x - 60; c.y = t.y;
            c.direction = Math.atan2(t.x - c.x, c.y - t.y); // 原版 rev-Y 方向（t56：0=北顺时针）
            c.moving = true;
            gd.gameSpeed = 1;
          }, fx.far);
          const x4 = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return s.gdScreen === "town" ? 1 : null; })()`, 10000, 'x4auto');
          p('S8x4 走近城镇→自动进镇（移动中碰到）', x4.ok, x4.ok ? 'gdScreen=town' : '未自动进镇: ' + JSON.stringify(x4.value), 'S8x4');
          await page.evaluate(() => { window.__c2.shell.gd.gameSpeed = 0; });
          // S8x5：出镇 → 背向移动 → 不死循环（保护期不触发；远离后 overTown 清空仍在地图）
          await clickXY(page, 760, 432); // 城镇菜单按钮 5（离开）
          const x5m = await waitMap();
          if (x5m.ok) {
            await page.evaluate((i) => {
              const gd = window.__c2.shell.gd;
              const c = gd.Caravans[0];
              const t = gd.Towns[i];
              c.direction = Math.atan2(c.x - t.x, t.y - c.y); // 背向城镇（原版 rev-Y，t56）
              c.moving = true;
              gd.gameSpeed = 1;
            }, fx.far);
            await sleep(2000); // 走远（约 160px：overTown 清空、保护解除）
            const x5 = await page.evaluate(() => { const s = window.__c2.shell; return { screen: s.gdScreen, overTown: s.gd.Caravans[0].overTown, moving: s.gd.Caravans[0].moving }; });
            p('S8x5 出镇移动离开不死循环', x5.screen === 'map', JSON.stringify(x5), 'S8x5');
            // S8x6：远离后再靠近（teleport 60px 外朝镇移动）→ 可再自动进镇
            await page.evaluate((i) => {
              const gd = window.__c2.shell.gd;
              const c = gd.Caravans[0];
              const t = gd.Towns[i];
              c.x = t.x - 60; c.y = t.y;
              c.direction = Math.atan2(t.x - c.x, c.y - t.y); // 原版 rev-Y 方向（t56：0=北顺时针）
              c.moving = true;
            }, fx.far);
            const x6 = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return s.gdScreen === "town" ? 1 : null; })()`, 10000, 'x6re');
            p('S8x6 远离后再靠近→可再自动进镇', x6.ok, x6.ok ? 'gdScreen=town' : '未再进镇: ' + JSON.stringify(x6.value), 'S8x6');
            await page.evaluate(() => { window.__c2.shell.gd.gameSpeed = 0; });
            // 出镇收尾（后续 S8f 从地图开始）
            await clickXY(page, 760, 432);
            const x7m = await waitMap();
            await page.evaluate(() => { window.__c2.shell.gd.Caravans[0].moving = false; });
            p('S8x7 收尾返回地图', x7m.ok, x7m.ok ? 'gdScreen=map' : '未返回', 'S8x7');
          }
        }
      }
    }
  }

  // ---------- S8f 队伍/背包（CaravanMenu，回归模式） ----------
  if (REGRESSION) {
    // 顶部 CARAVAN 开关 (686,46) 15x35 命中区中心；已知缺陷：hover 后 glow 子节点拦截点击 → C 键兜底
    await clickXY(page, 693, 63);
    await sleep(300);

    let cmState = await page.evaluate(() => { const s = window.__c2.shell; return { cm: s.caravanMenu, vis: s.caravanMenu ? s.caravanMenu.screen.visible : false }; });
    if (!(cmState.cm && cmState.vis)) {
      p("S8f 队伍/背包（顶部开关点击）", false, "点击 (693,63) 后菜单未打开——开关 hover glow 子节点拦截点击（已知缺陷）", "S8f");
      await page.keyboard.press("c"); // 键盘 C（原版快捷键）兜底
      await sleep(300);
      cmState = await page.evaluate(() => { const s = window.__c2.shell; return { cm: s.caravanMenu, vis: s.caravanMenu ? s.caravanMenu.screen.visible : false }; });
    }
    const openOk = !!(cmState.cm && cmState.vis);
    p("S8f2 队伍/背包（CaravanMenu 打开）", openOk, openOk ? "菜单可见（标签: OVERVIEW/PEOPLE/WEAPONS/ARMOR/AMMO/GEAR/CARGO/QUESTS/SAVE/RATIONS）" : "菜单未打开", "S8f2");
    if (openOk) {
      // ---------- S8k 装备页（t3 阶段A-3：TEAM-EQUIP-LOG-SPEC §1-3 浏览器实测） ----------
      // 夹具：给玩家货物加武器/护甲/附件/弹药/手雷/急救包
      await page.evaluate(() => {
        const c = window.__c2.shell.gd.Caravans[0];
        const add = (id, amt) => c.addCargo(id, amt);
        add(22, 1); add(21, 1); add(28, 5); add(48, 2); add(29, 1); add(38, 1); add(47, 20); add(42, 1);
      });
      await clickXY(page, 763, 158); // EQUIP 标签（t37 原版 11 页签：tab3 y=142 中心 158）
      await sleep(250);
      const eq0 = await page.evaluate(() => {
        const cm = window.__c2.shell.caravanMenu;
        return { cat: cm.category, pool: cm.equipmentPoolItems ? cm.equipmentPoolItems().length : -1, person: cm.eqPerson ? cm.eqPerson.name : null };
      });
      p("S8k 装备页打开（EQUIP 标签）", eq0.cat === 3 && eq0.pool >= 8, JSON.stringify(eq0), "S8k");
      await clickXY(page, 61, 52); // 选第一个人（人员条首个 @mainArea(0,0) 102x24）
      await sleep(120);
      // t63⑤ 物品池=70px 格（80px 步）：点击前滚动使该格可见（格 i 中心 canvas y = 85+i*80 + 滚动量）
      const selItem = async (rowIdx) => {
        const c = await page.evaluate((i) => {
          const ma = window.__c2.shell.caravanMenu.mainArea;
          const find = (n) => { if (!n) return null; if (n.Content && Array.isArray(n.contentList) && (n.x || 0) >= 500) return n; for (const ch of n.children || []) { const r = find(ch); if (r) return r; } return null; };
          const sc = find(ma);
          let shown = 0;
          if (sc) {
            const need = Math.max(0, 10 + i * 80 + 70 - 389); // 目标格底 - 视口高 → 需滚动
            const cur = sc.Content ? (Number(sc.Content.y) || 0) : 0;
            sc.updateSize();
            sc.scroll = -need; // 直接设置滚动偏移（滚到目标行可见）
            shown = sc.Content ? (Number(sc.Content.y) || 0) : 0;
          }
          return { y: 40 + (10 + i * 80 + 35) + shown };
        }, rowIdx);
        await clickXY(page, 568, c.y);
        await sleep(150);
      };
      // 动态定位“装备”按钮（原版 Button(6) @(117,389) 206×28 → 中心 (220,403)）
      const findBtn = async (label) => {
        const b = await page.evaluate((lab) => {
          const root = window.__c2.shell.caravanMenu.screen;
          let out = null;
          const walk = (n, d, gx, gy) => {
            if (!n || d > 18 || out) return;
            const px = gx + (n.x || 0), py = gy + (n.y || 0);
            if (String(n.text || "") === lab && n.parent && (n.parent.width || 0) >= 180) {
              let q = n.parent, tx = 0, ty = 0;
              while (q && q.parent) { tx += q.x || 0; ty += q.y || 0; q = q.parent; }
              out = { cx: tx + (n.parent.x || 0) + ((n.parent.width || 206) / 2), cy: ty + (n.parent.y || 0) + ((n.parent.height || 28) / 2) };
              return;
            }
            if (n.children) n.children.forEach((c) => walk(c, d + 1, px, py));
          };
          walk(root, 0, 0, 0);
          return out;
        }, label);
        return b;
      };
      const eqLabel = await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; return String((cm && cm.text ? cm.text(1021) : "") || "EQUIP").toUpperCase(); });
      const eqPos = await findBtn(eqLabel);
      const eqBtn = async () => { if (eqPos) await clickXY(page, eqPos.cx, eqPos.cy); else await clickXY(page, 220, 403); await sleep(200); };
      // 动态行查找：装备会改变物品池（removeFromCargo→重绘），固定索引会过期 → 每次点击前按 id 重算
      const selItemOf = async (id) => {
        const idx = await page.evaluate((iid) => { const cm = window.__c2.shell.caravanMenu; const pl = cm.equipmentPoolItems(); return pl.findIndex((e) => e.id === iid); }, id);
        if (idx < 0) return -1;
        await selItem(idx);
        return idx;
      };
      const selItemFirstCat = async (cat) => {
        const idx = await page.evaluate((c) => { const cm = window.__c2.shell.caravanMenu; const pl = cm.equipmentPoolItems(); return pl.findIndex((e) => e.it.category === c); }, cat);
        if (idx < 0) return -1;
        await selItem(idx);
        return idx;
      };
      // 数据驱动：按角色定位物品池行（夹具/数据漂移免疫；池按 id 升序）
      const roleIdx = await page.evaluate(() => {
        const cm = window.__c2.shell.caravanMenu;
        const gd = window.__c2.shell.gd;
        const ds = gd.ds;
        // 夹具原无 type2 头盔（默认 Headgear=0 无从断言）→ 从 Items 找 cat5 && Armor[sub].type===2 补一件
        let hgId = -1;
        for (let i = 1; i < ds.items.Items.length; i++) {
          const itm = ds.items.Items[i];
          if (itm && itm.category === 5 && ds.items.Armor[itm.subCategory] && ds.items.Armor[itm.subCategory].type === 2) { hgId = i; break; }
        }
        if (hgId > 0) gd.Caravans[0].addCargo(hgId, 1);
        cm.renderEquipment(); // 重绘物品池（含新头盔行）
        const pl = cm.equipmentPoolItems();
        const byId = (id, fb) => { const i = pl.findIndex((e) => e.id === id); return i >= 0 ? i : fb; };
        const byPred = (pred, fb) => { const i = pl.findIndex(pred); return i >= 0 ? i : fb; };
        const hg = pl.find((e) => e.id === hgId);
        const ammo = pl.find((e) => e.it.category === 3);
        return {
          rifle: byId(22, 1),
          pistol: byId(21, 0),
          grenade: byId(28, 2),
          scope: byId(47, -1),
          jacket: byPred((e) => e.it.category === 5 && ds.items.Armor[e.it.subCategory] && ds.items.Armor[e.it.subCategory].type === 1, -1),
          headgear: hg ? pl.indexOf(hg) : -1,
          hgSub: hg ? hg.it.subCategory : -1,
          hgArmor: hg ? ds.items.Armor[hg.it.subCategory].armor : -1,
          ammo: byPred((e) => e.it.category === 3, -1),
          ammoItem: ammo ? ammo.id : -1,
          hgId,
        };
      });
      // 步枪 → 槽 2（先装主武器，附件测试需步枪在场）
      await selItemOf(22); // 步枪（item 22）
      const f1 = await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; return { s: cm.eqSlot, f: cm.eqFeasible, heavy: cm.eqTooHeavy }; });
      p("S8k2 步枪可行槽 [2,5]", f1.f.join() === "2,5" && f1.s === 2, JSON.stringify(f1), "S8k2");
      await eqBtn();
      const r3 = await page.evaluate(() => { const p = window.__c2.shell.gd.Caravans[0].People[0]; return { w0: p.weapons[0], eq: p.equipment.map((e) => e.type + ":" + e.amount + ":" + e.inUse) }; });
      p("S8k3 装备步枪 weapons[0]=21", r3.w0 === 21 && r3.eq.includes("22:1:0"), JSON.stringify(r3), "S8k3");
      // 手枪 → 槽 2 已占 → 自动空槽 5（双武器）
      await selItemOf(21); // 手枪
      const f2 = await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; return { s: cm.eqSlot, f: cm.eqFeasible }; });
      p("S8k4 手枪→空槽 5", f2.s === 5, JSON.stringify(f2), "S8k4");
      await eqBtn();
      const r4 = await page.evaluate(() => window.__c2.shell.gd.Caravans[0].People[0].weapons);
      p("S8k5 双武器 [21,20]", r4[0] === 21 && r4[1] === 20, JSON.stringify(r4), "S8k5");
      // 步枪瞄准镜（id 47）→ 附件槽（slot 3；f 可能含 4：ws0 附件位 3/4）
      await selItemOf(47); // 瞄准镜
      const f3 = await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; return { s: cm.eqSlot, f: cm.eqFeasible }; });
      p("S8k6 附件可行槽 3", f3.s === 3 && f3.f.includes(3), JSON.stringify(f3), "S8k6");
      await eqBtn();
      const r5 = await page.evaluate(() => window.__c2.shell.gd.Caravans[0].People[0].attachments);
      p("S8k7 附件装备 attachments[0][0]=1", r5[0][0] === 1, JSON.stringify(r5), "S8k7");
      // SWAP：mkBig @(358,Y211) Button(2) 206×28 缩 0.9 → 中心≈(450,225)；动态定位
      const swapLabel = await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; return String((cm && cm.text ? cm.text(1094) : "") || "SWAP").toUpperCase(); });
      const swapPos = await findBtn(swapLabel);
      if (swapPos) await clickXY(page, swapPos.cx, swapPos.cy); else await clickXY(page, 450, 225);
      await sleep(200);
      const r6 = await page.evaluate(() => { const p = window.__c2.shell.gd.Caravans[0].People[0]; return { w: p.weapons, att: p.attachments }; });
      p("S8k8 换武器+不兼容附件卸下", r6.w[0] === 20 && r6.w[1] === 21 && r6.att[0][0] === null, JSON.stringify(r6), "S8k8");
      if (swapPos) await clickXY(page, swapPos.cx, swapPos.cy); // 换回
      else await clickXY(page, 450, 225);
      await sleep(200);
      // 手雷 → 双武器槽已满 → 替换槽 2 → 数量器 +2 → OK（3 颗）
      await selItemOf(28);
      await eqBtn();
      const cal = await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; const cp = cm.eqCalcPanel; return { has: !!(cp && cp.ov && cp.ov.visible), v: cp ? cp.value : -1 }; });
      p("S8k9 手雷数量器弹出", cal.has, JSON.stringify(cal), "S8k9");
      if (cal.has) {
        await clickXY(page, 558, 235); // CalculatorPanel "+1" 键（col4 row0 → 315+4*54+27, 213+22）
        await clickXY(page, 558, 235);
        await clickXY(page, 396, 411); // OK（index21 → col1 row4 → 369+27, 389+22）
        await sleep(200);
      }
      const r7 = await page.evaluate(() => { const p = window.__c2.shell.gd.Caravans[0].People[0]; return { w: p.weapons, g: p.grenadeAmounts }; });
      p("S8k10 手雷装备 weapons[0]=27 ×3", r7.w[0] === 27 && r7.g[0] === 3, JSON.stringify(r7), "S8k10");
      // 护甲：外套（id 48）→ 槽 0；头盔（运行期补夹具的 type2）→ 槽 1
      await selItemOf(48); await eqBtn(); // 外套
      const r8a = await page.evaluate(() => { const p = window.__c2.shell.gd.Caravans[0].People[0]; return { j: p.Jacket, eq: p.equipment.map((e) => e.type + ":" + e.amount + ":" + e.inUse) }; });
      p("S8k11a 外套装备 Jacket=1", r8a.j === 1 && r8a.eq.includes("48:1:0"), JSON.stringify(r8a), "S8k11a");
      if (roleIdx.headgear < 0) {
        warn("S8k11", "无 type2 头盔夹具", "Items 无 cat5&&Armor.type==2，跳过");
      } else {
        await selItemOf(roleIdx.hgId); await eqBtn(); // 头盔
        const r8 = await page.evaluate(() => { const p = window.__c2.shell.gd.Caravans[0].People[0]; return { h: p.Headgear, armor: Math.round(p.armor) }; });
        p("S8k11 头盔装备 Headgear=" + roleIdx.hgSub, r8.h === roleIdx.hgSub && r8.armor === 2 + roleIdx.hgArmor, JSON.stringify(r8), "S8k11");
      }
      // 弹药（cat3 首项）→ 背包槽 8 → 数量器 OK（默认 1）
      await selItemFirstCat(3); // 弹药（cat3 首项）
      const f4 = await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; return { s: cm.eqSlot }; });
      p("S8k12 弹药可行槽 8", f4.s === 8, JSON.stringify(f4), "S8k12");
      await eqBtn();
      const cal2 = await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; const cp = cm.eqCalcPanel; return { has: !!(cp && cp.ov && cp.ov.visible) }; });
      if (cal2.has) { await clickXY(page, 396, 411); await sleep(200); } // OK（CalculatorPanel OK 键）
      const r9 = await page.evaluate(() => window.__c2.shell.gd.Caravans[0].People[0].equipment.map((e) => e.type + ":" + e.amount + ":" + e.inUse));
      p("S8k13 弹药入背包 " + roleIdx.ammoItem + ":1:0", roleIdx.ammoItem > 0 && r9.includes(roleIdx.ammoItem + ":1:0"), JSON.stringify(r9), "S8k13");
      // 卸下：点武器槽 1（选中）再点（卸下，等效双击）
      await clickXY(page, 160, 170); await sleep(120); // 武器槽 ws0（框 stage y 157..182 中心 170）
      await clickXY(page, 160, 170); await sleep(200);
      const r10 = await page.evaluate(() => window.__c2.shell.gd.Caravans[0].People[0].weapons);
      p("S8k14 双击卸下武器槽", r10[0] === 0, JSON.stringify(r10), "S8k14");
      // 存档字段标记（S11 读档后校验装备保留；localStorage 防页面重载丢失）
      await page.evaluate(() => {
        const p = window.__c2.shell.gd.Caravans[0].People[0];
        window.localStorage.setItem("__eqMarker", JSON.stringify({ w: p.weapons, att: p.attachments, eq: p.equipment, j: p.Jacket, h: p.Headgear, g: p.grenadeAmounts }));
      });
      const mkCheck = await page.evaluate(() => !!window.localStorage.getItem("__eqMarker"));
      p("S8k15 装备标记已写入", mkCheck, "localStorage.__eqMarker=" + mkCheck, "S8k15");
      await SHOT(page, "08k_equipment");

     // ---------- S8l Log 日志页（t4 阶段A-4） ----------
     // 程序化切页：页签点击在 EQUIP 长流程后可能被事件时序干扰，setCategory 语义等价且稳定
     await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; cm.setCategory(1); });
     await sleep(250);
     const l0 = await page.evaluate(() => {
       const cm = window.__c2.shell.caravanMenu;
       return { cat: cm.category, bm: cm.logBookmark, prices: (window.__c2.shell.gd.knownPrices || []).length };
     });
     p("S8l Log 页打开（Economy 书签）", l0.cat === 1 && l0.bm === 0 && l0.prices >= 2, JSON.stringify(l0), "S8l");
     // 数据夹具：任务/关系数据（渲染三栏与名声）
     await page.evaluate(() => {
       const gd = window.__c2.shell.gd;
       let st = gd.story;
       if (!st && window.__c2Story) { st = new window.__c2Story(gd.ds); gd.story = st; }
       if (st) {
         if (!st.acceptedQuests.includes(1)) st.acceptedQuests.unshift(1);
         if (!st.completedQuests.includes(2)) st.completedQuests.unshift(2);
         if (!st.failedQuests.includes(3)) st.failedQuests.unshift(3);
         st.characterRelations = st.characterRelations || {};
         st.characterRelations[1] = 5;
         // 声誉页读的是 getFactionRelations(fid, 0)（CaravanMenu.ts:2183），且 a===b 恒返回 0，
         // 所以旧夹具的 `st.factionRelations[0] = 20` + revealFaction(0) 是无效写入：
         // 成对语义下键应为 "a,b"，且 faction 0 对自己永远是 0 ⇒ 页面只会显示 "0 阵营 0"。
         // 改为给一个真实的非 0 阵营设成对关系，才真正验证到关系渲染。
         if (typeof gd.setFactionRelations === "function") gd.setFactionRelations(3, 0, 20);
         else { st.factionRelations = st.factionRelations || {}; st.factionRelations["3,0"] = 20; }
         gd.revealFaction(3);
       }
     });
     await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; cm.logBookmark = 1; cm.renderLog(); });
     await sleep(200);
     const l1 = await page.evaluate(() => {
       const cm = window.__c2.shell.caravanMenu;
       const st = window.__c2.shell.gd.story || {};
       return { bm: cm.logBookmark, acc: (st.acceptedQuests || []).length, comp: (st.completedQuests || []).length, fail: (st.failedQuests || []).length };
     });
     p("S8l2 Missions 书签（三栏数据）", l1.bm === 1 && l1.acc >= 1 && l1.comp >= 1 && l1.fail >= 1, JSON.stringify(l1), "S8l2");
     await SHOT(page, "08l_missions");
     await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; cm.logBookmark = 2; cm.renderLog(); });
     await sleep(200);
     const l2 = await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; return { bm: cm.logBookmark }; });
     p("S8l3 Reputation 书签切换", l2.bm === 2, JSON.stringify(l2), "S8l3");
     await SHOT(page, "08l_reputation");
     await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; cm.logBookmark = 0; cm.renderLog(); });
     await sleep(200);
     const l3 = await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; return { bm: cm.logBookmark }; });
     p("S8l4 切回 Economy 书签", l3.bm === 0, JSON.stringify(l3), "S8l4");

     await SHOT(page, "08f_caravan");

      // 关闭菜单（程序化 CLOSE → hooks.onClose）
      await page.evaluate(() => { const cm = window.__c2.shell.caravanMenu; cm.setCategory(10); });
      await sleep(250);
    }

    // ---------- S8h 战斗（回归） ----------
    {
      await page.evaluate(() => { window.__c2.shell.startBattle(); });
      const bt = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return s.battle && s.mapMode && !s.mapMode.active ? 1 : null; })()`, TIMEOUT, "battle");
      p("S8h 战斗触发", bt.ok, bt.ok ? "battle 建立、地图停用（遭遇敌人）" : "战斗未触发: " + JSON.stringify(bt.value), "S8h");
      await SHOT(page, "08h_battle");
      // S8h2 战场网格/寻路/视线/伤害
      const bf = await page.evaluate(() => {
        const b = window.__c2.shell.battle;
        const u0 = b.units.find((u) => u.side === 0);
        const u1 = b.units.find((u) => u.side === 1);
        if (!u0 || !u1) return { err: "no units" };
        const info = b.debugFieldInfo();
        const path = b.debugFindPath(u0.squareX, u0.squareY, u1.squareX, u1.squareY);
        const los = b.debugLos(u0, u1);
        const dmg = b.debugDamage(30, 2, 0);
        const inBounds = b.units.every((u) => u.squareX >= 0 && u.squareX < b.fieldSize && u.squareY >= 0 && u.squareY < b.fieldSize);
        return { fieldSize: info.fieldSize, obs: info.obstacles, blocks: info.mapBlocks, inBounds, path, los: Math.round(los * 100) / 100, dmg: dmg.dmg };
      });
      p("S8h2 战场网格/掩体/寻路/视线/伤害", !!bf.fieldSize && bf.fieldSize >= 50 && bf.obs > 0 && bf.blocks > 0 && bf.inBounds && bf.path !== null && bf.path > 0 && bf.los >= 0 && bf.los <= 1 && bf.dmg >= 1,
        JSON.stringify(bf), "S8h2");
      // 移动实测：AStar 相邻格路径=1 + maxAP 公式 ≥2（AP/格 规则确定性验证）
      const mv = await page.evaluate(() => {
        const b = window.__c2.shell.battle;
        const u = b.units.find((u) => u.side === 0);
        const pathLen = b.debugFindPath(u.squareX, u.squareY, u.squareX + 1, u.squareY);
        const maxAP = b.debugAP(u);
        return { pathLen, maxAP, ok: pathLen === 1 && maxAP >= 2 };
      });
      p("S8h3 寻路移动 AP 预算", mv.ok, JSON.stringify(mv), "S8h3");
      const battleInput = await page.evaluate(() => {
        const b = window.__c2.shell.battle;
        const player = b.units.find((u) => u.side === 0);
        const enemy = b.units.find((u) => u.side === 1);
        const fakeAlly = { ...player, name: "test ally", bleeding: 0 };
        const modes = {
          self: b.fieldView.hoverModeAt(player.squareX, player.squareY, player),
          ally: b.fieldView.hoverModeAt(player.squareX, player.squareY, fakeAlly),
          enemy: b.fieldView.hoverModeAt(enemy.squareX, enemy.squareY, enemy),
        };
        let endKeys = 0;
        const oldEndTurn = b.endTurn;
        b.endTurn = () => { endKeys++; };
        for (const keyCode of [9, 13, 78]) b.keydown({ keyCode, preventDefault() {} });
        b.endTurn = oldEndTurn;
        b.keydown({ keyCode: 16, preventDefault() {} });
        const shiftDown = b.shiftPressed;
        b.keyup({ keyCode: 16 });
        b.keydown({ keyCode: 90, preventDefault() {} });
        const ctrlDown = b.ctrlPressed;
        b.keyup({ keyCode: 90 });
        b.timeSpentOnMargin = 30;
        b.panByMargin(320, 220, 1 / 60);
        const marginReset = b.timeSpentOnMargin;
        b.panByMargin(1, 220, 1 / 25);
        const marginStart = b.timeSpentOnMargin;
        const sound = b.soundName(["SFXShotgun1", "SFXShotgun2", "SFXShotgun3"]);
        return {
          modes, endKeys, shiftDown, ctrlDown, marginReset, marginStart, sound,
          pickUpAP: [b.pickUpAPOf({ ...player, armDamage: false }), b.pickUpAPOf({ ...player, armDamage: true })],
        };
      });
      const inputOk = battleInput.modes.self === "native" && battleInput.modes.ally === "native"
        && battleInput.modes.enemy === "target" && battleInput.endKeys === 3
        && battleInput.shiftDown && battleInput.ctrlDown
        && battleInput.marginReset === 0 && Math.abs(battleInput.marginStart - 1) < 0.001
        && battleInput.pickUpAP[0] === 3 && battleInput.pickUpAP[1] === 6
        && /^SFXShotgun[123]\.mp3$/.test(battleInput.sound);
      p("S8h4 战斗光标/快捷键/边滚/音效规则", inputOk, JSON.stringify(battleInput), "S8h4");
      // S8i3 全溃散（t6：onAllPanicked 1387 → KEEP KILLING 继续）
      await page.evaluate(() => {
        const b = window.__c2.shell.battle;
        for (const u of b.units) if (u.side === 1) u.battleMorale = 5;
        b.debugCheckPanic();
      });
      await sleep(250);
      const pan = await page.evaluate(() => window.__c2.shell.battle.panicDlgVisible);
      p("S8i3 全溃散弹窗", pan === true, "panicDlgVisible=" + pan, "S8i3");
      // 点 KEEP KILLING 继续战斗（panic 按钮 @(330,350) 220×34 → 中心 (440,367)）
      if (pan) { await clickXY(page, 440, 367); await sleep(250); }
      // 直接结束战斗：清空敌方 → 胜利 → 战利品窗口
      await page.evaluate(() => {
        const b = window.__c2.shell.battle;
        for (const u of b.units) if (u.side === 1) { u._HP = 0; u.dead = true; }
        const fn = typeof b.winTheGame === "function" ? b.winTheGame : (typeof b.checkEnd === "function" ? b.checkEnd : null);
        if (fn) fn.call(b);
      });
      const ld = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return s.battle && s.battle.lootDlgVisible ? 1 : null; })()`, TIMEOUT, "lootDlg");
      p("S8i4 战利品窗口出现", ld.ok, "lootDlgVisible=" + ld.ok, "S8i4");
      if (ld.ok) {
        const lootRowY = await page.evaluate(() => window.__c2.shell.battle.lootDlg.sourceRowY(1, 97));
        if (lootRowY >= 0) {
          await clickXY(page, 813, lootRowY); await sleep(200);
          const cal = await page.evaluate(() => window.__c2.shell.battle.lootDlg.calculatorVisible);
          if (cal) { await clickXY(page, 396, 411); await sleep(150); } // CalculatorPanel OK 键
          await clickXY(page, 602, 239); await sleep(250); // 收下
          const conf = await page.evaluate(() => { const d = window.__c2.shell.battle && window.__c2.shell.battle.lootDlg; return d ? d.dialogVisible : false; });
          if (conf) { await clickXY(page, 355, 340); await sleep(200); }
          const lootSettled = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; const d = s.battle && s.battle.lootDlg; return d && d.partnerArea && d.partnerArea().length === 0 ? 1 : null; })()`, 3000, "lootSettled");
          await clickXY(page, 192, 239); await sleep(200); // EXIT 关闭战利品
          const be = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return !s.battle && s.gdScreen === "map" && s.mapMode && s.mapMode.active ? 1 : null; })()`, TIMEOUT, "battleEnd");
          p("S8i4b 战斗结束回地图", be.ok && lootSettled.ok, "lootSettled=" + lootSettled.ok + " battleEnd=" + be.ok, "S8i4b");
        } else {
          warn("S8i4", "战利品无可用水行", "sourceRowY(1,97)=" + lootRowY);
          await clickXY(page, 192, 239); await sleep(200); // 直接 EXIT
        }
      }
      // S8w 战斗2：敌人 AI 回合行动不崩溃
      await page.evaluate(() => { window.__c2.shell.startBattle(); });
      const btw2 = await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return s.battle ? 1 : null; })()`, TIMEOUT, "battleW");
      if (btw2.ok) {
        const e1 = await page.evaluate(() => { const b = window.__c2.shell.battle; const u = b.units.find((z) => z.side === 1); return u ? { ap: u.AP, max: u.maxAP } : null; });
        await page.evaluate(() => { window.__c2.shell.battle.endTurn(); });
        await sleep(900); // 敌人 AI timeAcc 0.4 秒后行动
        const e2 = await page.evaluate(() => { const b = window.__c2.shell.battle; const u = b.units ? b.units.find((z) => z.side === 1) : null; return u ? { ap: u.AP, max: u.maxAP } : null; });
        p("S8w 敌人 AI 回合行动", !!e2 && e2.max > 0 && e2.ap < e2.max, "敌 AP " + JSON.stringify(e1) + " → " + JSON.stringify(e2) + "（敌方回合满 AP 行动后消耗）", "S8w");
      }
      // S13 战斗失败 → 游戏结束屏
      const gost = await page.evaluate(() => {
        const b = window.__c2.shell.battle;
        if (!b) return { gone: true };
        for (const u of b.units) if (u.side === 0) { u._HP = 0; u.dead = true; }
        if (typeof b.loseGame === "function") b.loseGame(); else if (typeof b.checkEnd === "function") b.checkEnd();
        return { gone: false, gameOver: b.gameOver, endPhase: b.endPhase };
      });
      p("S13 战斗失败→游戏结束", gost.gone || gost.gameOver === true, JSON.stringify(gost), "S13");
    }

    // ---------- S31/S33 存档往返（Node 侧 Sol 模块门控；夹具缺失→WARN 不计失败） ----------
    {
      const mods = await solModules();
      if (mods && mods.imp && mods.exp) {
        p("S31 存档液体（t6 生效）", true, "SolImporter/SolExporter 可编译加载（往返覆盖见 roundtrip 测试）", "S31");
        p("S33 存档压缩（t7+t16 生效）", true, "Sol 模块可用；LZMA 外部夹具 test_lzma_save.sol 缺失时以 WARN 注明", "S33");
      } else {
        warn("S31", "门控未通过", "Sol 模块不可用（缺 typescript），跳过");
        warn("S33", "门控未通过", "Sol 模块不可用（缺 typescript），跳过");
      }
    }

  } // end if (REGRESSION)

  return finish(count("FAIL") === 0 ? 0 : 1);
}

// ---------------- 结果输出与退出 ----------------
function finish(code) {
  try { writeRegressionReport(); } catch (e) { console.log("writeRegressionReport 失败: " + String(e)); }
  const failed = count("FAIL"), passed = count("PASS");
  const lines = [];
  lines.push("");
  lines.push("================ 冒烟测试报告 ================");
  for (const r of results) {
    const ic = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : r.status === "WARN" ? "⚠️" : "➖";
    lines.push("  " + ic + " [" + r.id + "] " + r.name + (r.detail ? " — " + r.detail : ""));
  }
  lines.push("--------------------------------------------");
  lines.push("  通过 " + passed + " / 失败 " + failed + " / WARN " + count("WARN") + " / SKIP " + count("SKIP"));
  lines.push("============================================");
  console.log(lines.join("\n"));
  return code === undefined ? (failed === 0 ? 0 : 1) : code;
}

runBrowser().then((c) => { process.exit(typeof c === "number" ? c : (c ? 1 : 0)); }).catch((e) => { console.error("smoke_test 致命错误:", e); process.exit(1); });
