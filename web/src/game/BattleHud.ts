import { blocksMovement } from "./BattleObstacles";
// 原版 BattleInterface.as 880×495 HUD 移植：
// - BattleInterfaceBase.png 整张底图 + 动态部件（肖像/名称/数码管/指示条/按钮/弹药/小地图/消息/遮罩）
// - 布局以原版构造函数与 BattleMode.onInterfaceUpdate 为依据
import { Sprite, Graphics, BitmapObject } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { Indicator } from "../core/Indicator";
import { Input } from "../core/Input";
import { screenToWorld } from "./BattleFieldView";
import { buildPortraitFromCharacter } from "./Portrait";
import type { AssetStore } from "../core/Assets";
import type { DataStore } from "../core/DataStore";
import type { Battle, BattleUnit } from "./Battle";

const BRIGHT = 0xa3a183;   // brightIndicator
const DIM = 0x403f26;      // dimIndicator
const BTN = 0x262100;      // buttonColor
const PL = 16777215;       // 白字

/** Original cy - textHeight/2 - 2 cancels Flash's 2px TextField inset.
 * Canvas has no such inset: center the glyph ink in a field centered on cy instead.
 * This is opt-in; other screens retain EngineText's existing baseline and fonts. */
function hudText(label: string, color: number, size: number, align: "left" | "center" | "right",
                 x: number, cy: number, width: number, alpha: number, height = 20): EngineText {
  const t = new EngineText(label, color, size, align, x, cy - height / 2, width, height);
  t.verticalAlign = "middle";
  t.alpha = alpha;
  t.mouseEnabled = false;
  return t;
}

/** BattleInterface.as:529-537: clip both map and camera frame to MiniMapMask. */
class MiniMapViewport extends Sprite {
  private surface: HTMLCanvasElement | null = null;
  constructor(private assets: AssetStore) { super(); this.mouseEnabled = false; }
  renderChildren(ctx: CanvasRenderingContext2D) {
    const mask = this.assets.getImage("MiniMapMask.png");
    const w = mask?.width || 150, h = mask?.height || 115;
    const cv = this.surface ?? (this.surface = document.createElement("canvas"));
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    const off = cv.getContext("2d");
    if (!off) return;
    off.setTransform(1, 0, 0, 1, -670, -350);
    off.globalAlpha = 1;
    off.globalCompositeOperation = "source-over";
    off.clearRect(670, 350, w, h);
    super.renderChildren(off);
    if (mask) {
      off.globalCompositeOperation = "destination-in";
      off.drawImage(mask, 670, 350);
      off.globalCompositeOperation = "source-over";
    }
    ctx.drawImage(cv, 670, 350);
  }
}

/** 机械计数器（原版 Interface.Counter：10×11 滚轮数字，噪声颗粒底 + 滚筒明暗，无边框） */
export class OdoCounter extends Sprite {
  private digits: EngineText[] = [];
  private n: number;
  constructor(assets: AssetStore, n: number) {
    super();
    this.n = n;
    // 原版 initiateCounter：每像素噪声 r=Math.random()*20+70, g=r*0.8961, b=r*0.72727
    // （用确定性哈希，跨 rebuild 图案稳定；n 位距 10px，第 4 位起 +2px 千分位空隙）
    const hash = (x: number, y: number) => (x * 37 + y * 61 + x * y * 13 + 977) % 21;
    const overRows = [150, 100, 50, 10, 20, 10, 30, 60, 90, 120, 150]; // OverlayShades：主体列 1..8（上下渐暗、中上高光）
    const leftRows = [150, 75, 0, 30, 60, 45, 30, 15, 50, 100, 150];   // LeftShades：列 0
    const rightRows = [150, 130, 110, 90, 70, 50, 70, 90, 110, 130, 150]; // RightAlphas：列 9 黑色
    for (let i = 0; i < n; i++) {
      const cell = new Sprite();
      cell.x = (n - 1 - i) * 10 + (n - 1 - i >= 3 ? 2 : 0);
      this.addChild(cell);
      const g = new Graphics();
      for (let yy = 0; yy < 11; yy++) {
        for (let xx = 0; xx < 10; xx++) {
          const r = 70 + hash(xx + i * 13, yy + i * 7);
          g.beginFill((r << 16) | (Math.round(r * 0.8961) << 8) | Math.round(r * 0.72727), 1);
          g.drawRect(xx, yy, 1, 1);
        }
      }
      for (let yy = 0; yy < 11; yy++) {
        const bodyColor = yy <= 2 || yy >= 6 ? 0 : 16777215;
        g.beginFill(bodyColor, overRows[yy] / 255);
        g.drawRect(1, yy, 8, 1);
        const leftColor = yy >= 3 && yy <= 7 ? 16777215 : 0;
        g.beginFill(leftColor, leftRows[yy] / 255);
        g.drawRect(0, yy, 1, 1);
        g.beginFill(0, rightRows[yy] / 255);
        g.drawRect(9, yy, 1, 1);
      }
      cell.graphics = g;
      // 10×11 滚轮格：走墨迹居中路径（top 基线 + dy + 全局 2 会让数字落到格底）
      const t = new EngineText("0", 16775651, 10, "center", 0, 0, 10, 11); t.verticalAlign = "middle";
      cell.addChild(t);
      this.digits.push(t);
    }
  }
  setValue(v: number) {
    const s = String(Math.max(0, Math.floor(v))).padStart(this.n, "0").slice(-this.n);
    // 数字槽按右到左布置（与原版 Counter 的滚轮顺序一致）。
    for (let i = 0; i < this.n; i++) this.digits[i].text = s[this.n - 1 - i];
  }
}

/** 按压式小按钮（原版 InterfaceButton：Up/Down 两图 + 可覆文字/符号） */
export class PressBtn extends Sprite {
  private up: Sprite;
  private down: Sprite;
  private label: EngineText | null = null;
  downActive = false;
  constructor(assets: AssetStore, upName: string, downName: string, x: number, y: number, onPress?: () => void, label?: string) {
    super();
    this.x = x; this.y = y;
    this.mouseChildren = false; // InterfaceButton keeps labels from intercepting input.
    this.up = new Sprite();
    const uimg = assets.getImage(upName);
    if (uimg) { const b = new BitmapObject(uimg); b.mouseEnabled = false; this.up.addChild(b); }
    this.down = new Sprite();
    const dimg = assets.getImage(downName);
    if (dimg) { const b = new BitmapObject(dimg); b.mouseEnabled = false; this.down.addChild(b); }
    this.down.visible = false;
    this.addChild(this.down);
    this.addChild(this.up);
    if (label !== undefined) {
      this.label = hudText(label, BTN, 10, "center", 0, 7.5, 60, 0.8, 15);
      this.addChild(this.label);
    }
    const guessed = /60x15/i.test(upName) ? [60, 15] : /40x15/i.test(upName) ? [40, 15] : /15x15/i.test(upName) ? [15, 15] : /LaunchButton/i.test(upName) ? [60, 30] : /TVButton/i.test(upName) ? [30, 25] : [
      uimg?.naturalWidth ?? 60,
      uimg?.naturalHeight ?? 15,
    ];
    const hit = new Graphics();
    hit.hitRect(0, 0, guessed[0], guessed[1]);
    this.graphics = hit;
    this.buttonMode = true;
    this.addEventListener("pointerdown", () => {
      this.downActive = true;
      this.down.visible = true;
      this.up.visible = false;
    });
    const release = () => {
      this.downActive = false;
      this.down.visible = false;
      this.up.visible = true;
    };
    this.addEventListener("pointerup", release);
    this.addEventListener("pointerout", release);
    if (onPress) {
      this.addEventListener("click", onPress);
    }
  }
}

// 状态图标（原版 assets.swf 符号的向量近似；x 位 737.5..857.5 y=80，scale 0.15 语义）
export class BattleHud {
  b: Battle;
  assets: AssetStore;
  ds: DataStore;
  root = new Sprite();
  // 部件
  portraitHolder = new Sprite();
  private onPortraitClick = () => { if (this.b.hudAvailable()) this.b.centerViewOnCurrent(); };
  nameT!: EngineText;
  weaponHdr!: EngineText;
  weaponName!: EngineText;
  weaponType!: EngineText;
  weaponIconHolder = new Sprite();
  weaponIconAmmo = new Sprite();
  weaponIconAimedShot = new Sprite();
  weaponIconHeadShot = new Sprite();
  weaponIconParallelShots = new Sprite();
  weaponIconBurstSymbol = new Sprite();
  weaponIconBurstText!: EngineText;
  ammoHdr!: EngineText;
  availHdr!: EngineText;
  x1!: EngineText;
  x2!: EngineText;
  ammoSymbol = new Sprite();
  loadedName!: EngineText;
  loadedCount!: OdoCounter;
  modeName!: EngineText;
  reloadAmmoName!: EngineText;
  reloadAmmoCount!: OdoCounter;
  firstAidName!: EngineText;
  firstAidCount!: OdoCounter;
  pickUpItem!: EngineText;
  firstAidText!: EngineText;
  pickUpText!: EngineText;
  reloadText!: EngineText;
  hpInd!: Indicator;
  moraleInd!: Indicator;
  apInd!: Indicator;
  hpBars: Sprite[] = [];
  moraleBars: Sprite[] = [];
  apDots: Sprite[] = [];
  apOverflow = new Sprite();
  pct!: EngineText;
  mp!: EngineText;
  m!: EngineText;
  zero!: EngineText;
  fifty!: EngineText;
  hundred!: EngineText;
  apLabel!: EngineText;
  signs: Sprite[] = [];
  healLight = new Sprite();
  reloadBtn!: PressBtn;
  firstAidBtn!: PressBtn;
  pickUpBtn!: PressBtn;
  switchBtn!: PressBtn;
  unloadBtn!: PressBtn;
  dropBtn!: PressBtn;
  nextTurnBtn!: PressBtn;
  tvBtn!: PressBtn;
  miniMap = new Sprite();
  miniMapImg: BitmapObject | null = null;
  miniMapFrame = new Sprite();
  mapWrap: Sprite | null = null;
  yourGroup!: EngineText;
  alliesT!: EngineText;
  enemiesT!: EngineText;
  disabled = new Sprite();
  tooltipBG = new Sprite();
  tooltipText!: EngineText;
  tooltipOn = false;
  private miniDirty = true;
  invalidateMiniMap() { this.miniDirty = true; }
  private draggingMinimap = false;
  private miniMoved = false;
  private portraitUnit: BattleUnit | null = null;

  constructor(b: Battle, assets: AssetStore, ds: DataStore) {
    this.b = b; this.assets = assets; this.ds = ds;
  }

  build(root: Sprite) {
    if (this.root.parent) root.removeChild(this.root);
    this.root = new Sprite();
    root.addChild(this.root);
    const r = this.root;
    this.tooltipText = new EngineText("", 4339211, 12, "center");
    this.portraitUnit = null;
    // 每次重建重置亮层数组（build 可多次调用：primeBattleAssets 后 rebuild 会重复 push 旧对象）
    this.hpBars = [];
    this.moraleBars = [];
    this.apDots = [];
    this.signs = []; // 亮份状态图标数组同样重建（否则 rebuild 后残留旧对象且重复绘制）
    const base = this.assets.getImage("BattleInterfaceBase.png");
    if (base) {
      const bb = new BitmapObject(base);
      bb.mouseEnabled = false;
      r.addChild(bb);
    }

    // Original plasticTexts alpha=.5; these y values are CENTERS, not top edges.
    const plastic = (label: string, size: number, x: number, cy: number, w: number, align: "left" | "center" | "right" = "center") => {
      const t = hudText(label.toUpperCase(), PL, size, align, x, cy, w, 0.5);
      r.addChild(t);
      return t;
    };
    this.nameT = plastic("", 14, 645, 15, 230);
    this.weaponHdr = plastic(this.b.text(194), 14, 645, 140, 230);
    this.weaponName = plastic("", 12, 730, 160, 145, "left");
    this.weaponType = plastic("", 10, 730, 172.5, 145, "left");
    plastic(this.b.text(195), 14, 645, 265, 230);
    plastic(this.b.text(196), 12, 315, 460, 260);
    plastic(this.b.text(197), 12, 5, 460, 295);
    this.x1 = plastic("X", 12, 825, 192.5, 15);
    this.x2 = plastic("X", 12, 195, 477.5, 15);
    // 原版 AmmoSymbol（assets.swf symbol4 → public/assets/images/AmmoSymbol.png 15×15，
    // BattleInterface L239-241 @(737.5,192.5) 塑料层 alpha.5，无缩放无旋转——PNG 本身即斜 45° 弹壳）
    const ammoImg = this.assets.getImage("AmmoSymbol.png");
    if (ammoImg) {
      const ammoSym = new Sprite();
      const ab = new BitmapObject(ammoImg);
      ab.x = -7.5; ab.y = -7.5; // 15×15 中心对齐（注册点未知，按视觉居中）
      ab.mouseEnabled = false;
      ammoSym.addChild(ab);
      ammoSym.x = 737.5; ammoSym.y = 192.5;
      ammoSym.alpha = 0.5;
      ammoSym.mouseEnabled = false;
      ammoSym.visible = false; // 无弹药时不显示（原版 hasLoadedAmmo 才亮）
      r.addChild(ammoSym);
      this.ammoSymbol = ammoSym;
    } else {
      this.ammoSymbol = new Sprite(); // 资源缺失兜底
    }
    this.ammoHdr = plastic(this.b.text(198), 8, 670, 282.5, 80);
    this.availHdr = plastic(this.b.text(199), 8, 750, 282.5, 80);

    // 肖像（getPortrait → holder scale 0.24）
    this.portraitHolder.x = 655; this.portraitHolder.y = 35;
    this.portraitHolder.scaleX = 0.24; this.portraitHolder.scaleY = 0.24;
    this.portraitHolder.mouseChildren = false;
    const portraitHit = new Graphics(); portraitHit.hitRect(0, 0, 60 / 0.24, 60 / 0.24);
    this.portraitHolder.graphics = portraitHit;
    this.portraitHolder.removeEventListener("click", this.onPortraitClick);
    this.portraitHolder.addEventListener("click", this.onPortraitClick);
    r.addChild(this.portraitHolder);

    // 武器图标 70×70
    this.weaponIconHolder.x = 650; this.weaponIconHolder.y = 155;
    // 与武器图标共用坐标原点，弹药点阵位于武器图片左上角。
    this.weaponIconAmmo.x = 650; this.weaponIconAmmo.y = 155;
    r.addChild(this.weaponIconHolder);
    this.weaponIconAmmo.mouseEnabled = false;
    r.addChild(this.weaponIconAmmo);

    // 原版 BattleInterface.as：模式标记在武器框右下角，叠在武器/弹药之上。
    // PNG 与原版导出帧一致；恢复裁剪掉的局部原点（shapes 1/30/150/10）。
    const modeSymbol = (holder: Sprite, name: string, x: number, ox = 0, oy = 0) => {
      holder.removeAll(); // 异步预加载后 rebuild 不累积旧图标
      holder.x = x; holder.y = 205;
      holder.visible = false;
      holder.mouseEnabled = false;
      holder.mouseChildren = false;
      const image = this.assets.getImage(name);
      if (image) {
        const icon = new BitmapObject(image);
        icon.x = ox; icon.y = oy;
        icon.mouseEnabled = false;
        holder.addChild(icon);
      }
      r.addChild(holder);
    };
    modeSymbol(this.weaponIconAimedShot, "AimedShotSymbol.png", 700);
    modeSymbol(this.weaponIconHeadShot, "HeadShotSymbol.png", 700, 1.85, 0.3);
    modeSymbol(this.weaponIconParallelShots, "ParallelShotsSymbol.png", 700, 0, 5);
    modeSymbol(this.weaponIconBurstSymbol, "BurstSymbol.png", 705, 0, 1.1);
    this.weaponIconBurstText = new EngineText("", 13223167, 9, "right", 660, 205, 45, 15);
    this.weaponIconBurstText.mouseEnabled = false;
    this.weaponIconBurstText.visible = false;
    r.addChild(this.weaponIconBurstText);

    // Recessed labels: original 10px, centered, white alpha=.6.
    this.loadedName = hudText("", PL, 10, "center", 750, 192.5, 75, 0.6); r.addChild(this.loadedName);
    this.loadedCount = new OdoCounter(this.assets, 3); this.loadedCount.x = 840; this.loadedCount.y = 187; r.addChild(this.loadedCount);
    this.modeName = hudText("", PL, 10, "center", 670, 242.5, 180, 0.6); r.addChild(this.modeName);
    this.reloadAmmoName = hudText("", PL, 10, "center", 670, 297.5, 80, 0.6); r.addChild(this.reloadAmmoName);
    this.reloadAmmoCount = new OdoCounter(this.assets, 3); this.reloadAmmoCount.x = 775; this.reloadAmmoCount.y = 292; r.addChild(this.reloadAmmoCount);
    this.firstAidName = hudText("", PL, 10, "center", 30, 477.5, 145, 0.6); r.addChild(this.firstAidName);
    this.firstAidCount = new OdoCounter(this.assets, 2); this.firstAidCount.x = 210; this.firstAidCount.y = 472; r.addChild(this.firstAidCount);
    this.pickUpItem = hudText("", PL, 10, "center", 340, 477.5, 145, 0.6); r.addChild(this.pickUpItem);

    // ---- 指示（Indicator 3 位 7 段 / 20 段条 / 20 AP 点 / 溢出三角 / 刻度） ----
    const mkIndicator = (n: number, x: number, y: number) => {
      const ind = new Indicator(this.assets, n, BRIGHT, false, DIM, 5, 10, 7);
      ind.x = x; ind.y = y;
      r.addChild(ind);
      return ind;
    };
    this.hpInd = mkIndicator(3, 727, 35);
    this.moraleInd = mkIndicator(3, 727, 55);
    this.apInd = mkIndicator(2, 727, 95);
    for (let i = 0; i < 20; i++) {
      const bg = new Sprite();
      const bgG = new Graphics();
      bgG.beginFill(DIM, 0.9);
      bgG.drawRect(0, 0, 3, 10);
      bg.graphics = bgG;
      bg.x = 767 + i * 5; bg.y = 35;
      r.addChild(bg);
      const mb = new Sprite();
      const mG = new Graphics();
      mG.beginFill(DIM, 0.9);
      mG.drawRect(0, 0, 3, 10);
      mb.graphics = mG;
      mb.x = 767 + i * 5; mb.y = 55;
      r.addChild(mb);
      const hb = new Sprite();
      const hG = new Graphics();
      hG.beginFill(BRIGHT);
      hG.drawRect(0, 0, 3, 10);
      hb.graphics = hG;
      hb.x = 767 + i * 5; hb.y = 35; hb.visible = false;
      r.addChild(hb);
      const mob = new Sprite();
      const moG = new Graphics();
      moG.beginFill(BRIGHT);
      moG.drawRect(0, 0, 3, 10);
      mob.graphics = moG;
      mob.x = 767 + i * 5; mob.y = 55; mob.visible = false;
      r.addChild(mob);
      this.hpBars.push(hb);
      this.moraleBars.push(mob);
    }
    // 原版 HPBox/MoraleBox（assets.swf 符号）@(750,35)/(750,55) 染 brightIndicator → 亮色矩形背景框+深色字样
    const mkLabelBox = (label: string, x: number, y: number) => {
      const frame = new Sprite();
      const fg = new Graphics();
      fg.beginFill(BRIGHT);         // 亮橄榄实心底（brightColorTransform 染色，无描边）
      fg.drawRect(0, 0, 15, 10);    // 原版约 14-15×10px，与旁边指示器同高
      frame.graphics = fg;
      frame.x = x; frame.y = y;
      frame.mouseEnabled = false;
      r.addChild(frame);
      // 原版 HPBox/MoraleBox 是烘焙位图；web 自绘 15×10 框 + 文字 → 文字在框内墨迹居中
      const t = new EngineText(label, DIM, 7, "center", x, y, 15, 10); t.verticalAlign = "middle";
      r.addChild(t);
      return t;
    };
    this.mp = mkLabelBox("HP", 750, 35); // HPBox
    this.m = mkLabelBox("M", 750, 55);   // MoraleBox
    // 原版 BattleInterface.as:361-371 percent/zero/hundred/fifty 都是 y = 50 - textHeight/2 - 2（即"以 cy=50 墨迹居中"）。
      // 旧代码把 46 这个"已经手工补过 Flash 2px inset"的值写死，再叠 GLOBAL_TEXT_Y_OFFSET 就成了 +4 → 低 2px。
      // 改用 hudText(cy=50, verticalAlign="middle") 走墨迹居中路径（该路径不再叠加全局补偿）。
      this.pct = hudText("%", BRIGHT, 7, "center", 750, 50, 12, 1); r.addChild(this.pct);
    this.zero = hudText("0", BRIGHT, 7, "left", 765, 50, 12, 1); r.addChild(this.zero);
    this.fifty = hudText("50", BRIGHT, 7, "center", 804, 50, 20, 1); r.addChild(this.fifty);
    this.hundred = hudText("100", BRIGHT, 7, "right", 845, 50, 24, 1); r.addChild(this.hundred);
    // AP 标签：显示在剩余行动点列之后（圆点串末端右侧），亮橄榄色
    // 原版 as:377-378：AP.y = 100 - AP.textHeight/2 - 2（同样手工补过 inset）
      this.apLabel = hudText("AP", BRIGHT, 12, "center", 740, 100, 20, 1); r.addChild(this.apLabel);
    for (let i = 0; i < 20; i++) {
      const d = new Sprite();
      const dg = new Graphics();
      dg.beginFill(DIM, 0.9);
      dg.drawCircle(0, 0, 2);
      d.graphics = dg;
      d.x = 763 + i * 5; d.y = 100;
      r.addChild(d);
    }
    for (let i = 0; i < 20; i++) {
      const b2 = new Sprite();
      const bg2 = new Graphics();
      bg2.beginFill(BRIGHT);
      bg2.drawCircle(0, 0, 2);
      b2.graphics = bg2;
      b2.x = 763 + i * 5; b2.y = 100; b2.visible = false;
      r.addChild(b2);
      this.apDots.push(b2);
    }
    // 溢出三角（AP>20）
    const mkTri = (x: number, color: number, alpha: number) => {
      const g = new Graphics();
      g.beginFill(color, alpha);
      g.moveTo(0, -5); g.lineTo(6, 0); g.lineTo(0, 5); g.endFill();
      const s = new Sprite();
      s.graphics = g;
      s.x = x; s.y = 100;
      r.addChild(s);
      return s;
    };
    mkTri(861, DIM, 0.9);
    this.apOverflow = mkTri(861, BRIGHT, 1);
    this.apOverflow.visible = false;

    // ---- 状态图标行（原版 7 符号，亮/暗双份：bleeding/burning/overloaded/eye/arm/leg/critical）----
    const signX = [737.5, 757.5, 777.5, 797.5, 817.5, 837.5, 857.5];
    // 原版 7 状态符号：assets.swf MovieClip（symbol37/39/47/43/35/45/41）→ 已提取为
    // public/assets/images/IndicatorBleeding/Burning/Overload/EyeDamage/ArmDamage/LegDamage/CriticallyWounded.png，
    // BattleInterface L416-506：双份实例 + colorTransform 染 bright/dimIndicator + scale 0.15 + x 同 y=80
    const signPNG = [
      "IndicatorBleeding.png", "IndicatorBurning.png", "IndicatorOverload.png",
      "IndicatorEyeDamage.png", "IndicatorArmDamage.png", "IndicatorLegDamage.png",
      "IndicatorCriticallyWounded.png",
    ];
    // PNG 是均匀深灰剪影（rgb≈55,53,53），纯乘法染色只会更暗（用户反馈"看不见"）。
    // 改为 乘法+加法：BRIGHT 加法提亮到 0xA3A183 亮橄榄；DIM 乘法 0.65+加法 → 0x403F26 暗橄榄（原版观感，面板底上可见）
    const BRIGHT_TINT = { r: 1, g: 1, b: 1, dr: 108, dg: 106, db: 76 }; // 深灰55+108..76 → (163,161,131)
    const DIM_TINT = { r: 0.65, g: 0.65, b: 0.65, dr: 27, dg: 26, db: 1 }; // 55*0.65+27..1 → (63,60,37)
    // 居中偏移：给 srcRect 与 scale 用的包装（PNG 注册点未知，按内容矩形中心对齐）
    const makeSign = (png: string, tint: { r: number; g: number; b: number } | null) => {
      const s = new Sprite();
      const img = this.assets.getImage(png);
      if (img) {
        const b = new BitmapObject(img);
        b.scaleX = b.scaleY = 0.15; // 原版 scale 0.15
        b.x = -(b.width * 0.15) / 2;
        b.y = -(b.height * 0.15) / 2;
        if (tint) b.colorTransform = tint;
        b.mouseEnabled = false;
        s.addChild(b);
      }
      s.mouseEnabled = false;
      return s;
    };
    for (let i = 0; i < 7; i++) {
      const sDim = makeSign(signPNG[i], DIM_TINT); // 暗橄榄常显（原版 dimIndicator 份）
      sDim.x = signX[i]; sDim.y = 80;
      r.addChild(sDim);
      const s = makeSign(signPNG[i], BRIGHT_TINT); // 激活时亮色覆盖
      s.x = signX[i]; s.y = 80;
      s.visible = false;
      r.addChild(s);
      this.signs.push(s);
    }

    // ---- 小地图（745,350；旋转 45°，autoScale 115/h）----
    if (this.draggingMinimap) Input.drag = null;
    this.draggingMinimap = false;
    this.miniMap = new Sprite(); // rebuild must not retain duplicate pointer handlers
    this.mapWrap = null; this.miniMapImg = null; this.miniDirty = true;
    this.miniMap.mouseChildren = false;
    this.miniMap.x = 745; this.miniMap.y = 407.5 - 75 * 0.574;
    const miniViewport = new MiniMapViewport(this.assets);
    r.addChild(miniViewport);
    miniViewport.addChild(this.miniMap);
    this.miniMapFrame = new Sprite();
    // 原版 BattleField.as:376 miniMapFrame 是 miniMap 的子级（miniMap 局部坐标）→
    // web 独立成层时必须补 miniMap 原点偏移，否则框画在 (66,52) 全局错位
    this.miniMapFrame.x = 745; this.miniMapFrame.y = 350;
    this.miniMapFrame.mouseEnabled = this.miniMapFrame.mouseChildren = false;
    miniViewport.addChild(this.miniMapFrame);
    // 原版 as:538-545：yourGroup/enemies.y = 365 - textHeight/2 - 2，allies.y = 375 - textHeight/2 - 2
      // （旧代码把 cy 直接当成了文本框顶 → 比原版低约 5.5px，再叠全局 +2 就是 7.5px）
      this.yourGroup = hudText("", BRIGHT, 9, "left", 680, 365, 60, 1, 10); r.addChild(this.yourGroup);
    this.alliesT = hudText("", BRIGHT, 9, "left", 680, 375, 60, 1, 10); r.addChild(this.alliesT);
    this.enemiesT = hudText("", 0xff4040, 9, "right", 735, 365, 60, 1, 10); r.addChild(this.enemiesT);

    this.yourGroup.mouseEnabled = this.alliesT.mouseEnabled = this.enemiesT.mouseEnabled = false;

    // ---- 按钮 ----
    const btn = (
      up: string, down: string, x: number, y: number, onPress: () => void, label?: string,
    ) => new PressBtn(this.assets, up, down, x, y, onPress, label);
    const prev = (onPress: () => void, x: number, y: number) => {
      const pb = new PressBtn(this.assets, "Button15x15Up.png", "Button15x15Down.png", x, y, onPress);
      // 左三角符号（RepeatedGraphics 1）
      const pg = new Graphics();
      pg.beginFill(BTN, 0.6);
      pg.moveTo(3, -4); pg.lineTo(-4, 0); pg.lineTo(3, 4); pg.endFill();
      const ps = new Sprite(); ps.graphics = pg; ps.x = 7.5; ps.y = 7.5; ps.mouseEnabled = false;
      pb.addChild(ps);
      return pb;
    };
    const next = (onPress: () => void, x: number, y: number) => {
      const pb = new PressBtn(this.assets, "Button15x15Up.png", "Button15x15Down.png", x, y, onPress);
      const pg = new Graphics();
      pg.beginFill(BTN, 0.6);
      pg.moveTo(-3, -4); pg.lineTo(4, 0); pg.lineTo(-3, 4); pg.endFill();
      const ps = new Sprite(); ps.graphics = pg; ps.x = 7.5; ps.y = 7.5; ps.mouseEnabled = false;
      pb.addChild(ps);
      return pb;
    };
    this.switchBtn = btn("Button40x15Up.png", "Button40x15Down.png", 730, 210, () => this.b.switchWeapon());
    this.unloadBtn = btn("Button40x15Up.png", "Button40x15Down.png", 780, 210, () => this.b.unloadWeapon ? this.b.unloadWeapon() : undefined);
    this.dropBtn = btn("Button40x15Up.png", "Button40x15Down.png", 830, 210, () => this.b.dropWeapon());
    r.addChild(this.switchBtn);
    r.addChild(this.unloadBtn);
    r.addChild(this.dropBtn);
    // 原版 Switch/Unload/Drop 符号（web 已提取 ButtonSymbolSwitch/Unload/Drop.png；
    // 原版 BattleInterface L597-619：new ButtonSymbolSwitch/Unload/Drop()，
    // colorTransform=buttonColor、scale 0.12、alpha 0.6、符号居中于按钮 (20,7.5)）
    const mkSym = (pb: PressBtn, png: string) => {
      const img = this.assets.getImage(png);
      if (!img) return;
      const b = new BitmapObject(img);
      b.scaleX = b.scaleY = 0.12;
      b.colorTransform = { r: 0x26 / 255, g: 0x21 / 255, b: 0 };
      b.alpha = 0.6;
      b.x = 20 - (b.width * 0.12) / 2;
      b.y = 7.5 - (b.height * 0.12) / 2;
      b.mouseEnabled = false;
      pb.addChild(b);
    };
    mkSym(this.switchBtn, "ButtonSymbolSwitch.png"); // symbol21：对向弧形箭头（交换）
    mkSym(this.unloadBtn, "ButtonSymbolUnload.png"); // symbol23：向下锯齿箭头（退弹）
    mkSym(this.dropBtn, "ButtonSymbolDrop.png");     // symbol19：手 + 向下箭头（丢弃）
    const pm1 = prev(() => this.b.cycleMode(-1), 650, 235);
    r.addChild(pm1);
    const pm2 = next(() => this.b.cycleMode(1), 855, 235);
    r.addChild(pm2);
    const pa1 = prev(() => this.b.prevAmmoType(), 650, 290);
    r.addChild(pa1);
    const pa2 = next(() => this.b.nextAmmoType(), 755, 290);
    r.addChild(pa2);
    this.reloadText = hudText("", BTN, 10, "center", 0, 7.5, 60, 0.8, 15);
    this.reloadBtn = btn("Button60x15Up.png", "Button60x15Down.png", 810, 290, () => this.b.doReload());
    this.reloadBtn.addChild(this.reloadText);
    r.addChild(this.reloadBtn);
    const fa1 = prev(() => this.b.prevFirstAid(), 10, 470);
    r.addChild(fa1);
    const fa2 = next(() => this.b.nextFirstAid(), 180, 470);
    r.addChild(fa2);
    const pu1 = prev(() => this.b.prevPickUpPos(), 320, 470);
    r.addChild(pu1);
    const pu2 = next(() => this.b.nextPickUpPos(), 490, 470);
    r.addChild(pu2);
    this.firstAidText = hudText("", BTN, 10, "center", 0, 7.5, 60, 0.8, 15);
    this.firstAidBtn = btn("Button60x15Up.png", "Button60x15Down.png", 235, 470, () => this.b.toggleHealingMode());
    this.firstAidBtn.addChild(this.firstAidText);
    r.addChild(this.firstAidBtn);
    this.pickUpText = hudText("", BTN, 10, "center", 0, 7.5, 60, 0.8, 15);
    this.pickUpBtn = btn("Button60x15Up.png", "Button60x15Down.png", 510, 470, () => this.b.pickUpWeapon());
    this.pickUpBtn.addChild(this.pickUpText);
    r.addChild(this.pickUpBtn);
    this.tvBtn = btn("TVButtonUp.png", "TVButtonDown.png", 850, 470, () => this.b.openOptions());
    r.addChild(this.tvBtn);
    this.nextTurnBtn = btn("LaunchButtonUp.png", "LaunchButtonDown.png", 595, 455, () => this.b.endTurn());
    r.addChild(this.nextTurnBtn);

    // Original bulb: off bitmap always present; on bitmap only during healing mode.
    this.healLight.removeAll();
    this.healLight.mouseEnabled = this.healLight.mouseChildren = false;
    const off = this.assets.getImage("BulbLightRedOff.png");
    if (off) { const b = new BitmapObject(off); b.x = 7; b.y = 449; b.mouseEnabled = false; r.addChild(b); }
    const on = this.assets.getImage("BulbLightRedOn.png");
    if (on) {
      const b = new BitmapObject(on);
      b.x = 7; b.y = 449; b.mouseEnabled = false;
      this.healLight.addChild(b);
    }
    this.healLight.visible = false;
    r.addChild(this.healLight);

    // 遮罩（disabled：敌回合棋盘格）
    const dG = new Graphics();
    // BattleInterface.as:683: 2px black squares in a 4px XOR pattern.
    dG.beginFill(0, 1);
    for (let xx = 0; xx < 880; xx += 2) {
      for (let yy = 0; yy < 495; yy += 2) {
        if ((xx % 4 < 2) === (yy % 4 < 2)) continue;
        if (xx > 640 || yy > 445) dG.drawRect(xx, yy, 2, Math.min(2, 495 - yy));
        else if (xx === 640) dG.drawRect(641, yy, 1, 2);
      }
    }
    dG.hitRect(640, 0, 240, 495);
    dG.hitRect(0, 445, 880, 50);
    this.disabled.graphics = dG;
    this.disabled.visible = false;
    this.disabled.mouseEnabled = true;
    this.disabled.mouseChildren = false;
    r.addChild(this.disabled);

    // 工具提示
    this.tooltipBG.mouseEnabled = false;
    this.tooltipText.mouseEnabled = false;
    this.tooltipBG.visible = false;
    this.tooltipText.visible = false;
    r.addChild(this.tooltipBG);
    r.addChild(this.tooltipText);

    // The map extends LEFT of its rotation origin. Hit the whole clipped TV area.
    const hit = new Graphics(); hit.hitRect(-75, 350 - this.miniMap.y, 150, 115);
    this.miniMap.graphics = hit;
    this.miniMap.addEventListener("pointerdown", () => {
      if (!this.b.hudAvailable()) return;
      this.draggingMinimap = true;
      const move = (x: number, y: number) => {
        if (!this.b.hudAvailable()) { this.draggingMinimap = false; return; }
        const w = this.miniToWorld(x, y);
        this.b.centerOnWorld(w.x, w.y, true);
        this.syncMiniFrame();
      };
      move(Input.mouseX, Input.mouseY);
      Input.drag = { onMove: move, onUp: () => { this.draggingMinimap = false; } };
    });
  }

  /** 资源异步加载完成后整卡重建（原版 ImportedBitmap 在构造时即就绪） */
  rebuild() {
    const parent = this.root.parent;
    if (parent) this.build(parent);
  }

  // ---------- 动态同步（原版 BattleMode.onInterfaceUpdate） ----------
  sync() {
    const b = this.b;
    const cur = b.order[b.turnIdx];
    const living = b.units.filter(u => !u.isTransport && !u.dead);
    const foe = living.filter(u => u.side === 1).length;
    this.yourGroup.text = String(living.filter(u => b.groupOf(u) === 0).length);
    this.alliesT.text = String(living.filter(u => u.side === 0 && b.groupOf(u) !== 0).length);
    this.enemiesT.text = String(foe);
    if (!cur) return;
    this.syncInputState();
    this.nameT.text = cur.name.toUpperCase();
    // 肖像
    if (this.portraitUnit !== cur) {
      this.portraitHolder.removeAll();
      if (cur.isTransport) {
        const def: any = this.ds.transports?.Types?.[cur.transportType ?? 0] ?? {};
        const img = this.assets.getImage("Transport" + (cur.transportType ?? 1) + ".png");
        if (img) {
          const frameW = Math.max(1, Number(def.imageWidth ?? 100));
          const frameH = Math.max(1, Number(def.imageHeight ?? 100));
          const p = new Sprite();
          const bo = new BitmapObject(img);
          bo.srcRect = { x: 0, y: 0, w: frameW, h: frameH };
          bo.scaleX = bo.scaleY = 360 / frameW;
          bo.x = -frameW * bo.scaleX / 2;
          bo.y = -frameH * bo.scaleY + 385;
          bo.mouseEnabled = false;
          p.x = 115;
          p.addChild(bo);
          p.mouseEnabled = false;
          p.mouseChildren = false;
          this.portraitHolder.addChild(p);
        }
      } else {
        const chLike: any = cur.character ?? (cur as any).appearance ?? cur;
        const pt = buildPortraitFromCharacter(this.assets, chLike, 1);
        pt.mouseEnabled = false;
        pt.mouseChildren = false;
        this.portraitHolder.addChild(pt);
      }
      this.portraitUnit = cur;
    }
    // 指示
    this.hpInd.setValue(Math.max(0, Math.round(cur._HP)), 0, false);
    this.moraleInd.setValue(Math.min(100, Math.max(0, Math.round(cur.battleMorale))), 0, false);
    const lastHP = Math.floor(cur._HP / Math.max(cur.maxHP, 1) * 20);
    const lastMor = Math.floor(Math.min(100, Math.max(0, cur.battleMorale)) / 5);
    for (let i = 0; i < 20; i++) {
      this.hpBars[i].visible = i < lastHP;
      this.moraleBars[i].visible = i < lastMor;
      this.apDots[i].visible = i < cur.AP;
    }
    this.apInd.setValue(Math.max(0, Math.min(99, Math.round(cur.AP))), 0, false);
    this.apOverflow.visible = cur.AP > 20;
    // 状态图标
    this.signs[0].visible = cur.bleeding > 0.5;
    this.signs[1].visible = cur.burning > 0;
    this.signs[2].visible = false; // overloaded：装备重量>容量
    this.signs[3].visible = !!cur.eyeDamage;
    this.signs[4].visible = !!cur.armDamage;
    this.signs[5].visible = !!cur.legDamage;
    this.signs[6].visible = cur._HP / Math.max(cur.maxHP, 1) < 0.25;
    this.healLight.visible = !!b.healingMode;
    // 武器区
    const slot = b.activeSlot(cur);
    const sub = cur.weaponSub;
    const wdef = b.weaponDefOf(cur);
    const wtype = b.weaponTypeOf(cur);
    this.weaponName.text = sub ? (wdef?.name ? this.b.text(wdef.name).toUpperCase() : "") : "";
    this.weaponType.text = wtype && wtype.name ? this.b.text(wtype.name).toUpperCase() : "";
    this.weaponIconHolder.removeAll();
    if (sub) {
      const icon = (wdef && wdef.icon) ? wdef.icon : sub;
      const img = this.assets.getImage("weaponIcon" + icon + ".png");
      if (img) {
        const wi = new BitmapObject(img);
        wi.x = 3.75; wi.y = 3.75;
        wi.scaleX = 0.25; wi.scaleY = 0.25;
        wi.mouseEnabled = false;
        this.weaponIconHolder.addChild(wi);
      }
    }
    // 弹匣视觉（2×2 点阵，165 上限，超出画 +）
    this.weaponIconAmmo.removeAll();
    const loaded = b.ammoStateOf ? b.ammoStateOf(cur) : null;
    let amt = 0, cap = 0, reserve = 0;
    if (loaded) { amt = loaded.loaded; cap = loaded.capacity; reserve = loaded.reserve; }
    const cat = b.weaponCategory ? b.weaponCategory(cur) : -1;
    const dotsN = Math.min(Math.max(amt, 0), 165);
    if ((cat === 2 || cat === 3 || cat === 4) && amt > 0) {
      const g = new Graphics();
      g.beginFill(0xc9bfff, 1);
      for (let i = 0; i < dotsN; i++) {
        const sx = 5 + (i % 15) * 4;
        const sy = 5 + Math.floor(i / 15) * 4;
        g.drawRect(sx, sy, 2, 2);
      }
      if (dotsN < amt) {
        g.drawRect(5, 57, 10, 2);
        g.drawRect(9, 53, 2, 10);
      }
      const s = new Sprite(); s.graphics = g; s.mouseEnabled = false;
      this.weaponIconAmmo.addChild(s);
    }
    // 弹种/模式/装填
    const ammoName = loaded && loaded.ammoName ? loaded.ammoName : "";
    this.loadedName.text = ammoName.toUpperCase() || this.b.text(193); // 原版：弹匣空 → "n/a"
    this.ammoSymbol.visible = amt > 0; // 原版 hasLoadedAmmo 才显示弹药图标
    this.loadedCount.setValue(amt);
    // 与攻击逻辑共用当前槽位/模式，切枪、换人或切回普通模式时立即清除旧标记。
    const mode = b.modeOf(cur);
    this.weaponIconAimedShot.visible = !!mode.aimed;
    this.weaponIconHeadShot.visible = !!mode.headShot;
    this.weaponIconParallelShots.visible = (mode.parallelShots ?? 0) > 1;
    this.weaponIconBurstSymbol.visible = (mode.burst ?? 0) > 1;
    this.weaponIconBurstText.visible = this.weaponIconBurstSymbol.visible;
    this.weaponIconBurstText.text = this.weaponIconBurstText.visible ? String(mode.burst) : "";
    const modeT = mode.name ? this.b.text(mode.name) : "";
    this.modeName.text = modeT.toUpperCase() + " (" + b.modeAPOf(cur, mode) + " " + this.b.text(1095).toUpperCase() + ")";
    const selName = loaded && loaded.selectedName ? loaded.selectedName : "";
    this.reloadAmmoName.text = selName.toUpperCase() || this.b.text(193);
    this.reloadAmmoCount.setValue(reserve);
    // Use the same selected items as the actions (not the first row / row count).
    const kit = b.firstAidKitOf(cur);
    const kitDef = kit && this.ds.items.Items[kit.type];
    const kitName = kitDef && this.ds.items.Goods[kitDef.subCategory]?.name;
    this.firstAidName.text = kitName ? b.text(kitName).toUpperCase() : b.text(193);
    this.firstAidText.text = kit ? b.text(211).toUpperCase() : b.text(193);
    this.firstAidCount.setValue(kit?.amount ?? 0);
    const pickup = b.selectedPickUpOf(cur);
    const pickupName = pickup && this.ds.weapons.Weapons[pickup.sub]?.name;
    this.pickUpItem.text = pickupName ? b.text(pickupName).toUpperCase() : b.text(193);
    this.pickUpText.text = pickup ? b.text(196).toUpperCase() : b.text(193);
    const reloadAp = b.canReload(cur) ? b.reloadAPOf(cur) : 0;
    this.reloadText.text = reloadAp > 0 ? b.text(195).toUpperCase() : b.text(193);
    this.miniDirty = true;
    this.syncMiniMap();
    this.updateTooltip();
  }

  syncMiniMap() {
    if (!this.miniDirty) return;
    this.miniDirty = false;
    // mapWrap 常驻：不要 removeAll miniMap（会把 mapWrap 摘掉，onload 里 if(!this.mapWrap) 不再重挂 → 位图从此消失）
    
    const field = this.b.fieldSize;
    const n = field + 2;
    const cv = document.createElement("canvas");
    cv.width = n; cv.height = n;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, n, n);
    // 原版 miniMapObstaclesColor 0xff888888。
    for (const o of this.b.obstacles) {
      if (!blocksMovement(this.ds.obstacles?.obstacles?.[o.type - 1])) continue;
      for (const [cx, cy] of o.cells) { ctx.fillStyle = "#888888"; ctx.fillRect(cx + 1, cy + 1, 1, 1); }
    }
    for (const u of this.b.units) {
      if (u.isTransport) {
        const { width, height } = u.transportFootprint ?? { width: 1, height: 1 };
        ctx.fillStyle = "#888888";
        ctx.fillRect(u.squareX - width + 2, u.squareY - height + 2, width, height);
        continue;
      }
      if (u.dead) continue;
      let c = "#4c9cd9"; // yourGroup（0xff4c9cd9）
      if (u.side === 0 && this.b.groupOf(u) !== 0) c = "#f0e43a";
      if (u.side === 2) c = "#d4d480";
      if (u.side === 1) c = "#ff0000"; // enemies（0xffff0000）
      ctx.fillStyle = c;
      ctx.fillRect(u.squareX + 1, u.squareY + 1, 1, 1);
    }
    // 边框（原版 miniMapBorderColor 0x88888888 半透明灰环）
    ctx.strokeStyle = "rgba(136,136,136,0.55)";
    ctx.strokeRect(0.5, 0.5, n - 1, n - 1);
    const bo = new BitmapObject(cv as any); // synchronous canvas avoids stale async Image.onload overwrites
    const S = 150 / (n * Math.SQRT2);
    bo.rotation = 45; bo.scaleX = bo.scaleY = S; bo.mouseEnabled = false;
    if (!this.mapWrap) { this.mapWrap = new Sprite(); this.mapWrap.scaleY = 0.574; this.miniMap.addChild(this.mapWrap); }
    this.mapWrap.removeAll(); this.mapWrap.addChild(bo); this.miniMapImg = bo;
    this.syncMiniFrame();
  }

  worldToMini(wx: number, wy: number) {
    const S = 150 / ((this.b.fieldSize + 2) * Math.SQRT2);
    const i = wx / 32 + 1, j = wy / 32 + 1;
    return { x: this.miniMap.x + S * (i - j) / Math.SQRT2, y: this.miniMap.y + S * (i + j) / Math.SQRT2 * 0.574 };
  }

  miniToWorld(x: number, y: number) {
    const S = 150 / ((this.b.fieldSize + 2) * Math.SQRT2);
    const lx = x - this.miniMap.x, ly = (y - this.miniMap.y) / 0.574;
    return { x: ((lx + ly) / (S * Math.SQRT2) - 1) * 32, y: ((ly - lx) / (S * Math.SQRT2) - 1) * 32 };
  }

  syncMiniFrame() {
    this.miniMapFrame.removeAll();
    this.miniMapFrame.x = this.miniMap.x; this.miniMapFrame.y = this.miniMap.y;
    // Project the REAL screen corners, not a made-up diamond around the camera.
    const points = [[0, 0], [640, 0], [640, 445], [0, 445]].map(([x, y]) => {
      const w = screenToWorld(x, y, this.b.camX, this.b.camY);
      const p = this.worldToMini(w.x, w.y);
      return { x: p.x - this.miniMapFrame.x, y: p.y - this.miniMapFrame.y };
    });
    const g = new Graphics(); g.lineStyle(1, 16777215, 0.5);
    points.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
    g.lineTo(points[0].x, points[0].y);
    const frame = new Sprite(); frame.graphics = g; frame.mouseEnabled = false;
    this.miniMapFrame.addChild(frame);
  }

  syncInputState() {
    const enabled = this.b.hudAvailable();
    this.disabled.visible = !enabled;
    if (!enabled) {
      this.tooltipBG.visible = this.tooltipText.visible = false;
      if (this.draggingMinimap) { Input.drag = null; this.draggingMinimap = false; }
    }
  }

  updateTooltip() {
    if (!this.b.hudAvailable()) { this.tooltipBG.visible = this.tooltipText.visible = false; return; }
    // 简化版悬停信息：HP/士气/AP/状态/操作成本
    const mx = Input.mouseX, my = Input.mouseY;
    if (mx < 0 || my < 0) { this.tooltipBG.visible = false; this.tooltipText.visible = false; return; }
    const cur = this.b.order[this.b.turnIdx];
    if (!cur) { this.tooltipBG.visible = false; this.tooltipText.visible = false; return; }
    let info = "";
    const inRect = (x: number, y: number, w: number, h: number) => mx >= x && mx <= x + w && my >= y && my <= y + h;
    const targetInfo = this.b.hoverTargetInfo?.(mx, my);
    if (targetInfo) info = targetInfo;
    // 战斗操作按钮：与原版 BattleInterface 的按钮区域一致，所有按钮都提供悬停说明。
    if (targetInfo) { /* target info already populated */ }
    else if (inRect(730, 210, 40, 15)) info = this.b.text(207);
    else if (inRect(780, 210, 40, 15)) info = this.b.text(208);
    else if (inRect(830, 210, 40, 15)) info = this.b.text(209);
    else if (inRect(810, 290, 60, 15)) {
      const ap = this.b.canReload?.(cur) && this.b.reloadAPOf ? this.b.reloadAPOf(cur) : 0;
      info = ap > 0 ? ap + " " + this.b.text(1095) : this.b.text(193);
    }
    else if (inRect(235, 470, 60, 15)) {
      const ap = this.b.firstAidKitOf?.(cur) && this.b.healAPOf ? this.b.healAPOf(cur) : 0;
      info = ap > 0 ? ap + " " + this.b.text(1095) : this.b.text(193);
    }
    else if (inRect(510, 470, 60, 15)) {
      const slot = cur.weaponSlot ?? 0;
      const canPickUp = !!this.b.canPickUpAt?.(cur.squareX, cur.squareY) && !(cur.weaponItems?.[slot] ?? 0);
      const ap = canPickUp && this.b.pickUpAPOf ? this.b.pickUpAPOf(cur) : 0;
      info = ap > 0 ? ap + " " + this.b.text(1095) : this.b.text(193);
    }
    else if (inRect(595, 455, 30, 30)) info = this.b.text(210);
    else if (inRect(850, 470, 15, 10)) info = this.b.text(28);
    else if (mx >= 725 && mx <= 870 && my >= 35 && my <= 45) info = this.b.text(1096) + ": " + Math.round(cur._HP);
    else if (mx >= 725 && mx <= 870 && my >= 55 && my <= 65) info = this.b.text(200) + ": " + Math.round(cur.battleMorale);
    else if (mx >= 725 && mx <= 870 && my >= 95 && my <= 105) info = this.b.text(1095) + ": " + Math.round(cur.AP);
    else if (mx >= 730 && mx <= 745 && my >= 72.5 && my <= 87.5) info = this.b.text(201); // 正在流血
    else if (mx >= 750 && mx <= 765 && my >= 72.5 && my <= 87.5) info = this.b.text(202); // 在被烧
    else if (mx >= 770 && mx <= 785 && my >= 72.5 && my <= 87.5) info = this.b.text(27);  // 超重
    else if (mx >= 790 && mx <= 805 && my >= 72.5 && my <= 87.5) info = this.b.text(203); // 眼伤
    else if (mx >= 810 && mx <= 825 && my >= 72.5 && my <= 87.5) info = this.b.text(204); // 胳膊伤
    else if (mx >= 830 && mx <= 845 && my >= 72.5 && my <= 87.5) info = this.b.text(205); // 腿伤
    else if (mx >= 850 && mx <= 865 && my >= 72.5 && my <= 87.5) info = this.b.text(206); // 生命危险
    this.tooltipOn = info.length > 0;
    this.tooltipBG.visible = info.length > 0;
    this.tooltipText.visible = info.length > 0;
    if (!info.length) return;
    this.tooltipText.text = info;
    // BattleInterface.as:936-961: olive tooltip, textWidth/Height + 14.
    this.tooltipText.width = this.tooltipText.textWidth;
    this.tooltipText.verticalAlign = "middle";
    const w = this.tooltipText.textWidth + 14;
    const h = this.tooltipText.textHeight + 14;
    const tbg = new Graphics();
    tbg.beginFill(12104352, 1);
    tbg.lineStyle(1, 4339211);
    tbg.drawRect(0, 0, w, h);
    this.tooltipBG.graphics = tbg;
    const tx = mx + w + 15 < 880 ? mx + 15 : mx - 15 - w;
    const ty = my + h + 20 < 495 ? my + 15 : 495 - h - 5;
    this.tooltipBG.x = tx; this.tooltipBG.y = ty;
    this.tooltipText.x = tx + 7; this.tooltipText.y = ty + 7;
  }
}
