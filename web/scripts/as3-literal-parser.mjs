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


export { Parser, parseAt };
