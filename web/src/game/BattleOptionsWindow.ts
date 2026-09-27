// 战斗内设置窗口（对应 AS3 IsoEngine.BattleOptionsWindow）
// 布局按原版：半透明黑幕 + 中央面板（标题 + 4 个开关行 + FullScreen/Exit Game/Continue 按钮）
// Exit Game → 确认对话框（5637 + YES/NO）；Continue → onClose；开关即时生效
import { Sprite, Graphics } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { Switch, Button } from "../core/Ui";
import { addDialogueBackground } from "../core/DialogueBg";
import { setSoundFX, isSoundFXOn } from "../core/Sound";
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import type { GameData } from "./World";
import { YesNoDialogue } from "./YesNoDialogue";

export interface BattleOptionsHooks {
  onClose: () => void;
  onExitGame: () => void;
  /** 网格显隐（Battle 网格线） */
  onToggleShowGrid?: (v: boolean) => void;
  /** 全屏切换（HTML5 Fullscreen API） */
  onToggleFullScreen?: () => void;
}

const SWITCH_ROWS: Array<{ textId: number; get: (g: BattleOptionsWindow) => boolean; apply: (g: BattleOptionsWindow, v: boolean) => void }> = [
  { textId: 5634, get: (g) => g.gd.autoCenter, apply: (g, v) => { g.gd.autoCenter = v; } },
  { textId: 5635, get: (g) => g.gd.walkAnimationSpeed !== 1, apply: (g, v) => { g.gd.walkAnimationSpeed = v ? 2 : 1; } },
  { textId: 5636, get: (g) => g.gd.showGrid, apply: (g, v) => { g.gd.showGrid = v; g.hooks.onToggleShowGrid?.(v); } },
  { textId: 6892, get: () => isSoundFXOn(), apply: (_g, v) => { setSoundFX(v); } },
];

export class BattleOptionsWindow extends Sprite {
  private panel = new Sprite();
  private switches: Switch[] = [];
  private confirmDlg: YesNoDialogue | null = null;
  private panelVisible = true;
  gd: GameData; // 开关回调读取（autoCenter/walkAnimationSpeed/showGrid）
  hooks: BattleOptionsHooks;

  constructor(
    private ds: DataStore,
    gd: GameData,
    private assets: AssetStore,
    hooks: BattleOptionsHooks,
  ) {
    super();
    this.gd = gd;
    this.hooks = hooks;
    this.build();
  }

  private text(id: number) { return getText(this.ds, id, this.ds.language); }

  private build() {
    // 半透明黑幕（原版 BG beginFill(0,0.5)）
    const bg = new Sprite();
    const bgG = new Graphics();
    bgG.beginFill(0, 0.5);
    bgG.drawRect(0, 0, 880, 495);
    bg.graphics = bgG;
    // 遮罩必须参与命中测试，避免设置打开时点击穿透到底层战斗按钮。
    bg.mouseEnabled = true;
    this.addChild(bg);
    // 面板内容（原版 maxWidth 动态测量：先量再建标题）
    const titleText = this.text(36).toUpperCase();
    const rowTexts = SWITCH_ROWS.map((r, i) => new EngineText(this.text(r.textId).toUpperCase(), 16777215, 14, "left", 50, 50 + i * 50, 880, 20));
    let maxWidth = new EngineText(titleText, 16777215, 16, "center", 0, 0, 880, 20).textWidth;
    for (const t of rowTexts) maxWidth = Math.max(maxWidth, t.textWidth + 50);
    maxWidth = Math.max(maxWidth, 200);
    const title = new EngineText(titleText, 16777215, 16, "center", 10, 9, maxWidth, 20);
    const fullScreenSpace = this.hooks.onToggleFullScreen ? 30 : 0;
    const panelW = maxWidth + 20;
    const panelH = SWITCH_ROWS.length * 50 + 120 + fullScreenSpace;
    // 面板
    addDialogueBackground(this.panel, this.assets, 0, 0, panelW, panelH, 0, "InterfaceBackground.png", false);
    this.panel.x = 440 - panelW / 2;
    this.panel.y = 248 - panelH / 2;
    // 标题
    this.panel.addChild(title);
    // 开关行
    for (let i = 0; i < SWITCH_ROWS.length; i++) {
      const row = SWITCH_ROWS[i];
      this.panel.addChild(rowTexts[i]);
      const sw = new Switch(1, row.get(this), () => this.activate(i, true), () => this.activate(i, false), null, null, 16, 16, true, this.assets);
      sw.x = 10;
      sw.y = 35 + i * 50;
      this.panel.addChild(sw);
      this.switches.push(sw);
    }
    // 按钮（原版 x=(maxWidth+20)/2-103，y 依序 247/277/307）
    const btnX = panelW / 2 - 103;
    let by = 50 + (SWITCH_ROWS.length - 1) * 50 + 47;
    if (this.hooks.onToggleFullScreen) {
      const fs = new Button(2, () => { this.hooks.onToggleFullScreen?.(); }, this.text(7031).toUpperCase(), this.assets);
      fs.x = btnX; fs.y = by;
      this.panel.addChild(fs);
      by += 30;
    }
    const exit = new Button(2, () => { this.openConfirm(); }, this.text(1435).toUpperCase(), this.assets);
    exit.x = btnX; exit.y = by;
    this.panel.addChild(exit);
    const cont = new Button(2, () => { this.close(); }, this.text(1436).toUpperCase(), this.assets);
    cont.x = btnX; cont.y = by + 30;
    this.panel.addChild(cont);
    this.addChild(this.panel);
  }

  private activate(i: number, v: boolean) {
    SWITCH_ROWS[i].apply(this, v);
  }

  private openConfirm() {
    this.panelVisible = false;
    this.panel.visible = false;
    if (!this.confirmDlg) {
      this.confirmDlg = new YesNoDialogue(this.ds, this.assets, false);
      this.confirmDlg.visible = false;
      this.addChild(this.confirmDlg);
    }
    const gender = this.gd.Caravans[0]?.People[0]?.gender ?? 1;
    this.confirmDlg.show(
      getText(this.ds, 5637, this.ds.language, gender).toUpperCase(),
      () => this.hooks.onExitGame(),
      () => this.backToPanel(),
    );
  }

  private backToPanel() {
    this.panelVisible = true;
    this.panel.visible = true;
  }

  private close() {
    this.hooks.onClose();
    this.visible = false;
  }

  /** 重新打开时同步开关初始值（外部 Battle 打开时调用） */
  refresh() {
    for (let i = 0; i < SWITCH_ROWS.length; i++) {
      this.switches[i].setPosition(SWITCH_ROWS[i].get(this));
    }
  }

  remove() {
    this.removeAll();
  }
}
