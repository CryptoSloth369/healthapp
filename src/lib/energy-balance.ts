/**
 * Back-calculated intake and daily energy balance. Pure functions, no I/O.
 *
 * Your weight trend records what you ate even on days you didn't log it.
 * Between two weigh-ins:
 *
 *   food eaten = calories burned + change in stored energy (≈3,500 kcal per lb of trend)
 *
 * Calories burned per day = formula maintenance at that day's trend weight +
 * logged exercise. Logged days keep their logged intake; whatever the weight
 * change says is left over is spread evenly across the unlogged days in the
 * window. Each day says where its number came from (`source`), so logged and
 * estimated values stay separate in every total.
 *
 * Conventions:
 * - A weigh-in on the morning of day D reflects food eaten through day D − 1,
 *   so the window between weigh-ins on A and B covers intake days A … B − 1.
 * - Windows are merged until they span at least `minWindowDays`, because the
 *   trend moves too little day to day to say anything useful.
 * - Days outside any window (before the first weigh-in, or since the last
 *   window closed) can't be estimated; unlogged ones stay unknown.
 */
import { daysBetween, type TrendPoint } from "./trend";
import { KCAL_PER_LB } from "./tdee";

export type IntakeSource = "logged" | "estimated";

export type BalanceDay = {
  day: string;
  /** kcal eaten; null when not logged and not estimable. */
  intake: number | null;
  source: IntakeSource | null;
  /** Maintenance + exercise; null before the first weigh-in. */
  burn: number | null;
  exercise: number;
  /** intake − burn: negative = deficit, positive = surplus. */
  balance: number | null;
  /** Trend weight that day (interpolated between weigh-ins). */
  trend: number | null;
  /** The window this day's estimate was spread over, if any. */
  window: { start: string; end: string; days: number } | null;
};

export const MIN_WINDOW_DAYS = 7;

function shiftDay(day: string, n: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Estimation windows as [startWeighIn, endWeighIn] pairs of weigh-in days.
 * Intake days are start … end − 1. A short leftover at the end is merged into
 * the previous window.
 */
export function balanceWindows(points: TrendPoint[], minDays = MIN_WINDOW_DAYS): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  let i = 0;
  while (i < points.length - 1) {
    let j = i + 1;
    while (j < points.length && daysBetween(points[i].day, points[j].day) < minDays) j++;
    if (j >= points.length) {
      // Too short to stand alone: fold into the previous window.
      if (out.length) out[out.length - 1].end = points[points.length - 1].day;
      break;
    }
    out.push({ start: points[i].day, end: points[j].day });
    i = j;
  }
  return out;
}

/**
 * Earliest day whose food logs affect estimates from `start` on (the start of
 * the window containing it). Load logs from here.
 */
export function balanceContextStart(points: TrendPoint[], start: string, minDays = MIN_WINDOW_DAYS): string {
  const w = balanceWindows(points, minDays).find((w) => w.start <= start && start < w.end);
  return w && w.start < start ? w.start : start;
}

/** Trend on a day: linear between weigh-ins, flat after the last, null before the first. */
export function trendAt(points: TrendPoint[], day: string): number | null {
  if (!points.length || day < points[0].day) return null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.day === day) return p.trend;
    if (p.day > day) {
      const prev = points[i - 1];
      const f = daysBetween(prev.day, day) / daysBetween(prev.day, p.day);
      return prev.trend + f * (p.trend - prev.trend);
    }
  }
  return points[points.length - 1].trend;
}

export function energyBalance(opts: {
  /** First and last day to return (inclusive). `end` should be a finished day. */
  start: string;
  end: string;
  /** Logged kcal by day. Only days with food entries are present. */
  logged: Map<string, number>;
  /** Logged exercise kcal by day. */
  exercise: Map<string, number>;
  points: TrendPoint[];
  /** Formula maintenance (no exercise) at a body weight; null if the profile is incomplete. */
  maintenance: ((weightLb: number) => number) | null;
  minWindowDays?: number;
}): BalanceDay[] {
  const { start, end, logged, exercise, points, maintenance } = opts;
  const byDay = new Map<string, BalanceDay>();

  const base = (day: string): BalanceDay => {
    const trend = trendAt(points, day);
    const ex = exercise.get(day) ?? 0;
    const burn = maintenance && trend != null ? Math.round(maintenance(trend) + ex) : null;
    const kcal = logged.get(day);
    return {
      day,
      intake: kcal ?? null,
      source: kcal != null ? "logged" : null,
      burn,
      exercise: ex,
      balance: kcal != null && burn != null ? Math.round(kcal - burn) : null,
      trend: trend == null ? null : Math.round(trend * 100) / 100,
      window: null,
    };
  };

  if (maintenance) {
    const trendByDay = new Map(points.map((p) => [p.day, p.trend]));
    for (const w of balanceWindows(points, opts.minWindowDays)) {
      const lastIntake = shiftDay(w.end, -1);
      if (lastIntake < start || w.start > end) continue;
      const n = daysBetween(w.start, w.end);
      const days = Array.from({ length: n }, (_, i) => base(shiftDay(w.start, i)));
      const stored = (trendByDay.get(w.end)! - trendByDay.get(w.start)!) * KCAL_PER_LB;
      const eaten = stored + days.reduce((a, d) => a + d.burn!, 0);
      const loggedSum = days.reduce((a, d) => a + (d.intake ?? 0), 0);
      const open = days.filter((d) => d.intake == null);
      // Clamp at zero: a negative leftover means the logs or the formula are off, not that you ate negative food.
      const each = open.length ? Math.max(0, Math.round((eaten - loggedSum) / open.length)) : 0;
      const window = { start: w.start, end: lastIntake, days: n };
      for (const d of days) {
        if (d.intake == null) {
          d.intake = each;
          d.source = "estimated";
          d.balance = Math.round(each - d.burn!);
        }
        d.window = window;
        byDay.set(d.day, d);
      }
    }
  }

  const out: BalanceDay[] = [];
  for (let d = start; d <= end; d = shiftDay(d, 1)) out.push(byDay.get(d) ?? base(d));
  return out;
}

export type BalanceSummary = {
  days: number;
  loggedDays: number;
  estimatedDays: number;
  unknownDays: number;
  /** Average over days with any intake (logged or estimated). */
  avgIntake: number | null;
  avgLoggedIntake: number | null;
  avgEstimatedIntake: number | null;
  /** Average intake − burn over days where both are known. */
  avgBalance: number | null;
  /** Average burn (maintenance + exercise) over the same days as avgBalance. */
  avgBurn: number | null;
  lbPerWeek: number | null;
  deficit: { logged: number; estimated: number };
  surplus: { logged: number; estimated: number };
  /** Share of known intake calories that came from logs (0–1). */
  loggedKcalShare: number | null;
};

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function summarizeBalance(days: BalanceDay[]): BalanceSummary {
  const logged = days.filter((d) => d.source === "logged");
  const est = days.filter((d) => d.source === "estimated");
  const known = [...logged, ...est];
  const withBal = days.filter((d) => d.balance != null);
  const avgBalance = avg(withBal.map((d) => d.balance!));
  const count = (src: IntakeSource, sign: 1 | -1) =>
    withBal.filter((d) => d.source === src && Math.sign(d.balance!) === sign).length;
  const loggedKcal = logged.reduce((a, d) => a + d.intake!, 0);
  const totalKcal = loggedKcal + est.reduce((a, d) => a + d.intake!, 0);
  return {
    days: days.length,
    loggedDays: logged.length,
    estimatedDays: est.length,
    unknownDays: days.length - known.length,
    avgIntake: avg(known.map((d) => d.intake!)),
    avgLoggedIntake: avg(logged.map((d) => d.intake!)),
    avgEstimatedIntake: avg(est.map((d) => d.intake!)),
    avgBalance,
    avgBurn: avg(withBal.map((d) => d.burn!)),
    lbPerWeek: avgBalance == null ? null : Math.round(((avgBalance * 7) / KCAL_PER_LB) * 100) / 100,
    deficit: { logged: count("logged", -1), estimated: count("estimated", -1) },
    surplus: { logged: count("logged", 1), estimated: count("estimated", 1) },
    loggedKcalShare: totalKcal > 0 ? loggedKcal / totalKcal : null,
  };
}

export type BalanceWeek = BalanceSummary & { weekStart: string; lastDay: string };

/** Monday-start weeks, oldest first. */
export function weeklyBalance(days: BalanceDay[]): BalanceWeek[] {
  const weeks = new Map<string, BalanceDay[]>();
  for (const d of days) {
    const dow = (new Date(d.day + "T00:00:00Z").getUTCDay() + 6) % 7; // Mon = 0
    const ws = shiftDay(d.day, -dow);
    const list = weeks.get(ws);
    if (list) list.push(d);
    else weeks.set(ws, [d]);
  }
  return [...weeks].map(([weekStart, list]) => ({ weekStart, lastDay: list[list.length - 1].day, ...summarizeBalance(list) }));
}
