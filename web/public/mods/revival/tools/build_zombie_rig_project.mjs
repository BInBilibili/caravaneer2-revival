// Builds the layered (body-part rigged) zombie example project for the Revival
// authoring pipeline. Parts are drawn by render_zombie_rig_parts.py; this script
// only assembles bones/slots/attachments/animations into the editor project JSON.
// Run from web/: node public/mods/revival/tools/build_zombie_rig_project.mjs
import {readFile, writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
const root = new URL('../', import.meta.url);
const spec = JSON.parse(await readFile(new URL('assets/zombie/rig/rig-spec.json', root), 'utf8'));
const DIRECTIONS = ['东北', '东南', '西南', '西北']; // BATTLE_DIRECTIONS order
const DEG = Math.PI / 180;
const attachments = {};
for (const name of Object.keys(spec.parts)) {
  const png = PNG.sync.read(await readFile(new URL(`assets/zombie/rig/${name}.png`, root)));
  const [w, h] = spec.parts[name];
  if (png.width !== w || png.height !== h) throw new Error(`Part ${name} size mismatch`);
  if (!png.data.some((v, i) => i % 4 === 3 && v > 0)) throw new Error(`Part ${name} is empty`);
  attachments[name] = {image: 'data:image/png;base64,' + PNG.sync.write(png).toString('base64'), x: spec.anchors[name][0], y: spec.anchors[name][1]};
}
const slots = spec.slots.map(s => ({name: s.name, bone: s.bone, part: s.part, z: s.z, attachment: s.part}));
const key = (time, rotation) => ({time, transform: rotation ? {rotation: +(rotation * DEG).toFixed(5)} : {}});
const track = (bone, rots, times) => ({bone, keys: rots.map((r, i) => key(times[i], r))});
const wrap = (tr, times) => { // append a key equal to the first pose so loops close smoothly
  for (const t of tr) t.keys.push({...JSON.parse(JSON.stringify(t.keys[0])), time: times[times.length - 1]});
};
// rotations in degrees per key time; bones not listed keep their rest pose
const CLIPS = {
  '待机': {fps: 12, duration: 1.2, loop: true, times: [0, .6, 1.2], tracks: {
    torso: [0, 1.5, 0], head: [0, -2, 0], uarm_L: [0, 2, 0], uarm_R: [0, -2, 0], farm_L: [0, 1, 0], farm_R: [0, -1, 0]}},
  '行走': {fps: 8, duration: 1, loop: true, times: [0, .125, .25, .375, .5, .625, .75, .875],
    tracks: {thigh_L: [24, 14, 0, -18, -28, -18, 0, 14], thigh_R: [-28, -18, 0, 14, 24, 14, 0, -18],
      shin_L: [6, 14, 26, 32, 26, 12, 4, 6], shin_R: [26, 12, 4, 6, 6, 14, 26, 32],
      uarm_L: [-16.8, -9.8, 0, 12.6, 19.6, 12.6, 0, -9.8], uarm_R: [19.6, 12.6, 0, -9.8, -16.8, -9.8, 0, 12.6],
      farm_L: [-10, -10, -10, -10, -10, -10, -10, -10], farm_R: [-10, -10, -10, -10, -10, -10, -10, -10],
      torso: [2, 1, 0, -1, -2, -1, 0, 1], root: [0, 1.5, 2, 1.5, 0, -1.5, -2, -1.5]},
    xform: {root: r => r}, // root track above is x-sway expressed via x below
    events: [[0, 'footstep'], [.5, 'footstep']]},
  '攻击': {fps: 10, duration: .8, loop: false, times: [0, .2, .4, .6, .8],
    tracks: {uarm_L: [0, -35, 55, 30, 0], uarm_R: [0, -35, 55, 30, 0], farm_L: [-8, -30, -5, -12, -8], farm_R: [-8, -30, -5, -12, -8],
      torso: [0, -8, 12, 6, 0], head: [0, 6, -6, -2, 0]},
    rootX: [0, -2, 5, 2, 0], events: [[.4, 'attack_hit']]},
  '啃咬': {fps: 10, duration: .7, loop: false, times: [0, .16, .34, .5, .7],
    tracks: {head: [0, 10, 22, 8, 0], torso: [0, 6, 14, 5, 0], uarm_L: [0, 25, 40, 15, 0], uarm_R: [0, 25, 40, 15, 0],
      farm_L: [-8, -20, -10, -8, -8], farm_R: [-8, -20, -10, -8, -8]},
    rootX: [0, 2, 4, 1, 0], events: [[.35, 'bite_hit']]},
  '受击': {fps: 10, duration: .4, loop: false, times: [0, .08, .4],
    tracks: {torso: [0, -7, 0], head: [0, -9, 0], uarm_L: [0, -12, 0], uarm_R: [0, -12, 0], farm_L: [0, -6, 0], farm_R: [0, -6, 0]},
    rootX: [0, -4, 0], events: [[.05, 'hit_react']]},
  '死亡': {fps: 12, duration: 1.2, loop: false, times: [0, .15, .45, .9, 1.2],
    tracks: {root: [0, -6, 28, 75, 75], head: [0, 10, 24, 30, 30], uarm_L: [0, -20, 30, 45, 45], uarm_R: [0, -20, 30, 45, 45],
      thigh_L: [0, 4, 10, 12, 12], thigh_R: [0, 4, 10, 12, 12], shin_L: [0, -8, -16, -18, -18], shin_R: [0, -8, -16, -18, -18]},
    events: [[0, 'death_start'], [1.0, 'corpse']]},
};
const FALL_SIGN = {'东南': 1, '西南': -1, '西北': -1, '东北': 1}; // death fall direction per facing
const animations = {}, groups = {};
const mirrorName = n => n.endsWith('_L') ? n.slice(0, -2) + '_R' : n.endsWith('_R') ? n.slice(0, -2) + '_L' : n;
const mirrorKeys = keys => keys.map(k => ({time: k.time, transform: Object.fromEntries(Object.entries(k.transform).map(([c, v]) => [c, (c === 'x' || c === 'rotation') ? -v : v])), ...(k.interpolation ? {interpolation: k.interpolation} : {})}));
function buildClip(action, direction) {
  const c = CLIPS[action];
  const tracks = [];
  if (action === '死亡') {
    const sign = FALL_SIGN[direction];
    tracks.push({bone: 'root', keys: c.times.map((t, i) => ({time: t, transform: {rotation: +(c.tracks.root[i] * sign * DEG).toFixed(5)}}))});
    for (const [bone, rots] of Object.entries(c.tracks)) if (bone !== 'root') tracks.push(track(bone, rots, c.times));
  } else {
    for (const [bone, rots] of Object.entries(c.tracks)) {
      const tr = track(bone, rots, c.times);
      if (bone === 'root') tr.keys = c.times.map((t, i) => ({time: t, transform: {x: c.rootX?.[i] ?? rots[i]}}));
      tracks.push(tr);
    }
  }
  if (c.rootX && action !== '死亡' && !c.tracks.root) tracks.push({bone: 'root', keys: c.times.map((t, i) => ({time: t, transform: {x: c.rootX[i]}}))});
  if (action === '行走') wrap(tracks, [...c.times, 1]);
  const back = direction === '西北' || direction === '东北';
  const slotTracks = [];
  if (back) {
    slotTracks.push({slot: 'head', keys: [{time: 0, attachment: 'head_b'}]}, {slot: 'torso', keys: [{time: 0, attachment: 'torso_b'}]});
    slotTracks.push({slot: 'uarm_L', keys: [{time: 0, z: 1}]}, {slot: 'farm_L', keys: [{time: 0, z: 1}]});
  }
  return {name: action + ' · ' + direction, fps: c.fps, duration: c.duration, loop: c.loop, tracks, slotTracks, events: (c.events ?? []).map(([time, name]) => ({time, name}))};
}
for (const action of Object.keys(CLIPS)) {
  groups[action] = [];
  const built = {};
  for (const d of DIRECTIONS) built[d] = buildClip(action, d);
  for (const d of ['西南', '东北']) {
    const src = d === '西南' ? '东南' : '西北';
    built[d] = JSON.parse(JSON.stringify(built[src]));
    built[d].name = action + ' · ' + d;
    built[d].tracks = built[src].tracks.map(t => ({bone: mirrorName(t.bone), keys: mirrorKeys(t.keys)}));
    built[d].slotTracks = built[src].slotTracks;
  }
  for (const d of DIRECTIONS) { const clip = built[d]; animations[clip.name] = clip; groups[action].push(clip.name); }
}
const project = {version: 1,
  credits: 'Layered body-part zombie rig procedurally drawn with PIL (palette sampled from the Clint Bellanger zombie sprites, CC-BY 3.0, opengameart.org/content/zombie-sprites) to match the Revival battle example art direction.',
  presentation: {title: '废土僵尸 · 分层肢体骨骼', note: '分层部位骨骼示例：头/躯干/双臂/双腿共 10 个部位，关键帧驱动旋转。东南、西北为手调，另两向由镜像生成；背面自动切换 head_b/torso_b。', directions: DIRECTIONS, groups},
  definition: {bones: spec.bones, slots, attachments, drawOrder: 'slots'},
  animations, editor: {clip: '行走 · 东南', time: 0, direction: 1}};
await writeFile(new URL('data/examples/zombie-rig-project.json', root), JSON.stringify(project, null, 2) + '\n');
console.log(`Rig zombie project: ${Object.keys(animations).length} clips, ${Object.keys(attachments).length} parts, ${Object.keys(project.definition.bones).length} bones.`);
