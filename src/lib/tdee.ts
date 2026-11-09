/**
 * Calorie target math. Pure functions, no I/O, imperial units in and out.
 *
 * 1. BMR from the Mifflin–St Jeor equation.
 * 2. TDEE = BMR × activity multiplier.
 * 3. Daily target = TDEE + adjustment needed to reach the goal weight by the
 *    goal date (≈3,500 kcal per lb), clamped to safe rates and a calorie floor.
 *
 * Later (dashboard step) an "adaptive TDEE" estimated from logged intake vs.
 * the weight trend can replace the formula estimate.
 */

export type Sex = "male" | "female";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export const ACTIVITY_LEVELS: Record<
  ActivityLevel,
  { multiplier: number; label: string }
> = {
  sedentary: { multiplier: 1.2, label: "Sedentary (desk job, little exercise)" },
  light: { multiplier: 1.375, label: "Light (exercise 1–3 days/week)" },
  moderate: { multiplier: 1.55, label: "Moderate (exercise 3–5 days/week)" },
  active: { multiplier: 1.725, label: "Active (hard exercise 6–7 days/week)" },
  very_active: { multiplier: 1.9, label: "Very active (physical job + training)" },
};

export const KCAL_PER_LB = 3500;
const LB_PER_KG = 2.20462;
const CM_PER_IN = 2.54;

/** Fastest loss we'll plan for: 1% of body weight per week. */
export const MAX_LOSS_PCT_PER_WEEK = 0.01;
/** Fastest gain we'll plan for: 0.5% of body weight per week (limits fat gain). */
export const MAX_GAIN_PCT_PER_WEEK = 0.005;
/** Never plan below these daily intakes. */
export const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

export function ageOn(birthDate: Date, on: Date = new Date()): number {
  let age = on.getFullYear() - birthDate.getFullYear();
  const m = on.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < birthDate.getDate())) age--;
  return age;
}

export function bmr(p: {
  sex: Sex;
  weightLb: number;
  heightIn: number;
  age: number;
}): number {
  const kg = p.weightLb / LB_PER_KG;
  const cm = p.heightIn * CM_PER_IN;
  return 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === "male" ? 5 : -161);
}

export function tdee(p: {
  sex: Sex;
  weightLb: number;
  heightIn: number;
  age: number;
  activity: ActivityLevel;
}): number {
  return bmr(p) * ACTIVITY_LEVELS[p.activity].multiplier;
}

export type CalorieTargetInput = {
  sex: Sex;
  weightLb: number;
  heightIn: number;
  age: number;
  activity: ActivityLevel;
  /** Omit for maintenance. */
  goalWeightLb?: number | null;
  goalDate?: Date | null;
  today?: Date;
};

export type CalorieTarget = {
  bmr: number;
  tdee: number;
  /** Rounded daily calorie target. */
  targetKcal: number;
  /** targetKcal − tdee (negative = deficit). */
  dailyAdjustment: number;
  /** lb/week the goal asked for (negative = loss). */
  requestedLbPerWeek: number;
  /** lb/week the target actually plans for after safety limits. */
  plannedLbPerWeek: number;
  /** Date the goal weight is reached at the planned rate, if there's a goal. */
  projectedGoalDate: Date | null;
  warnings: string[];
  macros: Macros;
};

export type Macros = { proteinG: number; fatG: number; carbsG: number };

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function calorieTarget(input: CalorieTargetInput): CalorieTarget {
  const today = input.today ?? new Date();
  const b = bmr(input);
  const t = tdee(input);
  const warnings: string[] = [];

  let requested = 0;
  const hasGoal =
    input.goalWeightLb != null &&
    Math.abs(input.goalWeightLb - input.weightLb) >= 0.5;

  if (hasGoal) {
    const delta = input.goalWeightLb! - input.weightLb;
    if (input.goalDate) {
      const weeks = (input.goalDate.getTime() - today.getTime()) / MS_PER_WEEK;
      if (weeks <= 0) {
        warnings.push("Goal date is in the past; using the maximum safe rate.");
        requested = delta < 0 ? -Infinity : Infinity;
      } else {
        requested = delta / weeks;
      }
    } else {
      // No date: a moderate default pace, half the maximum safe rate.
      requested =
        delta < 0
          ? -0.5 * MAX_LOSS_PCT_PER_WEEK * input.weightLb
          : 0.5 * MAX_GAIN_PCT_PER_WEEK * input.weightLb;
    }
  }

  let planned = requested;
  const maxLoss = MAX_LOSS_PCT_PER_WEEK * input.weightLb;
  const maxGain = MAX_GAIN_PCT_PER_WEEK * input.weightLb;
  if (planned < -maxLoss) {
    planned = -maxLoss;
    if (Number.isFinite(requested))
      warnings.push(
        `Goal needs ${fmt(-requested)} lb/week of loss; capped at ${fmt(maxLoss)} lb/week (1% of body weight).`,
      );
  } else if (planned > maxGain) {
    planned = maxGain;
    if (Number.isFinite(requested))
      warnings.push(
        `Goal needs ${fmt(requested)} lb/week of gain; capped at ${fmt(maxGain)} lb/week to limit fat gain.`,
      );
  }

  let adjustment = (planned * KCAL_PER_LB) / 7;
  let target = t + adjustment;

  const floor = MIN_KCAL[input.sex];
  if (target < floor) {
    target = floor;
    adjustment = target - t;
    planned = (adjustment * 7) / KCAL_PER_LB;
    warnings.push(
      `Target raised to the ${floor} kcal minimum; expect about ${fmt(-planned)} lb/week.`,
    );
  }

  let projectedGoalDate: Date | null = null;
  if (hasGoal && planned !== 0) {
    const weeks = (input.goalWeightLb! - input.weightLb) / planned;
    projectedGoalDate = new Date(today.getTime() + weeks * MS_PER_WEEK);
  }

  const targetKcal = Math.round(target / 10) * 10;
  return {
    bmr: Math.round(b),
    tdee: Math.round(t),
    targetKcal,
    dailyAdjustment: Math.round(targetKcal - t),
    requestedLbPerWeek: requested,
    plannedLbPerWeek: round2(planned),
    projectedGoalDate,
    warnings,
    macros: macroSplit(targetKcal, input.goalWeightLb ?? input.weightLb),
  };
}

/**
 * Protein 0.8 g per lb of goal weight, fat 25% of calories, carbs the rest.
 * Protein is capped so it never takes more than 40% of calories.
 */
export function macroSplit(kcal: number, refWeightLb: number): Macros {
  const proteinG = Math.min(0.8 * refWeightLb, (0.4 * kcal) / 4);
  const fatG = (0.25 * kcal) / 9;
  const carbsG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);
  return {
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.round(carbsG),
  };
}

function fmt(n: number) {
  return n.toFixed(2).replace(/\.?0+$/, "");
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
