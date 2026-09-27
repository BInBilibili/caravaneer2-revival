import { steerWorldNpcs, resolveWorldNpcContacts, checkWorldBehavior } from "./NpcWorldAI";
﻿import { discoverVisibleTowns } from "./TownVisibility";
// MapMode：大地图（对应 AS3 IsoEngine.MapMode）
// 世界坐标=像素；相机：屏幕(325,248) 锚定车队；背景 MapBG 1402x1108 瓦片循环
import { Sprite, Graphics, BitmapObject, type DisplayObject } from "../core/Display";
import { EngineText } from "../core/EngineText";
import type { AssetStore } from "../core/Assets";
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import { GameData } from "./World";
import { sfxClick, sfxTapeButton, sfxSlideButton } from "../core/Sound";
import { Economy } from "./Economy";
import { ClipSprite } from "../core/Display";
import { LcdCounter } from "../core/LcdCounter";
import { SevenSegmentIndicator } from "../core/SevenSegmentIndicator";
import { YesNoDialogue } from "./YesNoDialogue";
import { Input } from "../core/Input";

const CAM_X = 325, CAM_Y = 248;
const TILE_W = 1402, TILE_H = 1108;
const SQUARE = 500;

// 原版 MathFunctions.ProbabilityRandom：返回期望为 param1 的非负整数（泊松式逐次判定）
function probabilityRandom(p: number): number {
  let count = 0;
  let rest = p;
  while (rest > 0) {
    const r = Math.random();
    if (r > rest) return count;
    count++;
    rest -= r;
  }
  return count;
}

/** 圆角矩形路径（Graphics 无 drawRoundRect：moveTo/lineTo/curveTo 手绘） */
function roundedRectPath(g: Graphics, x: number, y: number, w: number, h: number, r: number): void {
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.curveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.curveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.curveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.curveTo(x, y, x + r, y);
}

export interface MapModeHooks {
  isInputBlocked?: () => boolean;
  onEnterTown: (id: number) => void;
  onOpenMenu: (which: "caravan" | "options" | "save" | "map" | "settings") => void;
  onEncounter: (type: number) => void;
  /** 第二参数对应原版 openDialogue(2=敌袭 / 3=友好相遇) 的判定结果。 */
  onNpcCaravan: (id: number, hostile?: boolean) => void;
  onNotify: (msg: string) => void;
  onAutoSave: () => void;
  /** t64 ①：通用事件对话入口（原版 MapMode.openDialogue(case)）；case 8 = 碉堡开场 → 主席布拉斯对话 */
  onOpenDialogue?: (caseNo: number) => void;
}

export class MapMode {
  readonly screen = new Sprite();
  active = true;
  battleInProgress = false;
  /** t64 ①：碉堡开场值星官确认框（首次靠近镇15 <500px 弹出；批准后进镇 + 布拉斯对话） */
  bunkerPrompt: YesNoDialogue | null = null;
  private moving!: ClipSprite;
  private ground = new Sprite();
  private townSymbols: Array<{ disp: Sprite; name: EngineText }> = [];
  private caravanSym!: Sprite;
  private caravanArrow!: Sprite;
  private lookArrow!: Sprite;          // 原版 radarSymbols[2]：鼠标方向的小三角（绕盘心旋转）
  private lookArrowSolid!: Sprite;    // 原版 radarSymbols[3]：按下鼠标时的实心三角（fill α0.9）
  private mouseLookDir = 0;            // 0=北、顺时针（同原版 CalcRevYAngle 语义）
  private mousePressed = false;           // 原版 MapMode.as L69：鼠标按下状态（实心小三角用）
  private counters: LcdCounter[] = [];
  private warningBulbs: DisplayObject[] = [];
  private indicatorBulbs: DisplayObject[] = [];
  private overloadBulb: DisplayObject | null = null;
  private cargoCurr!: SevenSegmentIndicator;
  private cargoMax!: SevenSegmentIndicator;
  private flippers: EngineText[] = [];
  private clockMin!: Sprite;
  private clockHour!: Sprite;

  private hoverTip = "";
  private levers: Array<{disp:Sprite;frame:number;pressed:boolean;images:Sprite[]}> = [];
  private leverFrameAcc = 0;
  private prevSpeed = 1;
  private mouseOverMap = false;
  private infoText!: EngineText;
  private infoTextOpacity = 0;
  private pausedText!: EngineText;
  private speedTabs: Array<{ disp: Sprite; speed: number; pressed: Sprite }> = [];
  private timeAcc = 0;
  private lastDay = -1;
  private npcSprites: Array<{ sp: Sprite; id: number; rotPart?: Sprite; nameText?: EngineText; countText?: EngineText }> = [];
  // Independent, deduplicated status: never replace hover/warning text.
  private statusText = new EngineText("", 3420257, 12, "left", 15, 15);
  private statusRemaining = 0;
  appendMessage(message: string) {
    this.statusText.text = message;
    this.statusRemaining = 2.5;
    this.statusText.alpha = 1;
    this.statusText.mouseEnabled = false;
    if (this.statusText.parent !== this.screen) this.screen.addChild(this.statusText);
  }
  private toastText = "";
  private toastTime = 0;
  private windSymbol!: Sprite;
  private windArrow!: Sprite;
  private windSpeedText!: EngineText;
  private tutorialShown = false;
  private keydown: (e: KeyboardEvent) => void;

  constructor(
    private gd: GameData, private ds: DataStore, private assets: AssetStore, private hooks: MapModeHooks,
  ) {
    this.lastDay=gd.day;
    this.protectDepartureFromOverlappingTowns();
    this.build();
    this.keydown = (e) => this.onKey(e);
    window.addEventListener("keydown", this.keydown);
  }

  destroy() { window.removeEventListener("keydown", this.keydown); Input.cursorOverride = null; Input.syncCursor(); }

  private text(id: number) { return getText(this.ds, id, this.ds.language); }

  /**
   * 方案② 识别迷雾（对齐原版 MapMode.as L2743-2790）：名字/人数按距离分级，
   * 距离越近信息越精确；已获得的信息不回落（原版仅 >400px 回收时重置 identified/menCountPhase）。
   * web texts.json 缺 771/772-777 条目，以下用字面量并注释原文本 id。
   */
  private updateNpcLabel(npc: any, ns: { nameText?: EngineText; countText?: EngineText }, dist: number, playerSight: number) {
    if (!ns.nameText || !ns.countText) return;
    // 名字：difficulty==1 全知；已识别永久真名；否则 dist<=sight×140 识别（原版 Texts 771 = "不知明群体"）
    const known = this.gd.difficulty === 1 || npc.identified || dist <= playerSight * 140;
    if (known) { npc.identified = true; ns.nameText.text = npc.name; }
    else ns.nameText.text = this.text(771);
    const n = (npc.people && npc.people.length) || npc.defenders || 0;
    // 人数分级（原版 MapMode.as L2763-2795 原样格式："(" + manOrMen + ")"；web texts.json 有全语言列）
    // manOrMen（原版 L7988-7999）：1 → Texts 772；否则 Texts 773.replace("@number@", n)
    const manOrMen = (k: number) => k === 1 ? this.text(772) : this.text(773).replace("@number@", String(k));
    if (this.gd.difficulty === 1 || npc.menCountPhase === 3 || dist <= playerSight * 100) {
      npc.menCountPhase = 3;
      ns.countText.text = "(" + manOrMen(n) + ")";
    } else if (npc.menCountPhase === 2 || dist <= playerSight * 150) {
      npc.menCountPhase = 2;
      const mn = Math.max(Math.floor(n / 3) * 3, 1); // 原版 min=floor(n/3)*3, max=min+3, min 保底 1
      const mx = mn + 3;
      ns.countText.text = "(" + mn + "-" + manOrMen(mx) + ")";
    } else if (npc.menCountPhase === 1 || dist <= playerSight * 190) {
      npc.menCountPhase = 1;
      ns.countText.text = "(" + this.text(n > 12 ? 774 : n > 6 ? 775 : 776) + ")";
    } else {
      ns.countText.text = "(" + this.text(777) + ")";
    }
  }

  private bitmap(name: string): BitmapObject | null {
    const im = this.assets.getImage(name);
    return im ? new BitmapObject(im) : null;
  }

  private build() {
    const S = this.screen;
    // 地面（世界瓦片）
    this.moving = new ClipSprite(670, 495);
    S.addChild(this.moving);
    this.moving.addChild(this.ground);
    const m = this.assets.getImage("MapBG.png");
    if (m) {
      for (const [ox, oy] of [[0, 0], [TILE_W, 0], [0, TILE_H], [TILE_W, TILE_H]]) {
        const b = new BitmapObject(m);
        b.x = ox; b.y = oy;
        this.ground.addChild(b);
      }
    } else {
      void this.assets.ensure("MapBG.png").then((im) => {
        if (!im) return;
        for (const [ox, oy] of [[0, 0], [TILE_W, 0], [0, TILE_H], [TILE_W, TILE_H]]) {
          const b = new BitmapObject(im);
          b.x = ox; b.y = oy;
          this.ground.addChild(b);
        }
      });
    }
    // 城镇符号（圆 + 名字）
    const towns = this.gd.Towns;
    for (let i = 0; i < towns.length; i++) {
      const disp = new Sprite();
      const g = new Graphics();
      g.lineStyle(2, 0, 0.3);
      g.drawCircle(0, 0, 18);
      g.beginFill(0, 0.2);
      g.drawCircle(0, 0, 8);
      disp.graphics = g;
      const name = new EngineText(towns[i].name, 4735032, 12, "center", -100, 18, 200, 20);
      disp.addChild(name);
      disp.visible = false;
      this.moving.addChild(disp);
      this.townSymbols.push({ disp, name });
    }
    // 车队符号容器：仅承载方向针（原版无独立圆环；雷达盘+刻度由下方 radar 提供）
    this.caravanSym = new Sprite();
    this.caravanSym.graphics = new Graphics();
    // 原版 radarSymbols[1]（MapMode.as L6779-6784）：罗盘针【仅描边】折线，色 8222317、α0.9。
    // 无 fill（用户反馈 0.9 填充快成实心）；round lineJoin 让尖端圆角拼合、不裂双顶角
    this.caravanArrow = new Sprite();
    const ag = new Graphics();
    ag.lineStyle(2, 8222317, 0.9, true);
    ag.moveTo(0, -9);
    ag.lineTo(-5, 7);
    ag.lineTo(0, 2);
    ag.lineTo(5, 7);
    ag.lineTo(0, -9);
    this.caravanArrow.graphics = ag;
    this.caravanSym.addChild(this.caravanArrow);
    this.moving.addChild(this.caravanSym);
    // 雷达环（车队位置）
    const radar = new Sprite();
    const rg = new Graphics();
    // 原版 MapMode.as L6746-6748：lineStyle(2,α0.8) + fill α0.2（用户反馈 web 3px 太厚）
    rg.lineStyle(2, 8222317, 0.8);
    rg.beginFill(8222317, 0.2);
    rg.drawCircle(0, 0, 12);
    rg.endFill();                  // 关键：必须结束填充，否则刻度 moveTo/lineTo path 继承 fill 渲染成浅色细条
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      const len = k % 4 === 0 ? 7 : k % 2 === 0 ? 8 : 9;
      // 径向直线（原版 L6750-6772 刻度）：α 0.6/0.6/0.5（原版值）
      rg.lineStyle(k % 4 === 0 ? 2 : 1, 8222317, k % 4 === 0 ? 0.6 : k % 2 === 0 ? 0.6 : 0.5);
      // 原版雷达刻度（Caravan.as L343-355 同款：0=北，顺时针，y 向下）：(sin, -cos)
      rg.moveTo(Math.sin(a) * 12, -Math.cos(a) * 12);
      rg.lineTo(Math.sin(a) * len, -Math.cos(a) * len);
    }
    radar.graphics = rg;
    // 原版 radarSymbols[0] 是 28×28 位图、x/y=(311,234) 为【位图左上角】，盘心=311+14=325、234+14=248
    // = 玩家屏幕中心（radarSymbols[1] 针心 325,248）——盘与针必须同心！
    // web Graphics 以自身原点为圆心(drawCircle(0,0,12))，故 x/y 直接取 CAM（MapMode.as L6775-6794）
    radar.x = CAM_X; radar.y = CAM_Y;
    S.addChild(radar);
    // 原版 radarSymbols[2]（MapMode.as L6795-6812）：鼠标方向小三角 = lineStyle(2,α0.9) 描边 + fill α0.3（空心观感）；
    // 位图内 (6,2)(2,7)(10,7) + 偏移(-6,-23) → 局部 (0,-21)(-4,-16)(4,-16)，pivot=盘心(325,248) 绕心旋转
    // 原版 radarSymbols[3]（L6813-6829）：按下时实心版 = fill α0.9 无描边（L6503 visible 条件含 mousePressed）
    this.lookArrow = new Sprite();
    const lg = new Graphics();
    lg.lineStyle(2, 8222317, 0.9, true);
    lg.beginFill(8222317, 0.3);
    lg.moveTo(0, -21);
    lg.lineTo(-4, -16);
    lg.lineTo(4, -16);
    lg.lineTo(0, -21);
    lg.endFill();
    this.lookArrow.graphics = lg;
    this.lookArrow.x = CAM_X;
    this.lookArrow.y = CAM_Y;
    this.lookArrow.visible = false;
    S.addChild(this.lookArrow);
    this.lookArrowSolid = new Sprite();
    const lsg = new Graphics();
    lsg.beginFill(8222317, 0.9);
    lsg.moveTo(0, -21);
    lsg.lineTo(-4, -16);
    lsg.lineTo(4, -16);
    lsg.lineTo(0, -21);
    lsg.endFill();
    this.lookArrowSolid.graphics = lsg;
    this.lookArrowSolid.x = CAM_X;
    this.lookArrowSolid.y = CAM_Y;
    this.lookArrowSolid.visible = false;
    this.lookArrowSolid.rotation = this.lookArrow.rotation;
    S.addChild(this.lookArrowSolid);
    // 地图可点击层
    const clickLayer = new Sprite();
    const clg = new Graphics();
    clg.hitRect(0, 0, 670, 495);
    clickLayer.graphics = clg;
    clickLayer.addEventListener("click", (e: any) => this.onMapClick(e.x, e.y));
    clickLayer.addEventListener("pointerover", () => { this.mouseOverMap = true; this.hoverTip = ""; });
    const lookAway = () => { this.lookArrow.visible = false; this.lookArrowSolid.visible = false; };
    clickLayer.addEventListener("pointerout", () => { this.mouseOverMap = false; lookAway(); });
    // 原版 mouseLookDir（MapMode.as L6396-6399）：0=北、顺时针（y 反转）；鼠标悬停地图区即显示 Look 三角并实时指向鼠标
    // 原版 L6393-6395：距盘心 <=14px 时 mouseStatus=2（不显示小三角）；>14px 才 mouseStatus=1
    clickLayer.addEventListener("pointermove", (e: any) => {
      this.mouseLookDir = Math.atan2(e.x - CAM_X, -(e.y - CAM_Y));
      const dx = e.x - CAM_X, dy = e.y - CAM_Y;
      const far = Math.hypot(dx, dy) > 14;
      if (this.mouseOverMap && far) {
        const rot = (this.mouseLookDir * 180 / Math.PI) % 360;
        this.lookArrow.rotation = rot;
        this.lookArrowSolid.rotation = rot;
        this.lookArrow.visible = true;
        this.lookArrowSolid.visible = this.mousePressed;
      } else {
        lookAway();
      }
    });
    // 原版 mousePressed（MapMode.as L370 click 按下=true、L472 mUp 松开=false）：
    // radarSymbols[2]=空心(常态)、radarSymbols[3]=实心(mousePressed 时才显示)
    clickLayer.addEventListener("pointerdown", (e: any) => {
      const dx = e.x - CAM_X, dy = e.y - CAM_Y;
      if (this.mouseOverMap && Math.hypot(dx, dy) > 14) {
        this.mousePressed = true;
        this.lookArrow.visible = false;
        this.lookArrowSolid.rotation = this.lookArrow.rotation;
        this.lookArrowSolid.visible = true;
      }
    });
    clickLayer.addEventListener("pointerup", () => {
      this.mousePressed = false;
      if (this.lookArrow.visible) this.lookArrowSolid.visible = false;
      this.lookArrowSolid.visible = false;
    });
    S.addChild(clickLayer);
    // 界面层（原版顺序：OverBackground 在信息文本之下、Base 650、Glass 顶层；异步加载后须按预期 z 序插入，
    // 否则追加到最顶层会盖住左侧信息 UI——t34 F1 问题1）
    const addImg = (name: string, x: number, z: number) => {
      const mk = (im: HTMLImageElement) => {
        const b = new BitmapObject(im);
        b.x = x;
        b.mouseEnabled = false; // 装饰层不拦截点击
        S.addChildAt(b, Math.min(z, S.children.length));
      };
      const im = this.assets.getImage(name);
      if (im) { mk(im); return; }
      void this.assets.ensure(name).then((im2) => {
        if (!im2 || !this.active) return;
        mk(im2);
      });
    };
    addImg("MapModeOverBackground.png", 0, 3);
    addImg("MapModeBase.png", 650, 4);
    this.infoText = new EngineText("", 3420257, 12, "left", 15, 15);
    this.infoText.alpha=0;this.infoText.visible=false;
    S.addChild(this.infoText);
    this.pausedText = new EngineText("-= " + this.text(1423).toUpperCase() + " =-", 3420257, 16, "center", 15, 420, 625, 20);
    this.pausedText.visible = false;
    S.addChild(this.pausedText);
    addImg("MapModeGlass.png", 650, 9999); // 原版 Glass 最后添加（顶层反光，x=650 不影响左侧信息）
    // ---- 7 个 LCD 计数器（原版 Counter(12) at x=711，y=100..222）----
    // 标签/图标已烘在 MapModeBase 图内（原版如此，不另画文字标签）
    // 警示灯贴图（原版 BulbLightRedOn at (843, 95+i*20.5)）：bitmap() 在素材未预载时返回 null 会丢灯
    //（灯永远不亮）→ 先建 Sprite 占位入数组，素材异步到达后再贴图（与 addImg 同款兜底）
    const mkBulb = (x: number, y: number, arr: DisplayObject[]): Sprite => {
      const b = new Sprite();
      b.x = x; b.y = y; b.visible = false;b.mouseEnabled=b.mouseChildren=false;
      S.addChild(b);
      arr.push(b);
      const bi = this.assets.getImage("BulbLightRedOn.png");
      if (bi) b.addChild(new BitmapObject(bi));
      else {
        void this.assets.ensure("BulbLightRedOn.png").then((im2) => {
          if (!im2 || !this.active) return;
          b.addChild(new BitmapObject(im2));
        });
      }
      return b;
    };
    const cy = [100, 120, 140, 161, 181, 202, 222];
    for (let i = 0; i < 7; i++) {
      const cnt = new LcdCounter(12);
      cnt.x = 711; cnt.y = cy[i];
      cnt.mouseEnabled = false;
      S.addChild(cnt);
      this.counters.push(cnt);
      mkBulb(842, 96 + i * 20.5, this.warningBulbs); // 左下移 1px（用户反馈：爆红灯偏右上）
    }
    const hoverRegion=(x:number,y:number,w:number,h:number,tip:()=>string)=>{const sp=new Sprite();sp.x=x;sp.y=y;sp.graphics=new Graphics();sp.graphics.hitRect(0,0,w,h);sp.addEventListener("pointerover",()=>this.setHoverTip(tip()));sp.addEventListener("pointermove",()=>this.setHoverTip(tip()));sp.addEventListener("pointerout",()=>this.setHoverTip(""));S.addChild(sp);};
    for(let i=0;i<7;i++)hoverRegion(690,95+i*20,170,20,()=>{const c=this.gd.Caravans[0],cp=c.getConsumptionProduction();const values=[c.water,c.foodKcal(),c.meds,c.forage,c.fuel,Math.max(0,cp.electricityProduction-cp.electricityConsumption),c.money];const units=[this.text(11),this.text(939),this.text(13),this.text(12),this.text(11),this.text(940),"€"];const decimals=[1,0,1,1,1,0,2];return this.text(14+i)+": "+values[i].toFixed(decimals[i])+" "+units[i];});
    // ---- 顶部 3 个开关（原版 MapModeSwitch at y=46：x=686/714/742；CARAVAN MENU/MAP/SETTINGS）----
    const switchDefs: Array<{ x: number; act: string; tip: string }> = [
      { x: 686, act: "caravan", tip: this.text(34).toUpperCase() },
      { x: 714, act: "map", tip: this.text(1265).toUpperCase() },
      { x: 742, act: "settings", tip: this.text(36).toUpperCase() },
    ];
    for (const sd of switchDefs) {
      const hit = new Sprite();
      const hg = new Graphics();
      hg.hitRect(0, 0, 15, 35);
      hit.graphics = hg;
      hit.x = sd.x; hit.y = 46;
      hit.buttonMode = true; hit.mouseChildren = false;
      const lever = {disp:hit,frame:1,pressed:false,images:[] as Sprite[]};
      this.levers.push(lever);
      for(let frame=1;frame<=5;frame++){
        const layer=new Sprite();layer.mouseEnabled=layer.mouseChildren=false;layer.visible=frame===1;hit.addChild(layer);lever.images.push(layer);
        const put=(im:HTMLImageElement|null)=>{if(im){const b=new BitmapObject(im);b.x=-4;b.y=-4;layer.addChild(b);}};
        const name="MapModeSwitch"+frame+".png",im=this.assets.getImage(name);if(im)put(im);else void this.assets.ensure(name).then(put);
      }
      hit.addEventListener("pointerdown",()=>{lever.pressed=true;});
      for(const ev of ["pointerup","pointerout"])hit.addEventListener(ev,()=>{lever.pressed=false;});
      const act = sd.act;
      hit.addEventListener("click", () => { sfxSlideButton(); this.hooks.onOpenMenu(act as any); }); // 原版 mouseStatus 30-32 → SFXSlideButton
      // Original five-frame MapModeSwitch; release animates back to frame 1.
      hit.addEventListener("pointerover", () => { this.setHoverTip(sd.tip); });
      hit.addEventListener("pointerout",()=>this.setHoverTip(""));
      S.addChild(hit);
    }
    // ---- 4 个指示灯按钮（y=245-265）＋ 警示灯 8-11（BulbLightRedOn at y=244）----
    const indDefs: Array<{ x1: number; x2: number; bx: number; tip: string }> = [
      { x1: 675, x2: 715, bx: 674, tip: this.text(1255) },      // 重伤人员
      { x1: 730, x2: 770, bx: 730.5, tip: this.text(22) },      // 状况差的牲口
      { x1: 785, x2: 820, bx: 787, tip: this.text(23) },        // 机械问题
      { x1: 840, x2: 870, bx: 843.5, tip: this.text(24) },      // 其他问题/通知
    ];
    for (const idf of indDefs) {
      const b = new Sprite();
      const g = new Graphics();
      g.hitRect(0, 0, idf.x2 - idf.x1, 20);
      b.graphics = g;
      b.x = idf.x1; b.y = 245;
      const tip = idf.tip;
      b.addEventListener("click", () => { this.setHoverTip(tip); }); // 原版指示区 hover-only，点击无声
      b.addEventListener("pointerover", () => this.setHoverTip(tip));
      b.addEventListener("pointerout",()=>this.setHoverTip(""));
      S.addChild(b);
      mkBulb(idf.bx - 1, 245, this.indicatorBulbs); // 左下移 1px
    }
    // ---- 超载按钮（x=680-740, y=270-290）＋ 灯 12 ----
    const ov = new Sprite();
    const og = new Graphics();
    og.hitRect(0, 0, 60, 20);
    ov.graphics = og;
    ov.x = 680; ov.y = 270;
    ov.addEventListener("click", () => { this.setHoverTip(this.text(27)); }); // 原版超载区 hover-only，点击无声
    ov.addEventListener("pointerover", () => this.setHoverTip(this.text(27)));
    ov.addEventListener("pointerout",()=>this.setHoverTip(""));
    S.addChild(ov);
    this.overloadBulb = mkBulb(679, 271, [] as Sprite[]); // 左下移 1px
    // ---- 载重指示（原版 Indicator(9) at (711,298)/(711,328)：curr/max，单位 t，3 位小数，七段数码）----
    this.cargoCurr = new SevenSegmentIndicator(9);
    this.cargoCurr.x = 711;
    this.cargoCurr.y = 298;
    S.addChild(this.cargoCurr);
    this.cargoMax = new SevenSegmentIndicator(9);
    this.cargoMax.x = 711;
    this.cargoMax.y = 328;
    S.addChild(this.cargoMax);
    this.cargoCurr.mouseEnabled=this.cargoCurr.mouseChildren=false;this.cargoMax.mouseEnabled=this.cargoMax.mouseChildren=false;
    hoverRegion(685,295,185,25,()=>this.text(25)+": "+this.gd.Caravans[0].totalCargo.toFixed(1)+" "+this.text(12));
    hoverRegion(685,320,185,30,()=>this.text(26)+": "+this.gd.Caravans[0].maxCargo.toFixed(1)+" "+this.text(12));
    hoverRegion(680,380,160,40,()=>{const d=this.gd.makeDate();return d.Day2d+"-"+d.ShortMonthName+"-"+d.Year2d+"  "+d.Hour2d+":"+d.Minute2d;});
    // ---- 日期 flippers（原版 Flipper*signs 无自绘框；MC 注册点 x=680/713/745/809, y=386）----
    // 底图 798_MapModeBase.png 已烘好 5 个凹陷窗：中心 canvas x≈694.4/727.5/761.1/793/826，
    // y 386..414（中心 400），宽≈21/35/22/30/22 → 文字直接叠在烘好的窗上，不再画圆角槽框
    //（反馈：web 自绘框多余且整体左移 14-17px 错位）。字体沿原版 FlipperText：DroidSansMono 15 #7C735B，居中。
    const flipperDefs = [
      { cx: 694.4, w: 21, y: 391 }, // DAY（2 位数字）
      { cx: 727.5, w: 35, y: 391 }, // MONTH（3 字母/中文月份）
      { cx: 761.1, w: 22, y: 391 }, // YEAR（2 位）
      { cx: 826, w: 22, size: 12, y: 393 }, // AMPM（用户反馈 15px 超框 → 12px）
    ];
    for (const fd of flipperDefs) {
      // 393 时文字中心≈401 ≈ 原版实测 400.4（DAY 399.5/MONTH 401.4）。
      // 但 EngineText 的 GLOBAL_TEXT_Y_OFFSET=2 会把这四条再压低 2px（中心→≈403，比原版低 2.6px），
      // 故已按实测校准过的 DAY/MONTH/YEAR 单条上移 2px 回到 391；AMPM（12px，原版 TLF 15px 缩过）保持 393。
      const t = new EngineText("", 0x7c735b, fd.size ?? 15, "center", fd.cx - fd.w / 2, fd.y, fd.w, 19);
      t.mouseEnabled = false;
      S.addChild(t);
      this.flippers.push(t);
    }
    // ---- 模拟时钟（原版 MapMode.as clockParts 0-5）----
    // 原版几何：clockParts[0/1]=黑描影 #030302 分/时针于 (794,401)；clockParts[3/4]=土黄 0x817F61(8486753)
    // 分/时针于 (793,400)（高 12/9px 小三角，尖 -0.5,-12/-9，底 -1..1,0）；clockParts[2]=黑 r2 圆于 (791,398)；
    // clockParts[5]=土黄 r2 圆：位图 at (790,397)、圆画在其 (3,3) r2 → 圆心恰 = (793,400) = 指针轴心（黑圆圆心 +1,+1 作右下投影）。
    // ☆web 版取舍：按用户反馈只保留单层土黄（不画黑描影/黑圆），圆点圆心必须与指针轴心重合（不能落在 (790,397) 点坐标本身，
    // 否则截图里变悬浮点——此前 -3,-3 即此错误：drawCircle(0,0) 在 (-3,-3) 把圆心放在了轴心左上方 3px）。
    const clock = new Sprite();
    clock.x = 793; clock.y = 400;clock.mouseEnabled=clock.mouseChildren=false;
    const mkHand = (tipY: number, col: number): Sprite => {
      const s = new Sprite();
      const g = new Graphics();
      g.beginFill(col);
      g.moveTo(-0.5, tipY); g.lineTo(-1, 0); g.lineTo(1, 0); g.lineTo(-0.5, tipY);
      g.endFill();
      s.graphics = g;
      return s;
    };
    this.clockMin = new Sprite();
    this.clockMin.addChild(mkHand(-12, 8486753));
    this.clockHour = new Sprite();
    this.clockHour.addChild(mkHand(-9, 8486753));
    clock.addChild(this.clockMin);
    clock.addChild(this.clockHour);
    const dotG = new Graphics();
    dotG.beginFill(8486753);
    dotG.drawCircle(0, 0, 2);
    dotG.endFill();
    const dotSp = new Sprite();
    dotSp.graphics = dotG;
    dotSp.x = 0; dotSp.y = 0; // 原版圆位图 at (790,397) 但圆画在 (3,3) → 圆心=轴心 (793,400)；web drawCircle 以圆心为基准故放 (0,0)
    clock.addChild(dotSp);
    S.addChild(clock);
    // ---- 底部一行（原版 y=445：OPTIONS / 1 / 2 / 3 / PAUSE；命中区 x=675/710/741/771/800）----
    const botDefs: Array<{ x1: number; x2: number; speed: number | null; tip: string; pressed: string | null }> = [
      { x1: 675, x2: 710, speed: null, tip: this.text(28).toUpperCase(), pressed: null },
      { x1: 710, x2: 741, speed: 1, tip: this.text(29) + ": " + this.text(30), pressed: "MapModeButt2Pressed.png" },
      { x1: 741, x2: 771, speed: 2, tip: this.text(29) + ": " + this.text(31), pressed: "MapModeButt2Pressed.png" },
      { x1: 771, x2: 800, speed: 4, tip: this.text(29) + ": " + this.text(32), pressed: "MapModeButt2Pressed.png" },
      { x1: 800, x2: 830, speed: 0, tip: this.text(33), pressed: "MapModeButt5Pressed.png" },
    ];
    for (const bd of botDefs) {
      const b = new Sprite();
      const g = new Graphics();
      g.hitRect(0, 0, bd.x2 - bd.x1, 50);
      b.graphics = g;
      b.x = bd.x1; b.y = 445;
      b.buttonMode = true;
      const tip = bd.tip;
      if (bd.speed === null) {
        b.addEventListener("click", () => { sfxTapeButton(); this.hooks.onOpenMenu("options"); }); // 原版 mouseStatus 25 → SFXTapeButton
      } else {
        const sp = bd.speed;
        b.addEventListener("click", () => this.setSpeed(sp));
      }
      b.addEventListener("pointerover", () => this.setHoverTip(tip));
      // 按下态覆盖图（原版 buttons[]：MapModeButt1Pressed@675=OPTIONS、MapModeButt2Pressed@710/741/771=1/2/3 速、
      // MapModeButt5Pressed@800=暂停；原版只显示当前档位的按下图，不画任何矩形框）
      const pressed = new Sprite();
      pressed.visible = false;
      b.addChild(pressed);
      if (bd.pressed) {
        const key = bd.pressed;
        const pim = this.assets.getImage(key);
        if (pim) pressed.addChild(new BitmapObject(pim));
        else void this.assets.ensure(key).then((im2) => {
          if (im2 && this.active) pressed.addChild(new BitmapObject(im2));
        });
      }
      S.addChild(b);
      if (bd.speed !== null) this.speedTabs.push({ disp: b, speed: bd.speed, pressed });
    }
    // 风向标（原版 windSymbol at 590,430）
    this.windSymbol = new Sprite();
    this.windSymbol.x = 590; this.windSymbol.y = 430;
    const wg2 = new Graphics();
    wg2.lineStyle(2, 8222317);
    wg2.drawCircle(0, 0, 25);
    this.windSymbol.graphics = wg2;
    this.windArrow = new Sprite();
    const wga = new Graphics();
    wga.lineStyle(2, 8222317);
    wga.moveTo(0, -15);
    wga.lineTo(10, -5);
    wga.lineTo(5, -5);
    wga.lineTo(5, 15);
    wga.lineTo(-5, 15);
    wga.lineTo(-5, -5);
    wga.lineTo(-10, -5);
    wga.lineTo(0, -15);
    this.windArrow.graphics = wga;
    this.windSymbol.addChild(this.windArrow);
    this.windSpeedText = new EngineText("", 8222317, 9, "center", -50, 30, 100, 15);
    this.windSymbol.addChild(this.windSpeedText);
    const windLabel = new EngineText(this.text(6378).toUpperCase(), 8222317, 9, "center", -50, -45, 100, 15);
    windLabel.mouseEnabled = false;
    this.windSymbol.addChild(windLabel);
    S.addChild(this.windSymbol);
    // 新手教程提示（一次性）
    this.tutorialShown = true;
    if (this.gd.showTutorial && !this.gd.displayedTutorials.includes(0)) {
      this.toastText = this.text(8) + " / " + this.text(9);
      this.toastTime = 5;
      this.gd.displayedTutorials.push(0);
    }
    this.updateSpeedTabs();
    this.gd.spawnNpcCaravans(this.ds);
    // 把路线点数据挂到 NPC（城镇贸易用）
    const routes: any[] = this.ds.presets?.caravan_routes?.[0] ?? [];
    this.gd.npcCaravans.forEach((npc) => {
      const r = routes[npc.id];
      if (r) {
        npc.points = (r.points ?? []).map((p: any) => ({ town: p.town, buy: p.buy ?? [], sell: p.sell ?? [] }));
        npc.route = npc.id;
      }
    });
    // （t84）删除 build() 期旧式 NPC 精灵（橙色圆点 0xe8a020 + 浅灰名 0xC8C8C8）：
    // 该循环在读档后 npcCaravans 非空时无条件执行，覆盖 update() L868 惰性补建的正确线框图标。
    // 所有 NPC 精灵统一由 update() 惰性补建（rotPart 线框 + nameText/countText 0x444444）。
  }

  private setSpeed(s: number) {
    if(this.gd.gameSpeed===s)return;
    if(this.gd.gameSpeed>0)this.prevSpeed=this.gd.gameSpeed;
    sfxTapeButton(); // One tape click only when changing speed.
    this.gd.gameSpeed = s;
    this.updateSpeedTabs();
  }

  pauseForTownExit() {
    if (this.gd.gameSpeed > 0) this.prevSpeed = this.gd.gameSpeed;
    this.gd.gameSpeed = 0;
    this.updateSpeedTabs();
  }

  private setHoverTip(tip: string) { this.hoverTip = tip; }

  private updateSpeedTabs() {
    // 底部速度行：当前速度按钮显示按下覆盖图（原版 setSpeedButtons：speed==1→@710，2→@741，3/4→@771，pause→@800）
    for (const t of this.speedTabs) t.pressed.visible = t.speed === this.gd.gameSpeed;
    this.pausedText.visible = this.gd.gameSpeed === 0;
  }

  // A resumed game already inside a town radius has not newly arrived there.
  // Existing radius-exit cleanup removes this protection once the caravan leaves.
  private protectDepartureFromOverlappingTowns() {
    const c = this.gd.Caravans[0];
    if (!c) return;
    c.recentlyInteractedTowns ??= [];
    for (const town of this.gd.Towns) {
      if (town?.active && Math.hypot(town.x - c.x, town.y - c.y) < 25 && !c.recentlyInteractedTowns.includes(town.id)) {
        c.recentlyInteractedTowns.push(town.id);
      }
    }
  }

  private onMapClick(x: number, y: number) {
    const c = this.gd.Caravans[0];
    if (x > 670 || !this.active || this.hooks.isInputBlocked?.() || this.battleInProgress) return;
    // 反馈6（原版 MapMode click L364-397 mouseStatus==2）：点自身符号（屏幕 14px 内）→
    // 在镇旁则进镇（原版 setMode(7) 语义），否则暂停/继续移动
    const sdx = x - CAM_X, sdy = y - CAM_Y;
    if (sdx * sdx + sdy * sdy <= 14 * 14) {
      const town = c.overTown != null ? this.gd.Towns[c.overTown] : null;
      if (town?.active && Math.hypot(town.x - c.x, town.y - c.y) < 25) this.hooks.onEnterTown(town.id);
      else c.moving = !c.moving;
      // 原版 mouseStatus==2（点自身符号）点击无声音（MapMode.as L384-397）
      return;
    }
    const wx = x - CAM_X + c.x;
    const wy = y - CAM_Y + c.y;
    // 原版非中心点击仅设置方向，不能被附近城镇图标劫持。
    // 原版 click 语义：点击车队位置 = 视作移动指令（遭遇只能靠 16px 接触触发，点车队不对话）
    // 原版方向语义（0=北，顺时针）：atan2(dx, -dy)（MathFunctions.as L20-32）
    this.protectDepartureFromOverlappingTowns();
    c.direction = Math.atan2(wx - c.x, c.y - wy);
    c.moving = true;
    sfxClick();
  }

  private onKey(e: KeyboardEvent) {
    // The map listener remains mounted while a Battle scene is displayed.
    // Ignore every map shortcut during battle, including S (caravan settings).
    if (!this.active || this.hooks.isInputBlocked?.() || this.battleInProgress || (globalThis as any).__c2BattleActive) return;
    const gd = this.gd;
    switch (e.keyCode) {
      case 49: this.setSpeed(1); break;
      case 50: this.setSpeed(2); break;
      case 51: this.setSpeed(4); break;
      case 48: case 52: this.setSpeed(0); break;
      case 32:
        e.preventDefault();
        this.setSpeed(gd.gameSpeed === 0 ? this.prevSpeed : 0);
        break;
      case 77: gd.Caravans[0].moving = !gd.Caravans[0].moving; break;
      case 67: this.hooks.onOpenMenu("caravan"); break;
      case 83: this.hooks.onOpenMenu("settings"); break;
      case 27: this.hooks.onOpenMenu("options"); break;
      case 78: this.hooks.onOpenMenu("map"); break; // N 键导航（原版 setMode(5)）
    }
  }

  updateControls(dt: number) {
    this.statusRemaining = Math.max(0, this.statusRemaining - dt);
    this.statusText.visible = this.statusRemaining > 0;
    this.statusText.alpha = Math.min(1, this.statusRemaining / .6);
    this.statusText.y = this.infoText?.visible ? this.infoText.y + this.infoText.textHeight + 6 : 15;
    // This path also runs while an overlay freezes the world simulation.
    this.updateSpeedTabs(); // GD transitions can change speed without pressing a tape button.
    this.updateTownCursor();
    this.leverFrameAcc += Math.min(dt,.2)*25;
    while(this.leverFrameAcc>=1){this.leverFrameAcc--;for(const l of this.levers){l.frame=Math.max(1,Math.min(5,l.frame+(l.pressed?1:-1)));l.images.forEach((im,i)=>im.visible=i===l.frame-1);}}
  }

  update(dt: number) {
    this.updateControls(dt);
    const gd = this.gd;
    const c = gd.Caravans[0];
    const visibleR = SQUARE * 3.2;
    // 碉堡开场确认框显示期间冻结世界（值星官对话是模态，原版 openDialogue 同理）
    if (this.bunkerPrompt && this.bunkerPrompt.visible) { this.updateTownCursor(); return; }
    if (gd.gameSpeed > 0) {
      gd.Time += dt * 6000 * gd.gameSpeed; // 校准：原版每帧 Time += 60*4=240 游戏秒，×25fps = 6000 游戏秒/真实秒 → 1 游戏日 = 14.4 真实秒
      gd.advanceCaravan(c, dt);
    }
    // t64 ① 碉堡开场（原版 MapMode.as L1089-1092）：首次靠近镇15（<500px≈1 方格）且剧情就绪时
    // 触发值星官对话一次（无需点击）；enteredBunkerForTheFirstTime 随 story.flags 持久化
    if (this.maybeBunkerIntro(gd, c)) { this.updateTownCursor(); return; }
    // overTown 标记重算（原版 MapMode EF：每帧按 <25px 重算）
    if (!this.battleInProgress) {
      let ov: number | null = null;
      for (const t of gd.Towns) {
        if (t.active && Math.hypot(t.x - c.x, t.y - c.y) < 25) { ov = t.id; break; }
      }
      c.overTown = ov;
      // 离开城镇半径 → 解除最近交互保护（可再次进镇）
      c.recentlyInteractedTowns = c.recentlyInteractedTowns.filter(id => {
        const town = gd.Towns[id];
        return !!town?.active && Math.hypot(town.x - c.x, town.y - c.y) <= 25;
      });
      // 玩家移动中碰到城镇（overTown 置位且非最近交互保护期）→ 停车并自动进镇（原版语义，t35 恢复）
      if (this.active && gd.gameSpeed > 0 && c.moving && ov !== null && !c.recentlyInteractedTowns.includes(ov)) {
        c.moving = false;
        this.hooks.onEnterTown(ov);
        this.updateTownCursor();
        return;
      }
    }
    this.updateTownCursor();
    // 周期系统（每 360 游戏秒：城镇经济结算 + 玩家消耗 + 动物生产/消耗/繁殖）
    gd.updateTowns(dt);
    gd.updatePeople(dt);
    if (!c.People.length) return;
    gd.updateTransports(dt);
    // 遭遇检测（反馈14：每帧概率尝试，对齐原版 MapMode.as L6079-6110；不再按 21600 游戏秒批次累积）
    // 原版公式 ProbabilityRandom(prob/25 * gameSpeed * speedMult * diffMult * 4)，
    // 概率强度随距离线性衰减 intensity*(1-d/radius)）
    if (gd.gameSpeed > 0 && !this.battleInProgress) {
      const sx = Math.floor(c.x / SQUARE), sy = Math.floor(c.y / SQUARE);
      const groups: any[] = [...(this.ds.presets?.random_groups?.[0] ?? []),
        ...(Object.values(this.ds.gamedata.originalDlcProbabilities??{}) as number[][][]).flat().map(([x,y,type,intensity,radius])=>({x,y,type,intensity,radius}))];
      // 按 type 分桶累计强度（原版 setGroupProbabilitiesArea：方格 GroupProbabilities 是 per-type map）
      const gp = new Map<number, number>();
      for (const g of groups) {
        if (gd.story?.flags?.suppressedRandomGroups?.includes(g.type)) continue;
        const r = g.radius ?? 1;
        const d = Math.hypot(g.x - sx, g.y - sy);
        if (d <= r) {
          const v = (g.intensity ?? 0) * (1 - d / r);
          if (v > 0) gp.set(g.type, (gp.get(g.type) ?? 0) + v);
        }
      }
      if (gp.size > 0) {
        // 原版 MapMode.as:6084-6087：speedMultiplier = 0.9; if(moving) speedMultiplier += speed/40;
        // 无上限钳制——速度超过 40km/h 时遭遇概率系数继续增长。旧实现的 Math.min(...,40) 是移植期臆造。
        const speedMult = 0.9 + (c.moving ? (c.speedKmh ?? 20) / 40 : 0);
        const diffMult = gd.difficulty === 2 ? 1.1 : 1;
        // ⑦e 随机遭遇＝往地图刷车队（原版 MapMode.as:6079-6109）：gp[t]>0 的每个 type 各算一次 count，
        // count 次就生成 count 支该 type 车队（同帧可多 type 多支）；刷点=玩家可见边缘、偏向行进前方。
        // 生成的 NpcCaravan 走既有接敌链（willAmbush 近距袭击 / 点击交互），不再直开战。
        if (typeof gd.spawnEncounterCaravan === "function") {
          for (const t of [...gp.keys()].sort((a, b) => a - b)) {
            // 方案①：折算到原版 25fps 掷骰频率——web 每 rAF 帧(≈60fps)掷骰、dt 为真实秒；
            // ×dt×25 ⇒ 60fps 下期望刷新率 ≈0.417×（原版公式 /25 即按 25fps 设计，Flash 默认 24fps 略偏）
            const p = (gp.get(t) ?? 0) / 25 * gd.gameSpeed * speedMult * diffMult * 4 * (dt * 25);
            const count = probabilityRandom(p);
            for (let k = 0; k < count; k++) gd.spawnEncounterCaravan(t, c);
          }
        } else {
          // 兜底（无该 API 的环境/旧调用）：退回直开战
          for (const t of [...gp.keys()].sort((a, b) => a - b)) {
            // 方案①：折算到原版 25fps 掷骰频率（同主分支）
            const p = (gp.get(t) ?? 0) / 25 * gd.gameSpeed * speedMult * diffMult * 4 * (dt * 25);
            if (probabilityRandom(p) > 0) {
              this.battleInProgress = true;
              this.hooks.onEncounter(t);
              break;
            }
          }
        }
      }
      // 反馈14 清理：遭遇车队（category=1，兼容旧档 stateless 标记）回收——对齐原版 MapMode.as L3272-3301：
      // 条件 = 不出现在玩家 3×3 方格（inNearby ≈ ±750px，SQUARE×1.5）且距离 >400 才移除（超出规约的遭遇车；
      // 近旁方格内 400~750px 的遭遇车保留）。web 旧实现只看 >400px，导致剧情 Rovers（碉堡北 441px）
      // 生成瞬间即被删、「上方流浪者消失」；自由民(category=2)/路线商队(category=5) 豁免
      for (let i = gd.npcCaravans.length - 1; i >= 0; i--) {
        const npc = gd.npcCaravans[i];
        if ((npc as any).stateless === true || npc.category === 1) {
          const dx = npc.x - c.x, dy = npc.y - c.y;
          const inNearby = Math.abs(dx) <= SQUARE * 1.5 && Math.abs(dy) <= SQUARE * 1.5; // 玩家 3×3 方格近似
          if (!inNearby && dx * dx + dy * dy > 400 * 400) gd.npcCaravans.splice(i, 1);
        }
      }
    }
    if (gd.gameSpeed > 0) {
      const leavers=gd.paySalaries();
      if(leavers.length)gd.onNotify?.("工资不足："+leavers.join("、"));
    }
    // 跨天 → 城镇生产/消耗结算
    const day = gd.day;
    if (day !== this.lastDay) {
      if (this.lastDay !== -1) {
        const surv = gd.dailyConsumption();
        if (surv.length) {
          this.toastText = surv.join("，") + " — 成员体力下降";
          this.toastTime = 4;
        }
        // No daily autosave in original GameData.setMode / MapMode.saveNow.
        gd.updateWind(dt);
        // 工作房每日产能重置（原版 MapMode L3327：producedToday 跨天清零）
        gd.resetProducedToday();
        gd.measureSextant();
        // MapMode.as:3494-3500: easy-mode daily assistance for the starting settlements.
        if (gd.difficulty === 1) {
          gd.Towns[19]?.addToStock(99 + Math.floor(Math.random() * 4), 1);
          for (const id of [17,18,19]) if (gd.Towns[id]) gd.Towns[id].money += 1000;
        }
      }
      this.lastDay = day;
    }
    // ⑦g 最近交互冷却清理（离开 600px 半径解除；freeASlave 车队与玩家双向标记后依此防连触发）
    if (typeof gd.clearDistantCaravanInteractions === "function") gd.clearDistantCaravanInteractions();
    // NPC 车队移动（原版 MapMode.as：直行 L947-950 / contact 16px L2567-2611 / 路线车专用 L2690-2736 / 追击拦截角 L2818-2851）
    if (gd.gameSpeed > 0) {
      resolveWorldNpcContacts(gd);
      steerWorldNpcs(gd);
      for (const npc of [...gd.npcCaravans]) {
        const pdx = npc.x - c.x, pdy = npc.y - c.y;
        const pdist = Math.hypot(pdx, pdy);
        // 接触 ≤16px 独立判定（原版 L2577-2602 + L2720-2733：玩家↔任意车队含路线商队；友善车队 openDialogue(3)）
        if (pdist < 16 && c.overTown == null && (npc as any).overTown == null && !this.battleInProgress) {
          const already = typeof gd.isCaravanRecentlyInteracted === "function" && gd.isCaravanRecentlyInteracted(npc);
          const behavior = checkWorldBehavior(gd, npc, c, pdist);
          if (!already && (behavior > 0 || gd.interactWithFriendlyCaravans)) {
            if (typeof gd.markCaravanInteracted === "function") gd.markCaravanInteracted(npc);
            this.battleInProgress = true;
            this.hooks.onNpcCaravan(npc.id, behavior > 0); // 原版 checkBehavior>0 才是 openDialogue(2)，否则为 case 3
            return;
          }
        }
        // 路线商队（category5）：原版 L2797 排除追击/逃跑；沿路线导航，到站交易并推进（L13710-13717 跳过 inactive 镇）
        if (npc.category === 5) {
          gd.moveNpcRoute(npc, dt, { Economy });
          continue;
        }
        // Shared NPC-vs-NPC/player steering is evaluated above before movement.
        if(npc.specialPurpose===23&&gd.ds.gamedata.originalDlcFeatures?.['special-story']) {
          const target=gd.Towns[npc.dlcDestination??83];
          const dx=target.x-npc.x,dy=target.y-npc.y,distance=Math.hypot(dx,dy);
          const step=npc.speedKmh/12*4*25*gd.gameSpeed*dt;
          npc.direction=Math.atan2(dx,-dy);
          if(distance<=Math.max(step,25)) {
            npc.x=target.x;npc.y=target.y;
            if(target.id===83){target.playersStorage=[];const flags=gd.story.flags; (flags.additionalVariables??={}).storageEmptiedByDrekar=true;npc.dlcDestination=20;}
            else {target.population+=npc.squad?.people.length??npc.people.length;gd.npcCaravans.splice(gd.npcCaravans.indexOf(npc),1);}
          } else {npc.x+=dx/distance*step;npc.y+=dy/distance*step;}
          continue;
        }
        if (!npc.moving) continue;
        if (npc.direction != null) {
          const step = npc.speedKmh / 12 * 4 * 25 * gd.gameSpeed * dt;
          npc.x += Math.sin(npc.direction) * step;
          npc.y -= Math.cos(npc.direction) * step;
          continue;
        }
        // 导航到目标城镇（原版 directCaravanToTown）
        const target = gd.Towns[npc.routePoints[npc.pointIdx]];
        if (!target) continue;
        const dx = target.x - npc.x, dy = target.y - npc.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 12) {
          // 自由民车队（category=2）到镇：人口并入城镇后解散（原版 L3160-3182）
          if (npc.category === 2) {
            target.population += npc.people.length;
            target.unemployed += npc.people.length;
            const fi = gd.npcCaravans.indexOf(npc);
            if (fi >= 0) gd.npcCaravans.splice(fi, 1);
            continue;
          }
          // 遭遇车队到镇：直线穿过不绕圈（原版遭遇车无路线，directCaravanToTown 后保持 direction 直行）
          npc.direction = Math.atan2(dx, -dy);
          npc.routePoints = [];
          npc.pointIdx = 0;
          const step = npc.speedKmh / 12 * 4 * 25 * gd.gameSpeed * dt;
          // Exact town-centre arrivals have dist=0; use heading, not a zero-length normal.
          npc.x += Math.sin(npc.direction) * step;
          npc.y -= Math.cos(npc.direction) * step;
          continue;
        }
        const step = npc.speedKmh / 12 * 4 * 25 * gd.gameSpeed * dt; // 原版 mapSpeed 映射
        const travel = Math.min(step, dist);
        npc.x += (dx / dist) * travel;
        npc.y += (dy / dist) * travel;
      }
    }
    // 方案② 识别迷雾：玩家车队视野 = 成员最高 Character.sight（原版 Caravan.sight 同式，getter World.ts:301）
    const playerSight = Math.max(...(c.People ?? []).map((p: any) => p.sight ?? 0), 40);
    // NPC 精灵位置：按精灵遍历、重复 id 取首个 NPC 定位（读档后曾出现
    // npcCaravans 双份导致 id 重复——首个为测试夹具目标；已销毁的车队隐藏精灵）
    for (const ns of this.npcSprites) {
      const npc = gd.npcCaravans.find((n) => n.id === ns.id);
      if (!npc) { ns.sp.visible = false; continue; }
      const dx = npc.x - c.x, dy = npc.y - c.y;
      const dist = Math.hypot(dx, dy);
      // 原版可见判定：betweenCaravans(平方距离) <= npc.noticeability × 玩家.sight
      ns.sp.visible = dist < visibleR && dist * dist <= (npc.noticeability ?? 150) * playerSight;
      ns.sp.x = dx + CAM_X;
      ns.sp.y = dy + CAM_Y;
      // 原版 MapMode.as L3249：mapSymbolRotatingPart.rotation = direction×Rad2Deg（0=北，顺时针为正）
      if (ns.rotPart) ns.rotPart.rotation = ((npc.direction ?? 0) * 180 / Math.PI) % 360;
      if (ns.sp.visible) this.updateNpcLabel(npc, ns, dist, playerSight);
    }
    // 惰性补建动态生成的车队精灵（Rovers 等；新 id 首次出现才建，重复 id 复用已有精灵）
    for (const npc of gd.npcCaravans) {
      if (this.npcSprites.some((s) => s.id === npc.id)) continue;
      const sp = new Sprite();
      const rotPart = new Sprite(); // 原版 mapSymbolRotatingPart：图形随 direction 旋转（MapMode.as L3249），文字/命中不转
      const g = new Graphics();
      // 原版 Caravan.as:318-335：lineStyle(3, 黑, α0.3) 半圆弧(半径9, 0.5→5.783 rad) + 顶部竖线(0,0)→(0,-13.5)
      // round 线帽：竖线端点圆头（Flash 默认 caps/jointStyle=round；web canvas 默认 butt/miter 会显得方头断裂）
      // 半圆弧用单条 arcPath：旧实现 53 段折线互相重叠会让弧视觉比竖线深（用户反馈"直线颜色与圆弧不一致"），单弧还与 Flash arc 一致
      g.lineStyle(3, 0, 0.3, true);
      const R = 9;
      // 原版 Caravan.as:318-335 折线路径（moveTo 一次 + lineTo 53 段 = 单 path 单 stroke）：
      // 缺口 58° 居中顶部，竖线(方向)与缺口永远对齐；canvas arc() 缺口偏右上 29° 会造成
      // 旋转后“竖线与弧错开”的观感（globalAlpha 连乘已修复，单 path 折线不会叠深）
      g.moveTo(Math.sin(0.5) * R, -Math.cos(0.5) * R);
      for (let a = 0.6; a <= 5.783185307179586 + 1e-6; a += 0.1) {
        g.lineTo(Math.sin(a) * R, -Math.cos(a) * R);
      }
      g.moveTo(0, 0);
      g.lineTo(0, -R * 1.5);
      g.hitCircle(0, 0, 22); // 点击判定（命中区独立于绘制通道）
      rotPart.graphics = g;
      sp.addChild(rotPart);
      // 原版 Caravan.as:337-340：名字(0x444444, 字号10) 与人数(同色, 字号8) 均位于图标下方 y=12/22、200px 居中
      const nameText = new EngineText(npc.name, 4473408, 10, "center", -100, 12, 200, 15);
      const countText = new EngineText("", 4473408, 8, "center", -100, 22, 200, 15);
      sp.addChild(nameText);
      sp.addChild(countText);
      sp.mouseEnabled = false;
      this.moving.addChild(sp);
      this.npcSprites.push({ sp, id: npc.id, rotPart, nameText, countText });
      const dx = npc.x - c.x, dy = npc.y - c.y;
      const dist = Math.hypot(dx, dy);
      // 同一可见判定（含识别迷雾），创建当帧即生效
      sp.visible = dist < visibleR && dist * dist <= (npc.noticeability ?? 150) * playerSight;
      sp.x = dx + CAM_X;
      sp.y = dy + CAM_Y;
      // 动态生成当帧也应用原版朝向，避免第一帧固定朝北。
      rotPart.rotation = ((npc.direction ?? 0) * 180 / Math.PI) % 360;
    }
    // 风向标（原版：仅帆动力车队显示；文本 WIND: X.X KM/H）
    if (this.windSymbol) {
      const hasWind = gd.Caravans[0].transports.some((tr: any) => this.ds.transports?.Types?.[tr.type]?.windPowered);
      this.windSymbol.visible = hasWind;
      this.windArrow.rotation = (gd.windDir * 180 / Math.PI) % 360;
      if (this.windSpeedText) this.windSpeedText.text = this.text(6).toUpperCase() + ": " + Math.round(gd.windSpeed * 10) / 10 + " " + this.text(10);
    }
    // toast（保留：原版 toast 走独立浮层，此处沿用 infoText 显示）
    if (this.toastTime > 0) {
      this.toastTime -= dt;
      this.infoText.text = this.toastText;
    }
    void this.tutorialShown;
    // 地面瓦片偏移（对齐原版：x<0 时额外减一个瓦片——纹理是视差装饰，不与世界坐标对齐）
    this.ground.x = c.x > 0 ? -(c.x % TILE_W) : -(c.x % TILE_W) - TILE_W;
    this.ground.y = c.y > 0 ? -(c.y % TILE_H) : -(c.y % TILE_H) - TILE_H;
    // 城镇符号可见性与位置
    const visibleTowns = discoverVisibleTowns(gd);
    for (let i = 0; i < this.gd.Towns.length; i++) {
      const t = this.gd.Towns[i];
      const dx = t.x - c.x, dy = t.y - c.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const sym = this.townSymbols[i];
      if(sym.name.text!==t.name)sym.name.text=t.name;
      if (visibleTowns.has(t.id)) {
        sym.disp.visible = true;
        sym.disp.x = dx + CAM_X;
        sym.disp.y = dy + CAM_Y;
      } else {
        sym.disp.visible = false;
      }
    }
    // 车队符号
    this.caravanSym.x = CAM_X;
    this.caravanSym.y = CAM_Y;
    // 原版 rotation = direction*Rad2Deg（MapMode.as L3249；0=北，顺时针为正，箭头图形指上）
    this.caravanArrow.rotation = (c.direction * 180 / Math.PI) % 360;
    // 鼠标 Look 三角实时指向鼠标（pointermove 更新 mouseLookDir）；遭遇/对话期间隐藏（原版 mouseStatus==1 才显示）
    if (this.battleInProgress) { this.lookArrow.visible = false; this.lookArrowSolid.visible = false; }
    // LCD 计数器里程表滚动（原版 Counter.EF 每帧推进：值变化时数字滚动换位）
    for (const cnt of this.counters) cnt.tick(dt);
    // HUD 每 0.3s 刷新：LCD 计数器/警示灯/载重/日期翻牌（指针每帧更新）
    this.timeAcc += dt;
    if (this.timeAcc > 0.3) {
      this.timeAcc = 0;
      const d = gd.makeDate();
      // 原版 Caravan getters（Caravan.as L1151-1226）：water=item1、forage=item62、meds=item63、fuel=item64；
      // food=Σ食物物品 数量×卡路里(kcal)（含食人 174 && cannibal）；counter6=电力盈余 max(eP-eC,0)
      // Share the category-safe getter with supplies and the meal planner. Weapons,
      // ammo and armor reuse Goods subCategory indices but are not edible cargo.
      const vals = [
        c.cargoAmount(1),
        c.food, // 原版 food=Σ amt×calories 浮点原值直接 setCounter，个位随消耗连续滚动
        c.cargoAmount(63),
        c.cargoAmount(62),
        c.cargoAmount(64),
        Math.max((c.electricityProduction ?? 0) - (c.electricityConsumption ?? 0), 0),
        c.money,
      ];
      for (let i = 0; i < 7; i++) this.counters[i].setValue(vals[i]);
      // 警示灯 1-7（原版 MapMode.as L6300-6331：water<=0 / food<=0 / meds<=0 且消耗中 / forage<=0 且有动物 / fuel<=0 且有车 / eP<eC）
      const hasAnimals = c.transports.some((tr: any) => tr.category === 1);
      const hasVehicles = c.transports.some((tr: any) => tr.category === 3);
      if (this.warningBulbs.length >= 7) {
        this.warningBulbs[0].visible = vals[0] <= 0;
        this.warningBulbs[1].visible = vals[1] <= 0;
        this.warningBulbs[2].visible = vals[2] <= 0 && c.totalMedicineConsumption() > 0;
        this.warningBulbs[3].visible = vals[3] <= 0 && hasAnimals;
        this.warningBulbs[4].visible = vals[4] <= 0 && hasVehicles;
        this.warningBulbs[5].visible = (c.electricityProduction ?? 0) < (c.electricityConsumption ?? 0);
        this.warningBulbs[6].visible = false; // 原版 bulbs[7] 恒灭（无 money 灯）
      }
      // 指示灯 8-11：重伤人员/状况差的牲口/机械问题/其他（原版 y=244）
      const woundedPeople = c.People.some((pp: any) => (pp.wounded ?? 0) >= 4);
      const woundedAnimals = c.transports.some((tr: any) => tr.category === 1 && tr.health < tr.maxHealth * 0.1);
      const mechProblems = c.transports.some((tr: any) => (tr.category === 2 || tr.category === 3) && tr.health < tr.maxHealth * 0.1);
      if (this.indicatorBulbs.length >= 4) {
        this.indicatorBulbs[0].visible = woundedPeople;
        this.indicatorBulbs[1].visible = woundedAnimals;
        this.indicatorBulbs[2].visible = mechProblems;
        this.indicatorBulbs[3].visible = false;
      }
      // 超载灯 12（原版 (680,270)）
      if (this.overloadBulb) this.overloadBulb.visible = c.totalCargo > c.maxCargo;
      // 载重 curr/max（原版 Indicator.setValue(v,3,true)：去尾零，单位 t，3 位小数）
      this.cargoCurr.setValue(c.totalCargo / 1000, 3, true);
      this.cargoMax.setValue(c.maxCargo / 1000, 3, true);
      // 日期 flippers（原版 y=386：Day/Month/Year/AMPM）
      this.flippers[0].text = String(d.Day2d);
      this.flippers[1].text = String(d.ShortMonthName);
      this.flippers[2].text = String(d.Year2d);
      this.flippers[3].text = String(d.AmPm);
    }

    // 模拟时钟指针每帧更新（原版每帧 makeDate 渲染；0.3s 节流会让指针跳格）
    const cd = gd.makeDate();
    this.clockMin.rotation = cd.Minute * 6;
    this.clockHour.rotation = ((cd.Hour % 12) + cd.Minute / 60) / 12 * 360;

    // 左侧信息框：toast > HUD 悬停提示 > 地图悬停提示（原版 cursorText 语义）
    const tip = this.toastTime > 0 ? this.toastText : this.hoverTip || (this.mouseOverMap ? this.mapHoverInfo(c) : '');
    // MapMode.as:6657–6690: 0.15 alpha per 25-fps frame, with a 1.3 fade reservoir.
    if (tip) this.infoText.text = tip;
    this.infoTextOpacity = Math.max(0, Math.min(1.3, this.infoTextOpacity + (tip ? 1 : -1) * .15 * dt * 25));
    this.infoText.alpha = Math.min(1, this.infoTextOpacity);
    this.infoText.visible = this.infoTextOpacity > 0;
  }
  /**
   * 鼠标位于玩家队伍与城镇重叠的交互区域时，使用原版手势光标。
   * 只有城镇中心附近才启用，不把整个地图面板变成 pointer。
   */
  private updateTownCursor() {
    const c = this.gd.Caravans[0];
    const blocked = !this.active || this.battleInProgress || !!this.bunkerPrompt?.visible || !!this.hooks.isInputBlocked?.() || !!(globalThis as any).__c2BattleActive;
    const x = Input.mouseX, y = Input.mouseY;
    let pointer = false;
    if (!blocked && c?.overTown != null && x >= 0 && x < 670 && y >= 0 && y < 495) {
      // Match onMapClick / original mouseStatus == 2, not a larger non-clickable area.
      const dx = x - CAM_X, dy = y - CAM_Y;
      pointer = Math.hypot(dx, dy) <= 14;
    }
    Input.cursorOverride = pointer ? "pointer" : null;
    Input.syncCursor();
  }
  /**
   * t64 ① 碉堡开场（原版 MapMode.as L1089-1092）：
   * 'if(storyMode && Story is Caravaneer2MainStory && nearbyTowns 含镇15 && !Story.enteredBunkerForTheFirstTime){...}'
   * 首次靠近碉堡(镇15)<25px（反馈2：原版 MapMode.as L1024-1093 到达镇 25px 内；原 500 是移植期臆造）触发值星官对话（文本 1609），
   * 批准 → 进镇 + 主席布拉斯对话（openDialogue case 8 → DialogueScreen 角色1；关闭后回地图并刷新 Rovers）。
   */
  private maybeBunkerIntro(gd: any, c: any): boolean {
    const st = gd.story;
    if (!gd.storyMode || !st) return false;
    if (typeof st.get === "function" && st.get("enteredBunkerForTheFirstTime")) return false;
    const t15 = gd.Towns?.[15];
    if (!t15) return false;
    const dist = Math.hypot(t15.x - c.x, t15.y - c.y);
    // 反馈2：原版 MapMode.as L1024-1093 到达镇 25px 内才触发值星官对话（原 500 阈值过宽）
    if (dist > this._bunkerIntroDist) return false;
    if (typeof st.set === "function") st.set("enteredBunkerForTheFirstTime", true);
    else st.enteredBunkerForTheFirstTime = true;
    const gender = c.People?.[0]?.gender === 2 ? 2 : 1;
    const txt = getText(this.ds, 1609, this.ds.language, gender).toUpperCase();
    if (!this.bunkerPrompt) {
      this.bunkerPrompt = new YesNoDialogue(this.ds, this.assets, true);
      this.screen.addChild(this.bunkerPrompt);
    }
    const hooks = this.hooks;
    this.bunkerPrompt.show(txt, () => {
      // 原版 openDialogue case 8 approve：closeDialogue(); enterTown(15); GD.setMode(7,1)
      hooks.onEnterTown(15);
      hooks.onOpenDialogue?.(8);
    });
    return true;
  }
  /** 碉堡触发距离（反馈2：25px，原版 MapMode.as L1024-1093；留字段便于测试探针调整） */
  private _bunkerIntroDist = 25;

  // 原版 cursorText（鼠标停在地图区时）：车队状态/速度/方向/点击提示
  private mapHoverInfo(c: any): string {
    const moving = c.moving;
    let s = this.text(3) + "\n";
    if (moving) {
      s += this.text(4) + "\n" + this.text(6) + ": " + Math.round((c.speedKmh ?? 0) * 10) / 10 + " " + this.text(10) + "\n" + this.text(7) + ": " + Math.round(c.direction * 180 / Math.PI * 10) / 10 + "º\n" + this.text(8);
    } else {
      s += this.text(5) + "\n" + this.text(7) + ": " + Math.round(c.direction * 180 / Math.PI * 10) / 10 + "º\n" + this.text(9);
    }
    if (c.overTown != null) {
      s += "\n" + this.text(1381).replace("@town@", this.gd.Towns[c.overTown]?.name ?? "") + "\n" + this.text(1673);
    }
    return s;
  }
}





