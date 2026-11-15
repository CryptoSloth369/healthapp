import "server-only";
import { after } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/today";
import { addDays } from "@/lib/dates";
import { computeTrend } from "@/lib/trend";
import { maintenanceFor, MODEL_VERSION, runEnergyModel, type BalanceDay } from "@/lib/energy-balance";
import {
  diffRows,
  ENERGY_DAY_COLS,
  fromRow,
  previousRun,
  runResult,
  toRow,
  type EnergyDayRow,
  type RunRecord,
} from "@/lib/energy-store";
import type { Profile } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Trigger = RunRecord["trigger"];

type DbError = { message: string; code?: string; details?: string | null; hint?: string | null };
/** A thrown error that says which step failed and everything Supabase reported. */
function dbError(step: string, e: DbError) {
  return new Error([`${step}: ${e.message}`, e.code && `code ${e.code}`, e.details, e.hint].filter(Boolean).join(" · "));
}

/** Supabase returns at most 1,000 rows per request; read everything in pages. */
const PAGE = 1000;
async function readAll<T>(step: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbError | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw dbError(step, error);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}
const chunks = <T>(xs: T[], size: number) => Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, (i + 1) * size));

/** How many past runs to keep for comparison. */
const KEEP_RUNS = 30;
const RUN_COLS = "id, ran_at, trigger, model_version, first_day, last_day, result";

/**
 * Run the energy model over all history and store it. Only changed day rows
 * are written. Returns the new run, or null when signed out.
 */
export async function recalculateEnergy(trigger: Trigger, today?: string): Promise<RunRecord | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const supabase = await createClient();
  const end = addDays(today ?? (await todayLocal()), -1);

  // Remember the "needs rerun" stamp so a save that lands mid-run keeps it dirty.
  const { data: state } = await supabase.from("energy_state").select("changed_at").maybeSingle<{ changed_at: string }>();

  const [{ data: profile }, weights, food, exercise, existing] = await Promise.all([
    supabase
      .from("profile")
      .select("sex, birth_date, height_in, activity_level")
      .eq("user_id", userId)
      .single<Pick<Profile, "sex" | "birth_date" | "height_in" | "activity_level">>(),
    readAll<{ measured_on: string; weight_lb: number }>("Reading weigh-ins", (a, b) =>
      supabase.from("weight_entry").select("measured_on, weight_lb").order("measured_on").range(a, b),
    ),
    readAll<{ day: string; kcal: number }>("Reading food totals", (a, b) => supabase.rpc("food_kcal_by_day").range(a, b)),
    readAll<{ day: string; kcal: number }>("Reading exercise totals", (a, b) => supabase.rpc("exercise_kcal_by_day").range(a, b)),
    readAll<EnergyDayRow>("Reading saved days", (a, b) => supabase.from("energy_day").select(ENERGY_DAY_COLS).order("day").range(a, b)),
  ]);

  const model = runEnergyModel({
    end,
    points: computeTrend(weights.map((w) => ({ day: w.measured_on, weight: Number(w.weight_lb) }))),
    logged: new Map(food.map((f) => [f.day, Number(f.kcal)])),
    exercise: new Map(exercise.map((e) => [e.day, Number(e.kcal)])),
    maintenance: profile ? maintenanceFor(profile, end) : null,
  });

  const { upsert, remove } = diffRows(existing, model.days.map(toRow));
  for (const rows of chunks(upsert, 500)) {
    const { error } = await supabase.from("energy_day").upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: "user_id,day" });
    if (error) throw dbError("Saving days", error);
  }
  for (const days of chunks(remove, 200)) await supabase.from("energy_day").delete().in("day", days);

  const { data: run, error } = await supabase
    .from("energy_run")
    .insert({
      trigger,
      model_version: MODEL_VERSION,
      first_day: model.firstDay,
      last_day: model.lastDay,
      result: runResult(model, upsert.length + remove.length),
    })
    .select(RUN_COLS)
    .single<RunRecord>();
  if (error) throw dbError("Saving the run", error);

  // Keep the most recent runs only.
  const { data: old } = await supabase.from("energy_run").select("id").order("ran_at", { ascending: false }).range(KEEP_RUNS, KEEP_RUNS + 200);
  if (old?.length) await supabase.from("energy_run").delete().in("id", old.map((r) => r.id));

  // Clear the flag only if nothing changed while we ran.
  if (state) await supabase.from("energy_state").update({ dirty: false }).eq("changed_at", state.changed_at);
  else await supabase.from("energy_state").upsert({ user_id: userId, dirty: false }, { onConflict: "user_id", ignoreDuplicates: true });

  return run;
}

export type EnergyStatus = {
  latest: RunRecord | null;
  previous: RunRecord | null;
  ranNow: boolean;
  /** Set when the model couldn't run; screens show it instead of failing. */
  error?: string;
};

async function status(supabase: Supabase) {
  const [{ data: state, error: e1 }, { data: runs, error: e2 }] = await Promise.all([
    supabase.from("energy_state").select("dirty").maybeSingle<{ dirty: boolean }>(),
    supabase.from("energy_run").select(RUN_COLS).order("ran_at", { ascending: false }).limit(KEEP_RUNS).overrideTypes<RunRecord[], { merge: false }>(),
  ]);
  if (e1) throw dbError("Reading the rerun flag", e1);
  if (e2) throw dbError("Reading past runs", e2);
  return { dirty: state?.dirty ?? true, runs: runs ?? [] };
}

function isStale(s: { dirty: boolean; runs: RunRecord[] }, today: string) {
  const latest = s.runs[0];
  return !latest || s.dirty || latest.last_day < addDays(today, -1) || latest.model_version < MODEL_VERSION;
}

/**
 * Latest results, rerunning first if anything changed since the last run or
 * a new day has finished. Used by the dashboard and the coach.
 */
export async function ensureFreshEnergy(today: string): Promise<EnergyStatus> {
  let runs: RunRecord[] = [];
  try {
    const supabase = await createClient();
    const s = await status(supabase);
    runs = s.runs;
    if (!isStale(s, today)) return { latest: s.runs[0], previous: previousRun(s.runs), ranNow: false };
    const run = await recalculateEnergy("stale", today);
    if (run) runs = [run, ...s.runs];
    return { latest: runs[0] ?? null, previous: previousRun(runs), ranNow: !!run };
  } catch (err) {
    // Never take a screen down: show the last good results and the reason.
    console.error("energy model run failed", err);
    return { latest: runs[0] ?? null, previous: previousRun(runs), ranNow: false, error: (err as Error).message };
  }
}

/**
 * After a save: rerun once the response has been sent, so saving stays fast.
 * Skipped when another request already brought the results up to date.
 */
export function scheduleEnergyRun() {
  after(async () => {
    try {
      const today = await todayLocal();
      const supabase = await createClient();
      if (isStale(await status(supabase), today)) await recalculateEnergy("auto", today);
    } catch (err) {
      console.error("energy model run failed", err);
    }
  });
}

/** Stored days in a range (inclusive), oldest first. Empty if they can't be read. */
export async function getEnergyDays(start: string, end: string): Promise<BalanceDay[]> {
  try {
    return await readEnergyDays(start, end);
  } catch (err) {
    console.error("reading energy days failed", err);
    return [];
  }
}

/** Like getEnergyDays, but throws (for the coach, which reports the error). */
export async function readEnergyDays(start: string, end: string): Promise<BalanceDay[]> {
  const supabase = await createClient();
  const rows = await readAll<EnergyDayRow>("Reading saved days", (a, b) =>
    supabase.from("energy_day").select(ENERGY_DAY_COLS).gte("day", start).lte("day", end).order("day").range(a, b),
  );
  return rows.map(fromRow);
}
