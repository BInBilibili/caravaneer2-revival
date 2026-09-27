# Caravaneer 2 Web DLC/Mod

每个模组的目录结构约定：

```text
mod-name/
  manifest.json          # 模组入口，保留在根目录
  data/                  # 数据 JSON（包括 asset-manifest.json）
  images/
  sounds/
  description.html
  description.ZHS.html
  description.ZHT.html
```

`manifest.json` 的 `data` 路径相对于模组根目录，例如 `data/items.json`。
图片、音效和描述中的资源路径仍相对于模组根目录，不要额外添加 `data/`。

安装 Web 模组无需专用导入脚本，也无需手动登记索引：

- `npm run dev`：放入 `web/public/mods/<模组名>/` 后刷新游戏，自动发现根目录的 `manifest.json`。
- `npm run preview`：自动扫描 `web/dist/mods/`，放入文件夹后刷新即可。
- 纯静态托管：构建时自动生成 `dist/mods/index.json`。发布后增加模组需要重新构建发布，或更新服务器提供的索引；浏览器自身不能枚举服务器文件夹。

自动发现包括停用的模组；是否启用仍由 DLC 页面与已有设置决定。
清单必须有非空 `id` 和字符串 `version`。损坏的清单和非模组目录会跳过。
示例：

```json
{
  "id": "desert-expansion",
  "version": "1.0.0",
  "priority": 100,
  "data": {
    "items": "data/items.patch.json",
    "texts": "data/texts.patch.json"
  },
  "assets": { "TownBG.jpg": "assets/TownBG.jpg" }
}
```

数据对象支持递归覆盖、`$replace`、`$delete` 和数组 `$append`。脚本入口只有在 URL 参数 `?allowModScripts=1` 或 localStorage `c2:allowModScripts=1` 时才执行。
`dependencies` 支持 Mod ID 数组；依赖会先于当前 Mod 加载。`priority` 只影响没有依赖关系的 Mod。浏览器控制台可通过 `window.__c2ModApi.list()`、`enable(id)`、`disable(id)` 查看和切换启用状态，切换后请重新载入页面。
