// 统一确认/消息对话框（对应 AS3 IsoEngine.YesNoDialogue）
// API 对齐原版：setText(text) / onApprove / onCancel / visible / dontClose / dontRemoveFunctions
// 布局：半透明黑幕 + 500x200 面板 @(190,148) 居中；双按钮=是(918)/否(919)，单按钮=好(1181)；
// 长文本自动加高面板（原版 setText 的 textHeight 自适应）
import { Sprite, Graphics } from "../core/Display";
import { addDialogueBackground } from "../core/DialogueBg";
import { EngineText } from "../core/EngineText";
import { Button } from "../core/Ui";
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";

export class YesNoDialogue extends Sprite {
  D = new Sprite();
  BG!: Sprite;
  cancelButton: Button | null = null;
  approveButton!: Button;
  onCancel: () => void = () => {};
  onApprove: () => void = () => {};
  text!: EngineText;
  dontClose = false;
  dontRemoveFunctions = false;
  private pressedInside = false;

  constructor(
    private ds: DataStore,
    private assets: AssetStore,
    oneButton = false,
    x = 190,
    y = 148,
  ) {
    super();
 // t90：无视觉黑幕，保留全屏透明命中拦截（点弹窗外不穿透到底下按钮）
    this.BG = new Sprite();
    this.BG.mouseEnabled = true;
    // 透明命中区：拦截点击穿透到下层地图（原版黑幕语义）
    const hit = new Graphics();
    hit.hitRect(0, 0, 880, 495);
    const hitSp = new Sprite();
    hitSp.graphics = hit;
    hitSp.mouseEnabled = false;
    this.BG.addChild(hitSp);
    this.BG.addEventListener("pointerdown", () => { this.pressedInside = true; });
    this.addChild(this.BG);
    this.onCancel = () => {};
    this.onApprove = () => {};
    this.D.x = x;
    this.D.y = y;
    this.buildPanel(500, 200, oneButton);
    this.addChild(this.D);
  }

  private buildPanel(w: number, h: number, oneButton: boolean) {
    // 原版 YesNoDialogue.as：D = new Dialogue(500,200) — 纹理 + 高光/阴影边框
    // t84：面板使用 InterfaceBackground 纹理（原版 Dialogue.as 语义）
    addDialogueBackground(this.D, this.assets, 0, 0, w, h, 0.1, "InterfaceBackground.png", false);
    const g = new Graphics();
    g.hitRect(0, 0, w, h);
    g.lineStyle(1, 8222317);
    g.drawRect(0, 0, w, h);
    g.lineStyle(1, 4210752);
    g.drawRect(1, 1, w - 2, h - 2);
    this.D.graphics = g;
    this.text = new EngineText("", 16777215, 14, "center", 10, 10, w - 20, 140, true, true);
    this.D.addChild(this.text);
    if (!oneButton) {
      this.cancelButton = new Button(2, () => { this.press(); this.cancelFunction(); }, this.getText(919).toUpperCase(), this.assets);
      this.cancelButton.x = 270; this.cancelButton.y = 160;
      this.D.addChild(this.cancelButton);
      this.approveButton = new Button(2, () => { this.press(); this.approveFunction(); }, this.getText(918).toUpperCase(), this.assets);
      this.approveButton.x = 30; this.approveButton.y = 160;
    } else {
      this.cancelButton = null;
      this.approveButton = new Button(2, () => { this.press(); this.approveFunction(); }, this.getText(1181).toUpperCase(), this.assets);
      this.approveButton.x = 147; this.approveButton.y = 160;
    }
    this.D.addChild(this.approveButton);
  }

  private getText(id: number) { return getText(this.ds, id, this.ds.language); }

  private press() { this.pressedInside = true; }

  cancelFunction() {
    if (!this.pressedInside) return false;
    this.onCancel();
    this.visible = false;
    if (!this.dontRemoveFunctions) { this.onCancel = () => {}; this.onApprove = () => {}; }
    this.pressedInside = false;
    return true;
  }

  approveFunction() {
    if (!this.pressedInside) return false;
    this.onApprove();
    if (!this.dontClose) this.visible = false;
    this.dontClose = false;
    if (!this.dontRemoveFunctions) { this.onCancel = () => {}; this.onApprove = () => {}; }
    this.pressedInside = false;
    return true;
  }

  /** 文本 + 居中；超长自动加高面板（原版 setText 语义） */
  setText(t: string) {
    this.text.text = t;
    this.text.y = 80 - this.text.textHeight / 2 - 2;
    if (this.text.textHeight > 136) {
      // 重建面板为 (500, textHeight+72)，按钮下移
      const px = this.D.x, py = this.D.y - (this.text.textHeight + 4 - 140) / 2;
      const oneButton = !this.cancelButton;
      this.D.removeAll();
      this.buildPanel(500, this.text.textHeight + 72, oneButton);
      this.D.x = px;
      this.D.y = py;
      this.text.text = t;
      this.text.y = 20;
      this.approveButton.y = 20 + this.text.textHeight + 12;
      if (this.cancelButton) this.cancelButton.y = this.approveButton.y;
      this.addChild(this.D);
    }
  }

  /** 便捷：显示文本 + 回调（复用组件避免零散弹窗）；onCancel 缺省=仅关闭 */
  show(text: string, onApprove?: () => void, onCancel?: () => void) {
    this.dontRemoveFunctions = true;
    this.onApprove = () => { this.dontRemoveFunctions = false; onApprove?.(); };
    this.onCancel = () => { this.dontRemoveFunctions = false; onCancel?.(); };
    this.dontClose = false;
    this.pressedInside = true; // 编程方式打开：直接允许按钮（不要求用户先点一次）
    this.setText(text);
    this.visible = true;
  }

  remove() {
    this.removeAll();
  }
}
