// Focused in-memory UI/inventory checks; never touches SharedObject, SaveSlots or user storage.
import {loadDataStore,getText} from '../src/core/DataStore';
import {AssetStore} from '../src/core/Assets';
import {Sprite,DisplayObject,BitmapObject,Graphics} from '../src/core/Display';
import {EngineText} from '../src/core/EngineText';
import {Input} from '../src/core/Input';
import {Button,ScrollableArea,Switch} from '../src/core/Ui';
import {initSounds,setMusicOn} from '../src/core/Sound';
import {GameData,Character} from '../src/game/World';
import {Story} from '../src/game/Story';
import {getItemData,itemName} from '../src/game/Economy';
import {TradeWindow} from '../src/game/TradeWindow';
import {TownMode} from '../src/game/TownMode';
import {CaravanMenu} from '../src/game/CaravanMenu';
import {CaravanSettingsWindow} from '../src/game/CaravanSettingsWindow';
import {MapMode} from '../src/game/MapMode';
import {NavigationScreen} from '../src/game/NavigationScreen';
import {OptionsMenu} from '../src/game/OptionsMenu';
import {GameShell as Shell} from '../src/game/Shell';
import {makeSave,applySave} from '../src/game/SaveSystem';
import {saveDataToOriginal} from '../src/core/SolExporter';
import {originalSaveToSaveData} from '../src/core/SolImporter';
const canvas=document.querySelector<HTMLCanvasElement>('#stage')!,ctx=canvas.getContext('2d')!;
const state=document.querySelector('#state')!,results=document.querySelector('#results')!,errors=document.querySelector('#errors')!;
window.addEventListener('error',e=>errors.textContent+=String(e.error?.stack??e.message)+'\n');
window.addEventListener('unhandledrejection',e=>errors.textContent+=String(e.reason?.stack??e.reason)+'\n');
const sounds:string[]=[];
// Observe real playSound requests without actual audio, configuration reads, or writes.
(globalThis as any).Audio=class {readyState=4;volume=0;currentTime=0;paused=true;constructor(public src:string){}load(){}pause(){this.paused=true;}play(){sounds.push(this.src.split('/').pop()!);this.paused=false;return Promise.resolve();}};
const ds=await loadDataStore(18),assets=new AssetStore(ds);
(globalThis as any).__c2={ds};(globalThis as any).__c2Story=Story;(globalThis as any).__c2GetItemData=(id:number)=>getItemData(ds,id);
initSounds(ds.manifest, name=>name);setMusicOn(false);await assets.loadFonts();
const preload=['InterfaceBackground.png','InterfaceForeground.png','TownBG.jpg','MapBG.png','GenericBackground.png','CaravanMenuCategoryButton.png','CaravanMenuCategoryButtonShine.png','Button15x15Up.png','Button15x15Down.png','InterfaceSwitch2Up.png','InterfaceSwitch2Down.png',...[1,2,3,4,5,6,9].flatMap(i=>['Up','Down'].map(s=>'InterfaceButton'+i+s+'.png')),...[1,2,3,4,5].map(i=>'MapModeSwitch'+i+'.png')];
await Promise.all(preload.map(n=>assets.ensure(n)));
let gd:GameData,screen=new Sprite(),map:MapMode|null=null,menu:CaravanMenu|null=null,townMode:TownMode|null=null,shell:any=null,scene='';
const noop=()=>{},near=(a:number,b:number)=>Math.abs(a-b)<1e-6;
const assert=(ok:unknown,msg:string)=>{if(!ok)throw Error(msg);};
const descendants=(s:Sprite):DisplayObject[]=>s.children.flatMap(ch=>ch instanceof Sprite?[ch,...descendants(ch)]:[ch]);
const globalAt=(node:DisplayObject,x=10,y=10)=>{for(let n:DisplayObject|null=node;n;n=n.parent){x=x*n.scaleX+n.x;y=y*n.scaleY+n.y;}return{x,y};};
function pointer(type:string,x:number,y:number){const r=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent(type,{clientX:r.left+x/880*r.width,clientY:r.top+y/495*r.height,pointerId:99,bubbles:true,buttons:type==='pointerup'?0:1}));}
function clickAt(x:number,y:number){pointer('pointermove',x,y);pointer('pointerdown',x,y);pointer('pointerup',x,y);}
function clickNode(node:DisplayObject,x=10,y=10){const p=globalAt(node,x,y);assert(screen.hitTestPoint(p.x,p.y)===node,'real hit misses '+node.constructor.name+' '+p.x+','+p.y);clickAt(p.x,p.y);}
function reset(){map?.destroy();shell?.navScreen?.destroy();map=null;shell=null;menu=null;townMode=null;Input.drag=null;
 gd=new GameData(ds,{storyMode:true,difficulty:1,character:null});(globalThis as any).__c2.shell={gd};gd.story=new Story(ds);gd.gameSpeed=0;gd.autoSave=false;gd.npcCaravans=[];gd.spawnNpcCaravans=noop;
 const c=gd.Caravans[0];c.moving=false;c.hunt=false;c.collectForage=false;c.cargo.clear();c.inUse={};c.transports=[];c.liquidContainerAssignments={};
 c.People=[new Character({name:'内存测试队长',category:1,basePhysical:10,baseAgility:10,_HP:200})];c.money=1000000;screen=new Sprite();return c;}
const gun=ds.items.Items.findIndex((it:any,i:number)=>it?.category===2&&itemName(ds,i).includes('P08'));
const bottle=ds.items.Items.findIndex((it:any,i:number)=>it?.category===1&&getItemData(ds,i)?.liquidsContainer);
function townSample(tab='town'){
 reset();scene='产业 '+tab;const t=gd.Towns[0];t.active=true;t.unemployed=100;t.playersMoney=250;t.playersStorageSpace=1000;
 t.industries=[{type:1,employees:30,forSale:true},{type:2,employees:15,forSale:true},{type:3,employees:10,forSale:true}] as any;t.playersIndustries=[{type:6,employees:4,forSale:true}] as any;
 townMode=new TownMode(gd,t,ds,assets,{onExitToMap:noop,onOpenCaravanMenu:noop,onOpenNavigation:noop});screen.addChild(townMode.screen);(townMode as any).industriesTab=tab;(townMode as any).onMenuButton(3);return t;
}
function hireSample(){townSample();scene='雇用';const t=gd.Towns[0];t.people=Array.from({length:10},(_,i)=>new Character({name:i?'佣兵 '+i:'托马斯',category:2,salary:125,faction:1,gender:1,basePhysical:4,baseAgility:5,baseAccuracy:5,baseIntelligence:5,_HP:80}));t.people.forEach(p=>p.recalculateSalary(gd.getFactionRelations(p.faction,0)));(townMode as any).onMenuButton(2);return t;}
function containerSample(){const c=reset();scene='容器管理';c.cargo.set(bottle,1);c.cargo.set(1,.1);gd.lastCaravanMenuCategory=0;menu=new CaravanMenu(gd,ds,assets,{onClose:noop,onSave:noop,onOptions:noop});screen.addChild(menu.screen);(menu as any).openManageContainers();return c;}
function crewSample(){reset();scene='人员';gd.lastCaravanMenuCategory=2;menu=new CaravanMenu(gd,ds,assets,{onClose:noop,onSave:noop,onOptions:noop});screen.addChild(menu.screen);}
function mapSample(){const c=reset();scene='世界地图';c.x+=200;c.y+=200;gd.Towns.forEach((t,i)=>{if(i<4){t.active=true;t.discovered=true;}});
 // Exercise real Shell routing without its persistence-owning constructor.
 shell=Object.assign(Object.create(Shell.prototype),{gd,ds,assets,canvas,currentScreen:screen,screenNum:4,gdScreen:'map',lastTownId:0,toastTime:0});
 (globalThis as any).__c2.shell=shell;
 map=new MapMode(gd,ds,assets,{isInputBlocked:()=>shell.worldFrozen(),onEnterTown:noop,onOpenMenu:which=>{if(which==='settings')shell.showCaravanSettings();else if(which==='options')shell.showOptionsPanel();else if(which==='map')shell.showNavigation();else shell.showCaravanMenu();},onEncounter:noop,onNpcCaravan:noop,onNotify:noop,onAutoSave:noop});shell.mapMode=map;screen.addChild(map.screen);map.update(.3);return c;}
function navSample(){mapSample();scene='导航地图';shell.showNavigation();(shell.navScreen as any).resetZoom();}
function optionsSample(){mapSample();scene='选项';shell.showOptionsPanel();}
function tradeSample(){const c=reset();scene='交易';c.cargo.set(gun,2);c.People[0].equipment=[{type:gun,amount:1,inUse:1}];c.inUse[gun]=1;c.cargo.set(bottle,2);c.cargo.set(1,.6);const t=gd.Towns[0];t.stock=new Map([[gun,3],[1,5]]);const tr=new TradeWindow(gd,ds,assets,noop);tr.show(t,{subCategory:1,margin:1.2});screen.addChild(tr.screen);return tr as any;}
const checks:Array<[string,()=>void|Promise<void>]>=[
 ['交易：装备保护、不可分数量、加入/返回守恒',()=>{
  const tr=tradeSample(),c=gd.Caravans[0],t=gd.Towns[0];assert(gun>0,'P08 fixture');assert(c.tradableCargo(gun)===1,'two total one equipped leaves one');assert(near(c.tradableCargo(1),.6),'divisible water');
   const p=c.People[0],equipment=p.equipment,weapons=p.weapons;p.equipment=[];p.weapons=[ds.items.Items[gun].subCategory,0];c.inUse[gun]=0;assert(c.tradableCargo(gun)===1,'legacy weapon slots remain reserved');p.equipment=equipment;p.weapons=weapons;c.inUse[gun]=1;
  const e=tr.sides[0].array.find((e:any)=>e.type===gun);assert(e?.amount===1,'sell list excludes equipped item');const stock=t.stock.get(gun)!;tr.doMove(0,e,10);assert(c.cargoAmount(gun)===1&&t.stock.get(gun)===stock+1,'move bounded by tradable quantity');assert(c.People[0].equipment[0].amount===1,'equipment intact');
  tr.returnItem(0,0,1);assert(c.cargoAmount(gun)===2&&t.stock.get(gun)===stock,'return conserves stock');c.cargo.set(gun,1.7);assert(c.tradableCargo(gun)===0&&c.cargoAmount(gun)===1.7,'historical fraction hidden, not rewritten');
  c.cargo.set(gun,3);tr.prepare();const old=tr.sides[0].array.find((e:any)=>e.type===gun);c.inUse[gun]=3;tr.doMove(0,old,2);assert(c.cargoAmount(gun)===3,'stale list cannot sell newly equipped stock');
 }],
 ['容器：真实拖拽、hover、纸纹稳定、取消/批准与滚条',()=>{
  const c=containerSample(),m=menu as any,ov=m.containersOv,bg=ov.children[0];assert(m.containerDraft[1]?.[0].type===bottle,'water container');
  pointer('pointermove',365,48);assert(m.containerContent.children.at(-1).visible&&descendants(m.containerContent.children.at(-1)).some(n=>n instanceof EngineText&&n.text.includes(itemName(ds,bottle))),'hover item info');
  pointer('pointerdown',365,48);pointer('pointermove',380,380);pointer('pointerup',380,380);
  assert(m.containerDraft[-1]?.[0].type===bottle&&!m.containerDraft[1]?.length,'actual water-to-withdrawn drag');assert(m.containersOv===ov&&ov.children[0]===bg,'paper background stays identical');assert(c.liquidContainerAssignments[1]?.[0].type===bottle,'draft is not applied early');
  m.closeContainers();assert(c.liquidContainerAssignments[1]?.[0].type===bottle,'cancel leaves assignments');m.openManageContainers();
  pointer('pointerdown',365,48);pointer('pointermove',400,100);canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:99}));assert(Input.drag===null,'cancelled pointer releases drag');
  m.containerDraft[0]=[{type:bottle,amount:1}];m.containerDraft[1]=[];c.cargo.set(1,0);m.approveContainers();assert(c.liquidContainerAssignments[0]?.[0].type===bottle,'approved draft applied');
  const a=new ScrollableArea(100,50,100,50,false,true,false,10,10,assets);screen.addChild(a);a.x=500;a.y=100;for(let i=0;i<5;i++){const s=new Sprite();s.graphics=new Graphics();s.graphics.drawRect(0,0,60,40);s.x=i*80;(s as any).width=60;(s as any).height=40;a.addContent(s);}a.updateSize();a.onWheel?.(100,520,120);assert(a.hscroll<0,'horizontal wheel scroll');
 }],
 ['产业与雇用：三页、存取守恒、单员工新建、雇用扣费',()=>{
  const t=townSample(),tm=townMode as any;assert(tm.industriesList.w===570,'industry original viewport');sounds.length=0;clickAt(320,76);assert(tm.industriesTab==='players'&&sounds.join()==='SFXPage.mp3','business tab real hit and page sound');
  const total=gd.Caravans[0].money+t.playersMoney;tm.industryStorageAction(2);tm.industryCalc.setValue(125);clickAt(400,400);assert(near(t.playersMoney,375)&&near(gd.Caravans[0].money+t.playersMoney,total),'actual calculator deposit preserves total');tm.industryStorageAction(3);tm.industryCalc.setValue(25);clickAt(400,400);assert(near(t.playersMoney,350)&&near(gd.Caravans[0].money+t.playersMoney,total),'withdrawal preserves total');
  tm.industriesTab='new';tm.refreshIndustries();const candidates=tm.newIndustryTypes();assert(candidates.length>30&&!candidates.includes(6),'complete missing recipes');
  const stable=t.preset.stableEmployment;t.preset.stableEmployment=true;assert(!tm.newIndustryTypes().length,'stable employment restriction');t.preset.stableEmployment=stable;
  t.bannedGoods.push(104);assert(!tm.newIndustryTypes().includes(21),'banned alcohol restriction');t.bannedGoods=t.bannedGoods.filter(x=>x!==104);
  const type=candidates[0],def=ds.industries.Types[type],price=t.industryPricePerUnit(type,ds,gd.difficulty)*3,people=t.unemployed,money=gd.Caravans[0].money;
  tm.createIndustry(type,def,price);tm.indConfirm.onApprove();assert(t.playersIndustries.some(i=>i.type===type&&i.employees===1)&&t.unemployed===people-1&&near(gd.Caravans[0].money,money-price),'new industry accounting');
  const fresh=gd.Towns.find(t=>!t.preset.noPeopleToHire&&!(t.preset.obligatoryPeople??[]).length&&t.unemployed>0)!;assert(!!fresh,'fresh recruit town');fresh.people=undefined;fresh.ensureHirePeople(ds);assert(fresh.people!.length===Math.round(fresh.unemployed/2)&&fresh.people!.every(p=>p instanceof Character&&Number.isFinite(p.maxAP)&&Number.isFinite(p.GDA)),'original recruit count and real attributes');
    const mandatory=gd.Towns.find(t=>(t.preset.obligatoryPeople??[]).length>0)!;assert(mandatory.people!.filter(p=>p.dontRemoveFromTown).length===mandatory.preset.obligatoryPeople.length&&mandatory.people!.every(p=>typeof p.name==='string'),'mandatory recruits and resolved names');const recruited=fresh.people![0];fresh.ensureHirePeople(ds);assert(fresh.people![0]===recruited,'reopening does not regenerate roster');fresh.people=[];fresh.ensureHirePeople(ds);assert(!fresh.people.length,'empty saved recruit list remains empty');
    const ht=hireSample(),hm=townMode as any,p=ht.people![0],fee=p.salary,prior=gd.Caravans[0].money,pop=ht.population;assert(hm.hireList.horizontalScrollEnabled&&hm.hireList.scrollbarW===10&&hm.hireList.w===620,'original horizontal hire list');const rail=globalAt(hm.hireList,100,95);assert(screen.hitTestPoint(rail.x,rail.y)===hm.hireList.thumbZone,'horizontal rail is below, not over, portraits');const first=hm.hireList.contentList[0],frame=first.children[0].graphics.ops[0];assert(near(frame.x*first.scaleX,-2)&&frame.fill.c==='#504840'&&frame.fill.a===1,'original dark two-pixel hiring selection');sounds.length=0;clickNode(hm.hireBtn);
  assert(gd.Caravans[0].People.includes(p)&&!ht.people!.includes(p)&&near(gd.Caravans[0].money,prior-fee)&&p.payDay===gd.Time+604800&&ht.population===pop-1,'first week wages and roster');assert(fee>0&&sounds.join()==='SFXCashRegister.mp3','nonzero wages, cash register once');
   const area=hm.hireAttrArea as ScrollableArea;area.onWheel!(1e5,320,182);assert(area.scroll<0,'skills list scrolls to bottom');const last=area.contentList.at(-1)!;assert(last.y+area.scroll+20<=160.1,'last HP row within viewport');
   const relation=gd.getFactionRelations;gd.getFactionRelations=()=>-20;hm.renderHirePage();assert(!hm.hireBtn.visible&&hm.hireInfoText.visible,'hostile recruit blocked');gd.getFactionRelations=relation;
   gd.Caravans[0].money=0;hm.renderHirePage();assert(!hm.hireBtn.visible&&hm.hireInfoText.visible,'unaffordable recruit blocked');ht.people=[];hm.renderHirePage();assert(hm.hireNoPeopleText.visible&&!hm.hireList.visible&&!hm.hirePhotoArea.visible&&!hm.hireBtn.visible,'no recruits hides empty UI');
 }],
 ['世界面板：五帧拉杆、设置/Esc入口、冻结、单次音效',()=>{
  mapSample();const mm=map as any;const lever=mm.levers[2];sounds.length=0;pointer('pointerdown',748,60);map!.updateControls(.2);assert(lever.frame===5,'pressed frame5');pointer('pointerup',748,60);assert(shell.settingsWindow instanceof CaravanSettingsWindow&&sounds.join()==='SFXSlideButton.mp3','settings switch actual hit and sound');map!.updateControls(.2);assert(lever.frame===1,'release returns frame1');
  const before=gd.Time;gd.gameSpeed=1;shell.update(.2);assert(gd.Time===before,'modal freezes actual world');window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27}));assert(!shell.optionsMenu,'modal blocks underlying shortcuts');
  const settings=shell.settingsWindow;settings.parent.removeChild(settings);shell.settingsWindow=null;window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',keyCode:83}));assert(shell.settingsWindow instanceof CaravanSettingsWindow,'S opens settings, not save');shell.settingsWindow.parent.removeChild(shell.settingsWindow);shell.settingsWindow=null;
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27}));assert(shell.optionsMenu instanceof OptionsMenu,'Esc options');const options=shell.optionsMenu;sounds.length=0;clickNode(options.buttons.at(-1));assert(!shell.worldFrozen()&&sounds.join()==='SFXClick.mp3','resume one click');
  for(let i=0;i<7;i++){pointer('pointermove',720,105+i*20);assert(mm.hoverTip.includes(getText(ds,14+i)),'resource hover '+i);}
   pointer('pointermove',679,251);assert(mm.hoverTip===getText(ds,1255),'lit warning does not block tooltip');pointer('pointermove',793,400);assert(mm.hoverTip.includes(':'),'clock does not block date hover');pointer('pointermove',711,280);assert(mm.hoverTip===getText(ds,27),'overload hover');mm.update(.4);assert(mm.infoText.visible&&mm.infoText.alpha>0,'world hint fades in');pointer('pointermove',620,280);assert(mm.hoverTip==='','overload tooltip clears');pointer('pointermove',900,550);mm.update(.4);assert(!mm.infoText.visible,'world hint fades out off canvas');
  shell.showCaravanMenu();const close=(shell.caravanMenu as any).tabButtons.find((b:any)=>b.id===10).disp;sounds.length=0;clickNode(close);assert(sounds.join()==='SFXMetallicClick.mp3','directory close one original metallic sound');
 }],
 ['导航：实际选点/缩放、北0东90、路线保存、返回与出发',()=>{
  navSample();const nav=shell.navScreen as any;const a=nav.mapToWorld(250,250),b=nav.mapToWorld(350,250);clickAt(250,250);clickAt(350,250);assert(nav.routeReady&&near(nav.directionTo(b),90),'east is90');assert(near((nav.directionTo({x:a.x,y:a.y-100})+1e-7)%360,1e-7),'north is0');assert(nav.infoText.includes(getText(ds,1402))&&nav.infoText.includes(getText(ds,1404)),'water and food budget');assert(nav.navText.text==='', 'no exact player marker without GPS');
  const old=gd.mapScale;pointer('pointerdown',619,54);nav.update(.12);pointer('pointerup',619,54);assert(gd.mapScale>old,'actual zoom control');const pos={...gd.routeEnd!};nav.refresh();assert(nav.routeReady&&gd.routeEnd!.x===pos.x,'reopen keeps route');
  const c=gd.Caravans[0];c.cargo.set(172,1);c.cargo.set(191,1);const oldXP=gd.sextantExperience;gd.Time+=86400;map!.update(.01);assert(gd.sextantExperience===oldXP+1&&gd.lastSextantPos.length===2&&gd.lastSextantMeasurement===gd.Time,'daily sextant+almanac reading');nav.refresh();assert(nav.navText.text.includes(getText(ds,5791)),'sextant uncertainty displayed');
   c.cargo.set(198,1);c.inUse[198]=1;// Display branch checked with a working-device test double; no save/device mutation outside memory.
   const working=c.devicesWorking;c.devicesWorking=(id:number)=>id===198?1:working.call(c,id);nav.refresh();assert(nav.navText.text===getText(ds,5790),'working GPS exact position');c.devicesWorking=working;
   const save=makeSave(gd);assert(save.navigation?.routeEnd?.x===pos.x&&save.navigation.scale===gd.mapScale,'navigation persisted');const original=saveDataToOriginal(save),roundtrip=originalSaveToSaveData(original);assert(JSON.stringify(roundtrip.navigation)===JSON.stringify({scale:save.navigation!.scale,centerX:save.navigation!.centerX,centerY:save.navigation!.centerY,routeStart:save.navigation!.routeStart,routeEnd:save.navigation!.routeEnd,lastSextantPos:save.navigation!.lastSextantPos,lastSextantOffset:save.navigation!.lastSextantOffset,lastSextantMeasurement:save.navigation!.lastSextantMeasurement,sextantExperience:save.navigation!.sextantExperience}),'original save navigation roundtrip');
   const restored=new GameData(ds,{storyMode:true,difficulty:1,character:null});applySave(restored,save);assert(restored.mapScale===gd.mapScale&&restored.routeEnd?.x===pos.x&&restored.sextantExperience===gd.sextantExperience,'save restores viewport, route and sextant');
   c.cargo.delete(172);gd.measureSextant();assert(!gd.lastSextantPos.length,'missing instrument clears outdated reading');
  shell.gdScreen='town';gd.pauseOnExitTown=true;gd.gameSpeed=2;sounds.length=0;clickNode(nav.goBtn);assert(shell.gdScreen==='map'&&gd.Caravans[0].moving&&gd.gameSpeed===2&&sounds.join()==='SFXClick.mp3','town route departure returns to world without unwanted pause');
 }],
 ['通用按钮：按下/松开只触发一次，按住移出不激活',()=>{
  reset();const paragraphs=new EngineText('A\n\nB\n\n',0,14,'left',0,0,200,null,true,true);assert(paragraphs.textHeight===5*19,'word-wrap preserves explicit and trailing blank lines');let count=0;const b=new Button(1,()=>count++,null,assets);b.x=20;b.y=20;screen.addChild(b);sounds.length=0;clickAt(55,55);assert(count===1&&sounds.join()==='SFXClick.mp3','40x40 original round button hit');
  sounds.length=0;pointer('pointerdown',30,30);pointer('pointermove',80,80);pointer('pointerup',80,80);assert(count===1&&sounds.length===1,'drag off button cancels action, not second sound');
 }],
];
new Input(canvas,()=>screen);
let running=false;async function run(){if(running)return;running=true;results.textContent='';errors.textContent='';let passed=0;for(const[name,test]of checks){try{await test();results.textContent+='PASS '+name+'\n';passed++;}catch(e){results.textContent+='FAIL '+name+'\n';errors.textContent+=String((e as Error).stack??e)+'\n';}}results.textContent+=passed+'/'+checks.length+' 组最小回归（仅内存）';results.setAttribute('data-result',passed===checks.length?'PASS':'FAIL');townSample();running=false;}
const samples:Record<string,()=>void>={check:()=>{void run();},town:()=>townSample(),players:()=>townSample('players'),new:()=>townSample('new'),hire:hireSample,containers:containerSample,crew:crewSample,map:mapSample,nav:()=>{navSample();clickAt(320,250);clickAt(340,150);},options:optionsSample,trade:tradeSample};
for(const[id,fn]of Object.entries(samples))document.getElementById(id)!.addEventListener('click',fn);
townSample();
function draw(){try{if(shell)shell.update(1/60);else {menu?.update(1/60);townMode?.update(1/60);}ctx.clearRect(0,0,880,495);screen.render(ctx);state.textContent=scene+' | 仅内存，不读写存档 | 最近声音 '+sounds.slice(-3).join(',');}catch(e){errors.textContent+=String((e as Error).stack??e)+'\n';return;}requestAnimationFrame(draw);}draw();
