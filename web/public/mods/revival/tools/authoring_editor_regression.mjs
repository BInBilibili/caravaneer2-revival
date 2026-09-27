// Focused editor regression. Does not boot the game or touch saves.
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {PNG} from 'pngjs';
import {applyAnimationAuthoring} from './animation_authoring.mjs';
const temp=await mkdtemp(join(tmpdir(),'revival-editor-test-'));
try {
  await build({entryPoints:[resolve('public/mods/revival/qa/authoring-editor-model.ts')],bundle:true,platform:'node',format:'esm',outfile:join(temp,'model.mjs')});
  const m=await import(pathToFileURL(join(temp,'model.mjs')));
  const p=m.blankProject();m.validateProject(p);
  p.definition.packedParts={shared:{}};
  const f=m.fork(p,'idle');
  assert.equal(f.definition.packedParts,p.definition.packedParts);
  assert.notEqual(f.animations.idle,p.animations.idle);
  f.definition.bones[0].x=25;assert.equal(p.definition.bones[0].x,undefined);
  const sparse=[{time:0,transform:{x:8,scaleX:2}},{time:1,transform:{y:4}}];
  assert.equal(m.localPose(sparse,.5).x,8);assert.equal(m.localPose(sparse,.5).scaleX,2);assert.equal(m.localPose(sparse,.5).y,2);
  const step=[{time:0,transform:{x:8},interpolation:'step'},{time:1,transform:{x:21}}];
  assert.equal(m.localPose(step,.9).x,8);assert.equal(m.localPose(step,1).x,21);
  const keys=[{time:0,value:1},{time:.5,value:2}];m.putKey(keys,{time:.5,value:3});assert.deepEqual(keys,[{time:0,value:1},{time:.5,value:3}]);
  const invalid=m.blankProject();invalid.definition.bones[0].parent='root';assert.throws(()=>m.validateProject(invalid),/cycle/);
  const duplicates=m.blankProject();duplicates.animations.idle.tracks=[{bone:'root',keys:[{time:0,transform:{}},{time:0,transform:{}}]}];assert.throws(()=>m.validateProject(duplicates),/重复/);
  const missing=m.blankProject();missing.definition.slots=[{name:'s',bone:'root',part:'x',z:0,attachment:'missing'}];assert.throws(()=>m.validateProject(missing),/不存在/);
  const badEditor=m.blankProject();badEditor.editor={time:'invalid'};assert.throws(()=>m.validateProject(badEditor),/编辑时间/);
  const badSlots=m.blankProject();badSlots.animations.idle.slotTracks={};assert.throws(()=>m.validateProject(badSlots),/图片轨道/);
  const formal=JSON.parse(await readFile('public/mods/revival/data/battle_skeleton.json','utf8'));m.validateProject(formal);
  const edited=m.fork(formal,'idle_0'),before=JSON.stringify(formal.animations.idle_0);
  edited.animations.idle_0.tracks.push({bone:formal.definition.bones[0].name,keys:[{time:0,transform:{x:2}}]});
  assert.equal(JSON.stringify(formal.animations.idle_0),before);
  const patch=m.originalPatch(edited,formal,'idle_0');
  assert.ok(Object.keys(patch.definition.attachments).every(k=>!k.startsWith('original:')));
  assert.deepEqual(Object.keys(patch.animations.idle_0).sort(),['slotTracks','tracks']);
  applyAnimationAuthoring(formal,patch);
  // Timing is authorable now: the patch carries it, only when it differs, and applying it must
  // leave the original data untouched.
  edited.animations.idle_0.events=[{time:0,name:'new_event'}];edited.animations.idle_0.fps=30;edited.animations.idle_0.loop=true;
  const timedPatch=m.originalPatch(edited,formal,'idle_0');
  assert.deepEqual([timedPatch.animations.idle_0.fps,timedPatch.animations.idle_0.loop],[30,true]);
  assert.deepEqual(timedPatch.animations.idle_0.events,[{time:0,name:'new_event'}]);
  const timedFormal=applyAnimationAuthoring(formal,timedPatch);
  assert.deepEqual([timedFormal.animations.idle_0.fps,timedFormal.animations.idle_0.loop],[30,true]);
  assert.deepEqual(timedFormal.animations.idle.events,[{time:0,name:'new_event'}]); // alias follows its authored type-0 clip
  assert.deepEqual([formal.animations.idle_0.fps,formal.animations.idle_0.loop],[25,false]);
  const zombie=JSON.parse(await readFile('public/mods/revival/data/examples/zombie-project.json','utf8'));m.validateProject(zombie);
  assert.equal(Object.keys(zombie.animations).length,24);assert.equal(Object.keys(zombie.definition.attachments).length,104);
  assert.match(JSON.parse(JSON.stringify(m.fork(zombie,'行走 · 东南'))).credits,/Clint Bellanger.*CC-BY 3.0/);
  await build({entryPoints:[resolve('public/mods/revival/runtime/BattleSkeleton.ts')],bundle:true,platform:'node',format:'esm',outfile:join(temp,'runtime.mjs')});
  const {sampleSkeleton}=await import(pathToFileURL(join(temp,'runtime.mjs')));
  for(const [action,names] of Object.entries(zombie.presentation.groups))for(let d=0;d<4;d++){
    const name=names[d],a=zombie.animations[name],row=[5,7,1,3][d],keys=a.slotTracks[0].keys;
    assert.equal(m.directionalClip(zombie,names[0],d),name);
    assert.equal(a.loop,['待机','行走'].includes(action));
    for(const k of keys){assert.ok(k.attachment.startsWith('zombie_'+row+'_'));assert.equal(sampleSkeleton(zombie.definition,a,k.time).slots[0].attachment,k.attachment);}
    if(action==='死亡'){assert.equal(sampleSkeleton(zombie.definition,a,100).slots[0].attachment,'zombie_'+row+'_27');assert.equal(sampleSkeleton(zombie.definition,a,100).slots[0].visible,true);}
    if(['攻击','啃咬','受击'].includes(action))assert.equal(sampleSkeleton(zombie.definition,a,100).slots[0].attachment,'zombie_'+row+'_0');
    if(action==='行走')assert.equal(sampleSkeleton(zombie.definition,a,2).slots[0].attachment,keys[0].attachment);
  }
  await build({entryPoints:[resolve('public/mods/revival/qa/zombie-battle-visual.ts')],bundle:true,platform:'node',format:'esm',outfile:join(temp,'battle-visual.mjs')});
  const {simulationClip,BATTLE_DIRECTIONS}=await import(pathToFileURL(join(temp,'battle-visual.mjs')));
  assert.deepEqual(BATTLE_DIRECTIONS,['东北','东南','西南','西北']);
  const source=JSON.stringify(zombie);
  for(const attack of ['攻击','啃咬']){
    const clip=simulationClip(zombie,2,attack);
    assert.equal(clip.events.filter(e=>e.name==='fire').length,1);
    assert.equal(clip.events.find(e=>e.name==='fire').time,.375);
    assert.ok(clip.events.every(e=>e.time<clip.duration));
    assert.equal(clip.loop,false);
  }
  assert.deepEqual(simulationClip(zombie,4).events.map(e=>[e.name,e.time]),[['death_logic',.5],['death_fall',.75]]);
  assert.equal(simulationClip(zombie,1).loop,true);assert.equal(JSON.stringify(zombie),source);
  console.log('Zombie combat regression PASS: direction mapping, one melee impact, death cues, immutable source clips.');
  const sheet=PNG.sync.read(await readFile('public/mods/revival/assets/zombie/zombie-original.png'));
  for(const [id,a] of Object.entries(zombie.definition.attachments)){
    const [,row,col]=id.split('_').map(Number),png=PNG.sync.read(Buffer.from(a.image.split(',')[1],'base64'));
    assert.ok(png.width>0&&png.height>0&&png.data.some((v,i)=>i%4===3&&v>0));
    for(let y=0;y<png.height;y++){const start=((row*128+a.y+96+y)*sheet.width+col*128+a.x+64)*4;assert.deepEqual(png.data.subarray(y*png.width*4,(y+1)*png.width*4),sheet.data.subarray(start,start+png.width*4));}
  }
  const deleted=m.clone(zombie);delete deleted.animations['行走 · 西南'];assert.equal(m.directionalClip(deleted,'行走 · 东南',1),'行走 · 东南');
  const badPresentation=m.clone(zombie);badPresentation.presentation.groups.walk=[null];assert.throws(()=>m.validateProject(badPresentation),/四向/);
  console.log('Zombie regression PASS: 24 clips, all 104 source frames pixel-identical after trim, four facings, looping/recovery/corpse hold, credits.');
  console.log('Editor regression PASS: shared history, sparse/step interpolation, collision replacement, validation, original compatibility patch.');
} finally { await rm(temp,{recursive:true,force:true}); }

