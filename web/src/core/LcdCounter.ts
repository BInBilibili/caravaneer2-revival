// LcdCounter：对齐原版 Interface.Counter —— 12 位 LCD 机械计数条 + 里程表滚动动画
// 原版（Counter.as L200-240 EF）：每位 10x11 窗口；值变化后每 25fps 帧向目标移动 1/7 格
// （差>5 反向绕行），数字条以 14px 节距滚动换位——即资源变化时数字"滚动"的动画。
// 每位数字条几何（Counter.as initiateCounter L167-198）：digit r 画在 y=14r-2，条位
// stripY=-round(currPos*14)（>0 则 -140 回绕）；窗口 10x11。
import { DisplayObject, Sprite, Graphics } from "./Display";

const FONT_FAMILY = '"Microsoft YaHei","Microsoft JhengHei","Noto Sans SC","SimHei",Arial,sans-serif';

// 单个数字格：自绘条带（省掉 11 个 EngineText 子节点/帧），渲染时只画窗口内可见的 1-2 行字形
class RollDigit extends DisplayObject {
  pos = 0; // 当前条带位置 0..10（原版 currPos）
  val = 0; // 目标数字（原版 Val）
  constructor() {
    super();
    this.mouseEnabled = false;
  }
  renderSelf(ctx: CanvasRenderingContext2D) {
    let yOff = -Math.round(this.pos * 14);
    if (yOff > 0) yOff -= 140; // 原版回绕 guard
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 10, 11); // 窗口
    ctx.clip();
    ctx.font = "10px " + FONT_FAMILY;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff9e3";
    // 只画可能与 0..11 窗口相交的 2-3 行（digit r 的 y = 14r-2+yOff）
    const r0 = Math.floor((14 - yOff) / 14) - 1;
    for (let r = r0; r < r0 + 3; r++) {
      const y = 14 * r - 2 + yOff + 4.0; // +4.0px：右面板数字垂直居中（+2.3 后用户仍反馈偏上 1.5-2px → 再下移 1.7）
      if (y > 11 || y < -11) continue;
      const ch = String(((r % 10) + 10) % 10);
      ctx.fillText(ch, (10 - ctx.measureText(ch).width) / 2, y);
    }
    ctx.restore();
  }
}

export class LcdCounter extends Sprite {
  private digits: RollDigit[] = [];
  private n: number;
  private acc = 0; // 帧步累加（按 25fps 节拍）
  constructor(n = 12) {
    super();
    this.n = n;
    // 原版 digit 偏移：个位在右，最左高位 offset 0；自 -10 起每位 -10，i%3==0 额外 -2（千分位逗号）
    const offs: number[] = [];
    let o = -10;
    for (let i = 0; i < n; i++) {
      if (i > 0) { o -= 10; if (i % 3 === 0) o -= 2; }
      offs.push(o);
    }
    const shift = -offs[offs.length - 1];
    for (let i = 0; i < n; i++) {
      const d = new RollDigit();
      d.x = shift + offs[i];
      d.y = 0;
      this.addChild(d);
      this.digits.push(d);
    }
    const w = shift + offs[0] + 10; // 总宽
    // 纵向明暗遮罩（原版 OverlayShades）+ 左右边缘渐变，作为顶层子节点（原版 Overlay 最后 addChild，盖在数字条上）
    const ov = new Sprite();
    const g = new Graphics();
    const shades: Array<[number, number]> = [[0,150],[0,100],[0,50],[16777215,10],[16777215,20],[16777215,10],[0,30],[0,60],[0,90],[0,120],[0,150]];
    shades.forEach(([c, a], row) => {
      g.beginFill(c, a / 255);
      g.drawRect(0, row, w, 1);
    });
    const lshades: Array<[number, number]> = [[0,150],[0,75],[0,0],[16777215,30],[16777215,60],[16777215,45],[16777215,30],[16777215,15],[0,50],[0,100],[0,150]];
    lshades.forEach(([c, a], row) => {
      g.beginFill(c, a / 255);
      g.drawRect(0, row, 1, 1);
    });
    const ralphas = [150, 130, 110, 90, 70, 50, 70, 90, 110, 130, 150];
    ralphas.forEach((a, row) => {
      g.beginFill(16777215, a / 255);
      g.drawRect(w - 1, row, 1, 1);
    });
    ov.graphics = g;
    ov.mouseEnabled = false;
    this.addChild(ov);
  }
  get lcdWidth() { return this.digits.length > 0 ? 126 : 0; }
  setValue(v: number) {
    if (v < 0) v = 0;
    if (v >= Math.pow(10, this.n)) v = Math.pow(10, this.n) - 1;
    for (let i = 0; i < this.n; i++) {
      const dig = Math.floor(v % Math.pow(10, i + 1) / Math.pow(10, i));
      // 目标变化才记下（镜像原版 setCounter：只写 Val）
      this.digits[i].val = dig;
    }
  }
  // 每帧调用（原版 enterFrame EF）：按 25fps 节拍推进，每拍向目标移 1/7 格；差>5 反向绕行
  tick(dt: number) {
    this.acc += dt * 25;
    const steps = Math.floor(this.acc);
    if (steps <= 0) return;
    this.acc -= steps;
    for (const d of this.digits) {
      for (let s = 0; s < steps; s++) {
        let diff = d.val - d.pos;
        if (Math.abs(diff) > 5) diff = diff > 0 ? diff - 10 : diff + 10; // 反向绕行
        if (Math.abs(diff) > 0.05) {
          d.pos += (diff > 0 ? 1 : -1) / 7;
        }
      }
      while (d.pos < 0) d.pos += 10;
      while (d.pos > 10) d.pos -= 10;
    }
  }
}
