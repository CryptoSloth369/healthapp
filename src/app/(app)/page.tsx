import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfileSummary } from "@/lib/profile";
import { getWeightHistory } from "@/lib/weight";
import { getDayEntries } from "@/lib/food";
import { getMoodEntries } from "@/lib/mood-data";
import { getSessions } from "@/lib/exercise-data";
import { activityLabel } from "@/lib/exercise";
import { QuickMood } from "@/components/quick-mood";
import { sumNutrients } from "@/lib/nutrition";
import { CalorieSummary } from "@/components/calorie-summary";
import { todayLocal } from "@/lib/today";
import { formatDay } from "@/lib/dates";
import { QuickWeighIn } from "@/components/quick-weigh-in";
import { button, card } from "@/components/ui";

export default async function TodayPage() {
  const today = await todayLocal();
  const [summary, history, entries, moods, workouts] = await Promise.all([
    getProfileSummary(),
    getWeightHistory(),
    getDayEntries(today),
    getMoodEntries(today, today),
    getSessions(today, today),
  ]);
  if (!summary) redirect("/login");
  const { profile, missing } = summary;
  const todayEntry = history.entries.find((e) => e.measured_on === today);
  const latest = history.points.at(-1);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted">{formatDay(today, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="text-2xl font-bold">{profile.display_name ? `Hi, ${profile.display_name}` : "Today"}</h1>
        </div>
        <div className="flex gap-2">
        <Link href="/coach" className="flex items-center gap-1.5 rounded-full border border-accent/60 px-3 py-1.5 text-sm font-medium text-accent" aria-label="AI coach">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3zM19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8L19 15z" />
          </svg>
          Coach
        </Link>
        <Link href="/profile" className="rounded-full border border-border p-2 text-muted" aria-label="Profile and settings">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0" />
          </svg>
        </Link>
        </div>
      </header>

      <QuickWeighIn
        today={today}
        todayWeight={todayEntry ? Number(todayEntry.weight_lb) : null}
        trend={latest?.trend ?? null}
        rate={history.rateLbPerWeek}
      />

      <CalorieSummary
        totals={sumNutrients(entries)}
        daily={summary.daily}
        burned={workouts.reduce((a, w) => a + (w.kcal_burned ?? 0), 0)}
        maintenance={summary.target?.tdee ?? null}
        compact
      >
        <div className="flex items-center justify-between pt-1 text-sm">
          <span className="text-muted">
            {entries.length === 0 ? "Nothing logged yet" : `${entries.length} item${entries.length === 1 ? "" : "s"} logged`}
          </span>
          <span className="flex gap-4">
            <Link href="/food" className="text-muted">
              View day
            </Link>
            <Link href="/food/add" className="font-medium text-accent">
              + Log food
            </Link>
          </span>
        </div>
      </CalorieSummary>

      <section className={`${card} space-y-2`}>
        <div className="flex items-baseline justify-between">
          <p className="font-semibold">Exercise</p>
          <Link href="/exercise/new" className="text-sm font-medium text-accent">
            + Log workout
          </Link>
        </div>
        {workouts.length === 0 ? (
          <p className="text-sm text-muted">Nothing logged today.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {workouts.map((w) => (
              <li key={w.id}>
                <Link href={`/exercise/${w.id}`} className="flex justify-between gap-3">
                  <span>
                    {activityLabel(w.activity)}
                    {w.duration_min != null && <span className="text-muted"> · {w.duration_min} min</span>}
                    {w.distance_mi != null && <span className="text-muted"> · {w.distance_mi} mi</span>}
                  </span>
                  {w.kcal_burned != null && <span className="tabular-nums text-muted">{w.kcal_burned} kcal</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <QuickMood today={today} latest={moods[0] ? { mood: moods[0].mood, at: moods[0].logged_at } : null} />

      {missing.length > 0 && (
        <section className={`${card} space-y-3`}>
          <p className="font-semibold">Finish setting up your profile</p>
          <p className="text-sm text-muted">
            Missing: {missing.join(", ")}. These are needed to calculate your calorie target.
          </p>
          <Link href="/profile" className={`${button} inline-block`}>
            Set up profile
          </Link>
        </section>
      )}

    </div>
  );
}
