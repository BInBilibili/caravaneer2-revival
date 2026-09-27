// 迷你显示列表：DisplayObject / Sprite / Graphics / BitmapObject
// 对齐 AS3 语义：x/y/alpha/scale/visible/blendMode/colorTransform/children/命中测试/点击事件
// 混合模式：layer(组) / alpha(用源alpha替换目标alpha) / erase(从目标挖掉alpha)
export type BlendMode = "normal" | "layer" | "alpha" | "erase" | "multiply";

export interface Tint { r: number; g: number; b: number; dr?: number; dg?: number; db?: number }

const STAGE_W = 880, STAGE_H = 495;
const blendSurfaces = new WeakMap<DisplayObject, HTMLCanvasElement>();

// Opt-in for text-bearing UI masks. Keep the original blend operations/geometry,
// but preserve the output pixel density through nested masks, like Flash TextFields.
function blendBuffer(c: DisplayObject, ctx: CanvasRenderingContext2D) {
  const M = 250, w = STAGE_W + M * 2, h = STAGE_H + M * 2;
  const matrix = c.blendAtDisplayResolution ? ctx.getTransform() : null;
  const sx = matrix ? Math.max(1, Math.hypot(matrix.a, matrix.b)) : 1;
  const sy = matrix ? Math.max(1, Math.hypot(matrix.c, matrix.d)) : 1;
  const off = (c.blendAtDisplayResolution && blendSurfaces.get(c)) || document.createElement("canvas");
  if (c.blendAtDisplayResolution) blendSurfaces.set(c, off);
  const pw = Math.ceil(w * sx), ph = Math.ceil(h * sy);
  if (off.width !== pw) off.width = pw;
  if (off.height !== ph) off.height = ph;
  const s = off.getContext("2d")!;
  s.setTransform(1, 0, 0, 1, 0, 0); s.clearRect(0, 0, off.width, off.height);
  s.setTransform(pw / w, 0, 0, ph / h, M * pw / w, M * ph / h);
  s.globalAlpha = 1; s.globalCompositeOperation = "source-over";
  return {off, s, w, h};
}

class CanvasPool {
  private pool: HTMLCanvasElement[] = [];
  private busy = 0;
  acquire(): HTMLCanvasElement {
    const c = this.pool[this.busy] ?? (this.pool[this.busy] = document.createElement("canvas"));
    c.width = STAGE_W; c.height = STAGE_H;
    this.busy++;
    return c;
  }
  release() { this.busy = Math.max(0, this.busy - 1); }
}
export const pool = new CanvasPool();

export class DisplayObject {
  x = 0; y = 0; alpha = 1; scaleX = 1; scaleY = 1; rotation = 0; visible = true;
  blendMode: BlendMode = "normal";
  blendAtDisplayResolution = false;
  colorTransform: Tint | null = null;
  mouseEnabled = true; mouseChildren = true;
  buttonMode = false;
  parent: Sprite | null = null;
  name = "";
  private listeners = new Map<string, Array<(e?: unknown) => void>>();
  onWheel: ((delta: number, x: number, y: number) => void) | null = null;

  addEventListener(type: string, fn: (e?: unknown) => void) {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }
  removeEventListener(type: string, fn: (e?: unknown) => void) {
    const arr = this.listeners.get(type);
    if (arr) this.listeners.set(type, arr.filter((f) => f !== fn));
  }
  dispatchEvent(type: string, e?: unknown) {
    const arr = this.listeners.get(type);
    if (arr) for (const f of arr) f(e);
  }
  dispatchClick(e?: unknown) { this.dispatchEvent("click", e); }



  hitLocal(_lx: number, _ly: number): boolean { return false; }

  // 命中测试：参数为父级坐标系坐标，逐层减去自身位移（累积变换）
  hitTestPoint(wx: number, wy: number): DisplayObject | null {
    if (!this.visible) return null;
    const lx = (wx - this.x) / this.scaleX, ly = (wy - this.y) / this.scaleY;
    if (this instanceof Sprite) {
      if (this.mouseChildren) {
        for (let i = this.children.length - 1; i >= 0; i--) {
          const hit = this.children[i].hitTestPoint(lx, ly);
          if (hit) return hit;
        }
      }
      if (this.mouseEnabled && this.graphics && this.graphics.hit(lx, ly)) return this;
      return null;
    }
    return this.mouseEnabled && this.hitLocal(lx, ly) ? this : null;
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.visible) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
    if (this.rotation !== 0) ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.globalAlpha *= this.alpha;
    this.renderSelf(ctx);
    if (this instanceof Sprite) this.renderChildren(ctx);
    ctx.restore();
  }
  renderSelf(_ctx: CanvasRenderingContext2D) {}
  renderChildren(_ctx: CanvasRenderingContext2D) {}
}

export class Graphics extends DisplayObject {
  ops: any[] = [];
  fill: { c: string; a: number } | null = null;
  line: { w: number; c: string; a: number; round?: boolean } | null = null;

  beginFill(color: number, alpha = 1) { this.fill = { c: "#" + (color >>> 0).toString(16).padStart(6, "0"), a: alpha }; }
  endFill() { this.fill = null; }
  setFillColor(color: number, alpha?: number) {
    if (!this.fill) this.fill = { c: "", a: 1 };
    this.fill.c = "#" + (color >>> 0).toString(16).padStart(6, "0");
    if (alpha !== undefined) this.fill.a = alpha;
  }
  lineStyle(w: number, color: number, alpha = 1, round = false) {
    this.line = { w, c: "#" + (color >>> 0).toString(16).padStart(6, "0"), a: alpha, round };
  }

  drawRect(x: number, y: number, w: number, h: number) { this.ops.push({ k: "rect", x, y, w, h, fill: this.fill, line: this.line }); }
  drawCircle(x: number, y: number, r: number) { this.ops.push({ k: "circle", x, y, r, fill: this.fill, line: this.line }); }
  // 圆弧路径（canvas arc；弧度制、0=右/顺时针方向；样式线段用，命中测试跳过——命中走 hitCircle 等显式区域）
  arcPath(x: number, y: number, r: number, start: number, end: number) { this.ops.push({ k: "arcPath", x, y, r, start, end, fill: this.fill, line: this.line }); }
  hitRect(x: number, y: number, w: number, h: number) { this.ops.push({ k: "rect", x, y, w, h, fill: this.fill, line: this.line, hitOnly: true }); }
  hitCircle(x: number, y: number, r: number) { this.ops.push({ k: "circle", x, y, r, fill: this.fill, line: this.line, hitOnly: true }); }

  moveTo(x: number, y: number) { this.ops.push({ k: "moveTo", x, y, fill: this.fill, line: this.line }); }
  // 复合子路径多边形（fill 用 evenodd：外框与内部符号同向/反向皆挖空成中空视觉；可带 line 描边）
  polySub(pts: Array<{ x: number; y: number }>, fill: { c: string; a: number } | null, line: { w: number; c: string; a: number } | null) {
    this.ops.push({ k: "polySub", pts, fill, line });
  }
  polyCompound(paths: Array<Array<{ x: number; y: number }>>, fill: { c: string; a: number } | null, line: { w: number; c: string; a: number } | null) {
    this.ops.push({ k: "polyCompound", paths, fill, line });
  }

  lineTo(x: number, y: number) { this.ops.push({ k: "lineTo", x, y, fill: this.fill, line: this.line }); }
  curveTo(cpx: number, cpy: number, x: number, y: number) { this.ops.push({ k: "curveTo", cpx, cpy, x, y, fill: this.fill, line: this.line }); }
  clear() { this.ops = []; this.fill = null; this.line = null; }

  // 命中测试：整流形 (rect/circle) 容差 0.5px；多边形点集射线法（hitOnly 标记意味着仅命中、不渲染）
  hit(lx: number, ly: number): boolean {
    let poly: Array<{ x: number; y: number }> = [];
    const checkPoly = () => {
      if (poly.length >= 3) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const a = poly[i], b = poly[j];
          if (a.y > ly !== b.y > ly && lx < ((b.x - a.x) * (ly - a.y)) / (b.y - a.y) + a.x) inside = !inside;
        }
        if (inside) return true;
      }
      poly = [];
      return false;
    };
    for (const op of this.ops) {
      if (op.k === "moveTo") {
        if (checkPoly()) return true;
        poly = [{ x: op.x, y: op.y }];
      } else if (op.k === "lineTo" || op.k === "curveTo") {
        poly.push({ x: op.x, y: op.y });
      } else if (op.k === "rect") {
        if (checkPoly() || (lx >= op.x - 0.5 && lx <= op.x + op.w + 0.5 && ly >= op.y - 0.5 && ly <= op.y + op.h + 0.5)) return true;
      } else if (op.k === "circle") {
        if (checkPoly()) return true;
        const dx = lx - op.x, dy = ly - op.y;
        if (dx * dx + dy * dy <= op.r * op.r + 0.5) return true;
      }
    }
    return checkPoly();
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    // 每个 fill/stroke 前恢复父级全局 alpha：否则同 Graphics 多 op 的 alpha 会连乘
    // （如 NPC 半圆弧 α0.3 后竖线 α0.3 变 0.09 → 视觉“竖线比弧浅”）
    const baseAlpha = ctx.globalAlpha;
    let path: Array<any> = [];
    const flushPath = () => {
      if (!path.length) return;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (const pt of path.slice(1)) {
        if (pt.k === "curveTo") ctx.quadraticCurveTo(pt.cpx, pt.cpy, pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      const fill = path[0].fill, line = path[0].line;
      if (fill) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= fill.a; ctx.fillStyle = fill.c; ctx.fill(); }
      if (line) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= line.a; ctx.lineCap = line.round ? "round" : "butt"; ctx.lineJoin = line.round ? "round" : "miter"; ctx.strokeStyle = line.c; ctx.lineWidth = line.w; ctx.stroke(); }
      path = [];
    };
    for (const op of this.ops) {
      switch (op.k) {
        case "polySub": {
          flushPath();
          if (!op.pts || !op.pts.length) break;
          ctx.beginPath();
          ctx.moveTo(op.pts[0].x, op.pts[0].y);
          for (let pi = 1; pi < op.pts.length; pi++) ctx.lineTo(op.pts[pi].x, op.pts[pi].y);
          ctx.closePath();
          if (op.fill) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= op.fill.a; ctx.fillStyle = op.fill.c; ctx.fill("evenodd"); }
          if (op.line) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= op.line.a; ctx.lineCap = op.line.round ? "round" : "butt"; ctx.lineJoin = op.line.round ? "round" : "miter"; ctx.strokeStyle = op.line.c; ctx.lineWidth = op.line.w; ctx.stroke(); }
          break;
        }
        case "polyCompound": {
          flushPath();
          if (!op.paths?.length) break;
          ctx.beginPath();
          for (const pts of op.paths) {
            if (!pts?.length) continue;
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let pi = 1; pi < pts.length; pi++) ctx.lineTo(pts[pi].x, pts[pi].y);
            ctx.closePath();
          }
          if (op.fill) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= op.fill.a; ctx.fillStyle = op.fill.c; ctx.fill("evenodd"); }
          if (op.line) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= op.line.a; ctx.lineCap = op.line.round ? "round" : "butt"; ctx.lineJoin = op.line.round ? "round" : "miter"; ctx.strokeStyle = op.line.c; ctx.lineWidth = op.line.w; ctx.stroke(); }
          break;
        }
        case "moveTo": flushPath(); path = [{ k: "moveTo", x: op.x, y: op.y, fill: op.fill, line: op.line }]; break;
        case "lineTo": path.push({ k: "lineTo", x: op.x, y: op.y, fill: op.fill, line: op.line }); break;
        case "curveTo": path.push({ k: "curveTo", cpx: op.cpx, cpy: op.cpy, x: op.x, y: op.y, fill: op.fill, line: op.line }); break;
        case "rect": {
          if (op.hitOnly) break;
          flushPath();
          ctx.beginPath();
          ctx.rect(op.x, op.y, op.w, op.h);
          if (op.fill) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= op.fill.a; ctx.fillStyle = op.fill.c; ctx.fill(); }
          if (op.line) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= op.line.a; ctx.lineCap = op.line.round ? "round" : "butt"; ctx.lineJoin = op.line.round ? "round" : "miter"; ctx.strokeStyle = op.line.c; ctx.lineWidth = op.line.w; ctx.stroke(); }
          break;
        }
        case "circle": {
          if (op.hitOnly) break;
          flushPath();
          ctx.beginPath();
          ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
          if (op.fill) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= op.fill.a; ctx.fillStyle = op.fill.c; ctx.fill(); }
          if (op.line) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= op.line.a; ctx.lineCap = op.line.round ? "round" : "butt"; ctx.lineJoin = op.line.round ? "round" : "miter"; ctx.strokeStyle = op.line.c; ctx.lineWidth = op.line.w; ctx.stroke(); }
          break;
        }
        case "arcPath": {
          flushPath();
          ctx.beginPath();
          ctx.arc(op.x, op.y, op.r, op.start, op.end);
          if (op.fill) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= op.fill.a; ctx.fillStyle = op.fill.c; ctx.fill(); }
          if (op.line) { ctx.globalAlpha = baseAlpha; ctx.globalAlpha *= op.line.a; ctx.lineCap = op.line.round ? "round" : "butt"; ctx.lineJoin = op.line.round ? "round" : "miter"; ctx.strokeStyle = op.line.c; ctx.lineWidth = op.line.w; ctx.stroke(); }
          break;
        }
      }
    }
    flushPath();
    ctx.restore();
  }
}

export class Sprite extends DisplayObject {
  children: DisplayObject[] = [];
  graphics: Graphics | null = null;

  // 关键修复：Sprite 必须渲染自身 graphics（此前缺失导致所有 Sprite 图形 UI 不可见）
  renderSelf(ctx: CanvasRenderingContext2D) {
    if (this.graphics) this.graphics.render(ctx);
  }

  addChild<T extends DisplayObject>(c: T): T { c.parent = this; this.children.push(c); return c; }
  addChildAt<T extends DisplayObject>(c: T, i: number): T {
    c.parent = this;
    this.children.splice(Math.max(0, Math.min(i, this.children.length)), 0, c);
    return c;
  }
  removeChild(c: DisplayObject) {
    const i = this.children.indexOf(c);
    if (i >= 0) { this.children.splice(i, 1); c.parent = null; }
  }
  removeAll() { for (const c of this.children) c.parent = null; this.children = []; }
  getChildIndex(c: DisplayObject): number { return this.children.indexOf(c); }
  setChildIndex(c: DisplayObject, i: number) {
    const cur = this.children.indexOf(c);
    if (cur < 0) return;
    this.children.splice(cur, 1);
    this.children.splice(Math.max(0, Math.min(i, this.children.length)), 0, c);
  }
  numChildren() { return this.children.length; }

  renderChildren(ctx: CanvasRenderingContext2D) {
    for (const c of this.children) this.renderChild(c, ctx);
  }

  protected renderChild(c: DisplayObject, ctx: CanvasRenderingContext2D) {
    if (!c.visible) return;
    if (c.blendMode === "alpha" || c.blendMode === "erase") {
      // 独立缓冲 + 边距偏移：子内容可能位于负局部坐标（如城镇标记 pin 圆在 0,-35），
      // 若缓冲原点=子原点则会裁掉负坐标内容；缓冲原点偏移 M，绘制时反向补偿 M。
      // 关键：setTransform 是 REPLACE 而非叠加，且 off 是全新画布，其变换与父 ctx 无关；
      // 因此无论父 ctx 是否为 layer 缓冲（__layerBase M 基线），都必须用 M 偏移，
      // 并在 drawImage 前 translate(-M,-M) 把 off 像素坐标映射回父 ctx 局部坐标。
      // 此前 base?0:M 特判让 layer 内掩码以 0 偏移渲染，负坐标内容（pin 圆 y=-35）被裁空，
      // 空掩码 destination-in 清空整个 layer —— 即 t1 气泡不可见的真正根因。
      const M = 250;
      const {off, s, w, h} = blendBuffer(c, ctx);
      c.render(s);
      ctx.save();
      ctx.translate(-M, -M);
      if (c.blendMode === "alpha") {
        // Flash ALPHA 混合：源作为 backdrop 的 alpha 掩码（颜色取背景），
        // 红条等不透明内容保留其区域的背景，半透明（clearBmp 0.01）区域露出下层
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(off, 0, 0, w, h);
      } else {
        ctx.globalCompositeOperation = "destination-out";
        ctx.drawImage(off, 0, 0, w, h);
      }
      ctx.restore();
      // 注意：此分支用 createElement 独立缓冲，从未 acquire，不得 release（会破坏 pool busy 计数）
      return;
    }
    if (c.blendMode === "layer") {
      // 与 alpha/erase 分支相同的 M=250 边距补偿：layer 容器自身可能带负坐标
      // （如城镇设施气泡 parchment.x=-24,y=-57），若缓冲原点=容器原点则内容被裁光。
      // 独立缓冲（createElement，勿 acquire/release：pool 缓冲固定 880x495 无 M 边距，
      // 且 release 会破坏 busy 计数）。缓冲像素 (M,M) ↔ 容器局部 (0,0)。
      const M = 250;
      const {off, s, w, h} = blendBuffer(c, ctx);
      c.render(s);
      ctx.save();
      ctx.translate(-M, -M); // 缓冲 (0,0) ↔ 父局部 (-M,-M)，(M,M) ↔ 父局部 (0,0)
      // dst*(1-A) + src*A（source-over 才正确；lighter 加法会把 alpha 加出不透明）
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(off, 0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(off, 0, 0, w, h);
      ctx.restore();
      return;
    }
    if (c.blendMode === "multiply") {
      // multiply：离屏缓冲画子内容，以 multiply 合成回主画布（如城镇灰阶贴图 × 羊皮纸底）
      const M = 250;
      const {off, s, w, h} = blendBuffer(c, ctx);
      c.render(s);
      ctx.save();
      ctx.translate(-M, -M);
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(off, 0, 0, w, h);
      ctx.restore();
      return;
    }
    c.render(ctx);
  }
}

export class BitmapObject extends DisplayObject {
  // 帧裁剪：srcRect = { x, y, w, h }（如 Body 序列 800x800 的第 n 帧）
  srcRect: { x: number; y: number; w: number; h: number } | null = null;
  constructor(public image: HTMLImageElement) { super(); }
  get width() { return this.srcRect ? this.srcRect.w : (this.image as any).naturalWidth ?? (this.image as any).width ?? 0; }
  get height() { return this.srcRect ? this.srcRect.h : (this.image as any).naturalHeight ?? (this.image as any).height ?? 0; }
  hitLocal(lx: number, ly: number): boolean {
    return lx >= 0 && ly >= 0 && lx <= this.width && ly <= this.height;
  }
  private tintBuf: HTMLCanvasElement | null = null;
  private tintKey = "";
  private tintImg: HTMLImageElement | null = null;

  renderSelf(ctx: CanvasRenderingContext2D) {
    if (this.colorTransform) {
      const t = this.colorTransform;
      // 按图像实际绘制尺寸建独立缓冲（原 880x495 池画布会裁剪大图）；同键结果缓存复用，避免每帧重建
      const w = this.srcRect ? this.srcRect.w : this.image.naturalWidth || 0;
      const h = this.srcRect ? this.srcRect.h : this.image.naturalHeight || 0;
      if (w <= 0 || h <= 0) return; // 图像未就绪
      const key = (this.srcRect
        ? this.srcRect.x + "," + this.srcRect.y + "," + this.srcRect.w + "," + this.srcRect.h
        : "full") + "|" + w + "x" + h + "|" + t.r + "," + t.g + "," + t.b + "|" + (t.dr ?? 0) + "," + (t.dg ?? 0) + "," + (t.db ?? 0);
      if (!this.tintBuf || this.tintKey !== key || this.tintImg !== this.image) {
        this.tintImg = this.image;
        const off = document.createElement("canvas");
        off.width = w; off.height = h;
        const s = off.getContext("2d")!;
        s.setTransform(1, 0, 0, 1, 0, 0);
        s.clearRect(0, 0, w, h);
        if (this.srcRect) s.drawImage(this.image, this.srcRect.x, this.srcRect.y, this.srcRect.w, this.srcRect.h, 0, 0, w, h);
        else s.drawImage(this.image, 0, 0, w, h);
        s.globalCompositeOperation = "multiply";
        s.fillStyle = "rgb(" + Math.round(t.r * 255) + "," + Math.round(t.g * 255) + "," + Math.round(t.b * 255) + ")";
        s.fillRect(0, 0, w, h);
        s.globalCompositeOperation = "destination-in";
        if (this.srcRect) s.drawImage(this.image, this.srcRect.x, this.srcRect.y, this.srcRect.w, this.srcRect.h, 0, 0, w, h);
        else s.drawImage(this.image, 0, 0, w, h);
        this.tintBuf = off;
        this.tintKey = key;
      }
      ctx.drawImage(this.tintBuf, 0, 0);
      if (t.dr || t.dg || t.db) {
        // AS3 ColorTransform 加法偏移（R'=R+dr）：用 lighter 混合叠一层"仅原像素区域"的偏移色
        const dr = t.dr || 0, dg = t.dg || 0, db = t.db || 0;
        const off = document.createElement("canvas");
        off.width = w; off.height = h;
        const oc = off.getContext("2d")!;
        oc.setTransform(1, 0, 0, 1, 0, 0);
        oc.fillStyle = "rgb(" + Math.round(dr) + "," + Math.round(dg) + "," + Math.round(db) + ")";
        oc.fillRect(0, 0, w, h);
        oc.globalCompositeOperation = "destination-in";
        oc.drawImage(this.tintBuf, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(off, 0, 0, w, h);
        ctx.restore();
      }
    } else {
      if (this.srcRect) ctx.drawImage(this.image, this.srcRect.x, this.srcRect.y, this.srcRect.w, this.srcRect.h, 0, 0, this.srcRect.w, this.srcRect.h);
      else ctx.drawImage(this.image, 0, 0);
    }
  }
}
export class ClipSprite extends Sprite {
  constructor(public clipW: number, public clipH: number) { super(); }
  render(ctx: CanvasRenderingContext2D) {
    if (!this.visible) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
    ctx.globalAlpha *= this.alpha;
    ctx.beginPath();
    ctx.rect(0, 0, this.clipW, this.clipH);
    ctx.clip();
    this.renderSelf(ctx);
    this.renderChildren(ctx);
    ctx.restore();
  }
}
