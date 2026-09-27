// 对话界面：角色名 + 肖像 + 正文 + 条件过滤回复（ScrollableArea）+ 回调执行（with(env) 转译）
// 对齐原版 IsoEngine/DialogueScreen.as：
//  - 入口解析：Story.dialogueDefaults 优先，回退 MainStory.defaultDefaults；角色 8/9/18/25 特例
//  - 文本走 getText(ds, id, language, gender)（性别变体 <男/女> + @nl@ + 语言回退）
//  - 关系/默认入口按当前对话角色索引（characterRelations / dialogueDefaults）
//  - waitEffect / refresh / wrongAnswerToMarco / openLocation 经 env 钩子驱动
import { Sprite, Graphics, BitmapObject } from "../core/Display";
import { EngineText } from "../core/EngineText";
import type { DataStore } from "../core/DataStore";
import { getText } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import { GameData } from "./World";
import { Story, makeDialogueEnv, transpileAs3Fn } from "./Story";
import { ScrollableArea } from "../core/Ui";
import { sfxClick } from "../core/Sound";
import { TradeWindow } from "./TradeWindow";
import { HealingFacility } from "./HealingFacility";
import { buildPortraitFromCharacter } from "./Portrait";

export class DialogueScreen {
  readonly screen = new Sprite();
  /** t64 ①：关闭后的追加回调（碉堡开场布拉斯对话关闭 → 回世界地图 + Rovers 刷新；Shell.showEventDialogue 设置） */
  extraOnClose: (() => void) | null = null;
  private story: Story;
  private env: any;
  private currentEntry = 1;
  private currentChar = 1;
  private waitPending = false;
  private content = new Sprite();
  private blackScreen = new Sprite();
  private tradeWindow: TradeWindow;
  private healingFacility: HealingFacility;
  private waitFrame = 0;
  private waitTarget = 1;
  private waitRemainder = 0;
  private portraitRequest = 0;

  constructor(
    private gd: GameData, private ds: DataStore, private assets: AssetStore,
    private onClose: () => void,
  ) {
    this.screen.addChild(this.content);
    this.tradeWindow = new TradeWindow(gd, ds, assets, () => { this.tradeWindow.screen.visible = false; });
    this.tradeWindow.screen.visible = false;
    this.healingFacility = new HealingFacility(gd, ds, assets);
    this.screen.addChild(this.tradeWindow.screen);
    this.screen.addChild(this.healingFacility.screen);
    const black = new Graphics(); black.beginFill(0); black.drawRect(0, 0, 880, 495);
    this.blackScreen.graphics = black; this.blackScreen.visible = false;
    this.screen.addChild(this.blackScreen);
    this.env = makeDialogueEnv(gd, ds);
    // AS3 with(env) assignments must update the live dialogue, not a global.
    Object.defineProperty(this.env, "currentEntry", {
      get: () => this.currentEntry,
      set: (value: number) => { this.currentEntry = Number(value); },
    });
    this.story = this.env.Story as Story;
    gd.__onDialogueEnd = () => this.close();
    // 回调钩子（with(env) 里的方法调用 → 本屏状态驱动）
    this.env.__onLeave = () => this.close();
    this.env.__onWaitEffect = (entry?: number) => this.doWait(entry);
    this.env.__onRefresh = () => this.show();
    this.env.__onWrongAnswerToMarco = (entry: number) => this.doWrongAnswer(entry);
    this.env.__onOpenLocation = (townId: number, locId: number, entryId?: number) => this.openLocation(townId, locId, entryId);
  }

  private text(id: number, gender = 1) { return getText(this.ds, id, this.ds.language, gender); }

  private playerGender(): number {
    const p = this.gd.Caravans[0]?.People?.[0];
    return p && p.gender === 2 ? 2 : 1;
  }

  // 入口解析：显式 entryId > 角色特例 > Story.dialogueDefaults > MainStory.defaultDefaults > 1
  private resolveEntry(charId: number, entryId?: number): number {
    const s = this.story;
    if (entryId !== undefined && entryId !== null && Number(entryId) > 0) return Number(entryId);
    const hasPurpose = (p: number) => (this.gd.Caravans[0]?.People ?? []).some((x: any) => x.specialPurpose === p);
    if (charId === 8 && s.get("youAttackedLois")) return hasPurpose(2) ? 502 : 498;
    if (charId === 18 && (s.characterRelations[18] ?? 0) < -5) return 1093;
    if (charId === 9) {
      if (hasPurpose(2)) return s.get("youAcceptedFarnirsJob") ? 1148 : 1147;
    }
    if (charId === 25) {
      if ((s.specificReputations[7] ?? 0) > 0) return 1691;
      // 原版 DialogueScreen.as:129 = GD.getFactionRelations(0,10)：阵营 0 与阵营 10 的成对关系，
      // 不是 factionRelations 表的下标。story.factionRelations 是三角矩阵，按数字下标读到的是
      // 整行数组而非关系值 ⇒ 必须走 getFactionRelations 才有正确的成对语义。
      if (this.gd.getFactionRelations(0, 10) <= -10) return 1692;
      if (s.dialogueDefaults[25] === 1622 && s.get("noraIsDead")) return 1624;
    }
    const dd = s.dialogueDefaults[charId];
    if (dd !== undefined && dd !== null && Number(dd) > 0) return Number(dd);
    const msd = this.ds.mainStory?.defaultDefaults?.[charId];
    if (msd !== undefined && msd !== null) return Number(msd);
    return 1;
  }

  start(charId: number, entryId?: number) {
    this.screen.visible = true;
    this.waitPending = false;
    this.blackScreen.visible = false;
    this.tradeWindow.screen.visible = false;
    this.healingFacility.screen.visible = false;
    this.currentChar = charId;
    this.env.__dialogueChar = charId;
    // Original Dialogue exposes the current speaker as `character`; DLC
    // conditions use it to distinguish Cricket's and the chairman's branch.
    this.env.character = charId;
    (this.gd as any).__dialogueChar = charId;
    if (this.story.characterRelations[charId] === undefined) this.story.characterRelations[charId] = 0;
    this.currentEntry = this.resolveEntry(charId, entryId);
    this.show();
  }

  // 文本占位符替换：@yourname@/@name@ + 按当前入口的专用占位符（对齐原版 refresh 的 replace 链）
  private fill(t: string, respIndex = -1): string {
    const c = this.gd.Caravans[0];
    const s = this.story;
    const flags = s.flags;
    const fmt = (n: number) => Math.round(n).toLocaleString();
    const townName = (id: number | undefined): string => {
      if (id === undefined || id === null) return "?";
      const t = this.gd.Towns[Number(id)];
      return t ? t.name : "?";
    };
    const entry = this.currentEntry;
    const timeStr = (v: number | undefined): string => {
      if (v === undefined || v === null) return "";
      const d = this.gd.makeDate(Number(v));
      return String(d.hh).padStart(2, "0") + ":" + String(d.mm).padStart(2, "0");
    };
    const special: Record<number, Record<string, () => string>> = {
      277: { "@number@": () => String(flags["KukulsPriceForContact"] ?? 0) },
      302: { "@weight@": () => fmt(flags["KukulsPriceForContact"] ?? 0) + " " + this.text(12) },
      358: { "@amount1@": () => fmt(flags["cleaversToBring"] ?? 0), "@amount2@": () => fmt(flags["boltsToBring"] ?? 0) },
      364: { "@time@": () => timeStr(flags["meetLoisTime"]) },
      1440: { "@townname@": () => townName(flags["escortWFMCaravanTo"]) },
      1442: { "@money@": () => fmt(flags["wfmReward"] ?? 0) + " €" },
      1449: { "@name@": () => this.text(Number(flags["wfmDeliverCharacterName"] ?? 0)), "@town@": () => townName(flags["wfmDeliverToTown"]) },
      1450: { "@name@": () => this.text(Number(flags["wfmDeliverCharacterName"] ?? 0)), "@town@": () => townName(flags["wfmDeliverToTown"]) },
      1944: { "@money@": () => fmt(flags["warehousePrice"] ?? 0) + " €" },
      2052: { "@town1@": () => townName(flags["qgMissionTown1"]), "@town2@": () => townName(flags["qgMissionTown2"]) },
      2055: { "@town1@": () => townName(flags["qgMissionTown1"]), "@town2@": () => townName(flags["qgMissionTown2"]) },
      2053: { "@townname@": () => townName(flags["qgMissionTown1"]) },
      2054: { "@townname@": () => townName(flags["qgMissionTown1"]) },
      2056: { "@townname@": () => townName(flags["qgMissionTown1"]) },
      2057: { "@townname@": () => townName(flags["qgMissionTown1"]) },
      2058: { "@townname@": () => townName(flags["qgMissionTown1"]) },
      2059: { "@townname@": () => townName(flags["qgMissionTown1"]) },
      2060: { "@money@": () => fmt(flags["qgMissionCashReward"] ?? 0) + " €" },
      471: { "@money@": () => fmt(flags["priceToFreeOlaf"] ?? 0) + " €" },
      1022: { "@money@": () => fmt(c.money) + " €" },
      1317: { "@number@": () => String(flags["janubiBanditsToKill"] ?? 0) },
      1950: { "@money@": () => fmt(respIndex === 2 ? (flags["warehousePrice"] ?? 0) * 2 : (flags["warehousePrice"] ?? 0)) + " €" },
    };
    const map = special[entry] ?? {};
    // @name@ belongs to delivery missions, not the player; only @yourname@ is global.
    let out = t.replace(/@yourname@/g, c.People?.[0]?.name || "Hero");
    for (const [tok, fn] of Object.entries(map)) out = out.split(tok).join(fn());
    return out
      .replace(/@number@/g, "0")
      .replace(/@points@/g, "0")
      .replace(/@amount@/g, "0");
  }

  private checkCondition(cond: any): boolean {
    if (!cond || !cond.__as3fn) return true;
    try {
      const fn = transpileAs3Fn(cond.__as3fn);
      return !!fn(this.env);
    } catch {
      return true;
    }
  }

  // 原版对话 UI 常量（DialogueScreen.as）：contentWidth=270 textShift=10 roundness=15 maxQuestionSize=400
  private static readonly CONTENT_W = 270;
  private static readonly TEXT_SHIFT = 10;
  private static readonly ROUND = 15;
  private static readonly MAX_Q = 400;
  private static readonly BUBBLE_FILL = 15062684; // 回复气泡底色（0xE5D69C 浅米）

  // 原版气泡：圆角矩形（局部 -10..w-10, -10..h-10）+ 右侧尾巴（指向场景中心 440,120）
  private drawBubble(g: Graphics, w: number, h: number, fillColor: number, alpha: number, tail = false) {
    const round = DialogueScreen.ROUND;
    g.lineStyle(2, 0, 0.5);
    g.beginFill(fillColor, alpha);
    const x0 = -10, y0 = -10, x1 = w - 10, y1 = h - 10;
    const mid = (y0 + y1) / 2;
    g.moveTo(x1 - round, y0);
    g.curveTo(x1, y0, x1, y0 + round);
    if (tail) {
      g.lineTo(x1, mid - 5);
      const ang = Math.atan2(440 - x1, 120 - mid);
      g.lineTo(x1 + Math.sin(ang) * 20, mid + Math.cos(ang) * 20);
      g.lineTo(x1, mid + 5);
    }
    g.lineTo(x1, y1 - round);
    g.curveTo(x1, y1, x1 - round, y1);
    g.lineTo(x0 + round, y1);
    g.curveTo(x0, y1, x0, y1 - round);
    g.lineTo(x0, y0 + round);
    g.curveTo(x0, y0, x0 + round, y0);
    // Canvas fills open paths, but does not stroke the implicit closing edge.
    g.lineTo(x1 - round, y0);
    g.endFill();
  }

  private show() {
    this.content.removeAll();
    this.content.graphics = null;
    const S = this.content;
    const charId = this.currentChar;
    const entry = this.ds.dialogues.entries[String(this.currentEntry)];
    if (!entry) { this.close(); return; }
    const gender = this.playerGender();
    const cw = DialogueScreen.CONTENT_W, ts = DialogueScreen.TEXT_SHIFT;
    // 背景：原版 Dialogue{character}.png（角色场景）；缺失回退黑底 + 肖像（t48 公共管线）
    const bgImg = this.assets.getImage("Dialogue" + charId + ".png");
    if (bgImg) {
      S.addChild(new BitmapObject(bgImg));
    } else {
      const g = new Graphics();
      g.beginFill(0, 0.92);
      g.drawRect(0, 0, 880, 495);
      S.graphics = g;
      const charName = this.text(Number(this.ds.dialogues.characterNames[String(charId)] ?? 497), gender);
      S.addChild(new EngineText(charName.toUpperCase(), 13158600, 16, "center", 0, 18, 880, 22));
      const port = buildPortraitFromCharacter(this.assets, { charId, name: charName, gender, age: 30 }, 0.22);
      port.x = 30; port.y = 60;
      S.addChild(port);
      const request = ++this.portraitRequest;
      void this.assets.ensure("Dialogue" + charId + ".png").then((im) => {
        if (im && request === this.portraitRequest && this.screen.visible && this.currentChar === charId) this.show();
      });
    }
    // 问题气泡（原版：白底圆角 + 尾巴 @(20,20)，黑字 13 居中）
    const qText = this.fill(this.text(entry.text ?? 0, gender));
    const qProbe = new EngineText(qText, 0, 13, "left", 0, -1, cw, 2000, true, true);
    const qTall = qProbe.textHeight > DialogueScreen.MAX_Q;
    const qW = qTall ? cw - 15 : cw;
    const qTxt = qTall ? new EngineText(qText, 0, 13, "left", 0, -1, cw - 20, 2000, true, true) : qProbe;
    qTxt.x = qW / 2 - qTxt.textWidth / 2;
    if (qTall) qTxt.x -= 7.5;
    const qBubble = new Sprite();
    const qg = new Graphics();
    this.drawBubble(qg, cw + ts * 2, Math.min(qTxt.textHeight, DialogueScreen.MAX_Q) + ts * 2, 16777215, 0.9, true);
    qBubble.graphics = qg;
    qBubble.x = ts + 10; qBubble.y = ts + 10;
    if (qTall) {
      const questionArea = new ScrollableArea(cw, DialogueScreen.MAX_Q, cw, DialogueScreen.MAX_Q, true, false, true, 2, 10);
      qTxt.y = 1;
      questionArea.addContent(qTxt);
      qBubble.addChild(questionArea);
    } else qBubble.addChild(qTxt);
    S.addChild(qBubble);
    // 回复气泡（原版：右侧浅米圆角气泡，自底向上堆叠；ScrollableArea(295,495)）
    const responses: number[] = entry.responses ?? [];
    const areaW = cw + ts * 2 + 5;
    const area = new ScrollableArea(areaW, 495, areaW, 495, true, false, true, 2, 10);
    let needScroll = false;
    let yPos = 495;
    let shown = 0;
    for (let i = responses.length - 1; i >= 0; i--) {
      const rid = responses[i];
      const r = this.ds.dialogues.responses[String(rid)];
      if (!r) continue;
      if (r.conditions && !this.checkCondition(r.conditions)) continue;
      const rt = r.value?.text ? this.fill(this.text(r.value.text, gender), i) : this.text(6838, gender).toUpperCase();
      const txt = new EngineText(rt, 0, 13, "left", -2, -1, cw, 455, true, true);
      const h = txt.textHeight + ts * 2;
      yPos -= h;
      if (shown) yPos -= 10;
      const disp = new Sprite();
      const bg = new Graphics();
      this.drawBubble(bg, cw + ts * 2, h, DialogueScreen.BUBBLE_FILL, 0.9);
      bg.hitRect(-10, -10, cw + ts * 2, h);
      disp.graphics = bg;
      Object.assign(disp, { height: h });
      disp.addChild(txt);
      disp.x = 10;
      disp.y = yPos;
      disp.buttonMode = true;
      disp.mouseChildren = false;
      const selRid = rid, selR = r;
      disp.addEventListener("click", () => this.respond(selRid, selR));
      area.addContent(disp);
      if (yPos < 0) needScroll = true;
      shown++;
    }
    if (shown === 0) {
      const txt = new EngineText(this.text(6838, gender).toUpperCase(), 0, 13, "left", -2, -1, cw, 455, true, true);
      const h = txt.textHeight + ts * 2;
      yPos -= h;
      const disp = new Sprite();
      const bg = new Graphics();
      this.drawBubble(bg, cw + ts * 2, h, DialogueScreen.BUBBLE_FILL, 0.9);
      bg.hitRect(-10, -10, cw + ts * 2, h);
      disp.graphics = bg;
      disp.addChild(txt);
      disp.x = 10; disp.y = yPos;
      disp.buttonMode = true;
      disp.mouseChildren = false;
      disp.addEventListener("click", () => this.close());
      area.addContent(disp);
    }
    // 原版 ScrollableArea 会处理负坐标；Web 只按非负内容计算范围，先归一再滚到底。
    if (yPos < 10) for (const response of area.contentList) response.y += 10 - yPos;
    area.updateSize();
    if (needScroll) area.scroll = -Infinity;
    // 原版：滚动条可见 → x=880-270-20-20=570；否则 580
    area.x = needScroll ? 570 : 580;
    S.addChild(area);

  }

  private respond(rid: number, r: any) {
    if (this.waitPending || this.tradeWindow.screen.visible || this.healingFacility.screen.visible) return;
    sfxClick();
    if (r.actions && r.actions.__as3fn) {
      const fn = transpileAs3Fn(r.actions.__as3fn);
      fn(this.env);
    }
    if (this.waitPending) return; // waitEffect 已接管后续跳转
    const goTo = r.value?.goTo;
    if (goTo !== undefined && goTo !== null && Number(goTo) > 0) {
      this.currentEntry = Number(goTo);
      this.show();
    }
    // goTo == 0 保持当前对话；只有动作 leave() 关闭（原版 clickResponse）。
    void rid;
  }

  private openLocation(townId: number, locId: number, entryId?: number) {
    const town = this.gd.Towns[townId], location = town?.locations[locId];
    if (!town || !location) return;
    this.currentEntry = Number(entryId) > 0 ? Number(entryId) : this.currentEntry;
    this.show();
    if (location.category === 1) {
      this.tradeWindow.show(town, location);
      this.tradeWindow.screen.visible = true;
      this.screen.setChildIndex(this.tradeWindow.screen, this.screen.children.length - 1);
    }
    else if (location.category === 2) this.healingFacility.show(location, town);
    // 原版不把隐藏商店／医生图标永久解锁。关闭设施后仍返回本段对话。
  }

  // 原版 EF：25fps，第20帧全黑并换段，第40帧完成，遮罩阻止等待期间重复选择。
  private doWait(entry?: number) {
    this.waitPending = true;
    this.waitFrame = 0; this.waitRemainder = 0;
    this.waitTarget = Number(entry) > 0 ? Number(entry) : this.currentEntry;
    this.blackScreen.visible = true; this.blackScreen.alpha = 0;
  }

  update(dt: number) {
    if (!this.screen.visible) return;
    if (this.tradeWindow.screen.visible) {
      this.tradeWindow.updateCursor(); this.tradeWindow.updateFrame(dt);
    }
    if (!this.waitPending) return;
    this.waitRemainder += dt * 25;
    while (this.waitRemainder >= 1 && this.waitPending) {
      this.waitRemainder--; this.waitFrame++;
      this.blackScreen.alpha = this.waitFrame < 20 ? this.waitFrame / 20 : (40 - this.waitFrame) / 20;
      if (this.waitFrame === 20) { this.currentEntry = this.waitTarget; this.show(); }
      if (this.waitFrame >= 40) { this.waitPending = false; this.blackScreen.visible = false; }
    }
  }

  // 原版 wrongAnswerToMarco(entry)
  private doWrongAnswer(entry: number) {
    const s = this.story;
    this.env.affectSpecificReputation(2, -1);
    const errs = Number(s.get("marcosTestErrors") ?? 0);
    if (errs > 1) {
      s.set("marcosTestFailed", true);
      this.env.affectSpecificReputation(2, -10);
      this.env.failQuest(9);
      this.currentEntry = 551;
    } else {
      s.set("marcosTestErrors", errs + 1);
      this.currentEntry = Number(entry) || this.currentEntry;
    }
    this.show();
  }

  private close() {
    this.waitPending = false; this.blackScreen.visible = false;
    this.tradeWindow.screen.visible = false; this.healingFacility.screen.visible = false;
    this.screen.alpha = 1;
    this.screen.visible = false;
    this.onClose();
    this.extraOnClose?.();
  }
}
