import { attachLocationSymbol, locationSymbolParts } from "./LocationSymbols";
// TownMode：城镇（对应 AS3 IsoEngine.TownMode）
// screens[0]=主菜单 7 按钮，screens[1]=镇贴图+地点标记，screens[2-4]=统计/雇人/产业（占位）
import { Sprite, Graphics, BitmapObject } from "../core/Display";
import { addDialogueBackground, DialogueTextMask } from "../core/DialogueBg";
import { EngineText } from "../core/EngineText";
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import { Input } from "../core/Input";
import { GameData, Town, Character } from "./World";
import { TradeWindow } from "./TradeWindow";
import { ScrollableArea, Button } from "../core/Ui";
import { HealingFacility } from "./HealingFacility";
import { DialogueScreen } from "./DialogueScreen";
import { sfxClick, sfxPage, sfxCashRegister } from "../core/Sound";
import { buildPortraitFromCharacter } from "./Portrait";
import { makePersonCell } from "./PeopleGrid";
import { itemName, getItemData } from "./Economy";
import { ConsProdGraph, numberFormat } from "./ConsProdGraph";
import { paperInk, paperButton } from '../core/PaperUi';
import { CalculatorPanel } from '../core/CalculatorPanel';
import { YesNoDialogue } from "./YesNoDialogue";

export interface TownModeHooks {
  onExitToMap: () => void;
  onOpenCaravanMenu: () => void;
  /** t64 ③：原版按钮 5（1265 地图）→ NavigationScreen 覆盖层（显示导航而非离开城镇） */
  onOpenNavigation: () => void;
}

export class TownMode {
  readonly screen = new Sprite();
  private tradeWindow: TradeWindow;
  private bottomCapacity!: EngineText;
  private bottomMoney!: EngineText;
  private bottomDate!: EngineText;
  private timeAcc = 0;
  private townLayer: Sprite | null = null;
  private townParchPlaced = false;
  // 城镇蒙版组（原版 screens[1].FG 语义：alphas 掩码漏出 FG 锈斑纹理，erase 挖洞透 BG 羊皮纸）
  private townSceneAlphas: Sprite | null = null;
  private townSceneErase: Sprite | null = null;
  // 地点标记 hover（原版 blueSign：蓝钉+图标镂空，指针悬停 alpha→0.7）
  private blueSigns: Array<{ hit: Sprite; blue: Sprite; fill: Sprite; erase: () => BitmapObject | null; loc: any }> = [];
  // ① 当前屏 categoryMarker 黑框（原版 L127-131/L1637：y=buttonPositions[currScreen-1]）
  private categoryMarker: Sprite | null = null;
  private currScreen = 1; // 1=设施页 2=统计 3=人员 4=产业
  // ② hover 设施名（原版 cursorInfo：跟随鼠标的浅黄底文本框，仅悬停显示）
  private hoverInfo: Sprite | null = null;
  private hoverInfoText: EngineText | null = null;

  constructor(
    private gd: GameData, private town: Town, private ds: DataStore, private assets: AssetStore,
    private hooks: TownModeHooks,
  ) {
    this.tradeWindow = new TradeWindow(gd, ds, assets, () => this.hideTrade());
    this.build();
  }

  private text(id: number) { return getText(this.ds, id, this.ds.language); }

  // 原版 getLocationSymbol(symbol)：symbol(1-34) → filtericon 部件列表（name=x.png 的 filtericon<name>.png）
  // 原版 signBmData 预渲染（TownMode.as L195-213）：把"圆 r20+三角 − 图标"挖洞模板预渲染成
  // 44x57 离屏 canvas（气泡中心=(22,22)，原版 translateMatrix tx=22,ty=57），作为单个 BitmapObject
  // 放进 sceneErase（blendMode=erase）→ 气泡主体区域挖掉透 BG 羊皮纸，图标区域保留 FG 锈斑深棕。
  // 绕开引擎 layer→erase→layer→erase 嵌套的 M=250 边距补偿脆弱性，坐标完全可控。
  // 返回 null 表示图标未就绪（调用方应稍后重试）。
  private makeEraseTemplate(iconParts: Array<{ name: string; x: number; y: number; scale: number }>): HTMLCanvasElement | null {
    const TW = 44, TH = 57;
    const cv = document.createElement("canvas");
    cv.width = TW; cv.height = TH;
    const c = cv.getContext("2d")!;
    c.clearRect(0, 0, TW, TH);
    // 白色"圆 r20+三角"（气泡中心=22,22；原版圆在 0,-35 → 模板 22,22；三角 -8,-30→0,0→8,-30）
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(22, 22, 20, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(14, 27); c.lineTo(22, 57); c.lineTo(30, 27); // 原版小三角 (-8,-30)→(0,0)→(8,-30) → 位图平移(22,57)
    c.closePath();
    c.fill();
    // 图标部件：scale0.7 居中于 (22,22)，destination-out 挖掉 → 模板=圆−图标
    c.save();
    c.globalCompositeOperation = "destination-out";
    for (const pt of iconParts) {
      const img = this.assets.getImage("filtericon" + pt.name + ".png");
      if (!img) return null; // 图标未就绪
      const w = img.naturalWidth * 0.7 * pt.scale, h = img.naturalHeight * 0.7 * pt.scale;
      c.drawImage(img, 22 + pt.x * 0.7 - w / 2, 22 + pt.y * 0.7 - h / 2, w, h);
    }
    c.restore();
    return cv;
  }

  // blueSign hover 模板：浅蓝 10788829 圆 r20+三角，图标区域挖掉（44x57，气泡中心=(22,22)）
  private makeBlueTemplate(iconParts: Array<{ name: string; x: number; y: number; scale: number }>): HTMLCanvasElement | null {
    const TW = 44, TH = 57;
    const cv = document.createElement("canvas");
    cv.width = TW; cv.height = TH;
    const c = cv.getContext("2d")!;
    c.clearRect(0, 0, TW, TH);
    c.fillStyle = "#A49FDD"; // 10788829 = 0xA49FDD
    c.beginPath();
    c.arc(22, 22, 20, 0, Math.PI * 2);
    c.fill();
    // 原版 eraseSign L195-213 三角 (-8,-30)→(0,0)→(8,-30)，平移(22,57) → (14,27)→(22,57)→(30,27)：
    // 尖端必须延伸到模板底边（气泡下方定位尖角），否则三角被圆盖住只露矩形带。
    c.beginPath();
    c.moveTo(14, 27); c.lineTo(22, 57); c.lineTo(30, 27);
    c.closePath();
    c.fill();
    c.save();
    c.globalCompositeOperation = "destination-out";
    for (const pt of iconParts) {
      const img = this.assets.getImage("filtericon" + pt.name + ".png");
      if (!img) return null;
      const w = img.naturalWidth * 0.7 * pt.scale, h = img.naturalHeight * 0.7 * pt.scale;
      c.drawImage(img, 22 + pt.x * 0.7 - w / 2, 22 + pt.y * 0.7 - h / 2, w, h);
    }
    c.restore();
    return cv;
  }

  private build() {
    const S = this.screen;
    const bg = this.assets.getImage("TownBG.jpg");
    if (bg) S.addChild(new BitmapObject(bg));
    else void this.assets.ensure("TownBG.jpg").then((im) => { if (im) S.addChildAt(new BitmapObject(im), 0); });
    // ① 深棕前景纹理组（原版 TownMode.as L92-131）：FG=InterfaceForeground × CT(0.3,0.2,0.1) blendMode layer，
    //    其上的 alphas 组（clearBmp 0.01 全屏 + 镇名/按钮/分隔线/底部信息/categoryMarker）以 alpha 掩码的形式
    //    把纹理"漏"到按钮背后与文字镂空处 → 按钮=深棕底纹条 + 深色镂空文字（原版 tempDisp 截图语义）。
    const FG = new Sprite();
    FG.blendMode = "layer";
    FG.blendAtDisplayResolution = true;
    FG.mouseEnabled = false;
    // 按钮需保留可点击：原版按钮/文字在 FG 组内的 alphas 上（FG.addChild(alphas)），
    // destination-in 掩码只影响显示不影响命中，故不能禁用 FG.mouseChildren
    const putFg = (im: HTMLImageElement | null) => {
      if (!im) return;
      const tb = new BitmapObject(im);
      tb.colorTransform = { r: 0.3, g: 0.2, b: 0.1 }; // 原版 CT(0.3,0.2,0.1)
      tb.mouseEnabled = false;
      FG.addChildAt(tb, 0);
    };
    const fgNow = this.assets.getImage("InterfaceForeground.png");
    if (fgNow) putFg(fgNow);
    else void this.assets.ensure("InterfaceForeground.png").then(putFg);
    S.addChild(FG);

    const alphas = new Sprite();
    alphas.blendMode = "alpha";
    alphas.blendAtDisplayResolution = true;
    const clearBmp = new Sprite();
    const cg = new Graphics();
    cg.beginFill(0, 0.01);
    cg.drawRect(0, 0, 880, 495);
    clearBmp.graphics = cg;
    clearBmp.mouseEnabled = false;
    alphas.addChild(clearBmp);
    // 镇名
    alphas.addChild(new EngineText(this.town.name.toUpperCase(), 0, 22, "center", 20, 18, 620, 26));
    // 7 个菜单按钮（x=660）
    const btnTexts = [this.town.name.length > 18 ? this.town.name.substring(0, 17) + "." : this.town.name, this.text(1262), this.text(1263), this.text(1264), this.text(34), this.text(1265), this.text(1266)];
    const btnY = [22, 92, 152, 212, 282, 342, 412];
    for (let i = 0; i < 7; i++) {
      const b = new Sprite();
      const g = new Graphics();
      g.beginFill(0);
      g.drawRect(0, 0, 200, 40);
      b.graphics = g;
      b.blendMode = "layer";
      b.blendAtDisplayResolution = true;
      const t = new EngineText(btnTexts[i].toUpperCase(), 0, 16, "center", 10, 10, 180, 26);
      t.blendMode = "erase";
      t.blendAtDisplayResolution = true;
      b.addChild(t);
      b.x = 660; b.y = btnY[i];
      b.buttonMode = true;
      const idx = i;
      b.addEventListener("click", () => this.onMenuButton(idx));
      alphas.addChild(b);
    }
    // categoryMarker：当前屏黑框（原版 L127-131 lineStyle(1.5,0)+drawRect(-5,-5,210,50)；L1637 y=buttonPositions[currScreen-1]）
    const marker = new Sprite();
    const mg = new Graphics();
    mg.lineStyle(1.5, 0);
    mg.drawRect(-5, -5, 210, 50);
    marker.graphics = mg;
    marker.x = 660;
    marker.y = btnY[0];
    marker.mouseEnabled = false;
    alphas.addChild(marker);
    this.categoryMarker = marker;
    // 底部分隔线（原版 alphas.lineStyle(1,0) 0,472 -> 880,472）
    const line = new Sprite();
    const lg = new Graphics();
    lg.lineStyle(1, 0);
    lg.moveTo(0, 472);
    lg.lineTo(880, 472);
    line.graphics = lg;
    line.mouseEnabled = false;
    alphas.addChild(line);
    // 底部信息（原版渲染实测：浅色文字——底部状态栏文字为 16777215）
    this.bottomCapacity = new EngineText("", 0, 14, "left", 10, 474, 860, 20);
    this.bottomMoney = new EngineText("", 0, 14, "left", 10, 474, 860, 20);
    this.bottomDate = new EngineText("", 0, 14, "right", 10, 474, 860, 20);
    alphas.addChild(this.bottomCapacity);
    alphas.addChild(this.bottomMoney);
    alphas.addChild(this.bottomDate);
    // ===== 城镇场景蒙版组（第 90 轮重写，原版 TownMode.as L69-242 语义）=====
    // 原版：BG=TownBG.jpg 全屏（最底羊皮纸）；screens[1] 内 FG=Sprite(layer) 含
    //   maskedBmp=InterfaceForeground×CT(0.3,0.2,0.1)（深棕锈斑）+ alphas(Sprite alpha){clearBmp+townImage+fillSign}
    //   + erase(Sprite erase){eraseSign(图标挖洞)}。
    // 城镇贴图 townImage 在 alphas 内 → 轮廓区漏出 FG 深棕锈斑纹理（"剪裁蒙版变棕色"）；
    // fillSign 也在 alphas 内 → 气泡区漏出锈斑；eraseCut 在 erase 组 → 图标挖洞透出 BG 羊皮纸。
    // web 结构：townLayer(S 顶层 normal) = [羊皮纸底(局部 TownBG)] + [townScene(layer) 城镇蒙版组] + [气泡命中 sign] + [blueSign hover] + [hoverName]
    const townLayer = new Sprite();
    this.townLayer = townLayer;
    FG.addChild(alphas);
    S.addChild(townLayer);
    // ① 羊皮纸底（城镇区局部，原版 BG 语义的可见底）——异步 ensure 补挂
    const putParch = (im: HTMLImageElement | null) => {
      if (!im || this.townParchPlaced) return;
      this.townParchPlaced = true;
      const pg = new BitmapObject(im);
      pg.srcRect = { x: 20, y: 82, w: 620, h: 360 };
      pg.x = 20; pg.y = 82;
      pg.mouseEnabled = false; // 纯背景不参与点击
      townLayer.addChildAt(pg, 0); // 最底：异步加载也不遮挡设施标记
    };
    const parchNow = this.assets.getImage("TownBG.jpg");
    if (parchNow) putParch(parchNow);
    else void this.assets.ensure("TownBG.jpg").then(putParch);
    // ② 城镇蒙版组（原版 screens[1].FG）：fb 锈斑纹理 + alphas{townImg 轮廓 + 气泡 fillShape} + erase{气泡 iconCut}
    const townScene = new Sprite();
    townScene.blendMode = "layer";
    townScene.mouseEnabled = false;
    townScene.x = 20; townScene.y = 82; // 城镇区原点（fb/掩码局部坐标）
    const sceneAlphas = new Sprite();
    sceneAlphas.blendMode = "alpha";
    sceneAlphas.mouseEnabled = false;
    const sceneErase = new Sprite();
    sceneErase.blendMode = "erase";
    sceneErase.mouseEnabled = false;
    sceneErase.mouseChildren = false;
    townScene.addChild(sceneAlphas);
    townScene.addChild(sceneErase);
    this.townSceneAlphas = sceneAlphas;
    this.townSceneErase = sceneErase;
    // fb：InterfaceForeground×CT(0.3,0.2,0.1) 深棕锈斑（异步 ensure 后补挂到 alphas 之下）
    let fbPlaced = false;
    const putFb = (im: HTMLImageElement | null) => {
      if (!im || fbPlaced) return;
      fbPlaced = true;
      const tb = new BitmapObject(im);
      tb.colorTransform = { r: 0.3, g: 0.2, b: 0.1 };
      tb.srcRect = { x: 20, y: 82, w: 620, h: 360 };
      tb.x = 0; tb.y = 0;
      tb.mouseEnabled = false;
      townScene.addChildAt(tb, 0); // 插到最底（alphas/erase 之上渲染）
    };
    const fbNow = this.assets.getImage("InterfaceForeground.png");
    if (fbNow) putFb(fbNow);
    else void this.assets.ensure("InterfaceForeground.png").then(putFb);
    // townImg 轮廓掩码（alpha 通道=轮廓）：异步 ensure 后挂入 sceneAlphas
    let townMasked = false;
    const putTownMask = (im: HTMLImageElement | null) => {
      if (!im || townMasked) return;
      townMasked = true;
      const tb = new BitmapObject(im);
      tb.x = 0; tb.y = 0;
      tb.mouseEnabled = false;
      sceneAlphas.addChild(tb);
    };
    const townNow = this.assets.getImage("town" + this.town.id + ".png");
    if (townNow) putTownMask(townNow);
    else void this.assets.ensure("town" + this.town.id + ".png").then(putTownMask);
    townLayer.addChild(townScene);
    // hover 名称文本框（原版 cursorInfo L1929-1964：浅黄底 16776424 + 深棕线框 3156000，
    // 内容=设施/人物名，位置跟随鼠标 mouseX+20/mouseY+10，边界钳制，alpha 淡入）
    const hoverInfo = new Sprite();
    hoverInfo.mouseEnabled = false;
    hoverInfo.mouseChildren = false;
    hoverInfo.visible = false;
    hoverInfo.alpha = 0;
    townLayer.addChild(hoverInfo);
    this.hoverInfo = hoverInfo;
    // 原版 L1902 new EngineText(...,14,"center",10,5,200,20) 后 L1917 把 width 收窄为文本宽+10 再居中。
    // EngineText 现在有 width setter（core/EngineText.ts:71），可以照原版：center + x=10，宽度每次更新时按文本收窄。
    this.hoverInfoText = new EngineText("", 3156000, 14, "center", 10, 5, 200, 20);
    hoverInfo.addChild(this.hoverInfoText);
    // ===== 地点标记（原版 L195-241）=====
    const locs = this.town.locations ?? [];
    const blueSigns: Array<{ hit: Sprite; blue: Sprite; fill: Sprite; erase: () => BitmapObject | null; loc: any }> = [];
    for (let i = 0; i < locs.length; i++) {
      const loc = locs[i];
      const iconParts = locationSymbolParts(loc.symbol);
      // 气泡主体（fillSign 语义）：白色圆 r22+三角 → sceneAlphas 掩码 → 该形状区漏出 FG 锈斑纹理
      const fillShape = new Sprite();
      fillShape.mouseEnabled = false;
      fillShape.visible = loc.visible !== false;
      const fg2 = new Graphics();
      fg2.beginFill(16777215);
      fg2.drawCircle(0, -35, 22); // 原版 fillSign r22
      fg2.beginFill(16777215);
      fg2.moveTo(-11, -30); fg2.lineTo(0, 6); fg2.lineTo(11, -30); fg2.lineTo(-11, -30);
      fillShape.graphics = fg2;
      fillShape.x = (loc.x ?? 0) + 0; // 相对 townScene 原点（20,82 已含）
      fillShape.y = (loc.y ?? 0) + 0;
      sceneAlphas.addChild(fillShape);
      // 图标挖洞（原版 signBmData 语义 L195-213）：预渲染"圆 r20+三角 − 图标"模板为单个
      // BitmapObject 挂 sceneErase（blendMode=erase）→ 气泡主体区域挖掉透 BG 羊皮纸，
      // 图标区域保留 FG 锈斑（深棕图标）。模板 44x57，气泡中心=(22,22) → 位图左上角=loc-22, loc-57。
      let eraseTmpl: BitmapObject | null = null;
      const putEraseTmpl = () => {
        const cv = this.makeEraseTemplate(iconParts);
        if (!cv) return false; // 图标未就绪，稍后重试
        if (eraseTmpl) sceneErase.removeChild(eraseTmpl);
        eraseTmpl = new BitmapObject(cv as unknown as HTMLImageElement);
        eraseTmpl.x = (loc.x ?? 0) - 22;
        eraseTmpl.y = (loc.y ?? 0) - 57; // 气泡中心 (loc.x, loc.y-35) - 模板中心 (22,22)
        eraseTmpl.mouseEnabled = false;
        eraseTmpl.visible = loc.visible !== false;
        sceneErase.addChild(eraseTmpl);
        return true;
      };
      if (!putEraseTmpl()) {
        // 图标未加载完：确保所有部件图加载后重建模板（幂等）
        let pending = false;
        for (const pp of iconParts) {
          if (!this.assets.getImage("filtericon" + pp.name + ".png")) {
            pending = true;
            void this.assets.ensure("filtericon" + pp.name + ".png").then(() => { putEraseTmpl(); });
          }
        }
        void pending; // 若无未加载图，putEraseTmpl 已返回 false 属图标表缺图，忽略
      }
      // 命中区（不可见）：sign 在 townLayer 顶层，仅点击命中，不参与渲染。
      // 注意：原版 fillSign 三角是气泡主体一部分（由 sceneAlphas 掩码渲染），此处 sign 只做命中，
      // 不能画可见三角（否则悬停时会多出重复倒三角）。buttonMode=true → 悬停显示手型光标（原版）。
      const sign = new Sprite();
      sign.x = (loc.x ?? 0) + 20;
      sign.y = (loc.y ?? 0) + 82;
      sign.visible = loc.visible !== false;
      const sg = new Graphics();
      sg.hitCircle(0, -35, 22);
      sign.graphics = sg;
      sign.buttonMode = true;
      const idx = i;
      sign.addEventListener("click", () => this.onLocationClick(idx));
      townLayer.addChild(sign);
      // blueSign hover（原版 blueSign：蓝钉 + 图标镂空，alpha 0→0.7；normal 混合，
      // 位图洞内透下层正常态锈斑图标，与原版 blueSign 无 blendMode 语义一致）。
      // 注意：不能给 blue 设 graphics 兜底形状 —— putBlueTmpl 只 removeAll 子项不清 graphics，
      // 兜底 fillSign 形（宽三角至 y=6）与模板位图（窄三角至 y=0）同时渲染会叠出双倒三角。
      const blue = new Sprite();
      // blueSign hover 模板：蓝"圆−图标"预渲染 BitmapObject（normal 混合，alpha 0→0.7）
      const putBlueTmpl = () => {
        const cv = this.makeBlueTemplate(iconParts);
        if (!cv) return false;
        blue.removeAll();
        const bmp = new BitmapObject(cv as unknown as HTMLImageElement);
        bmp.x = -22; bmp.y = -57; // 相对 blue 原点（blue 位于 sign.x, sign.y）
        bmp.mouseEnabled = false;
        blue.addChild(bmp);
        return true;
      };
      if (!putBlueTmpl()) {
        for (const pp of iconParts) {
          if (!this.assets.getImage("filtericon" + pp.name + ".png")) {
            void this.assets.ensure("filtericon" + pp.name + ".png").then(() => { putBlueTmpl(); });
          }
        }
      }
      blue.x = sign.x; blue.y = sign.y;
      blue.alpha = 0;
      blue.mouseEnabled = false;
      blue.mouseChildren = false;
      townLayer.addChild(blue);
      blueSigns.push({ hit: sign, blue, fill: fillShape, erase: () => eraseTmpl, loc });
    }
    this.blueSigns = blueSigns;
    // 原版 cursorInfo 最后 addChild → 最顶层（不被 blue/sign 盖住）
    if (this.hoverInfo) townLayer.addChild(this.hoverInfo);
    // 贸易窗口（隐藏）
    this.tradeWindow.screen.visible = false;
    S.addChild(this.tradeWindow.screen);
  }

  // 当前屏标记（原版 setScreen L1637：categoryMarker.y = buttonPositions[currScreen-1]）
  private setCurrScreen(n: number) {
    this.currScreen = n;
    if (this.categoryMarker) {
      const btnY = [22, 92, 152, 212, 282, 342, 412];
      this.categoryMarker.y = btnY[Math.max(0, Math.min(6, n - 1))];
    }
  }

  private onMenuButton(i: number) {
    sfxPage();
    // 冒烟 S7b2 要求：i=0（镇名按钮）关闭统计等 overlay 回设施页（UI 规格③）；这是 minimal 闭环，
    // 其余点击语义（i=5 NavigationScreen 等）留给 t64 扩展。
    if (i === 0) {
      this.closeStatsPage();
      if (this.industriesOv) this.industriesOv.visible = false;
      if (this.hireOv) this.hireOv.visible = false;
      this.townLayerVisible(true);
      this.setCurrScreen(1);
      return;
    }
    if (i === 1) { this.closeOverlays(); this.setCurrScreen(2); this.openStatsPage(); return; }
    if (i === 2) { this.closeOverlays(); this.setCurrScreen(3); this.openHirePage(); return; }
    if (i === 3) { this.closeOverlays(); this.setCurrScreen(4); this.openIndustriesPage(); return; }
    if (i === 4) { this.hooks.onOpenCaravanMenu(); return; }
    // t64 ③ 拆分（原版 pressMainMenuButton L1685：index5 → NavigationScreen，index6 → 世界地图）
    if (i === 5) { this.hooks.onOpenNavigation(); return; }
    if (i === 6) { this.hooks.onExitToMap(); return; }
  }

  private closeOverlays() {
    this.closeStatsPage();
    if (this.industriesOv) this.industriesOv.visible = false;
    if (this.hireOv) this.hireOv.visible = false;
    this.townLayerVisible(true);
    this.setCurrScreen(1);
  }

  private onLocationClick(i: number) {
    const loc = this.town.locations[i];
    sfxClick();
    switch (loc.category) {
      case 1:
        this.tradeWindow.show(this.town, loc);
        this.tradeWindow.screen.visible = true;
        this.screen.setChildIndex(this.tradeWindow.screen,this.screen.children.length-1);
        break;
      case 2:
        this.openHealPage(loc);
        break;
      case 4:
        this.openSchoolPage(loc);
        break;
      case 5:
        this.openPolicePage(loc);
        break;
      case 3: {
        const charId = loc.character ?? 1;
        this.gd.__dialogueChar = charId;
        if (!this.dlg) {
          this.dlg = new DialogueScreen(this.gd, this.ds, this.assets, () => { if (this.dlg) this.dlg.screen.visible = false; });
          this.screen.addChild(this.dlg.screen);
        }
        this.dlg.screen.visible = true;
        this.dlg.start(charId);
        this.screen.setChildIndex(this.dlg.screen, this.screen.children.length - 1);
        break;
      }
      default:
        this.stubNote("设施类别 " + loc.category + "（" + this.text(loc.name ?? 0) + "）— 下一阶段");
    }
  }

  private hideTrade() {
    this.tradeWindow.screen.visible = false;
  }

  // 消息提示（统一 YesNoDialogue 单按钮 OK，替代原零散 overlay）
  private msgDlg: YesNoDialogue | null = null;
  private stubNote(msg: string) {
    if (!this.msgDlg) {
      this.msgDlg = new YesNoDialogue(this.ds, this.assets, true);
      this.msgDlg.visible = false;
      this.screen.addChild(this.msgDlg);
    }
    this.msgDlg.show(msg);
  }

  private simpleBtn(label: string, x: number, y: number, fn: () => void): Sprite {
    const b = new Sprite();
    const g = new Graphics();
    g.lineStyle(1, 8222317);
    g.beginFill(0, 0.6);
    g.drawRect(0, 0, 200, 30);
    b.graphics = g;
    b.addChild(new EngineText(label, 16777215, 14, "center", 0, 5, 200, 20));
    b.x = x; b.y = y;
    b.addEventListener("click", fn);
    return b;
  }

  update(dt: number) {
    if (this.dlg?.screen.visible) this.dlg.update(dt);
    if(this.industryCalc?.ov.visible)this.industryCalc.sw?.update(dt);
    this.timeAcc += dt;
    if (this.timeAcc > 0.3) {
      this.timeAcc = 0;
      const c = this.gd.Caravans[0];
      const d = this.gd.makeDate();
      if (this.bottomCapacity) this.bottomCapacity.text = this.text(903).toUpperCase() + ": " + Math.round(c.totalCargo) + "/" + Math.round(c.maxCargo) + " " + this.text(12).toUpperCase();
      if (this.bottomMoney) this.bottomMoney.text = this.text(20).toUpperCase() + ": " + numberFormat(c.money, 2);
      // 原版日期格式：Day2d-Month-Year2d HH:MM（无前缀；此前误用 text(22) 状态前缀）
      if (this.bottomDate) this.bottomDate.text = d.Day2d + "-" + (d.MonthName || d.ShortMonthName) + "-" + d.Year2d + " " + d.Hour2d + ":" + d.Minute2d;
      // 原版：钱数居中于 载重文本 与 日期文本 之间（此前固定 x=10 与载重重叠）
      if (this.bottomCapacity && this.bottomMoney && this.bottomDate) {
        const capW = this.bottomCapacity.textWidth, dateW = this.bottomDate.textWidth, moneyW = this.bottomMoney.textWidth;
        this.bottomMoney.x = 10 + capW + (860 - capW - dateW) / 2 - moneyW / 2;
      }
    }
    // blueSign hover：原版 EF 每帧 hitTestPoint(fillSign) → alpha ±0.1（@25fps ≈ 2.5/s），上限 0.7
    // 原版 EF L1854-1858：tradeWindow/healingFacility/policeStation/school 任一可见 → cursorInfo 隐藏
    const ovVisible = this.dlg?.screen.visible || this.tradeWindow.screen.visible
      || (!!this.healOv && this.healOv.visible)
      || (!!this.schoolOv && this.schoolOv.visible)
      || (!!this.policeOv && this.policeOv.visible);
    if (ovVisible) {
      if (this.hoverInfo) { this.hoverInfo.visible = false; this.hoverInfo.alpha = 0; }
      // t101：交易窗口打开时驱动其内部悬停信息面板（原版 cursorControl enterFrame 每帧执行）
      if (this.tradeWindow.screen.visible) {
        this.tradeWindow.updateCursor();
        // t109：计算器开关滑块动画
        this.tradeWindow.updateFrame(dt);
      }
      return;
    }
    const mx = Input.mouseX, my = Input.mouseY;
    let overIdx = -1;
    for (let bi = 0; bi < this.blueSigns.length; bi++) {
      const bs = this.blueSigns[bi];
      bs.hit.visible = bs.fill.visible = bs.loc.visible !== false;
      const erase = bs.erase(); if (erase) erase.visible = bs.hit.visible;
      const over = bs.hit.visible && bs.hit.hitTestPoint(mx, my) !== null;
      if (over) overIdx = bi;
      const target = over ? 0.7 : 0;
      const a = bs.blue.alpha;
      bs.blue.alpha = a + Math.sign(target - a) * Math.min(Math.abs(target - a), 2.5 * dt);
      // alpha≈0 时隐藏，避免每帧离屏画布开销（erase 镂空渲染）
      bs.blue.visible = bs.hit.visible && bs.blue.alpha >= 0.02;
    }
    // 设施/人物名悬停显示（原版 EF L1892-1964 cursorInfo）
    // 名字取法（原版 L1894-1901）：category==3 && !forceName → Dialogues.characterNames[character]，
    // 否则设施名 name。人物 location 的 name=1（"角度"）不可直接翻译，必须走 characterNames。
    if (this.hoverInfo && this.hoverInfoText) {
      let name = "";
      if (overIdx >= 0) {
        const loc = this.town.locations[overIdx];
        if (loc) {
          const isPerson = loc.category === 3 && !loc.forceName;
          if (isPerson) {
            const cnId = this.ds.dialogues?.characterNames?.[String(loc.character ?? 0)];
            if (cnId) name = this.text(Number(cnId)).toUpperCase();
          }
          if (!name && loc.name) name = this.text(loc.name).toUpperCase();
        }
      }
      if (name) {
        this.hoverInfoText.text = name;
        // 原版 TownMode.as:1912-1919 先把字段宽收窄为 textWidth+10（居中靠它），L1951 再按
        // 框 = (x + width) + 10 × (y + height) + 5 画背景 → 宽 = textWidth+30、高 = 5+20+5 = 30。
        // 旧代码用 "left",8 + textWidth+10 的框：左留 8、右留 2、上留 5、下留 1，文字看着贴右下边（用户反馈）。
        this.hoverInfoText.width = this.hoverInfoText.textWidth + 10;
        const tw = this.hoverInfoText.textWidth + 30, th = 30;
        const g = this.hoverInfo.graphics;
        if (g) {
          g.clear();
          g.lineStyle(2, 3156000);
          g.beginFill(16776424);
          g.drawRect(0, 0, tw, th);
        } else {
          const ng = new Graphics();
          ng.lineStyle(2, 3156000);
          ng.beginFill(16776424);
          ng.drawRect(0, 0, tw, th);
          this.hoverInfo.graphics = ng;
        }
        // 跟随鼠标（原版 L1954-1963）：mouseX+20/mouseY+10，右下边界 875/490 钳制
        this.hoverInfo.x = mx + 20;
        this.hoverInfo.y = my + 10;
        if (this.hoverInfo.y + th > 490) this.hoverInfo.y = 490 - th;
        if (this.hoverInfo.x + tw > 875) this.hoverInfo.x = mx - tw - 10;
        this.hoverInfo.visible = true;
        this.hoverInfo.alpha = Math.min(1, this.hoverInfo.alpha + 0.2);
      } else {
        this.hoverInfo.visible = false;
        this.hoverInfo.alpha = 0;
      }
    }
  }

  // ---------- 统计页（原版 screens[2]：Theoretical / Recent Data / Your Industries） ----------
  private statsScreen = 0;
  private statsOv: Sprite | null = null;
  private renameIndustrialTown() {
    const ov=new Sprite(), g=new Graphics();g.beginFill(0,.5);g.drawRect(0,0,880,495);g.hitRect(0,0,880,495);ov.graphics=g;
    addDialogueBackground(ov,this.assets,190,148,500,200,.2,undefined,false);
    ov.addChild(new EngineText(this.text(1182)+":",0xffffff,14,"center",190,198,500,24));
    const input=document.createElement('input');input.value=this.town.name;input.maxLength=100;
    input.style.cssText='position:fixed;z-index:200;background:#b0a8a0;color:#403830;text-align:center;font:14px "Microsoft YaHei",Arial,sans-serif;box-sizing:border-box';
    const place=()=>{const r=document.querySelector('canvas')!.getBoundingClientRect();const s=Math.min(r.width/880,r.height/495);Object.assign(input.style,{left:(r.left+(r.width-880*s)/2+240*s)+'px',top:(r.top+(r.height-495*s)/2+228*s)+'px',width:400*s+'px',height:22*s+'px',fontSize:14*s+'px'});};
    const close=()=>{input.remove();window.removeEventListener('resize',place);this.screen.removeChild(ov);};
    const done=()=>{const name=input.value.trim();if(!name)return;const previous=this.town.name;this.town.altName=name;this.town.name=name;
      const refresh=(s:Sprite)=>{for(const child of s.children){if(child instanceof EngineText){if(child.text===previous)child.text=name;else if(child.text===previous.toUpperCase())child.text=name.toUpperCase();}if(child instanceof Sprite)refresh(child);}};refresh(this.screen);close();};
    for(const [label,x,fn] of [[1181,215,done],[634,465,close]] as const){const b=paperButton(this.assets,this.text(label),200,30,fn);b.x=x;b.y=298;ov.addChild(b);}
    input.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing)return;if(e.key==='Enter')done();if(e.key==='Escape')close();});input.addEventListener('keyup',e=>e.stopPropagation());
    this.screen.addChild(ov);document.body.appendChild(input);place();window.addEventListener('resize',place);input.focus();input.select();
  }
  private populationText!: EngineText;
  private wealthText!: EngineText;
  private statsButtons: Sprite[] = [];
  private statsFrames: Sprite[] = [];
  private statsSub: Sprite[] = [];
  private statsProdArea!: ScrollableArea;
  private recentDataGraph: ConsProdGraph | null = null;
  private playersGraph: ConsProdGraph | null = null;
  // 原版 GameData.itemCategoryNames（分类名文本 id）
  private static readonly ITEM_CATEGORY_NAMES: Record<string, number> = { food: 15, upperBodyClothing: 1413, lowerBodyClothing: 1414, shoes: 1306, hat: 1003 };

  private townLayerVisible(v: boolean) { if (this.townLayer) this.townLayer.visible = v; }

  private openStatsPage() {
    this.setCurrScreen(2); // ① categoryMarker 随屏（原版 L1637 y=buttonPositions[currScreen-1]）
    if (this.statsOv) {
      this.statsOv.visible = true;
      this.townLayerVisible(false);
      this.updateStats();
      return;
    }
    const ov = new Sprite();
    // 人口 / 经济力（原版 630 宽居中 @(10,52)/(10,82)）
    this.populationText = new EngineText("", 16777215, 14, "center", 10, 52, 630, 20);
    ov.addChild(this.populationText);
    this.wealthText = new EngineText("", 16777215, 14, "center", 10, 82, 630, 20);
    ov.addChild(this.wealthText);
    // 3 个切换按钮（t88 反馈6：bTexts=[6808,6809,1292]，200x20 FG 深棕锈斑纹理+文字擦除+黑框）
    const bTexts = [6808, 6809, 1292];
    const btnPos = [[10, 52], [440, 52], [10, 82]];
    for (let i = 0; i < 3; i++) {
      const b = new Sprite();
      b.blendMode = "layer";
      // FG InterfaceForeground×CT(0.3,0.2,0.1) 深棕锈斑，经 alpha 掩码裁成 200x20 按钮形状
      const putBtnFg = (img: HTMLImageElement | null) => {
        if (!img) return;
        const bb = new BitmapObject(img);
        bb.colorTransform = { r: 0.3, g: 0.2, b: 0.1 };
        bb.mouseEnabled = false;
        b.addChildAt(bb, 0);
        const bmask = new Sprite();
        bmask.blendMode = "alpha";
        const bmg = new Graphics();
        bmg.beginFill(16777215);
        bmg.drawRect(0, 0, 200, 20);
        bmask.graphics = bmg;
        bmask.mouseEnabled = false;
        b.addChild(bmask);
      };
      const btnFgNow = this.assets.getImage("InterfaceForeground.png");
      if (btnFgNow) putBtnFg(btnFgNow);
      else void this.assets.ensure("InterfaceForeground.png").then(putBtnFg);
      const t = new EngineText(this.text(bTexts[i]).toUpperCase(), 16777215, 14, "center", 0, 0, 200, 20);
      t.blendMode = "erase";
      b.addChild(t);
      b.x = btnPos[i][0]; b.y = btnPos[i][1];
      b.buttonMode = true;
      b.mouseChildren = false;
      // t84 反馈5：按钮自身无 graphics 且 mouseChildren=false → hitTestPoint 直接不命中，
      // 点击"近期数据"等统计按钮永不触发。补 hitRect 命中图形（不参与渲染）。
      const hg = new Graphics();
      hg.hitRect(0, 0, 200, 20);
      b.graphics = hg;
      const idx = i;
      b.addEventListener("click", () => { sfxClick(); this.statsScreen = idx; this.updateStatsPage(); });
      ov.addChild(b);
      this.statsButtons.push(b);
      const fr = new Sprite();
      const fg = new Graphics();
      fg.lineStyle(1, 0); // t88：原版红框 16711680 改黑框
      fg.drawRect(-3, -3, 206, 26);
      fr.graphics = fg;
      fr.mouseEnabled = false; // 选中框不拦截下方按钮点击
      fr.x = btnPos[i][0]; fr.y = btnPos[i][1];
      ov.addChild(fr);
      this.statsFrames.push(fr);
    }
    // 子屏 0/1/2
    this.statsSub = [];
    for (let i = 0; i < 3; i++) {
      const s = new Sprite();
      s.visible = i === 0;
      ov.addChild(s);
      this.statsSub.push(s);
    }
    // 子屏 0：理论生产/消耗表（原版 prodArea 620x320 @(10,132) + 表头）
    const areaFrame = new Sprite();
    const afg = new Graphics();
    afg.lineStyle(1, 0);
    afg.drawRect(-1, -1, 632, 322);
    areaFrame.graphics = afg;
    areaFrame.mouseEnabled = false; // 纯线条边框不拦截点击/滚轮
    areaFrame.x = 10; areaFrame.y = 132;
    this.statsSub[0].addChild(areaFrame);
    this.statsProdArea = new ScrollableArea(620, 320, 620, 320, true, false, false, 10, 10, this.assets); // t92 S25
    this.statsProdArea.x = 10; this.statsProdArea.y = 132;
    this.statsSub[0].addChild(this.statsProdArea);
    this.statsSub[0].addChild(new EngineText(this.text(1358).toUpperCase(), 16777215, 14, "left", 20, 112, 180, 20));
    this.statsSub[0].addChild(new EngineText(this.text(921).toUpperCase(), 16777215, 14, "center", 200, 112, 130, 20));
    this.statsSub[0].addChild(new EngineText(this.text(922).toUpperCase(), 16777215, 14, "center", 340, 112, 130, 20));
    this.statsSub[0].addChild(new EngineText(this.text(1415).toUpperCase(), 16777215, 14, "center", 480, 112, 130, 20));
    // 子屏 1/2：生产/消耗历史图（原版 ConsProdGraph(630,320,null,false/true,false) @(10,132)）
    this.recentDataGraph = new ConsProdGraph(630, 320, null, false, false,
      (id) => itemName(this.ds, id), (id) => this.text(id), (t) => this.gd.makeDate(t), this.assets); // t92 S3
    this.recentDataGraph.x = 10; this.recentDataGraph.y = 132;
    this.statsSub[1].addChild(this.recentDataGraph);
    this.playersGraph = new ConsProdGraph(630, 320, null, true, false,
      (id) => itemName(this.ds, id), (id) => this.text(id), (t) => this.gd.makeDate(t), this.assets); // t92 S3
    this.playersGraph.x = 10; this.playersGraph.y = 132;
    this.statsSub[2].addChild(this.playersGraph);
    const ink = new Sprite();
    ink.blendMode = "alpha"; ink.blendAtDisplayResolution = true;
    for (const child of [this.populationText, this.wealthText, this.statsSub[0]]) {
      ov.removeChild(child); ink.addChild(child);
    }
    const foreground = new Sprite();
    foreground.blendMode = "layer"; foreground.blendAtDisplayResolution = true;
    const putStatsTexture = (image: HTMLImageElement | null) => {
      if (!image) return;
      const bitmap = new BitmapObject(image);
      bitmap.colorTransform = {r: .3, g: .2, b: .1};
      bitmap.mouseEnabled = false; foreground.addChildAt(bitmap, 0);
    };
    const statsTexture = this.assets.getImage("InterfaceForeground.png");
    if (statsTexture) putStatsTexture(statsTexture);
    else void this.assets.ensure("InterfaceForeground.png").then(putStatsTexture);
    foreground.addChild(ink); ov.addChild(foreground);
    this.screen.addChild(ov);
    this.statsOv = ov;
    // IndustrialMagnate.as: only settlements with no remaining NPC industries.
    if(this.ds.gamedata.originalDlcFeatures?.['industrial-magnate'] && this.town.industries.length===0 && this.town.playersIndustries.length>0){
      const rename=paperButton(this.assets,this.text(1180).toUpperCase(),200,30,()=>this.renameIndustrialTown());rename.x=230;rename.y=50;ov.addChild(rename);
    }
    this.townLayerVisible(false);
    this.updateStats();
  }

  private closeStatsPage() {
    if (this.statsOv) this.statsOv.visible = false;
    this.townLayerVisible(true);
    this.setCurrScreen(1);
  }

  private updateStatsPage() {
    if (!this.statsOv) return;
    for (let i = 0; i < 3; i++) {
      this.statsFrames[i].visible = i === this.statsScreen;
      this.statsSub[i].visible = i === this.statsScreen;
    }
  }

  private updateStats() {
    if (!this.statsOv) return;
    this.populationText.text = this.text(1411).toUpperCase() + ": " + Math.max(this.town.population, 0);
    this.wealthText.text = this.text(1412).toUpperCase() + ": " + numberFormat(this.town.GDPperCapita ?? 0, 2);
    this.statsButtons[2].visible = this.town.playersIndustries.length > 0;
    if (!this.statsButtons[2].visible && this.statsScreen === 2) this.statsScreen = 0;
    this.updateStatsPage();
    // 理论表（原版 updateStats：categoryProducts 分类行 + productsList 物品行）
    this.statsProdArea.clearAll();
    const cp = this.town.getConsumptionProduction(this.ds);
    let y = 10;
    const addRow = (name: string, prod: number, cons: number) => {
      this.statsProdArea.addContent(new EngineText(name.toUpperCase(), 0, 14, "left", 10, y, 180, 20));
      this.statsProdArea.addContent(new EngineText(prod === 0 ? "-" : numberFormat(prod, 1, true), 0, 14, "center", 190, y, 130, 20));
      this.statsProdArea.addContent(new EngineText(cons === 0 ? "-" : numberFormat(cons, 1, true), 0, 14, "center", 330, y, 130, 20));
      const bal = numberFormat(prod - cons, 1, true);
      this.statsProdArea.addContent(new EngineText((prod > cons ? "+" : "") + bal, 0, 14, "center", 470, y, 130, 20));
      y += 20;
    };
    for (const cat of Object.keys(cp.categoryProducts ?? {})) {
      const row = cp.categoryProducts[cat];
      const nameId = TownMode.ITEM_CATEGORY_NAMES[cat] ?? 0;
      addRow(this.text(nameId), row.production, row.consumption);
    }
    for (const item of cp.productsList ?? []) {
      addRow(itemName(this.ds, item.item), item.production, item.consumption);
    }
    this.statsProdArea.updateSize();
    this.recentDataGraph?.update(this.town.historicalData, false);
    this.playersGraph?.update(this.town.historicalData, true);
  }

  // ---------- 产业页（原版 screens[4]：城镇产业 BUY / 玩家产业 Expand(1320)/Downsize(1323)/Sell(1328)） ----------
  private industriesOv: Sprite | null = null;
  private dlg: DialogueScreen | null = null;
  private industriesTab: "town" | "players" | "new" = "town";
  private industriesList!: ScrollableArea;
  private industriesStorageText!: EngineText;
  private industriesUnemployedText!: EngineText;
  private changingIndustry: any = null;

  get industriesPageVisible(): boolean { return !!this.industriesOv && this.industriesOv.visible; }

  private openIndustriesPage() {
    this.setCurrScreen(4); this.townLayerVisible(false);
    if(!this.industriesOv){this.industriesOv=new Sprite();this.screen.addChild(this.industriesOv);}
    this.industriesOv.visible=true;this.refreshIndustries();
  }
  private indName(ind:any,types:any[]):string {return this.text(types[ind.type]?.name??1291);}
  private industryPrice(ind:any):number {
    return this.town.industryPricePerUnit(ind.type,this.ds,this.gd.difficulty)*ind.employees*(ind.essential?3:1);
  }
  private newIndustryTypes():number[] {
    if(this.town.preset.stableEmployment)return [];
    const owned=new Set([...this.town.industries,...this.town.playersIndustries].map(i=>i.type));
    // Town.as possibleIndustries: all 46 recipes, plus any missing preset industry.
    return [...new Set([...Array.from({length:46},(_,i)=>i+1),...(this.town.preset.industries??[]).map((i:any)=>i.type)])]
      .filter(id=>!owned.has(id)&&!(id===21&&this.town.bannedGoods.includes(104))&&this.ds.industries.Types[id]);
  }
  private industryEssential(ind:any):boolean {
    const cp=this.town.getConsumptionProduction(this.ds,[ind]);
    return (this.ds.industries.Types[ind.type]?.production??[]).some((p:any)=>{
      const d=getItemData(this.ds,p.item),cat=(this.ds.gamedata.itemCategories??[]).find((key:string)=>d?.[key]);
      const entry=cat?cp.categoryProducts[cat]:cp.productsList.find(e=>e.item===p.item);
      return entry&&entry.consumption>entry.production;
    });
  }
  private industrySellable(ind:any):boolean {
    const cp=this.town.getConsumptionProduction(this.ds,[ind]);
    return (this.ds.industries.Types[ind.type]?.consumption??[]).every((p:any)=>{
      const e=cp.productsList.find(e=>e.item===p.item);return e&&e.production-e.consumption>=p.amount*ind.employees;
    });
  }
  private industryPurchaseAllowed(ind:any):boolean {
    // IndustrialMagnate.as onGameInit：同时开启 finishedTheGame 与 canBreakEconomy。
    const magnate=!!this.ds.gamedata.originalDlcFeatures?.['industrial-magnate'];
    return (ind.forSale&&!ind.essential)||magnate||((this.gd.story as any)?.finishedTheGame&&this.gd.canBreakEconomy);
  }
  private refreshIndustries() {
    const ov=this.industriesOv;if(!ov)return;ov.removeAll();
    const town=this.town,types=this.ds.industries.Types,c=this.gd.Caravans[0];
    for(const ind of [...town.industries,...town.playersIndustries]) (ind as any).maxSize=Math.max((ind as any).maxSize??0,ind.employees);
    if(town.unemployed<0){town.population-=town.unemployed;town.unemployed=0;}
    const selected=['town','players','new'].indexOf(this.industriesTab),g=new Graphics();
    g.lineStyle(1.5,0);g.moveTo(20+selected*209,92);g.lineTo(20,92);g.lineTo(20,452);g.lineTo(640,452);g.lineTo(640,92);g.lineTo(222+selected*209,92);g.lineTo(222+selected*209,72);
    g.curveTo(222+selected*209,62,212+selected*209,62);g.lineTo(30+selected*209,62);g.curveTo(20+selected*209,62,20+selected*209,72);g.lineTo(20+selected*209,92);ov.graphics=g;
    const text=(parent:Sprite,value:string,x:number,y:number,w:number,size=14,align='left')=>{
      const t=new EngineText(value,5259312,size,align,x,y,w,20);t.mouseEnabled=false;
      while(t.textWidth>w&&t.size>7)t.size-=.5;parent.addChild(t);return t;
    };
    [1293,1292,4171].forEach((id,i)=>{
      if(i===selected)text(ov,this.text(id).toUpperCase(),20+i*209,65,202,16,'center');
      else {const b=paperButton(this.assets,this.text(id).toUpperCase(),202,30,()=>{this.industriesTab=(['town','players','new'] as const)[i];this.refreshIndustries();},16,sfxPage,10);b.x=20+i*209;b.y=62;ov.addChild(b);}
    });
    const player=this.industriesTab==='players';
    if(player){
      this.industriesStorageText=text(ov,this.text(1317).toUpperCase()+': '+numberFormat(town.occupiedPlayersStorageSpace,1,true)+' / '+numberFormat(town.playersStorageSpace,0),40,112,270);
      text(ov,this.text(1318).toUpperCase()+': '+numberFormat(town.playersMoney,2)+' €',40,142,270);
      this.industriesUnemployedText=text(ov,this.text(1324).toUpperCase()+': '+town.unemployed,40,172,580,14,'center');
      [1319,1320,1321,1322].forEach((id,i)=>{if(![town.playersStorageSpace>0,!town.preset?.cantExpandStorage,town.playersIndustries.length>0,town.playersMoney>0][i])return;const b=paperButton(this.assets,this.text(id).toUpperCase(),150,20,()=>this.industryStorageAction(i));b.x=310+(i%2)*160;b.y=112+Math.floor(i/2)*30;ov.addChild(b);});
    }
    g.lineStyle(1,0);g.drawRect(40,player?202:112,580,player?230:320);
    const list=new ScrollableArea(570,player?230:320,570,player?230:320,true,false,false,10,10,this.assets);
    list.x=40;list.y=player?202:112;ov.addChild(list);this.industriesList=list;
    const entries:any[]=this.industriesTab==='town'?town.industries:player?town.playersIndustries:this.newIndustryTypes().map(type=>({type,employees:1,forSale:true}));
    if(!entries.length&&this.industriesTab==='new')text(list.Content,this.text(4179).toUpperCase(),10,10,550,14,'center');
    const symbols:Record<number,string>={"1":"IndustrySymbolInsectFarming.png","2":"IndustrySymbolSheepBreeding.png","3":"IndustrySymbolForageCultivation.png","4":"IndustrySymbolGoatBreeding.png","5":"IndustrySymbolCattleBreeding.png","6":"IndustrySymbolLeatherProduction.png","7":"IndustrySymbolShoesProduction.png","8":"IndustrySymbolLeatherJacketProduction.png","9":"filtericonwater.png","10":"IndustrySymbolCottonCultivation.png","11":"IndustrySymbolCottonProcessing.png","12":"IndustrySymbolWoolProcessing.png","13":"IndustrySymbolVestsProduction.png","14":"IndustrySymbolHatsProduction.png","15":"IndustrySymbolTrousersProduction.png","16":"IndustrySymbolLeatherVestsProduction.png","17":"IndustrySymbolOilDrilling.png","18":"IndustrySymbolOilRefinery.png","19":"IndustrySymbolJacketsProduction.png","20":"IndustrySymbolPharmaceutics.png","21":"IndustrySymbolAlcoholDistillery.png","22":"IndustrySymbolRobbery.png","23":"IndustrySymbolBeansCultivation.png","24":"IndustrySymbolMushroomsCultivation.png","25":"IndustrySymbolPotatoesCultivation.png","26":"IndustrySymbolCarrotsCultivation.png","27":"IndustrySymbolPeasCultivation.png","28":"IndustrySymbolTagelmust.png","29":"IndustrySymbolShirtsProduction.png","30":"IndustrySymbolGoatCheeseProduction.png","31":"IndustrySymbolSheepCheeseProduction.png","32":"IndustrySymbolCowCheeseProduction.png","33":"IndustrySymbolJerboaBreeding.png","34":"IndustrySymbolLizardBreeding.png","35":"IndustrySymbolSnakeBreeding.png","36":"IndustrySymbolCannabisCultivation.png","37":"IndustrySymbolHempTextileProduction.png","38":"IndustrySymbolSaltMining.png","39":"IndustrySymbolLyeProduction.png","40":"IndustrySymbolSoapProduction.png","41":"IndustrySymbolCandlesProduction.png","42":"IndustrySymbolTallowLubricantProduction.png","43":"IndustrySymbolPaperProduction.png","44":"IndustrySymbolLimestoneMining.png","45":"IndustrySymbolLimeKiln.png","46":"IndustrySymbolCementProduction.png"};
    entries.forEach((ind,i)=>{
      const t=types[ind.type];if(!t)return;const row=new Sprite(),frame=new Graphics();row.x=10;row.y=10+i*130;
      frame.lineStyle(1,0);frame.drawRect(0,0,550,120);row.graphics=frame;(row as any).height=120;
      const sign=paperInk(this.assets,80,100);sign.x=10;sign.y=10;row.addChild(sign);
      const put=(im:HTMLImageElement|null)=>{if(!im)return;const b=new BitmapObject(im);const scale=ind.type===9?1.08:.6;b.scaleX=b.scaleY=scale;b.x=40-im.width*scale/2;b.y=50-im.height*scale/2;b.blendMode='erase';b.mouseEnabled=false;sign.addChild(b);};
      if(symbols[ind.type]){const im=this.assets.getImage(symbols[ind.type]);if(im)put(im);else void this.assets.ensure(symbols[ind.type]).then(put);}
      text(row,this.indName(ind,types).toUpperCase(),100,9,440,16);
      text(row,this.text(this.industriesTab==='new'?1317:t.replaceEmployeesBySize?1316:1294).toUpperCase()+': '+(this.industriesTab==='new'?t.storagePerUnit??0:ind.employees),100,11,440,12,'right');
      text(row,this.text(1299).toUpperCase()+': '+numberFormat(town.industryTotalExpenses(ind.type,ind.employees,this.ds),2,true)+' €/'+this.text(941).toUpperCase(),100,31,440,12,'right');
      const recipe=(r:any[])=>r?.length?r.map(p=>itemName(this.ds,p.item).toUpperCase()+' x '+Math.round(p.amount*ind.employees*10)/10).join('; '):this.text(949).toUpperCase();
      text(row,this.text(922).toUpperCase()+': '+recipe(t.consumption),100,51,440,12,'right');
      text(row,this.text(921).toUpperCase()+': '+recipe(t.production),100,71,440,12,'right');
      const button=(id:number,x:number,w:number,fn:()=>void)=>{const b=paperButton(this.assets,this.text(id).toUpperCase(),w,20,fn);b.x=x;b.y=90;row.addChild(b);};
      if(player){
        if(this.industrySellable(ind))button(1328,100,140,()=>this.sellIndustry(ind,t));
        if(town.industryPricePerUnit(ind.type,this.ds,this.gd.difficulty)<=c.money)button(1320,250,140,()=>this.expandIndustry(ind,t));
        if(!t.cantDownsize)button(1323,400,140,()=>this.downsizeIndustry(ind,t));
      }else{
        if(this.industriesTab==='town')ind.essential=this.industryEssential(ind);
        // IndustrialMagnate.onGameInit 将 finishedTheGame 与 canBreakEconomy 同时置 true；
        // 直接以已加载的 DLC 功能作为同义兜底，兼容启用 DLC 后再读取旧存档的流程。
        const allowed=this.industryPurchaseAllowed(ind);
        const price=this.industryPrice(ind)*(this.industriesTab==='new'?3:1);
        if(allowed){
          text(row,this.text(1296).toUpperCase()+': '+numberFormat(price,2),100,90,240);
          if(c.money>=price)button(this.industriesTab==='new'?4172:1298,340,200,()=>this.industriesTab==='new'?this.createIndustry(ind.type,t,price):this.buyIndustryAction(ind,t));
          else text(row,this.text(1273).toUpperCase(),340,90,200,14,'right');
        }else text(row,this.text(1297).toUpperCase(),100,90,440,14,'right');
      }
      list.addContent(row);
    });list.updateSize();this.timeAcc=1;
  }
  private industryStorageAction(index:number){
    const t=this.town,c=this.gd.Caravans[0];
    if(index===0){this.tradeWindow.show(t,{category:1,subCategory:5,symbol:17,name:1317});this.screen.setChildIndex(this.tradeWindow.screen,this.screen.children.length-1);return;}
    if(index===1){this.openIndustryCalc(0,Math.floor(c.money/t.storagePrice),1330,()=>{this.indCalcRight.text=this.text(1331).replace('@money@',numberFormat(t.storagePrice*this.indCalcValue,0)+' €');},v=>{
      if(v<=0)return;this.indDlg(this.text(1333).replace('@capacity@',numberFormat(t.playersStorageSpace+v,0)+' '+this.text(12)),()=>{const price=t.storagePrice*v;if(price>c.money)return;c.money-=price;t.money+=price;t.playersStorageSpace+=v;this.refreshIndustries();});});return;}
    this.openIndustryCalc(0,index===2?c.money:t.playersMoney,index===2?1321:1322,null,v=>{
      if(index===2){v=Math.min(v,c.money);t.playersMoney+=v;c.money-=v;}else{v=Math.min(v,t.playersMoney);t.playersMoney-=v;c.money+=v;}this.refreshIndustries();
    });
  }

  // Shared original 23-key calculator (cash, storage, staffing and school).
  private industryCalc: CalculatorPanel | null = null;
  private indCalcInfo!: EngineText;
  private indCalcRight!: EngineText;
  private indCalcValue = 0;
  private indCalcMin = 0;
  private indCalcMax = 0;
  get indCalcVisible(): boolean {return !!this.industryCalc?.ov.visible;}
  get indCalcState():any{return {value:this.indCalcValue,min:this.indCalcMin,max:this.indCalcMax,info:this.indCalcInfo?.text,right:this.indCalcRight?.text};}
  private openIndustryCalc(min:number,max:number,infoId:number,onUpdate:(()=>void)|null,onDone:(v:number)=>void){
    const calc=this.industryCalc??=new CalculatorPanel(this.assets,id=>this.text(id));
    this.indCalcInfo=calc.info;this.indCalcRight=calc.right;this.indCalcMin=min;this.indCalcMax=max;
    if(calc.ov.parent)calc.close();
    calc.open(this.screen,min,max,v=>onDone(v),()=>{this.indCalcValue=calc.v;onUpdate?.();},this.text(infoId).toUpperCase());calc.setValue(min);
  }

  private indMsg: YesNoDialogue | null = null;
  private indConfirm: YesNoDialogue | null = null;
  private indDlg(text: string, onOk: (() => void) | null, onCancel: (() => void) | null = null) {
    const twoBtn = !!(onOk || onCancel);
    const d = twoBtn
      ? (this.indConfirm ?? (this.indConfirm = new YesNoDialogue(this.ds, this.assets, false)))
      : (this.indMsg ?? (this.indMsg = new YesNoDialogue(this.ds, this.assets, true)));
    if (d.parent !== this.screen) this.screen.addChild(d);
    d.visible = false;
    d.show(text, onOk ?? undefined, onCancel ?? undefined);
  }
  get indDlgVisible(): any {
    return {
      msg: this.indMsg ? this.indMsg.visible : false,
      msgText: this.indMsg && this.indMsg.text ? this.indMsg.text.text : "",
      confirm: this.indConfirm ? this.indConfirm.visible : false,
      confirmText: this.indConfirm && this.indConfirm.text ? this.indConfirm.text.text : "",
    };
  }

  private fmt(n: number): string { return Math.round(n).toLocaleString(); }
  // 底部状态栏钱数：两位小数（原版 CaravanMenu.as L7250 bottomLineMoney.text = money.toFixed(2)）
  private fmtMoney(n: number): string {
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  // ---------- BUY（原版 buyIndustry：确认 1315 → 全价 pricePerUnit×雇员×essential 结算） ----------
  private buyIndustryAction(ind: any, t: any) {
    const c = this.gd.Caravans[0];
    const price = this.industryPrice(ind);
    const name = this.indName(ind, this.ds.industries?.Types ?? []);
    this.indDlg(this.text(1315).replace("@industry@", name).toUpperCase(), () => {
      if (c.money < price) { this.indDlg(this.text(1350).replace("@money@", this.fmt(price - c.money) + " €").toUpperCase(), null); return; }
      c.money -= price;
      const i = this.town.industries.indexOf(ind);
      if (i >= 0) this.town.industries.splice(i, 1);
      this.town.playersIndustries.push(ind);
      this.town.playersStorageSpace += (t.storagePerUnit ?? 0) * (ind.employees ?? 0);
      this.refreshIndustries();
    });
  }

  // ---------- 新创产业（原版 startingIndustry：price*3 确认，town==20/17 解锁，加入 playersIndustries） ----------
  private createIndustry(type: number, t: any, price: number) {
    const c = this.gd.Caravans[0];
    const name = this.text(t.name).toUpperCase();
    this.indDlg(this.text(4174).replace("@industry@", name).toUpperCase() + " (" + this.fmt(price) + " €)", () => {
      if (c.money < price) { this.indDlg(this.text(1350).replace("@money@", this.fmt(price - c.money) + " €").toUpperCase(), null); return; }
      c.money -= price;
      this.town.money = (this.town.money ?? 0) + price;
      this.town.playersIndustries.push({ type, volume: 1, employees: 1 });
      this.town.unemployed--;this.town.playersStorageSpace+=t.storagePerUnit??0;
      const unlock=this.town.id===20?0:this.town.id===17?1:-1;if(unlock>=0&&this.town.locations[unlock])this.town.locations[unlock].visible=true;
      this.refreshIndustries();
    });
  }

  // ---------- Expand（原版 expandIndustry L1254：1330 输入 → 1331 成本预览 → 1332 确认 → employees±/钱∓/失业∓/存储±） ----------
  private expandIndustry(ind: any, t: any) {
    const c = this.gd.Caravans[0];
    const ppu = this.town.industryPricePerUnit(ind.type, this.ds, this.gd.difficulty);
    const maxExpand = Math.min(32767, Math.floor(c.money / (ppu || 1)));
    this.changingIndustry = ind;
    this.openIndustryCalc(0, maxExpand, 1330,
      () => {
        const v = this.indCalcValue;
        if (v > 0 && v <= this.indCalcMax) this.indCalcRight.text = this.text(1331).replace("@money@", this.fmt(ppu * v) + " €").toUpperCase();
        else this.indCalcRight.text = "";
      },
      (v) => {
        if (v <= 0) return;
        const name = this.indName(ind, this.ds.industries?.Types ?? []);
        this.indDlg(this.text(1332).replace("@industryname@", name).replace("@number@", String(v)).replace("@price@", this.fmt(ppu * v) + " €").toUpperCase(), () => {
          if(c.money<ppu*v)return;
          ind.employees += v;
          this.town.unemployed -= v;
          const cost = ppu * v;
          c.money -= cost;
          this.town.money = (this.town.money ?? 0) + cost;
          this.town.playersStorageSpace += (t.storagePerUnit ?? 0) * v;
          this.refreshIndustries();
        });
      });
  }

  // ---------- Downsize（原版 downsizeIndustry L1169：1326 → 1325 退款预览 → 存储检查 3398 / 确认 1327 → 35% 退款） ----------
  private downsizeIndustry(ind: any, t: any) {
    const c = this.gd.Caravans[0];
    const ppu = this.town.industryPricePerUnit(ind.type, this.ds, this.gd.difficulty);
    this.changingIndustry = ind;
    this.openIndustryCalc(0, ind.employees ?? 0, 1326,
      () => {
        const v = this.indCalcValue;
        if (v > 0 && v <= this.indCalcMax) this.indCalcRight.text = this.text(1325).replace("@money@", this.fmt(ppu * v * 0.35) + " €").toUpperCase();
        else this.indCalcRight.text = "";
      },
      (v) => {
        if (v <= 0) return;
        const spu = t.storagePerUnit ?? 0;
        const remaining = this.town.playersStorageSpace - spu * v - this.town.occupiedPlayersStorageSpace;
        if (remaining < 0) {
          const need = 0 - remaining;
          this.indDlg(this.text(3398).replace("@number@", String(v)).replace("@weight@", numberFormat(need, 1, true) + " " + this.text(12).toUpperCase()).replace("@expand@", String(Math.ceil(need))).replace("@downsize@", String(Math.floor((this.town.playersStorageSpace - this.town.occupiedPlayersStorageSpace) / (spu || 1)))).toUpperCase(), null);
          return;
        }
        const name = this.indName(ind, this.ds.industries?.Types ?? []);
        this.indDlg(this.text(1327).replace("@industryname@", name).replace("@number@", String(v)).toUpperCase(), () => {
          ind.employees -= v;
          this.town.unemployed += v;
          const refund = ppu * v * 0.35;
          c.money += refund;
          this.town.money = Math.max(0, (this.town.money ?? 0) - refund);
          if ((ind.employees ?? 0) <= 0) {
            const i = this.town.playersIndustries.indexOf(ind);
            if (i >= 0) this.town.playersIndustries.splice(i, 1);
          }
          this.town.playersStorageSpace -= spu * v;
          this.refreshIndustries();
        });
      });
  }

  // ---------- Sell（原版 sellIndustry L1310：存储检查 4283 / 确认 1329 → 55% 回收） ----------
  private sellIndustry(ind: any, t: any) {
    const c = this.gd.Caravans[0];
    const spu = t.storagePerUnit ?? 0;
    const remaining = this.town.playersStorageSpace - spu * (ind.employees ?? 0) - this.town.occupiedPlayersStorageSpace;
    const gender = c.People[0]?.gender ?? 1;
    if (remaining < 0) {
      this.indDlg(getText(this.ds, 4283, this.ds.language, gender).replace("@weight@", numberFormat(0 - remaining, 1, true) + " " + this.text(12).toUpperCase()).replace("@expand@", String(Math.ceil(0 - remaining))).toUpperCase(), null);
      return;
    }
    const price55 = this.industryPrice(ind) * 0.55;
    const name = this.indName(ind, this.ds.industries?.Types ?? []);
    this.indDlg(getText(this.ds, 1329, this.ds.language, gender).replace("@industryname@", name).replace("@money@", this.fmt(price55) + " €").toUpperCase(), () => {
      this.town.money = Math.max(0, (this.town.money ?? 0) - price55);
      c.money += price55;
      this.town.industries.push(ind);
      const i = this.town.playersIndustries.indexOf(ind);
      if (i >= 0) this.town.playersIndustries.splice(i, 1);
      this.town.playersStorageSpace -= spu * (ind.employees ?? 0);
      this.refreshIndustries();
    });
  }

  // 测试钩子：产业页状态快照（smoke S8p 断言用）
  industryDebug(): any {
    const types: any[] = this.ds.industries?.Types ?? [];
    const pi = this.town.playersIndustries.map((ind: any) => {
      const t = types[ind.type];
      return {
        type: ind.type, employees: ind.employees ?? 0, volume: ind.volume ?? 0,
        storagePerUnit: t ? (t.storagePerUnit ?? 0) : 0,
        pricePerUnit: this.town.industryPricePerUnit(ind.type, this.ds, this.gd.difficulty),
        totalPrice: this.town.industryTotalPrice(ind.type, ind.employees ?? 0, this.ds, this.gd.difficulty),
        totalExpenses: this.town.industryTotalExpenses(ind.type, ind.employees ?? 0, this.ds),
        replaceEmployeesBySize: !!(t && t.replaceEmployeesBySize), cantDownsize: !!(t && t.cantDownsize),
      };
    });
    const ti = this.town.industries.map((ind: any) => {
      const t = types[ind.type];
      return { type: ind.type, employees: ind.employees ?? 0, forSale: !!ind.forSale, pricePerUnit: this.town.industryPricePerUnit(ind.type, this.ds, this.gd.difficulty) };
    });
    return {
      tab: this.industriesTab,
      pageVisible: this.industriesPageVisible,
      money: this.gd.Caravans[0].money,
      townMoney: this.town.money,
      unemployed: this.town.unemployed,
      playersStorageSpace: this.town.playersStorageSpace,
      occupiedStorage: this.town.occupiedPlayersStorageSpace,
      electricityPrice: this.town.electricityPrice,
      playersIndustries: pi,
      townIndustries: ti,
      calc: this.indCalcVisible ? this.indCalcState : null,
      dlg: this.indDlgVisible,
    };
  }

  // ---------- 雇人页 ----------
  private hireOv: Sprite | null = null;
  private hireNoPeopleText: EngineText | null = null;
  private hireList: ScrollableArea | null = null;

  private ensureTownPeople() {
    this.town.ensureHirePeople(this.ds);
    for (const p of this.town.people ?? []) {
      const relation = this.gd.getFactionRelations(0, p.faction);
      if (!p.wasInPlayersCaravan) p.morale = Math.max(1, Math.min(40 + Math.random() * 20 + relation / 10, 100));
      p.recalculateSalary(relation);
    }
  }

  private hireTarget: any = null;
  private hireNameText!: EngineText;
  private hireSalaryText!: EngineText;
  private hireInfoText!: EngineText;
  private hireBtn!: Sprite;
  private hirePhotoArea!: Sprite;
  private hirePortrait: Sprite | null = null;
  // t84 反馈3：属性行容器（原版 screens[3] 详情区完整属性 15+ 行，深棕 5259312 14 号）
  private hireAttrArea: ScrollableArea | null = null;

  private openHirePage() {
    this.setCurrScreen(3); // ① categoryMarker 随屏
    this.ensureTownPeople();
    this.townLayerVisible(false); // t88 反馈4：内容替换（隐藏城镇贴图，透出 TownBG 羊皮纸底），无全屏黑幕遮罩
    if (this.hireOv) { this.hireOv.visible = true; this.renderHirePage(); return; }
    const ov = new Sprite();
    // t84 反馈3：删除顶部"雇用"标题(1263)与"乘客:1/0"(899)——原版 screens[3] 无这些元素
    // t93 原版 screens[3] 布局坐标：照片 PhotoBG(20,62)+portrait(30,72)、name(310,71)、salary(310,112)、hireButton(375,142)、
    // infoArea(310,172)、peopleList List(620)@(20,352)、1619 居中(20,231)
    // 照片区（PhotoBG 占位 + 选中头像）
    const photoArea = new Sprite();
    const ptBg = this.assets.getImage("PhotoBG.png");
    const putPhoto = (img: HTMLImageElement | null) => { if (img) { const b = new BitmapObject(img); b.x = 20; b.y = 62; photoArea.addChildAt(b, 0); } };
    if (ptBg) putPhoto(ptBg); else void this.assets.ensure("PhotoBG.png").then(putPhoto);
    // 线框（原版 frames lineStyle(1.5,0)：310,62,330,40 / 310,172,330,160 / 20,62,270,270 / 20,352,620,100）
    const frame = new Sprite();
    const fg = new Graphics();
    fg.lineStyle(1.5, 0);
    fg.drawRect(310, 62, 330, 40);
    fg.drawRect(310, 172, 330, 160);
    fg.drawRect(20, 62, 270, 270);
    fg.drawRect(20, 352, 620, 100);
    frame.graphics = fg;
    frame.mouseEnabled = false;
    photoArea.addChild(frame);
    photoArea.mouseEnabled = false;
    ov.addChild(photoArea);
    this.hirePhotoArea = photoArea;
    // 姓名/薪水（t84：文本改深棕 5259312=0x504030，与原版城镇标题/属性行一致）
    this.hireNameText = new EngineText("", 5259312, 14, "center", 310, 71, 330, 20);
    ov.addChild(this.hireNameText);
    this.hireSalaryText = new EngineText("", 5259312, 13, "center", 310, 112, 330, 20);
    ov.addChild(this.hireSalaryText);
    // 详情属性区：原版 infoArea=ScrollableArea(320,160)@(310,172)，15+ 行属性+技能，深棕 14 号
    const attrArea = new ScrollableArea(320, 160, 320, 160, true, false, false, 10, 10, this.assets); // t92 S26
    attrArea.x = 310; attrArea.y = 172;
    attrArea.mouseEnabled = true;
    ov.addChild(attrArea);
    this.hireAttrArea = attrArea;
    this.hireInfoText = new EngineText("", 5259312, 14, "center", 310, 142, 330, 24);
    ov.addChild(this.hireInfoText);
    this.hireInfoText.visible = false; // 兼容旧引用；实际渲染走 attrArea
    // t84 反馈3：雇用按钮=深棕锈斑纹理（layer + InterfaceForeground×CT(0.3,0.2,0.1) + alpha 掩码 200x20 + erase 文字），
    // 与原版 tempDisp 按钮语义一致（T 83 考古：beginFill(0) layer+erase 文字 → 按钮区=锈斑纹理）
    const hireBtn = new Sprite();
    hireBtn.blendMode = "layer";
    const putHireFg = (img: HTMLImageElement | null) => {
      if (!img) return;
      const bb = new BitmapObject(img);
      bb.colorTransform = { r: 0.3, g: 0.2, b: 0.1 };
      bb.mouseEnabled = false;
      hireBtn.addChildAt(bb, 0);
      const bmask = new Sprite();
      bmask.blendMode = "alpha";
      const bmg = new Graphics();
      bmg.beginFill(16777215);
      bmg.drawRect(0, 0, 200, 20);
      bmask.graphics = bmg;
      bmask.mouseEnabled = false;
      hireBtn.addChild(bmask);
    };
    const hFgNow = this.assets.getImage("InterfaceForeground.png");
    if (hFgNow) putHireFg(hFgNow);
    else void this.assets.ensure("InterfaceForeground.png").then(putHireFg);
    const hg2 = new Graphics();
    hg2.hitRect(0, 0, 200, 20);
    hireBtn.graphics = hg2; // 命中区（不渲染）
    const hTxt = new EngineText(this.text(1272).toUpperCase(), 16777215, 13, "center", 0, 2, 200, 16);
    hTxt.blendMode = "erase"; // 文字挖洞透羊皮纸底（原版 erase 语义）
    hireBtn.addChild(hTxt);
    hireBtn.x = 375; hireBtn.y = 142;
    hireBtn.buttonMode = true;
    hireBtn.mouseChildren = false;
    hireBtn.addEventListener("click", () => { if (this.hireTarget) { this.hirePerson(this.hireTarget); this.renderHirePage(); } });
    hireBtn.visible = false;
    ov.addChild(hireBtn);
    this.hireBtn = hireBtn;
    // 无可雇之人 1619 居中（原版 @20,231,600,20）——t84：深棕
    this.hireNoPeopleText = new EngineText(this.text(1619), 5259312, 14, "center", 20, 231, 600, 20);
    this.hireNoPeopleText.visible = false;
    ov.addChild(this.hireNoPeopleText);
    // peopleList List(620)@(20,352)（原版 List，可点选）
    const list = new ScrollableArea(620, 90, 620, 90, false, true, false, 10, 10, this.assets); // t92 L15 雇人列表
    list.x = 20; list.y = 352;
    ov.addChild(list);
    this.hireList = list;
    this.screen.addChild(ov);
    this.hireOv = ov;
    this.renderHirePage();
  }

  private renderHirePage() {
    if(!this.hireOv||!this.hireList)return;
    const people:Character[]=this.town.people??[],list=this.hireList;list.clearAll();
    if(!people.includes(this.hireTarget))this.hireTarget=people[0]??null;
    const p=this.hireTarget as Character|null,c=this.gd.Caravans[0];
    if(this.hireNoPeopleText)this.hireNoPeopleText.visible=!p;
    for(const part of [this.hirePhotoArea,this.hireNameText,this.hireSalaryText,this.hireAttrArea,list])if(part)part.visible=!!p;
    this.hireBtn.visible=!!p&&p.salary<=c.money&&this.gd.getFactionRelations(p.faction,0)>-20;
    this.hireInfoText.visible=!!p&&!this.hireBtn.visible;
    if(p){
      this.hireNameText.text=p.name.toUpperCase();this.hireSalaryText.text=this.text(988)+': '+Math.round(p.salary)+' / '+this.text(942);
      this.hireInfoText.text=this.gd.getFactionRelations(p.faction,0)<=-20?getText(this.ds,6798,this.ds.language,p.gender):this.text(1273).toUpperCase();
    }
    if(this.hirePortrait){this.hirePhotoArea.removeChild(this.hirePortrait);this.hirePortrait=null;}
    if(p){const port=buildPortraitFromCharacter(this.assets,p,1);port.x=30;port.y=72;port.mouseEnabled=false;this.hirePhotoArea.addChild(port);this.hirePortrait=port;}
    const aa=this.hireAttrArea!;aa.clearAll();
    if(p){
      const rows:Array<[number,string|number,number]>=[
        [944,p.basePhysical,10],[945,p.baseAgility,30],[946,p.baseAccuracy,50],[947,p.baseIntelligence,70],
        [6797,Math.round(this.gd.getFactionRelations(0,p.faction)),100],[984,Math.round(p.totalExperience),130],
        [985,Math.round(p.generalBattleExperience),150],[1095,Math.round(p.maxAP),180],[6,Math.round(p.speed*10)/10,200],
        [1271,Math.round(p.capacity),230],[966,Math.round(p.learningCapacity*100),260],
      ];
      // 原版 Character.as 将这些项目全部暴露为属性 getter；Web 中医生/兽医/机械/
      // 打猎/收集仍是方法，直接读取会得到 Function，参与乘法后显示 NaN。
      Character.skillsList.forEach((skill,i)=>{
        rows.push([skill.name,Math.round(p.skillValue(skill.skill)*(skill.skill==='painThreshold'?100:1)),290+i*20]);
      });
      const tail=290+Character.skillsList.length*20;
      rows.push([996,Math.round(p.weight),tail+10],[997,Math.round(p.weight/p.idealWeight*100),tail+30],
        [998,Math.round(p.GDA)+' '+this.text(939),tail+60],[999,Math.round(p.waterConsumption*1000)/1000+' '+this.text(11),tail+80],[50,Math.round(p.HP)+' / '+Math.round(p.maxHP),tail+110]);
      rows.forEach(([id,value,y])=>{const row=new Sprite();row.y=y;row.mouseEnabled=false;
        const label=new EngineText(this.text(id),5259312,14,'left',10,0,300,20),v=new EngineText(String(value),5259312,14,'right',10,0,300,20);label.mouseEnabled=v.mouseEnabled=false;row.addChild(label);row.addChild(v);aa.addContent(row);});
    }aa.updateSize();
    people.forEach((person,i)=>{const cell=makePersonCell(this.assets,this.ds,person,{cellW:70,selected:person===p,picBGColor:9472128,selectFrameColor:5261376,selectFrameSize:2,selectFrameAlpha:1,onClick:()=>{sfxClick();this.hireTarget=person;this.renderHirePage();}});cell.mouseChildren=false;cell.x=10+i*80;cell.y=10;list.addContent(cell);});list.updateSize();this.timeAcc=1;
  }

  // 原版 hirePerson：money -= salary（非 ×3！），payDay=Time+604800，addPerson，town.people splice，population--
  private hirePerson(p: any) {
    const c = this.gd.Caravans[0];
    if (p instanceof Character) p.recalculateSalary(this.gd.getFactionRelations(p.faction,0));
    const fee = Math.max(0,Number(p.salary)||0);
    if (c.money < fee || this.gd.getFactionRelations(p.faction,0)<=-20 || !this.town.people?.includes(p)) return;
    sfxCashRegister();
    c.money -= fee;
    const hired = p instanceof Character ? p : new Character(p);
    hired.category=2; hired.payDay=this.gd.Time+604800;
    c.addPerson(hired);
    const people: any[] = (this.town as any).people ?? [];
    const i = people.indexOf(p);
    if (i >= 0) people.splice(i, 1);
    this.town.population = Math.max(0, (this.town.population ?? 0) - 1);
    this.town.unemployed=Math.max(0,this.town.unemployed);
    this.timeAcc=1;
  }

  // 医疗设施由城镇入口与剧情对话共享。
  private healingFacility: HealingFacility | null = null;
  private get healOv() { return this.healingFacility?.screen ?? null; }
  private openHealPage(loc: any) {
    const facility = this.healingFacility ?? (this.healingFacility = new HealingFacility(this.gd, this.ds, this.assets));
    if (facility.screen.parent !== this.screen) this.screen.addChild(facility.screen);
    facility.show(loc, this.town);
    this.screen.setChildIndex(facility.screen, this.screen.children.length - 1);
  }
  healDebug() { return this.healingFacility?.healDebug() ?? { pageVisible: false }; }

  // ---------- 学校（原版 School.as：入学 → 按游戏天推进 → 毕业/辍学） ----------
  private schoolOv: Sprite | null = null;
  private schoolLoc: any = null;
  private schoolPrice = 1000;
  private schoolPeopleList!: ScrollableArea;
  private schoolStudyList!: ScrollableArea;
  private schoolExpText!: EngineText;

  private openSchoolPage(loc: any) {
    if (!loc.people) loc.people = [];
    this.schoolLoc = loc;
    this.schoolPrice = loc.price ?? 1000;
    if (this.schoolOv) { this.schoolOv.visible = true; this.renderSchool(); return; }
    const ov = new Sprite();
    ov.x = 120; ov.y = 60;
    // 面板 Dialogue 风格背景（640x380：纹理随机偏移 0..240 / 0..115）
    addDialogueBackground(ov, this.assets, 0, 0, 640, 380, 0.45);
    const g = new Graphics();
    g.hitRect(0, 0, 640, 380);
    ov.graphics = g;
    ov.addChild(new EngineText((loc.name ? this.text(loc.name) : "SCHOOL").toUpperCase(), 16777215, 18, "center", 20, 14, 600, 26));
    ov.addChild(new EngineText(this.text(1296).toUpperCase() + ": " + this.fmt(this.schoolPrice) + " € / " + this.text(941).toUpperCase(), 13158600, 12, "center", 20, 42, 600, 18));
    // 左：可入学人员（index≠0 且 category 1/2，原版 update()）
    ov.addChild(new EngineText(this.text(894).toUpperCase() + ":", 13158600, 11, "left", 40, 70, 240, 16));
    this.schoolPeopleList = new ScrollableArea(240, 190, 240, 190, true, false, false, 10, 10, this.assets); // t92 L13
    this.schoolPeopleList.x = 40; this.schoolPeopleList.y = 88;
    ov.addChild(this.schoolPeopleList);
    // 右：在读学员（2894 Currently Studying）
    ov.addChild(new EngineText(this.text(2894).toUpperCase(), 13158600, 11, "left", 360, 70, 240, 16));
    this.schoolStudyList = new ScrollableArea(240, 190, 240, 190, true, false, false, 10, 10, this.assets); // t92 L14
    this.schoolStudyList.x = 360; this.schoolStudyList.y = 88;
    ov.addChild(this.schoolStudyList);
    // 经验展示（2887 Experiences Gained）
    this.schoolExpText = new EngineText("", 16777215, 11, "left", 40, 300, 560, 30, true);
    ov.addChild(this.schoolExpText);
    const close = new Button(2, () => { this.schoolOv!.visible = false; }, this.text(902).toUpperCase(), this.assets);
    close.x = 520; close.y = 330;
    ov.addChild(close);
    this.screen.addChild(ov);
    this.schoolOv = ov;
    this.renderSchool();
  }

  private schoolExpName(exp: string): string {
    if (exp === "generalBattleExperience") return this.text(985).toUpperCase();
    return String(exp ?? "?").replace("Experience", "").toUpperCase();
  }

  private renderSchool() {
    if (!this.schoolOv || !this.schoolLoc) return;
    const c = this.gd.Caravans[0];
    const loc = this.schoolLoc;
    this.schoolPeopleList.clearAll();
    this.schoolStudyList.clearAll();
    // 可入学人员
    const valid = c.People.filter((p: any, i: number) => i !== 0 && (p.category === 1 || p.category === 2));
    let y = 0;
    for (const p of valid) {
      const row = new Sprite();
      row.y = y;
      row.addChild(new EngineText((p.name || "?").toUpperCase(), 16777215, 12, "left", 0, 3, 150, 18));
      const btn = new Sprite();
      const bg = new Graphics();
      bg.lineStyle(1, 8222317);
      bg.beginFill(0, 0.5);
      bg.drawRect(0, 0, 64, 22);
      bg.hitRect(0, 0, 64, 22);
      btn.graphics = bg;
      btn.addChild(new EngineText(this.text(1292).toUpperCase(), 13158600, 10, "center", 0, 3, 64, 16));
      btn.x = 158;
      const person = p;
      btn.addEventListener("click", () => { sfxClick(); this.schoolSelectPerson(person); });
      row.addChild(btn);
      this.schoolPeopleList.addContent(row);
      y += 28;
    }
    // 在读学员（点击=接回：已完成直接毕业，未完成弹弃学确认 2893）
    y = 0;
    for (const p of loc.people ?? []) {
      const row = new Sprite();
      row.y = y;
      const rowBg = new Graphics();
      rowBg.hitRect(0, 0, 240, 26); // 整行可点击（接回学员）
      row.graphics = rowBg;
      const end = (p.startedStudying ?? 0) + (p.studyTime ?? 0);
      const done = end <= this.gd.Time;
      const d = this.gd.makeDate(end);
      const status = done
        ? "-=" + this.text(2891).toUpperCase() + "=-"
        : this.text(2890).toUpperCase() + " " + d.Day + "-" + d.ShortMonthName + "-" + d.Year2d + " " + d.Hour2d + ":" + d.Minute2d;
      row.addChild(new EngineText((p.name || "?").toUpperCase() + "  " + status, 16777215, 11, "left", 0, 3, 240, 18, true));
      row.buttonMode = true;
      const person = p;
      row.addEventListener("click", () => { sfxClick(); this.schoolSelectStudying(person); });
      this.schoolStudyList.addContent(row);
      y += 28;
    }
    this.schoolPeopleList.updateSize();
    this.schoolStudyList.updateSize();
    const exps = (loc.studies ?? []).map((s: any) => this.schoolExpName(s.experience) + " X " + s.amount);
    this.schoolExpText.text = this.text(2887).toUpperCase() + ": " + (exps.length ? exps.join(", ") : this.text(949).toUpperCase());
  }

  // 选人入学：maxTime = ⌊钱/price⌋；0 → 1273；1 → 直接确认 2889；多天 → 计算器 2888 → 确认
  private schoolSelectPerson(p: any) {
    const c = this.gd.Caravans[0];
    const price = this.schoolPrice;
    const maxTime = Math.floor(c.money / (price || 1));
    if (maxTime <= 0) { this.indDlg(this.text(1273).toUpperCase(), null); return; }
    const enroll = (days: number) => {
      this.indDlg(this.tpl(getText(this.ds, 2889, this.ds.language, p.gender ?? 1), {
        "@name@": p.name || "?", "@名字@": p.name || "?", "@days@": String(days), "@money@": this.fmt(price * days) + " €",
      }).toUpperCase(),
        () => this.schoolSendToStudy(p, days));
    };
    if (maxTime === 1) { enroll(1); return; }
    this.openIndustryCalc(1, maxTime, 2888,
      () => {
        const v = this.indCalcValue;
        if (v > 0 && v <= this.indCalcMax) this.indCalcRight.text = this.text(1296).toUpperCase() + ": " + this.fmt(v * price) + " €";
        else this.indCalcRight.text = "";
      },
      (v) => { if (v > 0) enroll(v); });
  }

  private schoolSendToStudy(p: any, days: number) {
    const c = this.gd.Caravans[0];
    c.removePerson(c.People.indexOf(p));
    this.schoolLoc.people.push(p);
    p.studyTime = days * 86400;
    p.startedStudying = this.gd.Time;
    c.money -= this.schoolPrice * days;
    this.renderSchool();
  }

  private schoolSelectStudying(p: any) {
    if ((p.startedStudying ?? 0) + (p.studyTime ?? 0) < this.gd.Time) { this.schoolTakeBack(p); return; }
    this.indDlg(this.tpl(getText(this.ds, 2893, this.ds.language, p.gender ?? 1), { "@name@": p.name || "?", "@名字@": p.name || "?" }).toUpperCase(), () => this.schoolTakeBack(p));
  }

  // 接回：经验 += amount × 实际天数 × learningCapacity（辍学按实际耗时比例）
  private schoolTakeBack(p: any) {
    const c = this.gd.Caravans[0];
    const end = (p.startedStudying ?? 0) + (p.studyTime ?? 0);
    const elapsed = this.gd.Time > end ? (p.studyTime ?? 0) : Math.max(0, this.gd.Time - (p.startedStudying ?? 0));
    const lc = typeof p.learningCapacity === "number" ? p.learningCapacity : (p.intelligence ?? 10) * 10;
    for (const st of this.schoolLoc.studies ?? []) {
      p[st.experience] = (p[st.experience] ?? 0) + st.amount * elapsed / 86400 * lc;
    }
    p.startedStudying = undefined;
    p.studyTime = undefined;
    const i = this.schoolLoc.people.indexOf(p);
    if (i >= 0) this.schoolLoc.people.splice(i, 1);
    c.addPerson(p);
    this.renderSchool();
  }

  // 占位符替换（中文文本用 @名字@，英文用 @name@，统一替换）
  private tpl(text: string, pairs: Record<string, string>): string {
    let out = text;
    for (const k of Object.keys(pairs)) out = out.split(k).join(pairs[k]);
    return out;
  }

  // 学校页刷新（存档往返后学员对象重建，需重渲染行引用）
  refreshSchoolPage() { this.renderSchool(); }

  // 测试钩子：学校状态快照（smoke S8t 断言用）
  schoolDebug(): any {
    const c = this.gd.Caravans[0];
    const loc = this.schoolLoc;
    return {
      pageVisible: !!this.schoolOv && this.schoolOv.visible,
      price: this.schoolPrice,
      people: c.People.map((p: any, i: number) => ({ i, name: p.name, cat: p.category, exp: Math.round((p as any).doctorExperience ?? 0) })),
      students: (loc?.people ?? []).map((p: any) => ({ name: p.name, started: p.startedStudying ?? 0, time: p.studyTime ?? 0, remaining: Math.max(0, (p.startedStudying ?? 0) + (p.studyTime ?? 0) - this.gd.Time) })),
      money: Math.round(c.money),
      calc: this.indCalcVisible ? this.indCalcState : null,
      dlg: this.indDlgVisible,
    };
  }

  // ---------- 警察局（原版 PoliceStation.as：囚犯移交羁押换赏金 2857-2859） ----------
  private policeOv: Sprite | null = null;
  private policeLoc: any = null;
  private policeTarget: any = null;
  private policeReward = 0;
  private policeList!: ScrollableArea;
  private policeRewardText!: EngineText;
  private policeTargetName!: EngineText;
  private policeInfoLine!: EngineText;
  private policeBottomCapacity!: EngineText;
  private policeBottomMoney!: EngineText;
  private policeBottomDate!: EngineText;
  private policePortrait!: Sprite;
  private policeFacilitySign!: Sprite;
  private policeLines!: Sprite;
  private policeClaimButton!: Button;
  private policeExitButton!: Button;

  private openPolicePage(loc: any) {
    this.policeLoc = loc;
    this.policeTarget = null;
    this.policeReward = 0;
    if (this.policeOv) {
      this.policeOv.visible = true;
      this.policeFacilitySign.removeAll();
      attachLocationSymbol(this.policeFacilitySign, locationSymbolParts(loc.symbol), this.assets);
      this.renderPolice();
      return;
    }
    const ov = new Sprite();
    // PoliceStation.as：全屏 Dialogue(880,495)，不是居中的简化 640×380 面板。
    addDialogueBackground(ov, this.assets, 0, 0, 880, 495, 0, undefined, false);
    const g = new Graphics();
    g.hitRect(0, 0, 880, 495);
    ov.graphics = g;

    this.policeLines = new Sprite();
    const lines = new Graphics();
    lines.lineStyle(1, 16777215);
    lines.moveTo(0,472); lines.lineTo(880,472);
    lines.drawRect(9,361,862,102);
    lines.moveTo(10,451); lines.lineTo(870,451);
    lines.drawRect(390,172,100,100);
    this.policeLines.graphics = lines;
    this.policeLines.mouseEnabled = false;
    ov.addChild(this.policeLines);
    const footer = new Sprite(); const footerG = new Graphics();
    footerG.beginFill(16777215,.3); footerG.drawRect(0,0,860,10);
    footer.graphics=footerG;footer.x=10;footer.y=452;footer.mouseEnabled=false;ov.addChild(footer);

    const title = new EngineText('',16777215,18,'center',10,10,860,20);
    this.policeTargetName = new EngineText('',16777215,14,'center',10,282,860,20);
    this.policeRewardText = new EngineText('',16777215,18,'center',10,310,860,20);
    this.policeInfoLine = new EngineText('',16777215,14,'center',10,222,860,20);
    this.policeBottomCapacity = new EngineText('',16777215,14,'left',10,474,860,20);
    this.policeBottomDate = new EngineText('',16777215,14,'right',10,474,860,20);
    this.policeBottomMoney = new EngineText('',16777215,14,'left',10,474,860,20);
    (ov as any).__policeTitle=title;
    ov.addChild(new DialogueTextMask(this.assets,880,495,[title,this.policeTargetName,this.policeRewardText,this.policeInfoLine,this.policeBottomCapacity,this.policeBottomDate,this.policeBottomMoney]));

    this.policePortrait = new Sprite();this.policePortrait.x=390;this.policePortrait.y=172;this.policePortrait.scaleX=this.policePortrait.scaleY=.4;ov.addChild(this.policePortrait);
    this.policeFacilitySign = new Sprite();this.policeFacilitySign.x=440;this.policeFacilitySign.y=100;this.policeFacilitySign.scaleX=this.policeFacilitySign.scaleY=2.5;this.policeFacilitySign.mouseEnabled=this.policeFacilitySign.mouseChildren=false;ov.addChild(this.policeFacilitySign);
    attachLocationSymbol(this.policeFacilitySign,locationSymbolParts(loc.symbol),this.assets);

    this.policeList = new ScrollableArea(860, 90, 860, 90, false, true, false, 10, 10, this.assets);
    this.policeList.x = 10; this.policeList.y = 362;
    ov.addChild(this.policeList);
    this.policeClaimButton = new Button(2, () => this.policeClaim(), this.text(2857).toUpperCase(), this.assets);
    this.policeClaimButton.x = 657; this.policeClaimButton.y = 309; ov.addChild(this.policeClaimButton);
    this.policeExitButton = new Button(2, () => { this.policeOv!.visible = false; }, this.text(1344).toUpperCase(), this.assets);
    this.policeExitButton.x = 17; this.policeExitButton.y = 309; ov.addChild(this.policeExitButton);
    this.screen.addChild(ov);
    this.policeOv = ov;
    this.renderPolice();
  }

  // 囚犯与该镇阵营的敌对关系（原版 getFactionRelations(faction, oldFaction) < 0）
  private policeEnemyRelation(p: any): number {
    return this.gd.getFactionRelations(p.oldFaction ?? 0, this.policeLoc?.faction ?? 1);
  }
  private policeValid(): any[] {
    const c = this.gd.Caravans[0];
    return c.People.filter((p: any) => p.category === 3 && this.policeEnemyRelation(p) < 0);
  }
  // 原版 rewardFormula：((price/15)² × rewardSize × (−关系)) / 1e10，按档取整
  private policeRewardFormula(p: any): number {
    const size = this.policeLoc?.reward ?? 1000;
    let v = Math.pow((typeof p.price === "function" ? p.price() : 1) / 15, 2) * size * (0 - this.policeEnemyRelation(p)) / 10000000000;
    if (v < 0.05) return Math.round(v * 100);
    if (v < 0.5) return Math.round(v * 10) * 10;
    return Math.round(v) * 100;
  }

  private renderPolice() {
    if (!this.policeOv) return;
    const title=(this.policeOv as any).__policeTitle as EngineText;
    title.text=((this.policeLoc?.name?this.text(this.policeLoc.name):'POLICE')+', '+this.town.name).toUpperCase();
    this.policeList.clearAll();
    const valid = this.policeValid();
    // 原版 List.update 会自动选中有效列表第一项；空列表才传 null。
    if (!this.policeTarget || !valid.includes(this.policeTarget)) this.policeTarget=valid[0]??null;
    this.policeReward=this.policeTarget?this.policeRewardFormula(this.policeTarget):0;
    valid.forEach((p,i)=>{
      const rw = this.policeRewardFormula(p);
      const person = p;
      const cell=makePersonCell(this.assets,this.ds,p,{cellW:70,selected:p===this.policeTarget,picBGColor:9472128,selectFrameColor:16777215,selectFrameSize:2,selectFrameAlpha:1,onClick:()=>{sfxClick();this.policeTarget=person;this.policeReward=rw;this.renderPolice();}});
      cell.x=cell.y=0;cell.buttonMode=true;cell.mouseChildren=false;
      const item=new Sprite();item.x=10+i*80;item.y=10;Object.assign(item,{width:80,height:80});item.addChild(cell);this.policeList.addContent(item);
    });
    this.policeList.updateSize();
    const selected=!!this.policeTarget;
    this.policeLines.visible=this.policeList.visible=this.policeClaimButton.visible=selected;
    this.policePortrait.removeAll();
    if(selected){
      this.policePortrait.addChild(buildPortraitFromCharacter(this.assets,this.policeTarget,1));
      this.policeTargetName.text=(this.policeTarget.name||'?').toUpperCase();
      this.policeRewardText.text=this.text(2855)+': '+numberFormat(this.policeReward,0,true)+' €';
      this.policeExitButton.x=17;
    }else{
      this.policeTargetName.text=this.text(2858).toUpperCase();
      this.policeRewardText.text='';
      this.policeExitButton.x=337;
    }
    const c=this.gd.Caravans[0],d=this.gd.makeDate();
    this.policeBottomCapacity.text=this.text(903).toUpperCase()+': '+numberFormat(c.totalCargo,0)+'/'+numberFormat(c.maxCargo,0)+' '+this.text(12).toUpperCase();
    this.policeBottomMoney.text=this.text(20).toUpperCase()+': '+numberFormat(c.money,2);
    this.policeBottomDate.text=`${d.Day2d}-${d.ShortMonthName}-${d.Year2d} ${d.Hour2d}:${d.Minute2d}`;
    this.policeBottomMoney.x=10+this.policeBottomCapacity.textWidth+(860-this.policeBottomCapacity.textWidth-this.policeBottomDate.textWidth)/2-this.policeBottomMoney.textWidth/2;
  }

  // 移交羁押（原版 claimReward：2859 确认 → 移除囚犯/赏金入账/阵营关系+1/名声-1）
  private policeClaim() {
    if (!this.policeTarget) return;
    const c = this.gd.Caravans[0];
    const p = this.policeTarget;
    const reward = this.policeReward;
    this.indDlg(this.tpl(getText(this.ds, 2859, this.ds.language, p.gender ?? 1), { "@name@": p.name || "?", "@名字@": p.name || "?" })
      .replace("@money@", this.fmt(reward) + " €").toUpperCase(), () => {
      c.removePerson(c.People.indexOf(p));
      c.money += reward;
      this.gd.affectFactionRelations(1, this.policeLoc?.faction ?? 1);
      if (this.gd.story?.specificReputations) {
        this.gd.story.specificReputations[8] = (this.gd.story.specificReputations[8] ?? 0) - 1;
      }
      this.policeTarget = null;
      this.policeReward = 0;
      this.renderPolice();
    });
  }

  // 测试钩子：警局状态快照（smoke S8u 断言用）
  policeDebug(): any {
    const c = this.gd.Caravans[0];
    const valid = this.policeValid();
    return {
      pageVisible: !!this.policeOv && this.policeOv.visible,
      prisoners: valid.map((p: any) => ({ name: p.name, cat: p.category, reward: this.policeRewardFormula(p) })),
      target: this.policeTarget ? this.policeTarget.name : null,
      reward: this.policeReward,
      money: Math.round(c.money),
      rep8: this.gd.story?.specificReputations?.[8] ?? 0,
      relations: (() => {
        const rels: Record<number, number> = {};
        for (const fid of this.gd.revealedFactions ?? []) rels[fid] = this.gd.getFactionRelations(fid, 0);
        return rels;
      })(),
      dlg: this.indDlgVisible,
      people: c.People.length,
    };
  }
}
