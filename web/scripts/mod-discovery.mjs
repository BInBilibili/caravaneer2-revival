import fs from 'node:fs';
import path from 'node:path';

/** Discover web packages, never execute code while scanning. */
export function discoverMods(directory) {
  if(!fs.existsSync(directory))return {mods:[]};
  const mods=[];
  for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    if(!entry.isDirectory()||entry.isSymbolicLink())continue;
    const file=path.join(directory,entry.name,'manifest.json');
    try {
      const manifest=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
      if(typeof manifest.id!=='string'||!manifest.id||typeof manifest.version!=='string')continue;
      mods.push(`mods/${encodeURIComponent(entry.name)}/manifest.json`);
    } catch { /* Non-packages and incomplete folders are ignored. */ }
  }
  return {mods};
}

export function modDiscoveryPlugin() {
  let config;
  const middleware=directory=>(req,res,next)=>{
    if((req.url??'').split('?')[0]!=='/mods/index.json')return next();
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.end(JSON.stringify(discoverMods(directory)));
  };
  return {
    name:'local-mod-discovery',
    configResolved(value){config=value;},
    configureServer(server){server.middlewares.use(middleware(path.join(config.publicDir,'mods')));},
    configurePreviewServer(server){server.middlewares.use(middleware(path.resolve(config.root,config.build.outDir,'mods')));},
    closeBundle(){
      // Static hosts cannot list local folders: ship a generated index at build time.
      const dir=path.resolve(config.root,config.build.outDir,'mods');
      if(!fs.existsSync(dir))return;
      fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify(discoverMods(dir),null,2)+'\n');
    },
  };
}
