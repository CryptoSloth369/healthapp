"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isDay } from "@/lib/dates";
import { ACTIVITIES, estimateKcal, isActivity, liftKey } from "@/lib/exercise";

export type WorkoutInput = {
  id: number | null;
  day: string;
  activity: string;
  durationMin: number | null;
  distanceMi: number | null;
  kcal: number | null; // null = estimate it
  note: string;
  templateId: number | null;
  sets: { exercise: string; weight_lb: number | null; reps: number }[];
};

function validNum(v: number | null, min: number, max: number) {
  return v == null || (Number.isFinite(v) && v >= min && v <= max);
}

export async function saveWorkout(input: WorkoutInput): Promise<{ error: string } | void> {
  if (!(await getUserId())) return { error: "You are signed out." };
  if (!isDay(input.day)) return { error: "Pick a date." };
  if (!isActivity(input.activity)) return { error: "Pick an activity." };
  if (!validNum(input.durationMin, 0, 1440)) return { error: "Time must be 0–1440 minutes." };
  if (!validNum(input.distanceMi, 0, 200)) return { error: "Distance must be 0–200 miles." };
  if (!validNum(input.kcal, 0, 10000)) return { error: "Calories burned must be 0–10,000." };

  const act = ACTIVITIES[input.activity];
  const sets = act.sets
    ? input.sets
        .map((s) => ({ ...s, exercise: s.exercise.trim().slice(0, 60) }))
        .filter((s) => s.exercise && Number.isInteger(s.reps) && s.reps > 0)
    : [];
  for (const s of sets) {
    if (s.reps > 1000) return { error: `Check the reps for ${s.exercise}.` };
    if (!validNum(s.weight_lb, 0, 2000)) return { error: `Check the weight for ${s.exercise}.` };
  }
  if (act.sets && input.sets.length > 0 && sets.length === 0) return { error: "Each set needs an exercise and reps." };

  const supabase = await createClient();

  // Estimate calories from MET × body weight × time when none was entered.
  let kcal = input.kcal == null ? null : Math.round(input.kcal);
  let estimated = false;
  if (kcal == null) {
    const { data: w } = await supabase
      .from("weight_entry")
      .select("weight_lb")
      .lte("measured_on", input.day)
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle<{ weight_lb: number }>();
    kcal = estimateKcal({
      activity: input.activity,
      durationMin: input.durationMin,
      distanceMi: act.distance ? input.distanceMi : null,
      weightLb: w ? Number(w.weight_lb) : null,
    });
    estimated = kcal != null;
  }

  const row = {
    performed_on: input.day,
    activity: input.activity,
    duration_min: input.durationMin == null ? null : Math.round(input.durationMin),
    distance_mi: act.distance ? input.distanceMi : null,
    kcal_burned: kcal,
    kcal_estimated: estimated,
    template_id: input.templateId,
    note: input.note.trim().slice(0, 1000) || null,
  };

  let entryId = input.id;
  if (entryId) {
    const { error } = await supabase.from("exercise_entry").update(row).eq("id", entryId);
    if (error) return { error: error.message };
    const { error: delErr } = await supabase.from("exercise_set").delete().eq("entry_id", entryId);
    if (delErr) return { error: delErr.message };
  } else {
    const { data, error } = await supabase.from("exercise_entry").insert(row).select("id").single<{ id: number }>();
    if (error) return { error: error.message };
    entryId = data.id;
  }

  if (sets.length) {
    const { error } = await supabase
      .from("exercise_set")
      .insert(sets.map((s, i) => ({ entry_id: entryId, position: i, exercise: s.exercise, weight_lb: s.weight_lb, reps: s.reps })));
    if (error) return { error: `Workout saved, but the sets failed: ${error.message}` };
  }

  revalidatePath("/", "layout");
  redirect(`/exercise?saved=${entryId}`);
}

export async function deleteWorkout(id: number) {
  if (!(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from("exercise_entry").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/exercise");
}

export type TemplateInput = {
  id: number | null;
  name: string;
  activity: string;
  durationMin: number | null;
  distanceMi: number | null;
  note: string;
  exercises: { exercise: string; sets: number; reps: number | null; weight_lb: number | null }[];
};

export async function saveTemplate(input: TemplateInput): Promise<{ error: string } | void> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: "Give the template a name." };
  if (!isActivity(input.activity)) return { error: "Pick an activity." };
  if (!validNum(input.durationMin, 0, 1440) || !validNum(input.distanceMi, 0, 200)) return { error: "Check time and distance." };
  const act = ACTIVITIES[input.activity];
  const exercises = act.sets
    ? input.exercises
        .map((e) => ({ ...e, exercise: e.exercise.trim().slice(0, 60) }))
        .filter((e) => e.exercise)
    : [];
  for (const e of exercises) {
    if (!Number.isInteger(e.sets) || e.sets < 1 || e.sets > 50) return { error: `Sets for ${e.exercise} must be 1–50.` };
    if (e.reps != null && (!Number.isInteger(e.reps) || e.reps < 1 || e.reps > 1000)) return { error: `Check reps for ${e.exercise}.` };
    if (!validNum(e.weight_lb, 0, 2000)) return { error: `Check weight for ${e.exercise}.` };
  }

  const supabase = await createClient();
  const row = {
    name,
    activity: input.activity,
    duration_min: input.durationMin == null ? null : Math.round(input.durationMin),
    distance_mi: act.distance ? input.distanceMi : null,
    note: input.note.trim().slice(0, 1000) || null,
  };
  let id = input.id;
  if (id) {
    const { error } = await supabase.from("workout_template").update(row).eq("id", id);
    if (error) return { error: error.message };
    await supabase.from("template_exercise").delete().eq("template_id", id);
  } else {
    const { data, error } = await supabase.from("workout_template").insert(row).select("id").single<{ id: number }>();
    if (error) return { error: error.message };
    id = data.id;
  }
  if (exercises.length) {
    const { error } = await supabase
      .from("template_exercise")
      .insert(exercises.map((e, i) => ({ template_id: id, position: i, ...e })));
    if (error) return { error: error.message };
  }
  revalidatePath("/exercise", "layout");
  redirect("/exercise/templates");
}

export async function deleteTemplate(id: number) {
  if (!(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from("workout_template").delete().eq("id", id);
  revalidatePath("/exercise", "layout");
  redirect("/exercise/templates");
}

/** Turn a logged workout into a template (one row per exercise, using its last set). */
export async function templateFromWorkout(entryId: number, name: string): Promise<{ error: string } | void> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("exercise_entry")
    .select("activity, duration_min, distance_mi, sets:exercise_set(position, exercise, weight_lb, reps)")
    .eq("id", entryId)
    .maybeSingle<{ activity: string; duration_min: number | null; distance_mi: number | null; sets: { position: number; exercise: string; weight_lb: number | null; reps: number }[] }>();
  if (!e) return { error: "Workout not found." };

  const grouped = new Map<string, { exercise: string; sets: number; reps: number | null; weight_lb: number | null }>();
  for (const s of [...e.sets].sort((a, b) => a.position - b.position)) {
    const k = liftKey(s.exercise);
    const g = grouped.get(k);
    if (g) {
      g.sets++;
      g.reps = s.reps;
      g.weight_lb = s.weight_lb == null ? null : Number(s.weight_lb);
    } else grouped.set(k, { exercise: s.exercise, sets: 1, reps: s.reps, weight_lb: s.weight_lb == null ? null : Number(s.weight_lb) });
  }
  return saveTemplate({
    id: null,
    name,
    activity: e.activity,
    durationMin: e.duration_min,
    distanceMi: e.distance_mi == null ? null : Number(e.distance_mi),
    note: "",
    exercises: [...grouped.values()],
  });
}
