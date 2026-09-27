// Save-free, bounded browser fixture. All timing calls invoke the production renderers.
import { loadDataStore } from '../../../../src/core/DataStore';
import { ModRuntime } from '../../../../src/core/ModRuntime';
import { AssetStore } from '../../../../src/core/Assets';
import { setSoundFX } from '../../../../src/core/Sound';
import { GameData, Character } from '../../../../src/game/World';
import { getItemData } from '../../../../src/game/Economy';
import { Battle as LegacyBattle } from '../../../../src/game/Battle';
import { Battle as RevivalBattle } from '../runtime/Battle';
import * as legacy from '../../../../src/game/BattleDoll';
import * as revival from '../runtime/BattleDoll';
import type { RevivalDataStore } from '../runtime/Data';
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const ctx = canvas.getContext('2d')!;
const status = document.querySelector('#status')!;
const results = document.querySelector('#results')!;
const errors = document.querySelector('#errors')!;
const start = document.querySelector<HTMLButtonElement>('#start')!;
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const fail = (e: unknown) => { errors.textContent += String(e instanceof Error ? e.stack : e)+'\n'; };
window.addEventListener('error', e => fail(e.error ?? e.message));
window.addEventListener('unhandledrejection', e => fail(e.reason));
const mods = new ModRuntime();
const manifest = await (await fetch('mods/revival/manifest.json')).json();
const skeleton = await (await fetch('mods/revival/data/battle_skeleton.json')).json();
await mods.installPackage({ manifest: { id:'revival-performance', version:'1', enabled:true }, data:{ battleSkeleton:skeleton }, assets:manifest.assets }, new URL('mods/revival/manifest.json', document.baseURI).href);
const ds = await loadDataStore(18, mods) as RevivalDataStore;
const assets = new AssetStore(ds);
(globalThis as any).__c2 = { ds };
(globalThis as any).__c2GetItemData = (id:number) => getItemData(ds,id);
setSoundFX(false);
const pistol = ds.items.Items.findIndex((it:any) => it?.category===2 && it.subCategory===20);
const ammo = ds.items.Items.findIndex((it:any) => it?.category===3 && ds.weapons.Ammo[it.subCategory]?.type===1);
function hero(i:number) {
  return new Character({ name:'QA '+i, gender:1, category:1, age:30, _HP:200, _battleMorale:70,
    basePhysical:10, baseAgility:15, baseAccuracy:15, baseIntelligence:10,
    weapons:[20,0], equipment:[{type:pistol,amount:1,inUse:1},{type:ammo,amount:100,inUse:0}],
    loadedAmmo:[{type:ammo,amount:8,inUse:0},null], originalBodyType:1, originalHead:1,
    originalBackHairType:0, originalBeardType:0,
    skinColor:{r:190,g:150,b:120,bc:1}, hairColor:{r:40,g:30,b:20,bc:1},
    shirtColor:{r:60+i*3,g:110,b:160,bc:1}, pantsColor:{r:90,g:70,b:40,bc:1}, shoesColor:{r:40,g:30,b:20,bc:1} });
}
let seed = 0;
function deterministic<T>(fn:()=>T):T {
  const saved = Math.random; seed=123456789;
  Math.random = () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  try { return fn(); } finally { Math.random=saved; }
}
type Scene = { name:string; battle:LegacyBattle | RevivalBattle; driver:typeof legacy | typeof revival; phase:number; step:number };
function make(name:string, Class:typeof LegacyBattle | typeof RevivalBattle, driver:typeof legacy | typeof revival):Scene {
  const gd = deterministic(() => new GameData(ds,{ difficulty:1, storyMode:false, character:hero(0) } as any));
  gd.autoCenter=false; gd.walkAnimationSpeed=1; gd.showGrid=false;
  const caravan=gd.Caravans[0]; caravan.transports=[];
  for(let i=1;i<12;i++) caravan.addPerson(hero(i));
  const battle = deterministic(() => new Class(gd,ds,assets,{onEnd:()=>{}},{enemyPeople:Array.from({length:12},(_,i)=>hero(i+12)),fixedObstacles:[], maxRange:15}));
  battle.paused=true; // No AI, input commands, sound or save loop in this fixture.
  battle.camX=0; battle.camY=0;
  battle.units.forEach((u,i) => {
    // Deterministic world positions, same scale in both pipelines.
    u.x=310+(i%6)*45+Math.floor(i/6)*45; u.y=540-(i%6)*45+Math.floor(i/6)*45;
    u.squareX=Math.floor(u.x/32); u.squareY=Math.floor(u.y/32);
    (u as any).__doll = driver.newDollAnim(driver.weaponAnimType(ds.weapons,20),20,i%4);
  });
  return {name,battle,driver,phase:0,step:0};
}
const scenes=[make('base-original',LegacyBattle,legacy),make('revival',RevivalBattle,revival)];
try {
  const since=performance.now();
  while(scenes.some(s=>(s.battle as any).loadingOverlay?.visible)) {
    if(performance.now()-since>60000) throw new Error('Battle asset loading timeout');
    await nextFrame();
  }
  start.disabled=false; status.textContent='Ready: 24 units per pipeline. Click to benchmark.';
} catch(e) { fail(e); }
function prepare(scene:Scene,phase:number) {
  scene.phase=phase; scene.step=0;
  scene.battle.units.forEach((u,i)=>{
    const a=(u as any).__doll;
    Object.assign(a,scene.driver.newDollAnim(scene.driver.weaponAnimType(ds.weapons,20),20,i%4));
    a.phase=phase; a.frame=1; a.done=false;
  });
}
// Match exact original frame inputs, independent of the different drivers' historical timings.
// This schedules poses for the renderer; it is deliberately NOT a gameplay simulation benchmark.
function tick(scene:Scene) {
  scene.step++;
  for(const u of scene.battle.units) {
    const a=(u as any).__doll;
    const length=ds.battleDoll!.fullAnimationTypeFrames[a.animType][scene.phase].length;
    a.phase=scene.phase; a.frame=1+(scene.step % length); a.playback=undefined;
  }
}
function pose(scene:Scene) { scene.battle.fieldView.positionUnits(0,0); }
function draw(scene:Scene) {
  ctx.clearRect(0,0,880,495);
  scene.battle.fieldView.shadowLayer.render(ctx);
  scene.battle.fieldView.unitLayer.render(ctx);
}
function checkReady(scene:Scene) {
  const entries = (scene.battle.fieldView as any).dolls;
  if(scene.battle.units.length!==24) throw new Error('Fixture must have 24 units');
  for(const u of scene.battle.units) if(!entries.get(u)?.cv) throw new Error('Missing body pose: '+u.name);
  if(scene.battle.fieldView.shadowLayer.children.length!==24) throw new Error('Missing shadow');
}
function summary(values:number[]) {
  const sorted=[...values].sort((a,b)=>a-b);
  return {p50:sorted[Math.ceil(sorted.length*.5)-1],p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1)};
}
// Paired AB/BA blocks reduce order bias; timer batching resolves sub-millisecond stages.
start.addEventListener('click', async()=>{
  start.disabled=true; results.textContent=''; errors.textContent='';
  const report:any={ date:new Date().toISOString(), userAgent:navigator.userAgent, dpr:devicePixelRatio,
    units:24, seed:123456789, pixels:[880,495], batches:40, repeats:8,
    scope:'Animation-only CPU/Canvas-submit timings, not complete battle FPS, GPU completion, AI, or pathfinding', rows:[] };
  try {
    for(const [phase,label] of [[0,'idle'],[1,'walk'],[2,'shoot'],[3,'hit']] as const) {
      status.textContent='Warmup: '+label;
      for(const scene of scenes) {
        prepare(scene,phase);
        for(let i=0;i<90;i++) { tick(scene);pose(scene);draw(scene);if(i%15===0)await nextFrame(); }
        checkReady(scene);
      }
      for(const changing of [false,true]) {
        for(const scene of scenes) { prepare(scene,phase); pose(scene); }
        const buckets=scenes.map(()=>({ schedule:[] as number[], pose:[] as number[], canvas:[] as number[], total:[] as number[] }));
        for(let block=0;block<40;block++) {
          status.textContent=label+' / '+(changing?'changing':'held')+' / '+(block+1)+'/40';
          await nextFrame();
          for(const index of block%2?[1,0]:[0,1]) {
            const scene=scenes[index], sums={schedule:0,pose:0,canvas:0,total:0};
            for(let j=0;j<8;j++) {
              const t0=performance.now();if(changing)tick(scene);const t1=performance.now();
              pose(scene);const t2=performance.now();draw(scene);const t3=performance.now();
              sums.schedule+=t1-t0;sums.pose+=t2-t1;sums.canvas+=t3-t2;sums.total+=t3-t0;
            }
            for(const key of ['schedule','pose','canvas','total'] as const) buckets[index][key].push(sums[key]/8);
          }
        }
        scenes.forEach((scene,index)=>report.rows.push({runtime:scene.name,action:label,mode:changing?'changing':'held',
          ...Object.fromEntries(Object.entries(buckets[index]).map(([key,v])=>[key,summary(v)]))}));
        results.textContent=JSON.stringify(report,null,2);
      }
    }
    status.textContent='PASS: paired 24-unit animation benchmark complete. Timings are CPU submission only.';
  } catch(e) {fail(e);status.textContent='FAIL';} finally {start.disabled=false;}
});
window.addEventListener('pagehide',()=>scenes.forEach(s=>s.battle.destroy()));
