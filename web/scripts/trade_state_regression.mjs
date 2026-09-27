// Minimal in-memory checks for quantity/trade, dialogue, pause controls and save notice.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url), cache = new Map();
function load(file) {
  file = path.resolve(root, file); if (!path.extname(file)) file += '.ts';
  if (cache.has(file)) return cache.get(file).exports;
  const m = {exports: {}}; cache.set(file, m);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  new Function('require', 'module', 'exports', js)(n => n.startsWith('.') ? load(path.resolve(path.dirname(file), n)) : require(n), m, m.exports);
  return m.exports;
}
globalThis.document = {createElement: () => ({getContext: () => ({measureText: s => ({width: String(s).length * 8})})})};
const {itemAmount} = load('src/game/ItemQuantity.ts');
const {TradeWindow} = load('src/game/TradeWindow.ts');
const {Caravan, Town} = load('src/game/World.ts');
const {DialogueScreen} = load('src/game/DialogueScreen.ts');
const {MapMode} = load('src/game/MapMode.ts');
const {GameShell} = load('src/game/Shell.ts');
const {Sprite} = load('src/core/Display.ts');
const {transpileAs3Fn} = load('src/game/Story.ts');
const items = JSON.parse(fs.readFileSync(path.join(root, 'public/data/items.json'), 'utf8'));
const texts = JSON.parse(fs.readFileSync(path.join(root, 'public/data/texts.json'), 'utf8'))._texts;
const ds = {items, texts, language: 18};
globalThis.__c2 = {ds};
const id = items.Items.findIndex(it => it?.category === 1 && items.Goods[it.subCategory]?.divisible && items.Goods[it.subCategory]?.food);
assert.ok(id > 0);
const def = items.Goods[items.Items[id].subCategory];
for (const [raw, expected] of [[0,0],[0.0001,.1],[.04,.1],[.05,.1],[.14,.1],[1.24,1.2],[1.26,1.3],[515.14,515.1]]) {
  assert.equal(itemAmount(raw, true), expected);
}
assert.equal(itemAmount(.49, false), 0); assert.equal(itemAmount(.51, false), 1);
function trade(raw, partnerKind) {
  const c = new Caravan(); c.People = []; c.money = 10000;
  Object.defineProperty(c, 'maxCargo', {get: () => 100, configurable: true});
  const partner = partnerKind === 'town' ? Object.assign(Object.create(Town.prototype), {stock: new Map([[id, raw]])})
    : partnerKind === 'npc' ? {cargo: new Map([[id, raw]])} : [{type: id, amount: raw}];
  const t = Object.assign(Object.create(TradeWindow.prototype), {ds, gd: {Caravans: [c], advancedTrading: false}, partner,
    free: true, shop: null, shopType: null, sides: [{array: [], items: []}, {array: [], items: []}],
    update() {}, syncLiquids() {}, makePic() {}, showProblem(message) { throw new Error('unexpected warning: ' + message); }});
  const e = t.itemEntry(id, raw, def, items.Items[id]); t.sides[1].array.push(e);
  return {t,c,partner,e};
}
for (const kind of ['town','npc','storage']) for (const raw of [.0001,.04,1.24,1.26]) {
  const {t,c,partner,e} = trade(raw, kind);
  while (t.sides[1].array.length) t.takeItem(1, t.sides[1].array[0]);
  assert.equal(t.sides[1].items[0].amount, itemAmount(raw, true));
  assert.ok(Math.abs(c.cargo.get(id) - itemAmount(raw, true)) < 1e-9);
  assert.equal(Array.isArray(partner) ? partner.length : (partner.stock ?? partner.cargo).size, 0);
  t.returnItem(1, 0, t.sides[1].items[0].amount);
  assert.equal(c.cargo.has(id), false, 'return-all leaves no ghost player stack');
  assert.equal(t.sides[1].array[0].amount, itemAmount(raw, true));
  assert.equal(t.fmtItemAmount(e.amount), '0');
}
const limited = trade(.04, 'storage');
Object.defineProperty(limited.c, 'maxCargo', {get: () => 0, configurable: true});
let problem = ''; limited.t.showProblem = s => problem = s;
limited.t.takeItem(1, limited.e); assert.equal(problem, texts[1020][18]);
assert.equal(limited.c.cargo.size, 0, 'real capacity limit is still enforced');
const rawPlayer = trade(0, 'storage'); rawPlayer.c.cargo.set(id, 1.24);
assert.equal(rawPlayer.c.tradableCargo(id), 1.2); assert.equal(rawPlayer.c.cargo.get(id), 1.24, 'read does not truncate raw inventory');
rawPlayer.t.removeFromPlayer(rawPlayer.t.itemEntry(id,1.24,def,items.Items[id]),1.2);
assert.equal(rawPlayer.c.cargo.has(id), false);
rawPlayer.c.cargo.set(id,1.01);rawPlayer.c.inUse[id]=1;
assert.equal(rawPlayer.c.tradableCargo(id),0,'round total before subtracting assigned quantities');
console.log('PASS original amount getter; small stacks, take/return-all, raw remainder and real overload');

const loc = {category:1,subCategory:1,visible:false};
const d = Object.assign(Object.create(DialogueScreen.prototype), {gd:{Towns:Array.from({length:17},()=>({locations:[null,loc]}))},
  currentEntry:299, screen:new Sprite(), show(){}, tradeWindow:{screen:new Sprite(),show(){}}});
d.tradeWindow.screen.visible=false; d.screen.addChild(d.tradeWindow.screen);
const responses = JSON.parse(fs.readFileSync(path.join(root,'public/data/dialogues.json'),'utf8')).responses;
transpileAs3Fn(responses[542].actions.__as3fn)({openLocation:(...args)=>d.openLocation(...args)});
assert.equal(d.tradeWindow.screen.visible,true); assert.equal(d.currentEntry,299); assert.equal(loc.visible,false);
console.log('PASS original Cricket response opens hidden shop without unlocking its map icon');

const map = Object.assign(Object.create(MapMode.prototype), {gd:{gameSpeed:4},speedTabs:[0,1,2,4].map(speed=>({speed,pressed:{visible:speed===4}})),pausedText:{visible:false}});
map.pauseForTownExit(); assert.equal(map.gd.gameSpeed,0); assert.equal(map.prevSpeed,4);
assert.deepEqual(map.speedTabs.map(t=>t.pressed.visible),[true,false,false,false]);
console.log('PASS return-town pause synchronizes buttons and remembers fast speed');

let flushed=0;
const shell=Object.assign(Object.create(GameShell.prototype),{gd:{},language:18,ds,currentScreen:new Sprite(),autoSaveFrames:0,flushAutoSave(){flushed++;}});
shell.autoSave(); assert.equal(flushed,0); assert.ok(shell.autoSaveBox.children[0].text.includes(texts[6800][18]));
shell.update(.04); assert.equal(flushed,0); assert.equal(shell.autoSaveBox.visible,true);
shell.update(.04); assert.equal(flushed,1); assert.equal(shell.autoSaveBox,null);
console.log('PASS original save notice appears before serialization and closes after saving (no storage access)');
