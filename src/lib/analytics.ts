/**
 * Dashboard math. Pure functions over plain data; no I/O.
 * Days are "YYYY-MM-DD" strings in the user's local calendar.
 */
import { daysBetween, type TrendPoint } from "./trend";
import { sumNutrients, type Nutrients, type Totals } from "./nutrition";
import { KCAL_PER_LB } from "./tdee";

export type DayTotals = { day: string; logged: boolean } & Totals;

function shiftDay(day: string, n: number): string {
  const t = Date.parse(day + "T00:00:00Z") + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Every calendar day from start to end (inclusive). */
export function dayRange(start: string, end: string): string[] {
  const n = daysBetween(start, end);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => shiftDay(start, i));
}

/** One row per calendar day; days with no entries are `logged: false`. */
export function dailyTotals(
  entries: (Nutrients & { eaten_on: string })[],
  start: string,
  end: string,
): DayTotals[] {
  const byDay = new Map<string, Nutrients[]>();
  for (const e of entries) {
    const list = byDay.get(e.eaten_on);
    if (list) list.push(e);
    else byDay.set(e.eaten_on, [e]);
  }
  return dayRange(start, end).map((day) => {
    const rows = byDay.get(day);
    return { day, logged: !!rows, ...sumNutrients(rows ?? []) };
  });
}

/** Days within ±tolerance of the target, out of logged days. */
export function adherence(days: DayTotals[], target: number, tolerance = 0.1) {
  const logged = days.filter((d) => d.logged);
  const onTarget = logged.filter((d) => Math.abs(d.kcal - target) <= target * tolerance).length;
  const over = logged.filter((d) => d.kcal > target * (1 + tolerance)).length;
  return { logged: logged.length, onTarget, over, under: logged.length - onTarget - over };
}

export function averages(days: DayTotals[]): Totals | null {
  const logged = days.filter((d) => d.logged);
  if (logged.length === 0) return null;
  const n = logged.length;
  const s = logged.reduce(
    (a, d) => ({ kcal: a.kcal + d.kcal, protein: a.protein + d.protein, carbs: a.carbs + d.carbs, fat: a.fat + d.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return {
    kcal: Math.round(s.kcal / n),
    protein: Math.round(s.protein / n),
    carbs: Math.round(s.carbs / n),
    fat: Math.round(s.fat / n),
  };
}

/** Trend value on a day: the latest trend point on or before it. */
export function trendOn(points: TrendPoint[], day: string): number | null {
  let v: number | null = null;
  for (const p of points) {
    if (p.day > day) break;
    v = p.trend;
  }
  return v;
}

export type AdaptiveTdee =
  | {
      ok: true;
      tdee: number;
      avgIntake: number;
      loggedDays: number;
      spanDays: number;
      trendChangeLb: number;
      lbPerWeek: number;
    }
  | { ok: false; reason: string };

/**
 * Energy balance: what you burn ≈ what you ate − what your body stored.
 * Stored energy comes from the change in TREND weight (~3,500 kcal/lb).
 *
 * Needs ≥ 14 days, food logged on ≥ 70% of them, and weigh-ins near both
 * ends of the window. Unlogged days are assumed to look like logged ones.
 */
export function adaptiveTdee(days: DayTotals[], points: TrendPoint[]): AdaptiveTdee {
  if (days.length < 14) return { ok: false, reason: "Needs at least 2 weeks of data." };
  const start = days[0].day;
  const end = days[days.length - 1].day;
  const logged = days.filter((d) => d.logged);
  const need = Math.ceil(days.length * 0.7);
  if (logged.length < need)
    return { ok: false, reason: `Log food on more days (${logged.length} of ${days.length}; need ${need}).` };

  const inWindow = points.filter((p) => p.day >= start && p.day <= end);
  const nearStart = inWindow.some((p) => daysBetween(start, p.day) <= 6);
  const nearEnd = inWindow.some((p) => daysBetween(p.day, end) <= 6);
  if (!nearStart || !nearEnd) return { ok: false, reason: "Weigh in at least weekly." };

  // Trend at the window edges (carry the last known trend forward).
  const tStart = trendOn(points, start) ?? inWindow[0].trend;
  const tEnd = trendOn(points, end)!;
  const spanDays = days.length;
  const change = tEnd - tStart;
  const avgIntake = logged.reduce((a, d) => a + d.kcal, 0) / logged.length;
  const tdee = avgIntake - (change * KCAL_PER_LB) / spanDays;

  return {
    ok: true,
    tdee: Math.round(tdee / 10) * 10,
    avgIntake: Math.round(avgIntake),
    loggedDays: logged.length,
    spanDays,
    trendChangeLb: Math.round(change * 10) / 10,
    lbPerWeek: Math.round(((change * 7) / spanDays) * 100) / 100,
  };
}

export type WeekRow = {
  weekStart: string; // Monday
  days: number; // days of this week inside the range (fewer for a partial week)
  loggedDays: number;
  avgKcal: number | null;
  trendEnd: number | null;
  trendChange: number | null;
};

/** Monday-start weeks, newest first. */
export function weeklySummary(days: DayTotals[], points: TrendPoint[]): WeekRow[] {
  const weeks = new Map<string, DayTotals[]>();
  for (const d of days) {
    const dow = (new Date(d.day + "T00:00:00Z").getUTCDay() + 6) % 7; // Mon = 0
    const ws = shiftDay(d.day, -dow);
    const list = weeks.get(ws);
    if (list) list.push(d);
    else weeks.set(ws, [d]);
  }
  const rows: WeekRow[] = [];
  for (const [weekStart, list] of weeks) {
    const avg = averages(list);
    const last = list[list.length - 1].day;
    const trendEnd = trendOn(points, last);
    const trendPrev = trendOn(points, shiftDay(weekStart, -1));
    rows.push({
      weekStart,
      days: list.length,
      loggedDays: list.filter((d) => d.logged).length,
      avgKcal: avg?.kcal ?? null,
      trendEnd,
      trendChange: trendEnd != null && trendPrev != null ? Math.round((trendEnd - trendPrev) * 10) / 10 : null,
    });
  }
  return rows.reverse();
}
