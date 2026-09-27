import { EngineText } from "../core/EngineText";
import { Sprite } from "../core/Display";

export interface BattleMessage {
  text: string; kind: number; color: number; counter: number;
  ttl: number; fade: number; obj: EngineText;
}

/** BattleInterface.addMessage / EF: fixed 25 Hz, 250 ticks alive, final 30 fade. */
export class BattleMessages {
  readonly entries: BattleMessage[] = [];
  private acc = 0;
  constructor(readonly layer: Sprite) { layer.mouseEnabled = layer.mouseChildren = false; }
  add(kind: number, text: string) {
    if (!text) return;
    const color = kind === 1 ? 5062143 : kind === 3 ? 4456448 : 16777215;
    const y = this.entries.length ? this.entries[this.entries.length - 1].obj.y + 15 : 0;
    const obj = new EngineText(text, color, 11, "left", 5, y, 640, 20);
    obj.mouseEnabled = false;
    this.layer.addChild(obj);
    this.entries.push({ text, kind, color, counter: 0, ttl: 250, fade: 30, obj });
  }
  update(dt: number) {
    this.acc += dt * 25;
    while (this.acc >= 1 - 1e-9) {
      this.acc = Math.max(0, this.acc - 1);
      for (let i = 0; i < this.entries.length; i++) {
        const m = this.entries[i];
        m.counter++;
        if (m.counter >= m.ttl) {
          this.layer.removeChild(m.obj);
          this.entries.splice(i--, 1);
          continue;
        }
        m.obj.alpha = Math.min(1, (m.ttl - m.counter) / m.fade);
        const target = i * 15;
        m.obj.y += (target - m.obj.y) / 10;
        if (Math.abs(m.obj.y - target) < 0.5) m.obj.y = target;
      }
    }
  }
}
