// PeopleGrid.ts（t84 反馈4）：公共人员网格/行渲染器
// 雇用页（横向行）、商队选单-人员页（竖向 70x70 格）、商队选单-装备页（竖向格）共用同一接口：
// makePersonCell(assets, ds, person, opts) → Sprite
// 行内固定元素：头像（buildPortraitFromCharacter）+ 左下血条 + 右下身份图标 + 选中框/点击命中。
import { Sprite, Graphics, BitmapObject } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { buildPortraitFromCharacter } from "./Portrait";
import { attachItemIcon } from "./ItemIcon";
import { getText } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import type { DataStore } from "../core/DataStore";

const CAT_NAMES = ["volunteers", "mercenaries", "prisoners", "slaves", "other"];

function categoryIcon(assets: AssetStore, ds: DataStore, cat: number): Sprite | null {
  const name = CAT_NAMES[cat >= 1 && cat <= 4 ? cat - 1 : 4];
  const img = assets.getImage("filtericon" + name + ".png");
  if (img) {
    const s = new Sprite();
    const b = new BitmapObject(img);
    b.mouseEnabled = false;
    s.addChild(b);
    return s;
  }
  const items: any[] = (ds as any).items?.Items ?? [];
  const firstOfCat = (c: number) => { for (let i = 1; i < items.length; i++) { const it = items[i]; if (it && (c < 0 ? it.category >= 5 : it.category === c)) return i; } return 0; };
  const fallbackId = name === "mercenaries" ? firstOfCat(2) : name === "other" ? firstOfCat(-1) : 0;
  if (fallbackId) return attachItemIcon(assets, ds, new Sprite(), fallbackId, { size: 30 });
  return null;
}

export interface PersonCellOpts {
  /** 母格尺寸（内部坐标系；实际显示 scale = cellW / master） */
  cellW?: number;      // 竖向格 70；横向行 92
  selected?: boolean;
  /** Original List appearance overrides (town hiring differs from caravan lists). */
  picBGColor?: number;
  selectFrameColor?: number;
  selectFrameSize?: number;
  selectFrameAlpha?: number;
  onClick?: () => void;
  /** 横向行模式：在头像右侧叠加文本行（名字/工资/属性），母格 250x250 内头像靠左上 */
  horizontal?: boolean;
  /** 附加文本行（horizontal 时使用）：[{text, color, size}] */
  rows?: Array<{ text: string; color?: number; size?: number }>;
}

/** 公共人员格（原版 List.as Character 分支：250x250 母格 ×scale + 左下血条 + 右下身份图标） */
export function makePersonCell(assets: AssetStore, ds: DataStore, person: any, opts: PersonCellOpts = {}): Sprite {
  const master = new Sprite();
  const selected = !!opts.selected;
  const horizontal = !!opts.horizontal;
  const cellW = opts.cellW ?? (horizontal ? 92 : 70);
  const scale = cellW / 250;
  const rounded = (g: Graphics, fill: number, alpha: number) => {
    g.beginFill(fill, alpha);
    g.moveTo(0, 10); g.curveTo(0, 0, 10, 0);
    g.lineTo(240, 0); g.curveTo(250, 0, 250, 10);
    g.lineTo(250, 240); g.curveTo(250, 250, 240, 250);
    g.lineTo(10, 250); g.curveTo(0, 250, 0, 240);
    g.endFill();
  };
  const bg = new Sprite();
  const bgG = new Graphics();
  rounded(bgG, opts.picBGColor ?? 5788752, 0.8);
  bg.graphics = bgG;
  bg.mouseEnabled = false;
  bg.mouseChildren = false;
  master.addChild(bg);
  // 头像（原版 generatePortrait 250x250 @(10,10)）
  const portrait = buildPortraitFromCharacter(assets, person, 1);
  if (!horizontal) {
    // t94：原版 List.as L528 直接把 generatePortrait() 的 250x250 Bitmap addChild 到 (0,0)，不放大不居中。
    // t93 的 fitPortraitToBox 会把半身像放大铺满整卡 → 黑色上衣/暗色把卡面填满，看起来像"半透明黑框"。
    portrait.x = 0; portrait.y = 0;
  } else {
    portrait.x = 10; portrait.y = 10;
  }
  portrait.mouseEnabled = false;
  portrait.mouseChildren = false;
  master.addChild(portrait);
  // 左下血条（原版 healthBar @(20,210) 130x20 a0.5）
  const hb = new Sprite();
  const hg = new Graphics();
  const ratio = Math.max(0, Math.min(1, (person.HP ?? 0) / Math.max(person.maxHP ?? 1, 1)));
  hg.lineStyle(1, 16777215, 0.5);
  hg.drawRect(0, 0, 130, 20);
  hg.beginFill(16777215, 0.5);
  hg.drawRect(3, 3, Math.max(0, 124 * ratio), 14);
  hb.graphics = hg;
  hb.x = 20; hb.y = 210;
  hb.mouseEnabled = false;
  hb.mouseChildren = false;
  master.addChild(hb);
  // 右下身份图标（原版 filtericon{category} @(210,210) scale1.5 a0.5）
  const ic = categoryIcon(assets, ds, person.category ?? 0);
  if (ic) {
    const bmp = ic.children.find((ch) => ch instanceof BitmapObject) as BitmapObject | undefined;
    const iw = bmp ? bmp.width : 30, ih = bmp ? bmp.height : 30;
    ic.x = 210 - (iw * 1.5) / 2;
    ic.y = 210 - (ih * 1.5) / 2;
    ic.scaleX = ic.scaleY = 1.5;
    ic.alpha = 0.5;
    ic.mouseEnabled = false;
    ic.mouseChildren = false;
    master.addChild(ic);
  }
  // 横向行：头像压缩到左上 92x92，右侧文本（名字/工资/属性）
  if (horizontal) {
    master.scaleX = master.scaleY = scale;
    const txtX = 92 / scale + 6; // 头像右缘（母格坐标）
    const rows = opts.rows ?? [];
    rows.forEach((r, i) => {
      const t = new EngineText(r.text, r.color ?? 5259312, r.size ?? 14, "left", txtX, 12 + i * 22, 250 - txtX, 20);
      t.mouseEnabled = false;
      master.addChild(t);
    });
  } else {
    master.scaleX = master.scaleY = scale;
  }
  // t96：选中白框最后 addChild（盖在头像/血条之上）+ 外扩（原版 List.as selectFrame：
  // 路径外扩 _loc11_=selectFrameSize/((listSize-30)/250)=5/scale → 屏上恒 5px，alpha0.2 白）
  if (selected) {
    const ext = (opts.selectFrameSize ?? 5) / master.scaleX;
    const selFrame = new Sprite();
    const sg = new Graphics();
    sg.beginFill(opts.selectFrameColor ?? 16777215, opts.selectFrameAlpha ?? 0.2);
    sg.moveTo(-ext, 10 - ext); sg.curveTo(-ext, -ext, 10 - ext, -ext);
    sg.lineTo(250 - 10 + ext, -ext); sg.curveTo(250 + ext, -ext, 250 + ext, 10 - ext);
    sg.lineTo(250 + ext, 250 - 10 + ext); sg.curveTo(250 + ext, 250 + ext, 250 - 10 + ext, 250 + ext);
    sg.lineTo(10 - ext, 250 + ext); sg.curveTo(-ext, 250 + ext, -ext, 250 - 10 + ext);
    sg.endFill();
    selFrame.graphics = sg;
    selFrame.mouseEnabled = false;
    selFrame.mouseChildren = false;
    master.addChild(selFrame);
    // t97：原版 List.as L512 selectFrame 先 addChild、L525 picBG 再盖其上 → 白框在背景框之下，
    // 内部 0..250 区域被 bg 遮住、只有外扩环露出（用户实际体验验证）
    master.setChildIndex(selFrame, 0);
  }
  const hg2 = new Graphics();
  // t84：横向行文本延伸区在母格 x=256..700 → 命中区覆盖整行显示宽（scale 后 ~258px）
  hg2.hitRect(0, 0, horizontal ? 700 : 250, 250);
  master.graphics = hg2;
  if (opts.onClick) master.addEventListener("click", opts.onClick);
  return master;
}

export { getText };
