// Caravaneer 2 HTML5 移植 — 入口
import { Game } from "./core/Game";
import { loadDataStore } from "./core/DataStore";
import { AssetStore } from "./core/Assets";
import { Input } from "./core/Input";
import { initSounds, setSoundFX, setMusicOn } from "./core/Sound";
import { GameShell } from "./game/Shell";
import { makeSave, applySave } from "./game/SaveSystem";
import { Story } from "./game/Story";
import { ModRuntime } from "./core/ModRuntime";
import bundledRuntimes from "virtual:bundled-mod-runtimes";

async function main() {
  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const game = new Game(canvas, 880, 495);
  const g = game.ctx;
  const drawLoading = (msg: string) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, 880, 495);
    g.fillStyle = "#888";
    g.font = '16px "Microsoft YaHei","Microsoft JhengHei","Noto Sans SC","SimHei",Arial,sans-serif';
    g.fillText(msg, 40, 200);
  };
  drawLoading("Caravaneer 2 HTML5 — 加载数据中…");
  try {
    const allowScripts = new URLSearchParams(location.search).get("allowModScripts") === "1" || localStorage.getItem("c2:allowModScripts") === "1";
    const mods = new ModRuntime({ allowScripts, bundledRuntimes });
    await mods.load();
    const ds = await loadDataStore(18, mods); // 默认简体中文
    drawLoading("加载资源中…");
    const assets = new AssetStore(ds);
    await assets.loadFonts();
    // 注入物品查询（避免 World↔Economy 循环依赖）
    (globalThis as any).__c2GetItemData = (id: number) => {
      const it = ds.items.Items[id];
      if (!it) return null;
      switch (it.category) {
        case 1: return ds.items.Goods[it.subCategory] ?? null;
        case 2: return ds.weapons.Weapons[it.subCategory] ?? null;
        case 3: return ds.weapons.Ammo[it.subCategory] ?? null;
        case 4: return ds.weapons.Attachments[it.subCategory] ?? null;
        case 5: return ds.items.Armor[it.subCategory] ?? null;
        default: return null;
      }
    };
    initSounds(ds.manifest, (name, fallback) => mods.resolveAsset(name, fallback));
    setSoundFX(true);
    setMusicOn(true);
    const shell = new GameShell(ds, assets, canvas);
    (window as any).__c2 = { shell, ds, assets, mods };
    (window as any).__c2ModApi = {
      runtime: mods,
      load: (url?: string) => mods.load(url),
      installFile: (file: File) => mods.installFile(file),
      list: () => mods.mods.slice(),
      enable: (id: string) => mods.enable(id),
      disable: (id: string) => mods.disable(id),
      allowScripts,
    };
    mods.events.emit("game:boot", { shell, ds, assets, mods });
    // 测试/调试钩子：存档往返（makeSave/applySave）
    (window as any).__c2SaveSystem = { makeSave, applySave };
    (globalThis as any).__c2Story = Story;
    const input = new Input(canvas, () => shell.currentScreen);
    void input;
    game.setScene(shell);
    (window as any).__c2Game = game; // 探针/F1 调试句柄
    game.start();
  } catch (e) {
    drawLoading("启动失败: " + String(e));
  }
}
void main();
