/** Original BattleField.checkHit / obstaclesFromSquares geometry, in map pixels. */
export interface Point { x: number; y: number }
export interface SegmentPoint extends Point { end?: boolean }
export interface Contour<T> { owner: T; points: SegmentPoint[]; height: number }
export interface Contact<T> extends Point { t: number; distance: number; a: Point; b: Point; contour: Contour<T> }
export function contacts<T>(from: Point, to: Point, contours: Contour<T>[]): Contact<T>[] {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  const hits: Contact<T>[] = [];
  if (length < 1e-9) return hits;
  for (const contour of contours) {
    let start = 0;
    const ps = contour.points;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i], b = ps[a.end || i === ps.length - 1 ? start : i + 1];
      if (a.end) start = i + 1;
      const ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const ax = a.x - from.x, ay = a.y - from.y;
      const t = (ax * ey - ay * ex) / den, v = (ax * dy - ay * dx) / den;
      if (t > 1e-7 && t <= 1 && v >= 0 && v <= 1 && !hits.some(h => h.contour === contour && Math.abs(h.t - t) < 1e-7))
        hits.push({ x: from.x + dx * t, y: from.y + dy * t, t, distance: length * t, a, b, contour });
    }
  }
  return hits.sort((a,b) => a.t - b.t);
}
export function transportContour(points: SegmentPoint[], direction: number, width: number, height: number): SegmentPoint[] {
  return points.map(p => {
    const q = direction === 1 ? {x: 2-p.y-width, y:p.x} : direction === 2 ? {x:1-p.x,y:2-p.y-height} : direction === 3 ? {x:p.y,y:1-p.x} : {x:p.x,y:p.y};
    return {...q, end:p.end};
  });
}
export interface Grenade<T> extends Point {
  z: number; vx: number; vy: number; vz: number; counter: number; over: Contour<T>[]; explodeOnImpact: boolean;
}
/** One original 25 Hz EF tick. Velocities are map cells/second, z in pixels. */
export function stepGrenade<T>(g: Grenade<T>, contours: Contour<T>[]): { explode: boolean; wall: boolean; floor: boolean; rotating: boolean } {
  const from = {x:g.x,y:g.y}, prevZ = g.z;
  g.x += g.vx / 25 * 32; g.y += g.vy / 25 * 32; g.z += g.vz / 25 * 32;
  let wall = false, floor = false, impact = false, rotating = true;
  for (const o of g.over) if (g.z < o.height * 32) {
    rotating = false; // BattleField.as _loc38_: resting on an obstacle freezes the pose.
    g.vz = 0; g.vx *= .8; g.vy *= .8; g.z = o.height * 32; wall ||= g.z !== prevZ; impact = true;
  }
  g.vz -= 9.8 / 25;
  for (const h of contacts(from, g, contours)) {
    if (g.z < h.contour.height * 32) {
      const ex = h.b.x-h.a.x, ey=h.b.y-h.a.y, n=Math.hypot(ex,ey), nx=-ey/n, ny=ex/n;
      const dot = g.vx*nx+g.vy*ny;
      g.vx = (g.vx-2*dot*nx)*.6; g.vy=(g.vy-2*dot*ny)*.6;
      g.x=h.x+g.vx*(1-h.t)/25*32; g.y=h.y+g.vy*(1-h.t)/25*32; wall=true; break;
    }
    const i = g.over.findIndex(o => o.owner === h.contour.owner);
    if (i >= 0) g.over.splice(i,1); else g.over.push(h.contour);
  }
  g.counter--;
  if (g.counter > 0 && g.z <= 0) {
    rotating = false;
    g.z = 0;
    g.vx *= .5; g.vy *= .5; g.vz = 0;
    floor = prevZ !== 0;
    impact = true;
  }
  return { explode: g.counter<=0 || g.explodeOnImpact && (impact || wall), wall, floor, rotating };
}

/** Visible angular windows, split at contour vertices and target/occluder crossings. */
export function visibleWindows<T>(from: Point, target: Contour<T>, blockers: Contour<T>[]): { center: number; windows: Array<[number,number]> } {
  const cx=target.points.reduce((v,p)=>v+p.x/target.points.length,0), cy=target.points.reduce((v,p)=>v+p.y/target.points.length,0);
  const center=Math.atan2(cx-from.x,cy-from.y);
  const angle=(p:Point)=>Math.atan2(Math.sin(Math.atan2(p.x-from.x,p.y-from.y)-center),Math.cos(Math.atan2(p.x-from.x,p.y-from.y)-center));
  const angles=target.points.map(angle), lo=Math.min(...angles), hi=Math.max(...angles);
  const bounds={left:Math.min(from.x,...target.points.map(p=>p.x)),right:Math.max(from.x,...target.points.map(p=>p.x)),top:Math.min(from.y,...target.points.map(p=>p.y)),bottom:Math.max(from.y,...target.points.map(p=>p.y))};
  const relevant=blockers.filter(c=>c!==target && Math.max(...c.points.map(p=>p.x))>=bounds.left && Math.min(...c.points.map(p=>p.x))<=bounds.right && Math.max(...c.points.map(p=>p.y))>=bounds.top && Math.min(...c.points.map(p=>p.y))<=bounds.bottom);
  // An overlapping obstacle can change depth order halfway along an edge.
  // Vertex angles alone miss that visibility transition (e.g. a diagonal wall
  // crossing a transport's contour). Include every target/blocker crossing.
  const edges=(ps:SegmentPoint[]):Array<[Point,Point]>=>{
    let start=0; const result:Array<[Point,Point]>=[];
    for(let i=0;i<ps.length;i++) {
      const a=ps[i],b=ps[a.end || i===ps.length-1 ? start : i+1];
      result.push([a,b]); if(a.end) start=i+1;
    }
    return result;
  };
  const targetEdges=edges(target.points), crossingAngles:number[]=[];
  for(const c of relevant) for(const [a,b] of edges(c.points)) for(const [p,q] of targetEdges) {
    const dx=b.x-a.x,dy=b.y-a.y,ex=q.x-p.x,ey=q.y-p.y,den=dx*ey-dy*ex;
    if(Math.abs(den)<1e-9) continue;
    const ax=p.x-a.x,ay=p.y-a.y,t=(ax*ey-ay*ex)/den,v=(ax*dy-ay*dx)/den;
    if(t>=0 && t<=1 && v>=0 && v<=1) crossingAngles.push(angle({x:a.x+t*dx,y:a.y+t*dy}));
  }
  const cuts=[lo,hi,...angles,...crossingAngles,...relevant.flatMap(c=>c.points.map(angle))]
    .filter(a=>a>=lo&&a<=hi).sort((a,b)=>a-b);
  const reach=Math.max(...target.points.map(p=>Math.hypot(p.x-from.x,p.y-from.y)))+1;
  const windows:Array<[number,number]>=[];
  for(let i=1;i<cuts.length;i++) {
    const low=cuts[i-1],high=cuts[i]; if(high-low<1e-9) continue;
    const a=center+(low+high)/2, hit=contacts(from,{x:from.x+Math.sin(a)*reach,y:from.y+Math.cos(a)*reach},[target,...relevant])[0];
    if(hit?.contour===target) {
      const last=windows[windows.length-1];
      if(last && Math.abs(last[1]-low)<1e-9) last[1]=high; else windows.push([low,high]);
    }
  }
  return {center,windows};
}


