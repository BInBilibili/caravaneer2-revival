import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/game/DlcDescription.ts',import.meta.url),'utf8');
const module = {exports:{}};
new Function('module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports);
const {packageResource,descriptionBlocks,descriptionImageSize}=module.exports;
const base='http://localhost:5173/mods/example/';
assert.equal(packageResource(base,'images/test.png'),base+'images/test.png');
for(const path of ['../x','%2e%2e/x','https://example.com/x','/x','images\\x','javascript:alert(1)'])assert.equal(packageResource(base,path),null);
assert.deepEqual(module.exports.descriptionFiles(18),['description.ZHS.html','description.html']);
assert.deepEqual(module.exports.descriptionFiles(19),['description.ZHT.html','description.html']);
assert.deepEqual(module.exports.descriptionFiles(30),['description.JA.html','description.html']);
assert.deepEqual(module.exports.descriptionFiles(999),['description.EN.html','description.html']);
assert.deepEqual(module.exports.descriptionFiles(18,'custom.html'),['custom.html']);
const languages=JSON.parse(fs.readFileSync(new URL('../public/data/gamedata.json',import.meta.url),'utf8')).languages;
const codes=languages.map(language=>module.exports.DESCRIPTION_LANGUAGES[language.ind]);
assert.equal(codes.length,45);
assert.equal(new Set(codes).size,codes.length);
for(const code of codes)assert.match(code,/^[A-Z]{1,3}$/);
assert.deepEqual(module.exports.descriptionFiles(18,'description.json'),[]);
for(const [w,h] of [[2000,1000],[1000,2000],[20,10]]){
 const s=descriptionImageSize(w,h);assert.ok(s.width<=258&&s.height<=160&&s.width<=w);assert.ok(Math.abs(s.width/s.height-w/h)<1e-9);
}
const sample=fs.readFileSync(new URL('../public/mods/advanced-weaponry/description.ZHS.html',import.meta.url),'utf8');
assert.match(sample,/<h1 /);assert.match(sample,/<img /);
console.log('PASS HTML files, locale filenames, JSON rejection, relative paths and image bounds');
