import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {discoverMods} from './mod-discovery.mjs';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'c2-mod-discovery-'));
try {
  assert.deepEqual(discoverMods(directory),{mods:[]});
  for(const name of ['first','second mod','invalid'])fs.mkdirSync(path.join(directory,name));
  fs.writeFileSync(path.join(directory,'first/manifest.json'),JSON.stringify({id:'first',version:'1'}));
  fs.writeFileSync(path.join(directory,'second mod/manifest.json'),JSON.stringify({id:'second',version:'1',enabled:false}));
  fs.writeFileSync(path.join(directory,'invalid/manifest.json'),'invalid');
  assert.deepEqual(discoverMods(directory).mods,['mods/first/manifest.json','mods/second%20mod/manifest.json']);
  fs.unlinkSync(path.join(directory,'first/manifest.json'));
  assert.deepEqual(discoverMods(directory).mods,['mods/second%20mod/manifest.json']);
  console.log('PASS discovery: added/removed packages, disabled packages, spaces and invalid folders');
} finally {fs.rmSync(directory,{recursive:true,force:true});}
