#!/usr/bin/env node
// 验证 t84：读档后世界地图 NPC 不再显示旧式橙色圆点(0xe8a020)+浅灰名(0xC8C8C8)。
// 方法：新游戏→地图（build() 已删旧循环）→校验全部 npcSprites 为新样式(rotPart/nameText/countText)；
// 再模拟读档重建：push 遭遇车+Rovers 后 gd.setMode(1) 重建 MapMode（=读档后 enterGdMode(1) 路径）
// → 惰性补建所有 NPC 精灵，断言仍无旧样式条目、无橙色 fill。
// 用法: node scripts/verify_load_npc_sprites.mjs [--url http://localhost:4173] [--shot]
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv.slice(2);
const URL_BASE = (arg[arg.indexOf("--url") + 1] || "http://localhost:4173").replace(/\/$/, "");
const WANT_SHOT = arg.includes("--shot");
const pw = (() => { for (const m of ["playwright-core", "playwright"]) { try { return require(m); } catch {} } return null; })();
if (!pw) { console.log("no playwright"); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(page, expr, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const v = await page.evaluate(expr); if (v) return v; } catch (e) {}
    await sleep(120);
  }
  return null;
}
async function launchBrowser() {
  for (const ch of ["msedge", "chrome", "msedge-beta"]) { try { return await pw.chromium.launch({ channel: ch, headless: true }); } catch {} }
  return pw.chromium.launch({ headless: true });
}
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
const fails = [];
const check = (name, ok, detail) => { console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : "")); if (!ok) fails.push(name); };

console.log("goto " + URL_BASE);
await page.goto(URL_BASE, { waitUntil: "load" });
if (!(await waitFor(page, "(() => !!(window.__c2 && window.__c2.shell))()"))) { console.log("boot fail"); process.exit(1); }
const clickXY = async (lx, ly) => {
  const b = await page.evaluate(() => { const c = document.getElementById("stage"); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
  await page.mouse.click(b.left + (lx / 880) * b.width, b.top + (ly / 495) * b.height);
};
await clickXY(140, 182); await sleep(600);
await clickXY(732, 474); await sleep(600);
await clickXY(547, 465); await sleep(600);
await clickXY(440, 465);
if (!(await waitFor(page, "(() => { const s = window.__c2.shell; return !!s && !!s.gd && !!s.mapMode && s.gdScreen === 'map'; })()"))) { console.log("map fail"); await browser.close(); process.exit(1); }
await sleep(1500); // 首帧惰性补建路线车队精灵

// A) 新游戏状态：所有精灵均为新样式
const a = await page.evaluate(() => {
  const mm = window.__c2.shell.mapMode;
  const gd = window.__c2.shell.gd;
  const ns = mm.npcSprites;
  const hasOrange = (sp) => {
    let bad = 0;
    const walk = (o) => {
      if (!o) return;
      const ops = (o.graphics && o.graphics.ops) || [];
      for (const op of ops) {
        const f = op && op.fill;
        if (f && (f.color === 0xe8a020 || f.color === 15204384)) bad++;
      }
      for (const ch of o.children || []) walk(ch);
    };
    walk(sp);
    return bad;
  };
  return {
    npcInGd: gd.npcCaravans.length,
    npcSprites: ns.length,
    allNewStyle: ns.length > 0 && ns.every((x) => !!x.rotPart && !!x.nameText && !!x.countText),
    orangeOps: ns.reduce((acc, x) => acc + hasOrange(x.sp), 0),
  };
});
check("A1 新游戏 npcSprites>0", a.npcSprites > 0, "sprites=" + a.npcSprites + " gd=" + a.npcInGd);
check("A2 全部条目为新样式(rotPart/nameText/countText)", a.allNewStyle);
check("A3 无 0xe8a020 橙色 fill", a.orangeOps === 0, "orangeOps=" + a.orangeOps);

// B) 模拟读档重建：npcCaravans 非空 + 遭遇车/Rovers → gd.setMode(1) 重建（=读档后 enterGdMode(1)）
await page.evaluate(() => {
  const gd = window.__c2.shell.gd;
  // 模拟真实读档的稳定状态：玩家停在空旷地（远离城镇、未移动、无最近交互/碉堡确认框）。
  // 否则重建后第一帧 update 会因「玩家站在镇内且 moving」自动进镇（gdScreen→town），
  // Shell.update 不再驱动 MapMode.update，惰性补建无从发生（诊断已验证）。
  const c = gd.Caravans[0];
  c.x = 0; c.y = 0; c.moving = false; c.overTown = null; c.recentlyInteractedTowns = [];
  const s = gd.story;
  if (s && typeof s.set === "function") s.set("enteredBunkerForTheFirstTime", true);
  const mm0 = window.__c2.shell.mapMode;
  if (mm0 && mm0.bunkerPrompt) mm0.bunkerPrompt.visible = false;
  // 遭遇车队（原版 spawnEncounterCaravan 形态：direction 来自玩家朝向、stateless 旧档标记）
  const enc = { id: 99991, type: 6, name: "Drekar 强盗", x: c.x + 120, y: c.y - 60, direction: Math.PI,
    category: 1, stateless: true, aggressive: true, faction: 6, defenders: 3, money: 5,
    squad: { people: [{}, {}, {}] }, speedKmh: 3.5, sightRange: 80, noticeability: 102,
    willAmbush: () => true, canTrade: () => false };
  // 流浪者（spawnFreeCaravan 形态）
  const free = { id: 99992, type: 5, name: "流浪者", x: c.x - 160, y: c.y + 90, direction: 0,
    category: 2, aggressive: false, faction: 6, defenders: 2, money: 5,
    people: [{}, {}], speedKmh: 4, sightRange: 60, noticeability: 150,
    willAmbush: () => false };
  gd.npcCaravans.push(enc, free);
  // 读档后重建地图（壳层 enterGdMode(1)）：旧 mapMode 被替换
  gd.setMode(0);
  gd.setMode(1);
  return true;
});
await sleep(2000);
const c2 = await page.evaluate(() => {
  const mm = window.__c2.shell.mapMode;
  const ns = mm.npcSprites;
  const hasOrange = (sp) => {
    let bad = 0;
    const walk = (o) => {
      if (!o) return;
      const ops = (o.graphics && o.graphics.ops) || [];
      for (const op of ops) {
        const f = op && op.fill;
        if (f && (f.color === 0xe8a020 || f.color === 15204384)) bad++;
      }
      for (const ch of o.children || []) walk(ch);
    };
    walk(sp);
    return bad;
  };
  return {
    mapModeRebuilt: !!mm,
    npcInGd: window.__c2.shell.gd.npcCaravans.length,
    npcSprites: ns.length,
    allNewStyle: ns.length > 0 && ns.every((x) => !!x.rotPart && !!x.nameText && !!x.countText),
    orangeOps: ns.reduce((acc, x) => acc + hasOrange(x.sp), 0),
    ids: ns.map((x) => x.id),
  };
});
check("B1 重建后地图存活 mapMode", c2.mapModeRebuilt);
check("B2 读档态 npcSprites 全覆盖", c2.npcInGd > 0 && c2.npcSprites === c2.npcInGd, "gd=" + c2.npcInGd + " sprites=" + c2.npcSprites);
check("B3 读档态全部新样式", c2.allNewStyle);
check("B4 读档态无橙色 fill", c2.orangeOps === 0, "orangeOps=" + c2.orangeOps);

if (WANT_SHOT && fails.length === 0) {
  fs.mkdirSync(path.join(__dirname, "shots"), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, "shots", "load_npc_sprites.png") });
  console.log("shot: web/scripts/shots/load_npc_sprites.png");
}
await browser.close();
console.log(fails.length === 0 ? "== ALL PASS ==" : "== FAILS: " + fails.join(", ") + " ==");
process.exit(fails.length === 0 ? 0 : 1);
