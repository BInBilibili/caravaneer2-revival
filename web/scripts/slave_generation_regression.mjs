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


const {Character, makeRandomCharacter} = load('src/game/World.ts');
const originalRandom = Math.random;
try {
  Math.random = () => .5;
  const ds = {namePhonetics:{EnglishMaleNames:['Test'],EnglishFemaleNames:['Test']}};
  const p = makeRandomCharacter(ds, {category:4, age:30, gender:1});
  assert.deepEqual([p.basePhysical,p.baseAgility,p.baseAccuracy,p.baseIntelligence],[6,4,6,7]);
  assert.equal(p.HP,p.maxHP);
  assert.equal(p.rifleExperience,50);
  assert.equal(p.generalBattleExperience,250);
  const woman = makeRandomCharacter(ds, {category:4, age:30, gender:2});
  assert.deepEqual([woman.basePhysical,woman.baseAgility,woman.baseAccuracy,woman.baseIntelligence],[4,6,6,7]);
  const saved = new Character({category:4,basePhysical:10,baseAgility:10,baseAccuracy:10,baseIntelligence:10});
  assert.equal(saved.basePhysical,10);
  const source = fs.readFileSync(path.join(root,'src/game/World.ts'),'utf8');
  assert.equal((source.match(/makeRandomCharacter\((?:this\.)?ds, \{ category: 4/g)||[]).length,3);
  console.log('PASS slave creation formulas, experience, HP, three spawn paths and saved-stat preservation');
} finally {Math.random = originalRandom;}
