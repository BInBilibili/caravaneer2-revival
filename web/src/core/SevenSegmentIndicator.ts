// SevenSegmentIndicator：对齐原版 Interface.Indicator —— 右侧面板 CARGO 载重数字（9 格七段数码）
// 原版（MapMode.as L6981-6990）：new Indicator(9,true,null,16777215)，x=711，y=298/328（curr/max）；
// 每格 15px 宽（Digits[n].Display.x=(param1-1)*15-n*15），数字从右往左排，闪烁点（Segment8）挂在
// 小数位 digit 的右侧。setValue(v,decimals,noTrailingZeros) 语义照抄原版 Indicator.as：
// s=Math.round(v*10^decimals) 左补 0 到 decimals+1 位；noTrailingZeros 从末位去 0（decimals>0）；
// 超位截断；Segments[8].visible=(digitIndex!=0 && decimals==digitIndex)。
// 视觉规格（原版截图 pixel 取证，图 2048 宽≈逻辑 2.33×）：格 35×38px→15×16.3 逻辑；亮段
// RGB≈(190,190,171)=0xBEBEAB（米白），熄灭/背景暗格 RGB≈(75,76,68)=0x4B4C44（含"8"残影暗格）；
// 段宽≈6px图内≈2.6px 逻辑；段斜切=原版 drawSegment 的 _loc5_=20/_loc4_=7 几何（100×200 坐标系）。
import { Sprite, Graphics } from "./Display";

// 原版 drawSegment 几何（100×200 坐标系，_loc5_=20 斜切、_loc4_=7 内缩）
const SEG_POLYS: Array<Array<[number, number]>> = [
  [[7,0],[93,0],[73,20],[27,20]],                 // 1 上横
  [[0,7],[0,93],[20,73],[20,27]],                 // 2 左上竖
  [[100,7],[100,93],[80,73],[80,27]],             // 3 右上竖
  [[7,100],[27,90],[73,90],[93,100],[73,110],[27,110]], // 4 中横
  [[0,107],[0,193],[20,173],[20,115]],            // 5 左下竖
  [[100,107],[100,193],[80,173],[80,115]],        // 6 右下竖
  [[7,200],[93,200],[73,180],[27,180]],           // 7 下横
  [[114,172.5],[131,172.5],[131,160]],            // 8 小数点（位图取证：点中心≈格(12.2, 11.4)、宽≈1.7×高≈0.9 逻辑；原矢量 110..150/180..210 × 缩放后宽 4px 过大、y 过底 → 收为 17×12.5 单位并上移到 160..172.5）
];
// 0-9 段映射（原版 DigitSegments，索引 1..7）
const DIGIT_SEGS: number[][] = [
  [1,2,3,5,6,7], [3,6], [1,3,4,5,7], [1,3,4,6,7], [2,3,4,6],
  [1,2,4,6,7], [1,2,4,5,6,7], [1,3,6], [1,2,3,4,5,6,7], [1,2,3,4,6,7],
];

const SEG_ON = 0xBEBEAB;    // 亮段米白（原版截图采样）
const SEG_OFF = 0x4B4C44;   // 暗格/残影（原版截图采样）
// 原版数字几何（MapMode 截图像素取证，图 2048 宽≈逻辑 2.33×）：格子 35×38px→15×16.3 逻辑，
// 但亮段字形行高只有 32px≈13.75 逻辑（上下留白）；web 初版按 16.3 满格高致数字过大过挤。
const GRID_W = 15;          // 每格宽/格距（原版 15px，Digits[n].Display.x 步进）
const GRID_H = 13.75;       // 字形高（原版亮段 32px / 2.33）
// 原版 CARGO 面板用位图段（IndicatorSegment1-8.png，14×16），段形状只占格内 ~10px 宽
// （原版截图 px→逻辑 2.327 取证：横段 22px≈9.5 逻辑、竖段 5px≈2.1 逻辑、贴格左缘、
//  右缘留白 ~5.4 逻辑）→ 字形横向 0..10，格间才有原版式空隙；竖段 = 20×SX ≈ 2px
const GRID_W_CONTENT = 10;  // 字形内容宽（原版 ~9.5-10 逻辑，贴左缘）
const SX = GRID_W_CONTENT / 100; // 水平缩放（段几何 100 宽 → 10px）
const SY = GRID_H / 200;    // 垂直缩放（段几何 200 高 → 13.75px）

function drawShape(g: Graphics, pts: Array<[number, number]>, sx: number, sy: number) {
  g.moveTo(pts[0][0] * sx, pts[0][1] * sy);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * sx, pts[i][1] * sy);
}

class Digit extends Sprite {
  lit: Graphics;              // 亮段层
  constructor() {
    super();
    this.mouseEnabled = false;
    const yOff = 0.9; // 字形在格内垂直居中（原版字形中心 306.15 vs 顶 299.27）
    // 暗格：全 7 段 + 点，形成"残影 8"背景（原版 IndicatorBase 位图效果）
    const dark = new Graphics();
    dark.beginFill(SEG_OFF);
    for (const pts of SEG_POLYS) drawShape(dark, pts, SX, SY);
    dark.endFill();
    const bg = new Sprite();
    bg.graphics = dark;
    bg.y = yOff;
    bg.mouseEnabled = false;
    this.addChild(bg);
    this.lit = new Graphics();
    const l = new Sprite();
    l.graphics = this.lit;
    l.y = yOff;
    l.mouseEnabled = false;
    this.addChild(l);
  }
  show(digit: number | null, dot: boolean) {
    const g = this.lit;
    g.clear();
    g.beginFill(SEG_ON);
    if (digit !== null && digit >= 0 && digit <= 9) {
      for (const s of DIGIT_SEGS[digit]) drawShape(g, SEG_POLYS[s - 1], SX, SY);
    }
    if (dot) drawShape(g, SEG_POLYS[7], SX, SY);
    g.endFill();
  }
}

export class SevenSegmentIndicator extends Sprite {
  private digits: Digit[] = [];
  private lastSig = ""; // 值未变则跳过重建（update 每帧调用 setValue）
  constructor(n = 9) {
    super();
    this.mouseEnabled = false;
    for (let i = 0; i < n; i++) {
      const d = new Digit();
      d.x = (n - 1) * GRID_W - i * GRID_W; // 原版 Digits[n].Display.x=(param1-1)*15-n*15（数字右对齐）
      this.addChild(d);
      this.digits.push(d);
    }
  }
  // 原版 Indicator.setValue(v, decimals, noTrailingZeros)
  setValue(v: number, decimals = 0, noTrailingZeros = false) {
    const sig = v + "|" + decimals + "|" + noTrailingZeros;
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    let s = String(Math.round(v * Math.pow(10, decimals)));
    while (s.length < decimals + 1) s = "0" + s;
    let dec = decimals;
    if (noTrailingZeros) {
      while (s.length > 1 && s.charAt(s.length - 1) === "0" && dec > 0) {
        s = s.substring(0, s.length - 1);
        dec--;
      }
    }
    if (noTrailingZeros && s.length > this.digits.length) {
      const intLen = s.length - decimals;
      if (intLen < this.digits.length) {
        s = s.substr(0, this.digits.length);
        dec = this.digits.length - intLen;
      } else {
        s = s.substr(0, intLen);
        dec = 0;
      }
    }
    for (let i = 0; i < this.digits.length; i++) {
      // 原版：_loc7_ < _loc5_.length 才点亮（超出长度的格保持暗格；注意 Number("")===0 会误亮）
      const valid = i < s.length;
      const ch = valid ? s.charAt(s.length - i - 1) : "";
      const n = valid ? Number(ch) : NaN;
      // 小数点在左起第 decimals+1 位右侧（原版 _loc4_==_loc7_ && _loc7_!=0）
      const dot = i !== 0 && dec === i;
      this.digits[i].show(Number.isNaN(n) ? null : n, dot);
    }
  }
}
