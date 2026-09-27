
const fs = require("fs");
function enc(v) {
  const out = [];
  const push = (n) => { for (let i = 0; i < n.length; i++) out.push(n[i]); };
  const u16 = (x) => push([(x >> 8) & 0xff, x & 0xff]);
  const u32 = (x) => push([(x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff]);
  const str = (s) => { const b = Buffer.from(s, "utf8"); u16(b.length); push([...b]); };
  if (typeof v === "number") { out.push(0x00); const b = Buffer.alloc(8); b.writeDoubleBE(v); push([...b]); }
  else if (typeof v === "boolean") { out.push(0x01, v ? 1 : 0); }
  else if (typeof v === "string") { out.push(0x02); str(v); }
  else if (v === null || v === undefined) { out.push(0x05); }
  else if (Array.isArray(v)) { out.push(0x0a); u32(v.length); for (const e of v) push(enc(e)); }
  else if (v instanceof Date) { out.push(0x0b); const b = Buffer.alloc(8); b.writeDoubleBE(v.getTime()); push([...b]); u16(0); }
  else if (typeof v === "object") {
    out.push(0x03);
    for (const k of Object.keys(v)) { str(k); push(enc(v[k])); }
    u16(0); out.push(0x09);
  }
  return out;
}
// 两个城镇快照：0 号有价格/库存/产业，15 号（Your Bunker）已发现
const town0 = {
  type: 0, population: 253, unemployed: 12, discovered: true, tax: 0, GDPperCapita: 300,
  playersStorageSpace: 50, prices: { 1: 1.5, 45: 24, 62: 9 },
  industries: [{ type: 2, employees: 20, forSale: false, maxSize: 30 }],
  playersIndustries: [{ type: 5, employees: 8, maxSize: 10 }],
  locations: [{ category: 1, stock: [{ type: 1, amount: 500 }, { type: 45, amount: 120 }, { type: 62, amount: 300 }] }],
};
const town15 = { type: 15, population: 30, discovered: true, GDPperCapita: 150, prices: {}, industries: [], locations: [{ category: 1, stock: [{ type: 1, amount: 40 }] }] };
const save = {
  GameData: {
    Time: 2509600000, difficulty: 1, storyMode: true, gameSpeed: 1,
    factionRelations: { 1: 20, 2: -10 },
    Caravans: [{
      x: -10000, y: -900, direction: 1.2, moving: true, money: 45200,
      Cargo: [{ type: 1, amount: 12.5 }, { type: 45, amount: 30 }, { type: 62, amount: 80 }],
      People: [{ name: "TestHero", gender: 1, age: 32, physical: 14, agility: 12, accuracy: 11, intelligence: 13, HP: 190, salary: 0, weapons: [18], category: 1 }],
      Transport: [{ type: 1, _health: 1200, _maxHealth: 1500, gender: 2, age: 800, weight: 160 }],
    }],
    Towns: [town0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, town15],
  },
  Story: { mainMissionAccepted: true, firstZoneResolved: false, specificReputations: { 0: 5, 1: -3 }, acceptedQuests: [2, 7] },
};
const data = { data: { saves: [{ name: "Original Save 1", time: new Date("2024-01-15T10:30:00Z"), save }] }, timestamp: new Date() };
const body = enc(data);
const nameB = Buffer.from("savedData", "utf16le");
const nameBE2 = Buffer.alloc(nameB.length);
for (let i = 0; i < nameB.length; i += 2) { nameBE2[i] = nameB[i + 1]; nameBE2[i + 1] = nameB[i]; }
const head = Buffer.alloc(13);
head.write("TCSO", 0, "ascii");
head.writeUInt16BE(0x0000, 4);
head[6] = 0;
head.writeUInt16BE(nameBE2.length, 11);
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32BE(body.length, 0);
const file = Buffer.concat([head, nameBE2, lenBuf, Buffer.from(body)]);
fs.writeFileSync("D:/game/Caravaneer 2 deepseek/web/public/test_original_save.sol", file);
console.log("written", file.length, "bytes; body", body.length);
