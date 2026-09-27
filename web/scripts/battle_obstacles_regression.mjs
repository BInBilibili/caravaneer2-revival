#!/usr/bin/env node
// Minimal obstacle regression: node scripts/battle_obstacles_regression.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { PNG } from 'pngjs';
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.resolve(web, p), 'utf8');
const require = createRequire(import.meta.url), modules = new Map();
function load(file) {
  file = path.resolve(web, file); if (!path.extname(file)) file += '.ts';
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const js = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)(n => n.startsWith('.') ? load(path.resolve(path.dirname(file), n)) : require(n), module, module.exports);
  return module.exports;
}
// Only the canvas operations used by obstacles/minimap; alpha reads use real extracted PNG pixels.
globalThis.document = { createElement() {
  const cv = { width: 0, height: 0, fills: [], getContext: () => ctx };
  let image, rect;
  const ctx = {
    drawImage(img, x, y, w = img.width, h = img.height) { image = img; rect = { x, y, w, h }; },
    getImageData() {
      const data = new Uint8ClampedArray(cv.width * cv.height * 4);
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        const from = ((y + rect.y) * image.width + x + rect.x) * 4;
        data.set(image.data.subarray(from, from + 4), (y * cv.width + x) * 4);
      }
      return { width: cv.width, height: cv.height, data };
    },
    clearRect() {}, fillRect(...args) { cv.fills.push(args); }, strokeRect() {},
  };
  return cv;
} };
const { placeObstacles, RANDOM_OBSTACLE_TYPES } = load('src/game/BattleObstacles.ts');
const ds = { obstacles: JSON.parse(read('public/data/obstacles.json')), battleDoll: JSON.parse(read('public/data/battle_doll.json')) };
const defs = ds.obstacles.obstacles;
const source = read('../decompiled/all/scripts/IsoEngine/BattleField.as');
const original = JSON.parse(read('../decompiled/all/scripts/IsoEngine/Obstacle.as').match(/Data[^=]*=\s*(\[[\s\S]*?\]);/)[1].replace('undefined', 'null')).slice(1);
assert.deepEqual(defs, original);
assert.deepEqual(RANDOM_OBSTACLE_TYPES, JSON.parse(source.match(/randomObstacles = (\[[^;]+\])/)[1]));
const manifest = JSON.parse(read('public/assets/manifest.json'));
const images = new Map();
for (let type = 1; type <= 37; type++) for (const part of ['Obstacle', 'ObstacleShadow']) {
  const name = part + type + '.png';
  if (!manifest.images[name]) {
    assert.ok(part === 'ObstacleShadow' && [18, 20].includes(type));
    assert.equal(ds.battleDoll.spriteBoundaries[part][type], undefined);
    continue;
  }
  const img = PNG.sync.read(fs.readFileSync(path.join(web, 'public', manifest.images[name][0])));
  const r = ds.battleDoll.spriteBoundaries[part][type][0][1];
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= img.width && r.y + r.height <= img.height, name);
  images.set(name, img);
}
console.log('PASS 1/5: all 37 definitions, random whitelist and body/shadow resources');

// Differential oracle is the original function itself, with AS3 declarations mechanically erased.
const body = source.slice(source.indexOf('public function generateRandomObstacles()'), source.indexOf('public function dangerScoreReduction'));
const oracle = new Function('width', 'seed', 'initial', 'defs', 'pool',   'const gridWidth=width,gridHeight=width,Obstacle={Data:[null,...defs]},randomObstacles=pool;'+
  'const ASMap={Map:Array.from({length:width},(_,x)=>Array.from({length:width},(_,y)=>initial[y*width+x]))};'+
  'const MathFunctions={random:(a,b)=>Math.floor(a+seed()*(b-a+1)),oneOfArray:a=>a[Math.floor(seed()*a.length)]};let obstacles;'+
  body.slice(body.indexOf('{') + 1, body.lastIndexOf('}')).replace(/var (\w+):\*/g, 'var $1').replace(/for\((\w+) in /g, 'for($1 in ')+
  ';return {obstacles:obstacles.map(o=>({type:o.type,gx:o.x,gy:o.y,cells:defs[o.type-1].fillSquares.map(p=>[o.x+p.x,o.y+p.y])})),map:Uint8Array.from(Array.from({length:width*width},(_,i)=>ASMap.Map[i%width][Math.floor(i/width)]||0))};');
const seeded = n => () => ((n = Math.imul(n, 1664525) + 1013904223 >>> 0) / 4294967296);
for (const [size, seed, filled] of [[50, 7, false], [100, 1234, false], [8, 9, true]]) {
  const map = new Uint8Array(size * size); if (filled) map.fill(1);
  const expected = oracle(size, seeded(seed), map.slice(), defs, RANDOM_OBSTACLE_TYPES);
  const actual = placeObstacles(defs, size, size, map, null, seeded(seed));
  assert.deepEqual(actual, expected.obstacles); assert.deepEqual(map, expected.map);
  if (size === 100) assert.ok(actual.length > 90, 'old density cap must not return');
}
console.log('PASS 2/5: original differential generation, density, spacing, fallback scan, full-map termination');

const { Battle } = load('src/game/Battle.ts');
const b = Object.assign(Object.create(Battle.prototype), { ds, fieldSize: 100, fieldPx: 3200, camX: 320, camY: 320, units: [], map: new Uint8Array(10000), opts: {} });
b.opts.fixedObstacles = [2, 6, 10, 23, 26, 32, 33, 34, 35, 36, 37, 1, 18, 20].map((type, i) => ({ type, x: 30 + (i % 3) * 30, y: 20 + Math.floor(i / 3) * 15 }));
b.generateObstacles();
assert.equal(b.obstacles.length, b.opts.fixedObstacles.length);
for (const o of b.obstacles) for (const [x, y] of o.cells) assert.equal(b.map[y * 100 + x], Number(defs[o.type - 1].elevation > 1));
const low = b.obstacles.find(o => o.type === 10);
assert.ok(b.aStar(low.gx, low.gy - 1, low.gx, low.gy));
assert.equal(b.collisionContours(null).some(c => c.owner.type === 23), false);
assert.equal(b.collisionContours(null, true).find(c => c.owner.type === 23).height, 1);
for (const c of b.collisionContours(null)) assert.deepEqual(c.points, defs[c.owner.type - 1].segments.map(p => ({...p, x: (c.owner.gx + p.x) * 32, y: (c.owner.gy + p.y) * 32})));
assert.deepEqual(placeObstacles(defs, 10, 10, new Uint8Array(100), []), []);
assert.equal(placeObstacles(defs, 10, 10, new Uint8Array(100), [{type: 32, x: 0, y: 0}]).length, 1, 'fixed scenery extending beyond edges is retained');
const story = load('src/game/battleStoryData.ts');
for (const text of Object.values(Object.values(story)[0])) {
  const match = text.match(/obstaclesToPass = (\[[\s\S]*?\]);/); if (!match) continue;
  const fixed = JSON.parse(match[1]);
  assert.deepEqual(placeObstacles(defs, 100, 100, new Uint8Array(10000), fixed).map(({type,gx,gy})=>({type,x:gx,y:gy})), fixed);
}
console.log('PASS 3/5: fixed/story scenes, walkability, elevation and exact contour integration');

const { Sprite } = load('src/core/Display.ts');
const { BattleFieldView, worldToScreen } = load('src/game/BattleFieldView.ts');
const root = new Sprite(), view = new BattleFieldView(b, { getImage: n => images.get(n) ?? null }, ds, root);
view.rebuildObstacles(); view.positionUnits(0, 0);
assert.equal(view.obstacleSprites.some(o => [18, 20].includes(o.type)), false);
for (const o of view.obstacleSprites) {
  assert.equal(o.spr.parent, o.solid ? view.unitLayer : view.obstacleLayer);
  assert.equal(o.sh.parent, o.solid ? view.shadowLayer : view.obstacleLayer);
  assert.notEqual(o.sh, o.spr);
  if (o.solid) { assert.equal(o.wx, (o.gx + .5) * 32); assert.equal(o.wy, (o.gy + .5) * 32); }
  else assert.ok(o.wx >= (o.gx + .2) * 32 && o.wx < (o.gx + .8) * 32);
}
assert.equal(view.shadowLayer.alpha, .5);
assert.ok(root.children.indexOf(view.shadowLayer) < root.children.indexOf(view.obstacleLayer));
assert.ok(root.children.indexOf(view.obstacleLayer) < root.children.indexOf(view.unitLayer));
const tree = view.obstacleSprites[0];
b.camX = tree.wx; b.camY = tree.wy; view.positionObstacles();
for (const opaque of [true, false]) {
  const data = tree.mask.data;
  const i = Array.from({length: data.length / 4}, (_, i) => i).find(i => (data[i * 4 + 3] >= 2) === opaque);
  const x = tree.spr.x + tree.body.x + i % tree.mask.width + .1;
  const y = tree.spr.y + tree.body.y + Math.floor(i / tree.mask.width) + .1;
  view.updateObstacleHover(x, y);
  assert.equal(tree.spr.alpha, opaque ? .7 : 1); assert.equal(tree.sh.alpha, 1);
}
const offsets = view.obstacleSprites.map(o => [o.wx, o.wy]);
view.rebuildObstacles(); assert.deepEqual(view.obstacleSprites.map(o => [o.wx, o.wy]), offsets);
b.camX += 80; view.positionObstacles();
const p = worldToScreen(tree.wx, tree.wy, b.camX, b.camY);
assert.equal(view.obstacleSprites[0].spr.x, p.x + defs[1].shiftX);
console.log('PASS 4/5: real PNG alpha hover, independent shadows, layers, anchors and stable camera movement');

const { BattleHud } = load('src/game/BattleHud.ts');
const hud = Object.assign(Object.create(BattleHud.prototype), { ds, b, miniDirty: true, miniMap: new Sprite(), miniMapFrame: new Sprite() });
hud.syncMiniMap();
assert.deepEqual(hud.miniMapImg.image.fills, b.obstacles.filter(o => defs[o.type - 1].elevation > 1).flatMap(o => o.cells.map(([x,y]) => [x+1,y+1,1,1])));
view.dispose(); assert.equal(view.obstacleSprites.length, 0); assert.equal(view.obstacleMasks.size, 0);
console.log('PASS 5/5: minimap excludes decorations; obstacle render resources are released');
