# 复兴动画制作源

> 完整方案（数据结构、时间模型、事件系统、全部动画时长表、硬约束清单）见 [`ANIMATION_SPEC.md`](./ANIMATION_SPEC.md)。本文只讲制作源本身。

## 文件分工

- `data/battle_skeleton.base.json`：原版兼容骨架与插槽基线。由现有已验收定义提取，保持原部位名称、注册点与层序。
- `data/battle_skeleton.authoring.json`：手工制作源，默认空覆盖。以后修改骨骼与视觉轨道请编辑这里，而非生成产物。
- `data/battle_skeleton.json`：游戏读取的生成产物；包含原版 40 段动画、附件、图集索引和运输动画。
- `tools/animation_authoring.mjs`：离线校验、合并工具；不进入游戏运行时。

在 Web 工程目录执行：

```powershell
# 只读校验，不写动作、PNG 或清单
node public/mods/revival/tools/generate_legacy_tracks.mjs --check

# 从原版帧表重新生成，再应用制作源
npm run generate:battle-animation

# 既有最小回归和构建
npm run test:skeleton
npm run build
```

生成器不再把上次生成结果当作制作源；重复生成保留制作内容，撤销覆盖后重新生成可恢复原版。校验失败会在写图集之前停止，并给出字段路径。未变化的生成数据与清单不会仅因键顺序或换行不同被重写。

## 可以修改什么

制作源格式：

```json
{
  "version": 1,
  "definition": {},
  "animations": {}
}
```

### 骨架与插槽

`definition` 可提供 `bones`、`slots`、`attachments`、`drawOrder`：

- `bones` 与 `slots` **整数组替换**。建议从基线复制，保留未修改的命名和插槽。骨骼支持父子层级、平移、弧度旋转、缩放、枢轴和透明度。
- `attachments` 按名称添加：可引用原版部件的固定帧（如 `{"part":"Body","frame":1}`），也可引用独立图片（如 `{"image":"MyArm.png"}`）。保留 `original:` 命名空间不可覆盖。
- 独立图片先在本 DLC 的 `manifest.json.assets` 登记，例如 `"MyArm.png": "assets/custom/MyArm.png"`；文件也放在 DLC 内。附件里的 `image` 是登记名，不是路径。
- 图片保持原始尺寸；`x/y` 为注册位置，`muzzle:{x,y}` 为可选武器发射点。旋转部件时应一起核对发射点，不能只看贴图。
- `drawOrder:"legacy"` 保留原版方向／阶段层序；`"slots"` 使用插槽 `z`。方向覆盖的键为 `0`、`1`、`2`、`3`。
- 改名或删除插槽后，需要同步修改引用它的各段 `slotTracks`；校验会阻止悬空引用。

### 动画轨道与节奏

`animations` 使用 `idle_0` 至 `death_7` 这 40 个原版片段名（五种阶段 × 八类动作）。每段可提供：

- `tracks`：整组骨骼轨道，支持 `linear` 或 `step` 插值。
- `slotTracks`：整组离散轨道，切换附件、可见性与层次。省略该字段保留原版附件轨道；显式 `[]` 则清空该组。

以下节奏字段同样可由制作源覆盖；省略即沿用 `AnimationData.as` 提取表与 `BattleField.as` 调用规则的默认值：

- `fps`：帧率，必须为正数。原版为 `25`。
- `duration`：片段时长（秒），必须为正数。所有关键帧与事件时间都必须落在 `[0, duration]` 内。
- `loop`：是否循环。原版只有 `walk` 阶段为 `true`。重复由播放器自己负责，因此不会在循环边界重复触发事件。
- `playbackDuration`：动作实际推进的时长，必须大于 0 且不超过 `duration`。原版 hit/death 用它停在末帧之前。
- `finishOnLastFrame`：结束时是否压到末帧。
- `events`：事件数组，元素为 `{"time":秒,"name":"名称"}`，可带 `value`。这是攻击结算、脚步音效与死亡里程碑的真正来源，改这里就是改实际时点。
- `legacyParts`：按类别（`legs`／`body`／`arms`／`weapon`／`shadow`）直接给帧号序列，格式 `{"fps":帧率,"frames":[帧号,…]}`；帧号必须为正整数。

可选字段（`loop`、`playbackDuration`、`finishOnLastFrame`、`events`、`legacyParts`）写 `null` 表示清除该覆盖、回退到运行时默认值——例如把 death 的 `playbackDuration` 设为 `null`，动作就会完整播完而不是提前停在末帧前。

关键帧 `time` 单位为秒；原版每帧 `1/25` 秒。请使用新对象重新生成／加载，不要原地改动运行时缓存数据。

无后缀 `walk` 等别名自动跟随对应 `walk_0` 等片段，不能单独编辑，以免预览与正式动作不一致。

**节奏字段一旦被覆盖，该片段就不再受“与原版逐字段相同”的保护。** 攻击命中、脚步与倒地时点会随 `events`、`duration` 一起改变，逐像素对照也不再是该片段的验收依据；只有默认空覆盖仍必须复现原版输出。作者需要自行确认改动后玩法仍然成立——校验只保证数据能被运行时正确播放，不判断手感与平衡是否合理。

## 示例：复用已有部件，而不是新增逐帧图片

以下仅演示格式，**并未应用于默认游戏动作**：

```json
{
  "version": 1,
  "definition": {
    "attachments": {
      "author:held-weapon": { "part": "Weapon", "frame": 1 }
    }
  },
  "animations": {
    "idle_0": {
      "slotTracks": [
        {
          "slot": "Weapon",
          "keys": [{ "time": 0, "attachment": "author:held-weapon" }]
        }
      ]
    }
  }
}
```

这是整组 `slotTracks` 的替换；其他部位在当前兼容渲染器中仍有原版帧回退。新美术若要完全不依赖旧帧，需要为全部可见部位提供附件，不能把缺少轨道当成已完成纯骨骼重制。

## 验收边界

当前提供的是可重复生成、带错误检查的 JSON 制作流程，**不是图形化时间轴编辑器**。自定义外观应在独立内存 QA 页面 `/mods/revival/qa/battle-parity.html` 验收四方向、首末帧、阴影、装备与发射点；刻意更改外观后，原版逐像素对照不再作为该自定义片段的“必须完全相同”要求。默认空覆盖仍必须保持原版输出。

本次默认覆盖为空，不添加虚构动作、不改分辨率、不新增本体依赖；不能据此宣称所有性能优化或纯骨骼美术重制已完成。
