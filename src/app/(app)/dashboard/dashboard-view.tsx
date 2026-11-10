import Link from "next/link";
import type { ProfileSummary } from "@/lib/profile";
import type { WeightHistory } from "@/lib/weight";
import { addDays, formatDay } from "@/lib/dates";
import { adaptiveTdee, adherence, averages, dailyTotals, trendOn, weeklySummary } from "@/lib/analytics";
import { MIN_KCAL } from "@/lib/tdee";
import { CalorieChart, type CalorieBar } from "@/components/calorie-chart";
import { WeightChart } from "@/components/weight-chart";
import { Meter } from "@/components/meter";
import { card } from "@/components/ui";
import { ApplyTargetButton } from "./apply-target";
import { MoodHeatmap } from "@/components/mood-heatmap";
import { LiftProgress } from "@/components/lift-progress";
import { ACTIVITIES, activityLabel, liftHistory, personalRecords } from "@/lib/exercise";
import type { ExerciseSession } from "@/lib/types";
import { calorieSplit, dailyMood, exerciseSplit, MOOD_LABELS, sleepSplit, tagStats, type MoodRow, type Split } from "@/lib/mood";

export const RANGES = { "4w": { days: 28, label: "4W" }, "12w": { days: 84, label: "12W" }, "6m": { days: 182, label: "6M" } } as const;
export type RangeKey = keyof typeof RANGES;
export const ADAPTIVE_WINDOW = 28;

/** Pure rendering from loaded data (also used for previews). */
export function DashboardView({
  range,
  today,
  summary,
  history,
  entries,
  moods,
  workouts,
}: {
  range: RangeKey;
  today: string;
  summary: ProfileSummary;
  history: WeightHistory;
  entries: { eaten_on: string; kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null }[];
  moods: MoodRow[];
  workouts: ExerciseSession[];
}) {
  const span = RANGES[range].days;
  const start = addDays(today, -(span - 1));
  const yesterday = addDays(today, -1);
  const adaptiveStart = addDays(yesterday, -(ADAPTIVE_WINDOW - 1));
  const fetchStart = adaptiveStart < start ? adaptiveStart : start;

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

  // Bars: daily for ≤ 12 weeks, weekly averages for 6 months.
  const weekly = weeklySummary(days, points);
  const weeklyRows = weekly.filter((w) => w.loggedDays > 0 || w.trendEnd != null);
  const bars: CalorieBar[] =
    span <= 84
      ? days.map((d) => ({ day: d.day, kcal: d.logged ? d.kcal : null }))
      : [...weekly].reverse().map((w) => ({
          day: w.weekStart,
          kcal: w.avgKcal,
          label: `Week of ${formatDay(w.weekStart, { month: "short", day: "numeric" })}`,
        }));

  // Exercise over the range.
  const burnedByDay = new Map<string, number>();
  for (const w of workouts) burnedByDay.set(w.performed_on, (burnedByDay.get(w.performed_on) ?? 0) + (w.kcal_burned ?? 0));
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
  // Average daily balance on days with food logged (excluding today): maintenance + exercise − eaten.
  const maintenance = summary.target?.tdee ?? null;
  const balanceDays = days.filter((d) => d.logged && d.day !== today);
  const avgBalance =
    maintenance != null && balanceDays.length
      ? Math.round(balanceDays.reduce((a, d) => a + maintenance + (burnedByDay.get(d.day) ?? 0) - d.kcal, 0) / balanceDays.length)
      : null;

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

  // Adaptive TDEE over the last 4 weeks, excluding today (still in progress).
  const adaptive = adaptiveTdee(dailyTotals(entries, adaptiveStart, yesterday), points);
  const formulaTarget = summary.target;
  const suggested =
    adaptive.ok && formulaTarget && summary.profile.sex
      ? Math.max(MIN_KCAL[summary.profile.sex], Math.round((adaptive.tdee + formulaTarget.dailyAdjustment) / 10) * 10)
      : null;

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
        <Tile
          label="Avg intake"
          value={avg ? `${avg.kcal.toLocaleString()}` : "—"}
          unit={avg ? "kcal/day" : undefined}
          sub={avg && target ? `${avg.kcal > target ? "+" : ""}${(avg.kcal - target).toLocaleString()} vs target` : "No food logged"}
        />
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
          {target != null && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <svg width="14" height="8" aria-hidden>
                <path d="M1 4h12" stroke="var(--foreground)" strokeOpacity="0.6" strokeWidth="1" />
              </svg>
              Target {target.toLocaleString()}
            </span>
          )}
        </div>
        {days.some((d) => d.logged) ? (
          <CalorieChart bars={bars} target={target} unit={span > 84 ? "week" : "day"} />
        ) : (
          <p className="py-8 text-center text-sm text-muted">No food logged in this range yet.</p>
        )}
      </section>

      <section className={`${card} space-y-2`}>
        <h2 className="font-semibold">Weight</h2>
        <WeightChart points={points} goalLb={goal} rangeDays={span} />
      </section>

      {avg && summary.daily && (
        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold">Average macros</h2>
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
        <h2 className="font-semibold">Your actual burn (adaptive TDEE)</h2>
        {adaptive.ok ? (
          <>
            <p className="text-3xl font-semibold">
              {adaptive.tdee.toLocaleString()} <span className="text-base font-normal text-muted">kcal/day</span>
            </p>
            <p className="text-sm text-muted">
              Last {adaptive.spanDays} days: you averaged {adaptive.avgIntake.toLocaleString()} kcal and your trend moved{" "}
              {adaptive.trendChangeLb > 0 ? "+" : ""}
              {adaptive.trendChangeLb} lb ({adaptive.lbPerWeek > 0 ? "+" : ""}
              {adaptive.lbPerWeek} lb/week).
              {formulaTarget && <> The formula estimate is {formulaTarget.tdee.toLocaleString()}.</>}
            </p>
            {suggested != null && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-sm">
                  For your goal pace, aim for about <span className="font-semibold">{suggested.toLocaleString()} kcal/day</span>.
                </p>
                <ApplyTargetButton kcal={suggested} current={summary.profile.kcal_target_override} />
              </div>
            )}
            <p className="text-xs text-muted">
              Most accurate when you log everything you eat. You can switch back to the calculated target in Profile by
              clearing the override.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">{adaptive.reason}</p>
            <p className="text-xs text-muted">
              After about 2–4 weeks of logging food and weighing in, this estimates how many calories you really burn
              from your intake and weight trend, which is usually more accurate than the formula.
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
        {avgBalance != null && (
          <p className="rounded-xl bg-background px-3 py-2 text-sm">
            Average daily {avgBalance >= 0 ? "deficit" : "surplus"}:{" "}
            <span className="font-semibold">{Math.abs(avgBalance).toLocaleString()} kcal</span>
            <span className="block text-xs text-muted">
              Maintenance estimate + exercise − food, on {balanceDays.length} logged day{balanceDays.length === 1 ? "" : "s"} (≈{" "}
              {Math.abs(Math.round(((avgBalance * 7) / 3500) * 10) / 10)} lb/week {avgBalance >= 0 ? "loss" : "gain"}).
            </span>
          </p>
        )}
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
              <th className="py-1 text-right font-normal">Trend</th>
              <th className="py-1 text-right font-normal">Δ</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {weeklyRows.map((w) => (
              <tr key={w.weekStart} className="border-t border-border">
                <td className="py-2">{formatDay(w.weekStart, { month: "short", day: "numeric" })}</td>
                <td className="py-2 text-right">{w.avgKcal?.toLocaleString() ?? "—"}</td>
                <td className="py-2 text-right text-muted">{w.loggedDays}/{w.days}</td>
                <td className="py-2 text-right">{w.trendEnd?.toFixed(1) ?? "—"}</td>
                <td className="py-2 text-right text-muted">
                  {w.trendChange == null ? "—" : `${w.trendChange > 0 ? "+" : ""}${w.trendChange.toFixed(1)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
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
