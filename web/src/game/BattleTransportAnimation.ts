/** BattleField EF: animals idle at 1/30, recoil 2..8/31..37, die 10..29/39..58. */
export interface TransportAnimation { frame: number; acc: number; phase: "idle" | "hit" | "death"; towing: boolean; done: boolean; }
export function newTransportAnimation(towing = false): TransportAnimation {
  return { frame: towing ? 30 : 1, acc: 0, phase: "idle", towing, done: true };
}
export function startTransportAnimation(a: TransportAnimation, death: boolean) {
  a.phase = death ? "death" : "hit";
  a.frame = (death ? 10 : 2) + (a.towing ? 29 : 0); a.acc = 0; a.done = false;
}
export function advanceTransportAnimation(a: TransportAnimation, dt: number): number {
  let sounds = 0; a.acc += dt * 25;
  while (a.acc >= 1 - 1e-9) {
    a.acc = Math.max(0, a.acc - 1);
    if (a.done) continue;
    a.frame++;
    if (a.phase === "hit" && a.frame >= (a.towing ? 38 : 9)) {
      a.frame = a.towing ? 30 : 1; a.phase = "idle"; a.done = true;
    }
    if (a.phase === "death") {
      if (a.frame === (a.towing ? 52 : 22)) sounds++;
      if (a.frame >= (a.towing ? 58 : 29)) { a.frame = a.towing ? 58 : 29; a.done = true; }
    }
  }
  return sounds;
}
