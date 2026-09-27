// Workshop 工作房配方（原版 GameData.as workshopRecipes 静态数组 L131-~360，6 条）
// outcome/requiredMaterials.type = 物品 id；perDay = 每日产能上限；requiredSkills.skill ∈ doctor|veterinary|mechanic|hunting|collecting|smuggling
export interface WorkshopRecipe {
  outcome: number;
  outcomeAmount: number;
  requiredMaterials: Array<{ type: number; amount: number }>;
  requiredTools: number[];
  requiredSkills: Array<{ skill: string; min: number }>;
  perDay: number;
}

export const WORKSHOP_RECIPES: WorkshopRecipe[] = [
  {
    outcome: 61, outcomeAmount: 1,
    requiredMaterials: [{ type: 65, amount: 1 }, { type: 64, amount: 0.8 }, { type: 79, amount: 0.1 }, { type: 94, amount: 0.1 }],
    requiredTools: [],
    requiredSkills: [{ skill: "mechanic", min: 30 }],
    perDay: 15,
  },
  {
    outcome: 103, outcomeAmount: 1,
    requiredMaterials: [{ type: 94, amount: 0.5 }, { type: 63, amount: 20 }, { type: 93, amount: 0.1 }, { type: 104, amount: 0.3 }],
    requiredTools: [],
    requiredSkills: [{ skill: "doctor", min: 100 }],
    perDay: 5,
  },
  {
    outcome: 109, outcomeAmount: 1,
    requiredMaterials: [{ type: 94, amount: 2 }],
    requiredTools: [],
    requiredSkills: [{ skill: "mechanic", min: 90 }],
    perDay: 5,
  },
  {
    outcome: 94, outcomeAmount: 2,
    requiredMaterials: [{ type: 109, amount: 1 }],
    requiredTools: [],
    requiredSkills: [],
    perDay: 50,
  },
  {
    outcome: 94, outcomeAmount: 2,
    requiredMaterials: [{ type: 110, amount: 1 }, { type: 185, amount: 0.03 }, { type: 1, amount: 4 }],
    requiredTools: [],
    requiredSkills: [{ skill: "mechanic", min: 30 }],
    perDay: 5,
  },
  {
    outcome: 94, outcomeAmount: 2,
    requiredMaterials: [{ type: 111, amount: 1 }, { type: 185, amount: 0.05 }, { type: 1, amount: 4 }],
    requiredTools: [],
    requiredSkills: [{ skill: "mechanic", min: 35 }],
    perDay: 2,
  },
];

/** Original GameData.workshopRecipes index overrides supplied by enabled data DLCs. */
export function workshopRecipes(ds: { gamedata: Record<string, any> }): WorkshopRecipe[] {
  const recipes = [...WORKSHOP_RECIPES];
  for (const [index, recipe] of Object.entries(ds.gamedata.workshopRecipes ?? {})) {
    if (/^\d+$/.test(index) && recipe) recipes[Number(index)] = recipe as WorkshopRecipe;
  }
  return recipes;
}
