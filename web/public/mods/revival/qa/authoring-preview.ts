import {sampleSkeleton,slotMatrix,orderedSkeletonSlots,transformPoint,type AffineTransform,type BoneKeyframe,type BoneTransform,type SkeletonAnimation,type SkeletonSlot,type SlotKeyframe,type SkeletonEvent} from '../runtime/BattleSkeleton';
import {type Project,channels,clone,fork,near,unique,safeName,localPose,putKey,validateProject,originalPatch,blankProject,demoProject,directionGroup,directionalClip} from './authoring-editor-model';
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>el<HTMLInputElement>(id), select=(id:string)=>el<HTMLSelectElement>(id);
const val=(id:string)=>input(id).value, checked=(id:string)=>input(id).checked;
const text=(id:string,s:string)=>{el(id).textContent=s;};
const disable=(id:string,b:boolean)=>{(el(id) as HTMLButtonElement).disabled=b;};
const on=(id:string,fn:()=>unknown)=>{el(id).addEventListener('click',()=>{Promise.resolve().then(fn).catch(fail);});};
const change=(id:string,fn:()=>unknown)=>{const run=()=>{Promise.resolve().then(fn).catch(e=>{fail(e);refresh();});};el(id).addEventListener('change',run);el(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run();}});};
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
const number=(id:string,min=-100000,max=100000)=>{const s=val(id),n=Number(s);if(!s.trim()||!Number.isFinite(n)||n<min||n>max)throw Error(`请输入 ${min} 到 ${max} 之间的有效数字。`);return n;};
const label=(name:string)=>({root:'整体 / 根节点',body:'身体',head:'头部',arm_L:'左上臂',arm_R:'右上臂',forearm_L:'左前臂',forearm_R:'右前臂',leg_L:'左腿',leg_R:'右腿',idle:'待机',walk:'行走'}[name]??name);
let toastTimer=0;
function toast(s:string){text('toast',s);el('toast').hidden=false;clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>el('toast').hidden=true,3500);}
function fail(e:unknown){text('errors',(e instanceof Error?e.message:String(e))+'\n（点击关闭）');el('errors').hidden=false;}
el('errors').onclick=()=>el('errors').hidden=true;
window.addEventListener('error',e=>fail(e.error??e.message));window.addEventListener('unhandledrejection',e=>fail(e.reason));
type Kind='bone'|'slot'|'event';
let project:Project=demoProject(), baseline:Project|undefined, clip='walk', time=0,direction=0,bone='body',slot='body',event=-1,kind:Kind='bone';
let playing=false, tool:'move'|'rotate'='move',dirty=false, revision=0, copied:BoneKeyframe|undefined;
let sampleAnimation:SkeletonAnimation, sampledSource:SkeletonAnimation|undefined;
const animation=()=>project.animations[clip];
function sample(t=time){if(sampledSource!==animation()){sampledSource=animation();sampleAnimation={...animation(),loop:false};}return sampleSkeleton(project.definition,sampleAnimation,t);}
function invalidate(){sampledSource=undefined;project.definition={...project.definition};}
const track=()=>animation().tracks.find(t=>t.bone===bone);
const pose=()=>localPose(track()?.keys??[],time);
const boneKey=()=>track()?.keys.find(k=>near(k.time,time));
const selectedSlot=()=>project.definition.slots.find(s=>s.name===slot);
const snapTime=(t:number)=>clamp(checked('snap')?Math.round(t*animation().fps)/animation().fps:t,0,animation().duration);
type Snapshot={project:Project;baseline:Project|undefined;clip:string;time:number;bone:string;slot:string;event:number;kind:Kind;direction:number};
const snapshot=():Snapshot=>({project,baseline,clip,time,bone,slot,event,kind,direction});
const undoStack:Snapshot[]=[],redoStack:Snapshot[]=[];
function restore(s:Snapshot){({project,baseline,clip,time,bone,slot,event,kind,direction}=s);sampledSource=undefined;playing=false;revision++;dirty=true;refresh();scheduleDraft();}
function commit(before:Snapshot){el('errors').hidden=true;undoStack.push(before);if(undoStack.length>40)undoStack.shift();redoStack.length=0;dirty=true;revision++;invalidate();refresh();scheduleDraft();}
function edit(fn:()=>void){playing=false;const before=snapshot();project=fork(project,clip);try{fn();invalidate();sample();commit(before);}catch(e){restore(before);throw e;}}
function undo(){if(drag)return;const s=undoStack.pop();if(s){redoStack.push(snapshot());restore(s);toast('已撤销');}}
function redo(){if(drag)return;const s=redoStack.pop();if(s){undoStack.push(snapshot());restore(s);toast('已重做');}}
function putPose(p:BoneTransform){let t=track();if(!t){t={bone,keys:[]};animation().tracks.push(t);}putKey(t.keys,{time,transform:{...p},interpolation:select('interpolation').value as 'linear'|'step'});}
function readPose(){const out=pose();for(const c of channels)out[c]=number(c,c==='alpha'?0:-100000,c==='alpha'?1:100000)*(c==='rotation'?Math.PI/180:1);return out;}
function canEditPose(){if(!checked('autoKey')&&!boneKey()){toast('自动记录已关闭：请先点击「记录当前姿势」，或开启自动记录。');return false;}return true;}
function tab(k:Kind){kind=k;for(const id of ['bone','slot','event']){el(`${id}Inspector`).hidden=id!==k;el(`${id}Tab`).setAttribute('aria-selected',String(id===k));}inspector();}
const optionSignatures=new Map<string,string>();
function options(id:string, entries:[string,string][],value:string){const s=select(id),signature=JSON.stringify(entries);if(optionSignatures.get(id)!==signature){s.replaceChildren(...entries.map(([v,t])=>new Option(t,v)));optionSignatures.set(id,signature);}s.value=value;}
function button(title:string,fn:()=>void,selected=false){const b=document.createElement('button');b.type='button';b.textContent=title;b.classList.toggle('selected',selected);b.onclick=fn;return b;}
function lists(){
  const search=val('boneSearch').toLowerCase();
  el('boneList').replaceChildren(...project.definition.bones.filter(b=>(label(b.name)+b.name).toLowerCase().includes(search)).map(b=>{const x=button(label(b.name),()=>{bone=b.name;kind='bone';tab('bone');refresh();},b.name===bone);x.title=b.name;return x;}));
  text('boneCount',String(project.definition.bones.length));
  el('slotList').replaceChildren(...project.definition.slots.map(s=>button(label(s.name),()=>{slot=s.name;bone=s.bone;tab('slot');refresh();},s.name===slot)));
  el('eventList').replaceChildren(...(animation().events??[]).map((e,i)=>button(`${e.time.toFixed(2)}s · ${e.name}`,()=>{event=i;kind='event';seek(e.time);refresh();},i===event)));
}
function inspector(){
  if(!project.definition.bones.some(b=>b.name===bone))bone=project.definition.bones[0].name;
  const tr=pose();for(const c of channels)input(c).value=String(+(tr[c]*(c==='rotation'?180/Math.PI:1)).toFixed(3));
  select('interpolation').value=boneKey()?.interpolation??'linear';text('boneTitle',label(bone));input('boneName').value=bone;text('keyState',boneKey()?'◆ 已记录':'◇ 尚未记录');
  disable('deleteKey',!boneKey());disable('pasteKey',!copied);
  const b=project.definition.bones.find(b=>b.name===bone)!;
  const descendants=new Set([bone]);let more=true;while(more){more=false;for(const b of project.definition.bones)if(b.parent&&descendants.has(b.parent)&&!descendants.has(b.name)){descendants.add(b.name);more=true;}}
  options('boneParent',[['','（没有父部位）'],...project.definition.bones.filter(b=>!descendants.has(b.name)).map(b=>[b.name,label(b.name)] as [string,string])],b.parent??'');
  const s=selectedSlot(), visibleSample=sample().slots.find(s=>s.name===slot);
  el<HTMLFieldSetElement>('slotFields').disabled=!s;el('slotEmpty').hidden=!!s;
  if(s){input('slotName').value=s.name;options('slotBone',project.definition.bones.map(b=>[b.name,label(b.name)]),s.bone);
    const a=visibleSample?.attachment??'';options('slotAttachment',[['','（不使用图片）'],...Object.keys(project.definition.attachments??{}).map(n=>[n,label(n)] as [string,string])],a);
    input('slotZ').value=String(visibleSample?.z??s.z);input('slotVisible').checked=visibleSample?.visible!==false;attachmentFields(a);
    disable('deleteSlotKey',!(animation().slotTracks??[]).find(t=>t.slot===slot)?.keys.some(k=>near(k.time,time)));
  }
  const e=animation().events?.[event];if(e){input('eventName').value=e.name;input('eventValue').value=e.value===undefined?'':JSON.stringify(e.value);}
  disable('updateEvent',!e);disable('deleteEvent',!e);
  for(const id of ['bone','slot','event']){el(`${id}Inspector`).hidden=id!==kind;el(`${id}Tab`).setAttribute('aria-selected',String(id===kind));}
}
function attachmentFields(name:string){const a=project.definition.attachments?.[name];input('attachmentX').value=String(a?.x??0);input('attachmentY').value=String(a?.y??0);}
function refresh(){
  options('phase',Object.keys(project.animations).map(n=>[n,label(n)]),clip);input('clipName').value=clip;input('duration').value=String(animation().duration);input('fps').value=String(animation().fps);input('loop').checked=!!animation().loop;select('direction').value=String(direction);
  const group=directionGroup(project,clip);if(group)direction=group.indexOf(clip);
  options('direction',[0,1,2,3].map(d=>[String(d),group?project.presentation!.directions[d]:'方向 '+d]),String(direction));
  text('directionHint',group?'切换方向会打开同一动作的对应朝向。':'切换方向只预览插槽配置，不会自动生成四向动作。');
  text('projectNote',project.presentation?.note??'');el('projectNote').hidden=!project.presentation;text('creditsText',project.credits??'');el('projectCredits').hidden=!project.credits;
  text('projectKind',baseline?'原版兼容':project.presentation?.title??'自定义工程');text('canvasCaption',baseline?'原版骨架参考 · 原版部件不在此页重建外观':`${label(clip)} · ${label(bone)}`);
  text('clipHint',baseline?'原版补丁保留事件与原版动作时长。':'所有动作共用部位和图片。图片事件需要游戏端接入。');
  text('dirty',dirty?'有修改 · 请保存工程':'示例 / 未修改');disable('undo',!undoStack.length);disable('redo',!redoStack.length);
  disable('exportAuthoring',!baseline);disable('deleteBone',project.definition.bones.length===1);
  text('status',`${project.definition.bones.length} 个部位 · ${animation().tracks.reduce((n,t)=>n+t.keys.length,0)} 个姿势点 · 编辑器副本，不影响游戏`);
  lists();inspector();timeline();timeUI();draw();
}
function timeUI(){input('time').value=String(+time.toFixed(4));input('time').max=String(animation().duration);input('time').step=String(1/animation().fps);text('timeLabel',`${Math.round(time*animation().fps)} / ${Math.round(animation().duration*animation().fps)} 帧`);text('play',playing?'Ⅱ 暂停':'▶ 播放');el('playhead').style.left=`${timeX(time)}px`;}
function seek(t:number){playing=false;time=clamp(t,0,animation().duration);inspector();timeUI();draw();highlightKeys();}

// One scroll container for labels and keys; no expanding, unscrollable timeline.
const startX=206;let timelineWidth=600;
const timeX=(t:number)=>startX+t/animation().duration*(timelineWidth-startX-20);
function pointerTime(x:number){const rect=el('timelineContent').getBoundingClientRect();return snapTime((x-rect.left-startX)/(timelineWidth-startX-20)*animation().duration);}
type Row={kind:Kind;name:string;keys:(BoneKeyframe|SlotKeyframe|SkeletonEvent)[]};
function rows():Row[]{return [...[...project.definition.bones].sort((a,b)=>Number(!animation().tracks.some(t=>t.bone===a.name))-Number(!animation().tracks.some(t=>t.bone===b.name))).map(b=>({kind:'bone' as const,name:b.name,keys:animation().tracks.find(t=>t.bone===b.name)?.keys??[]})),...(animation().slotTracks??[]).map(t=>({kind:'slot' as const,name:t.slot,keys:t.keys})),{kind:'event',name:'事件',keys:animation().events??[]}];}
function selectRow(row:Row){kind=row.kind;if(kind==='bone')bone=row.name;else if(kind==='slot')slot=row.name;tab(kind);}
function highlightKeys(){for(const node of el('timelineRows').querySelectorAll<HTMLButtonElement>('.key'))node.classList.toggle('selected',node.dataset.kind===kind&&node.dataset.name===(kind==='bone'?bone:kind==='slot'?slot:'事件')&&(kind==='event'?Number(node.dataset.index)===event:near(Number(node.dataset.time),time)));}
function timeline(){
  timelineWidth=Math.max(600,el('timelineScroll').getBoundingClientRect().width-16);el('timelineContent').style.width=timelineWidth+'px';
  const ruler=el('ruler');ruler.replaceChildren();const title=document.createElement('span');title.className='ruler-title';title.textContent='部位 / 时间';ruler.append(title);
  for(let i=0;i<=8;i++){const tick=document.createElement('span');tick.className='tick';tick.textContent=+(animation().duration*i/8).toFixed(2)+'s';tick.style.left=timeX(animation().duration*i/8)+'px';ruler.append(tick);}
  el('timelineRows').replaceChildren(...rows().map(row=>{
    const r=document.createElement('div');r.className='timeline-row';const b=button((row.kind==='bone'?'● ':row.kind==='slot'?'▧ ':'⚑ ')+label(row.name),()=>{selectRow(row);refresh();});b.className='track-label';r.append(b);
    row.keys.forEach((key,index)=>{const k=document.createElement('button');k.type='button';k.className=`key ${row.kind}`;k.style.left=timeX(key.time)+'px';k.title=`${label(row.name)} · ${key.time.toFixed(3)} 秒`;k.setAttribute('aria-label',k.title);Object.assign(k.dataset,{kind:row.kind,name:row.name,time:String(key.time),index:String(index)});
      k.onpointerdown=e=>{e.preventDefault();e.stopPropagation();selectRow(row);if(row.kind==='event')event=index;seek(key.time);beginKeyDrag(e,row,index,k);};r.append(k);});
    r.onpointerdown=e=>{if(e.target!==r)return;selectRow(row);seek(pointerTime(e.clientX));};
    r.ondblclick=e=>{if(e.target!==r||row.kind!=='bone')return;selectRow(row);seek(pointerTime(e.clientX));edit(()=>putPose(pose()));};return r;
  }));highlightKeys();
}
el('ruler').onpointerdown=e=>{if(e.clientX-el('timelineContent').getBoundingClientRect().left<startX)return;seek(pointerTime(e.clientX));};

// High-DPI canvas. Zoom is a view operation only; source images remain native size.
const canvas=el<HTMLCanvasElement>('stage'),ctx=canvas.getContext('2d')!;
let zoom=2,pan={x:0,y:0},cw=600,ch=400,needsFit=true;
const imageCache=new Map<string,HTMLImageElement>();
function image(name:string){let im=imageCache.get(name);if(!im){im=new Image();imageCache.set(name,im);im.onload=draw;im.onerror=()=>toast('图片无法载入，请检查素材路径：'+name.slice(0,90));im.src=name.startsWith('data:')||name.startsWith('/')?name:`/mods/revival/${name}`;}return im;}
function resize(){const r=canvas.getBoundingClientRect();cw=r.width;ch=r.height;canvas.width=Math.round(cw*devicePixelRatio);canvas.height=Math.round(ch*devicePixelRatio);if(needsFit){fit();needsFit=false;}draw();}
function worldPoint(x:number,y:number){const r=canvas.getBoundingClientRect();return{x:(x-r.left-cw/2-pan.x)/zoom,y:(y-r.top-ch/2-pan.y)/zoom};}
function joint(name:string,s=sample(),t=time) {const b=project.definition.bones.find(b=>b.name===name)!;const p=localPose(animation().tracks.find(t=>t.bone===name)?.keys??[],t);return transformPoint(s.bones[name].matrix,(b.pivotX??0)+p.pivotX,(b.pivotY??0)+p.pivotY);}
function inverse(m:AffineTransform,p:{x:number;y:number}){const det=m.a*m.d-m.b*m.c;if(Math.abs(det)<1e-8)throw Error('父部位缩放为零，无法拖动；请先调整父部位缩放。');const x=p.x-m.tx,y=p.y-m.ty;return{x:(m.d*x-m.c*y)/det,y:(m.a*y-m.b*x)/det};}
function fit(){const s=sample(),points=Object.keys(s.bones).map(n=>joint(n,s));
  for(const sl of s.slots){if(sl.visible===false||!sl.attachment)continue;const a=s.attachments[sl.attachment];if(!a?.image)continue;const im=image(a.image);if(!im.naturalWidth)continue;const m=slotMatrix(s,sl,direction),x=a.x??0,y=a.y??0;for(const [px,py] of [[x,y],[x+im.naturalWidth,y],[x,y+im.naturalHeight],[x+im.naturalWidth,y+im.naturalHeight]])points.push(transformPoint(m,px,py));}
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs)-20,maxX=Math.max(...xs)+20,minY=Math.min(...ys)-20,maxY=Math.max(...ys)+20;zoom=clamp(Math.min((cw-60)/(maxX-minX),(ch-45)/(maxY-minY)),.15,5);pan={x:-(minX+maxX)/2*zoom,y:-(minY+maxY)/2*zoom};draw();}
function drawPose(t:number,opacity:number,controls:boolean){
  const s=sample(t);ctx.save();ctx.translate(cw/2+pan.x,ch/2+pan.y);ctx.scale(zoom,zoom);
  for(const sl of orderedSkeletonSlots(s,direction,project.definition.slots.map(s=>s.part))){if(sl.visible===false||!sl.attachment)continue;const a=s.attachments[sl.attachment];if(!a?.image)continue;const im=image(a.image);if(!im.complete||!im.naturalWidth)continue;const m=slotMatrix(s,sl,direction);ctx.save();ctx.globalAlpha=opacity*s.bones[sl.bone].alpha*(sl.alpha??1);ctx.transform(m.a,m.b,m.c,m.d,m.tx,m.ty);ctx.drawImage(im,a.x??0,a.y??0);ctx.restore();}
  if(checked('showBones')){ctx.globalAlpha=opacity;ctx.lineWidth=1.3/zoom;ctx.strokeStyle='#c3eae6aa';
    for(const b of project.definition.bones){if(!b.parent)continue;const p=joint(b.name,s,t),q=joint(b.parent,s,t);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
    for(const b of project.definition.bones){const p=joint(b.name,s,t);ctx.fillStyle=b.name===bone?'#f7d995':'#ecfafa';ctx.beginPath();ctx.arc(p.x,p.y,(b.name===bone?5:3)/zoom,0,Math.PI*2);ctx.fill();}
  }
  if(controls){const p=joint(bone,s);ctx.globalAlpha=1;ctx.strokeStyle='#67e0bc';ctx.fillStyle='#67e0bc';ctx.lineWidth=1.4/zoom;
    if(tool==='rotate'){ctx.beginPath();ctx.arc(p.x,p.y,46/zoom,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(p.x+46/zoom,p.y,5/zoom,0,Math.PI*2);ctx.fill();}
    else {ctx.beginPath();ctx.moveTo(p.x-13/zoom,p.y);ctx.lineTo(p.x+13/zoom,p.y);ctx.moveTo(p.x,p.y-13/zoom);ctx.lineTo(p.x,p.y+13/zoom);ctx.stroke();}
    ctx.font=`${12/zoom}px system-ui`;ctx.fillText(label(bone),p.x+14/zoom,p.y-13/zoom);
  }ctx.restore();
}
function draw(){if(!ctx||!cw)return;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.clearRect(0,0,cw,ch);ctx.strokeStyle='#29405255';ctx.lineWidth=1;const step=Math.max(15,25*zoom);for(let x=(cw/2+pan.x)%step;x<cw;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,ch);ctx.stroke();}for(let y=(ch/2+pan.y)%step;y<ch;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cw,y);ctx.stroke();}
  if(checked('onion')&&!playing){drawPose(Math.max(0,time-1/animation().fps),.16,false);drawPose(Math.min(animation().duration,time+1/animation().fps),.16,false);}drawPose(time,1,!playing);text('zoomLabel',Math.round(zoom*100)+'%');
}

type Drag={mode:'move'|'rotate'|'pan'|'key';before:Snapshot;start:{x:number;y:number};parent?:AffineTransform;center?:{x:number;y:number};pose?:Required<BoneTransform>;angle?:number;pan?:{x:number;y:number};row?:Row;index?:number;element:HTMLElement;pointerId:number;moved:boolean;key?:BoneKeyframe|SlotKeyframe|SkeletonEvent;keyTime?:number};
let drag:Drag|null=null;
function beginKeyDrag(e:PointerEvent,row:Row,index:number,element:HTMLElement){const before=snapshot();project=fork(project,clip);const fresh=rows().find(r=>r.kind===row.kind&&r.name===row.name)!;drag={mode:'key',before,start:{x:e.clientX,y:e.clientY},row:fresh,index,key:fresh.keys[index],keyTime:fresh.keys[index].time,element,pointerId:e.pointerId,moved:false};element.setPointerCapture(e.pointerId);highlightKeys();}
canvas.oncontextmenu=e=>e.preventDefault();
canvas.onpointerdown=e=>{try{
  if(e.button!==0&&e.button!==2&&e.button!==1)return;playing=false;timeUI();const start=worldPoint(e.clientX,e.clientY),s=sample(),center=joint(bone,s);
  const ring=tool==='rotate'&&Math.abs(Math.hypot(start.x-center.x,start.y-center.y)*zoom-46)<10;
  if(e.button===0&&!ring){let best='',distance=14/zoom;for(const b of project.definition.bones){const p=joint(b.name,s),d=Math.hypot(p.x-start.x,p.y-start.y);if(d<distance){distance=d;best=b.name;}}if(!best)return;bone=best;tab('bone');lists();draw();}
  if(e.button===0&&!canEditPose())return;
  const b=project.definition.bones.find(b=>b.name===bone)!,parent=b.parent?s.bones[b.parent].matrix:{a:1,b:0,c:0,d:1,tx:0,ty:0},c=joint(bone,s),local=inverse(parent,start),lc=inverse(parent,c);
  const before=snapshot(),p=pose();if(e.button===0)project=fork(project,clip);
  drag={mode:e.button===0?tool:'pan',before,start:{x:e.clientX,y:e.clientY},parent,center:lc,pose:p,angle:Math.atan2(local.y-lc.y,local.x-lc.x),pan:{...pan},element:canvas,pointerId:e.pointerId,moved:false};canvas.setPointerCapture(e.pointerId);
}catch(err){fail(err);}};
window.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointerId)return;try{const d=drag,dx=e.clientX-d.start.x,dy=e.clientY-d.start.y;if(!d.moved&&Math.hypot(dx,dy)<2)return;d.moved=true;
  if(d.mode==='pan'){pan={x:d.pan!.x+dx,y:d.pan!.y+dy};draw();return;}
  if(d.mode==='key'){const t=snapTime(d.keyTime!+dx/(timelineWidth-startX-20)*animation().duration);d.key!.time=t;time=t;d.element.style.left=timeX(t)+'px';d.element.dataset.time=String(t);invalidate();timeUI();inspector();draw();return;}
  const p={...d.pose!};if(d.mode==='move'){const q=inverse(d.parent!,worldPoint(e.clientX,e.clientY)),start=inverse(d.parent!,worldPoint(d.start.x,d.start.y));p.x+=q.x-start.x;p.y+=q.y-start.y;}
  else {const q=inverse(d.parent!,worldPoint(e.clientX,e.clientY)),angle=Math.atan2(q.y-d.center!.y,q.x-d.center!.x);p.rotation+=Math.atan2(Math.sin(angle-d.angle!),Math.cos(angle-d.angle!));}
  putPose(p);invalidate();inspector();draw();
}catch(err){cancelDrag();fail(err);}});
function endDrag(){const d=drag;if(!d)return;drag=null;if(d.element.hasPointerCapture(d.pointerId))d.element.releasePointerCapture(d.pointerId);if(!d.moved){project=d.before.project;sampledSource=undefined;return;}if(d.mode==='pan')return;
  if(d.mode==='key'){const keys=d.row!.keys,key=d.key!;const remaining=keys.filter(k=>k===key||d.row!.kind==='event'||!near(k.time,key.time));remaining.sort((a,b)=>a.time-b.time);keys.splice(0,keys.length,...remaining);if(d.row!.kind==='event')event=keys.indexOf(key);}
  commit(d.before);
}
function cancelDrag(){const d=drag;if(!d)return;drag=null;if(d.element.hasPointerCapture(d.pointerId))d.element.releasePointerCapture(d.pointerId);if(d.pan)pan=d.pan;project=d.before.project;time=d.before.time;sampledSource=undefined;refresh();}
window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',cancelDrag);
canvas.addEventListener('wheel',e=>{e.preventDefault();if(drag)return;const p=worldPoint(e.clientX,e.clientY);zoom=clamp(zoom*Math.exp(-e.deltaY*.001),.1,12);const r=canvas.getBoundingClientRect();pan={x:e.clientX-r.left-cw/2-p.x*zoom,y:e.clientY-r.top-ch/2-p.y*zoom};draw();},{passive:false});

// HTML dialogs work in browsers that intentionally disable native confirm/prompt.
async function modal(title:string,content:string|HTMLElement,ok='确定',cancel=true){
  playing=false;timeUI();const d=el<HTMLDialogElement>('modal');if(d.open)return false;
  text('modalTitle',title);el('modalBody').replaceChildren();if(typeof content==='string'){const p=document.createElement('p');p.textContent=content;el('modalBody').append(p);}else el('modalBody').append(content);
  text('modalOK',ok);el('modalCancel').hidden=!cancel;d.returnValue='cancel';d.showModal();return new Promise<boolean>(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='ok'),{once:true}));
}
async function replaceProject(next:Project,original?:Project){validateProject(next);if(dirty&&!await modal('切换工程？','当前修改可以用「撤销」找回，但仍建议先保存工程。','切换'))return;const before=snapshot();project=next;imageCache.clear();baseline=original;clip=next.editor?.clip&&next.animations[next.editor.clip]?next.editor.clip:Object.keys(next.animations)[0];time=clamp(next.editor?.time??0,0,animation().duration);direction=clamp(Math.round(next.editor?.direction??0),0,3);bone=next.definition.bones[0].name;slot=next.definition.slots[0]?.name??'';event=-1;kind='bone';playing=false;commit(before);await Promise.all(Object.values(next.definition.attachments??{}).filter(a=>a.image).map(a=>image(a.image!).decode().catch(()=>{})));fit();}
async function exportJSON(name:string,value:unknown){const json=JSON.stringify(value,null,2),url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const box=document.createElement('div'),p=document.createElement('p'),a=document.createElement('a'),area=document.createElement('textarea');
  p.textContent='点击下载后，请确认文件已出现在浏览器的下载目录。若浏览器拦截下载，可全选下方 JSON，复制并保存为 UTF-8 的 .json 文件。';a.href=url;a.download=name;a.textContent='↓ 下载 '+name;a.className='download-link';area.readOnly=true;area.value=json;area.className='wide';area.setAttribute('aria-label','导出 JSON（可全选复制）');box.append(p,a,area);
  const saved=await modal('工程文件已生成',box,'我已保存文件',false);URL.revokeObjectURL(url);return saved;
}
on('help',()=>modal('三步做出第一个动作','① 左侧选择「行走」，按播放先看看。② 暂停，点击时间轴空白选择时间；选左臂，切到「旋转」，拖绿色圆环，新的姿势会自动记录。③ 点击播放，满意后「保存工程」。用自己的图片：选部位 → 图片插槽＋添加 → 图片页导入 PNG。空格播放，V 移动，R 旋转，F 适应画布，Ctrl+Z 撤销。右键拖动画布、滚轮缩放。事件只是标记，四向素材和游戏逻辑仍需配置；此页不会自动把工程安装进游戏。','明白了',false));
on('hideGuide',()=>{el('guide').hidden=true;});
on('newProject',()=>replaceProject(blankProject()));on('demoProject',()=>replaceProject(demoProject()));
on('zombieProject',async()=>{const r=await fetch('/mods/revival/data/examples/zombie-project.json');if(!r.ok)throw Error('僵尸工程读取失败：'+r.status);const p=await r.json();await replaceProject(p);});
on('zombieRigProject',async()=>{const r=await fetch('/mods/revival/data/examples/zombie-rig-project.json');if(!r.ok)throw Error('分层僵尸工程读取失败：'+r.status);const p=await r.json();await replaceProject(p);toast('已打开分层部位骨骼僵尸工程：12 个部位、6 个动作 × 4 个朝向。');});
on('loadOriginal',async()=>{text('status','正在读取原版兼容工程…');const r=await fetch('/mods/revival/data/battle_skeleton.json');if(!r.ok)throw Error('原版工程读取失败：'+r.status);const p=await r.json();validateProject(p);await replaceProject(p,p);toast('已打开原版骨架。此页不重建原版逐帧部件外观；游戏仍使用原有兼容路径。');});
on('importProject',()=>input('projectFile').click());
change('projectFile',async()=>{const f=input('projectFile').files?.[0];if(!f)return;try{if(f.size>40*1024*1024)throw Error('工程超过 40 MB，请拆分素材。');const p:unknown=JSON.parse(await f.text());validateProject(p);await replaceProject(p);}finally{input('projectFile').value='';}});
const payload=(only=false):Project=>({version:1,credits:project.credits,presentation:project.presentation,definition:project.definition,animations:only?{[clip]:animation()}:project.animations,editor:{clip,time,direction}});
on('exportProject',async()=>{const rev=revision;if(await exportJSON('revival-project.json',payload())&&rev===revision){dirty=false;text('dirty','已确认保存');}});on('exportClip',()=>exportJSON('revival-action.json',payload(true)));on('exportAuthoring',()=>exportJSON('revival-original-patch.json',originalPatch(project,baseline,clip)));
on('undo',undo);on('redo',redo);
for(const k of ['bone','slot','event'] as const)on(k+'Tab',()=>tab(k));
input('boneSearch').addEventListener('input',lists);
change('phase',()=>{playing=false;clip=select('phase').value;time=0;event=-1;sampledSource=undefined;refresh();});
change('direction',()=>{direction=Number(select('direction').value);const next=directionalClip(project,clip,direction);if(next!==clip){playing=false;clip=next;time=Math.min(time,animation().duration);event=-1;sampledSource=undefined;}refresh();});
on('newClip',()=>edit(()=>{clip=unique('new_action',Object.keys(project.animations));project.animations[clip]={name:clip,fps:25,duration:1,loop:false,tracks:[]};time=0;event=-1;toast('已创建新动作，可在左侧输入名称后点击「改名」。');}));
on('duplicateClip',()=>edit(()=>{const a=clone(animation());clip=unique(clip+'_copy',Object.keys(project.animations));project.animations[clip]={...a,name:clip};time=0;event=-1;}));
on('renameClip',()=>{const name=val('clipName').trim();if(name===clip)return;if(!safeName(name)||Object.hasOwn(project.animations,name))throw Error('动作名称为空、重复或为保留名称。');edit(()=>{const a=animation(),beforeClip=clip;delete project.animations[clip];clip=name;a.name=name;project.animations[name]=a;if(project.presentation){project.presentation=clone(project.presentation);for(const g of Object.values(project.presentation.groups)){const i=g.indexOf(beforeClip);if(i>=0)g[i]=name;}}});});
change('duration',()=>{const duration=number('duration',.04,600);const max=Math.max(0,...rows().flatMap(r=>r.keys.map(k=>k.time)));if(duration+1e-6<max)throw Error(`最后一个关键帧位于 ${max.toFixed(3)} 秒。请先移动或删除它，再缩短时长。`);edit(()=>{animation().duration=duration;time=Math.min(time,duration);});});
change('fps',()=>{const fps=number('fps',1,120);if(!Number.isInteger(fps))throw Error('每秒帧数必须为整数。');edit(()=>animation().fps=fps);});change('loop',()=>edit(()=>animation().loop=checked('loop')));
for(const c of channels)change(c,()=>{if(!canEditPose()){inspector();return;}const p=readPose();if(channels.every(k=>near(p[k],pose()[k])))return;edit(()=>putPose(p));});
change('interpolation',()=>{if(!canEditPose()){inspector();return;}const p=readPose();edit(()=>putPose(p));});
change('boneParent',()=>{const parent=select('boneParent').value;edit(()=>{const b=project.definition.bones.find(b=>b.name===bone)!;if(parent)b.parent=parent;else delete b.parent;});});
on('setKey',()=>{const p=readPose();edit(()=>putPose(p));toast('已记录当前姿势');});
on('copyKey',()=>{copied={time,transform:readPose(),interpolation:select('interpolation').value as 'linear'|'step'};disable('pasteKey',false);toast('已复制姿势；选择时间或部位后粘贴。');});
on('pasteKey',()=>{if(!copied)return;select('interpolation').value=copied.interpolation??'linear';edit(()=>putPose(copied!.transform));});
on('deleteKey',()=>{if(!boneKey())return;edit(()=>{const t=track()!;t.keys=t.keys.filter(k=>!near(k.time,time));});});
on('renameBone',()=>{const name=val('boneName').trim();if(name===bone)return;if(!safeName(name)||project.definition.bones.some(b=>b.name===name))throw Error('部位名称为空、重复或为保留名称。');edit(()=>{const old=bone;project.definition.bones.find(b=>b.name===old)!.name=name;for(const b of project.definition.bones)if(b.parent===old)b.parent=name;for(const s of project.definition.slots)if(s.bone===old)s.bone=name;for(const [n,a] of Object.entries(project.animations))project.animations[n]={...a,tracks:a.tracks.map(t=>t.bone===old?{...t,bone:name}:t)};bone=name;});});
on('addBone',()=>edit(()=>{const name=unique('part',project.definition.bones.map(b=>b.name));project.definition.bones.push({name,parent:bone,y:35});bone=name;kind='bone';toast('已添加子部位。点击「图片插槽 ＋添加」为它绑定图片。');}));
on('deleteBone',async()=>{if(project.definition.bones.length===1)return;const doomed=new Set([bone]);let last=-1;while(last!==doomed.size){last=doomed.size;for(const b of project.definition.bones)if(b.parent&&doomed.has(b.parent))doomed.add(b.name);}
  if(!await modal('删除部位及其子部位？',`将删除 ${doomed.size} 个部位，以及所有动作中关联的轨道和插槽。图片素材保留，可撤销。`,'删除'))return;
  edit(()=>{const removed=new Set(project.definition.slots.filter(s=>doomed.has(s.bone)).map(s=>s.name));project.definition.bones=project.definition.bones.filter(b=>!doomed.has(b.name));if(!project.definition.bones.length)throw Error('至少需要保留一个根部位。');project.definition.slots=project.definition.slots.filter(s=>!removed.has(s.name));for(const [n,a] of Object.entries(project.animations))project.animations[n]={...a,tracks:a.tracks.filter(t=>!doomed.has(t.bone)),slotTracks:a.slotTracks?.filter(t=>!removed.has(t.slot))};bone=project.definition.bones[0].name;slot=project.definition.slots[0]?.name??'';});
});
on('addSlot',()=>edit(()=>{slot=unique(bone+'_image',project.definition.slots.map(s=>s.name));project.definition.slots.push({name:slot,bone,part:bone,z:project.definition.slots.length,attachment:null});kind='slot';}));
change('slotAttachment',()=>attachmentFields(select('slotAttachment').value));
function slotValues(){return {attachment:select('slotAttachment').value||null,z:number('slotZ'),visible:checked('slotVisible')};}
on('applySlot',()=>{const name=val('slotName').trim(),b=select('slotBone').value,v=slotValues(),x=number('attachmentX'),y=number('attachmentY');if(!safeName(name)||project.definition.slots.some(s=>s.name===name&&s.name!==slot))throw Error('插槽名称为空、重复或为保留名称。');edit(()=>{const s=selectedSlot()!;if(name!==slot){for(const [n,a] of Object.entries(project.animations))project.animations[n]={...a,slotTracks:a.slotTracks?.map(t=>t.slot===slot?{...t,slot:name}:t)};}Object.assign(s,v,{name,bone:b});slot=name;const at=v.attachment&&project.definition.attachments?.[v.attachment];if(at)Object.assign(at,{x,y});});toast('初始配置已更新。已有图片关键帧仍会覆盖对应时刻的配置。');});
on('setSlotKey',()=>{const v=slotValues();edit(()=>{let t=animation().slotTracks?.find(t=>t.slot===slot);if(!t){t={slot,keys:[]};(animation().slotTracks??=[]).push(t);}putKey(t.keys,{time,...v});});});
on('deleteSlotKey',()=>edit(()=>{const t=animation().slotTracks?.find(t=>t.slot===slot);if(t)t.keys=t.keys.filter(k=>!near(k.time,time));}));
on('deleteSlot',async()=>{if(!selectedSlot()||!await modal('删除此图片插槽？','关联图片关键帧会从所有动作中删除；素材保留，可撤销。','删除'))return;edit(()=>{project.definition.slots=project.definition.slots.filter(s=>s.name!==slot);for(const [n,a] of Object.entries(project.animations))project.animations[n]={...a,slotTracks:a.slotTracks?.filter(t=>t.slot!==slot)};slot=project.definition.slots[0]?.name??'';});});
on('addImage',()=>input('imageFile').click());
change('imageFile',async()=>{const file=input('imageFile').files?.[0],target=slot,startedRevision=revision;if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('请选择不超过 8 MB 的 PNG、JPG 或 WebP 图片。');
  const source=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('图片读取失败。'));r.readAsDataURL(file);});
  const im=new Image();im.src=source;await im.decode();if(im.width>4096||im.height>4096)throw Error('单张图片宽高不能超过 4096 像素，请先裁切到部位尺寸。');if(revision!==startedRevision)throw Error('读取图片期间工程已修改，请重新导入图片。');if(!project.definition.slots.some(s=>s.name===target))throw Error('目标插槽已删除，请重新选择。');
  edit(()=>{slot=target;const name=unique(file.name.replace(/\.[^.]+$/,'')||'image',Object.keys(project.definition.attachments??{}));if(!safeName(name))throw Error('图片名称使用了保留名称，请重命名。');(project.definition.attachments??={})[name]={image:source,x:-im.width/2,y:0};selectedSlot()!.attachment=name;const t=animation().slotTracks?.find(t=>t.slot===slot);if(t)putKey(t.keys,{...t.keys.find(k=>near(k.time,time)),time,attachment:name});});toast('图片已绑定。使用「图片偏移」把关节对准合适的转轴。');
}finally{input('imageFile').value='';}});
function eventValue(){const name=val('eventName').trim();if(!name)throw Error('请输入事件名称。');const raw=val('eventValue').trim();let value:unknown;try{if(raw)value=JSON.parse(raw);}catch{throw Error('事件参数需要有效 JSON，普通文字请加双引号。');}return {time,name,...(value===undefined?{}:{value})};}
on('addEvent',()=>{const e=eventValue();edit(()=>{const events=animation().events??=[];events.push(e);events.sort((a,b)=>a.time-b.time);event=events.indexOf(e);});});
on('updateEvent',()=>{const e=eventValue();if(!animation().events?.[event])return;edit(()=>{const events=animation().events!;events[event]=e;events.sort((a,b)=>a.time-b.time);event=events.indexOf(e);});});
on('deleteEvent',()=>{if(!animation().events?.[event])return;edit(()=>{animation().events!.splice(event,1);event=-1;});input('eventName').value='';input('eventValue').value='';});
on('deleteSelected',()=>el(kind==='bone'?'deleteKey':kind==='slot'?'deleteSlotKey':'deleteEvent').click());
on('moveTool',()=>setTool('move'));on('rotateTool',()=>setTool('rotate'));
function setTool(t:typeof tool){tool=t;el('moveTool').classList.toggle('active',tool==='move');el('rotateTool').classList.toggle('active',tool==='rotate');text('canvasHint',t==='rotate'?'拖绿色圆环旋转 · 右键平移 · 滚轮缩放':'拖关节移动 · 右键平移 · 滚轮缩放');draw();}
on('fitView',fit);change('showBones',draw);change('onion',draw);
on('play',()=>{if(time>=animation().duration)time=0;playing=!playing;lastFrame=performance.now();inspector();highlightKeys();timeUI();draw();});
on('previousFrame',()=>seek(snapTime(time-1/animation().fps)));on('nextFrame',()=>seek(snapTime(time+1/animation().fps)));change('time',()=>seek(snapTime(number('time',0,animation().duration))));
window.addEventListener('keydown',e=>{if(el<HTMLDialogElement>('modal').open)return;if(e.key==='Escape'){cancelDrag();return;}if(/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))return;const modifier=e.ctrlKey||e.metaKey;
  if(modifier&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}else if(modifier&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}else if(modifier&&e.key.toLowerCase()==='s'){e.preventDefault();el('exportProject').click();}
  else if(modifier&&e.key.toLowerCase()==='c'){e.preventDefault();el('copyKey').click();}else if(modifier&&e.key.toLowerCase()==='v'){e.preventDefault();el('pasteKey').click();}else if(e.code==='Space'){e.preventDefault();el('play').click();}else if(e.key==='Delete'){e.preventDefault();el('deleteSelected').click();}else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();el(e.key==='ArrowLeft'?'previousFrame':'nextFrame').click();}else if(!modifier&&e.key.toLowerCase()==='v')setTool('move');else if(!modifier&&e.key.toLowerCase()==='r')setTool('rotate');else if(!modifier&&e.key.toLowerCase()==='f')fit();
});
document.addEventListener('focusin',e=>{if(playing&&/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)){playing=false;timeUI();}});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});

// A separate editor-only IndexedDB store: no game-save or language keys touched.
let db:IDBDatabase|undefined,draftTimer=0;
async function initDraft(){try{db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('revival-animation-editor',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const tx=db.transaction('drafts','readonly'),r=tx.objectStore('drafts').get('latest');r.onsuccess=()=>{disable('restoreDraft',!r.result);if(r.result)text('draftStatus','有本机草稿 · 在左侧展开恢复');};
}catch{text('draftStatus','浏览器不允许本机草稿，请手动保存工程');}}
function scheduleDraft(){clearTimeout(draftTimer);text('draftStatus','正在等待备份…');draftTimer=window.setTimeout(saveDraft,900);}
function saveDraft(){if(!db){text('draftStatus','草稿不可用，请手动保存工程');return;}if(drag){scheduleDraft();return;}const rev=revision;try{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(payload(),'latest');tx.oncomplete=()=>{if(rev===revision){text('draftStatus','已备份本机草稿 · 不等于文件保存');disable('restoreDraft',false);}};tx.onerror=()=>text('draftStatus','草稿空间不足或写入失败，请手动保存工程');}catch{text('draftStatus','草稿写入失败，请手动保存工程');}}
on('restoreDraft',async()=>{if(!db)return;const p=await new Promise<unknown>((resolve,reject)=>{const r=db!.transaction('drafts','readonly').objectStore('drafts').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});validateProject(p);await replaceProject(p);toast('已恢复本机草稿');});
let lastFrame=performance.now(),lastInspector=0;
function animate(now:number){if(playing&&!document.hidden){let next=time+Math.min((now-lastFrame)/1000,.1);if(next>=animation().duration){if(animation().loop)next%=animation().duration;else{next=animation().duration;playing=false;}}time=next;timeUI();draw();if(!playing){inspector();highlightKeys();}if(now-lastInspector>120){lastInspector=now; // Do not rebuild lists or image menus on every frame.
  const tr=pose();for(const c of channels)input(c).value=String(+(tr[c]*(c==='rotation'?180/Math.PI:1)).toFixed(3));
}}lastFrame=now;requestAnimationFrame(animate);}
refresh();new ResizeObserver(resize).observe(canvas);new ResizeObserver(()=>{timeline();timeUI();}).observe(el('timelineScroll'));initDraft();requestAnimationFrame(animate);




