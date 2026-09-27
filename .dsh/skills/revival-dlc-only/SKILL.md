---
name: revival-dlc-only
description: Caravaneer 2 revival 项目专用规则。所有改动默认只落在复兴 DLC（web/public/mods/revival/），不动本体 web/src；改完必须同步更新两份 README（根 README.md 与 DLC README.md），并提交推送到 GitHub origin/main。当用户提出修改、新增、修复本项目任何功能／数据／素材／UI／文档时使用。
whenToUse: 在 D:\game\Caravaneer 2 revival 仓库里做任何代码、数据、素材、UI 或文档改动时；用户说「改一下」「加个功能」「修个 bug」「更新文档」「传上去」时。
---

# 复兴 DLC 单一落点 + README/GitHub 同步

本仓库的默认工作模式：**改动落在复兴 DLC，改完写文档，文档完推送 GitHub。**
三步全部做完才算一轮结束；缺任何一步都算未完成。

---

## 0. 三条铁律

| # | 规则 | 违反时的后果 |
| --- | --- | --- |
| R1 | 代码／数据／素材改动**默认只写** `web/public/mods/revival/` | 动到本体 = 移植保真度回归，需 §3 例外流程 |
| R2 | 每轮结束必须同步两份 README（§4） | 下一位读者拿不到事实，行号与结论失效 |
| R3 | 每轮结束必须 commit + push 到 `origin/main`（§5） | 改动只存在本机，等于没交付 |

补充硬约束（工程既有约定，别破坏）：

- **R4** 一轮一个主题，别把无关改动混进同一个 commit。
- **R5** `npm run build` 内含 `tsc --noEmit`，`strict: true`；**不允许用 `any` 掩盖类型问题**。
- **R6** 涉及原版行为处，注释必须写 `原版 <文件>.as:<行号>`。
- **R7** 两份 README 必须是 **UTF-8 无 BOM**。历史事故：根 `README.md` 尾部混入过 GBK 字节，导致整个文件读取失败（已修）。**改含中文的文件一律用 `edit`/`write` 工具或 Node，不要用 PowerShell 的 `Set-Content` / `Get-Content -Raw`**（会把 UTF-8 按 GBK 读再写回，整文件 mojibake；本项目已在 `web/scripts/_crew_ui_probe.mjs` 和 DLC README 尾部各踩过一次）。
- **R8** 本机只有 Windows PowerShell 5.1，**没有 `pwsh`**。调用脚本用 `powershell -NoProfile -ExecutionPolicy Bypass -File`。

---

## 1. 落点地图（默认写这里）

根目录前缀：`web/public/mods/revival/`

| 要改什么 | 落在哪 |
| --- | --- |
| DLC 主入口、UI 接线、状态槽、人员页／技能树等大部分功能 | `runtime/index.ts` |
| 战斗子系统 | `runtime/Battle*.ts`（Battle / BattleAnimation / BattleAtlas / BattleBlood / BattleCollision / BattleDoll / BattleFieldView / BattleSkeleton …） |
| 纯数据（骨骼、示例工程、预设） | `data/*.json`（`battle_skeleton.json` 由 `data/battle_skeleton.base.json` + 制作源生成） |
| 图片／图集素材 | `assets/**` |
| 生成与制作工具 | `tools/*.mjs`、`tools/*.py` |
| 浏览器验收页与 QA 文档 | `qa/**`（`*.html` + `*.ts` + `*.md`） |
| 清单：版本号、data/assets 声明、名称 | `manifest.json`（`id` 固定 `revival`，`priority: -100`） |
| 本 DLC 的轮次记录 | `README.md`（§4.1） |

**改了 `assets/**` 或 `data/**` → 必须同步 `manifest.json` 的 `assets` / `data` 声明并升 `version`。** 漏声明 = 运行时拿不到资源。

---

## 2. 默认不改（本体与其他）

- `web/src/**` —— 本体移植代码（`main.ts`、`core/`、`game/`、`scenes/`）
- `web/scripts/**` —— 回归脚本与探针；`scripts/**`（根）—— 数据转换脚本
- `web/public/data/**`、`web/public/assets/**` —— 原版素材与数据（版权原因已 `.gitignore`）
- `decompiled/**` —— 反编译参考（只读）
- `web/dist/**` —— 构建产物（已 `.gitignore`）

DLC 有能力覆盖本体时，**用 DLC 侧覆盖，不要回头改本体**。历史成功案例：人员页状态槽、人员列表底板、技能树，全部只改 `runtime/index.ts`。

---

## 3. 例外：确实必须改本体时

1. **先停下问用户**，一句话说明：要改哪个本体文件、为什么 DLC 侧做不到、影响面。
2. 拿到明确批准（「可以改本体」）后才动手。
3. 两处 README 都要**显式标注**：`本体改动：web/src/game/Xxx.ts（理由 + 影响面 + 对应回归）`。参考历史写法：「仍只改本 DLC，本体只剩 1 处滚动条宽度」。
4. 按 §6 与根 README §10 风险地图，跑对应的本体回归。

---

## 4. 改完必做 A：同步两份 README

### 4.1 `web/public/mods/revival/README.md`（DLC 轮次记录，最新的在最上面）

在标题 `# 复兴 DLC：代码归属与使用说明` 之后、上一轮记录之前，插入：

```markdown
## YYYY-MM-DD（第 N 轮）：一句话标题（仍只改本 DLC）

### 用户需求（原话）
1. 「…」

### 根因
（写清"为什么改了但看不出来"，区分 DLC 侧 / 本体侧）

### 落地（`runtime/index.ts` 等，给 文件:行）
- …

### 验证
- 命令 + 实测结论（像素值 / PASS / 截图路径）

### 踩坑记录（避免重犯）
- …

### 边界
- 没做什么、为什么
```

### 4.2 根 `README.md`（项目说明书，追加在文件末尾）

追加一段短记录，参考现有格式：

```markdown
## YYYY-MM-DD 标题

一句话说清：改了什么、落在哪个文件、验证方式。
```

同时按 §15.3 维护规则处理：

- **不抄易变数字**：回归 PASS/FAIL 数、通过项列表一律指向实时文件（`web/TEAM-REGRESSION-REPORT.md`）。
- 动了**不变量／事实卡** → 同步更新 §0.1、§3、§10（三处强关联）。
- 代码与文档冲突 → 改文档，并加一条「🔴 矛盾留档」：旧结论、新结论、裁决依据。
- 行号漂移 → 顺手校正被引用的行号；对不上就保证符号名／字符串准确。

### 4.3 别漏

- 新增／修改文档文件（如 DLC 的 `AUTHORING.md`、`qa/*.md`）也要在 §15.2 文档地图里体现。
- 写之前先读一遍要改的那一节，别凭记忆写。

---

## 5. 改完必做 B：验证 → 提交 → 推送 GitHub

### 5.1 一键（推荐）

```powershell
cd "D:\game\Caravaneer 2 revival"
powershell -NoProfile -ExecutionPolicy Bypass -File .dsh\skills\revival-dlc-only\scripts\ship.ps1 -Message "复兴DLC：本轮改了什么"
```

（装了 PowerShell 7 的话把 `powershell -NoProfile -ExecutionPolicy Bypass -File` 换成 `pwsh -File` 即可；本机未安装 `pwsh`。）

脚本会：① 检查改动是否越界（只允许 DLC / 两份 README / `.dsh/skills/`）→ ② 检查两份 README 是否都改过、是否 UTF-8 无 BOM → ③ commit → ④ push `origin/main` → ⑤ 校验远端已同步（`origin/main..HEAD` 必须为 0）。

参数：`-DryRun` 只看计划不提交；`-AllowOutOfScope`（仅在本体改动已被用户批准时用）；`-SkipReadmeCheck`（仅纯文档轮次）。

### 5.2 手动等价流程

```powershell
cd "D:\game\Caravaneer 2 revival"
git status --porcelain                 # ① 肉眼确认没有 dist / assets / data / decompiled 混进来
git add -A
git commit -m "复兴DLC：本轮改了什么"
git push origin main
git log origin/main..main --oneline    # ② 空 = 推送成功
```

- 远端：`https://github.com/BInBilibili/caravaneer2-revival.git`，分支 `main`，credential helper `wincred`（已验证可推送）。
- 推送成功后向用户回报 **commit 短哈希 + 改了哪些文件 + 远端同步结论**。

---

## 6. 每轮完成清单（逐条勾，别跳）

- [ ] 改动只落在 `web/public/mods/revival/`（越界已获用户批准并在 README 标注）
- [ ] 改了 assets/data → `manifest.json` 已同步声明 + 升 `version`
- [ ] `cd web; npm run build` 通过（`tsc --noEmit` 零错误）
- [ ] DLC `runtime/**` 改动 → **build 之后**再跑相关回归（代码 DLC 需重新构建才生效）
- [ ] 按根 README §10 风险地图跑了对应回归；`npm run smoke -- --regression` 的结论已确认
- [ ] `web/public/mods/revival/README.md` 已加本轮记录
- [ ] 根 `README.md` 已追加本段（§0.1/§3/§10 需要时同步；冲突加「🔴 矛盾留档」）
- [ ] 两份 README 仍是 UTF-8 无 BOM
- [ ] `git push origin main` 成功，`git log origin/main..main` 为空

---

## 7. 常用命令

```powershell
# 构建（含全量类型检查）
cd web; npm run build

# 冒烟 + 回归（默认 http://localhost:5174，--regression 会写 web/TEAM-REGRESSION-REPORT.md）
npm run smoke -- --regression
npm run test:battle
npm run test:skeleton              # 需 Node 22.6+

# 回归脚本（在 web/ 下直跑，不需服务器、不需构建）
node scripts/xxx_regression.mjs

# DLC 自带工具
node public/mods/revival/tools/battle_skeleton_regression.mjs
```

---

## 8. 边界

- 本 skill **不放宽**本体保真要求：DLC 可以有意差异，但不得把 DLC 的有意差异无条件推广到本体。
- 用户明确说「改本体 / 改 web/src」时，按 §3 执行，不算违反 R1。
- 用户明确说「先别推 GitHub」时，§5 只做到 commit，并在回报里说明尚未推送——**不要静默跳过**。
- 推送失败（网络／凭据）时：不要伪造成功。保留本地 commit，报出确切错误与下一步，等用户处理凭据。
