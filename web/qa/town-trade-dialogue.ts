// Focused follow-up checks. All saves use a plain in-memory store; never instantiate SharedObject/GameShell.
import {loadDataStore,getText} from '../src/core/DataStore';
import {AssetStore} from '../src/core/Assets';
import {Sprite,DisplayObject,BitmapObject,Graphics} from '../src/core/Display';
import {EngineText} from '../src/core/EngineText';
import {Input} from '../src/core/Input';
import {Button,ScrollableArea} from '../src/core/Ui';
import {CalculatorPanel} from '../src/core/CalculatorPanel';
import {initSounds,setSoundFX,setMusicOn,registerMusic,setMusicMode,startMusic,updateMusic,musicStatus} from '../src/core/Sound';
import {GameData,Character} from '../src/game/World';
import {Story,transpileAs3Fn} from '../src/game/Story';
import {getItemData,itemName} from '../src/game/Economy';
import {TradeWindow} from '../src/game/TradeWindow';
import {TownMode} from '../src/game/TownMode';
import {CaravanMenu} from '../src/game/CaravanMenu';
import {DialogueScreen} from '../src/game/DialogueScreen';
import {LoadSaveDialogue} from '../src/game/LoadSaveDialogue';
import {MapMode} from '../src/game/MapMode';
import {NavigationScreen} from '../src/game/NavigationScreen';
import {GameShell as Shell} from '../src/game/Shell';
import {makeSave,applySave,SaveSlots} from '../src/game/SaveSystem';
import {discoverVisibleTowns} from '../src/game/TownVisibility';
import {locationSymbolParts,attachLocationSymbol} from '../src/game/LocationSymbols';
const canvas=document.querySelector<HTMLCanvasElement>('#stage')!,ctx=canvas.getContext('2d')!;
const state=document.querySelector('#state')!,results=document.querySelector('#results')!,errors=document.querySelector('#errors')!;
window.addEventListener('error',e=>errors.textContent+=String(e.error?.stack??e.message)+'\n');
window.addEventListener('unhandledrejection',e=>errors.textContent+=String(e.reason?.stack??e.reason)+'\n');
const ds=await loadDataStore(18),assets=new AssetStore(ds);
(globalThis as any).__c2={ds};(globalThis as any).__c2Story=Story;(globalThis as any).__c2GetItemData=(id:number)=>getItemData(ds,id);
initSounds(ds.manifest);setSoundFX(false);setMusicOn(false);await assets.loadFonts();
const iconNames=[...new Set(Array.from({length:34},(_,i)=>locationSymbolParts(i+1)).flat().map(p=>'filtericon'+p.name+'.png'))];
await Promise.all(['InterfaceBackground.png','InterfaceForeground.png','TownBG.jpg','MapBG.png','GenericBackground.png','CaravanMenuCategoryButton.png','CaravanMenuCategoryButtonShine.png','Dialogue3.png',...iconNames,...[1,2,3,4,5,6].flatMap(i=>['Up','Down'].map(s=>'InterfaceButton'+i+s+'.png'))].map(n=>assets.ensure(n)));
let gd:GameData,screen=new Sprite(),map:any=null,nav:any=null,menu:any=null,town:any=null,dialogue:any=null,saveUI:LoadSaveDialogue|null=null,shell:any=null,scene='';
let musicRun=false,modal:Sprite|null=null;
const noop=()=>{},near=(a:number,b:number)=>Math.abs(a-b)<1e-7;
const assert=(ok:unknown,msg:string)=>{if(!ok)throw Error(msg);};
const descendants=(s:Sprite):DisplayObject[]=>s.children.flatMap(ch=>ch instanceof Sprite?[ch,...descendants(ch)]:[ch]);
const texts=(s:Sprite)=>descendants(s).filter(n=>n instanceof EngineText) as EngineText[];
const globalAt=(node:DisplayObject,x=10,y=10)=>{for(let n:DisplayObject|null=node;n;n=n.parent){x=x*n.scaleX+n.x;y=y*n.scaleY+n.y;}return{x,y};};
function pointer(type:string,x:number,y:number){const r=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent(type,{clientX:r.left+x/880*r.width,clientY:r.top+y/495*r.height,pointerId:99,bubbles:true,buttons:type==='pointerup'?0:1}));}
function clickAt(x:number,y:number){pointer('pointermove',x,y);pointer('pointerdown',x,y);pointer('pointerup',x,y);}
function clickNode(node:DisplayObject,x=10,y=10){const p=globalAt(node,x,y);assert(screen.hitTestPoint(p.x,p.y)===node,'hit misses '+node.constructor.name+' '+p.x+','+p.y);clickAt(p.x,p.y);}
function button(parent:Sprite,label:string){const b=descendants(parent).find(n=>n instanceof Button&&texts(n).some(t=>t.text===label));assert(b,'button missing '+label);return b!;}
function reset(){map?.destroy();nav?.destroy();saveUI?.close();map=nav=menu=town=dialogue=shell=saveUI=null;musicRun=false;setMusicOn(false);Input.drag=null;
 gd=new GameData(ds,{storyMode:true,difficulty:1,character:null});(globalThis as any).__c2.shell={gd};gd.story=new Story(ds);gd.gameSpeed=0;gd.autoSave=false;gd.npcCaravans=[];gd.spawnNpcCaravans=noop;
 const c=gd.Caravans[0];c.moving=false;c.hunt=c.collectForage=false;c.cargo.clear();c.inUse={};c.transports=[];c.liquidContainerAssignments={};
 c.People=[new Character({name:'内存测试队长',category:1,basePhysical:10,baseAgility:10,baseAccuracy:10,_HP:200})];c.money=1000000;screen=new Sprite();return c;}
const gun=ds.items.Items.findIndex((it:any,i:number)=>it?.category===2&&itemName(ds,i).includes('P08'));
const bottle=ds.items.Items.findIndex((it:any,i:number)=>it?.category===1&&getItemData(ds,i)?.liquidsContainer);
const food=ds.items.Items.findIndex((it:any,i:number)=>it?.category===1&&getItemData(ds,i)?.divisible&&!getItemData(ds,i)?.liquid&&getItemData(ds,i)?.food);
function tradeSample(stock=12.037){const c=reset();scene='小数交易';c.cargo.set(gun,1);c.People[0].equipment=[{type:gun,amount:1,inUse:1}];c.inUse[gun]=1;c.cargo.set(food,6.02);const t=gd.Towns[16];t.stock=new Map([[food,stock],[gun,1]]);const tr:any=new TradeWindow(gd,ds,assets,noop);tr.show(t,{category:1,subCategory:1,margin:1.2});screen.addChild(tr.screen);return tr;}
function industrySample(){reset();scene='产业／你的事业';const t=gd.Towns[16];t.playersStorageSpace=1000;t.playersStorage=[{type:food,amount:1.25}];town=new TownMode(gd,t,ds,assets,{onExitToMap:noop,onOpenCaravanMenu:noop,onOpenNavigation:noop});screen.addChild(town.screen);town.industriesTab='players';town.onMenuButton(3);return t;}
function containerSample(){const c=reset();scene='容器倒液体';c.cargo.set(bottle,1);c.cargo.set(1,.6);gd.lastCaravanMenuCategory=0;menu=new CaravanMenu(gd,ds,assets,{onClose:noop,onSave:noop,onOptions:noop});screen.addChild(menu.screen);menu.openManageContainers();menu.containerDraft[1]=[];menu.containerDraft[-1]=[{type:bottle,amount:1}];menu.approveContainers();return c;}
function dialogueSample(){reset();scene='克里克特对话';dialogue=new DialogueScreen(gd,ds,assets,noop);screen.addChild(dialogue.screen);dialogue.start(3,299);return dialogue;}
function townSample(){reset();scene='希罗斯镇设施';town=new TownMode(gd,gd.Towns[16],ds,assets,{onExitToMap:noop,onOpenCaravanMenu:noop,onOpenNavigation:noop});screen.addChild(town.screen);return town;}
function atlasSample(){reset();scene='原版设施图标 1–34';const g=new Graphics();g.beginFill(0xc1b998);g.drawRect(0,0,880,495);screen.graphics=g;for(let id=1;id<=34;id++){const x=65+((id-1)%9)*95,y=60+Math.floor((id-1)/9)*110;attachLocationSymbol(screen,locationSymbolParts(id),assets,x,y);screen.addChild(new EngineText(String(id),0,14,'center',x-40,y+30,80,22));}}
function saveSample(){reset();scene='原版存档页（内存）';const store:any={data:{saves:[]},flush:noop};const slots=new SaveSlots(store);['asuz','2026-07-24 22:24','主角','主角-贩药','test'].forEach((name,i)=>slots.save(gd,i*2,name));let loaded=-1;saveUI=new LoadSaveDialogue(ds,assets,slots,{onSave:(i,n)=>slots.save(gd,i,n),onLoad:i=>{loaded=i;},onDelete:i=>{slots.deleteSlot(i);saveUI!.refresh('save');},onClose:noop,onImport:noop,onExport:noop});screen.addChild(saveUI.screen);saveUI.show('save');return{store,slots,getLoaded:()=>loaded};}
function mapSample(){const c=reset();scene='世界地图／离镇';c.x=gd.Towns[16].x;c.y=gd.Towns[16].y;gd.story.flags.enteredBunkerForTheFirstTime=true;
 shell=Object.assign(Object.create(Shell.prototype),{gd,ds,assets,canvas,currentScreen:screen,screenNum:4,gdScreen:'map',lastTownId:16,toastTime:0});(globalThis as any).__c2.shell=shell;
 map=new MapMode(gd,ds,assets,{isInputBlocked:()=>shell.worldFrozen(),onEnterTown:noop,onOpenMenu:noop,onEncounter:noop,onNpcCaravan:noop,onNotify:noop,onAutoSave:noop});shell.mapMode=map;screen.addChild(map.screen);map.update(0);return c;}
function navigationSample(){mapSample();scene='发现城镇／导航';gd.Towns[15].discovered=gd.Towns[17].discovered=true;gd.mapCenterX=gd.Towns[16].x;gd.mapCenterY=gd.Towns[16].y;gd.mapScale=2;nav=new NavigationScreen(gd,ds,assets,noop);screen.addChild(nav.screen);}
const checks:Array<[string,()=>void|Promise<void>]>=[
 ['小数交易：MAX、尾数、数量守恒、真实载重与装备保护',()=>{
  const tr=tradeSample(),c=gd.Caravans[0],t=gd.Towns[16];assert(food>0&&gun>0,'test commodities');assert(!tr.sides[0].array.some((e:any)=>e.type===gun),'equipped gun excluded');
  const e=tr.sides[0].array.find((e:any)=>e.type===food);tr.takeItem(0,e);assert(tr.calcPanel.visible&&tr.calcPanel.v===1,'calculator starts at one');tr.calcPanel.setValue(.02);assert(tr.calcPanel.indicator.digits.some((d:any)=>d.segs[7].visible),'decimal point visible');
  tr.calcPanel.press('MAX');assert(near(tr.calcPanel.v,6.02),'MAX shows fractional stock');tr.calcPanel.press('OK');assert(near(c.cargoAmount(food),0)&&near(t.stock.get(food)!,18.057),'MAX exact, no inventory tail');
  tr.returnItem(0,0,6.02);assert(near(c.cargoAmount(food),6.02)&&near(t.stock.get(food)!,12.037),'return conserves fractional amounts');
  for(const amount of [.02,.007,1.037,0.1+0.2]){t.stock=new Map([[food,amount]]);tr.show(t,{category:1,subCategory:1,margin:1.2});let before=c.cargoAmount(food);for(let i=0;i<3;i++){const row=tr.sides[1].array.find((e:any)=>e.type===food);if(row)tr.takeItem(1,row);}assert(!tr.sides[1].array.some((e:any)=>e.type===food),'tail transferred '+amount);assert(near(c.cargoAmount(food)-before,amount),'quantity conserved '+amount);assert(!tr.problemDisplay.visible&&c.totalCargo<c.maxCargo,'not falsely overweight '+amount);}
  const calc:any=new CalculatorPanel(assets,id=>getText(ds,id));calc.open(screen,.1,6.02,noop);calc.press('5');assert(calc.v===5,'first numeric key replaces opening value');calc.press('2');assert(calc.v===52,'second key appends');calc.press('MIN');assert(calc.v===.1,'MIN');calc.close();
 }],
 ['产业／容器／金额：仓库可开、标签不透明、完整倒液提示、货币不单独换行',()=>{
  industrySample();const tabs=descendants(town.screen).filter(n=>n instanceof Sprite&&texts(n).some(t=>t.text===getText(ds,1307).toUpperCase()));
  pointer('pointermove',320,76);assert(tabs.every(n=>n.alpha===1),'no hover transparency');clickAt(330,121);assert(town.tradeWindow.screen.visible&&town.screen.children.at(-1)===town.tradeWindow.screen,'open storage actually visible and topmost');assert(town.tradeWindow.free&&town.tradeWindow.sides[1].array.some((e:any)=>e.type===food),'correct private storage');
  const c=containerSample(),msg=menu.fleetConfirm.text.text;assert(!/@\w+@/.test(msg)&&msg.includes('0.6')&&msg.includes(getText(ds,11))&&msg.includes(itemName(ds,1))&&msg.includes(getText(ds,1226).toUpperCase()),'liquid template expanded');clickNode(menu.fleetConfirm.cancelButton);assert(near(c.cargoAmount(1),.6),'cancel does not spill');menu.approveContainers();clickNode(menu.fleetConfirm.approveButton);assert(near(c.cargoAmount(1),0),'approval spills only excess');
  const paragraph:any=new EngineText('他们只有963.72 €。\n接受比应得少19429.68 €的交易？',0,14,'center',0,0,200,80,true,true);assert(paragraph.lines.every((l:string)=>!l.trim().startsWith('€')),'currency kept with amount');assert(paragraph.lines.some((l:string)=>l.includes('963.72 €')),'complete first amount');const blank=new EngineText('A\n\nB\n\n',0,14,'left',0,0,200,null,true,true);assert(blank.textHeight===5*19,'explicit empty paragraphs kept');
 }],
 ['对话：1984 回调编译、隐藏交易／医生入口、返回、等待与任务变量',()=>{
  let count=0;for(const group of [ds.dialogues.entries,ds.dialogues.responses])for(const value of Object.values(group))for(const v of Object.values(value as any))if((v as any)?.__as3fn){transpileAs3Fn((v as any).__as3fn);count++;}assert(count===1984,'all callbacks compiled');
  const d=dialogueSample();delete (globalThis as any).__lastTranspileError;const visible=gd.Towns[16].locations[1].visible;d.respond(542,ds.dialogues.responses['542']);assert(d.tradeWindow.screen.visible&&d.screen.visible,'Cricket trade opens without ending dialogue');assert(gd.Towns[16].locations[1].visible===visible,'hidden market not unlocked');assert(d.currentEntry===299,'return entry preserved');assert((d.tradeWindow as any).currentSymbolParts()[0]?.name==='people','dialogue partner uses people symbol, not shop icon');clickNode(button(d.tradeWindow.screen,getText(ds,1344).toUpperCase()));assert(!d.tradeWindow.screen.visible&&d.screen.visible&&d.currentEntry===299,'trade closes back to dialogue');
  for(const [rid,cat]of [[514,1],[530,2]]){d.respond(rid,ds.dialogues.responses[String(rid)]);assert(d.healingFacility.screen.visible&&d.healingFacility.healCat===cat,'hidden healer '+cat);clickNode(button(d.healingFacility.screen,getText(ds,902).toUpperCase()));}
  d.respond(0,{value:{goTo:0},actions:{__as3fn:'function(param1:*):* { var env:* = param1; with(env) { refresh(); } return arguments.callee; }'}});assert(d.screen.visible,'goTo zero is not leave');d.doWait(299);d.update(19/25);assert(d.waitPending&&d.waitFrame===19,'wait remains locked');d.update(1/25);assert(d.currentEntry===299&&d.blackScreen.alpha===1,'frame20 changes question');d.update(20/25);assert(!d.waitPending&&!d.blackScreen.visible,'frame40 unlock');
  gd.story.flags.wfmDeliverCharacterName=497;d.currentEntry=1449;assert(d.fill('@name@')===getText(ds,497),'delivery NPC name not replaced by hero');assert(!(globalThis as any).__lastTranspileError,'representative actions without errors');
  const longest=Object.entries(ds.dialogues.entries).sort((a:any,b:any)=>(b[1].responses?.length??0)-(a[1].responses?.length??0))[0];d.start(3,Number(longest[0]));const area=descendants(d.content).filter(n=>n instanceof ScrollableArea).at(-1) as ScrollableArea;assert(area.contentList.length>0&&area.contentList.every(n=>n.y>=0),'responses normalized into scrollable area');
 }],
 ['设施图标：34 类原图／组合部件与隐藏图标不留残影',()=>{
  for(let id=1;id<=34;id++){const parts=locationSymbolParts(id);assert(parts.length>0,'mapped '+id);for(const p of parts)assert(assets.getImage('filtericon'+p.name+'.png'),'asset '+p.name);const group=new Sprite();attachLocationSymbol(group,parts,assets);assert(group.children.length===parts.length&&descendants(group).filter(n=>n instanceof BitmapObject).length===parts.length,'all parts retained '+id);}
  const tm=townSample();tm.update(0);for(const b of tm.blueSigns.filter((b:any)=>b.loc.visible===false))assert(!b.hit.visible&&!b.fill.visible&&!b.erase()?.visible,'hidden location has no fill/cutout');
 }],
 ['存档页：内存命名、覆盖／删除、稀疏索引、读档页保留',()=>{
  const {slots,getLoaded}=saveSample();assert(texts(saveUI!.screen).some(t=>t.text.includes(getText(ds,1442))),'new slot row');clickAt(310,320);let input=document.querySelector<HTMLInputElement>('input');assert(input?.maxLength===40,'original name input');input!.value='测试新存档';input!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(slots.list()[1]?.name==='测试新存档'&&!document.querySelector('input'),'named save in first free slot');
  saveUI!.show('save');clickAt(260,124);clickAt(310,320);let confirm=saveUI!.screen.children.at(-1) as any;assert(confirm.visible,'overwrite requires confirmation');clickNode(confirm.approveButton);input=document.querySelector('input');assert(input,'overwrite naming field');input!.value='覆盖测试';input!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(slots.list().some(e=>e?.name==='覆盖测试'),'overwrite name saved');
  saveUI!.show('save');clickAt(260,124);const count=slots.count();clickAt(310,400);confirm=saveUI!.screen.children.at(-1);assert(confirm.visible,'delete confirmation');clickNode(confirm.approveButton);assert(slots.count()===count-1,'delete selected slot only');
  slots.save(gd,23,'稀疏槽23');saveUI!.show('load');clickAt(310,320);assert(getLoaded()===23,'date sorting retains real index');assert(!texts(saveUI!.screen).some(t=>t.text.includes(getText(ds,1442))),'load has no new-save row');saveUI!.show('save');clickAt(310,320);saveUI!.close();assert(!document.querySelector('input'),'closing cleans native input');
 }],
 ['地图：发现条件、存档合并／不串档、出镇保护与中心主动进镇',()=>{
  const c=reset(),t=gd.Towns[16];c.x=t.x;c.y=t.y;gd.Towns.forEach(x=>x.discovered=false);let seen=discoverVisibleTowns(gd);assert(seen.has(16)&&t.discovered,'visible town remembered');assert(near(c.sight,c.People[0].sight/100),'original sight units');t.active=false;t.discovered=false;assert(!discoverVisibleTowns(gd).has(16)&&!t.discovered,'inactive town not revealed');t.active=true;
  const s=makeSave(gd);s.caravan.x=-100000;s.caravan.y=-100000;s.discoveredTowns=[16];s.towns!.forEach(x=>x.discovered=false);s.story!.flags={enteredBunkerForTheFirstTime:true,askedKukulAboutTribes:true};gd.Towns[0].discovered=true;applySave(gd,s);assert([15,16,17].every(id=>gd.Towns[id].discovered)&&!gd.Towns[0].discovered,'legacy flags/top-level merge without cross-save leak');
  mapSample();const car=gd.Caravans[0];let enters=0;map.hooks.onEnterTown=()=>enters++;shell.gdScreen='town';shell.exitTown();assert(car.recentlyInteractedTowns.includes(16),'exit protects last town');gd.gameSpeed=1;car.moving=true;gd.advanceCaravan=noop;map.update(0);assert(enters===0,'leaving does not immediately re-enter');car.x=gd.Towns[16].x-20;car.y=gd.Towns[16].y;map.onMapClick(345,248);assert(enters===0&&car.moving,'nearby icon click is direction, not enter');map.onMapClick(325,248);assert(enters===1,'center explicitly enters nearby town');car.x-=100;map.update(0);assert(!car.recentlyInteractedTowns.includes(16),'leave radius clears protection');
 }],
 ['BGM 判定：离树弹窗不冻结，菜单／城镇暂停，回地图恢复',()=>{
  mapSample();gd.gameSpeed=1;const detached=new Sprite();shell.saveDlg={screen:detached};shell.eventDlg={screen:new Sprite()};shell.npcTrade={screen:new Sprite()};shell.encounterMenu=new Sprite();shell.yesNoDlg=new Sprite();assert(!shell.worldFrozen(),'detached visible overlays do not freeze');shell.syncMusic();assert(musicStatus().mode==='map','map mode');screen.addChild(detached);assert(shell.worldFrozen(),'mounted modal freezes');shell.syncMusic();assert(musicStatus().mode==='paused','modal fades music out');screen.removeChild(detached);shell.gdScreen='town';shell.syncMusic();assert(musicStatus().mode==='paused','town music paused per original');shell.gdScreen='map';shell.syncMusic();assert(musicStatus().mode==='map','return restores map music');
 }],
];
new Input(canvas,()=>screen);
let running=false;async function run(){if(running)return;running=true;results.textContent='';errors.textContent='';let passed=0;for(const[name,test]of checks){try{await test();results.textContent+='PASS '+name+'\n';passed++;}catch(e){results.textContent+='FAIL '+name+'\n';errors.textContent+=String((e as Error).stack??e)+'\n';}}results.textContent+=passed+'/'+checks.length+' 组最小回归（只用内存数据）';results.setAttribute('data-result',passed===checks.length?'PASS':'FAIL');saveSample();running=false;}
function musicSample(){mapSample();scene='真实 BGM 播放';gd.gameSpeed=1;const key=Object.keys(ds.manifest.sounds).find(n=>n.includes('Caravaneer2-192KBps'));assert(key,'music resource');registerMusic('/'+ds.manifest.sounds[key!][0]);setMusicOn(true);shell.syncMusic();startMusic();musicRun=true;}
const actions:Record<string,()=>void>={'运行最小回归':()=>{void run();},'容器倒液体':containerSample,'产业仓库':industrySample,'克里克特对话':dialogueSample,'打开对话交易':()=>{const d=dialogueSample();d.respond(542,ds.dialogues.responses['542']);},'小数计算器':()=>{const tr=tradeSample();tr.takeItem(0,tr.sides[0].array.find((e:any)=>e.type===food));tr.calcPanel.press('MAX');},'设施图标全集':atlasSample,'希罗斯镇设施':townSample,'原版存档页':saveSample,'发现城镇地图':navigationSample,'真实 BGM 播放':musicSample,'BGM 菜单暂停':()=>{if(musicRun){modal=new Sprite();screen.addChild(modal);shell.optionsMenu=modal;}},'BGM 返回地图':()=>{modal?.parent?.removeChild(modal!);},'BGM 开关关闭':()=>setMusicOn(false),'BGM 开关开启':()=>setMusicOn(true)};
for(const[label,fn]of Object.entries(actions)){const b=document.createElement('button');b.textContent=label;b.onclick=fn;document.querySelector('#controls')!.append(b);}
saveSample();
let last=performance.now();function draw(now:number){const dt=Math.min(.1,(now-last)/1000);last=now;try{town?.update(dt);menu?.update(dt);dialogue?.update(dt);if(musicRun){shell.syncMusic();updateMusic(dt);}ctx.clearRect(0,0,880,495);screen.render(ctx);state.textContent=scene+' | 仅内存，不读写真实存档'+(musicRun?' | '+JSON.stringify(musicStatus()):'');}catch(e){errors.textContent+=String((e as Error).stack??e)+'\n';return;}requestAnimationFrame(draw);}requestAnimationFrame(draw);
