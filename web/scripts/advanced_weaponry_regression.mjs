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


const read = file => JSON.parse(fs.readFileSync(path.join(root,'public',file),'utf8'));
const packageDir=path.join(root,'public/mods/advanced-weaponry');
assert.ok(fs.readdirSync(path.join(packageDir,'images')).every(name=>! /\.png\.png$/i.test(name)));
for(const name of fs.readdirSync(packageDir).filter(name=>name.endsWith('.html'))) {
  const html=fs.readFileSync(path.join(packageDir,name),'utf8');
  for(const match of html.matchAll(/<img\s+src="(images\/[^\"]+)"/g)) {
    assert.ok(!match[1].endsWith('.png.png'));
    assert.ok(fs.existsSync(path.join(packageDir,match[1])),match[1]);
  }
}
const {ModRuntime}=load('src/core/ModRuntime.ts');
const {GameData}=load('src/game/World.ts');
const {itemName}=load('src/game/Economy.ts');
const {workshopRecipes}=load('src/game/workshopRecipes.ts');
const {slotAnimationType}=load('src/game/BattleDoll.ts');
const base={manifest:read('assets/manifest.json'),texts:read('data/texts.json')._texts,language:1};
for(const key of ['items','weapons','gamedata','presets','transports','industries','namePhonetics','mainStory','obstacles','dialogues'])base[key]=read('data/'+key+'.json');
base.battleDoll=read('data/battle_doll.json');
globalThis.location={href:'http://fixture.local/'};
let disabled=[];
globalThis.localStorage={getItem:()=>JSON.stringify(disabled),setItem:(_k,v)=>{disabled=JSON.parse(v);}};
globalThis.fetch=async url=>{const file=new URL(url,location.href).pathname.slice(1);return {ok:true,json:async()=>read(file)};};
const runtime=new ModRuntime();await runtime.load();base.runtime=runtime;
const ds=await runtime.applyTo(base);
assert(runtime.has('advanced-weaponry'));assert.equal(runtime.activeModList()[0].version,'1.0.0');
assert(Array.isArray(ds.items.Items));assert(Array.isArray(ds.presets.town_presets[0]));assert(Array.isArray(ds.presets.town_presets[0][53].locations));
assert.deepEqual(ds.weapons.Weapons[20],base.weapons.Weapons[20]);
for(let id=236;id<=261;id++)assert(ds.items.Items[id]);
for(let id=50;id<=63;id++){const w=ds.weapons.Weapons[id];assert(w);assert(ds.weapons.WeaponTypes[w.type]);assert(ds.weapons.Calibers[w.ammo]);}
for(let id=35;id<=45;id++)assert(ds.weapons.Calibers[ds.weapons.Ammo[id].type]);
assert.equal(ds.weapons.Weapons[53].price,1500000);
assert.equal(ds.weapons.Attachments[7].affectSpread,-5);
assert.equal(workshopRecipes(ds).length,16);
assert.equal(workshopRecipes(ds)[13].outcome,252);
for(const recipe of workshopRecipes(ds)) {assert(ds.items.Items[recipe.outcome]);for(const m of recipe.requiredMaterials)assert(ds.items.Items[m.type]);}
for(let id=36;id<=38;id++) {
 assert.equal(ds.weapons.AnimationTypes[id],4);
 for(let dir=0;dir<4;dir++)for(let frame=1;frame<=23;frame++)assert(ds.battleDoll.spriteBoundaries.Weapon[id][dir][frame]);
}
assert.match(itemName(ds,245),/ - /);
assert(!itemName({...ds,language:18},240).startsWith('Item '));
const manifest=read('mods/advanced-weaponry/manifest.json');
for(const relative of Object.values(manifest.data)) {
 assert.match(relative,/^data\/[^/]+\.json$/);
 assert.ok(fs.existsSync(path.join(packageDir,relative)));
 assert.ok(!fs.existsSync(path.join(packageDir,path.basename(relative))));
}
for(const [key,relative] of Object.entries(manifest.assets)) {
 const file=path.join(root,'public/mods/advanced-weaponry',relative);
 assert(fs.statSync(file).size>0);
 assert(runtime.resolveAsset(key).includes(relative));
 if(relative.endsWith('.mp3'))assert(ds.manifest.sounds[key]);
}
// Constructor-only world fixture: no UI, no real saves, no storage writes.
globalThis.__c2={ds};
const gd=new GameData(ds,{storyMode:true,difficulty:2,character:null});
assert.equal(gd.Towns[53].locations[10].name,7098);
for(const {town,location,entry} of ds.gamedata.modTownAssortments)assert(gd.Towns[town].locations[location].assortment.some(x=>x.item===entry.item&&x.amount===entry.amount));
const gd2=new GameData(ds,{storyMode:true,difficulty:2,character:null});
assert.equal(gd2.Towns[5].locations[2].assortment.length,gd.Towns[5].locations[2].assortment.length);
assert.equal(base.items.Items[236],undefined,'base data remains untouched');
runtime.disable('advanced-weaponry');const off=new ModRuntime();await off.load();const plain=await off.applyTo(base);
assert.equal(plain.items.Items[236],undefined);assert.equal(workshopRecipes(plain).length,6);
assert.equal(off.resolveAsset('SFX50BMG1'),undefined);
console.log('PASS DLC tables, base preservation, recipes, live shop rules, sprite frames, asset/sound paths, naming and restart-disable isolation');
