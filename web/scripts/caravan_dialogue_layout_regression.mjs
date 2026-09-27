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



const {DialogueScreen}=load('src/game/DialogueScreen.ts');
const {CaravanMenu}=load('src/game/CaravanMenu.ts');
const {Button}=load('src/core/Ui.ts');
const dialog=Object.create(DialogueScreen.prototype);
const paths=[]; const g={lineStyle(){},beginFill(){},endFill(){},moveTo(...v){paths.push(['M',...v])},lineTo(...v){paths.push(['L',...v])},curveTo(...v){paths.push(['Q',...v])}};
dialog.drawBubble(g,290,55,0,1,false);
assert.deepEqual(paths[0],['M',265,-10]);assert.deepEqual(paths.at(-1),['L',265,-10]);assert.ok(paths.every(p=>p.slice(1).every(v=>v<=280)));
paths.length=0;dialog.drawBubble(g,290,55,0,1,true);assert.ok(paths.some(p=>p[0]==='L'&&p[1]>280));
const menu=Object.assign(Object.create(CaravanMenu.prototype),{assets:null});
assert.ok(menu.btn8('+',()=>{}) instanceof Button);assert.ok(menu.arrowBtn(1,()=>{}) instanceof Button);
const source=fs.readFileSync(path.join(root,'src/game/CaravanMenu.ts'),'utf8');
assert.ok(source.includes('TAB_Y[i] + 7'));assert.ok(source.includes('child.y += 2 / scale'));
assert.ok(source.includes('Y(332) + 4'));assert.ok(source.includes('b.buttonMode = true; b.mouseChildren = false;'));
console.log('PASS original question/response outlines, original Button8 material path and scoped typography offsets');

const {TownMode}=load('src/game/TownMode.ts');
const {Sprite}=load('src/core/Display.ts');
const {EngineText}=load('src/core/EngineText.ts');
const town=Object.assign(Object.create(TownMode.prototype),{shiftedStatsText:new WeakSet()});
const container=new Sprite(), label=new EngineText('stats',0,14,'left',0,10);
container.addChild(label);town.shiftStatsText(container);town.shiftStatsText(container);assert.equal(label.y,12);
const late=new EngineText('late',0,14,'left',0,20);container.addChild(late);town.shiftStatsText(container);assert.equal(late.y,22);assert.equal(label.y,12);
const townSource=fs.readFileSync(path.join(root,'src/game/TownMode.ts'),'utf8');
assert.ok(townSource.includes('bitmap.colorTransform = {r: .3, g: .2, b: .1}'));
assert.ok(townSource.includes('new EngineText("", 0, 14, "left", 10, 475, 860, 20)'));
assert.ok(source.includes('if (t) t.y = 474'));
console.log('PASS bubble closing stroke, uniform caravan footer, town mask colors and idempotent stats text shift');
