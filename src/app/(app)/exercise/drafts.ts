import { ACTIVITIES, isActivity, liftKey } from "@/lib/exercise";
import { formatDay } from "@/lib/dates";
import type { ExerciseSession, WorkoutTemplate } from "@/lib/types";
import type { WorkoutDraft } from "./workout-form";

const str = (v: number | null | undefined) => (v == null ? "" : String(v));

export function blankDraft(day: string, activity = "weightlifting"): WorkoutDraft {
  const a = isActivity(activity) ? activity : "weightlifting";
  return {
    id: null,
    day,
    activity: a,
    duration: "",
    distance: "",
    kcal: "",
    note: "",
    templateId: null,
    blocks: ACTIVITIES[a].sets ? [{ exercise: "", sets: [{ weight: "", reps: "" }] }] : [],
  };
}

export function draftFromTemplate(t: WorkoutTemplate, day: string): WorkoutDraft {
  const a = isActivity(t.activity) ? t.activity : "other";
  return {
    id: null,
    day,
    activity: a,
    duration: str(t.duration_min),
    distance: str(t.distance_mi),
    kcal: "",
    note: "",
    templateId: t.id,
    blocks: t.exercises.map((e) => ({
      exercise: e.exercise,
      sets: Array.from({ length: e.sets }, () => ({ weight: str(e.weight_lb), reps: str(e.reps) })),
    })),
  };
}

export function draftFromSession(s: ExerciseSession): WorkoutDraft {
  const a = isActivity(s.activity) ? s.activity : "other";
  const blocks: WorkoutDraft["blocks"] = [];
  const byKey = new Map<string, WorkoutDraft["blocks"][number]>();
  for (const set of s.sets) {
    const key = liftKey(set.exercise);
    const entry = { weight: str(set.weight_lb), reps: str(set.reps) };
    const block = byKey.get(key);
    if (block) block.sets.push(entry);
    else {
      const b = { exercise: set.exercise, sets: [entry] };
      byKey.set(key, b);
      blocks.push(b);
    }
  }
  return {
    id: s.id,
    day: s.performed_on,
    activity: a,
    duration: str(s.duration_min),
    distance: str(s.distance_mi),
    kcal: s.kcal_estimated ? "" : str(s.kcal_burned),
    note: s.note ?? "",
    templateId: s.template_id,
    blocks,
  };
}

/** "185×8, 185×8, 195×5 · Nov 3" for each lift's most recent session (excluding one entry). */
export function lastTimeByLift(sessions: ExerciseSession[], excludeId: number | null = null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sessions) {
    // sessions are newest first, so the first match per lift wins
    if (s.id === excludeId) continue;
    const byLift = new Map<string, string[]>();
    for (const set of s.sets) {
      const key = liftKey(set.exercise);
      if (key in out) continue;
      const list = byLift.get(key) ?? [];
      list.push(`${set.weight_lb ?? "BW"}×${set.reps}`);
      byLift.set(key, list);
    }
    for (const [key, list] of byLift) out[key] = `${list.join(", ")} · ${formatDay(s.performed_on, { month: "short", day: "numeric" })}`;
  }
  return out;
}

/** "Bench press 3×8 @ 185" style lines for a session card. */
export function setSummary(s: ExerciseSession): { exercise: string; text: string }[] {
  const out: { exercise: string; sets: { w: number | null; r: number }[] }[] = [];
  const byKey = new Map<string, (typeof out)[number]>();
  for (const set of s.sets) {
    const key = liftKey(set.exercise);
    const b = byKey.get(key);
    if (b) b.sets.push({ w: set.weight_lb, r: set.reps });
    else {
      const nb = { exercise: set.exercise, sets: [{ w: set.weight_lb, r: set.reps }] };
      byKey.set(key, nb);
      out.push(nb);
    }
  }
  return out.map((b) => {
    const same = b.sets.every((x) => x.w === b.sets[0].w && x.r === b.sets[0].r);
    const fmt = (x: { w: number | null; r: number }) => (x.w == null ? `${x.r}` : `${x.w}×${x.r}`);
    return {
      exercise: b.exercise,
      text: same
        ? `${b.sets.length}×${b.sets[0].r}${b.sets[0].w == null ? " (BW)" : ` @ ${b.sets[0].w} lb`}`
        : b.sets.map(fmt).join(", "),
    };
  });
}
