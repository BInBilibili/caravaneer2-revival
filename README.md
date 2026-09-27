# Caravaneer 2 HTML5 移植与 Revival 扩展 · 项目说明书

> **本文档的定位**：让任何一个人或任何一个大模型，**只读这一份文件**就能准确掌握本项目的范围、架构、数据流、量纲约定、扩展点与风险边界，并知道"要改某件事该动哪个文件、必须跑哪个测试"。
>
> **阅读约定（先读，避免歧义）**
> 1. 所有路径以工程根 `D:\game\Caravaneer 2 deepseek\` 为基准。`web/` 是 TypeScript 工程，`decompiled/` 是原版 AS3 反编译产物，`scripts/`（根级）是数据转换脚本，`web/scripts/`（web 内）是测试与探针。
> 2. 形如 `src/game/World.ts:3195` 的引用 = 文件 + 行号。**行号会随改动漂移**；对不上时用同行给出的符号名或字符串去 grep。
> 3. 本文所有关键数字都给出"复核命令"，可随时自证。
> 4. **冲突裁决见 §15.1**：当前实现看代码；本体原版行为看 AS3；Revival 新功能看用户确认的需求与设计；测试结果看最近一次报告。架构说明以本文为入口，`web/README.md` 是历史记录，冲突时需核验。
> 5. 本文刻意重复三处关键不变量（时间流速、周期阈值、城镇槽位）。**重复是设计，不是冗余**——这三处是历史上真正改错过的地方。

---

## 0. 30 秒速览

**这是什么**：以 Flash/AIR 单机游戏 *Caravaneer 2*（原版 ActionScript 3，SWF v43，stage 880×495，版本 1.1.3 build 210）为基础的**浏览器 HTML5/Canvas 2D 移植与扩展项目**。本体以还原原版为目标；在高完成度移植的基础上，后续重点是在 **`revival`（复兴）DLC 中增加原版没有的功能**。不用 Flash 运行时，不用 Phaser/Pixi 等游戏引擎，自建迷你显示列表。移植内容复用从反编译产物提取的原版素材；新增功能可按需求增加代码、数据和素材。

**技术栈**：TypeScript 5.5 + Vite 7 + 原生 Canvas 2D。无第三方游戏引擎；`package.json` 中唯一的运行时依赖为 `fflate ^0.8.3`（用于 .sol 存档压缩数据处理）。

**当前阶段与下一步（方向更新：2026-09-20）**：用户确认本体移植已达到较高完成度，开发重心转向 Revival 新功能。本次更新核对了 `web/package.json` 与 Revival README 的架构说明，未重新执行游戏回归；下文文件数、行号、体积等保留自此前整理，不代表本日期全量核验结果。

| 工作范围 | 当前方向 | 完成与验收标准 |
| --- | --- | --- |
| 本体 `web/src/` | 维护原版兼容，按需要修复缺陷、提供通用扩展接口 | 对应原版行为与专项回归；不因 DLC 新功能无意改变禁用 DLC 时的行为 |
| Revival `web/public/mods/revival/` | **后续主要开发位置：追加原版没有的玩法、功能与表现** | 按用户确认的功能需求验收；有意设计的差异不视为移植缺陷 |
| 共享接口与存档 | 新功能确有需要时扩展本体通用能力 | 验证启用/禁用边界、旧存档兼容及相关本体回归 |
| 下一项具体功能 | 尚未在本文指定；以用户后续需求为准 | 开发前明确功能行为、数据归属和验收场景，不把计划写成已实现 |

**接手顺序**：先确认任务属于本体兼容修复还是 Revival 扩展 → 查 §1.3 与 §7 定位 → 明确验收标准 → 实现并按 §10 验证。**“原版没有”不是拒绝或删除 Revival 新功能的理由。**

**规模**：`web/src` 共 **82 个 .ts 文件、32,606 行**；`src/game` 58 个文件、`src/core` 21 个、`src/scenes` 1 个。

**怎么跑**：
```bat
:: 只想玩（需要 web/dist 已构建，仓库内已有）
Caravaneer2-Launcher.exe      :: 或 start.bat / start.sh
:: 开发
cd web && npm install && npm run dev      :: http://localhost:5173/
cd web && npm run build                   :: tsc --noEmit && vite build -> web/dist
```

### 0.1 事实卡（数字 + 复核命令）

| 事实 | 值 | 复核命令（工程根执行） |
| --- | --- | --- |
| TS 源文件数 / 总行数 | 82 / 32,606 | `find web/src -name "*.ts" \| wc -l` |
| `src/core` / `src/game` / `src/scenes` | 21 / 58 / 1 | `ls web/src/core/*.ts \| wc -l` |
| 最大文件 | `src/game/Battle.ts` 4423 行 | `wc -l web/src/game/*.ts \| sort -n \| tail -5` |
| 第二 / 第三 / 第四 | `World.ts` 4352 · `CaravanMenu.ts` 3948 · `TradeWindow.ts` 1941 | 同上 |
| 第五~第十 | `TownMode.ts` 1637 · `Shell.ts` 1415 · `MapMode.ts` 1113 · `BattleFieldView.ts` 967 · `BattleHud.ts` 941 · `CharacterSetupScreen.ts` 824 | 同上 |
| 原版反编译 | 1275 个 `.as`、图片 816、音效 96 | `find decompiled/all -name "*.as" \| wc -l` |
| 资源清单 | images **910** / sounds **96** / fonts **3** | `node -e "const m=require('./web/public/assets/manifest.json');console.log(Object.keys(m.images).length,Object.keys(m.sounds).length,Object.keys(m.fonts).length)"` |
| AS3 回调占位 | **1984** 个，键名 `__as3fn`（**两个前导下划线、无尾随下划线**，不是 `__as3fn__`） | `grep -o "__as3fn" web/public/data/dialogues.json \| wc -l` |
| 城镇槽位（仅基础数据） | **83** | `node -e "console.log(require('./web/public/data/presets.json').town_presets[0].length)"` |
| 城镇槽位（启用全部内置 DLC） | **85** | 见 §4.4 |
| 时间流速 | **1 真实秒 = 6000 游戏秒**（1 游戏日 = 14.4 真实秒） | 见 §3.1 |
| 周期阈值 | 城镇经济 **43200** / 人物消耗 **21600** / 运输动物 **21600** 游戏秒 | 见 §3.2 |
| 逻辑分辨率 | 880 × 495 | `grep -n "880" web/src/core/Game.ts` |
| 回归脚本 | **21** 个 `*_regression.mjs` | `ls web/scripts/*_regression.mjs \| wc -l` |
| `web/scripts` 文件总数 | 209（≈170 个一次性探针） | `ls web/scripts \| wc -l` |
| 随工程内置 DLC | **5** 个 | `cat web/public/mods/index.json` |
| 存档槽位 | **6** | `grep -n "SAVE_SLOTS" web/src/game/SaveSystem.ts` |
| 数据 / 素材 / DLC / 构建产物体积 | 9.8 MB / 60 MB / 21 MB / 91 MB | `du -sh web/public/data web/public/assets web/public/mods web/dist` |

### 0.2 六句话讲清架构

1. `src/main.ts` 是唯一入口：载数据 → 建资源仓库 → 建 Mod 运行时 → 建 Shell → 挂到 `Game` 主循环，并把 `window.__c2` 等调试句柄暴露出去（见 §2.2）。
2. `GameData`（`src/game/World.ts:2681`）是**全局静态中枢**：世界状态、车队、城镇、时间全在这一个对象里，跨模块共享。
3. ⚠️ `src/game/World.ts` **不是"一个类"**——它是"文件即模块"，含 18 个导出符号（Character / Caravan / Town / GameData / …）。全工程 `new World(` 出现 **0 次**。这一点最容易让新人读错架构。
4. `Shell`（`src/game/Shell.ts`，1415 行）是**屏幕状态机 + 依赖注入容器**：用 factory 模式创建 `MapMode` / `TownMode` / `Battle`（这是 Mod 替换子系统的接缝），并把回调对象 `hooks` 注入进去，让子系统能反过来驱动 Shell 切屏。
5. `src/core/` 是与游戏无关的**引擎层**：Canvas 显示列表、UI 控件、音频、存档、Mod 运行时、文本。
6. 本体兼容行为用**原版反编译代码**校准，注释标注 `原版 xxx.as:NNNN`；Revival 新增或有意修改的行为按用户确认的设计实现，并记录与原版的差异及作用范围。两类任务采用各自的验收依据。

---

## 1. 快速开始

### 1.1 只想玩（Windows exe 不需要 Node；启动脚本需要 Node/npm）

1. 确认 `web/dist` 已构建（仓库内已有：`web/dist/index.html` + `assets/` + `data/` + `mods/`）。
2. Windows 下双击工程根目录的 `Caravaneer2-Launcher.exe`，不需要 Node。使用 `start.bat` / `start.sh` 则需要 Node/npm 及可用的 Vite 环境。
3. 托盘出现图标 → 浏览器自动打开 `http://localhost:5174/`；退出用托盘右键 **Exit**（会一并关掉游戏窗口）。

Launcher 行为要点（源码 `Launcher.cs`，C# HttpListener + 托盘程序）：

- **站点根目录**按 exe 所在目录解析（依次探测 `web/dist` / `../web/dist` / `dist`），所以整个文件夹复制到别处仍能跑。
- **多副本共存**：以"exe 目录 + 站点根"计算身份（`/__launcher_id` 探针）；同一副本重复双击只会再开一个窗口并复用已有服务器；放在别处的副本顺延到 5175–5179 另起服务器。
- 退出时**同步关闭游戏窗口**（窗口句柄通过 `/__adopt` 托管给服务器进程）；`--quit-after=秒` 用于无人值守退出。
- Windows 专用（依赖 System.Windows.Forms + P/Invoke）；macOS/Linux 可使用依赖 Node/npm 的 `start.sh` 提供预览服务（无托盘与窗口托管）。
- 辅助脚本：`scripts/_launcher_lab.ps1`（List/Cleanup/Status/StartExe/CloseWindow/KillExe/Curl/FullTest）、`scripts/_multi_copy_test.ps1`（多副本共存验证）。

`start.bat` / `start.sh` 做的事就是：`cd web` → 打开 `http://localhost:5174/` → `npx vite preview --port 5174 --strictPort`。

### 1.2 有 Node（开发 / 重新构建）

```bash
cd web
npm install
npm run dev        # 开发服务器 http://localhost:5173
npm run build      # tsc --noEmit + vite build -> web/dist
npx vite preview --port 5174 --strictPort   # 生产预览（= start.bat 做的事）
```

`web/package.json` 的 scripts 全表：

| script | 内容 |
| --- | --- |
| `dev` | `vite`（端口 5173） |
| `build` | `tsc --noEmit && vite build` —— **类型不过不产出构建** |
| `preview` | `vite preview` |
| `smoke` | `node scripts/smoke_test.mjs` |
| `test:battle` | 战斗障碍回归 |
| `test:skeleton` | 战斗骨骼/动画（用 `node --experimental-strip-types`，**需 Node 22.6+**） |
| `test:animation-legacy` | 旧版动画轨道回归 |
| `generate:battle-animation` | 重建动画轨道数据 |

依赖：`dependencies` 只有 `fflate ^0.8.3`；`devDependencies` 为 `playwright-core ^1.62.1`、`pngjs ^7.0.0`、`typescript ^5.5.0`、`vite ^7.0.0`。其余脚本 Node 18+ 即可。

### 1.3 关键路径对照（"我要找 X → 去哪里"）

| 我要找…… | 去哪里 |
| --- | --- |
| 游戏入口 / 启动装配 | `web/src/main.ts` |
| 主控屏幕机 + 存档调度 + 战斗调度 | `web/src/game/Shell.ts`（1415 行） |
| 世界/经济/周期 tick 中枢 | `web/src/game/World.ts`（4352 行，18 个导出） |
| 大地图 / 移动 / 遭遇 / 进镇 | `web/src/game/MapMode.ts`（1113 行） |
| 城镇界面 | `web/src/game/TownMode.ts`（1637 行） |
| 战斗（16 个 `Battle*.ts` 文件） | `web/src/game/Battle.ts` 等，见 §5 |
| 剧情 / 对话 / AS3 转译器 | `web/src/game/Story.ts`、`web/src/game/DialogueScreen.ts` |
| 引擎层（显示/输入/文本/UI/资源/存档/Mod） | `web/src/core/`（21 个文件，见 §2.3） |
| 静态数据（JSON） | `web/public/data/` |
| 图片/音效/字体 + manifest | `web/public/assets/` |
| DLC / Mod | `web/public/mods/` |
| 原版反编译源码与素材 | `decompiled/all/`（另有 4 个 DLC 的独立目录） |
| 数据转换脚本 | `scripts/`（根级，见 §4.2） |
| 测试 / 回归 / 探针 | `web/scripts/`（209 个文件，见 §8） |
| 独立 QA 内存场景页 | `web/qa/`、`web/public/mods/revival/qa/` |
| 逐轮开发日志 | `web/README.md`（见 §15.2 关于轮次缺号） |

---

## 2. 架构总览

### 2.1 分层与依赖方向

```
                        ┌──────────────────────────────────────────┐
   浏览器 / 玩家  ────►  │  src/main.ts  （唯一入口，装配一切）      │
                        └───────────────────┬──────────────────────┘
                                            │ 构造顺序即依赖顺序
        ┌───────────────────────────────────┼────────────────────────────────────┐
        ▼                                   ▼                                    ▼
┌───────────────┐                 ┌──────────────────┐                 ┌────────────────┐
│ src/core/     │                 │ src/game/Shell.ts│                 │ window.__c2*   │
│  引擎层       │◄──── 被依赖 ────│  屏幕机 + DI 容器 │──── 创建 ─────► │  调试/探针句柄  │
│ （21 个文件）  │                 │  （1415 行）      │                 └────────────────┘
└───────┬───────┘                 └────────┬─────────┘
        │                                  │ factory + hooks 注入
        │                                  ▼
        │                     ┌────────────────────────────────────────┐
        │                     │ src/game/ 玩法层（58 个文件）           │
        │                     │  MapMode / TownMode / Battle /         │
        │                     │  CaravanMenu / TradeWindow / Story ... │
        │                     └────────────────┬───────────────────────┘
        │                                      │ 全部共享同一个
        ▼                                      ▼
┌──────────────────────┐            ┌──────────────────────────────┐
│ DataStore / Assets / │            │ GameData  （World.ts:2681）   │
│ Input / Sound /      │◄───────────│  全局静态中枢：时间、车队、     │
│ SaveStore / ModRuntime│            │  城镇、经济、NPC 全在这一个对象 │
└──────────────────────┘            └──────────────────────────────┘

依赖方向铁律：
  core/  不得 import game/        （引擎层对游戏无知）
  game/  可以 import core/
  World.ts 不得 import Economy.ts （用 globalThis.__c2GetItemData 打破循环，见 §2.2 步骤 4）
```

### 2.2 启动链路（`web/src/main.ts`）

按代码实际顺序，逐步：

1. 取 `canvas`（逻辑 880×495）。
2. `new ModRuntime({ allowScripts, bundledRuntimes }).load()` —— 读 `public/mods/index.json`，载入各 DLC 清单与数据补丁。
   脚本安全阀：只有 `?allowModScripts=1` 或 `localStorage["c2:allowModScripts"]="1"` 时才执行 Mod 脚本。
3. `loadDataStore(18, mods)` —— 载入 13 份 JSON（`18` = 简体中文语言索引，见 §4.5）；最后调 `runtime.applyTo(base)` 把 Mod 补丁合并进数据。
4. `globalThis.__c2GetItemData(id)` —— 注入物品 5 大类查询函数。**存在的唯一理由是打破 `World.ts` ↔ `Economy.ts` 的循环依赖**：世界层需要知道物品属于哪一类，但物品分类逻辑在经济层。
5. `new AssetStore(ds)` + `loadFonts()` —— 资源仓库与字体。
6. `initSounds()` / `setSoundFX()` / `setMusicOn()`。
7. `new GameShell(ds, assets, canvas)` —— 主控（`src/game/Shell.ts`）。
8. 暴露调试句柄：`window.__c2 = { shell, ds, assets, mods }`，另有 `window.__c2ModApi`、`__c2SaveSystem`、`__c2Story`、`__c2Game`。**所有自动化测试与探针都通过它们取值。**
9. `new Input(canvas, () => shell.currentScreen)` —— 输入分发（命中测试绑定到"当前屏幕"）。
10. `game.setScene(shell); game.start()` —— 交给 RAF 主循环。
11. `mods.events.emit("game:boot")` —— 通知 Mod：启动完成。

失败不静默：画布上直接打印 `启动失败: …`。

### 2.3 引擎层 `src/core/`（21 个文件全表）

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `Game.ts` | — | RAF 主循环、`Scene` 接口、画布尺寸与缩放（见 §3.3） |
| `Display.ts` | 430 | **迷你显示列表**：Sprite / Graphics / BitmapObject、`addChildAt`、`alpha`、`blendMode: layer/erase`、tint、scale —— 复刻 Flash 图层混合语义 |
| `Ui.ts` | 659 | Button / Switch / ScrollableArea 等原版控件 |
| `EngineText.ts` | — | 逐字符排版（对应原版 EngineText），中英文字形与描边 |
| `DataStore.ts` | — | 载入 13 份 JSON；`getText()` 对齐 AS3 `Texts.fetch` 的回退链（见 §4.5） |
| `Assets.ts` | — | 按资源名（如 `TownBG.jpg`）查询并懒加载图片/音效/字体，支持 Mod 覆盖 |
| `Input.ts` | — | 鼠标/键盘事件 → 显示列表命中测试 |
| `Sound.ts` | — | WebAudio 音效与音乐；`initMusicAutoPause()` 切后台暂停 BGM |
| `SaveStore.ts` | — | `SharedObjectLike`（localStorage 封装的 Flash SharedObject 语义） |
| `SolImporter.ts` | 700 | **原版 .sol 存档**解析：TCSO 头 + AMF0 解码 + AMF3 最小支持 + zlib 解压 |
| `SolExporter.ts` | — | 原版 .sol 生成：`buildSolFile` / `buildSolFileCompressed` / `saveDataToOriginal` / `downloadBlob` |
| `ModRuntime.ts` | — | Mod 发现、清单校验、依赖排序、数据补丁合并、资源覆盖、事件/服务/规则注册（见 §7） |
| `LcdCounter.ts` | — | 复刻原版 Counter.as 的 LCD 计数器；**注释里确认了"原版按 25fps 帧驱动"这一前提**（`:97 this.acc += dt * 25;`） |
| `SevenSegmentIndicator.ts` | — | 复刻原版七段数码管指示器 |
| `PaperUi.ts` | — | 复刻原版"纸张"风格 UI 组件 |
| `PaperArrow.ts` | — | 复刻原版纸张箭头（导航指示） |
| `Indicator.ts` | — | 复刻原版指示器基类 |
| `DialogueBg.ts` | — | 对话框背景（含挖洞/透明语义） |
| `CursorInfoPanel.ts` | — | 鼠标悬停信息面板 |
| `CalculatorPanel.ts` | — | 贸易计算器面板 |
| `WebTexts.ts` | — | 文本资源的 Web 端封装/加载 |

> 后 8 个（`LcdCounter` 起到 `WebTexts`）都属于**"复刻原版 HUD 控件"**一类，体量小但视觉敏感，改动务必配像素探针。

### 2.4 玩法层 `src/game/`（58 个文件，重点文件）

| 文件 | 行数 | 对应原版 |
| --- | --- | --- |
| `Battle.ts` | 4423 | BattleMode.as + BattleField.as 主循环 |
| `World.ts` | 4352 | GameData.as（世界/经济/周期 tick 中枢，**文件即模块**） |
| `CaravanMenu.ts` | 3948 | CaravanMenu.as（11 页签队伍管理） |
| `TradeWindow.ts` | 1941 | TradeWindow.as（贸易） |
| `TownMode.ts` | 1637 | TownMode.as（城镇、产业、雇用、统计） |
| `Shell.ts` | 1415 | Caravaneer2.as 文档类（屏幕机 + 存档 + 战斗调度） |
| `MapMode.ts` | 1113 | MapMode.as（大地图/移动/遭遇/进镇） |
| `BattleFieldView.ts` / `BattleHud.ts` / `BattleDoll.ts` | 967 / 941 / 635 | 战斗渲染、HUD、人物骨骼与动画 |
| `CharacterSetupScreen.ts` | 824 | 角色创建（14 部件肖像 + 属性 + 色板） |
| `SaveSystem.ts` | 672 | 存档快照与槽位（见 §6） |
| `Story.ts` | — | 剧情状态 + **AS3→JS 转译器**（见 §4.6） |
| `eventData.ts` | **304,708 B** | 从原版导出的剧情事件数据（**超长单行字符串文件**，`wc -l` 只有 4 行） |
| `originalDlcHooks.ts` | **38,998 B** | 四个原版付费 DLC 的钩子逻辑（**超长单行**，`wc -l` 只有 2 行） |

> ⚠️ `eventData.ts` 与 `originalDlcHooks.ts` 是**生成/导出型超长单行文件**。不要用"看行数"判断它们的复杂度，也不要用逐行 diff 工具处理——用 grep 定位字符串。

**`src/` 顶层与 `src/scenes/` 下另有 3 个文件**：`src/main.ts`（唯一入口）、`src/scenes/BootScene.ts`（71 行，早期启动占位，现主要由 Shell 承担）、`src/bundled-mod-runtimes.d.ts`（Vite 插件生成的代码 DLC 模块类型声明）。
> 计数校验：`21 (core) + 58 (game) + 1 (scenes) + 2 (顶层) = 82` ✓

**战斗子系统恰好 16 个 `Battle*.ts`**（复核：`ls web/src/game/Battle*.ts | wc -l`）：
`Battle`、`BattleAI`、`BattleBlood`、`BattleCollision`、`BattleDeployment`、`BattleDepth`、`BattleDoll`、`BattleEncounter`、`BattleFieldView`、`BattleFlames`、`BattleHud`、`BattleMessages`、`BattleObstacles`、`BattleOptionsWindow`、`BattleStoryEncounters`、`BattleTransportAnimation`。

### 2.5 World.ts 内部结构（"文件即模块"）

`src/game/World.ts` 有 **18 个导出符号**，按行号顺序：

| 行号 | 导出 | 是什么 |
| --- | --- | --- |
| `:22` | `Character` | 人物（技能、属性、伤口、装备） |
| `:629` | `makeRandomCharacter()` | 随机人物工厂 |
| `:652` | `makeTransportUnit()` | 运输单位工厂 |
| `:763` / `:783` / `:787` | `randomHairColor` / `randomPantsColor` / `randomShirtColor` | 外观随机 |
| `:795` | `weightedIndex()` | 加权随机（概率表通用工具） |
| `:805` | `Caravan` | 车队（玩家与 NPC 共用） |
| `:2062` | `Town` | 城镇（库存/价格/产业/人口） |
| `:2428` | `NpcRoutePoint` | NPC 路线点 |
| `:2478` | `npcVisualWarPower()` | NPC 可视战力评估 |
| `:2499` | `NpcCaravan` | NPC 车队 |
| `:2602` / `:2639` | `EnemyPersonSpec` / `EnemySquad` | 敌人规格类型 |
| `:2658` / `:2671` | `sanitizeEnemyPersonSpec` / `sanitizeEnemySquad` | 规格清洗（防脏数据） |
| `:2675` | `GameStartOptions` | 开局选项类型 |
| `:2681` | **`GameData`** | **全局静态中枢** |
| `:2682` | `static squareSize = 500` | 世界方格边长（坐标换算用） |
| `:3153` | `static averageSlavePrice = 5000` | 平均奴隶价（经济基准） |

**`GameData` 的关键字段/方法（行号）**：

| 行号 | 内容 |
| --- | --- |
| `:2683` | `Time` 初值 `2509568400`（**与原版 GameData.as:470 完全同值**） |
| `:3178` | `events.emit("world:construct")` |
| `:3195` | `const tp = ds.presets.town_presets?.[0] ?? [];` —— 城镇槽位来源（见 §4.4） |
| `:3197-3200` | `for (let i=0;i<tp.length;i++)` 建 `this.Towns[i] = t` |
| `:3206` | `if (preset.storyOnly) t.active = false;`（非 storyMode 时） |
| `:3207` | `if (!tp[i]) { t.active = false; continue; }`（空槽位） |
| `:3208` | `if (i === 34 \|\| i === 68) t.active = false;`（原版硬编码的两座不可达城镇） |
| `:3264` | `events.emit("world:mode")` |
| `:3789` | 注释：`→ cycleCounter 单位 = 60 游戏秒；城镇周期 720 单位 = 43200 游戏秒 = 12 游戏小时` |
| `:3792` | `this.townCycleAcc += dt * 6000 * this.gameSpeed;` |
| `:3793` | `while (this.townCycleAcc >= 43200)` |
| `:3928` | `this.peopleCycleAcc += dt * 6000 * this.gameSpeed;` |
| `:3929` | `while (this.peopleCycleAcc >= 21600)` |
| `:4149` | `this.transportCycleAcc += dt * 6000 * this.gameSpeed;` |
| `:4150` | `while (this.transportCycleAcc >= 21600)` |

**`Town` 关键字段**：`cycleCounter`（初值 `Math.floor(Math.random()*720)`）、`playersStorage`、`stock`、`prices`、`industries`、`playersIndustries`、`unemployed`（= 人口 × 0.85 − 雇员数）、`electricityPrice`、`money`、`playersMoney`、`bannedGoods`、`illegalActions`、`noticeability`、`discovered`、`active`。

**`Caravan` 关键字段**：`x`/`y`/`direction`/`moving`、`category`、`slavers`、`cannibal`、`money`、`People`、`cargo`（`Map`）、`squareX`/`squareY`、`overTown`、`recentlyInteractedTowns`、`nearbyTowns`、`mapSymbol`、`transports`、`collectForage`、`hunt`、`zoneForageDevastation`、`zonePreyDevastation`、`autoFillLubricant`、`autoFillWater`、`milk`。

### 2.6 Shell 作为依赖注入容器（Mod 的接缝）

`src/game/Shell.ts:107-122` 用 **factory 服务**创建所有子系统。Mod 只要注册同名 service 就能整体替换实现：

```ts
:108  this.mods?.service<(ds,opts)=>GameData>("factory.gameData")   ?? (() => new GameData(this.ds, opts))
:112  this.mods?.service<...>("factory.mapMode")    ?? (() => new MapMode(gd, ds, assets, hooks))
:116  this.mods?.service<...>("factory.townMode")   ?? (() => new TownMode(gd, town, ds, assets, hooks))
:120  this.mods?.service<...>("factory.battle")     ?? (() => new Battle(gd, ds, assets, hooks, opts))
```

**`hooks` 是回调对象**，由 Shell 构造后注入，让子系统反向驱动 Shell：

| 子系统 | hooks 构造位置 | 回调键 |
| --- | --- | --- |
| `MapMode` | `Shell.ts:599` 起 | `isInputBlocked` / `worldFrozen`、`onEnterTown`、`onOpenMenu(which: "save"\|"caravan"\|"options"\|"settings"\|"map")`、`onEncounter`、`onNpcCaravan`、`onNotify` |
| `TownMode` | `Shell.ts:640` 起 | `onExitToMap`、`onOpenCaravanMenu`、`onOpenNavigation` |
| `Battle` | `Shell.ts:957` 起 | `onEnd(win, loot)` —— 负责清理死亡/被俘单位；若清空车队则置 `owner.active=false` 并从 `gd.npcCaravans` 移除 |

> **进镇坐标吸附**：原版 `MapMode.as` 的 `doEnter`（L8068-8076）会把 `Caravans[0].x/y` 直接赋成 `Presets.Towns[id].x/y`；web 端在 `Shell.ts` 的 `enterTown` 里补了 `c.x=t.x; c.y=t.y` 以对齐。

### 2.7 主循环、Scene 接口与画布缩放

`src/core/Game.ts` 末尾：

```ts
export interface Scene { update(dt: number): void; render(ctx: CanvasRenderingContext2D): void; }
```

`GameShell implements Scene`。`game.setScene(shell)` 后，RAF 主循环每帧：

1. `dt = Math.min((t - lastT) / 1000, 0.1)` —— **dt 上限 0.1 秒**（防切标签页后时间跳变）。
2. 调 `scene.update(dt)`。
3. `fillRect` 黑底。
4. 调 `scene.render(ctx)`。

`Game.showFps` 由 Shell 的 **F1 键**切换（`Shell.ts:99-103`）。

**缩放公式（§3.3 有完整推导，探针必读）**：

```ts
scale = Math.min(window.innerWidth / 880, window.innerHeight / 495);
dpr   = Math.min(window.devicePixelRatio || 1, 2);
canvas.width  = Math.floor(880 * scale * dpr);      // 高度同理
ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
ctx.imageSmoothingEnabled = true;
```

### 2.8 屏幕状态机

**顶层 `Shell.screenNum`**（下表所有值都在代码里实测到调用点）：

| 值 | 含义 | 代码证据（`src/game/Shell.ts`） |
| --- | --- | --- |
| `1` | 语言选择 | `:315` 标题菜单 "CHANGE LANGUAGE" |
| `2` | 标题菜单 | `:104` 构造末尾默认 `setScreen(2)`；`:424` 角色创建取消；`:1279` 制作人员结束；`:1113` GameOver 返回 |
| `4` | 进入游戏（大地图） | `:504`/`:539` 叙事页结束；`:1384` 倒计时结束 |
| `6` | 角色创建 | `:310` 标题菜单"新游戏"；`:483` 设置页 back |
| `7` | 难度/模式设置 | `:423` 角色创建 `onDone` |
| `8` | 开场叙事页（含倒计时） | `:486` 设置页 start |
| `10` | 制作人员 | `:313` 标题菜单 credits |
| `11` | 片头跳转态 | 未在调用点直接出现，属过渡态 |

新游戏完整链路：**6（角色创建）→ 7（设置）→ 8（叙事页）→ 4（大地图）**。

**游戏内 `Shell.gdScreen`**：`"map"` | `"town"` | `null`。战斗是**叠加层**（`currentScreen.addChild(battle)`），不改变 `gdScreen`。

**`Shell` 状态字段全表（`Shell.ts:46-80`）**：`currentScreen`(Sprite)、`savedData`/`savedConfig`(SharedObjectLike)、`language`、`cfg`、`screenNum`、`gd`、`mapMode`、`townMode`、`gdScreen`、`battle`、`caravanMenu`、`eventDlg`、`saveDlg`、`saveDlgMode`、`introCutscene`、`yesNoDlg`、`exitConfirmDlg`、`encounterMenu`、`encSettings`、`encObstacles`、`encNpc`、`dlcOverlay`、`loadSaveOverlay`、`lastTownId`、`charSetup`、`countdown`、`theCharacter`、`languagesArea`、`languageRows`、`creditsTexts`、`creditsMoving`、`autoSaveBox`/`autoSaveFrames`/`autoSaveFrameTime`、`showTutorial`。

> ⚠️ **`setScreen()` 会重置 7+ 个字段**（`Shell.ts:126-150`）：`gameOverVisible`、`autoSaveBox`/`autoSaveFrames`/`autoSaveFrameTime`、`mapMode?.destroy()`、`townMode`、`charSetup?.destroy()`、`caravanMenu`、`battle?.destroy()`、`eventDlg`、`countdown`、`gdScreen`、**`gd = null`**、`yesNoDlg`、`exitConfirmDlg`、`encounterMenu`、`encNpc`、`npcTrade`、`navScreen?.destroy()`。
> 代码注释标注这是 **t81 修复的"二次新游戏卡死"**。**任何新增跨局状态字段，都必须在这里加重置**，否则会复现同类 bug。

> 另注（`Shell.ts:720` 注释）：`setScreen()` 的 `currentScreen.removeAll()` 会摘除 `saveDlg.screen`，读档弹窗需要重新挂回显示树。

### 2.9 为什么必须要有"迷你显示列表"

原版美工大量依赖 Flash 的 `blendMode = layer`（把子节点合成后再整体应用 alpha）与 `erase`（挖洞透出下层）。Canvas 2D 的 `globalCompositeOperation` 无法直接表达，因此 `src/core/Display.ts` 实现了带**层组语义**的显示列表。

这是**本项目视觉能对齐原版的前提**，也是历史上多轮 UI 修复（按钮泛白、气泡挖洞、纹理叠成纯色）的根源所在。改动 `Display.ts` 的混合语义 = 高风险操作。

### 2.10 语言默认值与自动暂停

- **未知语言配置回退到简体中文**（`Shell.ts:84-93`）：读 `savedConfig.data.language`，若为未知值则设为 `18`（简体中文）并写回。
- `Shell` 构造里调 `initMusicAutoPause()`：切到后台自动暂停 BGM。
- `Shell` 构造末尾 `this.setScreen(2)`。

---

## 3. 时间、量纲与坐标（最容易改错的地方）

> **本节是全文档最重要的一节。** 历史上三个最严重的 bug 都出自这里：时间流速写错 16.67 倍、周期阈值混用、像素探针未做 dpr 换算。

### 3.1 时间流速：1 真实秒 = 6000 游戏秒

**当前实现（以代码为准）**：`1 真实秒 = 6000 游戏秒`，即 **1 游戏日 = 14.4 真实秒**。

代码中**四处完全一致**：

| 文件:行 | 代码 |
| --- | --- |
| `web/src/game/MapMode.ts:686` | `gd.Time += dt * 6000 * gd.gameSpeed;` |
| `web/src/game/World.ts:3792` | `this.townCycleAcc += dt * 6000 * this.gameSpeed;` |
| `web/src/game/World.ts:3928` | `this.peopleCycleAcc += dt * 6000 * this.gameSpeed;` |
| `web/src/game/World.ts:4149` | `this.transportCycleAcc += dt * 6000 * this.gameSpeed;` |

`web/src/game/MapMode.ts:686` 的注释给出了完整推导（**引用原文**）：

> `校准：原版每帧 Time += 60*4=240 游戏秒，×25fps = 6000 游戏秒/真实秒 → 1 游戏日 = 14.4 真实秒`

**推导链（原版依据，可复核）**：

1. `decompiled/all/scripts/IsoEngine/MapMode.as:2635`：`GD.Time += 60 * GD.gameSpeed * 4;`
2. 该语句位于 `public function enterFrame(param1:Event)`（`MapMode.as:512`）内，由 `MapMode.as:161` 的 `addEventListener("enterFrame", enterFrame, ...)` 驱动 → **原版每帧推进 240 游戏秒**。
3. 原版 Flash 帧率按 **25 fps** 计 → 25 × 240 = **6000 游戏秒 / 真实秒**。
4. `decompiled/all/scripts/IsoEngine/GameData.as:29`：`public static const mapModeTimeMultiplier:* = 4;` —— 上面的 `* 4` 就是它。

**为什么可以用 25 fps 这个前提**（工程内部多处独立佐证）：

- `web/src/core/LcdCounter.ts:2` 注释："原版（Counter.as L200-240 EF）…每 25fps 帧"；`:97` 代码 `this.acc += dt * 25;`
- `web/src/core/Sound.ts:56` 注释："Original +.01/-.02 per 25fps frame"
- `web/src/game/Battle.ts` 多处 `/25`，例如 `:2050` `(HIT_FRAMES[7]-1)/25`

**时间初值**：`GameData.Time` 初值 `2509568400`（`web/src/game/World.ts:2683`），**与原版 `GameData.as:470` `public var Time:* = 2509568400;` 同值**。原版 `GameData.as:727` 有 `globalCounter = Time % 86400 - 54000;`，即一游戏日为 86400 游戏秒。

> 🔴 **矛盾留档（历史结论已被推翻，不要再引用旧口径）**
> - `web/README.md:498`（第 78 轮第 8 条）原文：「时间流速确认（**1 真实秒=360 游戏秒**，与原版 4 分钟/日一致，无需改）」—— **这是旧口径，已被现行代码推翻。**
> - `web/README.md:74`（第 36 轮）实测：「4x 每 15 秒一周期」—— 也属于旧口径（`21600 / (360 × 4) = 15 s` ✓ 恰好对得上 360）。
> - `web/src/game/MapMode.ts:713` 注释仍写「周期系统（每 360 游戏秒…）」—— **过时注释**，量纲以 `:686` 的 `6000` 为准。
> - **裁决**：以代码 `dt * 6000` 为准。旧文档里的 360 是错误口径，差 **16.67 倍**。

### 3.2 周期系统：城镇 43200，人物/运输 21600

原版用 `cycleCounter` 累积（每帧 `+ gameSpeed * 4` 单位），阈值分两档：

| 原版位置 | 累积语句 | 阈值 |
| --- | --- | --- |
| `MapMode.as:4792` / `:4795` / `:4797` / `:6034` | `GD.Towns[i].cycleCounter += GD.gameSpeed * 4;` | **720**（`-= 720` 回绕） |
| `MapMode.as:3559` / `:3560` / `:3843` | `GD.Caravans[i].cycleCounter += GD.gameSpeed * 4;` | **360** |
| `MapMode.as:3850` / `:3851` | People `cycleCounter += GD.gameSpeed * 4;` | **360** |
| `MapMode.as:4195` / `:4196` | Transport `cycleCounter += GD.gameSpeed * 4;` | **360** |

因为每帧 240 游戏秒对应 4 单位，所以 **1 单位 = 60 游戏秒**（`World.ts:3789` 注释亦明确写了这句）。于是：

| 系统 | 单位阈值 | 换算游戏秒 | 换算游戏时间 | 代码位置 |
| --- | --- | --- | --- | --- |
| **城镇经济** | 720 | **43200** | **12 游戏小时** | `web/src/game/World.ts:3793` `while (this.townCycleAcc >= 43200)` |
| **玩家人物消耗** | 360 | **21600** | **6 游戏小时** | `web/src/game/World.ts:3929` `while (this.peopleCycleAcc >= 21600)` |
| **运输 / 动物** | 360 | **21600** | **6 游戏小时** | `web/src/game/World.ts:4150` `while (this.transportCycleAcc >= 21600)` |
| **遭遇检测** | — | **每帧概率尝试** | — | `web/src/game/MapMode.ts:718` 注释"不再按 21600 游戏秒批次累积"，对齐原版 `MapMode.as` L6079-6110 |

> 🔴 **易错点**：说明书旧版写"遭遇、城镇经济、人物消耗、动物周期、车辆维护**统一用 21600**"——**错**。城镇经济是 **43200**（12 小时），其余是 21600（6 小时）。遭遇已改为**每帧概率**，不再是批次累积。
>
> **改任何 `while (xxxAcc >= N)` 之前，先确认 N 的单位是"游戏秒"并核对上表。**

### 3.3 坐标与像素：dpr × scale 双重缩放

**逻辑分辨率固定 880 × 495**（原版 stage 尺寸）。所有游戏内坐标、UI 布局、点击命中都在这个坐标系里。

**画布后备存储 = 逻辑 × 窗口缩放 × dpr**：

```ts
scale = Math.min(window.innerWidth / 880, window.innerHeight / 495);
dpr   = Math.min(window.devicePixelRatio || 1, 2);   // 上限 2，防 4K 屏爆内存
canvas.width  = Math.floor(880 * scale * dpr);
canvas.height = Math.floor(495 * scale * dpr);
ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
ctx.imageSmoothingEnabled = true;
```

**对测试探针的硬性要求**：从 canvas 取像素时必须做 `logical × scale × dpr` 换算。
例：窗口 1280×720 时 `scale = min(1280/880, 720/495) = min(1.4545, 1.4545) = 1.4545`，若 `dpr = 1`，则后备存储宽 = `floor(880 × 1.4545) = 1280`。按逻辑坐标直接采样会采到错误区域。

**世界坐标 ↔ 方格**：`GameData.squareSize = 500`（`web/src/game/World.ts:2682`），`Caravan.squareX/squareY` 由 `x/y` 除以 500 得到。

**移动速度映射**：`px/s = speed / 12 × 4 × 25`（`/12` 是原版速度单位换算，`×4` 是每帧推进量，`×25` 是 fps）。

---

## 4. 数据管线（反编译 → JSON → 运行时）

### 4.1 反编译产物

原版 SWF 用 **JPEXS FFDEC 26.2.1** 反编译，产物落在 `decompiled/`：

```
decompiled/
  all/                    本体：scripts/**.as(1275) + images(816) + sounds(96)
                          + fonts/ frames/ images/ morphshapes/ movies/
                            shapes/ sprites/ symbolClass/ texts/
  AdvancedWeaponry/       DLC 反编译
  IndustrialMagnate/
  SpecialStory/
  WelcomeToGamesOfHonor/
```

> ⚠️ **仓库内没有 `.swf` 本体**（复核：`find . -name "*.swf" | wc -l` → 0）。原版素材只以反编译产物形式存在。
> ⚠️ 反编译产物里的素材有 `116_` 前缀与 `.png.png` 双后缀等噪声，由 `gen_manifest.mjs` 在生成清单时剥离。

**原版代码是本体兼容行为的规格依据**：还原设施纹理、按钮合成、进镇坐标等行为时，核对 `decompiled/all/scripts/IsoEngine/*.as`。Revival 新功能以用户确认的设计为依据，原版仅用于理解继承行为与兼容边界。

### 4.2 转换脚本与产物

| 脚本（根级 `scripts/`） | 作用 | 产物 |
| --- | --- | --- |
| `convert_data.mjs` | AS3 字面量/赋值语句 → JSON（自带 AS3 解析器） | `web/public/data/{texts,dialogues,presets,namePhonetics,mainStory}.json` |
| `gen_manifest.mjs` | 扫描素材目录生成"资源名 → 文件路径"索引 | `web/public/assets/manifest.json` |
| `extract_quests.cjs` | 从 GameData.as 抽取指定函数的源码片段 | 任务数据（供 `questData.ts`） |
| `extract_events.cjs` | 同上 | 事件数据（供 `eventData.ts`） |

**数据产物一览**（`web/public/data`，共 9.8 MB）：

| 文件 | 大小（字节） | 内容 |
| --- | --- | --- |
| `texts.json` | 8,271,804（8.3 MB） | 6424 条文本 × 46 语言 |
| `battle_doll.json` | 934,396 | 战斗人物骨骼/部件数据 |
| `dialogues.json` | 613,116 | 1919 条对话 / 3014 条回复 |
| `presets.json` | 195,848 | **83 个城镇预设** + 物品 + 阵营关系等 |
| `namePhonetics.json` | 33,472 | 随机人名生成器语料 |
| `obstacles.json` | 32,624 | 战斗障碍 |
| `items.json` | 26,899 | 物品 5 大类 229 件 |
| `weapons.json` | 21,970 | 武器/弹药/配件 |
| `industries.json` | 10,016 | 46 类产业 |
| `transports.json` | 8,149 | 运输单位 |
| `items_full.json` | 7,335 | 物品扩展 |
| `gamedata.json` | 5,621 | 全局参数 |
| `mainStory.json` | 548 | 主线 |

**资源清单**（`web/public/assets/manifest.json`）：`images` **910** 项、`sounds` **96** 项、`fonts` **3** 项，另含 `generatedAt` 时间戳。

### 4.3 ⚠️ 已知路径漂移（重跑脚本前必读）

根级转换脚本仍指向**早期目录布局**：

| 文件:行 | 写死的路径 | 实际位置 |
| --- | --- | --- |
| `scripts/convert_data.mjs:10` | `join(root,"decompiled","script","scripts","Data")` | `decompiled/all/scripts/Data` |
| `scripts/convert_data.mjs:316/324/330/338/346` | 同为 `decompiled/script/...` | 同上 |
| `scripts/extract_quests.cjs:2` | `fs.readFileSync("decompiled/script/scripts/IsoEngine/GameData.as")` | `decompiled/all/scripts/IsoEngine/GameData.as` |
| `scripts/extract_events.cjs:2` | 同上 | 同上 |

**结论**：JSON 产物已入库，日常开发**不需要重跑**这些脚本。真要重跑，先把上述路径常量里的 `decompiled/script` 改成 `decompiled/all`，否则会 ENOENT。

### 4.4 城镇槽位：83 与 85 都是对的（机制说明）

这是本工程**最容易被误判为 bug 的地方**，必须讲清机制。

**机制**：城镇槽位来自 `ds.presets.town_presets[0]`，而 Mod 的**数据补丁**可以往里"扩槽"（对象键 = 槽位下标，递归合并时新键即新增元素）。

| 来源 | 槽位贡献 | 内容 |
| --- | --- | --- |
| `web/public/data/presets.json` | **0–82（共 83 槽）** | 基础数据：`storyOnly` 9 个、非 `storyOnly` 74 个、**无空槽** |
| `web/public/mods/special-story/data/presets.json` | 补 **槽位 83** | `{name:7007, x:-9136, y:-1475, storyOnly:true, population:0, defaultStorage:300, ...}` |
| `web/public/mods/welcome-to-games-of-honor/data/presets.json` | 补 **槽位 84** | `{name:7066, x:-16200, y:3120, storyOnly:true, population:0, defaultStorage:50, ...}` |
| `web/public/mods/advanced-weaponry/data/presets.json` | **不扩槽** | 只补槽位 53 的 `locations.10.assortment`（军火铺货品） |

**因此**：
- 只加载基础数据 → `town_presets[0].length = 83` → `gd.Towns.length = 83`
- 加载全部 5 个内置 DLC（默认情形） → `town_presets[0].length = 85` → `gd.Towns.length = 85`

**两个数字都对，取决于是否计入 DLC 槽位。** 冒烟测试已改为**自动判定**（`web/scripts/smoke_test.mjs:476`：`const expectTowns = EXPECT_TOWNS || autoTowns || 83;`，`:477` 的 `expectSrc` 会显示"数据源槽位自动判定"），所以不必手工改期望值。

**建镇代码**（`web/src/game/World.ts`）：

```ts
:3195  const tp = ds.presets.town_presets?.[0] ?? [];
:3197-3200  for (let i = 0; i < tp.length; i++) { ...; this.Towns[i] = t; }
:3206  if (preset.storyOnly) t.active = false;        // 非 storyMode 时
:3207  if (!tp[i]) { t.active = false; continue; }    // 空槽位
:3208  if (i === 34 || i === 68) t.active = false;    // 原版硬编码的两座不可达城镇
```

另有 `for (const addition of ds.gamedata.modTownAssortments ?? [])` 应用 DLC 商品铺货。

### 4.5 文本与语言：`getText` 回退链

`web/src/core/DataStore.ts` 的 `getText(ds, id, language?, gender = 1)` 完整逻辑（**顺序即优先级**）：

1. 取 `ds.texts[String(id)][lang]`；若为空进入回退。
2. **语言回退映射**：`{3:4, 4:3, 6:7, 7:6, 15:32, 18:19, 19:18, 30:19, 32:15, 42:3, 43:3}`（如简体中文 18 缺失时退繁体 19）。
3. 再退 `arr[1]`（英文）。
4. **性别变体解析**：正则 `/<([^<>/]*)\/([^<>]*)>/g`，`gender == 2` 取后半。同时支持 `<男/女>` 与 `<young man/young lady>`。
5. `@nl@` → 换行。

**语言索引**（`languageIndex(name)`，对齐原版 `Texts.language`）：

| 索引 | 语言 | 索引 | 语言 |
| --- | --- | --- | --- |
| `1` | English | `18` | **简体中文（本项目默认）** |
| `3` | Español | `19` | 繁體中文 |
| `4` | (3 的回退对) | `20` | 한국어 |
| `5` | Français | `30` | 日本語 |
| `6`/`7` | (互退对) | `32` | (退 15) |
| `8` | Deutsch | `42`/`43` | (退 3) |
| `14` | Русский | | |

名称映射：`{en:1, zh:18, zhHans:18, zhHant:19, ko:20, ja:30, es:3, de:8, ru:14, fr:5}`。

**数据加载**：`loadDataStore(language = 1, runtime?)` 用 `Promise.all` 载入 **13 份 JSON**（`assets/manifest.json` + `data/` 下 12 份：texts、dialogues、presets、namePhonetics、mainStory、gamedata、items、weapons、industries、transports、obstacles、battle_doll）；`texts` 实际取 `textsWrap._texts`；最后 `runtime.applyTo(base)` 应用 Mod 补丁。

### 4.6 AS3 回调：`__as3fn` 与 `transpileAs3Fn` 转译器

**数据侧**：原版数据里嵌了大量 AS3 函数表达式。`convert_data.mjs` 把它们原样保留为占位对象：

```json
{ "__as3fn": "<原始 AS3 源码字符串>" }
```

出现在 `web/public/data/dialogues.json` 的 `responses[].conditions` 与 `responses[].actions`。
**全库共 1984 个**（复核：`grep -o "__as3fn" web/public/data/dialogues.json | wc -l`）。

> ⚠️ **键名是 `__as3fn`：两个前导下划线、无尾随下划线。** 不是 `__as3fn__`。旧文档、`web/README.md`、`scripts/convert_data.mjs` 里出现过 `__as3fn__` 的额外尾随下划线写法，那是**笔误**；数据与运行时代码统一用 `__as3fn`（见 `web/src/game/DialogueScreen.ts:168` `if (!cond || !cond.__as3fn) return true;`，`:321-322` `if (r.actions && r.actions.__as3fn)`）。

**运行时侧**：`web/src/game/Story.ts:12`

```ts
export function transpileAs3Fn(as3: string, extraParams: string[] = []): (env: any, ...args: any[]) => any
```

**设计目标**：把 AS3 函数源码在运行时转成 JS 函数，用 `with(env)` 模拟 AS3 的 `with` 作用域语义。头注释（`Story.ts:11`）原文：

> `规则：去头部/参数/env 赋值/arguments.callee；var 类型标注剥离；用 with(env) 模拟 AS3 with 语义`

**实现步骤（按源码顺序）**：

| # | 处理 | 细节 |
| --- | --- | --- |
| 1 | **修 FFDEC 错位的 early-return 守卫** | 正则匹配 `var (_loc\d+_):Boolean = false; var _loc\d+_:*; } return \1; }` → 替换为 `return false; }`。注释记录**共修 32 处**（反编译器把守卫块的括号放错了位置） |
| 2 | 去函数头 | `s.replace(/^\s*function\s*\([^)]*\)\s*:\*\s*/i, "")` |
| 3 | 去 env 赋值 | 删除 `var env:* = param1;` |
| 4 | 去 `arguments.callee` | 删除 `return arguments.callee;` |
| 5 | 剥离 var 类型标注 | AS3 的 `:Type` 语法在 JS 非法 |
| 6 | 大括号配平 | 补/删多余括号，保证能编译 |
| 7 | 构造 | `new Function("env", ...extraParams, "with (env || {}) { " + s + " }")` |

**失败不抛出**（关键容错设计）：`catch` 里 `console.warn("dialogue callback error:", e)`，并写入

```ts
globalThis.__lastTranspileError = String(e) + " ||| src: " + s.slice(0, 300)
```

然后**返回 `undefined`**。也就是说：单个回调转译失败不会崩游戏，但会静默跳过——**排查对话异常时第一件事是看 `globalThis.__lastTranspileError`**。

**调用方**：

| 位置 | 用途 |
| --- | --- |
| `web/src/game/Story.ts:185-190` | `ACCEPT_QUEST_BODY` / `COMPLETE_QUEST_BODY` / `FAIL_QUEST_BODY` / `MAJOR_EVENT_BODY` |
| `web/src/game/Story.ts:311` | `ORIGINAL_DLC_HOOKS` |
| `web/src/game/DialogueScreen.ts:170` | `conditions`（判断选项是否可见） |
| `web/src/game/DialogueScreen.ts:322` | `actions`（执行选项效果） |

**相关测试**：

- `web/scripts/dialogue_transpile_smoke.mjs` —— 对**全部 1440 个 actions + 544 个 conditions** 跑一遍转译管线，确保零失败。
- `web/scripts/dialogue_conditions_regression.mjs:21-31` —— 条件求值回归。

### 4.7 Story 与对话环境（`makeDialogueEnv`）

`web/src/game/Story.ts` 的 `export class Story` 字段：`flags`、`specificReputations`、`currentRelationships`、`factionRelations`（**三角矩阵，第 i 行恰有 i 个元素**）、`acceptedQuests`、`completedQuests`、`failedQuests`、`questLog`、`characterRelations`、`dialogueDefaults`。

**构造时的初始化**：从 `ds.mainStory.defaultDefaults` 初始化 flags，补 `flag1..flag60 = false`，`specificReputations[0..9] = 0`，`factionRelations` **深拷贝** presets。

> 深拷贝的原因（代码注释写明）：原版 `GameData.as:801` 是**引用赋值**，会原地修改共享数据；web 端进程长驻、可开多局，必须深拷贝以防跨局污染。

`export function makeDialogueEnv(gd, ds, storyIn?)` 返回 `with(env)` 使用的自由变量白名单。**用 `Proxy` 包 `story`**：

- `get`：`acceptedQuests` 若不是数组则重置为 `[]`；未知属性回退到 `story.flags[k]`。
- `set`：非核心字段一律写进 `flags`（**保证可存档** —— 任何对话脚本新写的变量都会被 flags 捕获并进存档）。

`env` 暴露的符号：`Story`、`GD`、`GameData`、`Texts.fetch(id)`（→ `ds.texts[String(id)][1]`）、`Presets`（`Story.ts:243`：`env.Presets = { ...ds.presets, Towns: ds.presets.Towns ?? ds.presets.town_presets?.[0] ?? [] }`）。

---

## 5. 玩法系统现状

**状态口径**：下表“已实现”仅表示已有实现入口，不等于完整还原或当前回归全通过；“部分对齐”表示仍有明确差异。最近一次测试结果见 `web/TEAM-REGRESSION-REPORT.md` 的时间戳与覆盖范围，专项证据见对应验收记录。§12 的待办继续有效；Revival 后续新功能需单独记录实现与验收状态。

| 系统 | 主要文件 | 状态 |
| --- | --- | --- |
| 语言选择 / 标题 / 制作人员 | `Shell.ts` | 已实现；默认语言回退为简体中文（索引 18） |
| 角色创建（14 部件肖像、属性、色板、随机名） | `CharacterSetupScreen.ts`、`Portrait.ts`、`CreationColors.ts` | 已实现；以原版对齐为目标，验收范围见专项记录 |
| 大地图（相机、城镇符号、点击移动、速度 1/2/3/暂停、风向标） | `MapMode.ts`、`World.ts` | 已实现；最近验证结果见回归/专项记录 |
| 世界时间与经济周期（工资、税收、GDP、库存、价格曲线） | `World.ts`、`TownEconomy.ts`、`Economy.ts` | 部分对齐：周期粒度见 §3.2；消费分配、增长与定价待办见 §12.2 |
| 城镇（贴图、设施标记、7 按钮、产业、雇用、统计、医疗） | `TownMode.ts`、`HealingFacility.ts`、`ConsProdGraph.ts` | 已实现；最近验证结果见回归/专项记录 |
| 贸易（12 类筛选、多数量积分定价、载重/液体容量约束） | `TradeWindow.ts` | 已实现；最近验证结果见回归/专项记录 |
| 队伍管理（概观/人员/货物/装备/配给/日志/导航等 11 页签） | `CaravanMenu.ts`、`PeopleGrid.ts`、`ItemIcon.ts` | 已实现；最近验证结果见回归/专项记录 |
| 运输与动物（性别/年龄/体重/孕期/产奶/繁殖/老死、载客容量） | `World.ts`、`transports.json` | 已实现；最近验证结果见回归/专项记录 |
| 人物消耗与配给（GDA 卡路里、饮水、饥饿口渴、体重、士气、经验） | `World.ts`、`CaravanMenu.ts` | 已实现；最近验证结果见回归/专项记录 |
| 伤口 / 用药 / 医生 / 兽医 / 经验分配 | `World.ts`、Character 技能 getter | 已实现；最近验证结果见回归/专项记录 |
| 采集与狩猎（区域枯竭度、概率表） | `World.ts` | 已实现；最近验证结果见回归/专项记录 |
| 车辆维护 / 电池充电 / 电力网 / 设备 inUse / 液体容器 | `World.ts`、`LiquidStorage.ts` | 已实现；最近验证结果见回归/专项记录 |
| 战斗（部署、视野、骨骼动画、流血、急救、障碍、战利品） | `Battle*.ts`（16 个）+ `battleStoryData.ts` | 已实现；最近验证结果见回归/专项记录 |
| NPC 车队 AI、路线、遭遇菜单、敌对伏击、阵营关系 | `NpcWorldAI.ts`、`CaravanEncounterMenu.ts`、`factionRelations.ts` | 已实现；最近验证结果见回归/专项记录 |
| 剧情 / 事件 / 任务 / 对话条件 | `Story.ts`、`DialogueScreen.ts`、`eventData.ts`、`questData.ts` | 已实现；最近验证结果见回归/专项记录 |
| 四个原版付费 DLC | `originalDlcHooks.ts`、`DlcDialogue.ts` | 已实现；最近验证结果见回归/专项记录 |

---

## 6. 存档系统

两条互不冲突的路线：**A. 自有存档（主用，localStorage）** 与 **B. 原版 .sol 导入导出**。

### 6.1 自有存档

`web/src/game/SaveSystem.ts` 的关键导出：

| 行号 | 符号 | 说明 |
| --- | --- | --- |
| `:9` | `export interface SaveData` | 存档数据结构（见下） |
| `:147` | `export const SAVE_SLOTS = 6` | **6 个槽位** |
| `:149` | `makeSave(gd): SaveData` | 世界 → 存档（唯一写入口） |
| `:308` | `applySave(gd, s)` | 存档 → 世界（唯一读入口） |
| `:602` | `export class SaveSlots` | 槽位管理：`list` / `nextManualSlot` / `save` / `saveAutomatic` / `load` / `importSave` / `deleteSlot` / `count` |

**`SaveData` 结构（`version: 1`）**：

| 字段 | 内容 |
| --- | --- |
| `version` | `1` |
| `mods?` | `[{id, version}]` —— **DLC 身份锁**（读档时校验 DLC 集合） |
| `name` / `day` / `time` | 存档名、游戏日、游戏内时间 |
| `storyMode` / `difficulty` / `gameSpeed` | 模式、难度、速度 |
| `showTutorial?` / `displayedTutorials?` | 教学开关与已显示记录 |
| `navigation?` / `producedToday?` / `knownPrices?` / `transportAsPassengers?` | 导航标记、当日产量、已知价格、运输是否按乘客计 |
| `settings?` | `Partial<Pick<GameData, ...>>` —— 世界设置快照 |
| `caravan` | `{x, y, direction, moving, money, cargo:[{item,amount}], cargoIncludesLiquids?, liquidContainerAssignments?, historicalData?, liquidsContainers?, people: Array<Record<string,any>>, transports?, groupSettings?, groupSettingsAll?, collectForage?, hunt?, milk?, shear?, zoneForageDevastation?, zonePreyDevastation?, autoFillLubricant?, autoFillWater?, chargingBatteries?, inUse?, averagePrice?, slavers?}` |
| `story?` | `{flags, specificReputations, currentRelationships, factionRelations: number[][], acceptedQuests, completedQuests?, failedQuests?, questLog, ...}` |

**存储介质**：`SaveStore` 的 `SharedObjectLike("savedData", { saves: [] })` → localStorage。
实际结构：`savedData.data.saves = [{ name, date, data: SaveData }]`。

**标题页 Load Game、`S` 键、自动存档**共用同一套槽位。测试钩子 `window.__c2SaveSystem`。

> ⚠️ **改动 `makeSave` / `applySave` 必须两端同步**，并跑 `web/scripts/save_creation_regression.mjs` 与 `autosave_gameover_regression.mjs`。

### 6.2 原版 .sol 导入 / 导出

| 方向 | 实现 | 细节 |
| --- | --- | --- |
| **导入** | `web/src/core/SolImporter.ts`（700 行） | `LoadSaveDialogue` 的 **IMP .SOL** 按钮 → TCSO 头解析 → AMF0 解码器（含 AMF3 最小支持）→ zlib 解压（`DecompressionStream`）→ 映射为本项目 `SaveData` |
| **导出** | `web/src/core/SolExporter.ts` | `buildSolFile` / `buildSolFileCompressed` → `saveDataToOriginal` → `downloadBlob` |

**已覆盖的映射**：时间 / 难度 / 模式、`Caravans[0]`（坐标、金钱、cargo、`People[HP]`、`Transport[health]`）、`Towns` 快照、`Story` 字段、阵营声誉、任务。

> ⚠️ 历史 bug：原版 .sol 的文件名长度字段是**字节数**，曾误按 ×2 偏移解析，已修。改这段代码时留意字符串编码。

---

## 7. Mod / DLC 运行时

源码：`web/src/core/ModRuntime.ts`。文档：`web/MODDING.md`、`web/public/mods/README.md`。

### 7.1 发现与加载

- 启动读 `public/mods/index.json`（内容就是 manifest 路径数组）。
- `npm run dev` 下由 Vite 插件 `web/scripts/mod-discovery.mjs` **自动发现** `public/mods/<名>/manifest.json`；构建时生成 `dist/mods/index.json`。
- **纯静态托管时，新增 Mod 必须重新构建**才能进 `dist/mods/index.json`。
- 清单字段：`id`（必填）、`version`（必填）、`priority`、`dependencies`、`data`（数据补丁）、`assets`（资源覆盖）、`entry`（脚本入口）。
- **依赖**：`dependencies` 为 ID 数组或 `ID → 版本说明` 对象；**缺失依赖与循环依赖一律拒绝加载**。

### 7.2 `ModRuntime` 类结构

| 行号 | 成员 | 说明 |
| --- | --- | --- |
| `:40` | `export class EventBus` | `on` / `emit` / `clear`；`emit` 内部用 `Promise.resolve(fn(payload)).catch(...)` 包错，**一个监听器抛错不会打断其它监听器** |
| `:48` | `export class ModRuntime` | 字段：`events: EventBus`、`rules: Map`、`services: Map`、`mods: ModRecord[]` |
| `:145` / `:149` | `applyTo()` 内 | `emit("data:ready")` |
| `:151` | `resolveAsset(name, fallback)` | 资源覆盖解析 |
| `:152` | `registerRule<T>(name, rule): T` | 注册规则 |
| `:153` | `rule<T>(name, fallback)` | 读取规则 |
| `:154` | `registerService<T>(name, service)` | 注册服务（**factory 替换的入口**） |
| `:155` | `service<T>(name, fallback?)` | 读取服务 |
| `:156` | `activeModList()` | 当前启用的 Mod 列表 |
| `:157` / `:158` / `:159` | `has(id)` / `enable(id)` / `disable(id)` | 启用状态管理 |
| `:160` | `api(mod)` | 给 Mod 的 API 对象 |
| `:167` / `:168` | `disabledIds()` / `persistDisabled()` | 禁用列表持久化到 `localStorage["c2:disabledMods"]` |

### 7.3 事件（实测发射点）

| 事件 | 发射位置 |
| --- | --- |
| `game:boot` | `web/src/main.ts:60` |
| `shell:ready` | `web/src/game/Shell.ts:95` |
| `game:new` | `web/src/game/Shell.ts:565` |
| `game:save` | `web/src/game/Shell.ts:791` |
| `game:load` | `web/src/game/Shell.ts:820` |
| `world:construct` | `web/src/game/World.ts:3178` |
| `world:mode` | `web/src/game/World.ts:3264` |
| `battle:construct` | `web/src/game/Battle.ts:298` |
| `battle:end` | `web/src/game/Battle.ts:3346` |
| `data:ready` | `web/src/core/ModRuntime.ts:145` / `:149` |

### 7.4 扩展点（三类）

1. **服务替换**：`factory.gameData` / `factory.mapMode` / `factory.townMode` / `factory.battle`（见 §2.6）。
2. **规则挂钩**：`api.registerRule("economy.price", fn)`。
   > ⚠️ **目前唯一已接线的规则键是 `economy.price`**，消费点在 `web/src/game/Economy.ts:108`：
   > `const custom = ds.runtime?.rules.get("economy.price") as ((ctx:any)=>number)|undefined;`
   > 其它规则名注册了也**不会生效**——需要先在对应模块里加消费点。
3. **事件监听**：上表 10 个事件。

**控制台 API**：`window.__c2ModApi.list()` / `enable(id)` / `disable(id)` / `load()` / `installFile(file)`。启用状态存 localStorage，**切换后需重新载入页面**。

**脚本安全阀**：脚本 Mod 只有显式打开 `?allowModScripts=1` 或 `localStorage["c2:allowModScripts"]="1"` 才执行（`web/src/main.ts`）。

**`.c2mod` ZIP 不会被假装安装**：`installFile` 只接受顶层含 manifest 的 JSON 开发包；ZIP 会明确提示先解包到 `public/mods`。

### 7.5 随工程发布的 5 个 DLC

| id | version | 备注 | `data` 补丁键 |
| --- | --- | --- | --- |
| `advanced-weaponry` | 1.0.0 | | `battleDoll, weapons, items, gamedata, presets, texts, manifest` |
| `industrial-magnate` | 1.0.0 | | `gamedata, texts` |
| `revival` | 1.1.0 | `priority: -100`，**代码 DLC** | `battleSkeleton` |
| `special-story` | 1.0.0 | 扩城镇槽位 83 | `gamedata, presets, mainStory, texts, dialogues, manifest` |
| `welcome-to-games-of-honor` | 1.0.0 | 扩城镇槽位 84 | `gamedata, battleDoll, items, weapons, presets, texts, dialogues, manifest` |

数据文件位置约定：`<mod>/data/<name>.json`（注意是 **`data/` 子目录**，不是模块根目录——早期文档里写错过）。

**`revival` 是"代码 DLC"**：源码入口 `web/public/mods/revival/runtime/index.ts`，由 Vite 插件 `web/scripts/bundled-mod-runtime.mjs(["revival"])` 编译成**独立 chunk**（输出 `mods/revival/runtime/*.js`），通过 `factory.battle` 替换战斗实现；禁用时零加载。

**Revival 的后续定位是原创功能扩展载体，不限于当前战斗动画实现。** 新玩法、界面、规则、数据与素材优先归入 DLC；复用本体的引擎、世界和存档服务。现有 `factory.battle` 只是当前接入点，新增系统可按需补充通用服务、事件或规则消费点，不能假定注册任意规则名就会生效（见 §7.4）。

开发 Revival 新功能时遵循以下边界：

1. **规格**：以用户确认的需求为准，可有意改变原版玩法、数值或表现；记录差异、启用条件和验收场景。未被设计修改的继承行为继续保持兼容。
2. **归属**：DLC 专用逻辑、数据、素材与专用验证放在 `web/public/mods/revival/`；本体只按需要增加可复用接口或兼容修复，避免复制共享服务。
3. **开关**：分别验证启用和禁用并重新加载后的行为；禁用时不运行 DLC 专用逻辑、不加载专用资源。旧存档或缺少 DLC 数据时的回退/拒绝加载策略须明确。
4. **验收**：新功能按设计场景验证；原版兼容路径继续做原版对照。若某片段有意改变动画或视觉，不要求该片段逐像素等同原版，但需验证事件时点、状态与交互正确。
5. **落地**：当前文档确认开发方向，不宣称尚未指定的新功能已完成。每项功能完成后补充入口、差异、存档影响及验证证据。

> ⚠️ **改 revival 的运行时代码必须重新 `npm run build`**，否则不生效（浏览器不直接执行 `public/` 下的 TS）。

### 7.6 数据补丁语义

- **递归覆盖**；支持指令 `$replace` / `$delete`，数组支持 `$append`。
- 按 `priority` **升序**依次应用；只有**无依赖关系**的 Mod 之间，先后顺序才有意义。
- 对象键的新增即"扩槽"——这正是 §4.4 城镇 83 → 85 的机制。

---

## 8. 测试与质量保障

### 8.1 命令

```bash
cd web
npm run build                     # tsc --noEmit（全量类型检查）+ vite build
npm run smoke                     # 全流程冒烟（默认 http://localhost:5174）
npm run test:battle               # 战斗障碍回归
npm run test:skeleton             # 战斗骨骼/动画（需 Node 22.6+）
npm run generate:battle-animation # 重建动画轨道数据
```

`web/scripts/smoke_test.mjs` 常用参数：

| 参数 | 作用 |
| --- | --- |
| `--headed` | 有头浏览器 |
| `--url` | 指定地址 |
| `--timeout` | 超时 |
| `--shots <dir>` | 关键步骤截图 |
| `--no-teleport` | 不强行移动车队，改为点击最近可见城镇 |
| `--regression` | 追加移动/贸易/背包/战斗 + 像素探针 + 页面错误监听，并**自动写 `web/TEAM-REGRESSION-REPORT.md`** |

**退出码**：`0` = 全部必需步骤通过（WARN / EXPECTED-SKIP 不算失败）· `1` = 有失败 · `2` = 浏览器自动化不可用（降级为 HTTP 检查 + 手工清单）。
浏览器自动探测顺序：**msedge → chrome → playwright 自带 chromium**。

### 8.2 21 个回归脚本（全名 + 跑法）

**跑法：直接 `node scripts/xxx_regression.mjs`，不需要服务器、不需要构建。**（在 `web/` 目录下执行）

| # | 脚本（`web/scripts/`） | 覆盖 |
| --- | --- | --- |
| 1 | `advanced_weaponry_regression.mjs` | 高级武器 DLC 数据 |
| 2 | `autosave_gameover_regression.mjs` | 自动存档 / GameOver |
| 3 | `battle_obstacles_regression.mjs` | 战斗障碍 |
| 4 | `caravan_dialogue_layout_regression.mjs` | 商队菜单对话布局 |
| 5 | `dialogue_conditions_regression.mjs` | 对话条件求值 |
| 6 | `dlc_description_regression.mjs` | DLC 描述文本 |
| 7 | `hire_route_direction_regression.mjs` | 雇用 / 路线方向 |
| 8 | `map_departure_regression.mjs` | 大地图出发 |
| 9 | `mod_discovery_regression.mjs` | Mod 发现 |
| 10 | `npc_world_ai_regression.mjs` | NPC 世界 AI |
| 11 | `original_dlcs_regression.mjs` | 四个原版 DLC 钩子 |
| 12 | `page_text_shift_regression.mjs` | 页面文字位移 |
| 13 | `police_industry_encounter_regression.mjs` | 警察 / 产业遭遇 |
| 14 | `save_creation_regression.mjs` | 存档创建 |
| 15 | `slave_generation_regression.mjs` | 奴隶生成 |
| 16 | `text_shift_regression.mjs` | 文本位移 |
| 17 | `trade_character_info_regression.mjs` | 贸易人物信息 |
| 18 | `trade_max_layout_regression.mjs` | 贸易最大布局 |
| 19 | `trade_state_regression.mjs` | 贸易状态 |
| 20 | `ui_followup_regression.mjs` | UI 后续修复 |
| 21 | `weapon_anchor_regression.mjs` | 武器锚点 |

**内存加载 TS 的标准头部**（19/21 个脚本用这个模式，见 `web/scripts/trade_state_regression.mjs:1-25`）：用 `ts.transpileModule` 把 TS 源码转成 JS，再 `new Function` 执行 —— **所以无需服务器、无需构建**。同时注入 Canvas 测量桩：

```js
globalThis.document = { createElement: () => ({
  getContext: () => ({ measureText: s => ({ width: String(s).length * 8 }) })
}) };
```

### 8.3 QA 内存场景页

`web/qa/` 下每对 `.html` / `.ts` 是一个**独立内存场景**（不读写真实存档）：

| 场景 | 用途 |
| --- | --- |
| `battle-entry` | 战斗进入 |
| `battle-loot` | 战斗战利品 |
| `caravan-menu` | 商队菜单 |
| `economy-graph-food` | 经济曲线（食物） |
| `load-dialogue` | 读档对话 |
| `town-map-menu` | 城镇/地图菜单 |
| `town-trade-dialogue` | 城镇贸易对话 |

另有 `web/public/mods/revival/qa/`。

### 8.4 探针约定（踩过坑，务必遵守）

1. **像素采样必须做 `logical × scale × dpr` 换算**（见 §3.3）。直接按逻辑坐标取样会采到错误区域。
2. **断言要给证据**：坐标、颜色均值、方差、命中节点类型，而不只是"通过"。
3. 本体及未修改的兼容路径以**原版截图 vs 复刻截图 + 像素统计**验收；Revival 有意新增或修改的视觉按确认的设计和场景验收，同时检查未受影响路径的回归。
4. **每轮结束跑**：`tsc` 0 错误 + `build` 成功 + `smoke --regression` 全绿 + 本轮专项探针全绿。
5. `web/scripts` 共 **209 个文件**：21 个回归 + 若干工具（`smoke_test.mjs`、`roundtrip_test.mjs`、`mod-discovery.mjs`、`bundled-mod-runtime.mjs`、`as3-literal-parser.mjs` 等）+ **约 170 个一次性探针**（`t*.mjs`、`*_probe.mjs`，按轮次编号，历史上用于像素级定位）。**一次性探针未清理归档，属已知工程债。**

### 8.5 回归报告的读法

回归报告是**滚动覆盖**的（每次 `smoke --regression` 重写 `web/TEAM-REGRESSION-REPORT.md`），所以：

> **不要在本说明书或任何文档里抄写报告的 PASS/FAIL 数字** —— 抄下来立刻就过期。
> **正确做法**：需要当前状态时直接读 `web/TEAM-REGRESSION-REPORT.md` 文件本身（文件头部有 `generatedAt` 时间戳）。

（历史教训：旧版说明书把 2026-09-13 的 "19 PASS / 3 FAIL" 固化进正文，而该结论早已被后续轮次推翻。）

---

## 9. 构建与分发

- `npm run build` → `web/dist/`（约 91 MB）：`index.html` + `assets/`（含 JS/图片/音效/字体）+ `data/` + `mods/` + `favicon`。
- `web/vite.config.ts` 要点：
  - `base: "./"` —— 相对路径部署（任意子目录可跑）。
  - `server.port: 5173`。
  - `plugins: [modDiscoveryPlugin(), bundledModRuntimePlugin(["revival"])]`。
  - `manualChunks` 分包：
    | chunk | 内容 |
    | --- | --- |
    | `engine` | `src/core/` 全部 |
    | `world` | `World` \| `Economy` \| `Story` \| `SaveSystem` \| `eventData` \| `questData` \| `workshopRecipes` \| `factionRelations` |
    | `battle` | `Battle*` |
    | `mod-<name>` | 每个代码 DLC 一个，输出到 `mods/<name>/runtime/[name]-[hash].js` |
- 分发形态：整个工程目录（含 `web/dist`）拷走 + 启动器；或纯静态托管 `web/dist`。

---

## 10. 改动风险地图（改 X → 必须跑 Y）

> **规则：动左边的东西，右边一列全部要跑绿。** 这是本项目最容易出回归的对应关系。

| 改动 | 必跑 | 原因 |
| --- | --- | --- |
| `src/core/Display.ts`（混合语义 / alpha / erase） | `smoke --regression` + 全部像素探针 | 影响**所有** UI 的视觉，历史 bug 重灾区 |
| `src/game/Shell.ts` 的 `setScreen()` / 状态字段 | `smoke --regression`（含 S1–S6 全链路） | 字段漏重置 → "二次新游戏卡死"（t81 已修一次） |
| 任何 `while (xxxAcc >= N)` 周期阈值 | 时间相关探针 + `npc_world_ai_regression.mjs` | 量纲错误会让所有周期系统整体快/慢（曾差 60 倍） |
| `dt * 6000` 时间流速 | 全部经济/消耗/运输探针 | 牵一发动全身 |
| `src/game/World.ts` 的 `makeSave` 相关字段 | `save_creation_regression.mjs` + `autosave_gameover_regression.mjs` | 存档两端必须同步 |
| `src/game/SaveSystem.ts` 的 `makeSave` / `applySave` | 同上 + `roundtrip_test.mjs`（.sol 往返） | 漏字段 = 读档丢数据 |
| `src/game/Story.ts` 的 `transpileAs3Fn` | `dialogue_transpile_smoke.mjs`（1440 actions + 544 conditions） | 转译失败会**静默跳过**回调 |
| `src/game/Story.ts` 的 `makeDialogueEnv` / `Story` 初始化 | `dialogue_conditions_regression.mjs` | flags/Proxy 语义影响所有对话 |
| `src/game/TradeWindow.ts` | `trade_state` / `trade_max_layout` / `trade_character_info` 三个回归 | 贸易布局与定价 |
| `src/game/Battle*.ts` | `test:battle` + `test:skeleton` + `battle_obstacles_regression.mjs` | 战斗子系统有 16 个文件互相耦合 |
| `src/core/ModRuntime.ts` / Mod 清单语义 | `mod_discovery_regression.mjs` + `original_dlcs_regression.mjs` | 影响所有 DLC 加载 |
| `web/public/mods/revival/runtime/` | `npm run build` **之后**再跑回归 | 代码 DLC 需重新构建才生效 |
| `web/public/data/*.json` | 对应数据回归（`weapons` / `slave_generation` / `original_dlcs`…） | 数据是运行时的输入 |
| `src/core/DataStore.ts` 的 `getText` 回退链 | `text_shift` / `page_text_shift` 回归 | 影响所有文本显示 |
| 城镇槽位 / `town_presets` | `smoke --regression`（S4a/S4c 自动判定） | 83 vs 85 的机制见 §4.4 |
| 任意 `.ts` 文件 | `npm run build`（内含 `tsc --noEmit`） | 类型不过不产出构建 |

---

## 11. 开发约定

1. **先区分任务范围**：本体兼容修复先核对 `decompiled/all/scripts/IsoEngine/<对应>.as` 的行为规格；Revival 新功能先明确用户需求与验收场景，可实现原版没有的功能。不得用“原版没有”否定已确认的扩展设计；也不得把 DLC 有意差异无条件推广到本体。
2. **一轮一个主题**：每轮完成后在 `web/README.md` 追加 `## 第 N 轮（标题）`，写清：用户反馈 → 考古定论 → 修复 → 验收数据。
3. **验收留档**：团队协作轮次产出 `web/TEAM-ROUND<N>-*-SPEC/ACCEPTANCE.md` 与截图目录。
4. **回归不可跳**：任何 UI/渲染改动都要跑 `smoke --regression` 与相关专项探针；改动 `Display.ts` 混合语义或 `Shell.ts` 切屏逻辑尤其危险（见 §10）。
5. **类型零错误**：`npm run build` 内含 `tsc --noEmit`，`strict: true`，不允许用 `any` 掩盖类型问题。
6. **注释带出处**：涉及原版行为的地方，注释里写 `原版 <文件>.as:<行号>`。这是本项目最有价值的工程习惯——**保持它**。

---

## 12. 已知差异与待办

### 12.1 回归状态（**指向实时文件，不抄数字**）

当前回归结果**永远**看 `web/TEAM-REGRESSION-REPORT.md`（文件头有 `generatedAt` 时间戳）。

此前记录的测试背景（需结合最近一次报告核验）：

- 城镇相关断言已改为**自动判定槽位数量**（`web/scripts/smoke_test.mjs:476`），所以"83 vs 85"不再是失败原因。相关断言在 `:478` / `:480`（S4a/S4c），读取点 `:532` / `:545` 用 `mapMode.townSymbols[i]`。
- **S6「移动进镇」历史上长期 FAIL**（返回 `null`）。若报告里它仍 FAIL，需比对历史失败原因；不能仅凭同名用例曾失败就排除新回归。

### 12.2 经济 / 数值校准 TODO（`web/README.md` 自述）

- `generatePopulationConsumption` 的食物在可选食物间**按价格分配**尚未实现（当前为简化分配）。
- 人口 / GDP 的**动态增长**未模拟。
- 小价格显示精度（`Math.round` 丢 1 位小数）。
- `calculatePriceForItem` 的生产侧定价待与产业系统完全打通。

### 12.3 视觉已知差异

地图地面纹理是原版**视差装饰**，**不与城镇坐标对齐**（公式已对齐原版的负坐标分支，但纹理相位不同）。

### 12.4 工程性 TODO

- 转换脚本输入路径已漂移（见 §4.3），重跑前需改常量。
- `web/scripts` 下约 170 个一次性探针未清理归档。
- `web/README.md` 的轮次记录**不连续**：实为 **53 个 `## 第 N 轮` 标题**，编号范围 **31–91**，**缺 60、65、66、67、72、73、74、75、76 共 9 轮**。
  （复核：`grep -c "^## 第 " web/README.md` → 53。）
- 旧文档中遗留的错误口径需要核验清理：`web/README.md:498`（时间流速 360）、`web/src/game/MapMode.ts:713` 注释（"每 360 游戏秒"）、`scripts/convert_data.mjs` 与 `web/README.md` 里的 `__as3fn__` 额外尾随下划线笔误。

---

## 13. 常见问题排查

| 症状 | 原因 / 处理 |
| --- | --- |
| 双击 exe 报 "Not found: web/dist" | 没构建，或 exe 没和 `web/dist` 放在同一项目根 → `cd web && npm run build` |
| 浏览器打开是空白 / 404 | 端口被别的副本或 vite 占着 → 看托盘提示里的实际端口（5174–5179） |
| 页面黑屏（进游戏后） | 多为异步资源未挂上（历史案例：叙事页背景 ensure 未补挂）。开 F12 看 `pageerror` |
| "大部分按钮不显示" | 显示列表混合语义问题：纹理层叠加导致泛白/纯色。检查是否 `getImage` + `ensure` 双重挂载 |
| 探针采样数值不对 | canvas 后备存储按 `scale × dpr` 放大，取样需换算（§3.3 / §8.4） |
| 改了 Mod 运行时代码没生效 | 代码 DLC 需重新构建：`cd web && npm run build` |
| `convert_data.mjs` 跑不起来 | 输入路径写死为旧布局 `decompiled/script/…` → 改为 `decompiled/all/scripts/…`（§4.3） |
| 卡死 / 世界不动 | 先确认是否模态对话（如碉堡值星官）冻结世界 —— **这是原版预期行为，不是 bug** |
| 对话选项异常 / 条件不生效 | 看 `globalThis.__lastTranspileError`（转译失败是静默的，§4.6） |
| 二次新游戏卡死 | 有状态字段没在 `setScreen()` 里重置（§2.8） |
| 所有周期系统整体快/慢几十倍 | 周期阈值量纲写错（§3.2） |
| 城镇数量断言失败 | 先确认加载了哪些 DLC（83 vs 85，§4.4），再看 `smoke_test.mjs:476` 的自动判定是否被覆盖 |

---

## 14. 术语表：AS3 ↔ TypeScript 对照

| 原版 AS3（`decompiled/all/scripts/IsoEngine/`） | 本项目 TS | 说明 |
| --- | --- | --- |
| `Caravaneer2.as`（文档类） | `src/game/Shell.ts` | 屏幕机 + 全局调度 |
| `GameData.as` | `src/game/World.ts`（**文件即模块**） | 世界状态中枢，非单一类 |
| `MapMode.as` | `src/game/MapMode.ts` | 大地图 |
| `TownMode.as` | `src/game/TownMode.ts` | 城镇 |
| `BattleMode.as` + `BattleField.as` | `src/game/Battle.ts` + 15 个 `Battle*.ts` | 战斗 |
| `CaravanMenu.as` | `src/game/CaravanMenu.ts` | 队伍管理 |
| `TradeWindow.as` | `src/game/TradeWindow.ts` | 贸易 |
| `Sprite` / `MovieClip` / `Shape` | `src/core/Display.ts` 的 `Sprite` / `Graphics` / `BitmapObject` | 迷你显示列表 |
| `blendMode = "layer"` / `"erase"` | `Display.ts` 的层组语义 | Canvas 无直接对应 |
| `EngineText` | `src/core/EngineText.ts` | 逐字符排版 |
| `Counter.as` | `src/core/LcdCounter.ts` | LCD 计数器（25 fps 前提的出处之一） |
| `SharedObject` | `src/core/SaveStore.ts` 的 `SharedObjectLike` | → localStorage |
| `Texts.fetch()` | `src/core/DataStore.ts` 的 `getText()` | 含语言回退链与性别变体 |
| `Loader` / 库资源 | `src/core/Assets.ts` + `manifest.json` | 按名查资源 |
| `enterFrame` 事件 | `src/core/Game.ts` 的 RAF 主循环 + `Scene.update(dt)` | 原版每帧 240 游戏秒 |
| `with (env)` | `transpileAs3Fn` 生成的 `with (env \|\| {})` | 见 §4.6 |
| `.sol` 存档（AMF） | `src/core/SolImporter.ts` / `SolExporter.ts` | TCSO + AMF0/AMF3 + zlib |
| `mapModeTimeMultiplier = 4`（GameData.as:29） | `dt * 6000` 中的 `* 4` 因子 | 见 §3.1 |

---

## 15. 文档地图与事实优先级

### 15.1 事实与规格裁决（按问题类型，不使用一条总排名）

| 要判断的问题 | 依据 | 冲突处理 |
| --- | --- | --- |
| 现在实际怎样运行 | 对应源码、配置与运行观察，包括 Revival 代码 | 修正文档对实现的描述；实现存在不代表设计正确 |
| 本体应如何还原原版 | 原版 AS3、原版资源及可复核的运行证据 | 若实现偏离，按兼容缺陷处理；已确认的适配例外单独记录 |
| Revival 新功能应怎样运行 | 用户当前明确要求及其确认的功能设计 | 原版用于参考和兼容分析，不否定原创功能；历史还原限制不自动约束新设计 |
| 最近验证过什么 | `web/TEAM-REGRESSION-REPORT.md` 与相关专项验收记录 | 看时间戳、测试对象和覆盖范围；旧报告不能证明后续改动通过 |
| 从哪里了解架构和约定 | 本说明书为入口，具体模块查 Mod/DLC 文档；`web/README.md` 作历史参考 | 发现冲突按上面四类核验，更新过时说明，不直接用历史结论覆盖现状 |

> **给大模型的明确指令**：先辨别“已有实现”“本体兼容规格”“Revival 新功能设计”。不要因为当前代码已这样写就认定它符合原版，也不要因为原版不存在某功能就拒绝实现 Revival 扩展。用户当前明确需求优先于文档中的历史方向约束。

### 15.2 文档地图

| 文档 | 位置 | 内容 | 时效性 |
| --- | --- | --- | --- |
| **本说明书** | `项目说明书.md` | 全景架构、量纲、扩展点、风险地图（新成员/新模型从这里开始） | 随代码维护 |
| 开发日志 | `web/README.md`（约 74 KB） | 阶段计划 + 53 个「第 N 轮」记录（编号 31–91，缺 9 轮） | 历史快照，**含过时结论** |
| Mod 运行时架构 | `web/MODDING.md` | 事件 / 服务 / 补丁语义 / 安装包边界 | 较新 |
| Mod 目录约定 | `web/public/mods/README.md` | 目录结构、自发现、清单示例 | 较新 |
| 复兴 DLC 说明 | `web/public/mods/revival/README.md`、`AUTHORING.md` | 代码 DLC 架构、动画制作源、验证方式 | 较新 |
| 回归报告 | `web/TEAM-REGRESSION-REPORT.md` | 冒烟回归**最近一次**快照 | **每次回归重写** |
| 专项笔记 / 验收 | `web/TEAM-*.md` | 装备系统笔记、各轮验收报告 | 历史快照 |

### 15.3 本文档的维护规则

1. **不抄易变数字**：回归 PASS/FAIL 数、测试通过项列表——一律指向实时文件。
2. **新增/修改不变量时，同步更新 §0.1 事实卡、§3、§10**（这三处是强关联的）。
3. **发现代码与本文冲突**：改本文，并在对应小节加一条"🔴 矛盾留档"，写清旧结论、新结论、裁决依据。
4. **行号漂移**：修改被本文引用行号附近的代码后，顺手校正本文的行号；实在对不上时，保证符号名/字符串准确（那是更稳的定位锚点）。

---

*本说明书基于此前工程核查整理，并于 2026-09-20 更新项目方向与文档口径。统计数字与行号需在使用时重新核验；§0.1 提供部分复核命令（其中 Bash 命令需在相应环境执行）。
当前实现、目标规格和验证结果分别按 §15.1 核验；`web/README.md` 的逐轮记录作为历史参考。*

## 2026-09-26 ��Աҳ״̬��λ

��Աҳ�м��ж���������ֵ�����Ϸ��ĺ���״̬���� web/public/mods/revival/runtime/index.ts ά�����ղ�ʹ��װ��ҳͬ���ɫ������˫��߿򣻱��� web/src/game/CaravanMenu.ts δ����������ʽ��
