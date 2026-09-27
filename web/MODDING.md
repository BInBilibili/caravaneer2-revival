# DLC / Mod 运行时架构

启动时会读取 `public/mods/index.json`。每个条目可以是 manifest URL，也可以是内联 manifest：

```json
{
  "mods": ["mods/desert-expansion/mod.json"]
}
```

Manifest 支持 `priority`、`dependencies`、`data`、`assets` 和可选 `entry`。数据补丁按优先级依次合并，支持 `$replace`、`$delete`、`$append`。资源覆盖通过资源名匹配，因此可以替换本体图片、音效和字体。

脚本 Mod 的入口导出 `default(api)` 或 `register(api)`。只有显式打开 `?allowModScripts=1` 或设置 `c2:allowModScripts=1` 才会执行脚本。

```js
export default(api) => {
  api.on("game:new", ({ gd }) => { gd.gameSpeed = 2; });
  api.registerRule("economy.price", ({ base }) => base() * 0.8);
  api.registerService("factory.battle", (gd, ds, assets, hooks, opts) => new MyBattle(gd, ds, assets, hooks, opts));
};
```

可用事件包括 `game:boot`、`shell:ready`、`game:new`、`game:save`、`game:load`、`world:construct`、`world:mode`、`battle:construct`、`battle:end` 和 `data:ready`。可替换服务包括 `factory.gameData`、`factory.mapMode`、`factory.townMode`、`factory.battle`。

存档会写入启用的 Mod ID/版本。读取时发现清单不一致会提示兼容性风险。
## 依赖与启用状态

`dependencies` 可写成 Mod ID 数组，或 ID 到版本说明的对象。运行时会先加载依赖，再加载依赖它的 Mod；缺失依赖和循环依赖会拒绝加载对应 Mod。`priority` 用于没有依赖关系的 Mod 的加载顺序，数值较低的补丁先应用。

```json
{
  "id": "my-campaign",
  "version": "1.0.0",
  "dependencies": ["my-items"],
  "priority": 50
}
```

开发者控制台提供 `window.__c2ModApi.list()`、`enable(id)` 和 `disable(id)`。启用状态保存在浏览器本地存储中；变更后应重新载入页面或开始新游戏。

## 安装包边界

当前 `installFile(file)` 接受顶层含 `manifest` 的 JSON 开发包。`.c2mod` ZIP 文件会明确提示先解包到 `public/mods`，不会假装安装成功。
