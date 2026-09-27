#!/usr/bin/env node
// 战斗 HUD 对照截图：真实浏览器进入战斗，给玩家角色配手枪/弹药/血量士气 AP，
// 截图 1) 常规 HUD；2) 悬停移动路径（白星+行动值浮字）；供与原版截图逐区域对比。
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.argv[2] ?? "http://localhost:5174";

const pwPath = [
  path.join(webRoot, "node_modules", "playwright-core"),
  path.join(webRoot, "node_modules", "playwright"),
].find((p) => fs.existsSync(p));
if (!pwPath) { console.log("NO_PLAYWRIGHT"); process.exit(2); }
const { chromium } = require(pwPath);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let previewProc = null;
try { previewProc = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "preview", "--port", "5174"], { cwd: webRoot, stdio: "ignore", shell: true }); } catch { /* already running? */ }
let previewUp = false;
for (let i = 0; i < 60 && !previewUp; i++) {
  try { const res = await fetch(BASE_URL); if (res.ok) previewUp = true; } catch { await sleep(250); }
}
if (!previewUp) { console.log("PREVIEW_FAIL"); process.exit(3); }
const OUT = path.resolve(webRoot, "..", "out");
fs.mkdirSync(OUT, { recursive: true });

async function stageBox(page) {
  return page.evaluate(() => {
    const c = document.getElementById("stage");
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}
async function clickXY(page, lx, ly) {
  const b = await stageBox(page);
  await page.mouse.click(b.left + (lx / 880) * b.width, b.top + (ly / 495) * b.height);
}
async function moveXY(page, lx, ly) {
  const b = await stageBox(page);
  await page.mouse.move(b.left + (lx / 880) * b.width, b.top + (ly / 495) * b.height);
}
async function waitFor(page, expr, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const v = await page.evaluate(expr); if (v) return true; } catch { /* ignore */ }
    await sleep(120);
  }
  return false;
}

let browser = null;
for (const ch of ["msedge", "chrome", "msedge-beta", "msedge-dev"]) {
  try { browser = await chromium.launch({ channel: ch }); break; } catch { /* next */ }
}
if (!browser) browser = await chromium.launch({});

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push("pageerror: " + String(e).slice(0, 400)));
  await page.addInitScript(() => {
    window.addEventListener("error", (ev) => { try { window.__bpErrors = window.__bpErrors || []; window.__bpErrors.push(String(ev.message).slice(0, 300)); } catch {} });
  });
  await page.goto(BASE_URL, { waitUntil: "load" });
  if (!(await waitFor(page, `(() => !!(window.__c2 && window.__c2.shell))()`))) throw new Error("boot fail");
  await clickXY(page, 140, 182); // 新游戏
  await waitFor(page, `(() => window.__c2.shell.screenNum === 6)()`, 10000);
  await clickXY(page, 732, 474); // 角色创建完成
  await waitFor(page, `(() => window.__c2.shell.screenNum === 7)()`, 10000);
  await clickXY(page, 547, 465); // 设置开始
  await waitFor(page, `(() => window.__c2.shell.screenNum === 8)()`, 10000);
  await sleep(1500);
  await clickXY(page, 440, 465); // 叙事 → 地图
  let map = await waitFor(page, `(() => (window.__c2.shell.gdScreen === "map" && !!window.__c2.shell.mapMode && window.__c2.shell.mapMode.active))()`, 20000);
  if (!map) { await sleep(1000); await clickXY(page, 440, 465); map = await waitFor(page, `(() => (window.__c2.shell.gdScreen === "map" && !!window.__c2.shell.mapMode && window.__c2.shell.mapMode.active))()`, 20000); }
  if (!map) throw new Error("map fail");

  for (let attempt = 0; attempt < 3 && !(await page.evaluate(() => !!window.__c2.shell.battle)); attempt++) {
    await page.evaluate(() => window.__c2.shell.startBattle());
    await waitFor(page, `(() => !!window.__c2.shell.battle)()`, 8000);
    await sleep(600);
  }
  if (!(await page.evaluate(() => !!window.__c2.shell.battle))) throw new Error("battle fail");

  // 等 primeBattleAssets 完成（背景图/按钮/图标全部就绪后 HUD 重建）
  await sleep(4200);

  // 摆布：玩家手枪 + 装弹 8/备弹 22 + HP88 士气69 AP8；敌人放远；确保玩家回合
  const setup = await page.evaluate(() => {
    const b = window.__c2.shell.battle;
    const me = b.units.find((u) => u.side === 0 && !u.dead);
    if (!me) return { err: "no player unit" };
    const ds = b.ds;
    let pistol = 0, ammo = 0;
    for (let i = 1; i < ds.items.Items.length; i++) {
      const it = ds.items.Items[i];
      if (!it) continue;
      if (!pistol && it.category === 2 && it.subCategory === 20) pistol = i;
      if (!ammo && it.category === 3 && ds.weapons.Ammo?.[it.subCategory]?.type === 1) ammo = i;
    }
    me.weaponItems = [pistol, 0];
    me.weaponSlot = 0;
    me.weaponItem = pistol;
    me.weaponSub = 20;
    me.loadedAmmo = [{ type: ammo, amount: 0 }, null];
    me.selectedAmmo = [{ type: ammo, amount: 0 }, null];
    if (me.character && Array.isArray(me.character.equipment)) {
      const eq = me.character.equipment.filter((e) => !(e && e.type === ammo));
      eq.push({ type: ammo, amount: 30, inUse: 0 });
      me.character.equipment = eq;
    }
    me.baseAccuracy = 20; me.baseAgility = 20;
    b.doReload(me, true); // 装 8 发，剩 22
    me._HP = 88; me.maxHP = 100;
    me.battleMorale = 69;
    me.AP = 8; me.maxAP = 20;
    // 摆位：玩家左上(2,2)，敌人放远右侧
    me.squareX = 2; me.squareY = 2;
    me.x = 2.5 * 32; me.y = 2.5 * 32;
    for (const u of b.units) {
      if (u.side === 1 && !u.dead) {
        if (u.squareX < 8) { u.squareX = b.fieldSize - 3; u.squareY = Math.min(b.fieldSize - 3, 6); }
        u.x = (u.squareX + 0.5) * 32; u.y = (u.squareY + 0.5) * 32;
      }
    }
    // 确保轮到玩家
    let guard = 0;
    while ((b.phase !== "player" || b.order[b.turnIdx] !== me) && guard++ < 12) b.endTurn();
    b.focus(me);
    b.clampCam();
    b.redrawField();
    b.refreshInfo();
    return { ok: true, me: { gx: me.squareX, gy: me.squareY, ap: me.AP, hp: me._HP, mor: me.battleMorale }, size: b.fieldSize };
  });
  console.log("setup", JSON.stringify(setup));
  if (setup.err) throw new Error(setup.err);
  await sleep(700);

  const stageEl = page.locator("#stage");
  const btnState = await page.evaluate(() => {
    const b = window.__c2.shell.battle;
    const h = b.hud;
    const btn = h.nextTurnBtn;
    const bo = btn?.up?.children[0] ?? null;
    return {
      rootInScreen: h.root.parent === b.screen,
      rootVisible: h.root.visible,
      btnVisible: btn?.visible,
      upVisible: btn?.up?.visible,
      imgComplete: bo?.image ? (bo.image.complete && bo.image.naturalWidth) : null,
      srcRect: bo?.srcRect ?? null,
    };
  });
  console.log("btnState", JSON.stringify(btnState));
  await stageEl.screenshot({ path: path.join(OUT, "battle_hud_compare_1.png") });

  // 悬停一个可达格 → 白色路径 + 星标 + 行动值浮字
  const hover = await page.evaluate(() => {
    const b = window.__c2.shell.battle;
    const me = b.order[b.turnIdx];
    const cost = me.legDamage ? 2 : 1;
    const budget = Math.floor(me.AP / cost);
    let best = null;
    for (let dx = -6; dx <= 6 && !best; dx++) {
      for (let dy = -6; dy <= 6 && !best; dy++) {
        if (dx === 0 && dy === 0) continue;
        const gx = me.squareX + dx, gy = me.squareY + dy;
        if (gx < 1 || gy < 1 || gx >= b.fieldSize - 1 || gy >= b.fieldSize - 1) continue;
        if (b.map[gy * b.fieldSize + gx]) continue;
        if (b.units.some((u) => !u.dead && u.squareX === gx && u.squareY === gy)) continue;
        const p = b.aStar(me.squareX, me.squareY, gx, gy, 60);
        if (!p || p.length < 4 || p.length > budget) continue;
        best = { gx, gy };
      }
    }
    if (!best) return { err: "no hover cell" };
    const XR = Math.sin(Math.PI / 4), YR = Math.cos(Math.PI / 4) * 0.574;
    const wx = (best.gx + 0.5) * 32, wy = (best.gy + 0.5) * 32;
    const sx = XR * (wx - b.camX) - XR * (wy - b.camY) + 400;
    const sy = YR * (wx - b.camX) + YR * (wy - b.camY) + 300;
    return { ok: true, sx, sy, pathLen: b.aStar(me.squareX, me.squareY, best.gx, best.gy, 60).length };
  });
  console.log("hover", JSON.stringify(hover));
  if (hover.ok) {
    await moveXY(page, hover.sx, hover.sy);
    await sleep(900);
    await stageEl.screenshot({ path: path.join(OUT, "battle_hud_compare_2.png") });
  }

  console.log("ERRORS:", pageErrors.length ? pageErrors.join(" | ") : "none");
} finally {
  try { await browser.close(); } catch { /* noop */ }
  try { if (previewProc) previewProc.kill(); } catch { /* noop */ }
}
console.log("OUT:", OUT);
