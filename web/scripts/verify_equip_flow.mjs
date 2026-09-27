#!/usr/bin/env node
// 验证：遭遇对话框 → 装备商旅 → 关闭车队目录 → 应回到遭遇对话框（原版 setMode(3,3)/setMode(0) 栈语义）
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv.slice(2);
const URL_BASE = (arg[arg.indexOf("--url") + 1] || "http://localhost:4173").replace(/\/$/, "");
const pw = (() => { for (const m of ["playwright-core", "playwright"]) { try { return require(m); } catch {} } return null; })();
if (!pw) { console.log("no playwright"); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(page, expr, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const v = await page.evaluate(expr); if (v) return v; } catch {}
    await sleep(120);
  }
  return null;
}
async function launchBrowser() {
  for (const ch of ["msedge", "chrome", "msedge-beta"]) {
    try { return await pw.chromium.launch({ channel: ch, headless: true }); } catch {}
  }
  return pw.chromium.launch({ headless: true });
}
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));
await page.goto(URL_BASE, { waitUntil: "load" });
if (!(await waitFor(page, `(() => !!(window.__c2 && window.__c2.shell))()`))) { console.log("boot fail"); process.exit(1); }
const clickXY = async (lx, ly) => {
  const b = await page.evaluate(() => { const c = document.getElementById("stage"); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
  await page.mouse.click(b.left + (lx / 880) * b.width, b.top + (ly / 495) * b.height);
};
await clickXY(140, 182); await sleep(600);
await clickXY(732, 474); await sleep(600);
await clickXY(547, 465); await sleep(600);
await clickXY(440, 465);
if (!(await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return !!s && !!s.gd && !!s.mapMode && s.gdScreen === "map"; })()`))) { console.log("map fail"); process.exit(1); }
await sleep(800);
await clickXY(437, 328); await sleep(800);
await clickXY(858, 16); await sleep(800);
await page.evaluate(() => { const sh = window.__c2.shell; if (sh.gdScreen === "town" && sh.townMode) sh.exitTown(); });
if (!(await waitFor(page, `(() => { const s = window.__c2 && window.__c2.shell; return s && s.gdScreen === "map"; })()`))) { console.log("exit town fail"); process.exit(1); }
await sleep(400);

// 夹具：敌对环境（aggressive type6）+ 玩家静止 + NPC 10px
await page.evaluate(() => {
  const gd = window.__c2.shell.gd;
  const c = gd.Caravans[0];
  let px = -9000, py = 3000;
  outer:
  for (let ty = -6000; ty <= 10000; ty += 2000) {
    for (let tx = -16000; tx <= 6000; tx += 2000) {
      if (!gd.Towns.some((t) => Math.hypot(t.x - tx, t.y - ty) < 600)) { px = tx; py = ty; break outer; }
    }
  }
  c.x = px; c.y = py; c.moving = false; c.direction = 0;
  for (const n of gd.npcCaravans) { n.x = 999999; n.y = 999999; }
  const npc = gd.spawnEncounterCaravan(6, c);
  npc.x = px + 10; npc.y = py;
  npc.moving = false;
  return { id: npc.id };
});
await sleep(1200);
const encOpen = await page.evaluate(() => {
  const s = window.__c2.shell;
  const m = s.encounterMenu;
  return { visible: !!(m && m.visible), bp: s.mapMode ? s.mapMode.battleInProgress : null, btns: m && m.buttons ? m.buttons.map((b) => b.label || b.text || "?") : [] };
});
console.log("encounter after contact:", JSON.stringify(encOpen));

// 点「装备商旅/caravan menu」（敌对 case2 索引 2）
const eq = await page.evaluate(() => {
  const m = window.__c2.shell.encounterMenu;
  if (!m || !m.buttons) return null;
  const b = m.buttons[2];
  // Button(1) 命中区固定 40×28（core/Ui.ts hitRect），w 在贴图未缓存时是 fallback 200 会点空
return b ? { x: Math.round(b.x + 20), y: Math.round(b.y + 14), gw: b.w, gh: b.h, gx: b.x, gy: b.y } : null;
});
console.log("equip btn geo:", JSON.stringify(eq));
if (!eq || eq.gw === 0) { console.log("no/zero-size caravan-menu button"); await browser.close(); process.exit(1); }
await clickXY(eq.x, eq.y);
await sleep(500);
const menuOpen = await page.evaluate(() => {
  const s = window.__c2.shell;
  return { cm: !!(s.caravanMenu && s.caravanMenu.screen.visible), encStill: !!(s.encounterMenu && s.encounterMenu.visible) };
});
console.log("after equip:", JSON.stringify(menuOpen));

// 关闭车队目录（CLOSE 页签 10 @ (763,468)）
await clickXY(763, 468);
await sleep(500);
const afterClose = await page.evaluate(() => {
  const s = window.__c2.shell;
  return { cm: !!(s.caravanMenu && s.caravanMenu.screen.visible), encBack: !!(s.encounterMenu && s.encounterMenu.visible), bp: s.mapMode ? s.mapMode.battleInProgress : null };
});
console.log("after closing menu:", JSON.stringify(afterClose));
const pass = menuOpen.cm === true && afterClose.cm === false && afterClose.encBack === true && afterClose.bp === true;
console.log(pass ? "PASS: 装备商旅关闭后回到遭遇对话框" : "FAIL");
await browser.close();
process.exit(pass ? 0 : 1);
