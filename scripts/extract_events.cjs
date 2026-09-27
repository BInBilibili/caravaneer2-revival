const fs = require("fs");
const src = fs.readFileSync("decompiled/script/scripts/IsoEngine/GameData.as", "utf8");
function extract(name) {
  const startMarker = "public function " + name + "(";
  const idx = src.indexOf(startMarker);
  if (idx < 0) throw new Error(name + " not found");
  const brace = src.indexOf("{", idx);
  let depth = 0, i = brace;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(brace + 1, i);
}
function extractPrivate(name) {
  const startMarker = "private function " + name + "(";
  const idx = src.indexOf(startMarker);
  if (idx < 0) throw new Error(name + " not found");
  const brace = src.indexOf("{", idx);
  let depth = 0, i = brace;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(brace + 1, i);
}
let body = "// 事件方法体（来自原版 GameData.as）\n";
body += "export const MAJOR_EVENT_BODY = " + JSON.stringify(extract("executeMajorEvent")) + ";\n";
body += "export const CREATE_MIKAZE_BODY = " + JSON.stringify(extractPrivate("createMikazeOilMainCharacters")) + ";\n";
body += "export const CREATE_NARIZIANS_BODY = " + JSON.stringify(extractPrivate("createNariziansSquad")) + ";\n";
fs.writeFileSync("web/src/game/eventData.ts", body);
console.log("written:", body.length, "event:", extract("executeMajorEvent").length, "mikaze:", extractPrivate("createMikazeOilMainCharacters").length, "narizians:", extractPrivate("createNariziansSquad").length);
