// 片头过场（原版 Caravaneer2.as case 11 IntroVideo 的 Web 替代）：
// Web 无原版 Flash 视频资源（assets.swf symbol1033 内嵌动画），改用「静态画面 + 逐字字幕动画」过渡。
// 多场景：背景淡入 + 轻微推近（Ken Burns）→ 字幕逐字显示 → 黑场转场；点击任意处跳过。
import { Sprite, Graphics, BitmapObject } from "../core/Display";
import { EngineText } from "../core/EngineText";
import type { AssetStore } from "../core/Assets";

export interface IntroScene {
  /** 背景图片资源名；空串 = 纯黑背景 */
  bg: string;
  /** 字幕文本（自动逐字显示） */
  text: string;
  /** 字幕颜色（默认黑，适配亮背景） */
  color?: number;
  /** 字幕字号（默认 16） */
  size?: number;
}

// 每行最多字符数（16px 中文 ≈ 820px 盒 ≈ 50 字，取 40 稳妥）
const MAX_CHARS_PER_LINE = 40;
// 打字速度（字/秒）
const TYPE_SPEED = 60;
const TYPE_MAX = 1.8; // 单场景打字时长上限（秒）——受冒烟 S3 waitMap 8s 预算约束
const BG_FADE = 0.35;   // 背景淡入时长（秒）
const HOLD = 0.3;       // 字幕显示完后的停留（秒）
const OUT_FADE = 0.35;  // 黑场淡出时长（秒，结尾 + 场景转场）

export function wrapText(text: string, maxChars = MAX_CHARS_PER_LINE): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (ch === "\n") { out.push(cur); cur = ""; continue; }
    cur += ch;
    if (cur.length >= maxChars) { out.push(cur); cur = ""; }
  }
  if (cur) out.push(cur);
  return out;
}

export class IntroCutscene extends Sprite {
  private idx = 0;
  private t = 0;
  private finished = false;
  private endRequested = false;
  private endTimer = -1; // -1=未开始，>=0 结束淡出计时
  private scenes: IntroScene[];
  private caption!: EngineText;
  private bgCur = new Sprite();
  private bgNext = new Sprite();
  private black!: Sprite;
  private bgImage: HTMLImageElement | null = null;
  private bgImagePending = false;
  private bgWait = -1;
  private assets: AssetStore;
  private onDone: () => void;
  private sceneDur: number[] = [];

  constructor(scenes: IntroScene[], assets: AssetStore, onDone: () => void) {
    super();
    this.scenes = scenes;
    this.assets = assets;
    this.onDone = onDone;
    // 黑场背景
    const bg = new Sprite();
    const bgG = new Graphics();
    bgG.beginFill(0);
    bgG.drawRect(0, 0, 880, 495);
    bg.graphics = bgG;
    bg.mouseEnabled = false;
    this.addChild(bg);
    // 当前/下一场景背景（支持交叉淡化）
    for (const s of [this.bgCur, this.bgNext]) {
      s.mouseEnabled = false;
      s.alpha = 0;
      this.addChild(s);
    }
    // 字幕
    this.caption = new EngineText("", 0, 16, "center", 30, 350, 820, 120, true);
    this.caption.mouseEnabled = false;
    this.addChild(this.caption);
    // 转场黑幕（最上层）
    this.black = new Sprite();
    const bg2 = new Graphics();
    bg2.beginFill(0);
    bg2.drawRect(0, 0, 880, 495);
    this.black.graphics = bg2;
    this.black.alpha = 1;
    this.black.mouseEnabled = false;
    this.addChild(this.black);
    // 场景时长预算（无字幕场景=标题卡，缩短）
    for (const sc of scenes) {
      const typeDur = sc.text ? Math.min(TYPE_MAX, Math.max(0.7, sc.text.length / TYPE_SPEED)) : 0.45;
      this.sceneDur.push(BG_FADE + typeDur + (sc.text ? HOLD : 0.4));
    }
    // 点击跳过（命中区只做命中不渲染）
    const hit = new Sprite();
    const hg = new Graphics();
    hg.hitRect(0, 0, 880, 495);
    hit.graphics = hg;
    hit.addEventListener("click", () => this.skip());
    this.addChild(hit);
    this.loadScene(0);
  }

  private loadScene(i: number) {
    this.idx = i;
    this.t = 0;
    const sc = this.scenes[i];
    // 字幕
    const lines = wrapText(sc.text);
    this.caption.color = sc.color ?? 0;
    this.caption.size = sc.size ?? 16;
    this.caption.y = 495 - 60 - lines.length * Math.round((sc.size ?? 16) * 1.35) / 2;
    this.caption.text = "";
    // 背景
    this.bgImage = null;
    this.bgCur.alpha = 0;
    this.bgNext.alpha = 0;
    this.bgImagePending = false;
    this.bgWait = -1;
    if (sc.bg) {
      const img = this.assets.getImage(sc.bg);
      if (img) this.bgImage = img;
      else {
        this.bgImagePending = true;
        void this.assets.ensure(sc.bg).then((im) => {
          this.bgImagePending = false;
          if (im && this.idx === i) { this.bgImage = im; this.renderBg(); }
        });
      }
    }
    this.renderBg();
  }

  private renderBg() {
    this.bgCur.removeAll();
    this.bgNext.removeAll();
    if (this.bgImage) {
      const b = new BitmapObject(this.bgImage);
      b.mouseEnabled = false;
      this.bgCur.addChild(b);
    }
  }

  private typeText(progress: number) {
    const full = this.scenes[this.idx].text;
    if (!full) { this.caption.text = ""; return; }
    const visible = Math.floor(progress * full.length);
    const lines = wrapText(full);
    const shown: string[] = [];
    let rem = visible;
    for (const ln of lines) {
      if (rem >= ln.length) { shown.push(ln); rem -= ln.length; }
      else if (rem > 0) { shown.push(ln.slice(0, rem)); rem = 0; }
      else break;
    }
    this.caption.text = shown.join("\n");
  }

  skip() {
    if (this.finished || this.endRequested) return;
    this.endRequested = true;
    this.endTimer = 0;
  }

  update(dt: number) {
    if (this.finished) return;
    if (this.endTimer >= 0) {
      this.endTimer += dt;
      this.black.alpha = Math.min(1, this.endTimer / 0.18);
      if (this.black.alpha >= 1) {
        this.finished = true;
        this.onDone();
      }
      return;
    }
    // 等背景图加载（最多 2s），期间保持黑场，避免冷加载时闪黑
    const sc0 = this.scenes[this.idx];
    if (sc0.bg && !this.bgImage && this.bgImagePending) {
      if (this.bgWait === undefined) this.bgWait = 0;
      this.bgWait += dt;
      if (this.bgWait < 2) return;
    }
    this.bgWait = -1;
    this.t += dt;
    const dur = this.sceneDur[this.idx];
    const sc = this.scenes[this.idx];
    const typeDur = sc.text ? Math.min(TYPE_MAX, Math.max(0.7, sc.text.length / TYPE_SPEED)) : 0.45;
    // 黑场淡出（场景开头）
    if (this.t < BG_FADE) this.black.alpha = 1 - this.t / BG_FADE;
    // 背景淡入 + 轻微推近
    const inP = Math.min(1, this.t / BG_FADE);
    this.bgCur.alpha = inP;
    const zoom = 1 + 0.05 * Math.min(1, this.t / dur);
    this.bgCur.scaleX = this.bgCur.scaleY = zoom;
    // 字幕逐字
    if (this.t > BG_FADE) {
      const p = Math.min(1, (this.t - BG_FADE) / typeDur);
      this.typeText(p);
      this.caption.alpha = Math.min(1, p * 1.2 + 0.3);
    } else {
      this.caption.alpha = 0;
    }
    // 场景结束：黑场转场
    if (this.t >= dur) {
      if (this.idx < this.scenes.length - 1) {
        // 直接切下一场景（黑场在 loadScene 重置为 1 后淡出）
        this.black.alpha = 1;
        this.loadScene(this.idx + 1);
      } else {
        this.endRequested = true;
        this.endTimer = 0;
      }
    }
  }
}
