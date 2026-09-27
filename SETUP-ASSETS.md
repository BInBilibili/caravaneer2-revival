# 未随仓库分发的目录（原版内容与可再生内容）

本仓库只包含本项目自己的代码与 revival DLC 内容。以下几类**刻意没有入库**，克隆后需要自己补上，否则游戏跑不起来。

| 目录 / 文件 | 大小 | 为什么不在仓库里 | 怎么补 |
| --- | --- | --- | --- |
| `decompiled/` | 83MB | Caravaneer 2 反编译 AS3 源码，版权属原作者，不可再分发 | 自备游戏本体后重新反编译；仅作移植时的对照参考，运行不需要 |
| `web/public/assets/` | 57MB | 原版美术与音频（1085 张 PNG、98 个 MP3） | 从你合法持有的游戏里导出，放回 `web/public/assets/` |
| `web/public/data/` | 9.7MB | 原版导出的数据（`texts.json` 文本、`battle_doll.json` 等） | 同上，放回 `web/public/data/` |
| `web/node_modules/` | 58MB | 依赖，可再生成 | `cd web && npm install`（或 `pnpm install`） |
| `web/dist/` | 99MB | 构建产物，可再生成 | `cd web && npm run build` |

## 恢复完整工作副本

```bash
git clone <this-repo> && cd <this-repo>
cd web && npm install
# 再把自备的 assets/ 与 data/ 放回 web/public/ 下
npm run dev
```

## 说明

- `web/public/mods/revival/`（21MB）是本项目自己的 DLC 内容，**在仓库里**。
- 其余源码（`web/src`、`web/scripts`、`web/qa`、`scripts/`、`Launcher.cs`、`start.bat`/`start.sh`）全部入库。
- 本地开发时这些目录仍在磁盘上，只是被 `.gitignore` 排除了。
