// 校验文本墨迹位置（2026-09-13 改动）：
//  1) 世界地图日期翻牌 DAY/MONTH/YEAR 单条上移 2px（y=391），AMPM 保持 393
//  2) EngineText 的 verticalAlign="middle" 路径不再叠加 GLOBAL_TEXT_Y_OFFSET（战斗 HUD 全体）
//  3) 城镇设施 hover 文本框几何按原版 TownMode.as:1905/1917/1951
// 用法：node _check_ink.mjs（renderSelf 不含对象自身 x/y，下面统一换算成画布绝对坐标）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const root = 'D:/game/Caravaneer 2 deepseek/web';
const require = createRequire('file:///' + root + '/x.mjs');
const cache = new Map();
function load(file) {
  file = path.resolve(root, file); if (!path.extname(file)) file += '.ts';
  if (cache.has(file)) return cache.get(file).exports;
  const m = { exports: {} }; cache.set(file, m);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)((n) => n.startsWith('.') ? load(path.resolve(path.dirname(file), n)) : require(n), m, m.exports);
  return m.exports;
}
const calls = [];
const ASC = 11, DESC = 3;
const ctx = {
  font: '', save() {}, restore() {},
  fillText(t, x, y) { calls.push({ t, x, y }); },
  measureText(s) { return { width: String(s).length * 8, actualBoundingBoxAscent: ASC, actualBoundingBoxDescent: DESC }; },
};
globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
const { EngineText } = load('src/core/EngineText.ts');

console.log('--- A. 世界地图日期翻牌（原版墨迹顶≈395.2）---');
for (const [label, txt, size, y] of [['DAY/MONTH/YEAR 15px', '10', 15, 391], ['AMPM 12px', 'AM', 12, 393]]) {
  calls.length = 0;
  new EngineText(txt, 0x7c735b, size, 'center', 683.9, y, 22, 19).renderSelf(ctx);
  console.log('  ' + label.padEnd(22) + ' fieldTop=' + y + ' → 墨迹顶(绝对)=' + (y + calls[0].y).toFixed(1));
}

console.log('--- B. verticalAlign="middle"：墨迹中心应等于 cy（改动前会 +2）---');
for (const [label, size, cy, h] of [
  ['战斗按钮 RELOAD', 10, 477.5, 15],
  ['战斗名称 LoadedAmmo', 10, 192.5, 20],
  ['HP/M 框标签 7px', 7, 40, 10],
  ['滚轮数字 10px', 10, 5.5, 11],
  ['悬停移动浮字 12px', 12, 200, 8],
]) {
  calls.length = 0;
  const top = cy - h / 2;
  const t = new EngineText('M', 0xffffff, size, 'center', 0, top, 40, h);
  t.verticalAlign = 'middle';
  t.renderSelf(ctx);
  const center = top + calls[0].y - (ASC - DESC) / 2;
  console.log('  ' + label.padEnd(22) + ' cy=' + cy + ' → 墨迹中心=' + center.toFixed(1) + (Math.abs(center - cy) < 0.01 ? '  OK' : '  MISMATCH'));
}

console.log('--- C. 对照：top 基线路径仍叠加 +2（原版坐标照用）---');
calls.length = 0;
new EngineText('L', 0xffffff, 10, 'center', 0, 100, 40, 20).renderSelf(ctx);
console.log('  top 基线 10px fieldTop=100 → 基线(绝对)=' + (100 + calls[0].y).toFixed(1) + '（期望 100+dy1+2=103）');

console.log('--- D. 城镇 hover 文本框几何（原版：框宽 textWidth+30、高 30、左右各留 15）---');
const hover = new EngineText('', 3156000, 14, 'center', 10, 5, 200, 20);
hover.text = 'GENERAL STORE';
hover.width = hover.textWidth + 10;
calls.length = 0;
hover.renderSelf(ctx);
const left = 10 + calls[0].x, boxW = hover.textWidth + 30;
console.log('  文本宽=' + hover.textWidth + ' 字段宽=' + hover.width + ' 框宽=' + boxW + ' → 左右留白=' + left.toFixed(1) + ' / ' + (boxW - left - hover.textWidth).toFixed(1) + '（旧代码 8 / 2）');
