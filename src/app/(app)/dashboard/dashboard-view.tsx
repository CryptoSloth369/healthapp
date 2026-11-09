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
}: {
  range: RangeKey;
  today: string;
  summary: ProfileSummary;
  history: WeightHistory;
  entries: { eaten_on: string; kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null }[];
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
