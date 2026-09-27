// Minimal in-memory/source regression for the three fixes. No save-slot access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),cache=new Map();
function load(file){
  file=path.resolve(root,file);if(!path.extname(file))file+='.ts';
  if(cache.has(file))return cache.get(file).exports;
  const m={exports:{}};cache.set(file,m);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',js)(n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n)):require(n),m,m.exports);
  return m.exports;
}
globalThis.document={createElement:()=>({getContext:()=>({measureText:s=>({width:String(s).length*8})})})};

const {Story}=load('src/game/Story.ts');
const {TownMode}=load('src/game/TownMode.ts');
const ds={gamedata:{originalDlcFeatures:{'industrial-magnate':true}},mainStory:{defaultDefaults:{}},presets:{faction_relations:[[]]}};
const story=new Story(ds);
assert.equal(story.finishedTheGame,true,'Industrial Magnate must apply its original onGameInit flag');
const townMode=Object.assign(Object.create(TownMode.prototype),{ds,gd:{story,canBreakEconomy:true}});
assert.equal(townMode.industryPurchaseAllowed({forSale:false,essential:true}),true,'DLC permits buying otherwise non-sale/essential industries');

const mapSource=fs.readFileSync(path.join(root,'src/game/MapMode.ts'),'utf8');
assert.match(mapSource,/onNpcCaravan\(npc\.id, behavior > 0\)/,'encounter type must come from original checkBehavior result');
const encounterSource=fs.readFileSync(path.join(root,'src/game/CaravanEncounterMenu.ts'),'utf8');
assert.match(encounterSource,/this\.text\(1266\).*kind: "cancel"/,'friendly encounter retains set-off/cancel option');

const police=Object.assign(Object.create(TownMode.prototype),{gd:{getFactionRelations:()=>-50},policeLoc:{faction:8,reward:3000}});
assert(Number.isFinite(police.policeRewardFormula({price:()=>15000})),'police reward formula remains numeric');
const policeSource=fs.readFileSync(path.join(root,'src/game/TownMode.ts'),'utf8');
for(const token of ['880, 495','390,172,100,100','657; this.policeClaimButton.y = 309','this.policeList.x = 10; this.policeList.y = 362'])assert(policeSource.includes(token),`missing original police layout token: ${token}`);
console.log('PASS friendly departure, original police rules/layout, and Industrial Magnate purchasing');
