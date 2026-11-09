"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isDay } from "@/lib/dates";

export type WeightFormState = { error?: string; savedAt?: number };

export async function saveWeight(_prev: WeightFormState, form: FormData): Promise<WeightFormState> {
  if (!(await getUserId())) return { error: "You are signed out." };

  const day = String(form.get("measured_on") ?? "");
  const weight = Number(String(form.get("weight_lb") ?? "").trim());
  const note = String(form.get("note") ?? "").trim() || null;

  if (!isDay(day)) return { error: "Pick a date." };
  if (!Number.isFinite(weight) || weight < 50 || weight > 700)
    return { error: "Weight must be between 50 and 700 lb." };

  const supabase = await createClient();
  // One weigh-in per day: saving the same date again replaces it.
  const { error } = await supabase
    .from("weight_entry")
    .upsert(
      { measured_on: day, weight_lb: Math.round(weight * 10) / 10, note },
      { onConflict: "user_id,measured_on" },
    );
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}

export async function deleteWeight(id: number): Promise<{ error?: string }> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const supabase = await createClient();
  const { error } = await supabase.from("weight_entry").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}
