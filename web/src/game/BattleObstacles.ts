/** Original BattleField.generateRandomObstacles and Obstacle.Data placement rules. */
export interface ObstacleDefinition {
  fillSquares: Array<{ x: number; y: number }>;
  elevation: number;
  segments: Array<{ x: number; y: number; end?: boolean }>;
  width: number; height: number; zHeight: number; shiftX: number; shiftY: number;
}
export interface FieldObstacle {
  type: number; gx: number; gy: number; cells: Array<[number, number]>;
}
export interface FixedObstacle { type: number; gx?: number; gy?: number; x?: number; y?: number }
// Buildings, tents, campfires and the intact wall are explicit scenery only.
export const RANDOM_OBSTACLE_TYPES = Object.freeze(Array.from({ length: 30 }, (_, i) => i + 2));
export const blocksMovement = (definition: ObstacleDefinition | undefined): boolean => !!definition && definition.elevation > 1;

export function placeObstacles(defs: ObstacleDefinition[], width: number, height: number,
  map: Uint8Array, fixed?: FixedObstacle[] | null, random = Math.random, typeRandom = random): FieldObstacle[] {
  const obstacles: FieldObstacle[] = [];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const cellsAt = (type: number, gx: number, gy: number): Array<[number, number]> =>
    defs[type - 1].fillSquares.map(p => [gx + p.x, gy + p.y]);
  const mark = (cells: Array<[number, number]>, value: number) => {
    for (const [x, y] of cells) if (inside(x, y)) map[y * width + x] = value;
  };
  if (fixed != null) {
    // Fixed scenes keep their supplied order, coordinates and overlaps; [] means an empty scene.
    for (const o of fixed) {
      if (!defs[o.type - 1]) continue;
      const gx = o.gx ?? o.x ?? 0, gy = o.gy ?? o.y ?? 0;
      const cells = cellsAt(o.type, gx, gy);
      if (blocksMovement(defs[o.type - 1])) mark(cells, 1);
      obstacles.push({ type: o.type, gx, gy, cells });
    }
    return obstacles;
  }
  if (!defs.length) return obstacles;
  const integer = (min: number, max: number) => Math.floor(min + random() * (max - min + 1));
  const count = integer(width * height / 200, width * height / 50);
  for (let n = 0; n < count; n++) {
    const type = RANDOM_OBSTACLE_TYPES[Math.floor(typeRandom() * RANDOM_OBSTACLE_TYPES.length)];
    if (!defs[type - 1]) continue;
    const originX = integer(0, width - 1), originY = integer(0, height - 1);
    let gx = originX, gy = originY, radius = 1, side = 1, offset = -1;
    for (;;) {
      const cells = cellsAt(type, gx, gy);
      const fits = cells.every(([x, y]) => {
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
          if (!inside(x + dx, y + dy) || map[(y + dy) * width + x + dx] === 1) return false;
        return true;
      });
      if (fits) {
        mark(cells, 1);
        obstacles.push({ type, gx, gy, cells });
        break;
      }
      // Scan the original expanding square perimeter without re-rolling type or anchor.
      if (++offset >= radius * 2) {
        offset = 0;
        if (++side > 4) {
          side = 1;
          if (++radius >= width) break;
        }
      }
      switch (side) {
        case 1: gx = originX - radius + offset; gy = originY - radius; break;
        case 2: gx = originX + radius; gy = originY - radius + offset; break;
        case 3: gx = originX + radius - offset; gy = originY + radius; break;
        case 4: gx = originX - radius; gy = originY + radius - offset; break;
      }
    }
  }
  // Decorations reserve space during generation only, and never block deployed units or paths.
  for (const o of obstacles) if (!blocksMovement(defs[o.type - 1])) mark(o.cells, 0);
  return obstacles;
}
