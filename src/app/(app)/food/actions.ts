"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isDay } from "@/lib/dates";
import { isMeal, scaleNutrients } from "@/lib/nutrition";

export type EntryFormState = { error?: string };

function optNum(form: FormData, key: string): number | null | "bad" {
  const s = String(form.get(key) ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 10000 ? n : "bad";
}

/**
 * Create or update a food entry. Form values are PER SERVING; the entry stores
 * totals (× servings). Optionally saves the food to "My foods".
 */
export async function saveFoodEntry(_prev: EntryFormState, form: FormData): Promise<EntryFormState> {
  if (!(await getUserId())) return { error: "You are signed out." };

  const id = Number(form.get("id")) || null;
  const day = String(form.get("eaten_on") ?? "");
  const meal = form.get("meal");
  const name = String(form.get("name") ?? "").trim() || "Quick add";
  const serving = String(form.get("serving") ?? "").trim() || null;
  const note = String(form.get("note") ?? "").trim() || null;
  const servings = Number(String(form.get("servings") ?? "1").trim() || "1");
  const kcal = optNum(form, "kcal");
  const protein = optNum(form, "protein_g");
  const carbs = optNum(form, "carbs_g");
  const fat = optNum(form, "fat_g");
  let savedFoodId = Number(form.get("saved_food_id")) || null;
  const saveToFoods = form.get("save_to_foods") === "on";

  if (!isDay(day)) return { error: "Missing date." };
  if (!isMeal(meal)) return { error: "Pick a meal." };
  if (name.length > 120) return { error: "Name is too long." };
  if (!Number.isFinite(servings) || servings <= 0 || servings > 100) return { error: "Servings must be more than 0." };
  if (kcal == null || kcal === "bad") return { error: "Enter calories (per serving)." };
  if (protein === "bad" || carbs === "bad" || fat === "bad") return { error: "Macros must be numbers." };

  const supabase = await createClient();

  if (saveToFoods && !savedFoodId) {
    const { data, error } = await supabase
      .from("saved_food")
      .insert({ name, serving, kcal: Math.round(kcal), protein_g: protein, carbs_g: carbs, fat_g: fat })
      .select("id")
      .single<{ id: number }>();
    if (error) return { error: error.message };
    savedFoodId = data.id;
  }

  const totals = scaleNutrients({ kcal, protein_g: protein, carbs_g: carbs, fat_g: fat }, servings);
  const row = {
    eaten_on: day,
    meal,
    name,
    serving,
    servings,
    ...totals,
    note,
    saved_food_id: savedFoodId,
    source: savedFoodId ? ("saved" as const) : ("manual" as const),
  };

  const { error } = id
    ? await supabase.from("food_entry").update(row).eq("id", id)
    : await supabase.from("food_entry").insert(row);
  if (error) return { error: error.message };

  // Keep "most used" ordering fresh for quick picks.
  if (savedFoodId && !id) {
    const { data: f } = await supabase.from("saved_food").select("use_count").eq("id", savedFoodId).maybeSingle<{ use_count: number }>();
    if (f) {
      await supabase
        .from("saved_food")
        .update({ use_count: f.use_count + 1, last_used_at: new Date().toISOString() })
        .eq("id", savedFoodId);
    }
  }

  revalidatePath("/", "layout");
  redirect(`/food?day=${day}`);
}

export async function deleteFoodEntry(id: number, day: string) {
  if (!(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from("food_entry").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect(`/food?day=${isDay(day) ? day : ""}`);
}

export async function deleteSavedFood(id: number): Promise<{ error?: string }> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const supabase = await createClient();
  // Past entries keep their values; only the link to the saved food is cleared.
  const { error } = await supabase.from("saved_food").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/food/add");
  return {};
}
