import Link from "next/link";
import { getSessions, getTemplates } from "@/lib/exercise-data";
import { todayLocal } from "@/lib/today";
import { addDays, formatDay } from "@/lib/dates";
import { activityLabel } from "@/lib/exercise";
import { button, buttonGhost, card } from "@/components/ui";
import { SessionCard } from "./session-card";

export default async function ExercisePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const [{ saved }, today] = await Promise.all([searchParams, todayLocal()]);
  const [sessions, templates] = await Promise.all([getSessions(addDays(today, -29), today), getTemplates()]);

  const weekStart = addDays(today, -6);
  const week = sessions.filter((s) => s.performed_on >= weekStart);
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) byDay.set(s.performed_on, [...(byDay.get(s.performed_on) ?? []), s]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Exercise</h1>
        <Link href="/exercise/templates" className="text-sm text-accent">
          Templates
        </Link>
      </header>

      {saved && <p className="rounded-xl bg-accent/15 px-3 py-2 text-sm">Workout saved.</p>}

      <section className={`${card} space-y-3`}>
        <Link href="/exercise/new" className={`${button} block text-center`}>
          + Log a workout
        </Link>
        {templates.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-muted">Start from a template</p>
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <Link key={t.id} href={`/exercise/new?template=${t.id}`} className="rounded-full border border-border px-3 py-1 text-sm">
                  {t.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className={`${card} grid grid-cols-3 gap-2`}>
        <Stat label="Last 7 days" value={`${week.length}`} unit={week.length === 1 ? "workout" : "workouts"} />
        <Stat label="Time" value={`${week.reduce((a, s) => a + (s.duration_min ?? 0), 0)}`} unit="min" />
        <Stat label="Burned" value={week.reduce((a, s) => a + (s.kcal_burned ?? 0), 0).toLocaleString()} unit="kcal" />
      </section>

      <section className={card}>
        <h2 className="mb-1 font-semibold">Last 30 days</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">No workouts logged yet.</p>
        ) : (
          [...byDay.entries()].map(([day, list]) => (
            <div key={day} className="border-t border-border pt-2 first:border-t-0">
              <p className="text-xs text-muted">
                {day === today ? "Today" : formatDay(day)} · {list.map((s) => activityLabel(s.activity)).join(", ")}
              </p>
              <div className="divide-y divide-border">
                {list.map((s) => (
                  <SessionCard key={s.id} s={s} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <p className="px-1 text-xs text-muted">
        Calories burned are added to your daily budget. To avoid counting workouts twice, set Activity level in Profile to
        how active you are <em>outside</em> of logged workouts (usually Sedentary or Light).
      </p>
      <Link href="/exercise/templates/new" className={`${buttonGhost} block text-center text-sm`}>
        Create a template
      </Link>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold">
        {value} <span className="text-xs font-normal text-muted">{unit}</span>
      </p>
    </div>
  );
}
