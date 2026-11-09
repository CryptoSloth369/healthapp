/** Pure helpers for food logging. No I/O. */

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

export function isMeal(v: unknown): v is Meal {
  return typeof v === "string" && (MEALS as readonly string[]).includes(v);
}

/** Sensible default meal for a local hour of the day. */
export function mealForHour(hour: number): Meal {
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 22) return "dinner";
  return "snack";
}

export type Nutrients = { kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null };

export type Totals = { kcal: number; protein: number; carbs: number; fat: number };

export function sumNutrients(rows: Nutrients[]): Totals {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const r of rows) {
    t.kcal += Number(r.kcal) || 0;
    t.protein += Number(r.protein_g) || 0;
    t.carbs += Number(r.carbs_g) || 0;
    t.fat += Number(r.fat_g) || 0;
  }
  return {
    kcal: Math.round(t.kcal),
    protein: Math.round(t.protein),
    carbs: Math.round(t.carbs),
    fat: Math.round(t.fat),
  };
}

/** Per-serving values × servings, rounded the way they're stored. */
export function scaleNutrients(perServing: Nutrients, servings: number): Nutrients {
  const r1 = (v: number | null) => (v == null ? null : Math.round(v * servings * 10) / 10);
  return {
    kcal: Math.round(perServing.kcal * servings),
    protein_g: r1(perServing.protein_g),
    carbs_g: r1(perServing.carbs_g),
    fat_g: r1(perServing.fat_g),
  };
}

/** Undo `scaleNutrients` for editing: stored totals → per-serving values. */
export function perServing(total: Nutrients, servings: number): Nutrients {
  const s = servings > 0 ? servings : 1;
  const r1 = (v: number | null) => (v == null ? null : Math.round((Number(v) / s) * 10) / 10);
  return {
    kcal: Math.round(Number(total.kcal) / s),
    protein_g: r1(total.protein_g),
    carbs_g: r1(total.carbs_g),
    fat_g: r1(total.fat_g),
  };
}

/** Calories implied by macros (4/4/9), for a "doesn't add up" hint. */
export function kcalFromMacros(p: number, c: number, f: number): number {
  return Math.round(p * 4 + c * 4 + f * 9);
}

/** "1.5 × 1 cup" / "2 servings" / "" */
export function servingText(servings: number, serving: string | null): string {
  const n = Number(servings);
  const qty = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  if (serving) return n === 1 ? serving : `${qty} × ${serving}`;
  return n === 1 ? "" : `${qty} servings`;
}
