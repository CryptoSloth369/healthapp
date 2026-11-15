"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUserId } from "@/lib/supabase/server";
import { recalculateEnergy } from "@/lib/energy-data";

/** Set (or clear, with null) the manual daily calorie target. */
export async function setCalorieOverride(kcal: number | null): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "You are signed out." };
  if (kcal != null && (!Number.isFinite(kcal) || kcal < 800 || kcal > 8000)) return { error: "Target out of range." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profile")
    .update({ kcal_target_override: kcal == null ? null : Math.round(kcal / 10) * 10 })
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

/** "Recalculate" button: rerun the energy model over all history now. */
export async function recalculateEnergyAction(): Promise<{ error?: string }> {
  if (!(await getUserId())) return { error: "You are signed out." };
  try {
    await recalculateEnergy("manual");
  } catch (err) {
    return { error: (err as Error).message };
  }
  revalidatePath("/dashboard");
  return {};
}
