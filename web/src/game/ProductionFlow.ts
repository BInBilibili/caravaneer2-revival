// Port of GameData.calculateConsumptionProduction (GameData.as 1108–1359).
// Inputs are daily rates; shared shortages and generator run-times are evaluated together.
export interface FlowAmount { item:number; amount:number }
export interface FlowProducer { consumption?:FlowAmount[]; production?:FlowAmount[]; electricityProduction?:number; electricityConsumption?:number; count?:number }
export function calculateProductionFlow(producers:FlowProducer[], stock:ReadonlyMap<number,number>, days=1) {
  const demand=new Map<number,number>();
  const add=(map:Map<number,number>,item:number,amount:number)=>{if(Number.isFinite(amount)&&amount>0)map.set(item,(map.get(item)??0)+amount);};
  const rows=producers.map(ref=>({ref,count:Math.max(0,ref.count??1),rate:1}));
  for(const row of rows)for(const e of row.ref.consumption??[])add(demand,e.item,e.amount*row.count*days);
  for(const row of rows)for(const e of row.ref.consumption??[]){
    const need=demand.get(e.item)??0;
    if(need>0)row.rate=Math.min(row.rate,Math.max(0,stock.get(e.item)??0)/need);
  }
  const generators=rows.filter(r=>(r.ref.electricityProduction??0)>0&&r.count>0);
  const breaks=[...new Set([0,1,...generators.map(r=>r.rate)])].sort((a,b)=>a-b);
  const powerDemand=rows.reduce((sum,r)=>sum+(r.ref.electricityConsumption??0)*r.count,0);
  let poweredTime=0;
  for(let i=1;i<breaks.length;i++){
    const end=breaks[i],power=generators.filter(r=>r.rate>=end).reduce((sum,r)=>sum+(r.ref.electricityProduction??0)*r.count,0);
    if(power>=powerDemand)poweredTime+=end-breaks[i-1];
  }
  const production=new Map<number,number>(),consumption=new Map<number,number>();
  for(const r of rows){
    if((r.ref.electricityConsumption??0)>0)r.rate=Math.min(r.rate,poweredTime);
    for(const e of r.ref.consumption??[])add(consumption,e.item,e.amount*r.count*r.rate*days);
    for(const e of r.ref.production??[])add(production,e.item,e.amount*r.count*r.rate*days);
  }
  const array=(map:Map<number,number>)=>[...map].map(([item,amount])=>({item,amount}));
  return {production:array(production),consumption:array(consumption),deficit:rows.filter(r=>r.rate<1).map(r=>({producer:r.ref,deficit:1-r.rate})),poweredTime,
    electricityProduction:generators.reduce((sum,r)=>sum+(r.ref.electricityProduction??0)*r.count*r.rate,0),electricityConsumption:powerDemand};
}
