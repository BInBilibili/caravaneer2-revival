import { Character, peopleWarPower } from "./World";

// MapMode.as:7881-8008 and Caravan.as:1254-1321. No player battle is resolved here.
const roster = (c: any): any[] => c.People ?? (c.squad ? c.squad.people : c.people) ?? [];
const person = (p: any): Character => {
  if (p instanceof Character) return p;
  // EnemyPersonSpec is a persisted combat record, not a new random character.
  const {maxHP, ...init} = p;
  return new Character({...init, ...p.skillExperience});
};
// 原版 Caravan.visualWarPower / actualWarPower（Caravan.as:1254-1321）：actual 才含 physical/accuracy/maxAP/√gBE。
export function worldWarPower(c: any, ds: any, actual = false): number {
  return peopleWarPower(roster(c), ds, actual, actual ? person : undefined);
}
export function checkWorldBehavior(gd: any, a: any, b: any, distance = Math.hypot(a.x-b.x,a.y-b.y)): number {
  if (gd.storyMode && a.faction === 2 && gd.Story?.accompanyedByThum) return 0;
  const relation = gd.getFactionRelations(a.faction ?? 0, b.faction ?? 0);
  if (relation > -3) return 0;
  const ratio = (a.fearless ? Infinity : worldWarPower(a,gd.ds)) / Math.max(worldWarPower(b,gd.ds),.001) * (a.morale ?? 50) / 50;
  const d = Math.max(distance,.001), speed = Math.max(b.speedKmh ?? b.speed ?? 0,.001);
  const types = gd.ds.presets?.caravan_types?.[0];
  const aggressiveA = a.aggressive ?? types?.[a.type ?? 0]?.aggressive ?? false;
  const aggressiveB = b.aggressive ?? types?.[b.type ?? 0]?.aggressive ?? false;
  if (aggressiveA && ratio > .5 && relation * ratio < -10) return -relation * ratio / d / speed;
  if (aggressiveB && relation / ratio < -10 && ratio < .7) return 1 / relation / ratio / d * speed;
  return 0;
}
const angle = (a: any,b: any) => Math.atan2(b.x-a.x,a.y-b.y);
const tau = 2 * Math.PI;
const deflections = new WeakSet<object>();
export function steerWorldNpcs(gd: any): void {
  const all = [...gd.npcCaravans,gd.Caravans[0]];
  for (const a of gd.npcCaravans) {
    if (a.category === 5) continue; // Original route caravans keep their itinerary.
    const victims: {target:any; strength:number}[] = [], attackers: number[] = [];
    const sight = Math.max(0,...roster(a).map(p=>person(p).sight));
    for (const b of all) {
      if (a === b || b.category === 5 || b.overTown != null) continue;
      // Original nearby-square search, followed by actual visibility (not sqrt(distance)).
      if (Math.abs(Math.floor(a.x/500)-Math.floor(b.x/500))>1 || Math.abs(Math.floor(a.y/500)-Math.floor(b.y/500))>1) continue;
      const d = Math.hypot(a.x-b.x,a.y-b.y);
      if (d > (b.noticeability ?? 150)*sight) continue;
      const score = checkWorldBehavior(gd,a,b,d);
      if (score>0 && !a.concentrated) victims.push({target:b,strength:score});
      if (score<0 && a.overTown == null && !b.concentrated) attackers.push((angle(a,b)+tau)%tau);
    }
    a.chasing = false;
    if (attackers.length) {
      attackers.sort((a,b)=>a-b);
      let biggest = -1, direction = 0;
      attackers.forEach((v,i)=>{const gap=(attackers[i+1]??attackers[0]+tau)-v;if(gap>biggest){biggest=gap;direction=v+gap/2;}});
      a.direction=direction; a.moving=true; deflections.add(a);
    } else if (victims.length) {
      victims.sort((a,b)=>b.strength-a.strength);
      for (let i=0;i<victims.length;i++) {
        const b=victims[i].target, direct=angle(a,b), own=Math.max(a.speedKmh,.001), speed=b.speedKmh??b.speed??0;
        let beta=direct-(b.direction??0); while(beta>Math.PI)beta-=tau;while(beta< -Math.PI)beta+=tau;
        if (!b.moving) {a.direction=direct;break;}
        if(Math.abs(beta)>Math.PI/2 || speed<=own) {
          const gamma=Math.asin(speed/own*Math.sin(beta));
          if(!Number.isNaN(gamma)){a.direction=direct-gamma;break;}
        } else if(i===victims.length-1 && speed/own<1.5) {a.direction=direct;break;}
      }
      a.moving=true; a.chasing=true; deflections.add(a);
    } else if(deflections.has(a)) {
      // Resume town navigation after a chase/flee diversion, never invent a new route.
      if(a.routePoints?.length)a.direction=null;
      deflections.delete(a);
    }
  }
}
export function resolveWorldNpcContacts(gd: any): void {
  const removed = new Set<any>(), list = [...gd.npcCaravans];
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++) {
    const a=list[i],b=list[j];
    if(removed.has(a)||removed.has(b)||a.category===5||b.category===5)continue;
    const d=Math.hypot(a.x-b.x,a.y-b.y);
    if(d>16 || !(checkWorldBehavior(gd,a,b,d)>0 || checkWorldBehavior(gd,b,a,d)>0))continue;
    const pa=worldWarPower(a,gd.ds,true)*(.8+Math.random()*.4),pb=worldWarPower(b,gd.ds,true)*(.8+Math.random()*.4);
    const winner=pa>pb?a:b, loser=pa>pb?b:a;
    const risk=Math.min(pa,pb)/Math.max(pa,pb,.001);
    loser.active=false;
    removed.add(loser);
    const people=roster(winner);
    for(const p of people) {
      const ch=person(p);
      if((p.specialPurpose??0)<=0 && Math.random()<risk) p._HP=ch.HP-Math.round(ch.maxHP*risk*risk*Math.pow(Math.random(),4)*3);
    }
    for(let k=people.length-1;k>=0;k--)if(people[k]._HP<=0) {
      const purpose=people[k].specialPurpose;
      if(gd.Story) {
        if(purpose===1)gd.Story.accompanyedByThum=false;
        if(purpose===2)gd.executeMajorEvent(38);
        if(purpose===3)gd.Story.spencerRiceIsDead=true;
        if(purpose===9)gd.Story.eliahsManDead=true;
        if(purpose===11)gd.Story.noraIsDead=true;
      }
      const passenger=people[k].passengerIn;
      if(passenger?.Passengers)passenger.Passengers=passenger.Passengers.filter((p:any)=>p!==people[k]);
      people.splice(k,1);
    }
    winner.defenders=people.length;
    if(!people.length){winner.active=false;removed.add(winner);}
    else {
      const walkers=people.filter(p=>!p.passengerIn).map(p=>person(p).speed);
      const transports=(winner.transports??[]).filter((t:any)=>!t.passengerIn)
        .map((t:any)=>t.speed??gd.ds.transports?.Types?.[t.type]?.speed??Infinity);
      const speed=Math.min(...walkers,...transports);
      if(Number.isFinite(speed))winner.speedKmh=speed;
    }
  }
  // Original loser becomes inactive: remove it from this Web active-only list (also saved).
  gd.npcCaravans=gd.npcCaravans.filter((n:any)=>!removed.has(n));
}
