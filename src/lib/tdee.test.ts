import { describe, expect, it } from "vitest";
import { ageOn, bmr, calorieTarget, macroSplit, tdee } from "./tdee";

const base = {
  sex: "male" as const,
  weightLb: 200,
  heightIn: 70,
  age: 35,
  activity: "moderate" as const,
  today: new Date("2026-01-01"),
};

describe("bmr / tdee", () => {
  it("matches Mifflin–St Jeor", () => {
    // 90.72 kg, 177.8 cm, 35 y, male → 10*90.72 + 6.25*177.8 - 175 + 5
    expect(bmr(base)).toBeCloseTo(1848.47, 0);
    expect(bmr({ ...base, sex: "female" })).toBeCloseTo(1848.47 - 166, 0);
  });
  it("applies the activity multiplier", () => {
    expect(tdee(base)).toBeCloseTo(bmr(base) * 1.55, 5);
  });
});

describe("ageOn", () => {
  it("counts birthdays correctly", () => {
    expect(ageOn(new Date(1990, 5, 15), new Date(2026, 5, 14))).toBe(35);
    expect(ageOn(new Date(1990, 5, 15), new Date(2026, 5, 15))).toBe(36);
  });
});

describe("calorieTarget", () => {
  it("maintenance when there is no goal", () => {
    const r = calorieTarget(base);
    expect(r.plannedLbPerWeek).toBe(0);
    expect(Math.abs(r.targetKcal - r.tdee)).toBeLessThanOrEqual(5);
    expect(r.projectedGoalDate).toBeNull();
  });

  it("lose 10 lb in 10 weeks → ~500 kcal/day deficit", () => {
    const r = calorieTarget({
      ...base,
      goalWeightLb: 190,
      goalDate: new Date("2026-03-12"), // 10 weeks
    });
    expect(r.plannedLbPerWeek).toBeCloseTo(-1, 2);
    expect(r.dailyAdjustment).toBeGreaterThan(-510);
    expect(r.dailyAdjustment).toBeLessThan(-490);
    expect(r.warnings).toEqual([]);
  });

  it("caps aggressive loss at 1% body weight per week", () => {
    const r = calorieTarget({
      ...base,
      goalWeightLb: 170,
      goalDate: new Date("2026-02-01"),
    });
    expect(r.plannedLbPerWeek).toBe(-2);
    expect(r.warnings[0]).toMatch(/capped/);
    expect(r.projectedGoalDate!.getTime()).toBeGreaterThan(
      new Date("2026-02-01").getTime(),
    );
  });

  it("caps gain at 0.5% body weight per week", () => {
    const r = calorieTarget({
      ...base,
      goalWeightLb: 220,
      goalDate: new Date("2026-02-01"),
    });
    expect(r.plannedLbPerWeek).toBe(1);
    expect(r.dailyAdjustment).toBeGreaterThan(0);
  });

  it("never goes below the calorie floor", () => {
    const r = calorieTarget({
      sex: "female",
      weightLb: 130,
      heightIn: 62,
      age: 50,
      activity: "sedentary",
      goalWeightLb: 120,
      goalDate: new Date("2026-02-01"),
      today: new Date("2026-01-01"),
    });
    expect(r.targetKcal).toBe(1200);
    expect(r.warnings.some((w) => w.includes("minimum"))).toBe(true);
  });

  it("uses a moderate default pace with no goal date", () => {
    const r = calorieTarget({ ...base, goalWeightLb: 180 });
    expect(r.plannedLbPerWeek).toBe(-1); // 0.5% of 200 lb
  });
});

describe("macroSplit", () => {
  it("adds up to the calorie target", () => {
    const m = macroSplit(2200, 180);
    const kcal = m.proteinG * 4 + m.fatG * 9 + m.carbsG * 4;
    expect(Math.abs(kcal - 2200)).toBeLessThan(15);
    expect(m.proteinG).toBe(144);
  });
});
