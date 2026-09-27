// QA renderer for the layered zombie rig project. Uses the REAL runtime math
// (BattleSkeleton.ts bundled via esbuild) and rasterizes with pngjs, so what
// renders here is what the battle page / editor canvas will draw.
// Run from web/: node public/mods/revival/tools/zombie_rig_qa.mjs
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {PNG} from 'pngjs';
const root = new URL('../', import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'revival-rig-qa-'));
try {
  await build({entryPoints: [resolve('public/mods/revival/qa/authoring-editor-model.ts')], bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'model.mjs')});
  await build({entryPoints: [resolve('public/mods/revival/runtime/BattleSkeleton.ts')], bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'runtime.mjs')});
  const m = await import(pathToFileURL(join(temp, 'model.mjs')));
  const rt = await import(pathToFileURL(join(temp, 'runtime.mjs')));
  const project = JSON.parse(await readFile(new URL('data/examples/zombie-rig-project.json', root), 'utf8'));
  m.validateProject(project);
  assert.equal(Object.keys(project.animations).length, 24);
  const {sampleSkeleton, orderedSkeletonSlots, slotMatrix} = rt;
  const images = new Map();
  for (const [id, a] of Object.entries(project.definition.attachments ?? {})) {
    if (!a.image?.startsWith('data:image/png;base64,')) throw new Error('attachment ' + id + ' is not an embedded PNG');
    images.set(id, PNG.sync.read(Buffer.from(a.image.split(',')[1], 'base64')));
  }
  const W = 100, H = 100, GX = 50, GY = 70;
  function drawCell(clip, t, scale = 3) {
    const cell = new PNG({width: W * scale, height: H * scale});
    for (let i = 0; i < cell.data.length; i += 4) { cell.data[i] = 36; cell.data[i + 1] = 40; cell.data[i + 2] = 52; cell.data[i + 3] = 255; }
    const gy = Math.round((GY + 3) * scale);
    for (let x = 0; x < W * scale; x++) { const i = (gy * W * scale + x) * 4; cell.data[i] = 92; cell.data[i + 1] = 98; cell.data[i + 2] = 112; }
    const pose = sampleSkeleton(project.definition, clip, t);
    for (const slot of orderedSkeletonSlots(pose, 0, [])) {
      if (slot.visible === false || !slot.attachment) continue;
      const a = pose.attachments[slot.attachment], im = images.get(slot.attachment);
      if (!im || !a) continue;
      const mm = slotMatrix(pose, slot, 0);
      const A = mm.a, B = mm.b, C = mm.c, D = mm.d;
      const TX = mm.a * (a.x ?? 0) + mm.c * (a.y ?? 0) + mm.tx, TY = mm.b * (a.x ?? 0) + mm.d * (a.y ?? 0) + mm.ty;
      const det = A * D - B * C;
      const ia = D / det, ib = -B / det, ic = -C / det, id = A / det;
      const itx = -(ia * TX + ic * TY), ity = -(ib * TX + id * TY);
      const alpha = (pose.bones[slot.bone]?.alpha ?? 1) * (slot.alpha ?? 1);
      const sw = im.width, sh = im.height;
      for (let Y = 0; Y < H * scale; Y++) for (let X = 0; X < W * scale; X++) {
        const wx = (X + .5) / scale - GX, wy = (Y + .5) / scale - GY;
        const sx = ia * wx + ic * wy + itx, sy = ib * wx + id * wy + ity;
        const ix = sx | 0, iy = sy | 0;
        if (ix < 0 || iy < 0 || ix >= sw || iy >= sh) continue;
        const si = (iy * sw + ix) * 4;
        const sa = im.data[si + 3] / 255 * alpha;
        if (sa <= 0) continue;
        const di = (Y * W * scale + X) * 4;
        const da = cell.data[di + 3] / 255;
        const oa = sa + da * (1 - sa);
        for (let k = 0; k < 3; k++) cell.data[di + k] = Math.round((im.data[si + k] * sa + cell.data[di + k] * da * (1 - sa)) / oa);
        cell.data[di + 3] = Math.round(oa * 255);
      }
    }
    return cell;
  }
  async function sheet(rows, path, scale = 3) {
    const cw = W * scale, ch = H * scale, gap = 4;
    const out = new PNG({width: cw * rows[0].cells.length + gap * (rows[0].cells.length + 1), height: ch * rows.length + gap * (rows.length + 1)});
    for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 24; out.data[i + 1] = 26; out.data[i + 2] = 34; out.data[i + 3] = 255; }
    rows.forEach((row, r) => row.cells.forEach((cell, c) => {
      PNG.bitblt(cell, out, 0, 0, cw, ch, gap + c * (cw + gap), gap + r * (ch + gap));
    }));
    await writeFile(path, PNG.sync.write(out));
    console.log('sheet ->', path, out.width + 'x' + out.height);
  }
  const DIRS = ['东北', '东南', '西南', '西北'];
  const ACTIONS = ['待机', '行走', '攻击', '啃咬', '受击', '死亡'];
  const pick = {'待机': .6, '行走': .25, '攻击': .4, '啃咬': .34, '受击': .08, '死亡': .9};
  await sheet(ACTIONS.map(action => ({cells: DIRS.map(d => drawCell(project.animations[action + ' · ' + d], pick[action]))})),
    fileURLToPath(new URL('qa/zombie-rig-qa-actions.png', root)));
  const frames = (name, times) => ({cells: times.map(t => drawCell(project.animations[name], t))});
  await sheet([
    frames('行走 · 东南', [0, .125, .25, .375, .5, .625, .75, .875]),
    frames('行走 · 西北', [0, .125, .25, .375, .5, .625, .75, .875]),
    frames('攻击 · 东南', [0, .2, .4, .6, .8]),
    frames('啃咬 · 东南', [0, .16, .34, .5, .7]),
    frames('受击 · 东南', [0, .08, .4]),
    frames('死亡 · 东南', [0, .15, .45, .6, .75, .9, 1.05, 1.2]),
    frames('死亡 · 西南', [0, .15, .45, .6, .75, .9, 1.05, 1.2]),
  ], fileURLToPath(new URL('qa/zombie-rig-qa-frames.png', root)));
  // behavioral spot checks through the runtime
  const walk = project.animations['行走 · 东南'];
  assert.equal(walk.events.filter(e => e.name === 'footstep').length, 2);
  const p0 = sampleSkeleton(project.definition, walk, 0), p1 = sampleSkeleton(project.definition, walk, 1);
  assert.ok(Math.abs(p1.bones.thigh_near.rotation - p0.bones.thigh_near.rotation) < 1e-6, 'walk wrap pose should equal first pose');
  const death = project.animations['死亡 · 东南'];
  const dEnd = sampleSkeleton(project.definition, death, 99);
  assert.ok(Math.abs(dEnd.bones.root.rotation - 75 * Math.PI / 180) < 1e-3, 'death SE should end at +75deg');
  const dNW = sampleSkeleton(project.definition, project.animations['死亡 · 西北'], 99);
  assert.ok(Math.abs(dNW.bones.root.rotation + 75 * Math.PI / 180) < 1e-3, 'death NW should end at -75deg');
  // every direction re-points all slots at its own game-art parts at time 0
  for (const [i, d] of DIRS.entries()) {
    const pose = sampleSkeleton(project.definition, project.animations['待机 · ' + d], 0);
    for (const slot of pose.slots) {
      const want = `${slot.name}_${i}`;
      assert.equal(slot.attachment, want, `${d} slot ${slot.name} should use ${want}`);
    }
  }
  console.log('Rig QA PASS: 24 clips validate, walk wraps, death fall signs, per-direction game-art attachments.');
} finally { await rm(temp, {recursive: true, force: true}); }
