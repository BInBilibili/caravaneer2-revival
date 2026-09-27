// 引导场景：加载数据层 → 显示标题画面 + 数据加载验证面板
import type { Game, Scene } from "../core/Game";
import { loadDataStore, getText, languageIndex, type DataStore } from "../core/DataStore";

export class BootScene implements Scene {
  private title: HTMLImageElement | null = null;
  private ds: DataStore | null = null;
  private error = "";
  private overlay: HTMLDivElement | null = null;

  constructor(private game: Game) {
    this.load();
  }

  private async load() {
    try {
      this.ds = await loadDataStore(languageIndex("zh") ?? 1);
      const m = this.ds.manifest;
      const key = Object.keys(m.images).find((k) => /^TitleScreen\./i.test(k));
      if (!key) throw new Error("manifest 缺少 TitleScreen");
      const img = new Image();
      img.onload = () => { this.title = img; };
      img.onerror = () => { this.error = "标题图加载失败: " + m.images[key][0]; };
      img.src = m.images[key][0];
      this.makeOverlay();
    } catch (e) {
      this.error = String(e);
    }
  }

  private makeOverlay() {
    if (!this.ds) return;
    const d = this.ds;
    const el = document.createElement("div");
    el.id = "data-overlay";
    el.style.cssText = `position:fixed;right:8px;top:8px;background:rgba(0,0,0,.72);color:#7f7;font:12px "Microsoft YaHei","Microsoft JhengHei","Noto Sans SC","SimHei",Arial,sans-serif;padding:8px 10px;border-radius:6px;z-index:99;white-space:pre;pointer-events:none`;
    const zh = languageIndex("zh") ?? 1;
    el.textContent = [
      "Data layer OK",
      "texts ids: " + Object.keys(d.texts).length,
      "dialogues entries: " + Object.keys(d.dialogues.entries).length,
      "responses: " + Object.keys(d.dialogues.responses).length,
      "town_presets: " + (Array.isArray(d.presets.town_presets?.[0]) ? d.presets.town_presets[0].length : "?"),
      "images: " + Object.keys(d.manifest.images).length,
      "",
      "EN[3]: " + getText(d, 3, 1),
      "ZH[3]: " + getText(d, 3, zh),
      "EN[25]: " + getText(d, 25, 1),
      "ZH[25]: " + getText(d, 25, zh),
    ].join("\n");
    document.body.appendChild(el);
    this.overlay = el;
  }

  update(_dt: number) {}

  render(ctx: CanvasRenderingContext2D) {
    if (this.title) {
      ctx.drawImage(this.title, 0, 0, this.game.width, this.game.height);
    } else if (this.error) {
      ctx.fillStyle = "#fff";
      ctx.font = '20px "Microsoft YaHei","Microsoft JhengHei","Noto Sans SC","SimHei",Arial,sans-serif';
      ctx.fillText(this.error, 40, 200);
    } else {
      ctx.fillStyle = "#888";
      ctx.font = '16px "Microsoft YaHei","Microsoft JhengHei","Noto Sans SC","SimHei",Arial,sans-serif';
      ctx.fillText("Caravaneer 2 HTML5 — 加载资源中…", 40, 200);
    }
  }
}

