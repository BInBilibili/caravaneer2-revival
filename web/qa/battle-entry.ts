// Minimal real-browser entry check. In-memory SaveSlots; never accesses user saves.
import { loadDataStore } from '../src/core/DataStore';
import { AssetStore } from '../src/core/Assets';
import { Sprite } from '../src/core/Display';
import { Input } from '../src/core/Input';
import { GameData, Character } from '../src/game/World';
import { GameShell } from '../src/game/Shell';
import { makeSave } from '../src/game/SaveSystem';
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!, ctx = canvas.getContext('2d')!;
const status = document.querySelector('#state')!, errors = document.querySelector('#errors')!;
window.addEventListener('error', e => errors.textContent += String(e.error?.stack ?? e.message) + '\n');
window.addEventListener('unhandledrejection', e => errors.textContent += String(e.reason?.stack ?? e.reason) + '\n');
const ds = await loadDataStore(18), assets = new AssetStore(ds);
(globalThis as any).__c2 = { ds };
await assets.loadFonts();
await Promise.all(Object.keys(ds.manifest.images).filter(n => /Button|InterfaceBackground/.test(n)).map(n => assets.ensure(n)));
const hero = new Character({name:'读档验证队长',gender:1,age:30,basePhysical:10,baseAgility:10,baseAccuracy:10,baseIntelligence:10,_HP:100});
const original = new GameData(ds, { storyMode:false, difficulty:1, character:hero } as any);
const save = makeSave(original);
// Avoid the Shell constructor's title/config storage. All tested methods are production methods.
const shell:any = Object.assign(Object.create(GameShell.prototype), { ds, assets, canvas, language:18,
  currentScreen:new Sprite(), gd:null, battle:null, mapMode:null, gdScreen:null, saveSlots:{load:()=>structuredClone(save)},
  createMapMode:()=>({screen:new Sprite(),active:true,battleInProgress:false}),
});
(globalThis as any).__c2.shell = shell;
// Real enterGdMode, doGameLoad, encounter menu hooks, setMode and Battle constructor.
new Input(canvas,()=>shell.currentScreen);
function load(existing=false) {
  shell.battle?.destroy(); shell.battle=null;
  if(!existing)shell.gd=null;
  shell.doGameLoad(0);
  const npc={name:'入口验证敌人',faction:1,x:shell.gd.Caravans[0].x,y:shell.gd.Caravans[0].y+1,
    People:[new Character({name:'验证敌人',gender:1,age:30,basePhysical:5,baseAgility:5,baseAccuracy:5,baseIntelligence:5,_HP:60})]};
  shell.gd.affectFactionRelations(-100,1,0);
  shell.mapMode.battleInProgress=true;shell.openEncounter(npc,undefined,undefined,true);
}
document.querySelector('#load')!.addEventListener('click',()=>load());
document.querySelector('#reload')!.addEventListener('click',()=>load(true));
function draw(){
  ctx.clearRect(0,0,880,495);shell.currentScreen.render(ctx);
  status.textContent=shell.gd ? '模式回调：'+typeof shell.gd.onSetMode+' | 战斗：'+!!shell.battle+
    ' | 战斗已挂载：'+!!(shell.battle?.screen.parent===shell.currentScreen)+' | 遭遇可见：'+!!shell.encounterMenu?.visible+
    ' | 角色数量：'+(shell.battle?.units.length??0)+' | '+(shell.battle?.loadingOverlay?.visible?'贴图加载中':'就绪') : '就绪，请从标题读档';
  requestAnimationFrame(draw);
}
draw();
