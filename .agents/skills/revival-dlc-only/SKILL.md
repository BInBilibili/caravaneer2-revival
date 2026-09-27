---
name: revival-dlc-only
description: 在 Caravaneer 2 revival 仓库修改功能、数据、素材、UI 或文档时使用。默认在 Revival DLC 内实施，完成后同步两份 README，并将验证过的改动提交推送到 GitHub。仅适用于本仓库。
---

# Revival DLC 项目工作流

本 skill 仅适用于包含本文件的 Caravaneer 2 revival Git 仓库。用户对当前任务的明确要求优先。

1. **确定落点。** 默认只在 `web/public/mods/revival/` 修改功能、数据、素材、UI 和相关测试。可以读取本体 `web/src/` 与 `decompiled/` 作为参考。确有必要修改 DLC 外的文件时，先说明原因和影响；若用户已经明确要求该范围，直接执行。不要把无关的工作区改动纳入本轮提交。
2. **验证改动。** 根据实际改动选择相关构建、测试或手动检查。修改 DLC 的 `runtime/**` 后，先在 `web/` 运行 `npm run build`，再验证构建后的行为。修改 DLC 数据或素材时，检查 `manifest.json` 中的声明与版本。
3. **同步文档。** 每轮完成后更新根目录 `README.md` 与 `web/public/mods/revival/README.md`，准确记录改动位置、结果和验证；涉及 DLC 外修改时注明原因及影响。维护现有文档结构，避免重复旧记录。两份 README 保持 UTF-8 无 BOM；在 Windows PowerShell 5.1 中不要用默认编码的 `Get-Content`/`Set-Content` 往返改写中文文件。
4. **同步 GitHub。** 审查 `git status` 与 diff，只暂存本轮文件，提交到当前分支并推送至 `origin`。可使用仓库已有的 `.dsh/skills/revival-dlc-only/scripts/ship.ps1`；运行前检查其暂存范围，因为脚本使用 `git add -A`。推送后核对远端分支含本次 commit，并向用户报告哈希。用户明确要求暂缓推送时遵从；失败时报告实际错误和本地提交状态，不宣称已同步。

仅修改项目规则或文档的任务，也要更新两份 README。无需为了文档改动运行游戏构建；用适当的文档和脚本检查即可。
