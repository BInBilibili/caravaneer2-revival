// In-memory UI-only fixture. Never reads/writes browser saves or opens file dialogs.
import { loadDataStore } from '../src/core/DataStore';
import { AssetStore } from '../src/core/Assets';
import { Sprite, Graphics } from '../src/core/Display';
import { EngineText } from '../src/core/EngineText';
import { Input } from '../src/core/Input';
import { ScrollableArea } from '../src/core/Ui';
import { GameShell } from '../src/game/Shell';
import { SaveSlots } from '../src/game/SaveSystem';
import { LoadSaveDialogue } from '../src/game/LoadSaveDialogue';
const canvas=document.querySelector<HTMLCanvasElement>('#stage')!,ctx=canvas.getContext('2d')!;
const state=document.querySelector('#state')!,errors=document.querySelector('#errors')!;
window.addEventListener('error',e=>errors.textContent+=String(e.error?.stack??e.message)+'\n');
window.addEventListener('unhandledrejection',e=>errors.textContent+=String(e.reason?.stack??e.reason)+'\n');
const ds=await loadDataStore(18),assets=new AssetStore(ds);
await assets.loadFonts();
await Promise.all(['TitleScreen.jpg','InterfaceBackground.png','InterfaceForeground.png','InterfaceButton2Up.png','InterfaceButton2Down.png'].map(n=>assets.ensure(n)));
const memory:any={data:{saves:[]},flush:()=>{}};
const slots=new SaveSlots(memory),screen=new Sprite();
let actions:string[]=[];
const dlg=new LoadSaveDialogue(ds,assets,slots,{
  onLoad:i=>{actions.push('load:'+i);}, onSave:i=>{actions.push('save:'+i);},
  onDelete:i=>{actions.push('delete:'+i);slots.deleteSlot(i);dlg.refresh('load');},
  onClose:()=>{actions.push('close');dlg.screen.visible=false;},
  onImport:i=>{actions.push('import:'+i);}, onExport:()=>{actions.push('export');},
});
const shell:any=Object.assign(Object.create(GameShell.prototype),{ds,assets,cfg:{soundFXOn:true,musicOn:true},savedData:memory,currentScreen:screen,openSaveDlg:()=>{dlg.show('load');}});
shell.buildTitle(); screen.addChild(dlg.screen);
const names=['[自动保存]','asuz','2026-07-24 22:24','主角','主角-贩药','test'];
function sample(){
  memory.data.saves=names.map((name,i)=>({name,date:new Date(2026,6,24,22,30-i).toISOString(),data:{name,day:1,caravan:{money:600}}}));
  actions=[];dlg.show('load');
}
const click=(x:number,y:number)=>{const target=dlg.screen.hitTestPoint(x,y);if(!target)throw Error('No hit at '+x+','+y);target.dispatchClick();};
const assert=(ok:unknown,why:string)=>{if(!ok)throw Error(why);};
const last=()=>actions[actions.length-1];
function checks(){
  sample();
  memory.data.saves[2].date=new Date(2026,6,25).toISOString();dlg.show('load');
  click(320,322);assert(last()==='load:2','Newest date loads original storage index');
  sample();
  const panel=dlg.screen.children[0] as Sprite;
  assert(panel.x===125&&panel.y===33,'Original panel origin');
  const list=panel.children.find(c=>c instanceof ScrollableArea) as ScrollableArea;
  assert(list.x===20&&list.y===60&&list.Content.children.length===6,'Original list geometry');
  const labels=()=>list.Content.children.map(r=>(r as Sprite).children.find(c=>c instanceof EngineText) as EngineText);
  assert(labels()[0].text==='[自动保存]'&&labels()[0].color===4735032,'Initial white selection');
  click(300,123); click(320,322);assert(last()==='load:1','Selected row load');
  assert(labels()[1].color===4735032&&labels()[0].color===0xffffff,'Selection colors');
  click(320,402); assert(last()==='load:1','Delete waits for confirmation');
  click(300,95);click(320,432);assert(last()==='load:1'&&dlg.screen.visible,'Confirmation blocks underlying UI');
  const confirm=dlg.screen.children.at(-1) as any;
  confirm.cancelFunction();assert(slots.count()===6,'Cancel deletion preserves entries');
  click(320,402);confirm.approveFunction();assert(last()==='delete:1'&&slots.count()===5,'Delete selected storage index');
  click(300,123);click(320,322);assert(last()==='load:2','Sparse storage index after deleting');
  click(320,372);assert(last()==='import:1','Import uses first empty slot');
  click(320,432);assert(!dlg.screen.visible&&last()==='close','Cancel closes modal');
  memory.data.saves=[];dlg.show('load');actions=[];
  click(320,322);click(320,402);assert(actions.length===0,'Empty list guards load/delete');
  click(320,372);assert(last()==='import:0','Empty list permits import');
  sample();click(320,372);assert(actions.length===0,'Full storage import requires confirmation');
  (dlg.screen.children.at(-1) as any).approveFunction();assert(last()==='import:0','Confirmed full-storage import');
  dlg.show('save');click(630,452);assert(last()==='export','SOL export remains available in save mode');
  sample();state.dataset.checks='PASS: 布局/排序选中与槽位映射；删除确认和遮罩；空列表/导入/取消/保留导出';
}
new Input(canvas,()=>screen);
document.querySelector('#sample')!.addEventListener('click',sample);
document.querySelector('#empty')!.addEventListener('click',()=>{memory.data.saves=[];actions=[];dlg.show('load');});
document.querySelector('#check')!.addEventListener('click',()=>{try{checks();}catch(e){errors.textContent+=String(e)+'\n';}});
sample();
function draw(){ctx.clearRect(0,0,880,495);screen.render(ctx);state.textContent=(state.dataset.checks??'仅内存，不读写用户存档')+'\n'+actions.join(' | ');requestAnimationFrame(draw);}
draw();