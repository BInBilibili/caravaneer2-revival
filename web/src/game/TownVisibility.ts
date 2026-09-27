import type { GameData } from './World';

/** MapMode.as:971–983,2677–2686：相邻九个方格、活跃城镇、欧式距离；发现永久保留。 */
export function discoverVisibleTowns(gd: GameData): Set<number> {
  const caravan = gd.Caravans[0], visible = new Set<number>();
  if (!caravan) return visible;
  const sx = Math.floor(caravan.x / 500), sy = Math.floor(caravan.y / 500);
  caravan.nearbyTowns = [];
  for (const town of gd.Towns) {
    if (!town || Math.abs(Math.floor(town.x / 500) - sx) > 1 || Math.abs(Math.floor(town.y / 500) - sy) > 1) continue;
    caravan.nearbyTowns.push(town.id);
    if (town.active && Math.hypot(town.x - caravan.x, town.y - caravan.y) <= town.noticeability * caravan.sight) {
      town.discovered = true;
      visible.add(town.id);
    }
  }
  return visible;
}
