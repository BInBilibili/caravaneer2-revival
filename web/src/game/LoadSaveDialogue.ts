// 存档对话：槽位列表 + 保存/读取/删除（标题界面=读取模式，游戏中=S键保存/读取）
import { Sprite, Graphics, ClipSprite } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { Button, ScrollableArea } from "../core/Ui";
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import { SAVE_SLOTS, type SaveSlots } from "./SaveSystem";
import { sfxClick } from "../core/Sound";
import { addDialogueBackground } from "../core/DialogueBg";
import { YesNoDialogue } from "./YesNoDialogue";

export interface SaveDialogueHooks {
  onSave: (slot: number, name?: string) => boolean | void;
  onLoad: (slot: number) => void;
  onDelete: (slot: number) => void;
  onClose: () => void;
  onImport: (slot: number) => void;
  onExport: () => void;
}

export class LoadSaveDialogue {
  readonly screen = new Sprite();
  private rows: Array<{ disp: Sprite; save: Sprite | null; load: Sprite; del: Sprite }> = [];
  private nameCleanup: (() => void) | null = null;

  constructor(
    private ds: DataStore, private assets: AssetStore, private slots: SaveSlots, private hooks: SaveDialogueHooks,
  ) {}

  private text(id: number) { return getText(this.ds, id, this.ds.language); }

  show(mode: "save" | "load") {
    if (mode === "load") this.showLoad();
    else this.showSave();
  }

  private showSave() { this.showModal("save"); }
  private showLoad() { this.showModal("load"); }

  close() { this.nameCleanup?.(); this.screen.visible = false; }

  /** TextField input counterpart: 40 characters, preselected name, original (75,198) panel. */
  private askName(slot: number, name: string) {
    this.nameCleanup?.();
    const overlay = new Sprite(), g = new Graphics();
    g.beginFill(0, .5); g.drawRect(0, 0, 880, 495); overlay.graphics = g;
    addDialogueBackground(overlay, this.assets, 75, 198, 500, 100, 0, undefined, false);
    overlay.addChild(new EngineText(this.text(1444).toUpperCase(), 0xffffff, 16, 'center', 85, 208, 480, 30));
    const input = document.createElement('input');
    input.value = name; input.maxLength = 40; input.setAttribute('aria-label', this.text(1444));
    input.style.cssText = 'position:fixed;box-sizing:border-box;background:#484038;color:white;border:1px inset #888;text-align:center;padding:0;font:14px "Microsoft YaHei","Microsoft JhengHei","Noto Sans SC","SimHei",Arial,sans-serif;z-index:200;outline:none;';
    const place = () => {
      const r = document.querySelector('canvas')?.getBoundingClientRect() ?? {left:0,top:0,width:880,height:495};
      input.style.left = (r.left + 95 * r.width / 880) + 'px'; input.style.top = (r.top + 238 * r.height / 495) + 'px';
      input.style.width = (460 * r.width / 880) + 'px'; input.style.height = (20 * r.height / 495) + 'px'; input.style.fontSize = (14 * r.height / 495) + 'px';
    };
    const done = () => { const value = input.value.slice(0, 40); this.nameCleanup?.(); if (this.hooks.onSave(slot, value) !== false) this.close(); };
    const cancel = () => this.nameCleanup?.();
    for (const [x, id, fn] of [[112, 1439, done], [332, 634, cancel]] as const) {
      const b = new Button(2, fn, this.text(id).toUpperCase(), this.assets); b.x = x; b.y = 265; overlay.addChild(b);
    }
    this.screen.addChild(overlay);
    this.nameCleanup = () => { input.remove(); window.removeEventListener('resize', place); overlay.parent?.removeChild(overlay); this.nameCleanup = null; };
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing) done(); if (e.key === 'Escape') cancel(); });
    document.body.appendChild(input); place(); window.addEventListener('resize', place); input.focus(); input.select();
  }

  /** Original IsoEngine.LoadSaveDialogue: 400×430 at (125,33), not stage-centred. */
  private showModal(mode: "save" | "load") {
    this.nameCleanup?.();
    const saving = mode === "save";
    const S = this.screen;
    S.removeAll();
    this.rows = [];
    const backdrop = new Graphics();
    backdrop.beginFill(0, 0.5);
    backdrop.drawRect(0, 0, 880, 495);
    S.graphics = backdrop; // Also intercept clicks outside the modal.

    const panel = new Sprite();
    panel.x = 125; panel.y = 33;
    S.addChild(panel);
    // Original foreground texture is masked to text, not laid over the whole panel.
    addDialogueBackground(panel, this.assets, 0, 0, 400, 430, 0, undefined, false);
    const separators = new Sprite();
    separators.mouseEnabled = false;
    const sg = new Graphics();
    for (const y of [45, 313]) {
      for (const [dy, color, alpha] of [[-2, 0, 34 / 255], [-1, 0, 102 / 255], [0, 0xffffff, 51 / 255], [1, 0xffffff, 17 / 255]]) {
        sg.beginFill(color, alpha);
        sg.drawRect(3, y + dy, 394, 1);
      }
    }
    separators.graphics = sg;
    panel.addChild(separators);
    panel.addChild(new EngineText(this.text(saving ? 1433 : 1434).toUpperCase(), 0xffffff, 20, "center", 10, 10, 380, 30));

    const frame = new Sprite();
    frame.x = 20; frame.y = 60;
    const fg = new Graphics();
    fg.beginFill(4735032);
    fg.drawRect(0, 0, 360, 210);
    fg.endFill();
    fg.lineStyle(1, 0xffffff, 0.3);
    fg.moveTo(361, -1); fg.lineTo(361, 211); fg.lineTo(-1, 211);
    fg.lineStyle(1, 0, 0.6);
    fg.lineTo(-1, -1); fg.lineTo(361, -1);
    frame.graphics = fg;
    panel.addChild(frame);
    // AS3 arguments (3, 10) mean style=3, width=10; Web takes width then wheel step.
    const list = new ScrollableArea(350, 210, 350, 210, true, false, false, 10, 10, this.assets);
    list.x = 20; list.y = 60;
    panel.addChild(list);

    // Sorting must not change the underlying sparse storage indices.
    const entries = this.slots.list().filter(e => e !== null).map(e => {
      const data = this.slots.load(e.index);
      const generatedName = data && e.name === data.name + " — Day " + data.day;
      return { ...e, name: generatedName ? data!.name : e.name };
    }).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    if (saving) entries.unshift({ index: -1, name: "< " + this.text(1442) + " >", date: "", day: 0, money: 0 });
    let selected = entries[0];
    const rows: Array<{ bg: Sprite; text: EngineText }> = [];
    entries.forEach((entry, i) => {
      const row = new ClipSprite(350, 20);
      row.y = i * 20; row.mouseChildren = false; row.buttonMode = true;
      row.graphics = new Graphics();
      row.graphics.hitRect(0, 0, 350, 20);
      const bg = new Sprite();
      bg.graphics = new Graphics();
      bg.graphics.beginFill(0xffffff); bg.graphics.drawRect(0, 0, 350, 20);
      bg.visible = i === 0;
      row.addChild(bg);
      const text = new EngineText(entry.name, i === 0 ? 4735032 : 0xffffff, 14, "center", 0, 0, 350, 20);
      row.addChild(text);
      rows.push({ bg, text });
      row.addEventListener("click", () => {
        selected = entry;
        rows.forEach((r, n) => { r.bg.visible = n === i; r.text.color = n === i ? 4735032 : 0xffffff; });
      });
      list.addContent(row);
    });
    list.updateSize();

    const confirm = new YesNoDialogue(this.ds, this.assets);
    confirm.graphics = new Graphics();
    confirm.graphics.beginFill(0, 0.5);
    confirm.graphics.drawRect(0, 0, 880, 495);
    confirm.visible = false;
    const button = (id: number, y: number, action: () => void, enabled = true) => {
      const b = new Button(2, () => { if (enabled) action(); }, this.text(id).toUpperCase(), this.assets);
      b.x = 97; b.y = y;
      b.mouseChildren = false;
      b.mouseEnabled = enabled;
      b.alpha = enabled ? 1 : 0.45;
      panel.addChild(b);
    };
    button(saving ? 1439 : 1440, 277, () => {
      if (!selected) return;
      if (!saving) { this.hooks.onLoad(selected.index); return; }
      const entry = selected;
      if (entry.index < 0) {
        const d = new Date(), two = (n: number) => String(n).padStart(2, '0');
        const name = d.getFullYear() + '-' + two(d.getMonth()+1) + '-' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
        this.askName(this.slots.nextManualSlot(), name);
      } else confirm.show(this.text(1443), () => this.askName(entry.index, entry.name));
    }, !!selected);
    button(saving ? 1437 : 1438, 327, () => {
      if (saving) { this.hooks.onExport(); return; }
      // A single file button replaces per-slot import. Prefer free storage; never silently overwrite.
      this.hooks.onImport(this.slots.nextManualSlot());
    });
    button(6895, 357, () => {
      if (!selected || selected.index < 0) return;
      const index = selected.index;
      confirm.show(this.text(6896).replace("@slotname@", selected.name), () => this.hooks.onDelete(index));
    }, !!selected);
    button(634, 387, () => { this.close(); this.hooks.onClose(); });
    S.addChild(confirm);
    S.visible = true;
  }

  refresh(mode: "save" | "load") { this.show(mode); }
}
