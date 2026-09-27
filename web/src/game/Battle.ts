// 鎴樻枟绯荤粺锛堝搴斿師鐗?IsoEngine.BattleMode锛?// 鍥炲悎鍒舵垬鏈垬鏂楋細鏍煎瓙鍦板浘 + A* 瀵昏矾 + 鍛戒腑鐜?鎶ょ敳/澹皵/杩戞垬/杩滅▼/浼ゅ彛鍑鸿
import { Sprite, Graphics, BitmapObject } from "../core/Display";
import { Button } from "../core/Ui";
import { addDialogueBackground, DialogueTextMask } from "../core/DialogueBg";
import { EngineText } from "../core/EngineText";
import { getText } from "../core/DataStore";
import { sfxClick, playSound } from "../core/Sound";
import { Character } from "./World";
import { getItemData, itemName } from "./Economy";
import { BattleOptionsWindow } from "./BattleOptionsWindow";
import { TradeWindow } from "./TradeWindow";
import { BattleFieldView, screenToWorld, worldToScreen, YREL, XREL } from "./BattleFieldView";
import { HIT_FRAMES, startWalk, advanceDoll, startPhase, dirFromDelta, dirBetween, newDollAnim, weaponAnimType, DollAnim } from "./BattleDoll";
import { BattleHud } from "./BattleHud";
import { BattleMessages } from "./BattleMessages";
import { visibleWindows, contacts, transportContour, stepGrenade, type Contour } from "./BattleCollision";
import { BattleFlames, flameSegmentHit, type FlameParticle, type FlamePoint } from "./BattleFlames";
import { transportDirection, transportFormation, cartOffset, deploymentRange, deploymentAnchors, facingCenter, findDeploymentCell, occupyDeploymentCell } from "./BattleDeployment";
import { placeObstacles, type FieldObstacle } from "./BattleObstacles";
import { rankModes, shotSequence, panicDanger } from "./BattleAI";
import { Input } from "../core/Input";
import type { DataStore } from "../core/DataStore";
import type { AssetStore } from "../core/Assets";
import type { GameData, EnemySquad, EnemyPersonSpec } from "./World";

/** Additional caravan groups retain independent deployment/ownership and original band numbers. */
export interface BattleGroup {
  band: 1 | 2 | 3;
  name: string;
  position: { x: number; y: number };
  people: Character[];
  direction?: number;
  enemySquad?: EnemySquad;
  cargo?: Array<{item:number;amount:number}>;
  slavePeople?: Character[];
  transports?: any[];
  faction?: number;
}

export interface BattleOpts {
  additionalGroups?: BattleGroup[];
  enemyPeople?: Character[];
  fieldWidth?:number;
  fieldHeight?:number;
  fixedObstacles?: Array<{type:number;gx?:number;gy?:number;x?:number;y?:number}>;
  enemyCount?: number;
  enemyName?: string;
  enemyDirection?: number;
  enemyPosition?: { x: number; y: number };
  groupLocations?: Array<{ x: number; y: number } | undefined>;
  maxRange?: number;
  lootOverride?: number;
  lootCargo?: Array<{ item: number; amount: number }>;
  slavesToCapture?: number;
  /** 杞﹂槦韬唤椹卞姩鐨勬晫鏂硅鏍硷紙World.equipRandomCaravan 浜у嚭锛夛紱闈炵┖鍗充笉浜屾闅忔満 */
  enemySquad?: EnemySquad | null;
  /** 鈶 鎴樺満鐪熷疄濂撮毝锛坋quipRandomCaravan 鐨?slavePeople锛歝ategory=4 鐪熻韩锛涙垬鍚庡叆淇樿幏寮圭獥锛?*/
  slavePeople?: Character[];
  /** 鈶 鏁屾柟杞藉叿/椹暅锛堟垬鍚庡瓨娲诲嵆缂磋幏杩涚帺瀹惰溅闃燂級 */
  enemyTransports?: Array<any>;
  /** 鈶 鏁岃溅闃熼樀钀ワ紙= caravan_types[type].faction锛沷nWin 瑕嗗啓琚繕濂撮毝 faction 鐢級 */
  enemyFaction?: number;
}

export interface BattleHooks {
  onEnd: (victory: boolean, loot: number) => void;
  onExitGame?: () => void;
}

import { newTransportAnimation, startTransportAnimation, type TransportAnimation } from "./BattleTransportAnimation";

export interface DroppedWeapon {
  sub: number;
  ammoType: number;
  ammoAmount: number;
  attachments: number[];
  /** The weapon remains part of the final death pose until picked up. */
  corpse?: BattleUnit;
}

export interface BattleUnit {
  /** 0=friendly, 1=enemy, 2=neutral (AS3 band minus one). */
  side: number;
  /** Group 0 alone is player-controlled; allied caravans have separate groups. */
  groupId?: number;
  groupName?: string;
  name: string;
  faction: number;
  squareX: number;
  squareY: number;
  x: number;
  y: number;
  _HP: number;
  maxHP: number;
  basePhysical: number;
  baseAgility: number;
  baseAccuracy: number;
  baseIntelligence: number;
  weaponItem: number;
  armorItem: number;
  weaponSub: number;
  skill: string;
  AP: number;
  maxAP: number;
  battleMorale: number;
  morale: number;
  bleeding: number;
  burning: number;
  legDamage: number;
  armDamage: number;
  eyeDamage: number;
  dead: boolean;
  /** Lethal hit has started phase 4; occupancy persists until frame 5. */
  dying?: boolean;
  character?: any;
  /** EnemyPersonSpec / fallback appearance used by battlefield doll and HUD portrait. */
  appearance?: any;
  /** Battle-local selection: do not change the save schema for HUD navigation. */
  selectedFirstAidType?: number;
  /** 鎴樺満鐗规畩鐩爣绫诲瀷锛岀敤浜庡姩鐗?杞藉叿鍙楀嚮鍜屾浜￠煶鏁堛€?*/
  transportKind?: "animal" | "transport";
  /** 鍘熷杞﹂槦杩愯緭鍗曚綅锛涙垬鏂楃粨鏉熸椂鎶婄敓鍛藉€煎啓鍥炶瀵硅薄銆?*/
  transportRef?: any;
  transportType?: number;
  transportAnimation?: TransportAnimation;
  transportFootprint?: { width: number; height: number };
  isTransport?: boolean;
  /** Transport sprite column (0..3), updated when the unit moves. */
  facing?: number;
  path: Array<{ x: number; y: number }> | null;
  moveT: number;
  exp: number;
  /** 鏁屾柟鎶€鑳界粡楠岋紙鏃?character 鏃剁敱 EnemyPersonSpec.skillExperience 鐩翠紶锛屼緵 skillExp/closeExp 娑堣垂锛?*/
  skillExperience?: Record<string, number>;
  /** 鈶 鏁屼汉 generalBattleExperience锛坢axAP/dodge 娑堣垂锛泂pec 鐩翠紶锛?*/
  generalBattleExperience?: number;
  /** 鈶 娓叉煋娑堣垂锛歴pec 钀芥。鐨勫瑙傝壊 + 琚栧瀷锛堟晫鏂瑰崟浣嶆棤 character锛岀洿浼犱緵鎴樺満褰㈣薄鐫€鑹诧級 */
  shirtColor?: { r: number; g: number; b: number; bc?: number };
  pantsColor?: { r: number; g: number; b: number; bc?: number };
  skinColor?: { r: number; g: number; b: number; bc?: number };
  sleevesType?: number;
  // ---- 鍘熺増鎴樻枟绯荤粺绉绘锛圔attleField.as / Character.as 鍙屾鍣ㄦЫ + 寮硅嵂锛?---
  /** 鍙屾鍣ㄦЫ锛圛tems 鏁扮粍绱㈠紩锛?=绌猴級銆倃eaponItem 濮嬬粓涓哄綋鍓嶆Ы鍒悕銆?*/
  weaponItems?: number[];
  attachments?: Array<Array<number | null>>;
  /** 褰撳墠姝﹀櫒妲?0|1锛堝師鐗?Character.currSlot锛?*/
  weaponSlot?: number;
  /** 姣忔Ы褰撳墠姝﹀櫒妯″紡绱㈠紩锛堝師鐗?currModes[]锛?*/
  modeIdx?: number[];
  /** 姣忔Ы宸茶濉脊鑽?{type: item id, amount}锛堝師鐗?loadedAmmo[]锛?*/
  loadedAmmo?: Array<{ type: number; amount: number } | null>;
  /** 姣忔Ы缂虹渷寮硅嵂锛堜粎 character 鍗曚綅浣跨敤 equipment 钀芥。锛?*/
  selectedAmmo?: Array<{ type: number; amount: number } | null>;
  /** 姣忔Ы鎵嬮浄鏁伴噺锛堝師鐗?grenadeAmounts[]锛沜at5 姝﹀櫒鏃?equipment 瀹炰綋锛?*/
  grenadeAmounts?: number[];
  /** 鏁屾柟鍙秷鑰楀脊鑽簱瀛橈紙鏃?character 鏃惰杞藉脊鑽殑鏉ユ簮锛涚敓鎴愭椂 = 瀹归噺脳3锛沴egacy 鍏滃簳锛?*/
  ammoReserve?: number;
  /** 鏁屾柟鍙秷鑰楀脊鑽簱瀛橈細鍙ｅ緞鈫掓暟閲忥紙鍘熺増 distributeAmmo 鎸?cargo 姣斾緥鍒嗗彂锛沴oadMagazine 鎸夊脊鑽彛寰勬墸鍑忥級 */
  enemyAmmo?: Record<number, number>;
  /** Concrete Items ids; enemyAmmo remains a caliber-total index. */
  enemyAmmoItems?: Record<number, number>;
  cargoEquipment?: number[];
}

const VIEW_W = 640;
const VIEW_H = 445;
const CELL = 32;
const MELEE_RANGE = 1;

export class Battle {
  gd: GameData;
  ds: DataStore;
  assets: AssetStore;
  hooks: BattleHooks;
  opts: BattleOpts;

  screen = new Sprite();
  units: BattleUnit[] = [];
  fieldSize = 50;
  fieldPx = 1600;
  camX = 0;
  camY = 0;
  map = new Uint8Array(2500);
  obstacles: FieldObstacle[] = [];
  pathCells: Array<{ x: number; y: number; direction?: number }> = [];
  // ---- 鍘熺増 viewTarget/autoCenter 绉绘锛氭墜鍔ㄥ钩绉绘湡闂存殏鍋滈暅澶磋拷瑙掕壊锛圵ASD/灏忓湴鍥?杈规粴鍚庣害1.5s鎭㈠锛?----
  viewLock = false;
  viewLockT = 0;
  camTargetX: number | null = null;
  camTargetY: number | null = null;
  // 鍘熺増 keyPressed 婊氬姩鏂瑰悜锛圵ASD+鏂瑰悜閿紝keyup 澶嶄綅锛汢attleField.as:751-838锛?
  camLeft = false; camRight = false; camUp = false; camDown = false;
  shiftPressed = false;
  ctrlPressed = false;
  private hoverGx = -1;
  private hoverGy = -1;
  private hoverCost = 0;
  private hoverReachable = false;
  pathSprites: Sprite[] = [];
  turnIdx = 0;
  order: BattleUnit[] = [];
  phase = "player";
  gameOver = false;
  // 缁堝眬鐩镐綅鏈猴細none 鈫?slaves 鈫?loot 鈫?done銆備笌 endFired 涓€璧蜂繚璇?onEnd 鎭板ソ涓€娆?
  // 锛堝師瀹炵幇鐢?gameOver 鍚屾椂褰撻噸鍏ュ畧鍗拰缁堝眬鏍囧織锛屽鑷?finishVictory 闇€瑕?force 鍙傛暟缁曡繃鑷繁鐨勫畧鍗級
  endPhase: "none" | "slaves" | "loot" | "done" = "none";
  endFired = false;
  msgLayer = new Sprite();
  private messageLog = new BattleMessages(this.msgLayer);
  get msgs() { return this.messageLog.entries; }
  private pendingActions: Array<{ at: number; run: () => void }> = [];
  private advancePending = false;
  fieldView!: BattleFieldView;
  hud!: BattleHud;
  pickUpPos = 0;
  private _primeId = 0;
  timeAcc = 0;
  private enemyActionPending = false;
  private aiCue: Array<() => void> = [];
  private aiPlan?: { actor: BattleUnit; steps: Generator<void, unknown, void> };

  /** Preserve the original candidate order, but yield often enough for a modern 60+ Hz renderer. */
  private resumeAiPlan(): boolean {
    const plan = this.aiPlan;
    if (!plan) return false;
    if (plan.actor !== this.order[this.turnIdx] || plan.actor.dead || plan.actor.dying || this.gameOver) {
      this.aiPlan = undefined; return false;
    }
    const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
    const started = now();
    do {
      if (plan.steps.next().done) { if (this.aiPlan === plan) this.aiPlan = undefined; break; }
    } while (now() - started <= 3);
    return true;
  }

  private startAiPlan(actor: BattleUnit, steps: Generator<void, unknown, void>) {
    this.aiPlan = { actor, steps };
    this.resumeAiPlan();
  }
  private droppedBolts = new Map<number, number>();
  private centerOnEnemyIndex = 0;
  enemyCount = 0;
  enemySquad: EnemySquad | null = null;
  modeIdx = 0;
  animTime = 0;
  private fireLoopAcc = 0;
  unitSprites = new Map<BattleUnit, Sprite>();
  gridLayer!: Sprite;
  obstacleLayer!: Sprite;
  pathLayer = new Sprite();
  unitLayer = new Sprite();
  clickLayer!: Sprite;
  miniMap = new Sprite();
  miniFrame = new Sprite();
  infoName!: EngineText;
  infoHP!: EngineText;
  infoAP!: EngineText;
  infoWeapon!: EngineText;
  infoMode!: EngineText;
  infoMorale!: EngineText;
  hpBar!: Sprite;
  moraleBar!: Sprite;
  keydown: (e: any) => void;
  keyup: (e: any) => void;
  logFn: (msg: string) => void;
  lootDlg: TradeWindow | null = null;
  /** 鈶 鎴樺悗缂磋幏鐨勬晫鏂硅浇鍏?椹暅锛堝瓨娲?health>0 鑰咃紱Shell 鍦?onEnd(win) 鍚庡苟鍏ョ帺瀹惰溅闃燂級 */
  capturedTransports: Array<any> = [];
  panicOv: Sprite | null = null;
  private loadingOverlay: Sprite | null = null;
  panicRounds = 0;
  optionsWin: BattleOptionsWindow | null = null;
  paused = false;
  /** 鎬ユ晳妯″紡锛堝師鐗?C 閿?switchHealingMode锛汷N 鏃剁偣鍑婚槦鍙嬪寘鎵庤€岄潪绉诲姩锛?*/
  healingMode = false;
  /** 鎴樺満鎺夎惤姝﹀櫒锛堝師鐗?DroppedWeapons[][]锛沰ey="gx,gy"锛?*/
  droppedWeapons: Map<string, DroppedWeapon[]> | null = null;
  /** Cargo not currently held by a combatant; copied, never mutates encounter saves. */
  private enemyCargo?: Map<number, number>;
  /** 鎴樻枟鐗规晥锛堟洺鍏?鎵嬮浄寮х嚎/鐖嗙偢/寤舵椂鐖嗙偢锛?*/
  fx: Array<any> = [];
  private flames = new BattleFlames<BattleUnit>();
  private flameDamage = new Map<BattleUnit, { pending: number; total: number; x: number; y: number }>();
  fxLayer = new Sprite();
  /** 鏈€杩戜竴娆¤繙绋嬬瀯鍑嗙粨鏋滐紙渚?tracer/UI 灞曠ず锛?*/
  lastAim: { attacker: BattleUnit; target: BattleUnit; aimAngle: number; hitChance: number; distPx: number } | null = null;

  constructor(gd: GameData, ds: DataStore, assets: AssetStore, hooks: BattleHooks, opts: BattleOpts = {}) {
    this.gd = gd;
    this.ds = ds;
    this.assets = assets;
    this.hooks = hooks;
    this.opts = opts;
    // MapMode also owns a global key listener. Mark the battle as active before
    // any key can be delivered so map-only shortcuts (notably S=save) are inert.
    (globalThis as any).__c2BattleActive = true;
    ds.runtime?.events.emit("battle:construct", { battle: this, gd, ds, opts });
    this.logFn = (msg: string) => this.addMessage(2, msg);
    this.enemySquad = opts.enemySquad ?? null;
    this.setupUnits();
    this.buildField();
    this.build();
    this.keydown = (e: any) => {
      if (e.keyCode === 16) { this.shiftPressed = true; return; }
      if (e.keyCode === 17 || e.keyCode === 90) { this.ctrlPressed = true; return; }
      if (e.keyCode === 27) {
        e.preventDefault();
        if (this.optionsWin && this.optionsWin.visible) {
          this.closeOptions();
          this.optionsWin.visible = false;
          return;
        }
        this.openOptions();
        return;
      }
      if (this.paused) return;
      if ([9, 13, 78].includes(e.keyCode)) e.preventDefault();
      if (!this.hudAvailable()) return;
      // 鍘熺増 keyPressed锛歐ASD/鏂瑰悜閿?骞崇Щ瑙嗛噹锛圔attleField.as:773-788锛夛紱浠呭湪闈炴殏鍋滀笖鈥滅瓑寰呰緭鍏?鑷姩涓績鈥濅互澶栫殑鑷敱闃舵澶勭悊
      if (e.keyCode === 65 || e.keyCode === 37) { this.camLeft = true; this.camRight = false; e.preventDefault(); return; }
      if (e.keyCode === 68 || e.keyCode === 39) { this.camRight = true; this.camLeft = false; e.preventDefault(); return; }
      if (e.keyCode === 87 || e.keyCode === 38) { this.camUp = true; this.camDown = false; e.preventDefault(); return; }
      if (e.keyCode === 83 || e.keyCode === 40) { this.camDown = true; this.camUp = false; e.preventDefault(); return; }
      // 鍘熺増 M/绌烘牸 鍥炰腑褰撳墠瑙掕壊锛汦 寰幆瀹氫綅鏈€杩戞晫浜猴紙E 宸叉湁 endTurn 缁戝畾鈥斺€攚eb 鐢?E 缁撴潫鍥炲悎锛屼繚鐣欙級
      if (e.keyCode === 77 || e.keyCode === 32) { e.preventDefault(); this.centerViewOnCurrent(); return; }
      // Camera/HUD stays available during an action; new combat commands do not.
      if (!this.inControl()) return;
      if (e.keyCode === 9 || e.keyCode === 13 || e.keyCode === 78) { e.preventDefault(); this.endTurn(); return; }
      if (e.keyCode === 69) this.centerOnEnemy();
      if (e.keyCode === 71) this.cycleMode(-1);
      if (e.keyCode === 72) this.cycleMode(1);
      // 鍘熺増 keyPressed锛歊=reload锛孎=switch weapon锛孖=drop锛孞=pick up锛孋=healing mode
      if (e.keyCode === 82) this.doReload();
      if (e.keyCode === 84) this.prevAmmoType();
      if (e.keyCode === 89) this.nextAmmoType();
      if (e.keyCode === 70) this.switchWeapon();
      if (e.keyCode === 73) this.dropWeapon();
      if (e.keyCode === 74) this.pickUpWeapon();
      if (e.keyCode === 67) this.toggleHealingMode();
      if (e.keyCode === 86) this.prevFirstAid();
      if (e.keyCode === 66) this.nextFirstAid();
      if (e.keyCode === 85) this.unloadWeapon();
      if (e.keyCode === 75) this.nextPickUpPos();
      if (e.keyCode === 76) this.prevPickUpPos();
    };
    window.addEventListener("keydown", this.keydown);
    this.keyup = (e: any) => {
      if (e.keyCode === 16) this.shiftPressed = false;
      else if (e.keyCode === 17 || e.keyCode === 90) this.ctrlPressed = false;
      else if (e.keyCode === 65 || e.keyCode === 37) this.camLeft = false;
      else if (e.keyCode === 68 || e.keyCode === 39) this.camRight = false;
      else if (e.keyCode === 87 || e.keyCode === 38) this.camUp = false;
      else if (e.keyCode === 83 || e.keyCode === 40) this.camDown = false;
    };
    window.addEventListener("keyup", this.keyup);
  }

  destroy() {
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    this._primeId++;
    this.restoreNativeCursor();
    (globalThis as any).__c2BattleActive = false;
  }

  private restoreNativeCursor() {
    (globalThis as any).__c2HideNativeCursor = false;
    if (typeof document !== "undefined") {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
      if (canvas) canvas.style.cursor = "default";
    }
    this.fieldView?.clearCursor();
  }

  text(id: number): string {
    return getText(this.ds, id, this.ds.language);
  }

  weaponSkillOf(sub: number): string {
    return sub ? Character.detectWeaponSkill(this.ds, sub) : "unarmed";
  }

  private addGroupPeople(people: Character[], side: number, groupId: number, groupName?: string) {
    people.filter(p => (p._HP ?? 1) > 0).forEach((p: any, i: number) => {
      // 鍘熺増 Character.weapons[] 鍙屾Ы锛堝瓨 subCategory锛夛紱0=绌?
      const slots = [
        Character.weaponItemId(p, 0) || p.weaponItem || 0,
        Character.weaponItemId(p, 1) || 0,
      ];
      const slot0 = slots[0] ? 0 : slots[1] ? 1 : 0;
      const wid = slots[slot0] ?? 0;
      const sub = wid ? (this.ds.items.Items[wid]?.subCategory ?? 0) : 0;
      const loaded = Array.isArray(p.loadedAmmo) ? p.loadedAmmo : [null, null];
      this.units.push({
        side: p.category>2&&p.category!==5?2:side, groupId, groupName,
        name: p.name || "Hero" + i,
        faction: p.faction ?? 0,
        squareX: 0,
        squareY: 0,
        x: 0,
        y: 0,
        // Story difficulty can lower maxHP after construction; original HP clamps it.
        _HP: Math.min(p.HP ?? p._HP ?? 100, p.maxHP ?? Math.max(p.basePhysical ?? 10, 1) * 20),
        maxHP: p.maxHP ?? Math.max(p.basePhysical ?? 10, 1) * 20,
        basePhysical: p.basePhysical ?? 10,
        baseAgility: p.baseAgility ?? 10,
        baseAccuracy: p.baseAccuracy ?? 10,
        baseIntelligence: p.baseIntelligence ?? 10,
        weaponItem: wid,
        armorItem: Character.armorItemId(p) || p.armorItem || 0,
        weaponSub: sub,
        skill: this.weaponSkillOf(sub),
        AP: 0,
        maxAP: 0,
        battleMorale: p._battleMorale ?? 50,
        morale: p.morale ?? 50,
        bleeding: p.bleeding ?? 0,
        burning: 0,
        legDamage: p.legDamage ?? 0,
        armDamage: p.armDamage ?? 0,
        eyeDamage: p.eyeDamage ?? 0,
        dead: false,
        character: p,
        path: null,
        moveT: 0,
        exp: 100,
        weaponItems: slots,
        weaponSlot: slot0,
        modeIdx: Array.isArray(p.currModes) ? [...p.currModes] : [0, 0],
        loadedAmmo: loaded.map((l: any) => (l ? { type: l.type, amount: l.amount ?? 0 } : null)),
        selectedAmmo: Array.isArray(p.selectedAmmo) ? p.selectedAmmo.map((l: any) => (l ? { type: l.type, amount: l.amount ?? 0 } : null)) : [null, null],
        grenadeAmounts: Array.isArray(p.grenadeAmounts) ? [...p.grenadeAmounts] : [0, 0],
      });
    });

  }

  groupOf(u: BattleUnit): number { return u.groupId ?? u.side; }

  /** Neutrals flee both bands; ordinary AI never chooses band 3 as a target. */
  private threatens(actor: BattleUnit, other: BattleUnit): boolean {
    return !other.dead && !other.dying && other._HP > 0 && other.side !== 2
      && (actor.side === 2 || other.side !== actor.side);
  }

  setupUnits() {
    this.addGroupPeople(this.gd.Caravans[0].People,0,0);

    // 杩愯緭鍗曚綅涔熻繘鍏ュ洖鍚堥『搴忥細鍔ㄧ墿鍜岃溅杈嗛兘鎷ユ湁鐙珛鏍煎瓙銆丄P銆丠P锛屽苟鍙閫変腑/鏀诲嚮銆?
    const playerTransports = Array.isArray(this.gd.Caravans[0]?.transports)
      ? this.gd.Caravans[0].transports
      : [];
    for (const tr of playerTransports) {
      if (!tr || Number(tr.health ?? 1) <= 0) continue;
      this.units.push(this.makeTransportUnit(tr, 0, this.gd.Caravans[0]?.category ?? 0));
    }

    if (!this.units.length) {
      this.units.push(this.makeEnemy("Hero", 0));
      this.units[this.units.length - 1].side = 0;
      this.units[this.units.length - 1].name = "Hero";
    }
    const enemyTransports = Array.isArray(this.opts.enemyTransports)
      ? this.opts.enemyTransports
      : (Array.isArray((this.enemySquad as any)?.transports) ? (this.enemySquad as any).transports : []);
    for (const tr of enemyTransports) {
      if (!tr || Number(tr.health ?? 1) <= 0) continue;
      this.units.push(this.makeTransportUnit(tr, 1, this.opts.enemyFaction ?? this.enemySquad?.faction ?? 0));
    }

    // 鏁屾柟寮硅嵂鏉ユ簮锛氫紭鍏?enemySquad.cargoLoot锛堝師鐗?Caravan.Cargo锛夛紝鍏滃簳 squad.cargoLoot
    let ammoCargo: Array<{ item: number; amount: number }> | undefined = this.enemySquad?.cargoLoot;
    if (this.opts.enemyPeople?.length || this.opts.enemyPeople && !this.enemySquad?.people?.length) {
      this.addGroupPeople(this.opts.enemyPeople,1,1,this.opts.enemyName);
    } else if (this.enemySquad?.people?.length) {
      // 鏁版嵁椹卞姩璺緞锛氳溅闃熺被鍨嬪凡鍐冲畾浜烘暟/灞炴€?瑁呭/韬唤
      this.enemyCount = this.enemySquad.people.length;
      for (const spec of this.enemySquad.people) this.units.push(this.makeEnemyFromSpec(spec));
    } else {
      // 鍏滃簳璺緞锛堟帰閽?鏁欑▼鎴樹笉浼?squad锛夛細浠嶈蛋 caravan_types 鐪熸暟鎹紝type 0
      const squad = this.gd.equipRandomCaravan?.(0, this.opts.enemyCount);
      ammoCargo = squad?.cargoLoot;
      if (squad?.people?.length) {
        this.enemyCount = squad.people.length;
        for (const spec of squad.people) this.units.push(this.makeEnemyFromSpec(spec));
      } else {
        // 鏋佺鍏滃簳锛歱resets 鏈姞杞?
        this.enemyCount = Math.max(1, this.opts.enemyCount ?? 1);
        const wids = this.allWeaponIds();
        const names = this.ds.namePhonetics?.EnglishMaleNames ?? [];
        for (let i = 0; i < this.enemyCount; i++) {
          const wid = wids.length ? wids[Math.floor(Math.random() * wids.length)] : 0;
          const nm = names.length ? String(names[Math.floor(Math.random() * names.length)]) : "Raider";
          this.units.push(this.makeEnemy(nm + " (Raider)", wid));
        }
      }
    }
    // 鍘熺増 Caravan.distributeAmmo锛氭寜杞﹂槦 cargo 鎶婂脊鑽紙鎸夊彛寰勶級涓庢墜闆锋寜闇€姣斾緥鍒嗗彂缁欐墍鏈夋晫鏂瑰崟浣?
    // Explicit encounter cargo (including an empty inventory) is authoritative after trading.
    ammoCargo = this.opts.lootCargo ?? ammoCargo;
    this.addGroupPeople(this.opts.slavePeople??[],2,1,this.opts.enemyName);
    this.prepareEnemyCargo(ammoCargo);
    this.allocateEnemyAmmo(this.units.filter((u) => u.side === 1 && !u.character), ammoCargo);
    for (const u of this.units) u.groupId ??= u.side;
    for (const [index, group] of (this.opts.additionalGroups ?? []).entries()) {
      const groupId=index+2, side=group.band-1;
      const start=this.units.length;
      this.addGroupPeople(group.people,side,groupId,group.name);
      for(const spec of group.enemySquad?.people??[])this.units.push({...this.makeEnemyFromSpec(spec),side,groupId,groupName:group.name});
      this.addGroupPeople(group.slavePeople??[],2,groupId,group.name);
      const members=this.units.slice(start),mainCargo=this.enemyCargo;
      this.prepareEnemyCargo(group.cargo??group.enemySquad?.cargoLoot,members.filter(u=>!u.character));
      this.allocateEnemyAmmo(members.filter(u=>!u.character),group.cargo??group.enemySquad?.cargoLoot);
      const residual=this.enemyCargo;this.enemyCargo=mainCargo;
      if(side===1&&residual){this.enemyCargo??=new Map();for(const [id,amount] of residual)this.enemyCargo.set(id,(this.enemyCargo.get(id)??0)+amount);}
      for (const tr of group.transports ?? []) if (tr && Number(tr.health??1)>0) {
        this.units.push({...this.makeTransportUnit(tr,side,group.faction??0),groupId,groupName:group.name});
      }
    }
    this.initializeMorale();
    // 鍘熺増 addCharacter 鑷姩 reload(0)/reload(1)锛氭墍鏈夊崟浣嶈繘鎴樻枟鍗宠寮瑰專锛堣 min(cap,鍙脊閲?锛夈€?
    // 鐜╁浠?character.equipment 鍙栧脊锛堝脊鑽』闅忚韩锛夛紝鏁屾柟浠?distributeAmmo 搴撳瓨鍙栧脊銆?
    for (const u of this.units) {
      if (u.character || u.side === 0) this.autoLoadUnit(u);
      else this.autoLoadUnit(u);
    }
  }

  initializeMorale() {
    const band=(u:BattleUnit)=>this.groupOf(u)===0?1:this.groupOf(u)===1?2:this.opts.additionalGroups?.[this.groupOf(u)-2]?.band??3;
    const power=[0,0,0,0];
    for(const u of this.units){if(u.isTransport||u.side===2)continue;
      const ch=u.character;
      let value=200+(ch?.physical??u.basePhysical)+(ch?.accuracy??u.baseAccuracy)+this.unitMaxAP(u)+Math.sqrt(ch?.generalBattleExperience??u.exp??0);
      for(const [slot,id] of (u.weaponItems??[u.weaponItem]).entries()){
        const sub=this.ds.items.Items[id]?.subCategory,wd=this.ds.weapons.Weapons[sub];if(!id||!wd)continue;
        const multiplier=this.ds.weapons.WeaponTypes[wd.type]?.category===5?5:1;
        value+=2*Math.sqrt((wd.price??0)*multiplier/(slot+1));
      }
      power[band(u)]+=value;
    }
    for(const u of this.units){if(u.isTransport)continue;const b=band(u);
      // Empty opposing parties cannot supply a finite ratio; neutral/base morale remains usable.
      const factor=b===3||power[1]<=0||power[2]<=0?1:Math.pow(power[b]/power[b===1?2:1],.3);
      const morale=(u.character?.morale??u.morale??50)*factor;
      if(u.character){u.character.battleMorale=morale;u.battleMorale=u.character.battleMorale;}
      else u.battleMorale=morale;
    }
  }

  /** Convert a World.TransportUnit into the same combat contract used by people. */
  makeTransportUnit(tr: any, side: number, faction: number): BattleUnit {
    const type = Math.max(1, Number(tr?.type ?? 1));
    const def = this.ds.transports?.Types?.[type] ?? {};
    const animal = Number(def.category ?? tr?.category ?? 1) === 1;
    const maxHP = Math.max(1, Number(tr?.maxHealth ?? def.maxHealth ?? tr?.health ?? 100));
    const hp = Math.max(0, Math.min(maxHP, Number(tr?.health ?? maxHP)));
    const speed = Math.max(1, Number(def.speed ?? 8));
    const physical = Math.max(4, Math.min(30, Math.round(4 + maxHP / 250)));
    const agility = Math.max(3, Math.min(16, Math.round(4 + speed / 2)));
    const textName = typeof def.name === "number" ? this.text(def.name) : "";
    const name = tr?.givenName || textName || (animal ? "Animal" : "Vehicle") + " " + type;
    return {
      side,
      name,
      faction,
      squareX: 0,
      squareY: 0,
      x: 0,
      y: 0,
      _HP: hp,
      maxHP,
      basePhysical: physical,
      baseAgility: agility,
      baseAccuracy: animal ? 7 : 6,
      baseIntelligence: 3,
      weaponItem: 0,
      armorItem: 0,
      weaponSub: 0,
      skill: "unarmed",
      AP: 0,
      maxAP: 0,
      battleMorale: 55,
      morale: 55,
      bleeding: 0,
      burning: 0,
      legDamage: 0,
      armDamage: 0,
      eyeDamage: 0,
      dead: hp <= 0,
      path: null,
      moveT: 0,
      exp: 100,
      transportKind: animal ? "animal" : "transport",
      transportRef: tr,
      transportType: type,
      isTransport: true,
      facing: side === 0 ? 0 : 2,
      weaponItems: [0, 0],
      weaponSlot: 0,
      modeIdx: [0, 0],
      loadedAmmo: [null, null],
      selectedAmmo: [null, null],
      grenadeAmounts: [0, 0],
    };
  }

  /** 鎴樻枟寤虹珛鏃惰嚜鍔ㄨ濉紙鍘熺増 addCharacter 鈫?reload(0)/reload(1)锛夛細閬嶅巻鍙屾Ы锛屾湁鍖归厤鍙ｅ緞寮硅嵂鍗宠鍏?   *  min(cap, avail)锛堝厑璁镐笉婊″專锛夛紱鐜╁鍙?character.equipment锛屾晫鏂瑰彇 distributeAmmo 搴撳瓨锛涗笉鏀瑰彉娲诲姩妲?*/
  private autoLoadUnit(u: BattleUnit) {
    const wasSlot = u.weaponSlot ?? 0;
    for (let slot = 0; slot < 2; slot++) {
      const wid = u.weaponItems?.[slot] ?? 0;
      if (!wid) continue;
      const it = this.ds.items.Items[wid];
      const cat = it?.category ?? 0;
      if (cat < 2 || cat > 4) continue;
      const wd = this.ds.weapons.Weapons?.[it.subCategory];
      if (!wd || wd.ammo === 17) continue;
      const cal = wd.ammo;
      const cap = wd.ammoCapacity ?? 1;
      let avail = 0;
      if (u.character) {
        for (const e of Array.isArray(u.character.equipment) ? u.character.equipment : []) {
          if (!e) continue;
          const it2 = this.ds.items.Items[e.type];
          const am = it2 ? (this.ds.weapons.Ammo?.[it2.subCategory] ?? null) : null;
          if (it2 && it2.category === 3 && am && am.type === cal) {
            avail += Math.max(0, (e.amount ?? 0) - (e.inUse ?? 0));
          }
        }
      } else {
        avail = (u.enemyAmmo?.[cal] ?? 0) + (u.ammoReserve ?? 0);
      }
      if (avail <= 0) continue;
      u.weaponSlot = slot;
      u.weaponItem = wid;
      u.weaponSub = it.subCategory;
      u.skill = this.weaponSkillOf(it.subCategory);
      this.loadMagazine(u, true);
    }
    u.weaponSlot = wasSlot;
    const wid0 = u.weaponItems?.[wasSlot] ?? 0;
    u.weaponItem = wid0;
    u.weaponSub = wid0 ? (this.ds.items.Items[wid0]?.subCategory ?? 0) : 0;
    u.skill = this.weaponSkillOf(u.weaponSub);
  }

  // 鏁屼汉鐢熸垚鏃剁殑灞炴€?maxAP锛堝師鐗?battle maxAP 鍏紡鍓嶇殑灞炴€у€硷紱distributeAmmo 鐢?Person.maxAP 鍔犳潈锛?
  enemyMaxAPOf(u: BattleUnit): number {
    return 5 + Math.round((u.baseAgility ?? 10) * 1.5 + Math.sqrt(Math.max(u.exp ?? 0, 0)) / 40);
  }

  // 鍘熺増 Caravan.distributeAmmo锛坉ecompiled Caravan.as:2132-2380锛夊繝瀹炵Щ妞嶏細
  // 1) 娓呯┖鎵€鏈夋晫鏂瑰崟浣嶅脊鑽紙web 鏁屼汉鏃?equipment 鐚?锛岀瓑浠峰師鐗?unequip锛夛紱
  // 2) 瀵规瘡涓鍣ㄦЫ锛坈at 2..5锛夋寜鍘熺増 relPart 琛?脳 maxAP 鐢熸垚闇€姹傦紱
  // 3) cargo锛坰quad.cargoLoot锛変腑鐨勭尗3寮硅嵂鎸夊彛寰勫叆姹犮€佺尗2鎵嬮浄姝﹀櫒鎸?item 鍏ユ睜锛?
  // 4) ratio=姹?鎬婚渶姹?鈫?desiredAmount=relPart脳ratio锛堟棤闇€姹傛椂 NaN锛屾案涓嶆寜闇€鍙戞斁锛屼絾寰幆鐨?
  //    "鍏ㄩ儴婊¤冻"鍒嗘敮浼氳鍏舵瘡杞悇鍚?1 鍙戠洿鍒版睜绌衡€斺€斿師鐗堝悓娆炬€櫀锛夛紱
  // 5) 杞鍒嗗彂锛氭睜绌烘潯鐩Щ闄わ紝鐩村埌璇锋眰鍒楄〃娓呯┖銆?
  // 鏃?cargoLoot 鐨勫悎鎴?squad锛堟帰閽?鏁欑▼锛夛細鎸夊閲徝? 棰勭畻銆佹墜闆?2+rand4 鍏滃簳锛堝師鐗堟棤姝よ矾寰勶紝灞炴暟鎹己鐪佽ˉ鍋匡級銆?
  private prepareEnemyCargo(cargo?: Array<{ item: number; amount: number }>, members=this.units.filter(u=>u.side===1&&!u.isTransport&&!u.character)) {
    this.enemyCargo = new Map();
    for (const c of cargo ?? [])
      this.enemyCargo.set(c.item, (this.enemyCargo.get(c.item) ?? 0) + c.amount);
    for (const u of members) {
      // New squads record exact provenance; older squads used the combined gear/cargo handoff.
      for (const id of u.cargoEquipment ?? [...(u.weaponItems ?? []), u.armorItem ?? 0]) {
        const it = this.ds.items.Items[id];
        const wd = it?.category === 2 ? this.ds.weapons.Weapons[it.subCategory] : null;
        // Grenades remain in cargo until distributeAmmo assigns their quantities.
        if (!wd || this.ds.weapons.WeaponTypes[wd.type]?.category !== 5) this.takeEnemyCargo(id, 1);
      }
    }
  }

  private takeEnemyCargo(id: number, amount: number) {
    if (!this.enemyCargo) return;
    const left = (this.enemyCargo.get(id) ?? 0) - amount;
    if (left > 0) this.enemyCargo.set(id, left); else this.enemyCargo.delete(id);
  }

  private ammoItemForCaliber(cal: number): number {
    return this.ds.items.Items.findIndex((it: any) => it?.category === 3 && this.ds.weapons.Ammo[it.subCategory]?.type === cal);
  }

  allocateEnemyAmmo(units: BattleUnit[], cargoLoot?: Array<{ item: number; amount: number }>) {
    const Items = this.ds.items.Items;
    const Weapons = this.ds.weapons.Weapons;
    const WeaponTypes = this.ds.weapons.WeaponTypes;
    const Ammo = this.ds.weapons.Ammo;
    if (!Array.isArray(Weapons) || !Array.isArray(WeaponTypes)) return;
    type Req = { u: BattleUnit; slot: number; cal: number; grenade: boolean; wid: number; relPart: number; desired: number; ammoReceived: number };
    const reqs: Req[] = [];
    const ammoReq: Record<number, number> = {};
    const grenadeReq: Record<number, number> = {};
    for (const u of units) {
      // 鍘熺増鍏堝嵏闄ゅ叏閮ㄥ脊鑽紱web 鏁屼汉鍦ㄦ閲嶇疆涓?0
      u.enemyAmmo = {};
      u.enemyAmmoItems = {};
      u.ammoReserve = 0;
      u.grenadeAmounts = [0, 0];
      const mAP = this.enemyMaxAPOf(u);
      const slots = u.weaponItems ?? [0, 0];
      for (let slot = 0; slot < 2; slot++) {
        const wid = slots[slot];
        if (!wid) continue;
        const item = Items[wid];
        const wd = item ? Weapons[item.subCategory] : null;
        const wt = wd ? WeaponTypes[wd.type] : null;
        if (!wd || !wt) continue;
        const cat = wt.category ?? 0;
        if (cat < 2 || cat > 5) continue;
        let relPart: number;
        if (cat === 5) relPart = 3;
        else if (cat === 3) relPart = wt.subCategory === 1 ? 5 : 3;
        else if (cat === 4) relPart = 30;
        else {
          switch (wt.subCategory) {
            case 1: relPart = 5; break;
            case 2: relPart = wd.type === 15 ? 5 : 3; break;
            case 3: relPart = 30; break;
            case 4: relPart = 10; break;
            case 5: relPart = 3; break;
            default: relPart = 3; break;
          }
        }
        relPart *= mAP;
        if (cat === 5) {
          grenadeReq[wid] = (grenadeReq[wid] ?? 0) + relPart;
          reqs.push({ u, slot, cal: 0, grenade: true, wid, relPart, desired: 0, ammoReceived: 0 });
        } else {
          const cal = wd.ammo ?? 0;
          ammoReq[cal] = (ammoReq[cal] ?? 0) + relPart;
          reqs.push({ u, slot, cal, grenade: false, wid, relPart, desired: 0, ammoReceived: 0 });
        }
      }
    }
    if (!reqs.length) return;
    // 鏃?cargo 鏁版嵁锛氭寜瀹归噺脳3 / 鎵嬮浄 2+rand4 鍏滃簳锛堝悎鎴?squad 缂哄師鐗?Cargo锛?
    if (!cargoLoot) {
      for (const rq of reqs) {
        if (rq.grenade) {
          rq.u.grenadeAmounts![rq.slot] = 2 + Math.floor(Math.random() * 4);
        } else {
          const wd = Weapons[Items[rq.wid]?.subCategory];
          const id = this.ammoItemForCaliber(rq.cal);
          if (id > 0) {
            const amount = (wd?.ammoCapacity ?? 1) * 3;
            rq.u.enemyAmmo![rq.cal] = (rq.u.enemyAmmo![rq.cal] ?? 0) + amount;
            rq.u.enemyAmmoItems![id] = (rq.u.enemyAmmoItems![id] ?? 0) + amount;
          }
        }
      }
      return;
    }
    // cargo 姹狅細鐚?寮硅嵂锛堟寜鍙ｅ緞锛夈€佺尗2+weaponType cat5 鎵嬮浄姝﹀櫒锛堟寜 item锛?
    const ammoPool: Record<number, number> = {};
    const concretePool: Record<number, number> = {};
    const grenadePool: Record<number, number> = {};
    for (const c of cargoLoot) {
      const it = Items[c.item];
      if (!it) continue;
      if (it.category === 3) {
        const am = Ammo?.[it.subCategory];
        if (!am) continue;
        const cal = am.type ?? 0;
        const amount = Math.max(0, Math.floor(c.amount));
        ammoPool[cal] = (ammoPool[cal] ?? 0) + amount;
        concretePool[c.item] = (concretePool[c.item] ?? 0) + amount;
      } else if (it.category === 2) {
        const wd = Weapons?.[it.subCategory];
        const wt = wd ? WeaponTypes?.[wd.type] : null;
        if (wt?.category === 5) grenadePool[c.item] = (grenadePool[c.item] ?? 0) + Math.max(0, Math.floor(c.amount));
      }
    }
    const ratioAmmo: Record<number, number> = {};
    for (const cal of Object.keys(ammoReq)) ratioAmmo[Number(cal)] = (ammoPool[Number(cal)] ?? 0) / ammoReq[Number(cal)];
    const ratioGren: Record<number, number> = {};
    for (const wid of Object.keys(grenadeReq)) ratioGren[Number(wid)] = (grenadePool[Number(wid)] ?? 0) / grenadeReq[Number(wid)];
    for (const rq of reqs) {
      rq.desired = rq.grenade ? rq.relPart * (ratioGren[rq.wid] ?? 0) : rq.relPart * (ratioAmmo[rq.cal] ?? 0);
    }
    // 杞鍒嗗彂锛堝師鐗?while(_loc17_.length>0) + 鈥滃叏閮ㄦ弧瓒斥€濇爣蹇椾綅锛?
    while (reqs.length > 0) {
      let all = true;
      for (const rq of reqs) if (rq.ammoReceived < rq.desired) { all = false; break; }
      let progressed = false;
      for (let i = 0; i < reqs.length; i++) {
        const rq = reqs[i];
        const pool = rq.grenade ? grenadePool[rq.wid] ?? 0 : ammoPool[rq.cal] ?? 0;
        if (pool > 0) {
          if (rq.ammoReceived < rq.desired || all) {
            if (rq.grenade) {
              grenadePool[rq.wid] = pool - 1;
              this.takeEnemyCargo(rq.wid, 1);
              rq.u.grenadeAmounts![rq.slot] = (rq.u.grenadeAmounts?.[rq.slot] ?? 0) + 1;
            } else {
              const id = Number(Object.keys(concretePool).find(id => concretePool[Number(id)] > 0
                && Ammo[Items[Number(id)]?.subCategory]?.type === rq.cal));
              if (!id) continue;
              concretePool[id]--;
              rq.u.enemyAmmoItems![id] = (rq.u.enemyAmmoItems![id] ?? 0) + 1;
              this.takeEnemyCargo(id, 1);
              ammoPool[rq.cal] = pool - 1;
              rq.u.enemyAmmo![rq.cal] = (rq.u.enemyAmmo?.[rq.cal] ?? 0) + 1;
            }
            rq.ammoReceived++;
            progressed = true;
          }
        } else {
          reqs.splice(i, 1);
          i--;
          progressed = true;
        }
      }
      if (!progressed) break; // 鐞嗚涓嶅彲杈撅紙姹犵┖鍗崇Щ闄わ級锛涢槻寰℃寰幆
    }
  }

  // 绾洿浼狅細灞炴€ф帹瀵煎彧鍦?World.equipRandomCaravan 涓€澶勫疄鐜帮紝姝ゅ涓嶉噸绠楋紝閬垮厤鍏紡婕傜Щ
  makeEnemyFromSpec(e: EnemyPersonSpec): BattleUnit {
    const wid = e.weaponItem ?? 0;
    const sub = wid ? (this.ds.items.Items[wid]?.subCategory ?? 0) : 0;
    const bp = e.basePhysical ?? 10;
    const mhp = e.maxHP ?? Math.max(bp, 1) * 20;
    return {
      side: 1,
      name: e.name,
      faction: e.faction ?? 0,
      squareX: 0,
      squareY: 0,
      x: 0,
      y: 0,
      _HP: Math.min(e._HP ?? mhp, mhp),
      maxHP: mhp,
      basePhysical: bp,
      baseAgility: e.baseAgility ?? 10,
      baseAccuracy: e.baseAccuracy ?? 10,
      baseIntelligence: e.baseIntelligence ?? 10,
      weaponItem: wid,
      armorItem: e.armorItem ?? 0,
      cargoEquipment: e.cargoEquipment ? [...e.cargoEquipment] : undefined,
      weaponSub: sub,
      skill: this.weaponSkillOf(sub),
      AP: 0,
      maxAP: 0,
      battleMorale: 55,
      morale: 55,
      bleeding: 0,
      burning: 0,
      legDamage: 0,
      armDamage: 0,
      eyeDamage: 0,
      dead: false,
      path: null,
      moveT: 0,
      // 鈶 鏁屼汉 maxAP 娑堣垂鐐癸細鍘熺増 maxAP = 5+round(agility脳1.5+鈭歡eneralBattleExperience/40)銆?
      // unitMaxAP 瀵规棤 character 鍗曚綅鐢?u.exp 璁＄畻锛岃繖閲屾妸 spec 钀芥。鐨?generalBattleExperience 鐩翠紶銆?
      exp: e.generalBattleExperience ?? 50,
      skillExperience: e.skillExperience,
      appearance: {
        ...e,
        HeadType: (e as any).HeadType ?? (1 + Math.floor(Math.random() * 11)),
        BodyType: (e as any).BodyType ?? (e.gender === 2 ? 5 : 1 + Math.floor(Math.random() * 2)),
        BackHairType: (e as any).BackHairType ?? Math.floor(Math.random() * 3),
        BeardType: (e as any).BeardType ?? Math.floor(Math.random() * 5),
      },
      transportKind: (e as any).transportKind,
      // 鈶 澶栬鑹茬洿浼狅紙娓叉煋娑堣垂锛汦nemyPersonSpec 鐢?equipRandomCaravan 琛ュ叏榛樿鑹诧級
      shirtColor: e.shirtColor, pantsColor: e.pantsColor, skinColor: e.skinColor, sleevesType: e.sleevesType,
      // 鍙屾Ы + 寮硅嵂锛歴pec 鏃?equipment 钀芥。 鈫?棰勮瀹归噺脳3 寮硅嵂锛堝師鐗堢敓鎴愭椂鎸夎溅闃熸暟鎹彂寮硅嵂锛?
      weaponItems: [wid, 0],
      weaponSlot: 0,
      modeIdx: [0, 0],
      loadedAmmo: [null, null],
      selectedAmmo: [null, null],
      grenadeAmounts: (() => {
        if (!wid) return [0, 0];
        const item = this.ds.items.Items[wid];
        const wd = item ? this.ds.weapons.Weapons?.[item.subCategory] : null;
        const wt = wd ? this.ds.weapons.WeaponTypes?.[wd.type] : null;
        if (wt?.category === 5) return [2 + Math.floor(Math.random() * 4), 0];
        return [0, 0];
      })(),
      // 寮硅嵂鐢?allocateEnemyAmmo() 鎸?squad.cargoLoot 鍘熺増 distributeAmmo 鍒嗗彂锛涙澶勫綊闆?
      ammoReserve: 0,
    };
  }

  // 鍘熺増 Character.as:628-652 鐨勫睘鎬т笂闄?10锛涙澶勫洓灞炴€у悇鑷嫭绔?roll 涓斿叏閮ㄦ敹鏁涳紝鍗充娇瑙﹀彂涔熶笉瓒婄晫
  makeEnemy(name: string, weaponItem: number): BattleUnit {
    const sub = weaponItem ? (this.ds.items.Items[weaponItem]?.subCategory ?? 0) : 0;
    const r47 = () => 4 + Math.floor(Math.random() * 4);
    const bp = Math.min(r47(), 10);
    const mhp = Math.max(bp * 20, 1);
    const appearance = {
      name,
      gender: Math.random() < 0.5 ? 1 : 2,
      age: 18 + Math.floor(Math.random() * 45),
      portraitHair: 1 + Math.floor(Math.random() * 29),
      portraitShirt: Math.floor(Math.random() * 4),
      hairColor: { r: 25 + Math.floor(Math.random() * 100), g: 18 + Math.floor(Math.random() * 75), b: 10 + Math.floor(Math.random() * 55), bc: 1 },
      shirtColor: { r: 55 + Math.floor(Math.random() * 150), g: 55 + Math.floor(Math.random() * 150), b: 55 + Math.floor(Math.random() * 150), bc: 1 },
      pantsColor: { r: 45 + Math.floor(Math.random() * 130), g: 45 + Math.floor(Math.random() * 130), b: 45 + Math.floor(Math.random() * 130), bc: 1 },
      skinColor: { r: 145 + Math.floor(Math.random() * 75), g: 105 + Math.floor(Math.random() * 65), b: 90 + Math.floor(Math.random() * 55), bc: 1 },
      sleevesType: Math.floor(Math.random() * 6),
      HeadType: 1 + Math.floor(Math.random() * 11),
      BackHairType: Math.floor(Math.random() * 3),
      BeardType: Math.floor(Math.random() * 5),
    };
    return {
      side: 1,
      name,
      faction: 0,
      squareX: 0,
      squareY: 0,
      x: 0,
      y: 0,
      _HP: mhp,
      maxHP: mhp,
      basePhysical: bp,
      baseAgility: Math.min(r47(), 10),
      baseAccuracy: Math.min(r47(), 10),
      baseIntelligence: Math.min(r47(), 10),
      weaponItem,
      armorItem: 0,
      weaponSub: sub,
      skill: this.weaponSkillOf(sub),
      AP: 0,
      maxAP: 0,
      battleMorale: 55,
      morale: 55,
      bleeding: 0,
      burning: 0,
      legDamage: 0,
      armDamage: 0,
      eyeDamage: 0,
      dead: false,
      path: null,
      moveT: 0,
      exp: 50,
      appearance,
      weaponItems: [weaponItem, 0],
      weaponSlot: 0,
      modeIdx: [0, 0],
      loadedAmmo: [null, null],
      selectedAmmo: [null, null],
      grenadeAmounts: (() => {
        if (!weaponItem) return [0, 0];
        const item = this.ds.items.Items[weaponItem];
        const wd = item ? this.ds.weapons.Weapons?.[item.subCategory] : null;
        const wt = wd ? this.ds.weapons.WeaponTypes?.[wd.type] : null;
        if (wt?.category === 5) return [2 + Math.floor(Math.random() * 4), 0];
        return [0, 0];
      })(),
      // 寮硅嵂鐢?allocateEnemyAmmo() 鍒嗗彂锛堟棤 cargo 鏃舵寜瀹归噺脳3 鍏滃簳锛?
      ammoReserve: 0,
    };
  }

  allWeaponIds(): number[] {
    const out: number[] = [];
    const items = this.ds.items.Items;
    for (let i = 1; i < items.length; i++) {
      if (items[i] && items[i].category === 2) out.push(i);
    }
    return out;
  }

  buildField() {
    // Some encounter factories keep attached carts only on the animal reference.
    for (const u of [...this.units]) {
      const cart = u.transportRef?.cart;
      if (cart && Number(cart.health ?? 1) > 0 && !this.units.some(v => v.transportRef === cart))
        this.units.push({...this.makeTransportUnit(cart, u.side, u.faction ?? 0),groupId:this.groupOf(u),groupName:u.groupName});
    }
    // BattleField.as limits each group to 30 root transports; attached carts do not consume a slot.
    const omitted=new Set<BattleUnit>();
    for(const groupId of new Set(this.units.map(u=>this.groupOf(u)))){
      const transport=this.units.filter(u=>u.isTransport&&this.groupOf(u)===groupId);
      const roots=transport.filter(u=>!transport.some(v=>v.transportRef?.cart===u.transportRef));
      for(const u of roots.slice(30)){omitted.add(u);const cart=transport.find(v=>v.transportRef===u.transportRef?.cart);if(cart)omitted.add(cart);}
    }
    this.units=this.units.filter(u=>!omitted.has(u));
    let maxRange = 15;
    for (const u of this.units) {
      if (u.isTransport) continue;
      for (const [slot, wid] of (u.weaponItems ?? [u.weaponItem, 0]).entries()) {
        const sub = this.ds.items.Items[wid]?.subCategory ?? 0;
        const wd = this.ds.weapons.Weapons[sub];
        const wt = this.ds.weapons.WeaponTypes[wd?.type ?? 0];
        if (!wd || !wt) continue;
        const ranged = [2, 3, 4].includes(wt.category);
        const hasAmmo = (u.loadedAmmo?.[slot]?.amount ?? 0) > 0 || (u.enemyAmmo?.[wd.ammo] ?? 0) > 0
          || (u.ammoReserve ?? 0) > 0 || u.character?.equipment?.some((e: any) => {
            const item = this.ds.items.Items[e.type];
            return item?.category === 3 && e.amount > 0 && this.ds.weapons.Ammo[item.subCategory]?.type === wd.ammo;
          });
        if (ranged && !hasAmmo) continue;
        const equipped = { ...u, weaponItem: wid, weaponSub: sub, weaponSlot: slot, skill: this.weaponSkillOf(sub) };
        maxRange = Math.max(maxRange, deploymentRange(wt.category, wt.subCategory ?? 0, wd.type, this.skillValOf(equipped), this.maxThrowDistance(equipped, 1.8) / CELL));
      }
    }
    maxRange = this.opts.maxRange ?? maxRange;
    this.fieldSize = this.opts.fieldWidth||this.opts.fieldHeight
      ? Math.max(1,Math.ceil(this.opts.fieldWidth??this.opts.fieldHeight!),Math.ceil(this.opts.fieldHeight??this.opts.fieldWidth!))
      : Math.max(50, Math.ceil(maxRange));
    const player = this.gd.Caravans[0];
    const playerPosition = { x: player?.x ?? 0, y: player?.y ?? 0 };
    const enemyPosition = this.opts.enemyPosition ?? { x: playerPosition.x, y: playerPosition.y + 1 };
    // A random encounter has no second caravan position. Use opposite N/S rather than overlapping anchors.
    const positions = [playerPosition, enemyPosition.x === playerPosition.x && enemyPosition.y === playerPosition.y
      ? { x: playerPosition.x, y: playerPosition.y + 1 } : enemyPosition,
      ...(this.opts.additionalGroups ?? []).map(g=>g.position)];
    for (;;) {
      this.fieldPx = this.fieldSize * CELL;
      this.map = new Uint8Array(this.fieldSize * this.fieldSize);
      this.obstacles = [];
      this.generateObstacles();
      const occupied = this.map.slice();
      const anchors = deploymentAnchors(this.fieldSize, maxRange, positions, this.opts.groupLocations);
      let fits = true;
      for (let groupId=0;groupId<positions.length;groupId++) {
        // The original adds transports before people, reserving their entire footprint.
        const group = this.units.filter(u => this.groupOf(u) === groupId).sort((a, b) => Number(!!b.isTransport) - Number(!!a.isTransport));
        const heading=groupId===0?player?.direction:groupId===1?this.opts.enemyDirection:this.opts.additionalGroups?.[groupId-2]?.direction;
        const transportDir=transportDirection(anchors[groupId],this.fieldSize,heading??0);
        const roots=group.filter(u=>u.isTransport&&!group.some(v=>v.transportRef?.cart===u.transportRef));
        const dimensions=(u:BattleUnit)=>{const d=this.ds.transports?.Types?.[u.transportType??0];return transportDir%2?{width:d?.height??1,height:d?.width??1}:{width:d?.width??1,height:d?.height??1};};
        const formation=transportFormation(anchors[groupId],transportDir,roots.map(u=>{
          const cart=u.transportRef?.cart?group.find(v=>v.transportRef===u.transportRef.cart):undefined;
          return {...dimensions(u),cart:cart?dimensions(cart):undefined};
        }));
        const targets=new Map(roots.map((u,i)=>[u,formation[i]]));
        const placed = new Set<BattleUnit>();
        group.sort((a,b) => Number(!!a.transportRef?.attachedTo) - Number(!!b.transportRef?.attachedTo));
        for (const u of group) {
          if (placed.has(u)) continue;
          const direction = u.isTransport ? transportDir : facingCenter(anchors[groupId].x, anchors[groupId].y, this.fieldSize);
          const def = u.isTransport ? this.ds.transports?.Types?.[u.transportType ?? 0] : null;
          let width = def?.width ?? 1, height = def?.height ?? 1;
          if (direction === 1 || direction === 3) [width, height] = [height, width];
          const cart = u.transportRef?.cart ? group.find(v => v.transportRef === u.transportRef.cart) : undefined;
          const cartDef = cart ? this.ds.transports?.Types?.[cart.transportType ?? 0] : null;
          const cartSize = cartDef ? (direction % 2 ? {width:cartDef.height,height:cartDef.width} : {width:cartDef.width,height:cartDef.height}) : null;
          const attached = cartSize ? {...cartSize,offset:cartOffset(direction,{width,height},cartSize)} : undefined;
          const cell = findDeploymentCell(occupied, this.fieldSize, targets.get(u)??anchors[groupId], width, height, attached);
          if (!cell) { fits = false; break; }
          if (cart && attached) {
            const cp = {x:cell.x+attached.offset.x,y:cell.y+attached.offset.y};
            cart.squareX=cp.x; cart.squareY=cp.y; cart.x=(cp.x+.5)*CELL; cart.y=(cp.y+.5)*CELL;
            cart.facing=direction; cart.transportFootprint={width:attached.width,height:attached.height};
            occupyDeploymentCell(occupied,this.fieldSize,cp,attached.width,attached.height);
            occupyDeploymentCell(this.map,this.fieldSize,cp,attached.width,attached.height);
            placed.add(cart);
          }
          placed.add(u);
          u.squareX = cell.x; u.squareY = cell.y;
          u.x = (cell.x + 0.5) * CELL; u.y = (cell.y + 0.5) * CELL;
          u.facing = u.isTransport ? direction : facingCenter(cell.x, cell.y, this.fieldSize);
          occupyDeploymentCell(occupied, this.fieldSize, cell, width, height);
          if (u.isTransport) {
            u.transportFootprint = { width, height };
            occupyDeploymentCell(this.map, this.fieldSize, cell, width, height);
          }
        }
        if (!fits) break;
      }
      if (fits) break;
      // Oversized custom squads: expand instead of stacking characters on occupied cells.
      this.fieldSize += 10;
    }
    this.camX = 0; this.camY = 0;
  }

  placeUnit(u: BattleUnit, gx: number, gy: number) {
    const occupied = this.map.slice();
    for (const other of this.units) if (other !== u && other.x > 0 && !other.dead) occupied[other.squareY * this.fieldSize + other.squareX] = 1;
    const p = findDeploymentCell(occupied, this.fieldSize, { x: gx, y: gy });
    if (!p) return false;
    u.squareX = p.x; u.squareY = p.y;
    u.x = (p.x + 0.5) * CELL; u.y = (p.y + 0.5) * CELL;
    u.facing = facingCenter(p.x, p.y, this.fieldSize);
    return true;
  }

  generateObstacles() {
    this.obstacles = placeObstacles(this.ds.obstacles?.obstacles ?? [], this.fieldSize, this.fieldSize,
      this.map, this.opts.fixedObstacles);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.fieldSize && y < this.fieldSize;
  }

  aStar(sx: number, sy: number, tx: number, ty: number, _maxSteps?: number): Array<{ x: number; y: number }> | null {
    if (sx === tx && sy === ty) return [];
    if (!this.inBounds(tx, ty) || this.map[ty * this.fieldSize + tx]) return null;
    const sz = this.fieldSize;
    const parent = new Int32Array(sz * sz).fill(-1);
    const gScore = new Int32Array(sz * sz).fill(1 << 28);
    const fScore = new Int32Array(sz * sz).fill(1 << 28);
    const start = sy * sz + sx, goal = ty * sz + tx;
    gScore[start] = 0;
    const heur = (x: number, y: number) => Math.abs(x - tx) + Math.abs(y - ty);
    fScore[start] = heur(sx, sy);
    const open = [start];
    const closed = new Uint8Array(sz * sz);
    const inOpen = new Uint8Array(sz * sz);
    inOpen[start] = 1;
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    let guard = 0;
    while (open.length && guard++ < 60000) {
      const cur = open.shift()!;
      closed[cur] = 1;
      inOpen[cur] = 0;
      if (cur === goal) {
        const path: Array<{ x: number; y: number }> = [];
        let node = goal;
        while (node !== start) {
          const nx = node % sz, ny = Math.floor(node / sz);
          path.unshift({ x: nx, y: ny });
          node = parent[node];
        }
        return path;
      }
      const cx = cur % sz, cy = Math.floor(cur / sz);
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inBounds(nx, ny) || this.map[ny * sz + nx] || closed[ny * sz + nx]) continue;
        let occupied = false;
        for (const u of this.units) {
          if (!u.dead && u.squareX === nx && u.squareY === ny) {
            occupied = true;
            break;
          }
        }
        if (occupied) continue;
        const ng = gScore[cur] + 1;
        const nid = ny * sz + nx;
        if (ng < gScore[nid]) {
          parent[nid] = cur;
          gScore[nid] = ng;
          fScore[nid] = ng + heur(nx, ny);
          if(inOpen[nid])open.splice(open.indexOf(nid),1);
          // AStarMap.as: prepend equal-lowest F, append equal-highest F, otherwise insert between.
          if(!open.length||fScore[nid]<=fScore[open[0]])open.unshift(nid);
          else if(fScore[nid]>=fScore[open[open.length-1]])open.push(nid);
          else {const at=open.findIndex((id,i)=>i>0&&fScore[nid]>=fScore[open[i-1]]&&fScore[nid]<=fScore[id]);open.splice(at,0,nid);}
          inOpen[nid] = 1;
        }
      }
    }
    return null;
  }

  lineCells(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (let i = 0; i < 1000; i++) {
      out.push([x, y]);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    return out;
  }

  losBlockRatio(from: BattleUnit, to: BattleUnit): number {
    const cells = this.lineCells(from.squareX, from.squareY, to.squareX, to.squareY);
    let blocked = 0;
    for (const [x, y] of cells) {
      if (this.map[y * this.fieldSize + x]) blocked++;
    }
    return cells.length ? blocked / cells.length : 0;
  }

  unitMaxAP(u: BattleUnit): number {
    if (u.character && typeof u.character.maxAP === "number") return Math.max(2, u.character.maxAP);
    let ap = 5 + Math.round(u.baseAgility * 1.5 + Math.pow(u.exp ?? 0, 0.5) / 40);
    if (u.battleMorale < 20) ap--;
    if (u.battleMorale < 10) ap--;
    if (u.battleMorale > 90) ap++;
    return Math.max(2, ap);
  }

  weaponOf(u: BattleUnit): any {
    return u.weaponItem ? getItemData(this.ds, u.weaponItem) : null;
  }

  weaponDefOf(u: BattleUnit): any {
    // weaponOf 杩斿洖鐨勫凡鏄?Weapons.subCategory 琛紙getItemData cat2 鈫?Weapons[sub]锛夛紱
    // 寰掓墜锛坵eaponItem=0锛夎蛋 type0锛屼笌鍘熺増 WeaponTypes[0].modes 瀵瑰簲
    return this.weaponOf(u) ?? this.ds.weapons.Weapons?.[0] ?? null;
  }

  weaponTypeOf(u: BattleUnit): any {
    const w = this.weaponDefOf(u);
    return w ? (this.ds.weapons.WeaponTypes?.[w.type] ?? null) : null;
  }

  weaponCategory(u: BattleUnit): number {
    return this.weaponTypeOf(u)?.category ?? 0;
  }

  needsAmmo(u: BattleUnit): boolean {
    const c = this.weaponCategory(u);
    return c >= 2 && c <= 4;
  }

  activeSlot(u: BattleUnit): number {
    const s = u.weaponSlot ?? 0;
    return Math.max(0, Math.min(1, s));
  }

  weaponSubOf(u: BattleUnit): number {
    return u.weaponSub ?? 0;
  }

  skillOf(u: BattleUnit): string {
    const sub = this.weaponSubOf(u);
    return sub ? Character.detectWeaponSkill(this.ds, sub) : "unarmed";
  }

  // 鍘熺増 updateInterface锛歭oadedAmmoName/selectedAmmoName 鏄剧ず鐭悕 Texts.fetch(Ammo.variation)锛堝"鍦嗗脊澶?锛夛紝
  // 鑰岄潪 itemName 鐨?鍙ｅ緞鍚?鍙樹綋"鍏ㄥ悕锛堝叏鍚?75px 妗嗘斁涓嶄笅锛屽鑷村眳涓け鏁堬級
  ammoShortNameOf(type: number): string {
    const it = type ? this.ds.items.Items[type] : null;
    if (!it || it.category !== 3) return "";
    const def = this.ds.weapons.Ammo?.[it.subCategory];
    if (!def) return "";
    const key = String(def.variation ?? 0);
    const t = this.ds.texts?.[key];
    return (Array.isArray(t) ? (t[this.ds.language] ?? t[1] ?? t[0]) : "") || "";
  }
  ammoNameOf(u: BattleUnit): string {
    const slot = this.activeSlot(u);
    const la = u.loadedAmmo?.[slot];
    if (!la) return "???";
    return this.ammoShortNameOf(la.type) || itemName(this.ds, la.type) || "寮硅嵂";
  }

  ammoStateOf(u: BattleUnit): { loaded: number; capacity: number; reserve: number; name: string; ammoName: string; selectedName: string } {
    const wd = this.weaponDefOf(u);
    const slot = this.activeSlot(u);
    const la = u.loadedAmmo?.[slot];
    const sel = u.selectedAmmo?.[slot];
    const cap = this.needsAmmo(u) ? (wd?.ammoCapacity ?? 0) : 0;
    const reserve = this.needsAmmo(u) ? this.ammoReserveOf(u) : 0;
    const name = this.ammoNameOf(u);
    return {
      loaded: la?.amount ?? 0, capacity: cap, reserve, name,
      ammoName: la && la.type ? (this.ammoShortNameOf(la.type) || itemName(this.ds, la.type) || "") : "",
      selectedName: sel && sel.type ? (this.ammoShortNameOf(sel.type) || itemName(this.ds, sel.type) || "") : "",
    };
  }

  // 鍘熺増 Character reload锛氫粠 equipment锛坈at3 涓?Ammo[sub].type == 寮硅嵂鍙ｅ緞锛夊彇寮癸紱
  // 鏁屼汉鐢熸垚鏃舵棤 equipment 钀芥。锛岀敤 BattleUnit.ammoReserve 棰勭畻锛堝閲徝?锛夈€?
  ammoReserveOf(u: BattleUnit): number {
    if (!this.needsAmmo(u)) return 0;
    const wd = this.weaponDefOf(u);
    if (!wd) return 0;
    if (wd.ammo === 17) return Math.floor(this.gd.Caravans?.[0]?.money ?? 0);
    const cal = wd.ammo;
    if (u.character) {
      let n = 0;
      for (const e of Array.isArray(u.character.equipment) ? u.character.equipment : []) {
        if (!e) continue;
        const it = this.ds.items.Items[e.type];
        const am = it ? (this.ds.weapons.Ammo?.[it.subCategory] ?? null) : null;
        if (it && it.category === 3 && am && am.type === cal) {
          n += Math.max(0, (e.amount ?? 0) - (e.inUse ?? 0));
        }
      }
      return n;
    }
    // 鏁屼汉锛氬師鐗?distributeAmmo 鍒嗗彂鐨勬寜鍙ｅ緞搴撳瓨锛坙egacy ammoReserve 骞惰鍏滃簳锛?
    return (u.enemyAmmo?.[cal] ?? 0) + (u.ammoReserve ?? 0);
  }

  reloadAPOf(u: BattleUnit): number {
    const wt = this.weaponTypeOf(u);
    const base = wt?.reloadAP ?? 0;
    return u.armDamage ? base * 2 : base;
  }

  modeAPOf(u: BattleUnit, mode?: any): number {
    const m = mode ?? this.modeOf(u);
    const base = m?.AP ?? 3;
    return u.armDamage ? base * 2 : base;
  }

  modeOf(u: BattleUnit): any {
    const w = this.weaponDefOf(u);
    const modes = (this.ds.weapons.WeaponTypes?.[w?.type]?.modes ?? []);
    if (!modes.length) return { AP: 3, hitProbability: 1, damageMultiplier: 1, accuracy: 1, name: 0 };
    const slot = this.activeSlot(u);
    const idx = Math.min((u.modeIdx?.[slot] ?? 0) | 0, Math.max(0, modes.length - 1));
    return modes[idx] ?? modes[0];
  }

  setMode(u: BattleUnit, idx: number) {
    const slot = this.activeSlot(u);
    const modes = this.ds.weapons.WeaponTypes?.[this.weaponDefOf(u)?.type]?.modes ?? [];
    if (!modes.length) return;
    const next = ((idx % modes.length) + modes.length) % modes.length;
    if (!u.modeIdx) u.modeIdx = [0, 0];
    u.modeIdx[slot] = next;
    if (u.character && Array.isArray(u.character.currModes)) u.character.currModes[slot] = next;
    if (u.side === 0) this.modeIdx = next;
  }

  cycleMode(dir = 1) {
    if (!this.inControl()) return;
    const cur = this.order[this.turnIdx];
    if (!cur || cur.side !== 0) return;
    const modes = this.ds.weapons.WeaponTypes?.[this.weaponDefOf(cur)?.type]?.modes ?? [];
    if (modes.length < 2) {
      return;
    }
    const slot = this.activeSlot(cur);
    const next = (((cur.modeIdx?.[slot] ?? 0) + dir) % modes.length + modes.length) % modes.length;
    this.setMode(cur, next);
    sfxClick();
    const mode = modes[next];
    const label = this.text(mode.name ?? 0) || "Mode " + (next + 1);
    this.refreshInfo();
  }

  gbeSpend(u: BattleUnit, cost: number) {
    if (u.character) {
      u.character.generalBattleExperience =
        (u.character.generalBattleExperience ?? 0) + cost * (0.5 + (u.character.learningCapacity ?? 100) * 0.5);
    } else {
      u.exp = (u.exp ?? 0) + cost;
    }
  }

  // ---- 寮硅嵂锛氳濉?/ 鎹㈠脊锛堝師鐗?BattleField.reload + Character.reload/unloadWeapon锛?----
  canReload(u: BattleUnit): boolean {
    return this.needsAmmo(u) && this.reloadAPOf(u) > 0;
  }

  loadMagazine(u: BattleUnit, silent = false): boolean {
    if (!this.needsAmmo(u)) return false;
    const wd = this.weaponDefOf(u);
    if (!wd) return false;
    const slot = this.activeSlot(u);
    const cap = wd.ammoCapacity ?? 1;
    if (!u.loadedAmmo) u.loadedAmmo = [null, null];
    if (!u.selectedAmmo) u.selectedAmmo = [null, null];
    const cur = u.loadedAmmo[slot];
    if (cur && cur.amount >= cap && cur.type === (u.selectedAmmo?.[slot]?.type ?? cur.type)) return false;
    if (wd.ammo === 17) {
      // 鍘熺増 currentAmmo锛歛mmo17 = 鑺遍挶涔板脊锛坢oney 鍗冲脊鑽級
      u.loadedAmmo[slot] = { type: 231, amount: Math.min(cap, Math.floor(this.gd.Caravans?.[0]?.money ?? 0)) };
      return (u.loadedAmmo[slot]?.amount ?? 0) > 0;
    }
    const cal = wd.ammo;
    let srcType = 0;
    if (u.character) {
      const sel = u.selectedAmmo?.[slot]?.type ?? 0;
      for (const e of Array.isArray(u.character.equipment) ? u.character.equipment : []) {
        if (!e) continue;
        const it = this.ds.items.Items[e.type];
        const am = it ? (this.ds.weapons.Ammo?.[it.subCategory] ?? null) : null;
        if (it && it.category === 3 && am && am.type === cal && (e.amount ?? 0) - (e.inUse ?? 0) > 0) {
          if (srcType === 0 || e.type === sel) srcType = e.type;
          if (e.type === sel) break;
        }
      }
      if (!srcType) {
        return false;
      }
      // 鍗歌浇鏃у脊鍥?equipment锛堝師鐗?unloadWeapon 璇箟锛歩nUse 褰掕繕锛?
      const eq = u.character.equipment ?? [];
      if (cur && cur.amount > 0) {
        for (const e of eq) if (e && e.type === cur.type) e.inUse = Math.max(0, (e.inUse ?? 0) - cur.amount);
      }
      const available = ((eq.find((e: any) => e && e.type === srcType)?.amount ?? 0) - (eq.find((e: any) => e && e.type === srcType)?.inUse ?? 0));
      const take = Math.min(cap, Math.max(0, available));
      if (take <= 0) {
        return false;
      }
      for (const e of eq) if (e && e.type === srcType) e.inUse = (e.inUse ?? 0) + take;
      u.loadedAmmo[slot] = { type: srcType, amount: take };
      u.selectedAmmo[slot] = { type: srcType, amount: take };
      return true;
    }
    // 鏁屼汉锛氭寜寮硅嵂鍙ｅ緞鎵ｅ簱瀛橈紙鍘熺増 reload 浠?equipment 鍙栧搴斿彛寰勫脊鑽級
    if (u.enemyAmmoItems) {
      const matching = Object.keys(u.enemyAmmoItems).map(Number).filter(id => (u.enemyAmmoItems![id] ?? 0) > 0
        && this.ds.items.Items[id]?.category === 3 && this.ds.weapons.Ammo[this.ds.items.Items[id].subCategory]?.type === cal);
      srcType = matching.find(id => id === u.selectedAmmo?.[slot]?.type) ?? matching[0] ?? 0;
      if (!srcType) return false;
      if (cur && cur.amount > 0) this.unloadWeapon(u);
      const take = Math.min(cap, u.enemyAmmoItems[srcType]);
      u.enemyAmmoItems[srcType] -= take;
      (u.enemyAmmo ??= {})[cal] = Math.max(0, (u.enemyAmmo[cal] ?? 0) - take);
      u.loadedAmmo[slot] = { type: srcType, amount: take };
      u.selectedAmmo[slot] = { type: srcType, amount: take };
    } else {
      // Legacy synthetic units have caliber totals only; never substitute money-ammo.
      srcType = this.ammoItemForCaliber(cal);
      if (srcType <= 0) return false;
      if (!u.enemyAmmo) u.enemyAmmo = {};
      const take = Math.min(cap, (u.enemyAmmo[cal] ?? 0) + (u.ammoReserve ?? 0));
      if (take <= 0) return false;
      const fromMap = Math.min(take, u.enemyAmmo[cal] ?? 0);
      u.enemyAmmo[cal] = (u.enemyAmmo[cal] ?? 0) - fromMap;
      u.ammoReserve = (u.ammoReserve ?? 0) - (take - fromMap);
      u.loadedAmmo[slot] = { type: srcType, amount: take };
    }
    return true;
  }

  doReload(u?: BattleUnit, silent = false): boolean {
    if (!u && !this.inControl()) return false;
    const who = u ?? this.order[this.turnIdx];
    if (!who || who.dead || who.side !== 0 && !u) return false;
    if (this.phase !== "player" && !u) return false;
    if (!this.canReload(who)) {
      if (!silent) {
        playSound("SFXError.mp3");
      }
      return false;
    }
    const cost = this.reloadAPOf(who);
    if (who.AP < cost) {
      if (!silent) {
        playSound("SFXError.mp3");
      }
      return false;
    }
    if (!this.loadMagazine(who, silent)) {
      if (!silent) {
        playSound("SFXError.mp3");
      }
      return false;
    }
    who.AP -= cost;
    this.gbeSpend(who, cost);
    if (!silent) playSound("SFXReload.mp3");
    // 鍘熺増 reload 娑堣€?reduceAP锛汚P 鑰楀敖鑷姩涓嬩竴鍥炲悎
    this.refreshInfo();
    this.checkEnd();
    if (!this.gameOver && who.AP <= 0 && this.phase === "player") this.advanceTurn();
    return true;
  }

  consumeAmmo(u: BattleUnit, n: number) {
    const wd = this.weaponDefOf(u);
    const slot = this.activeSlot(u);
    if (!this.needsAmmo(u) || n <= 0) return;
    if (wd?.ammo === 17) {
      const c = this.gd.Caravans?.[0];
      if (c) c.money = Math.max(0, (c.money ?? 0) - n);
      return;
    }
    const la = u.loadedAmmo?.[slot];
    if (la) la.amount = Math.max(0, la.amount - n);
    if (u.character) {
      const eq = u.character.equipment ?? [];
      for (const e of eq) if (e && e.type === la?.type) e.inUse = Math.max(0, (e.inUse ?? 0) - n);
    }
  }

  // ---- 鍙屾鍣ㄦЫ锛堝師鐗?switchWeapon / dropWeapon / pickUpWeapon / canPickUp锛?----
  switchWeapon(u?: BattleUnit) {
    if (!u && !this.inControl()) return ;
    const who = u ?? this.order[this.turnIdx];
    if (!who || who.dead || who.side !== 0 && !u) return;
    if (this.phase !== "player" && !u) return;
    const slots = who.weaponItems ?? [who.weaponItem ?? 0, 0];
    const cur = this.activeSlot(who);
    const next = cur === 0 ? 1 : 0;
    if (!slots[next] && !slots[cur]) {
      return;
    }
    who.weaponSlot = next;
    who.weaponItem = slots[next] ?? 0;
    who.weaponSub = who.weaponItem ? (this.ds.items.Items[who.weaponItem]?.subCategory ?? 0) : 0;
    who.skill = this.weaponSkillOf(who.weaponSub);
    if (who.character && Array.isArray(who.character.weapons)) who.character.currSlot = who.character.currSlot ?? 0;
    sfxClick();
    const n = who.weaponItem ? itemName(this.ds, who.weaponItem) : "寰掓墜";
    this.updateWeaponIcon(who);
    this.refreshInfo();
  }

  dropWeapon(u?: BattleUnit) {
    if (!u && !this.inControl()) return;
    const who = u ?? this.order[this.turnIdx];
    if (!who || who.dead) return;
    if (!this.detachWeapon(who)) return;
    playSound("SFXDropWeapon.mp3");
    this.redrawField();
    this.updateWeaponIcon(who);
    this.refreshInfo();
  }

  /** BattleField.dropWeapon and death frame 5 share the same ownership transfer. */
  private detachWeapon(who: BattleUnit, corpse = false): DroppedWeapon | null {
    const slot = this.activeSlot(who);
    const slots = who.weaponItems ?? [who.weaponItem ?? 0, 0];
    const wid = slots[slot];
    if (!wid) return null;
    const item = this.ds.items.Items[wid];
    const isGren = this.weaponCategory(who) === 5;
    const la = who.loadedAmmo?.[slot];
    const attachments = (who.character?.attachments?.[slot] ?? who.attachments?.[slot] ?? []).filter((a: number | null) => !!a) as number[];
    const entry: DroppedWeapon = {
      sub: item?.subCategory ?? 0,
      ammoType: isGren ? 0 : la?.type ?? 0,
      ammoAmount: isGren ? (who.grenadeAmounts?.[slot] ?? 1) : (la?.amount ?? 0),
      attachments: [...attachments], ...(corpse ? { corpse: who } : {}),
    };
    this.droppedWeapons ??= new Map();
    const key = who.squareX + "," + who.squareY;
    const entries = this.droppedWeapons.get(key) ?? [];
    entries.push(entry);
    this.droppedWeapons.set(key, entries);
    // Capture and remove the actual item BEFORE clearing its slot (old code read id 0).
    if (who.character) {
      who.character.reduceItemFromEquipment(wid, isGren ? Math.max(1, entry.ammoAmount) : 1, true);
      if (entry.ammoType && entry.ammoAmount) who.character.reduceItemFromEquipment(entry.ammoType, entry.ammoAmount, true);
      for (const sub of attachments) who.character.reduceItemFromEquipment(Character.attachmentItemId(this.ds, sub), 1, true);
      who.character.weapons[slot] = 0;
      who.character.loadedAmmo[slot] = null;
      who.character.attachments[slot] = [];
      if (who.character.grenadeAmounts) who.character.grenadeAmounts[slot] = 0;
      who.character.updateSelectedAmmo?.(slot);
    }
    slots[slot] = 0;
    who.weaponItems = slots;
    (who.loadedAmmo ??= [null, null])[slot] = null;
    (who.attachments ??= [[], []])[slot] = [];
    if (who.grenadeAmounts) who.grenadeAmounts[slot] = 0;
    who.weaponItem = 0;
    who.weaponSub = 0;
    who.skill = this.weaponSkillOf(0);
    return entry;
  }

  private updateDeathEvents(u: BattleUnit, anim: DollAnim) {
    if (anim.phase !== 4 || (!u.dying && !u.dead)) return;
    if (anim.frame >= 5 && !(u as any).__deathDropped) {
      u.dead = true; u.dying = false;
      (u as any).__deathDropped = true;
      this.detachWeapon(u, true);
      this.hud?.invalidateMiniMap();
      this.checkEnd(true);
      if (!this.gameOver) this.refreshInfo();
      if (!this.gameOver && this.order[this.turnIdx] === u) this.advanceTurn(true);
    }
    if (anim.frame >= 7 && !(u as any).__bodyFall) {
      (u as any).__bodyFall = true;
      playSound("SFXBodyFall.mp3");
    }
  }

  canPickUpAt(gx: number, gy: number): boolean {
    return !!this.droppedWeapons && (this.droppedWeapons.get(gx + "," + gy)?.length ?? 0) > 0;
  }

  pickUpWeapon(u?: BattleUnit, gx?: number, gy?: number) {
    if (!u && !this.inControl()) return ;
    const who = u ?? this.order[this.turnIdx];
    if (!who || who.dead || who.side !== 0 && !u) return;
    if (this.phase !== "player" && !u) return;
    const px = gx ?? who.squareX, py = gy ?? who.squareY;
    if (px !== who.squareX || py !== who.squareY) {
      // 鍘熺増 pickUpPos 璇箟锛氬彧鑳芥崱鑴氫笅姝﹀櫒
      return;
    }
    if (!this.canPickUpAt(px, py)) return;
    const slot = this.activeSlot(who);
    if ((who.weaponItems?.[slot] ?? 0) !== 0) {
      return;
    }
    const cost = who.armDamage ? 6 : 3;
    if (who.AP < cost) {
      return;
    }
    const arr = this.droppedWeapons!.get(px + "," + py)!;
    const index = Math.max(0, arr.length - Math.min(this.pickUpPos, arr.length - 1) - 1);
    const entry = arr.splice(index, 1)[0];
    this.pickUpPos = Math.max(0, Math.min(this.pickUpPos, arr.length - 1));
    if (entry.corpse) {
      const anim = (entry.corpse as any).__doll as DollAnim | undefined;
      if (anim) anim.weaponSub = 0;
    }
    (who.attachments ??= [[], []])[slot] = [...entry.attachments];
    if (!arr.length) this.droppedWeapons!.delete(px + "," + py);
    // 鎵?item id
    let wid = 0;
    const items = this.ds.items.Items;
    for (let i = 1; i < items.length; i++) {
      if (items[i] && items[i].category === 2 && items[i].subCategory === entry.sub) { wid = i; break; }
    }
    (who.weaponItems ??= [0, 0])[slot] = wid;
    (who.loadedAmmo ??= [null, null])[slot] = entry.ammoType && entry.ammoAmount > 0
      ? { type: entry.ammoType, amount: entry.ammoAmount } : null;
    const wd = wid ? this.ds.weapons.Weapons?.[entry.sub] : null;
    const wt = wd ? this.ds.weapons.WeaponTypes?.[wd.type] : null;
    if (wt?.category === 5) {
      (who.grenadeAmounts ??= [0, 0])[slot] = entry.ammoAmount || 1;
    }
    if (who.character) {
      if (Array.isArray(who.character.weapons)) who.character.weapons[slot] = entry.sub;
      who.character.loadedAmmo[slot] = null;
      if (entry.ammoType && entry.ammoAmount > 0) {
        who.character.loadedAmmo[slot] = { type: entry.ammoType, amount: entry.ammoAmount, inUse: 0 };
        who.character.addItemToEquipment({ type: entry.ammoType, amount: entry.ammoAmount, inUse: 0 }, false);
      }
      who.character.attachments[slot] = [...entry.attachments];
      for (const sub of entry.attachments) who.character.addItemToEquipment(Character.attachmentItemId(this.ds, sub), true);
      if (wid) who.character.addItemToEquipment({ type: wid, amount: wt?.category === 5 ? entry.ammoAmount || 1 : 1 }, true);
      if (Array.isArray(who.character.grenadeAmounts)) who.character.grenadeAmounts[slot] = who.grenadeAmounts?.[slot] ?? 0;
    }
    who.weaponItem = wid;
    who.weaponSlot = slot;
    who.weaponSub = wid ? (this.ds.items.Items[wid]?.subCategory ?? 0) : 0;
    who.skill = this.weaponSkillOf(who.weaponSub);
    who.AP -= cost;
    this.gbeSpend(who, cost);
    this.redrawField();
    this.updateWeaponIcon(who);
    this.refreshInfo();
    if (!this.gameOver && who.AP <= 0 && this.phase === "player") this.advanceTurn();
  }

  toggleHealingMode() {
    if (!this.inControl()) return;
    const cur = this.order[this.turnIdx];
    if (!cur || cur.side !== 0 || this.gameOver) return;
    // BattleField.as:6172: having medicine permits entering the targeting mode.
    this.healingMode = !this.healingMode && !!this.firstAidKitOf(cur);
    this.pathCells = []; this.hoverGx = this.hoverGy = -1;
    this.refreshInfo(); // The red bulb reflects the mode immediately, not the next AP change.
    sfxClick();
  }

  // ---- 鎶€鑳藉€硷紙鍘熺増 Character 鍚?skill getter锛涙晫浜烘寜 spec 缁忛獙澶嶇畻锛?----
  skillValOf(u: BattleUnit): number {
    const sk = this.skillOf(u);
    if (u.character) {
      const v = (u.character as any)[sk + "Skill"];
      if (typeof v === "function") return v();
      if (typeof v === "number") return v;
    }
    const intel = u.baseIntelligence ?? 10;
    const ph = u.basePhysical ?? 10;
    const acc = u.baseAccuracy ?? 10;
    const rws = intel * 10;
    const e = (k: string) => u.skillExperience?.[k] ?? 0;
    switch (sk) {
      case "pistol": return Math.round(rws * 0.7 + Math.sqrt(e("pistolExperience")) * 0.3);
      case "rifle": return Math.round(rws * 0.6 + Math.sqrt(e("rifleExperience")) * 0.4);
      case "machinegun": case "smg": return Math.round(rws * 0.5 + Math.sqrt(e(sk + "Experience")) * 0.5);
      case "shotgun": return Math.round(rws * 0.6 + Math.sqrt(e("shotgunExperience")) * 0.4);
      case "crossbow": return Math.round(rws * 0.5 + Math.sqrt(e("crossbowExperience")) * 0.5);
      case "rocketLauncher": return Math.round(rws * 0.5 + Math.sqrt(e("rocketLauncherExperience")) * 0.5);
      case "flamethrower": return Math.round(rws * 0.2 + Math.sqrt(e("flamethrowerExperience")) * 0.8);
      case "unarmed": return ph * 1.5 + acc * 0.4 + Math.sqrt(e("unarmedExperience"));
      case "knives": case "clubs": case "chopping": case "swords":
        return ph * 1.8 + acc * 0.7 + Math.sqrt(e(sk + "Experience") ?? 0);
      default:
        return ph * 1.8 + acc * 0.7;
    }
  }

  // 鍘熺増 calculateMaxShotOffset锛? / (skill 脳 mode.accuracy 脳 weapon.accuracy 脳 (1+attachments.accuracy) / 10)
  private attachmentsEffectsOf(u: BattleUnit): {accuracy:number;ap:number;spread:number} {
    if (typeof u.character?.attachmentsEffects === "function") return u.character.attachmentsEffects(this.activeSlot(u));
    const result={accuracy:0,ap:0,spread:0};
    for(const sub of u.attachments?.[this.activeSlot(u)]??[]) {
      const a=this.ds.weapons.Attachments?.[sub??0];
      if(!a || a.scope && !(this.modeOf(u).headShot || this.modeOf(u).aimed) || a.batteryConsumption>0) continue;
      result.accuracy+=a.affectAccuracy??0; result.ap+=a.affectAP??0; result.spread+=a.affectSpread??0;
    }
    return result;
  }

  calculateMaxShotOffset(u: BattleUnit): number {
    const skill = this.skillValOf(u);
    const mode = this.modeOf(u);
    const wd = this.weaponDefOf(u);
    if (!wd || !this.needsAmmo(u)) return 0.05;
    const denom = skill * (mode.accuracy ?? 1) * (wd.accuracy ?? 1) * (1+this.attachmentsEffectsOf(u).accuracy) / 10;
    if (denom <= 0) return Math.PI;
    return Math.min(1 / denom, Math.PI);
  }

  /** Original direction-dependent body diamond, not a fixed neutral pose. */
  targetSegments(t: BattleUnit): Array<{ x: number; y: number }> {
    const d = (t as any).__doll?.dir ?? t.facing ?? 0;
    const rx = d % 2 ? 7 : 10, ry = d % 2 ? 10 : 7;
    return [{x:t.x-rx,y:t.y},{x:t.x,y:t.y-ry},{x:t.x+rx,y:t.y},{x:t.x,y:t.y+ry}];
  }

  /** Shared original contours: bullets/flames ignore low cover; grenades test its height. */
  private collisionContours(source: BattleUnit, allHeights = false): Contour<any>[] {
    const result: Contour<any>[] = [];
    for (const o of this.obstacles) {
      const d = this.ds.obstacles?.obstacles?.[o.type-1];
      if (!d?.segments || !allHeights && d.elevation !== 3) continue;
      result.push({owner:o, height:d.zHeight ?? 0, points:d.segments.map((p:any)=>({...p,x:(o.gx+p.x)*CELL,y:(o.gy+p.y)*CELL}))});
    }
    for (const u of this.units) {
      if (u === source || u.dead && (!u.isTransport || u.transportKind === "animal")) continue;
      if (!u.isTransport) { result.push({owner:u,height:1.6,points:this.targetSegments(u)}); continue; }
      const d = this.ds.transports?.Types?.[u.transportType ?? 1];
      if (!d?.segments || !allHeights && d.elevation <= 2) continue;
      const fp = u.transportFootprint ?? {width:d.width,height:d.height};
      result.push({owner:u,height:d.zHeight ?? 0,points:transportContour(d.segments,u.facing??0,fp.width,fp.height)
        .map(p=>({...p,x:u.x-CELL/2+p.x*CELL,y:u.y-CELL/2+p.y*CELL}))});
    }
    return result;
  }

  private fireRay(attacker: BattleUnit, angle: number, intendedTarget?: BattleUnit, hits?: Map<BattleUnit, number>, contours?: Contour<any>[]) {
    const end = {x:attacker.x+Math.sin(angle)*this.fieldPx*2,y:attacker.y+Math.cos(angle)*this.fieldPx*2};
    const hit = contacts(attacker,end,contours ?? this.collisionContours(attacker))[0];
    if (!hit) return;
    const victim = hit.contour.owner;
    if (!("_HP" in victim)) {
      playSound("SFXRicochet.mp3");
      const angle=this.angNorm(Math.atan2(hit.b.x-hit.a.x,hit.b.y-hit.a.y));
      this.fieldView?.wallHit?.(victim,hit.x,hit.y,angle<=Math.PI*.25||angle>=Math.PI*1.25);
      return;
    }
    const result = this.hitByProjectile(attacker,victim,angle,hit.distance,undefined,intendedTarget);
    const accumulated = hits ?? new Map<BattleUnit,number>();
    this.recordProjectileHit(victim,result,accumulated);
    if (!hits) this.settleProjectileHits(accumulated,attacker);
  }

  /** Shared by instantaneous rays and flying bolts: aimed eye damage is not ray-only. */
  private recordProjectileHit(victim: BattleUnit, result: {dmg:number;headshot:boolean}, hits: Map<BattleUnit,number>) {
    const total = (hits.get(victim) ?? 0) + result.dmg;
    hits.set(victim,total);
    if (result.headshot && (!this.damageFrameActive || !this.damageCaused) && !victim.eyeDamage && victim._HP > total + (this.frameDamage?.get(victim)?.amount??0)
        && Math.pow(Math.random(),this.gd.difficulty === 1 ? 7 : 5) > 1 / Math.pow(result.dmg,.1)) {
      victim.eyeDamage=1; this.damageCaused=true; this.battleMessage(victim,"eye");
    }
  }

  /** AS3 EF rounds accumulated parallel shots/pellets once per target, not once per pellet. */
  private settleProjectileHits(hits: Map<BattleUnit, number>, source: BattleUnit) {
    for (const [victim,total] of hits) {
      this.accumulateDamage(victim,total,source);
    }
  }

  private angNorm(a: number): number {
    while (a >= Math.PI * 2) a -= Math.PI * 2;
    while (a < 0) a += Math.PI * 2;
    return a;
  }

  private angDiff(a: number, b: number): number {
    let d = this.angNorm(a) - this.angNorm(b);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  private subtractWedges(open: Array<[number, number]>, blockers: Array<[number, number]>): Array<[number, number]> {
    let out = [...open];
    for (const [bl, bh] of blockers) {
      const next: Array<[number, number]> = [];
      for (const [ol, oh] of out) {
        if (bh <= ol || bl >= oh) { next.push([ol, oh]); continue; }
        if (bl > ol) next.push([ol, Math.min(bl, oh)]);
        if (bh < oh) next.push([Math.max(bh, ol), oh]);
      }
      out = next;
      if (!out.length) break;
    }
    return out;
  }

  private wedgeOf(px: number, py: number, cx: number, cy: number, rw: number): [number, number] {
    const cAng = this.angNorm(Math.atan2(cx - px, cy - py));
    const d = Math.max(Math.sqrt((cx - px) ** 2 + (cy - py) ** 2) - rw * 0.2, 1);
    const half = Math.atan2(rw, d);
    return [this.angNorm(cAng - half), this.angNorm(cAng + half)];
  }

  // 鍘熺増 aimRanged 鐨?web 绉绘锛氱洰鏍囪韩浣撹绐楀彛 鈭?闅滅/鍗曚綅閬尅 鈫?涓庡皠鍑绘暎甯冪獥鍙ｇ殑閲嶅彔姣斾緥鍗冲懡涓巼
  aimRanged(u: BattleUnit, t: BattleUnit, ox?: number, oy?: number, contours?: Contour<any>[], allContours?: Contour<any>[]): { hitChance: number; aimAngle: number } | null {
    if (!this.needsAmmo(u) || t.dead || t.dying) return null;
    const wd = this.weaponDefOf(u);
    const px = ox ?? u.x, py = oy ?? u.y;
    const distPx = Math.sqrt((t.x - px) ** 2 + (t.y - py) ** 2);
    // Weapon data range is in 32-pixel grid squares, not fifths of a square.
    const reach = Math.max(0, wd.range ?? 1) * CELL;
    if (distPx > reach) return null;
    contours ??= this.collisionContours(u);
    // Low transports remain aimable, but do not occlude other targets at bullet height.
    const target=contours.find(c=>c.owner===t) ?? (allContours ?? this.collisionContours(u,true)).find(c=>c.owner===t);
    if(!target) return null;
    const {center,windows}=visibleWindows({x:px,y:py},target,contours);
    if(!windows.length) return null;
    const widest=windows.reduce((a,b)=>b[1]-b[0]>a[1]-a[0]?b:a);
    const aim=(widest[0]+widest[1])/2, maxOff=this.calculateMaxShotOffset(u);
    const loaded=u.loadedAmmo?.[this.activeSlot(u)], ammoItem=loaded?this.ds.items.Items[loaded.type]:null;
    const ammo=ammoItem?this.ds.weapons.Ammo?.[ammoItem.subCategory]:null;
    const pellets=Math.max(1,ammo?.pallets??1), spread=pellets>1?(wd.spread??0)*(1+(this.attachmentsEffectsOf(u).spread??0)/10):0;
    let hitChance=0;
    for(let pellet=0;pellet<pellets;pellet++) {
      const direction=aim+(pellets>1?-spread/2+spread*pellet/(pellets-1):0);
      let probability=0;
      if(maxOff<=0) probability=Number(windows.some(([l,h])=>direction>=l&&direction<=h));
      else for(const [l,h] of windows) for(const shift of [-Math.PI*2,0,Math.PI*2])
        probability+=Math.max(0,Math.min(h+shift,direction+maxOff)-Math.max(l+shift,direction-maxOff))/(2*maxOff);
      hitChance+=Math.min(1,probability)*(1-hitChance);
    }
    return {hitChance,aimAngle:this.angNorm(center+aim)};
  }

  // 鍘熺増 hitByProjectile锛氬脊閬撳姩鑳芥ā鍨?+ 鎶ょ敳璐┛ + 璺濈琛板噺 + 鎿﹁繃瑙?+ 鐖嗗ご
  hitByProjectile(attacker: BattleUnit, target: BattleUnit, aimAngle: number, distPx: number, projectile?: { speed: number; weapon: any; mode: any; ammo: any; intendedTarget?: BattleUnit }, intendedTarget?: BattleUnit): { dmg: number; headshot: boolean } {
    const wd = projectile?.weapon ?? this.weaponDefOf(attacker);
    const mode = projectile?.mode ?? this.modeOf(attacker);
    const slot = this.activeSlot(attacker);
    const la = attacker.loadedAmmo?.[slot];
    const ammoIt = la ? this.ds.items.Items[la.type] : null;
    const ammoData = projectile?.ammo ?? (ammoIt ? (this.ds.weapons.Ammo?.[ammoIt.subCategory] ?? null) : null);
    if (!wd || !ammoData || (ammoData.projectileMass ?? 0) <= 0) return { dmg: 0, headshot: false };
    const targetKind = (target as any).transportKind ?? target.appearance?.transportKind;
    if (targetKind === "animal") playSound("SFXBulletHitsAnimal.mp3");
    else if (targetKind === "transport") playSound("SFXBulletHitsTransport.mp3");
    const mass = ammoData.projectileMass;
    const muzzle = (ammoData.muzzleVelocity ?? 0) * (1 + (wd.muzzleVelocityChange ?? 0));
    // 寮归亾绯绘暟 BC = FF 脳 SD锛汼D = mass脳1.422/diameter虏
    const cal = ammoData.type;
    const caliber = this.ds.weapons.Calibers?.[cal] ?? null;
    const dia = caliber?.bulletDiameter ?? ammoData.bulletDiameter ?? 9;
    const sd = mass * 1.422 / Math.pow(dia, 2);
    const bc = Math.max((ammoData.FF ?? 1) * sd, 0.001);
    const vloss = (1 / (bc * 25) - 0.02) / 100;
    const v = projectile?.speed ?? Math.max(muzzle * (1 - vloss * distPx / 32), 0);
    // 鎶ょ敳璐┛锛堝師鐗?L5279-5281锛?
    const aimedHit = !target.isTransport && target === (projectile?.intendedTarget ?? intendedTarget)
      && (mode.damageMultiplier??0)>0 && Math.random()<1-this.calculateMaxShotOffset(attacker)*distPx/20;
    let armor = aimedHit && mode.headShot ? Number(target.character?.headArmor ?? target.appearance?.headArmor ?? 0) : this.armorOf(target);
    if(!target.isTransport && armor>0 && Math.random()<Number(target.character?.bypassArmor ?? 0)) armor=0;
    const pen = Math.pow((armor * 50) / ((ammoData.armorPiercing ?? 1) * Math.pow(mass, 0.2)), 0.8264462809917356);
    const vRes = Math.max(v - pen, 0);
    const ke = mass * vRes * vRes / 2000;
    const diaF = ammoData.pallets > 1 ? (ammoData.bulletDiameter ?? dia) : dia;
    let dmg = (1 - 1 / (1 + Math.exp(0.03 * ke - 3))) * Math.pow(ke, 0.125) *
      (0.5 + ke / 2000 * Math.exp(-ke / 2000) / 2) * diaF * (ammoData.softTargetDamage ?? 1) * 3;
    // 鎿﹁繃瑙掞紙鍘熺増 L5283-5290锛?
    const ang = Math.atan2(target.x - attacker.x, target.y - attacker.y);
    const graze = distPx * Math.sin(Math.abs(this.angDiff(ang, aimAngle)));
    dmg *= Math.max((10 - graze) / 10, 0);
    this.itsAHeadShot=!!mode.headShot;
    if(aimedHit)this.successfulHeadShot=true;
    let headshot = !!(aimedHit && mode.headShot);
    if (graze < 3 && Math.random() < 0.01 + Math.pow((3-graze)/5,2)) dmg *= 2;
    if (aimedHit) dmg *= mode.damageMultiplier;
    // 鏋激娴佽锛堝師鐗?L5318锛?
    if (!target.isTransport && !target.dying) {
      target.bleeding += (diaF ?? 0) * Math.min(ke, 2000) / 5000 * (this.gd.difficulty === 2 ? 2 : 1);
    }
    return { dmg: Math.max(0, dmg), headshot };
  }

  // Original burn: immediate thermal damage is accumulated separately from ongoing burning.
  burn(u: BattleUnit, amount: number, x: number, y: number) {
    if (u.dead || amount <= 0) return;
    this.addFlameDamage(u, amount / 400, x, y);
    u.burning += amount / 500;
    u.battleMorale -= amount / 100;
  }

  private addFlameDamage(u: BattleUnit, amount: number, x: number, y: number) {
    const hit = this.flameDamage.get(u) ?? { pending: 0, total: 0, x, y };
    hit.pending += amount; hit.x = x; hit.y = y;
    this.flameDamage.set(u, hit);
  }

  /** Original burn/EF: aggregate each tick, recoil once after the final flame disappears. */
  private settleFlameDamage() {
    if(this.damageFrameActive)return;
    for (const [u, hit] of this.flameDamage) {
      if (this.flames.particles.length > 0) {
        if (hit.pending >= 0.5) hit.total += hit.pending;
        hit.pending = 0;
      } else {
        const damage = Math.round(hit.total + hit.pending);
        this.flameDamage.delete(u);
        if (damage > 0 && !u.dead) this.applyHit(u, damage, null, () => {}, true, hit, false);
      }
    }
  }

  private startFlamethrower(attacker: BattleUnit, target: BattleUnit) {
    const aim = this.aimRanged(attacker, target);
    const offset = this.calculateMaxShotOffset(attacker);
    const angle = (aim?.aimAngle ?? Math.atan2(target.x - attacker.x, target.y - attacker.y)) - offset + Math.random() * offset * 2;
    const anim = (attacker as any).__doll as DollAnim | undefined;
    if (anim) startPhase(anim, 0, weaponAnimType(this.ds.weapons, attacker.weaponSub), attacker.weaponSub, dirFromDelta(attacker.x - target.x, attacker.y - target.y));
    const xp = this.modeAPOf(attacker) / 5 * (attacker.character?.learningCapacity ?? 100);
    if (attacker.character) attacker.character.flamethrowerExperience = (attacker.character.flamethrowerExperience ?? 0) + xp;
    else (attacker.skillExperience ??= {}).flamethrowerExperience = (attacker.skillExperience?.flamethrowerExperience ?? 0) + xp;
    this.flames.start(attacker, angle, this.modeOf(attacker).burst ?? 30);
    this.pathCells = []; this.hoverGx = this.hoverGy = -1;
    playSound("SFXFlamethrowerStart.mp3");
    this.refreshInfo();
    if (attacker.AP <= 0 && this.phase === "player") this.advanceTurn();
  }

  private traceFlame(from: FlamePoint, to: FlamePoint, source: BattleUnit): FlamePoint | null {
    const hit = contacts(from,to,this.collisionContours(source))[0];
    return hit ? {x:hit.x,y:hit.y} : null;
  }

  private touchFlame(f: FlameParticle<BattleUnit>) {
    const gx = Math.floor(f.x / CELL), gy = Math.floor(f.y / CELL);
    for (const u of this.units) {
      if (u === f.firedBy || u.dead) continue;
      if (!u.isTransport) {
        const distance = Math.hypot(u.x - f.x, u.y - f.y);
        if (distance < 30) {
          const resistance = Number(u.character?.fireResistance ?? u.appearance?.fireResistance ?? 0);
          this.burn(u, Math.max(70 - Math.sqrt(distance) - Math.pow(f.frame, 0.1) * (1 - resistance / 100), 0), f.x, f.y);
        }
      } else {
        const fp = u.transportFootprint ?? { width: 1, height: 1 };
        const resistance = Number(this.ds.transports?.Types?.[u.transportType ?? 0]?.fireResistance ?? 0);
        for (let x = Math.max(gx - 1, u.squareX + 1 - fp.width); x <= Math.min(gx + 1, u.squareX); x++) {
          for (let y = Math.max(gy - 1, u.squareY + 1 - fp.height); y <= Math.min(gy + 1, u.squareY); y++) {
            const distance = Math.hypot((x + 0.5) * CELL - f.x, (y + 0.5) * CELL - f.y);
            this.addFlameDamage(u, (70 - Math.sqrt(distance) - Math.sqrt(f.frame)) * Math.max((100 - resistance) * 0.00003, 0), f.x, f.y);
          }
        }
      }
    }
  }

  private updateFlamethrower(dt: number) {
    this.flames.update(dt, {
      emit: u => {
        const ammo = u.loadedAmmo?.[this.activeSlot(u)];
        if (!ammo || ammo.amount <= 0 || u.dead) return -1;
        this.consumeAmmo(u, 1);
        playSound("SFXFlamethrower.mp3");
        this.refreshInfo();
        return ammo.amount;
      },
      trace: (from, to, source) => this.traceFlame(from, to, source),
      touch: flame => this.touchFlame(flame),
      endTick: () => this.settleFlameDamage(),
    });
  }

  // 鍘熺増 createExplosion锛氬崐寰?expl脳5 px锛屾寜璺濈琛板噺锛涚伀鐒板脊璧?burn
  createExplosion(px: number, py: number, explosiveness: number, antiPersonnel: number, flame = false) {
    const r = explosiveness * 5;
    playSound(flame ? "SFXMolotov.mp3" : "SFXExplosion.mp3");
    this.spawnExplosionFx(px, py, r);
    for (const target of this.units) {
      if (target.dead) continue;
      const d = Math.sqrt((target.x - px) ** 2 + (target.y - py) ** 2);
      if (d > r) continue;
      const fall = (r - d) / r;
      if (flame) {
        const burning = Math.max(explosiveness * fall * (1 - (target.character?.fireResistance ?? 0) / 100), 0) * 20;
        this.burn(target, burning, px, py);
        continue;
      }
      let dmg = explosiveness * fall / 2 - (target.character?.explosionResistance ?? 0) / 10;
      dmg += Math.max((antiPersonnel - (target.character?.explosionResistance ?? 0)) / 10, 0);
      if (dmg > 0) {
        target.bleeding += dmg / 5;
        if (this.gd.difficulty === 2) target.bleeding += dmg / 5;
        this.accumulateDamage(target,dmg,{x:px,y:py});
      }
    }
  }

  // 鍘熺増 Character.maxThrowDistance锛堢墿鐞?+ 鎶涙幏缁忛獙锛夛紝绫斥啋鍍忕礌锛坧ixelsPerMeter=32锛?
  maxThrowDistance(u: BattleUnit, initialHeight = 2): number {
    const wd = this.weaponDefOf(u);
    if (!wd) return 0;
    const ph = u.basePhysical ?? 10;
    const thExp = u.character ? (u.character.throwExperience ?? 0) : (u.skillExperience?.throwExperience ?? 0);
    const v0 = Math.sqrt((ph * 10000 + Math.pow(thExp, 0.5) * 3000) / (Math.max(wd.weight, 0.1) * 1000));
    const ang = 0.785398163; // 45掳
    const h = initialHeight; // initialGrenadeHeight锛堝師鐗堟瀯閫犲父閲忥級
    const s = Math.sin(ang) * v0;
    const disc = s * s + 19.6 * h;
    if (disc < 0) return 0;
    const t = Math.max((-s + Math.sqrt(disc)) / -9.8, (-s - Math.sqrt(disc)) / -9.8);
    return Math.max(0, Math.cos(ang) * v0 * t * 32);
  }

  throwGrenade(u: BattleUnit, gx: number, gy: number): boolean {
    if (this.paused || this.isBusy() || u !== this.order[this.turnIdx] || !this.inBounds(gx, gy)) return false;
    const cat = this.weaponCategory(u);
    const wd = this.weaponDefOf(u);
    if (cat !== 5 || !wd) {
      return false;
    }
    const slot = this.activeSlot(u);
    const amt = u.grenadeAmounts?.[slot] ?? 0;
    if (amt <= 0) {
      return false;
    }
    const mode = this.modeOf(u);
    const apCost = this.modeAPOf(u);
    if (u.AP < apCost) {
      return false;
    }
    const tx = (gx + 0.5) * CELL, ty = (gy + 0.5) * CELL;
    const distPx = Math.sqrt((tx - u.x) ** 2 + (ty - u.y) ** 2);
    const maxDist = this.maxThrowDistance(u);
    if (distPx > maxDist + CELL) {
      return false;
    }
    const anim = (u as any).__doll as DollAnim | undefined;
    if (anim) startPhase(anim, 2, 7, u.weaponSub, dirFromDelta(u.x - tx, u.y - ty));
    u.AP -= apCost;
    this.gbeSpend(u, apCost);
    u.grenadeAmounts![slot] = amt - 1;
    // 鍘熺増 Attack case5锛歵hrowExperience += learningCapacity
    if (u.character) {
      u.character.throwExperience = (u.character.throwExperience ?? 0) + (u.character.learningCapacity ?? 100);
    } else {
      // 鏁屼汉锛氬師鐗?Attack case5 throwExperience += LC锛圠C=100锛?
      if (!u.skillExperience) u.skillExperience = {};
      u.skillExperience.throwExperience = (u.skillExperience.throwExperience ?? 0) + 100;
    }
    // Original launch frame 6. Fuse counts seconds from launch, not delay / 3.
    this.scheduleAction((HIT_FRAMES[7] - 1) / 25, () => {
      const accuracy = Math.max(u.baseAccuracy*4,1)+Math.sqrt(u.character?.throwExperience??u.skillExperience?.throwExperience??0)/2;
      const distance = Math.max(0,Math.min(distPx/CELL*(1-Math.random()*4/accuracy*(Math.random()<.5?-1:1)),maxDist/CELL));
      const flight = Math.sqrt((2+distance*Math.tan(Math.PI/4))/4.9);
      const speed = distance / Math.max(flight,0.04);
      const angle = Math.atan2(tx-u.x,ty-u.y)+Math.random()*5/accuracy*(Math.random()<.5?-1:1);
      this.fx.push({kind:"grenade",x:u.x,y:u.y,z:64,vx:Math.sin(angle)*speed,vy:Math.cos(angle)*speed,vz:speed,
        counter:Math.max(1,Math.round((wd.delay??3)*25)),over:[],explodeOnImpact:!!wd.explodeOnImpact,source:u,
        t:0,dur:Infinity,acc:0,frame:0,explosiveness:wd.explosiveness??0,antiPersonnel:wd.antiPersonnel??0,flame:!!wd.flame});
      playSound("SFXPunchSwoosh.mp3");
      if (u.character) {
        u.character.reduceItemFromEquipment(u.weaponItem, 1, true);
        u.character.grenadeAmounts[slot] = u.grenadeAmounts![slot];
      }
      if (u.grenadeAmounts![slot] <= 0) {
        (u.weaponItems ??= [u.weaponItem, 0])[slot] = 0;
        u.weaponItem = u.weaponSub = 0;
        if (u.character) u.character.weapons[slot] = 0;
      }
      this.refreshInfo();
    });
    this.refreshInfo();
    this.checkEnd();
    if (!this.gameOver && u.AP <= 0 && this.phase === "player") this.advanceTurn();
    return true;
  }

  // 鐜╁鍗曚綅璇?character锛涙晫浜鸿 spec 钀芥。鐨?skillExperience锛堢敱 experienceModifier 鎸?Character.as:654-665 鐢熸垚锛夈€?
  // 缂哄垯閫€鍥?u.exp 鈥斺€?浠呮瀬绔厹搴曡矾寰勶紙presets 鏈姞杞芥椂鐨?makeEnemy锛変細璧板埌銆?
  // 涓嶆帴杩欎竴灞傜殑鍚庢灉锛氭晫浜哄懡涓巼/浼ゅ涓庤溅闃熺被鍨嬫棤鍏筹紙A-2 缂洪櫡锛夈€?
  skillExp(u: BattleUnit): number {
    const sk = this.skillOf(u);
    if (u.character) return (u.character as any)[sk + "Experience"] ?? u.exp;
    return u.skillExperience?.[sk + "Experience"] ?? u.exp;
  }

  closeExp(u: BattleUnit): number {
    if (u.character) return u.character.closeBattleExperience ?? 0;
    return u.skillExperience?.closeBattleExperience ?? u.exp;
  }

  meleeDamage(u: BattleUnit): number {
    return u.basePhysical * 1.8 + u.baseAccuracy * 0.7 + Math.pow(this.closeExp(u), 0.5) / 20 + Math.pow(this.skillExp(u), 0.5) / 10;
  }

  unarmedDamage(u: BattleUnit): number {
    return (u.basePhysical * 1.5 + u.baseAccuracy * 0.4 + Math.pow(this.closeExp(u), 0.5) / 20 + Math.pow(u.exp, 0.5) / 5) * 0.5;
  }

  meleeHitChance(u: BattleUnit): number {
    return u.baseAgility * 7 + u.baseAccuracy * 9 + Math.pow(this.skillExp(u), 0.5) / 3 + Math.pow(this.closeExp(u), 0.5) / 6;
  }

  dodgeOf(u: BattleUnit): number {
    // 鈶 杩戞垬闂伩 = agility脳2 + 鈭歝loseBattleExperience/10 + 鈭歞odgeExperience/5锛堝師鐗?Character.as:3105-3109锛?
    const dodgeExp = u.character
      ? (u.character.dodgeExperience ?? 0)
      : (u.skillExperience?.dodgeExperience ?? u.exp);
    return u.baseAgility * 2 + Math.pow(this.closeExp(u), 0.5) / 10 + Math.pow(dodgeExp, 0.5) / 5;
  }

  computeDamage(base: number, target: BattleUnit, weapon: any): { dmg: number; crit: boolean } {
    const armor = this.armorOf(target);
    const neutral = weapon?.armorNeutralization ?? 0;
    const eff = armor * (1 - neutral / 100);
    let dmg = Math.max(base * (1 - eff / 100) - eff / 5, 0);
    let crit = false;
    if (Math.random() < 0.05) {
      dmg *= 1.5 + Math.random();
      crit = true;
    }
    dmg = dmg * 0.8 + Math.random() * dmg * 0.4;
    return { dmg: Math.max(1, Math.round(dmg)), crit };
  }

  armorOf(u: BattleUnit): number {
    if (u.isTransport) {
      const def = this.ds.transports?.Types?.[u.transportType ?? 0];
      return Math.max(0, Number(def?.armor ?? 0));
    }
    return u.armorItem ? (getItemData(this.ds, u.armorItem)?.armor ?? 0) : 0;
  }

  applyHit(target: BattleUnit, dmg: number, weapon: any, _log: (extra: string) => void = () => {}, bleedless = false, source?: { x: number; y: number }, showBlood = true, event: "hit" | "bleeding" | "burning" = "hit") {
    if (target.dead || target.dying) return;
    dmg = Math.max(0, dmg);
    this.battleMessage(target, event, dmg);
    target._HP = Math.max(0, target._HP - dmg);
    if (dmg <= 0 && event === "hit") return;
    const from = source ?? this.order[this.turnIdx] ?? target;
    if (showBlood && (!target.isTransport || target.transportKind === "animal")) {
      this.fieldView?.bloodSplat(target.x, target.y, dmg, from.x, from.y);
    }
    if (target.isTransport && target.transportKind === "animal" && target._HP > 0) {
      target.transportAnimation ??= newTransportAnimation(!!target.transportRef?.cart);
      startTransportAnimation(target.transportAnimation, false);
    }
    const anim = (target as any).__doll as DollAnim | undefined;
    if (anim && target._HP > 0 && anim.phase === 0) {
      startPhase(anim, 3, weaponAnimType(this.ds.weapons, target.weaponSub), target.weaponSub, event === "hit" ? dirFromDelta(target.x - from.x, target.y - from.y) : anim.dir);
    }
    if (!target.isTransport) {
      const gender = target.character?.gender ?? target.appearance?.gender ?? 1;
      playSound((gender === 2 ? "SFXFemaleGrunt" : "SFXMaleGrunt") + (1 + Math.floor(Math.random() * 10)) + ".mp3", 0.7);
    }
    if (target.character) target.character.painExperience = (target.character.painExperience ?? 0) + dmg * (target.character.learningCapacity ?? 100);
    if (target._HP / target.maxHP < (target.character?.painThreshold ?? 0)) target.battleMorale -= dmg * 0.5;
    if (!bleedless && weapon?.openWoundCoeficient > 0) target.bleeding += dmg * weapon.openWoundCoeficient * (target.isTransport ? 1 : 3);
    // Original Hit uses >, not <: the inverted comparison inflicted injuries on nearly every hit.
    if (showBlood && event === "hit" && !target.isTransport && target._HP > 0 && (!this.damageFrameActive||!this.damageCaused)) {
      const coef = (this.gd.difficulty ?? 1) === 1 ? 10 : 6;
      const eyeCoef = ((this.gd.difficulty ?? 1) === 1 ? 12 : 8) / (this.damageFrameActive&&this.successfulHeadShot?1.5:1);
      const threshold = 1 / Math.pow(dmg, 0.1);
      if (!(this.damageFrameActive&&this.itsAHeadShot) && !target.legDamage && Math.pow(Math.random(), coef) > threshold) {
        target.legDamage = 1; this.damageCaused=true; this.battleMessage(target, "leg");
      } else if (!(this.damageFrameActive&&this.successfulHeadShot) && !target.armDamage && Math.pow(Math.random(), coef) > threshold) {
        target.armDamage = 1; this.damageCaused=true; this.battleMessage(target, "arm");
      } else if (!target.eyeDamage && Math.pow(Math.random(), eyeCoef) > threshold) {
        target.eyeDamage = 1; this.damageCaused=true; this.battleMessage(target, "eye");
      }
    }
    if (target._HP <= 0) this.finishKill(target, this.order[this.turnIdx] ?? target);
  }

  finishKill(target: BattleUnit, attacker: BattleUnit) {
    if (target.dead || target.dying) return;
    target.dying = !target.isTransport;
    target.dead = !!target.isTransport;
    target.path = null;
    target._HP = 0;
    if (target.isTransport && target.transportKind === "animal") {
      target.transportAnimation ??= newTransportAnimation(!!target.transportRef?.cart);
      startTransportAnimation(target.transportAnimation, true);
    }
    if (!target.isTransport && !(target as any).__doll) (target as any).__doll = newDollAnim();
    // Death pose plays to completion and remains on the battlefield.
    if ((target as any).__doll && !(target as any).__deathOnce) {
      (target as any).__deathOnce = true;
      const at = weaponAnimType(this.ds.weapons, target.weaponSub ?? 0);
      startPhase((target as any).__doll, 4, at, target.weaponSub ?? 0, (target as any).__doll.dir ?? 1);
      (target as any).__doll.done = false;
    }
    this.battleMessage(target, "die");
    if (this.hud) this.hud.invalidateMiniMap();
    // 闃典骸鐨勫＋姘旀稛婕細鍚岄樀钀ユ寜鍓╀綑浜烘暟鍒嗘憡涓嬮檷锛屾晫瀵归樀钀ユ寜鍓╀綑浜烘暟鍒嗘憡涓婂崌锛堝師鐗?Hit L5421-5437锛?
    const alive = this.units.filter(u => !u.dead && u._HP > 0 && !u.isTransport);
    const count = alive.filter(u => u.side === target.side).length || 1;
    if (target.side !== 2) for (const u of alive) if (u.side !== 2) u.battleMorale += (u.side === target.side ? -10 : 10) / count;
  }

  unarmedHitChance(u: BattleUnit): number {
    const unExp = u.character
      ? (u.character.unarmedExperience ?? 0)
      : (u.skillExperience?.unarmedExperience ?? 0);
    return u.baseAgility * 7 + u.baseAccuracy * 9 + Math.pow(unExp, 0.5) / 3 + Math.pow(this.closeExp(u), 0.5) / 6;
  }

  meleeHitChanceFor(u: BattleUnit): number {
    // 鍘熺増 calculateHitChance锛歵ype24 鎷冲/寰掓墜璧?unarmedHitChance锛屽叾浣欒繎鎴樿蛋 meleeHitChance
    const wd = this.weaponDefOf(u);
    if (!wd || wd.type === 24 || this.weaponCategory(u) === 0) return this.unarmedHitChance(u);
    return this.meleeHitChance(u);
  }

  tryAttack(attacker: BattleUnit, target: BattleUnit) {
    if (this.paused || this.isBusy() || attacker !== this.order[this.turnIdx]) return;
    if (this.gameOver || !attacker || !target || target.dead) return;
    const cat = this.weaponCategory(attacker);
    const wd = this.weaponDefOf(attacker);
    const mode = this.modeOf(attacker);
    const apCost = this.modeAPOf(attacker);

    if (cat === 5) {
      // 鍘熺増鎵嬮浄锛氱偣鍑荤洰鏍囨牸鎶曟幏锛堢墿鐞嗘姏鐗?+ AoE锛?
      this.throwGrenade(attacker, target.squareX, target.squareY);
      return;
    }
    if (attacker.AP < apCost) {
      return;
    }
    const dist = Math.hypot(target.squareX - attacker.squareX, target.squareY - attacker.squareY);
    const reach = Math.max(0, wd?.range ?? 1);
    const isMelee = cat <= 1;
    const meleeDist = Math.abs(target.squareX - attacker.squareX) + Math.abs(target.squareY - attacker.squareY);
    if (isMelee && meleeDist > MELEE_RANGE) {
      return;
    }
    if (!isMelee && dist > reach) {
      return;
    }
    // 寮硅嵂闂革紙鍘熺増 Attack case2/3锛氭棤寮瑰垯鏃犳硶寮€鐏級
    if (this.needsAmmo(attacker)) {
      const slot = this.activeSlot(attacker);
      if ((attacker.loadedAmmo?.[slot]?.amount ?? 0) <= 0) {
        if (this.phase === "enemy") {
          // 鏁屼汉鍥炲悎 AI 宸蹭繚璇佹湁寮癸紱鍏滃簳灏濊瘯瑁呭～
          if (!this.doReload(attacker, true)) {
            this.refreshInfo();
            return;
          }
        } else {
          return;
        }
      }
    }
    attacker.AP -= apCost;
    this.gbeSpend(attacker, apCost);
    if (cat === 4) { this.startFlamethrower(attacker, target); return; }
    // 鎴樺満鍔ㄤ綔闊虫晥锛氬師鐗堝湪鏀诲嚮鍔ㄧ敾寮€濮嬫椂鎾斁瀵瑰簲姝﹀櫒/杩戞垬闊虫晥銆?
    const attackSfx = cat === 0 ? "SFXPunchSwoosh.mp3"
      : cat === 1 && wd?.type === 1 ? "SFXKnifeSwoosh.mp3"
      : cat === 1 && wd?.type === 20 ? "SFXSwordSwoosh.mp3"
      : cat === 1 ? "SFXMeleeSwoosh.mp3"
      : (cat === 2 || cat === 3) && wd?.sound ? this.soundName(wd.sound)
      : cat === 2 ? "SFXPistol1.mp3"
      : cat === 3 ? "SFXRifle1.mp3"
      : cat === 4 ? "SFXFlamethrower.mp3"
      : cat === 5 ? "SFXGrenadeLauncher1.mp3" : "SFXMeleeSwoosh.mp3";
    if (isMelee) this.scheduleAction(((cat === 1 && wd?.type === 1 ? 3 : 5) - 1) / 25, () => playSound(attackSfx));
    // 鍘熺増 startAttack锛氭柟鍚?+ phase2
    if ((attacker as any).__doll) {
      const at = weaponAnimType(this.ds.weapons, attacker.weaponSub ?? 0);
      startPhase((attacker as any).__doll, 2, at, attacker.weaponSub ?? 0, dirFromDelta(attacker.x - target.x, attacker.y - target.y));
    }
    let volley = 0;
    const resolveImpact = () => {
    const firstVolley = volley++ === 0;
    if (!isMelee) playSound(attackSfx);
    let hit = false;
    let extra = "";
    let totalDmg = 0;
    let crit = false;
    // 鍘熺増瀛︿範鑳藉姏 LC锛氱帺瀹惰 character锛涙晫浜哄崟浣嶉粯璁?100锛堝師鐗?Character 浜轰汉鏈?LC锛?
    const al = attacker.character ? (attacker.character.learningCapacity ?? 100) : 100;

    if (isMelee) {
      // 鍘熺増 Attack case0/1锛氬懡涓?= (unarmed/meleeHitChance 脳 mode.hitProbability 鈭?闂伩)/100
      const hitChance = Math.max(0, Math.min(1, (this.meleeHitChanceFor(attacker) * (mode.hitProbability ?? 1) - this.dodgeOf(target)) / 100));
      hit = Math.random() < hitChance;
      // 缁忛獙锛堝師鐗堬級锛氭鍣ㄧ粡楠?+= AP/5锛堝懡涓?0.5锛夛紱closeBattle += LC锛涜鏀诲嚮鏂?dodge += 0.5脳LC锛堟湭鍛戒腑鍐?+LC锛?
      if (attacker.character) {
        attacker.character[this.skillOf(attacker) + "Experience"] =
          (attacker.character[this.skillOf(attacker) + "Experience"] ?? 0) + apCost / 5 + (hit ? 0.5 : 0);
        attacker.character.closeBattleExperience = (attacker.character.closeBattleExperience ?? 0) + al;
      } else {
        // 鏁屼汉鍗曚綅锛氱粡楠屽叆 spec 钀芥。鐨?skillExperience锛堝師鐗?Attack case0/1 鍚屽紡锛?
        if (!attacker.skillExperience) attacker.skillExperience = {};
        attacker.skillExperience[this.skillOf(attacker) + "Experience"] =
          (attacker.skillExperience[this.skillOf(attacker) + "Experience"] ?? 0) + apCost / 5 + (hit ? 0.5 : 0);
        attacker.skillExperience.closeBattleExperience =
          (attacker.skillExperience.closeBattleExperience ?? 0) + al;
      }
      if (target.character) {
        target.character.dodgeExperience = (target.character.dodgeExperience ?? 0) + 0.5 * al;
        if (!hit) target.character.dodgeExperience = (target.character.dodgeExperience ?? 0) + al;
      } else {
        if (!target.skillExperience) target.skillExperience = {};
        target.skillExperience.dodgeExperience =
          (target.skillExperience.dodgeExperience ?? 0) + 0.5 * al;
        if (!hit) target.skillExperience.dodgeExperience = (target.skillExperience.dodgeExperience ?? 0) + al;
      }
      if (hit) {
        playSound(wd?.sound ? this.soundName(wd.sound) : "SFXMeleeHit" + (1 + Math.floor(Math.random() * 6)) + ".mp3");
        // 鍘熺増 calculateHitDamage锛歵ype24 璧?unarmedDamage锛涘叾浣?= baseDamage/10脳meleeDamage脳damageMultiplier
        const base = (!wd || wd.type === 24)
          ? this.unarmedDamage(attacker) * (mode.damageMultiplier ?? 1)
          : ((wd.baseDamage ?? 8) / 10) * this.meleeDamage(attacker) * (mode.damageMultiplier ?? 1);
        const { dmg, crit: c } = this.computeDamage(base, target, wd);
        crit = c;
        totalDmg = dmg;
        this.applyHit(target, dmg, wd, (s) => { extra += s; }, false, attacker);
      } else {
      }
    } else {
      if (firstVolley) {
      // ---- 杩滅▼锛氬師鐗?aimRanged锛堣搴︾獥鍙ｅ懡涓級 + hitByProjectile锛堝脊閬撳姩鑳戒激瀹筹級 ----
      if (attacker.character) {
        attacker.character.rangedWeaponsExperience =
          (attacker.character.rangedWeaponsExperience ?? 0) + apCost / 5 * al;
        attacker.character[this.skillOf(attacker) + "Experience"] =
          (attacker.character[this.skillOf(attacker) + "Experience"] ?? 0) + apCost / 5;
      } else {
        // 鏁屼汉鍗曚綅锛氬師鐗?Attack case2锛堣繙绋嬶級锛歳angedWeaponsExp += AP/5脳LC锛涙鍣?skillExp += AP/5
        if (!attacker.skillExperience) attacker.skillExperience = {};
        attacker.skillExperience.rangedWeaponsExperience =
          (attacker.skillExperience.rangedWeaponsExperience ?? 0) + apCost / 5 * al;
        attacker.skillExperience[this.skillOf(attacker) + "Experience"] =
          (attacker.skillExperience[this.skillOf(attacker) + "Experience"] ?? 0) + apCost / 5;
      }
      }
      const shotContours = this.collisionContours(attacker);
      const aim = this.aimRanged(attacker, target, undefined, undefined, shotContours);
      const angle = aim?.aimAngle ?? Math.atan2(target.x-attacker.x,target.y-attacker.y);
      const slot = this.activeSlot(attacker), la = attacker.loadedAmmo?.[slot];
      const shots = Math.min(Math.max(1,mode.parallelShots??1),Math.max(0,la?.amount??0));
      if (!shots || !la) return;
      const ammoData = this.ds.weapons.Ammo?.[this.ds.items.Items[la.type]?.subCategory];
      const pellets = Math.max(1,ammoData?.pallets??1);
      const hits = new Map<BattleUnit,number>();
      const isProjectile = this.weaponCategory(attacker) === 3;
      const rayContours = isProjectile ? undefined : shotContours;
      const spread = pellets > 1
        ? (wd.spread ?? 0) * (1 + (this.attachmentsEffectsOf(attacker).spread ?? 0) / 10)
        : 0;
      for (let s=0;s<shots;s++) {
        const maxOff = this.calculateMaxShotOffset(attacker);
        const shotAngle = angle-maxOff+Math.random()*maxOff*2;
        if (isProjectile) {
          if (ammoData?.type === 4 && Math.random() < .5) this.droppedBolts.set(la.type,(this.droppedBolts.get(la.type)??0)+1);
          // Original arrows/rockets advance at 25 Hz, unlike ordinary bullets.
          this.fx.push({kind:"projectile",x:attacker.x+21*Math.sin(shotAngle),y:attacker.y+21*Math.cos(shotAngle),
            z:40,speed:wd.arrowSpeed??10,angle:shotAngle,source:attacker,intendedTarget:target,weapon:{...wd},mode:{...mode},ammo:{...ammoData},
            t:0,dur:Infinity,acc:0});
        } else for(let p=0;p<pellets;p++) {
          this.fireRay(attacker,pellets>1 ? shotAngle-spread/2+spread*p/Math.max(pellets-1,1) : shotAngle,target,hits,rayContours);
        }
      }
      this.settleProjectileHits(hits,attacker);
      this.consumeAmmo(attacker,shots);

    }
    this.updateHpBar(target);
    this.updateBleedBar(target);
    if (target._HP <= 0) this.finishKill(target, attacker);
    this.refreshInfo();
    this.checkEnd();
    if (!this.gameOver && attacker.AP <= 0 && this.phase === "player") this.advanceTurn();
    };
    const animationType = weaponAnimType(this.ds.weapons, attacker.weaponSub ?? 0);
    const frameCount = this.ds.battleDoll?.fullAnimationTypeFrames?.[animationType]?.[2]?.length ?? 3;
    const available = attacker.loadedAmmo?.[this.activeSlot(attacker)]?.amount ?? 0;
    const cycles = isMelee ? 1 : Math.min(Math.max(1, mode.burst ?? 1), Math.ceil(available / Math.max(1, mode.parallelShots ?? 1)));
    for (let i = 0; i < Math.max(1, cycles); i++) {
      this.scheduleAction((i * frameCount + (HIT_FRAMES[animationType] ?? 1) - 1) / 25, () => {
        if (i > 0 && (attacker as any).__doll) startPhase((attacker as any).__doll, 2, animationType, attacker.weaponSub, dirFromDelta(attacker.x - target.x, attacker.y - target.y));
        resolveImpact();
      });
    }
  }

  /** BattleField.nextTurn: damage belongs to the actor whose turn just ended. */
  private finishTurnStatus(u: BattleUnit) {
    if (u.dead || u.dying || u._HP <= 0) return;
    if (u.burning >= 0.2) {
      const resistance = u.isTransport
        ? Number(this.ds.transports?.Types?.[u.transportType ?? 0]?.fireResistance ?? 0)
        : Number(u.character?.fireResistance ?? 0);
      this.applyHit(u, Math.round(u.burning * 3 * (1 - resistance / 100)), null, undefined, true, u, false, "burning");
      u.battleMorale -= u.burning * 10;
      u.burning *= 0.8;
      if (u.burning < 0.2) u.burning = 0;
    }
    if (u.bleeding >= 0.5 && u._HP > 0) {
      this.applyHit(u, Math.round(u.bleeding), null, undefined, true, u, false, "bleeding");
      u.battleMorale -= u.bleeding * 0.3;
      u.bleeding *= 0.99;
    }
    this.updateHpBar(u);
  }

  startRound() {
    if (!this.units.some((u) => u.side === 0 && !u.dead && !u.isTransport)) {
      this.checkEnd();
      return;
    }
    if (!this.units.some((u) => u.side === 1 && !u.dead && !u.isTransport)) {
      this.checkEnd();
      return;
    }
    this.panicRounds++;
    if (this.panicRounds % 5 === 0) this.checkPanic();
    if (this.gameOver) return;
    this.order = this.units.filter((u) => !u.dead && !u.dying && !u.isTransport).sort((a, b) => this.unitMaxAP(b) - this.unitMaxAP(a));
    this.turnIdx = 0;
    if (!this.order.length) return; // Pending deaths resolve at frame 5, not another recursive round.
    this.nextTurn();
  }

  checkPanic() {
    if (this.gameOver) return;
    const foes = this.units.filter((u) => u.side === 1 && !u.dead && !u.isTransport);
    if (foes.length && foes.every((u) => u.battleMorale <= 8)) this.showPanicDialog(foes);
  }

  showPanicDialog(foes: BattleUnit[]) {
    if (this.panicOv) this.screen.removeChild(this.panicOv);
    const host = this.screen;
    const ov = new Sprite();
    const g = new Graphics();
    g.beginFill(0, 0.85);
    g.drawRect(0, 0, 880, 495);
    ov.graphics = g;
    ov.addChild(new EngineText((this.text(1387) || "The enemies are panicking...").toUpperCase(), 16777215, 16, "center", 120, 110, 640, 60, true, true));
    const button = (label: string, y: number, onClick: () => void) => {
      const btn = new Sprite();
      const bg = new Graphics();
      bg.lineStyle(1, 8222317);
      bg.beginFill(0, 0.6);
      bg.drawRect(0, 0, 220, 34);
      bg.hitRect(0, 0, 220, 34);
      btn.graphics = bg;
      btn.addChild(new EngineText(label, 13158600, 14, "center", 0, 6, 220, 22));
      btn.x = 330;
      btn.y = y;
      btn.addEventListener("click", onClick);
      ov.addChild(btn);
      return btn;
    };
    button(this.text(1388).toUpperCase() || "IMPRISON", 250, () => {
      host.removeChild(ov);
      this.panicOv = null;
      this.imprisonEnemies(foes);
    });
    button(this.text(1389).toUpperCase() || "LET GO", 300, () => {
      host.removeChild(ov);
      this.panicOv = null;
      this.letGoEnemies(foes);
    });
    button(this.text(1390).toUpperCase() || "KEEP KILLING", 350, () => {
      host.removeChild(ov);
      this.panicOv = null;
      for (const u of foes) u.battleMorale = 50;
      // 鈶 keepKilling锛堝師鐗?BattleMode.as:940-944锛夛細reputation(5,-1) 缁х画鎵?
      const st = this.gd.story;
      if (st) {
        st.specificReputations = st.specificReputations ?? {};
        st.specificReputations[5] = (st.specificReputations[5] ?? 0) - 1;
      }
    });
    this.panicOv = ov;
    host.addChild(ov);
  }

  imprisonEnemies(foes: BattleUnit[]) {
    const caravan = this.gd.Caravans[0];
    for (const u of foes) {
      // 鈶 鎴樺満鐪熷疄淇樿檹锛堝師鐗?BattleMode.as:922-933 imprison锛夛細
      // oldFaction = 鍏惰溅闃?faction銆乧ategory=3銆乵orale = clamp(30 + relations(oldFaction,0), 1..100)銆乫action=0
      const oldFaction = u.faction ?? 0;
      const rel = this.gd.getFactionRelations ? this.gd.getFactionRelations(oldFaction, 0) : 0;
      const ch = u.character ?? new Character({
        name: u.name.replace(/ \(Raider\)$/, ""),
        category: 3,
        faction: 0,
        oldFaction,
        gender: Math.random() < 0.5 ? 2 : 1,
        age: 18 + Math.floor(Math.random() * 35),
        basePhysical: Math.round(u.basePhysical),
        baseAgility: Math.round(u.baseAgility),
        baseAccuracy: Math.round(u.baseAccuracy),
        baseIntelligence: Math.round(u.baseIntelligence),
        _HP: Math.max(1, Math.round(u._HP)),
        morale: Math.max(Math.min(30 + (typeof rel === "number" ? rel : 0), 100), 1),
      });
      // 鎶€鑳界粡楠岄殢浜鸿惤妗ｏ紙鏁屼汉 spec 鐨?skillExperience 鐩翠紶 Character 瀛楁锛沢eneralBattleExperience 鍚屾牱锛?
      if (u.skillExperience) {
        for (const [k, v] of Object.entries(u.skillExperience)) (ch as any)[k] = v;
      }
      ch.generalBattleExperience = u.generalBattleExperience ?? u.exp ?? 0;
      Object.assign(ch,{category:3,faction:0,oldFaction,morale:Math.max(Math.min(30+(typeof rel==='number'?rel:0),100),1)});
      if(u.character){
        // removePerson in AS3 releases equipment to the defeated caravan before transfer.
        (u as any).capturedEquipment=ch.equipment.map((e:any)=>({...e}));
        ch.equipment=[];ch.Jacket=0;ch.Headgear=0;ch.attachments=[[],[]];
        u.weaponItems=[0,0];u.weaponItem=0;u.weaponSub=0;u.loadedAmmo=[null,null];
        u.selectedAmmo=[null,null];u.grenadeAmounts=[0,0];u.attachments=[[],[]];
      }
      if(!caravan.People.includes(ch))caravan.addPerson(ch);
      (u as any).captured=true;
      (u as any).surrendered=true;
      if ((u as any).__doll) (u as any).__doll.hidden = true;
    }
    this.checkEnd();
  }

  letGoEnemies(foes: BattleUnit[]) {
    for (const u of foes) (u as any).surrendered=true;
    const st = this.gd.story;
    if (st) {
      st.specificReputations = st.specificReputations ?? {};
      st.specificReputations[5] = (st.specificReputations[5] ?? 0) + 1;
    }
    this.checkEnd();
  }

  nextTurn() {
    if (this.gameOver) return;
    while (this.turnIdx < this.order.length && (this.order[this.turnIdx].dead || this.order[this.turnIdx].dying)) this.turnIdx++;
    if (this.turnIdx >= this.order.length) {
      this.startRound();
      return;
    }
    const u = this.order[this.turnIdx];
    this.advancePending = false;
    this.enemyActionPending = false;
    this.aiCue = [];
    this.aiPlan = undefined;
    this.phase = this.groupOf(u) === 0 && u.side === 0 && u.battleMorale > 8 && (u.character?.category ?? 1) < 3 ? "player" : "enemy";
    this.camLeft = this.camRight = this.camUp = this.camDown = false;
    this.healingMode = false;
    u.maxAP = this.unitMaxAP(u);
    u.AP = u.maxAP;
    if (u.side === 0) this.modeIdx = Math.min(u.modeIdx?.[this.activeSlot(u)] ?? 0, 9);
    if (u.battleMorale <= 8) this.battleMessage(u, "panic");
    if (this.gd.autoCenter !== false) this.focus(u);
    if (this.phase === "enemy") this.timeAcc = 0.4;
    this.updatePanel(u);
  }

  focus(u: BattleUnit) {
    this.camX = u.x;
    this.camY = u.y;
    this.clampCam();
    this.viewLock = false;
    this.camTargetX = this.camTargetY = null;
    this.redrawField();
  }

  /** Original interfaceOnOff changes at turn boundaries, not at each animation. */
  hudAvailable(): boolean {
    const cur = this.order[this.turnIdx];
    return this.phase === "player" && !!cur && cur.side === 0 && this.groupOf(cur) === 0 && !cur.dead && !cur.dying
      && cur.battleMorale > 8 && !this.paused && !this.gameOver
      && !this.loadingOverlay?.visible && !this.panicOv?.visible;
  }

  /** Original inControl also requires phase == 1 (ready for another command). */
  inControl(): boolean {
    return this.hudAvailable() && !this.isBusy();
  }

  isBusy(): boolean {
    return this.flames.busy || this.pendingActions.length > 0 || this.fx.some(f => ["delayedExplosion", "grenade", "projectile", "explosion", "flame"].includes(f.kind))
      || this.units.some(u => {
        const a = (u as any).__doll as DollAnim | undefined;
        return !!a && (a.phase === 1 || a.phase === 2 || a.phase === 3 || a.phase === 4 && !a.done)
          || !!(u as any).__transportMoving || !!u.transportAnimation && !u.transportAnimation.done;
      });
  }

  private scheduleAction(delay: number, run: () => void) {
    this.pendingActions.push({ at: this.animTime + Math.max(0, delay), run });
    this.pathCells = []; this.hoverGx = this.hoverGy = -1;
    this.refreshInfo();
  }

  private advanceTurn(deathMilestone = false) {
    if (this.gameOver) return;
    if (!deathMilestone && this.isBusy()) { this.advancePending = true; return; }
    this.advancePending = false;
    this.enemyActionPending = false;
    this.aiCue = [];
    this.aiPlan = undefined;
    const outgoing = this.order[this.turnIdx];
    if (!deathMilestone && outgoing) {
      this.finishTurnStatus(outgoing);
      if (outgoing.dying) { this.advancePending = true; return; }
    }
    this.turnIdx++;
    this.nextTurn();
  }

  endTurn() {
    if (this.inControl()) this.advanceTurn();
  }

  openOptions() {
    sfxClick();
    if (!this.optionsWin) {
      const canFullscreen = typeof document.documentElement.requestFullscreen === "function";
      this.optionsWin = new BattleOptionsWindow(this.ds, this.gd, this.assets, {
        onClose: () => this.closeOptions(),
        onExitGame: () => {
          this.hooks.onExitGame?.();
        },
        onToggleShowGrid: (v: boolean) => {
          if (this.fieldView) this.fieldView.gridLayer.visible = v;
        },
        onToggleFullScreen: canFullscreen
          ? () => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen();
            }
          : undefined,
      });
      this.optionsWin.visible = false;
      this.screen.addChild(this.optionsWin);
    }
    this.paused = true;
    this.optionsWin.refresh();
    this.optionsWin.visible = true;
    (globalThis as any).__c2HideNativeCursor = false;
    this.fieldView?.cursorLayer.removeAll();
  }

  closeOptions() {
    this.paused = false;
  }

  tryFlee() {
    if (!this.inControl()) return;
    if (this.gameOver) return;
    if (Math.random() < 0.6) {
      this.gameOver = true;
      this.hooks.onEnd(false, 0);
    } else {
      this.advanceTurn();
    }
  }

  private beginUnitWalk(u: BattleUnit, walk: Array<{ x: number; y: number }>) {
    if (!walk.length) return;
    this.pathCells = []; this.hoverGx = this.hoverGy = -1;
    if ((u as any).__doll) {
      startWalk((u as any).__doll, (u.squareX + 0.5) * CELL, (u.squareY + 0.5) * CELL, walk);
      return;
    }
    if (u.isTransport) {
      const last = walk[walk.length - 1];
      const dx = last.x - u.squareX, dy = last.y - u.squareY;
      u.facing = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 1 : 3) : (dy >= 0 ? 2 : 0);
      (u as any).__transportWalk = {
        fromX: u.x,
        fromY: u.y,
        toX: (last.x + 0.5) * CELL,
        toY: (last.y + 0.5) * CELL,
        t: 0,
        duration: Math.max(0.22, walk.length * 0.16 / Math.max(1, Number(this.gd.walkAnimationSpeed ?? 1))),
      };
      (u as any).__transportMoving = true;
    }
  }

  onFieldClick(sx: number, sy: number) {
    if (!this.inControl()) return;
    if (this.phase !== "player" || this.paused || this.gameOver) return;
    const cur = this.order[this.turnIdx];
    if (!cur || cur.dead || cur.side !== 0) return;
    const activeAnim = (cur as any).__doll as DollAnim | undefined;
    if (activeAnim?.walk || (cur as any).__transportMoving) return;
    const w = screenToWorld(sx, sy, this.camX, this.camY);
    const wx = w.x, wy = w.y;
    const gx = Math.floor(wx / CELL), gy = Math.floor(wy / CELL);
    const pointed = this.shiftPressed ? null : this.fieldView?.unitAtScreen(sx, sy) ?? null;
    const foe = pointed
      ? (pointed.side !== cur.side ? pointed : null)
      : this.units.find((u) => !u.dead && u.side !== cur.side && u.squareX === gx && u.squareY === gy);
    if (foe) {
      this.tryAttack(cur, foe);
      return;
    }
    if (gx < 0 || gy < 0 || gx >= this.fieldSize || gy >= this.fieldSize) return;
    const friendly = pointed?.side === cur.side
      ? pointed
      : this.units.find((u) => !u.dead && u.side === cur.side && u.squareX === gx && u.squareY === gy) ?? null;
    if (friendly) {
      if (this.healingMode && !this.shiftPressed) this.tryHeal(cur, friendly);
      return;
    }
    if (this.ctrlPressed) return;
    // 鎵嬮浄姝﹀櫒锛氱偣鍑荤┖鍦版寚瀹氳惤鐐癸紙鍘熺増 throwGrenadeAt锛?
    if (this.weaponCategory(cur) === 5 && !this.shiftPressed && !this.healingMode) {
      this.throwGrenade(cur, gx, gy);
      return;
    }
    if (this.healingMode && !this.shiftPressed) {
      return;
    }
    // 鍘熺増 J 閿嬀鍙栵細鑴氫笅鏈夋帀钀芥鍣ㄤ笖褰撳墠妲戒负绌?
    // Pickup is a separate action in the original (J key / HUD button -> canPickUp at
    // BattleField.as:6385, which only looks at the actor's own square); clicking a far
    // square is purely a walk order. Intercepting walk clicks on any dropped-weapon
    // square made every fallen enemy's square - exactly where its gun drops - swallow
    // the click: pickUpWeapon() bailed out on its same-square guard, so the order
    // neither picked the weapon up nor walked. Clicking your own square was already
    // handled by the friendly branch above, so the interception was dead code.
    const path = this.aStar(cur.squareX, cur.squareY, gx, gy, 60);
    if (!path) {
      return;
    }
    const cost = cur.legDamage ? 2 : 1;
    const budget = this.walkBudgetOf(cur);
    const walk = path.slice(0, budget);
    if (!walk.length) {
      return;
    }
    cur.path = walk;
    const spent = walk.length * cost;
    cur.AP -= spent;
    // 鍘熺増 beginWalk锛氳捣濮嬫柟鍚?+ phase1 鍔ㄧ敾锛堟樉绀哄眰鎻掑€硷紝閫昏緫鍧愭爣宸插嵆鏃舵洿鏂帮級
    this.beginUnitWalk(cur, walk);
    // 鈶 璧版牸鍚屾牱 reduceAP锛氬師鐗?BattleField walkAP锛圠2088锛夎蛋 this.reduceAP()
    if (cur.character) {
      cur.character.generalBattleExperience =
        (cur.character.generalBattleExperience ?? 0) + spent * (0.5 + (cur.character.learningCapacity ?? 100) * 0.5);
    } else {
      cur.exp += spent;
    }
    const dest = walk[walk.length - 1];
    cur.squareX = dest.x;
    cur.squareY = dest.y;
    cur.x = (dest.x + 0.5) * CELL;
    cur.y = (dest.y + 0.5) * CELL;
    cur.path = null;
    this.pathCells = [];
    this.hoverGx = -1;
    this.hoverGy = -1;
    this.hoverCost = 0;
    this.hoverReachable = false;
    this.updateUnitSprite(cur);
    // 鍘熺増绉诲姩涓嶄細鍦ㄦ瘡娆＄偣鍑诲悗寮哄埗鎶婇暅澶村惛鍥炶鑹诧紱淇濇寔鐜╁褰撳墠瑙嗛噹銆?
    this.redrawField();

    this.refreshInfo();
  }

  tryHeal(medic: BattleUnit, patient: BattleUnit) {
    if (!this.inControl() || medic !== this.order[this.turnIdx]) return;
    if (patient.dead || patient.dying || patient.side !== medic.side
        || Math.abs(patient.squareX - medic.squareX) + Math.abs(patient.squareY - medic.squareY) > 1) {
      return;
    }
    if (patient.bleeding < 0.5) {
      return;
    }
    const ds = this.ds;
    const items = ds.items.Items;
    const goods = ds.items.Goods;
    const ch = medic.character;
    const kit = this.firstAidKitOf(medic);
    if (!kit) {
      return;
    }
    const healPower = goods[items[kit.type].subCategory].heal ?? 0;
    const apCost = medic.armDamage ? 10 : 5;
    if (medic.AP < apCost) {
      return;
    }
    medic.AP -= apCost;
    // 鈶 鎬ユ晳鑺?AP 鍚屾牱鍔?gbe锛堝師鐗?BattleField 鎹㈠脊/鎬ユ晳鐐逛綅閮借蛋 reduceAP锛?
    if (medic.character) {
      medic.character.generalBattleExperience =
        (medic.character.generalBattleExperience ?? 0) + apCost * (0.5 + (medic.character.learningCapacity ?? 100) * 0.5);
    }
    const skill = (ch?.doctorSkill?.() ?? 0) * 0.8 + Math.sqrt(ch?.firstAidExperience ?? 0);
    const healed = Math.round((skill / 200) * healPower);
    this.battleMessage(patient, "heal", Math.min(healed, Math.ceil(patient.bleeding)));
    const medicAnim = (medic as any).__doll as DollAnim | undefined;
    if (medicAnim && patient !== medic) medicAnim.dir = dirFromDelta(medic.x - patient.x, medic.y - patient.y);
    patient.bleeding = Math.max(0, patient.bleeding - healed);
    if (patient.bleeding < 0.5) patient.bleeding = 0;
    if (ch) {
      ch.removeItemFromEquipment(kit.type);
      ch.firstAidExperience =
        (ch.firstAidExperience ?? 0) + ((typeof ch.learningCapacity === "function" ? ch.learningCapacity() : ch.learningCapacity) ?? 100);
    }
    this.healingMode = false; // One treatment exits targeting (BattleField.as:6191).
    this.firstAidKitOf(medic); // Select another available kit if this type was exhausted.
    this.updateBleedBar(patient);
    this.refreshInfo();
    if (medic.AP <= 0) this.advanceTurn();
  }

  // ---- 鍘熺増鏁屼汉 AI锛圔attleField.nextTurn锛氳繎鎴樿创鑴?杩滅▼鎸夊皠绋嬩笌鍗遍櫓搴﹂€変綅/鎵嬮浄鍗遍櫓搴︾綉鏍硷級 ----
  walkCostOf(u: BattleUnit): number {
    return u.legDamage ? 2 : 1;
  }

  walkReachable(u: BattleUnit, budget: number): Map<string, number> {
    const out = new Map<string, number>();
    if (budget < 0) return out;
    out.set(u.squareX + "," + u.squareY, 0);
    if (budget === 0) return out;
    const cost = this.walkCostOf(u);
    const steps = Math.floor(budget / cost);
    const occupied = new Set(
      this.units
        .filter((o) => !o.dead && o !== u)
        .map((o) => o.squareX + "," + o.squareY),
    );
    // BFS 鎸夋牸鏁帮紙鍥涙柟鍚戯紝鍚?aStar 璇箟锛?
    const seen = new Map<string, number>();
    let frontier: Array<{ gx: number; gy: number; d: number }> = [{ gx: u.squareX, gy: u.squareY, d: 0 }];
    seen.set(u.squareX + "," + u.squareY, 0);
    while (frontier.length) {
      const next: Array<{ gx: number; gy: number; d: number }> = [];
      for (const f of frontier) {
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const nx = f.gx + dx, ny = f.gy + dy;
          if (nx < 0 || ny < 0 || nx >= this.fieldSize || ny >= this.fieldSize) continue;
          if (this.map[ny * this.fieldSize + nx]) continue;
          if (occupied.has(nx + "," + ny)) continue;
          const nd = f.d + 1;
          if (nd > steps) continue;
          const key = nx + "," + ny;
          if (seen.has(key) && seen.get(key)! <= nd) continue;
          seen.set(key, nd);
          next.push({ gx: nx, gy: ny, d: nd });
        }
      }
      frontier = next;
    }
    for (const [k, d] of seen) if (k !== u.squareX + "," + u.squareY) out.set(k, d * cost);
    return out;
  }

  // 鍘熺増 nextTurn 鍚勬鍣ㄧ被 maximumRange/optimalRange锛堟鏂瑰舰鏍硷級
  computeRangedRanges(u: BattleUnit): { min: number; max: number; opt: number } {
    const wd = this.weaponDefOf(u);
    const sk = this.skillOf(u);
    const skill = this.skillValOf(u);
    const acc = (wd?.accuracy ?? 1) * (this.skillOf(u)==="rocketLauncher"?1:1+this.attachmentsEffectsOf(u).accuracy);
    let max = 0, opt = 0, min = 0;
    switch (sk) {
      case "shotgun":
        max = Math.round(5 + skill / 5);
        opt = Math.round(3 + skill / 10);
        break;
      case "flamethrower":
        max = wd?.range ?? 6;
        opt = Math.round((wd?.range ?? 6) / 2);
        break;
      case "rocketLauncher":
        min = 5;
        max = Math.round((10 + skill / 15) * acc / 2);
        opt = Math.round((5 + skill / 30) * acc / 2);
        break;
      default: // pistol/rifle/machinegun/smg/crossbow
        max = Math.round((10 + skill / 15) * acc * 1 / 2.5);
        opt = Math.round((5 + skill / 30) * acc * 1 / 2.5);
    }
    return { min, max: Math.max(max, 1), opt: Math.max(opt, 1) };
  }

  // 鍗遍櫓搴︼細鐜╁鍗曚綅瀵?(gx,gy) 鐨勯璁″▉鑳侊紙灏勭▼鍐呮寜璺濈琛板噺锛?
  enemyThreatAt(u: BattleUnit, gx: number, gy: number): number {
    let threat = 0;
    const px = (gx + 0.5) * CELL, py = (gy + 0.5) * CELL;
    for (const p of this.units) {
      if (!this.threatens(u,p)) continue;
      const pw = this.weaponDefOf(p);
      const reachPx = Math.max(0, pw?.range ?? 1) * CELL;
      const dp = Math.sqrt((p.x - px) ** 2 + (p.y - py) ** 2);
      if (reachPx > 0 && dp <= reachPx) {
        const dmgEst = this.weaponCategory(p) <= 1 ? Math.max(6, this.meleeDamage(p)) : Math.max(5, this.skillValOf(p) * 0.35);
        threat += dmgEst * (1 - dp / reachPx);
      }
      // 璐磋韩濞佽儊
      if (dp < CELL * 1.6) threat += 8;
    }
    return threat;
  }

  // 寮归亾浼ゅ鐨勭‘瀹氭€т及绠楋紙AI 閫変綅鐢級锛氬師鐗?hitByProjectile 鏍稿績鍏紡锛岄殢鏈洪」鍙栧潎鍊?
  estimateRangedDamage(attacker: BattleUnit, target: BattleUnit, distPx: number): number {
    const wd = this.weaponDefOf(attacker);
    const slot = this.activeSlot(attacker);
    const la = attacker.loadedAmmo?.[slot];
    const ammoIt = la ? this.ds.items.Items[la.type] : null;
    const ammoData = ammoIt ? (this.ds.weapons.Ammo?.[ammoIt.subCategory] ?? null) : null;
    if (!wd || !ammoData || (ammoData.projectileMass ?? 0) <= 0) return Math.max(2, this.skillValOf(attacker) * 0.3);
    const mass = ammoData.projectileMass;
    const muzzle = (ammoData.muzzleVelocity ?? 0) * (1 + (wd.muzzleVelocityChange ?? 0));
    const dia = (this.ds.weapons.Calibers?.[ammoData.type]?.bulletDiameter) ?? ammoData.bulletDiameter ?? 9;
    const sd = mass * 1.422 / Math.pow(dia, 2);
    const bc = Math.max((ammoData.FF ?? 1) * sd, 0.001);
    const v = Math.max(muzzle * (1 - (1 / (bc * 25) - 0.02) / 100 * distPx / 32), 0);
    const armor = this.armorOf(target);
    const pen = Math.pow((armor * 50) / ((ammoData.armorPiercing ?? 1) * Math.pow(mass, 0.2)), 0.8264462809917356);
    const ke = mass * Math.pow(Math.max(v - pen, 0), 2) / 2000;
    const diaF = ammoData.pallets > 1 ? (ammoData.bulletDiameter ?? dia) : dia;
    const dmg = (1 - 1 / (1 + Math.exp(0.03 * ke - 3))) * Math.pow(ke, 0.125) *
      (0.5 + ke / 2000 * Math.exp(-ke / 2000) / 2) * diaF * (ammoData.softTargetDamage ?? 1) * 3;
    const mode = this.modeOf(attacker);
    return Math.max(1, Math.round(dmg * 0.8 * (mode.damageMultiplier ?? 1) * (mode.burst ?? 1)));
  }

  private aiWalkTo(me: BattleUnit, dest: { x: number; y: number }, steps: number): boolean {
    const cost = this.walkCostOf(me);
    if (steps <= 0 || me.AP < cost) return false;
    const maxSteps = Math.min(Math.floor(me.AP / cost), Math.floor(steps));
    if (maxSteps <= 0) return false;
    const path = this.aStar(me.squareX, me.squareY, dest.x, dest.y, 80);
    if (!path || !path.length) return false;
    const occupied = new Set(this.units.filter((u) => !u.dead && u !== me).map((u) => u.squareX + "," + u.squareY));
    const walk: Array<{ x: number; y: number }> = [];
    for (const p of path.slice(0, Math.min(maxSteps, path.length))) {
      if (occupied.has(p.x + "," + p.y)) break;
      walk.push(p);
    }
    if (!walk.length) return false;
    this.beginUnitWalk(me, walk);
    const last = walk[walk.length - 1];
    me.squareX = last.x;
    me.squareY = last.y;
    me.x = (last.x + 0.5) * CELL;
    me.y = (last.y + 0.5) * CELL;
    me.AP -= walk.length * cost;
    this.gbeSpend(me, walk.length * cost);
    this.updateUnitSprite(me);
    // 鍘熺増绛夊緟琛岃蛋鍔ㄧ敾缁撴潫鍚庢墠缁х画 AI cue锛涗笉瑕佸湪鍚屼竴甯х灛绉汇€佹敾鍑绘垨鍒囨崲鍒颁笅涓€鍗曚綅銆?
    this.timeAcc = 0.12;
    return true;
  }

  private aiFlee(me: BattleUnit): boolean {
    this.startAiPlan(me,this.aiFleeSteps(me));return true;
  }

  private *aiFleeSteps(me: BattleUnit): Generator<void, unknown, void> {
    const threats=this.units.filter(u=>u!==me&&!u.isTransport&&!u.dead&&!u.dying&&u.side!==2);
    if(!threats.length || panicDanger(me.squareX,me.squareY,threats)<=30){this.advanceTurn();return true;}
    let best={x:me.squareX,y:me.squareY},score=Infinity;
    for(const [key] of [...this.walkReachable(me,me.AP)].reverse()){
      const [x,y]=key.split(',').map(Number),danger=panicDanger(x,y,threats);
      if(danger<score){score=danger;best={x,y};}
      yield;
    }
    this.aiCue=[()=>this.aiWalkTo(me,best,Math.floor(me.AP/this.walkCostOf(me))),()=>this.advanceTurn()];
    this.runAiCue();return true;
  }

  /** Original action queue is fixed for the turn; a dead target does not cause retargeting. */
  private queueAttacks(me:BattleUnit,target:BattleUnit,sequence:Array<number|'reload'>,destination?:{x:number;y:number}) {
    this.aiCue=sequence.map(action=>()=>{
      if(action==='reload'){
        const cost=this.reloadAPOf(me);
        if(me.AP>=cost&&this.loadMagazine(me)){me.AP-=cost;this.gbeSpend(me,cost);}
      }else if(!target.dead&&!target.dying&&target._HP>0){this.setMode(me,action);this.tryAttack(me,target);this.enemyActionPending=true;}
    });
    if(destination)this.aiCue.push(()=>this.aiWalkTo(me,destination,Math.floor(me.AP/this.walkCostOf(me))));
    this.aiCue.push(()=>this.advanceTurn());
  }

  private aiMelee(me: BattleUnit, mine: BattleUnit[]) {
    // AS3 keeps the current melee mode; choose the first adjacent or shortest-path victim.
    let target=mine.find(t=>Math.abs(t.squareX-me.squareX)+Math.abs(t.squareY-me.squareY)===1);
    let dest={x:me.squareX,y:me.squareY},distance=target?0:Infinity;
    if(!target)for(const t of mine)for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
      const x=t.squareX+dx,y=t.squareY+dy;
      if(!this.inBounds(x,y)||this.map[y*this.fieldSize+x]||this.units.some(u=>u!==me&&!u.dead&&u.squareX===x&&u.squareY===y))continue;
      const path=this.aStar(me.squareX,me.squareY,x,y,500);
      if(path&&path.length<distance){distance=path.length;dest={x,y};target=t;}
    }
    if(!target){this.advanceTurn();return;}
    const cost=this.modeAPOf(me),walk=this.walkCostOf(me),remaining=me.AP-distance*walk;
    if(remaining<cost){
      this.aiCue=[()=>this.aiOnlyWalk(me,dest),()=>this.advanceTurn()];
    }else{
      this.queueAttacks(me,target,Array.from({length:Math.floor(remaining/Math.max(cost,1))},()=>me.modeIdx?.[this.activeSlot(me)]??0));
      if(distance)this.aiCue.unshift(()=>this.aiWalkTo(me,dest,distance));
    }
    this.runAiCue();
  }

  private aiTargetScore(me:BattleUnit,target:BattleUnit,x:number,y:number,contours?:Contour<any>[],allContours?:Contour<any>[]):number {
    const aim=this.aimRanged(me,target,(x+.5)*CELL,(y+.5)*CELL,contours,allContours);
    if(!aim)return 0;
    let score=aim.hitChance*Math.max((this.weaponDefOf(target)?.price??0)/800,1);
    if(this.gd.difficulty===2)score*=100/Math.max(target._HP,1);
    const skill=this.skillOf(me);
    if(skill==='rocketLauncher'){
      const ammo=me.loadedAmmo?.[this.activeSlot(me)];
      const data=ammo?this.ds.weapons.Ammo[this.ds.items.Items[ammo.type]?.subCategory]:null;
      const radius=(data?.explosiveness??0)*5,gridRadius=Math.ceil(radius/CELL);
      for(const u of this.units)if(u!==target&&!u.isTransport&&!u.dead&&Math.abs(u.squareX-target.squareX)<=gridRadius&&Math.abs(u.squareY-target.squareY)<=gridRadius){
        score+=radius/Math.max(Math.hypot(u.x-target.x,u.y-target.y),1)*(u.side===me.side||u.side===2?-2:1);
      }
    }
    if(skill==='shotgun'||skill==='flamethrower'){
      // The original uses the actor's current position here, not the candidate square.
      const a=Math.atan2(target.x-me.x,target.y-me.y),dist=Math.hypot(target.x-me.x,target.y-me.y);
      for(const u of this.units)if(u!==me&&!u.dead&&!u.isTransport&&(u.side===me.side||u.side===2)){
        const d=Math.hypot(u.x-me.x,u.y-me.y),angle=Math.abs(this.angDiff(a,Math.atan2(u.x-me.x,u.y-me.y)));
        if(angle<.1){if(d<dist)score-=(.1-angle)*100;else if(d<(this.weaponDefOf(me)?.range??0)&&d/dist<1.5)score-=(.1-angle)*20*dist/d;}
      }
    }
    return score;
  }

  /** BattleField 3314: choose the reachable square with the shortest remaining path. */
  private aiOnlyWalk(me:BattleUnit,dest:{x:number;y:number}) {
    this.startAiPlan(me,this.aiOnlyWalkSteps(me,dest));
  }

  private *aiOnlyWalkSteps(me:BattleUnit,dest:{x:number;y:number}): Generator<void, unknown, void> {
    let best:{x:number;y:number}|undefined,score=0;
    for(const [key] of [...this.walkReachable(me,me.AP)].reverse()){
      const [x,y]=key.split(',').map(Number),path=this.aStar(x,y,dest.x,dest.y,500);
      const next=path?.length?100/path.length:0;
      if(next>score){score=next;best={x,y};}
      yield;
    }
    if(best)this.aiWalkTo(me,best,Math.floor(me.AP/this.walkCostOf(me)));
    return;
  }

  private aiRanged(me: BattleUnit, mine: BattleUnit[]) {
    this.startAiPlan(me,this.aiRangedSteps(me,mine));
  }

  private *aiRangedSteps(me: BattleUnit, mine: BattleUnit[]): Generator<void, unknown, void> {
    const ranges=this.computeRangedRanges(me),wd=this.weaponDefOf(me);
    // Candidate origins change during scoring, but battlefield collision contours do not.
    const contours=this.collisionContours(me),allContours=this.collisionContours(me,true);
    const modes=(this.ds.weapons.WeaponTypes?.[wd?.type]?.modes??[]).map((m:any)=>({...m,AP:this.modeAPOf(me,m)}));
    if(!modes.length){this.advanceTurn();return;}
    const ranks=rankModes(modes),walkAP=this.walkCostOf(me);
    let best:{x:number;y:number;target:BattleUnit;score:number;actions:Array<number|'reload'>;cost:number;destination:{x:number;y:number}}|undefined;
    for(const [key,cost] of [...this.walkReachable(me,me.AP)].reverse()){
      const [x,y]=key.split(',').map(Number);let victim:BattleUnit|undefined,hitScore=0,far=false;
      for(const t of mine){
        const distance=Math.hypot(t.squareX-x,t.squareY-y),isFar=distance>ranges.opt;
        if(distance>ranges.max||distance<ranges.min||me.AP-cost<modes[isFar?ranks.accuracy:ranks.minAP].AP)continue;
        const score=this.aiTargetScore(me,t,x,y,contours,allContours);
        if(score>hitScore){hitScore=score;victim=t;far=isFar;}
      }
      if(!victim){yield;continue;}
      const seq=shotSequence(modes,far,me.AP-cost,me.loadedAmmo?.[this.activeSlot(me)]?.amount??0,this.ammoReserveOf(me),wd.ammoCapacity??1,this.reloadAPOf(me),hitScore);
      const after=this.walkReachable({...me,squareX:x,squareY:y},me.AP-cost);
      for(const prefix of seq.prefixes)if(!best||prefix.score>best.score){
        const candidate=[...after].find(([,ap])=>ap<=prefix.remainingAP);if(!candidate)continue;
        const [dx,dy]=candidate[0].split(',').map(Number);
        best={x,y,target:victim,score:prefix.score,actions:seq.actions.slice(0,prefix.length),cost,destination:{x:dx,y:dy}};
      }
      yield;
    }
    if(best){
      this.queueAttacks(me,best.target,best.actions,best.destination.x!==best.x||best.destination.y!==best.y?best.destination:undefined);
      if(best.cost)this.aiCue!.unshift(()=>this.aiWalkTo(me,best!,Math.floor(best!.cost/walkAP)));
      this.runAiCue();return;
    }
    // No firing square: walk toward a free square outside the minimum blast range, then end.
    const proximity=(t:BattleUnit)=>{
      let score=Math.hypot(t.squareX-me.squareX,t.squareY-me.squareY);
      if(this.skillOf(me)==='rocketLauncher'){
        const ammo=me.loadedAmmo?.[this.activeSlot(me)];
        const radius=(ammo?this.ds.weapons.Ammo[this.ds.items.Items[ammo.type]?.subCategory]?.explosiveness??0:0)*5;
        const gridRadius=Math.ceil(radius/CELL);
        for(const u of this.units)if(u!==t&&u!==me&&!u.dead&&!u.isTransport&&Math.abs(u.squareX-t.squareX)<=gridRadius&&Math.abs(u.squareY-t.squareY)<=gridRadius)
          score+=radius/Math.max(Math.hypot(u.x-t.x,u.y-t.y),1)*(u.side===me.side||u.side===2?10:-1);
      }
      return score;
    };
    const nearest=[...mine].sort((a,b)=>proximity(a)-proximity(b))[0];
    const dest=this.nearestFreeCell(nearest.squareX,nearest.squareY,ranges.min+1);
    this.aiCue=[()=>{if(dest)this.aiOnlyWalk(me,dest);},()=>this.advanceTurn()];this.runAiCue();
  }

  // 鍘熺増 BattleField.nextTurn case5锛圠4437-4542锛? 鎶曟幏浣嶈瘎浼帮紙L3687-3724锛? 鍏滃簳锛圠3751-3777锛夊繝瀹炵Щ妞嶏細
  // 鍗婂緞 r=round(explosiveness*5/min(squareWidth,squareHeight))锛堟棤閽冲埗锛夛紱dangerMap 瀵规瘡涓?HP>0 鍗曚綅锛?
  // 鍙嬫柟鏍?-30銆佹晫鏂规牸 +10锛堝師鐗?_loc8_ 鍑芥暟绾у彉閲忎笉閲嶇疆銆佷腑绔?band3 娌跨敤涓婁竴鍊尖€斺€攚eb 鏃犱腑绔嬪崟浣嶏紝鎸夊弸/鏁岀洿鎺ュ垽瀹氾級锛?
  // 鍗婂緞鍐呮瘡鏍肩疮鍔?v*(1-娆ф皬璺?r)锛沢renadeSpots=绱鍊尖墺r 鐨勬牸 鈫?鍐嶇瓫 鈮axScore脳0.8 鈫?闄嶅簭锛?
  // 姣忎釜鍙蛋鏍硷紙棰勭畻 floor((maxAP-modeAP)/walkAP)锛壝?姣忎釜 spot锛歮inRange(r)鈮ゆ姘忔牸璺濃墹maxThrow(绫?鏍? 鏃?
  // 璇勫垎 spot.score脳maxThrow/dist脳0.5锛屽懡涓嵆璁?walkTo/鎶曟幏鐩爣 target/鎶曞悗璧版牸 dest锛堝師鐗堝 dest 鍙?
  // generatePossibleSquares(walkTo, floor((maxAP-璧版牸AP-modeAP)/walkAP)) 鐨?for-in 鏈」鈮堜换鎰忓彲杈炬牸锛夛紱
  // 鎵ц AICue=[walk(walkTo), throw(target), walk(dest), end]銆傛棤鍙缁勫悎锛氭寜 spot.score/path 鏈€澶ф壘
  // 鏈€杩戠┖鏍间粎璧颁笉鎶曪紙鍘熺増 findFreeSpot+walk锛夛紱鏃犺濡備綍 endTurn銆?
  private aiGrenade(me: BattleUnit): boolean {
    this.startAiPlan(me,this.aiGrenadeSteps(me));return true;
  }

  private *aiGrenadeSteps(me: BattleUnit): Generator<void, unknown, void> {
    const wd = this.weaponDefOf(me);
    if (!wd) { this.advanceTurn(); return; }
    const r = Math.round((wd.explosiveness ?? 35) * 5 / Math.min(CELL, CELL));
    if (r < 1) { this.advanceTurn(); return; }
    const maxThrowPx = this.maxThrowDistance(me);
    if (maxThrowPx <= 0) {
      this.advanceTurn();
      return true;
    }
    const minRange = r;
    const maxThrowSq = maxThrowPx / CELL; // 鍘熺増 maxThrowDistance 杩斿洖绫?鏍?
    const grid = new Map<string, number>();
    for (const u of this.units) {
      if (u.dead || u._HP <= 0 || u.isTransport) continue;
      // Character.IFF treats neutral humans as friends for explosive avoidance.
      const base = u.side === me.side || u.side === 2 ? -30 : 10;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const gx = u.squareX + dx, gy = u.squareY + dy;
          if (gx < 0 || gy < 0 || gx >= this.fieldSize || gy >= this.fieldSize) continue;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > r) continue;
          const v = base * (1 - d / r);
          grid.set(gx + "," + gy, (grid.get(gx + "," + gy) ?? 0) + v);
        }
      }
    }
    let spots: Array<{ gx: number; gy: number; score: number }> = [];
    for (const [key, v] of grid) {
      if (v >= r) {
        const [gx, gy] = key.split(",").map(Number);
        spots.push({ gx, gy, score: v });
      }
    }
    if (!spots.length) {
      this.advanceTurn();
      return true;
    }
    let maxScore = -Infinity;
    for (const s of spots) if (s.score > maxScore) maxScore = s.score;
    spots = spots.filter((s) => s.score >= maxScore * 0.8);
    spots.sort((a, b) => b.score - a.score || a.gx - b.gx || a.gy - b.gy);
    const modeAP = this.modeAPOf(me);
    const walkAP = this.walkCostOf(me);
    const budget = me.AP - modeAP; // walkReachable returns AP costs, not cell counts.
    const cands = this.walkReachable(me, me.AP);
    let walkTo: { gx: number; gy: number } | null = null;
    let target: { gx: number; gy: number } | null = null;
    let dest: { gx: number; gy: number } | null = null;
    let bestScore = -Infinity;
    for (const [key, d] of [...cands].reverse()) {
      if (d > budget) continue;
      const [gx, gy] = key.split(",").map(Number);
      for (const s of spots) {
        const dist = Math.sqrt((gx - s.gx) ** 2 + (gy - s.gy) ** 2);
        if (dist < minRange || dist > maxThrowSq) continue;
        const sc = s.score * (maxThrowSq / dist) * 0.5;
        if (sc > bestScore) {
          // BattleField 3700–3714: strict score comparison retains the first reachable square.
          const after = this.walkReachable({ ...me, squareX: gx, squareY: gy }, me.AP - d - modeAP);
          const first = after.keys().next().value;
          if (first === undefined) continue;
          const [ax, ay] = first.split(',').map(Number);
          const destPick = { gx: ax, gy: ay };
          bestScore = sc;
          walkTo = { gx, gy };
          target = { gx: s.gx, gy: s.gy };
          dest = destPick;
        }
      }
      yield;
    }
    if (!walkTo || !target) {
      // 鍘熺増鍏滃簳锛氭壘 score/path 鏈€澶х殑 spot 鏈€杩戠┖鏍硷紝浠呰蛋涓嶆姇
      let fb: { x: number; y: number } | null = null;
      let fbScore = -Infinity;
      for (const s of spots) {
        const free = this.nearestFreeCell(s.gx, s.gy);
        if (!free) continue;
        const p = this.aStar(me.squareX, me.squareY, free.x, free.y, 80);
        if (!p || !p.length) continue;
        const sc = s.score / p.length;
        if (sc > fbScore) { fbScore = sc; fb = free; }
      }
      this.aiCue=[()=>{if(fb)this.aiWalkTo(me,fb,Math.floor(me.AP/walkAP));},()=>this.advanceTurn()];
      this.runAiCue();
      return true;
    }
    // AICue=[walk(walkTo), throw(target), walk(dest), end]
    this.aiCue = [
      () => this.aiWalkTo(me, { x: walkTo!.gx, y: walkTo!.gy }, Math.floor((me.AP - modeAP) / walkAP)),
      () => { if (me.AP >= modeAP) this.throwGrenade(me, target!.gx, target!.gy); },
      () => { if (dest && me.AP >= walkAP) this.aiWalkTo(me, { x: dest.gx, y: dest.gy }, Math.floor(me.AP / walkAP)); },
      () => this.advanceTurn(),
    ];
    this.runAiCue();
    return true;
  }

  // 鍘熺増 findFreeSpot锛氱 (sx,sy) 鏈€杩戠殑鍙珯绌烘牸锛堝洖瀛?BFS锛岃烦杩囬殰纰嶄笌宸插崰鐢級
  private nearestFreeCell(sx:number,sy:number,minRange?:number):{x:number;y:number}|null {
    const clear=(x:number,y:number)=>this.inBounds(x,y)&&!this.map[y*this.fieldSize+x]&&!this.units.some(u=>!u.dead&&u.squareX===x&&u.squareY===y);
    if((minRange===undefined||minRange<=0)&&clear(sx,sy))return {x:sx,y:sy};
    for(let r=Math.max(1,Math.floor((minRange??0)/1.4142));r<=this.fieldSize;r++)for(let side=0;side<4;side++)for(let k=0;k<Math.max(1,2*r-1);k++){
      const x=sx+(side===0?-r+k:side===1?r:side===2?r-k:-r);
      const y=sy+(side===0?-r:side===1?-r+k:side===2?r:r-k);
      if((minRange===undefined||Math.hypot(x-sx,y-sy)>=minRange)&&clear(x,y))return {x,y};
    }
    return null;
  }

  /** Consume only one original AICue command after all preceding animation/physics has settled. */
  private runAiCue(): boolean {
    if (!this.aiCue?.length) return false;
    if (this.isBusy()) return true;
    const actor = this.order[this.turnIdx];
    if (!actor || actor.dead || actor.dying || this.gameOver) { this.aiCue = []; return false; }
    this.aiCue.shift()!();
    return true;
  }

  enemyAI() {
    const me = this.order[this.turnIdx];
    if (!me || me.dead || me.dying || this.gameOver) return;
    if (this.resumeAiPlan() || this.runAiCue()) return;
    const enemies = this.units.filter(u => this.threatens(me,u));
    const steady = enemies.filter(u=>u.battleMorale>8);
    const mine = steady.length?steady:enemies;
    if (!mine.length) { this.advanceTurn(); return; }
    // 澹皵鈮?锛氶€冿紙鍘熺増 runningAway + dangerScoreReduction鈮?0锛?
    if (me.battleMorale <= 8 || me.side === 2) {
      this.aiFlee(me);
      return;
    }
    // 寮硅嵂/瑁呭鑷锛堝師鐗?currentWeaponIsUsable 鈫?switchWeapon/dropWeapon锛?
    if (this.needsAmmo(me)) {
      const slot = this.activeSlot(me);
      if ((me.loadedAmmo?.[slot]?.amount ?? 0) <= 0) {
        if (this.ammoReserveOf(me) > 0 && me.AP >= this.reloadAPOf(me) && this.loadMagazine(me, true)) {
          const cost = this.reloadAPOf(me);
          me.AP -= cost;
          this.gbeSpend(me, cost);
        } else if (this.ammoReserveOf(me) > 0 && this.reloadAPOf(me) <= this.unitMaxAP(me)) {
          // Not enough remaining AP is temporary, not an unusable weapon.
          this.advanceTurn();
          return;
        } else {
          const slots = me.weaponItems ?? [0, 0];
          const other = slot === 0 ? 1 : 0;
          if (slots[other]) {
            this.switchWeapon(me);
            const active=this.activeSlot(me);
            if(this.needsAmmo(me)&&(me.loadedAmmo?.[active]?.amount??0)<=0){
              if(this.ammoReserveOf(me)<=0||this.reloadAPOf(me)>this.unitMaxAP(me))this.dropWeapon(me);
              else if(me.AP<this.reloadAPOf(me)){this.advanceTurn();return;}
              else if(this.loadMagazine(me,true)){const cost=this.reloadAPOf(me);me.AP-=cost;this.gbeSpend(me,cost);}
            }
          } else if (slots[slot]) this.dropWeapon(me);
        }
      }
    }
    const cat = this.weaponCategory(me);
    if (cat === 5) {
      if ((me.grenadeAmounts?.[this.activeSlot(me)] ?? 0) > 0) {
        // 鍘熺増锛氭湁闆峰繀鏈夋姇鎺疯瘎浼帮紝璇勪及澶辫触锛堟棤 grenadeSpots锛変篃鐩存帴缁撴潫鍥炲悎
        if (!this.aiGrenade(me)) this.advanceTurn();
        return;
      }
      const slots = me.weaponItems ?? [0, 0];
      const other = this.activeSlot(me) === 0 ? 1 : 0;
      // Consume an empty slot before reconsidering the other one: bounded by two slots,
      // rather than recursively switching two exhausted grenade weapons forever.
      this.dropWeapon(me);
      if (slots[other]) { this.switchWeapon(me); this.enemyAI(); return; }
      // 鏃犻浄 鈫?鎸夎繎鎴樼獊杩?
      this.aiMelee(me, mine);
      return;
    }
    if (cat <= 1) {
      this.aiMelee(me, mine);
      return;
    }
    this.aiRanged(me, mine);
  }
  private survivingCaptives(): Character[] {
    const result:Character[]=[];
    const groups=[{id:1,people:[...(this.opts.enemyPeople??[]),...(this.opts.slavePeople??[])],faction:this.opts.enemyFaction??this.enemySquad?.faction??0},
      ...(this.opts.additionalGroups??[]).flatMap((g,i)=>g.band===2?[{id:i+2,people:[...g.people,...(g.slavePeople??[])],faction:g.faction??0}]:[])];
    for(const g of groups)for(const p of g.people){
      const u=this.units.find(u=>u.character===p&&this.groupOf(u)===g.id);
      if(p.category===4&&!result.includes(p)&&(u?!u.dead&&!u.dying&&u._HP>0:(p._HP??1)>0)){
        p.faction=g.faction;result.push(p);
      }
    }
    return result;
  }

  checkEnd(deathMilestone = false) {
    if (this.endPhase !== "none" || !deathMilestone && this.isBusy()) return;
    // Original victory counts Characters, not TransportUnits; the main character must survive.
    const protagonist = this.gd.Caravans?.[0]?.People?.[0];
    const mainUnit = protagonist ? this.units.find(u => u.character === protagonist) : undefined;
    const mineAlive = this.units.some((u) => u.side === 0 && !u.dead && !u.isTransport);
    const foesAlive = this.units.some((u) => u.side === 1 && !u.dead && !(u as any).surrendered && !u.isTransport);
    if (!mineAlive || mainUnit?.dead) {
      this.loseGame();
    } else if (!foesAlive && !(mainUnit && mainUnit._HP <= 0)) {
      const slavePeople=this.survivingCaptives();
      const hasRealCaptives=(this.opts.slavePeople?.length??0)>0||(this.opts.enemyPeople??[]).some(p=>p.category===4)||(this.opts.additionalGroups??[]).some(g=>g.band===2&&[...g.people,...(g.slavePeople??[])].some(p=>p.category===4));
      const slaves=hasRealCaptives?slavePeople.length:(this.opts.slavesToCapture??0);
      if (slaves > 0) {
        this.gameOver = true;
        this.endPhase = "slaves";
        this.showSlaveMenu(slaves);
        return;
      }
      this.finishVictory();
    }
  }

  loseGame() {
    if (this.endPhase !== "none") return;
    this.restoreNativeCursor();
    this.gameOver = true;
    this.endPhase = "done";
    this.writeback();
    this.fireEnd(false, 0);
  }

  // onEnd 鐨勫敮涓€鍑哄彛锛歬eep / leave / escort / 鎴樿触 / 鏂囨湰缂哄け寮傚父 浜旀潯璺緞閮界粡姝ゆ敹鏉燂紝淇濊瘉鎭板ソ瑙﹀彂涓€娆?
  fireEnd(victory: boolean, loot: number) {
    if (this.endFired) return;
    this.endFired = true;
    this.ds.runtime?.events.emit("battle:end", { battle: this, gd: this.gd, victory, loot });
    this.hooks.onEnd(victory, loot);
  }

  writeback() {
    for (const u of this.units) {
      if (u.transportRef) {
        u.transportRef.health = Math.max(0, Math.round(u._HP));
        if (typeof u.transportRef.maxHealth !== "number") u.transportRef.maxHealth = u.maxHP;
      }
      if (!u.character) continue;
      u.character._HP = Math.max(0, u._HP);
      u.character.bleeding = u.bleeding;
      u.character.burning = u.burning;
      u.character.exp = u.exp;
      u.character.legDamage = u.legDamage;
      u.character.armDamage = u.armDamage;
      u.character.eyeDamage = u.eyeDamage;
      // 鍙屾Ы/寮硅嵂/妯″紡钀藉洖 Character锛堝師鐗堟垬鏂楃粨鏉熷悗鐨勬寔涔呯姸鎬侊級
      if (u.weaponItems) u.character.weapons = u.weaponItems.map((wid: number) => wid ? (this.ds.items.Items[wid]?.subCategory ?? 0) : 0);
      u.character.currSlot = u.weaponSlot ?? 0;
      if (u.modeIdx) u.character.currModes = [...u.modeIdx];
      if (u.loadedAmmo) {
        u.character.loadedAmmo = u.loadedAmmo.map((l) => (l && l.amount > 0 ? { type: l.type, amount: l.amount, inUse: 0 } : null));
      }
      if (u.selectedAmmo) u.character.selectedAmmo = u.selectedAmmo.map((l) => (l ? { type: l.type, amount: l.amount, inUse: 0 } : null));
      if (u.grenadeAmounts) u.character.grenadeAmounts = [...u.grenadeAmounts];
    }
  }

  finishVictory() {
    if (this.endPhase !== "none" && this.endPhase !== "slaves") return;
    this.gameOver = true;
    this.endPhase = "loot";
    this.restoreNativeCursor();
    this.writeback();
    // 鈶 鍘熺増 BattleMode.as:369-377锛氳触鏂瑰瓨娲?Transport锛坔ealth>0锛夎В缁戝悗杩?lootArray锛?
    // web 杞藉叿涓嶈繘鎴樺満鏍硷紝鐩存帴鏀堕泦瀛樻椿鑰呬緵 Shell 骞跺叆鐜╁杞﹂槦銆?
    this.capturedTransports = this.units
      .filter((u) => u.side === 1 && u.isTransport && !u.dead && u.transportRef)
      .map((u) => u.transportRef);
    const money = this.opts.lootOverride ?? Math.round(50 + Math.random() * 300);
    const loot = this.collectLoot(money);
    if (loot.size > 0) this.showLootDialog(loot, () => this.afterLoot(money));
    else this.afterLoot(money);
  }

  /** Collect each remaining owner once; ammunition fired during combat is not restored. */
  private collectLoot(money: number): Map<number, number> {
    const loot = new Map<number, number>();
    const add = (id: number, amount: number) => {
      if (id > 0 && Number.isFinite(amount) && amount > 0) loot.set(id, (loot.get(id) ?? 0) + amount);
    };
    for (const [id, amount] of this.enemyCargo ?? new Map((this.opts.lootCargo ?? []).map(c => [c.item, c.amount]))) add(id, amount);
    for (const [id, amount] of this.droppedBolts) add(id, amount);
    add(97, money);
    for (const u of this.units) {
      if (u.side !== 1 || u.isTransport) continue;
      if (u.character) {
        // Real characters keep loaded ammunition and attachments inside equipment.
        for (const e of (u as any).capturedEquipment ?? u.character.equipment ?? []) add(e.type, e.amount);
        continue;
      }
      for (const [slot, wid] of (u.weaponItems ?? [u.weaponItem ?? 0]).entries()) {
        const wd = this.ds.weapons.Weapons[this.ds.items.Items[wid]?.subCategory];
        const grenade = this.ds.weapons.WeaponTypes[wd?.type]?.category === 5;
        add(wid, grenade ? (u.grenadeAmounts?.[slot] ?? 0) : 1);
        const la = u.loadedAmmo?.[slot];
        if (la) add(la.type, la.amount);
        for (const sub of u.attachments?.[slot] ?? []) if (sub) add(Character.attachmentItemId(this.ds, sub), 1);
      }
      add(u.armorItem ?? 0, 1);
      for (const [id, amount] of Object.entries(u.enemyAmmoItems ?? {})) add(Number(id), amount);
    }
    for (const entries of this.droppedWeapons?.values() ?? []) for (const e of entries) {
      const wid = this.ds.items.Items.findIndex((it: any) => it?.category === 2 && it.subCategory === e.sub);
      const wd = this.ds.weapons.Weapons[e.sub];
      add(wid, this.ds.weapons.WeaponTypes[wd?.type]?.category === 5 ? e.ammoAmount : 1);
      add(e.ammoType, e.ammoAmount);
      for (const sub of e.attachments) add(Character.attachmentItemId(this.ds, sub), 1);
    }
    return loot;
  }

  showLootDialog(loot: Map<number, number>, onClose: () => void) {
    this.lootDlg = new TradeWindow(this.gd, this.ds, this.assets, () => {});
    this.lootDlg.screen.visible = true;
    this.screen.addChild(this.lootDlg.screen);
    this.lootDlg.showLoot(loot, this.text(1395) || "LOOT DEFEATED ENEMIES", onClose);
  }

  afterLoot(money: number) {
    if (this.endPhase !== "loot") return;
    this.endPhase = "done";
    const mine = this.units.filter((u) => u.side === 0 && !u.dead);
    const foes = this.units.filter((u) => u.side === 1 && !u.dead);
    const power = (arr: BattleUnit[]) =>
      arr.reduce((sum, u) => sum + u.basePhysical + u.baseAgility + u.baseAccuracy + u.baseIntelligence + u._HP / 100, 0);
    const mineP = power(mine);
    const foesP = power(foes) + 10;
    if (mineP > 0) {
      const ratio = foesP / mineP;
      for (const u of mine) {
        if (u.character && typeof u.character.morale === "number") {
          u.character.morale = Math.min(100, u.character.morale + Math.round((100 - u.character.morale) * 0.05 * ratio));
        }
      }
    }
    this.fireEnd(true, money);
  }

  // If a dialog cannot be created, continue victory settlement instead of trapping the battle.
  showSlaveMenu(n: number) {
    this.restoreNativeCursor();
    const host = this.screen;
    try {
      const ov = new Sprite();
      const g = new Graphics(); g.beginFill(0,.5); g.drawRect(0,0,880,495); ov.graphics=g;
      let body=this.text(1391).replace("@number@",String(n)).toUpperCase();
      if((this.gd.story?.specificReputations?.[7]??0)<=0)body+="\n\n"+this.text(3772).toUpperCase();
      const txt=new EngineText(body,0x888888,14,"center",20,20,200,null,true,true);
      const textH=txt.textHeight;
      const panel=new Sprite();const h=textH+140;panel.x=440-120;panel.y=247.5-h/2;
      addDialogueBackground(panel,this.assets,0,0,240,h,0,undefined,false);panel.addChild(new DialogueTextMask(this.assets,240,h,[txt]));ov.addChild(panel);
      const choices=[{id:1392,mode:"keep"},{id:1393,mode:"leave"},{id:1394,mode:"escort"}] as const;
      choices.forEach((choice,i)=>{
        const btn=new Button(2,()=>{host.removeChild(ov);this.takeSlaves(n,choice.mode);},this.text(choice.id).toUpperCase(),this.assets);
        btn.x=17;btn.y=textH+37+i*30;panel.addChild(btn);
      });
      host.addChild(ov);
    } catch (err) {
      console.error("[Battle] Failed to build captive choices; continuing victory settlement", err);
      this.finishVictory();
    }
  }

  takeSlaves(n: number, mode: "keep" | "leave" | "escort") {
    if (this.endPhase !== "slaves") return;
    const caravan = this.gd.Caravans[0];
    const names = this.ds.namePhonetics?.EnglishMaleNames ?? [];
    // 鈶 浼樺厛鐢ㄦ垬鍦虹湡瀹炲ゴ闅讹紙equipRandomCaravan 鐨?slavePeople锛歝ategory=4 鐪熻韩锛夛紱缂哄垯閫€鍥炲嚟绌洪€犱汉鍏滃簳
    const real = this.survivingCaptives().slice(0,n);
    const freed: Character[] = [];
    for (let i = 0; i < n; i++) {
      const p = real[i] ?? (() => {
        const nm = names.length ? String(names[Math.floor(Math.random() * names.length)]) : "Slave";
        return new Character({
          category: 4,
          age: 18 + Math.floor(Math.random() * 30),
          gender: Math.random() < 0.5 ? 1 : 2,
          name: nm,
        });
      })();
      const capturedUnit=this.units.find(u=>u.character===p);
      if(capturedUnit)(capturedUnit as any).captured=true;
      if (mode === "keep") {
        p.faction = 0;
        const oldFaction = p.oldFaction;
        // 鍘熺増 BattleMode.as:959 `var _loc1_:* = undefined;` 浠庢湭璧嬪€煎氨浼犺繘 :967 getFactionRelations(_loc1_, 0)锛?
        // 鑰?GameData.as:1513 瀵?undefined 鐩存帴 return 0 鈬?morale 鎭?= max(min(20-0,100),5) = 20銆?
        // 杩欐槸鍘熺増 bug锛堜綔鑰呮樉鐒舵兂浼?oldFaction锛夛紝姝ゅ鐓ф惉鍏跺彲瑙傛祴缁撴灉骞跺啓鎴愭敹鏁涘父閲忥細
        // 鏀逛紶 oldFaction 浼氳 -50 闃佃惀淇樿檹 morale 鍙?70銆佸彌閫冪巼澶ч檷锛屽睘浜庢敼骞宠　銆?
        p.morale = oldFaction !== undefined ? 20 : Math.round(5 + Math.random() * 10);
        caravan.addPerson(p);
        this.gd.enslaveAPerson(p);
      } else if (mode === "leave") {
        // 鈶 鍘熺増 BattleMode.as:979-997锛歯ew Caravan(5, mapSymbols)锛坱ype5 鏃呰鍥級銆佹瘡濂撮毝 category=1銆?
        // 浣嶇疆=鐜╁鍧愭爣銆丟D.Caravans.push銆乨irectCaravanToNearestTown銆佸弻鍚?recentlyInteractedCaravans銆佹渶鍚?loot()銆?
        // web锛歡d.spawnFreeCaravan(slaves) 璧板悓涓€鏉¤涔夐摼锛堟柊鍦板浘杞﹂槦 + 鐩磋揪 + 鍙屽悜鍐峰嵈锛夈€?
        p.category = 1;
        freed.push(p);
      } else {
        p.category = 9;
        p.faction = 0;
        p.morale = Math.round(30 + Math.random() * 40);
        caravan.addPerson(p);
        const st = this.gd.story;
        if (st) {
          st.specificReputations = st.specificReputations ?? {};
          // +2 鍦ㄥ惊鐜唴鏄師鐗堣璁★細BattleMode.as:1008 鐨?affectSpecificReputation(5,2) 浣嶄簬 for(_loc1_ in slaves) 寰幆浣撳唴
          // 鈬?鎶ら€?n 鍚?= +2n銆傛浘璇垽涓?exploit 骞剁Щ鍑哄惊鐜紝宸插洖閫€銆?
          st.specificReputations[5] = (st.specificReputations[5] ?? 0) + 2;
        }
        this.gd.freeASlave(p);
      }
    }
    if (mode === "leave") {
      // 鈶 閲婃斁鐨勫ゴ闅?鈫?鍦板浘鑷敱姘戣溅闃燂紙type5 鏃呰鍥?+ 鐩磋揪鏈€杩戦晣 + 鍙屽悜 recentlyInteractedCaravans锛?
      if (freed.length && typeof this.gd.spawnFreeCaravan === "function") {
        this.gd.spawnFreeCaravan(freed);
      } else {
        for (const p of freed) this.gd.freeASlave(p); // 鍏滃簳锛堟棤鍦板浘 API 鐨勬帰閽堢幆澧冿級
      }
    }
    // 鏃ュ織鍦ㄥ惊鐜鍙墦涓€娆★紝鏄剧ず绱鍊?
    // Settlement choices have dialogs, not BattleField combat messages.
    this.finishVictory();
  }

  build() {
    const root = this.screen;
    root.removeAll();
    // 鎴樺満瑙嗗浘锛堢瓑璺濆湴闈?缃戞牸/闅滅/鍗曚綅/鐗规晥/鍏夋爣锛? 鍘熺増 HUD 瑕嗙洊灞?
    this.fieldView = new BattleFieldView(this, this.assets, this.ds, root);
    this.fieldView.buildStatic();
    this.fieldView.redraw();
    for (const u of this.units) this.fieldView.createUnit(u);
    this.clickLayer = new Sprite();
    const clickG = new Graphics();
    clickG.hitRect(0, 0, 640, 445);
    this.clickLayer.graphics = clickG;
    this.clickLayer.addEventListener("click", (e: any) => this.onFieldClick(e.x ?? 0, e.y ?? 0));
    root.addChild(this.clickLayer);
    root.addChild(this.msgLayer);
    this.hud = new BattleHud(this, this.assets, this.ds);
    this.hud.build(root);
    const loading = new Sprite();
    const lg = new Graphics();
    lg.beginFill(0x08090d, 1);
    lg.drawRect(0, 0, 880, 495);
    loading.graphics = lg;
    const lt = new EngineText("Loading...", 0xffffff, 14, "center", 0, 236, 640, 24);
    lt.mouseEnabled = false;
    loading.addChild(lt);
    loading.mouseEnabled = true;
    loading.mouseChildren = false;
    root.addChild(loading);
    this.loadingOverlay = loading;
    this.primeBattleAssets();
    this.startRound();
  }

  /** 鎴樻枟鐢ㄥ浘鍏ㄩ儴寮傛鍔犺浇瀹屾垚鍚庨噸寤鸿鍥撅紙鍘熺増 ImportedBitmap 璧勬簮鍦?Init 闃舵鍗冲氨缁級 */
  primeBattleAssets() {
    const names: string[] = [
      "BattleInterfaceBase.png", "BattleInterfaceGlass.png", "Ground1.png",
      "Explosion.png", "Grenade.png", "Rocket.png", "RocketShadow.png",
      "BodyBurn.png", "ShotSmoke.png", "FlamethrowerFlame.png", "Shadows1.png",
      "CursorFeet.png", "CursorTarget.png", "CursorHand.png", "CursorHeal.png", "CursorUnavailable.png", "CursorGroundTarget.png",
      "Body1.png","Body2.png","Body3.png","Body4.png","Body5.png","Body6.png","Body7.png","Body8.png",
      "Head1.png","Head2.png","Head3.png","Head4.png","Head5.png","Head6.png","Head7.png","Head8.png","Head9.png","Head10.png","Head11.png",
      "Legs1.png","Legs2.png","BackHair1.png","BackHair2.png","Beard1.png","Beard2.png","Beard3.png","Beard4.png",
      "LeftTopArm1.png","LeftTopArm2.png","RightTopArm1.png","RightTopArm2.png",
      "LeftForearm1.png","LeftForearm2.png","LeftForearm3.png","RightForearm1.png","RightForearm2.png","RightForearm3.png",
      "BigGunBackpack1.png",
      "BulbLightRedOff.png", "BulbLightRedOn.png",
      "AmmoSymbol.png",
      "AimedShotSymbol.png", "HeadShotSymbol.png", "ParallelShotsSymbol.png", "BurstSymbol.png",
      "ButtonSymbolSwitch.png", "ButtonSymbolUnload.png", "ButtonSymbolDrop.png",
      "IndicatorBleeding.png", "IndicatorBurning.png", "IndicatorOverload.png",
      "IndicatorEyeDamage.png", "IndicatorArmDamage.png", "IndicatorLegDamage.png",
      "IndicatorCriticallyWounded.png",
      "TVButtonUp.png", "TVButtonDown.png",
      "LaunchButtonUp.png", "LaunchButtonDown.png",
      "Button15x15Up.png", "Button15x15Down.png",
      "Button40x15Up.png", "Button40x15Down.png",
      "Button60x15Up.png", "Button60x15Down.png",
      "IndicatorBase.png",
    ];
    for (let s = 1; s <= 8; s++) names.push("IndicatorSegment" + s + ".png");
    for (let i = 1; i <= 5; i++) names.push("UnderGrid" + i + ".png");
    for (let i = 1; i <= 15; i++) names.push("Transport" + i + ".png", "TransportShadow" + i + ".png");
    for (let i = 1; i <= 37; i++) names.push("Obstacle" + i + ".png", "ObstacleShadow" + i + ".png");
    for (let i = 1; i <= 47; i++) names.push("weaponIcon" + i + ".png");
    for (let i = 1; i <= 33; i++) names.push("Weapon" + i + ".png");
    for (let i = 1; i <= 16; i++) names.push("ammoIcon" + i + ".png");
    for (const name of Object.keys(this.ds.manifest.images)) if (/^CP.+\.png$/i.test(name)) names.push(name);
    const primeId = ++this._primeId;
    void Promise.all(names.map((n) => this.assets.ensure(n).catch(() => null))).then(() => {
      if (this._primeId !== primeId || this.gameOver || !this.fieldView || !this.hud) return;
      this.fieldView.buildStatic();
      this.redrawField();
      this.hud.rebuild();
      this.refreshInfo();
      if (this.loadingOverlay) this.loadingOverlay.visible = false;
    });
  }

  spawnUnitSprite(u: BattleUnit) {
    // 鍗曚綅娓叉煋宸茬Щ浜?BattleFieldView锛堢▼搴忓寲灏忎汉 + 姝﹀櫒鍥炬爣 + 闃村奖/鐏劙锛?
    if (this.fieldView) this.fieldView.createUnit(u);
  }

  updateUnitSprite(_u?: BattleUnit) {
    // 瑙嗗浘灞傛瘡甯ц嚜鍒锋柊浣嶇疆
  }

  updateHpBar(_u?: BattleUnit) { /* 鍘熺増鎴樺満鏃犺鏉?*/ }

  updateBleedBar(_u?: BattleUnit) { /* 鍑鸿浠ヨ娓嶅憟鐜?*/ }

  updateWeaponIcon(_u?: BattleUnit) { /* 瑙嗗浘灞傝嚜鍒锋柊 */ }

  // ---- 鎴樻枟鐗规晥锛堟洺鍏?鎵嬮浄寮х嚎/鐖嗙偢/寤舵椂鐖嗙偢锛?----
  spawnTracer(x1: number, y1: number, x2: number, y2: number, _angle: number) {
    this.fx.push({ kind: "tracer", x1, y1, x2, y2, t: 0, dur: 0.12 });
  }

  spawnExplosionFx(x: number, y: number, r: number) {
    this.fx.push({ kind: "explosion", x, y, r, t: 0, dur: 24 / 25 });
  }

  renderFx(dt: number) {
    const v = this.fieldView;
    if (!v) return;
    v.fxLayer.removeAll();
    v.projectileShadowLayer?.removeAll();
    const cam = { x: this.camX, y: this.camY };
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.kind === "grenade" || f.kind === "projectile") {
        f.acc += dt;
        while (f.acc + 1e-9 >= 1/25 && f.dur === Infinity) {
          f.acc -= 1/25;
          if (f.kind === "grenade") {
            const r = stepGrenade(f,this.collisionContours(f.source,true));
            if (r.wall) playSound("SFXHitWall.mp3");
            if (r.floor) playSound("SFXHitFloor.mp3");
            if (f.z > 0 && !r.wall) f.frame=(f.frame+1)%16;
            if (r.explode) {
              f.dur=0; this.createExplosion(f.x,f.y,f.explosiveness,f.antiPersonnel,f.flame);
            }
          } else {
            const from={x:f.x,y:f.y};
            f.x+=f.speed*Math.sin(f.angle); f.y+=f.speed*Math.cos(f.angle); f.z-=.5;
            const contact=contacts(from,f,this.collisionContours(f.source))[0];
            if (contact || f.z<=0) {
              if (contact) { f.x=contact.x; f.y=contact.y; }
              if (f.ammo.explosive) this.createExplosion(f.x-(contact?Math.sin(f.angle)*10:0),f.y-(contact?Math.cos(f.angle)*10:0),f.ammo.explosiveness??0,f.ammo.antiPersonnel??0);
              else if (contact && "_HP" in contact.contour.owner) {
                const victim=contact.contour.owner;
                const r=this.hitByProjectile(f.source,victim,f.angle,contact.distance,f);
                const hits=new Map<BattleUnit,number>();this.recordProjectileHit(victim,r,hits);
                this.settleProjectileHits(hits,f.source);
              }
              if(f.ammo.type===4) playSound(contact && "_HP" in contact.contour.owner ? "SFXCrossbowHit.mp3" : "SFXCrossbowMiss.mp3");
              f.dur=0;
            } else { f.speed*=f.ammo.FF??1; if(f.x<0||f.y<0||f.x>=this.fieldPx||f.y>=this.fieldPx) f.dur=0; }
          }
        }
      }
      if (f.t >= f.dur) {
        if (f.kind === "delayedExplosion") {
          // 寤舵椂鎵嬮浄寮曚俊鍒扮偣锛氱粨绠楃垎鐐?
          this.createExplosion(f.x, f.y, f.explosiveness, f.antiPersonnel, f.flame);
        }
        this.fx.splice(i, 1);
        continue;
      }
      if (f.t < 0) continue;
      const k = f.t / f.dur;
      const spr = new Sprite();
      const g = new Graphics();
      if (f.kind === "tracer") {
        const a = worldToScreen(f.x1, f.y1, cam.x, cam.y);
        const b = worldToScreen(f.x2, f.y2, cam.x, cam.y);
        g.lineStyle(1.4, 16763904, 1 - k * 0.7);
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
      } else if (f.kind === "grenade") {
        const p = worldToScreen(f.x,f.y,cam.x,cam.y);
        // BattleField.as:2573-2582 draws Grenade only; unlike bolts/rockets it has no Shadow.
        const img=this.assets.getImage("Grenade.png");
        if(img) { const bo=new BitmapObject(img); bo.srcRect={x:0,y:f.frame*10,w:10,h:10}; bo.x=p.x-5;bo.y=p.y-5-f.z*.9;bo.mouseEnabled=false;spr.addChild(bo); }
      } else if (f.kind === "projectile") {
        const p=worldToScreen(f.x,f.y,cam.x,cam.y);
        if(f.ammo.type===4) {
          const d=worldToScreen(f.x+Math.sin(f.angle)*10,f.y+Math.cos(f.angle)*10,cam.x,cam.y);
          g.lineStyle(1,0);g.moveTo(p.x,p.y-f.z);g.lineTo(d.x,d.y-f.z);
          const shadow=new Sprite(),sg=new Graphics();sg.lineStyle(1,0,.5);sg.moveTo(p.x,p.y);sg.lineTo(d.x,d.y);
          shadow.graphics=sg;shadow.mouseEnabled=false;v.projectileShadowLayer?.addChild(shadow);
        } else {
          const shadowImg=this.assets.getImage("RocketShadow.png");
          if(shadowImg) { const bo=new BitmapObject(shadowImg);bo.srcRect={x:0,y:((Math.round((Math.PI-f.angle)/(Math.PI/8))+16)%16)*15,w:15,h:15};bo.x=p.x-7.5;bo.y=p.y-7.5;bo.mouseEnabled=false;v.projectileShadowLayer?.addChild(bo); }
          const img=this.assets.getImage("Rocket.png");
          if(img) { const bo=new BitmapObject(img);bo.srcRect={x:0,y:((Math.round((Math.PI-f.angle)/(Math.PI/8))+16)%16)*15,w:15,h:15};bo.x=p.x-7.5;bo.y=p.y-f.z-7.5;bo.mouseEnabled=false;spr.addChild(bo); }
        }
      } else if (f.kind === "shotSmoke") {
        const p = worldToScreen(f.x, f.y, cam.x, cam.y);
        const img = this.assets.getImage("ShotSmoke.png");
        if (img) {
          const bo = new BitmapObject(img);
          bo.srcRect = { x: 0, y: Math.min(11, Math.floor(f.t * 25)) * 20, w: 20, h: 20 };
          bo.x = p.x - 10; bo.y = p.y - 40; bo.mouseEnabled = false;
          spr.addChild(bo);
        }
      } else if (f.kind === "explosion") {
        const p = worldToScreen(f.x, f.y, cam.x, cam.y);
        const r = f.r * (0.6 + k * 0.4);
        const img = this.assets.getImage("Explosion.png");
        if (img) {
          const bo = new BitmapObject(img);
          const frame = Math.min(Math.floor(f.t * 25), 23);
          bo.srcRect = { x: 0, y: frame * 250, w: 300, h: 250 };
          bo.x = p.x - 150;
          bo.y = p.y - 200;
          bo.mouseEnabled = false;
          spr.addChild(bo);
        } else {
          g.beginFill(16763904, (1 - k) * 0.7);
          g.drawCircle(p.x, p.y, r);
          g.beginFill(13107200, (1 - k) * 0.5);
          g.drawCircle(p.x, p.y, r * 0.55);
          g.lineStyle(2, 16777215, (1 - k) * 0.8);
          g.drawCircle(p.x, p.y, r * 0.25);
        }
      } else if (f.kind === "delayedExplosion") {
        const p = worldToScreen(f.x, f.y, cam.x, cam.y);
        const pul = 0.5 + Math.abs(Math.sin(f.t * 8)) * 0.5;
        g.lineStyle(2, 16763904, pul * 0.8);
        g.drawCircle(p.x, p.y, 6);
        // 鐖嗙偢鍗婂緞鎻愮ず
        g.lineStyle(1, 16763904, (1 - k) * 0.25);
        g.drawCircle(p.x, p.y, f.r * 0.3);
      }
      spr.graphics = g;
      spr.mouseEnabled = false;
      v.fxLayer.addChild(spr);
    }
    const flameImage = this.flames.particles.length ? this.assets.getImage("FlamethrowerFlame.png") : null;
    if (flameImage) for (const f of this.flames.particles) {
      if (f.frame < 1 || f.frame > 45) continue;
      const p = worldToScreen(f.x, f.y, cam.x, cam.y), bo = new BitmapObject(flameImage);
      bo.srcRect = { x: 0, y: (f.frame - 1) * 100, w: 100, h: 100 };
      bo.x = p.x - 50; bo.y = p.y - 90; bo.mouseEnabled = false;
      v.fxLayer.addChild(bo);
    }
  }

  redrawField() {
    if (!this.fieldView) return;
    this.fieldView.redraw();
    if (this.hud) { this.hud.syncMiniMap(); this.hud.syncMiniFrame(); }
    // 涓㈠純鐨勬鍣細鍦ㄨ鍥惧眰鍦颁笂鐢诲浘鏍囷紙鍘熺増 DroppedWeapons 缃戞牸锛岀敤 weaponIcon 璐村浘杩戜技锛?
    this.drawDropped();
  }

  drawDropped() { this.fieldView?.syncDropped(); }

  addMessage(kind: number, text: string) { this.messageLog.add(kind, text); }

  /** BattleField.generateMessage / decideKind. Called before applying damage. */
  battleMessage(u: BattleUnit, event: "hit" | "bleeding" | "burning" | "die" | "panic" | "heal" | "leg" | "arm" | "eye" | "noDamage", amount = 0) {
    const ids = { hit: amount > 0 ? 65 : 3654, bleeding: 879, burning: 880, die: 881, panic: 882, heal: 883, leg: 1098, arm: 1097, eye: 1099, noDamage: 4183 };
    const gender = u.character?.gender ?? u.appearance?.gender ?? 1;
    const caravan = u.groupName ?? (u.side === 0 ? ((this.gd.Caravans?.[0] as any)?.name ?? this.gd.Caravans?.[0]?.People?.[0]?.name) : (this.opts.enemyName ?? this.enemySquad?.name));
    const bare = ["leg", "arm", "eye", "noDamage"].includes(event);
    const name = u.name + (!u.isTransport && !bare && caravan ? " (" + caravan + ")" : "");
    let text = getText(this.ds, ids[event], this.ds.language, gender).replace(/@name@/g, name).replace(/@number@/g, String(amount));
    if (event === "bleeding" || event === "burning" || event === "hit" && amount > 0) {
      text += " | " + this.text(50) + ": " + Math.round(Math.max(u._HP - amount, 0)) + "/" + Math.round(u.maxHP);
    }
    const neutral = u.isTransport || u.side > 1 || event === "noDamage" || event === "hit" && amount <= 0;
    const good = event === "heal";
    const kind = neutral ? 2 : (u.side === 0 ? (good ? 1 : 3) : (good ? 3 : 1));
    this.addMessage(kind, text);
  }

  refreshInfo() {
    if (this.hud) this.hud.sync();
  }

  updatePanel(u: BattleUnit) {
    void u;
    this.refreshInfo();
  }

  private simulationAccumulator=0;
  private damageFrameActive=false;
  private frameDamage=new Map<BattleUnit,{amount:number;source:{x:number;y:number};blood:boolean;contact?:boolean}>();
  private damageCaused=false;
  private itsAHeadShot=false;
  private successfulHeadShot=false;

  private accumulateDamage(u:BattleUnit,amount:number,source:{x:number;y:number},blood=true) {
    if(!this.damageFrameActive){
      if(amount>=.5)this.applyHit(u,Math.round(amount),null,()=>{},true,source,blood);
      else if(!u.dead&&!u.dying&&!u.isTransport)this.battleMessage(u,'noDamage');
      return;
    }
    const hit=this.frameDamage.get(u);
    this.frameDamage.set(u,{amount:(hit?.amount??0)+amount,source,blood,contact:true});
  }

  private settleDamageFrame() {
    if(!this.damageFrameActive)return;
    // EF pools all impacts while flame particles are alive, not just the heat component.
    for(const [u,heat] of this.flameDamage){
      const hit=this.frameDamage.get(u);
      this.frameDamage.set(u,{amount:(hit?.amount??0)+heat.pending,source:hit?.source??heat,blood:hit?.blood??false,contact:hit?.contact});
      heat.pending=0;
    }
    for(const [u,hit] of this.frameDamage){
      const heat=this.flameDamage.get(u);
      if(this.flames.particles.length){
        if(hit.amount>=.5){const pool=heat??{pending:0,total:0,x:hit.source.x,y:hit.source.y};pool.total+=hit.amount;this.flameDamage.set(u,pool);}
      }else{
        const amount=hit.amount+(heat?.total??0);
        if(amount>=.5)this.applyHit(u,Math.round(amount),null,()=>{},true,hit.source,heat?.total?false:hit.blood);
        else if(hit.contact&&!this.flames.busy&&!u.dead&&!u.dying&&!u.isTransport)this.battleMessage(u,'noDamage');
        this.flameDamage.delete(u);
      }
    }
    this.frameDamage.clear();
  }

  /** Flash's single 25 Hz EF: every projectile advances once before shared hit settlement. */
  update(dt: number) {
    if(!Number.isFinite(dt)||dt<0)return;
    if(this.gameOver||this.paused||this.loadingOverlay?.visible){this.simulationAccumulator=0;this.updateFrame(dt);return;}
    this.simulationAccumulator=(this.simulationAccumulator??0)+dt;
    while(this.simulationAccumulator+1e-9>=1/25){
      this.simulationAccumulator-=1/25;
      this.frameDamage??=new Map();this.damageFrameActive=true;
      this.damageCaused=false;this.itsAHeadShot=false;this.successfulHeadShot=false;
      try{this.updateFrame(1/25);}finally{this.settleDamageFrame();this.damageFrameActive=false;}
      if(this.gameOver||this.paused)break;
    }
  }

  private updateFrame(dt: number) {
    if (this.gameOver) {
      if (this.lootDlg?.screen.visible) {
        this.lootDlg.updateCursor();
        this.lootDlg.updateFrame(dt);
      }
      this.restoreNativeCursor();
      return;
    }
    if (this.paused || this.loadingOverlay?.visible) return;
    this.animTime += dt;
    this.updateFlamethrower(dt);
    this.fireLoopAcc += dt;
    if (this.fireLoopAcc >= 0.8) {
      this.fireLoopAcc = 0;
      if (this.units.some((u) => !u.dead && u.burning > 0)) playSound("SFXFireLoop.mp3");
    }
    this.renderFx(dt);
    if (!this.flames.busy) this.settleFlameDamage();
    this.messageLog.update(dt);
    const cur = this.order[this.turnIdx];
    if (cur && !cur.dead) {
      // 鍘熺増 EF锛歱hase!=0 鏃?keyPressed WASD/鏂瑰悜閿?涓庡睆骞曡竟缂?40px 鍐呭钩绉伙紙BattleField.as:2935-2988锛?
      // 灞忓箷杞?鈫?涓栫晫杞达紙绛夎窛鎶曞奖閫嗗彉鎹級锛氬睆骞?+x(鍙? = 涓栫晫 (+t,-t)锛涘睆骞?+y(涓? = 涓栫晫 (+t,+t)
      const keyPan = (this.camLeft ? -1 : 0) + (this.camRight ? 1 : 0);
      const keyPanY = (this.camUp ? -1 : 0) + (this.camDown ? 1 : 0);
      if (keyPan !== 0 || keyPanY !== 0) {
        this.viewLock = true;
        this.viewLockT = 0; // 鑷敱瑙嗚锛歐ASD 骞崇Щ鍚庝笉鑷姩鍚稿洖瑙掕壊锛圡/绌烘牸鎴栨崲浜哄洖鍚堝啀鍥炰腑锛?
        const sp = 700 * dt; // 灞忓箷鍍忕礌/绉?
        this.camTargetX = (this.camTargetX ?? this.camX) + (keyPan / XREL + keyPanY / YREL) * sp / 2;
        this.camTargetY = (this.camTargetY ?? this.camY) + (-keyPan / XREL + keyPanY / YREL) * sp / 2;
        this.clampCamTarget();
      }
      const margin = this.panByMargin(Input.mouseX, Input.mouseY, dt);
      if (margin) { this.viewLock = true; this.viewLockT = 1.5; }
      if (this.camTargetX !== null && this.camTargetY !== null) {
        // 鎵嬪姩/灏忓湴鍥?杈规粴鐩爣锛氬钩婊戣秼杩戯紱涓嶅啀鑷姩鍚稿洖瑙掕壊锛堥櫎闈?M/绌烘牸鎴栨崲鍥炲悎 focus锛?
        const k = Math.min(1, dt * 10);
        this.camX += (this.camTargetX - this.camX) * k;
        this.camY += (this.camTargetY - this.camY) * k;
        this.clampCam();
        if (Math.abs(this.camX - this.camTargetX) < 0.05 && Math.abs(this.camY - this.camTargetY) < 0.05) {
          this.camX = this.camTargetX; this.camY = this.camTargetY;
          this.camTargetX = this.camTargetY = null;
        }
      }
    }
    if (this.fieldView) {
      const dd = this.ds.battleDoll as any;
      for (const u of this.units) {
        const anim = (u as any).__doll as DollAnim | undefined;
        if (anim && dd) {
          const animationSpeed = Math.max(1, Number(this.gd.walkAnimationSpeed ?? 1));
          const steps = advanceDoll(anim, dt * (anim.walk ? animationSpeed : 1), dd);
          this.updateDeathEvents(u, anim);
          if (this.gameOver) return;
          for (let i = 0; i < steps; i++) {
            playSound("SFXFootstep" + (1 + Math.floor(Math.random() * 8)) + ".mp3");
          }
        }
      }
      const due = this.pendingActions.filter(action => action.at <= this.animTime + 1e-9);
      this.pendingActions = this.pendingActions.filter(action => action.at > this.animTime + 1e-9);
      for (const action of due) action.run();
      this.settleDamageFrame();
      this.fieldView.updateWorld();
      this.fieldView.positionUnits(dt, this.animTime);
      this.updateHoverPath();
      this.fieldView.positionFloat(dt, this.animTime);
      this.fieldView.renderBlood(dt);
      this.fieldView.updateObstacleHover(Input.mouseX, Input.mouseY);
      this.fieldView.updateCursor(Input.mouseX, Input.mouseY);
    }
    if (this.lootDlg?.screen.visible) {
      this.lootDlg.updateCursor();
      this.lootDlg.updateFrame(dt);
    }
    this.settleDamageFrame();
    // 灏忓湴鍥捐鍙ｆ璺熼殢 WASD/杈圭紭婊氬睆鐨勭浉鏈轰綅缃€愬抚鏇存柊銆?
    if (this.hud) this.hud.syncMiniFrame();
    if (this.hud) this.hud.updateTooltip();
    this.hud?.syncInputState();
    if (!this.isBusy()) {
      this.checkEnd();
      if (this.gameOver) return;
      if (this.advancePending) { this.advanceTurn(); return; }
    }
    if (this.phase === "enemy") {
      if (this.isBusy()) return;
      const acting = this.order[this.turnIdx];
      const anim = acting ? (acting as any).__doll as DollAnim | undefined : undefined;
      if (this.enemyActionPending) {
        // isBusy above covers real animations; idle phase 0 has no completion event.
        this.enemyActionPending = false;
        // Attack completion is not turn completion: re-evaluate with remaining AP/ammunition.
        this.timeAcc = 0.15;
        if (!acting || acting.dead || acting.dying || acting.AP <= 0) this.advanceTurn();
        return;
      }
      // 琛岃蛋缁撴潫鍓嶄笉鎵ц涓嬩竴鏉?AI 鎸囦护锛岄槻姝㈤€昏緫浣嶇疆鍏堟洿鏂伴€犳垚鐬Щ鏀诲嚮銆?
      if (anim?.walk || (acting as any)?.__transportMoving) return;
      this.timeAcc -= dt;
      if (this.timeAcc <= 0) this.enemyAI();
    }
  }

  /** 鎮仠璺緞棰勮锛堝師鐗?hover 鏄剧ず鐧借壊绉诲姩璺緞+缁堢偣鏄熸爣锛涚洰鏍囨牸鍙樺寲鏃堕噸绠楋級 */
  updateHoverPath() {
    const v = this.fieldView;
    if (!v) return;
    if (!this.inControl()) {
      this.hoverGx = -1; this.hoverGy = -1; this.pathCells = [];
      this.hoverCost = 0;
      this.hoverReachable = false;
      v.setPathMarks([], null);
      return;
    }
    const mx = Input.mouseX, my = Input.mouseY;
    if (mx < 0 || my < 0 || mx >= 640 || my >= 445) {
      if (this.hoverGx !== -1) { this.hoverGx = -1; this.hoverGy = -1; this.pathCells = []; this.redrawField(); }
      this.hoverCost = 0;
      this.hoverReachable = false;
      return;
    }
    const w = screenToWorld(mx, my, this.camX, this.camY);
    const pointed = this.shiftPressed ? null : v.unitAtScreen(mx, my);
    const gx = pointed ? pointed.squareX : Math.floor(w.x / CELL);
    const gy = pointed ? pointed.squareY : Math.floor(w.y / CELL);
    if (gx === this.hoverGx && gy === this.hoverGy) return;
    this.hoverGx = gx; this.hoverGy = gy;
    const cur = this.order[this.turnIdx];
    const curCell = cur && !cur.dead ? { x: cur.squareX, y: cur.squareY } : null;
    if (!cur || cur.dead || cur.side !== 0 || gx < 0 || gy < 0 || gx >= this.fieldSize || gy >= this.fieldSize
        || this.map[gy * this.fieldSize + gx]
        || this.units.some((u) => !u.dead && u.squareX === gx && u.squareY === gy)
        || this.ctrlPressed
        || (this.healingMode && !this.shiftPressed)
        || (this.weaponCategory(cur) === 5 && !this.shiftPressed)) {
      this.pathCells = [];
      this.hoverCost = 0;
      this.hoverReachable = false;
      v.setPathMarks([], curCell);
      return;
    }
    const path = this.aStar(cur.squareX, cur.squareY, gx, gy, 60);
    if (!path) {
      this.pathCells = [];
      this.hoverCost = 0;
      this.hoverReachable = false;
      v.setPathMarks([], curCell);
      return;
    }
    const budget = this.walkBudgetOf(cur);
    const cost = this.walkCostOf(cur);
    this.hoverReachable = path.length <= budget;
    this.hoverCost = (this.hoverReachable ? path.length : budget) * cost;
    this.pathCells = this.decoratePath(path, budget, { x: gx, y: gy });
    v.setPathMarks(this.pathCells, curCell);
  }

  get hoverPreview() {
    return {
      active: this.hoverGx >= 0 && this.hoverGy >= 0 && this.pathCells.length > 0,
      cost: this.hoverCost,
      reachable: this.hoverReachable,
    };
  }

  /** 原版 BattleField 的目标提示：命中率、生命、士气均使用当前语言表。 */
  hoverTargetInfo(mx: number, my: number): string | null {
    if (!this.inControl()) return null;
    if (this.phase !== "player" || this.gameOver || this.paused) return null;
    const attacker = this.order[this.turnIdx];
    if (!attacker || attacker.dead || attacker.side !== 0 || !this.fieldView) return null;
    const target = this.fieldView.unitAtScreen(mx, my);
    if (!target || target.dead || target.side === attacker.side) return null;
    const mode = this.modeOf(attacker);
    const cat = this.weaponCategory(attacker);
    let chance = 0;
    if (cat <= 1) {
      chance = Math.max(0, Math.min(1, (this.meleeHitChanceFor(attacker) * (mode.hitProbability ?? 1) - this.dodgeOf(target)) / 100));
    } else {
      const aim = this.aimRanged(attacker, target);
      chance = aim ? aim.hitChance : 0;
    }
    const hp = Math.max(0, Math.round(target._HP));
    const maxHp = Math.max(1, Math.round(target.maxHP));
    const morale = Math.max(0, Math.round(target.battleMorale));
    // 原版 BattleField.as：58=命中率，50=生命，200=士气。避免硬编码中文及编码损坏。
    return target.name + "\n" + this.text(58) + ": " + Math.round(chance * 100) + "%\n"
      + this.text(50) + ": " + hp + "/" + maxHp + "\n" + this.text(200) + ": " + morale;
  }

  /** 杈规粴锛氶紶鏍囦綅浜庢垬鍦洪€昏緫鍖猴紙640x445锛夎竟缂?40px 鍐呮椂鎸夎搴︽帹杩涳紙鍘熺増 EF:2953-2988 margin 鍔犻€燂級 */
  private panByMargin(mx: number, my: number, dt: number): boolean {
    if (this.phase === "enemy" || this.paused || this.gameOver || mx < 0 || my < 0 || mx >= 640 || my >= 445) {
      this.timeSpentOnMargin = 0;
      return false;
    }
    const M = 40;
    const inM = mx < M || my < M || mx > 640 - M || my > 445 - M;
    if (!inM) {
      this.timeSpentOnMargin = 0;
      return false;
    }
    const dx = mx - 320, dy = my - 222.5;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len, uy = dy / len;
    // 鍘熺増姣忎釜 25fps 閫昏緫甯у皢璁℃暟鍔?1锛屽苟浠ヨ璁℃暟浣滀负鏈抚灞忓箷浣嶇Щ锛?.2 绉掑悗灏侀《 30px/甯с€?
    this.timeSpentOnMargin = Math.min(30, this.timeSpentOnMargin + dt * 25);
    const sp = this.timeSpentOnMargin * 25 * dt;
    // 杈规粴灞忓箷鍚戦噺 (ux,uy) 鍚屾牱鎹㈢畻鍒颁笘鐣岃酱
    this.camTargetX = (this.camTargetX ?? this.camX) + (ux / XREL + uy / YREL) * sp / 2;
    this.camTargetY = (this.camTargetY ?? this.camY) + (-ux / XREL + uy / YREL) * sp / 2;
    this.clampCamTarget();
    return true;
  }
  private timeSpentOnMargin = 0;

  // ---- 瑙嗗浘/灏忓湴鍥捐緟鍔╋紙鍘熺増 centerViewOn / viewTarget 瑙嗛噹閽冲埗锛?----
  clampCam() {
    // 鍘熺増瑙嗛噹閽冲埗锛圔attleField.as:4577-4608 moveScreen锛夛細
    // 鐩告満涓績涓栫晫鐐?(camX,camY) 鐨勬姇褰?X=xRel*(cx-cy), Y=yRel*(cx+cy) 鍙渶钀藉湪瀛楁鑿卞舰鍥涜鐨?
    // map2Screen 鍖呭洿鐩掑唴锛堟棤闇€鍐嶅噺鍗婂睆锛氬瓧娈垫瘮瑙嗗彛澶э紝涓績鍙嚜鐢辩Щ鍔ㄤ絾涓嶅嚭鑿卞舰锛夈€?
    const X = XREL * (this.camX - this.camY);
    const Y = YREL * (this.camX + this.camY);
    const corners = [[0, 0], [this.fieldPx, 0], [this.fieldPx, this.fieldPx], [0, this.fieldPx]];
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const [wx, wy] of corners) {
      const p = worldToScreen(wx, wy, 0, 0);
      left = Math.min(left, p.x - VIEW_W / 2); right = Math.max(right, p.x - VIEW_W / 2);
      top = Math.min(top, p.y - VIEW_H / 2); bottom = Math.max(bottom, p.y - VIEW_H / 2);
    }
    const mx = Math.max(left, Math.min(right, X));
    const my = Math.max(top, Math.min(bottom, Y));
    if (Number.isNaN(mx) || Number.isNaN(my)) {
      this.camX = this.fieldPx / 2;
      this.camY = this.fieldPx / 2;
      return;
    }
    const sum = my / YREL, diff = mx / XREL;
    this.camX = (sum + diff) / 2;
    this.camY = (sum - diff) / 2;
  }

  /** 褰撳墠鍗曚綅璧版牸 AP 棰勭畻锛堝師鐗?walkAP 璇箟锛沴egDamage 鏃?2 鍊嶏級 */
  walkBudgetOf(cur: BattleUnit): number {
    const cost = cur.legDamage ? 2 : 1;
    return Math.max(0, Math.floor(cur.AP / cost));
  }

  /** 鍘熺増 convertAStoPath 鏂瑰悜/棰勭畻鏍囪锛圔attleField.as:6984-7009锛夛細
   *  鏍?direction锛?..3 = 鎸囧悜涓嬩竴鏍肩殑绉诲姩鏂瑰悜绠ご锛? = AP 棰勭畻杈圭晫锛? = 瓒呴绠楄蛋涓嶅埌锛?   *  6 = 缁堢偣鍙珯鏍硷紙浜旇鏄燂級 */
  decoratePath(p: Array<{ x: number; y: number }>, budget: number, target: { x: number; y: number } | null) {
    const out: Array<{ x: number; y: number; direction: number }> = [];
    const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
    for (let i = 0; i < p.length; i++) {
      const cell = { x: p[i].x, y: p[i].y, direction: 0 };
      if (target && i === p.length - 1 && i < budget) {
        // 鏈€鍚庝竴鏍煎湪棰勭畻鍐?鈫?缁堢偣鏄熸爣
        cell.direction = 6;
      } else if (i === budget - 1) {
        // 棰勭畻杈圭晫鏍?
        cell.direction = 4;
      } else if (i >= budget) {
        // 瓒呴绠楋紙棰勮璺緞姣斿彲璧拌窛绂婚暱鏃跺熬閮級
        cell.direction = 5;
      } else {
        const nx = p[i + 1] ? p[i + 1].x - p[i].x : 0;
        const ny = p[i + 1] ? p[i + 1].y - p[i].y : 0;
        for (let d = 0; d < 4; d++) {
          if (dirs[d][0] === nx && dirs[d][1] === ny) { cell.direction = d; break; }
        }
      }
      out.push(cell);
    }
    return out;
  }

  /** 浠ヤ笘鐣屾牸鍧愭爣涓轰腑蹇冿紙灏忓湴鍥?鎸夐挳鍥炰腑锛沬mmediate 鍚屽師鐗?centerViewOn(immediate)锛?*/
  centerOnWorld(x: number, y: number, immediate = false) {
    this.camTargetX = x; this.camTargetY = y; this.viewLock = true;
    this.clampCamTarget();
    if (immediate) {
      this.camX = this.camTargetX!; this.camY = this.camTargetY!;
      this.camTargetX = this.camTargetY = null;
      this.fieldView?.updateWorld(); this.fieldView?.positionUnits(0, this.animTime);
    }
  }

  centerOnCell(gx: number, gy: number, immediate = false) {
    const cur = this.order[this.turnIdx];
    if (cur && !cur.dead) {
      if (this.camTargetX === null) this.camTargetX = this.camX;
      if (this.camTargetY === null) this.camTargetY = this.camY;
    }
    this.camTargetX = (gx + 0.5) * CELL;
    this.camTargetY = (gy + 0.5) * CELL;
    this.viewLock = false; this.viewLockT = 0;
    if (immediate) {
      this.camX = this.camTargetX; this.camY = this.camTargetY;
      this.clampCam();
      this.redrawField();
      this.camTargetX = this.camTargetY = null;
    }
  }

  /** 鐩告満瑙嗗彛瑙掞紙涓栫晫鍧愭爣锛夛紝渚涘皬鍦板浘/杈规粴绛変娇鐢紙320/222.5 鍗婂睆锛?*/
  viewCorners() {
    const hw = 320 / Math.sin(Math.PI / 4);
    const hh = 222.5 / (Math.cos(Math.PI / 4) * 0.574);
    return {
      left: this.camX - hw, right: this.camX + hw,
      top: this.camY - hh, bottom: this.camY + hh,
    };
  }

  /** 鐩告満鏈濆睆骞曟柟鍚戝钩绉?ddx,ddx锛堝師鐗?moveScreen(dx,dy) 璇箟锛屽甫閽冲埗锛?*/
  panScreen(dx: number, dy: number) {
    this.camTargetX = this.camTargetX ?? this.camX;
    this.camTargetY = this.camTargetY ?? this.camY;
    this.camTargetX += dx;
    this.camTargetY += dy;
    this.viewLock = true;
    this.viewLockT = 1.5;
    this.clampCamTarget();
    this.redrawField();
  }

  /** 鎶婄浉鏈虹洰鏍囬挸鍒拌閲庡唴锛堜笉鍋氭瘡甯ф彃鍊硷紱璋冪敤鏂瑰喅瀹氭槸鍚︾珛鍗崇敓鏁堬級 */
  clampCamTarget() {
    if (this.camTargetX === null || this.camTargetY === null) return;
    // 涓?clampCam 鍚屼竴濂楅挸鍒讹細鐩爣鎶曞奖鐣欏湪瀛楁鑿卞舰鍥涜鍖呭洿鐩掑唴
    const size = this.fieldPx;
    const cs = [[0,0],[size,0],[size,size],[0,size]];
    let l = Infinity, r = -Infinity, t = Infinity, bt = -Infinity;
    for (const [wx,wy] of cs) {
      const p = worldToScreen(wx, wy, 0, 0);
      l = Math.min(l, p.x - VIEW_W / 2); r = Math.max(r, p.x - VIEW_W / 2);
      t = Math.min(t, p.y - VIEW_H / 2); bt = Math.max(bt, p.y - VIEW_H / 2);
    }
    const projX = XREL * (this.camTargetX - this.camTargetY);
    const projY = YREL * (this.camTargetX + this.camTargetY);
    const mx = Math.max(l, Math.min(r, projX));
    const my = Math.max(t, Math.min(bt, projY));
    if (Number.isNaN(mx) || Number.isNaN(my)) return;
    const sum = my / YREL, diff = mx / XREL;
    this.camTargetX = (sum + diff) / 2;
    this.camTargetY = (sum - diff) / 2;
  }

  centerViewOnCurrent() {
    if (!this.hudAvailable()) return;
    const cur = this.order[this.turnIdx];
    if (cur && !cur.dead) {
      const anim = (cur as any).__doll as DollAnim | undefined;
      this.camX = anim?.walk ? anim.dispX : cur.x;
      this.camY = anim?.walk ? anim.dispY : cur.y;
      this.clampCam();
      this.redrawField();
      this.viewLock = false;
      this.camTargetX = this.camTargetY = null;
    }
  }

  centerOnEnemy() {
    if (!this.inControl()) return;
    const cur = this.order[this.turnIdx];
    if (!cur || cur.dead || cur.side !== 0) return;
    const enemies = this.units.filter((u) => !u.dead && u.side !== cur.side);
    if (!enemies.length) return;
    enemies.sort((a, b) => Math.hypot(a.x - cur.x, a.y - cur.y) - Math.hypot(b.x - cur.x, b.y - cur.y));
    if (this.centerOnEnemyIndex >= enemies.length) this.centerOnEnemyIndex = 0;
    const target = enemies[this.centerOnEnemyIndex++];
    this.centerOnCell(target.squareX, target.squareY, false);
  }

  healAPOf(u: BattleUnit): number {
    return u.armDamage ? 10 : 5;
  }

  pickUpAPOf(u: BattleUnit): number {
    return u.armDamage ? 6 : 3;
  }

  private soundName(value: string | string[]): string {
    const source = Array.isArray(value) ? value[Math.floor(Math.random() * value.length)] : value;
    return String(source || "").replace(/\.mp3$/i, "") + ".mp3";
  }

  // ---- 鍘熺増灏忔寜閽搴斿姩浣?----
  unloadWeapon(u?: BattleUnit): boolean {
    if (!u && !this.inControl()) return false;
    const who = u ?? this.order[this.turnIdx];
    if (!who || who.dead) return false;
    const slot = this.activeSlot(who);
    const la = who.loadedAmmo?.[slot];
    if (!la || la.amount <= 0) {
      return false;
    }
    if (who.character) {
      const eq = who.character.equipment ?? [];
      for (const e of eq) if (e && e.type === la.type) e.inUse = Math.max(0, (e.inUse ?? 0) - la.amount);
    } else {
      // 鏁屼汉锛氶€€杩樺埌瀵瑰簲鍙ｅ緞搴撳瓨锛堝師鐗?unloadWeapon 璇箟锛氬綊杩?equipment inUse锛?
      if (!who.enemyAmmo) who.enemyAmmo = {};
      const cal = this.weaponDefOf(who)?.ammo ?? 0;
      who.enemyAmmo[cal] = (who.enemyAmmo[cal] ?? 0) + la.amount;
      if (who.enemyAmmoItems) who.enemyAmmoItems[la.type] = (who.enemyAmmoItems[la.type] ?? 0) + la.amount;
    }
    la.amount = 0;
    if (!u) playSound("SFXUnload.mp3");
    this.refreshInfo();
    return true;
  }

  private cycleAmmo(u: BattleUnit, dir: number) {
    const wd = this.weaponDefOf(u);
    if (!wd || wd.ammo === 17 || !u.character) return;
    const cal = wd.ammo;
    const eq: any[] = Array.isArray(u.character.equipment) ? u.character.equipment : [];
    const types: number[] = [];
    for (const e of eq) {
      const it = e && this.ds.items.Items[e.type];
      const am = it ? (this.ds.weapons.Ammo?.[it.subCategory] ?? null) : null;
      if (it && it.category === 3 && am && am.type === cal) types.push(e.type);
    }
    if (!types.length) return;
    const slot = this.activeSlot(u);
    const cur = u.selectedAmmo?.[slot]?.type ?? 0;
    let idx = types.indexOf(cur);
    idx = (((idx + dir) % types.length) + types.length) % types.length;
    if (!u.selectedAmmo) u.selectedAmmo = [null, null];
    u.selectedAmmo[slot] = { type: types[idx], amount: 1 };
    if (Array.isArray(u.character.selectedAmmo)) u.character.selectedAmmo[slot] = { type: types[idx], amount: 1, inUse: 0 };
    this.refreshInfo();
  }

  prevAmmoType() {
    if (!this.inControl()) return;
    const cur = this.order[this.turnIdx];
    if (cur && cur.side === 0) this.cycleAmmo(cur, -1);
  }

  nextAmmoType() {
    if (!this.inControl()) return;
    const cur = this.order[this.turnIdx];
    if (cur && cur.side === 0) this.cycleAmmo(cur, 1);
  }

  private availableFirstAid(u: BattleUnit): Array<{ type: number; amount: number; inUse: number }> {
    const equipment: any[] = Array.isArray(u.character?.equipment) ? u.character.equipment : [];
    return equipment.filter(e => {
      const def = e && this.ds.items.Items[e.type];
      return def?.category === 1 && !!this.ds.items.Goods[def.subCategory]?.firstAidKit && e.amount > 0;
    });
  }

  private cycleFirstAid(u: BattleUnit, dir: number) {
    const current = this.firstAidKitOf(u);
    if (!current || !dir) return;
    // Same equipment-order wraparound as Character.firstAidStep.
    const kits = this.availableFirstAid(u);
    const i = kits.findIndex(k => k.type === current.type);
    u.selectedFirstAidType = kits[((i + dir) % kits.length + kits.length) % kits.length].type;
    this.refreshInfo();
  }

  firstAidKitOf(u: BattleUnit): { type: number; amount: number; inUse: number } | null {
    const kits = this.availableFirstAid(u);
    const selected = kits.find(k => k.type === u.selectedFirstAidType) ?? kits[0];
    if (!selected) { u.selectedFirstAidType = undefined; return null; }
    u.selectedFirstAidType = selected.type;
    // Original updateFirstAid totals this type, rather than counting equipment rows.
    return { ...selected, amount: kits.filter(k => k.type === selected.type).reduce((n, k) => n + k.amount, 0) };
  }

  selectedPickUpOf(u: BattleUnit): DroppedWeapon | null {
    const drops = this.droppedWeapons?.get(u.squareX + "," + u.squareY);
    if (!drops?.length) return null;
    return drops[Math.max(0, drops.length - Math.min(this.pickUpPos, drops.length - 1) - 1)] ?? null;
  }

  prevFirstAid() {
    if (!this.inControl()) return;
    const cur = this.order[this.turnIdx];
    if (cur && cur.side === 0) this.cycleFirstAid(cur, -1);
  }

  nextFirstAid() {
    if (!this.inControl()) return;
    const cur = this.order[this.turnIdx];
    if (cur && cur.side === 0) this.cycleFirstAid(cur, 1);
  }

  prevPickUpPos() {
    this.changePickUpPos(-1);
  }

  nextPickUpPos() {
    this.changePickUpPos(1);
  }

  changePickUpPos(dir: number) {
    if (!this.inControl()) return;
    const cur = this.order[this.turnIdx];
    if (!cur) return;
    const n = this.droppedWeapons?.get(cur.squareX + "," + cur.squareY)?.length ?? 0;
    if (n <= 1) return;
    this.pickUpPos = (((this.pickUpPos + dir) % n) + n) % n;
    this.refreshInfo();
  }

  // ---------- 鎺㈤拡鎺ュ彛锛坰moke_test / t60 绯诲垪锛?----------
  debugFieldInfo() {
    let blocks = 0;
    for (let i = 0; i < this.map.length; i++) blocks += this.map[i];
    return { fieldSize: this.fieldSize, obstacles: this.obstacles.length, mapBlocks: blocks };
  }

  debugFindPath(sx: number, sy: number, tx: number, ty: number): number | null {
    const path = this.aStar(sx, sy, tx, ty, 60);
    return path ? path.length : null;
  }

  debugLos(from: BattleUnit, to: BattleUnit): number {
    return this.losBlockRatio(from, to);
  }

  debugAP(u: BattleUnit): number {
    return this.unitMaxAP(u);
  }

  debugCheckPanic() {
    this.checkPanic();
  }

  get panicDlgVisible(): boolean {
    return !!this.panicOv && this.panicOv.visible;
  }

  get lootDlgVisible(): boolean {
    return !!this.lootDlg && this.lootDlg.screen.visible;
  }

  debugDamage(base: number, armor: number, neutralization = 0): { dmg: number; crit: boolean } {
    const eff = armor * (1 - neutralization / 100);
    let dmg = Math.max(base * (1 - eff / 100) - eff / 5, 0);
    const crit = Math.random() < 0.05;
    if (crit) dmg *= 1.5 + Math.random();
    dmg = dmg * 0.8 + Math.random() * dmg * 0.4;
    return { dmg: Math.max(1, Math.round(dmg)), crit };
  }
}


