import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getProfileSummary } from "@/lib/profile";
import { getWeightHistory } from "@/lib/weight";
import { getEntriesBetween, getEntriesDetailed } from "@/lib/food";
import { getSessions, getTemplates } from "@/lib/exercise-data";
import { getMoodEntries } from "@/lib/mood-data";
import { getJournalEntries } from "@/lib/journal-data";
import { dailyTotals, trendOn } from "@/lib/analytics";
import { dailyMood } from "@/lib/mood";
import { ACTIVITIES, activityLabel, isActivity, liftHistory, liftKey, personalRecords, volume } from "@/lib/exercise";
import { addDays, isDay } from "@/lib/dates";
import { daysBetween } from "@/lib/trend";
import { summarizeBalance, weeklyBalance, type BalanceSummary } from "@/lib/energy-balance";
import { ensureFreshEnergy, readEnergyDays } from "@/lib/energy-data";
import { getBalanceHistory, getMoney, type AccountView } from "@/lib/money-data";
import { getCategoryRules, getTransactions } from "@/lib/spending-data";
import { isDebt, KIND_LABELS, netWorthSeries, thinSeries, totals } from "@/lib/finance";
import {
  CATEGORIES,
  categoryLabel,
  categoryWithSource,
  chooseAccounts,
  NOT_SPENDING,
  notSpendingTotals,
  spendableAccounts,
  spendingByCategory,
  spendingByMerchant,
  spendingByMonth,
} from "@/lib/spending";

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
/** Ranges up to this long include one row per day in get_intake_estimates. */
const INTAKE_DAILY_ROWS_MAX = 120;

function balanceSummaryOut(s: BalanceSummary) {
  return {
    days: s.days,
    logged_days: s.loggedDays,
    partly_logged_days: s.partialDays,
    estimated_days: s.estimatedDays,
    unknown_days: s.unknownDays,
    avg_intake_kcal_all_known_days: s.avgIntake,
    avg_intake_kcal_logged_days: s.avgLoggedIntake,
    avg_intake_kcal_estimated_and_partial_days: s.avgEstimatedIntake,
    avg_burn_kcal: s.avgBurn,
    avg_balance_kcal: s.avgBalance,
    implied_lb_per_week: s.lbPerWeek,
    deficit_days: s.deficit,
    surplus_days: s.surplus,
    share_of_kcal_from_logs: s.loggedKcalShare == null ? null : Math.round(s.loggedKcalShare * 100) / 100,
  };
}

// ---- Money helpers ----
const ALL_CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];
const SPENDING_CATEGORY_IDS = ALL_CATEGORY_IDS.filter((c) => !NOT_SPENDING.has(c)) as [string, ...string[]];
const AccountsFilter = z
  .string()
  .min(1)
  .max(40)
  .describe('"cards" (credit cards only, like the Spending tab), "all" (cards plus checking and savings), or one account id from get_money_accounts');
const accountName = (a: AccountView) => `${a.display_name ?? a.name}${a.mask ? ` ••${a.mask}` : ""}`;
const owner = (a: AccountView) => (a.mine ? "you" : (a.ownerName ?? "a family member"));
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** The accounts a spending filter means, or an error listing what can be chosen. */
async function spendingAccounts(filter: string) {
  const { accounts } = await getMoney();
  const spendable = spendableAccounts(accounts);
  const chosen = chooseAccounts(spendable, filter);
  if (!chosen.length) {
    throw new Error(
      `no matching accounts for "${filter}". Use "cards", "all", or one of: ${
        spendable.map((a) => `${a.id} (${accountName(a)}, ${KIND_LABELS[a.kind]})`).join("; ") || "none (no card or bank accounts yet)"
      }`,
    );
  }
  return chosen;
}

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
      "One row per day: food calories and macros (only if food was logged), exercise calories burned, weigh-in and smoothed trend weight, average mood (1-5), sleep hours, and how many journal entries and dreams were written (with that night's dream tags). Best tool for trends and patterns. Only logged food is included; for estimated intake on unlogged days use get_intake_estimates. Max 400 days.",
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
      const dreamCount = new Map<string, number>();
      const dreamTags = new Map<string, string[]>();
      for (const j of journal) {
        const counts = j.kind === "dream" ? dreamCount : journalCount;
        counts.set(j.written_on, (counts.get(j.written_on) ?? 0) + 1);
        if (j.kind === "dream" && j.tags.length) dreamTags.set(j.written_on, [...new Set([...(dreamTags.get(j.written_on) ?? []), ...j.tags])]);
      }
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
            dreams: dreamCount.get(d.day),
            dream_tags: dreamTags.get(d.day),
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
      "The user's journal entries (their own words, often dictated) with day and time. There are two kinds: \"journal\" (regular entries) and \"dream\" (their dream journal; the day is the morning they woke up). Use regular entries for questions about mood, stress, sleep, motivation, cravings, setbacks or what was going on in their life; use dreams when asked about dreams or sleep. Dreams may have tags the user chose (e.g. lucid, nightmare, recurring). Omit kind to get both. Very long entries are shortened. Max 60 days.",
    schema: Range.extend({ kind: z.enum(["journal", "dream"]).optional() }),
    async run(input, ctx) {
      const { start, end } = checkRange(input, 60, ctx);
      const rows = await getJournalEntries(start, end, 300, input.kind);
      return rows
        .reverse()
        .map((j) => ({
          kind: j.kind,
          day: j.written_on,
          tags: j.tags.length ? j.tags : undefined,
          at: j.written_at,
          text: j.body.length > JOURNAL_ENTRY_LIMIT ? `${j.body.slice(0, JOURNAL_ENTRY_LIMIT)}… [shortened]` : j.body,
        }));
    },
  }),
  def({
    name: "get_energy_balance",
    description:
      "Headline numbers from the energy model (rerun first if anything changed): the user's personal maintenance burn (formula corrected by weeks where they logged most food, or why it isn't calibrated yet), the running deficit/surplus total since the first weigh-in vs the actual trend change, all-time and last-28-day summaries, what changed since the previous run, plus the current trend weight and weekly rate. Use get_intake_estimates for day-by-day numbers.",
    schema: z.object({}),
    async run(_i, ctx) {
      const [{ latest, previous, error }, hist] = await Promise.all([ensureFreshEnergy(ctx.today), getWeightHistory()]);
      if (!latest) throw new Error(error ?? "no results yet: needs weigh-ins or food logs");
      const r = latest.result;
      const p = previous?.result;
      return {
        computed_at: latest.ran_at,
        through_day: latest.last_day,
        burn_per_day_before_exercise: r.burnNow,
        calibration: r.calibration,
        running_total_since_first_weigh_in: r.totals,
        all_time: balanceSummaryOut(r.allTime),
        last_28_days: balanceSummaryOut(r.recent),
        previous_run: p
          ? {
              computed_at: previous!.ran_at,
              personal_burn: p.burnNow?.personal ?? null,
              last_28_days_avg_balance_kcal: p.recent.avgBalance,
            }
          : null,
        current_trend_lb: r1(hist.points.at(-1)?.trend),
        rate_lb_per_week: hist.rateLbPerWeek,
      };
    },
  }),
  def({
    name: "get_intake_estimates",
    description:
      "Calories eaten and daily deficit/surplus from the energy model, including days with no or partial food logs. Unlogged days: intake back-calculated from the weight trend (burn + trend change × 3,500 kcal/lb, minus logged days, spread evenly over the open days between weigh-ins). Burn = personal maintenance at that day's trend weight + logged exercise. Each day has source 'logged', 'partial' (under 40% of burn logged; the logged kcal is kept as a minimum and the rest estimated), 'estimated', or null (unknown), and estimates have a confidence (high/medium/low). Returns a summary, Monday-start weeks, and daily rows for ranges up to 120 days. Ends yesterday at the latest. Max 400 days.",
    schema: Range,
    async run(input, ctx) {
      const yesterday = addDays(ctx.today, -1);
      if (input.start > yesterday) throw new Error("start must be before today (today is still in progress)");
      const { start, end } = checkRange({ start: input.start, end: input.end > yesterday ? yesterday : input.end }, 400, ctx);
      const { latest, error } = await ensureFreshEnergy(ctx.today);
      if (error && !latest) throw new Error(error);
      const days = await readEnergyDays(start, end);
      return {
        range: { start, end },
        computed_at: latest?.ran_at ?? null,
        burn_calibrated: latest?.result.calibration.ok ?? false,
        notes:
          "balance = intake − burn (negative = deficit). Days before the first record are omitted. Estimated days in one window share the same intake. Report logged, partly logged and estimated numbers separately.",
        summary: balanceSummaryOut(summarizeBalance(days)),
        weeks: weeklyBalance(days).map((w) => ({ week_start: w.weekStart, ...balanceSummaryOut(w) })),
        ...(days.length <= INTAKE_DAILY_ROWS_MAX
          ? {
              days: days.map((d) => ({
                day: d.day,
                source: d.source,
                intake_kcal: d.intake,
                ...(d.source === "partial" ? { logged_kcal: d.logged } : {}),
                ...(d.confidence ? { confidence: d.confidence } : {}),
                burn_kcal: d.burn,
                ...(d.exercise ? { exercise_kcal: d.exercise } : {}),
                balance_kcal: d.balance,
                trend_lb: r1(d.trend),
                ...(d.source !== "logged" && d.window ? { estimate_spread_over_days: d.window.days } : {}),
              })),
            }
          : { days_omitted: `range is over ${INTAKE_DAILY_ROWS_MAX} days; ask for a shorter range for daily rows` }),
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
    name: "get_money_accounts",
    description:
      "Money: every account this person can see (their own, plus accounts family members share) with type, balance, owner, institution, and for cards the limit and utilization; totals (assets, debts by type, net worth); and each bank connection's sync status. Balances are as of the last sync. Call this first for money questions; account ids from here can filter get_spending and get_transactions.",
    schema: z.object({}),
    async run() {
      const { accounts, items } = await getMoney();
      const t = totals(accounts.map((a) => ({ ...a, subtype: a.plaid_subtype })));
      const itemById = new Map(items.map((i) => [i.id, i]));
      return {
        totals: {
          net_worth: t.netWorth,
          assets: t.assets,
          debts: t.debts,
          by_type: Object.fromEntries(Object.entries(t.byKind).filter(([, v]) => v !== 0).map(([k, v]) => [KIND_LABELS[k as keyof typeof KIND_LABELS], v])),
          debts_by_type: t.debtGroups,
        },
        accounts: accounts.map((a) => {
          const item = a.item_id ? itemById.get(a.item_id) : null;
          return Object.fromEntries(
            Object.entries({
              id: a.id,
              name: accountName(a),
              institution: a.is_manual ? "entered by hand" : (item?.institution_name ?? undefined),
              type: KIND_LABELS[a.kind],
              subtype: a.plaid_subtype ?? undefined,
              is_debt: isDebt(a.kind),
              balance: a.balance,
              available: a.available ?? undefined,
              credit_limit: a.credit_limit ?? undefined,
              utilization_pct: a.kind === "credit" && a.credit_limit ? pct(a.balance, a.credit_limit) : undefined,
              owner: owner(a),
              shared_with_family: a.shared,
              left_out_of_totals: a.hidden || undefined,
              balance_as_of: a.balance_updated_at,
            }).filter(([, v]) => v !== undefined),
          );
        }),
        connections: items.map((i) => ({
          institution: i.institution_name,
          status: i.status,
          ...(i.error ? { error: i.error } : {}),
          last_synced_at: i.last_synced_at,
          connected_by_you: i.mine,
        })),
        notes:
          "Balances are positive for both assets and debts; is_debt says which side of net worth they're on. Accounts with left_out_of_totals are excluded from totals by the person's choice. Manual accounts change only when the person edits them.",
      };
    },
  }),
  def({
    name: "get_net_worth",
    description:
      "Money: net worth, assets and debts over time from daily balance snapshots (taken on days the app synced; each account carries its last balance forward). Returns current totals, the value at the start and end of the range, the change, accounts first seen in the range (which cause jumps that aren't real gains or losses), and a series: daily up to 62 days, weekly up to 400 days, monthly beyond. Defaults to the last 365 days. Max 1,100 days.",
    schema: z.object({ start: Day.optional(), end: Day.optional() }),
    async run(input, ctx) {
      const { start, end } = checkRange({ start: input.start ?? addDays(ctx.today, -364), end: input.end ?? ctx.today }, 1100, ctx);
      const [{ accounts }, history] = await Promise.all([getMoney(), getBalanceHistory("1900-01-01")]);
      const now = totals(accounts.map((a) => ({ ...a, subtype: a.plaid_subtype })));
      const series = netWorthSeries(
        history.filter((p) => p.day <= end),
        accounts,
      );
      const before = series.filter((p) => p.day <= start).at(-1) ?? null;
      const inRange = series.filter((p) => p.day >= start);
      const last = inRange.at(-1) ?? before;
      const first = before ?? inRange[0] ?? null;
      const days = daysBetween(start, end) + 1;
      const step = days <= 62 ? "day" : days <= 400 ? "week" : "month";
      const firstSeen = new Map<string, string>();
      for (const p of history) if (!firstSeen.has(p.accountId)) firstSeen.set(p.accountId, p.day);
      const out = (p: (typeof series)[number]) => ({ day: p.day, net_worth: p.netWorth, assets: p.assets, debts: p.debts });
      return {
        range: { start, end },
        current: { net_worth: now.netWorth, assets: now.assets, debts: now.debts },
        first_snapshot_day: series[0]?.day ?? null,
        at_start: first && out(first),
        at_end: last && out(last),
        change: first && last ? { net_worth: Math.round((last.netWorth - first.netWorth) * 100) / 100, assets: Math.round((last.assets - first.assets) * 100) / 100, debts: Math.round((last.debts - first.debts) * 100) / 100 } : null,
        accounts_first_seen_in_range: accounts
          .filter((a) => !a.hidden && firstSeen.has(a.id) && firstSeen.get(a.id)! > start && firstSeen.get(a.id)! <= end)
          .map((a) => ({ account: accountName(a), type: KIND_LABELS[a.kind], first_day: firstSeen.get(a.id), balance_now: a.balance })),
        step,
        series: thinSeries(inRange, step).map(out),
        notes: series.length
          ? "History starts when accounts were connected; earlier money isn't known. at_start is the last snapshot on or before the start day."
          : "No balance history yet.",
      };
    },
  }),
  def({
    name: "get_spending",
    description:
      "Money: spending between two days, by category, by month, and top 20 merchants, plus money in/out that isn't spending (income, refunds categorized as income, transfers and card payments). Spending = charges minus refunds, pending charges included; transfers, credit card payments and income are not spending. Category = the person's own choice, else a family merchant rule, else the bank's category. Optionally only one category. Max 366 days.",
    schema: Range.extend({
      accounts: AccountsFilter.optional(),
      category: z.enum(SPENDING_CATEGORY_IDS).optional().describe("Only this category (ids from get_category_rules)"),
    }),
    async run(input, ctx) {
      const { start, end } = checkRange(input, 366, ctx);
      const chosen = await spendingAccounts(input.accounts ?? "cards");
      const [all, rules] = await Promise.all([getTransactions(chosen.map((a) => a.id), start, end), getCategoryRules()]);
      const txns = input.category ? all.filter((t) => categoryWithSource(t, rules).category === input.category) : all;
      const { total, categories } = spendingByCategory(txns, rules);
      return {
        range: { start, end },
        accounts: chosen.map((a) => ({ id: a.id, name: accountName(a), type: KIND_LABELS[a.kind], owner: owner(a) })),
        ...(input.category ? { category: categoryLabel(input.category) } : {}),
        total_spending: total,
        transactions_counted: categories.reduce((n, c) => n + c.count, 0),
        pending_transactions: txns.filter((t) => t.pending).length,
        by_category: categories.map((c) => ({ id: c.category, category: c.label, total: c.total, count: c.count, share_pct: pct(c.total, total) })),
        by_month: spendingByMonth(txns, rules),
        top_merchants: spendingByMerchant(txns, rules, 20),
        ...(input.category ? {} : { not_spending: notSpendingTotals(txns, rules) }),
        notes:
          "Months at the edges of the range may be partial. A card payment from checking is a transfer, so 'all' doesn't count card spending twice. Transactions start when the bank was connected (up to 2 years back).",
      };
    },
  }),
  def({
    name: "get_transactions",
    description:
      "Money: individual transactions (newest first, at most 200) with day, merchant, amount (positive = money out, negative = money in or refund), category and where it came from (person, rule, bank), pending flag and account. Filter by accounts (default \"all\"), category (any id, including income and transfer) and text in the merchant or name. Max 120 days.",
    schema: Range.extend({
      accounts: AccountsFilter.optional(),
      category: z.enum(ALL_CATEGORY_IDS).optional(),
      search: z.string().min(2).max(60).optional().describe("Text to find in the merchant or transaction name, case-insensitive"),
    }),
    async run(input, ctx) {
      const { start, end } = checkRange(input, 120, ctx);
      const chosen = await spendingAccounts(input.accounts ?? "all");
      const [all, rules] = await Promise.all([getTransactions(chosen.map((a) => a.id), start, end), getCategoryRules()]);
      const names = new Map(chosen.map((a) => [a.id, accountName(a)]));
      const q = input.search?.toLowerCase();
      const rows = all
        .map((t) => ({ t, c: categoryWithSource(t, rules) }))
        .filter(({ t, c }) => (!input.category || c.category === input.category) && (!q || `${t.merchant_name ?? ""} ${t.name}`.toLowerCase().includes(q)));
      const LIMIT = 200;
      return {
        range: { start, end },
        matched: rows.length,
        ...(rows.length > LIMIT ? { shown: LIMIT, note: "Only the newest 200 are listed; narrow the range or filters for more." } : {}),
        net_amount: Math.round(rows.reduce((s, r) => s + r.t.amount, 0) * 100) / 100,
        transactions: rows.slice(0, LIMIT).map(({ t, c }) => ({
          day: t.day,
          merchant: t.merchant_name || t.name,
          ...(t.merchant_name && t.merchant_name !== t.name ? { description: t.name } : {}),
          amount: t.amount,
          category: categoryLabel(c.category),
          category_from: c.source === "rule" ? `rule "${c.rule}"` : c.source,
          ...(t.pending ? { pending: true } : {}),
          account: names.get(t.account_id),
        })),
      };
    },
  }),
  def({
    name: "get_category_rules",
    description:
      "Money: the spending categories (id, name, whether it counts as spending) and the family's merchant rules (text found in a merchant or transaction name → category; the longest match wins). A person's own choice on a transaction beats rules; rules beat the bank's category.",
    schema: z.object({}),
    async run() {
      const rules = await getCategoryRules();
      return {
        categories: CATEGORIES.map((c) => ({ id: c.id, name: c.label, counts_as_spending: !NOT_SPENDING.has(c.id) })),
        rules: rules.map((r) => ({ match: r.match, category: categoryLabel(r.category) })),
        notes: "The person changes categories and rules in Money → Spending (tap a transaction).",
      };
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

