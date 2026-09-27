// CalculatorPanel —— 原版 IsoEngine/Calculator.as 的公共移植（t99）
// 由 TradeWindow.buildCalculator 与 CaravanMenu.buildEqCalculator 合并而来；
// 两个调用方各自持有一个实例，UI/按键/指示灯/开关行为完全一致（原版也是两个 new Calculator()）。
import { Sprite, Graphics, BitmapObject } from "./Display";
import { EngineText } from "./EngineText";
import { Button, Switch } from "./Ui";
import { Indicator } from "./Indicator";
import type { AssetStore } from "./Assets";

export class CalculatorPanel {
  readonly ov = new Sprite();
  left!: EngineText;
  right!: EngineText;
  info!: EngineText;
  indicator!: Indicator;
  sw!: Switch;
  bulbBase: BitmapObject | null = null;
  bulbOff: BitmapObject | null = null;
  outOfRange: BitmapObject | null = null;
  private min = 1;
  private max = 1;
  private value = 1;
  private replaceValue = true;
  private done: ((v: number) => void) | null = null;
  private updateCb: (() => void) | null = null;
  private getText: (id: number) => string;

  constructor(assets: AssetStore, getText: (id: number) => string) {
    this.getText = getText;
    const ov = this.ov;
    // 全屏遮罩 0.75（原版 Calculator.as L49-52）
    const g = new Graphics();
    g.beginFill(0, 0.75);
    g.drawRect(0, 0, 880, 495);
    ov.graphics = g;
    ov.mouseEnabled = true; // 吞掉面板外点击（防止穿透到下方列表再次打开计算器）
    // 面板底色（原版 L53-59：333×440 @(285,43) beginFill(0,0.8) + BlurFilter）
    const panel = new Sprite();
    const pg = new Graphics();
    pg.beginFill(0, 0.8);
    pg.drawRect(0, 0, 333, 440);
    panel.graphics = pg;
    panel.mouseEnabled = false;
    panel.x = 285; panel.y = 43;
    ov.addChild(panel);
    // CalculatorBase.png（原版 L60-63 @(265,23)）；异步 ensure 回填（不能查 ov.parent：构造时尚未挂载）
    const attachBase = (im: any) => {
      const bb = new BitmapObject(im); bb.mouseEnabled = false;
      bb.x = 265; bb.y = 23;
      ov.addChildAt(bb, Math.min(1, ov.children.length));
    };
    const base = assets.getImage("CalculatorBase.png");
    if (base) attachBase(base);
    else void assets.ensure("CalculatorBase.png").then((im) => { if (im) attachBase(im); });
    // 左右信息文本（原版 L64-67：12179693，14px，multiline+wordWrap）
    this.left = new EngineText("", 12179693, 14, "center", 10, 30, 245, 455, true, true);
    ov.addChild(this.left);
    this.right = new EngineText("", 12179693, 14, "center", 625, 30, 245, 455, true, true);
    ov.addChild(this.right);
    // 七段数码管（原版 L68-74 @(314,78) + GlowFilter）
    const ind = new Indicator(assets, 14, 16769240, false, null, 8, 15, 18.8);
    ind.x = 314; ind.y = 80;
    ind.setValue(0);
    ov.addChild(ind);
    this.indicator = ind;
    // CalculatorGlass.png（原版 L75-78 @(265,23)）；异步回填插在数码管之后按钮之前
    const attachGlass = (im: any) => {
      const gb = new BitmapObject(im); gb.mouseEnabled = false;
      gb.x = 265; gb.y = 23;
      ov.addChildAt(gb, Math.min(4, ov.children.length));
    };
    const glass = assets.getImage("CalculatorGlass.png");
    if (glass) attachGlass(glass);
    else void assets.ensure("CalculatorGlass.png").then((im) => { if (im) attachGlass(im); });
    // 23 键（原版 L79-106：col0/4、row3 非 col2 → Button(4) 红；数字 → Button(3) 深；OK(index21) → Button(5)）
    const labels = ["-1", "1", "2", "3", "+1", "-10", "4", "5", "6", "+10", "-100", "7", "8", "9", "+100", "-1K", "DEL", "0", "AC", "+1K", "MIN", "OK", "MAX"];
    for (let i = 0; i < labels.length; i++) {
      let col = i % 5, row = Math.floor(i / 5);
      if (i === 22) col = 4; // 原版 L100-101：MAX 强制 col=4
      let type = 3;
      if (col === 0 || col === 4 || (row === 3 && col !== 2) || i === 22) type = 4;
      if (i === 21) type = 5;
      const b = new Button(type, () => this.press(labels[i]), labels[i], assets);
      b.x = 315 + col * 54;
      b.y = 213 + row * 44;
      ov.addChild(b);
    }
    // info（原版 L107-109 @(290,150) alpha 0.5）
    this.info = new EngineText("", 16777215, 12, "center", 290, 150, 300, 20);
    this.info.alpha = 0.5;
    ov.addChild(this.info);
    // ON/OFF 开关（原版 L110-119：Switch(4) @(495,183)；关闭即开关状态复位）
    const sw = new Switch(4, true, () => this.close(), () => this.close(), null, null, 0, 0, true, assets);
    sw.x = 495; sw.y = 183;
    ov.addChild(sw);
    this.sw = sw; // 供宿主 update(dt) 驱动滑块动画
    const onT = new EngineText("ON", 16777215, 13, "left", 547, 180, 30, 20); onT.alpha = 0.5; ov.addChild(onT);
    const offT = new EngineText("OFF", 16777215, 13, "left", 463, 180, 30, 20); offT.alpha = 0.5; ov.addChild(offT);
    // 指示灯（原版 L120-135：BulbBase@(315,183) + BulbLightRedOff@(312,180) + outOfRange=BulbLightRedOn@(311,179) + ERROR@(332,180)）
    // 三个灯按固定 z 序（base < off < on）挂在 ERROR 文本之前
    const errT = new EngineText("ERROR", 16777215, 13, "left", 332, 180, 130, 20); errT.alpha = 0.5;
    const orderBulbs = () => {
      const list = [this.bulbBase, this.bulbOff, this.outOfRange].filter((b): b is BitmapObject => !!b && !!b.parent);
      if (!list.length) return;
      const errIdx = ov.children.indexOf(errT);
      const insertAt = errIdx >= 0 ? errIdx : ov.children.length;
      for (const b of list) ov.removeChild(b);
      for (let i = 0; i < list.length; i++) ov.addChildAt(list[i], Math.min(insertAt + i, ov.children.length));
    };
    const ensureBulb = (imgName: string, x: number, y: number, isOutOfRange = false) => {
      const attach = (bmp: BitmapObject) => {
        bmp.mouseEnabled = false; bmp.x = x; bmp.y = y;
        if (isOutOfRange) {
          bmp.visible = false; this.outOfRange = bmp; this.refreshOutOfRange();
        } else if (imgName === "BulbBase.png") this.bulbBase = bmp;
        else this.bulbOff = bmp;
        ov.addChild(bmp);
        orderBulbs();
      };
      const im = assets.getImage(imgName);
      if (im) { attach(new BitmapObject(im)); return; }
      void assets.ensure(imgName).then((i2) => { if (i2) attach(new BitmapObject(i2)); });
    };
    ensureBulb("BulbBase.png", 315, 183);
    ensureBulb("BulbLightRedOff.png", 312, 180);
    ensureBulb("BulbLightRedOn.png", 311, 179, true);
    ov.addChild(errT);
    ov.visible = false;
  }

  get visible(): boolean { return this.ov.visible; }
  get v(): number { return this.value; }
  get maxV(): number { return this.max; }
  setValue(v: number) {
    this.value = Math.max(this.min, Math.min(this.max, v));
    this.replaceValue = true;
    this.indicator.setValue(this.value, 6, true);
    this.refreshOutOfRange();
    this.updateCb?.();
  }

  /** 打开（原版 Calculator.setValue 尾部：info/左右文本/开关复位/数码管/outOfRange）+ 挂载到宿主 screen */
  open(screen: Sprite, min: number, max: number, done: (v: number) => void, updateCb?: () => void, infoText?: string) {
    this.min = min; this.max = max;
    this.done = done;
    this.updateCb = updateCb ?? null;
    this.value = Math.min(1, max); // Original TradeWindow opens at one, not at its 0.1 minimum.
    this.replaceValue = true;
    this.info.text = infoText || this.getText(1214) || "How many units?";
    this.right.text = "";
    this.left.text = "";
    if (this.sw) this.sw.setPosition(true);
    if (this.indicator) this.indicator.setValue(this.value, 6, true);
    this.refreshOutOfRange();
    if (this.updateCb) this.updateCb();
    this.ov.visible = true;
    this.ov.parent?.removeChild(this.ov);
    screen.addChild(this.ov);
  }

  close() {
    if (this.ov.parent) this.ov.parent.removeChild(this.ov);
    this.ov.visible = false;
    this.done = null;
    this.updateCb = null;
  }

  private refreshOutOfRange() {
    if (!this.outOfRange) return;
    (this.outOfRange as BitmapObject).visible = this.value < this.min || this.value > this.max;
  }

  private press(label: string) {
    const v = this.value;
    if (label === "OK") {
      let val = this.value;
      if (val < this.min) val = this.min;
      if (val > this.max) { this.info.text = this.getText(1359); return; }
      const done = this.done;
      this.close();
      if (done) done(val); // MAX must transfer the exact remainder, not a rounded quantity.
      return;
    }
    if (label === "AC") this.value = 0;
    else if (label === "MIN") { this.value = this.min; if (this.value < 0) this.value = 0; }
    else if (label === "MAX") { this.value = this.max; if (this.value > 99999999999999) this.value = 99999999999999; }
    else if (label === "DEL") this.value = v > 9 ? Math.floor(v / 10) : 0;
    else if (label === "-1") this.value = v - 1;
    else if (label === "+1") this.value = v + 1;
    else if (label === "-10") this.value = v - 10;
    else if (label === "+10") this.value = v + 10;
    else if (label === "-100") this.value = v - 100;
    else if (label === "+100") this.value = v + 100;
    else if (label === "-1K") this.value = v - 1000;
    else if (label === "+1K") this.value = v + 1000;
    else {
      const d = Number(label);
      this.value = (v === 0 || this.replaceValue) ? d : Number(String(v) + label);
    }
    this.replaceValue = !/^\d$/.test(label);
    if (this.value > 99999999999999) this.value = 99999999999999;
    if (this.value < 0) this.value = 0;
    if (this.indicator) this.indicator.setValue(this.value, 6, true);
    this.refreshOutOfRange();
    if (this.updateCb) this.updateCb();
  }
}
