import fs from 'node:fs';
import {PNG} from 'pngjs';
const dir='public/mods/revival/assets/hound/';
const target=dir+'generated-source.png';
const before=fs.readFileSync(target);
const src=PNG.sync.read(before);
const editBytes=fs.readFileSync(process.argv[2]);
const edit=PNG.sync.read(editBytes);
if(src.width!==edit.width||src.height!==edit.height)throw Error('Canvas size mismatch; do not stretch sprite frames');
const backup=dir+'before-ne-continuity-'+Date.now()+'/';
fs.mkdirSync(backup);
for(const name of ['generated-source.png','hound-atlas.png','hound-color-mask.png','atlas.json'])fs.copyFileSync(dir+name,backup+name);
// Copy only the sixth action band, including its transparent margin.
for(let y=720;y<870;y++)edit.data.copy(src.data,y*src.width*4,y*src.width*4,(y+1)*src.width*4);
const original=PNG.sync.read(before);
for(let y=0;y<src.height;y++)if(y<720||y>=870){
 const a=y*src.width*4,b=(y+1)*src.width*4;
 if(!src.data.subarray(a,b).equals(original.data.subarray(a,b)))throw Error('Unrelated row changed');
}
fs.writeFileSync(dir+'ne-continuity-generated.png',editBytes);
fs.writeFileSync(target,PNG.sync.write(src));
console.log('Only sixth band replaced; backup:',backup);
