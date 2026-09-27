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


const {Sprite}=load('src/core/Display.ts');
const {EngineText}=load('src/core/EngineText.ts');
const {createTextShift,installTextShift}=load('src/core/TextShift.ts');
const page=new Sprite(), button=new Sprite(), group=new Sprite();
button.y=40;group.scaleY=.5;page.addChild(button);page.addChild(group);
const label=new EngineText('test');label.y=3;button.addChild(label);
const small=new EngineText('scaled');small.y=10;group.addChild(small);
const shift=createTextShift(2);shift(page);shift(page);
assert.equal(label.y,5);assert.equal(button.y,40);assert.equal(small.y,14);
const fresh=new EngineText('new');page.addChild(fresh);shift(page);assert.equal(fresh.y,2);
const other=new EngineText('unrelated');assert.equal(other.y,0);
const dynamic=new Sprite();installTextShift(dynamic,2);const text=new EngineText('dynamic');dynamic.addChild(text);
dynamic.renderSelf({});dynamic.renderSelf({});assert.equal(text.y,2);
console.log('PASS text-only +2px, scaled labels, dynamic labels, idempotence and unrelated-page isolation');
