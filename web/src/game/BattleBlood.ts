/** Original BattleField blood physics. World coordinates, fixed 25 Hz ticks. */
export interface BloodDrop { x: number; y: number; z: number; vx: number; vy: number; vz: number; alpha: number; }
export interface BleedingBody { x: number; y: number; bleeding: number; dead: boolean; isTransport?: boolean; transportKind?: string; __doll?: { walk?: unknown; dispX: number; dispY: number }; }
export class BattleBlood {
  drops: BloodDrop[] = [];
  private acc = 0;
  constructor(private land: (x: number, y: number) => void, private random = Math.random) {}
  private drop(x: number, y: number, vx: number, vy: number) {
    this.drops.push({ x, y, z: 40, vx, vy, vz: 0, alpha: 0.2 + this.random() * 0.2 });
  }
  hit(x: number, y: number, damage: number, sourceX: number, sourceY: number) {
    const angle = Math.atan2(x - sourceX, y - sourceY);
    const count = Math.min(Math.round(Math.max(0, damage) * 4), 1000);
    for (let i = 0; i < count; i++) {
      const spread = Math.pow(this.random(), 2) * 0.8;
      const a = angle + (this.random() < 0.5 ? -spread : spread);
      const speed = Math.pow(this.random(), 2) * (0.8 - spread) * 8;
      this.drop(x, y, Math.sin(a) * speed, Math.cos(a) * speed);
    }
  }
  update(dt: number, bodies: BleedingBody[]) {
    this.acc += dt * 25;
    while (this.acc >= 1 - 1e-9) {
      this.acc = Math.max(0, this.acc - 1);
      for (const u of bodies) {
        if (u.dead || u.bleeding <= 0.5 || (u.isTransport && u.transportKind !== "animal")) continue;
        if (this.random() >= 0.1 - 1 / (u.bleeding * 20)) continue;
        const r = Math.pow(this.random(), 3) * 5, a = this.random() * Math.PI * 2;
        const dx = Math.sin(a) * r, dy = Math.cos(a) * r;
        const x = u.__doll?.walk ? u.__doll.dispX : u.x, y = u.__doll?.walk ? u.__doll.dispY : u.y;
        this.drop(x + dx, y + dy, dx * 0.5, dy * 0.5);
      }
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        d.x += d.vx; d.y += d.vy; d.z -= ++d.vz;
        if (d.z <= 0) { this.land(d.x, d.y); this.drops.splice(i, 1); }
      }
    }
  }
}
