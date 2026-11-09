import { describe, expect, it } from "vitest";
import { adaptiveTdee, adherence, averages, dailyTotals, dayRange, trendOn, weeklySummary } from "./analytics";
import { computeTrend } from "./trend";

const food = (eaten_on: string, kcal: number, p = 0) => ({ eaten_on, kcal, protein_g: p, carbs_g: null, fat_g: null });

describe("dayRange / dailyTotals", () => {
  it("fills missing days", () => {
    expect(dayRange("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    const d = dailyTotals([food("2026-01-01", 500, 30), food("2026-01-01", 700, 10), food("2026-01-03", 1800)], "2026-01-01", "2026-01-03");
    expect(d.map((x) => [x.logged, x.kcal, x.protein])).toEqual([
      [true, 1200, 40],
      [false, 0, 0],
      [true, 1800, 0],
    ]);
  });
});

describe("adherence / averages", () => {
  const d = dailyTotals(
    [food("2026-01-01", 2000), food("2026-01-02", 2500), food("2026-01-03", 1500), food("2026-01-05", 2100)],
    "2026-01-01",
    "2026-01-05",
  );
  it("counts on/over/under among logged days", () => {
    expect(adherence(d, 2000)).toEqual({ logged: 4, onTarget: 2, over: 1, under: 1 });
  });
  it("averages logged days only", () => {
    expect(averages(d)?.kcal).toBe(2025);
  });
});

describe("trendOn", () => {
  const pts = computeTrend([
    { day: "2026-01-01", weight: 200 },
    { day: "2026-01-05", weight: 200 },
  ]);
  it("carries forward and is null before data", () => {
    expect(trendOn(pts, "2025-12-31")).toBeNull();
    expect(trendOn(pts, "2026-01-03")).toBe(200);
  });
});

describe("adaptiveTdee", () => {
  // 28 days eating 2,000 kcal while losing exactly 1 lb/week on the trend.
  const days = dayRange("2026-01-01", "2026-01-28");
  const entries = days.map((d) => food(d, 2000));
  const weights = days.map((d, i) => ({ day: d, weight: 200 - i / 7 }));

  it("recovers TDEE from intake and weight change", () => {
    // Start the trend well before the window so EWMA lag has settled.
    const lead = dayRange("2025-11-01", "2025-12-31").map((d, i, a) => ({ day: d, weight: 200 + (a.length - i) / 7 }));
    const pts = computeTrend([...lead, ...weights]);
    const r = adaptiveTdee(dailyTotals(entries, days[0], days[27]), pts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // −1 lb/week = −500 kcal/day of stored energy → TDEE ≈ 2,500.
      expect(r.tdee).toBeGreaterThan(2450);
      expect(r.tdee).toBeLessThan(2550);
      expect(r.lbPerWeek).toBeCloseTo(-1, 1);
    }
  });

  it("explains what's missing", () => {
    const pts = computeTrend(weights);
    const sparse = dailyTotals(entries.filter((_, i) => i % 2 === 0), days[0], days[27]);
    const r = adaptiveTdee(sparse, pts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Log food/);
    expect(adaptiveTdee(sparse.slice(0, 7), pts).ok).toBe(false);
  });
});

describe("weeklySummary", () => {
  it("groups Monday-start weeks, newest first", () => {
    const d = dailyTotals([food("2026-01-05", 2000), food("2026-01-12", 1800)], "2026-01-05", "2026-01-14");
    const pts = computeTrend([
      { day: "2026-01-04", weight: 200 },
      { day: "2026-01-11", weight: 199 },
    ]);
    const w = weeklySummary(d, pts);
    expect(w.map((r) => r.weekStart)).toEqual(["2026-01-12", "2026-01-05"]);
    expect(w[1].avgKcal).toBe(2000);
    expect(w[1].trendChange).toBeLessThan(0);
  });
});
