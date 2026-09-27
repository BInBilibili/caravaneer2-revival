// Regression: Caravan.actualWarPower (original Caravan.as:1286-1321) and the dialogue actions that read it
// (Dialogues.as:14158 / :16960 -> responses[924] / [1213] choose currentEntry 542 vs 538).
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

const {Caravan, Character, npcVisualWarPower, peopleWarPower} = load('src/game/World.ts');
const {transpileAs3Fn} = load('src/game/Story.ts');
const {worldWarPower} = load('src/game/NpcWorldAI.ts');
const ds = {items: {Items: []}, weapons: {Weapons: [null, {price: 100, type: 1}], WeaponTypes: [null, {category: 5}]}};
globalThis.__c2 = {ds};

// one fighter, one weapon in slot 0: visual = 100 + sqrt(100*5/1); actual adds the same again + attributes
const fighter = new Character({category: 1, basePhysical: 8, baseAgility: 6, baseAccuracy: 7, baseIntelligence: 5, _HP: 120, generalBattleExperience: 2500});
fighter.weapons = [1, 0];
assert.equal(fighter.physical, 8);
const visual = npcVisualWarPower([fighter], ds);
assert.equal(visual, 100 + Math.sqrt(500));
const expected = 2 * visual + fighter.physical + fighter.accuracy + fighter.maxAP + 50;
assert.equal(peopleWarPower([fighter], ds, true), expected);
assert.equal(peopleWarPower([fighter], ds, false), visual);

// non-fighters (category 3/4) contribute nothing
const apprentice = new Character({category: 3, basePhysical: 10, _HP: 100, generalBattleExperience: 99999});
apprentice.weapons = [1, 0];
assert.equal(peopleWarPower([apprentice], ds, true), 0);

// Caravan exposes the original getter so transpiled dialogue conditions can read it
const car = new Caravan();
car.People = [fighter];
assert.equal(car.actualWarPower, expected);
assert.ok(Number.isFinite(car.actualWarPower));

// NpcWorldAI.worldWarPower must stay equal to the shared helper (roster: people / squad.people)
const ctx = {category: 1, people: [fighter]};
assert.equal(worldWarPower(ctx, ds, true), expected);
assert.equal(worldWarPower(ctx, ds, false), visual);

// Original dialogue gate: (actualWarPower/100 + rep6/10) / max(population-44,1) > 0.5
const dialogues = JSON.parse(fs.readFileSync(path.join(root, 'public/data/dialogues.json'), 'utf8'));
const runAction = (rid, caravan, population, rep6) => {
  let entry = 0;
  const env = {GD: {Caravans: [caravan], Towns: {20: {population}}}, getSpecificReputation: () => rep6, refresh: () => {}};
  Object.defineProperty(env, 'currentEntry', {get: () => entry, set: v => { entry = v; }});
  transpileAs3Fn(dialogues.responses[rid].actions.__as3fn)(env);
  return entry;
};
for (const rid of [924, 1213]) {
  assert.equal(runAction(rid, car, 50, 0), 542, 'strong caravan takes the war-power branch');
  const weak = new Caravan();
  weak.People = [new Character({category: 1, basePhysical: 3, baseAgility: 3, baseAccuracy: 3, _HP: 60, generalBattleExperience: 0})];
  assert.equal(runAction(rid, weak, 80, 0), 538, 'weak caravan falls through to the default branch');
  assert.equal(runAction(rid, weak, 100, 0), 537, 'population >= 85 wins first');
  // Without the getter the expression is NaN and 542 was unreachable in the web port.
  assert.equal(runAction(rid, {People: [fighter]}, 50, 0), 538, 'missing actualWarPower keeps the old (wrong) branch');
}
console.log('PASS Caravan.actualWarPower (visual x2 + attributes + sqrt(gBE)) and dialogue gates 924/1213 -> 542/538/537');
