// ConsProdGraph：生产/消耗历史折线图（对应 AS3 IsoEngine.ConsProdGraph）
// 布局按原版：右侧产品列表（点击选择，选中反色高亮），左侧折线图
// （生产紫蓝线 / 消耗红线 + 网格 + 轴标签 + 图例 + 结余文本 + 可选周期切换 30天/6月/全部）
// TownMode screens[2] 用 periodSelectorEnabled=false（630x320）；CaravanMenu 用 620x180 开启周期切换
import { Sprite, Graphics, ClipSprite } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { ScrollableArea } from "../core/Ui";
import type { AssetStore } from "../core/Assets";
import { sfxClick } from "../core/Sound";
import { PaperArrow } from "../core/PaperArrow";

export interface HistoricalPoint {
  time: number;
  production: Array<{ item: number; amount: number }>;
  consumption: Array<{ item: number; amount: number }>;
  playersProduction: Array<{ item: number; amount: number }>;
  playersConsumption: Array<{ item: number; amount: number }>;
}

export interface GraphDate {
  Hour: number; Minute: number; Day: number; Month: number; Year: number;
  Hour2d: string | number; Minute2d: string | number; Day2d: string | number;
  ShortMonthName: string; Year2d: string | number;
}

// 对齐原版 MathFunctions.NumberFormat：四舍五入 + 千分位 + 去尾零（thousandsSeparator 时）
export function numberFormat(v: number, decimals = 2, thousandsSeparator = false): string {
  const sign = v < 0 ? "-" : "";
  let s = String(Math.abs(Math.round(Math.pow(10, decimals) * v)));
  let intPart: string;
  let decPart = "";
  if (decimals > 0) {
    while (s.length < decimals + 1) s = "0" + s;
    intPart = s.substring(0, s.length - decimals);
    decPart = s.substring(s.length - decimals);
  } else {
    intPart = s;
  }
  let out = "";
  for (let i = 1; i <= intPart.length; i++) {
    out = intPart.charAt(intPart.length - i) + out;
    if (i % 3 === 0 && i < intPart.length) out = "," + out;
  }
  if (decimals > 0) out = out + "." + decPart;
  if (thousandsSeparator && decimals > 0) {
    let removed = 0;
    while (out.charAt(out.length - 1) === "0" && removed <= decimals) { out = out.substring(0, out.length - 1); removed++; }
    if (out.charAt(out.length - 1) === ".") out = out.substring(0, out.length - 1);
  }
  return sign + out;
}

export class ConsProdGraph extends Sprite {
  totalWidth: number;
  totalHeight: number;
  periodSelectorEnabled: boolean;
  productsAreaWidth: number;
  productsAreaHeight: number;
  selectedPeriod = 1;
  maxPeriods = 3;
  data: HistoricalPoint[] | null = null;
  players = false;
  products: any[] = [];
  productsArea!: ScrollableArea;
  changePeriodButtons: Array<{ disp: Sprite }> = [];
  periodText!: EngineText;
  noDataText!: EngineText;
  selectedItem: number | null = null;
  selectedItemSlot: number | null = null;
  vGraphTexts: Array<{ text: EngineText; val: number }> = [];
  hGraphTexts: Array<{ text: EngineText; val: number }> = [];
  graph = new Sprite();
  private graphG = new Graphics();
  private axes = new Sprite();
  private axesG = new Graphics();
  readonly plot = new ClipSprite(1, 1);
  private curveG = new Graphics();
  prodBox = new Sprite();
  prodText!: EngineText;
  consBox = new Sprite();
  consText!: EngineText;
  balanceText!: EngineText;
  borderColor = 5652004;      // 原版边框/文字色
  productionColor = 2892436;  // 原版生产线条色（紫蓝）
  consumptionColor = 12582912; // 原版消耗线条色（红）

  constructor(
    totalWidth = 620,
    totalHeight = 250,
    data: HistoricalPoint[] | null = null,
    players = false,
    periodSelectorEnabled = true,
    private nameFn: (itemId: number) => string = (id) => "Item " + id,
    private textFn: (id: number) => string = (id) => String(id),
    private makeDateFn: (t: number) => GraphDate = () => ({ Hour: 0, Minute: 0, Day: 1, Month: 1, Year: 1, Hour2d: "0", Minute2d: "00", Day2d: "1", ShortMonthName: "Jan", Year2d: "1" }),
    private assets: AssetStore | null = null,
  ) {
    super();
    this.totalWidth = totalWidth;
    this.totalHeight = totalHeight;
    this.periodSelectorEnabled = periodSelectorEnabled;
    this.productsAreaWidth = totalWidth > 500 ? 200 : Math.max(150, totalWidth - 300);
    this.productsAreaHeight = periodSelectorEnabled ? totalHeight - 30 : totalHeight;
    if (data != null) this.data = data;
    if (players) this.players = true;

    // 无数据显示
    this.noDataText = new EngineText(this.textFn(5957).toUpperCase(), this.borderColor, 14, "center", 10, totalHeight / 2 - 10, totalWidth - this.productsAreaWidth - 20, 20);
    this.addChild(this.noDataText);
    // Keep curve strokes (including sharp joins) inside the axes. Labels and axes
    // stay outside this clip; neither visual layer intercepts controls.
    this.plot.graphics = this.curveG;
    this.plot.mouseEnabled = this.plot.mouseChildren = false;
    this.graph.mouseEnabled = this.graph.mouseChildren = false;
    // 网格 → 已裁剪曲线 → 坐标轴，网格不能盖在折线上。
    this.graph.graphics = this.graphG;
    this.addChild(this.graph);
    this.addChild(this.plot);
    this.axes.graphics = this.axesG;
    this.axes.mouseEnabled = this.axes.mouseChildren = false;
    this.addChild(this.axes);
    // 边框
    const frame = new Sprite();
    const fg = new Graphics();
    fg.lineStyle(1, this.borderColor);
    fg.drawRect(totalWidth - this.productsAreaWidth, 0, this.productsAreaWidth, this.productsAreaHeight);
    if (periodSelectorEnabled) fg.drawRect(totalWidth - this.productsAreaWidth, totalHeight - 20, this.productsAreaWidth, 20);
    frame.graphics = fg;
    frame.mouseEnabled = false; // 纯线条边框不拦截点击（Graphics.hit 对 rect 有命中，须禁用）
    // 产品列表
    this.productsArea = new ScrollableArea(this.productsAreaWidth - 10, this.productsAreaHeight, this.productsAreaWidth - 10, this.productsAreaHeight, true, false, false, 10, 10, this.assets); // t92 S3
    this.productsArea.x = totalWidth - this.productsAreaWidth;
    this.productsArea.y = 0;
    this.addChild(this.productsArea);
    // 周期切换（可选）
    if (periodSelectorEnabled) {
      this.periodText = new EngineText("", this.borderColor, 14, "center", totalWidth - this.productsAreaWidth + 20, totalHeight - 20, this.productsAreaWidth - 40, 20);
      this.addChild(this.periodText);
      for (let i = 0; i <= 1; i++) {
        const disp = new PaperArrow(i === 0 ? -1 : 1, this.borderColor, () => this.pressChangePeriod(i));
        disp.y = totalHeight - 20;
        disp.x = i === 0 ? totalWidth - this.productsAreaWidth : totalWidth - 20;
        this.addChild(disp);
        this.changePeriodButtons.push({ disp });
      }
    }
    this.addChild(frame);
    // 图例：生产/消耗色块 + 文本 + 结余
    const pg = new Graphics();
    pg.lineStyle(1, this.borderColor);
    pg.beginFill(this.productionColor);
    pg.drawRect(0, 0, 10, 10);
    this.prodBox.graphics = pg;
    this.prodBox.y = totalHeight - 15;
    this.addChild(this.prodBox);
    this.prodText = new EngineText(this.textFn(921).toUpperCase(), this.borderColor, 10, "left", 20, totalHeight - 15, 200, 20);
    this.prodText.y = totalHeight - this.prodText.textHeight / 2 - 12;
    this.addChild(this.prodText);
    const cg2 = new Graphics();
    cg2.lineStyle(1, this.borderColor);
    cg2.beginFill(this.consumptionColor);
    cg2.drawRect(0, 0, 10, 10);
    this.consBox.graphics = cg2;
    this.consBox.y = totalHeight - 15;
    this.consBox.x = this.prodText.textWidth + 40;
    this.addChild(this.consBox);
    this.consText = new EngineText(this.textFn(922).toUpperCase(), this.borderColor, 10, "left", this.prodText.textWidth + 60, totalHeight - 15, 200, 20);
    this.consText.y = totalHeight - this.consText.textHeight / 2 - 12;
    this.addChild(this.consText);
    this.balanceText = new EngineText("", this.borderColor, 10, "right", 0, totalHeight - 15, totalWidth - this.productsAreaWidth - 20, 20);
    this.addChild(this.balanceText);
    this.updatePeriod();
  }

  pressChangePeriod(dir: number) {
    sfxClick();
    this.selectedPeriod = dir === 0 ? this.selectedPeriod - 1 : this.selectedPeriod + 1;
    if (this.selectedPeriod < 1) this.selectedPeriod = this.maxPeriods;
    if (this.selectedPeriod > this.maxPeriods) this.selectedPeriod = 1;
    this.updatePeriod();
  }

  updatePeriod() {
    if (this.periodSelectorEnabled) {
      if (this.selectedPeriod === 1) this.periodText.text = this.textFn(5925).toUpperCase();
      else if (this.selectedPeriod === 2) this.periodText.text = this.textFn(5926).toUpperCase();
      else this.periodText.text = this.textFn(5956).toUpperCase();
    }
    this.update();
  }

  update(data: HistoricalPoint[] | null = null, players: boolean | null = null) {
    if (data != null) this.data = data;
    if (players != null) this.players = players;
    this.productsArea.clearAll();
    if (!Array.isArray(this.data) || this.data.length < 2) { this.emptyData(); return; }
    // 汇总所有出现过的产品（amount>0 的 生产/消耗）
    const uniq: number[] = [];
    const scan = (list: Array<{ item: number; amount: number }>) => {
      for (const e of list ?? []) {
        if (e.amount > 0 && !uniq.includes(e.item)) uniq.push(e.item);
      }
    };
    for (const d of this.data) {
      scan(this.players ? d.playersProduction : d.production);
      scan(this.players ? d.playersConsumption : d.consumption);
    }
    if (uniq.length === 0) { this.emptyData(); return; }
    this.products = [];
    for (let i = 0; i < uniq.length; i++) {
      const itemId = uniq[i];
      const w = this.productsAreaWidth - 10;
      // 普通行（可点击）
      const normalText = new Sprite();
      normalText.addChild(new EngineText(this.nameFn(itemId).toUpperCase(), this.borderColor, 12, "center", 0, 1, w, 20));
      const hitG = new Graphics();
      hitG.hitRect(0, 0, w, 20);
      normalText.graphics = hitG;
      normalText.y = i * 20;
      normalText.buttonMode = true;
      normalText.mouseChildren = false;
      const selItem = itemId;
      normalText.addEventListener("click", () => this.clickProduct(selItem));
      // Pale paper-coloured text over original brown selection. Nested erase/layer
      // rasterization made small system-font glyphs muddy and almost unreadable.
      const inverseText = new Sprite();
      const ibgG = new Graphics();
      ibgG.beginFill(this.borderColor);
      ibgG.drawRect(0, 0, w, 20);
      inverseText.graphics = ibgG;
      inverseText.mouseEnabled = inverseText.mouseChildren = false;
      const itxt = new EngineText(this.nameFn(itemId).toUpperCase(), 0xeee5cd, 12, "center", 0, 1, w, 20);
      inverseText.addChild(itxt);
      inverseText.y = i * 20;
      inverseText.visible = false;
      this.products.push({ item: itemId, normalText, inverseText });
      this.productsArea.addContent(normalText);
      this.productsArea.addContent(inverseText);
    }
    this.productsArea.updateSize();
    this.noDataText.visible = false;
    this.updateSelected();
  }

  emptyData() {
    this.productsArea.clearAll();
    this.productsArea.updateSize();
    this.graphG.clear();
    this.axesG.clear();
    this.curveG.clear();
    this.products = [];
    this.selectedItemSlot = null;
    this.noDataText.visible = true;
    this.balanceText.text = "";
    this.clearGraphLabels();
  }

  clickProduct(itemId: number) {
    sfxClick();
    this.selectedItem = itemId;
    this.updateSelected();
  }

  updateSelected() {
    if (this.selectedItem != null) {
      for (let i = 0; i < this.products.length; i++) {
        if (this.products[i].item === this.selectedItem) { this.selectedItemSlot = i; break; }
      }
    }
    if (this.selectedItemSlot != null && this.selectedItemSlot >= this.products.length) this.selectedItemSlot = this.products.length - 1;
    if (this.selectedItemSlot == null) this.selectedItemSlot = 0;
    for (let i = 0; i < this.products.length; i++) {
      this.products[i].inverseText.visible = i === this.selectedItemSlot;
      this.products[i].normalText.visible = i !== this.selectedItemSlot;
    }
    this.selectedItem = this.products[this.selectedItemSlot]?.item ?? null;
    this.updateGraph();
  }

  private clearGraphLabels() {
    for (const t of this.vGraphTexts) this.removeChild(t.text);
    for (const t of this.hGraphTexts) this.removeChild(t.text);
    this.vGraphTexts = [];
    this.hGraphTexts = [];
  }

  updateGraph() {
    if (!this.data || this.selectedItem == null) return;
    // Render a view, never reorder or rewrite historical save data.
    const data = this.data.filter(p => Number.isFinite(p.time)).slice().sort((a,b) => b.time-a.time);
    if (data.length < 2 || data[0].time <= data[data.length-1].time) { this.emptyData(); return; }
    const latest = data[0].time;
    const periodSec = this.selectedPeriod === 1 ? 2592000 : this.selectedPeriod === 2 ? 15768000 : latest-data[data.length-1].time;
    const startTime = latest-periodSec;
    // Reference graph displays units/day, not cumulative stock. An existing town
    // may therefore start above zero; never insert a fictional zero at the left.
    const avgDelta = (latest-data[data.length-1].time)/(data.length-1);
    const rate = 86400/avgDelta;
    const series = [1,2].map(kind => {
      const points: Array<{time:number; value:number}> = [];
      let sum = 0;
      for (const row of data) {
        const list = this.players
          ? (kind === 1 ? row.playersProduction : row.playersConsumption)
          : (kind === 1 ? row.production : row.consumption);
        const amount = (list ?? []).reduce((n,e) => n + (e.item === this.selectedItem && Number.isFinite(e.amount) ? Math.max(0,e.amount) : 0), 0);
        const value = amount*rate;
        if (row.time < startTime) {
          const previous = points[points.length-1];
          if (previous && previous.time > startTime) {
            const t = (previous.time-startTime)/(previous.time-row.time);
            points.push({time:startTime,value:previous.value+(value-previous.value)*t});
          }
          break; // Outside-period records are not included in the balance.
        }
        sum += amount;
        points.push({time:row.time,value});
      }
      return {points,sum};
    });
    // Include the interpolated left-edge value when sizing the axis. Previously
    // an older, taller record could push the boundary segment above the plot.
    let maxVal = .000001;
    for (const line of series) for (const point of line.points) maxVal = Math.max(maxVal,point.value);
    let vStep = maxVal > 1000 ? 1000 : maxVal > 100 ? 100 : maxVal > 10 ? 10 : maxVal > 1 ? 1 : maxVal >= .1 ? .1 : .01;
    // Bound label creation for unusually large/modded economies.
    if (maxVal/vStep > 100) vStep = Math.pow(10,Math.ceil(Math.log10(maxVal/20)));
    this.clearGraphLabels();
    let maxW = 0;
    for (let val=vStep; val<=maxVal; val+=vStep) {
      const text = new EngineText(String(Math.round(val*100)/100),this.borderColor,10,"right",0,0,500,20);
      this.vGraphTexts.push({text,val});
      maxW = Math.max(maxW,text.textWidth);
    }
    const graphX = maxW+5;
    const graphW = this.totalWidth-this.productsAreaWidth-maxW-25;
    const hStep = periodSec >= 86400 ? Math.ceil(periodSec/(graphW/20)/86400)*86400 : 3600;
    let hMaxW = 0;
    for (let val=Math.ceil(startTime/hStep)*hStep; val<=latest; val+=hStep) {
      const dt = this.makeDateFn(val);
      const label = hStep === 3600 ? dt.Hour+":"+dt.Minute2d : dt.Day+"-"+dt.ShortMonthName+"-"+dt.Year2d;
      const text = new EngineText(label,this.borderColor,8,"right",0,0,500,20);
      this.hGraphTexts.push({text,val});
      hMaxW = Math.max(hMaxW,text.textWidth);
    }
    const plotBottom = Math.max(1,this.totalHeight-hMaxW-35);
    const xScale = graphW/periodSec, yScale = plotBottom/maxVal;
    this.plot.x = graphX;
    this.plot.clipW = graphW; this.plot.clipH = plotBottom;
    const g = this.graphG;
    g.clear();
    g.lineStyle(1,this.borderColor,.2);
    for (const vt of this.vGraphTexts) {
      vt.text.width = graphX;
      vt.text.y = plotBottom-vt.val*yScale-vt.text.textHeight/2-2;
      g.moveTo(graphX,plotBottom-vt.val*yScale);
      g.lineTo(graphX+graphW,plotBottom-vt.val*yScale);
      this.addChild(vt.text);
    }
    for (const ht of this.hGraphTexts) {
      const x = graphX+(ht.val-startTime)*xScale;
      ht.text.width = hMaxW+5;
      ht.text.x = x-ht.text.textHeight/2-2;
      ht.text.y = this.totalHeight-30;
      ht.text.rotation = -90;
      // Original Chinese/system-font screenshot leaves this strip blank. Keep
      // its measured margin/grid without adding Web-only rotated date labels.
      ht.text.visible = false;
      g.moveTo(x,0); g.lineTo(x,plotBottom);
      this.addChild(ht.text);
    }
    const curves = this.curveG;
    curves.clear();
    series.forEach((line,i) => {
      curves.lineStyle(2,i===0 ? this.productionColor : this.consumptionColor,i===0 ? .8 : .6,true);
      line.points.forEach((p,j) => {
        const x = (p.time-startTime)*xScale, y = plotBottom-p.value*yScale;
        if (j === 0) curves.moveTo(x,y); else curves.lineTo(x,y);
      });
    });
    const axes = this.axesG; axes.clear();
    axes.lineStyle(1,this.borderColor);
    axes.moveTo(0,plotBottom); axes.lineTo(graphX+graphW,plotBottom);
    axes.moveTo(graphX,0); axes.lineTo(graphX,this.totalHeight-30);
    const diff = series[0].sum-series[1].sum;
    const decimals = Math.abs(diff)>100 ? 0 : Math.abs(diff)>10 ? 1 : Math.abs(diff)>1 ? 2 : 3;
    this.balanceText.text = this.textFn(5958).toUpperCase()+": "+(diff>0 ? "+" : "")+numberFormat(diff,decimals,true);
    this.balanceText.y = this.totalHeight-this.balanceText.textHeight/2-12;
  }

  remove() {
    for (const b of this.changePeriodButtons) b.disp.removeAll();
    this.changePeriodButtons = [];
    this.productsArea.remove();
    this.removeAll();
  }
}
