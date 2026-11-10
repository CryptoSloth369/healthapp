"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { ACTIVITIES, isActivity } from "@/lib/exercise";

/** Apply a calorie target the coach proposed (the user tapped Apply). */
export async function applyCalorieTarget(kcal: number): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "You are signed out." };
  if (!Number.isFinite(kcal) || kcal < 1200 || kcal > 6000) return { error: "Target out of range." };
  const supabase = await createClient();
  const { error } = await supabase.from("profile").update({ kcal_target_override: Math.round(kcal / 10) * 10 }).eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

type ProposedTemplate = {
  name: string;
  activity: string;
  duration_min?: number;
  exercises: { exercise: string; sets: number; reps?: number; weight_lb?: number }[];
};

/** Save a workout template the coach proposed (the user tapped Save). */
export async function saveProposedTemplate(t: ProposedTemplate): Promise<{ error?: string }> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const name = String(t.name ?? "").trim().slice(0, 80);
  if (!name || !isActivity(t.activity)) return { error: "Invalid template." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_template")
    .insert({ name, activity: t.activity, duration_min: t.duration_min ?? null })
    .select("id")
    .single<{ id: number }>();
  if (error) return { error: error.message };
  const exercises = ACTIVITIES[t.activity].sets ? (t.exercises ?? []).slice(0, 20) : [];
  if (exercises.length) {
    const { error: e2 } = await supabase.from("template_exercise").insert(
      exercises.map((e, i) => ({
        template_id: data.id,
        position: i,
        exercise: String(e.exercise).slice(0, 60),
        sets: Math.min(20, Math.max(1, Math.round(e.sets))),
        reps: e.reps == null ? null : Math.round(e.reps),
        weight_lb: e.weight_lb ?? null,
      })),
    );
    if (e2) return { error: e2.message };
  }
  revalidatePath("/exercise", "layout");
  return {};
}

export async function deleteConversation(id: number) {
  if (!(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from("assistant_conversation").delete().eq("id", id);
  revalidatePath("/coach");
  redirect("/coach");
}
