// Dialogue 风格背景（复刻原版 Interface.Dialogue 组件，Dialogue.as L20-142）：
// InterfaceBackground.png 纹理铺底（随机偏移语义：x = -random*(texW-panelW)）+
// 可选压暗层（dim，供面板文字可读）+
// 上/左 3px 高光（原版 screen 混合近似，半透明白 34/68/34）+ 下/右 3px 阴影（原版 multiply 混合近似，半透明黑 136/102/68）+
// InterfaceForeground.png 前景纹理层（随机偏移，位于高光/阴影之上，原版 L134-142）
import { ClipSprite, Sprite, Graphics, BitmapObject } from "./Display";
import type { AssetStore } from "./Assets";
import type { EngineText } from "./EngineText";

export function addDialogueBackground(
  parent: Sprite,
  assets: AssetStore,
  x: number, y: number, w: number, h: number,
  dim = 0,
  texture?: string, // t80：默认 InterfaceBackground（羊皮纸）；可传 "TownBG.jpg" 用城镇暖米黄底图（与城镇/统计页一致）
  fg = true, // t80：false 时不叠加 InterfaceForeground 前景层（全屏 TownBG 场景避免灰白罩，城镇页同款）
): ClipSprite {
  const clip = new ClipSprite(w, h);
  clip.x = x; clip.y = y;
  parent.addChild(clip);

  const texName = texture || "InterfaceBackground.png";
  // 纹理铺底（随机偏移：纹理大于面板时在其间随机滑动，语义同原版 BG.x/y）
  const put = (img: HTMLImageElement | null, at = 0) => {
    if (!img) return;
    const b = new BitmapObject(img);
    b.x = -Math.random() * Math.max(img.naturalWidth - w, 0);
    b.y = -Math.random() * Math.max(img.naturalHeight - h, 0);
    b.mouseEnabled = false;
    clip.addChildAt(b, at); // 固定在最底层（异步加载完成时不得盖住压暗/边框）
  };
  const cached = assets.getImage(texName);
  if (cached) put(cached, 0);
  else void assets.ensure(texName).then((im) => { if (im) put(im, 0); });

  // 压暗层（面板内，纹理之上边框之下）
  if (dim > 0) {
    const dk = new Sprite();
    const dg = new Graphics();
    dg.beginFill(0, dim);
    dg.drawRect(0, 0, w, h);
    dk.graphics = dg;
    dk.mouseEnabled = false;
    clip.addChild(dk);
  }

  // 上/左 3px 高光（半透明白，近似原版 screen 混合）
  const hl = new Sprite();
  const hg = new Graphics();
  const hlA = [34 / 255, 68 / 255, 34 / 255];
  for (let i = 0; i < 3; i++) {
    hg.beginFill(16777215, hlA[i]);
    hg.drawRect(i, i, w - 2 * i, 1);
    hg.drawRect(i, i, 1, h - 2 * i);
  }
  hl.graphics = hg;
  hl.mouseEnabled = false;
  clip.addChild(hl);

  // 下/右 3px 阴影（半透明黑，近似原版 multiply 混合）
  const sh = new Sprite();
  const sg = new Graphics();
  const shA = [136 / 255, 102 / 255, 68 / 255];
  for (let i = 0; i < 3; i++) {
    sg.beginFill(0, shA[i]);
    sg.drawRect(w - 1 - i, i, 1, h - 2 * i);
    sg.drawRect(i, h - 1 - i, w - 2 * i, 1);
  }
  sh.graphics = sg;
  sh.mouseEnabled = false;
  clip.addChild(sh);

  // 前景纹理层（原版 Dialogue.as L134-142：InterfaceForeground.png 随机偏移铺底，位于高光/阴影之上）
  const putFg = (img: HTMLImageElement | null) => {
    if (!img) return;
    const b = new BitmapObject(img);
    b.x = -Math.random() * Math.max(img.naturalWidth - w, 0);
    b.y = -Math.random() * Math.max(img.naturalHeight - h, 0);
    b.mouseEnabled = false;
    clip.addChild(b); // FG 在最上层（高光/阴影之后）
  };
  if (fg) {
    const foreground = assets.getImage("InterfaceForeground.png");
    if (foreground) putFg(foreground);
    else void assets.ensure("InterfaceForeground.png").then((im) => { if (im) putFg(im); });
  }

  return clip;
}

/** Interface.Dialogue.FG/FGMask: texture only the letter shapes, never the whole panel.
 * Cache the small panel bitmap; do not allocate a full-stage blend layer each frame. */
export class DialogueTextMask extends Sprite {
  private image: HTMLImageElement | null = null;
  private surface: HTMLCanvasElement | null = null;
  private cacheKey = "";
  private readonly offsetX = Math.random();
  private readonly offsetY = Math.random();

  constructor(private assets: AssetStore, private panelW: number, private panelH: number,
              private texts: EngineText[]) {
    super();
    this.mouseEnabled = this.mouseChildren = false;
    for (const text of texts) this.addChild(text);
    void assets.ensure("InterfaceForeground.png");
  }

  renderChildren(ctx: CanvasRenderingContext2D) {
    const image = this.assets.getImage("InterfaceForeground.png");
    if (!image) { super.renderChildren(ctx); return; }
    // AS3 FGMask contains live TextFields. Rasterize their web equivalent at the
    // actual output resolution, not 1px per logical pixel and then upscale it.
    const matrix = ctx.getTransform();
    const pixelW = Math.ceil(this.panelW * Math.max(1, Math.hypot(matrix.a, matrix.b)));
    const pixelH = Math.ceil(this.panelH * Math.max(1, Math.hypot(matrix.c, matrix.d)));
    const key = JSON.stringify([pixelW,pixelH,this.texts.map(t=>[t.text,t.size,t.width,t.textHeight,t.align,t.x,t.y,t.alpha,t.scaleX,t.scaleY])]);
    if (!this.surface || this.image !== image || this.cacheKey !== key) {
      const surface = this.surface ?? document.createElement("canvas");
      surface.width = pixelW; surface.height = pixelH;
      const off = surface.getContext("2d");
      if (!off) { super.renderChildren(ctx); return; }
      off.setTransform(pixelW / this.panelW, 0, 0, pixelH / this.panelH, 0, 0);
      for (const text of this.texts) text.render(off);
      off.globalCompositeOperation = "source-in";
      off.drawImage(image,-this.offsetX*Math.max(image.naturalWidth-this.panelW,0),
                          -this.offsetY*Math.max(image.naturalHeight-this.panelH,0));
      this.surface = surface; this.image = image; this.cacheKey = key;
    }
    ctx.drawImage(this.surface,0,0,this.panelW,this.panelH);
  }
}
