// CursorInfoPanel：悬停信息面板（公共组件，t102 以交易界面 t101 cursorInfo 实现为准）
// 样式/行为逐行对齐 TradeWindow.updateCursorInfo（原版 TradeWindow.as cursorControl L1840-2170 cursorInfo）：
// 浅黄底 12631208 + 深棕描边 3156000、文本 x=6 width=最宽行、鼠标右下 +20/+10 越界钳制 875/490、
// alpha 每帧 +0.2 渐显、内容键缓存（同键只跟随不重建）、不拦截鼠标
import { Sprite, Graphics } from "./Display";
import { EngineText } from "./EngineText";

export interface CursorRow {
  text: string;
  value?: string;         // 有值 → 左名右值两列（左对齐+右对齐）
  center?: boolean;       // 单行居中（默认 left 单行）
  font?: number;          // 默认 12；标题行 14
  dy?: number;            // 该行之后的行距（默认 17；标题 20、重量行 25）
  multiline?: boolean;    // 长文本居中断词（原版 getInfoPairs description 分支）
}

export class CursorInfoPanel {
  private s = new Sprite();
  private alphaNow = 0;
  private keyNow = "";
  private wNow = 0;
  private hNow = 0;

  constructor() {
    this.s.mouseEnabled = false;
    this.s.mouseChildren = false;
    this.s.visible = false;
    this.s.alpha = 0;
  }
  get sprite(): Sprite { return this.s; }

  /** 挂到父节点（通常为窗口根，最顶层）；重复 attach 幂等 */
  attach(parent: Sprite) {
    if (parent && parent.children && !parent.children.includes(this.s)) parent.addChild(this.s);
  }

  /** 每帧/事件驱动：rows=null → 隐藏；否则渐显+跟随鼠标（内容变化时重建面板） */
  update(mx: number, my: number, rows: CursorRow[] | null) {
    if (!rows || rows.length === 0) { this.hide(); return; }
    const key = rows.map((r) =>
      (r.font ?? 12) + "|" + (r.center ? "C" : r.value !== undefined ? "LR" : "L") + "|" + r.text + "|" + (r.value ?? "") + "|" + (r.dy ?? "") + "|" + (r.multiline ? "M" : "")).join("\u0001");
    if (key !== this.keyNow) { this.keyNow = key; this.rebuild(rows); }
    this.s.x = mx + 20;
    this.s.y = my + 10;
    if (this.s.y + this.hNow > 490) this.s.y = 490 - this.hNow;
    if (this.s.x + this.wNow > 875) this.s.x = mx - this.wNow - 10;
    this.s.visible = true;
    this.alphaNow = Math.min(1, this.alphaNow + 0.2);
    this.s.alpha = this.alphaNow;
  }

  /** 立即显示（无渐显）——事件式宿主（装备页 pointerover）用它，随后 pointermove 交给 update 渐显 */
  show(mx: number, my: number, rows: CursorRow[] | null) {
    if (!rows || rows.length === 0) { this.hide(); return; }
    const key = rows.map((r) =>
      (r.font ?? 12) + "|" + (r.center ? "C" : r.value !== undefined ? "LR" : "L") + "|" + r.text + "|" + (r.value ?? "") + "|" + (r.dy ?? "") + "|" + (r.multiline ? "M" : "")).join("\u0001");
    if (key !== this.keyNow) { this.keyNow = key; this.rebuild(rows); }
    this.s.x = mx + 20;
    this.s.y = my + 10;
    if (this.s.y + this.hNow > 490) this.s.y = 490 - this.hNow;
    if (this.s.x + this.wNow > 875) this.s.x = mx - this.wNow - 10;
    this.s.visible = true;
    this.alphaNow = 1;
    this.s.alpha = 1;
  }

  hide() { this.s.visible = false; this.s.alpha = 0; this.alphaNow = 0; }

  /** 交易窗口操作后内容失效：强制下次 update 重建（同键内容可能已变化，如价格） */
  invalidate() { this.keyNow = ""; }

  private rebuild(rows: CursorRow[]) {
    this.s.removeAll();
    let y = 5;
    // 先量宽：原版 L1498-1506 —— wMax=最宽行(textWidth + pair?+20:+5)，hMax=最大 y+textHeight
    let maxChars = 0;
    const built: Array<{ t: EngineText; pair?: EngineText }> = [];
    for (const row of rows) {
      const font = row.font ?? 12;
      if (row.multiline) {
        // 原版 L1457-1472：按当前最长行字符数断词，逐段 center 行
        const words = row.text.split(" ");
        let cur = "";
        for (const w of words) {
          if (!cur || cur.length + w.length + 1 <= maxChars || (cur.length === 0 && w.length <= maxChars)) {
            cur = cur ? cur + " " + w : w;
            continue;
          }
          built.push({ t: new EngineText(cur, 0, font, "center", 0, y, 200, 20) });
          y += row.dy ?? 17;
          cur = w;
        }
        if (cur) { built.push({ t: new EngineText(cur, 0, font, "center", 0, y, 200, 20) }); y += row.dy ?? 17; }
        continue;
      }
      if (row.value !== undefined) {
        const a = new EngineText(row.text, 0, font, "left", 0, y, 200, 20);
        const b = new EngineText(row.value, 0, font, "right", 0, y, 200, 20);
        built.push({ t: a, pair: b });
                maxChars = Math.max(maxChars, row.text.length + row.value.length + 2);
      } else {
        built.push({ t: new EngineText(row.text, 0, font, row.center ? "center" : "left", 0, y, 200, 20) });
                maxChars = Math.max(maxChars, row.text.length);
      }
      y += row.dy ?? 17;
    }
    let wMax = 0;
    for (const b of built) {
      const w = b.t.textWidth + (b.pair ? b.pair.textWidth + 20 : 5);
      if (w > wMax) wMax = w;
    }
    let hMax = 0;
    for (let i = 0; i < built.length; i++) {
      if (built[i].t.y + built[i].t.textHeight > hMax) hMax = built[i].t.y + built[i].t.textHeight;
    }
    // 面板底（原版 L1511-1517：boxW=wMax+12，boxH=hMax+5）
    const boxW = wMax + 12;
    const bg = new Graphics();
    bg.lineStyle(1, 3156000);
    bg.beginFill(12631208);
    bg.drawRect(0, 0, boxW, hMax + 5);
    this.s.graphics = bg;
    this.wNow = boxW; this.hNow = hMax + 5;
    // 文本（原版 L1518-1523：x=6、width=wMax）
    for (const b of built) {
      b.t.x = 6; b.t.width = wMax;
      this.s.addChild(b.t);
      if (b.pair) { b.pair.x = 6; b.pair.y = b.t.y; b.pair.width = wMax; this.s.addChild(b.pair); }
    }
  }
}
