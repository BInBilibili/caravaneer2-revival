import { itemWeightKg } from "./ItemMetrics";
import { itemAmount } from "./ItemQuantity";
// TradeWindow：原版易货制（TEAM-TRADE-SPEC §2-4）——双栏交易区 + 源列表 + Calculator + 校验链 + 结算
// 状态机：setPartner → takeItem → doMove → returnItem → doBarter(8 步校验) → finishBarter
import { Sprite, Graphics, BitmapObject } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { ScrollableArea, Button, Switch } from "../core/Ui";
import { CalculatorPanel } from "../core/CalculatorPanel";
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import { GameData, Town, Character, Caravan } from "./World";
import { Economy, getItemData, itemName, itemGroupOf } from "./Economy";
import { sfxClick, sfxCashRegister } from "../core/Sound";
import { Input } from "../core/Input";
import { YesNoDialogue } from "./YesNoDialogue";
import { addDialogueBackground } from "../core/DialogueBg";
import { attachItemIcon } from "./ItemIcon";
import { drawItemCellBG } from "./ItemCell";
import { CursorInfoPanel, type CursorRow } from "../core/CursorInfoPanel";
import { itemInfoPairs } from "./ItemInfo";
import { buildPortraitFromCharacter } from "./Portrait";
import { numberFormat } from "./ConsProdGraph";

// 交易条目（kind: item=货物 / transport=运输 / slave=买奴 / person=卖人）
interface TradeEntry {
  kind: "item" | "transport" | "slave" | "person";
  type: number;
  amount: number;
  name: string;
  itemData: any;
  weight: number; // 单件重量（item=weightPerUnit）
  price: number; // 当前总价（交易区内）
  divisible: boolean;
  source: any; // person/slave/transport 对象引用
  pic?: Sprite;
  amountText?: EngineText;
}

interface TradeSide {
  array: TradeEntry[]; // 源列表
  items: TradeEntry[]; // 交易区
  list: ScrollableArea | null;
  area: ScrollableArea | null;
}

const SIDE_PLAYER = 0;
const SIDE_PARTNER = 1;

export class TradeWindow {
  readonly screen = new Sprite();

  // 伪条目编码（兼容 S32 探针）：20000+i=镇上奴隶（购买），30000+i=玩家队伍成员（出售）
  static readonly SLAVE_BUY = 20000;
  static readonly SLAVE_SELL = 30000;

  private partner: Town | any = null; // Town | caravan-like（NpcCaravan）| playersStorage 数组
  private shop: any = null; // location（含 margin/assortment）
  private shopType: number | null = null; // 原版 TradeWindow.setPartner param4（subCategory 1-4；储藏库=1；null=非商店）
  private free = false; // 仓储模式（无金额）
  private blockedFilters: string[] = []; // 原版 setPartner param6：玩家侧列表禁用的筛选组
  private setLimit: number | null = null;
  private tradeButtonText = "BARTER";
  private locSymbol: number | null = null; // 城镇地点 symbol（房间/储藏库/商店；原版 setPartner 第二参来源）
  private lootClose: (() => void) | null = null;
  private sides: TradeSide[] = [
    { array: [], items: [], list: null, area: null },
    { array: [], items: [], list: null, area: null },
  ];

  // UI
  private yourPrice!: EngineText;
  private yourWeight!: EngineText;
  private partnerName!: EngineText;
  private locationName = "";
  private partnerPrice!: EngineText;
  private partnerWeight!: EngineText;
  private moneyText!: EngineText;
  private moneyArrow!: Sprite;
  private crossMoney!: Sprite;
  private bulbs: Sprite[] = [];
  private bulbTexts: EngineText[] = [];
  private bulbBases: Sprite[] = [];
  private problemText!: EngineText;
  private problemDisplay!: Sprite;
  private problemCounter = 0;
  // t101：问题1——交易窗口悬停信息面板（原版 TradeWindow.as cursorControl L1840-2170 cursorInfo）
  // 悬停源列表物品行/交易区格 → 显示浅黄底信息框（名称/价格/重量/属性对）
  private cursorPanel = new CursorInfoPanel(); // t102：公共悬停面板（浅黄样式+getInfoPairs 数据源，与装备页共用）
  private bottomCapacity!: EngineText;
  private bottomMoney!: EngineText;
  private bottomDate!: EngineText;
  private exitBtn!: Sprite;
  private barterBtn!: Sprite;
  private calcPanel!: CalculatorPanel; // t99：公共计算器面板（原版 Calculator.as 移植）
  // 玩家源列表 12 类筛选（原版 List.as Filters；样式同商队选单货物页 filterButtons）
  private cargoFilters: Record<string, boolean> = {
    market: true, food: true, liquids: true, liquidscontainers: true,
    devices: true, miscellaneous: true, weapons: true, ammo: true,
    attachments: true, armor: true, firstaid: true, tools: true,
  };
  

  constructor(
    private gd: GameData, private ds: DataStore, private assets: AssetStore,
    private onClose: () => void,
  ) {
    this.calcPanel = new CalculatorPanel(this.assets, (id) => this.text(id)); // t99 公共组件
    // t101：问题3 修复——tradeWindow.screen 无全屏命中区（t99 去掉 beginFill(0,0.9) 黑底后），
    // 点击右侧空白/对话背景区域会穿透到下方城镇菜单按钮（x660-860 统计/雇用/产业等）→ 误开标签页。
    // 原版 Dialogue 有 BGMask 全屏拦截；此处给 screen 挂一个 880×495 透明命中区（hitOnly 不渲染），
    // S.removeAll() 只清 children 不清 graphics，故一次设置即可跨 rebuild 保持。
    const hitG = new Graphics();
    hitG.hitRect(0, 0, 880, 495);
    this.screen.graphics = hitG;
  }

  // ---------- 入口 ----------
  // 城镇市场（TownMode.onLocationClick case 1；仓储 subCategory==5 → free）
  // 原版 TownMode.clickOnLocationSign L1740-1759 三分支：
  //  - subCat5（你的房间）→ partner=playersStorage 数组、free、setLimit、blockedFilters=[animals,slaves]、按钮 4170
  //  - subCat6（储藏库）→ partner=town、shop=loc、shopType=1、free、blockedFilters=loc.filters、按钮 4170
  //  - subCat 1-4（普通商店）→ partner=town、shop=loc、shopType=subCategory、free=false、按钮 1345
  show(town: Town, location: any) {
    this.locationName = "";
    this.shopType = null;
    this.locSymbol = null;
    this.blockedFilters = [];
    if (location && location.subCategory === 5) {
      // 你的房间：玩家私有存储（free 交换、容量上限、禁售动物/奴隶）
      this.locationName = typeof location.name === "number" ? this.text(location.name) : String(location.name ?? "");
      this.partner = town.playersStorage;
      this.shop = null;
      this.free = true;
      this.blockedFilters = ["animals", "slaves"];
      this.setLimit = town.playersStorageSpace;
      this.tradeButtonText = (this.text(4170) || "EXCHANGE").toUpperCase();
      this.locSymbol = typeof location.symbol === "number" ? location.symbol : null;
    } else if (location && location.subCategory === 6) {
      // 储藏库：城镇全局库存窗口（free 交换、shopType=1 → realShop=null 直通城镇 stock；
      // shop 保留用于 prepare 的 transport 拼接，但价格/库存走 town.stock）
      this.partner = town;
      this.shop = location;
      this.shopType = 1;
      this.free = true;
      this.blockedFilters = Array.isArray(location.filters) ? [...location.filters] : [];
      this.setLimit = null;
      this.tradeButtonText = (this.text(4170) || "EXCHANGE").toUpperCase();
      this.locSymbol = typeof location.symbol === "number" ? location.symbol : null;
    } else {
      // 普通商店（subCat 1-4）：真实贸易
      this.partner = town;
      this.shop = location ?? null;
      this.shopType = location ? location.subCategory : null;
      this.free = false;
      this.setLimit = null;
      this.tradeButtonText = (this.text(1345) || "BARTER").toUpperCase();
      // 原版 ensureStock 兜底：城镇全局库存为空时生成基础目录（水/食物/药品/燃料+前6武器），
      // 保证市场/商店/储藏库交易页不再空白（碉堡、林途鸟族营地等 sub1 无 assortment 商店受益）
      if (town.stock.size === 0) this.ensureStock(town);
      this.locSymbol = typeof location?.symbol === "number" ? location.symbol : null;
    }
    this.prepare();
    this.build();
  }

  // NPC 车队贸易（Shell 友好遭遇 TRADE；×2/×0.5 定价、无税）
  showCaravan(npc: any) {
    this.partner = npc;
    this.shop = null;
    this.locationName = "";
    this.shopType = null;
    this.blockedFilters = [];
    this.free = false;
    this.setLimit = null;
    this.tradeButtonText = (this.text(1345) || "BARTER").toUpperCase();
    this.locSymbol = null;
    this.prepare();
    this.build();
  }

  // 战后缴获（原版 loot()：TradeWindow.setPartner(lootArray, free=true, 标题=1395, 按钮=4169)）
  // lootMap：缴获物品 {type→amount}；点击物品即入玩家货物（free 无金额），LOOT 结算，EXIT 关闭
  showLoot(lootMap: Map<number, number>, title: string, lootOnClose: () => void) {
    this.partner = { cargo: lootMap, money: 0, name: title, x: 0, y: 0 };
    this.shop = null;
    this.locationName = "";
    this.shopType = null;
    this.blockedFilters = [];
    this.free = true;
    this.setLimit = null;
    this.tradeButtonText = this.text(4169) || "LOOT";
    this.lootClose = lootOnClose;
    this.prepare();
    this.build();
    // TradeWindow.as takeMoney(): stage currency, do not cash it before confirmation.
    const money = this.sides[SIDE_PARTNER].array.find(e => e.kind === "item" && e.type === 97);
    if (money) this.doMove(SIDE_PARTNER, money, money.amount);
  }

  // ---------- 探针兼容（smoke_test S8/S32） ----------
  get items(): Array<{ itemId: number; name: string; amount: number }> {
    return this.sides[SIDE_PARTNER].array.map((e) => ({ itemId: e.type, name: e.name, amount: Math.round(e.amount) }));
  }
  get calculatorVisible(): boolean { return this.calcPanel.ov.visible; }
  // t101：每帧悬停驱动（由 TownMode.update 在窗口可见时调用；原版 cursorControl enterFrame）
  updateCursor() { this.updateCursorInfo(); }
  // t109：每帧驱动计算器开关滑块动画（由 TownMode.update 调用）
  // 注意不能检查 calculatorOv.visible：点击开关会触发 closeCalculator → ov 隐藏，
  // 若此处短路，滑块动画停在半路/起点，下次重开时滑块 x 与 position 不一致
  updateFrame(dt: number) {
    this.calcPanel.sw.update(dt); // t99：公共面板开关滑块动画
  }
  get dialogVisible(): boolean { return !!(this.msgDlg && this.msgDlg.visible) || !!(this.confirmDlg && this.confirmDlg.visible); }
  playerArea(): Array<{ type: number; amount: number }> { return this.sides[SIDE_PLAYER].items.map((e) => ({ type: e.type, amount: e.amount })); }
  partnerArea(): Array<{ type: number; amount: number }> { return this.sides[SIDE_PARTNER].items.map((e) => ({ type: e.type, amount: e.amount })); }
  // 冒烟用：点击源列表指定物品行（返回点击到的行中心 y，-1=未找到）
  sourceRowY(side: number, type: number): number {
    // 显示顺序 = sourceRows（Q1 分组顺序）
    const rows = this.sourceRows(side);
    const idx = rows.findIndex((e) => e.type === type);
    if (idx < 0) return -1;
    if (side === SIDE_PLAYER) {
      // 玩家源列表：原版 List listSize=100 → 卡片 250×250 scale=(100-30)/250=0.28 → 视觉 70×70；
      // cell 的 scale 只缩放绘制内容，不改变 cell.y 在父容器中的位置 → 视觉行距 = PITCH=80
      // 行中心 = 列表 y(73) + 10 + cellN×80 + 70/2 = 118 + cellN×80
      return 73 + 10 + idx * 80 + 35;
    }
    // 对方源列表：qList.y=42，行中心 = 42 + 10 + idx×80 + 35 = 87 + idx×80
    return 42 + 10 + idx * 80 + 35;
  }

  // ---------- 源数组构建（原版 setPartner L262-488） ----------
  private prepare() {
    const c = this.gd.Caravans[0];
    // 玩家侧：货物 + 运输单位（原版 setPartner L309：Cargo.concat(Transport)）
    // + 允许奴隶/奴隶商时队伍成员（L310-313）
    const pArr: TradeEntry[] = [];
    for (const [id] of c.cargo) {
      const amt = c.tradableCargo(id);
      if (amt <= 0) continue;
      const def = getItemData(this.ds, id);
      const it = this.ds.items.Items[id];
      pArr.push(this.itemEntry(id, amt, def, it));
    }
    // 原版 L314-331：玩家侧筛选组（15 类），blockedFilters 剔除禁用的（animals/slaves 等）
    const filters = ["market", "food", "liquids", "liquidscontainers", "devices", "tools", "miscellaneous", "weapons", "ammo", "attachments", "armor", "firstaid", "animals", "carts", "cars", "slaves"];
    const blocked = this.blockedFilters ?? [];
    for (const b of blocked) {
      const i = filters.indexOf(b);
      if (i >= 0) filters.splice(i, 1);
    }
    const partnerAllowsSlaves = this.partner instanceof Town ? this.partner.allowsSlaves : !!this.partner?.slavers;
    if (partnerAllowsSlaves) {
      const people = c.People;
      for (let i = 1; i < people.length; i++) {
        const p = people[i];
        pArr.push({
          kind: "person", type: TradeWindow.SLAVE_SELL + i, amount: 1,
          name: "SELL " + (p.name || this.text(905)), itemData: null,
          weight: p.weight ?? 80, price: 0, divisible: false, source: p,
        });
      }
    }
    this.sides[SIDE_PLAYER].array = pArr;
    // 对方侧：城镇库存 / 商店库存（+运输/奴隶）/ 玩家存储数组 / 车队货物
    const qArr: TradeEntry[] = [];
    if (Array.isArray(this.partner)) {
      // 你的房间：playersStorage 数组（{type,amount}）
      for (const e of this.partner) {
        if (!e || e.amount <= 0) continue;
        const def = getItemData(this.ds, e.type);
        const it = this.ds.items.Items[e.type];
        qArr.push(this.itemEntry(e.type, e.amount, def, it));
      }
    } else if (this.partner instanceof Town) {
      // 原版 L356-371：shop is Object && shopType!=1 → 用 shop.stock；否则（含 shopType==1 储藏库）→ town.stock；
      // 无条件 concat(shop.transport)；allowsSlaves 时 concat(shop.slaves)
      const stockSrc: Map<number, number> = this.shop && this.shopType !== 1 ? (this.shop.stock ?? this.partner.stock) : this.partner.stock;
      for (const [id, amt] of stockSrc) {
        if (amt <= 0) continue;
        const def = getItemData(this.ds, id);
        const it = this.ds.items.Items[id];
        qArr.push(this.itemEntry(id, amt, def, it));
      }
      // 运输单位行（10000+type 编码，购买运输）——原版 concat(shop.transport) 无条件；
      // shop.transport 为空（绝大多数店铺无运输）则不添加任何运输行（原版 concat([]) 语义）
      const shopTransport: any[] = this.shop?.transport ?? [];
      for (const tr of shopTransport) {
        qArr.push({
          kind: "transport", type: 10000 + tr.type, amount: 1,
          name: tr.givenName || (getText(this.ds, (this.ds.transports?.Types?.[tr.type] ?? {})?.name ?? 890, this.ds.language) || "Transport " + tr.type),
          itemData: null,
          weight: tr.weight ?? 1, price: 0, divisible: false, source: tr,
        });
      }
      // 奴隶行（20000+i；地点 slaves，原版 concat(shop.slaves) 当 allowsSlaves）
      if (this.partner.allowsSlaves) {
        const loc = this.shop;
        const slaves: any[] = Array.isArray(loc?.slaves) ? loc.slaves : [];
        for (let i = 0; i < slaves.length; i++) {
          const s = slaves[i];
          qArr.push({
            kind: "slave", type: TradeWindow.SLAVE_BUY + i, amount: 1,
            name: this.characterName(s),
            itemData: null, weight: s.weight ?? 80, price: 0, divisible: false, source: s,
          });
        }
      }
    } else if (this.partner && typeof this.partner.cargo?.get === "function") {
      // Original TradeWindow.setPartner (AS3 lines 390-444): a caravan does not offer its
      // whole cargo. Only ordinary goods are tradable; equipped/in-use goods, containers,
      // seven days of consumables/food and 300 km of fuel are retained by the caravan.
      const roster: any[] = Array.isArray(this.partner.people) && this.partner.people.length
        ? this.partner.people
        : (Array.isArray(this.partner.squad?.people) ? this.partner.squad.people : []);
      // 战后缴获（showLoot：free=true，partner 是 {cargo: Map} 合成对象）也走这个分支，但原版把
      // lootArray 当 Array 交给 setPartner（AS3 的 `partner is Array` 分支）→ 原样整表列出，不做
      // 商队"只卖商品"的保留规则。若这里照旧过滤（category!=1 清零），武器/弹药/配件/护甲全部消失，
      // 战利品只剩现金与少量商品 —— 即"战利品页面没有敌人的武器"。
      if (this.free) {
        for (const [id, rawAmount] of this.partner.cargo as Map<number, number>) {
          const amount = rawAmount - Number(this.partner.inUse?.[id] ?? 0);
          if (amount >= 0.05) qArr.push(this.itemEntry(id, amount, getItemData(this.ds, id), this.ds.items.Items[id]));
        }
      } else {
        // 遭遇车队的真实交易：对方只拿出来卖的商品，其余自留
        const view = new Caravan();
        view.cargo = this.partner.cargo;
        view.inUse = this.partner.inUse ?? {};
        view.transports = Array.isArray(this.partner.transports) ? this.partner.transports : [];
        view.People = roster.map((p) => p instanceof Character ? p : new Character(p));
        const needs = view.getConsumptionProduction();
        let totalFoodCalories = 0;
        for (const [id, amount] of this.partner.cargo as Map<number, number>) {
          const def = getItemData(this.ds, id);
          if (def?.food) totalFoodCalories += amount * Number(def.calories ?? 0);
        }
        const foodSaleRatio = totalFoodCalories > 0
          ? Math.max(totalFoodCalories - needs.foodConsumption * 7, 0) / totalFoodCalories
          : 0;
        for (const [id, rawAmount] of this.partner.cargo as Map<number, number>) {
          const def = getItemData(this.ds, id);
          const it = this.ds.items.Items[id];
          let amount = rawAmount - Number(this.partner.inUse?.[id] ?? 0);
          // Item.category == 1 is the original goods category. Weapons, ammunition,
          // armour, devices, etc. carried by an encountered caravan are not merchandise.
          if (it?.category !== 1 || def?.liquidsContainer) amount = 0;
          if (amount > 0) {
            for (const consumption of needs.consumption) {
              if (consumption.item === id) amount -= consumption.amount * 7;
            }
            if (def?.food) amount *= foodSaleRatio;
            if (id === 64) amount -= needs.fuelPer100Km * 3;
          }
          if (amount > 0) qArr.push(this.itemEntry(id, amount, def, it));
        }
      }

      // Original starts with partner.People and removes every non-slave Character.
      const slaves: any[] = roster.filter((p) => Number(p?.category) === 4);
      if (this.partner.slavers && slaves.length === 0 && (this.partner.slavesHeld ?? 0) > 0) {
        if (!Array.isArray(this.partner.slaves)) {
          this.partner.slaves = [];
          for (let i = 0; i < (this.partner.slavesHeld ?? 0); i++) {
            this.partner.slaves.push(new Character({ category: 4, age: 18 + Math.floor(Math.random() * 30), gender: Math.random() < 0.5 ? 1 : 2 }));
          }
        }
        slaves.push(...this.partner.slaves);
      }
      for (let i = 0; i < slaves.length; i++) {
        const slave = slaves[i];
        qArr.push({
          kind: "slave", type: TradeWindow.SLAVE_BUY + i, amount: 1,
          name: this.characterName(slave),
          itemData: null, weight: slave.weight ?? 80, price: 0, divisible: false, source: slave,
        });
      }
    }
    this.sides[SIDE_PARTNER].array = qArr.filter(e => e.amount >= 0.05);
    // 初始单价（源列表展示用）
    for (const e of this.sides[SIDE_PLAYER].array) e.price = this.entryUnitPrice(e, false);
    for (const e of this.sides[SIDE_PARTNER].array) e.price = this.entryUnitPrice(e, true);
    // 玩家侧运输单位行（10000+type 编码，卖出运输；原版 partners[0].array = Cargo.concat(Transport)，
    // 按 animals/carts/cars 分组显示；blockedFilters 含 animals/carts/cars 时整组隐藏）
    const trAllowed = (g: string) => !this.blockedFilters.includes(g);
    for (const tr of c.transports) {
      if (!tr) continue;
      const tt = this.ds.transports?.Types?.[tr.type] ?? {};
      const cat = typeof tr.category === "number" ? tr.category : (tt.category ?? 1);
      const grp = cat === 2 ? "carts" : cat === 3 ? "cars" : "animals";
      if (!trAllowed(grp)) continue;
      pArr.push({
        kind: "transport", type: 10000 + tr.type, amount: 1,
        name: tr.givenName || (getText(this.ds, tt.name ?? 890, this.ds.language) || "Transport " + tr.type),
        itemData: null,
        weight: tr.weight ?? 1, price: 0, divisible: false, source: tr,
      });
    }
    this.sides[SIDE_PLAYER].array = pArr.filter(e => e.amount >= 0.05);
  }

  private itemEntry(id: number, amount: number, def: any, it: any): TradeEntry {
    const g = it && it.category === 1 ? this.ds.items.Goods[it.subCategory] : null;
    return {
      kind: "item", type: id, amount: itemAmount(amount, !!g?.divisible),
      name: itemName(this.ds, id), itemData: def ?? {},
      weight: itemWeightKg(this.ds, id), price: 0,
      divisible: !!(g && g.divisible), source: null,
    };
  }

  // 运输单位图标：同步取已加载贴图；未加载时异步 ensure 补挂（首次打开面板即显示，原版 ImportedBitmap 语义）
  // 运输单位图标：原版 List.as 直接把 TransportUnit.picture（250x250 全幅 art）加到 250 卡片
  // (0,0)，整卡再缩到 listSize；贴图自带居中构图，不能再二次缩放/偏移（此前 100px 盒缩放
  // 导致图标右下角溢出裁剪）。异步 ensure 补挂首次打开即显示。
  // 运输单位图标（250 全幅 art 铺满卡片，随后 cell 整体 scale 到 listSize）；cat1 动物加左下角性别图标
  private attachTransportIcon(cell: Sprite, type: number, CELL: number, unit?: any) {
    const name = "transportIcon" + type + ".png";
    const cat = unit ? (typeof unit.category === "number" ? unit.category : (this.ds.transports?.Types?.[type]?.category ?? 1)) : 1;
    const put = (im: HTMLImageElement | null) => {
      if (!im) return;
      if (cell.children.some((ch) => ch instanceof BitmapObject)) return;
      const bmp = new BitmapObject(im);
      bmp.scaleX = bmp.scaleY = CELL / 250; // 与整卡一致：250 art → CELL 尺寸（随后 cell 再 scale 到 listSize）
      // 关键：贴图必须 mouseEnabled=false——否则 250 全幅位图吞掉整卡命中测试，
      // hitTestPoint 返回 bmp 而非 cell，cell 的 click 监听永远收不到 → 动物行点不了
      bmp.mouseEnabled = false;
      cell.addChild(bmp);
      if (cat === 1 && unit) this.attachGenderIcon(cell, unit, CELL);
    };
    const im = this.assets.getImage(name);
    if (im) { put(im); return; }
    void this.assets.ensure(name).then(put);
  }

  // 原版 List.as L27840：cat1 动物行左下角性别图标（InterfaceIconMale/Female 0.7 scale @(40,210) alpha0.5，250 画布坐标）
  private characterName(p: any): string {
    if (!p.name) {
      const names = this.ds.namePhonetics?.[p.gender === 2 ? "EnglishFemaleNames" : "EnglishMaleNames"] ?? [];
      if (names.length) p.name = String(names[Math.floor(Math.random() * names.length)]);
    }
    return p.name || this.text(908);
  }

  private characterInfoPairs(p: any): Array<{name: string; value: string}> {
    // Character.as:getInfoPairs(true), including effective/base stat differences.
    const pair = (id: number, value: any) => ({name: this.text(id).toUpperCase(), value: String(value)});
    const stat = (value: number, base: number) => String(value) + (value !== base ? " (" + (value - base) + ")" : "");
    return [pair(50, Math.round(p.HP) + "/" + Math.round(p.maxHP)),
      pair(944, stat(p.physical, p.basePhysical)), pair(945, stat(p.agility, p.baseAgility)),
      pair(946, p.accuracy), pair(947, p.intelligence), pair(1271, this.nf(p.capacity, 1, true)),
      pair(916, this.nf(p.speed, 1, true)), pair(984, this.nf(p.totalExperience, 0)),
      pair(966, this.nf(p.learningCapacity * 100, 0))];
  }

  private attachCharacterIcon(cell: Sprite, person: any, size: number) {
    const portrait = buildPortraitFromCharacter(this.assets, person, size / 250);
    portrait.mouseEnabled = portrait.mouseChildren = false;
    cell.addChild(portrait);
    const k = size / 250;
    const iconName = "filtericon" + ({1:"volunteers",2:"mercenaries",3:"prisoners",4:"slaves"}[person.category as 1|2|3|4] ?? "other") + ".png";
    const putIcon = (image: HTMLImageElement | null) => {
      if (!image) return;
      const icon = new BitmapObject(image); icon.scaleX = icon.scaleY = 1.5 * k;
      icon.x = 210 * k - image.width * icon.scaleX / 2;
      icon.y = 210 * k - image.height * icon.scaleY / 2;
      icon.alpha = .5; icon.mouseEnabled = false; cell.addChild(icon);
    };
    const image = this.assets.getImage(iconName);
    if (image) putIcon(image); else void this.assets.ensure(iconName).then(putIcon);
    // List.as:551-560, in the original 250px portrait coordinates.
    const bar = new Sprite(), g = new Graphics();
    g.lineStyle(.1, 0xffffff); g.drawRect(0, 0, 130, 20);
    g.lineStyle(0, 0); g.beginFill(0xffffff);
    g.drawRect(3, 3, 124 * Math.max(0, Math.min(1, person.HP / person.maxHP)), 14);
    bar.graphics = g; bar.x = 20 * k; bar.y = 210 * k;
    bar.scaleX = bar.scaleY = k; bar.alpha = .5; bar.mouseEnabled = false; cell.addChild(bar);
  }

  private attachGenderIcon(cell: Sprite, unit: any, CELL: number) {
    const g = unit.gender === 1 ? "InterfaceIconMale.png" : "InterfaceIconFemale.png";
    const put = (im: HTMLImageElement | null) => {
      if (!im) return;
      if (cell.children.some((ch) => (ch as any).__genderIcon)) return;
      const b = new BitmapObject(im);
      b.mouseEnabled = false;
      // 原版 List.as L27840：(40,210) scale0.7 —— 但原版 InterfaceIconMale/Female MovieClip
      // 的注册点在"脚下/底部"（站立人形锚点）：y=210 锚定图标 BOTTOM（而非左上角）。
      // → 图标视觉位于卡片 (40, 210-36)~(40+36, 210)，即底部留白 ~40px（≈16%），
      // 与我们此前用左上角锚点导致图标贴卡片底（偏移感"右下"）不同。
      // web BitmapObject 左上角注册：让 bottom = y=210 → b.y = 210*K - iconH*0.7*K
      const k = CELL / 250;
      const s = 0.7 * k;
      const ih = (im.naturalHeight || im.height || 52) * s;
      b.scaleX = b.scaleY = s;
      b.x = 40 * k;
      b.y = 210 * k - ih;
      b.alpha = 0.5;
      (b as any).__genderIcon = true;
      cell.addChild(b);
    };
    const im = this.assets.getImage(g);
    if (im) { put(im); return; }
    void this.assets.ensure(g).then(put);
  }

  // 原版 ensureStock：城镇空库存时生成目录（水/食物/药品/燃料 + 前 6 件武器）
  private ensureStock(town: Town) {
    if (town.stock.size > 0) return;
    const catalog: number[] = [];
    catalog.push(1); // 水
    for (const f of [5, 11, 12, 13]) { const id = this.firstItemForGoods(f); if (id) catalog.push(id); }
    for (const g of [7, 8, 9, 10]) { const id = this.firstItemForGoods(g); if (id) catalog.push(id); }
    const items = this.ds.items.Items;
    for (let i = 1, n = 0; i < items.length && n < 6; i++) {
      if (items[i] && items[i].category === 2) { catalog.push(i); n++; }
    }
    for (const id of catalog) {
      const amount = 20 + ((town.id * 13 + id * 7) % 180);
      town.addToStock(id, amount);
    }
  }

  private firstItemForGoods(sub: number): number {
    const items = this.ds.items.Items;
    for (let i = 1; i < items.length; i++) {
      if (items[i] && items[i].category === 1 && items[i].subCategory === sub) return i;
    }
    return 0;
  }

  private text(id: number) { return getText(this.ds, id, this.ds.language); }

  // 原版 TownMode.getLocationSymbol(symbol)：symbol(1-34) → filtericon 部件列表（与 TownMode.locationSymbolParts 同源）
  private locationSymbolParts(symbol: number): Array<{ name: string; x: number; y: number; scale: number }> {
    const at = (name: string, x = 0, y = 0, scale = 1) => ({ name, x, y, scale });
    switch (symbol) {
      case 1: return [at("market")];
      case 2: return [at("equipmentshop")];
      case 3: return [at("cars")];
      case 4: return [at("firstaid")];
      case 5: return [at("veterinary")];
      case 6: return [at("mechanicalshop")];
      case 7: return [at("water")];
      case 8: return [at("person")];
      case 9: return [at("generalstore")];
      case 10: return [at("animals")];
      case 11: return [at("weapons")];
      case 12: return [at("carts")];
      case 13: return [at("slaves")];
      case 14: return [at("people")];
      case 15: return [at("room")];
      case 16: return [at("tent")]; // filtericontent
      case 17: return [at("storage")];
      case 18: return [at("house")];
      case 19: return [at("volunteers")];
      case 20: return [at("book")];
      case 21: return [at("sheriff")];
      case 22: return [at("prisoners", 0, 0, 0.8)];
      case 23: return [at("book"), at("sheriff", -9.5, -1, 0.3), at("sheriff", 9.5, -1, 0.3)];
      case 24: return [at("alkubrapolice")];
      case 25: return [at("liberationarmy")];
      case 26: return [at("workforcemerchants")];
      case 27: return [at("book"), at("mechanicalshop", -9.5, -1, 0.4), at("mechanicalshop", 9.5, -1, 0.4)];
      case 28: return [at("book"), at("veterinary", -9.5, -1, 0.4), at("veterinary", 9.5, -1, 0.4)];
      case 29: return [at("kendo")];
      case 30: return [at("transmitter")];
      case 31: return [at("bomb")];
      case 32: return [at("qubba")];
      case 33: return [at("federation")];
      case 34: return [at("book"), at("firstaid", -9.5, -1, 0.4), at("firstaid", 9.5, -1, 0.4)];
      default: return [];
    }
  }

  // 当前伙伴符号部件（原版 setPartner 第二参 partnerSymbol）：
  // 城镇地点贸易/房间/储藏库 → 地点 symbol 的 filtericon 部件；NPC 车队 → filtericonperson（原版为车队首肖像，web 无物化肖像时以人形图标近似）；
  // loot/其他 → 无符号（不显示）
  private currentSymbolParts(): Array<{ name: string; x: number; y: number; scale: number }> {
    // 城镇地点（商店/储藏库/房间等）：显示地点 symbol 的 filtericon（原版 getLocationSymbol(location.symbol)）
    if (this.partner instanceof Town || Array.isArray(this.partner)) {
      const sym = typeof this.shop?.symbol === "number" ? this.shop.symbol : (this.locSymbol ?? 17);
      return this.locationSymbolParts(sym);
    }
    // NPC 车队：人形图标（原版为车队首肖像，web 无物化肖像）
    if (this.partner && typeof this.partner === "object" && typeof (this.partner as any).slavers === "boolean") {
      return [{ name: "person", x: 0, y: 0, scale: 1 }];
    }
    return [];
  }

  // 把伙伴符号部件挂进 60×60 框（原版 currentPartnerSymbol.x=720,y=432 中心；符号注册点=中心 → 居中）
  private attachPartnerSymbol(group: Sprite) {
    const parts = this.currentSymbolParts();
    const loadOne = (p2: { name: string; x: number; y: number; scale: number }) => {
      const name = "filtericon" + p2.name + ".png";
      const add = (im: HTMLImageElement | null) => {
        if (!im || group.children.some((ch) => (ch as any).__symName === name)) return;
        const b = new BitmapObject(im);
        b.mouseEnabled = false;
        b.scaleX = b.scaleY = p2.scale;
        b.x = 30 + p2.x * p2.scale - (b.width * p2.scale) / 2;
        b.y = 30 + p2.y * p2.scale - (b.height * p2.scale) / 2;
        (b as any).__symName = name;
        group.addChild(b);
      };
      const im = this.assets.getImage(name);
      if (im) add(im);
      else void this.assets.ensure(name).then(add);
    };
    for (const p2 of parts) loadOne(p2);
  }


  // ---------- 定价（原版 calculatePrice / applyTaxes / transportCharacterPrice） ----------
  private calcItemPrice(type: number, amount: number, isPartnerSide: boolean): number {
    // 原版 calculatePrice(..., realShop)：shopType==1（储藏库）→ realShop=null → 价格用 town.stock
    const priceShop = this.shopType === 1 ? null : this.shop;
    return Economy.tradePrice(this.ds, this.partner, type, amount, isPartnerSide, priceShop, this.free);
  }
  // 运输/奴隶/人员定价：基准价 × applyTaxes
  private entryUnitPrice(e: TradeEntry, isPartnerSide: boolean): number {
    if (this.free) return 0;
    if (e.kind === "item") return this.calcItemPrice(e.type, 1, isPartnerSide);
    if (e.kind === "transport") {
      const t = e.source;
      const base = (typeof t?.price === "function" ? t.price() : (t?.price ?? 1000)) * (e.type - 10000 === 13 ? 1 : 1);
      return Economy.applyTaxes(base, isPartnerSide, { free: this.free, shop: this.shop, town: this.partner instanceof Town ? this.partner : null, caravan: !(this.partner instanceof Town) ? this.partner : null });
    }
    // slave/person：Character.price × 城镇 slavePrices 乘子
    const mult = (this.partner instanceof Town && this.partner.preset && typeof this.partner.preset.slavePrices === "number") ? this.partner.preset.slavePrices : 1;
    const base = (e.source?.price ? e.source.price() : (this.gd.constructor as any).averageSlavePrice ?? 5000) * mult;
    return Economy.applyTaxes(base, isPartnerSide, { free: this.free, shop: this.shop, town: this.partner instanceof Town ? this.partner : null, caravan: !(this.partner instanceof Town) ? this.partner : null });
  }

  private totalPrice(items: TradeEntry[]): number {
    let s = 0;
    for (const e of items) s += e.price;
    return s;
  }
  private totalWeight(items: TradeEntry[]): number {
    let s = 0;
    for (const e of items) s += e.weight * e.amount;
    return s;
  }

  // ---------- 选择物品 → 交易区（原版 takeItem L664-878） ----------
  private takeItem(sideIdx: number, entry: TradeEntry) {
    if (!entry) return;
    const side = this.sides[sideIdx];
    if (entry.kind !== "item") { this.doMove(sideIdx, entry, 1); return; }
    const c = this.gd.Caravans[0];
    let max = entry.amount;
    let spareWeight: number | null = null;
    if (sideIdx === SIDE_PARTNER) spareWeight = c.maxCargo - c.totalCargo;
    else if (this.partner instanceof Town) spareWeight = null;
    else if (typeof this.partner?.maxCargo === "number") spareWeight = this.partner.maxCargo - (this.partner.totalCargo ?? 0);
    let containersProblem = false, moneyProblem = false;
    if (!this.gdAdvanced && max >= 0.05 && spareWeight !== null && entry.weight > 0) {
      max = Math.max(Math.min(max, Math.floor((10 * spareWeight) / entry.weight + 1e-9) / 10), 0);
    }
    const liquid = !!(entry.itemData && entry.itemData.liquid);
    if (!this.gdAdvanced && max >= 0.05 && liquid) {
      let maxLiquid = Infinity;
      if (sideIdx === SIDE_PARTNER) maxLiquid = c.maxLiquidAmount(entry.type);
      else if (typeof this.partner?.maxLiquidAmount === "function") maxLiquid = this.partner.maxLiquidAmount(entry.type);
      max = Math.min(max, Math.max(Math.floor(maxLiquid * 10) / 10, 0));
      if (max < 0.05) containersProblem = true;
    }
    if (!this.free && sideIdx === SIDE_PARTNER && !this.gdAdvanced && max >= 0.05) {
      const availableMoney = c.money + this.totalPrice(this.sides[SIDE_PLAYER].items) - this.totalPrice(this.sides[SIDE_PARTNER].items);
      let perMoney = Economy.amountAffordable(this.ds, this.partner, entry.type, Math.max(0, availableMoney), true, this.shopType === 1 ? null : this.shop, this.free);
      perMoney = Math.floor(perMoney * 10 + 1e-8) / 10;
      if (!entry.divisible) perMoney = Math.floor(perMoney);
      max = Math.min(max, perMoney);
      if (perMoney <= 0) moneyProblem = true;
    }
    max = entry.divisible ? Math.round(max * 10) / 10 : Math.floor(max);
    if (containersProblem) this.showProblem(this.text(1346));
    else if (moneyProblem) this.showProblem(this.text(1273));
    else if (max < 0.05) this.showProblem(this.text(1020));
    if (max < 3.05) {
      if (max >= 0.05) this.doMove(sideIdx, entry, Math.min(1, max));
    } else {
      this.calcPanel.open(this.screen, entry.divisible ? 0.1 : 1, max, (v) => this.doMove(sideIdx, entry, v), () => {
        // 右栏预览（原版 TradeWindow.as L799-829）：value>max → "数量超过最大值"；否则品名/总价/单价/重量
        const cv = this.calcPanel.v, cm = this.calcPanel.maxV;
        if (cv === 0) this.calcPanel.right.text = "";
        else if (cv > cm) this.calcPanel.right.text = this.text(1359);
        else {
          const isPartnerSide = sideIdx === SIDE_PARTNER;
          const p = this.calcItemPrice(entry.type, cv, isPartnerSide);
          this.calcPanel.right.text = this.text(1358) + ": " + entry.name +
            (!this.free ? "\n" + this.text(1347) + ": " + this.fmt(p) + " €\n" + this.text(1192) + ": " + this.fmt(p / cv) + " €" : "") +
            "\n" + this.text(1191) + ": " + this.fmt(entry.weight * cv) + " " + this.text(12);
        }
      });
    }
  }

  private get gdAdvanced(): boolean { return !!(this.gd as any).advancedTrading; }

  // ---------- doMove（移动 + 双侧库存同步，原版 L879-1023） ----------
  private doMove(sideIdx: number, entry: TradeEntry, amount: number, skipRecalc = false) {
    const side = this.sides[sideIdx];
    if (!side.array.includes(entry) || !Number.isFinite(amount) || amount <= 0) return;
    amount = Math.min(amount, entry.amount);
    if (sideIdx === SIDE_PLAYER && entry.kind === "item") amount = Math.min(amount, this.gd.Caravans[0].tradableCargo(entry.type));
    if (!entry.divisible) amount = Math.floor(amount);
    if (amount <= 0) return;
    let target = entry.kind === "item" ? side.items.find((e) => e.kind === "item" && e.type === entry.type) : undefined;
    if (!target) {
      // 原版 doMove L957-966：TransportUnit/Character 交易区条目 weight=0
      // （仅 Array 伙伴 + setLimit 时记重）→ 总重量行只计物品，动物/载具走底部载重
      const entryWeight = (entry.kind === "item" || (Array.isArray(this.partner) && this.setLimit != null)) ? entry.weight : 0;
      target = {
        kind: entry.kind, type: entry.type, amount: 0, name: entry.name,
        itemData: entry.itemData, weight: entryWeight, price: 0,
        divisible: entry.divisible, source: entry.source,
      };
      side.items.push(target);
      this.makePic(target);
    }
    target.amount = Math.round((target.amount + amount) * 10) / 10;
    // 源扣减
    const srcIdx = side.array.indexOf(entry);
    if (srcIdx >= 0) {
      if (entry.kind === "item") {
        entry.amount = Math.round((entry.amount - amount) * 10) / 10;
        if (entry.amount < 0.05) side.array.splice(srcIdx, 1);
      } else {
        side.array.splice(srcIdx, 1); // transport/slave/person 整体移动
      }
    }
    // 双侧真实库存同步（item 立即；transport 对象实时移动——原版 reduceFromPartner/addToPartner 调
    // Caravan.removeTransport/addTransport，使左下角载重（maxCargo/totalCargo）随交易槽实时变化；
    // slave/person 延后到 finishBarter）
    if (entry.kind === "item") {
      if (sideIdx === SIDE_PLAYER) { this.removeFromPlayer(entry, amount); this.addToPartner(entry, amount); }
      else { this.addToPlayer(entry, amount); this.removeFromPartner(entry, amount); }
    } else if (entry.kind === "transport") {
      this.moveTransportObject(sideIdx, entry.source);
    }
    this.syncLiquids();
    if (!this.free) {
      if (entry.kind === "item" && !skipRecalc) this.recalculateItemPrices();
      else if (entry.kind !== "item") target.price = this.entryUnitPrice(target, sideIdx === SIDE_PARTNER) * (target.kind === "item" ? target.amount : 1);
    } else target.price = 0;
    if (!skipRecalc) this.update();
  }

  // 原版 doMove L932-1009 / returnItem L1273-1276：TransportUnit 对象实时在
  // Caravan.Transport ↔ shop.transport 之间移动（买/卖两个方向），
  // update() 的底部载重（maxCargo/totalCargo）随之实时变化
  private moveTransportObject(sideIdx: number, tr: any) {
    if (!tr) return;
    const c = this.gd.Caravans[0];
    let pTrans: any[] | null = null;
    if (this.partner instanceof Town) pTrans = this.shop?.transport ?? null;
    else if (this.partner && Array.isArray(this.partner.transports)) pTrans = this.partner.transports;
    if (sideIdx === SIDE_PLAYER) {
      // 卖出/放回：从玩家车队移除 → 加入对方运输列表
      const i = c.transports.indexOf(tr);
      if (i >= 0) c.transports.splice(i, 1);
      if (pTrans && !pTrans.includes(tr)) pTrans.push(tr);
      c.updateSpeed();
    } else {
      // 买入：从对方运输列表移除 → 加入玩家车队
      if (pTrans) {
        const j = pTrans.indexOf(tr);
        if (j >= 0) pTrans.splice(j, 1);
      }
      if (!c.transports.includes(tr)) c.addTransport(tr);
    }
  }

  private makePic(e: TradeEntry) {
    const cell = new Sprite();
    const g = new Graphics();
    g.beginFill(16777215, 0.08);
    g.lineStyle(1, 16777215, 0.7);
    g.drawRect(0, 0, 56, 56);
    g.hitRect(0, 0, 56, 56);
    cell.graphics = g;
    (cell as any).height = 56; // 交易区行高（updateSize 测量用：否则末行被裁半）
    // 原版：格子=250x250 白框 + Item.picture 大图 + 右下数量（无名称）；
    // 运输单位在交易槽同样画 transportIcon{type}.png（原版 TransportUnit.picture）
    if (e.kind === "item") attachItemIcon(this.assets, this.ds, cell, e.type, { size: 50, center: true });
    else if (e.kind === "transport") this.attachTransportIcon(cell, e.type - 10000, 56);
    else this.attachCharacterIcon(cell, e.source, 56);
    const amt = new EngineText("", 16777215, 16, "right", 10, 32, 44, 20);
    cell.addChild(amt);
    e.pic = cell;
    e.amountText = amt;
    cell.addEventListener("click", () => this.clickBarterItem(e));
  }

  // 交易区点击 → 放回（原版 clickBarterItem L1107-1244）
  private clickBarterItem(e: TradeEntry) {
    sfxClick();
    const sideIdx = this.sides[0].items.includes(e) ? SIDE_PLAYER : SIDE_PARTNER;
    const idx = this.sides[sideIdx].items.indexOf(e);
    if (idx < 0) return;
    if (e.kind === "item" && e.amount < 3.05) {
      this.returnItem(sideIdx, idx, Math.min(1, e.amount));
    } else if (e.kind === "item") {
      this.calcPanel.open(this.screen, 0, e.amount, (v) => this.returnItem(sideIdx, idx, v), undefined, this.text(1215));
    } else {
      this.returnItem(sideIdx, idx, 1);
    }
  }

  // 放回源列表（原版 returnItem L1245-1446）
  private returnItem(sideIdx: number, idx: number, amount: number) {
    const side = this.sides[sideIdx];
    const e = side.items[idx];
    if (!e || !Number.isFinite(amount) || amount <= 0) return;
    amount = Math.min(amount, e.amount);
    if (!e.divisible) amount = Math.floor(amount);
    if (amount <= 0) return;
    if (e.kind === "item") {
      // 源合并/新建
      const src = side.array.find((x) => x.kind === "item" && x.type === e.type);
      if (src) src.amount = Math.round((src.amount + amount) * 10) / 10; else side.array.unshift({ ...e, amount, price: this.entryUnitPrice(e, sideIdx === SIDE_PARTNER), pic: undefined, amountText: undefined });
      // 库存反向同步
      if (sideIdx === SIDE_PLAYER) { this.addToPlayer(e, amount); this.removeFromPartner(e, amount); }
      else { this.removeFromPlayer(e, amount); this.addToPartner(e, amount); }
      this.syncLiquids();
    } else {
      // transport/slave/person：原对象放回源列表首位（运输对象实时移回源侧，载重恢复）
      if (e.kind === "transport") this.moveTransportObject(sideIdx === SIDE_PLAYER ? SIDE_PARTNER : SIDE_PLAYER, e.source);
      side.array.unshift({ ...e, amount: 1, price: this.entryUnitPrice(e, sideIdx === SIDE_PARTNER), pic: undefined, amountText: undefined });
    }
    e.amount = Math.round((e.amount - amount) * 10) / 10;
    if (e.amount <= 1e-9) {
      side.items.splice(idx, 1);
      if (e.pic && side.area) side.area.Content.removeChild(e.pic);
    }
    if (e.kind === "item") this.recalculateItemPrices();
    this.update();
  }

  // 库存同步原语
  private removeFromPlayer(e: TradeEntry, amt: number) {
    const c = this.gd.Caravans[0];
    if (e.itemData?.liquid) {
      c.takeLiquid(e.type, amt);
    } else if (e.itemData?.liquidsContainer) {
      // Cargo owns quantities; rebuild reconciles the remaining whole containers.
      // Never transfer a whole legacy bucket when selling only part of its bottles.
      c.removeCargo(e.type, amt);
    } else {
      c.removeCargo(e.type, amt);
    }
    // Caravan.reduceCargo removes the raw remainder below .05 after subtraction.
    // Do not normalize all inventory on entry: production keeps its precise raw value.
    if ((c.cargo.get(e.type) ?? 0) < 0.05 && !(c.inUse[e.type] > 0)) c.cargo.delete(e.type);
  }
  private addToPlayer(e: TradeEntry, amt: number) {
    const c = this.gd.Caravans[0];
    if (e.itemData?.liquid) {
      // 原版 TradeWindow.addToPartner→Caravan.addCargo(param4=true)：交易路径**不做**液体容量钳制
      // （钳制只发生在 takeItem 对 max 的预计算；recalculateItemPrices 回置物品时若再钳制，
      // 卖掉瓶子后容量变小 → 余水回置被拒却被从对方库存扣走 → 车队余水凭空消失）。
      // 原始加货：总量 cargo + 分配桶（container 缺省 → 散装 -1）。
      c.addCargo(e.type, amt);
      c.addLiquidsContainer(e.type, amt, null);
    } else {
      c.addCargo(e.type, amt);
    }
  }
  // 原版 reduceFromPartner L1447-1541 / addToPartner L1543-1611：
  // Town：shop is Object && shopType!=1 → 操作 shop.stock；否则（含 shopType==1 储藏库）→ town.stock
  // Array（playersStorage）：按 type 增减 {type,amount}
  private removeFromPartner(e: TradeEntry, amt: number) {
    if (this.partner instanceof Town) {
      const stock = this.shop && this.shopType !== 1 && this.shop.stock ? this.shop.stock : this.partner.stock;
      stock.set(e.type, itemAmount(stock.get(e.type) ?? 0, e.divisible));
      if (this.shop && this.shopType !== 1 && this.shop.stock) this.partner.removeFromStock(e.type, amt, this.shop.stock);
      else this.partner.removeFromStock(e.type, amt);
    } else if (Array.isArray(this.partner)) {
      const i = this.partner.findIndex((x) => x && x.type === e.type);
      if (i >= 0) {
        this.partner[i].amount = Math.round((itemAmount(this.partner[i].amount, e.divisible) - amt) * 10) / 10;
        if (this.partner[i].amount <= 1e-9) this.partner.splice(i, 1);
      }
    } else if (typeof this.partner?.cargo?.get === "function") {
      const cur = this.partner.cargo.get(e.type) ?? 0;
      if (cur - amt < 0.05) this.partner.cargo.delete(e.type); else this.partner.cargo.set(e.type, cur - amt);
    }
  }
  private addToPartner(e: TradeEntry, amt: number) {
    if (this.partner instanceof Town) {
      const stock = this.shop && this.shopType !== 1 && this.shop.stock ? this.shop.stock : this.partner.stock;
      stock.set(e.type, itemAmount(stock.get(e.type) ?? 0, e.divisible));
      if (this.shop && this.shopType !== 1 && this.shop.stock) this.partner.addToStock(e.type, amt, this.shop.stock);
      else this.partner.addToStock(e.type, amt);
    } else if (Array.isArray(this.partner)) {
      const i = this.partner.findIndex((x) => x && x.type === e.type);
      if (i >= 0) this.partner[i].amount = Math.round((itemAmount(this.partner[i].amount, e.divisible) + amt) * 10) / 10; else this.partner.push({ type: e.type, amount: amt });
    } else if (typeof this.partner?.cargo?.get === "function") {
      this.partner.cargo.set(e.type, (this.partner.cargo.get(e.type) ?? 0) + amt);
    }
  }

  // 液体分组一致性：web 的桶布局=容器id→[{type:液体,amount}]，与 cargo 总量是双写关系；
  // 交易每次改动玩家库存后从 cargo+容器重建分组（等价原版 arrangeLiquidsContainers 语义）——
  // 卖掉瓶子后容量变小、余水超容 → 超容部分落散装(-1)，由 maxLiquidAmount 负数触发灯泡提示，总量不丢。
  private syncLiquids() {
    const c = this.gd.Caravans[0];
    if (c && typeof c.rebuildLiquidsContainers === "function") c.rebuildLiquidsContainers();
  }

  // ---------- 价格重算（原版 recalculateItemPrices L1024-1083）★关键 ----------
  private recalculateItemPrices() {
    if (this.free) return;
    const sides = this.sides;
    // 1) 全部交易区物品还回库存
    for (const s of sides) {
      for (const e of s.items) {
        if (e.kind !== "item") continue;
        if (s === sides[SIDE_PLAYER]) { this.addToPlayer(e, e.amount); this.removeFromPartner(e, e.amount); }
        else { this.removeFromPlayer(e, e.amount); this.addToPartner(e, e.amount); }
      }
    }
    // 2) 按基础价+名称升序逐个定价（定价后再次移出库存，保证后续按剩余库存计价）
    for (let si = 0; si < 2; si++) {
      const s = sides[si];
      const sorted = s.items
        .filter((e) => e.kind === "item")
        .sort((a, b) => ((a.itemData?.price ?? 0) - (b.itemData?.price ?? 0)) || (a.name < b.name ? -1 : 1));
      for (const e of sorted) {
        e.price = this.calcItemPrice(e.type, e.amount, si === SIDE_PARTNER);
        if (si === SIDE_PLAYER) { this.removeFromPlayer(e, e.amount); this.addToPartner(e, e.amount); }
        else { this.addToPlayer(e, e.amount); this.removeFromPartner(e, e.amount); }
      }
    }
  }

  // ---------- 汇总显示（原版 update L490-653） ----------
  private update() {
    this.cursorPanel.invalidate(); // 操作后悬停面板内容失效，需重建
    const c = this.gd.Caravans[0];
    const p0 = this.totalPrice(this.sides[SIDE_PLAYER].items);
    const p1 = this.totalPrice(this.sides[SIDE_PARTNER].items);
    const w0 = this.totalWeight(this.sides[SIDE_PLAYER].items);
    const w1 = this.totalWeight(this.sides[SIDE_PARTNER].items);
    this.yourPrice.text = this.text(1347).toUpperCase() + ": " + this.fmtMoney(p0) + " €";
    this.yourWeight.text = this.text(1191).toUpperCase() + ": " + String(Math.round(w0)) + " " + this.text(12);
    this.partnerPrice.text = this.text(1347).toUpperCase() + ": " + this.fmtMoney(p1) + " €";
    this.partnerWeight.text = this.text(1191).toUpperCase() + ": " + String(Math.round(w1)) + " " + this.text(12);
    // 差额 + 箭头（原版 L615-648：moneyText.x=440-_loc10_/2+20；arrow.x=440-_loc10_/2+width/2；rotation 0/90/180；crossMoney y=237 白1px 动态 x/textWidth）
    const diff = p1 - p0;
    this.moneyText.text = this.fmtMoney(Math.abs(diff)) + " €";
    this.moneyArrow.rotation = Math.abs(diff) < 0.005 ? 90 : diff > 0 ? 0 : 180;
    const tw = (this.moneyText as any).textWidth ?? this.moneyText.text.length * 9;
    this.moneyText.x = 440 - (tw + 20) / 2 + 20;
    // 原版 moneyDirection.x = 440 - _loc10_/2 + width/2；箭头形状水平跨度 7（-7..+7）→ width=14
    this.moneyArrow.x = 440 - (tw + 20) / 2 + 14 / 2;
    const partnerMoney = !this.free ? (this.partner instanceof Town ? this.partner.money : (this.partner?.money ?? 0)) : Infinity;
    // 原版 L644：玩家净付金额 > 玩家资金 → 交易额画删除线（diff = partner - player，diff>0 = 玩家付钱）
    this.crossMoney.visible = !this.free && diff > 0 && diff > c.money;
    if (this.crossMoney.visible) {
      this.crossMoney.x = this.moneyText.x;
      const cg = new Graphics();
      cg.lineStyle(1, 16777215);
      cg.moveTo(0, 0); cg.lineTo(tw, 0);
      this.crossMoney.graphics = cg;
    }
    // 灯泡
    // free 模式（储藏/缴获）：右上 bulb0/文字0 与左下 bulb3/文字3 隐藏（原版 L298）
    this.bulbs[0].visible = !this.free && diff > c.money;
    this.bulbs[1].visible = c.totalCargo - c.maxCargo > 0.05;
    this.bulbs[2].visible = this.liquidProblem(c);
    this.bulbs[3].visible = !this.free && p0 - p1 > partnerMoney && p0 - p1 > 0;
    this.bulbs[4].visible = false;
    this.bulbs[5].visible = !!(this.partner && !(this.partner instanceof Town)) && this.liquidProblem(this.partner);
    // 灯泡文字/底座可见性（原版 setPartner L298：free 时隐藏 bulb0/3 及其文字/底座）
    if (this.bulbTexts.length === 6) {
      this.bulbTexts[0].visible = this.bulbTexts[3].visible = !this.free;
      if (this.bulbBases && this.bulbBases.length === 6) {
        this.bulbBases[0].visible = this.bulbBases[3].visible = !this.free;
      }
    }
    // 交易区网格重排（双区重建）
    for (const side of this.sides) {
      if (!side.area) continue;
      const savedAreaScroll = side.area.scroll;
      side.area.clearAll();
      side.items.forEach((e, i) => {
        if (!e.pic) return;
        e.pic.x = 10 + (i % 10) * 60;
        e.pic.y = 10 + Math.floor(i / 10) * 60;
        if (e.amountText) e.amountText.text = this.fmtItemAmount(e.amount);
        side.area!.addContent(e.pic);
      });
      side.area.scroll = savedAreaScroll;
    }
    // 源列表刷新
    this.rebuildSourceList(SIDE_PLAYER);
    this.rebuildSourceList(SIDE_PARTNER);
    // 底部（原版 updateBottomLine：capacity 左、date 右、money 动态居中于两者之间）
    this.bottomCapacity.text = this.text(903).toUpperCase() + ": " + String(Math.round(c.totalCargo)) + "/" + String(Math.round(c.maxCargo)) + " " + this.text(12);
    this.bottomMoney.text = this.text(20).toUpperCase() + ": " + numberFormat(c.money, 2);
    const d = this.gd.makeDate();
    // 月份用本地化文本（37-48 = 一月~十二月；英文环境回退 Jan~Dec），对齐原版 12-七月-80 21:24
    const monthName = this.text(36 + (d.Month ?? 1)) || String(d.ShortMonthName);
    this.bottomDate.text = String(d.Day2d) + "-" + monthName + "-" + String(d.Year2d) + " " + String(d.Hour2d) + ":" + String(d.Minute2d);
    const capW = (this.bottomCapacity as any).textWidth ?? this.bottomCapacity.text.length * 8;
    const dateW = (this.bottomDate as any).textWidth ?? this.bottomDate.text.length * 8;
    const moneyW = (this.bottomMoney as any).textWidth ?? this.bottomMoney.text.length * 8;
    const mid = 860 - capW - dateW;
    this.bottomMoney.x = 10 + capW + mid / 2 - moneyW / 2;
  }

  private liquidProblem(c: any): boolean {
    for (const [id] of c.cargo ?? []) {
      const def = getItemData(this.ds, id);
      if (def && def.liquid && typeof c.maxLiquidAmount === "function" && c.maxLiquidAmount(id) < -0.001) return true;
    }
    return false;
  }

  private rebuildSourceList(sideIdx: number) {
    const side = this.sides[sideIdx];
    if (!side.list) return;
    const savedScroll = side.list.scroll;
    side.list.clearAll();
    const w = sideIdx === SIDE_PLAYER ? 118 : 112;
    if (sideIdx === SIDE_PLAYER) {
      // 玩家源列表：原版 List.as —— listSize=100 → pic 以 250×250 卡片绘制后整体 scale=(100-30)/250=0.28 → 70×70
      // 行距 = listSize-20 = 80（pic.y = 10 + idx*80）；图标居中、数量右下（原版 amount 40px @ y195 缩放后 ~11px）
      const LS = 100;
      const CELL = 250;
      const SC = (LS - 30) / CELL; // 0.28
      const PITCH = LS - 20;       // 80
      let cellN = 0;
      for (const e of this.sourceRows(sideIdx)) {
        const cell = new Sprite();
        cell.x = 10; cell.y = 10 + cellN * PITCH;
        // 圆角卡片底（原版 _loc15_：picBGColor=0x585450 @0.8 + 4×10px 圆角），随后整体 scale 0.28
        const cg = new Graphics();
        drawItemCellBG(cg, 10); // t100：公共灰框（原版 picBGColor=0x585450 a0.8 250 母格）
        cg.hitRect(0, 0, CELL, CELL);
        cell.graphics = cg;
        const realId = e.kind === "item" ? e.type : (e.kind === "transport" ? e.type - 10000 : -1);
        const hasIcon = realId > 0 && !!this.ds.items.Items[realId];
        if (e.kind === "transport") {
          // 原版 TransportUnit.picture = transportIcon{type}.png（ImportedBitmap，平滑）——运输行画运输贴图，不画物品图标
          this.attachTransportIcon(cell, e.type - 10000, CELL, e.source);
        } else if (e.kind === "slave" || e.kind === "person") {
          this.attachCharacterIcon(cell, e.source, CELL);
        } else if (hasIcon) {
          attachItemIcon(this.assets, this.ds, cell, realId, { size: CELL, center: true });
        }
        // 右下角数量（原版 amount：right 对齐，x=10 y=195 宽 230，font=40，alpha 0.8；cat1 纯数字、其他 'x' 前缀）
        const amt = new EngineText("", 16777215, 40, "right", 10, CELL - 55, 230, 60);
        amt.alpha = 0.8;
        const isCat1 = e.kind === "item" && !!this.ds.items.Items[e.type] && this.ds.items.Items[e.type].category === 1;
        const prefix = e.kind === "item" && !isCat1 ? "x" : "";
        amt.text = prefix + (e.kind === "item" ? this.fmtItemAmount(e.amount) : "1");
        amt.visible = e.kind !== "slave" && e.kind !== "person";
        cell.addChild(amt);
        cell.scaleX = cell.scaleY = SC;
        (cell as any).height = CELL * SC; // 列表行视觉高 70（updateSize 测量用：防滚动到底末行只露一半）
        cell.addEventListener("click", () => { sfxClick(); this.takeItem(sideIdx, e); });
        side.list!.addContent(cell);
        cellN++;
      }
      side.list!.updateSize();
      side.list!.scroll = savedScroll; // 保留滚动位置（Q2）
      return;
    }
    // 对方源列表：原版 List.as —— 与玩家侧同为 listSize=100 → 70×70 图标卡片（图标 + 右下数量 xN）
    const LS = 100, CELL = 250, SC = (LS - 30) / CELL, PITCH = LS - 20;
    this.sourceRows(sideIdx).forEach((e, idx) => {
      const cell = new Sprite();
      cell.x = 10; cell.y = 10 + idx * PITCH;
      const g = new Graphics();
      drawItemCellBG(g, 10); // t100：公共灰框（原版 picBGColor=0x585450 a0.8 250 母格）
      g.hitRect(0, 0, CELL, CELL);
      cell.graphics = g;
      const realId = e.kind === "item" ? e.type : (e.kind === "transport" ? e.type - 10000 : -1);
      if (e.kind === "transport") {
        this.attachTransportIcon(cell, e.type - 10000, CELL, e.source);
      } else if (e.kind === "slave" || e.kind === "person") {
        this.attachCharacterIcon(cell, e.source, CELL);
      } else if (realId > 0 && !!this.ds.items.Items[realId]) {
        attachItemIcon(this.assets, this.ds, cell, realId, { size: CELL, center: true });
      }
      // 右下数量（xN 前缀，同原版 L636-663；font 40 → 缩放 ~11px）
      const amt = new EngineText("", 16777215, 40, "right", 10, CELL - 55, 230, 60);
      amt.alpha = 0.8;
      const isCat1 = e.kind === "item" && this.ds.items.Items[e.type]?.category === 1;
      const prefix = e.kind === "item" && !isCat1 ? "x" : "";
       amt.text = prefix + (e.kind === "item" ? this.fmtItemAmount(e.amount) : "1");
      amt.visible = e.kind !== "slave" && e.kind !== "person";
      cell.addChild(amt);
      cell.scaleX = cell.scaleY = SC;
      (cell as any).height = CELL * SC; // 列表行视觉高 70（updateSize 测量用：防滚动到底末行只露一半）
      cell.addEventListener("click", () => { sfxClick(); this.takeItem(sideIdx, e); });
      side.list!.addContent(cell);
    });
    side.list.updateSize();
    side.list.scroll = savedScroll; // 保留滚动位置（Q2）
  }

  // ---------- 12 类筛选（原版 List.as L282-415：switchFilter 切换 / doubleClickFilter solo；样式同商队选单货物页） ----------
  private toggleCargoFilter(group: string, on: boolean) {
    this.cargoFilters[group] = on;
    this.update();
  }
  private soloCargoFilter(group: string) {
    for (const k of Object.keys(this.cargoFilters)) this.cargoFilters[k] = k === group;
    this.update();
  }
  // 筛选图标（原版 filtericon{组名}，tools→filtericonmechanicalshop；缺失组用组内首物品小图标）
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
    // 兜底：优先返回纯图形占位（不放文本），避免 attachItemIcon 的 "ITEM 0" 文本混入筛选格
    return this.emptyFilterIcon();
  }
  // 筛选图标兜底：纯图形小方格（不显示物品名文本，避免 ITEM 0 占位）
  private emptyFilterIcon(): Sprite {
    const s = new Sprite();
    const fg = new Graphics();
    fg.beginFill(16777215, 0.9);
    fg.drawRect(0, 0, 12, 12);
    s.graphics = fg;
    s.mouseEnabled = false;
    return s;
  }
  // 列表分组（原版 List.as L376-415：2武器/4弹药/3护甲/5附件/cat1 按 Goods 细分）
  private cargoGroupOf(id: number): string {
    const it = this.ds.items.Items[id];
    if (!it) return "miscellaneous";
    if (it.category === 2) return "weapons";
    if (it.category === 3) return "ammo";
    if (it.category === 4) return "attachments";
    if (it.category === 5) return "armor";
    if (it.category === 1) {
      const g = this.ds.items.Goods[it.subCategory];
      if (!g) return "miscellaneous";
      if (g.firstAidKit) return "firstaid";
      if (g.food) return "food";
      if (g.liquid) return "liquids";
      if (g.liquidsContainer) return "liquidscontainers";
      if (g.device) return "devices";
      if (g.tool) return "tools";
      if (g.market) return "market";
      return "miscellaneous";
    }
    return "miscellaneous";
  }


  // ---------- Q1 修复：源列表按原版 List.as 分组顺序渲染 ----------
  // 原版 List.update 外层遍历 _loc12_ 分组（市场/食物/液体/液体容器/装置/工具/杂项/武器/弹药/附件/护甲/医疗/动物/货车/载具/奴隶），
  // 组内保持 array 顺序。web 此前直接按 array 顺序渲染 → 退还的物品 unshift 到数组头 = 列表绝对顶部；
  // 分组后只出现在其所属分组顶部（与原版一致）。
  private static readonly SOURCE_GROUPS = [
    "market", "food", "liquids", "liquidscontainers", "devices", "tools", "miscellaneous",
    "weapons", "ammo", "attachments", "armor", "firstaid",
    "animals", "carts", "cars", "slaves",
  ];

  private sourceGroupOf(e: TradeEntry): string {
    if (e.kind === "item") return this.cargoGroupOf(e.type);
    if (e.kind === "transport") {
      const tr = e.source;
      const cat = tr && tr.category !== undefined ? tr.category : (this.ds.transports?.Types?.[e.type - 10000]?.category ?? 1);
      return cat === 2 ? "carts" : cat === 3 ? "cars" : "animals";
    }
    return "slaves"; // slave（买）/ person（卖人）同组（原版 Character category 4=slaves、>=5=other，web 简化为 slaves）
  }

  /** 源列表显示顺序：分组顺序 + 组内 array 顺序（应用玩家侧筛选） */
  private sourceRows(sideIdx: number): TradeEntry[] {
    const side = this.sides[sideIdx];
    const out: TradeEntry[] = [];
    for (const g of TradeWindow.SOURCE_GROUPS) {
      for (const e of side.array) {
        if (e.kind === "item" && !this.cargoFilters[this.cargoGroupOf(e.type)]) continue; // 筛选关闭 → 隐藏
        if (this.sourceGroupOf(e) === g) out.push(e);
      }
    }
    return out;
  }

  private showProblem(msg: string) {
    this.problemText.text = msg;
    if (this.problemDisplay) this.problemDisplay.visible = true;
    this.problemCounter = 50;
  }

  // ---------- 悬停信息面板（原版 cursorControl L1840-2170） ----------
  // 物品属性对（原版 Item.getInfoPairs，与 CaravanMenu.cargoInfoPairs 同源移植）
  private infoPairs(id: number): Array<{ name: string; value?: string; multiline?: boolean }> {
    return itemInfoPairs(this.ds, this.gd.Caravans[0], id);
  }

  // 原版 TransportUnit.getInfoPairs（L1421-1584）：动物/货车/载具属性行（TradeWindow.cursorControl 对 Item 与 TransportUnit 都调 getInfoPairs）
  private transportInfoPairs(tr: any): Array<{ name: string; value?: string; multiline?: boolean }> {
    const t = this.ds.transports?.Types?.[tr.type] ?? {};
    const cat = typeof tr.category === "number" ? tr.category : (t.category ?? 1);
    const out: Array<{ name: string; value?: string; multiline?: boolean }> = [];
    const push = (name: string, value?: string, multiline = false) => out.push({ name, value, multiline });
    const round = (v: number) => Math.round(v);
    const nf1 = (v: number) => this.nf(v, 1, true);
    // 原版 category==1 → Texts 50 生命；否则 Texts 1153（机械妥善率）——name/value 一对，单行显示
    push((cat === 1 ? this.text(50) : this.text(1153)).toUpperCase(), String(round(tr.health ?? 0)) + "/" + String(round(tr.maxHealth ?? 0)));
    if (cat === 1) {
      // 性别（2875 雄性 / 2876 雌性）
      push(this.text(1527).toUpperCase(), (tr.gender === 1 ? this.text(2875) : this.text(2876)).toUpperCase());
      // 年龄：floor(age/30) 月；<12 → "N 月"；否则 "X 年 Y 月"（Texts.abbreviation：zh 全词，EN 首字母）
      const months = Math.floor((tr.age ?? 0) / 30);
      let ageStr: string;
      if (months < 12) {
        ageStr = months + " " + this.text(1167).toUpperCase();
      } else {
        const y = Math.floor(months / 12), m = months % 12;
        const abbrY = (this.ds.language === 18 || this.ds.language === 19 || this.ds.language === 20 || this.ds.language === 30)
          ? this.text(1168) : (this.text(1168).toUpperCase().split(" ").map((s) => s.charAt(0)).join("") || "Y");
        const abbrM = (this.ds.language === 18 || this.ds.language === 19 || this.ds.language === 20 || this.ds.language === 30)
          ? this.text(1167) : (this.text(1167).toUpperCase().split(" ").map((s) => s.charAt(0)).join("") || "M");
        ageStr = y + " " + abbrY.toUpperCase() + " " + m + " " + abbrM.toUpperCase();
      }
      push(this.text(1166).toUpperCase(), ageStr);
      // 重量（NumberFormat(weight,0) + kg）
      push(this.text(996).toUpperCase(), this.nf(tr.weight ?? 0, 0) + " " + this.text(12));
    }
    // 最大负重（capacity）
    push(this.text(1155).toUpperCase(), String(Math.round(tr.capacity ?? 0)));
    // 乘客
    push(this.text(899).toUpperCase(), String(tr.maxPassengers ?? 0));
    // 速度（category!=2；windPowered → speed×100%）
    if (cat !== 2) {
      if (tr.windPowered) push(this.text(6).toUpperCase(), nf1((tr.speed ?? 0) * 100) + "%");
      else push(this.text(6).toUpperCase(), nf1(tr.speed ?? 0));
    }
    if (cat === 1) {
      // 年龄期 1（幼崽）→ 乳品消耗；否则 饲料消耗 + 日饮水配给量
      if ((tr.agePeriod ?? 0) === 1) {
        push(this.text(1173).toUpperCase(), nf1(tr.milkConsumption ?? 0));
      } else {
        push(this.text(1156).toUpperCase(), nf1(tr.forageConsumption ?? 0));
        push(this.text(1137).toUpperCase(), nf1(tr.waterConsumption ?? 0));
      }
      // 产出（produces 数组 + 奶产出项）
      const prod = Array.isArray(tr.production) ? tr.production : [];
      if (prod.length > 0) {
        push(this.text(1241).toUpperCase());
        for (let i = 0; i < prod.length; i++) {
          const p = prod[i];
          const nm = p && p.item ? itemName(this.ds, p.item).toUpperCase() : "?";
          push(nm, nf1(p.amount ?? 0));
        }
      }
    }
    if (cat === 2) {
      // 货车：容量倍数 + 重量
      push(this.text(1161).toUpperCase(), String(tr.multiplication ?? 1));
      push(this.text(996).toUpperCase(), this.nf(tr.weight ?? 0, 0) + " " + this.text(12));
    }
    if (cat === 3) {
      // 载具：windPowered → 风力加速；否则 燃油消耗 + 燃油容量
      if (tr.windPowered) push(this.text(6379).toUpperCase());
      else {
        push(this.text(1162).toUpperCase(), nf1(tr.fuelConsumption ?? 0));
        push(this.text(1237).toUpperCase(), nf1(tr.fuelTank ?? 0));
      }
    }
    return out;
  }

  // 原版 NumberFormat 工具（保留小数/千分位）
  private nf(v: number, dec = 2, trim = false): string {
    const sign = v < 0 ? "-" : "";
    let s = String(Math.abs(Math.round(Math.pow(10, dec) * v)));
    let intPart: string, decPart = "";
    if (dec > 0) {
      while (s.length < dec + 1) s = "0" + s;
      intPart = s.substring(0, s.length - dec);
      decPart = s.substring(s.length - dec);
    } else intPart = s;
    let out = "";
    for (let i = 1; i <= intPart.length; i++) {
      out = intPart.charAt(intPart.length - i) + out;
      if (i % 3 === 0 && i < intPart.length) out = "," + out;
    }
    if (dec > 0) out = out + "." + decPart;
    if (trim && dec > 0) {
      let rem = 0;
      while (out.charAt(out.length - 1) === "0" && rem <= dec) { out = out.substring(0, out.length - 1); rem++; }
      if (out.charAt(out.length - 1) === ".") out = out.substring(0, out.length - 1);
    }
    return sign + out;
  }

  // 原版 cursorControl：每帧计算悬停行 → 拼面板文本行（EngineText 列表）→ 量宽高 → 画浅黄底深棕边框 → 跟随鼠标
  private updateCursorInfo() {
    // 原版 cursorControl 开头：problemDisplay 渐隐（counter 50 → alpha=counter/25，>25 时全不透明）
    if (this.problemDisplay) {
      if (this.problemCounter > 0) {
        this.problemDisplay.visible = true;
        this.problemDisplay.alpha = this.problemCounter > 25 ? 1 : this.problemCounter / 25;
        this.problemCounter--;
      } else {
        this.problemDisplay.visible = false;
      }
    }
    const mx = Input.mouseX, my = Input.mouseY;
    let entry: TradeEntry | null = null;
    let isArea = false, sideIdx = 0, slotIdx = 0;
    // 1) 源列表（玩家左 10..100 / 对方右 770..880）：行号 = floor((Content.mouseY-10)/80)，行高 80（含 10 边距）
    for (let si = 0; si < 2; si++) {
      const lst = this.sides[si].list;
      if (!lst) continue;
      const lx = lst.x, ly = lst.y, lw = (lst as any).w, lh = (lst as any).h;
      if (mx >= lx + 10 && mx <= lx + lw - 10 && my >= ly && my <= ly + lh) {
        const cy = my - ly - lst.Content.y;
        const row = Math.floor((cy - 10) / 80);
        if (row >= 0) {
          const rows = this.sourceRows(si);
          if (row < rows.length) { entry = rows[row]; sideIdx = si; break; }
        }
      }
    }
    // 2) 交易区（上区 131,83 608x128；下区 131,263）：格号 = floor((mx-10)/60) + floor((my-10)/60)*10，格 60x60 内 50 有效
    if (!entry) {
      for (let si = 0; si < 2; si++) {
        const ar = this.sides[si].area;
        if (!ar) continue;
        const ax = ar.x, ay = ar.y, aw = (ar as any).w, ah = (ar as any).h;
        if (mx >= ax + 10 && mx <= ax + aw - 10 && my >= ay && my <= ay + ah) {
          const cx = mx - ax - ar.Content.x, cy = my - ay - ar.Content.y;
          const col = Math.floor((cx - 10) / 60), row = Math.floor((cy - 10) / 60);
          const idx = col + row * 10;
          if ((cx - 10) % 60 <= 50 && (cy - 10) % 60 <= 50 && idx >= 0 && idx < this.sides[si].items.length) {
            entry = this.sides[si].items[idx];
            isArea = true; sideIdx = si; slotIdx = idx;
            break;
          }
        }
      }
    }
    if (!entry) { this.cursorPanel.hide(); return; }
    // t102：组装 CursorRow[]，渲染/位置/渐显/键缓存交给公共 CursorInfoPanel（与装备页共用，样式原版 cursorInfo 浅黄底）
    const rows: CursorRow[] = [];
    const isItem = entry.kind === "item";
    rows.push({ text: entry.name.toUpperCase(), center: true, font: 14, dy: 20 });
    // 价格行（源列表：预估价格；交易区：总价值 + 每单位价格）
    if (!this.free && !isArea) {
      const price = this.entryUnitPrice(entry, sideIdx === SIDE_PARTNER);
      rows.push({ text: this.text(1157).toUpperCase() + ": " + this.nf(price, 2) + " €", center: true });
    } else if (!this.free && isArea) {
      const total = entry.price;
      const per = total / Math.max(entry.amount, 1);
      rows.push({ text: this.text(1347).toUpperCase() + ": " + this.nf(total, 2) + " €", value: this.text(1192).toUpperCase() + ": " + this.nf(per, 2) + " €" });
    }
    // 平均价（源列表玩家侧买入均价，原版 6806）
    if (!this.free && !isArea && sideIdx === SIDE_PLAYER && isItem) {
      const avg = this.gd.Caravans[0].averagePrice[entry.type];
      if (avg !== undefined) rows.push({ text: this.text(6806).toUpperCase() + ": " + this.nf(avg, 2) + " €", center: true });
    }
    // 重量行（左 总重量 / 右 每单位重量；仅物品——运输/奴隶在交易区不显示重量行）
    if (isArea && isItem) {
      const totalW = entry.weight * entry.amount;
      rows.push({ text: this.text(1191).toUpperCase() + ": " + this.nf(totalW, 1, true) + " " + this.text(12), value: this.text(1190).toUpperCase() + ": " + this.nf(entry.weight, 3, true) + " " + this.text(12), dy: 25 });
    } else if (isItem) {
      rows.push({ text: this.text(1190).toUpperCase() + ": " + this.nf(entry.weight, 3, true) + " " + this.text(12), center: true, dy: 25 });
    }
    // 属性对（原版 getInfoPairs(true)，跳过 name/weight/type/blank；运输单位走 transportInfoPairs）
    if (isItem) {
      const pairs = this.infoPairs(entry.type);
      for (let pi = 0; pi < pairs.length; pi++) {
        const p = pairs[pi];
        if (pi === 0) continue; // 第一项恒为 itemName（标题行已显示）
        const keyLower = p.name.toLowerCase();
        if (keyLower === "name") continue;
        const skip = ["weight", "type", "blank"];
        if (skip.includes(keyLower)) continue;
        if (p.value !== undefined) rows.push({ text: p.name, value: p.value });
        else if (p.multiline) rows.push({ text: p.name, multiline: true });
        else rows.push({ text: p.name, center: true });
      }
    } else if (entry.kind === "transport" || entry.kind === "slave" || entry.kind === "person") {
      const pairs = entry.kind === "transport" ? this.transportInfoPairs(entry.source) : this.characterInfoPairs(entry.source);
      for (let pi = 0; pi < pairs.length; pi++) {
        const p = pairs[pi];
        if (p.value !== undefined) rows.push({ text: p.name, value: p.value });
        else rows.push({ text: p.name, center: true });
      }
    }
    // 交易区尾部提示（原版 _loc6_ = Texts 1091 "点击移除"，前面 yCursor+=8）
    if (isArea) {
      const last = rows[rows.length - 1];
      if (last) last.dy = (last.dy ?? 17) + 8;
      rows.push({ text: this.text(1091).toUpperCase(), center: true, dy: 0 });
    }
    this.cursorPanel.update(mx, my, this.calcPanel.ov.visible ? null : rows);
  }

  // ---------- Calculator ----------
  // t99：计算器 UI/按键/指示灯已抽为公共组件 core/CalculatorPanel.ts（原版 IsoEngine/Calculator.as 移植）。
  // 本窗口在构造时创建 calcPanel 实例；打开/关闭见调用点 calcPanel.open(...)（原 openCalculator）。

  // ---------- 消息/确认对话框（统一 YesNoDialogue：消息=单按钮 OK，确认=是/否） ----------
  private msgDlg: YesNoDialogue | null = null;   // 单按钮（OK）
  private confirmDlg: YesNoDialogue | null = null; // 双按钮（是/否）
  private dialog(text: string, onOk: (() => void) | null, onCancel: (() => void) | null = null) {
    const twoBtn = !!(onOk || onCancel);
    const d = twoBtn
      ? (this.confirmDlg ?? (this.confirmDlg = new YesNoDialogue(this.ds, this.assets, false)))
      : (this.msgDlg ?? (this.msgDlg = new YesNoDialogue(this.ds, this.assets, true)));
    // show() 可能重建/清空本屏 → 重新挂载
    if (d.parent !== this.screen) this.screen.addChild(d);
    d.visible = false;
    d.show(text, onOk ?? undefined, onCancel ?? undefined);
  }

  // ---------- 成交（原版 doBarter L2268-2390 / finishBarter L2391-2513） ----------
  private doBarter(skipOverweight = false) {
    const c = this.gd.Caravans[0];
    const items0 = this.sides[SIDE_PLAYER].items;
    const items1 = this.sides[SIDE_PARTNER].items;
    if (items0.length === 0 && items1.length === 0) return;
    const moneyDiff = this.totalPrice(items1) - this.totalPrice(items0);
    if (!this.free && moneyDiff > 0 && moneyDiff > c.money) {
      this.dialog(this.text(1350).replace("@money@", this.fmtMoney(moneyDiff - c.money) + " €").toUpperCase(), null);
      return;
    }
    if (Array.isArray(this.partner) && this.setLimit != null) {
      const used = this.partner.reduce((n, e) => n + itemWeightKg(this.ds, e.type) * e.amount, 0);
      if (used > this.setLimit + 0.05) {
        this.dialog(this.text(1352).replace("@number@", this.fmt(used - this.setLimit)).toUpperCase(), null);
        return;
      }
    }
    for (const [car, message] of [[c, 1351], [this.partner, 1353]] as const) {
      if (!car || typeof car.maxLiquidAmount !== "function") continue;
      const problematic = [...car.cargo.keys()].filter((id: number) => getItemData(this.ds, id)?.liquid && car.maxLiquidAmount(id) < -1e-9);
      if (problematic.length) {
        this.dialog(this.text(message).replace("@liquids@", problematic.map((id: number) => itemName(this.ds, id)).join(", ")).toUpperCase(), null);
        return;
      }
    }
    const cargoDiff = c.maxCargo - c.totalCargo;
    if (cargoDiff < -0.05 && !skipOverweight) {
      this.dialog(this.text(1349).replace("@number@", this.fmt(Math.abs(cargoDiff))).toUpperCase(), () => this.doBarter(true));
      return;
    }
    const partnerMoney = !this.free ? (this.partner instanceof Town ? this.partner.money : (this.partner?.money ?? 0)) : Infinity;
    if (!this.free && moneyDiff < 0 && Math.abs(moneyDiff) > partnerMoney) {
      this.dialog(this.text(1354).replace("@money@", this.fmtMoney(Math.max(partnerMoney, 0)) + " €").replace("@disadvantage@", this.fmtMoney(Math.abs(moneyDiff) - Math.max(partnerMoney, 0)) + " €").toUpperCase(), () => this.finishBarter());
      return;
    }
    this.finishBarter();
  }

  private finishBarter() {
    if (!this.sides.some(s => s.items.length > 0)) return;
    const c = this.gd.Caravans[0];
    // 成交音效（原版 L2399-2402：soundFXOn && !free → new SFXCashRegister().play()）
    if (!this.free) sfxCashRegister();
    const items0 = this.sides[SIDE_PLAYER].items;
    const items1 = this.sides[SIDE_PARTNER].items;
    if (!this.free) {
      const diff = this.totalPrice(items1) - this.totalPrice(items0);
      if (this.shop) {
        // shop 情形：店铺资金结算 + 城镇税收
        (this.partner as Town).money = Math.max(0, (this.partner as Town).money + diff);
        (this.partner as Town).money += Math.abs(diff) * ((this.partner as Town).tax ?? 0);
      } else {
        this.partner.money = Math.max(0, (this.partner?.money ?? 0) + diff);
      }
      c.money = Math.max(0, c.money - diff);
      // 已知价格 + 买入均价
      if (this.partner instanceof Town) {
        for (const e of items0) if (e.kind === "item") this.gd.addKnownPrice(e.type, this.partner, this.shop, e.price / e.amount, false);
        for (const e of items1) {
          if (e.kind !== "item") continue;
          const per = e.price / e.amount;
          this.gd.addKnownPrice(e.type, this.partner, this.shop, per, true);
          const have = c.cargoAmount(e.type);
          if (have > 0) {
            const prevAmt = have - e.amount;
            const prevAvg = c.averagePrice[e.type];
            c.averagePrice[e.type] = prevAvg === undefined ? per : ((prevAmt * prevAvg + e.amount * per) / have);
          }
        }
      }
    }
    // 买奴 / 卖人 / 买运输 / 卖运输
    for (const e of items1) {
      if (e.kind === "slave") {
        const s = e.source;
        const loc = this.shop;
        if (loc && Array.isArray(loc.slaves)) {
          const i = loc.slaves.indexOf(s);
          if (i >= 0) loc.slaves.splice(i, 1);
        } else if (this.partner && Array.isArray(this.partner.slaves)) {
          // NPC 奴隶商：从车上移除并扣减 slavesHeld
          const i = this.partner.slaves.indexOf(s);
          if (i >= 0) this.partner.slaves.splice(i, 1);
          if (typeof this.partner.slavesHeld === "number") this.partner.slavesHeld = Math.max(0, this.partner.slavesHeld - 1);
        }
        if (!c.People.includes(s)) {
          s.faction = 0;
          s.morale = Math.round(5 + Math.random() * 10);
          c.addPerson(s);
        }
        this.gd.enslaveAPerson(s);
      } else if (e.kind === "transport") {
        // 对象已在 doMove 实时加入车队 → 不再新建（原版 finishBarter 只结算资金，运输对象早已 addTransport）
        if (!c.transports.includes(e.source)) c.buyTransport(e.type - 10000, this.ds);
      }
    }
    for (const e of items0) {
      if (e.kind === "person") {
        const p = e.source;
        // t-调试：打印卖人对象身份
        c.People = c.People.filter((x) => x !== p);
        const loc = this.shop;
        if (loc && Array.isArray(loc.slaves)) {
          p.faction = 0;
          p.enslavedAt = this.gd.Time;
          loc.slaves.push(p);
        } else if (this.partner && this.partner.slavers) {
          // NPC 奴隶商：卖人上车
          if (!Array.isArray(this.partner.slaves)) this.partner.slaves = [];
          p.faction = 0;
          p.enslavedAt = this.gd.Time;
          this.partner.slaves.push(p);
          this.partner.slavesHeld = (this.partner.slavesHeld ?? 0) + 1;
        }
      } else if (e.kind === "transport") {
        // 对象已在 doMove 实时移出车队（按对象引用删除，避免误删同类型其它动物）
        const i = c.transports.indexOf(e.source);
        if (i >= 0) c.transports.splice(i, 1);
        c.updateSpeed();
      }
    }
    // 走私检测
    if (this.partner instanceof Town) {
      let illegal = 0;
      for (const e of items0) {
        if (e.kind === "item" && this.partner.bannedGoods.includes(e.type)) illegal += e.weight * e.amount;
      }
      if (illegal > 0) {
        this.partner.illegalActions.push({ action: 2, amount: illegal, smugglingSkill: c.smugglingSkill() });
        c.distributeExperience("smugglingSkill", "smugglingExperience", illegal / 2);
      }
    }
    // 清空交易区
    for (const s of this.sides) s.items = [];
    // 货币物品（type 97）自动兑现
    const cash97 = (car: any) => {
      const amt = typeof car.cargoAmount === "function" ? car.cargoAmount(97) : (car.cargo?.get?.(97) ?? 0);
      if (amt > 0) {
        car.money = (car.money ?? 0) + amt;
        if (typeof car.removeCargo === "function") car.removeCargo(97, amt); else car.cargo.delete(97);
      }
    };
    cash97(c);
    if (!this.free && this.partner && !(this.partner instanceof Town)) cash97(this.partner);
    this.syncLiquids();
    // 重建界面
    this.prepare();
    this.update();
  }

  // ---------- Take All / Clear / 退出 ----------
  private takeAll() {
    const side = this.sides[SIDE_PARTNER];
    const copy = [...side.array];
    // 原版 takeAll（TradeWindow.as L2514-2534）：无条件整批把对方列表全部商品移入交易区，
    // **不做** 资金/载重/容器钳制——钱不够/超重/没容器都属于结算阶段（doBarter→finishBarter）
    // 由"成交"按钮的确认链去提示/阻止；点"全"的意义就是"先把想要的都放上桌"。
    // 此前按可买上限逐行钳制并弹 1346/1273/1020 problem 的做法不符合原版，导致"全"看起来没生效。
    for (const e of copy) {
      if (e.kind === "item") this.doMove(SIDE_PARTNER, e, e.amount, true);
      else this.doMove(SIDE_PARTNER, e, 1, true);
    }
    this.syncLiquids();
    if (!this.free) this.recalculateItemPrices();
    this.update();
  }
  private pressClear() {
    for (let si = 0; si < 2; si++) {
      const side = this.sides[si];
      const copy = [...side.items];
      for (let i = 0; i < copy.length; i++) {
        const idx = side.items.indexOf(copy[i]);
        if (idx >= 0) this.returnItem(si, idx, copy[i].amount);
      }
    }
  }

  private exit() {
    const has = this.sides[0].items.length + this.sides[1].items.length;
    if (has > 0) {
      this.dialog(this.text(1383) || "There are objects in the barter area...", () => { this.pressClear(); this.doClose(); }, () => { /* 取消 */ });
    } else {
      this.doClose();
    }
  }
  // 关闭：缴获模式走 lootClose（战斗结算），否则走常规 onClose
  private doClose() {
    if (this.lootClose) { const fn = this.lootClose; this.lootClose = null; fn(); }
    else this.onClose();
  }

  // ---------- 布局（原版构造 L90-260，坐标 §2） ----------
  private build() {
    const S = this.screen;
    S.removeAll();
    // 原版 D = new Dialogue(880,495)：无黑色基底！InterfaceBackground 纹理全不透明铺底 + screen 高光/multiply 阴影边框
    // （t99：去掉 beginFill(0,0.9) 黑底——原版 Dialogue 基底就是羊皮纸纹理，黑底导致整体过暗、筛选钮/底栏黑字看不清）
    addDialogueBackground(S, this.assets, 0, 0, 880, 495, 0, "InterfaceBackground.png", false);
    // 原版白线网格（TradeWindow.as 构造 L105-134，lineStyle(1,16777215)）：
    // 底部分隔线 + 按钮外框 + 连接线 + 头像框/伙伴符号框 + 上下交易区框
    const grid = new Graphics();
    grid.lineStyle(1, 16777215);
    // 底部分隔线
    grid.moveTo(0, 472); grid.lineTo(880, 472);
    // 按钮外框（退出 / 数量框 / 交换）
    grid.drawRect(130, 222, 210, 30);
    grid.drawRect(540, 222, 210, 30);
    grid.drawRect(360, 222, 160, 30);
    // 连接线（从底部状态栏上沿连到按钮带，把控制区与下交易区分开）
    grid.moveTo(120, 470); grid.lineTo(120, 237); grid.lineTo(130, 237);
    grid.moveTo(340, 237); grid.lineTo(360, 237);
    grid.moveTo(520, 237); grid.lineTo(540, 237);
    grid.moveTo(750, 237); grid.lineTo(760, 237); grid.lineTo(760, 0);
    // 头像框（玩家左上） + 伙伴符号框（右下）
    grid.drawRect(130, 12, 60, 60);
    grid.drawRect(690, 402, 60, 60);
    // 上下交易区框
    grid.drawRect(130, 82, 620, 130);
    grid.drawRect(130, 262, 620, 130);
    const gridSp = new Sprite(); gridSp.graphics = grid; S.addChild(gridSp);
    // 玩家标题/价格/重量
    S.addChild(new EngineText(this.text(3).toUpperCase(), 16777215, 16, "left", 200, 11, 550, 20, true));
    this.yourPrice = new EngineText("", 16777215, 14, "left", 200, 32, 550, 20, true);
    S.addChild(this.yourPrice);
    this.yourWeight = new EngineText("", 16777215, 14, "left", 200, 52, 550, 20, true);
    S.addChild(this.yourWeight);
    // 对方名称/价格/重量
    this.partnerName = new EngineText(
      (this.locationName || (this.partner instanceof Town ? this.text(this.shop?.name ?? 0) : (this.partner?.name ?? ""))) .toUpperCase(),
      16777215, 16, "right", 130, 401, 550, 20, true,
    );
    S.addChild(this.partnerName);
    this.partnerPrice = new EngineText("", 16777215, 14, "right", 130, 422, 550, 20, true);
    this.partnerPrice.visible = !this.free;
    S.addChild(this.partnerPrice);
    this.partnerWeight = new EngineText("", 16777215, 14, "right", 130, 442, 550, 20, true);
    S.addChild(this.partnerWeight);
    // 伙伴符号（原版 partnerSymbol @(720,432)，框 drawRect(690,402,60,60)）：
    // 按当前交易伙伴的地点 symbol 显示对应 filtericon（市场/兽医/武器店…），不再恒为储藏库图标
    {
      const sym = new Sprite();
      this.attachPartnerSymbol(sym);
      sym.x = 690; sym.y = 402;
      sym.mouseEnabled = false;
      S.addChild(sym);
    }
    // 玩家源列表筛选条（原版 List.as：12 组 4×3 25×20 Switch + filtericon，顺序同 TradeWindow.as _loc20_）
    const filterGroups = ["market", "food", "liquids", "liquidscontainers", "devices", "tools", "miscellaneous", "weapons", "ammo", "attachments", "armor", "firstaid"];
    const bar = new Sprite();
    bar.mouseEnabled = false; // 容器不拦截；子 Switch 各自命中
    // 原版 List.as 无筛选区背景（areaBG 从 y=61 起，见下方列表区），仅 12 个 25×20 方格 Switch 4 列×3 行
    filterGroups.forEach((group, idx) => {
      const col = idx % 4, row = Math.floor(idx / 4);
      const on = !!this.cargoFilters[group];
      const sw = new Switch(3, on,
        () => this.toggleCargoFilter(group, true), () => this.toggleCargoFilter(group, false),
        null, null, 25, 20, false, this.assets, () => this.soloCargoFilter(group));
      sw.x = col * 25; sw.y = row * 20;
      const icon = this.cargoFilterIcon(group);
      if (icon) {
        // 原版 List.as L201-203：filterIcons scale 0.4 + alpha 0.3（选中态由 Switch on/off 底色表达）
        icon.alpha = 0.3;
        icon.mouseEnabled = false;
        const bmp = icon.children.find((ch) => ch instanceof BitmapObject) as BitmapObject | undefined;
        const iw = bmp ? bmp.width : 30, ih = bmp ? bmp.height : 30;
        const sc = Math.min((25 - 4) / iw, (20 - 4) / ih, 0.4);
        icon.scaleX = icon.scaleY = sc;
        icon.x = (25 - iw * sc) / 2;
        icon.y = (20 - ih * sc) / 2;
        sw.addChild(icon);
      }
      bar.addChild(sw);
      // 原版 List.as：filtericon 首次渲染可能尚未加载（getImage 异步返回 null → 落入图形兜底）→ 加载完成后替换为真图标
      // 注意：必须用 sw.setIcon 只替换图标，不能 removeAll（会清掉 Switch 的 onImg/offImg 底板→边框/选中态丢失）
      const fname = group === "tools" ? "mechanicalshop" : group === "liquids" ? "water" : group;
      this.assets.ensure("filtericon" + fname + ".png").then((img) => {
        if (!img || !sw.parent) return;
        const s = new Sprite();
        const b = new BitmapObject(img);
        b.mouseEnabled = false;
        s.addChild(b);
        s.scaleX = s.scaleY = 0.4;
        s.alpha = 0.3;
        s.mouseEnabled = false;
        s.x = (25 - b.width * 0.4) / 2;
        s.y = (20 - b.height * 0.4) / 2;
        sw.setIcon(s);
      });
    });
    bar.x = 10; bar.y = 12;
    S.addChild(bar);
    // 玩家源列表区（原版 List.as：areaBG 0x404040@0.7 + frame 底/右白0.3 顶/左黑0.6，然后 ScrollableArea(90,389) autoHide=false）
    {
      const areaBg = new Graphics();
      areaBg.beginFill(4208688, 0.7);
      areaBg.drawRect(0, 0, 100, 389);
      const abg = new Sprite(); abg.graphics = areaBg; abg.x = 10; abg.y = 73; abg.mouseEnabled = false;
      S.addChild(abg);
      const fr = new Graphics();
      fr.lineStyle(1, 16777215, 0.3);
      fr.moveTo(10 - 1, 73 + 389 + 1); fr.lineTo(10 + 100 + 1, 73 + 389 + 1); fr.lineTo(10 + 100 + 1, 73 - 1);
      fr.lineStyle(1, 0, 0.6);
      fr.lineTo(10 - 1, 73 - 1); fr.lineTo(10 - 1, 73 + 389 + 1);
      const frSp = new Sprite(); frSp.graphics = fr; frSp.mouseEnabled = false;
      S.addChild(frSp);
    }
    // 玩家源列表（原版 List：过滤器区之下 90×389 单元格列表；y = 12 + 61；autoHide=false 滚动条始终显示）
    const pList = new ScrollableArea(90, 389, 90, 389, true, false, false, 10, 14, this.assets);
    pList.x = 10; pList.y = 73;
    S.addChild(pList);
    this.sides[SIDE_PLAYER].list = pList;
    // 玩家头像（原版 drawRect(130,12,60,60) 白色框线 + People[0].picture scale 0.24，无黑底；
    // 之前误加 beginFill(0,0.8) 60×60 黑底 → 头像背景变黑，已删）
    {
      const leader = this.gd.Caravans[0].People[0];
      if (leader) {
        const port = buildPortraitFromCharacter(this.assets, leader, 0.24);
        port.x = 130; port.y = 12;
        port.mouseEnabled = false;
        S.addChild(port);
      }
      const frame = new Sprite();
      const fg2 = new Graphics();
      fg2.lineStyle(1, 16777215, 0.5);
      fg2.drawRect(0, 0, 60, 60);
      frame.graphics = fg2;
      frame.x = 130; frame.y = 12;
      frame.mouseEnabled = false;
      S.addChild(frame);
    }
    // 对方源列表（原版 partners[1].list = new List([],390,true,[],...)：x=770 y=42，无过滤器 → areaBG 从 y=0 起 100×390 + frame + 滚动条始终显示）
    {
      const areaBg = new Graphics();
      areaBg.beginFill(4208688, 0.7);
      areaBg.drawRect(770, 42, 100, 390);
      const abg = new Sprite(); abg.graphics = areaBg; abg.mouseEnabled = false;
      S.addChild(abg);
      const fr = new Graphics();
      fr.lineStyle(1, 16777215, 0.3);
      fr.moveTo(770 - 1, 42 + 390 + 1); fr.lineTo(770 + 100 + 1, 42 + 390 + 1); fr.lineTo(770 + 100 + 1, 42 - 1);
      fr.lineStyle(1, 0, 0.6);
      fr.lineTo(770 - 1, 42 - 1); fr.lineTo(770 - 1, 42 + 390 + 1);
      const frSp = new Sprite(); frSp.graphics = fr; frSp.mouseEnabled = false;
      S.addChild(frSp);
    }
    const qList = new ScrollableArea(90, 390, 90, 390, true, false, false, 10, 14, this.assets);
    qList.x = 770; qList.y = 42;
    S.addChild(qList);
    this.sides[SIDE_PARTNER].list = qList;
    // 交易区（原版 ScrollableArea(608,128,...,autoHide=false) 滚动条始终显示）
    const pArea = new ScrollableArea(608, 128, 608, 128, true, false, false, 10, 14, this.assets);
    pArea.x = 131; pArea.y = 83;
    S.addChild(pArea);
    this.sides[SIDE_PLAYER].area = pArea;
    const qArea = new ScrollableArea(608, 128, 608, 128, true, false, false, 10, 14, this.assets);
    qArea.x = 131; qArea.y = 263;
    S.addChild(qArea);
    this.sides[SIDE_PARTNER].area = qArea;
    // 按钮（原版：退出/以物易物 = Button(2) InterfaceButton2 206×28；全/清除 = Button(10) InterfaceButton6 × 0.71）
    const exitBtn = new Button(2, () => { this.exit(); }, this.text(1344).toUpperCase(), this.assets);
    exitBtn.x = 132; exitBtn.y = 225;
    S.addChild(exitBtn);
    this.exitBtn = exitBtn;
    const barterBtn = new Button(2, () => { this.doBarter(); }, this.tradeButtonText, this.assets);
    barterBtn.x = 542; barterBtn.y = 225;
    S.addChild(barterBtn);
    this.barterBtn = barterBtn;
    const mk10 = (label: string, x: number, y: number, fn: () => void) => {
      const b = new Button(10, fn, label, this.assets); // 原版 Button(10)：InterfaceButton6 × 0.71（Ui.ts 内部处理）
      b.x = x; b.y = y;
      S.addChild(b);
      return b;
    };
    mk10(this.text(1356).toUpperCase(), 767, 9, () => this.takeAll());
    mk10(this.text(1357).toUpperCase(), 767, 441, () => this.pressClear());
    // 差额 + 箭头 + 红叉（原版：moneyText @(360,226) left 16px；arrow y=237 动态 x；crossMoney y=237 白1px 动态 x/textWidth）
    this.moneyText = new EngineText("", 16777215, 16, "left", 360, 226, 160, 22, true);
    S.addChild(this.moneyText);
    // free 模式（储藏/缴获）隐藏金额相关（原版 setPartner L298：yourPrice/partnerPrice/moneyText/moneyDirection/bulb0/3 及其文字 = !free）
    this.moneyText.visible = !this.free;
    this.yourPrice.visible = !this.free;
    this.partnerPrice.visible = !this.free;
    // 差额方向箭头（原版 RepeatedGraphics(3)：上箭头 0,-7→5,1→2,1→2,7→-2,7→-2,1→-5,1，y=237 动态 x 随文字）
    this.moneyArrow = new Sprite();
    const ag = new Graphics();
    ag.beginFill(16777215);
    ag.moveTo(0, -7); ag.lineTo(5, 1); ag.lineTo(2, 1);
    ag.lineTo(2, 7); ag.lineTo(-2, 7); ag.lineTo(-2, 1);
    ag.lineTo(-5, 1); ag.lineTo(0, -7);
    this.moneyArrow.graphics = ag;
    this.moneyArrow.y = 237;
    this.moneyArrow.alpha = 0.8;
    this.moneyArrow.visible = !this.free;
    S.addChild(this.moneyArrow);
    this.crossMoney = new Sprite();
    const cg = new Graphics();
    cg.lineStyle(1, 16777215); // 原版：白 1px 横线
    cg.moveTo(0, 0); cg.lineTo(120, 0);
    this.crossMoney.graphics = cg;
    this.crossMoney.y = 237;
    this.crossMoney.visible = false;
    S.addChild(this.crossMoney);
    // 灯泡（原版 TradeWindow.as L189-244：6 组 BulbBase + BulbLightRedOn + 文字）
    // 右上 3 个 @(737,36/16/56)（文字右对齐@(130,y-3) 宽600）；左下 3 个 @(130,426/406/446)（文字左对齐@(150,y-3)）
    // 文字：0/3=Texts 1273 资金不足、1/4=Texts 27 超重、2/5=Texts 1346 不足够的容器；bulbs 位置 = base - 4
    this.bulbs = [];
    this.bulbTexts = [];
    const bulbPos: Array<[number, number]> = [[737, 36], [737, 16], [737, 56], [130, 426], [130, 406], [130, 446]];
    const bulbLabels = [1273, 27, 1346, 1273, 27, 1346];
    for (let i = 0; i < 6; i++) {
      const [bx, by] = bulbPos[i];
      // 底座（灰蓝圆环，始终可见；图片未加载时先画兜底圆环，ensure 完成后替换为真贴图）
      const baseImg = this.assets.getImage("BulbBase.png");
      const base = new Sprite();
      if (baseImg) {
        const bb = new BitmapObject(baseImg); bb.mouseEnabled = false; base.addChild(bb);
      } else {
        const bg = new Graphics();
        bg.lineStyle(1, 0x8a95a8, 0.9);
        bg.drawCircle(0, 0, 5);
        base.graphics = bg;
        this.assets.ensure("BulbBase.png").then((im) => {
          if (!im || !base.parent) return;
          base.removeAll();
          base.graphics = null; // 清掉兜底圆环
          const bb = new BitmapObject(im); bb.mouseEnabled = false; base.addChild(bb);
        });
      }
      base.x = bx; base.y = by; base.mouseEnabled = false;
      S.addChild(base);
      this.bulbBases.push(base);
      // 点亮红点（默认隐藏，bulbs 位置 = base - 4；贴图异步加载后替换）
      const b = new Sprite();
      const lit = this.assets.getImage("BulbLightRedOn.png");
      if (lit) {
        const lb = new BitmapObject(lit); lb.mouseEnabled = false; b.addChild(lb);
      } else {
        const bg = new Graphics();
        bg.beginFill(0xff3333, 0.9);
        bg.drawCircle(0, 0, 4);
        b.graphics = bg;
        this.assets.ensure("BulbLightRedOn.png").then((im) => {
          if (!im || !b.parent) return;
          b.removeAll();
          b.graphics = null;
          const lb = new BitmapObject(im); lb.mouseEnabled = false; b.addChild(lb);
        });
      }
      b.x = bx - 4; b.y = by - 4;
      b.visible = false;
      S.addChild(b);
      this.bulbs.push(b);
      // 文字（原版 bulbTexts：12px，右上右对齐 / 左下左对齐）
      const rightAligned = i < 3;
      const t = new EngineText(
        this.text(bulbLabels[i]), 16777215, 12,
        rightAligned ? "right" : "left",
        rightAligned ? 130 : 150, by - 3, 600, 20,
      );
      S.addChild(t);
      this.bulbTexts.push(t);
    }
    // 问题提示条（原版 problemDisplay：bg 300×30 @(290,130) lineStyle(1,3156000) + beginFill(12631208)，txt 3156000 14px center）
    {
      const pd = new Sprite();
      const pg = new Graphics();
      pg.lineStyle(1, 3156000);
      pg.beginFill(12631208);
      pg.drawRect(0, 0, 300, 30);
      pd.graphics = pg;
      pd.x = 290; pd.y = 130;
      pd.mouseEnabled = false;
      this.problemText = new EngineText("", 3156000, 14, "center", 0, 5, 300, 20);
      pd.addChild(this.problemText);
      pd.visible = false;
      this.problemDisplay = pd;
      S.addChild(pd);
    }
    // 底部行（capacity 左、date 右、money 动态居中）：白色文字；
    // 必须先于 cursorInfo 挂载——底栏渲染层级低于悬停属性面板（面板可盖住底栏文字）
    this.bottomCapacity = new EngineText("", 16777215, 14, "left", 10, 474, 860, 20);
    S.addChild(this.bottomCapacity);
    this.bottomDate = new EngineText("", 16777215, 14, "right", 10, 474, 860, 20);
    S.addChild(this.bottomDate);
    this.bottomMoney = new EngineText("", 16777215, 14, "left", 10, 474, 860, 20);
    S.addChild(this.bottomMoney);
    // t102：公共悬停信息面板（原版 cursorInfo @L255-258：Sprite 最后 addChild 最顶层，mouseEnabled=false）
    this.cursorPanel.attach(S);
    this.update();
  }

  // 原版 NumberFormat(,2)：金额固定两位小数；重量等其他数值用普通数字
  private fmt(n: number): string {
    if (!isFinite(n)) return "0";
    return Math.round(n * 100) / 100 + "";
  }

  /** List.as: plain quantity (no grouping); retain K/M abbreviations and exact internal values. */
  private fmtItemAmount(value: number): string {
    if (!Number.isFinite(value)) return "0";
    if (value >= 100000000) return Math.round(value / 1000000) + " M";
    if (value >= 100000) return Math.round(value / 1000) + " K";
    return String(itemAmount(value, true));
  }

  private fmtMoney(n: number): string {
    if (!isFinite(n)) return "0.00";
    return (Math.round(n * 100) / 100).toFixed(2);
  }
}
