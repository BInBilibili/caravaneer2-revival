// 阵营关系：三角矩阵（行 i 恰 i 个元素，row0 空）。原版 GameData.as:801 开局 factionRelations = Presets.FactionRelations
// （引用赋值、原地修改）。web 长驻页面必须深拷贝，防跨局污染 presets 共享对象（否则下一局带着上一局的关系）。
// 原版 get/set/affectFactionRelations 成对语义（GameData.as:1507-1593）：a>b ? m[a][b] : m[b][a]；a==b 恒 0。

/** 从 presets.faction_relations[0] 深拷贝出三角矩阵（新游戏基准 / 迁移补齐）。缺失/非数组返回空矩阵。 */
export function factionRelationsFromPresets(ds: any): number[][] {
  const m = ds?.presets?.faction_relations?.[0];
  if (!Array.isArray(m)) return [];
  return m.map((r: any) => (Array.isArray(r) ? r.slice() : []));
}

/** 老档扁平 Record<number,number>（faction→value，即 (faction, 玩家0) 的成对关系）→ 三角矩阵：
 *  row[faction][0] = value，其余格深拷贝 presets 补齐。跳过数组/非数字值/非正整数键（防 .sol 矩阵被误当扁平表）。 */
export function migrateFlatFactionRelations(flat: Record<string, unknown>, ds: any): number[][] {
  const matrix = factionRelationsFromPresets(ds);
  if (!flat || typeof flat !== "object" || Array.isArray(flat)) return matrix;
  for (const k of Object.keys(flat)) {
    if (!/^\d+$/.test(k)) continue;
    const v = (flat as any)[k];
    if (typeof v !== "number" || !isFinite(v)) continue;
    const fid = Number(k);
    if (fid <= 0) continue;
    if (!matrix[fid]) matrix[fid] = [];
    matrix[fid][0] = v;
  }
  return matrix;
}
