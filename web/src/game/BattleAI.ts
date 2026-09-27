/** BattleField.as 3436–3584: build the original AP/ammo-constrained shot sequence. */
export interface AIMode { AP: number; accuracy?: number; burst?: number; parallelShots?: number; damageMultiplier?: number }
export function rankModes(modes: AIMode[]) {
  let minAP=0, accuracy=0, damage=0;
  modes.forEach((m,i)=>{
    if(m.AP<modes[minAP].AP)minAP=i;
    if((m.accuracy??1)>(modes[accuracy].accuracy??1))accuracy=i;
    const score=(v:AIMode)=>((v.damageMultiplier??0)>0?v.damageMultiplier!:1)*Math.max(v.burst??1,1)*(v.accuracy??1)/Math.max(v.AP,1);
    if(score(m)>score(modes[damage]))damage=i;
  });
  return {minAP,accuracy,damage};
}
export function shotSequence(modes:AIMode[], far:boolean, AP:number, ammo:number, reserve:number, capacity:number, reloadAP:number, hitScore:number) {
  const actions:Array<number|'reload'>=[];
  const prefixes:Array<{score:number;remainingAP:number;length:number}>=[];
  if(!modes.length || hitScore<=0)return {score:0,actions,remainingAP:AP,prefixes};
  const ranks=rankModes(modes), order=far?[ranks.accuracy]:[ranks.damage,...modes.map((_,i)=>i).filter(i=>i!==ranks.damage).sort((a,b)=>modes[b].AP-modes[a].AP)];
  let score=0;
  for(const i of order){const m=modes[i]; if(m.AP<=0)continue;
    while(AP>=m.AP || ammo<=0 && reserve>0 && reloadAP>0 && AP>=reloadAP){
      const previous=score;
      if(ammo<=0){
        if(reserve<=0 || capacity<=0 || reloadAP<=0 || AP<reloadAP)break;
        AP-=reloadAP;const take=Math.min(capacity,reserve);reserve-=take;ammo=take;
        actions.push('reload');score=previous+50;prefixes.push({score,remainingAP:AP,length:actions.length});
        if(AP<m.AP)break;
      }
      const shots=Math.max(m.burst??1,1)*Math.max(m.parallelShots??1,1);
      ammo-=shots;AP-=m.AP;actions.push(i);
      // Original 3539 uses the score BEFORE this iteration's reload.
      score=previous+Math.pow(hitScore,1.5)*shots*(m.accuracy??1)*((m.damageMultiplier??0)>0?m.damageMultiplier!:1)*10;
      prefixes.push({score,remainingAP:AP,length:actions.length});
    }
  }
  return {score,actions,remainingAP:AP,prefixes};
}
/** Original panic considers every living non-neutral actor, including former friends. */
export function panicDanger(x:number,y:number,actors:Array<{squareX:number;squareY:number}>) {
  return actors.reduce((s,u)=>s+2000/Math.pow(Math.hypot(u.squareX-x,u.squareY-y),1.5),0);
}
