// UI 组件移植：Switch / ScrollableArea / Button
import { Sprite, Graphics, BitmapObject, type DisplayObject } from "../core/Display";
import { EngineText } from "../core/EngineText";
import type { AssetStore } from "../core/Assets";
import { sfxClick, sfxSwitch } from "./Sound";
import { Input } from "./Input";

export class Switch extends Sprite {
  position: boolean;
  private onImg: Sprite;
  private offImg: Sprite;
  private onFunction: (() => void) | null;
  private offFunction: (() => void) | null;
  private type4 = false;

  // type4 滑块滑动动画：position 翻转后滑块从当前 x 平滑移到目标（20=ON / 0=OFF）
  // 原版 Switch.as 是瞬时跳变（onImage.x = position?20:0），用户要求视觉上的"移动动画"→ 用缓动补间
  private sliderAnim: { from: number; to: number; t: number } | null = null;
  private static readonly SLIDER_DURATION = 0.18; // 秒

  private onDoubleClick: (() => void) | null = null;
  private lastClickTime = 0;

  constructor(
    type: number, position = true,
    onFunction: (() => void) | null = null, offFunction: (() => void) | null = null,
    onImg: DisplayObject | null = null, offImg: DisplayObject | null = null,
    w = 10, h = 10, buttMode = false,
    private assets: AssetStore | null = null,
    onDoubleClick: (() => void) | null = null,
  ) {
    super();
    this.position = position;
    this.onFunction = onFunction;
    this.offFunction = offFunction;
    this.onDoubleClick = onDoubleClick;
    this.onImg = new Sprite();
    this.offImg = new Sprite();
    let bitmapHitW = 0;
    let bitmapHitH = 0;
    const refreshHitArea = () => {
      const hitG = new Graphics();
      // Switch.as receives mouse events from the complete imported bitmap.
      const hitW = type === 4 ? 46 : (bitmapHitW || Math.max(w, 1));
      const hitH = type === 4 ? 15 : (bitmapHitH || Math.max(h, 1));
      hitG.hitRect(0, 0, hitW, hitH);
      this.graphics = hitG;
    };
    if (onImg && offImg) {
      this.onImg.addChild(onImg);
      this.offImg.addChild(offImg);
    } else if (type === 1 || type === 2) {
      // 原版 Switch.as else 分支：InterfaceSwitch{type}Down/Up.png（type1 小组开关 / type2 剂量单选钮）
      const off = assets?.getImage("InterfaceSwitch" + type + "Down.png");
      const on = assets?.getImage("InterfaceSwitch" + type + "Up.png");
      bitmapHitW = Math.max(off?.naturalWidth || off?.width || 0, on?.naturalWidth || on?.width || 0);
      bitmapHitH = Math.max(off?.naturalHeight || off?.height || 0, on?.naturalHeight || on?.height || 0);
      const mkImg = (im: HTMLImageElement | null, fallbackColor: number) => {
        const s = new Sprite();
        if (im) {
          const b = new BitmapObject(im); b.mouseEnabled = false; s.addChild(b);
        } else {
          const g = new Graphics();
          g.lineStyle(1, 8222317);
          g.beginFill(fallbackColor, 0.7);
          g.drawRect(0, 0, 25, 25);
          s.graphics = g;
        }
        return s;
      };
      this.offImg = mkImg(off ?? null, 7366752);
      this.onImg = mkImg(on ?? null, 5261376);
      w = Math.max(w, 25); h = Math.max(h, 25);
      if (assets) {
        const apply = (slot: Sprite, im: HTMLImageElement | null) => {
          if (!im || slot.children.some((c) => c instanceof BitmapObject)) return;
          slot.removeAll();
          slot.graphics = new Graphics();
          const b = new BitmapObject(im); b.mouseEnabled = false; slot.addChild(b);
          bitmapHitW = Math.max(bitmapHitW, im.naturalWidth || im.width);
          bitmapHitH = Math.max(bitmapHitH, im.naturalHeight || im.height);
          refreshHitArea();
        };
        if (!off) void assets.ensure("InterfaceSwitch" + type + "Down.png").then((im) => { apply(this.offImg, im); });
        if (!on) void assets.ensure("InterfaceSwitch" + type + "Up.png").then((im) => { apply(this.onImg, im); });
      }
    } else if (type === 5) {
      const mk = (check: boolean) => {
        const s = new Sprite();
        const g = new Graphics();
        g.lineStyle(2, 6314064);
        g.beginFill(16777215);
        g.drawRect(0, 0, w, h);
        if (check) {
          g.beginFill(6314064);
          g.moveTo(w * 0.1, h * 0.55);
          g.lineTo(w * 0.4, h * 0.85);
          g.lineTo(w * 0.9, h * 0.25);
          g.lineTo(w * 0.8, h * 0.15);
          g.lineTo(w * 0.4, h * 0.71);
          g.lineTo(w * 0.2, h * 0.45);
        }
        s.graphics = g;
        return s;
      };
      this.offImg = mk(false);
      this.onImg = mk(true);
    } else if (type === 3) {
      // 原版 Switch.as type3（L39-63）：onImage=0x504840 底(左+上黑边1 右+下白边0.3) / offImage=0x706860 底(左+上白边0.3 右+下黑边0.6)
      // 复刻为 4 条边逐段绘制（Graphics 同一 lineStyle 画多段无法改 alpha，故分 4 次）
      const mk = (color: number, tlWhite: boolean) => {
        const s = new Sprite();
        const g = new Graphics();
        g.beginFill(color, 0.8);
        g.drawRect(0, 0, w, h);
        // 左+上
        g.lineStyle(1, tlWhite ? 16777215 : 0, tlWhite ? 0.3 : 1);
        g.moveTo(0, h); g.lineTo(0, 0); g.lineTo(w, 0);
        // 右+下
        g.lineStyle(1, tlWhite ? 0 : 16777215, tlWhite ? 0.6 : 0.3);
        g.moveTo(w, 0); g.lineTo(w, h); g.lineTo(0, h);
        s.graphics = g;
        return s;
      };
      this.onImg = mk(0x504840, false);  // 选中：深灰褐底 + 左/上黑边 + 右/下白边（原版 Switch.onImage）
      this.offImg = mk(0x706860, true);   // 未选：浅灰褐底 + 左/上白边 + 右/下黑边（原版 Switch.offImage）
    } else if (type === 4) {
      // type 4：滑块（位图）——原版 Switch.as：offImage=Hole(轨道) 常显、onImage=Slider 随 position 移动
      // onImage.visible = position || type==4；offImage.visible = !position || type==4 → 两侧都显示
      // position=true → slider.x=20（ON 侧），false → slider.x=0（OFF 侧）
      const mkBmp = (im: HTMLImageElement, x = 0) => {
        const b = new BitmapObject(im);
        b.mouseEnabled = false; // 关键：hole/slider 子位图若 mouseEnabled=true 会拦截点击（命中返回位图而非 Switch → 开关点不动，用户问题2）
        b.x = x;
        return b;
      };
      const hole = assets?.getImage("InterfaceSwitch4Hole.png");
      const slider = assets?.getImage("InterfaceSwitch4Slider.png");
      if (hole) this.offImg.addChild(mkBmp(hole));
      if (slider) this.onImg.addChild(mkBmp(slider, 20));
      // 首次构建时贴图可能未加载（getImage 返回 null）→ 异步 ensure 后补上
      if (!hole && assets) {
        void assets.ensure("InterfaceSwitch4Hole.png").then((im) => {
          if (!im) return;
          this.offImg.addChild(mkBmp(im));
          this.updateVisual();
        });
      }
      if (!slider && assets) {
        void assets.ensure("InterfaceSwitch4Slider.png").then((im) => {
          if (!im) return;
          this.onImg.addChild(mkBmp(im, 20));
          this.updateVisual();
        });
      }
      this.type4 = true;
    }
    this.addChild(this.offImg);
    this.addChild(this.onImg);
    this.offImg.mouseEnabled = false;
    this.onImg.mouseEnabled = false;
    // type4 滑块（计算器 ON/OFF 开关）传 w=h=0 → 命中区 0×0 无法点击（用户问题2）；
    // 原版 Switch(4) 用 InterfaceSwitch4Hole.png 46×15 轨道作为点击区
    refreshHitArea();
    this.updateVisual();
    if (buttMode) this.buttonMode = true;
    this.addEventListener("click", () => {
      const now = Date.now();
      if (this.onDoubleClick && now - this.lastClickTime < 250) {
        this.lastClickTime = 0;
        this.onDoubleClick();
        return; // 双击：触发 solo/单选逻辑且不翻转自身
      }
      this.lastClickTime = now;
      this.position = !this.position;
      this.updateVisual();
      // 原版 Switch.as pressed()：切换时播放 SFXSwitch（非 SFXClick）
      sfxSwitch();
      if (this.position && this.onFunction) this.onFunction();
      else if (!this.position && this.offFunction) this.offFunction();
    });
  }

  // 每帧驱动滑块滑动动画（由所属窗口 update(dt) 调用；无动画时零开销）
  update(dt: number) {
    if (!this.sliderAnim) return;
    const a = this.sliderAnim;
    a.t += dt;
    const k = Math.min(1, a.t / Switch.SLIDER_DURATION);
    // easeOutCubic：起步快、末尾缓——模拟物理滑块的减速感
    const e = 1 - Math.pow(1 - k, 3);
    const sl = this.onImg.children[0];
    if (sl) sl.x = a.from + (a.to - a.from) * e;
    if (k >= 1) this.sliderAnim = null;
  }

  private updateVisual() {
    // 原版 Switch.as：type4 两侧常显（轨道 hole + 滑块 slider），滑块 x 随 position 移动（20=ON / 0=OFF）
    if (this.type4) {
      this.onImg.visible = true;
      this.offImg.visible = true;
      const sl = this.onImg.children[0];
      const target = this.position ? 20 : 0;
      if (!sl) return;
      // 初次构建/异步 ensure 完成：直接到位；用户点击翻转：启动滑动动画
      if (!this.sliderAnim) {
        const cur = sl.x;
        if (Math.abs(cur - target) > 0.01) {
          this.sliderAnim = { from: cur, to: target, t: 0 };
        } else {
          sl.x = target;
        }
      } else {
        // 动画进行中被再次调用（如异步 ensure 后）：更新目标，动画继续从当前插值走
        this.sliderAnim.to = target;
      }
      return;
    }
    this.onImg.visible = this.position;
    this.offImg.visible = !this.position;
  }

  // 外部同步初始值（不触发回调）
  setPosition(v: boolean) {
    this.position = v;
    this.updateVisual();
  }

  // 替换开关上的图标子项（保留 onImg/offImg 底板，避免 removeAll 清掉边框与选中态底色）
  setIcon(child: DisplayObject) {
    for (const ch of [...this.children]) {
      if (ch !== this.offImg && ch !== this.onImg) this.removeChild(ch);
    }
    this.addChild(child);
  }
}

export class ScrollableArea extends Sprite {
  readonly Content = new Sprite();
  contentList: DisplayObject[] = [];
  verticalScrollEnabled: boolean;
  private scrollPos = 0;
  private contentH = 0;
  private scrollbarW = 3;
  private step = 15;
  private maxH = 0;
  private autoHide = false;
  private thumbH = 0;
  private dragging = false;
  // t93：横向滚动（原版 ScrollableArea 每区都有 纵向+横向 两根 Scrollbar；web 用于水平列表如装备背包清单）
  private horizontalScrollEnabled = false;
  private scrollX = 0;
  private contentW = 0;
  private maxW = 0;
  private thumbW = 0;
  private thumbZone: Sprite | null = null;
  // 原版 Scrollbar style=3 滑块底图 = InterfaceBackground.png（880x880 纹理局部窗口），
  // 异步加载；未加载时用近似灰褐底色兜底
  private tex: HTMLImageElement | null = null;

  constructor(
    private w: number, private h: number,
    _mw: number | null = null, _mh: number | null = null,
    vertical = true, _horizontal = true, autoHide = false,
    scrollbarW = 3, step = 15, assets?: AssetStore | null,
  ) {
    super();
    this.verticalScrollEnabled = vertical;
    // t93：仅当显式 vertical=false（水平列表）时启用底部横向滚动条；竖向列表维持现状
    this.horizontalScrollEnabled = !vertical && !!_horizontal;
    this.scrollbarW = scrollbarW;
    this.step = step;
    this.autoHide = autoHide;
    if (assets) {
      const im = assets.getImage("InterfaceBackground.png");
      if (im) { this.tex = im; }
      else void assets.ensure("InterfaceBackground.png").then((i) => { if (i) { this.tex = i; } });
    }
    this.addChild(this.Content);
    // 滚动条滑块命中区（子节点：命中即 pointerdown；buttonMode → 悬停手型）
    const tz = new Sprite();
    tz.mouseEnabled = true;
    tz.mouseChildren = false;
    tz.addEventListener("pointerdown", () => this.startThumbDrag());
    tz.addEventListener("click", () => { /* 点击滑块不触发列表行选择 */ });
    this.thumbZone = tz;
    this.addChild(tz);
    this.syncThumb();
    // t51：滚动区命中区（滚轮事件需 hitTest 落到本节点；行仍优先命中，不影响点击）
    const hg = new Graphics();
    hg.hitRect(0, 0, w, h);
    this.graphics = hg;
    this.onWheel = (delta) => {
      if (!this.verticalScrollEnabled) {
        if (this.horizontalScrollEnabled) { this.scrollX = Math.max(-this.maxW, Math.min(0, this.scrollX - delta * 0.3)); this.Content.x = this.scrollX; }
        return;
      }
      this.scrollPos = Math.max(-this.maxH, Math.min(0, this.scrollPos - delta * 0.3)); // t102: 原版 AS3 mouseWheel delta≈±3 × 10 = ±30px/格
      this.Content.y = this.scrollPos;
    };
  }

  // 命中裁剪：可视区外的内容行不得拦截点击（否则列表末行会挡住下方按钮，如产业页 CLOSE）
  // Scrollbar is tested separately; content outside the visible viewport is never interactive.
  hitTestPoint(wx: number, wy: number): DisplayObject | null {
    if (!this.visible) return null;
    const x = (wx - this.x) / this.scaleX, y = (wy - this.y) / this.scaleY;
    const bar = this.thumbZone?.hitTestPoint(x, y);
    if (bar) return bar;
    if (x < 0 || y < 0 || x > this.w || y > this.h) return null;
    return super.hitTestPoint(wx, wy);
  }

  addContent(obj: DisplayObject, ..._rest: unknown[]) {
    this.Content.addChild(obj);
    this.contentList.push(obj);
    this.updateSize();
  }
  clearAll() {
    this.Content.removeAll();
    this.contentList = [];
    // 原版 ScrollableArea.clearAll(param1=false) 不重置滚动（只移除子项）；
    // 重置滚动会让交易窗口每次 update()（移动/退还物品）都跳到列表顶部 —— 用户反馈"点击完物品自动滚到最顶部"。
    // 保留当前 scrollPos（updateSize 会重新钳制；TradeWindow 重建后显式恢复滚动）。
  }

  /** 当前滚动偏移（负值，-maxH..0）。 */
  get scroll(): number { return this.scrollPos; }
  /** 设置滚动偏移（自动钳制到合法范围）。 */
  set scroll(v: number) {
    this.scrollPos = Math.max(-this.maxH, Math.min(0, v));
    this.Content.y = this.scrollPos;
  }
  // t93 横向滚动偏移（负值，-maxW..0）。
  get hscroll(): number { return this.scrollX; }
  set hscroll(v: number) {
    this.scrollX = Math.max(-this.maxW, Math.min(0, v));
    this.Content.x = this.scrollX;
  }
  updateSize() {
    let maxY = 0, maxX = 0;
    for (const c of this.contentList) {
      const bottom = c.y + ((c as any).height ?? (c as any).textHeight ?? 30);
      maxY = Math.max(maxY, bottom);
      const right = c.x + ((c as any).width ?? (c as any).textWidth ?? 30);
      maxX = Math.max(maxX, right);
    }
    this.contentH = maxY;
    this.maxH = Math.max(0, this.contentH - this.h);
    this.scrollPos = Math.max(-this.maxH, Math.min(0, this.scrollPos));
    this.Content.y = this.scrollPos;
    // t93：横向内容宽 / 最大偏移 / 钳制
    this.contentW = maxX;
    this.maxW = Math.max(0, this.contentW - this.w);
    this.scrollX = Math.max(-this.maxW, Math.min(0, this.scrollX));
    this.Content.x = this.scrollX;
    this.syncThumb();
  }
  // 滑块几何（render 与拖动共用）：thumbH 高、ty 顶 y（局部）
  private thumbMetrics(): { th: number; ty: number } {
    const th = this.maxH > 0 ? Math.max(16, this.h * (this.h / this.contentH)) : this.h;
    const ty = this.maxH > 0 ? -this.scrollPos * ((this.h - th) / this.maxH) : 0;
    return { th, ty };
  }
  // t93 横向滑块几何（render/拖动共用）：tw 宽、tx 左 x（局部）
  private hThumbMetrics(): { tw: number; tx: number } {
    const tw = this.maxW > 0 ? Math.max(16, this.w * (this.w / this.contentW)) : this.w;
    const tx = this.maxW > 0 ? -this.scrollX * ((this.w - tw) / this.maxW) : 0;
    return { tw, tx };
  }
  private syncThumb() {
    if (!this.thumbZone) return;
    const sw = this.scrollbarW;
    const g = new Graphics();
    if (this.horizontalScrollEnabled) {
      // Like the vertical bar, the horizontal track sits outside the content clip.
      const sy = this.h;
      const { tw } = this.hThumbMetrics();
      this.thumbW = tw;
      g.hitRect(0, sy, Math.max(tw, this.w), sw);
      this.thumbZone.buttonMode = true; // t98：原版 Scrollbar Scroller.buttonMode 恒 true（不可滚动也悬停手型）
    } else {
      const sx = this.w; // 原版 Scrollbar.x=currWidth → 滚动条在内容 clip 右缘外侧的沟槽（List 宽=内容宽+10）
      const { th } = this.thumbMetrics();
      this.thumbH = th;
      g.hitRect(sx, 0, sw, Math.max(th, this.h));
      this.thumbZone.buttonMode = true; // t98:同上
    }
    this.thumbZone.graphics = g;
  }
  // t100：Input.mouseX/Y 是画布逻辑坐标（880x495 舞台系）；this.x/y 是父容器局部系。
  // 父链含偏移（如 mainArea.y=40 → 槽位/列表局部 y 负值）时差值错误 → 点击滚动条会跳走很远。
  // 统一换算成舞台坐标后再算点击相对滑块的偏移。
  private stageXY(): { x: number; y: number } {
    let ox = this.x ?? 0, oy = this.y ?? 0;
    let p = this.parent as any;
    while (p) { ox += p.x ?? 0; oy += p.y ?? 0; p = p.parent; }
    return { x: ox, y: oy };
  }
  // 按滑块拖动（原版 Scrollbar.clickScroller/EF/releaseScroller）
  private startThumbDrag() {
    if (this.horizontalScrollEnabled) {
      // t93 横向拖动：水平位移换算 Content.x（Input.mouseX 为逻辑坐标）
      if (this.maxW <= 0) return;
      const area = this;
      const { tw } = this.hThumbMetrics();
      const range = Math.max(this.w - tw, 1);
      const startX = Input.mouseX;
      const lx = startX - this.stageXY().x;
      const frac = Math.max(0, Math.min(1, (lx - tw / 2) / range));
      area.hscroll = -frac * this.maxW;
      this.syncThumb();
      this.dragging = true;
      const startScroll = this.hscroll;
      Input.drag = {
        onMove: (x: number) => {
          if (!area.dragging) return;
          const dx = x - startX;
          area.hscroll = startScroll - dx * (this.maxW / range);
          this.syncThumb();
        },
        onUp: () => { area.dragging = false; },
      };
      return;
    }
    if (this.maxH <= 0) return;
    const area = this;
    const th = this.thumbMetrics().th;
    const range = Math.max(this.h - th, 1);
    // 点轨跳转：按点击位置置位（舞台系换算，t100）
    const startY = Input.mouseY;
    const ly = startY - this.stageXY().y;
    const frac = Math.max(0, Math.min(1, (ly - th / 2) / range));
    area.scroll = -frac * this.maxH;
    this.syncThumb();
    this.dragging = true;
    const startScroll = this.scroll;
    Input.drag = {
      onMove: (x: number, y: number) => {
        if (!area.dragging) return;
        const dy = y - startY;
        area.scroll = startScroll - dy * (this.maxH / range);
        this.syncThumb();
      },
      onUp: () => { area.dragging = false; },
    };
  }
  get thumbVisible(): boolean { return this.maxH > 0 || !this.autoHide; }
  remove() { this.clearAll(); }

  renderSelf(ctx: CanvasRenderingContext2D) {
    // 裁剪区域（模拟 mask）
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.w, this.h);
    ctx.clip();
    // Content 已作为 child 渲染，此处只负责裁切——用渲染子节点替代
    ctx.restore();
  }

  // 覆写渲染：先 clip 渲染行内容，再在同一变换下（无 clip）画滚动条
  // 原版 ScrollableArea：内容 clip 区宽 currWidth(=w)，滚动条 Scrollbar.x=currWidth → 画在 clip 右缘外侧的沟槽
  // （List 背景/外框 100 宽、内容 90 → 滚动条落在卡片右缘与列表右边框之间的 10px 沟槽，不压卡片）
  render(ctx: CanvasRenderingContext2D) {
    if (!this.visible) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
    ctx.globalAlpha *= this.alpha;
    // 第一段：内容裁剪
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.w, this.h);
    ctx.clip();
    for (const c of this.children) this.renderChild(c, ctx);
    ctx.restore();
    // 第二段：滚动条（同一 translate/scale 下、无 clip）
    if (this.verticalScrollEnabled && (!this.autoHide || this.maxH > 0)) {
      const sw = this.scrollbarW;
      const sx = this.w;
      // 轨道（原版 Scrollbar.as style=3：左+上黑线 0.4，右+下白线 0.2）
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + 0.5, this.h); ctx.lineTo(sx + 0.5, 0.5); ctx.lineTo(this.w + sw - 0.5, 0.5);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.moveTo(this.w + sw - 0.5, 0.5); ctx.lineTo(this.w + sw - 0.5, this.h - 0.5); ctx.lineTo(sx + 0.5, this.h - 0.5);
      ctx.stroke();
      {
        const { th: thumbH, ty } = this.thumbMetrics();
        // 滑块底：直接 drawImage 纹理局部（9 参数源裁切），禁用 createPattern——
        // 实证（t114 帧数暴跌）：pattern fillRect 与同帧 canvas 源 drawImage（交易页头像 16 层）
        // 组合时每条滑块 ~11ms/帧（软件/硬件均复现）；image 源 drawImage 无此问题。
        // 滑块几何 sx∈[10,860] + sw≤10、ty∈[0,389]+thumbH≤390 恒 <880 → 单次源裁切不越界。
        // t100：源裁剪固定取纹理左上 (0,0)（原版 Scroller 内 880x880 beginBitmapFill(InterfaceBackground)
        // 平铺 → 所有滚动条滑块显示同一区域纹理；此前源 x=sx(内容宽) 导致每条滚动条纹理各异）
        if (this.tex && this.tex.complete && this.tex.naturalWidth >= sw && this.tex.naturalHeight >= thumbH) {
          ctx.drawImage(this.tex, 0, 0, sw, thumbH, sx, ty, sw, thumbH);
        } else if (this.tex && this.tex.complete && this.tex.naturalWidth > 0) {
          ctx.fillStyle = "rgba(90,86,78,0.95)";
          ctx.fillRect(sx, ty, sw, thumbH);
        } else {
          ctx.fillStyle = "rgba(90,86,78,0.95)";
          ctx.fillRect(sx, ty, sw, thumbH);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + 0.5, ty + thumbH - 0.5); ctx.lineTo(sx + 0.5, ty + 0.5); ctx.lineTo(this.w + sw - 0.5, ty + 0.5);
        ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.moveTo(this.w + sw - 0.5, ty + 0.5); ctx.lineTo(this.w + sw - 0.5, ty + thumbH - 0.5); ctx.lineTo(sx + 0.5, ty + thumbH - 0.5);
        ctx.stroke();
      }
    }
    // t93 横向滚动条：底部轨道（原版 horizontalScrollbar 旋转 -90 置于底部；轨道/滑块配色与竖向条同款）
    if (this.horizontalScrollEnabled && (!this.autoHide || this.maxW > 0)) {
      const sw2 = this.scrollbarW;
      const sy = this.h;
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0.5, sy + 0.5); ctx.lineTo(this.w - 0.5, sy + 0.5);
      ctx.lineTo(this.w - 0.5, sy + sw2 - 0.5);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.moveTo(0.5, sy + sw2 - 0.5); ctx.lineTo(this.w - 0.5, sy + sw2 - 0.5);
      ctx.lineTo(this.w - 0.5, sy + 0.5);
      ctx.stroke();
      const { tw, tx } = this.hThumbMetrics();
      if (this.tex && this.tex.complete && this.tex.naturalWidth >= tw && this.tex.naturalHeight >= sw2) {
        ctx.drawImage(this.tex, 0, 0, tw, sw2, tx, sy, tw, sw2); // t100：源同样固定 (0,0) → 与竖向条同纹理
      } else {
        ctx.fillStyle = "rgba(90,86,78,0.95)";
        ctx.fillRect(tx, sy, tw, sw2);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx + 0.5, sy + sw2 - 0.5); ctx.lineTo(tx + 0.5, sy + 0.5); ctx.lineTo(tx + tw - 0.5, sy + 0.5);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.moveTo(tx + tw - 0.5, sy + 0.5); ctx.lineTo(tx + tw - 0.5, sy + sw2 - 0.5); ctx.lineTo(tx + 0.5, sy + sw2 - 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }
}



export class Button extends Sprite {
  private pressedImg: DisplayObject;
  private releasedImg: DisplayObject;
  private clickFunction: (() => void) | null;

  constructor(
    type: number, clickFunction: (() => void) | null, text: string | null = null,
    assets: AssetStore | null = null,
  ) {
    super();
    this.clickFunction = clickFunction;
    // 原版 Button.as：type9/10 用 InterfaceButton6 贴图（scale 0.86 / 0.71），其余用 InterfaceButton{type}
    const imgType = type === 9 || type === 10 ? 6 : type;
    const upName = type === 7 ? "Button15x15Up.png" : type === 8 ? "InterfaceSwitch2Down.png" : "InterfaceButton" + imgType + "Up.png";
    const downName = type === 7 ? "Button15x15Down.png" : type === 8 ? "InterfaceSwitch2Up.png" : "InterfaceButton" + imgType + "Down.png";
    const up = assets?.getImage(upName);
    const down = assets?.getImage(downName);
    this.releasedImg = up ? new BitmapObject(up) : this.fallbackRect(type, false);
    this.pressedImg = down ? new BitmapObject(down) : this.fallbackRect(type, true);
    // 原版 Button.as L59/L63：type9/10 只缩 scaleX（0.86/0.71），scaleY 保持 1 → 按钮 206*sc × 28
    // 复刻此前同时缩 scaleY 导致按钮变矮 146×20，13px 文字在 (3,3,100,20) 溢出到按钮下方
    const sc = type === 10 ? 0.71 : type === 9 ? 0.86 : 1;
    if (sc !== 1) {
      this.releasedImg.scaleX = sc;
      this.pressedImg.scaleX = sc;
      // scaleY 保持 1（原版仅缩 X）
    }
    this.addChild(this.pressedImg);
    this.addChild(this.releasedImg);
    this.pressedImg.mouseEnabled = false;
    this.releasedImg.mouseEnabled = false;
    // 贴图异步加载完成前 fallbackRect 占位 → 加载后替换为真位图（原版 Button 贴图在首次构建时可能未就绪）
    // 原版 InterfaceButton{type}Up/Down.png 均为 206×28；type9/10 只缩 scaleX
    const BTN_W = 206, BTN_H = 28;
    if (assets) {
      const apply = (upIm: HTMLImageElement | null, downIm: HTMLImageElement | null) => {
        if (upIm && !(this.releasedImg instanceof BitmapObject)) {
          const nb = new BitmapObject(upIm);
          nb.mouseEnabled = false;
          // 不再设 nb.scaleX：外层 releasedImg（fallback Sprite）在构造时已 scaleX=sc，
          // 这里再设内层位图会双重缩放（sc²=0.5041）→ 按钮宽度减半（首次载入图片未缓存时的 bug）
          const sp = this.releasedImg as Sprite;
          sp.removeAll();
          sp.graphics = new Graphics(); // 清掉 fallback 灰底
          sp.addChild(nb);
        }
        if (downIm && !(this.pressedImg instanceof BitmapObject)) {
          const nb = new BitmapObject(downIm);
          nb.mouseEnabled = false;
          // 同上：外层 pressedImg 已 scaleX=sc，内层位图不再缩放
          const sp = this.pressedImg as Sprite;
          sp.removeAll();
          sp.graphics = new Graphics();
          sp.addChild(nb);
        }
      };
      Promise.all([
        assets.ensure(upName).catch(() => null),
        assets.ensure(downName).catch(() => null),
      ]).then(([u, d]) => apply(u, d));
    }
    const hg = new Graphics();
    // 原版贴图实际尺寸：type2/6=206×28、type3/4=47×28、type5=155×28、type1=40×40、type9/10=206×28×scX
    // 之前统一用 206×28 导致计算器 47×28 按钮的命中区横向重叠（相邻按钮互相遮住）
    const BTN_IMG_W = type === 3 || type === 4 ? 47 : type === 5 ? 155 : type === 1 ? 40 : type === 7 ? 15 : type === 8 ? 25 : 206;
    const iw = BTN_IMG_W * sc;
    const ih = type === 1 ? 40 : type === 7 ? 15 : type === 8 ? 25 : BTN_H;
    hg.hitRect(0, 0, iw, ih);
    this.graphics = hg;
    this.pressedImg.visible = false;
    if (text != null) {
      const style = BTN_STYLES[type] ?? { color: 4469521, size: 13, ox: 3, oy: 3, w: 200, h: 20 };
      this.addChild(new EngineText(text, style.color, style.size, "center", style.ox, style.oy, style.w, style.h));
    }
    this.buttonMode = true;
    this.addEventListener("pointerdown", () => { sfxClick(); this.pressedImg.visible = true; this.releasedImg.visible = false; });
    this.addEventListener("pointerup", () => { this.pressedImg.visible = false; this.releasedImg.visible = true; });
    this.addEventListener("pointerout", () => { this.pressedImg.visible = false; this.releasedImg.visible = true; });
    this.addEventListener("click", () => { if (this.clickFunction) this.clickFunction(); });
  }

  private fallbackRect(type: number, pressed: boolean): Sprite {
    const s = new Sprite();
    const g = new Graphics();
    g.lineStyle(1, pressed ? 8947848 : 6710886);
    g.beginFill(pressed ? 8947848 : 11184810);
    g.drawRect(0, 0, 200, 30);
    s.graphics = g;
    return s;
  }
}

const BTN_STYLES: Record<number, { color: number; size: number; ox: number; oy: number; w: number; h: number }> = {
  2: { color: 4469521, size: 13, ox: 3, oy: 3, w: 200, h: 20 },
  3: { color: 2630688, size: 12, ox: 1, oy: 2, w: 34, h: 20 },
  4: { color: 15789288, size: 12, ox: 1, oy: 2, w: 34, h: 20 },
  5: { color: 15789288, size: 12, ox: 1, oy: 2, w: 142, h: 20 },
  6: { color: 4469521, size: 13, ox: 3, oy: 3, w: 140, h: 20 },
  7: { color: 4469521, size: 12, ox: 0, oy: 0, w: 15, h: 15 },
  8: { color: 4469521, size: 14, ox: 0, oy: 2.5, w: 23, h: 20 },
  9: { color: 4469521, size: 13, ox: 3, oy: 3, w: 120, h: 20 },
  10: { color: 4469521, size: 13, ox: 3, oy: 3, w: 100, h: 20 },
};
