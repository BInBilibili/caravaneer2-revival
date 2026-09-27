import assert from "node:assert/strict";
import { applyAnimationAuthoring } from "./animation_authoring.mjs";
import { sampleSkeleton, sampleSkeletonPose, skeletonPoseKey, transformPoint, slotMatrix, orderedSkeletonSlots } from "../runtime/BattleSkeleton.ts";
const def = { bones: [{ name: "root" }, { name: "weapon", parent: "root", x: 10 }], slots: [{ name: "weapon", bone: "weapon", part: "Weapon", z: 1 }] };
const anim = { name: "shoot", fps: 25, duration: 0.2, loop: false, tracks: [{ bone: "weapon", keys: [{ time: 0, transform: { rotation: 0 } }, { time: 0.1, transform: { rotation: -0.2 } }, { time: 0.2, transform: { rotation: 0 } }] }], events: [{ time: 0.1, name: "fire" }, { time: 0.12, name: "sample_later" }] };
const mid = sampleSkeleton(def, anim, 0.05, 0);
assert(Math.abs(mid.bones.weapon.rotation + 0.1) < 1e-9);
assert.equal(mid.events.length, 0);
const fired = sampleSkeleton(def, anim, 0.11, 0.05);
assert.deepEqual(fired.events.map(e => e.name), ["fire"]);
const flash = sampleSkeleton(def, anim, 0.13, 0.11);
assert.deepEqual(flash.events.map(e => e.name), ["sample_later"]);
const parented = sampleSkeleton(def, anim, 0, 0);
assert.equal(parented.bones.weapon.x, 10);
console.log("battle skeleton sampler: ok");

// Exercise production code with the extracted frames, not just JSON structure.
const { readFileSync } = await import("node:fs");
const { PNG } = await import("pngjs");
const { build } = await import("esbuild");
const bundled = await build({ stdin: { contents: 'export * from "./public/mods/revival/runtime/BattleAtlas.ts"; export * from "./public/mods/revival/runtime/BattleDoll.ts"; export { Battle } from "./public/mods/revival/runtime/Battle.ts"; export * from "./public/mods/revival/runtime/BattleAnimation.ts"; export * from "./public/mods/revival/runtime/BattleTransportAnimation.ts"; export * from "./public/mods/revival/runtime/BattleEffectAnimation.ts"; export * from "./public/mods/revival/runtime/BattleFlames.ts"; export * from "./public/mods/revival/runtime/BattleBlood.ts"; export * from "./public/mods/revival/runtime/BattleBloodVisual.ts"; export { BattleFieldView } from "./public/mods/revival/runtime/BattleFieldView.ts"; export { Sprite, BitmapObject } from "./src/core/Display.ts";', resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent" });
const { BattleBlood, BloodRenderBatch, bloodBehindOwner, BattleFieldView, createGrenadePlayback, BattleFlames, createEffectPlayback, effectFrame, effectSpritePlacement, Sprite, BitmapObject, newTransportAnimation, startTransportAnimation, advanceTransportAnimation, transportPoseFrames, createOriginalTransportRig, packedPartAtlas, packedPartFrame, battlePackedImage, ensureBattlePart, newDollAnim, startPhase, startWalk, advanceDoll, startDollAction, createLegacyBattleClip, createAnimationPlayback, advanceAnimationPlayback, renderDollFrame, weaponMuzzleOffset, cachedDollFrame, clearRenderCache, Battle } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const doll = JSON.parse(readFileSync("public/data/battle_doll.json", "utf8"));
const skeleton = JSON.parse(readFileSync("public/mods/revival/data/battle_skeleton.json", "utf8"));
const names = ["idle", "walk", "shoot", "hit", "death"];
const categoryOfPart = {
  LeftTopArm: "arms", LeftForearm: "arms", RightTopArm: "arms", RightForearm: "arms",
  Head: "body", Body: "body", Beard: "body", BackHair: "body", ShoulderPlates: "body",
  Legs: "legs", Weapon: "weapon", BigGunBackpack: "weapon", Shadows: "shadow",
};
function legacyClipProjection(clip) {
  const { slotTracks, ...legacy } = clip;
  return legacy;
}
let failures = 0;
function check(name, run) {
  try { run(); console.log(name + ": ok"); }
  catch (error) { failures++; console.error(name + ": " + error.message); }
}
check("rig affine: nonuniform parent scale, child rotation, reflection and pivots", () => {
  const rig = { bones: [
    { name: "child", parent: "root", x: 3, y: 4, rotation: .8, scaleX: -.9, scaleY: 1.3, pivotX: 4, pivotY: 5, alpha: .6 },
    { name: "root", x: 8, y: 12, rotation: .3, scaleX: 2, scaleY: .5, pivotX: 2, pivotY: 1, alpha: .5 }
  ], slots: [{ name: "socket", bone: "child", part: "Weapon", z: 0, x: 6, y: -2, rotation: .2, pivotX: 3, directions: { "3": { scaleX: -1 } } }] };
  const pose = sampleSkeleton(rig, undefined, 0);
  function manual(p, tr) {
    const x = (p.x-(tr.pivotX ?? 0))*(tr.scaleX ?? 1), y = (p.y-(tr.pivotY ?? 0))*(tr.scaleY ?? 1);
    const c = Math.cos(tr.rotation ?? 0), sn = Math.sin(tr.rotation ?? 0);
    return { x: (tr.x ?? 0)+c*x-sn*y, y: (tr.y ?? 0)+sn*x+c*y };
  }
  const input = { x: 7, y: 9 };
  for (const dir of [0, 3]) {
    const socket = { ...rig.slots[0], ...rig.slots[0].directions[dir] };
    const expected = manual(manual(manual(input, socket), rig.bones[0]), rig.bones[1]);
    const got = transformPoint(slotMatrix(pose, rig.slots[0], dir), input.x, input.y);
    assert(Math.abs(got.x-expected.x) < 1e-10); assert(Math.abs(got.y-expected.y) < 1e-10);
  }
  assert.equal(pose.bones.child.alpha, .3);
  const m = pose.bones.child.matrix;
  assert(Math.abs(m.a*m.c+m.b*m.d) > .1, "parent-induced shear must not be lost");
  assert.throws(() => sampleSkeleton({ bones: [{ name: "a", parent: "b" }, { name: "b", parent: "a" }], slots: [] }, undefined, 0), /parent cycle/);
  assert.throws(() => sampleSkeleton({ bones: [{ name: "a", parent: "missing" }], slots: [] }, undefined, 0), /Missing skeleton parent/);
  assert.throws(() => sampleSkeleton({ bones: [{ name: "a" }, { name: "a" }], slots: [] }, undefined, 0), /Duplicate skeleton bone/);
  assert.throws(() => sampleSkeleton({ bones: [], slots: [{ name: "a", bone: "missing" }] }, undefined, 0), /Missing slot bone/);
});
check("rig slots: fixed attachments, independent step channels and directional layer order", () => {
  const rig = { drawOrder: "slots", bones: [{ name: "root" }], attachments: { a: { image: "a.png" }, b: { part: "Body", frame: 1 } },
    slots: [{ name: "front", bone: "root", part: "Body", z: 2, attachment: "a", directions: { "1": { z: -1 } } }, { name: "back", bone: "root", part: "Body", z: 1 }] };
  const clip = { name: "rig", duration: .2, fps: 25, tracks: [{ bone: "root", keys: [
    { time: 0, transform: { x: 3 }, interpolation: "step" }, { time: .08, transform: { x: 9 } }
  ] }], slotTracks: [{ slot: "front", keys: [
    { time: .04, attachment: "b" }, { time: .08, visible: false }, { time: .12, visible: true, z: -2 }, { time: .16, attachment: null }
  ] }] };
  assert.equal(sampleSkeleton(rig, clip, .04).bones.root.x, 3);
  assert.equal(sampleSkeleton(rig, clip, .08).bones.root.x, 9);
  const p0 = sampleSkeleton(rig, clip, 0), p1 = sampleSkeleton(rig, clip, .08), p2 = sampleSkeleton(rig, clip, .12);
  assert.deepEqual(orderedSkeletonSlots(p0, 0, []).map(s => s.name), ["back", "front"]);
  assert.deepEqual(orderedSkeletonSlots(p0, 1, []).map(s => s.name), ["front", "back"]);
  assert.equal(p1.slots.find(s => s.name === "front").attachment, "b");
  assert.equal(p1.slots.find(s => s.name === "front").visible, false);
  assert.deepEqual(orderedSkeletonSlots(p2, 0, []).map(s => s.name), ["front", "back"]);
  assert.equal(p2.slots.find(s => s.name === "front").visible, true);
  assert.equal(sampleSkeleton(rig, clip, .16).slots.find(s => s.name === "front").attachment, null);
});
check("production renderer: standalone images, slot order, alpha, shadow isolation and transformed muzzle", () => {
  const oldDocument = globalThis.document;
  const calls = [];
  globalThis.document = { createElement: () => ({ getContext: () => ({ clearRect() {}, save() {}, restore() {},
    transform(...matrix) { calls.push({ matrix }); }, drawImage(image, x, y) { calls.push({ image: image.src, x, y, alpha: this.globalAlpha }); } }) }) };
  try {
    const images = Object.fromEntries(["body.png", "weapon.png", "shadow.png"].map(src => [src, { src, complete: true, naturalWidth: 12, naturalHeight: 6 }]));
    const rig = { drawOrder: "slots", bones: [{ name: "root", x: 30, y: 40, scaleX: 2, scaleY: .5, alpha: .8 }, { name: "arm", parent: "root", rotation: Math.PI/2 }],
      attachments: { body: { image: "body.png" }, weapon: { image: "weapon.png", muzzle: { x: 12, y: 3 } }, shadow: { image: "shadow.png" } },
      slots: [{ name: "weapon", part: "Weapon", bone: "arm", attachment: "weapon", z: 2, x: 2, y: 3, alpha: .5 },
        { name: "body", part: "Body", bone: "root", attachment: "body", z: 1 }, { name: "shadow", part: "Shadows", bone: "root", attachment: "shadow", z: 0 }] };
    const clip = { name: "static-rig", duration: 1, fps: 25, tracks: [] };
    // Empty legacy tables prove this path is real static-image rig rendering, not legacy frames.
    const opts = { assets: { getImage: name => images[name] }, data: {}, appearance: { gender: 1 }, dir: 0, skeleton: { definition: rig, animation: clip, time: 0 } };
    renderDollFrame(opts);
    assert.deepEqual(calls.filter(c => c.image).map(c => [c.image, c.alpha]), [["body.png", .8], ["weapon.png", .4]]);
    const weaponTransform = calls.filter(c => c.matrix)[1].matrix;
    assert(Math.abs(weaponTransform[0]) < 1e-10); assert(Math.abs(weaponTransform[1]-.5) < 1e-10);
    assert(Math.abs(weaponTransform[2]+2) < 1e-10); assert.equal(weaponTransform[4], 24); assert.equal(weaponTransform[5], 41);
    const muzzle = weaponMuzzleOffset(opts);
    assert(Math.abs(muzzle.x+32) < 1e-10); assert(Math.abs(muzzle.y+23) < 1e-10);
    calls.length = 0;
    renderDollFrame({ ...opts, renderLayer: "shadow" });
    assert.deepEqual(calls.filter(c => c.image).map(c => c.image), ["shadow.png"]);
    clearRenderCache();
    const body = cachedDollFrame(opts, "rig");
    assert.equal(body, cachedDollFrame(opts, "rig"));
    assert.notEqual(body, cachedDollFrame({ ...opts, renderLayer: "shadow" }, "rig"));
    calls.length = 0;
    renderDollFrame({ ...opts, skeleton: { ...opts.skeleton, animation: { ...clip, slotTracks: [{ slot: "weapon", keys: [{ time: 0, attachment: null }] }] } } });
    assert.deepEqual(calls.filter(c => c.image).map(c => c.image), ["body.png"]);
  } finally { globalThis.document = oldDocument; clearRenderCache(); }
});
check("all 8 x 5 legacy clips at exact frame boundaries", () => {
  const legacy = JSON.parse(readFileSync("public/mods/revival/data/battle_skeleton_legacy.json", "utf8"));
  assert.deepEqual(legacy.frames, doll.animationTypeFrames);
  const mismatches = [];
  for (let type = 0; type < 8; type++) for (let phase = 0; phase < 5; phase++) {
    const clip = skeleton.animations[names[phase] + "_" + type];
    assert.deepEqual(legacyClipProjection(clip), createLegacyBattleClip(doll, type, phase));
    for (const part of ["legs", "body", "arms", "weapon", "shadow"]) {
      const range = legacy.frames[type][phase][part] ?? 1;
      const frames = Array.isArray(range) ? Array.from({length: range[1] - range[0] + 1}, (_, i) => range[0] + i) : [range];
      assert.deepEqual(clip.legacyParts[part].frames, frames);
    }
    doll.fullAnimationTypeFrames[type][phase].forEach((expected, i) => {
      const got = sampleSkeleton(skeleton.definition, clip, i / 25).legacyParts;
      for (const part of ["legs", "body", "arms", "weapon", "shadow"]) {
        if (got[part] !== expected[part]) mismatches.push(`${type}/${phase}/${i}/${part}: ${got[part]} expected ${expected[part]}`);
      }
    });
  }
  assert.equal(mismatches.length, 0, mismatches.slice(0, 8).join("; "));
});
check("migrated original clips: explicit attachments preserve every source frame", () => {
  const migrated = new Set(skeleton.migratedClips ?? []);
  assert.equal(migrated.size, 40, "all eight original types must be migrated");
  assert.deepEqual([...migrated].sort(), Array.from({ length: 8 }, (_, type) => names.map(name => `${name}_${type}`)).flat().sort());
  for (let type = 0; type < 8; type++) for (let phase = 0; phase < 5; phase++) {
    const name = names[phase] + "_" + type, clip = skeleton.animations[name];
    if (!migrated.has(name)) {
      assert.equal(clip.slotTracks, undefined, `${name} must remain on the legacy fallback`);
      continue;
    }
    assert.equal(clip.slotTracks.length, skeleton.definition.slots.length, name);
    assert.equal(new Set(clip.slotTracks.map(track => track.slot)).size, clip.slotTracks.length);
    if (type === 0) assert.deepEqual(skeleton.animations[names[phase]], {...clip, name: names[phase]});
    doll.fullAnimationTypeFrames[type][phase].forEach((sourceFrame, index) => {
      // Exact keys, times between keys, and repeated walk cycles must agree.
      const times = [index / clip.fps, (index + .5) / clip.fps];
      if (clip.loop) times.push(index / clip.fps + clip.duration * 3);
      for (const time of times) {
        const pose = sampleSkeleton(skeleton.definition, clip, time);
        assert.equal(pose.drawOrder, "legacy");
        for (const slot of pose.slots) {
          assert.ok(slot.attachment, `${name}/${index}/${slot.name} attachment`);
          assert.deepEqual(pose.attachments[slot.attachment],
            {part: slot.part, frame: sourceFrame[categoryOfPart[slot.part]]}, `${name}/${index}/${slot.name}`);
        }
      }
    });
    for (const track of clip.slotTracks) {
      assert.equal(track.keys[0].time, 0);
      for (let i = 1; i < track.keys.length; i++) {
        assert.ok(track.keys[i].time > track.keys[i-1].time);
        assert.notEqual(track.keys[i].attachment, track.keys[i-1].attachment);
      }
    }
  }
});
check("production driver: shared playback matches AS3 queued entry and terminal frames", () => {
  const source = readFileSync("../decompiled/all/scripts/IsoEngine/BattleField.as", "utf8");
  assert.match(source, /currFrame\+\+/);
  assert.match(source, /currFrame = Characters\[_loc48_\]\.applyPhaseAndFrame\.frame/);
  assert.match(source, /animationPhase == 3[\s\S]*?animationPhase = 0;[\s\S]*?currFrame = 1;/);
  assert.match(source, /animationPhase == 4[\s\S]*?currFrame--;/);
  for (let type = 0; type < 8; type++) for (const phase of [2, 3, 4]) for (const explicit of [false, true]) {
    const a = newDollAnim(), length = doll.fullAnimationTypeFrames[type][phase].length;
    const clip = skeleton.animations[names[phase] + "_" + type];
    startPhase(a, phase, type, 0, 1, explicit ? clip : undefined);
    let originalPhase = phase, originalFrame = 1, queued = {phase, frame:1};
    for (let tick = 1; tick <= length + 5; tick++) {
      // Independent translation of BattleField.EF. AS3's table starts at index 1.
      originalFrame++;
      if (queued) { originalPhase = queued.phase; originalFrame = queued.frame; queued = null; }
      const tableLength = originalPhase === 0 ? 2 : length + 1;
      if (originalFrame >= tableLength) originalFrame = 1;
      if (originalPhase === 2 && originalFrame >= tableLength - 1) queued = {phase:0,frame:1};
      if (originalPhase === 3 && originalFrame >= tableLength - 1) {originalPhase=0;originalFrame=1;}
      if (originalPhase === 4 && originalFrame >= tableLength - 1) originalFrame--;
      advanceDoll(a, 1/25, doll);
      assert.equal(a.phase, originalPhase, 'type '+type+', phase '+phase+', tick '+tick);
      assert.equal(a.frame, originalFrame);
      assert.equal(a.done, tick >= length + (phase === 2 ? 1 : 0));
      if (phase === 4 || !a.done) assert.ok(a.playback, "production uses shared player");
    }
  }
});
check("absolute event intervals: loops, ordering, zero dt", () => {
  const loop = { name: "loop", fps: 25, duration: .32, loop: true, tracks: [], events: [
    { time: .32, name: "end" }, { time: .16, name: "step" }, { time: 0, name: "start" }
  ] };
  const events = (t, prev) => sampleSkeleton(def, loop, t, prev).events.map(e => e.name);
  assert.deepEqual(events(.16, 0), ["step"]);
  assert.deepEqual(events(.32, .16), ["end", "start"]);
  assert.deepEqual(events(.65, .32), ["step", "end", "start"]);
  assert.deepEqual(events(.97, .65), ["step", "end", "start"]);
  assert.deepEqual(events(.97, .97), []);
  assert.deepEqual(events(.1, .97), []);
  assert.deepEqual(events(.65, 0), ["step", "end", "start", "step", "end", "start"]);
  const death = skeleton.animations.death_0;
  assert.deepEqual(sampleSkeleton(skeleton.definition, death, .64, 0).events.map(e => e.name), ["death_logic", "death_fall"]);
});
check("production walk: shared AS3 entry, 1x/2x, turns, terminal pose and interruption", () => {
  // Independent EF reference: queue frame 1, then currFrame += speed;
  // an eight-frame one-based table wraps at length 9; endWalk queues idle.
  const cells = [{x: 1, y: 0}, {x: 1, y: 1}, {x: 2, y: 1}];
  for (let type = 0; type < 8; type++) for (const speed of [1, 2]) for (const explicit of [false, true]) {
    const a = newDollAnim(type);
    startWalk(a, 16, 16, cells, explicit ? skeleton.animations['walk_' + type] : undefined);
    let steps = 0, frame = 0, x = 16, y = 16, dir = 1, index = 0;
    const directions = [[0,-1],[1,0],[0,1],[-1,0]], footsteps = [];
    for (let tick = 1; tick <= 12 / speed; tick++) {
      const before = JSON.stringify(a);
      advanceDoll(a, 0, doll);
      assert.equal(JSON.stringify(a), before);
      frame += speed;
      if (frame >= 9) frame = speed;
      x += directions[dir][0] * 8 * speed;
      y += directions[dir][1] * 8 * speed;
      if (frame % 4 === 0 && ++index < cells.length) dir = index === 1 ? 2 : 1;
      steps += advanceDoll(a, .04 * speed, doll);
      assert.ok(a.playback, 'walking must use the shared player');
      assert.equal(a.phase, 1);
      assert.equal(a.frame, frame);
      assert.equal(a.dispX, x);
      assert.equal(a.dispY, y);
      assert.equal(a.dir, dir);
      const cues = a.pendingEvents?.splice(0) ?? [];
      assert.deepEqual(cues.map(e => e.name), frame % 4 === 2 ? ['footstep'] : []);
      footsteps.push(...cues.map(() => frame));
    }
    assert.equal(steps, 3);
    assert.deepEqual(footsteps, [2, 6, 2]);
    assert.equal(a.frame, 4);
    assert.equal(a.walk.pendingIdle, true);
    assert.equal(a.done, false);
    advanceDoll(a, .04, doll);
    assert.equal(a.phase, 0);
    assert.equal(a.walk, null);
    assert.equal(a.playback, undefined);
    assert.equal(a.done, true);
    assert.equal(a.dispX, 80); assert.equal(a.dispY, 48);
  }
  const catchup = newDollAnim();
  startWalk(catchup, 16, 16, cells, skeleton.animations.walk_0);
  advanceDoll(catchup, 2, doll);
  assert.equal(catchup.pendingEvents.length, 3); // No cues beyond the path end.
  assert.equal(catchup.frame, 4);
  startPhase(catchup, 3, 0, 0, 1);
  assert.equal(catchup.pendingEvents, undefined);
  assert.equal(catchup.walk, null);
  advanceDoll(catchup, .04, doll);
  assert.equal(catchup.phase, 3); // Queued idle must not override interruption.
  assert.equal(catchup.frame, 1);
});
check("shared render poses: loops reuse cache, asset replacements invalidate", () => {
  const clip = skeleton.animations.walk_0;
  const pose = sampleSkeletonPose(skeleton.definition, clip, .04);
  assert.deepEqual(pose.events, []);
  assert.equal(sampleSkeletonPose(skeleton.definition, clip, .36), pose);
  assert.equal(sampleSkeletonPose(skeleton.definition, clip, .04), pose);
  assert.equal(skeletonPoseKey(skeleton.definition, clip, .36), skeletonPoseKey(skeleton.definition, clip, .04));
  assert.notEqual(skeletonPoseKey(skeleton.definition, {...clip}, .04), skeletonPoseKey(skeleton.definition, clip, .04));
  assert.notEqual(skeletonPoseKey({...skeleton.definition}, clip, .04), skeletonPoseKey(skeleton.definition, clip, .04));
  for (let cycle = 1; cycle <= 100; cycle++) assert.equal(sampleSkeletonPose(skeleton.definition, clip, cycle * .32 + .04), pose);
});
check("production death milestones: frame 5 and 7, each once", () => {
  const a = newDollAnim(), u = { dead: false, dying: true };
  let drops = 0, endChecks = 0;
  const battle = { detachWeapon() { drops++; }, checkEnd() { endChecks++; }, refreshInfo() {}, order: [], turnIdx: 0, gameOver: false };
  startPhase(a, 4, 0, 0, 1);
  for (let i = 0; i < 25; i++) {
    Battle.prototype.updateDeathEvents.call(battle, u, a);
    Battle.prototype.updateDeathEvents.call(battle, u, a);
    assert.equal(u.dead, a.frame >= 5);
    assert.equal(u.dying, a.frame < 5);
    assert.equal(!!u.__bodyFall, a.frame >= 7);
    advanceDoll(a, .04, doll);
  }
  assert.equal(a.frame, 15);
  assert.equal(drops, 1);
  assert.equal(endChecks, 1);
});
check("reaction cues: authored timing, catch-up, fractional ticks and interruption", () => {
  function setup(clip) {
    const a=newDollAnim(),u={dead:false,dying:true};
    const counts={drops:0,endChecks:0};
    const battle={detachWeapon(){counts.drops++;},checkEnd(){counts.endChecks++;},refreshInfo(){},order:[],turnIdx:0,gameOver:false};
    startPhase(a,4,0,0,1,clip);
    const step=dt=>{advanceDoll(a,dt,doll);Battle.prototype.updateDeathEvents.call(battle,u,a);};
    return {a,u,counts,step,battle};
  }
  const base=skeleton.animations.death_0;
  const authored={...base,events:[{time:2/25,name:'death_logic'},{time:3/25,name:'death_fall'}]};
  const custom=setup(authored);
  custom.step(.08); assert.equal(custom.a.frame,2); assert.equal(custom.u.dead,false);
  custom.step(.04); assert.equal(custom.a.frame,3); assert.equal(custom.u.dead,true);
  assert.equal(!!custom.u.__bodyFall,false);
  custom.step(.04); assert.equal(custom.u.__bodyFall,true);
  assert.deepEqual(custom.counts,{drops:1,endChecks:1}); // No hidden frame-5/7 checks.
  const fine=setup(base),coarse=setup(base);
  for(let i=0;i<80;i++)fine.step(.01);
  coarse.step(.8); coarse.step(1);
  for(const state of [fine,coarse]) {
    assert.equal(state.a.frame,15);assert.equal(state.a.done,true);
    assert.equal(state.u.dead,true);assert.equal(state.u.__bodyFall,true);
    assert.deepEqual(state.counts,{drops:1,endChecks:1});
    Battle.prototype.updateDeathEvents.call(state.battle,state.u,state.a);
    assert.deepEqual(state.counts,{drops:1,endChecks:1});
  }
  const interrupted=setup(base);
  advanceDoll(interrupted.a,.2,doll); // An emitted but unconsumed death cue.
  assert.equal(interrupted.a.pendingEvents[0].name,'death_logic');
  startPhase(interrupted.a,3,0,0,1,skeleton.animations.hit_0);
  interrupted.step(.04);assert.equal(interrupted.counts.drops,0);
  startDollAction(interrupted.a,skeleton.animations.shoot_0,0,0,1);
  advanceDoll(interrupted.a,.12,doll);
  startPhase(interrupted.a,4,0,0,1,base);
  assert.equal(interrupted.a.playback.events.length,0);
  interrupted.step(.2);assert.equal(interrupted.counts.drops,1);
  for(const invalid of [-1,0,NaN,Infinity,base.duration+1])
    assert.throws(()=>createAnimationPlayback({...base,playbackDuration:invalid}),/playback duration/);
});
check("original reload: ammunition/AP only, no invented doll phase", () => {
  const a = newDollAnim(), u = { side: 0, AP: 10, __doll: a };
  const before = JSON.stringify(a);
  let loaded = 0;
  const battle = { phase: "player", canReload: () => true, reloadAPOf: () => 3,
    loadMagazine() { loaded++; return true; }, gbeSpend() {}, refreshInfo() {}, checkEnd() {} };
  assert.equal(Battle.prototype.doReload.call(battle, u, true), true);
  assert.equal(u.AP, 7);
  assert.equal(loaded, 1);
  assert.equal(JSON.stringify(a), before);
});
check("generated actions: source HitFrames, release and no invented effects", () => {
  const source = readFileSync("../decompiled/all/scripts/IsoEngine/AnimationData.as", "utf8");
  const match = source.match(/HitFrames[^=]*=\s*\[([^\]]+)\]/);
  assert.ok(match, "source HitFrames array");
  const hitFrames = match[1].split(",").map(Number);
  for (let type = 0; type < 8; type++) {
    const clip = skeleton.animations["shoot_" + type];
    assert.deepEqual(legacyClipProjection(clip), createLegacyBattleClip(doll, type, 2));
    const release = clip.events.filter(e => e.name === "fire" || e.name === "throw_release");
    assert.deepEqual(release, [{ time: (hitFrames[type] - 1) / 25, name: type === 7 ? "throw_release" : "fire" }]);
  }
  const originalField = readFileSync("../decompiled/all/scripts/IsoEngine/BattleField.as", "utf8");
  assert.match(originalField, /currFrame % 4 == 2/);
  for (let type = 0; type < 8; type++) {
    assert.deepEqual(skeleton.animations["walk_" + type].events,
      [{time: 1 / 25, name: "footstep"}, {time: 5 / 25, name: "footstep"}]);
  }
  for (const [name, clip] of Object.entries(skeleton.animations)) {
    assert.ok(!name.startsWith("reload"), name);
    assert.ok(!clip.events.some(e => ["sample_later", "reload_mag_out", "reload_mag_in", "hit_recoil"].includes(e.name)), name);
  }
});
check("production action player: all frames, 3 cycles, cue equals visible release frame", () => {
  for (let type = 0; type < 8; type++) {
    const clip = skeleton.animations["shoot_" + type], a = newDollAnim();
    const length = doll.fullAnimationTypeFrames[type][2].length;
    const action = startDollAction(a, clip, type, 0, 1, 3);
    let fired = 0;
    assert.deepEqual(action.events, []); // Frame 1 belongs to the next simulation tick.
    advanceDoll(a, 0, doll);
    assert.deepEqual(action.events, []);
    for (let tick = 0; tick < length * 3; tick++) {
      advanceDoll(a, .04, doll);
      assert.equal(a.phase, 2, `type ${type} tick ${tick}`);
      assert.equal(a.frame, tick % length + 1, `type ${type} tick ${tick}`);
      assert.equal(action.cycle, Math.floor(tick / length));
      for (const cue of action.events.splice(0)) {
        assert.equal(cue.frame, a.frame);
        if (["fire", "throw_release"].includes(cue.event.name)) fired++;
      }
    }
    assert.equal(fired, 3);
    advanceDoll(a, .04, doll);
    assert.equal(a.phase, 0); assert.equal(a.done, true);
    assert.deepEqual(action.events, []);
  }
});
check("bounded custom loops: no duplicate first-frame cue or invalid FPS", () => {
  const clip = {name: "custom", fps: 25, duration: .12, loop: true, tracks: [],
    events: [{time: 0, name: "fire"}, {time: .08, name: "last_frame"}]};
  const p = createAnimationPlayback(clip, 3);
  assert.equal(clip.loop, true); // Do not mutate shared/mod assets.
  for (const dt of [0, -1, NaN, Infinity]) advanceAnimationPlayback(p, dt);
  assert.equal(p.elapsed, 0); assert.deepEqual(p.events, []);
  for (let i = 0; i < 10; i++) advanceAnimationPlayback(p, .04);
  assert.deepEqual(p.events.map(c => [c.cycle, c.event.name]),
    [[0,"fire"],[0,"last_frame"],[1,"fire"],[1,"last_frame"],[2,"fire"],[2,"last_frame"]]);
  assert.equal(p.done, true);
  assert.throws(() => createAnimationPlayback({...clip, fps: Infinity}));
});
check("action catch-up and interruption: no lost cues or late ghost shot", () => {
  const clip = skeleton.animations.shoot_0;
  const a = newDollAnim();
  const action = startDollAction(a, clip, 0, 0, 1, 3);
  advanceDoll(a, clip.duration * 3 + .04, doll);
  assert.equal(action.done, true);
  assert.deepEqual(action.events.filter(e => e.event.name === "fire").map(e => e.cycle), [0, 1, 2]);
  const unit = { __doll: a, _HP: 100, dead: false, dying: false };
  let hits = 0;
  const battle = { opts: {}, ds: { battleDoll: doll, battleSkeleton: skeleton }, animationActions: new Map(), refreshInfo() {} };
  Battle.prototype.playDollAction.call(battle, unit, 0, 1, 1, () => hits++);
  advanceDoll(a, .16, doll);
  startPhase(a, 3, 0, 0, 1);
  Battle.prototype.updateAnimationAction.call(battle, unit, a);
  advanceDoll(a, 1, doll);
  Battle.prototype.updateAnimationAction.call(battle, unit, a);
  assert.equal(hits, 0); assert.equal(battle.animationActions.size, 0);
});
check("production Battle cue consumption: once only, independent of redraws", () => {
  const unit = { _HP: 100, dead: false, dying: false, weaponSub: 0 };
  const battle = { opts: {}, ds: { battleDoll: doll, battleSkeleton: skeleton }, animationActions: new Map(), refreshInfo() {} };
  const hits = [];
  Battle.prototype.playDollAction.call(battle, unit, 3, 1, 3, event => { if (event.name === "fire") hits.push(unit.__doll.frame); });
  const a = unit.__doll;
  Battle.prototype.updateAnimationAction.call(battle, unit, a);
  assert.deepEqual(hits, []);
  for (let tick = 0; tick < 10; tick++) {
    advanceDoll(a, .04, doll);
    for (let render = 0; render < 20; render++) sampleSkeletonPose(skeleton.definition, skeleton.animations.shoot_3, (a.frame - 1) / 25);
    Battle.prototype.updateAnimationAction.call(battle, unit, a);
    Battle.prototype.updateAnimationAction.call(battle, unit, a);
  }
  assert.deepEqual(hits, [1, 1, 1]);
  assert.equal(battle.animationActions.size, 0);
  assert.equal(a.playback, undefined);
});
check("production grenade: consumption/experience/projectile only on release frame 6", () => {
  const u = { _HP: 100, dead: false, dying: false, AP: 20, weaponSub: 1, weaponItem: 1,
    grenadeAmounts: [2], skillExperience: {}, baseAccuracy: 10, x: 16, y: 16 };
  const battle = Object.assign(Object.create(Battle.prototype), {
    opts: {}, ds: { battleDoll: doll, battleSkeleton: skeleton }, animationActions: new Map(), fx: [], order: [u], turnIdx: 0,
    phase: "player", paused: false, gameOver: false, isBusy: () => false, inBounds: () => true,
    weaponCategory: () => 5, weaponDefOf: () => ({ delay: 3 }), activeSlot: () => 0,
    modeOf: () => ({}), modeAPOf: () => 4, maxThrowDistance: () => 999, gbeSpend() {}, refreshInfo() {}, checkEnd() {}
  });
  assert.equal(battle.throwGrenade(u, 2, 2), true);
  assert.equal(u.AP, 16);
  assert.equal(u.grenadeAmounts[0], 2); assert.equal(battle.fx.length, 0);
  for (let tick = 1; tick <= 12; tick++) {
    advanceDoll(u.__doll, .04, doll);
    battle.updateAnimationAction(u, u.__doll);
    assert.equal(u.grenadeAmounts[0], tick < 6 ? 2 : 1);
    assert.equal(battle.fx.length, tick < 6 ? 0 : 1);
    assert.equal(u.skillExperience.throwExperience ?? 0, tick < 6 ? 0 : 100);
  }
  assert.equal(battle.animationActions.size, 0);
});

check("compact atlases: every source crop retains exact RGBA bytes", () => {
  const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8'));
  for(const [source,atlas] of Object.entries(skeleton.definition.packedParts)) {
    const [,part,type]=source.match(/^(.+?)([0-9]+)\.png$/);
    const original = PNG.sync.read(readFileSync('public/' + atlas.sourceUrl));
    const packed = PNG.sync.read(readFileSync('public/mods/revival/' + JSON.parse(readFileSync('public/mods/revival/manifest.json', 'utf8')).assets[atlas.image]));
    assert.equal(packed.width, atlas.width); assert.equal(packed.height, atlas.height);
    const boundaries=doll.spriteBoundaries[part][type];
    const expectedKeys=Object.entries(boundaries).flatMap(([dir,frames])=>Object.keys(frames).map(frame=>dir+'/'+frame));
    assert.deepEqual(Object.keys(atlas.frames).sort(),expectedKeys.sort());
    for (const [key, rect] of Object.entries(atlas.frames)) {
      const [dir, frame] = key.split('/').map(Number);
      const b = boundaries[dir][frame],cell=doll.spriteDimensions[part][type];
      assert.equal(packedPartFrame(atlas, dir, frame, cell, b), rect);
      const sx=(dir+(frame>80?4:0))*cell.width+b.x, sy=(frame>80?frame-81:frame-1)*cell.height+b.y;
      for(let y=0;y<b.height;y++) for(let x=0;x<b.width;x++) for(let ch=0;ch<4;ch++) {
        const expected=sx+x<0||sx+x>=original.width||sy+y<0||sy+y>=original.height?0:original.data[((sy+y)*original.width+sx+x)*4+ch];
        assert.equal(packed.data[((rect.y+y)*packed.width+rect.x+x)*4+ch], expected, source+'/'+key);
      }
    }
  }
});
check("compact atlas: mod overrides, changed boundaries and invalid regions fall back", () => {
  const atlas=skeleton.definition.packedParts['Shadows1.png'];
  assert.equal(packedPartAtlas({getImageSource:()=>atlas.sourceUrl},skeleton.definition,'Shadows1.png'),atlas);
  assert.equal(packedPartAtlas({getImageSource:()=> 'mods/changed.png'},skeleton.definition,'Shadows1.png'),undefined);
  assert.equal(packedPartAtlas({},skeleton.definition,'Shadows1.png'),undefined);
  const b=atlas.frames['0/1'].original;
  assert.equal(packedPartFrame(atlas,0,1,{width:101,height:100},b),undefined);
  assert.equal(packedPartFrame(atlas,0,1,atlas.cell,{...b,x:b.x+1}),undefined);
  assert.equal(packedPartFrame({...atlas,frames:{'0/1':{...atlas.frames['0/1'],x:-1}}},0,1,atlas.cell,b),undefined);
});
// Deferred image loading must not decode the original atlas in parallel.
try {
  const atlas=skeleton.definition.packedParts['Shadows1.png'];
  const compact={src:'packed-test',complete:true,naturalWidth:atlas.width,naturalHeight:atlas.height};
  const original={src:'original-test',complete:true,naturalWidth:800,naturalHeight:8000};
  for(const result of [compact,null,{...compact,naturalWidth:1},'reject']) {
    const requests=[];let resolve,reject;
    const pending=new Promise((a,b)=>{resolve=a;reject=b;});
    const assets={ getImageSource:name=>name==='Shadows1.png'?atlas.sourceUrl:atlas.image,
      getImage:name=>{requests.push('get:'+name);return null;},
      ensure:name=>{requests.push('ensure:'+name);return name===atlas.image?pending:Promise.resolve(original);} };
    assert.equal(battlePackedImage(assets,atlas),null);
    const savedDocument=globalThis.document;
    try {
      globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},save(){},restore(){},transform(){},drawImage(){}})})};
      const opts={assets,data:doll,appearance:{gender:1},dir:0,renderLayer:'shadow',skeleton:{definition:skeleton.definition,animation:skeleton.animations.idle_0,time:0}};
      assert.equal(renderDollFrame(opts),null,'pending compact image must not cache or display a partial pose');
    } finally {globalThis.document=savedDocument;clearRenderCache();}
    const preload=ensureBattlePart(assets,skeleton.definition,'Shadows1.png');
    assert.equal(battlePackedImage(assets,atlas),null);
    assert(!requests.some(r=>r.endsWith(':Shadows1.png')));
    if(result==='reject')reject(new Error('missing'));else resolve(result);
    assert.equal(await preload,result===compact?compact:original);
    assert.equal(battlePackedImage(assets,atlas),result===compact?compact:undefined);
    await ensureBattlePart(assets,skeleton.definition,'Shadows1.png');
    assert.equal(requests.filter(r=>r==='ensure:'+atlas.image).length,1,'failed packed loads must not retry every frame');
  }
  console.log('compact atlas loading: pending, success, missing, invalid size, rejection and memoized fallback: ok');
} catch(error) {failures++;console.error(error);}

check("transport: AS3 draw-before-increment frames, towing and once-only fall cues", () => {
  // Independent transcription of BattleField.as EF; do not derive expected
  // frames from the new clips or player. Hit settlement follows EF drawing.
  for (const towing of [false, true]) for (const death of [false, true]) {
    for (const mode of ["generated", "fallback", "legacyParts"]) {
      const rig = mode === "generated" ? skeleton.transport : createOriginalTransportRig();
      if (mode === "legacyParts") for (const clip of Object.values(rig.animations)) delete clip.slotTracks;
      const a = newTransportAnimation(towing);
      startTransportAnimation(a, death, rig);
      const initial = towing ? 30 : 1;
      assert.deepEqual(transportPoseFrames(a, rig), { body: initial, shadow: initial });
      for (const dt of [0, -1, NaN, Infinity]) assert.equal(advanceTransportAnimation(a, dt), 0);
      assert.equal(a.frame, initial);
      let original = (death ? 10 : 2) + (towing ? 29 : 0), totalSounds = 0;
      for (let tick = 1; tick <= 40; tick++) {
        const shown = original;
        if (original > 1 && original < 9 || original > 9 && original < 29 ||
            original > 30 && original < 38 || original > 38 && original < 58) original++;
        if (original === 9) original = 1;
        if (original === 38) original = 30;
        const expectedSound = Number(original === 22 || original === 52);
        const sound = advanceTransportAnimation(a, .04);
        assert.equal(a.frame, shown, mode + " frame tick=" + tick);
        assert.deepEqual(transportPoseFrames(a, rig), { body: shown, shadow: shown });
        assert.equal(sound, expectedSound, "fall cue tick=" + tick);
        totalSounds += sound;
        const frozen = JSON.stringify(a);
        for (let i = 0; i < 20; i++) transportPoseFrames(a, rig);
        assert.equal(JSON.stringify(a), frozen, "render must not advance or drain events");
      }
      assert.equal(totalSounds, Number(death));
      assert.equal(a.done, true);
      assert.equal(a.phase, death ? "death" : "idle");
    }
  }
});
check("transport: split/catch-up dt, interruption, asset parity and terminal hold", () => {
  assert.deepEqual(skeleton.transport, createOriginalTransportRig());
  const terminal = createAnimationPlayback({ name: "terminal", fps: 25, duration: .12,
    finishOnLastFrame: true, tracks: [], events: [{time:.08,name:"last"},{time:.1,name:"afterEnd"}] });
  advanceAnimationPlayback(terminal, 10);
  assert.equal(terminal.frame, 3); assert.equal(terminal.done, true);
  assert.deepEqual(terminal.events.map(c=>c.event.name), ["last"]);
  for (const towing of [false, true]) {
    const a = newTransportAnimation(towing), b = newTransportAnimation(towing);
    startTransportAnimation(a, true); startTransportAnimation(b, true);
    let count = 0;
    for (let i = 0; i < 80; i++) count += advanceTransportAnimation(a, .01);
    assert.equal(count, 1);
    assert.equal(advanceTransportAnimation(b, .8), 1);
    assert.equal(a.frame, towing ? 58 : 29); assert.equal(b.frame, a.frame);
    assert.equal(a.done, true); assert.equal(b.done, true);
    const corpse = JSON.stringify(a);
    startTransportAnimation(a, false); startTransportAnimation(a, true);
    assert.equal(advanceTransportAnimation(a, 10), 0);
    assert.equal(JSON.stringify(a), corpse);
    const hit = newTransportAnimation(towing);
    startTransportAnimation(hit, false); advanceTransportAnimation(hit, .08);
    startTransportAnimation(hit, true);
    assert.equal(advanceTransportAnimation(hit, .04), 0);
    assert.equal(hit.frame, towing ? 39 : 10);
    assert.equal(advanceTransportAnimation(hit, 10), 1);
  }
  // Every original type/direction/body/shadow has the referenced crop; static
  // carts/vehicles keep frame 1, not an invented hit/death sequence.
  const transports = JSON.parse(readFileSync("public/data/transports.json", "utf8"));
  for (const [type, info] of Object.entries(transports.Types)) {
    if (!info || !Number(type)) continue;
    const frames = info.category === 1 ? Array.from({ length: info.canDragCarts ? 58 : 29 }, (_, i) => i + 1) : [1];
    for (const part of ["Transport", "TransportShadow"]) for (let dir = 0; dir < 4; dir++) for (const frame of frames) {
      assert(doll.spriteBoundaries[part]?.[type]?.[dir]?.[frame], "missing original crop " + [part,type,dir,frame].join("/"));
    }
  }
});


check("FX timelines: original first/last frame, split ticks, catch-up and crop registration", () => {
  for (const [kind, count, width, height, x, y] of [['ShotSmoke',12,20,20,-10,-40],['Explosion',24,300,250,-150,-200],['BodyBurn',40,100,100,0,-40]]) {
    const p = createEffectPlayback(kind), split = createEffectPlayback(kind), catchup = createEffectPlayback(kind);
    assert.equal(effectFrame(p), 0);
    for (let tick = 1; tick <= count * 2 + 1; tick++) {
      advanceAnimationPlayback(p, .04);
      for (let j = 0; j < 4; j++) advanceAnimationPlayback(split, .01);
      const frame = kind === 'BodyBurn' ? (tick-1)%count+1 : tick <= count ? tick : 0;
      assert.equal(effectFrame(p), frame, kind + ' tick ' + tick);
      assert.equal(effectFrame(split), frame);
      if (frame) {
        const crop = doll.spriteBoundaries[kind][0][0][frame];
        assert(crop && crop.x+crop.width <= width && crop.y+crop.height <= height);
        assert.deepEqual(effectSpritePlacement(kind, frame, crop), {
          srcRect: {x:crop.x, y:(frame-1)*height+crop.y, w:crop.width, h:crop.height},
          x:kind==='BodyBurn'?-Math.round(crop.width/2):x+crop.x,
          y:kind==='BodyBurn'?y-Math.round(crop.height/2):y+crop.y,
        });
      }
    }
    advanceAnimationPlayback(catchup, (count * 2 + 1) / 25);
    assert.equal(effectFrame(catchup), effectFrame(p));
    assert.equal(effectSpritePlacement(kind,0), null);
    assert.equal(effectSpritePlacement(kind,count+1), null);
  }
});
check("production FX: explosion spawned once after fuse, frame 24 retained, render has no simulation side effects", () => {
  const image = {width:300,height:6000,naturalWidth:300,naturalHeight:6000};
  const battle = Object.assign(Object.create(Battle.prototype), {
    fx: [{kind:'delayedExplosion',x:16,y:16,r:10,t:0,dur:.04}], effectSprites:new WeakMap(),
    camX:0,camY:0,ds:{battleDoll:doll}, assets:{getImage:name=>name==='Explosion.png'?image:null},
    fieldView:{fxLayer:new Sprite(),projectileShadowLayer:new Sprite()}, flames:{particles:[]},
  });
  let explosions=0;
  battle.createExplosion=(x,y)=>{explosions++;battle.spawnExplosionFx(x,y,10);};
  battle.updateFx(.04);
  assert.equal(explosions,1); assert.equal(battle.fx.length,1);
  assert.equal(effectFrame(battle.fx[0].playback),1);
  const before=JSON.stringify(battle.fx);battle.renderFx();
  const bitmap=battle.fieldView.fxLayer.children[0];assert(bitmap instanceof BitmapObject);
  for(let j=0;j<20;j++)battle.renderFx(10);
  assert.equal(JSON.stringify(battle.fx),before);assert.equal(explosions,1);
  assert.equal(battle.fieldView.fxLayer.children[0],bitmap,'reuse bitmap, not allocate per redraw');
  for(let tick=2;tick<=24;tick++){battle.updateFx(.04);assert.equal(effectFrame(battle.fx[0].playback),tick);}
  assert.equal(battle.fx.length,1);battle.updateFx(.04);assert.equal(battle.fx.length,0);assert.equal(explosions,1);
  battle.renderFx();assert.equal(battle.fieldView.fxLayer.children.length,0);
});
check("production attached FX: independent fire, visibility pause, extinguish/resume, death and wall retrigger", () => {
  const one={burning:1},two={burning:0},animal={isTransport:true,burning:1},dying={burning:1,dying:true};
  let visible=true;
  const owner={},battle=Object.assign(Object.create(Battle.prototype),{units:[one,two,animal,dying],wallHitAnimations:new Map(),fieldView:{isEffectOwnerVisible:()=>visible}});
  const hit=()=>battle.wallHitAnimations.set(owner,{x:0,y:0,outer:true,playback:createEffectPlayback('ShotSmoke')});
  hit();battle.updateAttachedEffects(.04);assert.equal(effectFrame(one.burnPlayback),1);
  assert.equal(animal.burnPlayback,undefined);assert.equal(dying.burnPlayback,undefined);
  two.burning=1;battle.updateAttachedEffects(.04);assert.equal(effectFrame(one.burnPlayback),2);assert.equal(effectFrame(two.burnPlayback),1);
  visible=false;battle.updateAttachedEffects(.4);assert.equal(effectFrame(one.burnPlayback),2);assert.equal(effectFrame(battle.wallHitAnimations.get(owner).playback),2);
  visible=true;one.burning=0;battle.updateAttachedEffects(.04);assert.equal(effectFrame(one.burnPlayback),2);
  one.burning=1;hit();battle.updateAttachedEffects(.04);assert.equal(effectFrame(one.burnPlayback),3);assert.equal(effectFrame(battle.wallHitAnimations.get(owner).playback),1);
  one.dying=true;battle.updateAttachedEffects(.04);assert.equal(effectFrame(one.burnPlayback),3);
  for(let j=0;j<10;j++)battle.updateAttachedEffects(.04);
  assert.equal(battle.wallHitAnimations.size,1);battle.updateAttachedEffects(.04);assert.equal(battle.wallHitAnimations.size,0);
});


check("flame shared playback: AS3 physical frames, fuel cadence, collisions and chunk-independent heat", () => {
  // Independent numeric EF oracle: emit, advance, move/trace, touch, accelerate, endTick.
  function reference(fuel, burst, blocked) {
    let counter=Math.max(2,burst)-1, source=true, particles=[], log=[];
    for(let tick=1;source||particles.length;tick++) {
      if(source) { counter--; if(counter%2===0) { log.push(['emit',fuel]); if(fuel>0) {fuel--;particles.push({frame:0,x:0,y:0,speed:2});} if(fuel<=0)counter=0; } if(counter<=0)source=false; }
      for(let i=particles.length-1;i>=0;i--) {
        const p=particles[i];p.frame++;if(p.frame>47){particles.splice(i,1);continue;}
        const next=p.y+p.speed;
        if(p.speed>0)log.push(['trace',p.y,next]);
        if(blocked&&next>=12){p.y=12;p.speed=0;}else p.y=next;
        log.push(['touch',p.frame,p.y,p.speed]);p.speed*=p.frame<20?1.1:.9;
      }
      log.push(['end',particles.length]);
    }
    return log;
  }
  for(const fuel of [0,1,4,20]) for(const burst of [2,7,30]) for(const blocked of [false,true]) {
    const expected=reference(fuel,burst,blocked);
    for(const steps of [[.04],[.01,.01,.02],[.36,.02,.06]]) {
      const flames=new BattleFlames(),source={x:0,y:0};let left=fuel,log=[];
      const hooks={emit:()=>{log.push(['emit',left]);return left>0?--left:-1;},trace:(from,to)=>{log.push(['trace',from.y,to.y]);return blocked&&to.y>=12?{x:0,y:12}:null;},touch:p=>log.push(['touch',p.frame,p.y,p.speed]),endTick:()=>log.push(['end',flames.particles.length])};
      assert(flames.start(source,0,burst));assert.equal(flames.start(source,0,burst),false);
      for(const dt of [NaN,Infinity,-1,0])flames.update(dt,hooks);
      assert.equal(log.length,0);
      let guard=0;while(flames.busy&&guard<1000){flames.update(steps[guard%steps.length],hooks);guard++;}
      assert(guard<1000);assert.deepEqual(log,expected,'fuel '+fuel+' burst '+burst+' blocked '+blocked+' steps '+steps);
      const done=JSON.stringify(log);flames.update(1,hooks);assert.equal(JSON.stringify(log),done);
      assert(flames.start(source,0,2),'can restart after the final physical frame');
    }
  }
});
check("flame production drawing: 45 original crops, invisible physical tail, no redraw simulation or allocation", () => {
  const image={width:100,height:4500,naturalWidth:100,naturalHeight:4500};
  const flames=new BattleFlames();flames.start({x:0,y:0},0,2);
  const battle=Object.assign(Object.create(Battle.prototype),{fx:[],effectSprites:new WeakMap(),camX:0,camY:0,ds:{battleDoll:doll},assets:{getImage:()=>image},fieldView:{fxLayer:new Sprite(),projectileShadowLayer:new Sprite()},flames});
  let touches=0;const hooks={emit:()=>0,trace:()=>null,touch:()=>touches++,endTick:()=>{}};
  let bitmap;
  for(let frame=1;frame<=48;frame++) {
    flames.update(.04,hooks);battle.renderFx();
    if(frame<=45) {
      assert.equal(flames.particles[0].frame,frame);
      const sprite=battle.fieldView.fxLayer.children[0],crop=doll.spriteBoundaries.FlamethrowerFlame[0][0][frame];
      if(!bitmap)bitmap=sprite;assert.equal(sprite,bitmap);
      assert.deepEqual(sprite.srcRect,{x:crop.x,y:(frame-1)*100+crop.y,w:crop.width,h:crop.height});
      assert.deepEqual(effectSpritePlacement('FlamethrowerFlame',frame,crop),{srcRect:sprite.srcRect,x:-50+crop.x,y:-90+crop.y});
      const before=JSON.stringify(flames.particles);
      for(let redraw=0;redraw<20;redraw++)battle.renderFx(10);
      assert.equal(JSON.stringify(flames.particles),before);assert.equal(battle.fieldView.fxLayer.children[0],bitmap);
    } else {
      assert.equal(battle.fieldView.fxLayer.children.length,0);
      assert.equal(flames.particles.length,frame<48?1:0);
      if(frame<48)assert.equal(flames.particles[0].frame,frame);
    }
    assert.equal(touches,Math.min(frame,47));
  }
  assert.equal(flames.busy,false);
});


check("grenade shared playback: source frame 1, flight 2..16 wrap, physical support freezes pose", () => {
  const image={width:10,height:160,naturalWidth:10,naturalHeight:160};
  const make=(extra={})=>({kind:'grenade',x:0,y:0,z:10000,vx:0,vy:0,vz:0,counter:200,over:[],explodeOnImpact:false,source:{},t:0,dur:Infinity,acc:0,frame:1,playback:createGrenadePlayback(),...extra});
  const setup=g=>Object.assign(Object.create(Battle.prototype),{fx:[g],effectSprites:new WeakMap(),camX:0,camY:0,ds:{battleDoll:doll},assets:{getImage:()=>image},fieldView:{fxLayer:new Sprite(),projectileShadowLayer:new Sprite()},flames:{particles:[]},collisionContours:()=>[]});
  const g=make(),battle=setup(g);battle.renderFx();const bitmap=battle.fieldView.fxLayer.children[0];
  assert.equal(g.frame,1);assert.equal(effectFrame(g.playback),1);
  for(let tick=0;tick<40;tick++) {
    if(tick)battle.updateFx(.04);
    assert.equal(g.frame,tick%16+1);
    battle.renderFx();const crop=doll.spriteBoundaries.Grenade[0][0][g.frame];
    assert.equal(battle.fieldView.fxLayer.children[0],bitmap);
    assert.deepEqual(bitmap.srcRect,{x:crop.x,y:(g.frame-1)*10+crop.y,w:crop.width,h:crop.height});
    assert.equal(battle.fieldView.projectileShadowLayer.children.length,0,'original grenade has no shadow');
    const before=JSON.stringify(g);for(let j=0;j<20;j++)battle.renderFx(10);assert.equal(JSON.stringify(g),before);
  }
  // Independent support cases: ground and raised top both freeze, side collision does not.
  const roof={owner:{},height:2,points:[{x:-100,y:-100},{x:100,y:-100},{x:100,y:100},{x:-100,y:100}]};
  for(const initial of [{z:1,vz:-1,over:[]},{z:64,vz:-1,over:[roof]}]) {
    const supported=make({...initial,frame:7,playback:createGrenadePlayback(7),vx:1}),b=setup(supported);
    for(let tick=0;tick<4;tick++){b.updateFx(.04);assert.equal(supported.frame,7);assert.equal(effectFrame(supported.playback),7);}
    assert.equal(supported.counter,196,'support does not freeze the fuse');
    supported.over=[];supported.z=100;supported.vz=1;b.updateFx(.04);assert.equal(supported.frame,8,'resume the held phase after leaving support');
  }
  const bounced=make({z:10,vx:10}),b=setup(bounced);
  b.collisionContours=()=>[{owner:{},height:2,points:[{x:5,y:-10},{x:6,y:-10},{x:6,y:10},{x:5,y:10}]}];
  b.updateFx(.04);assert(bounced.vx<0);assert.equal(bounced.frame,2,'wall bounce still rotates');
  // Fractional updates produce identical flight pose and physics; obsolete zero-frame fixture normalizes to one.
  const split=make(),whole=make(),bs=setup(split),bw=setup(whole);
  for(let i=0;i<32;i++)bs.updateFx(.01);for(let i=0;i<8;i++)bw.updateFx(.04);assert.equal(split.frame,whole.frame);assert.equal(split.z,whole.z);assert.equal(split.counter,whole.counter);
  const old=make({frame:0,playback:undefined}),bo=setup(old);bo.updateFx(.04);assert.equal(old.frame,2);
});
check("grenade lifetime: supported fuse and impact explode once without further pose updates", () => {
  for(const impact of [false,true]) {
    const g={kind:'grenade',x:0,y:0,z:1,vx:0,vy:0,vz:-1,counter:impact?100:3,over:[],explodeOnImpact:impact,source:{},t:0,dur:Infinity,acc:0,frame:9,playback:createGrenadePlayback(9)};
    let explosions=0;
    const b=Object.assign(Object.create(Battle.prototype),{fx:[g],collisionContours:()=>[],createExplosion:()=>explosions++});
    for(let j=0;j<5;j++)b.updateFx(.04);
    assert.equal(explosions,1);assert.equal(b.fx.length,0);assert.equal(g.frame,9);
  }
});


check("projectile visuals: sixteen rocket directions, centered bolts, reuse, camera and missing images", () => {
  const image={width:15,height:240,naturalWidth:15,naturalHeight:240};
  const make=type=>({kind:'projectile',t:0,dur:10,x:100,y:200,z:40,angle:0,ammo:{type}});
  for(const type of [4,6,13]) {
    const f=make(type),b=Object.assign(Object.create(Battle.prototype),{fx:[f],projectileVisuals:new WeakMap(),camX:0,camY:0,assets:{getImage:()=>image},fieldView:{fxLayer:new Sprite(),projectileShadowLayer:new Sprite()},flames:{particles:[]}});
    b.renderFx();const v=b.projectileVisuals.get(f),body=v.body,shadow=v.shadow,bitmap=v.rocket,shadowBitmap=v.rocketShadow;
    for(let row=0;row<16;row++) {
      f.angle=Math.PI-row*Math.PI/8;b.renderFx();
      assert.equal(v.body,body);assert.equal(v.shadow,shadow);
      assert.equal(body.y,shadow.y-f.z);assert.equal(body.x,shadow.x);
      if(type!==4) {
        assert.equal(v.rocket,bitmap);assert.equal(v.rocketShadow,shadowBitmap);
        assert.deepEqual(bitmap.srcRect,{x:0,y:row*15,w:15,h:15});assert.deepEqual(shadowBitmap.srcRect,bitmap.srcRect);
        assert.equal(bitmap.x,-7.5);assert.equal(bitmap.y,-7.5);
      } else {
        const ops=body.graphics.ops,sops=shadow.graphics.ops;
        assert.equal(ops.length,2);assert.equal(ops[0].x,-ops[1].x);assert.equal(ops[0].y,-ops[1].y);
        assert.equal(ops[1].line.a,1);assert.equal(sops[1].line.a,.5);
        const dx=10*(Math.sin(f.angle)-Math.cos(f.angle))*Math.sin(Math.PI/4);
        const dy=10*(Math.sin(f.angle)+Math.cos(f.angle))*Math.cos(Math.PI/4)*.574;
        assert(Math.abs(ops[1].x-dx/2)<1e-9);assert(Math.abs(ops[1].y-dy/2)<1e-9);
      }
      const before=JSON.stringify(f),geometry=body.graphics,ops=geometry.ops,rect=bitmap?.srcRect;
      for(let i=0;i<20;i++)b.renderFx(100);
      assert.equal(JSON.stringify(f),before);assert.equal(body.graphics,geometry);assert.equal(body.graphics.ops,ops);assert.equal(bitmap?.srcRect,rect);
      assert.equal(b.fieldView.fxLayer.children.length,1);assert.equal(b.fieldView.projectileShadowLayer.children.length,1);
    }
    const x=body.x;b.camX=80;b.renderFx();assert.notEqual(body.x,x);assert.equal(body, b.fieldView.fxLayer.children[0]);
    if(type!==4) {
      b.assets.getImage=()=>null;b.renderFx();assert.equal(bitmap.visible,false);assert.equal(shadowBitmap.visible,false);
      const replacement={...image};b.assets.getImage=()=>replacement;b.renderFx();assert.equal(v.rocket,bitmap);assert.equal(bitmap.image,replacement);assert.equal(bitmap.visible,true);
    }
    b.fx=[];b.renderFx();assert.equal(b.fieldView.fxLayer.children.length,0);assert.equal(b.fieldView.projectileShadowLayer.children.length,0);
  }
});


check("blood simulation: original random stream, byte alpha, nine ticks, split time and stable retirement", () => {
  const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const damage of [0,.1,1,20,300]) for(const parts of [1,4,8]) {
    const owner={x:20,y:40,bleeding:0,dead:false},land=[],reference=[],expectedLand=[],random=rng(521),source=rng(521);
    const blood=new BattleBlood((x,y)=>land.push([x,y]),random);blood.hit(20,40,damage,0,20,owner);
    for(let i=0;i<Math.min(Math.round(damage*4),1000);i++) {
      const spread=source()**2*.8,angle=Math.atan2(20,20)+(source()<.5?-spread:spread),speed=source()**2*(.8-spread)*8;
      reference.push({x:20,y:40,z:40,vx:Math.sin(angle)*speed,vy:Math.cos(angle)*speed,vz:0,alpha:Math.round((.2+source()*.2)*255)/255,owner});
    }
    assert.deepEqual(blood.drops,reference);
    const array=blood.drops;
    for(let tick=1;tick<=10;tick++) {
      for(let j=0;j<parts;j++)blood.update(.04/parts,[]);
      for(let j=reference.length-1;j>=0;j--) {
        const d=reference[j];d.x+=d.vx;d.y+=d.vy;d.vz++;d.z-=d.vz;
        if(d.z<=0){expectedLand.push([d.x,d.y]);reference.splice(j,1);}
      }
      assert.equal(blood.drops,array);assert.deepEqual(blood.drops,reference);assert.deepEqual(land,expectedLand);
      if(tick===8&&damage>=1)assert(blood.drops.every(d=>d.z===4));
      if(tick===9)assert.equal(blood.drops.length,0);
    }
  }
  const blood=new BattleBlood(()=>{},()=>0),body={x:10,y:20,bleeding:10,dead:false,__doll:{walk:true,dispX:30,dispY:40}};
  blood.update(.04,[body]);assert.equal(blood.drops.length,1);assert.equal(blood.drops[0].owner,body);assert.equal(blood.drops[0].x,30);assert.equal(blood.drops[0].y,40);assert.equal(blood.drops[0].z,39);
  blood.clear();blood.update(.04,[{...body,dead:true},{...body,bleeding:.5},{...body,isTransport:true,transportKind:'vehicle'}]);assert.equal(blood.drops.length,0);
  blood.update(.02,[]);for(const dt of [NaN,Infinity,-1,0])blood.update(dt,[body]);blood.update(.02,[body]);assert.equal(blood.drops.length,1);
  blood.clear();blood.drops.push(...[1,20,2,30,3].map((z,i)=>({x:i,y:0,z,vx:0,vy:0,vz:1,alpha:.2})));
  const survivors=[blood.drops[1],blood.drops[3],blood.drops[4]];blood.update(.04,[]);assert.deepEqual(blood.drops,survivors);
  blood.update(.02,[]);blood.clear();blood.hit(0,0,1,0,0);blood.update(.02,[]);assert.equal(blood.drops[0].z,40,'clear resets fractional clock');
});
check("blood presentation: reusable owner depth batches, visibility, camera and draw-only purity", () => {
  const owner={x:20,y:40,dead:false,bleeding:0},spr=new Sprite(),wall=new Sprite(),after=new Sprite(),unitLayer=new Sprite();unitLayer.addChild(wall);unitLayer.addChild(spr);unitLayer.addChild(after);
  const physics=new BattleBlood(()=>{},()=>.5),fallback=new BloodRenderBatch(),air=new Sprite();air.addChild(fallback);
  const v=Object.assign(Object.create(BattleFieldView.prototype),{b:{camX:0,camY:0,units:[owner]},bloodTiles:new Map(),bloodPhysics:physics,unownedBlood:fallback,bloodBatches:new Map(),bloodBySprite:new Map(),unitSprites:[{u:owner,spr}],unitLayer,bloodAirLayer:air,isEffectOwnerVisible:()=>true});
  physics.hit(20,40,1,0,0,owner);const back=physics.drops[0],front={...back,x:2000,z:1},orphan={...back,owner:undefined};physics.drops.push(front,orphan);
  assert.equal(bloodBehindOwner(back,owner),true);assert.equal(bloodBehindOwner(front,owner),false);
  const state=JSON.stringify(physics.drops);v.renderBlood(100);const pair=v.bloodBatches.get(owner),array=pair.back.drops;
  assert.deepEqual(unitLayer.children,[wall,pair.back,spr,pair.front,after]);assert.equal(fallback.drops[0],orphan);
  for(let i=0;i<20;i++)v.renderBlood(100);
  assert.equal(JSON.stringify(physics.drops),state);assert.equal(pair.back.drops,array);assert.deepEqual(unitLayer.children,[wall,pair.back,spr,pair.front,after]);
  const x=pair.back.x;v.b.camX=100;v.renderBlood();assert.notEqual(pair.back.x,x);assert.equal(JSON.stringify(physics.drops),state);
  v.isEffectOwnerVisible=()=>false;v.renderBlood();assert.deepEqual(unitLayer.children,[wall,spr,after]);assert.equal(physics.drops.length,6);
  v.updateBlood(.36);v.renderBlood();assert.equal(physics.drops.length,0);assert.equal(pair.back.drops.length,0);assert.equal(fallback.drops.length,0);
  const batch=new BloodRenderBatch();batch.drops.push(back);let calls=0;
  const ctx={globalAlpha:.7,fillStyle:'#ffffff',fillRect(x,y,w,h){calls++;assert.equal(this.fillStyle,'#600000');assert.equal(this.globalAlpha,.7*back.alpha);assert.equal(w,1);assert.equal(h,1);}};
  for(let j=0;j<20;j++)batch.renderSelf(ctx);assert.equal(calls,20);assert.equal(ctx.globalAlpha,.7);assert.equal(ctx.fillStyle,'#ffffff');
});
check("blood stains: additive 3x3 alpha, tile boundaries, saturation and dirty uploads", () => {
  const saved=globalThis.document,uploads=[];
  try {
    globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),putImageData:(...args)=>uploads.push(args)})})};
    const v=Object.assign(Object.create(BattleFieldView.prototype),{bloodLayer:new Sprite(),bloodTiles:new Map(),bloodPhysics:new BattleBlood(()=>{}),b:{camX:0,camY:0},unownedBlood:new BloodRenderBatch(),bloodBatches:new Map(),bloodBySprite:new Map(),bloodAirLayer:new Sprite()});
    const xr=Math.sin(Math.PI/4),yr=Math.cos(Math.PI/4)*.574;
    // Aim inside pixel 1000 on both axes, spanning four lazy 1000px tiles.
    const wx=((1000.25-320)/xr+(1000.25-222.5)/yr)/2,wy=((1000.25-222.5)/yr-(1000.25-320)/xr)/2;
    v.stampBlood(wx,wy);assert.equal(v.bloodTiles.size,4);
    const alpha=(x,y)=>{const tx=Math.floor(x/1000),ty=Math.floor(y/1000);return v.bloodTiles.get(tx+','+ty).data.data[((y-ty*1000)*1000+x-tx*1000)*4+3];};
    assert.equal(alpha(1000,1000),20);assert.equal(alpha(999,999),5);assert.equal(alpha(1000,999),10);
    for(let n=0;n<20;n++)v.stampBlood(wx,wy);assert.equal(alpha(1000,1000),255);assert.equal(alpha(999,999),105);
    v.renderBlood(100);assert.equal(uploads.length,4);for(const a of uploads)assert(a[5]<=2&&a[6]<=2);
    for(let n=0;n<20;n++)v.renderBlood(100);assert.equal(uploads.length,4,'clean blood tiles are not uploaded again');
  } finally {globalThis.document=saved;}
});

check("doll display lifecycle: retained bitmap/crop, original registration, overlays and retry", () => {
  const saved=globalThis.document;
  try {
    globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},save(){},restore(){},transform(){},drawImage(){}})})};
    clearRenderCache();
    let available=true,shadowReady=true,shadowCalls=0;
    const image={complete:true,naturalWidth:12,naturalHeight:6};
    const rig={drawOrder:'slots',bones:[{name:'root'}],attachments:{body:{image:'body.png'},shadow:{image:'shadow.png'}},slots:[{name:'body',bone:'root',part:'Body',attachment:'body'},{name:'shadow',bone:'root',part:'Shadows',attachment:'shadow'}]};
    const clip={name:'retained',fps:25,duration:.12,tracks:[{bone:'root',keys:[{time:0,transform:{x:0}},{time:.08,transform:{x:2}}]}]};
    const anim=newDollAnim(0,0,1),u={x:20,y:40,weaponSub:0,burning:0,__doll:anim},spr=new Sprite(),flame=new Sprite();spr.addChild(flame);
    const e={spr,app:{gender:1},appKey:'retained',anim,flame,lastKey:'',cv:null,bodyObj:null,shadowObj:null};
    const v=Object.assign(Object.create(BattleFieldView.prototype),{dolls:new Map([[u,e]]),b:{camX:0,camY:0,opts:{}},assets:{getImage:name=>(available&&(name!=='shadow.png'||shadowReady))?image:null},ds:{weapons:{Weapons:[]},battleDoll:{},battleSkeleton:{definition:rig,animations:{hit_0:clip}}},shadowLayer:new Sprite(),unitSprites:[{u,spr,flame}],updateShadowFrame(...args){shadowCalls++;return BattleFieldView.prototype.updateShadowFrame.apply(this,args);}});
    anim.phase=3;anim.frame=1;v.updateDoll(u,0,0);
    assert.equal(e.flame,flame,'doll entries retain their attached flame without a per-frame unit lookup');
    const body=e.bodyObj,crop=body.srcRect,first=e.cv;
    assert.deepEqual(spr.children,[body,flame]);assert.equal(body.x,-50);assert.equal(body.y,-70);assert.equal(body.mouseEnabled,false);
    const firstShadowCalls=shadowCalls;v.updateDoll(u,0,0);assert.equal(shadowCalls,firstShadowCalls,'ready pose skips same-frame body/shadow work');
    anim.frame=2;v.updateDoll(u,0,0);assert.equal(e.bodyObj,body);assert.equal(body.srcRect,crop);assert.notEqual(e.cv,first);assert.equal(body.image,e.cv);
    const before=JSON.stringify(anim),children=spr.children,heldShadowCalls=shadowCalls;
    for(let i=0;i<20;i++)v.updateDoll(u,10,100);
    assert.equal(shadowCalls,heldShadowCalls);assert.equal(spr.children,children);assert.equal(JSON.stringify(anim),before);assert.equal(e.bodyObj,body);
    const x=spr.x;v.b.camX=100;anim.hidden=true;v.updateDoll(u,0,0);assert.notEqual(spr.x,x);assert.equal(spr.visible,false);assert.equal(shadowCalls,heldShadowCalls);assert.equal(e.bodyObj,body);anim.hidden=false;
    // Missing body must retain the last valid image, then retry that pose.
    const previous=e.cv,key=e.lastKey;available=false;anim.frame=3;clearRenderCache();v.updateDoll(u,0,0);
    assert.equal(e.cv,previous);assert.equal(e.lastKey,key);assert.equal(body.image,previous);
    available=true;v.updateDoll(u,0,0);assert.notEqual(e.lastKey,key);assert.equal(e.bodyObj,body);assert.equal(body.srcRect,crop);assert.deepEqual(spr.children,[body,flame]);
    // A body-ready pose is not cached until its shadow is also ready.
    const readyBody=e.cv,readyShadow=e.shadowObj.image;shadowReady=false;anim.dir=2;const delayedShadowCalls=shadowCalls;v.updateDoll(u,0,0);assert.equal(shadowCalls,delayedShadowCalls+1);assert.notEqual(e.poseKey,e.lastKey);
    anim.dir=1;v.updateDoll(u,0,0);assert.equal(e.bodyObj.image,readyBody);assert.equal(e.shadowObj.image,readyShadow);assert.equal(e.poseKey,e.lastKey,'returning to a cached old pose restores BOTH layers');
    anim.dir=2;v.updateDoll(u,0,0);assert.notEqual(e.poseKey,e.lastKey);
    shadowReady=true;v.updateDoll(u,0,0);assert.equal(shadowCalls,delayedShadowCalls+4);assert.equal(e.poseKey,e.lastKey);
    v.updateDoll(u,0,0);assert.equal(shadowCalls,delayedShadowCalls+4);
    assert.equal(e.shadowObj.parent.x,spr.x);assert.equal(e.shadowObj.parent.visible,spr.visible);
    // Appearance, equipped pose, and replaced authoring objects invalidate readiness.
    for(const change of [()=>{e.appKey+='-changed';},()=>{anim.weaponSub=1;},()=>{v.ds.battleSkeleton.animations.hit_0={...clip};},()=>{v.ds.battleSkeleton.definition={...rig};}]) {
      const readyKey=e.poseKey,calls=shadowCalls;change();v.updateDoll(u,0,0);
      assert.notEqual(e.poseKey,readyKey);assert.equal(shadowCalls,calls+1);assert.equal(e.poseKey,e.lastKey);
    }
  } finally {globalThis.document=saved;clearRenderCache();}
});



check("authoring: persistent visual source, authorable clip timing, validation and reversible generation", () => {
  const empty = { version: 1, definition: {}, animations: {} };
  const snapshot = structuredClone(skeleton);
  assert.deepEqual(applyAnimationAuthoring(skeleton, empty), skeleton);
  const source = { version: 1, definition: { attachments: { reusableBody: { part: 'Body', frame: 1 } } }, animations: {
    walk_0: { tracks: [{ bone: 'root', keys: [{ time: 0, transform: { x: 0 } }, { time: .08, transform: { x: 4 } }] }] },
    shoot_0: { slotTracks: [{ slot: 'Weapon', keys: [{ time: 0, visible: false }, { time: .04, visible: true }] }] },
  } };
  const frozenSource = structuredClone(source), result = applyAnimationAuthoring(skeleton, source);
  assert.equal(sampleSkeleton(result.definition, result.animations.walk_0, .04).bones.root.x, 2);
  assert.equal(sampleSkeleton(result.definition, result.animations.shoot_0, 0).slots.find(s => s.name === 'Weapon').visible, false);
  assert.deepEqual(result.animations.walk.tracks, source.animations.walk_0.tracks);
  assert.deepEqual(result.animations.shoot.slotTracks, source.animations.shoot_0.slotTracks);
  for (const name of skeleton.migratedClips) {
    const { tracks: oldTracks, slotTracks: oldSlots, ...originalTiming } = skeleton.animations[name];
    const { tracks: newTracks, slotTracks: newSlots, ...newTiming } = result.animations[name];
    assert.deepEqual(newTiming, originalTiming, name + ' changed simulation timing');
  }
  assert.deepEqual(applyAnimationAuthoring(skeleton, source), result);
  assert.deepEqual(applyAnimationAuthoring(skeleton, empty), snapshot);
  assert.deepEqual(skeleton, snapshot); assert.deepEqual(source, frozenSource);
  const invalid = (patch, pattern) => assert.throws(() => applyAnimationAuthoring(skeleton, { ...empty, ...patch }), pattern);
  // Clip timing is authorable now: the gate that rejected these fields is gone, so an authored
  // fps/duration/loop/playbackDuration/events/legacyParts must reach the runtime player.
  const base = skeleton.animations.shoot_0;
  const lastKey = Math.max(0, ...(base.slotTracks ?? []).flatMap(track => track.keys.map(key => key.time)));
  const duration = Math.max(base.duration, lastKey) + .5;
  const timedResult = applyAnimationAuthoring(skeleton, { version: 1, animations: { shoot_0: {
    fps: 30, duration, loop: true, playbackDuration: .25,
    events: [{ time: .1, name: 'custom_hit' }],
    legacyParts: { weapon: { fps: 30, frames: [1, 3, 5] } },
  } } });
  const timedClip = timedResult.animations.shoot_0;
  assert.deepEqual([timedClip.fps, timedClip.duration, timedClip.loop, timedClip.playbackDuration], [30, duration, true, .25]);
  assert.deepEqual(timedClip.events, [{ time: .1, name: 'custom_hit' }]);
  assert.deepEqual(timedClip.legacyParts.weapon, { fps: 30, frames: [1, 3, 5] });
  assert.deepEqual(sampleSkeleton(timedResult.definition, timedClip, .117, .09).events.map(e => e.name), ['custom_hit']);
  assert.equal(sampleSkeleton(timedResult.definition, timedClip, 2 / 30).legacyParts.weapon, 5);
  assert.deepEqual(timedResult.animations.shoot.events, timedClip.events); // the alias follows its authored type-0 clip
  const playback = createAnimationPlayback(timedClip);
  assert.equal(playback.duration, .25); // authored playbackDuration bounds the action
  advanceAnimationPlayback(playback, .15);
  assert.deepEqual(playback.events.map(cue => [cue.event.name, cue.event.time]), [['custom_hit', .1]]);
  // `null` clears an optional timing field so the runtime falls back on its own default.
  assert.ok(skeleton.animations.death_0.playbackDuration > 0);
  assert.equal(applyAnimationAuthoring(skeleton, { version: 1, animations: { death_0: { playbackDuration: null } } }).animations.death_0.playbackDuration, undefined);
  // Removing the gate must not weaken validation: anything the runtime player would reject still fails here.
  invalid({ animations: { shoot_0: { fps: 0 } } }, /positive fps/);
  invalid({ animations: { shoot_0: { fps: null } } }, /cannot be cleared/);
  invalid({ animations: { shoot_0: { duration: 0 } } }, /positive duration/);
  invalid({ animations: { shoot_0: { playbackDuration: 99 } } }, /must not exceed the clip duration/);
  invalid({ animations: { shoot_0: { loop: 'yes' } } }, /expected a boolean/);
  invalid({ animations: { shoot_0: { finishOnLastFrame: 'yes' } } }, /expected a boolean/);
  invalid({ animations: { shoot_0: { events: [{ time: 99, name: 'x' }] } } }, /outside the clip duration/);
  invalid({ animations: { shoot_0: { events: [{ time: 0, name: '' }] } } }, /non-empty string/);
  invalid({ animations: { shoot_0: { legacyParts: { weapon: { frames: [] } } } } }, /non-empty frame array/);
  invalid({ animations: { shoot_0: { legacyParts: { weapon: { frames: [0] } } } } }, /positive original frame number/);
  invalid({ animations: { walk: {} } }, /40 original clip names/);
  invalid({ definition: { bones: [{ name: 'a', parent: 'b' }, { name: 'b', parent: 'a' }] } }, /parent cycle/);
  invalid({ animations: { walk_0: { tracks: [{ bone: 'missing', keys: [] }] } } }, /missing bone/);
  invalid({ animations: { walk_0: { tracks: [{ bone: 'root', keys: [] }, { bone: 'root', keys: [] }] } } }, /duplicate bone/);
  invalid({ animations: { walk_0: { tracks: [{ bone: 'root', keys: [{ time: .04, transform: { x: NaN } }] }] } } }, /finite number/);
  invalid({ animations: { walk_0: { slotTracks: [{ slot: 'Weapon', keys: [{ time: 99, visible: false }] }] } } }, /outside the clip duration/);
  invalid({ animations: { walk_0: { slotTracks: [{ slot: 'Weapon', keys: [{ time: .04, attachment: 'typo' }] }] } } }, /missing attachment/);
  invalid({ definition: { attachments: { 'original:Body:1': { image: 'override.png' } } } }, /reserved attachment/);
  assert.throws(() => applyAnimationAuthoring(skeleton, { ...empty, definition: { attachments: { picture: { image: 'missing.png' } } } }, { hasImage: () => false }), /file is missing/);
  assert.throws(() => applyAnimationAuthoring(skeleton, { ...empty, definition: { attachments: { picture: { part: 'typo', frame: 1 } } } }, { hasPart: () => false }), /unknown original part/);
  assert.deepEqual(skeleton, snapshot); // failed authoring never partially mutates the source
});

// Small host-boundary regression: opt-out, canonical origin and failed registration.
{
  const code = await build({ entryPoints:['src/core/ModRuntime.ts'], bundle:true, write:false, platform:'node', format:'esm', logLevel:'silent' });
  const { ModRuntime } = await import('data:text/javascript;base64,' + Buffer.from(code.outputFiles[0].text).toString('base64'));
  const saved = globalThis.location;
  globalThis.location = { href:'http://localhost/index.html' };
  try {
    const url='http://localhost/mods/revival/manifest.json';
    const manifest={id:'revival',version:'1',runtime:'runtime/index.ts',data:{battleSkeleton:{test:true}},assets:{packed:'assets/test.png'}};
    let loads=0;
    const entry={id:'revival',manifestUrl:url,load:async()=>{loads++;return {default:api=>api.registerService('factory.battle','revival')};}};
    const on=new ModRuntime({bundledRuntimes:[entry]}); await on.loadManifest(url,manifest);
    assert.equal(loads,1); assert.equal(on.service('factory.battle'),'revival');
    assert.equal((await on.applyTo({})).battleSkeleton.test,true);
    const off=new ModRuntime({bundledRuntimes:[entry]}); await off.loadManifest(url,{...manifest,enabled:false});
    assert.equal(loads,1); assert.equal(off.service('factory.battle'),undefined);
    assert.deepEqual(await off.applyTo({}),{}); assert.equal(off.resolveAsset('packed'),undefined);
    const spoof=new ModRuntime({bundledRuntimes:[entry]});
    await assert.rejects(spoof.loadManifest('http://other.invalid/manifest.json',manifest),/Runtime not bundled/);
    assert.equal(loads,1);assert.equal(spoof.has('revival'),false);
    const failed=new ModRuntime({bundledRuntimes:[{...entry,load:async()=>({default:api=>{api.registerService('factory.battle','bad');throw Error('registration failed');}})}]});
    failed.services.set('factory.battle','previous');
    await assert.rejects(failed.loadManifest(url,manifest),/registration failed/);
    assert.equal(failed.service('factory.battle'),'previous');assert.equal(failed.has('revival'),false);
    assert.deepEqual(await failed.applyTo({}),{});assert.equal(failed.resolveAsset('packed'),undefined);
    console.log('DLC boundary: enabled/disabled, canonical source and registration rollback: ok');
  } finally { if(saved===undefined)delete globalThis.location;else globalThis.location=saved; }
}

if (failures) throw new Error(`${failures} animation behavior checks failed`);
