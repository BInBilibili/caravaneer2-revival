// Developer-only AS3 conversion. Installing these ready-made packages needs no script.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Parser} from './as3-literal-parser.mjs';
import {originalDlcZhs} from './original-dlc-zhs.mjs';
const parseAt=(source,offset)=>{const parser=new Parser(source);parser.i=offset;return parser.parseValue();};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const definitions=[['IndustrialMagnate','industrial-magnate','Industrial Magnate'],['SpecialStory','special-story','Special Story'],['WelcomeToGamesOfHonor','welcome-to-games-of-honor','Welcome to Games of Honor']];
const hooks={};
for(const [original,id,name] of definitions){
 const sourceDir=path.join(root,'decompiled',original),out=path.join(root,'web/public/mods',id);
 fs.mkdirSync(path.join(out,'data'),{recursive:true});
 const source=fs.readFileSync(path.join(sourceDir,'scripts',original+'.as'),'utf8');
 const data={gamedata:{originalDlcFeatures:{[id]:true}}},assets={};
 const put=(keys,value)=>{let obj=data;for(const k of keys.slice(0,-1))obj=obj[k]??={};obj[keys.at(-1)]=value;};
 const init=source.split('public function initialize')[1].split('public function remove()')[0];
 const tables={setArmor:['items','Armor'],setGood:['items','Goods'],setWeapon:['weapons','Weapons'],setWeaponAnimationType:['weapons','AnimationTypes'],setDialogueDefault:['mainStory','defaultDefaults'],setCharacterFaction:['mainStory','defaultCharacterFactions'],setLocation:['presets','town_presets',0],setMissionDescription:['gamedata','missionDescriptions']};
 let calls=0;
 for(const match of init.matchAll(/gameRoot\.(set\w+|addTownLocation)\((.*?)\);/gs)){
   const args=parseAt('['+match[2]+']',0),method=match[1];
   if(tables[method])put([...tables[method],args[0]],args[1]);
   else if(method==='setSpriteDimensions'||method==='setSpriteBoundaries')put(['battleDoll',method==='setSpriteDimensions'?'spriteDimensions':'spriteBoundaries',...args.slice(0,-1)],args.at(-1));
   else if(method==='setItem')put(['items','Items',args[0]],{category:args[1],subCategory:args[2]});
   else if(method==='addTownLocation')put(['presets','town_presets',0,args[0],'locations',args[1]],args[2]);
   else throw new Error('Unhandled '+method);
   calls++;
 }
 const sub=fs.readdirSync(path.join(sourceDir,'scripts'),{withFileTypes:true}).find(e=>e.isDirectory()&&fs.existsSync(path.join(sourceDir,'scripts',e.name,'Texts.as')));
 if(sub){
  const dir=path.join(sourceDir,'scripts',sub.name),texts=fs.readFileSync(path.join(dir,'Texts.as'),'utf8');
  data.texts=parseAt(texts,texts.indexOf('=',texts.indexOf('texts:*'))+1);
  const dialogues=fs.readFileSync(path.join(dir,'Dialogues.as'),'utf8');data.dialogues={characterNames:{},entries:{},responses:{}};
  for(const m of dialogues.matchAll(/(characterNames|entries|responses)\[(\d+)\](?:\.(\w+))?\s*=\s*/g)){
    const value=parseAt(dialogues,m.index+m[0].length),table=data.dialogues[m[1]];
    // SpecialStory's original responses 3383/3444 misspell the live entry field.
    // Correct the two assignments, not dialogue strings or unrelated identifiers.
    if(original==='SpecialStory' && ['3383','3444'].includes(m[2]) && m[3]==='actions')
      value.__as3fn=value.__as3fn.replace(/\bcurrentEntrie\s*=/g,'currentEntry =');
    if(m[3]){(table[m[2]]??={})[m[3]]=value;}
    else if(m[1]==='responses')table[m[2]]={value};
    else if(m[1]==='entries'&&value.notNew)table[m[2]]={responses:{$append:value.responses}};
    else table[m[2]]=value;
  }
 }
 const stock=[];
 for(const m of source.matchAll(/gameRoot\.GD\.Towns\[(\d+)\]\.addToStock\((\d+),(\d+),gameRoot\.GD\.Towns\[\d+\]\.playersStorage\);/g))stock.push({town:+m[1],item:+m[2],amount:+m[3]});
 if(stock.length)data.gamedata.originalDlcStock={ [id]:stock };
 const probabilities=[...source.matchAll(/gameRoot\.GD\.setGroupProbabilitiesArea\(([^)]+)\)/g)].map(m=>parseAt('['+m[1]+']',0));
 if(probabilities.length)data.gamedata.originalDlcProbabilities={ [id]:probabilities };
 for(const folder of ['images','sounds']){
   const dir=path.join(sourceDir,folder);if(!fs.existsSync(dir))continue;fs.mkdirSync(path.join(out,folder),{recursive:true});
   for(const filename of fs.readdirSync(dir)){
     const clean=filename.replace(/\.(png|jpg|jpeg)(?:\.\1)+$/i,'.$1');
     const key=clean.replace(/^\d+_/,'').replace(folder==='sounds'?/\.mp3$/i:/$^/,'');
     fs.copyFileSync(path.join(dir,filename),path.join(out,folder,clean));assets[key]=folder+'/'+clean;
     put(['manifest',folder,key],[`mods/${id}/${folder}/${clean}`]);
   }
 }
 if(data.texts) for(const [textId,translations] of Object.entries(data.texts)) {
   if(!originalDlcZhs[textId])throw new Error('Missing Simplified Chinese DLC text: '+textId);
   translations[18]=originalDlcZhs[textId];
 }
 // Industrial Magnate reuses base-game labels; correct the rename verb locally.
 if(original==='IndustrialMagnate')data.texts={'1180':{'18':'改名'}};
 const manifest={id,name,version:'1.0.0',enabled:true,apiVersion:1,data:{},assets};
 for(const [table,value] of Object.entries(data)){const file='data/'+(table==='manifest'?'asset-manifest':table)+'.json';fs.writeFileSync(path.join(out,file),JSON.stringify(value,null,2)+'\n');manifest.data[table]=file;}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const descriptions={IndustrialMagnate:'Unlocks industrial acquisition restrictions and renaming settlements whose industries are all player-owned.',SpecialStory:'Additional conversations and the Drekar warehouse storyline.',WelcomeToGamesOfHonor:'Additional mission, hidden supply location and unique equipment.'};
 if(!fs.existsSync(path.join(out,'description.html')))fs.writeFileSync(path.join(out,'description.html'),`<h1 style="text-align:center;border:1px solid">${name}</h1>\n<p>${descriptions[original]}</p>\n`);
 if(original==='SpecialStory')for(const method of ['onOverTown','releaseDrekarSquad','onMissionCaravanEntersTown']){
   const pos=source.indexOf('public function '+method),brace=source.indexOf('{',pos);
   const parser=new Parser(source);parser.i=brace;parser.skipBalanced('{','}');
   hooks[method]='function():* '+source.slice(brace,parser.i);
 }
 console.log(id,{calls,images:Object.keys(assets).length,texts:Object.keys(data.texts??{}).length,entries:Object.keys(data.dialogues?.entries??{}).length,responses:Object.keys(data.dialogues?.responses??{}).length});
}
fs.writeFileSync(path.join(root,'web/src/game/originalDlcHooks.ts'),'// Original SpecialStory hooks, mechanically extracted; trusted bundled source.\nexport const ORIGINAL_DLC_HOOKS = '+JSON.stringify(hooks)+';\n');
