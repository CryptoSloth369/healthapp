import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getProfileSummary } from "@/lib/profile";
import { getWeightHistory } from "@/lib/weight";
import { getEntriesBetween, getEntriesDetailed } from "@/lib/food";
import { getSessions, getTemplates } from "@/lib/exercise-data";
import { getMoodEntries } from "@/lib/mood-data";
import { getJournalEntries } from "@/lib/journal-data";
import { adaptiveTdee, dailyTotals, trendOn } from "@/lib/analytics";
import { dailyMood } from "@/lib/mood";
import { ACTIVITIES, activityLabel, isActivity, liftHistory, liftKey, personalRecords, volume } from "@/lib/exercise";
import { addDays, isDay } from "@/lib/dates";
import { daysBetween } from "@/lib/trend";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date as YYYY-MM-DD");
const Range = z.object({ start: Day, end: Day });

type Ctx = { today: string };
type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>, ctx: Ctx) => Promise<unknown>;
  /** Proposals change nothing; the app shows them to the user with an Apply button. */
  proposal?: boolean;
};
const def = <S extends z.ZodType>(t: ToolDef<S>) => t;

function checkRange(r: { start: string; end: string }, maxDays: number, ctx: Ctx) {
  if (!isDay(r.start) || !isDay(r.end) || r.start > r.end) throw new Error("start must be on or before end");
  const end = r.end > ctx.today ? ctx.today : r.end;
  if (daysBetween(r.start, end) + 1 > maxDays) throw new Error(`range too long: at most ${maxDays} days`);
  return { start: r.start, end };
}
/** Characters of one journal entry sent to the coach. */
const JOURNAL_ENTRY_LIMIT = 4000;
const r1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10);

export const TOOLS = [
  def({
    name: "get_profile_and_goals",
    description:
      "The user's body stats, goal (goal weight and date), calorie target and macro targets, formula BMR/TDEE, latest weight, and today's date. Call this first in most conversations.",
    schema: z.object({}),
    async run(_i, ctx) {
      const s = await getProfileSummary();
      if (!s) throw new Error("profile not found");
      const p = s.profile;
      return {
        today: ctx.today,
        sex: p.sex,
        birth_date: p.birth_date,
        height_in: p.height_in,
        activity_level_outside_logged_exercise: p.activity_level,
        goal_weight_lb: p.goal_weight_lb,
        goal_date: p.goal_date,
        latest_weight: s.latestWeight ? { day: s.latestWeight.measured_on, lb: Number(s.latestWeight.weight_lb) } : null,
        daily_calorie_target: s.daily?.kcal ?? null,
        target_is_manual_override: p.kcal_target_override != null,
        macro_targets_g: s.daily?.macros ?? null,
        formula: s.target
          ? { bmr: s.target.bmr, tdee: s.target.tdee, planned_lb_per_week: s.target.plannedLbPerWeek, warnings: s.target.warnings }
          : null,
        missing_profile_fields: s.missing,
        notes: "Exercise calories are added to the daily budget on top of the target.",
      };
    },
  }),
  def({
    name: "get_daily_summary",
    description:
      "One row per day: food calories and macros (only if food was logged), exercise calories burned, weigh-in and smoothed trend weight, average mood (1-5), sleep hours, and how many journal entries were written. Best tool for trends and patterns. Max 400 days.",
    schema: Range,
    async run(input, ctx) {
      const { start, end } = checkRange(input, 400, ctx);
      const [food, hist, workouts, moods, journal] = await Promise.all([
        getEntriesBetween(start, end),
        getWeightHistory(),
        getSessions(start, end),
        getMoodEntries(start, end),
        getJournalEntries(start, end, 5000),
      ]);
      const journalCount = new Map<string, number>();
      for (const j of journal) journalCount.set(j.written_on, (journalCount.get(j.written_on) ?? 0) + 1);
      const days = dailyTotals(food, start, end);
      const weighIns = new Map(hist.points.map((p) => [p.day, p.weight]));
      const burned = new Map<string, number>();
      for (const w of workouts) burned.set(w.performed_on, (burned.get(w.performed_on) ?? 0) + (w.kcal_burned ?? 0));
      const mood = new Map(dailyMood(moods).map((m) => [m.day, m]));
      return days.map((d) => {
        const m = mood.get(d.day);
        return Object.fromEntries(
          Object.entries({
            day: d.day,
            food_logged: d.logged,
            kcal: d.logged ? d.kcal : undefined,
            protein_g: d.logged ? d.protein : undefined,
            carbs_g: d.logged ? d.carbs : undefined,
            fat_g: d.logged ? d.fat : undefined,
            exercise_kcal: burned.get(d.day),
            weigh_in_lb: weighIns.get(d.day),
            trend_lb: r1(trendOn(hist.points, d.day)) ?? undefined,
            mood: m?.mood,
            sleep_h: m?.sleep ?? undefined,
            mood_tags: m?.tags.length ? m.tags : undefined,
            journal_entries: journalCount.get(d.day),
          }).filter(([, v]) => v !== undefined),
        );
      });
    },
  }),
  def({
    name: "get_food_log",
    description: "Individual food entries (name, meal, servings, calories, macros, whether estimated from a photo) per day. Max 31 days.",
    schema: Range,
    async run(input, ctx) {
      const { start, end } = checkRange(input, 31, ctx);
      const out: Record<string, unknown[]> = {};
      for (const e of await getEntriesDetailed(start, end)) {
        (out[e.eaten_on] ??= []).push({
            meal: e.meal,
            name: e.name,
            servings: e.servings,
            serving: e.serving,
            kcal: e.kcal,
            protein_g: e.protein_g,
            carbs_g: e.carbs_g,
            fat_g: e.fat_g,
          ...(e.source === "photo" ? { from_photo: true } : {}),
        });
      }
      return out;
    },
  }),
  def({
    name: "get_workouts",
    description:
      "Exercise sessions with activity, minutes, miles, calories burned (and whether estimated), notes, and for weightlifting every set (exercise, weight lb, reps) plus volume. Max 180 days.",
    schema: Range.extend({ activity: z.enum(Object.keys(ACTIVITIES) as [string, ...string[]]).optional() }),
    async run(input, ctx) {
      const { start, end } = checkRange(input, 180, ctx);
      const sessions = (await getSessions(start, end)).filter((s) => !input.activity || s.activity === input.activity);
      return sessions.map((s) => ({
        day: s.performed_on,
        activity: activityLabel(s.activity),
        minutes: s.duration_min,
        miles: s.distance_mi,
        kcal: s.kcal_burned,
        kcal_estimated: s.kcal_estimated,
        note: s.note,
        ...(s.sets.length
          ? { volume_lb: volume(s.sets), sets: s.sets.map((x) => `${x.exercise}: ${x.weight_lb ?? "BW"}x${x.reps}`) }
          : {}),
      }));
    },
  }),
  def({
    name: "get_lift_progress",
    description:
      "All-time weightlifting progress. Without `exercise`: every lift with best top weight, best estimated 1RM (Epley), last date and session count. With `exercise`: that lift's per-session top weight, est. 1RM, volume, sets and reps.",
    schema: z.object({ exercise: z.string().optional().describe("Lift name, e.g. 'Bench press' (case-insensitive)") }),
    async run(input, ctx) {
      const sessions = await getSessions("2000-01-01", ctx.today);
      const hist = liftHistory(sessions.flatMap((w) => w.sets.map((s) => ({ ...s, day: w.performed_on }))));
      if (!input.exercise) return personalRecords(hist);
      const h = hist.find((x) => liftKey(x.exercise) === liftKey(input.exercise!));
      if (!h) return { error: `No sets logged for "${input.exercise}"`, lifts: hist.map((x) => x.exercise) };
      return { exercise: h.exercise, sessions: h.sessions };
    },
  }),
  def({
    name: "get_mood_log",
    description: "Individual mood check-ins with mood/energy/stress (1-5), sleep hours, tags and the user's notes. Max 120 days.",
    schema: Range,
    async run(input, ctx) {
      const { start, end } = checkRange(input, 120, ctx);
      const rows = await getMoodEntries(start, end);
      return rows.map((m) => ({
        day: m.logged_on,
        at: m.logged_at,
        mood: m.mood,
        energy: m.energy,
        stress: m.stress,
        sleep_h: m.sleep_hours,
        tags: m.tags,
        note: m.note,
      }));
    },
  }),
  def({
    name: "get_journal",
    description:
      "The user's journal entries (their own words, often dictated) with day and time. Use for questions about mood, stress, sleep, motivation, cravings, setbacks or what was going on in their life. Very long entries are shortened. Max 60 days.",
    schema: Range,
    async run(input, ctx) {
      const { start, end } = checkRange(input, 60, ctx);
      const rows = await getJournalEntries(start, end, 300);
      return rows
        .reverse()
        .map((j) => ({
          day: j.written_on,
          at: j.written_at,
          text: j.body.length > JOURNAL_ENTRY_LIMIT ? `${j.body.slice(0, JOURNAL_ENTRY_LIMIT)}… [shortened]` : j.body,
        }));
    },
  }),
  def({
    name: "get_energy_balance",
    description:
      "Measured maintenance calories (adaptive TDEE) from the last 28 complete days of food logs and the weight trend, plus the current weekly rate of change. Includes why it can't be computed if data is missing.",
    schema: z.object({}),
    async run(_i, ctx) {
      const yesterday = addDays(ctx.today, -1);
      const start = addDays(yesterday, -27);
      const [food, hist] = await Promise.all([getEntriesBetween(start, yesterday), getWeightHistory()]);
      return {
        window: { start, end: yesterday },
        adaptive_tdee: adaptiveTdee(dailyTotals(food, start, yesterday), hist.points),
        current_trend_lb: r1(hist.points.at(-1)?.trend),
        rate_lb_per_week: hist.rateLbPerWeek,
      };
    },
  }),
  def({
    name: "get_workout_templates",
    description: "The user's saved workout templates (name, activity, exercises with sets/reps/weight).",
    schema: z.object({}),
    async run() {
      return (await getTemplates()).map((t) => ({
        name: t.name,
        activity: activityLabel(t.activity),
        minutes: t.duration_min,
        exercises: t.exercises.map((e) => `${e.exercise}: ${e.sets}x${e.reps ?? "?"}${e.weight_lb != null ? ` @ ${e.weight_lb} lb` : ""}`),
      }));
    },
  }),
  def({
    name: "propose_calorie_target",
    proposal: true,
    description:
      "Suggest a new daily calorie target. Nothing changes until the user taps Apply on the card the app shows. Explain your reasoning in your reply too.",
    schema: z.object({
      kcal: z.number().int().min(1200).max(6000),
      reason: z.string().max(300).describe("One sentence shown on the card"),
    }),
    async run() {
      return "Shown to the user as a card with an Apply button. It is NOT applied unless they tap it.";
    },
  }),
  def({
    name: "propose_workout_template",
    proposal: true,
    description:
      "Suggest a reusable workout template (e.g. one day of a training plan). Nothing is saved until the user taps Save on the card. Use one call per template.",
    schema: z.object({
      name: z.string().min(1).max(80),
      activity: z.enum(Object.keys(ACTIVITIES) as [string, ...string[]]),
      duration_min: z.number().int().min(0).max(600).optional(),
      exercises: z
        .array(
          z.object({
            exercise: z.string().min(1).max(60),
            sets: z.number().int().min(1).max(20),
            reps: z.number().int().min(1).max(100).optional(),
            weight_lb: z.number().min(0).max(2000).optional(),
          }),
        )
        .max(20)
        .describe("Required for weightlifting; leave empty for other activities"),
    }),
    async run(input) {
      if (!isActivity(input.activity)) throw new Error("unknown activity");
      return "Shown to the user as a card with a Save button. It is NOT saved unless they tap it.";
    },
  }),
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];
export const PROPOSAL_TOOLS = new Set<string>(TOOLS.filter((t) => "proposal" in t && t.proposal).map((t) => t.name));

/** Tool definitions for the API. */
export function apiTools(): Anthropic.Beta.BetaTool[] {
  return TOOLS.map((t) => {
    const { $schema: _drop, ...schema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
    void _drop;
    return {
      name: t.name,
      description: t.description,
      input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
    };
  });
}

/** Validate and run one tool call. Errors come back as text for the model. */
export async function runTool(name: string, input: unknown, ctx: Ctx): Promise<{ ok: boolean; content: string }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, content: `Unknown tool: ${name}` };
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) return { ok: false, content: `Invalid input: ${parsed.error.message}` };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tool.run as (i: any, c: Ctx) => Promise<unknown>)(parsed.data, ctx);
    return { ok: true, content: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { ok: false, content: `Error: ${(err as Error).message}` };
  }
}

