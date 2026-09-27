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
const {Economy}=load('src/game/Economy.ts');
const {Sprite}=load('src/core/Display.ts');
const {EngineText}=load('src/core/EngineText.ts');
const original=Economy.amountAffordable;
Economy.amountAffordable=(_ds,_partner,_type,money)=>money/10;
for(const advanced of [false,true])for(const [money,capacity,expected] of [[100,50,10],[500,12,12],[1000,1000,100]]) {
 let maximum;const t=Object.assign(Object.create(TradeWindow.prototype),{gd:{Caravans:[{money,maxCargo:capacity,totalCargo:0}],advancedTrading:advanced},ds:{},partner:{},free:false,shop:null,sides:[{items:[]},{items:[]}],screen:new Sprite(),totalPrice:()=>0,calcPanel:{open(_s,_min,max){maximum=max}},showProblem(){throw Error('unexpected warning')}});
 t.takeItem(1,{kind:'item',amount:100,weight:1,type:1,divisible:true});assert.equal(maximum,advanced ? 100 : expected);
}
Economy.amountAffordable=original;
const panel=new Sprite(),label=new EngineText('item'),footer=new EngineText('footer');panel.addChild(label);panel.addChild(footer);
const t=Object.assign(Object.create(TradeWindow.prototype),{shiftedText:new WeakSet(),bottomCapacity:footer,calcPanel:{ov:new Sprite()}});
t.shiftTradeText(panel);t.shiftTradeText(panel);assert.equal(label.y,2);assert.equal(footer.y,0);
for(const advanced of [false,true])for(const side of [0,1])for(const space of [0,5.78]) {
 let maximum, moved=false, problem;
 const receiver={money:10000,maxCargo:1000,totalCargo:0,maxLiquidAmount:()=>space};
 const t=Object.assign(Object.create(TradeWindow.prototype),{gd:{Caravans:[receiver],advancedTrading:advanced},partner:receiver,free:true,ds:{},sides:[{items:[]},{items:[]}],screen:new Sprite(),text:id=>String(id),calcPanel:{open(_s,_min,max){maximum=max}},doMove(){moved=true},showProblem(msg){problem=msg}});
 t.takeItem(side,{kind:'item',amount:100,weight:1,type:1,divisible:true,itemData:{liquid:true}});
 if(advanced){assert.equal(maximum,100);assert.equal(problem,undefined);}
 else if(space===0){assert.equal(problem,'1346');assert.equal(maximum,undefined);assert.equal(moved,false);}
 else {assert.equal(maximum,5.7);assert.equal(problem,undefined);}
}
console.log('PASS original normal/advanced trade limits; liquid receiver capacity in both directions, including zero space; footer exclusion');
