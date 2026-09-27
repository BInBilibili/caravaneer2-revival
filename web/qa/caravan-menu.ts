// Focused in-memory regression. No SaveSlots, localStorage, filesystem or user save access.
import {loadDataStore,getText} from '../src/core/DataStore';
import {AssetStore} from '../src/core/Assets';
import {Sprite,BitmapObject} from '../src/core/Display';
import {ScrollableArea,Button} from '../src/core/Ui';
import {ConsProdGraph} from '../src/game/ConsProdGraph';
import {Battle} from '../src/game/Battle';
import {YesNoDialogue} from '../src/game/YesNoDialogue';
import {CaravanSettingsWindow,CARAVAN_SWITCHES} from '../src/game/CaravanSettingsWindow';
import {calculateProductionFlow} from '../src/game/ProductionFlow';
import {settleTownEconomy} from '../src/game/TownEconomy';
import {itemDefinition,itemWeightKg} from '../src/game/ItemMetrics';
import {EngineText} from '../src/core/EngineText';
import {DialogueTextMask} from '../src/core/DialogueBg';
import {Input} from '../src/core/Input';
import {GameData,Character,Caravan,NpcCaravan,makeTransportUnit} from '../src/game/World';
import {Story} from '../src/game/Story';
import {CaravanMenu} from '../src/game/CaravanMenu';
import {makeSave,applySave} from '../src/game/SaveSystem';
import {originalSaveToSaveData} from '../src/core/SolImporter';
import {saveDataToOriginal} from '../src/core/SolExporter';
import {liquidStorage,moveContainer} from '../src/game/LiquidStorage';
import {getItemData} from '../src/game/Economy';
import {TradeWindow} from '../src/game/TradeWindow';
import {buildPortraitFromCharacter} from '../src/game/Portrait';
const canvas=document.querySelector<HTMLCanvasElement>('#stage')!,ctx=canvas.getContext('2d')!;
const state=document.querySelector('#state')!,results=document.querySelector('#results')!,errors=document.querySelector('#errors')!;
window.addEventListener('error',e=>errors.textContent+=String(e.error?.stack??e.message)+'\n');
window.addEventListener('unhandledrejection',e=>errors.textContent+=String(e.reason?.stack??e.reason)+'\n');
const ds=await loadDataStore(18),assets=new AssetStore(ds);
(globalThis as any).__c2={ds};(globalThis as any).__c2Story=Story;
(globalThis as any).__c2GetItemData=(id:number)=>getItemData(ds,id);
await assets.loadFonts();
await Promise.all(['InterfaceSwitch1Up.png','InterfaceSwitch1Down.png',...['volunteers','mercenaries','prisoners','slaves','other'].map(n=>'filtericon'+n+'.png')].map(n=>assets.ensure(n)));
await Promise.all(['InterfaceBackground.png','InterfaceForeground.png','TownBG.jpg','GenericBackground.png','CaravanMenuCategoryButton.png','CaravanMenuCategoryButtonShine.png',...[1,2,3,4,5,6,9].flatMap(i=>['Up','Down'].map(s=>'InterfaceButton'+i+s+'.png')),...[1,7,8,10,13,14].map(i=>'transportIcon'+i+'.png')].map(n=>assets.ensure(n)));
let gd:GameData,menu:CaravanMenu,m:any,closed=false;
function makeUnit(type:number){const u=makeTransportUnit(type,ds);u.age=ds.transports.Types[type].maturity*2||1500;u.weight=u.idealWeight;u.health=u.maxHealth;return u;}
function sample(){
  menu?.setCategory(10);closed=false;
  gd=new GameData(ds,{storyMode:true,difficulty:1});(globalThis as any).__c2.shell={gd};
  gd.story=new Story(ds);gd.story.acceptedQuests=[1,2,3,5,9];gd.story.completedQuests=[4];gd.story.failedQuests=[6];gd.revealedFactions=[1,2,3];
  const c=gd.Caravans[0];c.money=98765;
  c.People=[new Character({name:'商队队长',category:1,basePhysical:10,baseAgility:10,baseIntelligence:15,eyes:1}),new Character({name:'护卫',category:2,salary:50,gender:2,basePhysical:8,baseAgility:7}),new Character({name:'伤员',category:1,_HP:30,baseAgility:3}),new Character({name:'俘虏',category:3})];
  c.transports=[1,7,8,10,13,14].map(makeUnit);
  c.cargo=new Map([[65,10],[80,2],[112,3],[113,2],[1,18],[64,30],[79,3],[94,4],[21,2],[29,30],[81,1],[105,1],[106,1],[107,1],[63,2],[62,20],[2,4]]);
  c.inUse={21:1,29:10,81:0};const p=c.People[0];p.weapons=[ds.items.Items[21].subCategory,0];p.equipment=[{type:21,amount:1,inUse:1},{type:29,amount:10,inUse:0}];
  c.attachCart(c.transports[0],c.transports[2]);c.seatPassenger(c.People[2],c.transports[0]);c.seatPassenger(c.People[1],c.transports[4]);c.rebuildLiquidsContainers();
  c.historicalData=[0,1,2,3,4].map(i=>({time:gd.Time-i*86400,production:[{item:1,amount:10-i},{item:62,amount:3+i}],consumption:[{item:1,amount:8+i}],playersProduction:[],playersConsumption:[]}));
  gd.knownPrices=[{item:1,town:16,location:0,buyTime:gd.Time,sellTime:gd.Time-86400,buyPrice:2.5,sellPrice:1.2},{item:1,town:0,buyTime:gd.Time-2*86400,sellTime:-1,buyPrice:4,sellPrice:0},{item:65,town:16,buyTime:gd.Time,sellTime:gd.Time,buyPrice:4,sellPrice:2}];
  gd.lastCaravanMenuCategory=0;menu=new CaravanMenu(gd,ds,assets,{onClose:()=>{closed=true;},onSave:()=>{},onOptions:()=>{}});m=menu;
}
const assert=(ok:unknown,msg:string)=>{if(!ok)throw Error(msg);};
const near=(a:number,b:number)=>Math.abs(a-b)<1e-6;
const click=(x:number,y:number)=>{const h=menu.screen.hitTestPoint(x,y);assert(h,'missing hit '+x+','+y);h!.dispatchClick();};
const labels=(s:Sprite):string[]=>s.children.flatMap(ch=>ch instanceof EngineText?[ch.text]:ch instanceof Sprite?labels(ch):[]);
const descendants=(s:Sprite):any[]=>s.children.flatMap(ch=>ch instanceof Sprite?[ch,...descendants(ch)]:[ch]);
const checks:Array<[string,()=>void|Promise<void>]>=[];
checks.push(['十个标签页、三本日志、重复渲染与关闭记忆',()=>{
  sample();for(let i=0;i<10;i++){click(760,[12,52,102,142,182,232,272,312,362,402][i]+10);assert(m.category===i,'sidebar '+i);assert(menu.mainArea.children.length>0,'empty page '+i);ctx.clearRect(0,0,880,495);menu.screen.render(ctx);const n=menu.mainArea.children.length;menu.setCategory(i);assert(menu.mainArea.children.length===n,'stacked page '+i);assert(!labels(menu.mainArea).some(s=>/\bNaN\b|undefined|\[object Object\]/.test(s)),'invalid text '+i);}
  menu.setCategory(1);for(const [i,x] of [100,320,540].entries()){click(x,25);assert(m.logBookmark===i,'log bookmark');menu.screen.render(ctx);}
  menu.setCategory(8);click(760,465);assert(closed&&gd.lastCaravanMenuCategory===8,'close remembers previous page');menu.setCategory(gd.lastCaravanMenuCategory);
}]);
checks.push(['拖车、座位/重量、卸客及自动分配',()=>{
  sample();const c=gd.Caravans[0];c.removeAllPassengers();const horse=c.transports[1],cart=c.transports[3],person=c.People[0];assert(c.attachCart(horse,cart),'attach cart');assert(c.seatCapacity(horse)===cart.maxPassengers,'cart replaces seats');assert(near(c.capacityWithCart(horse),Math.min(horse.capacity*c.cartMultiplication(cart)-cart.weight,cart.capacity)),'cart capacity');
  assert(c.seatPassenger(person,horse),'seat person');assert(c.occupiedSpaces(horse)===1&&near(c.passengersWeight(horse),person.weight),'spaces/weight');assert(!!c.canSeat(horse,horse),'self seat blocked');assert(!!c.canSeat(c.transports[0],c.transports[4]),'towed animal blocked');c.unseatPassenger(person);assert(!person.passengerIn&&!horse.Passengers.includes(person),'unseat');
  c.detachCart(horse);assert(!cart.attachedTo&&c.seatCapacity(horse)===horse.maxPassengers,'detach');c.distributeTransport();c.distributePassengers();
  const seen=new Set<any>();for(const t of c.transports){assert(c.occupiedSpaces(t)<=c.seatCapacity(t),'spaces overflow');assert(c.passengersWeight(t)<=c.capacityWithCart(t)+1e-6,'weight overflow');for(const p of c.passengersOf(t)){assert(p.passengerIn===t&&!seen.has(p),'unique backreference');seen.add(p);}}
  assert(c.passengersOf(c.transports[4]).some(p=>p instanceof Character),'vehicle driver');assert(Number.isFinite(c.speedKmh)&&Number.isFinite(c.maxCargo),'actual movement stats');
  const links=c.transports.map(t=>[t,t.cart,t.attachedTo]),seats=c.People.map(p=>[p,p.passengerIn]);
  const update=c.updateSpeed;let updates=0;c.updateSpeed=()=>{updates++;};
  try{c.distributeTransport(false,true);c.distributePassengers(false,true);}finally{c.updateSpeed=update;}
  assert(updates===0&&links.every(([t,cart,tower])=>t.cart===cart&&t.attachedTo===tower),'non-reset towing retains links and defers refresh');
  assert(seats.every(([p,t])=>!t||p.passengerIn===t),'non-reset passenger allocation keeps existing seats');
  sample();const armed=gd.Caravans[0],fighter=armed.People[0];armed.People=[fighter];fighter.equipment=[];fighter.weapons=[0,0];armed.inUse={};armed.cargo=new Map([[21,1],[29,5]]);
  const load=itemWeightKg(ds,21)+itemWeightKg(ds,29)*5;Object.defineProperty(fighter,'capacity',{get:()=>load+.00001,configurable:true});
  armed.distributeWeapons();armed.distributeAmmo();assert(fighter.weapons[0]===ds.items.Items[21].subCategory&&fighter.equipment.find(e=>e.type===29)?.amount===5&&near(fighter.equipmentWeight,load),'weapon reserve and carried ammo use projectile plus case weight');
  sample();const protectedRoster=gd.Caravans[0];protectedRoster.People=protectedRoster.People.slice(0,2);protectedRoster.cargo=new Map([[48,1]]);protectedRoster.inUse={};
  protectedRoster.People.forEach((p,i)=>{p.equipment=[];p.generalBattleExperience=100;p.AP=i?20:0;});
  protectedRoster.distributeArmor();assert(!protectedRoster.People[0].Jacket&&protectedRoster.People[1].Jacket===ds.items.Items[48].subCategory,'armor score uses current AP');
}]);
checks.push(['手动补水/润滑、动物年龄 getter',()=>{
  sample();const c=gd.Caravans[0],car=c.transports[4],before=c.cargoAmount(1);car.waterLevel=0;c.fillWater(car);assert(car.waterLevel>0&&near(before-c.cargoAmount(1),car.waterLevel),'coolant consumes water');car.lubricantLevel=0;const oil=c.cargoAmount(79);c.fillLubricant(car);assert(car.lubricantLevel>0&&near(oil-c.cargoAmount(79),car.lubricantLevel),'lubricant');
  const u=makeUnit(1);u.age=0;assert(u.agePeriod===1,'newborn live age');u.age=ds.transports.Types[1].maturity+1;assert(u.agePeriod===3,'mature live age');
}]);
checks.push(['整只容器、不共享容量、撤出/取消/溢出确认与交易兼容',()=>{
  sample();const c=gd.Caravans[0];c.transports=[];c.cargo=new Map([[65,2],[1,1.5]]);c.liquidContainerAssignments={};c.rebuildLiquidsContainers();assert(c.inUse[65]===2&&near(c.maxLiquidAmount(1),.5),'whole bottles');
  menu.setCategory(8);m.openManageContainers();assert(labels(m.containersOv).includes(getText(ds,1217).toUpperCase()+':')&&labels(m.containersOv).includes(getText(ds,1218).toUpperCase()+':'),'original container zone labels');assert(m.containersOv.hitTestPoint(200,300),'available zone hit area');m.containerSelected={from:1,type:65};m.moveManagedContainer(-1);m.quantityCalc.setValue(1);m.quantityCalc.press('OK');assert(c.inUse[65]===2,'draft does not commit');m.cancelContainers();m.fleetConfirm.approveFunction();assert(c.inUse[65]===2&&c.cargoAmount(1)===1.5&&m.category===8,'cancel returns to cargo');
  m.openManageContainers();moveContainer(m.containerDraft,65,1,1,-1);m.approveContainers();assert(c.cargoAmount(1)===1.5&&m.fleetConfirm.visible,'spill waits');m.fleetConfirm.approveFunction();assert(c.cargoAmount(1)===1&&c.liquidContainerAssignments[-1][0].amount===1,'confirmed precise spill');
  const mix=liquidStorage(ds,new Map([[65,1],[1,.5],[79,.5]]),[],79);assert(Object.entries(mix.assignments).filter(([k,v])=>Number(k)>0&&v.length).length===1&&mix.headroom<0,'one bottle cannot serve two liquids');
  c.cargo=new Map([[65,2],[1,1.5]]);c.liquidContainerAssignments={};c.rebuildLiquidsContainers();const trade:any=Object.assign(Object.create(TradeWindow.prototype),{gd});const e={type:65,itemData:getItemData(ds,65)};trade.removeFromPlayer(e,1);trade.syncLiquids();assert(near(c.cargoAmount(1),1.5)&&c.inUse[65]===1&&c.maxLiquidAmount(1)<0,'sell bottle keeps liquid');trade.addToPlayer(e,1);trade.syncLiquids();assert(c.cargoAmount(65)===2&&near(c.cargoAmount(1),1.5)&&near(c.maxLiquidAmount(1),.5),'return bottle without duplication');
}]);
checks.push(['设备关闭与部分/全部撤出装备',()=>{
  sample();const c=gd.Caravans[0];menu.setCategory(8);m.toggleDevice(81,1,1);assert(c.inUse[81]===0&&c.devicesWorking(81)===0,'explicit off');const p=c.People[0],cargo=c.cargoAmount(29);m.withdrawFromPerson(p,29,3);assert(p.equipment.find(e=>e.type===29)!.amount===7&&c.inUse[29]===7&&c.cargoAmount(29)===cargo,'partial withdrawal');m.withdrawFromPerson(p,21,1);assert(p.weapons[0]===0&&!p.equipment.some(e=>e.type===21)&&c.cargoAmount(21)===2,'clear weapon without destroying cargo');
  m.openCargoWithdraw(29);click(550,410);assert(m.fleetConfirm.visible&&new Set(menu.screen.children).size===menu.screen.children.length,'withdraw all requires one confirmation');m.fleetConfirm.approveFunction();assert(!p.equipment.some(e=>e.type===29)&&c.inUse[29]===0&&c.cargoAmount(29)===cargo,'withdraw all');
}]);
checks.push(['工作房原料变化和每日上限重复确认',()=>{
  sample();const c=gd.Caravans[0];c.cargo=new Map([[65,10],[64,8],[79,1],[94,1]]);c.transports=[];c.liquidContainerAssignments={};menu.setCategory(9);let item=m.workshopItems.find((i:any)=>i.ind===0);assert(item.canProduce,'recipe available');const findChips=(s:Sprite):EngineText[]=>s.children.flatMap(ch=>ch instanceof EngineText&&ch.text.includes(' x ')?[ch]:ch instanceof Sprite?findChips(ch):[]);assert(findChips(menu.mainArea).every(t=>near(t.width,t.textWidth+10)),'requirement text fits its chip');m.produceItem(item,1);c.cargo.set(94,0);m.wsConfirm.approveFunction();assert(c.cargoAmount(61)===0&&!gd.producedToday[0],'revalidate materials');
  c.cargo.set(94,1);menu.setCategory(9);item=m.workshopItems.find((i:any)=>i.ind===0);m.produceItem(item,1);gd.producedToday[0]=item.maxPerDay;m.wsConfirm.approveFunction();assert(c.cargoAmount(61)===0,'revalidate cap');gd.producedToday[0]=0;menu.setCategory(9);item=m.workshopItems.find((i:any)=>i.ind===0);m.produceItem(item,1);m.wsConfirm.approveFunction();assert(c.cargoAmount(61)===1&&gd.producedToday[0]===1,'produce once');
}]);
checks.push(['新旧 Web / 原版 SOL 数据往返与乘客下车',()=>{
  sample();const c=gd.Caravans[0];gd.transportAsPassengers=true;const save=JSON.parse(JSON.stringify(makeSave(gd)));const amount=c.cargoAmount(1);applySave(gd,save);const restored=gd.Caravans[0],p=restored.People[2],t=p.passengerIn;assert(t&&restored.transports.includes(t)&&t.Passengers.includes(p),'restore real backreference');restored.unseatPassenger(p);assert(!t.Passengers.includes(p),'unseat after load');assert(restored.inUse[81]===0&&gd.knownPrices.length===3&&restored.historicalData.length===5&&gd.transportAsPassengers,'preserve page state');assert(restored.cargoAmount(1)===amount,'no doubled liquid');
  const old=JSON.parse(JSON.stringify(save));delete old.caravan.cargoIncludesLiquids;delete old.caravan.liquidContainerAssignments;old.caravan.cargo=old.caravan.cargo.filter((e:any)=>!restored.isLiquidItem(e.item));applySave(gd,old);assert(gd.Caravans[0].cargoAmount(1)===amount,'legacy reverse metadata');
  const original=saveDataToOriginal(save),imported=originalSaveToSaveData({save:original});assert(original.GameData.Caravans[0].People[2].passengerIn===0,'original numeric carrier index');applySave(gd,imported);assert(gd.Caravans[0].cargoAmount(1)===amount&&gd.Caravans[0].inUse[81]===0,'SOL amounts/device');const p2=gd.Caravans[0].People[2];assert(p2.passengerIn===gd.Caravans[0].transports[0]&&p2.passengerIn.Passengers.includes(p2),'SOL passenger backreferences');assert(gd.Caravans[0].transports[0].cart===gd.Caravans[0].transports[2],'SOL towing references');
}]);
checks.push(['成员解雇/释放、日粮转移与原版重命名窗口',()=>{
  sample();let c=gd.Caravans[0],p=c.People[1];c.overTown=null;p.minSalary=35;p.weapons=[ds.items.Items[21].subCategory,0];p.equipment=[{type:21,amount:1,inUse:1}];c.inUse[21]=2;m.dismissPerson(p);assert(c.People.includes(p)&&p.category===7&&p.salary===0&&p.equipment.length===0&&p.weapons[0]===0&&c.inUse[21]===1,'desert dismissal returns equipment');
  sample();c=gd.Caravans[0];p=c.People[1];const town=gd.Towns.find(t=>!t.preset?.constantPopulation)!;town.people=[];c.overTown=town.id;const population=town.population;m.dismissPerson(p);assert(!c.People.includes(p)&&town.people.includes(p)&&town.population===population+1&&!p.passengerIn,'town dismissal and unseat');const saved=JSON.parse(JSON.stringify(makeSave(gd)));applySave(gd,saved);assert(gd.Towns[town.id].people![0].name===p.name,'town pool Web restore');applySave(gd,originalSaveToSaveData({save:saveDataToOriginal(saved)}));assert(gd.Towns[town.id].people![0].name===p.name,'town pool SOL restore');
  sample();c=gd.Caravans[0];p=c.People[3];p.category=4;c.overTown=null;const foods=ds.items.Items.map((it:any,id:number)=>({id,it,data:it?.category===1?ds.items.Goods[it.subCategory]:null})).filter((f:any)=>f.data?.food&&f.data.calories>0&&f.data.divisible).slice(0,3);assert(foods.length===3,'food samples');c.cargo.clear();c.cargo.set(65,10);c.cargo.set(1,10);for(const f of foods)c.cargo.set(f.id,10);c.cargo.set(foods[0].id,.001);c.rebuildLiquidsContainers();
  const need=c.getConsumedFoodstuffs(p),originalCargo=new Map(c.cargo),water=p.waterConsumption;assert(near(need.reduce((n,e)=>n+e.amount*ds.items.Goods[e.item].calories,0),p.GDA),'shortfall redistributed');const bd=c.foodConsumptionBreakdown();assert([...bd.items].every(([sub,n])=>n<=c.cargoAmount(ds.items.Items.findIndex((i:any)=>i?.category===1&&i.subCategory===sub))+1e-8),'consumed preview respects stock');const rep=gd.story!.specificReputations[5]??0;menu.setCategory(2);m.openFreeDialogue(p);m.openFreeDialogue(p);assert(new Set(menu.screen.children).size===menu.screen.children.length,'no duplicate free overlay');click(440,355);const free=gd.npcCaravans.at(-1)!;assert(free.people.includes(p)&&p.category===1&&!c.People.includes(p)&&free.category===2&&free.money===0,'real freed group');assert(near(c.cargoAmount(1),10-water)&&near(free.cargo.get(1)!,water),'one day water');for(const e of need)assert(near((free.cargo.get(e.itemType)??0)+c.cargoAmount(e.itemType),originalCargo.get(e.itemType)!)&&near(free.cargo.get(e.itemType)??0,e.amount),'supplies conservation');assert(gd.story!.specificReputations[5]===rep+2&&gd.isCaravanRecentlyInteracted(free)&&Number.isFinite(free.direction),'release reputation/cooldown/direction');
  sample();c=gd.Caravans[0];p=c.People[3];c.overTown=null;const before=JSON.stringify([...c.cargo]);menu.setCategory(2);m.openFreeDialogue(p);click(440,325);assert(gd.npcCaravans.at(-1)!.cargo.size===0&&before===JSON.stringify([...c.cargo]),'without supplies does not deduct cargo');
  sample();menu.setCategory(5);const tr=gd.Caravans[0].transports[0];m.fleetRename(tr);const input=m.fleetNameInput as HTMLInputElement;assert(input.maxLength===25&&input.style.width==='400px'&&input.style.height==='20px','original rename geometry');input.value='新名字';m.fleetNameOkFn();assert(tr.givenName==='新名字'&&!document.body.contains(input),'rename commit/cleanup');m.fleetRename(tr);m.fleetNameInput.value='取消修改';menu.setCategory(0);assert(tr.givenName==='新名字'&&!document.querySelector('input'),'rename cancellation/cleanup');
}]);
checks.push(['空运输/拖车/乘客/货物和日志、书籍多行',()=>{
  sample();menu.setCategory(8);m.openCargoRead(105);assert(m.cargoReadOv,'book modal');const title=m.cargoReadOv.children.find((ch:any)=>ch instanceof EngineText&&ch.size===18);assert(title?.x===150&&title.y===31&&title.width===580,'original book title geometry');menu.setCategory(0);assert(!m.cargoReadOv,'book cleanup');const c=gd.Caravans[0];
  m.openSkillsWindow();const firstSkills=m.skillsOv;const amplifiers=ds.items.Items.map((it:any,id:number)=>({id,data:it?.category===1?ds.items.Goods[it.subCategory]:null})).filter((e:any)=>e.data?.sightAmplifier&&!e.data.device);c.cargo.clear();const sight=m.caravanSight();c.addCargo(amplifiers[0].id,1);assert(near(m.caravanSight(),sight*amplifiers[0].data.amplification),'original ratio amplifier');m.openSkillsWindow();assert(m.skillsOv!==firstSkills&&!menu.screen.children.includes(firstSkills),'collective skills refresh');
  m.openWeightChart(amplifiers[0].id);assert(labels(m.weightOv).some(s=>s.startsWith(getText(ds,1209).toUpperCase()+':')),'selected item weight legend');m.weightOv.visible=false;m.openWeightChart();assert(m.weightOv.visible&&new Set(menu.screen.children).size===menu.screen.children.length,'reopen weight chart');menu.setCategory(0);
  c.transports=[];c.cargo.clear();gd.knownPrices=[];c.historicalData=[];gd.story!.acceptedQuests=[];for(const i of [1,5,6,7,8]){menu.setCategory(i);menu.screen.render(ctx);assert(!labels(menu.mainArea).some(s=>/\bNaN\b|undefined/.test(s)),'empty '+i);}
}]);

checks.push(['空页控件、人员图标/定位、工作房最后一行、经济高亮和奴隶弹窗',async()=>{
  sample();const c=gd.Caravans[0];c.transports=[];
  const loaded=new Map<string,HTMLImageElement>(),source=document.createElement('canvas');source.width=source.height=250;
  const bitmap=new Image();bitmap.src=source.toDataURL();await bitmap.decode();
  const pending:Array<()=>void>=[];const mockAssets={getImage:(name:string)=>loaded.get(name)??null,ensure:(name:string)=>new Promise(resolve=>pending.push(()=>{loaded.set(name,bitmap);resolve(bitmap);}))};
  const firstPortrait=buildPortraitFromCharacter(mockAssets as any,c.People[0],1),secondPortrait=buildPortraitFromCharacter(mockAssets as any,c.People[0],.28);
  pending.forEach(resolve=>resolve());for(let i=0;i<6;i++)await Promise.resolve();assert(firstPortrait.numChildren()>0&&secondPortrait.numChildren()===firstPortrait.numChildren(),'simultaneous portrait subscribers both repaint');
  for(const [page,id] of [[6,6855],[7,6854]]){menu.setCategory(page);assert(labels(menu.mainArea).join('')===getText(ds,id).toUpperCase(),'empty page only original message '+page);assert(descendants(menu.mainArea).filter(s=>s instanceof ScrollableArea).length===0,'no irrelevant empty list '+page);}
  c.transports=[makeUnit(1)];menu.setCategory(6);assert(descendants(menu.mainArea).some(s=>s instanceof ScrollableArea),'animals can still have cart UI');
  sample();menu.setCategory(2);assert(menu.mainArea.children[0].y===-40,'crew absolute coordinates');assert(m.crewFilterSwitches.length===5&&descendants(m.crewFilterBar).filter(s=>s instanceof BitmapObject).length===5,'five real status icons');assert(descendants(menu.mainArea).some(s=>s.x===290&&s.y===322&&s.graphics?.ops.some((op:any)=>op.x===251&&op.y===141)),'skills inset frame reaches full list and scrollbar bottom');
  assert(descendants(menu.mainArea).some(s=>s instanceof ScrollableArea&&s.x===290&&s.y===322&&(s as any).h===140),'skills original height');const oldBar=m.crewFilterBar;m.crewFilterSwitches[0].sw.dispatchClick();assert(!m.crewFilters[0]&&descendants(menu.screen).filter(s=>s===oldBar).length===1,'filter toggles without duplicate parent');
  menu.setCategory(9);const list=menu.mainArea.children.find(s=>s instanceof ScrollableArea) as ScrollableArea;assert((list as any).scrollbarW===10,'same 10px scrollbar');list.scroll=-1e9;const rows=list.Content.children as any[],last=rows.at(-1);assert(near(last.y+last.height+list.scroll,(list as any).h),'last row reaches bottom');assert(last.height===100&&list.scroll<0,'row explicit bounds');
  const graph=new ConsProdGraph(620,180,c.historicalData);assert(graph.products.length>1,'graph fixture');for(const p of graph.products)assert((p.normalText.graphics?.ops??[]).every((o:any)=>o.hitOnly||!o.fill||o.fill.a===0),'normal products never paint red hit area');graph.clickProduct(graph.products[0].item);assert(graph.products[0].inverseText.visible,'selected product retains original highlight');
  const host=new Sprite();let selection='';const battle:any={screen:host,gd,assets,text:(id:number)=>getText(ds,id),restoreNativeCursor(){},takeSlaves(_n:number,mode:string){selection=mode;},finishVictory(){throw Error('unexpected slave fallback');}};
  gd.story!.specificReputations[7]=0;Battle.prototype.showSlaveMenu.call(battle,3);const ov=host.children[0] as Sprite,panel=ov.children[0] as Sprite,body=descendants(panel).find(s=>s instanceof EngineText) as EngineText;
  assert(panel.x===320&&body.x===20&&body.width===200&&near(panel.y,247.5-(body.textHeight+140)/2),'original 240px captive panel');assert(body.text.includes(getText(ds,3772).toUpperCase()),'slavery reputation warning');assert(body.parent instanceof DialogueTextMask,'captive letters use foreground texture mask');const buttons=panel.children.filter(s=>s instanceof Button);assert(buttons.length===3&&buttons.every((b,i)=>b.x===17&&b.y===body.textHeight+37+i*30),'original captive button positions');buttons[1].dispatchClick();assert(selection==='leave'&&host.children.length===0,'captive choice commits once');
  gd.story!.specificReputations[7]=1;Battle.prototype.showSlaveMenu.call(battle,3);assert(!labels(host).some(s=>s.includes(getText(ds,3772).toUpperCase())),'warning omitted with reputation');
  const inkCtx=source.getContext('2d')!;inkCtx.fillStyle='#234567';inkCtx.fillRect(0,0,250,250);const ink=new Image();ink.src=source.toDataURL();await ink.decode();
  const textured=new DialogueTextMask({getImage:()=>ink,ensure:async()=>ink} as any,50,30,[new EngineText('TEST',0xffffff,14,'left',0,0,50,20)]);
  const painted=document.createElement('canvas');painted.width=50;painted.height=30;const pc=painted.getContext('2d')!;textured.render(pc);const pixels=pc.getImageData(0,0,50,30).data;
  assert(pixels[3]===0&&pixels.some((v,i)=>i%4===3&&v===255&&pixels[i-3]===35&&pixels[i-2]===69&&pixels[i-1]===103),'foreground color only inside glyphs, not a panel overlay');
  const cached=(textured as any).surface;textured.render(pc);assert((textured as any).surface===cached,'dialogue mask bitmap cached across frames');
}]);
checks.push(['14 个原版设置开关、取消警告及 Web/SOL 内存往返',()=>{
  sample();m.openSettings();let settings=m.settingsOv as CaravanSettingsWindow;assert(settings.switches.length===14,'14 switches');assert(descendants(settings).filter(s=>s instanceof DialogueTextMask).length===1,'one shared foreground mask for all settings labels');gd.warnedAboutAdvancedTrading=true;
  const expected:Record<string,boolean>={};CARAVAN_SWITCHES.forEach((pair,i)=>{const owner:any=pair.global?gd:gd.Caravans[0],before=owner[pair.key];settings.switches[i].dispatchClick();expected[pair.key]=!before;assert(owner[pair.key]===!before,'setting applies '+pair.key);});
  m.openSettings();settings=m.settingsOv;assert(settings.switches.every((sw,i)=>sw.position===expected[CARAVAN_SWITCHES[i].key]),'settings reopen');
  const save=JSON.parse(JSON.stringify(makeSave(gd)));for(const data of [save,originalSaveToSaveData({save:saveDataToOriginal(save)})]){applySave(gd,data);CARAVAN_SWITCHES.forEach(pair=>assert((pair.global?gd:gd.Caravans[0] as any)[pair.key as never]===expected[pair.key],'setting persisted '+pair.key));}
  gd.advancedTrading=false;gd.warnedAboutAdvancedTrading=false;m.openSettings();settings=m.settingsOv;settings.switches[11].dispatchClick();const warning=settings.children.find(s=>s instanceof YesNoDialogue) as YesNoDialogue;assert(warning&&!gd.advancedTrading,'first enable waits for confirmation');warning.cancelButton!.dispatchClick();assert(!gd.advancedTrading&&!settings.switches[11].position&&!settings.children.includes(warning),'cancel restores switch');
}]);
checks.push(['分类安全、实际进食记账、共享缺料/供电、工资扣付',()=>{
  sample();const c=gd.Caravans[0],person=c.People[0];c.People=[person];person._HP=person.maxHP;c.transports=[];c.collectForage=c.hunt=false;c.inUse={};c.cargo.clear();c.historicalData=[];
  const armor=ds.items.Items.map((it:any,id:number)=>({it,id})).filter(e=>e.it?.category===5&&ds.items.Goods[e.it.subCategory]?.food).map(e=>e.id);assert(armor.length>0,'armor/food subcategory collision fixture');armor.forEach(id=>c.cargo.set(id,2));c.cargo.set(97,123);c.cargo.set(29,50);assert(c.food===0&&c.foodKcal()===0&&c.getConsumedFoodstuffs(person).length===0,'armor/ammo/money are not food');
  const food=ds.items.Items.findIndex((it:any)=>it?.category===1&&ds.items.Goods[it.subCategory]?.food&&ds.items.Goods[it.subCategory].calories>0&&ds.items.Goods[it.subCategory].divisible&&!ds.items.Goods[it.subCategory].liquid);assert(food>0,'food fixture');c.cargo.set(food,100);c.cargo.set(1,100);const before=new Map(c.cargo);c.beginHistory(gd.Time);try{(gd as any).peopleCycleStep();}finally{c.endHistory();}
  const point=c.historicalData[0];assert((point.consumption.find(e=>e.item===food)?.amount??0)>0,'real meal recorded');for(const [id,amount] of before)assert(near(amount-c.cargoAmount(id),point.consumption.find(e=>e.item===id)?.amount??0),'actual ledger matches cargo '+id);assert(armor.every(id=>c.cargoAmount(id)===2)&&!point.consumption.some(e=>e.item===97||armor.includes(e.item)),'no armor/money consumption');
  const flow=calculateProductionFlow([{consumption:[{item:1,amount:4}],production:[{item:2,amount:8}]},{consumption:[{item:1,amount:4}],production:[{item:3,amount:4}]}],new Map([[1,4]]));assert(flow.consumption[0].amount===4&&flow.production.find(e=>e.item===2)?.amount===4&&flow.production.find(e=>e.item===3)?.amount===2,'shared shortages proportional');
  const power=calculateProductionFlow([{consumption:[{item:64,amount:4}],electricityProduction:10},{electricityConsumption:5,production:[{item:1,amount:8}]}],new Map([[64,1]]));assert(power.poweredTime===.25&&power.production[0].amount===2,'partial generator runtime');
  const battery=ds.items.Items.findIndex((it:any)=>it?.category===1&&ds.items.Goods[it.subCategory]?.batteryCharge>0);assert(battery>0,'charger fixture');c.cargo=new Map([[battery,1],[218,1]]);c.inUse={[battery]:1};c.chargingBatteries=[1080];c.electricOverload=false;c.beginHistory(gd.Time+1);try{c.withoutHistory(()=>(gd as any).batteryChargeStep());}finally{c.endHistory();}assert(c.cargoAmount(218)===0&&c.cargoAmount(219)===1&&c.historicalData[0].consumption.length===0,'charging conversion not consumption');
  sample();const roster=gd.Caravans[0],merc=roster.People[1];merc.autoPay=true;merc.payDay=gd.Time;merc.salary=50;merc.minSalary=10;roster.money=30;const morale=merc.morale;gd.paySalaries();gd.paySalaries();assert(roster.money===0&&merc.payDay===gd.Time+604800&&near(merc.morale,morale+Math.sqrt(20)),'weekly capped salary only once');
  merc.recalculateSalary(200);assert(merc.minSalary===0&&merc.salary===50,'reference SWF zero minimum preserves offered salary');roster.money=100;merc.payDay=gd.Time;merc.autoPay=false;let prompts=0,approve=()=>{},refuse=()=>{};gd.onSalaryDue=(_p,a,r)=>{prompts++;approve=a;refuse=r;};gd.paySalaries();gd.paySalaries();assert(prompts===1&&roster.money===100,'one pending salary prompt');approve();approve();assert(roster.money===50,'double callback cannot charge twice');merc.payDay=gd.Time;roster.overTown=null;merc.addItemToEquipment({type:48,amount:1},false);roster.inUse[48]=1;gd.paySalaries();refuse();assert(merc.category===7&&merc.equipment.some(e=>e.type===48)&&roster.inUse[48]===1,'world refusal keeps wilderness escort equipped');roster.overTown=0;gd.dismissMercenary(merc);assert(!roster.People.includes(merc)&&gd.Towns[0].people.includes(merc)&&merc.equipment.length===0&&roster.inUse[48]===0,'town dismissal returns gear and moves person to hire pool');
}]);
checks.push(['城镇实耗、产业独立仓库、零头累积/溢出和空库存数据往返',()=>{
  sample();const town=gd.Towns[0];town.population=0;town.playersIndustries=[];town.industries=[];town.stock.clear();town.playersStorage=[];town.incompleteProduction=[];town.playersIncompleteProduction=[];town.historicalData=[];
  const types=[...ds.industries.Types],index=types.length;types.push({...types[0],consumption:[{item:1,amount:2}],production:[{item:62,amount:1}],electricityConsumption:0,averageSalary:0,expenses:0});const localDs={...ds,industries:{...ds.industries,Types:types}};town.industries=[{type:index,volume:1,employees:1,forSale:false}];
  for(let i=0;i<4;i++){town.stock.set(1,.5);const p=settleTownEconomy(town,localDs,gd.Time+i*43200,()=>.5);assert(near(p.consumption.find(e=>e.item===1)?.amount??0,.5)&&near(p.production.find(e=>e.item===62)?.amount??0,.25),'stock-backed municipal cycle');}assert(town.stock.get(62)===1&&town.incompleteProduction.length===0,'fractional output carries without loss');
  town.industries=[];town.population=100;town.stock=new Map([[1,.01]]);const pop=settleTownEconomy(town,localDs,gd.Time+200000,()=>.5);assert(pop.consumption.length===1&&pop.consumption[0].amount===.01,'town cannot consume nonexistent stock');
  town.population=0;town.stock=new Map([[1,100]]);town.playersIndustries=[{type:index,employees:1,volume:1}];types[index]={...types[index],production:[{item:62,amount:4}]};town.playersStorage=[{type:1,amount:1},{type:62,amount:3}];town.playersStorageSpace=itemWeightKg(ds,62)*3;town.playersMoney=10000;const cash=town.playersMoney+town.money,expenses=town.industryTotalExpenses(index,1,localDs)*.5;
  const privateFlow=settleTownEconomy(town,localDs,gd.Time+300000,()=>.5);assert(privateFlow.playersConsumption[0].item===1&&privateFlow.playersConsumption[0].amount===1&&privateFlow.playersProduction[0].amount===2,'player production separate ledger');assert(town.playersStorage.find(e=>e.type===62)?.amount===3&&town.stock.get(62)===2,'new overflow sold without deleting old warehouse goods '+JSON.stringify({stored:town.playersStorage,stock:[...town.stock],space:town.playersStorageSpace,occupied:town.occupiedPlayersStorageSpace,flow:privateFlow}));assert(town.stock.get(1)===100&&near(town.playersMoney+town.money,cash-expenses),'warehouse input not town stock; sales conserve cash except expenses');
  const food=ds.items.Items.findIndex((it:any)=>it?.category===1&&ds.items.Goods[it.subCategory]?.food&&ds.items.Goods[it.subCategory].calories>0);
  const coat=ds.items.Items.findIndex((it:any)=>it?.category===5&&ds.items.Armor[it.subCategory]?.upperBodyClothing);
  const origType=types[index],origMunicipal=town.industries,origPrivate=town.playersIndustries;
  types[index]={...types[index],consumption:[{item:food,amount:2}],production:[{item:food,amount:3},{item:coat,amount:1}]};
  town.industries=[{type:index,employees:1},{type:index,employees:1}];town.playersIndustries=[];const cp=town.getConsumptionProduction(localDs),foodRow=cp.productsList.find(e=>e.item===food);
  assert(foodRow?.production===4&&foodRow.consumption===4&&cp.categoryProducts.food.production===2*itemDefinition(ds,food)!.calories,'food industry input/output separated from remaining category calories');
  assert(cp.categoryProducts.upperBodyClothing.production===2&&!cp.productsList.some(e=>e.item===coat),'armor classified once, not duplicated as raw-item output');
  types[index]=origType;town.industries=origMunicipal;town.playersIndustries=origPrivate;
  town.stock.clear();town.incompleteProduction=[{item:62,amount:.25}];town.playersIncompleteProduction=[{item:62,amount:.75}];const save=JSON.parse(JSON.stringify(makeSave(gd)));for(const data of [save,originalSaveToSaveData({save:saveDataToOriginal(save)})]){applySave(gd,data);const t=gd.Towns[0];assert(t.stock.size===0&&t.playersStorage.find(e=>e.type===62)?.amount===3,'explicit empty stock and private warehouse restore');assert(t.incompleteProduction[0].amount===.25&&t.playersIncompleteProduction[0].amount===.75&&t.historicalData.length===6,'fraction and history persisted');}
}]);
checks.push(['NPC 当前路线点按百分比出售、按重量购入和结算时点',()=>{
  sample();const town=gd.Towns[0],npc=new NpcCaravan(999,[0,0],'内存路线商队');npc.pointIdx=1;npc.routePoint=0;npc.points=[{town:0,sell:[{item:65,amount:100}],buy:[]},{town:0,sell:[{item:65,amount:25}],buy:[]}];npc.cargo=new Map([[65,20]]);npc.money=100;town.stock.clear();town.money=1000;
  const fixed={Economy:{price:(_ds:any,_town:any,_id:number,amount:number)=>amount*2}};gd.npcTradeAtTown(npc,ds,fixed);assert(npc.cargo.get(65)===15&&town.stock.get(65)===5&&npc.money===110&&town.money===1001,'current point percent, integral price and original cash contribution');assert(npc.routePoint===1&&npc.lastConsumption===gd.Time,'route marker and consumption timestamp');
  const classItems=ds.items.Items.map((it:any,id:number)=>({id,data:itemDefinition(ds,id)})).filter(e=>e.data?.upperBodyClothing).slice(0,2);assert(classItems.length===2,'class selector fixture');npc.cargo=new Map(classItems.map(e=>[e.id,10]));npc.points[1].sell=[{item:'upperBodyClothing',amount:10}];gd.npcTradeAtTown(npc,ds,fixed);assert(classItems.every(e=>npc.cargo.get(e.id)===9&&town.stock.get(e.id)===1),'all matching class items sold, not wrong fixed IDs');
  npc.points[1]={town:0,sell:[],buy:[{item:65,amount:50},{item:65,amount:50}]};npc.cargo.clear();npc.people=[new Character({basePhysical:10})];npc.transports=[];town.stock=new Map([[65,10000]]);const view=new Caravan();view.People=npc.people;const limit=Math.floor(view.maxCargo/itemWeightKg(ds,65));gd.npcTradeAtTown(npc,ds,fixed);assert((npc.cargo.get(65)??0)<=limit&&(npc.cargo.get(65)??0)>0&&near((npc.cargo.get(65)??0)+(town.stock.get(65)??0),10000),'weight quotas and overlapping selectors cannot duplicate stock');
  sample();gd.npcCaravans=[];const random=Math.random;try{Math.random=()=>.5;gd.spawnNpcCaravans(ds);}finally{Math.random=random;}
  const routes=ds.presets.caravan_routes[0],fleet=gd.npcCaravans,routeCount=routes.filter((r:any)=>r.onInit!==false&&r.points?.length).length;
  assert(fleet.length===routeCount&&fleet.every(n=>n.people.length===routes[n.route].size&&n.transports.length===n.people.length*2&&n.points.length===routes[n.route].points.length),'actual preset routes materialise people, mounts, carts and trade entries');
  assert(fleet.every(n=>n.speedKmh>0&&n.lastConsumption===gd.Time&&n.pointIdx>0),'initial arrival is settled and carts without a speed do not immobilise the fleet');
  const first=fleet[0],mount=first.transports.find(t=>t.cart);assert(mount?.cart.attachedTo===mount&&Object.values(first.inUse).some(n=>n>0),'actual route auto equipment and towing');
  const stored=JSON.parse(JSON.stringify(makeSave(gd)));applySave(gd,stored);const restored=gd.npcCaravans[0],restoredMount=restored.transports.find(t=>t.cart);assert(restoredMount?.cart.attachedTo===restoredMount&&restored.points.length===routes[0].points.length&&JSON.stringify(restored.inUse)===JSON.stringify(first.inUse),'NPC routes, equipment and towing references survive memory save conversion');
  gd.spawnNpcCaravans(ds);assert(gd.npcCaravans.length===routeCount,'map reopen does not duplicate route caravans');
  const legacy=JSON.parse(JSON.stringify(stored));legacy.npcCaravans[1].people=[];legacy.npcCaravans[1].transports=[];delete legacy.npcCaravans[1].inUse;delete legacy.npcCaravans[1].points;legacy.npcCaravans[1].route=0;
  const priorMoney=legacy.npcCaravans[1].money,priorStock=JSON.stringify(legacy.towns.map((t:any)=>t.stock));applySave(gd,legacy);const migrated=gd.npcCaravans[1];
  assert(migrated.route===1&&migrated.people.length===routes[1].size&&migrated.money===priorMoney&&JSON.stringify(makeSave(gd).towns!.map(t=>t.stock))===priorStock,'legacy route identity and units repaired once without replaying town trades');
  restored.routePoints=[0,1];restored.points=[{town:0},{town:1}];restored.pointIdx=1;restored.routePoint=1;restored.x=gd.Towns[0].x;restored.y=gd.Towns[0].y;restored.direction=null;restored.moving=true;gd.Towns[0].active=false;gd.gameSpeed=1;
  const trade=gd.npcTradeAtTown.bind(gd);let arrivals=0;gd.npcTradeAtTown=(...args)=>{arrivals++;return trade(...args);};
  for(let i=0;i<3;i++)gd.moveNpcRoute(restored,100000,fixed);
  assert(arrivals===1&&!restored.moving&&restored.x===gd.Towns[1].x&&restored.y===gd.Towns[1].y,'arrival clamps overshoot and parks without a second active destination; no per-frame trades');
}]);

let running=false;
async function run(){if(running)return;running=true;results.textContent='';errors.textContent='';let passed=0;for(const [name,test] of checks){try{await test();passed++;results.textContent+='PASS '+name+'\n';}catch(e){results.textContent+='FAIL '+name+'\n';errors.textContent+=String((e as Error).stack??e)+'\n';}}results.setAttribute('data-result',passed===checks.length?'PASS':'FAIL');results.textContent+=passed+'/'+checks.length+' 组最小回归';sample();running=false;}
new Input(canvas,()=>menu.screen);
document.querySelector('#sample')!.addEventListener('click',sample);
document.querySelector('#empty')!.addEventListener('click',()=>{const c=gd.Caravans[0];c.transports=[];c.cargo.clear();menu.setCategory(m.category);});
document.querySelector('#containers')!.addEventListener('click',()=>m.openManageContainers());
document.querySelector('#book')!.addEventListener('click',()=>{menu.setCategory(8);m.openCargoRead(105);});
document.querySelector('#check')!.addEventListener('click',run);
document.querySelector('#settings')!.addEventListener('click',()=>{sample();m.openSettings();});
document.querySelector('#crew')!.addEventListener('click',()=>{sample();menu.setCategory(2);});
document.querySelector('#workshop-bottom')!.addEventListener('click',()=>{sample();menu.setCategory(9);const list=menu.mainArea.children.find(s=>s instanceof ScrollableArea) as ScrollableArea;list.scroll=-1e9;});
document.querySelector('#economy')!.addEventListener('click',()=>{sample();menu.setCategory(1);});
document.querySelector('#slaves')!.addEventListener('click',()=>{sample();const battle:any={screen:menu.screen,gd,assets,text:(id:number)=>getText(ds,id),restoreNativeCursor:()=>{},takeSlaves:(_n:number,choice:string)=>{state.textContent='内存奴隶选项：'+choice;},finishVictory:()=>{throw Error('slave dialog fallback');}};Battle.prototype.showSlaveMenu.call(battle,3);});
sample();
function draw(){try{menu.update(1/60);ctx.clearRect(0,0,880,495);menu.screen.render(ctx);state.textContent='仅内存 | 当前页 '+m.category+' | '+['概观','日志','人员','装备','用品','载具/家畜','拖车','乘客','货物','工作房','关闭'][m.category]+' | 子节点 '+menu.mainArea.children.length+' | '+labels(menu.mainArea).slice(0,6).join(' · ');}catch(e){errors.textContent+=String(e)+'\n';return;}requestAnimationFrame(draw);}draw();
