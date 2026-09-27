/** Original BattleField.screenSort: footprint overlap, not sprite top-left Y. */
export interface DepthItem { x: number; y: number; width: number; height: number; }
export function screenSort<T extends DepthItem>(items: T[], cell = 32): T[] {
  const out: T[] = [];
  for (const a of items) {
    const ax = a.x - (a.width - 1) * cell, ay = a.y - (a.height - 1) * cell;
    let insert: number | null = null;
    const before: T[] = [];
    for (let i = 0; i < out.length; i++) {
      const b = out[i], bx = b.x - (b.width - 1) * cell, by = b.y - (b.height - 1) * cell;
      const overlapX = ax <= b.x && bx <= a.x, overlapY = ay <= b.y && by <= a.y;
      const behind = overlapY && !overlapX ? a.x < b.x : overlapX && !overlapY ? a.y < b.y : a.x + a.y < b.x + b.y;
      if (insert === null) { if (behind) insert = i; }
      else if (!behind && (overlapX || overlapY)) { before.push(b); out.splice(i--, 1); }
    }
    insert ??= out.length;
    out.splice(insert, 0, a);
    for (const b of before) out.splice(insert, 0, b);
  }
  return out;
}
