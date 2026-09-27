// Development-only, disposable combat fixture. Never imports Shell or SaveSystem.
import { loadDataStore } from '../../../../src/core/DataStore';
import { ModRuntime } from '../../../../src/core/ModRuntime';
import { AssetStore } from '../../../../src/core/Assets';
import { Input } from '../../../../src/core/Input';
import { initSounds, setSoundFX } from '../../../../src/core/Sound';
import { GameData, Character } from '../../../../src/game/World';
import { getItemData } from '../../../../src/game/Economy';
import { Battle, type BattleUnit } from '../runtime/Battle';
import { worldToScreen } from '../runtime/BattleFieldView';
import type { DollAnim } from '../runtime/BattleDoll';
import type { RevivalDataStore } from '../runtime/Data';
import { loadZombieVisual, BATTLE_DIRECTIONS } from './zombie-battle-visual';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=el<HTMLCanvasElement>('stage'),ctx=canvas.getContext('2d')!;
const start=el<HTMLButtonElement>('start'),appearance=el<HTMLSelectElement>('appearance'),target=el<HTMLSelectElement>('target');
const status=el('status'),actors=el('actors'),history=el('history');
let battle:Battle|undefined,ready=false,starting=false;
const trace:string[]=[],last=new Map<BattleUnit,string>();
function log(s:string){trace.unshift(s);trace.length=Math.min(trace.length,16);history.textContent=trace.join('\n');}
function fail(e:unknown){el('error').textContent=String(e instanceof Error?e.stack:e);status.textContent='测试载入失败，详情见下方。';}
window.addEventListener('error',e=>fail(e.error??e.message));
window.addEventListener('unhandledrejection',e=>fail(e.reason));
new Input(canvas,()=>battle?.screen??null);
const nextFrame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()));
let previous=performance.now(),uiTime=0;
function frame(now:number){const dt=Math.min(.1,(now-previous)/1000);previous=now;
 if(battle){battle.update(dt);const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.setTransform(w/880,0,0,h/495,0,0);ctx.clearRect(0,0,880,495);battle.screen.render(ctx);
 uiTime+=dt;if(uiTime>.08){uiTime=0;const current=battle.order[battle.turnIdx];actors.textContent=battle.units.map(u=>{const a=(u as any).__doll as DollAnim|undefined;const phase=u.dead?'尸体':u.dying?'倒地':a?['待机','行走',u.name.includes('啃咬')?'啃咬':'攻击','受击','死亡'][a.phase]:'待机';const sig=phase+' / '+BATTLE_DIRECTIONS[a?.dir??0];if(last.get(u)!==sig){last.set(u,sig);log(u.name+'：'+sig);}return (u===current?'▶ ':'')+u.name+' · HP '+Math.ceil(u._HP)+'/'+u.maxHP+' · AP '+u.AP+' · 格子 '+u.squareX+','+u.squareY+' · '+sig;}).join('\n');
 if(ready&&battle.gameOver)status.textContent='战斗已结束，场内结算不写入存档；可重新开始。';
 else if(ready)status.textContent=(battle.paused?'已暂停':battle.phase==='player'?'你的回合':'敌方回合')+(battle.isBusy()?' · 动作执行中':' · 等待行动');}
 }
 const actionable=!!(ready&&battle&&!battle.gameOver&&!battle.paused&&!battle.isBusy()&&battle.phase==='player');document.querySelectorAll<HTMLButtonElement>('#commands button:not(#center),#hit,#kill').forEach(b=>b.disabled=!actionable);
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function current(){return battle?.order[battle.turnIdx];}
function command(fn:(b:Battle,u:BattleUnit)=>void){const b=battle,u=current();if(!ready||!b||!u||b.paused||b.gameOver||b.isBusy()||b.phase!=='player')return;fn(b,u);}
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-step]'))b.onclick=()=>command((battle,u)=>{const [dx,dy]=[[0,-1],[1,0],[0,1],[-1,0]][Number(b.dataset.step)];const p=worldToScreen((u.squareX+dx+.5)*32,(u.squareY+dy+.5)*32,battle.camX,battle.camY);if(battle.units.some(v=>!v.dead&&v.squareX===u.squareX+dx&&v.squareY===u.squareY+dy)){log("该方向格子被占用，请选择空地。");return;}const shift=battle.shiftPressed;try{battle.shiftPressed=true;battle.onFieldClick(p.x,p.y);}finally{battle.shiftPressed=shift;}});
el('attack').onclick=()=>command((b,u)=>{const enemy=b.units.filter(v=>v.side!==u.side&&!v.dead&&!v.dying).sort((a,c)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(c.x-u.x,c.y-u.y))[0];if(enemy)b.tryAttack(u,enemy);});
el('turn').onclick=()=>command(b=>b.endTurn());el('center').onclick=()=>battle?.centerViewOnCurrent();
for(const id of ['hit','kill'])el(id).onclick=()=>command((b)=>{const u=b.units[Number(target.value)];if(!u||u.dead||u.dying)return;log('测试注入：'+u.name+(id==='kill'?' 致命伤':' 10 伤害'));b.applyHit(u,id==='kill'?u._HP+1000:10,0,()=>{},false,undefined,true);});
el<HTMLInputElement>('sound').onchange=()=>setSoundFX(el<HTMLInputElement>('sound').checked);
window.addEventListener('pagehide',()=>battle?.destroy());
try{
 const mods=new ModRuntime();
 async function json(path:string){const r=await fetch('/mods/revival/'+path);if(!r.ok)throw Error(path+' HTTP '+r.status);return r.json();}
 const [manifest,skeleton,data]=await Promise.all([json('manifest.json'),json('data/battle_skeleton.json'),json('data/examples/zombie-battle.json')]);
 await mods.installPackage({manifest:{id:'revival-zombie-test',version:'1',enabled:true},data:{battleSkeleton:skeleton},assets:manifest.assets},new URL('/mods/revival/manifest.json',location.href).href);
 const ds=await loadDataStore(18,mods) as RevivalDataStore,assets=new AssetStore(ds);
 (globalThis as any).__c2={ds};(globalThis as any).__c2GetItemData=(id:number)=>getItemData(ds,id);
 initSounds(ds.manifest,(name,fallback)=>mods.resolveAsset(name,fallback));setSoundFX(false);
 const param=new URLSearchParams(location.search).get('project');
 const visual=await loadZombieVisual(param?(param.startsWith('/')?param:'/mods/revival/'+param):'/mods/revival/'+data.project);
 function character(spec:any,gun=false){const pistol=ds.items.Items.findIndex((it:any)=>it?.category===2&&it.subCategory===20),ammo=ds.items.Items.findIndex((it:any)=>it?.category===3&&ds.weapons.Ammo[it.subCategory]?.type===1);
 return new Character({name:spec.name,gender:1,category:1,age:30,_HP:spec.hp,_battleMorale:100,basePhysical:spec.physical,baseAgility:spec.agility,baseAccuracy:spec.accuracy,baseIntelligence:10,weapons:gun?[20,0]:[0,0],equipment:gun?[{type:pistol,amount:1,inUse:1},{type:ammo,amount:100,inUse:0}]:[],loadedAmmo:gun?[{type:ammo,amount:8,inUse:0},null]:[null,null],originalBodyType:1,originalHead:1,originalBackHairType:0,originalBeardType:0,skinColor:{r:190,g:150,b:120,bc:1},hairColor:{r:40,g:30,b:20,bc:1},shirtColor:{r:60,g:110,b:160,bc:1},pantsColor:{r:90,g:70,b:40,bc:1},shoesColor:{r:40,g:30,b:20,bc:1}});}
 async function reset(){if(starting)return;starting=true;ready=false;start.disabled=true;appearance.disabled=true;try{battle?.destroy();battle=undefined;last.clear();trace.length=0;el('error').textContent='';status.textContent='准备临时战场…';
 const human=appearance.value==='human',heroSpec={...data.player,name:human?data.player.name:'可控僵尸 · '+appearance.value};const gd=new GameData(ds,{difficulty:1,storyMode:false,character:character(heroSpec,human)} as any);gd.autoCenter=false;gd.walkAnimationSpeed=1;gd.showGrid=true;gd.Caravans[0].transports=[];
 // GameData auto-equips survival starter cargo. Replace that generated roster with our fixture.
 gd.Caravans[0].People.splice(0,gd.Caravans[0].People.length,character(heroSpec,human));gd.Caravans[0].People[0].neverPanic=true;
 battle=new Battle(gd,ds,assets,{onEnd:(win)=>{status.textContent=win?'测试战斗胜利，可重新开始':'测试战斗结束，可重新开始';log('真实战斗结算：'+(win?'胜利':'失败'));},onExitGame:()=>{battle!.paused=true;status.textContent='已停止，可重新开始';}}, {enemyPeople:data.zombies.map((s:any)=>character(s)),fixedObstacles:[],fieldWidth:data.fieldSize,fieldHeight:data.fieldSize,unitVisual:visual.unitVisual,unitAnimation:visual.unitAnimation});
 battle.paused=true;const specs=[heroSpec,...data.zombies];battle.units.forEach((u,i)=>{const spec=specs[i];if(!spec)throw Error('Unexpected fixture unit');u.squareX=spec.position[0];u.squareY=spec.position[1];u.x=(u.squareX+.5)*32;u.y=(u.squareY+.5)*32;u._HP=u.maxHP=spec.hp;u.battleMorale=100;if(i>0||!human)visual.bind(u,i===0?appearance.value:spec.attack);});
 target.replaceChildren(...battle.units.map((u,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=u.name;return o;}));target.value='1';
 battle.centerOnCell(heroSpec.position[0]+1,heroSpec.position[1]+1,true);battle.fieldView.positionUnits(0,0);
 const since=performance.now();while((battle as any).loadingOverlay?.visible){if(performance.now()-since>60000)throw Error('战斗资源载入超时');await nextFrame();}
 battle.paused=false;ready=true;log('临时战场已开始；未读写存档。');start.textContent='重新开始';
 }catch(e){fail(e);}finally{starting=false;start.disabled=false;appearance.disabled=false;}}
 start.onclick=()=>void reset();start.textContent='开始临时战斗';start.disabled=false;status.textContent='资源就绪，选择角色后点击开始。';
}catch(e){fail(e);}
