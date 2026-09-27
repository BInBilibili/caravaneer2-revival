# 复兴 DLC 动画方案说明书（ANIMATION_SPEC）

> 面向对象：后续接手修改本 DLC、或为本 DLC 制作新动画的**大模型 / 开发者**。
> 目标：让读者在不重新通读 17 个运行时模块的前提下，能安全地改动画、加动画、验收动画。
> 版本基线：DLC `manifest.json` version 1.2.0，`apiVersion` 1；本文对应仓库 2026-09 状态。
> 配套文档：`AUTHORING.md`（制作源字段的原始说明）、`README.md`（实现与原理全记录）、`qa/AUTHORING.md`（图形编辑器操作）、`MIGRATION_FILES.md`（哪些文件属于本体、哪些属于 DLC）。

---

## 0. 范围声明（先读这一条）

本文只覆盖**人物纸娃娃动画**与**运输动物（transport）动画**两套方案。

以下内容属于**临时测试素材，不在本方案范围内，不要当成规范去模仿**：

- `assets/zombie/`、`data/examples/zombie-*.json`、`qa/zombie-*.ts|html|png`、`tools/*zombie*`、`tools/render_zombie_*.py`（僵尸实验）
- `assets/hound/`、`HOUND.md`、`qa/hound-battle.*`、`runtime/HoundVisual.ts` 中的猎犬视觉（猎犬实验）

它们能跑，是因为它们复用同一套运行时；但它们的数据结构是试验品，**不要**把它们当作“标准做法”的参考。

---

## 1. 30 秒速查（改动画最常用的 6 件事）

| 我想做的事 | 改哪里 | 然后跑什么 |
| --- | --- | --- |
| 改受击/死亡/行走/攻击的**时长、帧率、循环、事件时点** | `data/battle_skeleton.authoring.json` 的 `animations` | `npm run generate:battle-animation` → `npm run test:skeleton` |
| 改某个动作的**姿势/关键帧** | 同上，写 `tracks` / `slotTracks`；或用图形编辑器导出补丁 | 同上 |
| 换/加**素材图片** | 图片放 `assets/` 下 → 在 `manifest.json` 的 `assets` 登记 → 在制作源 `definition.attachments` 引用 | 同上 |
| 加**新骨骼/插槽** | 制作源 `definition.bones` / `definition.slots`（整组替换！） | 同上 |
| 只想**校验**不改文件 | — | `node public/mods/revival/tools/generate_legacy_tracks.mjs --check` |
| 可视化调姿势 / 做新动作 | 浏览器打开 `/mods/revival/qa/authoring-preview.html`（需 `npm run dev`） | 编辑器内导出工程 JSON |

**一句话铁律**：`data/battle_skeleton.json` 是**生成产物，不要手改**。所有改动写在 `data/battle_skeleton.authoring.json`，由 `npm run generate:battle-animation` 重新生成。

---

## 2. 数据流总览

```
manifest.json  data.battleSkeleton = "data/battle_skeleton.json"
      │
      │  ModRuntime.loadDataPatches()   ← 字符串值会被 fetch 成 JSON
      ▼
DataStore.battleSkeleton = { definition, animations, transport }      (runtime/Data.ts)
      │
      ├── Battle.ts           ← 模拟层：决定「现在该播哪个片段、播多久、发什么事件」
      │        · 取片段：ds.battleSkeleton.animations["hit_"+weaponAnimType(...)] 等
      │        · 推进播放器：createAnimationPlayback / advanceAnimationPlayback
      │        · 消费事件：death_logic / death_fall / footstep / melee_swoosh / fire / throw_release
      │
      └── BattleFieldView.ts  ← 渲染层：只读姿态，绝不推进时间、绝不消费事件
               · time = (frame - 1) / clip.fps
               · sampleSkeletonPose(definition, clip, time)
               · 交给 BattleDoll.renderDollFrame 画 100×100 纸娃娃
```

**三层职责（这是本方案的核心设计，改动时不要破坏）：**

1. **模拟层（Battle.ts）**：唯一的时钟。攻击/受击/死亡/行走的时长与事件都归它。
2. **采样层（BattleSkeleton.ts）**：纯函数。给 (definition, animation, time) 返回一份只读姿态，带缓存，不派发事件。
3. **渲染层（BattleFieldView.ts / BattleDoll.ts）**：把姿态画出来。**不引入第二个动画时钟**——它用的 `frame` 是模拟层给的整数帧号，不是自己累加的时间。

> 为什么这样设计：早期版本渲染端也自己推进动画，导致身体和阴影不同步、音效重复触发、帧率变化时动作变快。现在只有模拟层有时间。

---

## 3. 文件地图

| 路径 | 角色 | 能否手改 |
| --- | --- | --- |
| `manifest.json` | DLC 清单：`data.battleSkeleton` 指向数据文件；`assets` 登记 72 张 `BattlePacked*.png`；`runtime` 指向 `runtime/index.ts` | ✅ 手改（加素材时必须改） |
| `data/battle_skeleton.base.json` | **骨架基线**：14 根骨骼 + 13 个插槽（无附件）。generator 的 definition 起点 | ⚠️ 可改，但通常只改 authoring |
| `data/battle_skeleton.authoring.json` | **手工制作源**（默认空覆盖 `{version:1,definition:{},animations:{}}`） | ✅ **日常改这个** |
| `data/battle_skeleton.json` | **生成产物**（5.5 MB）：游戏真正读取的文件 | ❌ **不要手改** |
| `data/battle_skeleton_legacy.json` | 从 `AnimationData.as` 提取的**原版帧表**（只读参考资料，见 §8） | ❌ 参考用 |
| `data/examples/` | 编辑器工程示例（含僵尸工程，属临时测试） | — |
| `tools/generate_legacy_tracks.mjs` | 生成器：原版 40 段 → 应用 authoring → 写产物。支持 `--check` | ❌ |
| `tools/animation_authoring.mjs` | 制作源校验/合并（纯离线，不进运行时） | ❌ |
| `tools/battle_skeleton_regression.mjs` | 骨架回归测试（`npm run test:skeleton`） | ❌ |
| `tools/authoring_editor_regression.mjs` | 图形编辑器回归测试 | ❌ |
| `tools/generate_battle_atlas.mjs` | 紧凑图集生成 | ❌ |
| `runtime/BattleSkeleton.ts` | 骨架/姿态采样核心 + 全部类型定义 | ⚠️ 改要重新构建 |
| `runtime/BattleAnimation.ts` | 播放器 + 原版片段/事件唯一来源 | ⚠️ 同上 |
| `runtime/BattleDoll.ts` | 纸娃娃绘制 + `DollAnim` 状态机 | ⚠️ 同上 |
| `runtime/BattleTransportAnimation.ts` | 运输动物动画 + 原版 transport rig | ⚠️ 同上 |
| `runtime/BattleFieldView.ts` | 渲染接入（取片段、算 time、采样、画） | ⚠️ 同上 |
| `runtime/Battle.ts` | 战斗模拟（唯一的动画时钟） | ⚠️ 同上 |
| `qa/authoring-preview.html` + `.ts` | **图形编辑器**（拖关节、做新动作、导出补丁） | — |
| `qa/battle-parity.html` + `.ts` | **四方向/首末帧/阴影/发射点验收页** | — |
| `qa/battle-performance.html` + `.ts` | 性能验证页 | — |
| `qa/runtime-switch.html` + `.ts` | 新旧运行时切换验证页 | — |

> 改了 `runtime/*.ts` 之后必须 `npm run build`，否则游戏里加载的还是旧 chunk。

---

## 4. 数据模型

### 4.1 `definition`（骨架定义）

```ts
type SkeletonDefinition = {
  packedParts?: Record<string, string>;   // 紧凑图集索引：键是逻辑名，值是图集里的 part 名
  bones: SkeletonBone[];                  // 骨骼树
  slots: SkeletonSlot[];                  // 插槽（= 可绘制的部件层）
  attachments?: Record<string, SkeletonAttachment>; // 具名附件库
  drawOrder?: "legacy" | "slots";         // 层序策略，默认 "legacy"
};
```

**骨骼 `SkeletonBone`**

```ts
{ name: string; parent?: string;
  x?, y?, rotation?, scaleX?, scaleY?, pivotX?, pivotY?, alpha? }
```

- 当前 DLC 实际有 **14 根**：`root`，以及 `parent:"root"` 的
  `BackHair, BigGunBackpack, LeftTopArm, LeftForearm, Legs, Body, RightTopArm, ShoulderPlates, Head, Beard, RightForearm, Weapon, Shadows`。
- 全部 `x:0, y:0`。**骨骼默认值目前是零位**——姿势完全由 `tracks` + 原版帧号（`legacyParts`）驱动。
- 编译期校验（`compileDefinition`）：重名 → `Duplicate skeleton bone:`；父不存在 → `Missing skeleton parent:`；父子成环 → `Skeleton parent cycle:`。

**插槽 `SkeletonSlot`**

```ts
{ name: string; bone: string; part: string; z: number;
  x?, y?, rotation?, scaleX?, scaleY?, pivotX?, pivotY?, alpha?;
  attachment?: string | null;   // 引用 attachments 里的名字
  visible?: boolean;
  directions?: Record<"0"|"1"|"2"|"3", SkeletonSlotDirection>;  // 分方向覆盖
}
```

- 当前有 **13 个**，z 从 0 到 12，顺序：`BackHair(0), BigGunBackpack(1), LeftTopArm(2), LeftForearm(3), Legs(4), Body(5), RightTopArm(6), ShoulderPlates(7), Head(8), Beard(9), RightForearm(10), Weapon(11), Shadows(12)`。
- 插槽名默认与 `part` 同名（`name === part`），这样 `legacyParts[part]` 能直接喂给它。
- 插槽缺骨骼 → `Missing slot bone:`。编译后 `slots` 按 `z` 升序排序。

**附件 `SkeletonAttachment`**

```ts
{ image?: string;              // manifest.assets 里登记的图片名
  part?: string; frame?: number; // 或：原版部件的某一帧（二选一！）
  x?, y?: number;              // 注册点偏移
  muzzle?: { x, y };           // 武器发射点（覆盖默认）
}
```

- **`image` 与 `part` 必须恰好二选一**，否则校验报错。
- `frame` 必须是**正整数**。
- 当前产物里有 **1121 个附件，全部是 `original:` 命名空间**（`original:<Part>:<frame>`），由 generator 从原版帧表自动生成。**`original:` 前缀不可被制作源覆盖。**
- 自定义图片的完整链路（少一步都不行）：
  1. 图片放到 `public/mods/revival/assets/...`
  2. 在 **`mods/revival/manifest.json`** 的 `assets` 里登记：`"MyArm.png": "assets/custom/MyArm.png"`
  3. 制作源里用**登记名**引用：`{ "image": "MyArm.png", "x": 0, "y": 0 }`
  - 校验器 `hasImage` 会去 DLC manifest.assets（以及本体 `public/assets/manifest.json` 的 images）里查路径是否真实存在，路径写错直接报错。

**`drawOrder`**

- `"legacy"`（当前默认，字段未设置时）：按原版的「方向 + 阶段」层序表绘制。
- `"slots"`：按插槽的 `z` 升序绘制。**想让 z 生效必须显式设置这个值。**

### 4.2 `animations`（片段）

片段名**只能**是 `(idle|walk|shoot|hit|death)_[0-7]` 这 40 个（5 阶段 × 8 种武器动画类型）。

```ts
type SkeletonAnimation = {
  name: string;
  fps: number;              // 默认 25（原版）
  duration: number;         // 秒 = 源帧数 / fps；关键帧与事件时间必须落在 [0, duration]
  playbackDuration?: number; // 实际播放时长；>0 且 <= duration
  finishOnLastFrame?: boolean;
  loop?: boolean;           // 原版只有 walk 为 true
  tracks: BoneTrack[];      // 骨骼轨道（插值 linear | step）
  slotTracks?: SlotTrack[]; // 离散轨道：附件 / 可见性 / z
  events?: SkeletonEvent[]; // [{ time: 秒, name, value? }]
  legacyParts?: Record<"legs"|"body"|"arms"|"weapon"|"shadow", { fps, frames: number[] }>;
};
```

**五个阶段的语义**

| phase | 名称 | 谁触发 | 结束行为 |
| --- | --- | --- | --- |
| 0 | `idle` | 默认状态 | 常驻（1 帧静止） |
| 1 | `walk` | `beginWalk` / 移动 | 循环，到终点保留当帧姿态，下一模拟更新切 idle |
| 2 | `shoot` | 攻击指令 | 播完回 idle |
| 3 | `hit` | 被命中 | 播完回 idle；可被新的受击/死亡打断 |
| 4 | `death` | HP≤0 | **停在末帧**，不切回 idle |

**8 种武器动画类型（`_0` … `_7`）怎么选**

由 `weaponAnimType(weaponsData, weaponSub)` 决定（`runtime/BattleDoll.ts:240`），复刻原版 `slotAnimationType`：

- 武器 `animatedWeapon === 0 && type === 10` → **7**（投掷/手雷）
- 否则取 `weaponsData.AnimationTypes[animatedWeapon]`，缺省 **0**

同一角色不同武器会用不同后缀的片段；`idle_0..7` 只影响待机的部件帧（例如 `idle_1` 的手臂是第 18 帧而非第 1 帧）。

### 4.3 无后缀别名

generator 会为 type 0 的 5 个片段额外生成 5 个别名：

```
idle  = {...idle_0,  name:"idle"}
walk  = {...walk_0,  name:"walk"}
shoot = {...shoot_0, name:"shoot"}
hit   = {...hit_0,   name:"hit"}
death = {...death_0, name:"death"}
```

- 别名**自动跟随 `_0`**，**不能单独编辑**。想改别名就改 `hit_0`。
- 用途：运行时兜底（`clips[baseName + "_" + type] ?? clips[baseName]`）、以及 `BattleFieldView.ts:562` 的取片段逻辑。

---

## 5. 时间模型（最容易搞错的部分，务必精读）

### 5.1 帧与时间的换算

- **帧号是 1 基**（第 1 帧是第一帧），**时间是 0 基**（第 1 帧对应 t=0）。
- 换算：`time = (frame - 1) / fps`；反算：`frame = time * fps + 1`。
- 原版 fps = **25**，所以一帧 = **0.04 s**。
- `animationFrameIndex(time, fps) = floor(round(time * fps))`（先四舍五入消浮点噪声，再向下取整）。它返回 **0 基索引**。

> 例：`time = 0.04` → `round(1.0)=1` → 索引 1 → 对应**第 2 帧**。

### 5.2 `duration` 与 `playbackDuration` 的区别（关键）

```ts
duration          // 完整可编辑时间轴长度 = 源帧数 / fps。采样用（时间轴、关键帧上限）
playbackDuration  // 实际播放多久。缺省 = duration
```

播放器（`runtime/BattleAnimation.ts:68-107`）的真实公式：

```ts
duration   = animation.playbackDuration ?? animation.duration
previousTime = elapsed - 1/fps                       // 事件区间左端点
elapsed    += dt
endTime    = cycles * duration - (finishOnLastFrame ? 1/fps : 0)
time       = min(elapsed - 1/fps, endTime)
done       = time >= endTime - 1e-9
frame      = done
  ? animationFrameIndex(duration, fps)
  : min(animationFrameIndex(duration, fps),
        animationFrameIndex(max(0, time - lastCycle*duration), fps) + 1)
```

**为什么要有 `playbackDuration`**（原版 AS3 的怪癖，必须保留才逐像素对得上）：

> `playbackDuration may end before the last source key (AS3 hit/death EF rules). duration remains the full editable source timeline used by pose sampling. finishOnLastFrame settles on arrival at the final pose (AS3 transport corpses); the default settles after holding that pose for one frame.`

- 原版 AS3 的帧表是 **1 基写入**（表长 = 源帧数 N + 1）。受击在 `length-1` 就返回 idle；死亡在绘制前 `currFrame--`。
- 所以：**16 帧的死亡，最终可见帧是第 15 帧**；**3 帧的受击，可见过程是 1 → 2 → idle**。
- 表现到数据上就是 `playbackDuration = max(1, 源帧数 - 1) / fps`。

**`finishOnLastFrame`**：到末帧就立即 `done`（不再多停一帧）。当前只有 **transport 的 death** 用它。

**片段「占用的模拟时间」（done 的判定）** —— 两条结论要记住：

```
finishOnLastFrame = true   → done 发生在 elapsed >= playbackDuration
finishOnLastFrame 缺省     → done 发生在 elapsed >= playbackDuration + 1/fps
```

也就是**默认会多停一帧**。举例：

| 片段 | playbackDuration | 实际占用（done 判定） | 最终显示帧 |
| --- | --- | --- | --- |
| `hit_*` | 0.08 s | **0.12 s** | 第 2 帧 |
| `death_*` | 0.60 s | **0.64 s** | 第 15 帧 |
| `idle_*` | —（= duration 0.04） | 0.08 s | 第 1 帧 |
| `death_free` / `death_towing` | 0.80 s（finishOnLastFrame） | **0.80 s** | 第 20 帧 |

**`loop`**：只有原版 `walk` 为 `true`。
播放器会在创建时把 `loop:true` 的片段**换成 `loop:false` 的副本**，因为「This player owns repetition. Do not let the event sampler loop again at a cycle boundary」——重复由播放器的 `cycles` 参数负责，循环边界**不会重复触发事件**。

### 5.3 攻击的第 1 帧

> `Original applyPhaseAndFrame enters frame 1 on the NEXT simulation tick. A frame-1 attack therefore fires once on that tick, never during drawing.`

即：开始动作的那一次调用**不显示任何新帧**，下一次模拟更新才进入第 1 帧。做 `time = 0` 的事件（如 `shoot_3/4/5` 的 `fire`）时，要意识到它发生在**动作开始的下一拍**。

### 5.4 短轨道的「保持」

`legacyParts[part] = frames[min(frames.length-1, animationFrameIndex(t, track.fps||25))]`

短轨道（例如行走时 `body` 只有 1 帧、`legs` 有 8 帧）到末帧后**保持**，不会被拉伸。这是原版行为，不要"修正"它。

### 5.5 行走的特殊规则

- 8 帧循环，**4 帧走一格**（`STEP_DUR = 0.16 s`）。
- 脚步事件在**第 2 帧和第 6 帧**（原版 `BattleField.as:2078-2084` 的 `currFrame % 4 == 2`）。
- 到终点时**保留当帧的步行姿态**（`pendingIdle`），**下一次**模拟更新才切 idle。
- 播放器 `cycles = ceil(steps.length * stepDur / animation.duration)`——走多远就循环多少轮。
- 1× / 2× 速度下第一次更新分别显示第 1 / 第 2 帧。

---

## 6. 事件系统

**事件是攻击结算、脚步、死亡里程碑的真正来源。** 时长可以改，但事件不写就没有伤害/音效。

```ts
{ time: number,   // 秒，必须落在 [0, duration]
  name: string,   // 见下表
  value?: any }   // 可选载荷（当前内置片段不用）
```

### 6.1 事件名全集与消费点

| 事件名 | 归属 | 谁消费 | 语义 |
| --- | --- | --- | --- |
| `footstep` | 人物 | `Battle.ts:4017-4020` | 播 `SFXFootstep{1..8}.mp3`（随机） |
| `melee_swoosh` | 人物 | `Battle.ts:2396` | 近战时播挥击音（`isMelee` 才播） |
| `fire` | 人物 | `Battle.ts:2397` | **调用 `resolveImpact()`——真正的命中结算** |
| `throw_release` | 人物 | `Battle.ts:2058` | 手雷脱手 |
| `death_logic` | 人物 | `Battle.ts:1572-1586` | 掉武器（`__deathDropped` 保证只掉一次） |
| `death_fall` | 人物 | `Battle.ts:1572-1586` | 倒地声（`__bodyFall` 保证只响一次） |
| `animal_fall` | transport | `BattleTransportAnimation.ts:58` | 动物倒地声 |

> **没有事件 = 没有伤害。** 改 `shoot_*` 的时长却不改 `fire` 的 `time`，会出现"打完了但伤害还没结算"或"伤害结算在动画之前"。

### 6.2 事件的三个硬规则

1. **事件属于绝对时间区间 `(previousTime, time]`**。重复绘制同一姿态、时间倒退、或对已完成的片段再次 clamp，都**不会**重复派发事件。
2. **每个事件只被消费一次**：模拟层 `splice(0)` 走事件队列，动作被打断时旧队列直接丢弃（「An interrupted/replaced action cannot fire later」）。
3. **只有模拟层消费事件**。渲染层绝不消费——这也是渲染层不能自己推进时间的原因。

### 6.3 事件时间 ↔ 帧号对照

内置片段的事件时间都落在整帧上，对应关系是：

```
time = 0.04 → 第 2 帧      time = 0.16 → 第 5 帧
time = 0.08 → 第 3 帧      time = 0.20 → 第 6 帧
time = 0.12 → 第 4 帧      time = 0.24 → 第 7 帧   time = 0.28 → 第 8 帧
```

---

## 7. 已有动画清单与持续时间（本文重点交付内容之一）

### 7.1 人物：45 个片段（40 个标准 + 5 个别名），fps 全部 = 25

| 片段 | 帧数 | duration | playbackDuration | 实际播放 | loop | 事件（时间 → 1基帧） |
| --- | --- | --- | --- | --- | --- | --- |
| `idle_0`…`idle_7` | 1 | 0.04 s | — | 0.04 s | false | 无 |
| `idle`（别名） | 1 | 0.04 s | — | 0.04 s | false | 无 |
| `walk_0`…`walk_7` | 8 | 0.32 s | — | 0.32 s（循环） | **true** | 0.04→帧2 `footstep`；0.20→帧6 `footstep` |
| `walk`（别名） | 8 | 0.32 s | — | 0.32 s（循环） | **true** | 同上 |
| `shoot_0` | 13 | 0.52 s | — | 0.52 s | false | 0.16→帧5 `melee_swoosh`；0.28→帧8 `fire` |
| `shoot_1` | 12 | 0.48 s | — | 0.48 s | false | 0.08→帧3 `melee_swoosh`；0.20→帧6 `fire` |
| `shoot_2` | 14 | 0.56 s | — | 0.56 s | false | 0.16→帧5 `melee_swoosh`；0.28→帧8 `fire` |
| `shoot_3` | 3 | 0.12 s | — | 0.12 s | false | 0.00→帧1 `fire` |
| `shoot_4` | 3 | 0.12 s | — | 0.12 s | false | 0.00→帧1 `fire` |
| `shoot_5` | 3 | 0.12 s | — | 0.12 s | false | 0.00→帧1 `fire` |
| `shoot_6` | 4 | 0.16 s | — | 0.16 s | false | 0.00→帧1 `fire` |
| `shoot_7` | 11 | 0.44 s | — | 0.44 s | false | 0.20→帧6 `throw_release` |
| `shoot`（别名） | 13 | 0.52 s | — | 0.52 s | false | 同 `shoot_0` |
| **`hit_0`…`hit_7`** | **3** | **0.12 s** | **0.08 s** | **显示帧 1→2 后回 idle；实际占用 0.12 s** | false | **无** |
| **`hit`（别名）** | **3** | **0.12 s** | **0.08 s** | **同上** | false | **无** |
| `death_0`…`death_7` | 16 | 0.64 s | 0.60 s | 显示帧 1→…→**15** 后停住；实际占用 0.64 s | false | 0.16→帧5 `death_logic`；0.24→帧7 `death_fall` |
| `death`（别名） | 16 | 0.64 s | 0.60 s | 同上 | false | 同 `death_0` |

**关于受击（用户特别关注的）：**

- `hit_*` 源帧 3 帧（`body` 用原版第 2–4 帧，`arms`/`weapon` 用另一段 3 帧，`legs` 保持 1 帧，`shadow` 3 帧）。
- `duration = 3/25 = 0.12 s`（完整可编辑时间轴）。
- `playbackDuration = 2/25 = 0.08 s`（**实际播放时长**）。
- 可见过程：**第 1 帧 → 第 2 帧 → 回 idle**。逐拍实测（`elapsed` 为模拟层累计时间）：
  ```
  elapsed 0.00 s  → 不显示新帧（动作开始的下一拍才进第 1 帧）
  elapsed 0.04 s  → 第 1 帧
  elapsed 0.08 s  → 第 2 帧
  elapsed 0.12 s  → 仍显示第 2 帧，同时 playback.done = true → 切回 idle
  ```
  即：**受击实际占用约 0.12 s 的模拟时间**（`playbackDuration 0.08` + 起始的 1/fps 偏移），其中可见动画只有 0.08 s。
- 受击**没有事件**——它不结算伤害、不发声，纯表现。伤害在攻击方的 `fire` 事件里已经算完。
- `hit_7`（投掷类武器）的 `weapon` 类只有 1 帧（原版 `weapon=1`），其余类别仍是 3 帧。

**每段动画的部件帧数（`legacyParts`）速查：**

| 片段 | legs | body | arms | weapon | shadow |
| --- | --- | --- | --- | --- | --- |
| idle_* | 1 | 1 | 1 | 1 | 1 |
| walk_* | 8 | 1 | 1 | 1 | 8 |
| shoot_0/1/2 | =帧数 | =帧数 | =帧数 | =帧数 | =帧数 |
| shoot_3/4/5 | 1 | 3 | 3 | 3 | 3 |
| shoot_6 | 1 | 4 | 4 | 4 | 4 |
| shoot_7 | 11 | 7 | 11 | 1 | 11 |
| hit_* | 1 | 3 | 3 | 3（hit_7 为 1） | 3 |
| death_* | 16 | 16 | 16 | 16（death_7 为 1） | 16 |

> 生成时会**裁掉末尾重复帧**（`while (末尾两个相同) pop`），所以"保持"的短轨道不需要冗余末键。

### 7.2 运输动物（transport）：6 个片段，fps = 25

| 片段 | 源帧范围 | 帧数 | duration | 实际播放 | 事件 |
| --- | --- | --- | --- | --- | --- |
| `idle_free` | 1 | 1 | 0.04 s | 0.04 s | 无 |
| `hit_free` | 2–8 | 7 | 0.28 s | 0.28 s | 无 |
| `death_free` | 10–29 | 20 | 0.80 s | 0.80 s（`finishOnLastFrame: true`） | 0.44 s→第 12 帧 `animal_fall` |
| `idle_towing` | 30 | 1 | 0.04 s | 0.04 s | 无 |
| `hit_towing` | 31–37 | 7 | 0.28 s | 0.28 s | 无 |
| `death_towing` | 39–58 | 20 | 0.80 s | 0.80 s（`finishOnLastFrame: true`） | 0.48 s→第 13 帧 `animal_fall` |

**渲染帧号映射**（`BattleTransportAnimation.ts:61`）：

```ts
a.frame = (phase === "death" ? 10 : 2) + (towing ? 29 : 0) + playback.frame - 1
```

- 受击：`a.frame` 走 **2..8**（自由）/ **31..37**（牵引）。
- 死亡：`a.frame` 走 **10..29**（自由）/ **39..58**（牵引）。
- 倒地声实际发生在显示帧 **21**（自由）/ **51**（牵引）——因为原版 EF 是在**绘制之后**检查递增后的帧（21→22 / 51→52）。音量 0.5。
- 牵引单位初始帧 **30**，其余单位帧 **1**；只有 `category === 1` 的动物会进入受击/死亡。
- `transports.json` 的 6 种动物里，1/6/7/9 有牵引动作，4/5 不可牵引（只存在 1–29 帧）。

### 7.3 相关但不在骨架数据里的动画（同属本 DLC，供参考）

| 对象 | 时长 / 帧 |
| --- | --- |
| `ShotSmoke` | 1–12 帧，播一次 |
| `Explosion` | 1–24 帧，播一次 |
| `BodyBurn` | 1–40 帧，**循环** |
| `FlamethrowerFlame` | 45 可见帧 / 47 物理帧 / 第 48 拍移除 |
| `Grenade` | 16 帧回环（发射时 frame = 1） |
| 火箭弹 | 方向帧 0–15 行，`Rocket.png`/`RocketShadow.png` 15×15，注册点 (-7.5, -7.5) |
| 弩箭 | 程序绘制的线条，无帧动画 |

---

## 8. 原版帧表参考（`data/battle_skeleton_legacy.json`）

这是从 `decompiled/all/scripts/IsoEngine/AnimationData.as` 提取的权威原版表，是 generator 的输入，也是**改动画时的唯一"真理源"**。

```json
{ "source": "decompiled/all/scripts/IsoEngine/AnimationData.as",
  "fps": 25, "directions": 4,
  "phases": ["idle", "walk", "attack", "hit", "death"],
  "weaponTypes": 8,
  "frames": [ /* frames[weaponType][phase] = { legs, body, arms, weapon, shadow } */ ] }
```

- 值是**起始帧号**（单帧，如 `1`）或 `[起始, 结束]`（范围，帧数 = 结束 - 起始 + 1）。
- 注意这里的 phase 名是 `attack`，在 Web 侧统一叫 **`shoot`**。

**完整原版帧表（`legs | body | arms | weapon | shadow`）：**

| WT | idle | walk | attack(shoot) | hit | death |
| --- | --- | --- | --- | --- | --- |
| 0 | 1 / 1 / 1 / 1 / 1 | legs[2,9] / 1 / 1 / 1 / shadow[2,9] | legs[10,22] / body[5,17] / arms[2,14] / weapon[2,14] / shadow[10,22] | 1 / body[2,4] / arms[15,17] / weapon[15,17] / shadow[23,25] | legs[60,75] / body[72,87] / arms[96,111] / weapon[18,33] / shadow[104,119] |
| 1 | 1 / 1 / 18 / 1 / 26 | 同 walk 通用 | legs[23,34] / body[18,29] / arms[19,30] / weapon[2,13] / shadow[27,38] | 1 / body[2,4] / arms[31,33] / weapon[14,16] / shadow[39,41] | legs[60,75] / body[72,87] / arms[96,111] / weapon[17,32] / shadow[104,119] |
| 2 | 1 / 1 / 34 / 1 / 42 | 同上 | legs[35,48] / body[30,43] / arms[35,48] / weapon[2,15] / shadow[43,56] | 1 / body[2,4] / arms[49,51] / weapon[16,18] / shadow[57,59] | legs[60,75] / body[72,87] / arms[96,111] / weapon[19,34] / shadow[104,119] |
| 3 | 1 / 1 / 52 / 1 / 60 | 同上 | 1 / body[44,46] / arms[53,55] / weapon[2,4] / shadow[61,63] | 1 / body[2,4] / arms[56,58] / weapon[5,7] / shadow[64,66] | legs[60,75] / body[72,87] / arms[96,111] / weapon[8,23] / shadow[104,119] |
| 4 | 1 / 1 / 59 / 1 / 67 | 同上 | 1 / body[47,49] / arms[60,62] / weapon[2,4] / shadow[68,70] | 1 / body[2,4] / arms[63,65] / weapon[5,7] / shadow[71,73] | 同 WT3 death |
| 5 | 1 / 1 / 66 / 1 / 74 | 同上 | 1 / body[50,52] / arms[67,69] / weapon[2,4] / shadow[75,77] | 1 / body[2,4] / arms[70,72] / weapon[5,7] / shadow[78,80] | 同 WT3 death |
| 6 | 1 / **53** / 73 / 1 / 81 | 同上 | 1 / body[54,57] / arms[74,77] / weapon[2,5] / shadow[82,85] | 1 / body[58,60] / arms[78,80] / weapon[6,8] / shadow[86,88] | legs[60,75] / body[72,87] / arms[96,111] / weapon[9,24] / shadow[104,119] |
| 7 | 1 / 1 / 81 / 1 / 89 | 同上 | legs[49,59] / body[61,67] / arms[82,92] / weapon[1] / shadow[90,100] | 1 / body[2,4] / arms[93,95] / weapon[1] / shadow[101,103] | legs[60,75] / body[72,87] / arms[96,111] / weapon[1] / shadow[104,119] |

**攻击命中帧（`HitFrames`，1 基源帧）**：`[8, 6, 8, 1, 1, 1, 1, 6]`
——这就是各 `shoot_*` 的 `fire` 事件时点来源（`time = (HitFrames[type] - 1) / 25`）。

---

## 9. 修改流程（按目标选路线）

### A. 只改节奏（时长 / fps / 循环 / 事件时点）—— 最常用

`data/battle_skeleton.authoring.json`：

```json
{
  "version": 1,
  "definition": {},
  "animations": {
    "hit_0": { "duration": 0.16, "playbackDuration": 0.12 },
    "death_0": { "playbackDuration": null },
    "walk_0": { "fps": 30, "events": [{ "time": 0.0333, "name": "footstep" }, { "time": 0.1667, "name": "footstep" }] }
  }
}
```

- 写 `null` = **清除覆盖**、回退运行时默认（如上面 `death_0` 的 `playbackDuration: null` 会让死亡**完整播完**）。
- `fps` 与 `duration` **不可清除**。
- **可清除字段**：`loop`、`playbackDuration`、`finishOnLastFrame`、`events`、`legacyParts`。

然后：

```bash
cd web
npm run generate:battle-animation     # 重新生成 data/battle_skeleton.json
npm run test:skeleton                 # 回归测试
npm run build                         # 只在改过 runtime/*.ts 时才需要
```

> ⚠️ **一旦覆盖了某片段的节奏字段，该片段就不再受「与原版逐字段相同」的保护**，逐像素对照不再是验收依据（攻击命中/脚步/倒地时点会随 `events`/`duration` 变）。请改用 `qa/battle-parity.html` 验收行为。

### B. 改姿势（关键帧）

用图形编辑器（§10）拖关节，然后「原版兼容补丁」导出，或手写：

```json
{
  "version": 1,
  "definition": {},
  "animations": {
    "shoot_0": {
      "tracks": [
        { "bone": "RightTopArm", "keys": [
          { "time": 0.0, "transform": { "rotation": 0 } },
          { "time": 0.12, "transform": { "rotation": -0.6 }, "interpolation": "linear" },
          { "time": 0.28, "transform": { "rotation": -1.2 }, "interpolation": "step" }
        ] }
      ]
    }
  }
}
```

规则：

- `time` 必须落在 `[0, duration]`；**同一轨道内不可重复 time**。
- `interpolation` 缺省 `"linear"`；`"step"` 表示保持到下一个键。
- 骨骼本地值 = **定义值 + 轨道值**：平移相加、旋转相加、**缩放相乘**、枢轴相加；`alpha` 相乘。
- 省略 `slotTracks` → **保留**原版附件轨道；显式写 `[]` → **清空**。
- `tracks` / `slotTracks` **不参与**合并，是整条替换。

### C. 换 / 加素材

见 §4.1 的「自定义图片完整链路」三步。走完还要：

- 若新图片要进紧凑图集：`node public/mods/revival/tools/generate_battle_atlas.mjs`
- 在 `definition.packedParts` 里建立逻辑名 → 图集名的映射。

### D. 做全新动作

**当前骨架只支持 40 个固定片段名**（`(idle|walk|shoot|hit|death)_[0-7]`），**不能**用制作源新增 `my_special_attack` 这种名字——校验器会直接拒绝。

要做"全新动作"，有两条路：

1. **占用一个现有槽位**：例如把某个不常用的 `shoot_N` 改成新动作，然后在运行时决定何时播它。
2. **走运行时扩展**（需要改 `runtime/*.ts`）：在 `Battle.ts` 里新增取片段的路径 + 新的事件名 + 消费逻辑。**改完必须 `npm run build`。**
   - 参考猎犬的做法：`runtime/HoundVisual.ts` 通过 `battle.houndVisual` 服务注入自定义 `unitAnimation`（但那是试验品，不要照抄结构）。

---

## 10. 图形编辑器（`qa/authoring-preview.html`）

**打开方式**：`npm run dev` 后访问 `/mods/revival/qa/authoring-preview.html`。
（Vite QA 入口，**不能**双击 HTML 打开。）

**三步上手**：打开后有一个彩色入门人偶 + 待机/行走 → 左侧选部位、时间轴选时间、拖关节移动、点「旋转」拖绿色圆环 → 自动记录姿势（也可右侧输数值按 Enter）。

**用自己素材**：已有部位点图片插槽 → 右侧「图片」导入 PNG/JPG/WebP（透明 PNG，单张 ≤8 MB、≤4096×4096）；新部位先选父部位 →「＋ 子部位」→「图片插槽 ＋ 添加」；图片偏移用于对准关节；**层级越大越靠前**。

**做新动作**：「＋ 新动作」→ 展开动作设置可改名/复制/调整时长和帧率；时间轴拖菱形改时间，移到已有姿势点会替换；事件允许同一时间多个；可撤销。

**事件**：可加脚步/命中等时刻标记，参数是 JSON。**标记不会自行播放音效或造成伤害**——真正生效要靠运行时消费（§6.1）。

**保存**：保存工程含骨骼/图片/全部动作，导入图片会**嵌入 JSON**；本机草稿用独立 IndexedDB（不碰游戏存档，清理浏览器数据会丢）；「仅导出当前动作工程」含完整骨骼但只有一个动作。

**原版兼容补丁流程**（改原版动画的标准路径）：

1. 从「打开原版兼容工程」开始；
2. 选 idle/walk/shoot/hit/death 的 0–7 标准动作；
3. 导出姿势、插槽轨道，以及**确实改过的**时长/帧率/循环/播放时长/事件；
4. **未改动的节奏不会写进补丁**——这保证了"空制作源 == 原版输出"。

**快捷键**：空格播放/暂停；`V` 移动；`R` 旋转；`F` 适应画布；左右箭头前后帧；右键拖动平移；滚轮缩放；`Ctrl+Z` 撤销；`Ctrl+Y`/`Ctrl+Shift+Z` 重做；`Ctrl+C/V` 复制粘贴姿势；`Ctrl+S` 生成工程文件；`Delete` 删除选中关键帧；`Esc` 取消拖动。

**边界**：预览方向只用**已有插槽方向配置**，**不自动生成四向美术**。新图片/新动作/命中事件投入游戏仍需自行配置素材注册、单位动作映射及运行时逻辑。

---

## 11. 校验与验收

```bash
cd web

# 只校验，不写文件
node public/mods/revival/tools/generate_legacy_tracks.mjs --check

# 重新生成数据（会应用 authoring，仅在内容变化时才写盘，先写 .tmp 再 rename）
npm run generate:battle-animation

# 骨架回归测试
npm run test:skeleton

# 图形编辑器回归
node public/mods/revival/tools/authoring_editor_regression.mjs

# 类型检查 + 构建
npm run build
```

**浏览器验收页**：

| 页面 | 验什么 |
| --- | --- |
| `/mods/revival/qa/battle-parity.html` | 四方向、首末帧、阴影、装备、发射点；transport 动画；紧凑图集对照 |
| `/mods/revival/qa/authoring-preview.html` | 姿势/动作制作与预览 |
| `/mods/revival/qa/battle-performance.html` | 性能（24 人物实测，见 `qa/PERFORMANCE.md`） |
| `/mods/revival/qa/runtime-switch.html` | 新旧运行时切换是否正常 |

**生成器的校验覆盖面**（`tools/animation_authoring.mjs`，错误信息是**字段路径**）：

- 骨骼：parent 成环、缺父
- 插槽：缺骨骼、插槽轨道引用的插槽必须存在
- 附件：`image` 与 `part` **恰好二选一**；`frame` 正整数；`alpha` ∈ [0,1]；`muzzle` 只能是 `{x,y}`；`directions` 键只能是 `"0"`–`"3"`
- 关键帧：`time ∈ [0, duration]`，同一轨道不可重复 time
- 事件：`time ∈ [0, duration]`，`name` 非空
- 节奏：`fps` 正数、`duration` 正数、`playbackDuration` 正数且 ≤ duration、`legacyParts.frames` 全为正整数
- 顶层：`version` 必须为 1；`animations` 的键必须匹配 `/^(idle|walk|shoot|hit|death)_[0-7]$/` 且已存在
- 安全：附件名禁止 `original:`、`__proto__`、`constructor`、`prototype`

**失败是原子的**：`applyAnimationAuthoring` 不修改任何输入，出错不会半应用。

---

## 12. 硬约束与陷阱清单（改之前先扫一遍）

1. ❌ **不要手改 `data/battle_skeleton.json`** —— 下次生成会覆盖。
2. ❌ **不要新增片段名** —— 只能是 `(idle|walk|shoot|hit|death)_[0-7]`。
3. ❌ **不要单独编辑无后缀别名** —— 它们跟随 `_0`。
4. ❌ **不要覆盖 `original:` 附件** —— 会被拒绝。
5. ❌ **不要指望渲染层推进动画** —— 时间只在模拟层；渲染端推进会造成身体/阴影不同步、音效重复。
6. ❌ **不要用 `loop: true` 期待"循环边界重新触发事件"** —— 播放器负责重复，边界事件不重复。
7. ⚠️ **`duration` 和 `playbackDuration` 是两回事** —— 想"停早一点"改后者，不要改前者（改前者会移动所有关键帧的相对位置）。
8. ⚠️ **`bones` / `slots` / `drawOrder` 是整组替换**，不是合并。只想加一根骨骼，必须把全部骨骼重写一遍（可从 `battle_skeleton.base.json` 拷）。
9. ⚠️ **`drawOrder: "slots"` 才让 `z` 生效**；默认是原版层序。
10. ⚠️ **改 `runtime/*.ts` 必须 `npm run build`**，否则游戏里仍是旧 chunk。
11. ⚠️ **帧号 1 基、时间 0 基** —— 混用必错。
12. ⚠️ **动作开始的下一拍才显示第 1 帧** —— `time = 0` 的事件发生在动作开始之后的一次模拟更新。
13. ⚠️ **短轨道到末帧保持**（不拉伸），这是原版行为。
14. ⚠️ **自定义图片必须先在 `mods/revival/manifest.json` 的 `assets` 登记**，否则 `hasImage` 校验失败。
15. ⚠️ **`legacyParts` 的帧号必须能在 `public/data/battle_doll.json` 的 `spriteBoundaries` 里找到**（`hasPart` 校验），否则报错。

---

## 13. 已知未完成 / 限制

（摘自 `README.md`，修改前请确认这些是否仍是现状）

- 受击/死亡/行走已接入共享播放器，但**移动的 AP 仍然提前扣除**。
- 仿射父子**非均匀缩放**、通用枢轴层序编辑、素材减量**未完成**。
- **未量化多人 FPS**（`qa/PERFORMANCE.md` 有 24 人物实测数据）。
- 本方案是**可重复生成、带错误检查的 JSON 制作流程**，**不是图形化时间轴编辑器**——编辑器只是辅助产出补丁。
- 猎犬/僵尸相关运行时（`HoundVisual.ts`、`qa/zombie-*`、`qa/hound-*`）属**临时测试**，不在本方案范围。

---

## 14. 术语表

| 术语 | 含义 |
| --- | --- |
| **片段 / clip** | 一个 `SkeletonAnimation`，如 `hit_0` |
| **阶段 / phase** | 0=idle、1=walk、2=shoot、3=hit、4=death |
| **武器动画类型 / weaponAnimType** | 0–7，决定用哪个 `_N` 后缀 |
| **播放器 / playback** | `AnimationPlayback`，拥有时间、帧号、事件队列 |
| **姿态 / pose** | `sampleSkeletonPose` 的输出，只读、可缓存 |
| **legacyParts** | 按类别（legs/body/arms/weapon/shadow）给的**原版帧号序列** |
| **轨道 / track** | 骨骼关键帧序列（`BoneTrack`）或插槽离散序列（`SlotTrack`） |
| **制作源 / authoring** | `data/battle_skeleton.authoring.json`，手工覆盖层 |
| **产物 / generated** | `data/battle_skeleton.json`，游戏读取的文件 |
| **transport** | 运输动物（驴/牛等），独立的 6 个片段与 rig |
| **原版帧表** | `AnimationData.as` 的 `animationTypeFrames` / `fullAnimationTypeFrames`，见 `data/battle_skeleton_legacy.json` |

---

*本文由代码与数据实测整理，所有时长数值来自 `data/battle_skeleton.json` 实读，公式来自 `runtime/BattleAnimation.ts`、`runtime/BattleSkeleton.ts`、`runtime/BattleTransportAnimation.ts` 的实际实现。若实现变更，请同步更新本文。*