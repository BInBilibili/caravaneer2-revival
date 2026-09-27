// Development-only, save-free visual fixture. Uses production Battle/Input/renderers.
import { loadDataStore } from '../../../../src/core/DataStore';
import type { RevivalDataStore } from '../runtime/Data';
import { ModRuntime } from '../../../../src/core/ModRuntime';
import { AssetStore } from '../../../../src/core/Assets';
import { Input } from '../../../../src/core/Input';
import { initSounds, setSoundFX, __c2SoundStats } from '../../../../src/core/Sound';
import { GameData, Character, makeTransportUnit } from '../../../../src/game/World';
import { newTransportAnimation, startTransportAnimation, advanceTransportAnimation, createOriginalTransportRig } from "../runtime/BattleTransportAnimation";
import { Battle } from '../runtime/Battle';
import type { FlameParticle } from '../runtime/BattleFlames';
import { effectFrame } from '../runtime/BattleEffectAnimation';
import { BitmapObject, Graphics } from '../../../../src/core/Display';
import { BloodRenderBatch } from '../runtime/BattleBloodVisual';
import { worldToScreen } from '../runtime/BattleFieldView';
import { getItemData } from '../../../../src/game/Economy';
import { encounterOptions } from '../../../../src/game/BattleEncounter';
import { makeDialogueEnv } from '../../../../src/game/Story';
import { openTownBattle } from '../../../../src/game/BattleStoryEncounters';
import { renderDollFrame, cachedDollFrame, dollAppearanceFrom, weaponAnimType, partTypeOf, renderDroppedWeapon, type DollRenderOpts } from "../runtime/BattleDoll";
import { ensureBattlePart } from "../runtime/BattleAtlas";
import type { SkeletonDefinition } from "../runtime/BattleSkeleton";
import { verifyStaticRig } from "./battle-rig";
// Load only the original parts actually drawn by a test, never every large atlas.
async function readyPose(opts: DollRenderOpts) {
  for(let attempt=0;attempt<3;attempt++) {
    const missing=new Set<string>();
    const pose=renderDollFrame({...opts,onMissing:names=>names.split(',').forEach(n=>missing.add(n))});
    if(pose) return pose;
    await Promise.all([...missing].map(n=>ensureBattlePart(opts.assets,opts.skeleton?.definition,n)));
  }
  throw new Error('Pose assets unavailable after bounded loading');
}
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!, ctx = canvas.getContext('2d')!;
const state = document.querySelector('#state')!, events = document.querySelector('#events')!, errors = document.querySelector('#errors')!;
const fail = (e: unknown) => { errors.textContent += String(e instanceof Error ? e.stack : e) + '\n'; };
window.addEventListener('error', e => fail(e.error ?? e.message));
window.addEventListener('unhandledrejection', e => fail(e.reason));
// Preload includes hundreds of UI/scene images; keep later weapon requests in the QA report.
performance.setResourceTimingBufferSize(4096);
// Explicit in-memory DLC fixture: independent of the player's stored selections.
const animationMods = new ModRuntime();
const revivalManifest = await (await fetch('mods/revival/manifest.json')).json();
const revivalSkeleton = await (await fetch('mods/revival/data/battle_skeleton.json')).json();
await animationMods.installPackage({ manifest: { id: 'revival-qa', version: '1', enabled: true }, data: { battleSkeleton: revivalSkeleton }, assets: revivalManifest.assets }, new URL('mods/revival/manifest.json', document.baseURI).href);
const ds = await loadDataStore(18, animationMods) as RevivalDataStore, assets = new AssetStore(ds);
const packedParts=(ds.battleSkeleton!.definition as SkeletonDefinition).packedParts!;
(globalThis as any).__c2 = { ds }; // Character's existing data-provider contract, no saves/shell.
(globalThis as any).__c2GetItemData = (id: number) => getItemData(ds, id);
await assets.loadFonts(); initSounds(ds.manifest); setSoundFX(false);
let b: Battle, ready = false, currentScenario = '原版初始站位';
const item = (cat: number, sub: number) => ds.items.Items.findIndex((it:any) => it?.category===cat && it.subCategory===sub);
const pistol = item(2,20), ammo = ds.items.Items.findIndex((it:any) => it?.category===3 && ds.weapons.Ammo[it.subCategory]?.type===1);
function hero(name:string, gender:number) {
  return new Character({ name, gender, category:1, age:30, _HP:200, _battleMorale:70, basePhysical:10, baseAgility:15, baseAccuracy:15,
    rangedWeaponsExperience:10000,pistolExperience:10000,
    weapons:[20,0], equipment:[{type:pistol,amount:1,inUse:1},{type:ammo,amount:100,inUse:0}],
    loadedAmmo:[{type:ammo,amount:8,inUse:0},null],
    originalBodyType:gender===2?5:1,originalHead:gender===2?6:1,originalBackHairType:1,originalBeardType:0,
    skinColor:{r:190,g:150,b:120,bc:1},hairColor:{r:40,g:30,b:20,bc:1},shirtColor:{r:70,g:110,b:160,bc:1},pantsColor:{r:90,g:70,b:40,bc:1},shoesColor:{r:40,g:30,b:20,bc:1}
  });
}
function reset(multigroup = false, towing = false) {
  b?.destroy(); ready=false;
  const gd = new GameData(ds,{difficulty:1,storyMode:false,character:hero('测试队长',1)} as any);
  gd.autoCenter=false; gd.walkAnimationSpeed=1; gd.showGrid=true; gd.Caravans[0].addPerson(hero('测试队员',2));
  const animal=makeTransportUnit(1,ds); animal.health=animal.maxHealth; animal.name='测试驮兽';
  const cart = towing ? makeTransportUnit(2,ds) : null;
  if (cart) { animal.cart = cart; cart.puller = animal; }
  gd.Caravans[0].transports=cart ? [animal,cart] : [animal];
  b=new Battle(gd,ds,assets,{onEnd:(win)=>events.textContent+='战斗结算：'+win+'\n'},{enemyCount:3,enemyName:'测试敌方',maxRange:15,additionalGroups:multigroup?[{band:1,name:'盟军车队',position:{x:gd.Caravans[0].x-1,y:gd.Caravans[0].y},people:[hero('盟军队长',1)]},{band:3,name:'中立车队',position:{x:gd.Caravans[0].x+1,y:gd.Caravans[0].y},people:[hero('中立旅人',2)]}]:[]});
  b.focus(b.units.find(u=>u.side===0 && !u.isTransport)!);
  currentScenario='原版初始站位';
  events.textContent='初始站位：'+b.units.map(u=>u.name+'('+u.squareX+','+u.squareY+') 朝向'+u.facing).join(' / ');
}
reset(); new Input(canvas,()=>b.screen);
const players=()=>b.units.filter(u=>u.side===0&&!u.isTransport), foes=()=>b.units.filter(u=>u.side===1&&!u.isTransport);
function closeScene(towing = false) {
  reset(false, towing); b.obstacles=[]; b.map.fill(0);
  const cells=[[22,24],[22,28],[24,24],[26,25],[27,29],[26,21]];
  b.units.forEach((u,i)=>{const [x,y]=cells[i] ?? [29,25];u.squareX=x;u.squareY=y;u.x=(x+.5)*32;u.y=(y+.5)*32;u._HP=u.maxHP=200;u.dead=false;u.dying=false;u.battleMorale=60;});
  b.order=[...players(),...foes()];b.turnIdx=0;b.phase='player';b.order[0].AP=40;
  b.fieldView.rebuildObstacles();b.fieldView.updateWorld();b.focus(players()[0]);b.hud.invalidateMiniMap();b.refreshInfo();
  currentScenario='近距离';
}
function activate(side:number) {
  const u=(side?foes():players()).find(u=>!u.dead); if(!u)return;
  b.turnIdx=b.order.indexOf(u);b.phase=side?'enemy':'player';u.AP=40;(b as any).timeAcc=1e6;
  b.hud.syncInputState();b.refreshInfo();
}
function tick(n:number) {for(let i=0;i<n;i++) b.update(1/25);draw();}
function equip(category:number) {
  closeScene();const u=players()[0];
  const sub=ds.weapons.Weapons.findIndex((w:any)=>w && ds.weapons.WeaponTypes[w.type]?.category===category && (category!==2 || ds.weapons.WeaponTypes[w.type].modes.some((m:any)=>m.burst>1)));
  const w=ds.weapons.Weapons[sub],wid=item(2,sub),aid=ds.items.Items.findIndex((it:any)=>it?.category===3 && ds.weapons.Ammo[it.subCategory]?.type===w.ammo);
  u.weaponSub=sub;u.weaponItem=wid;u.weaponItems=[wid,0];u.modeIdx=[0,0];u.weaponSlot=0;u.grenadeAmounts=[4,0];
  u.loadedAmmo=[aid>0?{type:aid,amount:w.ammoCapacity}:null,null];
  u.character.weapons=[sub,0];u.character.loadedAmmo=u.loadedAmmo.map((x:any)=>x?{...x,inUse:0}:null);
  u.character.equipment=[{type:wid,amount:category===5?4:1,inUse:1},...(aid>0?[{type:aid,amount:1000,inUse:0}]:[])];
  u.character.grenadeAmounts=[4,0];u.AP=100;u._HP=u.maxHP=2000;
  b.refreshInfo();currentScenario='武器类别 '+category;
}
function townAmbush(id:number) {
  b?.destroy();ready=false;
  const gd=new GameData(ds,{difficulty:1,storyMode:true,character:hero('剧情伏击验证队长',1)} as any);
  gd.autoCenter=false;(globalThis as any).__c2.shell={gd};
  Object.assign(makeDialogueEnv(gd,ds).Story,{needToAttackCannibals:true,needToAttckWinchester:true,heardAboutReginsPlan:true,reginsMenCount:4});
  openTownBattle(gd,ds,id,(owner,settings,obstacles)=>{
    const {opts}=encounterOptions(gd.Caravans[0],[gd.Caravans[0]],[owner],[],settings,obstacles);
    b=new Battle(gd,ds,assets,{onEnd:win=>events.textContent+='剧情结算：'+win},opts);
    b.focus(b.units[0]);currentScenario='原版城镇 '+id+' 伏击 '+b.fieldSize+'×'+b.fieldSize;
    events.textContent='敌人 '+owner.People.length+'，固定障碍 '+obstacles.length+'；重复触发 '+openTownBattle(gd,ds,id,()=>{})+'；人物血量 '+owner.People.map((p:any)=>p._HP+'/'+p.HP+'/'+p.maxHP+' 体力 '+p.basePhysical+' 体重 '+p.weight+'/'+p.idealWeight).join('，');
  });
}
function animationSnapshot() {
  return {
    ready, time: b.animTime, busy: b.isBusy(),
    effects: b.fx.filter(f=>f.kind==='explosion').map(f=>({kind:f.kind,frame:effectFrame(f.playback),elapsed:f.playback.elapsed})),
    flames: (b as any).flames.particles.map((f:FlameParticle<unknown>)=>({frame:f.frame,x:f.x,y:f.y,speed:f.speed,elapsed:f.playback.elapsed})),
    wallSmoke: [...b.wallHitAnimations.values()].map(h=>({frame:effectFrame(h.playback),outer:h.outer})),
    projectiles: (b as any).fx.filter((f: any) => f.kind === "grenade" || f.kind === "projectile").map((f: any) => ({kind: f.kind, counter: f.counter, t: f.t, frame:f.frame, elapsed:f.playback?.elapsed, x:f.x,y:f.y,z:f.z})),
    blood: b.fieldView.blood.map(d=>({x:d.x,y:d.y,z:d.z,vx:d.vx,vy:d.vy,vz:d.vz,alpha:d.alpha})),
    groundWeapons: [...(b.droppedWeapons ?? new Map()).values()].reduce((n, items) => n + items.length, 0),
    units: b.units.map(u => ({ name: u.name, hp: u._HP, dead: u.dead, dying: !!u.dying,
      phase: (u as any).__doll?.phase ?? u.transportAnimation?.phase,
      frame: (u as any).__doll?.frame ?? u.transportAnimation?.frame,
      done: (u as any).__doll?.done ?? u.transportAnimation?.done,
      dropped: !!(u as any).__deathDropped, bodyFall: !!(u as any).__bodyFall,
      walking: !!(u as any).__doll?.walk,
      burnFrame: effectFrame(u.burnPlayback), burnElapsed: u.burnPlayback?.elapsed,
      towing: u.transportAnimation?.towing,
      transportClip: u.transportAnimation?.playback?.animation.name,
      ammo: u.loadedAmmo?.[u.weaponSlot ?? 0]?.amount ?? 0,
      grenades: u.grenadeAmounts?.[u.weaponSlot ?? 0] ?? 0,
      action: (u as any).__doll?.playback ? {
        clip: (u as any).__doll.playback.animation.name, cycle: (u as any).__doll.playback.cycle,
        cycles: (u as any).__doll.playback.cycles, started: (u as any).__doll.playback.started,
      } : null,
    })),
  };
}
document.getElementById('sound')!.addEventListener('change', e => setSoundFX((e.target as HTMLInputElement).checked));
const actions:Record<string,()=>void|Promise<void>>={
  towing: () => { closeScene(true); currentScenario = '牵引动物与静态拖车'; },
  'transport-parity': async () => {
    closeScene();
    const u = b.units.find(u=>u.isTransport)!;
    const originalRig = ds.battleSkeleton!.transport;
    const types = Object.entries(ds.transports.Types).filter(([id,def])=>Number(id)>0 && def);
    let poses = 0;
    const actual = document.createElement('canvas'), expected = document.createElement('canvas');
    const ac = actual.getContext('2d', {willReadFrequently:true})!, ec = expected.getContext('2d', {willReadFrequently:true})!;
    try {
      for (const [id, raw] of types) {
        const def = raw as any, type = Number(id), w = def.imageWidth, h = def.imageHeight;
        await Promise.all(['Transport','TransportShadow'].map(part=>assets.ensure(part+type+'.png')));
        u.transportType=type; u.transportKind=def.category===1?'animal':'transport';
        actual.width=expected.width=w+40; actual.height=expected.height=h+120;
        for (const mode of ['attachments','legacyParts']) {
          const rig = mode==='attachments' ? originalRig! : createOriginalTransportRig();
          if (mode==='legacyParts') for (const clip of Object.values(rig.animations)) delete clip.slotTracks;
          ds.battleSkeleton!.transport = rig;
          for (let dir=0;dir<4;dir++) for (const towing of def.category===1 && def.canDragCarts ? [false,true] : [false]) {
            u.facing=dir;
            for (const phase of def.category===1 ? ['idle','hit','death'] : ['idle']) {
              const a=u.transportAnimation=newTransportAnimation(towing);
              if (phase!=='idle') startTransportAnimation(a,phase==='death',rig);
              const count=phase==='idle'?1:phase==='hit'?7:20;
              for (let i=0;i<count;i++) {
                if (phase!=='idle') advanceTransportAnimation(a,.04);
                const frame=(phase==='idle'?1:phase==='hit'?2:10)+(towing?29:0)+i;
                (b.fieldView as any).updateTransport(u,0,b.animTime);
                const entry=(b.fieldView as any).transportSprites.get(u);
                for (const [part,prop] of [['Transport','body'],['TransportShadow','shadow']] as const) {
                  const image=assets.getImage(part+type+'.png'); if(!image) throw new Error('Missing '+part+type);
                  const rect=ds.battleDoll.spriteBoundaries[part][type][dir][frame];
                  ac.clearRect(0,0,actual.width,actual.height); ec.clearRect(0,0,expected.width,expected.height);
                  ac.save();ac.translate(w/2+20,h/2+60);entry[prop].render(ac);ac.restore();
                  ec.drawImage(image as CanvasImageSource,dir*w+rect.x,(frame-1)*h+rect.y,rect.width,rect.height,
                    20+rect.x,40+Number(def.yCorrection??0)+rect.y,rect.width,rect.height);
                  const pixels=ac.getImageData(0,0,actual.width,actual.height).data;
                  const reference=ec.getImageData(0,0,expected.width,expected.height).data;
                  if(pixels.some((v,index)=>v!==reference[index])) throw new Error('Transport parity '+[mode,part,type,dir,frame].join('/'));
                  poses++;
                }
              }
            }
          }
        }
      }
      events.textContent='PASS: '+poses+' transport body/shadow renders, 15 original types, 4 directions, attachments / legacyParts.';
    } finally { ds.battleSkeleton!.transport=originalRig; const report=events.textContent;closeScene();events.textContent=report; }
  },

  "rig-check": async () => { events.textContent = await verifyStaticRig(ds.battleDoll!, assets); },
  'armed-death': () => {
    closeScene();
    const u = foes()[0];
    Object.assign(u, { weaponItems: [pistol, 0], weaponItem: pistol, weaponSub: 20,
      weaponSlot: 0, loadedAmmo: [{type: ammo, amount: 8}, null] });
    if (u.character) {
      u.character.weapons = [20, 0];
      u.character.loadedAmmo = [{type: ammo, amount: 8, inUse: 0}, null];
      u.character.addItemToEquipment({type: pistol, amount: 1, inUse: 1});
    }
    currentScenario = 'Armed target: check death frame 5 drop';
  },
  'atlas-load': async () => {
    for(let attempt=0;(b as any).loadingOverlay?.visible && attempt<200;attempt++) await new Promise(resolve=>setTimeout(resolve,10));
    if((b as any).loadingOverlay?.visible) throw new Error('Production Battle compact preload did not finish');
    const loaded = performance.getEntriesByType('resource').map(e => new URL(e.name).pathname);
    const report = Object.entries(packedParts).map(([source, packed]) => {
      const originalLoaded = loaded.some(p => p.endsWith('/' + packed.sourceUrl));
      const packedLoaded = loaded.some(p => p.endsWith('/' + assets.getImageSource(packed.image)));
      return {source, originalLoaded, packedLoaded};
    });
    events.textContent = 'Production compact resources: ' + JSON.stringify(report);
    if (report.some(r => !r.packedLoaded || r.originalLoaded)) throw new Error('Run resource check on a fresh page, before legacy comparison: only compact atlases should load');
  },
  'atlas-parity': async () => {
    const data=ds.battleDoll!, skeleton=ds.battleSkeleton!;
    await Promise.all(Object.values(packedParts).map(atlas=>assets.ensure(atlas.image)));
    const compactNames=new Set(Object.keys(packedParts));
    const packedOnlyAssets=new Proxy(assets,{get(target,key){
      if(key==='getImage') return (name:string)=>{if(compactNames.has(name)) throw new Error('Mapped atlas accessed original: '+name);return target.getImage(name);};
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});
    let checked=0;
    for(const [source,atlas] of Object.entries(packedParts)) {
      const match=source.match(/^(.+?)([0-9]+)\.png$/);if(!match) throw new Error('Invalid mapped source '+source);
      const part=match[1],type=Number(match[2]);
      const appearance=dollAppearanceFrom({gender:part==='Legs'?type:1,
        originalBodyType:part==='Body'?type:1, originalHead:part==='Head'?type:1,
        originalBackHairType:part==='BackHair'?type:0,originalBeardType:part==='Beard'?type:0,
        preserve:{changeTopArm:part.endsWith('TopArm')?type:0,changeForearm:part.endsWith('Forearm')?type:0}});
      const weaponSub=(part==='Weapon'||part==='BigGunBackpack') ? ds.weapons.Weapons.findIndex((w:any)=>w && w[part==='Weapon'?'animatedWeapon':'bigGunBackpack']===type) : 0;
      if(partTypeOf(appearance,part,ds.weapons,weaponSub)!==type) throw new Error('QA selected wrong part type: '+source);
      // Keep only this source atlas alive in the baseline; production assets stay compact.
      const baseline=new AssetStore(ds), sourceImage=await baseline.ensure(source);
      if(!sourceImage) throw new Error('Missing baseline '+source);
      events.textContent='Mapped atlas running: '+source+' ('+checked+' checked)';
      const renderLayer: 'shadow'|'body'=part==='Shadows'?'shadow':'body';
      const keys=Object.keys(atlas.frames);
      for(let i=0;i<keys.length;i++) {
        if(i%64===0) await new Promise(resolve=>setTimeout(resolve,0));
        const [dir,frame]=keys[i].split('/').map(Number);
        const fixed={drawOrder:'slots' as const,bones:[{name:'root'}],attachments:{fixed:{part,frame}},slots:[{name:'fixed',part,bone:'root',z:0,attachment:'fixed'}]};
        const animation={name:'atlas-parity',fps:25,duration:1,tracks:[]};
        const base={data,appearance,dir,weaponSub,renderLayer,assets:baseline,skeleton:{definition:fixed,animation,time:0}};
        const expected=renderDollFrame(base), got=renderDollFrame({...base,assets:packedOnlyAssets,skeleton:{...base.skeleton,definition:{...fixed,packedParts:packedParts}}});
        if(!expected||!got) throw new Error('Mapped atlas pose unavailable: '+source+'/'+keys[i]);
        const a=expected.getContext('2d')!.getImageData(0,0,100,100).data,b=got.getContext('2d')!.getImageData(0,0,100,100).data;
        if(b.some((v,j)=>v!==a[j])) throw new Error('Mapped atlas Canvas mismatch: '+source+'/'+keys[i]);
        checked++;
      }
      sourceImage.removeAttribute('src');
    }
    events.textContent='Mapped atlas parity: '+checked+' registered/tinted Canvas renders match originals; original access blocked on compact path';
  },
  'drop-atlas-parity': async () => {
    const skeleton=ds.battleSkeleton!, compactNames=new Set(Object.keys(packedParts));
    const packedOnlyAssets=new Proxy(assets,{get(target,key){
      if(key==='getImage') return (name:string)=>{if(compactNames.has(name)) throw new Error('Dropped weapon accessed original: '+name);return target.getImage(name);};
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});
    let checked=0;
    for(let sub=0;sub<ds.weapons.Weapons.length;sub++) {
      const def=ds.weapons.Weapons[sub]; if(!def || ds.weapons.WeaponTypes?.[def.type]?.category===5 || (!def.animatedWeapon&&!def.bigGunBackpack)) continue;
      const baseline=new AssetStore(ds), names:string[]=[];
      if(def.bigGunBackpack>0) names.push('BigGunBackpack'+def.bigGunBackpack+'.png');
      if(def.animatedWeapon>0) names.push('Weapon'+def.animatedWeapon+'.png');
      await Promise.all(names.map(n=>baseline.ensure(n)));
      await Promise.all(names.map(n=>ensureBattlePart(packedOnlyAssets,skeleton.definition,n)));
      const expected=renderDroppedWeapon(baseline,ds.battleDoll,ds.weapons,sub);
      const got=renderDroppedWeapon(packedOnlyAssets,ds.battleDoll,ds.weapons,sub,skeleton.definition);
      if(!expected||!got) throw new Error('Dropped weapon render unavailable: sub '+sub);
      const ep=expected.getContext('2d')!.getImageData(0,0,50,50).data,gp=got.getContext('2d')!.getImageData(0,0,50,50).data;
      if(gp.some((v,i)=>v!==ep[i])) throw new Error('Dropped weapon atlas mismatch: sub '+sub);
      checked++;
    }
    events.textContent='Dropped weapon atlas parity: '+checked+' weapon definitions match original 50x50 pixels';
  },
  'atlas-fallback': async () => {
    const data = ds.battleDoll!, skeleton = ds.battleSkeleton!;
    const compactNames = new Set(Object.values(packedParts).map(a => a.image));
    const missingAssets = new Proxy(assets, { get(target, key) {
      if (key === 'getImage') return (name: string) => compactNames.has(name) ? null : target.getImage(name);
      if (key === 'ensure') return (name: string) => compactNames.has(name) ? Promise.resolve(null) : target.ensure(name);
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const phases = ['idle', 'walk', 'shoot', 'hit', 'death'];
    let checked = 0;
    for (let animType=0;animType<8;animType++) for(let phase=0;phase<5;phase++) {
      await new Promise(resolve => setTimeout(resolve, 0));
      const weaponSub = Math.max(0, ds.weapons.Weapons.findIndex((w: any, sub: number) => w && weaponAnimType(ds.weapons, sub) === animType));
      const animation = skeleton.animations[phases[phase]+'_'+animType];
      for(const frame of [1, data.fullAnimationTypeFrames[animType][phase].length]) for(let dir=0;dir<4;dir++) for(const renderLayer of ['body','shadow'] as const) {
        const opts = {assets, data, appearance:dollAppearanceFrom(players()[0].character), animType, phase, frame, dir, weaponSub, renderLayer};
        const original=await readyPose(opts);
        const fallback=await readyPose({...opts, assets:missingAssets, skeleton:{definition:skeleton.definition,animation,time:(frame-1)/25}});
        if(!original||!fallback) throw new Error('Missing-atlas fallback returned an incomplete pose');
        const expected=original.getContext('2d')!.getImageData(0,0,100,100).data;
        if(fallback.getContext('2d')!.getImageData(0,0,100,100).data.some((v,i)=>v!==expected[i])) throw new Error('Missing-atlas fallback changed pixels');
        checked++;
      }
    }
    events.textContent='Missing compact atlases: '+checked+' first/last-frame body/shadow renders match original pixels';
  },
  'retained-doll': async () => {
    const data=ds.battleDoll!,rig=ds.battleSkeleton!,u=players()[0],view=(b as any).fieldView;
    const entry=view.dolls.get(u),originalState=(u as any).__doll,originalWeapon=u.weaponSub;
    const oldLayer=entry.bodyObj,oldCrop=oldLayer?.srcRect;
    let checked=0,body=oldLayer,crop=oldCrop;
    const phases=['idle','walk','shoot','hit','death'];
    const actual=document.createElement('canvas'),reference=document.createElement('canvas');
    actual.width=actual.height=reference.width=reference.height=100;
    const ac=actual.getContext('2d',{willReadFrequently:true})!,rc=reference.getContext('2d',{willReadFrequently:true})!;
    try {
      for(let animType=0;animType<8;animType++) {
        const weaponSub=Math.max(0,ds.weapons.Weapons.findIndex((w:any,sub:number)=>w&&weaponAnimType(ds.weapons,sub)===animType));
        u.weaponSub=weaponSub;
        for(let phase=0;phase<5;phase++)for(let dir=0;dir<4;dir++)for(const frame of [1,data.fullAnimationTypeFrames[animType][phase].length]) {
          const state={...originalState,phase,dir,frame,animType,weaponSub,walk:null,playback:undefined,hidden:false};
          (u as any).__doll=state;
          const opts={assets,data,appearance:entry.app,animType,phase,frame,dir,weaponSub};
          const originalOpts={...opts,skeleton:{definition:rig.definition,animation:rig.animations[phases[phase]+'_'+animType],time:(frame-1)/25}};
          await readyPose(originalOpts);
          // Isolate the display-object change: both paths use the same immutable
          // composition, as the pre-change renderer did. Independent tinted
          // canvas recomposition/readback can round RGB by 1 (alpha unchanged).
          // The separate pose-parity sweep checks original-vs-migrated content.
          const expected=cachedDollFrame(originalOpts,entry.appKey)!;
          const before=JSON.stringify(state);view.updateDoll(u,0,0);
          body??=entry.bodyObj;crop??=body.srcRect;
          if(body!==entry.bodyObj||crop!==body.srcRect)throw new Error('Doll display object or crop replaced');
          if(body.x!==-50||body.y!==-70)throw new Error('Doll registration changed');
          if(entry.spr.children.filter((c:any)=>c.__dollLayer).length!==1)throw new Error('Duplicate doll bitmap');
          const flame=view.unitSprites.find((e:any)=>e.u===u).flame;
          if(entry.spr.children.indexOf(body)>=entry.spr.children.indexOf(flame))throw new Error('Body covers fire overlay');
          if(body.image!==expected)throw new Error('Wrong composed frame selected');
          ac.clearRect(0,0,100,100);rc.clearRect(0,0,100,100);
          ac.save();ac.translate(50,70);body.render(ac);ac.restore();
          rc.drawImage(expected,0,0);
          const got=ac.getImageData(0,0,100,100).data,ref=rc.getImageData(0,0,100,100).data;
          if(got.some((v,i)=>v!==ref[i]))throw new Error('Retained bitmap draw mismatch '+[animType,phase,dir,frame]);
          for(let i=0;i<20;i++)view.updateDoll(u,0,0);
          if(JSON.stringify(state)!==before||entry.bodyObj!==body||body.srcRect!==crop)throw new Error('Redraw changed animation or bitmap');
          checked++;
        }
      }
      events.textContent='Retained doll PASS: '+checked+' cached-frame draw comparisons; 8 weapon animation types, 5 phases, 4 directions, first/last frames; one bitmap/crop per unit; overlay order; redraw x20.';
    } finally { (u as any).__doll=originalState;u.weaponSub=originalWeapon;view.updateDoll(u,0,0); }
  },
  'pose-parity': async () => {
    const data = ds.battleDoll!, skeleton = ds.battleSkeleton!;
    const appearance = dollAppearanceFrom(players()[0].character);
    const packedOnlyAssets = new Proxy(assets, { get(target, key) {
      if (key === 'getImage') return (name: string) => {
        if (packedParts[name]) throw new Error('Packed rendering silently loaded original: ' + name);
        return target.getImage(name);
      };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    await Promise.all(Object.values(packedParts).map(atlas => packedOnlyAssets.ensure(atlas.image)));
    const phases = ['idle', 'walk', 'shoot', 'hit', 'death'];
    let checked = 0, migratedChecked = 0;
    const pixels = (pose: HTMLCanvasElement | null) => {
      if (!pose) throw new Error('Pose parity: required sprite not loaded; retry after loading');
      return pose.getContext('2d')!.getImageData(0, 0, 100, 100).data;
    };
    for (let animType = 0; animType < 8; animType++) {
      const weaponSub = Math.max(0, ds.weapons.Weapons.findIndex((w: any, sub: number) => w && weaponAnimType(ds.weapons, sub) === animType));
      for (let phase = 0; phase < 5; phase++) {
        events.textContent = `Pose parity running: type ${animType}, ${phases[phase]} (${checked} renders checked)`;
        // Yield between clips so the QA sweep does not block browser input.
        await new Promise(resolve => setTimeout(resolve, 0));
        const frames = data.fullAnimationTypeFrames[animType][phase];
        const animation = skeleton.animations[phases[phase] + '_' + animType];
        // Poison the compatibility frame map: migrated poses must really use
        // attachments, not silently pass this check by falling back to legacy.
        const attachmentOnly = { ...animation, legacyParts: Object.fromEntries(
          ['legs', 'body', 'arms', 'weapon', 'shadow'].map(part => [part, { fps: 25, frames: [999] }])) };
        const fallback = { ...animation, slotTracks: undefined };
        for (let index = 0; index < frames.length; index++) for (let dir = 0; dir < 4; dir++) {
          for (const renderLayer of ['body', 'shadow'] as const) {
            const opts = { assets, data, appearance, animType, phase, frame: index + 1, dir, weaponSub, renderLayer };
            const expected = pixels(await readyPose(opts));
            const compare = (clip: typeof animation, label: string) => {
              const got = pixels(renderDollFrame({ ...opts, assets: packedOnlyAssets, skeleton: { definition: skeleton.definition, animation: clip, time: index / 25 } }));
              if (got.some((byte, i) => byte !== expected[i])) throw new Error(`Pose mismatch: ${label} type ${animType} phase ${phase} frame ${index + 1} direction ${dir} ${renderLayer}`);
            };
            compare(animation, 'shipped');
            checked++;
            if (animation.slotTracks?.length) {
              compare(attachmentOnly, 'attachments without legacy');
              compare(fallback, 'legacy fallback without attachments');
              migratedChecked++;
            }
          }
        }
      }
    }
    events.textContent = `Pose parity: ${checked} body/shadow renders match original frame renderer pixel-for-pixel (100x100 native sprites); ${migratedChecked} migrated renders also pass attachment-only and legacy-fallback checks`;
  },

  'render-only': () => {
    const before = JSON.stringify(animationSnapshot());
    for (let i = 0; i < 20; i++) { b.fieldView.positionUnits(.04, b.animTime); b.renderFx(10); }
    if (before !== JSON.stringify(animationSnapshot())) throw new Error('Rendering changed animation state');
    events.textContent = 'Render-only x20: animation state unchanged';
  },

  'town21':()=>townAmbush(21), 'town46':()=>townAmbush(46), 'town47':()=>townAmbush(47), 'town68':()=>townAmbush(68),
  'story-battle':()=>{
    b?.destroy();ready=false;
    const gd=new GameData(ds,{difficulty:1,storyMode:false,character:hero('剧情验证队长',1)} as any);
    gd.autoCenter=false;
    (globalThis as any).__c2.shell={gd};
    gd.onSetMode=(mode:number,...args:any[])=>{
      if(mode!==2)return;
      const {opts}=encounterOptions(gd.Caravans[0],...args);
      b=new Battle(gd,ds,assets,{onEnd:win=>events.textContent+='剧情结算：'+win},opts);
      b.focus(b.units[0]);currentScenario='原版第37号剧情战斗 '+b.fieldSize+'×'+b.fieldSize;
    };
    makeDialogueEnv(gd,ds).executeMajorEvent(37);
  },
  'effects-scene': async () => {
    await actions['wall-smoke']();
    const target=foes()[1];target.burning=1;b.spawnExplosionFx(target.x,target.y,80);
    currentScenario='特效：烟雾1–12 / 爆炸1–24 / 人物燃烧1–40循环';
  },
  'blood-check': async () => {
    closeScene();
    const start=performance.now();
    while((b as any).loadingOverlay?.visible) {
      if(performance.now()-start>15000)throw new Error('Blood scene assets not ready');
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    const v=b.fieldView,u=players()[0];b.units.forEach(unit=>unit.bleeding=0);
    const priorRandom=(v.bloodPhysics as any).random;let seed=1991;
    (v.bloodPhysics as any).random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    try { v.bloodSplat(u.x,u.y,100,u.x-30,u.y-30,u); } finally { (v.bloodPhysics as any).random=priorRandom; }
    if(v.blood.length!==400)throw new Error('Original hit drop count');
    if(v.blood.some(d=>Math.abs(d.alpha*255-Math.round(d.alpha*255))>1e-9))throw new Error('Original alpha byte rounding');
    const a=document.createElement('canvas'),e=document.createElement('canvas');a.width=e.width=880;a.height=e.height=495;
    const ac=a.getContext('2d',{willReadFrequently:true})!,ec=e.getContext('2d',{willReadFrequently:true})!;
    let compared=0,first:BloodRenderBatch|undefined;
    for(let n=0;n<=8;n++) {
      if(n)tick(1);v.renderBlood();
      const pair=(v as any).bloodBatches.get(u);if(!pair)throw new Error('Blood owner batch missing');
      if(first&&first!==pair.back)throw new Error('Blood batch recreated');first=pair.back;
      const children=v.unitLayer.children;
      if(pair.back.drops.length&&children.indexOf(pair.back)>=children.indexOf(pair.spr))throw new Error('Blood behind owner depth');
      for(const batch of [pair.back,pair.front] as BloodRenderBatch[]) {
        ac.clearRect(0,0,880,495);ec.clearRect(0,0,880,495);batch.render(ac);
        // Independent original map2Screen + byte-alpha procedural pixel reference.
        ec.save();ec.translate(batch.x,batch.y);ec.fillStyle='#600000';
        for(const d of batch.drops) {
          ec.globalAlpha=Math.round(d.alpha*255)/255;
          ec.fillRect(Math.sin(Math.PI/4)*(d.x-d.y),Math.cos(Math.PI/4)*.574*(d.x+d.y)-d.z,1,1);
        }
        ec.restore();
        const aa=ac.getImageData(0,0,880,495).data,ee=ec.getImageData(0,0,880,495).data;
        if(aa.some((value,i)=>value!==ee[i]))throw new Error('Blood pixel mismatch '+n);compared++;
      }
      const before=JSON.stringify(animationSnapshot());for(let j=0;j<20;j++)v.renderBlood(100);
      b.paused=true;b.update(1);b.paused=false;
      if(before!==JSON.stringify(animationSnapshot()))throw new Error('Blood redraw/pause advanced physics');
    }
    if(v.blood.some(d=>d.z!==4)||(v as any).bloodTiles.size)throw new Error('Blood landed before ninth tick');
    const landed=v.blood.map(d=>({x:d.x+d.vx,y:d.y+d.vy}));tick(1);v.renderBlood();
    if(v.blood.length)throw new Error('Blood survived ninth tick');
    const expected=new Map<string,number>();
    for(const d of landed) {
      const p=worldToScreen(d.x,d.y,0,0),px=Math.floor(p.x),py=Math.floor(p.y);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++) {
        const key=(px+dx)+','+(py+dy),alpha=Math.abs(dx)+Math.abs(dy)===2?5:dx||dy?10:20;
        expected.set(key,Math.min(255,(expected.get(key)??0)+alpha));
      }
    }
    for(const [key,alpha] of expected) {
      const [x,y]=key.split(',').map(Number),tx=Math.floor(x/1000),ty=Math.floor(y/1000),tile=(v as any).bloodTiles.get(tx+','+ty);
      if(!tile)throw new Error('Blood stain tile missing');
      const pixel=tile.ctx.getImageData(x-tx*1000,y-ty*1000,1,1).data;
      // Canvas premultiplied color roundtrip may round red; exact alpha is invariant.
      if(pixel[3]!==alpha)throw new Error('Blood stain alpha '+key);
    }
    if(first?.drops.length)throw new Error('Landed drops remain in visual batch');
    currentScenario='血滴与血迹检查通过';
    events.textContent='Blood PASS: 400 drops; '+compared+' procedural pixel comparisons; '+expected.size+' ground alpha pixels; ninth-tick landing; retained owner batches; render-only x20; pause.';
  },
  'blood-profile': async () => {
    const canvas=document.createElement('canvas');canvas.width=880;canvas.height=495;
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!,batch=new BloodRenderBatch();
    batch.x=320;batch.y=222.5;
    const reports=[];
    for(const count of [1000,4000]) {
      batch.drops.length=0;
      for(let i=0;i<count;i++)batch.drops.push({x:(i%40)*5-100,y:Math.floor(i/40)*2-100,z:i%40,vx:0,vy:0,vz:0,alpha:(51+i%52)/255});
      const oldDraw=()=>{
        const g=new Graphics();
        for(const d of batch.drops){const p=worldToScreen(d.x,d.y,0,0);g.beginFill(0x600000,d.alpha);g.drawRect(p.x,p.y-d.z,1,1);}
        g.render(ctx);
      };
      const newDraw=()=>batch.render(ctx);
      const measure=(draw:()=>void)=>{const start=performance.now();for(let i=0;i<20;i++){ctx.clearRect(0,0,880,495);draw();}ctx.getImageData(0,0,1,1);return (performance.now()-start)/20;};
      for(let i=0;i<5;i++){oldDraw();newDraw();}ctx.clearRect(0,0,880,495);
      const oldSamples:number[]=[],newSamples:number[]=[];
      for(let r=0;r<9;r++) {
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        if(r%2){newSamples.push(measure(newDraw));oldSamples.push(measure(oldDraw));}
        else {oldSamples.push(measure(oldDraw));newSamples.push(measure(newDraw));}
      }
      const median=(xs:number[])=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
      reports.push({drops:count,oldMedianMs:median(oldSamples),retainedMedianMs:median(newSamples),oldSamples,newSamples});
    }
    events.textContent='Blood synthetic draw profile (not whole-battle FPS; 880x495 offscreen, 9 alternating samples x20 draws): '+JSON.stringify(reports);
  },
  'projectile-check': async () => {
    equip(5);
    const start=performance.now();
    while((b as any).loadingOverlay?.visible) {
      if(performance.now()-start>15000)throw new Error('Projectile assets not ready');
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    const a=document.createElement('canvas'),e=document.createElement('canvas');a.width=e.width=32;a.height=e.height=32;
    const ac=a.getContext('2d',{willReadFrequently:true})!,ec=e.getContext('2d',{willReadFrequently:true})!;
    let compared=0;
    for(const type of [4,6,13]) {
      const f={kind:'projectile',t:0,dur:10,x:players()[0].x+40,y:players()[0].y+40,z:40,angle:0,ammo:{type}};
      b.fx=[f];b.renderFx();const v=(b as any).projectileVisuals.get(f),first=v.rocket,firstShadow=v.rocketShadow;
      for(let row=0;row<16;row++) {
        f.angle=Math.PI-row*Math.PI/8;b.renderFx();
        const p=worldToScreen(f.x,f.y,b.camX,b.camY);
        if(v.body.x!==p.x||v.shadow.x!==p.x||v.body.y!==p.y-f.z||v.shadow.y!==p.y)throw new Error('Projectile registration');
        for(const shadow of [false,true]) {
          ac.clearRect(0,0,32,32);ec.clearRect(0,0,32,32);
          if(type===4) {
            const g=(shadow?v.shadow:v.body).graphics;
            ac.save();ac.translate(16,16);g.render(ac);ac.restore();
            const dx=(Math.sin(f.angle)-Math.cos(f.angle))*10*Math.sin(Math.PI/4);
            const dy=(Math.sin(f.angle)+Math.cos(f.angle))*10*Math.cos(Math.PI/4)*.574;
            ec.save();ec.translate(16,16);ec.strokeStyle=shadow?'rgba(0,0,0,0.5)':'#000';ec.lineWidth=1;
            ec.beginPath();ec.moveTo(-dx/2,-dy/2);ec.lineTo(dx/2,dy/2);ec.stroke();ec.restore();
          } else {
            const bo=shadow?v.rocketShadow:v.rocket,image=assets.getImage(shadow?'RocketShadow.png':'Rocket.png')!;
            if(!bo||!image||bo!==(shadow?firstShadow:first))throw new Error('Rocket missing/recreated');
            ac.save();ac.translate(8,8);bo.renderSelf(ac);ac.restore();
            ec.drawImage(image,0,row*15,15,15,8,8,15,15);
          }
          const aa=ac.getImageData(0,0,32,32).data,ee=ec.getImageData(0,0,32,32).data;
          if(aa.some((value,i)=>value!==ee[i]))throw new Error('Projectile pixels '+type+'/'+row+'/'+shadow);compared++;
        }
        const before=JSON.stringify(f),ops=v.body.graphics.ops;
        for(let n=0;n<20;n++)b.renderFx(10);
        if(JSON.stringify(f)!==before||v.body.graphics.ops!==ops)throw new Error('Redraw advanced / rebuilt projectile');
      }
    }
    b.fx=[];b.renderFx();
    if(b.fieldView.fxLayer.children.length||b.fieldView.projectileShadowLayer.children.length)throw new Error('Projectile retained after removal');
    currentScenario='火箭与弩箭绘制检查通过';
    events.textContent='Projectile PASS: '+compared+' comparisons (64 original rocket/shadow crops, 32 centered bolt-line renders); sixteen directions; object reuse; render-only x20; cleanup.';
  },
  'grenade-check': async () => {
    equip(5);
    const start=performance.now();
    while((b as any).loadingOverlay?.visible) {
      if(performance.now()-start>15000)throw new Error('Grenade assets not ready');
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    const u=players()[0],target=foes()[0];b.throwGrenade(u,target.squareX,target.squareY);
    let guard=0;while(!b.fx.some(f=>f.kind==='grenade')&&guard++<30)tick(1);
    const g=b.fx.find(f=>f.kind==='grenade');if(!g||g.frame!==1)throw new Error('Original release frame 1 missing');
    // Keep this pixel sweep in free flight, independent of randomized aim/collisions.
    g.z=300;g.vx=g.vy=0;g.vz=0;g.counter=100;g.explodeOnImpact=false;
    const image=assets.getImage('Grenade.png')!;
    const a=document.createElement('canvas'),e=document.createElement('canvas');a.width=e.width=30;a.height=e.height=30;
    const ac=a.getContext('2d',{willReadFrequently:true})!,ec=e.getContext('2d',{willReadFrequently:true})!;
    let first:BitmapObject|undefined,compared=0;
    for(let n=0;n<=16;n++) {
      if(n)tick(1);else b.renderFx();
      if(g.frame!==n%16+1)throw new Error('Grenade rotation '+n);
      const bo=(b as any).effectSprites.get(g) as BitmapObject;
      if(!bo||first&&first!==bo)throw new Error('Grenade bitmap missing/recreated');first=bo;
      const crop=ds.battleDoll!.spriteBoundaries.Grenade[0][0][g.frame],p=worldToScreen(g.x,g.y,b.camX,b.camY);
      if(Math.abs(bo.x-p.x-(-5+crop.x))>1e-6||Math.abs(bo.y-p.y-(-5+crop.y-g.z*.9))>1e-6)throw new Error('Grenade registration');
      ac.clearRect(0,0,30,30);ec.clearRect(0,0,30,30);ac.save();ac.translate(10+crop.x,10+crop.y);bo.renderSelf(ac);ac.restore();
      ec.drawImage(image,crop.x,(g.frame-1)*10+crop.y,crop.width,crop.height,10+crop.x,10+crop.y,crop.width,crop.height);
      const aa=ac.getImageData(0,0,30,30).data,ee=ec.getImageData(0,0,30,30).data;
      if(aa.some((v,i)=>v!==ee[i]))throw new Error('Grenade pixels '+g.frame);compared++;
      if(b.fieldView.projectileShadowLayer.children.length)throw new Error('Invented grenade shadow');
    }
    const held=g.frame;
    g.z=64;g.vz=-1;g.over=[{owner:{},height:2,points:[]}];
    const counter=g.counter;tick(3);
    if(g.frame!==held||g.counter!==counter-3||g.z!==64)throw new Error('Roof did not freeze pose / fuse stopped');
    const before=JSON.stringify(animationSnapshot());for(let n=0;n<20;n++)b.renderFx(10);
    b.paused=true;b.update(1);b.paused=false;
    if(before!==JSON.stringify(animationSnapshot()))throw new Error('Grenade advanced during redraw/pause');
    g.over=[];g.z=1;g.vz=-1;tick(2);if(g.frame!==held||g.z!==0)throw new Error('Floor did not freeze pose');
    g.counter=1;tick(1);
    if(b.fx.includes(g)||b.fx.filter(f=>f.kind==='explosion').length!==1)throw new Error('Fuse did not produce exactly one explosion');
    tick(25);if(b.fx.some(f=>f.kind==='grenade'||f.kind==='explosion'))throw new Error('Grenade/explosion did not finish');
    currentScenario='手雷共享动画检查通过';
    events.textContent='Grenade PASS: '+compared+' original-crop pixel comparisons; source frame 1; 16-frame loop; roof/floor freeze; fuse continues; one explosion; bitmap reuse; no shadow; render-only x20; pause.';
  },
  'flame-check': async () => {
    equip(4);
    const start=performance.now();
    while((b as any).loadingOverlay?.visible) {
      if(performance.now()-start>15000)throw new Error('Flame assets not ready');
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    const source=players()[0];source.loadedAmmo![0]!.amount=1;
    b.tryAttack(source,foes()[0]);
    let guard=0;
    while(!(b as any).flames.particles.length&&guard++<30)tick(1);
    const particle=(b as any).flames.particles[0] as FlameParticle<unknown>;
    if(!particle||particle.frame!==1)throw new Error('Flame release did not enter frame 1');
    const actual=document.createElement('canvas'),expected=document.createElement('canvas');
    actual.width=expected.width=220;actual.height=expected.height=220;
    const ac=actual.getContext('2d',{willReadFrequently:true})!,ec=expected.getContext('2d',{willReadFrequently:true})!;
    const image=assets.getImage('FlamethrowerFlame.png')!;
    let first:BitmapObject|undefined,compared=0;
    for(let frame=1;frame<=48;frame++) {
      if(frame>1)tick(1);
      const sprite=(b as any).effectSprites.get(particle) as BitmapObject|undefined;
      if(frame<=45) {
        if(particle.frame!==frame||!sprite||!b.fieldView.fxLayer.children.includes(sprite))throw new Error('Missing flame frame '+frame);
        if(first&&first!==sprite)throw new Error('Flame bitmap recreated');first=sprite;
        const origin=worldToScreen(particle.x,particle.y,b.camX,b.camY),crop=ds.battleDoll!.spriteBoundaries.FlamethrowerFlame[0][0][frame];
        const x=-50+crop.x,y=-90+crop.y,r=sprite.srcRect!;
        if(Math.abs(sprite.x-origin.x-x)>1e-6||Math.abs(sprite.y-origin.y-y)>1e-6)throw new Error('Flame registration '+frame);
        if(JSON.stringify(r)!==JSON.stringify({x:crop.x,y:(frame-1)*100+crop.y,w:crop.width,h:crop.height}))throw new Error('Flame crop '+frame);
        ac.clearRect(0,0,220,220);ec.clearRect(0,0,220,220);
        ac.save();ac.translate(100+x,130+y);sprite.renderSelf(ac);ac.restore();
        ec.drawImage(image,crop.x,(frame-1)*100+crop.y,crop.width,crop.height,100+x,130+y,crop.width,crop.height);
        const a=ac.getImageData(0,0,220,220).data,e=ec.getImageData(0,0,220,220).data;
        if(a.some((v,i)=>v!==e[i]))throw new Error('Flame pixels '+frame);compared++;
      } else {
        if(sprite&&b.fieldView.fxLayer.children.includes(sprite))throw new Error('Invisible tail was drawn');
        if((b as any).flames.particles.length!==(frame<48?1:0))throw new Error('Physical tail duration');
        if(frame<48&&particle.frame!==frame)throw new Error('Physical tail frame');
      }
      if(frame===20) {
        const before=JSON.stringify(animationSnapshot());
        for(let redraw=0;redraw<20;redraw++)b.renderFx(10);
        b.paused=true;b.update(1);b.paused=false;
        if(before!==JSON.stringify(animationSnapshot()))throw new Error('Flame advanced in redraw/pause');
      }
    }
    if(source.loadedAmmo![0]!.amount!==0)throw new Error('One fuel shot consumed incorrectly');
    currentScenario='喷火共享动画检查通过';
    events.textContent='Flames PASS: '+compared+' original-crop pixel comparisons; 47 physical frames / 45 visible; single fuel release; bitmap reuse; render-only x20; pause.';
  },
  'effects-check': async () => {
    await actions['effects-scene']();
    // Use the real Battle tick after its normal asynchronous asset gate opens.
    const start=performance.now();
    while ((b as any).loadingOverlay?.visible) {
      if(performance.now()-start>15000)throw new Error('Effect fixture assets did not finish loading');
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    const target=foes()[1], wall=b.obstacles[0], other=players()[1];
    const actual=document.createElement('canvas'),expected=document.createElement('canvas');
    actual.width=expected.width=420;actual.height=expected.height=350;
    const ac=actual.getContext('2d',{willReadFrequently:true})!,ec=expected.getContext('2d',{willReadFrequently:true})!;
    let compared=0,firstExplosion:BitmapObject|undefined;
    const same=(actual:unknown,expected:unknown,label:string)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(label+': '+JSON.stringify(actual)+' != '+JSON.stringify(expected));};
    const compare=(kind:'Explosion'|'ShotSmoke'|'BodyBurn',frame:number,sprite:BitmapObject|undefined,origin:{x:number,y:number})=>{
      if(!sprite)throw new Error(kind+' sprite missing at '+frame);
      const image=assets.getImage(kind+'.png')!,crop=ds.battleDoll!.spriteBoundaries[kind][0][0][frame];
      const height=kind==='Explosion'?250:kind==='ShotSmoke'?20:100;
      const x=kind==='BodyBurn'?-Math.round(crop.width/2):(kind==='Explosion'?-150:-10)+crop.x;
      const y=kind==='BodyBurn'?-40-Math.round(crop.height/2):(kind==='Explosion'?-200:-40)+crop.y;
      const r=sprite.srcRect!;
      same(r,{x:crop.x,y:(frame-1)*height+crop.y,w:crop.width,h:crop.height},kind+' crop');
      if(Math.abs(sprite.x-origin.x-x)>1e-6||Math.abs(sprite.y-origin.y-y)>1e-6)throw new Error(kind+' registration mismatch');
      ac.clearRect(0,0,420,350);ec.clearRect(0,0,420,350);
      ac.drawImage(image,r.x,r.y,r.w,r.h,200+Math.round(sprite.x-origin.x),250+Math.round(sprite.y-origin.y),r.w,r.h);
      ec.drawImage(image,crop.x,(frame-1)*height+crop.y,crop.width,crop.height,200+x,250+y,crop.width,crop.height);
      const a=ac.getImageData(0,0,420,350).data,e=ec.getImageData(0,0,420,350).data;
      if(a.some((v,i)=>v!==e[i]))throw new Error(kind+' pixel mismatch frame '+frame);
      compared++;
    };
    for(let tickNo=1;tickNo<=41;tickNo++) {
      if(tickNo===4)other.burning=1;
      tick(1);
      const ex=b.fx.find(f=>f.kind==='explosion'),hit=b.wallHitAnimations.get(wall);
      same(ex?effectFrame(ex.playback):0,tickNo<=24?tickNo:0,'Explosion tick '+tickNo);
      same(hit?effectFrame(hit.playback):0,tickNo<=12?tickNo:0,'Smoke tick '+tickNo);
      same(effectFrame(target.burnPlayback),(tickNo-1)%40+1,'BodyBurn tick '+tickNo);
      const entry=(b.fieldView as any).unitSprites.find((e:any)=>e.u===target);
      compare('BodyBurn',(tickNo-1)%40+1,entry.flame.children.find((s:any)=>s instanceof BitmapObject),{x:0,y:0});
      if(ex){const sprite=b.fieldView.fxLayer.children.find(s=>s instanceof BitmapObject) as BitmapObject;compare('Explosion',tickNo,sprite,worldToScreen(ex.x,ex.y,b.camX,b.camY));if(firstExplosion&&firstExplosion!==sprite)throw new Error('Explosion bitmap was recreated');firstExplosion=sprite;}
      if(hit){compare('ShotSmoke',tickNo,(b.fieldView as any).wallHits.get(wall),worldToScreen(hit.x,hit.y,b.camX,b.camY));}
      if(tickNo===6){
        same(effectFrame(other.burnPlayback),3,'Independent ignition');
        const before=JSON.stringify(animationSnapshot());
        for(let j=0;j<20;j++){b.renderFx(10);b.fieldView.positionUnits(.04,b.animTime);}
        same(JSON.stringify(animationSnapshot()),before,'Render-only state');
        b.paused=true;b.update(1);b.paused=false;same(JSON.stringify(animationSnapshot()),before,'Paused state');
      }
    }
    currentScenario='特效帧序检查通过';
    events.textContent='Effects PASS: '+compared+' original-crop pixel comparisons; smoke 1..12, explosion 1..24, fire 40→1; independent ignition; render-only x20; pause; explosion bitmap reuse.';
  },
  'wall-smoke':()=>{closeScene();const u=players()[0],gx=u.squareX+2,gy=u.squareY;
    const cells=ds.obstacles.obstacles[0].fillSquares.map((p:any)=>[gx+p.x,gy+p.y] as [number,number]);
    const wall={gx,gy,type:1,cells};b.obstacles=[wall];b.fieldView.rebuildObstacles();
    b.fieldView.wallHit(wall,(gx+.5)*32,(gy+.5)*32,true);currentScenario='墙面命中烟雾：12帧';
  },
  "end-current":()=>b.endTurn(),
  "bleed-turn":()=>{closeScene();players()[0].bleeding=6;players()[1].bleeding=9;setSoundFX(true);currentScenario="队长失血6，队员失血9，等待结束回合";},
  "drop-bow":()=>{closeScene();const p=players()[0],e=foes()[0],bow=item(2,29);Object.assign(e,{weaponItems:[bow,0],weaponItem:bow,weaponSub:29,weaponSlot:0,squareX:p.squareX,squareY:p.squareY,x:p.x,y:p.y});b.dropWeapon(e);currentScenario="脚下弩，当前槽已占用仍显示名字";},
  reset:()=>reset(), groups:()=>{reset(true);currentScenario='四组部署（玩家/敌人/盟军/中立）';}, 'close-scene':closeScene,tick:()=>tick(1),ticks:()=>tick(10),second:()=>tick(25),
  hit:()=>b.applyHit(foes()[0],12,{openWoundCoeficient:.1},()=>{},false,players()[0]),
  die:()=>b.applyHit(foes()[0],foes()[0]._HP+1,{openWoundCoeficient:.1},()=>{},false,players()[0]),
  blood:()=>{foes()[0].bleeding=20;foes()[1].burning=4;},
  animal:()=>b.applyHit(b.units.find(u=>u.isTransport)!,12,{openWoundCoeficient:.1},()=>{},false,foes()[0]),
  'animal-die':()=>{const u=b.units.find(u=>u.isTransport)!;b.applyHit(u,u._HP+1,{openWoundCoeficient:.1},()=>{},false,foes()[0]);},
  enemy:()=>activate(1), player:()=>activate(0),pan:()=>{b.camX+=128;b.camY-=64;b.clampCam();},'reload-hud':()=>{b.hud.rebuild();b.refreshInfo();},
  messages:()=>{b.battleMessage(foes()[0],'hit',12);b.battleMessage(players()[0],'bleeding',3);b.battleMessage(players()[1],'heal',5);},
  burst:()=>{equip(2);const u=players()[0];u.modeIdx![0]=ds.weapons.WeaponTypes[ds.weapons.Weapons[u.weaponSub].type].modes.findIndex((m:any)=>m.burst>1);b.refreshInfo();},grenade:()=>equip(5),flame:()=>equip(4),projectile:()=>equip(3),
  'fire-target':()=>b.tryAttack(players()[0],foes()[0]),
  'throw-target':()=>{b.throwGrenade(players()[0],foes()[0].squareX,foes()[0].squareY);},
  'bounce-wall':()=>{closeScene(); const u=players()[0];const animal=b.units.find(x=>x.isTransport)!;animal.squareY+=5;animal.y+=160;const gx=u.squareX+2,gy=u.squareY;const cells=ds.obstacles.obstacles[0].fillSquares.map((p:any)=>[gx+p.x,gy+p.y] as [number,number]);b.obstacles=[{gx,gy,type:1,cells}];for(const [x,y] of cells)b.map[y*b.fieldSize+x]=1;b.fieldView.rebuildObstacles();b.hud.invalidateMiniMap();(b as any).fx.push({kind:'grenade',x:u.x,y:u.y,z:32,vx:20,vy:0,vz:0,counter:75,over:[],source:u,t:0,dur:Infinity,acc:0,frame:0,explosiveness:0,antiPersonnel:0,explodeOnImpact:false});currentScenario='轮廓反弹';},
  medical:()=>{closeScene();const u=players()[0];u.character.addItemToEquipment({type:42,amount:6,inUse:0});u.character.addItemToEquipment({type:43,amount:3,inUse:0});u.bleeding=25;b.refreshInfo();currentScenario='药品与包扎灯';},
  'walk-hud':()=>{const u=b.order[b.turnIdx];if(b.inControl()){const p=worldToScreen((u.squareX+5.5)*32,(u.squareY+.5)*32,b.camX,b.camY);b.onFieldClick(p.x,p.y);}},
  'hud-english':()=>{ds.language=1;b.hud.rebuild();b.refreshInfo();},
  'hud-chinese':()=>{ds.language=18;b.hud.rebuild();b.refreshInfo();},
  capture:()=>{draw();(document.getElementById('capture-preview') as HTMLImageElement).src=canvas.toDataURL('image/png');document.getElementById('capture-figure')!.hidden=false;},
};
for (const [id,fn] of Object.entries(actions)) document.getElementById(id)!.addEventListener('click',async()=>{try{await fn();draw();}catch(e){fail(e);}});
window.addEventListener('keydown',e=>{if(e.code==='F8'){e.preventDefault();try{actions.capture();}catch(error){fail(error);}}});
function draw() {
  b.fieldView.updateWorld(); b.renderFx(); b.fieldView.positionUnits(0,b.animTime); b.updateHoverPath();b.fieldView.positionFloat(0,b.animTime);b.fieldView.renderBlood(0);
  b.fieldView.updateObstacleHover(Input.mouseX,Input.mouseY);b.fieldView.updateCursor(Input.mouseX,Input.mouseY);b.hud.syncMiniFrame();b.hud.syncInputState();b.hud.updateTooltip();
  ctx.clearRect(0,0,880,495);b.screen.render(ctx);
  ready=!(b as any).loadingOverlay?.visible;
  document.getElementById('animation-state')!.textContent = JSON.stringify(animationSnapshot(), null, 2);
  const active=b.order[b.turnIdx];
  state.textContent=(ready?'就绪':'贴图加载中')+' | '+currentScenario+' | '+b.phase+' | 当前 '+active?.name+' AP '+active?.AP+' | 忙碌 '+b.isBusy()+' | 时间 '+b.animTime.toFixed(2)+' | 相机 '+b.camX.toFixed(1)+','+b.camY.toFixed(1)+' | 喷流 '+(b as any).flames.particles.length+' | 弹药 '+(active?.loadedAmmo?.[active.weaponSlot??0]?.amount??0)+' | 路径 '+b.pathCells.length+' | 地面武器 '+[...(b.droppedWeapons??new Map()).values()].reduce((n,a)=>n+a.length,0)+' | 血滴 '+b.fieldView.blood.length+' | 血迹块 '+(b.fieldView as any).bloodTiles.size+' | HUD '+(b.hud.disabled.visible?'锁定':'可操作')+' | 包扎模式 '+b.healingMode+' | 红灯 '+b.hud.healLight.visible+' | 药品 '+b.hud.firstAidName.text+' × '+(b.firstAidKitOf(active)?.amount??0)+' | 拾取 '+b.hud.pickUpItem.text+' | 提示 '+b.hud.tooltipText.text+'\n'+
    b.units.map(u=>{const p=worldToScreen(u.x,u.y,b.camX,b.camY),a=(u as any).__doll;return u.name+' 组 '+b.groupOf(u)+' 阵营 '+(u.side+1)+' HP '+u._HP+'/'+u.maxHP+' 屏幕 '+p.x.toFixed(1)+','+p.y.toFixed(1)+' 动画 '+(a?a.phase+'/'+a.frame:u.transportAnimation?.frame)+' 死亡 '+u.dead+' 临终 '+!!u.dying;}).join('\n')+'\n日志：'+(b as any).messageLog.entries.map((m:any)=>m.text).join(' / ')+'\n字体：'+[...document.fonts].map(f=>f.family+' '+f.status).join(', ')+'\n墙面烟雾：'+(b.fieldView as any).wallHits.size+'\n阴影：'+b.fieldView.shadowLayer.children.length+' / 飞行物阴影 '+b.fieldView.projectileShadowLayer.children.length+'\n音效：'+JSON.stringify(__c2SoundStats())+'\n飞行物：'+(b as any).fx.filter((f:any)=>f.kind==='grenade'||f.kind==='projectile').map((f:any)=>f.kind+' x='+f.x.toFixed(2)+' y='+f.y.toFixed(2)+' z='+f.z.toFixed(2)+' vx='+f.vx+' 引信='+f.counter).join(' / ');
}
let last=performance.now(),acc=0;
function frame(t:number) {try{if((document.querySelector('#run') as HTMLInputElement).checked && ready){acc+=Math.min((t-last)/1000,.1);while(acc>=.04){b.update(.04);acc-=.04;}}draw();}catch(e){fail(e);}last=t;requestAnimationFrame(frame);}
requestAnimationFrame(frame);
