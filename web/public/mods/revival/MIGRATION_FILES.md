# 复兴拆分：修改文件与用途

日期：2026-09-13。以下为本轮隔离后的文件归属。

## 必要的本体改动

- [src/core/Assets.ts](D:/game/Caravaneer%202%20deepseek/web/src/core/Assets.ts)：通用资源来源查询；识别其他 Mod 对原图的覆盖。
- [src/core/ModRuntime.ts](D:/game/Caravaneer%202%20deepseek/web/src/core/ModRuntime.ts)：内置 DLC 加载与注册、来源核验和加载失败回滚。
- [src/main.ts](D:/game/Caravaneer%202%20deepseek/web/src/main.ts)：向通用 ModRuntime 注入已打包 DLC 入口。
- [src/bundled-mod-runtimes.d.ts](D:/game/Caravaneer%202%20deepseek/web/src/bundled-mod-runtimes.d.ts)：虚拟模块的类型声明。
- [scripts/bundled-mod-runtime.mjs](D:/game/Caravaneer%202%20deepseek/web/scripts/bundled-mod-runtime.mjs)：通用内置 DLC 编译与开发验证入口；不包含动画实现。
- [vite.config.ts](D:/game/Caravaneer%202%20deepseek/web/vite.config.ts)：注册构建插件并将 DLC 运行时输出为独立 chunk。
- [tsconfig.json](D:/game/Caravaneer%202%20deepseek/web/tsconfig.json)：将复兴运行时纳入类型检查。
- [package.json](D:/game/Caravaneer%202%20deepseek/web/package.json)：生成与最小回归命令改为指向 DLC 内工具。
- [public/assets/manifest.json](D:/game/Caravaneer%202%20deepseek/web/public/assets/manifest.json)：移除复兴 72 张紧凑图集的本体注册。

## 按动画方案开始前备份逐文件恢复

未整目录覆盖；以下文件已逐一用 SHA256 与备份核对一致。

- [src/game/Battle.ts](D:/game/Caravaneer%202%20deepseek/web/src/game/Battle.ts)
- [src/game/BattleBlood.ts](D:/game/Caravaneer%202%20deepseek/web/src/game/BattleBlood.ts)
- [src/game/BattleCollision.ts](D:/game/Caravaneer%202%20deepseek/web/src/game/BattleCollision.ts)
- [src/game/BattleDoll.ts](D:/game/Caravaneer%202%20deepseek/web/src/game/BattleDoll.ts)
- [src/game/BattleFieldView.ts](D:/game/Caravaneer%202%20deepseek/web/src/game/BattleFieldView.ts)
- [src/game/BattleFlames.ts](D:/game/Caravaneer%202%20deepseek/web/src/game/BattleFlames.ts)
- [src/game/BattleTransportAnimation.ts](D:/game/Caravaneer%202%20deepseek/web/src/game/BattleTransportAnimation.ts)
- [src/core/DataStore.ts](D:/game/Caravaneer%202%20deepseek/web/src/core/DataStore.ts)

## DLC 运行时

- [public/mods/revival/runtime/Battle.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/Battle.ts)
- [public/mods/revival/runtime/BattleAnimation.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleAnimation.ts)
- [public/mods/revival/runtime/BattleAtlas.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleAtlas.ts)
- [public/mods/revival/runtime/BattleBlood.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleBlood.ts)
- [public/mods/revival/runtime/BattleBloodVisual.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleBloodVisual.ts)
- [public/mods/revival/runtime/BattleCollision.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleCollision.ts)
- [public/mods/revival/runtime/BattleDoll.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleDoll.ts)
- [public/mods/revival/runtime/BattleEffectAnimation.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleEffectAnimation.ts)
- [public/mods/revival/runtime/BattleFieldView.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleFieldView.ts)
- [public/mods/revival/runtime/BattleFlames.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleFlames.ts)
- [public/mods/revival/runtime/BattleProjectileVisual.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleProjectileVisual.ts)
- [public/mods/revival/runtime/BattleSkeleton.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleSkeleton.ts)
- [public/mods/revival/runtime/BattleTransportAnimation.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleTransportAnimation.ts)
- [public/mods/revival/runtime/Data.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/Data.ts)
- [public/mods/revival/runtime/index.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/index.ts)

## DLC 数据、资源、工具及验证页

- [public/mods/revival/manifest.json](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/manifest.json)
- [public/mods/revival/data/battle_skeleton.json](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/data/battle_skeleton.json)
- [public/mods/revival/data/battle_skeleton_legacy.json](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/data/battle_skeleton_legacy.json)
- [public/mods/revival/assets/battle](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/assets/battle)
- [public/mods/revival/tools/generate_legacy_tracks.mjs](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/tools/generate_legacy_tracks.mjs)
- [public/mods/revival/tools/generate_battle_atlas.mjs](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/tools/generate_battle_atlas.mjs)
- [public/mods/revival/tools/battle_skeleton_regression.mjs](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/tools/battle_skeleton_regression.mjs)
- [public/mods/revival/qa/battle-parity.html](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/qa/battle-parity.html)
- [public/mods/revival/qa/battle-parity.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/qa/battle-parity.ts)
- [public/mods/revival/qa/battle-rig.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/qa/battle-rig.ts)
- [public/mods/revival/qa/runtime-switch.html](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/qa/runtime-switch.html)
- [public/mods/revival/qa/runtime-switch.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/qa/runtime-switch.ts)
- [public/mods/revival/description.html](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/description.html)
- [public/mods/revival/description.ZHS.html](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/description.ZHS.html)
- [public/mods/revival/description.ZHT.html](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/description.ZHT.html)
- [public/mods/revival/README.md](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/README.md)

## 旧位置已移除

- 本体 `src/game/` 下新增的 BattleAnimation、BattleAtlas、BattleBloodVisual、BattleEffectAnimation、BattleProjectileVisual、BattleSkeleton 模块已移至 DLC。
- 旧的 `qa/battle-parity.html`、`qa/battle-parity.ts`、`qa/battle-rig.ts` 已移至 DLC。
- 根目录 `BATTLE_DOLL_PORT.md` 已移为 DLC README，历史验收记录保留。
- 生成器、动画专用回归、骨骼数据以及 72 张 BattlePacked 图集已从旧位置移至 DLC。
- Shell.ts 没有新增改动，复用其已有的 factory.battle 接口。

## 后续制作源补充（仅 DLC 内）

- [data/battle_skeleton.base.json](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/data/battle_skeleton.base.json)：从已验收定义提取的原版兼容基线。
- [data/battle_skeleton.authoring.json](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/data/battle_skeleton.authoring.json)：独立手工制作源，默认空覆盖。
- [tools/animation_authoring.mjs](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/tools/animation_authoring.mjs)：骨骼、插槽、附件及视觉轨道合并与校验，保护原版事件。
- [tools/generate_legacy_tracks.mjs](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/tools/generate_legacy_tracks.mjs)：从基线重建、应用制作源、只读校验与无变化产物保护。
- [tools/generate_battle_atlas.mjs](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/tools/generate_battle_atlas.mjs)：避免无变化时重写清单。
- [tools/battle_skeleton_regression.mjs](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/tools/battle_skeleton_regression.mjs)：在已有最小回归中补一组制作流程检查。
- [AUTHORING.md](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/AUTHORING.md)：制作格式、命令、示例与验收边界。
- [README.md](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/README.md)：当前制作支持的说明。


## 后续同帧优化与性能验证（仅 DLC 内）

- [runtime/BattleFieldView.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/runtime/BattleFieldView.ts)：身体／阴影同帧就绪缓存，素材等待和姿态返回时失效。
- [tools/battle_skeleton_regression.mjs](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/tools/battle_skeleton_regression.mjs)：沿用现有一组显示生命周期测试，补同帧、相机／显隐、真实阴影延迟、返回旧姿态及外观／动画定义更换检查。
- [qa/battle-performance.html](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/qa/battle-performance.html) 与 [qa/battle-performance.ts](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/qa/battle-performance.ts)：24 人物固定条件的独立内存动画对比页，不读写存档。
- [qa/PERFORMANCE.md](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/qa/PERFORMANCE.md)：记录实际计时、方法和未验收的性能范围。
- [README.md](D:/game/Caravaneer%202%20deepseek/web/public/mods/revival/README.md) 及本文件：用途和验证边界。

该阶段没有新增本体源码改动。生产构建重新生成 dist，运行时仍独立输出到 mods/revival/runtime。
