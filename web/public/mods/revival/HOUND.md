# 生成贴图猎犬

素材由内置 imagegen 根据原版人物和动物战场截图生成。原来的程序绘制猎犬和每场自动赠送伙伴已撤回，备份位于项目 backups/hound-procedural-rejected。

开发服务器打开 `/mods/revival/qa/hound-battle.html`，点击开始临时战斗。可控制猎犬移动、扑咬原版人物，测试受击及死亡，并切换毛色。本场景不读写存档。

资源目录 `assets/hound/`：generated-source.png 是生成原图；hound-atlas.png 是 8 列 × 20 行，每格 100×100。猎犬没有待机动画，停下时固定显示奔跑第 1 帧；其余动作分组为奔跑、扑咬、受击、死亡，每组东北、东南、西南、西北。左向由对应右向逐帧镜像。正面受击取生成倒地序列的前段回弹。

hound-color-mask.png 使用 RGB 权重，运行时复用原版 tintCanvas 的三色矩阵，保留明暗和透明度。loadHoundVisual 返回 bind、setColor、unitVisual、unitAnimation，可通过战斗 opts 接入；已注册 battle.houndVisual 服务。伙伴招募与世界遭遇尚未新增。

生成提示：参考原版截图右侧 NPC/动物的低饱和写实等角明暗，生成肌肉结实、短灰褐毛猎犬，透明背景、8帧动作、东南/东北真实不同视角、奔跑/扑咬/受击/侧躺死亡，固定比例与落脚点，无文字、网格、背景。
