# 复兴 DLC：代码归属与使用说明

## 2026-09-27（第六轮）：项目级 skill「默认只改本 DLC + README 同步 + 推 GitHub」+ 修复根 README 编码（工具/文档轮，未改运行时代码）

### 用户需求（原话）

> 「帮我写一个skill，只对这个项目有效，让所有修改默认在revival dlc里进行，且修改完要同步更新readme.md，修改完要同步更新上传到github」

### 根因

- 前五轮都是"人肉遵守"这条纪律（每轮 README 里都写着"仍只改本 DLC"），但没有机器可执行的护栏：新会话／新 agent 进来不知道默认落点，也不知道改完要写文档、要推送。
- 顺带发现：根 `README.md` 第 1106–1108 行是 **GBK 字节**（非 UTF-8），导致 `read` 工具报 `invalid UTF-8 text`、整个文件读不了 —— 不修的话"改完同步更新 README"这条根本无法执行。

### 落地（本 DLC 运行时代码 0 改动）

| 文件 | 内容 |
| --- | --- |
| `.dsh/skills/revival-dlc-only/SKILL.md` | 项目级 skill。三条铁律：R1 默认只写 `web/public/mods/revival/`；R2 改完同步两份 README；R3 改完 commit + push `origin/main`。另含落点地图、本体改动的例外流程（先问用户 → 批准后两处 README 显式标注 → 跑 §10 回归）、README 写作格式、完成清单 |
| `.dsh/skills/revival-dlc-only/scripts/ship.ps1` | 一键收尾：越界检查（白名单 = DLC / 两份 README / `.dsh/skills/`）→ 两份 README 是否都改过 → UTF-8 无 BOM 校验 → `git add -A` → commit → push → 用 `origin/main..HEAD == 0` 校验推送真的落地；带 `-DryRun` / `-AllowOutOfScope` / `-SkipReadmeCheck` |
| 根 `README.md` | 尾部三行 GBK 字节按 GBK 解码后重写为 UTF-8（内容不变），文件恢复可读 |

DSH 从 **`<工程根>/.dsh/skills/<name>/SKILL.md`** 发现项目级 skill（工程根 = 最近的含 `.git` 的祖先目录），写入即生效、无需重启；本次写入后当场出现在技能目录里，已实测。

### 踩坑记录（避免重犯）

1. **`git status --porcelain` 默认把未跟踪目录折叠成 `dir/`**，于是 `.dsh/` 匹配不上 `^\.dsh/skills/` 白名单、被越界检查误报。改用 **`git status --porcelain -uall`** 逐文件列出后正常。
2. **本机没有 `pwsh`（PowerShell 7），只有 Windows PowerShell 5.1。** 文档与脚本里的调用一律写 `powershell -NoProfile -ExecutionPolicy Bypass -File`；`ship.ps1` 内所有输出刻意只用 ASCII —— 脚本本身是 UTF-8 无 BOM，5.1 会按 ANSI 读，中文会变乱码。
3. 与上一轮踩坑 #1 同源：**改含中文的 UTF-8 文件不要用 PowerShell 的 `Set-Content`/`Get-Content -Raw`**，一律用 `edit`/`write` 工具或 Node。本次 GBK 修复是**按字节定位后重新编码**，不是文本替换。

### 验证

- `ship.ps1 -DryRun`：正常路径 PASS（识别 3 个改动文件、编码校验通过、打印 commit/push 计划）。
- 负向用例 1：未改 `web/public/mods/revival/README.md` → 正确 `[FAIL] README not updated`，exit 1。
- 负向用例 2（修 `-uall` 前）：`.dsh/` 被误判越界 → 已修，修后 PASS。
- 根 `README.md` 编码：`UTF8Encoding($false,$true).GetString()` 不再抛异常；`read` 工具可读 1108 行全部内容。
- 本轮 commit 由 `ship.ps1` 自己推送（dogfood），推送后 `git log origin/main..main` 为空。

## 2026-09-28（第五轮）：人员列表补底板 + 状态槽配色真正落地（仍只改本 DLC）

### 用户需求（原话）

1. 「如图1，角色界面为什么人员列表的槽没了？按理来说图1的人员列表是有图2装备页面中位置一致的槽位的，请修复一下」
2. （承接上一条）「配色对齐装备页道具栏，这个我看着没变化啊，是不是没修改成功」

### 根因（两条都是"改了但看不出来"，且各有各的原因）

**① 状态槽配色：半透明色不能跨背景搬运。**
第一版照抄装备页 `4208688 @0.4` + `白0.3/黑0.6`。代码确实执行了（像素实测格内 `rgb(49,42,36)`＝理论值 `rgb(50,42,34)`），但**观感没变**：

| | 背景 | `#403830 @0.4` 叠上去 |
|---|---|---|
| 装备页道具栏 | 浅灰 | 呈**深色内凹井**，比周围暗 → 明显 |
| 人员页状态槽 | 近黑 `rgb(2,4,3)` | 算出 `rgb(49,42,36)`，比周围**更亮** → 与旧的白 0.18 几乎无异 |

∴ 改为取装备页槽底的**实测合成结果**并置为不透明：`STATUS_CELL_BG = 0x57473b`（`rgb(87,71,59)`，alpha 1）、`STATUS_OUTER_BG = 0x57473b`、`STATUS_FRAME_LIGHT = 0x69665e`（`rgb(105,102,94)`）、`STATUS_FRAME_DARK = 0x141412`（`rgb(20,20,18)`）。修正后与装备页道具栏槽底**逐像素相同**。

**② 人员列表的"槽"：真正的根因是缺一层底板，不是缺格子。**
排查用 A/B 对照（同坐标、DLC 开/关）证明 **DLC 从未破坏过人员列表**：

| | 格内 | 列表空白 |
|---|---|---|
| 原版（关 DLC） | `[94,88,83]` | `[90,80,69]` |
| 当前（开 DLC） | `[96,90,84]` | `[98,86,74]` |

每格的托盘 `#585450 @0.8`（`web/src/game/PeopleGrid.ts:65` 的 `rounded(bgG, opts.picBGColor ?? 5788752, 0.8)`）一直都在。真正缺的是**列表底板**：
- 装备页调用了 `addListBackdrop`（`web/src/game/CaravanMenu.ts:1910-1927`）：`beginFill(4208688, 0.7); drawRect(0, 0, 100, 429)` + 白0.3/黑0.6 内凹描边，**铺在列表后面**，人物格因此衬得出来。
- 人员页**没有调用它**（只有 `:1958` 装备页、`:2438` 物品池两处调用）。
- 对比实测：装备页格 `[74,66,59]` vs 空白 `[70,60,51]`（对比清楚）；人员页格 `[87,80,73]` vs 空白 `[83,69,58]`（几乎同值 ⇒ "槽没了"）。

### 落地（`runtime/index.ts`）

- 新增 `decorateCrewListBackdrop(S)`：照抄装备页那一层，铺在人员列表滚动视口后面（100×429，`beginFill(4208688, 0.7)` + 原版同款描边框），`layer.x/y = list.x/y`，并用 `setChildIndex` 压到列表下面。只加背景，不碰任何格子内容，也不动 `PeopleGrid.ts` / `CaravanMenu.ts`。
- 在 `decorateCrewPage` 末尾调用它。
- 修正 `STATUS_STRIP_H` 注释（`24 + 2 = 26`，注释原写 27）与外框自检式（1px 上边距 + 26 视口 + 2px barDrop + 10 条 = 39 → 屏幕 41px）。

### 踩坑记录（重要，避免重犯）

1. **PowerShell 不要用来改含中文的 UTF-8 文件。** `Set-Content -Encoding utf8` / `Get-Content -Raw` 组合会把 UTF-8 按 GBK 读再写回，导致整个文件 mojibake。本轮因此损坏了 `web/scripts/_crew_ui_probe.mjs`（403 个替换字符，最终**按实际实现重写**）与 `web/public/mods/revival/README.md` 的尾部（尾部字节用 `TextDecoder('gb18030')` 解码恢复，另修掉 7 个被写成退格符的 `\`）。改中文文件一律用 `edit`/`write` 工具或 Node。
2. **缩放坐标坑**：格子对象带 `scale=0.28`（70/250 母格）。把底板 `addChild` 进格子后，1px 边框被放大成 `1/0.28 = 3.57px` 并糊满整面（当时实测整格变高光色 `rgb(121,118,115)`）。最终采用"独立底板层 + 屏幕坐标"绕开缩放。
3. **`ScrollableArea` 的结构**：`contentList` 是数组、`Content` 是子容器，两者都在。外框在 `x=290,y=52` 上有**两个** Sprite —— 先加的填充（`rect 250×39`，1 op）、后加的描边（两个 `drawRect`，2 ops）；取四边必须取**最后一个**。
4. **`wounded` 由 game loop 依据 HP 重算**，直接写 `p.wounded = 0` 会被覆盖；要清掉"受伤"状态必须把 `p._HP = p.maxHP`。
5. 装备页的 `category` 是 **3** 不是 1（`CaravanMenu.ts:211`）；`showCaravanMenu(1)` 打开的是日记页，采样会取到流光背景色而误判。

### 验证

- `web/scripts/_crew_ui_probe.mjs`（**已按当前实现重写**）PASS：外框屏幕 `289..540 × 51..91`（宽 = 血条尾端 540，高 41px）；格子条 246×26 + 10px 横条下移 2px；"只画已出现的问题"用**清空归 0、只开眼部受伤恰好 1 格**两次实测证明；槽底/边框 = 装备页道具栏实测色；人员列表底板 = 装备页 `addListBackdrop` 同款，人物格 `82,68,52` 亮于列表空白 `71,62,53`；等级/技能点/行动值+速度合并行；技能树面板可开；反向关 DLC 后原版人员页原样。
- `web/scripts/_skill_ui_probe.mjs` PASS（几何断言同步到 y=53 / 高 26 / 外框 41px / 描边两个 `drawRect`）：成长空间 `1,000 → 1,250 (+250)`、机械 `60 (+14)`、外科医生 `240 → 312 (+72)`、每日粮食需求 `1,760 (−440)`、悬停说明与 T 层级文案均正常。
- `web/scripts/_skill_effects_probe.mjs` PASS（`maxHP 200 → 253`、`医疗 100 → 130`）。
- `npx tsc --noEmit` exit 0；`npx vite build` OK，基础 chunk 哈希不变（`engine-BUbVnH0e.js` 90.90 kB / `world-HwOgckCc.js` 462.84 kB / `battle-Cfe4nARO.js` 271.95 kB / `index-YDaLiHK8.js` 316.39 kB），`dist/index.html` 中 `mod-revival` 出现 **0** 次，DLC chunk `mod-revival-Brx-M3N2.js` 190.52 kB。

## 2026-09-26：人员页状态栏槽位底色

- 用户所指的“状态栏”是人员页中间列顶部、生命值文字上方的横向状态槽（`STATUS_SLOT_X/Y = 290/52`），不是生命值或士气进度条。
- `runtime/index.ts` 的 `buildStatusFrame()` 现在为该空槽加入与装备页槽位一致的内凹底色 `STATUS_CELL_BG`，并保留明暗双层边框；即使没有状态图标，空槽也可见。
- 本次没有修改 `web/src/game/CaravanMenu.ts`。修改运行时代码后请执行 `npm run build`，浏览器需重新加载构建结果。

## 当前架构（2026-09-13）

- 新动画的实现、数据、紧凑图集、生成器和专用验证页全部位于本 DLC 文件夹。
- 启用后通过通用 `factory.battle` 接口创建 DLC 内的 Battle；禁用并重新加载后使用本体旧 Battle，不加载本 DLC 数据、图集或执行代码。
- 本体只保留通用资源来源查询、受控内置 DLC 加载器及构建入口；不保留复兴专用动画实现。
- 运行时依赖本体共用的引擎、UI、世界和存档服务，不复制这些服务。源码入口为 `runtime/index.ts`，由 Vite 构建为独立 chunk，浏览器不直接执行公共目录的 TypeScript。
- 这是随工程发布的内置代码 DLC，修改运行时代码后需要重新构建；普通数据、图片和 HTML 描述 Mod 仍使用原有目录发现机制。没有全局放开第三方脚本执行。
- 维持原版 25 FPS 动作时点、死亡第 5 帧逻辑与第 7 帧倒地声，不降低分辨率。
- 本 DLC 当前复用原版部件帧，提供轨道、插槽、缓存及无损图集合并能力；不代表已经重画成完全由静态肢体旋转组成的新美术。

## 2026-09-28（第四轮）：状态图标与滚动条留距 + 槽位配色对齐装备页道具栏（含"半透明色不能跨背景搬运"修正）+ 行动值速度并成一行（仍只改本 DLC）

### 用户需求（原话）

1. 「状态图标跟滚动条之间也要保持边距；」
2. 「同时状态槽的边框颜色、槽内背景颜色改成跟车队目录-装备-道具栏一致」
3. 「行动值和速度合并成同一行」

### 落地内容（`runtime/index.ts`）

1. **状态图标 ↔ 滚动条留距**：新增 `STATUS_BAR_PAD = 3` 与 `STATUS_STRIP_H = STATUS_CELL + STATUS_BAR_PAD`（24 + 3 = 27）。`buildStatusSlot` 的 `ScrollableArea` 视口由 `STATUS_CELL`(24) 改为 `STATUS_STRIP_H`(27) —— 因为 `ScrollableArea` 的横条固定画在视口底边 `sy = this.h`（`web/src/core/Ui.ts:377`），视口高 3px 就凭空多出 3px 空白。格子仍 `cell.y = 0` 顶部对齐、`(cell as any).width/height = 24` 不变、条粗 10 不变；`maxH = max(0, 24 − 27) = 0` 无副作用。
   - 最终间距：格子底 78 → 条顶 83 = **5px**（3px 视口留白 + 2px `STATUS_BAR_GAP`）。外框因此由 41 加到 **`STATUS_FRAME_H = 41`**，屏幕范围 289..540 × **51..93**（43px）。
2. **槽底/格底/边框改成装备页道具栏的"观感"（关键修正）**：依据 `web/src/game/CaravanMenu.ts:2087-2093` 的 `g.beginFill(4208688, 0.4); g.drawRect(0, 0, w, h)` 与 `drawConcaveRect` 双层框。
   - **第一版直接照抄 `4208688 @0.4` + `白 0.3 / 黑 0.6`，用户反馈「配色没变化啊，是不是没修改成功」。** 代码确实生效了（像素实测格内 `[49,42,36]`、理论值 `[50,42,34]`，吻合），但**观感没变**，原因是背景差异：
     - 装备页该槽底下是**浅灰页背景**，`4208688 @0.4` 叠上去呈"深色内凹井"（槽内实测 `rgb(87,71,59)`、高光 `rgb(105,102,94)`、阴影 `rgb(20,20,18)`，都**比背景暗/亮得很明显**）。
     - 人员页中列背景**近黑**（实测 `rgb(2,4,3)`），同样的 `@0.4` 只能算出 `rgb(49,42,36)` —— **比周围更亮**，与旧的白 0.18 在观感上几乎无异。
     - ∴ **半透明色不能跨背景搬运**。改为取装备页槽底的**实测合成结果**并置为不透明，保证在任何背景上观感一致：
   - 常量最终值：`STATUS_CELL_BG = 0x57473b`（`rgb(87,71,59)`，`ALPHA = 1`）；`STATUS_FRAME_LIGHT = 0x69665e`（`rgb(105,102,94)`，`ALPHA = 1`）；`STATUS_FRAME_DARK = 0x141412`（`rgb(20,20,18)`，`ALPHA = 1`）。原来分别是 `16777215/0.18`、`16777215/0.3`、`0/0.6`。
   - 格子绘制结构不变（仍是"上/右高光 + 下/左阴影的内凹双层 1px 框 + `beginFill` 槽底 + `hitRect`"），槽位外框沿用同一套 `STATUS_FRAME_LIGHT/DARK`。
   - 修正后像素实测：格内 `[87,71,59]`，**与装备页道具栏槽底实测值逐一相同**。
3. **行动值 + 速度合并成一行**：`CREW_ROW_MOVE` 改为 `242: 256, 262: 256`，新增常量 `CREW_AP_SPEED_Y = 256`；`decorateCrewPage` 在删 `CREW_ROW_DROP` 之后新增 `for (const c of middle) if (c.y === 242 || c.y === 262) S.removeChild(c);` —— **必须整行删掉**，因为原版 `pair()`（`web/src/game/CaravanMenu.ts:1125-1128`）给每条 250 宽整行做了左右对齐，两行搬到同一 y 会重叠。
   - 新增 `mergeApSpeedRow(menu, S, p)`：`HALF = 122`、`GAP = 4`、`leftX = 290`、`rightX = 416`；左半「行动值」`String(Math.round(Number(p.maxAP)||0))`、右半「速度」`(Math.round((Number(p.speed)||0)*10)/10).toFixed(1)`（1 位小数，对齐原版 `nf(p.speed, 1)`），每半各自画 left 对齐标签 + right 对齐数值，字体 14 颜色 16777215。文本 id：1095 = 行动值、6 = 速度。
   - 注：`fmtNum`（`runtime/index.ts:958`）只收 1 个参数且会 `Math.round`，**不能**用于要保留 1 位小数的速度。

### 验证

- 三个探针全 PASS：`web/scripts/_crew_ui_probe.mjs`（新增 `apSpeed` 断言：原 242/262 行 0 残留、y=256 上 4 个文本）、`web/scripts/_skill_ui_probe.mjs`、`web/scripts/_skill_effects_probe.mjs`。
- 探针踩坑记录：① 格子 `graphics.ops[0]` 现在是 `moveTo`（边框先画），取底色填充必须 `ops.find(o => o.k === 'rect' && o.fill)`；② 填充色十六进制是 **`#57473b`**（修正后；第一版的 `#403830` 已废弃）；③ `EngineText` 右对齐是「x 不动、`textWidth` 撑大」，合并行数值节点的 x 与标签同值（290 / 416），不能按 `x >= 400` 找；④ 像素期望值由「页面底色叠 `rgba(64,56,48,0.4)`」改为**固定的 `[87,71,59]`**（因为已改成不透明实色，与背景无关）；⑤ 装备页的 `category` 是 **3** 不是 1 —— `showCaravanMenu(1)` 打开的是日记页，采样会取到流光背景色而误判。
- `npx tsc --noEmit` exit 0；`npx vite build` OK，基础 chunk 哈希不变（`engine-BUbVnH0e.js` 90.90 kB / `world-HwOgckCc.js` 462.84 kB / `battle-Cfe4nARO.js` 271.95 kB / `index-C2sqf06j.js` 316.39 kB），`dist/index.html` 中 `mod-revival` 出现 **0** 次（仍只有 3 个 modulepreload），DLC chunk `mod-revival-BmsX_Lww.js` 189.84 kB。

## 2026-09-28（第三轮）：状态条贴合外框 + 只显示已出现的问题 + 粮食需求减量修正（仍只改本 DLC）

### 用户需求（原话）

1. 「状态栏槽位放大后，状态栏的横向滚动条要同步下移一下，保持与槽位边框贴合」
2. 「五种状态，要只有当出现对应问题的时候才会显示，比如眼部受伤，才会显示眼部受伤状态等等」
3. 「为什么点了铁胃技能后，每日粮食需求没有显示括号内减量？修复一下」

### 落地内容（`runtime/index.ts`）

1. **横向滚动条下移贴外框底边**：新增常量 `STATUS_BAR_GAP = 2`，条整体下移 2px（格子底 78 → 条 80..90，外框底线 91，条下沿落在底线内侧 1px ⇒ 视觉贴合）。
   - `STATUS_SCROLLBAR_W`、`STATUS_FRAME_H`、`STATUS_SLOT_W`、格子尺寸**一律不变**（外框仍 289..540 × 51..91 = 250×41px，条粗 10px）。第一版曾误把条 10→6、外框高 39→33，用户纠正「我只要求你下移滚动条，没叫你修改滚动条的大小啊」后已回退 —— 教训：用户只说「下移」就只下移，不顺带改粗细或尺寸。
   - 本体 `web/src/core/Ui.ts` **一字未改**：新增 DLC 侧 `patchStatusBarDrop()`，给 `ScrollableArea.prototype` 打 `__revivalBarDropPatched`，包住 `render`（有 `this.barDrop` 时 `ctx.save(); ctx.translate(0, d); …; ctx.restore()`）与 `hitTestPoint`（原位未命中则按 `wy - d` 重试，滑块命中区随条下移）。实例上由 `buildStatusSlot` 设 `(strip as any).barDrop = STATUS_BAR_GAP`。
2. **只显示已出现的问题**：新增 `statusList(p) = STATUS_DEFS.filter((def) => statusActive(p, def.kind)).map((def) => ({ ...def, label: def.zh }))`；`buildStatusSlot` 改为 `const shown = statusList(p); shown.forEach(...)`，不再无条件建 5 格。格子边框固定 0.85 不透明（去掉 active ? 0.85 : 0.35），两份图标（`DIM_TINT` 底份 + `BRIGHT_TINT` 亮份）都 `visible = true`；悬停行改用 `def.label`（原 `statusLabel(menu, def)` 已删除）。
   - 命中判定 `statusActive(p, kind)` 覆盖 5 种：`eyeDamage` / `armDamage` / `legDamage` 读 `p[kind]`、`wounded = p.wounded > 0`、`overload = equipmentWeight > capacity`。
3. **每日粮食需求显示减量（真 bug 修复）**：人员页技能框的 `contentList` 是**扁平**的 `EngineText` 序列，标签行与数值行**同 y**（标签在前、数值在后）。原实现用 `items.find(it => Math.abs(it.y - 660) < 0.01)`，取到的是**标签节点**「每日粮食需求」，所以数值行永远不会出现括号 —— 这正是用户看到的现象。改为 `findIndex` 后取 `items[needIdx + 1]`，输出 `1,760 (−440)`（U+2212 减号）。行号依据：`web/src/game/CaravanMenu.ts:1181` 的 `skillRow(998, nf(p.GDA), yy + 60)`，yy = 80 + 26×20 ⇒ y = 660。

### 最小验证

- `node scripts/_skill_effects_probe.mjs`：PASS（基线 maxHP 200 → 强健+铁人 253；医疗 100 → 130）。
- `node scripts/_skill_ui_probe.mjs`：PASS。主角经验 14400 → **19600（Lv8 = 7 技能点）**，多出的一点用于点铁胃。断言含：槽位 `bar=10`（粗细不变）/ `barDrop=2` / 条下沿贴合外框底线（内侧 0~1px）；悬停文案；生命行 `200/200 → 200/220`；成长空间 `1,000 → 1,250 (+250)`；机械 `60 (+14)`；外科医生 `312 (+72)`；**`每日粮食需求 1,760 (−440)` 且标签行未被改写**。（外框高度/条位置在第四轮后又变化：见上一节 —— 现为外框 43px、屏幕 51..93、条 83..93。）
- `node scripts/_crew_ui_probe.mjs`：PASS。含槽位 246×24 + 10px 条、外框 289..540 × 51..91、边距 2px、拖滑块坐标随 `barDrop` 下移、加到 9 格可滚（maxW 34）、技能点行 / 技能树面板 / X / 层级 / 反向关 DLC 对照。（几何数值见第四轮：视口 246×27、外框 51..93。）
- `npx tsc --noEmit` 退出码 0；`npx vite build` 通过，基础 chunk 哈希不变（`engine-BUbVnH0e.js` 90.90 kB / `world-HwOgckCc.js` 462.84 kB / `battle-Cfe4nARO.js` 271.95 kB），`dist/index.html` 中 `mod-revival` 出现 **0** 次，DLC chunk `mod-revival-reIDaDo-.js` 189.31 kB。

### 边界

- 状态数为 0 时槽位为空框（无格子），滚动条仍按 `ScrollableArea` 默认行为绘制。
- 「职业系统」为本轮之后的计划：职业图标排在状态栏**最左边**（优先度最高），悬停显示职业名；图标先用问号占位。

## 2026-09-28（第二轮）：状态槽位加高加宽 + 面板数据改显示加满值（仍只改本 DLC）

### 用户需求（原话要点）

- 「状态栏的整个槽位高度提高 10%，滚动条和状态图标槽位保持不变，同时状态图标槽位与外边的状态栏槽位保持一定边距」。
- 「宽度拉长至最长，也就是相当于下一行的血条尾部的位置，以方便后续扩展更多状态」。
- 「面板技能的显示，改成面板数据直接显示增值后的数值，比如给一个 600 成长空间的角色点了快速学习 +25% 成长空间后，成长空间显示 750(+150)」。

### 落地内容

1. **外框加高 10%（格子与滚动条尺寸一字未动）**：`STATUS_FRAME_H = 39`（可视高 = 39+2 条 1px 线 = **41px**，原 `24+10+2 = 36px`+ 线 = 38px，实测 37 → 41 = +10.8%）。多出来的高度**全部变成边距**：新增 `STATUS_PAD = 2`，格子条（`ScrollableArea` 视口）从 `(290,52)` 移到 `(292,54)`，即外框线内上 / 左 / 右各留 2px、下方（含 10px 滚动条）留 3px。
2. **宽度拉满到"下一行血条尾部"**：`STATUS_SLOT_W = 250`（原 152）。下一行血条由原版画在 `x = 290 + txtW + 10`、宽 `240 − txtW`（`web/src/game/CaravanMenu.ts:1114`），**尾端恒为 540**，与外框右边缘 `290 + 250 = 540` 对齐 ⇒ 屏幕占 `289..540 × 51..91`。格子条视口 = `STATUS_STRIP_W = 250 − 2×2 = 246`。
3. **"方便后续扩展更多状态"现在真的成立**：5 格内容仍只有 `152 < 246` ⇒ 当场 `maxW = 0`、滑块占满整条、拖不动（外观不变）；但一旦加到第 6 格以上即有真实滚动范围（回归里用同参数临时 `ScrollableArea` 加 9 格验证：内容 280、`maxW = 34`、可滚到 `-34`、滑块按 `w²/contentW` 变短）。
4. **面板数据统一显示"加满值 (+增量)"**：`decorateSkillValues()` 的成长空间行由 `基础 (+增量)` 改为 **`最终值 (+增量)`**（`fmtNum(lcValue*100) + " (+" + …`）—— 智力 10 的角色点快速学习后由 `1,000 (+250)` 变为 **`1,250 (+250)`**（用户举的 600 → `750 (+150)` 同口径）。技能行与概观页「显示技能」本来就是"加满值 + 增量"（`286 (+66)`），现在三处口径一致。

### 最小验证

- `node scripts/_skill_ui_probe.mjs`（需先 `npx vite --port 5173`）：格子条 `@(292,54)` 视口 `246×24` + 10px 条、5 格 `24×24`、`maxW=0`；外框左右 `289..540`（= 血条尾端 540）、上下 41px（+10%）、四周边距 2/2/2/3px；快速学习后成长空间 `1,000 → 1,250 (+250)`；机械 `60 (+14)`、外科医生 `286 (+66)`、概观页同步。
- `node scripts/_crew_ui_probe.mjs`（回归）：新增外框几何断言 + "加到 9 格可真滚动"断言；槽位/等级/技能点/技能树按钮/X/切页/反向关 DLC 全部 PASS，截图 `scripts/_out/crew-slot.png`。
- `node scripts/_skill_effects_probe.mjs`：技能数值效果不受本轮影响，全 PASS（`maxHP 200 → 253`、`医疗 100 → 130`）。
- `npx tsc --noEmit` 退出码 0；`npx vite build` 通过 —— 基础包 chunk 哈希未变（`engine-BUbVnH0e.js` / `world-HwOgckCc.js` / `battle-Cfe4nARO.js` / `index-BjgUcXcV.js`），`dist/index.html` 内无 `mod-revival`，DLC chunk `mod-revival-CmjYiq03.js` 188.55 kB。

## 2026-09-28：状态槽位收缩 + 激活即刷新 + 悬停说明改为「面板文本 + 数值」（仍只改本 DLC）

### 用户需求（原话要点）

- 「状态栏，图标大小是变小了，但是图标槽位没跟着变小，修复一下」。
- 「激活技能后，要立刻刷新一下页面的数据，我这边看到给 80 血量的角色点了强健体魄后，关闭面板后角色的血量还是显示 80，再从人员列表点一下该角色数据才会更新」。
- 「技能树面板，不用显示『已解锁』」。
- 「技能树的技能描述，如果是面板数据修改类的，比如快速学习技能，效果是成长空间 +25%，那么悬停提示直接根据效果显示『成长空间 +25%』（前面的技能文本直接取自面板技能文本），不用特意去单独写一段描述」。
- 「我给 600 成长空间的角色点了快速学习技能后，成长空间直接变成 750 了，而非期望中的『600(+150)』，请修复」。

### 落地内容

1. **槽位随图标一起缩小**（`runtime/index.ts` 顶部常量）：格子 `44 → 24`（= 18px 图标 + 每边 3px 内边距）、格间隙 `12 → 8`、槽位宽 `250 → 152`（= `STATUS_CELL*5 + STATUS_CELL_GAP*4`）、`STATUS_SLOT_Y 42 → 52`（缩短后居中在名字框与生命行之间）。外框尺寸由常量推导（`152+1 × 24+10+1`），不用手改。5 格正好放下 ⇒ `maxW = 0` 无溢出；但 `autoHide=false` ⇒ 10px 横向滚动条照常画（`web/src/core/Ui.ts:520`，同「显示技能」面板 7 行时的竖条）。
2. **激活技能后立刻刷新整页数据**：`activateSkill()` 末尾改调 `menu.renderPeople()`（原版自己的刷新方式 —— `web/src/game/CaravanMenu.ts:1524` 改薪水后同样调它）。它重建页容器 → 再次触发 `decorateCrewPage` → 生命/士气/等级/技能点/技能框（含成长空间）全部按新状态重画，不用再点一次角色。技能树面板挂在 `menu.screen` 上（不在 `mainArea` 里），重建不会把它拆掉（探针里连续点 6 个技能都在同一面板内完成）。
3. **面板不再显示「已解锁」**：`rebuildTreeRows` 只在未解锁层画「需先激活 Tn 技能」，`tierHintUnlocked` 常量已删。
4. **悬停说明改为「面板文本 + 数值」**：新增 `effectLines(menu, def)` —— 面板数据类的效果不再手写描述，而是读 `menu.text(id)`（= `getText(ds, id, language)`，随语言自动切换）拼出来：
   - `xpMul` → `966 成长空间` ⇒ 快速学习悬停 = **「成长空间 +25%」**（用户原话的例子）、传奇 =「成长空间 +50%」
   - `maxHpMul` → `1096 生命值` ⇒ 强健体魄 =「生命值 +10%」（不再是手写的"最大生命值"）
   - `capacityMul` → `1271 最大负重`、`bmrMul` → `998 每日粮食需求`、`moraleAdd` → `200 士气`
   - `skillMul` → 按 `Character.skillsList` 顺序取面板技能文本 ⇒ 近战专家 =「近距离搏斗、徒手肉搏、小刀术、棒、劈砍、剑 +20%」
   - 非面板类（AP / 急救 / 产出 / 价格 / 衰减）仍用表里的 `effect`/`effectEn`；面板类也能再补一句（领袖 =「士气 +15」+「全队只生效一次」）。
5. **成长空间显示 `600 (+150)`**：`decorateSkillValues()` 额外处理技能框第 0 行（成长空间）—— 基础 = `智力 × LEARNING_CAPACITY_FACTOR`，显示值 = `learningCapacity`（已被 `fast_learner`/`legend` 乘过），差值 > 0.5 时写成 `基础 (+额外)`，否则保持纯数字；与技能行同一套 `base(+bonus)` 口径。

### 最小验证

- `node scripts/_skill_ui_probe.mjs`（需先 `npx vite --port 5173`）：槽位 `152×24` + 10px 条 + 5 格 `24×24`、`maxW=0`；T 标题只有「需先激活…」、无「已解锁」；悬停 强健体魄 = `生命值 +10%`、快速学习 = `成长空间 +25%`、近战专家 = 面板技能文本 + `+20%`；点强健体魄后生命行**当场** `200/200 → 200/220`（不用重新点角色）；点快速学习后成长空间 `1,000 → 1,000 (+250)`；机械师 `60 (+14)`、外科医生 `286 (+66)`、技能点 0 后「点数不足」灰 `8421504`。
- `node scripts/_crew_ui_probe.mjs`（回归）：槽位/等级/技能点/技能树按钮/X/切页/反向关 DLC 全部 PASS（断言已按新尺寸更新）。
- `npx tsc --noEmit` 退出码 0。

## 2026-09-27：技能效果实装 + 状态槽位/技能树面板微调（仍只改本 DLC，本体只剩 1 处滚动条宽度）

### 用户需求（原话要点）

- 「本体『显示技能』的滚动条，宽度似乎与其他面板的滚动条不一致，你看下 decompiled 版里对应的滚动条宽度是多少，然后应用到本体里」。
- 「revival 状态图标的大小太大了，改成现在比例的 50%」。
- 「状态栏整个槽位增加一个边框，边框样式参考成长空间那个槽位的边框样式」。
- 「技能树的 X 按钮位置还是搞错了，这个技能书面板有两层，现在的 X 按钮是放在里面一层，请把 X 按钮放到外面一层的右上角上」。
- 「实装一下你前面提到的技能树方案技能，此外鼠标悬停到技能树面板的技能上，要显示技能效果」。
- 「领袖、讨价还价这两样技能只准队伍中其中一个人生效，多个人点了这两个技能依旧只生效一次」。
- 「当技能直接增加技能属性时，要以括号内额外值显示出来，比如治疗那一行的数值，如果该角色的治疗基础技能是 100，点了外科医生技能之后就要显示『100(+30)』」。
- 「技能树面板『点数不足』这个文本要置灰」。

### 落地内容

1. **本体「显示技能」滚动条 3 → 15**（`web/src/game/CaravanMenu.ts:802`）：原版 `CaravanMenu.as:1105` 只传 7 个参数，第 8 参是 `ScrollableArea` 的 **style**（不是宽度），宽度是第 9 参 —— 走 `ScrollableArea.as:45` 的默认值 **15**（`Scrollbar.as:57/74 scrollbarWidth = param7`）。全仓库 34 处 `new ScrollableArea` 只有 15（省略第 9 参）与 10（显式 `,3,10)`）两种宽度，本 DLC 的列表都用 10，与本体现已一致。
2. **状态图标 36px → 18px**（`ICON_MAX`，原 36 的 50%），仍按"最长边归一 + 居中"等比缩放，不变形。
3. **状态槽位加外框**（`buildStatusFrame`）：照抄人员页技能框（「成长空间」所在框，`CaravanMenu.ts:1185-1195`）的 inset 画法 —— 上/右边白 0.3、下/左边黑 0.6、1px，且框把 10px 横向滚动条一起包进去（当时是 250+1 × 44+10+1；09-28 起由常量推导 = 152+1 × 24+10+1）。
4. **技能树的 X 按钮移到外层**：面板有两层 —— 外层 Dialogue 底 `(240,48,400×400)`、内层内容槽 `(260,68,360×320)`。X 中心由内层右上角 `(621,67)` 改到**外层**右上角 **`(640,48)`**（`Switch(2)` 25×25 摆在 `(627.5,35.5)`，一半在面板外）。
5. **18 个技能效果全部实装**（表即真值：`runtime/index.ts` 的 `SKILL_TREE`，每项带 `skillMul / maxHpMul / capacityMul / xpMul / bmrMul`）：
   - T0 `tough_body` maxHP ×1.10 ｜ `pack_mule` capacity ×1.20 ｜ `fast_learner` 经验 ×1.25 ｜ `iron_stomach` **GDA/BMR ×0.8**（需求侧一起降 ⇒ 吃得更少且不会因此挨饿）
   - T1 `steady_aim` 远程武器 AP −1（最低 3）｜ `field_medic` 急救效果 ×1.5 ｜ `tracker` 采集/狩猎产出 ×1.25 ｜ `haggler` 买入 −5% / 卖出 +5%
   - T2 `brawler` 近战六项（近战/肉搏/刀/棍/斧/剑）×1.2 ｜ `gunsmith` 远程八项（弩/火箭/手枪/步枪/机枪/冲锋枪/霰弹/火焰）×1.2 ｜ `mechanic` 机械 ×1.3 ｜ `veterinarian` 兽医 ×1.3
   - T3 `surgeon` 医疗 ×1.3（就是用户举的 `100(+30)` 那条）｜ `unbreakable` maxHP ×1.15 ｜ `survivor` 士气衰减减半 + 饥渴累积 ×0.7
   - T4 `veteran` 全部武器技能 ×1.15 ｜ `leader` 全队士气 +15 ｜ `legend` 经验 ×1.5（与 `fast_learner` 叠乘 ×1.875）
6. **全队唯一（用户第 6 条）**：`partyHas()` 只看 `Caravans[0].People`，任一成员激活即生效、多人激活不叠加 —— 领袖（士气 +15）、讨价还价（±5%）各只算一次。
7. **`base(+bonus)` 显示**：技能属性被直接加成时，人员页技能框与概观页「显示技能」都显示 `基础值 (+额外值)`，例：医疗 `235 (+54)`。实现靠 `SKILL_ORIG` 记下打补丁前的原值（`value − base`），不是估的。
8. **悬停显示技能效果**：技能行 `pointerover/move/out` 复用共享 `CursorInfoPanel`（与状态图标同一个面板，悬停时抬到遮罩之上），中文按 15 字折行、英文走 `multiline`。
9. **「点数不足」置灰**：状态文字颜色规则改为 已激活=绿 / 未解锁或点数不足=`8421504` 灰 / 可购买=白。

### 接线点（本 DLC 侧，全部不改 `web/src`）

| 效果 | 钩子 |
| --- | --- |
| 属性/技能系数 | `Character.prototype` 上重定义 getter（保留原 set）或包装方法（`doctorSkill` 等五项生活技能在 web 里是方法） |
| 稳定瞄准 | 包本 DLC 那份 `Battle.prototype.modeAPOf`（远程 = `weaponCategory` 2..4，即 `needsAmmo` 的口径） |
| 战场急救 | 本 DLC 的 `runtime/Battle.ts` 治疗行乘 `revivalSkillTree?.skills?.field_medic ? 1.5 : 1`（宿主 `web/src/game/Battle.ts` 未动） |
| 猎手直觉 | 包私有 `GameData.prototype.forageHuntStep`，调用期间把该车队的 `addCargo` 换成 ×1.25 版，退出还原（采集物 id 62 / 狩猎物 id 45·71·73·75 分开判定） |
| 生存专家 | 包私有 `GameData.prototype.peopleCycleStep`：前后快照 `_morale/hunger/thirst`，只对拥有者削"变差"的那部分 |
| 讨价还价 | 包 `Economy.tradePrice`（`TradeWindow.ts:620` 的唯一价格入口，`amountAffordable` 也走它），`isPartnerSide=true` 是玩家买入 |
| 领袖 | `Character.prototype.morale` 的 getter 加 +15、setter 反向减掉 —— 否则 `peopleCycleStep` 里 `p.morale = p.morale ?? 50` 这种"读自己的值再写回"会每周期自增一次 |

加成缓存：`WeakMap<Character, OwnBonus>` + 模块级 `SKILL_REV`，激活任意技能时自增使缓存失效；全队唯一效果每次现算（不缓存，避免换人后读到过期结果）。

### 最小验证

- `node scripts/_skill_effects_probe.mjs`（纯 node，不需要浏览器；用假实现占住 `forageHuntStep/peopleCycleStep` 专门观察包裹层）：无技能时所有值 = 原版；`maxHP 200 → 253`（强健 + 铁人叠乘）；`capacity +20%`；`GDA/BMR −20%`；经验 `×1.25/×1.875`；`医疗 100 → 130`；`meleeSkill ×1.2`、`swordsSkill ×1.38`（老兵叠加）、`pistolSkill +20% 且基座 rangedWeaponsSkill 不另乘`；领袖 `+15` 且两人不叠加、读后写回不自增；讨价还价 `买入 −5% / 卖出 +5%` 且两人只生效一次；稳定瞄准 `4→3 / 7→6 / 近战不减`；猎手直觉 `[62,125] [45,12.5]` 且退出后 `addCargo` 已还原；生存专家 `士气 −10→−5、饥饿 +100→+70、口渴 +20→+14`（对照成员不受影响）。
- `node scripts/_skill_ui_probe.mjs`（需先 `npx vite --port 5173`）：槽位外框存在且不吃鼠标事件（`ScrollableArea @(290,52)` + 独立框 Sprite）；未激活时医疗 `220`/机械 `46` → 悬停提示 `强健体魄|生命值 +10%` → 依次激活 T0/T1/T2 后人员页**立刻**变 `机械 60 (+14)`、`maxHP 200 → 220` → 再激活 T3 外科医生得 `医疗 286 (+66)`、技能点 0、18 行状态文字里「点数不足」= 灰 `8421504`、「已激活」= 绿 `6749952` → 右上角 X 关闭 → 概观页「显示技能」医生 `286 (+66)`、机械 `60 (+14)`；页面无 console/page 报错。（数字以 09-28 探针实跑为准。）
- `node scripts/_crew_ui_probe.mjs`（回归，本轮同步更新期望值）：图标 **18px**、X 中心 **(640,48)**、横向滚动条 10px、拖滑块 `hscroll 0 → −18`、技能点行按钮宽 = 经验条宽 103.1px、T0→T1 解锁链、无点数点击无效、切页不残留、反向（关掉 DLC）原版人员页原样 —— 全部 PASS。
- `npx tsc --noEmit` 退出码 0；`npx vite build` 通过：`dist/index.html` 的 modulepreload 仍只有 `engine/world/battle` 三个基础 chunk（**没有** mod-revival）；`engine-BUbVnH0e.js` / `world-HwOgckCc.js` / `battle-Cfe4nARO.js` 哈希与上一轮完全一致（本 DLC 只改自己的 `runtime/Battle.ts`，宿主战斗 chunk 未变）；DLC chunk `mod-revival-Bm2L3UjU.js` 188.40 kB（+9 kB = 效果接线代码）。

### 边界与取舍（记录理由，避免回退）

- **`unbreakable` 从「疼痛阈值 +50%」改成「最大HP +15%」**：`Battle.ts:2175` 是 `if (target._HP / target.maxHP < painThreshold) battleMorale -= dmg*0.5` —— `painThreshold` **越大越糟**，原方案是负收益。
- **`gunsmith` 从「远程武器经验 +50%」改成「远程武器技能 +20%」**：按武器类型分流的经验加成要改战斗里多处内联行，收益不如直接加成技能属性；且刻意**不**把 `rangedWeaponsSkill` 放进乘数表 —— 它是 `智力×10` 的基座，各远程技能都由它派生（`pistolSkill = rangedWeaponsSkill×0.7 + …`），一起乘会变成 +44% 而不是 +20%。
- **领袖士气的副作用**：setter 反向扣 15 后，士气下限实际被抬到 16（`_morale=1` 时显示 16）。这是"全队 +15 且不破坏原版读-写-回"的代价，可接受。
- **讨价还价只影响 `Economy.tradePrice`**：城镇货架上的标价牌走 `Economy.price`，不享受折扣；实际成交价（买卖按钮走的路径）享受。
- **猎手直觉的归属口径**：采集看队伍里 `collectingSkill()` 最高的人、狩猎看 `huntingSkill()` 最高的人（与该活动的经验归属一致），不是我方全员都能叠。
- DLC 侧原型补丁全局生效且不可撤销：关掉 DLC 需**重载页面**；新 DLC 想跑脚本要在 `web/vite.config.ts:7` 的数组里加 id。

## 2026-09-26：人员页 UI 改造 + 等级系统 + 技能树（改动集中在 DLC，本体仅 1 处滚动条宽度）

### 用户需求（原话要点）

- 「把成长空间/智力 ×10 的修改关掉」。
- 「在车队目录-人员页，士气下一行新增等级显示『等级 X』+ 同行经验条；去掉健康状态/受伤部位两行；生命值上方新增状态图标槽位」。
- 「状态槽位要有滚动条，滚动条参考其他 UI 的滚动条；状态图标要正方形，不要长方形，同时给图标框内增加背景颜色填充，颜色参考血条的颜色」。
- 「等级下一行新增『技能点 X』，每升一级获得 1 点；同行后面放『技能树』按钮，样式参考『设置薪水』按钮，但宽度要与上一行的经验条一致」。
- 「点『技能树』展开面板，UI 参考车队目录-概观-『显示技能』面板，但去掉底部关闭按钮，关闭改成右上角 X 按钮，X 的样式参考用品页药品剂量的 0/1/2/3 按钮」。
- 「层级式技能树，第一行 T0，第二行 T1，必须点过 T0 才能点 T1；激活技能扣 1 技能点并永久获得效果」。
- 「只在 revival dlc 目录下修改；所有修改同步更新 README.md」；后续补充：「在 web 版代码里（这条不用只在 revival dlc 里修改），把『显示技能』面板的滚动条宽度改成与车队目录其他页面一致」。

### 落地内容

1. **成长空间 ×10 关闭**：`runtime/index.ts` 的 `LEARNING_CAPACITY_FACTOR = 1`（原版 `Character.as:3176` / `World.ts:302` 是 `intelligence * 10`）。改这一个数即可调成 5 等半程值。学校经验、战斗经验、采集经验、成长空间显示读的都是同一个 getter，因此一起变。
2. **等级系统**：累计经验 `T(L) = 400 × (L−1)²`，`L = 1 + ⌊√(总经验/400)⌋`，`LEVEL_XP_STEP = 400` 是唯一旋钮。总经验 = 原版 `Character.totalExperience`（26 项技能经验之和）。`Character.prototype` 上新增只读 `level` 派生值（原版无该字段）。
3. **人员页布局**（页容器局部坐标＝屏幕坐标）：名字 14 / 状态槽位 42（44 高 + 10px 滚动条）/ 生命 98 / 士气 118 / 等级 138（经验条画在 y+2）/ 技能点 160（技能树按钮 156..184）/ 属性 184·202·220·238 / 行动值 256 / 速度 274 / 最大负重 292（与原版同位，技能框仍在 322，未挤压）。删掉健康状态(82)/受伤部位(102) 两行。
4. **状态槽位**：改用原版 `ScrollableArea`（`vertical=false` ⇒ 走它自带的横向滚动条），5 个 **44×44 正方形格**、格间距 12（内容 268 > 视口 250 ⇒ 必然出现滚动条）；**滚动条粗细 10px，与装备页道具栏的横向滚动条（`CaravanMenu.ts:2286` 的 `invList`）一致**；格内加**血条同色**背景填充（`#ffffff` @0.18）+ 描边（命中状态描边更亮）；图标等比缩放居中、最长边统一 36px（**09-27 已按用户要求改为 18px**），暗色常显 + 命中叠亮色（沿用战斗 HUD 的双份做法），悬停仍出名称面板。**09-27 补：整个槽位加了与人员页技能框同款的 inset 外框（含滚动条）。**
5. **技能点 + 技能树面板**：技能点 = `（等级 − 1）× 1 − 已花点数`。面板外观照抄概观页「显示技能」（全屏 0.5 遮罩 + Dialogue 底 + 暗底 360×320 + 外框 362×322 + 345 宽 / 10px 滚动条的 `ScrollableArea` 列表），**没有底部关闭按钮**；关闭改成右上角一个 25×25 的 `Switch(2)` + 同色「X」（与药品剂量 0/1/2/3 同一控件类型与配色），**按钮中心正好落在面板外框右上角 (621,67)**，即一半在面板外、不占内容槽（**09-27 修正：那是内层内容槽的右上角，已按要求改到外层 Dialogue 面板右上角 (640,48)**）。
6. **层级规则**：T0 永远可点；`T(n)` 需要 `T(n−1)` 里已激活 ≥1 个技能（按用户给的口径）。当前表是 5 层 T0–T4。
7. **持久化**：技能点与已激活技能写在 Character 自己的普通字段 `revivalSkillTree = { spent, skills }` 上。`SaveSystem.ts` 用 `JSON.parse(JSON.stringify({...p}))` 存、`new Character(); Object.assign(ch, p)` 读，所以普通字段随存档往返不丢（探针已断言可序列化往返）。

### 技术要点（不要回退）

- **不 import（含动态 import）任何原版 UI/菜单模块**：只要 DLC chunk 引用了 `CaravanMenu`，Rollup 会把 `CaravanMenu` 或 preload helper 塞进 DLC chunk，基础包首页随之 `modulepreload` 整个 DLC（实测 175–295KB）。改用从实例上取：`api.on("game:boot"/"shell:ready")` → 包 `shell.showCaravanMenu` → 包 `caravanMenu.fleetPage/renderPeople/removeOverlays` 三个**实例方法**。人员页/技能树本身完全没碰 `web/src`。
- **本体改动**：`web/src/game/CaravanMenu.ts:802` 概观页「显示技能」列表 `new ScrollableArea(345, 320, 345, 320, true, false, false, 3, 15, this.assets)` → 现在第 8/9 参是 `15, 15`（**09-27 修正：第 8 参是原版 style，宽度是第 9 参，原版只传 7 参 ⇒ 走默认 15**），按用户明确要求「这条不用只在 revival dlc 里修改」。其余 `web/src` 未改。
- `ScrollableArea.updateSize()` 用 `c.width ?? c.textWidth ?? 30` 量内容宽，`Sprite` 没有 `width` ⇒ 必须给每个格子显式 `(cell as any).width = 44`，否则 5 格只算 150px，滚动条永不出现。
- `fleetPage()` 会 `mainArea.removeAll()`：装饰阶段只用包装层记下的 `menu.__revivalPage`，绝不重复调用。
- 技能树面板挂在 `menu.screen`：切页会走 `removeOverlays()`，包装层同步把它收掉，避免残留。

### 最小验证（`node scripts/_crew_ui_probe.mjs`，需先 `npx vite --port 5173`）

真实 App（`__c2`）→ 真实 `GameShell` → 真实 `CaravanMenu`，不读写存档；全部断言通过：

- 槽位 = `ScrollableArea 250×44` + **10px 横向滚动条**（与装备页道具栏 `CaravanMenu.ts:2286 invList` 同粗细），内容 268 ⇒ 可滚；5 格都是 44×44 正方形、格内有 `#ffffff`@0.18 填充；10 个图标最长边统一 **18px**（09-27 由 36px 改小）；**拖动滑块实测 `hscroll 0 → −18`**，内容同步位移；滑块命中区实测 `y=44 h=10`。
- 像素级：格内颜色比页面底色亮（白填充真的画在画布上）。
- 等级行 y=138「等级 2」+ 经验条（同起点同宽度）；技能点行 y=160「技能点 1」+ 技能树按钮 `x=436.9`、实宽 103.1px = 经验条宽 103.1px；健康状态/受伤部位两行仍删掉；最大负重仍在 y=292。
- 鼠标真点技能树按钮 → 面板展开、挂在窗口根、底部无关闭按钮、列表 345 宽 + 10px 滚动条（与「显示技能」一致）、右上角 `Switch(2)` 中心 **(640,48)**（09-27 由内层 (621,67) 改到外层）正好压在面板右上角；层级 T0–T4；初始只有 T0 解锁。
- 真点 T0「强健体魄」→ 技能点 1→0、面板显示「已激活」、T1 随之解锁、字段可 JSON 往返；没点数时再点不生效；X 能关闭；切页不残留；重渲染后点数保持。
- 反向：`localStorage['c2:disabledMods']=["revival"]` → 原版人员页原样（无槽位/等级行/技能点行，两行还在，`Character` 上没有 `level`）。
- `npx tsc --noEmit` 退出码 0；`npx vite build` 通过，`dist/index.html` 的 modulepreload 只有 engine/world/battle 三个基础 chunk（**没有** mod-revival）。`engine-BUbVnH0e.js` / `world-HwOgckCc.js` / `battle-Cfe4nARO.js` 三个哈希与改动前完全一致 ⇒ 这三个 chunk 字节未变；`index-*.js`（含 `CaravanMenu`）因为本轮本体那处滚动条宽度 `3 → 10` 而 +1 字节（316.38 → 316.39 kB，文件名 `index-6dVVt6e2.js`），另外 host chunk 里的 `__vite__mapDeps` 还内嵌了 DLC chunk 的哈希文件名，所以文件名哈希必然会变。

### 边界与待办

- **技能效果已接线**（09-27 完成，18/18）：清单与层数见本文件的 09-27 段与 `runtime/index.ts` 的 `SKILL_TREE`；激活即扣 1 点、永久生效、人员页数字立刻变成 `base(+bonus)`。
- DLC 侧的原型补丁全局生效且不可撤销：关掉 DLC 需要重载页面（`mods.disable()` 不会撤回 `Character.prototype` 上的补丁）。
- 状态槽位越界部分会被列表视口裁切（这正是需要横向滚动条的原因）；`ScrollableArea` 的横向滚动条占内容下方 10px，槽位总高 54px（y=42..96）。

## 开发验证

在 Web 工程目录运行 `npm run test:skeleton` 和 `npm run build`。
开发服务器打开 `/mods/revival/qa/battle-parity.html`，这是独立内存场景，不读写游戏存档。
`tools/generate_legacy_tracks.mjs` / `tools/generate_battle_atlas.mjs` 的新数据和图集只输出到本 DLC。

## 制作源节奏字段开放（本轮）

- **删除了「制作源不允许改 FPS、时长、循环方式、legacyParts 或事件」这条限制。** 理由是它砍掉了骨骼化的主要收益：作者本来可以自由生成姿势，却不能生成节奏，动作时点被 13 帧攻击、16 帧死亡、25 Hz 死死锁住。
- `tools/animation_authoring.mjs:196` 起接受 `fps`、`duration`、`loop`、`playbackDuration`、`finishOnLastFrame`、`events`、`legacyParts` 七个片段级字段；可选字段写 `null` 表示清除覆盖、回退运行时默认值（例如把 death 的 `playbackDuration` 设为 `null`，动作就会完整播完）。
- `qa/authoring-editor-model.ts` 的「原版兼容补丁」同步放开：只导出**确实与原版不同**的节奏字段，因此原样导出仍然逐字段复现原版，未改动的片段不会被打上多余的显式覆盖。
- 这不是「关掉校验」，而是把校验换成镜像运行时播放器的真实要求（`BattleAnimation.ts:69-71`）：非法 fps／非正时长、`playbackDuration` 超过 `duration`、事件时间越界、空事件名、非法 `legacyParts` 帧号，仍然在写产物之前报错，不会把崩溃推迟到战斗里。
- 运行时本来就是按可自定义节奏写的——`createAnimationPlayback` 的注释即「custom clips can be authored with loop:true」；本次是让制作源与运行时对齐，而不是新增运行时能力。
- **代价（有意接受）**：被覆盖节奏的片段不再受「与原版逐字段相同」保护，攻击命中、脚步与倒地时点会随 `events`／`duration` 改变，该片段也不再适用逐像素对照作为验收依据。默认空覆盖仍必须复现原版输出，回归对此继续断言。
- 最小验证：`npm run test:skeleton` 38 项全绿（新增「authorable clip timing」检查，断言作者化的 fps／时长／循环／`playbackDuration`／事件／`legacyParts` 真的进入运行时播放器，且非法值仍被拒）；`authoring_editor_regression.mjs` 通过；`generate_legacy_tracks.mjs --check` 通过；空覆盖下重新生成后 `battle_skeleton.json` 的 SHA256 与改动前完全一致（`B952EBD6…8CE3`）；`npm run build` 与 QA 页 `tsc --strict` 均通过。
- 顺带修复一处**预先存在**的回归失败：4 个假对象缺少 `opts`，而运行时自僵尸单位起读取 `this.opts.unitAnimation`／`unitVisual`，导致这 4 项在本次改动前就报 `Cannot read properties of undefined`。生产不受影响——`Battle.ts:301` 的默认参数 `opts: BattleOpts = {}` 保证 `this.opts` 恒为对象。补齐假对象的 `opts: {}` 后恢复全绿。

## 本轮最小验证结果（2026-09-13）

- TypeScript 检查、生产构建和 `npm run test:skeleton` 通过；新增的加载边界检查覆盖启用、禁用、错误来源和注册失败回滚。
- 浏览器内存场景通过真实 ModRuntime 和 GameShell 战斗工厂：启用时注册 revival 运行时并创建 DLC Battle；禁用时运行时加载次数、骨骼数据请求数和紧凑图集请求数均为 0，并创建本体 Battle。
- 迁移后的动画验证页完成行走、射击、受击和死亡操作；页面错误区为空。
- 生产预览的主菜单、DLC 菜单与复兴描述正常显示，无页面 error/warn 日志。
- 未进行大规模多单位性能基准，不承诺 FPS 提升百分比；没有操作用户存档。
- 开关验证页为 `/mods/revival/qa/runtime-switch.html`（开发服务器）。[完整修改文件与用途](MIGRATION_FILES.md)。

## 可重复的动画制作源（2026-09-13）

- 新增独立基线与手工制作源：`data/battle_skeleton.base.json`、`data/battle_skeleton.authoring.json`。生成器不再从旧产物恢复制作状态，手工骨骼／附件轨道不会在重新生成时被覆盖。
- 默认制作源为空；当时原版动作时长、25 FPS、事件与兼容帧轨道受保护，视觉覆盖不能改动这些字段（该限制后续已放开，见「制作源节奏字段开放」一节）。
- 新增只读 `--check`；错误字段、悬空骨骼／插槽／附件、循环父子关系、非法时间及未登记图片在写产物之前报错。
- 制作支持仍是 JSON 源文件流程，不是图形化编辑器。详见 [制作说明](AUTHORING.md)。本次没有新增本体代码修改。
- 最小验证：只读校验、既有动画回归与生产构建通过；新增一组制作源／事件保护／错误输入检查。空覆盖重复生成后，72 张 PNG、动作数据与清单共 74 个产物的 SHA256 全部不变，生产运行时 chunk 哈希也不变。
- 本次未重复浏览器截图或开展多人性能基准；默认运行时与图像内容未变。原本体的七个战斗文件及 DataStore 再次与用户备份逐文件核对一致。

## 历史迁移记录

以下记录保留各阶段当时的验证范围。旧阶段提到本体保留优化、或本体资源清单的描述已由上面的当前架构取代。

# 战斗动画渐进迁移与验收记录

更新：2026-09-13。当前已完成第一阶段验证及第二阶段的攻击/行走声音事件扩展，**不是整套动画引擎已经完全移植**。

## 原版依据

- `decompiled/all/scripts/IsoEngine/AnimationData.as`：`animationTypeFrames` 是范围表，`fullAnimationTypeFrames` 是已经展开的逐帧表。原版动画按 25 Hz 播放，短部位轨道到末帧后保持，不按比例拉长。
- `decompiled/all/scripts/IsoEngine/BattleField.as`：攻击按 `HitFrames` 触发；受击播放完成回到待机；人物死亡第 5 帧处理死亡与掉武器，第 7 帧播放倒地声，普通尸体停在末帧。最后敌人或主角死亡时，原版在第 5 帧进行胜负结算，不为播完尸体动画推迟结算。
- `BattleField.as`（1978–1999、2125–2205 行）：下一模拟帧应用 `applyPhaseAndFrame`；连发在动作末帧排入下一轮第 1 帧；按 `HitFrames` 触发攻击，手雷在第 6 帧扣除并出手。徒手/长近战在第 5 帧、短刀在第 3 帧播放挥击声。
- 同文件（2078–2084 行）：`currFrame % 4 == 2` 播放脚步，即行走第 2、6 帧，不是每格结束。
- 同文件 `reload()`（6138–6157 行）：装弹、扣 AP、更新界面或切换回合，没有额外的 0.4 秒换弹骨骼动作，也没有隐藏整把枪。
- `Character.as` 的部位图集、染色和方向层序仍是默认人物外观的来源。

## 当前实现

采用渐进式混合方案：**原版部位帧作为兼容外观 + 数据驱动骨骼/插槽采样 + 模拟与绘制分离 + 共享姿态/合成帧缓存**。

- `BattleSkeleton.ts`：稳定的 25 Hz 帧边界、循环时间规范化、按绝对时间区间采集事件、预编译轨道与插槽排序、只读姿态共享。每个动画姿态缓存最多 128 帧，替换资产对象后缓存自动隔离。
- `BattleAnimation.ts`：原帧 clip 与事件的唯一生成依据；有限轮数的模拟播放器处理第 1 帧进入、连发和跨帧事件；自定义循环 clip 不会重复发射边界事件，非法 FPS 拒绝创建。默认与缺失资产回退共用原版规则。
- `BattleDoll.ts`：攻击使用新播放器；行走使用同一事件采集器并把声音事件交给模拟层消费，终点截断、受击中断清理；修正展开帧表长度读取，恢复完整攻击/受击/死亡播放；修复行走与其他动画的浮点错帧；人物合成帧缓存使用资产身份及规范化动画帧。
- `BattleFieldView.ts`：身体与阴影共享同一个模拟帧和姿态；不再自行推进人物/运输动画或消费声音事件；移除自行添加的换弹隐藏武器和黄色圆形枪口闪光。
- `Battle.ts`：运输动画推进与倒地音效归模拟循环所有；保留原版装弹流程；人物死亡事件由模拟动画帧触发。移除攻击/投掷的 `pendingActions` 独立计时器，命中/发射/挥击声由攻击动作事件驱动；手雷数量与投掷经验移至出手帧更新。
- 现有 100×100 人物原生图块、染色以及方向层序继续复用。**没有降低游戏分辨率，也没有在本阶段缩减或重新压缩现有图集。**

## 最小代码回归

运行 `npm run test:skeleton`：

- 8 种武器动画类型 × 5 个动作阶段，逐帧核对所有原始部位轨道。
- 调用生产动画驱动，核对全部攻击/受击/死亡帧及结束状态。
- 行走每格 4 帧、8 帧循环、路径终点与停止，第 2/6 帧脚步事件、跨多格补帧不越过路径终点。
- 零时间差、倒退与跨多个循环的事件边界及排序；循环资产受限播放时不重复第 1 帧事件；拒绝无限 FPS。
- 全 8 类攻击逐帧连续播放 3 轮；发射事件与可见发射帧一致；动作中断不会产生延迟幽灵攻击。
- 调用生产 Battle 事件消费与手雷流程，验证重复消费/绘制不重复射击，第 6 帧才扣手雷并创建飞行物。
- 缓存跨循环复用、资产替换失效。
- 调用生产死亡事件处理，核对第 5/7 帧和掉武器/结算只触发一次。
- 调用生产换弹流程，核对弹药与 AP 改变，人物动画不被替换成自造换弹动作。

本轮最终 `npm run test:skeleton` 与 `npm run build` 均通过；build 包括 TypeScript 类型检查与 Vite 生产打包。

## 浏览器验收（2026-09-13）

使用 `/mods/revival/qa/battle-parity.html` 的独立内存场景，加载生产 Battle 和渲染模块，**不读写用户存档**。

| 验收项 | 实际结果 |
|---|---|
| 原帧渲染路径与新骨骼路径 | 8 类型 × 5 动作 × 4 方向的首/中/末代表帧，共 416 个姿态的原生人物画布逐像素一致 |
| 持枪人物死亡 | 第 1–4 帧仍为临终，地面武器 0；第 5 帧死亡且地面武器变 1；第 7 帧倒地事件生效 |
| 重复掉枪 | 推进至 1.28 秒并重复绘制后，地面武器仍为 1 |
| 倒地声音 | 开启 Sound FX 后，浏览器音频状态中 SFXBodyFall 已就绪且正在播放 |
| 尸体末帧 | 第 16 帧保持，继续推进时间仍保留；画面可见尸体与血迹 |
| 人物受击 | 第 1、2、3 帧依次显示，0.12 秒回到待机 |
| 纯绘制 | 20 次绘制不推进人物/动物的动画状态 |
| 动物 | 受击与死亡由模拟时间推进，死亡最终保持第 29 图集帧 |
| 行走 | 中途保持行走阶段和可操作 HUD，路径结束回到待机 |
| 连发（第二阶段） | 在真实三连发模式下，0.04/0.16/0.28 秒各从第 1 帧发射一次；弹药 32→31→30→29；0.40 秒回待机，busy 释放 |
| 手雷（第二阶段） | 前 5 个模拟 tick 数量为 4、飞行物为 0；第 6 tick/可见第 6 帧数量变为 3、产生一个飞行物；5.28 秒时爆炸已结束、无残留飞行物、busy 为 false |
| 弩箭（第二阶段） | 第 1 tick/可见第 1 帧扣除最后一发弩箭并生成弹道 |
| 脚步（第二阶段） | 刷新加载新资产后，可见第 2/6 帧分别检测到 SFXFootstep 播放；第 4/5 帧未额外播放；途中 HUD 可操作，终点回待机 |
| 姿态复验（第二阶段） | 重新生成事件数据后，416 个原生姿态逐像素比较仍通过；绘制 20 次不改变动画状态 |
| 页面错误 | 上述验收结束时 QA 错误区为空 |

逐像素比较针对 Web 的原帧渲染路径与新路径，**不是对 Flash 截图的全场景逐像素验证**。绘制与采样复用减少了重复工作，但本轮没有完成多人敌方回合 FPS/长帧性能量化，不能据此承诺具体提升幅度。

## 生成与最小回归入口

- `npm run generate:battle-animation`：唯一的原版 clip 生成流程，使用生产 `createLegacyBattleClip`，保留 skeleton definition，生成 40 个类型动作及 5 个基础别名；不再发布虚构的 reload、muzzle_flash、hit_recoil 模板。连续生成的 SHA256 一致，已验证幂等。
- `scripts/sync_combat_event_timing.mjs` 仅保留为上述生成流程的兼容入口，不再独立覆写时点。
- `npm run test:skeleton`：统一的行为回归。原来的 `npm run test:animation-legacy` 改为同一套测试的别名，避免维护互相矛盾的断言。
- 最终生产构建通过（TypeScript + Vite）；本次未生成/替换任何人物图片，也未更改显示分辨率。

移除以下 15 个无项目引用、过时或重复的动画脚本。其有效原帧/部位长度断言已合并到统一回归，未清理其他业务测试或素材：

- `add_combat_animation_events.mjs`
- `add_hit_death_tracks.mjs`
- `fix_reload_duration.mjs`
- `fix_throw_event_order.mjs`
- `remove_unverified_pose_tracks.mjs`
- `sync_legacy_phase_durations.mjs`
- `fix_idle_skeleton_events.mjs`
- `legacy_animation_regression.mjs`
- `legacy_part_tracks_regression.mjs`
- `legacy_skeleton_exact_regression.mjs`
- `idle_animation_regression.mjs`
- `combat_animation_events_regression.mjs`
- `combat_event_timing_regression.mjs`
- `reload_animation_regression.mjs`
- `check_legacy_part_lengths.mjs`

## 后续扩展边界

1. 受击/死亡仍由兼容 phase driver 推进，死亡第 5/7 帧已由模拟处理；行走姿态/位置仍保留原路径驱动，只有脚步事件接入统一采集器。尚未把所有阶段都改用 `AnimationPlayback`，本次也不宣称移动 AP 与原版逐格扣除已等价。
2. 任意骨骼父子非均匀缩放的完整仿射变换、通用枢轴/层序编辑、动画制作工具与真正的素材减量尚未完成。默认人物继续使用原版部位帧，不是已自动转成少量静态图片。
3. 缓存/采样优化不能替代 AI 寻路、弹道或整场战斗性能分析。多人场景的 FPS、长帧和内存峰值尚未量化；不能据本次功能验收承诺提升百分比。
4. 手雷飞行/反弹/引信/爆炸、火焰等仍保留现有实现；本次迁移的是投掷动作的发射事件，不是这些引擎的全面重新移植。

## 2026-09-13：逐阶段扩展原版部件轨道

本轮先重新执行基础回归和生产构建，再按 `idle_0 → walk_0 → shoot_0 → hit_0 → death_0` 的顺序逐个接入显式 `slotTracks`。每一阶段均保留 `legacyParts`，其它 7 类动画继续走兼容路径。

### 数据来源与迁移边界

- 对照 `decompiled/all/scripts/IsoEngine/AnimationData.as` 中第 0 类五阶段帧表，以及 `Character.as` 的部件分类和渲染分支。
- 从已提取的 `battle_doll.json.fullAnimationTypeFrames` 生成 attachment 帧号；相邻相同 attachment 只保留首次关键帧。
- 四个手臂 slot 仍共同读取原版 `arms` 帧号，没有重新设计左右臂动作。
- attachment 保持原始贴图分类，服装类型、染色、方向及裁切注册点仍由现有原版兼容渲染器解析；没有固定服装类型、移动注册点或修改动态层序。
- 原版 25 Hz、各阶段长度、脚步与攻击事件、死亡第 5/7 帧逻辑均未改动。没有添加 reload、后坐力或枪口闪光动画。
- `generate_legacy_tracks.mjs` 的 `migratedClips` 是当前已迁移范围；生成时只重建 `original:` attachment 命名空间，保留其它手工 attachment。

### 验证方式

- 在既有 `test:skeleton` 中补入一项最小回归：逐帧检查显式 attachment 的部件/帧号、相邻帧保持、行走循环、别名以及未迁移 clip 的回退状态。
- 既有浏览器 `pose-parity` 检查扩展为人物层和独立阴影层，覆盖 8 类、5 阶段、所有帧、4 方向，共 2296 次渲染比较。
- 已迁移部分额外分别验证：故意破坏 legacy 帧号后仍使用 attachment 正确绘制；移除 slotTracks 后仍能通过 legacyParts 恢复相同画面。防止仅靠旧路径通过测试。
- 比较基准是 Web 中原版帧渲染路径，不是 Flash 全场景截图，也不表示所有服装、所有战斗场景均已测试。验证页不读写存档。

### 尚未完成

当前为“原版帧 attachment 轨道”迁移，不是将每个动作重做成少量静态图的旋转/位移骨骼。没有新增或删除图片，没有降低分辨率，也没有本轮帧率提升百分比。后续先扩展其它动画类型，再针对确实可复用的部件评估素材减量；仿射父子变换、slot 切换等基础能力已有回归，但制作工具和真实资源减量仍未完成。

本轮验收结果：五次分阶段全量逐像素检查均通过；最终 2296 次人物/阴影渲染一致，其中 328 次已迁移渲染也通过 attachment-only 与 legacy-fallback 两条附加检查。独立 Canvas 变换栈的 40 个静态 rig 姿态检查通过；连续重绘 20 次不改变动画状态；QA 错误区为空。`npm run test:skeleton`、`npm run build` 与连续生成 SHA256 幂等检查均通过。

## 2026-09-13：原版八类人物动画全部接入 attachment 轨道

在第 0 类五阶段逐步验证的基础上，继续按类型 1 → 2 → 3 → 4 → 5 → 6 → 7 扩展；每类都经过生成、最小动画回归、生产构建和浏览器全帧比较后才进入下一类。

### 本次落地范围

- 8 类 × idle/walk/shoot/hit/death 五阶段，共 **40 个原版 clip** 均有显式 `slotTracks`。第 0 类的五个无后缀别名同步保留。
- 每条轨道引用原始部件帧 attachment；相邻相同帧折叠为保持关键帧。没有修改原始图片、注册点、染色、方向或动态层序，没有降低分辨率。
- 保留所有 `legacyParts`，便于兼容回退。原版 25 Hz、动作长度、HitFrames、脚步和死亡里程碑没有修改，没有新增自造动作或特效。
- 全部阶段通过后，将手写迁移清单收束为确定性的 8 × 5 清单，并在既有最小回归中锁定全部 40 项，防止静默漏迁移。
- 直接读取原版 `AnimationData.as.animationTypeFrames`，按其 `Initiate()` 的规则展开并与 `battle_doll.json.fullAnimationTypeFrames` 比较，40 个片段全部一致。这是一次性源数据核对，不增加独立的重复测试套件。

### 分阶段浏览器记录

每阶段均比较全部 2296 个原生人物/阴影渲染。已迁移项另做两条检查：破坏 legacy 帧表后仅用 attachment 绘制；移除 slotTracks 后使用 legacy 回退绘制。

| 已迁移类型 | 基础逐像素比较 | 同时通过 attachment-only / legacy-fallback 的渲染数 |
|---|---:|---:|
| 0 | 2296 | 328 |
| 0–1 | 2296 | 648 |
| 0–2 | 2296 | 984 |
| 0–3 | 2296 | 1232 |
| 0–4 | 2296 | 1480 |
| 0–5 | 2296 | 1728 |
| 0–6 | 2296 | 1984 |
| 0–7 | 2296 | 2296 |

最终检查：

- `npm run test:skeleton`：通过。
- `npm run build`（TypeScript + Vite）：通过。
- 重复生成的数据 SHA256 一致：`5BD9876879BC3D9CA9AE9B297157E23A0842EBD8D8497611E3C4060BE03E7DDD`。手写清单改为确定性清单后产物也保持不变。
- Render-only x20：连续重绘不推进动画状态。
- Static rig：40 个身体/阴影姿态与独立 Canvas 变换栈一致；静态部件、原生头部图片、父子变换、枢轴、镜像、层序、attachment 切换及显隐通过。
- 浏览器 QA 错误区为空；独立内存场景不读写用户存档。

### 结论与下一阶段边界

本阶段完成的是**全部原版人物帧 attachment 轨道迁移**，不是已完成素材减量。2296 项比较的基准是 Web 旧帧渲染路径，不是 Flash 全场景截图；不代表所有外观、所有装备组合或所有战斗场景都已验证。静态 rig 示例仅证明引擎能力，没有替换任何原版动作。

本次没有新增或删除图片，也没有量化多人敌方回合的 FPS/长帧变化。后续应先选择可无损复用的部件进行小范围素材复用试点，并测量帧耗时与内存，再逐项扩大；动画编辑工具和实际素材减量仍待后续实施。

## 2026-09-13：无损紧凑图集分阶段试点（Shadows1 → Body1）

### 原版依据与实现边界

核对原版 `decompiled/all/scripts/IsoEngine/AnimationData.as` 的 `splitAtlas()`：按方向列、帧号行读取 `spriteDimensions` 和 `spriteBoundaries`，第 81 帧起列偏移 4、行号减 80；裁出的图仍在 `Character.as.renderAnimation()` 中按原始 bounds 的 x/y 注册。新生成器完全沿用这套取图和注册规则，仅在构建时重新排布裁框，不重采样、不降低分辨率，不更改染色、层序、动作或事件。

在 40 个原版片段轨道迁移已通过验证的基础上，先紧凑化 Shadows1，验证后再扩大到参与染色的 Body1。当前仅启用这两个源图。原图仍保留作为兼容回退，不代表已删除整个项目的旧素材。

### 资源结果（十进制字节）

| 源图 | 裁框数 / 唯一裁框数 | 原 PNG → 紧凑 PNG | 原 RGBA → 紧凑 RGBA |
|---|---:|---:|---:|
| Shadows1 | 480 / 480 | 566,793 → 346,636 | 25,600,000 → 1,515,520 |
| Body1 | 352 / 352 | 208,698 → 153,766 | 25,600,000 → 413,696 |
| 合计 | 832 / 832 | 775,491 → 500,402 | 51,200,000 → 1,929,216 |

- 两个图集没有完全相同的重复裁框，不能宣称本轮已通过重复帧合并减少了帧数。收益来自移除图集留白和无损灰度+alpha PNG 编码。
- 仅当每个像素的 RGB 三通道完全相等时才使用灰度+alpha 编码；否则保持 RGBA。生成后重新解码，与原始 RGBA 逐字节比较。
- RGBA 体积按图像尺寸 × 4 计算，不是浏览器进程内存、显存或整场战斗 FPS 的实测值。
- 原图和紧凑图都保留在磁盘上，因此安装包总目录并未按上述比例缩小；上表 PNG 收益指默认加载的替代资源。

### 加载与回退

- 战斗预加载和人物／独立阴影层共用紧凑图集选择器。
- 明确区分“正在加载”和“不可用”：正在加载时不另行请求旧大图，也不缓存缺层画面；缺图、加载失败或尺寸错误时使用旧图。
- 失败状态记忆在当前 AssetStore 内，避免每帧重复请求损坏图；新资源标识可重新加载。
- Mod 替换原图 URL 时不使用基础游戏紧凑图；修改 cell、bounds 或非法紧凑裁框时也回退。
- `legacyParts` 完整保留；未迁移部件仍走原路径。

### 本轮最小验证

1. `npm run test:skeleton` 通过；沿用既有入口，补充全部 832 裁框字节一致性、源图覆盖与 bounds 变化回退、异步加载与失败记忆，以及 pending 状态不得请求原图／缓存残帧。
2. `npm run build`（TypeScript + Vite）通过。
3. 阴影试点、Body1 扩展两阶段分别通过浏览器全量 2296 个身体／阴影渲染逐像素比较；同一批渲染同时通过 attachment-only 与 legacyParts 回退。紧凑渲染的测试资源代理禁止访问对应原图，防止静默退回旧图而假通过。
4. 独立生产 Battle 初始化的浏览器资源检查：Shadows1、Body1 均为 compact=true、original=false。该检查先于显式加载旧图的对比测试执行，不读写用户存档。
5. 浏览器主动屏蔽两个紧凑图集，640 个五阶段首／末帧、四方向、身体／阴影渲染仍与原图一致。
6. Render-only x20 不推进模拟；Static rig 的 40 个身体／阴影姿态检查通过；QA 错误区为空。
7. 重复生成后，数据、manifest、两张 PNG 的 SHA256 均一致：
   - battle_skeleton.json：`160D9504DDEDC0A5FE5E922949F4D370726D700D075A80111421EF0A6D2B4164`
   - manifest.json：`6E7FFDC1ED805A2D0E51BCFF72F483C3F75F4BB810649D6BB7345DD1BA3CAE76`
   - BattlePackedShadows1.png：`0AD6DAB3214A47D20DD929717A36F18B304A80104A7697349B1736FB9324FB04`
   - BattlePackedBody1.png：`B9C997459FAECBBBBDD8981138FACF15B5CD0B9F93A289FCA8E3E75932BC689D`

### 仍待逐步扩展

其余身体类型、四肢、头发及武器尚未紧凑化；这两个试点也不是将原版所有动作改造成少量静态贴图驱动的纯骨骼动画。完整外观／装备组合、多人敌方回合帧耗时基准和动画制作支持仍待后续。逐像素比较基准仍是 Web 旧帧渲染路径，不是 Flash 全场景截图。本阶段只确认所述范围，不宣称整个动画优化目标已完成。

## 2026-09-13：Body1 验证后继续扩展 Body2–Body8

上一节记录的是最初的两张图试点；本节是当前最终启用范围：**Shadows1 + Body1–Body8，共九张图集**。扩展顺序为阴影 → Body1 → Body2–Body8，每步先完成已有的最小回归和浏览器检查。

为避免“测试角色只使用 Body1，其他身体类型实际上没测到”，在既有 QA 页增加通用的 mapped-atlas 检查：显式选择对应身体类型和每个原始帧，使用生产渲染器比较原图／紧凑图的注册、染色及透明像素；紧凑侧资源代理禁止访问对应原图。本次覆盖九张图全部 **3296 个裁框**，逐像素一致。Node 回归另逐字节核验了 PNG 中所有裁框，不只检查动画当前使用的帧。

### 当前合计

- 原 PNG 合计 **3,947,157 字节**，默认加载的紧凑 PNG 合计 **2,250,437 字节**，约减少 43.0%。
- 按图像尺寸计算的 RGBA 合计 **230,400,000 → 5,742,592 字节**，约减少 97.5%。仍不是整进程内存、显存或 FPS 测量。
- 3296 个裁框仍有 3296 个唯一裁框；当前没有重复帧合并收益，不改变原版画面。所有原图仍保留，磁盘整体大小不能按上述比例计算。
- 浏览器独立生产战斗初始化：九张图的 compact 均为 true，original 均为 false。
- 全部 2296 个动作身体／阴影渲染继续通过原路径逐像素、attachment-only 和 legacy-fallback 三路检查；640 个缺图回退检查、Render-only x20 和 Static rig 40 继续通过，QA 错误区为空。
- `npm run test:skeleton`、`npm run build` 均通过。
- 重复生成全部 11 个产物（JSON 数据、manifest 和九张 PNG），SHA256 全部一致。当前最终 skeleton SHA256：`544E92A65DA279121B233B4D7E03EA4E7CC3A11F91D0DEBCA3365401DB793CC4`；manifest SHA256：`2DFDC95840D4B92A51226740BA8E74B0F82C7DCEBDB9FE8A3C3B6AB9001D1B35`。

### 文件清单

- 新增：`runtime/BattleAtlas.ts`、`tools/generate_battle_atlas.mjs`。
- 修改：`src/core/Assets.ts`、`runtime/BattleSkeleton.ts`、`runtime/BattleDoll.ts`、`runtime/Battle.ts`、`runtime/BattleFieldView.ts`。
- 修改生成／验证入口：`tools/generate_legacy_tracks.mjs`、`tools/battle_skeleton_regression.mjs`、`qa/battle-parity.ts`、`/mods/revival/qa/battle-parity.html`。
- 更新生成数据：`data/battle_skeleton.json`、`public/assets/manifest.json`。
- 新增图集：`public/assets/battle/BattlePackedShadows1.png`、`BattlePackedBody1.png`、`BattlePackedBody2.png`、`BattlePackedBody3.png`、`BattlePackedBody4.png`、`BattlePackedBody5.png`、`BattlePackedBody6.png`、`BattlePackedBody7.png`、`BattlePackedBody8.png`（均在同一 battle 目录下）。
- 更新说明：`BATTLE_DOLL_PORT.md`。

下一阶段范围仍为四肢、头部／头发、武器等其他原版部件。不能将当前“已完成九张图的无损紧凑化”表述为全套素材减量、全场景动画验收或完整性能目标已完成。


## 2026-09-13：九图验收后，逐步扩展至全部 72 张人物／武器原版部件图集

本节更新上面的阶段范围：先扩展四肢、头部、头发、胡须与武器背包至 39 张图，完成 14,460 个裁框浏览器对比，再加入原版 33 类 Weapon 图集。目前共 72 张图、18,360 个裁框；这是原版人物／武器部件的无损图集迁移，不包含动物、障碍物和全部特效图集，也不是把所有原版逐帧动作自动变成静态骨骼素材。

### 原版依据和实现

- 对照 AnimationData.as 的 splitAtlas/getSprite：保留四方向列、80 帧换列规则与 spriteBoundaries 原裁框，像素直接拷贝，不缩放、重绘或降低分辨率。
- 对照 BattleField.as 的 dropWeapon：保留地面 50×50 画布、Weapon 第 0 方向末帧／背包第 1 方向末帧，以及原居中注册；手雷分支不变。
- 人物与地面掉落武器共享 BattleAtlas.battlePartCrop，紧凑图片加载中不抢先加载原大图；失败、尺寸错误、mod 替换原资源或改变裁框时继续保留原图回退。
- 所有 8 类型 × 5 阶段显式 slotTracks、legacyParts 兼容、25 Hz、原版攻击／脚步／死亡时点均保持。本阶段未改动作逻辑。
- 修正最小 QA 的类型选择，显式核对实际选中的身体／头部／四肢／武器类型，避免未选中目标部件而让空画布比较通过。原图按张加载、用完释放引用，不同时解码全部原始大图。资源时序缓冲扩大到 4096，避免默认缓冲耗尽后误报武器未加载。

### 已完成的验证

- 72 张图全部 18,360 个裁框，经生产部件渲染器注册、染色后，与原图 Canvas 输出逐像素一致；紧凑侧禁止访问对应原图。
- 2,296 个完整动作身体／阴影输出与旧渲染一致；同一批分别通过 attachment-only 与 legacy-fallback 检查。另有 640 个五阶段首末帧缺图回退检查通过。
- 45 个实际武器定义的地面 50×50 输出与原图一致；实际脚下掉落弩仍可出现在拾取栏。
- 独立生产初始化资源检查：72 项 packedLoaded=true、originalLoaded=false。该检查在加载原图的像素对比前执行。
- Render-only ×20 不推进模拟；静态骨骼能力示例 40 个身体／阴影输出与独立 Canvas 变换栈一致。QA 错误区为空。
- 浏览器死亡流程：第 1 帧仍为临终且没有掉落，第 5 帧进入死亡并掉武器，第 7 帧设置 bodyFall，动画末帧仍保留尸体与一件掉落物。此项核验事件标记，不声称已做音频听感验收。
- npm run test:skeleton：21 组相关检查通过；npm run build：TypeScript 与 Vite 生产构建通过。QA 入口单独 TypeScript 检查为 0 diagnostics。

### 资源统计及边界

- PNG 合计：9,629,331 → 6,382,152 字节，约减少 33.7%。其中 Weapon26/27/28 单张 PNG 略增，整体仍减少。
- 按尺寸计算的 RGBA：1,105,600,000 → 18,292,736 字节，约减少 98.35%；这只是全部图像解码为 RGBA 的理论体积，不是实测进程内存、显存或 FPS。
- 18,360 个裁框对应 18,305 个唯一裁框；仅合并完全相同的像素和尺寸，不合并近似帧。
- packedParts 元数据为 1,756,109 字节（紧凑 JSON 口径，gzip 207,502 字节）。原图保留供回退和 mod 使用，因此安装目录总大小不会按加载体积比例缩小。

### 本阶段文件

- tools/generate_battle_atlas.mjs
- runtime/BattleAtlas.ts、runtime/BattleDoll.ts、runtime/BattleFieldView.ts
- qa/battle-parity.ts、/mods/revival/qa/battle-parity.html
- data/battle_skeleton.json、public/assets/manifest.json
- public/assets/battle/BattlePacked*.png：当前共 72 张，本阶段在九图基础上新增 63 张。
- BATTLE_DOLL_PORT.md

下一阶段仍需独立验证后再推进：受击／死亡等阶段统一播放器、完整外观装备组合、多人长帧及内存实测、动画制作支持。图集减量不代表敌方 AI／寻路卡顿已经解决，也不等于整个动画方案完成。像素对比的基准是 Web 原版兼容渲染路径，而非 Flash 全场景截图。

重复生成校验：74 个产物（72 PNG + skeleton + manifest）的 SHA256 全部不变。最终 skeleton：`b66ee372fa4f0ff7361b1d66e730177d045708a6297e3f51ed40971758c446bb`；manifest：`37586d0935ece42a043b7126a91ffd7190cacd9450a7fefef54b8ce1479688f2`。


## 2026-09-13：共享播放器扩展至受击、死亡和行走

本阶段先完成受击／死亡的源代码核对与浏览器验收，再扩展行走。没有修改图像像素、分辨率或原图回退路径。

### 原版边界纠正

- 依据 decompiled/all/scripts/IsoEngine/AnimationData.as:127538–127588，AS3 的 fullAnimationTypeFrames 从索引 1 写入，表长是源帧数 N+1；Web 提取后的数组从索引 0 开始，长度为 N。
- BattleField.as:1978–2000 先增加 currFrame，再应用 applyPhaseAndFrame，所以安排的新动作在下一次模拟更新进入第 1 帧。
- BattleField.as:2209 起，受击在末尾检查帧当次返回 idle；2317 起，死亡在末尾检查帧执行 currFrame-- 后渲染。默认受击的可见过程是 1→2→idle，16 帧死亡源表的最终可见帧是 15，而不是 16。
- **纠正此前阶段对死亡末帧已完全对齐的表述**：早期检查主要对比 Web 旧驱动，未独立翻译 AS3 的一基表边界。源数据仍完整保留所有 16 帧用于姿态采样／编辑，播放边界用 playbackDuration 单独记录。
- 死亡逻辑／武器掉落仍在第 5 帧，倒地事件在第 7 帧。现在由共享播放器的 death_logic/death_fall 事件驱动，不再另用 frame>=5/7 硬编码触发。

### 本次实现

- DollAnim.action 更名为 playback；攻击、受击、死亡与行走共用 createAnimationPlayback/advanceAnimationPlayback。
- 显式 clip 与缺少骨骼数据时的 legacyBattleClip 使用同一事件和播放边界定义。渲染端只读取姿态，不推进时间，不消费游戏事件。
- 受击完成清理播放器；死亡保持最终姿态；阶段打断时丢弃旧事件，避免重复掉落、晚到的射击／死亡事件。
- 行走基于 beginWalk/endWalk（BattleField.as:6946、4555）和 EF:2070–2119：按原版八帧循环、四帧一格，1x/2x 第一次更新分别显示帧 1/2，脚步在帧 2/6；到达终点保留当帧步行姿态，下一模拟更新切 idle。
- 行走保留路径插值，限制事件不越过路径终点；没有改为纯静态骨骼图，也没有修改战斗规则。

### 本阶段最小验证

- npm run test:skeleton：22 组通过。行走检查涵盖 8 种动画类型 × 1x/2x × 显式 clip/兼容回退，独立翻译 AS3 的帧推进、转向、脚步事件和终点 queued-idle。
- 受击／死亡检查涵盖 8 类动作、细步／大步事件补发、重复消费保护、阶段打断，以及自定义死亡事件时点，确认生产消费端没有隐藏的第 5/7 帧判断。
- 浏览器受击：0.04 秒为 3/1，0.08 秒为 3/2，0.12 秒回 idle。
- 浏览器死亡：0.16 秒仍临终且未掉落，0.20 秒进入死亡且掉落 1 件武器，0.28 秒 bodyFall=true，0.68 秒仍保留 4/15、尸体和 1 件掉落物。此项核验事件标志，不是音频听感验收。
- 浏览器 7 格行走：第 1 tick 为 1/1，1.12 秒终点为 1/4 且仍忙碌，1.16 秒为 idle 且结束忙碌。HUD 始终可操作，Render-only x20 不推进状态。
- 浏览器 2,296 个完整动作身体／阴影输出逐像素通过；同批 attachment-only 与 legacy-fallback 也通过。基准仍是 Web 原版兼容渲染器，不是 Flash 全场景截图。
- 浏览器射击正常完成、返回 idle 并清理播放器；手雷第 5 帧仍为 4 枚且没有飞行物，第 6 帧变为 3 枚并产生 1 个手雷飞行物。QA 错误区为空。
- TypeScript 与 Vite 生产构建通过；QA 入口单独 TypeScript 检查 0 diagnostics。
- 重复生成 74 个产物，SHA256 全部不变；本阶段没有新增或改变 72 张 PNG 的像素。当前 skeleton SHA256：C21E033D477E9D598FC3C25B377477BB3D02BF14134877F75547E5FC89332594。

### 仍未完成／不在本次结论范围

- Web 移动仍提前扣除整段 AP、更新逻辑坐标，视觉路径随后播放；不能把本阶段时序验收称为完整原版移动结算移植。
- 动物／载具、全部特效、完整外观装备组合、多人长帧与内存实测、动画制作支持仍需逐块处理。
- 本阶段不声称已实测提高 FPS 或解决敌方 AI／寻路卡顿。原图及 legacyParts 回退仍保留。

### 本阶段修改文件

- runtime/BattleSkeleton.ts
- runtime/BattleAnimation.ts
- runtime/BattleDoll.ts
- runtime/Battle.ts
- runtime/BattleFieldView.ts
- data/battle_skeleton.json
- qa/battle-parity.ts
- tools/battle_skeleton_regression.mjs
- BATTLE_DOLL_PORT.md


## 2026-09-13：分阶段验证后扩展到动物／运输单位

### 原版依据

- \decompiled/all/scripts/IsoEngine/BattleField.as 的 placeTransport（约 1637–1644 行）：可牵引动物挂有 TransportUnit 时初始帧 30，其余单位帧 1。
- EF（约 2358–2387 行）：先绘制身体和独立阴影，再推进运输单位帧；音效检查使用推进后的帧号。
- EF 伤害结算（约 2745–2791 行）：仅 category=1 的动物进入受击／死亡动作，不为车辆或拖车添加动画。
- transports.json：6 种动物中，1/6/7/9 有牵引动作；4/5 不可牵引，只存在 1–29 帧。其余 9 种载具为静态帧。

### 本轮落地

- BattleTransportAnimation 删除独立 acc/while 推帧器，改用共享 AnimationPlayback。
- 为原版运输单位生成 6 个动作片段（普通／牵引 × idle/hit/death），存于 battle_skeleton.json.transport；身体、阴影均为附件轨道，保留 legacyParts 回退。
- BattleFieldView 从附件轨道读取源帧，不再只靠外部的 frame 字段渲染。保留原裁剪、注册点、尺寸、占地位置和独立阴影层。此阶段未为运输单位添加仿造的骨骼形变。
- 修正旧 Web 的推进后绘制顺序：反应排入后保持旧画面，下一拍显示原版首帧。受击显示 2…8 或 31…37，下一拍回到 1 或 30。
- 倒地显示 10…29 或 39…58。新增可选 finishOnLastFrame，尸体到达最后画面即完成，不影响人物默认的终止规则；追帧不触发终点之后的事件。
- 倒地声位于第 12 拍（显示 21，原版内部推进到 22）／牵引第 13 拍（显示 51，内部推进到 52）。共享队列只消费一次，使用原版调用音量 0.5；未在此阶段重建原版空间音频。
- 已死亡动物不因重复受击再次播放倒地声；静止／完成动画不累计无用时间。

### 最小验证

- test:skeleton：24 组通过，包括原有人物动作、攻击事件、走路、紧凑图集；新增两组运输单位回归覆盖牵引、AS3 独立帧序对照、音效、追帧、分数 dt、非法 dt、中断、末帧和数据生成一致性。
- npm run build 通过；qa/battle-parity.ts 单独 TypeScript 检查无诊断。
- 浏览器（不读写存档的 QA 页）：15 种类型 × 4 方向，附件／legacyParts 两路径的身体与阴影共 4,624 次原像素对照通过。
- 实际 Battle 驱动：普通受击第 1/7/8 拍为 2/8/idle；牵引受击首帧31；普通倒地末帧29，牵引首帧39、末帧58；拖车始终保持帧1。
- 启用 QA 音效后，牵引第 12 拍无倒地播放，第 13 拍对应音频进入播放状态。事件一次性由回归断言验证；这不等于人工听感验收。
- Render-only ×20 状态不变；浏览器错误栏为空，已检查尸体与拖车画面。

### 后续边界

仍保留全部原图和旧路径，没有降分辨率或重画素材。本轮没有压缩运输单位图集，也未取得可声称的真实 FPS／显存提升。全局特效迁移、更多编辑／扩展能力与实际帧耗时测量仍需分阶段进行；不能据此称整套移植完成。


## 2026-09-13：扩展墙面命中烟雾、爆炸与人物燃烧

### 原版依据与实现

- 对照 decompiled/all/scripts/IsoEngine/BattleField.as：Visible 判定（约2326、2350–2352行）、爆炸推进（2793–2809）、BodyBurn（2866–2877）、墙烟（2886–2901）、命中触发（5036）及爆炸创建（6509）；Character.burnFrame 初始值为1。
- 新增 BattleEffectAnimation，共享 AnimationPlayback：ShotSmoke 1–12、Explosion 1–24、BodyBurn 1–40循环。有限特效首帧不跳过，末帧保持一拍后移除。
- Battle.updateFx 负责模拟与寿命，renderFx 只读取状态；爆炸使用复用的 BitmapObject。墙烟与人物火焰也不再从绘制调用或全局 animTime 推进。
- 每人独立燃烧相位；暂时熄灭保留相位；按原版可见性暂停附着特效，不给运输单位添加 Character 专属 BodyBurn。
- 保留原始资源、裁剪边界、注册点、层级与缺图 fallback；没有更改素材或降低分辨率。

### 最小验证结果

- npm run test:skeleton：27组通过。
- npm run build：TypeScript 与 Vite 生产构建通过；QA入口单独检查为0 diagnostics。
- 浏览器 QA（独立内存场景，不读写存档）：77次原始裁剪像素/注册点对照通过；检查烟雾1–12、爆炸1–24、火焰40→1、不同时间起火、暂停、纯绘制20次状态不变及爆炸图像对象复用。另查看了第10帧实际画面。
- 手雷浏览器回归：0.40秒已发射；纯绘制20次后位置与引信71不变；3.40秒只剩一个爆炸（帧5）；4.40秒爆炸结束、忙碌解除、生命值没有再次扣减。
- 喷火浏览器回归：0.40秒5个喷流，纯绘制20次状态不变；4.40秒喷流清空、忙碌解除、燃料200→185，命中单位出现热伤。页面错误栏为空。
- 像素对照基于原版贴图裁剪和数据，不等同于 Flash 整个场景截图对照；未声称实测 FPS 或显存提升。

### 后续边界

BattleFlames 喷火粒子尚未迁移至共享动画播放器，保留当前物理推进；更多飞行物动画、图集压缩及真实帧耗时测量仍需逐步验证。本阶段不代表全部动画或战斗逻辑已完整移植。

### 本轮文件

- runtime/BattleEffectAnimation.ts（新增）
- runtime/Battle.ts
- runtime/BattleFieldView.ts
- tools/battle_skeleton_regression.mjs
- qa/battle-parity.ts
- /mods/revival/qa/battle-parity.html
- BATTLE_DOLL_PORT.md


## 2026-09-13：喷火粒子共享动画迁移

### 原版依据

BattleField.as 2607–2715：发射倒计数每两拍消耗一个燃料；新粒子从frame0进入frame1，初速2；每拍先移动/碰撞，再计算接触热伤；frame<20速度乘1.1，否则乘0.9；frame>47移除。仅frame1–45有图像，注册点为屏幕坐标(-50,-90)加原版裁剪偏移。不能把可见45帧误当成物理寿命。

### 实现

- BattleFlames 的每个粒子使用 AnimationPlayback，frame只读投影共享播放器；不再自行自增动画帧。保持25Hz物理子步以确保追帧时不跳过碰撞/接触热伤。
- BattleEffectAnimation 新增 FlamethrowerFlame：45个可见帧、47个物理帧，第48拍移除。绘制帧46/47返回无贴图，而物理处理继续。
- Battle.renderFx 使用原始 spriteBoundaries 裁剪与注册点，每个粒子复用一个 BitmapObject；纯绘制不推进相位或伤害。没有更换图片或降低分辨率。
- 拒绝NaN、Infinity及非正dt，避免污染物理累计时间。

### 验证

- test:skeleton：29组通过。新增独立数值帧序对照，覆盖4种燃料量、3种连发数、阻挡/无阻挡以及3种dt分块（72个组合），检查发射、trace、touch、速度变化、结尾与重启；另验证45帧裁剪、重复绘制精灵复用、46/47隐形物理尾帧及第48拍移除。
- npm run build成功，QA入口TypeScript检查0 diagnostics。
- 浏览器实际Battle：45次原版裁剪像素/注册点对照通过；单燃料发射、47物理帧/45可见帧、暂停与纯绘制20次状态不变、精灵复用通过。
- 浏览器完整连发：查看1秒喷流画面；4秒时喷流清空、忙碌解除，燃料200→185，目标与附近动物出现热伤；页面错误栏为空。随机伤害值不作为跨运行固定基准。
- 未进行Flash全场景截图逐像素对照或真实FPS/显存基准，不声称已解决全部卡顿。

### 修改文件及剩余工作

runtime/BattleFlames.ts、runtime/BattleEffectAnimation.ts、runtime/Battle.ts、tools/battle_skeleton_regression.mjs、qa/battle-parity.ts、/mods/revival/qa/battle-parity.html、BATTLE_DOLL_PORT.md。

喷火动画迁移已覆盖本节范围；完整项目目标仍需检查其他飞行物/血液特效、扩展制作流程、素材占用与实测帧耗时。原图与兼容路径继续保留。


## 2026-09-13：手雷旋转共享动画迁移

### 原版依据与实现

- BattleField.as 4906–4910：发射时frame=1；2565–2570：可旋转的飞行拍先推进，16帧回环到1；2573–2582：10×10原图，注册点(-5,-5-z*0.9)加裁剪偏移，没有独立手雷阴影。
- 2478–2486及2550–2555：停在障碍物顶面或地面时停止旋转，但引信继续。本轮修正Web只检查离地高度、导致高台上继续转动的问题。
- BattleEffectAnimation新增Grenade循环片段与初始第1帧的播放器；BattleCollision返回每颗手雷的rotating状态；Battle.updateFx按25Hz物理拍推进动画，renderFx只读姿态并复用BitmapObject。
- 保留现有反弹、碰撞、引信和爆炸伤害路径；原始图片、裁剪、注册点及缺图fallback不变，没有降低分辨率。

### 最小验证

- test:skeleton：31组通过；新增手雷帧序/绘制及寿命回归，覆盖1→2、16→1、顶面/地面停转、离开支撑后恢复、侧墙反弹继续旋转、不同dt分块、旧fixture兼容、引信/触地仅爆炸一次。
- npm run build通过；QA入口独立TypeScript检查0 diagnostics。
- 浏览器QA：17次原版裁剪像素/注册点对照通过（16帧及回环），精灵复用、无额外阴影、纯绘制20次、暂停状态不变通过。此全帧fixture抬高飞行高度隔离随机碰撞，不代表全部自然弹道验收。
- 另跑正常投掷：0.40秒已发射，引信71；0.80秒仍在飞行，引信61；3.80秒已经爆炸；4.80秒飞行物清空、忙碌解除，生命值未再次扣减。检查了飞行画面，页面错误栏为空；场景不读写存档。

### 边界与剩余工作

原版反编译代码的_loc38_定义在整个手雷循环外，存在同拍前一颗落地影响后一颗旋转的共享状态。本实现按每颗手雷独立物理结果控制旋转，没有移植这种跨手雷状态污染。因此本节不是全部手雷物理引擎逐分支等价声明。

其他飞行物/血液特效、完整扩展制作流程及实际帧耗时/素材占用仍需继续分阶段验收；未测得真实FPS或显存收益，不据此宣称所有卡顿已解决。

### 本轮文件

runtime/BattleEffectAnimation.ts、runtime/BattleCollision.ts、runtime/Battle.ts、tools/battle_skeleton_regression.mjs、qa/battle-parity.ts、/mods/revival/qa/battle-parity.html、BATTLE_DOLL_PORT.md。


## 2026-09-13：火箭方向帧与弩箭飞行物显示复用

### 原版依据与实现

- 对照BattleField.as 4824–4897：弩箭(type 4)按飞行方向生成一条10世界像素的黑线，阴影为同形状0.5透明线；其局部位图以宽高的一半居中。火箭(type 6/13)用direction计算0–15行，从Rocket.png与RocketShadow.png各裁15×15，注册点(-7.5,-7.5)。
- 火箭帧由方向选择，不是随时间播放的动画；本轮没有强行接入时间播放器。新增BattleProjectileVisual，让每颗飞行物持有并复用body/shadow与位图对象，只在类型或方向变化时重建弩箭几何，只在方向行变化时更新火箭裁剪。
- Battle.renderFx只更新显示对象的位置/方向，不推进物理；镜头移动只改容器坐标。飞行物移除后由图层清空，WeakMap不会阻止其被回收。
- 删除Battle.renderFx中没有任何创建入口的旧shotSmoke分支；正式墙面命中烟雾继续由BattleFieldView的共享播放器处理。
- 保留Rocket.png、RocketShadow.png原始16方向素材和原有分辨率；弩箭仍为程序线条，没有新增或替换图片。

### 最小验证

- test:skeleton：32组通过。新增火箭16方向裁剪、弩箭等距投影后居中端点、实体/阴影透明度、显示对象和几何数组复用、镜头移动、缺图恢复、纯绘制20次及移除清理回归。
- npm run build通过：TypeScript与Vite生产构建成功，89 modules；QA入口独立TypeScript检查0 diagnostics。
- 浏览器QA：96项绘制对照通过，其中Rocket/RocketShadow原图裁剪64项，弩箭实体/阴影程序线条32项；覆盖16方向、对象复用、纯绘制20次和清理。
- 浏览器实际Battle弩箭流程：发射并命中后飞行物与飞行物阴影均清空，后续推进1秒没有残留或重复伤害，页面错误栏为空。命中随机伤害数值不作为固定基准。

### 边界

本节只迁移飞行物显示生命周期与原版方向表现，没有改写普通子弹/火箭的碰撞、穿透、爆炸或伤害逻辑，也没有取得可声称的实际FPS/显存基准。下一步仍需处理血滴/血迹等高数量短寿命对象及测量真实帧耗时。

### 本轮文件

runtime/BattleProjectileVisual.ts（新增）、runtime/Battle.ts、tools/battle_skeleton_regression.mjs、qa/battle-parity.ts、/mods/revival/qa/battle-parity.html、BATTLE_DOLL_PORT.md。

## 2026-09-13：血液显示迁移与人物位图对象复用

### 原版依据与实现

- 对照 `BattleField.as` 1997–2065、5362–5398、5488 附近：命中血滴为 `min(round(damage*4),1000)`；血滴从 z=40 开始，按 25 Hz 原重力公式推进，第 8 拍 z=4、第 9 拍落地；暗红色 1×1 血滴的 alpha 按原版取整为 byte。
- 地面血迹继续使用 1000×1000 分块，在 3×3 范围叠加角/边/中心的 5/10/20 alpha，上限 255。只上传变脏矩形，不逐帧重复上传整块。
- 对照 2906–2919 的 Interlacing 判定，把可见所属人物的空中血滴分为前后两个保留式批绘制对象；未归属血滴有兼容层。血滴物理独立于绘制，暂停及重复渲染不会额外推进。
- `BattleBlood` 的落地删除改成稳定反向压缩，保留原 Web 回调/随机顺序，避免大量血滴同时落地的重复 splice 移位；clear 同时重置时间余量。
- 对照 2830–2853 的人物帧选择和 (-50,-70) 注册点，继续使用原版合成帧；Web 的人物 BitmapObject 和裁剪对象只创建一次，切帧只换 image。保持身体位于燃烧覆盖层下方、阴影独立；素材未就绪时保留上次有效帧并重试。
- 以上是显示与对象生命周期优化，不改伤害结算、动作时点或武器规则；没有新增图片，没有降低游戏或素材分辨率。

### 本阶段最小验证（独立内存 QA，不读写存档）

- `npm run test:skeleton`：36 组通过（包括新血液物理/显示/血迹及人物显示对象生命周期）。
- QA 入口独立 TypeScript 检查：0 diagnostics；`npm run build` 成功（90 modules）。Battle.ts / BattleFieldView.ts 保持 CRLF，无裸 LF。
- 浏览器血液检查通过：400 血滴、18 次程序像素对照、509 个落地 alpha 像素；第 9 拍落地、暂停、重复绘制 20 次、对象复用及前后层序通过。
- 实际 Battle 受击流程：12 伤害生成 48 血滴；推进 10 拍后血滴归零、保留 1 块血迹、受击动作回到 idle、HP 不重复扣减。
- 人物显示复用：320 次缓存帧绘制对照（8 武器动画类型 × 5 阶段 × 4 方向 × 首末帧），位图/裁剪身份、注册点、覆盖层顺序及重复绘制 20 次通过。
- 独立原帧内容对照：2296 次身体/阴影绘制与原帧渲染器逐像素一致；2296 次迁移绘制同时通过 attachment-only 和 legacy fallback 检查。
- 人物复用后再验血液与特效：血液检查重复通过；77 次烟雾/爆炸/人物燃烧原图裁剪对照通过，页面错误栏为空。

### 采样与验收边界

浏览器独立 880×495 离屏绘制，9 轮交替顺序，每轮 20 次，单位 ms/次的中位数：

| 血滴数 | 旧 Graphics 命令创建与绘制 | 保留式批绘制 |
| --- | ---: | ---: |
| 1000 | 0.920 | 0.245 |
| 4000 | 3.890 | 0.885 |

这只衡量血滴命令创建/绘制路径，不含整场 AI、路径规划、所有动画或 GPU 内存成本，不是整场 FPS 提升承诺。

人物对象生命周期 QA 使用同一不可变合成帧比较旧绘制和保留式位图绘制。最初直接重新合成染色画布时，浏览器读回出现 2 个 RGB 通道差 1、alpha 完全一致，因此将生命周期验收与内容验收分开；上面的独立原帧内容验收仍保持逐像素检查，没有放宽误差。

总迁移目标仍未完成；后续优先核对扩展制作流程与剩余动态对象，再进行实际战场帧耗时采样，不据本阶段结果宣称所有卡顿已解决。

### 本阶段修改文件

`runtime/BattleBlood.ts`、`runtime/BattleBloodVisual.ts`（新增）、`runtime/BattleFieldView.ts`、`runtime/Battle.ts`、`tools/battle_skeleton_regression.mjs`、`qa/battle-parity.ts`、`/mods/revival/qa/battle-parity.html`、`BATTLE_DOLL_PORT.md`。

## 2026-09-13 同帧重绘优化与性能边界

人物身体／阴影已就绪时复用同帧姿态，保留相机、显隐和火焰更新，并处理素材等待期间的姿态往返。专用回归与开发验证页均在 DLC 内，本轮未新增本体源码改动。24 人物实测、对照数据及限制见 [qa/PERFORMANCE.md](qa/PERFORMANCE.md)。持续换帧的额外开销和整场战斗长帧仍需继续定位，不宣称整体性能验收完成。

### 2026-09-26 修正：恢复状态槽背景纹理

上一版将状态槽底色设为不透明实色，造成整块棕色遮罩。现已改回装备页同款半透明参数：底色 4208688 @ 0.4、上/右白边 @ 0.3、下/左黑边 @ 0.6，因此槽位保留双层边框且能透出人员页背景纹理。

### 2026-09-26 修正：图标原色与单一外框

状态图标不再叠加 DIM/BRIGHT 两层色彩变换，改为中性 colorTransform 保留源图颜色；图标格子不再单独绘制边框，双层边框只绘制在整个状态槽外框上。槽底仍严格使用装备页代码同款 \eginFill(4208688, 0.4)。

### 2026-09-26 修正：状态槽绘制层级

外层状态槽先绘制、图标滚动条后绘制，避免半透明底色覆盖图标；图标格恢复装备槽同款底色与明暗双层边框，图标保持中性色彩变换（原图颜色）。

### 2026-09-26 修正：恢复图标格白色底填充

图标格恢复原先的 \eginFill(0xffffff, 0.18)，外层状态栏继续使用装备页槽底 \eginFill(4208688, 0.4)；两层均保留白高光/黑阴影双边框。

### 2026-09-26 最终拆分：只改外层状态槽

外层状态槽单独使用装备页底色 4208688 @ 0.4 与明暗双层边框；内部状态图标格恢复第一次修改前的 STATUS_CELL_BG @ 1、格子边框以及 DIM/BRIGHT 双层图标绘制。两层样式互不覆盖。

### 2026-09-26 修正：外层状态槽改为可见双圈边框

新增 \uildStatusOuterBorder()：外层状态槽现在绘制黑色外圈矩形与白色内圈矩形，并在图标槽之后叠加边框；图标内容和内部图标槽不再被覆盖。

### 2026-09-26 修正：外层边框顺序与图标槽隔离

外层状态槽现在是白色外圈、黑色内圈；外层填充仅位于图标层下方。内部状态图标槽恢复不透明 \x57473b 底色，避免外层半透明颜色叠加改变图标槽颜色。

### 2026-09-26 修正：移除状态图标黄 tint

状态图标改为单层中性色彩变换：/g/b=1、dr/dg/db=0。移除了会产生黄褐色的 BRIGHT_TINT 加法偏移和 DIM/BRIGHT 双层叠加；图标槽底色与边框保持不变。

### 2026-09-26 修正：恢复图标格白色背景

图标格底色恢复为 \eginFill(0xffffff, 0.18)；外层状态槽仍使用 \eginFill(4208688, 0.4)，两者分开。

### 2026-09-26 修正：图标格四向留距统一

状态槽调整为 STATUS_FRAME_H=40、STATUS_BAR_PAD=2：图标格相对外框上/左各 2px，图标格与横向滚动条间距 2px，滚动条与外框底部保留 2px。

### 2026-09-26 修正：缩小顶部留白

图标滚动条位置由 STATUS_SLOT_Y+2 调整为 STATUS_SLOT_Y+1；外框高度同步改为 STATUS_FRAME_H=39，保持图标格、滚动条与底部外框的间距不变。
