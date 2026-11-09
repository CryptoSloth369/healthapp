import { describe, expect, it } from "vitest";
import { computeTrend, daysBetween, weeklyRate } from "./trend";

function series(start: string, weights: number[]) {
  const d0 = Date.parse(start + "T00:00:00Z");
  return weights.map((weight, i) => ({
    day: new Date(d0 + i * 86_400_000).toISOString().slice(0, 10),
    weight,
  }));
}

describe("daysBetween", () => {
  it("counts calendar days, across DST and month ends", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
  });
});

describe("computeTrend", () => {
  it("starts at the first weight", () => {
    expect(computeTrend([{ day: "2026-01-01", weight: 200 }])[0].trend).toBe(200);
  });

  it("moves 10% toward each new reading", () => {
    const t = computeTrend(series("2026-01-01", [200, 210]));
    expect(t[1].trend).toBe(201);
  });

  it("treats a gap as several days of smoothing", () => {
    const t = computeTrend([
      { day: "2026-01-01", weight: 200 },
      { day: "2026-01-03", weight: 210 },
    ]);
    expect(t[1].trend).toBeCloseTo(201.9, 5); // 1 − 0.9² = 0.19
  });

  it("damps daily noise", () => {
    const noisy = series("2026-01-01", Array.from({ length: 30 }, (_, i) => 200 + (i % 2 ? 2 : -2)));
    const t = computeTrend(noisy);
    const last = t.slice(-10).map((p) => p.trend);
    expect(Math.max(...last) - Math.min(...last)).toBeLessThan(1);
  });
});

describe("weeklyRate", () => {
  it("is null with too little data", () => {
    expect(weeklyRate(computeTrend(series("2026-01-01", [200, 199])))).toBeNull();
  });

  it("finds a steady 1 lb/week loss once the trend catches up", () => {
    const w = Array.from({ length: 90 }, (_, i) => 200 - i / 7);
    const r = weeklyRate(computeTrend(series("2026-01-01", w)));
    expect(r).toBeCloseTo(-1, 1);
  });
});
