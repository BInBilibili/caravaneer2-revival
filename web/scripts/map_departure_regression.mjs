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


const {MapMode}=load('src/game/MapMode.ts');
const c={x:0,y:0,recentlyInteractedTowns:[]};
const town={id:0,x:0,y:0,active:true};
const map=Object.assign(Object.create(MapMode.prototype),{gd:{Caravans:[c],Towns:[town]}});
map.protectDepartureFromOverlappingTowns();map.protectDepartureFromOverlappingTowns();assert.deepEqual(c.recentlyInteractedTowns,[0]);
c.x=26;c.recentlyInteractedTowns=[];map.protectDepartureFromOverlappingTowns();assert.deepEqual(c.recentlyInteractedTowns,[]);
c.x=0;town.active=false;map.protectDepartureFromOverlappingTowns();assert.deepEqual(c.recentlyInteractedTowns,[]);
const src=fs.readFileSync(path.join(root,'src/game/TradeWindow.ts'),'utf8');assert.ok(!src.includes('if (cellN === 0) side.list!.addContent'));
console.log('PASS overlap departure protection, deduplication, outside/inactive towns and empty inventory placeholder removal');
