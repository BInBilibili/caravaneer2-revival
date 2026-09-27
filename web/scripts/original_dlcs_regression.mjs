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
const {ModRuntime}=load('src/core/ModRuntime.ts');
const {GameData}=load('src/game/World.ts');
const base={manifest:read('assets/manifest.json'),texts:read('data/texts.json')._texts,language:1};
for(const key of ['items','weapons','gamedata','presets','transports','industries','namePhonetics','mainStory','obstacles','dialogues'])base[key]=read('data/'+key+'.json');
base.battleDoll=read('data/battle_doll.json');
globalThis.location={href:'http://fixture.local/'};
globalThis.localStorage={getItem:()=> '[]',setItem:()=>{throw Error('unexpected save');}};
globalThis.fetch=async url=>({ok:true,json:async()=>read(new URL(url,location.href).pathname.slice(1))});
const ids=['industrial-magnate','special-story','welcome-to-games-of-honor'];
let translated=0;
for(const id of ids){
 const html=fs.readFileSync(path.join(root,'public/mods',id,'description.ZHS.html'),'utf8');
 assert.match(html,/<h1[^>]*text-align:center[^>]*border:/);
 for(const [key,rows] of Object.entries(read(`mods/${id}/data/texts.json`))){
  assert(rows[18]?.trim(),`${id}: missing Chinese ${key}`);
  assert(!rows[18].includes('\ufffd'),`${id}: corrupt encoding ${key}`);
  if(rows[1]){
   translated++;
   assert.equal((rows[18].match(/<[^<>]+\/[^<>]+>/g)||[]).length,(rows[1].match(/<[^<>]+\/[^<>]+>/g)||[]).length,`gender selector ${key}`);
   assert.deepEqual(rows[18].match(/@[^@]+@/g)||[],rows[1].match(/@[^@]+@/g)||[],`substitution ${key}`);
  }
 }
}
assert.equal(translated,165);
console.log('PASS 165 Simplified Chinese texts, gender selectors, substitutions and three HTML descriptions');
for(const enabled of [...ids.map(id=>[id]),ids]) {
 const runtime=new ModRuntime();
 for(const id of enabled){
  const manifest=read(`mods/${id}/manifest.json`);
  await runtime.loadManifest(`mods/${id}/manifest.json`,manifest);
  for(const relative of Object.values(manifest.assets)) {
   assert(!/\.png\.png$/i.test(relative));assert(fs.statSync(path.join(root,'public/mods',id,relative)).size>0);
  }
 }
 const ds=await runtime.applyTo(base);globalThis.__c2={ds};
 const gd=new GameData(ds,{storyMode:true,difficulty:2,character:null});
 for(const id of enabled)assert(ds.gamedata.originalDlcFeatures[id]);
 if(enabled.includes('welcome-to-games-of-honor'))assert(gd.Towns[84]);
 if(enabled.includes('special-story'))assert(gd.Towns[83]);
 assert.equal(gd.canBreakEconomy,enabled.includes('industrial-magnate'));
 console.log('PASS',enabled.join(', '));
}const {transpileAs3Fn}=load('src/game/Story.ts');
let count=0;
function compile(value){if(!value||typeof value!=='object')return;if(value.__as3fn){transpileAs3Fn(value.__as3fn);count++;}else for(const child of Object.values(value))compile(child);}
for(const id of ['special-story','welcome-to-games-of-honor'])compile(read(`mods/${id}/data/dialogues.json`));
const {ORIGINAL_DLC_HOOKS}=load('src/game/originalDlcHooks.ts');
for(const source of Object.values(ORIGINAL_DLC_HOOKS))transpileAs3Fn(source,['town','caravan']);
console.log('PASS original callback syntax:',count);
{
 const runtime=new ModRuntime();for(const id of ids)await runtime.loadManifest(`mods/${id}/manifest.json`,read(`mods/${id}/manifest.json`));
 const ds=await runtime.applyTo(base);globalThis.__c2={ds};
 const gd=new GameData(ds,{storyMode:true,difficulty:2,character:null});
 const {makeDialogueEnv,openOriginalDlcTown}=load('src/game/Story.ts');
 const env=makeDialogueEnv(gd,ds);let encounter;
 globalThis.__lastTranspileError=undefined;
 assert(openOriginalDlcTown(gd,ds,83,(...args)=>encounter=args));
 assert(encounter);assert(encounter[0].People.length>=6);
 assert(!globalThis.__lastTranspileError, String(globalThis.__lastTranspileError));
 console.log('PASS warehouse guard encounter');
}
{
 const runtime=new ModRuntime();await runtime.loadManifest('mods/special-story/manifest.json',read('mods/special-story/manifest.json'));
 const ds=await runtime.applyTo(base);globalThis.__c2={ds};const gd=new GameData(ds,{storyMode:true,difficulty:2,character:null});
 load('src/game/Story.ts').makeDialogueEnv(gd,ds);globalThis.__lastTranspileError=undefined;
 gd.parent.executeDLCFunction(2,'releaseDrekarSquad');
 assert(!globalThis.__lastTranspileError,String(globalThis.__lastTranspileError));assert(gd.npcCaravans.some(n=>n.specialPurpose===23));
console.log('PASS mission squad dispatch');
}
{
 const runtime=new ModRuntime();await runtime.loadManifest('mods/special-story/manifest.json',read('mods/special-story/manifest.json'));
 const ds=await runtime.applyTo(base);globalThis.__c2={ds};
 const {Story,makeDialogueEnv,transpileAs3Fn}=load('src/game/Story.ts');
 const {makeSave,applySave}=load('src/game/SaveSystem.ts');
 globalThis.__c2Story=Story;
 const gd=new GameData(ds,{storyMode:true,difficulty:2,character:null}),env=makeDialogueEnv(gd,ds);
 env.character=7;env.Story.dialogueDefaults[7]=297;
 assert.equal(transpileAs3Fn(ds.dialogues.responses[3380].conditions.__as3fn)(env),false);
 assert.equal(transpileAs3Fn(ds.dialogues.responses[3445].conditions.__as3fn)(env),true);
 env.Story.flags.additionalVariables.knowWhereFinnIs=true;gd.Towns[17].locations[5].visible=true;
 const save=makeSave(gd),loaded=new GameData(ds,{storyMode:true,difficulty:2,character:null});applySave(loaded,save);
 assert.equal(loaded.Towns[17].locations[5].visible,true);
 const legacy=JSON.parse(JSON.stringify(save));delete legacy.towns[17].locationVisibility;
 const migrated=new GameData(ds,{storyMode:true,difficulty:2,character:null});applySave(migrated,legacy);
 assert.equal(migrated.Towns[17].locations[5].visible,true);
 console.log('PASS current character branch + Finn visibility new/legacy save');
}
// Runtime transitions: syntax-only checks cannot detect a misspelled entry field.
{
 const runtime=new ModRuntime();for(const id of ids)await runtime.loadManifest(`mods/${id}/manifest.json`,read(`mods/${id}/manifest.json`));
 const ds=await runtime.applyTo(base);globalThis.__c2={ds};
 const {makeDialogueEnv}=load('src/game/Story.ts');
 for(const relation of [-1,0,1])for(const rid of [3379,3383,3444]){
  const gd=new GameData(ds,{storyMode:true,difficulty:2,character:null});const env=makeDialogueEnv(gd,ds);
  gd.getFactionRelations=()=>relation;let entry=188,refreshed=0;
  Object.defineProperty(env,'currentEntry',{get:()=>entry,set:v=>entry=v});env.__onRefresh=()=>refreshed++;
  env.Story.additionalVariables.askedKukulAboutFinn=true;
  const response=ds.dialogues.responses[rid];globalThis.__lastTranspileError=undefined;
  if(response.conditions)assert.equal(transpileAs3Fn(response.conditions.__as3fn)(env),true);
  transpileAs3Fn(response.actions.__as3fn)(env);
  assert.equal(entry,relation<0?2103:2104);assert.equal(refreshed,1);assert(!globalThis.__lastTranspileError);
  assert(ds.dialogues.entries[entry]);
 }
 let actions=0;
 for(const id of ['special-story','welcome-to-games-of-honor'])for(const [rid,response] of Object.entries(read(`mods/${id}/data/dialogues.json`).responses)){
  if(!response.actions)continue;
  const gd=new GameData(ds,{storyMode:true,difficulty:2,character:null});const env=makeDialogueEnv(gd,ds);
  env.currentEntry=188;env.Story.additionalVariables.sellCrowdfunderPrice=65000;
  let transitions=0;env.__onRefresh=env.__onLeave=env.__onWaitEffect=()=>transitions++;
  globalThis.__lastTranspileError=undefined;
  transpileAs3Fn(response.actions.__as3fn)(env);
  assert(!globalThis.__lastTranspileError,`${rid}: ${globalThis.__lastTranspileError}`);
  if(!response.value.goTo)assert(transitions>0,`${rid}: no transition`);
  assert(Number.isFinite(gd.Caravans[0].money),`${rid}: invalid money`);actions++;
 }
 console.log('PASS Finn branches (-1/0/+1) and DLC action runtime checks:',actions);
}
