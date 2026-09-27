// 原版 SharedObject(.sol) 存档导入器
// 格式：TCSO 头 + AMF0 对象（{data: {saves:[{name,time,save:...}]}}），body 可 zlib 压缩
// 映射原版 generateSave() 快照 → 本项目 SaveData
import type { SaveData } from "../game/SaveSystem";

// ---------- AMF0 解码 ----------
interface AmfReader {
  u8(): number;
  u16(): number;
  u32(): number;
  f64(): number;
  bytes(n: number): Uint8Array;
  pos: number;
  len: number;
}

function makeReader(buf: Uint8Array): AmfReader {
  let pos = 0;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    get pos() { return pos; },
    set pos(v: number) { pos = v; },
    get len() { return buf.length; },
    u8() { return buf[pos++]; },
    u16() { const v = dv.getUint16(pos); pos += 2; return v; },
    u32() { const v = dv.getUint32(pos); pos += 4; return v; },
    f64() { const v = dv.getFloat64(pos); pos += 8; return v; },
    bytes(n: number) { const b = buf.slice(pos, pos + n); pos += n; return b; },
  };
}

function readUtf8(r: AmfReader, len: number): string {
  const b = r.bytes(len);
  try { return new TextDecoder().decode(b); } catch { return ""; }
}

function readAmf0(r: AmfReader, depth = 0): any {
  if (depth > 24) return null;
  const type = r.u8();
  switch (type) {
    case 0x00: return r.f64();               // number
    case 0x01: return r.u8() !== 0;          // boolean
    case 0x02: return readUtf8(r, r.u16());  // string
    case 0x03: {                              // object
      const o: Record<string, any> = {};
      for (;;) {
        const klen = r.u16();
        if (klen === 0) { r.u8(); break; }    // 0x00 0x00 + 0x09 end
        const k = readUtf8(r, klen);
        o[k] = readAmf0(r, depth + 1);
      }
      return o;
    }
    case 0x04: {                              // movieclip（同 object）
      const o: Record<string, any> = {};
      for (;;) {
        const klen = r.u16();
        if (klen === 0) { r.u8(); break; }
        const k = readUtf8(r, klen);
        o[k] = readAmf0(r, depth + 1);
      }
      return o;
    }
    case 0x05: return null;                  // null
    case 0x06: return undefined;             // undefined
    case 0x07: return null;                  // reference（简化）
    case 0x08: {                              // ECMA array
      r.u32(); // count（忽略）
      const o: Record<string, any> = {};
      for (;;) {
        const klen = r.u16();
        if (klen === 0) { r.u8(); break; }
        const k = readUtf8(r, klen);
        o[k] = readAmf0(r, depth + 1);
      }
      return o;
    }
    case 0x09: return null;                  // object end（不应出现）
    case 0x0A: {                              // strict array
      const n = r.u32();
      const arr: any[] = [];
      for (let i = 0; i < n; i++) arr.push(readAmf0(r, depth + 1));
      return arr;
    }
    case 0x0B: {                              // date
      r.f64();
      r.u16();
      return null; // 时间戳简化处理（日期不作为关键数据）
    }
    case 0x0C: return readUtf8(r, r.u32());  // long string
    case 0x0F: return readUtf8(r, r.u32());  // XML
    case 0x10: {                              // typed object（class name + object）
      readUtf8(r, r.u16());
      const o: Record<string, any> = {};
      for (;;) {
        const klen = r.u16();
        if (klen === 0) { r.u8(); break; }
        const k = readUtf8(r, klen);
        o[k] = readAmf0(r, depth + 1);
      }
      return o;
    }
    case 0x11: {                              // AMF3 数据（SharedObject 用 AMF0 居多，简化跳过）
      return readAmf3(r, depth + 1);
    }
    default:
      return null;
  }
}

// ---------- AMF3 最小支持（SharedObject encoding=3 时使用） ----------
function readAmf3(r: AmfReader, depth = 0): any {
  if (depth > 24) return null;
  const type = r.u8();
  const u29 = (): number => {
    let v = r.u8(), n = 0;
    if (v & 0x80) { v = (v & 0x7f) | (r.u8() << 7); n = 7; if (v & 0x4000) { v = (v & 0x3fff) | (r.u8() << 14); n = 14; if (v & 0x200000) { v = (v & 0x1fffff) | (r.u8() << 21); n = 21; } } }
    if (v & (1 << n)) v |= 0xffffffff << (n + 1);
    return v;
  };
  switch (type >> 3) {
    case 0: return null;                      // undefined
    case 1: return null;                      // null
    case 2: return false;                     // false
    case 3: return true;                      // true
    case 4: return u29();                     // integer
    case 5: return r.f64();                   // double
    case 6: {                                 // string
      const l = u29();
      return l & 1 ? "" : readUtf8(r, l >> 1);
    }
    case 7: {                                 // XML
      const l = u29();
      return readUtf8(r, l >> 1);
    }
    case 8: {                                 // date
      const l = u29();
      if (!(l & 1)) return null;
      r.f64();
      return null;
    }
    case 9: {                                 // array
      const l = u29();
      if (l & 1) {
        const n = l >> 1;
        const dense: any[] = [];
        for (let i = 0; i < n; i++) dense.push(readAmf3(r, depth + 1));
        return dense;
      }
      return null;
    }
    case 10: {                                // object
      const l = u29();
      if (l & 1) {
        const n = l >> 1;
        const o: Record<string, any> = {};
        for (let i = 0; i < n; i++) {
          const k = readAmf3(r, depth + 1);
          if (typeof k === "string") o[k] = readAmf3(r, depth + 1);
        }
        return o;
      }
      return null;
    }
    default: return null;
  }
}

// ---------- LZMA 解码（LZMA-alone 容器，同 SWF LZMA tag / .sol 0x0200） ----------
// 最小移植自 LZMA SDK（Igor Pavlov，公有领域）。容器布局（与 LzmaAlone / SWF LZMA tag 一致）：
//   [0]      1 字节属性：props = lc + lp*9 + pb*9*5（lc∈[0,8] lp∈[0,4] pb∈[0,4]）
//   [1..4]   4 字节字典大小 u32 LE
//   [5..12]  8 字节未压缩长度 u64 LE
//   [13..]   LZMA 压缩流（RangeCoder + 状态机）
// 参考压缩器（生成测试夹具用）：tools/ffdec/lib/LZMA.jar 的 SevenZip.LzmaAlone
// （官方 LZMA SDK Java 移植，含 Encoder/Decoder，无外部依赖；环境无网络时用它产出参照流）。
// 注意：LZMA-alone 无校验和，损坏流会解码出垃圾数据——与原版 Flash Player 行为一致，接受即可。

const kNumStates = 12;
const kNumPosBitsMax = 4;
const kNumPosStatesMax = 1 << kNumPosBitsMax;      // 16
const kNumLenToPosStates = 4;
const kMatchMinLen = 2;
const kNumLenLowBits = 3;
const kNumLenLowSymbols = 1 << kNumLenLowBits;      // 8
const kNumLenMidBits = 3;
const kNumLenMidSymbols = 1 << kNumLenMidBits;      // 8
const kNumLenHighBits = 8;
const kNumLenHighSymbols = 1 << kNumLenHighBits;    // 256
const kNumLitStates = 7;
const kStartPosModelIndex = 4;
const kEndPosModelIndex = 14;
const kNumFullDistances = 1 << (kEndPosModelIndex >> 1); // 128
const kNumDistSlotBits = 6;
const kNumDistSlotSymbols = 1 << kNumDistSlotBits;  // 64
const kAlignBits = 4;
const kAlignTableSize = 1 << kAlignBits;            // 16
const kTopValue = 1 << 24;
const kProbInit = 1024;                             // 0x400

const lzmaGetLenToPosState = (len: number) => {
  const l = len - kMatchMinLen;
  return l < kNumLenToPosStates ? l : kNumLenToPosStates - 1;
};
const lzmaUpdateStateLiteral = (s: number) => (s < 4 ? 0 : s < 10 ? s - 3 : s - 6);
const lzmaUpdateStateMatch = (s: number) => (s < kNumLitStates ? 7 : 10);
const lzmaUpdateStateRep = (s: number) => (s < kNumLitStates ? 8 : 11);
const lzmaUpdateStateShortRep = (s: number) => (s < kNumLitStates ? 9 : 11);

/** RangeCoder 解码器（LZMA SDK Decoder.cs 移植；所有 32 位运算按无符号回绕处理） */
class LzmaRangeDecoder {
  private code = 0;
  private range = 0;
  private pos: number;
  constructor(private data: Uint8Array, private end: number, start: number) { this.pos = start; }

  init(): void {
    this.code = 0;
    this.range = 0xffffffff;
    for (let i = 0; i < 5; i++) this.code = ((this.code << 8) | this.byte()) >>> 0;
  }

  private byte(): number { return this.pos < this.end ? this.data[this.pos++] : 0; }

  decodeDirectBits(numBits: number): number {
    let range = this.range;
    let code = this.code;
    let result = 0;
    for (let i = numBits; i > 0; i--) {
      range >>>= 1;
      const t = (code - range) >>> 31;              // 0 若 code>=range，否则 1
      if (t === 0) code = (code - range) >>> 0;     // code -= range & (t-1)
      result = (result << 1) | (1 - t);
      if (range < kTopValue) {
        code = ((code << 8) | this.byte()) >>> 0;
        range = (range << 8) >>> 0;
      }
    }
    this.range = range;
    this.code = code;
    return result;
  }

  decodeBit(probs: Uint16Array, index: number): number {
    const prob = probs[index];
    const newBound = ((this.range >>> 11) * prob) >>> 0;
    if ((this.code >>> 0) < newBound) {
      this.range = newBound;
      probs[index] = (prob + ((0x800 - prob) >>> 5)) as number;
      if (this.range < kTopValue) {
        this.code = ((this.code << 8) | this.byte()) >>> 0;
        this.range = (this.range << 8) >>> 0;
      }
      return 0;
    }
    this.range = (this.range - newBound) >>> 0;
    this.code = (this.code - newBound) >>> 0;
    probs[index] = (prob - (prob >>> 5)) as number;
    if (this.range < kTopValue) {
      this.code = ((this.code << 8) | this.byte()) >>> 0;
      this.range = (this.range << 8) >>> 0;
    }
    return 1;
  }
}

/** 位树解码器（正序/反序），probs 为独立数组（索引 0 起） */
class LzmaBitTreeDecoder {
  constructor(private numBits: number, private probs: Uint16Array) {}
  decode(rc: LzmaRangeDecoder): number {
    let m = 1;
    for (let i = this.numBits; i > 0; i--) m = (m << 1) | rc.decodeBit(this.probs, m);
    return m - (1 << this.numBits);
  }
  reverseDecode(rc: LzmaRangeDecoder): number {
    let m = 1;
    let symbol = 0;
    for (let i = 0; i < this.numBits; i++) {
      const bit = rc.decodeBit(this.probs, m);
      m = (m << 1) | bit;
      symbol |= bit << i;
    }
    return symbol;
  }
}

/** 长度解码器：low(3bit,按 posState) + mid(3bit,按 posState) + high(8bit) */
class LzmaLenDecoder {
  private choice = new Uint16Array(1).fill(kProbInit);
  private choice2 = new Uint16Array(1).fill(kProbInit);
  private low: LzmaBitTreeDecoder[] = [];
  private mid: LzmaBitTreeDecoder[] = [];
  private high: LzmaBitTreeDecoder;
  constructor(numPosStates: number) {
    for (let i = 0; i < numPosStates; i++) {
      this.low.push(new LzmaBitTreeDecoder(kNumLenLowBits, new Uint16Array(kNumLenLowSymbols).fill(kProbInit)));
      this.mid.push(new LzmaBitTreeDecoder(kNumLenMidBits, new Uint16Array(kNumLenMidSymbols).fill(kProbInit)));
    }
    this.high = new LzmaBitTreeDecoder(kNumLenHighBits, new Uint16Array(kNumLenHighSymbols).fill(kProbInit));
  }
  decode(rc: LzmaRangeDecoder, posState: number): number {
    if (rc.decodeBit(this.choice, 0) === 0) return this.low[posState].decode(rc);
    if (rc.decodeBit(this.choice2, 0) === 0) return kNumLenLowSymbols + this.mid[posState].decode(rc);
    return kNumLenLowSymbols + kNumLenMidSymbols + this.high.decode(rc);
  }
}

/** 字面量解码器：coders[1 << (lc+lp)]，每个 0x300 个概率 */
class LzmaLiteralDecoder {
  private coders: Uint16Array[] = [];
  constructor(private lpBits: number, private lcBits: number) {
    const count = 1 << (lpBits + lcBits);
    for (let i = 0; i < count; i++) this.coders.push(new Uint16Array(0x300).fill(kProbInit));
  }
  getDecoder(pos: number, prevByte: number): Uint16Array {
    const index = ((pos & ((1 << this.lpBits) - 1)) << this.lcBits) + (prevByte >>> (8 - this.lcBits));
    return this.coders[index];
  }
}

function lzmaDecodeNormal(m: Uint16Array, rc: LzmaRangeDecoder): number {
  let symbol = 1;
  do {
    symbol = (symbol << 1) | rc.decodeBit(m, symbol);
  } while (symbol < 0x100);
  return symbol & 0xff;
}

function lzmaDecodeWithMatchByte(m: Uint16Array, rc: LzmaRangeDecoder, matchByte: number): number {
  let symbol = 1;
  let mb = matchByte & 0xff;
  do {
    const matchBit = (mb >> 7) & 1;
    mb = (mb << 1) & 0xff;
    const bit = rc.decodeBit(m, ((1 + matchBit) << 8) | symbol);
    symbol = (symbol << 1) | bit;
    if (matchBit !== bit) {
      while (symbol < 0x100) symbol = (symbol << 1) | rc.decodeBit(m, symbol);
      break;
    }
  } while (symbol < 0x100);
  return symbol & 0xff;
}

/** 反序位树（posDecoders 用，起始概率索引 startIndex） */
function lzmaReverseDecode(probs: Uint16Array, startIndex: number, numBits: number, rc: LzmaRangeDecoder): number {
  let m = 1;
  let symbol = 0;
  for (let i = 0; i < numBits; i++) {
    const bit = rc.decodeBit(probs, startIndex + m);
    m = (m << 1) | bit;
    symbol |= bit << i;
  }
  return symbol;
}

/**
 * 解压 LZMA-alone 容器（5 字节属性 + 8 字节 LE 未压缩长度 + LZMA 流）。
 * 供 .sol 0x0200 / SWF LZMA tag 等场景使用。
 */
export function lzmaDecompress(data: Uint8Array): Uint8Array {
  if (data.length < 13) throw new Error("LZMA: 数据过短（不足 13 字节属性头）");
  const props = data[0];
  const lc = props % 9;
  let rem = Math.floor(props / 9);
  const lp = rem % 5;
  rem = Math.floor(rem / 5);
  const pb = rem;
  if (pb > kNumPosBitsMax) throw new Error("LZMA: 非法属性 pb=" + pb);
  // 未压缩长度 u64 LE（JS Number 精确至 2^53，存档体远小于此）
  const outSize = data[5] + (data[6] << 8) + (data[7] << 16) + (data[8] * 0x1000000)
    + data[9] * 0x100000000 + data[10] * 0x10000000000
    + data[11] * 0x1000000000000 + data[12] * 0x100000000000000;
  if (!Number.isFinite(outSize) || outSize < 0 || outSize > 0x1fffffffffffff) {
    throw new Error("LZMA: 非法未压缩长度");
  }
  const out = new Uint8Array(outSize);
  const rc = new LzmaRangeDecoder(data, data.length, 13);
  rc.init();
  const posStates = 1 << pb;
  const posStateMask = posStates - 1;
  const isMatch = new Uint16Array(kNumStates * kNumPosStatesMax).fill(kProbInit);
  const isRep = new Uint16Array(kNumStates).fill(kProbInit);
  const isRepG0 = new Uint16Array(kNumStates).fill(kProbInit);
  const isRepG1 = new Uint16Array(kNumStates).fill(kProbInit);
  const isRepG2 = new Uint16Array(kNumStates).fill(kProbInit);
  const isRep0Long = new Uint16Array(kNumStates * kNumPosStatesMax).fill(kProbInit);
  const posSlotDecoders: LzmaBitTreeDecoder[] = [];
  for (let i = 0; i < kNumLenToPosStates; i++) {
    posSlotDecoders.push(new LzmaBitTreeDecoder(kNumDistSlotBits, new Uint16Array(kNumDistSlotSymbols).fill(kProbInit)));
  }
  const posDecoders = new Uint16Array(kNumFullDistances - kEndPosModelIndex).fill(kProbInit);
  const alignDecoder = new LzmaBitTreeDecoder(kAlignBits, new Uint16Array(kAlignTableSize).fill(kProbInit));
  const literal = new LzmaLiteralDecoder(lp, lc);
  // 两个独立的长度解码器：rep 匹配用 repLenDecoder，普通匹配用 matchLenDecoder
  // （LZMA SDK 即如此——两者的概率模型互不共享，共用会导致概率污染后解码错位）。
  const repLenDecoder = new LzmaLenDecoder(posStates);
  const matchLenDecoder = new LzmaLenDecoder(posStates);

  let state = 0;
  let rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;
  let nowPos = 0;
  while (nowPos < outSize) {
    const posState = nowPos & posStateMask;
    if (rc.decodeBit(isMatch, (state << kNumPosBitsMax) | posState) === 0) {
      // ---- 字面量 ----
      const prevByte = nowPos > 0 ? out[nowPos - 1] : 0;
      const m = literal.getDecoder(nowPos, prevByte);
      const symbol = state < kNumLitStates
        ? lzmaDecodeNormal(m, rc)
        : lzmaDecodeWithMatchByte(m, rc, rep0 <= nowPos ? out[nowPos - 1 - rep0] : 0);
      out[nowPos++] = symbol;
      state = lzmaUpdateStateLiteral(state);
      continue;
    }
    // ---- 匹配 ----
    let len: number;
    if (rc.decodeBit(isRep, state) === 1) {
      if (rc.decodeBit(isRepG0, state) === 0) {
        if (rc.decodeBit(isRep0Long, (state << kNumPosBitsMax) | posState) === 0) {
          // short rep：输出 rep0 距离处的字节
          state = lzmaUpdateStateShortRep(state);
          if (rep0 >= nowPos) throw new Error("LZMA: 非法回引距离 rep0=" + rep0);
          // 注意：先读源字节再自增（JS 求值顺序：LHS 引用先求值，若写 out[nowPos++] = out[nowPos-1-rep0]
          // 会在读取源时 nowPos 已 +1，导致源偏移差 1 —— C#/Java 是先 GetByte 后 PutByte）
          out[nowPos] = out[nowPos - 1 - rep0];
          nowPos++;
          continue;
        }
      } else {
        let distance: number;
        if (rc.decodeBit(isRepG1, state) === 0) distance = rep1;
        else {
          if (rc.decodeBit(isRepG2, state) === 0) distance = rep2;
          else { distance = rep3; rep3 = rep2; }
          rep2 = rep1;
        }
        rep1 = rep0;
        rep0 = distance;
      }
      len = repLenDecoder.decode(rc, posState) + kMatchMinLen;
      state = lzmaUpdateStateRep(state);
    } else {
      rep3 = rep2; rep2 = rep1; rep1 = rep0;
      len = matchLenDecoder.decode(rc, posState) + kMatchMinLen;
      state = lzmaUpdateStateMatch(state);
      const posSlot = posSlotDecoders[lzmaGetLenToPosState(len)].decode(rc);
      if (posSlot >= kStartPosModelIndex) {
        const numDirectBits = (posSlot >> 1) - 1;
        let dist = (2 | (posSlot & 1)) << numDirectBits;
        if (posSlot < kEndPosModelIndex) {
          // 起始概率索引 = dist - posSlot - 1（与 LZMA SDK Java 移植逐字节核对，编码端同样如此）
          dist += lzmaReverseDecode(posDecoders, dist - posSlot - 1, numDirectBits, rc);
        } else {
          dist = (dist + (rc.decodeDirectBits(numDirectBits - kAlignBits) << kAlignBits) + alignDecoder.reverseDecode(rc)) >>> 0;
        }
        rep0 = dist;
      } else {
        rep0 = posSlot;
      }
    }
    // 复制 len 字节（重叠复制，等价 OutWindow.CopyBlock；rep0=0 时即重复前一个字节）
    // SDK 校验 rep0 < nowPos（不能引用流起点之前），非法流直接报错而非产出损坏数据
    if (rep0 >= nowPos) throw new Error("LZMA: 非法回引距离 rep0=" + rep0 + " nowPos=" + nowPos);
    const src = nowPos - rep0 - 1;
    for (let i = 0; i < len; i++) out[nowPos + i] = out[src + i];
    nowPos += len;
  }
  return out;
}

// ---------- SOL 容器解析 ----------
async function inflateZlib(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const ds = new DecompressionStream("deflate");
  const stream = new Blob([data]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

export async function parseSolFile(file: ArrayBuffer): Promise<any> {
  const buf = new Uint8Array(file);
  if (buf.length < 16) throw new Error("not a SOL file");
  const sig = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (sig !== "TCSO") throw new Error("not a SharedObject file (TCSO header missing)");
  const format = (buf[4] << 8) | buf[5]; // TCSO 压缩标志：0x0000=未压缩 / 0x0100=zlib / 0x0200=LZMA（原版 Flash Player 11+ 默认 LZMA）
  if (format !== 0x0000 && format !== 0x0100 && format !== 0x0200) {
    throw new Error("unsupported SOL compression format 0x" + format.toString(16).padStart(4, "0"));
  }
  let pos = 6;
  const enc = buf[pos++]; // 0=AMF0, 3=AMF3
  pos += 4; // padding
  // 可选内嵌文件名（首字符小写时）
  if (pos + 2 <= buf.length) {
    const nameLen = (buf[pos] << 8) | buf[pos + 1];
    if (nameLen > 0 && nameLen < 512 && pos + 2 + nameLen <= buf.length) {
      pos += 2 + nameLen; // nameLen 是 UTF-16BE 字节数
    }
  }
  if (pos + 4 > buf.length) throw new Error("truncated SOL");
  const bodyLen = ((buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3]) >>> 0;
  pos += 4;
  if (pos + bodyLen > buf.length) throw new Error("truncated SOL body");
  let body = buf.slice(pos, pos + bodyLen);
  if (format === 0x0100) {
    try { body = await inflateZlib(body); } catch { /* 可能未压缩 */ }
  } else if (format === 0x0200) {
    // LZMA-alone 容器：5 字节属性 + 8 字节 LE 未压缩长度 + LZMA 流（同 SWF LZMA tag）。
    // 原版 Flash Player 11+ 保存的 .sol 默认使用 LZMA 压缩。
    body = lzmaDecompress(body) as Uint8Array<ArrayBuffer>;
  }
  const r = makeReader(body);
  return readAmf0(r);
}

// ---------- 原版 save 快照 → 本项目 SaveData ----------
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }

// 原版/旧档 Character 快照 → 本项目字段（TEAM-CHARACTER-SPEC §3.3/§4.5 迁移清单）
function mapCharacter(p: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(p ?? {})) out[k] = p[k];
  if (out.HP !== undefined && out._HP === undefined) out._HP = out.HP;
  delete out.HP;
  // 属性命名：physical/agility/... → basePhysical/...（原版/旧档字段对齐）
  if (out.basePhysical === undefined && out.physical !== undefined) out.basePhysical = out.physical;
  if (out.baseAgility === undefined && out.agility !== undefined) out.baseAgility = out.agility;
  if (out.baseAccuracy === undefined && out.accuracy !== undefined) out.baseAccuracy = out.accuracy;
  if (out.baseIntelligence === undefined && out.intelligence !== undefined) out.baseIntelligence = out.intelligence;
  delete out.physical; delete out.agility; delete out.accuracy; delete out.intelligence;
  // 身体命名：height→Height / weight→_weight / morale→_morale
  if (out.Height === undefined && out.height !== undefined) out.Height = out.height;
  delete out.height;
  if (out._weight === undefined && out.weight !== undefined) out._weight = out.weight;
  delete out.weight;
  if (out._morale === undefined && out.morale !== undefined) out._morale = out.morale;
  delete out.morale;
  // 装备结构：weapons 双槽 / attachments 2x2 / 物品池 {type,amount,inUse}
  if (!Array.isArray(out.weapons)) out.weapons = [0, 0];
  else if (out.weapons.length < 2) out.weapons = [out.weapons[0] ?? 0, out.weapons[1] ?? 0];
  if (!Array.isArray(out.attachments)) out.attachments = [[null, null], [null, null]];
  if (!Array.isArray(out.grenadeAmounts) || out.grenadeAmounts.length < 2) out.grenadeAmounts = [out.grenadeAmounts?.[0] ?? 0, out.grenadeAmounts?.[1] ?? 0];
  if (!Array.isArray(out.currModes) || out.currModes.length < 2) out.currModes = [0, 0];
  if (!Array.isArray(out.loadedAmmo) || out.loadedAmmo.length < 2) out.loadedAmmo = [out.loadedAmmo?.[0] ?? null, out.loadedAmmo?.[1] ?? null];
  if (!Array.isArray(out.selectedAmmo) || out.selectedAmmo.length < 2) out.selectedAmmo = [out.selectedAmmo?.[0] ?? null, out.selectedAmmo?.[1] ?? null];
  // 原版 equipment 已是 {type,amount,inUse}[]；旧 number[]（本项目 v1 存档）转结构
  if (out.equipment && out.equipment.length && typeof out.equipment[0] === "number") {
    out.equipment = out.equipment.map((id: number) => ({ type: id, amount: 1, inUse: 0 }));
  }
  if (out.hunger === undefined) out.hunger = 0;
  if (out.thirst === undefined) out.thirst = 0;
  if (out._morale === undefined) out._morale = 50;
  if (out.Height === undefined) out.Height = 175;
  if (typeof out.eyeDamage !== "boolean") out.eyeDamage = out.eyeDamage ? 1 : 0;
  if (typeof out.armDamage !== "boolean") out.armDamage = out.armDamage ? 1 : 0;
  if (typeof out.legDamage !== "boolean") out.legDamage = out.legDamage ? 1 : 0;
  return out;
}

function mapTransport(t: any): any {
  const out: Record<string, any> = {};
  for (const k of Object.keys(t ?? {})) out[k] = t[k];
  if (out._health !== undefined && out.health === undefined) out.health = out._health;
  if (out._maxHealth !== undefined && out.maxHealth === undefined) out.maxHealth = out._maxHealth;
  delete out._health; // Preserve the unscaled health baseline for juvenile animals.
  if (out.hunger === undefined) out.hunger = 0;
  if (out.thirst === undefined) out.thirst = 0;
  return out;
}

export function originalSaveToSaveData(entry: any): SaveData {
  const save = entry.save ?? entry;
  const gd = save.GameData ?? save; // 兼容 {save:{GameData...}} 与扁平
  const car = gd.Caravans?.[0] ?? {};
  const storySrc = save.Story ?? {};
  const storyFlags: Record<string, any> = {};
  for (const k of Object.keys(storySrc)) {
    const v = storySrc[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "object") continue; // 嵌套对象作为结构字段，不并入 flags
    storyFlags[k] = v;
  }
  const cargo = Array.isArray(car.Cargo)
    ? car.Cargo.map((c: any) => ({ item: num(c.type), amount: num(c.amount) }))
    : [];
  const people = Array.isArray(car.People) ? car.People.map(mapCharacter) : [];
  const transports = Array.isArray(car.Transport) ? car.Transport.map(mapTransport) : [];
  // GameData.generateSave stores transport indices and {type:1|2,index} passenger entries.
  const transportRef = (v: any) => v != null && v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 ? {k:"t",i:Number(v)} : null;
  for (const p of people) p.passengerIn = transportRef(p.passengerIn);
  for (const tr of transports) {
    for (const key of ["passengerIn", "cart", "attachedTo"]) tr[key] = transportRef(tr[key]);
    tr.Passengers = (tr.Passengers ?? []).map((p: any) => ({k:Number(p.type) === 1 ? "t" : "p", i:Number(p.index)})).filter((p: any) => Number.isInteger(p.i) && p.i >= 0);
  }
  const time = num(gd.Time, 2509568400);
  return {
    version: 1,
    name: entry.name ?? "Imported Save",
    day: Math.floor(time / 86400),
    time,
    storyMode: !!gd.storyMode,
    difficulty: num(gd.difficulty, 1),
    gameSpeed: num(gd.gameSpeed, 1),
    navigation:{scale:Math.max(.1,Math.min(10,num(gd.mapScale,1))),centerX:num(gd.mapCenterX,num(car.x)),centerY:num(gd.mapCenterY,num(car.y)),
      routeStart:gd.routeStart?{x:num(gd.routeStart.x),y:num(gd.routeStart.y)}:null,routeEnd:gd.routeEnd?{x:num(gd.routeEnd.x),y:num(gd.routeEnd.y)}:null,
      lastSextantPos:Array.isArray(gd.lastSextantPos)?gd.lastSextantPos.slice(0,2).map((x:any)=>num(x)):[],lastSextantOffset:num(gd.lastSextantOffset),lastSextantMeasurement:num(gd.lastSextantMeasurement),sextantExperience:num(gd.sextantExperience)},
    knownPrices: Array.isArray(gd.knownPrices) ? gd.knownPrices.map((p: any) => ({...p})) : [],
    transportAsPassengers: !!gd.transportAsPassengers,
    settings: Object.fromEntries(["pauseOnExitTown","interactWithFriendlyCaravans","distributeBatteries","advancedTrading","warnedAboutAdvancedTrading","autoSave"].filter(k => typeof gd[k] === "boolean").map(k => [k, gd[k]])),
    caravan: {
      x: num(car.x), y: num(car.y),
      direction: num(car.direction), moving: !!car.moving,
      money: num(car.money),
      cargo,
      cargoIncludesLiquids: true,
      historicalData: car.historicalData ?? [],
      collectForage: car.collectForage,
      hunt: car.hunt,
      milk: car.milk,
      shear: car.shear,
      autoFillLubricant: car.autoFillLubricant,
      autoFillWater: car.autoFillWater,
      groupSettingsAll: car.groupSettings,
      chargingBatteries: car.chargingBatteries,
      inUse: Object.fromEntries((car.Cargo ?? []).map((c: any) => [c.type, c.inUse ?? 0])),
      // 原版该字段保存的是容器件数；液体数量已经在 Cargo 中。
      liquidContainerAssignments: (car.liquidsContainers && typeof car.liquidsContainers === "object")
        ? JSON.parse(JSON.stringify(car.liquidsContainers))
        : undefined,
      people,
      transports,
    },
    story: {
      flags: storyFlags,
      specificReputations: storySrc.specificReputations ?? {},
      currentRelationships: storySrc.characterRelations ?? {},
      factionRelations: gd.factionRelations ?? {},
      acceptedQuests: Array.isArray(storySrc.acceptedQuests) ? storySrc.acceptedQuests.map(num) : [],
      completedQuests: Array.isArray(storySrc.completedQuests) ? storySrc.completedQuests.map(num) : [],
      failedQuests: Array.isArray(storySrc.failedQuests) ? storySrc.failedQuests.map(num) : [],
      questLog: storySrc.questLog ?? {},
      characterRelations: storySrc.characterRelations ?? {},
      dialogueDefaults: storySrc.dialogueDefaults ?? {},
    },
    towns: Array.isArray(gd.Towns)
      ? gd.Towns.map((t: any, tidx: number): any => {
          if (!t) return null; // 稀疏数组防御（原版为稠密，导入时跳过空位）
          // 原版市镇库存独立于商店；仅旧 Web 导出没有 stock 时才用地点库存兜底。
          const merged = new Map<number, number>();
          for(const e of Array.isArray(t.stock)?t.stock:[])merged.set(num(e.type??e.item),num(e.amount));
          for (const loc of Array.isArray(t.stock)?[]:(t.locations ?? [])) {
            for (const s of loc.stock ?? []) {
              merged.set(num(s.type), (merged.get(num(s.type)) ?? 0) + num(s.amount));
            }
          }
          const ind = (arr: any) => Array.isArray(arr)
            ? arr.map((x: any) => ({ type: num(x.type), volume: num(x.volume, num(x.maxSize)), forSale: !!x.forSale, employees: num(x.employees, num(x.volume)) }))
            : [];
          return {
            id: tidx, // 原版 Towns 数组索引即城镇 id
            population: num(t.population),
            people: Array.isArray(t.people) ? t.people.map(mapCharacter) : undefined,
            money: num(t.money),
            playersMoney: num(t.playersMoney),
            discovered: !!t.discovered,
            active: t.active !== false,
            tax: num(t.tax),
            GDPperCapita: t.GDPperCapita === null || t.GDPperCapita === undefined ? null : num(t.GDPperCapita),
            playersStorageSpace: num(t.playersStorageSpace),
            playersStorage: Array.isArray(t.playersStorage)?t.playersStorage.map((e:any)=>({type:num(e.type),amount:num(e.amount)})):undefined,
            incompleteProduction: Array.isArray(t.incompleteProduction)?t.incompleteProduction.map((e:any)=>({item:num(e.item),amount:num(e.amount)})):undefined,
            playersIncompleteProduction: Array.isArray(t.playersIncompleteProduction)?t.playersIncompleteProduction.map((e:any)=>({item:num(e.item),amount:num(e.amount)})):undefined,
            historicalData: Array.isArray(t.historicalData)?t.historicalData.map((h:any)=>({time:num(h.time),...Object.fromEntries(["production","consumption","playersProduction","playersConsumption"].map(k=>[k,(Array.isArray(h[k])?h[k]:[]).map((e:any)=>({item:num(e.item),amount:num(e.amount)}))]))})):undefined,
            unemployed: num(t.unemployed),
            electricityPrice: num(t.electricityPrice),
            prices: typeof t.prices === "object" && t.prices ? { ...t.prices } : undefined,
            stock: merged.size || Array.isArray(t.stock) ? [...merged.entries()].map(([item, amount]) => ({ item, amount })) : undefined,
            industries: ind(t.industries),
            playersIndustries: ind(t.playersIndustries),
          };
        }).filter((t: any) => t !== null)
      : undefined,
    discoveredTowns: Array.isArray(gd.Towns) ? gd.Towns.filter((t: any) => t && t.discovered).map((t: any, i: number) => num(t.type ?? t.id, i)) : [],
    revealedFactions: Array.isArray(gd.revealedFactions) ? gd.revealedFactions.map(num) : [],
    producedToday: gd.producedToday && typeof gd.producedToday === "object" ? Object.fromEntries(Object.entries(gd.producedToday).map(([k, v]) => [k, num(v)])) : undefined,
    savedAt: new Date().toISOString(),
  };
}

export function solToSaves(parsed: any): Array<{ name: string; save: SaveData }> {
  const data = parsed?.data ?? parsed;
  const saves = Array.isArray(data.saves) ? data.saves : [];
  const out: Array<{ name: string; save: SaveData }> = [];
  for (const s of saves) {
    if (s && s.save) {
      try { out.push({ name: s.name ?? "Original Save", save: originalSaveToSaveData(s) }); }
      catch { /* 跳过无法解析的槽位 */ }
    }
  }
  return out;
}
