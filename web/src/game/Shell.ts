import {DlcDialogue} from './DlcDialogue';
import {openOriginalDlcTown} from './Story';
// GameShell：主控类（对应 AS3 Caravaneer2 文档类）
// 屏幕机：1=语言选择 2=标题 6=角色创建(占位) 10=制作人员 11=片头(跳转)
import { Sprite, Graphics, BitmapObject, type DisplayObject, type Tint } from "../core/Display";
import { EngineText } from "../core/EngineText";
import { Game } from "../core/Game";
import { Input } from "../core/Input";
import type { Scene } from "../core/Game";
import type { DataStore } from "../core/DataStore";
import { webText } from "../core/WebTexts";
import { getText } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import { SharedObjectLike } from "../core/SaveStore";
import { setSoundFX, setMusicOn, sfxClick, registerMusic, startMusic, stopMusic, setMusicMode, updateMusic, initMusicAutoPause } from "../core/Sound";
import { Switch, ScrollableArea, Button } from "../core/Ui";
import { GameData } from "./World";
import { factionRelationsFromPresets } from "./factionRelations";
import { MapMode } from "./MapMode";
import { TownMode } from "./TownMode";
import { SaveSlots, applySave, makeSave } from "./SaveSystem";
import { LoadSaveDialogue } from "./LoadSaveDialogue";
import { parseSolFile, solToSaves } from "../core/SolImporter";
import { buildSolFile, buildSolFileCompressed, downloadBlob, saveDataToOriginal } from "../core/SolExporter";
import { CharacterSetupScreen } from "./CharacterSetupScreen";
import { CaravanMenu } from "./CaravanMenu";
import { TradeWindow } from "./TradeWindow";
import { NavigationScreen } from "./NavigationScreen";
import { CaravanSettingsWindow } from "./CaravanSettingsWindow";
import { OptionsMenu } from "./OptionsMenu";
import { IntroCutscene, wrapText, type IntroScene } from "./IntroCutscene";
import { YesNoDialogue } from "./YesNoDialogue";
import { CaravanEncounterMenu } from "./CaravanEncounterMenu";
import { Battle } from "./Battle";
import { encounterOptions } from "./BattleEncounter";
import { openTownBattle } from "./BattleStoryEncounters";
import { DialogueScreen } from "./DialogueScreen";
import type { ModRuntime } from "../core/ModRuntime";

export class GameShell implements Scene {
  readonly currentScreen = new Sprite();
  readonly savedData: SharedObjectLike;
  readonly savedConfig: SharedObjectLike;
  language: number;
  cfg = { soundFXOn: true, musicOn: true };
  screenNum = -1;
  private languagesArea: ScrollableArea | null = null;
  private languageRows: Array<{ disp: Sprite; txt: EngineText; inverse: Sprite; ind: number }> = [];
  private showUnfinished = false;
  private creditsTexts: EngineText[] = [];
  private creditsMoving = false;
  private setToMode = 1;
  private setAutoSave = false;
  private mainScreenDifficulty = 1;
  private theCharacter: any = null;
  private charSetup: CharacterSetupScreen | null = null;
  private countdown = 0;
  private gd: GameData | null = null;
  private mapMode: MapMode | null = null;
  private townMode: TownMode | null = null;
  private gdScreen: "map" | "town" | null = null;
  private lastTownId = -1; // 最近进过的城镇（出镇判定用，原版 setMode 回地图 overTown 检查）
  private autoSaveBox: Sprite | null = null;
  private autoSaveFrames = 0;
  private autoSaveFrameTime = 0;
  private saveSlots!: SaveSlots;
  private saveDlg: LoadSaveDialogue | null = null;
  private saveDlgMode: "save" | "load" = "load";
  private caravanMenu: CaravanMenu | null = null;
  private battle: Battle | null = null;
  private eventDlg: DialogueScreen | null = null;
  private loadSaveOverlay: Sprite | null = null;
  private dlcOverlay: DlcDialogue | null = null;
  private introCutscene: IntroCutscene | null = null;
  private yesNoDlg: YesNoDialogue | null = null;
  private exitConfirmDlg: YesNoDialogue | null = null;
  private encounterMenu: CaravanEncounterMenu | null = null;
  private encSettings: any;
  private encObstacles: any[] | undefined;
  private encNpc: any = null;

  constructor(private ds: DataStore, private assets: AssetStore, private canvas: HTMLCanvasElement, private mods: ModRuntime | undefined = ds.runtime) {
    this.savedData = new SharedObjectLike("savedData", { saves: [] });
    this.savedConfig = new SharedObjectLike("config", {});
    // Original config SharedObject persists the selected language between launches.
    const configuredLanguage = Number(this.savedConfig.data.language);
    const knownLanguage = (this.ds.gamedata?.languages ?? []).some((entry: any) => Number(entry?.ind) === configuredLanguage);
    this.language = knownLanguage ? configuredLanguage : 18;
    if (!knownLanguage) {
      this.savedConfig.data.language = this.language;
      this.savedConfig.flush();
    }
    this.ds.language = this.language;
    this.saveSlots = new SaveSlots(this.savedData);
    this.mods?.events.emit("shell:ready", { shell: this, ds, assets });
    initMusicAutoPause(); // 窗口失焦（切后台）暂停 BGM；回前台地图模式恢复（SYSTEM-ROUND77-⑤）
    // F1：左上角帧率显示开关（任意界面生效；原版无 F1 绑定，无冲突）
    window.addEventListener("keydown", (e) => {
      if (e.key === "F1" || e.keyCode === 112) {
        e.preventDefault();
        Game.showFps = !Game.showFps;
      }
    });
    this.setScreen(2); // 默认直接进标题（语言选择可在标题菜单里改）
  }

  private createGameData(opts: any): GameData {
    const f = this.mods?.service<(ds: DataStore, opts: any) => GameData>("factory.gameData");
    return f ? f(this.ds, opts) : new GameData(this.ds, opts);
  }
  private createMapMode(gd: GameData, hooks: any): MapMode {
    const f = this.mods?.service<(gd: GameData, ds: DataStore, assets: AssetStore, hooks: any) => MapMode>("factory.mapMode");
    return f ? f(gd, this.ds, this.assets, hooks) : new MapMode(gd, this.ds, this.assets, hooks);
  }
  private createTownMode(gd: GameData, town: any, hooks: any): TownMode {
    const f = this.mods?.service<(gd: GameData, town: any, ds: DataStore, assets: AssetStore, hooks: any) => TownMode>("factory.townMode");
    return f ? f(gd, town, this.ds, this.assets, hooks) : new TownMode(gd, town, this.ds, this.assets, hooks);
  }
  private createBattle(gd: GameData, hooks: any, opts: any): Battle {
    const f = this.mods?.service<(gd: GameData, ds: DataStore, assets: AssetStore, hooks: any, opts: any) => Battle>("factory.battle");
    return f ? f(gd, this.ds, this.assets, hooks, opts) : new Battle(gd, this.ds, this.assets, hooks, opts);
  }

  text(id: number, lang?: number) { return getText(this.ds, id, lang ?? this.language); }

  setScreen(num: number) {
    this.gameOverVisible = false;
    this.autoSaveBox = null; this.autoSaveFrames = 0; this.autoSaveFrameTime = 0;
    this.screenNum = num;
    this.mapMode?.destroy();
    this.mapMode = null;
    this.townMode = null;
    this.charSetup?.destroy();
    this.charSetup = null;
    this.caravanMenu = null;
    this.battle?.destroy();
    this.battle = null;
    this.eventDlg = null;
    this.countdown = 0;
    this.gdScreen = null;
    // t81：重复创建新游戏时清除残留的旧 gd 引用及持有旧 gd 的界面对象，
    // 避免二次初始化读 stale 数据（navScreen/caravanMenu/npcTrade/yesNoDlg 等
    // 构造时均捕获 this.gd，二次进入需全新重建）。
    this.gd = null;
    this.yesNoDlg = null;
    this.exitConfirmDlg = null;
    this.encounterMenu = null;
    this.encNpc = null;
    this.npcTrade = null;
    this.navScreen?.destroy();
    this.navScreen = null;
    this.optionsMenu = null; this.settingsWindow = null;
    this.saveDlg = null;
    this.currentScreen.removeAll();
    this.languagesArea = null;
    this.languageRows = [];
    this.loadSaveOverlay = null;
    this.dlcOverlay = null;
    this.introCutscene = null;
    this.creditsMoving = false;
    const S = this.currentScreen;
    switch (num) {
      case 1: this.buildLanguageSelect(); break;
      case 2: this.buildTitle(); break;
      case 4: this.startNewGame(this.setToMode); break;
      case 6: this.buildCharSetup(); break;
      case 7: this.buildGameSetup(); break;
      case 8: this.buildIntro(); break;
      case 10: this.buildCredits(); break;
      case 11: this.buildIntroStub(); break;
      default: this.buildInitStub(num); break;
    }
    void S;
  }

  // ---------- 语言选择（case 1） ----------
  private buildLanguageSelect() {
    const S = this.currentScreen;
    const bg = this.bitmap("TownBG.jpg");
    if (bg) S.addChild(bg);
    S.addChild(new EngineText("PLEASE SELECT YOUR LANGUAGE", 3156000, 20, "center", 10, 30, 860, 30));
    const frame = new Sprite();
    const fg = new Graphics();
    fg.lineStyle(1, 3156000);
    fg.drawRect(0, 0, 600, 350);
    frame.graphics = fg;
    frame.x = 140; frame.y = 80;
    S.addChild(frame);
    const area = new ScrollableArea(590, 350, 590, 350, true, false, false, 10, 10, this.assets); // t92 S1 languages
    area.x = 140; area.y = 80;
    S.addChild(area);
    this.languagesArea = area;
    this.updateLanguageArea();
    const cb = new Switch(5, false, () => this.updateLanguageArea(true), () => this.updateLanguageArea(false), null, null, 10, 10);
    cb.x = 20; cb.y = 460;
    S.addChild(cb);
    S.addChild(new EngineText("Show unfinished languages", 0, 12, "left", 35, 456, 300, 18));
    const proceed = new Sprite();
    const pg = new Graphics();
    pg.beginFill(3156000);
    pg.drawRect(0, 0, 200, 30);
    proceed.graphics = pg;
    // Caravaneer2.as:403: cut the label out of the dark button layer.
    proceed.blendMode = "layer";
    proceed.blendAtDisplayResolution = true;
    const proceedText = new EngineText("PROCEED", 0, 16, "center", 10, 4, 180, 20);
    proceedText.blendMode = "erase";
    proceedText.blendAtDisplayResolution = true;
    proceed.addChild(proceedText);
    proceed.mouseChildren = false;
    proceed.x = 340; proceed.y = 450;
    proceed.buttonMode = true;
    proceed.addEventListener("click", () => {
      sfxClick();
      this.savedConfig.data.language = this.language;
      this.savedConfig.flush();
      this.languagesArea?.remove();
      this.setScreen(2);
    });
    S.addChild(proceed);
  }

  private updateLanguageArea(showAll = false) {
    if (!this.languagesArea) return;
    const area = this.languagesArea;
    area.clearAll();
    this.languageRows = [];
    const langs: Array<any> = this.ds.gamedata?.languages ?? [];
    let y = 0;
    for (const lang of langs) {
      if (!lang.enabled && !showAll) continue;
      const row = new Sprite();
      const label = lang.name.toUpperCase();
      const txt = new EngineText(label, 3156000, 16, "left", 10, 4, 570, 22);
      row.addChild(txt);
      row.y = y;
      const inverse = new Sprite();
      const ig = new Graphics();
      ig.beginFill(3156000);
      ig.drawRect(0, 0, 590, 30);
      inverse.graphics = ig;
      inverse.blendMode = "layer";
      inverse.blendAtDisplayResolution = true;
      const invText = new EngineText(label, 3156000, 16, "left", 10, 4, 570, 22);
      invText.blendMode = "erase";
      invText.blendAtDisplayResolution = true;
      inverse.addChild(invText);
      row.addChild(inverse);
      // Anchor before async loading: never attach late flags to the stage origin.
      const flags = lang.ind === 18 || lang.ind === 19 ? [18, 19] : [lang.ind];
      const flagLayer = new Sprite();
      row.addChild(flagLayer);
      flags.forEach((ind, i) => this.bitmapInto(flagLayer, "flag" + ind + ".png", 550 - (flags.length - 1 - i) * 35, 5));
      row.mouseChildren = false;
      row.buttonMode = true;
      txt.visible = lang.ind !== this.language;
      inverse.visible = lang.ind === this.language;
      const hg = new Graphics();
      hg.hitRect(0, 0, 590, 30);
      row.graphics = hg;
      txt.mouseEnabled = false;
      inverse.mouseEnabled = false;

      row.addEventListener("click", () => this.pressLanguage(lang.ind));
      area.addContent(row);
      this.languageRows.push({ disp: row, txt, inverse, ind: lang.ind });
      y += 30;
    }
    area.updateSize();
  }

  private pressLanguage(ind: number) {
    sfxClick();
    this.language = ind;
    this.ds.language = ind; // 同步 DataStore（所有 text() 查询走 ds.language）
    for (const r of this.languageRows) {
      r.txt.visible = r.ind !== this.language;
      r.inverse.visible = r.ind === this.language;
    }
  }

  // ---------- 标题（case 2） ----------
  private buildTitle() {
    const S = this.currentScreen;
    const bg = this.bitmap("TitleScreen.jpg");
    if (bg) S.addChild(bg);
    S.addChild(new EngineText(this.text(1420).toLowerCase() + " 1.1.3", 3156000, 12, "center", 90, 22, 490, 20));
    // FG 组：暗色前景 + alpha 按钮 + erase 文字（还原 Flash blend 效果）
    const FG = new Sprite();
    FG.blendMode = "layer";
    FG.blendAtDisplayResolution = true;
    this.bitmapInto(FG, "InterfaceForeground.png", 0, 0, { r: 0.28, g: 0.29, b: 0.2 });
    const alphas = new Sprite();
    alphas.blendMode = "alpha";
    alphas.blendAtDisplayResolution = true;
    const clearBmp = new Sprite();
    const cg = new Graphics();
    cg.beginFill(0, 0.01);
    cg.drawRect(0, 0, 880, 495);
    clearBmp.graphics = cg;
    alphas.addChild(clearBmp);
    FG.addChild(alphas);
    const erase = new Sprite();
    erase.blendMode = "erase";
    erase.blendAtDisplayResolution = true;
    FG.addChild(erase);
    S.addChild(FG);

    const items: Array<{ text: string; onClick: () => void }> = [
      { text: this.text(6877).toUpperCase(), onClick: () => { sfxClick(); this.setToMode = 1; this.setAutoSave = false; this.setScreen(6); } },
      { text: this.text(1434).toUpperCase(), onClick: () => { sfxClick(); this.openSaveDlg("load"); } },
      { text: this.text(6878).toUpperCase(), onClick: () => { sfxClick(); this.showDlcStub(); } },
      { text: this.text(6879).toUpperCase(), onClick: () => { sfxClick(); this.setScreen(10); } },
      { text: this.text(6880).toUpperCase(), onClick: () => { sfxClick(); window.open("http://www.gamesofhonor.com/caravaneer_project/instructions/instructions.html", "_blank"); } },
      { text: "CHANGE LANGUAGE", onClick: () => { sfxClick(); this.setScreen(1); } },
      { text: this.text(1344).toUpperCase(), onClick: () => { sfxClick(); window.close(); } },
    ];
    const buttons: Sprite[] = [];
    for (let i = 0; i < items.length; i++) {
      const b = new Sprite();
      const bg2 = new Graphics();
      bg2.beginFill(16711680);
      bg2.drawRect(0, 0, 240, 30);
      b.graphics = bg2;
      b.x = 20; b.y = 167 + i * 41;
      b.buttonMode = true;
      b.addEventListener("click", items[i].onClick);
      alphas.addChild(b);
      buttons.push(b);
      const t = new Sprite();
      t.addChild(new EngineText(items[i].text, 255, 16, "center", 0, 0, 230, 22));
      t.mouseEnabled = false;
      t.x = 25; t.y = 173 + i * 41;
      erase.addChild(t);
      const bright = new Sprite();
      const brg = new Graphics();
      brg.beginFill(16777215, 0.06 * i);
      brg.drawRect(0, 0, 240, 30);
      bright.graphics = brg;
      bright.x = 20; bright.y = 167 + i * 41;
      S.addChildAt(bright, S.getChildIndex(FG));
    }
    void buttons;
    this.addSoundSwitches();
    this.showLoadSaveOverlay(); // 初始隐藏
    this.showDlcOverlay();
  }

  private addSoundSwitches() {
    const S = this.currentScreen;
    const mkIcon = (x: number, y: number, which: "sfx" | "music") => {
      const icon = new Sprite();
      const g = new Graphics();
      g.beginFill(3156000, 0.45);
      g.drawRect(-16, -16, 32, 32);
      g.hitRect(-30, -30, 60, 60);
      icon.graphics = g;
      icon.x = x; icon.y = y;
      icon.buttonMode = true;
      icon.addEventListener("click", () => {
        if (which === "sfx") {
          this.cfg.soundFXOn = !this.cfg.soundFXOn;
          setSoundFX(this.cfg.soundFXOn);
          if (this.cfg.soundFXOn) sfxClick();
        } else {
          this.cfg.musicOn = !this.cfg.musicOn;
          setMusicOn(this.cfg.musicOn);
        }
      });
      S.addChild(icon);
      // 关闭时画叉
      const cross = new Sprite();
      const xg = new Graphics();
      xg.lineStyle(1.5, 0);
      xg.moveTo(-3, -3); xg.lineTo(3, 3);
      xg.moveTo(3, -3); xg.lineTo(-3, 3);
      cross.graphics = xg;
      cross.x = x + 18; cross.y = y;
      cross.visible = which === "sfx" ? !this.cfg.soundFXOn : !this.cfg.musicOn;
      S.addChild(cross);
      return { icon, cross };
    };
    const s1 = mkIcon(840, 45, "sfx");
    const s2 = mkIcon(840, 75, "music");
    this._switchCrosses = { sfx: s1.cross, music: s2.cross };
  }
  private _switchCrosses: { sfx: DisplayObject; music: DisplayObject } | null = null;

  // ---------- 存档/读档浮层（简版） ----------
  private showLoadSaveOverlay() {
    const ov = new Sprite();
    ov.visible = false;
    const g = new Graphics();
    g.beginFill(0, 0.65);
    g.drawRect(0, 0, 880, 495);
    ov.graphics = g;
    const saves: Array<any> = this.savedData.data.saves ?? [];
    const title = new EngineText(this.text(1434).toUpperCase(), 16777215, 20, "center", 0, 120, 880, 30);
    ov.addChild(title);
    const info = saves.length === 0
      ? new EngineText("（无存档）NO SAVES", 11184810, 16, "center", 0, 180, 880, 24)
      : new EngineText(saves.length + " 个存档（加载功能开发中）", 11184810, 16, "center", 0, 180, 880, 24);
    ov.addChild(info);
    const back = new Button(2, () => { ov.visible = false; }, this.text(6811), this.assets);
    back.x = 340; back.y = 300;
    ov.addChild(back);
    this.currentScreen.addChild(ov);
    this.loadSaveOverlay = ov;
  }
  private showLoadSave() {
    if (this.loadSaveOverlay) this.loadSaveOverlay.visible = true;
  }

  // ---------- DLC / Mod 浮层 ----------
  private showDlcOverlay() {
    this.dlcOverlay = new DlcDialogue(this.ds, this.assets, this.mods);
    this.currentScreen.addChild(this.dlcOverlay);
  }
  private showDlcStub() { this.dlcOverlay?.open(); }
  // ---------- 角色创建占位（case 6） ----------
  private buildCharSetup() {
    this.charSetup = new CharacterSetupScreen(this.ds, this.assets, this.canvas, this.theCharacter);
    this.charSetup.onDone = () => { this.theCharacter = this.charSetup!.theCharacter; this.setScreen(7); };
    this.charSetup.onCancel = () => { this.setScreen(2); };
    this.currentScreen.addChild(this.charSetup.screen);
  }

  // ---------- 难度/模式/自动存档/教程（case 7） ----------
  private buildGameSetup() {
    // currentScreen is reused by the world and load flow. Never install a
    // page-local render hook there: removeAll() does not remove that hook.
    const S = new Sprite();
    this.currentScreen.addChild(S);
    const bg = this.bitmap("TownBG.jpg");
    if (bg) S.addChild(bg);
    S.addChild(new EngineText(this.text(6810).toUpperCase() + ":", 3156000, 18, "center", 0, 225, 880, 20));
    const radios: Array<{ disp: Sprite; inner: DisplayObject }> = [];
    for (let i = 0; i < 4; i++) {
      const disp = new Sprite();
      const g = new Graphics();
      g.beginFill(16777215);
      g.lineStyle(2, 6314064);
      g.drawCircle(0, 0, 10);
      g.hitCircle(0, 0, 12);
      disp.graphics = g;
      disp.x = 390;
      disp.y = i < 2 ? 295 + i * 30 : 80 + (i - 2) * 30;
      const circle = new Sprite();
      const cg = new Graphics();
      cg.beginFill(6314064);
      cg.drawCircle(0, 0, 5);
      circle.graphics = cg;
      circle.visible = (i === 0 && this.mainScreenDifficulty === 1) || (i === 1 && this.mainScreenDifficulty === 2) || (i === 2 && this.setToMode === 1) || (i === 3 && this.setToMode === 2);
      disp.addChild(circle);
      const idx = i;
      disp.addEventListener("click", () => {
        sfxClick();
        if (idx === 0) this.mainScreenDifficulty = 1;
        if (idx === 1) this.mainScreenDifficulty = 2;
        if (idx === 2) this.setToMode = 1;
        if (idx === 3) this.setToMode = 2;
        for (let k = 0; k < 4; k++) {
          const c2 = radios[k].inner;
          c2.visible = (k === 0 && this.mainScreenDifficulty === 1) || (k === 1 && this.mainScreenDifficulty === 2) || (k === 2 && this.setToMode === 1) || (k === 3 && this.setToMode === 2);
        }
      });
      S.addChild(disp);
      radios.push({ disp, inner: circle });
    }
    S.addChild(new EngineText(this.text(1606).toUpperCase(), 3156000, 16, "left", 410, 70, 200, 20));
    S.addChild(new EngineText(this.text(7103).toUpperCase(), 3156000, 16, "left", 410, 100, 200, 20));
    S.addChild(new EngineText(this.text(30).toUpperCase(), 3156000, 16, "left", 410, 285, 200, 20));
    S.addChild(new EngineText(this.text(2825).toUpperCase(), 3156000, 16, "left", 410, 315, 200, 20));
    const autoSave = new Switch(5, this.setAutoSave, () => { this.setAutoSave = true; }, () => { this.setAutoSave = false; }, null, null, 20, 20);
    autoSave.x = 380; autoSave.y = 160;
    S.addChild(autoSave);
    S.addChild(new EngineText(this.text(6802).toUpperCase(), 3156000, 16, "left", 410, 160, 200, 20));
    this.showTutorial = true;
    const tutorial = new Switch(5, this.showTutorial, () => { this.showTutorial = true; }, () => { this.showTutorial = false; }, null, null, 20, 20);
    tutorial.x = 380; tutorial.y = 375;
    S.addChild(tutorial);
    S.addChild(new EngineText(this.text(6837).toUpperCase(), 3156000, 16, "left", 410, 375, 200, 20));
    const back = new Button(2, () => { this.setScreen(6); }, this.text(6811).toUpperCase(), this.assets);
    back.x = 227; back.y = 450;
    S.addChild(back);
    const start = new Button(2, () => { this.setScreen(8); }, this.text(6812).toUpperCase(), this.assets);
    start.x = 447; start.y = 450;
    S.addChild(start);
  }

  // ---------- 开场（case 8） ----------
  // 原版 case 8：StoryStartBG 背景 + 文本 1608 + 继续按钮（text 6838）
  // 对齐原版 Caravaneer2.as case 8 + GameData.as case 9
  private buildIntro() {
    // ?????????? case 8 ? countdown ?????6876???????
    // ????? AssetStore ??????????????????????????????
    this.countdown = 0;
    const S = this.currentScreen;
    if (this.setToMode === 1) {
      // ???????? case 9 ???????
      this.buildStoryPage();
    } else {
      // ???????? case 8 ??????????????????????
      this.setScreen(4);
      return;
    }
    this.countdown = 0;
  }

  // 原版叙事页：StoryStartBG 背景 + 文本 1608 居中 + 继续按钮
  // 对齐 GameData.as case 9（L4094-4117）
  private buildStoryPage() {
    const S = this.currentScreen;
    // 背景（含异步 ensure 补挂：首次创建游戏时图片未缓存 → 同步 getImage 为 null，
    // 此前缺 ensure 导致整页黑屏只有按钮 + 黑字不可见）
    const bgImg = this.assets.getImage("StoryStartBG.jpg");
    if (bgImg) {
      const bg = new BitmapObject(bgImg);
      bg.mouseEnabled = false;
      S.addChild(bg);
    }
    void this.assets.ensure("StoryStartBG.jpg").then((im) => {
      if (!im) return;
      const hasBmp = (S.children || []).some((c) => (c as any).image && ((c as any).image.naturalWidth || 0) > 0);
      if (!hasBmp) {
        const bg = new BitmapObject(im);
        bg.mouseEnabled = false;
        S.addChildAt(bg, 0);
      }
    });
    // 文本 1608（原版：introText.y = 220 - introText.textHeight / 2）
    const storyText = this.text(1608);
    const introText = new EngineText(storyText, 0, 16, "center", 30, 40, 820, 400, true, true);
    introText.y = 220 - introText.textHeight / 2;
    S.addChild(introText);
    // 继续按钮（原版：proceedButton at x=340, y=450, 200x30）
    const proceedBtn = new Button(2, () => {

      this.setScreen(4);
    }, this.text(6838).toUpperCase(), this.assets);
    proceedBtn.x = 340;
    proceedBtn.y = 450;
    S.addChild(proceedBtn);
  }

  private showTutorial = true;

  private startIntroCutscene(scenes: IntroScene[], onDone: () => void) {
    const S = this.currentScreen;
    this.introCutscene = new IntroCutscene(scenes, this.assets, onDone);
    S.addChild(this.introCutscene);
  }
  // ---------- 新游戏 → 世界初始化 → 大地图 ----------
  private startNewGame(mode: number) {
    const gd = this.createGameData({
      storyMode: mode === 1,
      difficulty: this.mainScreenDifficulty,
      character: this.theCharacter,
    });
    this.gd = gd;
    gd.autoSave = this.setAutoSave;
    gd.showTutorial = this.showTutorial;
    this.theCharacter = null;
    this.bindWorldCallbacks(gd);
    this.mods?.events.emit("game:new", { shell: this, gd, mode });
    // t64 ①：剧情模式开局即注入 Story（原版 GD.Story 开局存在）——碉堡开场判定需要
    // story 就绪（MapMode.maybeBunkerIntro 检查 gd.story，不在此处则首次接近碉堡无对话）
    if (mode === 1) {
      const StoryCls = (globalThis as any).__c2Story;
      if (StoryCls) gd.story = new StoryCls(this.ds);
    }
    gd.resetProducedToday();
    gd.setMode(1);
  }

  // Runtime callbacks are not serialized: bind them for both new and loaded worlds.
  private bindWorldCallbacks(gd: GameData) {
    gd.onSetMode = (m, ...args) => this.enterGdMode(m, ...args);
    gd.onNotify = (msg) => this.showToast(msg);
    gd.onSalaryDue = (person, approve, refuse) => {
      const speed=gd.gameSpeed;gd.gameSpeed=0;
      const done=(fn:()=>void)=>{fn();gd.gameSpeed=speed;};
      this.yesNoShow(getText(this.ds,1289,this.ds.language,person.gender).replace("@name@",person.name).replace("@money@",person.salary+"€").toUpperCase(),()=>done(approve),()=>done(refuse));
    };
  }

  private enterGdMode(m: number, ...args: any[]) {
    if(m===2){this.startEncounterBattle(...args);return;}
    if (m !== 1 || !this.gd) return;
    this.currentScreen.removeAll();
    this.gdScreen = "map";
    // 原版音乐
    const musicKey = Object.keys(this.ds.manifest.sounds).find((k) => k.includes("Caravaneer2-192KBps"));
    if (musicKey) registerMusic(this.mods?.resolveAsset(musicKey, this.ds.manifest.sounds[musicKey][0]) ?? this.ds.manifest.sounds[musicKey][0]);
    startMusic();
    this.gd.__onEventDialogue = (charId) => this.showEventDialogue(charId);
    this.gd.__onEventEnterTown = (townId) => { this.exitTown(); this.enterTown(townId); };
    this.mapMode?.destroy();
    this.mapMode = this.createMapMode(this.gd, {
      isInputBlocked: () => this.worldFrozen(),
      onEnterTown: (id: number) => this.enterTown(id),
      onOpenMenu: (which: string) => {
        if (which === "save") this.openSaveDlg("save");
        else if (which === "caravan") this.showCaravanMenu();
        else if (which === "options") this.showOptionsPanel();
        else if (which === "settings") this.showCaravanSettings();
        else if (which === "map") this.showNavigation();
        else this.showMenuStub(which);
      },
      onEncounter: (type: number) => this.startBattle(type),
      onNpcCaravan: (id: number, hostile?: boolean) => this.npcCaravanDialog(id, hostile),
      onNotify: (msg: string) => this.showToast(msg),
      onAutoSave: () => this.autoSave(),
      // t64 ①：地图事件对话入口（原版 MapMode.openDialogue(case)；case 8 = 碉堡开场）
      onOpenDialogue: (caseNo: number) => this.openDialogueCase(caseNo),
    });
    this.currentScreen.addChild(this.mapMode.screen);
  }

  private enterTown(id: number) {
    if (!this.gd || !this.mapMode || !this.gd.Towns[id]?.active || this.gdScreen === "town") return;
    if(openOriginalDlcTown(this.gd,this.ds,id,(owner,settings,obstacles)=>this.openEncounter(owner,settings,obstacles,true)))return;
    if (openTownBattle(this.gd,this.ds,id,(owner,settings,obstacles)=>this.openEncounter(owner,settings,obstacles,true))) return;
    this.lastTownId = id;
    // 原版 doEnter（MapMode.as L8068-8076）：进镇时车队坐标吸附到镇坐标 + 停车，
    // 并记录最近交互城镇（出镇后点击同镇先移动开，防立即重进）。
    // 原版 doEnter 首两行即 `Caravans[0].x = Presets.Towns[id].x; Caravans[0].y = Presets.Towns[id].y`，
    // 出镇（Set Sail／啟程出發）从镇坐标继续移动（t82 反馈6：启程时车队坐标须与镇坐标重合）。
    const c = this.gd.Caravans[0];
    const t = this.gd.Towns[id];
    t.discovered = true;
    c.overTown = id;
    c.x = t.x;
    c.y = t.y;
    c.moving = false;
    if (!c.recentlyInteractedTowns.includes(id)) c.recentlyInteractedTowns.push(id);
    this.gdScreen = "town";
    this.mapMode.active = false;
    this.currentScreen.removeAll();
    this.townMode = this.createTownMode(this.gd, this.gd.Towns[id], {
      onExitToMap: () => this.exitTown(),
      onOpenCaravanMenu: () => this.showCaravanMenu(),
      // t64 ③：城镇菜单按钮 5（地图）→ 导航屏覆盖层（原版 setMode(5) NavigationScreen）
      onOpenNavigation: () => this.showNavigation(),
    });
    this.currentScreen.addChild(this.townMode.screen);
  }

  private exitTown() {
    if (this.gdScreen !== "town") return;
    const caravan = this.gd?.Caravans[0];
    if (caravan && this.lastTownId != null) {
      caravan.overTown = this.lastTownId;
      if (!caravan.recentlyInteractedTowns.includes(this.lastTownId)) caravan.recentlyInteractedTowns.push(this.lastTownId);
    }
    if (this.gd?.pauseOnExitTown) {
      if (this.mapMode) this.mapMode.pauseForTownExit();
      else this.gd.gameSpeed = 0;
    }
    this.townMode = null;
    this.gdScreen = "map";
    this.currentScreen.removeAll();
    if (this.mapMode) {
      this.mapMode.active = true;
      this.currentScreen.addChild(this.mapMode.screen);
      this.mapMode.updateControls(0);
    }
    // 主线固定刷新（原版 GameData.as L3529-3539）：第一次离开碉堡(镇15)回地图 →
    // 碉堡→希罗斯镇 之间生成 1 队 Rovers 流浪者（仅一次；story.exitedBunker 置位并随存档持久化）
    // t64 ①：Rovers 只在碉堡开场链完成后才刷新（值星官对话 → 布拉斯对话 → 离镇），
    // 避免开场链未触发（传送到镇15/直接进入）就提前刷出 Rovers；spawnRovers 内部另有 exitedBunker 防重
    if (this.lastTownId === 15 && this.gd?.storyMode) {
      if (!this.gd.story) {
        const StoryCls = (globalThis as any).__c2Story;
        if (StoryCls) this.gd.story = new StoryCls(this.ds);
      }
      const s = this.gd.story;
      const c = this.gd.Caravans?.[0];
      const chainDone = !!s && typeof s.get === "function" && !!s.get("enteredBunkerForTheFirstTime");
      const atBunker = !!(c && c.overTown === 15);
      if (chainDone || atBunker) this.gd.spawnRovers();
      // 新 NPC 精灵由 MapMode.update 按 npcCaravans 惰性补建（见 npcSprites 同步循环）
    }
    if (this.gd?.autoSave) this.autoSave();
  }

  private showTownStub(id: number) {
    if (!this.gd) return;
    const t = this.gd.Towns[id];
    const ov = new Sprite();
    const g = new Graphics();
    g.beginFill(0, 0.72);
    g.drawRect(0, 0, 880, 495);
    ov.graphics = g;
    ov.addChild(new EngineText(t.name.toUpperCase(), 16777215, 22, "center", 0, 130, 880, 34));
    ov.addChild(new EngineText(this.text(22) + " " + t.population + "  |  " + this.text(7) + " (" + Math.round(t.x) + "," + Math.round(t.y) + ")", 11184810, 14, "center", 0, 180, 880, 22));
    ov.addChild(new EngineText("TownMode 城镇模式 — 下一阶段移植", 11184810, 16, "center", 0, 230, 880, 24));
    const back = new Button(2, () => { this.currentScreen.removeChild(ov); }, this.text(6811), this.assets);
    back.x = 340; back.y = 320;
    ov.addChild(back);
    this.currentScreen.addChild(ov);
  }

  private openSaveDlg(mode: "save" | "load") {
    this.saveDlgMode = mode;
    if (!this.saveDlg) {
      this.saveDlg = new LoadSaveDialogue(this.ds, this.assets, this.saveSlots, {
        onSave: (slot, name) => this.doGameSave(slot, name),
        onLoad: (slot) => this.doGameLoad(slot),
        onDelete: (slot) => {
          try { this.saveSlots.deleteSlot(slot); this.saveDlg?.refresh(this.saveDlgMode); }
          catch (error) { console.warn("Save deletion failed", error); this.showToast(webText(this.ds, "saveFailed")); }
        },
        onImport: (slot) => this.importOriginalSol(slot),
        onExport: () => void this.exportCurrentSave(),
        onClose: () => { if (this.saveDlg) this.saveDlg.screen.visible = false; },
      });
      this.currentScreen.addChild(this.saveDlg.screen);
    } else if (this.saveDlg.screen.parent !== this.currentScreen) {
      // setScreen() 的 currentScreen.removeAll() 会摘除 saveDlg.screen，重新挂回显示树
      this.currentScreen.addChild(this.saveDlg.screen);
    }
    // Reopening above the still-visible options panel must put the save dialogue on top.
    if(this.saveDlg.screen.parent===this.currentScreen)this.currentScreen.removeChild(this.saveDlg.screen);
    this.currentScreen.addChild(this.saveDlg.screen);
    this.saveDlg.screen.visible = true;
    this.saveDlg.refresh(mode);
  }

  // 文件保存必须抓取当前游戏，而非导出已经过时的全部槽位；沿用现有 SOL 互通格式。
  private async exportCurrentSave() {
    if (!this.gd) return;
    const data = makeSave(this.gd);
    try {
      const blob = await buildSolFileCompressed([{name:data.name, time:new Date(data.savedAt), save:saveDataToOriginal(data, factionRelationsFromPresets(this.ds))}]);
      downloadBlob(blob, data.savedAt.replace(/[:.]/g, '-') + '.sol');
      this.saveDlg?.close();
    } catch (error) { this.showToast('存档导出失败：' + String(error)); }
  }

  // 导出原版 .sol 存档（全部槽位 → 原版格式文件下载）
  private async exportOriginalSol() {
    const entries = this.saveSlots.list();
    const saves: Array<{ name: string; time: Date; save: any }> = [];
    for (const e of entries) {
      if (!e) continue;
      const data = this.saveSlots.load(e.index);
      if (!data) continue;
      saves.push({ name: data.name, time: new Date(data.savedAt ?? Date.now()), save: saveDataToOriginal(data, factionRelationsFromPresets(this.ds)) });
    }
    if (!saves.length) { this.showToast("没有可导出的存档"); return; }
    // zlib 压缩导出（TCSO 标志 0x0100）：原版 Flash Player 与 SolImporter 均可读；
    // 体积约为未压缩的 50-60%。若需与极端老旧 Flash Player 兼容可回退 buildSolFile()（未压缩）。
    const blob = await buildSolFileCompressed(saves);
    downloadBlob(blob, "Caravaneer2_HTML5_savedData.sol");
    this.showToast("已导出 " + saves.length + " 个槽位为原版 .sol 存档（zlib 压缩）");
  }

  // 导入原版 .sol 存档（SharedObject 文件 → 解析 → 写入槽位）
  private importOriginalSol(slot: number) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".sol";
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const buf = await f.arrayBuffer();
        const parsed = await parseSolFile(buf);
        const saves = solToSaves(parsed);
        if (!saves.length) throw new Error("存档文件中没有可用的槽位");
        const sd = saves[0].save;
        this.saveSlots.importSave(sd, slot);
        this.showToast("已导入原版存档: " + saves[0].name + " (Day " + sd.day + ", " + sd.caravan.money.toLocaleString() + " " + this.text(20) + ")");
        this.saveDlg?.refresh("load");
      } catch (e) {
        this.showToast("导入失败: " + String(e).slice(0, 80));
      } finally {
        document.body.removeChild(inp);
      }
    };
    inp.click();
  }

  private doGameSave(slot: number, name?: string): boolean {
    if (!this.gd) return false;
    try {
      this.saveSlots.save(this.gd, slot, name);
      this.mods?.events.emit("game:save", { shell: this, gd: this.gd, slot });
      this.saveDlg?.close();
      return true;
    } catch (error) {
      console.warn('Manual save failed', error);
      this.showToast(webText(this.ds, 'saveFailed'));
      return false;
    }
  }

  private doGameLoad(slot: number) {
    const data = this.saveSlots.load(slot);
    if (!data) return;
    const active = this.mods?.activeModList() ?? [];
    const saved = (data as any).mods ?? [];
    const mismatch = saved.length > 0 && JSON.stringify(active) !== JSON.stringify(saved);
    if (mismatch) this.showToast("存档使用的 DLC/Mod 与当前启用列表不同，可能产生兼容性问题");
    if (this.gd) {
      applySave(this.gd, data);
    } else {
      this.gd = this.createGameData({
        storyMode: data.storyMode,
        difficulty: data.difficulty,
        character: null,
      });
      applySave(this.gd, data);
    }
    this.bindWorldCallbacks(this.gd);
    this.saveDlg?.close();
    this.mods?.events.emit("game:load", { shell: this, gd: this.gd, data, mismatch });
    this.screenNum = 4; // enterGdMode 不更新 screenNum（标题残留 2），读档后强制地图态
    this.enterGdMode(1);
  }

  private toastOv: Sprite | null = null;
  private toastTime = 0;

  private showToast(msg: string) {
    if (!this.toastOv) {
      this.toastOv = new Sprite();
      const g = new Graphics();
      g.beginFill(0, 0.8);
      g.drawRect(120, 380, 640, 60);
      this.toastOv.graphics = g;
      this.currentScreen.addChild(this.toastOv);
    }
    if (this.toastOv.parent !== this.currentScreen) this.currentScreen.addChild(this.toastOv);
    else this.currentScreen.setChildIndex(this.toastOv, this.currentScreen.children.length - 1);
    this.toastOv.removeAll();
    this.toastOv.addChild(new EngineText(msg, 16777215, 14, "center", 130, 388, 620, 40));
    this.toastOv.visible = true;
    this.toastTime = 3.5;
  }

  // NPC 车队接敌：完全还原原版 CaravanEncounterMenu（SYSTEM-ROUND77-⑥）——
  // 敌对(case2) 4 键 / 友好(case3) 5 键；弹窗打开期间世界冻结（worldFrozen 含 encounterMenu）。
  private npcCaravanDialog(id: number, hostile?: boolean) {
    if (!this.gd) return;
    // t80：按 id 查找而非数组索引——遭遇/剧情动态生成的车队 id ≠ 数组下标，旧写法恒 undefined
    const npc = this.gd.npcCaravans.find((n) => n.id === id) ?? this.gd.npcCaravans[id];
    if (!npc) return;
    this.openEncounter(npc, undefined, undefined, hostile);
  }

  private openEncounter(npc: any, settings?:any, obstacles?:any[], hostile?:boolean) {
    if (!this.encounterMenu) {
      this.encounterMenu = new CaravanEncounterMenu(this.ds, this.assets, {
        onAttack: (youAttacked) => this.encounterAttack(youAttacked),
        onAutoAmmo: () => this.gd?.Caravans?.[0]?.distributeAmmo?.(),
        // Original MapMode keeps CaravanEncounterMenu underneath TradeWindow.
        // Only hide the encounter after the trade window has been built successfully;
        // otherwise a construction error must not leave the encounter frozen and invisible.
        onTrade: () => {
          if (this.openNpcTrade(this.encNpc) && this.encounterMenu) {
            this.encounterMenu.visible = false;
          }
        },
        onEquip: () => { this.showCaravanMenu(3); }, // 原版 CaravanEncounterMenu「caravan menu」= setMode(3,3)（MapMode.as L106），遭遇对话保留在栈上；关闭车队目录(setMode(0))自动恢复遭遇菜单。早先 unfreezeEncounter() 会永久关掉它
        onExitGame: () => this.confirmExitGame(), // 原版 1435 → YesNo 5637
        onCancel: () => this.unfreezeEncounter(), // 原版 1266 closeDialogue()
      });
    }
    this.encNpc = npc;
    this.encSettings = settings; this.encObstacles = obstacles;
    if (this.encounterMenu.parent !== this.currentScreen) this.currentScreen.addChild(this.encounterMenu);
    this.encounterMenu.open(npc, hostile ?? npc.isHostile?.() ?? true);
  }

  /** 接敌菜单关闭但不进战斗（交易/装备商旅/取消）→ 恢复地图运行 */
  private unfreezeEncounter() {
    if (this.encounterMenu) this.encounterMenu.visible = false;
    if (this.mapMode) this.mapMode.battleInProgress = false;
  }

  /** 原版 attackFunction（MapMode.as L113-165）：关系 >=0 → YesNo 1386 双确认；否则按 youAttacked -2/-0.5 */
  private encounterAttack(youAttacked: boolean) {
    const npc = this.encNpc;
    if (!this.gd || !npc) return;
    const rel = this.gd.getFactionRelations(0, npc.faction);
    if (rel >= 0) {
      this.yesNoShow(this.text(1386), () => {
        if (npc.faction > 0) this.gd!.affectFactionRelations(0, npc.faction, 0); // 原版 L328 恒 0
        (this.gd as any).affectSpecificReputation?.(2, 0);
        this.unfreezeEncounter();
        this.startNpcBattle(npc, { youAttacked: true });
      });
    } else {
      if (npc.faction !== undefined) {
        this.gd.affectFactionRelations(youAttacked ? -2 : -0.5, npc.faction, 0);
      }
      this.unfreezeEncounter();
      this.startNpcBattle(npc, { youAttacked });
    }
  }

  private yesNoShow(text: string, onApprove: () => void, onCancel?: () => void) {
    if (!this.yesNoDlg) {
      this.yesNoDlg = new YesNoDialogue(this.ds, this.assets);
      this.yesNoDlg.visible = false;
    }
    if (this.yesNoDlg.parent !== this.currentScreen) this.currentScreen.addChild(this.yesNoDlg);
    else this.currentScreen.setChildIndex(this.yesNoDlg, this.currentScreen.children.length - 1);
    this.yesNoDlg.show(text, onApprove, onCancel);
  }

  // NPC 车队贸易：走原版易货 TradeWindow（Caravan 伙伴 ×2/×0.5 定价、无税）
  private npcTrade: TradeWindow | null = null;
  private openNpcTrade(npc: any): boolean {
    if (!this.gd || !npc) return false;
    try {
      if (!this.npcTrade) {
        this.npcTrade = new TradeWindow(this.gd, this.ds, this.assets, () => {
          if (this.npcTrade) this.npcTrade.screen.visible = false;

          // Original closeDialogue() pops TradeWindow and reveals the encounter
          // dialogue below it. The map remains frozen until the player departs.
          if (this.encounterMenu?.parent === this.currentScreen && this.encNpc) {
            this.encounterMenu.visible = true;
            if (this.mapMode) this.mapMode.battleInProgress = true;
          } else if (this.mapMode) {
            this.mapMode.battleInProgress = false;
          }
        });
      }
      this.npcTrade.showCaravan(npc);
      if (this.npcTrade.screen.parent !== this.currentScreen) {
        this.currentScreen.addChild(this.npcTrade.screen);
      } else {
        this.currentScreen.setChildIndex(this.npcTrade.screen, this.currentScreen.children.length - 1);
      }
      this.npcTrade.screen.visible = true;
      return true;
    } catch (error) {
      console.error("[NPC trade] Failed to open trade window", error);
      if (this.npcTrade) this.npcTrade.screen.visible = false;
      if (this.encounterMenu) this.encounterMenu.visible = true;
      if (this.mapMode) this.mapMode.battleInProgress = true;
      return false;
    }
  }

  private startEncounterBattle(allies?:any[],opponents?:any[],neutral?:any[],settings?:any,obstacles?:any[]) {
    if(!this.gd||this.battle)return;
    const {opts,owners}=encounterOptions(this.gd.Caravans[0],allies??[this.gd.Caravans[0]],opponents??[],neutral??[],settings,obstacles);
    this.unfreezeEncounter();this.gdScreen=null;
    if(this.mapMode){this.mapMode.active=false;this.mapMode.battleInProgress=true;}
    this.battle=this.createBattle(this.gd,{
      onEnd:(win:boolean,loot:number)=>{
        const battle=this.battle;
        if(battle)for(let group=1;group<owners.length;group++){
          const owner=owners[group];if(!owner)continue;
          const members=battle.units.filter(u=>battle.groupOf(u)===group);
          for(const key of ['People','people'])if(Array.isArray(owner[key])){const list=owner[key];list.splice(0,list.length,...list.filter((p:any)=>!members.some(u=>u.character===p&&(u.dead||(u as any).captured))));}
          for(const key of ['transports','Transport'])if(Array.isArray(owner[key])){const list=owner[key];list.splice(0,list.length,...list.filter((tr:any)=>!members.some(u=>u.transportRef===tr&&(u.dead||win&&u.side===1))));}
          if(owner.squad?.slavePeople)owner.squad.slavePeople=owner.squad.slavePeople.filter((p:any)=>!members.some(u=>u.character===p&&(u.dead||(u as any).captured)));
          const specs=members.filter(u=>!u.isTransport&&!u.character);
          if(owner.squad&&specs.length)owner.squad.people=owner.squad.people.filter((spec:any,i:number)=>{
            const unit=specs[i];if(!unit)return true;spec._HP=unit._HP;return !unit.dead;
          });
          const remaining=owner.People??owner.people??owner.squad?.people;
          if(Array.isArray(remaining)&&remaining.length===0){
            owner.active=false; // BattleMode 430–437: only empty caravans disappear.
            const i=this.gd!.npcCaravans.indexOf(owner);if(i>=0)this.gd!.npcCaravans.splice(i,1);
          }
        }
        this.endBattle(win,loot);
      },onExitGame:()=>this.setScreen(2)
    },opts);
    this.currentScreen.removeAll();this.currentScreen.addChild(this.battle.screen);
    (globalThis as any).__c2HideNativeCursor=true;this.canvas.style.cursor='none';
  }

  private startNpcBattle(npc: any, _opts?: { youAttacked?: boolean }) {
    if (!this.gd || !this.mapMode) return;
    if(!npc.squad&&!npc.People&&!npc.people)npc.squad=this.gd.equipRandomCaravan(npc.type??0);
    this.gd.setMode(2,[this.gd.Caravans[0]],[npc],null,this.encSettings,this.encObstacles);
  }

  private endNpcBattle(win: boolean, npc: any, lootCargo: Array<{ item: number; amount: number }>) {
    const battle = this.battle;
    this.battle?.destroy();
    this.battle = null;
    (globalThis as any).__c2HideNativeCursor = false;
    this.canvas.style.cursor = "default";
    this.gdScreen = "map";
    if (win) {
      // ⑦a 战后缴获载具/驮畜（存活 health>0）：并入玩家车队（原版 BattleMode L369-377 缴获 → 商队）
      const captured = battle?.capturedTransports ?? [];
      if (captured.length) {
        const c = this.gd!.Caravans[0];
        for (const tr of captured) c.addTransport(tr);
        this.showToast("战斗胜利，缴获 " + captured.length + " 头牲畜/载具");
      } else {
        this.showToast("战斗胜利，敌人已被击败");
      }
      // 缴获经 loot() 缴获界面结算（钱 Item97 + lootCargo 由战斗侧处理），这里只移除 NPC
      const idx = this.gd!.npcCaravans.indexOf(npc);
      if (idx >= 0) this.gd!.npcCaravans.splice(idx, 1);
    }
    void lootCargo;
    this.currentScreen.removeAll();
    if (this.mapMode) {
      this.mapMode.active = true;
      this.mapMode.battleInProgress = false;
      this.currentScreen.addChild(this.mapMode.screen);
    }
  }

  startBattle(type?: number) {
    if (!this.gd || !this.mapMode || this.battle) return;
    const player = this.gd.Caravans[0];
    const squad = this.gd.equipRandomCaravan(type ?? 0);
    const opponent = { squad, name: squad.name, faction: squad.faction, money: squad.money,
      x: player.x, y: player.y, direction: 0, transports: squad.transports ?? [] };
    this.showToast("遭遇袭击! (" + player.People.length + " vs " + squad.people.length + ")");
    this.gd.setMode(2, [player], [opponent], null);
  }

  private endBattle(win: boolean, loot: number) {
    // 战斗单位存活状态（销毁前读取）+ 状态回写角色
    const b = this.battle;
    const playersAlive = b ? b.units.some((u) => b.groupOf(u) === 0 && !u.dead) : true;
    if (b) {
      const fallen: string[] = [];
      const fallenPeople = new Set<any>();
      for (const u of b.units) {
        if (u.character) {
          u.character._HP = Math.max(0, u._HP);
          u.character.bleeding = u.bleeding;
          u.character.exp = u.exp;
          u.character.legDamage = u.legDamage;
          u.character.armDamage = u.armDamage;
          u.character.eyeDamage = u.eyeDamage;
          // 玩家单位阵亡 → 从队伍移除（永久）
          if (b.groupOf(u) === 0 && u.dead) {
            fallenPeople.add(u.character);
            fallen.push(u.character.name || "?");
          }
        }
      }
      if (fallen.length && this.gd) {
        const c = this.gd.Caravans[0];
        c.People = c.People.filter((p) => !fallenPeople.has(p));
        this.showToast("阵亡: " + fallen.join(", "));
      }
    }
    // ⑦a 战后缴获载具/驮畜（存活 health>0）：并入玩家车队
    if (win) {
      const captured = b?.capturedTransports ?? [];
      if (captured.length && this.gd) {
        const c = this.gd.Caravans[0];
        for (const tr of captured) c.addTransport(tr);
        this.showToast("缴获 " + captured.length + " 头牲畜/载具");
      }
    }
    this.battle?.destroy();
    this.battle = null;
    (globalThis as any).__c2HideNativeCursor = false;
    this.canvas.style.cursor = "default";
    // 败北且全员阵亡 → 游戏结束屏（原版 setMode(6,2724)）
    if (b && this.gd) {
      const c = this.gd.Caravans[0];
      const deadTransports = new Set(b.units.filter((u) => b.groupOf(u) === 0 && u.isTransport && u.dead).map((u) => u.transportRef));
      if (deadTransports.size) c.transports = c.transports.filter((tr: any) => !deadTransports.has(tr));
    }
    if (!win && !playersAlive) {
      this.showGameOver();
      return;
    }
    void loot;
    this.gdScreen = "map";
    this.currentScreen.removeAll();
    if (this.mapMode) {
      this.mapMode.active = true;
      this.mapMode.battleInProgress = false;
      this.currentScreen.addChild(this.mapMode.screen);
    }
    // Original automatic saving is on town/dialogue -> map, not battle -> map.
  }

  gameOverVisible = false; // GameData.setMode(6, 2724)

  private showGameOver(reason = 2724) {
    if (this.gameOverVisible) return;
    this.gameOverVisible = true;
    this.autoSaveFrames = 0;
    this.autoSaveBox?.parent?.removeChild(this.autoSaveBox);
    this.autoSaveBox = null;
    if (this.gd) this.gd.gameSpeed = 0;
    if (this.mapMode) { this.mapMode.active = false; this.mapMode.destroy(); }
    this.toastTime = 0;
    if (this.toastOv) this.toastOv.visible = false;
    Input.cursorOverride = null; Input.syncCursor();
    // GameData.as case 6: opaque stage, title, reason and plain white OK button.
    const ov = new Sprite(), g = new Graphics();
    g.beginFill(0); g.drawRect(0, 0, 880, 495); ov.graphics = g;
    ov.addChild(new EngineText(this.text(6799).toUpperCase(), 0xffffff, 36, "center", 0, 150, 880, 50));
    ov.addChild(new EngineText(this.text(reason), 0xffffff, 14, "center", 80, 200, 740, 200, true, true));
    const back = new Sprite(), bg = new Graphics();
    bg.beginFill(0xffffff); bg.drawRect(0, 0, 200, 30); back.graphics = bg;
    back.addChild(new EngineText("OK", 0, 16, "center", 10, 4, 180, 20));
    back.x = 340; back.y = 400; back.buttonMode = true; back.mouseChildren = false;
    back.addEventListener("click", () => { sfxClick(); this.gameOverVisible = false; this.setScreen(2); });
    ov.addChild(back); this.currentScreen.removeAll(); this.currentScreen.addChild(ov);
  }

  private showEventDialogue(charId: number, extraOnClose?: () => void) {
    if (!this.gd) return;
    if (!this.eventDlg) {
      this.eventDlg = new DialogueScreen(this.gd, this.ds, this.assets, () => {
        if (this.eventDlg) this.eventDlg.screen.visible = false;
        if (this.gdScreen === "map" && this.gd?.autoSave) this.autoSave();
      });
      this.currentScreen.addChild(this.eventDlg.screen);
    } else if (this.eventDlg.screen.parent !== this.currentScreen) {
      // enterTown/exitTown 的 removeAll 会把 eventDlg 从舞台摘掉，重新挂回
      this.currentScreen.addChild(this.eventDlg.screen);
    }
    this.eventDlg.extraOnClose = extraOnClose ?? null;
    this.eventDlg.screen.visible = true;
    this.eventDlg.start(charId);
  }

  // t64 ①：原版 MapMode.openDialogue(case)（web 由地图事件钩子转接）。
  // case 8 = 碉堡开场：值星官对话批准 → enterTown(15)（进入镇15/TownMode）→ 主席布拉斯(角色1)对话。
  // 原版对话关闭走 GD.setMode(cameFromMode)：进镇前 mode=4(TownMode)，setMode(7,1) 记录 cameFromMode=4，
  // 故布拉斯对话结束后回到 TownMode（镇15按钮栏），而非世界地图（反馈4）。
  // Rovers 刷新门仍在 exitTown（玩家之后点「离开」出镇15才触发），不受影响。
  private openDialogueCase(caseNo: number) {
    switch (caseNo) {
      case 8:
        // 主席对话关闭后留在 TownMode（enterTown(15) 已在 maybeBunkerIntro 批准时先行调用）
        this.showEventDialogue(1, () => { /* 留在城镇页 */ });
        break;
      // 其余 case（10-16/19-22 等）与 case 8 同构，后续事件轮按需接入
      default:
        if (this.eventDlg) this.eventDlg.screen.visible = false;
        break;
    }
  }

  private optionsMenu: OptionsMenu | null = null;
  private settingsWindow: CaravanSettingsWindow | null = null;
  private showOptionsPanel() {
    if (!this.gd || (this.optionsMenu?.parent && this.optionsMenu.visible)) return;
    const ov = new OptionsMenu(this.ds,this.assets,{
      save:()=>this.openSaveDlg("save"),load:()=>this.openSaveDlg("load"),exit:()=>this.confirmExitGame(),
      resume:()=>{ov.visible=false;ov.parent?.removeChild(ov);},
      fullscreen: document.fullscreenEnabled ? ()=>{void (document.fullscreenElement?document.exitFullscreen():this.canvas.requestFullscreen()).catch(()=>{});} : undefined,
    });
    this.optionsMenu=ov;this.currentScreen.addChild(ov);
  }
  private showCaravanSettings() {
    if(!this.gd || this.settingsWindow?.parent)return;
    this.settingsWindow=new CaravanSettingsWindow(this.gd,this.ds,this.assets,()=>{this.settingsWindow=null;});
    this.currentScreen.addChild(this.settingsWindow);
  }

  // 退出游戏确认（原版 OptionsMenu.confirmExitDialogue：5637 性别文本 + 是/否）
  private confirmExitGame() {
    if (!this.exitConfirmDlg) {
      this.exitConfirmDlg = new YesNoDialogue(this.ds, this.assets);
      this.exitConfirmDlg.visible = false;
    }
    if (this.exitConfirmDlg.parent !== this.currentScreen) this.currentScreen.addChild(this.exitConfirmDlg);
    else this.currentScreen.setChildIndex(this.exitConfirmDlg, this.currentScreen.children.length - 1);
    const gender = this.gd?.Caravans[0]?.People[0]?.gender ?? 1;
    this.exitConfirmDlg.show(
      getText(this.ds, 5637, this.ds.language, gender).toUpperCase(),
      () => this.setScreen(2),
    );
  }

  private autoSave() {
    if (!this.gd || this.gameOverVisible || !this.gd.Caravans[0]?.People.length || this.autoSaveFrames > 0) return;
    // GameData.waitBox / MapMode.saveNow: render the original notice before
    // serializing synchronously, instead of blocking before the browser can paint.
    const box = new Sprite(), g = new Graphics();
    g.beginFill(14736080); g.lineStyle(0.5, 0); g.drawRect(240, 213, 400, 70); g.endFill();
    g.drawRect(245, 218, 390, 60); g.hitRect(0, 0, 880, 495); box.graphics = g;
    box.addChild(new EngineText(this.text(6800) + '. ' + this.text(770) + '.', 0, 14, 'center', 260, 238, 360, 20));
    box.mouseChildren = false;
    this.autoSaveBox = box; this.autoSaveFrames = 2; this.autoSaveFrameTime = 0; this.currentScreen.addChild(box);
  }

  private flushAutoSave() {
    if (!this.gd || this.gameOverVisible || !this.gd.Caravans[0]?.People.length) return;
    this.saveSlots.saveAutomatic(this.gd, '[' + this.text(1445) + ']');
    this.mapMode?.appendMessage(webText(this.ds, 'autoSaved'));
  }

  private showCaravanMenu(category?: number) {
    if (!this.gd) return;
    if (!this.caravanMenu) {
      this.caravanMenu = new CaravanMenu(this.gd, this.ds, this.assets, {
        onClose: () => { if (this.caravanMenu) this.caravanMenu.screen.visible = false; },
        onSave: () => { if (this.caravanMenu) this.caravanMenu.screen.visible = false; this.openSaveDlg("save"); },
        onOptions: () => this.showOptionsPanel(),
      });
    }
    // currentScreen.removeAll()（进镇/战斗/导航等切换）会把菜单屏摘出显示树 → 重新挂载（同 navScreen 处理）
    if (this.caravanMenu.screen.parent !== this.currentScreen) this.currentScreen.addChild(this.caravanMenu.screen);
    this.caravanMenu.screen.visible = true;
    // Reopen against live inventory; encounters explicitly select equipment.
    this.caravanMenu.setCategory(category ?? this.gd.lastCaravanMenuCategory);
  }

  // 导航屏（原版 GD.setMode(5) NavigationScreen；地图 MAP 开关/N 键）
  private navScreen: NavigationScreen | null = null;
  showNavigation() {
    if (!this.gd) return;
    if (!this.navScreen) {
      this.navScreen = new NavigationScreen(this.gd, this.ds, this.assets, () => {
        if (this.navScreen) this.navScreen.screen.visible = false;
      }, () => {
        if(this.navScreen)this.navScreen.screen.visible=false;
        if(this.gdScreen==="town"){const speed=this.gd!.gameSpeed;this.exitTown();this.gd!.gameSpeed=speed;}
      });
    }
    if (this.navScreen.screen.parent !== this.currentScreen) this.currentScreen.addChild(this.navScreen.screen);
    this.navScreen.screen.visible = true;
    this.navScreen.refresh();
  }

  private showMenuStub(which: string) {
    const names: Record<string, string> = { caravan: "CaravanMenu", options: "Options" };
    const ov = new Sprite();
    const g = new Graphics();
    g.beginFill(0, 0.72);
    g.drawRect(0, 0, 880, 495);
    ov.graphics = g;
    ov.addChild(new EngineText(names[which] ?? which, 16777215, 22, "center", 0, 150, 880, 34));
    ov.addChild(new EngineText("该界面在下一阶段移植（" + which + "）", 11184810, 16, "center", 0, 210, 880, 24));
    const back = new Button(2, () => { this.currentScreen.removeChild(ov); }, this.text(6811), this.assets);
    back.x = 340; back.y = 300;
    ov.addChild(back);
    this.currentScreen.addChild(ov);
  }

  // ---------- 制作人员（case 10，简化版） ----------
  private buildCredits() {
    const S = this.currentScreen;
    const bg = new Sprite();
    const g = new Graphics();
    g.beginFill(0);
    g.drawRect(0, 0, 880, 495);
    bg.graphics = g;
    S.addChild(bg);
    const mk = (t: string, align: "left" | "center" | "right", x: number) => {
      const e = new EngineText(t, 16777215, 14, align, x, 0, 432, 2000, true, true);
      e.y = 495;
      S.addChild(e);
      return e;
    };
    const center = mk(this.text(6886) + ":\n\n" + this.text(6888) + ":\n\n", "center", 0);
    const left = mk(this.text(6885) + ":\n\nDmitry Zheltobriukhov\n\n" + this.text(6887) + ":\n", "right", 0);
    const right = mk("Dmitry Zheltobriukhov\n\nEmilio Pacheco\nJhon Shockley\n\nJohnny Rinaldo\n", "left", 448);
    this.creditsTexts = [left, center, right];
    this.creditsMoving = true;
    // 纯 alpha 掩码（不渲染颜色）：原实现整屏纯红盖住滚动文字；引擎无 mask 裁剪属性，
    // 用 beginFill(0,0) 透明填充使其不可见，滚动文字在黑底上正常显示（画布本身负责视口裁剪）
    const mask = new Sprite();
    const mg = new Graphics();
    mg.beginFill(0, 0);
    mg.drawRect(0, 0, 880, 495);
    mask.graphics = mg;
    mask.mouseEnabled = false;
    S.addChild(mask);
    bg.addEventListener("click", () => { sfxClick(); this.creditsMoving = false; this.setScreen(2); });
  }

  // ---------- 片头过场（case 11，原版 IntroVideo 入口） ----------
  // 原版：启动时播放 IntroVideo（201 帧内嵌动画）→ 标题；Web 版用静态画面+字幕动画过渡
  private buildIntroStub() {
    const S = this.currentScreen;
    this.introCutscene = new IntroCutscene([
      { bg: "StoryStartBG.jpg", text: this.text(1608) },
      { bg: "TitleScreen.jpg", text: this.text(1608) },
    ], this.assets, () => this.setScreen(2));
    S.addChild(this.introCutscene);
  }

  private buildInitStub(num: number) {
    const S = this.currentScreen;
    const bg = new Sprite();
    const g = new Graphics();
    g.beginFill(0);
    g.drawRect(0, 0, 880, 495);
    bg.graphics = g;
    S.addChild(bg);
    S.addChild(new EngineText("SCREEN " + num + "（未移植）", 16777215, 18, "center", 0, 220, 880, 24));
  }

  private bitmap(name: string): BitmapObject | null {
    return this.bitmapInto(this.currentScreen, name);
  }

  private bitmapInto(container: Sprite, name: string, x = 0, y = 0, tint?: { r: number; g: number; b: number }): BitmapObject | null {
    const mk = (im: HTMLImageElement): BitmapObject => {
      const b = new BitmapObject(im);
      b.x = x; b.y = y;
      if (tint) b.colorTransform = { ...tint };
      container.addChildAt(b, 0);
      return b;
    };
    const img = this.assets.getImage(name);
    if (img) return mk(img);
    const screen = this.screenNum;
    void this.assets.ensure(name).then((im) => {
      if (!im || this.screenNum !== screen) return;
      mk(im);
    });
    return null;
  }

  // 原版 setMode(3/5) + dialoguesOpen 语义：打开全屏菜单/导航/存档/剧情对话/NPC 贸易时
  // 世界冻结（地图不推进：无 Time、无移动、无城镇结算、无遭遇、无 NPC 刷新）
  private worldFrozen(): boolean {
    return !!(
      this.autoSaveFrames > 0 ||
      (this.optionsMenu?.visible && this.optionsMenu.parent === this.currentScreen) ||
      (this.settingsWindow?.visible && this.settingsWindow.parent === this.currentScreen) ||
      (this.caravanMenu && this.caravanMenu.screen.visible && this.caravanMenu.screen.parent === this.currentScreen) ||
      (this.navScreen && this.navScreen.screen.visible && this.navScreen.screen.parent === this.currentScreen) ||
      (this.saveDlg?.screen.visible && this.saveDlg.screen.parent === this.currentScreen) ||
      (this.eventDlg?.screen.visible && this.eventDlg.screen.parent === this.currentScreen) ||
      (this.npcTrade?.screen.visible && this.npcTrade.screen.parent === this.currentScreen) ||
      // 接敌弹窗/确认框打开 → 世界时间暂停（原版 dialoguesOpen.length>0 → enterFrame 早退）
      (this.encounterMenu?.visible && this.encounterMenu.parent === this.currentScreen) ||
      (this.yesNoDlg?.visible && this.yesNoDlg.parent === this.currentScreen) ||
      (this.exitConfirmDlg?.visible && this.exitConfirmDlg.parent === this.currentScreen)
    );
  }

  // 音乐模式：原版仅在大地图行进时播放，进入战斗/城镇/菜单/对话都会淡出
  private syncMusic() {
    const wantMap = !!(
      this.gd && this.mapMode && !this.battle && this.gdScreen === "map" &&
      !this.worldFrozen() && this.gd.gameSpeed > 0
    );
    setMusicMode(wantMap ? "map" : "paused");
  }

  update(dt: number) {
    if (this.gameOverVisible) { this.syncMusic(); updateMusic(dt); return; }
    // MapMode.as:808/3307: destroyed player caravan ends play, even when paused.
    if (this.gd && this.mapMode && this.gdScreen === "map" && !this.battle && !this.gd.Caravans[0]?.People.length) {
      this.showGameOver(2723); return;
    }
    if (this.autoSaveFrames > 0) {
      this.autoSaveFrameTime += dt;
      if (this.autoSaveFrameTime < 1 / 25) return;
      this.autoSaveFrameTime -= 1 / 25;
      if (--this.autoSaveFrames === 0) {
        try { this.flushAutoSave(); }
        catch (error) { console.warn('Automatic save failed', error); this.mapMode?.appendMessage(webText(this.ds, 'saveFailed')); }
        finally { this.autoSaveBox?.parent?.removeChild(this.autoSaveBox); this.autoSaveBox = null; }
      }
      return;
    }
    // A scene/modal transition can stop MapMode.update while its old pointer is active.
    if (this.gdScreen !== "map" || this.worldFrozen() || this.battle) {
      Input.cursorOverride = null;
      Input.syncCursor();
    }
    this.syncMusic();
    updateMusic(dt); // 淡入淡出（0.25/s 淡入 / 0.5/s 淡出）
    if (this.toastTime > 0) {
      this.toastTime -= dt;
      if (this.toastTime <= 0 && this.toastOv) this.toastOv.visible = false;
    }
    if (this.screenNum === 8 && this.countdown > 0) {
      this.countdown -= dt; // 以秒计：buildIntro 设 countdown=2 → 2 秒后进地图（原 dt*30 约 66ms 一闪而过）
      if (this.countdown <= 0) this.setScreen(4);
    }
    if (this.battle) {
      this.battle.update(dt); // 战斗期间世界暂停（地图不推进）
    } else if (this.mapMode && this.gdScreen === "map" && !this.worldFrozen()) {
      this.mapMode.update(dt);
      if (!this.gd?.Caravans[0]?.People.length) { this.showGameOver(2723); return; }
    }
    if(this.mapMode && this.gdScreen === "map" && this.worldFrozen())this.mapMode.updateControls(dt);
    if (this.townMode && this.gdScreen === "town") this.townMode.update(dt);
    if (this.eventDlg?.screen.visible && this.eventDlg.screen.parent === this.currentScreen) this.eventDlg.update(dt);
    if (this.introCutscene) this.introCutscene.update(dt);
    if (this.navScreen && this.navScreen.screen.visible) this.navScreen.update(dt);
    if (this.caravanMenu && this.caravanMenu.screen.visible) this.caravanMenu.update(dt);
    // Map encounters create TradeWindow directly under Shell rather than TownMode, so Shell
    // must drive the original enterFrame-equivalent hover panel and calculator animation.
    if (this.npcTrade?.screen.visible && this.npcTrade.screen.parent === this.currentScreen) {
      this.npcTrade.updateCursor();
      this.npcTrade.updateFrame(dt);
    }
    if (this.creditsMoving && this.screenNum === 10) {
      for (const t of this.creditsTexts) t.y -= 70 * dt;
      if (this.creditsTexts[0] && this.creditsTexts[0].y < -2200) {
        for (const t of this.creditsTexts) t.y = 495;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    this.currentScreen.render(ctx);
  }
}
