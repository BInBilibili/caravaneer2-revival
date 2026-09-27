// 城镇与剧情对话共用的治疗／维修窗口，避免隐藏医生设施只有状态、没有界面。
import { Sprite, Graphics, BitmapObject, DisplayObject } from '../core/Display';
import { EngineText } from '../core/EngineText';
import { getText, type DataStore } from '../core/DataStore';
import type { AssetStore } from '../core/Assets';
import { ScrollableArea, Button } from '../core/Ui';
import { addDialogueBackground, DialogueTextMask } from '../core/DialogueBg';
import { sfxClick } from '../core/Sound';
import { GameData } from './World';
import { YesNoDialogue } from './YesNoDialogue';
import { numberFormat } from './ConsProdGraph';
import { Input } from '../core/Input';
import { buildPortraitFromCharacter } from './Portrait';
import { makePersonCell } from './PeopleGrid';
import { attachLocationSymbol, locationSymbolParts } from './LocationSymbols';

/** Original vertical gradient; beige = existing HP, blue = newly purchased HP. */
class HealingBar extends DisplayObject {
  start = 0;
  end = 0;
  constructor(private colors: number[]) { super(); this.x = 244; this.y = 269; this.mouseEnabled = false; }
  clear() { this.start = this.end = 0; }
  renderSelf(ctx: CanvasRenderingContext2D) {
    if (this.end <= this.start) return;
    const gradient = ctx.createLinearGradient(0, 0, 0, 24);
    [0, 50, 55, 60, 200, 255].forEach((stop, i) => gradient.addColorStop(stop / 255, '#' + this.colors[i].toString(16).padStart(6, '0')));
    ctx.fillStyle = gradient;
    ctx.fillRect(this.start, 0, this.end - this.start, 24);
  }
}

export class HealingFacility {
  readonly screen = new Sprite();
  constructor(private gd: GameData, private ds: DataStore, private assets: AssetStore) { this.screen.visible = false; }
  private text(id: number) { return getText(this.ds, id, this.ds.language); }
  private fmt(n: number) { return numberFormat(n, 2, true); }
  private tpl(text: string, replacements: Record<string, string>) { for (const [key, value] of Object.entries(replacements)) text = text.split(key).join(value); return text; }
  private indMsg: YesNoDialogue | null = null;
  private indConfirm: YesNoDialogue | null = null;
  private indDlg(text: string, onOk: (() => void) | null, onCancel: (() => void) | null = null) {
    const twoBtn = !!(onOk || onCancel);
    const d = twoBtn
      ? (this.indConfirm ?? (this.indConfirm = new YesNoDialogue(this.ds, this.assets, false)))
      : (this.indMsg ?? (this.indMsg = new YesNoDialogue(this.ds, this.assets, true)));
    if (d.parent !== this.screen) this.screen.addChild(d);
    d.visible = false;
    d.show(text, onOk ?? undefined, onCancel ?? undefined);
  }
  get indDlgVisible(): any {
    return {
      msg: this.indMsg ? this.indMsg.visible : false,
      msgText: this.indMsg && this.indMsg.text ? this.indMsg.text.text : "",
      confirm: this.indConfirm ? this.indConfirm.visible : false,
      confirmText: this.indConfirm && this.indConfirm.text ? this.indConfirm.text.text : "",
    };
  }

  // ---------- 治疗/维修（原版 HealingFacility.as：Heal All 3514-3520、动物/车辆、手术） ----------
  private healOv: Sprite | null = null;
  private healLoc: any = null;
  private healTown: any = null;
  private healCat = 1;
  private healRel = 1;
  private healTarget: any = null;
  private currHeal = 0;
  private healList!: ScrollableArea;
  private healTitle!: EngineText;
  private healTownText!: EngineText;
  private targetName!: EngineText;
  private targetHealth!: EngineText;
  private healWounded!: EngineText;
  private healAllInfo!: EngineText;
  private healInfo!: EngineText;
  private healBtnText!: EngineText;
  private healAllBtnText!: EngineText;
  private bottomCapacity!: EngineText;
  private bottomDate!: EngineText;
  private bottomMoney!: EngineText;
  private portrait = new Sprite();
  private barBeige = new HealingBar([7299403, 12102291, 16777215, 12102291, 12102291, 7299403]);
  private barBlue = new HealingBar([5460343, 8881579, 16777215, 8881579, 8881579, 5460343]);
  private facilitySign = new Sprite();
  private pointer = new Sprite();
  private surgery: Array<{ key: string; id: number; price: number; width: number; solid: Sprite; blank: Sprite }> = [];

  show(loc: any, town?: any) {
    Input.drag = null;
    if (this.indMsg) this.indMsg.visible = false;
    if (this.indConfirm) this.indConfirm.visible = false;
    this.screen.visible = true;
    this.healLoc = loc;
    this.healTown = town ?? loc?.town ?? null;
    this.healCat = loc?.subCategory ?? 1;
    const relPrice = Number(loc?.relPrice ?? 1);
    this.healRel = Number.isFinite(relPrice) && relPrice >= 0 ? relPrice : 1;
    this.healTarget = null;
    this.currHeal = 0;
    for (const target of this.healTargets()) this.setHp(target, Math.round(this.hpOf(target)));
    if (this.healOv) { this.healOv.visible = true; this.healList.hscroll = 0; this.renderHeal(); return; }
    const ov = new Sprite();
    // Dialogue.as: FG is masked by the labels, never spread over the whole BG.
    addDialogueBackground(ov, this.assets, 0, 0, 880, 495, 0, undefined, false);
    const hit = new Graphics(); hit.hitRect(0, 0, 880, 495); ov.graphics = hit;
    const frame = new Graphics();
    frame.lineStyle(1, 16777215);
    frame.moveTo(0, 472); frame.lineTo(880, 472);
    frame.drawRect(9, 361, 862, 102); frame.moveTo(10, 451); frame.lineTo(870, 451); frame.drawRect(390, 112, 100, 100);
    for (let n = 0; n <= 100; n += 2) { const tick = n % 10 === 0 ? 7 : 3; frame.moveTo(250 + 380 * n / 100, 257); frame.lineTo(250 + 380 * n / 100, 257 - tick); }
    ov.addChild(frame);
    const footer = new Graphics(); footer.beginFill(16777215, 0.3); footer.drawRect(0, 0, 860, 10);
    const footerSp = new Sprite(); footerSp.x = 10; footerSp.y = 452; footerSp.graphics = footer; footerSp.mouseEnabled = false; ov.addChild(footerSp);
    this.healTitle = new EngineText('', 16777215, 14, 'left', 20, 32, 400, 20);
    this.healTownText = new EngineText('', 16777215, 14, 'right', 460, 32, 400, 20);
    this.targetName = new EngineText('', 16777215, 14, 'left', 20, 152, 400, 20);
    this.targetHealth = new EngineText('', 16777215, 14, 'right', 460, 152, 400, 20);
    this.healInfo = new EngineText('', 16777215, 14, 'center', 10, 222, 860, 20);
    this.healWounded = new EngineText('', 16777215, 14, 'left', 20, 327, 400, 20);
    this.healAllInfo = new EngineText('', 16777215, 14, 'right', 460, 327, 400, 20);
    ov.addChild(new DialogueTextMask(this.assets, 880, 495, [this.healTitle, this.healTownText, this.targetName, this.targetHealth, this.healInfo, this.healWounded, this.healAllInfo]));
    this.portrait.x = 390; this.portrait.y = 112; this.portrait.scaleX = this.portrait.scaleY = 0.4; ov.addChild(this.portrait);
    const portraitFrame = new Sprite(); const pf = new Graphics(); pf.lineStyle(1, 16777215); pf.drawRect(0, 0, 100, 100); portraitFrame.graphics = pf; portraitFrame.x = 390; portraitFrame.y = 112; portraitFrame.mouseEnabled = false; ov.addChild(portraitFrame);
    const under = new Sprite(); const underGraphics = new Graphics();
    underGraphics.beginFill(2367002, 0.6); underGraphics.drawRect(0, 0, 392, 24);
    under.graphics = underGraphics; under.x = 244; under.y = 269; under.mouseEnabled = false; ov.addChild(under);
    ov.addChild(this.barBeige);
    ov.addChild(this.barBlue);
    const frameSp = new Sprite(); frameSp.x = 235; frameSp.y = 257; frameSp.mouseEnabled = false; ov.addChild(frameSp);
    const putFrame = (im: HTMLImageElement | null) => { if (im && frameSp.parent && frameSp.children.length === 0) frameSp.addChild(new BitmapObject(im)); };
    putFrame(this.assets.getImage('HealingFrame.png')); void this.assets.ensure('HealingFrame.png').then(putFrame);
    this.pointer = new Sprite(); this.pointer.x = 431; this.pointer.y = 284; this.pointer.buttonMode = true;
    const putPointer = (im: HTMLImageElement | null) => { if (im && this.pointer.parent && this.pointer.children.length === 0) this.pointer.addChild(new BitmapObject(im)); };
    putPointer(this.assets.getImage('HealingFramePointer.png')); void this.assets.ensure('HealingFramePointer.png').then(putPointer);
    const ptrHit = new Graphics(); ptrHit.hitRect(0, 0, 21, 42); this.pointer.graphics = ptrHit;
    this.pointer.mouseChildren = false;
    this.pointer.addEventListener('pointerdown', () => {
      if (!this.healTarget) return;
      const offset = Input.mouseX - this.pointer.x;
      Input.drag = { onMove: (x) => { this.pointer.x = Math.max(241, Math.min(621, x - offset)); this.currHeal = this.valueAtPointer(); this.updateHealLevel(); }, onUp: () => undefined };
    });
    ov.addChild(this.pointer);
    const healBtn = new Button(2, () => this.healSingle(), ' ', this.assets); healBtn.x = 657; healBtn.y = 269; ov.addChild(healBtn); this.healBtnText = healBtn.children[healBtn.children.length - 1] as EngineText;
    const allBtn = new Button(2, () => this.healAll(), ' ', this.assets); allBtn.x = 337; allBtn.y = 324; ov.addChild(allBtn); this.healAllBtnText = allBtn.children[allBtn.children.length - 1] as EngineText;
    this.facilitySign.x = 440; this.facilitySign.y = 40; this.facilitySign.mouseEnabled = this.facilitySign.mouseChildren = false; ov.addChild(this.facilitySign);
    this.surgery = [];
    const defs = [{ key: 'eyeDamage', price: 10000, id: 1375 }, { key: 'armDamage', price: 6000, id: 1376 }, { key: 'legDamage', price: 8000, id: 1377 }];
    for (const d of defs) {
      const label = this.text(d.id).toUpperCase();
      const st = new EngineText(label, 0, 16, 'center', 0, -1, 880, 20);
      const width = st.textWidth + 20; st.width = width;
      const solid = new Sprite(); solid.blendMode = 'layer'; solid.blendAtDisplayResolution = true; solid.mouseChildren = false;
      const sg = new Graphics(); sg.beginFill(16777215); sg.drawRect(0, 0, width, 20); solid.graphics = sg; solid.buttonMode = true;
      st.blendMode = 'erase'; st.blendAtDisplayResolution = true; solid.addChild(st);
      const blank = new Sprite(); const bg = new Graphics(); bg.lineStyle(1, 16777215); bg.drawRect(0, 0, width, 20); blank.graphics = bg;
      blank.addChild(new EngineText(label, 16777215, 16, 'center', 0, -1, width, 20));
      solid.addEventListener('click', () => { sfxClick(); this.healSurgery(d.key, d.price * this.healRel, label); });
      ov.addChild(blank); ov.addChild(solid);
      this.surgery.push({ key: d.key, id: d.id - 1374, price: d.price, width, solid, blank });
    }
    this.healList = new ScrollableArea(860, 90, 860, 90, false, true, false, 10, 10, this.assets);
    this.healList.x = 10; this.healList.y = 362; ov.addChild(this.healList);
    const close = new Button(2, () => this.close(), this.text(1344).toUpperCase(), this.assets); close.x = 17; close.y = 269; ov.addChild(close);
    this.bottomCapacity = new EngineText('', 16777215, 14, 'left', 10, 474, 300, 20); this.bottomDate = new EngineText('', 16777215, 14, 'right', 10, 474, 860, 20); this.bottomMoney = new EngineText('', 16777215, 14, 'left', 10, 474, 300, 20);
    ov.addChild(new DialogueTextMask(this.assets, 880, 495, [this.bottomCapacity, this.bottomDate, this.bottomMoney]));
    this.screen.addChild(ov); this.healOv = ov; this.renderHeal();
  }

  private close() { if (this.healOv) this.healOv.visible = false; this.screen.visible = false; Input.drag = null; }
  private valueAtPointer() { const p = this.healTarget; if (!p) return 0; const mh = Math.max(1, Math.round(this.maxHpOf(p))); return Math.max(Math.round(this.hpOf(p)), Math.min(mh, Math.round((this.pointer.x + 9 - 250) / 380 * mh))); }
  private updateBottomLine() {
    const c = this.gd.Caravans[0], d = this.gd.makeDate();
    this.bottomCapacity.text = this.text(903).toUpperCase() + ': ' + numberFormat(c.totalCargo, 0) + '/' + numberFormat(c.maxCargo, 0) + ' ' + this.text(12).toUpperCase();
    this.bottomDate.text = `${d.Day2d}-${d.ShortMonthName}-${d.Year2d} ${d.Hour2d}:${d.Minute2d}`;
    this.bottomMoney.text = this.text(20).toUpperCase() + ': ' + numberFormat(c.money, 2);
    this.bottomMoney.x = 10 + this.bottomCapacity.textWidth + (860 - this.bottomCapacity.textWidth - this.bottomDate.textWidth) / 2 - this.bottomMoney.textWidth / 2;
  }
  private updateHealLevel() {
    const p = this.healTarget;
    if (!p) return;
    const hp = Math.round(this.hpOf(p)), mh = Math.max(1, Math.round(this.maxHpOf(p)));
    const pricePerHP = this.healPriceOf(p);
    const affordableHP = pricePerHP > 0 ? hp + Math.floor(this.gd.Caravans[0].money / pricePerHP) : mh;
    const curr = Math.max(hp, Math.min(mh, affordableHP, Math.round(this.currHeal)));
    this.currHeal = curr;
    this.pointer.x = 250 + curr / mh * 380 - 9;
    this.barBeige.start = 1;
    this.barBeige.end = 6 + hp / mh * 380;
    this.barBlue.start = this.barBeige.end;
    this.barBlue.end = 6 + curr / mh * 380;
    this.healInfo.text = this.tpl(this.text(this.healCat === 3 ? 1366 : 1365), {
      '@number@': String(curr - hp), '@price@': numberFormat((curr - hp) * pricePerHP, 2) + ' €',
    }).toUpperCase();
  }

  private addTransportPortrait(holder: Sprite, p: any, list = false) {
    const add = (name: string, x = 0, y = 0, scale = 1, centered = false) => {
      const layer = new Sprite(); layer.x = x; layer.y = y; holder.addChild(layer);
      if (centered) layer.alpha = 0.5;
      const put = (im: HTMLImageElement | null) => {
        if (!im || !layer.parent) return;
        const b = new BitmapObject(im); b.scaleX = b.scaleY = scale;
        if (centered) { b.x = -im.naturalWidth * scale / 2; b.y = -im.naturalHeight * scale / 2; }
        layer.removeAll(); layer.addChild(b);
      };
      const im = this.assets.getImage(name); if (im) put(im); else void this.assets.ensure(name).then(put);
    };
    if (list) { const bg = new Graphics(); bg.beginFill(9472128, 0.8); bg.drawRect(0, 0, 250, 250); holder.addChild(bg); }
    add('transportIcon' + p.type + '.png');
    if (!list) return;
    const cat = this.gd.Caravans[0].transportType(p).category;
    if (cat === 1) {
      add(p.gender === 1 ? 'InterfaceIconMale.png' : 'InterfaceIconFemale.png', 40, 210, 0.7, true);
    }
    if (cat === 1 && p.cart) add('filtericoncarts.png', 210, 210, 1.3, true);
    if (cat === 2 && p.attachedTo) add('filtericonanimals.png', 210, 210, 1.3, true);
  }

  private isTransport(p: any): boolean { return !!p && typeof p === "object" && p.type !== undefined && p.maxHealth !== undefined; }
  // 运输单位显示名：givenName（玩家命名）→ 本地化类型名
  private tName(p: any): string {
    if (p && typeof p.givenName === "string" && p.givenName.length > 0) return p.givenName;
    const t = this.ds?.transports?.Types?.[p?.type];
    return t && t.name ? this.text(t.name) : "?";
  }
  private hpOf(p: any): number { return this.isTransport(p) ? (p.health ?? 0) : (p.HP ?? 0); }
  private maxHpOf(p: any): number { return this.isTransport(p) ? (p.maxHealth ?? 1) : (p.maxHP ?? 1); }
  private setHp(p: any, v: number) { if (this.isTransport(p)) p.health = v; else p.HP = v; }
  // 原版 healPrice：人 40 / 动物 20 / 拖车 25 / 车 70，× relPrice
  private healPriceOf(p: any): number {
    if (this.isTransport(p)) {
      const cat = this.gd.Caravans[0].transportType(p).category ?? 1;
      if (cat === 1) return 20 * this.healRel;
      if (cat === 2) return 25 * this.healRel;
      return 70 * this.healRel;
    }
    if (p.specialPurpose === 1 && this.healTown === this.gd.Towns[17]) return 0;
    return 40 * this.healRel;
  }
  private healTargets(): any[] {
    const c = this.gd.Caravans[0];
    if (this.healCat === 1) return c.People;
    if (this.healCat === 2) return c.transports.filter((tr: any) => c.transportType(tr).category === 1);
    return c.transports.filter((tr: any) => { const cat = c.transportType(tr).category ?? 0; return cat === 2 || cat === 3; });
  }
  private healAllPrice(): number {
    let s = 0;
    for (const p of this.healTargets()) {
      if (Math.round(this.hpOf(p)) < Math.round(this.maxHpOf(p))) s += this.healPriceOf(p) * (Math.round(this.maxHpOf(p)) - Math.round(this.hpOf(p)));
    }
    return s;
  }

  private renderHeal() {
    if (!this.healOv) return;
    this.healTitle.text = this.text(this.healLoc?.name ?? 50).toUpperCase();
    this.healTownText.text = String(this.healTown?.name ?? this.healLoc?.townName ?? '').toUpperCase();
    const isRepair = this.healCat === 3;
    this.healBtnText.text = this.text(isRepair ? 1364 : 1363).toUpperCase(); this.healAllBtnText.text = this.text(isRepair ? 3515 : 3514).toUpperCase();
    const targets = this.healTargets();
    if (!this.healTarget || !targets.includes(this.healTarget)) { this.healTarget = null; this.currHeal = 0; }
    if (!this.healTarget && targets.length) {
      this.healTarget = targets[0]; this.currHeal = Math.round(this.maxHpOf(this.healTarget));
    }
    this.facilitySign.removeAll();
    attachLocationSymbol(this.facilitySign, locationSymbolParts(this.healLoc?.symbol ?? this.healCat + 3), this.assets);
    const scroll = this.healList.hscroll;
    this.healList.clearAll();
    targets.forEach((p, i) => {
      const onClick = () => { sfxClick(); this.healTarget = p; this.currHeal = Math.round(this.maxHpOf(p)); this.renderHeal(); };
      let cell: Sprite;
      if (!this.isTransport(p)) {
        cell = makePersonCell(this.assets, this.ds, p, {cellW: 70, selected: p === this.healTarget, picBGColor: 9472128, selectFrameSize: 2, selectFrameAlpha: 1, onClick});
        let indicatorX = 30;
        for (const [key, name] of [['eyeDamage', 'Eye'], ['armDamage', 'Arm'], ['legDamage', 'Leg']]) {
          if (!p[key]) continue;
          const holder = new Sprite(); holder.x = indicatorX; holder.y = 30; holder.alpha = 0.5;
          cell.addChild(holder); indicatorX += 50;
          const put = (im: HTMLImageElement | null) => {
            if (!im || !holder.parent) return;
            const b = new BitmapObject(im); b.scaleX = b.scaleY = 0.5;
            b.x = -im.naturalWidth / 4; b.y = -im.naturalHeight / 4;
            b.colorTransform = {r: 1, g: 1, b: 1, dr: 255, dg: 255, db: 255};
            holder.removeAll(); holder.addChild(b);
          };
          const asset = 'Indicator' + name + 'Damage.png', im = this.assets.getImage(asset);
          if (im) put(im); else void this.assets.ensure(asset).then(put);
        }
      } else {
        cell = new Sprite(); cell.scaleX = cell.scaleY = 70 / 250;
        this.addTransportPortrait(cell, p, true);
        const g = new Graphics(); g.hitRect(0, 0, 250, 250); cell.graphics = g;
        if (p === this.healTarget) { const frame = new Graphics(); frame.lineStyle(2 / cell.scaleX, 16777215); frame.drawRect(-3, -3, 256, 256); cell.addChild(frame); }
        cell.addEventListener('click', onClick);
      }
      cell.x = 10 + i * 80; cell.y = 10; cell.buttonMode = true; cell.mouseChildren = false;
      // ScrollableArea measures logical width, not the portrait's 250px master coordinates.
      const item = new Sprite(); item.x = cell.x; item.y = cell.y; cell.x = cell.y = 0;
      Object.assign(item, {width: 80, height: 80}); item.addChild(cell); this.healList.addContent(item);
    });
    this.healList.updateSize(); this.healList.hscroll = scroll;
    const wounded = targets.filter((p) => Math.round(this.hpOf(p)) < Math.round(this.maxHpOf(p))).length; const wId = this.healCat === 3 ? 3513 : this.healCat === 2 ? 3512 : 3511; const pId = this.healCat === 3 ? 3517 : 3516;
    this.healWounded.text = this.text(wId).toUpperCase() + ': ' + wounded; this.healAllInfo.text = this.text(pId).toUpperCase() + ': ' + numberFormat(this.healAllPrice(), 2, true) + ' €'; this.updateBottomLine();
    this.portrait.removeAll(); this.targetName.text = ''; this.targetHealth.text = ''; this.pointer.visible = !!this.healTarget;
    if (this.healTarget) { const p = this.healTarget, hp = Math.round(this.hpOf(p)), mh = Math.round(this.maxHpOf(p)); this.targetName.text = (this.isTransport(p) ? this.tName(p) : (p.name || '?')).toUpperCase(); this.targetHealth.text = (isRepair ? this.text(1153) : this.text(50)).toUpperCase() + ': ' + hp + ' / ' + mh; if (!this.isTransport(p)) this.portrait.addChild(buildPortraitFromCharacter(this.assets, p, 1)); else this.addTransportPortrait(this.portrait, p); if (!this.currHeal) this.currHeal = mh; this.updateHealLevel(); } else { this.barBeige.clear(); this.barBlue.clear(); this.healInfo.text = ''; }
    const offered = Array.isArray(this.healLoc?.surgeries) ? this.healLoc.surgeries.map(Number) : [];
    const visible = this.surgery.filter(s => this.healCat === 1 && !!this.healTarget && offered.includes(s.id));
    for (const s of this.surgery) {
      const shown = visible.includes(s), enabled = shown && !!this.healTarget?.[s.key];
      s.solid.visible = enabled; s.blank.visible = shown && !enabled;
      s.solid.mouseEnabled = enabled; s.blank.mouseEnabled = s.blank.mouseChildren = false;
    }
    const total = visible.reduce((sum, s) => sum + s.width, 0) + Math.max(0, visible.length - 1) * 10;
    let x = 440 - total / 2;
    for (const s of visible) { s.solid.x = s.blank.x = x; s.solid.y = s.blank.y = 82; x += s.width + 10; }
  }

  private healSingle() {
    const c = this.gd.Caravans[0];
    const p = this.healTarget;
    if (!p) return;
    const hp = Math.round(this.hpOf(p)), mh = Math.round(this.maxHpOf(p));
    let amount = Math.max(0, Math.min(mh, Math.round(this.currHeal)) - hp);
    const ppu = this.healPriceOf(p);
    const afford = ppu > 0 ? Math.floor(c.money / ppu) : amount;
    if (amount > afford) amount = Math.max(0, afford);
    if (amount <= 0) return;
    c.money -= amount * ppu;
    this.setHp(p, hp + amount);
    this.currHeal = mh; // Original list.update re-selects the target and refreshes the maximum preview.
    this.renderHeal();
  }

  // 全部治疗/维修（原版 healAll：够钱→确认 3518-3520 全治；不够→3521-3523 尽力治疗）
  private healAll() {
    const c = this.gd.Caravans[0];
    const targets = this.healTargets().filter((p) => Math.round(this.hpOf(p)) < Math.round(this.maxHpOf(p)));
    if (targets.length === 0 || c.money <= 0) return;
    const price = this.healAllPrice();
    const confirmId = this.healCat === 3 ? 3520 : this.healCat === 2 ? 3519 : 3518;
    const poorId = this.healCat === 3 ? 3523 : this.healCat === 2 ? 3522 : 3521;
    if (price > c.money) {
      this.indDlg(this.tpl(this.text(poorId), { "@money@": this.fmt(price) + " €" }).toUpperCase(), () => this.healAllPartial(targets));
    } else {
      this.indDlg(this.tpl(this.text(confirmId), { "@money@": this.fmt(price) + " €" }).toUpperCase(), () => {
        for (const p of targets) this.setHp(p, Math.round(this.maxHpOf(p)));
        c.money -= price;
        this.renderHeal();
      });
    }
  }

  // 钱不够时按生命值升序逐轮 +1，不能在第二位伤员生命较高时直接停止整轮治疗。
  private healAllPartial(targets: any[]) {
    const c = this.gd.Caravans[0];
    const list = [...targets].sort((a, b) => this.hpOf(a) - this.hpOf(b));
    for (const p of list) this.setHp(p, Math.round(this.hpOf(p)));
    let exhausted = false;
    for (let round = 0; list.length && round <= 100000 && !exhausted; round++) {
      const low = this.hpOf(list[0]);
      let progressed = false;
      for (const p of list) {
        if (this.hpOf(p) > low || this.hpOf(p) >= Math.round(this.maxHpOf(p))) break;
        const ppu = this.healPriceOf(p);
        if (c.money < ppu) { exhausted = true; break; }
        this.setHp(p, this.hpOf(p) + 1);
        c.money -= ppu;
        progressed = true;
      }
      if (!progressed) break;
    }
    this.renderHeal();
  }

  // 手术（原版：1378 手术费 + 1379 钱不够 / 1380 确认）
  private healSurgery(key: string, price: number, label: string) {
    const c = this.gd.Caravans[0];
    const p = this.healTarget;
    if (!p || !(p as any)[key]) return;
    const priceText = this.tpl(this.text(1378), { "@money@": this.fmt(price) + " €" }).toUpperCase();
    if (c.money < price) { this.indDlg(priceText + "\n\n" + this.text(1379).toUpperCase(), null); return; }
    this.indDlg(priceText + "\n\n" + this.text(1380).toUpperCase(), () => {
      c.money -= Math.round(price * 100) / 100;
      (p as any)[key] = 0;
      this.renderHeal();
    });
  }

  // 测试钩子：治疗页状态快照（smoke S8v 断言用）
  healDebug(): any {
    const targets = this.healTargets();
    return {
      pageVisible: !!this.healOv && this.healOv.visible,
      cat: this.healCat, rel: this.healRel,
      targets: targets.map((p: any) => ({ name: this.isTransport(p) ? this.tName(p) : p.name, hp: Math.round(this.hpOf(p)), max: Math.round(this.maxHpOf(p)) })),
      wounded: targets.filter((p: any) => Math.round(this.hpOf(p)) < Math.round(this.maxHpOf(p))).length,
      allPrice: this.healAllPrice(),
      selected: this.healTarget ? (this.isTransport(this.healTarget) ? this.tName(this.healTarget) : this.healTarget.name) : null,
      money: Math.round(this.gd.Caravans[0].money),
      dlg: this.indDlgVisible,
    };
  }


}
