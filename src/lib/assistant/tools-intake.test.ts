import { describe, expect, it, vi } from "vitest";
import { runEnergyModel } from "@/lib/energy-balance";
import { runResult, type RunRecord } from "@/lib/energy-store";
import { computeTrend } from "@/lib/trend";

// Stand-ins for the Supabase-backed loaders the tools read through.
vi.mock("server-only", () => ({}));
const points = computeTrend([
  { day: "2026-01-01", weight: 200 },
  { day: "2026-01-08", weight: 199 },
]);
const model = runEnergyModel({
  end: "2026-01-08",
  points,
  logged: new Map([
    ["2026-01-02", 2600],
    ["2026-01-03", 500], // partial
  ]),
  exercise: new Map(),
  maintenance: () => 2000,
});
const run: RunRecord = {
  id: 1,
  ran_at: "2026-01-09T08:00:00Z",
  trigger: "stale",
  model_version: 1,
  first_day: model.firstDay,
  last_day: model.lastDay,
  result: runResult(model, model.days.length),
};
const ensureFreshEnergy = vi.fn(async () => ({ latest: run, previous: null, ranNow: true }));
const readEnergyDays = vi.fn(async (start: string, end: string) => model.days.filter((d) => d.day >= start && d.day <= end));
vi.mock("@/lib/energy-data", () => ({ ensureFreshEnergy, readEnergyDays }));
vi.mock("@/lib/weight", () => ({ getWeightHistory: async () => ({ points, rateLbPerWeek: null, entries: [] }) }));
vi.mock("@/lib/profile", () => ({ getProfileSummary: async () => null }));
vi.mock("@/lib/food", () => ({ getEntriesBetween: async () => [], getEntriesDetailed: async () => [] }));
vi.mock("@/lib/exercise-data", () => ({ getSessions: async () => [], getTemplates: async () => [] }));
vi.mock("@/lib/mood-data", () => ({ getMoodEntries: async () => [] }));
vi.mock("@/lib/journal-data", () => ({ getJournalEntries: async () => [] }));
vi.mock("@/lib/money-data", () => ({ getMoney: async () => ({ accounts: [], items: [] }), getBalanceHistory: async () => [] }));
vi.mock("@/lib/spending-data", () => ({ getTransactions: async () => [], getCategoryRules: async () => [] }));

const { runTool } = await import("./tools");
const ctx = { today: "2026-01-09" };

describe("get_intake_estimates", () => {
  it("returns stored days with sources and confidence, after making sure they're fresh", async () => {
    const r = await runTool("get_intake_estimates", { start: "2026-01-02", end: "2026-01-30" }, ctx);
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.content);
    expect(ensureFreshEnergy).toHaveBeenCalledWith("2026-01-09");
    expect(out.range).toEqual({ start: "2026-01-02", end: "2026-01-08" }); // clamped to yesterday
    const byDay = Object.fromEntries(out.days.map((d: { day: string }) => [d.day, d]));
    expect(byDay["2026-01-02"]).toMatchObject({ source: "logged", intake_kcal: 2600 });
    expect(byDay["2026-01-03"]).toMatchObject({ source: "partial", logged_kcal: 500 });
    expect(byDay["2026-01-04"]).toMatchObject({ source: "estimated", estimate_spread_over_days: 7 });
    expect(byDay["2026-01-04"].confidence).toBeDefined();
    expect(out.summary).toMatchObject({ logged_days: 1, partly_logged_days: 1, estimated_days: 4, unknown_days: 1 }); // Jan 8: no later weigh-in
  });

  it("refuses a range that starts today", async () => {
    expect(await runTool("get_intake_estimates", { start: "2026-01-09", end: "2026-01-09" }, ctx)).toMatchObject({ ok: false });
  });
});

describe("get_energy_balance", () => {
  it("returns the run's headline numbers", async () => {
    const out = JSON.parse((await runTool("get_energy_balance", {}, ctx)).content);
    expect(out).toMatchObject({ through_day: "2026-01-08", calibration: { ok: false } });
    expect(out.running_total_since_first_weigh_in).toMatchObject({ since: "2026-01-01", predictedLb: -0.5, actualLb: -0.5 }); // smoothed trend
    expect(out.all_time.partly_logged_days).toBe(1);
  });
});
