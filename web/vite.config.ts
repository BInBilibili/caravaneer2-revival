import { defineConfig } from "vite";
import {modDiscoveryPlugin} from './scripts/mod-discovery.mjs';
import {bundledModRuntimePlugin} from './scripts/bundled-mod-runtime.mjs';
// Keep the actual chunks small instead of raising the warning threshold.
export default defineConfig({
  base: "./",
  plugins: [modDiscoveryPlugin(), bundledModRuntimePlugin(["revival"])],
  server: { port: 5173, open: false },
  build: { target: "es2022", assetsDir: "assets", rollupOptions: { output: {
    chunkFileNames: chunk => chunk.name.startsWith("mod-") ? "mods/" + chunk.name.slice(4) + "/runtime/[name]-[hash].js" : "assets/[name]-[hash].js",
    manualChunks(id) {
      const p=id.replace(/\\/g,"/");
      const mod = p.match(/\/public\/mods\/([^/]+)\/runtime\//);
      if (mod) return "mod-" + mod[1];
      if (/\/src\/core\//.test(p)) return "engine";
      if (/\/src\/game\/(World|Economy|Story|SaveSystem|eventData|questData|workshopRecipes|factionRelations)\.ts$/.test(p)) return "world";
      if (/\/src\/game\/Battle[^/]*\.ts$/.test(p)) return "battle";
    }
  } } }
});
