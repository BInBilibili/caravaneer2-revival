// Builds the layered zombie example project from GAME-ART parts (the Caravaneer 2
// doll atlases re-tinted zombie). Parts are cut/straightened by
// render_zombie_game_rig_parts.py; this script assembles bones/slots/attachments/
// animations into the editor project JSON consumed by the authoring preview and
// the battle visual (zombie-battle.html?project=data/examples/zombie-rig-project.json).
// Run from web/: node public/mods/revival/tools/build_zombie_game_rig_project.mjs
import {readFile, writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
const root = new URL('../', import.meta.url);
const spec = JSON.parse(await readFile(new URL('assets/zombie/gamerig/rig-spec.json', root), 'utf8'));
const DIRECTIONS = ['东北', '东南', '西南', '西北']; // BATTLE_DIRECTIONS order, index = art direction
const DEG = Math.PI / 180;
const attachments = {};
for (const name of Object.keys(spec.parts)) {
  const png = PNG.sync.read(await readFile(new URL(`assets/zombie/gamerig/${name}.png`, root)));
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
// rotations in degrees per key time; bones not listed keep their rest pose.
// thigh_near/thigh_far replace v1's thigh_L/thigh_R (this rig has no shin bones).
const CLIPS = {
  '待机': {fps: 12, duration: 1.2, loop: true, times: [0, .6, 1.2], tracks: {
    torso: [0, 1.5, 0], head: [0, -2, 0], uarm_L: [0, 2, 0], uarm_R: [0, -2, 0], farm_L: [0, 1, 0], farm_R: [0, -1, 0]}},
  '行走': {fps: 8, duration: 1, loop: true, times: [0, .125, .25, .375, .5, .625, .75, .875],
    tracks: {thigh_near: [24, 14, 0, -18, -28, -18, 0, 14], thigh_far: [-28, -18, 0, 14, 24, 14, 0, -18],
      uarm_L: [-16.8, -9.8, 0, 12.6, 19.6, 12.6, 0, -9.8], uarm_R: [19.6, 12.6, 0, -9.8, -16.8, -9.8, 0, 12.6],
      farm_L: [-10, -10, -10, -10, -10, -10, -10, -10], farm_R: [-10, -10, -10, -10, -10, -10, -10, -10],
      torso: [2, 1, 0, -1, -2, -1, 0, 1], root: [0, 1.5, 2, 1.5, 0, -1.5, -2, -1.5]},
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
      thigh_near: [0, 4, 10, 12, 12], thigh_far: [0, 4, 10, 12, 12]},
    events: [[0, 'death_start'], [1.0, 'corpse']]},
};
const FALL_SIGN = {'东南': 1, '西南': -1, '西北': -1, '东北': 1}; // death fall direction per facing
const animations = {}, groups = {};
function buildClip(action, dirIndex, direction) {
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
    if (c.rootX && !c.tracks.root) tracks.push({bone: 'root', keys: c.times.map((t, i) => ({time: t, transform: {x: c.rootX[i]}}))});
  }
  if (action === '行走') wrap(tracks, [...c.times, 1]);
  // per-direction parts: every slot re-points its attachment at time 0 and takes
  // this direction's layering (near arm in front, far leg behind).
  const nearArm = spec.meta.nearArm[String(dirIndex)];
  const zFor = name => {
    if (name === 'thigh_near') return 1.6;
    if (name === 'thigh_far') return 1.4;
    if (name === 'torso') return 2;
    if (name === 'head') return 3;
    const side = name.endsWith('_L') ? 'L' : 'R';
    return side === nearArm ? 4 : 1;
  };
  const slotTracks = spec.slots.map(s => ({slot: s.name, keys: [{time: 0, attachment: `${s.name}_${dirIndex}`, z: zFor(s.name)}]}));
  return {name: action + ' · ' + direction, fps: c.fps, duration: c.duration, loop: c.loop, tracks, slotTracks, events: (c.events ?? []).map(([time, name]) => ({time, name}))};
}
for (const action of Object.keys(CLIPS)) {
  groups[action] = [];
  for (const [i, d] of DIRECTIONS.entries()) {
    const clip = buildClip(action, i, d);
    animations[clip.name] = clip;
    groups[action].push(clip.name);
  }
}
const project = {version: 1,
  credits: 'Layered body-part zombie rig cut from the Caravaneer 2 battle doll atlases (Clint Bellanger art, the game\'s own sprites) re-tinted with a zombie palette through the runtime weight-map tint math. Side-view far legs are synthesized from the paired opposite-facing direction. Animation: Revival keyframe/bone rig.',
  presentation: {title: '废土僵尸 · 游戏本体分层骨骼', note: '分层部位骨骼示例：部位全部取自游戏本体纸娃娃（Bellanger 原画）僵尸配色重烘，关键帧驱动旋转。四方向均为游戏原画切图，侧视远侧腿由对向补全。', directions: DIRECTIONS, groups},
  definition: {bones: spec.bones, slots, attachments, drawOrder: 'slots'},
  animations, editor: {clip: '行走 · 东南', time: 0, direction: 1}};
await writeFile(new URL('data/examples/zombie-rig-project.json', root), JSON.stringify(project, null, 2) + '\n');
console.log(`Rig zombie project: ${Object.keys(animations).length} clips, ${Object.keys(attachments).length} parts, ${project.definition.bones.length} bones.`);
