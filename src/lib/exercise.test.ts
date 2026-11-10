import { describe, expect, it } from "vitest";
import { e1rm, estimateKcal, liftHistory, metFor, pace, personalRecords, volume } from "./exercise";

describe("calorie estimates", () => {
  it("uses MET × kg × hours", () => {
    // 5 MET × 90.7 kg × 1 h ≈ 454
    expect(estimateKcal({ activity: "weightlifting", durationMin: 60, distanceMi: null, weightLb: 200 })).toBe(454);
  });
  it("needs duration and weight", () => {
    expect(estimateKcal({ activity: "swimming", durationMin: null, distanceMi: null, weightLb: 200 })).toBeNull();
    expect(estimateKcal({ activity: "swimming", durationMin: 30, distanceMi: null, weightLb: null })).toBeNull();
  });
  it("uses speed for walking and running", () => {
    expect(metFor("walking", 60, 3)).toBeCloseTo(3.3, 1); // 3 mph walk
    expect(metFor("running", 60, 6)).toBeCloseTo(10.2, 1); // 6 mph run
    expect(metFor("running", 60, 3)).toBeCloseTo(3.3, 1); // a "run" at walking pace
  });
  it("formats pace", () => {
    expect(pace(30, 3)).toBe("10:00 /mi");
    expect(pace(25, 3)).toBe("8:20 /mi");
  });
});

describe("lifting math", () => {
  it("volume and e1RM", () => {
    expect(volume([{ exercise: "Bench", weight_lb: 185, reps: 8 }, { exercise: "Pull-up", weight_lb: null, reps: 10 }])).toBe(1480);
    expect(e1rm(200, 1)).toBe(200);
    expect(e1rm(185, 8)).toBeCloseTo(234.3, 1);
    expect(e1rm(null, 5)).toBeNull();
    expect(e1rm(100, 20)).toBeNull();
  });

  it("groups history and finds PRs", () => {
    const h = liftHistory([
      { day: "2026-11-01", exercise: "Bench press", weight_lb: 185, reps: 8 },
      { day: "2026-11-01", exercise: "bench press ", weight_lb: 195, reps: 5 },
      { day: "2026-11-05", exercise: "Bench Press", weight_lb: 205, reps: 3 },
      { day: "2026-11-05", exercise: "Squat", weight_lb: 225, reps: 5 },
    ]);
    expect(h[0].exercise).toBe("Bench press");
    expect(h[0].sessions).toHaveLength(2);
    expect(h[0].sessions[0]).toMatchObject({ day: "2026-11-01", topWeight: 195, volume: 185 * 8 + 195 * 5, sets: 2 });
    const pr = personalRecords(h)[0];
    expect(pr).toMatchObject({ topWeight: 205, topWeightDay: "2026-11-05", lastDay: "2026-11-05", sessions: 2 });
  });
});
