// Preparation only: baked AS3 bitmap frames do not contain editable limb rigs.
// Run from any directory. --check verifies generated files without writing.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const output = resolve(root, 'public/mods/revival/qa/static-preparation');
const check = process.argv.includes('--check');
assert(process.argv.slice(2).every(arg => arg === '--check'), 'Usage: prepare_static_attachments.mjs [--check]');
const readJSON = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const doll = readJSON('public/data/battle_doll.json');
const manifest = readJSON('public/assets/manifest.json');
const categories = {
  BackHair: 'body', Beard: 'body', Body: 'body', Head: 'body',
  LeftTopArm: 'arms', RightTopArm: 'arms', LeftForearm: 'arms', RightForearm: 'arms',
  Legs: 'legs', BigGunBackpack: 'weapon', Weapon: 'weapon', Shadows: 'shadow',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const entries = [], sources = {};
for (const [part, category] of Object.entries(categories)) {
  for (const type of Object.keys(doll.spriteBoundaries[part])) {
    const source = `${part}${type}.png`, url = manifest.images[source]?.[0];
    assert.equal(typeof url, 'string', `Missing image ${source}`);
    const path = resolve(root, 'public', url), rel = relative(resolve(root, 'public'), path);
    assert(!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../'), 'Image path escapes public');
    const bytes = readFileSync(path), png = PNG.sync.read(bytes);
    const cell = doll.spriteDimensions[part][type];
    sources[source] = { url, sha256: hash(bytes) };
    // Standalone native-size source crops, not a synthetic walking animation.
    const frame = doll.fullAnimationTypeFrames[0][0][0][category];
    for (let direction = 0; direction < 4; direction++) {
      const b = doll.spriteBoundaries[part][type][direction][frame];
      assert(b && [b.x,b.y,b.width,b.height].every(Number.isInteger), `Invalid bounds ${source}/${direction}/${frame}`);
      assert(b.width > 0 && b.height > 0);
      const sx = (direction + (frame > 80 ? 4 : 0)) * cell.width + b.x;
      const sy = (frame > 80 ? frame - 81 : frame - 1) * cell.height + b.y;
      const rgba = Buffer.alloc(b.width * b.height * 4);
      // Match the original renderer's transparent clipping at image edges.
      for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
        if (sx+x < 0 || sx+x >= png.width || sy+y < 0 || sy+y >= png.height) continue;
        const offset = ((sy+y)*png.width+sx+x)*4;
        png.data.copy(rgba, (y*b.width+x)*4, offset, offset+4);
      }
      entries.push({ id: `${part}/${type}/${direction}`, source, part, type, direction, frame,
        registration: { x: b.x, y: b.y }, width: b.width, height: b.height,
        rgba, sha256: hash(rgba), requiresLegSeparation: part === 'Legs',
        tint: ['Weapon','BigGunBackpack','Shadows'].includes(part) ? 'preserve' : 'original-color-masks' });
    }
  }
}
// One atlas for all appearance variants; no resampling or recoloring.
const width = Math.max(512, ...entries.map(e => e.width+2));
let x=1, y=1, rowHeight=0;
for (const entry of entries) {
  if (x+entry.width+1 > width) { x=1; y+=rowHeight+2; rowHeight=0; }
  entry.rect = { x, y, width: entry.width, height: entry.height };
  x+=entry.width+2; rowHeight=Math.max(rowHeight, entry.height);
}
const atlas = new PNG({ width, height: y+rowHeight+1 });
for (const e of entries) for (let row=0; row<e.height; row++) {
  e.rgba.copy(atlas.data, ((e.rect.y+row)*width+e.rect.x)*4, row*e.width*4, (row+1)*e.width*4);
}
const pngBytes = PNG.sync.write(atlas);
const decoded = PNG.sync.read(pngBytes);
for (const e of entries) for (let row=0; row<e.height; row++) {
  const start=((e.rect.y+row)*width+e.rect.x)*4;
  assert(decoded.data.subarray(start,start+e.width*4).equals(e.rgba.subarray(row*e.width*4,(row+1)*e.width*4)), `Changed source pixels: ${e.id}`);
}
const metadata = {
  version: 1, status: 'preparation-only-not-installed', image: 'attachments.png',
  width: atlas.width, height: atlas.height, sources,
  coverage: { parts: Object.keys(categories).length, appearanceVariants: Object.keys(sources).length, directions: 4, attachments: entries.length },
  limitations: [
    'Source is baked raster art, not original skeletal keyframes.',
    'Legs contains both legs; extracting a crop does not separate hips, thighs, shins or feet.',
    'Occluded limb surfaces and directional death poses still need authoring.',
    'No animation tracks are generated, and this atlas is not installed in gameplay.',
    'Base-game variants only; third-party replacement art needs its own rig/skin.',
  ],
  attachments: Object.fromEntries(entries.map(({id,rgba,width,height,...entry}) => [id,entry])),
};
const jsonBytes = Buffer.from(JSON.stringify(metadata,null,2)+'\n');
if (check) {
  assert(readFileSync(resolve(output,'attachments.png')).equals(pngBytes), 'Static atlas is stale');
  assert(readFileSync(resolve(output,'attachments.json')).equals(jsonBytes), 'Static metadata is stale');
} else {
  mkdirSync(output,{recursive:true});
  writeFileSync(resolve(output,'attachments.png'),pngBytes);
  writeFileSync(resolve(output,'attachments.json'),jsonBytes);
}
console.log(JSON.stringify({check,...metadata.coverage,width:atlas.width,height:atlas.height,pngBytes:pngBytes.length,originalRGBABytesPreserved:true,status:metadata.status},null,2));
