// Lossless original-atlas compiler. Pixel content is copied, never resampled.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { PNG } from 'pngjs';
import { isDeepStrictEqual } from 'node:util';

export function buildOriginalAtlases(doll, skeleton) {
  const manifestPath = 'public/assets/manifest.json';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const modManifestPath = 'public/mods/revival/manifest.json';
  const modManifest = JSON.parse(readFileSync(modManifestPath, 'utf8'));
  modManifest.assets ??= {};
  skeleton.definition.packedParts ??= {};
  // Expand only after original-vs-packed browser parity passes for this part.
  for (const [part, type] of ['Shadows','Body','Legs','LeftTopArm','RightTopArm','LeftForearm','RightForearm','Head','BackHair','Beard','BigGunBackpack','Weapon'].flatMap(part => Object.keys(doll.spriteBoundaries[part]).map(type => [part, Number(type)]))) {
    const source = `${part}${type}.png`, sourceUrl = manifest.images[source]?.[0];
    if (!sourceUrl) throw new Error(`Missing original atlas: ${source}`);
    const publicRoot = resolve('public');
    const sourcePath = resolve(publicRoot, sourceUrl);
    if (!sourcePath.startsWith(publicRoot + '\\') && !sourcePath.startsWith(publicRoot + '/')) throw new Error('Atlas source escapes public directory');
    const sourceBytes = readFileSync(sourcePath), png = PNG.sync.read(sourceBytes);
    const cell = doll.spriteDimensions[part][type];
    const regions = [], unique = new Map(), entries = {};
    for (let dir = 0; dir < 4; dir++) {
      const bounds = doll.spriteBoundaries[part][type][dir];
      for (const frame of Object.keys(bounds).map(Number).sort((a,b) => a-b)) {
        const b = bounds[frame];
        if (![b.x,b.y,b.width,b.height].every(Number.isInteger) || b.width < 1 || b.height < 1) throw new Error(`Invalid crop ${source}/${dir}/${frame}`);
        const sx = (dir + (frame > 80 ? 4 : 0)) * cell.width + b.x;
        const sy = (frame > 80 ? frame - 81 : frame - 1) * cell.height + b.y;
        const rgba = Buffer.alloc(b.width * b.height * 4);
        // Match Canvas clipping even if an original crop extends outside the image.
        for (let y=0; y<b.height; y++) for (let x=0; x<b.width; x++) {
          if (sx+x < 0 || sx+x >= png.width || sy+y < 0 || sy+y >= png.height) continue;
          png.data.copy(rgba, (y*b.width+x)*4, ((sy+y)*png.width+sx+x)*4, ((sy+y)*png.width+sx+x)*4+4);
        }
        const hash = `${b.width}x${b.height}:` + createHash('sha256').update(rgba).digest('hex');
        let region = unique.get(hash);
        if (!region) { region = {w:b.width,h:b.height,rgba,x:0,y:0}; unique.set(hash, region); regions.push(region); }
        // A digest is an index, not permission to change source bytes.
        if (!rgba.equals(region.rgba)) throw new Error('Atlas digest collision');
        entries[`${dir}/${frame}`] = { region, original: { ...b } };
      }
    }
    const width = Math.max(512, ...regions.map(r=>r.w+2));
    let x=1,y=1,rowHeight=0;
    for (const region of [...regions].sort((a,b)=>b.h-a.h || b.w-a.w)) {
      if (x+region.w+1>width) {x=1;y+=rowHeight+2;rowHeight=0;}
      region.x=x;region.y=y;x+=region.w+2;rowHeight=Math.max(rowHeight,region.h);
    }
    const height=y+rowHeight+1, packed = new PNG({width,height});
    for (const r of regions) for(let row=0;row<r.h;row++) r.rgba.copy(packed.data,((r.y+row)*width+r.x)*4,row*r.w*4,(row+1)*r.w*4);
    // Use grayscale+alpha only when every RGB triplet is exactly gray.
    let gray = true;
    for (let i=0;i<packed.data.length;i+=4) if (packed.data[i] !== packed.data[i+1] || packed.data[i] !== packed.data[i+2]) {gray=false;break;}
    const bytes = PNG.sync.write(packed, {colorType: gray ? 4 : 6});
    const decoded = PNG.sync.read(bytes);
    if (!decoded.data.equals(packed.data)) throw new Error('PNG encode changed RGBA bytes');
    for (const r of regions) for (let row=0;row<r.h;row++) {
      const start=((r.y+row)*width+r.x)*4;
      if (!decoded.data.subarray(start,start+r.w*4).equals(r.rgba.subarray(row*r.w*4,(row+1)*r.w*4))) throw new Error('Packed crop differs from original');
    }
    const image = `BattlePacked${part}${type}.png`, url = `mods/revival/assets/battle/${image}`;
    mkdirSync(dirname(resolve('public',url)), {recursive:true});
    writeFileSync(resolve('public',url),bytes);
    modManifest.assets[image]=`assets/battle/${image}`;
    const frames = Object.fromEntries(Object.entries(entries).map(([key,{region:r,original}])=>[key,{x:r.x,y:r.y,width:r.w,height:r.h,original}]));
    skeleton.definition.packedParts[source] = {sourceUrl,image,cell,frames,width,height};
    console.log(`${source}: ${Object.keys(frames).length} crops -> ${regions.length} unique; decoded RGBA ${png.width*png.height*4} -> ${width*height*4} bytes; PNG ${sourceBytes.length} -> ${bytes.length} bytes`);
  }
  if (!isDeepStrictEqual(JSON.parse(readFileSync(modManifestPath, 'utf8')), modManifest))
    writeFileSync(modManifestPath,JSON.stringify(modManifest,null,2)+'\n');
}
