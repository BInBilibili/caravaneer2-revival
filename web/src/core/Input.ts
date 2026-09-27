// 输入系统：画布坐标→逻辑坐标(880x495)，点击/悬停/滚轮
import type { DisplayObject } from "./Display";

const LOGICAL_W = 880, LOGICAL_H = 495;

export class Input {
  // —— 滚动条拖动协作（ScrollableArea 拖滑块用）——
  /** 全局拖动状态（ScrollableArea 按下滑块时写入；Input 在 move/up 时调用） */
  static drag: { onMove: (x: number, y: number) => void; onUp: () => void; onCancel?: () => void } | null = null;

  private downTarget: DisplayObject | null = null;
  private overTarget: DisplayObject | null = null;
  // 最近一次指针逻辑坐标（880x495），供 hover 逻辑（如城镇 blueSign）读取；无指针事件时为 -1
  static mouseX = -1;
  static mouseY = -1;
  /** MapMode may temporarily request the native pointer for a town overlap. */
  static cursorOverride: "default" | "pointer" | "none" | null = null;
  private static canvas: HTMLCanvasElement | null = null;
  private static instance: Input | null = null;

  constructor(private canvas: HTMLCanvasElement, private getRoot: () => DisplayObject | null) {
    Input.canvas = canvas;
    Input.instance = this;
    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    canvas.addEventListener("pointerup", (e) => this.onUp(e));
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    // 指针离开画布 → 复位坐标（防止 hover 卡在最后位置）
    canvas.addEventListener("pointerleave", () => {
      Input.mouseX = -1;
      Input.mouseY = -1;
      Input.cursorOverride = null;
      canvas.style.cursor = "default";
    });
  }

  private toLogical(e: PointerEvent | WheelEvent) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * LOGICAL_W;
    const y = ((e.clientY - r.top) / r.height) * LOGICAL_H;
    Input.mouseX = x;
    Input.mouseY = y;
    return { x, y };
  }

  /** Apply the requested native cursor immediately; used by map hover state between pointer events. */
  static syncCursor() {
    const canvas = Input.canvas;
    if (!canvas) return;
    const x = Input.mouseX, y = Input.mouseY;
    const hideNative = !!(globalThis as any).__c2HideNativeCursor && x >= 0 && x < 640 && y >= 0 && y < 445;
    const target = x >= 0 && y >= 0 ? Input.instance?.getRoot()?.hitTestPoint(x, y) : null;
    canvas.style.cursor = hideNative ? "none" : Input.cursorOverride ?? (target?.buttonMode ? "pointer" : "default");
  }

  private onDown(e: PointerEvent) {
    const { x, y } = this.toLogical(e);
    this.downTarget = this.getRoot()?.hitTestPoint(x, y) ?? null;
    if (this.downTarget) this.downTarget.dispatchEvent("pointerdown", { x, y });
  }

  private onUp(e: PointerEvent) {
    const { x, y } = this.toLogical(e);
    if (Input.drag) {
      const d = Input.drag;
      Input.drag = null;
      try { d.onUp(); } catch { /* 忽略拖动结束异常 */ }
    }
    const t = this.getRoot()?.hitTestPoint(x, y) ?? null;
    if (this.downTarget) this.downTarget.dispatchEvent("pointerup", { x, y });
    if (this.downTarget && t === this.downTarget) {
      this.downTarget.dispatchClick({ type: "click", x, y });
    }
    this.downTarget = null;
    // 点击按钮可能在回调中切换战斗/设置状态；立即同步原生光标，避免继续保持 none。
    Input.syncCursor();
  }

  private onMove(e: PointerEvent) {
    const { x, y } = this.toLogical(e);
    if (Input.drag) {
      try { Input.drag.onMove(x, y); } catch { /* 拖动回调异常忽略 */ }
    }
    const t = this.getRoot()?.hitTestPoint(x, y) ?? null;
    if (t) t.dispatchEvent("pointermove", { x, y });
    if (t !== this.overTarget) {
      if (this.overTarget) this.overTarget.dispatchEvent("pointerout", { x, y });
      this.overTarget = t;
      if (t) t.dispatchEvent("pointerover", { x, y });
    }
    // 战斗场景使用画布内的脚印/目标光标，隐藏浏览器原生箭头，避免两个光标叠加。
    Input.syncCursor();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const { x, y } = this.toLogical(e);
    const t = this.getRoot()?.hitTestPoint(x, y) ?? null;
    let node: DisplayObject | null = t;
    while (node) {
      if (node.onWheel) { node.onWheel(e.deltaY, x, y); return; }
      node = node.parent;
    }
  }
}
