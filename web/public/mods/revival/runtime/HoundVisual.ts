import type { BattleUnit } from './Battle';
import type { DollAnim } from './BattleDoll';
import type { SkeletonAnimation } from './BattleSkeleton';
import { tintCanvas } from '../../../../src/game/BattleDoll';
export type HoundColor={r:number;g:number;b:number;bc?:number};
export type HoundAppearance={coat:HoundColor;highlight:HoundColor;details:HoundColor;original?:boolean};
export const HOUND_COLORS: HoundAppearance[]=[
 {coat:{r:255,g:255,b:255},highlight:{r:255,g:255,b:255},details:{r:255,g:255,b:255},original:true},
 {coat:{r:230,g:166,b:100,bc:1.8},highlight:{r:255,g:227,b:183,bc:1.4},details:{r:180,g:170,b:160}},
 {coat:{r:130,g:145,b:160,bc:1.5},highlight:{r:225,g:232,b:239,bc:1.6},details:{r:130,g:130,b:130}},
 {coat:{r:250,g:244,b:226,bc:2.3},highlight:{r:255,g:255,b:250,bc:2},details:{r:155,g:155,b:155}},
];
/** Load once before creating a battle; all four directions use real raster frames. */
export async function loadHoundVisual(base='/mods/revival/assets/hound/') {
 const [atlas,mask]=await Promise.all(['hound-atlas.png','hound-color-mask.png'].map(async name=>{const im=new Image();im.src=base+name;await im.decode();return im;}));
 const actors=new WeakMap<BattleUnit,HoundAppearance>();const frames=new Map<string,HTMLCanvasElement>();
 // Phase 0 is deliberately a static pose. There is no idle animation.
 const clips:SkeletonAnimation[]=['walk','walk','bite','hit','death'].map((name,phase)=>({name:'hound-'+name,fps:phase===3?16:12,duration:(phase===3?1:8)/(phase===3?16:12),loop:phase===1,tracks:[],events:phase===2?[{time:4/12,name:'fire'}]:phase===4?[{time:4/12,name:'death_logic'},{time:6/12,name:'death_fall'}]:phase===1?[{time:1/12,name:'footstep'},{time:5/12,name:'footstep'}]:[]}));
 return {
  bind(unit:BattleUnit,color:HoundAppearance=HOUND_COLORS[0]){actors.set(unit,color);},
  setColor(unit:BattleUnit,color:HoundAppearance){actors.set(unit,color);},
  unitAnimation(unit:BattleUnit,phase:number){return actors.has(unit)?clips[phase]:undefined;},
  unitVisual(unit:BattleUnit,anim:DollAnim,clock:number){
   const color=actors.get(unit);if(!color)return null;
   const phase=Math.max(0,Math.min(4,anim.phase));
   // Standing uses the first walk frame and never advances with the clock.
   const sourceFrame=Math.max(0,Math.floor(anim.frame)-1);
   // Every direction follows the source atlas order: 0 → 1 → ... → 7.
   const frame=phase===0?0:phase===3?0:Math.min(7,sourceFrame);
   const key=JSON.stringify([phase,frame,anim.dir,color]);const cached=frames.get(key);if(cached)return cached;
   const raw=document.createElement('canvas');raw.width=raw.height=100;
   // The generated atlas keeps the original idle source row for the fixed
   // standing pose. Use its first frame; never sample the walk row here.
   const atlasPhase=phase===0?0:phase;
   // Direction-specific foot anchors measured from the packed idle frames.
   // Keep the contact point at canvas (50,70), which is the tile indicator centre.
   const anchorOffsets=[{x:0,y:5},{x:0,y:5},{x:3,y:5},{x:0,y:3}];
   const offset=anchorOffsets[anim.dir]??anchorOffsets[1];
   raw.getContext('2d')!.drawImage(color.original?atlas:mask,frame*100,(atlasPhase*4+anim.dir)*100,100,100,offset.x,offset.y,100,100);
   const result=color.original?raw:tintCanvas(raw,color.coat,color.highlight,color.details);
   if(frames.size>1200)frames.clear();frames.set(key,result);return result;
  },
 };
}
