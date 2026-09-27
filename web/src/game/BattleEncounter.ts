import type { BattleGroup, BattleOpts } from './Battle';
/** Preserve original setMode(2, allies, opponents, neutral, settings, obstacles). */
export function encounterOptions(player:any, allies:any[]=[], opponents:any[]=[], neutral:any[]=[], settings:any={}, obstacles?:any[]): {opts:BattleOpts;owners:any[]} {
  const seen=new Set<any>([player]), entries:Array<{owner:any;band:1|2|3;index:number}>=[];
  let index=0;
  for(const [list,band] of [[allies,1],[opponents,2],[neutral,3]] as const)for(const owner of list??[]){
    const originalIndex=index++;if(!owner||seen.has(owner))continue;seen.add(owner);entries.push({owner,band,index:originalIndex});
  }
  const primary=entries.find(e=>e.band===2);
  const ordered=primary?[primary,...entries.filter(e=>e!==primary)]:entries;
  const normalize=(e:typeof entries[number]):BattleGroup=>{
    const o=e.owner,s=o.squad;
    const people=o.People??o.people??[];
    const cargo=o.cargo instanceof Map?[...o.cargo].map(([item,amount])=>({item,amount:Math.max(0,Number(amount)-Number(o.inUse?.[item]??0))})).filter(c=>c.amount>0):
      Array.isArray(o.Cargo)?o.Cargo.map((c:any)=>({item:c.type??c.item,amount:Math.max(0,Number(c.amount)-Number(c.inUse??o.inUse?.[c.type??c.item]??0))})).filter((c:any)=>c.amount>0):(s?.cargoLoot??[]).map((c:any)=>({...c}));
    // Web map caravans store cash separately; original Cargo can already contain item 97.
    if(!cargo.some((c:any)=>c.item===97)&&Number(o.money??s?.money)>0)cargo.push({item:97,amount:Number(o.money??s?.money)});
    return {band:e.band,name:o.name??s?.name??'',position:{x:o.x??0,y:o.y??0},direction:o.direction??0,
      people,enemySquad:people.length?undefined:s,transports:o.transports??o.Transport??s?.transports??[],
      faction:o.faction??s?.faction??0,cargo,slavePeople:people.length?[]:s?.slavePeople??[]};
  };
  const p=primary?normalize(primary):undefined;
  const groups=ordered.filter(e=>e!==primary).map(normalize);
  const locations=settings?.groupLocations;
  return {owners:[player,primary?.owner,...ordered.filter(e=>e!==primary).map(e=>e.owner)],opts:{
    enemyPeople:p?.people??[],enemySquad:p?.enemySquad,enemyName:p?.name,enemyPosition:p?.position,enemyDirection:p?.direction,
    enemyTransports:p?.transports??[],enemyFaction:p?.faction,lootCargo:p?.cargo??[],slavePeople:p?.slavePeople??[],
    lootOverride:0,additionalGroups:groups,maxRange:settings?.maxRange,fieldWidth:settings?.fieldWidth,fieldHeight:settings?.fieldHeight,
    groupLocations:Array.isArray(locations)?[locations[(allies??[]).indexOf(player)],primary?locations[primary.index]:undefined,...ordered.filter(e=>e!==primary).map(e=>locations[e.index])]:undefined,
    fixedObstacles:obstacles,
  }};
}
