// 原版 SharedObject(.sol) 存档导出器
// 反向映射：本项目 SaveData → 原版 generateSave() 快照 → AMF0 → SOL 文件（TCSO 头，未压缩）
import type { SaveData } from "../game/SaveSystem";

// ---------- AMF0 编码 ----------
function encAmf0(v: any, out: number[]): void {
  const push = (n: number[]) => { for (let i = 0; i < n.length; i++) out.push(n[i]); };
  const u16 = (x: number) => push([(x >> 8) & 0xff, x & 0xff]);
  const u32 = (x: number) => push([(x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff]);
  const str = (s: string) => { const b = new TextEncoder().encode(s); u16(b.length); push([...b]); };
  if (typeof v === "number") {
    out.push(0x00);
    const b = new ArrayBuffer(8);
    new DataView(b).setFloat64(0, v);
    push([...new Uint8Array(b)]);
  } else if (typeof v === "boolean") {
    out.push(0x01, v ? 1 : 0);
  } else if (typeof v === "string") {
    out.push(0x02);
    str(v);
  } else if (v === null || v === undefined) {
    out.push(0x05);
  } else if (Array.isArray(v)) {
    out.push(0x0a);
    u32(v.length);
    for (const e of v) encAmf0(e, out);
  } else if (v instanceof Date) {
    out.push(0x0b);
    const b = new ArrayBuffer(8);
    new DataView(b).setFloat64(0, v.getTime());
    push([...new Uint8Array(b)]);
    u16(0);
  } else if (typeof v === "object") {
    out.push(0x03);
    for (const k of Object.keys(v)) { str(k); encAmf0(v[k], out); }
    u16(0);
    out.push(0x09);
  }
}

// ---------- 本项目 SaveData → 原版 save 快照 ----------
function toOriginalPeople(p: Record<string, any>): any {
  const o: Record<string, any> = {};
  for (const k of Object.keys(p)) if (k !== "_HP") o[k] = p[k];
  // 字段名归一（旧档兼容字段 → 原版 variablesToSave 字段名；重构后本身已对齐，双保险）
  if (o.basePhysical === undefined && o.physical !== undefined) o.basePhysical = o.physical;
  if (o.baseAgility === undefined && o.agility !== undefined) o.baseAgility = o.agility;
  if (o.baseAccuracy === undefined && o.accuracy !== undefined) o.baseAccuracy = o.accuracy;
  if (o.baseIntelligence === undefined && o.intelligence !== undefined) o.baseIntelligence = o.intelligence;
  delete o.physical; delete o.agility; delete o.accuracy; delete o.intelligence;
  if (o.Height === undefined && o.height !== undefined) o.Height = o.height;
  delete o.height;
  if (o._weight === undefined && o.weight !== undefined) o._weight = o.weight;
  delete o.weight;
  if (o._morale === undefined && o.morale !== undefined) o._morale = o.morale;
  delete o.morale;
  delete o.weaponItem; delete o.armorItem;
  if (Array.isArray(o.weapons) && o.weapons.length < 2) o.weapons = [o.weapons[0] ?? 0, o.weapons[1] ?? 0];
  o.HP = p._HP ?? 100;
  delete o.passengerIn;
  if (p.passengerIn?.k === "t") o.passengerIn = p.passengerIn.i;
  return o;
}
function toOriginalTransport(t: any): any {
  const o: Record<string, any> = {};
  for (const k of Object.keys(t)) if (k !== "health" && k !== "maxHealth") o[k] = t[k];
  o._health = t.health ?? 1000;
  o._maxHealth = t._maxHealth ?? t.maxHealth ?? 1000;
  for (const key of ["passengerIn", "cart", "attachedTo"]) {
    delete o[key];
    if (t[key]?.k === "t") o[key] = t[key].i;
  }
  o.Passengers = (t.Passengers ?? []).filter((p: any) => p?.k === "t" || p?.k === "p").map((p: any) => ({type:p.k === "t" ? 1 : 2,index:p.i}));
  return o;
}
function toOriginalTown(t: any, tidx: number): any {
  if (!t) return null;
  const o: Record<string, any> = {
    type: tidx, population: t.population, discovered: !!t.discovered, active: t.active !== false,
    tax: t.tax ?? 0, GDPperCapita: t.GDPperCapita ?? null,
    playersStorageSpace: t.playersStorageSpace ?? 0,
    playersStorage: (t.playersStorage??[]).map((e:any)=>({...e})),
    incompleteProduction: (t.incompleteProduction??[]).map((e:any)=>({...e})),
    playersIncompleteProduction: (t.playersIncompleteProduction??[]).map((e:any)=>({...e})),
    historicalData: t.historicalData??[],
    unemployed: t.unemployed ?? 0, electricityPrice: t.electricityPrice ?? 1,
    money: t.money ?? 0, playersMoney: t.playersMoney ?? 0,
  };
  if (Array.isArray(t.people)) o.people = t.people.map(toOriginalPeople);
  if (t.prices && typeof t.prices === "object") o.prices = { ...t.prices };
  o.industries = (t.industries ?? []).map((ind: any) => ({ type: ind.type, employees: ind.employees ?? 0, forSale: !!ind.forSale, maxSize: ind.volume ?? 0 }));
  o.playersIndustries = (t.playersIndustries ?? []).map((ind: any) => ({ type: ind.type, employees: ind.employees ?? 0, maxSize: ind.volume ?? 0 }));
  // 库存合并回 locations[0].stock（简化：单地点）
  const stockArr = (t.stock ?? []).map((s: any) => ({ type: s.item, amount: s.amount }));
  o.stock = stockArr;
  o.locations = [{ category: 1, stock: stockArr }];
  return o;
}

// story.factionRelations 就是原版 .sol 的三角矩阵形状（行 i 恰 i 个元素），故导出直接深拷贝透传。
// factionBaseline 仅用于「老扁平档」兜底：老档存的是 Record<faction, value>（= (faction,0) 的关系），
// 需按基线补齐其余格才能被原版读回。
export function saveDataToOriginal(sd: SaveData, factionBaseline?: number[][]): any {
  const story: any = sd.story ?? {};
  let factionRelations: any = story.factionRelations ?? {};
  if (Array.isArray(factionRelations)) {
    factionRelations = factionRelations.map((row: any) => (Array.isArray(row) ? row.slice() : []));
  } else if (factionBaseline) {
    factionRelations = factionBaseline.map((row) => row.slice());
    for (const [key, v] of Object.entries(story.factionRelations ?? {})) {
      if (typeof v !== "number" || !/^\d+$/.test(key)) continue;
      const fid = Number(key);
      if (fid <= 0) continue;
      if (!factionRelations[fid]) factionRelations[fid] = [];
      factionRelations[fid][0] = v;
    }
  }
  const storyObj: Record<string, any> = {};
  for (const k of Object.keys(story.flags ?? {})) storyObj[k] = story.flags[k];
  storyObj.specificReputations = story.specificReputations ?? {};
  storyObj.acceptedQuests = [...(story.acceptedQuests ?? [])];
  storyObj.completedQuests = [...(story.completedQuests ?? [])];
  storyObj.failedQuests = [...(story.failedQuests ?? [])];
  const car = sd.caravan;
  const cargo = new Map((car.cargo ?? []).map(c => [c.item, c.amount]));
  if (!car.cargoIncludesLiquids) for (const entries of Object.values(car.liquidsContainers ?? {})) for (const e of entries) cargo.set(e.type, (cargo.get(e.type) ?? 0) + e.amount);
  const towns = Array.isArray(sd.towns) ? sd.towns.map(toOriginalTown) : [];
  return {
    GameData: {
      Time: sd.time,
      difficulty: sd.difficulty,
      storyMode: sd.storyMode,
      gameSpeed: sd.gameSpeed,
      mapScale:sd.navigation?.scale??1,mapCenterX:sd.navigation?.centerX??car.x,mapCenterY:sd.navigation?.centerY??car.y,
      routeStart:sd.navigation?.routeStart?{...sd.navigation.routeStart}:null,routeEnd:sd.navigation?.routeEnd?{...sd.navigation.routeEnd}:null,
      lastSextantPos:[...(sd.navigation?.lastSextantPos??[])],lastSextantOffset:sd.navigation?.lastSextantOffset??0,lastSextantMeasurement:sd.navigation?.lastSextantMeasurement??0,sextantExperience:sd.navigation?.sextantExperience??0,
      knownPrices: sd.knownPrices ?? [],
      transportAsPassengers: !!sd.transportAsPassengers,
      ...sd.settings,
      producedToday: sd.producedToday ?? {},
      factionRelations,
      revealedFactions: sd.revealedFactions ?? [],
      Caravans: [{
        x: car.x, y: car.y, direction: car.direction, moving: car.moving, money: car.money,
        Cargo: [...cargo].map(([type, amount]) => ({ type, amount, inUse: car.inUse?.[type] ?? 0 })),
        historicalData: car.historicalData ?? [],
        collectForage: car.collectForage,
        hunt: car.hunt,
        milk: car.milk,
        shear: car.shear,
        autoFillLubricant: car.autoFillLubricant,
        autoFillWater: car.autoFillWater,
        groupSettings: car.groupSettingsAll,
        chargingBatteries: car.chargingBatteries ?? [],
        liquidsContainers: car.liquidContainerAssignments ?? {},
        People: (car.people ?? []).map(toOriginalPeople),
        Transport: (car.transports ?? []).map(toOriginalTransport),
      }],
      Towns: towns,
    },
    Story: storyObj,
  };
}

// ---------- SOL 文件打包 ----------
// TCSO 头：bytes[4..5] = 压缩标志（BE：0x0000=未压缩 / 0x0100=zlib / 0x0200=LZMA），
// bytes[6] = AMF 编码（0=AMF0, 3=AMF3），随后 4 字节填充、u16 内嵌名长度、内嵌名、u32 体长、体。
// 原版 Flash Player 读取时按压缩标志解压（三种均支持），因此未压缩与 zlib 导出均可被原版游戏读取。
function packSolFile(body: Uint8Array, compression: 0 | 1): Blob {
  const name = "savedData";
  const nameBuf = new Uint8Array(name.length * 2);
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    nameBuf[i * 2] = (code >> 8) & 0xff;
    nameBuf[i * 2 + 1] = code & 0xff;
  }
  const head = new Uint8Array(13);
  head[0] = 0x54; head[1] = 0x43; head[2] = 0x53; head[3] = 0x4f; // TCSO
  head[4] = compression; head[5] = 0; // 压缩标志：0x00=未压缩 / 0x01=zlib
  head[6] = 0; // AMF0
  head[11] = (nameBuf.length >> 8) & 0xff;
  head[12] = nameBuf.length & 0xff;
  const lenBuf = new Uint8Array(4);
  lenBuf[0] = (body.length >>> 24) & 0xff;
  lenBuf[1] = (body.length >>> 16) & 0xff;
  lenBuf[2] = (body.length >>> 8) & 0xff;
  lenBuf[3] = body.length & 0xff;
  const all = new Uint8Array(head.length + nameBuf.length + 4 + body.length);
  all.set(head, 0);
  all.set(nameBuf, head.length);
  all.set(lenBuf, head.length + nameBuf.length);
  all.set(body, head.length + nameBuf.length + 4);
  return new Blob([all], { type: "application/octet-stream" });
}

/** 未压缩导出（原版 Flash Player 可读；保持向后兼容的默认路径） */
export function buildSolFile(saves: Array<{ name: string; time: Date; save: any }>): Blob {
  const bodyArr: number[] = [];
  encAmf0({ data: { saves }, timestamp: new Date() }, bodyArr);
  return packSolFile(Uint8Array.from(bodyArr), 0);
}

/**
 * zlib 压缩导出（TCSO 压缩标志 0x0100）。
 * - 原版 Flash Player 读取时按标志解压，可正常读入（zlib 为受支持的压缩类型）；
 * - 本项目 SolImporter 亦支持 0x0100 zlib 解压，往返一致；
 * - 体积约为未压缩的 50-60%（存档 AMF 数据可压缩性好）。
 * 浏览器端使用 CompressionStream("deflate")（zlib 容器，与 SolImporter 的 DecompressionStream 对称）。
 */
export async function buildSolFileCompressed(saves: Array<{ name: string; time: Date; save: any }>): Promise<Blob> {
  const bodyArr: number[] = [];
  encAmf0({ data: { saves }, timestamp: new Date() }, bodyArr);
  const raw = Uint8Array.from(bodyArr);
  const cs = new CompressionStream("deflate");
  const stream = new Blob([raw]).stream().pipeThrough(cs);
  const ab = await new Response(stream).arrayBuffer();
  return packSolFile(new Uint8Array(ab), 1);
}

// 下载辅助
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
