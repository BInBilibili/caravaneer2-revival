// CharacterSetupScreen：角色创建 — 1:1 对齐原版 AS3（IsoEngine/CharacterSetupScreen.as）布局
// 布局坐标直接取自反编译源码：肖像(20,20) 250x250、名称/性别(315,62)、属性(315,102+)、
// 随机名字/属性(337/632,259)、颜色列(20,302+)、部件两列(315/610,302+)、底部按钮(42/337/632,459)
import { addDialogueBackground, DialogueTextMask } from "../core/DialogueBg";
import { originalCreationColors } from "./CreationColors";
import { Sprite, Graphics, BitmapObject } from "../core/Display";
import { EngineText } from "../core/EngineText";
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import { Button, Switch } from "../core/Ui";
import { sfxClick } from "../core/Sound";
import { rgb2hsv, hsv2rgb, buildPortraitFromCharacter } from "./Portrait";

const COLORS = ["skin", "hair", "lips", "eyes", "eyeSockets", "eyebrows", "beard"];
// 原版 colorNames：肤色/头发/嘴唇/眼型/眼睑/眉毛/胡子
const COLOR_NAMES = [1543, 1530, 1544, 1533, 1545, 1535, 1546];
// 原版 partsOrder
const PARTS: Array<{ key: string; base: string; max: number; gender?: number }> = [
  { key: "head", base: "CPHead", max: 9 },
  { key: "hair", base: "CPHair", max: 31 },
  { key: "nose", base: "CPNose", max: 16 },
  { key: "mouth", base: "CPMouth", max: 12 },
  { key: "eyes", base: "CPEyes", max: 13 },
  { key: "beard", base: "CPBeard", max: 19, gender: 1 },
  { key: "eyebrows", base: "CPEyebrows", max: 11 },
  { key: "ears", base: "CPEars", max: 7 },
  { key: "wrinkles", base: "CPWrinkles", max: 9 },
  { key: "whiskers", base: "CPWhiskers", max: 4, gender: 1 },
  { key: "moustache", base: "CPMoustache", max: 17, gender: 1 },
  { key: "shirt", base: "CPShirt", max: 4 },
  { key: "necklace", base: "CPNecklace", max: 1 },
];
// 原版 buttonsOrder：0..12 → PARTS，13 → bristle（落腮胡）
const BUTTONS_ORDER = [0, 1, 3, 4, 2, 6, 5, 7, 8, 10, 9, 13, 11, 12];
const NAMES_ORDER = [1529, 1530, 1531, 1532, 1533, 1534, 1535, 1536, 1537, 1538, 1539, 1540, 1541, 1542];
// 原版 getPortraitOptions：按性别/年龄的可用部件索引（0=无）
// （LAYER_ORDER/backHair/backBeard/3色矩阵管线已在 Portrait.ts 公共模块，drawPortrait 复用 buildPortraitFromCharacter）
function optsFor(key: string, gender: number, age: number): number[] {
  switch (key) {
    case "hair":
      if (gender === 1) {
        if (age < 30) return [0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 17, 19, 20, 21, 23, 24, 25, 26, 27, 28];
        if (age < 45) return [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29];
        return [0, 1, 6, 7, 8, 9, 12, 13, 15, 16, 18, 19, 20, 21, 22, 24, 29];
      }
      return [0, 1, 2, 3, 4, 5, 6, 10, 12, 14, 30, 31];
    case "head":
      if (gender === 1) {
        if (age < 25) return [1, 2, 3, 6, 9];
        if (age < 40) return [1, 2, 3, 4, 6, 8, 9];
        return [1, 3, 4, 5, 6, 7, 8, 9];
      }
      return [1, 2, 9];
    case "mouth":
      return gender === 1 ? [2, 3, 4, 5, 6, 7, 9, 11] : [1, 8, 9, 10, 11, 12];
    case "nose":
      return gender === 1 ? [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16] : [2, 6, 11, 13, 14, 15, 16];
    case "eyebrows":
      return gender === 1 ? [1, 3, 4, 6, 7, 8, 9, 10, 11] : [2, 5, 7];
    case "eyes":
      return gender === 1 ? [1, 2, 4, 5, 6, 7, 8, 9, 10, 11] : [1, 3, 10, 11, 12, 13];
    case "ears":
      return [1, 2, 3, 4, 5, 6, 7];
    case "beard":
      if (gender === 2 || age < 22) return [0];
      if (age < 30) return [0, 1, 2, 4, 7, 8, 9, 10, 11, 12, 13, 15, 16, 19];
      if (age < 40) return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19];
      return [0, 1, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18];
    case "moustache":
      if (gender === 2 || age < 18) return [0];
      if (age < 24) return [0, 3, 8, 15, 17];
      if (age < 30) return [0, 1, 4, 5, 8, 9, 10, 11, 13, 14, 15];
      if (age < 40) return [0, 2, 4, 5, 7, 9, 10, 11, 12, 13, 14];
      return [0, 2, 7, 9, 11, 12, 13, 14, 16];
    case "wrinkles":
      return gender === 1 ? [0, 1, 2, 3, 4, 5] : [0, 6, 7, 8, 9];
    case "whiskers":
      return gender === 2 || age < 19 ? [0] : [0, 1, 2, 3];
    case "shirt":
      return [0, 1, 2, 3, 4];
    case "necklace":
      return [0, 1];
    default:
      return [];
  }
}
// 原版每部位 HSV 范围（ColorPicker 色板）
const COLOR_RANGES: Record<string, { minH: number; maxH: number; minS: number; maxS: number; minV: number; maxV: number }> = {
  skin: { minH: 10, maxH: 30, minS: 20, maxS: 35, minV: 25, maxV: 100 },
  hair: { minH: 0, maxH: 360, minS: 0, maxS: 100, minV: 0, maxV: 100 },
  lips: { minH: 0, maxH: 360, minS: 20, maxS: 100, minV: 0, maxV: 50 },
  eyes: { minH: 10, maxH: 240, minS: 0, maxS: 50, minV: 0, maxV: 75 },
  eyeSockets: { minH: 0, maxH: 360, minS: 0, maxS: 100, minV: 0, maxV: 100 },
  eyebrows: { minH: 0, maxH: 360, minS: 0, maxS: 100, minV: 0, maxV: 100 },
  beard: { minH: 0, maxH: 360, minS: 0, maxS: 100, minV: 0, maxV: 100 },
};
const DEFAULT_COLORS: Record<string, { r: number; g: number; b: number }> = {
  skin: { r: 200, g: 160, b: 140 },
  hair: { r: 30, g: 20, b: 5 },
  lips: { r: 150, g: 60, b: 40 },
  eyes: { r: 30, g: 25, b: 10 },
  eyeSockets: { r: 60, g: 45, b: 30 },
  eyebrows: { r: 30, g: 20, b: 5 },
  beard: { r: 30, g: 20, b: 5 },
  shirt: { r: 70, g: 62, b: 56 },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export class CharacterSetupScreen {
  readonly screen = new Sprite();
  theCharacter: any;
  onDone: (() => void) | null = null;
  onCancel: (() => void) | null = null;
  private portrait!: Sprite;
  private nameInput: HTMLInputElement | null = null;
  private statTexts: EngineText[] = [];
  private pointsText!: EngineText;
  private colorBoxes: Array<{ box: Sprite; key: string }> = [];
  private availablePoints = 0;
  private removeInput: (() => void) | null = null;
  private portraitAttempted = new Set<string>();
  // 颜色选择器
  private picker: Sprite | null = null;
  private pickerKey = "";
  private pickerNatural = false;
  private pickerSquares: Array<{ disp: Sprite; rgb: { r: number; g: number; b: number }; idx: [number, number, number, number] }> = [];
  private pickerMark: Sprite | null = null;
  private pickerHsv = { h: 0, s: 0, v: 0 };
  private pickerTitle!: EngineText;

  constructor(
    private ds: DataStore, private assets: AssetStore, private canvas: HTMLCanvasElement,
    existing: any = null,
  ) {
    if (existing) {
      this.theCharacter = existing;
    } else {
      const ch: any = { age: 25, gender: 1, name: "", basePhysical: 10, baseAgility: 10, baseAccuracy: 10, baseIntelligence: 10 };
      ch.colors = this.randomizeColors();
      ch.parts = {};
      for (const p of PARTS) {
        const opts = optsFor(p.key, 1, 25);
        ch.parts[p.key] = opts.length ? opts[Math.floor(Math.random() * opts.length)] : 0;
      }
      ch.parts.eyeSockets = 1;
      this.applyOriginalAppearanceDefaults(ch);
      const skin = rgb2hsv(ch.colors.skin.r, ch.colors.skin.g, ch.colors.skin.b);
      const bristle = rgb2hsv(ch.colors.bristle.r, ch.colors.bristle.g, ch.colors.bristle.b);
      ch.bristleGrade = Math.max(Math.round((skin.s - bristle.s + skin.v - bristle.v) / 20), 0);
      this.theCharacter = ch; // 先赋值（randomName 依赖 this.theCharacter.gender）
      ch.name = this.randomName();
    }
    if (this.theCharacter.bristleGrade === undefined) this.theCharacter.bristleGrade = 0;
    this.availablePoints = Math.max(0, 40 - this.theCharacter.basePhysical - this.theCharacter.baseAgility - this.theCharacter.baseAccuracy - this.theCharacter.baseIntelligence);
    this.desiredParts = {...this.theCharacter.parts};
    this.build();
  }

  private text(id: number) { return getText(this.ds, id, this.ds.language); }

  destroy() {
    if (this.removeInput) this.removeInput();
    this.nameInput = null;
  }

  // ---------------- 主界面构建（原版布局） ----------------
  private build() {
    const S = this.screen;
    const g = new Graphics();
    g.beginFill(0, 0.93);
    g.drawRect(0, 0, 880, 495);
    S.graphics = g;
    addDialogueBackground(S, this.assets, 0, 0, 880, 495, 0, undefined, false);

    // 分隔线层（原版 lines：红框=色块外框，白线=部件网格）
    const lines = new Sprite();
    const lg = new Graphics();
    lg.lineStyle(1, 16777215); // 调色条边框改白（原版 InterfaceForeground 近白纹理）
    for (let i = 0; i < COLORS.length; i++) lg.drawRect(150, 304 + i * 20, 121, 16);
    lg.lineStyle(1, 16777215);
    for (const x of [315, 565, 610, 860]) { lg.moveTo(x, 302); lg.lineTo(x, 442); }
    for (let y = 302; y <= 442; y += 20) {
      lg.moveTo(315, y); lg.lineTo(565, y); lg.moveTo(610, y); lg.lineTo(860, y);
    }
    lines.graphics = lg;
    S.addChild(lines);

    // 标题（原版 1525 @320,21 居中）
    S.addChild(new EngineText(this.text(1525).toUpperCase(), 16777215, 16, "center", 320, 21, 540, 20));

    // 肖像背景 + 画框（原版 photoBG 20,20 / frame 21,21 248x248）
    const bg = this.assets.getImage("GenericBackgroundLarge.png");
    // 原版 photoBG.transform.colorTransform = CT(1,1,1,1,30,30,30,0)（+30 提亮）
    const bgCt = { r: 1, g: 1, b: 1, dr: 30, dg: 30, db: 30 };
    const placeBg = (im: HTMLImageElement) => {
      const b = new BitmapObject(im);
      b.x = 20; b.y = 20;
      b.colorTransform = bgCt;
      // 必须插到 InterfaceBackground 之后（否则被全屏锈金属纹理盖住）：找其索引+1
      const ibgIdx = S.children.findIndex((c: any) => c.image && String(c.image.src || "").includes("InterfaceBackground"));
      const idx = ibgIdx >= 0 ? ibgIdx + 1 : 1;
      S.addChildAt(b, Math.min(idx, S.children.length));
    };
    if (bg) placeBg(bg);
    else void this.assets.ensure("GenericBackgroundLarge.png").then((im) => { if (im) placeBg(im); });
    this.portrait = new Sprite();
    this.portrait.x = 20; this.portrait.y = 20;
    S.addChild(this.portrait);
    const frame = new Sprite();
    const fg = new Graphics();
    fg.lineStyle(3, 1050624, 0.5);
    fg.drawRect(0, 0, 248, 248);
    frame.graphics = fg;
    frame.x = 21; frame.y = 21;
    S.addChild(frame);
    this.drawPortrait();

    // 名称 + 性别（原版 nameTitle 315,62；genderText 右对齐到 x=760）
    const nameTitle = new EngineText(this.text(1526).toUpperCase() + ":", 16777215, 14, "left", 315, 62, 120, 20);
    S.addChild(nameTitle);
    const genderTitle = new EngineText(this.text(1527).toUpperCase() + ":", 16777215, 14, "left", 0, 62, 0, 20);
    genderTitle.x = 760 - genderTitle.textWidth;
    S.addChild(genderTitle);
    const nameSpaceWidth = Math.max(80, genderTitle.x - (315 + nameTitle.textWidth) - 30);
    // 名称输入框背景 + 投影（原版 DropShadow(3,45,0,0.3,2,2,1,3,true)）
    const nameBG = new Sprite();
    const nbg = new Graphics();
    nbg.beginFill(11052176);
    nbg.drawRect(0, 0, nameSpaceWidth, 20);
    nameBG.graphics = nbg;
    nameBG.x = 315 + nameTitle.textWidth + 10;
    nameBG.y = 62;
    // 投影层

    S.addChild(nameBG);
    this.makeNameInput(nameBG.x + 5, 63, nameSpaceWidth - 12);

    // 性别单选（原版 radio[1]=男 @780, radio[0]=女 @830；InterfaceIconMale/Female @800/850 scale 0.25）
    this.mkRadio(780, 1);
    this.mkRadio(830, 2);
    this.addGenderIcon("InterfaceIconMale.png", 800, 72);
    this.addGenderIcon("InterfaceIconFemale.png", 850, 72);

    // 属性（原版 944..947 @315,102+i*30；Button8+RepeatedGraphics 三角箭头 @607/667；数值框 630 40x20+投影）
    const attrs = ["basePhysical", "baseAgility", "baseAccuracy", "baseIntelligence"];
    for (let i = 0; i < 4; i++) {
      S.addChild(new EngineText(this.text(944 + i).toUpperCase() + ":", 16777215, 14, "right", 315, 102 + i * 30, 250, 20));
      // Button(8) −/+ 三角箭头（23x20，scale0.95）
      const minus = this.btn8Triangle(607, 101 + i * 30, -1, () => this.adjustStat(i, -1));
      S.addChild(minus);
      const plus = this.btn8Triangle(667, 101 + i * 30, 1, () => this.adjustStat(i, 1));
      S.addChild(plus);
      // 数值框背景 + 投影

      const vb = new Sprite();
      const vg = new Graphics();
      vg.beginFill(11052176);
      vg.drawRect(0, 0, 40, 20);
      vb.graphics = vg;
      vb.x = 630; vb.y = 102 + i * 30;
      S.addChild(vb);
      const val = new EngineText(String(this.theCharacter[attrs[i]]), 0, 14, "center", 630, 102 + i * 30, 40, 20);
      S.addChild(val);
      this.statTexts.push(val);
    }
    // 可使用点数（原版 1528 @315,222，数值框 @630,222+投影）
    S.addChild(new EngineText(this.text(1528).toUpperCase() + ":", 16777215, 14, "right", 315, 222, 250, 20));

    const pvb = new Sprite();
    const pvg = new Graphics();
    pvg.beginFill(11052176);
    pvg.drawRect(0, 0, 40, 20);
    pvb.graphics = pvg;
    pvb.x = 630; pvb.y = 222;
    S.addChild(pvb);
    this.pointsText = new EngineText("", 0, 14, "center", 630, 222, 40, 20);
    S.addChild(this.pointsText);
    // 关于属性（原版 7102 @700,104 右对齐）
    const about = new EngineText(this.text(7102), 0xffffff, 11, "right", 700, 104, 160, 18);
    S.addChild(about);
    lg.moveTo(860, 119); lg.lineTo(856 - Math.min(about.textWidth, 160), 119);
    const help = new Sprite(); help.graphics = new Graphics();
    help.graphics.hitRect(856 - Math.min(about.textWidth, 160), 102, Math.min(about.textWidth, 160) + 4, 20);
    help.buttonMode = true;
    help.addEventListener("click", () => window.open("http://caravaneer.gamesofhonor.com/c2officialinstructions.php?page=4", "_blank", "noopener"));
    S.addChild(help);

    // 随机名字 / 随机属性（原版 1548/1549 @337/632,259）
    const rn = new Button(2, () => { this.randomNameOnly(); }, this.text(1548).toUpperCase(), this.assets);
    rn.x = 337; rn.y = 259;
    S.addChild(rn);
    const ra = new Button(2, () => { this.randomizeAttrs(); }, this.text(1549).toUpperCase(), this.assets);
    ra.x = 632; ra.y = 259;
    S.addChild(ra);

    // 颜色列（原版 @20,302+i*20；外框 150,304 121x16；色块 151,305 120x14）
    for (let i = 0; i < COLORS.length; i++) {
      const key = COLORS[i];
      S.addChild(new EngineText(this.text(COLOR_NAMES[i]).toUpperCase(), 16777215, 14, "left", 20, 302 + i * 20, 140, 20));
      const box = new Sprite();
      const cg = new Graphics();
      cg.beginFill(0xFFFFFF);
      cg.drawRect(0, 0, 120, 14);
      box.graphics = cg;
      box.x = 151; box.y = 305 + i * 20;
      box.addEventListener("click", () => this.openColorPicker(key));
      S.addChild(box);
      this.colorBoxes.push({ box, key });
    }

    // 部件两列（原版：左列 315..565，右列 610..860，每列 7 行 y=302+i*20；Button7 小三角箭头 @placeX+3/placeX+234）
    for (let i = 0; i < BUTTONS_ORDER.length; i++) {
      const placeX = i < 7 ? 315 : 610;
      const placeY = 302 + (i % 7) * 20;
      const orderIdx = BUTTONS_ORDER[i];
      S.addChild(new EngineText(this.text(NAMES_ORDER[orderIdx]).toUpperCase(), 16777215, 14, "center", placeX, placeY, 250, 20));
      const isBristle = orderIdx === 13;
      const prev = this.btn7Triangle(placeX + 3, placeY + 3, -1, () => isBristle ? this.adjustBristle(-1) : this.cyclePart(PARTS[orderIdx].key, -1));
      S.addChild(prev);
      const next = this.btn7Triangle(placeX + 234, placeY + 3, 1, () => isBristle ? this.adjustBristle(1) : this.cyclePart(PARTS[orderIdx].key, 1));
      S.addChild(next);
    }

    // 底部按钮（原版 634=取消 @42, 1547=随机创造 @337, 1229=完成 @632, y=459）
    const cancel = new Button(2, () => { if (this.onCancel) this.onCancel(); }, this.text(634).toUpperCase(), this.assets);
    cancel.x = 42; cancel.y = 459;
    S.addChild(cancel);
    const randomAppearance = new Button(2, () => { this.randomizeAll(); }, this.text(1547).toUpperCase(), this.assets);
    randomAppearance.x = 337; randomAppearance.y = 459;
    S.addChild(randomAppearance);
    const done = new Button(2, () => { this.finish(); }, this.text(1229).toUpperCase(), this.assets);
    done.x = 632; done.y = 459;
    S.addChild(done);

    // Dialogue.FGMask: original white labels use the foreground texture, at output resolution.
    const labels = S.children.filter((c): c is EngineText => c instanceof EngineText && c.color === 0xffffff);
    // Sprite.addChild does not reparent: detach to avoid rendering labels twice.
    for (const label of labels) S.removeChild(label);
    S.addChild(new DialogueTextMask(this.assets, 880, 495, labels));
    // 颜色选择器弹层（原版 ColorPicker @280,0，600x495）
    this.buildColorPicker();
    this.refreshStats();
    this.refreshColorBoxes();
  }

  // ---------------- 小部件 ----------------
  private desiredParts: Record<string, number> = {};
  private radios: Array<{ r: Sprite; inner: Sprite; gender: number }> = [];
  private refreshRadios() {
    for (const rd of this.radios) rd.inner.visible = this.theCharacter.gender === rd.gender;
  }

  // 性别符号图标（原版 InterfaceIconMale/Female @scale 0.25，鼠标不挡单选点击）
  private addGenderIcon(name: string, x: number, y: number) {
    const holder = new Sprite(); holder.mouseEnabled = false; this.screen.addChild(holder);
    const add = (img: HTMLImageElement | null) => {
      if (!img) return;
      const b = new BitmapObject(img);
      b.x = x - img.naturalWidth * .125; b.y = y - img.naturalHeight * .125;
      b.scaleX = b.scaleY = 0.25;
      b.mouseEnabled = false;
      holder.addChild(b);
    };
    const img = this.assets.getImage(name);
    if (img) { add(img); return; }
    void this.assets.ensure(name).then((im) => { if (im) add(im); });
  }

  private mkRadio(x: number, gender: number) {
    // 投影层（原版 DropShadow(3,45,0,0.3,2,2,1,3,true)）

    
    const r = new Sprite();
    const rg = new Graphics();
    rg.beginFill(11052176);
    rg.drawCircle(0, 0, 8);
    rg.hitCircle(0, 0, 10);
    r.graphics = rg;
    const inner = new Sprite();
    const ig = new Graphics();
    ig.beginFill(2630688);
    ig.drawCircle(0, 0, 4);
    inner.graphics = ig;
    inner.visible = this.theCharacter.gender === gender;
    r.addChild(inner);
    r.x = x; r.y = 72;
    r.addEventListener("click", () => { sfxClick(); this.theCharacter.gender = gender; this.refreshGender(); });
    this.radios.push({ r, inner, gender });
    this.screen.addChild(r);
  }

  private makeNameInput(x: number, y: number, w: number) {
    const inp = document.createElement("input");
    inp.value = this.theCharacter.name || "";
    inp.maxLength = 30;
    inp.addEventListener("keydown", e => e.stopPropagation());
    inp.style.cssText = `position:fixed;background:transparent;color:#000;border:none;font:14px "Microsoft YaHei","Microsoft JhengHei","Noto Sans SC","SimHei",Arial,sans-serif;padding:0 4px;z-index:200;outline:none;`;
    document.body.appendChild(inp);
    const place = () => {
      const r = this.canvas.getBoundingClientRect();
      const sx = r.width / 880, sy = r.height / 495;
      inp.style.left = (r.left + x * sx) + "px";
      inp.style.top = (r.top + y * sy) + "px";
      inp.style.width = Math.max(50, w * sx) + "px";
      inp.style.height = Math.max(16, 18 * sy) + "px";
      inp.style.fontSize = Math.max(10, 14 * sy) + "px";
    };
    place();
    window.addEventListener("resize", place);
    inp.addEventListener("input", () => { this.theCharacter.name = inp.value; });
    this.nameInput = inp;
    this.removeInput = () => {
      window.removeEventListener("resize", place);
      inp.remove();
    };
  }

  // Button(8) 三角箭头按钮（原版 Button(8)：pressed=InterfaceSwitch2Up.png、released=InterfaceSwitch2Down.png，25x25；三角矢量居中(11.5,12.5)）
  private btn8Triangle(x: number, y: number, dir: -1 | 1, fn: () => void): Sprite {
    const b = new Sprite();
    const g = new Graphics();
    g.hitRect(0, 0, 23, 20); // 仅命中区（位图贴图覆盖绘制，不再画半透明矩形）
    b.graphics = g;
    // 位图贴图：pressed=InterfaceSwitch2Up.png（亮）/ released=InterfaceSwitch2Down.png（暗），25x25 无 ColorTransform
    // （先 add 位图 → 三角最后 add 盖在顶层，同原版 Button.as：pressed/released 先 add、文本后 add）
    const put = (img: HTMLImageElement, pressed: boolean) => {
      const bm = new BitmapObject(img);
      bm.mouseEnabled = false;
      bm.visible = pressed; // released 默认可见
      b.addChildAt(bm, 0); // 插到底层：异步补挂时也不会盖住顶层黑三角（z-order 修复）
      return bm;
    };
    let upImg: BitmapObject | null = null, downImg: BitmapObject | null = null;
    const up = this.assets.getImage("InterfaceSwitch2Up.png");
    const down = this.assets.getImage("InterfaceSwitch2Down.png");
    if (up) upImg = put(up, false); // 原版 Button.as L74：pressedImage(Up亮图).visible=false → 默认显示 released(Down暗图)
    if (down) downImg = put(down, true);
    if (!up || !down) {
      // 按具体 image 去重（不能全局 hasBmp：两图异步加载时先到的会挡住后到的，导致 pressed/released 缺一张）
      const already = (im: HTMLImageElement) => b.children.some((c) => (c as any).image === im);
      void this.assets.ensure("InterfaceSwitch2Up.png").then((im) => {
        if (!im || upImg || already(im)) return;
        upImg = put(im, false); // Up 亮图默认隐藏（released=Down 暗图）
      });
      void this.assets.ensure("InterfaceSwitch2Down.png").then((im) => {
        if (!im || downImg || already(im)) return;
        downImg = put(im, true);
      });
    }
    // 三角箭头（原版 RepeatedGraphics：黑色矢量三角，fill 0）
    const tri = new Graphics();
    tri.beginFill(0);
    if (dir === -1) { tri.moveTo(3, -4); tri.lineTo(-4, 0); tri.lineTo(3, 4); }
    else { tri.moveTo(-3, -4); tri.lineTo(4, 0); tri.lineTo(-3, 4); }
    const ts = new Sprite();
    ts.graphics = tri;
    ts.x = 11.5; ts.y = 12.5;
    ts.mouseEnabled = false;
    b.addChild(ts);
    // 按压切换（与 Ui.Button 一致：pointerdown 显示 pressed，pointerup/out 恢复 released）
    const swap = (pressed: boolean) => {
      if (upImg) upImg.visible = pressed;
      if (downImg) downImg.visible = !pressed;
    };
    b.addEventListener("pointerdown", () => swap(true));
    b.addEventListener("pointerup", () => swap(false));
    b.addEventListener("pointerout", () => swap(false));
    b.x = x; b.y = y;
    b.scaleX = b.scaleY = 0.95;
    b.buttonMode = true;
    b.addEventListener("click", fn);
    return b;
  }

  // Button(7) 小三角箭头（原版 Button(7)：pressed=Button15x15Down.png、released=Button15x15Up.png，16x16；三角矢量居中(7.5,7.5)）
  private btn7Triangle(x: number, y: number, dir: -1 | 1, fn: () => void): Sprite {
    const b = new Sprite();
    const g = new Graphics();
    g.hitRect(0, 0, 15, 15); // 仅命中区（位图贴图覆盖绘制，不再画半透明矩形）
    b.graphics = g;
    // 位图贴图：pressed=Button15x15Down.png / released=Button15x15Up.png，16x16
    // （先 add 位图 → 三角最后 add 盖在顶层，同原版 Button.as 顺序）
    const put = (img: HTMLImageElement, pressed: boolean) => {
      const bm = new BitmapObject(img);
      bm.mouseEnabled = false;
      bm.visible = pressed; // released 默认可见
      b.addChildAt(bm, 0); // 插到底层：异步补挂时也不会盖住顶层黑三角（z-order 修复）
      return bm;
    };
    let upImg: BitmapObject | null = null, downImg: BitmapObject | null = null;
    const up = this.assets.getImage("Button15x15Up.png");
    const down = this.assets.getImage("Button15x15Down.png");
    if (up) upImg = put(up, true);
    if (down) downImg = put(down, false);
    if (!up || !down) {
      // 按具体 image 去重（不能全局 hasBmp：两图异步加载时先到的会挡住后到的，导致 pressed/released 缺一张）
      const already = (im: HTMLImageElement) => b.children.some((c) => (c as any).image === im);
      void this.assets.ensure("Button15x15Up.png").then((im) => {
        if (!im || upImg || already(im)) return;
        upImg = put(im, true);
      });
      void this.assets.ensure("Button15x15Down.png").then((im) => {
        if (!im || downImg || already(im)) return;
        downImg = put(im, false);
      });
    }
    // 小三角箭头（原版 RepeatedGraphics：黑色矢量三角，fill 0）
    const tri = new Graphics();
    tri.beginFill(0);
    if (dir === -1) { tri.moveTo(2, -3); tri.lineTo(-3, 0); tri.lineTo(2, 3); }
    else { tri.moveTo(-2, -3); tri.lineTo(3, 0); tri.lineTo(-2, 3); }
    const ts = new Sprite();
    ts.graphics = tri;
    ts.x = 7.5; ts.y = 7.5;
    ts.mouseEnabled = false;
    b.addChild(ts);
    // 按压切换
    const swap = (pressed: boolean) => {
      if (upImg) upImg.visible = pressed;
      if (downImg) downImg.visible = !pressed;
    };
    b.addEventListener("pointerdown", () => swap(true));
    b.addEventListener("pointerup", () => swap(false));
    b.addEventListener("pointerout", () => swap(false));
    b.x = x; b.y = y;
    b.buttonMode = true;
    b.addEventListener("click", fn);
    return b;
  }

  // ---------------- 属性 / 点数 ----------------
  private adjustStat(i: number, d: number) {
    const attrs = ["basePhysical", "baseAgility", "baseAccuracy", "baseIntelligence"];
    const k = attrs[i];
    const cur = this.theCharacter[k];
    const nv = cur + d;
    if (nv < 1 || nv > 10) return;
    if (d > 0 && this.availablePoints <= 0) return;
    if (d < 0) this.availablePoints += 1;
    else this.availablePoints -= 1;
    this.theCharacter[k] = nv;
    sfxClick();
    this.refreshStats();
  }

  private refreshStats() {
    const attrs = ["basePhysical", "baseAgility", "baseAccuracy", "baseIntelligence"];
    for (let i = 0; i < 4; i++) this.statTexts[i].text = String(this.theCharacter[attrs[i]]);
    this.pointsText.text = String(this.availablePoints);
  }

  // ---------------- 随机 ----------------
  private randomNameOnly() {
    this.theCharacter.name = this.randomName();
    if (this.nameInput) this.nameInput.value = this.theCharacter.name;
  }

  private randomizeAttrs() {
    const v = [1, 1, 1, 1];
    // User-requested budget: 40; original per-attribute cap remains 10.
    let left = 36;
    while (left > 0) {
      const i = Math.floor(Math.random() * 4);
      if (v[i] < 10) { v[i]++; left--; }
    }
    this.theCharacter.basePhysical = v[0];
    this.theCharacter.baseAgility = v[1];
    this.theCharacter.baseAccuracy = v[2];
    this.theCharacter.baseIntelligence = v[3];
    this.availablePoints = 0;
    this.refreshStats();
  }

  private randomizeAll() {
    const ch = this.theCharacter;
    if (!ch.name) ch.name = this.randomName();
    if (this.nameInput) this.nameInput.value = ch.name;
    for (const p of PARTS) {
      const opts = optsFor(p.key, ch.gender, ch.age ?? 25);
      ch.parts[p.key] = opts.length ? opts[Math.floor(Math.random() * opts.length)] : 0;
    }
    // Character.as constructor suppresses wrinkles in younger characters.
    ch.colors = originalCreationColors(ch.gender, ch.age ?? 25);
    this.applyOriginalAppearanceDefaults(ch);
    ch.parts.eyeSockets = 1;
    this.desiredParts = {...ch.parts};
    this.drawPortrait();
    this.refreshColorBoxes();
  }

  // Character.as:1200-1235, not uniform sampling of all facial decorations.
  private applyOriginalAppearanceDefaults(ch: any) {
    if (Math.random() <= .4) ch.parts.necklace = 0;
    if (Math.random() < .5) ch.parts.beard = 0;
    if (Math.random() < .05) ch.parts.moustache = 0;
    const beard = ch.colors.beard;
    if (ch.gender === 1 && beard.r + beard.g + beard.b < 128 && ch.age > 25 && Math.random() < .05) ch.parts.moustache = 6;
    const threshold = ch.gender === 1 ? 30 : 35;
    ch.parts.wrinkles = ch.age < threshold ? 0 : optsFor("wrinkles", ch.gender, ch.age)[Math.floor((ch.age - threshold) / 5)] ?? 0;
  }

  private randomizeColors() {
    return originalCreationColors(this.theCharacter?.gender ?? 1, this.theCharacter?.age ?? 25);
  }

  private randomName(): string {
    const np = this.ds.namePhonetics;
    const list = this.theCharacter.gender === 2 ? np.EnglishFemaleNames : np.EnglishMaleNames;
    if (list && list.length) {
      const pick = list[Math.floor(Math.random() * list.length)];
      return typeof pick === "string" ? pick : String(pick);
    }
    return "Player";
  }

  // ---------------- 部件 / 落腮胡 ----------------
  private cyclePart(key: string, d: number) {
    const p = PARTS.find((x) => x.key === key)!;
    const ch = this.theCharacter;
    const opts = optsFor(key, ch.gender, ch.age ?? 25);
    const cur = ch.parts[key] ?? opts[0] ?? 0;
    let idx = opts.indexOf(cur);
    if (idx < 0) idx = 0;
    const next = opts[(idx + d + opts.length) % opts.length];
    ch.parts[key] = next;
    this.desiredParts[key] = next;
    sfxClick();
    this.drawPortrait();
  }

  private adjustBristle(d: number) {
    this.theCharacter.bristleGrade = (this.theCharacter.bristleGrade + d + 7) % 7;
    sfxClick();
    this.drawPortrait();
  }

  // ---------------- 颜色选择器（原版 ColorPicker：6 色相 x 4 饱和度，每格 4x4 明度） ----------------
  private openColorPicker(key: string) {
    sfxClick();
    this.pickerKey = key;
    const cur = this.theCharacter.colors[key] ?? this.theCharacter.colors.skin;
    this.pickerHsv = rgb2hsv(cur.r, cur.g, cur.b);
    if (this.picker) this.picker.visible = true;
    if (this.nameInput) this.nameInput.style.visibility = "hidden";
    this.updateColorPickerSquares();
    this.updateColorPickerMark();
  }

  private buildColorPicker() {
    const P = new Sprite();
    const bg = new Graphics();
    bg.beginFill(0, 0.94);
    bg.drawRect(0, 0, 600, 495);
    bg.lineStyle(1, 6710886);
    bg.drawRect(10, 42, 580, 405);
    P.graphics = bg;
    addDialogueBackground(P, this.assets, 0, 0, 600, 495, 0, undefined, false);
    const pickerFrame = new Sprite(); pickerFrame.graphics = new Graphics();
    pickerFrame.graphics.lineStyle(1, 0xffffff); pickerFrame.graphics.drawRect(10, 42, 580, 405);
    pickerFrame.mouseEnabled = false; P.addChild(pickerFrame);
    P.x = 280; P.y = 0;
    P.visible = false;
    // 标题
    const title = new EngineText("", 16777215, 16, "center", 10, 11, 580, 22);
    P.addChild(title);
    this.pickerTitle = title;
    // 6x4 大格，每格 4x4 明度小方块（原版间距/坐标）
    const horizontalSpace = 93.33333333333333;
    const verticalSpace = 96.25;
    for (let bx = 0; bx < 6; bx++) {
      for (let by = 0; by < 4; by++) {
        const cx = 20 + (bx + 0.5) * horizontalSpace;
        const cy = 52 + (by + 0.5) * verticalSpace;
        for (let sx = 0; sx < 4; sx++) {
          for (let sy = 0; sy < 4; sy++) {
            const sq = new Sprite();
            const g = new Graphics();
            g.beginFill(0);
            g.drawRect(0, 0, 15, 15);
            sq.graphics = g;
            sq.x = cx - 37.5 + sx * 20;
            sq.y = cy - 37.5 + sy * 20;
            const idx: [number, number, number, number] = [bx, by, sx, sy];
            sq.addEventListener("click", () => this.pickerPick(idx));
            P.addChild(sq);
            this.pickerSquares.push({ disp: sq, rgb: { r: 0, g: 0, b: 0 }, idx });
          }
        }
      }
    }
    // 当前色标记框（原版 currentSquareMark 20x20 白框）
    const mark = new Sprite();
    const mg = new Graphics();
    mg.lineStyle(1, 16777215, 0.8);
    mg.drawRect(0, 0, 20, 20);
    mark.graphics = mg;
    mark.mouseEnabled = false; // 标记框仅装饰，不应拦截下方色块的点击
    P.addChild(mark);
    this.pickerMark = mark;
    // 完成按钮（原版 1229 @197,459）
    const done = new Button(2, () => { P.visible = false; if (this.nameInput) this.nameInput.style.visibility = "visible"; }, this.text(1229).toUpperCase(), this.assets);
    done.x = 197; done.y = 459;
    P.addChild(done);
    // 自然色开关（原版 7101 @20,465）
    const flip = () => {
      this.pickerNatural = !this.pickerNatural;
      this.updateColorPickerSquares();
      this.updateColorPickerMark();
    };
    const natural = new Switch(5, false, flip, flip, null, null, 10, 10, false);
    natural.x = 20; natural.y = 465;
    P.addChild(natural);
    P.addChild(new EngineText(this.text(7101), 16777215, 12, "left", 40, 461, 160, 18));
    this.picker = P;
    this.screen.addChild(P);
  }

  private pickerRangesFor(key: string) {
    const r = { ...(COLOR_RANGES[key] ?? COLOR_RANGES.skin) };
    if (this.pickerNatural) {
      if (key === "hair" || key === "beard" || key === "eyebrows") { r.minH = 30; r.maxH = 90; r.maxS = 70; }
      else if (key === "lips") { r.maxH = 30; r.minS = 50; r.maxS = 90; r.minV = 40; r.maxV = 90; }
      else if (key === "eyeSockets") { r.minH = 0; r.maxH = 30; r.minS = 20; r.maxS = 45; r.minV = 35; r.maxV = 100; }
    }
    return r;
  }

  private updateColorPickerSquares() {
    if (!this.picker || !this.pickerTitle) return;
    const key = this.pickerKey;
    const ci = Math.max(0, COLORS.indexOf(key));
    this.pickerTitle.text = this.text(COLOR_NAMES[ci]).toUpperCase();
    const r = this.pickerRangesFor(key);
    const base = COLOR_RANGES[key] ?? COLOR_RANGES.skin;
    const hueStep = (r.maxH - r.minH) / 6;
    const satStep = (r.maxS - r.minS) / 4;
    const valStep = (r.maxV - r.minV) / 16;
    for (const s of this.pickerSquares) {
      const [bx, by, sx, sy] = s.idx;
      const h = base.minH + bx * hueStep;
      const sat = base.minS + by * satStep;
      const v = base.minV + (sy * 4 + sx) * valStep;
      const rgb = hsv2rgb(h, sat, v);
      s.rgb = rgb;
      // t11：buildColorPicker 已为每个色块建好 Graphics(beginFill+drawRect(0,0,15,15))，原地改色零分配
      const g = s.disp.graphics;
      if (g) g.setFillColor((rgb.r << 16) | (rgb.g << 8) | rgb.b);
    }
  }

  private updateColorPickerMark() {
    if (!this.pickerMark || !this.pickerKey) return;
    const r = this.pickerRangesFor(this.pickerKey);
    const hueStep = (r.maxH - r.minH) / 6;
    const satStep = (r.maxS - r.minS) / 4;
    const valStep = (r.maxV - r.minV) / 16;
    const base = COLOR_RANGES[this.pickerKey] ?? COLOR_RANGES.skin;
    const hIdx = clamp(Math.round((this.pickerHsv.h - base.minH) / hueStep), 0, 5);
    const sIdx = clamp(Math.round((this.pickerHsv.s - base.minS) / satStep), 0, 3);
    const vIdx = clamp(Math.round((this.pickerHsv.v - base.minV) / valStep), 0, 15);
    const sx = vIdx % 4, sy = Math.floor(vIdx / 4);
    const sq = this.pickerSquares.find((x) => x.idx[0] === hIdx && x.idx[1] === sIdx && x.idx[2] === sx && x.idx[3] === sy);
    if (sq) { this.pickerMark.x = sq.disp.x - 2.5; this.pickerMark.y = sq.disp.y - 2.5; }
  }

  private pickerPick(idx: [number, number, number, number]) {
    const sq = this.pickerSquares.find((x) => x.idx[0] === idx[0] && x.idx[1] === idx[1] && x.idx[2] === idx[2] && x.idx[3] === idx[3]);
    if (!sq || !this.pickerKey) return;
    this.theCharacter.colors[this.pickerKey] = { r: sq.rgb.r, g: sq.rgb.g, b: sq.rgb.b };
    this.pickerHsv = rgb2hsv(sq.rgb.r, sq.rgb.g, sq.rgb.b);
    sfxClick();
    this.refreshColorBoxes();
    this.drawPortrait();
    this.updateColorPickerMark();
  }

  private refreshColorBoxes() {
    for (const cb of this.colorBoxes) {
      const c = this.theCharacter.colors[cb.key];
      // t11：复用构建期建好的 Graphics(beginFill+drawRect(0,0,120,14))，原地改色（等价替换，不改坐标/行为）
      const g = cb.box.graphics;
      if (g) g.setFillColor((clamp(Math.round(c.r), 0, 255) << 16) | (clamp(Math.round(c.g), 0, 255) << 8) | clamp(Math.round(c.b), 0, 255));
    }
  }

  // ---------------- 肖像（复用 Portrait.ts 公共 3 色矩阵管线，原版 generatePortrait） ----------------
  private drawPortrait() {
    this.portrait.removeAll();
    // 直接挂返回的 Sprite：公共模块异步补图时重绘的是该 Sprite，挂为子节点即可随重绘更新
    this.portrait.addChild(buildPortraitFromCharacter(this.assets, this.theCharacter, 1));
  }

  private ensurePortraitAssets(names: string[]) {
    const todo = names.filter((n) => !this.portraitAttempted.has(n));
    if (!todo.length) return;
    todo.forEach((n) => this.portraitAttempted.add(n));
    Promise.all(todo.map((n) => this.assets.ensure(n).catch(() => null)))
      .then(() => { if (this.portrait) this.drawPortrait(); })
      .catch(() => undefined);
  }

  private refreshGender() {
    const ch = this.theCharacter;
    const age = ch.age ?? 25;
    this.refreshRadios();
    for (const p of PARTS) {
      const opts = optsFor(p.key, ch.gender, age);
      if (opts.includes(this.desiredParts[p.key])) ch.parts[p.key] = this.desiredParts[p.key];
      else if (!opts.includes(ch.parts[p.key] ?? 0)) {
        ch.parts[p.key] = opts.length ? opts[Math.floor(Math.random() * opts.length)] : 0;
      }
    }
    this.drawPortrait();
  }

  private finish() {
    const ch = this.theCharacter;
    if (!ch.name) ch.name = this.randomName();
    if (this.onDone) this.onDone();
  }
}

