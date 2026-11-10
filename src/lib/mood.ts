/** Mood tracking helpers. Pure functions; no I/O. */

export const MOOD_LEVELS = [1, 2, 3, 4, 5] as const;
export const MOOD_LABELS: Record<number, string> = { 1: "Awful", 2: "Low", 3: "Okay", 4: "Good", 5: "Great" };
export const ENERGY_LABELS: Record<number, string> = { 1: "Drained", 2: "Tired", 3: "Normal", 4: "Energetic", 5: "Wired" };
export const STRESS_LABELS: Record<number, string> = { 1: "Calm", 2: "Mild", 3: "Some", 4: "High", 5: "Very high" };

export const PRESET_TAGS = [
  "exercised",
  "social",
  "outdoors",
  "productive",
  "work",
  "stressed",
  "tired",
  "sick",
  "alcohol",
  "caffeine",
] as const;

/** Lowercase, trimmed, de-duplicated, max 12 tags of ≤ 24 chars. */
export function normalizeTags(raw: string[]): string[] {
  const out: string[] = [];
  for (const t of raw) {
    const v = t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 24);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 12);
}

export type MoodRow = {
  logged_on: string;
  logged_at: string;
  mood: number;
  energy: number | null;
  stress: number | null;
  sleep_hours: number | null;
  tags: string[];
};

export type DayMood = {
  day: string;
  mood: number; // average of the day's check-ins
  energy: number | null;
  stress: number | null;
  sleep: number | null; // from the day's last check-in that recorded sleep
  tags: string[];
  count: number;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

/** One row per day that has check-ins, oldest first. */
export function dailyMood(rows: MoodRow[]): DayMood[] {
  const byDay = new Map<string, MoodRow[]>();
  for (const r of rows) {
    const list = byDay.get(r.logged_on);
    if (list) list.push(r);
    else byDay.set(r.logged_on, [r]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, list]) => {
      const sorted = [...list].sort((a, b) => (a.logged_at < b.logged_at ? -1 : 1));
      const sleep = [...sorted].reverse().find((r) => r.sleep_hours != null)?.sleep_hours ?? null;
      return {
        day,
        mood: r1(avg(sorted.map((r) => r.mood)))!,
        energy: r1(avg(sorted.flatMap((r) => (r.energy == null ? [] : [r.energy])))),
        stress: r1(avg(sorted.flatMap((r) => (r.stress == null ? [] : [r.stress])))),
        sleep: sleep == null ? null : Number(sleep),
        tags: normalizeTags(sorted.flatMap((r) => r.tags)),
        count: sorted.length,
      };
    });
}

export type Split = { label: string; a: { name: string; mood: number; days: number }; b: { name: string; mood: number; days: number } };

/** Average mood in two groups of days; null unless both groups have ≥ minDays. */
function split(
  label: string,
  days: DayMood[],
  test: (d: DayMood) => boolean | null,
  names: [string, string],
  minDays = 3,
): Split | null {
  const a: number[] = [];
  const b: number[] = [];
  for (const d of days) {
    const t = test(d);
    if (t === true) a.push(d.mood);
    else if (t === false) b.push(d.mood);
  }
  if (a.length < minDays || b.length < minDays) return null;
  return {
    label,
    a: { name: names[0], mood: r1(avg(a))!, days: a.length },
    b: { name: names[1], mood: r1(avg(b))!, days: b.length },
  };
}

export function sleepSplit(days: DayMood[], threshold = 7): Split | null {
  return split("Sleep", days, (d) => (d.sleep == null ? null : d.sleep >= threshold), [`${threshold}h+ sleep`, `Under ${threshold}h`]);
}

/** Mood on days you ate within ±10% of target vs days you didn't (logged days only). */
export function calorieSplit(days: DayMood[], kcalByDay: Map<string, number>, target: number): Split | null {
  return split(
    "Calories",
    days,
    (d) => {
      const k = kcalByDay.get(d.day);
      return k == null ? null : Math.abs(k - target) <= target * 0.1;
    },
    ["On calorie target", "Off target"],
  );
}

export function exerciseSplit(days: DayMood[]): Split | null {
  return split("Exercise", days, (d) => d.tags.includes("exercised"), ["Exercised", "Didn't tag exercise"]);
}

export type TagStat = { tag: string; days: number; mood: number; diff: number };

/** Average mood on days with each tag, vs the overall average. Tags on ≥ minDays days. */
export function tagStats(days: DayMood[], minDays = 2): TagStat[] {
  const overall = avg(days.map((d) => d.mood));
  if (overall == null) return [];
  const byTag = new Map<string, number[]>();
  for (const d of days)
    for (const t of d.tags) {
      const list = byTag.get(t);
      if (list) list.push(d.mood);
      else byTag.set(t, [d.mood]);
    }
  return [...byTag.entries()]
    .filter(([, m]) => m.length >= minDays)
    .map(([tag, m]) => {
      const mood = avg(m)!;
      return { tag, days: m.length, mood: r1(mood)!, diff: r1(mood - overall)! };
    })
    .sort((a, b) => b.days - a.days || b.diff - a.diff);
}
