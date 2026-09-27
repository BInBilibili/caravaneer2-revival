// Stock-backed town and player-industry cycles, ported from MapMode.as 4818–5257.
import type { DataStore } from '../core/DataStore';
import type { Town } from './World';
import { Economy, categoryAverages } from './Economy';
import { itemDefinition, itemWeightKg } from './ItemMetrics';
import { calculateProductionFlow, type FlowAmount, type FlowProducer } from './ProductionFlow';

export function settleTownEconomy(town:Town,ds:DataStore,time:number,random= Math.random) {
  const point={time,production:[] as FlowAmount[],consumption:[] as FlowAmount[],playersProduction:[] as FlowAmount[],playersConsumption:[] as FlowAmount[]};
  const add=(rows:FlowAmount[],item:number,amount:number)=>{if(amount<=0||!Number.isFinite(amount))return;const row=rows.find(e=>e.item===item);if(row)row.amount+=amount;else rows.push({item,amount});};
  const producers=(industries:Town['playersIndustries']):FlowProducer[]=>industries.flatMap(ind=>{
    const type=ds.industries.Types[ind.type];return type?[{consumption:type.consumption,production:type.production,count:Math.max(0,ind.employees)}]:[];
  }); // Industry buys grid power in its operating expenses; it is not an Item generator.
  const price=(id:number,amount:number,buy:boolean)=>amount>0?Economy.price(ds,town,id,amount,buy):0;
  const consume=(id:number,need:number)=>{const n=Math.min(Math.max(0,need),town.stock.get(id)??0);if(n>0){town.addToStock(id,-n);add(point.consumption,id,n);}return n;};
  const finish=(production:FlowAmount[],carry:FlowAmount[],deliver:(id:number,n:number)=>void)=>{
    const pending:FlowAmount[]=[];for(const e of [...production,...carry])add(pending,e.item,e.amount);
    carry.length=0;for(const e of pending){const n=Math.floor(e.amount+1e-10),fraction=Math.max(0,e.amount-n);if(fraction>1e-9)carry.push({item:e.item,amount:fraction});if(n>0)deliver(e.item,n);}
  };
  // Forecasts remain forecasts. The journal records the actual shared-input flow, not net demand.
  town.getConsumptionProduction(ds);
  const municipal=calculateProductionFlow(producers(town.industries),town.stock,.5);
  for(const e of municipal.consumption)consume(e.item,e.amount);
  for(const e of municipal.production)add(point.production,e.item,e.amount);
  finish(municipal.production,town.incompleteProduction,(id,n)=>{if(id===97)town.money+=n;else town.addToStock(id,n);});
  const averages=categoryAverages(ds);
  let foodNeed=town.totalFoodConsumption*.5,waterNeed=town.totalWaterConsumption*.5;
  const foods=[...town.stock].flatMap(([id,amount])=>{
    const data=itemDefinition(ds,id);if(!data?.food||!(data.calories>0)||amount<=0)return [];
    const diff=price(id,1,true)/data.calories-(averages.food??0)*town.wealthFactor;
    return [{id,amount,data,difference:Math.abs(diff>0?diff*5:diff)}];
  });
  const minimum=Math.max(.00001,Math.min(...foods.map(f=>f.difference))),chunk=foodNeed/Math.max(foods.length,1);
  while(foods.length&&foodNeed>1e-8){
    let progress=0;
    for(let i=0;i<foods.length&&foodNeed>1e-8;i++){
      const f=foods[i],kcal=foods.length===1?foodNeed:Math.min(foodNeed,chunk/Math.max(.01,Math.min(f.difference/minimum,10))*(.5+random()));
      const n=consume(f.id,Math.min(f.amount,kcal/f.data.calories));
      f.amount-=n;foodNeed-=n*f.data.calories;waterNeed-=n*(f.data.waterPercentage??0);progress+=n;
      if(f.amount<=1e-8)foods.splice(i--,1);
    }
    if(progress<=1e-12)break;
  }
  // Unlike the old Web forecast log, do not log water that is absent from stock.
  consume(1,waterNeed);
  for(const category of ds.gamedata?.itemCategories??[]){
    if(category==='food')continue;
    let remaining=Number((town as any)[category+'Consumption']??0);if(remaining<=0)continue;
    const goods=[...town.stock].flatMap(([id,amount])=>{
      if(!itemDefinition(ds,id)?.[category]||amount<=0)return [];
      const p=price(id,1,true),diff=p-(averages[category]??0)*town.wealthFactor;
      return [{id,amount,price:p,difference:Math.abs(diff>0?diff*5:diff)}];
    });
    const maximum=Math.max(0,...goods.map(g=>g.difference)),equal=goods.every(g=>g.difference===maximum);
    const unit=Math.min(Math.max(remaining/Math.max(goods.length,1),1),remaining);
    let budget=remaining*(averages[category]??0)*town.wealthFactor*1.1;
    // The reference performs one pass through the category, including its unit rounding.
    for(const g of goods){
      const amount=goods.length===1?Math.ceil(remaining):Math.round(unit*random()*(equal?1:1-g.difference/maximum));
      const n=consume(g.id,Math.min(amount,g.amount,g.price>0?Math.floor(budget/g.price):amount));
      remaining-=n;budget-=n*g.price;
    }
  }
  for(const e of town.generatePopulationConsumption())consume(e.item,e.amount*.5);

  const playerProducers=producers(town.playersIndustries);
  const inputs:FlowAmount[]=[],outputs:FlowAmount[]=[];
  for(const p of playerProducers){for(const e of p.consumption??[])add(inputs,e.item,e.amount*(p.count??1)*.5);for(const e of p.production??[])add(outputs,e.item,e.amount*(p.count??1)*.5);}
  // Net products are the first things sold to finance missing inputs or half-day operating expenses.
  for(const input of inputs){const output=outputs.find(o=>o.item===input.item);if(output){const n=Math.min(input.amount,output.amount);input.amount-=n;output.amount-=n;}}
  const need=inputs.filter(e=>e.amount>0),netProducts=outputs.filter(e=>e.amount>0).sort((a,b)=>price(b.item,1,false)/Math.max(itemDefinition(ds,b.item)?.price??1,1e-8)-price(a.item,1,false)/Math.max(itemDefinition(ds,a.item)?.price??1,1e-8));
  const stored=(id:number)=>town.playersStorage.find(e=>e.type===id)?.amount??0;
  const sell=(id:number,amount:number,fromStorage=true)=>{
    amount=Math.max(0,Math.min(amount,fromStorage?stored(id):amount));
    if(!itemDefinition(ds,id)?.divisible)amount=Math.floor(amount);if(amount<=0)return 0;
    const revenue=price(id,amount,false);if(fromStorage)town.removeFromPlayersStorage(id,amount);
    town.addToStock(id,amount);town.playersMoney+=revenue;town.money-=revenue;return revenue;
  };
  const amountForMoney=(id:number,money:number,cap:number,buy:boolean)=>{
    if(money<=0||cap<=0)return 0;if(price(id,cap,buy)<=money)return cap;
    let lo=0,hi=cap;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(price(id,mid,buy)>money)hi=mid;else lo=mid;}return lo;
  };
  const buys=need.map(e=>({item:e.item,amount:Math.min(Math.max(0,e.amount-stored(e.item)),town.stock.get(e.item)??0)})).filter(e=>e.amount>0);
  let shortfall=buys.reduce((n,e)=>n+Math.max(0,price(e.item,e.amount,true)-town.playersMoney),0);
  const sellable:FlowAmount[]=[];
  for(const s of town.playersStorage){
    const input=need.find(e=>e.item===s.type),output=netProducts.find(e=>e.item===s.type);
    if(input){const n=s.amount-input.amount;if(n>1||itemDefinition(ds,s.type)?.divisible)add(sellable,s.type,Math.max(0,n));}
    else if(output&&(output.amount>1||itemDefinition(ds,s.type)?.divisible))sellable.unshift({item:s.type,amount:Math.min(s.amount,output.amount)});
  }
  for(const e of sellable){if(shortfall<=0)break;const n=Math.min(e.amount,Math.ceil(amountForMoney(e.item,shortfall,e.amount,false)));shortfall-=sell(e.item,n);}
  const totalCost=buys.reduce((n,e)=>n+price(e.item,e.amount,true),0),ratio=totalCost>0?Math.max(0,Math.min(1,town.playersMoney/totalCost)):0;
  for(const e of buys){
    let amount=Math.min(e.amount*ratio,amountForMoney(e.item,town.playersMoney,e.amount,true));
    if(!itemDefinition(ds,e.item)?.divisible)amount=Math.floor(amount);
    if(amount<=0)continue;const cost=price(e.item,amount,true);town.addToStock(e.item,-amount);town.addToPlayersStorage(e.item,amount);town.playersMoney-=cost;town.money+=cost;
  }
  const flow=calculateProductionFlow(playerProducers,new Map(town.playersStorage.map(e=>[e.type,e.amount])),.5);
  for(const e of flow.consumption){town.removeFromPlayersStorage(e.item,e.amount);add(point.playersConsumption,e.item,e.amount);}
  for(const e of flow.production)add(point.playersProduction,e.item,e.amount);
  finish(flow.production,town.playersIncompleteProduction,(id,n)=>{
    if(id===97){town.playersMoney+=n;return;}
    const weight=itemWeightKg(ds,id),space=Math.max(0,town.playersStorageSpace-town.occupiedPlayersStorageSpace);
    const kept=weight>0?Math.min(n,Math.floor(space/weight)):n;
    if(kept>0)town.addToPlayersStorage(id,kept);
    // Sell only the new overflow, never remove a second copy from existing storage.
    if(n>kept)sell(id,n-kept,false);
  });
  town.playersMoney-=town.playersIndustries.reduce((n,ind)=>n+town.industryTotalExpenses(ind.type,ind.employees,ds)*.5,0);
  for(const e of netProducts){
    if(town.playersMoney>=0)break;const n=Math.min(stored(e.item),Math.ceil(amountForMoney(e.item,-town.playersMoney,stored(e.item),false)));sell(e.item,n);
  }
  town.historicalData.unshift(point);if(town.historicalData.length>60)town.historicalData.length=60;
  town.cpCache=null;
  return point;
}
