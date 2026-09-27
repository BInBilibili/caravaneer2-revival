// EngineText：对齐 AS3 TextField 子类的渲染（字体/对齐/换行/多行）
import { DisplayObject } from "./Display";

const FONT_FAMILY = '"Microsoft YaHei","Microsoft JhengHei","Noto Sans SC","SimHei",Arial,sans-serif';
// System-font glyphs sit about two game pixels higher than Flash TextField
// glyphs. Apply the correction once at render time so original coordinates
// can be used consistently on every screen.
const GLOBAL_TEXT_Y_OFFSET = 2;

// 共享测量上下文：避免每次 layout 新建 canvas/context（浏览器 2D context 数量有限，频繁创建是明显热点）
let _measure: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!_measure) {
    const c = document.createElement("canvas");
    _measure = c.getContext("2d")!;
  }
  return _measure;
}

export class EngineText extends DisplayObject {
  private _text = "";
  private _color = 16777215;
  private _size = 12;
  private _align: "left" | "center" | "right" = "center";
  private _width: number | null = null;
  private _height: number | null = null;
  private _multiline = false;
  private _wordWrap = false;
  private _bold = false;
  private _italic = false;
  private lines: string[] = [];
  private lineWidths: number[] = [];
  private font = "";
  private lineH = 16;
  private _lineHeightScale = 1.35;
  private maxLineW = 0;
  /** Opt-in ink centering for bounded fields. Legacy layouts keep their top baseline. */
  verticalAlign: "top" | "middle" = "top";

  constructor(
    text = "", color = 16777215, size = 12, align = "center",
    x = 0, y = 0, width: number | null = null, height: number | null = null,
    multiline = false, wordWrap = false, _font: string | null = null, style = "regular",
  ) {
    super();
    this.x = x; this.y = y;
    this._width = width;
    this._height = height;
    this._multiline = multiline;
    this._wordWrap = wordWrap;
    this._color = color;
    this._size = size;
    this._align = (align as any) || "center";
    this._bold = style === "bold" || style === "boldItalic";
    this._italic = style === "italic" || style === "boldItalic";
    this.text = text;
  }

  get text() { return this._text; }
  set text(v: string) { this._text = String(v ?? ""); this.layout(); }
  get size() { return this._size; }
  set size(v: number) { this._size = v; this.layout(); }
  get color() { return this._color; }
  set color(v: number) { this._color = v; }
  get lineHeightScale() { return this._lineHeightScale; }
  set lineHeightScale(v: number) { this._lineHeightScale = v > 0 ? v : 1.35; this.layout(); }
  get textHeight() { return this.lines.length * this.lineH; }
  get textWidth() { return this.maxLineW; }
  // AS3 TextField.width setter 语义：设置布局宽度（对齐用）；textWidth 仍返回内容测量宽
  get width() { return this._width ?? this.maxLineW; }
  set width(v: number | null) { this._width = v; this.layout(); }
  get multiline() { return this._multiline; }
  get align() { return this._align; }

  private layout() {
    const ctx = measureCtx();
    this.font = (this._italic ? "italic " : "") + (this._bold ? "bold " : "") + this._size + "px " + FONT_FAMILY;
    ctx.font = this.font;
    this.lineH = Math.round(this._size * this._lineHeightScale);
    const raw = this._text.split("\n");
    const out: string[] = [];
    for (const line of raw) {
      // Explicit paragraph breaks occupy a line even when wrapping is enabled.
      if (!line.trim()) { out.push(""); continue; }
      if (this._wordWrap && this._width) {
        // CJK breaks between characters; Latin words and amounts with their currency stay together.
        // Splitting on spaces alone made "中文963.72" a word and stranded € on the next line.
        const tokens = line.match(/\d[\d.,]*[ \u00a0]*[€$£¥][，。！？；：、）》」』】]*|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}][，。！？；：、）》」』】]*|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|[ \t]+/gu) ?? [];
        let cur = "";
        const flush = () => { if (cur.trim()) out.push(cur.trimEnd()); cur = ""; };
        for (const token of tokens) {
          if (!cur && !token.trim()) continue;
          if (ctx.measureText(cur + token).width <= this._width) { cur += token; continue; }
          flush();
          if (!token.trim()) continue;
          // Only genuinely overlong tokens (URLs etc.) need emergency character wrapping.
          if (ctx.measureText(token).width > this._width) {
            for (const ch of token) {
              if (cur && ctx.measureText(cur + ch).width > this._width) flush();
              cur += ch;
            }
          } else cur = token;
        }
        flush();
      } else {
        out.push(line);
      }
    }
    this.lines = out;
    this.lineWidths = out.map((ln) => ctx.measureText(ln).width);
    this.maxLineW = 0;
    for (const w of this.lineWidths) if (w > this.maxLineW) this.maxLineW = w;
  }

  renderSelf(ctx: CanvasRenderingContext2D) {
    if (!this._text || !this.lines.length) return;
    ctx.save();
    ctx.font = this.font;
    ctx.textAlign = "left"; // x already includes our left/center/right layout offset.
    ctx.textBaseline = this.verticalAlign === "middle" ? "alphabetic" : "top";
    ctx.fillStyle = "#" + (this._color >>> 0).toString(16).padStart(6, "0");
    // Flash 嵌入字体 TextField 的文本渲染顶比声明 y 低（ascent/capHeight 间隙）：
    // 实测原版 multiline 文本主体偏移 ≈ size*0.33（16px 标题≈6.2、14px≈5.7、12px≈5.6 游戏px），
    // 非 multiline（按钮/数量/金额）≈ size*0.12（13px→1.5）。
    // canvas textBaseline='top' 画在声明 y 上导致复刻整体偏高，这里补回垂直偏移。
    const dy = this._multiline ? Math.round(this._size * 0.33) : Math.round(this._size * 0.12);
    for (let i = 0; i < this.lines.length; i++) {
      const ln = this.lines[i];
      const w = this.lineWidths[i] ?? 0;
      let x = 0;
      const boxW = this._width ?? w;
      if (this._align === "center") x = boxW / 2 - w / 2;
      else if (this._align === "right") x = boxW - w;
      let y = i * this.lineH + dy;
      if (this.verticalAlign === "middle") {
        const metrics = ctx.measureText(ln);
        const ascent = metrics.actualBoundingBoxAscent ?? this._size * 0.8;
        const descent = metrics.actualBoundingBoxDescent ?? this._size * 0.2;
        const boxH = this._height ?? this.textHeight;
        const lineCenter = (boxH - this.textHeight) / 2 + (i + 0.5) * this.lineH;
        y = lineCenter + (ascent - descent) / 2;
      }
      // verticalAlign="middle" 这条路已经用实际墨迹度量（actualBoundingBoxAscent/Descent）把字形居中，
      // 本身就是"替代 Flash 2px 文本框内边距"的手工补偿（见 BattleHud.hudText 的注释），
      // 再叠 GLOBAL_TEXT_Y_OFFSET 就是双重补偿 → 整块文本低 2px（战斗 HUD 全体按钮/名称即此情况）。
      ctx.fillText(ln, x, y + (this.verticalAlign === "middle" ? 0 : GLOBAL_TEXT_Y_OFFSET));
    }
    ctx.restore();
  }
}
