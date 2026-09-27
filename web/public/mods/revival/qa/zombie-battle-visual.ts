import type { BattleUnit } from '../runtime/Battle';
import type { DollAnim } from '../runtime/BattleDoll';
import { sampleSkeleton, orderedSkeletonSlots, slotMatrix, skeletonPoseKey } from '../runtime/BattleSkeleton';
import { validateProject, type Project } from './authoring-editor-model';
// Battle directions: y- (NE), x+ (SE), y+ (SW), x- (NW).
export const BATTLE_DIRECTIONS=['东北','东南','西南','西北'];
export function simulationClip(project:Project,phase:number,attack='攻击'){
 const action=['待机','行走',attack,'受击','死亡'][phase];
 const clip=project.animations[action+' · 东南'];
 if(!clip)throw Error('Missing zombie action: '+action);
 // Translate authoring markers to the EXISTING combat simulation cue contract.
 const events=phase===2?[{time:.25,name:'melee_swoosh'},{time:.375,name:'fire'}]
  :phase===4?[{time:.5,name:'death_logic'},{time:.75,name:'death_fall'}]:clip.events;
 return {...clip,events};
}
export async function loadZombieVisual(url:string){
 const response=await fetch(url);if(!response.ok)throw Error('Zombie project HTTP '+response.status);
 const project:unknown=await response.json();validateProject(project);
 const images=new Map<string,HTMLImageElement>();
 await Promise.all(Object.entries(project.definition.attachments??{}).map(async([id,a])=>{if(!a.image)return;const im=new Image();im.src=a.image.startsWith('data:')?a.image:'/mods/revival/'+a.image;await im.decode();images.set(id,im);}));
 const actors=new WeakMap<BattleUnit,string>(),clips=new Map<string,ReturnType<typeof simulationClip>>(),frames=new Map<string,HTMLCanvasElement>();
 function unitAnimation(u:BattleUnit,phase:number){const attack=actors.get(u);if(!attack)return;const key=attack+phase;let clip=clips.get(key);if(!clip){clip=simulationClip(project as Project,phase,attack);clips.set(key,clip);}return clip;}
 function unitVisual(u:BattleUnit,anim:DollAnim,clock:number){
  const attack=actors.get(u);if(!attack)return null;
  const action=['待机','行走',attack,'受击','死亡'][anim.phase];
  const clip=(project as Project).animations[action+' · '+BATTLE_DIRECTIONS[anim.dir%4]];
  const t=anim.phase===0?clock:(anim.frame-1)/clip.fps;
  const pose=sampleSkeleton((project as Project).definition,clip,t);
  const key=skeletonPoseKey((project as Project).definition,clip,t);let canvas=frames.get(key);if(canvas)return canvas;
  canvas=document.createElement('canvas');canvas.width=canvas.height=100;const c=canvas.getContext('2d')!;
  c.translate(50,70);
  for(const slot of orderedSkeletonSlots(pose,0,[])){if(slot.visible===false||!slot.attachment)continue;const a=pose.attachments[slot.attachment],im=images.get(slot.attachment);if(!im)continue;const m=slotMatrix(pose,slot,0);c.save();c.transform(m.a,m.b,m.c,m.d,m.tx,m.ty);c.globalAlpha=pose.bones[slot.bone].alpha*(slot.alpha??1);c.drawImage(im,a.x??0,a.y??0);c.restore();}
  frames.set(key,canvas);return canvas;
 }
 return {bind:(u:BattleUnit,attack:string)=>actors.set(u,attack),unitAnimation,unitVisual};
}
