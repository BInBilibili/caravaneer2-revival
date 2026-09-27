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


const {transpileAs3Fn}=load('src/game/Story.ts');
const d=JSON.parse(fs.readFileSync(path.join(root,'public/data/dialogues.json'),'utf8'));
for(const [rid,amount,expected] of [[552,5,true],[552,20,false],[563,5,false],[563,20,true]]) {
 const env={Story:{askedKukulToTalkWithDrekar:true,KukulsPriceForContact:10},GD:{Caravans:[{findCargo:()=>({amount})}]}};
 assert.equal(!!transpileAs3Fn(d.responses[rid].conditions.__as3fn)(env),expected);
 env.Story.kukulSendsYouToDrekar=true;assert.equal(transpileAs3Fn(d.responses[rid].conditions.__as3fn)(env),false);
}
for(const relationship of [0,3]) {
 let entry=0,refreshed=0;const env={getCurrentRelationship:()=>relationship,refresh:()=>refreshed++};
 Object.defineProperty(env,'currentEntry',{get:()=>entry,set:v=>entry=v});
 transpileAs3Fn(d.responses[490].actions.__as3fn)(env);assert.equal(entry,relationship>2?274:275);assert.equal(refreshed,1);
}
console.log('PASS Drekar relationship branches, Kukul partial/full delivery and story-gated exclusion');
