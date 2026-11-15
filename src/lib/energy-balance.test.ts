import { describe, expect, it } from "vitest";
import {
  balanceContextStart,
  balanceWindows,
  energyBalance,
  maintenanceFor,
  summarizeBalance,
  trendAt,
  weeklyBalance,
} from "./energy-balance";
import type { TrendPoint } from "./trend";

const pt = (day: string, trend: number): TrendPoint => ({ day, weight: trend, trend });
const flat = () => 2000; // maintenance, independent of weight

describe("balanceWindows", () => {
  it("merges weigh-ins until a window spans a week", () => {
    const pts = ["2026-01-01", "2026-01-03", "2026-01-08", "2026-01-15", "2026-01-17"].map((d) => pt(d, 200));
    // Last leftover (15→17) is folded into the previous window.
    expect(balanceWindows(pts)).toEqual([
      { start: "2026-01-01", end: "2026-01-08" },
      { start: "2026-01-08", end: "2026-01-17" },
    ]);
  });

  it("needs at least a week of weigh-ins", () => {
    expect(balanceWindows([pt("2026-01-01", 200), pt("2026-01-04", 199)])).toEqual([]);
    expect(balanceWindows([pt("2026-01-01", 200)])).toEqual([]);
  });

  it("finds the start of the window containing a day", () => {
    const pts = [pt("2026-01-01", 200), pt("2026-01-08", 199), pt("2026-01-15", 198)];
    expect(balanceContextStart(pts, "2026-01-10")).toBe("2026-01-08");
    expect(balanceContextStart(pts, "2026-01-08")).toBe("2026-01-08");
    expect(balanceContextStart(pts, "2026-01-20")).toBe("2026-01-20");
  });
});

describe("trendAt", () => {
  const pts = [pt("2026-01-01", 200), pt("2026-01-11", 199)];
  it("interpolates between weigh-ins and holds after the last", () => {
    expect(trendAt(pts, "2025-12-31")).toBeNull();
    expect(trendAt(pts, "2026-01-06")).toBeCloseTo(199.5);
    expect(trendAt(pts, "2026-01-20")).toBe(199);
  });
});

describe("energyBalance", () => {
  // Lose 2 lb over 14 days = 7,000 kcal = 500/day deficit at 2,000 maintenance → 1,500/day eaten.
  const pts = [pt("2026-01-01", 200), pt("2026-01-08", 199), pt("2026-01-15", 198)];

  it("back-calculates intake when nothing is logged", () => {
    const days = energyBalance({
      start: "2026-01-01",
      end: "2026-01-14",
      logged: new Map(),
      exercise: new Map(),
      points: pts,
      maintenance: flat,
    });
    expect(days).toHaveLength(14);
    for (const d of days) {
      expect(d.source).toBe("estimated");
      expect(d.intake).toBe(1500);
      expect(d.balance).toBe(-500);
    }
    expect(days[0].window).toEqual({ start: "2026-01-01", end: "2026-01-07", days: 7 });
  });

  it("keeps logged days and spreads the rest over unlogged days", () => {
    // Window 1 needs 10,500 kcal total. Two logged days of 2,500 leave 5,500 for 5 days = 1,100.
    const logged = new Map([
      ["2026-01-02", 2500],
      ["2026-01-03", 2500],
    ]);
    const days = energyBalance({ start: "2026-01-01", end: "2026-01-07", logged, exercise: new Map(), points: pts, maintenance: flat });
    const byDay = Object.fromEntries(days.map((d) => [d.day, d]));
    expect(byDay["2026-01-02"]).toMatchObject({ source: "logged", intake: 2500, balance: 500 });
    expect(byDay["2026-01-01"]).toMatchObject({ source: "estimated", intake: 1100, balance: -900 });
    const total = days.reduce((a, d) => a + d.intake!, 0);
    expect(total).toBe(10_500);
  });

  it("adds exercise to the burn, which raises the estimated intake", () => {
    const days = energyBalance({
      start: "2026-01-01",
      end: "2026-01-07",
      logged: new Map(),
      exercise: new Map([["2026-01-03", 700]]),
      points: pts,
      maintenance: flat,
    });
    // 7 × 1,500 + 700 spread over 7 days.
    expect(days[0].intake).toBe(1600);
    expect(days[2]).toMatchObject({ burn: 2700, balance: -1100 });
    expect(days[0].balance).toBe(-400);
  });

  it("never estimates negative intake", () => {
    // Over-logged: 3 × 5,000 already exceeds the 10,500 the window needs.
    const logged = new Map(["2026-01-01", "2026-01-02", "2026-01-03"].map((d) => [d, 5000]));
    const days = energyBalance({ start: "2026-01-01", end: "2026-01-07", logged, exercise: new Map(), points: pts, maintenance: flat });
    expect(days[5]).toMatchObject({ source: "estimated", intake: 0 });
  });

  it("leaves days outside any window unknown, but still balances logged ones", () => {
    const days = energyBalance({
      start: "2026-01-14",
      end: "2026-01-17",
      logged: new Map([["2026-01-16", 1800]]),
      exercise: new Map(),
      points: pts,
      maintenance: flat,
    });
    expect(days.map((d) => d.source)).toEqual(["estimated", null, "logged", null]);
    expect(days[2]).toMatchObject({ balance: -200, window: null });
    expect(days[3]).toMatchObject({ intake: null, balance: null, burn: 2000 });
  });

  it("returns only logged values without a maintenance formula", () => {
    const days = energyBalance({
      start: "2026-01-01",
      end: "2026-01-03",
      logged: new Map([["2026-01-02", 1800]]),
      exercise: new Map(),
      points: pts,
      maintenance: null,
    });
    expect(days.map((d) => [d.source, d.balance])).toEqual([
      [null, null],
      ["logged", null],
      [null, null],
    ]);
  });

  it("uses the full window even when the range starts mid-window", () => {
    const logged = new Map([["2026-01-02", 2500]]);
    const days = energyBalance({ start: "2026-01-05", end: "2026-01-07", logged, exercise: new Map(), points: pts, maintenance: flat });
    // (10,500 − 2,500) / 6 = 1,333
    expect(days.map((d) => d.intake)).toEqual([1333, 1333, 1333]);
  });
});

describe("summaries", () => {
  const pts = [pt("2026-01-05", 200), pt("2026-01-12", 199), pt("2026-01-19", 199)];
  const days = energyBalance({
    start: "2026-01-05",
    end: "2026-01-18",
    logged: new Map([
      ["2026-01-05", 1500],
      ["2026-01-13", 2600],
    ]),
    exercise: new Map(),
    points: pts,
    maintenance: flat,
  });

  it("keeps logged and estimated counts apart", () => {
    const s = summarizeBalance(days);
    expect(s).toMatchObject({ days: 14, loggedDays: 2, estimatedDays: 12, unknownDays: 0 });
    expect(s.deficit).toEqual({ logged: 1, estimated: 12 });
    expect(s.surplus).toEqual({ logged: 1, estimated: 0 });
    expect(s.avgBalance).toBe(-250); // −3,500 over 14 days
    expect(s.lbPerWeek).toBe(-0.5);
    expect(s.loggedKcalShare).toBeCloseTo(4100 / 24500);
  });

  it("groups by Monday weeks", () => {
    const w = weeklyBalance(days);
    expect(w.map((x) => [x.weekStart, x.loggedDays, x.estimatedDays])).toEqual([
      ["2026-01-05", 1, 6],
      ["2026-01-12", 1, 6],
    ]);
  });
});

describe("maintenanceFor", () => {
  it("needs sex, birth date and height", () => {
    expect(maintenanceFor({ sex: null, birth_date: "1990-01-01", height_in: 70, activity_level: "light" }, "2026-01-01")).toBeNull();
  });
  it("matches the formula TDEE at a given weight", () => {
    const f = maintenanceFor({ sex: "male", birth_date: "1996-01-01", height_in: "70", activity_level: "sedentary" }, "2026-01-01")!;
    // Mifflin–St Jeor, 30 y, 70 in, 200 lb: 10·90.72 + 6.25·177.8 − 150 + 5 = 1873.4; × 1.2
    expect(f(200)).toBeCloseTo(2248, 0);
  });
});
