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
const {Sprite,Graphics}=load('src/core/Display.ts');
const {EngineText}=load('src/core/EngineText.ts');
const {installTextShift}=load('src/core/TextShift.ts');
// Execute the actual setup builder with inert controls; no game/save initialization.
const source=fs.readFileSync(path.join(root,'src/game/Shell.ts'),'utf8');
const start=source.indexOf('  private buildGameSetup()');
const end=source.indexOf('\n  // ----------',start);
const js=ts.transpileModule('class Fixture { '+source.slice(start,end)+' }',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
class Control extends Sprite {setState(){} setValue(){}}
const Fixture=new Function('Sprite','Graphics','EngineText','installTextShift','Button','Switch',js+';return Fixture;')(Sprite,Graphics,EngineText,installTextShift,Control,Control);
const fixture=new Fixture();fixture.currentScreen=new Sprite();fixture.text=id=>String(id);fixture.bitmap=()=>null;
const originalRender=fixture.currentScreen.renderSelf;
for(let visit=0;visit<3;visit++){
 fixture.currentScreen.removeAll();fixture.buildGameSetup();
 assert.equal(fixture.currentScreen.renderSelf,originalRender,'setup must not wrap reusable root');
 const page=fixture.currentScreen.children[0],label=page.children.find(c=>c instanceof EngineText),y=label.y;
 page.renderSelf({});page.renderSelf({});assert.equal(label.y,y+2,'local shift applied once');
 fixture.currentScreen.removeAll();
 const world=new EngineText('10 七月 80 AM',0,16,'left',0,390);fixture.currentScreen.addChild(world);
 fixture.currentScreen.renderSelf({});assert.equal(world.y,390,'new game / load must have same text position');
}
console.log('PASS setup local +2px, repeated rendering, three revisits, new/load root offset isolation');


