// 公共物品格背景（原版 List.as picBG/selectFrame）：
// - drawItemCellBG：250×250 母格圆角卡片（picBGColor=5788752=0x585450 灰褐，alpha 0.8）
//   —— 装备页物品池/货物页格子（makeGridCell）、装备背包格、交易行格共用同一绘制（t100）
// - drawItemCellSelect：选中白框（selectFrame：16777215 a0.2 圆角，沿 250 母格外扩 ext 母格像素；
//   屏上恒定外扩 = selectFrameSize(5) / scale ⇒ 母格外扩 ext = 5/scale）
import type { Graphics } from "../core/Display";

export const ITEM_CELL_COLOR = 5788752; // 0x585450

export function drawItemCellBG(g: Graphics, radius = 10, fill = ITEM_CELL_COLOR, alpha = 0.8) {
  g.beginFill(fill, alpha);
  g.moveTo(0, radius);
  g.curveTo(0, 0, radius, 0);
  g.lineTo(250 - radius, 0);
  g.curveTo(250, 0, 250, radius);
  g.lineTo(250, 250 - radius);
  g.curveTo(250, 250, 250 - radius, 250);
  g.lineTo(radius, 250);
  g.curveTo(0, 250, 0, 250 - radius);
  g.endFill();
}

export function drawItemCellSelect(g: Graphics, ext: number) {
  g.beginFill(16777215, 0.2);
  g.moveTo(-ext, 10 - ext);
  g.curveTo(-ext, -ext, 10 - ext, -ext);
  g.lineTo(250 - 10 + ext, -ext);
  g.curveTo(250 + ext, -ext, 250 + ext, 10 - ext);
  g.lineTo(250 + ext, 250 - 10 + ext);
  g.curveTo(250 + ext, 250 + ext, 250 - 10 + ext, 250 + ext);
  g.lineTo(10 - ext, 250 + ext);
  g.curveTo(-ext, 250 + ext, -ext, 250 - 10 + ext);
  g.endFill();
}
