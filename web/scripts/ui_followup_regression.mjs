// Minimal, in-memory regression. No browser, network, saves or full world simulation.
// Run: node scripts/ui_followup_regression.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url), modules = new Map();
const read = file => fs.readFileSync(path.resolve(web, file), 'utf8');
function load(file) {
  file = path.resolve(web, file); if (!path.extname(file)) file += '.ts';
  if (modules.has(file)) return modules.get(file).exports;
  const module = {exports: {}}; modules.set(file, module);
  const js = ts.transpileModule(read(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  new Function('require', 'module', 'exports', js)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name), module, module.exports);
  return module.exports;
}
const measure = {measureText: text => ({width: String(text).length * 8})};
globalThis.document = {createElement: () => ({getContext: () => measure}), fonts: {ready: Promise.resolve()}};
const {HealingFacility} = load('src/game/HealingFacility.ts');
const {TradeWindow} = load('src/game/TradeWindow.ts');
const {CaravanMenu} = load('src/game/CaravanMenu.ts');
const {MapMode} = load('src/game/MapMode.ts');
const {Input} = load('src/core/Input.ts');
const {AssetStore} = load('src/core/Assets.ts');
const ds = {language: 18, texts: JSON.parse(read('public/data/texts.json'))._texts,
  transports: JSON.parse(read('public/data/transports.json')), items: {Items: []}};
const assets = {getImage: () => null, ensure: async () => null};
const people = Array.from({length: 13}, (_, i) => ({name: `Patient ${i}`, HP: 50 + i, maxHP: 100, category: 1, eyeDamage: i === 0}));
const caravan = {People: people, transports: [], money: 120, totalCargo: 10, maxCargo: 100, transportType: p => ({category: p.cat})};
const gd = {Caravans: [caravan], Towns: [], makeDate: () => ({Day2d: '01', ShortMonthName: 'Jan', Year2d: '80', Hour2d: '12', Minute2d: '00'})};
const facility = new HealingFacility(gd, ds, assets);
facility.show({subCategory: 1, name: 50, relPrice: 1, surgeries: [1, 3]}, {name: 'Test Town'});
assert.equal(facility.healDebug().selected, 'Patient 0', 'original List auto-selects first target');
assert.deepEqual([facility.healList.x, facility.healList.y], [10, 362]);
assert.equal(facility.healList.horizontalScrollEnabled, true);
assert.equal(facility.healList.verticalScrollEnabled, false);
assert.ok(facility.healOv.children.some(c => c.constructor.name === 'Sprite' && c.graphics && c.x === 244 && c.y === 269), 'health-bar backdrop uses a positioned Sprite, not untransformed Graphics');
assert.equal(facility.currHeal, 53, 'preview cannot exceed available money');
assert.equal(facility.barBeige.end, 196);
assert.equal(facility.barBlue.start, 196, 'new healing starts after existing HP');
assert.ok(facility.healInfo.text.includes('120.00 €'));
assert.deepEqual(facility.surgery.map(s => [s.solid.visible, s.blank.visible]), [[true, false], [false, false], [false, true]]);
assert.ok(facility.surgery.every(s => s.width > 20));
const pointerX = facility.pointer.x;
Input.mouseX = pointerX + 4;
assert.equal(facility.screen.hitTestPoint(pointerX + 4, 310), facility.pointer);
facility.pointer.dispatchEvent('pointerdown');
Input.drag.onMove(pointerX + 4, 310);
assert.equal(facility.pointer.x, pointerX, 'grabbing the pointer does not jump its value');
Input.drag.onMove(0, 310); assert.equal(facility.currHeal, 50, 'cannot drag below current health');
Input.drag.onMove(880, 310); assert.equal(facility.currHeal, 53, 'cannot drag past affordable health');
Input.drag = null;
facility.healList.hscroll = -10000;
const scroll = facility.healList.hscroll;
assert.ok(scroll < 0, 'long lists scroll horizontally');
facility.renderHeal(); assert.equal(facility.healList.hscroll, scroll, 'selection/healing preserves scroll');
const last = facility.healList.Content.children.at(-1);
assert.equal(last.x + last.width + scroll, 860, 'last cell fits at maximum scroll');
facility.healSingle();
assert.equal(people[0].HP, 53); assert.equal(caravan.money, 0);
caravan.money = 120;
const partial = [{HP: 50, maxHP: 100}, {HP: 80, maxHP: 100}];
facility.healAllPartial(partial);
assert.equal(partial[0].HP, 53, 'partial heal-all continues at the next round');
assert.equal(partial[1].HP, 80); assert.equal(caravan.money, 0);
facility.show({subCategory: 1, relPrice: 0, surgeries: []});
assert.equal(facility.currHeal, 100, 'zero price remains free rather than falling back to 1');
facility.healSingle(); assert.equal(people[0].HP, 100); assert.equal(caravan.money, 0);
caravan.transports = [{type: 1, cat: 1, health: 40, maxHealth: 100}, {type: 2, cat: 2, health: 80, maxHealth: 100}];
facility.show({subCategory: 2, relPrice: 1}); assert.equal(facility.healDebug().targets.length, 1);
facility.show({subCategory: 3, relPrice: 1}); assert.equal(facility.healTarget.type, 2);
caravan.transports = []; facility.show({subCategory: 3});
assert.equal(facility.pointer.visible, false); assert.equal(facility.targetName.text, '');
console.log('PASS doctor layout/selection, scroll, preview/cost, free care and facility categories');

const trade = Object.create(TradeWindow.prototype);
for (const [n, expected] of [[0, '0'], [0.35, '0.4'], [1, '1'], [1.04, '1'], [1.05, '1.1'], [1.15, '1.2'], [1234.56, '1234.6'], [100000, '100 K'], [100000000, '100 M']]) {
  assert.equal(trade.fmtItemAmount(n), expected);
  assert.equal(CaravanMenu.prototype.gridCount(n), expected);
}
assert.equal(trade.fmtMoney(1.25), '1.25'); assert.equal(trade.fmtMoney(1), '1.00');
assert.equal(trade.fmtItemAmount(NaN), '0');
console.log('PASS quantity display (one decimal, no trailing .0); money keeps two decimals');

let hit = null;
const listeners = {}, canvas = {style: {}, addEventListener: (name, fn) => listeners[name] = fn};
new Input(canvas, () => ({hitTestPoint: () => hit}));
const map = Object.assign(Object.create(MapMode.prototype), {gd: {Caravans: [{overTown: 0}]}, hooks: {}, active: true, battleInProgress: false,
  bunkerPrompt: null, levers: [], leverFrameAcc: 0, speedTabs: [], pausedText: {visible: false}});
Input.mouseX = 325; Input.mouseY = 248; map.updateTownCursor(); assert.equal(canvas.style.cursor, 'pointer');
Input.mouseX = 345; map.updateTownCursor(); assert.equal(canvas.style.cursor, 'default', 'outside original 14px click zone');
Input.mouseX = 325; map.updateTownCursor(); map.hooks.isInputBlocked = () => true;
map.updateControls(0); assert.equal(canvas.style.cursor, 'default', 'frozen-world overlay clears map override');
hit = {buttonMode: true}; map.updateControls(0); assert.equal(canvas.style.cursor, 'pointer', 'HUD buttons keep their own hand cursor');
hit = null; map.hooks = {}; map.bunkerPrompt = {visible: true}; map.updateTownCursor(); assert.equal(canvas.style.cursor, 'default');
map.bunkerPrompt = null; globalThis.__c2HideNativeCursor = true; Input.cursorOverride = 'pointer'; Input.syncCursor(); assert.equal(canvas.style.cursor, 'none');
globalThis.__c2HideNativeCursor = false; listeners.pointerleave(); assert.equal(canvas.style.cursor, 'default'); assert.equal(Input.mouseX, -1);
console.log('PASS cursor state logic, modal/HUD/leave/battle resets (not browser validation)');

const store = new AssetStore(ds); await store.loadFonts(); assert.equal(store.fontsReady, true);
assert.ok(!/new FontFace|document\.fonts\.add/.test(read('src/core/Assets.ts')));
assert.ok(read('src/core/EngineText.ts').includes('Microsoft YaHei'));
const source = read('src/game/TradeWindow.ts');
assert.ok(!source.includes('\ufffd')); assert.ok(!source.includes('\r'));
assert.ok(!read('src/game/HealingFacility.ts').includes("+ ' ?'"));
console.log('PASS system-font initialization and UTF-8/LF source guards');

// One focused rendering check: mask caches track output density and retain size.
const {DialogueTextMask} = load('src/core/DialogueBg.ts');
const drawn = [], surfaces = [];
globalThis.document.createElement = () => {
  const surface = {width: 0, height: 0, getContext: () => ({setTransform() {}, drawImage() {}})};
  surfaces.push(surface); return surface;
};
let scale = 2;
const maskCtx = {getTransform: () => ({a: scale, b: 0, c: 0, d: scale}), drawImage: (...args) => drawn.push(args)};
const texture = {naturalWidth: 1024, naturalHeight: 1024};
const mask = new DialogueTextMask({getImage: () => texture, ensure: async () => texture}, 200, 100, []);
mask.renderChildren(maskCtx);
assert.deepEqual([surfaces[0].width, surfaces[0].height], [400, 200]);
assert.deepEqual(drawn.at(-1).slice(1), [0, 0, 200, 100]);
mask.renderChildren(maskCtx); assert.equal(surfaces.length, 1);
scale = 1.5; mask.renderChildren(maskCtx);
assert.deepEqual([surfaces[0].width, surfaces[0].height], [300, 150]);
console.log('PASS text mask output resolution, logical geometry and cache reuse');
