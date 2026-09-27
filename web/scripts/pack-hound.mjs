import fs from 'node:fs';
import { PNG } from 'pngjs';
const dir='public/mods/revival/assets/hound/';
const src=PNG.sync.read(fs.readFileSync(dir+'generated-source.png'));
const bands=[];let start=-1;
for(let y=0;y<=src.height;y++){let count=0;if(y<src.height)for(let x=0;x<src.width;x++)if(src.data[(y*src.width+x)*4+3]>100)count++;
 if(count>8&&start<0)start=y;if(count<=8&&start>=0){if(y-start>15)bands.push([start,y]);start=-1;}}
console.log('source',src.width,src.height,'bands',bands);
if(bands.length!==9)throw Error('Expected 9 visually reviewed rows');
const out=new PNG({width:800,height:2000});
const mapping=[[0,1,2,3,3],[4,5,6,7,8]];
for(let d=0;d<4;d++)for(let action=0;action<5;action++)for(let f=0;f<8;f++){
 const back=d===0||d===3,mirror=d>=2;
 const row=mapping[back?1:0][action], [top,bottom]=bands[row];
 const sf=!back&&action===3?[0,1,2,1,0,0,0,0][f]:f;
 const x0=Math.round(sf*src.width/8),x1=Math.round((sf+1)*src.width/8);
 // Match the smaller real-world scale of the dog beside human battle dolls.
 const scale=.25, ox=50-(x1-x0)*scale/2, oy=70-(bottom-top)*scale;
 // Keep only the largest connected opaque component in each source cell.
 // Generated frames occasionally leave a detached tail/pixel in a neighbor.
 const seen=new Set(), components=[];
 for(let sy=top;sy<bottom;sy++)for(let sx=x0;sx<x1;sx++){
  const seed=sy*src.width+sx;if(seen.has(seed)||src.data[seed*4+3]<=100)continue;
  const q=[seed],part=[];seen.add(seed);
  for(let qi=0;qi<q.length;qi++){const p=q[qi],px=p%src.width,py=Math.floor(p/src.width);part.push(p);
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const nx=px+dx,ny=py+dy,np=ny*src.width+nx;if(nx>=x0&&nx<x1&&ny>=top&&ny<bottom&&!seen.has(np)&&src.data[np*4+3]>100){seen.add(np);q.push(np);}}
  } components.push(part);
 }
 const keep=new Set((components.sort((a,b)=>b.length-a.length)[0]||[]));
 for(let y=0;y<100;y++)for(let x=0;x<100;x++){
  const sx=x0+Math.floor(((mirror?99-x:x)-ox)/scale),sy=top+Math.floor((y-oy)/scale);
  if(sx<x0||sx>=x1||sy<top||sy>=bottom||!keep.has(sy*src.width+sx))continue;
  const si=(sy*src.width+sx)*4,oi=(((action*4+d)*100+y)*800+f*100+x)*4;
  for(let c=0;c<4;c++)out.data[oi+c]=src.data[si+c];
 }
}
fs.writeFileSync(dir+'hound-atlas.png',PNG.sync.write(out));
const mask=new PNG({width:out.width,height:out.height});
for(let i=0;i<out.data.length;i+=4){const r=out.data[i],g=out.data[i+1],b=out.data[i+2],v=Math.round(.299*r+.587*g+.114*b);
 const neutral=Math.min(1,v/45),light=Math.max(0,(v-95)/160),main=1-light;
 mask.data[i]=Math.round(v*main*neutral);mask.data[i+1]=Math.round(v*light*neutral);mask.data[i+2]=Math.round(v*(1-neutral));mask.data[i+3]=out.data[i+3];}
fs.writeFileSync(dir+'hound-color-mask.png',PNG.sync.write(mask));
fs.writeFileSync(dir+'atlas.json',JSON.stringify({cell:{width:100,height:100,anchor:[50,70]},columns:8,rows:20,directions:['NE','SE','SW','NW'],actions:['static-idle-frame','walk','bite','hit','death'],row:'action * 4 + direction',source:'generated-source.png',notes:'No idle animation: standing units use idle source frame 0. Left directions mirrored per frame. Front hit uses recoil frames from generated collapse sequence.'},null,2));
