// 生成 web/public/assets/manifest.json
// 用法: node scripts/gen_manifest.mjs
import { readdirSync, writeFileSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const srcImages = "decompiled/all/images";
const srcSounds = "decompiled/all/sounds";
const srcFonts = "decompiled/all/fonts";
const outDir = "web/public/assets";
const manifest = { images: {}, sounds: {}, fonts: {}, generatedAt: new Date().toISOString() };

function stripId(name) {
  // "116_InterfaceBackground.png.png" -> "InterfaceBackground.png"；"819_TitleScreen.jpg.jpg" -> "TitleScreen.jpg"
  let n = name.replace(/^\d+_/, "");
  n = n.replace(/\.(png|jpg|jpeg|gif|mp3|ttf)\.\1$/i, ".$1");
  return n;
}
function walk(dir, bucket) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p, bucket); continue; }
    const rel = "assets/" + p.replace(/\\/g, "/").replace(/^decompiled\/all\//, "");
    const key = stripId(f);
    if (!bucket[key]) bucket[key] = [];
    bucket[key].push(rel);
  }
}
walk(srcImages, manifest.images);
walk(srcSounds, manifest.sounds);
walk(srcFonts, manifest.fonts);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("images:", Object.keys(manifest.images).length, "sounds:", Object.keys(manifest.sounds).length, "fonts:", Object.keys(manifest.fonts).length);
console.log("sample:", Object.entries(manifest.images).slice(0, 3));