import { sampleSkeleton, type BoneTransform, type BoneKeyframe, type SkeletonAnimation, type SkeletonDefinition } from '../runtime/BattleSkeleton';
export type Project = { version?: number; credits?: string; presentation?: {title:string;note:string;directions:string[];groups:Record<string,string[]>}; definition: SkeletonDefinition; animations: Record<string, SkeletonAnimation>; editor?: { clip?: string; time?: number; direction?: number } };
export const channels = ['x','y','rotation','scaleX','scaleY','pivotX','pivotY','alpha'] as const;
export const identity = (): Required<BoneTransform> => ({x:0,y:0,rotation:0,scaleX:1,scaleY:1,pivotX:0,pivotY:0,alpha:1});
export const clone = <T>(v:T):T => structuredClone(v);
export const near = (a:number,b:number) => Math.abs(a-b)<1e-6;
export const safeName = (name:string) => !!name.trim() && !['__proto__','constructor','prototype'].includes(name);
export function unique(base:string, names:string[]) { let name=base, i=2; while(names.includes(name)) name=`${base}_${i++}`; return name; }
// The large, read-only packed-atlas metadata and unrelated clips remain shared by history.
export function fork(p:Project, clip:string):Project {
  const {packedParts,...definition}=p.definition;
  return {...p,definition:{...clone(definition),packedParts},animations:{...p.animations,[clip]:clone(p.animations[clip])}};
}
export function localPose(keys:BoneKeyframe[], time:number):Required<BoneTransform> {
  const out=identity(); if(!keys.length)return out;
  const sorted=[...keys].sort((a,b)=>a.time-b.time);
  let i=0; while(i+1<sorted.length && sorted[i+1].time<=time+1e-10)i++;
  const l=sorted[i],r=sorted[i+1];
  if(time<l.time||!r||l.interpolation==='step')return {...out,...l.transform};
  const f=Math.max(0,Math.min(1,(time-l.time)/(r.time-l.time)));
  for(const k of channels)out[k]=(l.transform[k]??out[k])+((r.transform[k]??l.transform[k]??out[k])-(l.transform[k]??out[k]))*f;
  return out;
}
export function putKey<T extends {time:number}>(keys:T[], key:T) {
  const i=keys.findIndex(k=>near(k.time,key.time)); if(i>=0)keys.splice(i,1);
  keys.push(key); keys.sort((a,b)=>a.time-b.time);
}
function insist(ok:unknown, text:string):asserts ok {if(!ok)throw new Error(text);}
export function validateProject(value:unknown):asserts value is Project {
  const p=value as Project;
  insist(p&&typeof p==='object'&&p.definition&&p.animations,'不是有效的骨骼工程 JSON。');
  if(p.editor){insist(p.editor.time===undefined||Number.isFinite(p.editor.time),'编辑时间无效。');insist(p.editor.direction===undefined||Number.isFinite(p.editor.direction),'预览方向无效。');}
  if(p.credits!==undefined)insist(typeof p.credits==='string'&&p.credits.length<=10000,'署名格式无效。');
  if(p.presentation){const v=p.presentation;insist(typeof v.title==='string'&&typeof v.note==='string'&&Array.isArray(v.directions)&&v.directions.length===4&&v.directions.every(s=>typeof s==='string')&&v.groups&&typeof v.groups==='object'&&Object.values(v.groups).every(g=>Array.isArray(g)&&g.length===4&&g.every(s=>typeof s==='string'&&safeName(s))),'四向工程说明格式无效。');}
  const d=p.definition;
  insist(Array.isArray(d.bones)&&d.bones.length>0&&d.bones.length<=256&&Array.isArray(d.slots)&&d.slots.length<=512,'工程需要 1–256 个部位，最多 512 个插槽。');
  const names=(xs:{name:string}[])=>{const set=new Set<string>();for(const x of xs){insist(x&&typeof x.name==='string'&&safeName(x.name)&&!set.has(x.name),'部位、插槽名称不能为空、重复或使用保留名称。');set.add(x.name);}return set;};
  const bones=names(d.bones), slots=names(d.slots);
  const tr=(v:BoneTransform)=>{insist(v&&typeof v==='object','姿势格式无效。');for(const c of channels)if(v[c]!==undefined)insist(Number.isFinite(v[c]),`姿势 ${c} 必须是有限数字。`);};
  for(const b of d.bones){tr(b);insist(!b.parent||bones.has(b.parent),'父部位不存在。');}
  const attachments=d.attachments??{};
  for(const [name,a] of Object.entries(attachments)){
    insist(safeName(name)&&a&&typeof a==='object','图片附件格式无效。');
    if(a.image!==undefined)insist(typeof a.image==='string'&&(/^(data:image\/(png|jpeg|webp);base64,)/.test(a.image)||(!/^(?:[a-z]+:|\/\/)/i.test(a.image)&&!a.image.includes('..'))),'图片只允许工程内 PNG/JPG/WebP 或本地素材相对路径。');
    for(const k of ['x','y','frame'] as const)if(a[k]!==undefined)insist(Number.isFinite(a[k]),'图片偏移或帧号无效。');
  }
  for(const s of d.slots){tr(s);insist(bones.has(s.bone)&&Number.isFinite(s.z),'插槽绑定或层级无效。');insist(s.attachment==null||Object.hasOwn(attachments,s.attachment),'插槽引用了不存在的图片。');for(const v of Object.values(s.directions??{}))tr(v);}
  const clips=Object.entries(p.animations);insist(clips.length>0&&clips.length<=256,'工程需要 1–256 个动作。');
  for(const [name,a] of clips){
    insist(safeName(name)&&a&&typeof a.name==='string'&&Number.isFinite(a.duration)&&a.duration>0&&a.duration<=600&&Number.isFinite(a.fps)&&a.fps>=1&&a.fps<=120&&Array.isArray(a.tracks),'动作名称、时长或帧数无效。');
    insist(a.slotTracks===undefined||Array.isArray(a.slotTracks),'图片轨道格式无效。');insist(a.loop===undefined||typeof a.loop==='boolean','循环设置无效。');
    const times=(ks:{time:number}[],duplicates=false)=>{insist(Array.isArray(ks)&&ks.length<=10000,'关键帧格式或数量无效。');const set=new Set<number>();for(const k of ks){insist(k&&Number.isFinite(k.time)&&k.time>=0&&k.time<=a.duration+1e-6,'关键帧时间超出了动作时长。');const t=Math.round(k.time*1e6);insist(duplicates||!set.has(t),'同一轨道存在重复时间的关键帧。');set.add(t);}};
    const seen=new Set<string>();for(const t of a.tracks){insist(bones.has(t.bone)&&!seen.has(t.bone),'骨骼轨道引用无效或重复。');seen.add(t.bone);times(t.keys);for(const k of t.keys){tr(k.transform);insist(!k.interpolation||['step','linear'].includes(k.interpolation),'未知插值类型。');}}
    seen.clear();for(const t of a.slotTracks??[]){insist(slots.has(t.slot)&&!seen.has(t.slot),'插槽轨道引用无效或重复。');seen.add(t.slot);times(t.keys);for(const k of t.keys){insist(k.attachment==null||Object.hasOwn(attachments,k.attachment),'关键帧引用了不存在的图片。');if(k.z!==undefined)insist(Number.isFinite(k.z),'关键帧层级无效。');}}
    times(a.events??[],true);for(const e of a.events??[])insist(typeof e.name==='string'&&e.name.trim(),'事件名称不能为空。');
    sampleSkeleton({...d},{...a,loop:false},0); // Checks hierarchy cycles using the actual runtime.
  }
}
// Clip-level fields the patch may carry. Timing is authorable: an authored value replaces the
// imported original, and the runtime keeps its own defaults for anything left alone.
const patchedTimingKeys=['fps','duration','loop','playbackDuration','finishOnLastFrame','events','legacyParts'] as const;
export function originalPatch(p:Project, baseline:Project|undefined, clip:string) {
  insist(baseline&&baseline.animations[clip]&&/^(idle|walk|shoot|hit|death)_[0-7]$/.test(clip),'只有打开原版兼容工程后，标准动作才能导出此补丁。新动作请保存工程。');
  const a=p.animations[clip], base=baseline.animations[clip];
  const {packedParts,...definition}=p.definition;
  definition.attachments=Object.fromEntries(Object.entries(definition.attachments??{}).filter(([name])=>!name.startsWith('original:')));
  const animation:Record<string,unknown>={tracks:a.tracks,slotTracks:a.slotTracks??[]};
  // Carry only the timing that actually differs, so an untouched patch still regenerates the
  // original data byte-identically instead of pinning current values as explicit overrides.
  for(const key of patchedTimingKeys)if(JSON.stringify(a[key])!==JSON.stringify(base[key]))animation[key]=a[key];
  return {version:1,definition,animations:{[clip]:animation}};
}
export function blankProject():Project {return {version:1,definition:{bones:[{name:'root'}],slots:[],attachments:{},drawOrder:'slots'},animations:{idle:{name:'idle',fps:25,duration:1,loop:true,tracks:[]}}};}
export function demoProject():Project {
  const p=blankProject(), d=p.definition;
  d.bones=[{name:'root'},{name:'body',parent:'root',y:-58},{name:'head',parent:'body',y:-39},{name:'arm_L',parent:'body',x:-24,y:7},{name:'forearm_L',parent:'arm_L',y:35},{name:'arm_R',parent:'body',x:24,y:7},{name:'forearm_R',parent:'arm_R',y:35},{name:'leg_L',parent:'root',x:-13,y:-3},{name:'leg_R',parent:'root',x:13,y:-3}];
  // Code-native teaching graphics; replace them with your own PNG in the Images tab.
  const part=(name:string,w:number,h:number,color:string,z:number)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d')!;g.fillStyle=color;g.beginPath();g.roundRect(1,1,w-2,h-2,Math.min(w/2,10));g.fill();g.strokeStyle='#ffffff55';g.lineWidth=2;g.stroke();if(name==='head'){g.fillStyle='#163344';g.fillRect(w/2-10,14,4,4);g.fillRect(w/2+6,14,4,4);g.fillRect(w/2-5,25,10,2);}d.attachments![name]={image:c.toDataURL(),x:-w/2,y:0};d.slots.push({name,bone:name,part:name,attachment:name,z});};
  part('body',44,59,'#5dc8b2',3);part('head',38,39,'#edbd86',5);part('arm_L',15,36,'#6fbbe3',2);part('forearm_L',13,34,'#e5b887',4);part('arm_R',15,36,'#6fbbe3',2);part('forearm_R',13,34,'#e5b887',4);part('leg_L',19,65,'#799bb7',1);part('leg_R',19,65,'#799bb7',1);
  const keys=(values:number[])=>values.map((rotation,i)=>({time:i*.25,transform:{rotation},interpolation:'linear' as const}));
  p.animations.idle.tracks=[{bone:'body',keys:[{time:0,transform:{y:0}},{time:.5,transform:{y:-2}},{time:1,transform:{y:0}}]}];
  p.animations.walk={name:'walk',fps:24,duration:1,loop:true,tracks:[{bone:'leg_L',keys:keys([-.3,0,.3,0,-.3])},{bone:'leg_R',keys:keys([.3,0,-.3,0,.3])},{bone:'arm_L',keys:keys([.3,0,-.3,0,.3])},{bone:'arm_R',keys:keys([-.3,0,.3,0,-.3])}],events:[{time:.25,name:'footstep'},{time:.75,name:'footstep'}]};
  return p;
}


// Optional authoring-only grouping. Missing/deleted clips fall back safely.
export function directionGroup(p:Project,clip:string){return Object.values(p.presentation?.groups??{}).find(g=>g.includes(clip));}
export function directionalClip(p:Project,clip:string,direction:number){const next=directionGroup(p,clip)?.[direction];return next&&Object.hasOwn(p.animations,next)?next:clip;}
