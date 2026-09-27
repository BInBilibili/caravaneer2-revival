// Minimal integration of the actual bundled loader and Shell factory. No saves.
import bundledRuntimes from 'virtual:bundled-mod-runtimes';
import { ModRuntime } from '../../../../src/core/ModRuntime';
import { loadDataStore } from '../../../../src/core/DataStore';
import { AssetStore } from '../../../../src/core/Assets';
import { Input } from '../../../../src/core/Input';
import { Character, GameData } from '../../../../src/game/World';
import { GameShell } from '../../../../src/game/Shell';
import { Battle as BaseBattle } from '../../../../src/game/Battle';
const state = document.querySelector('#state')!, errors = document.querySelector('#errors')!;
window.addEventListener('error', e => errors.textContent += String(e.error?.stack ?? e.message));
window.addEventListener('unhandledrejection', e => errors.textContent += String(e.reason?.stack ?? e.reason));
const enabled = new URLSearchParams(location.search).get('enabled') !== '0';
let runtimeLoads = 0;
const mods = new ModRuntime({bundledRuntimes: bundledRuntimes.map(entry => ({...entry,
 manifestUrl: new URL(entry.manifestUrl, document.baseURI).href,
 load: async () => { runtimeLoads++; return entry.load(); }
}))});
const manifestURL = new URL('mods/revival/manifest.json', document.baseURI).href;
const manifest = await (await fetch(manifestURL)).json();
await mods.loadManifest(manifestURL, {...manifest, enabled});
const ds = await loadDataStore(18, mods), assets = new AssetStore(ds);
(globalThis as any).__c2 = {ds};
await assets.loadFonts();
const hero = new Character({name:'验证队长',gender:1,age:30,basePhysical:10,baseAgility:10,baseAccuracy:10,baseIntelligence:10,_HP:100});
const gd = new GameData(ds,{storyMode:false,difficulty:1,character:hero} as any);
// Invoke production factory without opening title/config/save UI.
const shell:any = Object.assign(Object.create(GameShell.prototype), {ds, assets, mods});
const battle = shell.createBattle(gd, {onEnd:()=>{}}, {enemyCount:1,enemyName:'验证敌人',maxRange:10});
const canvas=document.querySelector<HTMLCanvasElement>('#stage')!, ctx=canvas.getContext('2d')!;
new Input(canvas,()=>battle.screen);
function draw(){
 battle.update(0);
 ctx.clearRect(0,0,880,495);
 battle.screen.render(ctx);
 const resources = performance.getEntriesByType('resource').map(r=>r.name);
 const compactRequests = resources.filter(url=>url.includes('BattlePacked')).length;
 state.textContent = JSON.stringify({enabled,loaded:mods.has('revival'),runtimeLoads,
 provider:mods.service('battle.animationRuntime')??null,skeleton:!!(ds as any).battleSkeleton,
 baseBattle:battle instanceof BaseBattle,units:battle.units.length,
 loading:!!battle.loadingOverlay?.visible,compactRequests,
 skeletonRequests:resources.filter(url=>url.includes('battle_skeleton.json')).length},null,2);
 requestAnimationFrame(draw);
}
draw();
