import Link from "next/link";
import type { ProfileSummary } from "@/lib/profile";
import type { WeightHistory } from "@/lib/weight";
import { addDays, formatDay } from "@/lib/dates";
import { adherence, averages, dailyTotals, dayRange, trendOn, weeklySummary } from "@/lib/analytics";
import { MIN_KCAL } from "@/lib/tdee";
import { summarizeBalance, weeklyBalance, type BalanceDay, type BalanceWeek } from "@/lib/energy-balance";
import type { RunRecord } from "@/lib/energy-store";
import { CalorieChart, type CalorieBar } from "@/components/calorie-chart";
import { BalanceChart, type BalanceBar } from "@/components/balance-chart";
import { HatchSwatch, SolidSwatch } from "@/components/chart-bits";
import { WeightChart } from "@/components/weight-chart";
import { Meter } from "@/components/meter";
import { card } from "@/components/ui";
import { ApplyTargetButton } from "./apply-target";
import { RecalculateButton } from "./recalculate-button";
import { MoodHeatmap } from "@/components/mood-heatmap";
import { LiftProgress } from "@/components/lift-progress";
import { ACTIVITIES, activityLabel, liftHistory, personalRecords } from "@/lib/exercise";
import type { ExerciseSession } from "@/lib/types";
import { calorieSplit, dailyMood, exerciseSplit, MOOD_LABELS, sleepSplit, tagStats, type MoodRow, type Split } from "@/lib/mood";

export const RANGES = { "4w": { days: 28, label: "4W" }, "12w": { days: 84, label: "12W" }, "6m": { days: 182, label: "6M" } } as const;
export type RangeKey = keyof typeof RANGES;
/** Days of food logs loaded for the logging streak. */
export const STREAK_WINDOW = 28;

/** Pure rendering from loaded data (also used for previews). */
export function DashboardView({
  range,
  today,
  summary,
  history,
  entries,
  moods,
  workouts,
  energyDays,
  energy,
  now,
}: {
  range: RangeKey;
  today: string;
  summary: ProfileSummary;
  history: WeightHistory;
  entries: { eaten_on: string; kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null }[];
  moods: MoodRow[];
  workouts: ExerciseSession[];
  /** Stored energy-model days from `start` through yesterday. */
  energyDays: BalanceDay[];
  /** Latest energy-model run and the one to compare it with. */
  energy: { latest: RunRecord | null; previous: RunRecord | null; error?: string };
  /** Current time (ISO), for "updated 3 min ago". */
  now: string;
}) {
  const span = RANGES[range].days;
  const start = addDays(today, -(span - 1));
  const yesterday = addDays(today, -1);
  const streakStart = addDays(today, -STREAK_WINDOW);
  const fetchStart = streakStart < start ? streakStart : start;

  const target = summary.daily?.kcal ?? null;
  const days = dailyTotals(entries, start, today);
  const avg = averages(days);
  const adh = target ? adherence(days, target) : null;
  const points = history.points;
  const goal = summary.profile.goal_weight_lb == null ? null : Number(summary.profile.goal_weight_lb);

  const firstInRange = points.find((p) => p.day >= start);
  const trendStart = trendOn(points, start) ?? firstInRange?.trend ?? null;
  const trendSince = trendOn(points, start) == null && firstInRange ? firstInRange.day : null;
  const trendNow = points.at(-1)?.trend ?? null;
  const trendDelta = trendStart != null && trendNow != null ? Math.round((trendNow - trendStart) * 10) / 10 : null;

  // Logging streak: consecutive logged days ending today (or yesterday if today is empty so far).
  const allDays = dailyTotals(entries, fetchStart, today);
  let streak = 0;
  for (let i = allDays.length - 1; i >= 0; i--) {
    if (allDays[i].logged) streak++;
    else if (i === allDays.length - 1) continue;
    else break;
  }

  // Energy model results through yesterday (today is still in progress),
  // computed and stored by the server (energy-data.ts). Every value keeps its
  // source so logged, partly logged and estimated numbers stay distinguishable.
  const run = energy.latest?.result ?? null;
  const loggedKcal = new Map<string, number>();
  for (const e of entries) loggedKcal.set(e.eaten_on, (loggedKcal.get(e.eaten_on) ?? 0) + e.kcal);
  const stored = new Map(energyDays.map((d) => [d.day, d]));
  const balDays = dayRange(start, yesterday).map((day) => stored.get(day) ?? emptyDay(day, loggedKcal.get(day)));
  const bal = summarizeBalance(balDays);
  const intakeDays = [...balDays, emptyDay(today, loggedKcal.get(today))];
  const intakeWeeks = new Map(weeklyBalance(intakeDays).map((w) => [w.weekStart, w]));
  const weekLabel = (w: BalanceWeek) => `Week of ${formatDay(w.weekStart, { month: "short", day: "numeric" })}`;

  // Bars: daily for ≤ 12 weeks, weekly averages for 6 months.
  const weekly = weeklySummary(days, points);
  const weeklyRows = weekly.filter((w) => w.loggedDays > 0 || w.trendEnd != null || intakeWeeks.get(w.weekStart)?.avgIntake != null);
  const bars: CalorieBar[] =
    span <= 84
      ? intakeDays.map((d) => ({ day: d.day, kcal: d.intake, loggedKcal: d.logged ?? 0, ...sourceCounts(d), confidence: d.confidence }))
      : [...intakeWeeks.values()].map((w) => ({
          day: w.weekStart,
          kcal: w.avgIntake,
          loggedKcal: w.avgLoggedPart ?? 0,
          logged: w.loggedDays,
          partial: w.partialDays,
          estimated: w.estimatedDays,
          label: weekLabel(w),
        }));
  const balanceBars: BalanceBar[] =
    span <= 84
      ? balDays.map((d) => ({
          start: d.day,
          end: d.day,
          balance: d.balance,
          intake: d.intake,
          burn: d.burn,
          loggedKcal: d.logged ?? 0,
          ...sourceCounts(d),
          confidence: d.confidence,
          windowDays: d.source !== "logged" ? d.window?.days : null,
        }))
      : weeklyBalance(balDays).map((w) => ({
          start: w.weekStart < start ? start : w.weekStart,
          end: w.lastDay,
          balance: w.avgBalance,
          intake: w.avgIntake,
          burn: w.avgBurn,
          loggedKcal: w.avgLoggedPart ?? 0,
          logged: w.loggedDays,
          partial: w.partialDays,
          estimated: w.estimatedDays,
          label: `${weekLabel(w)} (daily avg)`,
        }));
  const weighedIn = new Set(points.map((pt) => pt.day));
  const trendRows = balDays.map((d) => ({ day: d.day, trend: d.trend, weighedIn: weighedIn.has(d.day) }));

  // Exercise over the range.
  const totalBurned = workouts.reduce((a, w) => a + (w.kcal_burned ?? 0), 0);
  const totalMinutes = workouts.reduce((a, w) => a + (w.duration_min ?? 0), 0);
  const byActivity = Object.entries(
    workouts.reduce<Record<string, { n: number; min: number; mi: number; kcal: number }>>((acc, w) => {
      const a = (acc[w.activity] ??= { n: 0, min: 0, mi: 0, kcal: 0 });
      a.n++;
      a.min += w.duration_min ?? 0;
      a.mi += w.distance_mi ?? 0;
      a.kcal += w.kcal_burned ?? 0;
      return acc;
    }, {}),
  ).sort((a, b) => b[1].n - a[1].n);
  const lifts = liftHistory(workouts.flatMap((w) => w.sets.map((s) => ({ ...s, day: w.performed_on }))));
  const prs = personalRecords(lifts);

  // Mood vs sleep, calories and tags over the range.
  const moodDays = dailyMood(moods.filter((m) => m.logged_on >= start));
  const avgMood = moodDays.length ? Math.round((moodDays.reduce((a, d) => a + d.mood, 0) / moodDays.length) * 10) / 10 : null;
  const sleepDays = moodDays.filter((d) => d.sleep != null);
  const avgSleep = sleepDays.length ? Math.round((sleepDays.reduce((a, d) => a + d.sleep!, 0) / sleepDays.length) * 10) / 10 : null;
  const kcalByDay = new Map(days.filter((d) => d.logged).map((d) => [d.day, d.kcal]));
  const splits = [
    sleepSplit(moodDays),
    target ? calorieSplit(moodDays, kcalByDay, target) : null,
    exerciseSplit(moodDays),
  ].filter((x): x is Split => x != null);
  const tags = tagStats(moodDays).slice(0, 6);

  // Personal burn from the energy model: the formula, corrected by weeks you logged well.
  const formulaTarget = summary.target;
  const calibration = run?.calibration ?? null;
  const suggested =
    calibration?.ok && run?.burnNow && formulaTarget && summary.profile.sex
      ? Math.max(MIN_KCAL[summary.profile.sex], Math.round((run.burnNow.personal + formulaTarget.dailyAdjustment) / 10) * 10)
      : null;
  const updated = energy.latest ? `Updated ${timeAgo(energy.latest.ran_at, now)}` : "Not calculated yet";

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <nav className="flex rounded-lg border border-border p-0.5 text-xs" aria-label="Time range">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <Link
              key={k}
              href={`/dashboard?range=${k}`}
              aria-current={k === range ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 ${k === range ? "bg-surface text-foreground" : "text-muted"}`}
            >
              {RANGES[k].label}
            </Link>
          ))}
        </nav>
      </header>

      <Link href="/coach" className="flex items-center justify-between rounded-2xl border border-accent/50 bg-surface px-4 py-3">
        <span>
          <span className="block font-semibold">Ask the coach</span>
          <span className="block text-sm text-muted">Get an analysis or a plan from these numbers</span>
        </span>
        <span className="text-accent">→</span>
      </Link>

      <section className="grid grid-cols-2 gap-3">
        {bal.estimatedDays + bal.partialDays > 0 ? (
          <Tile
            label="Avg intake"
            value={`≈${bal.avgIntake!.toLocaleString()}`}
            unit="kcal/day"
            sub={[
              bal.avgLoggedIntake != null && `Logged days ${bal.avgLoggedIntake.toLocaleString()}`,
              `Est. days ${bal.avgEstimatedIntake!.toLocaleString()}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ) : (
          <Tile
            label="Avg intake"
            value={avg ? `${avg.kcal.toLocaleString()}` : "—"}
            unit={avg ? "kcal/day" : undefined}
            sub={avg && target ? `${avg.kcal > target ? "+" : ""}${(avg.kcal - target).toLocaleString()} vs target` : "No food logged"}
          />
        )}
        <Tile
          label="On target"
          value={adh && adh.logged ? `${Math.round((adh.onTarget / adh.logged) * 100)}%` : "—"}
          sub={adh && adh.logged ? `${adh.onTarget} of ${adh.logged} logged days (±10%)` : "Needs a target and logs"}
        />
        <Tile
          label="Trend change"
          value={trendDelta == null ? "—" : `${trendDelta > 0 ? "+" : ""}${trendDelta.toFixed(1)}`}
          unit={trendDelta == null ? undefined : "lb"}
          sub={[
            trendSince ? `Since ${formatDay(trendSince, { month: "short", day: "numeric" })}` : null,
            history.rateLbPerWeek == null
              ? "Needs more weigh-ins"
              : `Now ${history.rateLbPerWeek > 0 ? "+" : ""}${history.rateLbPerWeek.toFixed(1)} lb/week`,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <Tile
          label="Logging streak"
          value={String(streak)}
          unit={streak === 1 ? "day" : "days"}
          sub={`${days.filter((d) => d.logged).length} of ${days.length} days logged`}
        />
      </section>

      <section className={`${card} space-y-2`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="font-semibold">Calories {span > 84 ? "(weekly average)" : "per day"}</h2>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <SolidSwatch color="var(--series-trend)" />
            Logged
          </li>
          {bal.estimatedDays + bal.partialDays > 0 && (
            <li className="flex items-center gap-1.5">
              <HatchSwatch id="cal-legend-hatch" color="var(--series-trend)" />
              Estimated from weight
            </li>
          )}
          {target != null && (
            <li className="flex items-center gap-1.5">
              <svg width="14" height="8" aria-hidden>
                <path d="M1 4h12" stroke="var(--foreground)" strokeOpacity="0.6" strokeWidth="1" />
              </svg>
              Target {target.toLocaleString()}
            </li>
          )}
        </ul>
        {bars.some((b) => b.kcal != null) ? (
          <CalorieChart bars={bars} target={target} unit={span > 84 ? "week" : "day"} />
        ) : (
          <p className="py-8 text-center text-sm text-muted">No food logged in this range yet.</p>
        )}
      </section>

      <BalanceSection
        bal={bal}
        bars={balanceBars}
        trend={trendRows}
        start={start}
        end={yesterday}
        weekly={span > 84}
        hasProfile={summary.missing.filter((m) => m !== "current weight").length === 0}
        run={energy.latest}
        previous={energy.previous}
        updated={updated}
        error={energy.error}
      />

      <section className={`${card} space-y-2`}>
        <h2 className="font-semibold">Weight</h2>
        <WeightChart points={points} goalLb={goal} rangeDays={span} />
      </section>

      {avg && summary.daily && (
        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold">
            Average macros <span className="text-sm font-normal text-muted">(logged days)</span>
          </h2>
          {(
            [
              ["Protein", avg.protein, summary.daily.macros.proteinG],
              ["Carbs", avg.carbs, summary.daily.macros.carbsG],
              ["Fat", avg.fat, summary.daily.macros.fatG],
            ] as const
          ).map(([name, v, t]) => (
            <div key={name} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{name}</span>
                <span className="text-muted">
                  <span className="text-foreground">{v}</span> / {t} g
                </span>
              </div>
              <Meter value={v} target={t} label={`Average ${name.toLowerCase()} vs target`} height={6} />
            </div>
          ))}
        </section>
      )}

      <section className={`${card} space-y-2`}>
        <h2 className="font-semibold">Your burn</h2>
        {!run?.burnNow ? (
          <p className="text-sm text-muted">
            {summary.missing.length ? `Add ${summary.missing.join(", ")} in Profile to estimate this.` : "Not calculated yet."}
          </p>
        ) : (
          <>
            <p className="text-3xl font-semibold">
              {run.burnNow.personal.toLocaleString()} <span className="text-base font-normal text-muted">kcal/day + exercise</span>
            </p>
            {calibration?.ok ? (
              <p className="text-sm text-muted">
                Measured from {calibration.days} days in {calibration.windows} week{calibration.windows === 1 ? "" : "s"} where you
                logged most of your food: the formula estimate ({run.burnNow.formula.toLocaleString()}) is{" "}
                {calibration.offset === 0
                  ? "about right"
                  : `${Math.abs(calibration.offset).toLocaleString()} kcal too ${calibration.offset > 0 ? "low" : "high"}`}
                {calibration.clamped && " (capped; check for missing or doubled logs)"}. Every estimate uses this corrected number.
              </p>
            ) : (
              <p className="text-sm text-muted">Formula estimate. {calibration?.reason}</p>
            )}
            {suggested != null && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-sm">
                  For your goal pace, aim for about <span className="font-semibold">{suggested.toLocaleString()} kcal/day</span>.
                </p>
                <ApplyTargetButton kcal={suggested} current={summary.profile.kcal_target_override} />
              </div>
            )}
            <p className="text-xs text-muted">
              Updated with the deficit &amp; surplus numbers ({updated.toLowerCase()}). You can switch back to the calculated target in
              Profile by clearing the override.
            </p>
          </>
        )}
      </section>

      <section className={`${card} space-y-3`}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Exercise</h2>
          <Link href="/exercise" className="text-sm text-accent">
            Log →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-xs text-muted">Workouts</p>
            <p className="text-xl font-semibold">{workouts.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Time</p>
            <p className="text-xl font-semibold">
              {Math.round(totalMinutes / 6) / 10}
              <span className="text-sm font-normal text-muted"> h</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Burned</p>
            <p className="text-xl font-semibold">
              {totalBurned.toLocaleString()}
              <span className="text-sm font-normal text-muted"> kcal</span>
            </p>
          </div>
        </div>
        {byActivity.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-normal">Activity</th>
                <th className="py-1 text-right font-normal">Sessions</th>
                <th className="py-1 text-right font-normal">Time</th>
                <th className="py-1 text-right font-normal">kcal</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {byActivity.map(([a, v]) => (
                <tr key={a} className="border-t border-border">
                  <td className="py-1.5">
                    {activityLabel(a)}
                    {a in ACTIVITIES && ACTIVITIES[a as keyof typeof ACTIVITIES].distance && v.mi > 0 && (
                      <span className="text-xs text-muted"> · {Math.round(v.mi * 10) / 10} mi</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">{v.n}</td>
                  <td className="py-1.5 text-right text-muted">{v.min} min</td>
                  <td className="py-1.5 text-right">{v.kcal.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="space-y-2 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">Lift progress</h3>
          <LiftProgress history={lifts} />
        </div>
        {prs.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-normal">Best in range</th>
                <th className="py-1 text-right font-normal">Top weight</th>
                <th className="py-1 text-right font-normal">Est. 1RM</th>
                <th className="py-1 text-right font-normal">Last</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {prs.map((p) => (
                <tr key={p.exercise} className="border-t border-border">
                  <td className="py-1.5">{p.exercise}</td>
                  <td className="py-1.5 text-right">{p.topWeight == null ? "BW" : `${p.topWeight}`}</td>
                  <td className="py-1.5 text-right">{p.bestE1rm == null ? "—" : Math.round(p.bestE1rm)}</td>
                  <td className="py-1.5 text-right text-muted">{formatDay(p.lastDay, { month: "short", day: "numeric" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={`${card} space-y-3`}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Mood</h2>
          <Link href="/mood" className="text-sm text-accent">
            Check in →
          </Link>
        </div>
        {moodDays.length === 0 ? (
          <p className="text-sm text-muted">No mood check-ins in this range yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-muted">Average mood</p>
                <p className="text-xl font-semibold">
                  {avgMood} <span className="text-sm font-normal text-muted">{MOOD_LABELS[Math.round(avgMood!)]}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Average sleep</p>
                <p className="text-xl font-semibold">{avgSleep == null ? "—" : `${avgSleep}h`}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Days checked in</p>
                <p className="text-xl font-semibold">
                  {moodDays.length}
                  <span className="text-sm font-normal text-muted">/{days.length}</span>
                </p>
              </div>
            </div>
            <MoodHeatmap days={moodDays} today={today} weeks={Math.ceil(span / 7)} />

            {splits.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <h3 className="text-sm font-semibold">What goes with a better mood</h3>
                {splits.map((sp) => (
                  <SplitRow key={sp.label} split={sp} />
                ))}
              </div>
            )}
            {tags.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 font-normal">Tag</th>
                    <th className="py-1 text-right font-normal">Days</th>
                    <th className="py-1 text-right font-normal">Avg mood</th>
                    <th className="py-1 text-right font-normal">vs usual</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {tags.map((t) => (
                    <tr key={t.tag} className="border-t border-border">
                      <td className="py-1.5">{t.tag}</td>
                      <td className="py-1.5 text-right text-muted">{t.days}</td>
                      <td className="py-1.5 text-right">{t.mood.toFixed(1)}</td>
                      <td className="py-1.5 text-right text-muted">
                        {t.diff > 0 ? "+" : ""}
                        {t.diff.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {splits.length === 0 && tags.length === 0 && (
              <p className="text-xs text-muted">
                Insights appear after a few days of check-ins with sleep and tags (at least 3 days on each side of a comparison).
              </p>
            )}
            <p className="text-xs text-muted">These are patterns in your own logs, not proof of cause and effect.</p>
          </>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-2 font-semibold">Weekly summary</h2>
        {weeklyRows.length === 0 && <p className="text-sm text-muted">No data in this range yet.</p>}
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 font-normal">Week of</th>
              <th className="py-1 text-right font-normal">Avg kcal</th>
              <th className="py-1 text-right font-normal">Logged</th>
              <th className="py-1 text-right font-normal">Balance</th>
              <th className="py-1 text-right font-normal">Trend</th>
              <th className="py-1 text-right font-normal">Δ</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {weeklyRows.map((w) => {
              const b = intakeWeeks.get(w.weekStart);
              const est = (b?.estimatedDays ?? 0) + (b?.partialDays ?? 0) > 0 ? "≈" : "";
              return (
              <tr key={w.weekStart} className="border-t border-border">
                <td className="py-2">{formatDay(w.weekStart, { month: "short", day: "numeric" })}</td>
                <td className="py-2 text-right">{b?.avgIntake == null ? "—" : `${est}${b.avgIntake.toLocaleString()}`}</td>
                <td className="py-2 text-right text-muted">{w.loggedDays}/{w.days}</td>
                <td className="py-2 text-right">
                  {b?.avgBalance == null ? "—" : `${est}${b.avgBalance > 0 ? "+" : ""}${b.avgBalance.toLocaleString()}`}
                </td>
                <td className="py-2 text-right">{w.trendEnd?.toFixed(1) ?? "—"}</td>
                <td className="py-2 text-right text-muted">
                  {w.trendChange == null ? "—" : `${w.trendChange > 0 ? "+" : ""}${w.trendChange.toFixed(1)}`}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {weeklyRows.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Avg kcal covers logged and estimated days. ≈ means the week includes days estimated from weight. Balance is kcal/day
            (− deficit, + surplus).
          </p>
        )}
      </section>
    </div>
  );
}

function BalanceSection({
  bal,
  bars,
  trend,
  start,
  end,
  weekly,
  hasProfile,
  run,
  previous,
  updated,
  error,
}: {
  bal: ReturnType<typeof summarizeBalance>;
  bars: BalanceBar[];
  trend: { day: string; trend: number | null; weighedIn: boolean }[];
  start: string;
  end: string;
  weekly: boolean;
  hasProfile: boolean;
  run: RunRecord | null;
  previous: RunRecord | null;
  updated: string;
  error?: string;
}) {
  const est = bal.estimatedDays + bal.partialDays > 0 ? "≈" : "";
  const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const split = (x: { logged: number; partial: number; estimated: number }) =>
    [x.logged && `${x.logged} logged`, x.partial && `${x.partial} partial`, x.estimated && `${x.estimated} est.`]
      .filter(Boolean)
      .join(", ") || "none";
  const totals = run?.result.totals ?? null;
  const changes = run && previous ? runChanges(run, previous) : [];
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">Deficit &amp; surplus {weekly && <span className="text-sm font-normal text-muted">(weekly average)</span>}</h2>
        {hasProfile && <RecalculateButton />}
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 px-3 py-2 text-xs text-danger">
          Couldn&apos;t update these numbers: {error}
        </p>
      )}
      {hasProfile && (
        <p className="-mt-2 text-xs text-muted">
          {updated}
          {changes.length > 0 && (
            <>
              {" "}
              · since {previous!.last_day < run!.last_day ? formatDay(addDays(previous!.last_day, 1), { month: "short", day: "numeric" }) : "last run"}:{" "}
              {changes.join(", ")}
            </>
          )}
        </p>
      )}
      {!hasProfile ? (
        <p className="text-sm text-muted">
          Add your sex, birth date and height in{" "}
          <Link href="/profile" className="text-accent">
            Profile
          </Link>{" "}
          to estimate how much you burn.
        </p>
      ) : (
        <>
          {bal.avgBalance != null ? (
            <p>
              <span className="text-3xl font-semibold">
                {est}
                {Math.abs(bal.avgBalance).toLocaleString()}
              </span>{" "}
              <span className="text-muted">
                kcal/day {bal.avgBalance < 0 ? "deficit" : "surplus"} · {est}
                {Math.abs(bal.lbPerWeek!).toFixed(1)} lb/week {bal.avgBalance < 0 ? "loss" : "gain"}
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted">Log food or weigh in at least weekly to see your balance.</p>
          )}

          <Coverage bal={bal} />

          {totals && (
            <div className="rounded-xl bg-background px-3 py-2 text-sm">
              <p className="text-xs text-muted">Running total since {formatDay(totals.since, { month: "short", day: "numeric", year: "numeric" })}</p>
              <p>
                <span className="font-semibold">
                  {est}
                  {totals.cumulativeKcal > 0 ? "+" : totals.cumulativeKcal < 0 ? "−" : ""}
                  {Math.abs(totals.cumulativeKcal).toLocaleString()} kcal
                </span>{" "}
                <span className="text-muted">
                  ≈ {totals.predictedLb > 0 ? "+" : ""}
                  {totals.predictedLb} lb predicted · trend {totals.actualLb > 0 ? "+" : ""}
                  {totals.actualLb} lb actual
                </span>
              </p>
            </div>
          )}

          {bal.avgBalance != null && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-background px-3 py-2">
                <p className="text-xs text-muted">Deficit days</p>
                <p className="font-semibold">{bal.deficit.logged + bal.deficit.estimated}</p>
                <p className="text-xs text-muted">{split(bal.deficit)}</p>
              </div>
              <div className="rounded-xl bg-background px-3 py-2">
                <p className="text-xs text-muted">Surplus days</p>
                <p className="font-semibold">{bal.surplus.logged + bal.surplus.estimated}</p>
                <p className="text-xs text-muted">{split(bal.surplus)}</p>
              </div>
            </div>
          )}

          {trend.some((t) => t.trend != null) && <BalanceChart bars={bars} trend={trend} start={start} end={end} />}

          <p className="text-xs text-muted">
            On days you didn&apos;t log, intake is estimated from your weight trend: what you burned (your burn + logged
            exercise) plus the change in stored energy (3,500 kcal per lb), minus what you did log, spread evenly over the
            unlogged days between weigh-ins (usually a week or more apart). Days with under 40% of your burn logged count as
            partly logged: what you logged is kept and the rest is estimated.{" "}
            {bal.unknownDays > 0 && `${plural(bal.unknownDays)} can't be estimated yet (before your first weigh-in, or since your last full week of weigh-ins).`}{" "}
            Through yesterday. Reruns by itself after you save anything.
          </p>
        </>
      )}
    </section>
  );
}

/** One bar showing how many days are logged, estimated or unknown. */
function Coverage({ bal }: { bal: ReturnType<typeof summarizeBalance> }) {
  const parts = [
    { n: bal.loggedDays, label: "logged", bg: "var(--series-trend)" },
    {
      n: bal.estimatedDays,
      label: "estimated",
      bg: "repeating-linear-gradient(-45deg, var(--series-trend) 0 2px, color-mix(in srgb, var(--series-trend) 28%, transparent) 2px 5px)",
    },
    { n: bal.unknownDays, label: "unknown", bg: "var(--grid)" },
  ].filter((pt) => pt.n > 0);
  // Partial days sit between logged and estimated: a lighter solid.
  if (bal.partialDays)
    parts.splice(1, 0, {
      n: bal.partialDays,
      label: "partial",
      bg: "linear-gradient(to right, var(--series-trend) 0 50%, color-mix(in srgb, var(--series-trend) 28%, transparent) 50%)",
    });
  return (
    <div className="space-y-1">
      <div className="flex h-2.5 gap-0.5" aria-hidden>
        {parts.map((pt) => (
          <div key={pt.label} className="rounded-[2px]" style={{ flexGrow: pt.n, background: pt.bg }} />
        ))}
      </div>
      <p className="flex flex-wrap gap-x-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <SolidSwatch color="var(--series-trend)" />
          {bal.loggedDays} logged
        </span>
        {bal.partialDays > 0 && (
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden className="shrink-0">
              <rect width="10" height="10" rx="2" fill="var(--series-trend)" fillOpacity="0.28" />
              <rect width="5" height="10" fill="var(--series-trend)" />
            </svg>
            {bal.partialDays} partly logged
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <HatchSwatch id="coverage-legend" color="var(--series-trend)" />
          {bal.estimatedDays} estimated
        </span>
        {bal.unknownDays > 0 && (
          <span className="flex items-center gap-1.5">
            <SolidSwatch color="var(--grid)" />
            {bal.unknownDays} unknown
          </span>
        )}
        <span>
          of {bal.days} days
          {bal.loggedKcalShare != null && bal.estimatedDays + bal.partialDays > 0 && ` · ${Math.round(bal.loggedKcalShare * 100)}% of calories logged`}
        </span>
      </p>
    </div>
  );
}

/** A day with no stored model row: just what was logged, if anything. */
function emptyDay(day: string, logged: number | undefined): BalanceDay {
  return {
    day,
    intake: logged ?? null,
    logged: logged ?? null,
    source: logged != null ? "logged" : null,
    confidence: null,
    burn: null,
    exercise: 0,
    balance: null,
    cumulative: null,
    trend: null,
    window: null,
  };
}

function sourceCounts(d: BalanceDay) {
  return {
    logged: d.source === "logged" ? 1 : 0,
    partial: d.source === "partial" ? 1 : 0,
    estimated: d.source === "estimated" ? 1 : 0,
  };
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
function timeAgo(iso: string, now: string) {
  const min = Math.max(0, Math.round((Date.parse(now) - Date.parse(iso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

/** What moved between two runs, in plain words (only changes worth mentioning). */
function runChanges(run: RunRecord, prev: RunRecord): string[] {
  const out: string[] = [];
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString()}`;
  const a = run.result;
  const b = prev.result;
  if (a.burnNow && b.burnNow && Math.abs(a.burnNow.personal - b.burnNow.personal) >= 10)
    out.push(`burn ${b.burnNow.personal.toLocaleString()} → ${a.burnNow.personal.toLocaleString()}`);
  if (a.recent.avgBalance != null && b.recent.avgBalance != null && Math.abs(a.recent.avgBalance - b.recent.avgBalance) >= 10)
    out.push(`28-day balance ${signed(b.recent.avgBalance)} → ${signed(a.recent.avgBalance)}`);
  const newLogged = a.allTime.loggedDays + a.allTime.partialDays - (b.allTime.loggedDays + b.allTime.partialDays);
  if (newLogged > 0) out.push(`${newLogged} more logged day${newLogged === 1 ? "" : "s"}`);
  return out;
}

function SplitRow({ split }: { split: Split }) {
  const diff = Math.round((split.a.mood - split.b.mood) * 10) / 10;
  return (
    <div className="text-sm">
      <div className="grid grid-cols-2 gap-2">
        {[split.a, split.b].map((g) => (
          <div key={g.name} className="rounded-xl bg-background px-3 py-2">
            <p className="text-xs text-muted">{g.name}</p>
            <p>
              <span className="font-semibold">{g.mood.toFixed(1)}</span>{" "}
              <span className="text-xs text-muted">
                avg · {g.days} day{g.days === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">
        {Math.abs(diff) < 0.3
          ? "About the same either way."
          : `Mood ${diff > 0 ? "higher" : "lower"} by ${Math.abs(diff).toFixed(1)} on "${split.a.name.toLowerCase()}" days.`}
      </p>
    </div>
  );
}

function Tile({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className={card}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold">
        {value}
        {unit && <span className="text-sm font-normal text-muted"> {unit}</span>}
      </p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
