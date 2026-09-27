// Minimal NPC world-AI regression; entirely in-memory, no save access.
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


const {Character}=load('src/game/World.ts');
const {checkWorldBehavior,steerWorldNpcs,resolveWorldNpcContacts,worldWarPower}=load('src/game/NpcWorldAI.ts');
const ds={items:{Items:[]},weapons:{Weapons:[null,{price:100,type:1}],WeaponTypes:[null,{category:5}]}};
const make=(id,x,y,size,aggressive=false)=>({id,x,y,category:1,faction:id,aggressive,morale:50,speedKmh:5,moving:false,direction:null,noticeability:150,routePoints:[],people:Array.from({length:size},()=>new Character({category:1,basePhysical:5,baseAgility:4,baseAccuracy:5,baseIntelligence:5,_HP:100}))});
const player=make(0,10000,10000,1);
const gd={ds,Caravans:[player],npcCaravans:[],getFactionRelations:(a,b)=>a===b?0:-50};
const bandit=make(1,100,100,4,true), adventurer=make(2,150,100,1);
gd.npcCaravans=[bandit,adventurer];
assert(checkWorldBehavior(gd,bandit,adventurer)>0);
assert(checkWorldBehavior(gd,adventurer,bandit)<0);
steerWorldNpcs(gd);
assert(Math.abs(bandit.direction-Math.PI/2)<1e-9,'bandit pursues east');
assert(Math.sin(adventurer.direction)>0.99,'adventurer escapes east');
const police=make(3,50,100,12,true);
gd.npcCaravans=[police,bandit];steerWorldNpcs(gd);
assert(Math.sin(police.direction)>.99,'police pursues bandit');
assert(Math.sin(bandit.direction)>.99,'outmatched bandit flees police');
gd.getFactionRelations=()=>-2;
assert.equal(checkWorldBehavior(gd,police,bandit),0,'minor hostility does not trigger combat');
gd.getFactionRelations=(a,b)=>a===b?0:-50;
const route=make(4,150,100,1);route.category=5;route.direction=.3;
gd.npcCaravans=[police,route];steerWorldNpcs(gd);assert.equal(route.direction,.3);
const armed=make(5,0,0,1);armed.people[0].weapons=[1,1];
assert(Math.abs(worldWarPower(armed,ds)-(100+Math.sqrt(500)+Math.sqrt(250)))<1e-9,'weapon category multiplier and both slots');
const before=police.people.map(p=>p.HP);bandit.x=police.x+10;bandit.y=police.y;
gd.npcCaravans=[police,bandit];const random=Math.random;
try{Math.random=()=>.1;resolveWorldNpcContacts(gd);}finally{Math.random=random;}
assert.deepEqual(gd.npcCaravans,[police]);assert(police.people.every((p,i)=>p.HP<=before[i]));
resolveWorldNpcContacts(gd);assert.equal(gd.npcCaravans.length,1,'no duplicate settlement');
// A squad record (rather than a Character) retains its injuries for later player encounters.
const weak=make(6,0,0,1),strong=make(7,10,0,2,true);
strong.squad={people:strong.people.map(p=>({...p,maxHP:p.maxHP,skillExperience:{generalBattleExperience:400}}))};
strong.people=[];gd.npcCaravans=[strong,weak];
try{Math.random=()=>.5;resolveWorldNpcContacts(gd);}finally{Math.random=random;}
assert.equal(gd.npcCaravans.length,1);assert.equal(gd.npcCaravans[0],strong);
console.log('PASS pursuit, fleeing, police/bandit strength, relation threshold, route exemption, war power, NPC contact and persisted squad records');

const presets=JSON.parse(fs.readFileSync(path.join(root,'public/data/presets.json'),'utf8'));
const relations=presets.faction_relations[0],types=presets.caravan_types[0];
gd.ds.presets=presets;gd.getFactionRelations=(a,b)=>a===b?0:relations[Math.max(a,b)][Math.min(a,b)];
const rovers=make(6,100,100,4,true),travelers=make(5,150,100,1);
rovers.type=6;travelers.type=5;
assert.equal(types[6].faction,6);assert.equal(types[5].aggressive,false);
assert(checkWorldBehavior(gd,rovers,travelers)>0);
assert(checkWorldBehavior(gd,travelers,rovers)<0);
const marauders=make(7,150,100,2,true),alkubraPolice=make(8,100,100,6,true);
assert(checkWorldBehavior(gd,alkubraPolice,marauders)>0);
console.log('PASS shipped Rovers/Travelers and Alkubra Police/Marauders faction relations');
