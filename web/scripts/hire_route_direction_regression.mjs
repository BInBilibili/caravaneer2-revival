// Minimal in-memory regression for hire skills and route-caravan heading. No save access.
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

const {Character,GameData,NpcCaravan}=load('src/game/World.ts');
const person=new Character({basePhysical:7,baseAgility:8,baseAccuracy:9,baseIntelligence:6,_HP:140});
for(const skill of Character.skillsList){
  assert(Number.isFinite(person.skillValue(skill.skill)),`${skill.skill} must be finite in the hire list`);
}

const gd=Object.assign(Object.create(GameData.prototype),{
  gameSpeed:1,ds:{},Towns:[{id:0,x:0,y:0,active:true},{id:1,x:100,y:0,active:true}],Time:0,
  npcTradeAtTown(){},
});
const npc=new NpcCaravan(1,[0,1],'Route caravan');
npc.category=5;npc.x=0;npc.y=0;npc.pointIdx=0;npc.routePoint=0;npc.speedKmh=6;npc.moving=true;npc.direction=null;
gd.moveNpcRoute(npc,1,{Economy:{}});
assert.equal(npc.pointIdx,1,'arrival advances to the next route point');
assert(Math.abs(npc.direction-Math.PI/2)<1e-9,'next eastbound leg points east immediately');
const before=npc.x;
gd.moveNpcRoute(npc,0.1,{Economy:{}});
assert(npc.x>before,'a non-null display heading must not bypass route movement');
assert(Math.abs(npc.direction-Math.PI/2)<1e-9,'route indicator follows the actual destination');

console.log('PASS hire skill values and route-caravan direction');
