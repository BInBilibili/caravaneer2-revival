// Five focused in-memory regressions. No SaveSlots, localStorage or user save access.
import {loadDataStore,getText} from '../src/core/DataStore';
import {AssetStore} from '../src/core/Assets';
import {Sprite,DisplayObject} from '../src/core/Display';
import {EngineText} from '../src/core/EngineText';
import {Input} from '../src/core/Input';
import {PaperArrow} from '../src/core/PaperArrow';
import {ConsProdGraph,HistoricalPoint} from '../src/game/ConsProdGraph';
import {GameData,Character} from '../src/game/World';
import {Story} from '../src/game/Story';
import {CaravanMenu} from '../src/game/CaravanMenu';
import {MapMode} from '../src/game/MapMode';
import {TownMode} from '../src/game/TownMode';
import {settleTownEconomy} from '../src/game/TownEconomy';
import {getItemData,itemName} from '../src/game/Economy';
const canvas=document.querySelector<HTMLCanvasElement>('#stage')!,ctx=canvas.getContext('2d')!;
const state=document.querySelector('#state')!,results=document.querySelector('#results')!,errors=document.querySelector('#errors')!;
window.addEventListener('error',e=>errors.textContent+=String(e.error?.stack??e.message)+'\n');
window.addEventListener('unhandledrejection',e=>errors.textContent+=String(e.reason?.stack??e.reason)+'\n');
const ds=await loadDataStore(18),assets=new AssetStore(ds);
(globalThis as any).__c2={ds};(globalThis as any).__c2Story=Story;
(globalThis as any).__c2GetItemData=(id:number)=>getItemData(ds,id);
await assets.loadFonts();
await Promise.all(['InterfaceBackground.png','InterfaceForeground.png','TownBG.jpg','MapBG.png','GenericBackground.png','CaravanMenuCategoryButton.png','CaravanMenuCategoryButtonShine.png',...[1,2,3,4,5,6,9].flatMap(i=>['Up','Down'].map(s=>'InterfaceButton'+i+s+'.png'))].map(n=>assets.ensure(n)));
let gd:GameData,menu:CaravanMenu|null=null,map:MapMode|null=null,townMode:TownMode|null=null,screen:Sprite;
const assert=(ok:unknown,msg:string)=>{if(!ok)throw Error(msg);};
const near=(a:number,b:number)=>Math.abs(a-b)<1e-6;
const noop=()=>{};
const descendants=(s:Sprite):DisplayObject[]=>s.children.flatMap(ch=>ch instanceof Sprite?[ch,...descendants(ch)]:[ch]);
const globalAt=(node:DisplayObject,x=10,y=10)=>{for(let n:DisplayObject|null=node;n;n=n.parent){x=x*n.scaleX+n.x;y=y*n.scaleY+n.y;}return {x,y};};
function click(node:DisplayObject,x=10,y=10){const p=globalAt(node,x,y),hit=screen.hitTestPoint(p.x,p.y);assert(hit===node,'actual pointer hit missed '+(node.name||node.constructor.name));hit!.dispatchClick();}
const point=(time:number,prod:number,cons=0,item=1):HistoricalPoint=>({time,production:[{item,amount:prod}],consumption:[{item,amount:cons}],playersProduction:[],playersConsumption:[]});
const graphOf=()=>descendants(screen).find(n=>n instanceof ConsProdGraph) as ConsProdGraph;
function reset(){
  map?.destroy();map=null;menu=null;townMode=null;
  gd=new GameData(ds,{storyMode:true,difficulty:1,character:null});(globalThis as any).__c2.shell={gd};gd.story=new Story(ds);
  gd.gameSpeed=0;gd.autoSave=false;gd.npcCaravans=[];
  // Exclude unrelated NPC spawning while preserving real MapMode/updatePeople/HUD paths.
  gd.spawnNpcCaravans=noop;gd.Towns.forEach(t=>t.active=false);
  const c=gd.Caravans[0];c.moving=false;c.hunt=false;c.collectForage=false;c.cargo.clear();c.inUse={};c.transports=[];
  c.People=[new Character({name:'内存测试队长',category:1,basePhysical:10,baseAgility:10,_HP:200})];
  c.historicalData=[];return c;
}
function diary(){
  const c=reset();c.money=388.38;
  c.historicalData=Array.from({length:41},(_,i)=>({...point(gd.Time-i*86400,0,i<3?1.3:i<9?0:i<14?.65:1.1),production:[{item:62,amount:1}],consumption:[{item:1,amount:i<3?1.3:i<9?0:i<14?.65:1.1},{item:45,amount:.3}]}));
  gd.knownPrices=[{item:1,town:16,location:0,buyTime:gd.Time-9*86400,sellTime:-1,buyPrice:0,sellPrice:0},{item:1,town:0,location:0,buyTime:gd.Time-7*86400,sellTime:-1,buyPrice:1.76,sellPrice:0},{item:65,town:0,location:0,buyTime:gd.Time,sellTime:gd.Time,buyPrice:4,sellPrice:2}];
  gd.lastCaravanMenuCategory=1;menu=new CaravanMenu(gd,ds,assets,{onClose:noop,onSave:noop,onOptions:noop});screen=menu.screen;
  graphOf().clickProduct(1);
}
function mapSample(){
  const c=reset();c.cargo=new Map([[216,1],[130,9]]);c.x+=170;c.y+=130;
  map=new MapMode(gd,ds,assets,{onEnterTown:noop,onOpenMenu:noop,onEncounter:noop,onNpcCaravan:noop,onNotify:noop,onAutoSave:noop});
  map.battleInProgress=true;screen=map.screen;map.update(.31);return c;
}
const hudFood=()=>((map as any).counters[1].digits as any[]).reduce((n,d,i)=>n+d.val*10**i,0);
function addFood(){const c=gd.Caravans[0];c.cargo.set(66,10);c.cargo.set(1,10);const gs=c.getSettingsGroup(1);gs.foodRations=100;gs.foodstuffs[ds.items.Items[66].subCategory]=100;map?.update(.31);}
function advance(seconds:number){gd.gameSpeed=1;map!.update(seconds/6000);gd.gameSpeed=0;map!.update(.31);}
function makeTownHistory(){
  reset();const t=gd.Towns[0];t.active=true;t.population=0;t.industries=[{type:2,employees:30} as any];t.playersIndustries=[];t.historicalData=[];t.incompleteProduction=[];
  // Actual sheep farm recipe: 30 workers * 1.8 wool/day = 54/day; stored flow = 27/half-day.
  for(let i=0;i<6;i++){t.stock=new Map([[62,100000],[1,100000]]);t.cpCache=null;settleTownEconomy(t,ds,gd.Time-(5-i)*43200,()=>.5);}
  return t;
}
function townSample(){
  const t=makeTownHistory();townMode=new TownMode(gd,t,ds,assets,{onExitToMap:noop,onOpenCaravanMenu:noop,onOpenNavigation:noop});screen=townMode.screen;
  (townMode as any).openStatsPage();click((townMode as any).statsButtons[1]);(townMode as any).recentDataGraph.clickProduct(87);
}
const makeGraph=(data:HistoricalPoint[],period=1)=>{const g=new ConsProdGraph(620,180,null,false,true,id=>itemName(ds,id),id=>getText(ds,id),t=>gd.makeDate(t),assets);g.selectedPeriod=period;g.update(data);return g;};
const vertices=(g:ConsProdGraph)=>g.plot.graphics!.ops.filter((o:any)=>o.k==='moveTo'||o.k==='lineTo');
const checks:Array<[string,()=>void|Promise<void>]>=[];
checks.push(['日记：真实命中、双向时间切换、换品项/页签后保留范围',()=>{
  diary();let g=graphOf();assert(g.selectedPeriod===1,'initial 30 days');
  for(const expected of [2,3,1]){click(g.changePeriodButtons[1].disp);assert(g.selectedPeriod===expected,'forward period '+expected);assert(g.periodText.text===getText(ds,[0,5925,5926,5956][expected]).toUpperCase(),'period label');}
  click(g.changePeriodButtons[0].disp);assert(g.selectedPeriod===3,'backward wraps to all');
  const before=JSON.stringify(g.data),selected=g.selectedItem;click(descendants(screen).find(n=>n.name==='known-price-next')!);g=graphOf();assert(g.selectedPeriod===3&&g.selectedItem===selected,'known-price redraw preserves graph state');
  click(descendants(screen).find(n=>n.name==='diary-tab-1')!);click(descendants(screen).find(n=>n.name==='diary-tab-0')!);g=graphOf();assert(g.selectedPeriod===3&&g.selectedItem===selected,'bookmark return preserves state');
  const other=g.products.find(p=>p.item!==selected);click(other.normalText);assert(g.selectedItem===other.item,'actual product row click');assert(JSON.stringify(g.data)===before,'graph must not mutate history');
}]);
checks.push(['图表：时间边界插值、尖峰像素裁剪、隐藏竖排标签、空数据清理',()=>{
  diary();const end=gd.Time,day=86400;
  const g=makeGraph([point(end,2,0),point(end-29*day,0,2),point(end-31*day,100,0)]);
  const v=vertices(g);assert(v.length===6,'two three-point series');assert(v.every((o:any)=>Number.isFinite(o.x)&&Number.isFinite(o.y)&&o.x>=-1e-7&&o.x<=g.plot.clipW+1e-7&&o.y>=-1e-7&&o.y<=g.plot.clipH+1e-7),'all curve vertices inside axes');
  assert(near(v[2].x,0)&&near(v[2].y,0),'50-unit interpolated left value included in scale');assert(g.balanceText.text.endsWith(': 0'),'off-period record not included in balance');
  assert(g.hGraphTexts.length>0&&g.hGraphTexts.every(t=>!t.text.visible),'no web-only vertical date labels');
  const off=document.createElement('canvas');off.width=460;off.height=210;const c=off.getContext('2d')!;g.plot.x=8;g.plot.y=8;g.plot.render(c);
  const px=c.getImageData(0,0,off.width,off.height).data;let inside=0,outside=0;
  for(let y=0;y<off.height;y++)for(let x=0;x<off.width;x++)if(px[(y*off.width+x)*4+3]){if(x<8||x>=Math.ceil(8+g.plot.clipW)||y<8||y>=Math.ceil(8+g.plot.clipH))outside++;else inside++;}
  assert(inside>100&&outside===0,'real raster clip including stroke edges');
  g.update([]);assert(!g.plot.graphics!.ops.length&&!g.vGraphTexts.length&&!g.hGraphTexts.length&&g.noDataText.visible,'cleared history clears all graph layers');
  g.update([point(end,2),point(end,3)]);assert(g.noDataText.visible&&!g.products.length,'degenerate timestamps safe');g.remove();
}]);
checks.push(['原版样式：5px页签缝、20px纹理箭头、浅色选中文字',()=>{
  diary();const tabs=descendants(screen).filter(n=>n.name.startsWith('diary-tab-'));assert(tabs.length===2&&near(tabs[1].x-tabs[0].x,215),'210px tabs plus 5px gap');
  const arrows=descendants(screen).filter(n=>n.name.startsWith('known-price-'));assert(arrows.length===2&&arrows.every(n=>n instanceof PaperArrow&&n.hitTestPoint(n.x+19,n.y+19)===n&&!n.hitTestPoint(n.x+21,n.y+10)),'original 20px arrows');
  const g=graphOf(),selected=g.products.find(p=>p.item===1),label=selected.inverseText.children[0] as EngineText;
  assert(label.color===0xeee5cd&&label.blendMode==='normal'&&selected.inverseText.blendMode==='normal','clear system glyphs without nested erase');
  const off=document.createElement('canvas');off.width=20;off.height=20;const c=off.getContext('2d')!;arrows[0].renderSelf(c);const px=c.getImageData(0,0,20,20).data;
  assert(px[3]>0&&px[(10*20+10)*4+3]===0,'textured square and transparent triangular cutout');
}]);
checks.push(['地图食物：1089误计复现、六小时实际扣粮、HUD与消耗日志一致',()=>{
  const c=mapSample();const legacy=[...c.cargo].reduce((n,[id,amount])=>n+(ds.items.Goods[ds.items.Items[id].subCategory]?.calories??0)*amount,0);
  assert(legacy===1089&&c.food===0&&hudFood()===0,'non-food equipment must not be reported as 1089 kcal');
  addFood();const start=c.food,startAmount=c.cargoAmount(66);assert(hudFood()===Math.floor(start)&&start>0,'real food shown');
  advance(21599);assert(c.cargoAmount(66)===startAmount,'no meal before six-hour boundary');advance(1);
  const used=startAmount-c.cargoAmount(66),cal=ds.items.Goods[ds.items.Items[66].subCategory].calories;
  assert(used>0&&near(c.food,start-used*cal)&&hudFood()===Math.floor(c.food),'scheduled meal reduces real cargo and map display');
  assert(c.cargoAmount(216)===1&&c.cargoAmount(130)===9,'clothes and ammo remain unchanged');
  const rows=c.historicalData.flatMap(p=>p.consumption);assert(near(rows.filter(e=>e.item===66).reduce((n,e)=>n+e.amount,0),used)&&!rows.some(e=>e.item===216||e.item===130),'ledger logs only actual food');
  const after=c.cargoAmount(66);c.getSettingsGroup(1).foodRations=0;advance(21600);assert(c.cargoAmount(66)===after,'zero rations are intentionally respected');
  c.getSettingsGroup(1).foodRations=100;c.getSettingsGroup(1).foodstuffs[ds.items.Items[66].subCategory]=0;advance(21600);assert(c.cargoAmount(66)===after,'zero food preference is intentionally respected');
  results.textContent+='  装备误计1089→0；真实食物 '+start.toFixed(2)+'→'+c.food.toFixed(2)+' kcal；扣除 '+used.toFixed(6)+' 单位\n';
}]);
checks.push(['城镇：真实配方半日产量转日产量，非零起点及缺料停产',()=>{
  const t=makeTownHistory();assert(t.historicalData.every(p=>near(p.production.find(e=>e.item===87)?.amount??0,27)),'sheep recipe records 27 wool per half-day');
  const g=makeGraph(t.historicalData,3);g.clickProduct(87);const v=vertices(g),production=v.slice(0,6);
  assert(production.length===6&&production.every((o:any)=>near(o.y,0))&&near(production[5].x,0),'constant 54/day starts above zero without fictional origin');
  assert(g.vGraphTexts.some(t=>t.val===50)&&g.balanceText.text.endsWith('+162'),'daily y scale and actual period totals');
  t.stock.clear();t.cpCache=null;const stopped=settleTownEconomy(t,ds,gd.Time+43200,()=>.5);assert(!stopped.production.some(e=>e.item===87),'no input stock means no phantom production');
  results.textContent+='  真实配方：27 单位/半天 = 54 单位/天；无原料产量为0；历史不补零也不重写\n';g.remove();
}]);
let running=false;
async function run(){if(running)return;running=true;results.textContent='';errors.textContent='';let passed=0;for(const [name,test]of checks){try{await test();passed++;results.textContent+='PASS '+name+'\n';}catch(e){results.textContent+='FAIL '+name+'\n';errors.textContent+=String((e as Error).stack??e)+'\n';}}results.setAttribute('data-result',passed===checks.length?'PASS':'FAIL');results.textContent+=passed+'/'+checks.length+' 组最小回归';diary();running=false;}
new Input(canvas,()=>screen);
document.querySelector('#check')!.addEventListener('click',run);
document.querySelector('#diary')!.addEventListener('click',diary);
document.querySelector('#town')!.addEventListener('click',townSample);
document.querySelector('#map')!.addEventListener('click',mapSample);
document.querySelector('#food')!.addEventListener('click',()=>{if(!map)mapSample();addFood();});
document.querySelector('#meal')!.addEventListener('click',()=>{if(!map)mapSample();advance(21600);});
diary();
function draw(){try{menu?.update(1/60);if(map)map.update(1/60);ctx.clearRect(0,0,880,495);screen.render(ctx);const g=menu?graphOf():townMode?(townMode as any).recentDataGraph:null;state.textContent='仅内存 | '+(map?'地图：食物 '+gd.Caravans[0].food.toFixed(2)+' kcal / HUD '+hudFood():g?'范围 '+(g.periodText?.text??'30天')+' | 品项 '+itemName(ds,g.selectedItem??0)+' | 结算 '+g.balanceText.text:'示例')+' | 不读写用户存档';}catch(e){errors.textContent+=String((e as Error).stack??e)+'\n';return;}requestAnimationFrame(draw);}draw();
