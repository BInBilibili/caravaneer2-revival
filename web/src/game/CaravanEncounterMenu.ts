// CaravanEncounterMenu：世界地图接敌弹窗（原版 IsoEngine.CaravanEncounterMenu 全 199 行 +
// MapMode.as openDialogue case 2/3，SYSTEM-ROUND77-⑥）
//   - BG 880×495 黑 50%；标题 639/640（你被@groupname@攻击 / 你遇见@groupname@）20px @y10 整宽居中；
//   - 副标题 1425（人数）14px @y40；警告 1426（战斗前装备提示）14px wrap 宽 maxWidth-40 @y80；
//   - 按钮 Button(1) @x20，y=90+warning.textHeight+10 起每行 +40，文本 15px left @x65；
//   - 面板 D=Dialogue(maxWidth, currY+15) 居中 x=325-w/2 y=248-h/2 + drawHorizontalLine(70,0,w)；
//   - 敌对(case2) 4 键 [633 开打 / 635 自动分配弹药并开打 / 1424 装备商旅 / 1435 离开游戏→5637 确认]；
//   - 友好(case3) 5 键 [638 交易 / 636 攻击 / 637 自动分配弹药并攻击 / 1424 装备商旅 / 1266 取消]。
import { Sprite, Graphics } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { addDialogueBackground } from "../core/DialogueBg";
import { Button } from "../core/Ui";
import { sfxClick } from "../core/Sound";
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";

export interface CaravanEncounterMenuHooks {
  /** 开打/攻击：youAttacked=true 表示玩家先动手（636/637），false=被袭击（633/635） */
  onAttack: (youAttacked: boolean) => void;
  /** 自动分配弹药并开打/攻击前分发弹药（原版 player.distributeAmmo()） */
  onAutoAmmo: () => void;
  /** 交易 638 → TradeWindow 易货（openDialogue(6) 语义） */
  onTrade: () => void;
  /** 装备商旅 1424 → 车队目录装备页（原版 setMode(3,3)） */
  onEquip: () => void;
  /** 离开游戏 1435 → YesNo 5637 确认退出 */
  onExitGame: () => void;
  /** 取消 1266 → closeDialogue() 回地图 */
  onCancel: () => void;
}

/** 手动 CJK 断行（引擎 wordWrap 目前只按空格断；中文长警告若整行溢出面板则难看） */
function wrapByChar(text: string, width: number, size: number): string {
  if (width <= 0) return text;
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = size + 'px "Microsoft YaHei","Microsoft JhengHei","Noto Sans SC","SimHei",Arial,sans-serif';
  const out: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (cur && ctx.measureText(cur + ch).width > width) {
      out.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out.join("\n");
}

export class CaravanEncounterMenu extends Sprite {
  /** 冒烟探针：当前打开的按钮（屏幕绝对中心 + 尺寸 + 本地化文本） */
  buttons: Array<{ label: string; x: number; y: number; w: number; h: number }> = [];
  private npc: any = null;
  private hostile = false;

  constructor(
    private ds: DataStore,
    private assets: AssetStore,
    private hooks: CaravanEncounterMenuHooks,
  ) {
    super();
  }

  private text(id: number) { return getText(this.ds, id, this.ds.language); }

  open(npc: any, hostile: boolean) {
    this.npc = npc;
    this.hostile = hostile;
    this.buttons = [];
    this.removeAll();

    // 黑幕（原版 BG 880×495 黑 50%）
    const bg = new Sprite();
    const bgG = new Graphics();
    bgG.beginFill(0, 0.5);
    bgG.drawRect(0, 0, 880, 495);
    bg.graphics = bgG;
    this.addChild(bg);

    // 标题（639 你被@groupname@攻击 / 640 你遇见@groupname@）20px @y10 整宽居中
    const title = new EngineText(
      (hostile ? this.text(639) : this.text(640)).replace("@groupname@", npc.name ?? "").toUpperCase(),
      16777215, 20, "center", 0, 10, 880, 28,
    );
    // 副标题（1425 人数）14px @y40（人数=车队 People 数，原版 group.People.length）
    const sub = new EngineText(
      this.text(1425) + ": " + (npc.People?.length ?? npc.squad?.people?.length ?? npc.people?.length ?? npc.defenders ?? 0), // 原版 group.People.length：遭遇车队成员在 squad.people（EnemyPersonSpec[]），npc.people 仅自由民车队使用
      16777215, 14, "center", 0, 40, 880, 20,
    );

    // 按钮定义（友好 case3：交易先，攻击/自动分配在后；敌对 case2：开打/自动分配）
    const canTrade = !hostile && (typeof npc.canTrade === "function" ? npc.canTrade() : true);
    const defs: Array<{ label: string; ammo: boolean; youAttacked: boolean; kind: "attack" | "trade" | "equip" | "exit" | "cancel" }> = [];
    if (canTrade) defs.push({ label: this.text(638).toUpperCase(), ammo: false, youAttacked: false, kind: "trade" });
    if (hostile) {
      defs.push({ label: this.text(633).toUpperCase(), ammo: false, youAttacked: false, kind: "attack" });       // 开打
      defs.push({ label: this.text(635).toUpperCase(), ammo: true, youAttacked: false, kind: "attack" });        // 自动分配弹药并开打
      defs.push({ label: this.text(1424).toUpperCase(), ammo: false, youAttacked: false, kind: "equip" });       // 装备商旅
      defs.push({ label: this.text(1435).toUpperCase(), ammo: false, youAttacked: false, kind: "exit" });        // 离开游戏
    } else {
      defs.push({ label: this.text(636).toUpperCase(), ammo: false, youAttacked: true, kind: "attack" });        // 攻击
      defs.push({ label: this.text(637).toUpperCase(), ammo: true, youAttacked: true, kind: "attack" });         // 自动分配弹药并攻击
      defs.push({ label: this.text(1424).toUpperCase(), ammo: false, youAttacked: false, kind: "equip" });       // 装备商旅
      defs.push({ label: this.text(1266).toUpperCase(), ammo: false, youAttacked: false, kind: "cancel" });      // 取消（原版 1266 启程出发/取消）
    }

    // 面板宽度：max(标题 textWidth+40, 副标题 textWidth+40, 各按钮文本 textWidth+85)
    let maxWidth = Math.max(title.textWidth + 40, sub.textWidth + 40);
    const btnLabels: EngineText[] = [];
    for (const d of defs) {
      const t = new EngineText(d.label, 16777215, 15, "left", 0, 0, 600, 20);
      btnLabels.push(t);
      maxWidth = Math.max(maxWidth, t.textWidth + 85);
    }
    maxWidth = Math.max(220, Math.round(maxWidth));

    // 警告（1426）14px wrap 宽 maxWidth-40 @y80（面板构建顺序：先测量 textHeight 再定 y0）
    const warnText = wrapByChar(this.text(1426), maxWidth - 40, 14);
    const warning = new EngineText(warnText, 16777215, 14, "center", 0, 80, Math.max(120, maxWidth - 40), 120, true, true);

    // 按钮 y：90+warning.textHeight+10 起每行 +40（原版 CaravanEncounterMenu）
    const y0 = 90 + warning.textHeight + 10;
    const panelW = maxWidth;
    const panelH = Math.round(y0 + (defs.length - 1) * 40 + 30 + 15); // currY+15
    const D = new Sprite();
    addDialogueBackground(D, this.assets, 0, 0, panelW, panelH, 0.1, "InterfaceBackground.png", false); // 原版 Dialogue 底=InterfaceBackground（锈金属深棕）；非 TownBG 浅色
    D.x = Math.round(325 - panelW / 2);
    D.y = Math.round(248 - panelH / 2);
    this.addChild(D);

    // 分隔线（原版 drawHorizontalLine(70,0,w)）
    const line = new Sprite();
    const lg = new Graphics();
    lg.lineStyle(1, 8222317, 0.85);
    lg.moveTo(0, 70);
    lg.lineTo(panelW, 70);
    line.graphics = lg;
    line.mouseEnabled = false;
    D.addChild(line);

    // 标题/副标题/警告移入面板容器（原版 D.addToMask(title/subTitle/warning)：文本随 Dialogue 面板，
    // 原版 CaravanEncounterMenu.as L95-98：title y=10、subTitle y=40，构造后 title.width=subTitle.width=D.dialogueWidth；
    // warning.x=D.dialogueWidth/2-warning.width/2 居中于面板宽。此前挂在 CEM 全屏根导致文字跑到面板外）
    title.width = panelW;
    sub.width = panelW;
    warning.x = panelW / 2 - (warning.width ?? 0) / 2;
    D.addChild(title);
    D.addChild(sub);
    D.addChild(warning);

    // 按钮：Button(1) 系统按钮 + 自绘 15px left 文本 @x65（原版文本不进 Button 内置样式）
    defs.forEach((d, i) => {
      const b = new Button(1, () => {

        switch (d.kind) {
          case "attack":
            if (d.ammo) this.hooks.onAutoAmmo();
            this.hooks.onAttack(d.youAttacked);
            break;
          case "trade": this.hooks.onTrade(); break;
          case "equip": this.hooks.onEquip(); break;
          case "exit": this.hooks.onExitGame(); break;
          case "cancel": this.hooks.onCancel(); break;
        }
      }, null, this.assets);
      b.x = 20;
      b.y = y0 + i * 40;
      D.addChild(b);
      const raw: any = b;
      const w = raw.releasedImg?.width ?? 200;
      const h = raw.releasedImg?.height ?? 30;
      const label = new EngineText(d.label, 16777215, 15, "left", 65, 0, panelW - 85 - 20, 20);
      label.y = b.y + 17 - label.textHeight / 2; // 原版 textObjects[i].y=currY+17-textHeight/2
      label.mouseEnabled = false;
      D.addChild(label);
      this.buttons.push({ label: d.label, x: D.x + b.x, y: D.y + b.y, w, h });
    });

    this.visible = true;
  }
}
