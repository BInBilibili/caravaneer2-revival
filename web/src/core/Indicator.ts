// Indicator：七段数码管（原版 Interface.Indicator）
// 14 位数字 + 可选小数点位；使用 IndicatorBase.png + IndicatorSegment1-8.png 贴图
// 构造参数对齐原版：new Indicator(digits, withBG, segColor, bgColor, scaleX%, scaleY%, spacing)
// 计算器用法：new Indicator(14,false,16769240,null,8,15,18.8)
import { Sprite, BitmapObject, Graphics, type DisplayObject } from "./Display";
import type { AssetStore } from "./Assets";

const SEGMENTS: number[][] = [
  [1, 2, 3, 5, 6, 7], // 0
  [3, 6],             // 1
  [1, 3, 4, 5, 7],    // 2
  [1, 3, 4, 6, 7],    // 3
  [2, 3, 4, 6],       // 4
  [1, 2, 4, 6, 7],    // 5
  [1, 2, 4, 5, 6, 7], // 6
  [1, 3, 6],          // 7
  [1, 2, 3, 4, 5, 6, 7], // 8
  [1, 2, 3, 4, 6, 7], // 9
];

interface Digit {
  display: Sprite;
  segs: DisplayObject[]; // 1-8
  dot: DisplayObject | null;
}

export class Indicator extends Sprite {
  private digits: Digit[] = [];
  private assets: AssetStore;
  constructor(
    assets: AssetStore,
    n = 3,
    segColor: number | null = null, // 无贴图时用 Graphics 画段
    withBG = false, // 原版 param2：带 IndicatorBase 底
    bgColor: number | null = null,
    scaleX = 100, scaleY = 200, spacing = 15,
  ) {
    super();
    this.assets = assets;
    for (let i = 0; i < n; i++) {
      const display = new Sprite();
      const segs: DisplayObject[] = [];
      let dot: DisplayObject | null = null;
      for (let s = 1; s <= 8; s++) {
        // 原版 Indicator.as：param2=false（计算器）→ 不用 Segment 贴图，用 Graphics 矢量绘制
        // （drawSegment 画 100×200 逻辑尺寸，Display.scaleX=param5/100、scaleY=param6/200 缩放）
        // 贴图路径（param2=true）仅用于带底座的仪表盘；计算器必须走矢量，否则 Segment 14×16 贴图
        // 在 scale 0.08 下只有 ~1.1px 宽，数字完全不可见
        let ob: DisplayObject;
        if (segColor != null) {
          const sp = new Sprite();
          const g = new Graphics();
          this.drawSegment(g, s, segColor);
          sp.graphics = g;
          ob = sp;
        } else {
          const img = assets.getImage("IndicatorSegment" + s + ".png");
          if (img) {
            ob = new BitmapObject(img);
          } else {
            const sp = new Sprite();
            const g = new Graphics();
            this.drawSegment(g, s, 16769240);
            sp.graphics = g;
            ob = sp;
          }
        }
        ob.visible = false;
        ob.mouseEnabled = false;
        display.addChild(ob);
        segs.push(ob);
      }
      display.scaleX = scaleX / 100;
      display.scaleY = scaleY / 200;
      display.x = (n - 1) * spacing - i * spacing;
      this.addChild(display);
      this.digits.push({ display, segs, dot: null });
    }
  }

  // 原版 Indicator.drawSegment：100x200 逻辑尺寸的段形状
  private drawSegment(g: Graphics, seg: number, color: number) {
    const S = 20, T = 7;
    g.beginFill(color);
    switch (seg) {
      case 1: g.moveTo(T, 0); g.lineTo(100 - T, 0); g.lineTo(100 - T - S, S); g.lineTo(S + T, S); break;
      case 2: g.moveTo(0, T); g.lineTo(0, 100 - T); g.lineTo(S, 100 - S - T); g.lineTo(S, S + T); break;
      case 3: g.moveTo(100, T); g.lineTo(100, 100 - T); g.lineTo(100 - S, 100 - S - T); g.lineTo(100 - S, S + T); break;
      case 4: g.moveTo(T, 100); g.lineTo(S + T, 100 - S / 2); g.lineTo(100 - S - T, 100 - S / 2); g.lineTo(100 - T, 100); g.lineTo(100 - S - T, 100 + S / 2); g.lineTo(S + T, 100 + S / 2); break;
      case 5: g.moveTo(0, 100 + T); g.lineTo(0, 200 - T); g.lineTo(S, 200 - S - T); g.lineTo(S, 100 + S / 2 + T); break;
      case 6: g.moveTo(100, 100 + T); g.lineTo(100, 200 - T); g.lineTo(100 - S, 200 - S - T); g.lineTo(100 - S, 100 + S / 2 + T); break;
      case 7: g.moveTo(T, 200); g.lineTo(100 - T, 200); g.lineTo(100 - S - T, 200 - S); g.lineTo(S + T, 200 - S); break;
      case 8: g.moveTo(110, 210); g.lineTo(110 + S * 2, 210); g.lineTo(110 + S * 2, 210 - S * 3); break;
    }
    g.endFill();
  }

  setValue(v: number, decimals = 0, trim = false) {
    let s = String(Math.round(v * Math.pow(10, decimals)));
    while (s.length < decimals + 1) s = "0" + s;
    let dec = decimals;
    if (trim) {
      while (s.length > 1 && s.endsWith("0") && dec > 0) { s = s.slice(0, -1); dec--; }
    }
    if (trim && s.length > this.digits.length) {
      const intLen = s.length - dec;
      if (intLen < this.digits.length) { s = s.slice(0, this.digits.length); dec = this.digits.length - intLen; }
      else { s = s.slice(0, intLen); dec = 0; }
    }
    for (let i = 0; i < this.digits.length; i++) {
      const d = this.digits[i];
      for (let k = 1; k <= 7; k++) d.segs[k - 1].visible = false;
      const ch = s.charAt(s.length - i - 1);
      const num = Number(ch);
      if (i < s.length && !isNaN(num)) {
        for (const seg of SEGMENTS[num]) d.segs[seg - 1].visible = true;
      }
      // 小数点（Segment8）：i != 0 且 dec == i
      d.segs[7].visible = i !== 0 && dec === i;
    }
  }
}
