import type { DataStore } from "../core/DataStore";

/** 原版 liquidsContainers：液体 ID -> 容器种类与件数，0=可分配，-1=撤出使用。
 * 与旧 Web 的反向液体数量 metadata 分开保存，不能把容器件数当成液体量。 */
export type ContainerAssignments = Record<number, Array<{ type: number; amount: number }>>;
export function liquidGoods(ds: DataStore | undefined, id: number): any {
  const it=ds?.items?.Items?.[id]; return it?.category===1 ? ds?.items.Goods?.[it.subCategory] : null;
}
export function moveContainer(a: ContainerAssignments, type: number, amount: number, from: number, to: number) {
  if(from===to || !Number.isFinite(amount))return;
  const source=a[from]?.find(e=>e.type===type);if(!source)return;
  const n=Math.min(source.amount,Math.max(0,Math.floor(amount)));if(!n)return;
  source.amount-=n; a[from]=a[from].filter(e=>e.amount>0);
  const dest=(a[to]??=[]).find(e=>e.type===type);if(dest)dest.amount+=n;else a[to].push({type,amount:n});
}
export function assignedCapacity(ds: DataStore | undefined, a: ContainerAssignments, transports: any[], liquid: number): number {
  let cap=(a[liquid]??[]).reduce((n,e)=>n+e.amount*(liquidGoods(ds,e.type)?.volume??0),0);
  if(liquid===64)cap+=transports.reduce((n,t)=>n+(ds?.transports?.Types?.[t.type]?.category===3 ? Number(t.fuelTank??ds?.transports?.Types?.[t.type]?.fuelTank??0):0),0);
  return cap;
}
export function liquidStorage(ds: DataStore | undefined, cargo: Map<number,number>, transports: any[], target?: number, previous?: ContainerAssignments, distribute=true) {
  const assignments:ContainerAssignments={0:[],'-1':[]};
  const left=new Map([...cargo].filter(([id])=>liquidGoods(ds,id)?.liquidsContainer).map(([id,n])=>[id,Math.max(0,Math.floor(n))]));
  // 优先保留已装液体的容器；库存减少时再减少空闲/撤出容器。
  const keys=Object.keys(previous??{}).map(Number).sort((a,b)=>(a>0?-1:a===0?0:1)-(b>0?-1:b===0?0:1));
  for(const key of keys)for(const e of previous?.[key]??[]){const n=Math.min(left.get(e.type)??0,Math.max(0,Math.floor(e.amount)));if(n>0){(assignments[key]??=[]).push({type:e.type,amount:n});left.set(e.type,(left.get(e.type)??0)-n);}}
  for(const [type,amount] of left)if(amount>0){const e=assignments[0].find(e=>e.type===type);if(e)e.amount+=amount;else assignments[0].push({type,amount});}
  const liquids=[...new Set([...cargo.keys()].filter(id=>liquidGoods(ds,id)?.liquid).concat(Object.keys(assignments).map(Number).filter(id=>id>0)))];
  const capacity=(id:number)=>assignedCapacity(ds,assignments,transports,id);
  if(distribute){
    // Caravan.arrangeLiquidsContainer：释放整只空瓶，按原版评分优先释放。
    for(const id of liquids){let spare=capacity(id)-(cargo.get(id)??0);
      while(spare>1e-8){const eligible=(assignments[id]??[]).filter(e=>liquidGoods(ds,e.type)?.volume<=spare+1e-8);
        if(!eligible.length)break;const score=(e:{type:number})=>{const g=liquidGoods(ds,e.type);return g.weight/g.volume*100-(spare-g.volume)*5;};eligible.sort((a,b)=>score(b)-score(a));const e=eligible[0];spare-=liquidGoods(ds,e.type).volume;moveContainer(assignments,e.type,1,id,0);}
    }
    for(const id of liquids){let missing=(cargo.get(id)??0)-capacity(id);
      while(missing>1e-8 && assignments[0].length){const score=(e:{type:number})=>{const g=liquidGoods(ds,e.type);return g.volume/Math.max(g.weight,1e-8)/10-Math.abs(g.volume-missing);};const eligible=assignments[0].filter(e=>liquidGoods(ds,e.type)?.volume>0).sort((a,b)=>score(b)-score(a));if(!eligible.length)break;const e=eligible[0];missing-=liquidGoods(ds,e.type).volume;moveContainer(assignments,e.type,1,0,id);}
    }
  }
  // 兼容旧 Web save 的液体数量 metadata，数量始终来自 cargo。
  const buckets:ContainerAssignments={};
  for(const id of liquids){let amount=cargo.get(id)??0;if(amount<=0)continue;
    const add=(key:number,n:number)=>{if(n>1e-9)(buckets[key]??=[]).push({type:id,amount:n});amount-=n;};
    if(id===64)add(0,Math.min(amount,assignedCapacity(ds,{},transports,64)));
    for(const e of assignments[id]??[])add(e.type,Math.min(amount,e.amount*(liquidGoods(ds,e.type)?.volume??0)));
    add(-1,amount);
  }
  const headroom=target===undefined?0:capacity(target)+assignedCapacity(ds,assignments,[],0)-(cargo.get(target)??0);
  return {assignments,buckets,headroom};
}
