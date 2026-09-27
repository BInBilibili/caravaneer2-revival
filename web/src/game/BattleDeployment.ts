// Deployment port: BattleMode.as 123–215, 581–679; BattleField.as 1477–1575.
export type GridPoint = { x: number; y: number };

export function deploymentRange(category: number, subCategory: number, type: number, skill: number, throwMeters: number): number {
  if (category === 0 || category === 1) return 15;
  if (category === 5) return Math.round(throwMeters) + 10;
  let base = 0;
  if (category === 2) base = [0, 50, 80, 50, 40, 40][subCategory] ?? 0;
  if (category === 3) base = subCategory === 1 ? (type === 23 ? 40 : 70) : subCategory === 2 ? 60 : 0;
  if (category === 4) base = 30;
  return Math.round(base * 0.5 + base * skill / 200);
}

export function deploymentAnchors(size: number, range: number, positions: GridPoint[], overrides: Array<GridPoint | undefined> = []): GridPoint[] {
  const mid = positions.reduce((p, q) => ({ x: p.x + q.x / positions.length, y: p.y + q.y / positions.length }), { x: 0, y: 0 });
  const sides = positions.map(p => {
    const dx = p.x - mid.x, dy = p.y - mid.y;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
  });
  const counts = [0, 0, 0, 0], indices = [0, 0, 0, 0];
  sides.forEach((side, i) => { if (!overrides[i]) counts[side]++; });
  return sides.map((side, i) => {
    if (overrides[i]) return { x: Math.round(overrides[i]!.x), y: Math.round(overrides[i]!.y) };
    const along = Math.round(size / counts[side] * (indices[side]++ + 0.5));
    const near = Math.round(Math.max(size / 2 - range / 2, 0));
    const far = Math.round(Math.min(size / 2 + range / 2 - 1, size - 1));
    return side === 0 ? { x: along, y: near } : side === 1 ? { x: far, y: along } : side === 2 ? { x: along, y: far } : { x: near, y: along };
  });
}

export function facingCenter(x: number, y: number, size: number): number {
  const dx = x - size / 2, dy = y - size / 2;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : dy > 0 ? 0 : 2;
}

/** Same expanding square traversal; full footprint plus one-cell clearance. Never return an occupied fallback. */
export function findDeploymentCell(map: Uint8Array, size: number, anchor: GridPoint, width = 1, height = 1, attached?: { offset: GridPoint; width: number; height: number }): GridPoint | null {
  const clear = (x: number, y: number) => {
    const parts = [{ x, y, width, height }];
    if (attached) parts.push({ x:x+attached.offset.x, y:y+attached.offset.y, width:attached.width, height:attached.height });
    for (const p of parts) for (let cy = p.y - p.height; cy <= p.y + 1; cy++) for (let cx = p.x - p.width; cx <= p.x + 1; cx++) {
      if (cx < 0 || cy < 0 || cx >= size || cy >= size || map[cy * size + cx]) return false;
    }
    return true;
  };
  const ax = Math.max(0, Math.min(size - 1, Math.round(anchor.x))), ay = Math.max(0, Math.min(size - 1, Math.round(anchor.y)));
  if (clear(ax, ay)) return { x: ax, y: ay };
  for (let r = 1; r < size; r++) for (let side = 0; side < 4; side++) for (let k = 1 - r; k <= r; k++) {
    const x = ax + (side === 0 ? k : side === 1 ? r : side === 2 ? -k : -r);
    const y = ay + (side === 0 ? -r : side === 1 ? k : side === 2 ? r : -k);
    if (clear(x, y)) return { x, y };
  }
  return null;
}

export function occupyDeploymentCell(map: Uint8Array, size: number, p: GridPoint, width = 1, height = 1) {
  for (let y = p.y - height + 1; y <= p.y; y++) for (let x = p.x - width + 1; x <= p.x; x++) map[y * size + x] = 1;
}

/** BattleField.addGroup 1330–1353: cart sits immediately behind its draught animal. */
export function cartOffset(direction: number, animal: {width:number;height:number}, cart: {width:number;height:number}): GridPoint {
  return direction === 0 ? {x:(Math.round((cart.width-animal.width)/2)||0),y:cart.height}
    : direction === 1 ? {x:-animal.width,y:(Math.round((cart.height-animal.height)/2)||0)}
    : direction === 2 ? {x:(Math.round((cart.width-animal.width)/2)||0),y:-animal.height}
    : {x:cart.width,y:(Math.round((cart.height-animal.height)/2)||0)};
}

/** BattleField.addGroup: the caravan heading determines the ordered transport line. */
export function transportDirection(anchor:GridPoint,size:number,heading:number):number {
  heading=((heading%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
  return Math.abs(anchor.x-size/2)>Math.abs(anchor.y-size/2)
    ? (heading<Math.PI/2||heading>=Math.PI*1.5?0:2) : heading<=Math.PI?1:3;
}
export function transportFormation(anchor:GridPoint,direction:number,parts:Array<{width:number;height:number;cart?:{width:number;height:number}}>):GridPoint[] {
  const vertical=direction%2===0;
  const spans=parts.map(p=>vertical?p.height+(p.cart?.height??0):p.width+(p.cart?.width??0));
  const total=spans.reduce((a,b)=>a+b,0)+Math.max(0,parts.length-1);
  let x=anchor.x+(direction===1?Math.round(total/2):direction===3?-Math.round(total/2):0);
  let y=anchor.y+(direction===2?Math.round(total/2):direction===0?-Math.round(total/2):0);
  return parts.map((p,i)=>{
    const point={x:Math.round(x+(vertical?-.5+p.width/2:direction===3?p.width-1:0)),y:Math.round(y+(!vertical?-.5+p.height/2:direction===0?p.height-1:0))};
    if(vertical)y+=(direction===0?1:-1)*(spans[i]+1);else x+=(direction===3?1:-1)*(spans[i]+1);
    return point;
  });
}
