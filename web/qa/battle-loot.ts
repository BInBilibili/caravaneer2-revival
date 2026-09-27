// Save-free browser fixture; controls call the production transfer/settlement code.
import { loadDataStore } from '../src/core/DataStore';
import { AssetStore } from '../src/core/Assets';
import { Input } from '../src/core/Input';
import { GameData, Character } from '../src/game/World';
import { TradeWindow } from '../src/game/TradeWindow';
import { getItemData } from '../src/game/Economy';
const canvas=document.querySelector<HTMLCanvasElement>('#stage')!,ctx=canvas.getContext('2d')!;
const state=document.querySelector('#state')!,errors=document.querySelector('#errors')!;
window.addEventListener('error',e=>errors.textContent+=String(e.error?.stack??e.message));
window.addEventListener('unhandledrejection',e=>errors.textContent+=String(e.reason));
const ds=await loadDataStore(18),assets=new AssetStore(ds);await assets.loadFonts();
(globalThis as any).__c2={ds};(globalThis as any).__c2GetItemData=(id:number)=>getItemData(ds,id);
const bottle=ds.items.Items.findIndex((it:any)=>it?.category===1 && ds.items.Goods[it.subCategory]?.liquidsContainer && ds.items.Goods[it.subCategory]?.weight===.35);
const water=ds.items.Items.findIndex((it:any)=>it?.category===1 && ds.items.Goods[it.subCategory]?.liquid && ds.items.Goods[it.subCategory]?.water);
let gd:GameData,t:TradeWindow,loot:Map<number,number>;
function reset(liquid=false){gd=new GameData(ds,{difficulty:1,storyMode:false,character:new Character({name:'载重测试队员',basePhysical:10,baseAgility:10,gender:1,age:30})} as any);const c=gd.Caravans[0];c.cargo=new Map();c.money=100;if(liquid)c.cargo.set(bottle,1);loot=liquid?new Map([[water>0?water:1,3]]):new Map([[bottle,2],[97,100]]);t=new TradeWindow(gd,ds,assets,()=>{});t.showLoot(loot,'战利品载重测试',()=>{});}
reset();new Input(canvas,()=>t.screen);
function move(id:number,n:number){const a=t as any;const e=a.sides[1].array.find((x:any)=>x.type===id);if(e)a.doMove(1,e,n);}
const actions:Record<string,()=>void>={reset:()=>reset(),bottle:()=>move(bottle,1),cash:()=>move(97,10),clear:()=>(t as any).pressClear(),confirm:()=>(t as any).doBarter(),liquid:()=>{reset(true);(t as any).takeAll();}};
for(const [id,f] of Object.entries(actions))document.getElementById(id)!.onclick=f;
function frame(){t.updateFrame(.04);t.updateCursor();ctx.clearRect(0,0,880,495);t.screen.render(ctx);const c=gd.Caravans[0],a=t as any;state.textContent='玩家货物 kg：'+c.totalCargo+' | 现金：'+c.money+' | 选中物品 kg：'+a.totalWeight(a.sides[1].items)+' | 对话框：'+t.dialogVisible+'\n底部文字：'+a.bottomCapacity.text+'\n剩余战利品：'+JSON.stringify([...loot])+'\n玩家货物：'+JSON.stringify([...c.cargo]);requestAnimationFrame(frame);}requestAnimationFrame(frame);
