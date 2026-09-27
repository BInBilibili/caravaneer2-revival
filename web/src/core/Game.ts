// 游戏核心：固定逻辑分辨率 + 窗口等比缩放 + 场景管理与主循环
export class Game {
  readonly ctx: CanvasRenderingContext2D;
  private scene: Scene | null = null;
  private raf = 0;
  private lastT = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly width: number,
    readonly height: number,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(window.innerWidth / this.width, window.innerHeight / this.height);
    const w = Math.floor(this.width * scale * dpr);
    const h = Math.floor(this.height * scale * dpr);
    this.canvas.style.width = this.width * scale + "px";
    this.canvas.style.height = this.height * scale + "px";
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    // 逻辑分辨率 880x495 固定，窗口放大后位图（城镇贴图 620x360 等）会被放大 2x+；
    // 必须开启双线性平滑（Flash 播放器默认行为），否则 nearest-neighbor 放大产生明显锯齿。
    // 文本走 fillText 矢量渲染，不受 imageSmoothingEnabled 影响，依然清晰。
    this.ctx.imageSmoothingEnabled = true;
  }

  setScene(s: Scene) { this.scene = s; }

  /** F1 开关：左上角帧率显示（静态标志，Shell 的 F1 按键切换） */
  static showFps = false;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fpsText = "";

  /** FPS 计数器渲染到 canvas 左上角（世界层之后，等比缩放下仍按逻辑坐标绘制） */
  private renderFps() {
    const ctx = this.ctx;
    const font = '10px "Microsoft YaHei","Microsoft JhengHei","Noto Sans SC","SimHei",Arial,sans-serif';
    ctx.font = font;
    const label = "FPS " + this.fpsText;
    const w = ctx.measureText(label).width + 6;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(2, 2, w, 13);
    ctx.fillStyle = "#9fdc6a";
    ctx.fillText(label, 5, 12);
  }

  start() {
    this.lastT = performance.now();
    const loop = (t: number) => {
      const dt = Math.min((t - this.lastT) / 1000, 0.1);
      this.lastT = t;
      try {
      if (this.scene) {
        this.scene.update(dt);
        this.ctx.save();
        this.ctx.fillStyle = "#000";
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.scene.render(this.ctx);
        this.ctx.restore();
        // FPS 采样（1 秒窗口）
        this.fpsAcc += dt;
        this.fpsFrames++;
        if (this.fpsAcc >= 1) {
          this.fpsText = String(Math.round(this.fpsFrames / this.fpsAcc));
          this.fpsAcc = 0;
          this.fpsFrames = 0;
        }
        if (Game.showFps) this.renderFps();
      }
      } catch (err) { console.error("game loop error", err); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
}

export interface Scene {
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}
