/**
 * Storage shapes for the energy model: database rows ↔ BalanceDay, which rows
 * a run needs to write, and the per-run summary. Pure; the I/O is in
 * `energy-data.ts`.
 */
import { summarizeBalance, type BalanceDay, type BalanceSummary, type Calibration, type ModelResult } from "./energy-balance";

export type EnergyDayRow = {
  day: string;
  intake_kcal: number | null;
  logged_kcal: number | null;
  source: BalanceDay["source"];
  confidence: BalanceDay["confidence"];
  burn_kcal: number | null;
  exercise_kcal: number;
  balance_kcal: number | null;
  cumulative_kcal: number | null;
  trend_lb: number | null;
  window_start: string | null;
  window_end: string | null;
  window_days: number | null;
};

export const ENERGY_DAY_COLS =
  "day, intake_kcal, logged_kcal, source, confidence, burn_kcal, exercise_kcal, balance_kcal, cumulative_kcal, trend_lb, window_start, window_end, window_days";

export function toRow(d: BalanceDay): EnergyDayRow {
  return {
    day: d.day,
    intake_kcal: d.intake,
    logged_kcal: d.logged,
    source: d.source,
    confidence: d.confidence,
    burn_kcal: d.burn,
    exercise_kcal: d.exercise,
    balance_kcal: d.balance,
    cumulative_kcal: d.cumulative,
    trend_lb: d.trend,
    window_start: d.window?.start ?? null,
    window_end: d.window?.end ?? null,
    window_days: d.window?.days ?? null,
  };
}

/** Postgres numeric/int columns may arrive as strings. */
const n = (v: unknown) => (v == null ? null : Number(v));

export function fromRow(r: EnergyDayRow): BalanceDay {
  return {
    day: r.day,
    intake: n(r.intake_kcal),
    logged: n(r.logged_kcal),
    source: r.source,
    confidence: r.confidence,
    burn: n(r.burn_kcal),
    exercise: n(r.exercise_kcal) ?? 0,
    balance: n(r.balance_kcal),
    cumulative: n(r.cumulative_kcal),
    trend: n(r.trend_lb),
    window: r.window_start && r.window_end ? { start: r.window_start, end: r.window_end, days: n(r.window_days) ?? 0 } : null,
  };
}

/** Rows to upsert (new or changed) and days to delete (no longer computed). */
export function diffRows(existing: EnergyDayRow[], next: EnergyDayRow[]): { upsert: EnergyDayRow[]; remove: string[] } {
  const key = (r: EnergyDayRow) => JSON.stringify(toRow(fromRow(r)));
  const old = new Map(existing.map((r) => [r.day, key(r)]));
  const keep = new Set(next.map((r) => r.day));
  return {
    upsert: next.filter((r) => old.get(r.day) !== key(r)),
    remove: existing.filter((r) => !keep.has(r.day)).map((r) => r.day),
  };
}

/** Headline numbers saved with each run. */
export type RunResult = {
  calibration: Calibration;
  burnNow: ModelResult["burnNow"];
  totals: ModelResult["totals"];
  allTime: BalanceSummary;
  /** The 28 days ending at the run's last day. */
  recent: BalanceSummary;
  /** Days written by this run (0 = nothing changed). */
  changedDays: number;
};

export const RECENT_DAYS = 28;

export function runResult(m: ModelResult, changedDays: number): RunResult {
  return {
    calibration: m.calibration,
    burnNow: m.burnNow,
    totals: m.totals,
    allTime: summarizeBalance(m.days),
    recent: summarizeBalance(m.days.slice(-RECENT_DAYS)),
    changedDays,
  };
}

export type RunRecord = {
  id: number;
  ran_at: string;
  trigger: "manual" | "auto" | "stale";
  model_version: number;
  first_day: string | null;
  last_day: string;
  result: RunResult;
};

/**
 * The run to compare the latest against: the newest one from an earlier day
 * (so "since yesterday" stays meaningful when saves trigger many runs a day),
 * else the run just before the latest.
 */
export function previousRun(runs: RunRecord[]): RunRecord | null {
  const [latest, ...rest] = runs; // newest first
  if (!latest) return null;
  return rest.find((r) => r.last_day < latest.last_day) ?? rest[0] ?? null;
}
