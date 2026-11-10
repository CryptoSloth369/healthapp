import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ExerciseSession, ExerciseSet, TemplateExercise, WorkoutTemplate } from "@/lib/types";

const SESSION_COLS =
  "id, performed_on, performed_at, activity, duration_min, distance_mi, kcal_burned, kcal_estimated, template_id, note, sets:exercise_set(id, position, exercise, weight_lb, reps)";
const TEMPLATE_COLS =
  "id, name, activity, duration_min, distance_mi, note, exercises:template_exercise(id, position, exercise, sets, reps, weight_lb)";

const n = (v: unknown) => (v == null ? null : Number(v));

function normSession(s: ExerciseSession): ExerciseSession {
  return {
    ...s,
    distance_mi: n(s.distance_mi),
    kcal_burned: n(s.kcal_burned),
    sets: (s.sets ?? [])
      .map((x: ExerciseSet) => ({ ...x, weight_lb: n(x.weight_lb), reps: Number(x.reps) }))
      .sort((a, b) => a.position - b.position || (a.id ?? 0) - (b.id ?? 0)),
  };
}

function normTemplate(t: WorkoutTemplate): WorkoutTemplate {
  return {
    ...t,
    distance_mi: n(t.distance_mi),
    exercises: (t.exercises ?? [])
      .map((x: TemplateExercise) => ({ ...x, weight_lb: n(x.weight_lb) }))
      .sort((a, b) => a.position - b.position),
  };
}

/** Sessions between two days (inclusive), newest first, with their sets. */
export async function getSessions(start: string, end: string): Promise<ExerciseSession[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("exercise_entry")
    .select(SESSION_COLS)
    .gte("performed_on", start)
    .lte("performed_on", end)
    .order("performed_on", { ascending: false })
    .order("performed_at", { ascending: false })
    .limit(1000)
    .overrideTypes<ExerciseSession[], { merge: false }>();
  return (data ?? []).map(normSession);
}

export async function getSession(id: number): Promise<ExerciseSession | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("exercise_entry").select(SESSION_COLS).eq("id", id).maybeSingle<ExerciseSession>();
  return data ? normSession(data) : null;
}

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workout_template")
    .select(TEMPLATE_COLS)
    .order("name")
    .overrideTypes<WorkoutTemplate[], { merge: false }>();
  return (data ?? []).map(normTemplate);
}

export async function getTemplate(id: number): Promise<WorkoutTemplate | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("workout_template").select(TEMPLATE_COLS).eq("id", id).maybeSingle<WorkoutTemplate>();
  return data ? normTemplate(data) : null;
}

/** Exercise names you've used before (sets and templates), most used first. */
export async function getExerciseNames(): Promise<string[]> {
  const supabase = await createClient();
  const [{ data: sets }, { data: tpl }] = await Promise.all([
    supabase.from("exercise_set").select("exercise").order("created_at", { ascending: false }).limit(1000).overrideTypes<{ exercise: string }[], { merge: false }>(),
    supabase.from("template_exercise").select("exercise").overrideTypes<{ exercise: string }[], { merge: false }>(),
  ]);
  const counts = new Map<string, { name: string; c: number }>();
  for (const r of [...(sets ?? []), ...(tpl ?? [])]) {
    const k = r.exercise.trim().toLowerCase();
    const cur = counts.get(k);
    if (cur) cur.c++;
    else counts.set(k, { name: r.exercise.trim(), c: 1 });
  }
  return [...counts.values()].sort((a, b) => b.c - a.c).map((x) => x.name);
}

/** Calories burned per day between two days (inclusive). */
export async function getBurnedByDay(start: string, end: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("exercise_entry")
    .select("performed_on, kcal_burned")
    .gte("performed_on", start)
    .lte("performed_on", end)
    .overrideTypes<{ performed_on: string; kcal_burned: number | null }[], { merge: false }>();
  const m = new Map<string, number>();
  for (const r of data ?? []) m.set(r.performed_on, (m.get(r.performed_on) ?? 0) + (Number(r.kcal_burned) || 0));
  return m;
}
