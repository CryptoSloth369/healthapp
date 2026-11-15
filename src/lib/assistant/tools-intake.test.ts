import { describe, expect, it, vi } from "vitest";
import { computeTrend } from "@/lib/trend";

// Stand-ins for the Supabase loaders the tool reads through.
vi.mock("server-only", () => ({}));
const points = computeTrend([
  { day: "2026-01-01", weight: 200 },
  { day: "2026-01-08", weight: 200 },
]);
vi.mock("@/lib/profile", () => ({
  getProfileSummary: async () => ({
    profile: { sex: "male", birth_date: "1996-01-01", height_in: 70, activity_level: "sedentary" },
    missing: [],
  }),
}));
vi.mock("@/lib/weight", () => ({ getWeightHistory: async () => ({ points, rateLbPerWeek: null, entries: [] }) }));
const getEntriesBetween = vi.fn(async () => [{ eaten_on: "2026-01-02", kcal: 3000, protein_g: null, carbs_g: null, fat_g: null }]);
vi.mock("@/lib/food", () => ({ getEntriesBetween, getEntriesDetailed: async () => [] }));
vi.mock("@/lib/exercise-data", () => ({
  getBurnedByDay: async () => new Map([["2026-01-03", 500]]),
  getSessions: async () => [],
  getTemplates: async () => [],
}));
vi.mock("@/lib/mood-data", () => ({ getMoodEntries: async () => [] }));
vi.mock("@/lib/journal-data", () => ({ getJournalEntries: async () => [] }));

const { runTool } = await import("./tools");

describe("get_intake_estimates", () => {
  it("returns logged and estimated days separately, loading logs from the window start", async () => {
    const r = await runTool("get_intake_estimates", { start: "2026-01-04", end: "2026-01-30" }, { today: "2026-01-09" });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.content);
    // Clamped to yesterday; logs loaded from the window start so Jan 2's log counts.
    expect(out.range).toEqual({ start: "2026-01-04", end: "2026-01-08" });
    expect(getEntriesBetween).toHaveBeenCalledWith("2026-01-01", "2026-01-08");
    // Flat weight: window eats 7 × maintenance + 500 exercise; 3,000 logged, rest over 6 days.
    const est = out.days.filter((d: { source: string }) => d.source === "estimated");
    expect(est).toHaveLength(4); // Jan 4–7
    expect(est[0].estimate_spread_over_days).toBe(7);
    expect(out.days.at(-1)).toMatchObject({ day: "2026-01-08", source: null, intake_kcal: null });
    expect(out.summary).toMatchObject({ logged_days: 0, estimated_days: 4, unknown_days: 1 });
    expect(out.weeks.length).toBeGreaterThan(0);
  });

  it("refuses a range that starts today", async () => {
    const r = await runTool("get_intake_estimates", { start: "2026-01-09", end: "2026-01-09" }, { today: "2026-01-09" });
    expect(r).toMatchObject({ ok: false });
  });
});
