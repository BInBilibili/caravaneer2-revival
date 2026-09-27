// 数据层转换器：把 Data/*.as 的 AS3 字面量/赋值语句转成 JSON
// 用法: node scripts/convert_data.mjs
// 输出: web/public/data/{texts,dialogues,presets,namePhonetics,mainStory}.json
// 函数表达式（actions/conditions 回调）→ {"__as3fn__": "<原始AS3源码>"} 占位，待人工/机械转译
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "decompiled", "script", "scripts", "Data");
const outDir = join(root, "web", "public", "data");
mkdirSync(outDir, { recursive: true });

// ---------- AS3 字面量解析器 ----------
class Parser {
  constructor(src) { this.s = src; this.i = 0; }
  ws() {
    for (;;) {
      const c = this.s[this.i];
      if (c === " " || c === "\t" || c === "\r" || c === "\n") { this.i++; continue; }
      if (c === "/" && this.s[this.i + 1] === "/") {
        while (this.i < this.s.length && this.s[this.i] !== "\n") this.i++;
        continue;
      }
      if (c === "/" && this.s[this.i + 1] === "*") {
        this.i += 2;
        while (this.i < this.s.length && !(this.s[this.i] === "*" && this.s[this.i + 1] === "/")) this.i++;
        this.i += 2;
        continue;
      }
      break;
    }
  }
  parseValue() {
    this.ws();
    const c = this.s[this.i];
    if (c === "{") return this.parseObject();
    if (c === "[") return this.parseArray();
    if (c === '"' || c === "'") return this.parseString();
    if (c === "f" && this.s.startsWith("function", this.i)) return this.parseFunction();
    const num = /^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(this.s.slice(this.i));
    if (num) {
      this.i += num[0].length;
      const v = Number(num[0]);
      if (Number.isNaN(v)) throw new Error("bad number " + num[0] + " @" + this.i);
      return v;
    }
    const id = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/.exec(this.s.slice(this.i));
    if (id) {
      const callee = id[0];
      const bare = callee.includes(".") ? null : callee;
      this.i += callee.length;
      this.ws();
      if (this.s[this.i] === "(") {
        this.i++;
        const args = [];
        this.ws();
        if (this.s[this.i] !== ")") {
          for (;;) {
            args.push(this.parseValue());
            this.ws();
            if (this.s[this.i] === ",") { this.i++; continue; }
            break;
          }
        }
        if (this.s[this.i] !== ")") throw new Error("调用缺少右括号 @" + this.i);
        this.i++;
        return { __call__: callee, args };
      }
      switch (bare) {
        case "true": return true;
        case "false": return false;
        case "null": return null;
        case "undefined":
        case "NaN": return null;
        case "Infinity": return Number.MAX_VALUE;
        default: return { __as3id: callee };
      }
    }
    throw new Error("无法解析 @" + this.i + ": " + this.s.slice(this.i, this.i + 50));
  }
  parseString() {
    const q = this.s[this.i];
    this.i++;
    let out = "";
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === "\\") {
        const n = this.s[this.i + 1];
        switch (n) {
          case "n": out += "\n"; break;
          case "t": out += "\t"; break;
          case "r": out += "\r"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "0": out += "\0"; break;
          case "u": {
            const h = this.s.slice(this.i + 2, this.i + 6);
            out += String.fromCharCode(parseInt(h, 16));
            this.i += 4;
            break;
          }
          case "x": {
            const h = this.s.slice(this.i + 2, this.i + 4);
            out += String.fromCharCode(parseInt(h, 16));
            this.i += 2;
            break;
          }
          default: out += n === undefined ? "\\" : n;
        }
        this.i += 2;
      } else if (c === q) {
        this.i++;
        return out;
      } else {
        out += c;
        this.i++;
      }
    }
    throw new Error("字符串未闭合 @" + this.i);
  }
  parseObject() {
    this.i++;
    const o = {};
    for (;;) {
      this.ws();
      if (this.s[this.i] === "}") { this.i++; return o; }
      let key;
      if (this.s[this.i] === '"' || this.s[this.i] === "'") key = this.parseString();
      else {
        const m = /^[A-Za-z_$][A-Za-z0-9_$]*|^\d+/.exec(this.s.slice(this.i));
        if (!m) throw new Error("对象键解析失败 @" + this.i);
        key = m[0];
        this.i += m[0].length;
      }
      this.ws();
      if (this.s[this.i] !== ":") throw new Error("对象缺少冒号 @" + this.i + " key=" + key);
      this.i++;
      o[key] = this.parseValue();
      this.ws();
      if (this.s[this.i] === ",") { this.i++; continue; }
      if (this.s[this.i] === "}") { this.i++; return o; }
      throw new Error("对象缺少逗号/右括号 @" + this.i);
    }
  }
  parseArray() {
    this.i++;
    const a = [];
    for (;;) {
      this.ws();
      if (this.s[this.i] === "]") { this.i++; return a; }
      a.push(this.parseValue());
      this.ws();
      if (this.s[this.i] === ",") { this.i++; continue; }
      if (this.s[this.i] === "]") { this.i++; return a; }
      throw new Error("数组缺少逗号/右括号 @" + this.i);
    }
  }
  parseFunction() {
    const start = this.i;
    this.i += "function".length;
    this.ws();
    if (this.s[this.i] === "(") this.skipBalanced("(", ")");
    this.ws();
    if (this.s[this.i] === ":") {
      this.i++;
      this.ws();
      const tm = /^[A-Za-z_$][A-Za-z0-9_$]*|^\*/.exec(this.s.slice(this.i));
      if (tm) this.i += tm[0].length;
    }
    this.ws();
    if (this.s[this.i] !== "{") throw new Error("函数体缺少 { @" + this.i);
    this.i++;
    let depth = 1;
    for (;;) {
      if (this.i >= this.s.length) throw new Error("函数体未闭合 @" + this.i);
      const c = this.s[this.i];
      if (c === '"' || c === "'") { this.parseString(); continue; }
      if (c === "/" && this.s[this.i + 1] === "/") {
        while (this.i < this.s.length && this.s[this.i] !== "\n") this.i++;
        continue;
      }
      if (c === "/" && this.s[this.i + 1] === "*") {
        this.i += 2;
        while (this.i < this.s.length && !(this.s[this.i] === "*" && this.s[this.i + 1] === "/")) this.i++;
        this.i += 2;
        continue;
      }
      if (c === "{") { depth++; this.i++; continue; }
      if (c === "}") {
        if (depth > 0) depth--;
        this.i++;
        if (depth === 0) {
          const save = this.i;
          this.ws();
          if (this.s[this.i] === ";") { this.i = save; break; } // 不消费分号，留给 parseAt 校验
        }
        continue;
      }
      this.i++;
    }
    return { __as3fn: this.s.slice(start, this.i) };
  }
  skipBalanced(open, close) {
    let depth = 0;
    for (;;) {
      if (this.i >= this.s.length) throw new Error("括号未闭合 @" + this.i);
      const c = this.s[this.i];
      if (c === '"' || c === "'") { this.parseString(); continue; }
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) { this.i++; return; }
      }
      this.i++;
    }
  }
}

function parseAt(src, pos) {
  const p = new Parser(src);
  p.i = pos;
  const v = p.parseValue();
  p.ws();
  if (src[p.i] !== ";") throw new Error("赋值后缺少分号 @" + p.i);
  return v;
}

function extractStatics(src, fileName) {
  const out = {};
  const re = /(?:private |public )?static (?:var|const) ([A-Za-z_][A-Za-z0-9_]*):\* = /g;
  let m;
  while ((m = re.exec(src))) {
    try {
      out[m[1]] = parseAt(src, re.lastIndex);
    } catch (e) {
      console.error("  [" + fileName + "] " + m[1] + " 解析失败:", e.message);
    }
  }
  return out;
}

const report = {};

// 1) Texts.as
{
  const src = readFileSync(join(srcDir, "Texts.as"), "utf8");
  const statics = extractStatics(src, "Texts.as");
  const data = { _texts: statics._texts ?? {}, useSystemFonts: statics.useSystemFonts ?? false, systemFontName: statics.systemFontName ?? "" };
  writeFileSync(join(outDir, "texts.json"), JSON.stringify(data));
  const langs = Object.values(data._texts)[0] || [];
  report.texts = { textIds: Object.keys(data._texts).length, langCount: langs.length, bytes: JSON.stringify(data).length };
}

// 2) Presets.as
{
  const src = readFileSync(join(srcDir, "Presets.as"), "utf8");
  const data = extractStatics(src, "Presets.as");
  writeFileSync(join(outDir, "presets.json"), JSON.stringify(data));
  report.presets = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]));
}

// 3) Dialogues.as
{
  const src = readFileSync(join(srcDir, "Dialogues.as"), "utf8");
  const characterNames = {}, entries = {}, responses = {};
  const re = /(characterNames|entries|responses)\[(\d+)\](?:\.([A-Za-z_][A-Za-z0-9_]*))? = /g;
  let m, fnCount = 0, unknownId = 0;
  const checkMarkers = (v) => {
    if (v && typeof v === "object") {
      if (Array.isArray(v)) v.forEach(checkMarkers);
      else for (const k of Object.keys(v)) {
        if (k === "__as3fn") fnCount++;
        else if (k === "__as3id") unknownId++;
        else checkMarkers(v[k]);
      }
    }
  };
  while ((m = re.exec(src))) {
    try {
      const val = parseAt(src, re.lastIndex);
      checkMarkers(val);
      if (m[1] === "characterNames") characterNames[m[2]] = val;
      else if (m[1] === "entries") entries[m[2]] = val;
      else {
        if (!responses[m[2]]) responses[m[2]] = {};
        responses[m[2]][m[3] ?? "value"] = val;
      }
    } catch (e) {
      console.error("  [Dialogues] " + m[0].trim() + " 解析失败:", e.message);
    }
  }
  const data = { characterNames, entries, responses };
  writeFileSync(join(outDir, "dialogues.json"), JSON.stringify(data));
  report.dialogues = { characterNames: Object.keys(characterNames).length, entries: Object.keys(entries).length, responses: Object.keys(responses).length, fnCallbacks: fnCount, unknownIds: unknownId };
}

// 4) NamePhonetics.as
{
  const src = readFileSync(join(srcDir, "NamePhonetics.as"), "utf8");
  const data = extractStatics(src, "NamePhonetics.as");
  writeFileSync(join(outDir, "namePhonetics.json"), JSON.stringify(data));
  report.namePhonetics = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Object.keys(v).length]));
}

// 5) Caravaneer2MainStory.as
{
  const src = readFileSync(join(srcDir, "Caravaneer2MainStory.as"), "utf8");
  const data = extractStatics(src, "Caravaneer2MainStory.as");
  writeFileSync(join(outDir, "mainStory.json"), JSON.stringify(data));
  report.mainStory = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === "object" ? Object.keys(v).length : typeof v]));
}

// 6) IsoEngine/GameData.as — 静态数据表（languages 等）
{
  const src = readFileSync(join(root, "decompiled", "script", "scripts", "IsoEngine", "GameData.as"), "utf8");
  const data = extractStatics(src, "GameData.as");
  writeFileSync(join(outDir, "gamedata.json"), JSON.stringify(data));
  report.gamedata = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === "object" ? Object.keys(v).length : typeof v]));
}

// 7) IsoEngine/Item.as + WeaponsData.as — 物品/武器表
{
  const isrc = readFileSync(join(root, "decompiled", "script", "scripts", "IsoEngine", "Item.as"), "utf8");
  const idata = extractStatics(isrc, "Item.as");
  writeFileSync(join(outDir, "items.json"), JSON.stringify(idata));
  report.items = Object.fromEntries(Object.entries(idata).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === "object" ? Object.keys(v).length : typeof v]));
}
{
  const wsrc = readFileSync(join(root, "decompiled", "script", "scripts", "IsoEngine", "WeaponsData.as"), "utf8");
  const wdata = extractStatics(wsrc, "WeaponsData.as");
  writeFileSync(join(outDir, "weapons.json"), JSON.stringify(wdata));
  report.weapons = Object.fromEntries(Object.entries(wdata).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === "object" ? Object.keys(v).length : typeof v]));
}

// 8) IsoEngine/Industry.as — 产业类型表
{
  const isrc = readFileSync(join(root, "decompiled", "script", "scripts", "IsoEngine", "Industry.as"), "utf8");
  const idata = extractStatics(isrc, "Industry.as");
  writeFileSync(join(outDir, "industries.json"), JSON.stringify(idata));
  report.industries = Object.fromEntries(Object.entries(idata).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === "object" ? Object.keys(v).length : typeof v]));
}

// 9) IsoEngine/TransportUnit.as — 运输单位类型
{
  const tsrc = readFileSync(join(root, "decompiled", "script", "scripts", "IsoEngine", "TransportUnit.as"), "utf8");
  const tdata = extractStatics(tsrc, "TransportUnit.as");
  writeFileSync(join(outDir, "transports.json"), JSON.stringify(tdata));
  report.transports = Object.fromEntries(Object.entries(tdata).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === "object" ? Object.keys(v).length : typeof v]));
}

console.log(JSON.stringify(report, null, 2));
