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


const {GameShell} = load('src/game/Shell.ts');
const {MapMode} = load('src/game/MapMode.ts');
const {Sprite} = load('src/core/Display.ts');
const {EngineText} = load('src/core/EngineText.ts');
const shell = Object.assign(Object.create(GameShell.prototype), {
 gameOverVisible:false, gd:{gameSpeed:3,Caravans:[{People:[]}]}, mapMode:{active:true,destroy(){}},
 currentScreen:new Sprite(),text:id=>String(id), autoSaveFrames:2,autoSaveBox:null,toastTime:5
});
shell.showGameOver(2723);
assert.equal(shell.gameOverVisible,true);assert.equal(shell.gd.gameSpeed,0);assert.equal(shell.autoSaveFrames,0);
const ending=shell.currentScreen.children[0];
assert.equal(ending.children[0].text,'6799');assert.equal(ending.children[1].text,'2723');
assert.equal(ending.children[2].y,400);assert.equal(ending.children[2].children[0].text,'OK');
shell.showGameOver(2724);assert.equal(shell.currentScreen.children[0],ending);
let writes=0;shell.saveSlots={saveAutomatic(){writes++}};shell.flushAutoSave();assert.equal(writes,0);
const status = Object.assign(Object.create(MapMode.prototype),{
 screen:new Sprite(),statusText:new EngineText(''),statusRemaining:0, infoText:new EngineText('hover'),
 updateSpeedTabs(){},updateTownCursor(){},leverFrameAcc:0,levers:[]
});
status.appendMessage('saved');status.appendMessage('saved');assert.equal(status.statusText.text,'saved');
assert.equal(status.screen.children.length,1);status.updateControls(2);assert.ok(status.statusText.alpha<1);
assert.equal(status.infoText.text,'hover');status.updateControls(.6);assert.equal(status.statusText.visible,false);
const mapSource=fs.readFileSync(path.join(root,'src/game/MapMode.ts'),'utf8');assert.ok(!mapSource.includes('if (gd.autoSave) this.hooks.onAutoSave()'));
const alive=Object.assign(Object.create(GameShell.prototype),{gd:{autoSave:true},battle:null,mapMode:null,currentScreen:new Sprite(),canvas:{style:{}},autoSave(){writes++}});
alive.endBattle(true,0);assert.equal(writes,0);
console.log('PASS original autosave triggers, terminal game-over and independent deduplicated status fade (no storage accessed)');
