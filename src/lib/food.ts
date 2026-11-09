import "server-only";
import { createClient } from "@/lib/supabase/server";
import { perServing } from "@/lib/nutrition";
import type { FoodEntry, SavedFood } from "@/lib/types";

const ENTRY_COLS = "id, eaten_on, meal, name, servings, serving, kcal, protein_g, carbs_g, fat_g, source, saved_food_id, note";

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}
function normalize(e: FoodEntry): FoodEntry {
  return {
    ...e,
    servings: Number(e.servings),
    kcal: Number(e.kcal),
    protein_g: num(e.protein_g),
    carbs_g: num(e.carbs_g),
    fat_g: num(e.fat_g),
  };
}

export async function getDayEntries(day: string): Promise<FoodEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("food_entry")
    .select(ENTRY_COLS)
    .eq("eaten_on", day)
    .order("eaten_at", { ascending: true })
    .overrideTypes<FoodEntry[], { merge: false }>();
  return (data ?? []).map(normalize);
}

export async function getEntry(id: number): Promise<FoodEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("food_entry")
    .select(ENTRY_COLS)
    .eq("id", id)
    .maybeSingle<FoodEntry>();
  return data ? normalize(data) : null;
}

/** A food you can tap to log again. Values are per serving. */
export type QuickPick = {
  key: string;
  savedFoodId: number | null;
  name: string;
  serving: string | null;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  saved: boolean;
};

/**
 * Saved foods (most used first) followed by recently logged foods that
 * aren't saved, de-duplicated by name.
 */
export async function getQuickPicks(): Promise<QuickPick[]> {
  const supabase = await createClient();
  const [{ data: saved }, { data: recent }] = await Promise.all([
    supabase
      .from("saved_food")
      .select("id, name, serving, kcal, protein_g, carbs_g, fat_g, use_count, last_used_at")
      .order("use_count", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(200)
      .overrideTypes<SavedFood[], { merge: false }>(),
    supabase
      .from("food_entry")
      .select(ENTRY_COLS)
      .order("eaten_at", { ascending: false })
      .limit(150)
      .overrideTypes<FoodEntry[], { merge: false }>(),
  ]);

  const picks: QuickPick[] = [];
  const seen = new Set<string>();
  for (const f of saved ?? []) {
    seen.add(f.name.toLowerCase());
    picks.push({
      key: `s${f.id}`,
      savedFoodId: f.id,
      name: f.name,
      serving: f.serving,
      kcal: Number(f.kcal),
      protein_g: num(f.protein_g),
      carbs_g: num(f.carbs_g),
      fat_g: num(f.fat_g),
      saved: true,
    });
  }
  for (const raw of recent ?? []) {
    const e = normalize(raw);
    const k = e.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    picks.push({ key: `r${e.id}`, savedFoodId: null, name: e.name, serving: e.serving, ...perServing(e, e.servings), saved: false });
  }
  return picks;
}

/** Nutrient rows for a date range (inclusive), for dashboard aggregation. */
export async function getEntriesBetween(start: string, end: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("food_entry")
    .select("eaten_on, kcal, protein_g, carbs_g, fat_g")
    .gte("eaten_on", start)
    .lte("eaten_on", end)
    .limit(10000)
    .overrideTypes<{ eaten_on: string; kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null }[], { merge: false }>();
  return (data ?? []).map((e) => ({
    eaten_on: e.eaten_on,
    kcal: Number(e.kcal),
    protein_g: num(e.protein_g),
    carbs_g: num(e.carbs_g),
    fat_g: num(e.fat_g),
  }));
}
