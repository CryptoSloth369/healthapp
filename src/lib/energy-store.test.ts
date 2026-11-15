import { describe, expect, it } from "vitest";
import { diffRows, fromRow, previousRun, toRow, type EnergyDayRow, type RunRecord } from "./energy-store";
import type { BalanceDay } from "./energy-balance";

const day: BalanceDay = {
  day: "2026-01-02",
  intake: 1500,
  logged: null,
  source: "estimated",
  confidence: "medium",
  burn: 2000,
  exercise: 0,
  balance: -500,
  cumulative: -1000,
  trend: 199.5,
  window: { start: "2026-01-01", end: "2026-01-07", days: 7 },
};

describe("rows", () => {
  it("round-trips, including numbers that arrive as strings", () => {
    expect(fromRow(toRow(day))).toEqual(day);
    const fromDb = { ...toRow(day), trend_lb: "199.50", intake_kcal: "1500" } as unknown as EnergyDayRow;
    expect(fromRow(fromDb)).toEqual(day);
  });

  it("writes only changed rows and removes days no longer computed", () => {
    const a = toRow(day);
    const b = toRow({ ...day, day: "2026-01-03" });
    const gone = toRow({ ...day, day: "2026-01-01" });
    const fromDb = { ...a, trend_lb: "199.50" } as unknown as EnergyDayRow; // same value, different type
    const changed = { ...b, intake_kcal: 1600 };
    const { upsert, remove } = diffRows([fromDb, b, gone], [a, changed]);
    expect(upsert).toEqual([changed]);
    expect(remove).toEqual(["2026-01-01"]);
  });
});

describe("previousRun", () => {
  const r = (id: number, last_day: string) => ({ id, last_day }) as RunRecord;
  it("prefers the newest run from an earlier day", () => {
    expect(previousRun([r(5, "2026-01-10"), r(4, "2026-01-10"), r(3, "2026-01-09"), r(2, "2026-01-08")])?.id).toBe(3);
  });
  it("falls back to the run before the latest", () => {
    expect(previousRun([r(5, "2026-01-10"), r(4, "2026-01-10")])?.id).toBe(4);
    expect(previousRun([r(5, "2026-01-10")])).toBeNull();
  });
});
