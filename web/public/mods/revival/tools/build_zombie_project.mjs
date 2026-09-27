// Reproducible editor example; no game data or network access is modified.
import {readFile,writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
const root=new URL('../',import.meta.url);
const source=PNG.sync.read(await readFile(new URL('assets/zombie/zombie-original.png',root)));
if(source.width!==4608||source.height!==1024)throw Error('Unexpected Zombie Sprites sheet dimensions');
// Visually verified source rows: W,NW,N,NE,E,SE,S,SW. No mirroring.
const directions=[['东南',5],['西南',7],['西北',1],['东北',3]];
const attachments={},animations={},groups={};
const specs=[
 ['待机',[0,1,2,3],4,true,[]],
 ['行走',[4,5,6,7,8,9,10,11],8,true,[[0,'footstep'],[.5,'footstep']]],
 ['攻击',[0,12,13,14,15,0],8,false,[[3/8,'attack_hit']]],
 ['啃咬',[0,16,17,18,19,0],8,false,[[3/8,'bite_hit']]],
 // Recover from the first reaction pose instead of playing the falling frames.
 ['受击',[0,22,22,0],10,false,[[.1,'hit_react']]],
 ['死亡',[0,22,23,24,25,26,27],8,false,[[0,'death_start'],[6/8,'corpse']]],
];
for(const [action,frames,fps,loop,events] of specs){
 groups[action]=[];
 for(const [direction,row] of directions){
  const name=action+' · '+direction;groups[action].push(name);
  const keys=frames.map((col,i)=>{
   const id='zombie_'+row+'_'+col;
   if(!attachments[id]){
    // Crop transparent padding only; preserve source pixels and ground registration.
    let left=128,top=128,right=-1,bottom=-1;
    for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(source.data[((row*128+y)*source.width+col*128+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<left)throw Error('Empty source frame '+id);
    const png=new PNG({width:right-left+1,height:bottom-top+1});PNG.bitblt(source,png,col*128+left,row*128+top,png.width,png.height,0,0);
    attachments[id]={image:'data:image/png;base64,'+PNG.sync.write(png).toString('base64'),x:left-64,y:top-96};
   }
   return {time:i/fps,attachment:id,visible:true};
  });
  animations[name]={name,fps,duration:frames.length/fps,loop,tracks:[],slotTracks:[{slot:'完整人物',keys}],events:events.map(([time,name])=>({time,name}))};
 }
}
const project={version:1,
 credits:'Zombie Sprites — Clint Bellanger. CC-BY 3.0. Source: https://opengameart.org/content/zombie-sprites License: https://creativecommons.org/licenses/by/3.0/ Changes: four-direction frame extraction, editor packaging, timing and event markers. Original raster artwork unchanged.',
 presentation:{title:'废土僵尸 · 图片关键帧',note:'完整人物逐帧素材，不是分层肢体。切换动作 / 方向；图片页编辑紫色帧，事件仅作标记。',directions:directions.map(d=>d[0]),groups},
 definition:{bones:[{name:'root'}],slots:[{name:'完整人物',bone:'root',part:'zombie',z:0,attachment:'zombie_5_4'}],attachments,drawOrder:'slots'},
 animations,editor:{clip:'行走 · 东南',time:0,direction:0}};
await writeFile(new URL('data/examples/zombie-project.json',root),JSON.stringify(project,null,2)+'\n');
console.log('Zombie project: '+Object.keys(animations).length+' clips, '+Object.keys(attachments).length+' embedded frames.');
