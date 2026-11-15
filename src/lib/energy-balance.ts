/**
 * The energy model: one algorithm for intake, burn and balance. Pure, no I/O.
 * The server runs it over all history and stores the result
 * (`energy-data.ts`); screens and the coach read the stored rows.
 *
 * Your weight trend records what you ate even on days you didn't log it.
 * Between two weigh-ins:
 *
 *   food eaten = calories burned + change in stored energy (≈3,500 kcal per lb of trend)
 *
 * Steps:
 * 1. Burn per day = formula maintenance at that day's trend weight + logged exercise.
 * 2. Partial days: a logged day under 40% of that burn is flagged `partial`.
 * 3. Personal burn: windows where most days are fully logged show how far the
 *    formula is off. The day-weighted average correction over the last 90
 *    days (needs 14+ such days) is added to every day's burn.
 * 4. Gaps: per window, logged days keep their logged kcal; the rest of what the
 *    weight change says you ate is spread evenly over unlogged and partial
 *    days (a partial day never drops below what you logged). Each estimated
 *    day gets a confidence from the window length and number of weigh-ins.
 * 5. Running total of the balance from the first weigh-in.
 *
 * Conventions:
 * - A weigh-in on the morning of day D reflects food eaten through day D − 1,
 *   so the window between weigh-ins on A and B covers intake days A … B − 1.
 * - Windows are merged until they span at least a week. With less than a week
 *   of weigh-ins (3–6 days), one low-confidence window covers what there is.
 * - Days outside any window can't be estimated; unlogged ones stay unknown.
 */
import { daysBetween, type TrendPoint } from "./trend";
import { ageOn, KCAL_PER_LB, tdee, type ActivityLevel, type Sex } from "./tdee";
import { parseDay } from "./dates";

/** Bump when the algorithm changes so stored results are recomputed. */
export const MODEL_VERSION = 1;
export const MIN_WINDOW_DAYS = 7;
/** Shortest history that still gets a (low-confidence) estimate. */
export const MIN_SHORT_WINDOW_DAYS = 3;
/** Logged below this share of the day's burn = probably incomplete. */
export const PARTIAL_SHARE = 0.4;
/** Calibration: windows needing this share of fully logged days … */
export const CALIBRATION_COVERAGE = 0.7;
/** … within this many recent days … */
export const CALIBRATION_LOOKBACK_DAYS = 90;
/** … adding up to at least this many days. */
export const CALIBRATION_MIN_DAYS = 14;
/** Largest correction we trust; bigger usually means bad logs. */
export const CALIBRATION_MAX_OFFSET = 1000;

/** logged = a full day of logs; partial = some logs, rest estimated; estimated = no logs. */
export type IntakeSource = "logged" | "partial" | "estimated";
export type Confidence = "high" | "medium" | "low";

export type BalanceDay = {
  day: string;
  /** kcal eaten (logged + estimated); null when unknown. */
  intake: number | null;
  /** kcal actually logged that day (logged and partial days). */
  logged: number | null;
  source: IntakeSource | null;
  /** How much to trust an estimate; null for fully logged days. */
  confidence: Confidence | null;
  /** Maintenance (calibrated when possible) + exercise; null before the first weigh-in. */
  burn: number | null;
  exercise: number;
  /** intake − burn: negative = deficit, positive = surplus. */
  balance: number | null;
  /** Running total of `balance` since the first weigh-in. */
  cumulative: number | null;
  /** Trend weight that day (interpolated between weigh-ins). */
  trend: number | null;
  /** The window this day's estimate was spread over, if any. */
  window: { start: string; end: string; days: number } | null;
};

export type Calibration =
  | { ok: true; offset: number; days: number; windows: number; clamped: boolean }
  | { ok: false; reason: string; days: number };

export type ModelResult = {
  version: number;
  firstDay: string | null;
  lastDay: string;
  days: BalanceDay[];
  calibration: Calibration;
  /** Maintenance at the latest trend weight, before exercise. */
  burnNow: { formula: number; personal: number } | null;
  totals: {
    since: string;
    cumulativeKcal: number;
    /** Weight change the running total predicts (cumulative ÷ 3,500). */
    predictedLb: number;
    /** Actual trend change over the same days. */
    actualLb: number;
  } | null;
};

const shiftDay = (day: string, n: number) =>
  new Date(Date.parse(day + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const round10 = (n: number) => Math.round(n / 10) * 10;

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
      if (out.length) out[out.length - 1].end = points[points.length - 1].day;
      break;
    }
    out.push({ start: points[i].day, end: points[j].day });
    i = j;
  }
  return out;
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

/**
 * Formula maintenance (BMR × activity, no logged exercise) as a function of
 * body weight, or null when the profile lacks sex, birth date or height.
 */
export function maintenanceFor(
  p: { sex: Sex | null; birth_date: string | null; height_in: number | string | null; activity_level: ActivityLevel },
  today: string,
): ((weightLb: number) => number) | null {
  if (!p.sex || !p.birth_date || p.height_in == null) return null;
  const sex = p.sex;
  const age = ageOn(parseDay(p.birth_date), parseDay(today));
  const heightIn = Number(p.height_in);
  return (weightLb) => tdee({ sex, weightLb, heightIn, age, activity: p.activity_level });
}

/**
 * Spread `total` kcal over days with floors (0 for unlogged, the logged kcal
 * for partial days): equal shares, raised to each floor where needed.
 */
function fill(total: number, floors: number[]): number[] {
  const out = floors.map(() => 0);
  const open = new Set(floors.map((_, i) => i));
  let left = total;
  for (;;) {
    const share = open.size ? left / open.size : 0;
    const raise = [...open].filter((i) => floors[i] > share);
    if (!raise.length) {
      for (const i of open) out[i] = Math.max(0, share);
      return out.map(Math.round);
    }
    for (const i of raise) {
      out[i] = floors[i];
      left -= floors[i];
      open.delete(i);
    }
  }
}

export function runEnergyModel(opts: {
  /** Last finished day to compute (usually yesterday). */
  end: string;
  /** Logged kcal by day. Only days with food entries are present. */
  logged: Map<string, number>;
  /** Logged exercise kcal by day. */
  exercise: Map<string, number>;
  /** Trend points, oldest first. */
  points: TrendPoint[];
  /** Formula maintenance at a body weight; null if the profile is incomplete. */
  maintenance: ((weightLb: number) => number) | null;
}): ModelResult {
  const { end, logged, exercise, maintenance } = opts;
  // Weigh-ins after `end + 1` describe food after `end`; ignore them.
  const points = opts.points.filter((p) => p.day <= shiftDay(end, 1));
  const firstLog = [...logged.keys()].sort()[0];
  const firstDay = [points[0]?.day, firstLog].filter((d): d is string => !!d && d <= end).sort()[0] ?? null;
  const empty: ModelResult = {
    version: MODEL_VERSION,
    firstDay,
    lastDay: end,
    days: [],
    calibration: { ok: false, reason: "Not enough data yet.", days: 0 },
    burnNow: null,
    totals: null,
  };
  if (!firstDay) return empty;

  // 1–2. Base rows with formula burn and partial flags.
  const days: BalanceDay[] = [];
  const formulaBurn = new Map<string, number>();
  for (let d = firstDay; d <= end; d = shiftDay(d, 1)) {
    const trend = trendAt(points, d);
    const ex = exercise.get(d) ?? 0;
    const fb = maintenance && trend != null ? maintenance(trend) + ex : null;
    if (fb != null) formulaBurn.set(d, fb);
    const kcal = logged.get(d);
    const partial = kcal != null && fb != null && kcal < PARTIAL_SHARE * fb;
    days.push({
      day: d,
      intake: kcal ?? null,
      logged: kcal ?? null,
      source: kcal == null ? null : partial ? "partial" : "logged",
      confidence: partial ? "low" : null,
      burn: null,
      exercise: ex,
      balance: null,
      cumulative: null,
      trend: trend == null ? null : Math.round(trend * 100) / 100,
      window: null,
    });
  }
  const byDay = new Map(days.map((d) => [d.day, d]));
  const trendByDay = new Map(points.map((p) => [p.day, p.trend]));

  let windows = balanceWindows(points).map((w) => ({ ...w, short: false }));
  if (!windows.length && points.length >= 2) {
    const span = daysBetween(points[0].day, points[points.length - 1].day);
    if (span >= MIN_SHORT_WINDOW_DAYS) windows = [{ start: points[0].day, end: points[points.length - 1].day, short: true }];
  }
  const windowDays = (w: { start: string; end: string }) =>
    Array.from({ length: daysBetween(w.start, w.end) }, (_, i) => byDay.get(shiftDay(w.start, i))!).filter(Boolean);
  const stored = (w: { start: string; end: string }) => (trendByDay.get(w.end)! - trendByDay.get(w.start)!) * KCAL_PER_LB;

  // 3. Calibrate the formula from mostly-logged windows.
  let calibration: Calibration = { ok: false, reason: "Add your sex, birth date and height in Profile.", days: 0 };
  let offset = 0;
  if (maintenance) {
    const since = shiftDay(end, -(CALIBRATION_LOOKBACK_DAYS - 1));
    let sum = 0;
    let n = 0;
    let used = 0;
    for (const w of windows) {
      if (w.short || shiftDay(w.end, -1) < since) continue;
      const ds = windowDays(w);
      const full = ds.filter((d) => d.source === "logged");
      if (ds.length < MIN_WINDOW_DAYS || full.length < CALIBRATION_COVERAGE * ds.length) continue;
      const avgEaten = full.reduce((a, d) => a + d.logged!, 0) / full.length;
      const burnFormula = ds.reduce((a, d) => a + formulaBurn.get(d.day)!, 0);
      sum += avgEaten * ds.length - stored(w) - burnFormula;
      n += ds.length;
      used++;
    }
    if (n >= CALIBRATION_MIN_DAYS) {
      const raw = sum / n;
      const clamped = Math.abs(raw) > CALIBRATION_MAX_OFFSET;
      offset = round10(Math.max(-CALIBRATION_MAX_OFFSET, Math.min(CALIBRATION_MAX_OFFSET, raw)));
      calibration = { ok: true, offset, days: n, windows: used, clamped };
    } else {
      calibration = {
        ok: false,
        days: n,
        reason: `Needs ${CALIBRATION_MIN_DAYS}+ days in weeks where you logged food on most days (has ${n}). Until then, burn is the formula estimate.`,
      };
    }
  }
  for (const d of days) {
    const fb = formulaBurn.get(d.day);
    if (fb != null) d.burn = Math.round(fb + offset);
  }

  // 4. Fill the gaps window by window.
  if (maintenance) {
    for (const w of windows) {
      const ds = windowDays(w);
      if (!ds.length) continue;
      const eaten = stored(w) + ds.reduce((a, d) => a + d.burn!, 0);
      const fixed = ds.filter((d) => d.source === "logged");
      const open = ds.filter((d) => d.source !== "logged");
      const amounts = fill(eaten - fixed.reduce((a, d) => a + d.logged!, 0), open.map((d) => d.logged ?? 0));
      const weighIns = points.filter((p) => p.day >= w.start && p.day <= w.end).length;
      const confidence: Confidence =
        w.short || ds.length > 28 ? "low" : ds.length <= 14 && weighIns >= 4 ? "high" : "medium";
      const window = { start: w.start, end: shiftDay(w.end, -1), days: ds.length };
      open.forEach((d, i) => {
        d.intake = amounts[i];
        if (d.source == null) d.source = "estimated";
        d.confidence = d.source === "partial" && confidence === "high" ? "medium" : confidence;
      });
      for (const d of ds) d.window = window;
    }
  }

  // 5. Balance and running total. Partial days outside a window have only a
  // lower bound on intake, so they get no balance.
  let cum = 0;
  for (const d of days) {
    const usable = d.intake != null && d.burn != null && !(d.source === "partial" && !d.window);
    if (usable) {
      d.balance = Math.round(d.intake! - d.burn!);
      cum += d.balance;
    }
    if (d.burn != null) d.cumulative = cum;
  }

  // The weigh-in the morning after `end` reflects food through `end`.
  const lastTrend = points.length ? trendAt(points, shiftDay(end, 1)) : null;
  const burnNow =
    maintenance && lastTrend != null
      ? { formula: Math.round(maintenance(lastTrend)), personal: Math.round(maintenance(lastTrend) + offset) }
      : null;
  const since = points[0]?.day;
  const totals =
    since && since <= end && lastTrend != null
      ? {
          since,
          cumulativeKcal: cum,
          predictedLb: Math.round((cum / KCAL_PER_LB) * 10) / 10,
          actualLb: Math.round((lastTrend - points[0].trend) * 10) / 10,
        }
      : null;

  return { version: MODEL_VERSION, firstDay, lastDay: end, days, calibration, burnNow, totals };
}

export type SourceSplit = { logged: number; partial: number; estimated: number };

export type BalanceSummary = {
  days: number;
  loggedDays: number;
  partialDays: number;
  estimatedDays: number;
  unknownDays: number;
  /** Average over days with any intake. */
  avgIntake: number | null;
  /** Average over fully logged days only. */
  avgLoggedIntake: number | null;
  /** Average over estimated and partial days. */
  avgEstimatedIntake: number | null;
  /** Average logged kcal per known day (the logged part of avgIntake). */
  avgLoggedPart: number | null;
  avgBalance: number | null;
  /** Average burn over the same days as avgBalance. */
  avgBurn: number | null;
  lbPerWeek: number | null;
  deficit: SourceSplit;
  surplus: SourceSplit;
  /** Share of known intake calories that came from logs (0–1). */
  loggedKcalShare: number | null;
};

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function summarizeBalance(days: BalanceDay[]): BalanceSummary {
  const known = days.filter((d) => d.intake != null);
  const by = (s: IntakeSource) => known.filter((d) => d.source === s);
  const withBal = days.filter((d) => d.balance != null);
  const avgBalance = avg(withBal.map((d) => d.balance!));
  const split = (sign: 1 | -1): SourceSplit => {
    const ds = withBal.filter((d) => Math.sign(d.balance!) === sign);
    return {
      logged: ds.filter((d) => d.source === "logged").length,
      partial: ds.filter((d) => d.source === "partial").length,
      estimated: ds.filter((d) => d.source === "estimated").length,
    };
  };
  const loggedKcal = known.reduce((a, d) => a + (d.logged ?? 0), 0);
  const totalKcal = known.reduce((a, d) => a + d.intake!, 0);
  return {
    days: days.length,
    loggedDays: by("logged").length,
    partialDays: by("partial").length,
    estimatedDays: by("estimated").length,
    unknownDays: days.length - known.length,
    avgIntake: avg(known.map((d) => d.intake!)),
    avgLoggedIntake: avg(by("logged").map((d) => d.intake!)),
    avgEstimatedIntake: avg(known.filter((d) => d.source !== "logged").map((d) => d.intake!)),
    avgLoggedPart: known.length ? Math.round(loggedKcal / known.length) : null,
    avgBalance,
    avgBurn: avg(withBal.map((d) => d.burn!)),
    lbPerWeek: avgBalance == null ? null : Math.round(((avgBalance * 7) / KCAL_PER_LB) * 100) / 100,
    deficit: split(-1),
    surplus: split(1),
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
