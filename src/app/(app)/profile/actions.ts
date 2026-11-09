"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isDay } from "@/lib/dates";
import { ACTIVITY_LEVELS, type ActivityLevel } from "@/lib/tdee";

export type ProfileFormState = { error?: string; saved?: boolean };

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export async function saveProfile(
  _prev: ProfileFormState,
  form: FormData,
): Promise<ProfileFormState> {
  const userId = await getUserId();
  if (!userId) return { error: "You are signed out." };

  const sex = form.get("sex");
  const activity = form.get("activity_level");
  const birthDate = String(form.get("birth_date") ?? "");
  const goalDate = String(form.get("goal_date") ?? "");
  const today = String(form.get("today") ?? "");
  const ft = num(form.get("height_ft"));
  const inch = num(form.get("height_in"));
  const weight = num(form.get("weight_lb"));
  const goalWeight = num(form.get("goal_weight_lb"));
  const override = num(form.get("kcal_target_override"));

  if (sex !== "male" && sex !== "female") return { error: "Choose a sex for the BMR formula." };
  if (typeof activity !== "string" || !(activity in ACTIVITY_LEVELS))
    return { error: "Choose an activity level." };
  if (!isDay(birthDate)) return { error: "Enter your birth date." };
  if (ft == null || Number.isNaN(ft) || Number.isNaN(inch)) return { error: "Enter your height." };
  const heightIn = ft * 12 + (inch ?? 0);
  if (heightIn < 36 || heightIn > 96) return { error: "Height looks off; check feet and inches." };
  if (weight != null && (Number.isNaN(weight) || weight < 50 || weight > 700))
    return { error: "Current weight must be between 50 and 700 lb." };
  if (goalWeight != null && (Number.isNaN(goalWeight) || goalWeight < 50 || goalWeight > 700))
    return { error: "Goal weight must be between 50 and 700 lb." };
  if (goalDate && !isDay(goalDate)) return { error: "Goal date is invalid." };
  if (override != null && (Number.isNaN(override) || override < 800 || override > 8000))
    return { error: "Calorie override must be between 800 and 8000." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profile")
    .update({
      display_name: String(form.get("display_name") ?? "").trim() || null,
      sex,
      birth_date: birthDate,
      height_in: heightIn,
      activity_level: activity as ActivityLevel,
      goal_weight_lb: goalWeight,
      goal_date: goalDate || null,
      kcal_target_override: override == null ? null : Math.round(override),
    })
    .eq("user_id", userId);
  if (error) return { error: error.message };

  // Current weight is stored as today's weigh-in.
  if (weight != null) {
    if (!isDay(today)) return { error: "Could not determine today's date." };
    const { error: wErr } = await supabase
      .from("weight_entry")
      .upsert({ measured_on: today, weight_lb: weight }, { onConflict: "user_id,measured_on" });
    if (wErr) return { error: wErr.message };
  }

  revalidatePath("/", "layout");
  return { saved: true };
}
