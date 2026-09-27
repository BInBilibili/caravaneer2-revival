import { Battle } from "./Battle";
import type { ModRuntime } from "../../../../src/core/ModRuntime";
import { Character, GameData } from "../../../../src/game/World";
import { Economy } from "../../../../src/game/Economy";
import { BitmapObject, Graphics, Sprite } from "../../../../src/core/Display";
import type { Tint } from "../../../../src/core/Display";
import { EngineText } from "../../../../src/core/EngineText";
import { CursorInfoPanel } from "../../../../src/core/CursorInfoPanel";
import type { CursorRow } from "../../../../src/core/CursorInfoPanel";
import { Input } from "../../../../src/core/Input";
import { Button, ScrollableArea, Switch } from "../../../../src/core/Ui";
import { addDialogueBackground } from "../../../../src/core/DialogueBg";
import { loadHoundVisual } from "./HoundVisual";

/** 成长空间倍率。原版 Character.as:3176 / World.ts:302 是 10（成长空间 = 智力 × 10）；
 *  1 = 关掉 ×10（成长空间 = 智力）。改这一个数即可调成 5 等半程值。 */
const LEARNING_CAPACITY_FACTOR = 1;

/** 等级经验基数（唯一旋钮）：累计经验 = 400×(L−1)²，反查 L = 1 + ⌊√(总经验/400)⌋。 */
const LEVEL_XP_STEP = 400;

/** 每升一级发放的技能点数。 */
const SKILL_POINTS_PER_LEVEL = 1;

/** 不动原版文件：在宿主 Character 原型上重定义 getter（class 访问器默认 configurable）。
 *  只有本 DLC 启用（runtime 被加载）时才执行；未启用时原版 intelligence*10 保持不变。
 *  影响学校经验、战斗经验、采集经验与成长空间显示，因为都读同一个 getter。 */
function patchLearningCapacity() {
  Object.defineProperty(Character.prototype, "learningCapacity", {
    configurable: true,
    enumerable: false,
    get(this: any) { return this.intelligence * LEARNING_CAPACITY_FACTOR * ownBonus(this).xpMul; },
  });
}

const levelOf = (totalExperience: number) => 1 + Math.floor(Math.sqrt(Math.max(0, totalExperience) / LEVEL_XP_STEP));
const levelFloor = (level: number) => LEVEL_XP_STEP * (level - 1) * (level - 1);
/** 当前等级内的进度（0..1）——经验条读它，即"升下一级还差多少"。 */
const levelProgress = (totalExperience: number) => {
  const lv = levelOf(totalExperience), lo = levelFloor(lv), hi = levelFloor(lv + 1);
  return hi > lo ? Math.max(0, Math.min(1, (totalExperience - lo) / (hi - lo))) : 0;
};

/** Character.level：只读派生值（原版无 level 字段，web/src 全库也无 .level 用法）。 */
function patchLevel() {
  Object.defineProperty(Character.prototype, "level", {
    configurable: true,
    enumerable: false,
    get(this: any) { return levelOf(this.totalExperience ?? 0); },
  });
}

// ==================== 车队目录 · 人员页 UI 改造 ====================
// 原版布局（CaravanMenu.ts renderPeople，页容器 S 的局部坐标＝屏幕坐标）：
//   y=22 名字 / 62 生命+血条 / 82 健康状态 / 102 受伤部位 / 122 士气+士气条 / 152..212 四项属性
//   / 242 行动值 / 262 速度 / 292 最大负重 / 322 技能滚动框
// 改造后的中间列（底部收在 292..312，与原来一样留 10px 到技能框 322）：
//   14 名字 / 52 状态槽位（外框 39 高＝屏幕 41px：2px 边距 + 27 视口(24 格 + 3px 格↔条边距) + 10px 滚动条，条下移贴外框底边）/ 98 生命 / 118 士气 / 138 等级+经验条
//   / 160 技能点+技能树按钮（按钮 156..184）/ 184·202·220·238 四项属性
//   / 256 行动值+速度（**合并成同一行**，左半行动值 / 右半速度）/ 292 最大负重
const CREW_ROW_Y = { name: 14, nameFrame: 24, hp: 98, morale: 118, level: 138, skills: 160 };
/** 原 y → 新 y（仅中间信息列 x≥280 的成员）；292 最大负重原位不动。
 *  用户要求"行动值和速度合并成同一行"：两行原为 242/262，合并后都落到 256，
 *  由 mergeApSpeedRow() 删掉原两行、在同一条线上重画「行动值 … 速度 …」。
 *  腾出的 274 空出后中间列更松，最大负重仍留在 292 不动。 */
const CREW_ROW_MOVE: Record<number, number> = {
  22: 14, 32: 24,                                   // 名字 / 名字框（上移给状态槽位的滚动条让空间）
  62: 98, 122: 118,                                 // 生命行 / 士气行
  152: 184, 172: 202, 192: 220, 212: 238,           // 力量/敏捷/精准/智力
  242: 256, 262: 256,                               // 行动值 / 速度 → 合并到同一行 256
};
/** 要删掉的两行（健康状态 953 / 受伤部位 948）。 */
const CREW_ROW_DROP = [82, 102];
/** 行动值+速度合并后的行 y（两条 250 宽右对齐会叠在一起，所以合并行改用左右两半）。 */
const CREW_AP_SPEED_Y = 256;
/** 状态槽位：仍是"生命行上方"，但改成横向可滚动的正方形格子条。
 *  外框左上角固定在 (290,52)，宽 250 ⇒ 右边缘正好落在下一行血条的尾端
 *  （血条 = x 290+txtW+10 起、宽 240−txtW，尾端恒为 540；CaravanMenu.ts:1114）。
 *  用户要求"宽度拉长到最长（＝下一行血条尾部），方便以后扩展更多状态"。 */
const STATUS_SLOT_X = 290;
const STATUS_SLOT_Y = 52;
/** 正方形格子（长＝宽）= 图标 + 每边 3px 内边距；格子与间隙本身尺寸不变。
 *  用户反馈"图标变小了但槽位没跟着变小" → 格子 44 → 24、间隙 12 → 8（整体缩小）。 */
const STATUS_CELL = 24;
const STATUS_CELL_GAP = 8;
/** 外框尺寸（可视化口径 = 含自身 1px 线）：宽 250（屏幕 290..540＝血条尾端）。
 *  高 41（屏幕 51..93＝43px）：用户要求"状态图标跟滚动条之间也要保持边距"，
 *  格子底与条顶之间插进 STATUS_BAR_PAD=2，外框随之长高，条仍贴住外框底边。
 *  自检：1px 上边距 + 26 视口(24 格 + 2 gap) + 2px barDrop + 10 条 = 39（外框 39 → 屏幕 41px）。 */
const STATUS_SLOT_W = 250;
const STATUS_FRAME_H = 39;
/** 格子条到外框的边距（用户要求"状态图标槽位与外边的状态栏槽位保持一定边距"）。 */
const STATUS_PAD = 2;
/** 图标格与横向滚动条之间的边距（用户要求"状态图标跟滚动条之间也要保持边距"）。
 *  ScrollableArea 把横条画在视口底边 (y = h) 上，所以这里把**视口高度**从 24 提到 24+gap，
 *  格子的 24×24 尺寸不变、条粗 10 不变，多出来的 gap 就是格底到条顶的空白。 */
const STATUS_BAR_PAD = 2;
/** 滚动条视口高度 = 格子高 + 格↔条边距（格子仍 24 高，cell.y=0 顶部对齐）。 */
const STATUS_STRIP_H = STATUS_CELL + STATUS_BAR_PAD; // 24 + 2 = 26
/** 格子条（ScrollableArea 视口）位置与宽度 = 外框内缩 2px：292..537。 */
const STATUS_STRIP_X = STATUS_SLOT_X + STATUS_PAD; // 292
const STATUS_STRIP_Y = STATUS_SLOT_Y + 1; // 顶部只保留 1px，和底部视觉边距对齐
const STATUS_STRIP_W = STATUS_SLOT_W - STATUS_PAD * 2; // 246
/** 滚动条相对视口底边的下移量（视口 54..81 → 条 83..93，外框底线 93 ⇒ 条下沿贴合底线）。
 *  条粗仍是 10，只移动位置。 */
const STATUS_BAR_GAP = 2;
/** 横向滚动条粗细：10（与装备页道具栏横向滚动条同款），本轮**不变**。
 *  autoHide=false ⇒ 即使 5 格正好放下（maxW=0）滚动条也照常画（Ui.ts:520，同"显示技能"面板 7 行时的竖条）。 */
const STATUS_SCROLLBAR_W = 10;
/** 槽底填充色：车队目录 · 装备 · 道具栏同款（CaravanMenu.ts:2092-2093 的 4208688 @0.4）。
 *  ⚠️ 不能直接照抄 4208688 @0.4：装备页该槽底下是**浅灰页背景**，0.4 的通明白叠加后呈"深色内凹井"；
 *  而人员页中列背景近黑（实测 rgb(2,4,3)），同样的 0.4 叠加只会算出 rgb(49,42,36)——
 *  比周围**更亮**，看起来和旧的 白@0.18 没区别（用户反馈"配色没变化"即此因）。
 *  故这里取装备页槽底的**实测合成结果** rgb(87,71,59) 并置为不透明，保证在任何背景上观感一致。 */
const STATUS_CELL_BG = 0x57473b; // 装备页道具栏槽底实测色 rgb(87,71,59)
const STATUS_CELL_BG_ALPHA = 1;
const STATUS_OUTER_BG = 0x57473b;
const STATUS_OUTER_BG_ALPHA = 1;
/** 图标在正方形格子内的最长边（图标本身等比缩放居中，不拉伸变形）。
 *  用户反馈原 36px 太大 → 改为 50%（18px）。 */
const ICON_MAX = 18;
/** 边框配色：**同时用于槽位外框和每个格子的边框**，与车队目录 · 装备 · 道具栏一致
 *  （CaravanMenu.ts:2088-2091 的 drawConcaveRect(-1,-1,w+2,h+2)）：上/右 = 白 0.3，下/左 = 黑 0.6，1px。
 *  ⚠️ 透明度同样不能照抄：装备页槽底下是浅灰背景，白 0.3 叠出 rgb(105,102,94) 的明显高光；
 *  人员页背景近黑，白 0.3 只能叠出 rgb(77,77,77)，高光几乎看不见。这里改用**不透明**实色
 *  复刻装备页的观感：高光 0x69665e、阴影 0x141412（均为装备页边缘实测值）。 */
const STATUS_FRAME_LIGHT = 0x69665e; // 装备页上/右高光实测 rgb(105,102,94)
const STATUS_FRAME_LIGHT_ALPHA = 1;
const STATUS_FRAME_DARK = 0x141412; // 装备页下/左阴影实测 rgb(20,20,18)
const STATUS_FRAME_DARK_ALPHA = 1;
/** 染色同 BattleHud：PNG 是均匀深灰剪影 rgb(55,53,53)，乘法+加法提亮/压暗。 */
// Keep the source icon color. The yellow cast came from the previous
// BRIGHT_TINT additive offsets, so the status icon is now drawn once neutrally.
const STATUS_ICON_TINT: Tint = { r: 1, g: 1, b: 1, dr: 0, dg: 0, db: 0 };

interface StatusDef { file: string; kind: string; zh: string; en: string }
/** 五个状态：三个部位伤 + 受伤（不细分轻/中/重/濒死）+ 超重。 */
const STATUS_DEFS: StatusDef[] = [
  { file: "IndicatorEyeDamage.png", kind: "eyeDamage", zh: "眼部受伤", en: "Eye injury" },
  { file: "IndicatorArmDamage.png", kind: "armDamage", zh: "上肢受伤", en: "Arm injury" },
  { file: "IndicatorLegDamage.png", kind: "legDamage", zh: "下肢受伤", en: "Leg injury" },
  { file: "IndicatorCriticallyWounded.png", kind: "wounded", zh: "受伤", en: "Wounded" },
  { file: "IndicatorOverload.png", kind: "overload", zh: "超重", en: "Overloaded" },
];

const isChinese = (menu: any) => menu?.ds?.language === 18 || menu?.ds?.language === 19;
const levelLabel = (menu: any) => (isChinese(menu) ? "等级" : "Level");

/** 状态是否命中：部位伤读 Character 的 0/1 字段；受伤=wounded>0（1-4 一律"受伤"）；
 *  超重同原版 BattleField.as:6666（equipmentWeight > capacity）。 */
function statusActive(p: any, kind: string): boolean {
  if (kind === "wounded") return (Number(p.wounded) || 0) > 0;
  if (kind === "overload") return Number(p.equipmentWeight ?? 0) > Number(p.capacity ?? 0);
  return !!p[kind];
}

/** 当前要显示的状态格：**只有真的出现该问题时才占格子**（用户要求）。
 *  顺序即 STATUS_DEFS 顺序；职业格（后续）排在最左，这里先留好插队点。 */
function statusList(p: any): Array<StatusDef & { label: string }> {
  return STATUS_DEFS
    .filter((def) => statusActive(p, def.kind))
    .map((def) => ({ ...def, label: def.zh }));
}

/** 共享悬停面板（挂窗口根，最顶层；同 ItemInfo/装备页用法，坐标为屏幕坐标）。 */
function statusPanel(menu: any): CursorInfoPanel {
  if (!menu.__revivalStatusPanel) {
    const panel = new CursorInfoPanel();
    if (menu.screen) panel.attach(menu.screen);
    menu.__revivalStatusPanel = panel;
  }
  return menu.__revivalStatusPanel as CursorInfoPanel;
}

/** 画一个图标进格子：等比缩放 + 居中，缩放按"最长边 = ICON_MAX"归一，忽略原图尺寸。 */
function makeStatusIcon(menu: any, cell: Sprite, file: string, tint: Tint, cellW: number, cellH: number, visible: boolean): void {
  const holder = new Sprite();
  holder.mouseEnabled = false;
  holder.visible = visible;
  cell.addChild(holder);
  const put = (img: HTMLImageElement | null) => {
    if (!img || !holder.parent) return;
    const nw = (img as any).naturalWidth || img.width || 1;
    const nh = (img as any).naturalHeight || img.height || 1;
    const k = ICON_MAX / Math.max(nw, nh);
    const b = new BitmapObject(img);
    b.scaleX = b.scaleY = k;
    b.x = (cellW - nw * k) / 2;
    b.y = (cellH - nh * k) / 2;
    b.colorTransform = tint;
    b.mouseEnabled = false;
    holder.addChild(b);
  };
  const im = menu.assets.getImage(file) as HTMLImageElement | null;
  if (im) put(im); else void menu.assets.ensure(file).then(put);
}

/** 生命行上方：横向可滚动的状态槽位（正方形格子 + 装备页道具栏同款槽底/边框）。
 *  用原版 ScrollableArea 的横向滚动条（vertical=false 时启用横条，条画在视口底边 y=h），
 *  所以视口高 = 格子 24 + 格↔条边距 3 = 27，条再画在 27..37；格子顶部对齐 ⇒ 格底与条顶留 3px。
 *  外框 39 高：2px 上边距 + 27 视口 + 条 10 = 39，条由 barDrop 下移 2px 贴住外框底边，框本身不占外层布局。 */
function buildStatusSlot(menu: any, S: Sprite, p: any): void {
  const panel = statusPanel(menu);
  const strip = new ScrollableArea(
    STATUS_STRIP_W, STATUS_STRIP_H, STATUS_STRIP_W, STATUS_STRIP_H,
    false, true, false, STATUS_SCROLLBAR_W, 15, menu.assets,
  );
  strip.x = STATUS_STRIP_X;
  strip.y = STATUS_STRIP_Y;
  const shown = statusList(p);
  shown.forEach((def, i) => {
    const cell = new Sprite();
    cell.x = i * (STATUS_CELL + STATUS_CELL_GAP);
    cell.y = 0; // 顶部对齐：视口比格子高 3px，多出的 3px 就是格底到滚动条顶边的边距
    // ScrollableArea.updateSize() 用 (width ?? textWidth ?? 30) 量内容宽：Sprite 没有 width，
    // 这里显式给出格子边长，否则每格只算 30px。
    (cell as any).width = STATUS_CELL;
    (cell as any).height = STATUS_CELL;
    cell.buttonMode = true;
    const g = new Graphics();
    // Original icon-cell drawing: its own fill, inset border, and two icon layers.
    g.lineStyle(1, STATUS_FRAME_LIGHT, STATUS_FRAME_LIGHT_ALPHA);
    g.moveTo(-1, STATUS_CELL + 1); g.lineTo(STATUS_CELL + 1, STATUS_CELL + 1); g.lineTo(STATUS_CELL + 1, -1);
    g.lineStyle(1, STATUS_FRAME_DARK, STATUS_FRAME_DARK_ALPHA);
    g.lineTo(-1, -1); g.lineTo(-1, STATUS_CELL + 1);
    g.beginFill(STATUS_CELL_BG, STATUS_CELL_BG_ALPHA);
    g.drawRect(0, 0, STATUS_CELL, STATUS_CELL);
    g.hitRect(0, 0, STATUS_CELL, STATUS_CELL);
    cell.graphics = g;
    makeStatusIcon(menu, cell, def.file, STATUS_ICON_TINT, STATUS_CELL, STATUS_CELL, true);
    const rows: CursorRow[] = [{ text: def.label, center: true, font: 14 }];
    cell.addEventListener("pointerover", () => panel.show(Input.mouseX, Input.mouseY, rows));
    cell.addEventListener("pointermove", () => panel.update(Input.mouseX, Input.mouseY, rows));
    cell.addEventListener("pointerout", () => panel.hide());
    strip.addContent(cell);
  });
  const r = strip as any;
  r.barDrop = STATUS_BAR_GAP; // 渲染与命中区共用：横向条从格子底边再下移 STATUS_BAR_GAP
  strip.updateSize();
  S.addChild(strip);
}

/** 槽位外框：与人员页技能框（"成长空间"所在框）同款 inset 画法：上/右白 0.3、下/左黑 0.6，含滚动条。
 *  线画在局部 (-1,-1) 与 (w,h) ⇒ 屏幕占 289..540 × 51..93，内部 250×41 刚好容下
 *  "2px 边距 + 24 格 + 3px 格↔条边距 + 2px barDrop + 10 滚动条"（格子条与外框因此有肉眼可见的间距）。 */
function buildStatusFrame(S: Sprite): void {
  const w = STATUS_SLOT_W;
  const h = STATUS_FRAME_H;
  const g = new Graphics();
  // Keep the empty status strip visibly recessed, matching equipment slots.
  // The icon cells are added only for active statuses, so this fill belongs on
  // the outer frame rather than on the ScrollableArea content.
  g.beginFill(STATUS_OUTER_BG, STATUS_OUTER_BG_ALPHA);
  g.drawRect(0, 0, w, h);
  g.endFill();
  const f = new Sprite();
  f.graphics = g;
  f.x = STATUS_SLOT_X;
  f.y = STATUS_SLOT_Y;
  f.mouseEnabled = false;
  S.addChild(f);
}

/** Visible two-contour border for the whole status strip.  It is separate
 * from the filled frame so the border can sit above the scrollbar/icons
 * without painting over their contents. */
function buildStatusOuterBorder(S: Sprite): void {
  const w = STATUS_SLOT_W;
  const h = STATUS_FRAME_H;
  const g = new Graphics();
  g.lineStyle(1, 0xffffff, 0.55);
  g.drawRect(-1, -1, w + 2, h + 2);
  g.lineStyle(1, 0x000000, 0.75);
  g.drawRect(1, 1, w - 2, h - 2);
  const border = new Sprite();
  border.graphics = g;
  border.x = STATUS_SLOT_X;
  border.y = STATUS_SLOT_Y;
  border.mouseEnabled = false;
  S.addChild(border);
}

/** 士气下一行：「等级 X」+ 同一行后面的经验条（与生命/士气条同款、同起点同宽度）。 */
function buildLevelRow(menu: any, S: Sprite, p: any, txtW: number): void {
  const xp = Number(p.totalExperience) || 0;
  const label = new EngineText(levelLabel(menu) + " " + levelOf(xp), 16777215, 14, "left", 290, CREW_ROW_Y.level, 250, 20);
  label.mouseEnabled = false;
  S.addChild(label);
  const barW = 240 - txtW;
  const g = new Graphics();
  g.lineStyle(1, 16777215);
  g.drawRect(txtW + 10, 2, barW, 14);
  g.beginFill(16777215);
  g.drawRect(txtW + 14, 6, Math.max(0, (barW - 8) * levelProgress(xp)), 6);
  const bar = new Sprite();
  bar.graphics = g;
  bar.x = 290;
  bar.y = CREW_ROW_Y.level;
  bar.mouseEnabled = false;
  S.addChild(bar);
  return;
}

/** 等级下一行：「技能点 X」+ 同行右侧「技能树」按钮。
 *  按钮样式同设置薪水按钮（Button(2) = InterfaceButton2Up/Down.png），
 *  但宽度强制与上一行经验条一致（经验条宽 = 240 − txtW，起点 = 290 + txtW + 10）。
 *  原版贴图固定 206 宽，这里用 scaleX 压到目标宽度，文字另画（Button 自带文字会被一起压扁）。 */
function buildSkillPointRow(menu: any, S: Sprite, p: any, txtW: number): void {
  const label = new EngineText(skillPointsLabel(menu, skillPointsOf(p)), 16777215, 14, "left", 290, CREW_ROW_Y.skills, 250, 20);
  label.mouseEnabled = false;
  S.addChild(label);
  menu.__revivalSkillPointsText = label;

  const barW = 240 - txtW;
  const btnX = 290 + txtW + 10;
  const btn = new Button(2, () => openSkillTree(menu, p), null, menu.assets);
  btn.x = btnX;
  btn.y = CREW_ROW_Y.skills - 4; // 28px 高按钮在 20px 行内垂直居中
  btn.scaleX = barW / 206;
  S.addChild(btn);
  const cap = new EngineText(skillTreeLabel(menu), 4469521, 13, "center", btnX, CREW_ROW_Y.skills - 1, barW, 20);
  cap.mouseEnabled = false;
  S.addChild(cap);
}

/** 行动值 + 速度合并成一行（用户要求）。
 *  原版是 242「行动值」与 262「速度」两条独立的 250 宽整行（标签左、数值右，CaravanMenu.ts:1147-1148）。
 *  直接把两行移到同一个 y 会让两组"右对齐数值"重叠，所以这里把原两行整行删掉，
 *  在同一条线上按**左右两半**各画一对：左半「行动值 ….」，右半「速度 ….",
 *  两半各占 122/124 宽（中间留 4px 空隙），数值在各半内右对齐。 */
function mergeApSpeedRow(menu: any, S: Sprite, p: any): void {
  const HALF = 122;
  const GAP = 4;
  const leftX = 290;
  const rightX = leftX + HALF + GAP; // 416
  const rows: Array<[string, string, number]> = [
    [panelTextOf(menu, 1095).toUpperCase(), String(Math.round(Number(p.maxAP) || 0)), leftX],
    [panelTextOf(menu, 6).toUpperCase(), (Math.round((Number(p.speed) || 0) * 10) / 10).toFixed(1), rightX],
  ];
  for (const [title, value, x] of rows) {
    const t = new EngineText(title, 16777215, 14, "left", x, CREW_AP_SPEED_Y, HALF, 20);
    t.mouseEnabled = false;
    S.addChild(t);
    const v = new EngineText(value, 16777215, 14, "right", x, CREW_AP_SPEED_Y, HALF, 20);
    v.mouseEnabled = false;
    S.addChild(v);
  }
}

/** renderPeople 跑完之后改页：删两行 → 量经验条基准宽 → 重排中间列 → 加槽位/等级行/技能点行。 */
function decorateCrewPage(menu: any): void {
  const S: Sprite | undefined = menu.__revivalPage;
  if (!S || !Array.isArray(S.children)) return;
  const p = menu.crewSelected;
  if (!p) return;
  const middle = S.children.filter((c: any) => typeof c.x === "number" && c.x >= 280 && c.x <= 545);
  for (const c of middle) if (CREW_ROW_DROP.indexOf(c.y) >= 0) S.removeChild(c);
  // 行动值(242) + 速度(262) 两行整行删掉，稍后由 mergeApSpeedRow 合成一行重画
  // （若只把它们移到同一 y，两组右对齐数值会重叠，见 mergeApSpeedRow 注释）。
  for (const c of middle) if (c.y === 242 || c.y === 262) S.removeChild(c);
  const hpLabel = middle.find((c: any) => c.y === 62 && c instanceof EngineText) as EngineText | undefined;
  const moLabel = middle.find((c: any) => c.y === 122 && c instanceof EngineText) as EngineText | undefined;
  const txtW = Math.max(hpLabel ? hpLabel.textWidth : 0, moLabel ? moLabel.textWidth : 0);
  for (const c of middle) {
    const ny = CREW_ROW_MOVE[c.y as number];
    if (ny !== undefined) c.y = ny;
  }
  buildStatusFrame(S);
  buildStatusSlot(menu, S, p);
  buildStatusOuterBorder(S);
  buildLevelRow(menu, S, p, txtW);
  buildSkillPointRow(menu, S, p, txtW);
  mergeApSpeedRow(menu, S, p);
  // 右侧人员列表底板：原版只给装备页铺了这层（CaravanMenu.ts:1910-1927 / 1958），
  // 人员页缺了它 ⇒ 每格的 #585450@0.8 托盘在近黑页底上看不出"槽"
  decorateCrewListBackdrop(S);
  // 被技能直接加成的技能值改成 base(+bonus)（例：治疗 100(+30)）
  decorateSkillValues(menu, S, p);
  // 面板若开着（换人后重渲染），点数行与本页同步刷新
  refreshSkillTree(menu, p);
}

/** 右侧人员列表底板（真正的根因修复）。
 *
 *  【根因】装备页在列表后面铺了一层 `addListBackdrop`（web/src/game/CaravanMenu.ts:1910-1927）：
 *  `beginFill(4208688, 0.7); drawRect(0, 0, 100, 429)` + 白0.3/黑0.6 内凹描边框。
 *  人员页**没有**这一层（`CaravanMenu.ts:1958` / `:2438` 只给装备页和物品池调用了它）。
 *  于是每格的 #585450@0.8 托盘直接压在近黑页底上，与周围几乎同值 ⇒ "槽"看不出来。
 *  对比实测（同一坐标）：装备页格内 rgb(74,66,59) vs 空白 rgb(70,60,51)；人员页格内
 *  rgb(87,80,73) vs 空白 rgb(83,69,58) —— 人员页正因缺少深色底板而失去对比。
 *
 *  【做法】照抄装备页那一层，铺在人员列表的滚动视口后面（100×429，与原版同尺寸同色）。
 *  只加背景，不碰任何格子内容，也不动 PeopleGrid / CaravanMenu 本体。 */
function decorateCrewListBackdrop(S: Sprite): void {
  const list = S.children.find(
    (c: any) => typeof c.x === "number" && Math.abs(c.x - 550) < 0.01 && Array.isArray(c.contentList),
  ) as any;
  if (!list) return;
  if ((S as any).__revivalCrewBackdrop) S.removeChild((S as any).__revivalCrewBackdrop);
  const layer = new Sprite();
  layer.mouseEnabled = false;
  layer.mouseChildren = false;
  const g = new Graphics();
  // 与原版 addListBackdrop 同款：areaBG 4208688 a0.7，100×429，起点为列表视口左上角。
  g.beginFill(4208688, 0.7);
  g.drawRect(0, 0, 100, 429);
  g.endFill();
  // 外框：白 0.3（上/右）+ 黑 0.6（下/左），坐标同原版 -1/+1 外扩。
  g.lineStyle(1, 16777215, 0.3);
  g.moveTo(-1, 430); g.lineTo(101, 430); g.lineTo(101, -1);
  g.lineStyle(1, 0, 0.6);
  g.lineTo(-1, -1); g.lineTo(-1, 430);
  layer.graphics = g;
  layer.x = list.x;
  layer.y = list.y;
  (S as any).__revivalCrewBackdrop = layer;
  S.addChild(layer);
  // 压到列表下面（列表是后加的，取它的下标插到它前面）
  const listIdx = S.children.indexOf(list);
  if (listIdx > 0) S.setChildIndex(layer, listIdx);
}

// ==================== 车队目录 · 人员页 · 技能树 ====================
// 面板外观照抄概观页「显示技能」：全屏 0.5 遮罩 + Dialogue 底 + 暗底 360×320 + 外框 362×322 + 列表。
// 区别（用户要求）：没有底部关闭按钮，关闭改到右上角，样式同用品页药品剂量 0/1/2/3 的 Switch(2) 按钮。
const TREE_PANEL = { x: 240, y: 48, w: 400, h: 400 };
const TREE_INNER = { x: 260, y: 68, w: 360, h: 320 };
/** 列表宽度与概观页「显示技能」一致（345 + 10px 滚动条）。 */
const TREE_LIST_W = 345;
/** 列表滚动条粗细：与车队目录其他页面一致（10px）。 */
const TREE_SCROLLBAR_W = 10;
const TREE_ROW_H = 26;
const TREE_HEAD_H = 24;
/** 关闭按钮：中心落在**外层**面板（Dialogue 底 240,48,400×400）的右上角 (640,48)，
 *  里面那层内容槽（260,68,360×320）的右上角 (621,67) 是上一版放错的位置。 */
const TREE_CORNER = { x: TREE_PANEL.x + TREE_PANEL.w, y: TREE_PANEL.y };
const TREE_CLOSE = { x: TREE_CORNER.x - 12.5, y: TREE_CORNER.y - 12.5, size: 25 };

/** 技能点 / 技能树的文本（原版 texts.json 没有这几个 id，按语言硬编码）。 */
const skillPointsLabel = (menu: any, n: number) => (isChinese(menu) ? "技能点 " : "Skill points ") + n;
const skillTreeLabel = (menu: any) => (isChinese(menu) ? "技能树" : "SKILL TREE");
const tierTitle = (menu: any, tier: number) => "T" + tier;
const tierHintLocked = (menu: any, tier: number) =>
  (isChinese(menu) ? "需先激活 T" + (tier - 1) + " 技能" : "NEEDS A T" + (tier - 1) + " SKILL");
const stateActive = (menu: any) => (isChinese(menu) ? "已激活" : "ACTIVE");
const stateLocked = (menu: any) => (isChinese(menu) ? "未解锁" : "LOCKED");
const stateCost = (menu: any) => (isChinese(menu) ? "1 点" : "1 PT");
const stateNoPoints = (menu: any) => (isChinese(menu) ? "点数不足" : "NO POINTS");
/** 置灰色：与「未解锁」同灰（也用于点数不足的技能行状态文字）。 */
const TREE_MUTED_COLOR = 8421504;
const TREE_ACTIVE_COLOR = 6749952;
const TREE_TEXT_COLOR = 16777215;

/** 面板文本 id（原版 texts.json）："面板数据修改类"效果的悬停说明直接拼这些文本 + 数值。 */
const TEXT_LEARNING_CAPACITY = 966; // 成长空间 / Learning Capacity
const TEXT_MAX_HP = 1096;            // 生命值 / HP
const TEXT_CAPACITY = 1271;          // 最大负重 / Carrying Capacity
const TEXT_FOOD_NEED = 998;          // 每日粮食需求 / Food Need per Day
const TEXT_MORALE = 200;             // 士气 / Morale

interface SkillDef {
  id: string;
  tier: number;
  zh: string;
  en: string;
  /** 自由描述：只给"不动面板数据"的效果用（面板数据类的由 effectLines() 自动生成，
   *  不再另写一段说明——用户要求悬停直接显示"面板文本 + 数值"，如"成长空间 +25%"）。 */
  effect?: string;
  effectEn?: string;
  /** 直接加成到技能属性：键 = Character 上的 getter/方法名，值 = 乘数（>1 增益）。 */
  skillMul?: Record<string, number>;
  maxHpMul?: number;
  capacityMul?: number;
  xpMul?: number;
  bmrMul?: number;
  /** 士气直接加成（点数，不是倍率）。 */
  moraleAdd?: number;
}
/** 乘数表构造（键 → 同一个乘数）。 */
function mulOf(keys: string[], v: number): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of keys) o[k] = v;
  return o;
}
/** 远程武器技能（category 2..4 = 需要弹药的武器，见 Battle.weaponCategory/needsAmmo）。
 *  刻意不含 rangedWeaponsSkill：它是"智力×10"的基座，各远程技能都由它派生
 *  （pistolSkill = rangedWeaponsSkill×0.7 + …），一起乘会变成双重加成（+44% 而不是 +20%）。 */
const RANGED_SKILLS = [
  "crossbowSkill", "rocketLauncherSkill", "pistolSkill", "rifleSkill",
  "machinegunSkill", "smgSkill", "shotgunSkill", "flamethrowerSkill",
];
/** 近战/肉搏技能。 */
const MELEE_SKILLS = ["meleeSkill", "unarmedSkill", "knivesSkill", "clubsSkill", "choppingSkill", "swordsSkill"];
/** 全部武器技能（远程 + 近战 + 投掷）。 */
const ALL_WEAPON_SKILLS = RANGED_SKILLS.concat(MELEE_SKILLS, ["throwSkill"]);

/** 技能树清单（18 个技能 / T0..T4）。表即真值：改这里就同时改树与效果。
 *  规律：面板数据类（生命值/成长空间/最大负重/每日粮食需求/士气/技能值）**不写** effect，
 *  悬停说明由 effectLines() 用面板文本 + 数值自动拼出来（例：快速学习 → "成长空间 +25%"）。 */
const SKILL_TREE: SkillDef[] = [
  // ---- T0：生存与基础成长 ----
  { id: "tough_body", tier: 0, zh: "强健体魄", en: "Tough Body", maxHpMul: 1.10 },
  { id: "pack_mule", tier: 0, zh: "负重训练", en: "Pack Mule", capacityMul: 1.20 },
  { id: "fast_learner", tier: 0, zh: "快速学习", en: "Fast Learner", xpMul: 1.25 },
  { id: "iron_stomach", tier: 0, zh: "铁胃", en: "Iron Stomach", bmrMul: 0.8 },
  // ---- T1：战斗辅助与生活 ----
  { id: "steady_aim", tier: 1, zh: "稳定瞄准", en: "Steady Aim", effect: "远程攻击 AP 消耗 −1（最低 3）", effectEn: "Ranged attack AP cost −1 (min 3)" },
  { id: "field_medic", tier: 1, zh: "战场急救", en: "Field Medic", effect: "急救效果 +50%", effectEn: "First aid healing +50%" },
  { id: "tracker", tier: 1, zh: "猎手直觉", en: "Tracker", effect: "采集/狩猎产出 +25%（按该项技能最强的成员判定）", effectEn: "Forage/hunt yield +25% (best member of the caravan)" },
  { id: "haggler", tier: 1, zh: "讨价还价", en: "Haggler", effect: "买入 −5% / 卖出 +5%（全队只生效一次）", effectEn: "Buy −5% / sell +5% (party-wide, once)" },
  // ---- T2：专业手艺 ----
  { id: "brawler", tier: 2, zh: "近战专家", en: "Brawler", skillMul: mulOf(MELEE_SKILLS, 1.2) },
  { id: "gunsmith", tier: 2, zh: "枪械精通", en: "Gunsmith", skillMul: mulOf(RANGED_SKILLS, 1.2) },
  { id: "mechanic", tier: 2, zh: "机械师", en: "Mechanic", skillMul: { mechanicSkill: 1.3 } },
  { id: "veterinarian", tier: 2, zh: "兽医", en: "Veterinarian", skillMul: { veterinarySkill: 1.3 } },
  // ---- T3：高阶专精 ----
  { id: "surgeon", tier: 3, zh: "外科医生", en: "Surgeon", skillMul: { doctorSkill: 1.3 } },
  { id: "unbreakable", tier: 3, zh: "铁人", en: "Unbreakable", maxHpMul: 1.15 },
  { id: "survivor", tier: 3, zh: "生存专家", en: "Survivor", effect: "士气衰减减半，饥渴累积 −30%", effectEn: "Morale decay halved, hunger/thirst −30%" },
  // ---- T4：传奇 ----
  { id: "veteran", tier: 4, zh: "老兵", en: "Veteran", skillMul: mulOf(ALL_WEAPON_SKILLS, 1.15) },
  { id: "leader", tier: 4, zh: "领袖", en: "Leader", moraleAdd: 15, effect: "全队只生效一次", effectEn: "party-wide, once" },
  { id: "legend", tier: 4, zh: "传奇", en: "Legend", xpMul: 1.5 },
];
const MAX_TIER = SKILL_TREE.reduce((m, s) => Math.max(m, s.tier), 0);

/** 技能点/已激活技能存在 Character 自己的字段上 → 随存档往返（SaveSystem 用 JSON 深拷贝 + Object.assign 还原）。 */
interface SkillState { spent: number; skills: Record<string, boolean> }
function skillState(p: any): SkillState {
  let st = p.revivalSkillTree as SkillState | undefined;
  if (!st || typeof st !== "object") { st = { spent: 0, skills: {} }; p.revivalSkillTree = st; }
  if (typeof st.spent !== "number" || !isFinite(st.spent) || st.spent < 0) st.spent = 0;
  if (!st.skills || typeof st.skills !== "object") st.skills = {};
  return st;
}
const skillPointsOf = (p: any): number =>
  Math.max(0, (levelOf(Number(p.totalExperience) || 0) - 1) * SKILL_POINTS_PER_LEVEL - skillState(p).spent);

/** 解锁规则：T0 永远可点；T(n) 需要 T(n−1) 里至少已激活 1 个技能。 */
function tierUnlocked(st: SkillState, tier: number): boolean {
  if (tier <= 0) return true;
  return SKILL_TREE.some((s) => s.tier === tier - 1 && !!st.skills[s.id]);
}
const skillOwned = (p: any, id: string) => !!skillState(p).skills[id];

/** 激活技能：扣 1 技能点 + 永久记录（效果接线待技能清单确认）。 */
function activateSkill(menu: any, p: any, def: SkillDef): void {
  const st = skillState(p);
  if (st.skills[def.id]) return;
  if (!tierUnlocked(st, def.tier)) return;
  if (skillPointsOf(p) <= 0) return;
  st.spent += SKILL_POINTS_PER_LEVEL;
  st.skills[def.id] = true;
  SKILL_REV++; // 加成缓存失效：新效果立刻生效
  const t = menu.__revivalSkillPointsText as EngineText | undefined;
  if (t) t.text = skillPointsLabel(menu, skillPointsOf(p));
  refreshSkillTree(menu, p);
  // 立刻刷新整页数据（用户反馈：给 80 血角色点「强健体魄」后，关面板血量/上限还是旧值，
  // 要重新点一次角色才更新）。renderPeople() 就是原版自己的刷新方式（CaravanMenu.ts:1524
  // 改薪水后也是 this.renderPeople()）：它会重建页容器 → 再次触发本 DLC 的 decorateCrewPage
  // → 生命/士气/等级/技能点/技能框数值（含"成长空间 600 (+150)"）全部按新状态重画。
  // 技能树面板挂在 menu.screen 上（不在 mainArea 里），所以不会被这次重建拆掉。
  try { menu.renderPeople(); } catch (err) { console.error("[revival] crew page refresh failed", err); }
}

/** 技能树列表内容（层级 → 技能行）。SkillDef 表驱动，改表即改树。 */
function rebuildTreeRows(list: ScrollableArea, menu: any, p: any): void {
  list.clearAll();
  const st = skillState(p);
  const pts = skillPointsOf(p);
  const zh = isChinese(menu);
  let y = 0;
  for (let tier = 0; tier <= MAX_TIER; tier++) {
    const unlocked = tierUnlocked(st, tier);
    const head = new Sprite();
    head.y = y;
    head.mouseEnabled = false;
    const hg = new Graphics();
    hg.lineStyle(1, 16777215, 0.25);
    hg.moveTo(0, TREE_HEAD_H - 4);
    hg.lineTo(TREE_LIST_W - 20, TREE_HEAD_H - 4);
    head.graphics = hg;
    head.addChild(new EngineText(tierTitle(menu, tier), unlocked ? 16777215 : 8421504, 14, "left", 2, 0, 60, 20));
    // 只在未解锁时给提示（用户要求：不要显示"已解锁"）
    if (!unlocked) {
      head.addChild(new EngineText(tierHintLocked(menu, tier), 8421504, 12, "right", 0, 1, TREE_LIST_W - 24, 20));
    }
    list.addContent(head);
    y += TREE_HEAD_H;
    for (const def of SKILL_TREE) {
      if (def.tier !== tier) continue;
      const owned = !!st.skills[def.id];
      const canBuy = !owned && unlocked && pts > 0;
      const row = new Sprite();
      row.y = y;
      (row as any).width = TREE_LIST_W - 10;
      const g = new Graphics();
      g.beginFill(15790320, owned ? 0.18 : canBuy ? 0.08 : 0.03);
      g.drawRect(2, 0, TREE_LIST_W - 24, TREE_ROW_H - 2);
      g.hitRect(2, 0, TREE_LIST_W - 24, TREE_ROW_H - 2);
      row.graphics = g;
      row.buttonMode = canBuy;
      row.mouseEnabled = true; // 所有行都要响应悬停（看效果）；点击由 activateSkill 内部再判一次
      const nm = new EngineText(zh ? def.zh : def.en, owned ? TREE_ACTIVE_COLOR : TREE_TEXT_COLOR, 14, "left", 10, 2, 200, 20);
      nm.mouseEnabled = false;
      row.addChild(nm);
      const affordable = pts > 0;
      const stTxt = owned ? stateActive(menu) : !unlocked ? stateLocked(menu) : affordable ? stateCost(menu) : stateNoPoints(menu);
      // 「点数不足」置灰（同「未解锁」的灰）
      const stCol = owned ? TREE_ACTIVE_COLOR : (!unlocked || !affordable) ? TREE_MUTED_COLOR : TREE_TEXT_COLOR;
      const sv = new EngineText(stTxt, stCol, 13, "right", 10, 3, TREE_LIST_W - 36, 20);
      sv.mouseEnabled = false;
      row.addChild(sv);
      // 悬停出效果说明（所有行都能看，包括未解锁/已激活的）
      const tip = skillEffectRows(menu, def);
      row.addEventListener("pointerover", () => showTreeTip(menu, tip));
      row.addEventListener("pointermove", () => updateTreeTip(menu, tip));
      row.addEventListener("pointerout", () => statusPanel(menu).hide());
      row.addEventListener("click", () => {
        try { activateSkill(menu, p, def); } catch (err) { console.error("[revival] activate skill failed", err); }
      });
      list.addContent(row);
      y += TREE_ROW_H;
    }
  }
  list.updateSize();
}

/** 技能树行的悬停说明：中文按固定字数折行（CursorInfoPanel 的 multiline 只按空格断词，中文没空格）。 */
function wrapText(s: string, per: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += per) out.push(s.slice(i, i + per));
  return out;
}

/** 面板文本（当前语言）：菜单有私有 text(id)（CaravanMenu.ts:78 = getText(ds, id, language)）。 */
function panelTextOf(menu: any, id: number): string {
  try {
    const s = menu?.text?.(id);
    if (typeof s === "string" && s) return s;
  } catch { /* 菜单没有这个方法就退回技能表文本 */ }
  return "";
}
/** 技能属性名 → 面板技能文本（用户要求：前面的技能文本直接取自面板技能文本）。 */
function panelSkillText(menu: any, prop: string): string {
  const item = (Character.skillsList as any[]).find((s) => s.skill === prop);
  const s = item ? panelTextOf(menu, item.name) : "";
  return s || prop;
}
/** 乘数 → "+25%" / "−20%"。 */
function pctText(mul: number): string {
  const d = (mul - 1) * 100;
  return (d < 0 ? "−" : "+") + Math.round(Math.abs(d) * 10) / 10 + "%";
}

/** 悬停效果行：面板数据修改类直接拼"面板文本 + 数值"（快速学习 → "成长空间 +25%"、
 *  强健体魄 → "生命值 +10%"、领袖 → "士气 +15"、近战专家 → "近距离搏斗、徒手肉搏… +20%"）；
 *  非面板类（AP 消耗 / 急救 / 产出 / 价格 / 衰减）用技能表里的自由描述。 */
function effectLines(menu: any, def: SkillDef): string[] {
  const zh = isChinese(menu);
  const out: string[] = [];
  const label = (id: number, zhFallback: string) => panelTextOf(menu, id) || zhFallback;
  if (def.xpMul) out.push(label(TEXT_LEARNING_CAPACITY, "成长空间") + " " + pctText(def.xpMul));
  if (def.maxHpMul) out.push(label(TEXT_MAX_HP, "生命值") + " " + pctText(def.maxHpMul));
  if (def.capacityMul) out.push(label(TEXT_CAPACITY, "最大负重") + " " + pctText(def.capacityMul));
  if (def.bmrMul) out.push(label(TEXT_FOOD_NEED, "每日粮食需求") + " " + pctText(def.bmrMul));
  if (def.moraleAdd) out.push(label(TEXT_MORALE, "士气") + " +" + def.moraleAdd);
  if (def.skillMul) {
    const muls = def.skillMul;
    // 按 Character.skillsList 的顺序列名字 ⇒ 与人员页技能框里的排列一致
    const names = (Character.skillsList as any[])
      .filter((s) => muls[s.skill] != null)
      .map((s) => panelSkillText(menu, s.skill));
    const uniq = Array.from(new Set(Object.values(muls))).map(pctText).join(" / ");
    out.push(names.join(zh ? "、" : ", ") + " " + uniq);
  }
  const free = (zh ? def.effect : def.effectEn || def.effect) || "";
  if (free) out.push(free); // 面板类也能再补一句（例：领袖的"全队只生效一次"）
  return out.filter((s) => s !== "");
}

function skillEffectRows(menu: any, def: SkillDef): CursorRow[] {
  const zh = isChinese(menu);
  const rows: CursorRow[] = [{ text: zh ? def.zh : def.en, font: 14, center: true }];
  for (const line of effectLines(menu, def)) {
    if (zh) for (const l of wrapText(line, 15)) rows.push({ text: l, center: true, dy: 16 });
    else rows.push({ text: line, multiline: true, dy: 16 });
  }
  return rows;
}
/** 悬停面板必须盖在技能树遮罩之上：抬到窗口根最后一个子节点。 */
function showTreeTip(menu: any, rows: CursorRow[]): void {
  const panel = statusPanel(menu);
  const sc = menu.screen;
  if (sc && panel.sprite.parent === sc) sc.setChildIndex(panel.sprite, sc.numChildren() - 1);
  panel.show(Input.mouseX, Input.mouseY, rows);
}
function updateTreeTip(menu: any, rows: CursorRow[]): void {
  statusPanel(menu).update(Input.mouseX, Input.mouseY, rows);
}

function closeSkillTree(menu: any): void {
  const ov = menu.__revivalSkillTreeOv as Sprite | null;
  if (ov && ov.parent) ov.parent.removeChild(ov);
  menu.__revivalSkillTreeOv = null;
  menu.__revivalSkillTreeList = null;
  try { statusPanel(menu).hide(); } catch { /* 面板可能还没建过 */ }
}

/** 面板开着时原地刷新列表（保留滚动位置）。 */
function refreshSkillTree(menu: any, p: any): void {
  const list = menu.__revivalSkillTreeList as ScrollableArea | undefined;
  if (!list) return;
  const keep = list.scroll;
  rebuildTreeRows(list, menu, p);
  list.scroll = keep;
}

/** 打开技能树面板（外观同概观页「显示技能」，关闭按钮改到右上角）。 */
function openSkillTree(menu: any, p: any): void {
  closeSkillTree(menu);
  const ov = new Sprite();
  const bg = new Graphics();
  bg.beginFill(0, 0.5);
  bg.drawRect(0, 0, 880, 495);
  bg.hitRect(0, 0, 880, 495);
  ov.graphics = bg;
  addDialogueBackground(ov, menu.assets, TREE_PANEL.x, TREE_PANEL.y, TREE_PANEL.w, TREE_PANEL.h, 0.2, undefined, false);
  const dark = new Sprite();
  const dg = new Graphics();
  dg.beginFill(4208688, 0.7);
  dg.drawRect(TREE_INNER.x, TREE_INNER.y, TREE_INNER.w, TREE_INNER.h);
  dark.graphics = dg;
  dark.mouseEnabled = false;
  ov.addChild(dark);
  const fr = new Sprite();
  const fg = new Graphics();
  fg.lineStyle(1, 16777215, 0.5);
  fg.drawRect(TREE_INNER.x - 1, TREE_INNER.y - 1, TREE_INNER.w + 2, TREE_INNER.h + 2);
  fr.graphics = fg;
  fr.mouseEnabled = false;
  ov.addChild(fr);
  const list = new ScrollableArea(TREE_LIST_W, TREE_INNER.h, TREE_LIST_W, TREE_INNER.h, true, false, false, TREE_SCROLLBAR_W, 15, menu.assets);
  list.x = TREE_INNER.x;
  list.y = TREE_INNER.y;
  rebuildTreeRows(list, menu, p);
  ov.addChild(list);
  // 右上角关闭：样式同用品页药品剂量 0/1/2/3（Switch(2) 25×25 + 同色数字位）
  const close = new Switch(2, true, () => closeSkillTree(menu), () => closeSkillTree(menu), null, null, 25, 25, false, menu.assets);
  close.x = TREE_CLOSE.x;
  close.y = TREE_CLOSE.y;
  ov.addChild(close);
  const xT = new EngineText("X", 3683376, 14, "center", TREE_CLOSE.x, TREE_CLOSE.y + 2, 25, 20);
  xT.mouseEnabled = false;
  ov.addChild(xT);
  menu.__revivalSkillTreeList = list;
  menu.__revivalSkillTreeOv = ov;
  menu.screen.addChild(ov);
}

// ==================== 技能树效果实装 ====================
// 全部加成走"宿主原型补丁 + 本 DLC 自己那份 Battle"，不 import 任何 UI 模块、不改 web/src：
//   · Character 的 getter/方法：maxHP / capacity / BMR / GDA / morale / 各技能属性
//   · 本 DLC 那份 Battle.prototype.modeAPOf（远程 AP）
//   · GameData.prototype 的私有周期函数：forageHuntStep（采集狩猎）、peopleCycleStep（人员周期）
//   · Economy.tradePrice（买卖价）
// 效果的唯一事实来源 = 各角色自己的 revivalSkillTree.skills（随存档往返）；
// 加成结果缓存在 WeakMap 里，激活任意技能时 SKILL_REV++ 让缓存失效。

/** 领袖士气加成 / 讨价还价幅度 / 猎手直觉产出倍率 / 稳定瞄准的最低 AP。 */
const LEADER_MORALE_BONUS = 15;
const HAGGLER_PRICE = 0.05;
const TRACKER_YIELD_MUL = 1.25;
const STEADY_AIM_MIN_AP = 3;
/** 采集物 id（World.ts:3997 c.addCargo(62, amount)）——用来区分采集与狩猎两段。 */
const FORAGE_ITEM = 62;
/** 生存专家：士气下降只保留一半；饥饿/口渴增量保留 70%。 */
const SURVIVOR_MORALE_KEEP = 0.5;
const SURVIVOR_NEED_KEEP = 0.7;

/** 技能效果版本号：任何激活都会自增 → 让 ownBonus/partyHas 的缓存失效。 */
let SKILL_REV = 0;

/** 只读检查某角色是否已激活某技能（绝不写字段：不能用 skillState，它会补建对象污染存档）。 */
const hasSkill = (p: any, id: string): boolean =>
  !!(p && p.revivalSkillTree && p.revivalSkillTree.skills && p.revivalSkillTree.skills[id]);

interface OwnBonus { skillMul: Record<string, number>; maxHpMul: number; capacityMul: number; xpMul: number; bmrMul: number }
const BONUS_CACHE = new WeakMap<object, { rev: number } & OwnBonus>();

/** 单个角色自身技能的加成合计（不含"全队唯一"效果）。 */
function ownBonus(p: any): OwnBonus {
  if (!p || typeof p !== "object") return { skillMul: {}, maxHpMul: 1, capacityMul: 1, xpMul: 1, bmrMul: 1 };
  const hit = BONUS_CACHE.get(p);
  if (hit && hit.rev === SKILL_REV) return hit;
  const b: { rev: number } & OwnBonus = { rev: SKILL_REV, skillMul: {}, maxHpMul: 1, capacityMul: 1, xpMul: 1, bmrMul: 1 };
  const skills = p.revivalSkillTree && p.revivalSkillTree.skills;
  if (skills) for (const def of SKILL_TREE) {
    if (!skills[def.id]) continue;
    if (def.skillMul) for (const k of Object.keys(def.skillMul)) b.skillMul[k] = (b.skillMul[k] ?? 1) * def.skillMul[k];
    if (def.maxHpMul) b.maxHpMul *= def.maxHpMul;
    if (def.capacityMul) b.capacityMul *= def.capacityMul;
    if (def.xpMul) b.xpMul *= def.xpMul;
    if (def.bmrMul) b.bmrMul *= def.bmrMul;
  }
  BONUS_CACHE.set(p, b);
  return b;
}

/** 玩家队伍（Caravans[0]）——全队唯一效果只认这一队。 */
function playerParty(): any[] {
  const ds = (Character as any).ds?.() ?? (globalThis as any).__c2?.ds;
  const c = ds && Array.isArray(ds.Caravans) ? ds.Caravans[0] : null;
  return c && Array.isArray(c.People) ? c.People : [];
}
/** 全队唯一：任一成员激活即生效，多人激活不叠加（用户要求：领袖 / 讨价还价）。
 *  每次现算（队伍最多几十人，访问链很浅）：不缓存，避免换人后读到过期结果。 */
function partyHas(id: string): boolean {
  for (const m of playerParty()) if (hasSkill(m, id)) return true;
  return false;
}

type SkillFn = (self: any, ...args: any[]) => number;
/** 打补丁前的原值（"括号内额外值"就靠它算）；也是未加成数值的唯一真值来源。 */
const SKILL_ORIG: Record<string, SkillFn> = {};
const SKILL_PATCHED: Record<string, true> = {};

/** 只读重定义原型 getter（保留原 set）。 */
function patchGetter(prop: string, wrap: (base: number, self: any) => number): void {
  const d = Object.getOwnPropertyDescriptor(Character.prototype, prop);
  if (!d || typeof d.get !== "function") return;
  const orig = d.get as (this: any) => number;
  Object.defineProperty(Character.prototype, prop, {
    configurable: true,
    enumerable: d.enumerable,
    get(this: any) { return wrap(orig.call(this), this); },
    set: d.set,
  });
}
/** 包装原型方法（doctorSkill/veterinarySkill/mechanicSkill 等生活技能在 web 里是方法）。 */
function patchMethod(prop: string, wrap: (base: number, self: any) => number): void {
  const orig = (Character.prototype as any)[prop];
  if (typeof orig !== "function") return;
  (Character.prototype as any)[prop] = function (this: any, ...args: any[]) { return wrap(orig.apply(this, args), this); };
}
/** 技能属性（getter 或方法都支持）：按本角色的加成乘一下，并记下原值供显示用。 */
function patchSkillValue(prop: string): void {
  if (SKILL_PATCHED[prop]) return;
  const d = Object.getOwnPropertyDescriptor(Character.prototype, prop);
  if (d && typeof d.get === "function") {
    const orig = d.get as (this: any) => number;
    SKILL_ORIG[prop] = (self: any) => orig.call(self);
    patchGetter(prop, (base, self) => base * (ownBonus(self).skillMul[prop] ?? 1));
  } else if (typeof (Character.prototype as any)[prop] === "function") {
    const orig = (Character.prototype as any)[prop] as AnyFn;
    SKILL_ORIG[prop] = (self: any, ...a: any[]) => orig.apply(self, a);
    patchMethod(prop, (base, self) => base * (ownBonus(self).skillMul[prop] ?? 1));
  } else return;
  SKILL_PATCHED[prop] = true;
}

/** 技能属性当前值 + 未加成原值 + 括号里的额外值。 */
function skillValueNow(p: any, prop: string): { base: number; value: number; bonus: number } {
  const cur = (p as any)[prop];
  const value = Number(typeof cur === "function" ? cur.call(p) : cur) || 0;
  const orig = SKILL_ORIG[prop];
  const base = orig ? Number(orig(p)) || 0 : value;
  return { base, value, bonus: value - base };
}

/** 稳定瞄准：远程武器（category 2..4 = 需要弹药的武器）攻击 AP −1，最低 3。
 *  包的是本 DLC 自己那份 Battle.prototype.modeAPOf（宿主 Battle.ts 那份只在未启用 DLC 时用）。 */
function patchBattleHooks(): void {
  const proto = Battle.prototype as any;
  const orig = proto.modeAPOf;
  if (typeof orig !== "function" || proto.__revivalAPPatched) return;
  proto.__revivalAPPatched = true;
  proto.modeAPOf = function (this: any, u: any, mode?: any) {
    const base = orig.call(this, u, mode);
    const ch = u && u.character;
    if (!ch || !hasSkill(ch, "steady_aim")) return base;
    let cat = 0;
    try { cat = this.weaponCategory(u); } catch { return base; }
    if (cat < 2 || cat > 4) return base;
    return Math.max(STEADY_AIM_MIN_AP, base - 1);
  };
}

/** 队伍里"该技能值最高"的成员是否拥有某技能（与该活动的经验归属口径一致）。 */
function bestSkillHas(party: any[], method: string, id: string): boolean {
  let best: any = null, bv = -Infinity;
  for (const p of party) {
    let v = 0;
    try { const f = p && p[method]; v = typeof f === "function" ? Number(f.call(p)) || 0 : Number(f) || 0; } catch { v = 0; }
    if (v > bv) { bv = v; best = p; }
  }
  return !!best && hasSkill(best, id);
}

/** 猎手直觉：采集/狩猎产出 +25%。
 *  包私有 GameData.forageHuntStep（World.ts:3986）：调用期间把该车队的 addCargo 换成放大版，退出还原。
 *  采集(item 62) 看队伍里 collectingSkill 最高的人，狩猎看 huntingSkill 最高的人。 */
function patchForageHunt(): void {
  const proto = (GameData as any).prototype;
  const orig = proto && proto.forageHuntStep;
  if (typeof orig !== "function" || proto.__revivalForagePatched) return;
  proto.__revivalForagePatched = true;
  proto.forageHuntStep = function (this: any, ...args: any[]) {
    const c = this && Array.isArray(this.Caravans) ? this.Caravans[0] : null;
    const party: any[] = c && Array.isArray(c.People) ? c.People : [];
    const boostForage = bestSkillHas(party, "collectingSkill", "tracker");
    const boostHunt = bestSkillHas(party, "huntingSkill", "tracker");
    if (!c || typeof c.addCargo !== "function" || (!boostForage && !boostHunt)) return orig.apply(this, args);
    const add = c.addCargo;
    c.addCargo = function (this: any, item: number, amount: number) {
      const boost = item === FORAGE_ITEM ? boostForage : boostHunt;
      return add.call(this, item, boost ? amount * TRACKER_YIELD_MUL : amount);
    };
    try { return orig.apply(this, args); } finally { c.addCargo = add; }
  };
}

/** 生存专家：士气衰减减半，饥饿/口渴累积 −30%。
 *  士气/饥渴全部内联在私有 GameData.peopleCycleStep（World.ts:4085）里，没有专用钩子，
 *  所以前后快照再按比例回补——只影响拥有该技能的人，且只削"变差"的那部分。 */
function patchSurvivor(): void {
  const proto = (GameData as any).prototype;
  const orig = proto && proto.peopleCycleStep;
  if (typeof orig !== "function" || proto.__revivalSurvivorPatched) return;
  proto.__revivalSurvivorPatched = true;
  proto.peopleCycleStep = function (this: any, ...args: any[]) {
    const c = this && Array.isArray(this.Caravans) ? this.Caravans[0] : null;
    const party: any[] = c && Array.isArray(c.People) ? c.People : [];
    const watched = party.filter((p) => hasSkill(p, "survivor"));
    if (!watched.length) return orig.apply(this, args);
    const snap = watched.map((p) => ({
      p,
      morale: Number(p._morale ?? p.morale ?? 50) || 0,
      hunger: Number(p.hunger ?? 0) || 0,
      thirst: Number(p.thirst ?? 0) || 0,
    }));
    const out = orig.apply(this, args);
    for (const s of snap) {
      const p = s.p;
      const m = Number(p._morale ?? 0) || 0;
      if (m < s.morale) p._morale = s.morale + (m - s.morale) * SURVIVOR_MORALE_KEEP;
      const h = Number(p.hunger ?? 0) || 0;
      if (h > s.hunger) p.hunger = s.hunger + (h - s.hunger) * SURVIVOR_NEED_KEEP;
      const t = Number(p.thirst ?? 0) || 0;
      if (t > s.thirst) p.thirst = s.thirst + (t - s.thirst) * SURVIVOR_NEED_KEEP;
    }
    return out;
  };
}

/** 讨价还价：玩家买入 −5% / 卖出 +5%（全队唯一）。
 *  包 Economy.tradePrice（TradeWindow.ts:620 的唯一价格入口，amountAffordable 也走它）。 */
function patchHaggler(): void {
  const E = Economy as any;
  if (typeof E.tradePrice !== "function" || E.__revivalPricePatched) return;
  E.__revivalPricePatched = true;
  const orig = E.tradePrice;
  E.tradePrice = function (this: any, ds: any, partner: any, type: number, amount: number, isPartnerSide: boolean, shop?: any, free?: boolean) {
    const v = orig.call(this, ds, partner, type, amount, isPartnerSide, shop, free);
    if (!(v > 0) || free || !partyHas("haggler")) return v;
    return isPartnerSide ? v * (1 - HAGGLER_PRICE) : v * (1 + HAGGLER_PRICE);
  };
}

/** 装全部技能效果。任何一步失败只跳过那一步，绝不连坐原版。 */
function patchSkillEffects(): void {
  for (const def of SKILL_TREE) {
    if (!def.skillMul) continue;
    for (const k of Object.keys(def.skillMul)) {
      try { patchSkillValue(k); } catch (err) { console.error("[revival] skill value patch failed: " + k, err); }
    }
  }
  const guarded = (label: string, fn: () => void) => { try { fn(); } catch (err) { console.error("[revival] " + label + " patch failed", err); } };
  guarded("maxHP", () => patchGetter("maxHP", (base, self) => { const m = ownBonus(self).maxHpMul; return m === 1 ? base : Math.round(base * m); }));
  guarded("capacity", () => patchGetter("capacity", (base, self) => { const m = ownBonus(self).capacityMul; return m === 1 ? base : base * m; }));
  guarded("BMR", () => patchGetter("BMR", (base, self) => { const m = ownBonus(self).bmrMul; return m === 1 ? base : base * m; }));
  guarded("GDA", () => patchGetter("GDA", (base, self) => { const m = ownBonus(self).bmrMul; return m === 1 ? base : base * m; }));
  // 领袖：全队士气 +15（全队唯一）。setter 反向减掉，否则 peopleCycleStep 里
  // `p.morale = p.morale ?? 50` 这种"读自己的值再写回"会每周期自增一次。
  guarded("morale", () => {
    const d = Object.getOwnPropertyDescriptor(Character.prototype, "morale");
    if (!d || typeof d.get !== "function" || typeof d.set !== "function") return;
    const g = d.get as (this: any) => number, s = d.set as (this: any, v: number) => void;
    Object.defineProperty(Character.prototype, "morale", {
      configurable: true,
      enumerable: d.enumerable,
      get(this: any) { const base = g.call(this); return partyHas("leader") ? Math.min(100, base + LEADER_MORALE_BONUS) : base; },
      set(this: any, v: number) { s.call(this, partyHas("leader") ? v - LEADER_MORALE_BONUS : v); },
    });
  });
  guarded("battle", patchBattleHooks);
  guarded("forage", patchForageHunt);
  guarded("survivor", patchSurvivor);
  guarded("haggler", patchHaggler);
  guarded("status-bar", patchStatusBarDrop);
}

// ---------- 状态槽位的横向滚动条下移 ----------

/** 用户要求"横向滚动条下移，保持与槽位边框贴合"。
 *  本体 `ScrollableArea.render/hitTestPoint` 把横条画在内容紧下方（y=h..h+scrollbarW，`web/src/core/Ui.ts:520`），
 *  本体文件一律不改 → 这里在**实例**上挂 `barDrop`，再给原型打两个薄包装，把横条整体下移；
 *  只有带 `barDrop` 的实例受影响，其它滚动区（交易/装备/技能框）行为完全不变。 */
function patchStatusBarDrop(): void {
  const P = ScrollableArea.prototype as any;
  if (P.__revivalBarDropPatched) return;
  P.__revivalBarDropPatched = true;
  const origRender = P.render, origHit = P.hitTestPoint;
  if (typeof origRender !== "function" || typeof origHit !== "function") return;
  P.render = function (this: any, ctx: any, ...rest: any[]) {
    const d = this.barDrop as number | undefined;
    if (!d) return origRender.call(this, ctx, ...rest);
    ctx.save();
    ctx.translate(0, d);
    try { return origRender.call(this, ctx, ...rest); } finally { ctx.restore(); }
  };
  P.hitTestPoint = function (this: any, wx: number, wy: number) {
    const res = origHit.call(this, wx, wy);
    const d = this.barDrop as number | undefined;
    if (!d || res) return res; // 原位置就没命中 → 无需再试
    return origHit.call(this, wx, wy - d); // 横条实际画在下方 d 处 → 命中区同步下移
  };
}

// ---------- 技能加成的显示：base(+bonus) ----------

/** 与 CaravanMenu 的 nf() 同口径（四舍五入 + 千分位）。 */
const fmtNum = (v: number) => Math.round(v).toLocaleString();

/** 人员页技能框：被技能直接加成的技能值显示成"加满后的值 (+增量)"，例如 130 (+30)。
 *  renderPeople 的 skillRow 顺序：0 成长空间 / 1 总经验 / 2 战斗经验 / 3.. 26 项技能（每行 20px，从 y=80 起）；
 *  每行是**两个独立 addContent**（左标签 + 右数值）→ 数值固定在奇数下标，第 i 项技能 = 下标 7+2i。 */
function decorateSkillValues(menu: any, S: Sprite, p: any): void {
  if (!S || !Array.isArray(S.children) || !p) return;
  const list = (S.children as any[]).find((c) => c instanceof ScrollableArea && c.x === 290 && c.y === 322);
  const items: any[] = list ? (list as any).contentList : null;
  if (!Array.isArray(items)) return;
  // 第 0 行 = 成长空间（原版 skillRow(966, nf(p.learningCapacity*100), 0)）。快速学习/传奇会乘进
  // learningCapacity getter → 显示**增值后**的数值、括号里是增量："750 (+150)"
  // （用户要求面板数据直接显示加满后的值，与技能行的口径一致）。
  const lcItem = items[1];
  if (lcItem instanceof EngineText && Math.abs((lcItem.y ?? -1) - 0) < 0.01) {
    const lcBase = (Number(p.intelligence) || 0) * LEARNING_CAPACITY_FACTOR;
    const lcValue = Number(p.learningCapacity) || 0;
    lcItem.text = lcValue - lcBase > 0.5
      ? fmtNum(lcValue * 100) + " (+" + fmtNum((lcValue - lcBase) * 100) + ")"
      : fmtNum(lcValue * 100);
  }
  for (let i = 0; i < Character.skillsList.length; i++) {
    const def = Character.skillsList[i];
    if (!SKILL_ORIG[def.skill]) continue; // 没被技能加成的技能不动它的显示
    const vt = items[7 + i * 2];
    if (!(vt instanceof EngineText)) continue;
    if (Math.abs((vt.y ?? -1) - (80 + i * 20)) > 0.01) continue; // 原版行序变了就整体放弃
    const { base, value, bonus } = skillValueNow(p, def.skill);
    const scale = def.skill === "painThreshold" ? 100 : 1;
    const shownValue = value * scale, shownBase = base * scale;
    vt.text = bonus > 0.5 ? fmtNum(shownValue) + " (+" + fmtNum(shownValue - shownBase) + ")" : fmtNum(shownValue);
  }
  // 面板行（非 Character.skillsList）：每日粮食需求 = GDA。铁胃把 BMR/GDA 都乘 0.8，
  // 显示行在 y = 80 + 26×20 + 60 = 660（CaravanMenu.ts:1181），这里用"基础 GDA → 现 GDA"标成 "1,760 (−440)"。
  // 注意：contentList 是**扁平**的 EngineText 序列，标签行与数值行同 y（标签在前、数值在后），
  // 所以必须取该 y 上的**第二个**节点，取第一个只会改到「每日粮食需求」这个标签本身（原有 bug）。
  const needIdx = items.findIndex((it: any) => it instanceof EngineText && Math.abs((it.y ?? -1) - 660) < 0.01);
  const needRow = needIdx >= 0 && items[needIdx + 1] instanceof EngineText ? items[needIdx + 1] : null;
  if (needRow) {
    const needNow = Math.round(Number(p.GDA) || 0);
    const own = ownBonus(p).bmrMul;
    const needBase = own && own !== 1 ? Math.round(needNow / own) : needNow;
    needRow.text = needNow < needBase
      ? fmtNum(needNow) + " (−" + fmtNum(needBase - needNow) + ")"
      : fmtNum(needNow);
  }
}

/** 车队级技能 = People 里 category 1/2/5 的降序加权平均（World.ts:1399-1443 同式）。 */
function caravanAgg(people: any[], prop: string, patched: boolean): number {
  const orig = SKILL_ORIG[prop];
  const vals: number[] = [];
  for (const p of people) {
    if (!(p.category === 1 || p.category === 2 || p.category === 5)) continue;
    try {
      const raw = patched ? (p as any)[prop] : orig ? orig(p) : null;
      vals.push(Number(typeof raw === "function" ? raw.call(p) : raw) || 0);
    } catch { /* 个别成员算不出来就跳过 */ }
  }
  vals.sort((a, b) => b - a);
  let s = 0;
  for (let i = 0; i < vals.length; i++) s += vals[i] / (i + 1);
  return s;
}

/** 概观页「显示技能」面板：同样是"直接加成到技能属性"的显示，按同一口径标"加满值 (+增量)"。
 *  面板第 0/1/2 行 = 医生/兽医/机械（其余行没有直接加成）。 */
function decorateSkillsWindow(menu: any): void {
  const ov = menu && menu.skillsOv;
  if (!ov || !Array.isArray(ov.children)) return;
  const list = (ov.children as any[]).find((c) => c instanceof ScrollableArea);
  const rows: any[] = list ? (list as any).contentList : null;
  const c = menu.gd && Array.isArray(menu.gd.Caravans) ? menu.gd.Caravans[0] : null;
  if (!Array.isArray(rows) || !c || !Array.isArray(c.People)) return;
  const props = ["doctorSkill", "veterinarySkill", "mechanicSkill"];
  for (let i = 0; i < props.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row.children) || row.children.length < 2) continue;
    const vt = row.children[1];
    if (!(vt instanceof EngineText) || !SKILL_ORIG[props[i]]) continue;
    const patched = caravanAgg(c.People, props[i], true);
    const shown = Number(String(vt.text).replace(/[^0-9.-]/g, ""));
    if (!isFinite(shown) || Math.abs(Math.round(patched) - shown) > 0.5) continue; // 聚合口径变了就别乱改
    const base = caravanAgg(c.People, props[i], false);
    if (patched - base > 0.5) vt.text = fmtNum(patched) + " (+" + fmtNum(patched - base) + ")";
  }
}

type AnyFn = (this: any, ...args: any[]) => any;

/** 人员页补丁：改的是**实例**上的方法，不改 CaravanMenu.ts。
 *  注意这里刻意不 import（含动态 import）CaravanMenu：
 *  只要 DLC chunk 引用了它，Rollup 就会把 CaravanMenu 或 preload helper 塞进 DLC chunk，
 *  基础包首页随之 modulepreload 整个 DLC（实测 175–295KB）；改为从 shell 实例上取，chunk 图零影响。
 *  返回是否这次真的装上了补丁。 */
function patchCaravanMenu(menu: any): boolean {
  if (!menu || menu.__revivalCrewPatched) return false;
  menu.__revivalCrewPatched = true;
  // fleetPage() 会 mainArea.removeAll() 后新建页容器（renderPeople 第一句就调它）——
  // 顺手记下返回值，装饰阶段直接用，绝不重复调用（否则页面被清空）。
  const origFleetPage = menu.fleetPage as AnyFn;
  menu.fleetPage = function (this: any, ...args: any[]) {
    const page = origFleetPage.apply(this, args);
    this.__revivalPage = page;
    return page;
  };
  const origRenderPeople = menu.renderPeople as AnyFn;
  menu.renderPeople = function (this: any, ...args: any[]) {
    const out = origRenderPeople.apply(this, args);
    try {
      decorateCrewPage(this);
    } catch (err) {
      // 补丁失败绝不连坐原版页面：保留原布局照常显示
      console.error("[revival] crew page UI patch failed; base layout kept", err);
    }
    return out;
  };
  // 切页会统一 removeOverlays()：技能树面板挂在 screen 上，得跟着一起收掉
  const origRemoveOverlays = menu.removeOverlays as AnyFn;
  menu.removeOverlays = function (this: any, ...args: any[]) {
    const out = origRemoveOverlays.apply(this, args);
    try { closeSkillTree(this); } catch (err) { console.error("[revival] close skill tree failed", err); }
    return out;
  };
  // 概观页「显示技能」面板：被技能直接加成的行同样标"加满值 (+增量)"
  const origOpenSkills = menu.openSkillsWindow as AnyFn;
  if (typeof origOpenSkills === "function") {
    menu.openSkillsWindow = function (this: any, ...args: any[]) {
      const out = origOpenSkills.apply(this, args);
      try { decorateSkillsWindow(this); } catch (err) { console.error("[revival] skills window bonus display failed", err); }
      return out;
    };
  }
  return true;
}

/** 车队目录是懒创建的：包住 shell.showCaravanMenu，菜单一出现就装补丁。
 *  首次打开如果直接落在人员页，那一屏在装补丁前就渲染完了 → 补渲染一次。 */
function hookShell(shell: any): void {
  if (!shell || shell.__revivalShellHooked || typeof shell.showCaravanMenu !== "function") return;
  shell.__revivalShellHooked = true;
  const origShow = shell.showCaravanMenu as AnyFn;
  shell.showCaravanMenu = function (this: any, ...args: any[]) {
    const out = origShow.apply(this, args);
    const menu = this.caravanMenu;
    if (patchCaravanMenu(menu) && menu.category === 2) menu.renderPeople();
    return out;
  };
}

/** Uses the existing battle factory boundary; UI/world/save services stay shared. */
export default function register(api: ReturnType<ModRuntime["api"]>) {
  patchLearningCapacity();
  patchLevel();
  patchSkillEffects();
  api.on("game:boot", (payload: any) => hookShell(payload?.shell));
  api.on("shell:ready", (payload: any) => hookShell(payload?.shell));
  api.registerService("factory.battle", (...args: ConstructorParameters<typeof Battle>) => new Battle(...args));
  api.registerService("battle.animationRuntime", { id: "revival", version: 1 });
  api.registerService("battle.houndVisual", { load: loadHoundVisual });
}
