import { describe, expect, it } from "vitest";
import {
  balanceWindows,
  maintenanceFor,
  runEnergyModel,
  summarizeBalance,
  trendAt,
  weeklyBalance,
  type BalanceDay,
} from "./energy-balance";
import type { TrendPoint } from "./trend";

const pt = (day: string, trend: number): TrendPoint => ({ day, weight: trend, trend });
const flat = () => 2000; // maintenance, independent of weight
const days = (start: string, n: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(start + "T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10));
const run = (o: Partial<Parameters<typeof runEnergyModel>[0]> & { points: TrendPoint[]; end: string }) =>
  runEnergyModel({ logged: new Map(), exercise: new Map(), maintenance: flat, ...o });
const byDay = (ds: BalanceDay[]) => Object.fromEntries(ds.map((d) => [d.day, d]));

// Lose 2 lb over 14 days = 7,000 kcal = 500/day deficit at 2,000 maintenance → 1,500/day eaten.
const twoWeeks = [pt("2026-01-01", 200), pt("2026-01-08", 199), pt("2026-01-15", 198)];

describe("balanceWindows", () => {
  it("merges weigh-ins until a window spans a week", () => {
    const pts = ["2026-01-01", "2026-01-03", "2026-01-08", "2026-01-15", "2026-01-17"].map((d) => pt(d, 200));
    expect(balanceWindows(pts)).toEqual([
      { start: "2026-01-01", end: "2026-01-08" },
      { start: "2026-01-08", end: "2026-01-17" },
    ]);
  });
  it("returns nothing under a week", () => {
    expect(balanceWindows([pt("2026-01-01", 200), pt("2026-01-04", 199)])).toEqual([]);
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

describe("runEnergyModel: filling gaps", () => {
  it("back-calculates intake when nothing is logged", () => {
    const r = run({ points: twoWeeks, end: "2026-01-14" });
    expect(r.firstDay).toBe("2026-01-01");
    expect(r.days).toHaveLength(14);
    for (const d of r.days) expect(d).toMatchObject({ source: "estimated", intake: 1500, balance: -500, logged: null });
    expect(r.days[0].window).toEqual({ start: "2026-01-01", end: "2026-01-07", days: 7 });
  });

  it("keeps logged days and spreads the rest over unlogged days", () => {
    // Window 1 needs 10,500. Two logged days of 2,500 leave 5,500 for 5 days = 1,100.
    const logged = new Map([
      ["2026-01-02", 2500],
      ["2026-01-03", 2500],
    ]);
    const d = byDay(run({ points: twoWeeks, end: "2026-01-14", logged }).days);
    expect(d["2026-01-02"]).toMatchObject({ source: "logged", intake: 2500, logged: 2500, balance: 500, confidence: null });
    expect(d["2026-01-01"]).toMatchObject({ source: "estimated", intake: 1100, balance: -900 });
  });

  it("adds exercise to the burn, which raises the estimated intake", () => {
    const r = run({ points: twoWeeks, end: "2026-01-07", exercise: new Map([["2026-01-03", 700]]) });
    expect(r.days[0].intake).toBe(1600);
    expect(r.days[2]).toMatchObject({ burn: 2700, balance: -1100 });
  });

  it("never estimates negative intake", () => {
    const logged = new Map(["2026-01-01", "2026-01-02", "2026-01-03"].map((d) => [d, 5000]));
    const r = run({ points: twoWeeks, end: "2026-01-07", logged });
    expect(r.days[5]).toMatchObject({ source: "estimated", intake: 0 });
  });

  it("leaves days after the last window unknown, but balances logged ones", () => {
    const r = run({ points: twoWeeks, end: "2026-01-17", logged: new Map([["2026-01-16", 1800]]) });
    const d = byDay(r.days);
    expect(d["2026-01-15"]).toMatchObject({ source: null, intake: null, balance: null, burn: 2000 });
    expect(d["2026-01-16"]).toMatchObject({ source: "logged", balance: -200, window: null });
  });

  it("ignores weigh-ins after the end day", () => {
    const r = run({ points: [...twoWeeks, pt("2026-01-30", 150)], end: "2026-01-14" });
    expect(r.days.at(-1)).toMatchObject({ intake: 1500 });
  });

  it("returns logged values only without a maintenance formula", () => {
    const r = run({ points: twoWeeks, end: "2026-01-03", logged: new Map([["2026-01-02", 1800]]), maintenance: null });
    expect(r.days.map((d) => [d.source, d.balance])).toEqual([
      [null, null],
      ["logged", null],
      [null, null],
    ]);
    expect(r.calibration.ok).toBe(false);
  });

  it("starts at the first food log when it comes before the first weigh-in", () => {
    const r = run({ points: twoWeeks, end: "2026-01-03", logged: new Map([["2025-12-30", 2100]]) });
    expect(r.firstDay).toBe("2025-12-30");
    expect(r.days[0]).toMatchObject({ source: "logged", burn: null, balance: null, cumulative: null });
  });
});

describe("runEnergyModel: partial days", () => {
  it("flags light days, keeps the logged part as a floor, estimates the rest", () => {
    // 600 < 40% of 2,000 → partial. Window needs 10,500 over 7 open days → 1,500 each (above the 600 floor).
    const r = run({ points: twoWeeks, end: "2026-01-07", logged: new Map([["2026-01-02", 600]]) });
    const d = byDay(r.days)["2026-01-02"];
    expect(d).toMatchObject({ source: "partial", logged: 600, intake: 1500, balance: -500 });
    expect(d.confidence).not.toBeNull();
  });

  it("never drops a partial day below what was logged", () => {
    // Heavy logs elsewhere leave only 500 for the open days; the partial day keeps its 700.
    const logged = new Map<string, number>([
      ["2026-01-01", 3000],
      ["2026-01-02", 3000],
      ["2026-01-03", 3000],
      ["2026-01-04", 700],
    ]);
    const d = byDay(run({ points: twoWeeks, end: "2026-01-07", logged }).days);
    expect(d["2026-01-04"]).toMatchObject({ source: "partial", intake: 700 });
    expect(d["2026-01-05"].intake).toBe(267); // (10,500 − 9,000 − 700) / 3
  });

  it("gives a partial day outside any window no balance", () => {
    const d = byDay(run({ points: twoWeeks, end: "2026-01-17", logged: new Map([["2026-01-16", 300]]) }).days);
    expect(d["2026-01-16"]).toMatchObject({ source: "partial", intake: 300, balance: null });
  });
});

describe("runEnergyModel: confidence and short histories", () => {
  it("rates a window with frequent weigh-ins high and a weekly one medium", () => {
    const daily = days("2026-01-01", 8).map((d, i) => pt(d, 200 - i * 0.1));
    expect(run({ points: daily, end: "2026-01-07" }).days[0].confidence).toBe("high");
    expect(run({ points: twoWeeks, end: "2026-01-07" }).days[0].confidence).toBe("medium");
  });

  it("uses one low-confidence window for 3–6 days of weigh-ins", () => {
    const r = run({ points: [pt("2026-01-01", 200), pt("2026-01-05", 199.6)], end: "2026-01-04" });
    expect(r.days.map((d) => d.source)).toEqual(["estimated", "estimated", "estimated", "estimated"]);
    expect(r.days[0]).toMatchObject({ confidence: "low", intake: 1650 }); // 8,000 − 1,400 over 4 days
  });

  it("estimates nothing from under 3 days", () => {
    const r = run({ points: [pt("2026-01-01", 200), pt("2026-01-03", 199)], end: "2026-01-02" });
    expect(r.days.every((d) => d.source == null)).toBe(true);
  });
});

describe("runEnergyModel: personal burn (calibration)", () => {
  // Four weekly windows, every day logged at 2,300 while weight is flat: the
  // real burn is 2,300, so the formula (2,000) is 300 low.
  const pts = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22", "2026-01-29"].map((d) => pt(d, 200));
  const allLogged = new Map(days("2026-01-01", 28).map((d) => [d, 2300]));

  it("measures the formula error from well-logged weeks and applies it", () => {
    const r = run({ points: pts, end: "2026-01-28", logged: allLogged });
    expect(r.calibration).toMatchObject({ ok: true, offset: 300, days: 28, windows: 4, clamped: false });
    expect(r.burnNow).toEqual({ formula: 2000, personal: 2300 });
    expect(r.days[0]).toMatchObject({ burn: 2300, balance: 0 });
  });

  it("uses the corrected burn for unlogged days too", () => {
    const logged = new Map(allLogged);
    for (const d of days("2026-01-22", 2)) logged.delete(d); // 5 of 7 logged in the last week (71%)
    const r = run({ points: pts, end: "2026-01-28", logged });
    expect(r.calibration.ok).toBe(true);
    expect(byDay(r.days)["2026-01-22"]).toMatchObject({ source: "estimated", intake: 2300 });
  });

  it("needs 14 well-logged days", () => {
    const logged = new Map(days("2026-01-01", 7).map((d) => [d, 2300]));
    const r = run({ points: pts, end: "2026-01-28", logged });
    expect(r.calibration).toMatchObject({ ok: false, days: 7 });
    expect(r.burnNow).toEqual({ formula: 2000, personal: 2000 });
  });

  it("caps implausible corrections", () => {
    const huge = new Map(days("2026-01-01", 28).map((d) => [d, 4000]));
    const r = run({ points: pts, end: "2026-01-28", logged: huge });
    expect(r.calibration).toMatchObject({ ok: true, offset: 1000, clamped: true });
  });
});

describe("runEnergyModel: running total", () => {
  it("adds up the balance since the first weigh-in and compares with the trend", () => {
    const r = run({ points: twoWeeks, end: "2026-01-14" });
    expect(r.days.at(-1)!.cumulative).toBe(-7000);
    expect(r.totals).toEqual({ since: "2026-01-01", cumulativeKcal: -7000, predictedLb: -2, actualLb: -2 });
  });
});

describe("summaries", () => {
  const pts = [pt("2026-01-05", 200), pt("2026-01-12", 199), pt("2026-01-19", 199)];
  const r = run({
    points: pts,
    end: "2026-01-18",
    logged: new Map([
      ["2026-01-05", 1500],
      ["2026-01-13", 2600],
      ["2026-01-14", 500],
    ]),
  });

  it("keeps logged, partial and estimated counts apart", () => {
    const s = summarizeBalance(r.days);
    expect(s).toMatchObject({ days: 14, loggedDays: 2, partialDays: 1, estimatedDays: 11, unknownDays: 0 });
    expect(s.avgBalance).toBe(-250); // −3,500 over 14 days
    expect(s.lbPerWeek).toBe(-0.5);
    expect(s.loggedKcalShare).toBeCloseTo(4600 / 24500);
    expect(s.avgLoggedPart).toBe(Math.round(4600 / 14));
    expect(s.surplus).toEqual({ logged: 1, partial: 0, estimated: 0 });
  });

  it("groups by Monday weeks", () => {
    expect(weeklyBalance(r.days).map((w) => [w.weekStart, w.loggedDays, w.partialDays, w.estimatedDays])).toEqual([
      ["2026-01-05", 1, 0, 6],
      ["2026-01-12", 1, 1, 5],
    ]);
  });
});
