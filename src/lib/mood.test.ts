import { describe, expect, it } from "vitest";
import { calorieSplit, dailyMood, normalizeTags, sleepSplit, tagStats, type MoodRow } from "./mood";

const row = (day: string, mood: number, extra: Partial<MoodRow> = {}): MoodRow => ({
  logged_on: day,
  logged_at: `${day}T12:00:00Z`,
  mood,
  energy: null,
  stress: null,
  sleep_hours: null,
  tags: [],
  ...extra,
});

describe("normalizeTags", () => {
  it("cleans and de-duplicates", () => {
    expect(normalizeTags([" Work ", "work", "", "Long   walk"])).toEqual(["work", "long walk"]);
  });
});

describe("dailyMood", () => {
  it("averages a day's check-ins and keeps the latest sleep", () => {
    const d = dailyMood([
      row("2026-01-02", 2, { logged_at: "2026-01-02T08:00:00Z", sleep_hours: 6, energy: 2, tags: ["tired"] }),
      row("2026-01-02", 5, { logged_at: "2026-01-02T20:00:00Z", energy: 4, tags: ["Social"] }),
      row("2026-01-01", 3),
    ]);
    expect(d.map((x) => x.day)).toEqual(["2026-01-01", "2026-01-02"]);
    expect(d[1]).toMatchObject({ mood: 3.5, energy: 3, sleep: 6, count: 2, tags: ["tired", "social"] });
  });
});

describe("splits", () => {
  const days = dailyMood([
    ...["01", "02", "03"].map((d) => row(`2026-01-${d}`, 4, { sleep_hours: 8 })),
    ...["04", "05", "06"].map((d) => row(`2026-01-${d}`, 2, { sleep_hours: 5.5 })),
    row("2026-01-07", 3),
  ]);
  it("compares mood by sleep", () => {
    const s = sleepSplit(days)!;
    expect(s.a).toMatchObject({ mood: 4, days: 3 });
    expect(s.b).toMatchObject({ mood: 2, days: 3 });
  });
  it("needs enough days in both groups", () => {
    expect(sleepSplit(days.slice(0, 4))).toBeNull();
  });
  it("compares mood by calorie adherence", () => {
    const kcal = new Map(days.map((d, i) => [d.day, i < 3 ? 2000 : 2600]));
    const s = calorieSplit(days, kcal, 2000)!;
    expect(s.a.days).toBe(3);
    expect(s.b.days).toBe(4);
  });
});

describe("tagStats", () => {
  it("reports mood difference per tag", () => {
    const days = dailyMood([
      row("2026-01-01", 5, { tags: ["exercised"] }),
      row("2026-01-02", 5, { tags: ["exercised"] }),
      row("2026-01-03", 2, { tags: ["sick"] }),
      row("2026-01-04", 4),
    ]);
    const t = tagStats(days);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ tag: "exercised", days: 2, mood: 5, diff: 1 });
  });
});
