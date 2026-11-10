/** Exercise helpers: activity catalog, calorie estimates, lifting math. Pure. */

export const ACTIVITIES = {
  weightlifting: { label: "Weightlifting", met: 5.0, distance: false, sets: true },
  swimming: { label: "Swimming", met: 7.0, distance: false, sets: false },
  walking: { label: "Walking", met: 3.5, distance: true, sets: false },
  running: { label: "Running", met: 9.8, distance: true, sets: false },
  jiu_jitsu: { label: "Jiu-jitsu", met: 8.0, distance: false, sets: false },
  other: { label: "Other", met: 5.0, distance: false, sets: false },
} as const;
export type Activity = keyof typeof ACTIVITIES;

export function isActivity(v: unknown): v is Activity {
  return typeof v === "string" && v in ACTIVITIES;
}

export function activityLabel(v: string): string {
  return isActivity(v) ? ACTIVITIES[v].label : v;
}

export const COMMON_LIFTS = [
  "Bench press",
  "Squat",
  "Deadlift",
  "Overhead press",
  "Barbell row",
  "Incline bench press",
  "Romanian deadlift",
  "Pull-up",
  "Lat pulldown",
  "Leg press",
  "Dumbbell curl",
  "Tricep pushdown",
  "Hip thrust",
  "Lunge",
];

const LB_PER_KG = 2.20462;
const M_PER_MI = 1609.34;

/**
 * MET for the session. Walking and running use the ACSM equations when a
 * distance gives a speed (flat ground); otherwise a typical value.
 */
export function metFor(activity: Activity, durationMin: number, distanceMi: number | null): number {
  if (distanceMi && durationMin > 0 && (activity === "walking" || activity === "running")) {
    const mPerMin = (distanceMi * M_PER_MI) / durationMin;
    // Above ~4.5 mph a "walk" is effectively a run; below ~4 mph a "run" is a walk.
    const runLike = activity === "running" ? mPerMin > 107 : mPerMin > 121;
    const vo2 = runLike ? 0.2 * mPerMin + 3.5 : 0.1 * mPerMin + 3.5;
    return Math.min(20, vo2 / 3.5);
  }
  return ACTIVITIES[activity].met;
}

/** Estimated calories burned: MET × kg × hours. Null if duration or weight is missing. */
export function estimateKcal(p: {
  activity: Activity;
  durationMin: number | null;
  distanceMi: number | null;
  weightLb: number | null;
}): number | null {
  if (!p.durationMin || p.durationMin <= 0 || !p.weightLb) return null;
  const met = metFor(p.activity, p.durationMin, p.distanceMi);
  return Math.round((met * (p.weightLb / LB_PER_KG) * p.durationMin) / 60);
}

/** Pace as "mm:ss /mi". */
export function pace(durationMin: number | null, distanceMi: number | null): string | null {
  if (!durationMin || !distanceMi) return null;
  const perMi = durationMin / distanceMi;
  const m = Math.floor(perMi);
  const s = Math.round((perMi - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, "0")} /mi`;
}

export type LiftSet = { exercise: string; weight_lb: number | null; reps: number };

/** Weight × reps; bodyweight sets (no weight) add 0. */
export function volume(sets: LiftSet[]): number {
  return Math.round(sets.reduce((a, s) => a + (s.weight_lb ?? 0) * s.reps, 0));
}

/** Epley estimated one-rep max (exact for a single). Null for bodyweight or > 12 reps. */
export function e1rm(weight: number | null, reps: number): number | null {
  if (!weight || reps < 1 || reps > 12) return null;
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/** Normalize an exercise name so "bench press " and "Bench Press" group together. */
export function liftKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export type LiftSession = {
  day: string;
  topWeight: number | null;
  bestE1rm: number | null;
  volume: number;
  sets: number;
  reps: number;
};

export type LiftHistory = { exercise: string; sessions: LiftSession[] }; // sessions oldest first

/** Group sets by exercise, then by day. */
export function liftHistory(sets: (LiftSet & { day: string })[]): LiftHistory[] {
  const byLift = new Map<string, { name: string; days: Map<string, LiftSet[]> }>();
  for (const s of sets) {
    const k = liftKey(s.exercise);
    if (!k) continue;
    let lift = byLift.get(k);
    if (!lift) byLift.set(k, (lift = { name: s.exercise.trim(), days: new Map() }));
    const list = lift.days.get(s.day);
    if (list) list.push(s);
    else lift.days.set(s.day, [s]);
  }
  return [...byLift.values()]
    .map(({ name, days }) => ({
      exercise: name,
      sessions: [...days.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([day, list]) => {
          const weights = list.map((s) => s.weight_lb ?? 0);
          const e1 = list.map((s) => e1rm(s.weight_lb, s.reps)).filter((v): v is number => v != null);
          const top = Math.max(...weights);
          return {
            day,
            topWeight: top > 0 ? top : null,
            bestE1rm: e1.length ? Math.max(...e1) : null,
            volume: volume(list),
            sets: list.length,
            reps: list.reduce((a, s) => a + s.reps, 0),
          };
        }),
    }))
    .sort((a, b) => b.sessions.length - a.sessions.length || a.exercise.localeCompare(b.exercise));
}

export type LiftPR = { exercise: string; topWeight: number | null; topWeightDay: string | null; bestE1rm: number | null; lastDay: string; sessions: number };

export function personalRecords(history: LiftHistory[]): LiftPR[] {
  return history.map((h) => {
    let top: LiftSession | null = null;
    let best: number | null = null;
    for (const s of h.sessions) {
      if (s.topWeight != null && (top?.topWeight == null || s.topWeight > top.topWeight)) top = s;
      if (s.bestE1rm != null && (best == null || s.bestE1rm > best)) best = s.bestE1rm;
    }
    return {
      exercise: h.exercise,
      topWeight: top?.topWeight ?? null,
      topWeightDay: top?.day ?? null,
      bestE1rm: best,
      lastDay: h.sessions[h.sessions.length - 1].day,
      sessions: h.sessions.length,
    };
  });
}
