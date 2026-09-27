const fs = require("fs");
const src = fs.readFileSync("decompiled/script/scripts/IsoEngine/GameData.as", "utf8");
function extract(name) {
  const startMarker = "public function " + name + "(";
  let idx = src.indexOf(startMarker);
  if (idx < 0) throw new Error(name + " not found");
  const brace = src.indexOf("{", idx);
  let depth = 0, i = brace;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error(name + " unbalanced");
  return src.slice(brace + 1, i);
}
let body = "// 任务方法体（来自原版 GameData.as，运行时用 with(env) 转译执行）\n";
body += "export const ACCEPT_QUEST_BODY = " + JSON.stringify(extract("acceptQuest")) + ";\n";
body += "export const COMPLETE_QUEST_BODY = " + JSON.stringify(extract("completeQuest")) + ";\n";
body += "export const FAIL_QUEST_BODY = " + JSON.stringify(extract("failQuest")) + ";\n";
fs.writeFileSync("web/src/game/questData.ts", body);
console.log("written ok, len:", body.length, "acceptQuest:", extract("acceptQuest").length);
