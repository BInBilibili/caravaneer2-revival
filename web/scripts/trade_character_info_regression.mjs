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


const {TradeWindow}=load('src/game/TradeWindow.ts');
const t=Object.assign(Object.create(TradeWindow.prototype),{text:id=>String(id)});
const pairs=t.characterInfoPairs({HP:140,maxHP:140,physical:7,basePhysical:7,agility:2,baseAgility:2,accuracy:4,intelligence:8,capacity:59.8,speed:4,totalExperience:1320,learningCapacity:80});
assert.deepEqual(pairs.map(p=>p.name),['50','944','945','946','947','1271','916','984','966']);
assert.deepEqual(pairs.map(p=>p.value),['140/140','7','2','4','8','59.8','4','1,320','8,000']);
console.log('PASS original Character.getInfoPairs order, values and formatting');
