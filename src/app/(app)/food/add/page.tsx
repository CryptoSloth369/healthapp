import Link from "next/link";
import { getQuickPicks } from "@/lib/food";
import { todayLocal } from "@/lib/today";
import { formatDay, isDay } from "@/lib/dates";
import { isMeal, MEAL_LABELS } from "@/lib/nutrition";
import { AddFood } from "./add-food";

export default async function AddFoodPage({
  searchParams,
}: {
  searchParams: Promise<{ meal?: string; day?: string }>;
}) {
  const [params, today, picks] = await Promise.all([searchParams, todayLocal(), getQuickPicks()]);
  const day = isDay(params.day) && params.day <= today ? params.day : today;
  // No meal given (e.g. from Today): the client picks one from the time of day.
  const meal = isMeal(params.meal) ? params.meal : null;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Add food</h1>
          <p className="text-sm text-muted">
            {meal ? MEAL_LABELS[meal] + " · " : ""}
            {day === today ? "Today" : formatDay(day)}
          </p>
        </div>
        <Link href={`/food?day=${day}`} className="text-sm text-muted">
          Cancel
        </Link>
      </header>
      <Link
        href={`/food/photo?day=${day}${meal ? `&meal=${meal}` : ""}`}
        className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-surface p-4"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <path d="M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <span>
          <span className="block font-semibold">Estimate from a photo</span>
          <span className="block text-sm text-muted">Snap your meal, then review the AI estimate</span>
        </span>
      </Link>
      <AddFood day={day} meal={meal} picks={picks} />
    </div>
  );
}
