// CaravanMenu：原版车队目录的十个内容标签页与关闭入口
import { Sprite, Graphics, BitmapObject, ClipSprite } from "../core/Display";
import { itemGroupOf } from "./Economy";
import { itemAmount } from "./ItemQuantity";
import { EngineText } from "../core/EngineText";
import { ScrollableArea, Button, Switch } from "../core/Ui";
import { Input } from "../core/Input";
import { assignedCapacity, moveContainer } from "./LiquidStorage";
import { CalculatorPanel } from "../core/CalculatorPanel";
import { addDialogueBackground } from "../core/DialogueBg";
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import { GameData, Character } from "./World";
import { getItemData, itemName, Economy } from "./Economy";
import { sfxClick, sfxPage, sfxMetallicClick } from "../core/Sound";
import { buildPortraitFromCharacter } from "./Portrait";
import { ConsProdGraph, numberFormat } from "./ConsProdGraph";
import { PaperArrow } from "../core/PaperArrow";
import { attachItemIcon } from "./ItemIcon";
import { makePersonCell } from "./PeopleGrid";
import { drawItemCellBG, drawItemCellSelect } from "./ItemCell";
import { itemDetailRows, itemCursorRows, attachItemCursorInfo } from "./ItemInfo";
import { CursorInfoPanel } from "../core/CursorInfoPanel";
import { workshopRecipes } from "./workshopRecipes";
import { CaravanSettingsWindow } from "./CaravanSettingsWindow";
import { YesNoDialogue } from "./YesNoDialogue";

// 原版 11 页签（TEAM-CARAVANMENU-SPEC §1）：概观/日志/人员/装备/用品/载具·家畜/拖车/乘客/货物/工作房/关闭
// categoryButtonYs = [12,52,102,142,182,232,272,312,362,402,452]（原版 L874）
const TAB_Y = [12, 52, 102, 142, 182, 232, 272, 312, 362, 402, 452];
const TABS: Array<{ label: string; id: number }> = [
  { label: "OVERVIEW", id: 0 },      // 892
  { label: "LOG", id: 1 },           // 893
  { label: "CREW", id: 2 },          // 894
  { label: "EQUIP", id: 3 },         // 895（合并 WEAPONS/ARMOR/AMMO/GEAR）
  { label: "SUPPLIES", id: 4 },      // 1427（用品：6 组配给）
  { label: "TRANSPORT", id: 5 },     // 897 + 1176（载具·家畜）
  { label: "CARTS", id: 6 },         // 898（挂接）
  { label: "PASSENGERS", id: 7 },    // 899（座位）
  { label: "CARGO", id: 8 },         // 900
  { label: "WORKSHOP", id: 9 },      // 901
  { label: "CLOSE", id: 10 },        // 902
];
const CAT_NAMES = ["Volunteer", "Mercenary", "Prisoner", "Slave"];

// 页签文字规则（原版 L929-945）：i==5 → 897+"/"+1176（载具/家畜），i==4 → 1427（用品），其余 → 892+i
function tabLabelText(ds: DataStore, i: number): string {
  if (i === 5) return getText(ds, 897, ds.language) + "/" + getText(ds, 1176, ds.language);
  if (i === 4) return getText(ds, 1427, ds.language);
  return getText(ds, 892 + i, ds.language);
}

export interface CaravanMenuHooks {
  onClose: () => void;
  onSave: () => void;
  onOptions?: () => void; // 概观页 Settings(36) 按钮 → 选项面板
}

export class CaravanMenu {
  readonly screen = new Sprite();
  private category = 0;
  // t63⑦ Shell 重开菜单时需检查内容是否清空（页签 10 关闭后）→ public
  mainArea!: Sprite;
  private tabButtons: Array<{ disp: Sprite; id: number }> = [];
  private tabShines: Sprite[] = [];
  private bottomCap!: EngineText;
  private bottomMoney!: EngineText;
  private bottomDate!: EngineText;
  private timeAcc = 0;

  constructor(
    private gd: GameData, private ds: DataStore, private assets: AssetStore, private hooks: CaravanMenuHooks,
  ) {
    this.build();
  }

  private text(id: number) { return getText(this.ds, id, this.ds.language); }
  // 运输单位显示名：givenName（玩家命名）→ 本地化类型名（原版 TransportUnit.name getter 语义）
  private tName(tr: any): string {
    if (tr && typeof tr.givenName === "string" && tr.givenName.length > 0) return tr.givenName;
    const t = this.ds?.transports?.Types?.[tr?.type];
    return t && t.name ? this.text(t.name) : "?";
  }

  private build() {
    const S = this.screen;
    // 原版 CaravanMenu.as L874：D = new Dialogue(880,495) — InterfaceBackground 纹理 + 高光/阴影边框
    // t85：全屏背景=InterfaceBackground.png（锈金属质感，非羊皮纸）；仅日记内容区用 TownBG 羊皮纸
    addDialogueBackground(S, this.assets, 0, 0, 880, 495, 0.08, "InterfaceBackground.png", false);
    const g = new Graphics();
    g.hitRect(0, 0, 880, 495); // 整屏拦截点击（菜单打开时地图不可点）
    S.graphics = g;
    // 注：原版 CaravanMenu 无标题（spec §2 坐标为屏幕绝对坐标，内容自 y=12 起）——标题已移除
    // 分隔线（原版 D.drawVerticalLine(660,0,495) / drawHorizontalLine(472,0,660)）
    // 原版 Dialogue.as L126-172 并非单条黑线：分隔线被写进 highlights(screen)/shadows(multiply) 位图，
    // 组成双层斜面——阴影侧 x-1/x-2（或 y-1/y-2）半透明黑 0x66/0x22 + 高光侧 x/x+1（或 y/y+1）半透明白 0x33/0x11。
    // web canvas 无 screen/multiply → 用半透明填充近似（同 DialogueBg 外框做法），且仅中间段画第二层（原版 x>2&&x<w-3 / y>2&&y<h-3）
    const mkSep = (draw: (g: Graphics) => void) => {
      const s = new Sprite();
      const sg = new Graphics();
      draw(sg);
      s.graphics = sg;
      s.mouseEnabled = false;
      S.addChild(s);
    };
    // 竖直分隔 x=660：阴影在内容侧(659/658)，高光在页签侧(660/661)
    mkSep((sg) => {
      sg.beginFill(0, 0.40); sg.drawRect(659, 0, 1, 495); sg.endFill();
      sg.beginFill(0, 0.13); sg.drawRect(658, 3, 1, 489); sg.endFill(); // 第二层仅 y∈[3,491]
      sg.beginFill(0xffffff, 0.20); sg.drawRect(660, 0, 1, 495); sg.endFill();
      sg.beginFill(0xffffff, 0.07); sg.drawRect(661, 3, 1, 489); sg.endFill(); // 第二层仅 y∈[3,491]
    });
    // 水平分隔 y=472：阴影在内容侧(471/470)，高光在底栏侧(472/473)
    mkSep((sg) => {
      sg.beginFill(0, 0.40); sg.drawRect(0, 471, 660, 1); sg.endFill();
      sg.beginFill(0, 0.13); sg.drawRect(0, 470, 660, 1); sg.endFill();
      sg.beginFill(0xffffff, 0.20); sg.drawRect(0, 472, 660, 1); sg.endFill();
      sg.beginFill(0xffffff, 0.07); sg.drawRect(0, 473, 660, 1); sg.endFill();
    });
    // 右侧页签（原版 L897-945）：按钮 CaravanMenuCategoryButton @668,ys-2；shine @645,ys-25；文字 14px @670,ys+6
    for (let i = 0; i < TABS.length; i++) {
      const b = new Sprite();
      const hg = new Graphics();
      hg.hitRect(0, 0, 204, 34);
      b.graphics = hg;
      const bi0 = this.assets.getImage("CaravanMenuCategoryButton.png");
      if (bi0) { const bi = new BitmapObject(bi0); bi.mouseEnabled = false; b.addChild(bi); }
      void this.assets.ensure("CaravanMenuCategoryButton.png").then((im) => { if (im && b.numChildren() === 0) { const nb = new BitmapObject(im); nb.mouseEnabled = false; b.addChild(nb); } });
      b.x = 668; b.y = TAB_Y[i] - 2;
      b.buttonMode = true; b.mouseChildren = false;
      const tab = TABS[i].id;
      b.addEventListener("click", () => { sfxMetallicClick(); this.setCategory(tab); });
      S.addChild(b);
      this.tabButtons.push({ disp: b, id: TABS[i].id });
    }
    for (let i = 0; i < TABS.length; i++) {
      // 当前页 shine 高亮（原版 categoryButtonShining @645,ys-25，250x80）
      const shine = new Sprite();
      const shImg = this.assets.getImage("CaravanMenuCategoryButtonShine.png");
      if (shImg) { const si = new BitmapObject(shImg); si.mouseEnabled = false; shine.addChild(si); }
      void this.assets.ensure("CaravanMenuCategoryButtonShine.png").then((im) => { if (im && shine.numChildren() === 0) { const si = new BitmapObject(im); si.mouseEnabled = false; shine.addChild(si); } });
      shine.x = 645; shine.y = TAB_Y[i] - 25;
      shine.mouseEnabled = false; shine.mouseChildren = false;
      S.addChild(shine);
      this.tabShines.push(shine);
    }
    for (let i = 0; i < TABS.length; i++) {
      // 页签文字（黑字 14px @670,ys+6，原版 InterfaceForeground 黑掩码近似）
      const t = new EngineText(tabLabelText(this.ds, i), 0, 14, "center", 670, TAB_Y[i] + 7, 200, 16);
      t.mouseEnabled = false;
      S.addChild(t);
    }
    // 底部信息（原版 CaravanMenu.as L892-896：cap/date 宽 640，money 居中）
    this.bottomCap = new EngineText("", 16777215, 14, "left", 10, 472, 640, 20);
    this.bottomMoney = new EngineText("", 16777215, 14, "left", 250, 472, 640, 20);
    this.bottomDate = new EngineText("", 16777215, 14, "right", 10, 472, 640, 20);
    S.addChild(this.bottomCap);
    S.addChild(this.bottomMoney);
    S.addChild(this.bottomDate);
    // 主区（原版内容坐标为屏幕绝对坐标：mainArea 置 (0,0)）
    this.mainArea = new Sprite();
    // 内容区偏移 (0,40)：原版 11 个内容页坐标为屏幕绝对坐标（t93：修正整体右移 10px；y=40 为标题栏高度，
    // 冒烟点击坐标按 local+(0,40) 计算；t43 教训是 y=0 会让整页上移 40px 点击失效，x 无此问题）
    this.mainArea.x = 0; this.mainArea.y = 40;
    S.addChild(this.mainArea);
    // t63⑦ 默认标签=上次关闭前标签（原版 GameData.as L538 lastCaravanMenuCategory 默认 2=人员页）
    this.setCategory(this.gd.lastCaravanMenuCategory);
  }

  // t47：移除本菜单挂在 screen 上的全部弹窗（wsConfirm/fleetConfirm/skillsOv/weightOv/containersOv/
  // crewConfirm/crewFreeOv/cargoMapMessage/cargoReadOv/cargoWithdrawOv），字段置空由各 open 方法惰性重建
  private removeOverlays() {
    this.closeFleetRename();
    this.eqCalcPanel?.close();
    this.quantityCalc?.close();
    if (this.containerDraft) Input.drag = null;
    this.containerDraft = null;
    const ovs: Array<Sprite | null> = [
      this.wsConfirm, this.fleetConfirm, this.skillsOv, this.weightOv, this.containersOv,
      this.eqSkillsOv, this.eqCalcPanel ? this.eqCalcPanel.ov : null,
      this.crewConfirm, this.crewFreeOv, this.cargoMapMessage, this.cargoReadOv, this.cargoWithdrawOv, this.settingsOv,
    ];
    for (const ov of ovs) if (ov) this.screen.removeChild(ov);
    this.settingsOv = null;
    this.eqSkillsOv = null;
    this.wsConfirm = null; this.fleetConfirm = null; this.skillsOv = null;
    this.weightOv = null; this.containersOv = null; this.crewConfirm = null;
    this.crewFreeOv = null; this.cargoMapMessage = null; this.cargoReadOv = null; this.cargoWithdrawOv = null;
  }

  setCategory(n: number) {
    n = Number.isInteger(n) && n >= 0 && n <= 10 ? n : 2;
    this.category = n;
    // t63⑦ 切页写回记住的标签（原版 CaravanMenu.as L7010 setCat 内 GD.lastCaravanMenuCategory = category；关闭 10 不写）
    if (n <= 9) this.gd.lastCaravanMenuCategory = n;
    // t47：切页统一移除 screen 上的本菜单弹窗（防叠加残留；字段置空 → 下次打开惰性重建）
    this.removeOverlays();
    for (let i = 0; i < this.tabButtons.length; i++) {
      const tb = this.tabButtons[i];
      // 原版：当前页 shine 高亮（mouseEnabled = i != category）
      if (this.tabShines[i]) this.tabShines[i].visible = tb.id === n;
      (tb.disp as any).mouseEnabled = tb.id !== n;
    }
    this.mainArea.removeAll();
    const c = this.gd.Caravans[0];
    switch (n) {
      case 0: this.renderOverview(); break;       // 概观 892
      case 1: this.renderLog(); break;            // 日志 893
      case 2: this.renderPeople(); break;         // 人员 894
      case 3: this.renderEquipment(); break;      // 装备 895（9 槽 + 12 类物品列表）
      case 4: this.renderRations(); break;        // 用品 1427（6 组配给）
      case 5: this.renderTransport(); break;      // 载具·家畜 897+1176
      case 6: this.renderCarts(); break;          // 拖车 898（挂接）
      case 7: this.renderPassengers(); break;     // 乘客 899（座位）
      case 8: this.renderCargo(); break; // 货物 900
      case 9: this.renderWorkshop(); break;       // 工作房 901
      case 10: this.hooks.onClose(); break; // 关闭 902
    }
    void c;
    this.refreshBottom();
  }

  // ---------- 概观页弹窗（原版 skillsWindow / weightChartDialogue / manageContainers；懒建 + visible 切换） ----------
  private settingsOv: CaravanSettingsWindow | null = null;
  private openSettings() {
    if(this.settingsOv)this.screen.removeChild(this.settingsOv);
    this.settingsOv=new CaravanSettingsWindow(this.gd,this.ds,this.assets,()=>{this.settingsOv=null;this.renderOverview();});
    this.screen.addChild(this.settingsOv);
  }
  private skillsOv: Sprite | null = null;
  private weightOv: Sprite | null = null;
  private containersOv: Sprite | null = null;

  // ---------- Workshop 工作房（原版 CaravanMenu.updateWorkshop L3030 / clickOnWorkshopItem / produceItem） ----------
  private workshopItems: Array<any> = [];
  private wsCalc: { ov: Sprite; value: number; min: number; max: number; done: (v: number) => void; val: EngineText } | null = null;
  private wsConfirm: YesNoDialogue | null = null;

  private renderWorkshop() {
    const S = this.mainArea;
    S.removeAll();
    const c = this.gd.Caravans[0];
    if (this.wsCalc) { S.removeChild(this.wsCalc.ov); this.wsCalc = null; }
    const list = new ScrollableArea(630, 450, 630, 450, true, false, false, 10, 10, this.assets); // t92 S16 workshop
    list.x=10; list.y=-28;
    S.addChild(list);
    this.workshopItems = [];
    const produced = this.gd.producedToday ?? {};
    const reqTitle = this.text(1555).toUpperCase() + ": ";
    const reqWidth = new EngineText(reqTitle, 16777215, 12, "left", 0, 0, 500, 20).textWidth + 5;
    const skillNameIds: Record<string, number> = { doctor: 1556, veterinary: 1557, mechanic: 1558, hunting: 1559, collecting: 1560, smuggling: 1561 };
    workshopRecipes(this.ds).forEach((rec, i) => {
      const item: any = { rec, ind: i, maxAmount: Infinity, canProduce: true };
      // 原料（可用量 = 总量 − 在用量）
      for (const m of rec.requiredMaterials) {
        const thisMax = Math.floor(c.availableCargo(m.type) / m.amount);
        if (thisMax <= 0) item.canProduce = false;
        item.maxAmount = Math.min(item.maxAmount, thisMax);
      }
      // 工具（设备 → 需工作中；否则需在货物中）
      for (const t of rec.requiredTools) {
        const def = getItemData(this.ds, t);
        const ok = def && def.device ? c.devicesWorking(t) > 0 : c.cargoAmount(t) > 0;
        if (!ok) item.canProduce = false;
      }
      // 技能（原版：currRel = skill/min，minRel 取最小比值）
      let minRel = Infinity;
      for (const s of rec.requiredSkills) {
        const cur = c.workshopSkill(s.skill);
        if (cur >= s.min) minRel = Math.min(minRel, cur / s.min);
        else item.canProduce = false;
      }
      if (minRel === Infinity) minRel = 1;
      item.maxPerDay = Math.round(minRel * rec.perDay);
      const canProduceToday = item.maxPerDay - (produced[i] ?? 0);
      if (canProduceToday <= 0) item.canProduce = false;
      item.maxAmount = Math.min(item.maxAmount, canProduceToday);
      item.canProduceToday = canProduceToday;
      this.workshopItems.push(item);
    });
    // 可制造在前（原版 sortOn("canProduce",2) DESC）
    this.workshopItems.sort((a, b) => (b.canProduce ? 1 : 0) - (a.canProduce ? 1 : 0));
    let y = 0;
    for (const item of this.workshopItems) {
      const row = new Sprite();
      row.x = 10; row.y = y + 10;
      const bg = new Graphics();
      bg.beginFill(4210752);
      bg.drawRect(0, 0, 610, 100);
      row.graphics = bg;
      const light = new Sprite(), lg = new Graphics(); lg.beginFill(6316128); lg.drawRect(0,0,610,100); light.graphics=lg; light.visible=false; light.mouseEnabled=false; row.addChild(light);
      // 边框
      const frame = new Sprite();
      const fg = new Graphics();
      fg.lineStyle(1, 10526880);
      fg.drawRect(0, 0, 610, 100);
      frame.graphics = fg;
      row.addChild(frame);
      // 成品图标框
      const picBG = new Sprite();
      const pg = new Graphics();
      pg.lineStyle(1, 10526880);
      pg.beginFill(7368816);
      pg.drawRect(0, 0, 80, 80);
      picBG.graphics = pg;
      picBG.x = 10; picBG.y = 10;
      row.addChild(picBG);
      // 成品图标预览（t75③ 原版 workshopItems[i].pic = tmpItem.picture scale0.32 @(10,10)；attachItemIcon 80×80 居中）
      const prodIcon = new Sprite();
      attachItemIcon(this.assets, this.ds, prodIcon, item.rec.outcome, { size: 80 });
      prodIcon.x = 10; prodIcon.y = 10;
      prodIcon.mouseEnabled = false;
      prodIcon.mouseChildren = false;
      row.addChild(prodIcon);
      // 成品名
      let name = itemName(this.ds, item.rec.outcome).toUpperCase();
      if (item.rec.outcomeAmount !== 1) name += " X " + item.rec.outcomeAmount;
      row.addChild(new EngineText(name, 16777215, 14, "left", 100, 9, 400, 22));
      row.addChild(new EngineText(reqTitle, 16777215, 12, "left", 100, 30, 500, 20));
      // 需求标签（右对齐换行，原版 createWorkshopRequirementItem）
      const chips: Array<{ label: string; ok: boolean }> = [];
      for (const m of item.rec.requiredMaterials) {
        chips.push({ label: itemName(this.ds, m.type).toUpperCase() + " x " + m.amount, ok: c.availableCargo(m.type) >= m.amount });
      }
      for (const t of item.rec.requiredTools) {
        const def = getItemData(this.ds, t);
        chips.push({ label: itemName(this.ds, t).toUpperCase(), ok: def && def.device ? c.devicesWorking(t) > 0 : c.cargoAmount(t) > 0 });
      }
      for (const s of item.rec.requiredSkills) {
        chips.push({ label: this.text(skillNameIds[s.skill] ?? 1556).toUpperCase() + ": " + s.min, ok: c.workshopSkill(s.skill) >= s.min });
      }
      let currLine = 0, linePos = 0;
      for (const ch of chips) {
        const t = new EngineText(ch.label, 16777215, 12, "center", 1, 0, 500, 20);
        const w = t.textWidth + 10;
        t.width = w; // 原版需求标签先量字宽，再收窄文本框；否则文字会居中到 500px 外。
        if (linePos + w > (currLine === 0 ? 500 - reqWidth : 500)) { linePos = 0; currLine++; }
        const chip = new Sprite();
        const cg = new Graphics();
        cg.lineStyle(1, 10526880);
        cg.beginFill(ch.ok ? 7368816 : 3158064);
        cg.drawRect(0, 1, w, 16);
        chip.graphics = cg;
        chip.addChild(t);
        chip.x = 600 - linePos - w;
        chip.y = 30 + currLine * 20;
        linePos += w + 5;
        row.addChild(chip);
      }
      row.addChild(new EngineText(this.text(2864).replace("@number@", String(item.maxPerDay)).toUpperCase(), 16777215, 12, "left", 100, 70, 300, 20));
      row.addChild(new EngineText(item.canProduce ? this.text(1562).replace("@number@", String(item.maxAmount)).toUpperCase() : this.text(1563).toUpperCase(), 16777215, 12, "right", 100, 10, 500, 22));
      if (item.canProduce) {
        row.buttonMode = true;
        row.mouseChildren = false;
        row.addEventListener("pointerover", () => { light.visible=true; });
        row.addEventListener("pointerout", () => { light.visible=false; });
        row.addEventListener("click", () => { light.visible=false; this.clickOnWorkshopItem(item); });
      } else {
        const blackOver = new Sprite();
        const bog = new Graphics();
        bog.beginFill(0, 0.3);
        bog.drawRect(0, 0, 610, 100);
        blackOver.graphics = bog;
        row.addChild(blackOver);
      }
      // Sprite has no automatic Flash bounds; declare the complete row for scrolling.
      (row as any).width = 610; (row as any).height = 100;
      list.addContent(row);
      y += 110;
    }
    list.updateSize();
  }

  private clickOnWorkshopItem(item: any) {
    if (!item.canProduce || item.maxAmount < 1) return;
    if (item.maxAmount === 1) this.produceItem(item, 1);
    else this.openQuantity(1, Math.floor(item.maxAmount), itemName(this.ds,item.rec.outcome), v=>this.produceItem(item,v));
  }

  private produceItem(item: any, amount: number) {
    const c = this.gd.Caravans[0];
    const rec = item.rec;
    const produceAmount = amount * rec.outcomeAmount;
    let productName = itemName(this.ds, rec.outcome);
    if (produceAmount !== 1) productName += " X " + Math.round(produceAmount * 1000) / 1000;
    const materialsList = rec.requiredMaterials.map((m: { type: number; amount: number }) => itemName(this.ds, m.type).toUpperCase() + " X " + Math.round(m.amount * amount * 1000) / 1000);
    const text = this.text(1564).replace("@item@", productName).toUpperCase() + "\n\n" + materialsList.join(", ") + "\n\n" + this.text(1565).toUpperCase();
    if (!this.wsConfirm) {
      this.wsConfirm = new YesNoDialogue(this.ds, this.assets, false);
      this.screen.addChild(this.wsConfirm);
    }
    this.wsConfirm.visible = false;
    this.wsConfirm.show(text, () => {
      const maxToday = item.maxPerDay - (this.gd.producedToday[item.ind] ?? 0);
      const materialsOK = rec.requiredMaterials.every((m: any) => c.availableCargo(m.type) + 1e-8 >= m.amount * amount);
      const toolsOK = rec.requiredTools.every((id: number) => getItemData(this.ds,id)?.device ? c.devicesWorking(id)>0 : c.cargoAmount(id)>0);
      const skillsOK = rec.requiredSkills.every((s: any) => c.workshopSkill(s.skill) >= s.min);
      if (!Number.isInteger(amount) || amount<1 || amount>maxToday || !materialsOK || !toolsOK || !skillsOK) {this.setCategory(9);return;}
      c.addCargo(rec.outcome, rec.outcomeAmount * amount);
      for (const m of rec.requiredMaterials) c.reduceCargo(m.type, m.amount * amount);
      this.gd.producedToday[item.ind] = (this.gd.producedToday[item.ind] ?? 0) + amount;
      this.setCategory(9); // 工作房页（t37 新页签序）
    });
  }

  // 测试钩子：工作房状态快照（smoke S8q 断言用）
  workshopDebug(): any {
    return {
      recipes: this.workshopItems.map((it) => ({
        ind: it.ind, outcome: it.rec.outcome, outcomeAmount: it.rec.outcomeAmount,
        maxAmount: it.maxAmount, maxPerDay: it.maxPerDay, canProduce: it.canProduce,
        canProduceToday: it.canProduceToday,
        producedToday: this.gd.producedToday[it.ind] ?? 0,
      })),
      calc: this.wsCalc ? { visible: true, value: this.wsCalc.value, min: this.wsCalc.min, max: this.wsCalc.max } : null,
      confirm: this.wsConfirm && this.wsConfirm.visible ? this.wsConfirm.text.text : "",
      cargo61: this.gd.Caravans[0].cargoAmount(61),
      cargo65: this.gd.Caravans[0].cargoAmount(65),
      cargo64: this.gd.Caravans[0].cargoAmount(64),
      cargo79: this.gd.Caravans[0].cargoAmount(79),
      cargo94: this.gd.Caravans[0].cargoAmount(94),
    };
  }

  // ---------- FLEET 拆分（t37）：载具·家畜(897)/拖车(898)/乘客(899) 三页共享状态 ----------
  private fleetSelected: any = null;

  private fleetConfirm: YesNoDialogue | null = null;
  private fleetNameInput: HTMLInputElement | null = null;
  private fleetNameOkFn: (() => void) | null = null;

  private fleetDlg(text: string, onOk: (() => void) | null) {
    if (!this.fleetConfirm) { this.fleetConfirm = new YesNoDialogue(this.ds, this.assets, false); this.screen.addChild(this.fleetConfirm); }
    this.screen.setChildIndex(this.fleetConfirm, this.screen.numChildren()-1); // Move the existing modal, never duplicate it.
    this.fleetConfirm.visible = false;
    this.fleetConfirm.show(text, onOk ?? undefined);
  }

  // 以下运输三页直接使用原版舞台坐标，避免 mainArea 的 40px 偏移。
  private fleetPage() { this.mainArea.removeAll(); const s = new Sprite(); s.y = -40; this.mainArea.addChild(s); this.refreshBottom(); return s; }
  private fleetText(s: Sprite, text: string, x: number, y: number, w: number, align: "left" | "center" | "right" = "left", size = 14) {
    const t = new EngineText(text, 0xffffff, size, align, x, y, w, 20); t.mouseEnabled = false; s.addChild(t); return t;
  }
  private fleetPair(s: Sprite, id: number, value: any, x: number, y: number, w: number) {
    this.fleetText(s, this.text(id).toUpperCase(), x, y, w * .7);
    this.fleetText(s, typeof value === "number" ? numberFormat(value, 1, true) : String(value), x + w * .7, y, w * .3, "right");
  }
  private fleetFrame(s: Sprite, x: number, y: number, w: number, h: number) {
    const f = new Sprite(); const g = new Graphics(); g.lineStyle(1, 0xffffff, .5); g.drawRect(x,y,w,h); f.graphics = g; f.mouseEnabled = false; s.addChild(f);
  }
  private fleetButton(s: Sprite, id: number, x: number, y: number, fn: () => void, type = 6, enabled = true) {
    const b = new Button(type, enabled ? fn : null, this.text(id).toUpperCase(), this.assets); b.x = x; b.y = y;
    const g = new Graphics(); g.hitRect(0,0,type === 2 ? 206 : type === 9 ? 126 : 146,28); b.graphics = g;
    b.mouseEnabled = b.mouseChildren = enabled; b.alpha = enabled ? 1 : .4; s.addChild(b); return b;
  }
  private fleetImage(s: Sprite, name: string, x: number, y: number, size?: number) {
    const holder = new Sprite(); holder.x=x; holder.y=y; holder.mouseEnabled=holder.mouseChildren=false; s.addChild(holder);
    const add=(im: HTMLImageElement | null)=>{ if (!im) return; const b=new BitmapObject(im); if(size) b.scaleX=b.scaleY=size/im.width; holder.addChild(b); };
    const im=this.assets.getImage(name); if(im) add(im); else void this.assets.ensure(name).then(add).catch(()=>{});
  }
  private fleetPortrait(s: Sprite, unit: any, x: number, y: number, size: number) {
    if (!unit) return;
    const cell = new Sprite(); cell.x=x; cell.y=y; cell.mouseEnabled=cell.mouseChildren=false; s.addChild(cell);
    this.fleetImage(cell,"GenericBackground.png",0,0,size);
    if (unit instanceof Character) { const p=buildPortraitFromCharacter(this.assets,unit,size/250); cell.addChild(p); }
    else {
      this.fleetImage(cell, "transportIcon"+unit.type+".png",0,0,size);
      if(this.gd.Caravans[0].transportType(unit).category === 1) {
        this.fleetImage(cell, unit.gender===1 ? "InterfaceIconMale.png" : "InterfaceIconFemale.png",size*.04,size*.82,size*.14);
        const age=unit.agePeriod; const name=age===1?"Baby":age===2?"Young":age===4?"Old":null;
        if(name) this.fleetImage(cell,"InterfaceIcon"+name+".png",size*.22,size*.82,size*.14);
        if(unit.pregnant) { const p=new Sprite();const g=new Graphics();g.beginFill(0xffffff,.7);g.drawCircle(size*.92,size*.91,size*.03);p.graphics=g;cell.addChild(p); }
      }
    }
  }
  private fleetBar(s: Sprite, unit: any, x: number, y: number, w: number, current?: number, maximum?: number) {
    const health=current ?? unit?.HP ?? unit?.health ?? 0, max=maximum ?? unit?.maxHP ?? unit?.maxHealth ?? 1;
    const b=new Sprite(),g=new Graphics();g.lineStyle(1,0xffffff,.5);g.drawRect(x,y,w,20);g.beginFill(0xffffff,.8);g.drawRect(x+5,y+5,(w-10)*Math.max(0,Math.min(1,health/Math.max(max,1e-6))),10);b.graphics=g;b.mouseEnabled=false;s.addChild(b);
  }
  private fleetList(s: Sprite, units: any[], selected: any, x: number, select: (u: any)=>void, filters: Array<{name:string,accept:(u:any)=>boolean}> = []) {
    let active = this.fleetFilters.get(this.category*1000+x) ?? -1;
    if(active >= filters.length) active=-1;
    const list=new ScrollableArea(100,filters.length?420:450,100,filters.length?420:450,true,false,false,10,10,this.assets);
    list.x=x;list.y=filters.length?42:12;s.addChild(list);
    const show=()=>{ list.clearAll(); const shown=active<0 ? units : units.filter(filters[active].accept);
      shown.forEach((u,i)=>{
        const cell=u instanceof Character ? makePersonCell(this.assets,this.ds,u,{cellW:90,selected:u===selected}) : new Sprite();
        if(!(u instanceof Character)) { this.fleetPortrait(cell,u,0,0,90); this.fleetBar(cell,u,5,76,70); this.fleetFrame(cell,0,0,90,90); }
        const hit=new Graphics();hit.hitRect(0,0,u instanceof Character ? 250 : 90,u instanceof Character ? 250 : 90);if(u===selected){hit.lineStyle(2,0xffffff);hit.drawRect(1,1,88,88);} if(!(u instanceof Character))cell.graphics=hit;
        cell.x=0;cell.y=i*95;cell.buttonMode=true;cell.addEventListener("click",()=>{sfxClick();select(u);}); list.addContent(cell);
      });list.updateSize(); };
    filters.forEach((f,i)=>{const b=new Sprite();b.x=x+i*30;b.y=12;const g=new Graphics();g.beginFill(active===i?0xffffff:0,.25);g.drawRect(0,0,28,25);g.hitRect(0,0,28,25);b.graphics=g;this.fleetImage(b,"filtericon"+f.name+".png",2,2,22);b.buttonMode=true;b.addEventListener("click",()=>{active=active===i?-1:i;this.fleetFilters.set(this.category*1000+x,active);select(selected);});s.addChild(b);});
    show();
  }
  private fleetFilters = new Map<number,number>();
  private cartsAnimal: any = null;
  private cartsCart: any = null;
  private passTransport: any = null;
  private passSelected: any = null;
  private renderTransport() {
    this.closeFleetRename();
    const s=this.fleetPage(),c=this.gd.Caravans[0];
    if(!c.transports.length){this.fleetText(s,this.text(6854),0,237.5,660,"center");return;}
    if(!c.transports.includes(this.fleetSelected))this.fleetSelected=c.transports[0];
    this.fleetList(s,c.transports,this.fleetSelected,550,u=>{this.fleetSelected=u;this.renderTransport();},[1,2,3].map((cat,i)=>({name:["animals","carts","cars"][i],accept:u=>c.transportType(u).category===cat})));
    const tr=this.fleetSelected,t=c.transportType(tr),cat=t.category;
    this.fleetPortrait(s,tr,10,12,250);this.fleetFrame(s,280,12,260,40);this.fleetText(s,this.tName(tr).toUpperCase(),280,21,260,"center",16);
    this.fleetText(s,this.text(50).toUpperCase()+": "+Math.round(tr.health)+"/"+Math.round(tr.maxHealth),10,272,250);this.fleetBar(s,tr,10,292,250);
    const row=(i:number,id:number,v:any)=>this.fleetPair(s,id,v,280,60+i*20,260);
    row(0,1155,c.transportCapacity(tr));row(1,899,tr.maxPassengers??t.passengers??0);
    if(cat!==2)row(3,6,t.windPowered ? Math.round(tr.speed*100)+"%" : tr.speed);
    if(t.windPowered)this.fleetText(s,this.text(6379),280,140,260,"center",12);
    const price=typeof tr.price==="function"?tr.price():tr.price??t.price??0;
    if(cat===1) {
      row(5,tr.agePeriod===1?1173:1156,tr.agePeriod===1?tr.milkConsumption:tr.forageConsumption);row(6,1137,tr.waterConsumption);row(8,996,tr.weight);
      if(tr.pregnant){this.fleetText(s,this.text(3509),280,260,260);this.fleetText(s,this.text(3510)+": "+Math.floor(tr.remainingPregnancy/7),280,280,260);}
      row(14,1157,Math.round(price/5)*5);row(16,1158,this.text(tr.cart?918:919));
      const prod=tr.production??[];row(19-prod.length,1160,prod.length?"":this.text(949));prod.forEach((p:any,i:number)=>{const y=60+(20-prod.length+i)*20;this.fleetText(s,itemName(this.ds,p.item),280,y,200);this.fleetText(s,numberFormat(p.amount,1,true),480,y,60,"right");});
      const months=Math.floor(tr.age/30);this.fleetPair(s,1166,Math.floor(months/12)+this.text(1168).slice(0,1)+" "+months%12+this.text(1167).slice(0,1),10,322,250);
      this.fleetPair(s,1169,numberFormat(tr.weight*.35,1,true)+" "+this.text(12),10,342,250);
      this.fleetPair(s,1174,numberFormat((t.skinAmount??0)*tr.idealWeight/t.weight,1,true)+" "+this.text(1175),10,362,250);
      this.fleetButton(s,1170,42,389,()=>this.fleetSlaughter(tr),2);this.fleetButton(s,1180,42,414,()=>this.fleetRename(tr),2);
    } else {
      if(cat===2){row(3,1161,c.cartMultiplication(tr));row(5,996,tr.weight);row(7,1004,t.armor??0);row(8,1014,t.fireResistance??0);row(9,1015,t.explosionResistance??0);row(17,1159,this.text(tr.attachedTo?918:919));}
      else {if(!t.windPowered){row(5,1162,tr.fuelConsumption);row(6,1237,tr.fuelTank);}row(8,996,tr.weight);row(10,1004,t.armor??0);row(11,1014,t.fireResistance??0);row(12,1015,t.explosionResistance??0);}
      row(19,1157,Math.round(price/5)*5);
      const liquid=(id:number,key:string,max:string,x:number,w:number)=>{this.fleetText(s,this.text(id)+": "+numberFormat(tr[key]??0,2,true)+"/"+(t[max]??0),x,342,w,"center",12);this.fleetBar(s,tr,x,362,w,tr[key]??0,t[max]??0);};
      if(cat===2){liquid(1177,"lubricantLevel","maxLubricant",10,250);this.fleetButton(s,1178,42,389,()=>{c.fillLubricant(tr);this.renderTransport();},2);}
      else {liquid(14,"waterLevel","maxWater",10,120);liquid(1177,"lubricantLevel","maxLubricant",140,120);this.fleetButton(s,1179,7,389,()=>{c.fillWater(tr);this.renderTransport();},9);this.fleetButton(s,1179,137,389,()=>{c.fillLubricant(tr);this.renderTransport();},9);}
    }
    this.fleetButton(s,1163,42,439,()=>this.fleetAbandon(tr),2);
  }
  private renderCarts() {
    const s=this.fleetPage(),c=this.gd.Caravans[0];const animals=c.transports.filter(u=>c.transportType(u).canDragCarts&&!u.passengerIn&&c.transportCapacity(u)>0);const carts=c.transports.filter(u=>c.transportType(u).category===2&&!u.attachedTo&&!u.passengerIn);
    if(!animals.includes(this.cartsAnimal))this.cartsAnimal=animals[0]??null;if(!carts.includes(this.cartsCart))this.cartsCart=carts[0]??null;
    if(!c.transports.some(u=>[1,2].includes(c.transportType(u).category))){this.fleetText(s,this.text(6855),0,237.5,660,"center");return;}
    this.fleetList(s,animals,this.cartsAnimal,10,u=>{this.cartsAnimal=u;this.renderCarts();});this.fleetList(s,carts,this.cartsCart,550,u=>{this.cartsCart=u;this.renderCarts();});
    const animal=this.cartsAnimal,cart=animal?.cart,selected=this.cartsCart;
    const detail=(u:any,x:number)=>{if(!u)return;this.fleetText(s,this.tName(u).toUpperCase(),x,12,200);this.fleetPortrait(s,u,x===120?120:440,42,100);this.fleetText(s,this.text(50)+": "+Math.round(u.health)+"/"+Math.round(u.maxHealth),x,152,200);this.fleetBar(s,u,x,172,200);this.fleetPair(s,1155,c.transportCapacity(u),x,202,200);this.fleetPair(s,899,u.maxPassengers,x,222,200);};
    detail(animal,120);detail(cart,340);
    if(animal){this.fleetPair(s,6,animal.speed,120,272,200);this.fleetText(s,this.text(1155)+": "+numberFormat(c.capacityWithCart(animal),1,true),240,51,180,"center");this.fleetText(s,this.text(899)+": "+c.seatCapacity(animal),240,81,180,"center");}
    if(cart){this.fleetPair(s,1161,c.cartMultiplication(cart),340,252,200);this.fleetPair(s,996,cart.weight,340,272,200);this.fleetButton(s,1183,257,109,()=>{c.detachCart(animal);this.renderCarts();});}
    this.fleetFrame(s,110,300,440,1);
    if(selected){this.fleetFrame(s,120,312,420,40);this.fleetText(s,this.tName(selected).toUpperCase(),130,322,400,"center");this.fleetPortrait(s,selected,440,362,100);this.fleetPair(s,1155,c.transportCapacity(selected),270,362,160);this.fleetPair(s,899,selected.maxPassengers,270,382,160);this.fleetPair(s,1161,c.cartMultiplication(selected),270,422,160);this.fleetPair(s,996,selected.weight,270,442,160);if(animal&&c.canAttachCart(animal,selected)){this.fleetButton(s,1184,117,359,()=>{c.attachCart(animal,selected);this.renderCarts();});}else if(animal)this.fleetText(s,this.text(1020),120,369,140,"center",12);}
  }
  private renderPassengers() {
    const s=this.fleetPage(),c=this.gd.Caravans[0];const vehicles=c.transports.filter(u=>c.transportType(u).category!==2&&c.seatCapacity(u)>0&&!u.passengerIn);
    if(!c.transports.some(u=>c.transportType(u).category!==2&&(u.maxPassengers??0)>0)){this.fleetText(s,this.text(6854),0,237.5,660,"center");return;}
    const candidates=[...c.People.filter(p=>!p.passengerIn),...c.transports.filter(u=>!u.passengerIn&&!u.attachedTo&&!u.cart)];
    if(!vehicles.includes(this.passTransport))this.passTransport=vehicles[0]??null;if(!candidates.includes(this.passSelected))this.passSelected=candidates[0]??null;
    this.fleetList(s,vehicles,this.passTransport,10,u=>{this.passTransport=u;this.renderPassengers();});this.fleetList(s,candidates,this.passSelected,550,u=>{this.passSelected=u;this.renderPassengers();});
    const tr=this.passTransport,p=this.passSelected;
    if(tr){this.fleetFrame(s,120,12,420,40);this.fleetText(s,this.tName(tr).toUpperCase(),130,22,400,"center");this.fleetPortrait(s,tr,120,62,100);if(tr.cart){this.fleetText(s,"+",222,99,36,"center",24);this.fleetPortrait(s,tr.cart,260,62,100);}
      this.fleetText(s,this.text(899)+": "+c.occupiedSpaces(tr)+"/"+c.seatCapacity(tr),380,62,160,"center");this.fleetText(s,this.text(1155)+": "+numberFormat(c.passengersWeight(tr),1,true)+"/"+numberFormat(c.capacityWithCart(tr),1,true),380,102,160,"center");this.fleetButton(s,927,387,139,()=>{for(const p of [...c.passengersOf(tr)])c.unseatPassenger(p);this.renderPassengers();});
      const seated=new ScrollableArea(410,100,410,100,true,false,false,10,10,this.assets);seated.x=120;seated.y=182;s.addChild(seated);
      c.passengersOf(tr).forEach((u,i)=>{const cell=new Sprite();this.fleetPortrait(cell,u,0,0,40);this.fleetText(cell,String(c.passengerSpaces(u)),0,25,40,"right",12);const g=new Graphics();g.hitRect(0,0,40,40);cell.graphics=g;cell.x=(i%9)*45;cell.y=Math.floor(i/9)*45;cell.buttonMode=true;cell.addEventListener("click",()=>{sfxClick();c.unseatPassenger(u);this.renderPassengers();});seated.addContent(cell);});seated.updateSize();
    }
    this.fleetFrame(s,110,300,440,1);
    if(p){this.fleetFrame(s,120,312,420,40);this.fleetText(s,(p instanceof Character?p.name:this.tName(p)).toUpperCase(),130,322,400,"center");this.fleetPortrait(s,p,440,362,100);this.fleetText(s,this.text(50)+": "+Math.round(p.HP??p.health)+"/"+Math.round(p.maxHP??p.maxHealth),270,362,160);this.fleetBar(s,p,270,382,160);this.fleetPair(s,6,p.speed??p.speedKmh??0,270,402,160);this.fleetPair(s,1155,p.capacity??0,270,422,160);if(!(p instanceof Character))this.fleetPair(s,899,p.maxPassengers??0,270,442,160);this.fleetPair(s,996,p.weight,120,402,140);this.fleetText(s,this.text(1186),120,422,140);this.fleetText(s,String(c.passengerSpaces(p)),120,442,140,"center");
      if(tr){const reason=c.canSeat(p,tr);if(reason)this.fleetText(s,reason,120,369,140,"center",12);else this.fleetButton(s,1187,117,359,()=>{c.seatPassenger(p,tr);this.renderPassengers();});}
    }
  }

  private fleetRenameCleanup: (() => void) | null = null;
  private closeFleetRename() { this.fleetRenameCleanup?.(); this.fleetRenameCleanup=null; this.fleetNameInput=null; this.fleetNameOkFn=null; }
  private fleetRename(tr: any) {
    this.closeFleetRename();
    const ov=new Sprite(),g=new Graphics();g.beginFill(0,.5);g.drawRect(0,0,880,495);g.hitRect(0,0,880,495);ov.graphics=g;
    addDialogueBackground(ov,this.assets,190,148,500,200,.2,undefined,false);this.screen.addChild(ov);
    this.fleetText(ov,this.text(1182).toUpperCase()+":",190,198,500,"center");
    const inp=document.createElement("input");inp.value=this.tName(tr);inp.maxLength=25;inp.setAttribute("aria-label",this.text(1182));
    inp.style.cssText='position:fixed;box-sizing:border-box;background:#b0a8a0;color:#403830;border:1px inset #bbb;text-align:center;font:14px "Microsoft YaHei","Microsoft JhengHei","Noto Sans SC","SimHei",Arial,sans-serif;padding:0;z-index:200;outline:none;';
    const place=()=>{const r=document.querySelector("canvas")?.getBoundingClientRect()??{left:0,top:0,width:880,height:495};inp.style.left=(r.left+240*r.width/880)+"px";inp.style.top=(r.top+228*r.height/495)+"px";inp.style.width=(400*r.width/880)+"px";inp.style.height=(20*r.height/495)+"px";inp.style.fontSize=(14*r.height/495)+"px";};
    const done=()=>{tr.givenName=inp.value.slice(0,25);this.closeFleetRename();this.renderTransport();};
    this.fleetButton(ov,1181,232,275,done,2);this.fleetButton(ov,634,442,275,()=>this.closeFleetRename(),2);
    this.fleetNameInput=inp;this.fleetNameOkFn=done;this.fleetRenameCleanup=()=>{window.removeEventListener("resize",place);inp.remove();this.screen.removeChild(ov);};
    inp.addEventListener("keydown",e=>{e.stopPropagation();if(e.key==="Enter")done();if(e.key==="Escape")this.closeFleetRename();});document.body.appendChild(inp);place();window.addEventListener("resize",place);inp.focus();inp.select();
  }

  // 屠宰（原版 slaughterAnimal：1171 确认 → 肉/皮入货 + 移除）
  private fleetSlaughter(tr: any) {
    const c = this.gd.Caravans[0];
    const t = c.transportType(tr);
    const meatAmt = (tr.weight ?? 0) * 0.35;
    const skinAmt = (t.skinAmount ?? 0) * (tr.idealWeight ?? tr.weight ?? t.weight ?? 100) / (t.weight ?? 100);
    this.fleetDlg(this.text(1171).replace("@animalname@", this.tName(tr)).toUpperCase(), () => {
      c.addCargo(t.meat ?? 76, meatAmt);
      c.addCargo(78, skinAmt);
      c.removeTransport(tr);
      this.renderTransport();
    });
  }

  // 放弃（原版 abandonTransport：1164 确认 → 移除）
  private fleetAbandon(tr: any) {
    const c = this.gd.Caravans[0];
    this.fleetDlg(this.text(1164).replace("@transportname@", this.tName(tr)).toUpperCase(), () => {
      c.removeTransport(tr);
      this.renderTransport();
    });
  }

  // 测试钩子：FLEET 状态快照（smoke S8r 断言用）
  fleetDebug(): any {
    const c = this.gd.Caravans[0];
    return {
      transports: c.transports.map((tr) => ({
        type: tr.type, name: tr.givenName, cat: c.transportType(tr).category,
        passengers: c.passengersOf(tr).length, cap: c.seatCapacity(tr),
        passengerIn: !!tr.passengerIn, cart: !!tr.cart, attachedTo: !!tr.attachedTo,
      })),
      selected: this.fleetSelected ? this.fleetSelected.givenName : null,
      confirm: this.fleetConfirm && this.fleetConfirm.visible ? this.fleetConfirm.text.text : "",
      nameInput: !!this.fleetNameInput,
      cargo76: c.cargoAmount(76), cargo78: c.cargoAmount(78),
    };
  }

  private renderOverview() {
    // t57①：点击分发按钮后本函数会被再次调用——开头必须清空，否则文字/按钮叠加（重叠根因）
    this.mainArea.removeAll();
    const S = this.mainArea;
    const c = this.gd.Caravans[0];
    const cp = c.getConsumptionProduction();
    const T = this.ds.transports?.Types ?? [];
    const nf = (v: number) => Math.round(v).toLocaleString();
    // t57①：mainArea 偏移 (10,40)，本页含 y≥430 元素（分发区/右列按钮）→ 页内坐标用「原版绝对坐标 − 40」，
    // 使屏幕坐标与原版 880×495 舞台一致（spec §2.3 修复方向），杜绝底部越界。
    const Y = (abs: number) => abs - 40;

    // —— 顶部 3 列统计（原版 L948-1020 + updateData L7114-7221；列线 x=220/440，行线 y=142）——
    // 左列（x=10）：总人数/志愿者/雇佣军/俘虏/奴隶/其他；中列（x=230）：士气/薪资/动物/拖车/车
    let v1 = 0, v2 = 0, v3 = 0, v4 = 0, other = 0, salary = 0;
    for (const p of c.People) {
      switch (p.category) {
        case 1: v1++; break;
        case 2: v2++; salary += (p as any).salary ?? 0; break;
        case 3: v3++; break;
        case 4: v4++; break;
        default: other++;
      }
    }
    let a = 0, carts = 0, cars = 0;
    for (const tr of c.transports) {
      const tc = T[tr.type]?.category;
      if (tc === 1) a++; else if (tc === 2) carts++; else if (tc === 3) cars++;
    }
    const statRow = (title: string, value: string, x: number, y: number) => {
      S.addChild(new EngineText(title, 16777215, 14, "left", x, y, 200, 20));
      S.addChild(new EngineText(value, 16777215, 14, "right", x, y, 200, 20));
    };
    statRow(this.text(904).toUpperCase() + ":", nf(c.People.length), 10, Y(12));
    statRow(this.text(905).toUpperCase() + ":", nf(v1), 10, Y(32));
    statRow(this.text(906).toUpperCase() + ":", nf(v2), 10, Y(52));
    statRow(this.text(907).toUpperCase() + ":", nf(v3), 10, Y(72));
    statRow(this.text(908).toUpperCase() + ":", nf(v4), 10, Y(92));
    statRow(this.text(909).toUpperCase() + ":", nf(other), 10, Y(112));
    statRow(this.text(910).toUpperCase() + ":", nf(c.morale), 230, Y(12));
    statRow(this.text(911).toUpperCase() + ":", nf(salary), 230, Y(32));
    statRow(this.text(912).toUpperCase() + ":", nf(a), 230, Y(72));
    statRow(this.text(913).toUpperCase() + ":", nf(carts), 230, Y(92));
    statRow(this.text(914).toUpperCase() + ":", nf(cars), 230, Y(112));
    statRow(this.text(26).toUpperCase() + ":", nf(c.maxCargo), 450, Y(12));
    statRow(this.text(915).toUpperCase() + ":", nf(c.maxCargo - c.totalCargo), 450, Y(32));
    statRow(this.text(916).toUpperCase() + ":", String(Math.round(c.speedKmh * 10) / 10), 450, Y(72));
    statRow(this.text(4).toUpperCase() + ":", c.moving ? this.text(918).toUpperCase() : this.text(919).toUpperCase(), 450, Y(92));
    statRow(this.text(917).toUpperCase() + ":", nf(c.noticeability), 450, Y(112));
    // 列/行分隔线（原版 categoriesMask[0]：220/440 竖线 + 142 横线）
    const sep = new Graphics();
    sep.lineStyle(1, 16777215, 0.5);
    sep.moveTo(220, Y(12)); sep.lineTo(220, Y(142));
    sep.moveTo(440, Y(12)); sep.lineTo(440, Y(142));
    sep.moveTo(10, Y(142)); sep.lineTo(650, Y(142));
    const sepSpr = new Sprite();
    sepSpr.graphics = sep;
    sepSpr.mouseEnabled = false;
    S.addChild(sepSpr);

    // —— 产耗表（原版 L1001-1027：表头 y=152 居中 x=175/335/495；行 y=177..292 步 23）——
    const head = (txt: string, x: number) => S.addChild(new EngineText(txt, 16777215, 14, "center", x, Y(152), 150, 20));
    head(this.text(920).toUpperCase() + ":", 175);
    head(this.text(921).toUpperCase() + ":", 335);
    head(this.text(922).toUpperCase() + ":", 495);
    const find = (arr: Array<{ item: number; amount: number }>, item: number) => {
      const e = arr.find((x) => x.item === item);
      return e ? e.amount : 0;
    };
    // 可用水中含水（原版 updateData _loc12_：Σ 食物 waterPercentage×amount×weightPerUnit）
    let waterInFoodAvail = 0;
    for (const [id, amt] of c.cargo) {
      if (amt <= 0) continue;
      const def = getItemData(this.ds, id);
      if (def && def.food) waterInFoodAvail += (def.waterPercentage ?? 0) * amt * (def.weight ?? 1);
    }
    const kcal = this.text(939), day = this.text(941), L = this.text(11), kg = this.text(12), g = this.text(13), W = this.text(940), km = this.text(943);
    const row = (title: string, avail: string, prod: string, cons: string, y: number) => {
      S.addChild(new EngineText(title, 16777215, 14, "left", 10, y, 260, 20));
      S.addChild(new EngineText(avail, 16777215, 12, "center", 120, y + 1, 260, 20));
      S.addChild(new EngineText(prod, 16777215, 12, "center", 280, y + 1, 260, 20));
      S.addChild(new EngineText(cons, 16777215, 12, "center", 440, y + 1, 260, 20));
    };
    const prodOf = (item: number) => find(cp.production, item);
    const consOf = (item: number) => find(cp.consumption, item);
    row(this.text(15).toUpperCase() + ":", nf(c.food) + " " + kcal,
      nf(cp.foodProduction) + " " + kcal + "/" + day,
      nf(cp.foodConsumption) + " " + kcal + "/" + day, Y(177));
    row(this.text(14).toUpperCase() + ":", nf(c.water) + "+" + nf(waterInFoodAvail) + " " + L,
      (prodOf(1) > 0 ? nf(prodOf(1)) : "0") + "+" + Math.round(cp.waterInFood * 10) / 10 + " " + L + "/" + day,
      (consOf(1) > 0 ? nf(consOf(1)) : "0") + " " + L + "/" + day, Y(200));
    row(this.text(16).toUpperCase() + ":", nf(c.meds) + " " + g,
      "0 " + g + "/" + day,
      (consOf(63) > 0 ? nf(consOf(63)) : "0") + " " + g + "/" + day, Y(223));
    row(this.text(17).toUpperCase() + ":", nf(c.forage) + " " + kg,
      (prodOf(62) > 0 ? nf(prodOf(62)) : "0") + " " + kg + "/" + day,
      (consOf(62) > 0 ? nf(consOf(62)) : "0") + " " + kg + "/" + day, Y(246));
    row(this.text(18).toUpperCase() + ":", nf(c.fuel) + " " + L,
      (prodOf(64) > 0 ? nf(prodOf(64)) : "0") + " " + L + "/" + day,
      (consOf(64) > 0 ? nf(consOf(64)) : "0") + " " + L + "/" + day + " + " + nf(cp.fuelPer100Km) + " " + L + "/100" + km, Y(269));
    row(this.text(19).toUpperCase() + ":", nf(cp.electricityProduction - cp.electricityConsumption) + " " + W,
      nf(cp.electricityProduction) + " " + W,
      nf(cp.electricityConsumption) + " " + W, Y(292));

    // —— 分发区（原版 L1028-1064：标题 923@332，框 (10,332,420,130)，分隔线 y=352；按钮 x=20/230，y=362/392/422）——
    S.addChild(new EngineText(this.text(923).toUpperCase(), 16777215, 14, "center", 10, Y(332), 420, 20));
    const box = new Graphics();
    box.lineStyle(1, 16777215, 0.5);
    box.drawRect(10, Y(332), 420, 130);
    box.moveTo(10, Y(352)); box.lineTo(430, Y(352));
    const boxSpr = new Sprite();
    boxSpr.graphics = box;
    boxSpr.mouseEnabled = false;
    S.addChild(boxSpr);
    // 原版：小方钮 Button(1) 40x40 scale0.8 @x=20/230,y=362/392/422 + 文字浮于按钮右侧
    // 文字 y = (btn.y+15) − min(textHeight,40)/2 − 2（原版 L1041-1064）；x=60/270 w160 left
    const dBtn = (label: string, fn: () => void, x: number, y: number, tx: number) => {
      const b = new Button(1, () => { fn(); this.renderOverview(); }, null, this.assets);
      b.scaleX = b.scaleY = 0.8;
      b.x = x; b.y = Y(y);
      S.addChild(b);
      const t = new EngineText(label, 16777215, 14, "left", tx, Y(y) + 15, 160, 40);
      t.y = (Y(y) + 15) - Math.min(t.textHeight, 40) / 2 - 2;
      t.mouseEnabled = false;
      S.addChild(t);
    };
    dBtn(this.text(924).toUpperCase(), () => { c.distributeWeapons(); c.distributeAmmo(); }, 20, 362, 60);
    dBtn(this.text(925).toUpperCase(), () => c.distributeAmmo(), 20, 392, 60);
    dBtn(this.text(926).toUpperCase(), () => c.distributeArmor(), 20, 422, 60);
    dBtn(this.text(898).toUpperCase(), () => c.distributeTransport(), 230, 362, 270);
    dBtn(this.text(899).toUpperCase(), () => c.distributePassengers(), 230, 392, 270);
    dBtn(this.text(927).toUpperCase(), () => c.removeAllPassengers(), 230, 422, 270);

    // —— 右侧 4 按钮（原版 L1065-1085：x=447，y=329/366/402/439）——
    const rBtn = (label: string, fn: () => void, y: number) => {
      const b = new Button(2, () => { fn(); }, label, this.assets);
      b.x = 447; b.y = Y(y);
      S.addChild(b);
    };
    rBtn(this.text(928).toUpperCase(), () => this.openSkillsWindow(), 329);
    rBtn(this.text(36).toUpperCase(), () => this.openSettings(), 366);
    rBtn(this.text(1202).toUpperCase(), () => this.openWeightChart(), 402);
    rBtn(this.text(1216).toUpperCase(), () => this.openManageContainers(), 439);
  }

  // 原版 Caravan.sight：成员最大鹰眼 × 工作中的最大放大器
  private caravanSight(): number {
    const c = this.gd.Caravans[0];
    let m = 0;
    for (const p of c.People) m = Math.max(m, (p as any).sight ?? 0);
    let amplification=1;
    for(const [id,amount] of c.cargo){const d=getItemData(this.ds,id);if(amount>0&&d?.sightAmplifier&&(!d.device||c.devicesWorking(id)>0))amplification=Math.max(amplification,d.amplification??1);}
    return m*amplification; // Caravan.sight * 100 in the original collective-skills display.
  }

  // Show Skills 窗（原版 L1087-1118：400x400 @240,48，滚动技能列表 345x320，Close 902 @97,357）
  private openSkillsWindow() {
    // Re-evaluate after equipment/crew changes instead of caching the first values.
    if (this.skillsOv) this.screen.removeChild(this.skillsOv);
    this.skillsOv = null;
    if (!this.skillsOv) {
      const ov = new Sprite();
      const bg = new Graphics();
      bg.beginFill(0, 0.5);
      bg.drawRect(0, 0, 880, 495);
      bg.hitRect(0, 0, 880, 495);
      ov.graphics = bg;
      addDialogueBackground(ov, this.assets, 240, 48, 400, 400, 0.2, undefined, false);
      const c = this.gd.Caravans[0];
      const rows: Array<{ id: number; get: () => number }> = [
        { id: 932, get: () => c.doctorSkill() },
        { id: 933, get: () => c.veterinarySkill() },
        { id: 934, get: () => c.mechanicSkill() },
        { id: 935, get: () => c.huntingSkill() },
        { id: 936, get: () => c.collectingSkill() },
        { id: 937, get: () => this.caravanSight() },
        { id: 938, get: () => c.smugglingSkill() },
      ];
      const dark = new Sprite(), dg = new Graphics(); dg.beginFill(4208688, .7); dg.drawRect(260, 68, 360, 320); dark.graphics = dg; dark.mouseEnabled = false; ov.addChild(dark);
      this.fleetFrame(ov, 259, 67, 362, 322);
      // 第 8 参是原版 ScrollableArea 的 style（=3 纹理滑块），不是宽度；宽度是第 9 参，
      // 原版 CaravanMenu.as:1105 此处只传 7 个参数 ⇒ 宽度走默认 15（ScrollableArea.as:45 param9=15）。
      const list = new ScrollableArea(345, 320, 345, 320, true, false, false, 15, 15, this.assets);
      list.x = 240 + 20; list.y = 48 + 20;
      rows.forEach((r, i) => {
        const rs = new Sprite();
        rs.y = i * 40;
        rs.addChild(new EngineText(this.text(r.id).toUpperCase(), 16777215, 14, "left", 10, 10, 325, 20));
        rs.addChild(new EngineText(String(Math.round(r.get())), 16777215, 14, "right", 10, 10, 325, 20));
        list.addContent(rs);
      });
      list.updateSize();
      ov.addChild(list);
      const close = new Button(2, () => { if (this.skillsOv) this.skillsOv.visible = false; }, this.text(902).toUpperCase(), this.assets);
      close.x = 240 + 97; close.y = 48 + 357;
      ov.addChild(close);
      this.screen.addChild(ov);
      this.skillsOv = ov;
    }
    this.skillsOv.visible = true;
  }

  // 概观页分类（原版 filterCategory：2武器/3弹药/4附件/5护甲/1食物·设备·急救·液体·容器·其它）
  private filterCategoryOf(id: number): number {
    const it = this.ds.items.Items[id];
    if (!it) return 9;
    if (it.category === 2) return 0;
    if (it.category === 3) return 1;
    if (it.category === 4) return 2;
    if (it.category === 5) return 3;
    if (it.category === 1) {
      const g = this.ds.items.Goods[it.subCategory];
      if (g?.food) return 4;
      if (g?.device) return 5;
      if (g?.firstAidKit) return 6;
      if (g?.liquid) return 7;
      if (g?.liquidsContainer) return 8;
      return 9;
    }
    return 9;
  }

  // Original 400x450 weight chart: elliptical 20px-deep pie, nonempty legend and selected item.
  private openWeightChart(selectedId: number | null = null) {
    if (!this.weightOv) {
      const ov = new Sprite(), bg = new Graphics();
      bg.beginFill(0, .5); bg.drawRect(0, 0, 880, 495); bg.hitRect(0, 0, 880, 495); ov.graphics = bg;
      addDialogueBackground(ov, this.assets, 240, 23, 400, 450, 0, undefined, false);
      const close = new Button(2, () => { if (this.weightOv) this.weightOv.visible = false; }, this.text(902).toUpperCase(), this.assets);
      close.x = 347; close.y = 430; ov.addChild(close); this.weightOv = ov; this.screen.addChild(ov);
    }
    const ov = this.weightOv, c = this.gd.Caravans[0];
    const previous = ov.children.find(ch => (ch as any).__chart);
    if (previous) ov.removeChild(previous);
    const holder = new Sprite(); (holder as any).__chart = true; holder.mouseEnabled = holder.mouseChildren = false;
    const colors = [15068920,14602788,6972825,9988385,8958127,16773287,14012927,7943220,9790849,13936743];
    const catIds = [1204,298,1205,926,15,1206,197,1207,1208,1200], weights = Array<number>(10).fill(0);
    for (const [id, amount] of c.cargo) if (amount > 0) weights[this.filterCategoryOf(id)] += (getItemData(this.ds,id)?.weight ?? 1) * amount;
    const total = weights.reduce((a,b) => a+b, 0);
    const selectedWeight = selectedId === null ? 0 : (getItemData(this.ds,selectedId)?.weight ?? 1) * c.cargoAmount(selectedId);
    const sectors: Array<{start:number;end:number;color:number}> = [];
    let angle = 0, selectedCenter = 0;
    if (total > 0) for (let i=0; i<weights.length; i++) {
      if (weights[i] <= 0) continue;
      const end = angle + weights[i]/total * Math.PI*2;
      if (selectedId !== null && this.filterCategoryOf(selectedId) === i) selectedCenter = (angle+end)/2;
      sectors.push({start:angle,end,color:colors[i]}); angle = end;
    }
    const pie = new Sprite(), pg = new Graphics(); pie.x = 290; pie.y = 43; pie.mouseEnabled = false;
    const wedge = (start:number,end:number,color:number,depth:number,alpha=1) => {
      pg.beginFill(color,alpha); pg.moveTo(150,105+depth);
      for(let a=start;a<end;a+=.025) pg.lineTo(150+150*Math.sin(a),105-105*Math.cos(a)+depth);
      pg.lineTo(150+150*Math.sin(end),105-105*Math.cos(end)+depth); pg.lineTo(150,105+depth); pg.endFill();
    };
    for(let depth=20;depth>0;depth--) for(const s of sectors) {
      const dark = (Math.round((s.color>>16 & 255)*.55)<<16) | (Math.round((s.color>>8 & 255)*.55)<<8) | Math.round((s.color & 255)*.55);
      wedge(s.start,s.end,dark,depth);
    }
    for(const s of sectors) wedge(s.start,s.end,s.color,0);
    if(selectedWeight>0&&total>0) { const arc=selectedWeight/total*Math.PI*2; wedge(selectedCenter-arc/2,selectedCenter+arc/2,0xffffff,0,.5); }
    pie.graphics=pg; holder.addChild(pie);
    const entries = weights.map((weight,i)=>({weight,color:colors[i],text:catIds[i]})).filter(e=>e.weight>0);
    if(selectedWeight>0) entries.push({weight:selectedWeight,color:0xffffff,text:1209});
    const count=entries.length, split=count>6?Math.ceil(count/2):count;
    entries.forEach((e,i)=>{
      const x=240+(count>6?(i>=split?240:40):150), y=293+60-split*10+(i%split)*20;
      const sw=new Sprite(), sg=new Graphics(); sg.beginFill(e.color); sg.lineStyle(.5,0); sg.drawRect(x-30,y+3,20,15); sw.graphics=sg; sw.mouseEnabled=false; holder.addChild(sw);
      this.fleetText(holder,this.text(e.text).toUpperCase()+": "+Math.round(e.weight)+" "+this.text(12).toUpperCase(),x,y+1,150,"left",12);
    });
    ov.addChild(holder); ov.visible=true;
    this.screen.setChildIndex(ov,this.screen.numChildren()-1);
  }

  // Manage Containers（原版 openManageContainers L3549：按液体分配完整容器，确认后才提交）
  private containerDraft: import("./LiquidStorage").ContainerAssignments | null = null;
  private containerOriginal = "";
  private containerSelected: {from:number;type:number} | null = null;
  private containerContent: Sprite | null = null;
  private containerList: ScrollableArea | null = null;
  private openManageContainers() {
    const c=this.gd.Caravans[0];c.syncLiquidContainers();
    this.containerDraft=JSON.parse(JSON.stringify(c.liquidContainerAssignments));this.containerOriginal=JSON.stringify(this.containerDraft);this.containerSelected=null;this.renderContainers();
  }
  private closeContainers() {
    Input.drag = null;
    if (this.containersOv) this.screen.removeChild(this.containersOv);
    this.containersOv = null; this.containerContent = null; this.containerList = null; this.containerDraft = null; this.containerSelected = null;
    if (this.category === 8) this.renderCargo(); else this.renderOverview();
    this.refreshBottom();
  }
  private moveManagedContainer(to: number) {
    const selected=this.containerSelected,draft=this.containerDraft;if(!selected||!draft||to===selected.from)return;
    const count=draft[selected.from]?.find(e=>e.type===selected.type)?.amount??0;
    const move=(amount:number)=>{if(this.containerDraft!==draft)return;moveContainer(draft,selected.type,amount,selected.from,to);this.containerSelected=null;this.renderContainers();};
    if(count>1)this.openQuantity(1,count,itemName(this.ds,selected.type),move,count);else move(1);
  }
  private approveContainers() {
    const c=this.gd.Caravans[0],draft=this.containerDraft;if(!draft)return;
    const spill=[...c.cargo].filter(([id,n])=>c.isLiquidItem(id)&&n>assignedCapacity(this.ds,draft,c.transports,id)+1e-8).map(([id,n])=>({id,amount:n-assignedCapacity(this.ds,draft,c.transports,id)}));
    const done=()=>{c.liquidContainerAssignments=JSON.parse(JSON.stringify(draft));for(const e of spill)c.takeLiquid(e.id,e.amount);c.syncLiquidContainers(false);this.closeContainers();};
    if(spill.length)this.fleetDlg(this.text(1224).toUpperCase()+" "+spill.map(e=>this.text(1225).replace("@amount@",String(Math.round(e.amount*1000)/1000)+this.text(11)).replace("@liquidname@",itemName(this.ds,e.id)).toUpperCase()).join("; ")+".\n"+this.text(1226).toUpperCase(),done);else done();
  }
  private cancelContainers() {
    if(this.containerDraft&&JSON.stringify(this.containerDraft)!==this.containerOriginal)this.fleetDlg(this.text(1223),()=>this.closeContainers());else this.closeContainers();
  }
  private renderContainers() {
    if (!this.containerDraft) return;
    const scroll = this.containerList?.scroll ?? 0;
    if (!this.containersOv) {
      const shell = new Sprite(), g = new Graphics();
      g.beginFill(0, .5); g.drawRect(0, 0, 880, 495); g.hitRect(0, 0, 880, 495);
      shell.graphics = g; this.containersOv = shell; this.screen.addChild(shell);
      // Keep the randomly cropped original paper for the entire dialogue lifetime.
      addDialogueBackground(shell, this.assets, 145, 8, 590, 480, 0, undefined, false);
    }
    if (this.containerContent) this.containersOv.removeChild(this.containerContent);
    const ov = new Sprite(); this.containerContent = ov; this.containersOv.addChild(ov);
    const info = new CursorInfoPanel();
    const backing = new Sprite(), bg = new Graphics();
    bg.beginFill(0, .2); bg.drawRect(155, 18, 570, 250);
    bg.drawRect(345, 278, 360, 60); bg.drawRect(345, 358, 360, 60);
    backing.graphics = bg; backing.mouseEnabled = false; ov.addChild(backing);
    this.fleetFrame(ov, 154, 17, 572, 252);
    const c = this.gd.Caravans[0], draft = this.containerDraft;
    const zone = (parent: Sprite, key: number, w: number, h: number) => {
      const z = new Sprite(), hit = new Graphics(); hit.hitRect(0, 0, w, h); z.graphics = hit;
      (z as any).containerKey = key;
      z.addEventListener("click", () => this.moveManagedContainer(key)); parent.addChild(z); return z;
    };
    const strip = (parent: Sprite, key: number, x: number, y: number) => {
      const outer = zone(parent, key, 360, 60); outer.x = x; outer.y = y;
      this.fleetFrame(outer, -1, -1, 362, 62);
      const area = new ScrollableArea(360, 50, 360, 50, false, true, false, 10, 10, this.assets);
      (area as any).containerKey = key; outer.addChild(area);
      (draft[key] ?? []).forEach((e, i) => {
        const cell = new Sprite(); cell.x = i * 55;
        const cg = new Graphics();
        cg.lineStyle(1, this.containerSelected?.from === key && this.containerSelected.type === e.type ? 0xffffff : 0x777068);
        cg.beginFill(0, .2); cg.drawRect(0, 0, 50, 50); cg.hitRect(0, 0, 50, 50); cell.graphics = cg;
        attachItemIcon(this.assets, this.ds, cell, e.type, {size: 50});
        for (const child of cell.children) child.mouseEnabled = false;
        cell.mouseChildren = false; this.fleetText(cell, String(e.amount), 0, 30, 48, "right", 12); cell.buttonMode = true;
        attachItemCursorInfo(this.ds, c, cell, e.type, info);
        let dragged = false;
        cell.addEventListener("pointerdown", (event: any) => {
          const x = event.x, y = event.y; this.containerSelected = {from: key, type: e.type}; dragged = false;
          let ghost: Sprite | null = null;
          Input.drag = {
            onMove: (mx, my) => {
              if (Math.hypot(mx - x, my - y) > 5) dragged = true;
              if (!dragged) return;
              info.hide();
              if (!ghost) {
                ghost = new Sprite(); ghost.mouseEnabled = false; ghost.mouseChildren = false; ghost.alpha = .8;
                attachItemIcon(this.assets, this.ds, ghost, e.type, {size:50}); ov.addChild(ghost);
              }
              ghost.x = mx - 25; ghost.y = my - 25;
            },
            onCancel: () => { if (ghost) ov.removeChild(ghost); },
            onUp: () => {
              if (ghost) ov.removeChild(ghost);
              if (!dragged) return;
              let target: any = this.screen.hitTestPoint(Input.mouseX, Input.mouseY);
              while (target && target.containerKey === undefined) target = target.parent;
              if (target) this.moveManagedContainer(target.containerKey);
            },
          };
        });
        cell.addEventListener("click", () => {
          if (dragged) return;
          this.containerSelected = {from: key, type: e.type};
          if (key === -1) this.fleetDlg(this.text(1222), () => {
            moveContainer(draft, e.type, e.amount, -1, 0); this.containerSelected = null; this.renderContainers();
          }); else this.renderContainers();
        });
        area.addContent(cell);
      });
      area.updateSize();
    };
    const liquids = [...new Set([...c.cargo.keys()].filter(id => c.isLiquidItem(id)).concat(Object.keys(draft).map(Number).filter(id => id > 0)))];
    const list = new ScrollableArea(560, 250, 560, 250, true, false, false, 10, 10, this.assets);
    this.containerList = list;
    list.x = 155; list.y = 18; ov.addChild(list);
    liquids.forEach((id, i) => {
      const row = zone(list.Content, id, 540, 70); row.x = 10; row.y = 10 + i * 80;
      list.Content.removeChild(row); list.addContent(row);
      const liquidIcon = new Sprite(); const iconHit = new Graphics(); iconHit.hitRect(0,0,60,60); liquidIcon.graphics = iconHit;
      liquidIcon.mouseChildren = false; row.addChild(liquidIcon);
      attachItemIcon(this.assets, this.ds, liquidIcon, id, {size: 60});
      attachItemCursorInfo(this.ds, c, liquidIcon, id, info);
      this.fleetText(row, itemName(this.ds, id).toUpperCase(), 70, 1, 100, "center", 12).alpha = .8;
      const capacity = assignedCapacity(this.ds, draft, c.transports, id), amount = c.cargoAmount(id);
      this.fleetText(row, numberFormat(amount, 3, true) + " / " + numberFormat(capacity, 3, true), 70, 21, 100, "center", 12).alpha = .8;
      const bar = new Sprite(), barG = new Graphics(); bar.x = 70; bar.y = 40; bar.mouseEnabled = false;
      const fill = 100 * (amount > capacity ? capacity / amount : capacity > 0 ? amount / capacity : 0);
      barG.beginFill(8552104); barG.drawRect(0, 11, fill, 8); barG.endFill();
      if (amount > capacity) { barG.beginFill(14060314); barG.drawRect(fill + 1, 11, Math.max(0, 99 - fill), 8); barG.endFill(); }
      barG.lineStyle(1, 0xffffff, .7); barG.drawRect(0, 10, amount > capacity ? fill : 100, 10);
      bar.graphics = barG; row.addChild(bar); strip(row, id, 180, 0);
      const line = new Sprite(), lg = new Graphics();
      lg.lineStyle(1, 0, .6); lg.moveTo(-10, 70); lg.lineTo(550, 70);
      lg.lineStyle(1, 0xffffff, .3); lg.moveTo(-10, 71); lg.lineTo(550, 71);
      line.graphics = lg; line.mouseEnabled = false; row.addChild(line);
    });
    list.updateSize(); list.scroll = scroll;
    const available = zone(ov, 0, 550, 70); available.x = 160; available.y = 273;
    const withdrawn = zone(ov, -1, 550, 70); withdrawn.x = 160; withdrawn.y = 353;
    this.fleetFrame(available, 0, 0, 550, 70); this.fleetFrame(withdrawn, 0, 0, 550, 70);
    const label = (parent: Sprite, id: number) => {
      const t = new EngineText(this.text(id).toUpperCase() + ":", 0xffffff, 14, "center", 15, 0, 160, 40, true, true);
      t.y = 35 - t.textHeight / 2 - 2; t.mouseEnabled = false; parent.addChild(t);
    };
    label(available, 1217); label(withdrawn, 1218); strip(available, 0, 185, 5); strip(withdrawn, -1, 185, 5);
    if (this.containerSelected) this.fleetText(ov, itemName(this.ds, this.containerSelected.type), 155, 421, 560, "center", 12);
    this.fleetButton(ov, 1181, 222, 445, () => this.approveContainers(), 2);
    this.fleetButton(ov, 634, 442, 445, () => this.cancelContainers(), 2);
    info.attach(ov);
  }

  // ================= 人员页（原版 category==2，TEAM-CARAVANMENU-SPEC §2.2） =================
  private crewSelected: any = null;
  // t75① 人员页 5 组筛选（原版 List Filters[volunteers,mercenaries,prisoners,slaves,other]；单击 toggle / 双击 solo）
  private crewFilters: boolean[] = [true, true, true, true, true];
  private crewFilterBar: Sprite | null = null;
  private crewFilterSwitches: Array<{ g: number; sw: Switch }> = [];
  private crewConfirm: YesNoDialogue | null = null;
  /** Original CaravanMenu.messageDialogue = new YesNoDialogue(true). */
  private cargoMapMessage: YesNoDialogue | null = null;
  private crewFreeOv: Sprite | null = null;
  private crewSalaryCalc: { ov: Sprite; value: number; min: number; max: number; done: ((v: number) => void) | null; val: EngineText; minus: Sprite; plus: Sprite } | null = null;

  // 性别变体文本（原版 Texts.fetch(id, gender)）
  private gtext(id: number, gender = 1) { return getText(this.ds, id, this.ds.language, gender); }

  private renderPeople() {
    // 动作回调（遣散/招募/…）直接调本方法刷新：先清页（setCategory 已清过一次，幂等）
    const S = this.fleetPage();
    const c = this.gd.Caravans[0];
    if (this.crewSalaryCalc) { S.removeChild(this.crewSalaryCalc.ov); this.crewSalaryCalc = null; }
    if (!this.crewSelected || !c.People.includes(this.crewSelected)) {
      this.crewSelected = c.People[0] ?? null;
    }
    const p = this.crewSelected;
    const nf = (v: number, dec = 0) => {
      const r = Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);
      return r.toLocaleString(undefined, { maximumFractionDigits: dec });
    };
    // —— 左肖像（原版 L1364-1374：PhotoBG@(10,12)；头像 + PhotoFG@(20,22)）——
    const putImg = (name: string, x: number, y: number, at: number) => {
      const im = this.assets.getImage(name);
      const put = (img: HTMLImageElement | null) => {
        if (!img) return;
        const b = new BitmapObject(img);
        b.mouseEnabled = false;
        b.x = x; b.y = y;
        S.addChildAt(b, Math.min(at, S.numChildren()));
      };
      if (im) put(im);
      else void this.assets.ensure(name).then((img) => { if (img) put(img); });
    };
    putImg("PhotoBG.png", 10, 12, 0);
    if (p) {
      // 原版 3 色矩阵管线（按该 Character 实际肤色/发色；无外观数据时 race 公式生成）
      // t51：部件为 250x250，PhotoFG 框也是 250x250 → scale 1.0 居中填满（原版 crewPortrait 1:1 @(20,22)）
      const port = buildPortraitFromCharacter(this.assets, p, 1);
      port.x = 20; port.y = 22;
      S.addChild(port);
    }
    putImg("PhotoFG.png", 20, 22, 2);
    if (!p) { S.addChild(new EngineText("（无人员）", 6710886, 13, "left", 10, 60, 200, 18)); return; }

    // —— 中信息区（原版 L1375-1428：x=290 w250；标题左/值右；血条/士气条）——
    const nm = (p.name || "?").toUpperCase();
    const nameText=new EngineText(nm, 16777215, 14, "center", 290, 22, 250, 20);
    S.addChild(nameText);
    const nameFrame = new Sprite();
    const nfg = new Graphics();
    nfg.lineStyle(1, 16777215);
    const nw = Math.min(nameText.textWidth + 20, 250);
    nfg.drawRect(-nw / 2, -15, nw, 30);
    nameFrame.graphics = nfg;
    nameFrame.x = 415; nameFrame.y = 32;
    nameFrame.mouseEnabled = false;
    S.addChild(nameFrame);

    const hpT = new EngineText(this.text(50).toUpperCase() + ": " + Math.round(p.HP) + "/" + p.maxHP + " " + this.text(1096).toUpperCase(), 16777215, 14, "left", 290, 62, 250, 20);
    const moT = new EngineText(this.text(200).toUpperCase() + ": " + Math.round(p.morale) + "%", 16777215, 14, "left", 290, 122, 250, 20);
    S.addChild(hpT);
    S.addChild(moT);
    const txtW = Math.max(hpT.textWidth, moT.textWidth);
    const bar = (y: number, ratio: number) => {
      const spr = new Sprite();
      const g = new Graphics();
      g.lineStyle(1, 16777215);
      g.drawRect(txtW + 10, 3, 240 - txtW, 14);
      g.beginFill(16777215);
      g.drawRect(txtW + 14, 7, Math.max(0, (240 - txtW - 8) * ratio), 6);
      spr.graphics = g;
      spr.x = 290; spr.y = y;
      spr.mouseEnabled = false;
      S.addChild(spr);
    };
    bar(62, p.HP / Math.max(p.maxHP, 1));
    bar(122, Math.max(0, Math.min(1, p.morale / 100)));

    const pair = (title: string, value: string, y: number) => {
      S.addChild(new EngineText(title, 16777215, 14, "left", 290, y, 250, 20));
      S.addChild(new EngineText(value, 16777215, 14, "right", 290, y, 250, 20));
    };
    const diff = (v: number, b: number) => (Math.abs(v - b) > 0.001 ? " (" + Math.round((v - b) * 10) / 10 + ")" : "");
    const phys = (p as any).physical ?? (p as any).basePhysical ?? 10;
    const agi = (p as any).agility ?? (p as any).baseAgility ?? 10;
    const acc = (p as any).accuracy ?? (p as any).baseAccuracy ?? 10;
    const itl = (p as any).intelligence ?? (p as any).baseIntelligence ?? 10;
    S.addChild(new EngineText(this.text(953).toUpperCase() + ":", 16777215, 14, "left", 290, 82, 250, 20));
    S.addChild(new EngineText(this.gtext(954 + (p.wounded ?? 0), p.gender).toUpperCase(), 16777215, 14, "right", 290, 82, 250, 20));
    let dmgV = "";
    if (!p.eyeDamage && !p.armDamage && !p.legDamage) dmgV = this.text(949).toUpperCase();
    if (p.eyeDamage) dmgV = this.text(950).toUpperCase();
    if (p.legDamage) dmgV += (dmgV ? "," : "") + this.text(951).toUpperCase();
    if (p.armDamage) dmgV += (dmgV ? "," : "") + this.text(952).toUpperCase();
    S.addChild(new EngineText(this.text(948).toUpperCase() + ":", 16777215, 14, "left", 290, 102, 250, 20));
    S.addChild(new EngineText(dmgV, 16777215, 14, "right", 290, 102, 250, 20));
    pair(this.text(944).toUpperCase() + diff(phys, (p as any).basePhysical ?? phys), String(Math.round(phys)), 152);
    pair(this.text(945).toUpperCase() + diff(agi, (p as any).baseAgility ?? agi), String(Math.round(agi)), 172);
    pair(this.text(946).toUpperCase() + diff(acc, (p as any).baseAccuracy ?? acc), String(Math.round(acc)), 192);
    pair(this.text(947).toUpperCase() + diff(itl, (p as any).baseIntelligence ?? itl), String(Math.round(itl)), 212);
    pair(this.text(1095).toUpperCase(), String(p.maxAP), 242);
    pair(this.text(6).toUpperCase(), nf(p.speed, 1), 262);
    pair(this.text(1271).toUpperCase(), String(Math.round(p.capacity)), 292);

    // —— 技能/经历滚动区（原版 L1429-1498：ScrollableArea(240,140) @(290,322)）——
    // 页面已恢复原版坐标；技能区应到 y=462，不能再保留旧错位补偿高度。
    const skills = new ScrollableArea(240, 140, 240, 140, true, false, false, 10, 10, this.assets); // t92 S11 crewSkills
    skills.x = 290; skills.y = 322;
    const shg = new Graphics();
    shg.hitRect(0, 0, 240, 140);
    skills.graphics = shg;
    const skillRow = (id: number, val: string, yy: number, alpha = 0.8) => {
      const t = new EngineText(this.text(id).toUpperCase(), 16777215, 14, "left", 10, yy, 220, 20);
      t.alpha = alpha;
      t.mouseEnabled = false;
      const v = new EngineText(val, 16777215, 14, "right", 10, yy, 220, 20);
      v.alpha = alpha;
      v.mouseEnabled = false;
      skills.addContent(t);
      skills.addContent(v);
    };
    skillRow(966, nf((p as any).learningCapacity * 100), 0);
    skillRow(984, nf(p.totalExperience), 30);
    skillRow(985, nf(p.generalBattleExperience ?? 0), 50);
    let yy = 80;
    for (const s of Character.skillsList) {
      // skill 字段可能是方法（doctorSkill() 等）——取函数则调用，否则取值（否则 NaN）
      const f = (p as any)[s.skill];
      const raw = typeof f === "function" ? f.call(p) : (f ?? 0);
      skillRow(s.name, nf(s.skill === "painThreshold" ? raw * 100 : raw), yy);
      yy += 20;
    }
    skillRow(996, nf(p.weight), yy + 10);
    skillRow(997, nf((p.weight / Math.max(p.idealWeight, 1)) * 100), yy + 30);
    skillRow(998, nf(p.GDA), yy + 60);
    skillRow(999, nf(p.waterConsumption, 3), yy + 80);
    skills.updateSize();
    S.addChild(skills);
    const sf = new Sprite();
    const sfg = new Graphics();
    // CaravanMenu.as 1429–1438: inset frame includes the scrollbar, 252 × 142.
    sfg.lineStyle(1, 16777215, 0.3);
    sfg.moveTo(-1, 141); sfg.lineTo(251, 141); sfg.lineTo(251, -1);
    sfg.lineStyle(1, 0, 0.6);
    sfg.lineTo(-1, -1); sfg.lineTo(-1, 141);
    sf.graphics = sfg;
    sf.x = 290; sf.y = 322;
    sf.mouseEnabled = false;
    S.addChild(sf);

    // —— 底部左侧（原版 L1499-1544：身份/工资/支薪日/自动付 + 类别操作按钮）——
    const statusId = p.category > 5 ? 1121 : p.category === 5 ? 1123 : 959 + p.category;
    S.addChild(new EngineText(this.text(959).toUpperCase() + ": " + this.gtext(statusId, p.gender).toUpperCase(), 16777215, 14, "center", 10, 292, 270, 20));
    const mkBtn = (label: string, y: number, fn: () => void, visible: boolean) => {
      const b = new Button(2, () => { fn(); }, label, this.assets);
      b.x = 42; b.y = y;
      b.visible = visible;
      S.addChild(b);
    };
    const refresh = () => this.renderPeople();
    const isMerc = p.category === 2;
    if (isMerc) {
      const d = this.gd.makeDate(p.payDay);
      S.addChild(new EngineText(this.text(988).toUpperCase() + ": " + Math.round(p.salary), 16777215, 14, "center", 10, 322, 270, 20));
      S.addChild(new EngineText(this.text(987).toUpperCase() + ": " + (d.Day ?? 0) + "-" + (d.ShortMonthName ?? "") + "-" + (d.Year2d ?? 0), 16777215, 14, "center", 10, 342, 270, 20));
      // 原版：Switch @(145−文本宽/2−15, 362) scale0.8；文本 x = switch.x+30 @372（L1505-1517）
      const autoT = new EngineText(this.text(989).toUpperCase(), 16777215, 14, "left", 0, 0, 270, 20);
      const sw = new Switch(1, !!p.autoPay, () => { p.autoPay = true; }, () => { p.autoPay = false; }, null, null, 30, 40, true, this.assets);
      sw.x = 145 - autoT.textWidth / 2 - 15;
      sw.y = 362;
      sw.scaleX = sw.scaleY = 0.8;
      S.addChild(sw);
      autoT.x = sw.x + 30;
      autoT.y = 372;
      S.addChild(autoT);
    }
    const isLeader = p === c.People[0];
    mkBtn(this.text(995).toUpperCase(), 404, () => this.openSalaryCalc(p), isMerc);
    mkBtn(this.text(991).toUpperCase(), isMerc ? 429 : 379, () => this.openDismissDialogue(p), (p.category === 1 && !isLeader) || isMerc);
    mkBtn(this.text(992).toUpperCase(), p.category === 3 ? 359 : (c.cannibal ? 364 : 379), () => this.openFreeDialogue(p), p.category === 3 || p.category === 4);
    mkBtn(this.text(1170).toUpperCase(), 394, () => this.slaughterSlave(p), p.category === 4 && c.cannibal);
    mkBtn(this.text(993).toUpperCase(), 399, () => this.openEnslaveDialogue(p), p.category === 3);
    const recruitOk = (p.category === 6 && p.morale >= 50) || (p.category === 7 && p.morale >= 30) || (p.category === 8 && p.morale >= 30) || (p.category === 9 && p.morale >= 40);
    mkBtn(this.text(994).toUpperCase(), 379, () => this.openRecruitDialogue(p), recruitOk && (p.salary ?? 0) <= c.money);
    if (p.category === 4 && c.cannibal) {
      S.addChild(new EngineText(this.text(1169).toUpperCase() + ": " + Math.round(p.meatAmount * 10) / 10 + " " + this.text(12), 16777215, 14, "center", 10, 424, 250, 20));
    }

    // —— 右人员列表（原版 crewList List([],450,true,[volunteers,mercenaries,prisoners,slaves,other]...) @(550,12)；t75①：5 筛选钮 + 头像/血条/身份图标行）——
    const listX = 550;
    const Y = (abs: number) => abs;
    const listY = Y(12); // 原版列表顶=屏幕 y=12（mainArea 偏移 (10,40)）
    // 筛选按钮栏（持久化：仅首次创建；重渲染 setPosition 同步，防双击 solo 状态丢失——同 renderCargo 模式）
    if (!this.crewFilterBar) this.crewFilterBar = this.buildCrewFilterBar(listX, listY);
    for (const f of this.crewFilterSwitches) f.sw.setPosition(!!this.crewFilters[f.g]);
    this.crewFilterBar.parent?.removeChild(this.crewFilterBar);
    S.addChild(this.crewFilterBar);
    // 内容区（原版 areaY = rows*20 + 1 = 21；90 宽、429 高，行=250 母格×0.28）
    const list = new ScrollableArea(90, 429, 90, 429, true, false, false, 10, 10, this.assets); // t92 L1 crewList
    list.x = listX; list.y = listY + 21;
    const groups: Array<{ label: string; match: (x: any) => boolean }> = [
      { label: this.text(905).toUpperCase(), match: (x) => x.category === 1 || x.category === 6 },
      { label: this.text(906).toUpperCase(), match: (x) => x.category === 2 || x.category === 7 },
      { label: this.text(907).toUpperCase(), match: (x) => x.category === 3 || x.category === 8 },
      { label: this.text(908).toUpperCase(), match: (x) => x.category === 4 || x.category === 9 },
      { label: this.text(909).toUpperCase(), match: (x) => ![1, 2, 3, 4, 6, 7, 8, 9].includes(x.category ?? 0) },
    ];
    let ly = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      if (!this.crewFilters[gi]) continue; // 筛选关闭 → 整组隐藏（原版 List.as switchFilter）
      const g = groups[gi];
      const members = c.People.filter(g.match);
      if (!members.length) continue;
      for (const m of members) {
        const cell = this.makeCrewCell(m, m === p, () => { sfxClick(); this.crewSelected = m; this.renderPeople(); });
        cell.x = 10; // List.as：pic.x = 10（左缘留边）
        cell.y = 10 + ly;
        (cell as any).height = 80;
        list.addContent(cell);
        ly += 80;
      }
    }
    if (ly === 0) list.addContent(new EngineText("—", 6710886, 14, "center", 10, 10, 70, 20));
    list.updateSize();
    S.addChild(list);
  }

  // ---------- t75① 人员页右列表辅助：筛选按钮栏 + 250 母格人员行 ----------
  private buildCrewFilterBar(listX: number, listY: number): Sprite {
    const bar = new Sprite();
    bar.mouseEnabled = false;
    this.crewFilterSwitches = [];
    const names = ["volunteers", "mercenaries", "prisoners", "slaves", "other"];
    // 筛选区底（原版 List areaBG 4208688 a0.7 一行）
    const fbg = new Graphics();
    fbg.beginFill(4208688, 0.7);
    fbg.drawRect(0, 0, 100, 20);
    fbg.lineStyle(1, 16777215, 0.3);
    fbg.moveTo(0, 20); fbg.lineTo(100, 20);
    const fbgS = new Sprite();
    fbgS.graphics = fbg;
    fbgS.x = listX; fbgS.y = listY;
    fbgS.mouseEnabled = false;
    bar.addChild(fbgS);
    for (let g = 0; g < 5; g++) {
      const sw = new Switch(3, !!this.crewFilters[g],
        () => this.toggleCrewFilter(g), () => this.toggleCrewFilter(g),
        null, null, 20, 20, false, this.assets,
        () => this.soloCrewFilter(g));
      sw.x = listX + g * 20;
      sw.y = listY;
      const icon = this.crewFilterIcon(g);
      if (icon) {
        icon.scaleX = icon.scaleY = 0.4;
        icon.alpha = 0.3;
        icon.mouseEnabled = false;
        icon.mouseChildren = false;
        icon.x = icon.y = 0;
        sw.addChild(icon);
      }
      bar.addChild(sw);
      this.crewFilterSwitches.push({ g, sw });
    }
    return bar;
  }
  private toggleCrewFilter(g: number) { this.crewFilters[g] = !this.crewFilters[g]; this.renderPeople(); }
  // 双击 solo（原版 List.as doubleClickFilter L299-311：只显示该组）
  private soloCrewFilter(g: number) { for (let i = 0; i < 5; i++) this.crewFilters[i] = i === g; this.renderPeople(); }
  // 原版五种身份筛选图标，不用物品贴图代替。
  private crewFilterIcon(g: number): Sprite {
    const s = new Sprite();
    const name = "filtericon" + ["volunteers", "mercenaries", "prisoners", "slaves", "other"][g] + ".png";
    const put = (im: HTMLImageElement | null) => {
      if (!im || s.numChildren()) return;
      const b = new BitmapObject(im); b.mouseEnabled = false;
      // Vector exports are already cropped/rasterized; fit the native 20px filter cell.
      const scale = Math.min(16 / b.width, 16 / b.height);
      b.scaleX = b.scaleY = scale / .4;
      b.x = (20 - b.width * scale) / .8;
      b.y = (20 - b.height * scale) / .8;
      s.addChild(b);
    };
    put(this.assets.getImage(name));
    void this.assets.ensure(name).then(put);
    return s;
  }
  private firstItemIdOfCat(cat: number): number {
    const items = this.ds.items.Items;
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      if (it && (cat < 0 ? (it.category >= 5) : it.category === cat)) return i;
    }
    return 0;
  }
  // 人员行（原版 List.as Character 分支 L490-586：250×250 母格 ×0.28=70px；左下血条；右下身份图标）
  // t84 反馈4：委托公共 PeopleGrid（与雇用页横向行共用同一渲染接口）
  private makeCrewCell(m: any, selected: boolean, onClick: () => void): Sprite {
    return makePersonCell(this.assets, this.ds, m, { cellW: 70, selected, onClick });
  }
  private crewCategoryIcon(cat: number): Sprite | null {
    const names = ["volunteers", "mercenaries", "prisoners", "slaves", "other"];
    const name = names[cat >= 1 && cat <= 4 ? cat - 1 : 4];
    const img = this.assets.getImage("filtericon" + name + ".png");
    if (img) {
      const s = new Sprite();
      const b = new BitmapObject(img);
      b.mouseEnabled = false;
      s.addChild(b);
      return s;
    }
    const fallbackId = name === "mercenaries" ? this.firstItemIdOfCat(2) : name === "other" ? this.firstItemIdOfCat(-1) : 0;
    if (fallbackId) return attachItemIcon(this.assets, this.ds, new Sprite(), fallbackId, { size: 30 });
    return null;
  }

  // —— 对话框（原版 openDismissDialogue L6674 / openEnslaveDialogue L6762 / openRecruitDialogue L6779 / slaughterSlave L5044）——
  private openDismissDialogue(p: any) {
    const c = this.gd.Caravans[0];
    const town = c.overTown != null ? this.gd.Towns[c.overTown] : null;
    let txt = this.gtext(1277, p.gender).replace("@name@", p.name).toUpperCase();
    if ((town == null || town.preset?.constantPopulation) && (p.category === 1 || p.category === 2)) {
      txt += "\n\n" + this.gtext(1275, p.gender).replace("@name@", p.name).toUpperCase();
    }
    if (!this.crewConfirm) {
      this.crewConfirm = new YesNoDialogue(this.ds, this.assets, false);
      this.screen.addChild(this.crewConfirm);
      this.crewConfirm.visible = false;
    }
    this.crewConfirm.show(txt, () => this.dismissPerson(p));
  }
  // 原版 dismissPerson：归还装备；城镇接收离队成员，否则转为护送组。
  private dismissPerson(p: Character) {
    const c = this.gd.Caravans[0];
    if (!c.People.includes(p)) return;
    (p as any).recalculateSalary?.(this.gd.getFactionRelations(p.faction, 0));
    p.salary = p.minSalary ?? 0;
    c.removeEquipment(p);
    const town = c.overTown != null ? this.gd.Towns[c.overTown] : null;
    if (town && !town.preset?.constantPopulation) {
      if (p.category === 2 && !(p.specialPurpose === 2 && c.overTown === 18)) (town.people ??= []).push(p);
      else town.unemployed++;
      town.population++;
      c.removePerson(p);
    } else if (p.category >= 1 && p.category <= 4) p.category += 5;
    this.renderPeople();
  }
  private openEnslaveDialogue(p: any) {
    let txt = this.gtext(1288, p.gender).replace("@name@", p.name).toUpperCase();
    if ((this.gd.story?.specificReputations?.[7] ?? 0) <= 0) txt += "\n\n" + this.text(3772).toUpperCase();
    if (!this.crewConfirm) {
      this.crewConfirm = new YesNoDialogue(this.ds, this.assets, false);
      this.screen.addChild(this.crewConfirm);
      this.crewConfirm.visible = false;
    }
    this.crewConfirm.show(txt, () => {
      p.category = 4;
      this.gd.enslaveAPerson?.(p);
      this.renderPeople();
    });
  }
  private openRecruitDialogue(p: any) {
    const c = this.gd.Caravans[0];
    const oldCat = p.category;
    const txt = this.gtext(1287, p.gender).replace("@name@", p.name).replace("@money@", Math.round(p.salary ?? 0) + "€").toUpperCase();
    if (!this.crewConfirm) {
      this.crewConfirm = new YesNoDialogue(this.ds, this.assets, false);
      this.screen.addChild(this.crewConfirm);
      this.crewConfirm.visible = false;
    }
    this.crewConfirm.show(txt, () => {
      p.category = 2;
      p.payDay = this.gd.Time + 604800;
      c.money -= p.salary ?? 0;
      if (oldCat === 8 || oldCat === 9) (this.gd as any).affectSpecificReputation?.(5, -4);
      this.renderPeople();
    });
  }
  private slaughterSlave(p: any) {
    const c = this.gd.Caravans[0];
    const txt = this.text(1171).replace("@animalname@", p.name).toUpperCase();
    if (!this.crewConfirm) {
      this.crewConfirm = new YesNoDialogue(this.ds, this.assets, false);
      this.screen.addChild(this.crewConfirm);
      this.crewConfirm.visible = false;
    }
    this.crewConfirm.show(txt, () => {
      c.addCargo(174, p.meatAmount);
      const i = c.People.indexOf(p);
      if (i >= 0) c.removePerson(i);
      for (const pp of c.People) {
        if (pp.category === 4) pp.morale = (pp.morale ?? 50) - 20;
        else if (pp !== c.People[0]) pp.morale = (pp.morale ?? 50) - 5;
      }
      if (this.gd.story) this.gd.story.specificReputations[5] = (this.gd.story.specificReputations[5] ?? 0) - 30;
      this.renderPeople();
    });
  }
  // Free 对话框（原版 openFreeDialogue L6729：6 按钮，400x400 @(240,48)）
  private openFreeDialogue(p: any) {
    const c = this.gd.Caravans[0];
    const town = c.overTown != null ? this.gd.Towns[c.overTown] : null;
    const inTown = town != null && !town.preset?.constantPopulation;
    p.recalculateSalary?.(p.morale);
    const hireOk = ((p.category === 3 && p.morale >= 30) || (p.category === 4 && p.morale >= 40)) && (p.salary ?? 0) <= c.money;
    const closeFree = () => { if (this.crewFreeOv) this.crewFreeOv.visible = false; this.renderPeople(); };
    if (!this.crewFreeOv) {
      const ov = new Sprite();
      const bg = new Graphics();
      bg.beginFill(0, 0.5);
      bg.drawRect(0, 0, 880, 495);
      bg.hitRect(0, 0, 880, 495);
      ov.graphics = bg;
      addDialogueBackground(ov, this.assets, 240, 48, 400, 400, 0.2, undefined, false);
      this.crewFreeOv = ov;
      this.screen.addChild(ov);
    }
    const ov = this.crewFreeOv;
    const kids = [...ov.children];
    for (const k of kids) {
      if ((k as any).__freeBtn || (k as any).__freeText) ov.removeChild(k);
    }
    let txt = inTown
      ? this.gtext(1285, p.gender).replace("@name@", p.name).toUpperCase()
      : this.gtext(1282, p.gender).toUpperCase();
    if (hireOk) {
      p.recalculateSalary?.(this.gd.getFactionRelations(p.faction, 0));
      txt += "\n\n" + this.gtext(1283, p.gender).replace("@name@", p.name).replace("@money@", Math.round(p.salary ?? 0) + "€").toUpperCase();
    }
    if (!inTown) txt += "\n\n" + this.gtext(1284, p.gender).replace("@name@", p.name).toUpperCase();
    const textE = new EngineText(txt, 16777215, 14, "center", 250, 58, 380, 400, true, true);
    const topButton = inTown ? (hireOk ? 297 : 327) : (hireOk ? 237 : 267);
    textE.y = 48 + 10 + (topButton - 20) / 2 - textE.textHeight / 2 - 2;
    (textE as any).__freeText = true;
    textE.mouseEnabled = false;
    ov.addChild(textE);
    const mk = (label: string, y: number, fn: () => void, visible: boolean) => {
      const b = new Button(2, () => { fn(); }, label, this.assets);
      b.x = 240 + 97; b.y = 48 + y;
      b.visible = visible;
      (b as any).__freeBtn = true;
      ov.addChild(b);
    };
    const checkSlaverRep = (pp: any) => { if (pp.category === 4) this.gd.freeASlave?.(pp); };
    const leavePerson = (withSupplies: boolean) => {
      this.gd.releaseCrewMember(p, withSupplies);
      closeFree();
    };
    mk(this.text(634).toUpperCase(), 357, () => { if (this.crewFreeOv) this.crewFreeOv.visible = false; }, true);
    mk(this.text(1278).toUpperCase(), 327, () => { // 护送到城镇
      checkSlaverRep(p);
      p.category += 5;
      (this.gd as any).affectSpecificReputation?.(5, 2);
      closeFree();
    }, !inTown);
    mk(this.text(1279).toUpperCase(), 297, () => leavePerson(true), !inTown); // 资遣（带补给）
    mk(this.text(1280).toUpperCase(), 267, () => leavePerson(false), !inTown); // 放逐（不带补给）
    mk(this.text(1272).toUpperCase(), inTown ? 297 : 237, () => { // 雇用（原版：沙漠@237 / 城镇@297）
      if (!c.People.includes(p) || (p.salary ?? 0) > c.money) return;
      checkSlaverRep(p);
      p.category = 2;
      c.money -= p.salary ?? 0;
      p.payDay = this.gd.Time + 604800;
      (this.gd as any).affectSpecificReputation?.(5, 1);
      closeFree();
    }, hireOk);
    mk(this.text(1281).toUpperCase(), 327, () => { // 遗弃（原地离开）
      checkSlaverRep(p);
      (this.gd as any).affectSpecificReputation?.(5, 1);
      this.dismissPerson(p);
      closeFree();
    }, inTown);
    this.screen.setChildIndex(this.crewFreeOv, this.screen.numChildren()-1);
    this.crewFreeOv.visible = true;
  }
  // Set Salary 计算器（原版 openRaiseSalaryWindow L6658：min=minSalary）
  private openSalaryCalc(p: any) {
    const min=Math.ceil(typeof p.minSalary === "function" ? p.minSalary() : p.minSalary ?? 0);
    this.openQuantity(min,999999999,this.text(995),v=>{p.salary=v;this.renderPeople();},Math.max(min,Math.round(p.salary??0)));
  }

  // ================= 装备页（原版 category==3，TEAM-EQUIP-LOG-SPEC §1-3） =================
  // 槽位：0 Jacket / 1 Headgear / 2 weapons[0] / 3 att[0][0] / 4 att[0][1] / 5 weapons[1] / 6 att[1][0] / 7 att[1][1] / 8 背包(equipment)
  private eqPerson: any = null;
  private eqFilters = [true, true]; // t75② 装备页左列人员筛选 volunteers/mercenaries
  // t88：装备页物品池类别筛选（原版 equipmentItemsList List.filters）
  private eqPoolFilters: Record<string, boolean> = { weapons: true, ammo: true, armor: true, attachments: true, firstaid: true };
  // t89：背包内水平清单的 ammo/firstaid 迷你筛选（原版 equipmentList 过滤钮 @(360,267) 20x37.5）
  private eqBackpackFilters: Record<string, boolean> = { ammo: true, firstaid: true };
  private eqSkillsOv: Sprite | null = null; // t75② 装备页技能框（弹窗）
  private eqSlot = -1;
  private eqPoolItem: { id: number; amt: number; def: any; it: any; name?: string } | null = null;
  private eqFeasible: number[] = [];
  private eqTooHeavy = false;
  private eqTip = "";
  private eqDblT = 0; // t96：物品池双击→直接装备（原版 List.as doubleClick L764 → doubleClickEquipmentItem L5563）
  private eqDblId = -1;
  // t102：装备页悬停属性面板（公共 CursorInfoPanel，浅黄样式与交易界面一致）
  private eqCursorPanel: CursorInfoPanel | null = null;
  // t97：装备页计算器（原版 Calculator.as 同款；从 TradeWindow 移植，交互与交易界面完全一致）
  private eqCalcPanel: CalculatorPanel | null = null; // t99：公共计算器面板（原版 Calculator.as 移植）

  private readonly eqSlots: Array<[number, number, number, number]> = [
    [230, 62, 50, 50],    // 0 Jacket
    [290, 62, 50, 50],    // 1 Headgear
    [120, 132, 100, 100], // 2 武器 1
    [230, 182, 50, 50],   // 3 附件 1a
    [290, 182, 50, 50],   // 4 附件 1b
    [120, 242, 100, 100], // 5 武器 2
    [230, 292, 50, 50],   // 6 附件 2a
    [290, 292, 50, 50],   // 7 附件 2b
    [360, 267, 180, 75],  // 8 背包（原版 equipmentList 同坐标 180x75）
  ];

  // 槽位内容（subCategory / 类别 / 物品名）
  private slotContent(slot: number): { cat: number; sub: number; label: string } | null {
    const p = this.eqPerson;
    if (!p) return null;
    const nm = (id: number) => (id ? itemName(this.ds, id) : "");
    switch (slot) {
      case 0: return p.Jacket ? { cat: 5, sub: p.Jacket, label: nm(this.itemNumFromCatSub(5, p.Jacket)) } : null;
      case 1: return p.Headgear ? { cat: 5, sub: p.Headgear, label: nm(this.itemNumFromCatSub(5, p.Headgear)) } : null;
      case 2: case 5: {
        const ws = slot === 2 ? 0 : 1;
        return p.weapons[ws] ? { cat: 2, sub: p.weapons[ws], label: nm(this.itemNumFromCatSub(2, p.weapons[ws])) } : null;
      }
      case 3: case 4: case 6: case 7: {
        const ws = slot >= 6 ? 1 : 0;
        const a = slot === 3 || slot === 6 ? 0 : 1;
        const sub = p.attachments[ws]?.[a];
        return sub ? { cat: 4, sub, label: nm(this.itemNumFromCatSub(4, sub)) } : null;
      }
      default: return null;
    }
  }
  private slotWeight(slot: number): number {
    const content = this.slotContent(slot);
    if (!content) return 0;
    const id = this.itemNumFromCatSub(content.cat, content.sub);
    const def = id ? getItemData(this.ds, id) : null;
    let w = def?.weight ?? 0;
    if (slot === 2 || slot === 5) {
      const ws = slot === 2 ? 0 : 1;
      if (this.isGrenadeSub(content.sub)) w *= (this.eqPerson.grenadeAmounts?.[ws] ?? 1);
    }
    return w;
  }
  private setSlotValue(slot: number, sub: number) {
    const p = this.eqPerson;
    if (!p) return;
    switch (slot) {
      case 0: p.Jacket = sub; break;
      case 1: p.Headgear = sub; break;
      case 2: case 5: p.weapons[slot === 2 ? 0 : 1] = sub; break;
      case 3: case 4: case 6: case 7: {
        const ws = slot >= 6 ? 1 : 0;
        const a = slot === 3 || slot === 6 ? 0 : 1;
        p.attachments[ws][a] = sub;
        break;
      }
    }
  }
  private isGrenadeSub(sub: number): boolean {
    const w = this.ds.weapons.Weapons?.[sub];
    const wt = w && this.ds.weapons.WeaponTypes?.[w.type];
    return wt?.category === 5;
  }
  private itemNumFromCatSub(cat: number, sub: number): number {
    const items = this.ds.items.Items;
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      if (it && it.category === cat && it.subCategory === sub) return i;
    }
    return 0;
  }

  // t75② 装备页：人员筛选 + 技能框（原版 seeSkillsButton → skillsWindow L1087-1116）
  private toggleEqFilter(idx: number) { this.eqFilters[idx] = !this.eqFilters[idx]; this.renderEquipment(); }
  private soloEqFilter(idx: number) { this.eqFilters = [false, false]; this.eqFilters[idx] = true; this.renderEquipment(); }
  private openEqSkillsWindow() {
    const p = this.eqPerson ?? this.gd.Caravans[0].People[0];
    if (!p) return;
    if (this.eqSkillsOv) this.screen.removeChild(this.eqSkillsOv);
    this.eqSkillsOv = null;
    const ov = new Sprite();
    const bg = new Graphics();
    bg.beginFill(0, 0.5);
    bg.drawRect(0, 0, 880, 495);
    bg.hitRect(0, 0, 880, 495);
    ov.graphics = bg;
    addDialogueBackground(ov, this.assets, 240, 48, 400, 400, 0.2, undefined, false);
    ov.addChild(new EngineText((p.name || "?").toUpperCase(), 16777215, 14, "center", 260, 60, 360, 20));
    const list = new ScrollableArea(345, 300, 345, 300, true, false, false, 15, 15, this.assets); // t92 技能弹窗 15px
    list.x = 240 + 20; list.y = 48 + 90;
    const fmt = (v: number) => String(Math.round(v * 100) / 100);
    const rows: Array<{ label: string; value: string }> = [];
    for (const s of Character.skillsList) {
      const f = (p as any)[s.skill];
      const raw = typeof f === "function" ? f.call(p) : (f ?? 0);
      rows.push({ label: getText(this.ds, s.name, this.ds.language).toUpperCase(), value: fmt(s.skill === "painThreshold" ? raw * 100 : raw) });
    }
    rows.forEach((r, i) => {
      const rs = new Sprite();
      rs.y = i * 40;
      rs.addChild(new EngineText(r.label, 16777215, 14, "left", 10, 10, 325, 20));
      rs.addChild(new EngineText(r.value, 16777215, 14, "right", 10, 10, 325, 20));
      list.addContent(rs);
    });
    list.updateSize();
    ov.addChild(list);
    const close = new Button(2, () => { if (this.eqSkillsOv) { this.screen.removeChild(this.eqSkillsOv); this.eqSkillsOv = null; } }, this.text(902).toUpperCase(), this.assets);
    close.x = 240 + 97; close.y = 48 + 357;
    ov.addChild(close);
    this.screen.addChild(ov);
    this.eqSkillsOv = ov;
  }

  // 物品池（武器/护甲/弹药/附件/急救包；排除液体）
  private equipmentPoolItems(): Array<{ id: number; amt: number; def: any; it: any; name: string }> {
    const c = this.gd.Caravans[0];
    const out: Array<{ id: number; amt: number; def: any; it: any; name: string }> = [];
    for (const [id, amt] of c.cargo) {
      if (amt <= 0) continue;
      const inUse = c.inUse[id] ?? 0;
      // 原版 List.as L454-456 物品过滤：amount−inUse ≥ 0.05（已装备的物品不再显示，防 0/-1 重复装备）
      if (amt - inUse < 0.05) continue;
      const it = this.ds.items.Items[id];
      if (!it) continue;
      const def = getItemData(this.ds, id);
      if (!def) continue;
      const pf = this.eqPoolFilters;
      const ok = id === 219 || (pf.weapons && it.category === 2) || (pf.ammo && it.category === 3) ||
        (pf.armor && it.category === 5) || (pf.attachments && it.category === 4) ||
        (pf.firstaid && it.category === 1 && def.heal > 0);
      if (!ok) continue;
      if (def.liquid || def.liquidsContainer) continue;
      out.push({ id, amt, def, it, name: itemName(this.ds, id) });
    }
    return out.sort((a, b) => a.id - b.id);
  }

  // 可行性规则（原版 checkIfSelectedIsPossible：武器→2/5、弹药/急救→8、附件→适用武器槽、护甲 type1→0/type2→1）
  private checkIfSelectedIsPossible() {
    const itm = this.eqPoolItem;
    const p = this.eqPerson;
    this.eqFeasible = [];
    this.eqTooHeavy = false;
    this.eqTip = "";
    if (!itm || !p) return;
    const { def, it } = itm;
    const cat = it.category;
    const slots: number[] = [];
    if (cat === 2) slots.push(2, 5);
    else if (cat === 3) slots.push(8); // 弹药→槽8（原版 checkIfSelectedIsPossible case 3）
    else if (cat === 4) {
      // 附件→适用武器槽（原版 case 4：武器技能匹配 applicable → (ws+1)*3 / +1）
      for (let ws = 0; ws < 2; ws++) {
        if ((p.weapons[ws] ?? 0) > 0) {
          const skill = Character.detectWeaponSkill(this.ds, p.weapons[ws]);
          const att = this.ds.weapons.Attachments?.[it.subCategory];
          if (att && Array.isArray(att.applicable) && att.applicable.includes(skill)) {
            const base = ws === 0 ? 3 : 6;
            let replaced = -1;
            for (let a = 0; a < 2; a++) if (p.attachments[ws]?.[a] === it.subCategory) replaced = base + a;
            if (replaced >= 0) slots.push(replaced);
            else for (let a = 0; a < 2; a++) if (!p.attachments[ws]?.[a]) slots.push(base + a);
          }
        }
      }
    }
    else if (cat === 5) {
      // 护甲（原版 case 5：itemData.type==1 → [0] Jacket；type==2 → [1] Headgear）
      const t = this.ds.items.Armor?.[it.subCategory]?.type;
      if (t === 1) slots.push(0);
      else if (t === 2) slots.push(1);
    }
    else if (cat === 1 && def && def.heal > 0) slots.push(8);
    // 自动选空槽
    let target = -1;
    for (const s of slots) if (!this.slotContent(s)) { target = s; break; }
    if (target < 0 && slots.length) target = slots[0];
    this.eqSlot = target >= 0 ? target : -1;
    const oldW = target >= 0 ? this.slotWeight(target) : 0;
    this.eqTooHeavy = !!def && (def.weight ?? 0) > p.availableCapacity + oldW;
    this.eqFeasible = slots;
    if (slots.length === 0) this.eqTip = this.text(1019); // 不兼容
    else if (this.eqTooHeavy) this.eqTip = this.text(1020); // 超重
  }

  // 装备（原版 equipItem / equipGrenades）
  private equipItem(itm: { id: number; amt: number; def: any; it: any }) {
    const p = this.eqPerson;
    const slot = this.eqSlot;
    if (!p || slot < 0 || !this.eqFeasible.includes(slot)) return;
    const c = this.gd.Caravans[0];
    const { id, def, it } = itm;
    const inUse = c.inUse[id] ?? 0;
    const avail = Math.max(0, itm.amt - inUse);
    if (avail <= 0) return; // 防御：可装备数量为 0 时不再进入装备流程（原版列表层已过滤）
    if (this.slotContent(slot)) this.removeFromSlot(slot);
    if (slot === 8) {
      const maxQty = Math.min(avail, Math.floor(p.availableCapacity / Math.max(def.weight, 0.001)));
      if (maxQty < 1) { this.showEqTip(this.text(1020)); return; }
      if (maxQty === 1) this.equipQtyToInventory(id, 1);
      else this.openEqCalc(1, maxQty, (v) => this.equipQtyToInventory(id, Math.floor(v)));
    } else if (it.category === 2 && this.isGrenadeSub(it.subCategory)) {
      const ws = slot === 2 ? 0 : 1;
      const maxQty = Math.min(avail, Math.floor(p.availableCapacity / Math.max(def.weight, 0.001)));
      if (maxQty < 1) { this.showEqTip(this.text(1020)); return; }
      this.openEqCalc(1, maxQty, (v) => this.equipGrenades(id, it.subCategory, ws, Math.floor(v)));
    } else {
      this.setSlotValue(slot, it.subCategory);
      p.addItemToEquipment({ type: id, amount: 1 }, false); // t99：原版 param2 省略（equipment.inUse 不置位，inUse 只记车队 cargo 层）
      c.inUse[id] = (c.inUse[id] ?? 0) + 1;
      p.checkAttachmentsCompatibility();
      this.renderEquipment(); // t98：装备后保留选中（原版 equipItem 不清 selectedEquipmentItem/Slot）
    }
  }
  private equipQtyToInventory(id: number, v: number) {
    const p = this.eqPerson, c = this.gd.Caravans[0];
    if (!p || v <= 0) return;
    p.addItemToEquipment({ type: id, amount: v }, false); // t99：弹药进背包不标记 inUse（否则 eqUpdateSelectedAmmo 匹配 amount−inUse>0 失败 → 缺省弹药不显示）
    c.inUse[id] = (c.inUse[id] ?? 0) + v;
    this.renderEquipment(); // t98：保留选中
  }
  private equipGrenades(id: number, sub: number, ws: number, v: number) {
    const p = this.eqPerson, c = this.gd.Caravans[0];
    if (!p || v <= 0) return;
    p.weapons[ws] = sub;
    p.addItemToEquipment({ type: id, amount: v }, false); // t99：同上（手雷数量不标记 inUse）
    c.inUse[id] = (c.inUse[id] ?? 0) + v;
    p.grenadeAmounts[ws] = v;
    p.checkAttachmentsCompatibility();
    this.renderEquipment(); // t98：保留选中
  }

  // 卸下（原版 removeItemFromSlot）
  private removeFromSlot(slot: number) {
    const p = this.eqPerson, c = this.gd.Caravans[0];
    if (!p) return;
    const content = this.slotContent(slot);
    if (!content) return;
    const id = this.itemNumFromCatSub(content.cat, content.sub);
    if (!id) return;
    const reduce = (n: number) => { p.reduceItemFromEquipment(id, n, true, true); };
    switch (slot) {
      case 0: reduce(1); p.Jacket = 0; break;
      case 1: reduce(1); p.Headgear = 0; break;
      case 2: case 5: {
        const ws = slot === 2 ? 0 : 1;
        if (this.isGrenadeSub(content.sub)) {
          reduce(p.grenadeAmounts[ws] ?? 0);
          p.grenadeAmounts[ws] = 0;
        } else reduce(1);
        p.weapons[ws] = 0;
        p.checkAttachmentsCompatibility();
        break;
      }
      case 3: case 4: case 6: case 7: {
        const ws = slot >= 6 ? 1 : 0;
        const a = slot === 3 || slot === 6 ? 0 : 1;
        reduce(1);
        p.attachments[ws][a] = null;
        p.checkAttachmentsCompatibility();
        break;
      }
    }
    void c;
  }

  // 双武器交换（原版 swapWeapons）
  private swapWeapons() {
    const p = this.eqPerson;
    if (!p) return;
    const t = p.weapons[0]; p.weapons[0] = p.weapons[1]; p.weapons[1] = t;
    const g = p.grenadeAmounts[0]; p.grenadeAmounts[0] = p.grenadeAmounts[1]; p.grenadeAmounts[1] = g;
    const a = p.attachments[0]; p.attachments[0] = p.attachments[1]; p.attachments[1] = a;
    const m = p.currModes[0]; p.currModes[0] = p.currModes[1]; p.currModes[1] = m;
    p.checkAttachmentsCompatibility();
    this.renderEquipment(); // t98：保留选中（原版 swapWeapons 亦不清）
  }
  // Clear Equipment（1093：清空槽 0-7）
  private clearEquipment() {
    for (let s = 0; s < 8; s++) if (this.slotContent(s)) this.removeFromSlot(s);
    this.eqSlot = -1;
    this.renderEquipment();
  }
  // Clear Inventory（1092：清空背包 equipment）
  private clearInventory() {
    const p = this.eqPerson;
    if (!p) return;
    const copy = [...p.equipment];
    for (const e of copy) {
      const it = this.ds.items.Items[e.type];
      // 原版 L5391：只清背包里的 cat1/cat3（急救/弹药）
      if (it && (it.category === 1 || it.category === 3)) p.reduceItemFromEquipment(e.type, e.amount, false, true);
    }
    this.eqSlot = -1;
    this.renderEquipment();
  }

  // t102：装备页悬停挂载（公共 CursorInfoPanel 共享实例，首次挂窗口根 screen 最顶层）
  private attachEqCursor(host: Sprite, idFn: () => number | null) {
    if (!this.eqCursorPanel) {
      this.eqCursorPanel = new CursorInfoPanel();
      if ((this as any).screen) this.eqCursorPanel.attach((this as any).screen);
    }
    let c: any = this.gd ? this.gd.Caravans[0] : null;
    attachItemCursorInfo(this.ds, c, host, idFn, this.eqCursorPanel);
  }

  private showEqTip(msg: string) {
    this.eqTip = msg;
    this.renderEquipment();
  }

  // 缺省弹药循环（原版 changeSelectedAmmo；按武器 ammo 子类过滤物品池）
  private cycleAmmo(ws: number) {
    // t88：循环逻辑统一走 cycleAmmoDir（原版 changeSelectedAmmo(±1,ws)；旧实现误用 category 4=附件）
    this.cycleAmmoDir(ws, 1);
  }
  // t96：原版 updateAmmoNames L6455 只显示弹药变体短名（如"圆弹头"），不是 itemName 的"口径+变体"全名
  private ammoNameOf(ws: number): string {
    const p = this.eqPerson;
    const cur = p?.selectedAmmo?.[ws];
    if (!cur) return "";
    const it = this.ds.items.Items[cur.type];
    if (!it) return "";
    const def = getItemData(this.ds, cur.type);
    const key = String(def?.variation ?? 0);
    const t = this.ds.texts?.[key];
    return (Array.isArray(t) ? (t[this.ds.language] ?? t[1] ?? t[0]) : "") || itemName(this.ds, cur.type);
  }

  // ---------- 装备页计算器（t99：公共组件 core/CalculatorPanel.ts，原版 Calculator.as 移植） ----------
  private ensureEqCalcPanel(): CalculatorPanel {
    if (!this.eqCalcPanel) this.eqCalcPanel = new CalculatorPanel(this.assets, (id) => this.text(id));
    return this.eqCalcPanel;
  }

  // 装备页计算器打开（t99：公共面板 open，委托 CalculatorPanel；原版 Equipment 页用全局 Calculator 实例）
  private openEqCalc(min: number, max: number, done: (v: number) => void) {
    this.ensureEqCalcPanel().open(this.screen, min, max, done, undefined, this.text(1214));
  }

  // ---------- 装备页主渲染 ----------
  // t88：按原版 CaravanMenu.as L1483-1827 布局整体还原——左人物格列表、中央头像/槽位/缺省弹药、
  // 右上属性滚动框、背包水平清单、右下物品池(5 类别筛选)、底部选中物品详情/装备按钮
  private renderEquipment() {
    this.mainArea.removeAll();
    const S = this.mainArea;
    const c = this.gd.Caravans[0];
    if (!this.eqPerson || !c.People.includes(this.eqPerson)) this.eqPerson = c.People[0] ?? null;
    if (this.eqCalcPanel) this.eqCalcPanel.close(); // t99：重渲染时一并关闭公共计算器面板
    // mainArea.y=40：原版绝对坐标 → 本地坐标（renderPeople 同款 Y()）
    const Y = (abs: number) => abs - 40;
    const p = this.eqPerson;

    // t91：首次进入装备页时贴图异步加载（getImage 首帧返回 null 不阻塞绘制）→ 记录缺失贴图，全部就绪后整页重绘一次
    const reqMissing: string[] = [];
    const need = (nm: string) => { if (!this.assets.getImage(nm) && !reqMissing.includes(nm)) reqMissing.push(nm); };

    const eqCatOk = (cat: number) => (cat === 1 || cat === 6) ? this.eqFilters[0] : (cat === 2 || cat === 7) ? this.eqFilters[1] : false;
    // t89：原版 List.as L248-266：areaBG 4208688 a0.7 + 白(0.3)/黑(0.6) 描边框（人物列/物品池共用 100x429 区）
    const addListBackdrop = (lx: number, ly: number) => {
      const bgS = new Sprite();
      const bgG = new Graphics();
      bgG.beginFill(4208688, 0.7);
      bgG.drawRect(0, 0, 100, 429);
      bgS.graphics = bgG;
      bgS.x = lx; bgS.y = ly; bgS.mouseEnabled = false;
      S.addChild(bgS);
      const fr = new Sprite();
      const fg = new Graphics();
      fg.lineStyle(1, 16777215, 0.3);
      fg.moveTo(-1, 430); fg.lineTo(101, 430); fg.lineTo(101, -1);
      fg.lineStyle(1, 0, 0.6);
      fg.lineTo(-1, -1); fg.lineTo(-1, 430);
      fr.graphics = fg;
      fr.x = lx; fr.y = ly; fr.mouseEnabled = false;
      S.addChild(fr);
    };
    const eqShown = c.People.filter((pp: any) => eqCatOk(pp.category ?? 0));
    if (this.eqPerson && !eqShown.includes(this.eqPerson)) this.eqPerson = eqShown[0] ?? c.People[0] ?? null;

    // ── 左侧人物列表（原版 equipmentPeopleList L1819 @(10,12)：volunteers/mercenaries 筛选钮 + 竖向 70px 格） ──
    const pListX = 10, pListTop = Y(12);
    const pbar = new Sprite();
    const pg0 = new Graphics();
    pg0.beginFill(4208688, 0.7);
    pg0.drawRect(0, 0, 100, 20);
    pg0.lineStyle(1, 16777215, 0.3);
    pg0.moveTo(0, 20); pg0.lineTo(100, 20);
    pbar.graphics = pg0;
    pbar.x = pListX; pbar.y = pListTop;
    (["volunteers", "mercenaries"] as const).forEach((nm, g) => {
      const sw = new Switch(3, this.eqFilters[g],
        () => this.toggleEqFilter(g), () => this.toggleEqFilter(g),
        null, null, 50, 20, false, this.assets, () => this.soloEqFilter(g));
      sw.x = g * 50; sw.y = 0;
      const ic = this.poolIcon(nm, need);
      if (ic) {
        ic.scaleX = ic.scaleY = 0.4; ic.alpha = 0.3;
        ic.mouseEnabled = false; ic.mouseChildren = false;
        const bmp = ic.children.find((ch) => ch instanceof BitmapObject) as BitmapObject | undefined;
        const iw = bmp ? bmp.width : 30, ih = bmp ? bmp.height : 30;
        ic.x = (50 - iw * 0.4) / 2; ic.y = (20 - ih * 0.4) / 2;
        sw.addChild(ic);
      }
      pbar.addChild(sw);
    });
    S.addChild(pbar);
    addListBackdrop(pListX, pListTop + 21); // 原版 List.areaBG+frame（筛选行之下）
    const plist = new ScrollableArea(90, 429, 90, 429, true, false, false, 10, 10, this.assets); // t91：交易页同款 10px 纹理滚动条
    plist.x = pListX; plist.y = pListTop + 21;
    let ply = 0;
    for (const m of eqShown) {
      // t101：原版 selectEquipmentPerson L5556-5561 换人只 updateEquipmentPerson+updateEquipmentItem，保留 selectedEquipmentItem/Slot
      const cell = this.makeCrewCell(m, m === this.eqPerson, () => { sfxClick(); this.eqPerson = m; this.renderEquipment(); });
      cell.x = 10; cell.y = 10 + ply; // t98：原版 List.as L709 pic.y=10+i*80 —— 顶部留 10px，选中白框外扩不被内容 clip 裁掉
      (cell as any).height = 80;
      plist.addContent(cell);
      ply += 80;
    }
    // t94：原版 List 空列表不显示任何占位文本（equipmentPeopleList items=[] → 空区域）
    plist.updateSize();
    S.addChild(plist);

    // ── 中央人物：大头像 @(120,12)、姓名/载重 @(360,12/32)、三抗符号 （原版 L1589-1602, L6281-6346） ──
    if (p) {
      // t89-t94：原版 equipmentPersonPic=GenericBackground+DropShadowFilter(4,45,0,0.3,4,4,1,3)
      // t89 的近似画了整块 100x100 黑 a0.3 且挂在 pWrap(0,0) → 阴影块盖在 (44..148, 44..148)，
      // 把左侧人物列表（x10..110）从 card 下缘往下压暗约 45px，形成"半透明黑框"
      // t94 修复：阴影仅图片框右下外缘两条 4px 边（blur≈4），定位对齐 pic2（120+4, Y(12)+4）
      const pWrap = new Sprite();
      // t95：原版 equipmentPersonPic L1589-1593 用 ImportedBitmap("GenericBackground.png")
      // + DropShadowFilter(4,45,0,0.3,4,4,1,3)（4px 右下偏移 + blur4 柔和渐隐）。
      // web canvas 无滤镜 → 三层 L 形递减 alpha 近似柔影（不再用 t94 的两条 4px 硬黑边）
      const pSh = new Sprite();
      const psg = new Graphics();
      for (const [d, a] of [[3, 0.13], [5, 0.07], [8, 0.035]] as const) {
        psg.beginFill(0, a);
        psg.drawRect(100, 0, d, 100 + d);  // 右缘（自框线向右延伸 d px）
        psg.drawRect(0, 100, 100 + d, d);  // 下缘（自框线向下延伸 d px）
      }
      pSh.graphics = psg;
      pSh.x = 120; pSh.y = Y(12); pSh.mouseEnabled = false;
      pWrap.addChild(pSh);
      const pic2 = new Sprite();
      // t95：背景改原版同款 GenericBackground.png（100x100 浅灰绿颗粒纹理，无额外描边）
      need("GenericBackground.png");
      const bgImg = this.assets.getImage("GenericBackground.png");
      if (bgImg) {
        const b = new BitmapObject(bgImg);
        b.mouseEnabled = false;
        pic2.addChild(b);
      }
      pic2.x = 120; pic2.y = Y(12);
      const pt = buildPortraitFromCharacter(this.assets, p, 0.4);
      // t94：原版 updateEquipmentPerson L6205-6207 —— Bitmap(generatePortrait()) scale 0.4 直接 addChild 到 (0,0)，
      // 无 fit 无偏移；t93 的 fit 把画像左移 ~17px（头部中心 170→154）+ 放大，已移除
      pt.x = 1; pt.y = 1; // t98：用户反馈肖像需右下移 1px
      pt.mouseEnabled = false; pt.mouseChildren = false;
      pic2.addChild(pt);
      pWrap.addChild(pic2);
      S.addChild(pWrap);

      S.addChild(new EngineText((p.name || "?").toUpperCase(), 16777215, 14, "center", 360, Y(12), 180, 20));
      S.addChild(new EngineText(this.text(903).toUpperCase() + ": " + Math.round(p.equipmentWeight * 10) / 10 + "/" + Math.round(p.capacity * 10) / 10 + " " + this.text(12), 16777215, 14, "center", 360, Y(32), 180, 20));

      const a1 = String(Math.round(p.armor));
      const a2 = String(Math.round(p.fireResistance));
      const a3 = String(Math.round(p.explosionResistance));
      const mkIcon = (nm: string) => { need(nm); const s = new Sprite(); const img = this.assets.getImage(nm); let iw = 34, ih = 34; if (img) { const b = new BitmapObject(img); b.mouseEnabled = false; s.addChild(b); iw = b.width; ih = b.height; } return { s, iw, ih }; };
      const measure = (s: string) => new EngineText(s, 16777215, 14, "left", 0, 0, 110, 20).textWidth;
      const w1 = measure(a1), w2 = measure(a2), w3 = measure(a3);
      const x1 = 285 - (w1 + w2 + 45) / 2;
      // t90：原版 filtericon* 为 SWF 内嵌符号（中心注册：(x,y)=贴图中心）；web 用 PNG（左上注册）
      // → 把贴图中心移到原版公式坐标上，图标与数值同行（此前整组图标偏右下）
      const sh = mkIcon("filtericonshield.png"); sh.s.scaleX = sh.s.scaleY = 0.35; sh.s.x = x1 + 5 - sh.iw * 0.35 / 2; sh.s.y = Y(22) - sh.ih * 0.35 / 2;
      const fir = mkIcon("filtericonfire.png"); fir.s.scaleX = fir.s.scaleY = 0.35; fir.s.x = x1 + 35 + w1 - fir.iw * 0.35 / 2; fir.s.y = Y(22) - fir.ih * 0.35 / 2;
      const ex = mkIcon("filtericonexplosion.png"); ex.s.scaleX = ex.s.scaleY = 0.35; ex.s.x = 285 - (w3 + 15) / 2 + 5 - ex.iw * 0.35 / 2; ex.s.y = Y(42) - ex.ih * 0.35 / 2;
      S.addChild(sh.s); S.addChild(fir.s); S.addChild(ex.s);
      // t97：三抗数字文本下移 1px（用户反馈原版略低 1px）
      S.addChild(new EngineText(a1, 16777215, 14, "left", x1 + 15, Y(12), 110, 20));
      S.addChild(new EngineText(a2, 16777215, 14, "left", x1 + 45 + w1, Y(12), 110, 20));
      S.addChild(new EngineText(a3, 16777215, 14, "left", 285 - (w3 + 15) / 2 + 15, Y(32), 110, 20));

      // 右上属性滚动框（原版 equipmentPersonDataFrame L1807 @(360,62,180x80) + ScrollableArea(170,80)）
      const frame = new Sprite();
      const fg = new Graphics();
      // t89：原版 L1811 drawConcaveRect(-1,-1,182,82)
      fg.lineStyle(1, 16777215, 0.3);
      fg.moveTo(-1, 81); fg.lineTo(181, 81); fg.lineTo(181, -1);
      fg.lineStyle(1, 0, 0.6);
      fg.lineTo(-1, -1); fg.lineTo(-1, 81);
      fg.beginFill(4208688, 0.5);
      fg.drawRect(0, 0, 180, 80);
      frame.graphics = fg;
      frame.x = 360; frame.y = Y(62);
      S.addChild(frame);
      const stats = new ScrollableArea(170, 80, 170, 80, true, false, false, 10, 10, this.assets); // t91
      stats.x = 360; stats.y = Y(62);
      const srows: any[] = [
        { name: this.text(944), value: String(Math.round(p.physical)) },
        { name: this.text(945), value: String(Math.round(p.agility)) },
        { name: this.text(946), value: String(Math.round(p.accuracy)) },
        { name: this.text(947), value: String(Math.round(p.intelligence)), skip: true },
        { name: this.text(50), value: String(Math.round(p.HP)) + "/" + String(Math.round(p.maxHP)) },
        { name: this.text(200), value: String(Math.round(p.morale)) + "%" },
        { name: this.text(1095), value: String(Math.round(p.maxAP)), skip: true },
      ];
      for (const s of Character.skillsList) {
        const f = (p as any)[s.skill];
        const raw = typeof f === "function" ? f.call(p) : (f ?? 0);
        srows.push({ name: getText(this.ds, s.name, this.ds.language), value: String(Math.round(s.skill === "painThreshold" ? raw * 100 : raw)) });
      }
      let sy = 5;
      for (const r of srows) {
        stats.addContent(new EngineText(String(r.name).toUpperCase(), 16777215, 11, "left", 5, sy, 160, 20));
        stats.addContent(new EngineText(String(r.value), 16777215, 11, "right", 5, sy, 160, 20));
        sy += 15;
        if (r.skip) sy += 5;
      }
      stats.updateSize();
      S.addChild(stats);
    }

    // ── 槽位（原版 slotSettings L1636-1643：0/1 护甲 50px、2/5 武器 100px、3/4/6/7 附件 50px、8 背包 180x75） ──
    const slotIcon = (cat: number, sub: number, scale: number): Sprite => {
      const id = this.itemNumFromCatSub(cat, sub);
      const host = new Sprite();
      if (id) attachItemIcon(this.assets, this.ds, host, id, { size: 250 });
      host.scaleX = host.scaleY = scale;
      host.mouseEnabled = false; host.mouseChildren = false;
      return host;
    };
    for (let s = 0; s < 9; s++) {
      const [x, y, w, h] = this.eqSlots[s];
      const cell = new Sprite();
      const g = new Graphics();
      // t89：原版 L1645 drawConcaveRect(-1,-1,w+2,h+2)：白(右下,0.3)+黑(左上,0.6) 内凹双层框；底 4208688 a0.4
      g.lineStyle(1, 16777215, 0.3);
      g.moveTo(-1, h + 1); g.lineTo(w + 1, h + 1); g.lineTo(w + 1, -1);
      g.lineStyle(1, 0, 0.6);
      g.lineTo(-1, -1); g.lineTo(-1, h + 1);
      g.beginFill(4208688, 0.4);
      g.drawRect(0, 0, w, h);
      g.hitRect(0, 0, w, h);
      cell.graphics = g;
      if (this.eqSlot === s) {
        const selOv = new Sprite();
        const sg = new Graphics();
        sg.beginFill(16777215, 0.3);
        sg.drawRect(0, 0, w, h);
        selOv.graphics = sg;
        selOv.mouseEnabled = false;
        cell.addChild(selOv);
      }
      cell.x = x; cell.y = Y(y); // t89 Bug#0：槽位 y 必须 Y()（此前整环低 40px）
      const content = this.slotContent(s);
      if (content) {
        if (s === 2 || s === 5) {
          cell.addChild(slotIcon(content.cat, content.sub, 0.4));
          const ws = s === 2 ? 0 : 1;
          const wDef = p && this.ds.weapons.Weapons?.[p.weapons[ws]];
          const wt = wDef && this.ds.weapons.WeaponTypes?.[wDef.type];
          if (wDef && wt && (wt.category === 2 || wt.category === 3 || wt.category === 4)) {
            // 弹种数量（原版 L6293-6318：ammo==17 → 金钱；否则 Σ equipment 同 type 弹药；双枪同弹种显示 1023）
            const ammoSub = wDef.ammo;
            let n = 0;
            if (ammoSub === 17) n = Math.floor(c.money ?? 0);
            else if (p) for (const e of p.equipment) { const eit = this.ds.items.Items[e.type]; if (eit && eit.category === 3 && getItemData(this.ds, e.type)?.type === ammoSub) n += e.amount; }
            const twin = ws === 1 && p && p.weapons[0] > 0 && this.ds.weapons.Weapons[p.weapons[0]]?.ammo === ammoSub;
            const ammoTxt = new EngineText(twin ? this.text(1023).toUpperCase() : String(n), 16777215, 12, "right", 5, 83, 90, 20);
            cell.addChild(ammoTxt);
            const aHost = new Sprite();
            // t101：原版 equipmentSlots 构造 L1665-1671 —— ammoIcon = new filtericonammo()（固定弹药符号，非物品图）
            // 符号中心注册 @(50,89) scale0.4；web PNG 左上注册 → 中心对齐；x 随文本宽动态（原版 L6333 ammoIcon.x=95-infoText.textWidth-15）
            need("filtericonammo.png");
            const aimg = this.assets.getImage("filtericonammo.png");
            let aiw = 30, aih = 30;
            if (aimg) { const ab = new BitmapObject(aimg); ab.mouseEnabled = false; ab.mouseChildren = false; aHost.addChild(ab); aiw = ab.width; aih = ab.height; }
            aHost.scaleX = aHost.scaleY = 0.4;
            aHost.x = 95 - ammoTxt.textWidth - 15 - aiw * 0.4 / 2;
            aHost.y = 91 - aih * 0.4 / 2;
            aHost.mouseEnabled = false; aHost.mouseChildren = false;
            cell.addChild(aHost);
          } else if (wt && wt.category === 5) {
            cell.addChild(new EngineText("x" + (p?.grenadeAmounts?.[ws] ?? 0), 16777215, 12, "right", 5, 83, 90, 20));
          }
        } else {
          cell.addChild(slotIcon(content.cat, content.sub, 0.2));
        }
      }
      // 附件没电红色 X（原版 attachmentBatterySymbols L1700-1732 电池+叉）
      if (s >= 3 && s <= 7 && p) {
        const ws = s >= 6 ? 1 : 0;
        const a = (s === 3 || s === 6) ? 0 : 1;
        if (p.attachments[ws]?.[a] > 0 && !p.attachmentsBatteryStatus()[ws][a]) {
          // t89：原版 L1700-1732 attachmentBatterySymbols：电池矩形轮廓+红叉，scale0.75
          const xs = new Sprite();
          const xg = new Graphics();
          xg.lineStyle(5, 11534336, 0.8);
          xg.moveTo(-20, -10); xg.lineTo(20, -10); xg.lineTo(20, -5); xg.lineTo(25, -5); xg.lineTo(25, 5);
          xg.lineTo(20, 5); xg.lineTo(20, 10); xg.lineTo(-20, 10); xg.lineTo(-20, -10);
          xg.moveTo(-20, 20); xg.lineTo(20, -20);
          xg.moveTo(-20, -20); xg.lineTo(20, 20);
          xs.graphics = xg;
          xs.x = w / 2; xs.y = h / 2;
          xs.scaleX = xs.scaleY = 0.75;
          cell.addChild(xs);
        }
      }
      cell.addEventListener("click", () => {
        sfxClick();
        // t100：单击仅选中，双击卸下（原版 clickOnEquipmentSlot L5476 选中 / doubleClickOnEquipmentSlot L5496 卸下）
        const now = Date.now();
        const dbl = this.eqDblId === s && now - this.eqDblT < 400;
        this.eqDblId = s; this.eqDblT = now;
        if (dbl && this.slotContent(s)) { this.removeFromSlot(s); this.eqSlot = -1; }
        else {
          this.eqSlot = s;
          // t101：单击槽位后详情栏显示该槽物品（原版单击只 updateSlots；用户要求信息栏同步）
          const sc = this.slotContent(s);
          if (sc) {
            const id = this.itemNumFromCatSub(sc.cat, sc.sub);
            const def = id ? getItemData(this.ds, id) : null;
            const it = id ? this.ds.items.Items[id] : null;
            if (id && def && it) this.eqPoolItem = { id, amt: 1, def, it, name: itemName(this.ds, id) };
          }
        }
        this.renderEquipment();
      });
      // t102：悬停装备槽 → 物品属性浮层（公共 CursorInfoPanel，浅黄样式与交易界面一致；原版无悬停，web 增强）
      this.attachEqCursor(cell, () => { const sc = this.slotContent(s); return sc ? this.itemNumFromCatSub(sc.cat, sc.sub) : null; });
      S.addChild(cell);
    }

    // ── 分隔线（原版 equipmentLines L1526-1536 @110..550, y352） ──
    if (p) {
      const sep = new Sprite();
      const sepG = new Graphics();
      sepG.lineStyle(1, 16777215, 0.3);
      sepG.moveTo(110, Y(352)); sepG.lineTo(550, Y(352));
      sepG.lineStyle(1, 0, 0.6);
      sepG.moveTo(110, Y(351)); sepG.lineTo(550, Y(351));
      sep.graphics = sepG;
      sep.mouseEnabled = false;
      S.addChild(sep);
    }

    // ── 右侧三按钮（原版 equipmentButtons L1771-1796：Button(2) 皮肤 InterfaceButton2Up/Down.png 206×28，scaleX=0.9） ──
    const mkBig = (label: string, by: number, fn: () => void) => {
      need("InterfaceButton2Up.png"); need("InterfaceButton2Down.png"); // t91：首帧皮肤未加载 → 就绪后重绘
      const b = new Button(2, fn, label, this.assets);
      b.scaleX = 0.9; // 原版仅缩 X（Button.as L1790 scaleX=0.9）
      b.x = 358; b.y = by;
      S.addChild(b);
    };
    mkBig(this.text(1092).toUpperCase() || "CLEAR INV", Y(151), () => this.clearInventory());
    mkBig(this.text(1093).toUpperCase() || "CLEAR EQ", Y(181), () => this.clearEquipment());
    mkBig(this.text(1094).toUpperCase() || "SWAP", Y(211), () => this.swapWeapons());

    // ── 缺省弹药（原版 L1704-1768：标题 @(230,132+110i)、框 @(230,157+110i)、箭头 @230/325） ──
    if (p) {
      for (let ws = 0; ws < 2; ws++) {
        const ty = Y(132 + ws * 110);
        const fy = Y(157 + ws * 110);
        S.addChild(new EngineText(this.text(1075).toUpperCase() + ":", 16777215, 12, "center", 230, ty, 110, 20));
        const fr = new Sprite();
        const frG = new Graphics();
        // t89：原版 L1740 drawConcaveRect(-1,-1,112,17)
        frG.lineStyle(1, 16777215, 0.3);
        frG.moveTo(-1, 16); frG.lineTo(111, 16); frG.lineTo(111, -1);
        frG.lineStyle(1, 0, 0.6);
        frG.lineTo(-1, -1); frG.lineTo(-1, 16);
        frG.beginFill(4208688, 0.4);
        frG.drawRect(0, 0, 110, 15);
        fr.graphics = frG;
        fr.x = 230; fr.y = fy;
        fr.mouseEnabled = false;
        S.addChild(fr);
        // t96：先按原版 Character.updateSelectedAmmo 刷新默认弹药，再显示：
        // selectedAmmo==null（无武器/非射击类/背包无匹配弹）→ 文本193(n/a)；
        // 武器 ammo==17（钱）→ 文本20；否则显示弹药 variation 短名（如"圆弹头"）
        this.eqUpdateSelectedAmmo(ws);
        const wDef2 = p.weapons[ws] ? this.ds.weapons.Weapons?.[p.weapons[ws]] : null;
        let lab = this.text(193);
        if (p.selectedAmmo?.[ws]) {
          lab = (wDef2 && wDef2.ammo === 17 ? this.text(20) : this.ammoNameOf(ws) || this.text(193));
        }
        // t98：缺省弹药/N/A 文本再下移 1px（原版 defaultAmmoTexts @245,156；t97 fy-1→fy，现 fy+1）
        S.addChild(new EngineText(lab.toUpperCase(), 16777215, 11, "center", 245, fy - 1, 80, 15));
        need("Button15x15Up.png"); need("Button15x15Down.png"); // t91
        S.addChild(this.mkAmmoBtn(-1, 230, fy, () => this.cycleAmmoDir(ws, -1)));
        S.addChild(this.mkAmmoBtn(1, 325, fy, () => this.cycleAmmoDir(ws, 1)));
      }
    }

    // ── 背包清单（原版 equipmentList L1782 @(360,267) 水平 180x75：ammo/firstaid 过滤；点格→数量框移除） ──
    if (p) {
      S.addChild(new EngineText(this.text(1090).toUpperCase() + ":", 16777215, 12, "center", 360, Y(242), 180, 20));
      const inv = new Sprite();
      const ivG = new Graphics();
      // t89：槽8 同原版 drawConcaveRect(-1,-1,182,77)
      ivG.lineStyle(1, 16777215, 0.3);
      ivG.moveTo(-1, 76); ivG.lineTo(181, 76); ivG.lineTo(181, -1);
      ivG.lineStyle(1, 0, 0.6);
      ivG.lineTo(-1, -1); ivG.lineTo(-1, 76);
      ivG.beginFill(4208688, 0.4);
      ivG.drawRect(0, 0, 180, 75);
      inv.graphics = ivG;
      inv.x = 360; inv.y = Y(267);
      inv.mouseEnabled = false;
      S.addChild(inv);
      // t89：原版 equipmentList 水平筛选钮 ammo/firstaid（20x37.5 @ x=0, y=0/37.5）
      ["ammo", "firstaid"].forEach((k, g2) => {
        const sw = new Switch(3, !!this.eqBackpackFilters[k],
          () => this.toggleEqBackpackFilter(k), () => this.toggleEqBackpackFilter(k),
          null, null, 20, 37, false, this.assets, () => this.soloEqBackpackFilter(k));
        sw.x = 0; sw.y = g2 * 38;
        const ic = this.poolIcon(k, need);
        if (ic) {
          ic.scaleX = ic.scaleY = 0.4; ic.alpha = 0.3;
          ic.mouseEnabled = false; ic.mouseChildren = false;
          const bmp = ic.children.find((ch) => ch instanceof BitmapObject) as BitmapObject | undefined;
          const iw = bmp ? bmp.width : 30, ih = bmp ? bmp.height : 30;
          ic.x = (20 - iw * 0.4) / 2; ic.y = (37 - ih * 0.4) / 2;
          sw.addChild(ic);
        }
        inv.addChild(sw);
      });
      const eqItems = p.equipment.filter((e: any) => {
        const it = this.ds.items.Items[e.type];
        if (!it) return false;
        if (it.category === 3) return this.eqBackpackFilters.ammo;
        if (it.category === 1) { const d = getItemData(this.ds, e.type); return !!this.eqBackpackFilters.firstaid && !!(d && (d.firstAidKit || d.heal > 0)); }
        return false;
      });
      // t93：改原版 equipmentList 同款水平滚动列表（List.as → ScrollableArea(...,vertical=false,...,3,10)）
      // 内容区在框内 x=21 起（左侧 20px 留给 ammo/firstaid 筛选钮）；底部 style3 10px 横向滚动条
      const invList = new ScrollableArea(159, 75, 159, 75, false, true, false, 10, 10, this.assets); // 宽 159=180-21（内容区自 x=21 起）
      invList.x = 360 + 21; invList.y = Y(267);
      let ix = 0;
      for (const e of eqItems) {
        const cell = new Sprite();
        const cellG = new Graphics();
        drawItemCellBG(cellG, 5); // t100：公共灰框
        cell.graphics = cellG;
        const icon = new Sprite();
        attachItemIcon(this.assets, this.ds, icon, e.type, { size: 250 });
        icon.mouseEnabled = false; icon.mouseChildren = false;
        cell.addChild(icon);
        const it = this.ds.items.Items[e.type];
        cell.addChild(new EngineText((it && it.category === 3 ? "x" : "") + this.gridCount(e.amount), 16777215, 53, "right", 10, 180, 230, 80));
        cell.scaleX = cell.scaleY = 0.18;
        // t89 Bug#1：原版格 x = List区偏移21 + 边距10 = 31（列表内坐标 = 10+i*55）
        cell.x = 10 + ix * 55; cell.y = 10;
        (cell as any).width = 45; // t93：横向滚动需要内容宽（45 = 250*0.18）
        (cell as any).height = 50;
        const hg = new Graphics();
        hg.hitRect(0, 0, 250, 250);
        cell.graphics = hg;
        cell.addEventListener("click", () => {
          sfxClick();
          this.openEqCalc(1, Math.max(1, Math.round(e.amount)), (v) => { p.reduceItemFromEquipment(e.type, Math.floor(v), false, true); this.renderEquipment(); });
        });
        // t102：悬停背囊格 → 物品属性浮层
        this.attachEqCursor(cell, () => e.type);
        invList.addContent(cell);
        ix++;
      }
      // t94：原版 equipmentList items=[] 空列表无占位文本；t93 的 "—" 短线观感突兀，已删
      invList.updateSize();
      S.addChild(invList);
    }

    // ── 选中物品详情（原版 equipmentItemPic/Name/equipButton/DescriptionArea L1539-1585 @y362-442） ──
    const itm = this.eqPoolItem;
    const canEquip = !!itm && this.eqFeasible.length > 0 && !this.eqTooHeavy && this.eqSlot >= 0;
    if (itm) {
      const det = this.eqItemDetail(itm.id);
      S.addChild(new EngineText((itm.name || "").toUpperCase(), 16777215, 14, "center", 120, Y(362), 310, 20));
      const pbWrap = new Sprite();
      // t95：原版 equipmentItemPic L1557-1561 同款 GenericBackground.png + DropShadowFilter（同上，柔影）
      const pbSh = new Sprite();
      const psg2 = new Graphics();
      for (const [d, a] of [[3, 0.13], [5, 0.07], [8, 0.035]] as const) {
        psg2.beginFill(0, a);
        psg2.drawRect(100, 0, d, 100 + d);
        psg2.drawRect(0, 100, 100 + d, d);
      }
      pbSh.graphics = psg2;
      pbSh.x = 440; pbSh.y = Y(362); pbSh.mouseEnabled = false;
      pbWrap.addChild(pbSh);
      const picBox = new Sprite();
      need("GenericBackground.png");
      const bgImg2 = this.assets.getImage("GenericBackground.png");
      if (bgImg2) {
        const b2 = new BitmapObject(bgImg2);
        b2.mouseEnabled = false;
        picBox.addChild(b2);
      }
      picBox.x = 440; picBox.y = Y(362);
      const picIcon = new Sprite();
      attachItemIcon(this.assets, this.ds, picIcon, itm.id, { size: 250 });
      picIcon.scaleX = picIcon.scaleY = 0.4;
      picIcon.mouseEnabled = false; picIcon.mouseChildren = false;
      picBox.addChild(picIcon);
      pbWrap.addChild(picBox);
      S.addChild(pbWrap);
      if (det) {
        S.addChild(new EngineText(det.ess1, 16777215, 14, "center", 120, Y(422), 140, 20));
        S.addChild(new EngineText(det.ess2, 16777215, 11, "center", 120, Y(442), 140, 20));
      }
      const df = new Sprite();
      const dfG = new Graphics();
      // t89：原版 L1577 drawConcaveRect(-1,-1,152,72)
      dfG.lineStyle(1, 16777215, 0.3);
      dfG.moveTo(-1, 71); dfG.lineTo(151, 71); dfG.lineTo(151, -1);
      dfG.lineStyle(1, 0, 0.6);
      dfG.lineTo(-1, -1); dfG.lineTo(-1, 71);
      dfG.beginFill(4208688, 0.5);
      dfG.drawRect(0, 0, 150, 70);
      df.graphics = dfG;
      df.x = 280; df.y = Y(392);
      df.mouseEnabled = false;
      S.addChild(df);
      const da = new ScrollableArea(140, 70, 140, 70, true, false, false, 10, 10, this.assets); // t91
      da.x = 280; da.y = Y(392);
      if (det) {
        let dy = 5;
        const shrink = (row: { name?: string; value?: string; oneLine?: string; skip?: boolean }) => {
          if (row.skip) { dy += 5; return; }
          if (row.oneLine !== undefined) {
            da.addContent(new EngineText(row.oneLine, 16777215, 11, "center", 5, dy, 130, 15));
            dy += 15;
            return;
          }
          const nameT = new EngineText(String(row.name ?? ""), 16777215, 11, "left", 5, dy, 130, 15);
          const valT = new EngineText(String(row.value ?? ""), 16777215, 11, "right", 5, dy, 130, 15);
          while (nameT.textWidth + valT.textWidth > 125) {
            if (nameT.text.length > 3) nameT.text = nameT.text.slice(0, -2) + ".";
            else { if (valT.text.length <= 3) break; valT.text = valT.text.slice(0, -2) + "."; }
          }
          da.addContent(nameT);
          da.addContent(valT);
          dy += 15;
        };
        for (const row of det.rows) shrink(row);
      }
      da.updateSize();
      S.addChild(da);
    }
    if (canEquip && itm) {
      need("InterfaceButton6Up.png"); need("InterfaceButton6Down.png"); // t91
      const eb = new Button(6, () => this.equipItem(itm), this.text(1021).toUpperCase() || "EQUIP", this.assets);
      eb.x = 117; eb.y = Y(389); // 原版 equipButton L1565-1568：Button(6) @(117,389)
      S.addChild(eb);
    } else if (itm && this.eqTip) {
      S.addChild(new EngineText(this.eqTip.toUpperCase(), 16777215, 14, "center", 120, Y(392), 140, 20));
    }

    // ── 右侧物品池（原版 equipmentItemsList L1823 @(550,12) 竖向 450：5 类别筛选钮 + 70px 格 ×(amount−inUse)） ──
    const poolX = 550, poolTop = Y(12);
    const pbar2 = new Sprite();
    const pg2 = new Graphics();
    pg2.beginFill(4208688, 0.7);
    pg2.drawRect(0, 0, 100, 20);
    pg2.lineStyle(1, 16777215, 0.3);
    pg2.moveTo(0, 20); pg2.lineTo(100, 20);
    pbar2.graphics = pg2;
    pbar2.x = poolX; pbar2.y = poolTop;
    const poolKeys = ["weapons", "ammo", "armor", "attachments", "firstaid"] as const;
    poolKeys.forEach((k, i) => {
      const sw = new Switch(3, !!this.eqPoolFilters[k],
        () => this.toggleEqPoolFilter(k), () => this.toggleEqPoolFilter(k),
        null, null, 20, 20, false, this.assets, () => this.soloEqPoolFilter(k));
      sw.x = i * 20; sw.y = 0;
      const ic = this.poolIcon(k, need);
      if (ic) {
        ic.scaleX = ic.scaleY = 0.4; ic.alpha = 0.3;
        ic.mouseEnabled = false; ic.mouseChildren = false;
        const bmp = ic.children.find((ch) => ch instanceof BitmapObject) as BitmapObject | undefined;
        const iw = bmp ? bmp.width : 30, ih = bmp ? bmp.height : 30;
        ic.x = (20 - iw * 0.4) / 2; ic.y = (20 - ih * 0.4) / 2;
        sw.addChild(ic);
      }
      pbar2.addChild(sw);
    });
    S.addChild(pbar2);
    addListBackdrop(poolX, poolTop + 21); // 原版 equipmentItemsList areaBG+frame
    const pool = new ScrollableArea(90, 429, 90, 429, true, false, false, 10, 12, this.assets); // t91
    pool.x = poolX; pool.y = poolTop + 21;
    const poolItems = this.equipmentPoolItems();
    const cInUse = c.inUse ?? {};
    let poolIdx = 0;
    for (const it0 of poolItems) {
      const cell = this.makeGridCell(it0.id, it0.amt - (cInUse[it0.id] ?? 0), it0.it.category, !!(this.eqPoolItem && this.eqPoolItem.id === it0.id), () => {
        const now = Date.now();
        const dbl = this.eqDblId === it0.id && now - this.eqDblT < 400;
        this.eqDblId = it0.id;
        this.eqDblT = now;
        if (dbl) {
          // 双击→直接装备（原版 doubleClickEquipmentItem：仅当 equipButton 可见=可选）
          if (this.eqFeasible.length > 0 && !this.eqTooHeavy && this.eqSlot >= 0) this.equipItem(it0);
          return;
        }
        sfxClick();
        this.eqPoolItem = it0;
        this.checkIfSelectedIsPossible();
        this.renderEquipment();
      });
      cell.x = 10; cell.y = 10 + poolIdx * 80;
      (cell as any).height = 80;
      pool.addContent(cell);
      poolIdx++;
    }
    // t94：原版 equipmentItemsList 空列表无占位文本（同 List 行为）
    pool.updateSize();
    S.addChild(pool);

    // t91：首帧缺失的贴图（三抗/筛选图标、按钮皮肤）异步就绪后整页重绘一次；
    // 若全部加载失败（无进展）则不重绘，避免死循环
    if (reqMissing.length) {
      Promise.all(reqMissing.map((nm) => this.assets.ensure(nm))).then(() => {
        const gained = reqMissing.some((nm) => !!this.assets.getImage(nm));
        if (gained && this.category === 3) this.renderEquipment();
      });
    }
  }

  // t96：原版 Character.updateSelectedAmmo L2233-2294 —— 刷新缺省弹药（弹药来自【人物背包】，非车队货舱）：
  // 射击类武器（WeaponTypes.category 2/3/4）→ 当前弹药仍有效则保留，否则取背包第一枚匹配弹
  // （category3 且 Ammo[sub].type==武器 ammo 且 amount−inUse>0）；ammo==17（钱）→ 231；其余 → null
  private eqUpdateSelectedAmmo(ws: number, p = this.eqPerson) {
    if (!p) return;
    const wId = p.weapons[ws];
    const wDef = wId ? this.ds.weapons.Weapons?.[wId] : null;
    const wType = wDef ? this.ds.weapons.WeaponTypes?.[wDef.type] : null;
    if (wId > 0 && wType && (wType.category === 2 || wType.category === 3 || wType.category === 4)) {
      if (wDef.ammo === 17) { p.selectedAmmo[ws] = { type: 231, amount: 0, inUse: 0 }; return; }
      const eqList: any[] = p.equipment ?? [];
      const cur = p.selectedAmmo?.[ws];
      let keep = false;
      if (cur) {
        const it = this.ds.items.Items[cur.type];
        const def = getItemData(this.ds, cur.type);
        if (def && it && def.type === wDef.ammo) { // def=Ammo[sub].type == 武器口径
          for (const e of eqList) {
            if (e.type === cur.type) {
              if (e.amount > 0 && e.amount - (e.inUse ?? 0) > 0) keep = true;
              break;
            }
          }
        }
      }
      if (!keep) {
        p.selectedAmmo[ws] = null;
        const found = eqList.find((e: any) => {
          const it2 = this.ds.items.Items[e.type];
          if (!it2 || it2.category !== 3) return false;
          const d2 = getItemData(this.ds, e.type);
          return d2?.type === wDef.ammo && e.amount - (e.inUse ?? 0) > 0;
        });
        if (found) p.selectedAmmo[ws] = { type: found.type, amount: found.amount, inUse: found.inUse ?? 0 };
      }
    } else {
      p.selectedAmmo[ws] = null;
    }
  }

  // 缺省弹药：左右循环（原版 pressDefaultAmmoArrow L5447 → Character.changeSelectedAmmo(-1/1, ws)；
  // t96 改为与原版一致：在【人物背包 equipment】中环绕寻找下一枚匹配弹）
  private cycleAmmoDir(ws: number, dir: number) {
    const p = this.eqPerson;
    if (!p) return;
    const wDef = p.weapons[ws] ? this.ds.weapons.Weapons?.[p.weapons[ws]] : null;
    if (!wDef || !wDef.ammo) return;
    const eqList: any[] = p.equipment ?? [];
    const curT = p.selectedAmmo?.[ws]?.type ?? -1;
    let i0 = eqList.findIndex((e: any) => e.type === curT);
    if (i0 < 0) i0 = 0; // 原版 _loc4_=0
    let i = i0;
    for (let step = 1; step <= eqList.length; step++) {
      i += dir;
      if (i >= eqList.length) i -= eqList.length;
      if (i < 0) i += eqList.length;
      const e = eqList[i];
      const it = e ? this.ds.items.Items[e.type] : null;
      if (it && it.category === 3 && e.amount - (e.inUse ?? 0) > 0) {
        const def = getItemData(this.ds, e.type);
        if (def?.type === wDef.ammo) {
          p.selectedAmmo[ws] = { type: e.type, amount: e.amount, inUse: e.inUse ?? 0 };
          break;
        }
      }
    }
    this.renderEquipment();
  }

  // 物品池类别筛选（原版 List.as Filters / switchFilter / doubleClickFilter）
  private toggleEqPoolFilter(k: string) { this.eqPoolFilters[k] = !this.eqPoolFilters[k]; this.renderEquipment(); }
  private soloEqPoolFilter(k: string) { for (const key of Object.keys(this.eqPoolFilters)) this.eqPoolFilters[key] = key === k; this.renderEquipment(); }
  private toggleEqBackpackFilter(k: string) { this.eqBackpackFilters[k] = !this.eqBackpackFilters[k]; this.renderEquipment(); }
  private soloEqBackpackFilter(k: string) { for (const key of Object.keys(this.eqBackpackFilters)) this.eqBackpackFilters[key] = key === k; this.renderEquipment(); }

  // 小筛选图标（原版 filtericon{name}.png；黑名单-兜底返回 null → 只显示开关）
  private poolIcon(name: string, need?: (n: string) => void): Sprite | null {
    if (need) need("filtericon" + name + ".png"); // t91：首帧未加载 → 记录待重绘
    const img = this.assets.getImage("filtericon" + name + ".png");
    if (img) {
      const s = new Sprite();
      const b = new BitmapObject(img);
      b.mouseEnabled = false;
      s.addChild(b);
      return s;
    }
    return null;
  }

  // 选中物品详情描述（原版 updateEquipmentItem L5571-5904：类别化属性列表 + 弹道能量计算）
  // 选中物品详情描述：解析委托公共组件 ItemInfo.itemDetailRows（原版 updateEquipmentItem L5571-5904，t102）
  private eqItemDetail(id: number): { name: string; ess1: string; ess2: string; rows: any[] } | null {
    const it = this.ds.items.Items[id];
    if (!it) return null;
    const det = itemDetailRows(this.ds, id);
    if (!det) return null;
    return { name: itemName(this.ds, id), ess1: det.ess1, ess2: det.ess2, rows: det.rows };
  }

  // 原版 List.as 物品格（L499-720）：250 母格模板 round 方（fill 5788752=0x5852D0 a0.8；选中白框 a0.2）
  // + 物品图（attachItemIcon 250 满格）+ 数量（40 号 right @(10,195,230,60) a0.8，cat1 无 x，K/M 缩写）
  // 整体 scale=(listSize−30)/250=0.28 → 70×70 格
  private makeGridCell(id: number, count: number, category: number, selected: boolean, onClick: () => void): Sprite {
    const group = new Sprite();
    // 格底（原版 picBG 5788752 a0.8；公共绘制共用 ItemCell.ts，t100）
    const bg = new Sprite();
    const bgG = new Graphics();
    drawItemCellBG(bgG, 10);
    bg.graphics = bgG;
    bg.mouseEnabled = false;
    group.addChild(bg);
    // 物品图（原版 item.picture，250 图标自然尺寸铺满母格）
    const iconHost = new Sprite();
    iconHost.mouseEnabled = false;
    iconHost.mouseChildren = false;
    attachItemIcon(this.assets, this.ds, iconHost, id, { size: 250 });
    group.addChild(iconHost);
    // 数量（原版 40 号 right @(10,195,230,60) a0.8；cat1 无 "x" 前缀；≥1e8→M、≥1e5→K）
    const amt = new EngineText((category === 2 || category === 3 ? "x" : "") + this.gridCount(count), 16777215, 40, "right", 10, 195, 230, 60);
    amt.alpha = 0.8;
    amt.mouseEnabled = false;
    group.addChild(amt);
    // 缩放 + 命中（母格命中，hitTestPoint 会除以 scale）
    group.scaleX = group.scaleY = (100 - 30) / 250; // listSize=100 → 0.28
    // t96：选中白框画在最上层并外扩（原版 List.as L501-512：selectFrame 最后 addChild，
    // 路径沿 250 母格外扩 _loc11_=selectFrameSize/((listSize-30)/250)=5/scale → 屏上恒 5px，alpha0.2 白）
    if (selected) {
      const ext = 5 / group.scaleX;
      const selFrame = new Sprite();
      const sg = new Graphics();
      drawItemCellSelect(sg, ext);
      selFrame.graphics = sg;
      selFrame.mouseEnabled = false;
      group.addChild(selFrame);
      // t97：同 PeopleGrid —— 白框置于背景框之下（原版 List.as L512<L525），仅外扩环露出
      group.setChildIndex(selFrame, 0);
    }
    const hg = new Graphics();
    hg.hitRect(0, 0, 250, 250);
    group.graphics = hg;
    // t102：悬停物品 → 属性浮层（公共 CursorInfoPanel；原版无悬停，web 增强）
    this.attachEqCursor(group, () => id);
    group.addEventListener("click", onClick);
    return group;
  }

  // List.as L652-663 数量缩写：≥1e8 → round(v/1e6)+" M"；≥1e5 → round(v/1e3)+" K"
  private gridCount(v: number): string {
    if (!Number.isFinite(v)) return "0";
    if (v >= 100000000) return Math.round(v / 1000000) + " M";
    if (v >= 100000) return Math.round(v / 1000) + " K";
    return String(itemAmount(v, true));
  }

  // t90：缺省弹药左右箭头（原版 Button(7)：皮肤 Button15x15Up/Down.png + RepeatedGraphics(1/2,4469521,0.8)
  // 实心三角，三角中心置于 15×15 按钮中心 (7.5,7.5)；按下切换 Down 皮肤）
  private mkAmmoBtn(dir: number, x: number, y: number, fn: () => void): Sprite {
    const b = new Sprite();
    const up = this.assets.getImage("Button15x15Up.png");
    const down = this.assets.getImage("Button15x15Down.png");
    const mk = (im: HTMLImageElement | null, painted: boolean) => {
      const s = new Sprite();
      if (im) {
        const bm = new BitmapObject(im); bm.mouseEnabled = false; s.addChild(bm);
      } else {
        const g = new Graphics();
        g.lineStyle(1, 0, 0.8);
        g.beginFill(painted ? 7366752 : 4605510, 0.85);
        g.drawRect(0, 0, 15, 15);
        g.endFill();
        g.lineStyle(1, painted ? 16777215 : 0, painted ? 0.3 : 0.8);
        g.moveTo(1, 14); g.lineTo(1, 1); g.lineTo(14, 1);
        s.graphics = g;
      }
      return s;
    };
    const upB = mk(up, false), downB = mk(down, true);
    downB.visible = false;
    upB.mouseEnabled = upB.mouseChildren = false;
    downB.mouseEnabled = downB.mouseChildren = false;
    b.addChild(upB); b.addChild(downB);
    // 原版 RepeatedGraphics(1/2,4469521,0.8)：填充三角，中心=按钮中心
    const tri = new Sprite();
    const tg = new Graphics();
    tg.beginFill(4469521, 0.8);
    if (dir < 0) { tg.moveTo(3, -4); tg.lineTo(-4, 0); tg.lineTo(3, 4); }
    else { tg.moveTo(-3, -4); tg.lineTo(4, 0); tg.lineTo(-3, 4); }
    tg.endFill();
    tri.graphics = tg;
    tri.x = 7.5; tri.y = 7.5;
    tri.mouseEnabled = tri.mouseChildren = false;
    b.addChild(tri);
    const hg = new Graphics();
    hg.hitRect(0, 0, 15, 15);
    b.graphics = hg;
    b.x = x; b.y = y;
    b.addEventListener("pointerdown", () => { sfxClick(); downB.visible = true; upB.visible = false; });
    b.addEventListener("pointerup", () => { downB.visible = false; upB.visible = true; });
    b.addEventListener("pointerout", () => { downB.visible = false; upB.visible = true; });
    b.addEventListener("click", fn);
    return b;
  }

  private fmtNum(n: number): string {
    return n >= 100 ? String(Math.round(n)) : Math.round(n * 100) / 100 + "";
  }

  // 日志：原版 CaravanMenu.as 1203–1359、7839–8132。以下坐标均为舞台坐标。
  private logBookmark = 0;
  private knownPriceItem: number | null = null;
  private economyGraph: ConsProdGraph | null = null;
  private economyPeriod = 1;
  private economyItem: number | null = null;

  private renderLog() {
    if (this.economyGraph) {
      this.economyPeriod = this.economyGraph.selectedPeriod;
      this.economyItem = this.economyGraph.selectedItem;
      this.economyGraph.remove(); this.economyGraph = null;
    }
    this.mainArea.removeAll();
    const page = new Sprite(); page.y = -40;
    this.mainArea.addChild(page);
    const categories = this.gd.storyMode ? [0,1,2] : [0,2];
    if (!categories.includes(this.logBookmark)) this.logBookmark = 0;
    const activeIndex = categories.indexOf(this.logBookmark);
    const labels = categories.map(i => [2176,2177,2179][i]).map(id => this.text(id).toUpperCase());
    const tabW = (640-(labels.length-1)*5)/labels.length;
    const paperPiece = (target: Sprite,x:number,y:number,w:number,h:number,sx=0,sy=0) => {
      const put = (paper:HTMLImageElement|null) => {
        if (!paper) return;
        const image = new BitmapObject(paper); image.srcRect = {x:sx,y:sy,w,h};
        image.x=x; image.y=y; image.mouseEnabled=false; target.addChildAt(image,0);
      };
      const paper=this.assets.getImage("TownBG.jpg");
      if(paper)put(paper);else void this.assets.ensure("TownBG.jpg").then(put);
    };
    // Inactive bookmarks sit behind the page. The 5px gaps expose the underlying
    // caravan-menu material; a full-width paper rectangle used to fill them in.
    for(let i=0;i<labels.length;i++) {
      if(i===activeIndex)continue;
      const tab=new Sprite(); tab.name="diary-tab-"+i; tab.x=10+i*(tabW+5); tab.y=12;
      paperPiece(tab,0,0,tabW,30);
      const shade=new Sprite(),g=new Graphics();g.beginFill(0,.3);g.drawRect(0,0,tabW,30);
      shade.graphics=g;shade.mouseEnabled=false;tab.addChild(shade);
      const hit=new Graphics();hit.hitRect(0,0,tabW,30);tab.graphics=hit;
      const text=new EngineText(labels[i],16777215,14,"center",5,5,tabW-10,20);
      text.alpha=.7;text.mouseEnabled=false;tab.addChild(text);
      tab.mouseChildren=false;tab.buttonMode=true;
      tab.addEventListener("click",()=>{if(this.logBookmark!==categories[i])sfxPage();this.logBookmark=categories[i];this.renderLog();});
      page.addChild(tab);
    }
    const background=new Sprite();background.mouseEnabled=background.mouseChildren=false;
    const left=10+activeIndex*(tabW+5);
    paperPiece(background,10,40,640,420,0,30);
    paperPiece(background,left,10,tabW,30,left-10,0);
    page.addChild(background);
    // Original logFG is a single page-shaped outline: no bottom border through
    // the active tab, and no separate boxes around inactive bookmarks.
    const outline=new Sprite(),g=new Graphics();g.lineStyle(1,1512976);
    g.moveTo(10,40);g.lineTo(left,40);g.lineTo(left,10);g.lineTo(left+tabW,10);
    g.lineTo(left+tabW,40);g.lineTo(650,40);g.lineTo(650,460);g.lineTo(10,460);g.lineTo(10,40);
    outline.graphics=g;outline.mouseEnabled=false;page.addChild(outline);
    page.addChild(new EngineText(labels[activeIndex],5652004,14,"center",left+5,15,tabW-10,20));
    if (this.logBookmark === 0) this.renderLogEconomy(page);
    else if (this.logBookmark === 1) this.renderLogMissions(page);
    else this.renderLogReputation(page);
  }

  private renderLogEconomy(page: Sprite) {
    const c = this.gd.Caravans[0];
    const graph = new ConsProdGraph(620, 180, null, false, true,
      id => itemName(this.ds, id), id => this.text(id), t => this.gd.makeDate(t) as any, this.assets);
    graph.x = 20; graph.y = 50;
    graph.selectedPeriod = this.economyPeriod; graph.selectedItem = this.economyItem;
    graph.data = c.historicalData; graph.updatePeriod();
    this.economyGraph = graph;
    page.addChild(graph);
    const title = new EngineText(this.text(6803).toUpperCase() + ":", 5652004, 14, "left", 20, 250, 600, 20);
    page.addChild(title);
    const selectorX = title.textWidth + 30;
    const items = [...new Set(this.gd.knownPrices.map(p => p.item))];
    if (this.knownPriceItem == null || !items.includes(this.knownPriceItem)) this.knownPriceItem = items[0] ?? null;
    const frame = new Sprite(); const g = new Graphics(); g.lineStyle(1, 5652004);
    g.drawRect(10, 239, 640, 1); g.drawRect(20, 295, 620, 155); g.drawRect(selectorX, 250, 640 - selectorX, 20);
    frame.graphics = g; frame.mouseEnabled = false; page.addChild(frame);
    page.addChild(new EngineText(this.knownPriceItem == null ? "------" : itemName(this.ds, this.knownPriceItem).toUpperCase(), 5652004, 14, "center", selectorX + 30, 250, 580 - selectorX, 20));
    for (const dir of [-1, 1] as const) {
      const button = new PaperArrow(dir, 5652004, () => {
        sfxClick();
        if (!items.length) return;
        this.knownPriceItem = items[(items.indexOf(this.knownPriceItem!) + dir + items.length) % items.length]; this.renderLog();
      }, this.assets, (dir < 0 ? selectorX : 620) + 230, 285);
      button.x = dir < 0 ? selectorX : 620; button.y = 250; button.mouseEnabled = items.length > 1; button.name = dir < 0 ? "known-price-previous" : "known-price-next"; page.addChild(button);
    }
    page.addChild(new EngineText(this.text(6805).toUpperCase(), 5652004, 12, "left", 30, 280, 280, 20));
    page.addChild(new EngineText(this.text(1298).toUpperCase(), 5652004, 12, "center", 310, 280, 100, 20));
    page.addChild(new EngineText(this.text(1328).toUpperCase(), 5652004, 12, "center", 410, 280, 100, 20));
    page.addChild(new EngineText(this.text(6804).toUpperCase(), 5652004, 12, "center", 510, 280, 120, 20));
    const area = new ScrollableArea(610, 155, 610, 155, true, false, false, 10, 10, this.assets);
    area.x = 20; area.y = 295;
    this.gd.knownPrices.filter(p => p.item === this.knownPriceItem).forEach((p, i) => {
      const town = this.gd.Towns[p.town];
      const location = p.location == null ? null : town?.locations?.[p.location];
      const name = town ? town.name + (location ? " : " + this.text(location.name) : "") : this.text(949);
      const y = 10 + i * 20;
      const price = (value: number, time: number) => time >= 0 && Number.isFinite(value) ? numberFormat(value, 2) : "-";
      const days = (time: number) => time >= 0 ? String(Math.max(0, Math.round((this.gd.Time - time) / 86400))) : "-";
      area.addContent(new EngineText(name.toUpperCase(), 5652004, 14, "left", 10, y, 280, 20));
      area.addContent(new EngineText(price(p.buyPrice, p.buyTime), 5652004, 14, "center", 290, y, 100, 20));
      area.addContent(new EngineText(price(p.sellPrice, p.sellTime), 5652004, 14, "center", 390, y, 100, 20));
      area.addContent(new EngineText(days(p.buyTime) + " / " + days(p.sellTime), 5652004, 14, "center", 490, y, 120, 20));
    });
    area.updateSize(); page.addChild(area);
  }

  private renderLogMissions(page: Sprite) {
    const story = this.gd.story;
    for (const [title, x, y, width, quests] of [
      [2201, 20, 50, 620, story?.acceptedQuests ?? []],
      [2202, 20, 260, 300, story?.completedQuests ?? []],
      [2203, 340, 260, 300, story?.failedQuests ?? []],
    ] as Array<[number, number, number, number, number[]]>) {
      page.addChild(new EngineText(this.text(title).toUpperCase(), 0, 14, "center", x, y, width, 20));
      const area = new ScrollableArea(width - 10, 160, width - 10, 160, true, false, false, 10, 10, this.assets);
      area.x = x; area.y = y + 30;
      const frame = new Sprite(); const g = new Graphics(); g.lineStyle(1, 0); g.drawRect(x, y + 30, width, 160); frame.graphics = g; frame.mouseEnabled = false;
      page.addChild(frame); this.fillListWithMissions(area, quests, width - 30); page.addChild(area);
    }
  }

  private fillListWithMissions(area: ScrollableArea, ids: number[], width: number) {
    let y = 10;
    for (const id of ids) {
      const text = new EngineText(this.missionText(id), 0, 14, "left", 10, y, width, null, true, true);
      text.mouseEnabled = false;
      area.addContent(text); y += text.textHeight + 20;
    }
    area.updateSize();
  }

  private missionText(id: number): string {
    const tid = this.ds.gamedata?.missionDescriptions?.[id];
    if (!tid) return "";
    let text = getText(this.ds, tid, this.ds.language, this.gd.Caravans[0].People[0]?.gender ?? 1);
    const flags = this.gd.story?.flags ?? {};
    const townName = (n: unknown) => this.gd.Towns[Number(n)]?.name ?? "?";
    if (id === 40 || id === 43) text = text.replace(/@town1@/g, townName(flags.qgMissionTown1)).replace(/@town2@/g, townName(flags.qgMissionTown2));
    if ([41, 42, 44, 45, 46, 47].includes(id)) text = text.replace(/@townname@/g, townName(flags.qgMissionTown1));
    if (id === 44) text = text.replace(/@grams@/g, String(flags.qgMissionAmount ?? 0) + this.text(13));
    if (id === 45) text = text.replace(/@kilograms@/g, String(flags.qgMissionAmount ?? 0) + this.text(12));
    return text;
  }

  private renderLogReputation(page: Sprite) {
    const story = this.gd.story;
    const area = new ScrollableArea(610, 400, 610, 400, true, false, false, 10, 10, this.assets);
    area.x = 20; area.y = 50;
    const frame = new Sprite(); const g = new Graphics(); g.lineStyle(1, 0); g.drawRect(20, 50, 620, 400); frame.graphics = g; frame.mouseEnabled = false; page.addChild(frame);
    let y = 10;
    const line = (name: string, value?: number) => {
      area.addContent(new EngineText(name.toUpperCase() + ":" + (value == null ? "" : " " + (value > 0 ? "+" : "") + Math.round(value)), 0, 14, "center", 10, y, 600, 20)); y += 20;
    };
    for (const [id, value] of Object.entries(story?.specificReputations ?? {})) {
      const tid = this.ds.gamedata?.reputationNames?.[Number(id)];
      if (value != null && tid && (Number(id) === 6 || Number(id) === 8 || this.gd.storyMode)) line(getText(this.ds, tid, this.ds.language, this.gd.Caravans[0].People[0]?.gender), Number(value));
    }
    const relations = Object.entries(story?.characterRelations ?? {}).filter(([id, value]) => value != null && ![34, 35, 37].includes(Number(id)));
    if (this.gd.storyMode && relations.length) {
      y += 20; line(this.text(2187)); y += 10;
      for (const [id, value] of relations) line(this.text(Number(this.ds.dialogues.characterNames[id])), Number(value));
    }
    const factions = [...new Set(this.gd.revealedFactions)].filter(id => id > 0 && this.ds.presets.factionNames?.[id]).sort((a,b) => a-b);
    if (factions.length) {
      y += 20; line(this.text(2188)); y += 10;
      for (const id of factions) line(this.text(this.ds.presets.factionNames[id]), this.gd.getFactionRelations(id, 0));
    }
    area.updateSize(); page.addChild(area);
  }

  // ================= 货物页（原版 category==8，TEAM-CARAVANMENU-SPEC §2.8） =================
  private cargoSelected: number | null = null;
  private cargoCalc: { ov: Sprite; value: number; min: number; max: number; done: ((v: number) => void) | null; val: EngineText; minus: Sprite; plus: Sprite } | null = null;
  private cargoReadOv: Sprite | null = null;
  private cargoWithdrawOv: Sprite | null = null;

  // 货物页筛选状态（原版 List.as Filters：12 组全开；单击切换 / 双击 solo）
  private cargoFilters: Record<string, boolean> = {
    market: true, food: true, liquids: true, liquidscontainers: true,
    devices: true, miscellaneous: true, weapons: true, ammo: true,
    attachments: true, armor: true, firstaid: true, tools: true,
  };
  // 筛选按钮栏持久化（原版 List 构造时一次性创建；重建会丢失双击状态，故只建一次、每渲染同步位置）
  private cargoFilterBar: Sprite | null = null;
  private cargoFilterSwitches: Array<{ group: string; name: string; sw: Switch; icon: Sprite | null }> = [];

  private cargoListView: ScrollableArea | null = null;
  private renderCargo() {
    const oldScroll = this.cargoListView?.scroll ?? 0;
    this.mainArea.removeAll();
    const S = this.mainArea;
    const c = this.gd.Caravans[0];
    c.syncLiquidContainers();
    if (this.cargoCalc) { S.removeChild(this.cargoCalc.ov); this.cargoCalc = null; }
    // t57③：mainArea 偏移 (10,40)，本页含 y≥430 元素（Additional Info 区/底部按钮）→ 页内坐标 = 原版绝对 − 40
    const Y = (abs: number) => abs - 40;
    const nf = (v: number, dec = 0) => (Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec)).toLocaleString(undefined, { maximumFractionDigits: dec });
    // 选中项兜底（优先上次，否则第一个有货的）
    if (this.cargoSelected === null || c.cargoAmount(this.cargoSelected) <= 0) {
      const first = [...c.cargo.keys()].sort((a, b) => a - b)[0];
      this.cargoSelected = first !== undefined ? first : null;
    }
    const sel = this.cargoSelected;
    const selDef = sel !== null ? getItemData(this.ds, sel) : null;
    const selIt = sel !== null ? this.ds.items.Items[sel] : null;
    // !!强制布尔：selDef 无该标志时 !!selDef && flag 会得到 undefined → Button.visible 置 undefined 失效
    const isLiquid = !!(selDef && (selDef as any).liquid);
    const isLiqContainer = !!(selDef && (selDef as any).liquidsContainer);
    const isDevice = !!(selDef && (selDef as any).device);
    const isBook = !!(selDef && (selDef as any).book);
    const isMap = !!(selDef && (selDef as any).map);
    const selCat = selIt ? selIt.category : 0;

    // —— 大图 + 名称（原版 cargoPicBG@(10,12)；名称 16 号 center @(280,21) + 自适应框）——
    const picFrame = new Sprite();
    const pfg = new Graphics();
    pfg.lineStyle(1, 16777215, 0.6);
    pfg.beginFill(7368816, 0.35);
    pfg.drawRect(0, 0, 230, 230);
    picFrame.graphics = pfg;
    picFrame.x = 10; picFrame.y = Y(12);
    picFrame.mouseEnabled = false;
    S.addChild(picFrame);
    // 原版：大图区=纯 Item.picture（名称在右列顶部 cargoName）
    if (sel !== null) attachItemIcon(this.assets, this.ds, picFrame, sel, { size: 230, center: true });
    const nmTxt = sel !== null ? itemName(this.ds, sel).toUpperCase() : "";
    S.addChild(new EngineText(nmTxt, 16777215, 16, "center", 280, Y(21), 260, 22));
    const nameFrame = new Sprite();
    const nfg2 = new Graphics();
    nfg2.lineStyle(1, 16777215);
    const nw2 = Math.min(nmTxt.length * 11 + 20, 260);
    nfg2.drawRect(130 - nw2 / 2, 0, nw2, 40);
    nameFrame.graphics = nfg2;
    nameFrame.x = 280; nameFrame.y = Y(12);
    nameFrame.mouseEnabled = false;
    S.addChild(nameFrame);

    // —— 信息行（原版 L3389-3411：WPU/TW/PPU/See prices）——
    const pair = (title: string, value: string, y: number) => {
      S.addChild(new EngineText(title, 16777215, 14, "left", 280, y, 250, 20));
      S.addChild(new EngineText(value, 16777215, 14, "right", 280, y, 250, 20));
    };
    if (sel !== null) {
      const amount = c.cargoAmount(sel);
      // 设备：inUseOf 默认全开（原版 device 全在工作）；非设备：显式记录（原版 Item.inUse 默认 0）
      const inUse = isDevice ? c.inUseOf(sel) : (c.inUse[sel] ?? 0);
      const wpu = selDef?.weight ?? 1;
      pair(this.text(1190).toUpperCase(), nf(wpu, 3) + " " + this.text(12).toUpperCase(), Y(62));
      pair(this.text(1191).toUpperCase(), nf(wpu * amount, 3) + " " + this.text(12).toUpperCase(), Y(82));
      if (c.averagePrice[sel] !== undefined) {
        pair(this.text(6806).toUpperCase(), nf(c.averagePrice[sel], 2), Y(112));
      } else {
        pair(this.text(1192).toUpperCase(), nf(this.gd.globalItemPrice(sel), 2), Y(112));
      }
      const seeB = new Button(2, () => { this.knownPriceItem = sel; this.logBookmark = 0; this.setCategory(1); }, this.text(6807).toUpperCase(), this.assets);
      seeB.x = 307; seeB.y = Y(139);
      seeB.visible = this.gd.knownPrices.some((k) => k.item === sel);
      S.addChild(seeB);
      // —— 警告区（原版 L3412-3443：设备缺资源 1249 / 电超载 4591）——
      let warn = "";
      if (isDevice && (selDef as any).consumption?.length) {
        const missing = (selDef as any).consumption.some((cns: any) => c.cargoAmount(cns.item) <= 0);
        if (missing) warn = this.text(1249).toUpperCase();
      }
      if (isDevice && (selDef as any).electricityConsumption > 0) {
        const cp = c.getConsumptionProduction();
        if (cp.electricityConsumption > cp.electricityProduction) warn = this.text(4591).toUpperCase();
      }
      if (warn) {
        const wt = new EngineText(warn, 16777215, 12, "left", 280, Y(152), 250, 40, true);
        S.addChild(wt);
      }
      // —— 左信息列（原版 L3444-3449：类别名/总量/使用中/未使用/最大容量(液体)，x=10..250）——
      const leftPair = (title: string, value: string, y: number) => {
        S.addChild(new EngineText(title, 16777215, 14, "left", 10, y, 250, 20));
        S.addChild(new EngineText(value, 16777215, 14, "right", 10, y, 250, 20));
      };
      const catNameId = this.cargoCategoryNameId(selCat, selDef);
      S.addChild(new EngineText(catNameId ? this.text(catNameId).toUpperCase() : "", 16777215, 14, "center", 10, Y(272), 250, 20));
      leftPair(this.text(1236).toUpperCase(), nf(amount, 3), Y(292));
      leftPair(this.text(1195).toUpperCase(), nf(inUse, 3), Y(312));
      leftPair(this.text(1232).toUpperCase(), nf(Math.max(0, amount - inUse), 3), Y(332));
      if (isLiquid) leftPair(this.text(1239).toUpperCase(), nf(c.maxLiquidAmount(sel) + amount, 3) + this.text(11), Y(352));
      // —— Additional Info（原版 L3450-3547：getInfoPairs → 滚动区；t57③ 整体上移 40 防越界）——
      S.addChild(new EngineText(this.text(1194).toUpperCase(), 16777215, 14, "center", 280, Y(272), 260, 20));
      const infoFrame = new Sprite();
      const ifg = new Graphics();
      ifg.lineStyle(1, 16777215, 0.4);
      ifg.drawRect(0, 0, 262, 162);
      infoFrame.graphics = ifg;
      infoFrame.x = 280; infoFrame.y = Y(302);
      infoFrame.mouseEnabled = false;
      S.addChild(infoFrame);
      const infoArea = new ScrollableArea(250, 160, 250, 160, true, false, false, 10, 10, this.assets); // t92 S15 cargoInfo
      infoArea.x = 280; infoArea.y = Y(302);
      const infos = this.cargoInfoPairs(sel);
      let iy = 5;
      for (const inf of infos) {
        if (inf.value !== undefined) {
          const t = new EngineText(inf.name, 16777215, 14, "left", 5, iy, 240, 20);
          t.alpha = 0.8;
          t.mouseEnabled = false;
          const v = new EngineText(inf.value, 16777215, 14, "right", 5, iy, 240, 20);
          v.alpha = 0.8;
          v.mouseEnabled = false;
          infoArea.addContent(t);
          infoArea.addContent(v);
          iy += 20;
        } else if (inf.multiline) {
          const lines = this.breakLines(inf.name, 28);
          for (const ln of lines) {
            const t = new EngineText(ln, 16777215, 14, "left", 5, iy, 240, 20);
            t.alpha = 0.8;
            t.mouseEnabled = false;
            infoArea.addContent(t);
            iy += 20;
          }
        } else {
          const t = new EngineText(inf.name, 16777215, 14, "center", 5, iy, 240, 20);
          t.alpha = 0.8;
          t.mouseEnabled = false;
          infoArea.addContent(t);
          iy += 20;
        }
      }
      infoArea.updateSize();
      S.addChild(infoArea);
      // —— 底部按钮（原版 L3498-3544 显隐规则：x=42，y=379/409/439；t57③ 上移 40 → 屏幕 379/409/439）——
      const mkBtn = (label: string, y: number, fn: () => void, visible: boolean) => {
        const b = new Button(2, () => { fn(); }, label, this.assets);
        b.x = 42; b.y = Y(y);
        b.visible = visible;
        S.addChild(b);
      };
      const notLiq = !isLiquid && !isLiqContainer && !isDevice;
      mkBtn(this.text(1203).toUpperCase(), 379, () => this.openCargoWithdraw(sel), inUse > 0 && notLiq);
      mkBtn(this.text(1986).toUpperCase(), 379, () => this.openCargoRead(sel), isBook || isMap);
      mkBtn(this.text(1243).toUpperCase(), 379, () => this.toggleDevice(sel, amount, inUse), isDevice);
      mkBtn(this.text(1216).toUpperCase(), 379, () => this.openManageContainers(), isLiquid || isLiqContainer);
      mkBtn(this.text(1201).toUpperCase(), 409, () => this.throwAway(sel, amount, inUse), amount - inUse > 0);
      mkBtn(this.text(1202).toUpperCase(), 439, () => this.openWeightChart(sel), true);
    }
    // —— 右列表 + 12 类筛选按钮（原版 cargoList List.as L84-200：3 行 × 4 列 25×20 Switch + filtericon）——
    const listX = 550;
    const listY = Y(12);            // 列表/筛选区顶部（屏幕 y=12）
    const areaY = listY + 61;       // 内容区起点（原版 areaY = rows*20 + 1 = 61）
    // 筛选按钮栏（持久化：仅首次创建；之后每次渲染 setPosition 同步，防双击状态丢失）
    if (!this.cargoFilterBar) this.cargoFilterBar = this.buildCargoFilterBar(listX, listY);
    for (const fb of this.cargoFilterSwitches) fb.sw.setPosition(!!this.cargoFilters[fb.group]);
    S.addChild(this.cargoFilterBar);
    // 列表内容区（原版 ScrollableArea(90,389)@(0,61) 内嵌于 List；t63④：250 格样式单列 70px 格，无分类文字行）
    const list = new ScrollableArea(90, 389, 90, 389, true, false, false, 10, 10, this.assets); // t92 L10 cargoList
    list.x = listX; list.y = areaY;
    // 原版 List 过滤语义（L376-415）：Filters[组] 关闭的组不显示；条目 amount−inUse ≥ 0.05（showInUse 时 amount ≥ 0.05）
    const ids = [...c.cargo.keys()].sort((a, b) => a - b);
    let cellN = 0;
    for (const id of ids) {
      const group = this.cargoGroupOf(id);
      if (!this.cargoFilters[group]) continue; // 筛选关闭 → 该组隐藏（原版 Filters[组]；分类只体现在顶部筛选钮）
      const amount = c.cargoAmount(id);
      if (amount < 0.05) continue;
      const it = this.ds.items.Items[id];
      const def = getItemData(this.ds, id);
      const isDev = !!(def && (def as any).device);
      const inUse = isDev ? c.inUseOf(id) : (c.inUse[id] ?? 0);
      // showInUse=true：inUse>0 显示总量，否则显示 amount−inUse
      const shown = inUse > 0 ? amount : Math.max(0, amount - inUse);
      const cell = this.makeGridCell(id, shown, it ? it.category : 0, id === sel, () => { sfxClick(); this.cargoSelected = id; this.renderCargo(); });
      cell.x = 10; // List.as：pic.x = 10
      cell.y = 10 + cellN * 80; // List.as：pic.y=10+i*(listSize−20)
      (cell as any).height = 80;
      list.addContent(cell);
      cellN++;
    }
    if (cellN === 0) list.addContent(new EngineText("—", 6710886, 14, "center", 10, 10, 70, 20));
    list.updateSize();
    list.scroll = oldScroll;
    this.cargoListView = list;
    S.addChild(list);
  }

  // 构造持久化筛选按钮栏（原版 List 过滤器区：areaBG + 12 Switch(3) 25×20 + filtericon）
  private buildCargoFilterBar(listX: number, listY: number): Sprite {
    const bar = new Sprite();
    bar.mouseEnabled = false; // 容器不拦截；子 Switch 各自命中
    this.cargoFilterSwitches = [];
    // 筛选区底（原版 List areaBG 4208688 alpha 0.7）
    const filterBG = new Sprite();
    const fbg = new Graphics();
    fbg.beginFill(4208688, 0.7);
    fbg.drawRect(0, 0, 100, 60);
    fbg.lineStyle(1, 16777215, 0.3);
    fbg.moveTo(0, 60); fbg.lineTo(100, 60);
    filterBG.graphics = fbg;
    filterBG.x = listX; filterBG.y = listY;
    filterBG.mouseEnabled = false;
    bar.addChild(filterBG);
    // 12 个筛选按钮（原版顺序：market/food/liquids/liquidscontainers/devices/miscellaneous/weapons/ammo/attachments/armor/firstaid/tools）
    const filterGroups = ["market", "food", "liquids", "liquidscontainers", "devices", "miscellaneous", "weapons", "ammo", "attachments", "armor", "firstaid", "tools"];
    filterGroups.forEach((group, idx) => {
      const col = idx % 4, row = Math.floor(idx / 4);
      const sw = new Switch(3, !!this.cargoFilters[group],
        () => this.toggleCargoFilter(group, true), () => this.toggleCargoFilter(group, false),
        null, null, 25, 20, false, this.assets,
        () => this.soloCargoFilter(group));
      sw.x = listX + col * 25;
      sw.y = listY + row * 20;
      const name = group === "tools" ? "mechanicalshop" : group === "liquids" ? "water" : group;
      const icon = this.cargoFilterIcon(group);
      if (icon) {
        (icon as any).__filterIcon = true;
        icon.scaleX = icon.scaleY = 0.4;
        icon.alpha = 0.3;
        icon.mouseEnabled = false;
        const bmp = icon.children.find((ch) => ch instanceof BitmapObject) as BitmapObject | undefined;
        const iw = bmp ? bmp.width : 30, ih = bmp ? bmp.height : 30;
        icon.x = (25 - iw * 0.4) / 2;
        icon.y = (20 - ih * 0.4) / 2;
        sw.addChild(icon);
      }
      bar.addChild(sw);
      this.cargoFilterSwitches.push({ group, name, sw, icon });
      // t70 反馈5：filtericon 首次渲染可能尚未加载（getImage 异步返回 null）→ 加载完成后自动替换为真图标
      this.assets.ensure("filtericon" + name + ".png").then((img) => {
        if (!img || !sw.parent) return; // 无此素材或栏已重建 → 保持现状（fallback 图标）
        const old = sw.children.find((c) => (c as any).__filterIcon);
        if (old) sw.removeChild(old);
        const s = new Sprite();
        const b = new BitmapObject(img);
        b.mouseEnabled = false;
        s.addChild(b);
        (s as any).__filterIcon = true;
        s.scaleX = s.scaleY = 0.4;
        s.alpha = 0.3;
        s.mouseEnabled = false;
        s.x = (25 - b.width * 0.4) / 2;
        s.y = (20 - b.height * 0.4) / 2;
        sw.addChild(s);
        const entry = this.cargoFilterSwitches.find((en) => en.sw === sw);
        if (entry) entry.icon = s;
      });
    });
    return bar;
  }
  // 筛选切换（原版 List.as switchFilter L282-297：Filters[组] = !Filters[组]）
  private toggleCargoFilter(group: string, on: boolean) {
    this.cargoFilters[group] = on;
    this.renderCargo();
  }
  // 双击 solo（原版 doubleClickFilter L299-311：只显示该组）
  private soloCargoFilter(group: string) {
    for (const k of Object.keys(this.cargoFilters)) this.cargoFilters[k] = k === group;
    this.renderCargo();
  }
  // 筛选按钮图标（原版 filtericon{组名}，tools→filtericonmechanicalshop；manifest 缺失组用代表性物品小图标）
  private cargoFilterIcon(group: string): Sprite | null {
    const name = group === "tools" ? "mechanicalshop" : group === "liquids" ? "water" : group;
    const img = this.assets.getImage("filtericon" + name + ".png");
    if (img) {
      const s = new Sprite();
      const b = new BitmapObject(img);
      b.mouseEnabled = false;
      s.addChild(b);
      return s;
    }
    const id = this.firstItemIdOfGroup(group);
    if (id !== null) return attachItemIcon(this.assets, this.ds, new Sprite(), id, { size: 20 });
    return null;
  }
  // 组内第一个物品 id（先货舱后数据表）
  private firstItemIdOfGroup(group: string): number | null {
    const c = this.gd.Caravans[0];
    const inCargo = [...c.cargo.keys()].sort((a, b) => a - b).find((id) => this.cargoGroupOf(id) === group);
    if (inCargo !== undefined) return inCargo;
    const items = this.ds.items.Items;
    for (let id = 1; id < items.length; id++) { // 跳过 0 号伪条目
      if (items[id] && this.cargoGroupOf(id) === group) return id;
    }
    return null;
  }
  // 类别显示名（原版 updateCargo L3498-3544：武器/弹药/装具/护具/食物/液体/液体瓶/设备/其它/包扎）
  private cargoCategoryNameId(cat: number, def: any): number {
    if (cat === 2) return 194;
    if (cat === 4) return 298;
    if (cat === 5) return 1072;
    if (cat === 3) return 926;
    if (cat === 1) {
      if (def?.firstAidKit) return 197;
      if (def?.food) return 15;
      if (def?.liquid) return 1197;
      if (def?.liquidsContainer) return 1198;
      if (def?.device) return 1199;
      return 1200;
    }
    return 0;
  }
  // 列表分组（原版 List.as L376-415，本项目类别映射：2武器/4弹药/3护甲/5附件）
  private cargoGroupOf(id: number): string {
    return itemGroupOf(this.ds, id);
  }
  // 原版 Item.getInfoPairs（本项目类别映射 2武器/3弹药/4附件/5护甲）
  private cargoInfoPairs(id: number): Array<{ name: string; value?: string; multiline?: boolean }> {
    const c = this.gd.Caravans[0];
    const it = this.ds.items.Items[id];
    const def: any = getItemData(this.ds, id);
    const cat = it ? it.category : 0;
    const W = this.ds.weapons;
    const out: Array<{ name: string; value?: string; multiline?: boolean }> = [];
    const push = (name: string, value?: string, multiline = false) => out.push({ name, value, multiline });
    push(itemName(this.ds, id).toUpperCase());
    if (cat === 1) {
      const g = def;
      if (g?.firstAidKit) {
        push(this.text(197).toUpperCase());
        if (g.heal !== undefined) push(this.text(1018).toUpperCase(), String(g.heal));
      }
      if (g?.food) {
        push(this.text(15).toUpperCase());
        push(this.text(1196).toUpperCase(), String(Math.round((g.calories ?? 0) / 10)));
        push(this.text(1247).toUpperCase(), String(Math.round((g.waterPercentage ?? 0) * 100)) + "%");
        if (g.taste !== undefined) push(this.text(3769).toUpperCase(), (g.taste > 0 ? "+" : "") + g.taste);
      }
      if (g?.liquidsContainer) {
        push(this.text(1198).toUpperCase());
        push(this.text(1219).toUpperCase(), Math.round((g.volume ?? 0) * 1000) / 1000 + this.text(11));
      }
      if (g?.device) {
        push(this.text(1199).toUpperCase());
        const inUse = c.inUseOf(id);
        if ((g.consumption?.length) || (g.electricityConsumption ?? 0) > 0) {
          push(this.text(1242).toUpperCase());
          push("(" + this.text(1240).toUpperCase() + ")");
          for (const cns of g.consumption ?? []) {
            const per = Math.round(cns.amount * inUse * 1000) / 1000 + "/";
            push(itemName(this.ds, cns.item).toUpperCase(), per + Math.round(cns.amount * 1000) / 1000);
          }
          if ((g.electricityConsumption ?? 0) > 0) {
            push(this.text(19).toUpperCase(), (g.electricityConsumption * inUse) + "/" + g.electricityConsumption + this.text(940));
          }
        }
        if ((g.production?.length) || (g.electricityProduction ?? 0) > 0) {
          push(this.text(1241).toUpperCase());
          push("(" + this.text(1240).toUpperCase() + ")");
          for (const p of g.production ?? []) {
            const per = Math.round(p.amount * inUse * 1000) / 1000 + "/";
            push(itemName(this.ds, p.item).toUpperCase(), per + Math.round(p.amount * 1000) / 1000);
          }
          if ((g.electricityProduction ?? 0) > 0) {
            push(this.text(19).toUpperCase(), (g.electricityProduction * inUse) + "/" + g.electricityProduction + this.text(940));
          }
        }
      }
      if (g?.sightAmplifier) push(this.text(937).toUpperCase(), Math.round((g.amplification ?? 0) * 100) + " %");
    } else if (cat === 2) {
      const wt = W?.WeaponTypes?.[def?.type];
      const wtc = wt?.category;
      push(wt?.name ? this.text(wt.name).toUpperCase() : this.text(194).toUpperCase());
      if (wtc === 2 || wtc === 3 || wtc === 4) {
        const cal = W?.Calibers?.[def?.ammo];
        push(this.text(298).toUpperCase(), cal?.name ? this.text(cal.name).toUpperCase() : "");
        push(this.text(299).toUpperCase(), String(def?.ammoCapacity ?? 0));
        push(this.text(300).toUpperCase(), String(def?.accuracy ?? 0));
      }
      if (wtc === 2) push(this.text(301).toUpperCase(), String(Math.round(((def?.muzzleVelocityChange ?? 0) + 1) * 100)));
      if (wtc === 3) push(this.text(302).toUpperCase(), String(def?.arrowSpeed ?? 0));
      if (wtc === 1) {
        push(this.text(303).toUpperCase(), String(def?.baseDamage ?? 0));
        push(this.text(304).toUpperCase(), String(def?.armorNeutralization ?? 0));
        push(this.text(305).toUpperCase(), String(Math.round((def?.openWoundCoeficient ?? 0) * 1000)));
      }
      if (wtc === 5) {
        push(this.text(306).toUpperCase(), String(def?.explosiveness ?? 0));
        push(this.text(307).toUpperCase(), String(def?.antiPersonnel ?? 0));
      }
      if (wt?.modes?.length) {
        push(this.text(1005).toUpperCase() + ":");
        for (const m of wt.modes) {
          const mn = m.name ? this.text(m.name).toUpperCase() : "?";
          push(mn, (m.AP ?? 0) + " " + this.text(1095).toUpperCase());
        }
      }
      if ((wt?.reloadAP ?? 0) > 0) push(this.text(195).toUpperCase(), wt.reloadAP + " " + this.text(1095).toUpperCase());
    } else if (cat === 3) {
      push(this.text(298).toUpperCase());
      const cal = W?.Calibers?.[def?.type];
      const bulletD = cal?.bulletDiameter;
      const isArrow = cal?.arrow;
      if (!def?.flamethrower && !def?.explosive) {
        let ke = 0;
        if (isArrow) ke = (def?.projectileMass ?? 0) * Math.pow(50, 2) / 2000;
        else ke = (def?.projectileMass ?? 0) * Math.pow((def?.muzzleVelocity ?? 0) * 0.7, 2) / 2000;
        let dmg = (1 - 1 / (1 + Math.exp(0.03 * ke - 3))) * Math.pow(ke, 0.125) * (0.5 + ke / 2000 * Math.exp(-ke / 2000) / 2) * (bulletD ?? 1) * (def?.softTargetDamage ?? 1) * 2;
        if ((def?.pallets ?? 0) > 0) dmg *= def.pallets;
        push(this.text(1012).toUpperCase(), String(Math.round(dmg)));
      }
      if ((def?.explosiveness ?? 0) > 0) push(this.text(306).toUpperCase(), String(def.explosiveness));
      if ((def?.antiPersonnel ?? 0) > 0) push(this.text(307).toUpperCase(), String(def.antiPersonnel));
      if ((def?.projectileMass ?? 0) > 0) push(this.text(1006).toUpperCase(), String(def.projectileMass));
      if ((def?.muzzleVelocity ?? 0) > 0) push(this.text(301).toUpperCase(), String(def.muzzleVelocity));
      if (def?.armorPiercing !== undefined) push(this.text(1007).toUpperCase(), String(def.armorPiercing));
      if (def?.softTargetDamage !== undefined) push(this.text(1008).toUpperCase(), String(def.softTargetDamage));
      if ((def?.FF ?? 0) > 0) push(this.text(1011).toUpperCase(), String(def.FF));
      if (def?.pallets !== undefined) push(this.text(1009).toUpperCase(), String(def.pallets));
      if (def?.bulletDiameter !== undefined) push(this.text(1010).toUpperCase(), String(def.bulletDiameter));
      else if (bulletD !== undefined) push(this.text(1013).toUpperCase(), String(bulletD));
    } else if (cat === 4) {
      push(this.text(1072).toUpperCase());
      let valid = "";
      const amap: Record<string, number> = { rifle: 973, crossbow: 971, pistol: 972, machinegun: 974, smg: 975, shotgun: 986, rocketLauncher: 976, flamethrower: 977 };
      const apps = def?.applicable ?? [];
      for (let i = 0; i < apps.length; i++) {
        valid += (amap[apps[i]] ? this.text(amap[apps[i]]).toUpperCase() : String(apps[i]));
        if (i < apps.length - 1) valid += ", ";
      }
      if (valid) push(this.text(1001).toUpperCase(), valid);
      if (def?.affectAccuracy !== undefined) push(this.text(1016).toUpperCase(), String(def.affectAccuracy));
      if (def?.affectAP !== undefined) push(this.text(1017).toUpperCase(), String(0 - def.affectAP));
    } else if (cat === 5) {
      push((def?.type === 1 ? this.text(1002) : this.text(1003)).toUpperCase());
      push(this.text(1004).toUpperCase(), String(def?.armor ?? 0));
      push(this.text(1014).toUpperCase(), String(def?.fireResistance ?? 0));
      push(this.text(1015).toUpperCase(), String(def?.explosionResistance ?? 0));
    }
    if (cat === 1 || cat === 2) {
      const imp = [def?.doctorImprove, def?.veterinaryImprove, def?.mechanicImprove, def?.huntingImprove, def?.collectingImprove];
      if (imp.some((v) => typeof v === "number")) push(this.text(4241).toUpperCase() + ":");
      if (typeof def?.doctorImprove === "number") push(this.text(932).toUpperCase(), String(Math.round(def.doctorImprove * 100)));
      if (typeof def?.veterinaryImprove === "number") push(this.text(933).toUpperCase(), String(Math.round(def.veterinaryImprove * 100)));
      if (typeof def?.mechanicImprove === "number") push(this.text(934).toUpperCase(), String(Math.round(def.mechanicImprove * 100)));
      if (typeof def?.huntingImprove === "number") push(this.text(935).toUpperCase(), String(Math.round(def.huntingImprove * 100)));
      if (typeof def?.collectingImprove === "number") push(this.text(936).toUpperCase(), String(Math.round(def.collectingImprove * 100)));
    }
    if ((def?.batteries ?? 0) > 0) push(this.text(6823).toUpperCase(), String(def.batteries));
    if (typeof def?.description === "number") push(this.text(def.description), undefined, true);
    return out;
  }
  private breakLines(text: string, max: number): string[] {
    const out: string[] = [];
    let cur = "";
    for (const ch of text) {
      cur += ch;
      if (cur.length >= max) { out.push(cur); cur = ""; }
    }
    if (cur) out.push(cur);
    return out;
  }
  // Throw Away（原版 cargoThrowAway L3877：量≤1 直接确认，否则计算器）
  private throwAway(id: number, amount: number, inUse: number) {
    const c = this.gd.Caravans[0];
    const avail = Math.max(0, amount - inUse);
    const def = getItemData(this.ds, id);
    const divisible = !!(def as any)?.divisible;
    const doThrow = (n: number) => {
      const txt = this.text(1213).replace("@itemname@", itemName(this.ds, id)).replace("@number@", String(Math.round(n * 10) / 10)).toUpperCase();
      if (!this.crewConfirm) {
        this.crewConfirm = new YesNoDialogue(this.ds, this.assets, false);
        this.screen.addChild(this.crewConfirm);
        this.crewConfirm.visible = false;
      }
      this.crewConfirm.show(txt, () => {
        c.removeCargo(id, n);
        if (c.cargoAmount(id) <= 0 && this.cargoSelected === id) this.cargoSelected = null;
        this.renderCargo();
      });
    };
    if (avail <= 1) doThrow(Math.max(0, avail));
    else this.openCargoCalc(divisible ? 0.1 : 1, avail, this.text(1212).toUpperCase(), doThrow);
  }
  // 开关设备（原版 cargoSwitchOnOff L4184：单台翻转 / 多台计算器）
  private toggleDevice(id: number, amount: number, inUse: number) {
    const c = this.gd.Caravans[0];
    if (amount <= 1) {
      const nv = inUse > 0 ? 0 : 1;
      c.inUse[id] = nv;
      this.renderCargo();
    } else {
      this.openCargoCalc(0, amount, this.text(1244).toUpperCase(), (v) => {
        c.inUse[id] = v;
        this.renderCargo();
      }, inUse);
    }
  }
  private quantityCalc: CalculatorPanel | null = null;
  private openQuantity(min: number, max: number, title: string, done:(v:number)=>void, initial=min) {
    this.quantityCalc ??= new CalculatorPanel(this.assets,id=>this.text(id));
    this.quantityCalc.open(this.screen,min,max,done,undefined,title);
    this.quantityCalc.setValue(initial);
  }
  // 可分货物按原版换算成克，用整数数码管输入，确认后还原公斤。
  private openCargoCalc(min: number, max: number, title: string, done: (v: number) => void, initial=min) {
    const scale=min>0&&min<1?1000:1;
    this.openQuantity(Math.ceil(min*scale),Math.floor(max*scale),title+(scale===1000?" ("+this.text(13)+")":""),v=>done(v/scale),Math.round(initial*scale));
  }
  // Read（原版 cargoRead L4125：地图发现城镇 / 书阅读对话框）
  private openCargoRead(id: number) {
    const c = this.gd.Caravans[0];
    const def = getItemData(this.ds, id);
    const gd = this.gd;
    if ((def as any)?.map) {
      const newOnes: string[] = [];
      for (const t of (def as any).towns ?? []) {
        const town = gd.Towns[t];
        if (town) {
          if (!town.discovered) newOnes.push(town.name || "?");
          town.discovered = true;
        }
      }
      const msg = newOnes.length ? this.text(4220).toUpperCase() + ": " + newOnes.join(", ").toUpperCase() : this.text(4221).toUpperCase();
      if (!this.cargoMapMessage) {
        this.cargoMapMessage = new YesNoDialogue(this.ds, this.assets, true);
        this.screen.addChild(this.cargoMapMessage);
        this.cargoMapMessage.visible = false;
      }
      this.cargoMapMessage.show(msg);
    } else if ((def as any)?.book) {
      const flag: Record<number,string> = {105:"readSpencerism",106:"readFafnirsCase",107:"readCalvinsLetter"};
      if(flag[id] && gd.story) gd.story.flags[flag[id]]=true;
      if (!this.cargoReadOv) {
        const ov = new Sprite();
        const bg = new Graphics();
        bg.beginFill(0, 0.5);
        bg.drawRect(0, 0, 880, 495);
        bg.hitRect(0, 0, 880, 495);
        ov.graphics = bg;
        addDialogueBackground(ov, this.assets, 140, 23, 600, 450, 0, undefined, false);
        const paper = new ClipSprite(560, 360); paper.x = 160; paper.y = 63; paper.mouseEnabled = false; ov.addChild(paper);
        const putPaper = (im: HTMLImageElement | null) => { if (im) { const b = new BitmapObject(im); b.mouseEnabled = false; paper.addChild(b); } };
        const image = this.assets.getImage("TownBG.jpg"); if (image) putPaper(image); else void this.assets.ensure("TownBG.jpg").then(putPaper);
        this.cargoReadOv = ov;
        this.screen.addChild(ov);
      }
      const ov = this.cargoReadOv;
      const kids = [...ov.children];
      for (const k of kids) { if ((k as any).__rd) ov.removeChild(k); }
      (ov.addChild(new EngineText(itemName(this.ds, id).toUpperCase(), 16777215, 18, "center", 150, 31, 580, 30)) as any).__rd = true;
      const area = new ScrollableArea(550, 360, 550, 360, true, false, false, 3, 10, this.assets);
      area.x = 160; area.y = 63;
      (area as any).__rd = true;
      let yy = 10;
      for (const t of (def as any).texts ?? []) {
        const txt = this.text(t.text ?? 0);
        const paragraph = new EngineText(txt, 2103312, 14, t.align ?? "left", 10, yy, 530, null, true, true);
        area.addContent(paragraph);
        yy += paragraph.textHeight + 20;
      }
      area.updateSize();
      ov.addChild(area);
      const close = new Button(2, () => { if (this.cargoReadOv) this.cargoReadOv.visible = false; }, this.text(902).toUpperCase(), this.assets);
      close.x = 337; close.y = 435;
      (close as any).__rd = true;
      ov.addChild(close);
      this.cargoReadOv.visible = true;
    }
  }
  // Character.unequip: release inventory AND its equipped slot references; cargo totals stay intact.
  private withdrawFromPerson(p: Character, id: number, amount: number) {
    if (p.category !== 1 && p.category !== 2) return;
    const c = this.gd.Caravans[0], item = this.ds.items.Items[id];
    const n = Math.min(Math.max(0, amount), p.equipment.find(e => e.type === id)?.amount ?? 0);
    if (!item || n <= 0) return;
    p.reduceItemFromEquipment(id, n, false, false);
    c.inUse[id] = Math.max(0, (c.inUse[id] ?? 0) - n);
    let left = n;
    if (item.category === 2) {
      for (let i=0; i<2 && left>0; i++) if (p.weapons[i] === item.subCategory) {
        if (this.isGrenadeSub(item.subCategory)) {
          const removed = Math.min(left,p.grenadeAmounts[i]??0); p.grenadeAmounts[i]-=removed; left-=removed;
          if (p.grenadeAmounts[i] <= 0) p.weapons[i]=0;
        } else { p.weapons[i]=0; left--; }
      }
      p.checkAttachmentsCompatibility();
    } else if (item.category === 3) {
      for(let i=0;i<2;i++) this.eqUpdateSelectedAmmo(i,p);
    } else if (item.category === 4) {
      for(const attachments of p.attachments) for(let i=0;i<attachments.length&&left>0;i++) if(attachments[i]===item.subCategory){attachments[i]=null;left--;}
    } else if (item.category === 5) {
      const armor = getItemData(this.ds,id); if(armor?.type===1)p.Jacket=0;else if(armor?.type===2)p.Headgear=0;
    }
  }
  // CaravanMenu.as 2726–2768 / 4213–4365: individual, partial and confirmed global withdrawal.
  private openCargoWithdraw(id: number) {
    const c=this.gd.Caravans[0];
    if(this.cargoWithdrawOv)this.screen.removeChild(this.cargoWithdrawOv);
    const ov=new Sprite(),bg=new Graphics();bg.beginFill(0,.5);bg.drawRect(0,0,880,495);bg.hitRect(0,0,880,495);ov.graphics=bg;
    this.cargoWithdrawOv=ov;this.screen.addChild(ov);addDialogueBackground(ov,this.assets,205,63,470,370,.2,undefined,false);
    const owners=c.People.map(p=>({p,amount:p.equipment.find(e=>e.type===id)?.amount??0})).filter(o=>o.amount>0);
    const list=new ScrollableArea(440,270,440,270,true,false,false,3,10,this.assets);list.x=215;list.y=73;ov.addChild(list);
    owners.forEach(({p,amount},i)=>{
      const row=new Sprite();row.y=i*70;this.fleetPortrait(row,p,10,10,50);this.fleetText(row,p.name.toUpperCase(),70,10,210,"center");this.fleetText(row,this.text(1195)+": "+numberFormat(amount,3,true),70,40,210,"center");
      if(p.category===1||p.category===2){
        this.fleetButton(row,1233,287,7,()=>this.openQuantity(1,amount,this.text(1215),n=>{this.withdrawFromPerson(p,id,n);this.openCargoWithdraw(id);}),6);
        this.fleetButton(row,1230,287,37,()=>{this.withdrawFromPerson(p,id,amount);this.openCargoWithdraw(id);},6);
      }else this.fleetText(row,this.text(2215),287,10,140,"center",12);
      const g=new Graphics();g.lineStyle(1,0xffffff,.3);g.moveTo(0,69);g.lineTo(440,69);row.graphics=g;list.addContent(row);
    });list.updateSize();
    this.fleetText(ov,itemName(this.ds,id).toUpperCase(),215,348,450,"center");this.fleetText(ov,this.text(1195)+": "+numberFormat(c.inUse[id]??0,3,true),215,368,450,"center");
    const close=()=>{if(this.cargoWithdrawOv)this.screen.removeChild(this.cargoWithdrawOv);this.cargoWithdrawOv=null;this.renderCargo();};
    this.fleetButton(ov,1229,237,400,close,2);
    this.fleetButton(ov,1230,447,400,()=>this.fleetDlg(this.text(1234),()=>{for(const o of owners)this.withdrawFromPerson(o.p,id,o.amount);close();}),2);
  }

  private renderQuests() {
    const story = this.gd.story;
    const descs: any[] = this.ds.gamedata?.missionDescriptions ?? [];
    const lines: string[] = [];
    lines.push(this.text(4171) + " — " + (story ? Object.keys(story.questLog).length : 0));
    lines.push("");
    if (story) {
      for (const [qid, status] of Object.entries(story.questLog)) {
        const name = descs[Number(qid)] ? this.text(Number(descs[Number(qid)])) : "Quest " + qid;
        lines.push((status === "active" ? "▶ " : status === "done" ? "✔ " : "✘ ") + name + "  [" + status + "]");
      }
    }
    if (lines.length <= 2) lines.push(this.text(1210) + "（无任务）");
    this.mainArea.addChild(new EngineText(lines.join("\n"), 16777215, 14, "left", 20, 20, 620, 380, true));
  }

  private renderSave() {
    this.mainArea.addChild(new EngineText(this.text(1498).toUpperCase(), 16777215, 16, "center", 0, 100, 640, 24));
    const b = new Button(2, () => { this.hooks.onSave(); }, "SAVE GAME", this.assets);
    b.x = 230; b.y = 160;
    this.mainArea.addChild(b);
  }

  // 配给页（原版 CaravanMenu.as L1832-2200 1:1：组选择器 3×2 / 统计 / sameAsAnother / 食物配给 / 水配给 / 药品剂量 4 级）
  private rationsGroup = 1; // 1-based（原版 groupsSelected 0-based + 1）
  private renderRations() {
    // t57②：开头清空——本页按钮点击后会再次调用本函数，不清空会叠加（按钮重叠根因）
    this.mainArea.removeAll();
    const c = this.gd.Caravans[0];
    const S = this.mainArea;
    if (!c.groupSettingsAll) c.initGroupSettings(this.ds);
    const all = c.groupSettingsAll as any[];
    const g = this.rationsGroup; // 1..6
    const gs = all[g] ?? all[1];
    // mainArea 偏移 (10,40)：页内坐标 = 原版 880×495 绝对坐标 − 40 → 屏幕坐标与原版一致
    const Y = (abs: number) => abs - 40;
    const nf = (v: number) => Math.round(v).toLocaleString();
    const same = !!(gs && gs.sameAsAnother > 0);

    // —— 组选择器（原版 L1832-1872：3 列 × 2 行，素材 CaravanMenuCategoryButton.png）——
    for (let i = 0; i < 6; i++) {
      const gi = i + 1;
      const b = new Sprite();
      const bi = this.assets.getImage("CaravanMenuCategoryButton.png");
      if (bi) { const im = new BitmapObject(bi); im.mouseEnabled = false; b.addChild(im); }
      void this.assets.ensure("CaravanMenuCategoryButton.png").then((im) => {
        if (im && b.numChildren() === 0) { const nb = new BitmapObject(im); nb.mouseEnabled = false; b.addChild(nb); }
      });
      b.x = (i % 3) * 220 + 7;
      b.y = Y(9 + Math.floor(i / 3) * 40);
      const hg = new Graphics();
      hg.hitRect(0, 0, 204, 34); // 素材 204×34
      b.graphics = hg;
      b.buttonMode = true;
      b.addEventListener("click", () => { sfxClick(); this.rationsGroup = gi; this.renderRations(); });
      S.addChild(b);
      const sh = new Sprite();
      const shImg = this.assets.getImage("CaravanMenuCategoryButtonShine.png");
      if (shImg) { const si = new BitmapObject(shImg); si.mouseEnabled = false; sh.addChild(si); }
      void this.assets.ensure("CaravanMenuCategoryButtonShine.png").then((im) => {
        if (im && sh.numChildren() === 0) { const si = new BitmapObject(im); si.mouseEnabled = false; sh.addChild(si); }
      });
      sh.x = (i % 3) * 220 - 18;
      sh.y = Y(Math.floor(i / 3) * 40 - 13);
      sh.visible = gi === g;
      sh.mouseEnabled = false;
      S.addChild(sh);
      // 组名（原版 3683376 深灰 14 号 center）
      const nm = new EngineText(this.rationsGroupName(gi).toUpperCase(), 3683376, 14, "center", (i % 3) * 220 + 20, Y(17 + Math.floor(i / 3) * 40), 180, 20);
      nm.mouseEnabled = false;
      S.addChild(nm);
    }
    // 分隔线（原版 y=93 白 0.3 / y=92 黑 0.6）
    const gl = new Sprite();
    const glg = new Graphics();
    glg.lineStyle(1, 16777215, 0.3);
    glg.moveTo(0, Y(93)); glg.lineTo(659, Y(93));
    glg.lineStyle(1, 0, 0.6);
    glg.moveTo(1, Y(92)); glg.lineTo(660, Y(92));
    gl.graphics = glg;
    gl.mouseEnabled = false;
    S.addChild(gl);

    // —— 统计行（原版 L1876-1880：1131 组人数 left / 910 士气 right，@(10,102) w640；空组士气→193 n/a）——
    const people = this.rationsGroupPeople(c, g);
    const mor = people.length > 0 ? Math.round(people.reduce((s, p) => s + ((p as any).morale ?? 0), 0) / people.length) : this.text(193).toUpperCase();
    const ppl = new EngineText(this.text(1131).toUpperCase() + ": " + people.length, 16777215, 14, "left", 10, Y(102), 640, 20);
    const morT = new EngineText(this.text(910).toUpperCase() + ": " + mor, 16777215, 14, "right", 10, Y(102), 640, 20);
    ppl.mouseEnabled = false; morT.mouseEnabled = false;
    S.addChild(ppl); S.addChild(morT);

    // —— 同组复制 sameAsAnother（原版 L1882-1930）——
    const saText = new EngineText(this.text(1132).toUpperCase(), 16777215, 14, "left", 10, Y(132), 640, 20);
    const saSwitch = new Switch(1, !!same, () => this.toggleSameAsOther(), () => this.toggleSameAsOther(), null, null, 25, 25, false, this.assets);
    saSwitch.scaleX = saSwitch.scaleY = 0.75;
    saSwitch.y = Y(122);
    saSwitch.x = 325 - saText.textWidth / 2 - 15;
    saText.x = 325 - saText.textWidth / 2 + 15;
    saText.mouseEnabled = false;
    S.addChild(saText);
    S.addChild(saSwitch);
    // 目标组名框（凹框 + 黑底 0.2 @(230,172)）+ ◀▶ 箭头
    const targetFrame = new Sprite();
    this.concaveFrame(targetFrame, 0, 0, 200, 20);
    targetFrame.x = 230; targetFrame.y = Y(172);
    targetFrame.visible = same;
    S.addChild(targetFrame);
    const targetName = new EngineText(same ? this.rationsGroupName(gs.anotherGroup ?? 1).toUpperCase() : "", 16777215, 14, "center", 230, Y(172), 200, 20);
    targetName.visible = same;
    targetName.mouseEnabled = false;
    S.addChild(targetName);
    const prevBtn = this.arrowBtn(-1, () => this.cycleSameAsOther(-1));
    prevBtn.x = 205; prevBtn.y = Y(170); prevBtn.visible = same;
    S.addChild(prevBtn);
    const nextBtn = this.arrowBtn(1, () => this.cycleSameAsOther(1));
    nextBtn.x = 430; nextBtn.y = Y(170); nextBtn.visible = same;
    S.addChild(nextBtn);
    // 消费预览 3 行（原版 L1907-1912 @(10,212/242/272) center w640；用当前组人的 category 过滤）
    const cf = this.rationsConsumptionFilter(g);
    const prevFood = new EngineText(this.text(1135).toUpperCase() + ": " + nf(c.totalFoodConsumptionFiltered(cf)) + " " + this.text(939) + "/" + this.text(941).toUpperCase(), 16777215, 14, "center", 10, Y(212), 640, 20);
    const prevWater = new EngineText(this.text(1137).toUpperCase() + ": " + Math.round(c.totalWaterConsumptionFiltered(cf) * 10) / 10 + " " + this.text(11) + "/" + this.text(941).toUpperCase(), 16777215, 14, "center", 10, Y(242), 640, 20);
    const prevMed = new EngineText(this.text(1139).toUpperCase() + ": " + Math.round(c.totalMedicineConsumption(cf)) + " " + this.text(13) + "/" + this.text(941).toUpperCase(), 16777215, 14, "center", 10, Y(272), 640, 20);
    for (const t of [prevFood, prevWater, prevMed]) { t.visible = same; t.mouseEnabled = false; S.addChild(t); }

    // —— 设置区框架 groupsFrame（原版 L1913-1948，仅 !sameAsAnother 显示）——
    const frame = new Sprite();
    const fg = new Graphics();
    fg.lineStyle(1, 16777215, 0.3);
    fg.moveTo(0, Y(163)); fg.lineTo(659, Y(163));
    fg.moveTo(331, Y(163)); fg.lineTo(331, Y(471));
    fg.moveTo(331, Y(233)); fg.lineTo(659, Y(233));
    fg.moveTo(11, Y(233)); fg.lineTo(319, Y(233));
    fg.moveTo(136, Y(233)); fg.lineTo(136, Y(251));
    fg.moveTo(186, Y(233)); fg.lineTo(186, Y(251));
    fg.moveTo(236, Y(233)); fg.lineTo(236, Y(251));
    fg.moveTo(11, Y(232)); fg.lineTo(11, Y(251));
    fg.lineStyle(1, 0, 0.6);
    fg.moveTo(1, Y(162)); fg.lineTo(660, Y(162));
    fg.moveTo(330, Y(162)); fg.lineTo(330, Y(471));
    fg.moveTo(330, Y(232)); fg.lineTo(660, Y(232));
    fg.moveTo(10, Y(251)); fg.lineTo(319, Y(251));
    fg.moveTo(135, Y(233)); fg.lineTo(135, Y(251));
    fg.moveTo(185, Y(232)); fg.lineTo(185, Y(251));
    fg.moveTo(235, Y(233)); fg.lineTo(235, Y(251));
    fg.moveTo(319, Y(233)); fg.lineTo(319, Y(251));
    frame.graphics = fg;
    frame.visible = !same;
    frame.mouseEnabled = false;
    S.addChild(frame);

    // ================= 左列：食物配给 + 食物偏好（原版 L1949-2024） =================
    // 1133 标题（动态 x=165−min(tw,w)/2−55）+ 凹框 51×20 + −/+
    const frTitle = new EngineText(this.text(1133).toUpperCase() + ":", 16777215, 14, "left", 10, Y(172), 200, 20);
    frTitle.visible = !same;
    S.addChild(frTitle);
    const frFrame = new Sprite();
    this.concaveFrame(frFrame, 0, 0, 51, 20);
    frFrame.y = Y(172);
    frFrame.visible = !same;
    S.addChild(frFrame);
    const frVal = new EngineText((gs.foodRations ?? 100) + "%", 16777215, 14, "center", 10, Y(172), 50, 20);
    frVal.visible = !same;
    frVal.mouseEnabled = false;
    S.addChild(frVal);
    const frMinus = this.btn8("-", () => this.changeRations("food", -10));
    const frPlus = this.btn8("+", () => this.changeRations("food", 10));
    frMinus.y = Y(170); frPlus.y = Y(170);
    const tw = Math.min(frTitle.textWidth, 200);
    frTitle.x = 165 - tw / 2 - 55;
    frMinus.x = frTitle.x + tw + 10;
    frFrame.x = frVal.x = frMinus.x + 25;
    frPlus.x = frFrame.x + 50;
    for (const t of [frMinus, frPlus]) t.visible = !same;
    S.addChild(frMinus); S.addChild(frPlus);
    // 1134 Foodstuffs 标题 + 凹框 310×200 + 滚动区
    const fsText = new EngineText(this.text(1134).toUpperCase() + ":", 16777215, 14, "center", 10, Y(202), 310, 20);
    fsText.visible = !same;
    fsText.mouseEnabled = false;
    S.addChild(fsText);
    const fsFrame = new Sprite();
    this.concaveFrame(fsFrame, 0, 0, 310, 200);
    fsFrame.x = 10; fsFrame.y = Y(232);
    fsFrame.visible = !same;
    S.addChild(fsFrame);
    const fsArea = new ScrollableArea(295, 180, 295, 180, true, false, false, 15, 10, this.assets); // t92 B2 groupsFoodstuffs 15px
    fsArea.x = 10; fsArea.y = Y(252);
    fsArea.visible = !same;
    S.addChild(fsArea);
    // 表头（920 Available / 922 Consumed / 1146 Rel.Parts 12 号 center @(135/185/235,232)）
    const hAvail = new EngineText(this.text(920).toUpperCase(), 16777215, 12, "center", 135, Y(232), 50, 20);
    const hCons = new EngineText(this.text(922).toUpperCase(), 16777215, 12, "center", 185, Y(232), 50, 20);
    const hRel = new EngineText(this.text(1146).toUpperCase(), 16777215, 12, "center", 235, Y(232), 70, 20);
    for (const t of [hAvail, hCons, hRel]) { t.visible = !same; t.mouseEnabled = false; S.addChild(t); }
    // 每食物行（行高 20；名称 14 alpha0.8；− 226 / 比例框 30×19@245 / + 275 scale0.75；percent 12 / avail·cons 9）
    const bd = c.foodConsumptionBreakdown();
    const availBySub = new Map<number, number>();
    for (const [id, amt] of c.cargo) {
      const it = this.ds.items.Items[id];
      if (it && it.category === 1) availBySub.set(it.subCategory, (availBySub.get(it.subCategory) ?? 0) + amt);
    }
    const goods = this.ds.items.Goods;
    let n = 0;
    for (let i = 0; i < goods.length; i++) {
      const gd = goods[i];
      if (!gd || !gd.food) continue;
      const nm = new EngineText(this.text(gd.name).slice(0, 13).toUpperCase(), 16777215, 14, "left", 5, n * 20, 120, 20);
      nm.alpha = 0.8;
      nm.mouseEnabled = false;
      fsArea.addContent(nm);
      const frow = new Sprite();
      this.concaveFrame(frow, 0, 0, 30, 19);
      frow.x = 245; frow.y = n * 20;
      frow.mouseEnabled = false;
      fsArea.addContent(frow);
      const pB = this.btn8("+", () => this.changeFoodstuff(i, 1));
      const mB = this.btn8("-", () => this.changeFoodstuff(i, -1));
      pB.scaleX = pB.scaleY = mB.scaleX = mB.scaleY = 0.75;
      pB.x = 275; pB.y = n * 20;
      mB.x = 226; mB.y = n * 20;
      fsArea.addContent(pB); fsArea.addContent(mB);
      const pct = new EngineText(String(gs.foodstuffs[i] ?? 10), 16777215, 12, "center", 244, n * 20 + 1, 30, 20);
      pct.mouseEnabled = false;
      fsArea.addContent(pct);
      const av = new EngineText(String(Math.round((availBySub.get(i) ?? 0) * 1000) / 1000), 16777215, 9, "center", 125, n * 20 + 3, 50, 20);
      av.mouseEnabled = false;
      fsArea.addContent(av);
      const cs = new EngineText(String(Math.round((bd.items.get(i) ?? 0) * 1000) / 1000), 16777215, 9, "center", 175, n * 20 + 3, 50, 20);
      cs.mouseEnabled = false;
      fsArea.addContent(cs);
      n++;
    }
    // 列分隔竖线 x=125/175
    const sepG = new Graphics();
    sepG.lineStyle(1, 16777215, 0.4);
    sepG.moveTo(125, 0); sepG.lineTo(125, n * 20 + 20);
    sepG.moveTo(175, 0); sepG.lineTo(175, n * 20 + 20);
    const sepSpr = new Sprite();
    sepSpr.graphics = sepG;
    sepSpr.mouseEnabled = false;
    fsArea.addContent(sepSpr);
    fsArea.updateSize();
    // 底部 1135 Food consumption @(10,440) center w310
    const foodCons = new EngineText(this.text(1135).toUpperCase() + ": " + nf(c.totalFoodConsumptionFiltered(cf)) + " " + this.text(939) + "/" + this.text(941).toUpperCase(), 16777215, 14, "center", 10, Y(440), 310, 20);
    foodCons.visible = !same;
    foodCons.mouseEnabled = false;
    S.addChild(foodCons);

    // ================= 右列：水配给 + 药品剂量（原版 L2025-2090） =================
    const wCons = new EngineText(this.text(1137).toUpperCase() + ": " + Math.round(c.totalWaterConsumptionFiltered(cf) * 10) / 10 + " " + this.text(11) + "/" + this.text(941).toUpperCase(), 16777215, 14, "center", 340, Y(200), 310, 20);
    wCons.visible = !same;
    wCons.mouseEnabled = false;
    S.addChild(wCons);
    const medTitle = new EngineText(this.text(1152).toUpperCase() + ":", 16777215, 14, "center", 340, Y(240), 310, 20);
    medTitle.visible = !same;
    medTitle.mouseEnabled = false;
    S.addChild(medTitle);
    // 1136 Water rations（动态 x=495−min(tw,w)/2−55）
    const wrTitle = new EngineText(this.text(1136).toUpperCase() + ":", 16777215, 14, "left", 10, Y(172), 200, 20);
    wrTitle.visible = !same;
    S.addChild(wrTitle);
    const wrFrame = new Sprite();
    this.concaveFrame(wrFrame, 0, 0, 51, 20);
    wrFrame.y = Y(172);
    wrFrame.visible = !same;
    S.addChild(wrFrame);
    const wrVal = new EngineText((gs.waterRations ?? 100) + "%", 16777215, 14, "center", 10, Y(172), 50, 20);
    wrVal.visible = !same;
    wrVal.mouseEnabled = false;
    S.addChild(wrVal);
    const wrMinus = this.btn8("-", () => this.changeRations("water", -10));
    const wrPlus = this.btn8("+", () => this.changeRations("water", 10));
    wrMinus.y = Y(170); wrPlus.y = Y(170);
    const tw2 = Math.min(wrTitle.textWidth, 200);
    wrTitle.x = 495 - tw2 / 2 - 55;
    wrMinus.x = wrTitle.x + tw2 + 10;
    wrFrame.x = wrVal.x = wrMinus.x + 25;
    wrPlus.x = wrFrame.x + 50;
    for (const t of [wrMinus, wrPlus]) t.visible = !same;
    S.addChild(wrMinus); S.addChild(wrPlus);
    // 药品剂量 4 行（受伤 1-4 级：955-958；DO 290×40；4 个 Switch(2) + 数字标）
    for (let i = 1; i <= 4; i++) {
      const doBox = new Sprite();
      const dg = new Graphics();
      dg.lineStyle(1, 16777215, 0.3);
      dg.moveTo(0, 39); dg.lineTo(0, 0); dg.lineTo(290, 0);
      dg.lineStyle(1, 0, 0.6);
      dg.lineTo(290, 39); dg.lineTo(0, 39);
      doBox.graphics = dg;
      doBox.x = 350; doBox.y = Y(270) + (i - 1) * 40;
      doBox.visible = !same;
      S.addChild(doBox);
      const dName = new EngineText(this.text(954 + i).toUpperCase(), 16777215, 14, "left", 360, Y(280) + (i - 1) * 40, 180, 20);
      dName.visible = !same;
      dName.mouseEnabled = false;
      S.addChild(dName);
      for (let j = 0; j <= 3; j++) {
        const sw = new Switch(2, j === (gs.medicineUse?.[i] ?? 0), () => this.pressMedicine(i, j), () => this.pressMedicine(i, j), null, null, 25, 25, false, this.assets);
        sw.x = 180 + j * 25; sw.y = 7;
        sw.visible = !same;
        doBox.addChild(sw);
        const sign = new EngineText(String(j), 3683376, 14, "center", 180 + j * 25, 9, 25, 20);
        sign.mouseEnabled = false;
        doBox.addChild(sign);
      }
    }
    // 底部 1139 Medicine consumption @(340,440) center w310
    const medCons = new EngineText(this.text(1139).toUpperCase() + ": " + Math.round(c.totalMedicineConsumption(cf)) + " " + this.text(13) + "/" + this.text(941).toUpperCase(), 16777215, 14, "center", 340, Y(440), 310, 20);
    medCons.visible = !same;
    medCons.mouseEnabled = false;
    S.addChild(medCons);
  }

  // 组名（原版 getGroupName L5310-5326：1-4→904+n，5→1124，6→1122）
  private rationsGroupName(n: number): string {
    const id = n < 5 ? 904 + n : n === 5 ? 1124 : 1122;
    return this.text(id);
  }
  // 组内人员（原版 groupsUpdateSelected L5087-5094：组 6 = category [6,7,8,9,10]）
  private rationsGroupPeople(c: any, g: number): any[] {
    return g <= 5 ? c.getPeopleByGroup(g) : c.getPeopleByGroup([6, 7, 8, 9, 10]);
  }
  // 消耗过滤（原版 L5117-5124：组 6 → [6,7,8,9,10]）
  private rationsConsumptionFilter(g: number): number | number[] {
    return g <= 5 ? g : [6, 7, 8, 9, 10];
  }
  // sameAsAnother 切换（原版 groupsSwitchSameAsOther L5328-5351：无其他可用组则禁止开启）
  private toggleSameAsOther() {
    const c = this.gd.Caravans[0];
    if (!c.groupSettingsAll) return;
    const all = c.groupSettingsAll as any[];
    const gs = all[this.rationsGroup];
    if (gs.sameAsAnother > 0) {
      gs.sameAsAnother = 0;
    } else {
      const othersFree = all.slice(1, 7).some((x, i) => i + 1 !== this.rationsGroup && !(x && x.sameAsAnother > 0));
      if (othersFree) {
        gs.sameAsAnother = 1;
        const avail = this.rationsAvailableTargets();
        if (!avail.includes(gs.anotherGroup)) gs.anotherGroup = avail[0] ?? (this.rationsGroup === 1 ? 2 : 1);
      }
    }
    this.renderRations();
  }
  // 可用目标组（原版 L5127-5155：排除自身 + 链回自身的组，防循环）
  private rationsAvailableTargets(): number[] {
    const c = this.gd.Caravans[0];
    const all = (c.groupSettingsAll ?? []) as any[];
    const self = this.rationsGroup;
    const out: number[] = [];
    for (let t = 1; t <= 6; t++) {
      if (t === self) continue;
      let node = t, cyclic = false;
      for (let guard = 0; guard < 10; guard++) {
        const gs = all[node];
        if (!gs || !(gs.sameAsAnother > 0)) break;
        if (gs.anotherGroup === self) { cyclic = true; break; }
        node = gs.anotherGroup;
      }
      if (!cyclic) out.push(t);
    }
    return out;
  }
  // ◀▶ 循环切换目标组（原版 groupsSameAsOtherIndexSwitch L5288-5308）
  private cycleSameAsOther(dir: number) {
    const c = this.gd.Caravans[0];
    if (!c.groupSettingsAll) return;
    const gs = (c.groupSettingsAll as any[])[this.rationsGroup];
    const avail = this.rationsAvailableTargets();
    if (!avail.length) return;
    let idx = avail.indexOf(gs.anotherGroup);
    if (idx < 0) idx = 0;
    idx = (idx + dir + avail.length) % avail.length;
    gs.anotherGroup = avail[idx];
    this.renderRations();
  }
  // 食物/水配给 ±10，钳位 0..200（原版 groupsChangeFoodRations/WaterRations）
  private changeRations(kind: "food" | "water", delta: number) {
    const c = this.gd.Caravans[0];
    if (!c.groupSettingsAll) return;
    const gs = (c.groupSettingsAll as any[])[this.rationsGroup];
    const key = kind === "food" ? "foodRations" : "waterRations";
    gs[key] = Math.max(0, Math.min(200, (gs[key] ?? 100) + delta));
    this.renderRations();
  }
  // 食物偏好比例：+ 无上限，− 钳 0（原版 changeFoodstuffRelPart L5224-5244）
  private changeFoodstuff(sub: number, delta: number) {
    const c = this.gd.Caravans[0];
    if (!c.groupSettingsAll) return;
    const gs = (c.groupSettingsAll as any[])[this.rationsGroup];
    const cur = gs.foodstuffs[sub] ?? 0;
    gs.foodstuffs[sub] = delta > 0 ? cur + 1 : Math.max(0, cur - 1);
    this.renderRations();
  }
  // 药品剂量（原版 groupsPressMedicineDistributionSwitch L5206-5222：medicineUse[i]=j）
  private pressMedicine(i: number, j: number) {
    const c = this.gd.Caravans[0];
    if (!c.groupSettingsAll) return;
    const gs = (c.groupSettingsAll as any[])[this.rationsGroup];
    if (!gs.medicineUse) gs.medicineUse = [0, 0, 1, 2, 3];
    gs.medicineUse[i] = j;
    this.renderRations();
  }
  // 原版 drawConcaveRect：底+右亮 0.3 / 顶+左暗 0.6 + 黑底 0.2（凹框）
  private concaveFrame(spr: Sprite, x: number, y: number, w: number, h: number, fill = 0.2) {
    const g = spr.graphics ?? new Graphics();
    g.lineStyle(1, 16777215, 0.3);
    g.moveTo(x, y + h); g.lineTo(x + w, y + h); g.lineTo(x + w, y);
    g.lineStyle(1, 0, 0.6);
    g.lineTo(x, y); g.lineTo(x, y + h);
    g.beginFill(0, fill);
    g.drawRect(x + 1, y + 1, w - 2, h - 2);
    spr.graphics = g;
  }
  // 原版 Button(8) 小按钮（23×20，−/+ 用；InterfaceButton8Up.png 未导出 → 描边替代）
  private btn8(label: string, fn: () => void): Sprite {
    // CaravanMenu.as:1959/1999/2041: original Button(8) switch texture.
    return new Button(8, fn, label, this.assets);
  }

  // 原版 RepeatedGraphics(1/2) ◀▶ 三角箭头（左/右，颜色 4469521）
  private arrowBtn(dir: -1 | 1, fn: () => void): Sprite {
    const b = new Button(8, fn, null, this.assets);
    const tri = new Graphics();
    tri.beginFill(4469521);
    if (dir === -1) { tri.moveTo(3, -4); tri.lineTo(-4, 0); tri.lineTo(3, 4); }
    else { tri.moveTo(-3, -4); tri.lineTo(4, 0); tri.lineTo(-3, 4); }
    const ts = new Sprite();
    ts.graphics = tri;
    ts.x = 11.5; ts.y = 10;
    ts.mouseEnabled = false;
    b.addChild(ts);

    return b;
  }
  private refreshRations() {
    this.setCategory(4); // 用品页（t37 新页签序）
  }

  private refreshBottom() {
    const c = this.gd.Caravans[0];
    const d = this.gd.makeDate();
    for (const t of [this.bottomCap, this.bottomMoney, this.bottomDate]) if (t) t.y = 472;
    if (this.bottomCap) this.bottomCap.text = this.text(903).toUpperCase() + ": " + Math.round(c.totalCargo) + "/" + Math.round(c.maxCargo) + " " + this.text(12).toUpperCase();
    if (this.bottomMoney) this.bottomMoney.text = this.text(20).toUpperCase() + ": " + numberFormat(c.money, 2);
    // 原版 CaravanMenu.as L7255：Day2d-Month-Year2d HH:MM（无 text(22) 状态前缀）
    if (this.bottomDate) this.bottomDate.text = d.Day2d + "-" + d.ShortMonthName + "-" + d.Year2d + " " + d.Hour2d + ":" + d.Minute2d;
    // 原版 updateBottomLine：钱数居中于 载重 与 日期 之间
    if (this.bottomCap && this.bottomMoney && this.bottomDate) {
      const capW = this.bottomCap.textWidth, dateW = this.bottomDate.textWidth, moneyW = this.bottomMoney.textWidth;
      this.bottomMoney.x = 10 + capW + (640 - capW - dateW) / 2 - moneyW / 2;
    }
  }

  update(dt: number) {
    this.timeAcc += dt;
    if (this.timeAcc > 0.3) {
      this.timeAcc = 0;
      this.refreshBottom();
    }
  }
}
