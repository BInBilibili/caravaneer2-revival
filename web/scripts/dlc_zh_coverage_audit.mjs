
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const mods = ["advanced-weaponry","industrial-magnate","special-story","welcome-to-games-of-honor"];
const load = (p)=>JSON.parse(fs.readFileSync(p,"utf8"));
const base = load(path.join(root,"data/texts.json"))._texts;
const base7k = Object.keys(base).map(Number).filter(n=>n>=7000).sort((a,b)=>a-b);
console.log("BASE 中 >=7000 的 id 数:", base7k.length, "范围", base7k[0], "-", base7k[base7k.length-1]);
let base7kMissingZh = base7k.filter(id=>!(base[id][18]??"").trim());
console.log("其中缺简体的:", base7kMissingZh.length, base7kMissingZh.slice(0,20).join(","));
// 合并表
const merged = Object.assign({}, base);
for (const m of mods) {
  const tp = path.join(root,"mods",m,"data/texts.json");
  if(!fs.existsSync(tp)) continue;
  const o = load(tp)._texts ?? load(tp);
  for (const k of Object.keys(o)) merged[k] = o[k];
}
// 收集 mod 数据里引用的数字型 name/title 字段
const refIds = new Map();
function walk(node, file) {
  if (Array.isArray(node)) { node.forEach(v=>walk(v,file)); return; }
  if (node && typeof node === "object") {
    for (const [k,v] of Object.entries(node)) {
      if (/^(name|title|desc|description|text|label|msg|message|topic|subject|prompt)$/i.test(k) && typeof v === "number") {
        if(!refIds.has(v)) refIds.set(v, new Set());
        refIds.get(v).add(file);
      }
      walk(v, file);
    }
  }
}
for (const m of mods) {
  const dir = path.join(root,"mods",m,"data");
  for (const f of fs.readdirSync(dir)) {
    if(!f.endsWith(".json")) continue;
    if(/^(asset-manifest|texts)\.json$/.test(f)) continue;
    walk(load(path.join(dir,f)), m+"/"+f);
  }
}
console.log("\n模组数据引用的数字文本 id 数:", refIds.size);
let noRow=[], noZh18=[], onlyZh19=[];
for (const [id, files] of refIds) {
  const arr = merged[String(id)];
  const set = [...files].join(",");
  if(!arr){ noRow.push(id+"("+set+")"); continue; }
  if(!(arr[18]??"").trim()){
    if((arr[19]??"").trim()) onlyZh19.push(id+"="+arr[19]+"("+set+")");
    else noZh18.push(id+"=en:"+(arr[1]??"")+"("+set+")");
  }
}
console.log("\n[完全查无此 id]", noRow.length, noRow.slice(0,25).join(" | "));
console.log("\n[有英文/无任何中文]", noZh18.length, noZh18.slice(0,25).join(" | "));
console.log("\n[仅繁体、zh-CN 会串到繁体]", onlyZh19.length, onlyZh19.slice(0,25).join(" | "));
