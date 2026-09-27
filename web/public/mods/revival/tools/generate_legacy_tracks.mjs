// Rebuild original-compatible clips from the already extracted AS3 frame table.
// This is the single generator for legacy poses AND simulation event timing.
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { build } from "esbuild";
import { isDeepStrictEqual } from "node:util";
import { resolve, relative, isAbsolute } from "node:path";
import { applyAnimationAuthoring } from "./animation_authoring.mjs";
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--check")) throw new Error("Usage: generate_legacy_tracks.mjs [--check]");
import { buildOriginalAtlases } from "./generate_battle_atlas.mjs";
const bundled = await build({ stdin: { contents: 'export * from "./public/mods/revival/runtime/BattleAnimation.ts"; export { createOriginalTransportRig } from "./public/mods/revival/runtime/BattleTransportAnimation.ts";', resolveDir: process.cwd() }, bundle: true, write: false,
  platform: "node", format: "esm", logLevel: "silent" });
const { createLegacyBattleClip, createOriginalTransportRig } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const doll = JSON.parse(readFileSync("public/data/battle_doll.json", "utf8"));
const path = "public/mods/revival/data/battle_skeleton.json";
let skeleton = { definition: JSON.parse(readFileSync("public/mods/revival/data/battle_skeleton.base.json", "utf8")), animations: {} };
const names = ["idle", "walk", "shoot", "hit", "death"];
// All eight original types passed staged pixel parity before enabling this full set.
const migratedClips = Array.from({ length: 8 }, (_, type) => names.map(name => `${name}_${type}`)).flat();
const categoryOfPart = {
  LeftTopArm: "arms", LeftForearm: "arms", RightTopArm: "arms", RightForearm: "arms",
  Head: "body", Body: "body", Beard: "body", BackHair: "body", ShoulderPlates: "body",
  Legs: "legs", Weapon: "weapon", BigGunBackpack: "weapon", Shadows: "shadow",
};

/** Explicit original-part attachments; no invented motion or new textures.
 * Character.as still owns direction, registration and dynamic draw order.
 * All four arm slots share the original arms category, not new arm animations.
 */
function addOriginalAttachmentTracks(clip, type, phase) {
  const sourceFrames = doll.fullAnimationTypeFrames[type][phase];
  clip.slotTracks = skeleton.definition.slots.map(slot => {
    const category = categoryOfPart[slot.part];
    if (!category) throw new Error(`No original category for ${slot.part}`);
    const keys = [];
    let previous = "";
    sourceFrames.forEach((sourceFrame, index) => {
      const frame = sourceFrame[category];
      const attachment = `original:${slot.part}:${frame}`;
      skeleton.definition.attachments[attachment] ??= { part: slot.part, frame };
      if (attachment !== previous) keys.push({ time: index / clip.fps, attachment });
      previous = attachment;
    });
    return { slot: slot.name, keys };
  });
}

// Always regenerate from source, never from a previously authored output.
skeleton.definition.attachments = {};
for (let type = 0; type < 8; type++) for (let phase = 0; phase < 5; phase++) {
  const clip = createLegacyBattleClip(doll, type, phase);
  if (migratedClips.includes(clip.name)) addOriginalAttachmentTracks(clip, type, phase);
  skeleton.animations[clip.name] = clip;
  if (type === 0) skeleton.animations[names[phase]] = { ...clip, name: names[phase] };
}
skeleton.migratedClips = migratedClips;
// Original reload has no doll clip. Old fabricated templates must not be shipped.
delete skeleton.animations.reload;
for (let type = 0; type < 8; type++) delete skeleton.animations["reload_" + type];
skeleton.transport = createOriginalTransportRig();
const authoring = JSON.parse(readFileSync("public/mods/revival/data/battle_skeleton.authoring.json", "utf8"));
const assets = JSON.parse(readFileSync("public/assets/manifest.json", "utf8"));
const mod = JSON.parse(readFileSync("public/mods/revival/manifest.json", "utf8"));
const publicRoot = resolve("public");
skeleton = applyAnimationAuthoring(skeleton, authoring, {
  hasImage(name) {
    const own = Object.hasOwn(mod.assets ?? {}, name);
    const url = own ? mod.assets[name] : assets.images[name]?.[0];
    if (typeof url !== "string") return false;
    const file = resolve(publicRoot, own ? "mods/revival" : ".", url);
    const rel = relative(publicRoot, file);
    return !isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && existsSync(file);
  },
  hasPart(part, frame) {
    const types = doll.spriteBoundaries[part];
    return !!types && (frame === undefined || Object.values(types).some(dirs => Object.values(dirs).some(frames => Object.hasOwn(frames, frame))));
  },
});
// Check mode is read-only; malformed author input cannot overwrite good assets.
if (!args.includes("--check")) {
  buildOriginalAtlases(doll, skeleton);
  // Do not churn a large generated file just because object key order changed.
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  if (!isDeepStrictEqual(previous, skeleton)) {
    writeFileSync(path + ".tmp", JSON.stringify(skeleton, null, 2) + "\n");
    renameSync(path + ".tmp", path);
  }
}
console.log(args.includes("--check") ? "Authoring validation passed (no files written)" : "Authoring applied; original timing kept unless the authoring source overrides it");
console.log(`Rebuilt 40 original clips; explicit attachment tracks: ${migratedClips.join(", ")}`);
