/** Item.as:2357 amount getter. Raw production/consumption values are not truncated. */
export function itemAmount(raw: number, divisible: boolean): number {
  if (!Number.isFinite(raw)) return 0;
  if (!divisible) return Math.round(raw);
  if (raw > 0 && raw < 0.05) return 0.1;
  return Math.round(raw * 10) / 10;
}
